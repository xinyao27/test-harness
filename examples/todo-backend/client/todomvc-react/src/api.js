const todosUrl = import.meta.env.VITE_TODO_BACKEND_URL ?? "http://127.0.0.1:3101/todos";

const parseJson = async (response) => {
  if (response.status === 204) return undefined;
  return await response.json();
};

const request = async (url, init = {}) => {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${response.statusText}${body ? `: ${body}` : ""}`);
  }

  return await parseJson(response);
};

export const todoBackendUrl = todosUrl;

export const listTodos = async () => {
  const todos = await request(todosUrl);
  return Array.isArray(todos) ? todos : [];
};

export const createTodo = async (title, order) =>
  await request(todosUrl, {
    body: JSON.stringify({ completed: false, order, title }),
    method: "POST",
  });

export const updateTodo = async (todo, patch) =>
  await request(todo.url, {
    body: JSON.stringify(patch),
    method: "PATCH",
  });

export const deleteTodo = async (todo) => {
  await request(todo.url, { method: "DELETE" });
};

export const deleteAllTodos = async () => {
  await request(todosUrl, { method: "DELETE" });
};
