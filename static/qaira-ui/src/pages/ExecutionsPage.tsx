import { FormEvent, Fragment, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ActivityIcon, AddIcon, ArchiveIcon, BugIcon, CalendarIcon, ClearSelectionIcon, EyeIcon, ExportIcon, GithubIcon, GoogleDriveIcon, ImportIcon, MailIcon, OpenIcon, PlayIcon, SearchIcon, SelectAllIcon, SparkIcon, TrashIcon, UsersIcon } from "../components/AppIcons";
import { AppTypeDropdown } from "../components/AppTypeDropdown";
import { AiAssurancePanel } from "../components/AiAssurancePanel";
import { AiInsightPreviewDialog, type AiPreviewFinding } from "../components/AiInsightPreviewDialog";
import { CatalogActionMenu } from "../components/CatalogActionMenu";
import { CatalogViewToggle } from "../components/CatalogViewToggle";
import { CatalogSearchFilter } from "../components/CatalogSearchFilter";
import { CreateRunActionButton } from "../components/CreateRunActionButton";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { DisplayIdBadge } from "../components/DisplayIdBadge";
import { FormField } from "../components/FormField";
import { ExecutionContextSelector } from "../components/ExecutionContextSelector";
import { InfoTooltip } from "../components/InfoTooltip";
import { JiraAttachmentPanel } from "../components/JiraAttachmentPanel";
import { LoadingState } from "../components/LoadingState";
import { MultiAssigneePicker } from "../components/MultiAssigneePicker";
import { PageHeader } from "../components/PageHeader";
import { Panel } from "../components/Panel";
import {
  ApiRequestInfoDetails,
  AutomationCodeIcon,
  CodePreviewDialog,
  JsonResponseTreeNode,
  SharedGroupLevelIcon,
  StandardStepIcon,
  StepIconButton as InlineStepToolButton,
  StepTypeIcon
} from "../components/StepAutomationEditor";
import { ProjectDropdown } from "../components/ProjectDropdown";
import { ProgressMeter } from "../components/ProgressMeter";
import { richTextToPlainText } from "../components/RichTextEditor";
import { RunHooksBuilder, type RunHookSelection, type RunHookType } from "../components/RunHooksBuilder";
import { RunTypeSelector } from "../components/RunTypeSelector";
import { StatusBadge } from "../components/StatusBadge";
import { SubnavTabs } from "../components/SubnavTabs";
import { SuiteScopePicker } from "../components/SuiteCasePicker";
import { TileCardSkeletonGrid } from "../components/TileCardSkeletonGrid";
import { ToastMessage } from "../components/ToastMessage";
import { VirtualList } from "../components/VirtualList";
import { WorkspaceBackButton, WorkspaceMasterDetail } from "../components/WorkspaceMasterDetail";
import { useDeleteConfirmation } from "../components/DeleteConfirmationDialog";
import { useAiPromptRegistry } from "../hooks/useAiPromptRegistry";
import { useCurrentAppType, useCurrentProject } from "../hooks/useCurrentProject";
import { useFeatureFlags } from "../hooks/useFeatureFlags";
import { api } from "../lib/api";
import { assessRunEvidenceReadiness } from "../lib/aiAssurance";
import { formatReferenceList, parseReferenceList } from "../lib/externalReferences";
import { areFeatureFlagsEnabled } from "../lib/featureFlags";
import { summarizeExecutionStart } from "../lib/executionStartSummary";
import { buildBrowserUrl } from "../lib/integrationUrls";
import { hasPermission } from "../lib/permissions";
import { readDefaultCatalogViewMode } from "../lib/viewPreferences";
import { buildGroupAutomationCode, resolveStepAutomationCode } from "../lib/stepAutomation";
import {
  deriveCaseStatusFromSteps,
  parseExecutionLogs,
  stringifyExecutionLogs,
  type ExecutionStepApiDetail,
  type ExecutionAiAnalysis,
  type ExecutionStepCaptureMap,
  type ExecutionStepEvidence,
  type ExecutionStepStatus,
  type ExecutionStepAutomationDetail,
  type ExecutionStepWebDetail
} from "../lib/executionLogs";
import { buildDataSetParameterValues, combineStepParameterValues, normalizeStepParameterValues, parseStepParameterName, resolveStepParameterText } from "../lib/stepParameters";
import { type AssigneeOption, buildAssigneeOptions, resolveUserInitials, resolveUserPrimaryLabel, resolveUserSecondaryLabel } from "../lib/userDisplay";
import type {
  AppType,
  Execution,
  ExecutionCaseSnapshot,
  ExecutionDataSetSnapshot,
  ExecutionResult,
  ExecutionSchedule,
  ExecutionStatus,
  ExecutionStepSnapshot,
  Integration,
  Issue,
  KeyValueEntry,
  Project,
  SmartExecutionImpactCase,
  SmartExecutionPreviewResponse,
  TestCase,
  TestStep,
  TestSuite,
  WorkspaceTransaction
} from "../types";

type ExecutionTab = "overview" | "logs" | "failures" | "history" | "evidence";

type ExecutionSuiteNode = {
  id: string;
  name: string;
  isHistorical?: boolean;
};

type ExecutionCaseView = {
  id: string;
  title: string;
  description: string | null;
  external_references: string[];
  priority: number | null;
  status: string | null;
  parameter_values: Record<string, string>;
  suite_id: string | null;
  suite_name: string | null;
  suite_ids: string[];
  sort_order: number;
  assigned_to: string | null;
  assigned_user: Execution["assigned_user"];
};

type ExecutionRunSummary = {
  passed: number;
  failed: number;
  blocked: number;
  total: number;
  passRate: number;
  avgDurationMs: number | null;
  timedCount: number;
  latestActivityAt: string | null;
  totalDurationMs: number;
};

type ExecutionRunImpactSummary = {
  failedCases: Array<{
    id: string;
    title: string;
    status: string;
    priority: number | null;
    suiteId: string | null;
    suiteName: string | null;
    requirementIds: string[];
    requirementTitles: string[];
    error: string | null;
  }>;
  impactedRequirements: Array<{
    id: string;
    title: string;
    priority: number | null;
    totalCases: number;
    failedCases: number;
    failureRate: number;
  }>;
  totalRequirements: number;
  failedRequirementCount: number;
  failureRate: number;
};

type ExecutionStepBlock = {
  key: string;
  groupId: string | null;
  groupName: string | null;
  groupKind: TestStep["group_kind"];
  steps: TestStep[];
};

type ExecutionIssueFilter = "all" | "with-issues" | "clean";
type ExecutionEvidenceFilter = "all" | "with-evidence" | "no-evidence";
type ExecutionCreateMode = "manual" | "smart";
type ExecutionStartMode = "manual" | "remote" | "local";
type ExecutionHookDraft = RunHookSelection[];

const emptyExecutionHookDraft = (): ExecutionHookDraft => [];

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
type TestRunsView = "test-case-runs" | "suite-runs" | "local-runs" | "scheduled-runs" | "batch-process";
type CatalogViewMode = "tile" | "list";

type ExecutionAssigneeOption = AssigneeOption;

type ExecutionEvidencePreviewState = {
  attachmentId?: string;
  stepLabel: string;
  fileName: string | null;
  mimeType: string;
  sourceUrl: string;
};

type PreparedExecutionEvidence = {
  blob: Blob;
  checksum?: string;
  fileName: string;
  mimeType: string;
  size: number;
};

type ExecutionApiDetailState = {
  step: TestStep;
  detail: ExecutionStepApiDetail | null;
  captures: Record<string, string>;
  note: string;
  status: ExecutionResult["status"] | "queued";
};

type ExecutionApiStepDialogProps = {
  step: TestStep;
  detail: ExecutionStepApiDetail | null;
  captures: Record<string, string>;
  note: string;
  status: ExecutionResult["status"] | "queued";
  canRun: boolean;
  isRunning: boolean;
  onClose: () => void;
  onRun: () => void;
};

type SmartExecutionRequirementOption = {
  id: string;
  title: string;
  description: string | null;
  linkedCaseCount: number;
};

type ExecutionScheduleCadence = "once" | "daily" | "weekly" | "monthly" | "interval_minutes";

type ExecutionParameterDisplayEntry = {
  key: string;
  token: string;
  value: string;
  flowLabel: string;
  sourceLabel?: string;
};

const BATCH_PROCESS_CATEGORIES = new Set([
  "bulk_import",
  "ai_generation",
  "backup",
  "automation_build",
  "smart_execution",
  "reporting"
]);

const EMPTY_EXECUTION_RUN_SUMMARY: ExecutionRunSummary = {
  passed: 0,
  failed: 0,
  blocked: 0,
  total: 0,
  passRate: 0,
  avgDurationMs: null,
  timedCount: 0,
  latestActivityAt: null,
  totalDurationMs: 0
};

const EMPTY_EXECUTION_RUN_IMPACT_SUMMARY: ExecutionRunImpactSummary = {
  failedCases: [],
  impactedRequirements: [],
  totalRequirements: 0,
  failedRequirementCount: 0,
  failureRate: 0
};

function getExecutionRiskTone(summary: ExecutionRunSummary, impactSummary: ExecutionRunImpactSummary): "success" | "info" | "warning" | "danger" {
  if (summary.failed > 0 || impactSummary.failureRate >= 30 || impactSummary.failedRequirementCount >= 3) {
    return "danger";
  }

  if (summary.blocked > 0 || impactSummary.failedRequirementCount > 0 || impactSummary.failureRate >= 12) {
    return "warning";
  }

  if (summary.total > 0 && summary.passRate >= 90) {
    return "success";
  }

  return "info";
}

function getExecutionRiskLabel(summary: ExecutionRunSummary, impactSummary: ExecutionRunImpactSummary) {
  const tone = getExecutionRiskTone(summary, impactSummary);
  if (tone === "danger") return "High risk";
  if (tone === "warning") return "Watch";
  if (tone === "success") return "Healthy";
  return "Learning";
}

function getExecutionRiskInsight(summary: ExecutionRunSummary, impactSummary: ExecutionRunImpactSummary, scopedCaseCount: number) {
  const affectedRequirements = impactSummary.failedRequirementCount;
  const topRequirement = impactSummary.impactedRequirements.find((requirement) => requirement.failedCases > 0) || impactSummary.impactedRequirements[0] || null;

  if (summary.failed > 0 && topRequirement) {
    return `Evidence-based risk signal: ${summary.failed} failed case${summary.failed === 1 ? "" : "s"} are touching ${affectedRequirements || 1} requirement${(affectedRequirements || 1) === 1 ? "" : "s"}; start with ${topRequirement.title}.`;
  }

  if (summary.blocked > 0) {
    return `Evidence-based risk signal: ${summary.blocked} blocked case${summary.blocked === 1 ? "" : "s"} can hide release confidence until the affected requirement coverage is cleared.`;
  }

  if (!summary.total && scopedCaseCount) {
    return `Evidence-based risk signal: ${scopedCaseCount} scoped case${scopedCaseCount === 1 ? "" : "s"} are queued; requirement impact will sharpen as evidence arrives.`;
  }

  if (summary.passRate >= 90 && summary.total) {
    return `Evidence-based risk signal: pass confidence is strong across touched coverage; keep an eye on high-priority linked requirements.`;
  }

  return `Evidence-based risk signal: run evidence is still forming; linked requirements and references are ready for trace review.`;
}

const DEFAULT_CATALOG_VIEW_MODE_BY_RUN_VIEW: Record<TestRunsView, CatalogViewMode> = {
  "test-case-runs": "tile",
  "suite-runs": "tile",
  "local-runs": "tile",
  "scheduled-runs": "tile",
  "batch-process": "tile"
};

const DEFAULT_RUN_LIBRARY_SEARCH_BY_VIEW: Record<TestRunsView, string> = {
  "test-case-runs": "",
  "suite-runs": "",
  "local-runs": "",
  "scheduled-runs": "",
  "batch-process": ""
};

const buildIntervalCadence = (minutes: number) => `every:${Math.max(1, Math.floor(minutes || 5))}:minutes`;

const parseIntervalCadenceMinutes = (cadence?: string | null) => {
  const match = String(cadence || "").match(/^every:(\d+):minutes$/);
  return match ? Math.max(1, Number(match[1]) || 5) : 5;
};

const isIntervalCadence = (cadence?: string | null) => /^every:\d+:minutes$/.test(String(cadence || ""));

const formatScheduleCadence = (cadence?: string | null) =>
  isIntervalCadence(cadence)
    ? `Every ${parseIntervalCadenceMinutes(cadence)} mins`
    : String(cadence || "once").replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

const EXECUTION_POLL_INTERVAL_MS = 20_000;

const WORKSPACE_TRANSACTION_METADATA_LABELS: Record<string, string> = {
  current_phase: "Current phase",
  queue_lane: "Queue lane",
  provider: "Provider",
  repository: "Repository",
  branch: "Branch",
  file_name: "File name",
  import_source: "Import source",
  exported: "Reports exported",
  imported: "Imported",
  failed: "Failed",
  total_rows: "Total rows",
  processed_items: "Processed items",
  total_items: "Total items",
  built_cases: "Scripts built",
  reused_scripts: "Scripts reused",
  healed_cases: "Cases healed",
  generated_cases_count: "Cases generated",
  requirement_count: "Requirements",
  selected_case_count: "Selected cases",
  matched_case_count: "Matched cases",
  worker_count: "Workers"
};

const DEFAULT_DURATION_LABEL = "0s";
const MAX_EXECUTION_EVIDENCE_SOURCE_BYTES = 25 * 1024 * 1024;
const MAX_EXECUTION_EVIDENCE_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_EXECUTION_EVIDENCE_IMAGE_DIMENSION = 1400;
const EXECUTION_EVIDENCE_JPEG_QUALITY = 0.68;

type BoardStatusTone = ExecutionStatus | ExecutionResult["status"];

const BOARD_STATUS_META: Record<BoardStatusTone, { label: string; description: string }> = {
  queued: {
    label: "Queued",
    description: "Run is ready to start."
  },
  running: {
    label: "Running",
    description: "Run is actively capturing evidence."
  },
  completed: {
    label: "Completed",
    description: "Run finished successfully."
  },
  failed: {
    label: "Failed",
    description: "Run finished with one or more failures."
  },
  aborted: {
    label: "Aborted",
    description: "Run stopped before normal completion."
  },
  passed: {
    label: "Passed",
    description: "Case finished successfully."
  },
  blocked: {
    label: "Blocked",
    description: "Case is blocked and needs attention."
  }
};

function normalizeExecutionStatus(status: Execution["status"] | null | undefined): ExecutionStatus {
  if (status === "running" || status === "completed" || status === "failed" || status === "aborted") {
    return status;
  }

  return "queued";
}

function executionStatusLabel(status: Execution["status"] | null | undefined) {
  return BOARD_STATUS_META[normalizeExecutionStatus(status)].label;
}

function executionStatusTooltip(status: Execution["status"] | null | undefined) {
  const { label, description } = BOARD_STATUS_META[normalizeExecutionStatus(status)];
  return `${label}: ${description}`;
}

function boardStatusTooltip(status: BoardStatusTone) {
  const { label, description } = BOARD_STATUS_META[status];
  return `${label}: ${description}`;
}

function suiteBoardStatus(metric: {
  count: number;
  passedCount: number;
  failedCount: number;
  blockedCount: number;
}): BoardStatusTone {
  if (metric.failedCount) {
    return "failed";
  }

  if (metric.blockedCount) {
    return "blocked";
  }

  if (!metric.count) {
    return "queued";
  }

  if (metric.passedCount >= metric.count) {
    return "completed";
  }

  if (metric.passedCount > 0) {
    return "running";
  }

  return "queued";
}

function toCaseView(snapshot: ExecutionCaseSnapshot): ExecutionCaseView {
  return {
    id: snapshot.test_case_id,
    title: snapshot.test_case_title,
    description: snapshot.test_case_description,
    external_references: snapshot.external_references || [],
    priority: snapshot.priority,
    status: snapshot.status,
    parameter_values: snapshot.parameter_values || {},
    suite_id: snapshot.suite_id,
    suite_name: snapshot.suite_name,
    suite_ids: snapshot.suite_id ? [snapshot.suite_id] : [],
    sort_order: snapshot.sort_order,
    assigned_to: snapshot.assigned_to || null,
    assigned_user: snapshot.assigned_user || null
  };
}

function toStepView(snapshot: ExecutionStepSnapshot): TestStep {
  return {
    id: snapshot.snapshot_step_id,
    test_case_id: snapshot.test_case_id,
    step_order: snapshot.step_order,
    action: snapshot.action,
    expected_result: snapshot.expected_result,
    step_type: snapshot.step_type,
    automation_code: snapshot.automation_code,
    api_request: snapshot.api_request,
    group_id: snapshot.group_id,
    group_name: snapshot.group_name,
    group_kind: snapshot.group_kind,
    reusable_group_id: snapshot.reusable_group_id
  };
}

function isStepGroupStart(steps: TestStep[], index: number) {
  const currentStep = steps[index];
  const previousStep = steps[index - 1];

  return Boolean(currentStep?.group_id) && currentStep.group_id !== previousStep?.group_id;
}

function getExecutionStepKindMeta(kind?: TestStep["group_kind"] | null) {
  if (kind === "reusable") {
    return { label: "Shared Steps", detail: "Shared group snapshot", tone: "shared" as const };
  }

  if (kind === "local") {
    return { label: "Local group", detail: "Local group snapshot", tone: "local" as const };
  }

  return { label: "Standard step", detail: "Standard step", tone: "default" as const };
}

const mergeExecutionEvidencePatch = (
  current: Record<string, ExecutionStepEvidence>,
  patch?: Record<string, ExecutionStepEvidence | null>
) => {
  if (!patch) {
    return current;
  }

  const next = { ...current };

  Object.entries(patch).forEach(([stepId, evidence]) => {
    if (!evidence?.attachmentId && !evidence?.dataUrl) {
      delete next[stepId];
      return;
    }

    next[stepId] = evidence;
  });

  return next;
};

const hasExecutionEvidence = (evidence?: ExecutionStepEvidence | null) =>
  Boolean(evidence?.attachmentId || evidence?.dataUrl);

const evidenceMimeType = (evidence?: ExecutionStepEvidence | null) => {
  if (evidence?.mimeType) {
    return evidence.mimeType;
  }
  return evidence?.dataUrl?.match(/^data:([^;,]+)/i)?.[1] || "application/octet-stream";
};

const digestExecutionEvidence = async (blob: Blob) => {
  if (!window.crypto?.subtle) {
    return undefined;
  }

  const digest = await window.crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
};

const readExecutionEvidenceFile = (file: File) =>
  new Promise<PreparedExecutionEvidence>((resolve, reject) => {
    const allowedMimeType = file.type.startsWith("image/")
      || file.type.startsWith("video/")
      || ["application/pdf", "application/json", "application/xml", "text/plain", "text/csv", "text/xml", "application/zip"].includes(file.type);
    if (!allowedMimeType) {
      reject(new Error("Use an image, video, PDF, text, JSON, XML, CSV, or ZIP evidence file."));
      return;
    }

    if (file.size > MAX_EXECUTION_EVIDENCE_SOURCE_BYTES) {
      reject(new Error("Evidence files must be 25 MB or smaller and within the Jira attachment limit."));
      return;
    }

    if (!file.type.startsWith("image/")) {
      void digestExecutionEvidence(file).then((checksum) => resolve({
        blob: file,
        checksum,
        fileName: file.name || "run-evidence",
        mimeType: file.type || "application/octet-stream",
        size: file.size
      })).catch(reject);
      return;
    }

    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      try {
        const scale = Math.min(
          1,
          MAX_EXECUTION_EVIDENCE_IMAGE_DIMENSION / Math.max(image.naturalWidth || 1, image.naturalHeight || 1)
        );
        const width = Math.max(1, Math.round((image.naturalWidth || 1) * scale));
        const height = Math.max(1, Math.round((image.naturalHeight || 1) * scale));
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");

        if (!context) {
          reject(new Error("Unable to compress the selected image in this browser."));
          return;
        }

        canvas.width = width;
        canvas.height = height;
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);

        canvas.toBlob(async (blob) => {
          if (!blob) {
            reject(new Error("Unable to compress the selected image in this browser."));
            return;
          }

          if (blob.size > MAX_EXECUTION_EVIDENCE_IMAGE_BYTES) {
            reject(new Error("Evidence images must compress to 3 MB or smaller before Jira upload."));
            return;
          }

          try {
            resolve({
              blob,
              checksum: await digestExecutionEvidence(blob),
              fileName: file.name ? file.name.replace(/\.[^.]+$/, ".jpg") : "evidence.jpg",
              mimeType: "image/jpeg",
              size: blob.size
            });
          } catch (error) {
            reject(error);
          }
        }, "image/jpeg", EXECUTION_EVIDENCE_JPEG_QUALITY);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Unable to read ${file.name}`));
    };
    image.src = objectUrl;
  });

function buildProgressSegments(
  passedCount: number,
  failedCount: number,
  blockedCount: number,
  totalCount: number
) {
  if (!totalCount) {
    return [{ value: 100, tone: "neutral" as const }];
  }

  const pendingCount = Math.max(totalCount - passedCount - failedCount - blockedCount, 0);
  const segments = [
    { value: (passedCount / totalCount) * 100, tone: "success" as const },
    { value: (failedCount / totalCount) * 100, tone: "danger" as const },
    { value: (blockedCount / totalCount) * 100, tone: "info" as const },
    { value: (pendingCount / totalCount) * 100, tone: "neutral" as const }
  ];

  return segments.filter((segment) => segment.value > 0);
}

const executionDateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit"
});

function toTimestamp(value?: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function formatExecutionTimestamp(value?: string | null, fallback = "Not recorded") {
  const timestamp = toTimestamp(value);
  return timestamp ? executionDateTimeFormatter.format(timestamp) : fallback;
}

function toDateTimeLocalValue(value?: string | null) {
  const timestamp = toTimestamp(value);

  if (!timestamp) {
    return "";
  }

  const date = new Date(timestamp);
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function computeExecutionDurationMs(
  startedAt?: string | null,
  endedAt?: string | null,
  now = Date.now()
) {
  const start = toTimestamp(startedAt);

  if (!start) {
    return null;
  }

  const end = toTimestamp(endedAt) || now;
  return Math.max(end - start, 0);
}

function formatDuration(ms?: number | null, fallback = DEFAULT_DURATION_LABEL) {
  if (ms == null || Number.isNaN(ms)) {
    return fallback;
  }

  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

function readWorkspaceTransactionCount(transaction: WorkspaceTransaction, key: string) {
  const value = transaction.metadata?.[key];
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCountLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function describeWorkspaceTransaction(
  transaction: WorkspaceTransaction,
  {
    appTypeNameById,
    projectNameById
  }: {
    appTypeNameById: Record<string, string>;
    projectNameById: Record<string, string>;
  }
) {
  const importSource = String(transaction.metadata?.import_source || "").toLowerCase();
  const requirementCount = readWorkspaceTransactionCount(transaction, "requirement_count");
  const generatedCaseCount = readWorkspaceTransactionCount(transaction, "generated_cases_count");
  const importedCount = readWorkspaceTransactionCount(transaction, "imported");
  const failedCount = readWorkspaceTransactionCount(transaction, "failed");
  const totalRows = readWorkspaceTransactionCount(transaction, "total_rows");
  const processedItems = readWorkspaceTransactionCount(transaction, "processed_items");
  const totalItems = readWorkspaceTransactionCount(transaction, "total_items");
  const builtCaseCount = readWorkspaceTransactionCount(transaction, "built_cases");
  const reusedScriptCount = readWorkspaceTransactionCount(transaction, "reused_scripts");
  const healedCaseCount = readWorkspaceTransactionCount(transaction, "healed_cases");
  const selectedCaseCount = readWorkspaceTransactionCount(transaction, "selected_case_count");
  const matchedCaseCount = readWorkspaceTransactionCount(transaction, "matched_case_count");
  const exportedCount = readWorkspaceTransactionCount(transaction, "exported");
  const workerCount = readWorkspaceTransactionCount(transaction, "worker_count");
  const queueLane = String(transaction.metadata?.queue_lane || "").trim();
  const currentPhase = String(transaction.metadata?.current_phase || "").trim();
  const scopeLabel = transaction.app_type_id
    ? appTypeNameById[transaction.app_type_id] || "App type scope"
    : transaction.project_id
      ? projectNameById[transaction.project_id] || "Project scope"
      : "Workspace scope";

  if (transaction.action === "scheduled_test_case_generation" || transaction.category === "ai_generation") {
    const readyForReviewDetail = generatedCaseCount
      ? `${formatCountLabel(generatedCaseCount, "scheduler-generated test case")} ready for review.`
      : "No scheduler-generated test cases are ready for review yet.";

    return {
      icon: <SparkIcon />,
      eyebrow:
        transaction.status === "completed"
          ? "Latest AI generation job completed"
          : transaction.status === "failed"
            ? "AI generation finished with issues"
            : "Scheduled AI generation",
      detail:
        transaction.status === "completed"
          ? readyForReviewDetail
          : generatedCaseCount || requirementCount
            ? `${formatCountLabel(requirementCount, "requirement")} queued or processed · ${formatCountLabel(generatedCaseCount, "case")} generated`
            : "AI-assisted test case generation workflow"
    };
  }

  if (transaction.action === "smart_execution_creation" || transaction.action === "smart_execution_plan" || transaction.category === "smart_execution") {
    const planningDetail =
      matchedCaseCount || selectedCaseCount
        ? `${formatCountLabel(matchedCaseCount || selectedCaseCount, "case")} matched · ${formatCountLabel(workerCount, "worker")}`
        : currentPhase
          ? `Phase: ${currentPhase}`
          : "Smart run planning and materialization";

    return {
      icon: <SparkIcon />,
      eyebrow:
        transaction.status === "completed"
          ? "Smart execution ready"
          : transaction.status === "failed"
            ? "Smart execution finished with issues"
            : "Smart execution planning",
      detail: planningDetail
    };
  }

  if (
    transaction.action === "automation_build"
    || transaction.action === "test_case_automation_build"
    || transaction.action === "suite_automation_build"
    || transaction.category === "automation_build"
  ) {
    const automationDetail =
      builtCaseCount || reusedScriptCount || healedCaseCount
        ? `${formatCountLabel(builtCaseCount, "script")} built · ${formatCountLabel(reusedScriptCount, "script")} reused · ${formatCountLabel(healedCaseCount, "case")} healed`
        : processedItems || totalItems
          ? `${formatCountLabel(processedItems, "item")} processed of ${formatCountLabel(totalItems, "item")}`
          : currentPhase
            ? `Phase: ${currentPhase}`
            : "AI automation build process";

    return {
      icon: <AutomationCodeIcon />,
      eyebrow:
        transaction.status === "completed"
          ? "Automation build completed"
          : transaction.status === "failed"
            ? "Automation build finished with issues"
            : "Automation build running",
      detail: automationDetail
    };
  }

  if (transaction.action === "test_case_import") {
    return {
      icon: <ImportIcon />,
      eyebrow: importSource === "junit_xml" ? "JUnit XML import" : "Test case CSV import",
      detail:
        importedCount || failedCount || totalRows
          ? `${formatCountLabel(importedCount, "case")} imported · ${formatCountLabel(failedCount, "row")} failed`
          : "Bulk test case import"
    };
  }

  if (transaction.action === "requirement_import") {
    return {
      icon: <ImportIcon />,
      eyebrow: "Requirement import",
      detail:
        importedCount || failedCount || totalRows
          ? `${formatCountLabel(importedCount, "requirement")} imported · ${formatCountLabel(failedCount, "row")} failed`
          : "Bulk requirement import"
    };
  }

  if (transaction.action === "user_import") {
    return {
      icon: <UsersIcon />,
      eyebrow: "User import",
      detail:
        importedCount || failedCount || totalRows
          ? `${formatCountLabel(importedCount, "user")} imported · ${formatCountLabel(failedCount, "row")} failed`
          : "Bulk user import"
    };
  }

  if (transaction.category === "backup" || transaction.action === "project_artifact_backup" || transaction.action === "project_code_sync") {
    const provider = String(transaction.metadata?.provider || "").toLowerCase();
    const repository = String(transaction.metadata?.repository || "");
    const fileName = String(transaction.metadata?.file_name || "");

    if (provider === "google_drive" || transaction.action === "project_artifact_backup") {
      return {
        icon: <GoogleDriveIcon />,
        eyebrow: "Google Drive backup",
        detail: fileName ? `Uploaded ${fileName}` : "Compressed project artifact backup"
      };
    }

    if (provider === "github" || transaction.action === "project_code_sync") {
      return {
        icon: <GithubIcon />,
        eyebrow: "GitHub sync",
        detail: repository ? `Automation code synced to ${repository}` : "Project automation code sync"
      };
    }

    return {
      icon: <ArchiveIcon />,
      eyebrow: "Project backup",
      detail: transaction.description || "Project backup activity"
    };
  }

  if (transaction.action === "execution_report_export" || transaction.action === "run_report_export" || transaction.category === "reporting") {
    const reportDetail =
      exportedCount
        ? `${formatCountLabel(exportedCount, "report")} generated`
        : currentPhase
          ? `Phase: ${currentPhase}`
          : "Execution report export";

    return {
      icon: <ArchiveIcon />,
      eyebrow:
        transaction.status === "completed"
          ? "Run report ready"
          : transaction.status === "failed"
            ? "Run report failed"
            : "Generating run report",
      detail: reportDetail
    };
  }

  if (transaction.action === "testengine_run") {
    const engineDetail =
      healedCaseCount
        ? `${formatCountLabel(healedCaseCount, "healed case")} during engine execution`
        : queueLane
          ? `Lane: ${queueLane}`
          : currentPhase
            ? `Phase: ${currentPhase}`
            : "Test Engine dispatch and execution";

    return {
      icon: <PlayIcon />,
      eyebrow:
        transaction.status === "completed"
          ? "Engine execution completed"
          : transaction.status === "failed"
            ? "Engine execution failed"
            : "Engine execution running",
      detail: engineDetail
    };
  }

  return {
    icon: transaction.category === "bulk_import" ? <ImportIcon /> : <SparkIcon />,
    eyebrow: transaction.title,
    detail: transaction.description || scopeLabel
  };
}

function resolveWorkspaceTransactionSummary(
  transaction: WorkspaceTransaction,
  presentation: ReturnType<typeof describeWorkspaceTransaction>
) {
  if (transaction.action === "scheduled_test_case_generation" || transaction.category === "ai_generation") {
    return presentation.detail;
  }

  return transaction.description || presentation.detail;
}

function formatWorkspaceTransactionActionLabel(value: string | null | undefined) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    return "Not recorded";
  }

  return normalized.replace(/_/g, " ");
}

function truncateProcessName(value?: string | null, limit = 46) {
  const normalized = String(value || "Batch process").trim();

  if (normalized.length <= limit) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function formatWorkspaceTransactionMetadataLabel(key: string) {
  return WORKSPACE_TRANSACTION_METADATA_LABELS[key] || key.replace(/_/g, " ");
}

function formatWorkspaceTransactionMetadataValue(value: unknown): string {
  if (value === undefined || value === null || value === "") {
    return "Not recorded";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (Array.isArray(value)) {
    const normalized = value
      .map((entry) => formatWorkspaceTransactionMetadataValue(entry))
      .filter((entry) => entry && entry !== "Not recorded");

    return normalized.length ? normalized.join(", ") : "Not recorded";
  }

  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "[Object]";
    }
  }

  return String(value);
}

function resolveWorkspaceTransactionMetadataEntries(transaction: WorkspaceTransaction) {
  return Object.entries(transaction.metadata || {})
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => ({
      key,
      label: formatWorkspaceTransactionMetadataLabel(key),
      value
    }));
}

function resolveWorkspaceTransactionReadableMetadata(transaction: WorkspaceTransaction) {
  return resolveWorkspaceTransactionMetadataEntries(transaction).filter(({ value }) => typeof value !== "object" || Array.isArray(value));
}

function resolveWorkspaceTransactionComplexMetadata(transaction: WorkspaceTransaction) {
  const entries = resolveWorkspaceTransactionMetadataEntries(transaction).filter(({ value }) => typeof value === "object" && value !== null && !Array.isArray(value));

  return entries.length
    ? entries.reduce<Record<string, unknown>>((accumulator, { key, value }) => {
        accumulator[key] = value;
        return accumulator;
      }, {})
    : null;
}

function executionImpactLevelLabel(level: SmartExecutionImpactCase["impact_level"]) {
  return level.charAt(0).toUpperCase() + level.slice(1);
}

function averageDuration(values: Array<number | null | undefined>) {
  const scoped = values.filter((value): value is number => typeof value === "number" && !Number.isNaN(value));

  if (!scoped.length) {
    return null;
  }

  return Math.round(scoped.reduce((sum, value) => sum + value, 0) / scoped.length);
}

function isExecutionRunsView(view: TestRunsView) {
  return view === "test-case-runs" || view === "suite-runs" || view === "local-runs";
}

function resolveExecutionRunBucket(execution: Execution): Extract<TestRunsView, "test-case-runs" | "suite-runs" | "local-runs"> {
  if (execution.trigger === "local") {
    return "local-runs";
  }

  return execution.suite_ids.length ? "suite-runs" : "test-case-runs";
}

function buildExecutionRunScopedValues(entries: KeyValueEntry[] = []) {
  return entries.reduce<Record<string, string>>((accumulator, entry) => {
    const key = String(entry?.key || "").trim();

    if (!key) {
      return accumulator;
    }

    const normalized = normalizeStepParameterValues(
      {
        [key]: entry?.value === undefined || entry?.value === null ? "" : String(entry.value)
      },
      "r"
    );

    return combineStepParameterValues(accumulator, normalized);
  }, {});
}

function buildExecutionInputParameterValues(
  execution: Execution | null,
  caseSnapshot: ExecutionCaseSnapshot | null
) {
  return combineStepParameterValues(
    normalizeStepParameterValues(caseSnapshot?.parameter_values || {}, "t"),
    normalizeStepParameterValues(caseSnapshot?.suite_parameter_values || {}, "s"),
    buildExecutionRunScopedValues(execution?.test_environment?.snapshot?.variables || []),
    buildExecutionRunScopedValues(execution?.test_configuration?.snapshot?.variables || []),
    execution?.test_data_set ? buildDataSetParameterValues(execution.test_data_set.snapshot || null) : {}
  );
}

function formatExecutionParameterToken(key: string, fallbackScope: "t" | "s" | "r" = "t") {
  return parseStepParameterName(key, fallbackScope)?.token || `@${String(key || "").trim()}`;
}

function buildExecutionParameterDisplayEntries(
  values: Record<string, string>,
  flow: "input" | "output"
): ExecutionParameterDisplayEntry[] {
  return Object.entries(values)
    .map(([key, value]) => {
      const parsed = parseStepParameterName(key, "t");
      const scopeLabel = parsed?.scopeLabel || "Test case";

      return {
        key,
        token: parsed?.token || formatExecutionParameterToken(key),
        value,
        flowLabel: `${scopeLabel} ${flow}`
      };
    })
    .sort((left, right) => left.token.localeCompare(right.token));
}

function collectExecutionOutputParameterValues(
  stepCaptures: Record<string, ExecutionStepCaptureMap>,
  steps: TestStep[]
) {
  return steps
    .slice()
    .sort((left, right) => left.step_order - right.step_order)
    .reduce<Record<string, string>>((accumulator, step) => {
      Object.assign(accumulator, stepCaptures[step.id] || {});
      return accumulator;
    }, {});
}

function collectSuiteScopedExecutionOutputParameterValues(
  resultByCaseId: Record<string, ExecutionResult>,
  caseSnapshots: ExecutionCaseSnapshot[],
  selectedTestCaseId: string
) {
  const selectedSnapshot = caseSnapshots.find((snapshot) => snapshot.test_case_id === selectedTestCaseId);

  if (!selectedSnapshot?.suite_id) {
    return {};
  }

  return caseSnapshots
    .filter((snapshot) =>
      snapshot.suite_id === selectedSnapshot.suite_id
      && snapshot.sort_order <= selectedSnapshot.sort_order
    )
    .sort((left, right) => left.sort_order - right.sort_order)
    .reduce<Record<string, string>>((accumulator, snapshot) => {
      const result = resultByCaseId[snapshot.test_case_id];

      if (!result?.logs) {
        return accumulator;
      }

      const parsed = parseExecutionLogs(result.logs);
      const captures = mergeExecutionStepCaptures(parsed.stepCaptures || {}, parsed.stepApiDetails || {});

      Object.values(captures).forEach((captureMap) => {
        Object.entries(captureMap || {}).forEach(([key, value]) => {
          const parsedName = parseStepParameterName(key, "t");

          if (parsedName?.scope === "s") {
            accumulator[parsedName.name] = value;
          }
        });
      });

      return accumulator;
    }, {});
}

function buildExecutionOutputParameterEntries(
  stepCaptures: Record<string, ExecutionStepCaptureMap>,
  steps: TestStep[]
): ExecutionParameterDisplayEntry[] {
  const latestByKey = new Map<string, ExecutionParameterDisplayEntry>();

  steps
    .slice()
    .sort((left, right) => left.step_order - right.step_order)
    .forEach((step) => {
      Object.entries(stepCaptures[step.id] || {}).forEach(([key, value]) => {
        const parsed = parseStepParameterName(key, "t");
        const stepTypeLabel = String(step.step_type || "web").toUpperCase();

        latestByKey.set(key, {
          key,
          token: parsed?.token || formatExecutionParameterToken(key),
          value,
          flowLabel: `${parsed?.scopeLabel || "Test case"} output`,
          sourceLabel: `Step ${step.step_order} · ${stepTypeLabel}`
        });
      });
    });

  return [...latestByKey.values()].sort((left, right) => left.token.localeCompare(right.token));
}

function mergeExecutionStepCaptures(
  stepCaptures: Record<string, ExecutionStepCaptureMap>,
  stepApiDetails: Record<string, ExecutionStepApiDetail>
) {
  const merged: Record<string, ExecutionStepCaptureMap> = { ...stepCaptures };

  Object.entries(stepApiDetails || {}).forEach(([stepId, detail]) => {
    const apiCaptures = detail?.captures || {};

    if (!Object.keys(apiCaptures).length) {
      return;
    }

    merged[stepId] = {
      ...(merged[stepId] || {}),
      ...apiCaptures
    };
  });

  return merged;
}

function deriveTestEngineLiveViewUrl(integration?: Integration | null) {
  if (!integration) {
    return "";
  }

  const configured = String(integration.config?.live_view_url || integration.config?.vnc_url || "").trim();
  const provider = String(integration.config?.active_web_engine || "playwright").trim().toLowerCase();

  if (
    configured
    && !(provider === "playwright" && !configured.includes("/api/v1/live-session"))
    && !(provider === "selenium" && configured.includes("/api/v1/live-session"))
  ) {
    return configured;
  }

  if (!integration.base_url) {
    return "";
  }

  try {
    const parsed = new URL(integration.base_url);
    if (provider === "selenium") {
      parsed.port = "7900";
      parsed.pathname = "/";
      parsed.search = "?autoconnect=1&resize=scale";
    } else {
      return buildBrowserUrl(integration, "/api/v1/live-session?provider=playwright", ["live_view_url", "public_base_url"]);
    }

    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function isBatchProcessTransaction(transaction: WorkspaceTransaction) {
  return BATCH_PROCESS_CATEGORIES.has(transaction.category)
    || transaction.action === "testengine_run"
    || transaction.action === "execution_report_export"
    || transaction.action === "run_report_export";
}

export function ExecutionsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { session } = useAuth();
  const { getPrompt } = useAiPromptRegistry(Boolean(session));
  const featureFlagsQuery = useFeatureFlags(Boolean(session));
  const canCreateManualRuns = hasPermission(session, "run.create")
    && areFeatureFlagsEnabled(featureFlagsQuery.data, ["qaira.manual.runs"]);
  const canRunLocalAutomation = hasPermission(session, "automation.run.local")
    && areFeatureFlagsEnabled(featureFlagsQuery.data, ["qaira.automation.workspace", "qaira.automation.local_execution"]);
  const canRunRemoteAutomation = hasPermission(session, "automation.run.remote")
    && areFeatureFlagsEnabled(featureFlagsQuery.data, ["qaira.automation.workspace", "qaira.automation.remote_execution"]);
  const canUseRunAi = hasPermission(session, "run.ai")
    && areFeatureFlagsEnabled(featureFlagsQuery.data, ["qaira.ai.execution_analysis"]);
  const canViewRunEvidence = hasPermission(session, "result.view")
    && hasPermission(session, "attachment.view");
  const canCreateRunEvidence = hasPermission(session, "result.manage")
    && hasPermission(session, "attachment.create");
  const canDeleteRunEvidence = hasPermission(session, "result.manage")
    && hasPermission(session, "attachment.delete");
  const { confirmDelete, confirmationDialog } = useDeleteConfirmation();
  const [projectId, setProjectId] = useCurrentProject();
  const [appTypeId, setAppTypeId] = useCurrentAppType(projectId);
  const [executionCreateMode, setExecutionCreateMode] = useState<ExecutionCreateMode>("manual");
  const [executionStartMode, setExecutionStartMode] = useState<ExecutionStartMode>("manual");
  const [executionParallelEnabled, setExecutionParallelEnabled] = useState(false);
  const [executionParallelCount, setExecutionParallelCount] = useState(1);
  const [executionHookDraft, setExecutionHookDraft] = useState<ExecutionHookDraft>(() => emptyExecutionHookDraft());
  const [testRunsView, setTestRunsView] = useState<TestRunsView>("suite-runs");
  const [selectedSuiteIds, setSelectedSuiteIds] = useState<string[]>([]);
  const [isCreateExecutionModalOpen, setIsCreateExecutionModalOpen] = useState(false);
  const [isCreateScheduleModalOpen, setIsCreateScheduleModalOpen] = useState(false);
  const [scheduleModalMode, setScheduleModalMode] = useState<"create" | "edit">("create");
  const [editingScheduleId, setEditingScheduleId] = useState("");
  const [selectedExecutionId, setSelectedExecutionId] = useState("");
  const [selectedScheduleId, setSelectedScheduleId] = useState("");
  const [selectedOperationId, setSelectedOperationId] = useState("");
  const [focusedSuiteId, setFocusedSuiteId] = useState("");
  const [expandedExecutionSuiteIds, setExpandedExecutionSuiteIds] = useState<string[]>([]);
  const [selectedTestCaseId, setSelectedTestCaseId] = useState("");
  const [expandedExecutionStepGroupIds, setExpandedExecutionStepGroupIds] = useState<string[]>([]);
  const [expandedExecutionStepIds, setExpandedExecutionStepIds] = useState<string[]>([]);
  const [bulkSelectedStepIds, setBulkSelectedStepIds] = useState<string[]>([]);
  const [executionName, setExecutionName] = useState("");
  const [selectedExecutionEnvironmentId, setSelectedExecutionEnvironmentId] = useState("");
  const [selectedExecutionConfigurationId, setSelectedExecutionConfigurationId] = useState("");
  const [selectedExecutionDataSetId, setSelectedExecutionDataSetId] = useState("");
  const [selectedExecutionAssigneeIds, setSelectedExecutionAssigneeIds] = useState<string[]>([]);
  const [executionRelease, setExecutionRelease] = useState("");
  const [executionSprint, setExecutionSprint] = useState("");
  const [executionBuild, setExecutionBuild] = useState("");
  const [scheduleCadence, setScheduleCadence] = useState<ExecutionScheduleCadence>("weekly");
  const [scheduleIntervalMinutes, setScheduleIntervalMinutes] = useState(5);
  const [scheduleNextRunAt, setScheduleNextRunAt] = useState("");
  const [smartExecutionIntegrationId, setSmartExecutionIntegrationId] = useState("");
  const [smartExecutionReleaseScope, setSmartExecutionReleaseScope] = useState("");
  const [smartExecutionAdditionalContext, setSmartExecutionAdditionalContext] = useState("");
  const [selectedSmartRequirementIds, setSelectedSmartRequirementIds] = useState<string[]>([]);
  const [smartExecutionRequirementSearch, setSmartExecutionRequirementSearch] = useState("");
  const [smartExecutionPreview, setSmartExecutionPreview] = useState<SmartExecutionPreviewResponse | null>(null);
  const [selectedSmartExecutionCaseIds, setSelectedSmartExecutionCaseIds] = useState<string[]>([]);
  const [smartExecutionPreviewMessage, setSmartExecutionPreviewMessage] = useState("");
  const [smartExecutionPreviewTone, setSmartExecutionPreviewTone] = useState<"success" | "error">("success");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");
  const [activeTab, setActiveTab] = useState<ExecutionTab>("overview");
  const [runLibrarySearchByView, setRunLibrarySearchByView] = useState<Record<TestRunsView, string>>(DEFAULT_RUN_LIBRARY_SEARCH_BY_VIEW);
  const [catalogViewModeByView, setCatalogViewModeByView] = useState<Record<TestRunsView, CatalogViewMode>>(() => {
    const preferredCatalogViewMode = readDefaultCatalogViewMode();

    return Object.fromEntries(
      Object.keys(DEFAULT_CATALOG_VIEW_MODE_BY_RUN_VIEW).map((key) => [key, preferredCatalogViewMode])
    ) as Record<TestRunsView, CatalogViewMode>;
  });
  const [executionSuiteCatalogViewMode, setExecutionSuiteCatalogViewMode] = useState<CatalogViewMode>(() => readDefaultCatalogViewMode());
  const [executionCaseCatalogViewMode, setExecutionCaseCatalogViewMode] = useState<CatalogViewMode>(() => readDefaultCatalogViewMode());
  const [selectedActionExecutionIds, setSelectedActionExecutionIds] = useState<string[]>([]);
  const [selectedActionScheduleIds, setSelectedActionScheduleIds] = useState<string[]>([]);
  const [selectedActionOperationIds, setSelectedActionOperationIds] = useState<string[]>([]);
  const [executionSuiteSearch, setExecutionSuiteSearch] = useState("");
  const [executionCaseSearch, setExecutionCaseSearch] = useState("");
  const [isExecutionListMinimized, setIsExecutionListMinimized] = useState(false);
  const [isSuiteTreeMinimized, setIsSuiteTreeMinimized] = useState(false);
  const [isExecutionHealthExpanded, setIsExecutionHealthExpanded] = useState(true);
  const [isExecutionSupportExpanded, setIsExecutionSupportExpanded] = useState(true);
  const [isExecutionInputParamsExpanded, setIsExecutionInputParamsExpanded] = useState(false);
  const [isExecutionOutputParamsExpanded, setIsExecutionOutputParamsExpanded] = useState(false);
  const [isExecutionReferencesExpanded, setIsExecutionReferencesExpanded] = useState(false);
  const [isExecutionAiAnalysisExpanded, setIsExecutionAiAnalysisExpanded] = useState(false);
  const [isFailureClusterPreviewOpen, setIsFailureClusterPreviewOpen] = useState(false);
  const [executionStepViewMode, setExecutionStepViewMode] = useState<"manual" | "automation">("manual");
  const [executionStatusFilter, setExecutionStatusFilter] = useState<ExecutionStatus | "all">("all");
  const [executionIssueFilter, setExecutionIssueFilter] = useState<ExecutionIssueFilter>("all");
  const [executionEvidenceFilter, setExecutionEvidenceFilter] = useState<ExecutionEvidenceFilter>("all");
  const [liveNow, setLiveNow] = useState(() => Date.now());
  const [executionListItemHeight, setExecutionListItemHeight] = useState(236);
  const [caseTimerStartedAtById, setCaseTimerStartedAtById] = useState<Record<string, number>>({});
  const [executionFinalizeAction, setExecutionFinalizeAction] = useState<"complete" | "abort" | null>(null);
  const [uploadingEvidenceStepId, setUploadingEvidenceStepId] = useState("");
  const [openingEvidenceStepId, setOpeningEvidenceStepId] = useState("");
  const [linkingDefectStepId, setLinkingDefectStepId] = useState("");
  const [runningExecutionApiStepId, setRunningExecutionApiStepId] = useState("");
  const [executionEvidencePreview, setExecutionEvidencePreview] = useState<ExecutionEvidencePreviewState | null>(null);
  const executionEvidenceObjectUrlRef = useRef<string | null>(null);
  const [executionApiDetailState, setExecutionApiDetailState] = useState<ExecutionApiDetailState | null>(null);
  const [isExecutionContextModalOpen, setIsExecutionContextModalOpen] = useState(false);
  const [isReportEmailModalOpen, setIsReportEmailModalOpen] = useState(false);
  const [reportEmailDraft, setReportEmailDraft] = useState("");
  const [codePreviewState, setCodePreviewState] = useState<{ title: string; subtitle: string; code: string } | null>(null);
  const [executionAssignmentDraftIds, setExecutionAssignmentDraftIds] = useState<string[]>([]);
  const [caseAssignmentDraft, setCaseAssignmentDraft] = useState("");
  const [caseReferenceDraft, setCaseReferenceDraft] = useState("");
  const [caseDefectDraft, setCaseDefectDraft] = useState("");
  const [supportsLocalDesktopExecution, setSupportsLocalDesktopExecution] = useState(true);
  const executionCardMeasureRef = useRef<HTMLDivElement | null>(null);
  const executionSearch = runLibrarySearchByView[testRunsView];
  const catalogViewMode = catalogViewModeByView[testRunsView];
  const deferredExecutionSearch = useDeferredValue(executionSearch);

  const closeExecutionEvidence = () => {
    if (executionEvidenceObjectUrlRef.current) {
      URL.revokeObjectURL(executionEvidenceObjectUrlRef.current);
      executionEvidenceObjectUrlRef.current = null;
    }
    setExecutionEvidencePreview(null);
  };

  useEffect(() => () => {
    if (executionEvidenceObjectUrlRef.current) {
      URL.revokeObjectURL(executionEvidenceObjectUrlRef.current);
    }
  }, []);

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: api.projects.list
  });
  const usersQuery = useQuery({
    queryKey: ["users"],
    queryFn: api.users.list,
    enabled: Boolean(session)
  });
  const projectMembersQuery = useQuery({
    queryKey: ["project-members", projectId],
    queryFn: () => api.projectMembers.list({ project_id: projectId }),
    enabled: Boolean(projectId && session)
  });
  const executionsQuery = useQuery({
    queryKey: ["executions", projectId, appTypeId],
    queryFn: () => api.executions.list(projectId ? { project_id: projectId, app_type_id: appTypeId || undefined } : undefined),
    refetchInterval: EXECUTION_POLL_INTERVAL_MS
  });
  const executionSchedulesQuery = useQuery({
    queryKey: ["execution-schedules", projectId, appTypeId],
    queryFn: () => api.executionSchedules.list({
      project_id: projectId || undefined,
      app_type_id: appTypeId || undefined
    }),
    enabled: Boolean(projectId),
    refetchInterval: EXECUTION_POLL_INTERVAL_MS
  });
  const selectedExecutionQuery = useQuery({
    queryKey: ["execution", selectedExecutionId],
    queryFn: () => api.executions.get(selectedExecutionId),
    enabled: Boolean(selectedExecutionId),
    refetchInterval: EXECUTION_POLL_INTERVAL_MS
  });
  const appTypesQuery = useQuery({
    queryKey: ["app-types", projectId],
    queryFn: () => api.appTypes.list({ project_id: projectId }),
    enabled: Boolean(projectId)
  });
  const requirementsQuery = useQuery({
    queryKey: ["requirements", projectId],
    queryFn: () => api.requirements.list({ project_id: projectId }),
    enabled: Boolean(projectId)
  });
  const bugsQuery = useQuery({
    queryKey: ["execution-bugs", projectId],
    queryFn: () => api.issues.list({ project_id: projectId, page_size: 100, projection: "detail" }),
    enabled: Boolean(projectId && selectedExecutionId)
  });
  const smartExecutionCasesQuery = useQuery({
    queryKey: ["smart-execution-cases", appTypeId],
    queryFn: () => api.testCases.list({ app_type_id: appTypeId }),
    enabled: Boolean(appTypeId)
  });
  const scopedSuitesQuery = useQuery({
    queryKey: ["execution-suites", appTypeId],
    queryFn: () => api.testSuites.list({ app_type_id: appTypeId }),
    enabled: Boolean(appTypeId)
  });
  const executionResultsQuery = useQuery({
    queryKey: ["execution-results", selectedExecutionId],
    queryFn: () => api.executionResults.list({ execution_id: selectedExecutionId }),
    enabled: Boolean(selectedExecutionId),
    refetchInterval: EXECUTION_POLL_INTERVAL_MS
  });
  const allExecutionResultsQuery = useQuery({
    queryKey: ["execution-results"],
    queryFn: () => api.executionResults.list(),
    refetchInterval: EXECUTION_POLL_INTERVAL_MS
  });
  const integrationsQuery = useQuery({
    queryKey: ["integrations", "llm"],
    queryFn: () => api.integrations.list({ type: "llm", is_active: true }),
    enabled: Boolean(session)
  });
  const testEngineIntegrationsQuery = useQuery({
    queryKey: ["integrations", "testengine"],
    queryFn: () => api.integrations.list({ type: "testengine", is_active: true }),
    enabled: Boolean(session)
  });
  const workspaceTransactionsQuery = useQuery({
    queryKey: ["workspace-transactions", projectId, appTypeId],
    queryFn: () => api.workspaceTransactions.list({
      project_id: projectId || undefined,
      app_type_id: appTypeId || undefined,
      limit: 100
    }),
    enabled: Boolean(projectId && session),
    refetchInterval: EXECUTION_POLL_INTERVAL_MS
  });
  const selectedWorkspaceTransactionEventsQuery = useQuery({
    queryKey: ["workspace-transaction-events", selectedOperationId],
    queryFn: () => api.workspaceTransactions.events(selectedOperationId),
    enabled: Boolean(selectedOperationId && session),
    refetchInterval: EXECUTION_POLL_INTERVAL_MS
  });

  const createExecution = useMutation({ mutationFn: api.executions.create });
  const updateExecutionAssignment = useMutation({
    mutationFn: ({ id, assigned_to_ids }: { id: string; assigned_to_ids: string[] }) => api.executions.update(id, { assigned_to_ids })
  });
  const updateExecutionCaseAssignment = useMutation({
    mutationFn: ({ executionId, testCaseId, assigned_to }: { executionId: string; testCaseId: string; assigned_to?: string }) =>
      api.executions.updateCaseAssignment(executionId, testCaseId, { assigned_to })
  });
  const createExecutionSchedule = useMutation({ mutationFn: api.executionSchedules.create });
  const updateExecutionSchedule = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof api.executionSchedules.update>[1] }) =>
      api.executionSchedules.update(id, input)
  });
  const runExecutionSchedule = useMutation({ mutationFn: api.executionSchedules.run });
  const deleteExecutionSchedule = useMutation({ mutationFn: api.executionSchedules.delete });
  const rerunExecution = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof api.executions.rerun>[1] }) =>
      api.executions.rerun(id, input)
  });
  const previewSmartExecution = useMutation({ mutationFn: api.executions.previewSmartPlan });
  const startExecution = useMutation({
    mutationFn: (input: string | { id: string; options?: Parameters<typeof api.executions.start>[1] }) =>
      typeof input === "string" ? api.executions.start(input) : api.executions.start(input.id, input.options)
  });
  const attachNetworkAutomationToCase = useMutation({
    mutationFn: ({ testCaseId, network }: { testCaseId: string; network: NonNullable<ExecutionStepWebDetail["network"]> }) =>
      api.testCases.buildAutomation(testCaseId, {
        additional_context: getPrompt("ai.execution.network_to_api_steps"),
        captured_actions: [],
        captured_network: network
      })
  });
  const completeExecution = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "completed" | "failed" | "aborted" }) => api.executions.complete(id, { status })
  });
  const runExecutionApiStep = useMutation({
    mutationFn: ({ executionId, testCaseId, stepId }: { executionId: string; testCaseId: string; stepId: string }) =>
      api.executions.runApiStep(executionId, testCaseId, stepId)
  });
  const runExecutionAiAnalysis = useMutation({
    mutationFn: ({ executionId, testCaseId }: { executionId: string; testCaseId: string }) =>
      api.executions.analyzeCase(executionId, testCaseId)
  });
  const previewExecutionFailureClusters = useMutation({
    mutationFn: ({ executionId, input }: { executionId: string; input: Parameters<typeof api.executions.previewFailureClusters>[1] }) =>
      api.executions.previewFailureClusters(executionId, input)
  });
  const downloadExecutionReport = useMutation({
    mutationFn: (executionId: string) => api.executions.downloadReportPdf(executionId)
  });
  const shareExecutionReport = useMutation({
    mutationFn: ({ executionId, recipients }: { executionId: string; recipients: string[] }) =>
      api.executions.shareReport(executionId, { recipients })
  });
  const createResult = useMutation({ mutationFn: api.executionResults.create });
  const updateResult = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof api.executionResults.update>[1] }) =>
      api.executionResults.update(id, input)
  });

  const projects = projectsQuery.data || [];
  const users = usersQuery.data || [];
  const projectMembers = projectMembersQuery.data || [];
  const executions = useMemo(
    () =>
      [...(executionsQuery.data || [])].sort((left, right) => {
        const rightTimestamp =
          toTimestamp(right.created_at) ??
          toTimestamp(right.started_at) ??
          toTimestamp(right.updated_at) ??
          0;
        const leftTimestamp =
          toTimestamp(left.created_at) ??
          toTimestamp(left.started_at) ??
          toTimestamp(left.updated_at) ??
          0;

        if (rightTimestamp !== leftTimestamp) {
          return rightTimestamp - leftTimestamp;
        }

        return String(right.id).localeCompare(String(left.id));
      }),
    [executionsQuery.data]
  );
  const executionSchedules = executionSchedulesQuery.data || [];
  const appTypes = appTypesQuery.data || [];
  const requirements = requirementsQuery.data || [];
  const bugs = (bugsQuery.data || []) as Issue[];
  const smartExecutionLibraryCases = smartExecutionCasesQuery.data || [];
  const scopeSuites = scopedSuitesQuery.data || [];
  const executionResults = executionResultsQuery.data || [];
  const allExecutionResults = allExecutionResultsQuery.data || [];
  const integrations = integrationsQuery.data || [];
  const testEngineIntegrations = testEngineIntegrationsQuery.data || [];
  const selectedProject = projects.find((project) => String(project.id) === String(projectId)) || null;
  const selectedAppType = appTypes.find((appType) => appType.id === appTypeId) || null;
  const assigneeOptions = useMemo<ExecutionAssigneeOption[]>(
    () => buildAssigneeOptions(projectMembers, users),
    [projectMembers, users]
  );
  const projectNameById = useMemo(
    () =>
      projects.reduce<Record<string, string>>((accumulator, project) => {
        accumulator[project.id] = project.name;
        return accumulator;
      }, {}),
    [projects]
  );
  const appTypeNameById = useMemo(
    () =>
      appTypes.reduce<Record<string, string>>((accumulator, appType) => {
        accumulator[appType.id] = appType.name;
        return accumulator;
      }, {}),
    [appTypes]
  );
  const workspaceTransactions = useMemo(
    () =>
      (workspaceTransactionsQuery.data || []).filter((transaction) => isBatchProcessTransaction(transaction)),
    [workspaceTransactionsQuery.data]
  );
  const workspaceTransactionStatusCounts = useMemo(
    () =>
      workspaceTransactions.reduce<Record<string, number>>((accumulator, transaction) => {
        accumulator[transaction.status] = (accumulator[transaction.status] || 0) + 1;
        return accumulator;
      }, {}),
    [workspaceTransactions]
  );
  const filteredWorkspaceTransactions = useMemo(() => {
    const search = deferredExecutionSearch.trim().toLowerCase();

    if (!search) {
      return workspaceTransactions;
    }

    return workspaceTransactions.filter((transaction) =>
      [
        transaction.id,
        transaction.related_id,
        transaction.title,
        transaction.description,
        transaction.status,
        transaction.category,
        transaction.action,
        String(transaction.metadata?.provider || ""),
        String(transaction.metadata?.repository || ""),
        String(transaction.metadata?.file_name || "")
      ].some((value) => String(value || "").toLowerCase().includes(search))
    );
  }, [deferredExecutionSearch, workspaceTransactions]);
  const selectedWorkspaceTransaction = useMemo(
    () => filteredWorkspaceTransactions.find((transaction) => transaction.id === selectedOperationId) || workspaceTransactions.find((transaction) => transaction.id === selectedOperationId) || null,
    [filteredWorkspaceTransactions, selectedOperationId, workspaceTransactions]
  );
  const smartExecutionLibraryCaseById = useMemo(
    () => new Map(smartExecutionLibraryCases.map((testCase) => [testCase.id, testCase])),
    [smartExecutionLibraryCases]
  );
  const requirementById = useMemo(
    () => new Map(requirements.map((requirement) => [requirement.id, requirement])),
    [requirements]
  );
  const smartExecutionRequirementOptions = useMemo<SmartExecutionRequirementOption[]>(() => {
    const linkedCaseIdsByRequirementId = smartExecutionLibraryCases.reduce<Map<string, Set<string>>>((accumulator, testCase) => {
      const requirementIds = [...new Set([...(testCase.requirement_ids || []), testCase.requirement_id].filter(Boolean))] as string[];

      requirementIds.forEach((requirementId) => {
        const scopedCaseIds = accumulator.get(requirementId) || new Set<string>();
        scopedCaseIds.add(testCase.id);
        accumulator.set(requirementId, scopedCaseIds);
      });

      return accumulator;
    }, new Map<string, Set<string>>());

    return requirements
      .filter((requirement) => linkedCaseIdsByRequirementId.has(requirement.id))
      .map((requirement) => ({
        id: requirement.id,
        title: requirement.title,
        description: requirement.description,
        linkedCaseCount: linkedCaseIdsByRequirementId.get(requirement.id)?.size || 0
      }))
      .sort((left, right) => {
        if (right.linkedCaseCount !== left.linkedCaseCount) {
          return right.linkedCaseCount - left.linkedCaseCount;
        }

        return left.title.localeCompare(right.title);
      });
  }, [requirements, smartExecutionLibraryCases]);

  useEffect(() => {
    if (testRunsView !== "batch-process") {
      return;
    }

    if (!selectedOperationId) {
      return;
    }

    if (workspaceTransactions.some((transaction) => transaction.id === selectedOperationId)) {
      return;
    }

    setSelectedOperationId("");
  }, [selectedOperationId, testRunsView, workspaceTransactions]);

  useEffect(() => {
    if (testRunsView !== "scheduled-runs") {
      return;
    }

    if (selectedScheduleId && executionSchedules.some((schedule) => schedule.id === selectedScheduleId)) {
      return;
    }

    setSelectedScheduleId(executionSchedules[0]?.id || "");
  }, [executionSchedules, selectedScheduleId, testRunsView]);

  useEffect(() => {
    const validRequirementIds = new Set(smartExecutionRequirementOptions.map((requirement) => requirement.id));

    setSelectedSmartRequirementIds((current) => {
      const next = current.filter((requirementId) => validRequirementIds.has(requirementId));

      if (next.length === current.length && next.every((requirementId, index) => requirementId === current[index])) {
        return current;
      }

      return next;
    });
  }, [smartExecutionRequirementOptions]);

  const showSuccess = (text: string) => {
    setMessageTone("success");
    setMessage(text);
  };

  const showError = (error: unknown, fallback: string) => {
    setMessageTone("error");
    setMessage(error instanceof Error ? error.message : fallback);
  };

  const resetSmartExecutionPreview = () => {
    setSmartExecutionPreview(null);
    setSelectedSmartExecutionCaseIds([]);
    setSmartExecutionPreviewMessage("");
    setSmartExecutionPreviewTone("success");
  };

  const closeCreateExecutionModal = () => {
    setIsCreateExecutionModalOpen(false);
  };

  const resetExecutionContextSelection = () => {
    setSelectedExecutionEnvironmentId("");
    setSelectedExecutionConfigurationId("");
    setSelectedExecutionDataSetId("");
  };

  const resetScheduleBuilder = () => {
    setExecutionName("");
    setSelectedSuiteIds([]);
    setSelectedExecutionAssigneeIds([]);
    setExecutionRelease("");
    setExecutionSprint("");
    setExecutionBuild("");
    setScheduleCadence("weekly");
    setScheduleIntervalMinutes(5);
    setScheduleNextRunAt("");
    setEditingScheduleId("");
    setScheduleModalMode("create");
    resetExecutionContextSelection();
  };

  const resetSmartExecutionBuilder = () => {
    setExecutionCreateMode("manual");
    setSelectedExecutionAssigneeIds([]);
    setExecutionRelease("");
    setExecutionSprint("");
    setExecutionBuild("");
    setSmartExecutionIntegrationId("");
    setSmartExecutionReleaseScope("");
    setSmartExecutionAdditionalContext("");
    setSelectedSmartRequirementIds([]);
    setSmartExecutionRequirementSearch("");
    resetSmartExecutionPreview();
  };

  const closeExecutionBuilder = () => {
    closeCreateExecutionModal();
    setExecutionName("");
    setExecutionStartMode("manual");
    setExecutionParallelEnabled(false);
    setExecutionParallelCount(1);
    setExecutionHookDraft(emptyExecutionHookDraft());
    setSelectedExecutionAssigneeIds([]);
    setExecutionRelease("");
    setExecutionSprint("");
    setExecutionBuild("");
    resetExecutionContextSelection();
    resetSmartExecutionBuilder();
  };

	  const openExecutionBuilder = (mode: ExecutionStartMode = "manual") => {
	    const hasModeAccess = mode === "local"
	      ? canRunLocalAutomation
	      : mode === "remote"
	        ? canRunRemoteAutomation
	        : canCreateManualRuns;

	    if (!hasModeAccess) {
	      showError(
	        new Error(
	          mode === "local"
	            ? "Permission required: automation.run.local"
	            : mode === "remote"
	              ? "Permission required: automation.run.remote"
	              : "Permission required: run.create"
	        ),
	        "Unable to open run builder"
	      );
	      return;
	    }

	    setExecutionStartMode(mode);
	    setIsCreateExecutionModalOpen(true);
	  };

  const closeScheduleBuilder = () => {
    setIsCreateScheduleModalOpen(false);
    resetScheduleBuilder();
  };

  const openCreateScheduleBuilder = () => {
    resetScheduleBuilder();
    const nextHour = new Date();
    nextHour.setMinutes(0, 0, 0);
    nextHour.setHours(nextHour.getHours() + 1);
    setScheduleNextRunAt(toDateTimeLocalValue(nextHour.toISOString()));

    setScheduleModalMode("create");
    setIsCreateScheduleModalOpen(true);
  };

  const openEditScheduleBuilder = (schedule: ExecutionSchedule) => {
    setScheduleModalMode("edit");
    setEditingScheduleId(schedule.id);
    setExecutionName(schedule.name || "");
    setSelectedSuiteIds(schedule.suite_ids || []);
    setSelectedExecutionEnvironmentId(schedule.test_environment_id || "");
    setSelectedExecutionConfigurationId(schedule.test_configuration_id || "");
    setSelectedExecutionDataSetId(schedule.test_data_set_id || "");
    setSelectedExecutionAssigneeIds(schedule.assigned_to_ids?.length ? schedule.assigned_to_ids : schedule.assigned_to ? [schedule.assigned_to] : []);
    setExecutionRelease(schedule.release || "");
    setExecutionSprint(schedule.sprint || "");
    setExecutionBuild(schedule.build || "");
    setScheduleCadence(
      isIntervalCadence(schedule.cadence)
        ? "interval_minutes"
        : schedule.cadence === "daily" || schedule.cadence === "weekly" || schedule.cadence === "monthly" || schedule.cadence === "once"
          ? schedule.cadence
          : "weekly"
    );
    setScheduleIntervalMinutes(parseIntervalCadenceMinutes(schedule.cadence));
    setScheduleNextRunAt(toDateTimeLocalValue(schedule.next_run_at));
    setIsCreateScheduleModalOpen(true);
  };

  const handleExecutionProjectChange = (value: string) => {
    setProjectId(value);
    setSelectedSuiteIds([]);
    setSelectedExecutionAssigneeIds([]);
    setSelectedSmartRequirementIds([]);
    setSmartExecutionRequirementSearch("");
    resetExecutionContextSelection();
    resetSmartExecutionPreview();
  };

  const handleExecutionAppTypeChange = (value: string) => {
    setAppTypeId(value);
    setSelectedSuiteIds([]);
    setSelectedSmartRequirementIds([]);
    setSmartExecutionRequirementSearch("");
    resetExecutionContextSelection();
    resetSmartExecutionPreview();
  };

  const handleExecutionEnvironmentChange = (value: string) => {
    setSelectedExecutionEnvironmentId(value);
    resetSmartExecutionPreview();
  };

  const handleExecutionConfigurationChange = (value: string) => {
    setSelectedExecutionConfigurationId(value);
    resetSmartExecutionPreview();
  };

  const handleExecutionDataSetChange = (value: string) => {
    setSelectedExecutionDataSetId(value);
    resetSmartExecutionPreview();
  };

  const handleSmartExecutionIntegrationChange = (value: string) => {
    setSmartExecutionIntegrationId(value);
    resetSmartExecutionPreview();
  };

  const handleSmartExecutionReleaseScopeChange = (value: string) => {
    setSmartExecutionReleaseScope(value);
    resetSmartExecutionPreview();
  };

  const handleSmartExecutionAdditionalContextChange = (value: string) => {
    setSmartExecutionAdditionalContext(value);
    resetSmartExecutionPreview();
  };

  const handleToggleSmartExecutionRequirement = (requirementId: string) => {
    setSelectedSmartRequirementIds((current) =>
      current.includes(requirementId) ? current.filter((id) => id !== requirementId) : [...current, requirementId]
    );
    resetSmartExecutionPreview();
  };

  const handleClearSmartExecutionRequirements = () => {
    setSelectedSmartRequirementIds([]);
    resetSmartExecutionPreview();
  };

  const handleSelectSmartExecutionRequirements = (requirementIds: string[]) => {
    setSelectedSmartRequirementIds(requirementIds);
    resetSmartExecutionPreview();
  };

  const syncExecutionSearchParams = (executionId: string, testCaseId?: string | null) => {
    const currentExecutionId = searchParams.get("execution") || "";
    const currentTestCaseId = searchParams.get("testCase") || "";
    const nextTestCaseId = testCaseId || "";

    if (currentExecutionId === executionId && currentTestCaseId === nextTestCaseId) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams);

    if (executionId) {
      nextParams.set("execution", executionId);
    } else {
      nextParams.delete("execution");
    }

    if (testCaseId) {
      nextParams.set("testCase", testCaseId);
    } else {
      nextParams.delete("testCase");
    }

    setSearchParams(nextParams, { replace: true });
  };

  const focusExecution = (executionId: string) => {
    setSelectedExecutionId(executionId);
    setFocusedSuiteId("");
    setSelectedTestCaseId("");
    syncExecutionSearchParams(executionId, null);
  };

  useEffect(() => {
    if (appTypesQuery.isPending) {
      return;
    }

    const scopedAppTypes = projectId
      ? appTypes.filter((item) => String(item.project_id) === String(projectId))
      : appTypes;

    if (projectId && appTypes.length && !scopedAppTypes.length) {
      return;
    }

    if (!scopedAppTypes.length) {
      setAppTypeId("");
      setSelectedSuiteIds([]);
      resetExecutionContextSelection();
      resetSmartExecutionPreview();
      return;
    }

    if (!scopedAppTypes.some((item) => item.id === appTypeId)) {
      setAppTypeId(scopedAppTypes[0].id);
      setSelectedSuiteIds([]);
      resetExecutionContextSelection();
      resetSmartExecutionPreview();
    }
  }, [appTypeId, appTypes, appTypesQuery.isPending, projectId, resetExecutionContextSelection, resetSmartExecutionPreview, setAppTypeId]);

  useEffect(() => {
    if (!integrations.length) {
      setSmartExecutionIntegrationId("");
      return;
    }

    if (smartExecutionIntegrationId && !integrations.some((integration) => integration.id === smartExecutionIntegrationId)) {
      setSmartExecutionIntegrationId("");
    }
  }, [integrations, smartExecutionIntegrationId]);

  useEffect(() => {
    if (usersQuery.isPending || projectMembersQuery.isPending) {
      return;
    }

    const validAssigneeIds = new Set(assigneeOptions.map((option) => option.id));
    if (selectedExecutionAssigneeIds.some((assigneeId) => !validAssigneeIds.has(assigneeId))) {
      setSelectedExecutionAssigneeIds((current) => current.filter((assigneeId) => validAssigneeIds.has(assigneeId)));
    }
  }, [assigneeOptions, projectMembersQuery.isPending, selectedExecutionAssigneeIds, usersQuery.isPending]);

  useEffect(() => {
    if (usersQuery.isPending || projectMembersQuery.isPending) {
      return;
    }

    const validAssigneeIds = new Set(assigneeOptions.map((option) => option.id));
    if (executionAssignmentDraftIds.some((assigneeId) => !validAssigneeIds.has(assigneeId))) {
      setExecutionAssignmentDraftIds((current) => current.filter((assigneeId) => validAssigneeIds.has(assigneeId)));
    }

    if (caseAssignmentDraft && !assigneeOptions.some((option) => option.id === caseAssignmentDraft)) {
      setCaseAssignmentDraft("");
    }
  }, [assigneeOptions, caseAssignmentDraft, executionAssignmentDraftIds, projectMembersQuery.isPending, usersQuery.isPending]);

  useEffect(() => {
    const requestedExecutionId = searchParams.get("execution");
    const requestedViewParam = searchParams.get("view");
    if (requestedViewParam === "batch-process") {
      navigate("/testops", { replace: true });
      return;
    }
    if (requestedViewParam === "local-runs" && !featureFlagsQuery.isPending && !canRunLocalAutomation) {
      navigate("/executions?view=suite-runs", { replace: true });
      return;
    }
    const requestedView: TestRunsView | null =
      requestedViewParam === "test-case-runs"
      || requestedViewParam === "suite-runs"
      || requestedViewParam === "local-runs"
      || requestedViewParam === "scheduled-runs"
        ? requestedViewParam
        : null;
    const requestedTestCaseId = searchParams.get("testCase");

    if (requestedExecutionId) {
      const requestedExecution =
        executions.find((execution) => execution.id === requestedExecutionId)
        || (selectedExecutionQuery.data?.id === requestedExecutionId ? selectedExecutionQuery.data : null);
      const fallbackView = requestedView || (requestedTestCaseId ? "test-case-runs" : "suite-runs");

      if (!isExecutionRunsView(testRunsView)) {
        setTestRunsView(requestedExecution ? resolveExecutionRunBucket(requestedExecution) : fallbackView);
      }

      if (requestedExecution) {
        const requestedView = resolveExecutionRunBucket(requestedExecution);
        if (testRunsView !== requestedView) {
          setTestRunsView(requestedView);
        }
      } else if (requestedView && testRunsView !== requestedView) {
        setTestRunsView(requestedView);
      }

      if (selectedExecutionId !== requestedExecutionId) {
        setSelectedExecutionId(requestedExecutionId);
      }
      return;
    }

    if (requestedView && selectedExecutionId) {
      setSelectedExecutionId("");
      setFocusedSuiteId("");
      setSelectedTestCaseId("");
    }

    if (requestedView && requestedView !== "scheduled-runs" && selectedScheduleId) {
      setSelectedScheduleId("");
    }

    if (requestedView && selectedOperationId) {
      setSelectedOperationId("");
    }

    if (requestedView && testRunsView !== requestedView) {
      setTestRunsView(requestedView);
      return;
    }

    if (executionsQuery.isLoading || executionsQuery.isFetching || selectedExecutionQuery.isLoading || selectedExecutionQuery.isFetching) {
      return;
    }

    if (selectedExecutionId && !executions.some((execution) => execution.id === selectedExecutionId)) {
      setSelectedExecutionId("");
    }
  }, [
    canRunLocalAutomation,
    executions,
    executionsQuery.isFetching,
    executionsQuery.isLoading,
    featureFlagsQuery.isPending,
    navigate,
    searchParams,
    selectedExecutionId,
    selectedOperationId,
    selectedScheduleId,
    selectedExecutionQuery.data,
    selectedExecutionQuery.isFetching,
    selectedExecutionQuery.isLoading,
    testRunsView
  ]);

  useEffect(() => {
    if (!isExecutionRunsView(testRunsView)) {
      if (searchParams.get("execution")) {
        return;
      }

      setSelectedExecutionId("");
      setFocusedSuiteId("");
      setSelectedTestCaseId("");
      syncExecutionSearchParams("", null);
    }
  }, [searchParams, testRunsView]);

  const selectedExecution = selectedExecutionQuery.data || executions.find((execution) => execution.id === selectedExecutionId) || null;
  const selectedSchedule = executionSchedules.find((schedule) => schedule.id === selectedScheduleId) || null;
  const selectedExecutionSuiteIds = selectedExecution?.suite_ids || [];
  const selectedExecutionSuites = selectedExecution?.suite_snapshots || [];
  const currentExecutionStatus = normalizeExecutionStatus(selectedExecution?.status);
  const selectedExecutionAppTypeKind = selectedExecution?.app_type_id
    ? appTypes.find((appType) => appType.id === selectedExecution.app_type_id)?.type || null
    : null;
  const selectedTestEngineIntegration = useMemo(() => {
    if (!selectedExecution) {
      return null;
    }

    const projectScoped = testEngineIntegrations.find(
      (integration) => String(integration.config?.project_id || "").trim() === selectedExecution.project_id
    );

    return projectScoped || testEngineIntegrations.find((integration) => !String(integration.config?.project_id || "").trim()) || null;
  }, [selectedExecution, testEngineIntegrations]);
  const testEngineLiveViewUrl = selectedTestEngineIntegration ? deriveTestEngineLiveViewUrl(selectedTestEngineIntegration) : "";
  const isExecutionLiveViewEligible =
    currentExecutionStatus === "running"
    && Boolean(testEngineLiveViewUrl)
    && (selectedExecutionAppTypeKind === "web" || selectedExecutionAppTypeKind === "unified");
  const isExecutionStarted = currentExecutionStatus === "running";
  const isExecutionLocked =
    currentExecutionStatus === "completed" || currentExecutionStatus === "failed" || currentExecutionStatus === "aborted";
  const snapshotCases = useMemo(
    () => ((selectedExecution?.case_snapshots || []).slice().sort((left, right) => left.sort_order - right.sort_order)),
    [selectedExecution?.case_snapshots]
  );
  const snapshotSteps = selectedExecution?.step_snapshots || [];
  const hasExecutionLevelTestData = Boolean(selectedExecution?.test_data_set);
  const selectedExecutionCaseSnapshot = useMemo(
    () => snapshotCases.find((snapshot) => snapshot.test_case_id === selectedTestCaseId) || null,
    [selectedTestCaseId, snapshotCases]
  );
  const executionInputParameterValues = useMemo(
    () => buildExecutionInputParameterValues(selectedExecution, selectedExecutionCaseSnapshot),
    [selectedExecution, selectedExecutionCaseSnapshot]
  );
  const selectedExecutionInputParameterEntries = useMemo(
    () => buildExecutionParameterDisplayEntries(executionInputParameterValues, "input"),
    [executionInputParameterValues]
  );

  useEffect(() => {
    setExecutionAssignmentDraftIds(selectedExecution?.assigned_to_ids?.length ? selectedExecution.assigned_to_ids : selectedExecution?.assigned_to ? [selectedExecution.assigned_to] : []);
  }, [selectedExecution?.assigned_to, selectedExecution?.assigned_to_ids, selectedExecution?.id]);

  useEffect(() => {
    if (currentExecutionStatus !== "running") {
      setLiveNow(Date.now());
      return;
    }

    const timer = window.setInterval(() => setLiveNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [currentExecutionStatus, selectedExecutionId]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const query = window.matchMedia("(pointer: fine) and (min-width: 769px)");
    const sync = () => setSupportsLocalDesktopExecution(query.matches);
    sync();
    query.addEventListener("change", sync);

    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    setCaseTimerStartedAtById({});
  }, [selectedExecutionId]);

  useEffect(() => {
    setExpandedExecutionSuiteIds([]);
    setExecutionSuiteSearch("");
    setExecutionCaseSearch("");
  }, [selectedExecutionId]);

  useEffect(() => {
    if (!selectedExecution) {
      return;
    }

    if (selectedExecution.project_id && selectedExecution.project_id !== projectId) {
      setSelectedExecutionId("");
      setFocusedSuiteId("");
      setSelectedTestCaseId("");
      syncExecutionSearchParams("", null);
      return;
    }

    if (selectedExecution.app_type_id && selectedExecution.app_type_id !== appTypeId) {
      setAppTypeId(selectedExecution.app_type_id);
    }
  }, [appTypeId, projectId, selectedExecution, setProjectId]);

  useEffect(() => {
    setExpandedExecutionStepGroupIds([]);
  }, [selectedExecutionId, selectedTestCaseId]);

  useEffect(() => {
    setExpandedExecutionStepIds([]);
  }, [selectedExecutionId, selectedTestCaseId]);

  useEffect(() => {
    setIsExecutionInputParamsExpanded(false);
    setIsExecutionOutputParamsExpanded(false);
    setIsExecutionReferencesExpanded(false);
    setIsExecutionAiAnalysisExpanded(false);
  }, [selectedExecutionId, selectedTestCaseId]);

  const executionSuites = useMemo<ExecutionSuiteNode[]>(
    () => selectedExecutionSuites.map((suite) => ({ id: suite.id, name: suite.name })),
    [selectedExecutionSuites]
  );

  const displayCasesBySuiteId = useMemo(() => {
    return snapshotCases.reduce<Record<string, ExecutionCaseView[]>>((groups, snapshot) => {
      const suiteId = snapshot.suite_id || "unsorted";
      groups[suiteId] = groups[suiteId] || [];
      groups[suiteId].push(toCaseView(snapshot));
      return groups;
    }, {});
  }, [snapshotCases]);

  const executionCaseOrder = useMemo(
    () => snapshotCases.map(toCaseView),
    [snapshotCases]
  );

  const stepsByCaseId = useMemo(() => {
    return snapshotSteps.reduce<Record<string, TestStep[]>>((groups, snapshot) => {
      groups[snapshot.test_case_id] = groups[snapshot.test_case_id] || [];
      groups[snapshot.test_case_id].push(toStepView(snapshot));
      return groups;
    }, {});
  }, [snapshotSteps]);

  const selectedSteps = useMemo(
    () => (stepsByCaseId[selectedTestCaseId] || []).slice().sort((left, right) => left.step_order - right.step_order),
    [selectedTestCaseId, stepsByCaseId]
  );
  const executionStepBlocks = useMemo<ExecutionStepBlock[]>(
    () =>
      selectedSteps.reduce<ExecutionStepBlock[]>((blocks, step) => {
        const previousBlock = blocks[blocks.length - 1];

        if (step.group_id && previousBlock?.groupId === step.group_id) {
          previousBlock.steps.push(step);
          return blocks;
        }

        blocks.push({
          key: step.group_id ? `group-${step.group_id}` : `step-${step.id}`,
          groupId: step.group_id || null,
          groupName: step.group_name || null,
          groupKind: step.group_kind || null,
          steps: [step]
        });

        return blocks;
      }, []),
    [selectedSteps]
  );
  const executionStepGroupIds = useMemo(
    () => executionStepBlocks.map((block) => block.groupId).filter((groupId): groupId is string => Boolean(groupId)),
    [executionStepBlocks]
  );

  useEffect(() => {
    setExecutionStepViewMode("manual");
  }, [selectedExecutionId, selectedTestCaseId]);

  useEffect(() => {
    const requestedTestCaseId = searchParams.get("testCase");

    if (requestedTestCaseId && executionCaseOrder.some((testCase) => testCase.id === requestedTestCaseId)) {
      const requestedSuiteId = executionCaseOrder.find((testCase) => testCase.id === requestedTestCaseId)?.suite_id;

      if (requestedSuiteId) {
        setFocusedSuiteId(requestedSuiteId);
      }

      if (selectedTestCaseId !== requestedTestCaseId) {
        setSelectedTestCaseId(requestedTestCaseId);
      }
      return;
    }

    if (selectedTestCaseId && executionCaseOrder.some((testCase) => testCase.id === selectedTestCaseId)) {
      const selectedSuiteId = executionCaseOrder.find((testCase) => testCase.id === selectedTestCaseId)?.suite_id;
      if (selectedSuiteId && focusedSuiteId !== selectedSuiteId) {
        setFocusedSuiteId(selectedSuiteId);
      }
      return;
    }

    if (selectedTestCaseId) {
      setSelectedTestCaseId("");
    }
  }, [executionCaseOrder, focusedSuiteId, searchParams, selectedTestCaseId]);

  useEffect(() => {
    if (!executionSuites.length) {
      setFocusedSuiteId("");
      return;
    }

    setFocusedSuiteId((current) => (current && executionSuites.some((suite) => suite.id === current) ? current : ""));
  }, [executionSuites]);

  useEffect(() => {
    const validSuiteIds = new Set(executionSuites.map((suite) => suite.id));
    setExpandedExecutionSuiteIds((current) => current.filter((suiteId) => validSuiteIds.has(suiteId)));
  }, [executionSuites]);

  useEffect(() => {
    const validGroupIds = new Set(executionStepGroupIds);
    setExpandedExecutionStepGroupIds((current) => current.filter((groupId) => validGroupIds.has(groupId)));
  }, [executionStepGroupIds]);

  useEffect(() => {
    if (!selectedTestCaseId || !focusedSuiteId) {
      return;
    }

    setExpandedExecutionSuiteIds((current) =>
      current.includes(focusedSuiteId) ? current : [...current, focusedSuiteId]
    );
  }, [focusedSuiteId, selectedTestCaseId]);

  useEffect(() => {
    setBulkSelectedStepIds([]);
    setActiveTab("overview");
    closeExecutionEvidence();
    setExecutionApiDetailState(null);
    setRunningExecutionApiStepId("");
  }, [selectedExecutionId, selectedTestCaseId]);

  useEffect(() => {
    setIsExecutionContextModalOpen(false);
  }, [selectedExecutionId]);

  const resultByCaseId = useMemo(() => {
    const map: Record<string, ExecutionResult> = {};
    executionResults.forEach((result) => {
      if (!map[result.test_case_id]) {
        map[result.test_case_id] = result;
      }
    });
    return map;
  }, [executionResults]);

  const selectedCaseLogs = useMemo(
    () => parseExecutionLogs(resultByCaseId[selectedTestCaseId]?.logs || null),
    [resultByCaseId, selectedTestCaseId]
  );
  const selectedCaseAiAnalysis = selectedCaseLogs.aiAnalysis || null;

  const stepStatuses = selectedCaseLogs.stepStatuses || {};
  const stepNotes = selectedCaseLogs.stepNotes || {};
  const stepEvidence = selectedCaseLogs.stepEvidence || {};
  const stepDefects = selectedCaseLogs.stepDefects || {};
  const stepApiDetails = selectedCaseLogs.stepApiDetails || {};
  const stepWebDetails = selectedCaseLogs.stepWebDetails || {};
  const stepAutomationDetails = selectedCaseLogs.stepAutomationDetails || {};
  const hasSelectedStepAutomationCode = useMemo(
    () =>
      selectedSteps.some((step) =>
        (
          stepAutomationDetails[step.id]?.code
          || step.automation_code
          || (step.step_type === "api" && step.api_request ? resolveStepAutomationCode(step) : "")
        ).trim()
      ),
    [selectedSteps, stepAutomationDetails]
  );
  const stepCaptures = useMemo(
    () => mergeExecutionStepCaptures(selectedCaseLogs.stepCaptures || {}, stepApiDetails),
    [selectedCaseLogs.stepCaptures, stepApiDetails]
  );
  const executionOutputParameterValues = useMemo(
    () => collectExecutionOutputParameterValues(stepCaptures, selectedSteps),
    [selectedSteps, stepCaptures]
  );
  const suiteExecutionOutputParameterValues = useMemo(
    () => collectSuiteScopedExecutionOutputParameterValues(resultByCaseId, snapshotCases, selectedTestCaseId),
    [resultByCaseId, selectedTestCaseId, snapshotCases]
  );
  const selectedExecutionOutputParameterEntries = useMemo(
    () => buildExecutionOutputParameterEntries(stepCaptures, selectedSteps),
    [selectedSteps, stepCaptures]
  );
  const executionStepParameterValues = useMemo(
    () => combineStepParameterValues(executionInputParameterValues, suiteExecutionOutputParameterValues, executionOutputParameterValues),
    [executionInputParameterValues, executionOutputParameterValues, suiteExecutionOutputParameterValues]
  );

  const caseDerivedStatus = (testCase: ExecutionCaseView): ExecutionResult["status"] | "queued" => {
    const result = resultByCaseId[testCase.id];
    return result?.status || "queued";
  };

  const suiteMetrics = useMemo(() => {
    return executionSuites.map((suite) => {
      const scopedCases = displayCasesBySuiteId[suite.id] || [];
      const passedCount = scopedCases.filter((testCase) => caseDerivedStatus(testCase) === "passed").length;
      const failedCount = scopedCases.filter((testCase) => caseDerivedStatus(testCase) === "failed").length;
      const blockedCount = scopedCases.filter((testCase) => ["blocked", "running"].includes(caseDerivedStatus(testCase))).length;
      const percent = scopedCases.length
        ? Math.round(((passedCount + failedCount + blockedCount) / scopedCases.length) * 100)
        : 0;

      return {
        suiteId: suite.id,
        count: scopedCases.length,
        passedCount,
        failedCount,
        blockedCount,
        percent,
        status: failedCount ? "failed" : blockedCount ? "running" : percent === 100 ? "completed" : "queued"
      };
    });
  }, [displayCasesBySuiteId, executionSuites, resultByCaseId]);

  const executionProgress = useMemo(() => {
    const totalCases = executionCaseOrder.length;
    const passedCount = executionCaseOrder.filter((testCase) => caseDerivedStatus(testCase) === "passed").length;
    const failedCount = executionCaseOrder.filter((testCase) => caseDerivedStatus(testCase) === "failed").length;
    const blockedCount = executionCaseOrder.filter((testCase) => ["blocked", "running"].includes(caseDerivedStatus(testCase))).length;
    const percent = totalCases ? Math.round(((passedCount + failedCount + blockedCount) / totalCases) * 100) : 0;

    return {
      totalCases,
      passedCount,
      failedCount,
      blockedCount,
      completedCases: passedCount + failedCount + blockedCount,
      percent,
      derivedStatus: failedCount ? "failed" : blockedCount ? "running" : percent === 100 ? "completed" : "queued"
    };
  }, [executionCaseOrder, resultByCaseId]);

  const executionStatusCounts = useMemo(() => {
    return executionCaseOrder.reduce(
      (summary, testCase) => {
        const status = caseDerivedStatus(testCase);
        summary[status] = (summary[status] || 0) + 1;
        return summary;
      },
      { queued: 0, running: 0, passed: 0, failed: 0, blocked: 0 } as Record<string, number>
    );
  }, [executionCaseOrder, resultByCaseId]);

  const blockingCases = useMemo(
    () => executionCaseOrder.filter((testCase) => ["failed", "blocked", "running"].includes(caseDerivedStatus(testCase))).slice(0, 8),
    [executionCaseOrder, resultByCaseId]
  );

  const focusedExecutionSuite = useMemo(
    () => executionSuites.find((suite) => suite.id === focusedSuiteId) || null,
    [executionSuites, focusedSuiteId]
  );

  const executionSummaryById = useMemo(() => {
    const summary: Record<string, ExecutionRunSummary> = {};

    allExecutionResults.forEach((result) => {
      summary[result.execution_id] = summary[result.execution_id] || { ...EMPTY_EXECUTION_RUN_SUMMARY };
      summary[result.execution_id].total += 1;
      if (result.status === "passed") {
        summary[result.execution_id].passed += 1;
      } else if (result.status === "failed") {
        summary[result.execution_id].failed += 1;
      } else if (result.status === "blocked") {
        summary[result.execution_id].blocked += 1;
      }

      if (typeof result.duration_ms === "number") {
        summary[result.execution_id].timedCount += 1;
        summary[result.execution_id].totalDurationMs += result.duration_ms;
      }

      if (result.created_at && (!summary[result.execution_id].latestActivityAt || result.created_at > summary[result.execution_id].latestActivityAt!)) {
        summary[result.execution_id].latestActivityAt = result.created_at;
      }
    });

    Object.values(summary).forEach((item) => {
      item.passRate = item.total ? Math.round((item.passed / item.total) * 100) : 0;
      item.avgDurationMs = item.timedCount ? Math.round(item.totalDurationMs / item.timedCount) : null;
    });

    return summary;
  }, [allExecutionResults]);

  const executionImpactSummaryById = useMemo(() => {
    const resultByExecutionCaseId = new Map<string, ExecutionResult>();

    allExecutionResults.forEach((result) => {
      const key = `${result.execution_id}:${result.test_case_id}`;
      if (!resultByExecutionCaseId.has(key)) {
        resultByExecutionCaseId.set(key, result);
      }
    });

    return executions.reduce<Record<string, ExecutionRunImpactSummary>>((summary, execution) => {
      const requirementStats = new Map<string, { totalCases: Set<string>; failedCases: Set<string> }>();
      const failedCases: ExecutionRunImpactSummary["failedCases"] = [];

      (execution.case_snapshots || []).forEach((snapshot) => {
        const linkedCase = smartExecutionLibraryCaseById.get(snapshot.test_case_id);
        const requirementIds = [...new Set([...(linkedCase?.requirement_ids || []), linkedCase?.requirement_id].filter(Boolean))] as string[];
        const result = resultByExecutionCaseId.get(`${execution.id}:${snapshot.test_case_id}`);
        const status = result?.status || "queued";

        requirementIds.forEach((requirementId) => {
          const stats = requirementStats.get(requirementId) || { totalCases: new Set<string>(), failedCases: new Set<string>() };
          stats.totalCases.add(snapshot.test_case_id);
          if (["failed", "blocked"].includes(status)) {
            stats.failedCases.add(snapshot.test_case_id);
          }
          requirementStats.set(requirementId, stats);
        });

        if (["failed", "blocked"].includes(status)) {
          failedCases.push({
            id: snapshot.test_case_id,
            title: snapshot.test_case_title,
            status,
            priority: snapshot.priority,
            suiteId: snapshot.suite_id,
            suiteName: snapshot.suite_name,
            requirementIds,
            requirementTitles: requirementIds.map((requirementId) => requirementById.get(requirementId)?.title || requirementId),
            error: result?.error || null
          });
        }
      });

      const impactedRequirements = Array.from(requirementStats.entries())
        .map(([requirementId, stats]) => {
          const totalCases = stats.totalCases.size;
          const failedRequirementCases = stats.failedCases.size;
          return {
            id: requirementId,
            title: requirementById.get(requirementId)?.title || requirementId,
            priority: requirementById.get(requirementId)?.priority ?? null,
            totalCases,
            failedCases: failedRequirementCases,
            failureRate: totalCases ? Math.round((failedRequirementCases / totalCases) * 100) : 0
          };
        })
        .sort((left, right) => {
          if (right.failedCases !== left.failedCases) return right.failedCases - left.failedCases;
          if ((left.priority || 99) !== (right.priority || 99)) return (left.priority || 99) - (right.priority || 99);
          return left.title.localeCompare(right.title);
        });

      const totalCases = execution.case_snapshots?.length || 0;
      summary[execution.id] = {
        failedCases,
        impactedRequirements,
        totalRequirements: impactedRequirements.length,
        failedRequirementCount: impactedRequirements.filter((requirement) => requirement.failedCases > 0).length,
        failureRate: totalCases ? Math.round((failedCases.length / totalCases) * 100) : 0
      };

      return summary;
    }, {});
  }, [allExecutionResults, executions, requirementById, smartExecutionLibraryCaseById]);

  const selectedExecutionImpactSummary = selectedExecution
    ? executionImpactSummaryById[selectedExecution.id] || EMPTY_EXECUTION_RUN_IMPACT_SUMMARY
    : EMPTY_EXECUTION_RUN_IMPACT_SUMMARY;

  const selectedSuiteImpactSummaryById = useMemo(() => {
    if (!selectedExecution) {
      return {};
    }

    return executionSuites.reduce<Record<string, ExecutionRunImpactSummary>>((summary, suite) => {
      const requirementStats = new Map<string, { totalCases: Set<string>; failedCases: Set<string> }>();
      const failedCases: ExecutionRunImpactSummary["failedCases"] = [];
      const suiteCases = displayCasesBySuiteId[suite.id] || [];

      suiteCases.forEach((testCase) => {
        const linkedCase = smartExecutionLibraryCaseById.get(testCase.id);
        const requirementIds = [...new Set([...(linkedCase?.requirement_ids || []), linkedCase?.requirement_id].filter(Boolean))] as string[];
        const status = caseDerivedStatus(testCase);

        requirementIds.forEach((requirementId) => {
          const stats = requirementStats.get(requirementId) || { totalCases: new Set<string>(), failedCases: new Set<string>() };
          stats.totalCases.add(testCase.id);
          if (["failed", "blocked"].includes(status)) {
            stats.failedCases.add(testCase.id);
          }
          requirementStats.set(requirementId, stats);
        });

        if (["failed", "blocked"].includes(status)) {
          failedCases.push({
            id: testCase.id,
            title: testCase.title,
            status,
            priority: testCase.priority,
            suiteId: suite.id,
            suiteName: suite.name,
            requirementIds,
            requirementTitles: requirementIds.map((requirementId) => requirementById.get(requirementId)?.title || requirementId),
            error: resultByCaseId[testCase.id]?.error || null
          });
        }
      });

      const impactedRequirements = Array.from(requirementStats.entries())
        .map(([requirementId, stats]) => {
          const totalCases = stats.totalCases.size;
          const failedRequirementCases = stats.failedCases.size;
          return {
            id: requirementId,
            title: requirementById.get(requirementId)?.title || requirementId,
            priority: requirementById.get(requirementId)?.priority ?? null,
            totalCases,
            failedCases: failedRequirementCases,
            failureRate: totalCases ? Math.round((failedRequirementCases / totalCases) * 100) : 0
          };
        })
        .sort((left, right) => {
          if (right.failedCases !== left.failedCases) return right.failedCases - left.failedCases;
          if ((left.priority || 99) !== (right.priority || 99)) return (left.priority || 99) - (right.priority || 99);
          return left.title.localeCompare(right.title);
        });

      summary[suite.id] = {
        failedCases,
        impactedRequirements,
        totalRequirements: impactedRequirements.length,
        failedRequirementCount: impactedRequirements.filter((requirement) => requirement.failedCases > 0).length,
        failureRate: suiteCases.length ? Math.round((failedCases.length / suiteCases.length) * 100) : 0
      };

      return summary;
    }, {});
  }, [displayCasesBySuiteId, executionSuites, requirementById, resultByCaseId, selectedExecution, smartExecutionLibraryCaseById]);

  const executionById = useMemo(
    () =>
      executions.reduce<Record<string, Execution>>((accumulator, execution) => {
        accumulator[execution.id] = execution;
        return accumulator;
      }, {}),
    [executions]
  );

  const resolvePersistedCaseDurationMs = (testCaseId: string, existing?: ExecutionResult) => {
    const startedAt =
      caseTimerStartedAtById[testCaseId] ||
      toTimestamp(existing?.created_at) ||
      toTimestamp(selectedExecution?.started_at);

    if (!startedAt) {
      return existing?.duration_ms ?? null;
    }

    const computed = Math.max(Date.now() - startedAt, 0);
    return typeof existing?.duration_ms === "number" ? Math.max(existing.duration_ms, computed) : computed;
  };

  const refreshExecutionScope = async (executionId = selectedExecutionId) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["executions"] }),
      queryClient.invalidateQueries({ queryKey: ["executions", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["execution-results", executionId] }),
      queryClient.invalidateQueries({ queryKey: ["execution", executionId] }),
      queryClient.invalidateQueries({ queryKey: ["execution-results"] }),
      queryClient.invalidateQueries({ queryKey: ["workspace-transactions"] })
    ]);

    await Promise.all([
      executionsQuery.refetch(),
      allExecutionResultsQuery.refetch(),
      executionId
        ? queryClient.fetchQuery({
            queryKey: ["execution", executionId],
            queryFn: () => api.executions.get(executionId)
          })
        : Promise.resolve(),
      executionId
        ? queryClient.fetchQuery({
            queryKey: ["execution-results", executionId],
            queryFn: () => api.executionResults.list({ execution_id: executionId })
          })
        : Promise.resolve(),
      workspaceTransactionsQuery.refetch()
    ]);
  };

  const patchExecutionCache = (executionId: string, patch: Partial<Execution>) => {
    queryClient.setQueryData<Execution>(["execution", executionId], (current) =>
      current ? { ...current, ...patch } : current
    );
    queryClient.setQueriesData<Execution[]>({ queryKey: ["executions"] }, (current) =>
      Array.isArray(current)
        ? current.map((execution) => (execution.id === executionId ? { ...execution, ...patch } : execution))
        : current
    );
  };

  const scheduleExecutionRefresh = (executionId: string) => {
    if (typeof window === "undefined") {
      return;
    }

    window.setTimeout(() => void refreshExecutionScope(executionId), 750);
    window.setTimeout(() => void refreshExecutionScope(executionId), 2500);
  };

  const refreshExecutionSchedules = async () => {
    await queryClient.invalidateQueries({ queryKey: ["execution-schedules"] });
  };

  const handleSaveExecutionAssignment = async () => {
    if (!selectedExecution) {
      return;
    }

    try {
      await updateExecutionAssignment.mutateAsync({
        id: selectedExecution.id,
        assigned_to_ids: executionAssignmentDraftIds
      });
      await refreshExecutionScope(selectedExecution.id);
      showSuccess(
        executionAssignmentDraftIds.length
          ? "Run assignees updated. Unoverridden test cases now follow the primary tester."
          : "Run assignees cleared."
      );
    } catch (error) {
      showError(error, "Unable to update run assignee");
    }
  };

  const handleSaveCaseAssignment = async () => {
    if (!selectedExecution || !selectedExecutionCase) {
      return;
    }

    try {
      await updateExecutionCaseAssignment.mutateAsync({
        executionId: selectedExecution.id,
        testCaseId: selectedExecutionCase.id,
        assigned_to: caseAssignmentDraft || ""
      });
      await refreshExecutionScope(selectedExecution.id);
      showSuccess(
        caseAssignmentDraft
          ? "Test case assignee updated for this run."
          : selectedExecution.assigned_user
            ? "Test case assignee reset to the run owner."
            : "Test case assignee cleared."
      );
    } catch (error) {
      showError(error, "Unable to update test case assignee");
    }
  };

  const handleSaveCaseReferences = async () => {
    if (!selectedExecution || !selectedExecutionCase || !selectedExecution.app_type_id) {
      return;
    }

    const externalReferences = parseReferenceList(caseReferenceDraft);
    const defects = parseReferenceList(caseDefectDraft);
    const currentStatus = selectedExecutionResult?.status || (Object.keys(stepStatuses).length ? selectedCaseStatusLabel : "running");
    const safeStatus: ExecutionResult["status"] =
      currentStatus === "passed" || currentStatus === "failed" || currentStatus === "blocked" || currentStatus === "running"
        ? currentStatus
        : "running";

    try {
      if (selectedExecutionResult) {
        await updateResult.mutateAsync({
          id: selectedExecutionResult.id,
          input: {
            external_references: externalReferences,
            defects
          }
        });
        queryClient.setQueryData<ExecutionResult[]>(["execution-results", selectedExecution.id], (current = []) =>
          current.map((item) => item.id === selectedExecutionResult.id ? { ...item, external_references: externalReferences, defects } : item)
        );
      } else {
        const response = await createResult.mutateAsync({
          execution_id: selectedExecution.id,
          test_case_id: selectedExecutionCase.id,
          app_type_id: selectedExecution.app_type_id,
          status: safeStatus,
          duration_ms: selectedCaseDurationMs ?? undefined,
          logs: stringifyExecutionLogs(selectedCaseLogs),
          external_references: externalReferences,
          defects,
          executed_by: session!.user.id
        });

        queryClient.setQueryData<ExecutionResult[]>(["execution-results", selectedExecution.id], (current = []) => [
          {
            id: response.id,
            execution_id: selectedExecution.id,
            test_case_id: selectedExecutionCase.id,
            test_case_title: selectedExecutionCase.title,
            suite_id: selectedExecutionCase.suite_id,
            suite_name: selectedExecutionCase.suite_name,
            app_type_id: selectedExecution.app_type_id || "",
            status: safeStatus,
            duration_ms: selectedCaseDurationMs,
            error: null,
            logs: stringifyExecutionLogs(selectedCaseLogs),
            external_references: externalReferences,
            defects,
            executed_by: session!.user.id
          },
          ...current
        ]);
      }

      await refreshExecutionScope(selectedExecution.id);
      showSuccess("Execution references updated.");
    } catch (error) {
      showError(error, "Unable to update execution references");
    }
  };

  const handleFinalizeExecution = async (mode: "complete" | "abort") => {
    if (!selectedExecution) {
      return;
    }

    const status = mode === "abort" ? "aborted" : executionProgress.failedCount ? "failed" : "completed";
    const failureMessage = mode === "abort" ? "Unable to abort run" : "Unable to complete run";

    setExecutionFinalizeAction(mode);

    try {
      await completeExecution.mutateAsync({ id: selectedExecution.id, status });
      patchExecutionCache(selectedExecution.id, {
        status,
        ended_at: new Date().toISOString()
      });
      scheduleExecutionRefresh(selectedExecution.id);
      await refreshExecutionScope(selectedExecution.id);
    } catch (error) {
      showError(error, failureMessage);
    } finally {
      setExecutionFinalizeAction(null);
    }
  };

  const handlePreviewSmartExecution = async () => {
    if (!projectId || !appTypeId) {
      setSmartExecutionPreviewTone("error");
      setSmartExecutionPreviewMessage("Choose a project and app type before generating an AI smart run.");
      return;
    }

    if (!smartExecutionReleaseScope.trim() && !smartExecutionAdditionalContext.trim() && !selectedSmartRequirementIds.length) {
      setSmartExecutionPreviewTone("error");
      setSmartExecutionPreviewMessage("Select impacted requirements, add release scope, or add context so AI can identify impacted test coverage.");
      return;
    }

    try {
      const response = await previewSmartExecution.mutateAsync({
        project_id: projectId,
        app_type_id: appTypeId,
        integration_id: smartExecutionIntegrationId || undefined,
        release_scope: smartExecutionReleaseScope || undefined,
        additional_context: smartExecutionAdditionalContext || undefined,
        impacted_requirement_ids: selectedSmartRequirementIds.length ? selectedSmartRequirementIds : undefined,
        test_environment_id: selectedExecutionEnvironmentId || undefined,
        test_configuration_id: selectedExecutionConfigurationId || undefined,
        test_data_set_id: selectedExecutionDataSetId || undefined
      });

      setSmartExecutionPreview(response);
      setSelectedSmartExecutionCaseIds(
        response.cases
          .filter((testCase) => executionStartMode === "manual" || smartExecutionLibraryCaseById.get(testCase.test_case_id)?.automated === "yes")
          .map((testCase) => testCase.test_case_id)
      );
      setExecutionName(response.execution_name || executionName);
      setSmartExecutionPreviewTone("success");
      setSmartExecutionPreviewMessage(
        response.cases.length
          ? `${response.matched_case_count} impacted case${response.matched_case_count === 1 ? "" : "s"} identified from ${response.source_case_count} existing case${response.source_case_count === 1 ? "" : "s"} using ${response.integration.name}${selectedSmartRequirementIds.length ? ` and ${selectedSmartRequirementIds.length} selected requirement${selectedSmartRequirementIds.length === 1 ? "" : "s"}` : ""}.`
          : `No impacted cases were identified using ${response.integration.name}. Refine the release scope, add context, or try a narrower requirement filter.`
      );
    } catch (error) {
      resetSmartExecutionPreview();
      setSmartExecutionPreviewTone("error");
      setSmartExecutionPreviewMessage(error instanceof Error ? error.message : "Unable to generate a smart run preview");
    }
  };

  const handleCreateExecution = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!session?.user.id) {
      setMessageTone("error");
      setMessage("You need an active session before creating a run.");
      return;
    }

    const selectedSmartCaseIds = selectedSmartExecutableCaseIds;

	    if (executionCreateMode === "smart" && !selectedSmartCaseIds.length) {
	      setMessageTone("error");
	      setMessage(
        executionStartMode === "manual"
          ? "Select at least one impacted test case before creating an AI smart run."
          : "Select at least one automated impacted case before creating a Test Engine smart run."
      );
	      return;
	    }

	    const canCreateSelectedRunMode = executionStartMode === "local"
	      ? canRunLocalAutomation
	      : executionStartMode === "remote"
	        ? canRunRemoteAutomation
	        : canCreateManualRuns;

	    if (!canCreateSelectedRunMode) {
	      showError(
	        new Error(
	          executionStartMode === "local"
	            ? "Permission required: automation.run.local"
	            : executionStartMode === "remote"
	              ? "Permission required: automation.run.remote"
	              : "Permission required: run.create"
	        ),
	        "Unable to create run"
	      );
	      return;
	    }

	    const executionHooks = executionHookDraft.map((hook, index) => {
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

    try {
      const response = await createExecution.mutateAsync({
        project_id: projectId,
        app_type_id: appTypeId || undefined,
        suite_ids: executionCreateMode === "manual" ? selectedSuiteIds : undefined,
        test_case_ids: executionCreateMode === "smart" ? selectedSmartCaseIds : undefined,
        test_environment_id: selectedExecutionEnvironmentId || undefined,
        test_configuration_id: selectedExecutionConfigurationId || undefined,
        test_data_set_id: selectedExecutionDataSetId || undefined,
        execution_hooks: executionHooks.length ? executionHooks : undefined,
        parallel_enabled: executionParallelEnabled,
        parallel_count: executionParallelEnabled ? executionParallelCount : 1,
        execution_mode: executionStartMode,
        engine_base_url: executionStartMode === "local" ? "http://host.docker.internal:4301" : undefined,
        assigned_to_ids: selectedExecutionAssigneeIds.length ? selectedExecutionAssigneeIds : undefined,
        release: executionRelease.trim() || undefined,
        sprint: executionSprint.trim() || undefined,
        build: executionBuild.trim() || undefined,
        name: executionName || undefined,
        created_by: session.user.id
      });

      closeExecutionBuilder();
      focusExecution(response.id);
      setFocusedSuiteId("");
      if (executionStartMode !== "manual") {
        patchExecutionCache(response.id, {
          status: "running",
          started_at: new Date().toISOString(),
          trigger: executionStartMode === "local" ? "local" : "ci"
        });
        scheduleExecutionRefresh(response.id);
      }
      showSuccess(
        executionCreateMode === "smart"
          ? `AI smart run created with ${selectedSmartCaseIds.length} impacted case${selectedSmartCaseIds.length === 1 ? "" : "s"} under Default.`
          : executionStartMode === "manual"
            ? "Manual run created from a snapshot of the selected suites."
            : `Automation run created and started ${executionStartMode === "local" ? "locally" : "remotely"}.`
      );
      await refreshExecutionScope(response.id);
    } catch (error) {
      showError(error, "Unable to create run");
    }
  };

  const handleSubmitExecutionSchedule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!session?.user.id) {
      showError(
        new Error(`You need an active session before ${scheduleModalMode === "edit" ? "editing" : "creating"} a schedule.`),
        scheduleModalMode === "edit" ? "Unable to update schedule" : "Unable to create schedule"
      );
      return;
    }

    if (!projectId || !appTypeId) {
      showError(
        new Error(`Choose a project and app type before ${scheduleModalMode === "edit" ? "editing" : "creating"} a schedule.`),
        scheduleModalMode === "edit" ? "Unable to update schedule" : "Unable to create schedule"
      );
      return;
    }

    if (!selectedSuiteIds.length) {
      showError(
        new Error("Select at least one suite to schedule."),
        scheduleModalMode === "edit" ? "Unable to update schedule" : "Unable to create schedule"
      );
      return;
    }

    if (!scheduleNextRunAt) {
      showError(
        new Error("Choose the first run time for this schedule."),
        scheduleModalMode === "edit" ? "Unable to update schedule" : "Unable to create schedule"
      );
      return;
    }

    const cadencePayload = scheduleCadence === "interval_minutes"
      ? buildIntervalCadence(scheduleIntervalMinutes)
      : scheduleCadence;

    try {
      if (scheduleModalMode === "edit") {
        if (!editingScheduleId) {
          throw new Error("Select a schedule to edit.");
        }

        await updateExecutionSchedule.mutateAsync({
          id: editingScheduleId,
          input: {
            project_id: projectId,
            app_type_id: appTypeId,
            name: executionName || undefined,
            cadence: cadencePayload,
            next_run_at: new Date(scheduleNextRunAt).toISOString(),
            suite_ids: selectedSuiteIds,
            test_environment_id: selectedExecutionEnvironmentId || "",
            test_configuration_id: selectedExecutionConfigurationId || "",
            test_data_set_id: selectedExecutionDataSetId || "",
            release: executionRelease.trim() || "",
            sprint: executionSprint.trim() || "",
            build: executionBuild.trim() || "",
            assigned_to_ids: selectedExecutionAssigneeIds
          }
        });
      } else {
        await createExecutionSchedule.mutateAsync({
          project_id: projectId,
          app_type_id: appTypeId,
          name: executionName || undefined,
          cadence: cadencePayload,
          next_run_at: new Date(scheduleNextRunAt).toISOString(),
          suite_ids: selectedSuiteIds,
          test_environment_id: selectedExecutionEnvironmentId || undefined,
          test_configuration_id: selectedExecutionConfigurationId || undefined,
          test_data_set_id: selectedExecutionDataSetId || undefined,
          release: executionRelease.trim() || undefined,
          sprint: executionSprint.trim() || undefined,
          build: executionBuild.trim() || undefined,
          assigned_to_ids: selectedExecutionAssigneeIds.length ? selectedExecutionAssigneeIds : undefined,
          created_by: session.user.id
        });
      }

      closeScheduleBuilder();
      setTestRunsView("scheduled-runs");
      await refreshExecutionSchedules();
      if (editingScheduleId) {
        setSelectedScheduleId(editingScheduleId);
      }
      showSuccess(scheduleModalMode === "edit" ? "Scheduled run updated." : "Scheduled run created.");
    } catch (error) {
      showError(error, scheduleModalMode === "edit" ? "Unable to update schedule" : "Unable to create schedule");
    }
  };

  const handleRerunExecutionItem = async (execution: Execution, failedOnly: boolean) => {
    if (!session?.user.id) {
      return;
    }

    try {
      const response = await rerunExecution.mutateAsync({
        id: execution.id,
        input: {
          failed_only: failedOnly,
          created_by: session.user.id
        }
      });

      focusExecution(response.id);
      await refreshExecutionScope(response.id);
      showSuccess(failedOnly ? "Failed cases were queued into a fresh rerun run." : "A fresh rerun was created with the same run context.");
    } catch (error) {
      showError(error, failedOnly ? "Unable to rerun failed cases" : "Unable to create rerun");
    }
  };

	  const handleStartSelectedExecution = async (mode: "manual" | "remote" | "local" = "manual") => {
	    if (!selectedExecution) {
	      return;
	    }

	    const hasModeAccess = mode === "local"
	      ? canRunLocalAutomation
	      : mode === "remote"
	        ? canRunRemoteAutomation
	        : canCreateManualRuns;

	    if (!hasModeAccess) {
	      showError(
	        new Error(
	          mode === "local"
	            ? "Permission required: automation.run.local"
	            : mode === "remote"
	              ? "Permission required: automation.run.remote"
	              : "Permission required: run.create"
	        ),
	        "Unable to start run"
	      );
	      return;
	    }

	    try {
      const response = await startExecution.mutateAsync({
        id: selectedExecution.id,
        options: mode === "local"
          ? { execution_mode: "local", engine_base_url: "http://host.docker.internal:4301" }
          : mode === "remote"
            ? { execution_mode: "remote" }
            : undefined
      });
      patchExecutionCache(selectedExecution.id, {
        status: "running",
        started_at: new Date().toISOString(),
        trigger: mode === "local" ? "local" : mode === "remote" ? "ci" : selectedExecution.trigger || "manual"
      });
      scheduleExecutionRefresh(selectedExecution.id);
      await refreshExecutionScope(selectedExecution.id);
      showSuccess(summarizeExecutionStart(response));
    } catch (error) {
      showError(error, "Unable to start run");
    }
  };

  const handleDownloadExecutionReport = async () => {
    if (!selectedExecution) {
      return;
    }

    try {
      const blob = await downloadExecutionReport.mutateAsync(selectedExecution.id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${(selectedExecution.name || selectedExecution.id || "qaira-run-report").replace(/[^A-Za-z0-9._-]+/g, "-")}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      showSuccess("Run report PDF exported.");
    } catch (error) {
      showError(error, "Unable to export run report");
    }
  };

  const handleOpenReportEmailModal = () => {
    setReportEmailDraft(session?.user.email || "");
    setIsReportEmailModalOpen(true);
  };

  const handleReportSelectedExecutionIssue = () => {
    if (!selectedExecution) {
      return;
    }

    const params = new URLSearchParams();
    params.set("create", "1");
    params.set("run", selectedExecution.id);
    params.set("status", currentExecutionStatus);
    params.set("title", `Run bug: ${selectedExecution.name || selectedExecution.id}`);

    if (selectedExecution.name) {
      params.set("runName", selectedExecution.name);
    }

    if (selectedExecution.test_environment?.name) {
      params.set("environment", selectedExecution.test_environment.name);
    }

    if (selectedExecution.build) {
      params.set("build", selectedExecution.build);
    }

    params.set("message", [
      "Reported from run details.",
      "",
      `Run ID: ${selectedExecution.id}`,
      selectedExecution.name ? `Run name: ${selectedExecution.name}` : "",
      `Run status: ${currentExecutionStatus}`,
      `Run trigger: ${selectedExecution.trigger || "manual"}`,
      selectedExecution.test_environment?.name ? `Environment: ${selectedExecution.test_environment.name}` : "",
      selectedExecution.build ? `Build: ${selectedExecution.build}` : "",
      `Run totals: ${executionProgress.totalCases} cases, ${executionStatusCounts.failed} failed, ${executionStatusCounts.blocked} blocked`,
      "",
      "Bug details:"
    ].filter(Boolean).join("\n"));

    navigate(`/issues?${params.toString()}`);
  };

  const handleShareExecutionReport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedExecution) {
      return;
    }

    const recipients = reportEmailDraft
      .split(/[,\n;]/)
      .map((entry) => entry.trim())
      .filter(Boolean);

    if (!recipients.length) {
      showError(null, "Enter at least one report recipient.");
      return;
    }

    try {
      const response = await shareExecutionReport.mutateAsync({
        executionId: selectedExecution.id,
        recipients
      });
      setIsReportEmailModalOpen(false);
      showSuccess(`Run report emailed to ${response.recipients} recipient${response.recipients === 1 ? "" : "s"}.`);
    } catch (error) {
      showError(error, "Unable to email run report");
    }
  };

  const handleRerunExecution = async (failedOnly: boolean) => {
    if (!selectedExecution) {
      return;
    }

    await handleRerunExecutionItem(selectedExecution, failedOnly);
  };

  const handleRunExecutionSchedule = async (scheduleId: string) => {
    try {
      const response = await runExecutionSchedule.mutateAsync(scheduleId);
      focusExecution(response.id);
      await Promise.all([refreshExecutionScope(response.id), refreshExecutionSchedules()]);
      showSuccess("Scheduled run was launched as a fresh run.");
    } catch (error) {
      showError(error, "Unable to run the schedule");
    }
  };

  const handleDeleteExecutionSchedule = async (scheduleId: string, scheduleName: string) => {
    if (!(await confirmDelete({ message: `Delete schedule "${scheduleName}"?` }))) {
      return;
    }

    try {
      await deleteExecutionSchedule.mutateAsync(scheduleId);
      if (selectedScheduleId === scheduleId) {
        setSelectedScheduleId("");
      }
      await refreshExecutionSchedules();
      showSuccess("Scheduled run removed.");
    } catch (error) {
      showError(error, "Unable to delete schedule");
    }
  };

  const persistCaseResult = async (
    testCaseId: string,
    patches: {
      stepStatusesPatch?: Record<string, ExecutionStepStatus>;
      stepNotesPatch?: Record<string, string>;
      stepEvidencePatch?: Record<string, ExecutionStepEvidence | null>;
    },
    options: { refresh?: boolean } = {}
  ) => {
    const shouldRefresh = options.refresh !== false;
    const scopedAppTypeId = selectedExecution?.app_type_id;
    const currentCaseSnapshot = snapshotCases.find((snapshot) => snapshot.test_case_id === testCaseId);

    if (!selectedExecution || !testCaseId || !scopedAppTypeId || !currentCaseSnapshot) {
      return;
    }

    const fresh =
      queryClient.getQueryData<ExecutionResult[]>(["execution-results", selectedExecution.id]) || executionResults;
    const existing = fresh.find((item) => item.test_case_id === testCaseId);
    const prev = parseExecutionLogs(existing?.logs || null);
    const mergedStatuses = { ...(prev.stepStatuses || {}), ...(patches.stepStatusesPatch || {}) };
    const mergedNotes = { ...(prev.stepNotes || {}), ...(patches.stepNotesPatch || {}) };
    const mergedEvidence = mergeExecutionEvidencePatch(prev.stepEvidence || {}, patches.stepEvidencePatch);

    const caseStepIds = (stepsByCaseId[testCaseId] || [])
      .slice()
      .sort((left, right) => left.step_order - right.step_order)
      .map((step) => step.id);
    const aggregateStatus = deriveCaseStatusFromSteps(caseStepIds, mergedStatuses);
    const logs = stringifyExecutionLogs({
      stepStatuses: mergedStatuses,
      stepNotes: mergedNotes,
      stepEvidence: mergedEvidence,
      stepDefects: prev.stepDefects || {},
      stepApiDetails: prev.stepApiDetails || {},
      stepWebDetails: prev.stepWebDetails || {},
      stepCaptures: prev.stepCaptures || {}
    });
    const durationMs = resolvePersistedCaseDurationMs(testCaseId, existing);

    if (existing) {
      await updateResult.mutateAsync({
        id: existing.id,
        input: {
          status: aggregateStatus,
          duration_ms: durationMs ?? undefined,
          logs,
          error: aggregateStatus === "failed" ? "Step failed during run" : ""
        }
      });
      queryClient.setQueryData<ExecutionResult[]>(["execution-results", selectedExecution.id], (current = []) =>
        current.map((item) =>
          item.id === existing.id
            ? {
                ...item,
                status: aggregateStatus,
                duration_ms: durationMs,
                logs,
                error: aggregateStatus === "failed" ? "Step failed during run" : null
              }
            : item
        )
      );
      if (shouldRefresh) {
        await refreshExecutionScope(selectedExecution.id);
      }
      return existing.id;
    }

    const shouldCreate =
      Object.keys(patches.stepStatusesPatch || {}).length > 0
      || Object.keys(patches.stepNotesPatch || {}).length > 0
      || Object.keys(patches.stepEvidencePatch || {}).length > 0;
    if (!shouldCreate) {
      return;
    }

    const response = await createResult.mutateAsync({
      execution_id: selectedExecution.id,
      test_case_id: testCaseId,
      app_type_id: scopedAppTypeId,
      status: aggregateStatus,
      duration_ms: durationMs ?? undefined,
      logs,
      error: aggregateStatus === "failed" ? "Step failed during run" : undefined,
      external_references: currentCaseSnapshot.external_references || [],
      defects: [],
      executed_by: session!.user.id
    });

    queryClient.setQueryData<ExecutionResult[]>(["execution-results", selectedExecution.id], (current = []) => [
      {
        id: response.id,
        execution_id: selectedExecution.id,
        test_case_id: testCaseId,
        test_case_title: currentCaseSnapshot.test_case_title,
        suite_id: currentCaseSnapshot.suite_id,
        suite_name: currentCaseSnapshot.suite_name,
        app_type_id: scopedAppTypeId,
        status: aggregateStatus,
        duration_ms: durationMs,
        error: aggregateStatus === "failed" ? "Step failed during run" : null,
        logs,
        external_references: currentCaseSnapshot.external_references || [],
        defects: [],
        executed_by: session!.user.id
      },
      ...current
    ]);
    if (shouldRefresh) {
      await refreshExecutionScope(selectedExecution.id);
    }
    return response.id;
  };

  const handleStepDefectsChange = async (step: TestStep, defectIds: string[]) => {
    if (!selectedExecution || !selectedTestCaseId || isExecutionLocked) {
      return;
    }

    setLinkingDefectStepId(step.id);
    try {
      const existingResultId = resultByCaseId[selectedTestCaseId]?.id;
      const createdResultId = existingResultId
        ? undefined
        : await persistCaseResult(
          selectedTestCaseId,
          { stepNotesPatch: { [step.id]: stepNotes[step.id] || "" } },
          { refresh: false }
        );
      const resultId = existingResultId || createdResultId;

      if (!resultId) {
        throw new Error("A test case result could not be created for this step.");
      }

      await api.executionResults.linkStepDefects(resultId, {
        step_id: step.id,
        defect_ids: [...new Set(defectIds)].slice(0, 50)
      });
      await refreshExecutionScope(selectedExecution.id);
      showSuccess(defectIds.length ? "Step bug links updated." : "Step bug links cleared.");
    } catch (error) {
      showError(error, "Unable to update step bug links");
    } finally {
      setLinkingDefectStepId("");
    }
  };

  const handleRecordStep = async (stepId: string, status: "passed" | "failed") => {
    if (!selectedExecution || !selectedTestCaseId) {
      return;
    }

    const updatedStepStatuses = { ...stepStatuses, [stepId]: status };
    const currentSteps = selectedSteps.map((step) => step.id);
    const allResolved = currentSteps.length > 0 && currentSteps.every((id) => updatedStepStatuses[id]);

    try {
      await persistCaseResult(selectedTestCaseId, { stepStatusesPatch: { [stepId]: status } });
      showSuccess(`Step marked ${status}.`);

      if (allResolved) {
        const currentCaseIndex = executionCaseOrder.findIndex((testCase) => testCase.id === selectedTestCaseId);
        const nextCase = executionCaseOrder[currentCaseIndex + 1];

        if (nextCase) {
          if (nextCase.suite_id) {
            setFocusedSuiteId(nextCase.suite_id);
          }
          focusExecutionCase(nextCase.id);
        }
      }
    } catch (error) {
      showError(error, "Unable to record step result");
    }
  };

  const handleSaveStepNote = async (stepId: string, note: string) => {
    if (!selectedExecution || !selectedTestCaseId) {
      return;
    }

    try {
      await persistCaseResult(selectedTestCaseId, { stepNotesPatch: { [stepId]: note } });
    } catch (error) {
      showError(error, "Unable to save step note");
    }
  };

  const openExecutionEvidence = async (step: TestStep, evidence: ExecutionStepEvidence) => {
    if (!hasExecutionEvidence(evidence)) {
      return;
    }
    if (!canViewRunEvidence) {
      showError(new Error("Permission required: result.view and attachment.view"), "Unable to open evidence");
      return;
    }

    setOpeningEvidenceStepId(step.id);
    try {
      closeExecutionEvidence();
      if (evidence.dataUrl) {
        setExecutionEvidencePreview({
          stepLabel: `Step ${step.step_order}`,
          fileName: evidence.fileName || null,
          mimeType: evidenceMimeType(evidence),
          sourceUrl: evidence.dataUrl
        });
        return;
      }

      const blob = await api.attachments.download(evidence.attachmentId as string);
      const sourceUrl = URL.createObjectURL(blob);
      executionEvidenceObjectUrlRef.current = sourceUrl;
      setExecutionEvidencePreview({
        attachmentId: evidence.attachmentId,
        stepLabel: `Step ${step.step_order}`,
        fileName: evidence.fileName || null,
        mimeType: evidence.mimeType || blob.type || "application/octet-stream",
        sourceUrl
      });
    } catch (error) {
      showError(error, "Unable to open evidence");
    } finally {
      setOpeningEvidenceStepId((current) => current === step.id ? "" : current);
    }
  };

  const handleUploadStepEvidence = async (step: TestStep, file: File) => {
    if (!selectedExecution || !selectedTestCaseId) {
      return;
    }
    const previousEvidence = stepEvidence[step.id];
    if (!canCreateRunEvidence || (hasExecutionEvidence(previousEvidence) && !canDeleteRunEvidence)) {
      showError(
        new Error(hasExecutionEvidence(previousEvidence)
          ? "Replacing evidence requires result.manage, attachment.create, and attachment.delete."
          : "Uploading evidence requires result.manage and attachment.create."),
        "Unable to save evidence"
      );
      return;
    }

    setUploadingEvidenceStepId(step.id);
    let uploadedAttachmentId = "";

    try {
      if (!selectedExecution.display_id) {
        throw new Error("This run does not have a Jira issue key, so evidence cannot be attached yet.");
      }

      const attachmentMeta = await api.attachments.meta();
      if (!attachmentMeta.enabled) throw new Error("Jira attachments are disabled for this site.");
      if (attachmentMeta.uploadLimit && file.size > attachmentMeta.uploadLimit) {
        throw new Error(`This file exceeds the Jira attachment limit of ${Math.max(1, Math.floor(attachmentMeta.uploadLimit / 1024 / 1024))} MB.`);
      }
      const prepared = await readExecutionEvidenceFile(file);
      const jiraFile = new File([prepared.blob], prepared.fileName, {
        lastModified: Date.now(),
        type: prepared.mimeType
      });
      const attachment = await api.attachments.upload(selectedExecution.display_id, jiraFile);
      uploadedAttachmentId = attachment.id;
      const evidence: ExecutionStepEvidence = {
        attachmentId: attachment.id,
        fileName: attachment.filename || prepared.fileName,
        mimeType: attachment.mimeType || prepared.mimeType,
        size: attachment.size || prepared.size,
        checksum: prepared.checksum,
        createdAt: attachment.created || new Date().toISOString()
      };
      await persistCaseResult(selectedTestCaseId, { stepEvidencePatch: { [step.id]: evidence } });

      let previousAttachmentCleanupFailed = false;
      if (previousEvidence?.attachmentId && previousEvidence.attachmentId !== attachment.id) {
        try {
          await api.attachments.delete(previousEvidence.attachmentId);
        } catch {
          previousAttachmentCleanupFailed = true;
        }
      }

      showSuccess(previousAttachmentCleanupFailed
        ? "Evidence replaced. The previous Jira attachment could not be removed and may require administrator cleanup."
        : hasExecutionEvidence(previousEvidence) ? "Evidence replaced." : "Evidence saved.");
    } catch (error) {
      if (uploadedAttachmentId) {
        try {
          await api.attachments.delete(uploadedAttachmentId);
        } catch {
          // Best-effort compensation: preserve the original save error for the user.
        }
      }
      showError(error, "Unable to save evidence");
    } finally {
      setUploadingEvidenceStepId((current) => (current === step.id ? "" : current));
    }
  };

  const handleDeleteStepEvidence = async (step: TestStep) => {
    if (!selectedExecution || !selectedTestCaseId) {
      return;
    }
    if (!canDeleteRunEvidence) {
      showError(new Error("Permission required: result.manage and attachment.delete"), "Unable to delete evidence");
      return;
    }

    const evidence = stepEvidence[step.id];
    if (!evidence || !(await confirmDelete({ message: `Delete "${evidence.fileName || `Step ${step.step_order} evidence`}" from this run?` }))) {
      return;
    }

    try {
      await persistCaseResult(selectedTestCaseId, { stepEvidencePatch: { [step.id]: null } });
      if (evidence.attachmentId) {
        try {
          await api.attachments.delete(evidence.attachmentId);
        } catch (deleteError) {
          try {
            await persistCaseResult(selectedTestCaseId, { stepEvidencePatch: { [step.id]: evidence } });
          } catch {
            throw new Error(`${deleteError instanceof Error ? deleteError.message : "Jira attachment deletion failed"} The metadata reference could not be restored.`);
          }
          throw new Error(`${deleteError instanceof Error ? deleteError.message : "Jira attachment deletion failed"} The evidence reference was restored.`);
        }
      }
      if (executionEvidencePreview?.attachmentId === evidence.attachmentId || executionEvidencePreview?.sourceUrl === evidence.dataUrl) {
        closeExecutionEvidence();
      }
      showSuccess("Evidence removed from Jira.");
    } catch (error) {
      showError(error, "Unable to delete evidence");
    }
  };

  const handleBulkStepStatus = async (status: "passed" | "failed", scope: "selected" | "all") => {
    if (!selectedExecution || !selectedTestCaseId || !selectedSteps.length) {
      return;
    }

    const targetIds =
      scope === "all"
        ? selectedSteps.map((step) => step.id)
        : bulkSelectedStepIds.filter((id) => selectedSteps.some((step) => step.id === id));

    if (!targetIds.length) {
      showError(null, scope === "selected" ? "Select at least one step." : "No steps to update.");
      return;
    }

    const patch = targetIds.reduce<Record<string, ExecutionStepStatus>>((acc, id) => {
      acc[id] = status;
      return acc;
    }, {});

    try {
      await persistCaseResult(selectedTestCaseId, { stepStatusesPatch: patch });
      setBulkSelectedStepIds([]);
      showSuccess(`${targetIds.length} step${targetIds.length === 1 ? "" : "s"} marked ${status}.`);
    } catch (error) {
      showError(error, "Unable to update steps");
    }
  };

  const selectedExecutionCase = executionCaseOrder.find((testCase) => testCase.id === selectedTestCaseId) || null;
  const selectedExecutionResult = selectedExecutionCase ? resultByCaseId[selectedExecutionCase.id] : null;
  const selectedExecutionCaseEffectiveUser = selectedExecutionCase?.assigned_user || selectedExecution?.assigned_user || null;
  const selectedExecutionCaseExplicitAssigneeId = selectedExecutionCase?.assigned_to || "";
  const selectedExecutionCaseReadableTitle = selectedExecutionCase
    ? resolveStepParameterText(selectedExecutionCase.title, executionStepParameterValues) || selectedExecutionCase.title
    : "";
  const selectedExecutionCaseReadableDescription = selectedExecutionCase
    ? resolveStepParameterText(selectedExecutionCase.description, executionStepParameterValues) || selectedExecutionCase.description || ""
    : "";

  const handleAttachStepNetworkAutomation = async (network: NonNullable<ExecutionStepWebDetail["network"]>) => {
    if (!selectedExecutionCase?.id || !network.length) {
      return;
    }

    try {
      const response = await attachNetworkAutomationToCase.mutateAsync({ testCaseId: selectedExecutionCase.id, network });
      showSuccess(response.generated_step_count
        ? `Mapped ${response.generated_step_count} API automation step${response.generated_step_count === 1 ? "" : "s"} onto "${selectedExecutionCase.title}".`
        : "Captured network calls did not add executable API steps to this test case.");
      await queryClient.invalidateQueries({ queryKey: ["global-test-cases"] });
    } catch (error) {
      showError(error, "Unable to map API automation from network calls");
    }
  };
  const selectedExecutionCaseReferenceText = formatReferenceList(
    selectedExecutionResult?.external_references?.length
      ? selectedExecutionResult.external_references
      : selectedExecutionCase?.external_references || []
  );
  const selectedExecutionCaseDefectText = formatReferenceList(selectedExecutionResult?.defects || []);

  useEffect(() => {
    setCaseReferenceDraft(selectedExecutionCaseReferenceText);
    setCaseDefectDraft(selectedExecutionCaseDefectText);
  }, [selectedExecutionCaseDefectText, selectedExecutionCaseReferenceText, selectedExecution?.id, selectedExecutionCase?.id]);

  const openExecutionGroupAutomationPreview = (groupName: string, steps: TestStep[]) => {
    setCodePreviewState({
      title: `${groupName} automation`,
      subtitle: "This is the snapped automation for the selected run.",
      code: buildGroupAutomationCode(groupName, steps)
    });
  };

  const openExecutionStepAutomationPreview = (step: TestStep) => {
    setCodePreviewState({
      title: `Step ${step.step_order} automation`,
      subtitle: "Run snapshots are read-only. This preview reflects the preserved step automation for this run.",
      code: resolveStepAutomationCode(step)
    });
  };

  const handleRunExecutionApiStep = async (step: TestStep) => {
    if (!selectedExecution || !selectedTestCaseId) {
      return;
    }

    setRunningExecutionApiStepId(step.id);

    try {
      const response = await runExecutionApiStep.mutateAsync({
        executionId: selectedExecution.id,
        testCaseId: selectedTestCaseId,
        stepId: step.id
      });

      await refreshExecutionScope(selectedExecution.id);
      if (step.step_type === "api" || response.detail) {
        setExecutionApiDetailState({
          step,
          detail: response.detail,
          captures: response.detail?.captures || response.captures || {},
          note: response.note,
          status: response.step_status || "queued"
        });
      }
      showSuccess(
        response.queued_for_engine
          ? `Step ${step.step_order} queued for Test Engine.`
          : `Step ${step.step_order} ${response.step_status}.`
      );
    } catch (error) {
      showError(error, "Unable to run step");
    } finally {
      setRunningExecutionApiStepId((current) => (current === step.id ? "" : current));
    }
  };

	  const handleRunExecutionAiAnalysis = async () => {
	    if (!selectedExecution || !executionCaseOrder.length) {
	      return;
	    }

	    if (!canUseRunAi) {
	      showError(new Error("Permission required: run.ai"), "Unable to refresh run evidence analysis");
	      return;
	    }

	    if (!["completed", "failed"].includes(currentExecutionStatus)) {
	      showError(new Error("Complete the run before running evidence analysis."), "Unable to refresh run evidence analysis");
	      return;
	    }

	    try {
      let recordedCount = 0;
      let previewOnlyCount = 0;
      for (const testCase of executionCaseOrder) {
        const response = await runExecutionAiAnalysis.mutateAsync({
          executionId: selectedExecution.id,
          testCaseId: testCase.id
        });
        if (response.recorded) recordedCount += 1;
        else previewOnlyCount += 1;
      }

      await refreshExecutionScope(selectedExecution.id);
      setIsExecutionAiAnalysisExpanded(true);
      showSuccess([
        `Evidence analysis recorded for ${recordedCount} case${recordedCount === 1 ? "" : "s"}.`,
        previewOnlyCount ? `${previewOnlyCount} case${previewOnlyCount === 1 ? " has" : "s have"} no result to attach analysis to yet.` : ""
      ].filter(Boolean).join(" "));
    } catch (error) {
      showError(error, "Unable to refresh run evidence analysis");
    }
  };

  const handlePreviewFailureClusters = () => {
    if (!selectedExecution || !projectId || !canUseRunAi) return;
    setIsFailureClusterPreviewOpen(true);
    previewExecutionFailureClusters.reset();
    previewExecutionFailureClusters.mutate({
      executionId: selectedExecution.id,
      input: { project_id: projectId, scope: "failed-and-blocked" }
    });
  };

  const openExecutionApiDetail = (step: TestStep) => {
    setExecutionApiDetailState({
      step,
      detail: stepApiDetails[step.id] || null,
      captures: stepCaptures[step.id] || stepApiDetails[step.id]?.captures || {},
      note: stepNotes[step.id] || "",
      status: stepStatuses[step.id] || "queued"
    });
  };

  useEffect(() => {
    setCaseAssignmentDraft(selectedExecutionCaseExplicitAssigneeId);
  }, [selectedExecutionCase?.id, selectedExecutionCaseExplicitAssigneeId]);

  useEffect(() => {
    setCodePreviewState(null);
  }, [selectedExecutionId, selectedTestCaseId]);

  const focusExecutionCase = (testCaseId: string, executionId = selectedExecutionId) => {
    const scopedCase = executionCaseOrder.find((testCase) => testCase.id === testCaseId);

    if (scopedCase?.suite_id) {
      setFocusedSuiteId(scopedCase.suite_id);
    }

    if (executionId && executionId !== selectedExecutionId) {
      setSelectedExecutionId(executionId);
    }

    setSelectedTestCaseId(testCaseId);

    if (executionId) {
      syncExecutionSearchParams(executionId, testCaseId);
    }
  };

  useEffect(() => {
    if (!isExecutionStarted || isExecutionLocked || !selectedTestCaseId) {
      return;
    }

    setCaseTimerStartedAtById((current) =>
      current[selectedTestCaseId] ? current : { ...current, [selectedTestCaseId]: Date.now() }
    );
  }, [isExecutionLocked, isExecutionStarted, selectedTestCaseId]);

  const resolveCaseDurationMs = (testCaseId: string, result?: ExecutionResult | null) => {
    if (typeof result?.duration_ms === "number") {
      return result.duration_ms;
    }

    const startedAt = caseTimerStartedAtById[testCaseId];
    if (startedAt && isExecutionStarted && !isExecutionLocked) {
      return Math.max(liveNow - startedAt, 0);
    }

    return null;
  };

  const selectedStepProgress = useMemo(() => {
    const passedCount = selectedSteps.filter((step) => stepStatuses[step.id] === "passed").length;
    const failedCount = selectedSteps.filter((step) => stepStatuses[step.id] === "failed").length;
    const pendingCount = Math.max(selectedSteps.length - passedCount - failedCount, 0);
    const percent = selectedSteps.length ? Math.round(((passedCount + failedCount) / selectedSteps.length) * 100) : 0;

    return {
      passedCount,
      failedCount,
      pendingCount,
      percent
    };
  }, [selectedSteps, stepStatuses]);

  const selectedExecutionDurationMs = useMemo(
    () => computeExecutionDurationMs(selectedExecution?.started_at, selectedExecution?.ended_at, liveNow),
    [liveNow, selectedExecution?.ended_at, selectedExecution?.started_at]
  );

  const selectedCaseDurationMs = useMemo(
    () => (selectedExecutionCase ? resolveCaseDurationMs(selectedExecutionCase.id, selectedExecutionResult) : null),
    [caseTimerStartedAtById, isExecutionLocked, isExecutionStarted, liveNow, selectedExecutionCase, selectedExecutionResult]
  );

  const averageCaseDurationMs = useMemo(
    () => averageDuration(executionResults.map((result) => result.duration_ms)),
    [executionResults]
  );

  const suiteDurationById = useMemo(() => {
    return executionSuites.reduce<Record<string, number | null>>((accumulator, suite) => {
      const suiteCases = displayCasesBySuiteId[suite.id] || [];
      const total = suiteCases.reduce((sum, testCase) => {
        const duration = resolveCaseDurationMs(testCase.id, resultByCaseId[testCase.id]);
        return sum + (duration || 0);
      }, 0);
      accumulator[suite.id] = total > 0 ? total : null;
      return accumulator;
    }, {});
  }, [displayCasesBySuiteId, executionSuites, resultByCaseId, caseTimerStartedAtById, isExecutionLocked, isExecutionStarted, liveNow]);

  const filteredExecutionSuites = useMemo(() => {
    const query = executionSuiteSearch.trim().toLowerCase();

    if (!query) {
      return executionSuites;
    }

    return executionSuites.filter((suite) => {
      const suiteCases = displayCasesBySuiteId[suite.id] || [];
      const suiteMetric = suiteMetrics.find((item) => item.suiteId === suite.id);
      const suiteImpactSummary = selectedSuiteImpactSummaryById[suite.id] || EMPTY_EXECUTION_RUN_IMPACT_SUMMARY;
      const suiteStatus = suiteMetric ? suiteBoardStatus(suiteMetric) : "queued";
      const searchableValues = [
        suite.id,
        suite.name,
        suiteStatus,
        `${suiteCases.length} cases`,
        `${suiteMetric?.passedCount || 0} passed`,
        `${suiteMetric?.failedCount || 0} failed`,
        `${suiteMetric?.blockedCount || 0} blocked`,
        `${suiteImpactSummary.failedRequirementCount} impacted requirements`,
        ...suiteCases.flatMap((testCase) => [
          testCase.id,
          testCase.title,
          richTextToPlainText(testCase.description),
          testCase.suite_name || ""
        ])
      ];

      return searchableValues.some((value) => String(value || "").toLowerCase().includes(query));
    });
  }, [displayCasesBySuiteId, executionSuiteSearch, executionSuites, selectedSuiteImpactSummaryById, suiteMetrics]);

  const filteredExecutionCaseOrder = useMemo(() => {
    const query = executionCaseSearch.trim().toLowerCase();

    if (!query) {
      return executionCaseOrder;
    }

    return executionCaseOrder.filter((testCase) => {
      const status = caseDerivedStatus(testCase);
      const assignedUser = testCase.assigned_user || selectedExecution?.assigned_user || null;
      const searchableValues = [
        testCase.id,
        testCase.title,
        richTextToPlainText(testCase.description),
        testCase.suite_name || "",
        status,
        `P${testCase.priority || 3}`,
        `${(stepsByCaseId[testCase.id] || []).length} steps`,
        assignedUser ? resolveUserPrimaryLabel(assignedUser) : "Unassigned"
      ];

      return searchableValues.some((value) => String(value || "").toLowerCase().includes(query));
    });
  }, [executionCaseOrder, executionCaseSearch, resultByCaseId, selectedExecution?.assigned_user, stepsByCaseId]);

  const filteredDisplayCasesBySuiteId = useMemo(() => {
    const query = executionCaseSearch.trim().toLowerCase();

    if (!query) {
      return displayCasesBySuiteId;
    }

    return Object.entries(displayCasesBySuiteId).reduce<Record<string, ExecutionCaseView[]>>((accumulator, [suiteId, suiteCases]) => {
      accumulator[suiteId] = suiteCases.filter((testCase) => {
        const status = caseDerivedStatus(testCase);
        const assignedUser = testCase.assigned_user || selectedExecution?.assigned_user || null;
        const searchableValues = [
          testCase.id,
          testCase.title,
          richTextToPlainText(testCase.description),
          testCase.suite_name || "",
          status,
          `P${testCase.priority || 3}`,
          `${(stepsByCaseId[testCase.id] || []).length} steps`,
          assignedUser ? resolveUserPrimaryLabel(assignedUser) : "Unassigned"
        ];

        return searchableValues.some((value) => String(value || "").toLowerCase().includes(query));
      });
      return accumulator;
    }, {});
  }, [displayCasesBySuiteId, executionCaseSearch, resultByCaseId, selectedExecution?.assigned_user, stepsByCaseId]);

  const executionResultsWithTiming = useMemo(
    () => executionResults.filter((result) => typeof result.duration_ms === "number").length,
    [executionResults]
  );

  const queuedCases = useMemo(
    () => executionCaseOrder.filter((testCase) => caseDerivedStatus(testCase) === "queued"),
    [executionCaseOrder, resultByCaseId]
  );

  const nextFocusCase = useMemo(
    () => blockingCases[0] || queuedCases[0] || executionCaseOrder[0] || null,
    [blockingCases, executionCaseOrder, queuedCases]
  );

  const runReferenceRows = useMemo(() => {
    return executionCaseOrder
      .map((testCase) => {
        const result = resultByCaseId[testCase.id];
        const status = caseDerivedStatus(testCase);
        const references = result?.external_references?.length
          ? result.external_references
          : testCase.external_references || [];
        const defects = result?.defects || [];

        return {
          defects,
          error: result?.error || "",
          references,
          status,
          testCase
        };
      })
      .filter((row) => ["failed", "blocked"].includes(row.status));
  }, [executionCaseOrder, resultByCaseId]);

  const runReferenceStats = useMemo(() => {
    const failedRows = runReferenceRows.filter((row) => ["failed", "blocked"].includes(row.status));
    const referenceCount = runReferenceRows.reduce((count, row) => count + row.references.length, 0);
    const defectCount = runReferenceRows.reduce((count, row) => count + row.defects.length, 0);

    return {
      defectCount,
      failedCaseCount: failedRows.length,
      referenceCount
    };
  }, [runReferenceRows]);

  const runReferenceSummary = runReferenceRows.length
    ? `${runReferenceStats.defectCount} bug${runReferenceStats.defectCount === 1 ? "" : "s"} · ${runReferenceStats.referenceCount} reference${runReferenceStats.referenceCount === 1 ? "" : "s"} across ${runReferenceStats.failedCaseCount || runReferenceRows.length} case${(runReferenceStats.failedCaseCount || runReferenceRows.length) === 1 ? "" : "s"}`
    : "No failed case references recorded";
  const selectedRunEvidenceReadiness = useMemo(
    () => assessRunEvidenceReadiness({
      totalCaseCount: executionProgress.totalCases,
      touchedCaseCount: executionProgress.completedCases,
      linkedRequirementCount: selectedExecutionImpactSummary.totalRequirements,
      referenceCount: runReferenceStats.referenceCount + runReferenceStats.defectCount,
      failedCount: executionStatusCounts.failed,
      blockedCount: executionStatusCounts.blocked
    }),
    [executionProgress.completedCases, executionProgress.totalCases, executionStatusCounts.blocked, executionStatusCounts.failed, runReferenceStats.defectCount, runReferenceStats.referenceCount, selectedExecutionImpactSummary.totalRequirements]
  );
  const failureClusterFindings = useMemo<AiPreviewFinding[]>(
    () => (previewExecutionFailureClusters.data?.clusters || []).map((cluster) => ({
      id: cluster.id,
      title: `${cluster.label} · ${cluster.count} result${cluster.count === 1 ? "" : "s"}`,
      severity: cluster.id === "unclassified" ? "high" : cluster.count > 2 ? "medium" : "info",
      description: cluster.explanation,
      action: cluster.recommended_action,
      meta: `${Math.round(cluster.confidence * 100)}% deterministic rule-match strength · not root-cause certainty`,
      evidence: cluster.evidence_refs
    })),
    [previewExecutionFailureClusters.data]
  );

	  const runAiAnalysis = useMemo<ExecutionAiAnalysis | null>(() => {
	    if (!selectedExecution || !["completed", "failed"].includes(currentExecutionStatus)) {
	      return null;
	    }

	    const selectedRunStartedAt = toTimestamp(selectedExecution.started_at)
	      || toTimestamp(selectedExecution.created_at)
	      || 0;

	    const caseAnalysisRows = executionCaseOrder
	      .map((testCase) => {
	        const result = resultByCaseId[testCase.id] || null;
	        const analysis = parseExecutionLogs(result?.logs || null).aiAnalysis || null;

	        if (!result || result.execution_id !== selectedExecution.id || !analysis) {
	          return null;
	        }

	        if (analysis.executionId && analysis.executionId !== selectedExecution.id) {
	          return null;
	        }

	        if (analysis.testCaseId && analysis.testCaseId !== testCase.id) {
	          return null;
	        }

	        const generatedAt = toTimestamp(analysis.generatedAt);

	        if (generatedAt && selectedRunStartedAt && generatedAt < selectedRunStartedAt) {
	          return null;
	        }

	        return {
	          analysis,
	          result,
	          status: caseDerivedStatus(testCase),
	          testCase
	        };
	      })
	      .filter((row): row is { analysis: ExecutionAiAnalysis; result: ExecutionResult; status: ReturnType<typeof caseDerivedStatus>; testCase: ExecutionCaseView } => Boolean(row));
    const latestAnalysis = caseAnalysisRows
      .map((row) => row.analysis)
      .filter((analysis): analysis is ExecutionAiAnalysis => Boolean(analysis))
      .sort((left, right) => String(right.generatedAt || "").localeCompare(String(left.generatedAt || "")))[0] || null;
    const suiteLines = executionSuites.length
      ? executionSuites.map((suite) => {
          const suiteMetric = suiteMetrics.find((item) => item.suiteId === suite.id);
          return `- ${suite.name}: ${suiteMetric?.count || 0} cases, ${suiteMetric?.passedCount || 0} passed, ${suiteMetric?.failedCount || 0} failed, ${suiteMetric?.blockedCount || 0} blocked.`;
        })
      : ["- Direct test case run with no suite grouping."];
    const riskRows = runReferenceRows.filter((row) => ["failed", "blocked"].includes(row.status));
    const riskLines = riskRows.length
      ? riskRows.slice(0, 8).map((row) => `- ${row.testCase.title}: ${row.status}${row.defects.length ? `, bugs ${row.defects.join(", ")}` : ""}${row.references.length ? `, references ${row.references.join(", ")}` : ""}${row.error ? `, note ${row.error}` : ""}.`)
      : ["- No failed or blocked cases are currently recorded."];
    const caseAnalysisLines = caseAnalysisRows.length
      ? caseAnalysisRows.slice(0, 6).map((row) => {
          const response = row.analysis?.response.trim().replace(/\s+/g, " ") || "No analysis text.";
          return `- ${row.testCase.title}: ${response.slice(0, 420)}${response.length > 420 ? "..." : ""}`;
        })
      : ["- No per-case evidence analysis has been recorded yet. Run analysis to refresh all case-level signals and rebuild this rollup."];

    return {
      generatedAt: latestAnalysis?.generatedAt || selectedExecution.updated_at || selectedExecution.created_at,
      integration: latestAnalysis?.integration,
      response: [
        "Run-level analysis consolidated from the current run snapshot, suites, cases, result evidence, references, bugs, and recorded case analysis.",
        "",
        `Run: ${selectedExecution.name || selectedExecution.id}`,
        `Status: ${currentExecutionStatus}. Scope: ${executionProgress.totalCases} cases, ${executionSuites.length} suites, ${executionStatusCounts.passed} passed, ${executionStatusCounts.failed} failed, ${executionStatusCounts.blocked} blocked, ${Math.max(executionProgress.totalCases - executionProgress.completedCases, 0)} remaining.`,
        "",
        "Suite coverage:",
        ...suiteLines,
        "",
        "Risk and reference focus:",
        ...riskLines,
        "",
        "Case analysis signals:",
        ...caseAnalysisLines
      ].join("\n")
    };
  }, [currentExecutionStatus, executionCaseOrder, executionProgress.completedCases, executionProgress.totalCases, executionStatusCounts.blocked, executionStatusCounts.failed, executionStatusCounts.passed, executionSuites, resultByCaseId, runReferenceRows, selectedExecution, suiteMetrics]);

  const selectedCaseHistory = useMemo(
    () =>
      selectedTestCaseId
        ? allExecutionResults
            .filter((result) => result.test_case_id === selectedTestCaseId)
            .slice()
            .sort((left, right) => String(right.created_at || "").localeCompare(String(left.created_at || "")))
        : [],
    [allExecutionResults, selectedTestCaseId]
  );

  const resolvedStepNoteCount = useMemo(
    () => Object.values(stepNotes).filter((value) => value.trim()).length,
    [stepNotes]
  );
  const resolvedStepImageCount = useMemo(
    () => Object.values(stepEvidence).filter(hasExecutionEvidence).length,
    [stepEvidence]
  );
  const resolvedEvidenceArtifactCount = resolvedStepNoteCount + resolvedStepImageCount;
  const selectedRuntimeTelemetry = useMemo(() => {
    const webDetails = Object.values(stepWebDetails || {});
    const consoleCount = webDetails.reduce((total, detail) => total + (detail?.console?.length || 0), 0);
    const networkCount = webDetails.reduce((total, detail) => total + (detail?.network?.length || 0), 0);
    const timedWebSteps = webDetails.filter((detail) => typeof detail?.duration_ms === "number");
    const webDurationMs = timedWebSteps.reduce((total, detail) => total + Number(detail?.duration_ms || 0), 0);

    return {
      webStepCount: webDetails.length,
      consoleCount,
      networkCount,
      artifactCount: resolvedEvidenceArtifactCount,
      avgWebDurationMs: timedWebSteps.length ? Math.round(webDurationMs / timedWebSteps.length) : null
    };
  }, [resolvedEvidenceArtifactCount, stepWebDetails]);

  const selectedExecutionAppTypeLabel =
    appTypeNameById[selectedExecution?.app_type_id || ""] || selectedExecution?.app_type_id || "No app type scoped";
  const selectedExecutionProjectLabel =
    projectNameById[selectedExecution?.project_id || ""] ||
    projects.find((project) => project.id === selectedExecution?.project_id)?.name ||
    selectedExecution?.project_id ||
    "No project scoped";
  const currentExecutionAssigneeIds = selectedExecution?.assigned_to_ids?.length ? selectedExecution.assigned_to_ids : selectedExecution?.assigned_to ? [selectedExecution.assigned_to] : [];
  const hasExecutionAssignmentChange =
    executionAssignmentDraftIds.length !== currentExecutionAssigneeIds.length
    || executionAssignmentDraftIds.some((assigneeId) => !currentExecutionAssigneeIds.includes(assigneeId));
  const hasCaseAssignmentChange = caseAssignmentDraft !== selectedExecutionCaseExplicitAssigneeId;
  const hasCaseReferenceChange =
    caseReferenceDraft.trim() !== selectedExecutionCaseReferenceText
    || caseDefectDraft.trim() !== selectedExecutionCaseDefectText;
  const selectedExecutionCaseAssignmentHint = selectedExecutionCase?.assigned_to
    ? "This case has its own run-level assignee override."
    : selectedExecution?.assigned_user
      ? `This case is currently following ${resolveUserPrimaryLabel(selectedExecution.assigned_user)} from the run.`
      : "No assignee is set yet for this run or this case.";
  const remainingCaseCount = Math.max(executionProgress.totalCases - executionProgress.completedCases, 0);
  const isSelectedExecutionTestCaseRun = Boolean(selectedExecution && !selectedExecutionSuiteIds.length);
  const selectedCaseStatusLabel = selectedExecutionCase ? caseDerivedStatus(selectedExecutionCase) : executionProgress.derivedStatus;
  const activeExecutionStage = selectedExecutionCase ? "case" : selectedExecution ? (isSelectedExecutionTestCaseRun ? "cases" : "suites") : "executions";
  const showExecutionListHeader =
    testRunsView === "scheduled-runs"
      ? true
      : testRunsView === "batch-process"
        ? !selectedWorkspaceTransaction
        : !selectedExecution;
  const runLibraryTitle =
    testRunsView === "test-case-runs"
      ? "Test case runs"
      : testRunsView === "suite-runs"
        ? "Suite runs"
        : testRunsView === "local-runs"
          ? "Local runs"
        : testRunsView === "scheduled-runs"
          ? "Scheduled runs"
          : "Batch process";
  const runLibrarySubtitle =
    testRunsView === "test-case-runs"
      ? "Open direct case runs, review case outcomes quickly, and jump straight into the snapped test case details."
      : testRunsView === "suite-runs"
        ? "Browse suite-scoped runs, expand grouped coverage, and move into the focused run console when a case needs attention."
        : testRunsView === "local-runs"
          ? "Review runs launched directly against your local Playwright runner without using the Test Engine queue."
        : testRunsView === "scheduled-runs"
          ? "Keep recurring release checks separate from live runs, then launch one instantly when the team is ready."
          : "Track imports, exports, AI generation, and other long-running background work in one place.";
  const runLibrarySearchPlaceholder =
    testRunsView === "scheduled-runs"
      ? "Search scheduled runs"
      : testRunsView === "batch-process"
        ? "Search batch process records"
        : `Search ${testRunsView === "test-case-runs" ? "test case runs" : testRunsView === "local-runs" ? "local runs" : "suite runs"}`;
  const runLibrarySearchTitle =
    testRunsView === "scheduled-runs"
      ? "Filter scheduled runs"
      : testRunsView === "batch-process"
        ? "Filter batch process records"
        : "Filter runs";
  const runLibrarySearchSubtitle =
    testRunsView === "scheduled-runs"
      ? "Filter scheduled runs by cadence, timing, or scope context."
      : testRunsView === "batch-process"
        ? "Search titles, providers, repositories, or generated artifact details."
        : "Filter run tiles by the status and facts shown on each card.";
  const executionControlTitle =
    currentExecutionStatus === "running"
      ? "Run is live"
      : currentExecutionStatus === "queued"
        ? "Run ready to start"
        : currentExecutionStatus === "aborted"
          ? "Run was aborted"
          : "Run locked";
  const executionControlDescription =
    currentExecutionStatus === "running"
      ? `${formatDuration(selectedExecutionDurationMs, DEFAULT_DURATION_LABEL)} elapsed across the run.`
      : currentExecutionStatus === "queued"
        ? "Start the run before step-level result capture."
        : currentExecutionStatus === "aborted"
          ? "This run was stopped early. Captured evidence remains available for review."
          : "This run has been completed. Evidence remains available for review.";
  const handleCatalogViewModeChange = (nextValue: CatalogViewMode) => {
    setCatalogViewModeByView((current) =>
      current[testRunsView] === nextValue
        ? current
        : {
            ...current,
            [testRunsView]: nextValue
          }
    );
  };
  const handleRunLibrarySearchChange = (nextValue: string) => {
    setRunLibrarySearchByView((current) =>
      current[testRunsView] === nextValue
        ? current
        : {
            ...current,
            [testRunsView]: nextValue
        }
    );
  };
  const closeExecutionDrilldown = () => {
    setSelectedExecutionId("");
    setFocusedSuiteId("");
    setSelectedTestCaseId("");
    syncExecutionSearchParams("", null);
  };

  const closeCaseDrilldown = () => {
    setSelectedTestCaseId("");
    syncExecutionSearchParams(selectedExecutionId, null);
  };

  const openWorkspaceTransactionDetail = (transactionId: string) => {
    setSelectedOperationId(transactionId);
  };
  const closeWorkspaceTransactionDetail = () => {
    setSelectedOperationId("");
  };

  const toggleSuiteGroup = (suiteId: string) => {
    setFocusedSuiteId(suiteId);
    setExpandedExecutionSuiteIds((current) =>
      current.includes(suiteId)
        ? current.filter((id) => id !== suiteId)
        : [...current, suiteId]
    );
  };

  const executionStatusOptions = useMemo(
    () => Array.from(new Set(executions.map((execution) => normalizeExecutionStatus(execution.status)))),
    [executions]
  );
  const executionRunCounts = useMemo(
    () =>
      executions.reduce<Record<Extract<TestRunsView, "test-case-runs" | "suite-runs" | "local-runs">, number>>(
        (counts, execution) => {
          counts[resolveExecutionRunBucket(execution)] += 1;
          return counts;
        },
        {
          "test-case-runs": 0,
          "suite-runs": 0,
          "local-runs": 0
        }
      ),
    [executions]
  );
  const activeExecutionRowsCount =
    testRunsView === "test-case-runs"
      ? executionRunCounts["test-case-runs"]
      : testRunsView === "suite-runs"
        ? executionRunCounts["suite-runs"]
        : testRunsView === "local-runs"
          ? executionRunCounts["local-runs"]
        : 0;

  const filteredExecutions = useMemo(() => {
    const search = deferredExecutionSearch.trim().toLowerCase();

    return executions.filter((execution) => {
      const projectName = projectNameById[execution.project_id] || "";
      const assigneeLabel = resolveExecutionAssigneeSummary(execution);
      const summary = executionSummaryById[execution.id] || EMPTY_EXECUTION_RUN_SUMMARY;
      const executionStatus = normalizeExecutionStatus(execution.status);
      const hasIssues = summary.failed + summary.blocked > 0;
      const hasEvidence = summary.total > 0;
      const matchesSearch = !search || [
        execution.id,
        execution.name || "",
        projectName,
        assigneeLabel,
        execution.release || "",
        execution.sprint || "",
        execution.build || "",
        ...(execution.suite_ids || []),
        ...(execution.case_snapshots || []).flatMap((snapshot) => [snapshot.test_case_id, snapshot.test_case_title, snapshot.suite_id || "", snapshot.suite_name || ""]),
        ...(execution.step_snapshots || []).flatMap((snapshot) => [snapshot.snapshot_step_id, snapshot.test_case_id, snapshot.group_id || "", snapshot.reusable_group_id || ""])
      ].some((value) => String(value || "").toLowerCase().includes(search));

      if (!matchesSearch) {
        return false;
      }

      if (executionStatusFilter !== "all" && executionStatus !== executionStatusFilter) {
        return false;
      }

      if (executionIssueFilter === "with-issues" && !hasIssues) {
        return false;
      }

      if (executionIssueFilter === "clean" && hasIssues) {
        return false;
      }

      if (executionEvidenceFilter === "with-evidence" && !hasEvidence) {
        return false;
      }

      if (executionEvidenceFilter === "no-evidence" && hasEvidence) {
        return false;
      }

      return true;
    });
  }, [deferredExecutionSearch, executionEvidenceFilter, executionIssueFilter, executionStatusFilter, executionSummaryById, executions, projectNameById]);
  const filteredTestCaseExecutions = useMemo(
    () => filteredExecutions.filter((execution) => resolveExecutionRunBucket(execution) === "test-case-runs"),
    [filteredExecutions]
  );
  const filteredSuiteExecutions = useMemo(
    () => filteredExecutions.filter((execution) => resolveExecutionRunBucket(execution) === "suite-runs"),
    [filteredExecutions]
  );
  const filteredLocalExecutions = useMemo(
    () => filteredExecutions.filter((execution) => resolveExecutionRunBucket(execution) === "local-runs"),
    [filteredExecutions]
  );
  const activeExecutionCatalogRows = useMemo(
    () =>
      testRunsView === "test-case-runs"
        ? filteredTestCaseExecutions
        : testRunsView === "suite-runs"
          ? filteredSuiteExecutions
          : testRunsView === "local-runs"
            ? filteredLocalExecutions
          : [],
    [filteredLocalExecutions, filteredSuiteExecutions, filteredTestCaseExecutions, testRunsView]
  );
  const availableExecutionCatalogRows = useMemo(
    () =>
      testRunsView === "test-case-runs"
        ? executions.filter((execution) => resolveExecutionRunBucket(execution) === "test-case-runs")
        : testRunsView === "suite-runs"
          ? executions.filter((execution) => resolveExecutionRunBucket(execution) === "suite-runs")
          : testRunsView === "local-runs"
            ? executions.filter((execution) => resolveExecutionRunBucket(execution) === "local-runs")
          : [],
    [executions, testRunsView]
  );

  const filteredSchedules = useMemo(() => {
    const search = deferredExecutionSearch.trim().toLowerCase();

    return executionSchedules.filter((schedule) => {
      const appTypeName = appTypeNameById[schedule.app_type_id || ""] || "";
      const assigneeLabel = resolveExecutionAssigneeSummary(schedule);
      const nextRunLabel = schedule.next_run_at || "";

      return !search || [
        schedule.id,
        schedule.name,
        appTypeName,
        assigneeLabel,
        nextRunLabel,
        schedule.release,
        schedule.sprint,
        schedule.build,
        ...(schedule.suite_ids || []),
        ...(schedule.test_case_ids || [])
      ].some((value) => String(value || "").toLowerCase().includes(search));
    });
  }, [appTypeNameById, deferredExecutionSearch, executionSchedules]);
  const visibleRunLibraryIds = useMemo(() => {
    if (isExecutionRunsView(testRunsView)) {
      return activeExecutionCatalogRows.map((execution) => execution.id);
    }

    if (testRunsView === "scheduled-runs") {
      return filteredSchedules.map((schedule) => schedule.id);
    }

    if (testRunsView === "batch-process") {
      return filteredWorkspaceTransactions.map((transaction) => transaction.id);
    }

    return [];
  }, [activeExecutionCatalogRows, filteredSchedules, filteredWorkspaceTransactions, testRunsView]);
  const selectedRunLibraryActionIds = isExecutionRunsView(testRunsView)
    ? selectedActionExecutionIds
    : testRunsView === "scheduled-runs"
      ? selectedActionScheduleIds
      : selectedActionOperationIds;
  const areAllFilteredRunLibraryItemsSelected = visibleRunLibraryIds.length > 0 && visibleRunLibraryIds.every((id) => selectedRunLibraryActionIds.includes(id));

  useEffect(() => {
    if (!isExecutionRunsView(testRunsView) || !selectedExecutionId) {
      return;
    }

    if (executionsQuery.isLoading || executionsQuery.isFetching || selectedExecutionQuery.isLoading || selectedExecutionQuery.isFetching) {
      return;
    }

    if (searchParams.get("execution") && selectedExecutionQuery.data?.id === selectedExecutionId) {
      return;
    }

    if (availableExecutionCatalogRows.some((execution) => execution.id === selectedExecutionId)) {
      return;
    }

    setSelectedExecutionId("");
    setFocusedSuiteId("");
    setSelectedTestCaseId("");
    syncExecutionSearchParams("", null);
  }, [
    availableExecutionCatalogRows,
    executionsQuery.isFetching,
    executionsQuery.isLoading,
    searchParams,
    selectedExecutionId,
    selectedExecutionQuery.data,
    selectedExecutionQuery.isFetching,
    selectedExecutionQuery.isLoading,
    testRunsView
  ]);

  const executionSuiteListColumns = useMemo<Array<DataTableColumn<ExecutionSuiteNode>>>(() => [
    {
      key: "suite",
      label: "Suite",
      canToggle: false,
      minWidth: 220,
      render: (suite) => (
        <div className="automation-list-primary-cell">
          <strong>{suite.name}</strong>
          <span>{suite.id}</span>
        </div>
      ),
      sortValue: (suite) => suite.name
    },
    {
      key: "status",
      label: "Status",
      render: (suite) => {
        const suiteMetric = suiteMetrics.find((item) => item.suiteId === suite.id);
        return suiteMetric ? suiteBoardStatus(suiteMetric) : "queued";
      }
    },
    {
      key: "cases",
      label: "Cases",
      render: (suite) => (displayCasesBySuiteId[suite.id] || []).length
    },
    {
      key: "resolved",
      label: "Resolved",
      render: (suite) => {
        const suiteMetric = suiteMetrics.find((item) => item.suiteId === suite.id);
        const resolvedCount = (suiteMetric?.passedCount || 0) + (suiteMetric?.failedCount || 0) + (suiteMetric?.blockedCount || 0);
        return `${resolvedCount}/${suiteMetric?.count || 0}`;
      }
    },
    {
      key: "issues",
      label: "Bugs",
      render: (suite) => {
        const suiteMetric = suiteMetrics.find((item) => item.suiteId === suite.id);
        return (suiteMetric?.failedCount || 0) + (suiteMetric?.blockedCount || 0);
      }
    },
    {
      key: "requirements",
      label: "Impacted requirements",
      defaultVisible: false,
      render: (suite) => {
        const summary = selectedSuiteImpactSummaryById[suite.id] || EMPTY_EXECUTION_RUN_IMPACT_SUMMARY;
        return summary.totalRequirements ? `${summary.failedRequirementCount}/${summary.totalRequirements}` : "0";
      }
    },
    {
      key: "duration",
      label: "Duration",
      render: (suite) => formatDuration(suiteDurationById[suite.id], DEFAULT_DURATION_LABEL)
    },
    {
      key: "actions",
      label: "Actions",
      canToggle: false,
      render: (suite) => (
        <div onClick={(event) => event.stopPropagation()}>
          <CatalogActionMenu
            actions={[
              {
                label: "Open suite",
                description: "Show this suite's snapped cases.",
                icon: <OpenIcon />,
                onClick: () => {
                  setFocusedSuiteId(suite.id);
                  setExpandedExecutionSuiteIds((current) => (current.includes(suite.id) ? current : [...current, suite.id]));
                }
              }
            ]}
            label={`${suite.name} actions`}
          />
        </div>
      )
    }
  ], [displayCasesBySuiteId, selectedSuiteImpactSummaryById, suiteDurationById, suiteMetrics]);

  const executionCaseListColumns = useMemo<Array<DataTableColumn<ExecutionCaseView>>>(() => [
    {
      key: "case",
      label: "Test case",
      canToggle: false,
      minWidth: 240,
      render: (testCase) => (
        <div className="automation-list-primary-cell">
          <strong>{testCase.title}</strong>
          <span>{richTextToPlainText(testCase.description) || testCase.id}</span>
        </div>
      ),
      sortValue: (testCase) => testCase.title
    },
    {
      key: "status",
      label: "Status",
      render: (testCase) => caseDerivedStatus(testCase)
    },
    {
      key: "suite",
      label: "Suite",
      render: (testCase) => testCase.suite_name || "Test case run"
    },
    {
      key: "priority",
      label: "Priority",
      render: (testCase) => `P${testCase.priority || 3}`
    },
    {
      key: "steps",
      label: "Steps",
      render: (testCase) => (stepsByCaseId[testCase.id] || []).length
    },
    {
      key: "duration",
      label: "Duration",
      render: (testCase) => formatDuration(resolveCaseDurationMs(testCase.id, resultByCaseId[testCase.id]), DEFAULT_DURATION_LABEL)
    },
    {
      key: "assignee",
      label: "Assignee",
      render: (testCase) => {
        const assignedUser = testCase.assigned_user || selectedExecution?.assigned_user || null;
        return assignedUser ? resolveUserPrimaryLabel(assignedUser) : "Unassigned";
      }
    },
    {
      key: "references",
      label: "References",
      defaultVisible: false,
      render: (testCase) => testCase.external_references.length
    },
    {
      key: "actions",
      label: "Actions",
      canToggle: false,
      render: (testCase) => (
        <div onClick={(event) => event.stopPropagation()}>
          <CatalogActionMenu
            actions={[
              {
                label: "Open case",
                description: "Open the run console for this case.",
                icon: <OpenIcon />,
                onClick: () => focusExecutionCase(testCase.id)
              }
            ]}
            label={`${testCase.title} actions`}
          />
        </div>
      )
    }
  ], [caseTimerStartedAtById, isExecutionLocked, isExecutionStarted, liveNow, resultByCaseId, selectedExecution?.assigned_user, selectedExecutionId, stepsByCaseId]);

  const executionListColumns = useMemo<Array<DataTableColumn<Execution>>>(() => [
    {
      key: "id",
      label: "Run ID",
      defaultVisible: false,
      sortValue: (execution) => execution.id,
      render: (execution) => <DisplayIdBadge value={execution.id} />
    },
    {
      key: "execution",
      label: "Run",
      canToggle: false,
      render: (execution) => <strong>{execution.name || "Unnamed run"}</strong>
    },
    {
      key: "trigger",
      label: "Trigger",
      defaultVisible: false,
      render: (execution) => execution.trigger || "manual"
    },
    {
      key: "status",
      label: "Status",
      render: (execution) => executionStatusLabel(execution.status)
    },
    {
      key: "created",
      label: "Created",
      render: (execution) => formatExecutionTimestamp(execution.created_at, "Not recorded")
    },
    {
      key: "release",
      label: "Release",
      sortValue: (execution) => execution.release || "",
      render: (execution) => execution.release || "—"
    },
    {
      key: "sprint",
      label: "Sprint",
      sortValue: (execution) => execution.sprint || "",
      render: (execution) => execution.sprint || "—"
    },
    {
      key: "build",
      label: "Build",
      sortValue: (execution) => execution.build || "",
      render: (execution) => execution.build || "—"
    },
    {
      key: "assignee",
      label: "Assigned To",
      sortValue: (execution) => resolveExecutionAssigneeSummary(execution),
      render: (execution) => resolveExecutionAssigneeSummary(execution)
    },
    {
      key: "suites",
      label: "Suites",
      render: (execution) => execution.suite_ids.length
    },
    {
      key: "touched",
      label: "Touched",
      render: (execution) => {
        const summary = executionSummaryById[execution.id] || EMPTY_EXECUTION_RUN_SUMMARY;
        const totalCases = (execution.case_snapshots || []).length;
        return totalCases ? `${summary.total}/${totalCases}` : summary.total;
      }
    },
    {
      key: "issues",
      label: "Bugs",
      render: (execution) => {
        const summary = executionSummaryById[execution.id] || EMPTY_EXECUTION_RUN_SUMMARY;
        return summary.failed + summary.blocked;
      }
    },
    {
      key: "started",
      label: "Started",
      render: (execution) => formatExecutionTimestamp(execution.started_at, "Not started yet")
    },
    {
      key: "duration",
      label: "Duration",
      render: (execution) => formatDuration(computeExecutionDurationMs(execution.started_at, execution.ended_at, liveNow), DEFAULT_DURATION_LABEL)
    },
    {
      key: "latestActivity",
      label: "Latest activity",
      defaultVisible: false,
      render: (execution) => {
        const summary = executionSummaryById[execution.id] || EMPTY_EXECUTION_RUN_SUMMARY;
        return formatExecutionTimestamp(summary.latestActivityAt, "No evidence yet");
      }
    },
    {
      key: "actions",
      label: "Actions",
      canToggle: false,
      render: (execution) => {
        const summary = executionSummaryById[execution.id] || EMPTY_EXECUTION_RUN_SUMMARY;

        return (
          <div onClick={(event) => event.stopPropagation()}>
            <CatalogActionMenu
              actions={[
                {
                  label: "Open run",
                  description: "Open this run and review its evidence.",
                  icon: <OpenIcon />,
                  onClick: () => {
                    setTestRunsView(resolveExecutionRunBucket(execution));
                    focusExecution(execution.id);
                  }
                },
                {
                  label: "Rerun all",
                  description: "Create a fresh run with the same scope.",
                  icon: <PlayIcon />,
                  onClick: () => void handleRerunExecutionItem(execution, false),
                  disabled: !session?.user.id || rerunExecution.isPending
                },
                {
                  label: "Rerun failed",
                  description: summary.failed
                    ? `Create a new run using the ${summary.failed} failed case${summary.failed === 1 ? "" : "s"}.`
                    : "No failed cases are available for a targeted rerun.",
                  icon: <PlayIcon />,
                  onClick: () => void handleRerunExecutionItem(execution, true),
                  disabled: !session?.user.id || !summary.failed || rerunExecution.isPending
                }
              ]}
              label={`${execution.name || "Run"} actions`}
            />
          </div>
        );
      }
    }
  ], [executionSummaryById, handleRerunExecutionItem, liveNow, rerunExecution.isPending, session?.user.id]);
  const executionScheduleListColumns = useMemo<Array<DataTableColumn<ExecutionSchedule>>>(() => [
    {
      key: "id",
      label: "Schedule ID",
      defaultVisible: false,
      sortValue: (schedule) => schedule.id,
      render: (schedule) => <DisplayIdBadge value={schedule.id} />
    },
    {
      key: "schedule",
      label: "Schedule",
      canToggle: false,
      render: (schedule) => <strong>{schedule.name}</strong>
    },
    {
      key: "status",
      label: "Status",
      sortValue: (schedule) => schedule.is_active ? "active" : "inactive",
      render: (schedule) => (schedule.is_active ? "Active" : "Inactive")
    },
    {
      key: "cadence",
      label: "Cadence",
      sortValue: (schedule) => formatScheduleCadence(schedule.cadence),
      render: (schedule) => formatScheduleCadence(schedule.cadence)
    },
    {
      key: "assignee",
      label: "Assigned To",
      sortValue: (schedule) => resolveExecutionAssigneeSummary(schedule),
      render: (schedule) => resolveExecutionAssigneeSummary(schedule)
    },
    {
      key: "release",
      label: "Release",
      sortValue: (schedule) => schedule.release || "",
      render: (schedule) => schedule.release || "Not set"
    },
    {
      key: "sprint",
      label: "Sprint",
      defaultVisible: false,
      sortValue: (schedule) => schedule.sprint || "",
      render: (schedule) => schedule.sprint || "Not set"
    },
    {
      key: "build",
      label: "Build",
      defaultVisible: false,
      sortValue: (schedule) => schedule.build || "",
      render: (schedule) => schedule.build || "Not set"
    },
    {
      key: "suites",
      label: "Suites",
      render: (schedule) => schedule.suite_ids.length
    },
    {
      key: "directCases",
      label: "Direct cases",
      render: (schedule) => schedule.test_case_ids.length
    },
    {
      key: "nextRun",
      label: "Next run",
      render: (schedule) => formatExecutionTimestamp(schedule.next_run_at, "Not scheduled")
    },
    {
      key: "lastRun",
      label: "Last run",
      defaultVisible: false,
      render: (schedule) => formatExecutionTimestamp(schedule.last_run_at, "No runs yet")
    },
    {
      key: "actions",
      label: "Actions",
      canToggle: false,
      render: (schedule) => (
        <div onClick={(event) => event.stopPropagation()}>
          <CatalogActionMenu
            actions={[
              {
                label: "Open schedule",
                description: "Review cadence, suites, and direct cases for this schedule.",
                icon: <CalendarIcon />,
                onClick: () => {
                  setTestRunsView("scheduled-runs");
                  setSelectedScheduleId(schedule.id);
                }
              },
              {
                label: "Edit schedule",
                description: "Adjust cadence, scope, context, or ownership for this recurring run.",
                icon: <ExecutionEditIcon />,
                onClick: () => openEditScheduleBuilder(schedule)
              },
              {
                label: "Run now",
                description: "Launch this schedule immediately as a fresh run.",
                icon: <PlayIcon />,
                onClick: () => void handleRunExecutionSchedule(schedule.id)
              },
              {
                label: "Delete schedule",
                description: "Remove this schedule from future run planning.",
                icon: <TrashIcon />,
                onClick: () => void handleDeleteExecutionSchedule(schedule.id, schedule.name),
                tone: "danger" as const
              }
            ]}
            label={`${schedule.name} actions`}
          />
        </div>
      )
    }
  ], [handleDeleteExecutionSchedule, handleRunExecutionSchedule, openEditScheduleBuilder]);
  const operationListColumns = useMemo<Array<DataTableColumn<WorkspaceTransaction>>>(() => [
    {
      key: "id",
      label: "Operation ID",
      defaultVisible: false,
      sortValue: (transaction) => transaction.id,
      render: (transaction) => <DisplayIdBadge value={transaction.id} />
    },
    {
      key: "operation",
      label: "Batch process",
      canToggle: false,
      render: (transaction) => {
        const presentation = describeWorkspaceTransaction(transaction, {
          appTypeNameById,
          projectNameById
        });

        return (
          <div className="data-table-multiline batch-process-name-cell">
            <strong title={transaction.title}>{truncateProcessName(transaction.title)}</strong>
            <span className="data-table-multiline-line" title={presentation.eyebrow}>
              {truncateProcessName(presentation.eyebrow, 64)}
            </span>
          </div>
        );
      }
    },
    {
      key: "status",
      label: "Status",
      render: (transaction) => <StatusBadge value={transaction.status} />
    },
    {
      key: "provider",
      label: "Provider",
      defaultVisible: false,
      render: (transaction) => String(transaction.metadata?.provider || transaction.category).replace(/_/g, " ")
    },
    {
      key: "events",
      label: "Events",
      render: (transaction) => transaction.event_count || 0
    },
    {
      key: "updated",
      label: "Last activity",
      render: (transaction) => formatExecutionTimestamp(transaction.latest_event_at || transaction.updated_at || transaction.completed_at || transaction.created_at, "Not recorded")
    },
    {
      key: "actions",
      label: "Actions",
      canToggle: false,
      render: (transaction) => (
        <div onClick={(event) => event.stopPropagation()}>
          <CatalogActionMenu
            actions={[
              {
                label: "Open batch process",
                description: "Inspect transaction metadata and event logs.",
                icon: <ActivityIcon />,
                onClick: () => {
                  setTestRunsView("batch-process");
                  openWorkspaceTransactionDetail(transaction.id);
                }
              }
            ]}
            label={`${transaction.title} actions`}
          />
        </div>
      )
    }
  ], [appTypeNameById, projectNameById]);

  const activeExecutionFilterCount =
    Number(executionStatusFilter !== "all") +
    Number(executionIssueFilter !== "all") +
    Number(executionEvidenceFilter !== "all");

  const executionCardMeasureTarget = activeExecutionCatalogRows[0] || null;

  useEffect(() => {
    const node = executionCardMeasureRef.current;
    if (!node) {
      return;
    }

    const updateHeight = () => {
      const nextHeight = Math.max(180, Math.ceil(node.getBoundingClientRect().height) + 12);
      setExecutionListItemHeight((current) => (Math.abs(current - nextHeight) > 1 ? nextHeight : current));
    };

    updateHeight();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => updateHeight());
    observer.observe(node);

    return () => observer.disconnect();
  }, [executionCardMeasureTarget?.id]);

  const smartPreviewCases = smartExecutionPreview?.cases || [];
  const selectedSmartExecutionCases = useMemo(
    () => smartPreviewCases.filter((testCase) => selectedSmartExecutionCaseIds.includes(testCase.test_case_id)),
    [selectedSmartExecutionCaseIds, smartPreviewCases]
  );
  const selectedSmartExecutableCaseIds = useMemo(
    () =>
      selectedSmartExecutionCases
        .filter((testCase) => executionStartMode === "manual" || smartExecutionLibraryCaseById.get(testCase.test_case_id)?.automated === "yes")
        .map((testCase) => testCase.test_case_id),
    [executionStartMode, selectedSmartExecutionCases, smartExecutionLibraryCaseById]
  );

  useEffect(() => {
    if (executionCreateMode !== "smart" || executionStartMode === "manual" || !selectedSmartExecutionCaseIds.length) {
      return;
    }

    const automatedSelectedIds = selectedSmartExecutionCaseIds.filter((testCaseId) => smartExecutionLibraryCaseById.get(testCaseId)?.automated === "yes");

    if (automatedSelectedIds.length !== selectedSmartExecutionCaseIds.length) {
      setSelectedSmartExecutionCaseIds(automatedSelectedIds);
    }
  }, [executionCreateMode, executionStartMode, selectedSmartExecutionCaseIds, smartExecutionLibraryCaseById]);

  const canCreateExecution =
    executionCreateMode === "smart"
      ? Boolean(projectId && appTypeId && selectedSmartExecutableCaseIds.length)
      : Boolean(projectId && appTypeId && selectedSuiteIds.length);

  const persistCaseOutcomeOnly = async (testCaseId: string, status: "passed" | "failed") => {
    const scopedAppTypeId = selectedExecution?.app_type_id;
    const currentCaseSnapshot = snapshotCases.find((snapshot) => snapshot.test_case_id === testCaseId);
    if (!selectedExecution || !scopedAppTypeId || !currentCaseSnapshot) {
      return;
    }

    const fresh =
      queryClient.getQueryData<ExecutionResult[]>(["execution-results", selectedExecution.id]) || executionResults;
    const existing = fresh.find((item) => item.test_case_id === testCaseId);
    const prev = parseExecutionLogs(existing?.logs || null);
    const logs = stringifyExecutionLogs({
      stepStatuses: prev.stepStatuses || {},
      stepNotes: prev.stepNotes || {},
      stepEvidence: prev.stepEvidence || {},
      stepDefects: prev.stepDefects || {},
      stepApiDetails: prev.stepApiDetails || {},
      stepWebDetails: prev.stepWebDetails || {},
      stepCaptures: prev.stepCaptures || {}
    });
    const durationMs = resolvePersistedCaseDurationMs(testCaseId, existing);

    if (existing) {
      await updateResult.mutateAsync({
        id: existing.id,
        input: {
          status,
          duration_ms: durationMs ?? undefined,
          logs,
          error: status === "failed" ? "Marked at suite level" : ""
        }
      });
      queryClient.setQueryData<ExecutionResult[]>(["execution-results", selectedExecution.id], (current = []) =>
        current.map((item) =>
          item.id === existing.id
            ? { ...item, status, duration_ms: durationMs, logs, error: status === "failed" ? "Marked at suite level" : null }
            : item
        )
      );
      return;
    }

    const response = await createResult.mutateAsync({
      execution_id: selectedExecution.id,
      test_case_id: testCaseId,
      app_type_id: scopedAppTypeId,
      status,
      duration_ms: durationMs ?? undefined,
      logs,
      error: status === "failed" ? "Marked at suite level" : undefined,
      external_references: currentCaseSnapshot.external_references || [],
      defects: [],
      executed_by: session!.user.id
    });

    queryClient.setQueryData<ExecutionResult[]>(["execution-results", selectedExecution.id], (current = []) => [
      {
        id: response.id,
        execution_id: selectedExecution.id,
        test_case_id: testCaseId,
        test_case_title: currentCaseSnapshot.test_case_title,
        suite_id: currentCaseSnapshot.suite_id,
        suite_name: currentCaseSnapshot.suite_name,
        app_type_id: scopedAppTypeId,
        status,
        duration_ms: durationMs,
        error: status === "failed" ? "Marked at suite level" : null,
        logs,
        external_references: currentCaseSnapshot.external_references || [],
        defects: [],
        executed_by: session!.user.id
      },
      ...current
    ]);
  };

  const handleSuiteBulkStatus = async (suiteId: string, status: "passed" | "failed") => {
    if (!selectedExecution || !isExecutionStarted || isExecutionLocked) {
      return;
    }

    const suiteCases = displayCasesBySuiteId[suiteId] || [];
    if (!suiteCases.length) {
      return;
    }

    try {
      for (const testCase of suiteCases) {
        const steps = stepsByCaseId[testCase.id] || [];
        if (steps.length) {
          const patch = steps.reduce<Record<string, ExecutionStepStatus>>((acc, step) => {
            acc[step.id] = status;
            return acc;
          }, {});
          await persistCaseResult(testCase.id, { stepStatusesPatch: patch }, { refresh: false });
        } else {
          await persistCaseOutcomeOnly(testCase.id, status);
        }
      }

      await refreshExecutionScope();
      showSuccess(`Suite marked ${status} for all cases.`);
    } catch (error) {
      showError(error, "Unable to update suite");
    }
  };

  const renderExecutionCaseCatalog = ({
    cases,
    emptyMessage,
    storageKey,
    suiteId,
    suiteName
  }: {
    cases: ExecutionCaseView[];
    emptyMessage: string;
    storageKey: string;
    suiteId?: string;
    suiteName: string;
  }) => {
    const resolvedEmptyMessage = executionCaseSearch.trim() ? "No cases match the current search." : emptyMessage;

    return (
      <div className="execution-run-case-catalog">
        <div className="design-list-toolbar execution-run-detail-toolbar execution-suite-case-toolbar">
          <CatalogSearchFilter
            activeFilterCount={executionCaseSearch.trim() ? 1 : 0}
            ariaLabel="Search run cases"
            onChange={setExecutionCaseSearch}
            placeholder="Search cases"
            subtitle="Search the snapped case title, suite, status, priority, assignee, or step count."
            title="Case search"
            type="search"
            value={executionCaseSearch}
          >
            <div className="catalog-filter-grid">
              <div className="catalog-filter-actions">
                <button className="ghost-button" disabled={!executionCaseSearch.trim()} onClick={() => setExecutionCaseSearch("")} type="button">
                  Clear search
                </button>
              </div>
            </div>
          </CatalogSearchFilter>
          <CatalogViewToggle onChange={setExecutionCaseCatalogViewMode} value={executionCaseCatalogViewMode} />
          {suiteId ? (
            <>
              <button
                className="ghost-button suite-bulk-pass"
                disabled={!isExecutionStarted || isExecutionLocked}
                onClick={() => void handleSuiteBulkStatus(suiteId, "passed")}
                type="button"
              >
                <ExecutionSuiteIcon />
                <span>Suite Pass</span>
              </button>
              <button
                className="ghost-button danger suite-bulk-fail"
                disabled={!isExecutionStarted || isExecutionLocked}
                onClick={() => void handleSuiteBulkStatus(suiteId, "failed")}
                type="button"
              >
                <ExecutionSuiteIcon />
                <span>Suite Fail</span>
              </button>
            </>
          ) : null}
        </div>

        {executionCaseCatalogViewMode === "tile" ? (
          <div className="tree-children">
            {cases.map((testCase) => (
              <ExecutionSuiteCaseCard
                assignedUser={testCase.assigned_user || selectedExecution?.assigned_user || null}
                caseStatus={caseDerivedStatus(testCase)}
                durationLabel={formatDuration(resolveCaseDurationMs(testCase.id, resultByCaseId[testCase.id]), DEFAULT_DURATION_LABEL)}
                isActive={selectedTestCaseId === testCase.id}
                isNext={nextFocusCase?.id === testCase.id}
                key={`${testCase.suite_id || "direct"}-${testCase.id}`}
                onSelect={() => focusExecutionCase(testCase.id)}
                stepCount={(stepsByCaseId[testCase.id] || []).length}
                suiteName={suiteName}
                testCase={testCase}
              />
            ))}
            {!cases.length ? <div className="empty-state compact">{resolvedEmptyMessage}</div> : null}
          </div>
        ) : (
          <DataTable
            columns={executionCaseListColumns}
            enableColumnResize
            enableHeaderColumnReorder
            emptyMessage={resolvedEmptyMessage}
            getRowClassName={(testCase) => (selectedTestCaseId === testCase.id ? "is-active-row" : "")}
            getRowKey={(testCase, index) => `${testCase.suite_id || "direct"}-${testCase.id}-${index}`}
            onRowClick={(testCase) => focusExecutionCase(testCase.id)}
            rows={cases}
            storageKey={storageKey}
          />
        )}
      </div>
    );
  };

  return (
    <div className="page-content page-content--executions-full">
      {confirmationDialog}
      {showExecutionListHeader ? (
        <PageHeader
          eyebrow="Test Runs"
          title={
            testRunsView === "test-case-runs"
              ? "Test Case Runs"
              : testRunsView === "suite-runs"
                ? "Suite Runs"
                : testRunsView === "local-runs"
                  ? "Local Runs"
                : testRunsView === "scheduled-runs"
                  ? "Scheduled Runs"
                  : "Batch Process"
          }
          description={
            testRunsView === "test-case-runs"
              ? "Review direct case runs without forcing them through a default suite wrapper, then open any run or case tile for its full detail view."
              : testRunsView === "suite-runs"
                ? "Launch suite-scoped runs, monitor live progress, and capture failure evidence without losing the surrounding suite and case context."
                : testRunsView === "local-runs"
                  ? "Watch runs started directly on your local Playwright runner and review the callback evidence they produce."
                : testRunsView === "scheduled-runs"
                  ? "Plan recurring release checks separately from live runs so teams can see what is scheduled next without cluttering the active runs board."
                  : "Review imports, exports, AI generation, and other background jobs with full traceable details."
          }
          meta={[
            {
              label:
                testRunsView === "test-case-runs"
                  ? "Case runs"
                  : testRunsView === "suite-runs"
                    ? "Suite runs"
                    : testRunsView === "local-runs"
                      ? "Local runs"
                    : testRunsView === "scheduled-runs"
                      ? "Schedules"
                      : "Batch records",
              value:
                isExecutionRunsView(testRunsView)
                  ? activeExecutionRowsCount
                  : testRunsView === "scheduled-runs"
                    ? executionSchedules.length
                    : workspaceTransactions.length
            },
            {
              label:
                isExecutionRunsView(testRunsView)
                  ? "Blocking cases"
                  : testRunsView === "scheduled-runs"
                    ? "Active schedules"
                    : "Running now",
              value:
                isExecutionRunsView(testRunsView)
                  ? blockingCases.length
                  : testRunsView === "scheduled-runs"
                    ? executionSchedules.filter((schedule) => schedule.is_active).length
                    : workspaceTransactionStatusCounts.running || 0
            },
            {
              label:
                isExecutionRunsView(testRunsView)
                  ? "Completion"
                  : testRunsView === "scheduled-runs"
                    ? "Next due"
                    : "Failures",
              value:
                isExecutionRunsView(testRunsView)
                  ? `${executionProgress.percent}%`
                  : testRunsView === "scheduled-runs"
                    ? (filteredSchedules[0]?.next_run_at ? formatExecutionTimestamp(filteredSchedules[0].next_run_at, "Not set") : "Not set")
                    : workspaceTransactionStatusCounts.failed || 0
            }
          ]}
        />
      ) : null}

      <ToastMessage message={message} onDismiss={() => setMessage("")} tone={messageTone} />

      <WorkspaceMasterDetail
        browseView={(
          <Panel
            className="execution-panel execution-panel--list"
            title={runLibraryTitle}
            subtitle={runLibrarySubtitle}
          >
            <div className="design-list-toolbar executions-list-toolbar">
              <CatalogViewToggle onChange={handleCatalogViewModeChange} value={catalogViewMode} />
              <CatalogSearchFilter
                activeFilterCount={isExecutionRunsView(testRunsView) ? activeExecutionFilterCount : 0}
                ariaLabel={runLibrarySearchPlaceholder}
                onChange={handleRunLibrarySearchChange}
                placeholder={runLibrarySearchPlaceholder}
                subtitle={runLibrarySearchSubtitle}
                title={runLibrarySearchTitle}
                type="search"
                value={executionSearch}
              >
                <div className="catalog-filter-grid">
                  {isExecutionRunsView(testRunsView) ? (
                  <label className="catalog-filter-field">
                    <span>Status</span>
                    <select
                      value={executionStatusFilter}
                      onChange={(event) => setExecutionStatusFilter(event.target.value as ExecutionStatus | "all")}
                    >
                      <option value="all">All statuses</option>
                      {executionStatusOptions.map((status) => (
                        <option key={status} value={status}>
                          {executionStatusLabel(status)}
                        </option>
                      ))}
                    </select>
                  </label>
                  ) : null}

                  {isExecutionRunsView(testRunsView) ? (
                  <label className="catalog-filter-field">
                    <span>Bug count</span>
                    <select
                      value={executionIssueFilter}
                      onChange={(event) => setExecutionIssueFilter(event.target.value as ExecutionIssueFilter)}
                    >
                      <option value="all">All runs</option>
                      <option value="with-issues">With failed or blocked cases</option>
                      <option value="clean">No failed or blocked cases</option>
                    </select>
                  </label>
                  ) : null}

                  {isExecutionRunsView(testRunsView) ? (
                  <label className="catalog-filter-field">
                    <span>Evidence activity</span>
                    <select
                      value={executionEvidenceFilter}
                      onChange={(event) => setExecutionEvidenceFilter(event.target.value as ExecutionEvidenceFilter)}
                    >
                      <option value="all">All runs</option>
                      <option value="with-evidence">Touched cases recorded</option>
                      <option value="no-evidence">No evidence yet</option>
                    </select>
                  </label>
                  ) : null}

                  <div className="catalog-filter-actions">
                    <button
                      className="ghost-button"
                      disabled={!activeExecutionFilterCount}
                      onClick={() => {
                        setExecutionStatusFilter("all");
                        setExecutionIssueFilter("all");
                        setExecutionEvidenceFilter("all");
                      }}
                      type="button"
                    >
                      Clear filters
                    </button>
                  </div>
                </div>
              </CatalogSearchFilter>
              <button
                className="ghost-button catalog-selection-button"
                disabled={!visibleRunLibraryIds.length || areAllFilteredRunLibraryItemsSelected}
                onClick={() => {
                  if (isExecutionRunsView(testRunsView)) {
                    setSelectedActionExecutionIds((current) => Array.from(new Set([...current, ...visibleRunLibraryIds])));
                  } else if (testRunsView === "scheduled-runs") {
                    setSelectedActionScheduleIds((current) => Array.from(new Set([...current, ...visibleRunLibraryIds])));
                  } else {
                    setSelectedActionOperationIds((current) => Array.from(new Set([...current, ...visibleRunLibraryIds])));
                  }
                }}
                type="button"
              >
                <SelectAllIcon />
                <span>Select all</span>
              </button>
              {selectedRunLibraryActionIds.length ? (
                <button
                  className="ghost-button catalog-selection-button"
                  onClick={() => {
                    if (isExecutionRunsView(testRunsView)) {
                      setSelectedActionExecutionIds([]);
                    } else if (testRunsView === "scheduled-runs") {
                      setSelectedActionScheduleIds([]);
                    } else {
                      setSelectedActionOperationIds([]);
                    }
                  }}
                  type="button"
                >
                  <ClearSelectionIcon />
                  <span>Clear</span>
                </button>
              ) : null}
              {testRunsView !== "batch-process" ? (
                <div className="catalog-toolbar-actions executions-run-actions">
                  <button
                    className="ghost-button"
                    onClick={openCreateScheduleBuilder}
                    type="button"
                  >
                    <CalendarIcon />
                    Schedule Run
                  </button>
                  <CreateRunActionButton
                    source="TEST_RUNS"
                    onCreateManualRun={() => openExecutionBuilder("manual")}
                    onCreateLocalRun={() => openExecutionBuilder("local")}
                    onCreateRemoteRun={() => openExecutionBuilder("remote")}
                  />
                </div>
              ) : null}
            </div>

            {(isExecutionRunsView(testRunsView) ? executionsQuery.isLoading : testRunsView === "scheduled-runs" ? executionSchedulesQuery.isLoading : workspaceTransactionsQuery.isLoading) ? (
              <TileCardSkeletonGrid />
            ) : null}

            {!(isExecutionRunsView(testRunsView) ? executionsQuery.isLoading : testRunsView === "scheduled-runs" ? executionSchedulesQuery.isLoading : workspaceTransactionsQuery.isLoading) ? (
              <div className={catalogViewMode === "tile" ? `tile-browser-grid${testRunsView === "batch-process" ? " batch-process-browser-grid" : ""}` : ""}>
                {isExecutionRunsView(testRunsView) && catalogViewMode === "tile"
                  ? activeExecutionCatalogRows.map((execution) => (
                      <ExecutionListCard
                        key={execution.id}
                        execution={execution}
                        isActive={selectedExecution?.id === execution.id}
                        isSelected={selectedActionExecutionIds.includes(execution.id)}
                        liveNow={liveNow}
                        onSelect={() => focusExecution(execution.id)}
                        onToggleSelected={() =>
                          setSelectedActionExecutionIds((current) =>
                            current.includes(execution.id)
                              ? current.filter((id) => id !== execution.id)
                              : [...current, execution.id]
                          )
                        }
                        impactSummary={executionImpactSummaryById[execution.id] || EMPTY_EXECUTION_RUN_IMPACT_SUMMARY}
                        summary={executionSummaryById[execution.id] || EMPTY_EXECUTION_RUN_SUMMARY}
                      />
                    ))
                  : null}
                {testRunsView === "scheduled-runs" && catalogViewMode === "tile"
                  ? filteredSchedules.map((schedule) => (
                      <ExecutionScheduleCard
                        key={schedule.id}
                        isActive={selectedSchedule?.id === schedule.id}
                        isSelected={selectedActionScheduleIds.includes(schedule.id)}
                        onDelete={() => void handleDeleteExecutionSchedule(schedule.id, schedule.name)}
                        onEdit={() => openEditScheduleBuilder(schedule)}
                        onRun={() => void handleRunExecutionSchedule(schedule.id)}
                        onSelect={() => setSelectedScheduleId(schedule.id)}
                        onToggleSelected={() =>
                          setSelectedActionScheduleIds((current) =>
                            current.includes(schedule.id)
                              ? current.filter((id) => id !== schedule.id)
                              : [...current, schedule.id]
                          )
                        }
                        schedule={schedule}
                      />
                    ))
                  : null}
                {testRunsView === "batch-process" && catalogViewMode === "tile"
                  ? filteredWorkspaceTransactions.map((transaction) => (
                      <WorkspaceTransactionCard
                        appTypeNameById={appTypeNameById}
                        isActive={selectedWorkspaceTransaction?.id === transaction.id}
                        isSelected={selectedActionOperationIds.includes(transaction.id)}
                        key={transaction.id}
                        onSelect={() => openWorkspaceTransactionDetail(transaction.id)}
                        onToggleSelected={() =>
                          setSelectedActionOperationIds((current) =>
                            current.includes(transaction.id)
                              ? current.filter((id) => id !== transaction.id)
                              : [...current, transaction.id]
                          )
                        }
                        projectNameById={projectNameById}
                        transaction={transaction}
                      />
                    ))
                  : null}
                {isExecutionRunsView(testRunsView) && catalogViewMode === "list" ? (
                  <DataTable
                    columns={executionListColumns}
                    emptyMessage="No runs created yet."
                    getRowClassName={(execution) => (selectedExecution?.id === execution.id ? "is-active-row" : "")}
                    getRowKey={(execution) => execution.id}
                    onRowClick={(execution) => focusExecution(execution.id)}
                    rows={activeExecutionCatalogRows}
                    storageKey="qaira:executions:list-columns"
                  />
                ) : null}
                {testRunsView === "scheduled-runs" && catalogViewMode === "list" ? (
                  <DataTable
                    columns={executionScheduleListColumns}
                    emptyMessage="No schedules created yet."
                    getRowClassName={(schedule) => (selectedSchedule?.id === schedule.id ? "is-active-row" : "")}
                    getRowKey={(schedule) => schedule.id}
                    onRowClick={(schedule) => setSelectedScheduleId(schedule.id)}
                    rows={filteredSchedules}
                    storageKey="qaira:execution-schedules:list-columns"
                  />
                ) : null}
                {testRunsView === "batch-process" && catalogViewMode === "list" ? (
                  <DataTable
                    columns={operationListColumns}
                    emptyMessage="No batch process records have been recorded yet."
                    getRowClassName={(transaction) => (selectedWorkspaceTransaction?.id === transaction.id ? "is-active-row" : "")}
                    getRowKey={(transaction) => transaction.id}
                    onRowClick={(transaction) => openWorkspaceTransactionDetail(transaction.id)}
                    rows={filteredWorkspaceTransactions}
                    storageKey="qaira:operations:list-columns"
                  />
                ) : null}
                {catalogViewMode === "tile" && isExecutionRunsView(testRunsView) && !activeExecutionCatalogRows.length ? (
                  <div className="empty-state compact">
                    {testRunsView === "test-case-runs"
                      ? "No direct test case runs created yet."
                      : testRunsView === "local-runs"
                        ? "No local runs created yet."
                        : "No suite runs created yet."}
                  </div>
                ) : null}
                {catalogViewMode === "tile" && testRunsView === "scheduled-runs" && !filteredSchedules.length ? <div className="empty-state compact">No schedules created yet.</div> : null}
                {catalogViewMode === "tile" && testRunsView === "batch-process" && !filteredWorkspaceTransactions.length ? <div className="empty-state compact">No batch process records have been recorded for this scope yet.</div> : null}
              </div>
            ) : null}
          </Panel>
        )}
        detailView={(
          testRunsView === "batch-process" ? (
            <Panel
              actions={selectedWorkspaceTransaction ? <WorkspaceBackButton label="Back to batch process" onClick={closeWorkspaceTransactionDetail} /> : undefined}
              className="execution-panel execution-panel--detail"
              title={selectedWorkspaceTransaction ? selectedWorkspaceTransaction.title : "Batch process detail"}
              subtitle={selectedWorkspaceTransaction ? "Inspect metadata, recent state, and the full event timeline for this background process." : "Select a batch process tile or list row to inspect its trace log."}
            >
              {selectedWorkspaceTransaction ? (
                (() => {
                  const presentation = describeWorkspaceTransaction(selectedWorkspaceTransaction, {
                    appTypeNameById,
                    projectNameById
                  });
                  const summary = resolveWorkspaceTransactionSummary(selectedWorkspaceTransaction, presentation);
                  const readableMetadata = resolveWorkspaceTransactionReadableMetadata(selectedWorkspaceTransaction);
                  const complexMetadata = resolveWorkspaceTransactionComplexMetadata(selectedWorkspaceTransaction);
                  const durationLabel = formatDuration(
                    computeExecutionDurationMs(
                      selectedWorkspaceTransaction.started_at || selectedWorkspaceTransaction.created_at || null,
                      selectedWorkspaceTransaction.completed_at || selectedWorkspaceTransaction.updated_at || null,
                      liveNow
                    ),
                    DEFAULT_DURATION_LABEL
                  );
                  const relatedLabel =
                    selectedWorkspaceTransaction.related_kind && selectedWorkspaceTransaction.related_id
                      ? `${formatWorkspaceTransactionActionLabel(selectedWorkspaceTransaction.related_kind)} · ${selectedWorkspaceTransaction.related_id}`
                      : "Not linked";

                  return (
                <div className="detail-stack">
                  <div className="detail-summary">
                    <strong>{selectedWorkspaceTransaction.title}</strong>
                    <span>{selectedWorkspaceTransaction.description || summary || "No summary provided for this background process."}</span>
                    <span>{selectedWorkspaceTransaction.created_user ? resolveUserPrimaryLabel(selectedWorkspaceTransaction.created_user) : "System"} · {formatExecutionTimestamp(selectedWorkspaceTransaction.created_at, "Timestamp unavailable")}</span>
                  </div>

                  <div className="metric-strip compact">
                    <div className="mini-card">
                      <strong>{selectedWorkspaceTransaction.status}</strong>
                      <span>Status</span>
                    </div>
                    <div className="mini-card">
                      <strong>{selectedWorkspaceTransaction.event_count || 0}</strong>
                      <span>Events</span>
                    </div>
                    <div className="mini-card">
                      <strong>{durationLabel}</strong>
                      <span>Duration</span>
                    </div>
                    <div className="mini-card">
                      <strong>{formatExecutionTimestamp(selectedWorkspaceTransaction.latest_event_at || selectedWorkspaceTransaction.updated_at, "Not recorded")}</strong>
                      <span>Latest activity</span>
                    </div>
                  </div>

                  <div className="stack-list">
                    <div className="stack-item">
                      <div>
                        <strong>Scope</strong>
                        <span>
                          {selectedWorkspaceTransaction.app_type_id
                            ? appTypeNameById[selectedWorkspaceTransaction.app_type_id] || "App type scope"
                            : selectedWorkspaceTransaction.project_id
                              ? projectNameById[selectedWorkspaceTransaction.project_id] || "Project scope"
                              : "Workspace scope"}
                        </span>
                      </div>
                      <StatusBadge value={selectedWorkspaceTransaction.status} />
                    </div>
                    <div className="stack-item">
                      <div>
                        <strong>Action</strong>
                        <span>{formatWorkspaceTransactionActionLabel(selectedWorkspaceTransaction.action)}</span>
                      </div>
                    </div>
                    <div className="stack-item">
                      <div>
                        <strong>Category</strong>
                        <span>{formatWorkspaceTransactionActionLabel(selectedWorkspaceTransaction.category)}</span>
                      </div>
                    </div>
                    <div className="stack-item">
                      <div>
                        <strong>Related record</strong>
                        <span>{relatedLabel}</span>
                      </div>
                    </div>
                    {readableMetadata.length ? (
                      <div className="stack-item execution-operation-metadata">
                        <div>
                          <strong>Captured details</strong>
                          <span>Readable metadata collected for this batch process.</span>
                        </div>
                        <div className="stack-list execution-operation-detail-list">
                          {readableMetadata.map((entry) => (
                            <div className="stack-item" key={entry.key}>
                              <div>
                                <strong>{entry.label}</strong>
                                <span>{formatWorkspaceTransactionMetadataValue(entry.value)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {complexMetadata ? (
                      <div className="stack-item execution-operation-metadata">
                        <div>
                          <strong>Raw metadata</strong>
                          <span>Structured context that did not fit into the readable detail fields above.</span>
                        </div>
                        <code className="execution-operation-json">{JSON.stringify(complexMetadata, null, 2)}</code>
                      </div>
                    ) : null}
                  </div>

                  <div className="execution-context-summary-head">
                    <div className="execution-context-summary-copy">
                      <div className="execution-context-summary-title-row">
                        <strong>Trace log</strong>
                        <InfoTooltip
                          content="Every recorded stage for this batch process appears below in the order it happened."
                          label="Trace log information"
                        />
                      </div>
                    </div>
                    <span className="count-pill">
                      {selectedWorkspaceTransactionEventsQuery.isLoading
                        ? "Loading…"
                        : `${(selectedWorkspaceTransactionEventsQuery.data || []).length} event${(selectedWorkspaceTransactionEventsQuery.data || []).length === 1 ? "" : "s"}`}
                    </span>
                  </div>

                  {selectedWorkspaceTransactionEventsQuery.error instanceof Error ? (
                    <div className="empty-state compact">{selectedWorkspaceTransactionEventsQuery.error.message}</div>
                  ) : null}

                  {!selectedWorkspaceTransactionEventsQuery.error && selectedWorkspaceTransactionEventsQuery.isLoading ? (
                    <LoadingState label="Loading process events" />
                  ) : null}

                  {!selectedWorkspaceTransactionEventsQuery.error && !(selectedWorkspaceTransactionEventsQuery.data || []).length && !selectedWorkspaceTransactionEventsQuery.isLoading ? (
                    <div className="empty-state compact">No event log has been recorded for this batch process yet.</div>
                  ) : null}

                  {!selectedWorkspaceTransactionEventsQuery.error && (selectedWorkspaceTransactionEventsQuery.data || []).length ? (
                    <div className="stack-list execution-activity-list">
                      {(selectedWorkspaceTransactionEventsQuery.data || []).map((event) => (
                        <details className="stack-item execution-operation-event" key={event.id}>
                          <summary className="execution-operation-event-summary">
                            <div>
                              <strong>{event.message}</strong>
                              <span>{event.phase ? `${event.phase} · ` : ""}{formatExecutionTimestamp(event.created_at, "Timestamp unavailable")}</span>
                            </div>
                            <span className={`status-badge ${event.level}`}>{event.level}</span>
                          </summary>
                          {Object.keys(event.details || {}).length ? (
                            <code className="execution-operation-json">{JSON.stringify(event.details, null, 2)}</code>
                          ) : null}
                        </details>
                      ))}
                    </div>
                  ) : null}
                </div>
                  );
                })()
              ) : (
                <div className="empty-state compact">Choose a batch process tile to review its full timeline, captured metadata, and related job context.</div>
              )}
            </Panel>
          ) : testRunsView === "scheduled-runs" ? (
            <Panel
              className="execution-panel execution-panel--detail"
              title="Scheduled run"
              subtitle={selectedSchedule ? "Review cadence, scope, and run context for this recurring run." : "Select a scheduled run to inspect its scope."}
            >
              {selectedSchedule ? (
                <div className="detail-stack">
                  <div className="detail-summary">
                    <strong>{selectedSchedule.name}</strong>
                    <span>{selectedSchedule.is_active ? "Active schedule" : "Inactive schedule"} · {formatScheduleCadence(selectedSchedule.cadence)}</span>
                    <span>Next run: {formatExecutionTimestamp(selectedSchedule.next_run_at, "Not set")}</span>
                    <span>{[selectedSchedule.release ? `Release ${selectedSchedule.release}` : null, selectedSchedule.sprint ? `Sprint ${selectedSchedule.sprint}` : null, selectedSchedule.build ? `Build ${selectedSchedule.build}` : null].filter(Boolean).join(" · ") || "Release, sprint, and build not set"}</span>
                  </div>
                  <div className="metric-strip compact">
                    <div className="mini-card">
                      <strong>{selectedSchedule.suite_ids.length}</strong>
                      <span>Suites</span>
                    </div>
                    <div className="mini-card">
                      <strong>{selectedSchedule.test_case_ids.length}</strong>
                      <span>Direct cases</span>
                    </div>
                    <div className="mini-card">
                      <strong>{resolveExecutionAssigneeSummary(selectedSchedule)}</strong>
                      <span>Assigned To</span>
                    </div>
                    <div className="mini-card">
                      <strong>{selectedSchedule.release || "Not set"}</strong>
                      <span>Release</span>
                    </div>
                    <div className="mini-card">
                      <strong>{selectedSchedule.build || selectedSchedule.sprint || "Not set"}</strong>
                      <span>{selectedSchedule.build ? "Build" : selectedSchedule.sprint ? "Sprint" : "Build / Sprint"}</span>
                    </div>
                  </div>
                  <div className="action-row">
                    <button className="ghost-button" onClick={() => openEditScheduleBuilder(selectedSchedule)} type="button">
                      <ExecutionEditIcon />
                      <span>Edit schedule</span>
                    </button>
                    <button className="ghost-button" onClick={openCreateScheduleBuilder} type="button">
                      <CalendarIcon />
                      <span>New schedule</span>
                    </button>
                    <button className="primary-button" onClick={() => void handleRunExecutionSchedule(selectedSchedule.id)} type="button">
                      Run now
                    </button>
                    <button className="ghost-button danger" onClick={() => void handleDeleteExecutionSchedule(selectedSchedule.id, selectedSchedule.name)} type="button">
                      Delete schedule
                    </button>
                  </div>
                </div>
              ) : (
                <div className="detail-stack">
                  <div className="empty-state compact">Choose a scheduled run from the left to review or launch it.</div>
                  <div className="action-row">
                    <button className="ghost-button" onClick={openCreateScheduleBuilder} type="button">
                      <CalendarIcon />
                      <span>Create schedule</span>
                    </button>
                  </div>
                </div>
              )}
            </Panel>
          ) : activeExecutionStage === "case" ? (
            <Panel
              className="execution-panel execution-panel--detail"
              actions={<WorkspaceBackButton label={`Back to ${focusedExecutionSuite?.name || "run suites"}`} onClick={closeCaseDrilldown} />}
              title="Run console"
              subtitle="Run the selected case, capture evidence, and inspect logs and history without the rest of the workspace crowding the screen."
            >
              {selectedExecution && selectedExecutionCase ? (
                <div className="execution-panel-body execution-panel-body--detail">
                  <div className="detail-stack">
                    <div className="execution-detail-hero">
                      <div className="execution-detail-heading">
                        <div className="execution-health-status-row">
                          <StatusBadge value={selectedCaseStatusLabel} />
                          {selectedExecutionCase.suite_name ? <span className="count-pill">{selectedExecutionCase.suite_name}</span> : null}
                          <ExecutionAssigneeChip className="execution-card-assignee--compact" user={selectedExecutionCaseEffectiveUser} />
                          <span className="execution-health-trigger">{selectedExecution?.name || "Selected run"}</span>
                        </div>
                        <strong>{selectedExecutionCaseReadableTitle || selectedExecutionCase.title}</strong>
                        <span>{selectedExecutionCaseReadableDescription || "Execute this case step by step and capture evidence as you go."}</span>
                      </div>

                      <div className="execution-detail-glance">
                        <div className="execution-detail-card">
                          <span>Case duration</span>
                          <strong>{formatDuration(selectedCaseDurationMs, DEFAULT_DURATION_LABEL)}</strong>
                          <small>{selectedExecutionResult?.created_at ? `Last evidence ${formatExecutionTimestamp(selectedExecutionResult.created_at)}` : "Duration appears as the case is executed"}</small>
                        </div>
                        <div className="execution-detail-card">
                          <span>Step completion</span>
                          <strong>{selectedSteps.length ? `${selectedStepProgress.percent}%` : "0%"}</strong>
                          <small>{selectedSteps.length ? `${selectedStepProgress.passedCount + selectedStepProgress.failedCount}/${selectedSteps.length} steps resolved` : "No steps loaded for this case"}</small>
                        </div>
                        <div className="execution-detail-card">
                          <span>Evidence captured</span>
                          <strong>{resolvedEvidenceArtifactCount}</strong>
                          <small>
                            {resolvedEvidenceArtifactCount
                              ? `${resolvedStepNoteCount} note${resolvedStepNoteCount === 1 ? "" : "s"} · ${resolvedStepImageCount} image${resolvedStepImageCount === 1 ? "" : "s"}`
                              : "No evidence captured yet"}
                          </small>
                        </div>
                      </div>

                      <div className="execution-engine-cockpit" aria-label="Test engine cockpit">
                        <div className="execution-engine-cockpit-copy">
                          <strong>Test engine cockpit</strong>
                          <span>
                            {selectedRuntimeTelemetry.webStepCount
                              ? `${selectedRuntimeTelemetry.webStepCount} automated web step${selectedRuntimeTelemetry.webStepCount === 1 ? "" : "s"} reported runtime diagnostics`
                              : "Ready for manual, API, web, mobile, or mixed execution evidence"}
                          </span>
                        </div>
                        <div className="execution-engine-signal-grid">
                          <span>
                            <strong>{selectedRuntimeTelemetry.consoleCount}</strong>
                            <small>Console logs</small>
                          </span>
                          <span>
                            <strong>{selectedRuntimeTelemetry.networkCount}</strong>
                            <small>Network calls</small>
                          </span>
                          <span>
                            <strong>{selectedRuntimeTelemetry.artifactCount}</strong>
                            <small>Evidence items</small>
                          </span>
                          <span>
                            <strong>{selectedRuntimeTelemetry.avgWebDurationMs !== null ? formatDuration(selectedRuntimeTelemetry.avgWebDurationMs, DEFAULT_DURATION_LABEL) : "0s"}</strong>
                            <small>Avg web step</small>
                          </span>
                        </div>
                      </div>

                      <div className="execution-assignment-panel execution-assignment-panel--case">
                        <div className="execution-assignment-copy">
                          <strong>Case assignee</strong>
                          <span>{selectedExecutionCaseAssignmentHint}</span>
                        </div>
                        <div className="execution-assignment-actions">
                          <select
                            disabled={!assigneeOptions.length || updateExecutionCaseAssignment.isPending}
                            value={caseAssignmentDraft}
                            onChange={(event) => setCaseAssignmentDraft(event.target.value)}
                          >
                            <option value="">
                              {selectedExecution?.assigned_user
                                ? `Use execution assignee (${resolveUserPrimaryLabel(selectedExecution.assigned_user)})`
                                : assigneeOptions.length
                                  ? "Unassigned"
                                  : "No project members available"}
                            </option>
                            {assigneeOptions.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.caption ? `${option.label} · ${option.caption}` : option.label}
                              </option>
                            ))}
                          </select>
                          <button
                            className="ghost-button"
                            disabled={!assigneeOptions.length || !hasCaseAssignmentChange || updateExecutionCaseAssignment.isPending}
                            onClick={() => void handleSaveCaseAssignment()}
                            type="button"
                          >
                            <ExecutionAssigneeIcon />
                            <span>{updateExecutionCaseAssignment.isPending ? "Saving…" : "Update assignee"}</span>
                          </button>
                          <button className="ghost-button" onClick={() => setIsExecutionContextModalOpen(true)} type="button">
                            View context snapshot
                          </button>
                          <button
                            className="ghost-button"
                            disabled={!hasSelectedStepAutomationCode}
                            onClick={() => {
                              setActiveTab("overview");
                              setExecutionStepViewMode("automation");
                            }}
                            type="button"
                          >
                            <AutomationCodeIcon />
                            <span>Coded steps</span>
                          </button>
                          {isExecutionLiveViewEligible ? (
                            <a
                              className="ghost-button"
                              href={testEngineLiveViewUrl}
                              rel="noreferrer"
                              target="_blank"
                              title="View live browser session"
                            >
                              <LiveRunIcon />
                              <span>View live run</span>
                            </a>
                          ) : null}
                        </div>
                      </div>

                    </div>

                    <SubnavTabs
                      items={[
                        { value: "overview", label: "Overview", meta: `${selectedSteps.length} steps` },
                        { value: "logs", label: "Logs", meta: selectedExecutionResult?.status || "none" },
                        { value: "history", label: "History", meta: `${selectedCaseHistory.length}` },
                        { value: "evidence", label: "Attachments" }
                      ]}
                      onChange={setActiveTab}
                      value={activeTab}
                    />

                    {activeTab === "overview" ? (
                      <div className="detail-stack execution-overview-tab">
                        <div className="execution-step-progress-card">
                          <ProgressMeter
                            detail={`${selectedStepProgress.passedCount} passed · ${selectedStepProgress.failedCount} failed · ${selectedStepProgress.pendingCount} pending`}
                            label="Step progress"
                            segments={buildProgressSegments(
                              selectedStepProgress.passedCount,
                              selectedStepProgress.failedCount,
                              0,
                              selectedSteps.length
                            )}
                            value={selectedStepProgress.percent}
                          />
                        </div>

                        <div className="execution-parameter-stack">
                          <ExecutionParameterPanel
                            description={
                              hasExecutionLevelTestData
                                ? "Snapped before execution started from saved @t and @s values plus the selected run context and test data."
                                : "Snapped before execution started from saved @t and @s values plus the selected run context."
                            }
                            emptyMessage="No snapped input params are available for this case yet."
                            entries={selectedExecutionInputParameterEntries}
                            isExpanded={isExecutionInputParamsExpanded}
                            onToggle={() => setIsExecutionInputParamsExpanded((current) => !current)}
                            title="Input params"
                          />
                          <ExecutionParameterPanel
                            description="Extracted while this execution ran. Later steps in the case resolve against these output params when available."
                            emptyMessage="No output params have been extracted from this case yet."
                            entries={selectedExecutionOutputParameterEntries}
                            isExpanded={isExecutionOutputParamsExpanded}
                            onToggle={() => setIsExecutionOutputParamsExpanded((current) => !current)}
                            title="Output params"
                          />
                        </div>

                        {!selectedSteps.length ? <div className="empty-state compact">No snapshot steps are available for this case.</div> : null}

                        {selectedSteps.length ? (
                          <div className="execution-step-view-shell">
                            <div className="execution-step-view-header">
                              <div>
                                <strong>Case steps</strong>
                                <span>
                                  Switch between manual execution controls and the coded runtime view with logs, status, and line-level failures.
                                </span>
                              </div>
                              <div className="execution-step-view-header-actions">
                                <button
                                  className="ghost-button"
                                  disabled={!selectedExecution}
                                  onClick={handleReportSelectedExecutionIssue}
                                  type="button"
                                >
                                  <BugIcon />
                                  <span>Report Bug</span>
                                </button>
                                <div className="execution-step-view-toggle" role="tablist" aria-label="Step view">
                                  <button
                                    aria-selected={executionStepViewMode === "manual"}
                                    className={executionStepViewMode === "manual" ? "is-active" : ""}
                                    onClick={() => setExecutionStepViewMode("manual")}
                                    role="tab"
                                    type="button"
                                  >
                                    <ExecutionStepsIcon />
                                    <span>Manual steps</span>
                                  </button>
                                  <button
                                    aria-selected={executionStepViewMode === "automation"}
                                    className={executionStepViewMode === "automation" ? "is-active" : ""}
                                    disabled={!hasSelectedStepAutomationCode}
                                    onClick={() => setExecutionStepViewMode("automation")}
                                    role="tab"
                                    title={hasSelectedStepAutomationCode ? "View coded steps and runtime logs" : "No automation code is available for this case yet"}
                                    type="button"
                                  >
                                    <AutomationCodeIcon />
                                    <span>Coded steps</span>
                                  </button>
                                </div>
                              </div>
                            </div>

                            {executionStepViewMode === "manual" ? (
                              <>
                                <div className="execution-steps-toolbar">
                            <div className="execution-steps-bulk-buttons">
                              <label className="execution-select-all">
                                <input
                                  checked={selectedSteps.length > 0 && bulkSelectedStepIds.length === selectedSteps.length}
                                  onChange={() => {
                                    if (bulkSelectedStepIds.length === selectedSteps.length) {
                                      setBulkSelectedStepIds([]);
                                    } else {
                                      setBulkSelectedStepIds(selectedSteps.map((step) => step.id));
                                    }
                                  }}
                                  type="checkbox"
                                />
                                <span>Select all steps</span>
                              </label>
                              <button
                                className="ghost-button execution-steps-bulk-action"
                                disabled={!isExecutionStarted || isExecutionLocked || !bulkSelectedStepIds.length}
                                onClick={() => void handleBulkStepStatus("passed", "selected")}
                                type="button"
                              >
                                <ExecutionStepsIcon />
                                <span>Pass selected</span>
                              </button>
                              <button
                                className="ghost-button danger execution-steps-bulk-action"
                                disabled={!isExecutionStarted || isExecutionLocked || !bulkSelectedStepIds.length}
                                onClick={() => void handleBulkStepStatus("failed", "selected")}
                                type="button"
                              >
                                <ExecutionStepsIcon />
                                <span>Fail selected</span>
                              </button>
                              <button
                                className="ghost-button"
                                disabled={!isExecutionStarted || isExecutionLocked}
                                onClick={() => void handleBulkStepStatus("passed", "all")}
                                type="button"
                              >
                                <TestCaseBoardIcon />
                                <span>TC Pass</span>
                              </button>
                              <button
                                className="ghost-button danger"
                                disabled={!isExecutionStarted || isExecutionLocked}
                                onClick={() => void handleBulkStepStatus("failed", "all")}
                                type="button"
                              >
                                <TestCaseBoardIcon />
                                <span>TC Fail</span>
                              </button>
                              {executionStepGroupIds.length ? (
                                <>
                                  <button
                                    className="ghost-button execution-steps-bulk-action"
                                    disabled={expandedExecutionStepGroupIds.length === executionStepGroupIds.length}
                                    onClick={() => setExpandedExecutionStepGroupIds(executionStepGroupIds)}
                                    type="button"
                                  >
                                    <ExecutionAccordionChevronIcon />
                                    <span>Expand groups</span>
                                  </button>
                                  <button
                                    className="ghost-button execution-steps-bulk-action"
                                    disabled={!expandedExecutionStepGroupIds.length}
                                    onClick={() => setExpandedExecutionStepGroupIds([])}
                                    type="button"
                                  >
                                    <ExecutionAccordionChevronIcon />
                                    <span>Collapse groups</span>
                                  </button>
                                </>
                              ) : null}
                            </div>
                          </div>

                                <div className="execution-step-card-list" role="list" aria-label="Test steps for this case">
                                  {executionStepBlocks.map((block) => {
                            if (block.groupId) {
                              const isExpanded = expandedExecutionStepGroupIds.includes(block.groupId);

                              return (
                                <Fragment key={block.key}>
                                  <ExecutionStepGroupRow
                                    isExpanded={isExpanded}
                                    kind={block.groupKind}
                                    name={block.groupName || "Step group"}
                                    onPreviewCode={() => openExecutionGroupAutomationPreview(block.groupName || "Step group", block.steps)}
                                    onToggle={() =>
                                      setExpandedExecutionStepGroupIds((current) =>
                                        current.includes(block.groupId as string)
                                          ? current.filter((groupId) => groupId !== block.groupId)
                                          : [...current, block.groupId as string]
                                      )
                                    }
                                    stepCount={block.steps.length}
                                  />
                                  {isExpanded
                                    ? block.steps.map((step) => {
                                        const rowStatus = stepStatuses[step.id];

                                        return (
                                          <ExecutionStepCard
                                            apiDetail={stepApiDetails[step.id] || null}
                                            webDetail={stepWebDetails[step.id] || null}
                                            automationDetail={stepAutomationDetails[step.id] || null}
                                            captures={stepCaptures[step.id] || stepApiDetails[step.id]?.captures || {}}
                                            evidence={stepEvidence[step.id] || null}
                                            canCreateEvidence={canCreateRunEvidence}
                                            canDeleteEvidence={canDeleteRunEvidence}
                                            canViewEvidence={canViewRunEvidence}
                                            canInspectApi={step.step_type === "api" || (!step.step_type && selectedExecutionAppTypeKind === "api")}
                                            isExpanded={expandedExecutionStepIds.includes(step.id)}
                                            isRunningApi={runningExecutionApiStepId === step.id}
                                            isLocked={!isExecutionStarted || isExecutionLocked}
                                            isSelected={bulkSelectedStepIds.includes(step.id)}
                                            isUploadingEvidence={uploadingEvidenceStepId === step.id}
                                            isOpeningEvidence={openingEvidenceStepId === step.id}
                                            isLinkingDefects={linkingDefectStepId === step.id}
                                            key={step.id}
                                            note={stepNotes[step.id] || ""}
                                            parameterValues={executionStepParameterValues}
                                            availableBugs={bugs}
                                            defectIds={stepDefects[step.id] || []}
                                            onFail={() => void handleRecordStep(step.id, "failed")}
                                            onDeleteEvidence={() => void handleDeleteStepEvidence(step)}
  onInspectApi={() => openExecutionApiDetail(step)}
  onNoteBlur={(value) => void handleSaveStepNote(step.id, value)}
  onPass={() => void handleRecordStep(step.id, "passed")}
                                            onPreviewCode={() => openExecutionStepAutomationPreview(step)}
                                            onAttachNetworkAutomation={(network) => void handleAttachStepNetworkAutomation(network)}
                                            onRunStep={() => void handleRunExecutionApiStep(step)}
                                            onDefectsChange={(defectIds) => void handleStepDefectsChange(step, defectIds)}
                                            onToggle={() =>
                                              setExpandedExecutionStepIds((current) =>
                                                current.includes(step.id)
                                                  ? current.filter((id) => id !== step.id)
                                                  : [...current, step.id]
                                              )
                                            }
                                            onToggleSelect={(checked) =>
                                              setBulkSelectedStepIds((current) =>
                                                checked ? [...new Set([...current, step.id])] : current.filter((id) => id !== step.id)
                                              )
                                            }
                                            onUploadEvidence={(file) => void handleUploadStepEvidence(step, file)}
                                            onViewEvidence={() => openExecutionEvidence(step, stepEvidence[step.id] as ExecutionStepEvidence)}
                                            status={rowStatus || "queued"}
                                            step={step}
                                          />
                                        );
                                      })
                                    : null}
                                </Fragment>
                              );
                            }

                            return block.steps.map((step) => {
                              const rowStatus = stepStatuses[step.id];

                              return (
                                <ExecutionStepCard
                                  apiDetail={stepApiDetails[step.id] || null}
                                  webDetail={stepWebDetails[step.id] || null}
                                  automationDetail={stepAutomationDetails[step.id] || null}
                                  captures={stepCaptures[step.id] || stepApiDetails[step.id]?.captures || {}}
                                  evidence={stepEvidence[step.id] || null}
                                  canCreateEvidence={canCreateRunEvidence}
                                  canDeleteEvidence={canDeleteRunEvidence}
                                  canViewEvidence={canViewRunEvidence}
                                  canInspectApi={step.step_type === "api" || (!step.step_type && selectedExecutionAppTypeKind === "api")}
                                  isExpanded={expandedExecutionStepIds.includes(step.id)}
                                  isRunningApi={runningExecutionApiStepId === step.id}
                                  isLocked={!isExecutionStarted || isExecutionLocked}
                                  isSelected={bulkSelectedStepIds.includes(step.id)}
                                  isUploadingEvidence={uploadingEvidenceStepId === step.id}
                                  isOpeningEvidence={openingEvidenceStepId === step.id}
                                  isLinkingDefects={linkingDefectStepId === step.id}
                                  key={step.id}
                                  note={stepNotes[step.id] || ""}
                                  parameterValues={executionStepParameterValues}
                                  availableBugs={bugs}
                                  defectIds={stepDefects[step.id] || []}
                                  onFail={() => void handleRecordStep(step.id, "failed")}
                                  onDeleteEvidence={() => void handleDeleteStepEvidence(step)}
  onInspectApi={() => openExecutionApiDetail(step)}
  onNoteBlur={(value) => void handleSaveStepNote(step.id, value)}
  onPass={() => void handleRecordStep(step.id, "passed")}
  onPreviewCode={() => openExecutionStepAutomationPreview(step)}
  onAttachNetworkAutomation={(network) => void handleAttachStepNetworkAutomation(network)}
  onRunStep={() => void handleRunExecutionApiStep(step)}
  onDefectsChange={(defectIds) => void handleStepDefectsChange(step, defectIds)}
                                  onToggle={() =>
                                    setExpandedExecutionStepIds((current) =>
                                      current.includes(step.id)
                                        ? current.filter((id) => id !== step.id)
                                        : [...current, step.id]
                                    )
                                  }
                                  onToggleSelect={(checked) =>
                                    setBulkSelectedStepIds((current) =>
                                      checked ? [...new Set([...current, step.id])] : current.filter((id) => id !== step.id)
                                    )
                                  }
                                  onUploadEvidence={(file) => void handleUploadStepEvidence(step, file)}
                                  onViewEvidence={() => openExecutionEvidence(step, stepEvidence[step.id] as ExecutionStepEvidence)}
                                  status={rowStatus || "queued"}
                                  step={step}
                                />
                              );
                            });
                                  })}
                                </div>
                              </>
                            ) : (
                              <div className="execution-console-code-list execution-console-code-list--embedded" role="list" aria-label="Coded steps for this case">
                                {selectedSteps.map((step) => {
                                  const detail = stepAutomationDetails[step.id] || null;
                                  const code = detail?.code
                                    || step.automation_code
                                    || (step.step_type === "api" && step.api_request ? resolveStepAutomationCode(step) : "");

                                  if (!code.trim()) {
                                    return null;
                                  }

                                  return (
                                    <ExecutionAutomationStepCard
                                      apiDetail={stepApiDetails[step.id] || null}
                                      automationDetail={detail}
                                      code={code}
                                      key={step.id}
                                      note={stepNotes[step.id] || ""}
                                      status={detail?.status || stepStatuses[step.id] || "queued"}
                                      step={step}
                                      webDetail={stepWebDetails[step.id] || null}
                                    />
                                  );
                                })}
                                {!hasSelectedStepAutomationCode ? (
                                  <div className="empty-state compact">No automation code is available for this case yet.</div>
                                ) : null}
                              </div>
                            )}
                          </div>
                        ) : null}

                        {!isExecutionStarted && !isExecutionLocked ? <div className="empty-state compact">Start the execution to enable step actions.</div> : null}
                        {isExecutionLocked ? <div className="empty-state compact">This execution is locked because it is {executionStatusLabel(currentExecutionStatus).toLowerCase()}.</div> : null}
                      </div>
                    ) : null}

                    {activeTab === "logs" ? (
                      <div className="stack-list execution-logs-stack">
                        {selectedExecutionResult ? (
                          <div className="execution-log-focus">
                            <div className="execution-section-head">
                              <strong>{selectedExecutionCaseReadableTitle || selectedExecutionResult.test_case_title || selectedExecutionCase.title || "Selected case logs"}</strong>
                              <span>{selectedExecutionResult.error || "Structured evidence and notes for the focused case."}</span>
                            </div>
                            <ExecutionStructuredLogView
                              logsJson={selectedExecutionResult.logs}
                              onOpenEvidence={openExecutionEvidence}
                              steps={selectedSteps}
                            />
                          </div>
                        ) : (
                          <div className="empty-state compact">No logs yet for the selected case.</div>
                        )}

                        {executionResults
                          .filter((result) => result.id !== selectedExecutionResult?.id)
                          .map((result) => (
                            <div className="stack-item execution-log-row" key={result.id}>
                              <div>
                                <strong>{result.test_case_title || result.test_case_id}</strong>
                                <ExecutionStructuredLogSummary logsJson={result.logs} />
                                <span>{formatExecutionTimestamp(result.created_at, "Timestamp unavailable")} · {formatDuration(result.duration_ms, DEFAULT_DURATION_LABEL)}</span>
                                {result.error ? <span className="execution-log-error">{result.error}</span> : null}
                              </div>
                              <StatusBadge value={result.status} />
                            </div>
                          ))}
                        {!executionResults.length ? <div className="empty-state compact">No execution results have been logged yet.</div> : null}
                      </div>
                    ) : null}

                    {activeTab === "history" ? (
                      <div className="stack-list execution-history-stack">
                        {selectedCaseHistory.map((result) => {
                          const linkedExecution = executionById[result.execution_id];
                          const isCurrentExecution = result.execution_id === selectedExecution.id;

                          return (
                            <button
                              className={isCurrentExecution ? "stack-item stack-item-button execution-history-row is-current" : "stack-item stack-item-button execution-history-row"}
                              key={result.id}
                              onClick={() => focusExecutionCase(result.test_case_id, result.execution_id)}
                              type="button"
                            >
                              <div>
                                <strong>{linkedExecution?.name || result.test_case_title || "Run record"}</strong>
                                <span>{result.suite_name || "Recorded case evidence"} · {formatExecutionTimestamp(result.created_at, "Timestamp unavailable")}</span>
                                <small>{formatDuration(result.duration_ms, DEFAULT_DURATION_LABEL)} · {isCurrentExecution ? "Current run" : "Switch to this run"}</small>
                              </div>
                              <StatusBadge value={result.status} />
                            </button>
                          );
                        })}
                        {!selectedCaseHistory.length ? <div className="empty-state compact">No run history exists yet for this selected case.</div> : null}
                      </div>
                    ) : null}
                    {activeTab === "evidence" ? (
                      <JiraAttachmentPanel
                        canDelete={canDeleteRunEvidence}
                        canUpload={canCreateRunEvidence}
                        canView={canViewRunEvidence}
                        issueKey={selectedExecution.display_id || selectedExecution.id}
                        title="Run attachments"
                      />
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="execution-panel-body execution-panel-body--detail">
                  <div className="empty-state compact">Select a case to continue.</div>
                </div>
              )}
            </Panel>
          ) : (
            <Panel
              className="execution-panel execution-panel--tree"
              actions={<WorkspaceBackButton label="Back to run library" onClick={closeExecutionDrilldown} />}
              title={selectedExecution?.name || (isSelectedExecutionTestCaseRun ? "Run cases" : "Run suites")}
              subtitle={
                isSelectedExecutionTestCaseRun
                  ? "Open the snapped case tiles for this run and jump directly into the case workspace when deeper evidence is needed."
                  : "Expand suite groups to review snapped test cases inline and jump straight into the run workspace."
              }
            >
              {selectedExecution ? (
                <div className="detail-stack">
                  <div className="execution-health-layout">
                    <div className="execution-health-hero">
                      <ExecutionOverviewOrb
                        blockedCount={executionStatusCounts.blocked}
                        failedCount={executionStatusCounts.failed}
                        passedCount={executionStatusCounts.passed}
                        passPercent={executionProgress.totalCases ? Math.round((executionStatusCounts.passed / executionProgress.totalCases) * 100) : 0}
                        totalCount={executionProgress.totalCases}
                      />

                      <div className="execution-health-copy">
                        <div className="execution-health-status-row">
                          <StatusBadge value={currentExecutionStatus} />
                          <span className="count-pill">{selectedExecutionAppTypeLabel}</span>
                          <ExecutionAssigneeChip
                            className="execution-card-assignee--compact"
                            labelOverride={resolveExecutionAssigneeSummary(selectedExecution)}
                            user={selectedExecution?.assigned_users?.[0] || selectedExecution?.assigned_user || null}
                          />
                          {selectedExecution.release ? <span className="count-pill">Release {selectedExecution.release}</span> : null}
                          {selectedExecution.sprint ? <span className="count-pill">Sprint {selectedExecution.sprint}</span> : null}
                          {selectedExecution.build ? <span className="count-pill">Build {selectedExecution.build}</span> : null}
                          <span className="execution-health-trigger">{(selectedExecution.trigger || "manual").toUpperCase()} trigger</span>
                        </div>

                        <div className="execution-health-heading">
                          <strong>{selectedExecution.name || "Unnamed run"}</strong>
                          <span>
                            {isSelectedExecutionTestCaseRun
                              ? `${executionProgress.totalCases} direct test case${executionProgress.totalCases === 1 ? "" : "s"} preserved for run evidence.`
                              : `${selectedExecutionSuiteIds.length} suites snapped into this run with ${executionProgress.totalCases} cases preserved for run evidence.`}
                          </span>
                        </div>

                        <ProgressMeter
                          detail={`${executionProgress.totalCases} total · ${executionStatusCounts.passed} passed · ${executionStatusCounts.failed} failed · ${executionStatusCounts.blocked} blocked · ${remainingCaseCount} remaining`}
                          label="Run completion"
                          segments={buildProgressSegments(
                            executionStatusCounts.passed,
                            executionStatusCounts.failed,
                            executionStatusCounts.blocked,
                            executionProgress.totalCases
                          )}
                          value={executionProgress.percent}
                        />
                      </div>
                    </div>

                    <div className="metric-strip">
                      <div className="mini-card">
                        <strong>{executionProgress.totalCases}</strong>
                        <span>Total cases</span>
                      </div>
                      <div className="mini-card">
                        <strong>{formatExecutionTimestamp(selectedExecution.started_at, currentExecutionStatus === "queued" ? "Not started yet" : "Waiting to start")}</strong>
                        <span>Started</span>
                      </div>
                      <div className="mini-card">
                        <strong>{formatExecutionTimestamp(selectedExecution.ended_at, currentExecutionStatus === "running" ? "Live run" : currentExecutionStatus === "aborted" ? "Stopped before completion" : "Not finished yet")}</strong>
                        <span>Ended</span>
                      </div>
                      <div className="mini-card">
                        <strong>{formatDuration(selectedExecutionDurationMs, DEFAULT_DURATION_LABEL)}</strong>
                        <span>Run duration</span>
                      </div>
                      <div className="mini-card">
                        <strong>{blockingCases.length}</strong>
                        <span>Blocking cases</span>
                      </div>
                      <div className="mini-card">
                        <strong>{selectedExecutionImpactSummary.failedRequirementCount}/{selectedExecutionImpactSummary.totalRequirements}</strong>
                        <span>Impacted requirements</span>
                      </div>

                    </div>

                    <div className="execution-run-impact-panel">
                      <div className="execution-run-impact-head">
                        <div>
                          <strong>Run impact areas</strong>
                          <span>
                            {selectedExecutionImpactSummary.failedCases.length
                              ? `${selectedExecutionImpactSummary.failedCases.length} failed or blocked case${selectedExecutionImpactSummary.failedCases.length === 1 ? "" : "s"} mapped to ${selectedExecutionImpactSummary.failedRequirementCount} requirement${selectedExecutionImpactSummary.failedRequirementCount === 1 ? "" : "s"}.`
                              : selectedExecutionImpactSummary.totalRequirements
                                ? `${selectedExecutionImpactSummary.totalRequirements} linked requirement${selectedExecutionImpactSummary.totalRequirements === 1 ? "" : "s"} in this run. No failed requirement impact yet.`
                                : "No linked requirement impact detected for this run yet."}
                          </span>
                        </div>
                        <span className={selectedExecutionImpactSummary.failureRate ? "count-pill warning" : "count-pill success"}>
                          {selectedExecutionImpactSummary.failureRate}% case failure rate
                        </span>
                      </div>

                      {selectedExecutionImpactSummary.impactedRequirements.length ? (
                        <div className="execution-run-impact-grid">
                          {selectedExecutionImpactSummary.impactedRequirements.slice(0, 6).map((requirement) => (
                            <article className={requirement.failedCases ? "execution-run-impact-card is-impacted" : "execution-run-impact-card"} key={requirement.id}>
                              <div>
                                <strong>{requirement.title}</strong>
                                <span>P{requirement.priority || 3} · {requirement.failedCases}/{requirement.totalCases} failed or blocked</span>
                              </div>
                              <span className={requirement.failureRate ? "count-pill warning" : "count-pill success"}>{requirement.failureRate}%</span>
                            </article>
                          ))}
                        </div>
                      ) : null}

                      {selectedExecutionImpactSummary.failedCases.length ? (
                        <div className="execution-run-failure-list">
                          {selectedExecutionImpactSummary.failedCases.slice(0, 8).map((testCase) => (
                            <button
                              className="execution-run-failure-row"
                              key={testCase.id}
                              onClick={() => focusExecutionCase(testCase.id)}
                              type="button"
                            >
                              <StatusBadge value={testCase.status} />
                              <div>
                                <strong>{testCase.title}</strong>
                                <span>
                                  {[
                                    testCase.suiteName || "Direct case",
                                    testCase.requirementTitles.length ? `Requirements: ${testCase.requirementTitles.join(" · ")}` : "No linked requirement",
                                    testCase.error || null
                                  ].filter(Boolean).join(" · ")}
                                </span>
                              </div>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <AiAssurancePanel
                      gaps={selectedRunEvidenceReadiness.gaps}
                      provenance="Deterministic run results, case snapshots, requirement links, bugs, and external references"
                      reviewState={["completed", "failed", "aborted"].includes(currentExecutionStatus) ? "review-required" : "evidence-forming"}
                      score={selectedRunEvidenceReadiness.score}
                      scoreLabel={selectedRunEvidenceReadiness.scoreLabel}
                      signals={selectedRunEvidenceReadiness.signals}
                      summary={selectedRunEvidenceReadiness.summary}
                      title="Release evidence readiness"
                    />

                    <ExecutionContextSnapshotSummary execution={selectedExecution} onViewFull={() => setIsExecutionContextModalOpen(true)} />

                    <div className="execution-assignment-panel">
                      <div className="execution-assignment-copy">
                        <strong>Run assignees</strong>
                        <span>Set the tester group for this run. Test cases without their own override follow the primary tester.</span>
                      </div>
                      <div className="execution-assignment-actions">
                        <MultiAssigneePicker
                          disabled={!assigneeOptions.length || updateExecutionAssignment.isPending}
                          options={assigneeOptions}
                          selectedIds={executionAssignmentDraftIds}
                          onChange={setExecutionAssignmentDraftIds}
                        />
                        <button
                          className="ghost-button"
                          disabled={!assigneeOptions.length || !hasExecutionAssignmentChange || updateExecutionAssignment.isPending}
                          onClick={() => void handleSaveExecutionAssignment()}
                          type="button"
                        >
                          <ExecutionAssigneeIcon />
                          <span>{updateExecutionAssignment.isPending ? "Saving…" : "Update assignees"}</span>
                        </button>
                      </div>
                    </div>

                    <div className="execution-control-strip">
                      <div className="execution-control-copy">
                        <strong>{executionControlTitle}</strong>
                        <span>{executionControlDescription}</span>
                      </div>
                      <div className="action-row">
	                        <button
	                          className="ghost-button"
	                          disabled={currentExecutionStatus !== "queued" || startExecution.isPending || completeExecution.isPending || !canCreateManualRuns}
	                          onClick={() => void handleStartSelectedExecution()}
	                          type="button"
	                        >
                          <ExecutionStartIcon />
                          <span>{startExecution.isPending ? "Starting…" : "Start run"}</span>
                        </button>

                        <button
                          className="ghost-button"
                          disabled={!selectedExecution || downloadExecutionReport.isPending}
                          onClick={() => void handleDownloadExecutionReport()}
                          type="button"
                        >
                          <ExportIcon />
                          <span>{downloadExecutionReport.isPending ? "Exporting…" : "PDF report"}</span>
                        </button>
                        <button
                          className="ghost-button"
                          disabled={!selectedExecution || shareExecutionReport.isPending}
                          onClick={handleOpenReportEmailModal}
                          type="button"
                        >
                          <MailIcon />
                          <span>Email report</span>
                        </button>
                        <button
                          className="ghost-button"
                          disabled={!selectedExecution}
                          onClick={handleReportSelectedExecutionIssue}
                          type="button"
                        >
                          <BugIcon />
                          <span>Report Bug</span>
                        </button>

                        <button
                          className="ghost-button"
                          disabled={currentExecutionStatus !== "running" || completeExecution.isPending || startExecution.isPending}
                          onClick={() => void handleFinalizeExecution("complete")}
                          type="button"
                        >
                          <ExecutionCompleteIcon />
                          <span>{completeExecution.isPending && executionFinalizeAction === "complete" ? "Completing…" : "Complete run"}</span>
                        </button>
                        <CatalogActionMenu
                          label="More run actions"
                          actions={[
                            {
                              label: rerunExecution.isPending ? "Preparing rerun…" : "Rerun all",
                              icon: <ExecutionRerunIcon />,
                              onClick: () => void handleRerunExecution(false),
                              disabled: !selectedExecution || rerunExecution.isPending || startExecution.isPending || completeExecution.isPending
                            },
                            {
                              label: rerunExecution.isPending ? "Preparing failed rerun…" : `Rerun failed (${executionStatusCounts.failed})`,
                              icon: <ExecutionRerunIcon />,
                              onClick: () => void handleRerunExecution(true),
                              disabled: !selectedExecution || !executionStatusCounts.failed || rerunExecution.isPending || startExecution.isPending || completeExecution.isPending
                            },
                            {
                              label: completeExecution.isPending && executionFinalizeAction === "abort" ? "Aborting run…" : "Abort run",
                              icon: <ExecutionAbortIcon />,
                              onClick: () => void handleFinalizeExecution("abort"),
                              disabled: currentExecutionStatus !== "running" || completeExecution.isPending || startExecution.isPending,
                              tone: "danger"
                            }
                          ]}
                        />
                      </div>
                    </div>

                    <ExecutionAccordionSection
                      className="execution-reference-section execution-run-reference-section"
                      isExpanded={isExecutionReferencesExpanded}
                      onToggle={() => setIsExecutionReferencesExpanded((current) => !current)}
                      summary={runReferenceSummary}
                      title="Run references"
                    >
                      {runReferenceRows.length ? (
                        <div className="execution-run-reference-list">
                          {runReferenceRows.map((row) => (
                            <button
                              className={["execution-run-reference-row", ["failed", "blocked"].includes(row.status) ? "is-risk" : ""].filter(Boolean).join(" ")}
                              key={`${row.testCase.id}-${row.status}`}
                              onClick={() => focusExecutionCase(row.testCase.id)}
                              type="button"
                            >
                              <StatusBadge value={row.status} />
                              <div className="execution-run-reference-copy">
                                <strong>{row.testCase.title}</strong>
                                <span>{row.testCase.suite_name || "Direct case"} · {row.status}</span>
                                {row.references.length || row.defects.length ? (
                                  <div className="execution-run-reference-chip-row">
                                    {row.defects.map((defect) => (
                                      <span className="execution-run-reference-chip is-defect" key={`defect-${row.testCase.id}-${defect}`}>{defect}</span>
                                    ))}
                                    {row.references.map((reference) => (
                                      <span className="execution-run-reference-chip" key={`reference-${row.testCase.id}-${reference}`}>{reference}</span>
                                    ))}
                                  </div>
                                ) : (
                                  <span>No references or bugs recorded yet for this failing case.</span>
                                )}
                                {row.error ? <small>{row.error}</small> : null}
                              </div>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="empty-state compact">No bugs or external references are attached to failed cases in this run yet.</div>
                      )}
                    </ExecutionAccordionSection>

                    <ExecutionAccordionSection
                      className="execution-ai-analysis-section execution-run-ai-analysis-section"
                      isExpanded={isExecutionAiAnalysisExpanded}
                      onToggle={() => setIsExecutionAiAnalysisExpanded((current) => !current)}
                      summary={runAiAnalysis?.generatedAt ? `Run rollup ${formatExecutionTimestamp(runAiAnalysis.generatedAt)}` : "No run assets available"}
                      title="Evidence analysis"
                    >
	                      <ExecutionAiAnalysisPanel
	                        analysis={runAiAnalysis}
	                        canRun={canUseRunAi && ["completed", "failed"].includes(currentExecutionStatus)}
	                        canPreviewClusters={canUseRunAi && Boolean(projectId) && ["completed", "failed"].includes(currentExecutionStatus)}
	                        isRunning={runExecutionAiAnalysis.isPending}
	                        isPreviewingClusters={previewExecutionFailureClusters.isPending}
	                        onRun={() => void handleRunExecutionAiAnalysis()}
	                        onPreviewClusters={handlePreviewFailureClusters}
	                      />
                    </ExecutionAccordionSection>

                    {isSelectedExecutionTestCaseRun ? (
                      renderExecutionCaseCatalog({
                        cases: filteredExecutionCaseOrder,
                        emptyMessage: "No direct test cases were snapped into this run.",
                        storageKey: "qaira:execution-direct-cases:list-columns",
                        suiteName: "Test case run"
                      })
                    ) : (
                      <div className="execution-run-detail-catalog">
                        <div className="design-list-toolbar execution-run-detail-toolbar">
                          <CatalogSearchFilter
                            activeFilterCount={executionSuiteSearch.trim() ? 1 : 0}
                            ariaLabel="Search run suites"
                            onChange={setExecutionSuiteSearch}
                            placeholder="Search suites"
                            subtitle="Search suite names, statuses, impacted requirements, and snapped case titles."
                            title="Suite search"
                            type="search"
                            value={executionSuiteSearch}
                          >
                            <div className="catalog-filter-grid">
                              <div className="catalog-filter-actions">
                                <button className="ghost-button" disabled={!executionSuiteSearch.trim()} onClick={() => setExecutionSuiteSearch("")} type="button">
                                  Clear search
                                </button>
                              </div>
                            </div>
                          </CatalogSearchFilter>
                          <CatalogViewToggle onChange={setExecutionSuiteCatalogViewMode} value={executionSuiteCatalogViewMode} />
                        </div>

                        {executionSuiteCatalogViewMode === "tile" ? (
                    <div className="suite-tree">
                      {filteredExecutionSuites.map((suite) => {
                        const suiteCases = displayCasesBySuiteId[suite.id] || [];
                        const suiteMetric = suiteMetrics.find((item) => item.suiteId === suite.id);
                        const suiteStatus = suiteMetric ? suiteBoardStatus(suiteMetric) : "queued";
                        const suiteResolvedCount =
                          (suiteMetric?.passedCount || 0) +
                          (suiteMetric?.failedCount || 0) +
                          (suiteMetric?.blockedCount || 0);
                        const suiteImpactSummary = selectedSuiteImpactSummaryById[suite.id] || EMPTY_EXECUTION_RUN_IMPACT_SUMMARY;
                        const suiteSummaryForRisk: ExecutionRunSummary = {
                          passed: suiteMetric?.passedCount || 0,
                          failed: suiteMetric?.failedCount || 0,
                          blocked: suiteMetric?.blockedCount || 0,
                          total: suiteResolvedCount,
                          passRate: suiteResolvedCount ? Math.round(((suiteMetric?.passedCount || 0) / suiteResolvedCount) * 100) : 0,
                          avgDurationMs: null,
                          timedCount: 0,
                          latestActivityAt: null,
                          totalDurationMs: 0
                        };
                        const suiteRiskTone = getExecutionRiskTone(suiteSummaryForRisk, suiteImpactSummary);
                        const suiteRiskLabel = getExecutionRiskLabel(suiteSummaryForRisk, suiteImpactSummary);
                        const suiteRiskInsight = getExecutionRiskInsight(suiteSummaryForRisk, suiteImpactSummary, suiteCases.length).replace("run evidence", "suite evidence");
                        const suiteReferenceCount = new Set(
                          suiteCases
                            .flatMap((testCase) => testCase.external_references || [])
                            .map((reference) => String(reference).trim())
                            .filter(Boolean)
                        ).size;
                        const isExpanded = expandedExecutionSuiteIds.includes(suite.id);
                        const isFocusedSuite = focusedSuiteId === suite.id;

                        return (
                          <div className={["tree-suite", isExpanded ? "is-expanded" : ""].filter(Boolean).join(" ")} key={suite.id}>
                            <div
                              className={[
                                "record-card tile-card execution-suite-card",
                                isFocusedSuite ? "is-active" : "",
                                isExpanded ? "is-expanded" : ""
                              ].filter(Boolean).join(" ")}
                            >
                              <div className="tree-suite-row">
                                <button
                                  aria-expanded={isExpanded}
                                  className="tree-suite-expand"
                                  onClick={() => toggleSuiteGroup(suite.id)}
                                  type="button"
                                >
                                  <div className="tile-card-main">
                                    <div className="tile-card-header">
                                      <div className="execution-suite-card-actions">
                                        <span aria-hidden="true" className={isExpanded ? "tree-suite-chevron is-expanded" : "tree-suite-chevron"}>
                                          <ExecutionAccordionChevronIcon />
                                        </span>
                                        <div
                                          aria-hidden="true"
                                          className={`record-card-icon execution-board-icon status-${suiteStatus}`}
                                          title={boardStatusTooltip(suiteStatus)}
                                        >
                                          <ExecutionSuiteIcon />
                                        </div>
                                      </div>
                                      <div className="tile-card-title-group">
                                        <strong>{suite.name}</strong>
                                        <span className="tile-card-kicker">{suiteResolvedCount}/{suiteMetric?.count || 0} resolved</span>
                                      </div>
                                      <ExecutionStatusIndicator status={suiteStatus} />
                                    </div>

                                    <div className="execution-card-facts" aria-label={`${suite.name} facts`}>
                                      <ExecutionCardFact
                                        ariaLabel={`${suiteCases.length} cases in suite`}
                                        label={String(suiteCases.length)}
                                        title={`${suiteCases.length} cases in suite`}
                                      >
                                        <ExecutionScopeIcon />
                                      </ExecutionCardFact>
                                      <ExecutionCardFact
                                        ariaLabel={`${suiteResolvedCount} of ${suiteMetric?.count || 0} cases resolved`}
                                        label={`${suiteResolvedCount}/${suiteMetric?.count || 0}`}
                                        title={`${suiteResolvedCount}/${suiteMetric?.count || 0} cases resolved`}
                                      >
                                        <ExecutionProgressFactsIcon />
                                      </ExecutionCardFact>
                                      <ExecutionCardFact
                                        ariaLabel={`${(suiteMetric?.failedCount || 0) + (suiteMetric?.blockedCount || 0)} failing or blocked cases`}
                                        label={String((suiteMetric?.failedCount || 0) + (suiteMetric?.blockedCount || 0))}
                                        title={`${suiteMetric?.failedCount || 0} failed · ${suiteMetric?.blockedCount || 0} blocked`}
                                        tone={suiteMetric?.failedCount ? "danger" : suiteMetric?.blockedCount ? "warning" : "success"}
                                      >
                                        <ExecutionRiskIcon />
                                      </ExecutionCardFact>
                                      <ExecutionCardFact
                                        ariaLabel={`${suiteImpactSummary.failedRequirementCount} impacted requirements with failed or blocked cases`}
                                        label={suiteImpactSummary.totalRequirements ? `${suiteImpactSummary.failedRequirementCount}/${suiteImpactSummary.totalRequirements}` : "0"}
                                        title={suiteImpactSummary.impactedRequirements[0] ? `${suiteImpactSummary.impactedRequirements[0].title} · ${suiteImpactSummary.impactedRequirements[0].failureRate}% failure rate` : "No requirement impact detected in this suite"}
                                        tone={suiteImpactSummary.failedRequirementCount ? "warning" : "neutral"}
                                      >
                                        <ExecutionRequirementImpactIcon />
                                      </ExecutionCardFact>
                                      <ExecutionCardFact
                                        ariaLabel={`${suiteReferenceCount} external references in suite cases`}
                                        label={String(suiteReferenceCount)}
                                        title={suiteReferenceCount ? `${suiteReferenceCount} linked reference${suiteReferenceCount === 1 ? "" : "s"}` : "No linked external references in this suite"}
                                        tone={suiteReferenceCount ? "info" : "neutral"}
                                      >
                                        <ExecutionReferenceIcon />
                                      </ExecutionCardFact>
                                      <ExecutionCardFact
                                        ariaLabel={`Suite duration ${formatDuration(suiteDurationById[suite.id], DEFAULT_DURATION_LABEL)}`}
                                        label={formatDuration(suiteDurationById[suite.id], DEFAULT_DURATION_LABEL)}
                                        title={`Total recorded suite duration ${formatDuration(suiteDurationById[suite.id], DEFAULT_DURATION_LABEL)}`}
                                        tone={suiteStatus === "blocked" ? "warning" : "neutral"}
                                      >
                                        <ExecutionTimeIcon />
                                      </ExecutionCardFact>
                                    </div>

                                    <div className={`execution-card-risk-note ${suiteRiskTone}`}>
                                      <span>{suiteRiskLabel}</span>
                                      <p>{suiteRiskInsight}</p>
                                    </div>

                                    {suiteImpactSummary.impactedRequirements.length ? (
                                      <div className="execution-suite-impact-row" aria-label={`${suite.name} impacted requirements`}>
                                        {suiteImpactSummary.impactedRequirements.slice(0, 4).map((requirement) => (
                                          <span className={requirement.failedCases ? "execution-impact-chip is-impacted" : "execution-impact-chip"} key={requirement.id}>
                                            <b>{requirement.title}</b>
                                            <small>P{requirement.priority ?? 3} · {requirement.failedCases}/{requirement.totalCases} failed</small>
                                          </span>
                                        ))}
                                      </div>
                                    ) : null}

                                    <ProgressMeter
                                      detail={`${suiteMetric?.passedCount || 0} passed · ${suiteMetric?.failedCount || 0} failed · ${suiteMetric?.blockedCount || 0} blocked`}
                                      hideCopy
                                      label="Suite completion"
                                      segments={buildProgressSegments(
                                        suiteMetric?.passedCount || 0,
                                        suiteMetric?.failedCount || 0,
                                        suiteMetric?.blockedCount || 0,
                                        suiteMetric?.count || 0
                                      )}
                                      value={suiteMetric?.percent || 0}
                                    />
                                  </div>
                                </button>

                                {isExpanded ? (
                                  <div className="tree-suite-body">
                                    {renderExecutionCaseCatalog({
                                      cases: filteredDisplayCasesBySuiteId[suite.id] || [],
                                      emptyMessage: "No test cases were snapped into this suite.",
                                      storageKey: `qaira:execution-suite-${suite.id}:cases:list-columns`,
                                      suiteId: suite.id,
                                      suiteName: suite.name
                                    })}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {!filteredExecutionSuites.length ? (
                        <div className="empty-state compact">
                          {executionSuiteSearch.trim() ? "No suites match the current search." : "No suites were selected for this execution."}
                        </div>
                      ) : null}
                    </div>
                        ) : (
                          <>
                            <DataTable
                              columns={executionSuiteListColumns}
                              enableColumnResize
                              enableHeaderColumnReorder
                              emptyMessage={executionSuiteSearch.trim() ? "No suites match the current search." : "No suites were selected for this execution."}
                              getRowClassName={(suite) => (focusedSuiteId === suite.id ? "is-active-row" : "")}
                              getRowKey={(suite) => suite.id}
                              onRowClick={(suite) => {
                                setFocusedSuiteId(suite.id);
                                setExpandedExecutionSuiteIds((current) => (current.includes(suite.id) ? current : [...current, suite.id]));
                              }}
                              rows={filteredExecutionSuites}
                              storageKey="qaira:execution-run-suites:list-columns"
                            />
                            <div className="execution-open-suite-panels">
                              {filteredExecutionSuites
                                .filter((suite) => expandedExecutionSuiteIds.includes(suite.id))
                                .map((suite) => (
                                  <div className="execution-open-suite-panel" key={`open-${suite.id}`}>
                                    <div className="execution-open-suite-panel-head">
                                      <strong>{suite.name}</strong>
                                      <button
                                        className="ghost-button"
                                        onClick={() => setExpandedExecutionSuiteIds((current) => current.filter((suiteId) => suiteId !== suite.id))}
                                        type="button"
                                      >
                                        Close suite
                                      </button>
                                    </div>
                                    {renderExecutionCaseCatalog({
                                      cases: filteredDisplayCasesBySuiteId[suite.id] || [],
                                      emptyMessage: "No test cases were snapped into this suite.",
                                      storageKey: `qaira:execution-suite-${suite.id}:cases:list-columns`,
                                      suiteId: suite.id,
                                      suiteName: suite.name
                                    })}
                                  </div>
                                ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="empty-state compact">Select an execution to inspect its snapshot scope.</div>
              )}
            </Panel>
          )
        )}
        isDetailOpen={
          testRunsView === "scheduled-runs"
            ? Boolean(selectedSchedule)
            : testRunsView === "batch-process"
              ? Boolean(selectedWorkspaceTransaction)
              : Boolean(selectedExecution)
        }
      />

      {executionEvidencePreview ? (
        <div className="modal-backdrop" onClick={closeExecutionEvidence} role="presentation">
          <div
            aria-labelledby="execution-evidence-modal-title"
            aria-modal="true"
            className="modal-card execution-evidence-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="execution-evidence-modal-header">
              <div className="execution-evidence-modal-copy">
                <h2 className="dialog-title" id="execution-evidence-modal-title">{executionEvidencePreview.fileName || "Run evidence"}</h2>
                <p>{executionEvidencePreview.stepLabel}</p>
              </div>
              <button className="ghost-button" onClick={closeExecutionEvidence} type="button">
                Close
              </button>
            </div>
            <div className="execution-evidence-modal-body">
              {executionEvidencePreview.mimeType.startsWith("video/") ? (
                <video
                  className="execution-evidence-modal-image"
                  controls
                  src={executionEvidencePreview.sourceUrl}
                />
              ) : executionEvidencePreview.mimeType.startsWith("image/") ? (
                <img
                  alt={`${executionEvidencePreview.stepLabel} evidence`}
                  className="execution-evidence-modal-image"
                  src={executionEvidencePreview.sourceUrl}
                />
              ) : executionEvidencePreview.mimeType === "application/pdf" || executionEvidencePreview.mimeType.startsWith("text/") || executionEvidencePreview.mimeType.includes("json") || executionEvidencePreview.mimeType.includes("xml") ? (
                <iframe
                  className="execution-evidence-modal-document"
                  src={executionEvidencePreview.sourceUrl}
                  title={executionEvidencePreview.fileName || "Run evidence"}
                />
              ) : (
                <div className="execution-evidence-file-preview">
                  <ExecutionEvidencePreviewIcon />
                  <strong>{executionEvidencePreview.fileName || "Attached evidence"}</strong>
                  <a href={executionEvidencePreview.sourceUrl} rel="noreferrer" target="_blank">Open attachment</a>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <AiInsightPreviewDialog
        assuranceTitle="Failure cluster grounding"
        emptyMessage="No failed or blocked result is available to cluster for this run."
        error={previewExecutionFailureClusters.error instanceof Error ? previewExecutionFailureClusters.error.message : null}
        eyebrow="Run evidence"
        findings={failureClusterFindings}
        gaps={previewExecutionFailureClusters.data?.unclassified_count ? [`${previewExecutionFailureClusters.data.unclassified_count} result${previewExecutionFailureClusters.data.unclassified_count === 1 ? " needs" : "s need"} manual classification.`] : []}
        loading={previewExecutionFailureClusters.isPending}
        onClose={() => setIsFailureClusterPreviewOpen(false)}
        open={isFailureClusterPreviewOpen}
        recommendedActions={previewExecutionFailureClusters.data?.recommended_actions || []}
        response={previewExecutionFailureClusters.data}
        signals={previewExecutionFailureClusters.data ? [
          { label: "Failed / blocked", value: String(previewExecutionFailureClusters.data.failed_or_blocked_results), tone: previewExecutionFailureClusters.data.failed_or_blocked_results ? "warning" : "positive" },
          { label: "Rule clusters", value: String(previewExecutionFailureClusters.data.clusters.length), tone: "neutral" },
          { label: "Unclassified", value: String(previewExecutionFailureClusters.data.unclassified_count), tone: previewExecutionFailureClusters.data.unclassified_count ? "warning" : "positive" }
        ] : []}
        subtitle={previewExecutionFailureClusters.data ? `${previewExecutionFailureClusters.data.execution.display_id} · ${previewExecutionFailureClusters.data.execution.name}` : selectedExecution?.name || "Selected run"}
        summary={previewExecutionFailureClusters.data?.explanation}
        title="Preview failure clusters"
      />

      {executionApiDetailState ? (
        <ExecutionApiStepDialog
          canRun={!isExecutionLocked && Boolean(selectedExecution && selectedTestCaseId) && Boolean(executionApiDetailState.step.api_request)}
          captures={executionApiDetailState.captures}
          detail={executionApiDetailState.detail}
          isRunning={runningExecutionApiStepId === executionApiDetailState.step.id}
          note={executionApiDetailState.note}
          onClose={() => setExecutionApiDetailState(null)}
          onRun={() => void handleRunExecutionApiStep(executionApiDetailState.step)}
          status={executionApiDetailState.status}
          step={executionApiDetailState.step}
        />
      ) : null}

      {codePreviewState ? (
        <CodePreviewDialog
          code={codePreviewState.code}
          onClose={() => setCodePreviewState(null)}
          subtitle={codePreviewState.subtitle}
          title={codePreviewState.title}
        />
      ) : null}

      {selectedExecution && isExecutionContextModalOpen ? (
        <ExecutionContextSnapshotModal execution={selectedExecution} onClose={() => setIsExecutionContextModalOpen(false)} />
      ) : null}

      {selectedExecution && isReportEmailModalOpen ? (
        <ReportEmailModal
          isSubmitting={shareExecutionReport.isPending}
          onClose={() => setIsReportEmailModalOpen(false)}
          onRecipientsChange={setReportEmailDraft}
          onSubmit={(event) => void handleShareExecutionReport(event)}
          recipients={reportEmailDraft}
          runName={selectedExecution.name || "Selected run"}
        />
      ) : null}

      {isCreateExecutionModalOpen ? (
        <ExecutionCreateModal
          appTypeId={appTypeId}
          appTypes={appTypes}
          assigneeOptions={assigneeOptions}
          canCreateExecution={canCreateExecution}
          executionCreateMode={executionCreateMode}
          executionStartMode={executionStartMode}
          executionParallelEnabled={executionParallelEnabled}
          executionParallelCount={executionParallelCount}
          executionName={executionName}
          integrations={integrations}
          executionHookDraft={executionHookDraft}
          isPreviewingSmartExecution={previewSmartExecution.isPending}
          isSubmitting={createExecution.isPending}
          libraryCases={smartExecutionLibraryCases}
          onAssigneeChange={setSelectedExecutionAssigneeIds}
          onConfigurationChange={handleExecutionConfigurationChange}
          onDataSetChange={handleExecutionDataSetChange}
          onEnvironmentChange={handleExecutionEnvironmentChange}
          onAppTypeChange={handleExecutionAppTypeChange}
          onClose={closeExecutionBuilder}
          onExecutionCreateModeChange={setExecutionCreateMode}
          onExecutionStartModeChange={setExecutionStartMode}
          onExecutionParallelEnabledChange={setExecutionParallelEnabled}
          onExecutionParallelCountChange={setExecutionParallelCount}
          onExecutionNameChange={setExecutionName}
          onExecutionReleaseChange={setExecutionRelease}
          onExecutionSprintChange={setExecutionSprint}
          onExecutionBuildChange={setExecutionBuild}
          onExecutionHookDraftChange={setExecutionHookDraft}
          onPreviewSmartExecution={() => void handlePreviewSmartExecution()}
          onProjectChange={handleExecutionProjectChange}
          onSuiteSelectionChange={setSelectedSuiteIds}
          onSelectAllSmartExecutionCases={() =>
            setSelectedSmartExecutionCaseIds(
              smartPreviewCases
                .filter((testCase) => executionStartMode === "manual" || smartExecutionLibraryCaseById.get(testCase.test_case_id)?.automated === "yes")
                .map((testCase) => testCase.test_case_id)
            )
          }
          onClearSmartExecutionCases={() => setSelectedSmartExecutionCaseIds([])}
          onClearSmartExecutionRequirements={handleClearSmartExecutionRequirements}
          onSmartExecutionAdditionalContextChange={handleSmartExecutionAdditionalContextChange}
          onSmartExecutionIntegrationChange={handleSmartExecutionIntegrationChange}
          onSmartExecutionRequirementSearchChange={setSmartExecutionRequirementSearch}
          onSmartExecutionReleaseScopeChange={handleSmartExecutionReleaseScopeChange}
          onSelectAllSmartExecutionRequirements={(requirementIds) => handleSelectSmartExecutionRequirements(requirementIds)}
          onSubmit={(event) => void handleCreateExecution(event)}
          onToggleSmartExecutionRequirement={handleToggleSmartExecutionRequirement}
          onToggleSmartExecutionCase={(testCaseId) =>
            setSelectedSmartExecutionCaseIds((current) =>
              current.includes(testCaseId) ? current.filter((id) => id !== testCaseId) : [...current, testCaseId]
            )
          }
          projectId={projectId}
          projects={projects}
          selectedConfigurationId={selectedExecutionConfigurationId}
          selectedExecutionAssigneeIds={selectedExecutionAssigneeIds}
          executionRelease={executionRelease}
          executionSprint={executionSprint}
          executionBuild={executionBuild}
          scopeSuites={scopeSuites}
          selectedAppType={selectedAppType?.name || ""}
          selectedDataSetId={selectedExecutionDataSetId}
          selectedEnvironmentId={selectedExecutionEnvironmentId}
          selectedProject={selectedProject?.name || ""}
          selectedSuiteIds={selectedSuiteIds}
          selectedSmartExecutionCaseIds={selectedSmartExecutionCaseIds}
          smartExecutionAdditionalContext={smartExecutionAdditionalContext}
          smartExecutionIntegrationId={smartExecutionIntegrationId}
          smartExecutionPreview={smartExecutionPreview}
          smartExecutionPreviewMessage={smartExecutionPreviewMessage}
          smartExecutionPreviewTone={smartExecutionPreviewTone}
          smartExecutionRequirementOptions={smartExecutionRequirementOptions}
          smartExecutionRequirementSearch={smartExecutionRequirementSearch}
          smartExecutionReleaseScope={smartExecutionReleaseScope}
          selectedSmartRequirementIds={selectedSmartRequirementIds}
        />
      ) : null}

      {isCreateScheduleModalOpen ? (
        <CreateExecutionScheduleModal
          appTypeId={appTypeId}
          appTypeName={selectedAppType?.name || ""}
          assigneeOptions={assigneeOptions}
          cadence={scheduleCadence}
          intervalMinutes={scheduleIntervalMinutes}
          executionName={executionName}
          isSubmitting={createExecutionSchedule.isPending || updateExecutionSchedule.isPending}
          mode={scheduleModalMode}
          nextRunAt={scheduleNextRunAt}
          onAssigneeChange={setSelectedExecutionAssigneeIds}
          onCadenceChange={setScheduleCadence}
          onExecutionBuildChange={setExecutionBuild}
          onExecutionReleaseChange={setExecutionRelease}
          onExecutionSprintChange={setExecutionSprint}
          onIntervalMinutesChange={setScheduleIntervalMinutes}
          onClose={closeScheduleBuilder}
          onConfigurationChange={setSelectedExecutionConfigurationId}
          onDataSetChange={setSelectedExecutionDataSetId}
          onEnvironmentChange={setSelectedExecutionEnvironmentId}
          onExecutionNameChange={setExecutionName}
          onNextRunAtChange={setScheduleNextRunAt}
          onSubmit={(event) => void handleSubmitExecutionSchedule(event)}
          onSuiteSelectionChange={setSelectedSuiteIds}
          projectId={projectId}
          projectName={selectedProject?.name || ""}
          scopeSuites={scopeSuites}
          selectedAssigneeIds={selectedExecutionAssigneeIds}
          selectedConfigurationId={selectedExecutionConfigurationId}
          selectedDataSetId={selectedExecutionDataSetId}
          selectedEnvironmentId={selectedExecutionEnvironmentId}
          selectedSuiteIds={selectedSuiteIds}
          executionRelease={executionRelease}
          executionSprint={executionSprint}
          executionBuild={executionBuild}
        />
      ) : null}
    </div>
  );
}

function ExecutionAccordionPanel({
  title,
  subtitle,
  isExpanded,
  onToggle,
  className = "",
  children
}: {
  title: string;
  subtitle?: string;
  isExpanded: boolean;
  onToggle: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`panel card execution-accordion-panel ${className}`.trim()}>
      <button
        aria-expanded={isExpanded}
        className="execution-accordion-toggle execution-accordion-toggle--panel"
        onClick={onToggle}
        type="button"
      >
        <div className="execution-accordion-toggle-main">
          <span aria-hidden="true" className={isExpanded ? "execution-accordion-icon is-expanded" : "execution-accordion-icon"}>
            <ExecutionAccordionChevronIcon />
          </span>
          <div className="execution-accordion-toggle-copy">
            <strong>{title}</strong>
            {subtitle ? <span>{subtitle}</span> : null}
          </div>
        </div>
        <div className="execution-accordion-toggle-meta">
          <span className="execution-accordion-toggle-state">{isExpanded ? "Collapse" : "Expand"}</span>
        </div>
      </button>
      {isExpanded ? <div className="execution-accordion-panel-body">{children}</div> : null}
    </section>
  );
}

function ExecutionAccordionSection({
  title,
  summary,
  isExpanded,
  onToggle,
  className = "",
  children
}: {
  title: string;
  summary: string;
  isExpanded: boolean;
  onToggle: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`${isExpanded ? "execution-accordion-section is-expanded" : "execution-accordion-section"} ${className}`.trim()}>
      <button
        aria-expanded={isExpanded}
        className="execution-accordion-toggle execution-accordion-toggle--section"
        onClick={onToggle}
        type="button"
      >
        <div className="execution-accordion-toggle-main">
          <span aria-hidden="true" className={isExpanded ? "execution-accordion-icon is-expanded" : "execution-accordion-icon"}>
            <ExecutionAccordionChevronIcon />
          </span>
          <div className="execution-accordion-toggle-copy">
            <strong>{title}</strong>
            <span>{summary}</span>
          </div>
        </div>
        <div className="execution-accordion-toggle-meta">
          <span className="execution-accordion-toggle-state">{isExpanded ? "Collapse" : "Expand"}</span>
        </div>
      </button>
      {isExpanded ? <div className="execution-accordion-body">{children}</div> : null}
    </section>
  );
}

function ReportEmailModal({
  runName,
  recipients,
  isSubmitting,
  onRecipientsChange,
  onClose,
  onSubmit
}: {
  runName: string;
  recipients: string;
  isSubmitting: boolean;
  onRecipientsChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="modal-backdrop" onClick={() => !isSubmitting && onClose()} role="presentation">
      <form
        aria-label="Email run report"
        aria-modal="true"
        className="modal-card resource-modal-card"
        onClick={(event) => event.stopPropagation()}
        onSubmit={onSubmit}
        role="dialog"
      >
        <div className="resource-modal-header">
          <div className="resource-modal-title">
            <p className="dialog-context-label">Run report</p>
            <h2 className="dialog-title">Email report</h2>
            <p>{runName}</p>
          </div>
          <button className="ghost-button" disabled={isSubmitting} onClick={onClose} type="button">
            Close
          </button>
        </div>
        <div className="resource-form">
          <div className="resource-form-body">
            <FormField label="Recipients" hint="Separate multiple recipients with commas, semicolons, or new lines.">
              <textarea
                autoFocus
                onChange={(event) => onRecipientsChange(event.target.value)}
                placeholder="qa-lead@example.com, release-manager@example.com"
                rows={4}
                value={recipients}
              />
            </FormField>
          </div>
          <div className="resource-form-actions action-row">
            <button className="primary-button" disabled={isSubmitting} type="submit">
              <MailIcon />
              <span>{isSubmitting ? "Sending…" : "Send HTML report"}</span>
            </button>
            <button className="ghost-button" disabled={isSubmitting} onClick={onClose} type="button">
              Cancel
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function ExecutionApiStepDialog({
  step,
  detail,
  captures: capturedParams,
  note,
  status,
  canRun,
  isRunning,
  onClose,
  onRun
}: ExecutionApiStepDialogProps) {
  const [selectedJsonPath, setSelectedJsonPath] = useState<{ path: string; value: unknown } | null>(null);
  const requestHeaders = useMemo(
    () =>
      detail?.request?.headers
        ? Object.entries(detail.request.headers).sort(([left], [right]) => left.localeCompare(right))
        : (step.api_request?.headers || [])
            .filter((header) => header?.key)
            .map((header) => [String(header.key), String(header.value || "")] as const),
    [detail?.request?.headers, step.api_request?.headers]
  );
  const responseHeaders = useMemo(
    () => Object.entries(detail?.response?.headers || {}).sort(([left], [right]) => left.localeCompare(right)),
    [detail?.response?.headers]
  );
  const captures = useMemo(
    () => Object.entries(capturedParams || detail?.captures || {}).sort(([left], [right]) => left.localeCompare(right)),
    [capturedParams, detail?.captures]
  );
  const assertions = detail?.assertions || (step.api_request?.validations || []).map((validation) => ({
    kind: validation.kind || "status",
    passed: false,
    target: validation.target || null,
    expected: validation.expected || null,
    actual: null
  }));
  const requestBody =
    detail?.request?.body !== undefined
      ? detail.request.body
      : step.api_request?.body || null;
  const requestInfo = useMemo(
    () => ({
      method: (detail?.request?.method || step.api_request?.method || "GET") as NonNullable<NonNullable<TestStep["api_request"]>["method"]>,
      url: detail?.request?.url || step.api_request?.url || "",
      headers: requestHeaders.map(([key, value]) => ({ key, value })),
      body_mode: step.api_request?.body_mode || (requestBody ? "text" : "none"),
      body: requestBody || ""
    }),
    [detail?.request?.method, detail?.request?.url, requestBody, requestHeaders, step.api_request?.body_mode, step.api_request?.method, step.api_request?.url]
  );
  const responseJson = detail?.response?.json !== undefined ? detail.response.json : null;
  const responseBody = detail?.response
    ? detail.response.json !== undefined && detail.response.json !== null
      ? JSON.stringify(detail.response.json, null, 2)
      : detail.response.body || ""
    : "";
  const selectedJsonValue = useMemo(() => {
    if (!selectedJsonPath) {
      return "";
    }

    if (selectedJsonPath.value === null || selectedJsonPath.value === undefined) {
      return String(selectedJsonPath.value);
    }

    if (typeof selectedJsonPath.value === "string") {
      return selectedJsonPath.value;
    }

    try {
      return JSON.stringify(selectedJsonPath.value, null, 2);
    } catch {
      return String(selectedJsonPath.value);
    }
  }, [selectedJsonPath]);

  useEffect(() => {
    setSelectedJsonPath(null);
  }, [detail?.response?.body, detail?.response?.status, step.id]);

  return (
    <div className="modal-backdrop modal-backdrop--scroll" onClick={onClose} role="presentation">
      <div
        aria-label={`Step ${step.step_order} API execution details`}
        aria-modal="true"
        className="modal-card resource-modal-card automation-editor-modal execution-api-detail-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="resource-modal-header">
          <div className="resource-modal-title">
            <div className="execution-api-detail-title-row">
              <span className="execution-step-type-chip">
                <StepTypeIcon size={14} type={step.step_type || "api"} />
              </span>
              <StatusBadge value={status} />
            </div>
            <h2 className="dialog-title">{`Step ${step.step_order} API details`}</h2>
            <p>{step.action || "Inspect the snapped API request, latest response, and configured assertions for this run."}</p>
          </div>
          <button className="ghost-button" onClick={onClose} type="button">
            Close
          </button>
        </div>
        <div className="resource-form">
          <div className="resource-form-body execution-api-detail-body">
            <div className="metric-strip compact">
              <div className="mini-card">
                <strong>{detail?.request?.method || step.api_request?.method || "GET"}</strong>
                <span>Method</span>
              </div>
              <div className="mini-card">
                <strong>{detail?.response?.status ?? "Pending"}</strong>
                <span>Response</span>
              </div>
              <div className="mini-card">
                <strong>{assertions.length}</strong>
                <span>Assertions</span>
              </div>
            </div>

            <div className="automation-response-results">
              <div className="automation-response-header">
                <div>
                  <strong>API response capture</strong>
                  <span>Use the same QAira backend API step runner that powers engine-side API execution, then inspect the persisted request, response, assertions, and captures for this run.</span>
                </div>
                {canRun ? (
                  <button
                    className="primary-button automation-run-button"
                    disabled={isRunning}
                    onClick={onRun}
                    type="button"
                  >
                    <PlayIcon />
                    <span>{isRunning ? "Running..." : "Run step"}</span>
                  </button>
                ) : null}
              </div>

              <ApiRequestInfoDetails request={requestInfo} />

              <div className="automation-response-meta">
                <strong>Request</strong>
                <span>{detail?.request?.url || step.api_request?.url || "No request URL captured yet."}</span>
                {requestHeaders.length ? (
                  <details className="automation-request-details execution-api-header-details">
                    <summary>
                      <span>Request headers</span>
                      <strong>{requestHeaders.length}</strong>
                    </summary>
                    <div className="automation-request-details-body automation-response-headers">
                    {requestHeaders.map(([key, value]) => (
                      <span className="automation-response-header-chip" key={key}>
                        <strong>{key}</strong>
                        <span>{value}</span>
                      </span>
                    ))}
                    </div>
                  </details>
                ) : null}
                {requestBody ? (
                  <pre className="automation-code-block automation-code-block--compact automation-code-block--selection">
                    <code>{requestBody}</code>
                  </pre>
                ) : null}
              </div>

              <div className="automation-response-meta">
                <strong>Response</strong>
                <span>
                  {detail?.response
                    ? `${detail.response.status} ${detail.response.status_text || ""}`.trim()
                    : "This step has not returned a structured API response yet."}
                </span>
                {detail?.response ? (
                  <div className="automation-response-summary">
                    <span className={status === "passed" ? "automation-response-pill is-success" : status === "failed" ? "automation-response-pill is-danger" : "automation-response-pill"}>
                      {detail.response.status}
                    </span>
                    <span className="automation-response-pill">{detail.request?.method || step.api_request?.method || "GET"}</span>
                    <span className="automation-response-pill">{detail.response.headers?.["content-type"] || "Unknown content type"}</span>
                  </div>
                ) : null}
                {responseHeaders.length ? (
                  <details className="automation-request-details execution-api-header-details">
                    <summary>
                      <span>Response headers</span>
                      <strong>{responseHeaders.length}</strong>
                    </summary>
                    <div className="automation-request-details-body automation-response-headers">
                    {responseHeaders.map(([key, value]) => (
                      <span className="automation-response-header-chip" key={key}>
                        <strong>{key}</strong>
                        <span>{value}</span>
                      </span>
                    ))}
                    </div>
                  </details>
                ) : null}
                {responseBody ? (
                  <pre className="automation-code-block automation-code-block--compact automation-code-block--selection">
                    <code>{responseBody}</code>
                  </pre>
                ) : null}
              </div>

              {responseJson !== null && responseJson !== undefined ? (
                <div className="automation-response-tree-shell">
                  <div className="automation-response-tree-panel">
                    <strong>JSON path explorer</strong>
                    <span>Inspect the structured response with the same read format used in API authoring.</span>
                    <div className="api-response-tree">
                      <JsonResponseTreeNode
                        depth={0}
                        label="$"
                        onSelect={setSelectedJsonPath}
                        path="$"
                        selectedPath={selectedJsonPath?.path || ""}
                        value={responseJson}
                      />
                    </div>
                  </div>
                  <div className="automation-response-selection">
                    <strong>Selected node</strong>
                    <span>{selectedJsonPath ? selectedJsonPath.path : "Choose a node from the JSON hierarchy to inspect its value."}</span>
                    {selectedJsonPath ? (
                      <pre className="automation-code-block automation-code-block--compact automation-code-block--selection">
                        <code>{selectedJsonValue}</code>
                      </pre>
                    ) : null}
                    {captures.length ? (
                      <div className="automation-response-save">
                        <strong>Captured params</strong>
                        <span>These values were persisted from the response and are available to later steps in this run.</span>
                        <div className="automation-response-headers">
                          {captures.map(([key, value]) => (
                            <span className="automation-response-header-chip" key={key}>
                              <strong>{key}</strong>
                              <span>{value}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div className="automation-response-meta">
                <strong>Assertions</strong>
                {assertions.length ? (
                  <div className="execution-api-assertion-list">
                    {assertions.map((assertion, index) => (
                      <div className="execution-api-assertion-row" key={`${assertion.kind}-${assertion.target || "status"}-${index}`}>
                        <span className={assertion.passed ? "automation-response-pill is-success" : "automation-response-pill is-danger"}>
                          {assertion.passed ? "Passed" : detail ? "Failed" : "Configured"}
                        </span>
                        <div className="execution-api-assertion-copy">
                          <strong>{assertion.kind}{assertion.target ? ` · ${assertion.target}` : ""}</strong>
                          <span>
                            {assertion.expected ? `Expected ${assertion.expected}` : "No explicit expected value"}
                            {detail && assertion.actual !== undefined && assertion.actual !== null ? ` · Actual ${assertion.actual}` : ""}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state compact">No assertions configured for this API step.</div>
                )}
              </div>

              {captures.length && (responseJson === null || responseJson === undefined) ? (
                <div className="automation-response-meta">
                  <strong>Captured values</strong>
                  <div className="automation-response-headers">
                    {captures.map(([key, value]) => (
                      <span className="automation-response-header-chip" key={key}>
                        <strong>{key}</strong>
                        <span>{value}</span>
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {note ? (
                <div className="automation-response-meta">
                  <strong>Run note</strong>
                  <pre className="automation-code-block automation-code-block--compact automation-code-block--selection">
                    <code>{note}</code>
                  </pre>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ExecutionAccordionChevronIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="18" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="18">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function ExecutionAssigneeChip({
  user,
  className = "",
  fallback = "Unassigned",
  labelOverride
}: {
  user?: { name?: string | null; email?: string | null } | null;
  className?: string;
  fallback?: string;
  labelOverride?: string;
}) {
  const label = labelOverride || (user ? resolveUserPrimaryLabel(user) : fallback);
  const detail = user ? resolveUserSecondaryLabel(user) : null;

  return (
    <span className={["execution-card-assignee", className].filter(Boolean).join(" ")} title={detail || label}>
      <span className="execution-card-assignee-avatar" aria-hidden="true">
        {resolveUserInitials(user)}
      </span>
      <span>{label}</span>
    </span>
  );
}

function resolveExecutionAssigneeSummary(execution?: Pick<Execution, "assigned_user" | "assigned_users"> | null) {
  const users = execution?.assigned_users?.length
    ? execution.assigned_users
    : execution?.assigned_user
      ? [execution.assigned_user]
      : [];

  if (!users.length) {
    return "Unassigned";
  }

  if (users.length <= 2) {
    return users.map((user) => resolveUserPrimaryLabel(user)).join(", ");
  }

  return `${users.slice(0, 2).map((user) => resolveUserPrimaryLabel(user)).join(", ")} +${users.length - 2}`;
}

function ExecutionListCard({
  execution,
  summary,
  impactSummary,
  liveNow,
  isActive,
  isSelected,
  onSelect,
  onToggleSelected
}: {
  execution: Execution;
  summary: ExecutionRunSummary;
  impactSummary: ExecutionRunImpactSummary;
  liveNow: number;
  isActive: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onToggleSelected: () => void;
}) {
  const totalScopedCases = execution.case_snapshots?.length || summary.total || 0;
  const resolvedTotal = Math.max(totalScopedCases, summary.total, 0);
  const executionStatus = normalizeExecutionStatus(execution.status);
  const isTestCaseRun = execution.suite_ids.length === 0;
  const issueCount = summary.failed + summary.blocked;
  const topImpactedRequirement = impactSummary.impactedRequirements[0] || null;
  const visibleImpactedRequirements = impactSummary.impactedRequirements.slice(0, 3);
  const referenceCount = new Set(
    (execution.case_snapshots || [])
      .flatMap((snapshot) => snapshot.external_references || [])
      .map((reference) => String(reference).trim())
      .filter(Boolean)
  ).size;
  const riskTone = getExecutionRiskTone(summary, impactSummary);
  const riskLabel = getExecutionRiskLabel(summary, impactSummary);
  const riskInsight = getExecutionRiskInsight(summary, impactSummary, resolvedTotal);
  const createdLabel = formatExecutionTimestamp(execution.created_at, "Not recorded");
  const durationLabel = formatDuration(
    computeExecutionDurationMs(execution.started_at, execution.ended_at, liveNow),
    DEFAULT_DURATION_LABEL
  );
  const startedLabel = formatExecutionTimestamp(
    execution.started_at,
    executionStatus === "queued" ? "Not started yet" : "Waiting to start"
  );
  const latestEvidenceLabel = summary.latestActivityAt
    ? formatExecutionTimestamp(summary.latestActivityAt)
    : "No evidence yet";
  const progressDetail = resolvedTotal
    ? `${summary.total}/${resolvedTotal} touched · ${summary.failed} failed · ${summary.blocked} blocked`
    : "No evidence recorded yet";
  const completionPercent = resolvedTotal ? Math.round((summary.total / resolvedTotal) * 100) : 0;

  return (
    <div
      aria-pressed={isActive}
      className={isActive ? "record-card tile-card execution-card virtual-card is-active" : "record-card tile-card execution-card virtual-card"}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) {
          return;
        }

        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="tile-card-select-row" onClick={(event) => event.stopPropagation()}>
        <label className="checkbox-field">
          <input
            aria-label={`Select ${execution.name || "Unnamed run"}`}
            checked={isSelected}
            onChange={onToggleSelected}
            type="checkbox"
          />
          <span className="sr-only">Select run</span>
        </label>
      </div>
      <div className="tile-card-main">
        <div className="tile-card-header">
          <div
            aria-hidden="true"
            className={`record-card-icon execution status-${executionStatus}`}
            title={executionStatusTooltip(executionStatus)}
          >
            <ExecutionRunIcon />
          </div>
          <div className="tile-card-title-group">
            <strong>{execution.name || "Unnamed run"}</strong>
            <ExecutionAssigneeChip
              labelOverride={resolveExecutionAssigneeSummary(execution)}
              user={execution.assigned_users?.[0] || execution.assigned_user}
            />
            <span className="tile-card-kicker">Created {createdLabel}</span>
          </div>
          <ExecutionStatusIndicator status={executionStatus} />
        </div>

        <div className="execution-card-facts" aria-label="Run facts">
          <ExecutionCardFact
            ariaLabel={
              isTestCaseRun
                ? `${resolvedTotal} direct test case${resolvedTotal === 1 ? "" : "s"} in scope`
                : `${execution.suite_ids.length} suites in scope`
            }
            label={isTestCaseRun ? String(resolvedTotal) : String(execution.suite_ids.length)}
            title={
              isTestCaseRun
                ? `${resolvedTotal} direct test case${resolvedTotal === 1 ? "" : "s"} in scope`
                : `${execution.suite_ids.length} suites in scope`
            }
          >
            {isTestCaseRun ? <ExecutionScopeIcon /> : <ExecutionSuiteIcon />}
          </ExecutionCardFact>
          <ExecutionCardFact
            ariaLabel={resolvedTotal ? `${summary.total} of ${resolvedTotal} cases touched` : `${summary.total} cases touched`}
            label={resolvedTotal ? `${summary.total}/${resolvedTotal}` : `${summary.total}`}
            title={resolvedTotal ? `${summary.total}/${resolvedTotal} cases touched` : `${summary.total} cases touched`}
          >
            <ExecutionScopeIcon />
          </ExecutionCardFact>
          <ExecutionCardFact
            ariaLabel={issueCount ? `${issueCount} failed or blocked cases` : executionStatus === "aborted" ? "Run aborted before failures were recorded" : "No failed or blocked cases"}
            label={String(issueCount)}
            title={issueCount ? `${issueCount} failed or blocked cases` : executionStatus === "aborted" ? "Run aborted before failures were recorded" : "No failed or blocked cases"}
            tone={issueCount ? "danger" : executionStatus === "aborted" ? "warning" : "success"}
          >
            <ExecutionRiskIcon />
          </ExecutionCardFact>
          <ExecutionCardFact
            ariaLabel={`${impactSummary.failedRequirementCount} impacted requirements with failed or blocked cases`}
            label={impactSummary.totalRequirements ? `${impactSummary.failedRequirementCount}/${impactSummary.totalRequirements}` : "0"}
            title={topImpactedRequirement ? `${topImpactedRequirement.title} · ${topImpactedRequirement.failureRate}% failure rate` : "No requirement impact detected"}
            tone={impactSummary.failedRequirementCount ? "warning" : "neutral"}
          >
            <ExecutionRequirementImpactIcon />
          </ExecutionCardFact>
          <ExecutionCardFact
            ariaLabel={`${referenceCount} external references in scoped cases`}
            label={referenceCount ? String(referenceCount) : "0"}
            title={referenceCount ? `${referenceCount} linked external reference${referenceCount === 1 ? "" : "s"}` : "No external references linked to scoped cases"}
            tone={referenceCount ? "info" : "neutral"}
          >
            <ExecutionReferenceIcon />
          </ExecutionCardFact>
          <ExecutionCardFact
            ariaLabel={`Run duration ${durationLabel}`}
            label={durationLabel}
            title={`Started: ${startedLabel}${summary.latestActivityAt ? ` • Latest evidence: ${latestEvidenceLabel}` : executionStatus === "aborted" ? " • Run stopped before completion" : ""}`}
            tone={executionStatus === "aborted" ? "warning" : "neutral"}
          >
            <ExecutionTimeIcon />
          </ExecutionCardFact>
          <ExecutionCardFact
            ariaLabel={`Release ${execution.release || "not set"}`}
            label={execution.release || "Release —"}
            title={`Release: ${execution.release || "Not set"}`}
            tone={execution.release ? "info" : "neutral"}
          >
            <ExecutionReferenceIcon />
          </ExecutionCardFact>
          <ExecutionCardFact
            ariaLabel={`Build ${execution.build || "not set"}`}
            label={execution.build || "Build —"}
            title={`Sprint: ${execution.sprint || "Not set"} • Build: ${execution.build || "Not set"}`}
            tone={execution.build || execution.sprint ? "info" : "neutral"}
          >
            <ExecutionReferenceIcon />
          </ExecutionCardFact>
        </div>

        <div className={`execution-card-risk-note ${riskTone}`}>
          <span>{riskLabel}</span>
          <p>{riskInsight}</p>
        </div>

        {visibleImpactedRequirements.length ? (
          <div className="execution-card-impact-strip" aria-label="Run impacted requirements">
            <div className="execution-card-impact-strip-head">
              <strong>Impacted requirements</strong>
              <span>{impactSummary.failedRequirementCount}/{impactSummary.totalRequirements} with failures</span>
            </div>
            <div className="execution-impact-chip-row">
              {visibleImpactedRequirements.map((requirement) => (
                <span className={requirement.failedCases ? "execution-impact-chip is-impacted" : "execution-impact-chip"} key={requirement.id}>
                  <b>{requirement.title}</b>
                  <small>P{requirement.priority ?? 3} · {requirement.failedCases}/{requirement.totalCases} failed</small>
                </span>
              ))}
              {impactSummary.impactedRequirements.length > visibleImpactedRequirements.length ? (
                <span className="execution-impact-chip is-more">+{impactSummary.impactedRequirements.length - visibleImpactedRequirements.length} more</span>
              ) : null}
            </div>
          </div>
        ) : null}

        <ProgressMeter
          detail={progressDetail}
          hideCopy
          label="Run completion"
          segments={buildProgressSegments(
            summary.passed,
            summary.failed,
            summary.blocked,
            resolvedTotal || summary.total
          )}
          value={completionPercent}
        />
      </div>
    </div>
  );
}

function ExecutionScheduleCard({
  schedule,
  isActive,
  isSelected,
  onSelect,
  onToggleSelected,
  onEdit,
  onRun,
  onDelete
}: {
  schedule: ExecutionSchedule;
  isActive: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onToggleSelected: () => void;
  onEdit: () => void;
  onRun: () => void;
  onDelete: () => void;
}) {
  const nextRunLabel = formatExecutionTimestamp(schedule.next_run_at, "Not scheduled");
  const assigneeLabel = resolveExecutionAssigneeSummary(schedule);
  const releaseLabel = schedule.release || "Release not set";
  const buildLabel = schedule.build || schedule.sprint || "Build not set";

  return (
    <div className={isActive ? "record-card tile-card execution-card virtual-card is-active" : "record-card tile-card execution-card virtual-card"}>
      <div className="tile-card-select-row">
        <label className="checkbox-field">
          <input
            aria-label={`Select ${schedule.name}`}
            checked={isSelected}
            onChange={onToggleSelected}
            type="checkbox"
          />
          <span className="sr-only">Select schedule</span>
        </label>
      </div>
      <button className="tile-card-main execution-schedule-card-button" onClick={onSelect} type="button">
        <div className="tile-card-header">
          <div aria-hidden="true" className={`record-card-icon execution status-${schedule.is_active ? "queued" : "aborted"}`}>
            <ExecutionScheduleIcon />
          </div>
          <div className="tile-card-title-group">
            <strong>{schedule.name}</strong>
            <span className="execution-card-assignee">{schedule.is_active ? `${formatScheduleCadence(schedule.cadence)} cadence` : "Inactive schedule"}</span>
          </div>
          <ExecutionStatusIndicator status={schedule.is_active ? "queued" : "aborted"} />
        </div>

        <div className="execution-card-facts" aria-label="Schedule facts">
          <ExecutionCardFact ariaLabel={`${schedule.suite_ids.length} suites in scope`} label={String(schedule.suite_ids.length)} title={`${schedule.suite_ids.length} suites in scope`}>
            <ExecutionSuiteIcon />
          </ExecutionCardFact>
          <ExecutionCardFact ariaLabel={`${schedule.test_case_ids.length} direct cases in scope`} label={String(schedule.test_case_ids.length)} title={`${schedule.test_case_ids.length} direct cases in scope`}>
            <ExecutionScopeIcon />
          </ExecutionCardFact>
          <ExecutionCardFact ariaLabel={`Assigned to ${assigneeLabel}`} label={assigneeLabel} title={`Assigned to ${assigneeLabel}`}>
            <ExecutionAssigneeIcon />
          </ExecutionCardFact>
          <ExecutionCardFact ariaLabel={releaseLabel} label={releaseLabel} title={releaseLabel}>
            <ExecutionReleaseIcon />
          </ExecutionCardFact>
          <ExecutionCardFact ariaLabel={buildLabel} label={buildLabel} title={buildLabel}>
            <ExecutionBuildIcon />
          </ExecutionCardFact>
          <ExecutionCardFact ariaLabel={`Next run ${nextRunLabel}`} label={nextRunLabel} title={`Next run ${nextRunLabel}`}>
            <ExecutionTimeIcon />
          </ExecutionCardFact>
        </div>
      </button>

      <div className="action-row execution-schedule-actions">
        <button className="ghost-button" onClick={onEdit} type="button">
          <ExecutionEditIcon />
          <span>Edit</span>
        </button>
        <button className="ghost-button" onClick={onRun} type="button">
          <ExecutionStartIcon />
          <span>Run now</span>
        </button>
        <button className="ghost-button danger" onClick={onDelete} type="button">
          <ExecutionDeleteIcon />
          <span>Delete</span>
        </button>
      </div>
    </div>
  );
}

function WorkspaceTransactionCard({
  transaction,
  isActive,
  isSelected,
  onSelect,
  onToggleSelected,
  appTypeNameById,
  projectNameById
}: {
  transaction: WorkspaceTransaction;
  isActive: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onToggleSelected: () => void;
  appTypeNameById: Record<string, string>;
  projectNameById: Record<string, string>;
}) {
  const presentation = describeWorkspaceTransaction(transaction, {
    appTypeNameById,
    projectNameById
  });
  const summary = resolveWorkspaceTransactionSummary(transaction, presentation);
  const scopeLabel = transaction.app_type_id
    ? appTypeNameById[transaction.app_type_id] || "App type scope"
    : transaction.project_id
      ? projectNameById[transaction.project_id] || "Project scope"
      : "Workspace scope";
  const statusTone: BoardStatusTone =
    transaction.status === "queued" || transaction.status === "running" || transaction.status === "failed"
      ? transaction.status
      : "completed";
  const latestActivityLabel = formatExecutionTimestamp(
    transaction.latest_event_at || transaction.updated_at || transaction.created_at,
    "Timestamp unavailable"
  );
  const actionLabel = formatWorkspaceTransactionActionLabel(transaction.action);

  return (
    <div className={isActive ? "record-card tile-card execution-card workspace-transaction-card virtual-card is-active" : "record-card tile-card execution-card workspace-transaction-card virtual-card"}>
      <div className="tile-card-select-row">
        <label className="checkbox-field">
          <input
            aria-label={`Select ${transaction.title}`}
            checked={isSelected}
            onChange={onToggleSelected}
            type="checkbox"
          />
          <span className="sr-only">Select batch process</span>
        </label>
      </div>
      <button className="tile-card-main execution-schedule-card-button workspace-transaction-card-button" onClick={onSelect} type="button">
        <div className="tile-card-header">
          <div aria-hidden="true" className={`record-card-icon execution status-${statusTone}`}>
            {presentation.icon}
          </div>
          <div className="tile-card-title-group">
            <strong>{transaction.title}</strong>
            <span className="execution-card-assignee execution-card-assignee--wrap">{presentation.eyebrow}</span>
          </div>
          <ExecutionStatusIndicator status={statusTone} />
        </div>

        <div className="execution-card-facts" aria-label="Batch process facts">
          <ExecutionCardFact ariaLabel={`Scope ${scopeLabel}`} label={scopeLabel} title={`Scope ${scopeLabel}`}>
            <ActivityIcon />
          </ExecutionCardFact>
          <ExecutionCardFact ariaLabel={`Action ${actionLabel}`} label={actionLabel} title={`Action ${actionLabel}`}>
            <ExecutionRunIcon />
          </ExecutionCardFact>
          <ExecutionCardFact ariaLabel={`${transaction.event_count || 0} logged events`} label={formatCountLabel(transaction.event_count || 0, "event")} title={`${transaction.event_count || 0} logged events`}>
            <ExecutionScopeIcon />
          </ExecutionCardFact>
          <ExecutionCardFact ariaLabel={`Last activity ${latestActivityLabel}`} label={latestActivityLabel} title={`Last activity ${latestActivityLabel}`}>
            <ExecutionTimeIcon />
          </ExecutionCardFact>
        </div>

        <p className="tile-card-description workspace-transaction-card-summary">{summary}</p>
      </button>

      <div className="action-row execution-schedule-actions workspace-transaction-card-actions">
        <button className="ghost-button" onClick={onSelect} type="button">
          <OpenIcon />
          <span>Open details</span>
        </button>
      </div>
    </div>
  );
}

function ExecutionCardFact({
  title,
  ariaLabel,
  label,
  tone = "neutral",
  children
}: {
  title: string;
  ariaLabel: string;
  label?: string;
  tone?: "neutral" | "info" | "success" | "danger" | "warning";
  children: ReactNode;
}) {
  return (
    <span
      aria-label={ariaLabel}
      className={`execution-card-fact tone-${tone}`}
      title={title}
    >
      <span aria-hidden="true" className="execution-card-fact-icon">
        {children}
      </span>
      {label ? <span className="execution-card-fact-label">{label}</span> : null}
    </span>
  );
}

function ExecutionStatusIndicator({ status }: { status: BoardStatusTone }) {
  const tooltip = boardStatusTooltip(status);

  return (
    <span aria-label={tooltip} className={`execution-card-status status-${status}`} title={tooltip}>
      <ExecutionStatusIcon status={status} />
    </span>
  );
}

function ExecutionStatusIcon({ status }: { status: BoardStatusTone }) {
  if (status === "queued") {
    return (
      <svg aria-hidden="true" fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24" width="16">
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v4l3 2" />
      </svg>
    );
  }

  if (status === "running") {
    return (
      <svg aria-hidden="true" fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24" width="16">
        <path d="M5 12a7 7 0 0 1 7-7" />
        <path d="M19 12a7 7 0 0 1-7 7" />
        <path d="m13 8 4 0 0-4" />
        <path d="m11 16-4 0 0 4" />
      </svg>
    );
  }

  if (status === "completed" || status === "passed") {
    return (
      <svg aria-hidden="true" fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="16">
        <path d="M6 12.5 10 16l8-8" />
      </svg>
    );
  }

  if (status === "blocked") {
    return (
      <svg aria-hidden="true" fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24" width="16">
        <circle cx="12" cy="12" r="8" />
        <path d="M8 12h8" />
      </svg>
    );
  }

  if (status === "failed") {
    return (
      <svg aria-hidden="true" fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24" width="16">
        <path d="m12 4 8 14H4z" />
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24" width="16">
      <circle cx="12" cy="12" r="8" />
      <path d="M9 9l6 6" />
      <path d="M15 9l-6 6" />
    </svg>
  );
}

function ExecutionRunIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="20" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24" width="20">
      <path d="m9 7 8 5-8 5z" />
    </svg>
  );
}

function LiveRunIcon() {
  return (
    <ExecutionIconShell>
      <rect height="10" rx="2" width="16" x="4" y="5" />
      <path d="M8 19h8" />
      <path d="M12 15v4" />
      <path d="M10 9.5 13.5 12 10 14.5z" />
    </ExecutionIconShell>
  );
}

function ExecutionEditIcon() {
  return (
    <ExecutionIconShell>
      <path d="M4 20h4l10-10-4-4L4 16z" />
      <path d="m12 6 4 4" />
    </ExecutionIconShell>
  );
}

function ExecutionStartIcon() {
  return (
    <ExecutionIconShell>
      <path d="m9 7 8 5-8 5z" />
    </ExecutionIconShell>
  );
}

function ExecutionCompleteIcon() {
  return (
    <ExecutionIconShell>
      <path d="M6 12.5 10 16l8-8" />
    </ExecutionIconShell>
  );
}

function ExecutionAbortIcon() {
  return (
    <ExecutionIconShell>
      <circle cx="12" cy="12" r="8" />
      <rect height="5" rx="0.8" width="5" x="9.5" y="9.5" />
    </ExecutionIconShell>
  );
}

function ExecutionRerunIcon() {
  return (
    <ExecutionIconShell>
      <path d="M20 12a8 8 0 1 1-2.3-5.6" />
      <path d="M20 4v6h-6" />
    </ExecutionIconShell>
  );
}

function ExecutionScheduleIcon() {
  return (
    <ExecutionIconShell>
      <rect height="15" rx="2" width="16" x="4" y="5" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
      <path d="M4 10h16" />
      <path d="m10 15 1.5 1.5L15 13" />
    </ExecutionIconShell>
  );
}

function ExecutionReleaseIcon() {
  return (
    <ExecutionIconShell>
      <path d="M5 5h14v14H5z" />
      <path d="M8 9h8" />
      <path d="M8 13h5" />
      <path d="M15 15h2" />
    </ExecutionIconShell>
  );
}

function ExecutionBuildIcon() {
  return (
    <ExecutionIconShell>
      <path d="M8 7h8" />
      <path d="M7 12h10" />
      <path d="M9 17h6" />
      <path d="M5 9v6" />
      <path d="M19 9v6" />
    </ExecutionIconShell>
  );
}

function ExecutionAssigneeIcon() {
  return (
    <ExecutionIconShell>
      <path d="M4 20v-1.2A4.8 4.8 0 0 1 8.8 14h6.4a4.8 4.8 0 0 1 4.8 4.8V20" />
      <circle cx="12" cy="8.2" r="3.2" />
    </ExecutionIconShell>
  );
}

function ExecutionDeleteIcon() {
  return (
    <ExecutionIconShell>
      <path d="M4 7h16" />
      <path d="M9 7V5.8A1.8 1.8 0 0 1 10.8 4h2.4A1.8 1.8 0 0 1 15 5.8V7" />
      <path d="M7 7l.8 11.1A2 2 0 0 0 9.8 20h4.4a2 2 0 0 0 2-1.9L17 7" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </ExecutionIconShell>
  );
}

function ExecutionIconShell({ children }: { children: ReactNode }) {
  return <svg aria-hidden="true" fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="14">{children}</svg>;
}

function TestCaseBoardIcon() {
  return (
    <ExecutionIconShell>
      <rect height="14" rx="2" width="14" x="5" y="5" />
      <path d="M9 10h6" />
      <path d="M9 14h6" />
    </ExecutionIconShell>
  );
}

function ExecutionSuiteIcon() {
  return (
    <ExecutionIconShell>
      <path d="m12 4 8 4-8 4-8-4Z" />
      <path d="m4 12 8 4 8-4" />
      <path d="m4 16 8 4 8-4" />
    </ExecutionIconShell>
  );
}

function ExecutionScopeIcon() {
  return (
    <TestCaseBoardIcon />
  );
}

function ExecutionProgressFactsIcon() {
  return (
    <ExecutionIconShell>
      <path d="M4 16h16" />
      <path d="M7 13 10 10l3 2 4-5" />
    </ExecutionIconShell>
  );
}

function ExecutionRiskIcon() {
  return (
    <ExecutionIconShell>
      <path d="m12 4 8 14H4z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </ExecutionIconShell>
  );
}

function ExecutionRequirementImpactIcon() {
  return (
    <ExecutionIconShell>
      <path d="M5 5h14v14H5z" />
      <path d="M8 9h8" />
      <path d="M8 13h5" />
      <path d="m15 14 2 2 3-4" />
    </ExecutionIconShell>
  );
}

function ExecutionReferenceIcon() {
  return (
    <ExecutionIconShell>
      <path d="M10 13a4 4 0 0 0 5.7.1l2-2a4 4 0 0 0-5.6-5.6l-1.1 1.1" />
      <path d="M14 11a4 4 0 0 0-5.7-.1l-2 2a4 4 0 0 0 5.6 5.6l1.1-1.1" />
    </ExecutionIconShell>
  );
}

function ExecutionTimeIcon() {
  return (
    <ExecutionIconShell>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v5l3 2" />
    </ExecutionIconShell>
  );
}

function ExecutionPriorityIcon() {
  return (
    <ExecutionIconShell>
      <path d="M7 20V5" />
      <path d="M7 5h10l-2 4 2 4H7" />
    </ExecutionIconShell>
  );
}

function ExecutionStepsIcon() {
  return (
    <ExecutionIconShell>
      <path d="M8 7h10" />
      <path d="M8 12h10" />
      <path d="M8 17h10" />
      <circle cx="5" cy="7" r="1" fill="currentColor" stroke="none" />
      <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="5" cy="17" r="1" fill="currentColor" stroke="none" />
    </ExecutionIconShell>
  );
}

function StepKindIconBadge({
  label,
  tone
}: {
  label: string;
  tone: "default" | "shared" | "local";
}) {
  const className = tone === "shared" ? "step-kind-badge is-shared" : tone === "local" ? "step-kind-badge is-local" : "step-kind-badge is-standard";

  return (
    <span
      aria-label={label}
      className={className}
      title={label}
    >
      {tone === "shared" ? <SharedGroupLevelIcon kind="reusable" /> : tone === "local" ? <SharedGroupLevelIcon kind="local" /> : <StandardStepIcon />}
    </span>
  );
}

function ExecutionStepPassIcon() {
  return (
    <ExecutionIconShell>
      <path d="m7.5 12.5 3 3 6-7" />
    </ExecutionIconShell>
  );
}

function ExecutionStepFailIcon() {
  return (
    <ExecutionIconShell>
      <path d="m8 8 8 8" />
      <path d="m16 8-8 8" />
    </ExecutionIconShell>
  );
}

function ExecutionEvidenceImageIcon() {
  return (
    <ExecutionIconShell>
      <rect height="14" rx="2" width="16" x="4" y="5" />
      <circle cx="9" cy="10" r="1.4" fill="currentColor" stroke="none" />
      <path d="m7 17 3-3 2.5 2.5 2.5-3 2 3.5" />
    </ExecutionIconShell>
  );
}

function ExecutionEvidencePreviewIcon() {
  return (
    <ExecutionIconShell>
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.5" />
    </ExecutionIconShell>
  );
}

function ExecutionEvidenceDeleteIcon() {
  return (
    <ExecutionIconShell>
      <path d="M4 7h16" />
      <path d="M9 7V5.8A1.8 1.8 0 0 1 10.8 4h2.4A1.8 1.8 0 0 1 15 5.8V7" />
      <path d="M7 7l.8 11.1A2 2 0 0 0 9.8 20h4.4a2 2 0 0 0 2-1.9L17 7" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </ExecutionIconShell>
  );
}

function ExecutionOverviewOrb({
  passedCount,
  failedCount,
  blockedCount,
  totalCount,
  passPercent
}: {
  passedCount: number;
  failedCount: number;
  blockedCount: number;
  totalCount: number;
  passPercent: number;
}) {
  const safeTotal = Math.max(totalCount, 1);
  const pendingCount = Math.max(totalCount - passedCount - failedCount - blockedCount, 0);
  const passedStop = (passedCount / safeTotal) * 100;
  const failedStop = passedStop + (failedCount / safeTotal) * 100;
  const blockedStop = failedStop + (blockedCount / safeTotal) * 100;
  const orbBackground = `conic-gradient(
    #1aa96b 0% ${passedStop}%,
    #d04668 ${passedStop}% ${failedStop}%,
    #2d66e6 ${failedStop}% ${blockedStop}%,
    rgba(94, 116, 146, 0.16) ${blockedStop}% 100%
  )`;

  return (
    <div className="execution-overview-orb-shell">
      <div className="execution-overview-orb" style={{ background: orbBackground }}>
        <div className="execution-overview-orb-core">
          <strong>{passPercent}%</strong>
          <span>Pass rate</span>
        </div>
      </div>
      <div className="execution-overview-legend">
        <span className="execution-legend-item tone-total">{totalCount} total</span>
        <span className="execution-legend-item tone-passed">{passedCount} passed</span>
        <span className="execution-legend-item tone-failed">{failedCount} failed</span>
        <span className="execution-legend-item tone-blocked">{blockedCount} blocked</span>
        <span className="execution-legend-item tone-pending">{pendingCount} queued</span>
      </div>
    </div>
  );
}

function ExecutionSuiteCaseCard({
  testCase,
  suiteName,
  stepCount,
  durationLabel,
  caseStatus,
  assignedUser,
  isActive,
  isNext,
  onSelect
}: {
  testCase: ExecutionCaseView;
  suiteName: string;
  stepCount: number;
  durationLabel: string;
  caseStatus: ExecutionResult["status"] | "queued";
  assignedUser?: Execution["assigned_user"];
  isActive: boolean;
  isNext: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      aria-pressed={isActive}
      className={[
        "record-card tile-card test-case-card execution-case-card execution-board-case-card",
        isActive ? "is-active" : "",
        !isActive && isNext ? "is-next" : ""
      ].filter(Boolean).join(" ")}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) {
          return;
        }

        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <button
        aria-label={`View ${testCase.title}`}
        className="ghost-button test-case-card-eye-action execution-case-eye-action"
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
        title="View test case"
        type="button"
      >
        <EyeIcon size={16} />
      </button>
      <div className="tile-card-main">
        <div className="tile-card-header">
          <div
            aria-hidden="true"
            className={`record-card-icon execution-board-icon status-${caseStatus}`}
            title={boardStatusTooltip(caseStatus)}
          >
            <TestCaseBoardIcon />
          </div>
          <div className="tile-card-title-group">
            <strong>{testCase.title}</strong>
            <div className="execution-case-card-meta">
              <span className="tile-card-kicker">{isNext ? "Next recommended case" : suiteName || "Suite case"}</span>
              <ExecutionAssigneeChip className="execution-card-assignee--compact" user={assignedUser} />
            </div>
          </div>
          <ExecutionStatusIndicator status={caseStatus} />
        </div>
        <div className="execution-card-facts" aria-label={`${testCase.title} facts`}>
          <ExecutionCardFact
            ariaLabel={`Priority P${testCase.priority || 3}`}
            label={`P${testCase.priority || 3}`}
            title={`Priority P${testCase.priority || 3}`}
          >
            <ExecutionPriorityIcon />
          </ExecutionCardFact>
          <ExecutionCardFact
            ariaLabel={`${stepCount} steps`}
            label={String(stepCount)}
            title={`${stepCount} steps`}
          >
            <ExecutionStepsIcon />
          </ExecutionCardFact>
          <ExecutionCardFact
            ariaLabel={`Case duration ${durationLabel}`}
            label={durationLabel}
            title={`Case duration ${durationLabel}`}
            tone={caseStatus === "blocked" ? "warning" : "neutral"}
          >
            <ExecutionTimeIcon />
          </ExecutionCardFact>
        </div>
      </div>
    </div>
  );
}

function ExecutionStepGroupRow({
  name,
  kind,
  isExpanded,
  stepCount,
  onPreviewCode,
  onToggle
}: {
  name: string;
  kind: TestStep["group_kind"];
  isExpanded: boolean;
  stepCount: number;
  onPreviewCode: () => void;
  onToggle: () => void;
}) {
  const stepKind = getExecutionStepKindMeta(kind || "local");

  return (
    <div className={["execution-step-group-row", kind === "reusable" ? "is-shared-group" : "is-local-group"].join(" ")} role="row">
      <div className="execution-step-group-toggle-button">
        <button
          aria-expanded={isExpanded}
          className="execution-step-group-button-main"
          onClick={onToggle}
          type="button"
        >
          <span className="execution-step-group-label" role="cell">
            <span className="execution-step-group-label-main">
              <span className="execution-step-group-toggle">
                <span aria-hidden="true" className={isExpanded ? "execution-step-group-chevron is-expanded" : "execution-step-group-chevron"}>
                  <ExecutionAccordionChevronIcon />
                </span>
                <span aria-hidden="true" className={kind === "reusable" ? "step-group-icon is-shared" : "step-group-icon is-local"}>
                  <SharedGroupLevelIcon kind={kind} />
                </span>
                <strong>{name}</strong>
              </span>
            </span>
            <span>{stepKind.detail} · {isExpanded ? "Expanded" : "Collapsed"}</span>
          </span>
        </button>
        <span className="execution-step-group-meta" role="cell">
          <span className="execution-step-group-count">{stepCount} step{stepCount === 1 ? "" : "s"}</span>
          <button
            aria-label={`Preview automation for ${name}`}
            className="step-inline-tool is-active"
            onClick={onPreviewCode}
            title="Preview group automation"
            type="button"
          >
            <AutomationCodeIcon />
          </button>
        </span>
      </div>
    </div>
  );
}

function ExecutionStepCard({
  step,
  status,
  note,
  evidence,
  canCreateEvidence,
  canDeleteEvidence,
  canViewEvidence,
  apiDetail,
  webDetail,
  automationDetail,
  captures,
  canInspectApi,
  isRunningApi,
  parameterValues,
  isLocked,
  isSelected,
  isExpanded,
  isUploadingEvidence,
  isOpeningEvidence,
  onToggle,
  onToggleSelect,
  onPass,
  onFail,
  onDeleteEvidence,
  onInspectApi,
  onAttachNetworkAutomation,
  onRunStep,
  onNoteBlur,
  onUploadEvidence,
  onViewEvidence,
  onPreviewCode,
  availableBugs,
  defectIds,
  isLinkingDefects,
  onDefectsChange
}: {
  step: TestStep;
  status: ExecutionResult["status"] | "queued";
  note: string;
  evidence: ExecutionStepEvidence | null;
  canCreateEvidence: boolean;
  canDeleteEvidence: boolean;
  canViewEvidence: boolean;
  apiDetail: ExecutionStepApiDetail | null;
  webDetail: ExecutionStepWebDetail | null;
  automationDetail: ExecutionStepAutomationDetail | null;
  captures: Record<string, string>;
  canInspectApi: boolean;
  isRunningApi: boolean;
  parameterValues: Record<string, string>;
  isLocked: boolean;
  isSelected: boolean;
  isExpanded: boolean;
  isUploadingEvidence: boolean;
  isOpeningEvidence: boolean;
  onToggle: () => void;
  onToggleSelect: (checked: boolean) => void;
  onPass: () => void;
  onFail: () => void;
  onDeleteEvidence: () => void;
  onInspectApi: () => void;
  onAttachNetworkAutomation: (network: NonNullable<ExecutionStepWebDetail["network"]>) => void;
  onRunStep: () => void;
  onNoteBlur: (value: string) => void;
  onUploadEvidence: (file: File) => void;
  onViewEvidence: () => void;
  onPreviewCode: () => void;
  availableBugs: Issue[];
  defectIds: string[];
  isLinkingDefects: boolean;
  onDefectsChange: (defectIds: string[]) => void;
}) {
  const evidenceInputRef = useRef<HTMLInputElement | null>(null);
  const resolvedKind = step.group_name ? step.group_kind || "local" : step.group_kind;
  const stepKind = getExecutionStepKindMeta(resolvedKind);
  const resolvedAction = resolveStepParameterText(step.action, parameterValues) || step.action || "";
  const resolvedExpectedResult = resolveStepParameterText(step.expected_result, parameterValues) || step.expected_result || "";
  const trimmedNote = note.trim();
  const hasEvidence = hasExecutionEvidence(evidence);
  const captureEntries = useMemo(
    () => Object.entries(captures || {}).sort(([left], [right]) => left.localeCompare(right)),
    [captures]
  );
  const consoleCount = webDetail?.console?.length || 0;
  const networkCount = webDetail?.network?.length || 0;
  const linkedDefectIds = [...new Set(defectIds.map(String))];
  const linkedDefectIdSet = new Set(linkedDefectIds);
  const availableDefectOptions = availableBugs.filter((bug) => !linkedDefectIdSet.has(String(bug.id)));
  const stepTypeLabel = String(step.step_type || (canInspectApi ? "api" : "web")).toUpperCase();
  const toneClass = [
    "step-card execution-step-card",
    isExpanded ? "is-expanded" : "",
    status === "passed" ? "step-status-passed" : "",
    status === "failed" ? "step-status-failed" : "",
    status === "blocked" ? "step-status-blocked" : "",
    stepKind.tone === "shared" ? "is-shared-step" : "",
    stepKind.tone === "local" ? "is-local-step" : ""
  ].filter(Boolean).join(" ");

  return (
    <article className={toneClass}>
      <div className="step-card-top">
        <label className="checkbox-field step-card-select">
          <input
            aria-label={`Select step ${step.step_order}`}
            checked={isSelected}
            disabled={isLocked}
            onChange={(event) => onToggleSelect(event.target.checked)}
            type="checkbox"
          />
        </label>
        <button
          aria-label={isExpanded ? `Hide step ${step.step_order} details` : `Show step ${step.step_order} details`}
          className="step-card-toggle execution-step-card-toggle"
          onClick={onToggle}
          type="button"
        >
          <div className="step-card-summary execution-step-card-summary">
            <div className="execution-step-card-summary-head">
              <div className="step-card-summary-top">
                <span className="execution-step-type-chip" title={`Step type: ${stepTypeLabel}`}>
                  <StepTypeIcon size={14} type={step.step_type || (canInspectApi ? "api" : "web")} />
                </span>
                <strong>Step {step.step_order}</strong>
                {resolvedKind ? (
                  <span className={resolvedKind === "reusable" ? "execution-step-group-chip is-shared" : "execution-step-group-chip is-local"}>
                    {resolvedKind === "reusable" ? "Shared group" : "Local group"}
                  </span>
                ) : null}
                <StatusBadge value={status} />
              </div>
            </div>
            <p className="execution-step-card-primary" title={resolvedAction || step.action || ""}>
              {resolvedAction || "No action recorded yet"}
            </p>
            <div className="execution-step-card-summary-meta">
              <span title={resolvedExpectedResult || step.expected_result || ""}>
                {resolvedExpectedResult ? `Expected: ${resolvedExpectedResult}` : "No expected result recorded yet"}
              </span>
              <span>
                {trimmedNote ? "Note captured" : "No note yet"} · {hasEvidence ? evidence?.fileName || "Evidence attached" : "No evidence attached"}
                {webDetail ? ` · ${consoleCount} console · ${networkCount} network` : ""}
              </span>
            </div>
          </div>
        </button>
        <div className="execution-step-card-summary-tools">
          <button
            aria-label={`Mark step ${step.step_order} passed`}
            className={status === "passed" ? "execution-step-mark-button is-pass is-active" : "execution-step-mark-button is-pass"}
            disabled={isLocked}
            onClick={onPass}
            title="Mark step passed"
            type="button"
          >
            <span aria-hidden="true">✅</span>
          </button>
          <button
            aria-label={`Mark step ${step.step_order} failed`}
            className={status === "failed" ? "execution-step-mark-button is-fail is-active" : "execution-step-mark-button is-fail"}
            disabled={isLocked}
            onClick={onFail}
            title="Mark step failed"
            type="button"
          >
            <span aria-hidden="true">X</span>
          </button>
          {canInspectApi ? (
            <button
              aria-label={`Inspect API details for step ${step.step_order}`}
              className="execution-step-type-chip execution-step-type-chip--button"
              onClick={onInspectApi}
              title="Inspect API request, response, and assertions"
              type="button"
            >
              <StepTypeIcon size={14} type={step.step_type || "api"} />
            </button>
          ) : null}
          <InlineStepToolButton
            ariaLabel={`Preview automation for step ${step.step_order}`}
            className="is-active"
            onClick={onPreviewCode}
            title="Preview step automation"
          >
            <AutomationCodeIcon />
          </InlineStepToolButton>
        </div>
      </div>

      {isExpanded ? (
        <div className="step-card-body execution-step-card-body">
          <div className="execution-step-card-grid">
            <div className="execution-step-card-block">
              <span className="execution-step-card-label">Action</span>
              <p className="execution-step-card-copy">{resolvedAction || "No action recorded yet"}</p>
            </div>
            <div className="execution-step-card-block">
              <span className="execution-step-card-label">Expected result</span>
              <p className="execution-step-card-copy">{resolvedExpectedResult || "No expected result recorded yet"}</p>
            </div>
          </div>

          {captureEntries.length ? (
            <div className="execution-step-card-block">
              <div className="execution-step-card-block-head">
                <span>Output params</span>
                <span>{captureEntries.length} captured in this step</span>
              </div>
              <div className="execution-step-param-chip-list">
                {captureEntries.map(([key, value]) => (
                  <span className="execution-step-param-chip" key={key}>
                    <strong>{formatExecutionParameterToken(key)}</strong>
                    <span>{value || "—"}</span>
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {webDetail ? (
            <div className="execution-step-card-block">
              <div className="execution-step-card-block-head">
                <span>Runtime trace</span>
                <span>{webDetail.provider || "web"} · {consoleCount} console · {networkCount} network</span>
              </div>
              <div className="execution-step-param-chip-list">
                {webDetail.url ? (
                  <span className="execution-step-param-chip">
                    <strong>URL</strong>
                    <span>{webDetail.url}</span>
                  </span>
                ) : null}
                {typeof webDetail.duration_ms === "number" ? (
                  <span className="execution-step-param-chip">
                    <strong>Duration</strong>
                    <span>{formatDuration(webDetail.duration_ms, DEFAULT_DURATION_LABEL)}</span>
                  </span>
                ) : null}
                {consoleCount ? (
                  <span className="execution-step-param-chip">
                    <strong>Console</strong>
                    <span>{webDetail.console?.slice(-1)[0]?.text || `${consoleCount} entries`}</span>
                  </span>
                ) : null}
                {networkCount ? (
                  <span className="execution-step-param-chip">
                    <strong>Network</strong>
                    <span>{webDetail.network?.slice(-1)[0]?.url || `${networkCount} entries`}</span>
                  </span>
                ) : null}
              </div>
              {networkCount ? (
                <div className="execution-network-call-list">
                  {(webDetail.network || []).slice(-6).map((entry, index) => (
                    <div className="execution-network-call-row" key={`${entry.method || "GET"}:${entry.url || index}:${entry.timestamp || index}`}>
                      <strong>{entry.method || "GET"} {entry.status || "pending"}</strong>
                      <span>{entry.url || "Unknown URL"}</span>
                    </div>
                  ))}
                  <button className="ghost-button compact" onClick={() => onAttachNetworkAutomation(webDetail.network || [])} type="button">
                    <StepTypeIcon size={14} type="api" />
                    <span>Add API steps to this case</span>
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {automationDetail?.code ? (
            <div className="execution-step-card-block">
              <div className="execution-step-card-block-head">
                <span>Automation code</span>
                <span>
                  {automationDetail.engine || step.step_type || "step"} · {automationDetail.status || status}
                  {automationDetail.error_line ? ` · line ${automationDetail.error_line}` : automationDetail.active_line ? ` · line ${automationDetail.active_line}` : ""}
                </span>
              </div>
              <pre className="execution-automation-code-block">
                {automationDetail.code.split(/\r?\n/).map((line, index) => {
                  const lineNumber = index + 1;
                  const isHotLine = lineNumber === automationDetail.error_line || lineNumber === automationDetail.active_line;
                  return (
                    <span className={isHotLine ? "is-hot-line" : ""} key={`${lineNumber}:${line}`}>
                      <strong>{lineNumber}</strong>
                      <code>{line || " "}</code>
                    </span>
                  );
                })}
              </pre>
              {automationDetail.error_message ? (
                <div className="inline-message error-message">
                  <span>{automationDetail.error_message}</span>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="execution-step-card-block execution-step-card-block--notes">
            <div className="execution-step-card-block-head">
              <span className="execution-step-card-label">Evidence log</span>
              <span>{trimmedNote ? "Saved on blur" : "Write observations, bug IDs, or runtime notes"}</span>
            </div>
            <textarea
              className="execution-step-note-input"
              defaultValue={note}
              disabled={isLocked}
              key={`${step.id}:${note}`}
              onBlur={(event) => {
                const raw = event.target.value;
                if (raw.trim() !== (note || "").trim()) {
                  onNoteBlur(raw);
                }
              }}
              placeholder="Evidence, bug ID, observations…"
              rows={4}
            />
          </div>

          <div className="execution-step-defect-links">
            <div className="execution-step-card-block-head">
              <span className="execution-step-card-label">Linked bugs</span>
              <span>{isLinkingDefects ? "Saving links…" : `${linkedDefectIds.length} linked to this step, case, and run`}</span>
            </div>
            <select
              aria-label={`Link a bug to step ${step.step_order}`}
              disabled={isLocked || isLinkingDefects || !availableDefectOptions.length}
              onChange={(event) => {
                if (event.target.value) {
                  onDefectsChange([...linkedDefectIds, event.target.value]);
                  event.currentTarget.value = "";
                }
              }}
              value=""
            >
              <option value="">{availableDefectOptions.length ? "Link an existing bug…" : "No more project bugs to link"}</option>
              {availableDefectOptions.map((bug) => (
                <option key={bug.id} value={bug.id}>
                  {[bug.jira_bug_key || bug.id, bug.title].filter(Boolean).join(" · ")}
                </option>
              ))}
            </select>
            {linkedDefectIds.length ? (
              <div className="execution-step-defect-chip-list">
                {linkedDefectIds.map((defectId) => {
                  const bug = availableBugs.find((candidate) => String(candidate.id) === defectId);
                  return (
                    <span className="execution-step-defect-chip" key={defectId}>
                      <span title={bug?.title || defectId}>{bug?.jira_bug_key || bug?.title || defectId}</span>
                      <button
                        aria-label={`Unlink ${bug?.jira_bug_key || bug?.title || defectId} from step ${step.step_order}`}
                        disabled={isLocked || isLinkingDefects}
                        onClick={() => onDefectsChange(linkedDefectIds.filter((id) => id !== defectId))}
                        type="button"
                      >
                        ×
                      </button>
                    </span>
                  );
                })}
              </div>
            ) : (
              <span className="execution-step-evidence-empty">No bugs linked to this step</span>
            )}
          </div>

          <div className="execution-step-evidence-cell">
            <input
              accept="image/*,video/*,application/pdf,text/plain,text/csv,application/json,application/xml,text/xml,application/zip"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.currentTarget.value = "";

                if (file) {
                  onUploadEvidence(file);
                }
              }}
              ref={evidenceInputRef}
              disabled={!canCreateEvidence || (hasEvidence && !canDeleteEvidence)}
              type="file"
            />
            <div className="execution-step-evidence-actions">
              <button
                className="execution-step-evidence-button"
                disabled={isLocked || isUploadingEvidence || !canCreateEvidence || (hasEvidence && !canDeleteEvidence)}
                onClick={() => evidenceInputRef.current?.click()}
                title={!canCreateEvidence
                  ? "Permission required: result.manage and attachment.create"
                  : hasEvidence && !canDeleteEvidence
                    ? "Replacing evidence also requires attachment.delete"
                    : evidence ? "Replace evidence" : "Attach evidence"}
                type="button"
              >
                <ExecutionEvidenceImageIcon />
                <span>{isUploadingEvidence ? "Uploading…" : evidence ? "Replace file" : "Attach file"}</span>
              </button>
              {evidence ? (
                <>
                  <button
                    className="execution-step-evidence-link"
                    disabled={isUploadingEvidence || isOpeningEvidence || !canViewEvidence}
                    onClick={onViewEvidence}
                    title={canViewEvidence ? evidence.fileName || "View saved evidence" : "Permission required: result.view and attachment.view"}
                    type="button"
                  >
                    <ExecutionEvidencePreviewIcon />
                    <span>{isOpeningEvidence ? "Loading evidence…" : evidence.fileName || "View file"}</span>
                  </button>
                  <button
                    className="execution-step-evidence-delete"
                    disabled={isLocked || isUploadingEvidence || !canDeleteEvidence}
                    onClick={onDeleteEvidence}
                    title={canDeleteEvidence ? "Delete saved evidence" : "Permission required: result.manage and attachment.delete"}
                    type="button"
                  >
                    <ExecutionEvidenceDeleteIcon />
                    <span>Delete file</span>
                  </button>
                </>
              ) : (
                <span className="execution-step-evidence-empty">No evidence attached</span>
              )}
            </div>
          </div>

          <div className="execution-step-card-footer">
            {canInspectApi ? (
              <button className="ghost-button" onClick={onInspectApi} type="button">
                <StepTypeIcon size={14} type={step.step_type || "api"} />
                <span>{apiDetail ? "Inspect API detail" : "Open API panel"}</span>
              </button>
            ) : (
              <span className="execution-step-card-footer-note">{stepKind.detail}</span>
            )}
            {isRunningApi ? <span className="execution-step-card-footer-note">Step execution in progress…</span> : null}
          </div>
        </div>
      ) : null}
    </article>
  );
}

function ExecutionAutomationStepCard({
  step,
  status,
  code,
  automationDetail,
  webDetail,
  apiDetail,
  note
}: {
  step: TestStep;
  status: ExecutionStepAutomationDetail["status"] | ExecutionStepStatus | "queued";
  code: string;
  automationDetail: ExecutionStepAutomationDetail | null;
  webDetail: ExecutionStepWebDetail | null;
  apiDetail: ExecutionStepApiDetail | null;
  note: string;
}) {
  const consoleCount = webDetail?.console?.length || 0;
  const networkCount = webDetail?.network?.length || 0;
  const captureCount = Object.keys(webDetail?.captures || apiDetail?.captures || {}).length;
  const activeLine = automationDetail?.error_line || automationDetail?.active_line || null;
  const latestConsole = webDetail?.console?.slice(-1)[0]?.text || "";
  const latestNetwork = webDetail?.network?.slice(-1)[0];
  const httpStatus = apiDetail?.response?.status;

  return (
    <article className="execution-console-code-item execution-console-code-card" role="listitem">
      <div className="execution-console-code-item-head">
        <div className="execution-console-code-title">
          <strong>Step {step.step_order}</strong>
          <span>{step.action || "No action captured"}</span>
        </div>
        <StatusBadge value={status || "queued"} />
      </div>

      <div className="execution-console-code-runtime" aria-label={`Runtime details for step ${step.step_order}`}>
        <span>
          <strong>Engine</strong>
          <span>{automationDetail?.engine || webDetail?.provider || step.step_type || "step"}</span>
        </span>
        {webDetail?.duration_ms !== undefined ? (
          <span>
            <strong>Duration</strong>
            <span>{formatDuration(webDetail.duration_ms, DEFAULT_DURATION_LABEL)}</span>
          </span>
        ) : null}
        {httpStatus ? (
          <span>
            <strong>HTTP</strong>
            <span>{httpStatus}</span>
          </span>
        ) : null}
        {consoleCount ? (
          <span>
            <strong>Console</strong>
            <span>{consoleCount}</span>
          </span>
        ) : null}
        {networkCount ? (
          <span>
            <strong>Network</strong>
            <span>{networkCount}</span>
          </span>
        ) : null}
        {captureCount ? (
          <span>
            <strong>Captures</strong>
            <span>{captureCount}</span>
          </span>
        ) : null}
      </div>

      <pre className="execution-automation-code-block">
        {code.split(/\r?\n/).map((line, index) => {
          const lineNumber = index + 1;
          const isHotLine = lineNumber === activeLine;
          return (
            <span className={isHotLine ? "is-hot-line" : ""} key={`${step.id}:${lineNumber}`}>
              <strong>{lineNumber}</strong>
              <code>{line || " "}</code>
            </span>
          );
        })}
      </pre>

      {automationDetail?.error_message ? (
        <div className="inline-message error-message">
          <span>{automationDetail.error_message}</span>
        </div>
      ) : null}

      {latestConsole || latestNetwork || webDetail?.url || note ? (
        <div className="execution-console-code-trace">
          {webDetail?.url ? <span><strong>URL</strong>{webDetail.url}</span> : null}
          {latestConsole ? <span><strong>Console</strong>{latestConsole}</span> : null}
          {latestNetwork ? <span><strong>Network</strong>{latestNetwork.method || "GET"} {latestNetwork.status || "pending"} · {latestNetwork.url}</span> : null}
          {note ? <span><strong>Manual note</strong>{note}</span> : null}
        </div>
      ) : null}
    </article>
  );
}

function ExecutionParameterPanel({
  title,
  description,
  entries,
  emptyMessage,
  isExpanded,
  onToggle
}: {
  title: string;
  description: string;
  entries: ExecutionParameterDisplayEntry[];
  emptyMessage: string;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="resource-table-shell execution-context-table-shell">
      <button
        aria-expanded={isExpanded}
        className="execution-saved-data-toggle"
        onClick={onToggle}
        type="button"
      >
        <div className="execution-saved-data-toggle-copy">
          <strong>{title}</strong>
          <span>{description}</span>
        </div>
        <div className="execution-saved-data-toggle-meta">
          <span className="count-pill">
            {entries.length} item{entries.length === 1 ? "" : "s"}
          </span>
          <span
            aria-hidden="true"
            className={isExpanded ? "execution-saved-data-toggle-arrow is-expanded" : "execution-saved-data-toggle-arrow"}
          >
            <ExecutionAccordionChevronIcon />
          </span>
        </div>
      </button>
      {isExpanded ? (
        !entries.length ? (
          <div className="empty-state compact resource-table-empty">{emptyMessage}</div>
        ) : (
          <div className="execution-saved-data-scroll" role="list" aria-label={`${title} values`}>
            <div className="execution-saved-data-grid">
              {entries.map((entry) => (
                <article className="execution-saved-data-card execution-parameter-card" key={`${title}-${entry.key}`} role="listitem">
                  <span>{entry.flowLabel}</span>
                  <code className="execution-saved-data-token">{entry.token}</code>
                  <strong title={entry.value || "—"}>{entry.value || "—"}</strong>
                  {entry.sourceLabel ? <small className="execution-saved-data-source">{entry.sourceLabel}</small> : null}
                </article>
              ))}
            </div>
          </div>
        )
      ) : null}
    </div>
  );
}

function ExecutionAiAnalysisPanel({
  analysis,
  canRun,
  canPreviewClusters,
  isRunning,
  isPreviewingClusters,
  onRun,
  onPreviewClusters
}: {
  analysis: ExecutionAiAnalysis | null;
  canRun: boolean;
  canPreviewClusters: boolean;
  isRunning: boolean;
  isPreviewingClusters: boolean;
  onRun: () => void;
  onPreviewClusters: () => void;
}) {
  return (
    <div className="execution-ai-analysis-panel">
      <div className="execution-ai-analysis-actions">
        <button className="ghost-button" disabled={isRunning || !canRun} onClick={onRun} type="button">
          <SparkIcon />
          <span>{isRunning ? "Analyzing…" : analysis ? "Refresh analysis" : "Run evidence analysis"}</span>
        </button>
        <button className="ghost-button" disabled={isPreviewingClusters || !canPreviewClusters} onClick={onPreviewClusters} type="button">
          <SparkIcon />
          <span>{isPreviewingClusters ? "Clustering…" : "Preview failure clusters"}</span>
        </button>
        {analysis?.integration?.name ? (
          <span className="count-pill">
            {analysis.integration.model ? `${analysis.integration.name} · ${analysis.integration.model}` : analysis.integration.name}
          </span>
        ) : null}
      </div>

      {analysis ? (
        <div className="execution-ai-analysis-response">
          <div className="execution-ai-analysis-meta">
            <SparkIcon />
            <span>{formatExecutionTimestamp(analysis.generatedAt, "Timestamp unavailable")}</span>
          </div>
          <pre>{analysis.response}</pre>
        </div>
      ) : (
        <div className="empty-state compact">No evidence analysis has been recorded yet. Complete the run, then analyze the stored results and trace links.</div>
      )}
    </div>
  );
}

function ExecutionStructuredLogView({
  logsJson,
  steps,
  onOpenEvidence
}: {
  logsJson: string | null;
  steps: TestStep[];
  onOpenEvidence?: (step: TestStep, evidence: ExecutionStepEvidence) => void;
}) {
  const parsed = parseExecutionLogs(logsJson);
  const stepCaptures = mergeExecutionStepCaptures(parsed.stepCaptures || {}, parsed.stepApiDetails || {});
  const apiDetails = Object.values(parsed.stepApiDetails || {});
  const webDetails = Object.values(parsed.stepWebDetails || {});
  const automationDetails = Object.values(parsed.stepAutomationDetails || {});
  const noteCount = parsed.stepNotes ? Object.values(parsed.stepNotes).filter((value) => String(value || "").trim()).length : 0;
  const statusCount = parsed.stepStatuses ? Object.keys(parsed.stepStatuses).length : 0;
  const failedStepCount = parsed.stepStatuses ? Object.values(parsed.stepStatuses).filter((status) => status === "failed").length : 0;
  const blockedStepCount = parsed.stepStatuses ? Object.values(parsed.stepStatuses).filter((status) => status === "blocked").length : 0;
  const evidenceEntries = Object.values(parsed.stepEvidence || {});
  const imageEvidenceCount = evidenceEntries.filter((evidence) => evidenceMimeType(evidence).startsWith("image/")).length;
  const videoEvidenceCount = evidenceEntries.filter((evidence) => evidenceMimeType(evidence).startsWith("video/")).length;
  const captureCount = Object.values(stepCaptures).reduce((count, captures) => count + Object.keys(captures || {}).length, 0);
  const apiStepCount = apiDetails.length;
  const apiAssertionCount = apiDetails.reduce((count, detail) => count + (detail?.assertions?.length || 0), 0);
  const failedApiAssertionCount = apiDetails.reduce((count, detail) => count + (detail?.assertions || []).filter((assertion) => assertion && !assertion.passed).length, 0);
  const consoleCount = webDetails.reduce((count, detail) => count + (detail?.console?.length || 0), 0);
  const networkCount = webDetails.reduce((count, detail) => count + (detail?.network?.length || 0), 0);
  const networkIssueCount = webDetails.reduce(
    (count, detail) => count + (detail?.network || []).filter((entry) => entry?.error || Number(entry?.status || 0) >= 400).length,
    0
  );
  const automationStepCount = automationDetails.length;
  const hasNotes = parsed.stepNotes && Object.keys(parsed.stepNotes).length > 0;
  const hasStatuses = parsed.stepStatuses && Object.keys(parsed.stepStatuses).length > 0;
  const hasEvidence = parsed.stepEvidence && Object.keys(parsed.stepEvidence).length > 0;
  const hasCaptures = Object.keys(stepCaptures).length > 0;
  const hasWebDetails = parsed.stepWebDetails && Object.keys(parsed.stepWebDetails).length > 0;
  const hasApiDetails = parsed.stepApiDetails && Object.keys(parsed.stepApiDetails).length > 0;
  const hasAutomationDetails = parsed.stepAutomationDetails && Object.keys(parsed.stepAutomationDetails).length > 0;
  const hasAiAnalysis = Boolean(parsed.aiAnalysis?.response);
  const formatTraceJson = (value: unknown) => JSON.stringify(value, null, 2);

  if (!hasNotes && !hasStatuses && !hasEvidence && !hasCaptures && !hasWebDetails && !hasApiDetails && !hasAutomationDetails && !hasAiAnalysis && !logsJson?.trim()) {
    return <span className="execution-log-empty">No structured step data recorded yet.</span>;
  }

  const rows = steps
    .map((step, index) => {
      const st = parsed.stepStatuses?.[step.id];
      const nt = parsed.stepNotes?.[step.id];
      const evidence = parsed.stepEvidence?.[step.id];
      const apiDetail = parsed.stepApiDetails?.[step.id];
      const webDetail = parsed.stepWebDetails?.[step.id];
      const automationDetail = parsed.stepAutomationDetails?.[step.id];
      const captures = Object.entries(stepCaptures[step.id] || {}).sort(([left], [right]) => left.localeCompare(right));
      const apiStatus = apiDetail?.response?.status;
      const apiAssertions = apiDetail?.assertions || [];
      const apiFailedAssertions = apiAssertions.filter((assertion) => assertion && !assertion.passed).length;

      if (!st && !nt && !evidence && !captures.length && !apiDetail && !webDetail && !automationDetail) {
        if (!isStepGroupStart(steps, index)) {
          return null;
        }
      }
      return (
        <Fragment key={step.id}>
          {isStepGroupStart(steps, index) ? (
            <div className="execution-structured-log-row execution-structured-log-row--group">
              <strong>{step.group_name || "Step group"}</strong>
              <span aria-hidden="true" className={step.group_kind === "reusable" ? "step-group-icon is-shared" : "step-group-icon is-local"}>
                <SharedGroupLevelIcon kind={step.group_kind} />
              </span>
              <span className="execution-structured-note">
                {step.group_kind === "reusable" ? "Shared group snapshot" : "Local group snapshot"}
              </span>
            </div>
          ) : null}
          {st || nt || evidence || captures.length || apiDetail || webDetail || automationDetail ? (
            <article className="execution-structured-log-row execution-structured-log-row--verbose">
              <div className="execution-verbose-log-head">
                <div>
                  <strong>Step {step.step_order}</strong>
                  <span>{step.action || "No step action snapshot"}</span>
                </div>
                {st ? <StatusBadge value={st} /> : null}
              </div>
              {step.expected_result ? (
                <div className="execution-verbose-log-block">
                  <small>Expected result</small>
                  <span>{step.expected_result}</span>
                </div>
              ) : null}
              {nt ? (
                <div className="execution-verbose-log-block">
                  <small>Runtime note</small>
                  <span>{nt}</span>
                </div>
              ) : null}
              {captures.length ? (
                <div className="execution-verbose-log-block">
                  <small>Captured output params</small>
                  <div className="execution-structured-capture-list">
                    {captures.map(([key, value]) => (
                      <span className="execution-structured-capture-chip" key={key}>
                        <strong>{formatExecutionParameterToken(key)}</strong>
                        <span>{value || "—"}</span>
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              {apiDetail ? (
                <details className="execution-verbose-log-details" open={apiFailedAssertions > 0 || Number(apiStatus || 0) >= 400}>
                  <summary>
                    <span>API trace</span>
                    <small>
                      {[
                        apiDetail.request?.method || "API",
                        apiDetail.request?.url || null,
                        apiStatus ? `HTTP ${apiStatus}` : "no response",
                        apiAssertions.length ? `${apiAssertions.length} assertion${apiAssertions.length === 1 ? "" : "s"}` : null,
                        apiFailedAssertions ? `${apiFailedAssertions} failed` : null
                      ].filter(Boolean).join(" · ")}
                    </small>
                  </summary>
                  <pre>{formatTraceJson(apiDetail)}</pre>
                </details>
              ) : null}
              {webDetail ? (
                <details className="execution-verbose-log-details" open={networkIssueCount > 0}>
                  <summary>
                    <span>Browser trace</span>
                    <small>
                      {[
                        webDetail.provider || "web",
                        webDetail.url || null,
                        `${webDetail.console?.length || 0} console`,
                        `${webDetail.network?.length || 0} network`
                      ].filter(Boolean).join(" · ")}
                    </small>
                  </summary>
                  <pre>{formatTraceJson(webDetail)}</pre>
                </details>
              ) : null}
              {automationDetail ? (
                <details className="execution-verbose-log-details" open={Boolean(automationDetail.error_message)}>
                  <summary>
                    <span>Automation trace</span>
                    <small>
                      {[
                        automationDetail.engine || automationDetail.provider || "automation",
                        automationDetail.status || null,
                        typeof automationDetail.active_line === "number" ? `line ${automationDetail.active_line}` : null,
                        automationDetail.error_message || null
                      ].filter(Boolean).join(" · ")}
                    </small>
                  </summary>
                  <pre>{formatTraceJson(automationDetail)}</pre>
                </details>
              ) : null}
              {evidence ? (
                <button
                  className="execution-structured-evidence-button"
                  onClick={() => evidence && onOpenEvidence?.(step, evidence)}
                  type="button"
                >
                  <ExecutionEvidencePreviewIcon />
                  <span>{evidence.fileName || "View image evidence"}</span>
                </button>
              ) : null}
            </article>
          ) : null}
        </Fragment>
      );
    })
    .filter(Boolean);

  return (
    <div className="execution-structured-log">
      <div className="execution-log-evidence-grid" aria-label="Execution evidence summary">
        <span>
          <strong>{statusCount}/{steps.length}</strong>
          <small>{failedStepCount || blockedStepCount ? `${failedStepCount} failed · ${blockedStepCount} blocked` : "step outcomes"}</small>
        </span>
        <span>
          <strong>{noteCount + imageEvidenceCount + videoEvidenceCount}</strong>
          <small>{noteCount} notes · {imageEvidenceCount} images · {videoEvidenceCount} videos</small>
        </span>
        <span>
          <strong>{apiStepCount}</strong>
          <small>{apiAssertionCount} API assertions · {failedApiAssertionCount} failed</small>
        </span>
        <span>
          <strong>{webDetails.length}</strong>
          <small>{consoleCount} console · {networkCount} network · {networkIssueCount} issues</small>
        </span>
        <span>
          <strong>{captureCount}</strong>
          <small>captured runtime values</small>
        </span>
        <span>
          <strong>{automationStepCount}</strong>
          <small>automation code traces</small>
        </span>
      </div>
      {parsed.aiAnalysis ? (
        <div className="execution-structured-log-row execution-structured-log-row--ai">
          <strong>Evidence analysis</strong>
          <span className="execution-structured-note">
            {formatExecutionTimestamp(parsed.aiAnalysis.generatedAt, "Timestamp unavailable")}
          </span>
          <span className="execution-structured-note">{parsed.aiAnalysis.response}</span>
        </div>
      ) : null}
      {rows.length ? rows : null}
      {!rows.length && !parsed.aiAnalysis && logsJson?.trim() ? <pre className="execution-log-raw">{logsJson}</pre> : null}
    </div>
  );
}

function ExecutionStructuredLogSummary({ logsJson }: { logsJson: string | null }) {
  const parsed = parseExecutionLogs(logsJson);
  const stepCaptures = mergeExecutionStepCaptures(parsed.stepCaptures || {}, parsed.stepApiDetails || {});
  const noteCount = parsed.stepNotes ? Object.values(parsed.stepNotes).filter(Boolean).length : 0;
  const statusCount = parsed.stepStatuses ? Object.keys(parsed.stepStatuses).length : 0;
  const evidenceCount = parsed.stepEvidence ? Object.keys(parsed.stepEvidence).length : 0;
  const apiTraceCount = parsed.stepApiDetails ? Object.keys(parsed.stepApiDetails).length : 0;
  const webTraceCount = parsed.stepWebDetails ? Object.keys(parsed.stepWebDetails).length : 0;
  const automationTraceCount = parsed.stepAutomationDetails ? Object.keys(parsed.stepAutomationDetails).length : 0;
  const aiAnalysisCount = parsed.aiAnalysis ? 1 : 0;
  const captureCount = Object.values(stepCaptures).reduce((count, captures) => count + Object.keys(captures || {}).length, 0);
  if (!noteCount && !statusCount && !evidenceCount && !captureCount && !apiTraceCount && !webTraceCount && !automationTraceCount && !aiAnalysisCount) {
    return <span className="execution-log-summary-muted">No step details</span>;
  }
  const parts = [
    statusCount ? `${statusCount} step result${statusCount === 1 ? "" : "s"}` : null,
    noteCount ? `${noteCount} note${noteCount === 1 ? "" : "s"}` : null,
    evidenceCount ? `${evidenceCount} media item${evidenceCount === 1 ? "" : "s"}` : null,
    captureCount ? `${captureCount} captured value${captureCount === 1 ? "" : "s"}` : null,
    apiTraceCount ? `${apiTraceCount} API trace${apiTraceCount === 1 ? "" : "s"}` : null,
    webTraceCount ? `${webTraceCount} web trace${webTraceCount === 1 ? "" : "s"}` : null,
    automationTraceCount ? `${automationTraceCount} automation trace${automationTraceCount === 1 ? "" : "s"}` : null,
    aiAnalysisCount ? "Evidence analysis" : null
  ].filter(Boolean);

  return (
    <span className="execution-log-summary">
      {parts.join(" · ")}
    </span>
  );
}

function ExecutionMinimizedRail({
  label,
  count,
  onExpand
}: {
  label: string;
  count?: number;
  onExpand: () => void;
}) {
  return (
    <button aria-label={`Expand ${label}`} className="execution-panel-rail" onClick={onExpand} type="button">
      <span className="execution-panel-rail-label">{label}</span>
      <span className="execution-panel-rail-meta">{typeof count === "number" ? count : "Show"}</span>
    </button>
  );
}

function ExecutionCreateModal({
  projects,
  projectId,
  onProjectChange,
  appTypes,
  appTypeId,
  onAppTypeChange,
  executionCreateMode,
  onExecutionCreateModeChange,
  executionStartMode,
  onExecutionStartModeChange,
  executionParallelEnabled,
  executionParallelCount,
  onExecutionParallelEnabledChange,
  onExecutionParallelCountChange,
  selectedProject,
  selectedAppType,
  scopeSuites,
  selectedSuiteIds,
  executionName,
  selectedEnvironmentId,
  selectedConfigurationId,
  selectedDataSetId,
  selectedExecutionAssigneeIds,
  executionRelease,
  executionSprint,
  executionBuild,
  assigneeOptions,
  integrations,
  executionHookDraft,
  libraryCases,
  smartExecutionIntegrationId,
  smartExecutionReleaseScope,
  smartExecutionAdditionalContext,
  smartExecutionRequirementOptions,
  smartExecutionRequirementSearch,
  smartExecutionPreview,
  selectedSmartRequirementIds,
  selectedSmartExecutionCaseIds,
  smartExecutionPreviewMessage,
  smartExecutionPreviewTone,
  onExecutionNameChange,
  onExecutionReleaseChange,
  onExecutionSprintChange,
  onExecutionBuildChange,
  onExecutionHookDraftChange,
  onEnvironmentChange,
  onConfigurationChange,
  onDataSetChange,
  onAssigneeChange,
  onSuiteSelectionChange,
  onPreviewSmartExecution,
  onSmartExecutionIntegrationChange,
  onSmartExecutionReleaseScopeChange,
  onSmartExecutionAdditionalContextChange,
  onSmartExecutionRequirementSearchChange,
  onToggleSmartExecutionRequirement,
  onToggleSmartExecutionCase,
  onSelectAllSmartExecutionRequirements,
  onClearSmartExecutionRequirements,
  onSelectAllSmartExecutionCases,
  onClearSmartExecutionCases,
  canCreateExecution,
  isPreviewingSmartExecution,
  isSubmitting,
  onClose,
  onSubmit
}: {
  projects: Project[];
  projectId: string;
  onProjectChange: (value: string) => void;
  appTypes: AppType[];
  appTypeId: string;
  onAppTypeChange: (value: string) => void;
  executionCreateMode: ExecutionCreateMode;
  onExecutionCreateModeChange: (value: ExecutionCreateMode) => void;
  executionStartMode: ExecutionStartMode;
  onExecutionStartModeChange: (value: ExecutionStartMode) => void;
  executionParallelEnabled: boolean;
  executionParallelCount: number;
  onExecutionParallelEnabledChange: (value: boolean) => void;
  onExecutionParallelCountChange: (value: number) => void;
  selectedProject: string;
  selectedAppType: string;
  scopeSuites: TestSuite[];
  selectedSuiteIds: string[];
  executionName: string;
  selectedEnvironmentId: string;
  selectedConfigurationId: string;
  selectedDataSetId: string;
  selectedExecutionAssigneeIds: string[];
  executionRelease: string;
  executionSprint: string;
  executionBuild: string;
  assigneeOptions: ExecutionAssigneeOption[];
  integrations: Integration[];
  executionHookDraft: ExecutionHookDraft;
  libraryCases: TestCase[];
  smartExecutionIntegrationId: string;
  smartExecutionReleaseScope: string;
  smartExecutionAdditionalContext: string;
  smartExecutionRequirementOptions: SmartExecutionRequirementOption[];
  smartExecutionRequirementSearch: string;
  smartExecutionPreview: SmartExecutionPreviewResponse | null;
  selectedSmartRequirementIds: string[];
  selectedSmartExecutionCaseIds: string[];
  smartExecutionPreviewMessage: string;
  smartExecutionPreviewTone: "success" | "error";
  onExecutionNameChange: (value: string) => void;
  onExecutionReleaseChange: (value: string) => void;
  onExecutionSprintChange: (value: string) => void;
  onExecutionBuildChange: (value: string) => void;
  onExecutionHookDraftChange: (value: ExecutionHookDraft) => void;
  onEnvironmentChange: (value: string) => void;
  onConfigurationChange: (value: string) => void;
  onDataSetChange: (value: string) => void;
  onAssigneeChange: (value: string[]) => void;
  onSuiteSelectionChange: (nextIds: string[]) => void;
  onPreviewSmartExecution: () => void;
  onSmartExecutionIntegrationChange: (value: string) => void;
  onSmartExecutionReleaseScopeChange: (value: string) => void;
  onSmartExecutionAdditionalContextChange: (value: string) => void;
  onSmartExecutionRequirementSearchChange: (value: string) => void;
  onToggleSmartExecutionRequirement: (requirementId: string) => void;
  onToggleSmartExecutionCase: (testCaseId: string) => void;
  onSelectAllSmartExecutionRequirements: (requirementIds: string[]) => void;
  onClearSmartExecutionRequirements: () => void;
  onSelectAllSmartExecutionCases: () => void;
  onClearSmartExecutionCases: () => void;
  canCreateExecution: boolean;
  isPreviewingSmartExecution: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const isSmartMode = executionCreateMode === "smart";
  const smartPreviewCases = smartExecutionPreview?.cases || [];
  const hasSmartPlanningInput = Boolean(smartExecutionReleaseScope.trim() || smartExecutionAdditionalContext.trim() || selectedSmartRequirementIds.length);
  const libraryCaseById = useMemo(() => new Map(libraryCases.map((testCase) => [testCase.id, testCase])), [libraryCases]);
  const isEngineSmartMode = isSmartMode && executionStartMode !== "manual";
  const automatedSmartPreviewCount = smartPreviewCases.filter((testCase) => libraryCaseById.get(testCase.test_case_id)?.automated === "yes").length;
  const manualSmartPreviewCount = smartPreviewCases.length - automatedSmartPreviewCount;
  const normalizedRequirementSearch = smartExecutionRequirementSearch.trim().toLowerCase();
  const filteredSmartRequirementOptions = normalizedRequirementSearch
    ? smartExecutionRequirementOptions.filter((requirement) =>
        [requirement.title, requirement.description || ""].some((value) => value.toLowerCase().includes(normalizedRequirementSearch))
      )
    : smartExecutionRequirementOptions;
  const areAllVisibleSmartRequirementsSelected =
    Boolean(filteredSmartRequirementOptions.length)
    && filteredSmartRequirementOptions.every((requirement) => selectedSmartRequirementIds.includes(requirement.id));
  const selectedSmartCaseCount = selectedSmartExecutionCaseIds.length;
  const selectedSmartExecutableCaseCount = isEngineSmartMode
    ? selectedSmartExecutionCaseIds.filter((testCaseId) => libraryCaseById.get(testCaseId)?.automated === "yes").length
    : selectedSmartCaseCount;
  const areAllSmartCasesSelected = isEngineSmartMode
    ? Boolean(automatedSmartPreviewCount) && selectedSmartExecutableCaseCount === automatedSmartPreviewCount
    : Boolean(smartPreviewCases.length) && selectedSmartCaseCount === smartPreviewCases.length;
  return (
    <div className="modal-backdrop modal-backdrop--scroll" onClick={() => !isSubmitting && onClose()} role="presentation">
      <div
        aria-labelledby="create-execution-title"
        aria-modal="true"
        className="modal-card execution-create-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <form className="execution-create-form" onSubmit={onSubmit}>
          <div className="execution-create-header">
            <div className="execution-create-title">
              <p className="dialog-context-label">Test runs</p>
              <div className="modal-title-info-row">
                <h2 className="dialog-title" id="create-execution-title">Create run</h2>
                <InfoTooltip
                  content="Choose a manual suite snapshot or let AI plan an impact-based run from your release scope and existing library."
                  label="Create run information"
                />
              </div>
            </div>
            <button
              aria-label="Close create run dialog"
              className="ghost-button"
              disabled={isSubmitting}
              onClick={onClose}
              type="button"
            >
              Close
            </button>
          </div>

          <div className="execution-create-body">
            <div className="execution-create-grid">
              <FormField label="Project" required>
                <ProjectDropdown
                  ariaLabel="Select a project"
                  onChange={onProjectChange}
                  projects={projects}
                  value={projectId}
                />
              </FormField>

              <FormField label="App type" required>
                <AppTypeDropdown
                  ariaLabel="Select an app type"
                  disabled={!projectId}
                  emptyLabel={!projectId ? "Select a project first" : "No app types available"}
                  onChange={onAppTypeChange}
                  options={appTypes.map((appType) => ({
                    value: appType.id,
                    label: appType.name,
                    type: appType.type,
                    isUnified: appType.is_unified
                  }))}
                  placeholder="Select app type"
                  value={appTypeId}
                />
              </FormField>
            </div>

            <div className="execution-create-grid">
              <FormField label="Run name">
                <input value={executionName} onChange={(event) => onExecutionNameChange(event.target.value)} />
              </FormField>

              <FormField label="Assign to" hint="Select one or more testers for this run.">
                <MultiAssigneePicker
                  disabled={!projectId || !assigneeOptions.length}
                  options={assigneeOptions}
                  selectedIds={selectedExecutionAssigneeIds}
                  onChange={onAssigneeChange}
                />
              </FormField>
            </div>

            <div className="execution-create-grid execution-create-grid--metadata">
              <FormField label="Release">
                <input placeholder="Release 5.8" value={executionRelease} onChange={(event) => onExecutionReleaseChange(event.target.value)} />
              </FormField>
              <FormField label="Sprint">
                <input placeholder="Sprint 24" value={executionSprint} onChange={(event) => onExecutionSprintChange(event.target.value)} />
              </FormField>
              <FormField label="Build">
                <input placeholder="Build 2026.07.02" value={executionBuild} onChange={(event) => onExecutionBuildChange(event.target.value)} />
              </FormField>
            </div>

            <div className="execution-create-grid">
              <FormField label="Run type">
                <RunTypeSelector value={executionStartMode} onChange={(value) => onExecutionStartModeChange(value as ExecutionStartMode)} />
              </FormField>

              <FormField label="Parallel execution">
                <div className="execution-parallel-control">
                  <label>
                    <input
                      checked={executionParallelEnabled}
                      onChange={(event) => onExecutionParallelEnabledChange(event.target.checked)}
                      type="checkbox"
                    />
                    <span>Run tests in parallel</span>
                  </label>
                  <input
                    aria-label="Parallel test count"
                    disabled={!executionParallelEnabled}
                    min={1}
                    max={50}
                    onChange={(event) => onExecutionParallelCountChange(Math.max(1, Number(event.target.value) || 1))}
                    type="number"
                    value={executionParallelCount}
                  />
                </div>
              </FormField>
            </div>

            <div className="execution-mode-switch" aria-label="Run creation mode" role="group">
              <button
                aria-pressed={!isSmartMode}
                className={!isSmartMode ? "execution-mode-button is-active" : "execution-mode-button"}
                onClick={() => onExecutionCreateModeChange("manual")}
                type="button"
              >
                <strong>Manual snapshot</strong>
                <span>Create a run from selected suites.</span>
              </button>
              <button
                aria-pressed={isSmartMode}
                className={isSmartMode ? "execution-mode-button is-active" : "execution-mode-button"}
                onClick={() => onExecutionCreateModeChange("smart")}
                type="button"
              >
                <strong>AI Smart Run</strong>
                <span>Pick impacted cases from release scope.</span>
              </button>
            </div>

            <div className="detail-summary">
              <strong>{selectedProject || "Select a project to continue"}</strong>
              <span>{selectedAppType ? `${selectedAppType} app type selected for this run.` : "Choose an app type to continue."}</span>
              <span>
                {isSmartMode
                  ? smartExecutionPreview
                    ? `${smartExecutionPreview.source_case_count} existing cases are available for impact analysis in this app type.`
                    : "AI smart run screens the current app type's existing cases exported as CSV."
                  : scopeSuites.length
                    ? `${scopeSuites.length} suites available in the current scope.`
                    : "No suites available in the current scope yet."}
              </span>
            </div>

            <ExecutionContextSelector
              appTypeId={appTypeId}
              onConfigurationChange={onConfigurationChange}
              onDataSetChange={onDataSetChange}
              onEnvironmentChange={onEnvironmentChange}
              prefillFirstAvailable={true}
              projectId={projectId}
              selectedConfigurationId={selectedConfigurationId}
              selectedDataSetId={selectedDataSetId}
              selectedEnvironmentId={selectedEnvironmentId}
            />

            <RunHooksBuilder
              onChange={onExecutionHookDraftChange}
              suites={scopeSuites}
              testCases={libraryCases}
              value={executionHookDraft}
            />

            {isSmartMode ? (
              <div className="ai-studio-shell execution-smart-shell">
                <div className="ai-studio-sidebar">
                  <section className="ai-studio-panel">
                    <div className="panel-head">
                      <div>
                        <p className="eyebrow">Release impact prompt</p>
                        <p>Shape the AI prompt with release scope, additional context, or both before previewing impacted coverage.</p>
                      </div>
                    </div>

                    <FormField label="LLM integration">
                      <select value={smartExecutionIntegrationId} onChange={(event) => onSmartExecutionIntegrationChange(event.target.value)}>
                        <option value="">Configured prompt LLM or default active</option>
                        {integrations.map((integration) => (
                          <option key={integration.id} value={integration.id}>
                            {integration.name}
                          </option>
                        ))}
                      </select>
                    </FormField>

                    <FormField label="Release scope" hint="Provide release scope, additional context, or both. AI can plan from either field.">
                      <textarea
                        placeholder="Summarize the release changes, touched modules, high-risk workflows, integrations, data movement, and regression concerns..."
                        rows={7}
                        value={smartExecutionReleaseScope}
                        onChange={(event) => onSmartExecutionReleaseScopeChange(event.target.value)}
                      />
                    </FormField>

                    <FormField label="Additional context" hint="Optional on its own too: rollout notes, known gaps, compliance focus, customer risk, or environment context.">
                      <textarea
                        placeholder="Environment notes, rollout risks, known gaps, customer impact, compliance focus..."
                        rows={5}
                        value={smartExecutionAdditionalContext}
                        onChange={(event) => onSmartExecutionAdditionalContextChange(event.target.value)}
                      />
                    </FormField>

                    <FormField label="Impacted requirements">
                      <div className="execution-smart-requirements-panel">
                        <div className="execution-smart-requirement-toolbar">
                          <input
                            placeholder="Filter linked requirements"
                            value={smartExecutionRequirementSearch}
                            onChange={(event) => onSmartExecutionRequirementSearchChange(event.target.value)}
                          />
                          <button
                            className="ghost-button"
                            disabled={!filteredSmartRequirementOptions.length || areAllVisibleSmartRequirementsSelected}
                            onClick={() => onSelectAllSmartExecutionRequirements(filteredSmartRequirementOptions.map((requirement) => requirement.id))}
                            type="button"
                          >
                            Select visible
                          </button>
                          <button
                            className="ghost-button"
                            disabled={!selectedSmartRequirementIds.length}
                            onClick={onClearSmartExecutionRequirements}
                            type="button"
                          >
                            Clear
                          </button>
                        </div>

                        {smartExecutionRequirementOptions.length ? (
                          <div className="execution-smart-requirement-list">
                            {filteredSmartRequirementOptions.map((requirement) => {
                              const isSelected = selectedSmartRequirementIds.includes(requirement.id);

                              return (
                                <label
                                  className={isSelected ? "execution-smart-requirement-card is-selected" : "execution-smart-requirement-card"}
                                  key={requirement.id}
                                >
                                  <input
                                    checked={isSelected}
                                    onChange={() => onToggleSmartExecutionRequirement(requirement.id)}
                                    type="checkbox"
                                  />
                                  <div className="execution-smart-requirement-copy">
                                    <strong>{requirement.title}</strong>
                                    <span>{richTextToPlainText(requirement.description) || "Requirement-linked coverage available in this app type."}</span>
                                  </div>
                                  <span className="execution-smart-requirement-count">
                                    {requirement.linkedCaseCount} case{requirement.linkedCaseCount === 1 ? "" : "s"}
                                  </span>
                                </label>
                              );
                            })}

                            {!filteredSmartRequirementOptions.length ? (
                              <div className="empty-state compact">No linked requirements match the current search.</div>
                            ) : null}
                          </div>
                        ) : (
                          <div className="empty-state compact">No requirement-linked test cases are available for this app type yet.</div>
                        )}
                      </div>
                    </FormField>

                    <div className="detail-summary compact-summary">
                      <strong>{selectedSmartRequirementIds.length ? `${selectedSmartRequirementIds.length} impacted requirement${selectedSmartRequirementIds.length === 1 ? "" : "s"} selected` : "Requirement filter is optional"}</strong>
                      <span>
                        {selectedSmartRequirementIds.length
                          ? "AI will screen only the cases linked to the selected requirements before building the Default suite plan."
                          : "Choose impacted requirements if you want AI to narrow the candidate cases before planning the run."}
                      </span>
                    </div>

                    <div className="detail-summary compact-summary">
                      <strong>{smartExecutionPreview?.default_suite.name || "Default"} suite target</strong>
                      <span>AI-selected cases are staged under the built-in Default suite so the run stays focused on impacted coverage instead of suite hierarchy.</span>
                    </div>
                  </section>
                </div>

                <div className="ai-studio-main">
                  <div className="detail-summary">
                    <strong>{smartExecutionPreview ? `${selectedSmartExecutableCaseCount} impacted cases selected` : "AI Smart Run"}</strong>
                    <span>{smartExecutionPreview ? smartExecutionPreview.summary : "Generate an impact-based run plan from impacted requirements, release scope, context, or all three."}</span>
                    <span>
                      {smartExecutionPreview
                        ? isEngineSmartMode
                          ? `${smartExecutionPreview.source_case_count} cases were screened. ${automatedSmartPreviewCount} automated cases can run through Test Engine; ${manualSmartPreviewCount} manual cases stay out of engine execution.`
                          : `${smartExecutionPreview.source_case_count} existing cases were screened and ${smartExecutionPreview.matched_case_count} cases were suggested for this run.`
                        : selectedSmartRequirementIds.length
                          ? `AI will use the selected project, app type, run context, and only the cases linked to ${selectedSmartRequirementIds.length} selected requirement${selectedSmartRequirementIds.length === 1 ? "" : "s"}.`
                          : "AI uses the selected project, app type, run context, and existing cases exported as CSV."}
                    </span>
                  </div>

                  {smartExecutionPreviewMessage ? (
                    <p className={smartExecutionPreviewTone === "error" ? "inline-message error-message" : "inline-message success-message"}>
                      {smartExecutionPreviewMessage}
                    </p>
                  ) : null}

                  {!integrations.length ? (
                    <div className="inline-message error-message">
                      No active LLM integrations are available yet. Create one in Integrations to use AI smart runs.
                    </div>
                  ) : null}

                  <div className="action-row">
                    <button
                      className="primary-button"
                      disabled={!projectId || !appTypeId || !hasSmartPlanningInput || isPreviewingSmartExecution || isSubmitting || !integrations.length}
                      onClick={onPreviewSmartExecution}
                      type="button"
                    >
                      {isPreviewingSmartExecution ? "Planning…" : "Generate impact preview"}
                    </button>
                    <button
                      className="ghost-button"
                      disabled={!smartPreviewCases.length || areAllSmartCasesSelected}
                      onClick={onSelectAllSmartExecutionCases}
                      type="button"
                    >
                      Select all
                    </button>
                    <button
                      className="ghost-button"
                      disabled={!selectedSmartCaseCount}
                      onClick={onClearSmartExecutionCases}
                      type="button"
                    >
                      Clear
                    </button>
                  </div>

                  {smartExecutionPreview ? (
                    <div className="selection-summary-card execution-smart-summary-card">
                      <div className="selection-summary-header">
                        <div>
                          <strong>{smartExecutionPreview.execution_name}</strong>
                          <span>{smartExecutionPreview.summary}</span>
                        </div>
                        <span className="count-pill">{selectedSmartExecutableCaseCount}/{isEngineSmartMode ? automatedSmartPreviewCount : smartExecutionPreview.matched_case_count} selected</span>
                      </div>
                    </div>
                  ) : null}

                  <div className="execution-smart-impact-list">
                    {smartPreviewCases.map((testCase) => {
                      const isSelected = selectedSmartExecutionCaseIds.includes(testCase.test_case_id);
                      const isAutomatedSmartCase = libraryCaseById.get(testCase.test_case_id)?.automated === "yes";
                      const isDisabledForEngine = isEngineSmartMode && !isAutomatedSmartCase;

                      return (
                        <label
                          className={[
                            "execution-smart-impact-card",
                            isSelected ? "is-selected" : "",
                            isDisabledForEngine ? "is-disabled" : ""
                          ].filter(Boolean).join(" ")}
                          key={testCase.test_case_id}
                        >
                          <input
                            checked={isSelected}
                            disabled={isDisabledForEngine}
                            onChange={() => onToggleSmartExecutionCase(testCase.test_case_id)}
                            type="checkbox"
                          />
                          <div className="execution-smart-impact-body">
                            <div className="execution-smart-impact-top">
                              <div className="execution-smart-impact-heading">
                                <strong>{testCase.title}</strong>
                                <span>{richTextToPlainText(testCase.description) || "No description available."}</span>
                              </div>
                              <div className="execution-smart-impact-facts">
                                <span className={`execution-smart-impact-level is-${testCase.impact_level}`}>
                                  {executionImpactLevelLabel(testCase.impact_level)}
                                </span>
                                <span className="count-pill">
                                  {testCase.step_count} step{testCase.step_count === 1 ? "" : "s"}
                                </span>
                                <span className={isAutomatedSmartCase ? "count-pill success" : "count-pill"}>
                                  {isAutomatedSmartCase ? "Automated" : "Manual"}
                                </span>
                              </div>
                            </div>

                            <p className="execution-smart-impact-reason">{testCase.reason}</p>

                            <div className="detail-summary compact-summary">
                              <strong>{testCase.suite_names.length ? testCase.suite_names.join(" · ") : "No suite mapping"}</strong>
                              <span>
                                {testCase.requirement_titles.length
                                  ? `Requirements: ${testCase.requirement_titles.join(" · ")}`
                                  : "No linked requirements"}
                              </span>
                            </div>
                          </div>
                        </label>
                      );
                    })}

                    {smartExecutionPreview && !smartPreviewCases.length ? (
                      <div className="empty-state compact">No impacted cases were identified for the current release scope.</div>
                    ) : null}
                    {!smartExecutionPreview ? (
                      <div className="empty-state compact">Generate a preview to review the impacted cases that will be staged under Default.</div>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : (
              <>
                <FormField label="Suite scope" required>
                  <div className="suite-modal-picker-shell suite-modal-picker-shell--scope">
                    <SuiteScopePicker
                      description="Select the suites to snapshot for this run, then adjust their order if you want a different run sequence."
                      emptyMessage="No suites available for the current app type."
                      heading="Available suites"
                      onChange={onSuiteSelectionChange}
                      selectedSuiteIds={selectedSuiteIds}
                      suites={scopeSuites}
                    />
                  </div>
                </FormField>

                {!scopeSuites.length && appTypeId ? <div className="empty-state compact">No suites available for this app type. Create a suite first.</div> : null}
              </>
            )}
          </div>

          <div className="action-row execution-create-actions">
            <button className="primary-button" disabled={!canCreateExecution || isSubmitting || (isSmartMode && isPreviewingSmartExecution)} type="submit">
              {isSubmitting
                ? "Creating…"
                : isSmartMode
                  ? "Create AI smart run"
                  : executionStartMode === "remote"
                    ? "Create Remote Run"
                    : executionStartMode === "local"
                      ? "Create Local Run"
                      : "Create Manual Run"}
            </button>
            <button className="ghost-button" disabled={isSubmitting} onClick={onClose} type="button">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CreateExecutionScheduleModal({
  mode,
  projectId,
  projectName,
  appTypeId,
  appTypeName,
  scopeSuites,
  selectedSuiteIds,
  executionName,
  selectedEnvironmentId,
  selectedConfigurationId,
  selectedDataSetId,
  selectedAssigneeIds,
  executionRelease,
  executionSprint,
  executionBuild,
  assigneeOptions,
  cadence,
  intervalMinutes,
  nextRunAt,
  isSubmitting,
  onExecutionNameChange,
  onEnvironmentChange,
  onConfigurationChange,
  onDataSetChange,
  onAssigneeChange,
  onExecutionReleaseChange,
  onExecutionSprintChange,
  onExecutionBuildChange,
  onSuiteSelectionChange,
  onCadenceChange,
  onIntervalMinutesChange,
  onNextRunAtChange,
  onClose,
  onSubmit
}: {
  mode: "create" | "edit";
  projectId: string;
  projectName: string;
  appTypeId: string;
  appTypeName: string;
  scopeSuites: TestSuite[];
  selectedSuiteIds: string[];
  executionName: string;
  selectedEnvironmentId: string;
  selectedConfigurationId: string;
  selectedDataSetId: string;
  selectedAssigneeIds: string[];
  executionRelease: string;
  executionSprint: string;
  executionBuild: string;
  assigneeOptions: ExecutionAssigneeOption[];
  cadence: ExecutionScheduleCadence;
  intervalMinutes: number;
  nextRunAt: string;
  isSubmitting: boolean;
  onExecutionNameChange: (value: string) => void;
  onEnvironmentChange: (value: string) => void;
  onConfigurationChange: (value: string) => void;
  onDataSetChange: (value: string) => void;
  onAssigneeChange: (value: string[]) => void;
  onExecutionReleaseChange: (value: string) => void;
  onExecutionSprintChange: (value: string) => void;
  onExecutionBuildChange: (value: string) => void;
  onSuiteSelectionChange: (nextIds: string[]) => void;
  onCadenceChange: (value: ExecutionScheduleCadence) => void;
  onIntervalMinutesChange: (value: number) => void;
  onNextRunAtChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const isEditing = mode === "edit";

  return (
    <div className="modal-backdrop modal-backdrop--scroll" onClick={() => !isSubmitting && onClose()} role="presentation">
      <div
        aria-labelledby="create-execution-schedule-title"
        aria-modal="true"
        className="modal-card execution-create-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <form className="execution-create-form" onSubmit={onSubmit}>
          <div className="execution-create-header">
            <div className="execution-create-title">
              <p className="dialog-context-label">Scheduled runs</p>
              <h2 className="dialog-title" id="create-execution-schedule-title">{isEditing ? "Edit schedule" : "Create schedule"}</h2>
              <p>{isEditing ? "Adjust the recurring run without losing its run history or current scope." : "Save a recurring run separately from the live run board, then launch it when needed."}</p>
            </div>
            <button aria-label={`Close ${isEditing ? "edit" : "create"} schedule dialog`} className="ghost-button" disabled={isSubmitting} onClick={onClose} type="button">
              Close
            </button>
          </div>

          <div className="execution-create-body">
            <div className="detail-summary">
              <strong>{projectName || "Select a project to continue"}</strong>
              <span>{appTypeName ? `${appTypeName} app type selected for this schedule.` : "Choose an app type before scheduling."}</span>
              <span>{scopeSuites.length ? `${scopeSuites.length} suites available for recurring runs.` : "No suites available yet in the selected scope."}</span>
            </div>

            <div className="execution-create-grid">
              <FormField label="Schedule name">
                <input value={executionName} onChange={(event) => onExecutionNameChange(event.target.value)} />
              </FormField>
              <FormField label="Assign to" hint="These users become the default tester group each time the schedule creates a fresh run.">
                <MultiAssigneePicker
                  disabled={!projectId || !assigneeOptions.length || isSubmitting}
                  options={assigneeOptions}
                  selectedIds={selectedAssigneeIds}
                  onChange={onAssigneeChange}
                />
              </FormField>
            </div>

            <div className="execution-create-grid execution-create-grid--metadata">
              <FormField label="Release">
                <input placeholder="Release 5.8" value={executionRelease} onChange={(event) => onExecutionReleaseChange(event.target.value)} />
              </FormField>
              <FormField label="Sprint">
                <input placeholder="Sprint 24" value={executionSprint} onChange={(event) => onExecutionSprintChange(event.target.value)} />
              </FormField>
              <FormField label="Build">
                <input placeholder="Build 2026.07.02" value={executionBuild} onChange={(event) => onExecutionBuildChange(event.target.value)} />
              </FormField>
            </div>

            <div className="execution-create-grid">
              <FormField label="Cadence" required>
                <select value={cadence} onChange={(event) => onCadenceChange(event.target.value as ExecutionScheduleCadence)}>
                  <option value="once">Once</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="interval_minutes">Run every N minutes</option>
                </select>
              </FormField>
              <FormField label={cadence === "interval_minutes" ? "Run every" : "First run"} required>
                {cadence === "interval_minutes" ? (
                  <div className="execution-interval-control">
                    <input
                      aria-label="Run every minutes"
                      min={1}
                      max={1440}
                      onChange={(event) => onIntervalMinutesChange(Math.max(1, Number(event.target.value) || 5))}
                      type="number"
                      value={intervalMinutes}
                    />
                    <span>minutes</span>
                    <div className="execution-interval-presets" aria-label="Common schedule intervals">
                      {[5, 10, 15].map((minutes) => (
                        <button
                          className={intervalMinutes === minutes ? "ghost-button is-active" : "ghost-button"}
                          key={minutes}
                          onClick={() => onIntervalMinutesChange(minutes)}
                          type="button"
                        >
                          {minutes} mins
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                <input type="datetime-local" value={nextRunAt} onChange={(event) => onNextRunAtChange(event.target.value)} />
              </FormField>
            </div>

            <ExecutionContextSelector
              appTypeId={appTypeId}
              onConfigurationChange={onConfigurationChange}
              onDataSetChange={onDataSetChange}
              onEnvironmentChange={onEnvironmentChange}
              prefillFirstAvailable={true}
              projectId={projectId}
              selectedConfigurationId={selectedConfigurationId}
              selectedDataSetId={selectedDataSetId}
              selectedEnvironmentId={selectedEnvironmentId}
            />

            <FormField label="Run scope" required>
              <SuiteScopePicker
                description="Pick the reusable suites that should be snapped whenever this schedule runs."
                emptyMessage="No suites available in this app type yet."
                heading="Scheduled suite scope"
                onChange={onSuiteSelectionChange}
                selectedSuiteIds={selectedSuiteIds}
                suites={scopeSuites}
              />
            </FormField>
          </div>

          <div className="action-row execution-create-actions">
            <button className="primary-button" disabled={!projectId || !appTypeId || !selectedSuiteIds.length || !nextRunAt || isSubmitting} type="submit">
              {isSubmitting ? "Saving…" : isEditing ? "Save schedule" : "Create schedule"}
            </button>
            <button className="ghost-button" disabled={isSubmitting} onClick={onClose} type="button">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ExecutionContextSnapshotSummary({
  execution,
  onViewFull
}: {
  execution: Execution;
  onViewFull?: () => void;
}) {
  const environmentSummary = execution.test_environment?.snapshot;
  const configurationSummary = execution.test_configuration?.snapshot;
  const dataSetSummary = execution.test_data_set?.snapshot;
  const configurationTarget = [
    configurationSummary?.browser,
    configurationSummary?.mobile_os,
    configurationSummary?.platform_version
  ].filter(Boolean).join(" · ");

  return (
    <div className="execution-context-summary-shell">
      <div className="execution-context-summary-head">
        <div className="execution-context-summary-copy">
          <div className="execution-context-summary-title-row">
            <strong>Run context snapshot</strong>
            <InfoTooltip
              content="Environment, configuration, and test data were frozen when this run was created."
              label="Run context snapshot information"
            />
          </div>
        </div>
        {onViewFull ? (
          <button className="ghost-button" onClick={onViewFull} type="button">
            View full context
          </button>
        ) : null}
      </div>

      <div className="execution-context-cards">
        <div className="execution-context-card">
          <span>Environment snapshot</span>
          <strong>{environmentSummary?.name || execution.test_environment?.name || "No environment attached"}</strong>
          <small>{environmentSummary?.base_url || environmentSummary?.browser || "No environment snapshot details recorded."}</small>
        </div>
        <div className="execution-context-card">
          <span>Configuration snapshot</span>
          <strong>{configurationSummary?.name || execution.test_configuration?.name || "No configuration attached"}</strong>
          <small>{configurationTarget || (configurationSummary?.variables?.length ? `${configurationSummary.variables.length} variables available` : "No configuration snapshot details recorded.")}</small>
        </div>
        <div className="execution-context-card">
          <span>Data snapshot</span>
          <strong>{dataSetSummary?.name || execution.test_data_set?.name || "No data set attached"}</strong>
          <small>
            {dataSetSummary
              ? dataSetSummary.mode === "table"
                ? `${dataSetSummary.rows.length} table rows snapped`
                : `${dataSetSummary.rows.length} key/value pairs snapped`
              : "No data snapshot details recorded."}
          </small>
        </div>
      </div>
    </div>
  );
}

function ExecutionContextSnapshotModal({
  execution,
  onClose
}: {
  execution: Execution;
  onClose: () => void;
}) {
  const environmentSummary = execution.test_environment?.snapshot;
  const configurationSummary = execution.test_configuration?.snapshot;
  const dataSetSummary = execution.test_data_set?.snapshot;

  return (
    <div className="modal-backdrop modal-backdrop--scroll" onClick={onClose} role="presentation">
      <div
        aria-labelledby="execution-context-modal-title"
        aria-modal="true"
        className="modal-card execution-context-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="execution-context-modal-header">
          <div className="execution-context-modal-copy">
            <p className="dialog-context-label">Run context snapshot</p>
            <h2 className="dialog-title" id="execution-context-modal-title">{execution.name || "Selected run"}</h2>
            <p>Review the exact environment, configuration, and test data preserved with this run. Later edits to reusable resources do not change this snapshot.</p>
          </div>
          <button className="ghost-button" onClick={onClose} type="button">
            Close
          </button>
        </div>

        <div className="execution-context-modal-body">
          <ExecutionContextSnapshotSummary execution={execution} />

          <div className="execution-context-modal-layout">
            <ExecutionContextSnapshotSection
              description="Base URL, browser, notes, and environment variables preserved for this run."
              title={environmentSummary?.name || execution.test_environment?.name || "No environment attached"}
            >
              {environmentSummary ? (
                <>
                  <ExecutionContextMetaGrid
                    items={[
                      { label: "Base URL", value: environmentSummary.base_url || "Not set" },
                      { label: "Browser", value: environmentSummary.browser || "Not set" },
                      {
                        label: "Variables",
                        value: `${environmentSummary.variables.length} variable${environmentSummary.variables.length === 1 ? "" : "s"}`
                      }
                    ]}
                  />
                  {environmentSummary.description ? (
                    <ExecutionContextSnapshotCopyBlock label="Description" value={environmentSummary.description} />
                  ) : null}
                  {environmentSummary.notes ? (
                    <ExecutionContextSnapshotCopyBlock label="Notes" value={environmentSummary.notes} />
                  ) : null}
                  <ExecutionContextVariableTable
                    emptyMessage="No environment variables were snapshotted for this run."
                    entries={environmentSummary.variables}
                    title="Environment variables"
                  />
                </>
              ) : (
                <div className="empty-state compact">No environment snapshot details were recorded for this run.</div>
              )}
            </ExecutionContextSnapshotSection>

            <ExecutionContextSnapshotSection
              description="Browser, mobile target, platform version, and configuration variables preserved with the run."
              title={configurationSummary?.name || execution.test_configuration?.name || "No configuration attached"}
            >
              {configurationSummary ? (
                <>
                  <ExecutionContextMetaGrid
                    items={[
                      { label: "Browser", value: configurationSummary.browser || "Not set" },
                      { label: "Mobile OS", value: configurationSummary.mobile_os || "Not set" },
                      { label: "Platform version", value: configurationSummary.platform_version || "Not set" },
                      {
                        label: "Variables",
                        value: `${configurationSummary.variables.length} variable${configurationSummary.variables.length === 1 ? "" : "s"}`
                      }
                    ]}
                  />
                  {configurationSummary.description ? (
                    <ExecutionContextSnapshotCopyBlock label="Description" value={configurationSummary.description} />
                  ) : null}
                  <ExecutionContextVariableTable
                    emptyMessage="No configuration variables were snapshotted for this run."
                    entries={configurationSummary.variables}
                    title="Configuration variables"
                  />
                </>
              ) : (
                <div className="empty-state compact">No configuration snapshot details were recorded for this run.</div>
              )}
            </ExecutionContextSnapshotSection>

            <ExecutionContextSnapshotSection
              description="The data rows below are the exact run data snapshot used for this run."
              title={dataSetSummary?.name || execution.test_data_set?.name || "No data set attached"}
            >
              {dataSetSummary ? (
                <>
                  <ExecutionContextMetaGrid
                    items={[
                      { label: "Mode", value: dataSetSummary.mode === "table" ? "Table data" : "Key/value data" },
                      { label: "Columns", value: String(dataSetSummary.columns.length) },
                      { label: "Rows", value: String(dataSetSummary.rows.length) }
                    ]}
                  />
                  {dataSetSummary.description ? (
                    <ExecutionContextSnapshotCopyBlock label="Description" value={dataSetSummary.description} />
                  ) : null}
                  <ExecutionContextDataTable snapshot={dataSetSummary} />
                </>
              ) : (
                <div className="empty-state compact">No test data snapshot details were recorded for this execution.</div>
              )}
            </ExecutionContextSnapshotSection>
          </div>
        </div>
      </div>
    </div>
  );
}

function ExecutionContextSnapshotSection({
  title,
  description,
  children
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="execution-context-modal-section">
      <div className="execution-context-modal-section-head">
        <div className="execution-context-modal-section-copy">
          <h4>{title}</h4>
          <p>{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function ExecutionContextMetaGrid({
  items
}: {
  items: Array<{
    label: string;
    value: string;
  }>;
}) {
  return (
    <div className="execution-context-modal-meta">
      {items.map((item) => (
        <div className="execution-context-modal-meta-card" key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}

function ExecutionContextSnapshotCopyBlock({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="execution-context-modal-copy-block">
      <strong>{label}</strong>
      <p>{value}</p>
    </div>
  );
}

function ExecutionContextVariableTable({
  entries,
  title,
  emptyMessage
}: {
  entries: KeyValueEntry[];
  title: string;
  emptyMessage: string;
}) {
  return (
    <div className="resource-table-shell execution-context-table-shell">
      <div className="resource-table-toolbar">
        <strong>{title}</strong>
        <span className="count-pill">{entries.length} item{entries.length === 1 ? "" : "s"}</span>
      </div>
      {!entries.length ? <div className="empty-state compact resource-table-empty">{emptyMessage}</div> : null}
      {entries.length ? (
        <div className="table-wrap execution-context-table-wrap">
          <table className="data-table resource-data-table">
            <thead>
              <tr>
                <th>Key</th>
                <th>Value</th>
                <th>Visibility</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, index) => (
                <tr key={entry.id || `${entry.key}-${index}`}>
                  <td>{entry.key || "Untitled key"}</td>
                  <td>{entry.is_secret ? <span className="execution-context-hidden-value">{entry.has_stored_value ? "Stored secret" : "Hidden secret"}</span> : entry.value || "—"}</td>
                  <td>{entry.is_secret ? "Hidden" : "Visible"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function ExecutionContextDataTable({
  snapshot
}: {
  snapshot: ExecutionDataSetSnapshot;
}) {
  if (snapshot.mode === "table") {
    return (
      <div className="resource-table-shell execution-context-table-shell">
        <div className="resource-table-toolbar">
          <strong>Table snapshot</strong>
          <span className="count-pill">{snapshot.rows.length} row{snapshot.rows.length === 1 ? "" : "s"}</span>
        </div>
        {!snapshot.columns.length ? <div className="empty-state compact resource-table-empty">No columns were snapshotted for this data set.</div> : null}
        {snapshot.columns.length ? (
          <div className="table-wrap execution-context-table-wrap">
            <table className="data-table resource-data-table">
              <thead>
                <tr>
                  {snapshot.columns.map((column) => (
                    <th key={column}>{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {snapshot.rows.length ? (
                  snapshot.rows.map((row, rowIndex) => (
                    <tr key={`row-${rowIndex}`}>
                      {snapshot.columns.map((column) => (
                        <td key={`${rowIndex}-${column}`}>{row[column] || "—"}</td>
                      ))}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={snapshot.columns.length}>No rows were snapshotted for this data set.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="resource-table-shell execution-context-table-shell">
      <div className="resource-table-toolbar">
        <strong>Key/value snapshot</strong>
        <span className="count-pill">{snapshot.rows.length} pair{snapshot.rows.length === 1 ? "" : "s"}</span>
      </div>
      {!snapshot.rows.length ? <div className="empty-state compact resource-table-empty">No key/value rows were snapshotted for this data set.</div> : null}
      {snapshot.rows.length ? (
        <div className="table-wrap execution-context-table-wrap">
          <table className="data-table resource-data-table">
            <thead>
              <tr>
                <th>Key</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.rows.map((row, rowIndex) => (
                <tr key={`row-${rowIndex}`}>
                  <td>{row.key || `Row ${rowIndex + 1}`}</td>
                  <td>{row.value || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
