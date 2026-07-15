import React from "react";
import ReactDOM from "react-dom/client";
import { view } from "@forge/bridge";
import { App } from "./App";
import { syncWorkspaceThemeFromJira } from "./lib/workspacePreferences";
import "./styles.css";
import "./dark-theme.css";

const themeObserver = new MutationObserver(() => {
  syncWorkspaceThemeFromJira();
});

themeObserver.observe(document.documentElement, {
  attributes: true,
  attributeFilter: ["data-color-mode"]
});

void view.theme.enable()
  .then(syncWorkspaceThemeFromJira)
  .catch((error) => {
    console.warn("Qaira could not subscribe to the Jira theme; using the browser preference.", {
      message: error instanceof Error ? error.message : String(error)
    });
    syncWorkspaceThemeFromJira();
  });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
