import { scenarioTest } from "@test-harness/adapter-vitest";
import { chromium } from "playwright";
import { afterAll, beforeAll, beforeEach, describe, expect } from "vitest";

const clientUrl = process.env.TODO_CLIENT_URL;
const apiRoot = process.env.TODO_BACKEND_URL;
const implementationPromiseId = process.env.TODO_BACKEND_IMPLEMENTATION_PROMISE_ID;

const jsonHeaders = {
  "Content-Type": "application/json",
};

const readTodos = async () => {
  const response = await fetch(apiRoot);
  expect(response.ok).toBe(true);
  return await response.json();
};

const resetTodos = async () => {
  const response = await fetch(apiRoot, { method: "DELETE" });
  expect(response.ok).toBe(true);
};

const waitForTodos = async (predicate) => {
  const deadline = Date.now() + 5_000;
  let latest = [];

  while (Date.now() < deadline) {
    latest = await readTodos();
    if (predicate(latest)) return latest;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Timed out waiting for backend todos: ${JSON.stringify(latest)}`);
};

if (!clientUrl || !apiRoot) {
  describe.skip("TodoMVC browser E2E", () => undefined);
} else {
  describe("TodoMVC browser E2E", () => {
    let browser;

    beforeAll(async () => {
      browser = await chromium.launch();
    });

    beforeEach(async () => {
      await resetTodos();
    });

    afterAll(async () => {
      await closeBrowser(browser);
    });

    scenarioTest(
      "todo_backend.client.uses_real_backend_api",
      "TodoMVC browser actions persist through the configured backend API",
      async () => {
        await runTodoMvcWorkflow(browser, "browser creates a real todo");
      },
    );

    scenarioTest(
      "todo_backend.api.cors_allows_todomvc_client",
      "TodoMVC browser actions can cross from the Vite origin to the backend origin",
      async () => {
        await runTodoMvcWorkflow(browser, "browser proves cors");
      },
    );

    if (implementationPromiseId) {
      scenarioTest(
        implementationPromiseId,
        "TodoMVC client works with the configured backend implementation",
        async () => {
          await runTodoMvcWorkflow(browser, "browser proves implementation");
        },
      );
    }
  });
}

const runTodoMvcWorkflow = async (browser, title) => {
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(5_000);
  page.setDefaultTimeout(5_000);

  try {
    await page.goto(clientUrl, { waitUntil: "domcontentloaded" });
    await page.getByLabel("New Todo Input").fill(title);
    await page.getByLabel("New Todo Input").press("Enter");

    const item = page.getByTestId("todo-item").filter({ hasText: title });
    await item.waitFor({ state: "visible" });
    await waitForTodos(
      (todos) => todos.length === 1 && todos[0]?.title === title && todos[0]?.completed === false,
    );

    await item.getByTestId("todo-item-toggle").click();
    await waitForTodos(
      (todos) => todos.length === 1 && todos[0]?.title === title && todos[0]?.completed === true,
    );

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByTestId("todo-item").filter({ hasText: title }).waitFor({ state: "visible" });

    const [todo] = await readTodos();
    const patched = await fetch(todo.url, {
      body: JSON.stringify({ title: `${title} edited` }),
      headers: jsonHeaders,
      method: "PATCH",
    });
    expect(patched.ok).toBe(true);

    await page.reload({ waitUntil: "domcontentloaded" });
    await page
      .getByTestId("todo-item")
      .filter({ hasText: `${title} edited` })
      .waitFor({ state: "visible" });

    await page.getByRole("button", { name: "Clear completed" }).click();
    await waitForTodos((todos) => todos.length === 0);
  } finally {
    await closePage(page);
  }
};

const closePage = async (page) => {
  await Promise.race([
    page.close().catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);
};

const closeBrowser = async (browser) => {
  if (!browser) return;
  const process = typeof browser.process === "function" ? browser.process() : undefined;
  await Promise.race([
    browser.close().catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);
  if (process && process.exitCode === null) {
    process.kill("SIGKILL");
  }
};
