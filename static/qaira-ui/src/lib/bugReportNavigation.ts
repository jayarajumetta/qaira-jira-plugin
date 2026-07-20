export type BugReportContext = {
  runId?: string | null;
  runName?: string | null;
  runStatus?: string | null;
  testCaseIds?: string[];
  testCaseTitle?: string | null;
  suiteIds?: string[];
  suiteName?: string | null;
  moduleIds?: string[];
  moduleName?: string | null;
  requirementIds?: string[];
  environment?: string | null;
  build?: string | null;
  title?: string | null;
  message?: string | null;
  returnTo?: string | null;
  returnLabel?: string | null;
};

const SAFE_RETURN_ROUTES = new Set([
  "/executions",
  "/test-cases",
  "/design",
  "/requirements"
]);

const uniqueIds = (values: string[] | undefined) =>
  [...new Set((values || []).map((value) => String(value).trim()).filter(Boolean))];

export function safeBugReportReturnRoute(value: string | null | undefined) {
  const route = String(value || "").trim();
  if (!route || route.length > 2_000 || !route.startsWith("/") || route.startsWith("//")) return "";

  try {
    const parsed = new URL(route, "https://qaira.invalid");
    if (parsed.origin !== "https://qaira.invalid" || !SAFE_RETURN_ROUTES.has(parsed.pathname)) return "";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "";
  }
}

export function buildBugReportPath(context: BugReportContext, mode: "manual" | "ai" = "manual") {
  const params = new URLSearchParams();
  params.set(mode === "ai" ? "ai" : "create", "1");

  const testCaseIds = uniqueIds(context.testCaseIds);
  const suiteIds = uniqueIds(context.suiteIds);
  const moduleIds = uniqueIds(context.moduleIds);
  const requirementIds = uniqueIds(context.requirementIds);
  const returnTo = safeBugReportReturnRoute(context.returnTo);

  if (context.runId) params.set("run", context.runId);
  if (context.runName) params.set("runName", context.runName);
  if (context.runStatus) params.set("status", context.runStatus);
  if (testCaseIds.length) params.set("linked_test_case_ids", testCaseIds.join(","));
  if (context.testCaseTitle) params.set("testCaseTitle", context.testCaseTitle);
  if (suiteIds.length) params.set("linked_test_suite_ids", suiteIds.join(","));
  if (context.suiteName) params.set("suiteName", context.suiteName);
  if (moduleIds.length) params.set("linked_module_ids", moduleIds.join(","));
  if (context.moduleName) params.set("moduleName", context.moduleName);
  if (requirementIds.length) params.set("linked_requirement_ids", requirementIds.join(","));
  if (context.environment) params.set("environment", context.environment);
  if (context.build) params.set("build", context.build);
  if (context.title) params.set("title", context.title);
  if (context.message) params.set("message", context.message);
  if (returnTo) params.set("returnTo", returnTo);
  if (context.returnLabel) params.set("returnLabel", context.returnLabel.slice(0, 80));

  return `/issues?${params.toString()}`;
}
