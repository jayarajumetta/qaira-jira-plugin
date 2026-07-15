import { type ChangeEvent, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AddIcon, CopyIcon, ExportIcon, ImportIcon, LayersIcon, MousePointerIcon, OpenIcon, PauseIcon, PencilIcon, PlayIcon, SparkIcon, TrashIcon } from "../components/AppIcons";
import { AiAssurancePanel } from "../components/AiAssurancePanel";
import { CatalogSearchFilter } from "../components/CatalogSearchFilter";
import { CatalogSelectionControls } from "../components/CatalogSelectionControls";
import { CatalogViewToggle } from "../components/CatalogViewToggle";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { DisplayIdBadge } from "../components/DisplayIdBadge";
import { InfoTooltip } from "../components/InfoTooltip";
import { PageHeader } from "../components/PageHeader";
import { Panel } from "../components/Panel";
import { RecorderSessionInsights } from "../components/RecorderSessionInsights";
import { RecorderStartControls, type RecorderStartOptions } from "../components/RecorderStartControls";
import { RunHooksBuilder, type RunHookSelection, type RunHookType } from "../components/RunHooksBuilder";
import { RichTextContent, RichTextEditor, richTextToPlainText } from "../components/RichTextEditor";
import { StatusBadge } from "../components/StatusBadge";
import { StepParameterDialog } from "../components/StepParameterDialog";
import { SubnavTabs } from "../components/SubnavTabs";
import { ToastMessage } from "../components/ToastMessage";
import {
  TileCardCaseIcon,
  TileCardFact,
  TileCardIconFrame,
  TileCardRunsIcon,
  TileCardStepsIcon,
  getTileCardTone
} from "../components/TileCardPrimitives";
import { TileBrowserPane } from "../components/TileBrowserPane";
import { TileCardSkeletonGrid } from "../components/TileCardSkeletonGrid";
import { WorkspaceBackButton, WorkspaceMasterDetail } from "../components/WorkspaceMasterDetail";
import { useAuth } from "../auth/AuthContext";
import { useAiPromptRegistry } from "../hooks/useAiPromptRegistry";
import { useCurrentAppType, useCurrentProject } from "../hooks/useCurrentProject";
import { useFeatureFlags } from "../hooks/useFeatureFlags";
import { api } from "../lib/api";
import { assessLocatorReviewReadiness } from "../lib/aiAssurance";
import { areFeatureFlagsEnabled } from "../lib/featureFlags";
import { parseObjectRepositoryFiles, type ObjectRepositoryImportPreview } from "../lib/objectRepositoryImport";
import { hasPermission } from "../lib/permissions";
import { findByRoutableId, getRoutableId } from "../lib/urlSelection";
import { readDefaultCatalogViewMode } from "../lib/viewPreferences";
import {
  collectStepParameters,
  combineStepParameterValues,
  normalizeStepParameterValues,
  parseStepParameterName,
  type StepParameterScope
} from "../lib/stepParameters";
import type { AutomationLearningCacheEntry, ExecutionResult, RecorderSessionResponse, TestCase, TestStep, TestStepType, TestSuite } from "../types";

type AutomationView = "cases" | "repository";
type AutomationCaseSectionKey = "case" | "steps" | "history";
type AutomationStepView = "keyword" | "code";
type RepositoryScreenTab = "overview" | "fields" | "dom" | "suggestions";
type RepositoryFieldTab = "locators" | "evidence" | "meaning";
const REPOSITORY_CONFIG_DRAWER_DEFAULT_WIDTH = 440;
const REPOSITORY_CONFIG_DRAWER_MIN_WIDTH = 360;
const REPOSITORY_CONFIG_DRAWER_MAX_WIDTH = 720;

const clampRepositoryConfigDrawerWidth = (value: number) =>
  Math.min(REPOSITORY_CONFIG_DRAWER_MAX_WIDTH, Math.max(REPOSITORY_CONFIG_DRAWER_MIN_WIDTH, value));

const normalizeAutomationParameterValues = (values?: Record<string, unknown> | null, scope: StepParameterScope = "t") =>
  normalizeStepParameterValues((values || {}) as Record<string, string>, scope);

type AutomationCaseDraft = {
  title: string;
  description: string;
  status: string;
  priority: string;
  parameterText: string;
};

type AutomationStepDraft = {
  step_type: TestStepType;
  name: string;
  keyword: string;
  objectRef: string;
  value: string;
  expected_result: string;
};

type AutomationStepOptions = {
  screenshotOnFailure: boolean;
  optional: boolean;
  skip: boolean;
};

const REPOSITORY_PAGE_SIZE = 200;

type RecorderTab = {
  id: string | null;
  title: string | null;
  url: string;
  active?: boolean;
};

type LocalInspectRuntime = {
  publicBaseUrl: string;
  label: string;
  reusableSessions: number;
};

type RecorderInspectResult = {
  captured_at: string;
  page_id: string | null;
  page_title: string | null;
  page_url: string | null;
  screen_dom: string | null;
  accessibility_tree?: string | null;
  screen_fingerprint?: string | null;
  screen_screenshot_url: string | null;
  element_screenshot_url?: string | null;
  ancestor_screenshot_url?: string | null;
  element: RecorderInspectElement;
  selections?: RecorderInspectSelection[];
};

type RecorderInspectElement = {
  friendly_name: string;
  html_tag: string;
  role: string;
  locator: string;
  locator_kind: string;
  dom_structure: string;
  ancestor_dom?: string | null;
  locator_candidates?: Array<{
    locator: string;
    strategy: string;
    confidenceScore: number;
  }>;
  text: string | null;
};

type RecorderInspectSelection = {
  element: RecorderInspectElement;
  element_screenshot_url?: string | null;
  ancestor_screenshot_url?: string | null;
};

const formatRunDate = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit"
});

const AUTOMATION_KEYWORDS_BY_TYPE: Record<TestStepType, string[]> = {
  web: [
    "web.goto", "web.openTab", "web.switchTab", "web.closeTab", "web.reload", "web.goBack", "web.goForward",
    "web.click", "web.hover", "web.dblclick", "web.rightClick", "web.fill", "web.clear", "web.select",
    "web.check", "web.uncheck", "web.uploadFile", "web.uploadLocalFile", "web.uploadRemoteFile", "web.press",
    "web.scroll", "web.wait", "web.waitForLoadState", "web.expectVisible", "web.expectHidden", "web.expectText",
    "web.expectValue", "web.expectEnabled", "web.expectUrl", "web.text", "web.value", "web.captureText", "web.screenshot"
  ],
  api: ["api.request", "api.expectStatus", "api.expectJson", "api.capture"],
  android: [
    "android.tap", "android.tapByText", "android.tapPoint", "android.doubleTap", "android.longPress", "android.type",
    "android.clear", "android.hideKeyboard", "android.swipe", "android.scrollIntoView", "android.waitForDisplayed",
    "android.waitForExist", "android.waitForEnabled", "android.expectText", "android.expectDisplayed",
    "android.expectNotDisplayed", "android.expectEnabled", "android.expectValue", "android.pushFile",
    "android.pushRemoteFile", "android.pullFile", "android.installApp", "android.removeApp", "android.startActivity",
    "android.openDeepLink", "android.pressBack", "android.pressKeyCode", "android.backgroundApp", "android.activateApp",
    "android.terminateApp", "android.setOrientation", "android.pause"
  ],
  ios: ["mobile.tap", "mobile.type", "mobile.select", "mobile.press", "mobile.expectVisible", "mobile.expectText"]
};

const emptyAutomationStepDraft = (stepType: TestStepType = "web"): AutomationStepDraft => ({
  step_type: stepType,
  name: "",
  keyword: AUTOMATION_KEYWORDS_BY_TYPE[stepType][0],
  objectRef: "",
  value: "",
  expected_result: ""
});

const hookTypeToExecutionHookMeta = (hookType: RunHookType) => {
  switch (hookType) {
    case "BEFORE_ALL":
      return { scope: "run", phase: "pre", name: "Before Run", fail_behavior: "fail-run" };
    case "AFTER_ALL":
      return { scope: "run", phase: "post", name: "After Run", fail_behavior: "continue" };
    case "BEFORE_SUITE":
      return { scope: "suite", phase: "pre", name: "Before Suite", fail_behavior: "fail-run" };
    case "AFTER_SUITE":
      return { scope: "suite", phase: "post", name: "After Suite", fail_behavior: "continue" };
    case "BEFORE_TEST":
      return { scope: "test", phase: "pre", name: "Before Test", fail_behavior: "fail-run" };
    case "AFTER_TEST":
      return { scope: "test", phase: "post", name: "After Test", fail_behavior: "continue" };
    default:
      return { scope: "test", phase: "pre", name: "Run Hook", fail_behavior: "fail-run" };
  }
};

function mapRunHooksToExecutionHooks(hooks: RunHookSelection[]) {
  return hooks.map((hook, index) => {
    const meta = hookTypeToExecutionHookMeta(hook.hookType);
    return {
      id: hook.id,
      name: `${meta.name}: ${hook.name}`,
      hook_type: hook.hookType,
      scope: meta.scope,
      phase: meta.phase,
      fail_behavior: meta.fail_behavior,
      target_kind: hook.itemType,
      target_id: hook.itemId,
      execution_order: index + 1
    };
  });
}

function isAutomatedCase(testCase: TestCase) {
  return testCase.automated === "yes";
}

function isManualCase(testCase: TestCase) {
  return testCase.automated !== "yes";
}

function normalizeMetadataValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function normalizeMetadataNumber(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function metadataStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}

type RepositoryLocator = {
  locator: string;
  strategy: string;
  confidenceScore: number;
  isPrimary?: boolean;
  isFallback?: boolean;
  lastValidatedStatus?: string;
};

function inferLocatorStrategy(locator: string, kind?: string | null) {
  if (/data-testid/i.test(locator)) return "data-testid";
  if (/aria-label/i.test(locator)) return "aria-label";
  if (/getbyrole|role=/i.test(locator)) return "role + name";
  if (/^#|\bid=/i.test(locator)) return "stable id";
  if (/\bname=/i.test(locator)) return "name attribute";
  if (/placeholder/i.test(locator)) return "placeholder";
  if (/^text=|getbytext/i.test(locator)) return "text";
  if (/xpath|^\/\//i.test(locator)) return "xpath";
  return kind || "css";
}

function getRepositoryLocators(entry: AutomationLearningCacheEntry): RepositoryLocator[] {
  const fallback = Array.isArray(entry.metadata?.fallback_locators)
    ? entry.metadata.fallback_locators
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
        .map((item) => ({
          locator: normalizeMetadataValue(item.locator),
          strategy: normalizeMetadataValue(item.strategy) || inferLocatorStrategy(normalizeMetadataValue(item.locator)),
          confidenceScore: normalizeMetadataNumber(item.confidenceScore ?? item.confidence, 0.6),
          isFallback: true,
          lastValidatedStatus: normalizeMetadataValue(item.lastValidatedStatus) || "pending"
        }))
        .filter((item) => item.locator)
    : [];

  return [{
    locator: entry.locator,
    strategy: inferLocatorStrategy(entry.locator, entry.locator_kind),
    confidenceScore: entry.confidence,
    isPrimary: true,
    lastValidatedStatus: normalizeMetadataValue(entry.metadata?.last_validated_status) || "pending"
  }, ...fallback];
}

function formatLocatorDraft(locators: RepositoryLocator[]) {
  return locators.filter((locator) => locator.isFallback).map((locator) =>
    `${locator.strategy} | ${locator.locator} | ${Math.round(locator.confidenceScore * 100)}`
  ).join("\n");
}

function parseLocatorDraft(value: string): RepositoryLocator[] {
  return value.split(/\n+/).map((line) => {
    const [strategy, locator, confidence] = line.split("|").map((part) => part.trim());
    return {
      strategy: strategy || inferLocatorStrategy(locator || ""),
      locator: locator || strategy,
      confidenceScore: Math.max(0, Math.min(1, (Number(confidence) || 70) / 100)),
      isFallback: true,
      lastValidatedStatus: "pending"
    };
  }).filter((item) => item.locator);
}

function formatRepositoryDate(value: unknown) {
  const text = normalizeMetadataValue(value);
  if (!text) return "Never validated";
  const date = new Date(text);
  return Number.isNaN(date.valueOf()) ? text : formatRunDate.format(date);
}

function inferScreenName(title: string | null, url: string | null) {
  const trimmedTitle = String(title || "").replace(/\s+[|·-]\s+.*$/, "").trim();
  if (trimmedTitle && !/^new tab$/i.test(trimmedTitle)) {
    return trimmedTitle;
  }

  try {
    const segment = new URL(String(url || "")).pathname.split("/").filter(Boolean).pop() || "screen";
    return toFriendlyElementName(segment, "Screen");
  } catch {
    return "Captured Screen";
  }
}

function inferUrlPattern(url: string | null) {
  try {
    const path = new URL(String(url || "")).pathname;
    return { type: "endsWith", value: path || "/" };
  } catch {
    return { type: "contains", value: url || "" };
  }
}

function getCapturedLocatorsForElement(element: RecorderInspectElement): RepositoryLocator[] {
  const captured = element.locator_candidates || [];
  if (captured.length) {
    return captured.map((candidate, index) => ({
      locator: candidate.locator,
      strategy: candidate.strategy,
      confidenceScore: candidate.confidenceScore,
      isPrimary: index === 0,
      isFallback: index > 0,
      lastValidatedStatus: "pending"
    }));
  }

  return [{
    locator: element.locator,
    strategy: inferLocatorStrategy(element.locator, element.locator_kind),
    confidenceScore: element.locator.includes("data-testid") ? 0.95 : 0.75,
    isPrimary: true,
    lastValidatedStatus: "pending"
  }];
}

function getCapturedLocators(result: RecorderInspectResult): RepositoryLocator[] {
  return getCapturedLocatorsForElement(result.element);
}

function getScreenName(entry: AutomationLearningCacheEntry) {
  return normalizeMetadataValue(entry.metadata?.screen_name) || entry.page_key || "Unassigned screen";
}

function makeRepositoryScreenKey(screenName: string, appTypeId?: string | null) {
  return `${appTypeId || "workspace"}::${screenName}`;
}

function getRepositoryScreenKey(entry: AutomationLearningCacheEntry) {
  return makeRepositoryScreenKey(getScreenName(entry), entry.app_type_id);
}

function getObjectName(entry: AutomationLearningCacheEntry) {
  return normalizeMetadataValue(entry.metadata?.object_name) || entry.locator_intent || "Unnamed object";
}

function getObjectRole(entry: AutomationLearningCacheEntry) {
  const value = normalizeMetadataValue(entry.metadata?.object_role) || entry.locator_kind || entry.source || "field";
  const parts = value.split(/\s*\/\s*/).filter(Boolean);
  return parts[parts.length - 1] || value;
}

function splitRepositoryRole(value: string, fallbackTag = "element", fallbackRole = "field") {
  const parts = value.split(/\s*\/\s*/).map((part) => part.trim()).filter(Boolean);
  return {
    tag: parts[0] || fallbackTag,
    role: parts[parts.length - 1] || fallbackRole
  };
}

function getRepositoryImportKindLabel(kind: ObjectRepositoryImportPreview["inputKinds"][number]) {
  if (kind === "csv") return "CSV export";
  if (kind === "zip") return "ZIP archive";
  return "Page object source";
}

function extractQuotedTargets(code?: string | null) {
  if (!code) {
    return [];
  }

  const targets = new Set<string>();
  const callPattern = /web\.(?:click|fill|select|check|uncheck|hover|press|expect(?:Text|Visible|Hidden)?)\(\s*(['"`])([\s\S]*?)\1/g;
  let match = callPattern.exec(code);

  while (match) {
    if (match[2]?.trim()) {
      targets.add(match[2].trim());
    }
    match = callPattern.exec(code);
  }

  return Array.from(targets);
}

function extractVariables(step: TestStep) {
  const values = `${step.action || ""} ${step.expected_result || ""} ${step.automation_code || ""}`;
  const variables = new Set<string>();
  const pattern = /(?<![A-Za-z0-9_])@((?:t|s|r)\.[A-Za-z][A-Za-z0-9_-]*)|\{\{\s*([^}]+?)\s*\}\}/g;
  let match = pattern.exec(values);

  while (match) {
    const variable = match[1] || match[2];
    if (variable?.trim()) {
      variables.add(variable.trim());
    }
    match = pattern.exec(values);
  }

  return Array.from(variables);
}

function formatRecorderDisplayMode(value?: string | null) {
  return value === "browser-live-view" ? "Live view" : value === "local-browser-with-live-view" ? "Local browser + live view" : "Recorder";
}

function getRepositoryScreenUrl(entries: AutomationLearningCacheEntry[]) {
  return entries.find((entry) => entry.page_url)?.page_url || entries[0]?.page_key || "No URL captured";
}

function isLikelyImageUrl(value: string) {
  return /^https?:\/\//i.test(value) || value.startsWith("/") || value.startsWith("data:image/");
}

function buildSuggestedFieldName(entry: AutomationLearningCacheEntry) {
  const role = getObjectRole(entry).toLowerCase();
  const name = getObjectName(entry).toLowerCase();

  if (name.includes("password") || role.includes("password")) {
    return "password";
  }

  if (name.includes("user") || name.includes("email") || role.includes("textbox")) {
    return name.includes("email") ? "email" : "username";
  }

  if (name.includes("forgot")) {
    return "forgot_password";
  }

  if (name.includes("remember")) {
    return "remember_me";
  }

  if (name.includes("sign") || name.includes("login") || role.includes("button")) {
    return "sign_in";
  }

  return getObjectName(entry).replace(/\s+/g, "_").toLowerCase();
}

function formatAutomationCaseId(sequence: number) {
  return `AT-${String(sequence + 1).padStart(3, "0")}`;
}

function ChevronIcon({ isExpanded }: { isExpanded: boolean }) {
  return (
    <svg aria-hidden="true" className={isExpanded ? "accordion-chevron is-expanded" : "accordion-chevron"} viewBox="0 0 20 20">
      <path d="M7 4.5 12.5 10 7 15.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

function AutomationAccordionSection({
  actions,
  children,
  countLabel,
  isExpanded,
  onToggle,
  summary,
  title
}: {
  actions?: ReactNode;
  children: ReactNode;
  countLabel?: string;
  isExpanded: boolean;
  onToggle: () => void;
  summary: ReactNode;
  title: ReactNode;
}) {
  return (
    <section className={["editor-accordion-section", isExpanded ? "is-expanded" : ""].filter(Boolean).join(" ")}>
      <div className="editor-accordion-head">
        <button className="editor-accordion-toggle" onClick={onToggle} type="button">
          <span className="editor-accordion-icon"><ChevronIcon isExpanded={isExpanded} /></span>
          <span className="editor-accordion-toggle-main">
            <span className="editor-accordion-toggle-copy">
              <strong>{title}</strong>
              <span>{summary}</span>
            </span>
            <span className="editor-accordion-toggle-meta">
              {countLabel ? <span className="editor-accordion-toggle-count">{countLabel}</span> : null}
              <span className="editor-accordion-toggle-state">{isExpanded ? "Hide" : "Show"}</span>
            </span>
          </span>
        </button>
        {actions ? <div className="automation-accordion-actions">{actions}</div> : null}
      </div>
      {isExpanded ? <div className="editor-accordion-body">{children}</div> : null}
    </section>
  );
}

function toFriendlyElementName(value: string, fallback = "Element") {
  const normalized = value
    .replace(/^text=/i, "")
    .replace(/^[#.]+/, "")
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/\b(click|input|element|field|button|link|label|aria|text|at)\b/gi, " ")
    .replace(/\b\d{3,}\b/g, " ")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim();
  const tokens = normalized ? normalized.split(/\s+/).slice(0, 4) : [fallback];
  return tokens.map((token) => token.charAt(0).toUpperCase() + token.slice(1)).join(" ");
}

function isNoisyRepositoryName(value?: string | null) {
  const normalized = normalizeMetadataValue(value).trim();
  if (!normalized) return true;
  return /\b(click\s*at|scroll|viewport|location|browser|document|window)\b/i.test(normalized) || /\d{3,}/.test(normalized);
}

function isNonElementRepositoryEntry(entry: AutomationLearningCacheEntry) {
  const locator = String(entry.locator || "").trim().toLowerCase();
  const intent = String(entry.locator_intent || "").trim().toLowerCase();
  const role = getObjectRole(entry).toLowerCase();
  const blockedLocators = new Set(["viewport", "location", "browser.tab", "keyboard", "window", "document", "page"]);
  const blockedIntents = new Set(["scroll", "navigation", "navigate", "goto", "tab", "press"]);
  return isScreenRepositoryRecord(entry) || blockedLocators.has(locator) || blockedIntents.has(intent) || role === "viewport" || role === "page";
}

function isScreenRepositoryRecord(entry: AutomationLearningCacheEntry) {
  return entry.locator_intent === "__screen__" || entry.metadata?.record_kind === "screen" || entry.source === "manual_screen";
}

function getRepositoryMemberName(entry: AutomationLearningCacheEntry) {
  const metadata = entry.metadata || {};
  const locator = String(entry.locator || "");
  const locatorLabel =
    locator.match(/\[(?:aria-label|placeholder|name|data-testid|id)=["']?([^"'\]]+)["']?\]/i)?.[1] ||
    locator.match(/^#([\w-]+)/)?.[1] ||
    locator.match(/^text=(.+)$/i)?.[1] ||
    "";
  const explicit =
    normalizeMetadataValue(metadata.field_name) ||
    normalizeMetadataValue(metadata.member_name) ||
    normalizeMetadataValue(metadata.object_label);
  const objectName = normalizeMetadataValue(metadata.object_name);
  const objectNameValue = isNoisyRepositoryName(objectName) ? "" : objectName;
  const intent = /^(click|fill|change|input|element|field|object|scroll|viewport)$/i.test(entry.locator_intent || "") ? "" : entry.locator_intent;
  const tail = explicit.includes(".") ? explicit.split(".").filter(Boolean).pop() || explicit : explicit;
  const candidates = [locatorLabel, isNoisyRepositoryName(tail) ? "" : tail, objectNameValue, isNoisyRepositoryName(intent) ? "" : intent, locator];
  return toFriendlyElementName(candidates.find((candidate) => candidate && !isNoisyRepositoryName(toFriendlyElementName(candidate))) || "Element");
}

function getRepositoryHtmlTag(entry: AutomationLearningCacheEntry) {
  const metadata = entry.metadata || {};
  const explicit =
    normalizeMetadataValue(metadata.html_tag) ||
    normalizeMetadataValue(metadata.tag_name) ||
    normalizeMetadataValue(metadata.tag) ||
    normalizeMetadataValue(metadata.element_tag);
  const dom = normalizeMetadataValue(metadata.dom_structure) || normalizeMetadataValue(metadata.dom_path) || normalizeMetadataValue(metadata.html);
  const domTag = dom.match(/<\s*([a-z][a-z0-9-]*)/i)?.[1] || "";
  const locatorTag = String(entry.locator || "").match(/^([a-z][a-z0-9-]*)[#.[\s]/i)?.[1] || "";
  const role = getObjectRole(entry).toLowerCase();

  if (explicit) return explicit.toLowerCase();
  if (domTag) return domTag.toLowerCase();
  if (locatorTag) return locatorTag.toLowerCase();
  if (role.includes("button")) return "button";
  if (role.includes("link")) return "a";
  if (role.includes("select") || role.includes("dropdown")) return "select";
  if (role.includes("textarea")) return "textarea";
  if (role.includes("checkbox") || role.includes("toggle")) return "input";
  if (role.includes("field") || role.includes("textbox") || role.includes("input")) return "input";
  return "element";
}

function formatParameterText(values?: Record<string, string> | null) {
  return Object.entries(values || {}).map(([key, value]) => `${key}=${value}`).join("\n");
}

function parseParameterText(value: string) {
  return value.split(/\n+/).reduce<Record<string, string>>((accumulator, line) => {
    const [rawKey, ...rest] = line.split("=");
    const key = rawKey?.trim();
    if (key) {
      accumulator[key] = rest.join("=").trim();
    }
    return accumulator;
  }, {});
}

function parseAutomationStepOptions(step: TestStep): AutomationStepOptions {
  const code = step.automation_code || step.action || "";
  const optionMatch = code.match(/@qaira-options\s+([^\n]+)/i);
  const flags = new Set((optionMatch?.[1] || "").split(/\s+/).filter(Boolean));

  return {
    screenshotOnFailure: flags.has("screenshotOnFailure"),
    optional: flags.has("optional"),
    skip: flags.has("skip")
  };
}

function applyAutomationStepOptions(code: string, options: AutomationStepOptions) {
  const cleaned = code.replace(/^\s*\/\/\s*@qaira-options\s+[^\n]*\n?/i, "").trim();
  const flags = [
    options.screenshotOnFailure ? "screenshotOnFailure" : "",
    options.optional ? "optional" : "",
    options.skip ? "skip" : ""
  ].filter(Boolean);

  return flags.length ? `// @qaira-options ${flags.join(" ")}\n${cleaned}` : cleaned;
}

function getAutomationStepTypeLabel(step: TestStep) {
  const value = step.step_type || "web";
  return value === "android" ? "Android" : value === "ios" ? "iOS" : value.toUpperCase();
}

function inferAutomationStepType(keyword?: string | null, fallback?: TestStepType | null): TestStepType {
  const normalized = String(keyword || "").toLowerCase();
  if (normalized.startsWith("api.")) return "api";
  if (normalized.startsWith("android.")) return "android";
  if (normalized.startsWith("mobile.")) return fallback === "ios" ? "ios" : "android";
  return fallback || "web";
}

function formatKeywordDisplay(keyword: string) {
  const [namespace, action] = keyword.split(".");
  if (!namespace || !action) {
    return keyword;
  }
  return `${namespace.charAt(0).toUpperCase()}${namespace.slice(1)}.${action}`;
}

function formatObjectReferenceLabel(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "No locator selected";
  }
  const parts = trimmed.split(".");
  return parts.length > 1 ? `${parts[parts.length - 2]}.${parts[parts.length - 1]}` : trimmed;
}

function formatAutomationKeywordReadable(draft: AutomationStepDraft, variables: string[] = []) {
  const keyword = formatKeywordDisplay(draft.keyword);
  const target = formatObjectReferenceLabel(draft.objectRef);
  const dataReference = draft.value.trim() || variables.find((variable) => variable.startsWith("t.") || variable.startsWith("s.") || variable.startsWith("r."));
  return `${keyword} ${target}${dataReference ? ` using @${dataReference.replace(/^@/, "")}` : ""}`;
}

function getRecorderEngineBaseUrl(session: RecorderSessionResponse | null) {
  const source = session?.status_url || session?.live_view_url || session?.engine_base_url || "";
  const match = source.match(/^(https?:\/\/[^/]+)/i);
  return match?.[1] || "";
}

async function readRecorderJson<T>(url: string, options?: RequestInit) {
  const response = await fetch(url, {
    ...options,
    cache: "no-store",
    headers: {
      ...(options?.body ? { "Content-Type": "application/json" } : {}),
      ...(options?.headers || {})
    }
  });

  if (response.status === 204) {
    return null as T | null;
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.message || `Request failed with status ${response.status}`);
  }

  return payload as T;
}

const LOCAL_INSPECT_RUNTIMES = [
  { publicBaseUrl: "http://localhost:4311", label: "local recorder" },
  { publicBaseUrl: "http://localhost:4301", label: "Docker Test Engine" }
];

async function discoverLocalInspectRuntime() {
  for (const runtime of LOCAL_INSPECT_RUNTIMES) {
    try {
      const sessions = await readRecorderJson<{ items?: RecorderSessionResponse[] }>(
        `${runtime.publicBaseUrl}/api/v1/recorder/sessions`
      );
      const reusableSessions = (sessions?.items || []).filter((item) =>
        item.status === "running" && item.purpose === "repository-inspect"
      ).length;
      return { ...runtime, reusableSessions };
    } catch {
      // The local recorder is optional until inspection is requested.
    }
  }

  return null;
}

function connectLocalInspectSession(runtime: LocalInspectRuntime, session: RecorderSessionResponse) {
  return {
    ...session,
    purpose: "repository-inspect" as const,
    engine_base_url: runtime.publicBaseUrl,
    status_url: `${runtime.publicBaseUrl}/api/v1/recorder/sessions/${encodeURIComponent(session.id)}`,
    live_view_url: session.live_view_path
      ? `${runtime.publicBaseUrl}${session.live_view_path}`
      : session.live_view_url
  };
}

function extractRepositoryFieldsFromDom(dom: string) {
  const source = String(dom || "");
  const fieldPattern = /<\s*(input|button|select|textarea|a)\b([^>]*)>/gi;
  const attrPattern = /([\w:-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  const fields: Array<{ name: string; tag: string; role: string; locator: string; locatorKind: string; dom: string; fallbackLocators: RepositoryLocator[] }> = [];
  let match = fieldPattern.exec(source);

  while (match) {
    const tag = match[1].toLowerCase();
    const rawAttributes = match[2] || "";
    const attrs: Record<string, string> = {};
    let attrMatch = attrPattern.exec(rawAttributes);
    while (attrMatch) {
      attrs[attrMatch[1].toLowerCase()] = attrMatch[2] || attrMatch[3] || attrMatch[4] || "";
      attrMatch = attrPattern.exec(rawAttributes);
    }

    const label = attrs["aria-label"] || attrs.placeholder || attrs.name || attrs.id || attrs["data-testid"] || attrs.role || tag;
    const name = toFriendlyElementName(label, tag).replace(/\s+/g, "_").toLowerCase();
    const inputType = (attrs.type || "").toLowerCase();
    const semanticRole = attrs.role
      || (tag === "button" ? "button" : "")
      || (tag === "a" ? "link" : "")
      || (tag === "select" ? "combobox" : "")
      || (tag === "textarea" || (tag === "input" && !["checkbox", "radio", "file"].includes(inputType)) ? "textbox" : "")
      || (tag === "input" && ["checkbox", "radio"].includes(inputType) ? inputType : "");
    const quoted = (value: string) => JSON.stringify(value);
    const locatorCandidates = ([
      attrs["data-testid"] ? { locator: `getByTestId(${quoted(attrs["data-testid"])})`, strategy: "playwright test id", confidenceScore: 0.99 } : null,
      semanticRole && label ? { locator: `getByRole(${quoted(semanticRole)}, { name: ${quoted(label)} })`, strategy: "playwright role + name", confidenceScore: 0.97 } : null,
      attrs["aria-label"] ? { locator: `${tag}[aria-label="${attrs["aria-label"]}"]`, strategy: "aria-label", confidenceScore: 0.9 } : null,
      attrs.placeholder ? { locator: `getByPlaceholder(${quoted(attrs.placeholder)})`, strategy: "playwright placeholder", confidenceScore: 0.88 } : null,
      attrs.id ? { locator: `#${attrs.id}`, strategy: "stable id", confidenceScore: 0.88 } : null,
      attrs.name ? { locator: `${tag}[name="${attrs.name}"]`, strategy: "name attribute", confidenceScore: 0.84 } : null,
      tag === "button" || tag === "a" ? { locator: `getByText(${quoted(label)})`, strategy: "playwright text", confidenceScore: 0.7 } : null,
      { locator: tag, strategy: "css", confidenceScore: 0.4 }
    ] as Array<RepositoryLocator | null>).filter((candidate): candidate is RepositoryLocator => Boolean(candidate));
    const locator = locatorCandidates[0].locator;

    if (!fields.some((field) => field.locator === locator)) {
      fields.push({
        name,
        tag,
        role: attrs.role || attrs.type || tag,
        locator,
        locatorKind: locatorCandidates[0].strategy,
        dom: match[0],
        fallbackLocators: locatorCandidates.slice(1).map((candidate) => ({ ...candidate, isFallback: true, lastValidatedStatus: "pending" }))
      });
    }
    match = fieldPattern.exec(source);
  }

  return fields.slice(0, 40);
}

type RepositoryExtractedField = ReturnType<typeof extractRepositoryFieldsFromDom>[number] & {
  description?: string | null;
  businessMeaning?: string | null;
  usageKeywords?: string[];
  source?: "live_inspect" | "dom_candidate" | "ai_extract";
  pageUrl?: string | null;
  targetCriteria?: string | null;
  elementScreenshotUrl?: string | null;
  ancestorScreenshotUrl?: string | null;
  ancestorDom?: string | null;
};

function getInspectSelections(result: RecorderInspectResult): RecorderInspectSelection[] {
  return result.selections?.length
    ? result.selections
    : [{
        element: result.element,
        element_screenshot_url: result.element_screenshot_url,
        ancestor_screenshot_url: result.ancestor_screenshot_url
      }];
}

function buildRepositoryFieldFromInspectSelection(result: RecorderInspectResult, selection: RecorderInspectSelection): RepositoryExtractedField {
  const candidates = getCapturedLocatorsForElement(selection.element);
  const primaryLocator = candidates[0] || {
    locator: selection.element.locator,
    strategy: inferLocatorStrategy(selection.element.locator, selection.element.locator_kind),
    confidenceScore: 0.75,
    isPrimary: true,
    lastValidatedStatus: "pending"
  };

  return {
    name: selection.element.friendly_name,
    tag: selection.element.html_tag,
    role: selection.element.role,
    locator: primaryLocator.locator,
    locatorKind: primaryLocator.strategy,
    dom: selection.element.dom_structure,
    fallbackLocators: candidates.slice(1),
    source: "live_inspect",
    pageUrl: result.page_url,
    targetCriteria: selection.element.text,
    elementScreenshotUrl: selection.element_screenshot_url || result.element_screenshot_url,
    ancestorScreenshotUrl: selection.ancestor_screenshot_url || result.ancestor_screenshot_url,
    ancestorDom: selection.element.ancestor_dom,
    description: `${selection.element.friendly_name} captured during live inspection.`
  };
}

function parseAutomationStepDraft(step: TestStep): AutomationStepDraft {
  const code = step.automation_code || "";
  const match = code.match(/(?:await\s+)?((?:web|api|android|mobile)\.\w+)\(([\s\S]*)\)/);
  const stepType = inferAutomationStepType(match?.[1], step.step_type || "web");
  const keyword = match?.[1] && AUTOMATION_KEYWORDS_BY_TYPE[stepType].includes(match[1])
    ? match[1]
    : AUTOMATION_KEYWORDS_BY_TYPE[stepType][0];
  const args = match?.[2] || "";
  const quoted = Array.from(args.matchAll(/(['"`])([\s\S]*?)\1/g)).map((item) => item[2]);

  return {
    step_type: stepType,
    name: step.action || "",
    keyword,
    objectRef: quoted[0] || "",
    value: quoted[1] || "",
    expected_result: step.expected_result || ""
  };
}

function buildAutomationCodeFromDraft(draft: AutomationStepDraft) {
  const q = (value: string) => JSON.stringify(value);
  const objectRef = draft.objectRef.trim();
  const targetRef = objectRef || "Page.element";
  const value = draft.value.trim();
  if (draft.keyword.startsWith("api.")) {
    if (draft.keyword === "api.expectStatus") {
      return `await api.expectStatus(${Number(value || objectRef) || 200});`;
    }
    if (draft.keyword === "api.expectJson") {
      return `await api.expectJson(${q(targetRef)}, ${q(value || "@r.response")});`;
    }
    if (draft.keyword === "api.capture") {
      return `await api.capture(${q(targetRef)}, ${q(value || "@r.capture")});`;
    }
    return `await api.request(${q(objectRef || "GET /")}${value ? `, ${q(value)}` : ""});`;
  }
  if (draft.keyword.startsWith("android.") || draft.keyword.startsWith("mobile.")) {
    const keyword = draft.keyword.replace(/^mobile\./, "android.");
    if (["android.type", "android.expectText", "android.expectValue", "android.pushFile", "android.pushRemoteFile", "android.startActivity", "android.openDeepLink", "android.deepLink"].includes(keyword)) {
      return `await ${keyword}(${q(targetRef)}, ${q(value || (keyword === "android.pushFile" ? "/path/to/local-file" : ""))});`;
    }
    if (["android.longPress", "android.waitForDisplayed", "android.waitForExist", "android.waitForEnabled", "android.expectNotDisplayed"].includes(keyword)) {
      return `await ${keyword}(${q(targetRef)}, ${Number(value) || 10000});`;
    }
    if (keyword === "android.swipe") {
      const points = (value || objectRef || "500,1500,500,500,300").split(",").map((item) => Number(item.trim()) || 0);
      return `await android.swipe(${points[0] || 500}, ${points[1] || 1500}, ${points[2] || 500}, ${points[3] || 500}, ${points[4] || 300});`;
    }
    if (keyword === "android.pause" || keyword === "android.pressKeyCode" || keyword === "android.backgroundApp") {
      return `await ${keyword}(${Number(value || objectRef) || (keyword === "android.pressKeyCode" ? 66 : 1000)});`;
    }
    return `await ${keyword}(${q(targetRef)});`;
  }
  if (["web.goto", "web.expectUrl", "web.openTab"].includes(draft.keyword)) {
    return `await ${draft.keyword}(${q(value || objectRef || "/")});`;
  }
  if (draft.keyword === "web.wait" || draft.keyword === "web.waitForTimeout") {
    return `await web.wait(${Math.max(0, Number.parseInt(value || objectRef, 10) || 1000)});`;
  }
  if (draft.keyword === "web.waitForLoadState") {
    return `await web.waitForLoadState(${q(value || objectRef || "domcontentloaded")});`;
  }
  if (draft.keyword === "web.scroll") {
    const [deltaX, deltaY] = (value || objectRef || "0,600").split(",").map((item) => Number(item.trim()) || 0);
    return `await web.scroll(${deltaX || 0}, ${deltaY || 600});`;
  }
  if (draft.keyword === "web.press") {
    return objectRef
      ? `await web.press(${q(objectRef)}, ${q(value || "Tab")});`
      : `await web.press(null, ${q(value || "Tab")});`;
  }
  if (["web.uploadFile", "web.uploadLocalFile"].includes(draft.keyword)) {
    return `await ${draft.keyword}(${q(targetRef)}, ${q(value || "@t.uploadFilePath")}, { waitFor: "attached" });`;
  }
  if (draft.keyword === "web.uploadRemoteFile") {
    return `await web.uploadRemoteFile(${q(targetRef)}, ${q(value || "https://example.com/file.png")}, { waitFor: "attached" });`;
  }
  if (["web.fill", "web.select", "web.expectText", "web.expectValue", "web.captureText"].includes(draft.keyword)) {
    return `await ${draft.keyword}(${q(targetRef)}, ${q(value)});`;
  }
  if (draft.keyword === "web.screenshot") {
    return `await web.screenshot(${q(value || objectRef || "automation-step")});`;
  }
  if (["web.switchTab", "web.closeTab"].includes(draft.keyword)) {
    return `await ${draft.keyword}(${q(value || objectRef || "latest")});`;
  }
  return `await ${draft.keyword}(${q(targetRef)});`;
}

function escapeAutomationPdfHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function AutomationPage({ initialView = "cases" }: { initialView?: AutomationView } = {}) {
  const { session } = useAuth();
  const { getPrompt } = useAiPromptRegistry(Boolean(session));
  const featureFlagsQuery = useFeatureFlags(Boolean(session));
  const canUseAutomationBuilder = hasPermission(session, "automation.build")
    && areFeatureFlagsEnabled(featureFlagsQuery.data, ["qaira.automation.builder"]);
  const canUseAutomationAi = hasPermission(session, "automation.ai")
    && areFeatureFlagsEnabled(featureFlagsQuery.data, ["qaira.ai.automation"]);
  const canUseRecorder = hasPermission(session, "automation.recorder")
    && areFeatureFlagsEnabled(featureFlagsQuery.data, ["qaira.automation.step_recording"]);
  const canRunLocalAutomation = hasPermission(session, "automation.run.local")
    && areFeatureFlagsEnabled(featureFlagsQuery.data, ["qaira.automation.local_execution"]);
  const canRunRemoteAutomation = hasPermission(session, "automation.run.remote")
    && areFeatureFlagsEnabled(featureFlagsQuery.data, ["qaira.automation.remote_execution"]);
  const canViewAutomationCode = hasPermission(session, "automation.code.view")
    && areFeatureFlagsEnabled(featureFlagsQuery.data, ["qaira.automation.step_code"]);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [projectId] = useCurrentProject();
  const [appTypeId, setAppTypeId] = useCurrentAppType(projectId);
  const [view, setView] = useState<AutomationView>(initialView);
  const [selectedAutomatedCaseId, setSelectedAutomatedCaseId] = useState("");
  const [selectedManualCaseId, setSelectedManualCaseId] = useState("");
  const [selectedCaseId, setSelectedCaseId] = useState("");
  const [automationCatalogViewMode, setAutomationCatalogViewMode] = useState<"tile" | "list">(() => readDefaultCatalogViewMode());
  const [automationCaseSearch, setAutomationCaseSearch] = useState("");
  const [selectedAutomationCaseIds, setSelectedAutomationCaseIds] = useState<string[]>([]);
  const [expandedCaseSections, setExpandedCaseSections] = useState<Record<AutomationCaseSectionKey, boolean>>({
    case: true,
    steps: true,
    history: false
  });
  const [automationStepView, setAutomationStepView] = useState<AutomationStepView>("keyword");
  const [expandedAutomationStepIds, setExpandedAutomationStepIds] = useState<string[]>([]);
  const [caseDraft, setCaseDraft] = useState<AutomationCaseDraft>({
    title: "",
    description: "",
    status: "active",
    priority: "3",
    parameterText: ""
  });
  const [stepDrafts, setStepDrafts] = useState<Record<string, AutomationStepDraft>>({});
  const [stepCodeDrafts, setStepCodeDrafts] = useState<Record<string, string>>({});
  const [isParameterDialogOpen, setIsParameterDialogOpen] = useState(false);
  const [testCaseParameterValues, setTestCaseParameterValues] = useState<Record<string, string>>({});
  const [suiteParameterValues, setSuiteParameterValues] = useState<Record<string, string>>({});
  const [selectedParameterSuiteId, setSelectedParameterSuiteId] = useState("");
  const [suiteLinkDraftIds, setSuiteLinkDraftIds] = useState<string[]>([]);
  const [executionHookDraft, setExecutionHookDraft] = useState<RunHookSelection[]>([]);
  const [stepOptionDrafts, setStepOptionDrafts] = useState<Record<string, AutomationStepOptions>>({});
  const [newStepDraft, setNewStepDraft] = useState<AutomationStepDraft>(() => emptyAutomationStepDraft("web"));
  const [newStepPlacement, setNewStepPlacement] = useState<{ mode: "end" | "before" | "after"; stepId: string }>({ mode: "end", stepId: "" });
  const [startUrl, setStartUrl] = useState("");
  const [builderContext, setBuilderContext] = useState("");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "error" | "info">("success");
  const [recorderSession, setRecorderSession] = useState<RecorderSessionResponse | null>(null);
  const [recorderStartOptions, setRecorderStartOptions] = useState<RecorderStartOptions | null>(null);
  const [inspectRecorderSession, setInspectRecorderSession] = useState<RecorderSessionResponse | null>(null);
  const [isLaunchingInspectBrowser, setIsLaunchingInspectBrowser] = useState(false);
  const [highlightedRepositoryId, setHighlightedRepositoryId] = useState("");
  const [selectedRepositoryId, setSelectedRepositoryId] = useState("");
  const [selectedScreenName, setSelectedScreenName] = useState("");
  const [screenRenameDraft, setScreenRenameDraft] = useState("");
  const [renamingScreenName, setRenamingScreenName] = useState("");
  const [isRepositoryImportModalOpen, setIsRepositoryImportModalOpen] = useState(false);
  const [repositoryImportPreview, setRepositoryImportPreview] = useState<ObjectRepositoryImportPreview | null>(null);
  const [isParsingRepositoryImport, setIsParsingRepositoryImport] = useState(false);
  const [locatorImprovementPreview, setLocatorImprovementPreview] = useState<Awaited<ReturnType<typeof api.testCases.improveLearningCacheEntry>> | null>(null);
  const [isAddingRepositoryScreen, setIsAddingRepositoryScreen] = useState(false);
  const [newRepositoryScreenDraft, setNewRepositoryScreenDraft] = useState({
    screen_name: "",
    page_url: "",
    url_pattern_type: "contains",
    url_pattern_value: "",
    description: "",
    business_meaning: "",
    dom_structure: "",
    screenshot_url: ""
  });
  const [isAddingRepositoryField, setIsAddingRepositoryField] = useState(false);
  const [newRepositoryFieldDraft, setNewRepositoryFieldDraft] = useState({
    screen_name: "",
    object_name: "",
    object_role: "field",
    locator: "",
    locator_kind: "css"
  });
  const [screenDetailTab, setScreenDetailTab] = useState<RepositoryScreenTab>("overview");
  const [fieldDetailTab, setFieldDetailTab] = useState<RepositoryFieldTab>("locators");
  const [isRepositoryConfigOpen, setIsRepositoryConfigOpen] = useState(true);
  const [repositoryConfigDrawerWidth, setRepositoryConfigDrawerWidth] = useState(REPOSITORY_CONFIG_DRAWER_DEFAULT_WIDTH);
  const [isInspectOpen, setIsInspectOpen] = useState(false);
  const [inspectTabs, setInspectTabs] = useState<RecorderTab[]>([]);
  const [selectedInspectTabId, setSelectedInspectTabId] = useState("");
  const [isInspectingLiveField, setIsInspectingLiveField] = useState(false);
  const [inspectMessage, setInspectMessage] = useState("");
  const [browserInspectFields, setBrowserInspectFields] = useState<RepositoryExtractedField[]>([]);
  const [aiSuggestedInspectFields, setAiSuggestedInspectFields] = useState<RepositoryExtractedField[]>([]);
  const [stagedInspectFields, setStagedInspectFields] = useState<RepositoryExtractedField[]>([]);
  const stagedInspectFieldsRef = useRef<RepositoryExtractedField[]>([]);
  const [repositoryUsageBlock, setRepositoryUsageBlock] = useState<{
    title: string;
    usage: Array<{ id: string; display_id?: string | null; title: string; automated?: "yes" | "no" | null }>;
    kind: "field" | "screen";
  } | null>(null);
  const [screenDomDraft, setScreenDomDraft] = useState("");
  const [screenScreenshotDraft, setScreenScreenshotDraft] = useState("");
  const [screenUrlDraft, setScreenUrlDraft] = useState("");
  const [screenInfoDraft, setScreenInfoDraft] = useState({
    screen_name: "",
    url_pattern_type: "contains",
    url_pattern_value: "",
    screen_fingerprint: "",
    accessibility_tree: "",
    description: "",
    business_meaning: ""
  });
  const [screenExtractionDraft, setScreenExtractionDraft] = useState<{
    intendedFlows: string[];
    aiUsed: boolean;
    fallbackReason: string | null;
    extractedAt: string;
  } | null>(null);
  const [repositoryDraft, setRepositoryDraft] = useState({
    screen_name: "",
    object_name: "",
    object_role: "",
    locator: "",
    locator_kind: "",
    target_criteria: "",
    dom_structure: "",
    screenshot_url: "",
    fallback_strategy: "",
    url_pattern_type: "contains",
    url_pattern_value: "",
    screen_fingerprint: "",
    accessibility_tree: "",
    fallback_locators: "",
    description: "",
    business_meaning: "",
    usage_keywords: "",
    stability_score: "80",
    ancestor_dom: "",
    ancestor_screenshot_url: "",
    element_screenshot_url: ""
  });

  const handleRepositoryConfigResizeStart = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = repositoryConfigDrawerWidth;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const viewportMaxWidth = Math.max(
        REPOSITORY_CONFIG_DRAWER_MIN_WIDTH,
        Math.min(REPOSITORY_CONFIG_DRAWER_MAX_WIDTH, window.innerWidth - 420)
      );
      const nextWidth = Math.min(viewportMaxWidth, clampRepositoryConfigDrawerWidth(startWidth + startX - moveEvent.clientX));
      setRepositoryConfigDrawerWidth(nextWidth);
    };

    const handlePointerUp = () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }, [repositoryConfigDrawerWidth]);

  const handleRepositoryConfigResizeKeyDown = useCallback((event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setRepositoryConfigDrawerWidth((current) => clampRepositoryConfigDrawerWidth(current + 24));
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      setRepositoryConfigDrawerWidth((current) => clampRepositoryConfigDrawerWidth(current - 24));
    } else if (event.key === "Home") {
      event.preventDefault();
      setRepositoryConfigDrawerWidth(REPOSITORY_CONFIG_DRAWER_MIN_WIDTH);
    } else if (event.key === "End") {
      event.preventDefault();
      setRepositoryConfigDrawerWidth(REPOSITORY_CONFIG_DRAWER_MAX_WIDTH);
    }
  }, []);

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: api.projects.list,
    enabled: Boolean(session)
  });
  const appTypesQuery = useQuery({
    queryKey: ["app-types", projectId],
    queryFn: () => api.appTypes.list({ project_id: projectId }),
    enabled: Boolean(projectId && session)
  });
  const testCasesQuery = useQuery({
    queryKey: ["test-cases", "automation-workspace", appTypeId],
    queryFn: () => api.testCases.list({ app_type_id: appTypeId }),
    enabled: Boolean(appTypeId && session)
  });
  const learningCacheQuery = useQuery({
    queryKey: ["automation-learning-cache", "automation-workspace", projectId, appTypeId],
    queryFn: async () => {
      const queryScope = projectId
        ? { project_id: projectId }
        : { app_type_id: appTypeId || undefined };
      const rows: AutomationLearningCacheEntry[] = [];

      for (let offset = 0; ; offset += REPOSITORY_PAGE_SIZE) {
        const page = await api.testCases.learningCache({
          ...queryScope,
          limit: REPOSITORY_PAGE_SIZE,
          offset
        });
        rows.push(...page);

        if (page.length < REPOSITORY_PAGE_SIZE) {
          break;
        }
      }

      return rows;
    },
    enabled: Boolean((projectId || appTypeId) && session)
  });
  const automatedStepsQuery = useQuery({
    queryKey: ["test-steps", "automation-workspace", selectedCaseId],
    queryFn: () => api.testSteps.list({ test_case_id: selectedCaseId }),
    enabled: Boolean(selectedCaseId && session)
  });
  const executionResultsQuery = useQuery({
    queryKey: ["execution-results", "automation-workspace", appTypeId],
    queryFn: () => api.executionResults.list({ app_type_id: appTypeId }),
    enabled: Boolean(appTypeId && session)
  });
  const suitesQuery = useQuery({
    queryKey: ["test-case-suites", appTypeId],
    queryFn: () => api.testSuites.list({ app_type_id: appTypeId }),
    enabled: Boolean(appTypeId && session)
  });

  const projects = projectsQuery.data || [];
  const appTypes = appTypesQuery.data || [];
  const testCases = testCasesQuery.data || [];
  const learningCache = learningCacheQuery.data || [];
  const suites = suitesQuery.data || [];
  const automatedCases = useMemo(() => testCases.filter(isAutomatedCase), [testCases]);
  const automationDisplayIdByCaseId = useMemo(
    () => automatedCases.reduce<Record<string, string>>((accumulator, testCase, index) => {
      accumulator[testCase.id] = formatAutomationCaseId(index);
      return accumulator;
    }, {}),
    [automatedCases]
  );
  const manualCases = useMemo(() => testCases.filter(isManualCase), [testCases]);
  const activeAutomatedCase = automatedCases.find((testCase) => testCase.id === selectedAutomatedCaseId) || automatedCases[0] || null;
  const activeCase = automatedCases.find((testCase) => testCase.id === selectedCaseId) || null;
  const isAutomationCaseWorkspaceOpen = Boolean(activeCase);
  const activeManualCase = testCases.find((testCase) => testCase.id === selectedManualCaseId) || activeCase || manualCases[0] || automatedCases[0] || null;
  const automatedSteps = automatedStepsQuery.data || [];
  const executionResults = executionResultsQuery.data || [];
  const historyByCaseId = useMemo(() => {
    const map: Record<string, ExecutionResult[]> = {};

    executionResults.forEach((result) => {
      map[result.test_case_id] = map[result.test_case_id] || [];
      map[result.test_case_id].push(result);
    });

    Object.values(map).forEach((items) => {
      items.sort((left, right) => String(right.created_at || "").localeCompare(String(left.created_at || "")));
    });

    return map;
  }, [executionResults]);
  const filteredAutomationCases = useMemo(() => {
    const normalizedSearch = automationCaseSearch.trim().toLowerCase();

    if (!normalizedSearch) {
      return automatedCases;
    }

    return automatedCases.filter((testCase) => {
      const history = historyByCaseId[testCase.id] || [];
      const searchContent = [
        testCase.id,
        testCase.display_id,
        automationDisplayIdByCaseId[testCase.id],
        testCase.title,
        testCase.description,
        testCase.status,
        testCase.automation_status,
        `p${testCase.priority || 3}`,
        `${history.length} runs`
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchContent.includes(normalizedSearch);
    });
  }, [automatedCases, automationCaseSearch, automationDisplayIdByCaseId, historyByCaseId]);
  const activeAutomationCaseSearchCount = automationCaseSearch.trim() ? 1 : 0;
  const areAllFilteredAutomationCasesSelected =
    Boolean(filteredAutomationCases.length) && filteredAutomationCases.every((testCase) => selectedAutomationCaseIds.includes(testCase.id));
  const activeCaseHistory = activeCase ? historyByCaseId[activeCase.id] || [] : [];
  const activeCaseSuiteIds = useMemo(() => activeCase?.suite_ids || (activeCase?.suite_id ? [activeCase.suite_id] : []), [activeCase]);
  const selectedParameterSuite = suites.find((suite) => suite.id === selectedParameterSuiteId) || null;
  const mergedParameterValues = useMemo(
    () => combineStepParameterValues(testCaseParameterValues, suiteParameterValues),
    [suiteParameterValues, testCaseParameterValues]
  );
  const detectedStepParameters = useMemo(
    () => collectStepParameters(automatedSteps.map((step) => ({
      id: step.id,
      action: stepDrafts[step.id] ? buildAutomationCodeFromDraft(stepDrafts[step.id]) : step.action,
      expected_result: stepDrafts[step.id]?.expected_result ?? step.expected_result,
      automation_code: stepCodeDrafts[step.id] ?? step.automation_code,
      api_request: step.api_request
    }))),
    [automatedSteps, stepCodeDrafts, stepDrafts]
  );
  const automationStepGroups = useMemo(() => {
    const standaloneGroup = {
      id: "standalone",
      title: "Standalone automation keywords",
      subtitle: "Automation keywords without a manual step name.",
      steps: [] as TestStep[],
      isStandalone: true
    };
    const groupMap = new Map<string, { id: string; title: string; subtitle: string; steps: TestStep[]; isStandalone: boolean }>();

    automatedSteps.forEach((step) => {
      const manualStepTitle = (step.action || "").trim();
      if (!manualStepTitle) {
        standaloneGroup.steps.push(step);
        return;
      }

      const groupKey = step.group_id || step.id;
      const existingGroup = groupMap.get(groupKey);

      if (existingGroup) {
        existingGroup.steps.push(step);
        return;
      }

      groupMap.set(groupKey, {
        id: `manual-${groupKey}`,
        title: step.group_name || manualStepTitle,
        subtitle: `Manual step ${step.step_order}${step.group_name ? ` · ${manualStepTitle}` : ""}`,
        steps: [step],
        isStandalone: false
      });
    });

    const groups = Array.from(groupMap.values()).map((group) => ({
      ...group,
      steps: [...group.steps].sort((left, right) => left.step_order - right.step_order)
    }));

    return standaloneGroup.steps.length ? [...groups, standaloneGroup] : groups;
  }, [automatedSteps]);
  const newStepPlacementTarget = useMemo(
    () => newStepPlacement.mode !== "end" && newStepPlacement.stepId
      ? automatedSteps.find((step) => step.id === newStepPlacement.stepId) || null
      : null,
    [automatedSteps, newStepPlacement]
  );
  const newStepPlacementLabel = newStepPlacementTarget
    ? `${newStepPlacement.mode === "before" ? "Insert before" : "Add after"} ${newStepPlacementTarget.group_name || newStepPlacementTarget.action || `step ${newStepPlacementTarget.step_order}`}`
    : "";
  const inlineTestDataGroups = useMemo(() => {
    const buildRows = (scope: StepParameterScope, values: Record<string, string>) => {
      const names = new Set<string>(Object.keys(values));
      detectedStepParameters
        .filter((parameter) => parameter.scope === scope)
        .forEach((parameter) => names.add(parameter.name));

      return Array.from(names)
        .sort((left, right) => left.localeCompare(right))
        .map((name) => {
          const parsed = parseStepParameterName(name, scope);
          return {
            name: parsed?.name || name,
            token: parsed?.token || `@${name.replace(/^@/, "")}`,
            value: values[parsed?.name || name] || "",
            locked: scope === "r"
          };
        });
    };

    return [
      { scope: "t" as const, title: "Test case data", rows: buildRows("t", testCaseParameterValues) },
      { scope: "s" as const, title: selectedParameterSuite ? `Suite data · ${selectedParameterSuite.name}` : "Suite-shared data", rows: buildRows("s", suiteParameterValues) },
      { scope: "r" as const, title: "Run data", rows: buildRows("r", {}) }
    ].filter((group) => group.rows.length);
  }, [detectedStepParameters, selectedParameterSuite, suiteParameterValues, testCaseParameterValues]);
  const completeAutomationCode = useMemo(() => {
    const parameterLines = Object.entries(mergedParameterValues)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `// ${key} = ${value || "<empty>"}`);
    const stepLines = automationStepGroups.flatMap((group) => [
      `// ${group.isStandalone ? group.title : `Manual step: ${group.title}`}`,
      ...group.steps.map((step) => {
        const draft = stepDrafts[step.id] || parseAutomationStepDraft(step);
        return stepCodeDrafts[step.id] || step.automation_code || buildAutomationCodeFromDraft(draft);
      })
    ]);

    return [
      `// Automation case: ${activeCase?.display_id || activeCase?.id || "selected-case"} ${activeCase?.title || ""}`.trim(),
      parameterLines.length ? "// Data references" : "",
      ...parameterLines,
      parameterLines.length ? "" : "",
      "export async function runAutomation({ web, api, mobile }) {",
      ...stepLines.map((line) => `  ${line}`),
      "}"
    ].filter((line) => line !== "").join("\n");
  }, [activeCase?.display_id, activeCase?.id, activeCase?.title, automationStepGroups, mergedParameterValues, stepCodeDrafts, stepDrafts]);

  const exportAutomationCasePdf = () => {
    if (!activeCase) {
      showError(new Error("Select an automation case before exporting."), "Unable to export automation case.");
      return;
    }

    const metadataRows = [
      ["Case", `${activeCase.display_id || activeCase.id} · ${activeCase.title}`],
      ["Status", activeCase.status || "active"],
      ["Priority", `P${activeCase.priority || 3}`],
      ["Automation", activeCase.automation_status || "ready"],
      ["Suites", activeCaseSuiteIds.length ? activeCaseSuiteIds.join(", ") : "None"],
      ["Requirement", activeCase.requirement_id || "Not linked"]
    ];
    const testDataRows = inlineTestDataGroups.flatMap((group) =>
      group.rows.map((row) => [group.title, row.token, row.locked ? "Supplied at run time" : row.value || "(empty)"])
    );
    const stepSections = automationStepGroups.map((group) => {
      const rows = group.steps.map((step) => {
        const draft = stepDrafts[step.id] || parseAutomationStepDraft(step);
        const variables = extractVariables(step);
        return `
          <tr>
            <td>${escapeAutomationPdfHtml(step.step_order)}</td>
            <td>${escapeAutomationPdfHtml(formatAutomationKeywordReadable(draft, variables))}</td>
            <td><code>${escapeAutomationPdfHtml(draft.objectRef || "No locator")}</code></td>
            <td><code>${escapeAutomationPdfHtml(draft.value || "No data reference")}</code></td>
            <td><pre>${escapeAutomationPdfHtml(stepCodeDrafts[step.id] || step.automation_code || buildAutomationCodeFromDraft(draft))}</pre></td>
          </tr>
        `;
      }).join("");

      return `
        <section>
          <h2>${escapeAutomationPdfHtml(group.isStandalone ? group.title : `Manual step: ${group.title}`)}</h2>
          <p>${escapeAutomationPdfHtml(group.subtitle)}</p>
          <table>
            <thead><tr><th>Step</th><th>Keyword</th><th>Locator</th><th>Data reference</th><th>Code</th></tr></thead>
            <tbody>${rows || "<tr><td colspan=\"5\">No automation keywords.</td></tr>"}</tbody>
          </table>
        </section>
      `;
    }).join("");
    const printable = window.open("", "_blank", "noopener,noreferrer,width=1100,height=900");

    if (!printable) {
      showError(new Error("Allow pop-ups to export the automation case PDF."), "Unable to open PDF export.");
      return;
    }

    printable.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>${escapeAutomationPdfHtml(activeCase.title)} automation export</title>
          <style>
            body { color: #111827; font: 13px/1.45 Inter, Arial, sans-serif; margin: 32px; }
            h1 { font-size: 24px; margin: 0 0 6px; }
            h2 { border-bottom: 1px solid #d8dee8; font-size: 17px; margin: 28px 0 8px; padding-bottom: 6px; }
            p { color: #526071; margin: 0 0 14px; }
            table { border-collapse: collapse; margin: 10px 0 18px; width: 100%; }
            th, td { border: 1px solid #d8dee8; padding: 8px; text-align: left; vertical-align: top; }
            th { background: #f3f6fb; font-size: 11px; text-transform: uppercase; }
            code, pre { background: #f8fafc; border-radius: 6px; color: #0f172a; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
            code { padding: 2px 4px; }
            pre { margin: 0; max-width: 100%; overflow-wrap: anywhere; padding: 8px; white-space: pre-wrap; }
            .meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 18px; }
            .meta div { border: 1px solid #d8dee8; border-radius: 8px; padding: 9px; }
            .meta span { color: #64748b; display: block; font-size: 11px; text-transform: uppercase; }
            .meta strong { display: block; margin-top: 3px; }
            @media print { body { margin: 18mm; } button { display: none; } }
          </style>
        </head>
        <body>
          <h1>${escapeAutomationPdfHtml(activeCase.title)}</h1>
          <p>${escapeAutomationPdfHtml(richTextToPlainText(activeCase.description) || "No description recorded.")}</p>
          <section class="meta">
            ${metadataRows.map(([label, value]) => `<div><span>${escapeAutomationPdfHtml(label)}</span><strong>${escapeAutomationPdfHtml(value)}</strong></div>`).join("")}
          </section>
          <section>
            <h2>Test data</h2>
            <table>
              <thead><tr><th>Scope</th><th>Token</th><th>Value</th></tr></thead>
              <tbody>
                ${testDataRows.length ? testDataRows.map(([scope, token, value]) => `<tr><td>${escapeAutomationPdfHtml(scope)}</td><td><code>${escapeAutomationPdfHtml(token)}</code></td><td>${escapeAutomationPdfHtml(value)}</td></tr>`).join("") : "<tr><td colspan=\"3\">No test data references detected.</td></tr>"}
              </tbody>
            </table>
          </section>
          ${stepSections}
          <section>
            <h2>Complete automation code</h2>
            <pre>${escapeAutomationPdfHtml(completeAutomationCode)}</pre>
          </section>
          <script>window.addEventListener("load", () => { window.focus(); window.print(); });</script>
        </body>
      </html>
    `);
    printable.document.close();
    showSuccess("Automation case PDF export opened.");
  };
  const groupedRepository = useMemo(() => {
    const grouped = new Map<string, AutomationLearningCacheEntry[]>();

    learningCache.forEach((entry) => {
      const screenKey = getRepositoryScreenKey(entry);
      grouped.set(screenKey, [...(grouped.get(screenKey) || []), entry]);
    });

    return Array.from(grouped.entries()).sort(([, leftEntries], [, rightEntries]) =>
      getScreenName(leftEntries[0]).localeCompare(getScreenName(rightEntries[0]))
    );
  }, [learningCache]);
  const activeScreenEntries = useMemo(() => {
    const selected = groupedRepository.find(([screenKey]) => screenKey === selectedScreenName);
    return selected?.[1] || groupedRepository[0]?.[1] || [];
  }, [groupedRepository, selectedScreenName]);
  const activeScreenKey = groupedRepository.find(([screenKey]) => screenKey === selectedScreenName)?.[0] || groupedRepository[0]?.[0] || "";
  const activeScreenName = activeScreenEntries.length ? getScreenName(activeScreenEntries[0]) : "";
  const activeScreenRecord = activeScreenEntries.find(isScreenRepositoryRecord) || activeScreenEntries[0] || null;
  const selectedRepositoryEntry = activeScreenEntries.find((entry) => entry.id === selectedRepositoryId && !isNonElementRepositoryEntry(entry))
    || activeScreenEntries.find((entry) => !isNonElementRepositoryEntry(entry))
    || null;
  const activeRepositoryAppTypeId = activeScreenRecord?.app_type_id
    || selectedRepositoryEntry?.app_type_id
    || activeScreenEntries.find((entry) => entry.app_type_id)?.app_type_id
    || appTypeId
    || "";
  const activeRepositoryProjectId = activeScreenRecord?.project_id
    || selectedRepositoryEntry?.project_id
    || activeScreenEntries.find((entry) => entry.project_id)?.project_id
    || projectId
    || "";
  const pageObjectModels = useMemo(() => {
    return groupedRepository.map(([screenKey, entries]) => {
      const screenName = getScreenName(entries[0]);
      const screenAppTypeId = entries.find((entry) => entry.app_type_id)?.app_type_id || "";
      const members = entries.filter((entry) => !isNonElementRepositoryEntry(entry)).map((entry) => ({
        entry,
        pageName: screenName,
        memberName: entry.id === selectedRepositoryId && repositoryDraft.object_name.trim() ? repositoryDraft.object_name.trim() : getRepositoryMemberName(entry),
        htmlTag: entry.id === selectedRepositoryId && repositoryDraft.object_role.trim() ? splitRepositoryRole(repositoryDraft.object_role, getRepositoryHtmlTag(entry), getObjectRole(entry)).tag : getRepositoryHtmlTag(entry),
        role: entry.id === selectedRepositoryId && repositoryDraft.object_role.trim() ? splitRepositoryRole(repositoryDraft.object_role, getRepositoryHtmlTag(entry), getObjectRole(entry)).role : getObjectRole(entry),
        ref: `${screenName}.${entry.id === selectedRepositoryId && repositoryDraft.object_name.trim() ? repositoryDraft.object_name.trim() : getRepositoryMemberName(entry)}`
      }));

      return {
        screenName: screenKey,
        pageName: screenName,
        appTypeId: screenAppTypeId,
        url: getRepositoryScreenUrl(entries),
        members
      };
    });
  }, [groupedRepository, repositoryDraft.object_name, repositoryDraft.object_role, selectedRepositoryId]);
  const activePageObject = pageObjectModels.find((page) => page.screenName === selectedScreenName) || pageObjectModels[0] || null;
  const allObjectMembers = useMemo(() => pageObjectModels.flatMap((page) => page.members), [pageObjectModels]);
  const inspectedFields = useMemo(() => extractRepositoryFieldsFromDom(screenDomDraft), [screenDomDraft]);
  const suggestedInspectFields = useMemo(() => {
    const byLocator = new Map<string, RepositoryExtractedField>();
    inspectedFields.forEach((field) => byLocator.set(field.locator, { ...field, source: "dom_candidate" }));
    aiSuggestedInspectFields.forEach((field) => byLocator.set(field.locator, { ...field, source: "ai_extract" }));
    return Array.from(byLocator.values());
  }, [aiSuggestedInspectFields, inspectedFields]);
  const recorderLiveUrl = recorderSession?.live_view_url || "";
  const inspectRecorderLiveUrl = inspectRecorderSession?.live_view_url || "";
  const selectedLocators = selectedRepositoryEntry ? getRepositoryLocators(selectedRepositoryEntry) : [];
  const selectedLocatorReviewReadiness = useMemo(() => assessLocatorReviewReadiness({
    stabilityScore: Number.isFinite(Number(repositoryDraft.stability_score))
      ? Number(repositoryDraft.stability_score)
      : Math.round((selectedRepositoryEntry?.confidence || 0) * 100),
    locatorCount: selectedLocators.length,
    hasDomEvidence: Boolean(screenDomDraft.trim() || normalizeMetadataValue(selectedRepositoryEntry?.metadata?.ancestor_dom)),
    hasVisualEvidence: Boolean(screenScreenshotDraft.trim() || repositoryDraft.element_screenshot_url.trim()),
    hasValidationHistory: Boolean(
      normalizeMetadataValue(selectedRepositoryEntry?.metadata?.last_validated_at)
      || normalizeMetadataValue(selectedRepositoryEntry?.metadata?.last_validated_status)
      || (Array.isArray(selectedRepositoryEntry?.metadata?.validation_history) && selectedRepositoryEntry.metadata.validation_history.length)
    )
  }), [repositoryDraft.element_screenshot_url, repositoryDraft.stability_score, screenDomDraft, screenScreenshotDraft, selectedLocators.length, selectedRepositoryEntry]);

  const syncRepositorySearchParams = useCallback((repositoryId?: string | null) => {
    const targetRepositoryId = repositoryId || "";

    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (targetRepositoryId) {
        next.delete("case");
        next.set("repository", targetRepositoryId);
      } else {
        next.delete("repository");
      }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const selectRepositoryEntry = useCallback((repositoryId: string, screenName?: string) => {
    if (screenName && screenName !== selectedScreenName) {
      setSelectedScreenName(screenName);
    }

    setSelectedRepositoryId(repositoryId);
    setFieldDetailTab("locators");
    setIsRepositoryConfigOpen(true);
    syncRepositorySearchParams(repositoryId);
  }, [selectedScreenName, syncRepositorySearchParams]);

  const openRepositoryInspect = (page: typeof activePageObject = activePageObject) => {
    const targetPage = page || activePageObject;
    if (targetPage?.screenName) {
      if (targetPage.screenName !== selectedScreenName) {
        setAiSuggestedInspectFields([]);
      }
      setSelectedScreenName(targetPage.screenName);
      setScreenInfoDraft((current) => ({
        ...current,
        screen_name: targetPage.pageName
      }));
    }
    if (targetPage?.url && targetPage.url !== "No URL captured") {
      setScreenUrlDraft(targetPage.url);
    }
    setIsInspectOpen(true);
    setInspectMessage(inspectRecorderSession?.status === "running"
      ? `Inspecting ${targetPage?.pageName || "the selected screen"}. Select an open tab, then capture or highlight fields.`
      : `Connect a local browser to inspect ${targetPage?.pageName || "the selected screen"} and capture fields.`);
  };

  useEffect(() => {
    setView(initialView);
  }, [initialView]);

  useEffect(() => {
    setSelectedAutomationCaseIds((current) =>
      current.filter((testCaseId) => automatedCases.some((testCase) => testCase.id === testCaseId))
    );
  }, [automatedCases]);

  useEffect(() => {
    stagedInspectFieldsRef.current = stagedInspectFields;
  }, [stagedInspectFields]);

  useEffect(() => {
    if (appTypesQuery.isPending) {
      return;
    }

    const scopedAppTypes = projectId ? appTypes.filter((appType) => String(appType.project_id) === String(projectId)) : appTypes;

    if (!scopedAppTypes.length) {
      setAppTypeId("");
      return;
    }

    if (!scopedAppTypes.some((appType) => appType.id === appTypeId)) {
      setAppTypeId(scopedAppTypes[0].id);
      setSelectedAutomatedCaseId("");
      setSelectedCaseId("");
      setSelectedManualCaseId("");
      setRecorderSession(null);
    }
  }, [appTypeId, appTypes, appTypesQuery.isPending, projectId, setAppTypeId]);

  useEffect(() => {
    const requestedCaseId = searchParams.get("case") || "";
    const requestedCase = findByRoutableId(automatedCases, requestedCaseId);

    if (
      initialView !== "cases"
      || !requestedCaseId
      || selectedCaseId === requestedCase?.id
      || testCasesQuery.isLoading
      || testCasesQuery.isFetching
    ) {
      return;
    }

    if (requestedCase) {
      setView("cases");
      setSelectedCaseId(requestedCase.id);
      setSelectedAutomatedCaseId(requestedCase.id);
      setExpandedCaseSections((current) => ({ ...current, case: true, steps: true }));
    }
  }, [automatedCases, initialView, searchParams, selectedCaseId, testCasesQuery.isFetching, testCasesQuery.isLoading]);

  useEffect(() => {
    if (activeAutomatedCase && selectedAutomatedCaseId !== activeAutomatedCase.id) {
      setSelectedAutomatedCaseId(activeAutomatedCase.id);
    }
  }, [activeAutomatedCase, selectedAutomatedCaseId]);

  useEffect(() => {
    if (activeManualCase && selectedManualCaseId !== activeManualCase.id) {
      setSelectedManualCaseId(activeManualCase.id);
    }
  }, [activeManualCase, selectedManualCaseId]);

  useEffect(() => {
    const requestedRepositoryId = searchParams.get("repository") || "";

    if (
      initialView !== "repository"
      || !requestedRepositoryId
      || learningCacheQuery.isLoading
      || learningCacheQuery.isFetching
    ) {
      return;
    }

    const requestedEntry = groupedRepository
      .flatMap(([screenName, entries]) => entries.map((entry) => ({ screenName, entry })))
      .find(({ entry }) => entry.id === requestedRepositoryId && !isNonElementRepositoryEntry(entry));

    if (requestedEntry) {
      setView("repository");
      selectRepositoryEntry(requestedEntry.entry.id, requestedEntry.screenName);
      return;
    }

    if (selectedRepositoryId === requestedRepositoryId) {
      return;
    }

    syncRepositorySearchParams(null);
  }, [
    groupedRepository,
    initialView,
    learningCacheQuery.isFetching,
    learningCacheQuery.isLoading,
    searchParams,
    selectRepositoryEntry,
    selectedRepositoryId,
    syncRepositorySearchParams
  ]);

  useEffect(() => {
    if (searchParams.get("repository")) {
      return;
    }

    if (selectedRepositoryEntry && selectedRepositoryId !== selectedRepositoryEntry.id) {
      setSelectedRepositoryId(selectedRepositoryEntry.id);
    }
  }, [searchParams, selectedRepositoryEntry, selectedRepositoryId]);

  useEffect(() => {
    if (activeScreenKey && selectedScreenName !== activeScreenKey) {
      setSelectedScreenName(activeScreenKey);
    }
  }, [activeScreenKey, selectedScreenName]);

  useEffect(() => {
    setScreenRenameDraft(activeScreenName);
    setNewRepositoryFieldDraft((current) => ({ ...current, screen_name: activeScreenName || current.screen_name }));
  }, [activeScreenName]);

  useEffect(() => {
    setStagedInspectFields([]);
    setHighlightedRepositoryId("");
    setScreenExtractionDraft(null);
  }, [activeScreenName]);

  useEffect(() => {
    if (!activeScreenRecord && !selectedRepositoryEntry) {
      setLocatorImprovementPreview(null);
      return;
    }

    setLocatorImprovementPreview(null);

    const screenMetadata = activeScreenRecord?.metadata || {};
    const fieldMetadata = selectedRepositoryEntry?.metadata || {};
    const metadata = { ...screenMetadata, ...fieldMetadata };
    setScreenDomDraft(normalizeMetadataValue(screenMetadata.screen_dom_compressed) || normalizeMetadataValue(metadata.screen_dom_compressed));
    setScreenScreenshotDraft(normalizeMetadataValue(screenMetadata.screen_screenshot_url) || normalizeMetadataValue(metadata.screen_screenshot_url));
    setScreenUrlDraft(activeScreenRecord?.page_url || selectedRepositoryEntry?.page_url || activeScreenRecord?.page_key || "");
    setScreenInfoDraft({
      screen_name: normalizeMetadataValue(screenMetadata.screen_name) || activeScreenName,
      url_pattern_type: normalizeMetadataValue(screenMetadata.url_pattern_type) || "contains",
      url_pattern_value: normalizeMetadataValue(screenMetadata.url_pattern_value) || activeScreenRecord?.page_url || activeScreenRecord?.page_key || "",
      screen_fingerprint: normalizeMetadataValue(screenMetadata.screen_fingerprint),
      accessibility_tree: normalizeMetadataValue(screenMetadata.accessibility_tree),
      description: normalizeMetadataValue(screenMetadata.description),
      business_meaning: normalizeMetadataValue(screenMetadata.business_meaning)
    });
    setRepositoryDraft({
      screen_name: activeScreenName,
      object_name: selectedRepositoryEntry ? getRepositoryMemberName(selectedRepositoryEntry) : "",
      object_role: selectedRepositoryEntry ? `${getRepositoryHtmlTag(selectedRepositoryEntry)} / ${getObjectRole(selectedRepositoryEntry)}` : "",
      locator: selectedRepositoryEntry?.locator || "",
      locator_kind: selectedRepositoryEntry?.locator_kind || "",
      target_criteria: Array.isArray(metadata.target_criteria) ? metadata.target_criteria.join("\n") : normalizeMetadataValue(metadata.target_criteria),
      dom_structure: normalizeMetadataValue(metadata.dom_structure) || normalizeMetadataValue(metadata.dom_path) || normalizeMetadataValue(metadata.html),
      screenshot_url: normalizeMetadataValue(metadata.screenshot_url) || normalizeMetadataValue(metadata.screenshot_path),
      fallback_strategy: normalizeMetadataValue(metadata.fallback_strategy),
      url_pattern_type: normalizeMetadataValue(screenMetadata.url_pattern_type) || "contains",
      url_pattern_value: normalizeMetadataValue(screenMetadata.url_pattern_value) || activeScreenRecord?.page_url || selectedRepositoryEntry?.page_url || activeScreenRecord?.page_key || "",
      screen_fingerprint: normalizeMetadataValue(screenMetadata.screen_fingerprint),
      accessibility_tree: normalizeMetadataValue(screenMetadata.accessibility_tree),
      fallback_locators: selectedRepositoryEntry ? formatLocatorDraft(getRepositoryLocators(selectedRepositoryEntry)) : "",
      description: normalizeMetadataValue(fieldMetadata.description),
      business_meaning: normalizeMetadataValue(fieldMetadata.business_meaning),
      usage_keywords: metadataStringArray(fieldMetadata.usage_keywords).join(", "),
      stability_score: String(Math.round(normalizeMetadataNumber(fieldMetadata.stability_score, selectedRepositoryEntry?.confidence || 0) * 100)),
      ancestor_dom: normalizeMetadataValue(fieldMetadata.ancestor_dom),
      ancestor_screenshot_url: normalizeMetadataValue(fieldMetadata.ancestor_screenshot_url),
      element_screenshot_url: normalizeMetadataValue(fieldMetadata.element_screenshot_url) || normalizeMetadataValue(fieldMetadata.screenshot_url)
    });
  }, [activeScreenName, activeScreenRecord?.id, activeScreenRecord?.updated_at, selectedRepositoryEntry?.id, selectedRepositoryEntry?.updated_at]);

  useEffect(() => {
    if (!activeCase) {
      setTestCaseParameterValues({});
      setSuiteLinkDraftIds([]);
      return;
    }

    const nextSuiteIds = activeCase.suite_ids || (activeCase.suite_id ? [activeCase.suite_id] : []);
    setCaseDraft({
      title: activeCase.title || "",
      description: activeCase.description || "",
      status: activeCase.status || "active",
      priority: String(activeCase.priority || 3),
      parameterText: formatParameterText(activeCase.parameter_values)
    });
    setTestCaseParameterValues(normalizeAutomationParameterValues(activeCase.parameter_values, "t"));
    setSuiteLinkDraftIds(nextSuiteIds);
  }, [activeCase?.id]);

  useEffect(() => {
    if (!activeCaseSuiteIds.length) {
      setSelectedParameterSuiteId("");
      setSuiteParameterValues({});
      return;
    }

    if (!activeCaseSuiteIds.includes(selectedParameterSuiteId)) {
      setSelectedParameterSuiteId(activeCaseSuiteIds[0] || "");
    }
  }, [activeCaseSuiteIds, selectedParameterSuiteId]);

  useEffect(() => {
    if (!selectedParameterSuite) {
      setSuiteParameterValues({});
      return;
    }

    setSuiteParameterValues(normalizeAutomationParameterValues(selectedParameterSuite.parameter_values, "s"));
  }, [selectedParameterSuite?.id, selectedParameterSuite?.parameter_values]);

  useEffect(() => {
    setStepDrafts((current) => {
      const next = { ...current };
      automatedSteps.forEach((step) => {
        if (!next[step.id]) {
          next[step.id] = parseAutomationStepDraft(step);
        }
      });
      Object.keys(next).forEach((stepId) => {
        if (!automatedSteps.some((step) => step.id === stepId)) {
          delete next[stepId];
        }
      });
      return next;
    });
  }, [automatedSteps]);

  useEffect(() => {
    setStepOptionDrafts((current) => {
      const next = { ...current };
      automatedSteps.forEach((step) => {
        if (!next[step.id]) {
          next[step.id] = parseAutomationStepOptions(step);
        }
      });
      Object.keys(next).forEach((stepId) => {
        if (!automatedSteps.some((step) => step.id === stepId)) {
          delete next[stepId];
        }
      });
      return next;
    });
  }, [automatedSteps]);

  useEffect(() => {
    setStepCodeDrafts((current) => {
      const next = { ...current };
      automatedSteps.forEach((step) => {
        if (!next[step.id]) {
          next[step.id] = step.automation_code || buildAutomationCodeFromDraft(parseAutomationStepDraft(step));
        }
      });
      Object.keys(next).forEach((stepId) => {
        if (!automatedSteps.some((step) => step.id === stepId)) {
          delete next[stepId];
        }
      });
      return next;
    });
  }, [automatedSteps]);

  useEffect(() => {
    if (!recorderSession?.status_url || recorderSession.status !== "running") {
      return undefined;
    }

    let cancelled = false;
    const refreshRecorderSession = async () => {
      try {
        const response = await fetch(recorderSession.status_url as string, { cache: "no-store" });

        if (!response.ok) {
          return;
        }

        const next = await response.json() as Partial<RecorderSessionResponse>;

        if (!cancelled) {
          setRecorderSession((current) => current?.id === recorderSession.id ? { ...current, ...next } : current);
        }
      } catch {
        // Recorder counters are non-critical; the backend finish call is authoritative.
      }
    };
    const timer = window.setInterval(() => void refreshRecorderSession(), 1000);

    void refreshRecorderSession();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
	  }, [recorderSession?.id, recorderSession?.status, recorderSession?.status_url]);

  useEffect(() => {
    if (!canViewAutomationCode && automationStepView === "code") {
      setAutomationStepView("keyword");
    }
  }, [automationStepView, canViewAutomationCode]);

	  useEffect(() => {
    if (!inspectRecorderSession?.status_url || inspectRecorderSession.status !== "running") {
      return undefined;
    }

    let cancelled = false;
    const refreshInspectSession = async () => {
      try {
        const next = await readRecorderJson<Partial<RecorderSessionResponse>>(inspectRecorderSession.status_url as string);
        if (!cancelled && next) {
          setInspectRecorderSession((current) => current?.id === inspectRecorderSession.id ? { ...current, ...next } : current);
        }
      } catch {
        // A disconnected local inspector is reported by the next explicit user action.
      }
    };
    const timer = window.setInterval(() => void refreshInspectSession(), 3000);

    void refreshInspectSession();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [inspectRecorderSession?.id, inspectRecorderSession?.status, inspectRecorderSession?.status_url]);

  const invalidateAutomationData = () => {
    void queryClient.invalidateQueries({ queryKey: ["test-cases"] });
    void queryClient.invalidateQueries({ queryKey: ["test-steps"] });
    void queryClient.invalidateQueries({ queryKey: ["automation-learning-cache"] });
    void queryClient.invalidateQueries({ queryKey: ["automation-repository-context"] });
    void queryClient.invalidateQueries({ queryKey: ["workspace-transactions"] });
  };

  const selectAutomationCase = useCallback((testCaseId: string) => {
    const targetCase = automatedCases.find((testCase) => testCase.id === testCaseId) || null;

    setSelectedCaseId(testCaseId);
    setSelectedAutomatedCaseId(testCaseId);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("repository");
      next.set("case", getRoutableId(targetCase) || testCaseId);
      return next;
    }, { replace: true });
  }, [automatedCases, setSearchParams]);

  const automationCaseListColumns = useMemo<Array<DataTableColumn<TestCase>>>(() => [
    {
      key: "select",
      label: "",
      canToggle: false,
      canReorder: false,
      canResize: false,
      width: 56,
      headerRender: () => (
        <label className="data-table-header-checkbox" onClick={(event) => event.stopPropagation()}>
          <input
            aria-label="Select all filtered automation cases"
            checked={areAllFilteredAutomationCasesSelected}
            onChange={(event) =>
              setSelectedAutomationCaseIds((current) =>
                event.target.checked
                  ? [...new Set([...current, ...filteredAutomationCases.map((testCase) => testCase.id)])]
                  : current.filter((testCaseId) => !filteredAutomationCases.some((testCase) => testCase.id === testCaseId))
              )
            }
            type="checkbox"
          />
        </label>
      ),
      render: (testCase) => (
        <div onClick={(event) => event.stopPropagation()}>
          <input
            aria-label={`Select ${testCase.title}`}
            checked={selectedAutomationCaseIds.includes(testCase.id)}
            onChange={(event) =>
              setSelectedAutomationCaseIds((current) =>
                event.target.checked
                  ? [...new Set([...current, testCase.id])]
                  : current.filter((testCaseId) => testCaseId !== testCase.id)
              )
            }
            type="checkbox"
          />
        </div>
      )
    },
    {
      key: "id",
      label: "ID",
      width: 120,
      minWidth: 96,
      sortValue: (testCase) => automationDisplayIdByCaseId[testCase.id] || testCase.display_id || testCase.id,
      render: (testCase) => <DisplayIdBadge value={automationDisplayIdByCaseId[testCase.id] || testCase.display_id || testCase.id} />
    },
    {
      key: "title",
      label: "Automation case",
      canToggle: false,
      width: 300,
      minWidth: 180,
      sortValue: (testCase) => testCase.title,
      render: (testCase) => (
        <div className="automation-list-primary-cell">
          <strong>{testCase.title}</strong>
          <span>{richTextToPlainText(testCase.description) || "Automation is mapped to the original manual case definition."}</span>
        </div>
      )
    },
    {
      key: "state",
      label: "State",
      width: 160,
      minWidth: 128,
      sortValue: (testCase) => testCase.automation_status || "ready",
      render: (testCase) => (
        <div className="automation-list-status-cell">
          <StatusBadge value="automated" />
          <StatusBadge value={testCase.automation_status || "ready"} />
        </div>
      )
    },
    {
      key: "runs",
      label: "Runs",
      width: 92,
      minWidth: 78,
      sortValue: (testCase) => (historyByCaseId[testCase.id] || []).length,
      render: (testCase) => (historyByCaseId[testCase.id] || []).length
    },
    {
      key: "passRate",
      label: "Pass rate",
      width: 124,
      minWidth: 100,
      sortValue: (testCase) => {
        const history = historyByCaseId[testCase.id] || [];
        const passedRuns = history.filter((result) => result.status === "passed").length;
        return history.length ? Math.round((passedRuns / history.length) * 100) : 0;
      },
      render: (testCase) => {
        const history = historyByCaseId[testCase.id] || [];
        const passedRuns = history.filter((result) => result.status === "passed").length;
        return history.length ? `${Math.round((passedRuns / history.length) * 100)}%` : "No runs";
      }
    },
    {
      key: "priority",
      label: "Priority",
      width: 104,
      minWidth: 88,
      sortValue: (testCase) => testCase.priority || 3,
      render: (testCase) => `P${testCase.priority || 3}`
    },
    {
      key: "description",
      label: "Description",
      defaultVisible: false,
      width: 320,
      minWidth: 180,
      render: (testCase) => richTextToPlainText(testCase.description) || "No automation description yet."
    },
    {
      key: "actions",
      label: "Actions",
      canToggle: false,
      canReorder: false,
      canResize: false,
      width: 96,
      render: (testCase) => (
        <button
          className="ghost-button compact"
          onClick={(event) => {
            event.stopPropagation();
            selectAutomationCase(testCase.id);
          }}
          type="button"
        >
          <OpenIcon size={15} />
          <span>Open</span>
        </button>
      )
    }
  ], [
    areAllFilteredAutomationCasesSelected,
    automationDisplayIdByCaseId,
    filteredAutomationCases,
    historyByCaseId,
    selectAutomationCase,
    selectedAutomationCaseIds
  ]);

  const openLinkedManualCase = (manualCaseId: string) => {
    navigate(`/test-cases?case=${encodeURIComponent(manualCaseId)}`);
  };

  const resolveParameterInputState = (scope: StepParameterScope) => {
    if (scope === "s" && !selectedParameterSuite) {
      return {
        disabled: true,
        hint: activeCaseSuiteIds.length ? "Choose a linked suite before editing @s values." : "Link this automation case to a suite before editing @s values."
      };
    }
    if (scope === "r") {
      return {
        disabled: true,
        hint: "@r values are supplied from the execution run context."
      };
    }
    return {};
  };

  const handleParameterValueChange = (name: string, value: string) => {
    const parsed = parseStepParameterName(name);
    if (!parsed || resolveParameterInputState(parsed.scope).disabled) {
      return;
    }

    if (parsed.scope === "s") {
      setSuiteParameterValues((current) => ({ ...current, [parsed.name]: value }));
      return;
    }

    setTestCaseParameterValues((current) => ({ ...current, [parsed.name]: value }));
  };

  const closeAutomationCaseWorkspace = () => {
    setSelectedCaseId("");
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("case");
      return next;
    }, { replace: true });
  };

  const toggleCaseSection = (section: AutomationCaseSectionKey) => {
    setExpandedCaseSections((current) => ({ ...current, [section]: !current[section] }));
  };

  const toggleAutomationStep = (stepId: string) => {
    setExpandedAutomationStepIds((current) => current.includes(stepId) ? current.filter((id) => id !== stepId) : [...current, stepId]);
  };

  const showSuccess = (text: string) => {
    setMessageTone("success");
    setMessage(text);
  };

  const showInfo = (text: string) => {
    setMessageTone("info");
    setMessage(text);
  };

  const showError = (error: unknown, fallback: string) => {
    setMessageTone("error");
    setMessage(error instanceof Error ? error.message : fallback);
  };

  const handleRepositoryImportFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";

    if (!files.length) {
      return;
    }

    setIsParsingRepositoryImport(true);
    try {
      const preview = await parseObjectRepositoryFiles(files);
      setRepositoryImportPreview(preview);
      const fields = preview.entries.filter((entry) => entry.record_type === "field").length;
      const screens = preview.entries.filter((entry) => entry.record_type === "screen").length;
      if (!preview.entries.length) {
        throw new Error("No importable screens or fields were detected in the selected files.");
      }
      setIsRepositoryImportModalOpen(true);
      showInfo(`Prepared ${screens} screen${screens === 1 ? "" : "s"} and ${fields} field${fields === 1 ? "" : "s"} for review before import.`);
    } catch (error) {
      setRepositoryImportPreview(null);
      showError(error, "Unable to read object repository import files.");
    } finally {
      setIsParsingRepositoryImport(false);
    }
  };

  const exportRepositoryCsv = useMutation({
    mutationFn: () => {
      if (!appTypeId) {
        throw new Error("Select an application scope before exporting the repository.");
      }
      return api.testCases.exportLearningCacheCsv({ app_type_id: appTypeId });
    },
    onSuccess: (blob) => {
      const selectedApp = appTypes.find((item) => item.id === appTypeId)?.name || "object-repository";
      const fileName = `${selectedApp.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "object-repository"}-or.csv`;
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(downloadUrl);
      showSuccess("Exported all object repository screens and fields as CSV. A TestOps batch process was recorded.");
    },
    onError: (error) => showError(error, "Unable to export object repository CSV.")
  });

  const importRepositoryEntries = useMutation({
    mutationFn: () => {
      if (!appTypeId) {
        throw new Error("Select an application scope before importing repository objects.");
      }
      if (!repositoryImportPreview?.entries.length) {
        throw new Error("Choose CSV, source, or ZIP files before importing.");
      }
      return api.testCases.importLearningCacheEntries({
        app_type_id: appTypeId,
        import_source: "or_file_import",
        entries: repositoryImportPreview.entries
      });
    },
    onSuccess: (response) => {
      void queryClient.invalidateQueries({ queryKey: ["automation-learning-cache"] });
      void queryClient.invalidateQueries({ queryKey: ["automation-repository-context"] });
      if (response.failed) {
        setRepositoryImportPreview((current) => current ? {
          ...current,
          warnings: [
            ...current.warnings,
            ...response.errors.slice(0, 8).map((error) => `${error.screen_name || "Entry"}: ${error.message}`)
          ]
        } : current);
        showError(new Error(`Imported ${response.created + response.updated} entries, but ${response.failed} could not be saved. Review the import warnings.`), "Some repository entries failed to import.");
        return;
      }
      setRepositoryImportPreview(null);
      setIsRepositoryImportModalOpen(false);
      showSuccess(`Object repository import completed in TestOps${response.transaction_id ? ` (${response.transaction_id.slice(0, 8)})` : ""}: ${response.created} new, ${response.updated} updated.`);
    },
    onError: (error) => showError(error, "Unable to import object repository entries.")
  });

	  const buildSingleAutomation = useMutation({
	    mutationFn: () => {
	      if (!canUseAutomationBuilder) {
	        throw new Error("Permission required: automation.build");
	      }

	      if (!activeManualCase) {
	        throw new Error("Select a manual case first.");
	      }

      return api.testCases.queueAutomationGenerator(activeManualCase.id, {
        start_url: startUrl || undefined,
        additional_context: builderContext || undefined
      });
    },
    onSuccess: (response) => {
      showSuccess(`Automation build queued as ${response.transaction_id}.`);
      invalidateAutomationData();
    },
    onError: (error) => showError(error, "Unable to queue automation.")
  });

	  const optimizeAutomationCase = useMutation({
	    mutationFn: () => {
	      if (!canUseAutomationAi) {
	        throw new Error("Permission required: automation.ai");
	      }

	      if (!activeCase) {
	        throw new Error("Select an automation case first.");
	      }

      return api.testCases.queueAutomationGenerator(activeCase.id, {
        additional_context: getPrompt("ai.automation.review")
      });
    },
    onSuccess: (response) => {
      showSuccess(`AI automation review queued as ${response.transaction_id}.`);
      invalidateAutomationData();
    },
    onError: (error) => showError(error, "Unable to queue AI automation review.")
  });

  const updateAutomationCase = useMutation({
    mutationFn: () => {
      if (!activeCase) {
        throw new Error("Select an automation case first.");
      }

      return api.testCases.update(activeCase.id, {
        title: caseDraft.title.trim(),
        description: caseDraft.description.trim(),
        status: caseDraft.status.trim() || "active",
        priority: Number(caseDraft.priority) || 3,
        parameter_values: {
          ...normalizeAutomationParameterValues(parseParameterText(caseDraft.parameterText), "t"),
          ...normalizeAutomationParameterValues(testCaseParameterValues, "t")
        },
        suite_id: suiteLinkDraftIds[0] || "",
        suite_ids: suiteLinkDraftIds,
        automated: "yes"
      });
    },
    onSuccess: async () => {
      if (selectedParameterSuite) {
        await api.testSuites.update(selectedParameterSuite.id, {
          parameter_values: normalizeAutomationParameterValues(suiteParameterValues, "s")
        }).catch(() => null);
      }
      showSuccess("Automation case updated.");
      void queryClient.invalidateQueries({ queryKey: ["test-cases"] });
      void queryClient.invalidateQueries({ queryKey: ["test-case-suites"] });
    },
    onError: (error) => showError(error, "Unable to update automation case.")
  });

  const deleteAutomationCase = useMutation({
    mutationFn: async (testCase: TestCase) => {
      await api.testCases.delete(testCase.id);
    },
    onSuccess: () => {
      showSuccess("Test case deleted from both manual and automation workspaces.");
      setSelectedCaseId("");
      setSelectedAutomatedCaseId("");
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete("case");
        return next;
      }, { replace: true });
      invalidateAutomationData();
    },
    onError: (error) => showError(error, "Unable to delete automation case.")
  });

  const createAutomationStep = useMutation({
    mutationFn: async () => {
      if (!activeCase) {
        throw new Error("Select an automation case first.");
      }
      const automation_code = buildAutomationCodeFromDraft(newStepDraft);
      const stepName = newStepDraft.name.trim() || formatAutomationKeywordReadable(newStepDraft);
      const placementTargetStep = newStepPlacementTarget;
      const manualGroupId = placementTargetStep ? placementTargetStep.group_id || placementTargetStep.id : undefined;
      const manualGroupName = placementTargetStep
        ? placementTargetStep.group_name || placementTargetStep.action || `Manual step ${placementTargetStep.step_order}`
        : undefined;

      const created = await api.testSteps.create({
        test_case_id: activeCase.id,
        step_order: automatedSteps.length + 1,
        action: stepName,
        expected_result: newStepDraft.expected_result,
        step_type: newStepDraft.step_type,
        automation_code,
        group_id: manualGroupId,
        group_name: manualGroupName,
        group_kind: manualGroupId ? "local" : undefined
      });
      if (newStepPlacement.mode !== "end" && newStepPlacement.stepId) {
        const nextOrder = automatedSteps.map((step) => step.id);
        const placementIndex = nextOrder.findIndex((stepId) => stepId === newStepPlacement.stepId);
        if (placementIndex >= 0) {
          nextOrder.splice(newStepPlacement.mode === "before" ? placementIndex : placementIndex + 1, 0, created.id);
          await api.testSteps.reorder(activeCase.id, nextOrder);
        }
      }
      await api.testCases.update(activeCase.id, { automated: "yes", automation_status: "ready" });
      return created;
    },
    onSuccess: () => {
      showSuccess("Automation step added.");
      setNewStepDraft(emptyAutomationStepDraft("web"));
      setNewStepPlacement({ mode: "end", stepId: "" });
      void queryClient.invalidateQueries({ queryKey: ["test-steps"] });
      void queryClient.invalidateQueries({ queryKey: ["test-cases"] });
    },
    onError: (error) => showError(error, "Unable to add automation step.")
  });

  const updateAutomationStep = useMutation({
    mutationFn: async (step: TestStep) => {
      const draft = stepDrafts[step.id] || parseAutomationStepDraft(step);
      const automation_code = applyAutomationStepOptions(
        buildAutomationCodeFromDraft(draft),
        stepOptionDrafts[step.id] || parseAutomationStepOptions(step)
      );

      const updated = await api.testSteps.update(step.id, {
        action: draft.name.trim() || step.action || automation_code,
        expected_result: draft.expected_result,
        step_type: draft.step_type,
        automation_code
      });
      if (activeCase) {
        await api.testCases.update(activeCase.id, { automated: "yes", automation_status: "ready" });
      }
      return updated;
    },
    onSuccess: () => {
      showSuccess("Automation step updated.");
      void queryClient.invalidateQueries({ queryKey: ["test-steps"] });
      void queryClient.invalidateQueries({ queryKey: ["test-cases"] });
    },
    onError: (error) => showError(error, "Unable to update automation step.")
  });

	  const updateAutomationStepCode = useMutation({
	    mutationFn: async (step: TestStep) => {
	      if (!canViewAutomationCode) {
	        throw new Error("Permission required: automation.code.view");
	      }

	      const automation_code = applyAutomationStepOptions(
        (stepCodeDrafts[step.id] || step.automation_code || step.action || "").trim(),
        stepOptionDrafts[step.id] || parseAutomationStepOptions(step)
      );

      const updated = await api.testSteps.update(step.id, {
        expected_result: step.expected_result || "",
        step_type: step.step_type || "web",
        automation_code
      });
      if (activeCase) {
        await api.testCases.update(activeCase.id, { automated: "yes", automation_status: "ready" });
      }
      return updated;
    },
    onSuccess: () => {
      showSuccess("Automation code updated.");
      void queryClient.invalidateQueries({ queryKey: ["test-steps"] });
      void queryClient.invalidateQueries({ queryKey: ["test-cases"] });
    },
    onError: (error) => showError(error, "Unable to update automation code.")
  });

	  const rephraseAutomationStep = useMutation({
	    mutationFn: async (step: TestStep) => {
	      if (!canUseAutomationAi) {
	        throw new Error("Permission required: automation.ai");
	      }

	      if (!appTypeId || !activeCase) {
	        throw new Error("Select an automation case before using step AI.");
	      }

      const response = await api.testCases.rephraseStep({
        app_type_id: appTypeId,
        requirement_id: activeCase.requirement_id || undefined,
        additional_context: getPrompt("ai.automation.step_rephrase"),
        test_case: {
          title: activeCase.title,
          description: activeCase.description || "",
          parameter_values: testCaseParameterValues
        },
        step: {
          step_order: step.step_order,
          step_type: step.step_type,
          action: step.action,
          expected_result: step.expected_result
        }
      });

      return api.testSteps.update(step.id, {
        action: response.step.action || step.action || "",
        expected_result: response.step.expected_result || step.expected_result || "",
        step_type: step.step_type || "web",
        automation_code: step.automation_code || response.step.action || step.action || ""
      });
    },
    onSuccess: () => {
      showSuccess("AI improved the automation step text.");
      void queryClient.invalidateQueries({ queryKey: ["test-steps"] });
    },
    onError: (error) => showError(error, "Unable to improve automation step.")
  });

  const reorderAutomationStep = useMutation({
    mutationFn: ({ stepId, direction }: { stepId: string; direction: "up" | "down" }) => {
      const index = automatedSteps.findIndex((step) => step.id === stepId);
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (index < 0 || targetIndex < 0 || targetIndex >= automatedSteps.length || !activeCase) {
        throw new Error("Step cannot move further.");
      }
      const ids = automatedSteps.map((step) => step.id);
      [ids[index], ids[targetIndex]] = [ids[targetIndex], ids[index]];
      return api.testSteps.reorder(activeCase.id, ids);
    },
    onSuccess: () => {
      showSuccess("Automation steps reordered.");
      void queryClient.invalidateQueries({ queryKey: ["test-steps"] });
    },
    onError: (error) => showError(error, "Unable to reorder automation step.")
  });

  const deleteAutomationStep = useMutation({
    mutationFn: async (step: TestStep) => {
      await api.testSteps.update(step.id, {
        automation_code: "",
        api_request: null
      });

      if (activeCase) {
        const hasRemainingAutomation = automatedSteps.some((candidate) =>
          candidate.id !== step.id
          && Boolean(candidate.automation_code?.trim() || candidate.api_request)
        );
        await api.testCases.update(activeCase.id, {
          automated: hasRemainingAutomation ? "yes" : "no",
          automation_status: hasRemainingAutomation
            ? activeCase.automation_status === "incomplete" ? "incomplete" : "ready"
            : "not_automated"
        });
      }
    },
    onSuccess: () => {
      showSuccess("Automation removed from the manual step; the manual text remains intact.");
      void queryClient.invalidateQueries({ queryKey: ["test-steps"] });
      void queryClient.invalidateQueries({ queryKey: ["test-cases"] });
    },
    onError: (error) => showError(error, "Unable to remove automation from step.")
  });

	  const runCase = useMutation({
	    mutationFn: async ({ testCase }: { testCase: TestCase }) => {
	      if (!canRunLocalAutomation) {
	        throw new Error("Permission required: automation.run.local");
	      }

	      if (!projectId || !appTypeId || !session?.user.id) {
	        throw new Error("Select project and app type before running a case.");
	      }

      return api.executions.createLocalRun({
        project_id: projectId,
        app_type_id: appTypeId,
        test_case_ids: [testCase.id],
        name: `Automation run - ${testCase.title}`,
        created_by: session.user.id,
        execution_hooks: executionHookDraft.length ? mapRunHooksToExecutionHooks(executionHookDraft) : undefined,
        engine_base_url: "http://localhost:4311"
      });
    },
    onSuccess: (response) => {
      showSuccess(`Local Test Engine run started as ${response.id}.`);
      void queryClient.invalidateQueries({ queryKey: ["executions"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace-transactions"] });
    },
    onError: (error) => showError(error, "Unable to run case.")
  });

	  const runSelectedAutomationCases = useMutation({
	    mutationFn: async (mode: "local" | "remote") => {
	      if (mode === "local" && !canRunLocalAutomation) {
	        throw new Error("Permission required: automation.run.local");
	      }

	      if (mode === "remote" && !canRunRemoteAutomation) {
	        throw new Error("Permission required: automation.run.remote");
	      }

	      if (!projectId || !appTypeId || !session?.user.id) {
	        throw new Error("Select project and app type before running automation.");
	      }

      const fallbackCaseId = activeCase?.id || activeAutomatedCase?.id || "";
      const testCaseIds = selectedAutomationCaseIds.length ? selectedAutomationCaseIds : fallbackCaseId ? [fallbackCaseId] : [];

      if (!testCaseIds.length) {
        throw new Error("Select at least one automation case before running.");
      }

      const selectedTitles = automatedCases
        .filter((testCase) => testCaseIds.includes(testCase.id))
        .map((testCase) => testCase.title);
      const runName = selectedTitles.length === 1
        ? `${selectedTitles[0]} ${mode === "local" ? "Local Run" : "Remote Run"}`
        : `Automation ${mode === "local" ? "Local" : "Remote"} Run - ${selectedTitles.length} cases`;

      if (mode === "local") {
        const response = await api.executions.createLocalRun({
          project_id: projectId,
          app_type_id: appTypeId,
          test_case_ids: testCaseIds,
          name: runName,
          created_by: session.user.id,
          execution_hooks: executionHookDraft.length ? mapRunHooksToExecutionHooks(executionHookDraft) : undefined,
          engine_base_url: "http://localhost:4311"
        });

        return { id: response.id, mode, count: testCaseIds.length };
      }

      const response = await api.executions.create({
        project_id: projectId,
        app_type_id: appTypeId,
        test_case_ids: testCaseIds,
        name: runName,
        created_by: session.user.id,
        execution_hooks: executionHookDraft.length ? mapRunHooksToExecutionHooks(executionHookDraft) : undefined,
        execution_mode: "remote"
      });

      await api.executions.start(response.id, { execution_mode: "remote" });
      return { id: response.id, mode, count: testCaseIds.length };
    },
    onSuccess: async ({ id, mode, count }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["executions"] }),
        queryClient.invalidateQueries({ queryKey: ["workspace-transactions"] })
      ]);
      setSelectedAutomationCaseIds([]);
      navigate(`/executions?view=${mode === "local" ? "local-runs" : "test-case-runs"}&execution=${id}`);
      showSuccess(`${mode === "local" ? "Local" : "Remote"} automation run started with ${count} case${count === 1 ? "" : "s"}.`);
    },
    onError: (error) => showError(error, "Unable to run selected automation cases.")
  });

  const stageInspectField = (field: RepositoryExtractedField) => {
    const isExistingSelection = stagedInspectFields.some((item) => item.locator === field.locator);
    setStagedInspectFields((current) => {
      const existingIndex = current.findIndex((item) => item.locator === field.locator);
      if (existingIndex < 0) {
        const next = [...current, field];
        stagedInspectFieldsRef.current = next;
        return next;
      }
      const next = current.map((item, index) => index === existingIndex ? { ...item, ...field } : item);
      stagedInspectFieldsRef.current = next;
      return next;
    });
    setBrowserInspectFields((current) => current.filter((item) => item.locator !== field.locator));
    setInspectMessage(`${isExistingSelection ? "Updated" : "Selected"} ${field.name}. Remove unwanted fields or save the selected set.`);
  };

  const clearInspectHighlights = () => {
    const baseUrl = getRecorderEngineBaseUrl(inspectRecorderSession);
    const pageId = selectedInspectTabId || inspectTabs.find((tab) => tab.active)?.id || inspectTabs[0]?.id || "";
    if (!inspectRecorderSession?.id || !baseUrl || !pageId) {
      return;
    }
    void readRecorderJson(`${baseUrl}/api/v1/recorder/sessions/${encodeURIComponent(inspectRecorderSession.id)}/highlight`, {
      method: "POST",
      body: JSON.stringify({ page_id: pageId, clear_existing: true })
    }).catch(() => null);
  };

  const persistRepositoryField = (field: RepositoryExtractedField) => {
    const screenName = screenInfoDraft.screen_name.trim() || activeScreenName || inferScreenName(null, screenUrlDraft) || "Screen";
    const repositoryAppTypeId = activeRepositoryAppTypeId || appTypeId || "";
    const repositoryProjectId = activeRepositoryProjectId || projectId || "";
    const existingField = learningCache.find((entry) =>
      !isScreenRepositoryRecord(entry)
      && getScreenName(entry) === screenName
      && entry.locator === field.locator
      && (!repositoryAppTypeId || entry.app_type_id === repositoryAppTypeId)
    );
    const input = {
      project_id: repositoryProjectId || undefined,
      app_type_id: repositoryAppTypeId || undefined,
      page_url: field.pageUrl || screenUrlDraft || undefined,
      page_key: screenName,
      screen_name: screenName,
      object_name: field.name,
      object_role: `${field.tag} / ${field.role}`,
      locator: field.locator,
      locator_kind: field.locatorKind,
      locator_intent: field.name,
      dom_structure: field.dom,
      screenshot_url: field.elementScreenshotUrl || screenScreenshotDraft || undefined,
      fallback_strategy: field.source === "live_inspect" ? "Use captured visual and nearby DOM evidence only after stable locator retries fail." : undefined,
      screen_dom_compressed: screenDomDraft ? screenDomDraft.slice(0, 50_000) : undefined,
      screen_screenshot_url: screenScreenshotDraft || undefined,
      source: field.source || "inspect_ai_extract",
      metadata: {
        ...(existingField?.metadata || {}),
        url_pattern_type: screenInfoDraft.url_pattern_type || "contains",
        url_pattern_value: screenInfoDraft.url_pattern_value || screenUrlDraft || screenName,
        screen_fingerprint: screenInfoDraft.screen_fingerprint || null,
        accessibility_tree: screenInfoDraft.accessibility_tree || null,
        screen_dom_compressed: screenDomDraft ? screenDomDraft.slice(0, 50_000) : null,
        screen_screenshot_url: screenScreenshotDraft || null,
        element_screenshot_url: field.elementScreenshotUrl || null,
        ancestor_screenshot_url: field.ancestorScreenshotUrl || null,
        ancestor_dom: field.ancestorDom || null,
        target_criteria: field.targetCriteria ? [field.targetCriteria] : [],
        description: field.description || `${field.name} captured from the selected screen.`,
        business_meaning: field.businessMeaning || null,
        stability_score: field.locator.includes("data-testid") ? 0.95 : 0.75,
        fallback_locators: field.fallbackLocators,
        usage_keywords: field.usageKeywords || []
      }
    };
    return existingField
      ? api.testCases.updateLearningCacheEntry(existingField.id, input)
      : api.testCases.createLearningCacheEntry(input);
  };

  const saveRepositoryEntry = useMutation({
    mutationFn: () => {
      if (!selectedRepositoryEntry) {
        throw new Error("Select an object repository field first.");
      }
      const screenName = screenInfoDraft.screen_name.trim() || activeScreenName || getScreenName(selectedRepositoryEntry);
      const duplicate = learningCache.find((entry) =>
        entry.id !== selectedRepositoryEntry.id
        && getScreenName(entry) === screenName
        && String(entry.locator || "").trim() === repositoryDraft.locator.trim()
        && (!activeRepositoryAppTypeId || entry.app_type_id === activeRepositoryAppTypeId)
      );

      if (duplicate) {
        throw new Error("This screen already has a field with the same locator. Select the existing field or use a unique locator.");
      }

      return api.testCases.updateLearningCacheEntry(selectedRepositoryEntry.id, {
        page_url: screenUrlDraft || selectedRepositoryEntry.page_url || undefined,
        page_key: screenName,
        screen_name: screenName,
        object_name: repositoryDraft.object_name,
        object_role: repositoryDraft.object_role,
        locator: repositoryDraft.locator,
        locator_kind: repositoryDraft.locator_kind,
        target_criteria: repositoryDraft.target_criteria.split(/\n+/).map((line) => line.trim()).filter(Boolean),
        dom_structure: repositoryDraft.dom_structure,
        screenshot_url: repositoryDraft.screenshot_url,
        fallback_strategy: repositoryDraft.fallback_strategy,
        platform: appTypes.find((appType) => appType.id === activeRepositoryAppTypeId)?.type || "web",
        url_pattern_type: screenInfoDraft.url_pattern_type,
        url_pattern_value: screenInfoDraft.url_pattern_value,
        screen_fingerprint: screenInfoDraft.screen_fingerprint,
        accessibility_tree: screenInfoDraft.accessibility_tree,
        fallback_locators: parseLocatorDraft(repositoryDraft.fallback_locators),
        description: repositoryDraft.description,
        business_meaning: repositoryDraft.business_meaning,
        usage_keywords: repositoryDraft.usage_keywords.split(",").map((keyword) => keyword.trim()).filter(Boolean),
        stability_score: Math.max(0, Math.min(1, (Number(repositoryDraft.stability_score) || 0) / 100)),
        ancestor_dom: repositoryDraft.ancestor_dom,
        ancestor_screenshot_url: repositoryDraft.ancestor_screenshot_url,
        element_screenshot_url: repositoryDraft.element_screenshot_url,
        metadata: {
          ...(selectedRepositoryEntry.metadata || {}),
          screen_dom_compressed: screenDomDraft || selectedRepositoryEntry.metadata?.screen_dom_compressed,
          screen_screenshot_url: screenScreenshotDraft || selectedRepositoryEntry.metadata?.screen_screenshot_url
        }
      });
    },
    onSuccess: (updatedEntry) => {
      queryClient.setQueriesData<AutomationLearningCacheEntry[]>({ queryKey: ["automation-learning-cache"] }, (current) =>
        current ? current.map((entry) => entry.id === updatedEntry.id ? updatedEntry : entry) : current
      );
      setSelectedRepositoryId(updatedEntry.id);
      const updatedReferences = Number((updatedEntry as AutomationLearningCacheEntry & { updated_step_references?: number }).updated_step_references || 0);
      showSuccess(updatedReferences
        ? `Object repository field saved and ${updatedReferences} automation reference${updatedReferences === 1 ? "" : "s"} updated.`
        : "Object repository field saved for execution-time locator resolution.");
      void queryClient.invalidateQueries({ queryKey: ["automation-learning-cache"] });
      void queryClient.invalidateQueries({ queryKey: ["automation-repository-context"] });
    },
    onError: (error) => showError(error, "Unable to save repository field.")
  });

  const addRepositoryScreen = useMutation({
    mutationFn: () => {
      const screenName = newRepositoryScreenDraft.screen_name.trim();

      if (!screenName) {
        throw new Error("Add a screen name before saving the screen.");
      }

      return api.testCases.createLearningCacheEntry({
        project_id: projectId || undefined,
        app_type_id: appTypeId || undefined,
        page_url: newRepositoryScreenDraft.page_url.trim() || undefined,
        page_key: screenName,
        screen_name: screenName,
        object_name: "__screen__",
        object_role: "screen",
        locator: "__screen__",
        locator_kind: "screen",
        locator_intent: "__screen__",
        screen_dom_compressed: newRepositoryScreenDraft.dom_structure.trim() || undefined,
        screen_screenshot_url: newRepositoryScreenDraft.screenshot_url.trim() || undefined,
        source: "manual_screen",
        metadata: {
          record_kind: "screen",
          url_pattern_type: newRepositoryScreenDraft.url_pattern_type,
          url_pattern_value: newRepositoryScreenDraft.url_pattern_value.trim() || newRepositoryScreenDraft.page_url.trim() || screenName,
          description: newRepositoryScreenDraft.description.trim() || null,
          business_meaning: newRepositoryScreenDraft.business_meaning.trim() || null
        }
      });
    },
    onSuccess: (entry) => {
      const screenName = newRepositoryScreenDraft.screen_name.trim();
      setSelectedScreenName(makeRepositoryScreenKey(screenName, entry?.app_type_id || appTypeId || undefined));
      setScreenUrlDraft(newRepositoryScreenDraft.page_url.trim());
      setScreenDomDraft(newRepositoryScreenDraft.dom_structure.trim());
      setScreenScreenshotDraft(newRepositoryScreenDraft.screenshot_url.trim());
      setScreenInfoDraft({
        screen_name: screenName,
        url_pattern_type: newRepositoryScreenDraft.url_pattern_type,
        url_pattern_value: newRepositoryScreenDraft.url_pattern_value.trim() || newRepositoryScreenDraft.page_url.trim() || screenName,
        screen_fingerprint: "",
        accessibility_tree: "",
        description: newRepositoryScreenDraft.description.trim(),
        business_meaning: newRepositoryScreenDraft.business_meaning.trim()
      });
      if (entry?.id) {
        setSelectedRepositoryId(entry.id);
      }
      setIsAddingRepositoryScreen(false);
      setIsInspectOpen(true);
      setInspectMessage("Screen saved. Launch or reuse the local browser to inspect fields, or extract fields from supplied DOM evidence.");
      showSuccess("Screen created. Inspect fields or request AI suggestions before saving its repository set.");
      void queryClient.invalidateQueries({ queryKey: ["automation-learning-cache"] });
      void queryClient.invalidateQueries({ queryKey: ["automation-repository-context"] });
    },
    onError: (error) => showError(error, "Unable to add repository screen.")
  });

  const persistRepositoryScreenEvidence = () => {
    const screenName = screenInfoDraft.screen_name.trim() || activeScreenName || inferScreenName(null, screenUrlDraft) || "Screen";
    const existingScreenRecord = activeScreenEntries.find(isScreenRepositoryRecord);
    const repositoryAppTypeId = activeRepositoryAppTypeId || appTypeId || "";
    const repositoryProjectId = activeRepositoryProjectId || projectId || "";
    const metadata = {
      ...(existingScreenRecord?.metadata || {}),
      record_kind: "screen",
      screen_name: screenName,
      url_pattern_type: screenInfoDraft.url_pattern_type || "contains",
      url_pattern_value: screenInfoDraft.url_pattern_value || screenUrlDraft || screenName,
      screen_fingerprint: screenInfoDraft.screen_fingerprint || null,
      accessibility_tree: screenInfoDraft.accessibility_tree || null,
      screen_dom_compressed: screenDomDraft ? screenDomDraft.slice(0, 50_000) : null,
      screen_screenshot_url: screenScreenshotDraft || null,
      description: screenInfoDraft.description || null,
      business_meaning: screenInfoDraft.business_meaning || null,
      ...(screenExtractionDraft ? {
        intended_flows: screenExtractionDraft.intendedFlows,
        ai_extract_used: screenExtractionDraft.aiUsed,
        ai_extract_fallback_reason: screenExtractionDraft.fallbackReason,
        ai_extracted_at: screenExtractionDraft.extractedAt
      } : {})
    };

    if (existingScreenRecord) {
      return api.testCases.updateLearningCacheEntry(existingScreenRecord.id, {
        page_url: screenUrlDraft || undefined,
        page_key: screenName,
        screen_name: screenName,
        source: "manual_screen",
        metadata
      });
    }

    return api.testCases.createLearningCacheEntry({
      project_id: repositoryProjectId || undefined,
      app_type_id: repositoryAppTypeId || undefined,
      page_url: screenUrlDraft || undefined,
      page_key: screenName,
      screen_name: screenName,
      object_name: "__screen__",
      object_role: "screen",
      locator: "__screen__",
      locator_kind: "screen",
      locator_intent: "__screen__",
      screen_dom_compressed: screenDomDraft ? screenDomDraft.slice(0, 50_000) : undefined,
      screen_screenshot_url: screenScreenshotDraft || undefined,
      source: "manual_screen",
      metadata
    });
  };

  const saveRepositoryScreenEvidence = useMutation({
    mutationFn: persistRepositoryScreenEvidence,
    onSuccess: () => {
      showSuccess("Screen details saved.");
      void queryClient.invalidateQueries({ queryKey: ["automation-learning-cache"] });
      void queryClient.invalidateQueries({ queryKey: ["automation-repository-context"] });
    },
    onError: (error) => showError(error, "Unable to save screen evidence.")
  });

  const saveInspectedScreenFields = useMutation({
    mutationFn: async () => {
      const fields = [...stagedInspectFields];
      await persistRepositoryScreenEvidence();
      const saved = await Promise.all(fields.map((field) => persistRepositoryField(field)));
      return { count: fields.length, saved };
    },
    onSuccess: ({ count, saved }) => {
      const lastEntry = saved[saved.length - 1];
      if (lastEntry?.id) {
        setSelectedRepositoryId(lastEntry.id);
      }
      setStagedInspectFields([]);
      clearInspectHighlights();
      showSuccess(count
        ? `Saved screen details and ${count} selected field${count === 1 ? "" : "s"} to the repository.`
        : "Screen details saved. No fields were selected.");
      void queryClient.invalidateQueries({ queryKey: ["automation-learning-cache"] });
      void queryClient.invalidateQueries({ queryKey: ["automation-repository-context"] });
    },
    onError: (error) => showError(error, "Unable to save screen and selected fields.")
  });

  const extractRepositoryFields = useMutation({
    mutationFn: async () => {
      const screenName = screenInfoDraft.screen_name.trim() || activeScreenName || inferScreenName(null, screenUrlDraft) || "Screen";
      const response = await api.testCases.extractLearningCacheFields({
        app_type_id: activeRepositoryAppTypeId || appTypeId || undefined,
        screen_name: screenName,
        page_url: screenUrlDraft || undefined,
        dom_structure: screenDomDraft || undefined,
        screenshot_url: screenScreenshotDraft || undefined,
        business_meaning: screenInfoDraft.business_meaning || undefined,
        candidate_fields: inspectedFields
      });

      return response;
    },
    onSuccess: (response) => {
      const aiFields = response.fields.map((field) => ({ ...field, source: "ai_extract" as const }));
      setAiSuggestedInspectFields(aiFields);
      aiFields.forEach((field) => {
        if (inspectRecorderSession?.status === "running") {
          void highlightRepositoryLocator(field.locator, field.name, "", { retainExisting: true, silent: true }).catch(() => null);
        }
      });
      setScreenInfoDraft((current) => ({
        ...current,
        description: current.description || response.screen_summary || "",
        business_meaning: current.business_meaning || response.intended_flows.join("; ")
      }));
      setScreenExtractionDraft({
        intendedFlows: response.intended_flows,
        aiUsed: response.ai_used,
        fallbackReason: response.fallback_reason || null,
        extractedAt: new Date().toISOString()
      });
      setInspectMessage(response.fallback_used
        ? `Listed ${response.fields.length} DOM-grounded suggestion${response.fields.length === 1 ? "" : "s"}. Select the fields you want to save.`
        : `AI listed ${response.fields.length} suggested field${response.fields.length === 1 ? "" : "s"}. Select the fields you want to save.`);
      showInfo("AI suggestions are ready for review. Select only the fields you want to save.");
    },
    onError: (error) => showError(error, "Unable to suggest screen fields.")
  });

  const addRepositoryField = useMutation({
    mutationFn: () => {
      const screenName = newRepositoryFieldDraft.screen_name.trim() || activeScreenName;
      const objectName = newRepositoryFieldDraft.object_name.trim();
      const locator = newRepositoryFieldDraft.locator.trim();

      if (!screenName || !objectName || !locator) {
        throw new Error("Add a screen name, field name, and primary locator.");
      }

      return api.testCases.createLearningCacheEntry({
        project_id: activeRepositoryProjectId || projectId || undefined,
        app_type_id: activeRepositoryAppTypeId || appTypeId || undefined,
        page_url: screenUrlDraft || undefined,
        page_key: screenName,
        screen_name: screenName,
        object_name: objectName,
        object_role: newRepositoryFieldDraft.object_role.trim() || "field",
        locator,
        locator_kind: newRepositoryFieldDraft.locator_kind.trim() || "css",
        locator_intent: objectName,
        source: "manual_repository",
        metadata: {
          url_pattern_type: screenInfoDraft.url_pattern_type || "contains",
          url_pattern_value: screenInfoDraft.url_pattern_value || screenUrlDraft || screenName,
          screen_fingerprint: screenInfoDraft.screen_fingerprint || null,
          accessibility_tree: screenInfoDraft.accessibility_tree || null
        }
      });
    },
    onSuccess: (entry) => {
      setIsAddingRepositoryField(false);
      showSuccess("Object repository field added manually.");
      if (entry?.id) {
        selectRepositoryEntry(entry.id, activePageObject?.screenName || selectedScreenName);
      }
      setNewRepositoryFieldDraft({
        screen_name: activeScreenName,
        object_name: "",
        object_role: "field",
        locator: "",
        locator_kind: "css"
      });
      void queryClient.invalidateQueries({ queryKey: ["automation-learning-cache"] });
      void queryClient.invalidateQueries({ queryKey: ["automation-repository-context"] });
    },
    onError: (error) => showError(error, "Unable to add repository field.")
  });

  const renameRepositoryScreen = useMutation({
    mutationFn: () => {
      if (!activeScreenName || !screenRenameDraft.trim()) {
        throw new Error("Select a screen and provide a new screen name.");
      }

      return api.testCases.renameLearningCacheScreen(activeScreenName, {
        app_type_id: activeRepositoryAppTypeId || appTypeId || undefined,
        new_name: screenRenameDraft.trim()
      });
    },
    onSuccess: (response) => {
      setSelectedScreenName(makeRepositoryScreenKey(response.screen_name, activeRepositoryAppTypeId || appTypeId || undefined));
      setRenamingScreenName("");
      setScreenInfoDraft((current) => ({ ...current, screen_name: response.screen_name }));
      showSuccess(`Renamed screen, updated ${response.updated_fields} field reference${response.updated_fields === 1 ? "" : "s"}, and migrated ${response.updated_step_references} step binding${response.updated_step_references === 1 ? "" : "s"}.`);
      void queryClient.invalidateQueries({ queryKey: ["automation-learning-cache"] });
      void queryClient.invalidateQueries({ queryKey: ["automation-repository-context"] });
    },
    onError: (error) => showError(error, "Unable to rename repository screen.")
  });

  const deleteRepositoryEntry = useMutation({
    mutationFn: (confirmed: boolean) => {
      if (!selectedRepositoryEntry) {
        throw new Error("Select an object repository field first.");
      }
      return api.testCases.deleteLearningCacheEntry(selectedRepositoryEntry.id, confirmed);
    },
    onSuccess: (response) => {
      if (response.requires_confirmation) {
        setRepositoryUsageBlock({ title: "Delete field and invalidate automation?", usage: response.usage, kind: "field" });
        return;
      }
      setRepositoryUsageBlock(null);
      showSuccess(response.invalidated_cases.length
        ? `Object repository field deleted. ${response.invalidated_cases.length} automation case${response.invalidated_cases.length === 1 ? " is" : "s are"} now incomplete.`
        : "Object repository field deleted.");
      syncRepositorySearchParams(null);
      setSelectedRepositoryId("");
      void queryClient.invalidateQueries({ queryKey: ["automation-learning-cache"] });
      void queryClient.invalidateQueries({ queryKey: ["automation-repository-context"] });
      void queryClient.invalidateQueries({ queryKey: ["test-cases"] });
    },
    onError: (error) => showError(error, "Unable to delete repository field.")
  });

  const deleteRepositoryScreen = useMutation({
    mutationFn: (confirmed: boolean) => {
      if (!activePageObject) {
        throw new Error("Select a screen first.");
      }
      return api.testCases.deleteLearningCacheScreen(activeScreenName, {
        app_type_id: activeRepositoryAppTypeId || appTypeId || undefined,
        ...(confirmed ? { confirm: "true" } : {})
      });
    },
    onSuccess: (response) => {
      if (response.requires_confirmation) {
        setRepositoryUsageBlock({ title: "Delete screen and invalidate automation?", usage: response.usage, kind: "screen" });
        return;
      }
      setRepositoryUsageBlock(null);
      showSuccess(response.invalidated_cases.length
        ? `Object repository screen deleted. ${response.invalidated_cases.length} automation case${response.invalidated_cases.length === 1 ? " is" : "s are"} now incomplete.`
        : "Object repository screen deleted.");
      setSelectedScreenName("");
      setSelectedRepositoryId("");
      void queryClient.invalidateQueries({ queryKey: ["automation-learning-cache"] });
      void queryClient.invalidateQueries({ queryKey: ["automation-repository-context"] });
      void queryClient.invalidateQueries({ queryKey: ["test-cases"] });
    },
    onError: (error) => showError(error, "Unable to delete repository screen.")
  });

  const improveRepositoryEntry = useMutation({
    mutationFn: () => {
      if (!selectedRepositoryEntry) {
        throw new Error("Select an object repository field first.");
      }

      return api.testCases.improveLearningCacheEntry(selectedRepositoryEntry.id, {
        guidance: repositoryDraft.target_criteria || builderContext || undefined
      });
    },
    onSuccess: (response) => {
      setLocatorImprovementPreview(response);
      showSuccess(response.fallback_used
        ? `Locator proposal prepared with deterministic rules: ${response.fallback_reason || "No model output was used."}`
        : "Locator proposal prepared. Review the before-and-after values before applying it.");
    },
    onError: (error) => showError(error, "Unable to prepare a locator improvement.")
  });

  const applyRepositoryImprovement = useMutation({
    mutationFn: () => {
      if (!selectedRepositoryEntry || !locatorImprovementPreview) {
        throw new Error("Generate and review a locator proposal first.");
      }

      const locator = String(locatorImprovementPreview.suggestion.locator || "").trim();
      const strategy = String(locatorImprovementPreview.suggestion.strategy || "").trim();
      if (!locator || !strategy) {
        throw new Error("The proposal is missing a locator or strategy and cannot be applied.");
      }

      return api.testCases.applyLearningCacheImprovement(selectedRepositoryEntry.id, {
        confirmed: true,
        locator,
        strategy,
        ...(typeof locatorImprovementPreview.suggestion.confidence === "number" ? { confidence: locatorImprovementPreview.suggestion.confidence } : {}),
        ...(locatorImprovementPreview.request_id ? { request_id: locatorImprovementPreview.request_id } : {})
      });
    },
    onSuccess: () => {
      setLocatorImprovementPreview(null);
      showSuccess("Reviewed locator improvement applied. Dependent automation remains visible for validation.");
      void queryClient.invalidateQueries({ queryKey: ["automation-learning-cache"] });
      void queryClient.invalidateQueries({ queryKey: ["automation-repository-context"] });
    },
    onError: (error) => showError(error, "Unable to apply the reviewed locator improvement.")
  });

	  const startRecorder = useMutation({
	    mutationFn: (options: RecorderStartOptions) => {
	      if (!canUseRecorder) {
	        throw new Error("Permission required: automation.recorder");
	      }

	      if (!activeManualCase) {
	        throw new Error("Select a manual case first.");
	      }

      return api.testCases.startRecorderSession(activeManualCase.id, {
        start_url: startUrl || undefined,
        recorder_mode: options.recorder_mode,
        recorder_target: options.recorder_target,
        engine_base_url: options.engine_base_url,
        recorder_public_base_url: options.recorder_public_base_url,
        reuse_existing: options.recorder_mode === "local" && options.recorder_target === "web"
      });
    },
    onSuccess: (response, options) => {
      setRecorderSession(response);
      setRecorderStartOptions(options);
      showSuccess(response.reused
        ? "Reused the open local Playwright browser and started a fresh repository capture."
        : response.live_view_url ? "Local Playwright recorder is active and learning repository objects." : "Recorder started.");
      invalidateAutomationData();
    },
    onError: (error) => showError(error, "Unable to start local Playwright recorder.")
  });

	  const finishRecorder = useMutation({
	    mutationFn: () => {
	      if (!canUseRecorder) {
	        throw new Error("Permission required: automation.recorder");
	      }

	      if (!activeManualCase || !recorderSession?.id) {
	        throw new Error("Start a recorder session before finishing it.");
	      }

      return api.testCases.finishRecorderSession(activeManualCase.id, recorderSession.id, {
        transaction_id: recorderSession.transaction_id,
        additional_context: builderContext || undefined,
        recorder_mode: recorderStartOptions?.recorder_mode,
        recorder_target: recorderStartOptions?.recorder_target,
        engine_base_url: recorderStartOptions?.engine_base_url
      });
    },
    onSuccess: (response) => {
      showSuccess(
        response.generated_step_count
          ? `Captured ${response.learned_locator_count} repository object${response.learned_locator_count === 1 ? "" : "s"} and updated ${response.generated_step_count} automation step${response.generated_step_count === 1 ? "" : "s"}.`
          : "Recorder stopped. No supported interactions were captured."
      );
      setRecorderSession(null);
      setRecorderStartOptions(null);
      invalidateAutomationData();
    },
    onError: (error) => showError(error, "Unable to finish recorder session.")
  });

  const loadInspectTabs = async (sessionOverride?: RecorderSessionResponse | null) => {
    const targetSession = sessionOverride || inspectRecorderSession;
    const baseUrl = getRecorderEngineBaseUrl(targetSession);

    if (!targetSession?.id || !baseUrl) {
      throw new Error("Connect an inspection browser before selecting a tab.");
    }

    let response;
    try {
      response = await readRecorderJson<{ active_page_id?: string | null; tabs: RecorderTab[] }>(
        `${baseUrl}/api/v1/recorder/sessions/${encodeURIComponent(targetSession.id)}/tabs`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("404")) {
        throw new Error("This recorder runtime does not support Inspect tabs. Restart the host recorder to load the current Inspect implementation.");
      }
      throw error;
    }
    const tabs = response?.tabs || [];
    setInspectTabs(tabs);
    setSelectedInspectTabId((current) =>
      tabs.some((tab) => tab.id === current)
        ? current
        : response?.active_page_id || tabs.find((tab) => tab.active)?.id || tabs[0]?.id || ""
    );
    return tabs;
  };

  const launchInspectBrowser = async () => {
    setIsLaunchingInspectBrowser(true);
    setInspectMessage("Looking for an existing local inspection browser on ports 4311 and 4301...");

    try {
      if (inspectRecorderSession?.status === "running") {
        const tabs = await loadInspectTabs(inspectRecorderSession);
        setInspectMessage(tabs.length
          ? "Using the connected inspection browser. Select a tab to capture or highlight fields."
          : "Inspection browser is connected. Navigate to a page, then refresh tabs.");
        return inspectRecorderSession;
      }

      const runtime = await discoverLocalInspectRuntime();
      if (!runtime) {
        throw new Error("No local QAira recorder was found on localhost:4311 or localhost:4301. Start the local recorder or Test Engine, then launch browser again.");
      }

      const session = await readRecorderJson<RecorderSessionResponse>(`${runtime.publicBaseUrl}/api/v1/recorder/sessions`, {
        method: "POST",
        body: JSON.stringify({
          start_url: screenUrlDraft || undefined,
          reuse_existing: true,
          purpose: "repository-inspect"
        })
      });
      if (!session) {
        throw new Error("The local recorder did not return an inspection browser session.");
      }
      const connectedSession = connectLocalInspectSession(runtime, session);
      setInspectRecorderSession(connectedSession);
      const tabs = await loadInspectTabs(connectedSession);
      const reused = session.reused || runtime.reusableSessions > 0;
      setInspectMessage(tabs.length
        ? `${reused ? "Reused" : "Opened"} the ${runtime.label} browser for repository inspection. Select a tab, then inspect or highlight fields.`
        : `${reused ? "Reused" : "Opened"} the ${runtime.label} browser. Navigate to a page, then refresh tabs.`);
      return connectedSession;
    } finally {
      setIsLaunchingInspectBrowser(false);
    }
  };

  const persistLiveInspectResult = async (result: RecorderInspectResult) => {
    const screenName = activeScreenName || screenInfoDraft.screen_name.trim() || inferScreenName(result.page_title, result.page_url) || "Screen";
    const urlPattern = inferUrlPattern(result.page_url);
    const selections = getInspectSelections(result);
    const fields = selections.map((selection) => buildRepositoryFieldFromInspectSelection(result, selection));
    const latestSelection = selections[selections.length - 1] || selections[0];
    const latestField = fields[fields.length - 1] || fields[0];
    const latestCandidates = latestSelection ? getCapturedLocatorsForElement(latestSelection.element) : getCapturedLocators(result);
    if (!latestSelection || !latestField) {
      return;
    }

    setScreenUrlDraft(result.page_url || screenUrlDraft);
    setScreenDomDraft(result.screen_dom || screenDomDraft);
    setScreenScreenshotDraft(result.screen_screenshot_url || screenScreenshotDraft);
    setScreenInfoDraft((current) => ({
      ...current,
      screen_name: screenName,
      url_pattern_type: urlPattern.type,
      url_pattern_value: urlPattern.value,
      screen_fingerprint: result.screen_fingerprint || current.screen_fingerprint,
      accessibility_tree: result.accessibility_tree || current.accessibility_tree
    }));
    setRepositoryDraft((current) => ({
      ...current,
      object_name: latestField.name,
      object_role: `${latestField.tag} / ${latestField.role}`,
      locator: latestField.locator,
      locator_kind: latestField.locatorKind,
      target_criteria: latestSelection.element.text || current.target_criteria,
      dom_structure: latestField.dom,
      screenshot_url: latestField.elementScreenshotUrl || current.screenshot_url,
      fallback_locators: formatLocatorDraft(latestCandidates),
      ancestor_dom: latestSelection.element.ancestor_dom || current.ancestor_dom,
      ancestor_screenshot_url: latestField.ancestorScreenshotUrl || current.ancestor_screenshot_url,
      element_screenshot_url: latestField.elementScreenshotUrl || current.element_screenshot_url,
      stability_score: String(Math.round((latestCandidates[0]?.confidenceScore || 0.75) * 100)),
      description: current.description || `${latestField.name} captured from ${screenName}.`,
      fallback_strategy: current.fallback_strategy || "Use the captured screen screenshot and nearby DOM only after locator retries fail."
    }));

    setSelectedScreenName(screenName);
    setBrowserInspectFields((current) => {
      const selectedLocators = new Set(stagedInspectFieldsRef.current.map((field) => field.locator));
      const merged = [...current];
      fields.forEach((field) => {
        if (selectedLocators.has(field.locator)) {
          return;
        }
        const existingIndex = merged.findIndex((item) => item.locator === field.locator);
        if (existingIndex >= 0) {
          merged[existingIndex] = { ...merged[existingIndex], ...field };
        } else {
          merged.push(field);
        }
      });
      return merged;
    });
    for (const field of fields) {
      await highlightRepositoryLocator(field.locator, field.name, "", { retainExisting: true, silent: true }).catch(() => null);
    }
    setInspectMessage(`${fields.length} highlighted field${fields.length === 1 ? "" : "s"} captured. Review them under DOM suggestions, then select the fields to save.`);
  };

  const startLiveInspect = async () => {
    const targetSession = inspectRecorderSession?.status === "running"
      ? inspectRecorderSession
      : await launchInspectBrowser();
    const baseUrl = getRecorderEngineBaseUrl(targetSession);

    if (!targetSession?.id || !baseUrl) {
      throw new Error("Local recorder browser is not available.");
    }

    const tabs = inspectTabs.length ? inspectTabs : await loadInspectTabs(targetSession);
    const pageId = selectedInspectTabId || tabs.find((tab) => tab.active)?.id || tabs[0]?.id || "";
    if (!pageId) {
      throw new Error("No inspectable browser tab is available. Navigate in the opened browser, then refresh tabs.");
    }
    await readRecorderJson(`${baseUrl}/api/v1/recorder/sessions/${encodeURIComponent(targetSession.id)}/inspect/start`, {
      method: "POST",
      body: JSON.stringify({ page_id: pageId || undefined })
    });
    setSelectedInspectTabId(pageId || "");
    setIsInspectingLiveField(true);
    setInspectMessage("Inspect is armed. Click any field in the selected browser tab; QAira will capture DOM and screenshot automatically.");
  };

  const stopLiveInspect = async () => {
    const targetSession = inspectRecorderSession;
    const baseUrl = getRecorderEngineBaseUrl(targetSession);
    const pageId = selectedInspectTabId || inspectTabs.find((tab) => tab.active)?.id || inspectTabs[0]?.id || "";
    setIsInspectingLiveField(false);
    if (!targetSession?.id || !baseUrl || !pageId) {
      setInspectMessage("Inspect selection paused.");
      return;
    }
    const pendingResult = await readRecorderJson<RecorderInspectResult>(
      `${baseUrl}/api/v1/recorder/sessions/${encodeURIComponent(targetSession.id)}/inspect/result?page_id=${encodeURIComponent(pageId)}`
    ).catch(() => null);
    if (pendingResult) {
      await persistLiveInspectResult(pendingResult);
    }
    await readRecorderJson(`${baseUrl}/api/v1/recorder/sessions/${encodeURIComponent(targetSession.id)}/inspect/stop`, {
      method: "POST",
      body: JSON.stringify({ page_id: pageId })
    }).catch(() => null);
    setInspectMessage(browserInspectFields.length
      ? "Inspect paused. Review highlighted fields under DOM suggestions."
      : "Inspect paused. Start again when you want to capture more fields.");
  };

  const highlightRepositoryLocator = async (
    locator: string,
    label: string,
    entryId = "",
    options: { retainExisting?: boolean; silent?: boolean } = {}
  ) => {
    setIsInspectOpen(true);
    const targetSession = inspectRecorderSession?.status === "running"
      ? inspectRecorderSession
      : await launchInspectBrowser();
    const baseUrl = getRecorderEngineBaseUrl(targetSession);
    const tabs = inspectTabs.length ? inspectTabs : await loadInspectTabs(targetSession);
    const pageId = selectedInspectTabId || tabs.find((tab) => tab.active)?.id || tabs[0]?.id || "";

    if (!targetSession?.id || !baseUrl || !pageId) {
      throw new Error("Select an open browser tab before highlighting a repository field.");
    }

    await readRecorderJson(`${baseUrl}/api/v1/recorder/sessions/${encodeURIComponent(targetSession.id)}/highlight`, {
      method: "POST",
      body: JSON.stringify({ page_id: pageId, locator, label, retain_existing: options.retainExisting === true })
    });
    setSelectedInspectTabId(pageId);
    setHighlightedRepositoryId(entryId);
    if (!options.silent) {
      setInspectMessage(`Highlighted ${label} in the selected browser tab.`);
    }
  };

  const syncInspectHighlights = async (
    selectedFields: RepositoryExtractedField[],
    candidateFields: RepositoryExtractedField[] = browserInspectFields
  ) => {
    if (!inspectRecorderSession?.id) {
      return;
    }
    const baseUrl = getRecorderEngineBaseUrl(inspectRecorderSession);
    const pageId = selectedInspectTabId || inspectTabs.find((tab) => tab.active)?.id || inspectTabs[0]?.id || "";
    if (!baseUrl || !pageId) {
      return;
    }
    await readRecorderJson(`${baseUrl}/api/v1/recorder/sessions/${encodeURIComponent(inspectRecorderSession.id)}/highlight`, {
      method: "POST",
      body: JSON.stringify({ page_id: pageId, clear_existing: true })
    }).catch(() => null);
    const highlights = [...candidateFields, ...selectedFields].filter((field, index, allFields) =>
      allFields.findIndex((item) => item.locator === field.locator) === index
    );
    for (const field of highlights) {
      await highlightRepositoryLocator(field.locator, field.name, "", { retainExisting: true, silent: true }).catch(() => null);
    }
  };

  const removeStagedInspectField = (locator: string) => {
    const next = stagedInspectFields.filter((field) => field.locator !== locator);
    setStagedInspectFields(next);
    stagedInspectFieldsRef.current = next;
    setInspectMessage(next.length
      ? `${next.length} selected field${next.length === 1 ? "" : "s"} remain. Save when the selection is correct.`
      : "No fields selected. Inspect or choose suggested fields before saving.");
    void syncInspectHighlights(next);
  };

  const selectAllBrowserInspectFields = () => {
    if (!browserInspectFields.length) {
      return;
    }
    const selectedLocatorSet = new Set(stagedInspectFields.map((field) => field.locator));
    const fieldsToSelect = browserInspectFields.filter((field) => !selectedLocatorSet.has(field.locator));
    const nextSelected = [
      ...stagedInspectFields,
      ...fieldsToSelect
    ].filter((field, index, fields) => fields.findIndex((item) => item.locator === field.locator) === index);
    setStagedInspectFields(nextSelected);
    stagedInspectFieldsRef.current = nextSelected;
    setBrowserInspectFields([]);
    setInspectMessage(`${fieldsToSelect.length} highlighted field${fieldsToSelect.length === 1 ? "" : "s"} moved to Selected fields.`);
    void syncInspectHighlights(nextSelected, []);
  };

  const dismissBrowserInspectField = (locator: string) => {
    const nextCandidates = browserInspectFields.filter((field) => field.locator !== locator);
    setBrowserInspectFields(nextCandidates);
    setInspectMessage(nextCandidates.length
      ? `${nextCandidates.length} highlighted candidate${nextCandidates.length === 1 ? "" : "s"} remain.`
      : "No highlighted candidates remain. Capture more fields or use DOM suggestions.");
    void syncInspectHighlights(stagedInspectFields, nextCandidates);
  };

  useEffect(() => {
    if (!isInspectOpen || inspectRecorderSession?.status !== "running" || !inspectRecorderSession.id) {
      return undefined;
    }

    let isCancelled = false;
    const refreshTabs = async () => {
      try {
        await loadInspectTabs();
      } catch (error) {
        if (!isCancelled) {
          setInspectMessage(error instanceof Error ? error.message : "Unable to load browser tabs.");
        }
      }
    };

    void refreshTabs();
    const interval = window.setInterval(() => void refreshTabs(), 3000);
    return () => {
      isCancelled = true;
      window.clearInterval(interval);
    };
  }, [isInspectOpen, inspectRecorderSession?.id, inspectRecorderSession?.status]);

  useEffect(() => {
    if (!isInspectingLiveField || !inspectRecorderSession?.id) {
      return undefined;
    }

    const baseUrl = getRecorderEngineBaseUrl(inspectRecorderSession);

    if (!baseUrl) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      void (async () => {
        const query = selectedInspectTabId ? `?page_id=${encodeURIComponent(selectedInspectTabId)}` : "";
        const result = await readRecorderJson<RecorderInspectResult>(
          `${baseUrl}/api/v1/recorder/sessions/${encodeURIComponent(inspectRecorderSession.id)}/inspect/result${query}`
        ).catch((error) => {
          setInspectMessage(error instanceof Error ? error.message : "Unable to read inspect result.");
          return null;
          });
  
          if (result) {
            await persistLiveInspectResult(result);
          }
      })();
    }, 1200);

    return () => window.clearInterval(interval);
  }, [isInspectingLiveField, inspectRecorderSession, selectedInspectTabId]);

  return (
    <div className="page-content page-content--automation">
      <PageHeader
        eyebrow="Automation"
        title="Automation workspace"
        description="Maintain automated cases, keyword steps, object repository learning, and local Playwright capture in one governed workspace."
        meta={[
          { label: "Automation cases", value: automatedCases.length },
          { label: "Manual link candidates", value: manualCases.length },
          { label: "Repository objects", value: learningCache.length }
        ]}
      />

      <ToastMessage message={message} onDismiss={() => setMessage("")} tone={messageTone} />

      {view === "cases" ? (
        <WorkspaceMasterDetail
          className="automation-cases-master-detail"
          isDetailOpen={isAutomationCaseWorkspaceOpen}
          browseView={(
          <Panel
            title="Automated manual cases"
            subtitle="Each tile is the original manual case with executable keywords attached. Open it to review bindings and run history."
            actions={(
              <div className="design-list-toolbar automation-catalog-toolbar">
                <CatalogSearchFilter
                  activeFilterCount={activeAutomationCaseSearchCount}
                  ariaLabel="Search automation cases"
                  onChange={setAutomationCaseSearch}
                  placeholder="Search automation cases"
                  subtitle="Search automated manual cases by title, ID, state, priority, or recent run count."
                  title="Automation search"
                  type="search"
                  value={automationCaseSearch}
                >
                  <div className="catalog-filter-grid">
                    <div className="catalog-filter-actions">
                      <button
                        className="ghost-button"
                        disabled={!automationCaseSearch.trim()}
                        onClick={() => setAutomationCaseSearch("")}
                        type="button"
                      >
                        Clear search
                      </button>
                    </div>
                  </div>
                </CatalogSearchFilter>
                <CatalogSelectionControls
                  allSelected={areAllFilteredAutomationCasesSelected}
                  canSelectAll={Boolean(filteredAutomationCases.length)}
                  onClear={() => setSelectedAutomationCaseIds([])}
                  onSelectAll={() =>
                    setSelectedAutomationCaseIds((current) => [...new Set([...current, ...filteredAutomationCases.map((testCase) => testCase.id)])])
                  }
                  selectedCount={selectedAutomationCaseIds.length}
                />
                <CatalogViewToggle onChange={setAutomationCatalogViewMode} value={automationCatalogViewMode} />
                {selectedAutomationCaseIds.length || activeAutomatedCase ? (
                  <>
                    <button
                      className="ghost-button catalog-run-button"
                      disabled={!canRunLocalAutomation || !projectId || !appTypeId || runSelectedAutomationCases.isPending}
                      onClick={() => runSelectedAutomationCases.mutate("local")}
                      type="button"
                    >
                      <PlayIcon />
                      <span>Run local</span>
                    </button>
                    <button
                      className="ghost-button catalog-run-button"
                      disabled={!canRunRemoteAutomation || !projectId || !appTypeId || runSelectedAutomationCases.isPending}
                      onClick={() => runSelectedAutomationCases.mutate("remote")}
                      type="button"
                    >
                      <OpenIcon />
                      <span>Run remote</span>
                    </button>
                  </>
                ) : null}
                <button className="primary-button automation-choose-manual-toolbar-button" onClick={() => navigate("/test-cases")} type="button">
                  <AddIcon />
                  <span>Choose manual case</span>
                </button>
              </div>
            )}
          >
            {testCasesQuery.isLoading || executionResultsQuery.isLoading ? <TileCardSkeletonGrid /> : null}
            {!testCasesQuery.isLoading && !automatedCases.length ? (
              <div className="empty-state compact">No manual cases have automation attached yet. Choose a manual case, then build keywords or record its flow.</div>
            ) : null}
            {!testCasesQuery.isLoading && automatedCases.length ? (
              <TileBrowserPane className="automation-case-tile-browser">
                {automationCatalogViewMode === "tile" && filteredAutomationCases.length ? (
                  <div className="tile-browser-grid">
                    {filteredAutomationCases.map((testCase) => {
                    const history = (historyByCaseId[testCase.id] || []).slice(0, 10);
                    const latest = history[0];
                    const passedRuns = history.filter((result) => result.status === "passed").length;
                    const passRate = history.length ? Math.round((passedRuns / history.length) * 100) : 0;
                    const isActive = activeCase?.id === testCase.id;
                    return (
                      <div
                        aria-pressed={isActive}
                        className={["record-card tile-card test-case-card test-case-catalog-card automation-case-tile", isActive ? "is-active" : ""].filter(Boolean).join(" ")}
                        key={testCase.id}
                        onClick={() => {
                          selectAutomationCase(testCase.id);
                        }}
                        onKeyDown={(event) => {
                          if (event.target !== event.currentTarget) {
                            return;
                          }

                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            selectAutomationCase(testCase.id);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="tile-card-main">
                          <div className="tile-card-select-row test-case-card-header">
                            <label className="checkbox-field" onClick={(event) => event.stopPropagation()}>
                              <input
                                aria-label={`Select ${testCase.title}`}
                                checked={selectedAutomationCaseIds.includes(testCase.id)}
                                onChange={(event) =>
                                  setSelectedAutomationCaseIds((current) =>
                                    event.target.checked
                                      ? [...new Set([...current, testCase.id])]
                                      : current.filter((testCaseId) => testCaseId !== testCase.id)
                                  )
                                }
                                type="checkbox"
                              />
                              <DisplayIdBadge value={automationDisplayIdByCaseId[testCase.id] || testCase.display_id || testCase.id} />
                            </label>
                            <div className="catalog-inline-actions test-case-top-actions">
                              <StatusBadge value="automated" />
                              <StatusBadge value={testCase.automation_status || "ready"} />
                            </div>
                          </div>
                          <div className="tile-card-header">
                            <TileCardIconFrame tone={getTileCardTone(latest?.status || testCase.status)}>
                              <TileCardCaseIcon />
                            </TileCardIconFrame>
                            <div className="tile-card-title-group test-case-card-title-group">
                              <span className="tile-card-kicker">{automationDisplayIdByCaseId[testCase.id] || "AT"} · Keyword automation</span>
                              <strong>{testCase.title}</strong>
                            </div>
                          </div>
                          <RichTextContent className="tile-card-description" value={testCase.description} fallback="Automation is mapped to the original manual case definition." />
                          <div className="tile-card-facts">
                            <TileCardFact label={testCase.automation_status === "incomplete" ? "Incomplete" : "Ready"} title="Automation state" tone={testCase.automation_status === "incomplete" ? "neutral" : "success"}><SparkIcon /></TileCardFact>
                            <TileCardFact label={`${history.length} runs`} title="Recent run history" tone={history.length ? "info" : "neutral"}><TileCardRunsIcon /></TileCardFact>
                            <TileCardFact label={`P${testCase.priority || 3}`} title="Priority"><TileCardStepsIcon /></TileCardFact>
                          </div>
                          <div className="tile-card-footer">
                            <div className="test-case-card-progress-row" aria-label={history.length ? `${passRate}% recent pass rate` : "No recent run coverage"}>
                              <div className="test-case-card-progress-track"><span style={{ width: `${passRate}%` }} /></div>
                              <small>{history.length ? `${passRate}% passed` : "No runs"}</small>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                    })}
                  </div>
                ) : null}
                {automationCatalogViewMode === "list" ? (
                  <DataTable
                    columns={automationCaseListColumns}
                    enableColumnResize
                    enableHeaderColumnReorder
                    emptyMessage="No automation cases match the current search."
                    getRowClassName={(testCase) => (activeCase?.id === testCase.id ? "is-active-row" : "")}
                    getRowKey={(testCase) => testCase.id}
                    hideToolbarCopy
                    onRowClick={(testCase) => selectAutomationCase(testCase.id)}
                    rows={filteredAutomationCases}
                    storageKey="qaira:automation-cases:list-columns"
                  />
                ) : null}
                {automationCatalogViewMode === "tile" && !filteredAutomationCases.length ? (
                  <div className="empty-state compact">No automation cases match the current search.</div>
                ) : null}
              </TileBrowserPane>
            ) : null}
          </Panel>
          )}
          detailView={(
          <Panel
            title="Automation case workspace"
            subtitle={activeCase ? "Switch between case details and keyword step editing without losing the selected context." : "Select an automation case."}
            actions={activeCase ? (
              <div className="testops-action-row">
                <WorkspaceBackButton label="Back to automation case tiles" onClick={closeAutomationCaseWorkspace} />
	                <button className="primary-button" disabled={!canRunLocalAutomation || runCase.isPending || activeCase.automated !== "yes" || activeCase.automation_status === "incomplete"} onClick={() => runCase.mutate({ testCase: activeCase })} type="button">
	                  <PlayIcon />
	                  <span>{runCase.isPending ? "Starting..." : "Run automated"}</span>
	                </button>
	                <button className="ghost-button" disabled={!canUseAutomationAi || optimizeAutomationCase.isPending} onClick={() => optimizeAutomationCase.mutate()} type="button">
                  <SparkIcon />
                  <span>{optimizeAutomationCase.isPending ? "Queueing..." : "AI review"}</span>
                </button>
              </div>
            ) : undefined}
          >
            {!activeCase ? (
              <div className="empty-state compact">Select a case tile to inspect its automation detail.</div>
            ) : automatedStepsQuery.isLoading ? (
              <TileCardSkeletonGrid />
            ) : (
              <div className="automation-case-detail editor-accordion">
                <AutomationAccordionSection
                  countLabel={automationDisplayIdByCaseId[activeCase.id] || activeCase.display_id || "AT"}
                  isExpanded={expandedCaseSections.case}
                  onToggle={() => toggleCaseSection("case")}
                  summary="Automation is stored on this original manual case with its parameters, suites, and priority."
	                  title="Test case"
	                >
	                  <div className="automation-description-panel">
	                    <div className="automation-manual-summary-grid">
	                      <button className="automation-linked-manual-card automation-linked-manual-card--button" onClick={() => openLinkedManualCase(activeCase.id)} type="button">
	                        <strong>Original manual case</strong>
	                        <span>{activeCase.display_id || activeCase.id} · automation is attached directly to this case · Open manual authoring</span>
	                      </button>
	                      <div className="automation-manual-meta-grid" aria-label="Manual test case metadata carried into automation">
	                        <div><span>Status</span><strong>{activeCase.status || "active"}</strong></div>
	                        <div><span>Priority</span><strong>P{activeCase.priority || 3}</strong></div>
	                        <div><span>Automation</span><strong>{activeCase.automation_status || "ready"}</strong></div>
	                        <div><span>Suites</span><strong>{activeCaseSuiteIds.length || "None"}</strong></div>
	                        <div><span>Requirement</span><strong>{activeCase.requirement_id || "Not linked"}</strong></div>
	                        <div><span>Updated</span><strong>{activeCase.updated_at ? formatRunDate.format(new Date(activeCase.updated_at)) : "Not recorded"}</strong></div>
	                      </div>
	                    </div>
	                    <div className="automation-case-editor-grid automation-case-editor-grid--metadata">
	                      <label className="form-field">
	                        <span>Manual case name</span>
	                        <input value={caseDraft.title} onChange={(event) => setCaseDraft((current) => ({ ...current, title: event.target.value }))} />
	                      </label>
	                      <label className="form-field">
	                        <span>Status</span>
	                        <input value={caseDraft.status} onChange={(event) => setCaseDraft((current) => ({ ...current, status: event.target.value }))} />
	                      </label>
	                      <label className="form-field">
	                        <span>Priority</span>
	                        <input min={1} max={5} type="number" value={caseDraft.priority} onChange={(event) => setCaseDraft((current) => ({ ...current, priority: event.target.value }))} />
	                      </label>
	                    </div>
	                    <label className="form-field">
	                      <span>Description</span>
	                      <RichTextEditor rows={3} value={caseDraft.description} onChange={(description) => setCaseDraft((current) => ({ ...current, description }))} />
	                    </label>
	                    <section className="automation-test-data-panel step-parameter-list" aria-label="Automation test data inherited from manual case">
	                      <div className="automation-section-heading">
	                        <div>
	                          <strong>Test data</strong>
	                          <span>Same scoped values used by the manual test case. @r values are supplied by the run.</span>
	                        </div>
	                        <button className="ghost-button compact" onClick={() => setIsParameterDialogOpen(true)} type="button">
	                          <SparkIcon />
	                          <span>{detectedStepParameters.length ? `Edit ${detectedStepParameters.length}` : "Edit test data"}</span>
	                        </button>
	                      </div>
	                      {inlineTestDataGroups.length ? inlineTestDataGroups.map((group) => (
	                        <section className="step-parameter-group automation-inline-parameter-group" key={group.scope}>
	                          <div className="step-parameter-group-head">
	                            <strong>{group.title}</strong>
	                            <span>{group.rows.length} item{group.rows.length === 1 ? "" : "s"}</span>
	                          </div>
	                          {group.rows.map((row) => (
	                            <div className="step-parameter-row" key={row.name}>
	                              <label className="form-field">
	                                <span>{row.token}</span>
	                                <div className="step-parameter-input-row">
	                                  <input
	                                    disabled={row.locked}
	                                    placeholder={row.locked ? "Supplied when the run starts" : `Value for ${row.token}`}
	                                    value={row.locked ? "" : row.value}
	                                    onChange={(event) => handleParameterValueChange(row.name, event.target.value)}
	                                  />
	                                </div>
	                              </label>
	                            </div>
	                          ))}
	                        </section>
	                      )) : (
	                        <div className="empty-state compact">No test data references detected yet. Add @t, @s, or @r tokens in manual steps or automation keywords.</div>
	                      )}
	                    </section>
	                    <section className="automation-run-hooks-panel">
	                      <RunHooksBuilder
	                        onChange={setExecutionHookDraft}
	                        suites={suites}
	                        testCases={testCases}
	                        value={executionHookDraft}
	                      />
	                    </section>
	                    <div className="automation-suite-link-panel">
                      <strong>Suite references</strong>
                      <span>@s values are saved against the selected linked suite, matching the manual test case workspace.</span>
                      {suites.length ? (
                        <div className="selection-chip-row">
                          {suites.map((suite: TestSuite) => {
                            const isLinked = suiteLinkDraftIds.includes(suite.id);
                            return (
                              <button
                                className={isLinked ? "selection-chip is-selected" : "selection-chip is-unselected"}
                                key={suite.id}
                                onClick={() => {
                                  setSuiteLinkDraftIds((current) =>
                                    current.includes(suite.id) ? current.filter((id) => id !== suite.id) : [...current, suite.id]
                                  );
                                  if (!selectedParameterSuiteId) {
                                    setSelectedParameterSuiteId(suite.id);
                                  }
                                }}
                                type="button"
                              >
                                {suite.name}
                              </button>
                            );
                          })}
                        </div>
                      ) : <div className="empty-state compact">No suites exist for this app type yet.</div>}
	                    </div>
		                    <div className="testops-action-row">
		                      <button className="primary-button" disabled={updateAutomationCase.isPending} onClick={() => updateAutomationCase.mutate()} type="button">
		                        <span>{updateAutomationCase.isPending ? "Saving..." : "Save automation case"}</span>
		                      </button>
                      <button className="ghost-button" onClick={exportAutomationCasePdf} type="button">
                        <ExportIcon size={16} />
                        <span>Export PDF</span>
                      </button>
	                      <button className="ghost-button danger" disabled={deleteAutomationCase.isPending} onClick={() => deleteAutomationCase.mutate(activeCase)} type="button">
	                        <TrashIcon size={16} />
	                        <span>{deleteAutomationCase.isPending ? "Deleting..." : "Delete test case"}</span>
                      </button>
                    </div>
                  </div>
                </AutomationAccordionSection>

                <AutomationAccordionSection
                  actions={(
                    <div className="automation-step-view-toggle" role="group" aria-label="Automation step view">
                      <button className={automationStepView === "keyword" ? "is-active" : ""} onClick={() => setAutomationStepView("keyword")} type="button">Keyword</button>
	                      <button className={automationStepView === "code" ? "is-active" : ""} disabled={!canViewAutomationCode} onClick={() => setAutomationStepView("code")} type="button">Code</button>
                    </div>
                  )}
                  countLabel={`${automatedSteps.length} step${automatedSteps.length === 1 ? "" : "s"}`}
                  isExpanded={expandedCaseSections.steps}
                  onToggle={() => toggleCaseSection("steps")}
                  summary={automationStepView === "keyword" ? "Keyword-based automation steps with repository parameters." : "Generated executable code for the same step list."}
                  title="Steps"
                >
                  <div className="automation-keyword-step-list">
                    {!automatedSteps.length ? <div className="empty-state compact">No keyword steps yet. Add them from Test Cases, recorder capture, or AI automation generation.</div> : null}
	                    {automationStepView === "keyword" ? automationStepGroups.map((group) => (
	                      <section className={group.isStandalone ? "automation-manual-step-group is-standalone" : "automation-manual-step-group"} key={group.id}>
	                        <div className="automation-manual-step-group-head">
	                          <div>
	                            <strong>{group.title}</strong>
	                            <span>{group.subtitle}</span>
	                          </div>
	                          <div className="automation-manual-step-group-actions">
	                            <span className="count-pill">{group.steps.length} keyword{group.steps.length === 1 ? "" : "s"}</span>
	                            {!group.isStandalone && group.steps.length ? (
	                              <button
	                                className="ghost-button compact"
	                                onClick={() => {
	                                  const lastGroupStep = group.steps[group.steps.length - 1];
	                                  setNewStepPlacement({ mode: "after", stepId: lastGroupStep.id });
	                                }}
	                                type="button"
	                              >
	                                <AddIcon />
	                                <span>Add keyword</span>
	                              </button>
	                            ) : null}
	                          </div>
	                        </div>
	                        <div className="automation-manual-step-keywords">
	                          {group.steps.map((step) => {
	                      const draft = stepDrafts[step.id] || parseAutomationStepDraft(step);
	                      const options = stepOptionDrafts[step.id] || parseAutomationStepOptions(step);
	                      const variables = extractVariables(step);
	                      const isExpanded = expandedAutomationStepIds.includes(step.id);

                      return (
                        <article className={["automation-keyword-step", isExpanded ? "is-expanded" : ""].filter(Boolean).join(" ")} key={step.id}>
                          <div className="automation-keyword-step-top">
                            <button className="automation-keyword-step-summary" onClick={() => toggleAutomationStep(step.id)} type="button">
                              <span className="count-pill">Step {step.step_order}</span>
	                              <span className="automation-step-type-chip">{getAutomationStepTypeLabel(step)}</span>
	                              <strong>{formatAutomationKeywordReadable(draft, variables)}</strong>
	                              {step.group_kind ? (
	                                <span className={step.group_kind === "reusable" ? "automation-step-group-chip is-shared" : "automation-step-group-chip"}>
	                                  {step.group_kind === "reusable" ? "Shared group" : step.group_name || "Group"}
	                                </span>
	                              ) : null}
                              <StatusBadge value={step.automation_code ? "keyword-ready" : "manual-only"} />
                            </button>
                            <div className="automation-hover-step-tools" aria-label={`Step ${step.step_order} actions`}>
	                              <button className="automation-step-tool-button" disabled={reorderAutomationStep.isPending || step.step_order <= 1} onClick={() => reorderAutomationStep.mutate({ stepId: step.id, direction: "up" })} title="Move up" type="button">↑</button>
	                              <button className="automation-step-tool-button" disabled={reorderAutomationStep.isPending || step.step_order >= automatedSteps.length} onClick={() => reorderAutomationStep.mutate({ stepId: step.id, direction: "down" })} title="Move down" type="button">↓</button>
	                              <button className="automation-step-tool-button" onClick={() => setNewStepPlacement({ mode: "before", stepId: step.id })} title="Insert above" type="button">+↑</button>
	                              <button className="automation-step-tool-button" onClick={() => setNewStepPlacement({ mode: "after", stepId: step.id })} title="Insert below" type="button">+↓</button>
		                              <button className="automation-step-tool-button" disabled={!canUseAutomationAi || rephraseAutomationStep.isPending} onClick={() => rephraseAutomationStep.mutate(step)} title="AI improve step" type="button">AI</button>
	                              <button className="automation-step-tool-button is-primary" disabled={updateAutomationStep.isPending} onClick={() => updateAutomationStep.mutate(step)} title="Save step" type="button">Save</button>
                              <button className="automation-step-tool-button" onClick={() => navigator.clipboard?.writeText(buildAutomationCodeFromDraft(draft))} title="Copy keyword" type="button"><CopyIcon size={15} /></button>
                              <button className="automation-step-tool-button" onClick={() => openLinkedManualCase(activeCase.id)} title="Open manual case" type="button"><OpenIcon size={15} /></button>
                              <button className="automation-step-tool-button is-danger" disabled={deleteAutomationStep.isPending} onClick={() => deleteAutomationStep.mutate(step)} title="Remove automation from step" type="button"><TrashIcon size={15} /></button>
                            </div>
                          </div>
                          {isExpanded ? (
                            <div className="automation-keyword-step-body">
	                              <div className="automation-step-editor-grid">
	                                <label className="form-field">
	                                  <span>Step type</span>
	                                  <select
	                                    value={draft.step_type}
	                                    onChange={(event) => {
	                                      const nextType = event.target.value as TestStepType;
	                                      setStepDrafts((current) => ({
	                                        ...current,
	                                        [step.id]: {
	                                          ...draft,
	                                          step_type: nextType,
	                                          keyword: AUTOMATION_KEYWORDS_BY_TYPE[nextType].includes(draft.keyword) ? draft.keyword : AUTOMATION_KEYWORDS_BY_TYPE[nextType][0]
	                                        }
	                                      }));
	                                    }}
	                                  >
	                                    <option value="web">Web</option>
	                                    <option value="api">API</option>
	                                    <option value="android">Android</option>
	                                    <option value="ios">iOS</option>
	                                  </select>
	                                </label>
	                                <label className="form-field">
	                                  <span>Step name</span>
	                                  <input value={draft.name} onChange={(event) => setStepDrafts((current) => ({ ...current, [step.id]: { ...draft, name: event.target.value } }))} placeholder={step.action || "Standalone automation step"} />
	                                </label>
	                                <label className="form-field">
	                                  <span>Keyword</span>
	                                  <select value={draft.keyword} onChange={(event) => setStepDrafts((current) => ({ ...current, [step.id]: { ...draft, keyword: event.target.value } }))}>
	                                    {AUTOMATION_KEYWORDS_BY_TYPE[draft.step_type].map((keyword) => (
	                                      <option key={keyword} value={keyword}>{keyword}</option>
	                                    ))}
	                                  </select>
                                </label>
                                <label className="form-field">
                                  <span>Repository member</span>
                                  <select value={draft.objectRef} onChange={(event) => setStepDrafts((current) => ({ ...current, [step.id]: { ...draft, objectRef: event.target.value } }))}>
                                    <option value="">Select repository member</option>
                                    {allObjectMembers.map((member) => (
                                      <option key={member.entry.id} value={member.ref}>{member.ref} · {member.htmlTag}</option>
                                    ))}
                                  </select>
                                </label>
                                <label className="form-field">
                                  <span>Value / parameter</span>
                                  <input value={draft.value} onChange={(event) => setStepDrafts((current) => ({ ...current, [step.id]: { ...draft, value: event.target.value } }))} placeholder="@t.userEmail" />
                                </label>
                              </div>
                              <div className="automation-step-action-row">
                                <button className="ghost-button compact" disabled={reorderAutomationStep.isPending || step.step_order <= 1} onClick={() => reorderAutomationStep.mutate({ stepId: step.id, direction: "up" })} type="button">
                                  <span>Move up</span>
                                </button>
                                <button className="ghost-button compact" disabled={reorderAutomationStep.isPending || step.step_order >= automatedSteps.length} onClick={() => reorderAutomationStep.mutate({ stepId: step.id, direction: "down" })} type="button">
                                  <span>Move down</span>
                                </button>
                                <button className="primary-button compact" disabled={updateAutomationStep.isPending} onClick={() => updateAutomationStep.mutate(step)} type="button">
                                  <span>{updateAutomationStep.isPending ? "Saving..." : "Save step"}</span>
                                </button>
                                <button className="ghost-button compact" onClick={() => navigator.clipboard?.writeText(step.automation_code || step.action || "")} type="button">
                                  <CopyIcon size={16} />
                                  <span>Copy keyword</span>
                                </button>
                                <button className="ghost-button compact" onClick={() => openLinkedManualCase(activeCase.id)} type="button">
                                  <OpenIcon size={16} />
                                  <span>Open manual case</span>
                                </button>
                                <button className="ghost-button compact" disabled={deleteAutomationStep.isPending} onClick={() => deleteAutomationStep.mutate(step)} type="button">
                                  <TrashIcon size={16} />
                                  <span>{deleteAutomationStep.isPending ? "Removing..." : "Remove automation"}</span>
                                </button>
                              </div>
                              <div className="automation-step-options-panel" aria-label={`Step ${step.step_order} execution options`}>
                                <label>
                                  <input
                                    checked={options.screenshotOnFailure}
                                    onChange={(event) =>
                                      setStepOptionDrafts((current) => ({
                                        ...current,
                                        [step.id]: { ...options, screenshotOnFailure: event.target.checked }
                                      }))
                                    }
                                    type="checkbox"
                                  />
                                  Screenshot on failure
                                </label>
                                <label>
                                  <input
                                    checked={options.optional}
                                    onChange={(event) =>
                                      setStepOptionDrafts((current) => ({
                                        ...current,
                                        [step.id]: { ...options, optional: event.target.checked }
                                      }))
                                    }
                                    type="checkbox"
                                  />
                                  Optional step
                                </label>
                                <label>
                                  <input
                                    checked={options.skip}
                                    onChange={(event) =>
                                      setStepOptionDrafts((current) => ({
                                        ...current,
                                        [step.id]: { ...options, skip: event.target.checked }
                                      }))
                                    }
                                    type="checkbox"
                                  />
                                  Skip step
                                </label>
                              </div>
                              <code className="automation-code-block automation-code-block--compact">{buildAutomationCodeFromDraft(draft)}</code>
                              <div className="automation-step-meta-grid">
                                <div>
                                  <span>Object binding</span>
                                  {draft.objectRef ? <code>{draft.objectRef}</code> : <small>Select a repository member.</small>}
                                </div>
                                <div>
                                  <span>Variables</span>
                                  {variables.length ? variables.map((variable) => <code key={variable}>{`@${variable}`}</code>) : <small>No variables used.</small>}
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </article>
                      );
	                          })}
	                        </div>
	                      </section>
	                    )) : (
	                      <>
	                        <article className="automation-complete-code-card">
	                          <div className="automation-section-heading">
	                            <div>
	                              <strong>Complete automation code</strong>
	                              <span>Generated from grouped keyword steps with current data references.</span>
	                            </div>
	                            <button className="ghost-button compact" onClick={() => navigator.clipboard?.writeText(completeAutomationCode)} type="button">
	                              <CopyIcon size={15} />
	                              <span>Copy full code</span>
	                            </button>
	                          </div>
	                          <pre className="automation-code-block automation-code-block--complete">{completeAutomationCode}</pre>
	                        </article>
	                        {automatedSteps.map((step) => {
	                      const codeDraft = stepCodeDrafts[step.id] ?? step.automation_code ?? buildAutomationCodeFromDraft(parseAutomationStepDraft(step));
	                      const options = stepOptionDrafts[step.id] || parseAutomationStepOptions(step);
	                      const isExpanded = expandedAutomationStepIds.includes(step.id);

                      return (
                        <article className={["automation-keyword-step automation-code-step", isExpanded ? "is-expanded" : ""].filter(Boolean).join(" ")} key={step.id}>
                          <div className="automation-keyword-step-top">
                            <button className="automation-keyword-step-summary" onClick={() => toggleAutomationStep(step.id)} type="button">
                              <span className="count-pill">Step {step.step_order}</span>
                              <span className="automation-step-type-chip">{getAutomationStepTypeLabel(step)}</span>
                              <strong>{step.action || codeDraft || "Code step"}</strong>
                              {step.group_kind ? (
                                <span className={step.group_kind === "reusable" ? "automation-step-group-chip is-shared" : "automation-step-group-chip"}>
                                  {step.group_kind === "reusable" ? "Shared group" : step.group_name || "Group"}
                                </span>
                              ) : null}
                              <StatusBadge value={codeDraft ? "code-ready" : "empty"} />
                            </button>
                            <div className="automation-hover-step-tools" aria-label={`Step ${step.step_order} code actions`}>
                              <button className="automation-step-tool-button" disabled={reorderAutomationStep.isPending || step.step_order <= 1} onClick={() => reorderAutomationStep.mutate({ stepId: step.id, direction: "up" })} title="Move up" type="button">↑</button>
                              <button className="automation-step-tool-button" disabled={reorderAutomationStep.isPending || step.step_order >= automatedSteps.length} onClick={() => reorderAutomationStep.mutate({ stepId: step.id, direction: "down" })} title="Move down" type="button">↓</button>
	                              <button className="automation-step-tool-button" disabled={!canUseAutomationAi || rephraseAutomationStep.isPending} onClick={() => rephraseAutomationStep.mutate(step)} title="AI improve step" type="button">AI</button>
	                              <button className="automation-step-tool-button is-primary" disabled={!canViewAutomationCode || updateAutomationStepCode.isPending} onClick={() => updateAutomationStepCode.mutate(step)} title="Save code" type="button">Save</button>
                              <button className="automation-step-tool-button" onClick={() => navigator.clipboard?.writeText(codeDraft)} title="Copy code" type="button"><CopyIcon size={15} /></button>
                              <button className="automation-step-tool-button is-danger" disabled={deleteAutomationStep.isPending} onClick={() => deleteAutomationStep.mutate(step)} title="Remove automation from step" type="button"><TrashIcon size={15} /></button>
                            </div>
                          </div>
                          {isExpanded ? (
                            <div className="automation-keyword-step-body">
                              <label className="form-field">
                                <span>Executable code</span>
                                <textarea
                                  className="automation-code-textarea"
                                  rows={6}
                                  value={codeDraft}
                                  onChange={(event) => setStepCodeDrafts((current) => ({ ...current, [step.id]: event.target.value }))}
                                />
                              </label>
                              <div className="automation-step-action-row">
                                <button className="ghost-button compact" disabled={reorderAutomationStep.isPending || step.step_order <= 1} onClick={() => reorderAutomationStep.mutate({ stepId: step.id, direction: "up" })} type="button">
                                  <span>Move up</span>
                                </button>
                                <button className="ghost-button compact" disabled={reorderAutomationStep.isPending || step.step_order >= automatedSteps.length} onClick={() => reorderAutomationStep.mutate({ stepId: step.id, direction: "down" })} type="button">
                                  <span>Move down</span>
                                </button>
	                                <button className="primary-button compact" disabled={!canViewAutomationCode || updateAutomationStepCode.isPending} onClick={() => updateAutomationStepCode.mutate(step)} type="button">
                                  <span>{updateAutomationStepCode.isPending ? "Saving..." : "Save code"}</span>
                                </button>
                                <button className="ghost-button compact" onClick={() => navigator.clipboard?.writeText(codeDraft)} type="button">
                                  <CopyIcon size={16} />
                                  <span>Copy code</span>
                                </button>
                                <button className="ghost-button compact" disabled={deleteAutomationStep.isPending} onClick={() => deleteAutomationStep.mutate(step)} type="button">
                                  <TrashIcon size={16} />
                                  <span>{deleteAutomationStep.isPending ? "Removing..." : "Remove automation"}</span>
                                </button>
                              </div>
                              <div className="automation-step-options-panel" aria-label={`Step ${step.step_order} execution options`}>
                                <label>
                                  <input
                                    checked={options.screenshotOnFailure}
                                    onChange={(event) =>
                                      setStepOptionDrafts((current) => ({
                                        ...current,
                                        [step.id]: { ...options, screenshotOnFailure: event.target.checked }
                                      }))
                                    }
                                    type="checkbox"
                                  />
                                  Screenshot on failure
                                </label>
                                <label>
                                  <input
                                    checked={options.optional}
                                    onChange={(event) =>
                                      setStepOptionDrafts((current) => ({
                                        ...current,
                                        [step.id]: { ...options, optional: event.target.checked }
                                      }))
                                    }
                                    type="checkbox"
                                  />
                                  Optional step
                                </label>
                                <label>
                                  <input
                                    checked={options.skip}
                                    onChange={(event) =>
                                      setStepOptionDrafts((current) => ({
                                        ...current,
                                        [step.id]: { ...options, skip: event.target.checked }
                                      }))
                                    }
                                    type="checkbox"
                                  />
                                  Skip step
                                </label>
                              </div>
                            </div>
                          ) : null}
                        </article>
                      );
	                        })}
	                      </>
	                    )}
	                    {automationStepView === "keyword" ? (
	                    <article className="automation-keyword-step is-expanded">
	                      <div className="automation-keyword-step-summary">
	                        <span className="count-pill">New</span>
	                        <strong>Add automated step</strong>
	                        {newStepPlacement.mode !== "end" ? (
	                          <span className="automation-step-group-chip">
	                            {newStepPlacementLabel}
	                          </span>
	                        ) : null}
	                        <StatusBadge value="draft" />
	                      </div>
	                      <div className="automation-keyword-step-body">
	                        <div className="automation-step-editor-grid">
	                          <label className="form-field">
	                            <span>Step type</span>
	                            <select
	                              value={newStepDraft.step_type}
	                              onChange={(event) => {
	                                const nextType = event.target.value as TestStepType;
	                                setNewStepDraft((current) => ({
	                                  ...current,
	                                  step_type: nextType,
	                                  keyword: AUTOMATION_KEYWORDS_BY_TYPE[nextType][0]
	                                }));
	                              }}
	                            >
	                              <option value="web">Web</option>
	                              <option value="api">API</option>
	                              <option value="android">Android</option>
	                              <option value="ios">iOS</option>
	                            </select>
	                          </label>
	                          <label className="form-field">
	                            <span>Step name</span>
	                            <input value={newStepDraft.name} onChange={(event) => setNewStepDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Describe the automated action" />
	                          </label>
	                          <label className="form-field">
	                            <span>Keyword</span>
	                            <select value={newStepDraft.keyword} onChange={(event) => setNewStepDraft((current) => ({ ...current, keyword: event.target.value }))}>
	                              {AUTOMATION_KEYWORDS_BY_TYPE[newStepDraft.step_type].map((keyword) => (
	                                <option key={keyword} value={keyword}>{keyword}</option>
	                              ))}
	                            </select>
                          </label>
                          <label className="form-field">
                            <span>Repository member</span>
                            <select value={newStepDraft.objectRef} onChange={(event) => setNewStepDraft((current) => ({ ...current, objectRef: event.target.value }))}>
                              <option value="">Select repository member</option>
                              {allObjectMembers.map((member) => (
                                <option key={member.entry.id} value={member.ref}>{member.ref} · {member.htmlTag}</option>
                              ))}
                            </select>
                          </label>
                          <label className="form-field">
                            <span>Value / parameter</span>
                            <input value={newStepDraft.value} onChange={(event) => setNewStepDraft((current) => ({ ...current, value: event.target.value }))} placeholder="@t.userEmail" />
                          </label>
		                        </div>
	                        <div className="testops-action-row">
	                          <button className="primary-button" disabled={createAutomationStep.isPending || (!newStepDraft.name.trim() && !newStepDraft.objectRef.trim())} onClick={() => createAutomationStep.mutate()} type="button">
	                            <AddIcon />
	                            <span>{createAutomationStep.isPending ? "Adding..." : "Add automated step"}</span>
	                          </button>
	                          {newStepPlacement.mode !== "end" ? (
	                            <button className="ghost-button" onClick={() => setNewStepPlacement({ mode: "end", stepId: "" })} type="button">
	                              Add at end
	                            </button>
	                          ) : null}
	                        </div>
	                      </div>
	                    </article>
                    ) : null}
                  </div>
                </AutomationAccordionSection>

                <AutomationAccordionSection
                  countLabel={`${activeCaseHistory.length} run${activeCaseHistory.length === 1 ? "" : "s"}`}
                  isExpanded={expandedCaseSections.history}
                  onToggle={() => toggleCaseSection("history")}
                  summary={activeCaseHistory.length ? "Recent local and manual execution outcomes for this automation case." : "No run history yet."}
                  title="Run history"
                >
                  <div className="automation-run-history">
                    {!activeCaseHistory.length ? <div className="empty-state compact">No run history yet.</div> : null}
                    {activeCaseHistory.map((result) => (
                      <article className="automation-history-row" key={result.id}>
                        <div>
                          <strong>{result.test_case_title || activeCase.title}</strong>
                          <span>{result.created_at ? formatRunDate.format(new Date(result.created_at)) : "Run timestamp unavailable"} · {result.duration_ms ? `${Math.round(result.duration_ms / 1000)}s` : "duration pending"}</span>
                          {result.error ? <p>{result.error}</p> : null}
                        </div>
                        <StatusBadge value={result.status} />
                      </article>
                    ))}
                  </div>
                </AutomationAccordionSection>
              </div>
            )}
          </Panel>
          )}
        />
      ) : null}

	      {view === "repository" ? (
	        <div className={[
	          "automation-workspace-grid automation-workspace-grid--repository",
	          selectedRepositoryEntry && isRepositoryConfigOpen ? "has-config-drawer" : ""
	        ].filter(Boolean).join(" ")}
	          style={selectedRepositoryEntry && isRepositoryConfigOpen ? ({ "--object-repository-config-width": `${repositoryConfigDrawerWidth}px` } as CSSProperties) : undefined}
	        >
          <Panel
            title="Object repository"
            subtitle="Screen-level fields grouped by page, with friendly member names, HTML tag details, locator, DOM, image, and fallback intelligence."
            actions={(
              <div className="testops-action-row">
	                <button className="ghost-button" onClick={() => openRepositoryInspect(activePageObject)} type="button">
	                  <MousePointerIcon />
	                  <span>Inspect screen</span>
	                </button>
                <button className="ghost-button" onClick={() => {
                  setIsAddingRepositoryScreen((current) => !current);
                  setIsAddingRepositoryField(false);
                }} type="button">
                  <AddIcon />
                  <span>Add screen</span>
                </button>
	                <button className="ghost-button" onClick={() => setIsRepositoryImportModalOpen(true)} type="button">
	                  <ImportIcon />
	                  <span>{isParsingRepositoryImport ? "Reading..." : "Import"}</span>
	                </button>
                <button className="ghost-button" disabled={!appTypeId || exportRepositoryCsv.isPending} onClick={() => exportRepositoryCsv.mutate()} type="button">
                  <ExportIcon />
                  <span>{exportRepositoryCsv.isPending ? "Exporting..." : "Export CSV"}</span>
                </button>
                <button className="ghost-button danger" disabled={!activePageObject || deleteRepositoryScreen.isPending} onClick={() => deleteRepositoryScreen.mutate(false)} type="button">
                  <TrashIcon size={16} />
                  <span>{deleteRepositoryScreen.isPending ? "Checking..." : "Delete screen"}</span>
                </button>
              </div>
            )}
          >
            {learningCacheQuery.isLoading ? <TileCardSkeletonGrid /> : null}
            {isAddingRepositoryScreen ? (
              <div className="automation-create-card repository-screen-create-card">
                <div className="object-repository-inspector-section-head">
                  <strong>Add repository screen</strong>
                  <span>Define the page identity now, then inspect live or extract intended fields from DOM and screenshot evidence.</span>
                </div>
	                      <div className="record-grid testops-builder-form repository-screen-overview-grid">
                  <label className="form-field"><span>Screen name</span><input value={newRepositoryScreenDraft.screen_name} onChange={(event) => setNewRepositoryScreenDraft((current) => ({ ...current, screen_name: event.target.value }))} placeholder="Checkout Page" /></label>
                  <label className="form-field"><span>Page URL</span><input value={newRepositoryScreenDraft.page_url} onChange={(event) => setNewRepositoryScreenDraft((current) => ({ ...current, page_url: event.target.value }))} placeholder="https://app.example.com/checkout" /></label>
                  <label className="form-field">
                    <span>URL match rule</span>
                    <div className="repository-url-rule">
                      <select value={newRepositoryScreenDraft.url_pattern_type} onChange={(event) => setNewRepositoryScreenDraft((current) => ({ ...current, url_pattern_type: event.target.value }))}><option value="exact">exact</option><option value="startsWith">startsWith</option><option value="endsWith">endsWith</option><option value="contains">contains</option><option value="regex">regex</option></select>
                      <input value={newRepositoryScreenDraft.url_pattern_value} onChange={(event) => setNewRepositoryScreenDraft((current) => ({ ...current, url_pattern_value: event.target.value }))} placeholder="/checkout" />
                    </div>
                  </label>
                  <label className="form-field"><span>Screenshot URL / data URL</span><input value={newRepositoryScreenDraft.screenshot_url} onChange={(event) => setNewRepositoryScreenDraft((current) => ({ ...current, screenshot_url: event.target.value }))} placeholder="Captured during inspect when blank" /></label>
                  <label className="form-field repository-span-two"><span>Purpose and intended flow</span><textarea rows={3} value={newRepositoryScreenDraft.business_meaning} onChange={(event) => setNewRepositoryScreenDraft((current) => ({ ...current, business_meaning: event.target.value }))} placeholder="Customer reviews cart, enters payment, and submits an order." /></label>
                  <label className="form-field repository-span-two"><span>Description</span><RichTextEditor rows={2} value={newRepositoryScreenDraft.description} onChange={(description) => setNewRepositoryScreenDraft((current) => ({ ...current, description }))} placeholder="Page context used when selecting stable fields." /></label>
                  <label className="form-field repository-span-two"><span>DOM / accessibility structure</span><textarea rows={6} value={newRepositoryScreenDraft.dom_structure} onChange={(event) => setNewRepositoryScreenDraft((current) => ({ ...current, dom_structure: event.target.value }))} placeholder="<main><input aria-label='Card number' />...</main>" /></label>
                </div>
                <div className="testops-action-row">
                  <button className="primary-button" disabled={addRepositoryScreen.isPending} onClick={() => addRepositoryScreen.mutate()} type="button"><MousePointerIcon /><span>{addRepositoryScreen.isPending ? "Saving..." : "Save and inspect"}</span></button>
                  <button className="ghost-button" onClick={() => setIsAddingRepositoryScreen(false)} type="button">Cancel</button>
                </div>
              </div>
            ) : null}
            {!learningCacheQuery.isLoading && !groupedRepository.length ? (
              <div className="empty-state compact">No repository objects have been learned for this scope yet.</div>
            ) : null}
            <div className="pom-workspace">
              <aside className="pom-page-list" aria-label="Repository pages">
                {pageObjectModels.map((page) => (
                  <div className={activePageObject?.screenName === page.screenName ? "pom-page-item is-active" : "pom-page-item"} key={page.screenName}>
                    {renamingScreenName === page.screenName ? (
                      <form className="pom-page-rename-form" onSubmit={(event) => {
                        event.preventDefault();
                        renameRepositoryScreen.mutate();
                      }}>
                        <input aria-label={`Rename ${page.pageName}`} autoFocus onChange={(event) => setScreenRenameDraft(event.target.value)} value={screenRenameDraft} />
                        <button className="primary-button compact" disabled={!screenRenameDraft.trim() || screenRenameDraft.trim() === activeScreenName || renameRepositoryScreen.isPending} type="submit">
                          {renameRepositoryScreen.isPending ? "Saving..." : "Save"}
                        </button>
                        <button className="ghost-button compact" disabled={renameRepositoryScreen.isPending} onClick={() => setRenamingScreenName("")} type="button">Cancel</button>
                      </form>
                    ) : (
                      <>
                        <button className="pom-page-select" onClick={() => setSelectedScreenName(page.screenName)} type="button">
                          <strong>{page.pageName}</strong>
                          <small>{appTypes.find((appType) => appType.id === page.appTypeId)?.name || "Workspace"}</small>
                        </button>
                        <button aria-label={`Rename ${page.pageName}`} className="pom-page-rename" onClick={() => {
                          setSelectedScreenName(page.screenName);
                          setScreenRenameDraft(page.pageName);
                          setRenamingScreenName(page.screenName);
                        }} type="button">
                          <PencilIcon size={15} />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </aside>

              {activePageObject ? (
                <section className="pom-class-panel" aria-label={`${activePageObject.pageName} repository page`}>
                  <SubnavTabs
                    ariaLabel="Screen details"
                    className="object-repository-screen-tabs"
                    value={screenDetailTab}
                    onChange={setScreenDetailTab}
	                    items={[
	                      { value: "overview", label: "Overview", meta: screenInfoDraft.description ? "Documented" : "Add context" },
	                      { value: "fields", label: "Fields", meta: String(activePageObject.members.length) },
	                      { value: "dom", label: "DOM Snapshot", meta: screenDomDraft ? "Captured" : "Pending" },
	                      { value: "suggestions", label: "AI Suggestions", meta: "Locator health" }
	                    ]}
                  />
                  {screenDetailTab === "overview" ? (
                    <div className="repository-screen-overview">
	                      <div className="record-grid testops-builder-form repository-screen-overview-grid">
                        <label className="form-field"><span>Screen name</span><input readOnly value={screenInfoDraft.screen_name || activeScreenName} /></label>
                        <label className="form-field"><span>Page URL</span><input onChange={(event) => setScreenUrlDraft(event.target.value)} placeholder="https://app.example.com/login" value={screenUrlDraft} /></label>
                        <label className="form-field repository-span-two">
                          <span>URL match rule</span>
                          <div className="repository-url-rule"><select value={screenInfoDraft.url_pattern_type} onChange={(event) => setScreenInfoDraft((current) => ({ ...current, url_pattern_type: event.target.value }))}><option value="exact">exact</option><option value="startsWith">startsWith</option><option value="endsWith">endsWith</option><option value="contains">contains</option><option value="regex">regex</option></select><input value={screenInfoDraft.url_pattern_value} onChange={(event) => setScreenInfoDraft((current) => ({ ...current, url_pattern_value: event.target.value }))} placeholder="/auth/login" /></div>
                        </label>
                        <label className="form-field repository-span-two"><span>Description</span><RichTextEditor rows={3} value={screenInfoDraft.description} onChange={(description) => setScreenInfoDraft((current) => ({ ...current, description }))} placeholder="What this screen represents." /></label>
                        <label className="form-field repository-span-two"><span>Intended flows</span><textarea rows={3} value={screenInfoDraft.business_meaning} onChange={(event) => setScreenInfoDraft((current) => ({ ...current, business_meaning: event.target.value }))} placeholder="Sign in, recover password, continue as guest." /></label>
                      </div>
                      <div className="testops-action-row">
                        <button className="primary-button" disabled={saveRepositoryScreenEvidence.isPending} onClick={() => saveRepositoryScreenEvidence.mutate()} type="button"><LayersIcon /><span>{saveRepositoryScreenEvidence.isPending ? "Saving..." : "Save screen"}</span></button>
	                        <button className="ghost-button" onClick={() => openRepositoryInspect(activePageObject)} type="button"><MousePointerIcon /><span>Inspect screen</span></button>
	                        <button className="ghost-button" disabled={(!screenDomDraft && !screenScreenshotDraft) || extractRepositoryFields.isPending} onClick={() => {
	                          openRepositoryInspect(activePageObject);
	                          extractRepositoryFields.mutate();
	                        }} type="button"><SparkIcon /><span>{extractRepositoryFields.isPending ? "Suggesting..." : "AI suggest fields"}</span></button>
                      </div>
                    </div>
                  ) : null}
                  {screenDetailTab === "fields" ? (
                    <div className="repository-fields-panel">
                      <div className="testops-action-row">
                        <button className="ghost-button" onClick={() => {
                          setIsAddingRepositoryField((current) => !current);
                          setIsAddingRepositoryScreen(false);
                        }} type="button">
                          <AddIcon />
                          <span>Add field</span>
                        </button>
                      </div>
                      {isAddingRepositoryField ? (
                        <div className="automation-create-card">
                          <strong>Add repository field manually</strong>
                          <div className="record-grid testops-builder-form">
                            <label className="form-field"><span>Screen name</span><input readOnly value={activeScreenName} /></label>
                            <label className="form-field"><span>Field name</span><input value={newRepositoryFieldDraft.object_name} onChange={(event) => setNewRepositoryFieldDraft((current) => ({ ...current, object_name: event.target.value }))} placeholder="Email input" /></label>
                            <label className="form-field"><span>Element type / role</span><input value={newRepositoryFieldDraft.object_role} onChange={(event) => setNewRepositoryFieldDraft((current) => ({ ...current, object_role: event.target.value }))} placeholder="textbox" /></label>
                            <label className="form-field"><span>Primary strategy</span><input value={newRepositoryFieldDraft.locator_kind} onChange={(event) => setNewRepositoryFieldDraft((current) => ({ ...current, locator_kind: event.target.value }))} placeholder="data-testid" /></label>
                            <label className="form-field repository-span-two"><span>Primary locator</span><input value={newRepositoryFieldDraft.locator} onChange={(event) => setNewRepositoryFieldDraft((current) => ({ ...current, locator: event.target.value }))} placeholder="[data-testid='email']" /></label>
                          </div>
                          <div className="testops-action-row">
                            <button className="primary-button" disabled={addRepositoryField.isPending} onClick={() => addRepositoryField.mutate()} type="button"><AddIcon /><span>{addRepositoryField.isPending ? "Adding..." : "Save field"}</span></button>
                            <button className="ghost-button" onClick={() => setIsAddingRepositoryField(false)} type="button">Cancel</button>
                          </div>
                        </div>
                      ) : null}
                      <div className="pom-member-table">
                        <div className="pom-member-row is-head">
                          <span>Field</span>
                          <span>Type</span>
                          <span>Primary locator</span>
                        </div>
                        {activePageObject.members.map((member) => (
	                          <button className={`pom-member-row${selectedRepositoryEntry?.id === member.entry.id ? " is-active" : ""}${highlightedRepositoryId === member.entry.id ? " is-highlighted" : ""}`} key={member.entry.id} onClick={() => selectRepositoryEntry(member.entry.id, activePageObject.screenName)} type="button">
                            <code>{member.memberName}</code>
                            <span>{member.htmlTag} · {member.role}</span>
                            <small>{member.entry.locator}</small>
                          </button>
                        ))}
                        {!activePageObject.members.length ? <div className="empty-state compact">No saved fields yet. Add a field, inspect the screen, or select AI suggestions.</div> : null}
                      </div>
                    </div>
                  ) : null}
                  {screenDetailTab === "dom" ? (
                    <div className="repository-evidence-block">
                      {screenScreenshotDraft && isLikelyImageUrl(screenScreenshotDraft) ? <img alt={`${activePageObject.pageName} full screen`} src={screenScreenshotDraft} /> : null}
                      <label>Full DOM / accessibility tree</label>
                      <pre>{screenDomDraft || screenInfoDraft.accessibility_tree || "No full-page DOM or accessibility snapshot captured."}</pre>
                      <small>Fingerprint: {screenInfoDraft.screen_fingerprint || "Not generated"}</small>
                    </div>
                  ) : null}
                  {screenDetailTab === "suggestions" ? (
                    <div className="repository-callout-list">
                      <div className="object-repository-ai-strip">
                        <SparkIcon />
                        <InfoTooltip
                          content="Prefer `data-testid`, `aria-label`, and `role + name`; keep CSS and XPath as fallbacks only."
                          label="Locator health information"
                        />
                      </div>
                      {selectedRepositoryEntry ? (
                        <InfoTooltip
                          content={`Selected field stability: ${Math.round(normalizeMetadataNumber(selectedRepositoryEntry.metadata?.stability_score, selectedRepositoryEntry.confidence) * 100)}%. Use AI improve to propose a healed locator from captured evidence.`}
                          label="Selected field stability information"
                        />
                      ) : null}
                    </div>
                  ) : null}
                </section>
              ) : null}
            </div>
          </Panel>

	          {selectedRepositoryEntry && isRepositoryConfigOpen ? (
		            <aside className="panel card automation-detail-panel object-repository-config-drawer" aria-label="Object configuration">
		              <button
		                aria-label="Resize object configuration panel"
		                className="object-repository-config-resize-handle"
		                onKeyDown={handleRepositoryConfigResizeKeyDown}
		                onPointerDown={handleRepositoryConfigResizeStart}
		                title="Drag left or right to resize object configuration"
		                type="button"
		              />
		              <div className="object-repository-config-head">
	                <div>
	                  <strong>Object Configuration</strong>
	                  <span>Element Configuration: {repositoryDraft.object_name || getRepositoryMemberName(selectedRepositoryEntry)}</span>
	                </div>
	                <button
	                  aria-label="Close object configuration"
	                  className="object-repository-config-close"
	                  onClick={() => setIsRepositoryConfigOpen(false)}
	                  title="Close object configuration"
	                  type="button"
	                >
	                  <svg aria-hidden="true" fill="none" height="18" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="18">
	                    <path d="M18 6 6 18" />
	                    <path d="m6 6 12 12" />
	                  </svg>
	                </button>
	              </div>
	              <div className="testops-action-row object-repository-config-actions">
	                <button className="ghost-button" onClick={() => void highlightRepositoryLocator(selectedRepositoryEntry.locator, `${activeScreenName}.${getRepositoryMemberName(selectedRepositoryEntry)}`, selectedRepositoryEntry.id).catch((error) => setInspectMessage(error instanceof Error ? error.message : "Unable to highlight field."))} type="button">
	                  <MousePointerIcon />
	                  <span>Highlight</span>
	                </button>
	                <button className="ghost-button" disabled={improveRepositoryEntry.isPending || applyRepositoryImprovement.isPending} onClick={() => improveRepositoryEntry.mutate()} type="button">
	                  <SparkIcon />
	                  <span>{improveRepositoryEntry.isPending ? "Preparing..." : locatorImprovementPreview ? "Regenerate proposal" : "Suggest improvement"}</span>
	                </button>
	                <button className="primary-button" disabled={saveRepositoryEntry.isPending} onClick={() => saveRepositoryEntry.mutate()} type="button">
	                  <PlayIcon />
	                  <span>{saveRepositoryEntry.isPending ? "Saving..." : "Save field"}</span>
	                </button>
	                <button className="ghost-button danger" disabled={deleteRepositoryEntry.isPending} onClick={() => deleteRepositoryEntry.mutate(false)} type="button">
	                  <TrashIcon size={16} />
	                  <span>{deleteRepositoryEntry.isPending ? "Checking..." : "Delete field"}</span>
	                </button>
	              </div>
	              <div className="repository-field-detail">
	                <AiAssurancePanel
	                  compact
	                  gaps={selectedLocatorReviewReadiness.gaps}
	                  provenance="Saved locator strategies, stability metadata, validation history, DOM/accessibility evidence, and captured images"
	                  reviewState="review-required"
	                  score={selectedLocatorReviewReadiness.score}
	                  scoreLabel={selectedLocatorReviewReadiness.scoreLabel}
	                  signals={selectedLocatorReviewReadiness.signals}
	                  summary={selectedLocatorReviewReadiness.summary}
	                  title="Locator healing readiness"
	                />
	                {locatorImprovementPreview ? (
	                  <section className="locator-improvement-review" aria-label="Locator improvement review">
	                    <div className="locator-improvement-review-head">
	                      <div>
	                        <span>Proposed change</span>
	                        <strong>Human approval required</strong>
	                      </div>
	                      <span className="count-pill">{locatorImprovementPreview.generation_mode === "llm" ? "AI proposal" : "Rule-based proposal"}</span>
	                    </div>
	                    <div className="locator-improvement-diff">
	                      <div>
	                        <span>Current</span>
	                        <b>{selectedRepositoryEntry.locator_kind || "css"}</b>
	                        <code>{selectedRepositoryEntry.locator}</code>
	                      </div>
	                      <div>
	                        <span>Proposed</span>
	                        <b>{locatorImprovementPreview.suggestion.strategy || "No strategy returned"}</b>
	                        <code>{locatorImprovementPreview.suggestion.locator || "No locator returned"}</code>
	                      </div>
	                    </div>
	                    <p>{locatorImprovementPreview.suggestion.reason || locatorImprovementPreview.fallback_reason || "Review the proposed locator against captured evidence before applying it."}</p>
	                    <div className="locator-improvement-provenance">
	                      <span>{locatorImprovementPreview.provenance?.provider || (locatorImprovementPreview.generation_mode === "llm" ? "Configured AI provider" : "Qaira deterministic rules")}</span>
	                      {locatorImprovementPreview.provenance?.model ? <span>{locatorImprovementPreview.provenance.model}</span> : null}
	                      {locatorImprovementPreview.request_id ? <code>{locatorImprovementPreview.request_id}</code> : null}
	                    </div>
	                    <div className="action-row">
	                      <button
	                        className="primary-button"
	                        disabled={applyRepositoryImprovement.isPending || !locatorImprovementPreview.suggestion.locator || !locatorImprovementPreview.suggestion.strategy}
	                        onClick={() => applyRepositoryImprovement.mutate()}
	                        type="button"
	                      >
	                        {applyRepositoryImprovement.isPending ? "Applying..." : "Apply reviewed change"}
	                      </button>
	                      <button className="ghost-button" disabled={applyRepositoryImprovement.isPending} onClick={() => setLocatorImprovementPreview(null)} type="button">
	                        Discard proposal
	                      </button>
	                    </div>
	                  </section>
	                ) : null}
	                <SubnavTabs
	                  ariaLabel="Field details"
	                  className="object-repository-screen-tabs"
                  value={fieldDetailTab}
                  onChange={setFieldDetailTab}
                  items={[
	                    { value: "locators", label: "Locators", meta: `${selectedLocators.length} strategies` },
	                    { value: "evidence", label: "Evidence", meta: "DOM + visual" },
	                    { value: "meaning", label: "AI Meaning", meta: "Agent context" }
	                  ]}
                />
                {fieldDetailTab === "locators" ? (
                  <div className="repository-locator-detail">
                    <div className="repository-locator-list">
                      {selectedLocators.map((locator) => (
                        <article key={`${locator.strategy}-${locator.locator}`}>
                          <StatusBadge value={locator.isPrimary ? "Primary" : "Fallback"} />
                          <strong>{locator.strategy}</strong>
                          <code>{locator.locator}</code>
                          <span>{Math.round(locator.confidenceScore * 100)}% · {locator.lastValidatedStatus}</span>
                        </article>
                      ))}
                    </div>
                    <div className="record-grid testops-builder-form">
                    <label className="form-field">
                      <span>Screen name</span>
                      <input readOnly value={screenInfoDraft.screen_name || activeScreenName} />
                    </label>
                    <label className="form-field">
                      <span>Inherited screen URL rule</span>
                      <input readOnly value={`${screenInfoDraft.url_pattern_type} ${screenInfoDraft.url_pattern_value}`} />
                    </label>
                    <label className="form-field">
                      <span>Field name</span>
                      <input value={repositoryDraft.object_name} onChange={(event) => setRepositoryDraft((current) => ({ ...current, object_name: event.target.value }))} />
                    </label>
                    <label className="form-field">
                      <span>Element type / role</span>
                      <input value={repositoryDraft.object_role} onChange={(event) => setRepositoryDraft((current) => ({ ...current, object_role: event.target.value }))} />
                    </label>
                    <label className="form-field">
                      <span>Primary locator · {Math.round(selectedRepositoryEntry.confidence * 100)}% confidence</span>
                      <input value={repositoryDraft.locator} onChange={(event) => setRepositoryDraft((current) => ({ ...current, locator: event.target.value }))} />
                    </label>
                    <label className="form-field">
                      <span>Primary strategy</span>
                      <input value={repositoryDraft.locator_kind} onChange={(event) => setRepositoryDraft((current) => ({ ...current, locator_kind: event.target.value }))} />
                    </label>
                    <label className="form-field repository-span-two">
                      <span>Fallback locators · `strategy | locator | confidence %`</span>
                      <textarea rows={4} value={repositoryDraft.fallback_locators} onChange={(event) => setRepositoryDraft((current) => ({ ...current, fallback_locators: event.target.value }))} placeholder={"aria-label | [aria-label='Login'] | 90\ncss | button[type='submit'] | 70"} />
                    </label>
                    <label className="form-field">
                      <span>Stability score (%)</span>
                      <input max="100" min="0" type="number" value={repositoryDraft.stability_score} onChange={(event) => setRepositoryDraft((current) => ({ ...current, stability_score: event.target.value }))} />
                    </label>
                    <label className="form-field">
                      <span>Inherited screen fingerprint</span>
                      <input readOnly value={screenInfoDraft.screen_fingerprint} placeholder="Capture screen evidence to generate identity" />
                    </label>
                    </div>
                  </div>
                ) : null}
                {fieldDetailTab === "evidence" ? (
                  <div className="record-grid testops-builder-form">
                    <label className="form-field"><span>Element screenshot URL</span><input value={repositoryDraft.element_screenshot_url} onChange={(event) => setRepositoryDraft((current) => ({ ...current, element_screenshot_url: event.target.value }))} /></label>
                    <label className="form-field"><span>Ancestor screenshot URL</span><input value={repositoryDraft.ancestor_screenshot_url} onChange={(event) => setRepositoryDraft((current) => ({ ...current, ancestor_screenshot_url: event.target.value }))} /></label>
                    <label className="form-field repository-span-two"><span>Parent / ancestor DOM snapshot</span><textarea rows={5} value={repositoryDraft.ancestor_dom || repositoryDraft.dom_structure} onChange={(event) => setRepositoryDraft((current) => ({ ...current, ancestor_dom: event.target.value }))} /></label>
                    <label className="form-field repository-span-two"><span>Inherited screen accessibility tree</span><textarea readOnly rows={5} value={screenInfoDraft.accessibility_tree} /></label>
                    {repositoryDraft.element_screenshot_url && isLikelyImageUrl(repositoryDraft.element_screenshot_url) ? <div className="object-repository-snapshot"><img alt={`${repositoryDraft.object_name} element`} src={repositoryDraft.element_screenshot_url} /></div> : null}
                  </div>
                ) : null}
                {fieldDetailTab === "meaning" ? (
                  <div className="record-grid testops-builder-form">
                    <label className="form-field repository-span-two"><span>AI-generated description</span><RichTextEditor rows={3} value={repositoryDraft.description} onChange={(description) => setRepositoryDraft((current) => ({ ...current, description }))} /></label>
                    <label className="form-field repository-span-two"><span>Business meaning</span><textarea rows={3} value={repositoryDraft.business_meaning} onChange={(event) => setRepositoryDraft((current) => ({ ...current, business_meaning: event.target.value }))} /></label>
                    <label className="form-field"><span>Usage keywords</span><input value={repositoryDraft.usage_keywords} onChange={(event) => setRepositoryDraft((current) => ({ ...current, usage_keywords: event.target.value }))} placeholder="login, submit, authenticate" /></label>
                    <label className="form-field repository-span-two"><span>Healing guidance</span><textarea rows={3} value={repositoryDraft.fallback_strategy} onChange={(event) => setRepositoryDraft((current) => ({ ...current, fallback_strategy: event.target.value }))} /></label>
	                  </div>
	                ) : null}
	              </div>
	            </aside>
	          ) : null}

	          {isRepositoryImportModalOpen ? (
	            <div className="modal-backdrop" onClick={() => !importRepositoryEntries.isPending && setIsRepositoryImportModalOpen(false)} role="presentation">
	              <div
	                aria-labelledby="object-repository-import-title"
	                aria-modal="true"
	                className="modal-card import-modal-card"
	                onClick={(event) => event.stopPropagation()}
	                role="dialog"
	              >
	                <div className="import-modal-header">
	                  <div className="import-modal-title">
	                    <p className="dialog-context-label">Object repository import</p>
	                    <div className="modal-title-info-row">
	                      <h2 className="dialog-title" id="object-repository-import-title">Import screens and fields</h2>
	                      <InfoTooltip
	                        content="Upload a QAira OR CSV, individual page object files, or a ZIP archive. CSV rows import as saved screens and fields; source files are parsed locally for Playwright, Selenium Java, C#, JavaScript, and TypeScript locators."
	                        label="Object repository import information"
	                      />
	                    </div>
	                  </div>
	                  <button
	                    aria-label="Close object repository import dialog"
	                    className="ghost-button"
	                    disabled={importRepositoryEntries.isPending}
	                    onClick={() => setIsRepositoryImportModalOpen(false)}
	                    type="button"
	                  >
	                    Close
	                  </button>
	                </div>
	                <div className="import-modal-body">
	                  <label className={isParsingRepositoryImport ? "repository-import-dropzone is-disabled" : "repository-import-dropzone"}>
	                    <ImportIcon />
	                    <strong>{isParsingRepositoryImport ? "Reading files..." : "Choose CSV, source files, or ZIP"}</strong>
	                    <span>Supported: .csv, .zip, .js, .jsx, .ts, .tsx, .java, .cs</span>
	                    <input
	                      accept=".csv,.zip,.js,.jsx,.ts,.tsx,.java,.cs,text/csv,application/zip"
	                      disabled={isParsingRepositoryImport || importRepositoryEntries.isPending}
	                      multiple
	                      onChange={(event) => void handleRepositoryImportFiles(event)}
	                      type="file"
	                    />
	                  </label>
	                  <div className="metric-strip compact">
	                    <div className="mini-card">
	                      <strong>{repositoryImportPreview?.entries.filter((entry) => entry.record_type === "screen").length || 0}</strong>
	                      <span>Screens</span>
	                    </div>
	                    <div className="mini-card">
	                      <strong>{repositoryImportPreview?.entries.filter((entry) => entry.record_type === "field").length || 0}</strong>
	                      <span>Fields</span>
	                    </div>
	                    <div className="mini-card">
	                      <strong>{repositoryImportPreview?.fileNames.length || 0}</strong>
	                      <span>Files read</span>
	                    </div>
	                  </div>
	                  <div className="detail-summary">
	                    <strong>{repositoryImportPreview?.fileNames[0] || "No import loaded yet"}</strong>
	                    <span>{repositoryImportPreview?.fileNames.length ? `${repositoryImportPreview.fileNames.length} source item${repositoryImportPreview.fileNames.length === 1 ? "" : "s"} parsed for the selected application scope.` : "Choose input above to preview normalized repository records before saving."}</span>
	                  </div>
	                  {repositoryImportPreview?.inputKinds.length ? (
	                    <div className="repository-import-metrics">
	                      {repositoryImportPreview.inputKinds.map((kind) => <StatusBadge key={kind} value={getRepositoryImportKindLabel(kind)} />)}
	                    </div>
	                  ) : null}
	                  {repositoryImportPreview?.warnings.length ? (
	                    <div className="empty-state compact">
	                      {repositoryImportPreview.warnings.slice(0, 8).map((warning) => <div key={warning}>{warning}</div>)}
	                    </div>
	                  ) : null}
	                  {repositoryImportPreview?.entries.length ? (
	                    <div className="repository-import-preview-list">
	                      {repositoryImportPreview.entries.filter((entry) => entry.record_type === "field").slice(0, 8).map((entry) => (
	                        <article key={`${entry.screen_name}-${entry.object_name}-${entry.locator}`}>
	                          <strong>{entry.screen_name}.{entry.object_name}</strong>
	                          <code>{entry.locator}</code>
	                        </article>
	                      ))}
	                      {repositoryImportPreview.entries.filter((entry) => entry.record_type === "field").length > 8 ? (
	                        <small>And {repositoryImportPreview.entries.filter((entry) => entry.record_type === "field").length - 8} more fields.</small>
	                      ) : null}
	                    </div>
	                  ) : null}
	                </div>
	                <div className="action-row import-modal-actions">
	                  <button className="primary-button" disabled={!repositoryImportPreview?.entries.length || importRepositoryEntries.isPending} onClick={() => importRepositoryEntries.mutate()} type="button">
	                    <ImportIcon />
	                    <span>{importRepositoryEntries.isPending ? "Importing..." : `Import ${repositoryImportPreview?.entries.length || ""} OR records`}</span>
	                  </button>
	                  <button className="ghost-button" disabled={!repositoryImportPreview || importRepositoryEntries.isPending} onClick={() => setRepositoryImportPreview(null)} type="button">
	                    Clear preview
	                  </button>
	                </div>
	              </div>
	            </div>
	          ) : null}

	          {isInspectOpen ? (
            <div className="modal-backdrop" role="presentation">
              <div className="dialog object-repository-inspector" role="dialog" aria-modal="true" aria-label="Object repository inspector">
                <div className="dialog-header">
                  <div>
                    <div className="modal-title-info-row">
                      <h2>Inspect screen into repository</h2>
                      <InfoTooltip
                        content="Select fields in the browser, remove mistakes from the selection, then save the screen and fields together."
                        label="Inspect screen information"
                      />
                    </div>
                  </div>
                  <button className="ghost-button compact" onClick={() => setIsInspectOpen(false)} type="button">Close</button>
                </div>
                <div className="object-repository-live-inspect">
                  <div className="object-repository-inspector-steps" aria-label="Inspect capture steps">
                    <span className={inspectRecorderSession?.status === "running" ? "is-complete" : "is-active"}><strong>1</strong> Browser</span>
                    <span className={selectedInspectTabId ? "is-complete" : inspectRecorderSession?.status === "running" ? "is-active" : ""}><strong>2</strong> Select tab</span>
                      <span className={isInspectingLiveField ? "is-active" : stagedInspectFields.length || browserInspectFields.length ? "is-complete" : ""}><strong>3</strong> Select fields</span>
                    <span className={stagedInspectFields.length ? "is-active" : ""}><strong>4</strong> Review and save</span>
                  </div>
                  <div className="object-repository-live-inspect-head">
                    <div>
                      <strong>Live browser inspect</strong>
                      <span>{inspectRecorderSession?.status === "running" ? `Connected to dedicated inspect session ${inspectRecorderSession.id.slice(0, 8)}. Tabs refresh automatically.` : "Launch browser probes localhost:4311 and localhost:4301, reusing an existing inspection Chrome session when one is open."}</span>
                    </div>
                    <div className="testops-action-row">
                      <button
                        className="ghost-button"
                        disabled={isLaunchingInspectBrowser}
                        onClick={() => void launchInspectBrowser().catch((error) => setInspectMessage(error instanceof Error ? error.message : "Unable to launch inspect browser."))}
                        type="button"
                      >
                        <MousePointerIcon />
                        <span>{inspectRecorderSession?.status === "running" ? "Use browser" : isLaunchingInspectBrowser ? "Connecting..." : "Launch browser"}</span>
                      </button>
                      <button
                        className="ghost-button"
                        disabled={!inspectRecorderSession?.id}
                        onClick={() => void loadInspectTabs().catch((error) => setInspectMessage(error instanceof Error ? error.message : "Unable to refresh tabs."))}
                        type="button"
                      >
                        <LayersIcon />
                        <span>Refresh tabs</span>
                      </button>
                        <button
                          className="primary-button"
                          disabled={!inspectRecorderSession?.id}
                          onClick={() => void (isInspectingLiveField ? stopLiveInspect() : startLiveInspect()).catch((error) => setInspectMessage(error instanceof Error ? error.message : "Unable to update inspect mode."))}
                          type="button"
                        >
                          <SparkIcon />
                          <span>{isInspectingLiveField ? "Stop selecting" : stagedInspectFields.length || browserInspectFields.length ? "Select more fields" : "Select fields"}</span>
                        </button>
                    </div>
                  </div>
                  <div className="object-repository-capture-workspace">
                    <section className="object-repository-browser-preview">
                      <strong>Browser view</strong>
                      {inspectRecorderLiveUrl ? (
                        <iframe src={inspectRecorderLiveUrl} title="Inspect browser live view" />
                      ) : (
                        <div className="empty-state compact">Browser preview appears after the recorder starts.</div>
                      )}
                    </section>
                    <section className="object-repository-tab-area">
                      <strong>Open tabs</strong>
                      <div className="object-repository-tab-picker">
                        {inspectTabs.length ? inspectTabs.map((tab) => (
                          <button
                            className={selectedInspectTabId === tab.id ? "is-active" : ""}
                            key={tab.id || tab.url}
                            onClick={() => setSelectedInspectTabId(tab.id || "")}
                            type="button"
                          >
                            <strong>{tab.title || "Untitled tab"}</strong>
                            <span>{tab.url || "about:blank"}</span>
                          </button>
                        )) : (
                          <div className="empty-state compact">{inspectRecorderSession?.status === "running" ? "Waiting for an inspectable browser tab..." : "Launch the browser to load tabs."}</div>
                        )}
                      </div>
                    </section>
                  </div>
                  {inspectMessage ? <div className="object-repository-inspect-message">{inspectMessage}</div> : null}
                  <section className="object-repository-selected-fields" aria-label="Fields selected for saving">
                    <div className="object-repository-inspector-section-head">
                      <strong>Selected fields <span className="selection-count">{stagedInspectFields.length}</span></strong>
                      <span>Blue highlights in the browser match this selection. Remove any unwanted fields before saving.</span>
                    </div>
                    <div className="object-repository-selected-grid">
                      {stagedInspectFields.map((field) => (
                        <article key={field.locator}>
                            <div>
                              <strong>{field.name}</strong>
                              <small>{field.tag} · {field.locator}</small>
                            </div>
                            <StatusBadge value={field.source === "ai_extract" ? "AI selected" : "Selected"} />
                            <div className="object-repository-field-actions">
                              <button className="ghost-button compact" onClick={() => void highlightRepositoryLocator(field.locator, field.name, "", { retainExisting: true }).catch((error) => setInspectMessage(error instanceof Error ? error.message : "Unable to highlight selected field."))} type="button"><MousePointerIcon size={14} /><span>Highlight</span></button>
                              <button className="ghost-button compact danger" onClick={() => removeStagedInspectField(field.locator)} type="button"><TrashIcon size={14} /><span>Remove</span></button>
                            </div>
                          </article>
                      ))}
                      {!stagedInspectFields.length ? <div className="empty-state compact">Nothing selected yet. Choose <strong>Select fields</strong> and click controls in the browser, or request AI suggestions.</div> : null}
                    </div>
                  </section>
                </div>
                <div className="object-repository-inspector-grid">
                  <div className="object-repository-inspector-inputs">
                    <details className="object-repository-static-evidence">
                      <summary>
                        <span>
                          <strong>Screen evidence</strong>
                          <small>{screenInfoDraft.screen_name || activeScreenName || "Screen identity"}</small>
                        </span>
                      </summary>
                      <label className="form-field">
                        <span>Screen name</span>
                        <input readOnly={Boolean(activeScreenName)} value={screenInfoDraft.screen_name} onChange={(event) => setScreenInfoDraft((current) => ({ ...current, screen_name: event.target.value }))} placeholder="Login Page" />
                      </label>
                      <label className="form-field">
                        <span>Screen URL path</span>
                        <input value={screenUrlDraft} onChange={(event) => setScreenUrlDraft(event.target.value)} placeholder="/login or https://app.example.com/login" />
                      </label>
                      <label className="form-field">
                        <span>URL match rule</span>
                        <div className="repository-url-rule"><select value={screenInfoDraft.url_pattern_type} onChange={(event) => setScreenInfoDraft((current) => ({ ...current, url_pattern_type: event.target.value }))}><option value="exact">exact</option><option value="startsWith">startsWith</option><option value="endsWith">endsWith</option><option value="contains">contains</option><option value="regex">regex</option></select><input value={screenInfoDraft.url_pattern_value} onChange={(event) => setScreenInfoDraft((current) => ({ ...current, url_pattern_value: event.target.value }))} placeholder="/auth/login" /></div>
                      </label>
                      <label className="form-field">
                        <span>Intended flow / business meaning</span>
                        <textarea rows={3} value={screenInfoDraft.business_meaning} onChange={(event) => setScreenInfoDraft((current) => ({ ...current, business_meaning: event.target.value }))} placeholder="Sign in, recover password, or continue as guest." />
                      </label>
                      <label className="form-field">
                        <span>Description</span>
                        <RichTextEditor rows={3} value={screenInfoDraft.description} onChange={(description) => setScreenInfoDraft((current) => ({ ...current, description }))} placeholder="Purpose and boundaries of this screen." />
                      </label>
                      <details className="object-repository-advanced-evidence">
                        <summary>Advanced evidence and DOM</summary>
                      <label className="form-field">
                        <span>Screen fingerprint</span>
                        <input value={screenInfoDraft.screen_fingerprint} onChange={(event) => setScreenInfoDraft((current) => ({ ...current, screen_fingerprint: event.target.value }))} placeholder="Captured after live field selection" />
                      </label>
                      <label className="form-field">
                        <span>Screen screenshot URL / data URL</span>
                        <input value={screenScreenshotDraft} onChange={(event) => setScreenScreenshotDraft(event.target.value)} placeholder="Automatically captured during live inspect" />
                      </label>
                      <label className="form-field">
                        <span>Screen DOM</span>
                        <textarea rows={10} value={screenDomDraft} onChange={(event) => setScreenDomDraft(event.target.value)} placeholder="<input name='username' aria-label='Username' />" />
                      </label>
                      </details>
                    </details>
                  </div>
                    <div className="object-repository-inspector-preview">
                      <div className="object-repository-inspector-section-head">
                        <strong>{suggestedInspectFields.length ? `${suggestedInspectFields.length} field suggestions` : "Suggested fields"}</strong>
                        <span>DOM and AI suggestions are not saved until selected and committed with the screen.</span>
                      </div>
                      {browserInspectFields.length ? (
                        <section className="object-repository-browser-candidates" aria-label="Fields highlighted in the browser">
                          <div className="object-repository-browser-candidates-head">
                            <div>
                              <strong>Highlighted in browser <span className="selection-count">{browserInspectFields.length}</span></strong>
                              <small>These are the controls you clicked in inspect mode. Select the ones to save.</small>
                            </div>
                            <button className="ghost-button compact" onClick={selectAllBrowserInspectFields} type="button">Select all highlighted</button>
                          </div>
                          {browserInspectFields.map((field) => (
                            <article className="object-repository-inspector-candidate is-browser-candidate" key={`browser-${field.locator}`}>
                              <button onClick={() => {
                                setRepositoryDraft((current) => ({
                                  ...current,
                                  object_name: field.name,
                                  object_role: `${field.tag} / ${field.role}`,
                                  locator: field.locator,
                                  locator_kind: field.locatorKind,
                                  fallback_locators: formatLocatorDraft([{ locator: field.locator, strategy: field.locatorKind, confidenceScore: 0.8, isPrimary: true }, ...field.fallbackLocators]),
                                  dom_structure: field.dom,
                                  description: current.description || `${field.name} captured from live inspect.`,
                                  screenshot_url: field.elementScreenshotUrl || current.screenshot_url
                                }));
                                void highlightRepositoryLocator(field.locator, field.name, "", { retainExisting: true }).catch((error) => setInspectMessage(error instanceof Error ? error.message : "Unable to highlight captured field."));
                              }} type="button">
                                <span>{field.name}</span>
                                <small>{field.tag} · {field.locator}</small>
                              </button>
                              <div className="object-repository-candidate-actions">
                                <button className="ghost-button compact" onClick={() => {
                                  stageInspectField(field);
                                  void highlightRepositoryLocator(field.locator, field.name, "", { retainExisting: true, silent: true }).catch(() => null);
                                }} type="button">Select</button>
                                <button className="ghost-button compact" onClick={() => void highlightRepositoryLocator(field.locator, field.name, "", { retainExisting: true }).catch((error) => setInspectMessage(error instanceof Error ? error.message : "Unable to highlight captured field."))} type="button">Highlight</button>
                                <button className="ghost-button compact danger" onClick={() => dismissBrowserInspectField(field.locator)} type="button">Dismiss</button>
                              </div>
                            </article>
                          ))}
                        </section>
                      ) : null}
                      {suggestedInspectFields.map((field) => {
                        const isSelected = stagedInspectFields.some((selectedField) => selectedField.locator === field.locator);
                        return (
                          <article className={isSelected ? "object-repository-inspector-candidate is-selected" : "object-repository-inspector-candidate"} key={`${field.name}-${field.locator}`}>
                            <button onClick={() => {
                              setRepositoryDraft((current) => ({
                                ...current,
                                object_name: field.name,
                                object_role: `${field.tag} / ${field.role}`,
                                locator: field.locator,
                                locator_kind: field.locatorKind,
                                fallback_locators: formatLocatorDraft([{ locator: field.locator, strategy: field.locatorKind, confidenceScore: 0.8, isPrimary: true }, ...field.fallbackLocators]),
                                dom_structure: field.dom,
                                description: current.description || `${field.name} detected from ${field.source === "ai_extract" ? "AI screen analysis" : "screen DOM"}.`,
                                screenshot_url: screenScreenshotDraft || current.screenshot_url
                              }));
                              if (inspectRecorderSession?.status === "running") {
                                void highlightRepositoryLocator(field.locator, field.name, "", { retainExisting: true, silent: true }).catch((error) => setInspectMessage(error instanceof Error ? error.message : "Unable to highlight candidate."));
                              }
                            }} type="button">
                              <span>{field.name}</span>
                              <small>{field.tag} · {field.locator}</small>
                            </button>
                            <div className="object-repository-candidate-actions">
                              <button className="ghost-button compact" onClick={() => void highlightRepositoryLocator(field.locator, field.name, "", { retainExisting: true }).catch((error) => setInspectMessage(error instanceof Error ? error.message : "Unable to highlight candidate."))} type="button">
                                <span>Highlight</span>
                              </button>
                              <button className={`ghost-button compact${isSelected ? " danger" : ""}`} onClick={() => {
                                if (isSelected) {
                                  removeStagedInspectField(field.locator);
                                  return;
                                }
                                stageInspectField({ ...field, source: field.source === "ai_extract" ? "ai_extract" : "dom_candidate" });
                                if (inspectRecorderSession?.status === "running") {
                                  void highlightRepositoryLocator(field.locator, field.name, "", { retainExisting: true, silent: true }).catch((error) => setInspectMessage(error instanceof Error ? error.message : "Unable to highlight candidate."));
                                }
                              }} type="button">
                                <span>{isSelected ? "Remove" : "Select"}</span>
                              </button>
                            </div>
                          </article>
                        );
                      })}
                      {!suggestedInspectFields.length && !browserInspectFields.length ? <div className="empty-state compact">Capture fields live, or provide DOM/screenshot evidence and choose AI suggest fields.</div> : null}
                    </div>
                </div>
                <div className="testops-action-row object-repository-inspector-footer">
                  <button className="ghost-button" disabled={(!screenDomDraft && !screenScreenshotDraft) || extractRepositoryFields.isPending} onClick={() => extractRepositoryFields.mutate()} type="button">
                    <SparkIcon />
                    <span>{extractRepositoryFields.isPending ? "Suggesting..." : "AI suggest fields"}</span>
                  </button>
                  <button className="primary-button" disabled={saveInspectedScreenFields.isPending} onClick={() => saveInspectedScreenFields.mutate()} type="button">
                    <LayersIcon />
                    <span>{saveInspectedScreenFields.isPending ? "Saving..." : `Save screen and fields${stagedInspectFields.length ? ` (${stagedInspectFields.length})` : ""}`}</span>
                  </button>
                  <button className="ghost-button" onClick={() => setIsInspectOpen(false)} type="button">Close</button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {isParameterDialogOpen ? (
        <StepParameterDialog
          getInputState={(parameter) => resolveParameterInputState(parameter.scope)}
          headerContent={(
            <div className="step-parameter-dialog-context">
              <div className="step-parameter-dialog-context-card">
                <strong>Automation test data</strong>
                <span>`@t` saves on this automation case, `@s` saves on the selected linked suite, and `@r` is supplied by the run context.</span>
              </div>
              {activeCaseSuiteIds.length ? (
                <div className="step-parameter-dialog-context-card">
                  <strong>Suite target</strong>
                  <div className="selection-chip-row">
                    {activeCaseSuiteIds.map((suiteId) => {
                      const suite = suites.find((item) => item.id === suiteId);
                      return (
                        <button
                          className={suiteId === selectedParameterSuiteId ? "selection-chip is-selected" : "selection-chip is-unselected"}
                          key={suiteId}
                          onClick={() => setSelectedParameterSuiteId(suiteId)}
                          type="button"
                        >
                          {suite?.name || suiteId}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          )}
          onChange={handleParameterValueChange}
          onClose={() => setIsParameterDialogOpen(false)}
          parameters={detectedStepParameters}
          subtitle="Use the same @t, @s, and @r data scopes as manual test cases."
          title="Automation case parameter values"
          values={mergedParameterValues}
        />
      ) : null}

      {repositoryUsageBlock ? (
        <div className="modal-backdrop" role="presentation">
          <div className="dialog object-repository-usage-dialog" role="dialog" aria-modal="true" aria-label="Repository usage">
            <div className="dialog-header">
              <div>
                <div className="modal-title-info-row">
                  <h2>{repositoryUsageBlock.title}</h2>
                  <InfoTooltip
                    content="This repository object is referenced by the test cases below. Deleting it will keep the cases, mark automated ones incomplete, and prevent execution until their bindings are repaired."
                    label="Repository usage information"
                  />
                </div>
              </div>
              <button className="ghost-button compact" onClick={() => setRepositoryUsageBlock(null)} type="button">Close</button>
            </div>
            <div className="stack-list">
              {repositoryUsageBlock.usage.map((testCase) => (
                <button className="stack-item" key={testCase.id} onClick={() => navigate(testCase.automated === "yes" ? `/automation?case=${encodeURIComponent(testCase.id)}` : `/test-cases?case=${encodeURIComponent(testCase.id)}`)} type="button">
                  <div>
                    <strong>{testCase.title}</strong>
                    <span>{testCase.display_id || testCase.id} · {testCase.automated === "yes" ? "Automation case" : "Manual case"}</span>
                  </div>
                  <OpenIcon size={16} />
                </button>
              ))}
            </div>
            <div className="testops-action-row">
              <button
                className="primary-button danger"
                disabled={deleteRepositoryEntry.isPending || deleteRepositoryScreen.isPending}
                onClick={() => repositoryUsageBlock.kind === "field" ? deleteRepositoryEntry.mutate(true) : deleteRepositoryScreen.mutate(true)}
                type="button"
              >
                <TrashIcon size={16} />
                <span>Delete and mark incomplete</span>
              </button>
              <button className="ghost-button" onClick={() => setRepositoryUsageBlock(null)} type="button">Cancel</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
