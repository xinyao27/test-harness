import { createRoot } from "react-dom/client";

import "todomvc-common/base.css";
import "todomvc-app-css/index.css";
import "./styles.css";

import { App } from "./todo/App.jsx";

createRoot(document.getElementById("root")).render(<App />);
