import TodoHonoSDK from 'stainless-todo-hono-sdk';

const client = new TodoHonoSDK({
   baseURL: 'http://localhost:3000'
});

async function main() {
  const todo = await client.todos.create({ completed: true, title: 'REPLACE_ME' });


  const bunFile = Bun.file('./README.md');
  const buffer = await bunFile.arrayBuffer();
  const file = new File([buffer], 'readme.md', { type: 'text/markdown' });

  const uploaded = await client.todos.upload(todo.id, {
    file: file,
  });

  const stream = await client.todos.progress(todo.id) as unknown as ReadableStream;

  // the type of is a string
  console.log(typeof stream)

  // it doesn't work, we need to implement in the core.js to support stream
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    console.log(value);
  }
}

main();