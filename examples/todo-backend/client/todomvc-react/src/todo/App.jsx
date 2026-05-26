import { useCallback, useEffect, useMemo, useState } from "react";

import {
  createTodo,
  deleteAllTodos,
  deleteTodo,
  listTodos,
  todoBackendUrl,
  updateTodo,
} from "../api.js";

const routeFromHash = () => {
  const route = window.location.hash.replace(/^#\/?/, "");
  return route === "active" || route === "completed" ? route : "all";
};

const todoKey = (todo) => todo.url;

const classNames = (classes) =>
  Object.entries(classes)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name)
    .join(" ");

export function App() {
  const [todos, setTodos] = useState([]);
  const [route, setRoute] = useState(routeFromHash);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const loadTodos = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      setTodos(await listTodos());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTodos();
  }, [loadTodos]);

  useEffect(() => {
    const onHashChange = () => setRoute(routeFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const activeTodos = useMemo(() => todos.filter((todo) => !todo.completed), [todos]);
  const completedCount = todos.length - activeTodos.length;
  const visibleTodos = useMemo(
    () =>
      todos.filter((todo) => {
        if (route === "active") return !todo.completed;
        if (route === "completed") return todo.completed;
        return true;
      }),
    [route, todos],
  );

  const runAction = useCallback(
    async (action) => {
      setError("");
      try {
        await action();
        await loadTodos();
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : String(actionError));
      }
    },
    [loadTodos],
  );

  const addTodo = useCallback(
    async (title) => {
      const trimmed = title.trim();
      if (trimmed.length === 0) return;
      await runAction(async () => {
        await createTodo(trimmed, todos.length + 1);
      });
    },
    [runAction, todos.length],
  );

  const toggleTodo = useCallback(
    async (todo) => {
      await runAction(async () => {
        await updateTodo(todo, { completed: !todo.completed });
      });
    },
    [runAction],
  );

  const renameTodo = useCallback(
    async (todo, title) => {
      const trimmed = title.trim();
      await runAction(async () => {
        if (trimmed.length === 0) await deleteTodo(todo);
        else await updateTodo(todo, { title: trimmed });
      });
    },
    [runAction],
  );

  const removeTodo = useCallback(
    async (todo) => {
      await runAction(async () => {
        await deleteTodo(todo);
      });
    },
    [runAction],
  );

  const toggleAll = useCallback(
    async (completed) => {
      await runAction(async () => {
        await Promise.all(todos.map((todo) => updateTodo(todo, { completed })));
      });
    },
    [runAction, todos],
  );

  const clearCompleted = useCallback(async () => {
    await runAction(async () => {
      await Promise.all(todos.filter((todo) => todo.completed).map(deleteTodo));
    });
  }, [runAction, todos]);

  const clearAll = useCallback(async () => {
    await runAction(deleteAllTodos);
  }, [runAction]);

  return (
    <>
      <header className="header" data-testid="header">
        <h1>todos</h1>
        <TodoInput label="New Todo Input" onSubmit={addTodo} placeholder="What needs to be done?" />
      </header>

      <main className="main" data-testid="main" hidden={todos.length === 0}>
        <div className="toggle-all-container">
          <input
            checked={todos.length > 0 && todos.every((todo) => todo.completed)}
            className="toggle-all"
            data-testid="toggle-all"
            id="toggle-all"
            onChange={(event) => void toggleAll(event.target.checked)}
            type="checkbox"
          />
          <label className="toggle-all-label" htmlFor="toggle-all">
            Toggle All Input
          </label>
        </div>

        <ul className="todo-list" data-testid="todo-list">
          {visibleTodos.map((todo) => (
            <TodoItem
              key={todoKey(todo)}
              onDelete={removeTodo}
              onRename={renameTodo}
              onToggle={toggleTodo}
              todo={todo}
            />
          ))}
        </ul>
      </main>

      <footer className="footer" data-testid="footer" hidden={todos.length === 0}>
        <span className="todo-count">{`${activeTodos.length} ${
          activeTodos.length === 1 ? "item" : "items"
        } left!`}</span>
        <ul className="filters" data-testid="footer-navigation">
          <li>
            <a className={classNames({ selected: route === "all" })} href="#/">
              All
            </a>
          </li>
          <li>
            <a className={classNames({ selected: route === "active" })} href="#/active">
              Active
            </a>
          </li>
          <li>
            <a className={classNames({ selected: route === "completed" })} href="#/completed">
              Completed
            </a>
          </li>
        </ul>
        <button
          className="clear-completed"
          hidden={completedCount === 0}
          onClick={() => void clearCompleted()}
        >
          Clear completed
        </button>
      </footer>

      <div className="backend-status">
        <button onClick={() => void clearAll()} type="button">
          Clear all
        </button>
        <strong>{isLoading ? "Loading" : "Todo-Backend"}</strong>
        <span> {todoBackendUrl}</span>
        {error && <div className="error">{error}</div>}
      </div>
    </>
  );
}

function TodoInput({ defaultValue, editing = false, label, onBlur, onSubmit, placeholder }) {
  const [value, setValue] = useState(defaultValue ?? "");

  const submit = useCallback(() => {
    const nextValue = value.trim();
    if (!editing && nextValue.length === 0) return;
    onSubmit(nextValue);
    if (!editing) setValue("");
  }, [editing, onSubmit, value]);

  return (
    <input
      aria-label={label}
      autoFocus
      className={editing ? "edit" : "new-todo"}
      data-testid="text-input"
      onBlur={() => onBlur?.(value.trim())}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") submit();
      }}
      placeholder={placeholder}
      type="text"
      value={value}
    />
  );
}

function TodoItem({ onDelete, onRename, onToggle, todo }) {
  const [isEditing, setIsEditing] = useState(false);

  const commitEdit = useCallback(
    (title) => {
      if (!isEditing) return;
      setIsEditing(false);
      void onRename(todo, title);
    },
    [isEditing, onRename, todo],
  );

  return (
    <li
      className={classNames({ completed: todo.completed, editing: isEditing })}
      data-testid="todo-item"
    >
      <div className="view">
        <input
          checked={todo.completed}
          className="toggle"
          data-testid="todo-item-toggle"
          onChange={() => void onToggle(todo)}
          type="checkbox"
        />
        <label data-testid="todo-item-label" onDoubleClick={() => setIsEditing(true)}>
          {todo.title}
        </label>
        <button
          aria-label="Delete todo"
          className="destroy"
          data-testid="todo-item-button"
          onClick={() => void onDelete(todo)}
          type="button"
        />
      </div>
      {isEditing && (
        <TodoInput
          defaultValue={todo.title}
          editing
          label="Edit todo"
          onBlur={commitEdit}
          onSubmit={commitEdit}
        />
      )}
    </li>
  );
}
