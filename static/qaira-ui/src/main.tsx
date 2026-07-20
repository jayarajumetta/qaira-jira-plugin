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

const issueContextRoute = (context: Awaited<ReturnType<typeof view.getContext>>) => {
  const contextRecord = context as unknown as Record<string, unknown>;
  const extension = (context.extension || {}) as Record<string, unknown>;
  const platformContext = (contextRecord.platformContext || {}) as Record<string, unknown>;
  const issue = (extension.issue || platformContext.issue || {}) as Record<string, unknown>;
  const extensionType = String(extension.type || "").toLowerCase();
  if (!extensionType.includes("issue")) return "";
  const rawIssueType = issue.type && typeof issue.type === "object"
    ? (issue.type as Record<string, unknown>).name || (issue.type as Record<string, unknown>).id
    : issue.type;
  const issueKey = String(issue.key || issue.id || extension.issueKey || extension.issueId || platformContext.issueKey || platformContext.issueId || "");
  const issueType = String(rawIssueType || extension.issueType || platformContext.issueType || "").toLowerCase();
  if (!issueKey) return "";
  if (issueType.includes("qaira test case")) return `/test-cases?case=${encodeURIComponent(issueKey)}`;
  if (issueType.includes("qaira test suite")) return `/design?suite=${encodeURIComponent(issueKey)}`;
  if (issueType.includes("qaira test run")) return `/executions?execution=${encodeURIComponent(issueKey)}`;
  if (issueType === "story") return `/requirements?requirement=${encodeURIComponent(issueKey)}`;
  if (issueType === "bug") return `/issues?issue=${encodeURIComponent(issueKey)}`;
  return "";
};

async function bootstrap() {
  try {
    await view.theme.enable();
    syncWorkspaceThemeFromJira();
  } catch (error) {
    console.warn("Qaira could not subscribe to the Jira theme; using the browser preference.", {
      message: error instanceof Error ? error.message : String(error)
    });
    syncWorkspaceThemeFromJira();
  }

  try {
    const context = await view.getContext();
    rememberAtlassianSiteUrl(context.siteUrl);
    const route = issueContextRoute(context);
    if (route) window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${route}`);
  } catch (error) {
    console.warn("Qaira could not resolve the Jira site URL or issue route from Forge context.", {
      message: error instanceof Error ? error.message : String(error)
    });
  }

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

void bootstrap();
