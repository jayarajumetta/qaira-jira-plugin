import { type CSSProperties, type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toJpeg } from "html-to-image";
import { api } from "../lib/api";
import { asArray } from "../lib/collectionGuards";
import { getJiraBrowseUrl, readAtlassianSiteUrl } from "../lib/jiraBrowseUrl";
import type { QualityDashboard, QualityDashboardBatchResponse, QualityDashboardGadget, QualityDashboardGadgetResult } from "../types";
import { OpenIcon, RefreshIcon, SparkIcon } from "./AppIcons";
import { DialogCloseButton } from "./DialogCloseButton";
import { useDeleteConfirmation } from "./DeleteConfirmationDialog";
import { FormField } from "./FormField";
import { LoadingState } from "./LoadingState";
import { Panel } from "./Panel";
import { ToastMessage } from "./ToastMessage";
import { useDialogFocus } from "../hooks/useDialogFocus";
import { useAuth } from "../auth/AuthContext";

const EMPTY_GADGET: QualityDashboardGadget = {
  id: "",
  title: "Open work",
  type: "metric",
  jql: "statusCategory != Done",
  group_by: "status",
  metric: "count",
  accent: "blue"
};

const DEFAULT_COMPLEX_DASHBOARD_PROMPT = "Build a release-quality command center for QA leadership. Include release confidence, story traceability and coverage gaps, effective automation, open bug exposure and a 90-day bug trend, QA throughput over 30 days, actual test-run cycle time, execution workflow, test distribution by module, story flow, ownership/productivity, and a prioritized action table. Keep every signal project-scoped, explainable, drillable, and useful at a glance.";

function emptyDashboard(projectId: string): QualityDashboard {
  return {
    id: "",
    project_id: projectId,
    name: "Release quality",
    description: "",
    layout: "two-column",
    gadgets: []
  };
}

function migrateLegacyStoryTitle(value: string) {
  if (value === "Requirement traceability") return "Story traceability";
  if (value === "Requirement coverage") return "Story coverage";
  return value;
}

function normalizeDashboard(value: unknown, projectId: string): QualityDashboard {
  const candidate = value && typeof value === "object" ? value as Partial<QualityDashboard> : {};
  return {
    ...emptyDashboard(projectId),
    ...candidate,
    id: typeof candidate.id === "string" ? candidate.id : "",
    project_id: typeof candidate.project_id === "string" ? candidate.project_id : projectId,
    name: typeof candidate.name === "string" && candidate.name.trim() ? candidate.name : "Release quality",
    description: typeof candidate.description === "string" ? candidate.description : "",
    layout: candidate.layout === "single" || candidate.layout === "three-column" ? candidate.layout : "two-column",
    gadgets: asArray<QualityDashboardGadget>(candidate.gadgets).map((gadget) => ({
      ...gadget,
      title: migrateLegacyStoryTitle(gadget.title)
    }))
  };
}

function resultTone(result?: QualityDashboardGadgetResult) {
  if (!result) return "neutral";
  return result.total ? "info" : "success";
}

const DASHBOARD_AUDIENCES = [
  { id: "executive", label: "Executive", detail: "Release exposure and go/no-go risk" },
  { id: "product", label: "Product", detail: "Scope, ownership and defect pressure" },
  { id: "quality", label: "Quality engineering", detail: "Execution, traceability and triage" },
  { id: "automation", label: "Automation", detail: "Reliability and maintenance demand" }
] as const;

const DASHBOARD_ACCENTS: Array<{ id: NonNullable<QualityDashboardGadget["accent"]>; label: string }> = [
  { id: "blue", label: "Blue" },
  { id: "green", label: "Green" },
  { id: "purple", label: "Purple" },
  { id: "orange", label: "Orange" },
  { id: "red", label: "Red" },
  { id: "teal", label: "Teal" },
  { id: "slate", label: "Slate" }
];

const QAIRA_DERIVED_METRICS = new Set<QualityDashboardGadget["metric"]>([
  "releaseConfidence", "requirementCoverage", "coverageGaps", "automationCoverage", "openDefects", "failedRuns",
  "executionCycleHours", "completedRuns30d", "testCases", "testSuites", "testRuns", "moduleCaseCount"
]);

const DASHBOARD_WIDGET_PRESETS: Array<{
  id: string;
  label: string;
  description: string;
  gadget: QualityDashboardGadget;
}> = [
  {
    id: "release-risk",
    label: "Release risk",
    description: "Critical/high unresolved work for leadership review.",
    gadget: { id: "", title: "Open release blockers", type: "metric", jql: "", group_by: "priority", metric: "highPriority", accent: "red" }
  },
  {
    id: "defect-pressure",
    label: "Defect pressure",
    description: "Open bugs grouped by priority for triage.",
    gadget: { id: "", title: "Defects by priority", type: "bar", jql: "", group_by: "priority", metric: "unresolved", accent: "orange" }
  },
  {
    id: "execution-flow",
    label: "Execution flow",
    description: "Test run workflow distribution for QA leads.",
    gadget: { id: "", title: "Execution workflow", type: "donut", jql: "", group_by: "status", metric: "count", accent: "blue" }
  },
  {
    id: "ownership",
    label: "Ownership gaps",
    description: "Unassigned unresolved quality work by owner.",
    gadget: { id: "", title: "Unassigned quality work", type: "table", jql: "", group_by: "assignee", metric: "unassigned", accent: "purple" }
  },
  {
    id: "aging",
    label: "Aging risk",
    description: "Stale unresolved work that needs attention.",
    gadget: { id: "", title: "Stale quality work", type: "table", jql: "", group_by: "priority", metric: "stale30d", accent: "slate" }
  },
  {
    id: "trend",
    label: "Quality trend",
    description: "Ninety-day demand or closure movement.",
    gadget: { id: "", title: "Quality activity trend", type: "line", jql: "", group_by: "updatedMonth", metric: "count", accent: "teal" }
  },
  {
    id: "traceability",
    label: "Story traceability",
    description: "Jira stories with and without linked QAira tests.",
    gadget: { id: "", title: "Story traceability", data_source: "qaira", type: "metric", jql: "", group_by: "status", metric: "requirementCoverage", accent: "green" }
  },
  {
    id: "cycle-time",
    label: "Execution cycle time",
    description: "Actual elapsed time from test-run start to completion.",
    gadget: { id: "", title: "Execution cycle time", data_source: "qaira", type: "metric", jql: "", group_by: "status", metric: "executionCycleHours", accent: "teal" }
  },
  {
    id: "module-distribution",
    label: "Module distribution",
    description: "QAira test cases distributed across modules and unassigned scope.",
    gadget: { id: "", title: "Test distribution by module", data_source: "qaira", type: "bar", jql: "", group_by: "module", metric: "moduleCaseCount", accent: "purple" }
  }
];

const GADGET_ACCENT_PALETTES: Record<NonNullable<QualityDashboardGadget["accent"]>, string[]> = {
  blue: ["#0c66e4", "#579dff", "#6cc3e0", "#85b8ff", "#cce0ff", "#1d7afc", "#09326c", "#94a3b8"],
  green: ["#1f845a", "#4bce97", "#7ee2b8", "#baf3db", "#22c55e", "#0f766e", "#14532d", "#94a3b8"],
  purple: ["#6e5dc6", "#9f8fef", "#c0b6f2", "#dfd8fd", "#a855f7", "#7c3aed", "#4c1d95", "#94a3b8"],
  orange: ["#fca700", "#e2b203", "#f5cd47", "#f8e6a0", "#fb923c", "#ea580c", "#7c2d12", "#94a3b8"],
  red: ["#c9372c", "#f87168", "#ff8f73", "#ffd5d2", "#ef4444", "#b91c1c", "#7f1d1d", "#94a3b8"],
  teal: ["#1d7f8c", "#6cc3e0", "#9dd9ee", "#c6edfb", "#14b8a6", "#0f766e", "#134e4a", "#94a3b8"],
  slate: ["#44546f", "#626f86", "#8590a2", "#b3b9c4", "#64748b", "#475569", "#1f2937", "#94a3b8"]
};

function quoteDashboardJqlValue(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"").slice(0, 120)}"`;
}

function joinDashboardJql(clauses: string[], orderBy = "updated DESC") {
  const uniqueClauses = [...new Set(clauses.map((clause) => clause.trim()).filter(Boolean))];
  return `${uniqueClauses.length ? uniqueClauses.join(" AND ") : "updated >= -90d"} ORDER BY ${orderBy}`;
}

function defaultOrderByForGadget(gadget: QualityDashboardGadget) {
  if (gadget.type === "line" || gadget.group_by === "createdWeek" || gadget.group_by === "createdMonth") return "created ASC";
  if (gadget.group_by === "updatedWeek" || gadget.group_by === "updatedMonth") return "updated ASC";
  if (gadget.metric === "stale30d" || /stale|aging|oldest/i.test(gadget.title)) return "updated ASC";
  if (gadget.metric === "highPriority" || /blocker|critical|priority|risk/i.test(gadget.title)) return "priority DESC, updated DESC";
  return "updated DESC";
}

function buildDefaultDashboardJql(gadget: QualityDashboardGadget, release = "") {
  if (gadget.data_source === "qaira") return "";
  const title = gadget.title.toLowerCase();
  const clauses: string[] = [];

  if (/bug|defect|incident|escaped/.test(title)) {
    clauses.push("issuetype = Bug");
  } else if (/automation|case|test case|maintenance/.test(title)) {
    clauses.push('issuetype = "Qaira Test Case"');
  } else if (/execution|run/.test(title)) {
    clauses.push('issuetype = "Qaira Test Run"');
  } else if (/requirement|story|scope|product/.test(title)) {
    clauses.push("issuetype in (Story, Epic)");
  } else if (/quality|test|qa/.test(title)) {
    clauses.push('issuetype in ("Qaira Test Case", "Qaira Test Run", Bug)');
  }

  if (gadget.metric === "resolved") clauses.push("resolution is not EMPTY");
  if (gadget.metric === "unresolved" || /open|unresolved|backlog/.test(title)) clauses.push("resolution = Unresolved");
  if (gadget.metric === "highPriority" || /blocker|critical|high|risk/.test(title)) clauses.push("priority in (Highest, High)");
  if (gadget.metric === "unassigned" || /unassigned|unowned|ownership/.test(title)) clauses.push("assignee is EMPTY");
  if (gadget.metric === "overdue" || /overdue/.test(title)) clauses.push("due <= now() AND resolution = Unresolved");
  if (gadget.metric === "stale30d" || /stale|aging|oldest/.test(title)) clauses.push("updated <= -30d AND resolution = Unresolved");
  if (gadget.metric === "created30d") clauses.push("created >= -30d");
  if (gadget.metric === "resolved30d") clauses.push("resolved >= -30d");
  if (gadget.metric === "resolutionRate" || gadget.metric === "averageResolutionDays") clauses.push("updated >= -90d");
  if (gadget.metric === "averageAgeDays") clauses.push("resolution = Unresolved");
  if (gadget.type === "line" || gadget.group_by === "createdWeek" || gadget.group_by === "createdMonth") clauses.push("created >= -90d");
  if (gadget.group_by === "updatedWeek" || gadget.group_by === "updatedMonth") clauses.push("updated >= -90d");
  if (release.trim()) clauses.push(`fixVersion = ${quoteDashboardJqlValue(release.trim())}`);

  return joinDashboardJql(clauses, defaultOrderByForGadget(gadget));
}

function dashboardGroupClause(result: QualityDashboardGadgetResult, groupLabel?: string) {
  const label = String(groupLabel || "").trim();
  if (!label) return "";
  const groupBy = result.gadget.group_by;
  const emptyLabel = /^(no |unassigned|unlabelled)/i.test(label);
  const fields: Partial<Record<QualityDashboardGadget["group_by"], string>> = {
    status: "status",
    statusCategory: "statusCategory",
    priority: "priority",
    issuetype: "issuetype",
    assignee: "assignee",
    reporter: "reporter",
    components: "component",
    fixVersion: "fixVersion",
    labels: "labels",
    sprint: "sprint",
    resolution: "resolution"
  };
  const field = fields[groupBy];
  if (field) return emptyLabel ? `${field} is EMPTY` : `${field} = ${quoteDashboardJqlValue(label)}`;
  if ((groupBy === "createdMonth" || groupBy === "updatedMonth") && /^\d{4}-\d{2}$/.test(label)) {
    const [year, month] = label.split("-").map(Number);
    const next = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
    return `${groupBy === "createdMonth" ? "created" : "updated"} >= "${label}-01" AND ${groupBy === "createdMonth" ? "created" : "updated"} < "${next}"`;
  }
  return "";
}

function addDashboardDrilldownClause(jql: string, clause: string) {
  if (!clause) return jql;
  const match = jql.match(/\s+ORDER\s+BY\s+/i);
  if (!match?.index) return `${jql} AND (${clause})`;
  return `${jql.slice(0, match.index)} AND (${clause})${jql.slice(match.index)}`;
}

function openDashboardDrilldown(result: QualityDashboardGadgetResult, groupLabel?: string) {
  if (result.gadget.data_source === "qaira") {
    const target = new URL(window.location.href);
    const path = result.drilldown_target || "/";
    target.hash = `#${path}${groupLabel ? `${path.includes("?") ? "&" : "?"}dashboardGroup=${encodeURIComponent(groupLabel)}` : ""}`;
    window.open(target.toString(), "_blank", "noopener,noreferrer");
    return;
  }
  const siteUrl = readAtlassianSiteUrl();
  if (!siteUrl) throw new Error("Jira site context is unavailable. Refresh Qaira, then open the drill-down again.");
  const jql = addDashboardDrilldownClause(result.jql, dashboardGroupClause(result, groupLabel));
  window.open(`${siteUrl}/issues/?jql=${encodeURIComponent(jql)}`, "_blank", "noopener,noreferrer");
}

function waitForImage(image: HTMLImageElement) {
  return new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Unable to render dashboard snapshot."));
  });
}

async function fitDashboardSnapshotToForgePayload(dataUrl: string) {
  const maxDataUrlLength = 410_000;
  if (dataUrl.length <= maxDataUrlLength) return dataUrl;

  const image = new Image();
  image.decoding = "async";
  image.src = dataUrl;
  await waitForImage(image);
  let scale = 1;
  let quality = 0.84;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Dashboard snapshot canvas is unavailable.");
    context.fillStyle = "#f7f8f9";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const compressed = canvas.toDataURL("image/jpeg", quality);
    if (compressed.length <= maxDataUrlLength) return compressed;
    if (quality > 0.58) quality -= 0.07;
    else scale *= 0.86;
  }
  throw new Error("The styled dashboard is too large to export. Reduce the number of large table gadgets and retry.");
}

async function captureDashboardSnapshot(node: HTMLElement, dashboardName: string) {
  const rect = node.getBoundingClientRect();
  const width = Math.max(760, Math.ceil(rect.width || node.scrollWidth || 1100));
  const height = Math.max(420, Math.ceil(node.scrollHeight || rect.height || 720));
  const maxPixels = 7_000_000;
  const pixelRatio = Math.max(1, Math.min(window.devicePixelRatio || 1, 1.6, Math.sqrt(maxPixels / Math.max(1, width * height))));
  const dataUrl = await toJpeg(node, {
    backgroundColor: "#f7f8f9",
    cacheBust: true,
    canvasHeight: Math.max(1, Math.round(height * pixelRatio)),
    canvasWidth: Math.max(1, Math.round(width * pixelRatio)),
    filter: (candidate) => {
      if (!(candidate instanceof HTMLElement)) return true;
      return !candidate.matches("input, select, textarea, .quality-gadget-actions, .quality-gadget-control, .quality-gadget-remove");
    },
    height,
    pixelRatio: 1,
    preferredFontFormat: "woff2",
    quality: 0.9,
    style: { boxSizing: "border-box", height: `${height}px`, margin: "0", width: `${width}px` },
    width
  });
  if (!dataUrl.startsWith("data:image/jpeg")) throw new Error("Dashboard snapshot could not be encoded.");
  return {
    rendered_snapshot_data_url: await fitDashboardSnapshotToForgePayload(dataUrl),
    rendered_snapshot_name: dashboardName || "Qaira dashboard",
    rendered_snapshot_captured_at: new Date().toISOString()
  };
}

export function CustomQualityDashboard({ projectId, canManage, canUseAi, canUseAutomation }: { projectId: string; canManage: boolean; canUseAi: boolean; canUseAutomation: boolean }) {
  const queryClient = useQueryClient();
  const { confirmDelete, confirmationDialog } = useDeleteConfirmation();
  const { session } = useAuth();
  const reportSurfaceRef = useRef<HTMLElement | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [editorMode, setEditorMode] = useState<"create" | "edit" | null>(null);
  const [draft, setDraft] = useState<QualityDashboard>(() => emptyDashboard(projectId));
  const [gadgetDraft, setGadgetDraft] = useState<QualityDashboardGadget>(EMPTY_GADGET);
  const [editingGadgetId, setEditingGadgetId] = useState("");
  const [isGadgetJqlDirty, setIsGadgetJqlDirty] = useState(false);
  const [designerDraft, setDesignerDraft] = useState<{ stakeholder: typeof DASHBOARD_AUDIENCES[number]["id"]; release: string; prompt: string }>({ stakeholder: "quality", release: "", prompt: DEFAULT_COMPLEX_DASHBOARD_PROMPT });
  const [isReportEmailModalOpen, setIsReportEmailModalOpen] = useState(false);
  const [reportEmailDraft, setReportEmailDraft] = useState("");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");
  const [gadgetResultOverrides, setGadgetResultOverrides] = useState<Record<string, QualityDashboardBatchResponse["results"][number]>>({});
  const [refreshingGadgetIds, setRefreshingGadgetIds] = useState<string[]>([]);
  const activeGadgetRefreshesRef = useRef(new Map<string, symbol>());
  const activeDashboardScopeRef = useRef("");
  const dashboardAudiences = useMemo(
    () => canUseAutomation ? DASHBOARD_AUDIENCES : DASHBOARD_AUDIENCES.filter((audience) => audience.id !== "automation"),
    [canUseAutomation]
  );
  const dashboards = useQuery({
    queryKey: ["quality-dashboards", projectId],
    queryFn: async () => asArray(await api.qualityDashboards.list({ project_id: projectId }))
      .map((dashboard) => normalizeDashboard(dashboard, projectId)),
    enabled: Boolean(projectId)
  });
  const selected = useMemo(
    () => (dashboards.data || []).find((dashboard) => dashboard.id === selectedId) || null,
    [dashboards.data, selectedId]
  );

  useEffect(() => {
    if (dashboards.data?.length && !dashboards.data.some((dashboard) => dashboard.id === selectedId)) {
      setSelectedId(dashboards.data[0].id);
    }
  }, [dashboards.data, selectedId]);

  useEffect(() => {
    setSelectedId("");
    setEditorMode(null);
    setDraft(emptyDashboard(projectId));
  }, [projectId]);

  useEffect(() => {
    if (!canUseAutomation && designerDraft.stakeholder === "automation") {
      setDesignerDraft((current) => ({ ...current, stakeholder: "quality" }));
    }
  }, [canUseAutomation, designerDraft.stakeholder]);

  const activeDashboard = editorMode ? normalizeDashboard(draft, projectId) : selected;
  const activeGadgets = asArray(activeDashboard?.gadgets);
  const activeDashboardScope = `${projectId}:${activeDashboard?.id || "draft"}:${activeGadgets
    .map((gadget) => [gadget.id, gadget.data_source, gadget.type, gadget.metric, gadget.group_by, gadget.jql].join(":"))
    .join("|")}`;
  activeDashboardScopeRef.current = activeDashboardScope;
  const recommendedJql = useMemo(
    () => buildDefaultDashboardJql(gadgetDraft, designerDraft.release),
    [designerDraft.release, gadgetDraft.group_by, gadgetDraft.metric, gadgetDraft.title, gadgetDraft.type]
  );

  const dashboardResults = useQuery({
    queryKey: ["quality-dashboard-results", projectId, activeDashboard?.id || "draft", activeGadgets],
    queryFn: () => api.analytics.queryBatch({ project_id: projectId, gadgets: activeGadgets, limit: 100 }),
    enabled: Boolean(projectId && activeGadgets.length),
    staleTime: 30_000,
    retry: 1
  });
  const resultByGadgetId = useMemo(
    () => {
      const entries = new Map<string, QualityDashboardBatchResponse["results"][number]>(
        asArray(dashboardResults.data?.results).map((entry) => [entry.gadget_id, entry])
      );
      Object.entries(gadgetResultOverrides).forEach(([gadgetId, entry]) => entries.set(gadgetId, entry));
      return entries;
    },
    [dashboardResults.data, gadgetResultOverrides]
  );
  useEffect(() => {
    setGadgetResultOverrides({});
  }, [dashboardResults.dataUpdatedAt, projectId, selectedId]);
  useEffect(() => {
    activeGadgetRefreshesRef.current.clear();
    setRefreshingGadgetIds([]);
    setGadgetResultOverrides({});
  }, [activeDashboardScope]);
  useEffect(() => {
    if (!editorMode || isGadgetJqlDirty || !recommendedJql || gadgetDraft.jql === recommendedJql) return;
    setGadgetDraft((current) => ({ ...current, jql: recommendedJql }));
  }, [editorMode, gadgetDraft.jql, isGadgetJqlDirty, recommendedJql]);
  const preview = useMutation({
    mutationFn: (gadget: QualityDashboardGadget) => api.analytics.query({ project_id: projectId, jql: gadget.jql, gadget: { ...gadget, id: gadget.id || `gadget-${Date.now()}` }, limit: 100 }),
    onError: (error) => {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "Unable to preview the gadget.");
    }
  });
  const save = useMutation({
    mutationFn: async () => draft.id
      ? api.qualityDashboards.update(draft.id, draft)
      : api.qualityDashboards.create({
          project_id: projectId,
          name: draft.name,
          description: draft.description,
          layout: draft.layout,
          gadgets: draft.gadgets,
          revision: draft.revision,
          created_at: draft.created_at,
          updated_at: draft.updated_at
        }),
    onSuccess: async (saved) => {
      setMessageTone("success");
      setMessage("Dashboard saved.");
      await queryClient.invalidateQueries({ queryKey: ["quality-dashboards", projectId] });
      setSelectedId(saved.id);
      setEditorMode(null);
    },
    onError: (error) => {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "Unable to save the dashboard.");
    }
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.qualityDashboards.delete(id),
    onSuccess: async () => {
      setSelectedId("");
      setDraft(emptyDashboard(projectId));
      setEditorMode(null);
      setMessageTone("success");
      setMessage("Dashboard deleted.");
      await queryClient.invalidateQueries({ queryKey: ["quality-dashboards", projectId] });
    },
    onError: (error) => {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "Unable to delete the dashboard.");
    }
  });
  const downloadReport = useMutation({
    mutationFn: ({ dashboardId, snapshot }: { dashboardId: string; snapshot?: Awaited<ReturnType<typeof captureDashboardSnapshot>> }) =>
      api.qualityDashboards.downloadReportPdf(dashboardId, snapshot || undefined)
  });
  const shareReport = useMutation({
    mutationFn: ({ dashboardId, recipients, snapshot }: { dashboardId: string; recipients: string[]; snapshot?: Awaited<ReturnType<typeof captureDashboardSnapshot>> }) =>
      api.qualityDashboards.shareReport(dashboardId, { recipients, ...(snapshot || {}) })
  });
  const design = useMutation({
    mutationFn: () => api.analytics.designDashboard({
      project_id: projectId,
      stakeholder: designerDraft.stakeholder,
      release: designerDraft.release.trim() || undefined,
      prompt: designerDraft.prompt.trim() || undefined
    }),
    onSuccess: (response) => {
      const designedDashboard = normalizeDashboard(response.dashboard, projectId);
      setDraft({ ...designedDashboard, id: "", project_id: projectId });
      setEditingGadgetId("");
      setGadgetDraft(EMPTY_GADGET);
      setIsGadgetJqlDirty(false);
      setMessageTone("success");
      setMessage(`Designed ${designedDashboard.gadgets.length} reviewable gadgets. Review the JQL, then save.`);
    },
    onError: (error) => {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "Unable to design the dashboard.");
    }
  });

  const addGadget = () => {
    if (!gadgetDraft.title.trim()) return;
    const gadget = { ...gadgetDraft, accent: gadgetDraft.accent || "blue", id: editingGadgetId || `gadget-${Date.now()}` };
    setDraft((current) => ({
      ...current,
      gadgets: editingGadgetId
        ? current.gadgets.map((item) => item.id === editingGadgetId ? gadget : item)
        : [...current.gadgets, gadget].slice(0, 12)
    }));
    setEditingGadgetId("");
    setGadgetDraft({ ...EMPTY_GADGET, title: "" });
    setIsGadgetJqlDirty(false);
    preview.reset();
  };

  const moveGadget = (id: string, direction: -1 | 1) => setDraft((current) => {
    const index = current.gadgets.findIndex((gadget) => gadget.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= current.gadgets.length) return current;
    const gadgets = [...current.gadgets];
    [gadgets[index], gadgets[target]] = [gadgets[target], gadgets[index]];
    return { ...current, gadgets };
  });

  const duplicateGadget = (gadget: QualityDashboardGadget) => setDraft((current) => current.gadgets.length >= 12 ? current : ({
    ...current,
    gadgets: [...current.gadgets, { ...gadget, id: `gadget-${Date.now()}`, title: `${gadget.title} copy` }]
  }));

  const isEditorBusy = save.isPending || design.isPending;
  const closeReportEmailModal = () => {
    if (!shareReport.isPending) setIsReportEmailModalOpen(false);
  };
  const reportDialogRef = useDialogFocus<HTMLFormElement>({
    active: isReportEmailModalOpen,
    closeDisabled: shareReport.isPending,
    onClose: closeReportEmailModal
  });
  const closeEditor = () => {
    if (isEditorBusy) return;
    setEditorMode(null);
    setEditingGadgetId("");
    setGadgetDraft({ ...EMPTY_GADGET });
    setIsGadgetJqlDirty(false);
    preview.reset();
  };
  const editorDialogRef = useDialogFocus<HTMLDivElement>({
    active: Boolean(editorMode),
    closeDisabled: isEditorBusy,
    onClose: closeEditor
  });
  const openCreateEditor = () => {
    setDraft(emptyDashboard(projectId));
    setEditingGadgetId("");
    setGadgetDraft({ ...EMPTY_GADGET });
    setIsGadgetJqlDirty(false);
    setDesignerDraft({ stakeholder: "quality", release: "", prompt: DEFAULT_COMPLEX_DASHBOARD_PROMPT });
    design.reset();
    preview.reset();
    setEditorMode("create");
  };
  const openEditEditor = () => {
    if (!selected) return;
    setDraft({ ...selected, gadgets: selected.gadgets.map((gadget) => ({ ...gadget })) });
    setEditingGadgetId("");
    setGadgetDraft({ ...EMPTY_GADGET });
    setIsGadgetJqlDirty(false);
    preview.reset();
    setEditorMode("edit");
  };
  const deleteSelectedDashboard = async () => {
    if (!selected) return;
    const confirmed = await confirmDelete({
      title: "Delete quality dashboard?",
      message: `${selected.name || "This dashboard"} and its gadget configuration will be removed from this Jira project.`,
      confirmLabel: "Delete dashboard"
    });
    if (confirmed) remove.mutate(selected.id);
  };
  const handleDownloadReport = async () => {
    if (!selected) return;
    try {
      if (!reportSurfaceRef.current) throw new Error("The live custom dashboard is not ready to export. Refresh and retry.");
      const snapshot = await captureDashboardSnapshot(reportSurfaceRef.current, selected.name);
      const blob = await downloadReport.mutateAsync({ dashboardId: selected.id, snapshot });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${(selected.name || "qaira-dashboard-report").replace(/[^A-Za-z0-9._-]+/g, "-")}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setMessageTone("success");
      setMessage("Dashboard report PDF exported.");
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "Unable to export dashboard report.");
    }
  };
  const handleOpenReportEmailModal = () => {
    setReportEmailDraft(session?.user.email || "");
    setIsReportEmailModalOpen(true);
  };
  const handleShareReport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    const recipients = reportEmailDraft.split(/[,\n;]/).map((entry) => entry.trim()).filter(Boolean);
    if (!recipients.length) {
      setMessageTone("error");
      setMessage("Enter at least one dashboard report recipient.");
      return;
    }
    try {
      if (!reportSurfaceRef.current) throw new Error("The live custom dashboard is not ready to email. Refresh and retry.");
      const snapshot = await captureDashboardSnapshot(reportSurfaceRef.current, selected.name);
      const response = await shareReport.mutateAsync({ dashboardId: selected.id, recipients, snapshot });
      setIsReportEmailModalOpen(false);
      setMessageTone("success");
      setMessage(`Dashboard report emailed to ${response.recipients} recipient${response.recipients === 1 ? "" : "s"}.`);
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "Unable to email dashboard report.");
    }
  };
  const handleGadgetDrilldown = (result: QualityDashboardGadgetResult, groupLabel?: string) => {
    try {
      openDashboardDrilldown(result, groupLabel);
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "Unable to open the dashboard drill-down.");
    }
  };
  const refreshGadget = async (gadget: QualityDashboardGadget) => {
    if (!projectId || dashboardResults.isFetching || activeGadgetRefreshesRef.current.has(gadget.id)) return;
    if (activeGadgetRefreshesRef.current.size >= 2) {
      setMessageTone("error");
      setMessage("Two dashboard widgets are already refreshing. Wait for one to finish, then retry.");
      return;
    }
    const requestToken = Symbol(gadget.id);
    const requestScope = activeDashboardScopeRef.current;
    activeGadgetRefreshesRef.current.set(gadget.id, requestToken);
    setRefreshingGadgetIds((current) => [...new Set([...current, gadget.id])]);
    try {
      const result = await api.analytics.query({ project_id: projectId, jql: gadget.jql, gadget, limit: 100 });
      if (activeDashboardScopeRef.current === requestScope && activeGadgetRefreshesRef.current.get(gadget.id) === requestToken) {
        setGadgetResultOverrides((current) => ({
          ...current,
          [gadget.id]: { gadget_id: gadget.id, result }
        }));
      }
    } catch (error) {
      if (activeDashboardScopeRef.current === requestScope && activeGadgetRefreshesRef.current.get(gadget.id) === requestToken) {
        setMessageTone("error");
        setMessage(error instanceof Error ? error.message : `Unable to refresh ${gadget.title}.`);
      }
    } finally {
      if (activeGadgetRefreshesRef.current.get(gadget.id) === requestToken) {
        activeGadgetRefreshesRef.current.delete(gadget.id);
        setRefreshingGadgetIds((current) => current.filter((gadgetId) => gadgetId !== gadget.id));
      }
    }
  };
  const refreshDashboards = async () => {
    setGadgetResultOverrides({});
    await Promise.all([
      dashboards.refetch(),
      activeGadgets.length ? dashboardResults.refetch() : Promise.resolve()
    ]);
  };
  const isDashboardRefreshPending = dashboards.isFetching || dashboardResults.isFetching || refreshingGadgetIds.length > 0;
  const isGadgetRefreshPending = (gadgetId: string) => dashboardResults.isFetching || refreshingGadgetIds.includes(gadgetId);

  if (dashboards.isLoading) return <LoadingState label="Loading quality dashboards" />;

  return (
    <div className="custom-dashboard-workspace">
      <div className="custom-dashboard-toolbar card">
        <div className="custom-dashboard-toolbar-main">
          <FormField className="custom-dashboard-selector-field" label="Dashboard">
            <select disabled={!dashboards.data?.length} value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
              {!dashboards.data?.length ? <option value="">No dashboards yet</option> : null}
              {(dashboards.data || []).map((dashboard) => <option key={dashboard.id} value={dashboard.id}>{dashboard.name}</option>)}
            </select>
          </FormField>
        </div>
        <div className="custom-dashboard-toolbar-actions">
          <button className="primary-button" disabled={!canManage} onClick={openCreateEditor} type="button">Create dashboard</button>
          <button className="ghost-button" disabled={!canManage || !selected} onClick={openEditEditor} type="button">Edit</button>
          <button className="ghost-button danger" disabled={!canManage || !selected || remove.isPending} onClick={() => void deleteSelectedDashboard()} type="button">{remove.isPending ? "Deleting…" : "Delete"}</button>
          <button className="ghost-button" disabled={!selected || downloadReport.isPending} onClick={() => void handleDownloadReport()} type="button">{downloadReport.isPending ? "Exporting…" : "Export PDF"}</button>
          <button className="ghost-button" disabled={!canManage || !selected || shareReport.isPending} onClick={handleOpenReportEmailModal} type="button">Email report</button>
          <button
            aria-busy={isDashboardRefreshPending}
            aria-label={isDashboardRefreshPending ? "Refreshing dashboards" : "Refresh dashboards"}
            className={`ghost-button compact custom-dashboard-refresh${isDashboardRefreshPending ? " is-loading" : ""}`}
            disabled={isDashboardRefreshPending}
            onClick={() => void refreshDashboards()}
            title="Refresh dashboards"
            type="button"
          >
            <RefreshIcon size={20} />
            <span>{isDashboardRefreshPending ? "Refreshing…" : "Refresh"}</span>
          </button>
        </div>
      </div>

      {selected ? (
        <section className="custom-dashboard-view custom-dashboard-report-surface card" aria-label={selected.name} ref={reportSurfaceRef}>
          <div className="custom-dashboard-view-head">
            <div><strong>{selected.name}</strong>{selected.description ? <span>{selected.description}</span> : null}</div>
          </div>
          <div className={`quality-gadget-grid layout-${selected.layout}`}>
            {selected.gadgets.map((gadget) => {
              const evaluated = resultByGadgetId.get(gadget.id);
              return (
                <div className="quality-gadget-shell" key={gadget.id}>
                  {dashboardResults.isLoading ? <LoadingState label={`Loading ${gadget.title}`} /> : null}
                  {evaluated?.result ? <QualityGadget isRefreshing={isGadgetRefreshPending(gadget.id)} onDrilldown={(groupLabel) => handleGadgetDrilldown(evaluated.result!, groupLabel)} onRefresh={() => void refreshGadget(gadget)} result={evaluated.result} /> : null}
                  {evaluated?.error ? <div className="dashboard-gadget-error" role="alert"><strong>{evaluated.error.code}</strong><span>{evaluated.error.message}</span><button className="ghost-button compact" disabled={isGadgetRefreshPending(gadget.id)} onClick={() => void refreshGadget(gadget)} type="button">{isGadgetRefreshPending(gadget.id) ? "Refreshing…" : "Retry widget"}</button></div> : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <div className="empty-state"><strong>No custom dashboard yet</strong><span>Create a project-scoped dashboard from JQL gadgets or start with the AI-assisted designer.</span>{canManage ? <button className="primary-button" onClick={openCreateEditor} type="button">Create dashboard</button> : null}</div>
      )}

      {editorMode ? (
        <div className="modal-backdrop modal-backdrop--scroll" onClick={closeEditor} role="presentation">
          <div
            aria-labelledby="custom-dashboard-dialog-title"
            aria-modal="true"
            className="modal-card custom-dashboard-modal"
            onClick={(event) => event.stopPropagation()}
            ref={editorDialogRef}
            role="dialog"
            tabIndex={-1}
          >
            <div className="modal-card-head custom-dashboard-modal-head">
              <div><span className="eyebrow">Quality intelligence</span><h3 id="custom-dashboard-dialog-title">{editorMode === "create" ? "Create dashboard" : "Edit dashboard"}</h3><p>Build a Jira-project-scoped decision surface and validate every JQL gadget before saving.</p></div>
              <DialogCloseButton disabled={isEditorBusy} label={`Close ${editorMode} dashboard dialog`} onClick={closeEditor} />
            </div>

            <div className="custom-dashboard-modal-body">
              {editorMode === "create" && canUseAi ? (
                <section className="dashboard-designer card" aria-label="AI-assisted dashboard designer">
                  <div className="dashboard-designer-head"><span className="dashboard-designer-icon"><SparkIcon /></span><div><strong>AI-assisted dashboard designer</strong><span>Creates an explainable, editable draft from quality-engineering patterns. Nothing is saved until you approve it.</span></div></div>
                  <div className="dashboard-audience-grid">
                    {dashboardAudiences.map((audience) => (
                      <button className={designerDraft.stakeholder === audience.id ? "dashboard-audience-card is-active" : "dashboard-audience-card"} key={audience.id} onClick={() => setDesignerDraft((current) => ({ ...current, stakeholder: audience.id }))} type="button"><strong>{audience.label}</strong><span>{audience.detail}</span></button>
                    ))}
                  </div>
                  <div className="dashboard-designer-fields">
                    <FormField label="Release / Fix version" hint="Optional; safely added to generated JQL."><input value={designerDraft.release} onChange={(event) => setDesignerDraft((current) => ({ ...current, release: event.target.value }))} /></FormField>
                    <FormField className="dashboard-designer-prompt" label="Dashboard build prompt" hint="Use this rich default, erase it, or write your own bounded quality-dashboard brief."><textarea maxLength={2000} rows={5} value={designerDraft.prompt} onChange={(event) => setDesignerDraft((current) => ({ ...current, prompt: event.target.value }))} /></FormField>
                    <button className="primary-button" disabled={!canManage || design.isPending} onClick={() => design.mutate()} type="button"><SparkIcon />{design.isPending ? "Designing…" : "Design draft"}</button>
                  </div>
                  {design.data ? <div className="dashboard-design-assurance"><span>{Math.round(design.data.confidence * 100)}% design confidence</span><span>{asArray(design.data.dashboard?.gadgets).length} bounded gadgets</span><span>Human approval required</span></div> : null}
                </section>
              ) : null}

              <div className="custom-dashboard-editor-grid">
                <Panel title="Dashboard and gadget builder">
                  <div className="form-grid custom-dashboard-profile-grid">
                    <FormField label="Name" required><input className="custom-dashboard-name-input" data-autofocus="true" maxLength={120} required style={{ width: `${Math.min(Math.max((draft.name || "").length + 2, 18), 58)}ch` }} value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></FormField>
                    <FormField label="Description"><textarea maxLength={500} rows={2} value={draft.description || ""} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></FormField>
                    <FormField label="Layout"><select value={draft.layout} onChange={(event) => setDraft((current) => ({ ...current, layout: event.target.value as QualityDashboard["layout"] }))}><option value="single">Single column</option><option value="two-column">Two columns</option><option value="three-column">Three columns</option></select></FormField>
                  </div>
                  <section className="dashboard-widget-library" aria-label="Quality dashboard widget library">
                    <div>
                      <strong>Widget library</strong>
                      <span>Start from stakeholder-ready quality signals, then tune the chart, color and JQL.</span>
                    </div>
                    <div className="dashboard-widget-preset-grid">
                      {DASHBOARD_WIDGET_PRESETS.map((preset) => (
                        <button
                          className="dashboard-widget-preset"
                          key={preset.id}
                          onClick={() => {
                            setEditingGadgetId("");
                            setIsGadgetJqlDirty(false);
                            setGadgetDraft({ ...preset.gadget, release: designerDraft.release.trim() || undefined, jql: buildDefaultDashboardJql(preset.gadget, designerDraft.release) });
                            preview.reset();
                          }}
                          type="button"
                        >
                          <strong>{preset.label}</strong>
                          <span>{preset.description}</span>
                        </button>
                      ))}
                    </div>
                  </section>
                  <div className="custom-gadget-builder">
                    <div className="form-grid">
                      <FormField label="Gadget title" required><input maxLength={100} value={gadgetDraft.title} onChange={(event) => setGadgetDraft((current) => ({ ...current, title: event.target.value }))} /></FormField>
                      <div className="record-grid">
                        <FormField label="Data source">
                          <select
                            value={gadgetDraft.data_source || "jira"}
                            onChange={(event) => {
                              const dataSource = event.target.value as NonNullable<QualityDashboardGadget["data_source"]>;
                              setIsGadgetJqlDirty(false);
                              setGadgetDraft((current) => {
                                const next = {
                                  ...current,
                                  data_source: dataSource,
                                  metric: dataSource === "qaira" && !QAIRA_DERIVED_METRICS.has(current.metric) ? "count" as const : current.metric
                                };
                                return { ...next, jql: dataSource === "qaira" ? "" : buildDefaultDashboardJql(next, designerDraft.release) };
                              });
                            }}
                          >
                            <option value="jira">Jira issues · JQL</option>
                            <option value="qaira">QAira derived quality</option>
                          </select>
                        </FormField>
                        <FormField label="Visualization"><select value={gadgetDraft.type} onChange={(event) => setGadgetDraft((current) => ({ ...current, type: event.target.value as QualityDashboardGadget["type"] }))}><option value="metric">Metric</option><option value="donut">Donut</option><option value="bar">Bar</option><option value="stacked-bar">Stacked bar</option><option value="line">Trend line</option><option value="table">Issue list</option></select></FormField>
                        <FormField label="Group by"><select value={gadgetDraft.group_by} onChange={(event) => setGadgetDraft((current) => ({ ...current, group_by: event.target.value as QualityDashboardGadget["group_by"] }))}><option value="status">Status</option><option value="statusCategory">Status category</option><option value="priority">Priority</option><option value="issuetype">Issue type</option><option value="assignee">Assignee</option><option value="reporter">Reporter</option><option value="components">Component</option><option value="fixVersion">Fix version</option><option value="sprint">Sprint</option><option value="module">QAira module</option><option value="labels">Labels</option><option value="resolution">Resolution</option><option value="createdWeek">Created week</option><option value="updatedWeek">Updated week</option><option value="createdMonth">Created month</option><option value="updatedMonth">Updated month</option></select></FormField>
                        <FormField label="Metric">
                          <select
                            value={gadgetDraft.metric || "count"}
                            onChange={(event) => {
                              const metric = event.target.value as QualityDashboardGadget["metric"];
                              setIsGadgetJqlDirty(false);
                              setGadgetDraft((current) => ({
                                ...current,
                                metric,
                                ...(QAIRA_DERIVED_METRICS.has(metric) ? { data_source: "qaira" as const, jql: "" } : {})
                              }));
                            }}
                          >
                            <optgroup label="Jira issue metrics"><option value="count">Count</option><option value="resolved">Resolved</option><option value="unresolved">Unresolved</option><option value="highPriority">High priority</option><option value="unassigned">Unassigned</option><option value="overdue">Overdue</option><option value="stale30d">Stale 30+ days</option><option value="created30d">Created in 30 days</option><option value="resolved30d">Resolved in 30 days</option><option value="resolutionRate">Resolution rate</option><option value="averageAgeDays">Average age</option><option value="averageResolutionDays">Average resolution time</option></optgroup>
                            <optgroup label="QAira derived metrics"><option value="releaseConfidence">Release confidence</option><option value="requirementCoverage">Story coverage</option><option value="coverageGaps">Coverage gaps</option><option value="automationCoverage">Automation coverage</option><option value="openDefects">Open defects</option><option value="failedRuns">Failed runs</option><option value="executionCycleHours">Execution cycle time</option><option value="completedRuns30d">QA throughput · 30 days</option><option value="testCases">Test cases</option><option value="testSuites">Test suites</option><option value="testRuns">Test runs</option><option value="moduleCaseCount">Cases by module</option></optgroup>
                          </select>
                        </FormField>
                        <FormField label="Accent"><select value={gadgetDraft.accent || "blue"} onChange={(event) => setGadgetDraft((current) => ({ ...current, accent: event.target.value as QualityDashboardGadget["accent"] }))}>{DASHBOARD_ACCENTS.map((accent) => <option key={accent.id} value={accent.id}>{accent.label}</option>)}</select></FormField>
                      </div>
                      {gadgetDraft.data_source !== "qaira" ? <><FormField label="JQL" hint="Auto-filled from the gadget title, chart, metric, grouping and release; Qaira always adds the active Jira project server-side."><textarea maxLength={2000} rows={4} value={gadgetDraft.jql} onChange={(event) => { setIsGadgetJqlDirty(true); setGadgetDraft((current) => ({ ...current, jql: event.target.value })); }} /></FormField><div className="dashboard-jql-recommendation"><span>Suggested JQL: <code>{recommendedJql}</code></span><button className="ghost-button compact" onClick={() => { setIsGadgetJqlDirty(false); setGadgetDraft((current) => ({ ...current, jql: recommendedJql })); }} type="button">Use suggested JQL</button></div></> : <div className="dashboard-derived-note"><strong>Derived QAira signal</strong><span>Computed from bounded Jira-native stories, tests, suites, modules, runs, and Bugs. No free-form query is executed.</span></div>}
                      <div className="action-row"><button className="ghost-button" disabled={preview.isPending} onClick={() => preview.mutate({ ...gadgetDraft, id: gadgetDraft.id || "preview" })} type="button">{preview.isPending ? "Running…" : "Preview"}</button><button className="primary-button" disabled={!gadgetDraft.title.trim() || (!editingGadgetId && draft.gadgets.length >= 12)} onClick={addGadget} type="button">{editingGadgetId ? "Update gadget" : "Add gadget"}</button>{editingGadgetId ? <button className="ghost-button" onClick={() => { setEditingGadgetId(""); setGadgetDraft({ ...EMPTY_GADGET, title: "" }); setIsGadgetJqlDirty(false); }} type="button">Cancel edit</button> : null}</div>
                    </div>
                    {preview.data ? <QualityGadget onDrilldown={(groupLabel) => handleGadgetDrilldown(preview.data!, groupLabel)} result={preview.data} /> : null}
                  </div>
                </Panel>

                <Panel title={draft.name || "Live preview"}>
                  <div className={`quality-gadget-grid layout-${draft.layout}`}>
                    {draft.gadgets.map((gadget, index) => {
                      const evaluated = resultByGadgetId.get(gadget.id);
                      return <div className="quality-gadget-shell" key={gadget.id}><div className="quality-gadget-actions"><button aria-label={`Move ${gadget.title} left`} disabled={index === 0} onClick={() => moveGadget(gadget.id, -1)} type="button">←</button><button aria-label={`Move ${gadget.title} right`} disabled={index === draft.gadgets.length - 1} onClick={() => moveGadget(gadget.id, 1)} type="button">→</button><button onClick={() => { setEditingGadgetId(gadget.id); setGadgetDraft(gadget); setIsGadgetJqlDirty(true); }} type="button">Edit</button><button disabled={draft.gadgets.length >= 12} onClick={() => duplicateGadget(gadget)} type="button">Copy</button><button aria-label={`Remove ${gadget.title}`} className="danger" onClick={() => setDraft((current) => ({ ...current, gadgets: current.gadgets.filter((item) => item.id !== gadget.id) }))} type="button">×</button></div>{dashboardResults.isLoading ? <LoadingState label={`Loading ${gadget.title}`} /> : null}{evaluated?.result ? <QualityGadget isRefreshing={isGadgetRefreshPending(gadget.id)} onDrilldown={(groupLabel) => handleGadgetDrilldown(evaluated.result!, groupLabel)} onRefresh={() => void refreshGadget(gadget)} result={evaluated.result} /> : null}{evaluated?.error ? <div className="dashboard-gadget-error" role="alert"><strong>{evaluated.error.code}</strong><span>{evaluated.error.message}</span><button className="ghost-button compact" disabled={isGadgetRefreshPending(gadget.id)} onClick={() => void refreshGadget(gadget)} type="button">{isGadgetRefreshPending(gadget.id) ? "Refreshing…" : "Retry widget"}</button></div> : null}</div>;
                    })}
                    {!draft.gadgets.length ? <div className="empty-state compact">Add a validated JQL gadget or generate an AI-assisted draft.</div> : null}
                  </div>
                </Panel>
              </div>
            </div>

            <div className="action-row custom-dashboard-modal-actions"><button className="ghost-button" disabled={isEditorBusy} onClick={closeEditor} type="button">Cancel</button><button className="primary-button" disabled={!canManage || !draft.name.trim() || !draft.gadgets.length || save.isPending} onClick={() => save.mutate()} type="button">{save.isPending ? "Saving…" : editorMode === "create" ? "Create dashboard" : "Save changes"}</button></div>
          </div>
        </div>
      ) : null}
      {selected && isReportEmailModalOpen ? (
        <div className="modal-backdrop" onClick={closeReportEmailModal} role="presentation">
          <form
            aria-labelledby="dashboard-report-email-title"
            aria-modal="true"
            className="modal-card report-email-modal"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => void handleShareReport(event)}
            ref={reportDialogRef}
            role="dialog"
            tabIndex={-1}
          >
            <div className="modal-card-head">
              <div>
                <h3 id="dashboard-report-email-title">Email dashboard report</h3>
                <p>Send {selected.name} through Jira notifications to visible Jira users.</p>
              </div>
              <DialogCloseButton disabled={shareReport.isPending} label="Close report email dialog" onClick={closeReportEmailModal} />
            </div>
            <FormField label="Recipients" hint="Use Jira account IDs or Jira-visible email addresses, separated by comma, semicolon, or new line.">
              <textarea data-autofocus="true" rows={4} value={reportEmailDraft} onChange={(event) => setReportEmailDraft(event.target.value)} />
            </FormField>
            <div className="action-row">
              <button className="ghost-button" disabled={shareReport.isPending} onClick={closeReportEmailModal} type="button">Cancel</button>
              <button className="primary-button" disabled={shareReport.isPending || !reportEmailDraft.trim()} type="submit">{shareReport.isPending ? "Sending…" : "Send report"}</button>
            </div>
          </form>
        </div>
      ) : null}
      {message ? <ToastMessage message={message} onDismiss={() => setMessage("")} tone={messageTone} /> : null}
      {confirmationDialog}
    </div>
  );
}

function QualityGadget({
  result,
  onDrilldown,
  onRefresh,
  isRefreshing = false
}: {
  result: QualityDashboardGadgetResult;
  onDrilldown?: (groupLabel?: string) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}) {
  const gadget = result.gadget && typeof result.gadget === "object" ? result.gadget : EMPTY_GADGET;
  const series = asArray(result.series);
  const rows = asArray(result.rows);
  const maximum = Math.max(...series.map((item) => Number(item.value) || 0), 1);
  const accent = gadget.accent || "blue";
  const palette = GADGET_ACCENT_PALETTES[accent] || GADGET_ACCENT_PALETTES.blue;
  const gadgetStyle = {
    "--qaira-gadget-accent": palette[0],
    "--qaira-gadget-accent-soft": `${palette[0]}18`
  } as CSSProperties;
  const seriesTotal = Math.max(series.reduce((sum, item) => sum + (Number(item.value) || 0), 0), 1);
  let cursor = 0;
  const donutStops = series.map((item, index) => {
    const start = cursor;
    cursor += (item.value / seriesTotal) * 100;
    return `${palette[index % palette.length]} ${start}% ${cursor}%`;
  }).join(", ");
  const linePoints = series.map((item, index) => {
    const x = series.length <= 1 ? 150 : (index / (series.length - 1)) * 280 + 10;
    const y = 108 - (item.value / maximum) * 92;
    return `${x},${y}`;
  }).join(" ");
  const isPercentageMetric = ["resolutionRate", "requirementCoverage", "automationCoverage"].includes(gadget.metric || "");
  return (
    <article className={`quality-gadget type-${gadget.type} tone-${resultTone(result)} accent-${accent}`} style={gadgetStyle}>
      <div className="quality-gadget-head">
        <strong>{gadget.title}</strong>
        <div className="quality-gadget-controls">
          <span>{Number(result.total) || 0}{result.truncated ? "+" : ""}</span>
          {onRefresh ? (
            <button aria-busy={isRefreshing} aria-label={isRefreshing ? `Refreshing ${gadget.title}` : `Refresh ${gadget.title}`} className={`quality-gadget-control${isRefreshing ? " is-loading" : ""}`} disabled={isRefreshing} onClick={onRefresh} title={`Refresh ${gadget.title}`} type="button">
              <RefreshIcon size={15} />
            </button>
          ) : null}
          {onDrilldown ? (
            <button aria-label={`Open ${gadget.title} drill-down in a new tab`} className="quality-gadget-control quality-gadget-open" onClick={() => onDrilldown()} title="Open drill-down in a new tab" type="button">
              <OpenIcon size={14} />
              <span>Open</span>
            </button>
          ) : null}
        </div>
      </div>
      {gadget.type === "metric" ? <div className="quality-metric-value"><strong>{isPercentageMetric ? `${Number(result.value) || 0}%` : Number(result.value) || 0}</strong><span>{result.value_label || "Result"}</span></div> : null}
      {gadget.type === "bar" ? (
        <div className="quality-series-list">{series.map((item) => <button disabled={!onDrilldown} key={item.label} onClick={() => onDrilldown?.(item.label)} title={`Open ${item.label} in a new tab`} type="button"><span>{item.label}</span><i><em style={{ width: `${Math.round(((Number(item.value) || 0) / maximum) * 100)}%` }} /></i><strong>{item.value}</strong></button>)}</div>
      ) : null}
      {gadget.type === "donut" ? (
        <div className="quality-donut-layout">
          <div className="quality-donut" style={{ background: series.length ? `conic-gradient(${donutStops})` : "var(--ds-background-neutral, #dfe1e6)" }}><span><strong>{Number(result.total) || 0}</strong><small>Total</small></span></div>
          <div className="quality-chart-legend">{series.slice(0, 8).map((item, index) => <button disabled={!onDrilldown} key={item.label} onClick={() => onDrilldown?.(item.label)} title={`Open ${item.label} in a new tab`} type="button"><i style={{ background: palette[index % palette.length] }} /><small>{item.label}</small><strong>{item.value}</strong></button>)}</div>
        </div>
      ) : null}
      {gadget.type === "stacked-bar" ? (
        <div className="quality-stacked-chart">
          <div>{series.slice(0, 8).map((item, index) => <span key={item.label} style={{ background: palette[index % palette.length], width: `${((Number(item.value) || 0) / seriesTotal) * 100}%` }} title={`${item.label}: ${item.value}`} />)}</div>
          <div className="quality-chart-legend">{series.slice(0, 8).map((item, index) => <button disabled={!onDrilldown} key={item.label} onClick={() => onDrilldown?.(item.label)} title={`Open ${item.label} in a new tab`} type="button"><i style={{ background: palette[index % palette.length] }} /><small>{item.label}</small><strong>{item.value}</strong></button>)}</div>
        </div>
      ) : null}
      {gadget.type === "line" ? (
        <button className="quality-line-chart quality-chart-drilldown" disabled={!onDrilldown} onClick={() => onDrilldown?.()} title="Open trend drill-down in a new tab" type="button">
          <svg aria-label={`${gadget.title} trend`} role="img" viewBox="0 0 300 120"><path d="M10 108 H290" /><polyline points={linePoints} /></svg>
          <div><span>{series[0]?.label || "—"}</span><strong>{series.map((item) => item.value).join(" · ") || "No data"}</strong><span>{series[series.length - 1]?.label || "—"}</span></div>
        </button>
      ) : null}
      {gadget.type === "table" ? (
        <div className="quality-table-wrap"><table><thead><tr><th>Key</th><th>Title</th><th>Type</th><th>Priority</th><th>Status</th><th>Owner</th></tr></thead><tbody>{rows.map((row) => { const issueUrl = gadget.data_source !== "qaira" ? getJiraBrowseUrl(row.key) : null; return <tr key={row.id}><td>{issueUrl ? <a href={issueUrl} rel="noreferrer" target="_blank">{row.key}</a> : row.key}</td><td>{issueUrl ? <a href={issueUrl} rel="noreferrer" target="_blank">{row.title}</a> : <button className="quality-table-drilldown" onClick={() => onDrilldown?.()} type="button">{row.title}</button>}</td><td>{row.type || "—"}</td><td>{row.priority || "—"}</td><td>{row.status || "—"}</td><td>{row.assignee || "Unassigned"}</td></tr>; })}</tbody></table></div>
      ) : null}
      <small className="quality-gadget-foot">{gadget.data_source === "qaira" ? "QAira derived · bounded project portfolio" : "Jira JQL · project scoped"} · {Number(result.returned) || 0} inspected</small>
    </article>
  );
}
