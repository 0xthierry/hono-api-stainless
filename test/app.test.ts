import { expect, test, describe } from "bun:test";
import { app } from '../src/index';

describe('Todo API Tests', () => {
  let todoId: string;

  test("GET /todos - should return all todos", async () => {
    const res = await app.request('/todos');
    expect(res.status).toBe(200);
    const todos = await res.json();
    expect(Array.isArray(todos)).toBe(true);
  });

  test("POST /todos - should create a new todo", async () => {
    const newTodo = {
      title: 'Test Todo',
      description: 'This is a test todo',
      completed: false
    };
    const res = await app.request('/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newTodo)
    });
    expect(res.status).toBe(201);
    const createdTodo = await res.json();
    todoId = createdTodo.id;
    expect(createdTodo).toHaveProperty('id');
    expect(createdTodo.title).toBe(newTodo.title);
    todoId = createdTodo.id;
  });

  test("GET /todos/:id - should return a specific todo", async () => {
    const res = await app.request(`/todos/${todoId}`);
    expect(res.status).toBe(200);
    const todo = await res.json();
    expect(todo).toHaveProperty('id', todoId);
  });

  test("PUT /todos/:id - should update a todo", async () => {
    const updatedTodo = {
      title: 'Updated Test Todo',
      completed: true
    };
    const res = await app.request(`/todos/${todoId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedTodo)
    });
    expect(res.status).toBe(200);
    const todo = await res.json();
    expect(todo.title).toBe(updatedTodo.title);
    expect(todo.completed).toBe(updatedTodo.completed);
  });

  test("POST /todos/:id/upload - should upload a file to a todo", async () => {
    const formData = new FormData();
    formData.append('file', new Blob(['test file content'], { type: 'text/plain' }), 'test.txt');
    
    const res = await app.request(`/todos/${todoId}/upload`, {
      method: 'POST',
      body: formData
    });
    expect(res.status).toBe(200);
    const updatedTodo = await res.json();
    expect(updatedTodo).toHaveProperty('fileUrl');
  });

  test("GET /todos/:id/progress - should stream upload progress", async () => {
    const res = await app.request(`/todos/${todoId}/progress`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    
    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let uploadComplete = false;

    while (!uploadComplete && reader) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      fullText += chunk;

      if (chunk.includes('event: upload-complete')) {
        uploadComplete = true;
      }
    }

    expect(fullText).toContain('event: upload-progress');
    expect(fullText).toContain('event: upload-complete');
    expect(fullText).toMatch(/progress":100/);

    const progressEvents = fullText.match(/event: upload-progress/g);
    expect(progressEvents?.length).toBeGreaterThan(1);

    const progressValues = fullText.match(/"progress":\d+/g);
    expect(progressValues?.length).toBeGreaterThan(1);
    
    const lastProgressValue = progressValues?.pop();
    expect(lastProgressValue).toBe('"progress":100');
  });

  test("DELETE /todos/:id - should delete a todo", async () => {
    const res = await app.request(`/todos/${todoId}`, {
      method: 'DELETE'
    });
    expect(res.status).toBe(204);
    
    // Verify the todo is deleted
    const checkRes = await app.request(`/todos/${todoId}`);
    expect(checkRes.status).toBe(404);
  });
});

describe('Error Handling', () => {
  test("GET /todos/nonexistent - should handle 404 error", async () => {
    const res = await app.request('/todos/nonexistent');
    expect(res.status).toBe(404);
  });

  test("POST /todos with invalid data - should handle 400 error", async () => {
    const invalidTodo = { title: '' };
    const res = await app.request('/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invalidTodo)
    });
    expect(res.status).toBe(400);
  });
});