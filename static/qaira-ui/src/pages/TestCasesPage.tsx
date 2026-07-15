import { ChangeEvent, FormEvent, Fragment, useDeferredValue, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { AiCaseAuthoringModal } from "../components/AiCaseAuthoringModal";
import { AiAssurancePanel } from "../components/AiAssurancePanel";
import { AiDesignStudioModal } from "../components/AiDesignStudioModal";
import { AiInsightPreviewDialog, type AiPreviewFinding } from "../components/AiInsightPreviewDialog";
import { ActivityIcon, AddIcon, BugIcon, ClearSelectionIcon, CopyIcon, ExportIcon, FolderIcon, MoveIcon, OpenIcon, PauseIcon, PencilIcon, RecordIcon, SelectAllIcon, TrashIcon } from "../components/AppIcons";
import { CatalogActionMenu } from "../components/CatalogActionMenu";
import { CatalogViewToggle } from "../components/CatalogViewToggle";
import { CatalogSearchFilter } from "../components/CatalogSearchFilter";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { DetailSectionTabs } from "../components/DetailSectionTabs";
import { DisplayIdBadge } from "../components/DisplayIdBadge";
import { DialogCloseButton } from "../components/DialogCloseButton";
import { ExecutionContextSelector } from "../components/ExecutionContextSelector";
import { FormField } from "../components/FormField";
import { InfoTooltip } from "../components/InfoTooltip";
import { HierarchyMetricStrip } from "../components/HierarchyMetricStrip";
import { JiraAttachmentIcon, JiraAttachmentPanel } from "../components/JiraAttachmentPanel";
import { LinkedTestCaseModal } from "../components/LinkedTestCaseModal";
import { LinkedDefectsPanel } from "../components/LinkedDefectsPanel";
import { LoadingState } from "../components/LoadingState";
import { MultiAssigneePicker } from "../components/MultiAssigneePicker";
import { PageHeader } from "../components/PageHeader";
import { Panel } from "../components/Panel";
import { RecorderSessionInsights } from "../components/RecorderSessionInsights";
import { SchemaPropertyFields } from "../components/SchemaPropertyFields";
import { RecorderStartControls, type RecorderStartOptions } from "../components/RecorderStartControls";
import { RichTextAiRephraseIcon, RichTextContent, RichTextEditor, richTextToPlainText } from "../components/RichTextEditor";
import { RunTypeSelector } from "../components/RunTypeSelector";
import { StepParameterDialog } from "../components/StepParameterDialog";
import { StepParameterizedText } from "../components/StepParameterizedText";
import {
  AutomationCodeIcon,
  CodePreviewDialog,
  SharedGroupLevelIcon,
  StandardStepIcon,
  StepAutomationDialog,
  StepIconButton as InlineStepToolButton,
  StepTypePickerButton
} from "../components/StepAutomationEditor";
import { SharedStepsIcon as SharedStepsIconGraphic } from "../components/SharedStepsIcon";
import { StatusBadge } from "../components/StatusBadge";
import {
  TileCardSuiteIcon,
  TileCardStepsIcon,
  formatTileCardLabel
} from "../components/TileCardPrimitives";
import { SuiteCasePicker } from "../components/SuiteCasePicker";
import { TileBrowserPane } from "../components/TileBrowserPane";
import { TileCardSkeletonGrid } from "../components/TileCardSkeletonGrid";
import { ToastMessage } from "../components/ToastMessage";
import { TestCaseVersionHistory } from "../components/TestCaseVersionHistory";
import { TraceabilityRunHistory } from "../components/TraceabilityRunHistory";
import { WorkspaceBackButton, WorkspaceMasterDetail } from "../components/WorkspaceMasterDetail";
import { VisualTestBuilder } from "../components/VisualTestBuilder";
import { useDeleteConfirmation } from "../components/DeleteConfirmationDialog";
import { useCurrentAppType, useCurrentProject } from "../hooks/useCurrentProject";
import { useDomainMetadata } from "../hooks/useDomainMetadata";
import { useDialogFocus } from "../hooks/useDialogFocus";
import { useAiPromptRegistry } from "../hooks/useAiPromptRegistry";
import { useFeatureFlags } from "../hooks/useFeatureFlags";
import { formatAuditTimestamp, resolveAuditUserLabel } from "../lib/auditDisplay";
import {
  countImportedGroups,
  countImportedSuites,
  countImportedSteps,
  getImportedStepPreviewLabel
} from "../lib/testCaseImport";
import {
  getTestCaseImportSourceLabel,
  prepareTestCaseImportBatch,
  TEST_CASE_IMPORT_SOURCE_OPTIONS,
  type PreparedTestCaseImportBatch,
  type TestCaseImportSource,
  type TestCaseImportSourceSelection
} from "../lib/testCaseSourceImport";
import { api } from "../lib/api";
import { appendUniqueImages, parseExternalLinks, readImageFiles, toggleRequirementOnPreviewCase } from "../lib/aiDesignStudio";
import { assessTestCaseReviewReadiness } from "../lib/aiAssurance";
import { formatReferenceList, parseReferenceList } from "../lib/externalReferences";
import { areFeatureFlagsEnabled } from "../lib/featureFlags";
import { downloadCsvRecords } from "../lib/csvExport";
import { summarizeExecutionStart } from "../lib/executionStartSummary";
import { hasPermission } from "../lib/permissions";
import { deriveModuleHealth } from "../lib/hierarchyHealth";
import { upsertSharedStepGroupInCache } from "../lib/sharedStepGroupCache";
import { findByRoutableId, getRoutableId } from "../lib/urlSelection";
import {
  buildCaseAutomationCode,
  buildGroupAutomationCode,
  normalizeApiRequest,
  normalizeAutomationCode,
  normalizeStepType,
  resolveStepAutomationCode,
  stepHasAutomation
} from "../lib/stepAutomation";
import { type AssigneeOption, buildAssigneeOptions } from "../lib/userDisplay";
import {
  combineStepParameterValues,
  collectStepParameters,
  normalizeStepParameterValues,
  parseStepParameterName,
  resolveStepParameterText,
  type StepParameterDefinition,
  type StepParameterScope
} from "../lib/stepParameters";
import { readDefaultCatalogViewMode } from "../lib/viewPreferences";
import type {
  AiAuthoredTestCasePreview,
  AiDesignImageInput,
  AiDesignedTestCaseCandidate,
  AiTestCaseGenerationJob,
  AppType,
  AutomationLearningCacheEntry,
  Execution,
  ExecutionResult,
  Integration,
  ProjectMember,
  Project,
  RecorderSessionResponse,
  Requirement,
  SharedStepGroup,
  TestCase,
  TestCaseModule,
  TestStep,
  TestSuite,
  User
} from "../types";

type TestCaseDraft = {
  title: string;
  description: string;
  externalReferencesText: string;
  labelsText: string;
  automated: "yes" | "no";
  priority: number;
  status: string;
  requirement_id: string;
  module_id: string;
  reviewer_id: string;
  customFields: Record<string, unknown>;
};

type ExecutionStartMode = "manual" | "local" | "remote";

type StepDraft = {
  action: string;
  expected_result: string;
  step_type: TestStep["step_type"];
  automation_code: string;
  api_request: TestStep["api_request"];
};

type TestCaseAuthoringLens = "manual" | "ui-script" | "api-script";

type AuthoringStepProjection = Pick<TestStep, "id" | "step_order" | "action" | "expected_result" | "step_type" | "automation_code" | "api_request">;

type DraftTestStep = {
  id: string;
  action: string;
  expected_result: string;
  step_type: TestStep["step_type"];
  automation_code: string;
  api_request: TestStep["api_request"];
  group_id: string | null;
  group_name: string | null;
  group_kind: "local" | "reusable" | null;
  reusable_group_id: string | null;
};

type CopiedTestStep = {
  action: string;
  expected_result: string;
  step_type: TestStep["step_type"];
  automation_code: string;
  api_request: TestStep["api_request"];
  group_id: string | null;
  group_name: string | null;
  group_kind: "local" | "reusable" | null;
  reusable_group_id: string | null;
};

type StepInsertionGroupContext = Pick<CopiedTestStep, "group_id" | "group_name" | "group_kind" | "reusable_group_id">;

type CutStepSource = {
  stepIds: string[];
  testCaseId: string | null;
  isDraft: boolean;
};

type StepActionMenuAction = {
  label: string;
  description?: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "danger" | "primary";
};

type CaseStepFilter = "all" | "with-steps" | "no-steps";
type CaseRunFilter = "all" | "with-runs" | "no-runs";
const TEST_CASE_RENDER_BATCH_SIZE = 240;
type SuiteTransferAction = "add" | "move" | "copy";
type TestCaseExecutionAssigneeOption = AssigneeOption;

type TestCaseEditorSectionKey = "case" | "preconditions" | "steps" | "automation" | "history";
type TestCaseDetailTab = "details" | "history" | "defects" | "evidence";

const TEST_CASE_REVIEW_STATUS_LABELS: Record<NonNullable<TestCase["review_status"]>, string> = {
  not_requested: "Not requested",
  pending: "Pending",
  accepted: "Accepted",
  changes_requested: "Changes requested"
};

const TEST_CASE_WORKFLOW_STATUS_OPTIONS = [
  { value: "ai-generated", label: "AI Generated" },
  { value: "draft", label: "Draft" },
  { value: "pending-review", label: "Pending for review" },
  { value: "active", label: "Active" },
  { value: "ready", label: "Ready" },
  { value: "automated", label: "Automated" },
  { value: "retired", label: "Retired" },
  { value: "passed", label: "Passed" },
  { value: "failed", label: "Failed" }
];

const TEST_CASE_WORKFLOW_STATUS_LABELS = Object.fromEntries(
  TEST_CASE_WORKFLOW_STATUS_OPTIONS.map((option) => [option.value, option.label])
) as Record<string, string>;

const getTestCaseWorkflowStatus = (testCase: TestCase, latestStatus?: string | null, fallbackStatus = "active") => {
  const normalizedLatest = String(latestStatus || "").toLowerCase();

  if (testCase.ai_generation_source === "scheduler" && testCase.ai_generation_review_status === "pending") {
    return "ai-generated";
  }

  if ((testCase.review_status || "not_requested") === "pending") {
    return "pending-review";
  }

  if (normalizedLatest === "failed" || normalizedLatest === "blocked") {
    return "failed";
  }

  if (normalizedLatest === "passed") {
    return "passed";
  }

  if (testCase.automated === "yes") {
    return "automated";
  }

  const normalizedStatus = String(testCase.status || fallbackStatus || "active").toLowerCase();
  return TEST_CASE_WORKFLOW_STATUS_LABELS[normalizedStatus] ? normalizedStatus : "active";
};

const formatTestCaseWorkflowStatus = (value: string) =>
  TEST_CASE_WORKFLOW_STATUS_LABELS[value] || formatTileCardLabel(value, "Active");

const getTestCaseExecutionTypeLabel = (steps: Array<Pick<TestStep, "step_type" | "api_request">> = []) => {
  if (!steps.length) {
    return "Web";
  }

  const types = new Set(steps.map((step) => normalizeStepType(step.step_type)));
  const hasApi = Array.from(types).some((type) => type === "api") || steps.some((step) => Boolean(step.api_request));
  const hasWeb = types.has("web");
  const hasMobile = types.has("android") || types.has("ios");

  if (hasMobile && (hasWeb || hasApi || types.size > 1)) {
    return "Unified";
  }

  if (hasMobile) {
    return "Mobile";
  }

  if (hasApi && !hasWeb) {
    return "API";
  }

  return "Web";
};

function CaseLabelsField({
  value,
  onChange,
  availableLabels
}: {
  value: string;
  onChange: (value: string) => void;
  availableLabels: string[];
}) {
  const [draftLabel, setDraftLabel] = useState("");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const selectedLabels = useMemo(() => parseReferenceList(value), [value]);
  const filteredLabels = useMemo(() => {
    const search = draftLabel.trim().toLowerCase();
    const selected = new Set(selectedLabels.map((label) => label.toLowerCase()));
    return availableLabels
      .filter((label) => !selected.has(label.toLowerCase()))
      .filter((label) => !search || label.toLowerCase().includes(search));
  }, [availableLabels, draftLabel, selectedLabels]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!pickerRef.current?.contains(event.target as Node | null)) {
        setIsMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const commitLabel = (label: string) => {
    const normalizedLabel = label.trim();

    if (!normalizedLabel) {
      return;
    }

    if (!selectedLabels.some((item) => item.toLowerCase() === normalizedLabel.toLowerCase())) {
      onChange(formatReferenceList([...selectedLabels, normalizedLabel]));
    }

    setDraftLabel("");
    setIsMenuOpen(false);
  };

  const removeLabel = (labelToRemove: string) => {
    onChange(formatReferenceList(selectedLabels.filter((label) => label.toLowerCase() !== labelToRemove.toLowerCase())));
  };

  return (
    <FormField label="Labels">
      <div className="requirement-label-picker" ref={pickerRef}>
        <div className="requirement-label-combobox">
          <div className="requirement-label-entry">
            <input
              aria-autocomplete="list"
              aria-expanded={isMenuOpen}
              aria-label="Select or add labels"
              placeholder="Select or add label"
              role="combobox"
              value={draftLabel}
              onChange={(event) => {
                setDraftLabel(event.target.value);
                setIsMenuOpen(true);
              }}
              onFocus={() => setIsMenuOpen(true)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitLabel(draftLabel);
                }

                if (event.key === "Escape") {
                  setIsMenuOpen(false);
                }
              }}
            />
            {draftLabel.trim() ? (
              <button className="ghost-button requirement-label-add-button" onClick={() => commitLabel(draftLabel)} type="button">
                Add
              </button>
            ) : null}
          </div>
          {isMenuOpen && (filteredLabels.length || draftLabel.trim()) ? (
            <div className="requirement-label-menu" role="listbox" aria-label="Available labels">
              {filteredLabels.map((label) => (
                <button className="requirement-label-menu-option" key={label} onClick={() => commitLabel(label)} role="option" type="button">
                  {label}
                </button>
              ))}
              {draftLabel.trim() && !filteredLabels.some((label) => label.toLowerCase() === draftLabel.trim().toLowerCase()) ? (
                <button className="requirement-label-menu-option is-add" onClick={() => commitLabel(draftLabel)} role="option" type="button">
                  Add "{draftLabel.trim()}"
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        {selectedLabels.length ? (
          <div className="requirement-label-chip-row">
            {selectedLabels.map((label) => (
              <span className="requirement-label-chip" key={label}>
                {label}
                <button aria-label={`Remove ${label}`} onClick={() => removeLabel(label)} type="button">x</button>
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </FormField>
  );
}

const createEmptyCaseDraft = (defaultStatus = "active", defaultAutomated: "yes" | "no" = "no"): TestCaseDraft => ({
  title: "",
  description: "",
  externalReferencesText: "",
  labelsText: "",
  automated: defaultAutomated,
  priority: 3,
  status: defaultStatus,
  requirement_id: "",
  module_id: "",
  reviewer_id: "",
  customFields: {}
});

const TEST_CASE_CORE_SCHEMA_KEYS = [
  "test_type",
  "test_status",
  "automation_status",
  "business_criticality",
  "coverage_score",
  "ai_review_state",
  "expected_result_summary",
  "requirement_coverage_state",
  "steps_count"
];

const EMPTY_STEP_DRAFT: StepDraft = {
  action: "",
  expected_result: "",
  step_type: "web",
  automation_code: "",
  api_request: null
};

const executionHistoryDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit"
});

const createDefaultTestCaseSections = (): Record<TestCaseEditorSectionKey, boolean> => ({
  case: false,
  preconditions: false,
  steps: true,
  automation: false,
  history: false
});

const createCreateModeTestCaseSections = (): Record<TestCaseEditorSectionKey, boolean> => ({
  case: true,
  preconditions: false,
  steps: true,
  automation: false,
  history: false
});

const createDraftStepId = () =>
  globalThis.crypto?.randomUUID?.() || `draft-step-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const createDraftGroupId = () =>
  globalThis.crypto?.randomUUID?.() || `draft-group-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const calculateTestCaseAiQualityScore = ({
  title,
  description,
  steps,
  requirementId,
  labels,
  parameterValues
}: {
  title: string;
  description?: string | null;
  steps: Array<Pick<TestStep, "action" | "expected_result" | "step_type" | "automation_code" | "api_request">> | DraftTestStep[];
  requirementId?: string | null;
  labels?: string[];
  parameterValues?: Record<string, string>;
}) => {
  let score = 8;
  const plainTitle = richTextToPlainText(title);
  const plainDescription = richTextToPlainText(description || "");
  const meaningfulSteps = steps.filter((step) => richTextToPlainText(step.action || "").trim() || richTextToPlainText(step.expected_result || "").trim());
  const completeSteps = meaningfulSteps.filter((step) => richTextToPlainText(step.action || "").trim() && richTextToPlainText(step.expected_result || "").trim());
  const automationReadySteps = meaningfulSteps.filter((step) => {
    const hasAutomationCode = "automation_code" in step && richTextToPlainText(step.automation_code || "").trim();
    const hasApiRequest = "api_request" in step && step.api_request;
    return hasAutomationCode || hasApiRequest;
  });
  const parameterCount = Object.keys(parameterValues || {}).filter((key) => key.trim()).length;

  if (plainTitle.length >= 8) score += 12;
  if (plainTitle.length >= 28) score += 4;
  if (plainDescription.length >= 40) score += 14;
  if (plainDescription.length >= 120) score += 6;
  if (requirementId) score += 12;
  if (labels?.length) score += Math.min(10, labels.length * 4);
  if (meaningfulSteps.length) score += Math.min(22, meaningfulSteps.length * 5);
  if (meaningfulSteps.length && completeSteps.length === meaningfulSteps.length) score += 14;
  if (parameterCount) score += Math.min(8, parameterCount * 4);
  if (automationReadySteps.length) score += Math.min(8, automationReadySteps.length * 3);

  return Math.max(0, Math.min(100, score));
};

const buildTestCaseQualitySuggestions = ({
  title,
  description,
  steps,
  requirementId,
  labels,
  parameterValues
}: {
  title: string;
  description?: string | null;
  steps: Array<Pick<TestStep, "action" | "expected_result" | "step_type" | "automation_code" | "api_request">> | DraftTestStep[];
  requirementId?: string | null;
  labels?: string[];
  parameterValues?: Record<string, string>;
}) => {
  const suggestions: string[] = [];
  const plainTitle = richTextToPlainText(title);
  const plainDescription = richTextToPlainText(description || "");
  const meaningfulSteps = steps.filter((step) => richTextToPlainText(step.action || "").trim() || richTextToPlainText(step.expected_result || "").trim());
  const incompleteSteps = meaningfulSteps.filter((step) => !richTextToPlainText(step.action || "").trim() || !richTextToPlainText(step.expected_result || "").trim());
  const parameterCount = Object.keys(parameterValues || {}).filter((key) => key.trim()).length;

  if (plainTitle.length < 28) suggestions.push("Make the title describe the business condition and expected outcome.");
  if (plainDescription.length < 120) suggestions.push("Add a richer description with scope, entry criteria, and validation intent.");
  if (!requirementId) suggestions.push("Link the test case to a requirement so coverage remains traceable.");
  if (!labels?.length) suggestions.push("Add labels for area, risk, platform, or release slicing.");
  if (meaningfulSteps.length < 3) suggestions.push("Add enough ordered steps to make the case independently executable.");
  if (incompleteSteps.length) suggestions.push("Complete both action and expected result for every step.");
  if (!parameterCount) suggestions.push("Capture reusable test data or parameters where the case depends on specific values.");

  return suggestions;
};

const TEST_CASE_PARAMETER_DRAFT_STORAGE_KEY = "qaira.testCaseParameterDrafts.v1";
const SUITE_PARAMETER_DRAFT_STORAGE_KEY = "qaira.suiteParameterDrafts.v1";
const RUN_PARAMETER_PREVIEW_STORAGE_KEY = "qaira.runParameterPreviewDrafts.v1";
const TEST_CASE_RUN_POLL_INTERVAL_MS = 20_000;

const normalizeScopedParameterValues = (
  values?: Record<string, unknown> | null,
  scope: StepParameterScope = "t"
) => normalizeStepParameterValues((values || {}) as Record<string, string>, scope);

const normalizeTestCaseParameterValues = (values?: Record<string, unknown> | null) =>
  normalizeScopedParameterValues(values, "t");

const normalizeSuiteParameterValues = (values?: Record<string, unknown> | null) =>
  normalizeScopedParameterValues(values, "s");

const normalizeRunParameterValues = (values?: Record<string, unknown> | null) =>
  normalizeScopedParameterValues(values, "r");

const serializeScopedParameterValues = (
  values?: Record<string, unknown> | null,
  scope: StepParameterScope = "t"
) =>
  JSON.stringify(
    Object.entries(normalizeScopedParameterValues(values, scope))
      .sort(([left], [right]) => left.localeCompare(right))
  );

const serializeTestCaseParameterValues = (values?: Record<string, unknown> | null) =>
  serializeScopedParameterValues(values, "t");

const areTestCaseParameterValuesEqual = (
  left?: Record<string, unknown> | null,
  right?: Record<string, unknown> | null
) => serializeTestCaseParameterValues(left) === serializeTestCaseParameterValues(right);

const areSuiteParameterValuesEqual = (
  left?: Record<string, unknown> | null,
  right?: Record<string, unknown> | null
) => serializeScopedParameterValues(left, "s") === serializeScopedParameterValues(right, "s");

const readStoredParameterDrafts = (storageKey: string, scope: StepParameterScope = "t") => {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const stored = window.localStorage.getItem(storageKey);

    if (!stored) {
      return {};
    }

    const parsed = JSON.parse(stored);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.entries(parsed).reduce<Record<string, Record<string, string>>>((next, [scopeKey, values]) => {
      next[scopeKey] = normalizeScopedParameterValues(values as Record<string, unknown>, scope);
      return next;
    }, {});
  } catch {
    return {};
  }
};

const writeStoredParameterDrafts = (storageKey: string, drafts: Record<string, Record<string, string>>) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(drafts));
  } catch {
    // Ignore storage failures and keep the in-memory editor responsive.
  }
};

const readStoredTestCaseParameterDrafts = () => readStoredParameterDrafts(TEST_CASE_PARAMETER_DRAFT_STORAGE_KEY, "t");
const readStoredSuiteParameterDrafts = () => readStoredParameterDrafts(SUITE_PARAMETER_DRAFT_STORAGE_KEY, "s");
const readStoredRunParameterDrafts = () => readStoredParameterDrafts(RUN_PARAMETER_PREVIEW_STORAGE_KEY, "r");

const readStoredParameterDraft = (
  storageKey: string,
  scopeKey: string,
  scope: StepParameterScope = "t"
) => {
  if (!scopeKey) {
    return {};
  }

  const drafts = readStoredParameterDrafts(storageKey, scope);
  return normalizeScopedParameterValues(drafts[scopeKey], scope);
};

const hasStoredParameterDraft = (
  storageKey: string,
  scopeKey: string,
  scope: StepParameterScope = "t"
) => {
  if (!scopeKey) {
    return false;
  }

  const drafts = readStoredParameterDrafts(storageKey, scope);
  return Object.prototype.hasOwnProperty.call(drafts, scopeKey);
};

const writeStoredParameterDraft = (
  storageKey: string,
  scopeKey: string,
  values: Record<string, string>,
  scope: StepParameterScope = "t"
) => {
  if (!scopeKey) {
    return;
  }

  const drafts = readStoredParameterDrafts(storageKey, scope);
  drafts[scopeKey] = normalizeScopedParameterValues(values, scope);
  writeStoredParameterDrafts(storageKey, drafts);
};

const clearStoredParameterDraft = (
  storageKey: string,
  scopeKey: string,
  scope: StepParameterScope = "t"
) => {
  if (!scopeKey || typeof window === "undefined") {
    return;
  }

  try {
    const drafts = readStoredParameterDrafts(storageKey, scope);

    if (!(scopeKey in drafts)) {
      return;
    }

    delete drafts[scopeKey];

    if (Object.keys(drafts).length) {
      writeStoredParameterDrafts(storageKey, drafts);
    } else {
      window.localStorage.removeItem(storageKey);
    }
  } catch {
    // Ignore storage failures and keep the in-memory editor responsive.
  }
};

const readStoredTestCaseParameterDraft = (scopeKey: string) => readStoredParameterDraft(TEST_CASE_PARAMETER_DRAFT_STORAGE_KEY, scopeKey, "t");
const hasStoredTestCaseParameterDraft = (scopeKey: string) => hasStoredParameterDraft(TEST_CASE_PARAMETER_DRAFT_STORAGE_KEY, scopeKey, "t");
const writeStoredTestCaseParameterDraft = (scopeKey: string, values: Record<string, string>) =>
  writeStoredParameterDraft(TEST_CASE_PARAMETER_DRAFT_STORAGE_KEY, scopeKey, values, "t");
const clearStoredTestCaseParameterDraft = (scopeKey: string) => clearStoredParameterDraft(TEST_CASE_PARAMETER_DRAFT_STORAGE_KEY, scopeKey, "t");
const readStoredSuiteParameterDraft = (scopeKey: string) => readStoredParameterDraft(SUITE_PARAMETER_DRAFT_STORAGE_KEY, scopeKey, "s");
const hasStoredSuiteParameterDraft = (scopeKey: string) => hasStoredParameterDraft(SUITE_PARAMETER_DRAFT_STORAGE_KEY, scopeKey, "s");
const writeStoredSuiteParameterDraft = (scopeKey: string, values: Record<string, string>) =>
  writeStoredParameterDraft(SUITE_PARAMETER_DRAFT_STORAGE_KEY, scopeKey, values, "s");
const clearStoredSuiteParameterDraft = (scopeKey: string) => clearStoredParameterDraft(SUITE_PARAMETER_DRAFT_STORAGE_KEY, scopeKey, "s");
const readStoredRunParameterDraft = (scopeKey: string) => readStoredParameterDraft(RUN_PARAMETER_PREVIEW_STORAGE_KEY, scopeKey, "r");
const writeStoredRunParameterDraft = (scopeKey: string, values: Record<string, string>) =>
  writeStoredParameterDraft(RUN_PARAMETER_PREVIEW_STORAGE_KEY, scopeKey, values, "r");
const clearStoredRunParameterDraft = (scopeKey: string) => clearStoredParameterDraft(RUN_PARAMETER_PREVIEW_STORAGE_KEY, scopeKey, "r");

const buildTestCaseParameterDraftScopeKey = ({
  isCreating,
  testCaseId,
  appTypeId
}: {
  isCreating: boolean;
  testCaseId?: string | null;
  appTypeId?: string | null;
}) => {
  if (isCreating) {
    return `draft:${appTypeId || "global"}`;
  }

  return testCaseId ? `case:${testCaseId}` : "";
};

const buildSuiteParameterDraftScopeKey = (suiteId?: string | null) => (suiteId ? `suite:${suiteId}` : "");
const buildRunParameterDraftScopeKey = (appTypeId?: string | null) => `run:${appTypeId || "global"}`;

const normalizeSharedGroupComparableText = (value?: string | null) =>
  richTextToPlainText(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

const normalizeComparableAutomationCode = (value?: string | null) => normalizeAutomationCode(value).trim();

const normalizeComparableApiRequest = (value?: TestStep["api_request"]) =>
  JSON.stringify(normalizeApiRequest(value) || null);

const buildAuthoringLensCode = (title: string, steps: AuthoringStepProjection[], emptyMessage: string) => {
  if (!steps.length) {
    return `// ${emptyMessage}`;
  }

  const caseTitle = title.trim() || "Test case";
  const blocks = steps.map((step) => {
    const stepType = normalizeStepType(step.step_type);
    const stepLabel = [`Step ${step.step_order}`, stepType.toUpperCase()].join(" · ");
    const action = richTextToPlainText(step.action || "").trim();
    const expected = richTextToPlainText(step.expected_result || "").trim();

    return [
      `// ${stepLabel}`,
      action ? `// Manual action: ${action}` : "",
      expected ? `// Expected result: ${expected}` : "",
      resolveStepAutomationCode(step)
    ].filter(Boolean).join("\n");
  });

  return [`// Test case: ${caseTitle}`, ...blocks].join("\n\n");
};

const areComparableStepAutomationEqual = (
  left: Pick<TestStep, "step_type" | "automation_code" | "api_request">,
  right: Pick<TestStep, "step_type" | "automation_code" | "api_request">
) =>
  normalizeStepType(left.step_type) === normalizeStepType(right.step_type)
  && normalizeComparableAutomationCode(left.automation_code) === normalizeComparableAutomationCode(right.automation_code)
  && normalizeComparableApiRequest(left.api_request) === normalizeComparableApiRequest(right.api_request);

const normalizeDraftSteps = (steps: DraftTestStep[]) =>
  steps
    .map((step, index) => ({
      step_order: index + 1,
      action: step.action.trim(),
      expected_result: step.expected_result.trim(),
      step_type: normalizeStepType(step.step_type),
      automation_code: normalizeAutomationCode(step.automation_code) || undefined,
      api_request: normalizeApiRequest(step.api_request) || undefined,
      group_id: step.group_id || undefined,
      group_name: step.group_name?.trim() || undefined,
      group_kind: step.group_kind || undefined,
      reusable_group_id: step.reusable_group_id || undefined
    }))
    .filter((step) => richTextToPlainText(step.action).trim() || richTextToPlainText(step.expected_result).trim());

const buildDraftStepsFromAiAuthoringPreview = (preview: AiAuthoredTestCasePreview): DraftTestStep[] =>
  preview.steps.map((step) => ({
    id: createDraftStepId(),
    action: step.action || "",
    expected_result: step.expected_result || "",
    step_type: normalizeStepType(step.step_type),
    automation_code: "",
    api_request: null,
    group_id: null,
    group_name: null,
    group_kind: null,
    reusable_group_id: null
  }));

const buildPersistedStepsFromAiAuthoringPreview = (preview: AiAuthoredTestCasePreview) =>
  preview.steps.map((step) => ({
    step_order: step.step_order,
    step_type: normalizeStepType(step.step_type),
    action: step.action || undefined,
    expected_result: step.expected_result || undefined
  }));

const normalizeCopiedSteps = (
  steps: Array<Pick<TestStep, "action" | "expected_result" | "step_type" | "automation_code" | "api_request" | "group_id" | "group_name" | "group_kind" | "reusable_group_id">>,
  mode: "copy" | "cut"
): CopiedTestStep[] =>
  steps.map((step) => {
    if (mode === "cut") {
      return {
        action: step.action || "",
        expected_result: step.expected_result || "",
        step_type: normalizeStepType(step.step_type),
        automation_code: normalizeAutomationCode(step.automation_code),
        api_request: normalizeApiRequest(step.api_request),
        group_id: step.group_id || null,
        group_name: step.group_name || null,
        group_kind: step.group_kind || null,
        reusable_group_id: step.reusable_group_id || null
      };
    }

    return {
      action: step.action || "",
      expected_result: step.expected_result || "",
      step_type: normalizeStepType(step.step_type),
      automation_code: normalizeAutomationCode(step.automation_code),
      api_request: normalizeApiRequest(step.api_request),
      group_id: null,
      group_name: null,
      group_kind: null,
      reusable_group_id: null
    };
  });

const materializeCopiedSteps = (steps: CopiedTestStep[]) => {
  const nextGroupIds = new Map<string, string>();

  return steps.map((step) => {
    const nextGroupId = step.group_id
      ? (nextGroupIds.get(step.group_id) || createDraftGroupId())
      : null;

    if (step.group_id && nextGroupId && !nextGroupIds.has(step.group_id)) {
      nextGroupIds.set(step.group_id, nextGroupId);
    }

    return {
      ...step,
      group_id: nextGroupId
    };
  });
};

const formatBulkStepActionLabel = (
  step: Pick<TestStep, "action" | "group_id" | "group_name" | "group_kind" | "reusable_group_id">,
  sharedGroupNameById: Record<string, string>
) => {
  const action = step.action || "";

  if (step.reusable_group_id) {
    const sharedName = sharedGroupNameById[step.reusable_group_id] || step.group_name || "Shared steps";
    return `[Shared: ${sharedName}]${action ? ` ${action}` : ""}`;
  }

  if (step.group_id || (step.group_kind === "local" && step.group_name)) {
    return `[Group: ${step.group_name || "Grouped steps"}]${action ? ` ${action}` : ""}`;
  }

  return action;
};

function TestCaseActionIcon({ children }: { children: ReactNode }) {
  return (
    <svg aria-hidden="true" fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="16">
      {children}
    </svg>
  );
}

function TestCaseImportIcon() {
  return (
    <TestCaseActionIcon>
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </TestCaseActionIcon>
  );
}

function TestCaseExportIcon() {
  return (
    <TestCaseActionIcon>
      <path d="M12 21V9" />
      <path d="m17 14-5-5-5 5" />
      <path d="M5 3h14" />
    </TestCaseActionIcon>
  );
}

function TestCaseSparkIcon() {
  return (
    <TestCaseActionIcon>
      <path d="m12 3 1.8 4.7L18 9.5l-4.2 1.8L12 16l-1.8-4.7L6 9.5l4.2-1.8Z" />
    </TestCaseActionIcon>
  );
}

function TestCaseCreateIcon() {
  return (
    <TestCaseActionIcon>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </TestCaseActionIcon>
  );
}

function TestCaseDropdownIcon() {
  return (
    <TestCaseActionIcon>
      <path d="m6 9 6 6 6-6" />
    </TestCaseActionIcon>
  );
}

type TestCaseSplitAction = {
  label: string;
  description?: string;
  icon: ReactNode;
  disabled?: boolean;
  onClick: () => void;
};

function TestCaseSplitActionButton({
  label,
  icon,
  tone = "blue",
  disabled,
  onClick,
  menuLabel,
  actions
}: {
  label: string;
  icon: ReactNode;
  tone?: "blue" | "green";
  disabled?: boolean;
  onClick: () => void;
  menuLabel: string;
  actions: TestCaseSplitAction[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const availableActions = actions.filter((action) => !action.disabled);
  const canOpenMenu = availableActions.length > 0;

  useEffect(() => {
    if (!isOpen) {
      setMenuStyle(null);
      return;
    }

    const updateMenuPosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const menuWidth = Math.max(menuRef.current?.offsetWidth || 292, 292);
      const menuHeight = menuRef.current?.offsetHeight || 190;
      const viewportPadding = 10;
      const left = Math.min(Math.max(viewportPadding, rect.right - menuWidth), window.innerWidth - menuWidth - viewportPadding);
      const top = rect.bottom + 8 + menuHeight > window.innerHeight - viewportPadding
        ? Math.max(viewportPadding, rect.top - menuHeight - 8)
        : rect.bottom + 8;

      setMenuStyle({
        left,
        top,
        minWidth: "18.25rem",
        maxWidth: "min(calc(100vw - 1.25rem), 23rem)",
        opacity: 1
      });
    };

    updateMenuPosition();
    const frameId = window.requestAnimationFrame(updateMenuPosition);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setIsOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const menu = isOpen && canOpenMenu ? (
    <div className={["run-action-dropdown test-case-action-dropdown", tone === "green" ? "test-case-run-action-dropdown" : ""].filter(Boolean).join(" ")} ref={menuRef} role="menu" style={menuStyle || { opacity: 0, pointerEvents: "none" }}>
      {actions.map((action) => (
        <button
          disabled={action.disabled}
          key={action.label}
          onClick={() => {
            setIsOpen(false);
            action.onClick();
          }}
          role="menuitem"
          type="button"
        >
          <span className="run-action-option-icon">{action.icon}</span>
          <span className="run-action-option-copy">
            <span className="run-action-option-title">
              <strong>{action.label}</strong>
              {action.description ? <InfoTooltip content={action.description} label={`${action.label} details`} trigger="span" /> : null}
            </span>
          </span>
        </button>
      ))}
    </div>
  ) : null;

  return (
    <div className={["create-run-action-button", tone === "blue" ? "test-case-split-action-button" : "test-case-run-split-action-button"].join(" ")} ref={triggerRef}>
      <button className="run-action-main" disabled={disabled} onClick={onClick} type="button">
        {icon}
        <span>{label}</span>
      </button>
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={menuLabel}
        className="run-action-toggle"
        disabled={!canOpenMenu}
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <TestCaseDropdownIcon />
      </button>
      {menu ? createPortal(menu, document.body) : null}
    </div>
  );
}

function TestCaseDeleteIcon() {
  return (
    <TestCaseActionIcon>
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="M7 7v11a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V7" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </TestCaseActionIcon>
  );
}

function TestCaseRunIcon() {
  return (
    <TestCaseActionIcon>
      <path d="m9 7 8 5-8 5z" fill="currentColor" stroke="none" />
    </TestCaseActionIcon>
  );
}

function RunOptionsChevronIcon() {
  return (
    <TestCaseActionIcon>
      <path d="m7 10 5 5 5-5" />
    </TestCaseActionIcon>
  );
}

function ModuleChevronIcon() {
  return (
    <TestCaseActionIcon>
      <path d="m9 6 6 6-6 6" />
    </TestCaseActionIcon>
  );
}

function ModulePencilIcon() {
  return (
    <TestCaseActionIcon>
      <path d="M4 20h4" />
      <path d="M14.5 5.5 18.5 9.5" />
      <path d="m6 18 10.5-10.5a2.1 2.1 0 0 1 3 3L9 21H6z" />
    </TestCaseActionIcon>
  );
}

function TestCaseFlowMapIcon() {
  return (
    <TestCaseActionIcon>
      <rect height="4" rx="1" width="7" x="8.5" y="3.5" />
      <rect height="4" rx="1" width="7" x="3" y="16.5" />
      <rect height="4" rx="1" width="7" x="14" y="16.5" />
      <path d="M12 7.5v4.5" />
      <path d="M6.5 16.5V12H17.5v4.5" />
    </TestCaseActionIcon>
  );
}

function TestCaseAcceptIcon() {
  return (
    <TestCaseActionIcon>
      <path d="M6 12.5 10 16l8-8" />
    </TestCaseActionIcon>
  );
}

function TestCaseRejectIcon() {
  return (
    <TestCaseActionIcon>
      <path d="m8 8 8 8" />
      <path d="m16 8-8 8" />
    </TestCaseActionIcon>
  );
}

function TestCaseTileActionButton({
  children,
  className = "",
  disabled = false,
  onClick,
  title
}: {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      aria-label={title}
      className={["test-case-tile-action-button", className].filter(Boolean).join(" ")}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      title={title}
      type="button"
    >
      {children}
    </button>
  );
}

const formatExecutionHistoryDate = (value?: string | null) => {
  if (!value) {
    return "Recent run";
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : executionHistoryDateFormatter.format(parsed);
};

function resolveScopedIntegration(integrations: Integration[], type: Integration["type"], projectId: string) {
  const active = integrations.filter((integration) => integration.type === type && integration.is_active);
  const scoped = projectId
    ? active.find((integration) => String(integration.config?.project_id || "") === projectId)
    : null;

  return scoped || active.find((integration) => !String(integration.config?.project_id || "").trim()) || active[0] || null;
}

function formatRecorderDisplayMode(value?: string | null) {
  return value === "browser-live-view" ? "Live view" : value === "local-browser-with-live-view" ? "Local browser + live view" : "Recorder";
}

export function TestCasesPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
	  const [searchParams, setSearchParams] = useSearchParams();
	  const { session } = useAuth();
	  const featureFlagsQuery = useFeatureFlags(Boolean(session));
	  const canCreateTestCases = hasPermission(session, "testcase.create");
	  const canImportTestCases = hasPermission(session, "testcase.import");
	  const canUpdateTestCases = hasPermission(session, "testcase.update");
	  const canDeleteTestCases = hasPermission(session, "testcase.delete");
	  const canViewAttachments = hasPermission(session, "attachment.view");
	  const canCreateAttachments = hasPermission(session, "attachment.create");
	  const canDeleteAttachments = hasPermission(session, "attachment.delete");
	  const canExportTestCases = hasPermission(session, "testcase.export");
	  const canUseTestCaseAi = hasPermission(session, "testcase.ai")
	    && areFeatureFlagsEnabled(featureFlagsQuery.data, ["qaira.ai.test_authoring"]);
	  const canCreateSuites = hasPermission(session, "suite.create");
	  const canUpdateSuites = hasPermission(session, "suite.update");
	  const canCreateRuns = hasPermission(session, "run.create")
	    && areFeatureFlagsEnabled(featureFlagsQuery.data, ["qaira.manual.runs"]);
	  const canUseAutomationWorkspace = areFeatureFlagsEnabled(featureFlagsQuery.data, ["qaira.automation.workspace"]);
	  const canBuildAutomation = hasPermission(session, "automation.build")
	    && canUseAutomationWorkspace
	    && areFeatureFlagsEnabled(featureFlagsQuery.data, ["qaira.automation.builder"]);
	  const canUseAutomationAi = hasPermission(session, "automation.ai")
	    && canUseAutomationWorkspace
	    && areFeatureFlagsEnabled(featureFlagsQuery.data, ["qaira.ai.automation"]);
	  const canUseRecorder = hasPermission(session, "automation.recorder")
	    && canUseAutomationWorkspace
	    && areFeatureFlagsEnabled(featureFlagsQuery.data, ["qaira.automation.step_recording"]);
	  const canRunLocalAutomation = hasPermission(session, "automation.run.local")
	    && canUseAutomationWorkspace
	    && areFeatureFlagsEnabled(featureFlagsQuery.data, ["qaira.automation.local_execution"]);
	  const canRunRemoteAutomation = hasPermission(session, "automation.run.remote")
	    && canUseAutomationWorkspace
	    && areFeatureFlagsEnabled(featureFlagsQuery.data, ["qaira.automation.remote_execution"]);
	  const canViewAutomationCode = hasPermission(session, "automation.code.view")
	    && canUseAutomationWorkspace
	    && areFeatureFlagsEnabled(featureFlagsQuery.data, ["qaira.automation.step_code"]);
	  const { getPrompt } = useAiPromptRegistry(Boolean(session));
  const { confirmAction, confirmDelete, confirmationDialog } = useDeleteConfirmation();
  const domainMetadataQuery = useDomainMetadata();
  const [projectId] = useCurrentProject();
  const [appTypeId, setAppTypeId] = useCurrentAppType(projectId);
  const [selectedTestCaseId, setSelectedTestCaseId] = useState("");
  const [activeTestCaseDetailTab, setActiveTestCaseDetailTab] = useState<TestCaseDetailTab>("details");
  const [searchTerm, setSearchTerm] = useState("");
  const [catalogViewMode, setCatalogViewMode] = useState<"tile" | "list">(() => readDefaultCatalogViewMode());
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [visibleTestCaseCount, setVisibleTestCaseCount] = useState(TEST_CASE_RENDER_BATCH_SIZE);
  const [caseStatusFilter, setCaseStatusFilter] = useState("all");
  const [casePriorityFilter, setCasePriorityFilter] = useState("all");
  const [caseStepFilter, setCaseStepFilter] = useState<CaseStepFilter>("all");
  const [caseRunFilter, setCaseRunFilter] = useState<CaseRunFilter>("all");
  const [isCreating, setIsCreating] = useState(false);
  const [selectedActionTestCaseIds, setSelectedActionTestCaseIds] = useState<string[]>([]);
  const [linkedPreviewCaseId, setLinkedPreviewCaseId] = useState("");
  const [isDeletingSelectedTestCases, setIsDeletingSelectedTestCases] = useState(false);
  const [isCreateSuiteModalOpen, setIsCreateSuiteModalOpen] = useState(false);
  const [isCreateModuleModalOpen, setIsCreateModuleModalOpen] = useState(false);
  const [moduleDraftName, setModuleDraftName] = useState("");
  const [moduleDraftDescription, setModuleDraftDescription] = useState("");
  const [collapsedModuleIds, setCollapsedModuleIds] = useState<string[]>([]);
  const [selectedModuleIds, setSelectedModuleIds] = useState<string[]>([]);
  const [renamingModuleId, setRenamingModuleId] = useState("");
  const [renamingModuleName, setRenamingModuleName] = useState("");
  const [draggingCaseIds, setDraggingCaseIds] = useState<string[]>([]);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewSuggestionCaseId, setReviewSuggestionCaseId] = useState("");
  const [reviewSuggestionComment, setReviewSuggestionComment] = useState("");
  const [reviewSuggestionConfirmed, setReviewSuggestionConfirmed] = useState(true);
  const [isQualitySuggestionModalOpen, setIsQualitySuggestionModalOpen] = useState(false);
  const [isSuiteTransferModalOpen, setIsSuiteTransferModalOpen] = useState(false);
  const [suiteTransferAction, setSuiteTransferAction] = useState<SuiteTransferAction>("move");
  const [suiteTransferCaseIds, setSuiteTransferCaseIds] = useState<string[]>([]);
  const [suiteTransferProjectId, setSuiteTransferProjectId] = useState("");
  const [suiteTransferAppTypeId, setSuiteTransferAppTypeId] = useState("");
  const [suiteTransferSuiteIds, setSuiteTransferSuiteIds] = useState<string[]>([]);
  const [isCreateExecutionModalOpen, setIsCreateExecutionModalOpen] = useState(false);
  const [executionName, setExecutionName] = useState("");
  const [selectedExecutionEnvironmentId, setSelectedExecutionEnvironmentId] = useState("");
  const [selectedExecutionConfigurationId, setSelectedExecutionConfigurationId] = useState("");
  const [selectedExecutionDataSetId, setSelectedExecutionDataSetId] = useState("");
  const [selectedExecutionAssigneeIds, setSelectedExecutionAssigneeIds] = useState<string[]>([]);
  const [executionRelease, setExecutionRelease] = useState("");
  const [executionSprint, setExecutionSprint] = useState("");
  const [executionBuild, setExecutionBuild] = useState("");
  const [executionStartMode, setExecutionStartMode] = useState<ExecutionStartMode>("manual");
  const [executionParallelEnabled, setExecutionParallelEnabled] = useState(false);
  const [executionParallelCount, setExecutionParallelCount] = useState(1);
  const [automationStartUrl, setAutomationStartUrl] = useState("");
  const [automationContext, setAutomationContext] = useState("");
  const [automationFailureThreshold, setAutomationFailureThreshold] = useState(3);
  const [recorderSession, setRecorderSession] = useState<RecorderSessionResponse | null>(null);
  const [recorderSessionCaseId, setRecorderSessionCaseId] = useState("");
  const [recorderStartOptions, setRecorderStartOptions] = useState<RecorderStartOptions | null>(null);
  const [recentRecorderCompletedCaseId, setRecentRecorderCompletedCaseId] = useState("");
  const [expandedSections, setExpandedSections] = useState<Record<TestCaseEditorSectionKey, boolean>>(createDefaultTestCaseSections);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");
  const lastCaseDraftSeedRef = useRef("");
  const lastTestCaseParameterSeedRef = useRef("");
  const generationJobAlertScopeRef = useRef("");
  const surfacedGenerationJobFailureIdsRef = useRef<Set<string>>(new Set());
  const defaultTestCaseStatus = domainMetadataQuery.data?.test_cases.default_status || "active";
  const defaultTestCaseAutomated = (domainMetadataQuery.data?.test_cases.default_automated || "no") as "yes" | "no";
  const testCaseStatusOptions = domainMetadataQuery.data?.test_cases.statuses || [];
  const testCaseAutomatedOptions = domainMetadataQuery.data?.test_cases.automated_options || [
    { value: "no", label: "No" },
    { value: "yes", label: "Yes" }
  ];
  const testCaseFieldCatalog = domainMetadataQuery.data?.field_catalogs?.testCase;
  const emptyCaseDraft = useMemo(
    () => createEmptyCaseDraft(defaultTestCaseStatus, defaultTestCaseAutomated),
    [defaultTestCaseAutomated, defaultTestCaseStatus]
  );
  const [caseDraft, setCaseDraft] = useState<TestCaseDraft>(() => createEmptyCaseDraft());
  const [newStepDraft, setNewStepDraft] = useState<StepDraft>(EMPTY_STEP_DRAFT);
  const [stepInsertIndex, setStepInsertIndex] = useState<number | null>(null);
  const [stepInsertGroupContext, setStepInsertGroupContext] = useState<StepInsertionGroupContext | null>(null);
  const [draftSteps, setDraftSteps] = useState<DraftTestStep[]>([]);
  const [selectedStepIds, setSelectedStepIds] = useState<string[]>([]);
  const [isCaseParameterDialogOpen, setIsCaseParameterDialogOpen] = useState(false);
  const [testCaseParameterValues, setTestCaseParameterValues] = useState<Record<string, string>>({});
  const [suiteParameterValues, setSuiteParameterValues] = useState<Record<string, string>>({});
  const [runPreviewParameterValues, setRunPreviewParameterValues] = useState<Record<string, string>>({});
  const [selectedParameterSuiteId, setSelectedParameterSuiteId] = useState("");
  const [copiedSteps, setCopiedSteps] = useState<CopiedTestStep[]>([]);
  const [copiedStepMode, setCopiedStepMode] = useState<"copy" | "cut">("copy");
  const [cutStepSource, setCutStepSource] = useState<CutStepSource | null>(null);
  const [expandedStepIds, setExpandedStepIds] = useState<string[]>([]);
  const [expandedStepGroupIds, setExpandedStepGroupIds] = useState<string[]>([]);
  const [stepDrafts, setStepDrafts] = useState<Record<string, StepDraft>>({});
  const [isStepGroupModalOpen, setIsStepGroupModalOpen] = useState(false);
  const [stepGroupName, setStepGroupName] = useState("");
  const [saveAsReusableGroup, setSaveAsReusableGroup] = useState(false);
  const [isSharedGroupPickerOpen, setIsSharedGroupPickerOpen] = useState(false);
  const [selectedSharedGroupId, setSelectedSharedGroupId] = useState("");
  const [sharedGroupSearchTerm, setSharedGroupSearchTerm] = useState("");
  const [isSuiteLinkModalOpen, setIsSuiteLinkModalOpen] = useState(false);
  const [suiteLinkDraftIds, setSuiteLinkDraftIds] = useState<string[]>([]);
  const [editingAutomationStepId, setEditingAutomationStepId] = useState("");
  const [rephrasingStepId, setRephrasingStepId] = useState("");
  const [codePreviewState, setCodePreviewState] = useState<{ title: string; subtitle: string; code: string; objectRepository?: AutomationLearningCacheEntry[] } | null>(null);
  const caseSectionRef = useRef<HTMLDivElement | null>(null);
  const suppressCaseSelectionFromUrlRef = useRef(false);
  const [createSuiteContextId, setCreateSuiteContextId] = useState("");
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importBatches, setImportBatches] = useState<PreparedTestCaseImportBatch[]>([]);
  const [importFileWarnings, setImportFileWarnings] = useState<string[]>([]);
  const [importRequirementId, setImportRequirementId] = useState("");
  const [importSourceSelection, setImportSourceSelection] = useState<TestCaseImportSourceSelection>("auto");
  const [isAiCaseAuthoringOpen, setIsAiCaseAuthoringOpen] = useState(false);
  const [isTestCaseImpactPreviewOpen, setIsTestCaseImpactPreviewOpen] = useState(false);
  const [aiCaseAuthoringRequirementId, setAiCaseAuthoringRequirementId] = useState("");
  const [aiCaseAuthoringAdditionalContext, setAiCaseAuthoringAdditionalContext] = useState("");
  const [aiCaseAuthoringExternalLinksText, setAiCaseAuthoringExternalLinksText] = useState("");
  const [aiCaseAuthoringReferenceImages, setAiCaseAuthoringReferenceImages] = useState<AiDesignImageInput[]>([]);
  const [aiCaseAuthoringPreview, setAiCaseAuthoringPreview] = useState<AiAuthoredTestCasePreview | null>(null);
  const [aiCaseAuthoringMessage, setAiCaseAuthoringMessage] = useState("");
  const [aiCaseAuthoringTone, setAiCaseAuthoringTone] = useState<"success" | "error">("success");
  const [isAiStudioOpen, setIsAiStudioOpen] = useState(false);
  const [aiRequirementIds, setAiRequirementIds] = useState<string[]>([]);
  const [integrationId, setIntegrationId] = useState("");
  const [maxCases, setMaxCases] = useState(3);
  const parallelRequirementLimit = 1;
  const [aiAdditionalContext, setAiAdditionalContext] = useState("");
  const [aiExternalLinksText, setAiExternalLinksText] = useState("");
  const [aiReferenceImages, setAiReferenceImages] = useState<AiDesignImageInput[]>([]);
  const [aiPreviewCases, setAiPreviewCases] = useState<AiDesignedTestCaseCandidate[]>([]);
  const [aiPreviewMessage, setAiPreviewMessage] = useState("");
  const [aiPreviewTone, setAiPreviewTone] = useState<"success" | "error">("success");
  const [schedulerActionCaseId, setSchedulerActionCaseId] = useState("");
  const [schedulerActionKind, setSchedulerActionKind] = useState<"accept" | "reject" | "run" | "run-local" | "run-remote" | "">("");
  const [isRunOptionsOpen, setIsRunOptionsOpen] = useState(false);
  const [inspectingStepId, setInspectingStepId] = useState("");
  const runOptionsRef = useRef<HTMLDivElement | null>(null);

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
  const appTypesQuery = useQuery({
    queryKey: ["app-types", projectId],
    queryFn: () => api.appTypes.list({ project_id: projectId }),
    enabled: Boolean(projectId)
  });
  const allAppTypesQuery = useQuery({
    queryKey: ["app-types", "all"],
    queryFn: () => api.appTypes.list(),
    enabled: Boolean(session)
  });
  const requirementsQuery = useQuery({
    queryKey: ["requirements", projectId],
    queryFn: () => api.requirements.list({ project_id: projectId, page_size: 25 }),
    enabled: Boolean(projectId)
  });
  const suitesQuery = useQuery({
    queryKey: ["test-case-suites", appTypeId],
    queryFn: () => api.testSuites.list({ app_type_id: appTypeId }),
    enabled: Boolean(appTypeId)
  });
  const requestedCaseRouteId = searchParams.get("case") || "";
  const testCasesQuery = useQuery({
    queryKey: ["global-test-cases", appTypeId],
    queryFn: () => api.testCases.list({ app_type_id: appTypeId, page_size: 25, projection: "detail" }),
    enabled: Boolean(appTypeId)
  });
  const testCaseModulesQuery = useQuery({
    queryKey: ["test-case-modules", appTypeId],
    queryFn: () => api.testCaseModules.list({ app_type_id: appTypeId }),
    enabled: Boolean(appTypeId)
  });
  const deepLinkTestCasesQuery = useQuery({
    queryKey: ["global-test-cases", "deep-link", requestedCaseRouteId],
    queryFn: () => api.testCases.list({ projection: "detail" }),
    enabled: Boolean(session && requestedCaseRouteId)
  });
  const generationJobsQuery = useQuery({
    queryKey: ["ai-test-case-generation-jobs", appTypeId],
    queryFn: () => api.testCases.listGenerationJobs({ app_type_id: appTypeId }),
    enabled: Boolean(appTypeId),
    refetchInterval: appTypeId ? 5000 : false
  });
  const executionsQuery = useQuery({
    queryKey: ["executions", projectId],
    queryFn: () => api.executions.list(projectId ? { project_id: projectId } : undefined),
    enabled: Boolean(projectId),
    refetchInterval: TEST_CASE_RUN_POLL_INTERVAL_MS
  });
  const sharedStepGroupsQuery = useQuery({
    queryKey: ["shared-step-groups", appTypeId],
    queryFn: () => api.sharedStepGroups.list({ app_type_id: appTypeId }),
    enabled: Boolean(appTypeId)
  });
  const executionResultsQuery = useQuery({
    queryKey: ["global-test-case-results", appTypeId],
    queryFn: () => api.executionResults.list({ app_type_id: appTypeId }),
    enabled: Boolean(appTypeId),
    refetchInterval: TEST_CASE_RUN_POLL_INTERVAL_MS
  });
  const integrationsQuery = useQuery({
    queryKey: ["integrations", "llm"],
    queryFn: () => api.integrations.list({ type: "llm", is_active: true })
  });
  const testEngineIntegrationsQuery = useQuery({
    queryKey: ["integrations", "testengine", projectId],
    queryFn: () => api.integrations.list({ type: "testengine", is_active: true }),
    enabled: Boolean(projectId && session)
  });
  const automationLearningCacheQuery = useQuery({
    queryKey: ["automation-learning-cache", projectId, appTypeId],
    queryFn: () => api.testCases.learningCache({
      project_id: projectId || undefined,
      app_type_id: appTypeId || undefined,
      limit: 12
    }),
    enabled: Boolean(canUseAutomationWorkspace && (projectId || appTypeId) && session)
  });
  const stepsQuery = useQuery({
    queryKey: ["test-case-steps", selectedTestCaseId],
    queryFn: () => api.testSteps.list({ test_case_id: selectedTestCaseId }),
    enabled: Boolean(selectedTestCaseId)
  });

  const createTestCase = useMutation({ mutationFn: api.testCases.create });
  const createTestCaseModule = useMutation({ mutationFn: api.testCaseModules.create });
  const updateTestCaseModule = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof api.testCaseModules.update>[1] }) =>
      api.testCaseModules.update(id, input)
  });
  const assignCasesToModule = useMutation({
    mutationFn: ({ id, testCaseIds, append }: { id: string; testCaseIds: string[]; append?: boolean }) =>
      api.testCaseModules.assignCases(id, testCaseIds, append ?? true)
  });
  const removeCasesFromModule = useMutation({
    mutationFn: ({ id, testCaseIds }: { id: string; testCaseIds: string[] }) =>
      api.testCaseModules.removeCases(id, testCaseIds)
  });
  const deleteTestCaseModule = useMutation({ mutationFn: api.testCaseModules.delete });
  const reviewTestCase = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof api.testCases.review>[1] }) =>
      api.testCases.review(id, input)
  });
  const createGenerationJob = useMutation({ mutationFn: api.testCases.createGenerationJob });
  const createSuite = useMutation({ mutationFn: api.testSuites.create });
  const updateSuite = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof api.testSuites.update>[1] }) =>
      api.testSuites.update(id, input)
  });
  const assignSuiteCases = useMutation({
    mutationFn: ({ id, testCaseIds }: { id: string; testCaseIds: string[] }) => api.testSuites.assignTestCases(id, testCaseIds)
  });
  const createExecution = useMutation({ mutationFn: api.executions.create });
  const createLocalRun = useMutation({ mutationFn: api.executions.createLocalRun });
  const startExecution = useMutation({ mutationFn: (id: string) => api.executions.start(id) });
  const acceptGeneratedCase = useMutation({ mutationFn: api.testCases.acceptGeneratedCase });
  const rejectGeneratedCase = useMutation({ mutationFn: api.testCases.rejectGeneratedCase });
  const updateTestCase = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof api.testCases.update>[1] }) =>
      api.testCases.update(id, input)
  });
  const persistCaseParameterValues = useMutation({
    mutationFn: ({ id, parameter_values }: { id: string; parameter_values: Record<string, string> }) =>
      api.testCases.update(id, { parameter_values })
  });
  const deleteTestCase = useMutation({ mutationFn: api.testCases.delete });
  const importTestCases = useMutation({ mutationFn: api.testCases.bulkImport });
  const previewCaseAuthoring = useMutation({ mutationFn: api.testCases.previewCaseAuthoring });
  const previewTestCaseImpact = useMutation({
    mutationFn: ({ testCaseId, input }: { testCaseId: string; input: Parameters<typeof api.testCases.previewImpact>[1] }) =>
      api.testCases.previewImpact(testCaseId, input)
  });
  const rephraseStepWithAi = useMutation({ mutationFn: api.testCases.rephraseStep });
  const previewDesignedCases = useMutation({ mutationFn: api.testCases.previewDesignedCases });
  const acceptDesignedCases = useMutation({ mutationFn: api.testCases.acceptDesignedCases });
  const buildSingleAutomation = useMutation({
    mutationFn: ({ testCaseId }: { testCaseId: string }) =>
      api.testCases.queueAutomationGenerator(testCaseId, {
        integration_id: integrationId || undefined,
        start_url: automationStartUrl.trim() || undefined,
        additional_context: automationContext.trim() || undefined,
        test_environment_id: selectedExecutionEnvironmentId || undefined,
        test_configuration_id: selectedExecutionConfigurationId || undefined,
        test_data_set_id: selectedExecutionDataSetId || undefined
      })
  });
  const analyzeAutomationGaps = useMutation({
    mutationFn: async ({ testCaseId }: { testCaseId: string }) =>
      api.testCases.buildAutomation(testCaseId, {
        integration_id: integrationId || undefined,
        start_url: automationStartUrl.trim() || undefined,
        additional_context: [
          automationContext.trim(),
          getPrompt("ai.automation.gap_analysis")
        ].filter(Boolean).join("\n\n"),
        test_environment_id: selectedExecutionEnvironmentId || undefined,
        test_configuration_id: selectedExecutionConfigurationId || undefined,
        test_data_set_id: selectedExecutionDataSetId || undefined
      })
  });
  const buildBatchAutomation = useMutation({
    mutationFn: ({ testCaseIds }: { testCaseIds: string[] }) =>
      api.testCases.buildAutomationBatch({
        app_type_id: appTypeId,
        test_case_ids: testCaseIds,
        integration_id: integrationId || undefined,
        start_url: automationStartUrl.trim() || undefined,
        additional_context: automationContext.trim() || undefined,
        test_environment_id: selectedExecutionEnvironmentId || undefined,
        test_configuration_id: selectedExecutionConfigurationId || undefined,
        test_data_set_id: selectedExecutionDataSetId || undefined,
        failure_threshold: automationFailureThreshold
      })
  });
  const startRecorder = useMutation({
    mutationFn: ({ testCaseId, options, targetStepId }: { testCaseId: string; options: RecorderStartOptions; targetStepId?: string }) =>
      api.testCases.startRecorderSession(testCaseId, {
        start_url: automationStartUrl.trim() || undefined,
        recorder_mode: options.recorder_mode,
        recorder_target: options.recorder_target,
        engine_base_url: options.engine_base_url,
        recorder_public_base_url: options.recorder_public_base_url,
        reuse_existing: options.recorder_mode === "local" && options.recorder_target === "web",
        test_environment_id: selectedExecutionEnvironmentId || undefined,
        test_configuration_id: selectedExecutionConfigurationId || undefined,
        test_data_set_id: selectedExecutionDataSetId || undefined,
        target_step_id: targetStepId || undefined
      })
  });
  const finishRecorder = useMutation({
    mutationFn: ({ testCaseId, sessionId, transactionId, recorderStartOptions, targetStepId }: { testCaseId: string; sessionId: string; transactionId?: string; recorderStartOptions?: RecorderStartOptions | null; targetStepId?: string }) =>
      api.testCases.finishRecorderSession(testCaseId, sessionId, {
        transaction_id: transactionId,
        integration_id: integrationId || undefined,
        additional_context: automationContext.trim() || undefined,
        recorder_mode: recorderStartOptions?.recorder_mode,
        recorder_target: recorderStartOptions?.recorder_target,
        engine_base_url: recorderStartOptions?.engine_base_url,
        test_environment_id: selectedExecutionEnvironmentId || undefined,
        test_configuration_id: selectedExecutionConfigurationId || undefined,
        test_data_set_id: selectedExecutionDataSetId || undefined,
        target_step_id: targetStepId || undefined
      })
  });
  const createStep = useMutation({ mutationFn: api.testSteps.create });
  const groupSteps = useMutation({ mutationFn: api.testSteps.group });
  const ungroupSteps = useMutation({ mutationFn: api.testSteps.ungroup });
  const insertSharedGroup = useMutation({ mutationFn: api.testSteps.insertSharedGroup });
  const createSharedStepGroup = useMutation({ mutationFn: api.sharedStepGroups.create });
  const updateStep = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof api.testSteps.update>[1] }) =>
      api.testSteps.update(id, input)
  });
  const reorderSteps = useMutation({
    mutationFn: ({ testCaseId, stepIds }: { testCaseId: string; stepIds: string[] }) =>
      api.testSteps.reorder(testCaseId, stepIds)
  });
  const deleteStep = useMutation({ mutationFn: api.testSteps.delete });

  const projects = projectsQuery.data || [];
  const users = (usersQuery.data || []) as User[];
  const projectMembers = (projectMembersQuery.data || []) as ProjectMember[];
  const testEngineIntegrations = testEngineIntegrationsQuery.data || [];
  const appTypes = appTypesQuery.data || [];
  const accessibleProjectIds = new Set(projects.map((project) => String(project.id)));
  const allAppTypes = (allAppTypesQuery.data || appTypes).filter((item) => accessibleProjectIds.has(String(item.project_id)));
  const requirements = requirementsQuery.data || [];
  const suites = suitesQuery.data || [];
  const testCases = testCasesQuery.data || [];
  const testCaseModules = testCaseModulesQuery.data || [];
  const deepLinkTestCases = deepLinkTestCasesQuery.data || [];
  const generationJobs = generationJobsQuery.data || [];
  const executions = executionsQuery.data || [];
  const sharedStepGroups = sharedStepGroupsQuery.data || [];
  const executionResults = executionResultsQuery.data || [];
  const integrations = integrationsQuery.data || [];

  const supportsLocalDesktopExecution = Boolean(session && canRunLocalAutomation);
  const userById = useMemo(
    () =>
      users.reduce<Record<string, User>>((accumulator, user) => {
        accumulator[user.id] = user;
        return accumulator;
      }, {}),
    [users]
  );
  const assigneeOptions = useMemo<TestCaseExecutionAssigneeOption[]>(
    () => buildAssigneeOptions(projectMembers, users),
    [projectMembers, users]
  );
  const steps = useMemo(
    () => ((stepsQuery.data || []) as TestStep[]).slice().sort((left, right) => left.step_order - right.step_order),
    [stepsQuery.data]
  );
  const [isVisualBuilderActive, setIsVisualBuilderActive] = useState(false);

  const displaySteps = useMemo(
    () =>
      isCreating
        ? draftSteps.map((step, index) => ({
            id: step.id,
            test_case_id: selectedTestCaseId || "draft",
            step_order: index + 1,
            action: step.action,
            expected_result: step.expected_result,
            step_type: step.step_type,
            automation_code: step.automation_code,
            api_request: step.api_request,
            group_id: step.group_id,
            group_name: step.group_name,
            group_kind: step.group_kind,
            reusable_group_id: step.reusable_group_id
          }))
        : steps,
    [draftSteps, isCreating, selectedTestCaseId, steps]
  );
  const preconditionSteps = useMemo(
    () => displaySteps.filter((step) => (step.group_name || "").toLowerCase() === "preconditions"),
    [displaySteps]
  );
  const mainSteps = useMemo(
    () => displaySteps.filter((step) => (step.group_name || "").toLowerCase() !== "preconditions"),
    [displaySteps]
  );

  const showSuccess = (text: string) => {
    setMessageTone("success");
    setMessage(text);
  };

  const showError = (error: unknown, fallback: string) => {
    setMessageTone("error");
    setMessage(error instanceof Error ? error.message : fallback);
  };

  function syncTestCaseSearchParams(nextCaseId?: string | null) {
    const currentCaseId = searchParams.get("case") || "";
    const targetCaseId = nextCaseId || "";

    if (currentCaseId === targetCaseId) {
      if (!targetCaseId) {
        suppressCaseSelectionFromUrlRef.current = false;
      }
      return;
    }

    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (targetCaseId) {
        next.set("case", targetCaseId);
      } else {
        next.delete("case");
        suppressCaseSelectionFromUrlRef.current = true;
      }
      return next;
    }, { replace: true });
  }

  const openTestCaseWorkspace = (testCaseId: string) => {
    const targetTestCase = testCases.find((item) => item.id === testCaseId) || null;

    syncTestCaseSearchParams(getRoutableId(targetTestCase) || testCaseId);
    setSelectedTestCaseId(testCaseId);
  };

  const resetExecutionContextSelection = () => {
    setSelectedExecutionEnvironmentId("");
    setSelectedExecutionConfigurationId("");
    setSelectedExecutionDataSetId("");
  };

  const closeCreateExecutionModal = () => {
    setIsCreateExecutionModalOpen(false);
    setExecutionName("");
    setSelectedExecutionAssigneeIds([]);
    setExecutionRelease("");
    setExecutionSprint("");
    setExecutionBuild("");
    setExecutionStartMode("manual");
    setExecutionParallelEnabled(false);
    setExecutionParallelCount(1);
    resetExecutionContextSelection();
  };

	  const beginCreateCase = (suiteContextId = "", requirementId = "") => {
	    if (!canCreateTestCases) {
	      showError(new Error("Permission required: testcase.create"), "Unable to create test case");
	      return;
	    }

	    syncTestCaseSearchParams(null);
	    setCreateSuiteContextId(suiteContextId);
    setIsCreating(true);
    setSelectedTestCaseId("");
    setCaseDraft({
      ...emptyCaseDraft,
      requirement_id: requirementId
    });
    setDraftSteps([]);
    setNewStepDraft(EMPTY_STEP_DRAFT);
    setStepInsertIndex(null);
    setStepInsertGroupContext(null);
    setSelectedStepIds([]);
    setExpandedStepIds([]);
    setExpandedStepGroupIds([]);
  };

  useEffect(() => {
    if (!isRunOptionsOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (runOptionsRef.current?.contains(target)) {
        return;
      }

      setIsRunOptionsOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsRunOptionsOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isRunOptionsOpen]);

  useEffect(() => {
    setIsRunOptionsOpen(false);
  }, [selectedTestCaseId]);

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
      return;
    }

    if (!scopedAppTypes.some((item) => item.id === appTypeId)) {
      setAppTypeId(scopedAppTypes[0].id);
    }
  }, [appTypeId, appTypes, appTypesQuery.isPending, projectId, setAppTypeId]);

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
    const requestedProjectId = searchParams.get("project");

    if (!requestedProjectId || projectsQuery.isPending) {
      return;
    }

    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete("project");
      return next;
    }, { replace: true });
  }, [projectsQuery.isPending, searchParams, setSearchParams]);

  useEffect(() => {
    const requestedAppTypeId = searchParams.get("appType");

    if (!requestedAppTypeId || appTypesQuery.isPending) {
      return;
    }

    if (appTypes.some((appType) => appType.id === requestedAppTypeId)) {
      if (requestedAppTypeId !== appTypeId) {
        setAppTypeId(requestedAppTypeId);
      }
    }

    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete("appType");
      return next;
    }, { replace: true });
  }, [appTypeId, appTypes, appTypesQuery.isPending, searchParams, setAppTypeId, setSearchParams]);

  useEffect(() => {
    if (!integrations.length) {
      setIntegrationId("");
      return;
    }

    if (integrationId && !integrations.some((integration) => integration.id === integrationId)) {
      setIntegrationId("");
    }
  }, [integrationId, integrations]);

  useEffect(() => {
    if (!searchParams.get("case")) {
      syncTestCaseSearchParams(null);
    }
    setCreateSuiteContextId("");
    setSelectedTestCaseId("");
    setIsCreating(false);
    setIsImportModalOpen(false);
    setImportBatches([]);
    setImportFileWarnings([]);
    setImportSourceSelection("auto");
    setIsAiCaseAuthoringOpen(false);
    setAiCaseAuthoringRequirementId("");
    setAiCaseAuthoringAdditionalContext("");
    setAiCaseAuthoringPreview(null);
    setAiCaseAuthoringMessage("");
    setIsCreateSuiteModalOpen(false);
    setIsCreateExecutionModalOpen(false);
    setExecutionName("");
    setSelectedExecutionAssigneeIds([]);
    setExecutionRelease("");
    setExecutionSprint("");
    setExecutionBuild("");
    resetExecutionContextSelection();
    setAutomationStartUrl("");
    setAutomationContext("");
    setAutomationFailureThreshold(3);
    setRecorderSession(null);
    setRecorderSessionCaseId("");
    setInspectingStepId("");
    setCaseDraft(emptyCaseDraft);
    setNewStepDraft(EMPTY_STEP_DRAFT);
    setStepInsertIndex(null);
    setStepInsertGroupContext(null);
    setDraftSteps([]);
    setSelectedStepIds([]);
    setCopiedSteps([]);
    setCopiedStepMode("copy");
    setCutStepSource(null);
    setExpandedStepIds([]);
    setExpandedStepGroupIds([]);
    setIsStepGroupModalOpen(false);
    setStepGroupName("");
    setSaveAsReusableGroup(false);
    setIsSharedGroupPickerOpen(false);
    setSelectedSharedGroupId("");
    setSharedGroupSearchTerm("");
    setSelectedActionTestCaseIds([]);
    setImportRequirementId("");
    setIsAiStudioOpen(false);
    setAiRequirementIds([]);
    setAiPreviewCases([]);
    setAiPreviewMessage("");
    setSchedulerActionCaseId("");
    setSchedulerActionKind("");
    setRephrasingStepId("");
  }, [appTypeId]);

  useEffect(() => {
    if (searchParams.get("create") !== "1") {
      return;
    }

    if (isCreating || selectedTestCaseId || !appTypeId) {
      return;
    }

    const requestedSuiteId = searchParams.get("suite") || "";
    const requestedRequirementId = searchParams.get("requirement") || "";
    beginCreateCase(requestedSuiteId, requestedRequirementId);

    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (next.has("create") || next.has("suite") || next.has("requirement")) {
        next.delete("create");
        next.delete("suite");
        next.delete("requirement");
      }
      return next;
    }, { replace: true });
  }, [appTypeId, isCreating, searchParams, selectedTestCaseId, setSearchParams]);

  useEffect(() => {
    setSelectedActionTestCaseIds((current) => current.filter((id) => testCases.some((item) => item.id === id)));
  }, [testCases]);

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

  const sharedGroupNameById = useMemo(
    () =>
      sharedStepGroups.reduce<Record<string, string>>((accumulator, group) => {
        accumulator[group.id] = group.name;
        return accumulator;
      }, {}),
    [sharedStepGroups]
  );

  const stepCountByCaseId = useMemo(
    () =>
      testCases.reduce<Record<string, number>>((counts, testCase) => {
        counts[testCase.id] = Number(testCase.step_count || 0);
        return counts;
      }, {}),
    [testCases]
  );

  const requirementTitleById = useMemo(
    () =>
      requirements.reduce<Record<string, string>>((map, requirement) => {
        map[requirement.id] = requirement.title;
        return map;
      }, {}),
    [requirements]
  );
  const requirementDisplayIdById = useMemo(
    () =>
      requirements.reduce<Record<string, string>>((map, requirement) => {
        map[requirement.id] = requirement.display_id || requirement.id;
        return map;
      }, {}),
    [requirements]
  );
  const suiteNameById = useMemo(
    () =>
      suites.reduce<Record<string, string>>((accumulator, suite) => {
        accumulator[suite.id] = suite.name;
        return accumulator;
      }, {}),
    [suites]
  );

  const caseStatusOptions = TEST_CASE_WORKFLOW_STATUS_OPTIONS;
  const casePriorityOptions = useMemo(
    () => Array.from(new Set(testCases.map((testCase) => String(testCase.priority || 3)))).sort((left, right) => Number(left) - Number(right)),
    [testCases]
  );
  const existingCaseLabels = useMemo(() => {
    const labels = new Map<string, string>();
    testCases.flatMap((testCase) => testCase.labels || []).forEach((label) => {
      const normalizedLabel = String(label || "").trim();
      if (normalizedLabel && !labels.has(normalizedLabel.toLowerCase())) {
        labels.set(normalizedLabel.toLowerCase(), normalizedLabel);
      }
    });
    return Array.from(labels.values()).sort((left, right) => left.localeCompare(right));
  }, [testCases]);
  const existingSuiteLabels = useMemo(() => {
    const labels = new Map<string, string>();
    [...existingCaseLabels, ...suites.flatMap((suite) => suite.labels || [])].forEach((label) => {
      const normalizedLabel = String(label || "").trim();
      if (normalizedLabel && !labels.has(normalizedLabel.toLowerCase())) {
        labels.set(normalizedLabel.toLowerCase(), normalizedLabel);
      }
    });
    return Array.from(labels.values()).sort((left, right) => left.localeCompare(right));
  }, [existingCaseLabels, suites]);
  const caseModuleById = useMemo(() => {
    const map = new Map<string, TestCaseModule>();
    testCaseModules.forEach((module) => {
      (module.test_case_ids || []).forEach((testCaseId) => {
        map.set(testCaseId, module);
      });
    });
    return map;
  }, [testCaseModules]);

  const filteredCases = useMemo(() => {
    const search = deferredSearchTerm.trim().toLowerCase();

    return testCases.filter((testCase) => {
      const requirementTitle =
        (testCase.requirement_ids || [testCase.requirement_id]).map((id) => (id ? requirementTitleById[id] || "" : "")).find(Boolean) || "";
      const history = historyByCaseId[testCase.id] || [];
      const latest = history[0];
      const derivedStatus = getTestCaseWorkflowStatus(testCase, latest?.status, defaultTestCaseStatus);
      const derivedStatusLabel = formatTestCaseWorkflowStatus(derivedStatus);
      const stepCount = stepCountByCaseId[testCase.id] || 0;
      const runCount = history.length;

      const matchesSearch =
        !search ||
        [
          testCase.display_id || "",
          testCase.id,
          testCase.title,
          testCase.description || "",
          derivedStatusLabel,
          ...(testCase.labels || []),
          TEST_CASE_REVIEW_STATUS_LABELS[testCase.review_status || "not_requested"],
          testCase.reviewer_id ? resolveAuditUserLabel(testCase.reviewer_id, userById) : "",
          caseModuleById.get(testCase.id)?.name || "",
          ...(testCase.external_references || []),
          ...(testCase.requirement_ids || []),
          testCase.requirement_id || "",
          ...(testCase.suite_ids || []),
          testCase.suite_id || "",
          requirementTitle
        ].some((value) => value.toLowerCase().includes(search));

      if (!matchesSearch) {
        return false;
      }

      if (caseStatusFilter !== "all" && derivedStatus !== caseStatusFilter) {
        return false;
      }

      if (casePriorityFilter !== "all" && String(testCase.priority || 3) !== casePriorityFilter) {
        return false;
      }

      if (caseStepFilter === "with-steps" && !stepCount) {
        return false;
      }

      if (caseStepFilter === "no-steps" && stepCount) {
        return false;
      }

      if (caseRunFilter === "with-runs" && !runCount) {
        return false;
      }

      if (caseRunFilter === "no-runs" && runCount) {
        return false;
      }

      return true;
    });
  }, [caseModuleById, casePriorityFilter, caseRunFilter, caseStatusFilter, caseStepFilter, deferredSearchTerm, historyByCaseId, requirementTitleById, stepCountByCaseId, testCases, userById]);

  const moduleCaseGroups = useMemo(() => {
    const filteredCaseIds = new Set(filteredCases.map((testCase) => testCase.id));
    const groups = testCaseModules.map((module) => ({
      module,
      cases: (module.test_case_ids || [])
        .map((testCaseId) => testCases.find((testCase) => testCase.id === testCaseId) || null)
        .filter((testCase): testCase is TestCase => Boolean(testCase && filteredCaseIds.has(testCase.id)))
    }));
    const assignedCaseIds = new Set(groups.flatMap((group) => group.module.test_case_ids || []));
    const unassignedCases = filteredCases.filter((testCase) => !assignedCaseIds.has(testCase.id));

    return { groups, unassignedCases };
  }, [filteredCases, testCaseModules, testCases]);
  const moduleHealth = useMemo(() => {
    const derive = (items: TestCase[]) => deriveModuleHealth(items.map((testCase) => ({
      priority: testCase.priority,
      linkedRequirement: Boolean((testCase.requirement_ids || [testCase.requirement_id]).find((id) => Boolean(id))),
      stepCount: stepCountByCaseId[testCase.id] || 0,
      automated: testCase.automated === "yes",
      recentStatuses: (historyByCaseId[testCase.id] || []).slice(0, 10).map((result) => result.status)
    })));

    return {
      byId: new Map(moduleCaseGroups.groups.map(({ module, cases }) => [module.id, derive(cases)])),
      unassigned: derive(moduleCaseGroups.unassignedCases)
    };
  }, [historyByCaseId, moduleCaseGroups, stepCountByCaseId]);
  const renderModuleMetrics = (health: ReturnType<typeof deriveModuleHealth>) => (
    <HierarchyMetricStrip
      count={health.count}
      noun="case"
      metrics={[
        { label: "Traceability", value: `${health.traceabilityPercent}%`, tone: health.traceabilityPercent >= 80 ? "success" : health.traceabilityPercent >= 50 ? "warning" : "danger", title: "Test cases linked to a requirement" },
        { label: "Executable", value: `${health.executablePercent}%`, tone: health.executablePercent >= 90 ? "success" : health.executablePercent >= 60 ? "warning" : "danger", title: "Test cases with at least one executable step" },
        ...(canUseAutomationWorkspace ? [{ label: "Automated", value: `${health.automationPercent}%`, tone: health.automationPercent >= 70 ? "success" as const : "info" as const, title: "Test cases marked automated" }] : []),
        { label: "Stability", value: health.stabilityPercent === null ? "No runs" : `${health.stabilityPercent}%`, tone: health.stabilityPercent === null ? "neutral" : health.stabilityPercent >= 80 ? "success" : health.stabilityPercent >= 60 ? "warning" : "danger", title: "Pass rate across recent finalized results" },
        { label: "Risks", value: health.riskCount, tone: health.riskCount ? "danger" : "success", title: "Unlinked, step-less, recently failed, or high-priority manual cases" }
      ]}
    />
  );
	  const moduleTileEntries = useMemo(() => {
    const entries: Array<
      | { kind: "module"; module: TestCaseModule; count: number }
      | { kind: "unassigned"; count: number }
      | { kind: "case"; testCase: TestCase }
    > = [];

    moduleCaseGroups.groups.forEach(({ module, cases }) => {
      if (!cases.length && deferredSearchTerm.trim()) {
        return;
      }

      entries.push({ kind: "module", module, count: cases.length });

      if (!collapsedModuleIds.includes(module.id)) {
        cases.forEach((testCase) => entries.push({ kind: "case", testCase }));
      }
    });

    if (moduleCaseGroups.unassignedCases.length) {
      entries.push({ kind: "unassigned", count: moduleCaseGroups.unassignedCases.length });
      moduleCaseGroups.unassignedCases.forEach((testCase) => entries.push({ kind: "case", testCase }));
    }

	    return entries;
	  }, [collapsedModuleIds, deferredSearchTerm, moduleCaseGroups]);
  const visibleModuleTileEntries = useMemo(
    () => moduleTileEntries.slice(0, visibleTestCaseCount),
    [moduleTileEntries, visibleTestCaseCount]
  );
  const hasMoreVisibleTestCases = catalogViewMode === "tile"
    ? visibleModuleTileEntries.length < moduleTileEntries.length
    : visibleTestCaseCount < filteredCases.length;

  useEffect(() => {
    setVisibleTestCaseCount(TEST_CASE_RENDER_BATCH_SIZE);
  }, [appTypeId, casePriorityFilter, caseRunFilter, caseStatusFilter, caseStepFilter, catalogViewMode, deferredSearchTerm]);

  const activeCaseFilterCount =
    Number(caseStatusFilter !== "all") +
    Number(casePriorityFilter !== "all") +
    Number(caseStepFilter !== "all") +
    Number(caseRunFilter !== "all");

  const selectableFilteredCases = useMemo(
    () => testCases,
    [testCases]
  );
  const unassignedCaseIds = useMemo(
    () => moduleCaseGroups.unassignedCases.map((testCase) => testCase.id),
    [moduleCaseGroups.unassignedCases]
  );
  const areAllFilteredCasesSelected =
    selectableFilteredCases.length > 0
    && selectableFilteredCases.every((item) => selectedActionTestCaseIds.includes(item.id))
    && testCaseModules.every((module) => selectedModuleIds.includes(module.id));
  const areAllUnassignedCasesSelected =
    unassignedCaseIds.length > 0 && unassignedCaseIds.every((id) => selectedActionTestCaseIds.includes(id));

  const setAllFilteredTestCaseItemsSelected = (checked: boolean) => {
    const caseIds = selectableFilteredCases.map((testCase) => testCase.id);
    const moduleIds = testCaseModules.map((module) => module.id);
    setSelectedActionTestCaseIds((current) => checked
      ? [...new Set([...current, ...caseIds])]
      : current.filter((id) => !caseIds.includes(id)));
    setSelectedModuleIds((current) => checked
      ? [...new Set([...current, ...moduleIds])]
      : current.filter((id) => !moduleIds.includes(id)));
  };

  const setModuleAndChildrenSelected = (module: TestCaseModule, checked: boolean) => {
    const caseIds = (module.test_case_ids || []).filter((id) => testCases.some((testCase) => testCase.id === id));
    setSelectedModuleIds((current) => checked
      ? [...new Set([...current, module.id])]
      : current.filter((id) => id !== module.id));
    setSelectedActionTestCaseIds((current) => checked
      ? [...new Set([...current, ...caseIds])]
      : current.filter((id) => !caseIds.includes(id)));
  };

  const setUnassignedTestCasesSelected = (checked: boolean) => {
    setSelectedActionTestCaseIds((current) => checked
      ? [...new Set([...current, ...unassignedCaseIds])]
      : current.filter((id) => !unassignedCaseIds.includes(id)));
  };
  const selectedProject = projects.find((project) => String(project.id) === String(projectId)) || null;
  const selectedAppType = appTypes.find((appType) => appType.id === appTypeId) || null;
  const isApiOnlyTestCase = (testCaseId: string) => Boolean(testCases.find((testCase) => testCase.id === testCaseId)?.api_only);
  const testEngineIntegration = resolveScopedIntegration(testEngineIntegrations, "testengine", projectId);
  const mobileRemoteRecorderEnabled = Boolean(
    testEngineIntegration?.config?.mobile_cloud_provider
    && testEngineIntegration.config.mobile_cloud_provider !== "none"
    && testEngineIntegration.config.mobile_remote_url
  );
  const automationLearningCache = automationLearningCacheQuery.data || [];
  const recorderLiveUrl = recorderSession?.live_view_url || "";

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
        // Live recorder stats are best-effort; the stream remains the source of truth for interaction.
      }
    };
    const timer = window.setInterval(() => void refreshRecorderSession(), 1000);

    void refreshRecorderSession();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [recorderSession?.id, recorderSession?.status, recorderSession?.status_url]);

  const executionsById = useMemo(
    () =>
      executions.reduce<Record<string, Execution>>((map, execution) => {
        map[execution.id] = execution;
        return map;
      }, {}),
    [executions]
  );
  const selectedActionCases = useMemo(
    () => testCases.filter((item) => selectedActionTestCaseIds.includes(item.id)),
    [selectedActionTestCaseIds, testCases]
  );
  const selectedManualAutomationCases = useMemo(
    () => selectedActionCases.filter((item) => item.automated !== "yes"),
    [selectedActionCases]
  );
  const selectedPendingGeneratedCases = useMemo(
    () => selectedActionCases.filter((item) => item.ai_generation_source === "scheduler" && item.ai_generation_review_status === "pending"),
    [selectedActionCases]
  );

  const selectedTestCase = useMemo(
    () => testCases.find((item) => item.id === selectedTestCaseId) || null,
    [selectedTestCaseId, testCases]
  );
  const selectedCaseModuleId = selectedTestCase ? caseModuleById.get(selectedTestCase.id)?.id || "" : "";
  const canReviewSelectedTestCase = Boolean(
    selectedTestCase?.reviewer_id
    && session?.user.id
    && selectedTestCase.reviewer_id === session.user.id
  );
  const selectedReviewStatus = selectedTestCase?.review_status || "not_requested";
  const isSelectedReviewPending = selectedReviewStatus === "pending";
  const automationTargetCaseIds = useMemo(
    () =>
      selectedActionTestCaseIds.length
        ? selectedActionTestCaseIds
        : selectedTestCase
          ? [selectedTestCase.id]
          : [],
    [selectedActionTestCaseIds, selectedTestCase]
  );
  const automationTargetCases = useMemo(
    () => testCases.filter((item) => automationTargetCaseIds.includes(item.id)),
    [automationTargetCaseIds, testCases]
  );
  const selectedCaseSuiteIds = useMemo(
    () =>
      Array.from(
        new Set(
          (
            isCreating
              ? createSuiteContextId
                ? [createSuiteContextId]
                : []
              : selectedTestCase?.suite_ids || (selectedTestCase?.suite_id ? [selectedTestCase.suite_id] : [])
          ).filter(Boolean)
        )
      ) as string[],
    [createSuiteContextId, isCreating, selectedTestCase?.suite_id, selectedTestCase?.suite_ids]
  );
  const selectedParameterSuite = suites.find((suite) => suite.id === selectedParameterSuiteId) || null;
  const createCaseParameterDraftScopeKey = useMemo(
    () => buildTestCaseParameterDraftScopeKey({ isCreating: true, appTypeId }),
    [appTypeId]
  );
  const selectedCaseParameterDraftScopeKey = useMemo(
    () => buildTestCaseParameterDraftScopeKey({ isCreating: false, testCaseId: selectedTestCaseId }),
    [selectedTestCaseId]
  );
  const selectedSuiteParameterDraftScopeKey = useMemo(
    () => buildSuiteParameterDraftScopeKey(selectedParameterSuiteId),
    [selectedParameterSuiteId]
  );
  const runPreviewParameterDraftScopeKey = useMemo(
    () => buildRunParameterDraftScopeKey(appTypeId),
    [appTypeId]
  );
  const activeTestCaseParameterSeedKey = useMemo(() => {
    if (isCreating) {
      return `draft:${appTypeId || "global"}`;
    }

    return selectedTestCaseId ? `case:${selectedTestCaseId}` : "__none__";
  }, [appTypeId, isCreating, selectedTestCaseId]);
  const mergedScopedParameterValues = useMemo(
    () => combineStepParameterValues(testCaseParameterValues, suiteParameterValues, runPreviewParameterValues),
    [runPreviewParameterValues, suiteParameterValues, testCaseParameterValues]
  );
  const aiCaseAuthoringSourceDraft = useMemo(
    () => ({
      title: caseDraft.title,
      description: caseDraft.description,
      parameter_values: testCaseParameterValues,
      steps: displaySteps.map((step) => ({
        step_order: step.step_order,
        step_type: stepDrafts[step.id]?.step_type ?? step.step_type,
        action: stepDrafts[step.id]?.action ?? step.action,
        expected_result: stepDrafts[step.id]?.expected_result ?? step.expected_result
      }))
    }),
    [caseDraft.description, caseDraft.title, displaySteps, stepDrafts, testCaseParameterValues]
  );
  const aiCaseAuthoringAutomationStepCount = useMemo(
    () =>
      displaySteps.filter((step) =>
        stepHasAutomation({
          action: stepDrafts[step.id]?.action ?? step.action,
          expected_result: stepDrafts[step.id]?.expected_result ?? step.expected_result,
          step_type: stepDrafts[step.id]?.step_type ?? step.step_type,
          automation_code: stepDrafts[step.id]?.automation_code ?? step.automation_code,
          api_request: stepDrafts[step.id]?.api_request ?? step.api_request
        })
      ).length,
    [displaySteps, stepDrafts]
  );
  const resolveScopedParameterInputState = (scope: StepParameterScope) => {
    if (scope === "s") {
      if (!selectedCaseSuiteIds.length) {
        return {
          disabled: true,
          hint: "Link this case to a suite before saving suite-shared values."
        };
      }

      if (!selectedParameterSuite) {
        return {
          disabled: true,
          hint: "Choose a suite target before editing suite-shared values."
        };
      }

      return {
        disabled: false,
        hint: selectedCaseSuiteIds.length > 1
          ? `Saved on suite "${selectedParameterSuite.name}".`
          : `Saved on linked suite "${selectedParameterSuite.name}".`
      };
    }

    if (scope === "r") {
      return {
        disabled: false,
        hint: "Preview only here. Real runs resolve @r values from the attached run data set."
      };
    }

    return {
      disabled: false,
      hint: isCreating
        ? "Saved with this draft test case."
        : "Saved on this test case and reused across its steps."
    };
  };
  const handleScopedParameterValueChange = (name: string, value: string) => {
    const parsed = parseStepParameterName(name);

    if (!parsed || resolveScopedParameterInputState(parsed.scope).disabled) {
      return;
    }

    if (parsed.scope === "s") {
      setSuiteParameterValues((current) => ({
        ...current,
        [parsed.name]: value
      }));
      return;
    }

    if (parsed.scope === "r") {
      setRunPreviewParameterValues((current) => ({
        ...current,
        [parsed.name]: value
      }));
      return;
    }

    setTestCaseParameterValues((current) => ({
      ...current,
      [parsed.name]: value
    }));
  };
  const syncCachedTestCaseParameterValues = (testCaseId: string, parameterValues: Record<string, string>) => {
    const normalizedValues = normalizeTestCaseParameterValues(parameterValues);

    queryClient.setQueryData<TestCase[]>(["global-test-cases", appTypeId], (current) =>
      current
        ? current.map((item) =>
            item.id === testCaseId
              ? {
                  ...item,
                  parameter_values: normalizedValues
                }
              : item
          )
        : current
    );
  };
  const syncCachedTestCaseSuiteIds = (testCaseId: string, suiteIds: string[]) => {
    const normalizedSuiteIds = Array.from(new Set(suiteIds.filter(Boolean)));

    queryClient.setQueryData<TestCase[]>(["global-test-cases", appTypeId], (current) =>
      current
        ? current.map((item) =>
            item.id === testCaseId
              ? {
                  ...item,
                  suite_id: normalizedSuiteIds[0] || null,
                  suite_ids: normalizedSuiteIds
                }
              : item
          )
        : current
    );
  };
  const syncCachedSuiteParameterValues = (suiteId: string, parameterValues: Record<string, string>) => {
    const normalizedValues = normalizeSuiteParameterValues(parameterValues);

    queryClient.setQueryData<TestSuite[]>(["test-case-suites", appTypeId], (current) =>
      current
        ? current.map((suite) =>
            suite.id === suiteId
              ? {
                  ...suite,
                  parameter_values: normalizedValues
                }
              : suite
          )
        : current
    );
  };

  useEffect(() => {
    if (isCreating) {
      lastCaseDraftSeedRef.current = "__draft__";
      return;
    }

    if (!selectedTestCaseId) {
      if (lastCaseDraftSeedRef.current !== "__none__") {
        setCaseDraft(emptyCaseDraft);
        lastCaseDraftSeedRef.current = "__none__";
      }
      return;
    }

    if (testCasesQuery.isLoading || testCasesQuery.isFetching) {
      return;
    }

    if (selectedTestCase) {
      const nextSeedKey = `case:${selectedTestCase.id}:${selectedCaseModuleId}`;

      if (lastCaseDraftSeedRef.current === nextSeedKey) {
        return;
      }

      setCaseDraft({
        title: selectedTestCase.title,
        description: selectedTestCase.description || "",
        externalReferencesText: formatReferenceList(selectedTestCase.external_references),
        labelsText: formatReferenceList(selectedTestCase.labels),
        automated: (selectedTestCase.automated || defaultTestCaseAutomated) as "yes" | "no",
        priority: selectedTestCase.priority ?? 3,
        status: selectedTestCase.status || defaultTestCaseStatus,
        requirement_id: selectedTestCase.requirement_ids?.[0] || selectedTestCase.requirement_id || "",
        module_id: selectedCaseModuleId,
        reviewer_id: selectedTestCase.reviewer_id || "",
        customFields: Object.fromEntries(
          (testCaseFieldCatalog?.fields || [])
            .filter((field) => !field.system_managed && !TEST_CASE_CORE_SCHEMA_KEYS.includes(field.key))
            .map((field) => [field.key, selectedTestCase[field.key]])
            .filter(([, value]) => value !== undefined && value !== null)
        )
      });
      lastCaseDraftSeedRef.current = nextSeedKey;
      return;
    }

    const requestedCaseId = searchParams.get("case");
    if (requestedCaseId) {
      const requestedCase = findByRoutableId(testCases, requestedCaseId);
      if (requestedCase) {
        setSelectedTestCaseId(requestedCase.id);
        return;
      }

      if (deepLinkTestCasesQuery.isLoading || deepLinkTestCasesQuery.isFetching) {
        return;
      }

      const deepLinkedCase = findByRoutableId(deepLinkTestCases, requestedCaseId);
      if (deepLinkedCase?.app_type_id && deepLinkedCase.app_type_id !== appTypeId) {
        setAppTypeId(deepLinkedCase.app_type_id);
        return;
      }

      if (deepLinkedCase && selectedTestCaseId === deepLinkedCase.id) {
        return;
      }

      if (selectedTestCaseId === requestedCaseId) {
        return;
      }
    }

    syncTestCaseSearchParams(null);
    setSelectedTestCaseId("");
    setCaseDraft(emptyCaseDraft);
  }, [
    defaultTestCaseAutomated,
    defaultTestCaseStatus,
    emptyCaseDraft,
    appTypeId,
    deepLinkTestCases,
    deepLinkTestCasesQuery.isFetching,
    deepLinkTestCasesQuery.isLoading,
    isCreating,
    selectedCaseModuleId,
    selectedTestCase,
    testCaseFieldCatalog?.fields,
    selectedTestCaseId,
    searchParams,
    setAppTypeId,
    testCasesQuery.isFetching,
    testCasesQuery.isLoading,
    testCases
  ]);

  useEffect(() => {
    if (isCreating) {
      const nextSeedKey = `draft:${appTypeId || "global"}`;

      if (lastTestCaseParameterSeedRef.current !== nextSeedKey) {
        setTestCaseParameterValues(readStoredTestCaseParameterDraft(createCaseParameterDraftScopeKey));
        setIsCaseParameterDialogOpen(false);
        lastTestCaseParameterSeedRef.current = nextSeedKey;
      }
      return;
    }

    if (!selectedTestCaseId) {
      if (lastTestCaseParameterSeedRef.current !== "__none__") {
        setTestCaseParameterValues({});
        setIsCaseParameterDialogOpen(false);
        lastTestCaseParameterSeedRef.current = "__none__";
      }
      return;
    }

    if (testCasesQuery.isLoading || testCasesQuery.isFetching || !selectedTestCase) {
      return;
    }

    const nextSeedKey = `case:${selectedTestCase.id}`;

    if (lastTestCaseParameterSeedRef.current === nextSeedKey) {
      return;
    }

    const storedDraft = readStoredTestCaseParameterDraft(selectedCaseParameterDraftScopeKey);
    const nextValues = Object.keys(storedDraft).length || hasStoredTestCaseParameterDraft(selectedCaseParameterDraftScopeKey)
      ? storedDraft
      : normalizeTestCaseParameterValues(selectedTestCase.parameter_values);

    setTestCaseParameterValues(nextValues);
    setIsCaseParameterDialogOpen(false);
    lastTestCaseParameterSeedRef.current = nextSeedKey;
  }, [
    appTypeId,
    createCaseParameterDraftScopeKey,
    isCreating,
    selectedCaseParameterDraftScopeKey,
    selectedTestCase,
    selectedTestCaseId,
    testCasesQuery.isFetching,
    testCasesQuery.isLoading
  ]);

  useEffect(() => {
    if (!searchParams.get("case")) {
      suppressCaseSelectionFromUrlRef.current = false;
    }

    if (suppressCaseSelectionFromUrlRef.current) {
      return;
    }

    if (isCreating || selectedTestCaseId) {
      return;
    }

    const requestedCaseId = searchParams.get("case");
    if (!requestedCaseId) {
      return;
    }

    if (testCasesQuery.isLoading || testCasesQuery.isFetching) {
      return;
    }

    const requestedCase = findByRoutableId(testCases, requestedCaseId);
    if (requestedCase) {
      setSelectedTestCaseId(requestedCase.id);
      if (requestedCase.display_id && requestedCaseId !== requestedCase.display_id) {
        syncTestCaseSearchParams(requestedCase.display_id);
      }
      return;
    }

    if (deepLinkTestCasesQuery.isLoading || deepLinkTestCasesQuery.isFetching) {
      return;
    }

    const deepLinkedCase = findByRoutableId(deepLinkTestCases, requestedCaseId);
    if (deepLinkedCase?.app_type_id && deepLinkedCase.app_type_id !== appTypeId) {
      setAppTypeId(deepLinkedCase.app_type_id);
      return;
    }

    if (deepLinkedCase) {
      setSelectedTestCaseId(deepLinkedCase.id);
    }
  }, [
    appTypeId,
    deepLinkTestCases,
    deepLinkTestCasesQuery.isFetching,
    deepLinkTestCasesQuery.isLoading,
    isCreating,
    searchParams,
    selectedTestCaseId,
    setAppTypeId,
    testCases,
    testCasesQuery.isFetching,
    testCasesQuery.isLoading
  ]);

  useEffect(() => {
    if (!selectedCaseSuiteIds.length) {
      setSelectedParameterSuiteId("");
      setSuiteParameterValues({});
      return;
    }

    if (!selectedCaseSuiteIds.includes(selectedParameterSuiteId)) {
      setSelectedParameterSuiteId(selectedCaseSuiteIds[0] || "");
    }
  }, [selectedCaseSuiteIds, selectedParameterSuiteId]);

  useEffect(() => {
    const scopeKey = isCreating ? createCaseParameterDraftScopeKey : selectedCaseParameterDraftScopeKey;

    if (!scopeKey || lastTestCaseParameterSeedRef.current !== activeTestCaseParameterSeedKey) {
      return;
    }

    writeStoredTestCaseParameterDraft(scopeKey, testCaseParameterValues);
  }, [
    activeTestCaseParameterSeedKey,
    createCaseParameterDraftScopeKey,
    isCreating,
    selectedCaseParameterDraftScopeKey,
    testCaseParameterValues
  ]);

  useEffect(() => {
    if (
      isCreating
      || !selectedTestCase
      || lastTestCaseParameterSeedRef.current !== activeTestCaseParameterSeedKey
      || testCasesQuery.isLoading
      || testCasesQuery.isFetching
      || persistCaseParameterValues.isPending
      || updateTestCase.isPending
    ) {
      return;
    }

    const normalizedCurrentValues = normalizeTestCaseParameterValues(testCaseParameterValues);
    const normalizedSavedValues = normalizeTestCaseParameterValues(selectedTestCase.parameter_values);

    if (areTestCaseParameterValuesEqual(normalizedCurrentValues, normalizedSavedValues)) {
      clearStoredTestCaseParameterDraft(selectedCaseParameterDraftScopeKey);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      persistCaseParameterValues.mutate(
        { id: selectedTestCase.id, parameter_values: normalizedCurrentValues },
        {
          onSuccess: () => {
            syncCachedTestCaseParameterValues(selectedTestCase.id, normalizedCurrentValues);

            if (areTestCaseParameterValuesEqual(readStoredTestCaseParameterDraft(selectedCaseParameterDraftScopeKey), normalizedCurrentValues)) {
              clearStoredTestCaseParameterDraft(selectedCaseParameterDraftScopeKey);
            }
          },
          onError: (error) => {
            showError(error, "Unable to store test data values");
          }
        }
      );
    }, 450);

    return () => window.clearTimeout(timeoutId);
  }, [
    activeTestCaseParameterSeedKey,
    isCreating,
    persistCaseParameterValues.isPending,
    selectedCaseParameterDraftScopeKey,
    selectedTestCase,
    testCaseParameterValues,
    testCasesQuery.isFetching,
    testCasesQuery.isLoading,
    updateTestCase.isPending
  ]);

  useEffect(() => {
    if (!selectedParameterSuiteId) {
      return;
    }

    const storedDraft = readStoredSuiteParameterDraft(selectedSuiteParameterDraftScopeKey);
    const nextValues = Object.keys(storedDraft).length || hasStoredSuiteParameterDraft(selectedSuiteParameterDraftScopeKey)
      ? storedDraft
      : normalizeSuiteParameterValues(selectedParameterSuite?.parameter_values);

    setSuiteParameterValues(nextValues);
  }, [selectedParameterSuite?.parameter_values, selectedParameterSuiteId, selectedSuiteParameterDraftScopeKey]);

  useEffect(() => {
    setRunPreviewParameterValues(readStoredRunParameterDraft(runPreviewParameterDraftScopeKey));
  }, [runPreviewParameterDraftScopeKey]);

  useEffect(() => {
    if (!selectedSuiteParameterDraftScopeKey || !selectedParameterSuiteId) {
      return;
    }

    writeStoredSuiteParameterDraft(selectedSuiteParameterDraftScopeKey, suiteParameterValues);
  }, [selectedParameterSuiteId, selectedSuiteParameterDraftScopeKey, suiteParameterValues]);

  useEffect(() => {
    writeStoredRunParameterDraft(runPreviewParameterDraftScopeKey, runPreviewParameterValues);
  }, [runPreviewParameterDraftScopeKey, runPreviewParameterValues]);

  useEffect(() => {
    if (!selectedParameterSuite || updateSuite.isPending) {
      return;
    }

    const normalizedCurrentValues = normalizeSuiteParameterValues(suiteParameterValues);
    const normalizedSavedValues = normalizeSuiteParameterValues(selectedParameterSuite.parameter_values);

    if (areSuiteParameterValuesEqual(normalizedCurrentValues, normalizedSavedValues)) {
      clearStoredSuiteParameterDraft(selectedSuiteParameterDraftScopeKey);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      updateSuite.mutate(
        {
          id: selectedParameterSuite.id,
          input: {
            parameter_values: normalizedCurrentValues
          }
        },
        {
          onSuccess: () => {
            syncCachedSuiteParameterValues(selectedParameterSuite.id, normalizedCurrentValues);

            if (areSuiteParameterValuesEqual(readStoredSuiteParameterDraft(selectedSuiteParameterDraftScopeKey), normalizedCurrentValues)) {
              clearStoredSuiteParameterDraft(selectedSuiteParameterDraftScopeKey);
            }
          },
          onError: (error) => {
            showError(error, "Unable to store suite test data values");
          }
        }
      );
    }, 450);

    return () => window.clearTimeout(timeoutId);
  }, [
    selectedParameterSuite,
    selectedSuiteParameterDraftScopeKey,
    suiteParameterValues,
    updateSuite,
    updateSuite.isPending
  ]);

  useEffect(() => {
    setNewStepDraft(EMPTY_STEP_DRAFT);
    setStepInsertIndex(null);
    setStepInsertGroupContext(null);
    setSelectedStepIds([]);
    setExpandedStepIds([]);
    setExpandedStepGroupIds([]);
    setStepDrafts({});
    setEditingAutomationStepId("");
    setRephrasingStepId("");
    setCodePreviewState(null);
    setExpandedSections(isCreating ? createCreateModeTestCaseSections() : createDefaultTestCaseSections());
    setActiveTestCaseDetailTab("details");
  }, [isCreating, selectedTestCaseId]);

  useEffect(() => {
    setExpandedStepIds((current) => {
      const validIds = current.filter((id) => displaySteps.some((step) => step.id === id));
      return validIds;
    });

    setExpandedStepGroupIds((current) => {
      const validGroupIds = new Set(displaySteps.map((step) => step.group_id).filter(Boolean));
      return current.filter((id) => validGroupIds.has(id));
    });

    setSelectedStepIds((current) => current.filter((id) => displaySteps.some((step) => step.id === id)));

    setStepDrafts((current) => {
      const next = { ...current };
      displaySteps.forEach((step) => {
        if (!next[step.id]) {
          next[step.id] = {
            action: step.action || "",
            expected_result: step.expected_result || "",
            step_type: normalizeStepType(step.step_type),
            automation_code: normalizeAutomationCode(step.automation_code),
            api_request: normalizeApiRequest(step.api_request)
          };
        }
      });
      Object.keys(next).forEach((stepId) => {
        if (!displaySteps.some((step) => step.id === stepId)) {
          delete next[stepId];
        }
      });
      return next;
    });
  }, [displaySteps]);

  useEffect(() => {
    if (!isImportModalOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsImportModalOpen(false);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isImportModalOpen]);

  useEffect(() => {
    if (!isAiCaseAuthoringOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !previewCaseAuthoring.isPending && !updateTestCase.isPending) {
        setIsAiCaseAuthoringOpen(false);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isAiCaseAuthoringOpen, previewCaseAuthoring.isPending, updateTestCase.isPending]);

  useEffect(() => {
    if (!isAiStudioOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !previewDesignedCases.isPending && !acceptDesignedCases.isPending && !createGenerationJob.isPending) {
        setIsAiStudioOpen(false);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [acceptDesignedCases.isPending, createGenerationJob.isPending, isAiStudioOpen, previewDesignedCases.isPending]);

  const refreshCases = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["global-test-cases", appTypeId] }),
      queryClient.invalidateQueries({ queryKey: ["global-test-case-results", appTypeId] }),
      queryClient.invalidateQueries({ queryKey: ["ai-test-case-generation-jobs", appTypeId] }),
      queryClient.invalidateQueries({ queryKey: ["test-case-suites", appTypeId] }),
      queryClient.invalidateQueries({ queryKey: ["test-case-modules", appTypeId] }),
      queryClient.invalidateQueries({ queryKey: ["test-suites"] }),
      queryClient.invalidateQueries({ queryKey: ["test-case-steps", selectedTestCaseId] }),
      queryClient.invalidateQueries({ queryKey: ["requirements", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["design-test-cases", appTypeId] }),
      queryClient.invalidateQueries({ queryKey: ["design-suites", appTypeId] }),
      queryClient.invalidateQueries({ queryKey: ["test-cases"] }),
      queryClient.invalidateQueries({ queryKey: ["automation-learning-cache"] }),
      queryClient.invalidateQueries({ queryKey: ["workspace-transactions"] })
    ]);
  };

  const refreshSharedGroups = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["shared-step-groups"] }),
      queryClient.invalidateQueries({ queryKey: ["shared-step-groups", appTypeId] })
    ]);
  };

  const generationJobSyncToken = useMemo(
    () =>
      generationJobs
        .map((job) => `${job.id}:${job.status}:${job.processed_requirements}:${job.generated_cases_count}`)
        .join("|"),
    [generationJobs]
  );
  const lastGenerationJobSyncTokenRef = useRef("");

  useEffect(() => {
    if (!appTypeId) {
      lastGenerationJobSyncTokenRef.current = "";
      return;
    }

    if (!generationJobSyncToken) {
      lastGenerationJobSyncTokenRef.current = "";
      return;
    }

    if (!lastGenerationJobSyncTokenRef.current) {
      lastGenerationJobSyncTokenRef.current = generationJobSyncToken;
      return;
    }

    if (lastGenerationJobSyncTokenRef.current === generationJobSyncToken) {
      return;
    }

    lastGenerationJobSyncTokenRef.current = generationJobSyncToken;

    void Promise.all([
      queryClient.invalidateQueries({ queryKey: ["global-test-cases", appTypeId] }),
      queryClient.invalidateQueries({ queryKey: ["requirements", projectId] })
    ]);
  }, [appTypeId, generationJobSyncToken, projectId, queryClient]);

  useEffect(() => {
    if (!appTypeId) {
      generationJobAlertScopeRef.current = "";
      surfacedGenerationJobFailureIdsRef.current = new Set();
      return;
    }

    if (!generationJobsQuery.isFetched) {
      return;
    }

    if (generationJobAlertScopeRef.current !== appTypeId) {
      generationJobAlertScopeRef.current = appTypeId;
      surfacedGenerationJobFailureIdsRef.current = new Set(
        generationJobs.filter((job) => job.status === "failed").map((job) => job.id)
      );
      return;
    }

    const latestUnsurfacedFailure = generationJobs.find(
      (job) => job.status === "failed" && !surfacedGenerationJobFailureIdsRef.current.has(job.id)
    );

    if (!latestUnsurfacedFailure) {
      return;
    }

    surfacedGenerationJobFailureIdsRef.current = new Set(surfacedGenerationJobFailureIdsRef.current).add(latestUnsurfacedFailure.id);
    setMessageTone("error");
    setMessage(latestUnsurfacedFailure.error || "One or more queued AI generations failed.");
  }, [appTypeId, generationJobs, generationJobsQuery.isFetched]);

  const resolveStepInsertIndex = (items: Array<{ id: string }>) => {
    if (stepInsertIndex !== null) {
      return Math.max(0, Math.min(stepInsertIndex, items.length));
    }

    if (!selectedStepIds.length) {
      return items.length;
    }

    const selectedIndexSet = new Set(selectedStepIds);
    let lastSelectedIndex = -1;

    items.forEach((step, index) => {
      if (selectedIndexSet.has(step.id)) {
        lastSelectedIndex = index;
      }
    });

    return lastSelectedIndex >= 0 ? lastSelectedIndex + 1 : items.length;
  };

  const isContinuousStepSelection = (items: Array<{ id: string; step_order: number }>, stepIds: string[]) => {
    if (!stepIds.length) {
      return false;
    }

    const selected = items
      .filter((step) => stepIds.includes(step.id))
      .slice()
      .sort((left, right) => left.step_order - right.step_order);

    if (!selected.length) {
      return false;
    }

    return selected.every((step, index) => index === 0 || step.step_order === selected[index - 1].step_order + 1);
  };

  const getInsertionGroupContext = (
    items: Array<Pick<TestStep, "group_id" | "group_name" | "group_kind" | "reusable_group_id">>,
    insertionIndex: number
  ) => {
    const previousStep = items[insertionIndex - 1];
    const nextStep = items[insertionIndex];

    if (!previousStep?.group_id || previousStep.group_id !== nextStep?.group_id) {
      return null;
    }

    return {
      group_id: previousStep.group_id || null,
      group_name: previousStep.group_name || null,
      group_kind: previousStep.group_kind || null,
      reusable_group_id: previousStep.reusable_group_id || null
    };
  };

  const getOrCreateSharedGroupRecord = async (
    name: string,
    selectedSteps: Array<Pick<TestStep, "action" | "expected_result" | "step_type" | "automation_code" | "api_request">>
  ) => {
    if (!appTypeId) {
      throw new Error("Select an app type before creating a shared group.");
    }

    const matchingGroup = sharedStepGroups.find((group) => {
      if (normalizeSharedGroupComparableText(group.name) !== normalizeSharedGroupComparableText(name)) {
        return false;
      }

      if ((group.steps || []).length !== selectedSteps.length) {
        return false;
      }

      return group.steps.every((step, index) => {
        const candidate = selectedSteps[index];
        return (
          normalizeSharedGroupComparableText(step.action) === normalizeSharedGroupComparableText(candidate?.action) &&
          normalizeSharedGroupComparableText(step.expected_result) === normalizeSharedGroupComparableText(candidate?.expected_result) &&
          areComparableStepAutomationEqual(step, {
            step_type: candidate?.step_type,
            automation_code: candidate?.automation_code,
            api_request: candidate?.api_request
          })
        );
      });
    });

    if (matchingGroup) {
      return matchingGroup.id;
    }

    const response = await createSharedStepGroup.mutateAsync({
      app_type_id: appTypeId,
      name,
      steps: selectedSteps.map((step, index) => ({
        step_order: index + 1,
        action: step.action || undefined,
        expected_result: step.expected_result || undefined,
        step_type: normalizeStepType(step.step_type),
        automation_code: normalizeAutomationCode(step.automation_code) || undefined,
        api_request: normalizeApiRequest(step.api_request) || undefined
      }))
    });

    const createdGroup = await api.sharedStepGroups.get(response.id);
    upsertSharedStepGroupInCache(queryClient, appTypeId, createdGroup);

    return createdGroup.id;
  };

  const hasUnsavedStepGroupDrafts = (groupItems: TestStep[]) =>
    !isCreating &&
    groupItems.some((step) => {
      const draft = stepDrafts[step.id];

      if (!draft) {
        return false;
      }

      return (
        normalizeSharedGroupComparableText(draft.action) !== normalizeSharedGroupComparableText(step.action) ||
        normalizeSharedGroupComparableText(draft.expected_result) !== normalizeSharedGroupComparableText(step.expected_result) ||
        !areComparableStepAutomationEqual(draft, step)
      );
    });

  const handleConvertStepGroup = async (
    groupId: string,
    groupName: string,
    groupItems: TestStep[],
    targetKind: "local" | "reusable"
  ) => {
    if (!groupItems.length) {
      return;
    }

    if (hasUnsavedStepGroupDrafts(groupItems)) {
      showError(
        new Error("Save or discard the inline edits inside this group before changing how it is linked."),
        targetKind === "reusable" ? "Unable to convert to shared group" : "Unable to convert to local group"
      );
      return;
    }

    const resolvedName = groupName.trim() || groupItems[0]?.group_name?.trim() || "Step group";

    try {
      const reusableGroupId =
        targetKind === "reusable"
          ? await getOrCreateSharedGroupRecord(
              resolvedName,
              groupItems.map((step) => ({
                action: step.action,
                expected_result: step.expected_result,
                step_type: step.step_type,
                automation_code: step.automation_code,
                api_request: step.api_request
              }))
            )
          : null;

      if (isCreating) {
        setDraftSteps((current) =>
          current.map((step) =>
            step.group_id === groupId
              ? {
                  ...step,
                  group_name: resolvedName,
                  group_kind: targetKind,
                  reusable_group_id: reusableGroupId
                }
              : step
          )
        );
      } else if (selectedTestCaseId) {
        const response = await groupSteps.mutateAsync({
          test_case_id: selectedTestCaseId,
          step_ids: groupItems.map((step) => step.id),
          name: resolvedName,
          kind: targetKind,
          group_id: groupId,
          reusable_group_id: reusableGroupId || undefined
        });
        setExpandedStepGroupIds((current) =>
          current.includes(groupId) ? [...current.filter((id) => id !== groupId), response.group_id] : current
        );
        await queryClient.invalidateQueries({ queryKey: ["test-case-steps", selectedTestCaseId] });
      }

      if (targetKind === "reusable" || groupItems.some((step) => step.reusable_group_id)) {
        await refreshSharedGroups();
      }

      showSuccess(
        targetKind === "reusable"
          ? `Converted "${resolvedName}" to a shared group.`
          : `Converted "${resolvedName}" to a local step group.`
      );
    } catch (error) {
      showError(error, targetKind === "reusable" ? "Unable to convert to shared group" : "Unable to convert to local group");
    }
  };

  const activateStepInsert = (index: number, groupContext: StepInsertionGroupContext | null = null) => {
    setStepInsertIndex(index);
    setStepInsertGroupContext(groupContext);
    setNewStepDraft(EMPTY_STEP_DRAFT);
  };

  const cancelStepInsert = () => {
    setStepInsertIndex(null);
    setStepInsertGroupContext(null);
    setNewStepDraft(EMPTY_STEP_DRAFT);
  };

  const clearStepSelectionIfClipboardActive = () => {
    if (copiedSteps.length || cutStepSource?.stepIds.length) {
      setSelectedStepIds([]);
    }
  };

  const persistSelectedSuiteParameterValues = async () => {
    if (!selectedParameterSuite) {
      return;
    }

    const normalizedCurrentValues = normalizeSuiteParameterValues(suiteParameterValues);
    const normalizedSavedValues = normalizeSuiteParameterValues(selectedParameterSuite.parameter_values);

    if (areSuiteParameterValuesEqual(normalizedCurrentValues, normalizedSavedValues)) {
      clearStoredSuiteParameterDraft(selectedSuiteParameterDraftScopeKey);
      return;
    }

    await updateSuite.mutateAsync({
      id: selectedParameterSuite.id,
      input: {
        parameter_values: normalizedCurrentValues
      }
    });
    syncCachedSuiteParameterValues(selectedParameterSuite.id, normalizedCurrentValues);
    clearStoredSuiteParameterDraft(selectedSuiteParameterDraftScopeKey);
  };

	  const handleSaveCaseDirect = async (announce = true, stepOverrides: Record<string, StepDraft> = {}) => {
	    if ((isCreating && !canCreateTestCases) || (!isCreating && !canUpdateTestCases)) {
	      showError(new Error(`Permission required: ${isCreating ? "testcase.create" : "testcase.update"}`), isCreating ? "Unable to create test case" : "Unable to update test case");
	      return false;
	    }

	    try {
	      await persistSelectedSuiteParameterValues();
      const labels = parseReferenceList(caseDraft.labelsText);
      const persistedSteps = displaySteps.map((step, index) => {
        const draft = stepOverrides[step.id] || stepDrafts[step.id];
        return {
          id: step.id,
          test_case_id: step.test_case_id,
          step_order: index + 1,
          action: draft?.action ?? step.action ?? "",
          expected_result: draft?.expected_result ?? step.expected_result ?? "",
          step_type: normalizeStepType(draft?.step_type || step.step_type),
          automation_code: normalizeAutomationCode(draft?.automation_code ?? step.automation_code),
          api_request: normalizeApiRequest(draft?.api_request ?? step.api_request),
          group_id: step.group_id || null,
          group_name: step.group_name || null,
          group_kind: step.group_kind || null,
          reusable_group_id: step.reusable_group_id || null
        };
      });
      const resolvedAiQualityScore = calculateTestCaseAiQualityScore({
        title: caseDraft.title,
        description: caseDraft.description,
        steps: persistedSteps,
        requirementId: caseDraft.requirement_id,
        labels,
        parameterValues: testCaseParameterValues
      });

      if (isCreating) {
        const response = await createTestCase.mutateAsync({
          ...caseDraft.customFields,
          app_type_id: appTypeId,
          suite_ids: createSuiteContextId ? [createSuiteContextId] : [],
          title: caseDraft.title,
          description: caseDraft.description || undefined,
          external_references: parseReferenceList(caseDraft.externalReferencesText),
          labels,
          parameter_values: testCaseParameterValues,
          automated: caseDraft.automated,
          priority: Number(caseDraft.priority),
          status: caseDraft.status,
          requirement_ids: caseDraft.requirement_id ? [caseDraft.requirement_id] : [],
          reviewer_id: caseDraft.reviewer_id || null,
          review_status: caseDraft.reviewer_id ? "pending" : "not_requested",
          ai_quality_score: resolvedAiQualityScore,
          steps: normalizeDraftSteps(draftSteps)
        });

        if (caseDraft.module_id) {
          await assignCasesToModule.mutateAsync({
            id: caseDraft.module_id,
            testCaseIds: [response.id],
            append: true
          });
        }

        clearStoredTestCaseParameterDraft(createCaseParameterDraftScopeKey);
        syncTestCaseSearchParams(response.id);
        setCreateSuiteContextId("");
        setSelectedTestCaseId(response.id);
        setIsCreating(false);
        setDraftSteps([]);
        setSelectedStepIds([]);
        setStepInsertIndex(null);
        setStepInsertGroupContext(null);
        if (announce) {
          showSuccess("Test case created with its draft steps.");
        }
      } else if (selectedTestCase) {
        const existingAutomationStatus = selectedTestCase.automation_status
          || (selectedTestCase.automated === "yes" ? "ready" : "not_automated");
        const hasMappedAutomation = displaySteps.some((step) => stepHasAutomation(stepDrafts[step.id] || step));

        await updateTestCase.mutateAsync({
          id: selectedTestCase.id,
          input: {
            ...caseDraft.customFields,
            app_type_id: appTypeId,
            title: caseDraft.title,
            description: caseDraft.description,
            external_references: parseReferenceList(caseDraft.externalReferencesText),
            labels,
            parameter_values: testCaseParameterValues,
            automated: caseDraft.automated,
            automation_status: caseDraft.automated === "yes"
              ? selectedTestCase.automated === "yes" ? existingAutomationStatus : hasMappedAutomation ? "ready" : "incomplete"
              : "not_automated",
            priority: Number(caseDraft.priority),
            status: caseDraft.status,
            requirement_ids: caseDraft.requirement_id ? [caseDraft.requirement_id] : [],
            reviewer_id: caseDraft.reviewer_id || null,
            ai_quality_score: resolvedAiQualityScore,
            expected_revision: selectedTestCase.revision,
            steps: persistedSteps
          }
        });

        if (caseDraft.module_id && caseDraft.module_id !== selectedCaseModuleId) {
          await assignCasesToModule.mutateAsync({
            id: caseDraft.module_id,
            testCaseIds: [selectedTestCase.id],
            append: true
          });
        } else if (!caseDraft.module_id && selectedCaseModuleId) {
          await removeCasesFromModule.mutateAsync({
            id: selectedCaseModuleId,
            testCaseIds: [selectedTestCase.id]
          });
        }

        syncCachedTestCaseParameterValues(selectedTestCase.id, testCaseParameterValues);
        clearStoredTestCaseParameterDraft(selectedCaseParameterDraftScopeKey);
        await queryClient.invalidateQueries({ queryKey: ["test-case-steps", selectedTestCase.id] });
        if (persistedSteps.some((step) => step.reusable_group_id)) {
          await refreshSharedGroups();
        }
        clearStepSelectionIfClipboardActive();
        if (announce) {
          showSuccess("Test case updated.");
        }
      }

      await refreshCases();
      return true;
    } catch (error) {
      showError(error, "Unable to save test case");
      return false;
    }
  };

  const handleSaveCase = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await handleSaveCaseAndSteps();
  };

  const handleSaveCaseAndSteps = async (stepOverrides: Record<string, StepDraft> = {}, successMessage?: string) => {
    const didSaveCase = await handleSaveCaseDirect(false, stepOverrides);

    if (!didSaveCase) {
      return false;
    }

    showSuccess(successMessage || (isCreating ? "Test case created with its draft steps." : "Test case details, test data, preconditions, and steps saved."));
    return true;
  };

	  const handleDeleteCase = async () => {
	    if (!canDeleteTestCases) {
	      showError(new Error("Permission required: testcase.delete"), "Unable to delete test case");
	      return;
	    }

	    if (!selectedTestCase || !(await confirmDelete({ message: `Delete test case "${selectedTestCase.title}"? Historical run evidence will stay preserved.` }))) {
	      return;
	    }

    try {
      await deleteTestCase.mutateAsync(selectedTestCase.id);
      clearStoredTestCaseParameterDraft(buildTestCaseParameterDraftScopeKey({ isCreating: false, testCaseId: selectedTestCase.id }));
      setSelectedActionTestCaseIds((current) => current.filter((id) => id !== selectedTestCase.id));
      syncTestCaseSearchParams(null);
      setSelectedTestCaseId("");
      setCaseDraft(emptyCaseDraft);
      setIsCreating(false);
      setSelectedStepIds([]);
      setStepInsertIndex(null);
      setStepInsertGroupContext(null);
      showSuccess("Test case deleted. Run snapshots remain available.");
      await refreshCases();
    } catch (error) {
      showError(error, "Unable to delete test case");
    }
  };

	  const handleDeleteSelectedCases = async () => {
	    const selectedCases = testCases.filter((item) => selectedActionTestCaseIds.includes(item.id));

	    if (!selectedCases.length || !canDeleteTestCases) {
	      return;
	    }

    const confirmed = await confirmDelete({
      message: `Delete ${selectedCases.length} test case${selectedCases.length === 1 ? "" : "s"}? Historical execution evidence will stay preserved.`
    });

    if (!confirmed) {
      return;
    }

    setIsDeletingSelectedTestCases(true);

    try {
      const results = await Promise.allSettled(selectedCases.map((testCase) => api.testCases.delete(testCase.id)));
      const deletedIds = selectedCases
        .filter((_, index) => results[index]?.status === "fulfilled")
        .map((testCase) => testCase.id);
      const failedResults = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");

      deletedIds.forEach((testCaseId) => {
        clearStoredTestCaseParameterDraft(buildTestCaseParameterDraftScopeKey({ isCreating: false, testCaseId }));
      });
      setSelectedActionTestCaseIds((current) => current.filter((id) => !deletedIds.includes(id)));

      if (deletedIds.includes(selectedTestCaseId)) {
        syncTestCaseSearchParams(null);
        setSelectedTestCaseId("");
        setCaseDraft(emptyCaseDraft);
        setDraftSteps([]);
        setNewStepDraft(EMPTY_STEP_DRAFT);
        setStepInsertIndex(null);
        setStepInsertGroupContext(null);
        setSelectedStepIds([]);
        setExpandedStepIds([]);
        setExpandedStepGroupIds([]);
        setIsCreating(false);
      }

      if (deletedIds.length) {
        await refreshCases();
      }

      if (!failedResults.length) {
        showSuccess(`${deletedIds.length} test case${deletedIds.length === 1 ? "" : "s"} deleted. Run history remains preserved.`);
        return;
      }

      const firstError = failedResults[0]?.reason;
      setMessageTone("error");
      setMessage(
        `${deletedIds.length} test case${deletedIds.length === 1 ? "" : "s"} deleted, ${failedResults.length} failed.${firstError instanceof Error ? ` ${firstError.message}` : ""}`
      );
    } finally {
      setIsDeletingSelectedTestCases(false);
    }
  };

  const handleCreateModule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!appTypeId || !moduleDraftName.trim()) {
      return;
    }

    try {
      const response = await createTestCaseModule.mutateAsync({
        app_type_id: appTypeId,
        name: moduleDraftName.trim(),
        description: moduleDraftDescription.trim() || undefined,
        test_case_ids: selectedActionTestCaseIds
      });
      setModuleDraftName("");
      setModuleDraftDescription("");
      setIsCreateModuleModalOpen(false);
      setCollapsedModuleIds((current) => current.filter((id) => id !== response.id));
      showSuccess(selectedActionTestCaseIds.length ? "Module created and selected cases were grouped." : "Module created.");
      await refreshCases();
    } catch (error) {
      showError(error, "Unable to create module");
    }
  };

  const getDragCaseIds = (testCaseId: string) =>
    selectedActionTestCaseIds.includes(testCaseId) ? selectedActionTestCaseIds : [testCaseId];

  const startDraggingTestCases = (testCaseId: string) => {
    setDraggingCaseIds(getDragCaseIds(testCaseId));
  };

  const handleDropCaseOnModule = async (moduleId: string) => {
    if (!draggingCaseIds.length) {
      return;
    }

    try {
      await assignCasesToModule.mutateAsync({ id: moduleId, testCaseIds: draggingCaseIds, append: true });
      const movedCount = draggingCaseIds.length;
      setDraggingCaseIds([]);
      setCollapsedModuleIds((current) => current.filter((id) => id !== moduleId));
      showSuccess(`${movedCount} test case${movedCount === 1 ? "" : "s"} moved into module.`);
      await refreshCases();
    } catch (error) {
      setDraggingCaseIds([]);
      showError(error, "Unable to move test case");
    }
  };

  const handleRenameModule = async (moduleId: string) => {
    if (!renamingModuleName.trim()) {
      return;
    }

    try {
      await updateTestCaseModule.mutateAsync({
        id: moduleId,
        input: { name: renamingModuleName.trim() }
      });
      setRenamingModuleId("");
      setRenamingModuleName("");
      showSuccess("Module renamed.");
      await refreshCases();
    } catch (error) {
      showError(error, "Unable to rename module");
    }
  };

  const handleDeleteSelectedModules = async () => {
    if (!selectedModuleIds.length) {
      return;
    }

    const confirmed = await confirmDelete({
      message: `Delete ${selectedModuleIds.length} module${selectedModuleIds.length === 1 ? "" : "s"}? Test cases will stay available as unassigned cases.`
    });

    if (!confirmed) {
      return;
    }

    try {
      await Promise.all(selectedModuleIds.map((moduleId) => deleteTestCaseModule.mutateAsync(moduleId)));
      setSelectedModuleIds([]);
      showSuccess("Selected module deleted.");
      await refreshCases();
    } catch (error) {
      showError(error, "Unable to delete selected modules");
    }
  };

  const handleDeleteSelectedTestCaseItems = async () => {
    const selectedCases = testCases.filter((item) => selectedActionTestCaseIds.includes(item.id));
    const selectedModules = selectedModuleIds;

    if (!selectedCases.length && !selectedModules.length) {
      return;
    }

    if ((selectedCases.length && !canDeleteTestCases) || (selectedModules.length && !canDeleteTestCases)) {
      showError(new Error("Permission required: testcase.delete"), "Unable to delete selected items");
      return;
    }

    const parts = [
      selectedCases.length ? `${selectedCases.length} test case${selectedCases.length === 1 ? "" : "s"}` : "",
      selectedModules.length ? `${selectedModules.length} module${selectedModules.length === 1 ? "" : "s"}` : ""
    ].filter(Boolean);
    const confirmed = await confirmDelete({
      message: `Delete ${parts.join(" and ")}? Historical execution evidence stays preserved; only cases not selected for deletion remain unassigned when a module is removed.`
    });

    if (!confirmed) {
      return;
    }

    setIsDeletingSelectedTestCases(true);

    try {
      const [caseResults, moduleResults] = await Promise.all([
        Promise.allSettled(selectedCases.map((testCase) => api.testCases.delete(testCase.id))),
        Promise.allSettled(selectedModules.map((moduleId) => deleteTestCaseModule.mutateAsync(moduleId)))
      ]);
      const deletedCaseIds = selectedCases
        .filter((_, index) => caseResults[index]?.status === "fulfilled")
        .map((testCase) => testCase.id);
      const deletedModuleIds = selectedModules.filter((_, index) => moduleResults[index]?.status === "fulfilled");
      const failedCount = caseResults.filter((result) => result.status === "rejected").length + moduleResults.filter((result) => result.status === "rejected").length;

      deletedCaseIds.forEach((testCaseId) => {
        clearStoredTestCaseParameterDraft(buildTestCaseParameterDraftScopeKey({ isCreating: false, testCaseId }));
      });
      setSelectedActionTestCaseIds((current) => current.filter((id) => !deletedCaseIds.includes(id)));
      setSelectedModuleIds((current) => current.filter((id) => !deletedModuleIds.includes(id)));

      if (deletedCaseIds.includes(selectedTestCaseId)) {
        syncTestCaseSearchParams(null);
        setSelectedTestCaseId("");
        setCaseDraft(emptyCaseDraft);
        setDraftSteps([]);
        setNewStepDraft(EMPTY_STEP_DRAFT);
        setStepInsertIndex(null);
        setStepInsertGroupContext(null);
        setSelectedStepIds([]);
        setExpandedStepIds([]);
        setExpandedStepGroupIds([]);
        setIsCreating(false);
      }

      if (deletedCaseIds.length || deletedModuleIds.length) {
        await refreshCases();
      }

      if (failedCount) {
        setMessageTone("error");
        setMessage(`${deletedCaseIds.length} test case${deletedCaseIds.length === 1 ? "" : "s"} and ${deletedModuleIds.length} module${deletedModuleIds.length === 1 ? "" : "s"} deleted, ${failedCount} failed.`);
        return;
      }

      showSuccess(`${deletedCaseIds.length} test case${deletedCaseIds.length === 1 ? "" : "s"} and ${deletedModuleIds.length} module${deletedModuleIds.length === 1 ? "" : "s"} deleted.`);
    } catch (error) {
      showError(error, "Unable to delete selected items");
    } finally {
      setIsDeletingSelectedTestCases(false);
    }
  };

  const handleSubmitReviewForCase = async (testCaseId: string, reviewStatus: "accepted" | "changes_requested", comment = "") => {
    if (!testCaseId) {
      return;
    }

    try {
      await reviewTestCase.mutateAsync({
        id: testCaseId,
        input: {
          review_status: reviewStatus,
          comment: comment.trim() || undefined
        }
      });
      showSuccess(reviewStatus === "accepted" ? "Test case review accepted." : "Review feedback captured.");
      await refreshCases();
    } catch (error) {
      showError(error, "Unable to update review status");
    }
  };

  const handleSubmitReview = async (reviewStatus: "accepted" | "changes_requested") => {
    if (!selectedTestCase) {
      return;
    }

    await handleSubmitReviewForCase(selectedTestCase.id, reviewStatus, reviewComment);
    setReviewComment("");
  };

  const openReviewSuggestionDialog = (testCaseId: string, comment = "") => {
    setReviewSuggestionCaseId(testCaseId);
    setReviewSuggestionComment(comment);
    setReviewSuggestionConfirmed(true);
  };

  const handleSubmitReviewSuggestion = async () => {
    await handleSubmitReviewForCase(reviewSuggestionCaseId, "changes_requested", reviewSuggestionComment);
    setReviewSuggestionCaseId("");
    setReviewSuggestionComment("");
    setReviewSuggestionConfirmed(true);
  };

	  const handleOpenSuiteLinkModal = () => {
	    if (!canUpdateSuites) {
	      showError(new Error("Permission required: suite.update"), "Unable to link suites");
	      return;
	    }

	    if (!selectedTestCase) {
	      return;
    }

    setSuiteLinkDraftIds(selectedCaseSuiteIdsForModal);
    setIsSuiteLinkModalOpen(true);
  };

	  const handleSaveSuiteLinks = async () => {
	    if (!canUpdateSuites) {
	      showError(new Error("Permission required: suite.update"), "Unable to update suite references");
	      return;
	    }

	    if (!selectedTestCase) {
	      return;
    }

    const nextSuiteIds = Array.from(new Set(suiteLinkDraftIds.filter(Boolean)));
    const currentSuiteIds = Array.from(new Set(selectedCaseSuiteIdsForModal.filter(Boolean)));

    if (
      nextSuiteIds.length === currentSuiteIds.length &&
      nextSuiteIds.every((suiteId) => currentSuiteIds.includes(suiteId))
    ) {
      setIsSuiteLinkModalOpen(false);
      setSuiteLinkDraftIds([]);
      return;
    }

    try {
      await updateTestCase.mutateAsync({
        id: selectedTestCase.id,
        input: {
          suite_ids: nextSuiteIds
        }
      });

      syncCachedTestCaseSuiteIds(selectedTestCase.id, nextSuiteIds);
      setIsSuiteLinkModalOpen(false);
      setSuiteLinkDraftIds([]);
      showSuccess(
        nextSuiteIds.length
          ? `Updated suite references for "${selectedTestCase.title}".`
          : `Removed all suite references from "${selectedTestCase.title}".`
      );
      await refreshCases();
    } catch (error) {
      showError(error, "Unable to update suite references");
    }
  };

	  const handleCreateSuite = async (input: { name: string; labels: string[]; selectedIds: string[]; parallel_enabled: boolean; parallel_count: number }) => {
	    if (!canCreateSuites) {
	      setMessageTone("error");
	      setMessage("Permission required: suite.create");
	      return;
	    }

	    if (!appTypeId) {
	      setMessageTone("error");
      setMessage("Select an app type before creating a suite.");
      return;
    }

    try {
      const response = await createSuite.mutateAsync({
        app_type_id: appTypeId,
        name: input.name,
        labels: input.labels,
        parallel_enabled: input.parallel_enabled,
        parallel_count: input.parallel_enabled ? input.parallel_count : 1
      });

      if (input.selectedIds.length) {
        await assignSuiteCases.mutateAsync({
          id: response.id,
          testCaseIds: input.selectedIds
        });
      }

      setIsCreateSuiteModalOpen(false);
      setSelectedActionTestCaseIds([]);
      showSuccess(input.selectedIds.length ? "Suite created and linked to the selected test cases." : "Suite created.");
      await refreshCases();
    } catch (error) {
      showError(error, "Unable to create suite");
    }
  };

	  const openSuiteTransferModal = (testCaseIds: string[], action: SuiteTransferAction = "move") => {
	    if (action === "copy" ? !canCreateTestCases : !canUpdateSuites) {
	      showError(new Error(`Permission required: ${action === "copy" ? "testcase.create" : "suite.update"}`), "Unable to open suite transfer");
	      return;
	    }

	    const normalizedCaseIds = Array.from(new Set(testCaseIds.filter(Boolean)));

    if (!normalizedCaseIds.length) {
      showError(new Error("Select one or more test cases first."), "Unable to open suite transfer");
      return;
    }

    setSuiteTransferAction(action);
    setSuiteTransferCaseIds(normalizedCaseIds);
    setSuiteTransferProjectId(projectId || "");
    setSuiteTransferAppTypeId(appTypeId || "");
    setSuiteTransferSuiteIds([]);
    setIsSuiteTransferModalOpen(true);
  };

  const closeSuiteTransferModal = () => {
    setIsSuiteTransferModalOpen(false);
    setSuiteTransferCaseIds([]);
    setSuiteTransferSuiteIds([]);
  };

  const handleApplySuiteTransfer = async () => {
    const targetAppType = allAppTypes.find((item) => item.id === suiteTransferAppTypeId) || null;
    const selectedCases = testCases.filter((item) => suiteTransferCaseIds.includes(item.id));

    if (!targetAppType || !selectedCases.length) {
      showError(new Error("Select a target app type and at least one test case."), "Unable to update suite links");
      return;
    }

    if (!suiteTransferSuiteIds.length) {
      showError(new Error("Select one or more target suites."), "Unable to update suite links");
      return;
    }

    const isCrossAppType = suiteTransferAppTypeId !== appTypeId;
    const isCrossProject = String(targetAppType.project_id) !== String(projectId);

    if (suiteTransferAction === "add" && isCrossAppType) {
      showError(new Error("Use Copy or Move when the target suite belongs to another app type or project."), "Unable to add suite links");
      return;
    }

    try {
      if (suiteTransferAction === "copy") {
        for (const testCase of selectedCases) {
          const caseSteps = await queryClient.fetchQuery({
            queryKey: ["test-case-steps", testCase.id],
            queryFn: () => api.testSteps.list({ test_case_id: testCase.id }),
            staleTime: 30_000
          });
          await createTestCase.mutateAsync({
            app_type_id: suiteTransferAppTypeId,
            suite_ids: suiteTransferSuiteIds,
            title: `${testCase.title} (Copy)`,
            description: testCase.description || undefined,
            external_references: testCase.external_references || [],
            parameter_values: testCase.parameter_values || undefined,
            automated: testCase.automated || defaultTestCaseAutomated,
            priority: testCase.priority || 3,
            status: testCase.status || defaultTestCaseStatus,
            requirement_ids: isCrossProject
              ? []
              : testCase.requirement_ids || (testCase.requirement_id ? [testCase.requirement_id] : []),
            steps: caseSteps.map((step) => ({
              step_order: step.step_order,
              action: step.action || undefined,
              expected_result: step.expected_result || undefined,
              step_type: step.step_type,
              automation_code: step.automation_code || undefined,
              api_request: step.api_request || undefined,
              group_id: step.group_id || undefined,
              group_name: step.group_name || undefined,
              group_kind: step.group_kind || undefined,
              reusable_group_id: step.reusable_group_id || undefined
            }))
          });
        }
      } else {
        for (const testCase of selectedCases) {
          const currentSuiteIds = testCase.suite_ids || (testCase.suite_id ? [testCase.suite_id] : []);
          const nextSuiteIds = suiteTransferAction === "add"
            ? Array.from(new Set([...currentSuiteIds, ...suiteTransferSuiteIds]))
            : suiteTransferSuiteIds;

          await updateTestCase.mutateAsync({
            id: testCase.id,
            input: {
              app_type_id: suiteTransferAppTypeId,
              suite_ids: nextSuiteIds,
              requirement_ids: isCrossProject
                ? []
                : testCase.requirement_ids || (testCase.requirement_id ? [testCase.requirement_id] : [])
            }
          });
          syncCachedTestCaseSuiteIds(testCase.id, nextSuiteIds);
        }
      }

      closeSuiteTransferModal();
      setSelectedActionTestCaseIds([]);
      await refreshCases();
      await queryClient.invalidateQueries({ queryKey: ["test-case-suites", suiteTransferAppTypeId] });
      showSuccess(
        suiteTransferAction === "copy"
          ? `Copied ${selectedCases.length} case${selectedCases.length === 1 ? "" : "s"} into the selected suite scope.`
          : suiteTransferAction === "add"
            ? `Added ${selectedCases.length} case${selectedCases.length === 1 ? "" : "s"} to the selected suite link${suiteTransferSuiteIds.length === 1 ? "" : "s"}.`
            : `Moved ${selectedCases.length} case${selectedCases.length === 1 ? "" : "s"} to the selected suite link${suiteTransferSuiteIds.length === 1 ? "" : "s"}.`
      );
    } catch (error) {
      showError(error, "Unable to update suite links");
    }
  };

	  const handleCreateExecution = async (event: FormEvent<HTMLFormElement>) => {
	    event.preventDefault();

		    const canCreateSelectedRunMode = executionStartMode === "local"
		      ? canRunLocalAutomation
		      : executionStartMode === "remote"
		        ? canRunRemoteAutomation
		        : canCreateRuns;

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

	    if (!session?.user.id) {
	      setMessageTone("error");
	      setMessage("You need an active session before creating a run.");
      return;
    }

    if (!projectId || !appTypeId || !selectedActionTestCaseIds.length) {
      setMessageTone("error");
      setMessage("Select one or more test cases before creating a run.");
      return;
    }

    try {
      const response = await createExecution.mutateAsync({
        project_id: projectId,
        app_type_id: appTypeId,
        test_case_ids: selectedActionTestCaseIds,
        test_environment_id: selectedExecutionEnvironmentId || undefined,
        test_configuration_id: selectedExecutionConfigurationId || undefined,
        test_data_set_id: selectedExecutionDataSetId || undefined,
        parallel_enabled: executionParallelEnabled,
        parallel_count: executionParallelEnabled ? executionParallelCount : 1,
        execution_mode: executionStartMode,
        engine_base_url: executionStartMode === "local" ? "http://host.docker.internal:4301" : undefined,
        assigned_to_ids: selectedExecutionAssigneeIds.length ? selectedExecutionAssigneeIds : undefined,
        release: executionRelease.trim() || undefined,
        sprint: executionSprint.trim() || undefined,
        build: executionBuild.trim() || undefined,
        name: executionName.trim() || undefined,
        created_by: session.user.id
      });

      closeCreateExecutionModal();
      setSelectedActionTestCaseIds([]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["executions"] }),
        queryClient.invalidateQueries({ queryKey: ["executions", projectId] })
      ]);
      navigate(`/executions?view=${executionStartMode === "local" ? "local-runs" : "test-case-runs"}&execution=${response.id}`);
      showSuccess(
        executionStartMode === "manual"
          ? `Manual run created with ${selectedActionTestCaseIds.length} selected test case${selectedActionTestCaseIds.length === 1 ? "" : "s"}.`
          : `${executionStartMode === "local" ? "Local" : "Remote"} run created and started with ${selectedActionTestCaseIds.length} selected test case${selectedActionTestCaseIds.length === 1 ? "" : "s"}.`
      );
    } catch (error) {
      showError(error, "Unable to create run");
    }
  };

	  const handleBuildSelectedAutomation = async () => {
	    if (!canBuildAutomation) {
	      showError(new Error("Permission required: automation.build"), "Unable to build automation");
	      return;
	    }

	    if (!appTypeId || !automationTargetCaseIds.length) {
	      showError(new Error("Select one or more test cases before building automation."), "Unable to build automation");
	      return;
    }

    try {
      if (automationTargetCaseIds.length === 1) {
        const response = await buildSingleAutomation.mutateAsync({ testCaseId: automationTargetCaseIds[0] });
        showSuccess(`Automation generator queued as ${response.transaction_id.slice(0, 8)}. Track it in TestOps.`);
      } else {
        const response = await buildBatchAutomation.mutateAsync({ testCaseIds: automationTargetCaseIds });
        showSuccess(`Batch AI automation queued as ${response.transaction_id}. Track it in TestOps.`);
      }

      await refreshCases();
    } catch (error) {
      showError(error, "Unable to build automation");
    }
  };

	  const handleScheduleSelectedManualAutomation = async () => {
	    if (!canBuildAutomation || !canUseAutomationAi) {
	      showError(new Error(`Permission required: ${!canBuildAutomation ? "automation.build" : "automation.ai"}`), "Unable to schedule AI automation");
	      return;
	    }

	    if (!appTypeId || !selectedManualAutomationCases.length) {
	      showError(new Error("Select one or more manual test cases before scheduling AI automation."), "Unable to schedule AI automation");
      return;
    }

    try {
      const response = await buildBatchAutomation.mutateAsync({
        testCaseIds: selectedManualAutomationCases.map((testCase) => testCase.id)
      });
      showSuccess(`Batch AI automation scheduled as ${response.transaction_id.slice(0, 8)}. TestOps will process the manual cases one by one.`);
      await refreshCases();
    } catch (error) {
      showError(error, "Unable to schedule AI automation");
    }
  };

	  const handleStartRecorder = async (options: RecorderStartOptions, targetStepId = inspectingStepId) => {
	    if (!canUseRecorder) {
	      showError(new Error("Permission required: automation.recorder"), "Unable to start recorder");
	      return;
	    }

	    if (!selectedTestCase) {
	      showError(new Error("Select a saved test case before starting the recorder."), "Unable to start recorder");
      return;
    }

    if (!testEngineIntegration) {
      showError(new Error("Configure an active Test Engine integration before starting the recorder."), "Unable to start recorder");
      return;
    }

    try {
      const response = await startRecorder.mutateAsync({ testCaseId: selectedTestCase.id, options, targetStepId: targetStepId || undefined });
      setRecorderSession(response);
      setRecorderSessionCaseId(selectedTestCase.id);
      setRecorderStartOptions(options);
      showSuccess(response.reused
        ? "Reused the open local browser and started a fresh capture for this step."
        : response.live_view_url ? "Recorder live view is ready in QAira." : "Recorder started in the Test Engine browser session.");
    } catch (error) {
      showError(error, "Unable to start recorder");
    }
  };

  const handleFinishRecorder = async () => {
    if (!recorderSession?.id || !recorderSessionCaseId) {
      showError(new Error("Start a recorder session before finishing it."), "Unable to finish recorder session");
      return;
    }

    try {
      const response = await finishRecorder.mutateAsync({
        testCaseId: recorderSessionCaseId,
        sessionId: recorderSession.id,
        recorderStartOptions,
        transactionId: recorderSession.transaction_id,
        targetStepId: inspectingStepId || undefined
      });
      setRecorderSession(null);
      setRecorderSessionCaseId("");
      setInspectingStepId("");
      setRecentRecorderCompletedCaseId(recorderSessionCaseId);
      showSuccess(
        response.generated_step_count
          ? `Recorder stopped. Created ${response.created_step_count || 0} and updated ${response.updated_step_count || 0} web step${response.generated_step_count === 1 ? "" : "s"}. You can run it locally now.`
          : "Recorder stopped. No supported interactions were captured for step creation."
      );
      await refreshCases();
    } catch (error) {
      showError(error, "Unable to finish recorder session");
    }
  };

  const openExecutionHistoryResult = (result: ExecutionResult) => {
    const params = new URLSearchParams({
      execution: result.execution_id,
      testCase: result.test_case_id
    });

    navigate(`/executions?${params.toString()}`);
  };

  const handleCreateStep = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedDraft = {
      action: newStepDraft.action.trim(),
      expected_result: newStepDraft.expected_result.trim(),
      step_type: normalizeStepType(newStepDraft.step_type),
      automation_code: normalizeAutomationCode(newStepDraft.automation_code),
      api_request: normalizeApiRequest(newStepDraft.api_request)
    };

    if (!normalizedDraft.action && !normalizedDraft.expected_result) {
      setMessageTone("error");
      setMessage("Add an action or expected result before creating a step.");
      return;
    }

    if (isCreating) {
      const draftId = createDraftStepId();
      const insertionIndex = resolveStepInsertIndex(draftSteps);
      const insertionGroupContext =
        stepInsertIndex !== null && stepInsertGroupContext
          ? stepInsertGroupContext
          : getInsertionGroupContext(displaySteps, insertionIndex);

      setDraftSteps((current) => {
        const next = [...current];
        next.splice(insertionIndex, 0, {
          id: draftId,
          ...normalizedDraft,
          group_id: insertionGroupContext?.group_id || null,
          group_name: insertionGroupContext?.group_name || null,
          group_kind: insertionGroupContext?.group_kind || null,
          reusable_group_id: insertionGroupContext?.reusable_group_id || null
        });
        return next;
      });
      setExpandedStepIds((current) => [...new Set([...current, draftId])]);
      setNewStepDraft(EMPTY_STEP_DRAFT);
      setStepInsertIndex(null);
      setStepInsertGroupContext(null);
      showSuccess("Draft step added to the new test case.");
      return;
    }

    if (!selectedTestCaseId) {
      return;
    }

    try {
      const insertionIndex = resolveStepInsertIndex(steps);
      const insertionGroupContext =
        stepInsertIndex !== null && stepInsertGroupContext
          ? stepInsertGroupContext
          : getInsertionGroupContext(displaySteps, insertionIndex);
      const nextStepOrder = insertionIndex + 1;
      const response = await createStep.mutateAsync({
        test_case_id: selectedTestCaseId,
        step_order: nextStepOrder,
        action: normalizedDraft.action || undefined,
        expected_result: normalizedDraft.expected_result || undefined,
        step_type: normalizedDraft.step_type,
        automation_code: normalizedDraft.automation_code || undefined,
        api_request: normalizedDraft.api_request || undefined,
        group_id: insertionGroupContext?.group_id || undefined,
        group_name: insertionGroupContext?.group_name || undefined,
        group_kind: insertionGroupContext?.group_kind || undefined,
        reusable_group_id: insertionGroupContext?.reusable_group_id || undefined
      });
      setNewStepDraft(EMPTY_STEP_DRAFT);
      setStepInsertIndex(null);
      setStepInsertGroupContext(null);
      setExpandedStepIds((current) => [...new Set([...current, response.id])]);
      showSuccess("Step added.");
      await queryClient.invalidateQueries({ queryKey: ["test-case-steps", selectedTestCaseId] });
      if (insertionGroupContext?.reusable_group_id) {
        await refreshSharedGroups();
      }
    } catch (error) {
      showError(error, "Unable to add step");
    }
  };

  useEffect(() => {
    setStepInsertIndex(null);
    setStepInsertGroupContext(null);
  }, [isCreating, selectedTestCaseId]);

  const handleUpdateStep = async (step: TestStep, input: StepDraft) => {
    const normalizedInput = {
      action: input.action,
      expected_result: input.expected_result,
      step_type: normalizeStepType(input.step_type),
      automation_code: normalizeAutomationCode(input.automation_code),
      api_request: normalizeApiRequest(input.api_request)
    };

    setStepDrafts((current) => ({
      ...current,
      [step.id]: normalizedInput
    }));
    await handleSaveCaseAndSteps({ [step.id]: normalizedInput }, "Test case and step edits saved.");
  };

  const handleReorderStep = async (stepId: string, direction: "up" | "down") => {
    if (!selectedTestCaseId) {
      return;
    }

    const currentIndex = steps.findIndex((step) => step.id === stepId);
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

    if (currentIndex === -1 || targetIndex < 0 || targetIndex >= steps.length) {
      return;
    }

    const currentStep = steps[currentIndex];
    const targetStep = steps[targetIndex];

    let reordered: TestStep[] = [];

    if (currentStep.group_id) {
      if (targetStep.group_id !== currentStep.group_id) {
        return;
      }

      reordered = [...steps];
      const [movedStep] = reordered.splice(currentIndex, 1);
      reordered.splice(targetIndex, 0, movedStep);
    } else {
      const blocks = buildStepBlocks(steps);
      const blockIndex = blocks.findIndex((block) => block.steps.some((step) => step.id === stepId));
      const swapIndex = direction === "up" ? blockIndex - 1 : blockIndex + 1;

      if (blockIndex === -1 || swapIndex < 0 || swapIndex >= blocks.length) {
        return;
      }

      const reorderedBlocks = [...blocks];
      const [movedBlock] = reorderedBlocks.splice(blockIndex, 1);
      reorderedBlocks.splice(swapIndex, 0, movedBlock);
      const newOrderIds = reorderedBlocks.flatMap((block) => block.steps.map((step) => step.id));
      const stepById = new Map(steps.map((step) => [step.id, step]));
      reordered = newOrderIds.map((id) => stepById.get(id)).filter(Boolean) as TestStep[];
    }

    try {
      await reorderSteps.mutateAsync({
        testCaseId: selectedTestCaseId,
        stepIds: reordered.map((step) => step.id)
      });
      showSuccess("Step order updated.");
      await queryClient.invalidateQueries({ queryKey: ["test-case-steps", selectedTestCaseId] });
      if (currentStep.reusable_group_id) {
        await refreshSharedGroups();
      }
    } catch (error) {
      showError(error, "Unable to reorder steps");
    }
  };

  const handleMoveStepGroup = async (groupId: string, direction: "up" | "down") => {
    if (!groupId) {
      return;
    }

    const items = displaySteps;
    const blocks = buildStepBlocks(items);
    const blockIndex = blocks.findIndex((block) => block.group_id === groupId);
    const swapIndex = direction === "up" ? blockIndex - 1 : blockIndex + 1;

    if (blockIndex === -1 || swapIndex < 0 || swapIndex >= blocks.length) {
      return;
    }

    const reorderedBlocks = [...blocks];
    const [movedBlock] = reorderedBlocks.splice(blockIndex, 1);
    reorderedBlocks.splice(swapIndex, 0, movedBlock);
    const newOrderIds = reorderedBlocks.flatMap((block) => block.steps.map((step) => step.id));

    if (isCreating) {
      setDraftSteps((current) => {
        const stepById = new Map(current.map((step) => [step.id, step]));
        return newOrderIds.map((id) => stepById.get(id)).filter(Boolean) as DraftTestStep[];
      });
      showSuccess("Step group order updated.");
      return;
    }

    if (!selectedTestCaseId) {
      return;
    }

    try {
      await reorderSteps.mutateAsync({
        testCaseId: selectedTestCaseId,
        stepIds: newOrderIds
      });
      showSuccess("Step group order updated.");
      await queryClient.invalidateQueries({ queryKey: ["test-case-steps", selectedTestCaseId] });
    } catch (error) {
      showError(error, "Unable to move step group");
    }
  };

  const handleDeleteStep = async (stepId: string) => {
    const targetStep = displaySteps.find((step) => step.id === stepId) || null;

    if (isCreating) {
      setDraftSteps((current) => current.filter((step) => step.id !== stepId));
      if (copiedSteps.length || cutStepSource?.stepIds.length) {
        setSelectedStepIds([]);
      } else {
        setSelectedStepIds((current) => current.filter((id) => id !== stepId));
      }
      setExpandedStepIds((current) => current.filter((id) => id !== stepId));
      showSuccess("Draft step removed.");
      return;
    }

    if (!(await confirmDelete({ message: "Delete this step?" }))) {
      return;
    }

    try {
      await deleteStep.mutateAsync(stepId);
      if (copiedSteps.length || cutStepSource?.stepIds.length) {
        setSelectedStepIds([]);
      } else {
        setSelectedStepIds((current) => current.filter((id) => id !== stepId));
      }
      setExpandedStepIds((current) => current.filter((id) => id !== stepId));
      showSuccess("Step deleted.");
      await queryClient.invalidateQueries({ queryKey: ["test-case-steps", selectedTestCaseId] });
      if (targetStep?.reusable_group_id) {
        await refreshSharedGroups();
      }
    } catch (error) {
      showError(error, "Unable to delete step");
    }
  };

  const handleDeleteSelectedSteps = async () => {
    const targetIds = selectedStepIds.filter((id) => displaySteps.some((step) => step.id === id));

    if (!targetIds.length) {
      showError(new Error("Select one or more steps to delete."), "Unable to delete selected steps");
      return;
    }

    const countLabel = `${targetIds.length} selected step${targetIds.length === 1 ? "" : "s"}`;

    if (!(await confirmDelete({ message: `Delete ${countLabel}?` }))) {
      return;
    }

    if (isCreating) {
      setDraftSteps((current) => current.filter((step) => !targetIds.includes(step.id)));
      setSelectedStepIds([]);
      setExpandedStepIds((current) => current.filter((id) => !targetIds.includes(id)));
      cancelStepInsert();
      showSuccess(`${countLabel} deleted.`);
      return;
    }

    if (!selectedTestCaseId) {
      return;
    }

    try {
      const targetSteps = displaySteps.filter((step) => targetIds.includes(step.id));

      for (const stepId of targetIds) {
        await deleteStep.mutateAsync(stepId);
      }

      setSelectedStepIds([]);
      setExpandedStepIds((current) => current.filter((id) => !targetIds.includes(id)));
      cancelStepInsert();
      showSuccess(`${countLabel} deleted.`);
      await queryClient.invalidateQueries({ queryKey: ["test-case-steps", selectedTestCaseId] });
      if (targetSteps.some((step) => step.reusable_group_id)) {
        await refreshSharedGroups();
      }
    } catch (error) {
      showError(error, "Unable to delete selected steps");
    }
  };

  const handleUpdateDraftStep = (stepId: string, input: StepDraft) => {
    setDraftSteps((current) =>
      current.map((step) =>
        step.id === stepId
          ? {
              ...step,
              action: input.action,
              expected_result: input.expected_result,
              step_type: normalizeStepType(input.step_type),
              automation_code: normalizeAutomationCode(input.automation_code),
              api_request: normalizeApiRequest(input.api_request)
            }
          : step
      )
    );
  };

  const handleRephraseStepWithAi = async (step: TestStep) => {
    if (!appTypeId) {
      showError(new Error("Select an app type before asking AI to rephrase a step."), "Unable to rephrase step");
      return;
    }

    const currentDraft = stepDrafts[step.id] || {
      action: step.action || "",
      expected_result: step.expected_result || "",
      step_type: normalizeStepType(step.step_type),
      automation_code: normalizeAutomationCode(step.automation_code),
      api_request: normalizeApiRequest(step.api_request)
    };

    if (!currentDraft.action.trim() && !currentDraft.expected_result.trim()) {
      showError(new Error("Write an action or expected result before asking AI to rephrase this step."), "Unable to rephrase step");
      return;
    }

    setRephrasingStepId(step.id);

    try {
      const response = await rephraseStepWithAi.mutateAsync({
        app_type_id: appTypeId,
        requirement_id: caseDraft.requirement_id || undefined,
        integration_id: integrationId || undefined,
        test_case: {
          title: caseDraft.title || selectedTestCase?.title || "",
          description: caseDraft.description || selectedTestCase?.description || "",
          parameter_values: testCaseParameterValues
        },
        step: {
          step_order: step.step_order,
          step_type: normalizeStepType(currentDraft.step_type || step.step_type),
          action: currentDraft.action,
          expected_result: currentDraft.expected_result
        }
      });
      const nextDraft: StepDraft = {
        ...currentDraft,
        action: response.step.action || "",
        expected_result: response.step.expected_result || "",
        step_type: normalizeStepType(response.step.step_type || currentDraft.step_type)
      };

      if (isCreating) {
        handleUpdateDraftStep(step.id, nextDraft);
      } else {
        await updateStep.mutateAsync({
          id: step.id,
          input: {
            action: nextDraft.action,
            expected_result: nextDraft.expected_result,
            step_type: nextDraft.step_type
          }
        });
        setStepDrafts((current) => ({
          ...current,
          [step.id]: nextDraft
        }));
        await queryClient.invalidateQueries({ queryKey: ["test-case-steps", selectedTestCaseId] });
        if (step.reusable_group_id) {
          await refreshSharedGroups();
        }
      }

      showSuccess(`Step ${step.step_order} rephrased with AI.`);
    } catch (error) {
      showError(error, "Unable to rephrase step");
    } finally {
      setRephrasingStepId("");
    }
  };

  const buildStepBlocks = <T extends { id: string; group_id?: string | null }>(items: T[]) =>
    items.reduce<Array<{ group_id: string | null; steps: T[] }>>((blocks, step) => {
      const previousBlock = blocks[blocks.length - 1];

      const resolvedGroupId = step.group_id ?? null;

      if (resolvedGroupId && previousBlock?.group_id === resolvedGroupId) {
        previousBlock.steps.push(step);
        return blocks;
      }

      blocks.push({
        group_id: resolvedGroupId,
        steps: [step]
      });

      return blocks;
    }, []);

  const handleReorderDraftStep = (stepId: string, direction: "up" | "down") => {
    setDraftSteps((current) => {
      const currentIndex = current.findIndex((step) => step.id === stepId);
      const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

      if (currentIndex === -1 || targetIndex < 0 || targetIndex >= current.length) {
        return current;
      }

      const currentStep = current[currentIndex];
      const targetStep = current[targetIndex];

      if (currentStep.group_id) {
        if (targetStep.group_id !== currentStep.group_id) {
          return current;
        }

        const reordered = [...current];
        const [movedStep] = reordered.splice(currentIndex, 1);
        reordered.splice(targetIndex, 0, movedStep);
        return reordered;
      }

      const blocks = buildStepBlocks(current);
      const blockIndex = blocks.findIndex((block) => block.steps.some((step) => step.id === stepId));
      const swapIndex = direction === "up" ? blockIndex - 1 : blockIndex + 1;

      if (blockIndex === -1 || swapIndex < 0 || swapIndex >= blocks.length) {
        return current;
      }

      const reorderedBlocks = [...blocks];
      const [movedBlock] = reorderedBlocks.splice(blockIndex, 1);
      reorderedBlocks.splice(swapIndex, 0, movedBlock);
      const newOrderIds = reorderedBlocks.flatMap((block) => block.steps.map((step) => step.id));
      const stepById = new Map(current.map((step) => [step.id, step]));

      return newOrderIds.map((id) => stepById.get(id)).filter(Boolean) as DraftTestStep[];
    });
    showSuccess("Draft step order updated.");
  };

  const handleCopySteps = (stepIds?: string[]) => {
    const targetIds = (stepIds && stepIds.length ? stepIds : selectedStepIds).filter(Boolean);

    if (!targetIds.length) {
      showError(new Error("Select one or more steps to copy."), "Unable to copy steps");
      return;
    }

    const orderedSelection = displaySteps.filter((step) => targetIds.includes(step.id));

    if (!orderedSelection.length) {
      return;
    }

    setCopiedSteps(normalizeCopiedSteps(orderedSelection, "copy"));
    setCopiedStepMode("copy");
    setCutStepSource(null);
    showSuccess(`${orderedSelection.length} step${orderedSelection.length === 1 ? "" : "s"} copied. Use paste to insert them where you want.`);
  };

  const handleCutSteps = (stepIds?: string[]) => {
    const targetIds = (stepIds && stepIds.length ? stepIds : selectedStepIds).filter(Boolean);

    if (!targetIds.length) {
      showError(new Error("Select one or more steps to cut."), "Unable to cut steps");
      return;
    }

    const orderedSelection = displaySteps.filter((step) => targetIds.includes(step.id));

    if (!orderedSelection.length) {
      return;
    }

    setCopiedSteps(normalizeCopiedSteps(orderedSelection, "cut"));
    setCopiedStepMode("cut");
    setCutStepSource({
      stepIds: orderedSelection.map((step) => step.id),
      testCaseId: isCreating ? null : selectedTestCaseId,
      isDraft: isCreating
    });
    showSuccess(`${orderedSelection.length} step${orderedSelection.length === 1 ? "" : "s"} cut. Paste to move ${orderedSelection.length === 1 ? "it" : "them"} into place.`);
  };

  const handlePasteSteps = async (targetIndex?: number, groupContext?: StepInsertionGroupContext | null) => {
    if (!copiedSteps.length) {
      showError(new Error("Copy one or more steps before pasting."), "Unable to paste steps");
      return;
    }

    const materialized = materializeCopiedSteps(copiedSteps);
    const insertionIndex = targetIndex ?? resolveStepInsertIndex(displaySteps);
    const insertionGroupContext = groupContext || getInsertionGroupContext(displaySteps, insertionIndex);
    const stepsToPaste =
      insertionGroupContext && materialized.every((step) => !step.group_id)
        ? materialized.map((step) => ({
            ...step,
            group_id: insertionGroupContext.group_id,
            group_name: insertionGroupContext.group_name,
            group_kind: insertionGroupContext.group_kind,
            reusable_group_id: insertionGroupContext.reusable_group_id
          }))
        : materialized;

    try {
      if (isCreating) {
        const pastedDraftSteps = stepsToPaste.map((step) => ({
          ...step,
          id: createDraftStepId()
        }));

        setDraftSteps((current) => {
          const next = [...current];
          next.splice(insertionIndex, 0, ...pastedDraftSteps);
          return next;
        });
        setExpandedStepIds((current) => [...new Set([...current, ...pastedDraftSteps.map((step) => step.id)])]);
      } else if (selectedTestCaseId) {
        const createdStepIds: string[] = [];

        for (const [offset, step] of stepsToPaste.entries()) {
          const response = await createStep.mutateAsync({
            test_case_id: selectedTestCaseId,
            step_order: insertionIndex + offset + 1,
            action: step.action || undefined,
            expected_result: step.expected_result || undefined,
            step_type: normalizeStepType(step.step_type),
            automation_code: normalizeAutomationCode(step.automation_code) || undefined,
            api_request: normalizeApiRequest(step.api_request) || undefined,
            group_id: step.group_id || undefined,
            group_name: step.group_name || undefined,
            group_kind: step.group_kind || undefined,
            reusable_group_id: step.reusable_group_id || undefined
          });
          createdStepIds.push(response.id);
        }

        setExpandedStepIds((current) => [...new Set([...current, ...createdStepIds])]);
        await queryClient.invalidateQueries({ queryKey: ["test-case-steps", selectedTestCaseId] });
      }

      if (copiedStepMode === "cut" && cutStepSource?.stepIds.length) {
        if (cutStepSource.isDraft) {
          setDraftSteps((current) => current.filter((step) => !cutStepSource.stepIds.includes(step.id)));
        } else {
          const cutSourceSteps = displaySteps.filter((step) => cutStepSource.stepIds.includes(step.id));

          for (const stepId of cutStepSource.stepIds) {
            await deleteStep.mutateAsync(stepId);
          }

          if (cutStepSource.testCaseId && cutStepSource.testCaseId !== selectedTestCaseId) {
            await queryClient.invalidateQueries({ queryKey: ["test-case-steps", cutStepSource.testCaseId] });
          }

          if (selectedTestCaseId) {
            await queryClient.invalidateQueries({ queryKey: ["test-case-steps", selectedTestCaseId] });
          }

          if (cutSourceSteps.some((step) => step.reusable_group_id) || stepsToPaste.some((step) => step.reusable_group_id)) {
            await refreshSharedGroups();
          }
        }

        setExpandedStepIds((current) => current.filter((id) => !cutStepSource.stepIds.includes(id)));
        setCopiedSteps([]);
        setCopiedStepMode("copy");
        setCutStepSource(null);
      }

      setStepInsertIndex(null);
      setStepInsertGroupContext(null);
      setSelectedStepIds([]);
      showSuccess(`${copiedStepMode === "cut" ? "Moved" : "Pasted"} ${stepsToPaste.length} step${stepsToPaste.length === 1 ? "" : "s"}.`);
    } catch (error) {
      showError(error, "Unable to paste steps");
    }
  };

  const handleOpenStepGroupModal = () => {
    if (!selectedStepIds.length) {
      showError(new Error("Select one or more steps to group."), "Unable to group steps");
      return;
    }

    if (!isContinuousStepSelection(displaySteps, selectedStepIds)) {
      showError(new Error("Select a continuous step range before grouping."), "Unable to group steps");
      return;
    }

    setStepGroupName("");
    setSaveAsReusableGroup(false);
    setIsStepGroupModalOpen(true);
  };

  const handleConfirmStepGroup = async () => {
    const name = stepGroupName.trim();

    if (!name) {
      showError(new Error("Enter a group name before saving the step group."), "Unable to group steps");
      return;
    }

    const selectedStepsForGrouping = displaySteps.filter((step) => selectedStepIds.includes(step.id));

    if (!selectedStepsForGrouping.length) {
      return;
    }

    try {
      const reusableGroupId = saveAsReusableGroup
        ? await getOrCreateSharedGroupRecord(
            name,
            selectedStepsForGrouping.map((step) => ({
              action: step.action,
              expected_result: step.expected_result,
              step_type: step.step_type,
              automation_code: step.automation_code,
              api_request: step.api_request
            }))
          )
        : null;

      if (isCreating) {
        const groupId = createDraftGroupId();

        setDraftSteps((current) =>
          current.map((step) =>
            selectedStepIds.includes(step.id)
              ? {
                  ...step,
                  group_id: groupId,
                  group_name: name,
                  group_kind: saveAsReusableGroup ? "reusable" : "local",
                  reusable_group_id: reusableGroupId
                }
              : step
          )
        );
      } else if (selectedTestCaseId) {
        await groupSteps.mutateAsync({
          test_case_id: selectedTestCaseId,
          step_ids: selectedStepIds,
          name,
          kind: saveAsReusableGroup ? "reusable" : "local",
          reusable_group_id: reusableGroupId || undefined
        });
        await queryClient.invalidateQueries({ queryKey: ["test-case-steps", selectedTestCaseId] });
      }

      setIsStepGroupModalOpen(false);
      setStepGroupName("");
      setSaveAsReusableGroup(false);

      if (reusableGroupId) {
        await refreshSharedGroups();
      }

      showSuccess(saveAsReusableGroup ? "Shared group created." : "Step group created.");
    } catch (error) {
      showError(error, "Unable to group steps");
    }
  };

  const handleUngroupStepGroup = async (groupId: string, kind?: TestStep["group_kind"]) => {
    const successMessage =
      kind === "reusable"
        ? "Shared group unlinked from this test case. Steps stayed in place."
        : "Step group removed. Steps stayed in place.";

    if (isCreating) {
      setDraftSteps((current) =>
        current.map((step) =>
          step.group_id === groupId
            ? {
                ...step,
                group_id: null,
                group_name: null,
                group_kind: null,
                reusable_group_id: null
              }
            : step
        )
      );
      cancelStepInsert();
      showSuccess(successMessage);
      return;
    }

    if (!selectedTestCaseId) {
      return;
    }

    try {
      await ungroupSteps.mutateAsync({
        test_case_id: selectedTestCaseId,
        group_id: groupId
      });
      cancelStepInsert();
      showSuccess(successMessage);
      await queryClient.invalidateQueries({ queryKey: ["test-case-steps", selectedTestCaseId] });
      if (kind === "reusable") {
        await refreshSharedGroups();
      }
    } catch (error) {
      showError(error, "Unable to ungroup steps");
    }
  };

  const handleRemoveStepGroup = async (groupId: string, groupSteps: TestStep[], kind?: TestStep["group_kind"]) => {
    const targetIds = groupSteps.map((step) => step.id);

    if (!targetIds.length) {
      return;
    }

    const groupName = groupSteps[0]?.group_name || "this step group";
    const isSharedGroup = kind === "reusable";
    const confirmMessage = isSharedGroup
      ? `Remove shared group "${groupName}" from this test case? The shared group library item will stay available.`
      : `Delete "${groupName}" and its ${targetIds.length} step${targetIds.length === 1 ? "" : "s"}?`;

    if (!(await confirmDelete({ message: confirmMessage }))) {
      return;
    }

    if (isCreating) {
      setDraftSteps((current) => current.filter((step) => step.group_id !== groupId));
      setSelectedStepIds((current) => current.filter((id) => !targetIds.includes(id)));
      setExpandedStepIds((current) => current.filter((id) => !targetIds.includes(id)));
      setExpandedStepGroupIds((current) => current.filter((id) => id !== groupId));
      cancelStepInsert();
      showSuccess(isSharedGroup ? "Shared group removed from this draft case." : "Step group and its steps removed.");
      return;
    }

    if (!selectedTestCaseId) {
      return;
    }

    try {
      for (const stepId of targetIds) {
        await deleteStep.mutateAsync(stepId);
      }
      setSelectedStepIds((current) => current.filter((id) => !targetIds.includes(id)));
      setExpandedStepIds((current) => current.filter((id) => !targetIds.includes(id)));
      setExpandedStepGroupIds((current) => current.filter((id) => id !== groupId));
      cancelStepInsert();
      showSuccess(isSharedGroup ? "Shared group removed from this test case." : "Step group and its steps removed.");
      await queryClient.invalidateQueries({ queryKey: ["test-case-steps", selectedTestCaseId] });
      if (isSharedGroup) {
        await refreshSharedGroups();
      }
    } catch (error) {
      showError(error, "Unable to remove step group");
    }
  };

  const handleInsertSharedGroup = async () => {
    const sharedGroup = sharedStepGroups.find((group) => group.id === selectedSharedGroupId);

    if (!sharedGroup) {
      showError(new Error("Choose a shared step group to insert."), "Unable to insert shared group");
      return;
    }

    try {
      if (isCreating) {
        const insertionIndex = resolveStepInsertIndex(draftSteps);
        const groupInstanceId = createDraftGroupId();
        const insertedSteps = sharedGroup.steps.map((step) => ({
          id: createDraftStepId(),
          action: step.action || "",
          expected_result: step.expected_result || "",
          step_type: normalizeStepType(step.step_type),
          automation_code: normalizeAutomationCode(step.automation_code),
          api_request: normalizeApiRequest(step.api_request),
          group_id: groupInstanceId,
          group_name: sharedGroup.name,
          group_kind: "reusable" as const,
          reusable_group_id: sharedGroup.id
        }));

        setDraftSteps((current) => {
          const next = [...current];
          next.splice(insertionIndex, 0, ...insertedSteps);
          return next;
        });
        setExpandedStepIds((current) => [...new Set([...current, ...insertedSteps.map((step) => step.id)])]);
        setSelectedStepIds(insertedSteps.map((step) => step.id));
      } else if (selectedTestCaseId) {
        const insertionIndex = resolveStepInsertIndex(steps);
        const insertAfterStepId = insertionIndex > 0 ? steps[insertionIndex - 1]?.id : undefined;

        await insertSharedGroup.mutateAsync({
          test_case_id: selectedTestCaseId,
          shared_step_group_id: sharedGroup.id,
          insert_after_step_id: insertAfterStepId
        });
        await queryClient.invalidateQueries({ queryKey: ["test-case-steps", selectedTestCaseId] });
        await refreshSharedGroups();
      }

      setIsSharedGroupPickerOpen(false);
      setSelectedSharedGroupId("");
      setSharedGroupSearchTerm("");
      setStepInsertIndex(null);
      setStepInsertGroupContext(null);
      showSuccess(`Inserted shared group "${sharedGroup.name}".`);
    } catch (error) {
      showError(error, "Unable to insert shared group");
    }
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);

    if (!files.length) {
      return;
    }

    const preparedBatches: PreparedTestCaseImportBatch[] = [];
    const failedFiles: string[] = [];

    try {
      for (const file of files) {
        try {
          preparedBatches.push(await prepareTestCaseImportBatch(file, importSourceSelection));
        } catch (error) {
          failedFiles.push(`${file.name}: ${error instanceof Error ? error.message : "Unable to parse file"}`);
        }
      }

      if (preparedBatches.length) {
        setImportBatches((current) => [...current, ...preparedBatches]);
      }

      if (failedFiles.length) {
        setImportFileWarnings((current) => [...current, ...failedFiles]);
      }

      const preparedCaseCount = preparedBatches.reduce((total, batch) => total + batch.rows.length, 0);

      if (preparedCaseCount) {
        setMessageTone("success");
        setMessage(
          `Prepared ${preparedCaseCount} test case${preparedCaseCount === 1 ? "" : "s"} from ${preparedBatches.length} file${preparedBatches.length === 1 ? "" : "s"}.`
        );
      } else if (failedFiles[0]) {
        setMessageTone("error");
        setMessage(failedFiles[0]);
      } else {
        setMessageTone("error");
        setMessage("No importable test cases were found in the selected files.");
      }
    } finally {
      event.target.value = "";
    }
  };

	  const handleBulkImport = async () => {
	    if (!canImportTestCases) {
	      showError(new Error("Permission required: testcase.import"), "Unable to import test cases");
	      return;
	    }

	    if (!appTypeId || !importRows.length) {
	      return;
	    }

    try {
      const response = await importTestCases.mutateAsync({
        app_type_id: appTypeId,
        requirement_id: importRequirementId || undefined,
        batches: importBatches
          .filter((batch) => batch.rows.length)
          .map((batch) => ({
            file_name: batch.fileName,
            import_source: batch.source,
            rows: batch.rows
          }))
      });

      setMessageTone("success");
      setMessage(
        response.split_count && response.split_count > 1
          ? `Test case import split into ${response.split_count} queued batch processes. Track progress in TestOps.`
          : `Test case import queued. Track progress in TestOps batch process ${response.transaction_id.slice(0, 8)}.`
      );
      setImportBatches([]);
      setImportFileWarnings([]);
      setImportSourceSelection("auto");
      setIsImportModalOpen(false);
      await refreshCases();
    } catch (error) {
      showError(error, "Unable to import test cases");
    }
  };

  const exportCasesToCsv = async (
	    testCasesToExport: TestCase[],
    options?: {
      fileLabel?: string;
      successMessage?: string;
    }
	  ) => {
	    if (!canExportTestCases) {
	      setMessageTone("error");
	      setMessage("Permission required: testcase.export");
	      return;
	    }

	    if (!testCasesToExport.length) {
	      setMessageTone("error");
      setMessage("No test cases are available to export.");
      return;
    }

    try {
      const response = await api.testCases.exportCases({
        app_type_id: appTypeId || "",
        test_case_ids: testCasesToExport.map((testCase) => testCase.id)
      });
      const exportRecordById = new Map((response.records || []).map((record) => [record.id, record]));
      const requirementById = new Map<string, Requirement>();
      requirements.forEach((item) => {
        requirementById.set(item.id, item);
        if (item.display_id) requirementById.set(item.display_id, item);
      });
      const suiteById = new Map<string, TestSuite>();
      suites.forEach((item) => {
        suiteById.set(item.id, item);
        if (item.display_id) suiteById.set(item.display_id, item);
      });
      const exportedRows = testCasesToExport.map((testCase) => {
        const exportRecord = exportRecordById.get(testCase.id);
        const steps = (exportRecord?.steps || []).map((step) => ({
          step_order: step.step_order,
          action: step.action || "",
          expected_result: step.expected_result || "",
          step_type: step.step_type || "web",
          automation_code: canUseAutomationWorkspace ? step.automation_code || "" : undefined,
          api_request: step.api_request || null,
          group_id: step.group_id || null,
          group_name: step.group_name || null,
          group_kind: step.group_kind || null,
          reusable_group_id: step.reusable_group_id || null
        }));
        const sharedGroupIds = new Set(steps.map((step) => step.reusable_group_id).filter(Boolean));
        const moduleRecords = testCaseModules.filter((module) => module.test_case_ids?.includes(testCase.id));
        const dataSetIds = (testCase as TestCase & { test_data_set_ids?: string[]; test_data_set_id?: string | null }).test_data_set_ids
          || ((testCase as TestCase & { test_data_set_id?: string | null }).test_data_set_id ? [(testCase as TestCase & { test_data_set_id?: string }).test_data_set_id as string] : []);

        return {
          Title: testCase.title,
          Description: testCase.description || "",
          Status: testCase.status || "",
          Priority: testCase.priority || 3,
          Automated: canUseAutomationWorkspace ? testCase.automated || "no" : undefined,
          Labels: (testCase.labels || []).join("|"),
          "External References": (testCase.external_references || []).join("|"),
          Requirements: (testCase.requirement_ids || (testCase.requirement_id ? [testCase.requirement_id] : []))
            .map((id) => requirementById.get(id)?.display_id || id)
            .join("|"),
          Suites: (testCase.suite_ids || (testCase.suite_id ? [testCase.suite_id] : []))
            .map((id) => suiteById.get(id)?.display_id || id)
            .join("|"),
          Modules: moduleRecords.map((module) => module.name).join("|"),
          "Parameter Values": testCase.parameter_values || {},
          "Test Data References": dataSetIds.join("|"),
          Steps: steps,
          "Shared Groups": sharedStepGroups
            .filter((group) => sharedGroupIds.has(group.id))
            .map((group) => ({ id: group.id, name: group.name, description: group.description, steps: group.steps }))
        };
      });
      const safeLabel = (options?.fileLabel || "test-cases").replace(/[^a-z0-9._-]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "test-cases";
      downloadCsvRecords(`qaira-${safeLabel}.csv`, exportedRows);
      showSuccess(
        options?.successMessage
          || `Test case export${options?.fileLabel ? ` for "${options.fileLabel}"` : ""} queued. Track progress in TestOps batch process ${response.transaction_id.slice(0, 8)}.`
      );
    } catch (error) {
      showError(error, "Unable to export test cases");
    }
  };

  const handleExportCsv = async () => {
    if (!filteredCases.length) {
      setMessageTone("error");
      setMessage("No test cases match the current scope to export.");
      return;
    }

    await exportCasesToCsv(filteredCases, {
      successMessage: `Test case export queued for ${filteredCases.length} case${filteredCases.length === 1 ? "" : "s"}. Track progress in TestOps.`
    });
  };

  const handleCloneCase = async (testCase: TestCase) => {
	    if (!canCreateTestCases) {
	      showError(new Error("Permission required: testcase.create"), "Unable to clone test case");
	      return;
	    }

	    const nextAppTypeId = testCase.app_type_id || appTypeId;

    if (!nextAppTypeId) {
      showError(new Error("Select an app type before cloning a test case."), "Unable to clone test case");
      return;
    }

    try {
      const caseSteps = await queryClient.fetchQuery({
        queryKey: ["test-case-steps", testCase.id],
        queryFn: () => api.testSteps.list({ test_case_id: testCase.id }),
        staleTime: 30_000
      });
      const response = await createTestCase.mutateAsync({
        app_type_id: nextAppTypeId,
        suite_ids: testCase.suite_ids || (testCase.suite_id ? [testCase.suite_id] : []),
        title: `${testCase.title} (Copy)`,
        description: testCase.description || undefined,
        external_references: testCase.external_references || [],
        parameter_values: testCase.parameter_values || undefined,
        automated: testCase.automated || defaultTestCaseAutomated,
        priority: testCase.priority || 3,
        status: testCase.status || defaultTestCaseStatus,
        requirement_ids: testCase.requirement_ids || (testCase.requirement_id ? [testCase.requirement_id] : []),
        steps: caseSteps.map((step) => ({
          step_order: step.step_order,
          action: step.action || undefined,
          expected_result: step.expected_result || undefined,
          step_type: step.step_type,
          automation_code: step.automation_code || undefined,
          api_request: step.api_request || undefined,
          group_id: step.group_id || undefined,
          group_name: step.group_name || undefined,
          group_kind: step.group_kind || undefined,
          reusable_group_id: step.reusable_group_id || undefined
        }))
      });

      syncTestCaseSearchParams(response.id);
      setSelectedTestCaseId(response.id);
      setIsCreating(false);
      setDraftSteps([]);
      showSuccess(`Cloned "${testCase.title}" with its current steps.`);
      await refreshCases();
    } catch (error) {
      showError(error, "Unable to clone test case");
    }
  };

	  const handleDeleteCaseItem = async (testCase: TestCase) => {
	    if (!canDeleteTestCases) {
	      showError(new Error("Permission required: testcase.delete"), "Unable to delete test case");
	      return;
	    }

	    if (!(await confirmDelete({ message: `Delete test case "${testCase.title}"? Historical execution evidence will stay preserved.` }))) {
	      return;
	    }

    try {
      await deleteTestCase.mutateAsync(testCase.id);
      setSelectedActionTestCaseIds((current) => current.filter((id) => id !== testCase.id));

      if (selectedTestCaseId === testCase.id) {
        syncTestCaseSearchParams(null);
        setSelectedTestCaseId("");
        setCaseDraft(emptyCaseDraft);
        setIsCreating(false);
        setSelectedStepIds([]);
        setStepInsertIndex(null);
        setStepInsertGroupContext(null);
      }

      showSuccess("Test case deleted. Run snapshots remain available.");
      await refreshCases();
    } catch (error) {
      showError(error, "Unable to delete test case");
    }
  };

	  const openAiCaseAuthoring = () => {
	    if (!canUseTestCaseAi) {
	      showError(new Error("Permission required: testcase.ai"), "Unable to open AI authoring");
	      return;
	    }

	    const seededRequirementId =
	      caseDraft.requirement_id
      || selectedTestCase?.requirement_ids?.[0]
      || selectedTestCase?.requirement_id
      || requirements[0]?.id
      || "";

    setAiCaseAuthoringRequirementId(seededRequirementId);
    setAiCaseAuthoringExternalLinksText("");
    setAiCaseAuthoringReferenceImages([]);
    setAiCaseAuthoringPreview(null);
    setAiCaseAuthoringMessage("");
    setAiCaseAuthoringTone("success");
    setIsAiCaseAuthoringOpen(true);
  };

	  const openAiStudio = () => {
	    if (!canUseTestCaseAi || !canCreateTestCases) {
	      showError(new Error(`Permission required: ${!canUseTestCaseAi ? "testcase.ai" : "testcase.create"}`), "Unable to open AI test case generation");
	      return;
	    }

	    const seededRequirementIds = [
      ...(selectedTestCase?.requirement_ids || []),
      ...(selectedTestCase?.requirement_id ? [selectedTestCase.requirement_id] : []),
      ...(caseDraft.requirement_id ? [caseDraft.requirement_id] : [])
    ].filter(Boolean);

    const nextRequirementIds = seededRequirementIds.length ? [...new Set(seededRequirementIds)] : requirements[0] ? [requirements[0].id] : [];

    setAiRequirementIds(nextRequirementIds);
    setAiPreviewCases([]);
    setAiPreviewMessage("");
    setAiPreviewTone("success");
    setIsAiStudioOpen(true);
  };

  const handleAddAiReferenceImages = async (files: FileList | null) => {
    try {
      const images = await readImageFiles(files);
      setAiReferenceImages((current) => appendUniqueImages(current, images));
    } catch (error) {
      setAiPreviewTone("error");
      setAiPreviewMessage(error instanceof Error ? error.message : "Unable to attach the selected image");
    }
  };

  const handleAddAiCaseAuthoringReferenceImages = async (files: FileList | null) => {
    try {
      const images = await readImageFiles(files);
      setAiCaseAuthoringReferenceImages((current) => appendUniqueImages(current, images));
    } catch (error) {
      setAiCaseAuthoringTone("error");
      setAiCaseAuthoringMessage(error instanceof Error ? error.message : "Unable to attach the selected image");
    }
  };

	  const handlePreviewDesignedCases = async () => {
	    if (!canUseTestCaseAi) {
	      setAiPreviewTone("error");
	      setAiPreviewMessage("Permission required: testcase.ai");
	      return;
	    }

	    if (!appTypeId || !aiRequirementIds.length) {
	      return;
	    }

    try {
      const response = await previewDesignedCases.mutateAsync({
        app_type_id: appTypeId,
        requirement_ids: aiRequirementIds,
        integration_id: integrationId || undefined,
        max_cases: maxCases,
        additional_context: aiAdditionalContext || undefined,
        external_links: parseExternalLinks(aiExternalLinksText),
        images: aiReferenceImages
      });

      setAiPreviewCases(response.cases);
      setAiPreviewTone("success");
      setAiPreviewMessage(`${response.generated} draft cases prepared from the selected requirement context. Review their traceability and steps before accepting.`);
    } catch (error) {
      setAiPreviewTone("error");
      setAiPreviewMessage(formatAiStudioErrorMessage(error, "Unable to preview AI-generated test cases right now."));
    }
  };

  const formatAiStudioErrorMessage = (error: unknown, fallback: string) => {
    const message = error instanceof Error ? error.message.trim() : "";
    const normalized = message.toLowerCase();

    if (!message) {
      return fallback;
    }

    if (normalized.includes("rate limit") || normalized.includes("too many") || normalized.includes("429")) {
      return "AI generation is being rate-limited right now. Please wait a moment and try again.";
    }

    if (normalized.includes("timeout") || normalized.includes("took too long")) {
      return "AI generation took too long to respond. Please try again in a moment.";
    }

    if (normalized.includes("unable to reach api") || normalized.includes("network") || normalized.includes("connection")) {
      return "Couldn't reach the AI generation service. Check the connection and try again.";
    }

    return message;
  };

	  const handlePreviewAiCaseAuthoring = async () => {
	    if (!canUseTestCaseAi) {
	      setAiCaseAuthoringTone("error");
	      setAiCaseAuthoringMessage("Permission required: testcase.ai");
	      return;
	    }

	    if (!appTypeId || !aiCaseAuthoringRequirementId) {
	      setAiCaseAuthoringTone("error");
      setAiCaseAuthoringMessage("Choose the linked requirement before generating an AI authoring preview.");
      return;
    }

    try {
      const response = await previewCaseAuthoring.mutateAsync({
        app_type_id: appTypeId,
        requirement_id: aiCaseAuthoringRequirementId,
        integration_id: integrationId || undefined,
        additional_context: aiCaseAuthoringAdditionalContext || undefined,
        external_links: parseExternalLinks(aiCaseAuthoringExternalLinksText),
        images: aiCaseAuthoringReferenceImages,
        test_case: aiCaseAuthoringSourceDraft
      });

      setAiCaseAuthoringPreview(response.case);
      setAiCaseAuthoringTone("success");
      setAiCaseAuthoringMessage(
        `Prepared ${response.case.step_count} assisted step${response.case.step_count === 1 ? "" : "s"} from the selected requirement and current draft. Review before applying.`
      );
    } catch (error) {
      setAiCaseAuthoringTone("error");
      setAiCaseAuthoringMessage(formatAiStudioErrorMessage(error, "Unable to preview AI authoring right now."));
    }
  };

	  const handleApplyAiCaseAuthoring = async () => {
	    if (!canUseTestCaseAi || (!isCreating && !canUpdateTestCases)) {
	      setAiCaseAuthoringTone("error");
	      setAiCaseAuthoringMessage(`Permission required: ${!canUseTestCaseAi ? "testcase.ai" : "testcase.update"}`);
	      return;
	    }

	    if (!aiCaseAuthoringPreview) {
	      return;
	    }

    const normalizedPreviewParameterValues = normalizeTestCaseParameterValues(aiCaseAuthoringPreview.parameter_values);

    if (isCreating) {
      const nextDraftSteps = buildDraftStepsFromAiAuthoringPreview(aiCaseAuthoringPreview);

      setCaseDraft((current) => ({
        ...current,
        title: aiCaseAuthoringPreview.title,
        description: aiCaseAuthoringPreview.description || "",
        requirement_id: aiCaseAuthoringRequirementId || current.requirement_id
      }));
      setTestCaseParameterValues(normalizedPreviewParameterValues);
      setDraftSteps(nextDraftSteps);
      setSelectedStepIds([]);
      setExpandedStepIds(nextDraftSteps.map((step) => step.id));
      setExpandedStepGroupIds([]);
      setIsAiCaseAuthoringOpen(false);
      setAiCaseAuthoringPreview(null);
      setAiCaseAuthoringMessage("");
      showSuccess("AI-authored content applied to the new test case draft.");
      return;
    }

    if (!selectedTestCase) {
      return;
    }

    const stepReplacementMessage = aiCaseAuthoringAutomationStepCount
      ? `Replace "${selectedTestCase.title}" with the AI-authored draft? This will overwrite ${displaySteps.length} saved step${displaySteps.length === 1 ? "" : "s"} and remove automation code or API request setup from ${aiCaseAuthoringAutomationStepCount} step${aiCaseAuthoringAutomationStepCount === 1 ? "" : "s"}.`
      : `Replace "${selectedTestCase.title}" with the AI-authored draft and overwrite its ${displaySteps.length} saved step${displaySteps.length === 1 ? "" : "s"}?`;

    if (!(await confirmAction({
      title: "Replace saved steps?",
      message: stepReplacementMessage,
      confirmLabel: "Replace steps",
      tone: "danger"
    }))) {
      return;
    }

    try {
      await updateTestCase.mutateAsync({
        id: selectedTestCase.id,
        input: {
          title: aiCaseAuthoringPreview.title,
          description: aiCaseAuthoringPreview.description || "",
          parameter_values: normalizedPreviewParameterValues,
          requirement_ids: aiCaseAuthoringRequirementId ? [aiCaseAuthoringRequirementId] : [],
          steps: buildPersistedStepsFromAiAuthoringPreview(aiCaseAuthoringPreview)
        }
      });

      setCaseDraft((current) => ({
        ...current,
        title: aiCaseAuthoringPreview.title,
        description: aiCaseAuthoringPreview.description || "",
        requirement_id: aiCaseAuthoringRequirementId || current.requirement_id
      }));
      setTestCaseParameterValues(normalizedPreviewParameterValues);
      syncCachedTestCaseParameterValues(selectedTestCase.id, normalizedPreviewParameterValues);
      clearStoredTestCaseParameterDraft(selectedCaseParameterDraftScopeKey);
      setIsAiCaseAuthoringOpen(false);
      setAiCaseAuthoringPreview(null);
      setAiCaseAuthoringMessage("");
      showSuccess("AI-authored content replaced the saved test case steps and test data.");
      await refreshCases();
    } catch (error) {
      setAiCaseAuthoringTone("error");
      setAiCaseAuthoringMessage(formatAiStudioErrorMessage(error, "Unable to apply AI authoring right now."));
    }
  };

	  const handleAcceptDesignedCases = async (selectedClientIds?: string[]) => {
	    if (!canCreateTestCases) {
	      setAiPreviewTone("error");
	      setAiPreviewMessage("Permission required: testcase.create");
	      return;
	    }

	    if (!appTypeId || !aiRequirementIds.length || !aiPreviewCases.length) {
	      return;
	    }
    const selectedCaseSet = new Set(selectedClientIds?.length ? selectedClientIds : aiPreviewCases.map((item) => item.client_id));
    const acceptedPreviewCases = aiPreviewCases.filter((item) => selectedCaseSet.has(item.client_id));

    if (!acceptedPreviewCases.length) {
      setAiPreviewTone("error");
      setAiPreviewMessage("Select at least one AI-generated case to accept.");
      return;
    }

    try {
      const response = await acceptDesignedCases.mutateAsync({
        app_type_id: appTypeId,
        requirement_ids: aiRequirementIds,
        status: "draft",
        cases: acceptedPreviewCases.map((item) => ({
          title: item.title,
          description: item.description,
          priority: item.priority,
          requirement_ids: item.requirement_ids,
          steps: item.steps.map((step) => ({
            step_order: step.step_order,
            action: step.action,
            expected_result: step.expected_result
          }))
        }))
      });

      setAiPreviewCases([]);
      setAiPreviewMessage("");
      setIsAiStudioOpen(false);
      if (response.created[0]) {
        syncTestCaseSearchParams(response.created[0].id);
        setSelectedTestCaseId(response.created[0].id);
        setIsCreating(false);
      }
      showSuccess(`${acceptedPreviewCases.length} AI-designed test case${acceptedPreviewCases.length === 1 ? "" : "s"} accepted into the library as standard steps.`);
      await refreshCases();
    } catch (error) {
      setAiPreviewTone("error");
      setAiPreviewMessage(formatAiStudioErrorMessage(error, "Unable to accept AI-generated test cases right now."));
    }
  };

	  const handleScheduleDesignedCases = async () => {
	    if (!canUseTestCaseAi || !canCreateTestCases) {
	      setAiPreviewTone("error");
	      setAiPreviewMessage(`Permission required: ${!canUseTestCaseAi ? "testcase.ai" : "testcase.create"}`);
	      return;
	    }

	    if (!appTypeId || !aiRequirementIds.length) {
	      setAiPreviewTone("error");
      setAiPreviewMessage("Select at least one requirement before scheduling AI generation.");
      return;
    }

    try {
      await createGenerationJob.mutateAsync({
        app_type_id: appTypeId,
        requirement_ids: aiRequirementIds,
        integration_id: integrationId || undefined,
        max_cases_per_requirement: maxCases,
        parallel_requirement_limit: parallelRequirementLimit,
        additional_context: aiAdditionalContext || undefined,
        external_links: parseExternalLinks(aiExternalLinksText),
        images: aiReferenceImages
      });

      setAiPreviewCases([]);
      setAiPreviewMessage("");
      setIsAiStudioOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["ai-test-case-generation-jobs", appTypeId] }),
        queryClient.invalidateQueries({ queryKey: ["requirements", projectId] })
      ]);
      showSuccess("AI test case generation scheduled. Draft cases will appear in the library with accept and reject controls once processing completes.");
    } catch (error) {
      setAiPreviewTone("error");
      setAiPreviewMessage(formatAiStudioErrorMessage(error, "Unable to schedule AI-generated test cases right now."));
    }
  };

	  const handleRunTestCase = async (testCaseId: string, mode?: "local" | "remote") => {
	    const testCase = testCases.find((item) => item.id === testCaseId);

		    const canRunSelectedMode = mode === "local"
		      ? canRunLocalAutomation
		      : mode === "remote"
		        ? canRunRemoteAutomation
		        : canCreateRuns;

		    if (!canRunSelectedMode) {
		      showError(
		        new Error(
		          mode === "local"
		            ? "Permission required: automation.run.local"
		            : mode === "remote"
		              ? "Permission required: automation.run.remote"
		              : "Permission required: run.create"
		        ),
		        "Unable to run test case"
		      );
		      return;
		    }

	    if (!session?.user.id) {
	      showError(new Error("You need an active session before running a test case."), "Unable to run test case");
      return;
    }

    if (!projectId || !appTypeId || !testCase) {
      showError(new Error("Select a project and app type before running a test case."), "Unable to run test case");
      return;
    }

    setSchedulerActionCaseId(testCaseId);
    setSchedulerActionKind(mode === "local" ? "run-local" : mode === "remote" ? "run-remote" : "run");

    try {
      if (mode === "local") {
        const isApiOnlyLocalRun = isApiOnlyTestCase(testCaseId);
        const response = await createLocalRun.mutateAsync({
          project_id: projectId,
          app_type_id: appTypeId,
          test_case_ids: [testCaseId],
          assigned_to_ids: selectedExecutionAssigneeIds.length ? selectedExecutionAssigneeIds : undefined,
          release: executionRelease.trim() || undefined,
          sprint: executionSprint.trim() || undefined,
          build: executionBuild.trim() || undefined,
          name: `${testCase.title} ${isApiOnlyLocalRun ? "Local API Run" : "Local Run"}`,
	          created_by: session.user.id,
	          test_environment_id: selectedExecutionEnvironmentId || undefined,
          test_configuration_id: selectedExecutionConfigurationId || undefined,
          test_data_set_id: selectedExecutionDataSetId || undefined,
          engine_base_url: isApiOnlyLocalRun ? "http://localhost:4301" : "http://localhost:4311"
        });

        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["executions"] }),
          queryClient.invalidateQueries({ queryKey: ["executions", projectId] }),
          queryClient.invalidateQueries({ queryKey: ["workspace-transactions"] })
        ]);

        navigate(`/executions?view=local-runs&execution=${response.id}&testCase=${testCaseId}`);
        showSuccess(`${isApiOnlyLocalRun ? "Local API run" : "Local run"} started for ${testCase.title}.`);
        return;
      }

      const response = await createExecution.mutateAsync({
        project_id: projectId,
        app_type_id: appTypeId,
        test_case_ids: [testCaseId],
        assigned_to_ids: selectedExecutionAssigneeIds.length ? selectedExecutionAssigneeIds : undefined,
        release: executionRelease.trim() || undefined,
        sprint: executionSprint.trim() || undefined,
	        build: executionBuild.trim() || undefined,
	        name: `${testCase.title} Run`,
	        created_by: session.user.id,
	        execution_mode: mode === "remote" ? "remote" : undefined,
	        test_environment_id: selectedExecutionEnvironmentId || undefined,
        test_configuration_id: selectedExecutionConfigurationId || undefined,
        test_data_set_id: selectedExecutionDataSetId || undefined
      });

      if (mode === "remote") {
        await api.executions.start(response.id, { execution_mode: "remote" });
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["executions"] }),
          queryClient.invalidateQueries({ queryKey: ["executions", projectId] }),
          queryClient.invalidateQueries({ queryKey: ["workspace-transactions"] })
        ]);
        navigate(`/executions?view=test-case-runs&execution=${response.id}&testCase=${testCaseId}`);
        showSuccess(`Remote run started for ${testCase.title}.`);
        return;
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["executions"] }),
        queryClient.invalidateQueries({ queryKey: ["executions", projectId] })
      ]);

      navigate(`/executions?view=test-case-runs&execution=${response.id}&testCase=${testCaseId}`);
      showSuccess(`Manual run created for ${testCase.title}.`);
    } catch (error) {
      showError(error, "Unable to run test case");
    } finally {
      setSchedulerActionCaseId("");
      setSchedulerActionKind("");
    }
  };

	  const handleReviewGeneratedCase = async (testCaseId: string, action: "accept" | "reject") => {
	    const requiredPermission = action === "accept" ? "testcase.update" : "testcase.delete";
	    const canReviewGeneratedCase = action === "accept" ? canUpdateTestCases : canDeleteTestCases;

	    if (!canReviewGeneratedCase) {
	      showError(new Error(`Permission required: ${requiredPermission}`), action === "accept" ? "Unable to accept generated test case" : "Unable to reject generated test case");
	      return;
	    }

	    const testCase = testCases.find((item) => item.id === testCaseId);

    if (!testCase) {
      return;
    }

    if (action === "reject" && !(await confirmDelete({ message: `Reject and permanently delete "${testCase.title}"?` }))) {
      return;
    }

    setSchedulerActionCaseId(testCaseId);
    setSchedulerActionKind(action);

    try {
      if (action === "accept") {
        await acceptGeneratedCase.mutateAsync(testCaseId);
        showSuccess(`Accepted "${testCase.title}" into the reusable test case library.`);
      } else {
        await rejectGeneratedCase.mutateAsync(testCaseId);

        if (selectedTestCaseId === testCaseId) {
          closeCaseWorkspace();
        }

        setSelectedActionTestCaseIds((current) => current.filter((id) => id !== testCaseId));
        showSuccess(`Rejected "${testCase.title}" and permanently removed it.`);
      }

      await refreshCases();
    } catch (error) {
      showError(error, action === "accept" ? "Unable to accept generated test case" : "Unable to reject generated test case");
    } finally {
      setSchedulerActionCaseId("");
      setSchedulerActionKind("");
    }
  };

	  const handleReviewSelectedGeneratedCases = async (action: "accept" | "reject") => {
	    const requiredPermission = action === "accept" ? "testcase.update" : "testcase.delete";
	    const canReviewGeneratedCases = action === "accept" ? canUpdateTestCases : canDeleteTestCases;

	    if (!canReviewGeneratedCases) {
	      showError(new Error(`Permission required: ${requiredPermission}`), action === "accept" ? "Unable to accept generated cases" : "Unable to reject generated cases");
	      return;
	    }

	    if (!selectedPendingGeneratedCases.length) {
	      showError(new Error("Select one or more pending generated cases first."), action === "accept" ? "Unable to accept generated cases" : "Unable to reject generated cases");
      return;
    }

    if (action === "reject" && !(await confirmDelete({ message: `Reject and permanently delete ${selectedPendingGeneratedCases.length} generated test case${selectedPendingGeneratedCases.length === 1 ? "" : "s"}?` }))) {
      return;
    }

    setSchedulerActionCaseId("bulk");
    setSchedulerActionKind(action);

    try {
      for (const testCase of selectedPendingGeneratedCases) {
        if (action === "accept") {
          await acceptGeneratedCase.mutateAsync(testCase.id);
        } else {
          await rejectGeneratedCase.mutateAsync(testCase.id);

          if (selectedTestCaseId === testCase.id) {
            closeCaseWorkspace();
          }
        }
      }

      if (action === "reject") {
        const rejectedIds = new Set(selectedPendingGeneratedCases.map((testCase) => testCase.id));
        setSelectedActionTestCaseIds((current) => current.filter((id) => !rejectedIds.has(id)));
      }

      showSuccess(`${action === "accept" ? "Accepted" : "Rejected"} ${selectedPendingGeneratedCases.length} generated test case${selectedPendingGeneratedCases.length === 1 ? "" : "s"}.`);
      await refreshCases();
    } catch (error) {
      showError(error, action === "accept" ? "Unable to accept generated cases" : "Unable to reject generated cases");
    } finally {
      setSchedulerActionCaseId("");
      setSchedulerActionKind("");
    }
  };

  const coverageMetrics = useMemo(() => {
    const covered = testCases.filter((testCase) => (testCase.requirement_ids || [testCase.requirement_id]).filter(Boolean).length).length;
    const automated = testCases.filter((testCase) => testCase.automated === "yes").length;
    const withHistory = testCases.filter((testCase) => (historyByCaseId[testCase.id] || []).length).length;
    const withSuites = testCases.filter((testCase) => (testCase.suite_ids || []).length).length;

    return {
      total: testCases.length,
      covered,
      automated,
      withHistory,
      withSuites
    };
  }, [historyByCaseId, testCases]);
  const importRows = useMemo(
    () => importBatches.flatMap((batch) => batch.rows),
    [importBatches]
  );
  const importWarnings = useMemo(
    () =>
      [
        ...importBatches.flatMap((batch) =>
          batch.warnings.map((warning) => `${batch.fileName}: ${warning}`)
        ),
        ...importFileWarnings
      ],
    [importBatches, importFileWarnings]
  );
  const importStepCount = useMemo(
    () => importRows.reduce((total, row) => total + countImportedSteps(row), 0),
    [importRows]
  );
  const importFileCount = importBatches.length;
  const importFileName = useMemo(() => {
    if (!importBatches.length) {
      return "";
    }

    if (importBatches.length === 1) {
      return importBatches[0]?.fileName || "";
    }

    return `${importBatches[0]?.fileName || "Import batch"} + ${importBatches.length - 1} more`;
  }, [importBatches]);
  const importSourceSummary = useMemo(() => {
    if (!importBatches.length) {
      return "";
    }

    const uniqueSources = Array.from(new Set(importBatches.map((batch) => batch.source)));

    if (uniqueSources.length === 1) {
      return getTestCaseImportSourceLabel(uniqueSources[0] as TestCaseImportSource);
    }

    return "Mixed sources";
  }, [importBatches]);
  const isLibraryLoading = testCasesQuery.isLoading || executionResultsQuery.isLoading;

  const selectedRequirement = requirements.find((item) => item.id === caseDraft.requirement_id) || null;
  const caseDraftLabels = useMemo(() => parseReferenceList(caseDraft.labelsText), [caseDraft.labelsText]);
  const computedCaseAiQualityScore = useMemo(
    () =>
      calculateTestCaseAiQualityScore({
        title: caseDraft.title,
        description: caseDraft.description,
        steps: displaySteps,
        requirementId: caseDraft.requirement_id,
        labels: caseDraftLabels,
        parameterValues: testCaseParameterValues
      }),
    [caseDraft.description, caseDraft.requirement_id, caseDraft.title, caseDraftLabels, displaySteps, testCaseParameterValues]
  );
  const caseQualitySuggestions = useMemo(
    () =>
      buildTestCaseQualitySuggestions({
        title: caseDraft.title,
        description: caseDraft.description,
        steps: displaySteps,
        requirementId: caseDraft.requirement_id,
        labels: caseDraftLabels,
        parameterValues: testCaseParameterValues
      }),
    [caseDraft.description, caseDraft.requirement_id, caseDraft.title, caseDraftLabels, displaySteps, testCaseParameterValues]
  );
  const testCaseReviewReadiness = useMemo(() => {
    const completeStepCount = displaySteps.filter((step) =>
      richTextToPlainText(stepDrafts[step.id]?.action ?? step.action ?? "").trim()
      && richTextToPlainText(stepDrafts[step.id]?.expected_result ?? step.expected_result ?? "").trim()
    ).length;

    return assessTestCaseReviewReadiness({
      qualityScore: computedCaseAiQualityScore,
      stepCount: displaySteps.length,
      completeStepCount,
      requirementCount: caseDraft.requirement_id ? 1 : 0,
      reviewStatus: isCreating ? "not_requested" : selectedReviewStatus,
      suggestions: caseQualitySuggestions
    });
  }, [caseDraft.requirement_id, caseQualitySuggestions, computedCaseAiQualityScore, displaySteps, isCreating, selectedReviewStatus, stepDrafts]);
  const testCaseImpactFindings = useMemo<AiPreviewFinding[]>(() => {
    const preview = previewTestCaseImpact.data;
    if (!preview) return [];

    const groups = [
      { id: "requirements", title: "Requirements", items: preview.impact.requirements, action: "Confirm linked requirements still describe the behavior and expected outcome." },
      { id: "suites", title: "Suites", items: preview.impact.test_suites, action: "Review suite scope and ordering for any changed setup or behavior." },
      { id: "runs", title: "Runs", items: preview.impact.test_runs, action: "Decide whether queued or active run snapshots need to be refreshed or rerun." },
      ...(canUseAutomationWorkspace ? [
        { id: "automation", title: "Automation assets", items: preview.impact.automation_assets, action: "Review automation mappings before applying the test case change." },
        { id: "objects", title: "Object dependencies", items: preview.impact.object_repository_items, action: "Verify locator evidence and fallback strategies against the proposed test steps." }
      ] : [])
    ];
    const findings: AiPreviewFinding[] = groups
      .filter((group) => group.items.length)
      .map((group) => ({
        id: group.id,
        title: `${group.items.length} affected ${group.title.toLowerCase()}`,
        severity: preview.impact.risk_level,
        description: group.items.slice(0, 5).map((item) => item.title || item.name || item.locator_intent || item.display_id || item.id).join(" · "),
        action: group.action,
        evidence: group.items.map((item) => item.display_id || item.id).filter(Boolean)
      }));

    preview.risk_signals.forEach((signal, index) => findings.unshift({
      id: `risk-${index}`,
      title: "Risk signal",
      severity: preview.impact.risk_level,
      description: signal,
      action: "Verify this signal against the linked Jira records before changing the test case."
    }));
    return findings;
  }, [canUseAutomationWorkspace, previewTestCaseImpact.data]);

  const openTestCaseImpactPreview = () => {
    if (!selectedTestCase || !projectId || !canUseTestCaseAi) return;
    setIsTestCaseImpactPreviewOpen(true);
    previewTestCaseImpact.reset();
    previewTestCaseImpact.mutate({
      testCaseId: selectedTestCase.id,
      input: {
        project_id: projectId,
        proposed_change: {
          title: caseDraft.title,
          description: richTextToPlainText(caseDraft.description),
          status: caseDraft.status,
          priority: caseDraft.priority,
          automated: caseDraft.automated,
          requirement_id: caseDraft.requirement_id,
          labels: caseDraftLabels,
          parameter_values: testCaseParameterValues,
          steps: displaySteps.map((step) => ({
            id: step.id,
            step_order: step.step_order,
            step_type: step.step_type,
            action: richTextToPlainText(stepDrafts[step.id]?.action ?? step.action ?? ""),
            expected_result: richTextToPlainText(stepDrafts[step.id]?.expected_result ?? step.expected_result ?? "")
          }))
        }
      }
    });
  };
  const selectedSuiteContext = suites.find((suite) => suite.id === createSuiteContextId) || null;
  const selectedCaseSuites = useMemo(() => {
    if (isCreating) {
      return selectedSuiteContext ? [selectedSuiteContext] : [];
    }

    if (!selectedTestCase) {
      return [];
    }

    const suiteIds = [
      ...(selectedTestCase.suite_ids || []),
      ...(selectedTestCase.suite_id ? [selectedTestCase.suite_id] : [])
    ].filter(Boolean);

    if (!suiteIds.length) {
      return [];
    }

    const suiteIdSet = new Set(suiteIds);
    return suites.filter((suite) => suiteIdSet.has(suite.id));
  }, [isCreating, selectedSuiteContext, selectedTestCase, suites]);
  const selectedCaseSuiteIdsForModal = useMemo(
    () => selectedCaseSuites.map((suite) => suite.id),
    [selectedCaseSuites]
  );
  const hasSuiteLinkDraftChanges = useMemo(() => {
    const currentSuiteIds = Array.from(new Set(selectedCaseSuiteIdsForModal.filter(Boolean))).sort();
    const draftSuiteIds = Array.from(new Set(suiteLinkDraftIds.filter(Boolean))).sort();

    if (currentSuiteIds.length !== draftSuiteIds.length) {
      return true;
    }

    return currentSuiteIds.some((suiteId, index) => suiteId !== draftSuiteIds[index]);
  }, [selectedCaseSuiteIdsForModal, suiteLinkDraftIds]);
  useEffect(() => {
    if (!isSuiteLinkModalOpen) {
      return;
    }

    setSuiteLinkDraftIds(selectedCaseSuiteIdsForModal);
  }, [isSuiteLinkModalOpen, selectedCaseSuiteIdsForModal]);
  const selectedHistory = selectedTestCase ? historyByCaseId[selectedTestCase.id] || [] : [];
  const selectedEditorSteps = useMemo(
    () => displaySteps.filter((step) => selectedStepIds.includes(step.id)),
    [displaySteps, selectedStepIds]
  );
  const stepBlocks = useMemo(() => {
    return mainSteps.reduce<Array<{
      key: string;
      group_id: string | null;
      group_name: string | null;
      group_kind: TestStep["group_kind"];
      reusable_group_id: string | null;
      steps: TestStep[];
    }>>((blocks, step) => {
      const previousBlock = blocks[blocks.length - 1];

      if (step.group_id && previousBlock?.group_id === step.group_id) {
        previousBlock.steps.push(step);
        return blocks;
      }

      blocks.push({
        key: step.group_id ? `group-${step.group_id}` : `step-${step.id}`,
        group_id: step.group_id || null,
        group_name: step.group_name || null,
        group_kind: step.group_kind || null,
        reusable_group_id: step.reusable_group_id || null,
        steps: [step]
      });

      return blocks;
    }, []);
  }, [mainSteps]);
  const stepGroupIds = useMemo(
    () => [...new Set(stepBlocks.map((block) => block.group_id).filter((groupId): groupId is string => Boolean(groupId)))],
    [stepBlocks]
  );
  const filteredSharedGroups = useMemo(() => {
    const search = sharedGroupSearchTerm.trim().toLowerCase();

    return sharedStepGroups.filter((group) => {
      if (!search) {
        return true;
      }

      return [group.name, group.description || "", ...group.steps.map((step) => `${step.action || ""} ${step.expected_result || ""}`)]
        .join(" ")
        .toLowerCase()
        .includes(search);
    });
  }, [sharedGroupSearchTerm, sharedStepGroups]);
  const selectedSharedGroup = sharedStepGroups.find((group) => group.id === selectedSharedGroupId) || null;
  const detectedStepParameters = useMemo<StepParameterDefinition[]>(
    () =>
      collectStepParameters(
        displaySteps.map((step) => ({
          id: step.id,
          action: stepDrafts[step.id]?.action ?? step.action,
          expected_result: stepDrafts[step.id]?.expected_result ?? step.expected_result,
          automation_code: stepDrafts[step.id]?.automation_code ?? step.automation_code,
          api_request: stepDrafts[step.id]?.api_request ?? step.api_request
        }))
      ),
    [displaySteps, stepDrafts]
  );
  const isCaseWorkspaceOpen = Boolean(selectedTestCaseId) || isCreating;
  const stepCountLabel = `${mainSteps.length} step${mainSteps.length === 1 ? "" : "s"}`;
  const allStepsSelected = Boolean(mainSteps.length) && mainSteps.every((step) => selectedStepIds.includes(step.id));
  const dirtyStepIds = useMemo(
    () =>
      displaySteps
        .filter((step) => {
          const draft = stepDrafts[step.id];
          if (!draft) {
            return false;
          }
          return normalizeSharedGroupComparableText(draft.action) !== normalizeSharedGroupComparableText(step.action)
            || normalizeSharedGroupComparableText(draft.expected_result) !== normalizeSharedGroupComparableText(step.expected_result)
            || !areComparableStepAutomationEqual(draft, step);
        })
        .map((step) => step.id),
    [displaySteps, stepDrafts]
  );
  const dirtySelectedStepIds = selectedEditorSteps.map((step) => step.id).filter((id) => dirtyStepIds.includes(id));
  const selectionIsContinuous = isContinuousStepSelection(displaySteps, selectedStepIds);
  const selectionGroupId = selectedEditorSteps.length && selectedEditorSteps.every((step) => step.group_id && step.group_id === selectedEditorSteps[0]?.group_id)
    ? (selectedEditorSteps[0]?.group_id as string)
    : "";
  const selectionGroupKind = selectionGroupId ? (selectedEditorSteps[0]?.group_kind || null) : null;
  const canUngroupSelection = Boolean(selectionGroupId && selectionIsContinuous);
  const selectionMinOrder = selectedEditorSteps.length ? Math.min(...selectedEditorSteps.map((step) => step.step_order)) : null;
  const selectionMaxOrder = selectedEditorSteps.length ? Math.max(...selectedEditorSteps.map((step) => step.step_order)) : null;
  const selectionPasteAboveIndex = selectionMinOrder ? Math.max(0, selectionMinOrder - 1) : null;
  const selectionPasteBelowIndex = selectionMaxOrder ? selectionMaxOrder : null;
  const editorStepActions: StepActionMenuAction[] = [
    {
      label: isCreating ? "Create test case" : "Save changes",
      description: isCreating ? "Create this test case and keep the current draft steps." : "Save the case metadata and all step edits together.",
      icon: <StepSaveIcon />,
      onClick: () => void handleSaveCaseAndSteps(),
      tone: "primary",
	      disabled: (isCreating ? !canCreateTestCases : !canUpdateTestCases) || createTestCase.isPending || updateTestCase.isPending || updateStep.isPending
    },
    {
      label: "Expand all steps",
      description: "Open every step editor in the current case.",
      icon: <StepExpandAllIcon />,
      onClick: () => {
        setExpandedStepIds(displaySteps.map((step) => step.id));
        setExpandedStepGroupIds(stepGroupIds);
      },
      disabled: !displaySteps.length
    },
    {
      label: "Collapse all steps",
      description: "Close all expanded step editors.",
      icon: <StepCollapseAllIcon />,
      onClick: () => {
        setExpandedStepIds([]);
        setExpandedStepGroupIds([]);
      },
      disabled: !displaySteps.length
    },
    {
      label: "Copy selected steps",
      description: "Place the selected steps in the clipboard for reuse.",
      icon: <StepCopyIcon />,
      onClick: () => handleCopySteps(),
      disabled: !selectedEditorSteps.length
    },
    {
      label: "Cut selected steps",
      description: "Move the selected steps after you paste them into a new position.",
      icon: <StepCutIcon />,
      onClick: () => handleCutSteps(),
      disabled: !selectedEditorSteps.length
    },
    ...(copiedSteps.length && selectionPasteAboveIndex !== null
      ? [{
          label: "Paste above selection",
          description: "Insert the clipboard steps before the current selection.",
          icon: <StepPasteAboveIcon />,
          onClick: () => void handlePasteSteps(selectionPasteAboveIndex)
        }, {
          label: "Paste below selection",
          description: "Insert the clipboard steps after the current selection.",
          icon: <StepPasteBelowIcon />,
          onClick: () => void handlePasteSteps(selectionPasteBelowIndex as number)
        }]
      : copiedSteps.length
        ? [{
            label: copiedStepMode === "cut" ? "Paste cut steps" : "Paste copied steps",
            description: "Insert the clipboard steps at the active step insertion point.",
            icon: <StepPasteIcon />,
            onClick: () => void handlePasteSteps()
          }]
        : []),
    ...(canUngroupSelection
      ? [{
          label: "Ungroup selected",
          description: "Remove the current selection from its group while keeping the steps in place.",
          icon: <StepUngroupIcon />,
          onClick: () => void handleUngroupStepGroup(selectionGroupId, selectionGroupKind || undefined)
        }]
      : [{
          label: "Group selected steps",
          description: "Turn the current continuous selection into one local or shared group.",
          icon: <StepGroupIcon />,
          onClick: handleOpenStepGroupModal,
          disabled: !selectedEditorSteps.length || !selectionIsContinuous
        }]),
    {
      label: "Delete selected steps",
      description: "Remove the selected steps from this test case.",
      icon: <StepDeleteIcon />,
      onClick: () => void handleDeleteSelectedSteps(),
      disabled: !selectedEditorSteps.length,
      tone: "danger"
    },
    {
      label: "Insert shared group",
      description: "Add a linked shared step group into this test case.",
      icon: <StepSharedGroupIcon />,
      onClick: () => {
        setIsSharedGroupPickerOpen(true);
        setSelectedSharedGroupId((current) => current || sharedStepGroups[0]?.id || "");
      },
      disabled: !appTypeId
    },
    {
      label: "Clear step selection",
      description: "Reset the current multi-step selection.",
      icon: <StepClearSelectionIcon />,
      onClick: () => setSelectedStepIds([]),
      disabled: !selectedEditorSteps.length
    }
  ];
  const readableCaseTitle = resolveStepParameterText(caseDraft.title, mergedScopedParameterValues);
  const readableCaseDescription = resolveStepParameterText(caseDraft.description, mergedScopedParameterValues);
  const hasReadableCasePreview = Boolean(
    detectedStepParameters.length
    || Object.keys(mergedScopedParameterValues).length
    || readableCaseTitle !== caseDraft.title
    || readableCaseDescription !== caseDraft.description
  );
  const firstStepPreview = resolveStepParameterText(
    mainSteps[0]?.action || mainSteps[0]?.expected_result || "",
    mergedScopedParameterValues
  );
  const caseSectionSummary = isCreating
    ? "Enter the reusable case details before saving it."
    : "Edit metadata, linked suites, and saved test data.";
  const stepSectionSummary = firstStepPreview
    ? `Starts with: ${firstStepPreview}`
    : isCreating
      ? "No draft steps added yet."
      : "No steps added yet for this test case.";
  const preconditionGroupContext: StepInsertionGroupContext = {
    group_id: preconditionSteps[0]?.group_id || `preconditions-${selectedTestCaseId || "draft"}`,
    group_name: "Preconditions",
    group_kind: "local",
    reusable_group_id: null
  };
  const automationSectionSummary = automationTargetCaseIds.length
    ? `${automationTargetCaseIds.length} case${automationTargetCaseIds.length === 1 ? "" : "s"} selected for AI automation or recorder capture.`
    : "Select a saved case to automate with AI or recorder capture.";
  const caseSectionTitleContent = isCreating ? "New test case" : "Case details";
  const historySectionSummary = selectedHistory.length
    ? "Review the latest recorded outcomes and preserved run evidence for this reusable test case."
    : "No run history has been recorded for this reusable test case yet.";
  const aiSelectedRequirements = useMemo(
    () => requirements.filter((requirement) => aiRequirementIds.includes(requirement.id)),
    [aiRequirementIds, requirements]
  );
  const aiExistingCases = useMemo(() => {
    if (!aiRequirementIds.length) {
      return [];
    }

    const requirementSet = new Set(aiRequirementIds);
    return testCases.filter((testCase) =>
      (testCase.requirement_ids || [testCase.requirement_id]).filter(Boolean).some((requirementId) => requirementSet.has(requirementId as string))
    );
  }, [aiRequirementIds, testCases]);
  const linkedPreviewCase = useMemo(
    () => testCases.find((testCase) => testCase.id === linkedPreviewCaseId) || null,
    [linkedPreviewCaseId, testCases]
  );
  const activeGenerationJobs = useMemo(
    () => generationJobs.filter((job): job is AiTestCaseGenerationJob => ["queued", "running"].includes(job.status)),
    [generationJobs]
  );
  const generationQueueSummary = useMemo(() => {
    if (activeGenerationJobs.length) {
      const processed = activeGenerationJobs.reduce((total, job) => total + job.processed_requirements, 0);
      const total = activeGenerationJobs.reduce((count, job) => count + job.total_requirements, 0);

      return {
        tone: "success" as const,
        title: `${activeGenerationJobs.length} AI generation job${activeGenerationJobs.length === 1 ? "" : "s"} in progress`,
        detail: `${processed} of ${total} requirement${total === 1 ? "" : "s"} processed in the current app type.`
      };
    }

    return null;
  }, [activeGenerationJobs]);

  const openExistingCaseFromAi = (testCaseId: string) => setLinkedPreviewCaseId(testCaseId);
  const closeCaseWorkspace = () => {
    syncTestCaseSearchParams(null);
    setCreateSuiteContextId("");
    setIsCreating(false);
    setSelectedTestCaseId("");
    setCaseDraft(emptyCaseDraft);
    setNewStepDraft(EMPTY_STEP_DRAFT);
    setStepInsertIndex(null);
    setStepInsertGroupContext(null);
    setDraftSteps([]);
    setSelectedStepIds([]);
    setExpandedStepIds([]);
    setExpandedStepGroupIds([]);
    setExpandedSections(createDefaultTestCaseSections());
    setIsStepGroupModalOpen(false);
    setStepGroupName("");
    setSaveAsReusableGroup(false);
    setIsSharedGroupPickerOpen(false);
    setSelectedSharedGroupId("");
    setSharedGroupSearchTerm("");
    setIsSuiteLinkModalOpen(false);
    setSuiteLinkDraftIds([]);
    setTestCaseParameterValues({});
    setIsCaseParameterDialogOpen(false);
    setIsAiCaseAuthoringOpen(false);
    setAiCaseAuthoringRequirementId("");
    setAiCaseAuthoringPreview(null);
    setAiCaseAuthoringMessage("");
  };

  const handleWorkspaceBack = () => {
    closeCaseWorkspace();
  };

  const handleAnalyzeAutomationGaps = async () => {
    if (!selectedTestCase?.id) {
      return;
    }

    try {
      const response = await analyzeAutomationGaps.mutateAsync({
        testCaseId: selectedTestCase.id
      });
      const mappedSteps = await api.testSteps.list({ test_case_id: selectedTestCase.id });
      const mappedAutomation = mappedSteps.some((step) => stepHasAutomation(step));

      if (mappedAutomation) {
        await api.testCases.update(selectedTestCase.id, {
          automated: "yes",
          automation_status: "ready"
        });
      }

      await refreshCases();
      showSuccess(
        mappedAutomation
          ? `AI mapped automation onto ${response.generated_step_count || 0} manual step${response.generated_step_count === 1 ? "" : "s"} on this same test case.`
          : `AI mapped automation onto ${response.generated_step_count || 0} step${response.generated_step_count === 1 ? "" : "s"}.`
      );
    } catch (error) {
      showError(error, "Unable to analyze automation gaps");
    }
  };

  const isSelectedCaseRunning =
    Boolean(selectedTestCase?.id)
    && schedulerActionCaseId === selectedTestCase?.id
    && schedulerActionKind === "run";
  const isSelectedCaseLocalRunning =
    Boolean(selectedTestCase?.id)
    && schedulerActionCaseId === selectedTestCase?.id
    && schedulerActionKind === "run-local";
  const isSelectedCaseRemoteRunning =
    Boolean(selectedTestCase?.id)
    && schedulerActionCaseId === selectedTestCase?.id
    && schedulerActionKind === "run-remote";
	  const isSelectedCasePureApi = Boolean(selectedTestCase?.id && isApiOnlyTestCase(selectedTestCase.id));
	  const canSelectedCaseRunLocally = Boolean(selectedTestCase && (selectedTestCase.automated === "yes" || isSelectedCasePureApi));
	  const isSelectedCaseManualRunDisabled = isSelectedCaseRunning || !canCreateRuns || !projectId || !appTypeId || !session?.user.id;
	  const isSelectedCaseLocalRunDisabled =
	    !selectedTestCase
	    || isSelectedCaseLocalRunning
	    || createLocalRun.isPending
	    || !canRunLocalAutomation
	    || !canSelectedCaseRunLocally
	    || !supportsLocalDesktopExecution
    || !projectId
    || !appTypeId
    || !session?.user.id;
  const isSelectedCaseRemoteRunDisabled =
	    !selectedTestCase
	    || isSelectedCaseRemoteRunning
	    || !canRunRemoteAutomation
	    || selectedTestCase.automated !== "yes"
    || selectedTestCase.automation_status === "incomplete"
    || !projectId
    || !appTypeId
    || !session?.user.id;
  const selectedCaseLocalRunLabel = isSelectedCasePureApi ? "Run API locally" : "Run local Playwright";
  const caseHeaderActions = (
    <div className="panel-head-actions-row">
      <WorkspaceBackButton label="Back to test case tiles" onClick={handleWorkspaceBack} />
      {selectedTestCase ? (
        <button
          aria-label={isVisualBuilderActive ? "Return to step list" : "Open flow map"}
          className="ghost-button test-case-workspace-icon-action test-case-workspace-named-action"
          onClick={() => setIsVisualBuilderActive((current) => !current)}
          title={isVisualBuilderActive ? "Step list" : "Visual builder"}
          type="button"
        >
          {isVisualBuilderActive ? <TileCardStepsIcon /> : <TestCaseFlowMapIcon />}
          <span>{isVisualBuilderActive ? "Step list" : "Visual builder"}</span>
        </button>
      ) : null}
      {selectedTestCase ? (
        <div className="test-case-run-cluster" ref={runOptionsRef}>
          <button
            className="test-case-tile-action-button is-run test-case-header-run-button"
            disabled={isSelectedCaseManualRunDisabled}
            onClick={() => void handleRunTestCase(selectedTestCase.id)}
            title="Create and open a manual run for this test case. Manual runs are completed from Test Runs."
            type="button"
          >
            <TestCaseRunIcon />
            <span>{isSelectedCaseRunning ? "Creating..." : "Run manually"}</span>
          </button>
          {canUseAutomationWorkspace ? <>
            <span aria-hidden="true" className="test-case-run-combo-separator" />
            <div className="test-case-run-menu">
            <button
              aria-label="Open run options"
              aria-expanded={isRunOptionsOpen}
              aria-haspopup="menu"
              className="test-case-run-menu-trigger"
              onClick={() => setIsRunOptionsOpen((current) => !current)}
              title="Run options"
              type="button"
            >
              <RunOptionsChevronIcon />
            </button>
            {isRunOptionsOpen ? (
              <div className="test-case-run-menu-panel" role="menu">
                <button
                  className="test-case-run-menu-item is-success-run"
                  disabled={isSelectedCaseLocalRunDisabled}
                  onClick={() => {
                    setIsRunOptionsOpen(false);
                    void handleRunTestCase(selectedTestCase.id, "local");
                  }}
                  role="menuitem"
                  title={isSelectedCasePureApi ? "Run this API test case on the local Test Engine without a browser." : selectedTestCase.automated === "yes" ? "Run the recorded test case locally on your machine" : "Record or automate this test case before starting a local run"}
                  type="button"
                >
                  <TestCaseRunIcon />
                  <span>
                    <strong>{isSelectedCaseLocalRunning ? "Starting local..." : selectedCaseLocalRunLabel}</strong>
                    <small>{isSelectedCasePureApi ? "Use local Test Engine API execution." : "Use the local runner on this machine."}</small>
                  </span>
                </button>
                <button
                  className="test-case-run-menu-item is-success-run"
                  disabled={isSelectedCaseRemoteRunDisabled}
                  onClick={() => {
                    setIsRunOptionsOpen(false);
                    void handleRunTestCase(selectedTestCase.id, "remote");
                  }}
                  role="menuitem"
                  title={selectedTestCase.automation_status === "incomplete" ? "Repair missing object repository references before running this automation" : selectedTestCase.automated === "yes" ? "Run this automated test case through the configured remote Test Engine" : "Automate this test case before starting a remote run"}
                  type="button"
                >
                  <TestCaseRunIcon />
                  <span>
                    <strong>{isSelectedCaseRemoteRunning ? "Starting remote..." : "Run remotely"}</strong>
                    <small>Use the configured remote Test Engine.</small>
                  </span>
                </button>
              </div>
            ) : null}
            </div>
          </> : null}
        </div>
      ) : null}
      {selectedTestCase && canUseAutomationWorkspace ? (
        <button
	          aria-label="Preview execution script"
	          className="ghost-button test-case-workspace-icon-action test-case-workspace-named-action"
	          disabled={!mainSteps.length || !canViewAutomationCode}
          onClick={() => openCaseAutomationPreview()}
          title="Auto test code"
          type="button"
        >
          <AutomationCodeIcon />
          <span>Auto test</span>
        </button>
      ) : null}
      {selectedTestCase && canUseAutomationWorkspace ? (
        <button
          className="ghost-button"
          disabled={analyzeAutomationGaps.isPending || !selectedTestCase.id}
          onClick={() => void handleAnalyzeAutomationGaps()}
          title="AI analyzes existing automation, fills missing action code, and remaps code to manual steps"
          type="button"
        >
          <StepAiIcon />
          <span>{analyzeAutomationGaps.isPending ? "Analyzing…" : "AI map steps"}</span>
        </button>
      ) : null}
      {isCaseWorkspaceOpen ? (
        <button
          className="ghost-button"
          disabled={!appTypeId || !integrations.length || !requirements.length}
          onClick={openAiCaseAuthoring}
          title="Author manual test steps with AI"
          type="button"
        >
          <TestCaseSparkIcon />
          <span>AI generate steps</span>
        </button>
      ) : null}
      {isCaseWorkspaceOpen ? (
        <button
          className="ghost-button"
          onClick={() => setIsCaseParameterDialogOpen(true)}
          type="button"
        >
          <StepParameterIcon />
          <span>{detectedStepParameters.length ? `Test data · ${detectedStepParameters.length}` : "Test data"}</span>
        </button>
      ) : null}
    </div>
  );
  const getRequirementTitleForCase = (testCase: TestCase) =>
    (testCase.requirement_ids || [testCase.requirement_id]).map((id) => (id ? requirementTitleById[id] || "" : "")).find(Boolean) || "";
  const openLibraryCase = (testCaseId: string) => {
    openTestCaseWorkspace(testCaseId);
    setIsCreating(false);
    setDraftSteps([]);
  };
  const openLatestFailureRun = (testCaseId: string) => {
    const latestFailure = (historyByCaseId[testCaseId] || [])
      .find((result) => ["failed", "blocked"].includes(String(result.status || "").toLowerCase()));

    if (!latestFailure) {
      openLibraryCase(testCaseId);
      return;
    }

    const execution = executions.find((item) => item.id === latestFailure.execution_id);
    const runView = execution?.trigger === "local"
      ? "local-runs"
      : execution?.suite_ids?.length || latestFailure.suite_id
        ? "suite-runs"
        : "test-case-runs";

    navigate(`/executions?view=${runView}&execution=${latestFailure.execution_id}&testCase=${testCaseId}`);
  };

  const renderAiGeneratedDecision = (testCase: TestCase) => {
    const isPendingSchedulerCase =
      testCase.ai_generation_source === "scheduler" && testCase.ai_generation_review_status === "pending";
    const isAcceptingCase = schedulerActionCaseId === testCase.id && schedulerActionKind === "accept";
    const isRejectingCase = schedulerActionCaseId === testCase.id && schedulerActionKind === "reject";

    if (isPendingSchedulerCase) {
      return (
        <div className="yes-no-action-row" onClick={(event) => event.stopPropagation()}>
          <button
            aria-label={`Accept AI generated ${testCase.title}`}
            className="decision-button is-yes"
            disabled={isAcceptingCase || isRejectingCase}
            onClick={() => void handleReviewGeneratedCase(testCase.id, "accept")}
            title="Accept AI generated"
            type="button"
          >
            <TestCaseAcceptIcon />
            <span>Yes</span>
          </button>
          <button
            aria-label={`Reject AI Generated ${testCase.title}`}
            className="decision-button is-no"
            disabled={isAcceptingCase || isRejectingCase}
            onClick={() => void handleReviewGeneratedCase(testCase.id, "reject")}
            title="Reject AI Generated"
            type="button"
          >
            <TestCaseRejectIcon />
            <span>No</span>
          </button>
        </div>
      );
    }

    return (
      <span className={testCase.ai_generation_source ? "decision-status is-yes" : "decision-status is-no"}>
        {testCase.ai_generation_source ? <TestCaseAcceptIcon /> : <TestCaseRejectIcon />}
        <span>{testCase.ai_generation_source ? "Yes" : "No"}</span>
      </span>
    );
  };

  const renderReviewDecision = (testCase: TestCase) => {
    const reviewStatus = testCase.review_status || "not_requested";
    const isCurrentReviewer = Boolean(testCase.reviewer_id && session?.user.id && testCase.reviewer_id === session.user.id);

    if (isCurrentReviewer && reviewStatus === "pending") {
      return (
        <div className="yes-no-action-row" onClick={(event) => event.stopPropagation()}>
          <button
            aria-label={`Accept review for ${testCase.title}`}
            className="decision-button is-yes"
            disabled={reviewTestCase.isPending}
            onClick={() => void handleSubmitReviewForCase(testCase.id, "accepted")}
            title="Accept review"
            type="button"
          >
            <TestCaseAcceptIcon />
            <span>Yes</span>
          </button>
          <button
            aria-label={`Suggest changes for ${testCase.title}`}
            className="decision-button is-no"
            disabled={reviewTestCase.isPending}
            onClick={() => openReviewSuggestionDialog(testCase.id)}
            title="Suggest changes"
            type="button"
          >
            <TestCaseRejectIcon />
            <span>No</span>
          </button>
        </div>
      );
    }

    return TEST_CASE_REVIEW_STATUS_LABELS[reviewStatus];
  };

  const testCaseListColumns = useMemo<Array<DataTableColumn<TestCase>>>(() => [
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
            aria-label="Select all test cases"
            checked={areAllFilteredCasesSelected}
            onChange={(event) => setAllFilteredTestCaseItemsSelected(event.target.checked)}
            type="checkbox"
          />
        </label>
      ),
      render: (testCase) => (
        <div onClick={(event) => event.stopPropagation()}>
          <input
            checked={selectedActionTestCaseIds.includes(testCase.id)}
            onChange={(event) =>
              setSelectedActionTestCaseIds((current) =>
                event.target.checked ? [...new Set([...current, testCase.id])] : current.filter((id) => id !== testCase.id)
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
      sortValue: (testCase) => testCase.display_id || testCase.id,
      render: (testCase) => <DisplayIdBadge value={testCase.display_id || testCase.id} />
    },
    {
      key: "title",
      label: "Test case",
      canToggle: false,
      width: 280,
      minWidth: 180,
      render: (testCase) => <strong>{testCase.title}</strong>
    },
    {
      key: "requirement",
      label: "Requirement",
      width: 220,
      minWidth: 150,
      render: (testCase) => getRequirementTitleForCase(testCase) || "No requirement linked"
    },
    {
      key: "module",
      label: "Module",
      width: 180,
      minWidth: 132,
      render: (testCase) => caseModuleById.get(testCase.id)?.name || "Unassigned"
    },
    {
      key: "aiGenerated",
      label: "AI generated",
      width: 152,
      minWidth: 132,
      render: (testCase) => renderAiGeneratedDecision(testCase)
    },
    {
      key: "labels",
      label: "Labels",
      defaultVisible: false,
      width: 200,
      minWidth: 132,
      render: (testCase) => formatReferenceList(testCase.labels) || "—"
    },
    {
      key: "reviewStatus",
      label: "Review",
      width: 152,
      minWidth: 108,
      render: (testCase) => renderReviewDecision(testCase)
    },
    {
      key: "reviewer",
      label: "Reviewer",
      defaultVisible: false,
      width: 160,
      minWidth: 124,
      render: (testCase) => testCase.reviewer_id ? resolveAuditUserLabel(testCase.reviewer_id, userById) : "Unassigned"
    },
    {
      key: "quality",
      label: "Test Quality",
      width: 104,
      minWidth: 92,
      render: (testCase) => testCase.ai_quality_score === null || testCase.ai_quality_score === undefined ? "—" : `${testCase.ai_quality_score}%`
    },
    {
      key: "description",
      label: "Description",
      defaultVisible: false,
      width: 320,
      minWidth: 180,
      render: (testCase) => <span className="data-table-description-clamp">{richTextToPlainText(testCase.description) || "No description yet for this test case."}</span>
    },
    {
      key: "externalReferences",
      label: "References",
      defaultVisible: false,
      width: 220,
      minWidth: 150,
      render: (testCase) => formatReferenceList(testCase.external_references) || "—"
    },
    {
      key: "status",
      label: "Status",
      width: 108,
      minWidth: 92,
      render: (testCase) => {
        const history = historyByCaseId[testCase.id] || [];
        const latest = history[0];
        return <StatusBadge value={formatTestCaseWorkflowStatus(getTestCaseWorkflowStatus(testCase, latest?.status, defaultTestCaseStatus))} />;
      }
    },
    ...(canUseAutomationWorkspace ? [{
      key: "automated",
      label: "Automated",
      width: 104,
      minWidth: 88,
      render: (testCase: TestCase) => (testCase.automated === "yes" ? "Yes" : "No")
    }] : []),
    {
      key: "priority",
      label: "Priority",
      width: 88,
      minWidth: 76,
      render: (testCase) => `P${testCase.priority || 3}`
    },
    {
      key: "steps",
      label: "Steps",
      width: 92,
      minWidth: 80,
      render: (testCase) => stepCountByCaseId[testCase.id] || 0
    },
    {
      key: "testSteps",
      label: "Test steps",
      defaultVisible: false,
      width: 380,
      minWidth: 220,
      render: (testCase) => {
        const stepCount = Number(testCase.step_count || 0);
        if (!stepCount) {
          return "No steps yet";
        }
        const types = (testCase.step_types || []).map((value) => formatTileCardLabel(value, value));
        return `${stepCount} step${stepCount === 1 ? "" : "s"}${types.length ? ` · ${types.join(", ")}` : ""}`;
      }
    },
    {
      key: "testData",
      label: "Test data",
      defaultVisible: false,
      width: 260,
      minWidth: 180,
      render: (testCase) => {
        const parameterEntries = Object.entries(testCase.parameter_values || {}).sort(([left], [right]) => left.localeCompare(right));

        if (!parameterEntries.length) {
          return "No test data";
        }

        return (
          <div className="data-table-multiline">
            {parameterEntries.map(([name, value]) => (
              <span className="data-table-multiline-line" key={name}>{`${name} = ${value}`}</span>
            ))}
          </div>
        );
      }
    },
    {
      key: "suites",
      label: "Suites",
      width: 92,
      minWidth: 80,
      render: (testCase) => (testCase.suite_ids || (testCase.suite_id ? [testCase.suite_id] : [])).length || 0
    },
    {
      key: "runs",
      label: "Runs",
      width: 88,
      minWidth: 76,
      render: (testCase) => (historyByCaseId[testCase.id] || []).length
    },
    {
      key: "createdBy",
      label: "Created by",
      defaultVisible: false,
      width: 160,
      minWidth: 124,
      render: (testCase) => resolveAuditUserLabel(testCase.created_by, userById)
    },
    {
      key: "createdAt",
      label: "Created at",
      defaultVisible: false,
      width: 172,
      minWidth: 140,
      render: (testCase) => formatAuditTimestamp(testCase.created_at)
    },
    {
      key: "updatedBy",
      label: "Last updated by",
      defaultVisible: false,
      width: 172,
      minWidth: 132,
      render: (testCase) => resolveAuditUserLabel(testCase.updated_by || testCase.created_by, userById)
    },
    {
      key: "updatedAt",
      label: "Last updated at",
      defaultVisible: false,
      width: 184,
      minWidth: 148,
      render: (testCase) => formatAuditTimestamp(testCase.updated_at || testCase.created_at)
    },
    {
      key: "actions",
      label: "Actions",
      canToggle: false,
      canReorder: false,
      canResize: false,
      width: 92,
      render: (testCase) => {
        const isPendingSchedulerCase =
          testCase.ai_generation_source === "scheduler" && testCase.ai_generation_review_status === "pending";
        const isAcceptingCase = schedulerActionCaseId === testCase.id && schedulerActionKind === "accept";
        const isRejectingCase = schedulerActionCaseId === testCase.id && schedulerActionKind === "reject";
        const rowActions = [
          {
	            label: "Open case",
	            description: "Open this test case in the workspace.",
	            icon: <OpenIcon />,
	            onClick: () => openLibraryCase(testCase.id),
	            requiredPermissions: ["testcase.view"]
	          },
          ...(isPendingSchedulerCase
            ? [
              {
                label: "Accept AI generated case",
                description: "Approve the scheduler-generated test case and keep it.",
	                icon: <TestCaseAcceptIcon />,
	                onClick: () => void handleReviewGeneratedCase(testCase.id, "accept"),
	                disabled: isAcceptingCase || isRejectingCase,
	                requiredPermissions: ["testcase.update"],
	                tone: "primary" as const
	              },
              {
                label: "Reject AI Generated case",
                description: "Reject and permanently delete this scheduler-generated case.",
	                icon: <TestCaseRejectIcon />,
	                onClick: () => void handleReviewGeneratedCase(testCase.id, "reject"),
	                disabled: isAcceptingCase || isRejectingCase,
	                requiredPermissions: ["testcase.delete"],
	                tone: "danger" as const
	              }
            ]
            : [
	              {
	                label: "Clone case",
	                description: "Create a copy with the same steps and test data.",
	                icon: <CopyIcon />,
	                onClick: () => void handleCloneCase(testCase),
	                disabled: createTestCase.isPending,
	                requiredPermissions: ["testcase.create"]
	              },
	              {
	                label: "Export case",
	                description: "Download this test case as a CSV file.",
	                icon: <ExportIcon />,
	                onClick: () => void exportCasesToCsv([testCase], {
	                  fileLabel: testCase.title
	                }),
	                requiredPermissions: ["testcase.export"]
	              },
	              {
	                label: "Move to suite",
	                description: "Pick existing suite links and replace this case's current suite scope.",
	                icon: <MoveIcon />,
	                onClick: () => openSuiteTransferModal([testCase.id], "move"),
	                requiredPermissions: ["suite.update"]
	              },
	              {
	                label: "Delete case",
	                description: "Remove this test case while preserving run history.",
	                icon: <TrashIcon />,
	                onClick: () => void handleDeleteCaseItem(testCase),
	                disabled: deleteTestCase.isPending,
	                requiredPermissions: ["testcase.delete"],
	                tone: "danger" as const
	              }
            ])
        ];

        return (
          <div onClick={(event) => event.stopPropagation()}>
            <CatalogActionMenu actions={rowActions} label={`${testCase.title} actions`} />
          </div>
        );
      }
    }
  ], [
    caseModuleById,
    canUseAutomationWorkspace,
    createTestCase.isPending,
    defaultTestCaseAutomated,
    defaultTestCaseStatus,
    deleteTestCase.isPending,
    exportCasesToCsv,
    handleCloneCase,
    handleDeleteCaseItem,
    handleReviewGeneratedCase,
    historyByCaseId,
    openLibraryCase,
    requirementTitleById,
    renderAiGeneratedDecision,
    renderReviewDecision,
    schedulerActionCaseId,
    schedulerActionKind,
    selectedActionTestCaseIds,
    selectableFilteredCases,
    sharedGroupNameById,
    stepCountByCaseId,
    userById
  ]);
  const unassignedTestCaseListColumns = useMemo<Array<DataTableColumn<TestCase>>>(
    () => testCaseListColumns.map((column) => column.key === "select"
      ? {
          ...column,
          headerRender: () => (
            <label className="data-table-header-checkbox" onClick={(event) => event.stopPropagation()}>
              <input
                aria-label="Select all unassigned test cases"
                checked={areAllUnassignedCasesSelected}
                onChange={(event) =>
                  setSelectedActionTestCaseIds((current) =>
                    event.target.checked
                      ? [...new Set([...current, ...unassignedCaseIds])]
                      : current.filter((id) => !unassignedCaseIds.includes(id))
                  )
                }
                type="checkbox"
              />
            </label>
          )
        }
      : column),
    [areAllUnassignedCasesSelected, testCaseListColumns, unassignedCaseIds]
  );

  const isMatchingStepInsertContext = (groupContext: StepInsertionGroupContext | null = null) =>
    (stepInsertGroupContext?.group_id || null) === (groupContext?.group_id || null);

  const renderStepInsertSlot = (index: number, groupContext: StepInsertionGroupContext | null = null) => (
    <InlineStepInsertSlot
      draft={newStepDraft}
      index={index}
      isActive={stepInsertIndex === index && isMatchingStepInsertContext(groupContext)}
      onCancel={cancelStepInsert}
      onChange={setNewStepDraft}
      onSubmit={(event) => void handleCreateStep(event)}
    />
  );

  const openStepInspect = (step: TestStep) => {
    if (isCreating) {
      showError(new Error("Save the test case before recording an action for this step."), "Unable to inspect draft step");
      return;
    }

    if (recorderSession) {
      showError(new Error("Stop the active recorder session before inspecting another step."), "Unable to start step inspection");
      return;
    }

    setInspectingStepId(step.id);
  };

  const renderStepCard = (
    step: TestStep,
    index: number,
    groupContext: StepInsertionGroupContext | null = null,
    sectionSteps: TestStep[] = displaySteps,
    usePlainCardAppearance = false
  ) => {
    const insertAboveIndex = Math.max(0, step.step_order - 1);
    const insertBelowIndex = step.step_order;
    const stepDraft = stepDrafts[step.id] || {
      action: step.action || "",
      expected_result: step.expected_result || "",
      step_type: normalizeStepType(step.step_type),
      automation_code: normalizeAutomationCode(step.automation_code),
      api_request: normalizeApiRequest(step.api_request)
    };
    const previousStep = sectionSteps[index - 1];
    const nextStep = sectionSteps[index + 1];
    const canMoveUp = step.group_id ? Boolean(previousStep && previousStep.group_id === step.group_id) : index > 0;
    const canMoveDown = step.group_id ? Boolean(nextStep && nextStep.group_id === step.group_id) : index < sectionSteps.length - 1;

    if (isCreating) {
      return (
        <DraftStepCard
          showAutomationTools={canUseAutomationWorkspace}
          showRecorderTools={canUseRecorder}
          parameterValues={mergedScopedParameterValues}
          canPaste={Boolean(copiedSteps.length)}
          canMoveDown={canMoveDown}
          canMoveUp={canMoveUp}
          isExpanded={expandedStepIds.includes(step.id)}
          isRephrasing={rephrasingStepId === step.id}
          isSelected={selectedStepIds.includes(step.id)}
          onChange={(input) => handleUpdateDraftStep(step.id, input)}
          onCopy={() => handleCopySteps([step.id])}
          onCut={() => handleCutSteps([step.id])}
          onDelete={() => void handleDeleteStep(step.id)}
          onInsertAbove={() => activateStepInsert(insertAboveIndex, groupContext)}
          onInsertBelow={() => activateStepInsert(insertBelowIndex, groupContext)}
          onMoveDown={() => handleReorderDraftStep(step.id, "down")}
          onMoveUp={() => handleReorderDraftStep(step.id, "up")}
          onChangeStepType={(nextType) => void handleChangeStepType(step.id, nextType)}
          onEditAutomation={() => setEditingAutomationStepId(step.id)}
          onInspect={() => openStepInspect(step)}
          onRephrase={() => void handleRephraseStepWithAi(step)}
          onPasteAbove={() => void handlePasteSteps(insertAboveIndex, groupContext)}
          onPasteBelow={() => void handlePasteSteps(insertBelowIndex, groupContext)}
          onToggle={() =>
            setExpandedStepIds((current) =>
              current.includes(step.id) ? current.filter((id) => id !== step.id) : [...current, step.id]
            )
          }
          onToggleSelect={(checked) =>
            setSelectedStepIds((current) =>
              checked ? [...new Set([...current, step.id])] : current.filter((id) => id !== step.id)
            )
          }
          step={{
            id: step.id,
            step_order: step.step_order,
            action: step.action || "",
            expected_result: step.expected_result || "",
            step_type: normalizeStepType(step.step_type),
            automation_code: normalizeAutomationCode(step.automation_code),
            api_request: normalizeApiRequest(step.api_request),
            group_id: step.group_id || null,
            group_name: step.group_name || null,
            group_kind: usePlainCardAppearance ? null : step.group_kind || null,
            reusable_group_id: step.reusable_group_id || null
          }}
        />
      );
    }

      return (
        <EditableStepCard
          showAutomationTools={canUseAutomationWorkspace}
          showRecorderTools={canUseRecorder}
          parameterValues={mergedScopedParameterValues}
          canPaste={Boolean(copiedSteps.length)}
        canMoveDown={canMoveDown}
        canMoveUp={canMoveUp}
        draft={stepDraft}
        isExpanded={expandedStepIds.includes(step.id)}
        isRephrasing={rephrasingStepId === step.id}
        isSelected={selectedStepIds.includes(step.id)}
        onChangeStepType={(nextType) => void handleChangeStepType(step.id, nextType)}
        onCopy={() => handleCopySteps([step.id])}
        onCut={() => handleCutSteps([step.id])}
        onDelete={() => void handleDeleteStep(step.id)}
        onEditAutomation={() => setEditingAutomationStepId(step.id)}
        onInspect={() => openStepInspect(step)}
        onRephrase={() => void handleRephraseStepWithAi(step)}
        onInsertAbove={() => activateStepInsert(insertAboveIndex, groupContext)}
        onInsertBelow={() => activateStepInsert(insertBelowIndex, groupContext)}
        onMoveDown={() => void handleReorderStep(step.id, "down")}
        onMoveUp={() => void handleReorderStep(step.id, "up")}
        onPasteAbove={() => void handlePasteSteps(insertAboveIndex, groupContext)}
        onPasteBelow={() => void handlePasteSteps(insertBelowIndex, groupContext)}
        onSave={(input) => void handleUpdateStep(step, input)}
        onDraftChange={(input) =>
          setStepDrafts((current) => ({
            ...current,
            [step.id]: input
          }))
        }
        onToggle={() =>
          setExpandedStepIds((current) =>
            current.includes(step.id) ? current.filter((id) => id !== step.id) : [...current, step.id]
          )
        }
        onToggleSelect={(checked) =>
          setSelectedStepIds((current) =>
            checked ? [...new Set([...current, step.id])] : current.filter((id) => id !== step.id)
          )
        }
        step={usePlainCardAppearance ? { ...step, group_kind: null } : step}
      />
    );
  };

  const editingAutomationStep = editingAutomationStepId
    ? displaySteps.find((step) => step.id === editingAutomationStepId) || null
    : null;
  const inspectingStep = inspectingStepId
    ? displaySteps.find((step) => step.id === inspectingStepId) || null
    : null;

	  const openCaseAutomationPreview = () => {
	    if (!canViewAutomationCode) {
	      showError(new Error("Permission required: automation.code.view"), "Unable to open automation code");
	      return;
	    }

	    setCodePreviewState({
	      title: "Test case automation",
      subtitle: "This consolidated view is read-only here. Edit automation from individual steps.",
      code: buildCaseAutomationCode(caseDraft.title || selectedTestCase?.title || "Test case", displaySteps),
      objectRepository: automationLearningCache
    });
  };

	  const openGroupAutomationPreview = (groupName: string, groupSteps: TestStep[]) => {
	    if (!canViewAutomationCode) {
	      showError(new Error("Permission required: automation.code.view"), "Unable to open automation code");
	      return;
	    }

	    setCodePreviewState({
      title: `${groupName} automation`,
      subtitle: "This consolidated group view is read-only. Update code from the steps inside the group.",
      code: buildGroupAutomationCode(groupName, groupSteps),
      objectRepository: automationLearningCache
    });
  };

  const handleChangeStepType = async (stepId: string, nextType: TestStep["step_type"]) => {
    const targetStep = displaySteps.find((step) => step.id === stepId);

    if (!targetStep || !nextType) {
      return;
    }

    if (isCreating) {
      setDraftSteps((current) =>
        current.map((step) =>
          step.id === stepId
            ? {
                ...step,
                step_type: normalizeStepType(nextType)
              }
            : step
        )
      );
      setStepDrafts((current) => ({
        ...current,
        [stepId]: {
          ...(current[stepId] || {
            action: targetStep.action || "",
            expected_result: targetStep.expected_result || "",
            automation_code: normalizeAutomationCode(targetStep.automation_code),
            api_request: normalizeApiRequest(targetStep.api_request),
            step_type: normalizeStepType(targetStep.step_type)
          }),
          step_type: normalizeStepType(nextType)
        }
      }));
      return;
    }

    try {
      await updateStep.mutateAsync({
        id: stepId,
        input: {
          step_type: normalizeStepType(nextType)
        }
      });
      setStepDrafts((current) => ({
        ...current,
        [stepId]: {
          ...(current[stepId] || {
            action: targetStep.action || "",
            expected_result: targetStep.expected_result || "",
            automation_code: normalizeAutomationCode(targetStep.automation_code),
            api_request: normalizeApiRequest(targetStep.api_request),
            step_type: normalizeStepType(targetStep.step_type)
          }),
          step_type: normalizeStepType(nextType)
        }
      }));
      await queryClient.invalidateQueries({ queryKey: ["test-case-steps", selectedTestCaseId] });
      if (targetStep.reusable_group_id) {
        await refreshSharedGroups();
      }
    } catch (error) {
      showError(error, "Unable to update step type");
    }
  };

  const handleSaveStepAutomation = async (
    stepId: string,
    input: { step_type: TestStep["step_type"]; automation_code: string; api_request: TestStep["api_request"] }
  ) => {
    const targetStep = displaySteps.find((step) => step.id === stepId);

    if (!targetStep || !input.step_type) {
      return;
    }

    const nextDraft = {
      ...(stepDrafts[stepId] || {
        action: targetStep.action || "",
        expected_result: targetStep.expected_result || "",
        step_type: normalizeStepType(targetStep.step_type),
        automation_code: normalizeAutomationCode(targetStep.automation_code),
        api_request: normalizeApiRequest(targetStep.api_request)
      }),
      step_type: normalizeStepType(input.step_type),
      automation_code: normalizeAutomationCode(input.automation_code),
      api_request: normalizeApiRequest(input.api_request)
    };

    if (isCreating) {
      setDraftSteps((current) =>
        current.map((step) =>
          step.id === stepId
            ? {
                ...step,
                step_type: nextDraft.step_type,
                automation_code: nextDraft.automation_code,
                api_request: nextDraft.api_request
              }
            : step
        )
      );
      setStepDrafts((current) => ({
        ...current,
        [stepId]: nextDraft
      }));
      if (stepHasAutomation(nextDraft)) {
        setCaseDraft((current) => ({ ...current, automated: "yes" }));
      }
      setEditingAutomationStepId("");
      showSuccess("Step automation updated.");
      return;
    }

    try {
      const didSave = await handleSaveCaseAndSteps(
        { [stepId]: nextDraft },
        "Automation and all current test case edits saved."
      );

      if (!didSave) {
        return;
      }

      if (selectedTestCase && stepHasAutomation(nextDraft)) {
        await api.testCases.update(selectedTestCase.id, {
          automated: "yes",
          automation_status: "ready"
        });
        setCaseDraft((current) => ({ ...current, automated: "yes" }));
      }
      setStepDrafts((current) => ({
        ...current,
        [stepId]: nextDraft
      }));
      setEditingAutomationStepId("");
      await refreshCases();
    } catch (error) {
      showError(error, "Unable to update step automation");
    }
  };

  return (
    <div className={["page-content", "page-content--library-full", isCaseWorkspaceOpen ? "page-content--workspace-focus" : ""].join(" ")}>
      {confirmationDialog}
      {!isCaseWorkspaceOpen ? (
        <PageHeader
          className="page-header--test-cases"
          title="Test Case Library"
          description="Build reusable coverage with clean step detail, requirement traceability, suite linkage, and run-ready exports."
          meta={[
            { label: "Cases", value: coverageMetrics.total },
            { label: "Mapped", value: coverageMetrics.covered },
            ...(canUseAutomationWorkspace ? [{ label: "Automated", value: coverageMetrics.automated }] : [])
          ]}
        />
      ) : null}

      <ToastMessage message={message} onDismiss={() => setMessage("")} tone={messageTone} />

      {generationQueueSummary ? (
        <div className="inline-message success-message">
          <strong>{generationQueueSummary.title}</strong>
          <span>{generationQueueSummary.detail}</span>
        </div>
      ) : null}

      <WorkspaceMasterDetail
        browseView={(
          <Panel title="Test Cases" titleVariant="eyebrow" subtitle={appTypeId ? undefined : "Choose an app type to begin."}>
            <div className="design-list-toolbar test-case-catalog-toolbar">
              <CatalogViewToggle onChange={setCatalogViewMode} value={catalogViewMode} />
              <CatalogSearchFilter
                activeFilterCount={activeCaseFilterCount}
                ariaLabel="Search test cases"
                onChange={setSearchTerm}
                placeholder="Search title, description, or requirement"
                subtitle="Filter the case tiles by the status and facts shown on each card."
                title="Filter test cases"
                value={searchTerm}
              >
                <div className="catalog-filter-grid">
                  <label className="catalog-filter-field">
                    <span>Status</span>
                    <select value={caseStatusFilter} onChange={(event) => setCaseStatusFilter(event.target.value)}>
                      <option value="all">All statuses</option>
                      {caseStatusOptions.map((status) => (
                        <option key={status.value} value={status.value}>
                          {status.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="catalog-filter-field">
                    <span>Priority</span>
                    <select value={casePriorityFilter} onChange={(event) => setCasePriorityFilter(event.target.value)}>
                      <option value="all">All priorities</option>
                      {casePriorityOptions.map((priority) => (
                        <option key={priority} value={priority}>
                          {`P${priority}`}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="catalog-filter-field">
                    <span>Steps</span>
                    <select value={caseStepFilter} onChange={(event) => setCaseStepFilter(event.target.value as CaseStepFilter)}>
                      <option value="all">All cases</option>
                      <option value="with-steps">With steps</option>
                      <option value="no-steps">Without steps</option>
                    </select>
                  </label>

                  <label className="catalog-filter-field">
                    <span>Recent runs</span>
                    <select value={caseRunFilter} onChange={(event) => setCaseRunFilter(event.target.value as CaseRunFilter)}>
                      <option value="all">All cases</option>
                      <option value="with-runs">With recent runs</option>
                      <option value="no-runs">No recent runs</option>
                    </select>
                  </label>

                  <div className="catalog-filter-actions">
                    <button
                      className="ghost-button"
                      disabled={!activeCaseFilterCount}
                      onClick={() => {
                        setCaseStatusFilter("all");
                        setCasePriorityFilter("all");
                        setCaseStepFilter("all");
                        setCaseRunFilter("all");
                      }}
                      type="button"
                    >
                      <ClearSelectionIcon />
                      Clear filters
                    </button>
                  </div>
                </div>
              </CatalogSearchFilter>
              <button
                className="ghost-button catalog-selection-button"
                disabled={(!selectableFilteredCases.length && !testCaseModules.length) || areAllFilteredCasesSelected}
                onClick={() => setAllFilteredTestCaseItemsSelected(true)}
                type="button"
              >
                <SelectAllIcon />
                <span>Select all</span>
              </button>
              {selectedActionTestCaseIds.length || selectedModuleIds.length ? (
                <button
                  className="ghost-button catalog-selection-button"
                  onClick={() => {
                    setSelectedActionTestCaseIds([]);
                    setSelectedModuleIds([]);
                  }}
                  type="button"
                >
                  <ClearSelectionIcon />
                  <span>Clear</span>
                </button>
              ) : null}
              {selectedActionTestCaseIds.length ? (
                <>
                  {canUseAutomationWorkspace ? <button
                    className="primary-button catalog-selection-button"
                    disabled={!canBuildAutomation || !canUseAutomationAi || !appTypeId || !selectedManualAutomationCases.length || buildBatchAutomation.isPending}
                    onClick={() => void handleScheduleSelectedManualAutomation()}
                    type="button"
                  >
                    <TestCaseSparkIcon />
                    <span>{buildBatchAutomation.isPending ? "Scheduling AI automation" : `Schedule AI automation${selectedManualAutomationCases.length ? ` (${selectedManualAutomationCases.length})` : ""}`}</span>
                  </button> : null}
                  <TestCaseSplitActionButton
                    disabled={!canCreateRuns || !projectId || !appTypeId || !session?.user.id}
                    icon={<TestCaseRunIcon />}
                    label="Run manually"
                    menuLabel="Open selected test case run options"
                    tone="green"
                    onClick={() => {
                      setExecutionStartMode("manual");
                      setIsCreateExecutionModalOpen(true);
                    }}
                    actions={canUseAutomationWorkspace ? [
                      {
                        label: "Run local automation",
                        description: "Start a local execution run for selected automated cases.",
                        icon: <TestCaseRunIcon />,
                        disabled: !canRunLocalAutomation || !projectId || !appTypeId || !session?.user.id,
                        onClick: () => {
                          setExecutionStartMode("local");
                          setIsCreateExecutionModalOpen(true);
                        }
                      },
                      {
                        label: "Run remote automation",
                        description: "Start a remote execution run for selected automated cases.",
                        icon: <TestCaseRunIcon />,
                        disabled: !canRunRemoteAutomation || !projectId || !appTypeId || !session?.user.id,
                        onClick: () => {
                          setExecutionStartMode("remote");
                          setIsCreateExecutionModalOpen(true);
                        }
                      }
                    ] : []}
                  />
                </>
              ) : null}
              <TestCaseSplitActionButton
                disabled={!canCreateTestCases || !appTypeId}
                icon={<TestCaseCreateIcon />}
                label="Create Test Case"
                menuLabel="Open create test case options"
                onClick={() => beginCreateCase()}
                actions={[
                  {
                    label: "Bulk Import",
                    description: "Import test cases from CSV, XML, JSON, or supported source exports.",
                    icon: <TestCaseImportIcon />,
                    disabled: !canImportTestCases || !appTypeId,
                    onClick: () => {
                      setImportBatches([]);
                      setImportFileWarnings([]);
                      setImportSourceSelection("auto");
                      setIsImportModalOpen(true);
                    }
                  },
                  {
                    label: "AI Test Case Generation",
                    description: "Generate draft test cases from linked requirements with AI assistance.",
                    icon: <TestCaseSparkIcon />,
                    disabled: !canUseTestCaseAi || !canCreateTestCases || !requirements.length || !appTypeId,
                    onClick: openAiStudio
                  }
                ]}
              />
              <TestCaseSplitActionButton
                disabled={!selectedPendingGeneratedCases.length || schedulerActionCaseId === "bulk" || !canUpdateTestCases}
                icon={<TestCaseAcceptIcon />}
                label="Review AI Generated Case"
                menuLabel="Open AI generated case review options"
                onClick={() => void handleReviewSelectedGeneratedCases("accept")}
                actions={[
                  {
                    label: schedulerActionCaseId === "bulk" && schedulerActionKind === "accept" ? "Accepting AI generated cases" : `Accept generated${selectedPendingGeneratedCases.length ? ` (${selectedPendingGeneratedCases.length})` : ""}`,
                    description: "Accept selected AI-generated cases.",
                    icon: <TestCaseAcceptIcon />,
                    disabled: !selectedPendingGeneratedCases.length || schedulerActionCaseId === "bulk" || !canUpdateTestCases,
                    onClick: () => void handleReviewSelectedGeneratedCases("accept")
                  },
                  {
                    label: schedulerActionCaseId === "bulk" && schedulerActionKind === "reject" ? "Rejecting AI generated cases" : `Reject generated${selectedPendingGeneratedCases.length ? ` (${selectedPendingGeneratedCases.length})` : ""}`,
                    description: "Reject selected AI-generated cases.",
                    icon: <TestCaseRejectIcon />,
                    disabled: !selectedPendingGeneratedCases.length || schedulerActionCaseId === "bulk" || !canDeleteTestCases,
                    onClick: () => void handleReviewSelectedGeneratedCases("reject")
                  }
                ]}
              />
              <button className="ghost-button" disabled={!canExportTestCases || !filteredCases.length} onClick={() => void handleExportCsv()} type="button">
                <TestCaseExportIcon />
                <span>Export</span>
              </button>
		              <button className="ghost-button" disabled={!canCreateTestCases || !appTypeId} onClick={() => setIsCreateModuleModalOpen(true)} type="button">
		                <FolderIcon />
		                <span>Create module</span>
	              </button>
              {selectedActionTestCaseIds.length || selectedModuleIds.length ? (
                <button
                  className="ghost-button danger catalog-selection-button"
                  disabled={isDeletingSelectedTestCases || !canDeleteTestCases}
                  onClick={() => void handleDeleteSelectedTestCaseItems()}
                  type="button"
                >
                  <TrashIcon />
                  <span>
                    {isDeletingSelectedTestCases
                      ? "Deleting"
                      : `Delete (${selectedActionTestCaseIds.length + selectedModuleIds.length})`}
                  </span>
                </button>
              ) : null}
              <TestCaseSplitActionButton
                disabled={!canCreateSuites || !appTypeId}
                icon={<TileCardSuiteIcon />}
                label="Create Suite"
                menuLabel="Open suite actions"
                onClick={() => setIsCreateSuiteModalOpen(true)}
                actions={[
                  {
                    label: `Add to suite${selectedActionTestCaseIds.length ? ` (${selectedActionTestCaseIds.length})` : ""}`,
	                    description: "Attach selected cases to one or more existing suites without removing current links.",
	                    icon: <AddIcon />,
	                    disabled: !canUpdateSuites || !selectedActionTestCaseIds.length || !appTypeId,
	                    onClick: () => openSuiteTransferModal(selectedActionTestCaseIds, "add")
	                  },
                  {
                    label: `Move to suite${selectedActionTestCaseIds.length ? ` (${selectedActionTestCaseIds.length})` : ""}`,
	                    description: "Replace selected cases' suite links with the chosen suite scope.",
	                    icon: <MoveIcon />,
	                    disabled: !canUpdateSuites || !selectedActionTestCaseIds.length || !appTypeId,
	                    onClick: () => openSuiteTransferModal(selectedActionTestCaseIds, "move")
	                  },
                  {
                    label: `Copy to suite/project${selectedActionTestCaseIds.length ? ` (${selectedActionTestCaseIds.length})` : ""}`,
	                    description: "Duplicate selected cases and steps into another suite, app type, or project.",
	                    icon: <CopyIcon />,
	                    disabled: !selectedActionTestCaseIds.length || !appTypeId,
	                    onClick: () => openSuiteTransferModal(selectedActionTestCaseIds, "copy")
                  }
                ]}
              />
            </div>

            {selectedActionTestCaseIds.length ? (
              <div className="detail-summary test-case-selection-summary">
                <strong>{selectedActionTestCaseIds.length} test case{selectedActionTestCaseIds.length === 1 ? "" : "s"} selected for bulk actions</strong>
                <span>{canUseAutomationWorkspace
                  ? "Use the checked cases to create a suite, add or move suite links, copy across projects, create a run, schedule AI automation, or bulk delete them. Open any tile body to keep editing one case at a time."
                  : "Use the checked cases to create a suite, add or move suite links, copy across projects, create a manual run, or bulk delete them. Open any tile body to keep editing one case at a time."}</span>
              </div>
            ) : null}

            <TileBrowserPane className="test-case-library-scroll">
              {isLibraryLoading ? <TileCardSkeletonGrid /> : null}

              {!isLibraryLoading && filteredCases.length && catalogViewMode === "tile" ? (
                <div className="tile-browser-grid">
	                  {visibleModuleTileEntries.map((entry) => {
                    if (entry.kind === "module") {
                      const isCollapsed = collapsedModuleIds.includes(entry.module.id);
                      const moduleChildIds = (entry.module.test_case_ids || []).filter((id) => testCases.some((testCase) => testCase.id === id));
                      const isSelected = selectedModuleIds.includes(entry.module.id)
                        && moduleChildIds.every((id) => selectedActionTestCaseIds.includes(id));

                      return (
                        <div
                          className={draggingCaseIds.length ? "test-case-module-header is-drop-ready" : "test-case-module-header"}
                          key={`module-${entry.module.id}`}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={() => void handleDropCaseOnModule(entry.module.id)}
                        >
                          <label className="checkbox-field">
                            <input
                              checked={isSelected}
                              onChange={(event) => setModuleAndChildrenSelected(entry.module, event.target.checked)}
                              type="checkbox"
                            />
                          </label>
                          <button
                            aria-label={isCollapsed ? "Expand module" : "Collapse module"}
                            className={isCollapsed ? "ghost-button compact module-toggle-button" : "ghost-button compact module-toggle-button is-expanded"}
                            onClick={() =>
                              setCollapsedModuleIds((current) =>
                                current.includes(entry.module.id)
                                  ? current.filter((id) => id !== entry.module.id)
                                  : [...current, entry.module.id]
                              )
                            }
                            type="button"
                          >
                            <ModuleChevronIcon />
                          </button>
                          <span className="module-folder-icon">
                            <FolderIcon size={18} />
                          </span>
                          {renamingModuleId === entry.module.id ? (
                            <input
                              className="module-rename-input"
                              value={renamingModuleName}
                              onChange={(event) => setRenamingModuleName(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  void handleRenameModule(entry.module.id);
                                }
                                if (event.key === "Escape") {
                                  setRenamingModuleId("");
                                  setRenamingModuleName("");
                                }
                              }}
                            />
                          ) : (
                            <strong>{entry.module.name}</strong>
                          )}
                          {renderModuleMetrics(moduleHealth.byId.get(entry.module.id)!)}
                          <div className="action-row">
                            {renamingModuleId === entry.module.id ? (
                              <button className="primary-button compact" onClick={() => void handleRenameModule(entry.module.id)} type="button">Save</button>
                            ) : (
                              <button
                                aria-label={`Rename module ${entry.module.name}`}
                                className="ghost-button compact module-edit-button"
                                onClick={() => {
                                  setRenamingModuleId(entry.module.id);
                                  setRenamingModuleName(entry.module.name);
                                }}
                                title="Rename module"
                                type="button"
                              >
                                <ModulePencilIcon />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    }

                    if (entry.kind === "unassigned") {
                      return (
                        <div className="test-case-module-header is-unassigned" key="module-unassigned">
                          <label className="checkbox-field">
                            <input
                              checked={areAllUnassignedCasesSelected}
                              onChange={(event) => setUnassignedTestCasesSelected(event.target.checked)}
                              type="checkbox"
                            />
                          </label>
                          <span className="module-folder-icon">
                            <FolderIcon size={18} />
                          </span>
                          <strong>Unassigned module</strong>
                          {renderModuleMetrics(moduleHealth.unassigned)}
                        </div>
                      );
                    }

                    const testCase = entry.testCase;
                    const isSelectedForAction = selectedActionTestCaseIds.includes(testCase.id);
                    const isActive = selectedTestCaseId === testCase.id && !isCreating;
                    const history = (historyByCaseId[testCase.id] || []).slice(0, 10);
                    const latest = history[0];
                    const linkedRequirementId = (testCase.requirement_ids || [testCase.requirement_id]).find((id) => Boolean(id && requirementTitleById[id]));
                    const requirementTitle = linkedRequirementId ? requirementTitleById[linkedRequirementId] || "" : "";
                    const requirementDisplayId = linkedRequirementId ? requirementDisplayIdById[linkedRequirementId] : "";
                    const stepCount = stepCountByCaseId[testCase.id] || 0;
                    const suiteCount = (testCase.suite_ids || []).length || 0;
                    const failedRunCount = history.filter((result) => ["failed", "blocked"].includes(String(result.status || "").toLowerCase())).length;
                    const passedRuns = history.filter((result) => result.status === "passed").length;
                    const passRate = history.length ? Math.round((passedRuns / history.length) * 100) : 0;
                    const statusLabel = formatTestCaseWorkflowStatus(getTestCaseWorkflowStatus(testCase, latest?.status, defaultTestCaseStatus));
                    const isFailedCase = ["failed", "blocked"].includes(String(latest?.status || "").toLowerCase());
                    const isUnlinkedCase = !requirementTitle;
                    const isPendingSchedulerCase =
                      testCase.ai_generation_source === "scheduler" && testCase.ai_generation_review_status === "pending";
                    const isRunningCase = schedulerActionCaseId === testCase.id && schedulerActionKind === "run";
                    const isRunningLocalCase = schedulerActionCaseId === testCase.id && schedulerActionKind === "run-local";
                    const isApiOnlyCase = isApiOnlyTestCase(testCase.id);
                    const canRunLocalCase = testCase.automated === "yes" || isApiOnlyCase;
                    const isAcceptingCase = schedulerActionCaseId === testCase.id && schedulerActionKind === "accept";
                    const isRejectingCase = schedulerActionCaseId === testCase.id && schedulerActionKind === "reject";
                    const automationReadiness = testCase.automated === "yes"
                      ? 100
                      : Math.min(96, Math.max(26, 36 + stepCount * 4 + (requirementTitle ? 14 : 0) + (history.length ? 8 : 0) - failedRunCount * 6));
                    const stabilityScore = history.length ? passRate : 0;
                    const caseTypeLabel = testCase.api_only
                      ? "API"
                      : getTestCaseExecutionTypeLabel((testCase.step_types || []).map((step_type) => ({ step_type, api_request: null })));
                    const qualityScore = testCase.ai_quality_score === null || testCase.ai_quality_score === undefined
                      ? calculateTestCaseAiQualityScore({
                          title: testCase.title,
                          description: testCase.description,
                          steps: [],
                          requirementId: testCase.requirement_ids?.[0] || testCase.requirement_id,
                          labels: testCase.labels || [],
                          parameterValues: (testCase.parameter_values || {}) as Record<string, string>
                        })
                      : testCase.ai_quality_score;
                    const aiInsightTone = isFailedCase ? "danger" : isUnlinkedCase || stabilityScore < 60 ? "warning" : "success";
                    const aiInsight = isFailedCase
                      ? "AI: Recent failures point to unstable execution evidence. Review latest run details and add negative coverage."
                      : isUnlinkedCase
                        ? "AI: Link this case to a requirement so release scope and risk coverage stay traceable."
                        : canUseAutomationWorkspace && testCase.automated !== "yes" && automationReadiness >= 70
                          ? "AI: Strong automation candidate with clear scope and repeatable validation steps."
                          : "AI: Stable recent coverage. Keep it in the release gate for confidence tracking.";
                    const tileActions = [
	                      {
	                        label: "Open case",
	                        description: "Open this test case in the workspace.",
	                        icon: <OpenIcon />,
	                        onClick: () => openLibraryCase(testCase.id),
	                        requiredPermissions: ["testcase.view"]
	                      },
                      ...(isFailedCase
                        ? [
                          {
                            label: "View latest failure",
	                            description: "Open the most recent failed or blocked execution.",
	                            icon: <OpenIcon />,
	                            onClick: () => openLatestFailureRun(testCase.id),
	                            requiredPermissions: ["run.view"]
	                          }
                        ]
                        : []),
                      {
                        label: isFailedCase ? "Re-run manually" : "Run manually",
                        description: "Create a manual execution run for this test case.",
		                        icon: <TestCaseRunIcon />,
		                        onClick: () => void handleRunTestCase(testCase.id),
		                        disabled: isRunningCase || isRunningLocalCase || isAcceptingCase || isRejectingCase || !canCreateRuns || !projectId || !appTypeId || !session?.user.id,
	                        featureKeys: ["qaira.manual.runs"],
	                        requiredPermissions: ["run.create"],
	                        tone: "primary" as const
	                      },
                      ...(isPendingSchedulerCase
                        ? []
                        : [
                          {
                            label: isApiOnlyCase ? "Run API locally" : "Run local Playwright",
                            description: isApiOnlyCase ? "Start this API case against the local Test Engine API runner." : "Start this automated case against the local Playwright runner.",
		                            icon: <TestCaseRunIcon />,
		                            onClick: () => void handleRunTestCase(testCase.id, "local"),
		                            disabled: isRunningLocalCase || createLocalRun.isPending || !canRunLocalAutomation || !canRunLocalCase || !projectId || !appTypeId || !session?.user.id,
		                            featureKeys: ["qaira.automation.workspace", "qaira.automation.local_execution"],
		                            requiredPermissions: ["automation.run.local"],
	                            tone: "primary" as const
	                          },
                          {
                            label: "Clone case",
                            description: "Create a copy with the same steps and test data.",
	                            icon: <CopyIcon />,
	                            onClick: () => void handleCloneCase(testCase),
	                            disabled: createTestCase.isPending,
	                            requiredPermissions: ["testcase.create"]
	                          },
                          {
                            label: "Export case",
                            description: "Download this test case as a CSV file.",
	                            icon: <ExportIcon />,
	                            onClick: () => void exportCasesToCsv([testCase], {
	                              fileLabel: testCase.title
	                            }),
	                            requiredPermissions: ["testcase.export"]
	                          },
                          {
                            label: "Move to suite",
	                            description: "Pick existing suite links and replace this case's current suite scope.",
	                            icon: <MoveIcon />,
	                            onClick: () => openSuiteTransferModal([testCase.id], "move"),
	                            requiredPermissions: ["suite.update"]
	                          },
                          {
                            label: "Delete case",
                            description: "Remove this test case while preserving run history.",
	                            icon: <TrashIcon />,
	                            onClick: () => void handleDeleteCaseItem(testCase),
	                            disabled: deleteTestCase.isPending,
	                            requiredPermissions: ["testcase.delete"],
	                            tone: "danger" as const
	                          }
                        ])
                    ];

                    return (
                      <div
                        aria-pressed={isActive}
                        className={[
                          "record-card tile-card test-case-card test-case-catalog-card",
                          isFailedCase ? "is-risk" : isUnlinkedCase || stabilityScore < 60 ? "is-warning" : "is-healthy",
                          isActive ? "is-active" : "",
                          isSelectedForAction ? "is-marked-for-delete" : "",
                          caseModuleById.has(testCase.id) ? "is-module-child" : ""
                        ].filter(Boolean).join(" ")}
                        draggable
                        key={testCase.id}
                        onClick={() => {
                          openTestCaseWorkspace(testCase.id);
                          setIsCreating(false);
                          setDraftSteps([]);
                        }}
                        onDragEnd={() => setDraggingCaseIds([])}
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", testCase.id);
                          startDraggingTestCases(testCase.id);
                        }}
                        onKeyDown={(event) => {
                          if (event.target !== event.currentTarget) {
                            return;
                          }

                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openTestCaseWorkspace(testCase.id);
                            setIsCreating(false);
                            setDraftSteps([]);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="tile-card-main">
                          <div className="tile-card-select-row test-case-card-header">
                            <label className="checkbox-field test-case-delete-checkbox" onClick={(event) => event.stopPropagation()}>
	                              <input
	                                checked={isSelectedForAction}
                                onChange={(event) =>
                                  setSelectedActionTestCaseIds((current) =>
                                    event.target.checked ? [...new Set([...current, testCase.id])] : current.filter((id) => id !== testCase.id)
                                  )
                                }
		                                type="checkbox"
		                              />
		                            </label>
		                            <DisplayIdBadge value={testCase.display_id || testCase.id} />
	                            <div className="catalog-inline-actions test-case-top-actions">
	                              {isPendingSchedulerCase ? renderAiGeneratedDecision(testCase) : null}
	                              <StatusBadge value={statusLabel} />
	                              <div onClick={(event) => event.stopPropagation()}>
	                                <CatalogActionMenu actions={tileActions} label={`${testCase.title} actions`} />
	                              </div>
	                            </div>
		                          </div>
		                          <div className="test-case-requirement-block">
		                            <span className="test-case-requirement-label">Requirement</span>
		                            <p>
		                              {requirementDisplayId ? <DisplayIdBadge value={requirementDisplayId} /> : null}
		                              <strong>{requirementTitle || "No requirement linked"}</strong>
		                            </p>
		                          </div>
		                          <div className="tile-card-title-group test-case-card-title-group test-case-card-title-group--identity">
		                            <strong>{testCase.title}</strong>
		                          </div>
	                          <RichTextContent className="tile-card-description" value={testCase.description} fallback="No description yet for this test case." />
	                          <div className="test-case-card-stats" aria-label={`${testCase.title} facts`}>
	                            <span title={`${stepCount} step${stepCount === 1 ? "" : "s"}`}>
	                              <strong>{stepCount}</strong>
	                              <small>Steps</small>
                            </span>
                            <span title={`${caseTypeLabel} execution`}>
                              <strong>{caseTypeLabel}</strong>
                              <small>Type</small>
                            </span>
                            <span title={`${qualityScore}% Test Quality Score`}>
                              <strong>{qualityScore}%</strong>
                              <small>Test Quality</small>
                            </span>
                            <span title={`${failedRunCount} failed or blocked recent run${failedRunCount === 1 ? "" : "s"}`}>
                              <strong>{failedRunCount ? `${failedRunCount}x` : "0x"}</strong>
                              <small>Failed</small>
                            </span>
                          </div>
                          <div className="tile-card-footer">
                            <div className="test-case-readiness-grid">
                              {canUseAutomationWorkspace ? <div className="test-case-card-progress-row" aria-label={`${automationReadiness}% automation readiness`}>
                                <div>
                                  <span>Automation readiness</span>
                                  <strong>{`${automationReadiness}%`}</strong>
                                </div>
                                <div className="test-case-card-progress-track">
                                  <span style={{ width: `${automationReadiness}%` }} />
                                </div>
                              </div> : null}
                              <div className="test-case-card-progress-row" aria-label={history.length ? `${stabilityScore}% recent stability` : "No recent run stability"}>
                                <div>
                                  <span>Stability</span>
                                  <strong>{history.length ? `${stabilityScore}%` : "No runs"}</strong>
                                </div>
                                <div className={["test-case-card-progress-track", stabilityScore < 60 ? "danger" : ""].filter(Boolean).join(" ")}>
                                  <span style={{ width: `${history.length ? stabilityScore : 8}%` }} />
                                </div>
                              </div>
                            </div>
                            <div className={`test-case-ai-note ${aiInsightTone}`}>
                              <span aria-hidden="true">{isFailedCase ? "!" : "AI"}</span>
                              <p>{aiInsight}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
              {!isLibraryLoading && filteredCases.length && catalogViewMode === "list" ? (
                <div className="test-case-module-list">
                  {moduleCaseGroups.groups
                    .filter(({ cases }) => cases.length || !deferredSearchTerm.trim())
                    .map(({ module, cases }) => {
                      const isCollapsed = collapsedModuleIds.includes(module.id);
                      const moduleChildIds = (module.test_case_ids || []).filter((id) => testCases.some((testCase) => testCase.id === id));
                      const isSelected = selectedModuleIds.includes(module.id)
                        && moduleChildIds.every((id) => selectedActionTestCaseIds.includes(id));

                      return (
                        <section className="test-case-module-list-section" key={module.id}>
                          <div
                            className={draggingCaseIds.length ? "test-case-module-header is-drop-ready" : "test-case-module-header"}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={() => void handleDropCaseOnModule(module.id)}
                          >
                            <label className="checkbox-field">
                              <input
                                checked={isSelected}
                                onChange={(event) => setModuleAndChildrenSelected(module, event.target.checked)}
                                type="checkbox"
                              />
                            </label>
                            <button
                              className={isCollapsed ? "ghost-button compact module-toggle-button" : "ghost-button compact module-toggle-button is-expanded"}
                              onClick={() =>
                                setCollapsedModuleIds((current) =>
                                  current.includes(module.id) ? current.filter((id) => id !== module.id) : [...current, module.id]
                                )
                              }
                              type="button"
                            >
                              <ModuleChevronIcon />
                            </button>
                            <span className="module-folder-icon">
                              <FolderIcon size={18} />
                            </span>
                            {renamingModuleId === module.id ? (
                              <input
                                className="module-rename-input"
                                value={renamingModuleName}
                                onChange={(event) => setRenamingModuleName(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    void handleRenameModule(module.id);
                                  }
                                  if (event.key === "Escape") {
                                    setRenamingModuleId("");
                                    setRenamingModuleName("");
                                  }
                                }}
                              />
                            ) : (
                              <strong>{module.name}</strong>
                            )}
                            {renderModuleMetrics(moduleHealth.byId.get(module.id)!)}
                            <div className="action-row">
                              {renamingModuleId === module.id ? (
                                <button className="primary-button compact" onClick={() => void handleRenameModule(module.id)} type="button">Save</button>
                              ) : (
                                <button
                                  aria-label={`Rename module ${module.name}`}
                                  className="ghost-button compact module-edit-button"
                                  onClick={() => {
                                    setRenamingModuleId(module.id);
                                    setRenamingModuleName(module.name);
                                  }}
                                  title="Rename module"
                                  type="button"
                                >
                                  <ModulePencilIcon />
                                </button>
                              )}
                            </div>
                          </div>
                          {!isCollapsed ? (
                            <div className="test-case-module-children">
                              <DataTable
                                columns={testCaseListColumns}
                                enableColumnResize
                                enableHeaderColumnReorder
                                emptyMessage="No test cases in this module."
                                getRowDraggable={() => true}
                                getRowClassName={(testCase) => (selectedTestCaseId === testCase.id && !isCreating ? "is-active-row" : "")}
                                getRowKey={(testCase) => testCase.id}
                                hideToolbarCopy
                                onRowDragEnd={() => setDraggingCaseIds([])}
                                onRowDragStart={(testCase) => startDraggingTestCases(testCase.id)}
                                onRowClick={(testCase) => openLibraryCase(testCase.id)}
                                rows={cases}
                                storageKey={`qaira:test-cases:list-columns:${module.id}`}
                              />
                            </div>
                          ) : null}
                        </section>
                      );
                    })}
                  {moduleCaseGroups.unassignedCases.length ? (
                    <section className="test-case-module-list-section">
                      <div className="test-case-module-header is-unassigned">
                        <label className="checkbox-field">
                          <input
                            checked={areAllUnassignedCasesSelected}
                            onChange={(event) => setUnassignedTestCasesSelected(event.target.checked)}
                            type="checkbox"
                          />
                        </label>
                        <span className="module-folder-icon">
                          <FolderIcon size={18} />
                        </span>
                        <strong>Unassigned module</strong>
                        {renderModuleMetrics(moduleHealth.unassigned)}
                      </div>
                      <DataTable
                        columns={unassignedTestCaseListColumns}
                        enableColumnResize
                        enableHeaderColumnReorder
                        emptyMessage="No unassigned test cases."
                        getRowDraggable={() => true}
                        getRowClassName={(testCase) => (selectedTestCaseId === testCase.id && !isCreating ? "is-active-row" : "")}
                        getRowKey={(testCase) => testCase.id}
                        hideToolbarCopy
                        onRowDragEnd={() => setDraggingCaseIds([])}
                        onRowDragStart={(testCase) => startDraggingTestCases(testCase.id)}
                        onRowClick={(testCase) => openLibraryCase(testCase.id)}
                        rows={moduleCaseGroups.unassignedCases}
                        storageKey="qaira:test-cases:list-columns:unassigned"
                      />
                    </section>
                  ) : null}
                </div>
              ) : null}
	              {!isLibraryLoading && hasMoreVisibleTestCases ? (
	                <div className="catalog-progressive-load">
	                  <span>
	                    Showing {Math.min(visibleTestCaseCount, filteredCases.length)} of {filteredCases.length} matching test cases.
	                  </span>
	                  <button
	                    className="ghost-button"
	                    onClick={() => setVisibleTestCaseCount((current) => current + TEST_CASE_RENDER_BATCH_SIZE)}
	                    type="button"
	                  >
	                    Load more
	                  </button>
	                </div>
	              ) : null}
	              {!isLibraryLoading && !filteredCases.length ? (
                testCases.length ? (
                  <div className="empty-state compact">No test cases match the current search.</div>
                ) : (
                  <div className="empty-state compact">
                    <div>No test cases exist for this app type yet.</div>
                    <button className="primary-button" disabled={!appTypeId} onClick={() => beginCreateCase()} type="button">Create first case</button>
                  </div>
                )
              ) : null}
            </TileBrowserPane>
          </Panel>
        )}
        detailView={(
          <Panel
            actions={caseHeaderActions}
            title="Test case workspace"
            subtitle={selectedTestCaseId || isCreating ? "Switch between case details and step editing without losing the selected context." : "Select a test case or create a new one."}
          >
            {selectedTestCaseId || isCreating ? (
              <div className="detail-stack">
                {!isCreating && selectedTestCase ? (
                  <DetailSectionTabs
                    activeTab={activeTestCaseDetailTab}
                    ariaLabel="Test case detail sections"
                    items={[
                      { value: "details", label: "Details", icon: <PencilIcon /> },
                      { value: "history", label: "History", icon: <ActivityIcon /> },
                      { value: "defects", label: "Linked bugs", icon: <BugIcon />, count: selectedTestCase.defect_ids?.length || 0 },
                      { value: "evidence", label: "Attachments", icon: <JiraAttachmentIcon /> }
                    ]}
                    onChange={setActiveTestCaseDetailTab}
                  />
                ) : null}
                {isCreating || activeTestCaseDetailTab === "details" ? (
                <div className="detail-section-panel">
                <div className="editor-accordion">
                  <div ref={caseSectionRef}>
                    <EditorAccordionSection
                      countLabel={isCreating ? "Draft" : caseDraft.status || defaultTestCaseStatus}
                      isExpanded={expandedSections.case}
                      onToggle={() => setExpandedSections((current) => ({ ...current, case: !current.case }))}
                      summary={caseSectionSummary}
                      title={caseSectionTitleContent}
                    >
                      <form className="form-grid" onSubmit={(event) => void handleSaveCase(event)}>
                        {hasReadableCasePreview ? (
                          <div className="step-parameter-preview">
                            <span className="step-parameter-preview-label">Readable preview on this screen</span>
                            <strong>{readableCaseTitle || "No title written yet"}</strong>
                            <span>{readableCaseDescription || "Description, step cards, and section summaries will resolve saved values here without changing the stored authoring text."}</span>
                          </div>
                        ) : null}

                        <div className="record-grid">
                          <div className="test-case-title-field">
                            <FormField label="Title" required>
                              <input
                                required
                                value={caseDraft.title}
                                onChange={(event) => setCaseDraft((current) => ({ ...current, title: event.target.value }))}
                              />
                            </FormField>
                          </div>
                          <FormField label="Status">
                            <select
                              value={caseDraft.status}
                              onChange={(event) => setCaseDraft((current) => ({ ...current, status: event.target.value }))}
                            >
                              {testCaseStatusOptions.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </FormField>
                          <FormField label="Priority">
                            <input
                              min="1"
                              max="5"
                              type="number"
                              value={caseDraft.priority}
                              onChange={(event) => setCaseDraft((current) => ({ ...current, priority: Number(event.target.value) || 3 }))}
                            />
                          </FormField>
                          {canUseAutomationWorkspace ? <FormField label="Automated">
                            <select
                              value={caseDraft.automated}
                              onChange={(event) =>
                                setCaseDraft((current) => ({ ...current, automated: event.target.value as "yes" | "no" }))
                              }
                            >
                              {testCaseAutomatedOptions.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </FormField> : null}
                          <FormField label="Reviewer">
                            <select
                              value={caseDraft.reviewer_id}
                              onChange={(event) => setCaseDraft((current) => ({ ...current, reviewer_id: event.target.value }))}
                            >
                              <option value="">No reviewer</option>
                              {users.map((user) => (
                                <option key={user.id} value={user.id}>{user.name || user.email}</option>
                              ))}
                            </select>
                          </FormField>
                          <FormField label="Requirement">
                            <select
                              value={caseDraft.requirement_id}
                              onChange={(event) => setCaseDraft((current) => ({ ...current, requirement_id: event.target.value }))}
                            >
                              <option value="">No requirement</option>
                              {requirements.map((requirement: Requirement) => (
                                <option key={requirement.id} value={requirement.id}>{requirement.title}</option>
                              ))}
                            </select>
                          </FormField>
                          <FormField label="Module">
                            <select
                              value={caseDraft.module_id}
                              onChange={(event) => setCaseDraft((current) => ({ ...current, module_id: event.target.value }))}
                            >
                              <option value="">No module</option>
                              {testCaseModules.map((module) => (
                                <option key={module.id} value={module.id}>{module.name}</option>
                              ))}
                            </select>
                          </FormField>
                          <FormField label="Authoring completeness">
                            <div className="ai-quality-inline">
                              <span className={computedCaseAiQualityScore < 70 ? "ai-quality-score is-low" : "ai-quality-score"}>
                                {computedCaseAiQualityScore}%
                              </span>
                              {computedCaseAiQualityScore < 70 && caseQualitySuggestions.length ? (
                                <button className="ghost-button compact" onClick={() => setIsQualitySuggestionModalOpen(true)} type="button">
                                  <TestCaseSparkIcon />
                                  <span>Review gaps</span>
                                </button>
                              ) : null}
                            </div>
                          </FormField>
                          <div className="test-case-labels-field">
                            <CaseLabelsField
                              availableLabels={existingCaseLabels}
                              value={caseDraft.labelsText}
                              onChange={(labelsText) => setCaseDraft((current) => ({ ...current, labelsText }))}
                            />
                          </div>
                        </div>
                        <FormField label="Description">
                          <RichTextEditor
                            rows={4}
                            value={caseDraft.description}
                            onChange={(description) => setCaseDraft((current) => ({ ...current, description }))}
                          />
                        </FormField>
                        <FormField label="External references" hint="Ticket links or IDs, separated with commas.">
                          <input
                            value={caseDraft.externalReferencesText}
                            onChange={(event) => setCaseDraft((current) => ({ ...current, externalReferencesText: event.target.value }))}
                          />
                        </FormField>

                        <SchemaPropertyFields
                          catalog={testCaseFieldCatalog}
                          excludeKeys={TEST_CASE_CORE_SCHEMA_KEYS}
                          onChange={(customFields) => setCaseDraft((current) => ({ ...current, customFields }))}
                          userOptions={assigneeOptions.map((option) => ({ label: option.label, value: option.id }))}
                          values={caseDraft.customFields}
                        />

                        <AiAssurancePanel
                          compact
                          gaps={testCaseReviewReadiness.gaps}
                          provenance="Local authoring rules over title, description, traceability, labels, parameters, and complete action/expected-result pairs"
                          reviewState={!isCreating && selectedReviewStatus === "accepted" ? "human-reviewed" : !isCreating && selectedReviewStatus === "pending" ? "pending-review" : "review-required"}
                          score={testCaseReviewReadiness.score}
                          scoreLabel={testCaseReviewReadiness.scoreLabel}
                          signals={testCaseReviewReadiness.signals}
                          summary={testCaseReviewReadiness.summary}
                          title="Test case review readiness"
                        />

                        {!isCreating && selectedTestCase ? (
                          <div className="action-row">
                            <button
                              className="ghost-button compact"
                              disabled={!canUseTestCaseAi || !projectId || previewTestCaseImpact.isPending}
                              onClick={openTestCaseImpactPreview}
                              type="button"
                            >
                              <TestCaseSparkIcon />
                              <span>{previewTestCaseImpact.isPending ? "Reviewing impact…" : "Preview downstream impact"}</span>
                            </button>
                            <span className="form-help">{canUseAutomationWorkspace
                              ? "Read-only traceability, run, automation, and locator review."
                              : "Read-only traceability and run review."}</span>
                          </div>
                        ) : null}

                        {!isCreating && selectedTestCase && canUseAutomationWorkspace ? (
                          <div className="detail-summary automation-link-summary">
                            <strong>Automation mapping</strong>
                            <span>
                              Automation keywords and object repository references are stored on this manual test case. No duplicate automation case is created.
                            </span>
                            <StatusBadge value={selectedTestCase.automation_status || (selectedTestCase.automated === "yes" ? "ready" : "not automated")} />
                            {selectedTestCase.automated === "yes" ? (
                              <button className="ghost-button compact" onClick={() => navigate(`/automation?case=${encodeURIComponent(selectedTestCase.id)}`)} type="button">
                                <OpenIcon size={16} />
                                <span>Open automation workspace</span>
                              </button>
                            ) : null}
                          </div>
                        ) : null}

                        {!isCreating && selectedTestCase && canReviewSelectedTestCase ? (
                          <details
                            className="detail-summary test-case-review-summary"
                            key={`${selectedTestCase.id}:${selectedReviewStatus}`}
                            open={isSelectedReviewPending}
                          >
                            <summary className="test-case-review-summary-head">
                              <div>
                                <strong>Review</strong>
                                <span>{TEST_CASE_REVIEW_STATUS_LABELS[selectedReviewStatus]}</span>
                              </div>
                              <StatusBadge value={isSelectedReviewPending ? "pending" : "completed"} />
                            </summary>
                            <div className="test-case-review-summary-body">
                              {isSelectedReviewPending ? (
                                <>
                                  <textarea
                                    placeholder="Reviewer comments"
                                    rows={2}
                                    value={reviewComment}
                                    onChange={(event) => setReviewComment(event.target.value)}
                                  />
                                  <div className="action-row">
                                    <button
                                      className="ghost-button compact"
                                      disabled={reviewTestCase.isPending}
                                      onClick={() => openReviewSuggestionDialog(selectedTestCase.id, reviewComment)}
                                      type="button"
                                    >
                                      Suggest changes
                                    </button>
                                    <button
                                      className="primary-button compact"
                                      disabled={reviewTestCase.isPending}
                                      onClick={() => void handleSubmitReview("accepted")}
                                      type="button"
                                    >
                                      Accept
                                    </button>
                                  </div>
                                </>
                              ) : (
                                <div className="review-readonly-note">
                                  Review action is complete. Expand this section to inspect the captured decision history.
                                </div>
                              )}
                              {selectedTestCase.review_history?.length ? (
                                <div className="data-table-multiline">
                                  {selectedTestCase.review_history.slice().reverse().slice(0, 4).map((entry) => (
                                    <span className="data-table-multiline-line" key={entry.id}>
                                      {`${TEST_CASE_REVIEW_STATUS_LABELS[entry.status]} · ${resolveAuditUserLabel(entry.user_id, userById)} · ${formatAuditTimestamp(entry.created_at)}${entry.comment ? ` · ${entry.comment}` : ""}`}
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          </details>
                        ) : null}

                        {selectedCaseSuites.length ? (
                          <div className="detail-summary">
                            <strong>{isCreating ? "Suite link ready" : "Suite references"}</strong>
                            <span>
                              {isCreating
                                ? `This new test case will open in the full editor and save into the "${selectedCaseSuites[0].name}" suite.`
                                : `This test case is currently referenced in ${selectedCaseSuites.length} suite${selectedCaseSuites.length === 1 ? "" : "s"}.`}
                            </span>
                            <div className="selection-chip-row">
                              {selectedCaseSuites.map((suite) => (
                                <span className="selection-chip" key={suite.id}>
                                  {suite.name}
                                </span>
                              ))}
                            </div>
                            {!isCreating && selectedTestCase ? (
                              <div className="action-row">
	                              <button className="ghost-button" disabled={!canUpdateSuites} onClick={handleOpenSuiteLinkModal} type="button">
                                  <AddIcon />
                                  <span>Manage suite links</span>
                                </button>
                              </div>
                            ) : null}
                          </div>
                        ) : !isCreating && selectedTestCase ? (
                          <div className="detail-summary">
                            <strong>Suite references</strong>
                            <span>This test case is not linked to any suite yet.</span>
                            <div className="action-row">
                              <button className="ghost-button" onClick={handleOpenSuiteLinkModal} type="button">
                                <AddIcon />
                                <span>Link to suite</span>
                              </button>
                            </div>
                          </div>
                        ) : null}

                        <div className="action-row">
	                          <button className="primary-button" disabled={(isCreating ? !canCreateTestCases : !canUpdateTestCases) || createTestCase.isPending || updateTestCase.isPending || updateStep.isPending || updateSuite.isPending || assignCasesToModule.isPending || removeCasesFromModule.isPending} type="submit">
                            {isCreating
                              ? (createTestCase.isPending || updateSuite.isPending || assignCasesToModule.isPending ? "Creating…" : "Create test case")
                              : (updateTestCase.isPending || updateStep.isPending || updateSuite.isPending || assignCasesToModule.isPending || removeCasesFromModule.isPending ? "Saving…" : "Save test case")}
                          </button>
                          {isCreating ? (
                            <button
                              className="ghost-button"
                              onClick={() => {
                                setCreateSuiteContextId("");
                                setIsCreating(false);
                                setDraftSteps([]);
                                setNewStepDraft(EMPTY_STEP_DRAFT);
                                setStepInsertIndex(null);
                                setStepInsertGroupContext(null);
                                setSelectedStepIds([]);
                              }}
                              type="button"
                            >
                              Cancel new case
                            </button>
                          ) : null}
                          {!isCreating && selectedTestCase ? (
                            <button className="ghost-button danger" onClick={() => void handleDeleteCase()} type="button">
                              Delete test case
                            </button>
                          ) : null}
                        </div>
                      </form>
                    </EditorAccordionSection>
                  </div>

                  <EditorAccordionSection
                    countLabel={`${preconditionSteps.length} item${preconditionSteps.length === 1 ? "" : "s"}`}
                    isExpanded={expandedSections.preconditions}
                    onToggle={() => setExpandedSections((current) => ({ ...current, preconditions: !current.preconditions }))}
                    summary={preconditionSteps.length ? "Setup assumptions and pre-run steps captured before the main flow." : "Add setup assumptions or pre-run steps before the main test steps."}
                    title="Preconditions"
                  >
                    <div className="step-editor step-editor--embedded">
                      <div className="step-list">
                        {!preconditionSteps.length ? (
                          <>
                            <div className="step-empty-insert">
                              <StepIconButton
                                ariaLabel="Add first precondition"
                                onClick={() => activateStepInsert(0, preconditionGroupContext)}
                                title="Add first precondition"
                                type="button"
                              >
                                <StepInsertIcon />
                              </StepIconButton>
                            </div>
                            {renderStepInsertSlot(0, preconditionGroupContext)}
                          </>
                        ) : null}
                        {preconditionSteps.map((step, index) => (
                          <Fragment key={step.id}>
                            {renderStepInsertSlot(Math.max(0, step.step_order - 1), preconditionGroupContext)}
                            {renderStepCard(step, index, preconditionGroupContext, preconditionSteps, true)}
                            {index === preconditionSteps.length - 1 ? renderStepInsertSlot(step.step_order, preconditionGroupContext) : null}
                          </Fragment>
                        ))}
                      </div>
                      {!preconditionSteps.length ? (
                        <div className="empty-state compact">
                          <div>No preconditions yet. Use the inline add action to create the first setup step.</div>
                          {stepInsertIndex === null ? (
                            <button className="ghost-button" onClick={() => activateStepInsert(0, preconditionGroupContext)} type="button">
                              Add first precondition
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </EditorAccordionSection>

                  <EditorAccordionSection
                    countLabel={stepCountLabel}
                    isExpanded={expandedSections.steps}
                    onToggle={() => setExpandedSections((current) => ({ ...current, steps: !current.steps }))}
                    summary={stepSectionSummary}
                    title={isCreating ? "Draft steps" : "Test steps"}
                  >
                    {isVisualBuilderActive ? (
                      <VisualTestBuilder testSteps={mainSteps} />
                    ) : (
                    <div className="step-editor step-editor--embedded">
                      <div className="step-editor-toolbar">
                        <label className="checkbox-field step-select-all">
                          <input
                            checked={allStepsSelected}
                            disabled={!mainSteps.length}
                            onChange={(event) =>
                              setSelectedStepIds(event.target.checked ? mainSteps.map((step) => step.id) : [])
                            }
                            type="checkbox"
                          />
                          Select all steps
                        </label>
                        <StepActionMenu
                          className="step-card-menu--inline step-card-menu--inline-right"
                          label="Test step actions"
                          openOnHover
                          previewActions={editorStepActions}
                          actions={editorStepActions}
                        />
                      </div>

      {copiedSteps.length ? null : null}

      {!isCreating && stepsQuery.isLoading ? <LoadingState label="Loading steps" /> : null}

      <div className="step-list">
                        {!mainSteps.length ? (
                          <>
                            <div className="step-empty-insert">
                              <StepIconButton ariaLabel="Add first step" onClick={() => activateStepInsert(0, null)} title="Add first step" type="button">
                                <StepInsertIcon />
                              </StepIconButton>
                            </div>
                            {renderStepInsertSlot(0, null)}
                          </>
                        ) : null}

                        {stepBlocks.map((block) => {
                          if (block.group_id) {
                            const firstStep = block.steps[0];
                            const lastStep = block.steps[block.steps.length - 1];
                            const isGroupExpanded = expandedStepGroupIds.includes(block.group_id);
                            const blockIndex = stepBlocks.findIndex((item) => item.key === block.key);
                            const canMoveGroupUp = blockIndex > 0;
                            const canMoveGroupDown = blockIndex < stepBlocks.length - 1;
                            const blockGroupContext: StepInsertionGroupContext = {
                              group_id: block.group_id,
                              group_name: block.group_name,
                              group_kind: block.group_kind || null,
                              reusable_group_id: block.reusable_group_id
                            };

                            return (
                              <Fragment key={block.key}>
                                {renderStepInsertSlot(Math.max(0, firstStep.step_order - 1))}
                                <div
                                  className={[
                                    isGroupExpanded ? "step-group-block is-expanded" : "step-group-block is-collapsed",
                                    block.group_kind === "reusable" ? "is-shared-group" : "is-local-group"
                                  ].join(" ")}
                                >
                                  <StepGroupHeader
                                    isExpanded={isGroupExpanded}
                                    kind={block.group_kind}
                                    name={block.group_name || "Step group"}
                                    canMoveUp={canMoveGroupUp}
                                    canMoveDown={canMoveGroupDown}
                                    onConvertToLocal={() =>
                                      void handleConvertStepGroup(
                                        block.group_id as string,
                                        block.group_name || "Step group",
                                        block.steps,
                                        "local"
                                      )
                                    }
                                    onConvertToShared={() =>
                                      void handleConvertStepGroup(
                                        block.group_id as string,
                                        block.group_name || "Step group",
                                        block.steps,
                                        "reusable"
                                      )
                                    }
                                    onToggle={() =>
                                      setExpandedStepGroupIds((current) =>
                                        current.includes(block.group_id as string)
                                          ? current.filter((id) => id !== block.group_id)
                                          : [...current, block.group_id as string]
                                      )
                                    }
                                    onMoveUp={() => void handleMoveStepGroup(block.group_id as string, "up")}
                                    onMoveDown={() => void handleMoveStepGroup(block.group_id as string, "down")}
                                    onPreviewCode={() => openGroupAutomationPreview(block.group_name || "Step group", block.steps)}
                                    onRemoveGroup={() => void handleRemoveStepGroup(block.group_id as string, block.steps, block.group_kind)}
                                    onUngroup={() => void handleUngroupStepGroup(block.group_id as string, block.group_kind)}
                                    onToggleSelect={(checked) => {
                                      const groupStepIds = block.steps.map((step) => step.id);
                                      if (checked) {
                                        setSelectedStepIds((current) => Array.from(new Set([...current, ...groupStepIds])));
                                      } else {
                                        setSelectedStepIds((current) => current.filter((id) => !groupStepIds.includes(id)));
                                      }
                                    }}
                                    selectionState={(() => {
                                      const groupStepIds = block.steps.map((step) => step.id);
                                      const selectedCount = groupStepIds.filter((id) => selectedStepIds.includes(id)).length;
                                      if (!selectedCount) {
                                        return "none";
                                      }
                                      if (selectedCount === groupStepIds.length) {
                                        return "all";
                                      }
                                      return "some";
                                    })()}
                                    stepCount={block.steps.length}
                                  />
                                  {isGroupExpanded ? (
                                    <div className="step-group-block-body">
                                      {block.steps.map((step) => {
                                        const stepIndex = mainSteps.findIndex((item) => item.id === step.id);

                                        return (
                                          <Fragment key={step.id}>
                                            {renderStepInsertSlot(Math.max(0, step.step_order - 1), blockGroupContext)}
                                            {renderStepCard(step, stepIndex, blockGroupContext, mainSteps)}
                                          </Fragment>
                                        );
                                      })}
                                      {renderStepInsertSlot(lastStep.step_order, blockGroupContext)}
                                    </div>
                                  ) : null}
                                </div>
                                {lastStep.id === mainSteps[mainSteps.length - 1]?.id ? renderStepInsertSlot(lastStep.step_order) : null}
                              </Fragment>
                            );
                          }

                          const step = block.steps[0];
                          const stepIndex = mainSteps.findIndex((item) => item.id === step.id);

                          return (
                            <Fragment key={block.key}>
                              {renderStepInsertSlot(Math.max(0, step.step_order - 1))}
                              {renderStepCard(step, stepIndex, null, mainSteps)}
                              {step.id === mainSteps[mainSteps.length - 1]?.id ? renderStepInsertSlot(step.step_order) : null}
                            </Fragment>
                          );
                        })}
                      </div>

                      {!mainSteps.length ? (
                        <div className="empty-state compact">
                          <div>
                            {isCreating
                              ? "No draft steps yet. Use the inline + action to add the first step or insert a shared group."
                              : "No steps yet for this test case. Use the inline + action to add one or insert a shared group."}
                          </div>
                          {stepInsertIndex === null ? (
                            <button className="ghost-button" onClick={() => activateStepInsert(0, null)} type="button">Add first step</button>
                          ) : null}
                        </div>
                      ) : null}

                      {!isCreating ? (
                        <div className="action-row step-editor-save-row">
                          <button className="primary-button" disabled={updateTestCase.isPending || updateStep.isPending || updateSuite.isPending || assignCasesToModule.isPending || removeCasesFromModule.isPending} onClick={() => void handleSaveCaseAndSteps()} type="button">
                            {updateTestCase.isPending || updateStep.isPending || updateSuite.isPending || assignCasesToModule.isPending || removeCasesFromModule.isPending ? "Saving…" : "Save test case"}
                          </button>
                        </div>
                      ) : null}
                    </div>
                    )}
                  </EditorAccordionSection>

                  {!isCreating && canUseAutomationWorkspace ? (
                    <EditorAccordionSection
                      countLabel={automationTargetCaseIds.length ? `${automationTargetCaseIds.length} target${automationTargetCaseIds.length === 1 ? "" : "s"}` : "Ready"}
                      isExpanded={expandedSections.automation}
                      onToggle={() => setExpandedSections((current) => ({ ...current, automation: !current.automation }))}
                      summary={automationSectionSummary}
                      title="Automation builder"
                    >
                      <div className="automation-builder-panel">
                        <details className="automation-run-context-section">
                          <summary>
                            <ExecutionStepsIcon />
                            <span>Run context</span>
                          </summary>
                          <ExecutionContextSelector
                            appTypeId={appTypeId}
                            onConfigurationChange={setSelectedExecutionConfigurationId}
                            onDataSetChange={setSelectedExecutionDataSetId}
                            onEnvironmentChange={setSelectedExecutionEnvironmentId}
                            prefillFirstAvailable
                            projectId={projectId}
                            selectedConfigurationId={selectedExecutionConfigurationId}
                            selectedDataSetId={selectedExecutionDataSetId}
                            selectedEnvironmentId={selectedExecutionEnvironmentId}
                          />
                        </details>

                        <div className="record-grid automation-builder-form">
                          <FormField label="Start URL">
                            <input
                              onChange={(event) => setAutomationStartUrl(event.target.value)}
                              placeholder="Uses selected environment base URL when blank"
                              value={automationStartUrl}
                            />
                          </FormField>
                          <FormField label="Failure threshold">
                            <input
                              min={1}
                              max={50}
                              onChange={(event) => setAutomationFailureThreshold(Math.max(1, Number(event.target.value) || 1))}
                              type="number"
                              value={automationFailureThreshold}
                            />
                          </FormField>
                        </div>

                        <FormField label="Builder guidance">
                          <textarea
                            onChange={(event) => setAutomationContext(event.target.value)}
                            placeholder="Auth assumptions, preferred data tokens, flows to ignore, or edge cases to preserve."
                            rows={4}
                            value={automationContext}
                          />
                        </FormField>

                        <div className="testops-action-row">
                          <button
                            className="primary-button"
                            disabled={!automationTargetCaseIds.length || buildSingleAutomation.isPending || buildBatchAutomation.isPending}
                            onClick={() => void handleBuildSelectedAutomation()}
                            type="button"
                          >
                            <TestCaseSparkIcon />
                            <span>
                              {buildSingleAutomation.isPending || buildBatchAutomation.isPending
                                ? "Automating..."
                                : automationTargetCaseIds.length > 1
                                  ? "Queue AI automation"
                                  : "Automate case with AI"}
                            </span>
                          </button>
                        </div>

                        <div className="stack-list automation-recorder-stack">
                          <div className="stack-item recorder-command-card">
                            <div>
                              <strong>Recorder</strong>
                              <span>{recorderSession ? `Session ${recorderSession.id.slice(0, 8)} is ${recorderSession.status}.` : "Capture clicks, fills, tab navigation, and business API traffic for this case."}</span>
                            </div>
                            <div className="recorder-workspace-pane">
	                              <RecorderStartControls
	                                disabled={!canUseRecorder || !selectedTestCase || !testEngineIntegration}
                                hasSession={Boolean(recorderSession)}
                                isStarting={startRecorder.isPending}
                                mobileRemoteEnabled={mobileRemoteRecorderEnabled}
                                onStart={(options) => void handleStartRecorder(options)}
                                primaryAction={(
                                  <button
                                    className="primary-button recorder-stop-button"
                                    disabled={!recorderSession || finishRecorder.isPending}
                                    onClick={() => void handleFinishRecorder()}
                                    type="button"
                                  >
                                    <PauseIcon />
                                    <span>{finishRecorder.isPending ? "Stopping..." : "Stop and capture steps"}</span>
                                  </button>
                                )}
                                moreActions={recorderLiveUrl ? (
                                  <a className="ghost-button compact" href={recorderLiveUrl} rel="noreferrer" target="_blank">
                                    <OpenIcon size={16} />
                                    <span>Open live view</span>
                                  </a>
                                ) : null}
                              />
                            </div>
                          </div>
                          {recorderSession ? (
                            <div className="stack-item">
                              <div>
                                <strong>{formatRecorderDisplayMode(recorderSession.display_mode)}</strong>
                                <span>{recorderSession.action_count || 0} actions · {recorderSession.network_count || 0} API candidates</span>
                              </div>
                              <StatusBadge value={recorderSession.status} />
                            </div>
                          ) : null}
                          {!recorderSession && selectedTestCase && recentRecorderCompletedCaseId === selectedTestCase.id && supportsLocalDesktopExecution ? (
                            <div className="stack-item">
                              <div>
                                <strong>Recorded automation ready</strong>
                                <span>Start a local Playwright run from this machine and review it under Local Runs.</span>
                              </div>
                              <button
                                className="primary-button"
                                disabled={isSelectedCaseLocalRunning || createLocalRun.isPending || !canSelectedCaseRunLocally || !projectId || !appTypeId || !session?.user.id}
                                onClick={() => void handleRunTestCase(selectedTestCase.id, "local")}
                                type="button"
                              >
                                <TestCaseRunIcon />
                                <span>{isSelectedCaseLocalRunning ? "Starting..." : selectedCaseLocalRunLabel}</span>
                              </button>
                            </div>
                          ) : null}
                          {recorderLiveUrl ? (
                            <iframe
                              allow="clipboard-read; clipboard-write"
                              className="recorder-live-frame"
                              src={recorderLiveUrl}
                              title="QAira recorder live view"
                            />
                          ) : null}
                          <RecorderSessionInsights session={recorderSession} />
                        </div>

                        <AutomationLearningMemory entries={automationLearningCache} />
                      </div>
                    </EditorAccordionSection>
                  ) : null}

                </div>
                </div>
                ) : null}
                {!isCreating && activeTestCaseDetailTab === "history" && selectedTestCase ? (
                  <div className="detail-section-panel" role="tabpanel">
                    <TestCaseVersionHistory
                      canRestore={canUpdateTestCases}
                      currentCase={selectedTestCase}
                      currentSteps={steps}
                      key={selectedTestCase.id}
                    />
                    <TraceabilityRunHistory
                      appTypeId={appTypeId || undefined}
                      projectId={projectId}
                      testCaseId={selectedTestCase.id}
                    />
                  </div>
                ) : null}
                {!isCreating && activeTestCaseDetailTab === "defects" && selectedTestCase ? (
                  <div className="detail-section-panel" role="tabpanel">
                    <LinkedDefectsPanel
                      canUpdate={canUpdateTestCases}
                      itemId={selectedTestCase.id}
                      projectId={projectId}
                      subject="test-case"
                    />
                  </div>
                ) : null}
                {!isCreating && activeTestCaseDetailTab === "evidence" && selectedTestCase ? (
                  <div className="detail-section-panel" role="tabpanel">
                    <JiraAttachmentPanel
                      canDelete={canDeleteAttachments}
                      canUpload={canCreateAttachments}
                      canView={canViewAttachments}
                      issueKey={selectedTestCase.display_id || selectedTestCase.id}
                    />
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="empty-state compact">Select a test case from the library, or start a new one for this app type.</div>
            )}
          </Panel>
        )}
        isDetailOpen={Boolean(selectedTestCaseId) || isCreating}
      />

      {isStepGroupModalOpen ? (
        <StepGroupModal
          isSaving={groupSteps.isPending || createSharedStepGroup.isPending}
          name={stepGroupName}
          onClose={() => {
            setIsStepGroupModalOpen(false);
            setStepGroupName("");
            setSaveAsReusableGroup(false);
          }}
          onNameChange={setStepGroupName}
          onSave={() => void handleConfirmStepGroup()}
          reusable={saveAsReusableGroup}
          selectedCount={selectedEditorSteps.length}
          setReusable={setSaveAsReusableGroup}
        />
      ) : null}

      {isSharedGroupPickerOpen ? (
        <SharedGroupPickerModal
          groups={filteredSharedGroups}
          isLoading={sharedStepGroupsQuery.isLoading}
          onClose={() => {
            setIsSharedGroupPickerOpen(false);
            setSelectedSharedGroupId("");
            setSharedGroupSearchTerm("");
          }}
          onConfirm={() => void handleInsertSharedGroup()}
          onSearchChange={setSharedGroupSearchTerm}
          searchValue={sharedGroupSearchTerm}
          selectedGroup={selectedSharedGroup}
          selectedGroupId={selectedSharedGroupId}
          setSelectedGroupId={setSelectedSharedGroupId}
        />
      ) : null}

      {isSuiteLinkModalOpen && selectedTestCase ? (
        <TestCaseSuiteLinkModal
          isSaving={updateTestCase.isPending}
          linkedSuiteIds={suiteLinkDraftIds}
          onChange={setSuiteLinkDraftIds}
          onClose={() => {
            setIsSuiteLinkModalOpen(false);
            setSuiteLinkDraftIds([]);
          }}
          onSave={() => void handleSaveSuiteLinks()}
          saveDisabled={!hasSuiteLinkDraftChanges}
          suites={suites}
          testCaseTitle={selectedTestCase.title}
        />
      ) : null}

      {isCaseParameterDialogOpen ? (
        <StepParameterDialog
          getInputState={(parameter) => resolveScopedParameterInputState(parameter.scope)}
          onChange={handleScopedParameterValueChange}
          onClose={() => setIsCaseParameterDialogOpen(false)}
          parameters={detectedStepParameters}
          subtitle="Edit detected @tokens for this case and its selected suite context."
          title="Test data"
          values={mergedScopedParameterValues}
        />
      ) : null}

      {inspectingStep ? (
        <div className="modal-backdrop modal-backdrop--scroll" onClick={() => !recorderSession && setInspectingStepId("")} role="presentation">
          <div
            aria-label={`Inspect step ${inspectingStep.step_order}`}
            aria-modal="true"
            className="modal-card resource-modal-card step-inspect-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="resource-modal-header">
              <div className="resource-modal-title">
                <p>Inspect step {inspectingStep.step_order}</p>
                <p>{richTextToPlainText(inspectingStep.action || inspectingStep.expected_result) || "Record an action for this step."}</p>
              </div>
              <button className="ghost-button" disabled={Boolean(recorderSession)} onClick={() => setInspectingStepId("")} type="button">
                Close
              </button>
            </div>
            <div className="detail-stack step-inspect-body">
              <div className="detail-summary">
                <strong>Step-level capture</strong>
                <InfoTooltip
                  content="Start an inspector session and perform only this step action. Local inspection reuses the open QAira browser on port 4311 when available; captured automation and repository evidence remain mapped to this step."
                  label="Step-level capture information"
                />
              </div>
	              <RecorderStartControls
	                disabled={!canUseRecorder || !selectedTestCase || !testEngineIntegration}
                hasSession={Boolean(recorderSession)}
                isStarting={startRecorder.isPending}
                mobileRemoteEnabled={mobileRemoteRecorderEnabled}
                onStart={(options) => void handleStartRecorder(options, inspectingStep.id)}
                localLabel="Inspect locally"
                remoteLabel="Inspect remotely"
                primaryAction={(
                  <button
                    className="primary-button recorder-stop-button"
                    disabled={!recorderSession || finishRecorder.isPending}
                    onClick={() => void handleFinishRecorder()}
                    type="button"
                  >
                    <PauseIcon />
                    <span>{finishRecorder.isPending ? "Saving..." : "Stop and map action"}</span>
                  </button>
                )}
              />
              {recorderLiveUrl ? (
                <div className="step-inspect-browser-shell">
                  <div className="step-inspect-browser-toolbar">
                    <strong>Live browser view</strong>
                    <InfoTooltip
                      content="Scroll vertically or horizontally to review the captured browser viewport."
                      label="Live browser view information"
                    />
                  </div>
                  <div className="step-inspect-browser-viewport">
                    <iframe
                      allow="clipboard-read; clipboard-write"
                      className="recorder-live-frame step-inspect-live-frame"
                      src={recorderLiveUrl}
                      title={`QAira inspector for step ${inspectingStep.step_order}`}
                    />
                  </div>
                </div>
              ) : null}
              <RecorderSessionInsights session={recorderSession} />
            </div>
          </div>
        </div>
      ) : null}

      {editingAutomationStep ? (
        <StepAutomationDialog
          availableParameters={detectedStepParameters}
          getParameterScopeState={resolveScopedParameterInputState}
          objectRepository={automationLearningCache}
          onClose={() => setEditingAutomationStepId("")}
          onSaveResponseValue={handleScopedParameterValueChange}
          onSave={(input) => void handleSaveStepAutomation(editingAutomationStep.id, input)}
          parameterValues={mergedScopedParameterValues}
          step={{
            id: editingAutomationStep.id,
            step_order: editingAutomationStep.step_order,
            action: stepDrafts[editingAutomationStep.id]?.action ?? editingAutomationStep.action,
            expected_result: stepDrafts[editingAutomationStep.id]?.expected_result ?? editingAutomationStep.expected_result,
            step_type: stepDrafts[editingAutomationStep.id]?.step_type ?? editingAutomationStep.step_type,
            automation_code: stepDrafts[editingAutomationStep.id]?.automation_code ?? editingAutomationStep.automation_code,
            api_request: stepDrafts[editingAutomationStep.id]?.api_request ?? editingAutomationStep.api_request
          }}
          subtitle="Use @t for case data, @s for suite-shared data, and @r for run-level data previews."
          title={`Step ${editingAutomationStep.step_order} automation`}
        />
      ) : null}

      {codePreviewState ? (
        <CodePreviewDialog
          code={codePreviewState.code}
          objectRepository={codePreviewState.objectRepository}
          onClose={() => setCodePreviewState(null)}
          subtitle={codePreviewState.subtitle}
          title={codePreviewState.title}
        />
      ) : null}

      {isSuiteTransferModalOpen ? (
        <TestCaseSuiteTransferModal
          action={suiteTransferAction}
          appTypes={allAppTypes}
          caseCount={suiteTransferCaseIds.length}
          currentAppTypeId={appTypeId}
          isSaving={createTestCase.isPending || updateTestCase.isPending}
          onActionChange={setSuiteTransferAction}
          onAppTypeChange={setSuiteTransferAppTypeId}
          onClose={closeSuiteTransferModal}
          onProjectChange={setSuiteTransferProjectId}
          onSubmit={() => void handleApplySuiteTransfer()}
          onSuiteIdsChange={setSuiteTransferSuiteIds}
          projects={projects}
          selectedSuiteIds={suiteTransferSuiteIds}
          targetAppTypeId={suiteTransferAppTypeId}
          targetProjectId={suiteTransferProjectId}
        />
      ) : null}

      {isCreateSuiteModalOpen ? (
        <TestCaseSuiteModal
          appTypeCases={testCases}
          availableLabels={existingSuiteLabels}
          isSaving={createSuite.isPending || assignSuiteCases.isPending}
          modules={testCaseModules}
          onClose={() => setIsCreateSuiteModalOpen(false)}
          onSubmit={handleCreateSuite}
          selectedCaseIds={selectedActionTestCaseIds}
        />
      ) : null}

      {isCreateModuleModalOpen ? (
        <div className="modal-backdrop" onClick={() => setIsCreateModuleModalOpen(false)} role="presentation">
          <form
            aria-label="Create module"
            aria-modal="true"
            className="modal-card resource-modal-card review-suggestion-modal"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => void handleCreateModule(event)}
            role="dialog"
          >
            <div className="resource-modal-header">
              <div className="resource-modal-title">
                <p><FolderIcon size={16} /> Functional Module</p>
                <h3>Create module</h3>
              </div>
              <button className="ghost-button" onClick={() => setIsCreateModuleModalOpen(false)} type="button">Close</button>
            </div>
            <div className="form-grid">
              <FormField label="Name" required>
                <input required value={moduleDraftName} onChange={(event) => setModuleDraftName(event.target.value)} />
              </FormField>
              <FormField label="Description">
                <RichTextEditor value={moduleDraftDescription} onChange={setModuleDraftDescription} />
              </FormField>
              <div className="detail-summary">
                <strong>{selectedActionTestCaseIds.length} selected case{selectedActionTestCaseIds.length === 1 ? "" : "s"}</strong>
                <span>Selected test cases will be grouped under this module after creation.</span>
              </div>
            </div>
            <div className="modal-actions">
              <button className="ghost-button" onClick={() => setIsCreateModuleModalOpen(false)} type="button">Cancel</button>
              <button className="primary-button" disabled={createTestCaseModule.isPending || !moduleDraftName.trim()} type="submit">
                {createTestCaseModule.isPending ? "Creating..." : "Create module"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {reviewSuggestionCaseId ? (
        <div
          className="modal-backdrop"
          onClick={() => {
            setReviewSuggestionCaseId("");
            setReviewSuggestionComment("");
            setReviewSuggestionConfirmed(true);
          }}
          role="presentation"
        >
          <div
            aria-label="Suggest test case review changes"
            aria-modal="true"
            className="modal-card resource-modal-card"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="resource-modal-header">
              <div className="resource-modal-title">
                <p>Review feedback</p>
                <h3>Suggest changes</h3>
              </div>
              <button
                className="ghost-button"
                onClick={() => {
                  setReviewSuggestionCaseId("");
                  setReviewSuggestionComment("");
                  setReviewSuggestionConfirmed(true);
                }}
                type="button"
              >
                Close
              </button>
            </div>
            <div className="form-grid review-suggestion-body">
              <p className="review-suggestion-intro">
                Share clear, actionable notes for the author. These comments are saved into the test case review history.
              </p>
              <label className="checkbox-field review-suggestion-confirm">
                <input
                  checked={reviewSuggestionConfirmed}
                  onChange={(event) => setReviewSuggestionConfirmed(event.target.checked)}
                  type="checkbox"
                />
                <span>Suggest changes for this test case</span>
              </label>
              <FormField label="Comments">
                <textarea
                  placeholder="Add the changes needed before approval."
                  rows={5}
                  value={reviewSuggestionComment}
                  onChange={(event) => setReviewSuggestionComment(event.target.value)}
                />
              </FormField>
            </div>
            <div className="modal-actions">
              <button
                className="ghost-button"
                onClick={() => {
                  setReviewSuggestionCaseId("");
                  setReviewSuggestionComment("");
                  setReviewSuggestionConfirmed(true);
                }}
                type="button"
              >
                Cancel
              </button>
              <button
                className="primary-button"
                disabled={!reviewSuggestionConfirmed || reviewTestCase.isPending}
                onClick={() => void handleSubmitReviewSuggestion()}
                type="button"
              >
                {reviewTestCase.isPending ? "Saving..." : "Send feedback"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isQualitySuggestionModalOpen ? (
        <div className="modal-backdrop" onClick={() => setIsQualitySuggestionModalOpen(false)} role="presentation">
          <div
            aria-label="Test Quality Score suggestions"
            aria-modal="true"
            className="modal-card resource-modal-card"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="resource-modal-header">
              <div className="resource-modal-title">
                <p>Test Quality Score</p>
                <h3>{computedCaseAiQualityScore}% quality</h3>
              </div>
              <button className="ghost-button" onClick={() => setIsQualitySuggestionModalOpen(false)} type="button">Close</button>
            </div>
            <div className="stack-list">
              {caseQualitySuggestions.map((suggestion) => (
                <div className="stack-item" key={suggestion}>
                  <div>
                    <strong>{suggestion}</strong>
                  </div>
                </div>
              ))}
              {!caseQualitySuggestions.length ? <div className="empty-state compact">No quality suggestions right now.</div> : null}
            </div>
            <div className="modal-actions">
              <button className="primary-button" onClick={() => setIsQualitySuggestionModalOpen(false)} type="button">Done</button>
            </div>
          </div>
        </div>
      ) : null}

      {isCreateExecutionModalOpen ? (
        <TestCaseExecutionModal
          appTypeId={appTypeId}
          assigneeOptions={assigneeOptions}
	          canCreateExecution={Boolean(
	            projectId
	            && appTypeId
	            && selectedActionCases.length
	            && session?.user.id
	            && (executionStartMode === "local"
	              ? canRunLocalAutomation
	              : executionStartMode === "remote"
	                ? canRunRemoteAutomation
	                : canCreateRuns)
	          )}
          executionName={executionName}
          isSubmitting={createExecution.isPending}
          executionParallelCount={executionParallelCount}
          executionParallelEnabled={executionParallelEnabled}
          executionRelease={executionRelease}
          executionStartMode={executionStartMode}
          executionSprint={executionSprint}
          executionBuild={executionBuild}
          onAssigneeChange={setSelectedExecutionAssigneeIds}
          onClose={closeCreateExecutionModal}
          onConfigurationChange={setSelectedExecutionConfigurationId}
          onDataSetChange={setSelectedExecutionDataSetId}
          onEnvironmentChange={setSelectedExecutionEnvironmentId}
          onExecutionBuildChange={setExecutionBuild}
          onExecutionNameChange={setExecutionName}
          onExecutionParallelCountChange={setExecutionParallelCount}
          onExecutionParallelEnabledChange={setExecutionParallelEnabled}
          onExecutionReleaseChange={setExecutionRelease}
          onExecutionSprintChange={setExecutionSprint}
          onExecutionStartModeChange={setExecutionStartMode}
          onRemoveTestCase={(testCaseId) =>
            setSelectedActionTestCaseIds((current) => current.filter((id) => id !== testCaseId))
          }
          onSubmit={handleCreateExecution}
          projectId={projectId}
          selectedAssigneeIds={selectedExecutionAssigneeIds}
          selectedConfigurationId={selectedExecutionConfigurationId}
          selectedAppType={selectedAppType?.name || ""}
          selectedDataSetId={selectedExecutionDataSetId}
          selectedEnvironmentId={selectedExecutionEnvironmentId}
          selectedProject={selectedProject?.name || ""}
          testCases={selectedActionCases}
        />
      ) : null}

      {isImportModalOpen ? (
        <div
          className="modal-backdrop"
          onClick={() => {
            if (importTestCases.isPending) {
              return;
            }

            setImportBatches([]);
            setImportFileWarnings([]);
            setImportSourceSelection("auto");
            setIsImportModalOpen(false);
          }}
        >
          <div
            aria-labelledby="bulk-import-title"
            aria-modal="true"
            className="modal-card import-modal-card"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="import-modal-header">
              <div className="import-modal-title">
                <div className="modal-title-info-row">
                  <h2 className="dialog-title" id="bulk-import-title">Import test cases from external sources</h2>
                  <InfoTooltip
                    content={(
                      <>
                        Queue CSV, JUnit XML, TestNG XML, or Postman collection files together. CSV imports support an <strong>external_references</strong> column for ticket links, while Postman requests import as API test cases even when the collection has no test scripts. Large imports are sent in smaller batches automatically.
                      </>
                    )}
                    label="Test case import information"
                  />
                </div>
              </div>
              <DialogCloseButton disabled={importTestCases.isPending} label="Close bulk import" onClick={() => {
                setImportBatches([]);
                setImportFileWarnings([]);
                setImportSourceSelection("auto");
                setIsImportModalOpen(false);
              }} />
            </div>

            <div className="import-modal-body">
              <div className="record-grid">
                <FormField label="Source type">
                  <select value={importSourceSelection} onChange={(event) => setImportSourceSelection(event.target.value as TestCaseImportSourceSelection)}>
                    {TEST_CASE_IMPORT_SOURCE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </FormField>

                <FormField label="Import file">
                  <input accept=".csv,.xml,.json,text/csv,text/xml,application/xml,application/json" multiple onChange={(event) => void handleImportFile(event)} type="file" />
                </FormField>

                <FormField label="Default requirement">
                  <select value={importRequirementId} onChange={(event) => setImportRequirementId(event.target.value)}>
                    <option value="">No requirement</option>
                    {requirements.map((requirement) => (
                      <option key={requirement.id} value={requirement.id}>{requirement.title}</option>
                    ))}
                  </select>
                </FormField>
              </div>

              <div className="metric-strip compact">
                <div className="mini-card">
                  <strong>{importRows.length}</strong>
                  <span>Cases ready</span>
                </div>
                <div className="mini-card">
                  <strong>{importStepCount}</strong>
                  <span>Steps detected</span>
                </div>
                <div className="mini-card">
                  <strong>{importFileCount}</strong>
                  <span>Files queued</span>
                </div>
              </div>

              <div className="detail-summary">
                <strong>{importFileName || "No import file loaded yet"}</strong>
                <span>
                  {importSourceSummary
                    ? `${importSourceSummary} batch prepared. Missing suites are created automatically during import when a source references them.`
                    : "Use auto-detect or choose a source type before adding files to the batch queue."}
                </span>
              </div>

              {importBatches.length ? (
                <div className="table-wrap import-preview-table">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>File</th>
                        <th>Source</th>
                        <th>Cases</th>
                        <th>Warnings</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importBatches.map((batch) => (
                        <tr key={batch.id}>
                          <td>{batch.fileName}</td>
                          <td>{getTestCaseImportSourceLabel(batch.source)}</td>
                          <td>{batch.rows.length}</td>
                          <td>{batch.warnings.length}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {importWarnings.length ? (
                <div className="empty-state compact">
                  {importWarnings.slice(0, 4).map((warning) => (
                    <div key={warning}>{warning}</div>
                  ))}
                </div>
              ) : null}

              {importRows.length ? (
                <div className="table-wrap import-preview-table">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>References</th>
                        <th>Step count</th>
                        <th>Groups</th>
                        <th>Suites</th>
                        <th>Preview</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importRows.slice(0, 5).map((row, index) => (
                        <tr key={`${row.title}-${index}`}>
                          <td>{row.title}</td>
                          <td>{formatReferenceList(row.external_references) || "—"}</td>
                          <td>{countImportedSteps(row)}</td>
                          <td>{countImportedGroups(row)}</td>
                          <td>{countImportedSuites(row)}</td>
                          <td>{getImportedStepPreviewLabel(row)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>

            <div className="action-row import-modal-actions">
              <button
                className="ghost-button"
                disabled={(!importBatches.length && !importWarnings.length) || importTestCases.isPending}
                onClick={() => {
                  setImportBatches([]);
                  setImportFileWarnings([]);
                  setImportSourceSelection("auto");
                }}
                type="button"
              >
                Clear
              </button>
	              <button className="primary-button" disabled={!canImportTestCases || !appTypeId || !importRows.length || importTestCases.isPending} onClick={() => void handleBulkImport()} type="button">
                {importTestCases.isPending ? "Queuing…" : `Queue ${importRows.length || ""} Test Cases`}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isAiCaseAuthoringOpen ? (
        <AiCaseAuthoringModal
          additionalContext={aiCaseAuthoringAdditionalContext}
          externalLinksText={aiCaseAuthoringExternalLinksText}
          applyLabel={isCreating ? "Apply To Draft" : "Replace Saved Case"}
          closeDisabled={previewCaseAuthoring.isPending || updateTestCase.isPending}
	          disableApply={!canUseTestCaseAi || (!isCreating && !canUpdateTestCases) || !aiCaseAuthoringPreview || updateTestCase.isPending}
	          disableGenerate={!canUseTestCaseAi || !appTypeId || !aiCaseAuthoringRequirementId || previewCaseAuthoring.isPending || !integrations.length}
          hasAutomationWarning={aiCaseAuthoringAutomationStepCount > 0}
          integrationId={integrationId}
          integrations={integrations}
          isApplying={updateTestCase.isPending}
          isCreating={isCreating}
          isPreviewing={previewCaseAuthoring.isPending}
          onAddImages={(files) => void handleAddAiCaseAuthoringReferenceImages(files)}
          onAdditionalContextChange={setAiCaseAuthoringAdditionalContext}
          onApply={() => void handleApplyAiCaseAuthoring()}
          onClose={() => {
            setIsAiCaseAuthoringOpen(false);
            setAiCaseAuthoringPreview(null);
            setAiCaseAuthoringMessage("");
          }}
          onGenerate={() => void handlePreviewAiCaseAuthoring()}
          onIntegrationIdChange={setIntegrationId}
          onExternalLinksTextChange={setAiCaseAuthoringExternalLinksText}
          onPreviewMessageDismiss={() => setAiCaseAuthoringMessage("")}
          onRequirementChange={setAiCaseAuthoringRequirementId}
          onRemoveImage={(imageUrl) => setAiCaseAuthoringReferenceImages((current) => current.filter((image) => image.url !== imageUrl))}
          preview={aiCaseAuthoringPreview}
          previewMessage={aiCaseAuthoringMessage}
          previewTone={aiCaseAuthoringTone}
          promptTemplateAppTypeId={appTypeId}
          promptTemplateProjectId={projectId}
          requirementId={aiCaseAuthoringRequirementId}
          referenceImages={aiCaseAuthoringReferenceImages}
          requirements={requirements}
          sourceDraft={aiCaseAuthoringSourceDraft}
        />
      ) : null}

      {isAiStudioOpen ? (
        <AiDesignStudioModal
          acceptLabel="Accept Into Test Case Library"
          additionalContext={aiAdditionalContext}
          allowMultipleRequirements={true}
          appTypeName={appTypes.find((item) => item.id === appTypeId)?.name || "No app type selected"}
          closeDisabled={previewDesignedCases.isPending || acceptDesignedCases.isPending || createGenerationJob.isPending}
	          disableAccept={!canCreateTestCases || !aiPreviewCases.length || acceptDesignedCases.isPending}
	          disablePreview={!canUseTestCaseAi || !aiRequirementIds.length || !appTypeId || previewDesignedCases.isPending || !integrations.length}
	          disableSchedule={!canUseTestCaseAi || !canCreateTestCases || !aiRequirementIds.length || !appTypeId || createGenerationJob.isPending || !integrations.length}
          existingCases={aiExistingCases}
          existingCasesSubtitle="These reusable cases are already linked to one or more of the selected requirements in the current app type."
          existingCasesTitle="Linked test cases"
          externalLinksText={aiExternalLinksText}
          eyebrow="AI Generation"
          integrationId={integrationId}
          integrations={integrations}
          isAccepting={acceptDesignedCases.isPending}
          isPreviewing={previewDesignedCases.isPending}
          isScheduling={createGenerationJob.isPending}
          maxCases={maxCases}
          onAccept={(selectedClientIds) => void handleAcceptDesignedCases(selectedClientIds)}
          onAddImages={(files) => void handleAddAiReferenceImages(files)}
          onAdditionalContextChange={setAiAdditionalContext}
          onClose={() => {
            setIsAiStudioOpen(false);
            setAiPreviewCases([]);
            setAiPreviewMessage("");
          }}
          onExternalLinksTextChange={setAiExternalLinksText}
          onIntegrationIdChange={setIntegrationId}
          onViewExistingCase={openExistingCaseFromAi}
          onPreview={() => void handlePreviewDesignedCases()}
          onSchedule={() => void handleScheduleDesignedCases()}
          onRemoveImage={(imageUrl) => setAiReferenceImages((current) => current.filter((image) => image.url !== imageUrl))}
          onRemovePreviewCase={(clientId) => setAiPreviewCases((current) => current.filter((candidate) => candidate.client_id !== clientId))}
          onRequirementSelectionChange={setAiRequirementIds}
          onTogglePreviewRequirement={(clientId, requirementId) => {
            const requirement = requirements.find((item) => item.id === requirementId);

            if (!requirement) {
              return;
            }

            setAiPreviewCases((current) => toggleRequirementOnPreviewCase(current, clientId, requirementId, requirement.title));
          }}
          onMaxCasesChange={setMaxCases}
          previewCases={aiPreviewCases}
          previewMessage={aiPreviewMessage}
          promptTemplateAppTypeId={appTypeId}
          promptTemplateProjectId={projectId}
          onPreviewMessageDismiss={() => setAiPreviewMessage("")}
          previewTone={aiPreviewTone}
          referenceImages={aiReferenceImages}
          requirementHelpText="Select one or more requirements, provide extra context, then review the generated drafts before approving them into the reusable library."
          requirementLabel="Requirements"
          requirements={requirements}
          scheduleHelperText="Schedule batch AI generation for selected requirements. The worker processes one requirement at a time with a cooldown between requirements to reduce LLM rate-limit pressure, then returns generated cases as drafts with green accept and red reject actions."
          selectedRequirementIds={aiSelectedRequirements.map((requirement) => requirement.id)}
        />
      ) : null}

      <AiInsightPreviewDialog
        assuranceTitle="Test case impact grounding"
        emptyMessage="No linked downstream artifact was found for this test case. Review its intended traceability before applying a change."
        error={previewTestCaseImpact.error instanceof Error ? previewTestCaseImpact.error.message : null}
        eyebrow="Test case details"
        findings={testCaseImpactFindings}
        gaps={previewTestCaseImpact.data?.impact.requirements.length ? [] : ["No live requirement link was found for this test case."]}
        loading={previewTestCaseImpact.isPending}
        onClose={() => setIsTestCaseImpactPreviewOpen(false)}
        open={isTestCaseImpactPreviewOpen}
        recommendedActions={previewTestCaseImpact.data?.recommended_actions || []}
        response={previewTestCaseImpact.data}
        signals={previewTestCaseImpact.data ? [
          { label: "Impact level", value: previewTestCaseImpact.data.impact.risk_level, tone: previewTestCaseImpact.data.impact.risk_level === "high" ? "warning" : "neutral" },
          { label: "Affected runs", value: String(previewTestCaseImpact.data.impact.totals.test_runs), tone: previewTestCaseImpact.data.impact.totals.test_runs ? "warning" : "neutral" },
          { label: "Object links", value: String(previewTestCaseImpact.data.impact.totals.object_repository_items), tone: previewTestCaseImpact.data.impact.totals.object_repository_items ? "positive" : "neutral" }
        ] : []}
        subtitle={previewTestCaseImpact.data ? `${previewTestCaseImpact.data.test_case.display_id} · ${previewTestCaseImpact.data.test_case.title}` : selectedTestCase?.title || "Selected test case"}
        summary={previewTestCaseImpact.data?.explanation}
        title="Preview test case change impact"
      />

      {linkedPreviewCase ? (
        <LinkedTestCaseModal
          appTypeName={appTypes.find((item) => item.id === appTypeId)?.name || ""}
          projectName={selectedProject?.name || ""}
          requirements={requirements}
          suites={suites}
          testCase={linkedPreviewCase}
          onClose={() => setLinkedPreviewCaseId("")}
        />
      ) : null}
    </div>
  );
}

function AutomationScriptLens({
  lens,
  steps,
  code,
  onEditStep
}: {
  lens: Exclude<TestCaseAuthoringLens, "manual">;
  steps: AuthoringStepProjection[];
  code: string;
  onEditStep: (stepId: string) => void;
}) {
  const title = lens === "api-script" ? "API script" : "UI automation script";
  const emptyCopy = lens === "api-script"
    ? "No API steps are present yet. Change a step type to API or import a Postman collection to author request-level coverage."
    : "No UI or mobile steps are present yet. Add web, Android, or iOS steps to create executable UI coverage.";

  return (
    <div className="automation-script-lens">
      <div className="automation-script-map" aria-label={`${title} step map`}>
        {steps.length ? (
          steps.map((step) => {
            const stepType = normalizeStepType(step.step_type);
            const hasSavedAutomation = stepHasAutomation(step);
            const request = normalizeApiRequest(step.api_request);
            const subtitle = stepType === "api" && request
              ? `${request.method || "GET"} ${request.url || "No URL"}`
              : richTextToPlainText(step.expected_result || "") || "No expected result written yet";

            return (
              <article className="automation-script-step" key={step.id}>
                <div className="automation-script-step-copy">
                  <div className="automation-script-step-head">
                    <span className={hasSavedAutomation ? "automation-script-step-status is-ready" : "automation-script-step-status"}>
                      {hasSavedAutomation ? "Ready" : "Generated"}
                    </span>
                    <strong>Step {step.step_order}</strong>
                    <span>{stepType.toUpperCase()}</span>
                  </div>
                  <RichTextContent as="p" fallback="No manual action written yet" value={step.action} />
                  <small>{subtitle}</small>
                </div>
                <button className="ghost-button compact" onClick={() => onEditStep(step.id)} type="button">
                  <AutomationCodeIcon />
                  <span>Edit</span>
                </button>
              </article>
            );
          })
        ) : (
          <div className="empty-state compact">{emptyCopy}</div>
        )}
      </div>

      <div className="automation-script-code-panel">
        <div className="automation-script-code-head">
          <strong>{title}</strong>
          <span>{steps.length} mapped step{steps.length === 1 ? "" : "s"}</span>
        </div>
        <pre className="automation-script-code"><code>{code}</code></pre>
      </div>
    </div>
  );
}

function AutomationLearningMemory({ entries }: { entries: AutomationLearningCacheEntry[] }) {
  const readMetaText = (entry: AutomationLearningCacheEntry, key: string) => {
    const value = entry.metadata?.[key];
    return typeof value === "string" ? value.trim() : "";
  };
  const isNonElementEntry = (entry: AutomationLearningCacheEntry) => {
    const locator = String(entry.locator || "").trim().toLowerCase();
    const intent = String(entry.locator_intent || "").trim().toLowerCase();
    const role = readMetaText(entry, "object_role").toLowerCase();
    const blockedLocators = new Set(["viewport", "location", "browser.tab", "keyboard", "window", "document", "page"]);
    const blockedIntents = new Set(["scroll", "navigation", "navigate", "goto", "tab", "press"]);

    return blockedLocators.has(locator) || blockedIntents.has(intent) || role === "viewport" || role === "page";
  };
  const toTitleText = (value: string) => {
    const normalized = value
      .replace(/^[#.]+/, "")
      .replace(/\[[^\]]+\]/g, " ")
      .replace(/[_./:-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!normalized) {
      return "";
    }

    return normalized
      .split(" ")
      .filter(Boolean)
      .slice(0, 6)
      .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
      .join(" ");
  };
  const toPascalCase = (value: string) => {
    const normalized = value.replace(/https?:\/\//i, "").replace(/[^A-Za-z0-9]+/g, " ").trim();
    const tokens = normalized ? normalized.split(/\s+/) : ["Page"];
    const name = tokens.map((token) => token.charAt(0).toUpperCase() + token.slice(1)).join("");
    return name.toLowerCase().endsWith("page") ? name : `${name}Page`;
  };
  const getObjectLabel = (entry: AutomationLearningCacheEntry) => {
    const metadataLabel =
      readMetaText(entry, "object_label") ||
      readMetaText(entry, "field_name") ||
      readMetaText(entry, "name");
    const objectName = readMetaText(entry, "object_name");
    const objectNameTail = objectName.includes(".") ? objectName.split(".").filter(Boolean).pop() || "" : objectName;
    const intent = String(entry.locator_intent || "").trim();
    const genericIntent = ["click", "fill", "change", "select", "check", "uncheck", "submit", "object"].includes(intent.toLowerCase()) ? "" : intent;
    const locatorAttr =
      String(entry.locator || "").match(/\[(?:aria-label|name|id|data-testid|placeholder)=["']?([^"'\]]+)["']?\]/i)?.[1] ||
      String(entry.locator || "").match(/^#([\w-]+)/)?.[1] ||
      String(entry.locator || "").match(/text=["']?([^"']+)["']?/i)?.[1] ||
      "";

    return toTitleText(metadataLabel || objectNameTail || genericIntent || locatorAttr || "HTML element");
  };
  const getHtmlTag = (entry: AutomationLearningCacheEntry) => {
    const metadataTag =
      readMetaText(entry, "html_tag") ||
      readMetaText(entry, "tag_name") ||
      readMetaText(entry, "tag") ||
      readMetaText(entry, "element_tag");
    const domStructure = readMetaText(entry, "dom_structure") || readMetaText(entry, "dom_path") || readMetaText(entry, "html");
    const domTag = domStructure.match(/<\s*([a-z][a-z0-9-]*)/i)?.[1] || "";
    const locatorTag = String(entry.locator || "").match(/^([a-z][a-z0-9-]*)[#.[\s]/i)?.[1] || "";
    const role = (readMetaText(entry, "object_role") || entry.locator_kind || entry.locator_intent || "").toLowerCase();

    if (metadataTag) {
      return metadataTag.toLowerCase();
    }

    if (domTag) {
      return domTag.toLowerCase();
    }

    if (locatorTag) {
      return locatorTag.toLowerCase();
    }

    if (role.includes("textbox") || role.includes("field") || role.includes("fill") || role.includes("input")) {
      return "input";
    }

    if (role.includes("dropdown") || role.includes("select") || role.includes("combobox")) {
      return "select";
    }

    if (role.includes("link")) {
      return "a";
    }

    if (role.includes("button") || role.includes("click") || role.includes("submit")) {
      return "button";
    }

    return "element";
  };
  const getTagDetail = (entry: AutomationLearningCacheEntry) => {
    const tag = getHtmlTag(entry);
    const locator = String(entry.locator || "").trim();
    const locatorId = locator.match(/^#([\w-]+)/)?.[1] || locator.match(/\bid=["']?([^"'\]\s>]+)/i)?.[1] || "";
    const locatorName = locator.match(/\bname=["']?([^"'\]\s>]+)/i)?.[1] || "";
    const role = readMetaText(entry, "object_role");
    const qualifier = locatorId ? `#${locatorId}` : locatorName ? `[name="${locatorName}"]` : role ? `[role="${role}"]` : "";

    return `${tag}${qualifier}`;
  };
  const elementEntries = entries
    .filter((entry) => !isNonElementEntry(entry))
    .sort((left, right) => Number(right.confidence || 0) - Number(left.confidence || 0) || Number(right.hit_count || 0) - Number(left.hit_count || 0));
  const pageObjects = Array.from(elementEntries.reduce<Map<string, AutomationLearningCacheEntry[]>>((map, entry) => {
    const screen = readMetaText(entry, "screen_name") || entry.page_key || "UnassignedPage";
    map.set(screen, [...(map.get(screen) || []), entry]);
    return map;
  }, new Map()).entries()).slice(0, 4);
  const strongEntries = elementEntries.filter((entry) => Number(entry.confidence) >= 0.8).length;

  return (
    <details className="automation-learning-memory">
      <summary className="automation-learning-memory-head">
        <div>
          <strong>Object repository</strong>
          <span>
            {elementEntries.length
              ? `${elementEntries.length} HTML element${elementEntries.length === 1 ? "" : "s"} · ${strongEntries} high confidence`
              : "No reusable screen objects learned for this scope yet"}
          </span>
        </div>
        <AutomationCodeIcon />
      </summary>

      {pageObjects.length ? (
        <div className="automation-learning-pom-list">
          {pageObjects.map(([screen, pageEntries]) => (
            <article className="automation-learning-pom-card" key={screen}>
              <div className="automation-learning-card-head">
                <strong>class {toPascalCase(screen)}</strong>
                <span>{pageEntries.length} member{pageEntries.length === 1 ? "" : "s"}</span>
              </div>
              <span className="automation-learning-page">{pageEntries[0]?.page_url || screen}</span>
              <div className="automation-learning-pom-members">
                {pageEntries.slice(0, 5).map((entry) => (
                  <div className="automation-learning-pom-member" key={entry.id}>
                    <code>{getObjectLabel(entry).replace(/\s+/g, "")}</code>
                    <span>{getTagDetail(entry)}</span>
                    <small>{entry.locator}</small>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state compact">No HTML elements are available yet. Run a click, fill, select, or check recording so QAira can learn friendly element names and tags.</div>
      )}
    </details>
  );
}

function TestCaseSuiteTransferModal({
  action,
  caseCount,
  projects,
  appTypes,
  currentAppTypeId,
  targetProjectId,
  targetAppTypeId,
  selectedSuiteIds,
  isSaving,
  onActionChange,
  onProjectChange,
  onAppTypeChange,
  onSuiteIdsChange,
  onClose,
  onSubmit
}: {
  action: SuiteTransferAction;
  caseCount: number;
  projects: Project[];
  appTypes: AppType[];
  currentAppTypeId: string;
  targetProjectId: string;
  targetAppTypeId: string;
  selectedSuiteIds: string[];
  isSaving: boolean;
  onActionChange: (action: SuiteTransferAction) => void;
  onProjectChange: (projectId: string) => void;
  onAppTypeChange: (appTypeId: string) => void;
  onSuiteIdsChange: (suiteIds: string[]) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const dialogRef = useDialogFocus<HTMLDivElement>({ closeDisabled: isSaving, onClose });
  const targetAppType = appTypes.find((item) => item.id === targetAppTypeId) || null;
  const targetSuitesQuery = useQuery({
    queryKey: ["test-case-suites", targetAppTypeId],
    queryFn: () => api.testSuites.list({ app_type_id: targetAppTypeId }),
    enabled: Boolean(targetAppTypeId)
  });
  const targetSuites = targetSuitesQuery.data || [];
  const selectedSuiteSet = useMemo(() => new Set(selectedSuiteIds), [selectedSuiteIds]);
  const scopedAppTypes = useMemo(
    () =>
      appTypes
        .filter((item) => String(item.project_id) === String(targetProjectId))
        .slice()
        .sort((left, right) => left.name.localeCompare(right.name)),
    [appTypes, targetProjectId]
  );
  const isCrossAppType = Boolean(targetAppTypeId && currentAppTypeId && targetAppTypeId !== currentAppTypeId);

  useEffect(() => {
    if (!targetProjectId && projects[0]?.id) {
      onProjectChange(projects[0].id);
    }
  }, [onProjectChange, projects, targetProjectId]);

  useEffect(() => {
    if (!targetAppTypeId && scopedAppTypes[0]?.id) {
      onAppTypeChange(scopedAppTypes[0].id);
      return;
    }

    if (targetAppTypeId && !scopedAppTypes.some((item) => item.id === targetAppTypeId)) {
      onAppTypeChange(scopedAppTypes[0]?.id || "");
    }
  }, [onAppTypeChange, scopedAppTypes, targetAppTypeId]);

  const toggleSuite = (suiteId: string) => {
    if (selectedSuiteSet.has(suiteId)) {
      onSuiteIdsChange(selectedSuiteIds.filter((id) => id !== suiteId));
      return;
    }

    onSuiteIdsChange([...selectedSuiteIds, suiteId]);
  };

  const actionCopy = {
    add: "Add keeps existing suite links and app scope. Use it when the same cases should run from several suites.",
    move: "Move replaces suite links. If you choose another app type or project, the case ownership moves with it.",
    copy: "Copy creates new cases with the same steps in the target suite scope."
  }[action];

  return (
    <div className="modal-backdrop" onClick={() => !isSaving && onClose()} role="presentation">
      <div
        aria-label="Move or copy test cases to suites"
        aria-modal="true"
        className="modal-card suite-create-modal suite-link-modal"
        onClick={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="suite-create-header">
          <div className="suite-create-title">
            <div className="modal-title-info-row">
              <h2 className="dialog-title">Suite transfer</h2>
              <InfoTooltip
                content={`Choose an existing suite target for ${caseCount} selected case${caseCount === 1 ? "" : "s"}. Multi-suite links are preserved when you add.`}
                label="Suite transfer information"
              />
            </div>
          </div>
          <DialogCloseButton disabled={isSaving} label="Close suite transfer" onClick={onClose} />
        </div>

        <form
          className="suite-modal-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <div className="suite-link-modal-body">
            <div className="suite-transfer-config-grid">
              <FormField label="Action" hint={isCrossAppType && action === "add" ? "Add is available only inside the current app type. Use Copy or Move for cross-project work." : actionCopy}>
                <div className="segmented-control">
                  {([
                    ["add", "Add links", <AddIcon key="add-icon" />],
                    ["move", "Move", <MoveIcon key="move-icon" />],
                    ["copy", "Copy", <CopyIcon key="copy-icon" />]
                  ] as Array<[SuiteTransferAction, string, ReactNode]>).map(([value, label, icon]) => (
                    <button
                      aria-pressed={action === value}
                      className={action === value ? "is-active" : ""}
                      disabled={isSaving}
                      key={value}
                      onClick={() => onActionChange(value)}
                      type="button"
                    >
                      {icon}
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </FormField>

              <div className="suite-transfer-scope-grid">
                <FormField label="Target project">
                  <select
                    disabled={isSaving}
                    value={targetProjectId}
                    onChange={(event) => {
                      onProjectChange(event.target.value);
                      onAppTypeChange("");
                      onSuiteIdsChange([]);
                    }}
                  >
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>{project.name}</option>
                    ))}
                  </select>
                </FormField>

                <FormField label="Target app type">
                  <select
                    disabled={isSaving || !scopedAppTypes.length}
                    value={targetAppTypeId}
                    onChange={(event) => {
                      onAppTypeChange(event.target.value);
                      onSuiteIdsChange([]);
                    }}
                  >
                    {scopedAppTypes.map((appType) => (
                      <option key={appType.id} value={appType.id}>{appType.name}</option>
                    ))}
                  </select>
                </FormField>
              </div>
            </div>

            <div className="suite-link-list-shell">
              <div className="suite-link-list-header">
                <strong>Target suites</strong>
                <span>{targetSuitesQuery.isLoading ? "Loading" : `${targetSuites.length} available`}</span>
              </div>

              {targetSuites.length ? (
                <div className="suite-link-list">
                  {targetSuites.map((suite, index) => {
                    const isSelected = selectedSuiteSet.has(suite.id);

                    return (
                      <div className={isSelected ? "suite-link-row is-linked" : "suite-link-row"} key={suite.id}>
                        <div className="suite-link-row-copy">
                          <strong>{suite.name}</strong>
                          {suite.display_id ? <span>{suite.display_id}</span> : null}
                        </div>
                        <div className="suite-link-row-actions">
                          {isSelected ? <span className="suite-link-row-status">Selected</span> : null}
                          <button
                            aria-label={`${isSelected ? "Remove" : "Select"} ${suite.name}`}
                            className={isSelected ? "ghost-button suite-link-toggle is-linked" : "ghost-button suite-link-toggle"}
                            data-autofocus={index === 0 ? "true" : undefined}
                            disabled={isSaving}
                            onClick={() => toggleSuite(suite.id)}
                            type="button"
                          >
                            {isSelected ? <SuiteUnlinkIcon /> : <AddIcon />}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-state compact">No suites exist for this app type yet. Create the suite first, then return here to link, move, or copy cases.</div>
              )}
            </div>

            <div className="detail-summary">
              <strong>{selectedSuiteIds.length} selected suite{selectedSuiteIds.length === 1 ? "" : "s"}</strong>
              <span>{targetAppType?.name || "Choose an app type"} will receive the selected case scope. Cross-project copies drop requirement links because requirements belong to one project.</span>
            </div>
          </div>

          <div className="action-row suite-modal-actions">
            <button className="ghost-button" disabled={isSaving} onClick={onClose} type="button">Cancel</button>
            <button className="primary-button" disabled={isSaving || !targetAppTypeId || !selectedSuiteIds.length || (isCrossAppType && action === "add")} type="submit">
              {isSaving ? "Saving…" : action === "copy" ? "Copy cases" : action === "add" ? "Add suite links" : "Move cases"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TestCaseSuiteModal({
  appTypeCases,
  availableLabels,
  modules,
  selectedCaseIds,
  onClose,
  onSubmit,
  isSaving
}: {
  appTypeCases: TestCase[];
  availableLabels: string[];
  modules: TestCaseModule[];
  selectedCaseIds: string[];
  onClose: () => void;
  onSubmit: (input: { name: string; labels: string[]; selectedIds: string[]; parallel_enabled: boolean; parallel_count: number }) => void;
  isSaving: boolean;
}) {
  const dialogRef = useDialogFocus<HTMLDivElement>({ closeDisabled: isSaving, onClose });
  const initialSelectedIds = useMemo(
    () => selectedCaseIds.filter((testCaseId) => appTypeCases.some((testCase) => testCase.id === testCaseId)),
    [appTypeCases, selectedCaseIds]
  );
  const moduleLabelByCaseId = useMemo(() => {
    const map: Record<string, string> = {};
    modules.forEach((module) => {
      (module.test_case_ids || []).forEach((testCaseId) => {
        map[testCaseId] = module.name;
      });
    });
    return map;
  }, [modules]);
  const [name, setName] = useState("");
  const [labelsText, setLabelsText] = useState("");
  const [parallelEnabled, setParallelEnabled] = useState(false);
  const [parallelCount, setParallelCount] = useState(1);
  const [localSelectedIds, setLocalSelectedIds] = useState<string[]>(() => initialSelectedIds);
  const initialSelectedIdsKey = initialSelectedIds.join("::");

  useEffect(() => {
    setLocalSelectedIds(initialSelectedIds);
  }, [initialSelectedIdsKey]);

  return (
    <div className="modal-backdrop" onClick={() => !isSaving && onClose()} role="presentation">
      <div
        aria-label="Create suite from test cases"
        aria-modal="true"
        className="modal-card suite-create-modal"
        onClick={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="suite-create-header">
          <div className="suite-create-title">
            <div className="modal-title-info-row">
              <h2 className="dialog-title">Create suite</h2>
              <InfoTooltip
                content="Choose reusable cases, keep their saved order with the arrow controls, and create the suite from this dialog."
                label="Create suite information"
              />
            </div>
          </div>
          <DialogCloseButton disabled={isSaving} label="Close create suite" onClick={onClose} />
        </div>

        <form
          className="form-grid suite-modal-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit({
              name,
              labels: parseReferenceList(labelsText),
              selectedIds: localSelectedIds,
              parallel_enabled: parallelEnabled,
              parallel_count: parallelEnabled ? parallelCount : 1
            });
          }}
        >
          <div className="suite-modal-body">
            <div className="record-grid suite-modal-config-grid">
              <FormField label="Suite name">
                <input autoFocus required value={name} onChange={(event) => setName(event.target.value)} />
              </FormField>
              <CaseLabelsField
                availableLabels={availableLabels}
                value={labelsText}
                onChange={setLabelsText}
              />
              <FormField label="Parallel execution">
                <div className="execution-parallel-control">
                  <label>
                    <input
                      checked={parallelEnabled}
                      onChange={(event) => setParallelEnabled(event.target.checked)}
                      type="checkbox"
                    />
                    <span>Run cases in parallel</span>
                  </label>
                  <input
                    aria-label="Suite parallel test count"
                    disabled={!parallelEnabled}
                    min={1}
                    max={50}
                    onChange={(event) => setParallelCount(Math.max(1, Number(event.target.value) || 1))}
                    required={parallelEnabled}
                    type="number"
                    value={parallelCount}
                  />
                </div>
              </FormField>
            </div>

            <div className="suite-modal-picker-shell">
              <SuiteCasePicker
                cases={appTypeCases}
                description="Use bulk selection when needed, then set the saved suite order before creating it."
                emptyMessage="No test cases available in this app type yet."
                heading="Reusable test cases"
                moduleLabelByCaseId={moduleLabelByCaseId}
                onChange={setLocalSelectedIds}
                selectedCaseIds={localSelectedIds}
              />
            </div>
          </div>

          <div className="action-row suite-modal-actions">
            <button className="ghost-button" disabled={isSaving} onClick={onClose} type="button">Cancel</button>
            <button className="primary-button" disabled={isSaving} type="submit">
              {isSaving ? "Saving…" : "Create Suite"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TestCaseSuiteLinkModal({
  testCaseTitle,
  suites,
  linkedSuiteIds,
  isSaving,
  saveDisabled,
  onChange,
  onSave,
  onClose
}: {
  testCaseTitle: string;
  suites: TestSuite[];
  linkedSuiteIds: string[];
  isSaving: boolean;
  saveDisabled: boolean;
  onChange: (suiteIds: string[]) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const dialogRef = useDialogFocus<HTMLDivElement>({ closeDisabled: isSaving, onClose });
  const linkedSuiteIdSet = useMemo(() => new Set(linkedSuiteIds), [linkedSuiteIds]);
  const linkedSuites = useMemo(
    () =>
      suites
        .filter((suite) => linkedSuiteIdSet.has(suite.id))
        .slice()
        .sort((left, right) => left.name.localeCompare(right.name)),
    [linkedSuiteIdSet, suites]
  );
  const orderedSuites = useMemo(
    () =>
      suites.slice().sort((left, right) => {
        const leftRank = linkedSuiteIdSet.has(left.id) ? 0 : 1;
        const rightRank = linkedSuiteIdSet.has(right.id) ? 0 : 1;

        if (leftRank !== rightRank) {
          return leftRank - rightRank;
        }

        return left.name.localeCompare(right.name);
      }),
    [linkedSuiteIdSet, suites]
  );

  const handleToggleSuite = (suiteId: string) => {
    if (linkedSuiteIdSet.has(suiteId)) {
      onChange(linkedSuiteIds.filter((currentId) => currentId !== suiteId));
      return;
    }

    onChange([...linkedSuiteIds, suiteId]);
  };

  return (
    <div className="modal-backdrop" onClick={() => !isSaving && onClose()} role="presentation">
      <div
        aria-label="Manage suite references"
        aria-modal="true"
        className="modal-card suite-create-modal suite-link-modal"
        onClick={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="suite-create-header">
          <div className="suite-create-title">
            <h2 className="dialog-title">Suite references</h2>
            <p>Link or unlink "{testCaseTitle}" from suites. Linked suites stay pinned at the top for quick review.</p>
          </div>
          <DialogCloseButton disabled={isSaving} label="Close suite references" onClick={onClose} />
        </div>

        <form
          className="suite-modal-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSave();
          }}
        >
          <div className="suite-link-modal-body">
            <div className="suite-link-summary">
              <div className="detail-summary">
                <strong>{linkedSuites.length} linked suite{linkedSuites.length === 1 ? "" : "s"}</strong>
                <span>
                  {linkedSuites.length
                    ? "Use the unlink icon in the linked list or suite list below to remove a reference."
                    : "No suite links yet. Use the add icon below to attach this case to one or more suites."}
                </span>
              </div>

              {linkedSuites.length ? (
                <div className="suite-link-chip-row">
                  {linkedSuites.map((suite) => (
                    <div className="suite-link-chip" key={suite.id}>
                      <span className="suite-link-chip-label">{suite.name}</span>
                      <button
                        aria-label={`Unlink ${suite.name}`}
                        className="suite-link-chip-remove"
                        disabled={isSaving}
                        onClick={() => handleToggleSuite(suite.id)}
                        title={`Unlink ${suite.name}`}
                        type="button"
                      >
                        <SuiteUnlinkIcon size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state compact">This test case is not linked to any suites yet.</div>
              )}
            </div>

            <div className="suite-link-list-shell">
              <div className="suite-link-list-header">
                <strong>All suites</strong>
                <span>{orderedSuites.length} available</span>
              </div>

              {orderedSuites.length ? (
                <div className="suite-link-list">
                  {orderedSuites.map((suite, index) => {
                    const isLinked = linkedSuiteIdSet.has(suite.id);

                    return (
                      <div className={isLinked ? "suite-link-row is-linked" : "suite-link-row"} key={suite.id}>
                        <div className="suite-link-row-copy">
                          <strong>{suite.name}</strong>
                          {suite.display_id ? <span>{suite.display_id}</span> : null}
                        </div>
                        <div className="suite-link-row-actions">
                          {isLinked ? <span className="suite-link-row-status">Linked</span> : null}
                          <button
                            aria-label={`${isLinked ? "Unlink" : "Link"} ${suite.name}`}
                            className={isLinked ? "ghost-button suite-link-toggle is-linked" : "ghost-button suite-link-toggle"}
                            data-autofocus={index === 0 ? "true" : undefined}
                            disabled={isSaving}
                            onClick={() => handleToggleSuite(suite.id)}
                            title={`${isLinked ? "Unlink" : "Link"} ${suite.name}`}
                            type="button"
                          >
                            {isLinked ? <SuiteUnlinkIcon /> : <AddIcon />}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-state compact">Create a suite first to link this test case.</div>
              )}
            </div>
          </div>

          <div className="action-row suite-modal-actions">
            <button className="ghost-button" disabled={isSaving} onClick={onClose} type="button">Cancel</button>
            <button className="primary-button" disabled={isSaving || saveDisabled} type="submit">
              {isSaving ? "Saving…" : "Save links"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TestCaseExecutionModal({
  testCases,
  selectedProject,
  selectedAppType,
  projectId,
  appTypeId,
  executionName,
  selectedAssigneeIds,
  assigneeOptions,
  selectedEnvironmentId,
  selectedConfigurationId,
  selectedDataSetId,
  executionStartMode,
  executionParallelEnabled,
  executionParallelCount,
  executionRelease,
  executionSprint,
  executionBuild,
  canCreateExecution,
  isSubmitting,
  onAssigneeChange,
  onEnvironmentChange,
  onConfigurationChange,
  onDataSetChange,
  onExecutionNameChange,
  onExecutionStartModeChange,
  onExecutionParallelEnabledChange,
  onExecutionParallelCountChange,
  onExecutionReleaseChange,
  onExecutionSprintChange,
  onExecutionBuildChange,
  onRemoveTestCase,
  onClose,
  onSubmit
}: {
  testCases: TestCase[];
  selectedProject: string;
  selectedAppType: string;
  projectId: string;
  appTypeId: string;
  executionName: string;
  selectedAssigneeIds: string[];
  assigneeOptions: TestCaseExecutionAssigneeOption[];
  selectedEnvironmentId: string;
  selectedConfigurationId: string;
  selectedDataSetId: string;
  executionStartMode: ExecutionStartMode;
  executionParallelEnabled: boolean;
  executionParallelCount: number;
  executionRelease: string;
  executionSprint: string;
  executionBuild: string;
  canCreateExecution: boolean;
  isSubmitting: boolean;
  onAssigneeChange: (value: string[]) => void;
  onEnvironmentChange: (value: string) => void;
  onConfigurationChange: (value: string) => void;
  onDataSetChange: (value: string) => void;
  onExecutionNameChange: (value: string) => void;
  onExecutionStartModeChange: (value: ExecutionStartMode) => void;
  onExecutionParallelEnabledChange: (value: boolean) => void;
  onExecutionParallelCountChange: (value: number) => void;
  onExecutionReleaseChange: (value: string) => void;
  onExecutionSprintChange: (value: string) => void;
  onExecutionBuildChange: (value: string) => void;
  onRemoveTestCase: (testCaseId: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const dialogRef = useDialogFocus<HTMLDivElement>({ closeDisabled: isSubmitting, onClose });
  return (
    <div className="modal-backdrop" onClick={() => !isSubmitting && onClose()} role="presentation">
      <div
        aria-labelledby="create-test-case-execution-title"
        aria-modal="true"
        className="modal-card execution-create-modal"
        onClick={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <form className="execution-create-form" onSubmit={onSubmit}>
          <div className="execution-create-header">
            <div className="execution-create-title">
              <h2 className="dialog-title" id="create-test-case-execution-title">Create run</h2>
              <p>The selected test cases will open directly in Test Runs without creating a suite first.</p>
            </div>
            <DialogCloseButton disabled={isSubmitting} label="Close create run dialog" onClick={onClose} />
          </div>

          <div className="execution-create-body">
            <div className="execution-create-grid">
              <FormField label="Run name">
                <input
                  autoFocus
                  placeholder="Optional run name"
                  value={executionName}
                  onChange={(event) => onExecutionNameChange(event.target.value)}
                />
              </FormField>
              <FormField label="Assign to" hint="Select one or more testers for this run.">
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

            <div className="detail-summary">
              <strong>{selectedProject || "Select a project to continue"}</strong>
              <span>{selectedAppType ? `${selectedAppType} app type selected for this run.` : "Choose an app type to load test cases."}</span>
              <span>{testCases.length ? `${testCases.length} test cases selected for this run.` : "No test cases selected yet."}</span>
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

            <FormField label="Run scope" required>
              <div className="selection-summary-card">
                <div className="selection-summary-header">
                  <div>
                    <strong>{testCases.length ? `${testCases.length} test cases selected` : "No test cases selected yet"}</strong>
                    <span>These came from the checkbox selections in the test case library. Remove any chip here before creating the run.</span>
                  </div>
                </div>

                {testCases.length ? (
                  <div className="selection-chip-row">
                    {testCases.map((testCase) => (
                      <button key={testCase.id} className="selection-chip" disabled={isSubmitting} onClick={() => onRemoveTestCase(testCase.id)} type="button">
                        {testCase.title}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </FormField>
          </div>

          <div className="action-row execution-create-actions">
            <button className="ghost-button" disabled={isSubmitting} onClick={onClose} type="button">
              Cancel
            </button>
            <button className="primary-button" disabled={!canCreateExecution || isSubmitting} type="submit">
              {isSubmitting
                ? "Creating…"
                : executionStartMode === "local"
                  ? "Create Local Run"
                  : executionStartMode === "remote"
                    ? "Create Remote Run"
                    : "Create Manual Run"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditorAccordionSection({
  title,
  summary,
  countLabel,
  isExpanded,
  onToggle,
  actions,
  children
}: {
  title: ReactNode;
  summary: ReactNode;
  countLabel: string;
  isExpanded: boolean;
  onToggle: () => void;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={isExpanded ? "editor-accordion-section is-expanded" : "editor-accordion-section"}>
      <div className="editor-accordion-head">
        <button
          aria-expanded={isExpanded}
          className="editor-accordion-toggle"
          onClick={onToggle}
          type="button"
        >
          <div className="editor-accordion-toggle-main">
            <span aria-hidden="true" className={isExpanded ? "editor-accordion-icon is-expanded" : "editor-accordion-icon"}>
              <EditorAccordionChevronIcon />
            </span>
            <div className="editor-accordion-toggle-copy">
              <strong>{title}</strong>
              <span>{summary}</span>
            </div>
          </div>
        </button>
        <div className="editor-accordion-toggle-meta">
          <span className="editor-accordion-toggle-count">{countLabel}</span>
          {actions ? <div className="editor-accordion-actions">{actions}</div> : null}
          <button className="editor-accordion-toggle-state" onClick={onToggle} type="button">
            {isExpanded ? "Collapse" : "Expand"}
          </button>
        </div>
      </div>
      {isExpanded ? <div className="editor-accordion-body">{children}</div> : null}
    </section>
  );
}

function EditorAccordionChevronIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="18" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="18">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function StepIconButton({
  children,
  ariaLabel,
  title,
  onClick,
  count = 0,
  disabled = false,
  tone = "ghost",
  type = "button"
}: {
  children: ReactNode;
  ariaLabel: string;
  title: string;
  onClick: () => void;
  count?: number;
  disabled?: boolean;
  tone?: "ghost" | "primary" | "danger";
  type?: "button" | "submit" | "reset";
}) {
  const className =
    tone === "primary"
      ? "step-action-button step-action-button--primary"
      : tone === "danger"
        ? "step-action-button step-action-button--danger"
        : "step-action-button";

  return (
    <button aria-label={ariaLabel} className={count ? `${className} has-count` : className} disabled={disabled} onClick={onClick} title={title} type={type}>
      {children}
      {count ? <span className="step-action-count">{count}</span> : null}
    </button>
  );
}

function StepIconShell({ children }: { children: ReactNode }) {
  return (
    <svg aria-hidden="true" fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24" width="16">
      {children}
    </svg>
  );
}

function StepAiIcon() {
  return <RichTextAiRephraseIcon />;
}

function StepMoveUpIcon() {
  return (
    <StepIconShell>
      <path d="m12 6-4 4" />
      <path d="m12 6 4 4" />
      <path d="M12 6v12" />
    </StepIconShell>
  );
}

function StepMoveDownIcon() {
  return (
    <StepIconShell>
      <path d="m12 18-4-4" />
      <path d="m12 18 4-4" />
      <path d="M12 6v12" />
    </StepIconShell>
  );
}

function StepSaveIcon() {
  return (
    <StepIconShell>
      <path d="M5 6.5A1.5 1.5 0 0 1 6.5 5h9l3.5 3.5V17.5A1.5 1.5 0 0 1 17.5 19h-11A1.5 1.5 0 0 1 5 17.5z" />
      <path d="M9 5v5h6V6" />
      <path d="M9 15h6" />
    </StepIconShell>
  );
}

function StepDeleteIcon() {
  return (
    <StepIconShell>
      <path d="M4 7h16" />
      <path d="M9 7V5.8A1.8 1.8 0 0 1 10.8 4h2.4A1.8 1.8 0 0 1 15 5.8V7" />
      <path d="M7 7l.8 11.1A2 2 0 0 0 9.8 20h4.4a2 2 0 0 0 2-1.9L17 7" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </StepIconShell>
  );
}

function StepExpandAllIcon() {
  return (
    <StepIconShell>
      <path d="M12 12V4" />
      <path d="m8.5 7.5 3.5-3.5 3.5 3.5" />
      <path d="M12 12v8" />
      <path d="m8.5 16.5 3.5 3.5 3.5-3.5" />
    </StepIconShell>
  );
}

function StepCollapseAllIcon() {
  return (
    <StepIconShell>
      <path d="M12 4v8" />
      <path d="m8.5 8.5 3.5 3.5 3.5-3.5" />
      <path d="M12 20v-8" />
      <path d="m8.5 15.5 3.5-3.5 3.5 3.5" />
    </StepIconShell>
  );
}

function StepCopyIcon() {
  return (
    <StepIconShell>
      <rect x="9" y="9" width="10" height="10" rx="2" />
      <path d="M7 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1" />
    </StepIconShell>
  );
}

function StepInsertIcon() {
  return (
    <StepIconShell>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
      <path d="M7 5h10" />
      <path d="M7 19h10" />
    </StepIconShell>
  );
}

function StepInsertAboveIcon() {
  return (
    <StepIconShell>
      <path d="M12 19V7" />
      <path d="m8.5 10.5 3.5-3.5 3.5 3.5" />
      <path d="M6 4h12" />
      <path d="M8 15h8" />
    </StepIconShell>
  );
}

function StepInsertBelowIcon() {
  return (
    <StepIconShell>
      <path d="M12 5v12" />
      <path d="m8.5 13.5 3.5 3.5 3.5-3.5" />
      <path d="M8 9h8" />
      <path d="M6 20h12" />
    </StepIconShell>
  );
}

function StepPasteIcon() {
  return (
    <StepIconShell>
      <path d="M8 5.5A2.5 2.5 0 0 1 10.5 3h3A2.5 2.5 0 0 1 16 5.5V7H8z" />
      <path d="M7 7h10a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z" />
      <path d="M12 10v6" />
      <path d="m9.5 13.5 2.5 2.5 2.5-2.5" />
    </StepIconShell>
  );
}

function StepCutIcon() {
  return (
    <StepIconShell>
      <circle cx="6" cy="7" r="2" />
      <circle cx="6" cy="17" r="2" />
      <path d="M8 8.5 19 18" />
      <path d="M8 15.5 19 6" />
    </StepIconShell>
  );
}

function StepPasteAboveIcon() {
  return (
    <StepIconShell>
      <path d="M8 5.5A2.5 2.5 0 0 1 10.5 3h3A2.5 2.5 0 0 1 16 5.5V7H8z" />
      <path d="M7 7h10a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z" />
      <path d="M12 16V10" />
      <path d="m8.5 12.5 3.5-3.5 3.5 3.5" />
    </StepIconShell>
  );
}

function StepPasteBelowIcon() {
  return (
    <StepIconShell>
      <path d="M8 5.5A2.5 2.5 0 0 1 10.5 3h3A2.5 2.5 0 0 1 16 5.5V7H8z" />
      <path d="M7 7h10a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z" />
      <path d="M12 10v6" />
      <path d="m8.5 15.5 3.5 3.5 3.5-3.5" />
    </StepIconShell>
  );
}

function StepParameterIcon() {
  return (
    <StepIconShell>
      <path d="M5 7h14" />
      <path d="M5 12h14" />
      <path d="M5 17h14" />
      <circle cx="10" cy="7" r="2.1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="2.1" fill="currentColor" stroke="none" />
      <circle cx="11.5" cy="17" r="2.1" fill="currentColor" stroke="none" />
      <path d="M4 11.5a3.7 3.7 0 0 0 0 1" />
      <path d="M3.1 9.4 4.3 10" />
      <path d="M4.3 14 3.1 14.6" />
      <path d="M2.5 12h1.2" />
    </StepIconShell>
  );
}

function StepKebabIcon() {
  return (
    <StepIconShell>
      <circle cx="12" cy="6" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="12" cy="18" r="1.5" />
    </StepIconShell>
  );
}

function StepClearSelectionIcon() {
  return (
    <StepIconShell>
      <path d="M5 5l14 14" />
      <path d="M19 5 5 19" />
      <path d="M8 12h8" />
    </StepIconShell>
  );
}

function StepGroupIcon() {
  return (
    <StepIconShell>
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H10l2 2h5.5A2.5 2.5 0 0 1 20 9.5v7A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z" />
      <path d="M4 10h16" />
    </StepIconShell>
  );
}

function StepSharedGroupIcon() {
  return <SharedStepsIconGraphic size={16} />;
}

function StepGroupChevronIcon() {
  return (
    <StepIconShell>
      <path d="m7 10 5 5 5-5" />
    </StepIconShell>
  );
}

function ExecutionStepsIcon() {
  return (
    <StepIconShell>
      <path d="M8 7h10" />
      <path d="M8 12h10" />
      <path d="M8 17h10" />
      <circle cx="5" cy="7" r="1" fill="currentColor" stroke="none" />
      <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="5" cy="17" r="1" fill="currentColor" stroke="none" />
    </StepIconShell>
  );
}

function getStepKindMeta(groupKind?: TestStep["group_kind"] | null) {
  if (groupKind === "reusable") {
    return { label: "Shared group step", tone: "shared" as const };
  }

  if (groupKind === "local") {
    return { label: "Local group step", tone: "local" as const };
  }

  return { label: "Standard step", tone: "default" as const };
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

function StepUngroupIcon() {
  return (
    <StepIconShell>
      <path d="M5 7h6v6H5z" />
      <path d="M13 11h6v6h-6z" />
      <path d="m9 16-3 3" />
      <path d="m6 16 3 3" />
      <path d="m18 5-3 3" />
      <path d="m15 5 3 3" />
    </StepIconShell>
  );
}

function SuiteUnlinkIcon({
  size = 16,
  strokeWidth = 1.9
}: {
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
      <path d="M5 12h14" />
    </svg>
  );
}

const STEP_ACTION_HOVER_EXIT_DELAY_MS = 1000;

function StepActionMenu({
  className = "",
  label,
  actions,
  previewActions,
  openOnHover = false
}: {
  className?: string;
  label: string;
  actions: StepActionMenuAction[];
  previewActions?: StepActionMenuAction[];
  openOnHover?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const hoverExitTimeoutRef = useRef<number | null>(null);

  const clearHoverExitTimeout = () => {
    if (hoverExitTimeoutRef.current === null) {
      return;
    }

    window.clearTimeout(hoverExitTimeoutRef.current);
    hoverExitTimeoutRef.current = null;
  };

  const handleHoverEnter = () => {
    if (!openOnHover) {
      return;
    }

    clearHoverExitTimeout();
    setIsHovering(true);
  };

  const handleHoverLeave = () => {
    if (!openOnHover) {
      return;
    }

    clearHoverExitTimeout();
    hoverExitTimeoutRef.current = window.setTimeout(() => {
      setIsHovering(false);
      hoverExitTimeoutRef.current = null;
    }, STEP_ACTION_HOVER_EXIT_DELAY_MS);
  };

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointer = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setIsOpen(false);
    };

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointer);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handlePointer);
      window.removeEventListener("keydown", handleKey);
    };
  }, [isOpen]);

  useEffect(
    () => () => {
      if (hoverExitTimeoutRef.current !== null) {
        window.clearTimeout(hoverExitTimeoutRef.current);
      }
    },
    []
  );

  return (
    <div
      className={["step-card-menu", className].filter(Boolean).join(" ")}
      onMouseEnter={handleHoverEnter}
      onMouseLeave={handleHoverLeave}
    >
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={label}
        className="step-card-menu-trigger"
        onClick={() => setIsOpen((current) => !current)}
        ref={triggerRef}
        title={label}
        type="button"
      >
        <StepKebabIcon />
      </button>
      {openOnHover && previewActions?.length && isHovering && !isOpen ? (
        <div className="step-card-menu-panel is-horizontal" role="menu">
          {previewActions.map((action) => (
            <button
              aria-label={action.label}
              className={["step-card-menu-item", action.tone ? `is-${action.tone}` : ""].filter(Boolean).join(" ")}
              disabled={action.disabled}
              key={action.label}
              onClick={() => {
                action.onClick();
                setIsHovering(false);
              }}
              role="menuitem"
              title={action.label}
              type="button"
            >
              {action.icon}
            </button>
          ))}
        </div>
      ) : null}
      {isOpen ? (
        <div className="step-card-menu-panel" ref={menuRef} role="menu">
          {actions.map((action) => (
            <button
              className={["step-card-menu-item", action.tone ? `is-${action.tone}` : ""].filter(Boolean).join(" ")}
              disabled={action.disabled}
              key={action.label}
              onClick={() => {
                action.onClick();
                setIsOpen(false);
              }}
              role="menuitem"
              title={action.label}
              type="button"
            >
              {action.icon}
              <span className="step-card-menu-item-content">
                <span className="step-card-menu-item-label-row">
                  <span className="step-card-menu-item-label">{action.label}</span>
                  {action.description ? (
                    <InfoTooltip
                      content={action.description}
                      label={`${action.label} information`}
                      trigger="span"
                    />
                  ) : null}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function InlineStepInsertSlot({
  index,
  isActive,
  draft,
  onCancel,
  onChange,
  onSubmit
}: {
  index: number;
  isActive: boolean;
  draft: StepDraft;
  onCancel: () => void;
  onChange: (draft: StepDraft) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  if (!isActive) {
    return null;
  }

  return (
    <div className="step-insert-slot is-active">
      <form className="step-create step-create--inline" onSubmit={onSubmit}>
        <strong>{index === 0 ? "+ Add Step" : "+ Insert Step"}</strong>
        <FormField label="Action">
          <RichTextEditor
            autoFocus
            value={draft.action}
            onChange={(value) => onChange({ ...draft, action: value })}
          />
        </FormField>
        <FormField label="Expected result">
          <RichTextEditor
            value={draft.expected_result}
            onChange={(value) => onChange({ ...draft, expected_result: value })}
          />
        </FormField>
        <div className="action-row">
          <button className="ghost-button" onClick={onCancel} type="button">
            Cancel
          </button>
          <button className="primary-button" type="submit">Save step</button>
        </div>
      </form>
    </div>
  );
}

function StepGroupHeader({
  name,
  kind,
  stepCount,
  isExpanded,
  canMoveUp,
  canMoveDown,
  selectionState,
  onConvertToLocal,
  onConvertToShared,
  onToggle,
  onMoveUp,
  onMoveDown,
  onPreviewCode,
  onRemoveGroup,
  onUngroup,
  onToggleSelect
}: {
  name: string;
  kind: TestStep["group_kind"];
  stepCount: number;
  isExpanded: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  selectionState: "all" | "some" | "none";
  onConvertToLocal: () => void;
  onConvertToShared: () => void;
  onToggle: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onPreviewCode: () => void;
  onRemoveGroup: () => void;
  onUngroup: () => void;
  onToggleSelect: (checked: boolean) => void;
}) {
  const isSharedGroup = kind === "reusable";
  const unlinkTitle = isSharedGroup ? "Unlink shared group from this case" : "Ungroup steps";
  const removeTitle = isSharedGroup ? "Remove shared group from this case" : "Remove group and steps";
  const selectionRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!selectionRef.current) {
      return;
    }
    selectionRef.current.indeterminate = selectionState === "some";
  }, [selectionState]);

  return (
    <div className="step-group-header">
      <div
        aria-expanded={isExpanded}
        aria-label={`${isExpanded ? "Collapse" : "Expand"} ${name}`}
        className="step-group-toggle"
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onToggle();
          }
        }}
        role="button"
        tabIndex={0}
      >
        <label className="checkbox-field step-group-select" onClick={(event) => event.stopPropagation()}>
          <input
            aria-label={`Select steps in ${name}`}
            checked={selectionState === "all"}
            onChange={(event) => onToggleSelect(event.target.checked)}
            ref={selectionRef}
            type="checkbox"
          />
        </label>
        <span aria-hidden="true" className={isExpanded ? "step-group-chevron is-expanded" : "step-group-chevron"}>
          <StepGroupChevronIcon />
        </span>
        <span className="step-group-title">
          <span className="step-group-title-row">
            <span aria-hidden="true" className={isSharedGroup ? "step-group-icon is-shared" : "step-group-icon is-local"}>
              <SharedGroupLevelIcon kind={kind} />
            </span>
            <strong>{name}</strong>
          </span>
        </span>
      </div>
      <div className="step-group-meta">
        <span className="step-group-count">
          {stepCount} step{stepCount === 1 ? "" : "s"}
        </span>
        <InlineStepToolButton
          ariaLabel={`Preview automation for ${name}`}
          className="step-inline-tool--group"
          onClick={onPreviewCode}
          title="Preview consolidated automation"
        >
          <AutomationCodeIcon />
        </InlineStepToolButton>
        <StepActionMenu
          className="step-group-header-actions step-card-menu--flat"
          label="Group actions"
          actions={[
            {
              label: "Move group up",
              icon: <StepMoveUpIcon />,
              onClick: onMoveUp,
              disabled: !canMoveUp
            },
            {
              label: "Move group down",
              icon: <StepMoveDownIcon />,
              onClick: onMoveDown,
              disabled: !canMoveDown
            },
            ...(isSharedGroup
              ? [{
                  label: "Convert to local group",
                  icon: <StepGroupIcon />,
                  onClick: onConvertToLocal
                }]
              : [{
                  label: "Convert to shared group",
                  icon: <StepSharedGroupIcon />,
                  onClick: onConvertToShared
                }]),
            {
              label: unlinkTitle,
              icon: <StepUngroupIcon />,
              onClick: onUngroup
            },
            {
              label: removeTitle,
              icon: <StepDeleteIcon />,
              onClick: onRemoveGroup,
              tone: "danger"
            }
          ]}
        />
      </div>
    </div>
  );
}

function EditableStepCard({
  step,
  draft,
  parameterValues,
  isExpanded,
  isSelected,
  isRephrasing,
  canPaste,
  canMoveUp,
  canMoveDown,
  showAutomationTools,
  showRecorderTools,
  onSave,
  onDraftChange,
  onCopy,
  onCut,
  onDelete,
  onInsertAbove,
  onInsertBelow,
  onToggle,
  onToggleSelect,
  onMoveUp,
  onMoveDown,
  onChangeStepType,
  onEditAutomation,
  onInspect,
  onRephrase,
  onPasteAbove,
  onPasteBelow
}: {
  step: TestStep;
  draft: StepDraft;
  parameterValues: Record<string, string>;
  isExpanded: boolean;
  isSelected: boolean;
  isRephrasing: boolean;
  canPaste: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  showAutomationTools: boolean;
  showRecorderTools: boolean;
  onSave: (input: StepDraft) => void;
  onDraftChange: (input: StepDraft) => void;
  onCopy: () => void;
  onCut: () => void;
  onDelete: () => void;
  onInsertAbove: () => void;
  onInsertBelow: () => void;
  onToggle: () => void;
  onToggleSelect: (checked: boolean) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onChangeStepType: (nextType: TestStep["step_type"]) => void;
  onEditAutomation: () => void;
  onInspect: () => void;
  onRephrase: () => void;
  onPasteAbove: () => void;
  onPasteBelow: () => void;
}) {
  const stepKind = getStepKindMeta(step.group_kind);
  const isDirty =
    normalizeSharedGroupComparableText(draft.action) !== normalizeSharedGroupComparableText(step.action)
    || normalizeSharedGroupComparableText(draft.expected_result) !== normalizeSharedGroupComparableText(step.expected_result)
    || !areComparableStepAutomationEqual(draft, step);
  const stepActions: StepActionMenuAction[] = [
    {
      label: "Insert above",
      description: "Open a new step slot right above this step.",
      icon: <StepInsertAboveIcon />,
      onClick: onInsertAbove
    },
    {
      label: "Insert below",
      description: "Open a new step slot right below this step.",
      icon: <StepInsertBelowIcon />,
      onClick: onInsertBelow
    },
    ...(canPaste
      ? [{
          label: "Paste above",
          description: "Insert the clipboard steps before this step.",
          icon: <StepPasteAboveIcon />,
          onClick: onPasteAbove
        }, {
          label: "Paste below",
          description: "Insert the clipboard steps after this step.",
          icon: <StepPasteBelowIcon />,
          onClick: onPasteBelow
        }]
      : []),
    {
      label: "Copy step",
      description: "Place this step in the clipboard.",
      icon: <StepCopyIcon />,
      onClick: onCopy
    },
    {
      label: "Cut step",
      description: "Move this step after you paste it somewhere else.",
      icon: <StepCutIcon />,
      onClick: onCut
    },
    {
      label: "Move up",
      description: "Shift this step earlier in its current order.",
      icon: <StepMoveUpIcon />,
      onClick: onMoveUp,
      disabled: !canMoveUp
    },
    {
      label: "Move down",
      description: "Shift this step later in its current order.",
      icon: <StepMoveDownIcon />,
      onClick: onMoveDown,
      disabled: !canMoveDown
    },
    {
      label: isDirty ? "Save all changes" : "Save test case",
      description: "Save case details, test data, preconditions, and all edited steps together.",
      icon: <StepSaveIcon />,
      onClick: () => onSave(draft),
      tone: "primary"
    },
    {
      label: "Delete step",
      description: "Remove this step from the current test case.",
      icon: <StepDeleteIcon />,
      onClick: onDelete,
      tone: "danger"
    }
  ];

  return (
    <article
      className={[
        isExpanded ? "step-card is-expanded" : "step-card",
        step.group_kind === "reusable" ? "step-card--shared" : "",
        step.group_kind === "local" ? "step-card--grouped" : ""
      ].filter(Boolean).join(" ")}
    >
      <div className="step-card-top">
        <label className="checkbox-field step-card-select">
          <input
            aria-label={`Select step ${step.step_order}`}
            checked={isSelected}
            onChange={(event) => onToggleSelect(event.target.checked)}
            type="checkbox"
          />
        </label>
        <div className="step-card-type-tool">
          <StepTypePickerButton value={draft.step_type || step.step_type} onChange={onChangeStepType} />
        </div>
        <button
          aria-label={isExpanded ? `Hide step ${step.step_order} details` : `Show step ${step.step_order} details`}
          className="step-card-toggle"
          onClick={onToggle}
          type="button"
        >
          <div className="step-card-summary">
            <div className="step-card-summary-row">
              <div className="step-card-summary-top">
                <StepKindIconBadge label={stepKind.label} tone={stepKind.tone} />
                <strong>Step {step.step_order}</strong>
              </div>
              <StepParameterizedText
                className="step-card-parameterized"
                fallback="No action written yet"
                text={richTextToPlainText(draft.action)}
                values={parameterValues}
              />
            </div>
          </div>
        </button>
        <div className="step-inline-tools">
          {showRecorderTools ? <InlineStepToolButton
            ariaLabel={`Inspect and record action for step ${step.step_order}`}
            onClick={onInspect}
            title="Inspect and record this step action"
          >
            <RecordIcon size={16} />
          </InlineStepToolButton> : null}
          <InlineStepToolButton
            ariaLabel={`Rephrase step ${step.step_order} with AI`}
            className={isRephrasing ? "is-active is-loading" : ""}
            disabled={isRephrasing}
            onClick={onRephrase}
            title={isRephrasing ? "AI is rephrasing this step" : "Rephrase step with AI"}
          >
            <StepAiIcon />
          </InlineStepToolButton>
          {showAutomationTools ? <InlineStepToolButton
            ariaLabel={`Edit automation for step ${step.step_order}`}
            className={stepHasAutomation(draft) ? "is-active" : ""}
            onClick={onEditAutomation}
            title={stepHasAutomation(draft) ? "View or edit mapped automation for this step" : "Edit step automation"}
          >
            <AutomationCodeIcon />
          </InlineStepToolButton> : null}
        </div>
        <StepActionMenu
          className="step-card-menu--floating"
          label={`Step ${step.step_order} actions`}
          openOnHover
          previewActions={stepActions}
          actions={stepActions}
        />
      </div>

      {isExpanded ? (
        <div className="step-card-body">
          <FormField label="Action">
            <RichTextEditor value={draft.action} onChange={(value) => onDraftChange({ ...draft, action: value })} />
          </FormField>
          <FormField label="Expected result">
            <RichTextEditor value={draft.expected_result} onChange={(value) => onDraftChange({ ...draft, expected_result: value })} />
          </FormField>
        </div>
      ) : null}
    </article>
  );
}

function DraftStepCard({
  step,
  parameterValues,
  isSelected,
  isExpanded,
  isRephrasing,
  canPaste,
  canMoveUp,
  canMoveDown,
  showAutomationTools,
  showRecorderTools,
  onChange,
  onCopy,
  onCut,
  onDelete,
  onInsertAbove,
  onInsertBelow,
  onToggle,
  onToggleSelect,
  onMoveUp,
  onMoveDown,
  onChangeStepType,
  onEditAutomation,
  onInspect,
  onRephrase,
  onPasteAbove,
  onPasteBelow
}: {
  step: { id: string; step_order: number; action: string; expected_result: string; step_type: TestStep["step_type"]; automation_code: string; api_request: TestStep["api_request"]; group_id: string | null; group_name: string | null; group_kind: "local" | "reusable" | null; reusable_group_id: string | null };
  parameterValues: Record<string, string>;
  isSelected: boolean;
  isExpanded: boolean;
  isRephrasing: boolean;
  canPaste: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  showAutomationTools: boolean;
  showRecorderTools: boolean;
  onChange: (input: StepDraft) => void;
  onCopy: () => void;
  onCut: () => void;
  onDelete: () => void;
  onInsertAbove: () => void;
  onInsertBelow: () => void;
  onToggle: () => void;
  onToggleSelect: (checked: boolean) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onChangeStepType: (nextType: TestStep["step_type"]) => void;
  onEditAutomation: () => void;
  onInspect: () => void;
  onRephrase: () => void;
  onPasteAbove: () => void;
  onPasteBelow: () => void;
}) {
  const stepKind = getStepKindMeta(step.group_kind);
  const stepActions: StepActionMenuAction[] = [
    {
      label: "Insert above",
      description: "Open a new step slot right above this draft step.",
      icon: <StepInsertAboveIcon />,
      onClick: onInsertAbove
    },
    {
      label: "Insert below",
      description: "Open a new step slot right below this draft step.",
      icon: <StepInsertBelowIcon />,
      onClick: onInsertBelow
    },
    ...(canPaste
      ? [{
          label: "Paste above",
          description: "Insert the clipboard steps before this draft step.",
          icon: <StepPasteAboveIcon />,
          onClick: onPasteAbove
        }, {
          label: "Paste below",
          description: "Insert the clipboard steps after this draft step.",
          icon: <StepPasteBelowIcon />,
          onClick: onPasteBelow
        }]
      : []),
    {
      label: "Copy step",
      description: "Place this draft step in the clipboard.",
      icon: <StepCopyIcon />,
      onClick: onCopy
    },
    {
      label: "Cut step",
      description: "Move this draft step after you paste it somewhere else.",
      icon: <StepCutIcon />,
      onClick: onCut
    },
    {
      label: "Move up",
      description: "Shift this draft step earlier in its current order.",
      icon: <StepMoveUpIcon />,
      onClick: onMoveUp,
      disabled: !canMoveUp
    },
    {
      label: "Move down",
      description: "Shift this draft step later in its current order.",
      icon: <StepMoveDownIcon />,
      onClick: onMoveDown,
      disabled: !canMoveDown
    },
    {
      label: "Delete step",
      description: "Remove this draft step from the test case.",
      icon: <StepDeleteIcon />,
      onClick: onDelete,
      tone: "danger"
    }
  ];

  return (
    <article
      className={[
        isExpanded ? "step-card is-expanded" : "step-card",
        step.group_kind === "reusable" ? "step-card--shared" : "",
        step.group_kind === "local" ? "step-card--grouped" : ""
      ].filter(Boolean).join(" ")}
    >
      <div className="step-card-top">
        <label className="checkbox-field step-card-select">
          <input
            aria-label={`Select step ${step.step_order}`}
            checked={isSelected}
            onChange={(event) => onToggleSelect(event.target.checked)}
            type="checkbox"
          />
        </label>
        <div className="step-card-type-tool">
          <StepTypePickerButton value={step.step_type} onChange={onChangeStepType} />
        </div>
        <button
          aria-label={isExpanded ? `Hide step ${step.step_order} details` : `Show step ${step.step_order} details`}
          className="step-card-toggle"
          onClick={onToggle}
          type="button"
        >
          <div className="step-card-summary">
            <div className="step-card-summary-row">
              <div className="step-card-summary-top">
                <StepKindIconBadge label={stepKind.label} tone={stepKind.tone} />
                <strong>Step {step.step_order}</strong>
              </div>
              <StepParameterizedText
                className="step-card-parameterized"
                fallback="Draft step details"
                text={richTextToPlainText(step.action || step.expected_result)}
                values={parameterValues}
              />
            </div>
          </div>
        </button>
        <div className="step-inline-tools">
          {showRecorderTools ? <InlineStepToolButton
            ariaLabel={`Inspect and record action for step ${step.step_order}`}
            onClick={onInspect}
            title="Inspect and record this step action"
          >
            <RecordIcon size={16} />
          </InlineStepToolButton> : null}
          <InlineStepToolButton
            ariaLabel={`Rephrase step ${step.step_order} with AI`}
            className={isRephrasing ? "is-active is-loading" : ""}
            disabled={isRephrasing}
            onClick={onRephrase}
            title={isRephrasing ? "AI is rephrasing this step" : "Rephrase step with AI"}
          >
            <StepAiIcon />
          </InlineStepToolButton>
          {showAutomationTools ? <InlineStepToolButton
            ariaLabel={`Edit automation for step ${step.step_order}`}
            className={stepHasAutomation(step) ? "is-active" : ""}
            onClick={onEditAutomation}
            title={stepHasAutomation(step) ? "View or edit mapped automation for this step" : "Edit step automation"}
          >
            <AutomationCodeIcon />
          </InlineStepToolButton> : null}
        </div>
        <StepActionMenu
          className="step-card-menu--floating"
          label={`Step ${step.step_order} actions`}
          openOnHover
          previewActions={stepActions}
          actions={stepActions}
        />
      </div>

      {isExpanded ? (
        <div className="step-card-body">
          <FormField label="Action">
            <RichTextEditor
              value={step.action}
              onChange={(value) =>
                onChange({
                  action: value,
                  expected_result: step.expected_result,
                  step_type: step.step_type,
                  automation_code: step.automation_code,
                  api_request: step.api_request
                })
              }
            />
          </FormField>
          <FormField label="Expected result">
            <RichTextEditor
              value={step.expected_result}
              onChange={(value) =>
                onChange({
                  action: step.action,
                  expected_result: value,
                  step_type: step.step_type,
                  automation_code: step.automation_code,
                  api_request: step.api_request
                })
              }
            />
          </FormField>
        </div>
      ) : null}
    </article>
  );
}

function StepGroupModal({
  name,
  reusable,
  selectedCount,
  isSaving,
  onNameChange,
  setReusable,
  onSave,
  onClose
}: {
  name: string;
  reusable: boolean;
  selectedCount: number;
  isSaving: boolean;
  onNameChange: (value: string) => void;
  setReusable: (value: boolean) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const dialogRef = useDialogFocus<HTMLDivElement>({ closeDisabled: isSaving, onClose });

  return (
    <div className="modal-backdrop" onClick={() => !isSaving && onClose()} role="presentation">
      <div
        aria-label="Create step group"
        aria-modal="true"
        className="modal-card suite-create-modal"
        onClick={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="suite-create-header">
          <div className="suite-create-title">
            <h2 className="dialog-title">Create step group</h2>
            <p>Name this group and decide whether it should stay local to this case or become a linked shared group used in other cases.</p>
          </div>
          <DialogCloseButton disabled={isSaving} label="Close create step group" onClick={onClose} />
        </div>

        <div className="form-grid">
          <FormField label="Group name" required>
            <input
              data-autofocus="true"
              required
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
            />
          </FormField>

          <label className="checkbox-field">
            <input checked={reusable} onChange={(event) => setReusable(event.target.checked)} type="checkbox" />
            Save as shared group
          </label>

          <div className="detail-summary">
            <strong>{selectedCount} step{selectedCount === 1 ? "" : "s"} selected</strong>
            <span>{reusable ? "Shared groups stay linked across every test case that references them." : "Local groups only organize the current case."}</span>
          </div>
        </div>

        <div className="action-row">
          <button className="ghost-button" disabled={isSaving} onClick={onClose} type="button">
            Cancel
          </button>
          <button className="primary-button" disabled={isSaving} onClick={onSave} type="button">
            {isSaving ? "Saving…" : reusable ? "Create shared group" : "Create group"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SharedGroupPickerModal({
  groups,
  selectedGroupId,
  selectedGroup,
  isLoading,
  searchValue,
  onSearchChange,
  setSelectedGroupId,
  onConfirm,
  onClose
}: {
  groups: SharedStepGroup[];
  selectedGroupId: string;
  selectedGroup: SharedStepGroup | null;
  isLoading: boolean;
  searchValue: string;
  onSearchChange: (value: string) => void;
  setSelectedGroupId: (value: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const dialogRef = useDialogFocus<HTMLDivElement>({ onClose });

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        aria-label="Insert shared step group"
        aria-modal="true"
        className="modal-card suite-create-modal"
        onClick={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="suite-create-header">
          <div className="suite-create-title">
            <div className="modal-title-info-row">
              <h2 className="dialog-title">Insert shared group</h2>
              <InfoTooltip
                content="Choose a shared group to insert into this case. Edits inside the shared block stay linked across every referencing test case."
                label="Insert shared group information"
              />
            </div>
          </div>
          <DialogCloseButton label="Close shared group picker" onClick={onClose} />
        </div>

        <div className="form-grid">
          <FormField label="Search shared groups">
            <input
              data-autofocus="true"
              placeholder="Search by name or step text"
              value={searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
            />
          </FormField>

          <div className="stack-list">
            {isLoading ? <LoadingState label="Loading shared groups" /> : null}
            {!isLoading && groups.map((group) => (
              <label className="stack-item" key={group.id}>
                <div>
                  <span className="step-group-title-row">
                    <span aria-hidden="true" className="step-kind-badge is-shared">
                      <SharedStepsIconGraphic size={14} />
                    </span>
                    <strong>{group.name}</strong>
                  </span>
                  <span>{group.description || `${group.steps.length} reusable step${group.steps.length === 1 ? "" : "s"}`}</span>
                </div>
                <input
                  checked={selectedGroupId === group.id}
                  onChange={() => setSelectedGroupId(group.id)}
                  type="radio"
                />
              </label>
            ))}
            {!isLoading && !groups.length ? <div className="empty-state compact">No shared step groups match this search.</div> : null}
          </div>

          {selectedGroup ? (
            <div className="detail-summary">
              <div className="step-group-title-row">
                <span aria-hidden="true" className="step-kind-badge is-shared">
                  <SharedStepsIconGraphic size={14} />
                </span>
                <strong>{selectedGroup.name}</strong>
              </div>
              <span>
                {richTextToPlainText(selectedGroup.steps[0]?.action || selectedGroup.steps[0]?.expected_result || "") || "No preview available"}
                {selectedGroup.steps.length > 1 ? ` · ${selectedGroup.steps.length} steps total` : ""}
              </span>
            </div>
          ) : null}
        </div>

        <div className="action-row">
          <button className="ghost-button" onClick={onClose} type="button">
            Cancel
          </button>
          <button className="primary-button" disabled={!selectedGroupId} onClick={onConfirm} type="button">
            Insert selected group
          </button>
        </div>
      </div>
    </div>
  );
}
