import { scenarioTest } from "@test-harness/adapter-vitest";
import { chromium } from "playwright";
import { afterAll, beforeAll, beforeEach, describe, expect } from "vitest";

const clientUrl = process.env.TODO_CLIENT_URL;
const apiRoot = process.env.TODO_BACKEND_URL;
const implementationLabel = process.env.TODO_BACKEND_IMPLEMENTATION_LABEL;
const isRequiredRun = process.env.TODO_BROWSER_E2E_REQUIRED === "1";

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

const caseName = (name) => (implementationLabel ? `${implementationLabel} > ${name}` : name);

const scenarioOptions = implementationLabel
  ? {
      meta: {
        implementation: implementationLabel,
      },
    }
  : {};

const scenario = (promiseId, name, fn) => {
  scenarioTest(promiseId, caseName(name), fn, scenarioOptions);
};

if (!clientUrl || !apiRoot) {
  if (isRequiredRun) {
    describe("TodoMVC browser E2E", () => {
      scenarioTest(
        "todo_backend.client.uses_real_backend_api",
        "browser runner requires a client URL and backend URL",
        () => {
          throw new Error(
            "TODO_CLIENT_URL and TODO_BACKEND_URL are required for TodoMVC browser E2E.",
          );
        },
      );
    });
  } else {
    describe.skip("TodoMVC browser E2E", () => undefined);
  }
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

    scenario(
      "todo_backend.client.uses_real_backend_api",
      "TodoMVC browser actions persist through the configured backend API",
      async () => {
        await runRealBackendWorkflow(browser, "browser creates a real todo");
      },
    );

    scenario(
      "todo_backend.api.cors_allows_todomvc_client",
      "backend CORS headers allow the TodoMVC browser origin",
      async () => {
        await assertCorsPreflight();
        await runCreateTodoWorkflow(browser, "browser proves cors");
      },
    );
  });
}

const assertCorsPreflight = async () => {
  const response = await fetch(apiRoot, {
    headers: {
      "Access-Control-Request-Headers": "Content-Type",
      "Access-Control-Request-Method": "PATCH",
      Origin: new URL(clientUrl).origin,
    },
    method: "OPTIONS",
  });
  expect(response.ok).toBe(true);

  const allowOrigin = response.headers.get("access-control-allow-origin");
  expect([new URL(clientUrl).origin, "*"]).toContain(allowOrigin);

  const allowMethods = response.headers.get("access-control-allow-methods")?.toLowerCase() ?? "";
  expect(allowMethods === "*" || allowMethods.includes("patch")).toBe(true);

  const allowHeaders = response.headers.get("access-control-allow-headers")?.toLowerCase() ?? "";
  expect(allowHeaders === "*" || allowHeaders.includes("content-type")).toBe(true);
};

const runCreateTodoWorkflow = async (browser, title) => {
  const page = await openTodoMvcPage(browser);

  try {
    await createTodoFromBrowser(page, title);
    await waitForTodos(
      (todos) => todos.length === 1 && todos[0]?.title === title && todos[0]?.completed === false,
    );
  } finally {
    await closePage(page);
  }
};

const runRealBackendWorkflow = async (browser, title) => {
  const page = await openTodoMvcPage(browser);

  try {
    const item = await createTodoFromBrowser(page, title);
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

const openTodoMvcPage = async (browser) => {
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(5_000);
  page.setDefaultTimeout(5_000);
  await page.goto(clientUrl, { waitUntil: "domcontentloaded" });
  return page;
};

const createTodoFromBrowser = async (page, title) => {
  await page.getByLabel("New Todo Input").fill(title);
  await page.getByLabel("New Todo Input").press("Enter");

  const item = page.getByTestId("todo-item").filter({ hasText: title });
  await item.waitFor({ state: "visible" });
  return item;
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
