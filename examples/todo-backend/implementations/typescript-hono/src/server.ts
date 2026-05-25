import { serve } from "@hono/node-server";

import { createTodoBackendApp } from "./app.ts";

const port = Number.parseInt(process.env.PORT ?? "3101", 10);
const hostname = process.env.HOST ?? "127.0.0.1";

serve({
  fetch: createTodoBackendApp().fetch,
  hostname,
  port,
});

console.log(`TypeScript Hono Todo-Backend listening at http://${hostname}:${port}/todos`);
