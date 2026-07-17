import React from "react";
import ReactDOM from "react-dom/client";
import { view } from "@forge/bridge";
import { App } from "./App";
import { rememberAtlassianSiteUrl } from "./lib/jiraBrowseUrl";
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

void view.getContext()
  .then((context) => rememberAtlassianSiteUrl(context.siteUrl))
  .catch((error) => {
    console.warn("Qaira could not resolve the Jira site URL from Forge context.", {
      message: error instanceof Error ? error.message : String(error)
    });
  });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
