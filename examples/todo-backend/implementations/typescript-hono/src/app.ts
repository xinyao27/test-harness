import { Hono } from "hono";
import { cors } from "hono/cors";

export type Todo = {
  readonly completed: boolean;
  readonly order: number;
  readonly title: string;
  readonly url: string;
};

type TodoState = {
  completed: boolean;
  id: string;
  order: number;
  title: string;
};

type TodoCreateInput = {
  readonly completed?: unknown;
  readonly order?: unknown;
  readonly title?: unknown;
};

type TodoPatchInput = {
  readonly completed?: unknown;
  readonly order?: unknown;
  readonly title?: unknown;
};

export type TodoBackendOptions = {
  readonly pathPrefix?: string;
};

const defaultPathPrefix = "/todos";

const normalizePathPrefix = (pathPrefix: string): string => {
  const normalized = pathPrefix.startsWith("/") ? pathPrefix : `/${pathPrefix}`;
  return normalized.endsWith("/") && normalized.length > 1 ? normalized.slice(0, -1) : normalized;
};

const titleFrom = (value: unknown): string => (typeof value === "string" ? value : "");

const completedFrom = (value: unknown): boolean => (typeof value === "boolean" ? value : false);

const orderFrom = (value: unknown): number => (typeof value === "number" ? value : 0);

const todoUrl = (requestUrl: string, pathPrefix: string, id: string): string => {
  const url = new URL(requestUrl);
  return `${url.origin}${pathPrefix}/${id}`;
};

export const createTodoBackendApp = (options: TodoBackendOptions = {}): Hono => {
  const pathPrefix = normalizePathPrefix(options.pathPrefix ?? defaultPathPrefix);
  const app = new Hono();
  const todos = new Map<string, TodoState>();
  let nextId = 1;

  const serialize = (state: TodoState, requestUrl: string): Todo => ({
    completed: state.completed,
    order: state.order,
    title: state.title,
    url: todoUrl(requestUrl, pathPrefix, state.id),
  });

  app.use(
    "*",
    cors({
      allowHeaders: ["Content-Type"],
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      origin: "*",
    }),
  );

  app.get(pathPrefix, (context) =>
    context.json(Array.from(todos.values()).map((todo) => serialize(todo, context.req.url))),
  );

  app.post(pathPrefix, async (context) => {
    const input = (await context.req.json().catch(() => ({}))) as TodoCreateInput;
    const todo: TodoState = {
      completed: completedFrom(input.completed),
      id: String(nextId++),
      order: orderFrom(input.order),
      title: titleFrom(input.title),
    };
    todos.set(todo.id, todo);
    return context.json(serialize(todo, context.req.url), 201);
  });

  app.delete(pathPrefix, (context) => {
    todos.clear();
    return context.body(null, 204);
  });

  app.get(`${pathPrefix}/:id`, (context) => {
    const todo = todos.get(context.req.param("id"));
    if (!todo) {
      return context.json({ error: "Todo not found" }, 404);
    }
    return context.json(serialize(todo, context.req.url));
  });

  app.patch(`${pathPrefix}/:id`, async (context) => {
    const todo = todos.get(context.req.param("id"));
    if (!todo) {
      return context.json({ error: "Todo not found" }, 404);
    }

    const input = (await context.req.json().catch(() => ({}))) as TodoPatchInput;
    if (typeof input.title === "string") {
      todo.title = input.title;
    }
    if (typeof input.completed === "boolean") {
      todo.completed = input.completed;
    }
    if (typeof input.order === "number") {
      todo.order = input.order;
    }

    return context.json(serialize(todo, context.req.url));
  });

  app.delete(`${pathPrefix}/:id`, (context) => {
    todos.delete(context.req.param("id"));
    return context.body(null, 204);
  });

  return app;
};
