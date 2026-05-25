import { scenarioTest } from "@test-harness/adapter-vitest";
import { describe, expect } from "vitest";

import { createTodoBackendApp } from "../src/app.ts";

const promiseId = "todo_backend.typescript_hono.native_tests_are_promise_bound";

if (process.env.TODO_BACKEND_NATIVE_TESTS !== "1") {
  describe.skip("TypeScript Hono Todo-Backend", () => undefined);
} else {
  describe("TypeScript Hono Todo-Backend", () => {
    scenarioTest(
      promiseId,
      "native tests bind Hono behavior to Todo-Backend promises",
      async () => {
        const app = createTodoBackendApp();

        const createResponse = await app.request("http://example.test/todos", {
          body: JSON.stringify({ order: 7, title: "ship hono" }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        expect(createResponse.status).toBe(201);
        const created = await createResponse.json();
        expect(created).toEqual({
          completed: false,
          order: 7,
          title: "ship hono",
          url: "http://example.test/todos/1",
        });

        const patchResponse = await app.request(created.url, {
          body: JSON.stringify({ completed: true, order: 8, title: "ship hono cleanly" }),
          headers: { "Content-Type": "application/json" },
          method: "PATCH",
        });
        expect(patchResponse.status).toBe(200);
        await expect(patchResponse.json()).resolves.toMatchObject({
          completed: true,
          order: 8,
          title: "ship hono cleanly",
        });

        const listResponse = await app.request("http://example.test/todos");
        await expect(listResponse.json()).resolves.toEqual([
          {
            completed: true,
            order: 8,
            title: "ship hono cleanly",
            url: "http://example.test/todos/1",
          },
        ]);
      },
    );
  });
}
