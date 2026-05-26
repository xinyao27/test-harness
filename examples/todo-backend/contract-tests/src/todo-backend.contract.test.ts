import { scenarioTest } from "@test-harness/adapter-vitest";
import { beforeEach, describe, expect } from "vitest";

type Todo = {
  readonly completed: boolean;
  readonly order: number;
  readonly title: string;
  readonly url: string;
};

const configuredApiRoot = process.env.TODO_BACKEND_URL;
const apiRoot = configuredApiRoot ?? "http://127.0.0.1:3101/todos";
const implementationLabel = process.env.TODO_BACKEND_IMPLEMENTATION_LABEL;
const implementationPromiseId = process.env.TODO_BACKEND_IMPLEMENTATION_PROMISE_ID;

const jsonHeaders = {
  "Content-Type": "application/json",
};

const getJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url);
  expect(response.ok).toBe(true);
  return (await response.json()) as T;
};

const postTodo = async (body: Record<string, unknown>): Promise<Todo> => {
  const response = await fetch(apiRoot, {
    body: JSON.stringify(body),
    headers: jsonHeaders,
    method: "POST",
  });
  expect(response.ok).toBe(true);
  return (await response.json()) as Todo;
};

const patchTodo = async (url: string, body: Record<string, unknown>): Promise<Todo> => {
  const response = await fetch(url, {
    body: JSON.stringify(body),
    headers: jsonHeaders,
    method: "PATCH",
  });
  expect(response.ok).toBe(true);
  return (await response.json()) as Todo;
};

const deleteUrl = async (url: string): Promise<void> => {
  const response = await fetch(url, { method: "DELETE" });
  expect(response.ok).toBe(true);
};

const resetTodos = async (): Promise<void> => {
  await deleteUrl(apiRoot);
};

const caseName = (name: string): string =>
  implementationLabel ? `${implementationLabel} > ${name}` : name;

const scenarioOptions = implementationLabel
  ? {
      meta: {
        implementation: implementationLabel,
      },
    }
  : {};

const scenario = (
  promiseId: string,
  name: string,
  fn: Parameters<typeof scenarioTest>[2],
): void => {
  scenarioTest(promiseId, caseName(name), fn, scenarioOptions);
};

if (!configuredApiRoot) {
  describe.skip("Todo-Backend official contract", () => undefined);
} else {
  describe("Todo-Backend official contract", () => {
    beforeEach(async () => {
      await resetTodos();
    });

    scenario(
      "todo_backend.api.list_returns_current_collection",
      "official.prerequisite.root_get_succeeds",
      async () => {
        const response = await fetch(apiRoot);
        expect(response.ok).toBe(true);
      },
    );

    scenario(
      "todo_backend.api.create_returns_persisted_todo",
      "official.prerequisite.root_post_echoes_title",
      async () => {
        await expect(postTodo({ title: "a todo" })).resolves.toMatchObject({ title: "a todo" });
      },
    );

    scenario(
      "todo_backend.api.delete_all_clears_collection",
      "official.prerequisite.root_delete_succeeds",
      async () => {
        await postTodo({ title: "delete me" });
        await deleteUrl(apiRoot);
        await expect(getJson<Todo[]>(apiRoot)).resolves.toEqual([]);
      },
    );

    scenario(
      "todo_backend.api.delete_all_clears_collection",
      "official.prerequisite.root_delete_then_get_empty_array",
      async () => {
        await postTodo({ title: "delete all" });
        await deleteUrl(apiRoot);
        await expect(getJson<Todo[]>(apiRoot)).resolves.toEqual([]);
      },
    );

    scenario(
      "todo_backend.api.create_returns_persisted_todo",
      "official.create.adds_new_todo_to_root_list",
      async () => {
        await postTodo({ title: "walk the dog" });
        await expect(getJson<Todo[]>(apiRoot)).resolves.toMatchObject([{ title: "walk the dog" }]);
      },
    );

    scenario(
      "todo_backend.api.create_returns_persisted_todo",
      "official.create.new_todo_initially_not_completed",
      async () => {
        const created = await postTodo({ title: "blah" });
        expect(created.completed).toBe(false);
        await expect(getJson<Todo[]>(apiRoot)).resolves.toMatchObject([{ completed: false }]);
      },
    );

    scenario(
      "todo_backend.api.create_returns_persisted_todo",
      "official.create.new_todo_has_url",
      async () => {
        const created = await postTodo({ title: "blah" });
        expect(created.url).toEqual(expect.any(String));
        await expect(getJson<Todo[]>(apiRoot)).resolves.toMatchObject([{ url: created.url }]);
      },
    );

    scenario(
      "todo_backend.api.todo_urls_are_dereferenceable",
      "official.create.todo_url_returns_todo",
      async () => {
        const created = await postTodo({ title: "my todo" });
        await expect(getJson<Todo>(created.url)).resolves.toMatchObject({ title: "my todo" });
      },
    );

    scenario(
      "todo_backend.api.todo_urls_are_dereferenceable",
      "official.existing.list_url_navigates_to_individual_todo",
      async () => {
        await postTodo({ title: "todo the first" });
        await postTodo({ title: "todo the second" });
        const todos = await getJson<Todo[]>(apiRoot);
        expect(todos).toHaveLength(2);
        await expect(getJson<Todo>(todos[0]!.url)).resolves.toHaveProperty("title");
      },
    );

    scenario(
      "todo_backend.api.update_changes_title_and_completed",
      "official.existing.patch_title",
      async () => {
        const created = await postTodo({ title: "initial title" });
        await expect(patchTodo(created.url, { title: "bathe the cat" })).resolves.toMatchObject({
          title: "bathe the cat",
        });
      },
    );

    scenario(
      "todo_backend.api.update_changes_title_and_completed",
      "official.existing.patch_completed",
      async () => {
        const created = await postTodo({ title: "blah" });
        await expect(patchTodo(created.url, { completed: true })).resolves.toMatchObject({
          completed: true,
        });
      },
    );

    scenario(
      "todo_backend.api.update_changes_title_and_completed",
      "official.existing.patch_persists_to_item_and_list",
      async () => {
        const created = await postTodo({ title: "blah" });
        const patched = await patchTodo(created.url, {
          completed: true,
          title: "changed title",
        });

        await expect(getJson<Todo>(patched.url)).resolves.toMatchObject({
          completed: true,
          title: "changed title",
        });
        await expect(getJson<Todo[]>(apiRoot)).resolves.toMatchObject([
          {
            completed: true,
            title: "changed title",
          },
        ]);
      },
    );

    scenario(
      "todo_backend.api.delete_one_removes_only_that_todo",
      "official.existing.delete_todo_by_url",
      async () => {
        const created = await postTodo({ title: "delete one" });
        await deleteUrl(created.url);
        await expect(getJson<Todo[]>(apiRoot)).resolves.toEqual([]);
      },
    );

    scenario(
      "todo_backend.api.order_is_preserved_and_updateable",
      "official.order.create_with_order",
      async () => {
        await expect(postTodo({ order: 523, title: "blah" })).resolves.toMatchObject({
          order: 523,
        });
      },
    );

    scenario(
      "todo_backend.api.order_is_preserved_and_updateable",
      "official.order.patch_order",
      async () => {
        const created = await postTodo({ order: 10, title: "blah" });
        await expect(patchTodo(created.url, { order: 95 })).resolves.toMatchObject({ order: 95 });
      },
    );

    scenario(
      "todo_backend.api.order_is_preserved_and_updateable",
      "official.order.refetch_remembers_order",
      async () => {
        const created = await postTodo({ order: 10, title: "blah" });
        const patched = await patchTodo(created.url, { order: 95 });
        await expect(getJson<Todo>(patched.url)).resolves.toMatchObject({ order: 95 });
      },
    );

    if (implementationPromiseId) {
      scenario(
        implementationPromiseId,
        "configured implementation satisfies the official Todo-Backend contract",
        async () => {
          const response = await fetch(apiRoot);
          expect(response.ok).toBe(true);
        },
      );
    }
  });
}
