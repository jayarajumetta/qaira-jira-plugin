import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PlayIcon, SparkIcon } from "./AppIcons";
import { FormField } from "./FormField";
import { InfoTooltip } from "./InfoTooltip";
import { SharedStepsIcon as SharedStepsIconGraphic } from "./SharedStepsIcon";
import { api } from "../lib/api";
import { useDialogFocus } from "../hooks/useDialogFocus";
import { parseStepParameterName, resolveStepParameterText, type StepParameterDefinition, type StepParameterScope } from "../lib/stepParameters";
import {
  buildAutomationKeywordMappings,
  buildApiValidationAssertionCode,
  ensureApiRequest,
  getStepTypeMeta,
  normalizeApiRequest,
  normalizeAutomationCode,
  normalizeStepType,
  resolveStepAutomationCode,
  STEP_TYPE_OPTIONS
} from "../lib/stepAutomation";
import type { ApiRequestPreview, AutomationLearningCacheEntry, StepApiRequest, StepApiValidation, TestStepType } from "../types";
import { DialogCloseButton } from "./DialogCloseButton";

type StepAutomationInput = {
  id?: string;
  step_order?: number;
  action?: string | null;
  expected_result?: string | null;
  step_type?: TestStepType | null;
  automation_code?: string | null;
  api_request?: StepApiRequest | null;
};

type JsonPathSelection = {
  path: string;
  value: unknown;
};

type StepAutomationParameterScopeState = {
  disabled?: boolean;
  hint?: string;
};

type WebKeywordOption = {
  id: string;
  label: string;
  locatorLabel: string;
  dataLabel: string;
  locatorRequired?: boolean;
  dataRequired?: boolean;
};

type AndroidKeywordOption = {
  id: string;
  label: string;
  selectorLabel: string;
  valueLabel: string;
  selectorRequired?: boolean;
  valueRequired?: boolean;
  hint?: string;
};

const WEB_KEYWORD_OPTIONS: WebKeywordOption[] = [
  { id: "aiStep", label: "AI Step", locatorLabel: "Optional target", dataLabel: "Instruction", dataRequired: true },
  { id: "codedJS", label: "CodedJS", locatorLabel: "Optional target", dataLabel: "Edit generated code below" },
  { id: "goto", label: "Open URL", locatorLabel: "URL or path", dataLabel: "Optional note", locatorRequired: true },
  { id: "openTab", label: "Open tab", locatorLabel: "URL or path", dataLabel: "Optional note" },
  { id: "switchTab", label: "Switch tab", locatorLabel: "Index, title, URL, or latest", dataLabel: "Optional note" },
  { id: "closeTab", label: "Close tab", locatorLabel: "Index, title, URL, latest, or current", dataLabel: "Optional note" },
  { id: "reload", label: "Reload page", locatorLabel: "Optional note", dataLabel: "Wait until" },
  { id: "goBack", label: "Go back", locatorLabel: "Optional note", dataLabel: "Wait until" },
  { id: "goForward", label: "Go forward", locatorLabel: "Optional note", dataLabel: "Wait until" },
  { id: "waitForLoadState", label: "Wait load state", locatorLabel: "Optional note", dataLabel: "load, domcontentloaded, or networkidle" },
  { id: "click", label: "Click", locatorLabel: "Locator", dataLabel: "Optional note", locatorRequired: true },
  { id: "hover", label: "Hover", locatorLabel: "Locator", dataLabel: "Optional note", locatorRequired: true },
  { id: "dblclick", label: "Double click", locatorLabel: "Locator", dataLabel: "Optional note", locatorRequired: true },
  { id: "rightClick", label: "Right click", locatorLabel: "Locator", dataLabel: "Optional note", locatorRequired: true },
  { id: "fill", label: "Fill", locatorLabel: "Locator", dataLabel: "Text or token", locatorRequired: true, dataRequired: true },
  { id: "clear", label: "Clear", locatorLabel: "Input locator", dataLabel: "Optional note", locatorRequired: true },
  { id: "select", label: "Select option", locatorLabel: "Select locator", dataLabel: "Option value", locatorRequired: true, dataRequired: true },
  { id: "check", label: "Check", locatorLabel: "Checkbox locator", dataLabel: "Optional note", locatorRequired: true },
  { id: "uncheck", label: "Uncheck", locatorLabel: "Checkbox locator", dataLabel: "Optional note", locatorRequired: true },
  { id: "press", label: "Press Key", locatorLabel: "Locator optional", dataLabel: "Key", dataRequired: true },
  { id: "scroll", label: "Scroll", locatorLabel: "Direction", dataLabel: "Pixels", dataRequired: true },
  { id: "wait", label: "Wait", locatorLabel: "Optional note", dataLabel: "Milliseconds", dataRequired: true },
  { id: "expectVisible", label: "Assert Visible", locatorLabel: "Locator", dataLabel: "Optional note", locatorRequired: true },
  { id: "expectText", label: "Assert Text", locatorLabel: "Locator optional", dataLabel: "Expected text", dataRequired: true },
  { id: "expectUrl", label: "Assert URL", locatorLabel: "Optional note", dataLabel: "URL fragment", dataRequired: true },
  { id: "captureText", label: "Capture Text", locatorLabel: "Locator", dataLabel: "Param token", locatorRequired: true, dataRequired: true },
  { id: "captureValue", label: "Capture Value", locatorLabel: "Locator", dataLabel: "Param token", locatorRequired: true, dataRequired: true }
];

const ANDROID_KEYWORD_OPTIONS: AndroidKeywordOption[] = [
  { id: "aiStep", label: "AI Step", selectorLabel: "Optional selector", valueLabel: "Instruction", valueRequired: true },
  { id: "codedJS", label: "CodedJS", selectorLabel: "Optional selector", valueLabel: "Edit generated code below" },
  { id: "tap", label: "Tap", selectorLabel: "UiAutomator/XPath/accessibility id", valueLabel: "Optional note", selectorRequired: true },
  { id: "tapPoint", label: "Tap point", selectorLabel: "X,Y", valueLabel: "Optional note", selectorRequired: true, hint: "Example: 540,1200" },
  { id: "doubleTap", label: "Double tap", selectorLabel: "Selector or point:X,Y", valueLabel: "Optional note", selectorRequired: true },
  { id: "longPress", label: "Long press", selectorLabel: "Selector or point:X,Y", valueLabel: "Duration ms", selectorRequired: true },
  { id: "type", label: "Type", selectorLabel: "Input selector", valueLabel: "Text or token", selectorRequired: true, valueRequired: true },
  { id: "clear", label: "Clear", selectorLabel: "Input selector", valueLabel: "Optional note", selectorRequired: true },
  { id: "hideKeyboard", label: "Hide keyboard", selectorLabel: "Optional note", valueLabel: "Optional note" },
  { id: "waitForDisplayed", label: "Wait visible", selectorLabel: "Selector", valueLabel: "Timeout ms", selectorRequired: true },
  { id: "waitForExist", label: "Wait exists", selectorLabel: "Selector", valueLabel: "Timeout ms", selectorRequired: true },
  { id: "expectText", label: "Assert text", selectorLabel: "Selector", valueLabel: "Expected text", selectorRequired: true, valueRequired: true },
  { id: "expectDisplayed", label: "Assert visible", selectorLabel: "Selector", valueLabel: "Optional note", selectorRequired: true },
  { id: "expectNotDisplayed", label: "Assert hidden", selectorLabel: "Selector", valueLabel: "Timeout ms", selectorRequired: true },
  { id: "expectEnabled", label: "Assert enabled", selectorLabel: "Selector", valueLabel: "Optional note", selectorRequired: true },
  { id: "expectValue", label: "Assert value", selectorLabel: "Selector", valueLabel: "Expected value", selectorRequired: true, valueRequired: true },
  { id: "swipe", label: "Swipe", selectorLabel: "Start X,Y", valueLabel: "End X,Y,duration", selectorRequired: true, valueRequired: true, hint: "Example: selector 500,1500 and value 500,500,300" },
  { id: "scrollIntoView", label: "Scroll into view", selectorLabel: "Selector/text", valueLabel: "Direction", selectorRequired: true },
  { id: "pressBack", label: "Press back", selectorLabel: "Optional note", valueLabel: "Optional note" },
  { id: "pressKeyCode", label: "Press key code", selectorLabel: "Android key code", valueLabel: "Optional note", selectorRequired: true },
  { id: "backgroundApp", label: "Background app", selectorLabel: "Seconds", valueLabel: "Optional note" },
  { id: "activateApp", label: "Activate app", selectorLabel: "App package", valueLabel: "Optional note", selectorRequired: true },
  { id: "terminateApp", label: "Terminate app", selectorLabel: "App package", valueLabel: "Optional note", selectorRequired: true },
  { id: "setOrientation", label: "Set orientation", selectorLabel: "PORTRAIT or LANDSCAPE", valueLabel: "Optional note", selectorRequired: true },
  { id: "pause", label: "Pause", selectorLabel: "Milliseconds", valueLabel: "Optional note", selectorRequired: true }
];

const quoteCodeString = (value: string) => JSON.stringify(value);
const formatOptionsObject = (entries: Record<string, string | number | boolean | null | undefined>) => {
  const lines = Object.entries(entries)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `  ${key}: ${typeof value === "string" ? quoteCodeString(value) : String(value)}`);

  return `{\n${lines.join(",\n")}\n}`;
};

const WEB_ELEMENT_DEFAULTS = {
  timeoutMs: 10000,
  scroll: "nearest",
  waitFor: "visible",
  force: false
};

const WEB_TYPE_DEFAULTS = {
  ...WEB_ELEMENT_DEFAULTS,
  clear: true,
  type: "char-by-char",
  delayMs: 35
};

function playwrightLocatorExpression(target: string) {
  return `page.locator(${quoteCodeString(target)})`;
}

function webdriverElementBlock(selector: string, lines: string[]) {
  return [
    "{",
    `  const element = await driver.$(${quoteCodeString(selector)});`,
    ...lines.map((line) => `  ${line}`),
    "}"
  ].join("\n");
}

function buildWebKeywordSnippet(option: WebKeywordOption, locator: string, data: string) {
  const target = locator.trim();
  const value = data.trim();
  const loadState = /^(load|domcontentloaded|networkidle)$/i.test(value) ? value.toLowerCase() : "domcontentloaded";
  const locatorExpression = playwrightLocatorExpression(target);
  const targetBlock = (lines: string[]) => [
    "{",
    `  const target = ${locatorExpression};`,
    ...lines.map((line) => `  ${line}`),
    "}"
  ].join("\n");

  switch (option.id) {
    case "aiStep":
      return `await web.aiStep(${quoteCodeString(value)}, ${formatOptionsObject({ target: target || undefined })});`;
    case "goto":
      return [
        `await page.goto(${quoteCodeString(target)});`,
        `await page.waitForLoadState("domcontentloaded");`
      ].join("\n");
    case "openTab":
      // The QAira helper mirrors Playwright context.newPage() and keeps later page.* calls on the active tab.
      return `await web.openTab(${target ? quoteCodeString(target) : "null"}, ${formatOptionsObject({ timeoutMs: 30000, waitUntil: "domcontentloaded" })});`;
    case "switchTab":
      // The QAira helper mirrors choosing a Page from browserContext.pages() and makes it active.
      return `await web.switchTab(${quoteCodeString(target || "latest")});`;
    case "closeTab":
      // The QAira helper mirrors Page.close() and moves the runtime to the next available tab.
      return target ? `await web.closeTab(${quoteCodeString(target)});` : "await web.closeTab();";
    case "reload":
      return [
        `await page.reload();`,
        `await page.waitForLoadState(${quoteCodeString(loadState)});`
      ].join("\n");
    case "goBack":
      return [
        `await page.goBack();`,
        `await page.waitForLoadState(${quoteCodeString(loadState)});`
      ].join("\n");
    case "goForward":
      return [
        `await page.goForward();`,
        `await page.waitForLoadState(${quoteCodeString(loadState)});`
      ].join("\n");
    case "waitForLoadState":
      return `await page.waitForLoadState(${quoteCodeString(loadState)});`;
    case "click":
      return targetBlock([
        `await target.waitFor({ state: "visible", timeout: 10000 });`,
        `await target.click();`
      ]);
    case "hover":
      return targetBlock([
        `await target.waitFor({ state: "visible", timeout: 10000 });`,
        `await target.hover();`
      ]);
    case "dblclick":
      return targetBlock([
        `await target.waitFor({ state: "visible", timeout: 10000 });`,
        `await target.dblclick();`
      ]);
    case "rightClick":
      return targetBlock([
        `await target.waitFor({ state: "visible", timeout: 10000 });`,
        `await target.click({ button: "right" });`
      ]);
    case "fill":
      return targetBlock([
        `await target.waitFor({ state: "visible", timeout: 10000 });`,
        `await target.fill(${quoteCodeString(value)});`
      ]);
    case "clear":
      return targetBlock([
        `await target.waitFor({ state: "visible", timeout: 10000 });`,
        `await target.fill("");`
      ]);
    case "select":
      return targetBlock([
        `await target.waitFor({ state: "visible", timeout: 10000 });`,
        `await target.selectOption(${quoteCodeString(value)});`
      ]);
    case "check":
      return targetBlock([
        `await target.waitFor({ state: "visible", timeout: 10000 });`,
        `await target.check();`
      ]);
    case "uncheck":
      return targetBlock([
        `await target.waitFor({ state: "visible", timeout: 10000 });`,
        `await target.uncheck();`
      ]);
    case "press":
      return target
        ? targetBlock([
            `await target.waitFor({ state: "visible", timeout: 10000 });`,
            `await target.press(${quoteCodeString(value)});`
          ])
        : `await page.press("body", ${quoteCodeString(value)});`;
    case "scroll": {
      const direction = /^(up|left)$/i.test(target) ? target.toLowerCase() : "down";
      const amount = Math.max(1, Number.parseInt(value, 10) || 600);
      const deltaX = direction === "left" ? -amount : direction === "right" ? amount : 0;
      const deltaY = direction === "up" ? -amount : direction === "down" ? amount : 0;
      return `await page.mouse.wheel(${deltaX}, ${deltaY});`;
    }
    case "wait":
      return `await page.waitForTimeout(${Math.max(0, Number.parseInt(value, 10) || 1000)});`;
    case "expectVisible":
      return `await expect(${locatorExpression}).toBeVisible();`;
    case "expectText":
      return target
        ? `await expect(${locatorExpression}).toContainText(${quoteCodeString(value)});`
        : `await expect(page.locator("body")).toContainText(${quoteCodeString(value)});`;
    case "expectUrl":
      return `await expect(page).toHaveURL(${quoteCodeString(value)});`;
    case "captureText":
      return targetBlock([
        `await target.waitFor({ state: "visible", timeout: 10000 });`,
        `capture(${quoteCodeString(value || "@t.capturedText")}, (await target.textContent())?.trim() || "");`
      ]);
    case "captureValue":
      return targetBlock([
        `await target.waitFor({ state: "visible", timeout: 10000 });`,
        `capture(${quoteCodeString(value || "@t.capturedValue")}, await target.inputValue());`
      ]);
    default:
      return "";
  }
}

function buildAndroidKeywordSnippet(option: AndroidKeywordOption, selector: string, data: string) {
  const target = selector.trim();
  const value = data.trim();
  const splitNumbers = (source: string) => source.split(",").map((item) => Number.parseInt(item.trim(), 10) || 0);
  const pointTarget = target.replace(/^point:/i, "");
  const [pointX, pointY] = splitNumbers(pointTarget);

  switch (option.id) {
    case "aiStep":
      return `await android.aiStep(${quoteCodeString(value)}, ${formatOptionsObject({ selector: target || undefined })});`;
    case "tap":
      return webdriverElementBlock(target, [
        `await element.waitForDisplayed({ timeout: 10000 });`,
        `await element.click();`
      ]);
    case "tapPoint":
      return `await driver.action("pointer").move({ x: ${pointX || 0}, y: ${pointY || 0} }).down().up().perform();`;
    case "doubleTap":
      if (/^(point:)?\d+\s*,\s*\d+$/i.test(target)) {
        return [
          `await driver.action("pointer").move({ x: ${pointX || 0}, y: ${pointY || 0} }).down().up().perform();`,
          `await driver.pause(80);`,
          `await driver.action("pointer").move({ x: ${pointX || 0}, y: ${pointY || 0} }).down().up().perform();`
        ].join("\n");
      }
      return webdriverElementBlock(target, [
        `await element.waitForDisplayed({ timeout: 10000 });`,
        `await element.click();`,
        `await driver.pause(80);`,
        `await element.click();`
      ]);
    case "longPress": {
      const duration = Math.max(250, Number.parseInt(value, 10) || 800);
      if (/^(point:)?\d+\s*,\s*\d+$/i.test(target)) {
        return `await driver.action("pointer").move({ x: ${pointX || 0}, y: ${pointY || 0} }).down().pause(${duration}).up().perform();`;
      }
      return webdriverElementBlock(target, [
        `await element.waitForDisplayed({ timeout: 10000 });`,
        `const location = await element.getLocation();`,
        `const size = await element.getSize();`,
        `await driver.action("pointer").move({ x: Math.round(location.x + size.width / 2), y: Math.round(location.y + size.height / 2) }).down().pause(${duration}).up().perform();`
      ]);
    }
    case "type":
      return webdriverElementBlock(target, [
        `await element.waitForDisplayed({ timeout: 10000 });`,
        `await element.clearValue();`,
        `await element.setValue(${quoteCodeString(value)});`
      ]);
    case "clear":
      return webdriverElementBlock(target, [
        `await element.waitForDisplayed({ timeout: 10000 });`,
        `await element.clearValue();`
      ]);
    case "hideKeyboard":
      return "await driver.hideKeyboard().catch(() => undefined);";
    case "waitForDisplayed":
      return webdriverElementBlock(target, [
        `await element.waitForDisplayed({ timeout: ${Math.max(250, Number.parseInt(value, 10) || 10000)} });`
      ]);
    case "waitForExist":
      return webdriverElementBlock(target, [
        `await element.waitForExist({ timeout: ${Math.max(250, Number.parseInt(value, 10) || 10000)} });`
      ]);
    case "expectText":
      return webdriverElementBlock(target, [
        `await element.waitForDisplayed({ timeout: 10000 });`,
        `const actualText = await element.getText();`,
        `if (!String(actualText).includes(${quoteCodeString(value)})) {`,
        `  throw new Error(${quoteCodeString(`Expected ${target} text to contain ${value}`)} + \`, received \${actualText}\`);`,
        `}`
      ]);
    case "expectDisplayed":
      return webdriverElementBlock(target, [
        `await element.waitForDisplayed({ timeout: 10000 });`
      ]);
    case "expectNotDisplayed":
      return webdriverElementBlock(target, [
        `await element.waitForDisplayed({ timeout: ${Math.max(250, Number.parseInt(value, 10) || 10000)}, reverse: true });`
      ]);
    case "expectEnabled":
      return webdriverElementBlock(target, [
        `await element.waitForDisplayed({ timeout: 10000 });`,
        `if (!await element.isEnabled()) {`,
        `  throw new Error(${quoteCodeString(`Expected ${target} to be enabled`)});`,
        `}`
      ]);
    case "expectValue":
      return webdriverElementBlock(target, [
        `await element.waitForDisplayed({ timeout: 10000 });`,
        `const actualValue = await element.getAttribute("value").catch(() => null) || await element.getText().catch(() => "");`,
        `if (!String(actualValue).includes(${quoteCodeString(value)})) {`,
        `  throw new Error(${quoteCodeString(`Expected ${target} value to contain ${value}`)} + \`, received \${actualValue}\`);`,
        `}`
      ]);
    case "swipe": {
      const [startX, startY] = splitNumbers(target);
      const [endX, endY, duration] = splitNumbers(value);
      return [
        `await driver.touchAction([`,
        `  { action: "press", x: ${startX || 500}, y: ${startY || 1500} },`,
        `  { action: "wait", ms: ${duration || 300} },`,
        `  { action: "moveTo", x: ${endX || 500}, y: ${endY || 500} },`,
        `  "release"`,
        `]);`
      ].join("\n");
    }
    case "scrollIntoView":
      return [
        "{",
        `  const direction = ${quoteCodeString(/^(up|left)$/i.test(value) ? "up" : "down")};`,
        `  for (let attempt = 0; attempt < 6; attempt += 1) {`,
        `    const element = await driver.$(${quoteCodeString(target)});`,
        `    if (await element.isDisplayed().catch(() => false)) break;`,
        `    const size = await driver.getWindowSize();`,
        `    const startY = direction === "down" ? Math.round(size.height * 0.75) : Math.round(size.height * 0.25);`,
        `    const endY = direction === "down" ? Math.round(size.height * 0.25) : Math.round(size.height * 0.75);`,
        `    await driver.touchAction([`,
        `      { action: "press", x: Math.round(size.width / 2), y: startY },`,
        `      { action: "wait", ms: 250 },`,
        `      { action: "moveTo", x: Math.round(size.width / 2), y: endY },`,
        `      "release"`,
        `    ]);`,
        `  }`,
        `  await (await driver.$(${quoteCodeString(target)})).waitForDisplayed({ timeout: 10000 });`,
        "}"
      ].join("\n");
    case "pressBack":
      return "await driver.back();";
    case "pressKeyCode":
      return `await driver.pressKeyCode(${Math.max(0, Number.parseInt(target, 10) || 0)});`;
    case "backgroundApp":
      return `await driver.background(${Math.max(1, Number.parseInt(target || value, 10) || 3)});`;
    case "activateApp":
      return `await driver.activateApp(${quoteCodeString(target)});`;
    case "terminateApp":
      return `await driver.terminateApp(${quoteCodeString(target)});`;
    case "setOrientation":
      return `await driver.setOrientation(${quoteCodeString(/landscape/i.test(target) ? "LANDSCAPE" : "PORTRAIT")});`;
    case "pause":
      return `await driver.pause(${Math.max(0, Number.parseInt(target, 10) || 1000)});`;
    default:
      return "";
  }
}

const CURL_VALUE_FLAGS = new Set([
  "-X",
  "--request",
  "-H",
  "--header",
  "-d",
  "--data",
  "--data-raw",
  "--data-binary",
  "--data-ascii",
  "--data-urlencode",
  "--url",
  "-A",
  "--user-agent"
]);

const CURL_BOOLEAN_FLAGS = new Set([
  "-G",
  "-I",
  "--head",
  "-k",
  "--insecure",
  "-L",
  "--location",
  "-s",
  "--silent",
  "-i",
  "--include",
  "--compressed",
  "--http1.1",
  "--http2"
]);
const CURL_API_METHODS = new Set<NonNullable<StepApiRequest["method"]>>(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

function tokenizeCurlCommand(source: string) {
  const normalized = String(source || "").replace(/\\\r?\n/g, " ");
  const tokens: string[] = [];
  let current = "";
  let quote: "\"" | "'" | null = null;
  let escaped = false;

  for (const char of normalized) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }

    if ((char === "\"" || char === "'") && (!quote || quote === char)) {
      quote = quote ? null : char;
      continue;
    }

    if (!quote && /\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

function readCurlFlagValue(tokens: string[], index: number) {
  const token = tokens[index] || "";
  const equalsIndex = token.indexOf("=");

  if (equalsIndex > 0 && token.startsWith("--")) {
    return {
      flag: token.slice(0, equalsIndex),
      value: token.slice(equalsIndex + 1),
      nextIndex: index
    };
  }

  if (/^-X[A-Za-z]+$/.test(token)) {
    return {
      flag: "-X",
      value: token.slice(2),
      nextIndex: index
    };
  }

  return {
    flag: token,
    value: tokens[index + 1] || "",
    nextIndex: index + 1
  };
}

function parseHeaderLine(value: string) {
  const separatorIndex = value.indexOf(":");

  if (separatorIndex <= 0) {
    return null;
  }

  return {
    key: value.slice(0, separatorIndex).trim(),
    value: value.slice(separatorIndex + 1).trim()
  };
}

function inferBodyMode(body: string, headers: Array<{ key: string; value: string }>): StepApiRequest["body_mode"] {
  const contentType = headers.find((header) => header.key.toLowerCase() === "content-type")?.value.toLowerCase() || "";
  const trimmedBody = body.trim();

  if (!trimmedBody) {
    return "none";
  }

  if (contentType.includes("json") || /^[\[{]/.test(trimmedBody)) {
    return "json";
  }

  if (contentType.includes("xml") || /^<[\s\S]+>$/.test(trimmedBody)) {
    return "xml";
  }

  if (contentType.includes("x-www-form-urlencoded") || /^[^=&\s]+=[\s\S]*(&[^=&\s]+=[\s\S]*)*$/.test(trimmedBody)) {
    return "form";
  }

  return "text";
}

function parseCurlRequest(source: string): { request: StepApiRequest; warnings: string[] } {
  const tokens = tokenizeCurlCommand(source);
  const warnings: string[] = [];

  if (!tokens.length) {
    throw new Error("Paste a cURL command before building the request.");
  }

  let index = tokens[0] === "curl" ? 1 : 0;
  let method = "";
  let url = "";
  const headers: Array<{ key: string; value: string }> = [];
  const bodyParts: string[] = [];

  while (index < tokens.length) {
    const token = tokens[index];

    if (token === "--") {
      index += 1;
      continue;
    }

    if (token.startsWith("-")) {
      const { flag, value, nextIndex } = readCurlFlagValue(tokens, index);

      if (flag === "-X" || flag === "--request") {
        method = value.toUpperCase();
        index = nextIndex + 1;
        continue;
      }

      if (flag === "-H" || flag === "--header") {
        const header = parseHeaderLine(value);

        if (header) {
          headers.push(header);
        } else {
          warnings.push(`Ignored header "${value}" because it is missing a colon.`);
        }

        index = nextIndex + 1;
        continue;
      }

      if (flag === "--url") {
        url = value;
        index = nextIndex + 1;
        continue;
      }

      if (flag === "-d" || flag.startsWith("--data")) {
        bodyParts.push(value);
        index = nextIndex + 1;
        continue;
      }

      if (flag === "-A" || flag === "--user-agent") {
        headers.push({ key: "User-Agent", value });
        index = nextIndex + 1;
        continue;
      }

      if (flag === "-I" || flag === "--head") {
        method = "HEAD";
        index += 1;
        continue;
      }

      if (CURL_BOOLEAN_FLAGS.has(flag)) {
        if (flag === "-G") {
          method = "GET";
        }

        index += 1;
        continue;
      }

      if (CURL_VALUE_FLAGS.has(flag)) {
        index = nextIndex + 1;
        continue;
      }

      warnings.push(`Ignored cURL option "${token}".`);
      index += 1;
      continue;
    }

    if (!url && /^https?:\/\//i.test(token)) {
      url = token;
    }

    index += 1;
  }

  let body = bodyParts.join("&");

  if (!url) {
    throw new Error("Could not find an http or https URL in the cURL command.");
  }

  const methodCandidate = (method || (body ? "POST" : "GET")) as NonNullable<StepApiRequest["method"]>;
  const normalizedMethod = CURL_API_METHODS.has(methodCandidate) ? methodCandidate : "GET";

  if (normalizedMethod === "GET" && body) {
    try {
      const parsedUrl = new URL(url);
      const separator = parsedUrl.search ? "&" : "";
      parsedUrl.search = `${parsedUrl.search}${separator}${body}`;
      url = parsedUrl.toString();
      body = "";
    } catch {
      warnings.push("Kept GET cURL data in the body because the URL could not be updated.");
    }
  }

  return {
    request: {
      method: normalizedMethod,
      url,
      headers,
      body_mode: inferBodyMode(body, headers),
      body,
      validations: [{ kind: "status", target: "", expected: "200" }],
      captures: []
    },
    warnings
  };
}

function IconFrame({
  children,
  size = 16,
  strokeWidth = 1.85
}: {
  children: ReactNode;
  size?: number;
  strokeWidth?: number;
}) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      viewBox="0 0 24 24"
      width={size}
    >
      {children}
    </svg>
  );
}

export function StandardStepIcon({ size = 16 }: { size?: number }) {
  return (
    <IconFrame size={size}>
      <path d="M8 7h10" />
      <path d="M8 12h10" />
      <path d="M8 17h10" />
      <circle cx="5" cy="7" r="1" fill="currentColor" stroke="none" />
      <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="5" cy="17" r="1" fill="currentColor" stroke="none" />
    </IconFrame>
  );
}

export function LocalGroupIcon({ size = 16 }: { size?: number }) {
  return (
    <IconFrame size={size}>
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H10l2 2h5.5A2.5 2.5 0 0 1 20 9.5v7A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z" />
      <path d="M4 10h16" />
    </IconFrame>
  );
}

export function AutomationCodeIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.55"
      viewBox="0 0 24 24"
      width={size}
    >
      <rect height="10.8" rx="1.6" width="15.6" x="4.2" y="3.6" />
      <path d="M4.2 7.1h15.6" />
      <path d="M6.6 5.4h.05" strokeWidth="2.4" />
      <path d="M8.9 5.4h.05" strokeWidth="2.4" />
      <path d="M11.2 5.4h.05" strokeWidth="2.4" />
      <path d="m13.1 9.7-1.7 1.6 1.7 1.6" />
      <path d="m16.7 9.7 1.7 1.6-1.7 1.6" />
      <path d="m15.6 9.3-1.2 4" />
      <circle cx="8.1" cy="16.6" r="2.25" />
      <path d="M8.1 12.9v-1.1" />
      <path d="M8.1 21.4v-1.1" />
      <path d="m4.9 13.5-.8-.8" />
      <path d="m12.1 20.7-.8-.8" />
      <path d="m4.9 19.7-.8.8" />
      <path d="m12.1 12.5-.8.8" />
      <path d="M3.7 16.6H2.6" />
      <path d="M13.6 16.6h-1.1" />
      <circle cx="17.2" cy="18.2" r="1.45" />
      <path d="M17.2 15.7v-.8" />
      <path d="M17.2 21.5v-.8" />
      <path d="m15.3 16.3-.55-.55" />
      <path d="m19.65 20.65-.55-.55" />
      <path d="m15.3 20.1-.55.55" />
      <path d="m19.65 15.75-.55.55" />
    </svg>
  );
}

function RepositorySearchIcon({ size = 16 }: { size?: number }) {
  return (
    <IconFrame size={size}>
      <path d="M10.5 18a7.5 7.5 0 1 1 5.3-2.2" />
      <path d="m16 16 4.5 4.5" />
    </IconFrame>
  );
}

export function WebStepIcon({ size = 16 }: { size?: number }) {
  return (
    <IconFrame size={size}>
      <rect height="13" rx="2" width="18" x="3" y="5" />
      <path d="M3 9h18" />
      <path d="M7 20h10" />
    </IconFrame>
  );
}

export function ApiStepIcon({ size = 16 }: { size?: number }) {
  return (
    <IconFrame size={size}>
      <path d="m8 8-4 4 4 4" />
      <path d="m16 8 4 4-4 4" />
      <path d="M8 4h8" />
      <path d="M8 20h8" />
    </IconFrame>
  );
}

function ValidationPassedIcon({ size = 16 }: { size?: number }) {
  return (
    <IconFrame size={size}>
      <circle cx="12" cy="12" fill="currentColor" opacity="0.14" r="8" stroke="none" />
      <path d="m8.5 12.4 2.2 2.2 4.8-5.2" />
    </IconFrame>
  );
}

function ValidationFailedIcon({ size = 16 }: { size?: number }) {
  return (
    <IconFrame size={size}>
      <circle cx="12" cy="12" fill="currentColor" opacity="0.14" r="8" stroke="none" />
      <path d="m9 9 6 6" />
      <path d="m15 9-6 6" />
    </IconFrame>
  );
}

export function AndroidStepIcon({ size = 16 }: { size?: number }) {
  return (
    <IconFrame size={size}>
      <path d="M8 9h8a2 2 0 0 1 2 2v4H6v-4a2 2 0 0 1 2-2Z" />
      <path d="M9 9a3 3 0 0 1 6 0" />
      <path d="M9 5 7.5 3.5" />
      <path d="M15 5 16.5 3.5" />
      <circle cx="10" cy="11.5" r=".8" fill="currentColor" stroke="none" />
      <circle cx="14" cy="11.5" r=".8" fill="currentColor" stroke="none" />
      <path d="M8 15v3" />
      <path d="M16 15v3" />
    </IconFrame>
  );
}

export function IosStepIcon({ size = 16 }: { size?: number }) {
  return (
    <IconFrame size={size}>
      <rect height="16" rx="3" width="12" x="6" y="4" />
      <path d="M10 7h4" />
      <circle cx="12" cy="16.5" r=".8" fill="currentColor" stroke="none" />
    </IconFrame>
  );
}

export function StepTypeIcon({
  type,
  size = 16
}: {
  type?: string | null;
  size?: number;
}) {
  switch (normalizeStepType(type)) {
    case "api":
      return <ApiStepIcon size={size} />;
    case "android":
      return <AndroidStepIcon size={size} />;
    case "ios":
      return <IosStepIcon size={size} />;
    case "web":
    default:
      return <WebStepIcon size={size} />;
  }
}

export function StepIconButton({
  className = "",
  ariaLabel,
  title,
  children,
  onClick,
  disabled = false
}: {
  className?: string;
  ariaLabel: string;
  title: string;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      aria-label={ariaLabel}
      className={["step-inline-tool", className].filter(Boolean).join(" ")}
      disabled={disabled}
      onClick={onClick}
      title={title}
      type="button"
    >
      {children}
    </button>
  );
}

export function StepTypePickerButton({
  value,
  onChange,
  disabled = false
}: {
  value?: string | null;
  onChange: (next: TestStepType) => void;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const stepType = normalizeStepType(value);
  const meta = getStepTypeMeta(stepType);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setIsOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="step-inline-tool-shell">
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="step-inline-tool is-type"
        disabled={disabled}
        onClick={() => setIsOpen((current) => !current)}
        ref={triggerRef}
        title={`Step type: ${meta.label}`}
        type="button"
      >
        <StepTypeIcon size={15} type={stepType} />
      </button>
      {isOpen ? (
        <div className="step-type-menu" ref={menuRef} role="menu">
          {STEP_TYPE_OPTIONS.map((option) => (
            <button
              className={option.value === stepType ? "step-type-menu-item is-active" : "step-type-menu-item"}
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              role="menuitemradio"
              title={option.label}
              type="button"
            >
              <StepTypeIcon size={15} type={option.value} />
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ApiHeaderRowsEditor({
  headers,
  onChange,
  keyPlaceholder = "Header name",
  valuePlaceholder = "Header value",
  addLabel = "Add header"
}: {
  headers: Array<{ key: string; value: string }>;
  onChange: (headers: Array<{ key: string; value: string }>) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  addLabel?: string;
}) {
  const nextHeaders = headers.length ? headers : [{ key: "", value: "" }];

  return (
    <div className="automation-grid-stack">
      {nextHeaders.map((header, index) => (
        <div className="automation-inline-grid" key={`header-${index}`}>
          <input
            placeholder={keyPlaceholder}
            value={header.key}
            onChange={(event) => {
              const updated = nextHeaders.map((item, itemIndex) =>
                itemIndex === index ? { ...item, key: event.target.value } : item
              );
              onChange(updated);
            }}
          />
          <input
            placeholder={valuePlaceholder}
            value={header.value}
            onChange={(event) => {
              const updated = nextHeaders.map((item, itemIndex) =>
                itemIndex === index ? { ...item, value: event.target.value } : item
              );
              onChange(updated);
            }}
          />
          <button
            className="ghost-button inline-button"
            onClick={() => onChange(nextHeaders.filter((_, itemIndex) => itemIndex !== index))}
            type="button"
          >
            Remove
          </button>
        </div>
      ))}
      <button
        className="ghost-button inline-button"
        onClick={() => onChange([...nextHeaders, { key: "", value: "" }])}
        type="button"
      >
        {addLabel}
      </button>
    </div>
  );
}

function ApiValidationRowsEditor({
  validations,
  onChange,
  results = [],
  parameterValues = {}
}: {
  validations: StepApiValidation[];
  onChange: (validations: StepApiValidation[]) => void;
  results?: ApiValidationResultPreview[];
  parameterValues?: Record<string, string>;
}) {
  const nextValidations: StepApiValidation[] = validations.length ? validations : [{ kind: "status", operator: "eq", target: "", expected: "200" }];

  return (
    <div className="automation-grid-stack">
      {nextValidations.map((validation, index) => {
        const result = results[index] || null;
        const resolvedTarget = resolveStepParameterText(validation.target, parameterValues);
        const resolvedExpected = resolveStepParameterText(validation.expected, parameterValues);
        const showResolvedPreview =
          Boolean(validation.target || validation.expected)
          && (
            (validation.target || "") !== resolvedTarget
            || (validation.expected || "") !== resolvedExpected
          );

        return (
          <div className="automation-validation-row-shell" key={`validation-${index}`}>
            <div className="automation-validation-row">
              <select
                value={validation.kind}
                onChange={(event) => {
                  const updated = nextValidations.map((item, itemIndex) =>
                    itemIndex === index
                      ? {
                          ...item,
                          kind: event.target.value as StepApiValidation["kind"]
                        }
                      : item
                  ) as StepApiValidation[];
                  onChange(updated);
                }}
              >
                <option value="status">Status code</option>
                <option value="header">Header equals</option>
                <option value="header_present">Header exists</option>
                <option value="body_contains">Body contains</option>
                <option value="body_not_contains">Body excludes</option>
                <option value="json_path">JSON path equals</option>
                <option value="json_schema">JSON schema</option>
                <option value="response_time">Response time</option>
              </select>
              <select
                aria-label="Validation operator"
                onChange={(event) => onChange(nextValidations.map((item, itemIndex) => itemIndex === index ? { ...item, operator: event.target.value as StepApiValidation["operator"] } : item))}
                value={validation.operator || "eq"}
              >
                <option value="eq">Equals</option>
                <option value="ne">Not equal</option>
                <option value="contains">Contains</option>
                <option value="matches">Matches regex</option>
                <option value="exists">Exists</option>
                <option value="lt">Less than</option>
                <option value="lte">At most</option>
                <option value="gt">Greater than</option>
                <option value="gte">At least</option>
              </select>
              <input
                placeholder={validation.kind === "status" ? "Status code" : validation.kind === "json_path" ? "JSON path" : validation.kind === "header" ? "Header name" : "Search text"}
                title={showResolvedPreview && resolvedTarget ? `Resolved target: ${resolvedTarget}` : undefined}
                value={validation.target || ""}
                onChange={(event) => {
                  const updated = nextValidations.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, target: event.target.value } : item
                  ) as StepApiValidation[];
                  onChange(updated);
                }}
              />
              <input
                placeholder={validation.kind === "status" ? "Expected status" : "Expected value"}
                title={showResolvedPreview && resolvedExpected ? `Resolved expected: ${resolvedExpected}` : undefined}
                value={validation.expected || ""}
                onChange={(event) => {
                  const updated = nextValidations.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, expected: event.target.value } : item
                  ) as StepApiValidation[];
                  onChange(updated);
                }}
              />
              {result ? (
                <span
                  className={result.passed ? "automation-validation-status is-passed" : "automation-validation-status is-failed"}
                  title={result.summary}
                >
                  {result.passed ? <ValidationPassedIcon size={14} /> : <ValidationFailedIcon size={14} />}
                </span>
              ) : (
                <span aria-hidden="true" className="automation-validation-status is-idle" />
              )}
              <button
                className="ghost-button inline-button"
                onClick={() => onChange(nextValidations.filter((_, itemIndex) => itemIndex !== index) as StepApiValidation[])}
                type="button"
              >
                Remove
              </button>
            </div>
            {showResolvedPreview ? (
              <div className="automation-validation-preview">
                <span>Using test data</span>
                <span>{resolvedTarget || "—"}</span>
                <span>{resolvedExpected || "—"}</span>
              </div>
            ) : null}
          </div>
        );
      })}
      <button
        className="ghost-button inline-button"
        onClick={() => onChange([...nextValidations, { kind: "status" as const, operator: "eq" as const, target: "", expected: "200" }] as StepApiValidation[])}
        type="button"
      >
        Add validation
      </button>
    </div>
  );
}

function resolveApiRequestParameters(request: StepApiRequest | null, values: Record<string, string> = {}) {
  if (!request) {
    return null;
  }

  return {
    ...request,
    url: resolveStepParameterText(request.url, values),
    body: resolveStepParameterText(request.body, values),
    headers: (request.headers || []).map((header) => ({
      key: resolveStepParameterText(header.key, values),
      value: resolveStepParameterText(header.value, values)
    })),
    query_params: (request.query_params || []).map((entry) => ({
      key: resolveStepParameterText(entry.key, values),
      value: resolveStepParameterText(entry.value, values)
    })),
    cookies: (request.cookies || []).map((entry) => ({
      key: resolveStepParameterText(entry.key, values),
      value: resolveStepParameterText(entry.value, values)
    })),
    validations: (request.validations || []).map((validation) => ({
      ...validation,
      target: resolveStepParameterText(validation.target, values),
      expected: resolveStepParameterText(validation.expected, values)
    }))
  } satisfies StepApiRequest;
}

export function ApiRequestInfoDetails({
  request,
  resolvedRequest = null,
  title = "Request information"
}: {
  request: StepApiRequest | null;
  resolvedRequest?: StepApiRequest | null;
  title?: string;
}) {
  const displayRequest = request || resolvedRequest;
  const method = displayRequest?.method || "GET";
  const url = displayRequest?.url || "";
  const resolvedUrl = resolvedRequest?.url || "";
  const headers = displayRequest?.headers || [];
  const resolvedHeaders = resolvedRequest?.headers || [];
  const body = displayRequest?.body || "";
  const resolvedBody = resolvedRequest?.body || "";
  const hasResolvedDiff = Boolean(
    resolvedRequest
    && (
      resolvedUrl !== url
      || resolvedBody !== body
      || JSON.stringify(resolvedHeaders) !== JSON.stringify(headers)
    )
  );

  return (
    <details className="automation-request-details">
      <summary>
        <span>{title}</span>
        <strong>{method}</strong>
      </summary>
      <div className="automation-request-details-body">
        <div className="automation-request-info-grid">
          <span>Method</span>
          <strong>{method}</strong>
          <span>URL</span>
          <code>{url || "No request URL configured."}</code>
          {hasResolvedDiff ? (
            <>
              <span>Resolved URL</span>
              <code>{resolvedUrl || "No resolved request URL yet."}</code>
            </>
          ) : null}
          <span>Body mode</span>
          <strong>{displayRequest?.body_mode || "none"}</strong>
        </div>

        {headers.length ? (
          <div className="automation-response-meta automation-request-meta">
            <strong>Headers</strong>
            <div className="automation-response-headers">
              {headers.map((header, index) => (
                <span className="automation-response-header-chip" key={`${header.key}-${index}`}>
                  <strong>{header.key || "Header"}</strong>
                  <span>{header.value || "—"}</span>
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {body ? (
          <div className="automation-response-meta automation-request-meta">
            <strong>Body</strong>
            <pre className="automation-code-block automation-code-block--compact automation-code-block--selection">
              <code>{body}</code>
            </pre>
          </div>
        ) : null}

        {hasResolvedDiff && resolvedHeaders.length ? (
          <div className="automation-response-meta automation-request-meta">
            <strong>Resolved headers</strong>
            <div className="automation-response-headers">
              {resolvedHeaders.map((header, index) => (
                <span className="automation-response-header-chip" key={`resolved-${header.key}-${index}`}>
                  <strong>{header.key || "Header"}</strong>
                  <span>{header.value || "—"}</span>
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {hasResolvedDiff && resolvedBody ? (
          <div className="automation-response-meta automation-request-meta">
            <strong>Resolved body</strong>
            <pre className="automation-code-block automation-code-block--compact automation-code-block--selection">
              <code>{resolvedBody}</code>
            </pre>
          </div>
        ) : null}
      </div>
    </details>
  );
}

function buildChildJsonPath(parentPath: string, key: string | number) {
  if (typeof key === "number") {
    return `${parentPath}[${key}]`;
  }

  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)) {
    return `${parentPath}.${key}`;
  }

  return `${parentPath}[${JSON.stringify(key)}]`;
}

function summarizeJsonValue(value: unknown) {
  if (Array.isArray(value)) {
    return {
      typeLabel: "array",
      preview: `${value.length} item${value.length === 1 ? "" : "s"}`
    };
  }

  if (value && typeof value === "object") {
    const keyCount = Object.keys(value as Record<string, unknown>).length;
    return {
      typeLabel: "object",
      preview: `${keyCount} field${keyCount === 1 ? "" : "s"}`
    };
  }

  if (typeof value === "string") {
    return {
      typeLabel: "string",
      preview: value.length > 96 ? `${value.slice(0, 93)}...` : value || '""'
    };
  }

  if (typeof value === "number") {
    return {
      typeLabel: "number",
      preview: String(value)
    };
  }

  if (typeof value === "boolean") {
    return {
      typeLabel: "boolean",
      preview: String(value)
    };
  }

  if (value === null) {
    return {
      typeLabel: "null",
      preview: "null"
    };
  }

  return {
    typeLabel: "unknown",
    preview: ""
  };
}

function stringifyJsonSelectionValue(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatJsonSelectionValue(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

type ApiValidationResultPreview = {
  id: string;
  label: string;
  summary: string;
  passed: boolean;
};

function parseJsonPath(path: string) {
  const normalized = String(path || "").trim();

  if (!normalized || normalized === "$") {
    return [];
  }

  if (!normalized.startsWith("$")) {
    throw new Error("JPath must start with $");
  }

  const tokens: Array<string | number> = [];
  let index = 1;

  while (index < normalized.length) {
    const current = normalized[index];

    if (current === ".") {
      index += 1;
      const nextIndex = index;

      while (index < normalized.length && normalized[index] !== "." && normalized[index] !== "[") {
        index += 1;
      }

      const token = normalized.slice(nextIndex, index).trim();

      if (!token) {
        throw new Error("JPath contains an empty property segment");
      }

      tokens.push(token);
      continue;
    }

    if (current === "[") {
      index += 1;

      if (index >= normalized.length) {
        throw new Error("JPath is missing a closing bracket");
      }

      const quote = normalized[index];

      if (quote === "\"" || quote === "'") {
        index += 1;
        const nextIndex = index;

        while (index < normalized.length && normalized[index] !== quote) {
          index += 1;
        }

        if (index >= normalized.length) {
          throw new Error("JPath has an unterminated quoted property");
        }

        const token = normalized.slice(nextIndex, index);
        index += 1;

        if (normalized[index] !== "]") {
          throw new Error("JPath has an invalid quoted property segment");
        }

        index += 1;
        tokens.push(token);
        continue;
      }

      const nextIndex = index;

      while (index < normalized.length && normalized[index] !== "]") {
        index += 1;
      }

      if (index >= normalized.length) {
        throw new Error("JPath is missing a closing bracket");
      }

      const rawToken = normalized.slice(nextIndex, index).trim();
      index += 1;

      if (!/^\d+$/.test(rawToken)) {
        throw new Error("Only numeric array indexes are supported in bracket notation");
      }

      tokens.push(Number(rawToken));
      continue;
    }

    throw new Error(`Unexpected token "${current}" in JPath`);
  }

  return tokens;
}

function readJsonPathValue(source: unknown, path: string) {
  try {
    const tokens = parseJsonPath(path);
    let current: unknown = source;

    for (const token of tokens) {
      if (typeof token === "number") {
        if (!Array.isArray(current)) {
          return { found: false as const, error: `Path ${path} does not point to an array before [${token}]` };
        }

        if (token < 0 || token >= current.length) {
          return { found: false as const, error: `Path ${path} is missing array index [${token}]` };
        }

        current = current[token];
        continue;
      }

      if (!current || typeof current !== "object" || !(token in (current as Record<string, unknown>))) {
        return { found: false as const, error: `Path ${path} is missing property "${token}"` };
      }

      current = (current as Record<string, unknown>)[token];
    }

    return { found: true as const, value: current };
  } catch (error) {
    return {
      found: false as const,
      error: error instanceof Error ? error.message : "Invalid JPath"
    };
  }
}

function buildUniqueCaptureToken(preferredToken: string | null | undefined, usedNames: Set<string>) {
  const parsed = parseStepParameterName(preferredToken || "", "t") || parseStepParameterName("@t.responseValue", "t");

  if (!parsed) {
    return "@t.responseValue";
  }

  const baseRawName = parsed.rawName || "responseValue";
  let candidateRawName = baseRawName;
  let suffix = 1;

  while (usedNames.has(`${parsed.scope}.${candidateRawName.toLowerCase()}`)) {
    candidateRawName = `${baseRawName}${suffix}`;
    suffix += 1;
  }

  const nextName = `${parsed.scope}.${candidateRawName.toLowerCase()}`;
  usedNames.add(nextName);

  return `@${parsed.scope}.${candidateRawName}`;
}

function readPreviewCaptureValue(preview: ApiRequestPreview, path?: string | null) {
  const source = preview.response.body_json !== null && preview.response.body_json !== undefined
    ? preview.response.body_json
    : preview.response.body_text;
  const resolved = readJsonPathValue(source, path || "$");

  return resolved.found ? stringifyJsonSelectionValue(resolved.value) : "";
}

function parseAssertionExpectedValue(value?: string | null) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    return "";
  }

  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  if (normalized === "null") {
    return null;
  }

  if (/^-?\d+(\.\d+)?$/.test(normalized)) {
    return Number(normalized);
  }

  if (/^[\[{"]/.test(normalized)) {
    try {
      return JSON.parse(normalized);
    } catch {
      return normalized;
    }
  }

  return normalized;
}

function areAssertionValuesEqual(left: unknown, right: unknown) {
  if (left === right) {
    return true;
  }

  if (typeof left === "object" && left !== null && typeof right === "object" && right !== null) {
    try {
      return JSON.stringify(left) === JSON.stringify(right);
    } catch {
      return false;
    }
  }

  return false;
}

function createValidationLabel(validation: StepApiValidation, index: number) {
  const kind = validation.kind || "status";
  const target = String(validation.target || "").trim();

  if (kind === "status") {
    return `Assertion ${index + 1}: status code`;
  }

  if (kind === "header") {
    return `Assertion ${index + 1}: header ${target || "content-type"}`;
  }

  if (kind === "header_present") return `Assertion ${index + 1}: header ${target || "content-type"} exists`;

  if (kind === "body_contains") {
    return `Assertion ${index + 1}: body contains`;
  }

  if (kind === "body_not_contains") return `Assertion ${index + 1}: body excludes`;
  if (kind === "response_time") return `Assertion ${index + 1}: response time`;
  if (kind === "json_schema") return `Assertion ${index + 1}: JSON schema`;

  return `Assertion ${index + 1}: JPath ${target || "$"}`;
}

function compareApiValidationValues(actual: unknown, expected: unknown, operator: StepApiValidation["operator"] = "eq") {
  if (operator === "exists") return actual !== undefined && actual !== null && actual !== "";
  if (operator === "contains") return String(actual ?? "").includes(String(expected ?? ""));
  if (operator === "matches") {
    try { return new RegExp(String(expected || "")).test(String(actual ?? "")); } catch { return false; }
  }
  if (["lt", "lte", "gt", "gte"].includes(operator)) {
    const left = Number(actual);
    const right = Number(expected);
    if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
    if (operator === "lt") return left < right;
    if (operator === "lte") return left <= right;
    if (operator === "gt") return left > right;
    return left >= right;
  }
  const equal = areAssertionValuesEqual(actual, expected) || String(actual ?? "") === String(expected ?? "");
  return operator === "ne" ? !equal : equal;
}

function evaluateValidationResult(
  preview: ApiRequestPreview,
  validation: StepApiValidation,
  index: number,
  parameterValues: Record<string, string>
): ApiValidationResultPreview {
  const resolvedValidation: StepApiValidation = {
    ...validation,
    target: resolveStepParameterText(validation.target, parameterValues),
    expected: resolveStepParameterText(validation.expected, parameterValues)
  };
  const label = createValidationLabel(resolvedValidation, index);
  const kind = validation.kind || "status";
  const target = String(resolvedValidation.target || "").trim();
  const expected = String(resolvedValidation.expected || "").trim();
  const operator = resolvedValidation.operator || "eq";

  if (kind === "status") {
    const expectedStatus = Number(expected) || 200;
    const passed = compareApiValidationValues(preview.response.status, expectedStatus, operator);
    return {
      id: `validation-${index}`,
      label,
      passed,
      summary: passed
        ? `Matched expected status ${expectedStatus}.`
        : `Expected status ${expectedStatus}, received ${preview.response.status}.`
    };
  }

  if (kind === "header") {
    const headerName = (target || "content-type").toLowerCase();
    const actual = preview.response.headers[headerName] || "";
    const passed = compareApiValidationValues(actual, expected, operator);
    return {
      id: `validation-${index}`,
      label,
      passed,
      summary: passed
        ? `Header matched ${headerName}.`
        : `Expected "${expected}", received "${actual || "(empty)"}".`
    };
  }

  if (kind === "header_present") {
    const headerName = (target || "content-type").toLowerCase();
    const passed = Boolean(preview.response.headers[headerName]);
    return { id: `validation-${index}`, label, passed, summary: passed ? `Header ${headerName} is present.` : `Header ${headerName} is missing.` };
  }

  if (kind === "body_contains") {
    const passed = compareApiValidationValues(preview.response.body_text || "", expected, operator === "eq" ? "contains" : operator);
    return {
      id: `validation-${index}`,
      label,
      passed,
      summary: passed
        ? "Expected text was found in the response body."
        : `Could not find "${expected}" in the response body.`
    };
  }

  if (kind === "body_not_contains") {
    const passed = !String(preview.response.body_text || "").includes(expected);
    return { id: `validation-${index}`, label, passed, summary: passed ? "Excluded text was not present." : `Unexpectedly found "${expected}" in the response.` };
  }

  if (kind === "response_time") {
    const expectedMs = Number(expected || target) || 2000;
    const passed = compareApiValidationValues(preview.response.duration_ms, expectedMs, operator === "eq" ? "lte" : operator);
    return { id: `validation-${index}`, label, passed, summary: `${preview.response.duration_ms} ms received; threshold ${expectedMs} ms.` };
  }

  if (kind === "json_schema") {
    if (preview.response.body_json === null || preview.response.body_json === undefined) return { id: `validation-${index}`, label, passed: false, summary: "Response is not JSON." };
    try {
      const schema = JSON.parse(expected || target || "{}");
      const required = Array.isArray(schema.required) ? schema.required : [];
      const passed = typeof preview.response.body_json === "object" && preview.response.body_json !== null && required.every((key: string) => key in (preview.response.body_json as object));
      return { id: `validation-${index}`, label, passed, summary: passed ? "Required JSON schema fields are present." : "One or more required JSON schema fields are missing." };
    } catch {
      return { id: `validation-${index}`, label, passed: false, summary: "Expected value is not a valid JSON schema." };
    }
  }

  if (preview.response.body_json === null || preview.response.body_json === undefined) {
    return {
      id: `validation-${index}`,
      label,
      passed: false,
      summary: "Response body is not JSON, so this JPath assertion could not be evaluated."
    };
  }

  const resolved = readJsonPathValue(preview.response.body_json, target || "$");

  if (!resolved.found) {
    return {
      id: `validation-${index}`,
      label,
      passed: false,
      summary: resolved.error
    };
  }

  const expectedValue = parseAssertionExpectedValue(expected);
  const passed = compareApiValidationValues(resolved.value, expectedValue, operator);
  return {
    id: `validation-${index}`,
    label,
    passed,
    summary: passed
      ? `Matched ${target || "$"} = ${stringifyJsonSelectionValue(resolved.value)}.`
      : `Expected ${stringifyJsonSelectionValue(expectedValue)}, received ${stringifyJsonSelectionValue(resolved.value)}.`
  };
}

export function JsonResponseTreeNode({
  label,
  value,
  path,
  depth,
  selectedPath,
  onSelect
}: {
  label: string;
  value: unknown;
  path: string;
  depth: number;
  selectedPath: string;
  onSelect: (selection: JsonPathSelection) => void;
}) {
  const isExpandable = Boolean(value) && typeof value === "object";
  const [isExpanded, setIsExpanded] = useState(depth < 1);
  const summary = summarizeJsonValue(value);
  const entries = useMemo(() => {
    if (Array.isArray(value)) {
      return value.map((item, index) => [index, item] as const);
    }

    if (value && typeof value === "object") {
      return Object.entries(value as Record<string, unknown>);
    }

    return [];
  }, [value]);

  return (
    <div className="api-response-tree-node">
      <div className="api-response-tree-row">
        {isExpandable ? (
          <button
            aria-label={isExpanded ? `Collapse ${label}` : `Expand ${label}`}
            className="api-response-tree-toggle"
            onClick={() => setIsExpanded((current) => !current)}
            type="button"
          >
            <span aria-hidden="true" className={isExpanded ? "api-response-tree-chevron is-expanded" : "api-response-tree-chevron"}>
              <svg aria-hidden="true" fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="14">
                <path d="m9 6 6 6-6 6" />
              </svg>
            </span>
          </button>
        ) : (
          <span aria-hidden="true" className="api-response-tree-toggle api-response-tree-toggle--spacer" />
        )}
        <button
          aria-pressed={selectedPath === path}
          className={selectedPath === path ? "api-response-tree-select is-selected" : "api-response-tree-select"}
          onClick={() => onSelect({ path, value })}
          type="button"
        >
          <span className="api-response-tree-key">{label}</span>
          <span className="api-response-tree-type">{summary.typeLabel}</span>
          <span className="api-response-tree-preview">{summary.preview}</span>
        </button>
      </div>
      {isExpandable && isExpanded ? (
        <div className="api-response-tree-children">
          {entries.map(([childKey, childValue]) => (
            <JsonResponseTreeNode
              depth={depth + 1}
              key={buildChildJsonPath(path, childKey)}
              label={String(childKey)}
              onSelect={onSelect}
              path={buildChildJsonPath(path, childKey)}
              selectedPath={selectedPath}
              value={childValue}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function CodePreviewDialog({
  title,
  subtitle,
  code,
  objectRepository = [],
  onClose
}: {
  title: string;
  subtitle: string;
  code: string;
  objectRepository?: AutomationLearningCacheEntry[];
  onClose: () => void;
}) {
  const dialogRef = useDialogFocus<HTMLDivElement>({ onClose });
  const keywordMappings = buildAutomationKeywordMappings(code, objectRepository);

  return (
    <div className="modal-backdrop modal-backdrop--scroll" onClick={onClose} role="presentation">
      <div
        aria-labelledby="automation-code-preview-title"
        aria-modal="true"
        className="modal-card resource-modal-card automation-code-modal"
        onClick={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="resource-modal-header">
          <div className="resource-modal-title">
            <div className="modal-title-info-row">
              <h2 className="dialog-title" id="automation-code-preview-title">{title}</h2>
              <InfoTooltip content={subtitle} label={`${title} information`} />
            </div>
          </div>
          <DialogCloseButton label="Close code preview" onClick={onClose} />
        </div>
        <div className="resource-form">
          <div className="resource-form-body">
            <div className="automation-code-split">
              <section className="automation-keyword-map-pane" aria-label="Keyword object mapping">
                <div className="automation-code-pane-head">
                  <strong>Keyword mapping</strong>
                  <span>{keywordMappings.length} call{keywordMappings.length === 1 ? "" : "s"} mapped</span>
                </div>
                {keywordMappings.length ? (
                  <div className="automation-keyword-map-list">
                    {keywordMappings.map((mapping) => (
                      <article className="automation-keyword-map-row" key={mapping.id}>
                        <div>
                          <strong>{mapping.keyword}</strong>
                          <span>{mapping.screenName || "Screen"} · {mapping.locatorKind || "locator"}</span>
                        </div>
                        <code>
                          {mapping.keyword}({mapping.displayTarget}{mapping.value ? `, ${mapping.value}` : ""})
                        </code>
                        {mapping.objectName ? <small>{mapping.target}</small> : null}
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state compact">No keyword calls were detected in this automation block.</div>
                )}
              </section>

              <section className="automation-code-translation-pane" aria-label="True code translation">
                <div className="automation-code-pane-head">
                  <strong>True code translation</strong>
                  <span>Executable step code</span>
                </div>
                <pre className="automation-code-block">
                  <code>{code}</code>
                </pre>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function StepAutomationDialog({
  title,
  subtitle,
  step,
  objectRepository = [],
  parameterValues = {},
  availableParameters = [],
  getParameterScopeState,
  onSaveResponseValue,
  onClose,
  onSave
}: {
  title: string;
  subtitle: string;
  step: StepAutomationInput;
  objectRepository?: AutomationLearningCacheEntry[];
  parameterValues?: Record<string, string>;
  availableParameters?: StepParameterDefinition[];
  getParameterScopeState?: (scope: StepParameterScope) => StepAutomationParameterScopeState;
  onSaveResponseValue?: (name: string, value: string) => void;
  onClose: () => void;
  onSave: (input: { step_type: TestStepType; automation_code: string; api_request: StepApiRequest | null }) => void;
}) {
  const dialogRef = useDialogFocus<HTMLDivElement>({ onClose });
  const stepRevisionKey = JSON.stringify({
    id: step.id || "",
    step_order: step.step_order || 1,
    action: step.action || "",
    expected_result: step.expected_result || "",
    step_type: step.step_type || "",
    automation_code: step.automation_code || "",
    api_request: step.api_request || null
  });
  const [stepType, setStepType] = useState<TestStepType>(normalizeStepType(step.step_type));
  const [automationCode, setAutomationCode] = useState(normalizeAutomationCode(step.automation_code));
  const [apiRequest, setApiRequest] = useState<StepApiRequest>(ensureApiRequest(step.api_request));
  const [apiPreview, setApiPreview] = useState<ApiRequestPreview | null>(null);
  const [apiPreviewError, setApiPreviewError] = useState("");
  const [apiPreviewMessage, setApiPreviewMessage] = useState("");
  const [isRunningApiRequest, setIsRunningApiRequest] = useState(false);
  const [selectedJsonPath, setSelectedJsonPath] = useState<JsonPathSelection | null>(null);
  const [responseParameterDraft, setResponseParameterDraft] = useState("");
  const [webKeywordId, setWebKeywordId] = useState(WEB_KEYWORD_OPTIONS[0].id);
  const [webKeywordLocator, setWebKeywordLocator] = useState("");
  const [webKeywordData, setWebKeywordData] = useState("");
  const [webKeywordMessage, setWebKeywordMessage] = useState("");
  const [isRepositoryPickerOpen, setIsRepositoryPickerOpen] = useState(false);
  const [repositorySearchTerm, setRepositorySearchTerm] = useState("");
  const [selectedRepositoryScreen, setSelectedRepositoryScreen] = useState("");
  const [androidKeywordId, setAndroidKeywordId] = useState(ANDROID_KEYWORD_OPTIONS[0].id);
  const [androidKeywordSelector, setAndroidKeywordSelector] = useState("");
  const [androidKeywordData, setAndroidKeywordData] = useState("");
  const [androidKeywordMessage, setAndroidKeywordMessage] = useState("");
  const [curlImportText, setCurlImportText] = useState("");
  const [curlImportMessage, setCurlImportMessage] = useState("");
  const closeRepositoryPicker = () => setIsRepositoryPickerOpen(false);
  const repositoryPickerRef = useDialogFocus<HTMLDivElement>({
    active: isRepositoryPickerOpen,
    onClose: closeRepositoryPicker
  });

  useEffect(() => {
    setStepType(normalizeStepType(step.step_type));
    setAutomationCode(normalizeAutomationCode(step.automation_code));
    setApiRequest(ensureApiRequest(step.api_request));
    setApiPreview(null);
    setApiPreviewError("");
    setApiPreviewMessage("");
    setSelectedJsonPath(null);
    setResponseParameterDraft("");
    setWebKeywordId(WEB_KEYWORD_OPTIONS[0].id);
    setWebKeywordLocator("");
    setWebKeywordData("");
    setWebKeywordMessage("");
    setIsRepositoryPickerOpen(false);
    setRepositorySearchTerm("");
    setSelectedRepositoryScreen("");
    setAndroidKeywordId(ANDROID_KEYWORD_OPTIONS[0].id);
    setAndroidKeywordSelector("");
    setAndroidKeywordData("");
    setAndroidKeywordMessage("");
    setCurlImportText("");
    setCurlImportMessage("");
  }, [stepRevisionKey]);

  useEffect(() => {
    if (stepType !== "api") {
      setApiPreview(null);
      setApiPreviewError("");
      setApiPreviewMessage("");
      setSelectedJsonPath(null);
      setResponseParameterDraft("");
    }
  }, [stepType]);

  const normalizedApiRequest = useMemo(
    () => (stepType === "api" ? normalizeApiRequest(apiRequest) : null),
    [apiRequest, stepType]
  );
  const resolvedApiRequest = useMemo(
    () => normalizeApiRequest(resolveApiRequestParameters(normalizedApiRequest, parameterValues)),
    [normalizedApiRequest, parameterValues]
  );

  const previewCode = useMemo(
    () =>
      resolveStepAutomationCode({
        step_order: step.step_order || 1,
        action: step.action || null,
        expected_result: step.expected_result || null,
        step_type: stepType,
        automation_code: automationCode,
        api_request: normalizedApiRequest
      }),
    [automationCode, normalizedApiRequest, step.action, step.expected_result, step.step_order, stepType]
  );
  const savedKeywordMappings = useMemo(
    () => buildAutomationKeywordMappings(automationCode, objectRepository),
    [automationCode, objectRepository]
  );
  const responseHeaderEntries = useMemo(
    () => Object.entries(apiPreview?.response.headers || {}).sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey)),
    [apiPreview]
  );
  const validationResults = useMemo(
    () => (apiPreview ? (apiRequest.validations || []).map((validation, index) => evaluateValidationResult(apiPreview, validation, index, parameterValues)) : []),
    [apiPreview, apiRequest.validations, parameterValues]
  );
  const selectedJsonValue = selectedJsonPath ? formatJsonSelectionValue(selectedJsonPath.value) : "";
  const selectedWebKeyword = WEB_KEYWORD_OPTIONS.find((option) => option.id === webKeywordId) || WEB_KEYWORD_OPTIONS[0];
  const selectedAndroidKeyword = ANDROID_KEYWORD_OPTIONS.find((option) => option.id === androidKeywordId) || ANDROID_KEYWORD_OPTIONS[0];
  const repositoryFieldOptions = useMemo(
    () => objectRepository
      .filter((entry) => {
        const metadata = entry.metadata || {};
        return Boolean(entry.locator)
          && entry.locator !== "__screen__"
          && entry.locator_intent !== "__screen__"
          && metadata.record_kind !== "screen"
          && metadata.object_name !== "__screen__";
      })
      .map((entry) => {
        const metadata = entry.metadata || {};
        const screenName = String(metadata.screen_name || entry.page_key || "Screen").trim();
        const rawObjectName = String(metadata.object_name || entry.locator_intent || entry.locator || "Field").trim();
        const objectName = rawObjectName.startsWith(`${screenName}.`)
          ? rawObjectName.slice(screenName.length + 1).trim() || rawObjectName
          : rawObjectName;
        const htmlTag = String(metadata.object_role || entry.locator_kind || "locator").trim();
        const reference = `${screenName}.${objectName}`;

        return {
          id: entry.id,
          reference,
          locator: entry.locator,
          objectName,
          screenName,
          htmlTag,
          pageUrl: String(metadata.page_url || metadata.url_pattern || entry.page_key || "").trim()
        };
      }),
    [objectRepository]
  );
  const repositoryScreens = useMemo(() => {
    const searchTerm = repositorySearchTerm.trim().toLowerCase();
    const groupedFields = new Map<string, typeof repositoryFieldOptions>();

    repositoryFieldOptions.forEach((field) => {
      if (
        searchTerm
        && !`${field.screenName} ${field.objectName} ${field.htmlTag} ${field.locator} ${field.pageUrl}`.toLowerCase().includes(searchTerm)
      ) {
        return;
      }

      groupedFields.set(field.screenName, [...(groupedFields.get(field.screenName) || []), field]);
    });

    return Array.from(groupedFields.entries()).map(([screenName, fields]) => ({
      screenName,
      fields,
      pageUrl: fields[0]?.pageUrl || ""
    }));
  }, [repositoryFieldOptions, repositorySearchTerm]);
  const selectedRepositoryFields = repositoryScreens.find((screen) => screen.screenName === selectedRepositoryScreen)?.fields || [];

  useEffect(() => {
    if (!isRepositoryPickerOpen) {
      return;
    }

    if (!repositoryScreens.some((screen) => screen.screenName === selectedRepositoryScreen)) {
      setSelectedRepositoryScreen(repositoryScreens[0]?.screenName || "");
    }
  }, [isRepositoryPickerOpen, repositoryScreens, selectedRepositoryScreen]);
  const groupedAvailableParameters = useMemo(
    () => [
      {
        label: "Test case data",
        items: availableParameters.filter((parameter) => parameter.scope === "t")
      },
      {
        label: "Suite-shared data",
        items: availableParameters.filter((parameter) => parameter.scope === "s")
      },
      {
        label: "Run data",
        items: availableParameters.filter((parameter) => parameter.scope === "r")
      }
    ].filter((group) => group.items.length),
    [availableParameters]
  );
  const responseParameterOptionListId = `step-response-parameter-options-${step.step_order || 1}`;
  const parsedResponseParameter = parseStepParameterName(responseParameterDraft);
  const matchedResponseParameter = parsedResponseParameter
    ? availableParameters.find((parameter) => parameter.name === parsedResponseParameter.name) || null
    : null;
  const responseParameterScopeState = parsedResponseParameter
    ? (getParameterScopeState?.(parsedResponseParameter.scope) || {})
    : {};

  useEffect(() => {
    const enabledParameters = availableParameters.filter((parameter) => !(getParameterScopeState?.(parameter.scope) || {}).disabled);

    if (!enabledParameters.length || responseParameterDraft.trim()) {
      return;
    }

    setResponseParameterDraft(enabledParameters[0]?.token || "");
  }, [availableParameters, getParameterScopeState, responseParameterDraft]);

  const handleRunApiRequest = async () => {
    if (!resolvedApiRequest?.url) {
      setApiPreview(null);
      setApiPreviewError("Enter a valid absolute request URL before validating this API step.");
      setApiPreviewMessage("");
      return;
    }

    setIsRunningApiRequest(true);
    setApiPreviewError("");
    setApiPreviewMessage("");

    try {
      const result = await api.testSteps.runApiRequest({
        api_request: resolvedApiRequest
      });
      const suggestionSummary = result.ai_suggestions?.summary || "";
      const suggestionAssertionCount = result.ai_suggestions?.assertions.length || 0;
      const suggestionCaptureCount = result.ai_suggestions?.captures.length || 0;

      setApiPreview(result);
      setSelectedJsonPath(null);
      setApiPreviewMessage(
        [
          result.response.status > 0
            ? `Captured response ${result.response.status} in ${result.response.duration_ms} ms.`
            : "Request contract validated for an approved CI or remote runner; no external request was sent from Forge.",
          suggestionSummary
            ? `${suggestionSummary} Review ${suggestionAssertionCount} assertion suggestion${suggestionAssertionCount === 1 ? "" : "s"} and ${suggestionCaptureCount} parser suggestion${suggestionCaptureCount === 1 ? "" : "s"} before applying.`
            : ""
        ].filter(Boolean).join(" ")
      );
    } catch (error) {
      setApiPreview(null);
      setSelectedJsonPath(null);
      setApiPreviewError(error instanceof Error ? error.message : "Unable to validate the API request contract.");
      setApiPreviewMessage("");
    } finally {
      setIsRunningApiRequest(false);
    }
  };

  const handleApplyApiSuggestions = () => {
    if (!apiPreview?.ai_suggestions) {
      setApiPreviewError("Run the request before asking QAira to suggest assertions and parsers.");
      setApiPreviewMessage("");
      return;
    }

    const usedNames = new Set<string>();
    availableParameters.forEach((parameter) => usedNames.add(parameter.name));
    (apiRequest.captures || []).forEach((capture) => {
      const parsed = parseStepParameterName(capture.parameter, "t");

      if (parsed) {
        usedNames.add(parsed.name);
      }
    });

    let addedAssertionCount = 0;
    let addedCaptureCount = 0;
    const existingCaptures = apiRequest.captures || [];
    const nextCaptures = [...existingCaptures];
    const existingValidations = apiRequest.validations || [];
    const nextValidations = [...existingValidations];

    (apiPreview.ai_suggestions.assertions || []).forEach((suggestion) => {
      const alreadyExists = nextValidations.some((validation) =>
        validation.kind === suggestion.kind
        && (validation.target || "") === (suggestion.target || "")
        && (validation.expected || "") === (suggestion.expected || "")
      );

      if (!alreadyExists) {
        nextValidations.push(suggestion);
        addedAssertionCount += 1;
      }
    });

    (apiPreview.ai_suggestions.captures || []).forEach((suggestion) => {
      const path = suggestion.path || "";

      if (!path || nextCaptures.some((capture) => (capture.path || "") === path)) {
        return;
      }

      const parameter = buildUniqueCaptureToken(suggestion.parameter, usedNames);
      const parsed = parseStepParameterName(parameter, "t");
      const scopeState = parsed ? (getParameterScopeState?.(parsed.scope) || {}) : {};

      if (scopeState.disabled) {
        return;
      }

      nextCaptures.push({
        path,
        parameter
      });
      addedCaptureCount += 1;

      if (parsed && onSaveResponseValue) {
        onSaveResponseValue(parsed.name, readPreviewCaptureValue(apiPreview, path));
      }
    });

    setApiRequest((current) => ({
      ...current,
      validations: nextValidations,
      captures: nextCaptures
    }));
    setApiPreviewError("");
    setApiPreviewMessage(
      `Added ${addedAssertionCount} assertion suggestion${addedAssertionCount === 1 ? "" : "s"} and ${addedCaptureCount} parser suggestion${addedCaptureCount === 1 ? "" : "s"}.`
    );
  };

  const handleBuildFromCurl = () => {
    try {
      const parsed = parseCurlRequest(curlImportText);

      setStepType("api");
      setApiRequest((current) => ({
        ...current,
        ...parsed.request,
        validations: current.validations?.length ? current.validations : parsed.request.validations,
        captures: current.captures?.length ? current.captures : parsed.request.captures
      }));
      setApiPreview(null);
      setSelectedJsonPath(null);
      setApiPreviewError("");
      setCurlImportMessage(
        [
          `Built ${parsed.request.method || "GET"} request from cURL.`,
          parsed.warnings.length ? parsed.warnings.join(" ") : ""
        ].filter(Boolean).join(" ")
      );
    } catch (error) {
      setCurlImportMessage("");
      setApiPreviewError(error instanceof Error ? error.message : "Unable to parse the cURL command.");
      setApiPreviewMessage("");
    }
  };

  const handleAddWebKeyword = () => {
    if (selectedWebKeyword.id === "codedJS") {
      handleUseCodedJavaScript("web");
      return;
    }

    if (selectedWebKeyword.locatorRequired && !webKeywordLocator.trim()) {
      setWebKeywordMessage(`${selectedWebKeyword.locatorLabel} is required for ${selectedWebKeyword.label}.`);
      return;
    }

    if (selectedWebKeyword.dataRequired && !webKeywordData.trim()) {
      setWebKeywordMessage(`${selectedWebKeyword.dataLabel} is required for ${selectedWebKeyword.label}.`);
      return;
    }

    const snippet = buildWebKeywordSnippet(selectedWebKeyword, webKeywordLocator, webKeywordData);
    setAutomationCode((current) => [normalizeAutomationCode(current), snippet].filter(Boolean).join("\n"));
    setWebKeywordLocator("");
    setWebKeywordData("");
    setWebKeywordMessage(`${selectedWebKeyword.label} keyword added to the automation override.`);
  };

  const handleAddAndroidKeyword = () => {
    if (selectedAndroidKeyword.id === "codedJS") {
      handleUseCodedJavaScript(stepType === "ios" ? "ios" : "android");
      return;
    }

    if (selectedAndroidKeyword.selectorRequired && !androidKeywordSelector.trim()) {
      setAndroidKeywordMessage(`${selectedAndroidKeyword.selectorLabel} is required for ${selectedAndroidKeyword.label}.`);
      return;
    }

    if (selectedAndroidKeyword.valueRequired && !androidKeywordData.trim()) {
      setAndroidKeywordMessage(`${selectedAndroidKeyword.valueLabel} is required for ${selectedAndroidKeyword.label}.`);
      return;
    }

    const snippet = buildAndroidKeywordSnippet(selectedAndroidKeyword, androidKeywordSelector, androidKeywordData);
    setAutomationCode((current) => [normalizeAutomationCode(current), snippet].filter(Boolean).join("\n"));
    setAndroidKeywordSelector("");
    setAndroidKeywordData("");
    setAndroidKeywordMessage(`${selectedAndroidKeyword.label} keyword added to the Appium override.`);
  };

  const handleUseCodedJavaScript = (type: "web" | "android" | "ios") => {
    setStepType(type);
    setAutomationCode((current) => normalizeAutomationCode(current) || resolveStepAutomationCode({
      step_order: step.step_order || 1,
      action: step.action || null,
      expected_result: step.expected_result || null,
      step_type: type,
      automation_code: "",
      api_request: null
    }));

    if (type === "web") {
      setWebKeywordMessage("Coded JavaScript web step ready. Edit the automation code and save.");
    } else {
      setAndroidKeywordMessage(`Coded JavaScript ${type === "ios" ? "iOS" : "Android"} step ready. Edit the automation code and save.`);
    }
  };

  const handleInsertJsonPathAssertion = () => {
    if (!selectedJsonPath) {
      return;
    }

    const nextValidation: StepApiValidation = {
      kind: "json_path",
      target: selectedJsonPath.path,
      expected: stringifyJsonSelectionValue(selectedJsonPath.value)
    };
    const existingValidations = apiRequest.validations || [];
    const alreadyHasValidation = existingValidations.some((validation) =>
      validation.kind === nextValidation.kind
      && (validation.target || "") === nextValidation.target
      && (validation.expected || "") === nextValidation.expected
    );
    const nextValidations = alreadyHasValidation ? existingValidations : [...existingValidations, nextValidation];
    const nextApiRequest = {
      ...apiRequest,
      validations: nextValidations
    };
    const responseVar = `response${step.step_order || 1}`;
    const assertionSnippet = buildApiValidationAssertionCode(nextValidation, responseVar);
    const currentCustomCode = normalizeAutomationCode(automationCode);

    setApiRequest(nextApiRequest);

    if (currentCustomCode) {
      setAutomationCode(
        currentCustomCode.includes(assertionSnippet)
          ? currentCustomCode
          : `${currentCustomCode}\n${assertionSnippet}`
      );
    } else {
      setAutomationCode(resolveStepAutomationCode({
        step_order: step.step_order || 1,
        action: step.action || null,
        expected_result: step.expected_result || null,
        step_type: "api",
        automation_code: "",
        api_request: normalizeApiRequest(nextApiRequest)
      }));
    }

    setApiPreviewMessage(`Added ${selectedJsonPath.path} to the response validations and custom override.`);
    setApiPreviewError("");
  };

  const handleAddResponseCapture = () => {
    if (!selectedJsonPath || !parsedResponseParameter) {
      setApiPreviewError("Choose a JSON node and enter a scoped token like @t.orderId before adding a response parser.");
      setApiPreviewMessage("");
      return;
    }

    if (responseParameterScopeState.disabled) {
      setApiPreviewError(
        responseParameterScopeState.hint || `Unable to save ${parsedResponseParameter.token} in the current context.`
      );
      setApiPreviewMessage("");
      return;
    }

    const nextCapture = {
      path: selectedJsonPath.path,
      parameter: parsedResponseParameter.token
    };

    setApiRequest((current) => {
      const existingCaptures = current.captures || [];
      const alreadyExists = existingCaptures.some((capture) =>
        (capture.path || "") === nextCapture.path
        && (capture.parameter || "") === nextCapture.parameter
      );

      return {
        ...current,
        captures: alreadyExists ? existingCaptures : [...existingCaptures, nextCapture]
      };
    });

    if (onSaveResponseValue) {
      onSaveResponseValue(
        parsedResponseParameter.name,
        stringifyJsonSelectionValue(selectedJsonPath.value)
      );
    }

    if (matchedResponseParameter && onSaveResponseValue) {
      setApiPreviewMessage(`Added response parser for ${parsedResponseParameter.token} and refreshed its preview value from ${selectedJsonPath.path}.`);
    } else {
      setApiPreviewMessage(`Added response parser from ${selectedJsonPath.path} to ${parsedResponseParameter.token}. Save automation to persist this parameter definition.`);
    }

    setApiPreviewError("");
  };

  return (
    <>
    <div className="modal-backdrop modal-backdrop--scroll" onClick={onClose} role="presentation">
      <div
        aria-labelledby="step-automation-editor-title"
        aria-modal="true"
        className="modal-card resource-modal-card automation-editor-modal"
        onClick={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="resource-modal-header">
          <div className="resource-modal-title">
            <div className="modal-title-info-row">
              <h2 className="dialog-title" id="step-automation-editor-title">{title}</h2>
              <InfoTooltip content={subtitle} label={`${title} information`} />
            </div>
          </div>
          <DialogCloseButton label="Close step automation editor" onClick={onClose} />
        </div>
        <div className="resource-form">
          <div className="resource-form-body automation-editor-body">
            <div className="automation-step-type-row">
              {STEP_TYPE_OPTIONS.map((option) => (
                <button
                  className={option.value === stepType ? "automation-type-pill is-active" : "automation-type-pill"}
                  key={option.value}
                  onClick={() => setStepType(option.value)}
                  type="button"
                >
                  <StepTypeIcon size={15} type={option.value} />
                  <span>{option.label}</span>
                </button>
              ))}
            </div>

            {stepType === "api" ? (
              <div className="automation-api-editor">
                <div className="automation-inline-grid">
                  <FormField label="HTTP method">
                    <select
                      value={apiRequest.method || "GET"}
                      onChange={(event) =>
                        setApiRequest((current) => ({
                          ...current,
                          method: event.target.value as StepApiRequest["method"]
                        }))
                      }
                    >
                      <option value="GET">GET</option>
                      <option value="POST">POST</option>
                      <option value="PUT">PUT</option>
                      <option value="PATCH">PATCH</option>
                      <option value="DELETE">DELETE</option>
                      <option value="HEAD">HEAD</option>
                      <option value="OPTIONS">OPTIONS</option>
                    </select>
                  </FormField>
                  <FormField label="Request URL" required>
                    <input
                      placeholder="https://api.example.com/orders/@orderId"
                      value={apiRequest.url || ""}
                      onChange={(event) =>
                        setApiRequest((current) => ({
                          ...current,
                          url: event.target.value
                        }))
                      }
                    />
                  </FormField>
                </div>

                <FormField
                  label="Headers"
                  hint="Use scoped @t, @s, or @r tokens inside header names or values when request setup depends on saved test data."
                >
                  <ApiHeaderRowsEditor
                    headers={apiRequest.headers || []}
                    onChange={(headers) => setApiRequest((current) => ({ ...current, headers }))}
                  />
                </FormField>

                <details className="automation-request-details" open>
                  <summary>
                    <span>Request policy and data</span>
                    <strong>{(apiRequest.query_params || []).length + (apiRequest.cookies || []).length}</strong>
                  </summary>
                  <div className="automation-request-details-body automation-grid-stack">
                    <div className="automation-inline-grid">
                      <FormField label="Authentication">
                        <select
                          onChange={(event) => setApiRequest((current) => ({
                            ...current,
                            auth: { ...(current.auth || { credential_reference: "", key_name: "Authorization", location: "header" }), type: event.target.value as NonNullable<StepApiRequest["auth"]>["type"] }
                          }))}
                          value={apiRequest.auth?.type || "none"}
                        >
                          <option value="none">None</option>
                          <option value="bearer">Bearer reference</option>
                          <option value="api_key">API key reference</option>
                          <option value="basic">Basic credential reference</option>
                          <option value="oauth2_ref">OAuth 2 reference</option>
                        </select>
                      </FormField>
                      <FormField label="Credential reference" hint="Store only the approved runner or environment secret name.">
                        <input
                          disabled={(apiRequest.auth?.type || "none") === "none"}
                          onChange={(event) => setApiRequest((current) => ({ ...current, auth: { ...(current.auth || { type: "none" }), credential_reference: event.target.value } }))}
                          placeholder="QAIRA_API_CREDENTIAL"
                          value={apiRequest.auth?.credential_reference || ""}
                        />
                      </FormField>
                      <FormField label="Timeout (ms)">
                        <input max="120000" min="1000" onChange={(event) => setApiRequest((current) => ({ ...current, timeout_ms: Number(event.target.value) || 30000 }))} type="number" value={apiRequest.timeout_ms || 30000} />
                      </FormField>
                      <FormField label="Redirects">
                        <select onChange={(event) => setApiRequest((current) => ({ ...current, follow_redirects: event.target.value === "follow" }))} value={apiRequest.follow_redirects === false ? "manual" : "follow"}>
                          <option value="follow">Follow redirects</option>
                          <option value="manual">Do not follow</option>
                        </select>
                      </FormField>
                    </div>
                    {apiRequest.auth?.type === "api_key" ? (
                      <div className="automation-inline-grid">
                        <FormField label="API key name">
                          <input
                            onChange={(event) => setApiRequest((current) => ({ ...current, auth: { ...(current.auth || { type: "api_key" }), key_name: event.target.value } }))}
                            placeholder="x-api-key"
                            value={apiRequest.auth.key_name || "x-api-key"}
                          />
                        </FormField>
                        <FormField label="API key location">
                          <select
                            onChange={(event) => setApiRequest((current) => ({ ...current, auth: { ...(current.auth || { type: "api_key" }), location: event.target.value as "header" | "query" } }))}
                            value={apiRequest.auth.location || "header"}
                          >
                            <option value="header">Header</option>
                            <option value="query">Query parameter</option>
                          </select>
                        </FormField>
                      </div>
                    ) : null}
                    <FormField label="Query parameters">
                      <ApiHeaderRowsEditor
                        addLabel="Add query parameter"
                        headers={apiRequest.query_params || []}
                        keyPlaceholder="Parameter name"
                        onChange={(query_params) => setApiRequest((current) => ({ ...current, query_params }))}
                        valuePlaceholder="Parameter value"
                      />
                    </FormField>
                    <FormField label="Cookies">
                      <ApiHeaderRowsEditor
                        addLabel="Add cookie"
                        headers={apiRequest.cookies || []}
                        keyPlaceholder="Cookie name"
                        onChange={(cookies) => setApiRequest((current) => ({ ...current, cookies }))}
                        valuePlaceholder="Cookie value"
                      />
                    </FormField>
                  </div>
                </details>

                <div className="automation-inline-grid">
                  <FormField label="Body mode">
                    <select
                      value={apiRequest.body_mode || "none"}
                      onChange={(event) =>
                        setApiRequest((current) => ({
                          ...current,
                          body_mode: event.target.value as StepApiRequest["body_mode"]
                        }))
                      }
                    >
                      <option value="none">None</option>
                      <option value="json">JSON</option>
                      <option value="text">Text</option>
                      <option value="xml">XML</option>
                      <option value="form">Form</option>
                    </select>
                  </FormField>
                </div>

                {(apiRequest.body_mode || "none") !== "none" ? (
                  <FormField label="Request body">
                    <textarea
                      rows={6}
                      value={apiRequest.body || ""}
                      onChange={(event) =>
                        setApiRequest((current) => ({
                          ...current,
                          body: event.target.value
                        }))
                      }
                    />
                  </FormField>
                ) : null}

                <ApiRequestInfoDetails request={normalizedApiRequest || apiRequest} resolvedRequest={resolvedApiRequest} />

                <details className="automation-request-details automation-curl-builder">
                  <summary>
                    <span>Build from cURL</span>
                    <strong>Import</strong>
                  </summary>
                  <div className="automation-request-details-body">
                    <FormField label="cURL request">
                      <textarea
                        placeholder={"curl -X POST https://api.example.com/orders -H 'Content-Type: application/json' --data '{\"name\":\"QAira\"}'"}
                        rows={5}
                        value={curlImportText}
                        onChange={(event) => setCurlImportText(event.target.value)}
                      />
                    </FormField>
                    <div className="action-row">
                      <button className="ghost-button inline-button" onClick={handleBuildFromCurl} type="button">
                        <AutomationCodeIcon />
                        <span>Build request</span>
                      </button>
                    </div>
                    {curlImportMessage ? <div className="inline-message success-message">{curlImportMessage}</div> : null}
                  </div>
                </details>

                <div className="automation-response-shell">
                  <div className="automation-response-header">
                    <div className="automation-response-title-row">
                      <strong>API response capture</strong>
                      <InfoTooltip
                        content="Validate the resolved request contract in Forge. Live responses are supplied by an approved CI or remote runner and can then be inspected for assertions and response captures."
                        label="API response capture information"
                      />
                    </div>
                    <div className="automation-response-actions">
                      <button
                        className="primary-button automation-run-button"
                        disabled={isRunningApiRequest || !resolvedApiRequest?.url}
                        onClick={() => void handleRunApiRequest()}
                        type="button"
                      >
                        <PlayIcon />
                        <span>{isRunningApiRequest ? "Validating..." : "Validate Request"}</span>
                      </button>
                      <button
                        className="ghost-button inline-button automation-ai-suggest-button"
                        disabled={!apiPreview?.ai_suggestions}
                        onClick={handleApplyApiSuggestions}
                        type="button"
                      >
                        <SparkIcon />
                        <span>
                          <strong>Suggest</strong>
                          <small>Assertions and Parsers</small>
                        </span>
                      </button>
                    </div>
                  </div>

                  {apiPreviewError ? <div className="inline-message error-message automation-response-message">{apiPreviewError}</div> : null}
                  {apiPreviewMessage ? <div className="inline-message success-message automation-response-message">{apiPreviewMessage}</div> : null}

                  {apiPreview ? (
                    <div className="automation-response-results">
                      <div className="automation-response-summary">
                        <span className={apiPreview.response.ok ? "automation-response-pill is-success" : "automation-response-pill is-danger"}>
                          {apiPreview.response.status}
                        </span>
                        <span className="automation-response-pill">{apiPreview.request.method}</span>
                        <span className="automation-response-pill">{apiPreview.response.duration_ms} ms</span>
                        <span className="automation-response-pill">
                          {apiPreview.response.content_type || "Unknown content type"}
                        </span>
                      </div>

                      {apiPreview.ai_suggestions ? (
                        <div className="automation-response-meta">
                          <strong>AI response review</strong>
                          <span>{apiPreview.ai_suggestions.summary}</span>
                          <div className="automation-response-headers">
                            {(apiPreview.ai_suggestions.assertions || []).map((assertion, index) => (
                              <span className="automation-response-header-chip" key={`ai-assertion-${index}`}>
                                <strong>{assertion.kind}</strong>
                                <span>{assertion.target || "status"} {assertion.expected ? `= ${assertion.expected}` : ""}</span>
                              </span>
                            ))}
                            {(apiPreview.ai_suggestions.captures || []).map((capture, index) => (
                              <span className="automation-response-header-chip" key={`ai-capture-${index}`}>
                                <strong>{capture.parameter}</strong>
                                <span>{capture.path}</span>
                              </span>
                            ))}
                          </div>
                          {(apiPreview.ai_suggestions.notes || []).length ? (
                            <span>{apiPreview.ai_suggestions.notes?.join(" ")}</span>
                          ) : null}
                        </div>
                      ) : null}

                      {responseHeaderEntries.length ? (
                        <details className="automation-request-details automation-response-header-details">
                          <summary>
                            <span>Response headers</span>
                            <strong>{responseHeaderEntries.length}</strong>
                          </summary>
                          <div className="automation-request-details-body automation-response-headers">
                            {responseHeaderEntries.map(([key, value]) => (
                              <span className="automation-response-header-chip" key={key}>
                                <strong>{key}</strong>
                                <span>{value}</span>
                              </span>
                            ))}
                          </div>
                        </details>
                      ) : null}

                      {apiPreview.response.body_json !== null && apiPreview.response.body_json !== undefined ? (
                        <div className="automation-response-tree-shell">
                          <div className="automation-response-tree-panel">
                            <strong>JSON path (JPath) explorer</strong>
                            <span>Select any node to stage a JSON path assertion.</span>
                            <div className="api-response-tree">
                              <JsonResponseTreeNode
                                depth={0}
                                label="$"
                                onSelect={setSelectedJsonPath}
                                path="$"
                                selectedPath={selectedJsonPath?.path || ""}
                                value={apiPreview.response.body_json}
                              />
                            </div>
                          </div>
                          <div className="automation-response-selection">
                            <strong>Selected node</strong>
                            <span>{selectedJsonPath ? selectedJsonPath.path : "Choose a node from the JSON hierarchy to build a JPath assertion."}</span>
                            {selectedJsonPath ? (
                              <>
                                <pre className="automation-code-block automation-code-block--compact automation-code-block--selection">
                                  <code>{selectedJsonValue}</code>
                                </pre>
                                <div className="automation-response-save">
                                  <strong>Add response parser</strong>
                                  <span>Map this JSON path into a scoped token like `@t.orderId`, `@s.sharedOrderId`, or `@r.runOrderId`.</span>
                                  <div className="automation-response-save-controls">
                                    <input
                                      list={groupedAvailableParameters.length ? responseParameterOptionListId : undefined}
                                      placeholder="@t.orderId"
                                      value={responseParameterDraft}
                                      onChange={(event) => setResponseParameterDraft(event.target.value)}
                                    />
                                    <button
                                      className="ghost-button inline-button"
                                      disabled={!selectedJsonPath || !parsedResponseParameter || responseParameterScopeState.disabled}
                                      onClick={handleAddResponseCapture}
                                      type="button"
                                    >
                                      <span>Add parser</span>
                                    </button>
                                  </div>
                                  {groupedAvailableParameters.length ? (
                                    <datalist id={responseParameterOptionListId}>
                                      {groupedAvailableParameters.flatMap((group) =>
                                        group.items.map((parameter) => (
                                          <option key={parameter.name} value={parameter.token}>
                                            {parameter.scopeLabel}
                                          </option>
                                        ))
                                      )}
                                    </datalist>
                                  ) : null}
                                  <span>
                                    {parsedResponseParameter
                                      ? responseParameterScopeState.hint || `Parser will populate ${parsedResponseParameter.token} from ${selectedJsonPath.path}.`
                                      : "Enter a scoped token with @t, @s, or @r to persist this response parser."}
                                  </span>
                                </div>
                                <button className="ghost-button" onClick={handleInsertJsonPathAssertion} type="button">
                                  <AutomationCodeIcon />
                                  <span>Add JPath assertion to override</span>
                                </button>
                              </>
                            ) : null}
                          </div>
                        </div>
                      ) : (
                        <div className="detail-summary">
                          <strong>Structured explorer unavailable</strong>
                          <span>This response is not JSON, so only the raw body preview is available for this run.</span>
                        </div>
                      )}

                      <div className="automation-response-meta">
                        <strong>Raw response body</strong>
                        <pre className="automation-code-block automation-code-block--compact automation-code-block--selection">
                          <code>{apiPreview.response.body_text || "No response body returned."}</code>
                        </pre>
                      </div>
                    </div>
                  ) : null}
                </div>

                <FormField
                  label="Response validations"
                  hint="Add the checks that should run after the response returns."
                >
                  <ApiValidationRowsEditor
                    parameterValues={parameterValues}
                    results={validationResults}
                    validations={apiRequest.validations || []}
                    onChange={(validations) => setApiRequest((current) => ({ ...current, validations }))}
                  />
                </FormField>

                <FormField
                  label="Response parsers"
                  hint="Persist JSON paths that define scoped params from this API response. These captured tokens are treated as part of the case parameter set."
                >
                  <div className="automation-grid-stack">
                    {(apiRequest.captures || []).length ? (
                      (apiRequest.captures || []).map((capture, index) => (
                        <div className="automation-inline-grid" key={`capture-${index}`}>
                          <input
                            list={groupedAvailableParameters.length ? responseParameterOptionListId : undefined}
                            placeholder="@t.orderId"
                            value={capture.parameter || ""}
                            onChange={(event) =>
                              setApiRequest((current) => ({
                                ...current,
                                captures: (current.captures || []).map((item, itemIndex) =>
                                  itemIndex === index ? { ...item, parameter: event.target.value } : item
                                )
                              }))
                            }
                          />
                          <input
                            placeholder="$.data.id"
                            value={capture.path || ""}
                            onChange={(event) =>
                              setApiRequest((current) => ({
                                ...current,
                                captures: (current.captures || []).map((item, itemIndex) =>
                                  itemIndex === index ? { ...item, path: event.target.value } : item
                                )
                              }))
                            }
                          />
                          <button
                            className="ghost-button inline-button"
                            onClick={() =>
                              setApiRequest((current) => ({
                                ...current,
                                captures: (current.captures || []).filter((_, itemIndex) => itemIndex !== index)
                              }))
                            }
                            type="button"
                          >
                            Remove
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="empty-state compact">No response parsers added yet.</div>
                    )}
                  </div>
                </FormField>

                <details className="automation-request-details automation-custom-code-panel" open={Boolean(automationCode)}>
                  <summary>
                    <span>Custom code override</span>
                    <strong>{automationCode ? "Override active" : "Optional"}</strong>
                  </summary>
                  <div className="automation-request-details-body">
                    <FormField
                      label="Override JavaScript"
                      hint="Leave blank to use the generated request snippet in group and case-level consolidated code views. JPath selections can seed this override automatically."
                    >
                      <textarea
                        placeholder="// Optional: override the generated request snippet for this step."
                        rows={5}
                        value={automationCode}
                        onChange={(event) => setAutomationCode(event.target.value)}
                      />
                    </FormField>
                  </div>
                </details>
              </div>
            ) : (
              <>
                {stepType === "web" ? (
                  <div className="automation-response-shell">
                    <div className="automation-response-header">
                      <div>
                        <strong>Web keyword builder</strong>
                        <span>Select a reusable browser action, provide the locator and data it needs, then add it to the step automation.</span>
                      </div>
                      <button className="ghost-button inline-button" onClick={handleAddWebKeyword} type="button">
                        Add
                      </button>
                    </div>
                    <div className="automation-inline-grid">
                      <FormField label="Keyword">
                        <select value={webKeywordId} onChange={(event) => setWebKeywordId(event.target.value)}>
                          {WEB_KEYWORD_OPTIONS.map((option) => (
                            <option key={option.id} value={option.id}>{option.label}</option>
                          ))}
                        </select>
                      </FormField>
                      <FormField label={selectedWebKeyword.locatorLabel}>
                        <div className="automation-repository-target-field">
                          <input
                            placeholder="Login.Email or css=[data-testid='submit']"
                            value={webKeywordLocator}
                            onChange={(event) => setWebKeywordLocator(event.target.value)}
                          />
                          <button
                            aria-label="Use object repository field"
                            className="automation-repository-search-button"
                            disabled={!repositoryFieldOptions.length}
                            onClick={() => {
                              setRepositorySearchTerm("");
                              setSelectedRepositoryScreen(repositoryFieldOptions[0]?.screenName || "");
                              setIsRepositoryPickerOpen(true);
                            }}
                            title={repositoryFieldOptions.length ? "Choose a field from the Object Repository" : "No Object Repository fields available"}
                            type="button"
                          >
                            <RepositorySearchIcon />
                          </button>
                        </div>
                      </FormField>
                      <FormField label={selectedWebKeyword.dataLabel}>
                        <input
                          list={groupedAvailableParameters.length ? responseParameterOptionListId : undefined}
                          placeholder={selectedWebKeyword.id.startsWith("capture") ? "@t.value" : "@t.username"}
                          value={webKeywordData}
                          onChange={(event) => setWebKeywordData(event.target.value)}
                        />
                      </FormField>
                    </div>
                    {webKeywordMessage ? <div className="inline-message success-message">{webKeywordMessage}</div> : null}
                  </div>
                ) : null}
                {stepType === "android" || stepType === "ios" ? (
                  <div className="automation-response-shell">
                    <div className="automation-response-header">
                      <div>
                        <strong>{stepType === "ios" ? "iOS" : "Android"} Appium keyword builder</strong>
                        <span>Select a mobile action or CodedJS, then add executable WebdriverIO/Appium code to the step.</span>
                      </div>
                      <button className="ghost-button inline-button" onClick={handleAddAndroidKeyword} type="button">
                        Add
                      </button>
                    </div>
                    <div className="automation-inline-grid">
                      <FormField label="Keyword">
                        <select value={androidKeywordId} onChange={(event) => setAndroidKeywordId(event.target.value)}>
                          {ANDROID_KEYWORD_OPTIONS.map((option) => (
                            <option key={option.id} value={option.id}>{option.label}</option>
                          ))}
                        </select>
                      </FormField>
                      <FormField label={selectedAndroidKeyword.selectorLabel} hint={selectedAndroidKeyword.hint}>
                        <input
                          placeholder={'~loginButton or android=new UiSelector().text("Login")'}
                          value={androidKeywordSelector}
                          onChange={(event) => setAndroidKeywordSelector(event.target.value)}
                        />
                      </FormField>
                      <FormField label={selectedAndroidKeyword.valueLabel}>
                        <input
                          list={groupedAvailableParameters.length ? responseParameterOptionListId : undefined}
                          placeholder="@t.username"
                          value={androidKeywordData}
                          onChange={(event) => setAndroidKeywordData(event.target.value)}
                        />
                      </FormField>
                    </div>
                    {androidKeywordMessage ? <div className="inline-message success-message">{androidKeywordMessage}</div> : null}
                  </div>
                ) : null}
                {automationCode ? (
                  <div className="detail-summary automation-step-mapping-summary">
                    <strong>{savedKeywordMappings.length ? "Mapped keyword automation" : "Coded JavaScript automation"}</strong>
                    {savedKeywordMappings.length ? (
                      <>
                        <span>Saved QAira keyword calls mapped on this manual step.</span>
                        <div className="automation-step-saved-keywords">
                          {savedKeywordMappings.map((mapping) => (
                            <div key={mapping.id}>
                              <strong>{mapping.keyword}</strong>
                              <code>{mapping.displayTarget}{mapping.value ? `, ${mapping.value}` : ""}</code>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <span>This step contains saved custom code. Review or modify it in the code field below.</span>
                    )}
                  </div>
                ) : null}
                <FormField
                  label="Step automation code"
                  hint="Use the same scoped tokens from the manual step text whenever automation needs case, suite, or run data."
                >
                  <textarea
                    placeholder="// Add QAira keyword code or CodedJS for this step."
                    rows={12}
                    value={automationCode}
                    onChange={(event) => setAutomationCode(event.target.value)}
                  />
                </FormField>
              </>
            )}

            <div className="detail-summary automation-preview-shell">
              <div className="automation-preview-title-row">
                <strong>Consolidated preview</strong>
                <InfoTooltip
                  content="This is what group and test-case level code views will use for this step."
                  label="Consolidated preview information"
                />
              </div>
              <pre className="automation-code-block automation-code-block--compact">
                <code>{previewCode}</code>
              </pre>
            </div>
          </div>
          <div className="resource-form-actions action-row">
            <button
              className="primary-button"
              onClick={() =>
                onSave({
                  step_type: stepType,
                  automation_code: normalizeAutomationCode(automationCode),
                  api_request: normalizedApiRequest
                })
              }
              type="button"
            >
              Save automation
            </button>
            <button className="ghost-button" onClick={onClose} type="button">
              Cancel
            </button>
            <button
              className="ghost-button danger"
              disabled={!automationCode && !normalizedApiRequest}
              onClick={() => {
                setAutomationCode("");
                setApiRequest(ensureApiRequest(null));
              }}
              type="button"
            >
              Clear mapped automation
            </button>
          </div>
        </div>
      </div>
    </div>
    {isRepositoryPickerOpen ? (
      <div className="modal-backdrop automation-repository-picker-backdrop" onClick={closeRepositoryPicker} role="presentation">
        <div
          aria-labelledby="automation-repository-picker-title"
          aria-modal="true"
          className="modal-card resource-modal-card automation-repository-picker-modal"
          onClick={(event) => event.stopPropagation()}
          ref={repositoryPickerRef}
          role="dialog"
          tabIndex={-1}
        >
          <div className="resource-modal-header">
            <div className="resource-modal-title">
              <div className="modal-title-info-row">
                <h2 className="dialog-title" id="automation-repository-picker-title">Use object repository field</h2>
                <InfoTooltip
                  content="Select a screen, then map its saved field into this step locator."
                  label="Object repository picker information"
                />
              </div>
            </div>
            <DialogCloseButton label="Close object repository field picker" onClick={closeRepositoryPicker} />
          </div>
          <div className="automation-repository-picker-body">
            <label className="automation-repository-picker-search">
              <span>Search screens or fields</span>
              <input
                autoFocus
                placeholder="Login page, submit button, data-testid..."
                value={repositorySearchTerm}
                onChange={(event) => setRepositorySearchTerm(event.target.value)}
              />
            </label>
            <div className="automation-repository-picker-grid">
              <div aria-label="Repository screens" className="automation-repository-screen-list">
                {repositoryScreens.map((screen) => (
                  <button
                    className={screen.screenName === selectedRepositoryScreen ? "is-selected" : ""}
                    key={screen.screenName}
                    onClick={() => setSelectedRepositoryScreen(screen.screenName)}
                    type="button"
                  >
                    <strong>{screen.screenName}</strong>
                    <span>{screen.fields.length} field{screen.fields.length === 1 ? "" : "s"}</span>
                    {screen.pageUrl ? <small>{screen.pageUrl}</small> : null}
                  </button>
                ))}
                {!repositoryScreens.length ? <div className="empty-state compact">No matching screens found.</div> : null}
              </div>
              <div aria-label="Fields in selected screen" className="automation-repository-field-list">
                {selectedRepositoryFields.map((field) => (
                  <button
                    key={field.id}
                    onClick={() => {
                      setWebKeywordLocator(field.reference);
                      setWebKeywordMessage(`${field.reference} selected from the Object Repository.`);
                      setIsRepositoryPickerOpen(false);
                    }}
                    type="button"
                  >
                    <strong>{field.objectName}</strong>
                    <span>{field.htmlTag}</span>
                    <code>{field.locator}</code>
                  </button>
                ))}
                {selectedRepositoryScreen && !selectedRepositoryFields.length ? (
                  <div className="empty-state compact">No fields are available for this screen.</div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    ) : null}
    </>
  );
}

export function SharedGroupLevelIcon({
  kind,
  size = 16
}: {
  kind?: "local" | "reusable" | null;
  size?: number;
}) {
  if (kind === "reusable") {
    return <SharedStepsIconGraphic size={size} />;
  }

  return <LocalGroupIcon size={size} />;
}
