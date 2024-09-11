import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { streamSSE } from "hono/streaming";
import { randomUUID as uuidv4 } from "node:crypto";

export const app = new OpenAPIHono();

// In-memory storage
const todos = new Map();

// File storage configuration
const UPLOAD_DIR = "./.uploads";

// Zod schemas
const TodoSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  completed: z.boolean(),
  fileUrl: z.string().optional(),
});

const CreateTodoSchema = TodoSchema.omit({ id: true, fileUrl: true });
const UpdateTodoSchema = CreateTodoSchema.partial();

// Routes
app.openapi(
  createRoute({
    method: "get",
    path: "/todos",
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.array(TodoSchema),
          },
        },
        description: "Returns all todos",
      },
    },
    tags: ["Todos"],
  }),
  (c) => c.json(Array.from(todos.values()))
);

app.openapi(
  createRoute({
    method: "post",
    path: "/todos",
    request: {
      body: {
        content: {
          "application/json": {
            schema: CreateTodoSchema,
          },
        },
      },
    },
    responses: {
      201: {
        content: {
          "application/json": {
            schema: TodoSchema,
          },
        },
        description: "Creates a new todo",
      },
    },
    tags: ["Todos"],
  }),
  async (c) => {
    const body = await c.req.json();
    const id = uuidv4();
    const todo = { id, ...body };
    todos.set(id, todo);
    return c.json(todo, 201);
  }
);

app.openapi(
  createRoute({
    method: "get",
    path: "/todos/:id",
    responses: {
      200: {
        content: {
          "application/json": {
            schema: TodoSchema,
          },
        },
        description: "Returns a specific todo",
      },
      404: {
        description: "Todo not found",
      },
    },
    tags: ["Todos"],
  }),
  (c) => {
    const id = c.req.param("id");
    const todo = todos.get(id);
    if (!todo) {
      return c.json({ error: "Todo not found" }, 404);
    }
    return c.json(todo);
  }
);

app.openapi(
  createRoute({
    method: "put",
    path: "/todos/:id",
    request: {
      body: {
        content: {
          "application/json": {
            schema: UpdateTodoSchema,
          },
        },
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: TodoSchema,
          },
        },
        description: "Updates a todo",
      },
      404: {
        description: "Todo not found",
      },
    },
    tags: ["Todos"],
  }),
  async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json();
    const todo = todos.get(id);
    if (!todo) {
      return c.json({ error: "Todo not found" }, 404);
    }
    const updatedTodo = { ...todo, ...body };
    todos.set(id, updatedTodo);
    return c.json(updatedTodo);
  }
);

app.openapi(
  createRoute({
    method: "delete",
    path: "/todos/:id",
    responses: {
      204: {
        description: "Deletes a todo",
      },
      404: {
        description: "Todo not found",
      },
    },
    tags: ["Todos"],
  }),
  (c) => {
    const id = c.req.param("id");
    if (!todos.has(id)) {
      return c.json({ error: "Todo not found" }, 404);
    }
    todos.delete(id);
    return c.json(null, 204);
  }
);

// File upload route
app.openapi(
  createRoute({
    method: "post",
    path: "/todos/:id/upload",
    request: {
      body: {
        content: {
          "multipart/form-data": {
            schema: z.object({
              file: z.any(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: TodoSchema,
          },
        },
        description: "Uploads a file to a todo",
      },
      404: {
        description: "Todo not found",
      },
    },
    tags: ["Todos"],
  }),
  async (c) => {
    const id = c.req.param("id");
    const body = await c.req.parseBody();

    if (!body["file"]) {
      return c.json({ error: "No file uploaded" }, 400);
    }

    const todo = todos.get(id);
    if (!todo) {
      return c.json({ error: "Todo not found" }, 404);
    }

    const file = body["file"] as File;
    const fileName = `${id}-${Date.now()}-${file.name}`;
    const filePath = `${UPLOAD_DIR}/${fileName}`;

    try {
      await Bun.write(filePath, file);
      const updatedTodo = { ...todo, fileUrl: filePath };
      todos.set(id, updatedTodo);
      return c.json(updatedTodo);
    } catch (error) {
      console.error("File upload error:", error);
      return c.json({ error: "File upload failed" }, 500);
    }
  }
);

app.openapi(
  createRoute({
    method: "get",
    path: "/todos/:id/progress",
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        schema: {
          type: "string",
          format: "uuid"
        },
        description: "The ID of the todo"
      }
    ],
    responses: {
      200: {
        description: "Streams the upload progress using SSE",
        content: {
          "text/event-stream": {
            schema: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  format: "uuid"
                },
                progress: {
                  type: "number",
                  minimum: 0,
                  maximum: 100
                }
              },
              required: ["id", "progress"]
            }
          }
        }
      },
    },
    tags: ["Todos"]
  }),
  // @ts-ignore
  // https://github.com/honojs/middleware/issues/735
  // https://github.com/honojs/hono/issues/3309
  (c) => {
    const id = c.req.param("id");
    let messageId = 0;

    return streamSSE(
      c,
      async (stream) => {
        // Set up abort handling
        stream.onAbort(() => {
          console.log("SSE stream aborted");
        });

        try {
          // Simulate upload progress
          let progress = 0;
          while (progress < 100) {
            const message = JSON.stringify({ id, progress });
            await stream.writeSSE({
              data: message,
              event: "upload-progress",
              id: String(messageId++),
            });
            await stream.sleep(50);
            progress += Math.floor(Math.random() * 20) + 1; // Random progress between 1-20%
          }

          // Send completion message
          await stream.writeSSE({
            data: JSON.stringify({ id, progress: 100 }),
            event: "upload-complete",
            id: String(messageId++),
          });
        } catch (error) {
          console.error("SSE stream error:", error);
          await stream.writeSSE({
            data: JSON.stringify({ error: "Streaming error occurred" }),
            event: "error",
            id: String(messageId++),
          });
        }
      },
      async (err, stream) => {
        console.error("SSE error:", err);
        stream.writeSSE({
          data: JSON.stringify({ error: "Internal server error" }),
          event: "error",
          id: String(messageId++),
        });
      }
    );
  }
);

app.doc("/docs", {
  openapi: "3.0.0",
  info: {
    title: "Todo API",
    version: "1.0.0",
  },
});
