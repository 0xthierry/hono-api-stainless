import { $, sleep } from "bun";

// Start the server
const server = Bun.spawn(["bun", "run", "src/server.ts"]);

// Wait for the server to start (adjust the delay if needed)
await sleep(2000);

try {
  // Fetch the OpenAPI JSON
  const openapi = await $`curl -s http://localhost:3000/docs`.text();
  await $`echo ${JSON.stringify(JSON.parse(openapi), null, 2)} > openapi.json`;
  console.log("OpenAPI JSON saved successfully");
} catch (error) {
  console.error("Failed to fetch OpenAPI JSON:", error);
} finally {
  // Stop the server
  server.kill();
}
