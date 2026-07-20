import { DragEvent, FormEvent, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { AddIcon, ClearSelectionIcon, CollapseExpandIcon, EyeIcon, GridIcon, LayersIcon, SelectAllIcon } from "../components/AppIcons";
import { CatalogSelectionControls } from "../components/CatalogSelectionControls";
import { CreateRunActionButton } from "../components/CreateRunActionButton";
import { CatalogViewToggle } from "../components/CatalogViewToggle";
import { CatalogSearchFilter } from "../components/CatalogSearchFilter";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { DialogCloseButton } from "../components/DialogCloseButton";
import { DisplayIdBadge } from "../components/DisplayIdBadge";
import { FormField } from "../components/FormField";
import { InfoTooltip } from "../components/InfoTooltip";
import { ExecutionContextSelector } from "../components/ExecutionContextSelector";
import { LinkedTestCaseModal } from "../components/LinkedTestCaseModal";
import { LoadingState } from "../components/LoadingState";
import { MultiAssigneePicker } from "../components/MultiAssigneePicker";
import { PageHeader } from "../components/PageHeader";
import { Panel } from "../components/Panel";
import { RunTypeSelector } from "../components/RunTypeSelector";
import { StepParameterDialog } from "../components/StepParameterDialog";
import { SharedGroupLevelIcon } from "../components/StepAutomationEditor";
import { StatusBadge } from "../components/StatusBadge";
import {
  TileCardLinkIcon,
  formatTileCardLabel
} from "../components/TileCardPrimitives";
import { RunHooksBuilder, type RunHookSelection } from "../components/RunHooksBuilder";
import { RichTextContent, RichTextEditor, richTextToPlainText } from "../components/RichTextEditor";
import { SuiteCasePicker, SuiteScopePicker } from "../components/SuiteCasePicker";
import { TileBrowserPane } from "../components/TileBrowserPane";
import { TileCardSkeletonGrid } from "../components/TileCardSkeletonGrid";
import { ToastMessage } from "../components/ToastMessage";
import { WorkspaceBackButton, WorkspaceMasterDetail } from "../components/WorkspaceMasterDetail";
import { useDeleteConfirmation } from "../components/DeleteConfirmationDialog";
import { useCurrentAppType, useCurrentProject } from "../hooks/useCurrentProject";
import { useDomainMetadata } from "../hooks/useDomainMetadata";
import { useDialogFocus } from "../hooks/useDialogFocus";
import { useFeatureFlags } from "../hooks/useFeatureFlags";
import { api } from "../lib/api";
import { areFeatureFlagsEnabled } from "../lib/featureFlags";
import { hasPermission } from "../lib/permissions";
import {
  collectStepParameters,
  filterStepParameterValues,
  filterStepParameterValuesByScope,
  normalizeStepParameterValues,
  parseStepParameterName,
  type StepParameterDefinition
} from "../lib/stepParameters";
import { type AssigneeOption, buildAssigneeOptions } from "../lib/userDisplay";
import { findByRoutableId, getRoutableId } from "../lib/urlSelection";
import { formatReferenceList, parseReferenceList } from "../lib/externalReferences";
import { readDefaultCatalogViewMode } from "../lib/viewPreferences";
import type { AppType, ExecutionResult, Project, ProjectMember, Requirement, TestCase, TestCaseModule, TestStep, TestSuite, User } from "../types";

const SUITE_ACTION_USAGE_STORAGE_KEY = "qaira:suite-toolbar-action-usage:v1";

type SuiteToolbarActionKey = "create-suite" | "manual-run" | "local-run" | "remote-run" | "select-visible" | "clear-selection" | "delete-selected";
type SuiteToolbarActionUsage = Record<string, { count: number; lastUsedAt: number }>;

type CaseDraft = {
  suite_id: string;
  title: string;
  description: string;
  automated: "yes" | "no";
  priority: string;
  status: string;
  requirement_id: string;
};

type StepDraft = {
  action: string;
  expected_result: string;
};

type DraftTestStep = {
  id: string;
  action: string;
  expected_result: string;
  group_id: string | null;
  group_name: string | null;
  group_kind: "local" | "reusable" | null;
  reusable_group_id: string | null;
};

type SuiteCaseEditorSectionKey = "case" | "steps" | "history";

type SuiteModalMode = "create" | "edit";
type ExecutionStartMode = "manual" | "local" | "remote";
type SuiteMappedCasesFilter = "all" | "with-cases" | "empty";
type SuiteCaseStepFilter = "all" | "with-steps" | "no-steps";
type SuiteCaseRunFilter = "all" | "with-runs" | "no-runs";
type SuiteExecutionAssigneeOption = AssigneeOption;

const DEFAULT_CASE_STATUS = "active";
const createEmptyCaseDraft = (defaultStatus = DEFAULT_CASE_STATUS, defaultAutomated: "yes" | "no" = "no"): CaseDraft => ({
  suite_id: "",
  title: "",
  description: "",
  automated: defaultAutomated,
  priority: "3",
  status: defaultStatus,
  requirement_id: ""
});
const EMPTY_STEP_DRAFT = {
  action: "",
  expected_result: ""
};

const normalizeSuiteParameterValues = (values?: Record<string, unknown> | null) =>
  normalizeStepParameterValues((values || {}) as Record<string, string>, "s");

const serializeSuiteParameterValues = (values?: Record<string, unknown> | null) =>
  JSON.stringify(
    Object.entries(normalizeSuiteParameterValues(values))
      .sort(([left], [right]) => left.localeCompare(right))
  );

const areSuiteParameterValuesEqual = (
  left?: Record<string, unknown> | null,
  right?: Record<string, unknown> | null
) => serializeSuiteParameterValues(left) === serializeSuiteParameterValues(right);

const aggregateExecutionResultStatus = (
  current: ExecutionResult["status"] | undefined,
  next: ExecutionResult["status"]
): ExecutionResult["status"] => {
  if (current === "failed" || next === "failed") {
    return "failed";
  }

  if (current === "blocked" || next === "blocked") {
    return "blocked";
  }

  return "passed";
};

const createDefaultSuiteCaseSections = (): Record<SuiteCaseEditorSectionKey, boolean> => ({
  case: true,
  steps: true,
  history: false
});

const createDraftStepId = () =>
  globalThis.crypto?.randomUUID?.() || `suite-draft-step-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const normalizeDraftSteps = (steps: DraftTestStep[]) =>
  steps
    .map((step, index) => ({
      step_order: index + 1,
      action: step.action.trim(),
      expected_result: step.expected_result.trim(),
      group_id: step.group_id || undefined,
      group_name: step.group_name || undefined,
      group_kind: step.group_kind || undefined,
      reusable_group_id: step.reusable_group_id || undefined
    }))
    .filter((step) => step.action || step.expected_result);

const getSuiteStepKindMeta = (kind?: TestStep["group_kind"] | null) => {
  if (kind === "reusable") {
    return { label: "Shared Steps", tone: "shared" as const };
  }

  if (kind === "local") {
    return { label: "Local group step", tone: "local" as const };
  }

  return { label: "Standard step", tone: "default" as const };
};

function ExecutionStepsIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="16">
      <path d="M8 7h10" />
      <path d="M8 12h10" />
      <path d="M8 17h10" />
      <circle cx="5" cy="7" r="1" fill="currentColor" stroke="none" />
      <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="5" cy="17" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function UnlinkSuiteCasesIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24" width="16">
      <path d="m9.5 14.5-1 1a4 4 0 0 1-5.7-5.7l2.5-2.5A4 4 0 0 1 11 7" />
      <path d="m14.5 9.5 1-1a4 4 0 0 1 5.7 5.7l-2.5 2.5A4 4 0 0 1 13 17" />
      <path d="m8 8 8 8" />
    </svg>
  );
}

function StepKindIconBadge({
  kind,
  label,
  tone
}: {
  kind?: TestStep["group_kind"] | null;
  label: string;
  tone: "default" | "shared" | "local";
}) {
  const icon =
    tone === "shared"
      ? <SharedGroupLevelIcon kind="reusable" />
      : tone === "local"
        ? <SharedGroupLevelIcon kind="local" />
        : <ExecutionStepsIcon />;

  return (
    <span
      aria-label={kind === "reusable" ? "Shared Steps" : label}
      className={["step-kind-badge", tone === "default" ? "" : `is-${tone}`].filter(Boolean).join(" ")}
      title={kind === "reusable" ? "Shared Steps" : label}
    >
      {icon}
    </span>
  );
}

export function DesignPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { session } = useAuth();
  const featureFlagsQuery = useFeatureFlags(Boolean(session));
  const canUseManualSuites = areFeatureFlagsEnabled(featureFlagsQuery.data, ["qaira.manual.suites"]);
  const canCreateSuites = hasPermission(session, "suite.create") && canUseManualSuites;
  const canUpdateSuites = hasPermission(session, "suite.update") && canUseManualSuites;
  const canDeleteSuites = hasPermission(session, "suite.delete") && canUseManualSuites;
  const canCreateManualRuns = hasPermission(session, "run.create")
    && areFeatureFlagsEnabled(featureFlagsQuery.data, ["qaira.manual.runs"]);
  const canUseAutomationWorkspace = areFeatureFlagsEnabled(featureFlagsQuery.data, ["qaira.automation.workspace"]);
  const canRunLocalAutomation = hasPermission(session, "automation.run.local")
    && canUseAutomationWorkspace
    && areFeatureFlagsEnabled(featureFlagsQuery.data, ["qaira.automation.local_execution"]);
  const canRunRemoteAutomation = hasPermission(session, "automation.run.remote")
    && canUseAutomationWorkspace
    && areFeatureFlagsEnabled(featureFlagsQuery.data, ["qaira.automation.remote_execution"]);
  const canConfigureParallelAutomation = hasPermission(session, "automation.run.parallel")
    && canUseAutomationWorkspace
    && areFeatureFlagsEnabled(featureFlagsQuery.data, ["qaira.automation.parallel_execution"]);
  const { confirmAction, confirmDelete, confirmationDialog } = useDeleteConfirmation();
  const domainMetadataQuery = useDomainMetadata();
  const [projectId] = useCurrentProject();
  const [appTypeId, setAppTypeId] = useCurrentAppType(projectId);
  const [selectedSuiteId, setSelectedSuiteId] = useState("");
  const [selectedSuiteActionIds, setSelectedSuiteActionIds] = useState<string[]>([]);
  const [selectedTestCaseId, setSelectedTestCaseId] = useState("");
  const [suiteSearchTerm, setSuiteSearchTerm] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [suiteCatalogViewMode, setSuiteCatalogViewMode] = useState<"tile" | "list">(() => readDefaultCatalogViewMode());
  const [suiteCaseCatalogViewMode, setSuiteCaseCatalogViewMode] = useState<"tile" | "list">(() => readDefaultCatalogViewMode());
  const [statusFilter, setStatusFilter] = useState("all");
  const [suiteMappedCasesFilter, setSuiteMappedCasesFilter] = useState<SuiteMappedCasesFilter>("all");
  const [casePriorityFilter, setCasePriorityFilter] = useState("all");
  const [caseStepFilter, setCaseStepFilter] = useState<SuiteCaseStepFilter>("all");
  const [caseRunFilter, setCaseRunFilter] = useState<SuiteCaseRunFilter>("all");
  const [isCreatingCase, setIsCreatingCase] = useState(false);
  const [isTestCaseEditorModalOpen, setIsTestCaseEditorModalOpen] = useState(false);
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

  useEffect(() => {
    if (!canConfigureParallelAutomation && executionParallelEnabled) {
      setExecutionParallelEnabled(false);
      setExecutionParallelCount(1);
    }
    if (executionStartMode === "local" && !canRunLocalAutomation) setExecutionStartMode("manual");
    if (executionStartMode === "remote" && !canRunRemoteAutomation) setExecutionStartMode("manual");
  }, [canConfigureParallelAutomation, canRunLocalAutomation, canRunRemoteAutomation, executionParallelEnabled, executionStartMode]);
  const [executionHookDraft, setExecutionHookDraft] = useState<RunHookSelection[]>([]);
  const [suiteModalMode, setSuiteModalMode] = useState<SuiteModalMode>("create");
  const [isSuiteModalOpen, setIsSuiteModalOpen] = useState(false);
  const [isSuiteParameterDialogOpen, setIsSuiteParameterDialogOpen] = useState(false);
  const [suiteParameterValues, setSuiteParameterValues] = useState<Record<string, string>>({});
  const [expandedSections, setExpandedSections] = useState<Record<SuiteCaseEditorSectionKey, boolean>>(createDefaultSuiteCaseSections);
  const [expandedStepIds, setExpandedStepIds] = useState<string[]>([]);
  const [isDeletingSelectedSuites, setIsDeletingSelectedSuites] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");
  const defaultCaseStatus = domainMetadataQuery.data?.test_cases.default_status || DEFAULT_CASE_STATUS;
  const defaultCaseAutomated = (domainMetadataQuery.data?.test_cases.default_automated || "no") as "yes" | "no";
  const testCaseStatusOptions = domainMetadataQuery.data?.test_cases.statuses || [];
  const testCaseAutomatedOptions = domainMetadataQuery.data?.test_cases.automated_options || [
    { value: "no", label: "No" },
    { value: "yes", label: "Yes" }
  ];
  const emptyCaseDraft = useMemo(
    () => createEmptyCaseDraft(defaultCaseStatus, defaultCaseAutomated),
    [defaultCaseAutomated, defaultCaseStatus]
  );

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
  const requirementsQuery = useQuery({
    queryKey: ["requirements", projectId],
    queryFn: () => api.requirements.list({ project_id: projectId }),
    enabled: Boolean(projectId)
  });
  const suitesQuery = useQuery({
    queryKey: ["design-suites", appTypeId],
    queryFn: () => api.testSuites.list({ app_type_id: appTypeId }),
    enabled: Boolean(appTypeId)
  });
  const testCasesQuery = useQuery({
    queryKey: ["design-test-cases", appTypeId],
    queryFn: () => api.testCases.list({ app_type_id: appTypeId, projection: "detail", page_size: 100 }),
    enabled: Boolean(appTypeId)
  });
  const selectedSuiteCaseIds = useMemo(
    () => (testCasesQuery.data || [])
      .filter((testCase) => selectedSuiteId && (testCase.suite_ids || []).includes(selectedSuiteId))
      .map((testCase) => testCase.id)
      .sort(),
    [selectedSuiteId, testCasesQuery.data]
  );
  const testCaseModulesQuery = useQuery({
    queryKey: ["design-test-case-modules", appTypeId],
    queryFn: () => api.testCaseModules.list({ app_type_id: appTypeId }),
    enabled: Boolean(appTypeId)
  });
  const executionResultsQuery = useQuery({
    queryKey: ["design-case-results", appTypeId],
    queryFn: () => api.executionResults.list({ app_type_id: appTypeId, run_limit: 10, limit: 100 }),
    enabled: Boolean(appTypeId)
  });
  const selectedSuiteStepsQuery = useQuery({
    queryKey: ["design-suite-test-steps", selectedSuiteId, selectedSuiteCaseIds.join(",")],
    queryFn: () => api.testSteps.list({ test_case_ids: selectedSuiteCaseIds.join(",") }),
    enabled: Boolean(selectedSuiteId && selectedSuiteCaseIds.length),
    staleTime: 30_000
  });
  const sharedGroupsQuery = useQuery({
    queryKey: ["design-shared-step-groups", appTypeId],
    queryFn: () => api.sharedStepGroups.list({ app_type_id: appTypeId }),
    enabled: Boolean(appTypeId)
  });
  const suiteMappingsQuery = useQuery({
    queryKey: ["suite-test-case-mappings", selectedSuiteId],
    queryFn: () => api.suiteTestCases.list({ suite_id: selectedSuiteId }),
    enabled: Boolean(selectedSuiteId)
  });
  const stepsQuery = useQuery({
    queryKey: ["design-test-steps", selectedTestCaseId],
    queryFn: () => api.testSteps.list({ test_case_id: selectedTestCaseId }),
    enabled: Boolean(selectedTestCaseId) && !isCreatingCase
  });

  const createSuiteMutation = useMutation({ mutationFn: api.testSuites.create });
  const updateSuiteMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<{ name: string; labels: string[]; parameter_values: Record<string, string>; parallel_enabled: boolean; parallel_count: number }> }) =>
      api.testSuites.update(id, input)
  });
  const assignSuiteCasesMutation = useMutation({
    mutationFn: ({ id, testCaseIds, expectedRevision, append = true }: { id: string; testCaseIds: string[]; expectedRevision?: number; append?: boolean }) =>
      api.testSuites.assignTestCases(id, testCaseIds, expectedRevision, append)
  });
  const reorderSuiteCasesMutation = useMutation({
    mutationFn: ({ suiteId, testCaseIds }: { suiteId: string; testCaseIds: string[] }) =>
      api.suiteTestCases.reorder(suiteId, testCaseIds)
  });
  const createTestCaseMutation = useMutation({ mutationFn: api.testCases.create });
  const updateTestCaseMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<{ app_type_id: string; suite_id: string; suite_ids: string[]; title: string; description: string; automated: "yes" | "no"; priority: number; status: string; requirement_id: string }> }) =>
      api.testCases.update(id, input)
  });
  const deleteTestCaseMutation = useMutation({ mutationFn: api.testCases.delete });
  const createStepMutation = useMutation({ mutationFn: api.testSteps.create });
  const updateStepMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<{ test_case_id: string; step_order: number; action: string; expected_result: string; group_id: string | null; group_name: string | null; group_kind: "local" | "reusable" | null; reusable_group_id: string | null }> }) =>
      api.testSteps.update(id, input)
  });
  const reorderStepsMutation = useMutation({
    mutationFn: ({ testCaseId, stepIds }: { testCaseId: string; stepIds: string[] }) =>
      api.testSteps.reorder(testCaseId, stepIds)
  });
  const deleteStepMutation = useMutation({ mutationFn: api.testSteps.delete });
  const createExecutionMutation = useMutation({ mutationFn: api.executions.create });

  const projects = projectsQuery.data || [];
  const users = (usersQuery.data || []) as User[];
  const projectMembers = (projectMembersQuery.data || []) as ProjectMember[];
  const appTypes = appTypesQuery.data || [];
  const requirements = requirementsQuery.data || [];
  const suites = suitesQuery.data || [];
  const allTestCases = testCasesQuery.data || [];
  const testCaseModules = testCaseModulesQuery.data || [];
  const executionResults = executionResultsQuery.data || [];
  const allTestSteps = selectedSuiteStepsQuery.data || [];
  const suiteMappings = suiteMappingsQuery.data || [];
  const steps = stepsQuery.data || [];
  const assigneeOptions = useMemo<SuiteExecutionAssigneeOption[]>(
    () => buildAssigneeOptions(projectMembers, users),
    [projectMembers, users]
  );

  const showSuccess = (text: string) => {
    setMessageTone("success");
    setMessage(text);
  };

  const showError = (error: unknown, fallback: string) => {
    setMessageTone("error");
    setMessage(error instanceof Error ? error.message : fallback);
  };

  const openCreateSuiteModal = () => {
    if (!canCreateSuites) return;
    setSuiteModalMode("create");
    setIsSuiteModalOpen(true);
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
    resetExecutionContextSelection();
    setExecutionStartMode("manual");
    setExecutionParallelEnabled(false);
    setExecutionParallelCount(1);
    setExecutionHookDraft([]);
  };

  const [caseDraft, setCaseDraft] = useState<CaseDraft>(() => createEmptyCaseDraft());
  const [newStepDraft, setNewStepDraft] = useState(EMPTY_STEP_DRAFT);
  const [isStepCreateVisible, setIsStepCreateVisible] = useState(false);
  const [draftSteps, setDraftSteps] = useState<DraftTestStep[]>([]);
  const [stepDrafts, setStepDrafts] = useState<Record<string, StepDraft>>({});

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

  const appTypeCases = useMemo(() => allTestCases, [allTestCases]);

  const existingSuiteLabels = useMemo(() => {
    const labels = new Map<string, string>();
    [...allTestCases.flatMap((testCase) => testCase.labels || []), ...suites.flatMap((suite) => suite.labels || [])].forEach((label) => {
      const normalizedLabel = String(label || "").trim();
      if (normalizedLabel && !labels.has(normalizedLabel.toLowerCase())) {
        labels.set(normalizedLabel.toLowerCase(), normalizedLabel);
      }
    });
    return Array.from(labels.values()).sort((left, right) => left.localeCompare(right));
  }, [allTestCases, suites]);

  const suitePickerModuleLabelByCaseId = useMemo(() => {
    const map: Record<string, string> = {};
    testCaseModules.forEach((module) => {
      (module.test_case_ids || []).forEach((testCaseId) => {
        map[testCaseId] = module.name;
      });
    });
    return map;
  }, [testCaseModules]);

  const suiteCounts = useMemo(() => {
    const counts: Record<string, number> = {};

    appTypeCases.forEach((testCase) => {
      (testCase.suite_ids || []).forEach((suiteId) => {
        counts[suiteId] = (counts[suiteId] || 0) + 1;
      });
    });

    return counts;
  }, [appTypeCases]);
  const requirementTitleById = useMemo(
    () =>
      requirements.reduce<Record<string, string>>((map, requirement) => {
        map[requirement.id] = requirement.title;
        return map;
      }, {}),
    [requirements]
  );
  const filteredSuites = useMemo(() => {
    const normalizedSearch = suiteSearchTerm.trim().toLowerCase();

    return suites.filter((suite) => {
      const mappedCaseCount = suiteCounts[suite.id] || 0;
      const haystack = `${suite.display_id || ""} ${suite.id} ${suite.name} ${(suite.labels || []).join(" ")}`.toLowerCase();
      const matchesSearch = !normalizedSearch || haystack.includes(normalizedSearch);

      if (!matchesSearch) {
        return false;
      }

      if (suiteMappedCasesFilter === "with-cases" && !mappedCaseCount) {
        return false;
      }

      if (suiteMappedCasesFilter === "empty" && mappedCaseCount) {
        return false;
      }

      return true;
    });
  }, [suiteMappedCasesFilter, suiteCounts, suiteSearchTerm, suites]);

  const orderedSuiteCases = useMemo(() => {
    if (!selectedSuiteId) {
      return [];
    }

    const suiteOrder = new Map(suiteMappings.map((mapping) => [mapping.test_case_id, mapping.sort_order]));

    return appTypeCases
      .filter((testCase) => (testCase.suite_ids || []).includes(selectedSuiteId))
      .slice()
      .sort((left, right) => {
        const leftOrder = suiteOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = suiteOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER;

        if (leftOrder !== rightOrder) {
          return leftOrder - rightOrder;
        }

        return left.title.localeCompare(right.title);
      });
  }, [appTypeCases, selectedSuiteId, suiteMappings]);

  const selectedProject = projects.find((project) => String(project.id) === String(projectId)) || null;
  const selectedAppType = appTypes.find((appType) => appType.id === appTypeId) || null;
  const sharedGroups = sharedGroupsQuery.data || [];
  const selectedSuite = suites.find((suite) => suite.id === selectedSuiteId) || null;
  const syncSuiteSearchParams = (suiteId?: string | null) => {
    const currentSuiteId = searchParams.get("suite") || "";
    const targetSuiteId = suiteId || "";

    if (currentSuiteId === targetSuiteId) {
      return;
    }

    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (targetSuiteId) {
        next.set("suite", targetSuiteId);
      } else {
        next.delete("suite");
      }
      return next;
    }, { replace: true });
  };

  const openSuiteWorkspace = (suiteId: string) => {
    const targetSuite = suites.find((suite) => suite.id === suiteId) || null;

    syncSuiteSearchParams(getRoutableId(targetSuite) || suiteId);
    setSelectedSuiteId(suiteId);
  };

  const selectedTestCase = appTypeCases.find((testCase) => testCase.id === selectedTestCaseId) || null;
  const selectedSuiteCaseIdSet = useMemo(
    () => new Set(orderedSuiteCases.map((testCase) => testCase.id)),
    [orderedSuiteCases]
  );
  const selectedSuiteParameterDefinitions = useMemo<StepParameterDefinition[]>(() => {
    const parameterMap = new Map<string, StepParameterDefinition>();

    collectStepParameters(
      allTestSteps
        .filter((step) => selectedSuiteCaseIdSet.has(step.test_case_id))
        .map((step) => ({
          id: step.id,
          action: step.action,
          expected_result: step.expected_result,
          automation_code: step.automation_code,
          api_request: step.api_request
        }))
    )
      .filter((parameter) => parameter.scope === "s")
      .forEach((parameter) => {
        parameterMap.set(parameter.name, parameter);
      });

    Object.keys(normalizeSuiteParameterValues(selectedSuite?.parameter_values)).forEach((name) => {
      const parsed = parseStepParameterName(name, "s");

      if (!parsed || parameterMap.has(parsed.name)) {
        return;
      }

      parameterMap.set(parsed.name, {
        name: parsed.name,
        rawName: parsed.rawName,
        label: parsed.rawName,
        token: parsed.token,
        scope: parsed.scope,
        scopeLabel: parsed.scopeLabel,
        stepIds: [],
        occurrenceCount: 0
      });
    });

    return [...parameterMap.values()].sort((left, right) => left.label.localeCompare(right.label));
  }, [allTestSteps, selectedSuite?.parameter_values, selectedSuiteCaseIdSet]);
  const sortedSteps = useMemo(
    () => [...steps].sort((left, right) => left.step_order - right.step_order),
    [steps]
  );
  const displaySteps = useMemo(
    () =>
      isCreatingCase
        ? draftSteps.map((step, index) => ({
            id: step.id,
            test_case_id: selectedTestCaseId || "draft",
            step_order: index + 1,
            action: step.action,
            expected_result: step.expected_result,
            group_id: step.group_id,
            group_name: step.group_name,
            group_kind: step.group_kind,
            reusable_group_id: step.reusable_group_id
          }))
        : sortedSteps,
    [draftSteps, isCreatingCase, selectedTestCaseId, sortedSteps]
  );
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
  const historyBySuiteId = useMemo(() => {
    const map: Record<string, Record<string, { execution_id: string; status: ExecutionResult["status"]; created_at?: string }>> = {};

    executionResults.forEach((result) => {
      if (!result.suite_id) {
        return;
      }

      map[result.suite_id] = map[result.suite_id] || {};
      const current = map[result.suite_id][result.execution_id];

      map[result.suite_id][result.execution_id] = {
        execution_id: result.execution_id,
        status: aggregateExecutionResultStatus(current?.status, result.status),
        created_at:
          String(result.created_at || "") > String(current?.created_at || "")
            ? result.created_at
            : current?.created_at || result.created_at
      };
    });

    return Object.fromEntries(
      Object.entries(map).map(([suiteId, resultsByExecution]) => [
        suiteId,
        Object.values(resultsByExecution).sort((left, right) => String(right.created_at || "").localeCompare(String(left.created_at || "")))
      ])
    ) as Record<string, Array<{ execution_id: string; status: ExecutionResult["status"]; created_at?: string }>>;
  }, [executionResults]);
  const stepCountByCaseId = useMemo(() => {
    return Object.fromEntries(appTypeCases.map((testCase) => [testCase.id, Number(testCase.step_count || 0)]));
  }, [appTypeCases]);
  const caseStatusOptions = useMemo(
    () =>
      Array.from(
        new Set(
          appTypeCases.map((testCase) => {
            const history = historyByCaseId[testCase.id] || [];
            return history[0]?.status || testCase.status || defaultCaseStatus;
          })
        )
      ).sort((left, right) => left.localeCompare(right)),
    [appTypeCases, historyByCaseId]
  );
  const casePriorityOptions = useMemo(
    () => Array.from(new Set(appTypeCases.map((testCase) => String(testCase.priority || 3)))).sort((left, right) => Number(left) - Number(right)),
    [appTypeCases]
  );
  const filteredCases = useMemo(() => {
    const suiteOrder = new Map(suiteMappings.map((mapping) => [mapping.test_case_id, mapping.sort_order]));
    const sourceCases = selectedSuiteId
      ? appTypeCases
          .filter((testCase) => (testCase.suite_ids || []).includes(selectedSuiteId))
          .slice()
          .sort((left, right) => {
            const leftOrder = suiteOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER;
            const rightOrder = suiteOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER;

            if (leftOrder !== rightOrder) {
              return leftOrder - rightOrder;
            }

            return left.title.localeCompare(right.title);
          })
      : appTypeCases;

    const normalizedSearch = searchTerm.trim().toLowerCase();

    return sourceCases.filter((testCase) => {
      if (selectedSuiteId && !(testCase.suite_ids || []).includes(selectedSuiteId)) {
        return false;
      }

      const requirementTitle =
        (testCase.requirement_ids || [testCase.requirement_id]).map((id) => (id ? requirementTitleById[id] || "" : "")).find(Boolean) || "";
      const history = historyByCaseId[testCase.id] || [];
      const latest = history[0];
      const caseStatusValue = latest?.status || testCase.status || defaultCaseStatus;
      const stepCount = stepCountByCaseId[testCase.id] || 0;
      const runCount = history.length;
      const matchesSearch =
        !normalizedSearch ||
        [
          testCase.display_id || "",
          testCase.id,
          testCase.title,
          testCase.description || "",
          requirementTitle,
          ...(testCase.requirement_ids || []),
          testCase.requirement_id || "",
          ...(testCase.suite_ids || []),
          selectedSuiteId || ""
        ].join(" ").toLowerCase().includes(normalizedSearch);

      if (!matchesSearch) {
        return false;
      }

      if (statusFilter !== "all" && caseStatusValue !== statusFilter) {
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
  }, [
    appTypeCases,
    casePriorityFilter,
    caseRunFilter,
    caseStepFilter,
    historyByCaseId,
    requirementTitleById,
    searchTerm,
    selectedSuiteId,
    statusFilter,
    stepCountByCaseId,
    suiteMappings
  ]);
  const selectedHistory = selectedTestCase ? historyByCaseId[selectedTestCase.id] || [] : [];
  const executionTargetSuiteIds = useMemo(
    () => selectedSuiteActionIds,
    [selectedSuiteActionIds]
  );
  const areAllFilteredSuitesSelected = Boolean(filteredSuites.length) && filteredSuites.every((suite) => selectedSuiteActionIds.includes(suite.id));
  const activeSuiteFilterCount = Number(suiteMappedCasesFilter !== "all");
  const activeCaseFilterCount =
    Number(statusFilter !== "all") +
    Number(casePriorityFilter !== "all") +
    Number(caseStepFilter !== "all") +
    Number(caseRunFilter !== "all");
  const suiteParameterDialogHeaderContent = selectedSuite ? (
    <div className="step-parameter-dialog-context">
      <div className="step-parameter-dialog-context-card">
        <strong>Suite scope</strong>
        <span>{selectedSuite.name} · {orderedSuiteCases.length} linked case{orderedSuiteCases.length === 1 ? "" : "s"} in this suite context.</span>
      </div>
      <div className="step-parameter-dialog-context-card">
        <strong>Scope guide</strong>
        <span>`@s` values are saved on this suite and reused by any linked case in the suite that references them.</span>
      </div>
    </div>
  ) : null;

  useEffect(() => {
    if (suitesQuery.isLoading || suitesQuery.isFetching) {
      return;
    }

    const requestedSuiteId = searchParams.get("suite");
    const requestedSuite = findByRoutableId(suites, requestedSuiteId);

    if (requestedSuite) {
      if (selectedSuiteId !== requestedSuite.id) {
        setSelectedSuiteId(requestedSuite.id);
      }
      return;
    }

    if (requestedSuiteId) {
      if (selectedSuiteId === requestedSuiteId) {
        return;
      }

      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete("suite");
        return next;
      }, { replace: true });
    }

    if (selectedSuiteId && !suites.some((suite) => suite.id === selectedSuiteId)) {
      setSelectedSuiteId("");
      setSelectedTestCaseId("");
      setIsCreatingCase(false);
      setIsTestCaseEditorModalOpen(false);
    }
  }, [searchParams, selectedSuiteId, setSearchParams, suites, suitesQuery.isFetching, suitesQuery.isLoading]);

  useEffect(() => {
    setSelectedSuiteActionIds((current) => current.filter((suiteId) => suites.some((suite) => suite.id === suiteId)));
  }, [suites]);

  useEffect(() => {
    setSelectedTestCaseId("");
    setIsCreatingCase(false);
    setIsTestCaseEditorModalOpen(false);
    setIsSuiteParameterDialogOpen(false);
    setDraftSteps([]);
    setExpandedSections(createDefaultSuiteCaseSections());
    setExpandedStepIds([]);
    setNewStepDraft(EMPTY_STEP_DRAFT);
  }, [selectedSuiteId]);

  useEffect(() => {
    setSuiteParameterValues(normalizeSuiteParameterValues(selectedSuite?.parameter_values));
  }, [selectedSuite?.id, selectedSuite?.parameter_values]);

  useEffect(() => {
    setSuiteParameterValues((current) => {
      const next = filterStepParameterValuesByScope(
        filterStepParameterValues(current, selectedSuiteParameterDefinitions),
        "s"
      );
      const currentKeys = Object.keys(current);
      const nextKeys = Object.keys(next);

      if (currentKeys.length === nextKeys.length && currentKeys.every((key) => current[key] === next[key])) {
        return current;
      }

      return next;
    });
  }, [selectedSuiteParameterDefinitions]);

  useEffect(() => {
    setExpandedSections(createDefaultSuiteCaseSections());
    setNewStepDraft(EMPTY_STEP_DRAFT);

    if (isCreatingCase) {
      setExpandedStepIds([]);
      return;
    }

    setExpandedStepIds([]);
  }, [isCreatingCase, selectedTestCaseId]);

  useEffect(() => {
    if (!isCreatingCase) {
      return;
    }

    setExpandedStepIds((current) => current.filter((id) => draftSteps.some((step) => step.id === id)));
  }, [draftSteps, isCreatingCase]);

  useEffect(() => {
    if (isCreatingCase) {
      return;
    }

    setExpandedStepIds((current) => {
      const validIds = current.filter((id) => sortedSteps.some((step) => step.id === id));

      if (!validIds.length && sortedSteps.length) {
        return sortedSteps.map((step) => step.id);
      }

      return validIds;
    });
  }, [isCreatingCase, sortedSteps]);

  useEffect(() => {
    setIsStepCreateVisible(false);
  }, [isCreatingCase, selectedTestCaseId]);

  useEffect(() => {
    if (isCreatingCase || !selectedTestCase) {
      setCaseDraft({
        ...emptyCaseDraft,
        suite_id: selectedSuiteId || ""
      });
      return;
    }

    setCaseDraft({
      suite_id: selectedTestCase.suite_ids?.[0] || selectedTestCase.suite_id || "",
      title: selectedTestCase.title,
      description: selectedTestCase.description || "",
      automated: (selectedTestCase.automated || defaultCaseAutomated) as "yes" | "no",
      priority: String(selectedTestCase.priority ?? 3),
      status: selectedTestCase.status || defaultCaseStatus,
      requirement_id: selectedTestCase.requirement_id || ""
    });
  }, [defaultCaseAutomated, defaultCaseStatus, emptyCaseDraft, isCreatingCase, selectedSuiteId, selectedTestCase, suites]);

  useEffect(() => {
    const drafts: Record<string, StepDraft> = {};
    sortedSteps.forEach((step) => {
      drafts[step.id] = {
        action: step.action || "",
        expected_result: step.expected_result || ""
      };
    });
    setStepDrafts(drafts);
  }, [sortedSteps]);

  useEffect(() => {
    if (!selectedSuite || updateSuiteMutation.isPending) {
      return;
    }

    const normalizedCurrentValues = normalizeSuiteParameterValues(suiteParameterValues);
    const normalizedSavedValues = normalizeSuiteParameterValues(selectedSuite.parameter_values);

    if (areSuiteParameterValuesEqual(normalizedCurrentValues, normalizedSavedValues)) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      updateSuiteMutation.mutate(
        {
          id: selectedSuite.id,
          input: {
            parameter_values: normalizedCurrentValues
          }
        },
        {
          onSuccess: () => {
            updateSuitesCache((current) =>
              current.map((suite) =>
                suite.id === selectedSuite.id
                  ? {
                      ...suite,
                      parameter_values: normalizedCurrentValues
                    }
                  : suite
              )
            );
          },
          onError: (error) => {
            showError(error, "Unable to update suite test data");
          }
        }
      );
    }, 450);

    return () => window.clearTimeout(timeoutId);
  }, [selectedSuite, suiteParameterValues, updateSuiteMutation, updateSuiteMutation.isPending]);

  const updateCasesCache = (updater: (current: TestCase[]) => TestCase[]) => {
    queryClient.setQueryData<TestCase[]>(["design-test-cases", appTypeId], (current = []) => updater(current));
    queryClient.setQueryData<TestCase[]>(["global-test-cases", appTypeId], (current = []) => updater(current));
    queryClient.setQueryData<TestCase[]>(["test-cases"], (current = []) => updater(current));
  };

  const updateSuitesCache = (updater: (current: TestSuite[]) => TestSuite[]) => {
    queryClient.setQueryData<TestSuite[]>(["design-suites", appTypeId], (current = []) => updater(current));
    queryClient.setQueryData<TestSuite[]>(["test-case-suites", appTypeId], (current = []) => updater(current));
    queryClient.setQueryData<TestSuite[]>(["test-suites"], (current = []) => updater(current));
  };

  const updateStepsCache = (testCaseId: string, updater: (current: TestStep[]) => TestStep[]) => {
    queryClient.setQueryData<TestStep[]>(["design-test-steps", testCaseId], (current = []) => updater(current));
    queryClient.setQueryData<TestStep[]>(["test-steps"], (current = []) => updater(current));
  };

  const refreshSuites = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["design-suites", appTypeId] }),
      queryClient.invalidateQueries({ queryKey: ["requirements", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["test-suites"] }),
      queryClient.invalidateQueries({ queryKey: ["design-test-cases", appTypeId] }),
      queryClient.invalidateQueries({ queryKey: ["suite-test-case-mappings"] }),
      queryClient.invalidateQueries({ queryKey: ["test-cases"] }),
      queryClient.invalidateQueries({ queryKey: ["global-test-cases", appTypeId] }),
      queryClient.invalidateQueries({ queryKey: ["global-test-case-results", appTypeId] }),
      queryClient.invalidateQueries({ queryKey: ["design-case-results", appTypeId] }),
      queryClient.invalidateQueries({ queryKey: ["design-suite-test-steps"] })
    ]);
  };

  const closeTestCaseEditorModal = () => {
    setIsTestCaseEditorModalOpen(false);
    setExpandedSections(createDefaultSuiteCaseSections());
    setExpandedStepIds([]);
    setNewStepDraft(EMPTY_STEP_DRAFT);

    if (isCreatingCase) {
      setIsCreatingCase(false);
      setDraftSteps([]);
      setCaseDraft({
        ...emptyCaseDraft,
        suite_id: selectedSuiteId || ""
      });
    }
  };

  const beginCreateCase = () => {
    if (!selectedSuiteId) {
      setMessageTone("error");
      setMessage("Select a suite first before creating a test case.");
      return;
    }

    const params = new URLSearchParams();

    if (projectId) {
      params.set("project", projectId);
    }
    if (appTypeId) {
      params.set("appType", appTypeId);
    }
    params.set("create", "1");
    params.set("suite", selectedSuiteId);

    navigate(`/test-cases?${params.toString()}`);
  };

  const openSelectedCaseEditor = (testCaseId?: string) => {
    const targetTestCase = testCaseId
      ? appTypeCases.find((testCase) => testCase.id === testCaseId)
      : selectedTestCase;

    if (!targetTestCase && !isCreatingCase) {
      return;
    }

    if (testCaseId) {
      setSelectedTestCaseId(testCaseId);
    }
    setIsCreatingCase(false);
    setIsTestCaseEditorModalOpen(true);
  };

  const handleSuiteSave = async (input: { name: string; labels: string[]; selectedIds: string[]; parallel_enabled?: boolean; parallel_count?: number }) => {
    if ((suiteModalMode === "create" && !canCreateSuites) || (suiteModalMode === "edit" && !canUpdateSuites)) {
      showError(new Error("Your Qaira role cannot save test suites."), "Unable to save suite");
      return;
    }
    try {
      let suiteId = selectedSuiteId;
      let membershipExpectedRevision: number | undefined;

      if (suiteModalMode === "create") {
        const response = await createSuiteMutation.mutateAsync({
          app_type_id: appTypeId,
          name: input.name,
          labels: input.labels,
          parallel_enabled: canConfigureParallelAutomation ? input.parallel_enabled : false,
          parallel_count: canConfigureParallelAutomation && input.parallel_enabled ? input.parallel_count : 1
        });
        suiteId = response.id;
      } else if (selectedSuite) {
        const response = await updateSuiteMutation.mutateAsync({
          id: selectedSuite.id,
          input: {
            name: input.name,
            labels: input.labels,
            ...(canConfigureParallelAutomation ? {
              parallel_enabled: input.parallel_enabled,
              parallel_count: input.parallel_enabled ? input.parallel_count : 1
            } : {})
          }
        });
        membershipExpectedRevision = response.revision;
      }

      if (suiteId && (suiteModalMode === "edit" || input.selectedIds.length)) {
        await assignSuiteCasesMutation.mutateAsync({
          id: suiteId,
          testCaseIds: input.selectedIds,
          expectedRevision: membershipExpectedRevision,
          append: false
        });
      }

      if (suiteId) {
        syncSuiteSearchParams(suiteId);
      }
      setSelectedSuiteId(suiteId);
      setIsSuiteModalOpen(false);
      showSuccess(suiteModalMode === "create" ? "Suite created." : "Suite updated.");
      await refreshSuites();
    } catch (error) {
      showError(error, "Unable to save suite");
    }
  };

  const handleSaveTestCase = async () => {
    const suiteId = caseDraft.suite_id || selectedSuiteId;

    if (!suiteId) {
      setMessageTone("error");
      setMessage("Create a suite first before saving test cases.");
      return;
    }

    try {
      if (isCreatingCase || !selectedTestCase) {
        const response = await createTestCaseMutation.mutateAsync({
          app_type_id: appTypeId,
          suite_ids: [suiteId],
          title: caseDraft.title,
          description: caseDraft.description || undefined,
          automated: caseDraft.automated,
          priority: Number(caseDraft.priority || 3),
          status: caseDraft.status || defaultCaseStatus,
          requirement_id: caseDraft.requirement_id || undefined,
          requirement_ids: caseDraft.requirement_id ? [caseDraft.requirement_id] : [],
          steps: normalizeDraftSteps(draftSteps)
        });

        const optimisticCase: TestCase = {
          id: response.id,
          suite_id: suiteId,
          suite_ids: [suiteId],
          title: caseDraft.title,
          description: caseDraft.description || null,
          automated: caseDraft.automated,
          priority: Number(caseDraft.priority || 3),
          status: caseDraft.status || defaultCaseStatus,
          requirement_id: caseDraft.requirement_id || null
        };

        updateCasesCache((current) => [optimisticCase, ...current]);
        syncSuiteSearchParams(suiteId);
        setSelectedSuiteId(suiteId);
        setSelectedTestCaseId(response.id);
        setIsCreatingCase(false);
        setDraftSteps([]);
        showSuccess("Test case created.");
      } else {
        await updateTestCaseMutation.mutateAsync({
          id: selectedTestCase.id,
          input: {
            app_type_id: appTypeId,
            suite_ids: selectedTestCase.suite_ids?.length
              ? [suiteId, ...selectedTestCase.suite_ids.filter((id) => id !== suiteId)]
              : [suiteId],
            title: caseDraft.title,
            description: caseDraft.description,
            automated: caseDraft.automated,
            priority: Number(caseDraft.priority || 3),
            status: caseDraft.status,
            requirement_id: caseDraft.requirement_id || undefined
          }
        });

        updateCasesCache((current) =>
          current.map((testCase) =>
            testCase.id === selectedTestCase.id
              ? {
                ...testCase,
                  suite_id: suiteId,
                  suite_ids: testCase.suite_ids?.length
                    ? [suiteId, ...testCase.suite_ids.filter((id) => id !== suiteId)]
                    : [suiteId],
                  title: caseDraft.title,
                  description: caseDraft.description || null,
                  automated: caseDraft.automated,
                  priority: Number(caseDraft.priority || 3),
                  status: caseDraft.status,
                  requirement_id: caseDraft.requirement_id || null
                }
              : testCase
          )
        );

        showSuccess("Test case updated.");
      }

      await refreshSuites();
    } catch (error) {
      showError(error, "Unable to save test case");
    }
  };

  const closeSuiteWorkspace = () => {
    syncSuiteSearchParams(null);
    setSelectedSuiteId("");
    setSelectedTestCaseId("");
    setIsCreatingCase(false);
    setIsTestCaseEditorModalOpen(false);
    setDraftSteps([]);
    setExpandedSections(createDefaultSuiteCaseSections());
    setExpandedStepIds([]);
    setNewStepDraft(EMPTY_STEP_DRAFT);
  };

  const handleDeleteSelectedSuites = async () => {
    if (!canDeleteSuites) return;
    const selectedSuites = suites.filter((suite) => selectedSuiteActionIds.includes(suite.id));

    if (!selectedSuites.length) {
      return;
    }

    const confirmed = await confirmDelete({
      message: `Delete ${selectedSuites.length} suite${selectedSuites.length === 1 ? "" : "s"}? Linked test cases will be kept, but their suite mappings will be removed.`
    });

    if (!confirmed) {
      return;
    }

    setIsDeletingSelectedSuites(true);

    try {
      const results = await Promise.allSettled(selectedSuites.map((suite) => api.testSuites.delete(suite.id)));
      const deletedIds = selectedSuites
        .filter((_, index) => results[index]?.status === "fulfilled")
        .map((suite) => suite.id);
      const failedResults = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");

      setSelectedSuiteActionIds((current) => current.filter((id) => !deletedIds.includes(id)));

      if (deletedIds.includes(selectedSuiteId)) {
        syncSuiteSearchParams(null);
        setSelectedSuiteId("");
        setSelectedTestCaseId("");
        setIsCreatingCase(false);
        setIsTestCaseEditorModalOpen(false);
      }

      if (deletedIds.length) {
        await refreshSuites();
      }

      if (!failedResults.length) {
        showSuccess(`${deletedIds.length} suite${deletedIds.length === 1 ? "" : "s"} deleted. Linked test cases remain reusable.`);
        return;
      }

      const firstError = failedResults[0]?.reason;
      const detail = firstError instanceof Error ? ` ${firstError.message}` : "";

      if (deletedIds.length) {
        setMessageTone("error");
        setMessage(`${deletedIds.length} suite${deletedIds.length === 1 ? "" : "s"} deleted, but ${failedResults.length} failed.${detail}`);
        return;
      }

      showError(firstError, "Unable to delete selected suites");
    } finally {
      setIsDeletingSelectedSuites(false);
    }
  };

  const handleCreateExecution = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!session?.user.id) {
      setMessageTone("error");
      setMessage("You need an active session before creating a run.");
      return;
    }

    if (!projectId || !appTypeId || !executionTargetSuiteIds.length) {
      setMessageTone("error");
      setMessage("Select at least one suite in the current scope before creating a run.");
      return;
    }

    try {
      const response = await createExecutionMutation.mutateAsync({
        project_id: projectId,
        app_type_id: appTypeId,
        suite_ids: executionTargetSuiteIds,
        test_environment_id: selectedExecutionEnvironmentId || undefined,
        test_configuration_id: selectedExecutionConfigurationId || undefined,
        test_data_set_id: selectedExecutionDataSetId || undefined,
        execution_mode: executionStartMode === "local" && canRunLocalAutomation
          ? "local"
          : executionStartMode === "remote" && canRunRemoteAutomation ? "remote" : "manual",
        engine_base_url: executionStartMode === "local" && canRunLocalAutomation ? "http://host.docker.internal:4301" : undefined,
        parallel_enabled: canConfigureParallelAutomation && executionParallelEnabled || undefined,
        parallel_count: canConfigureParallelAutomation && executionParallelEnabled ? executionParallelCount : undefined,
        execution_hooks: executionHookDraft.length ? executionHookDraft : undefined,
        assigned_to_ids: selectedExecutionAssigneeIds.length ? selectedExecutionAssigneeIds : undefined,
        release: executionRelease.trim() || undefined,
        sprint: executionSprint.trim() || undefined,
        build: executionBuild.trim() || undefined,
        name: executionName.trim() || undefined,
        created_by: session.user.id
      });

      closeCreateExecutionModal();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["executions"] }),
        queryClient.invalidateQueries({ queryKey: ["executions", projectId] })
      ]);
      navigate(`/executions?view=suite-runs&execution=${response.id}`);
    } catch (error) {
      showError(error, "Unable to create run");
    }
  };

  const handleDeleteTestCase = async () => {
    if (!selectedTestCase || !(await confirmDelete({ message: `Delete test case "${selectedTestCase.title}"? This will remove its steps and mappings.` }))) {
      return;
    }

    try {
      await deleteTestCaseMutation.mutateAsync(selectedTestCase.id);
      updateCasesCache((current) => current.filter((testCase) => testCase.id !== selectedTestCase.id));
      queryClient.removeQueries({ queryKey: ["design-test-steps", selectedTestCase.id] });
      setSelectedTestCaseId("");
      setIsCreatingCase(false);
      setIsTestCaseEditorModalOpen(false);
      setDraftSteps([]);
      setExpandedStepIds([]);
      showSuccess("Test case deleted.");
      await refreshSuites();
    } catch (error) {
      showError(error, "Unable to delete test case");
    }
  };

  const handleCreateStep = async () => {
    const normalizedDraft = {
      action: newStepDraft.action.trim(),
      expected_result: newStepDraft.expected_result.trim()
    };

    if (!normalizedDraft.action && !normalizedDraft.expected_result) {
      setMessageTone("error");
      setMessage("Add an action or expected result before creating a step.");
      return;
    }

    if (isCreatingCase) {
      const draftId = createDraftStepId();
      setDraftSteps((current) => [...current, {
        id: draftId,
        ...normalizedDraft,
        group_id: null,
        group_name: null,
        group_kind: null,
        reusable_group_id: null
      }]);
      setExpandedStepIds((current) => [...new Set([...current, draftId])]);
      setNewStepDraft(EMPTY_STEP_DRAFT);
      setIsStepCreateVisible(false);
      showSuccess("Draft step added to the new test case.");
      return;
    }

    if (!selectedTestCase) {
      setMessageTone("error");
      setMessage("Select a test case before adding steps.");
      return;
    }

    try {
      const nextStepOrder = (sortedSteps[sortedSteps.length - 1]?.step_order || 0) + 1;
      const response = await createStepMutation.mutateAsync({
        test_case_id: selectedTestCase.id,
        step_order: nextStepOrder,
        action: normalizedDraft.action,
        expected_result: normalizedDraft.expected_result
      });

      const optimisticStep: TestStep = {
        id: response.id,
        test_case_id: selectedTestCase.id,
        step_order: nextStepOrder,
        action: normalizedDraft.action || null,
        expected_result: normalizedDraft.expected_result || null,
        group_id: null,
        group_name: null,
        group_kind: null,
        reusable_group_id: null
      };

      updateStepsCache(selectedTestCase.id, (current) => [...current, optimisticStep]);
      setNewStepDraft(EMPTY_STEP_DRAFT);
      setIsStepCreateVisible(false);
      setExpandedStepIds((current) => [...new Set([...current, response.id])]);
      showSuccess("Step added.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["design-suite-test-steps"] }),
        queryClient.invalidateQueries({ queryKey: ["design-test-cases", appTypeId] })
      ]);
    } catch (error) {
      showError(error, "Unable to add step");
    }
  };

  const handleUpdateStep = async (stepId: string, draftOverride?: StepDraft) => {
    const draft = draftOverride || stepDrafts[stepId];
    const step = sortedSteps.find((item) => item.id === stepId);

    if (!draft || !step) {
      return;
    }

    try {
      await updateStepMutation.mutateAsync({
        id: stepId,
        input: {
          test_case_id: step.test_case_id,
          step_order: step.step_order,
          action: draft.action,
          expected_result: draft.expected_result,
          group_id: step.group_id || null,
          group_name: step.group_name || null,
          group_kind: step.group_kind || null,
          reusable_group_id: step.reusable_group_id || null
        }
      });

      updateStepsCache(step.test_case_id, (current) =>
        current.map((item) =>
          item.id === stepId
            ? {
                ...item,
                step_order: step.step_order,
                action: draft.action || null,
                expected_result: draft.expected_result || null,
                group_id: step.group_id || null,
                group_name: step.group_name || null,
                group_kind: step.group_kind || null,
                reusable_group_id: step.reusable_group_id || null
              }
            : item
        )
      );

      showSuccess("Step updated.");
      await queryClient.invalidateQueries({ queryKey: ["design-suite-test-steps"] });
    } catch (error) {
      showError(error, "Unable to update step");
    }
  };

  const handleDeleteStep = async (stepId: string) => {
    if (isCreatingCase) {
      setDraftSteps((current) => current.filter((step) => step.id !== stepId));
      setExpandedStepIds((current) => current.filter((id) => id !== stepId));
      showSuccess("Draft step removed.");
      return;
    }

    if (!selectedTestCase) {
      return;
    }

    if (!(await confirmDelete({ message: "Delete this step?" }))) {
      return;
    }

    try {
      await deleteStepMutation.mutateAsync(stepId);
      updateStepsCache(selectedTestCase.id, (current) =>
        current
          .filter((step) => step.id !== stepId)
          .map((step, index) => ({ ...step, step_order: index + 1 }))
      );
      setExpandedStepIds((current) => current.filter((id) => id !== stepId));
      showSuccess("Step deleted.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["design-suite-test-steps"] }),
        queryClient.invalidateQueries({ queryKey: ["design-test-cases", appTypeId] })
      ]);
    } catch (error) {
      showError(error, "Unable to delete step");
    }
  };

  const handleReorderStep = async (stepId: string, direction: "up" | "down") => {
    if (!selectedTestCase) {
      return;
    }

    const currentIndex = sortedSteps.findIndex((step) => step.id === stepId);
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

    if (currentIndex === -1 || targetIndex < 0 || targetIndex >= sortedSteps.length) {
      return;
    }

    const reordered = [...sortedSteps];
    const [movedStep] = reordered.splice(currentIndex, 1);
    reordered.splice(targetIndex, 0, movedStep);

    const normalized = reordered.map((step, index) => ({
      ...step,
      step_order: index + 1
    }));

    try {
      await reorderStepsMutation.mutateAsync({
        testCaseId: selectedTestCase.id,
        stepIds: normalized.map((step) => step.id)
      });

      updateStepsCache(selectedTestCase.id, () => normalized);
      setExpandedStepIds((current) => [...new Set([...current, stepId])]);
      showSuccess("Step order updated.");
      await queryClient.invalidateQueries({ queryKey: ["design-suite-test-steps"] });
    } catch (error) {
      showError(error, "Unable to reorder steps");
    }
  };

  const handleUpdateDraftStep = (stepId: string, input: StepDraft) => {
    setDraftSteps((current) =>
      current.map((step) =>
        step.id === stepId
          ? {
              ...step,
              action: input.action,
              expected_result: input.expected_result
            }
          : step
      )
    );
  };

  const handleReorderDraftStep = (stepId: string, direction: "up" | "down") => {
    setDraftSteps((current) => {
      const currentIndex = current.findIndex((step) => step.id === stepId);
      const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

      if (currentIndex === -1 || targetIndex < 0 || targetIndex >= current.length) {
        return current;
      }

      const reordered = [...current];
      const [movedStep] = reordered.splice(currentIndex, 1);
      reordered.splice(targetIndex, 0, movedStep);
      return reordered;
    });
    showSuccess("Draft step order updated.");
  };

  const handleReorderCases = async (fromCaseId: string, toCaseId: string) => {
    if (!selectedSuiteId || fromCaseId === toCaseId) {
      return;
    }

    const reordered = [...orderedSuiteCases];
    const fromIndex = reordered.findIndex((testCase) => testCase.id === fromCaseId);
    const toIndex = reordered.findIndex((testCase) => testCase.id === toCaseId);

    if (fromIndex === -1 || toIndex === -1) {
      return;
    }

    const [movedCase] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, movedCase);

    try {
      await reorderSuiteCasesMutation.mutateAsync({
        suiteId: selectedSuiteId,
        testCaseIds: reordered.map((testCase) => testCase.id)
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["design-test-cases", appTypeId] }),
        queryClient.invalidateQueries({ queryKey: ["suite-test-case-mappings", selectedSuiteId] })
      ]);
      showSuccess("Test case order updated.");
    } catch (error) {
      showError(error, "Unable to reorder test cases");
    }
  };

  const handleUnlinkSuiteCases = async (testCaseIds: string[]) => {
    if (!selectedSuiteId || !selectedSuite || !canUpdateSuites || !testCaseIds.length) {
      return false;
    }

    const selectedIds = new Set(testCaseIds);
    const linkedCases = orderedSuiteCases.filter((testCase) => selectedIds.has(testCase.id));
    if (!linkedCases.length) {
      return false;
    }

    const confirmed = await confirmAction({
      title: "Remove cases from suite",
      message: `Remove ${linkedCases.length} test case${linkedCases.length === 1 ? "" : "s"} from \"${selectedSuite.name}\"? The cases remain reusable and are not deleted.`,
      confirmLabel: linkedCases.length === 1 ? "Remove case" : "Remove cases"
    });

    if (!confirmed) {
      return false;
    }

    try {
      const remainingIds = orderedSuiteCases
        .filter((testCase) => !selectedIds.has(testCase.id))
        .map((testCase) => testCase.id);
      await assignSuiteCasesMutation.mutateAsync({
        id: selectedSuiteId,
        testCaseIds: remainingIds,
        expectedRevision: selectedSuite.revision,
        append: false
      });
      updateCasesCache((current) => current.map((testCase) => (
        selectedIds.has(testCase.id)
          ? {
              ...testCase,
              suite_id: testCase.suite_id === selectedSuiteId ? null : testCase.suite_id,
              suite_ids: (testCase.suite_ids || []).filter((suiteId) => suiteId !== selectedSuiteId)
            }
          : testCase
      )));
      if (selectedIds.has(selectedTestCaseId)) {
        setSelectedTestCaseId("");
      }
      await refreshSuites();
      showSuccess(`${linkedCases.length} test case${linkedCases.length === 1 ? "" : "s"} removed from ${selectedSuite.name}.`);
      return true;
    } catch (error) {
      showError(error, "Unable to remove test cases from suite");
      return false;
    }
  };

  const isDesignLoading =
    projectsQuery.isLoading ||
    appTypesQuery.isLoading ||
    suitesQuery.isLoading ||
    testCasesQuery.isLoading ||
    executionResultsQuery.isLoading ||
    (Boolean(selectedSuiteId && selectedSuiteCaseIds.length) && selectedSuiteStepsQuery.isLoading) ||
    (Boolean(selectedSuiteId) && suiteMappingsQuery.isLoading);
  const designMetrics = useMemo(() => {
    const casesWithRequirements = appTypeCases.filter((testCase) => testCase.requirement_id || testCase.requirement_ids?.length).length;
    const casesWithHistory = appTypeCases.filter((testCase) => (historyByCaseId[testCase.id] || []).length > 0).length;
    const totalSteps = appTypeCases.reduce((total, testCase) => total + (stepCountByCaseId[testCase.id] || 0), 0);

    return {
      totalSuites: suites.length,
      totalCases: appTypeCases.length,
      casesWithRequirements,
      casesWithHistory,
      totalSteps
    };
  }, [appTypeCases, historyByCaseId, stepCountByCaseId, suites.length]);
  const showSuiteTilesHeader = !selectedSuiteId;

  return (
    <div className="page-content page-content--library-full">
      {confirmationDialog}
      {showSuiteTilesHeader ? (
        <PageHeader
          eyebrow="Test Design"
          title="Test Suites"
          description="Shape suite structure, assign reusable cases, and keep executable design tidy enough for fast run handoff."
          meta={[
            { label: "Suites", value: designMetrics.totalSuites },
            { label: "Cases", value: designMetrics.totalCases },
            { label: "Steps", value: designMetrics.totalSteps }
          ]}
        />
      ) : null}

      <ToastMessage message={message} onDismiss={() => setMessage("")} tone={messageTone} />

      <WorkspaceMasterDetail
        browseView={(
          <SuiteSidebar
            suites={filteredSuites}
            activeSuiteId={selectedSuiteId}
            counts={suiteCounts}
            cases={appTypeCases}
            historyBySuiteId={historyBySuiteId}
            stepCountByCaseId={stepCountByCaseId}
            suiteSearchTerm={suiteSearchTerm}
            suiteMappedCasesFilter={suiteMappedCasesFilter}
            activeFilterCount={activeSuiteFilterCount}
            selectedSuiteActionIds={selectedSuiteActionIds}
            areAllVisibleSuitesSelected={areAllFilteredSuitesSelected}
            onSelectSuite={openSuiteWorkspace}
            onSuiteSearchChange={setSuiteSearchTerm}
            onSuiteMappedCasesFilter={setSuiteMappedCasesFilter}
            onToggleSuiteSelection={(suiteId) =>
              setSelectedSuiteActionIds((current) =>
                current.includes(suiteId) ? current.filter((id) => id !== suiteId) : [...new Set([...current, suiteId])]
              )
            }
            onSelectAllVisibleSuites={() =>
              setSelectedSuiteActionIds((current) => [...new Set([...current, ...filteredSuites.map((suite) => suite.id)])])
            }
            onClearSuiteSelection={() => setSelectedSuiteActionIds([])}
            onCreateSuite={openCreateSuiteModal}
            onDeleteSelectedSuites={() => void handleDeleteSelectedSuites()}
            onCreateManualRun={() => {
              setExecutionStartMode("manual");
              setIsCreateExecutionModalOpen(true);
            }}
            onCreateLocalRun={() => {
              setExecutionStartMode("local");
              setIsCreateExecutionModalOpen(true);
            }}
            onCreateRemoteRun={() => {
              setExecutionStartMode("remote");
              setIsCreateExecutionModalOpen(true);
            }}
            isLoading={suitesQuery.isLoading && Boolean(appTypeId)}
            selectedAppType={selectedAppType}
            canCreateSuite={Boolean(appTypeId && canCreateSuites)}
            canDeleteSuites={canDeleteSuites}
            canCreateExecution={Boolean(projectId && appTypeId && suites.length && session?.user.id)}
            isDeletingSelectedSuites={isDeletingSelectedSuites}
            hasSuiteSearchResults={Boolean(filteredSuites.length)}
            hasAnySuites={Boolean(suites.length)}
            viewMode={suiteCatalogViewMode}
            onViewModeChange={setSuiteCatalogViewMode}
          />
        )}
        detailView={(
          <TestCaseList
            actions={
              <>
                <WorkspaceBackButton label="Back to suite tiles" onClick={closeSuiteWorkspace} />
                <button
                  className="ghost-button"
                  disabled={!selectedSuite || !canUpdateSuites}
                  onClick={() => setIsSuiteParameterDialogOpen(true)}
                  type="button"
                >
                  <GridIcon />
                  <span>{selectedSuiteParameterDefinitions.length ? `Suite test data · ${selectedSuiteParameterDefinitions.length}` : "Suite test data"}</span>
                </button>
                <button
                  className="ghost-button"
                  disabled={!selectedSuite}
                  onClick={() => {
                    setSuiteModalMode("edit");
                    setIsSuiteModalOpen(true);
                  }}
                  type="button"
                >
                  Edit Suite
                </button>
              </>
            }
            cases={filteredCases}
            activeCaseId={selectedTestCaseId}
            searchTerm={searchTerm}
            statusFilter={statusFilter}
            casePriorityFilter={casePriorityFilter}
            caseStepFilter={caseStepFilter}
            caseRunFilter={caseRunFilter}
            statusOptions={caseStatusOptions}
            priorityOptions={casePriorityOptions}
            activeFilterCount={activeCaseFilterCount}
            defaultCaseStatus={defaultCaseStatus}
            selectedSuite={selectedSuite}
            isLoading={isDesignLoading}
            historyByCaseId={historyByCaseId}
            requirements={requirements}
            stepCountByCaseId={stepCountByCaseId}
            moduleLabelByCaseId={suitePickerModuleLabelByCaseId}
            onSearch={setSearchTerm}
            onStatusFilter={setStatusFilter}
            onCasePriorityFilter={setCasePriorityFilter}
            onCaseStepFilter={setCaseStepFilter}
            onCaseRunFilter={setCaseRunFilter}
            onSelectCase={(testCaseId) => {
              setSelectedTestCaseId(testCaseId);
              setIsCreatingCase(false);
            }}
            onCreateCase={beginCreateCase}
            onOpenCaseEditor={openSelectedCaseEditor}
            canOpenCaseEditor={Boolean(selectedTestCaseId)}
            canUnlinkCases={canUpdateSuites}
            isUnlinkingCases={assignSuiteCasesMutation.isPending}
            onReorderCases={handleReorderCases}
            onUnlinkCases={handleUnlinkSuiteCases}
            viewMode={suiteCaseCatalogViewMode}
            onViewModeChange={setSuiteCaseCatalogViewMode}
          />
        )}
        isDetailOpen={Boolean(selectedSuiteId)}
      />

      {isTestCaseEditorModalOpen && selectedTestCase ? (
        <LinkedTestCaseModal
          appTypeName={selectedAppType?.name || ""}
          onClose={closeTestCaseEditorModal}
          projectName={selectedProject?.name || ""}
          requirements={requirements}
          selectedSuite={selectedSuite}
          suites={suites}
          testCase={selectedTestCase}
        />
      ) : null}

      {isSuiteParameterDialogOpen && selectedSuite ? (
        <StepParameterDialog
          getInputState={() => ({
            hint: `Saved on suite "${selectedSuite.name}" and reused by any linked case that references the same @s token.`
          })}
          headerContent={suiteParameterDialogHeaderContent}
          onChange={(name, value) =>
            setSuiteParameterValues((current) => ({
              ...current,
              [name]: value
            }))
          }
          onClose={() => setIsSuiteParameterDialogOpen(false)}
          parameters={selectedSuiteParameterDefinitions}
          subtitle="Suite-shared values detected across the cases linked into this suite."
          title={`${selectedSuite.name} test data`}
          values={suiteParameterValues}
        />
      ) : null}

      {isCreateExecutionModalOpen ? (
        <SuiteExecutionModal
          assigneeOptions={assigneeOptions}
          canCreateExecution={Boolean(
            projectId
            && appTypeId
            && executionTargetSuiteIds.length
            && session?.user.id
            && (executionStartMode === "local"
              ? canRunLocalAutomation
              : executionStartMode === "remote" ? canRunRemoteAutomation : canCreateManualRuns)
          )}
          canConfigureParallelAutomation={canConfigureParallelAutomation}
          canRunLocalAutomation={canRunLocalAutomation}
          canRunRemoteAutomation={canRunRemoteAutomation}
          executionHookDraft={executionHookDraft}
          executionName={executionName}
          executionRelease={executionRelease}
          executionSprint={executionSprint}
          executionBuild={executionBuild}
          executionParallelCount={executionParallelCount}
          executionParallelEnabled={executionParallelEnabled}
          executionStartMode={executionStartMode}
          isSubmitting={createExecutionMutation.isPending}
          onAssigneeChange={setSelectedExecutionAssigneeIds}
          onClose={closeCreateExecutionModal}
          onConfigurationChange={setSelectedExecutionConfigurationId}
          onDataSetChange={setSelectedExecutionDataSetId}
          onEnvironmentChange={setSelectedExecutionEnvironmentId}
          onExecutionHookDraftChange={setExecutionHookDraft}
          onExecutionNameChange={setExecutionName}
          onExecutionReleaseChange={setExecutionRelease}
          onExecutionSprintChange={setExecutionSprint}
          onExecutionBuildChange={setExecutionBuild}
          onExecutionParallelCountChange={setExecutionParallelCount}
          onExecutionParallelEnabledChange={setExecutionParallelEnabled}
          onExecutionStartModeChange={setExecutionStartMode}
          onSuiteSelectionChange={setSelectedSuiteActionIds}
          onSubmit={handleCreateExecution}
          appTypeId={appTypeId}
          projectId={projectId}
          selectedAssigneeIds={selectedExecutionAssigneeIds}
          selectedConfigurationId={selectedExecutionConfigurationId}
          selectedAppType={selectedAppType?.name || ""}
          selectedDataSetId={selectedExecutionDataSetId}
          selectedEnvironmentId={selectedExecutionEnvironmentId}
          selectedProject={selectedProject?.name || ""}
          scopeSuites={suites}
          selectedSuiteIds={selectedSuiteActionIds}
          testCases={allTestCases}
        />
      ) : null}

      {isSuiteModalOpen ? (
        <SuiteModal
          key={suiteModalMode === "edit" ? `edit-${selectedSuite?.id || "none"}` : "create-new"}
          mode={suiteModalMode}
          suite={suiteModalMode === "edit" ? selectedSuite : null}
          appTypeCases={allTestCases}
          availableLabels={existingSuiteLabels}
          canConfigureParallelAutomation={canConfigureParallelAutomation}
          moduleLabelByCaseId={suitePickerModuleLabelByCaseId}
          selectedCaseIds={suiteModalMode === "edit" ? orderedSuiteCases.map((testCase) => testCase.id) : []}
          onClose={() => setIsSuiteModalOpen(false)}
          onSubmit={handleSuiteSave}
          isSaving={createSuiteMutation.isPending || updateSuiteMutation.isPending || assignSuiteCasesMutation.isPending}
        />
      ) : null}
    </div>
  );
}

function SuiteSidebar({
  actions,
  suites,
  activeSuiteId,
  counts,
  cases,
  historyBySuiteId,
  stepCountByCaseId,
  suiteSearchTerm,
  suiteMappedCasesFilter,
  activeFilterCount,
  selectedSuiteActionIds,
  areAllVisibleSuitesSelected,
  onSelectSuite,
  onSuiteSearchChange,
  onSuiteMappedCasesFilter,
  onToggleSuiteSelection,
  onSelectAllVisibleSuites,
  onClearSuiteSelection,
  onCreateSuite,
  onDeleteSelectedSuites,
  onCreateManualRun,
  onCreateLocalRun,
  onCreateRemoteRun,
  isLoading,
  selectedAppType,
  canCreateSuite,
  canDeleteSuites,
  canCreateExecution,
  isDeletingSelectedSuites,
  hasSuiteSearchResults,
  hasAnySuites,
  viewMode,
  onViewModeChange
}: {
  actions?: ReactNode;
  suites: TestSuite[];
  activeSuiteId: string;
  counts: Record<string, number>;
  cases: TestCase[];
  historyBySuiteId: Record<string, Array<{ execution_id: string; status: ExecutionResult["status"]; created_at?: string }>>;
  stepCountByCaseId: Record<string, number>;
  suiteSearchTerm: string;
  suiteMappedCasesFilter: SuiteMappedCasesFilter;
  activeFilterCount: number;
  selectedSuiteActionIds: string[];
  areAllVisibleSuitesSelected: boolean;
  onSelectSuite: (suiteId: string) => void;
  onSuiteSearchChange: (value: string) => void;
  onSuiteMappedCasesFilter: (value: SuiteMappedCasesFilter) => void;
  onToggleSuiteSelection: (suiteId: string) => void;
  onSelectAllVisibleSuites: () => void;
  onClearSuiteSelection: () => void;
  onCreateSuite: () => void;
  onDeleteSelectedSuites: () => void;
  onCreateManualRun: () => void;
  onCreateLocalRun: () => void;
  onCreateRemoteRun: () => void;
  isLoading: boolean;
  selectedAppType: AppType | null;
  canCreateSuite: boolean;
  canDeleteSuites: boolean;
  canCreateExecution: boolean;
  isDeletingSelectedSuites: boolean;
  hasSuiteSearchResults: boolean;
  hasAnySuites: boolean;
  viewMode: "tile" | "list";
  onViewModeChange: (value: "tile" | "list") => void;
}) {
  const [, setSuiteActionUsage] = useState<SuiteToolbarActionUsage>(() => {
    if (typeof window === "undefined") {
      return {};
    }

    try {
      const raw = window.localStorage.getItem(SUITE_ACTION_USAGE_STORAGE_KEY);
      return raw ? JSON.parse(raw) as SuiteToolbarActionUsage : {};
    } catch {
      return {};
    }
  });
  const recordSuiteActionUse = (key: SuiteToolbarActionKey) => {
    setSuiteActionUsage((current) => {
      const next = {
        ...current,
        [key]: {
          count: (current[key]?.count || 0) + 1,
          lastUsedAt: Date.now()
        }
      };
      if (typeof window !== "undefined") {
        window.localStorage.setItem(SUITE_ACTION_USAGE_STORAGE_KEY, JSON.stringify(next));
      }
      return next;
    });
  };
  const runSuiteAction = (key: SuiteToolbarActionKey, action: () => void) => {
    recordSuiteActionUse(key);
    action();
  };
  const suiteListColumns = useMemo<Array<DataTableColumn<TestSuite>>>(() => [
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
            aria-label="Select all visible suites"
            checked={areAllVisibleSuitesSelected}
            onChange={(event) => {
              if (event.target.checked) {
                onSelectAllVisibleSuites();
              } else {
                onClearSuiteSelection();
              }
            }}
            type="checkbox"
          />
        </label>
      ),
      render: (suite) => (
        <div onClick={(event) => event.stopPropagation()}>
          <input
            aria-label={`Select ${suite.name}`}
            checked={selectedSuiteActionIds.includes(suite.id)}
            onChange={() => onToggleSuiteSelection(suite.id)}
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
      sortValue: (suite) => suite.display_id || suite.id,
      render: (suite) => <DisplayIdBadge value={suite.display_id || suite.id} />
    },
    {
      key: "suite",
      label: "Suite",
      canToggle: false,
      width: 280,
      minWidth: 180,
      sortValue: (suite) => suite.name,
      render: (suite) => (
        <div className="data-table-multiline">
          <strong>{suite.name}</strong>
          <span className="data-table-multiline-line">{selectedAppType ? `${selectedAppType.name} workspace suite` : "Suite"}</span>
        </div>
      )
    },
    {
      key: "labels",
      label: "Labels",
      width: 180,
      minWidth: 140,
      sortValue: (suite) => formatReferenceList(suite.labels),
      render: (suite) => formatReferenceList(suite.labels) || "—"
    },
    {
      key: "mappedCases",
      label: "Mapped cases",
      width: 140,
      minWidth: 110,
      sortValue: (suite) => counts[suite.id] || 0,
      render: (suite) => counts[suite.id] || 0
    }
  ], [
    areAllVisibleSuitesSelected,
    counts,
    onClearSuiteSelection,
    onSelectAllVisibleSuites,
    onToggleSuiteSelection,
    selectedAppType,
    selectedSuiteActionIds
  ]);

  return (
    <Panel
      className="execution-panel suite-design-panel suite-design-panel--list"
      actions={actions}
      title="Test Suites"
      titleVariant="eyebrow"
      subtitle={selectedAppType ? "Browse suites as tiles first, then open one to manage its mapped test cases." : "Select a project and app type first."}
    >
      <div className="suite-design-panel-stack">
        <div className="design-list-toolbar suite-sidebar-toolbar">
          <CatalogViewToggle onChange={onViewModeChange} value={viewMode} />
          <CatalogSearchFilter
            activeFilterCount={activeFilterCount}
            ariaLabel="Search suites"
            onChange={onSuiteSearchChange}
            placeholder="Search suites"
            subtitle="Filter suite tiles by mapped cases or search by suite name and labels."
            title="Filter suites"
            value={suiteSearchTerm}
          >
            <div className="catalog-filter-grid">
              <label className="catalog-filter-field">
                <span>Mapped cases</span>
                <select value={suiteMappedCasesFilter} onChange={(event) => onSuiteMappedCasesFilter(event.target.value as SuiteMappedCasesFilter)}>
                  <option value="all">All suites</option>
                  <option value="with-cases">With mapped cases</option>
                  <option value="empty">Empty suites</option>
                </select>
              </label>

              <div className="catalog-filter-actions">
                <button
                  className="ghost-button"
                  disabled={!activeFilterCount}
                  onClick={() => {
                    onSuiteMappedCasesFilter("all");
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
            disabled={!suites.length || areAllVisibleSuitesSelected}
            onClick={() => runSuiteAction("select-visible", onSelectAllVisibleSuites)}
            type="button"
          >
            <SelectAllIcon />
            <span>Select all</span>
          </button>
          {selectedSuiteActionIds.length && canDeleteSuites ? (
            <button
              className="ghost-button catalog-selection-button"
              onClick={() => runSuiteAction("clear-selection", onClearSuiteSelection)}
              type="button"
            >
              <ClearSelectionIcon />
              <span>Clear</span>
            </button>
          ) : null}
          {selectedSuiteActionIds.length ? (
            <button
              className="ghost-button danger catalog-selection-button"
              disabled={isDeletingSelectedSuites}
              onClick={() => runSuiteAction("delete-selected", onDeleteSelectedSuites)}
              type="button"
            >
              <LayersIcon />
              <span>{isDeletingSelectedSuites ? "Deleting selected" : `Delete selected (${selectedSuiteActionIds.length})`}</span>
            </button>
          ) : null}
          <div className="suite-toolbar-smart-actions" aria-label="Suite actions">
            <button className="primary-button catalog-selection-button" disabled={!canCreateSuite} onClick={() => runSuiteAction("create-suite", onCreateSuite)} type="button">
              <AddIcon />
              <span>Create Suite</span>
            </button>
            {selectedSuiteActionIds.length ? (
              <CreateRunActionButton
                className="test-case-split-action-button"
                disabled={!canCreateExecution}
                label="Run manually"
                selectedSuiteIds={selectedSuiteActionIds}
                source="TEST_SUITES"
                onCreateManualRun={() => runSuiteAction("manual-run", onCreateManualRun)}
                onCreateLocalRun={() => runSuiteAction("local-run", onCreateLocalRun)}
                onCreateRemoteRun={() => runSuiteAction("remote-run", onCreateRemoteRun)}
              />
            ) : null}
          </div>
        </div>

        <TileBrowserPane className="test-case-library-scroll suite-tile-browser">
          {isLoading ? <TileCardSkeletonGrid /> : null}
          {!isLoading && !hasAnySuites ? (
            <div className="empty-state compact">
              <div>No suites yet. Create your first suite to start organizing reusable cases.</div>
              <button className="primary-button" disabled={!canCreateSuite} onClick={onCreateSuite} type="button">Create first suite</button>
            </div>
          ) : null}
          {!isLoading && hasAnySuites && !hasSuiteSearchResults ? <div className="empty-state compact">No suites match the current search.</div> : null}

          {!isLoading && hasSuiteSearchResults && viewMode === "tile" ? (
            <div className="tile-browser-grid">
              {suites.map((suite) => {
                const mappedCaseCount = counts[suite.id] || 0;
                const suiteCases = cases.filter((testCase) => (testCase.suite_ids || []).includes(suite.id));
                const history = (historyBySuiteId[suite.id] || []).slice(0, 10);
                const runCount = (historyBySuiteId[suite.id] || []).length;
                const latestRun = history[0];
                const suiteDataCount = Object.keys(suite.parameter_values || {}).length;
                const latestRunLabel = latestRun ? formatTileCardLabel(latestRun.status, "Run") : "No run";
                const failedRunCount = history.filter((result) => ["failed", "blocked"].includes(String(result.status || "").toLowerCase())).length;
                const passedRuns = history.filter((result) => result.status === "passed").length;
                const stabilityScore = history.length ? Math.round((passedRuns / history.length) * 100) : 0;
                const suiteStepCount = suiteCases.reduce((total, testCase) => total + (stepCountByCaseId[testCase.id] || 0), 0);
                const automatedCount = suiteCases.filter((testCase) => testCase.automated === "yes").length;
                const linkedRequirementCount = suiteCases.filter((testCase) => (testCase.requirement_ids || [testCase.requirement_id]).some(Boolean)).length;
                const coverageScore = mappedCaseCount ? Math.round((linkedRequirementCount / mappedCaseCount) * 100) : 0;
                const automationScore = mappedCaseCount ? Math.round((automatedCount / mappedCaseCount) * 100) : 0;
                const suiteTone = failedRunCount ? "is-risk" : !mappedCaseCount || coverageScore < 70 ? "is-warning" : "is-healthy";
                const suiteInsightTone = failedRunCount ? "danger" : !mappedCaseCount || coverageScore < 70 ? "warning" : "success";
                const suiteInsight = failedRunCount
                  ? "Signal: Recent suite runs show failed or blocked evidence. Review the unstable cases before release gating."
                  : !mappedCaseCount
                    ? "Signal: This suite is empty. Add reusable cases so the suite can become executable release coverage."
                    : coverageScore < 70
                      ? "Signal: Requirement coverage is thin. Link more mapped cases to requirements to improve traceability."
                      : automationScore >= 70
                        ? "Signal: Strong suite candidate for scheduled regression because most mapped cases are automated."
                        : "Signal: Traceability is healthy. Automate the highest-repeat cases next to reduce manual run effort.";

                return (
                  <button
                    key={suite.id}
                    className={[
                      "record-card tile-card test-suite-card test-case-catalog-card",
                      suiteTone,
                      activeSuiteId === suite.id ? "is-active" : "",
                      selectedSuiteActionIds.includes(suite.id) ? "is-marked-for-delete" : ""
                    ].filter(Boolean).join(" ")}
                    onClick={() => onSelectSuite(suite.id)}
                    type="button"
                  >
                    <div className="tile-card-main">
                      <div className="tile-card-select-row test-case-card-header">
                        <label className="checkbox-field suite-card-action-checkbox" onClick={(event) => event.stopPropagation()}>
                          <input
                            checked={selectedSuiteActionIds.includes(suite.id)}
		                            onChange={() => onToggleSuiteSelection(suite.id)}
		                            type="checkbox"
		                          />
		                        </label>
		                        <DisplayIdBadge value={suite.display_id || suite.id} />
	                        <div className="catalog-inline-actions test-case-top-actions">
	                          {suite.labels?.slice(0, 2).map((label) => (
	                            <span className="test-case-source-badge is-api" key={label}>{label}</span>
	                          ))}
	                          <StatusBadge value={latestRunLabel} />
	                        </div>
	                      </div>
		                      <div className="tile-card-title-group test-case-card-title-group test-case-card-title-group--identity">
		                        <strong>{suite.name}</strong>
		                      </div>
                      <div className="test-case-card-stats suite-card-stats" aria-label={`${suite.name} facts`}>
                        <span title={`${mappedCaseCount} mapped case${mappedCaseCount === 1 ? "" : "s"}`}>
                          <strong>{mappedCaseCount}</strong>
                          <small>Cases</small>
                        </span>
                        <span title={`${suiteStepCount} cumulative step${suiteStepCount === 1 ? "" : "s"}`}>
                          <strong>{suiteStepCount}</strong>
                          <small>Steps</small>
                        </span>
                        <span title={`${automatedCount} automated case${automatedCount === 1 ? "" : "s"}`}>
                          <strong>{automationScore}%</strong>
                          <small>Auto</small>
                        </span>
                        <span title={`${failedRunCount} failed or blocked recent suite run${failedRunCount === 1 ? "" : "s"}`}>
                          <strong>{failedRunCount ? `${failedRunCount}x` : "0x"}</strong>
                          <small>Failed</small>
                        </span>
                      </div>
                      <div className="tile-card-footer">
                        <div className="test-case-readiness-grid">
                          <div className="test-case-card-progress-row" aria-label={`${coverageScore}% requirement coverage`}>
                            <div>
                              <span>Requirement coverage</span>
                              <strong>{mappedCaseCount ? `${coverageScore}%` : "No cases"}</strong>
                            </div>
                            <div className={["test-case-card-progress-track", coverageScore < 70 ? "danger" : ""].filter(Boolean).join(" ")}>
                              <span style={{ width: `${mappedCaseCount ? coverageScore : 8}%` }} />
                            </div>
                          </div>
                          <div className="test-case-card-progress-row" aria-label={history.length ? `${stabilityScore}% recent suite stability` : "No recent suite stability"}>
                            <div>
                              <span>Suite stability</span>
                              <strong>{history.length ? `${stabilityScore}%` : "No runs"}</strong>
                            </div>
                            <div className={["test-case-card-progress-track", stabilityScore < 60 ? "danger" : ""].filter(Boolean).join(" ")}>
                              <span style={{ width: `${history.length ? stabilityScore : 8}%` }} />
                            </div>
                          </div>
                        </div>
                        <div className={`test-case-ai-note ${suiteInsightTone}`}>
                          <span aria-hidden="true">{failedRunCount ? "!" : "S"}</span>
                          <p>{suiteInsight}</p>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null}
          {!isLoading && hasSuiteSearchResults && viewMode === "list" ? (
            <DataTable
              columns={suiteListColumns}
              enableColumnResize
              enableHeaderColumnReorder
              emptyMessage="No suites match the current search."
              getRowClassName={(suite) => (activeSuiteId === suite.id ? "is-active-row" : "")}
              getRowKey={(suite) => suite.id}
              hideToolbarCopy
              onRowClick={(suite) => onSelectSuite(suite.id)}
              rows={suites}
              storageKey="qaira:suites:list-columns"
            />
          ) : null}
        </TileBrowserPane>
      </div>
    </Panel>
  );
}

function TestCaseList({
  actions,
  cases,
  activeCaseId,
  searchTerm,
  statusFilter,
  casePriorityFilter,
  caseStepFilter,
  caseRunFilter,
  statusOptions,
  priorityOptions,
  activeFilterCount,
  defaultCaseStatus,
  selectedSuite,
  isLoading,
  historyByCaseId,
  requirements,
  stepCountByCaseId,
  moduleLabelByCaseId,
  onSearch,
  onStatusFilter,
  onCasePriorityFilter,
  onCaseStepFilter,
  onCaseRunFilter,
  onSelectCase,
  onCreateCase,
  onOpenCaseEditor,
  canOpenCaseEditor,
  canUnlinkCases,
  isUnlinkingCases,
  onReorderCases,
  onUnlinkCases,
  viewMode,
  onViewModeChange
}: {
  actions?: ReactNode;
  cases: TestCase[];
  activeCaseId: string;
  searchTerm: string;
  statusFilter: string;
  casePriorityFilter: string;
  caseStepFilter: SuiteCaseStepFilter;
  caseRunFilter: SuiteCaseRunFilter;
  statusOptions: string[];
  priorityOptions: string[];
  activeFilterCount: number;
  defaultCaseStatus: string;
  selectedSuite: TestSuite | null;
  isLoading: boolean;
  historyByCaseId: Record<string, ExecutionResult[]>;
  requirements: Requirement[];
  stepCountByCaseId: Record<string, number>;
  moduleLabelByCaseId: Record<string, string>;
  onSearch: (value: string) => void;
  onStatusFilter: (value: string) => void;
  onCasePriorityFilter: (value: string) => void;
  onCaseStepFilter: (value: SuiteCaseStepFilter) => void;
  onCaseRunFilter: (value: SuiteCaseRunFilter) => void;
  onSelectCase: (testCaseId: string) => void;
  onCreateCase: () => void;
  onOpenCaseEditor: (testCaseId?: string) => void;
  canOpenCaseEditor: boolean;
  canUnlinkCases: boolean;
  isUnlinkingCases: boolean;
  onReorderCases: (fromCaseId: string, toCaseId: string) => void;
  onUnlinkCases: (testCaseIds: string[]) => Promise<boolean>;
  viewMode: "tile" | "list";
  onViewModeChange: (value: "tile" | "list") => void;
}) {
  const [draggedCaseId, setDraggedCaseId] = useState("");
  const [selectedCaseIds, setSelectedCaseIds] = useState<string[]>([]);
  const selectedCaseIdSet = useMemo(() => new Set(selectedCaseIds), [selectedCaseIds]);
  const areAllVisibleCasesSelected = Boolean(cases.length) && cases.every((testCase) => selectedCaseIdSet.has(testCase.id));
  const moduleSummaries = useMemo(() => Object.entries(cases.reduce<Record<string, TestCase[]>>((groups, testCase) => {
    const moduleName = moduleLabelByCaseId[testCase.id] || "Unassigned module";
    groups[moduleName] = groups[moduleName] || [];
    groups[moduleName].push(testCase);
    return groups;
  }, {})).map(([name, moduleCases]) => ({
    name,
    count: moduleCases.length,
    automated: moduleCases.filter((testCase) => testCase.automated === "yes").length,
    withRequirements: moduleCases.filter((testCase) => Boolean(testCase.requirement_ids?.length || testCase.requirement_id)).length
  })), [cases, moduleLabelByCaseId]);

  useEffect(() => {
    setSelectedCaseIds([]);
  }, [canUnlinkCases, selectedSuite?.id]);

  const toggleCaseSelection = (testCaseId: string) => {
    setSelectedCaseIds((current) => (
      current.includes(testCaseId)
        ? current.filter((id) => id !== testCaseId)
        : [...current, testCaseId]
    ));
  };

  const unlinkSelectedCases = async () => {
    if (await onUnlinkCases(selectedCaseIds)) {
      setSelectedCaseIds([]);
    }
  };

  const getRequirementTitleForCase = (testCase: TestCase) =>
    requirements
      .find((item) => (testCase.requirement_ids || [testCase.requirement_id]).includes(item.id))
      ?.title || "No requirement linked";
  const suiteCaseListColumns = useMemo<Array<DataTableColumn<TestCase>>>(() => [
    ...(canUnlinkCases ? [{
      key: "select",
      label: "",
      canToggle: false,
      render: (testCase: TestCase) => (
        <label className="checkbox-field suite-case-row-checkbox" onClick={(event) => event.stopPropagation()}>
          <input
            aria-label={`Select ${testCase.title}`}
            checked={selectedCaseIdSet.has(testCase.id)}
            onChange={() => toggleCaseSelection(testCase.id)}
            type="checkbox"
          />
        </label>
      )
    }] : []),
    {
      key: "id",
      label: "ID",
      sortValue: (testCase) => testCase.display_id || testCase.id,
      render: (testCase) => <DisplayIdBadge value={testCase.display_id || testCase.id} />
    },
    {
      key: "title",
      label: "Test case",
      canToggle: false,
      render: (testCase) => (
        <div className="data-table-multiline">
          <strong>{testCase.title}</strong>
          <span className="data-table-multiline-line">{getRequirementTitleForCase(testCase)}</span>
        </div>
      )
    },
    {
      key: "description",
      label: "Description",
      defaultVisible: false,
      render: (testCase) => richTextToPlainText(testCase.description) || "No description yet for this test case."
    },
    {
      key: "status",
      label: "Status",
      render: (testCase) => {
        const history = historyByCaseId[testCase.id] || [];
        const latest = history[0];
        return formatTileCardLabel(latest?.status || testCase.status || defaultCaseStatus, "Active");
      }
    },
    {
      key: "module",
      label: "Module",
      render: (testCase) => moduleLabelByCaseId[testCase.id] || "Unassigned module",
      sortValue: (testCase) => moduleLabelByCaseId[testCase.id] || "Unassigned module"
    },
    {
      key: "automated",
      label: "Automated",
      render: (testCase) => (testCase.automated === "yes" ? "Yes" : "No")
    },
    {
      key: "priority",
      label: "Priority",
      render: (testCase) => `P${testCase.priority || 3}`
    },
    {
      key: "steps",
      label: "Steps",
      render: (testCase) => stepCountByCaseId[testCase.id] || 0
    },
    {
      key: "testData",
      label: "Test data",
      defaultVisible: false,
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
      render: (testCase) => (testCase.suite_ids || (testCase.suite_id ? [testCase.suite_id] : [])).length || 0
    },
    {
      key: "runs",
      label: "Runs",
      render: (testCase) => (historyByCaseId[testCase.id] || []).length
    }
  ], [canUnlinkCases, defaultCaseStatus, historyByCaseId, moduleLabelByCaseId, requirements, selectedCaseIdSet, stepCountByCaseId]);

  return (
    <Panel
      className="execution-panel suite-design-panel suite-design-panel--cases"
      actions={actions}
      title="Suite cases"
      subtitle={selectedSuite ? `Curated reusable cases inside ${selectedSuite.name}.` : "Showing all reusable cases for the current app type."}
    >
      <div className="suite-design-panel-stack">
        <div className="design-list-toolbar test-case-catalog-toolbar">
          <CatalogViewToggle onChange={onViewModeChange} value={viewMode} />
          <CatalogSearchFilter
            activeFilterCount={activeFilterCount}
            ariaLabel="Search suite cases"
            onChange={onSearch}
            placeholder="Search title or description"
            subtitle="Filter the case tiles by the same facts shown on each card."
            title="Filter suite cases"
            value={searchTerm}
          >
            <div className="catalog-filter-grid">
              <label className="catalog-filter-field">
                <span>Status</span>
                <select value={statusFilter} onChange={(event) => onStatusFilter(event.target.value)}>
                  <option value="all">All statuses</option>
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>
                      {formatTileCardLabel(status, "Active")}
                    </option>
                  ))}
                </select>
              </label>

              <label className="catalog-filter-field">
                <span>Priority</span>
                <select value={casePriorityFilter} onChange={(event) => onCasePriorityFilter(event.target.value)}>
                  <option value="all">All priorities</option>
                  {priorityOptions.map((priority) => (
                    <option key={priority} value={priority}>
                      {`P${priority}`}
                    </option>
                  ))}
                </select>
              </label>

              <label className="catalog-filter-field">
                <span>Steps</span>
                <select value={caseStepFilter} onChange={(event) => onCaseStepFilter(event.target.value as SuiteCaseStepFilter)}>
                  <option value="all">All cases</option>
                  <option value="with-steps">With steps</option>
                  <option value="no-steps">Without steps</option>
                </select>
              </label>

              <label className="catalog-filter-field">
                <span>Recent runs</span>
                <select value={caseRunFilter} onChange={(event) => onCaseRunFilter(event.target.value as SuiteCaseRunFilter)}>
                  <option value="all">All cases</option>
                  <option value="with-runs">With recent runs</option>
                  <option value="no-runs">No recent runs</option>
                </select>
              </label>

              <div className="catalog-filter-actions">
                <button
                  className="ghost-button"
                  disabled={!activeFilterCount}
                  onClick={() => {
                    onStatusFilter("all");
                    onCasePriorityFilter("all");
                    onCaseStepFilter("all");
                    onCaseRunFilter("all");
                  }}
                  type="button"
                >
                  Clear filters
                </button>
              </div>
            </div>
          </CatalogSearchFilter>
          {selectedSuite && canUnlinkCases ? (
            <CatalogSelectionControls
              allSelected={areAllVisibleCasesSelected}
              canSelectAll={Boolean(cases.length)}
              clearLabel="Clear"
              deleteAction={{
                disabled: isUnlinkingCases,
                icon: <UnlinkSuiteCasesIcon />,
                label: isUnlinkingCases ? "Removing…" : `Remove from suite (${selectedCaseIds.length})`,
                onClick: () => void unlinkSelectedCases()
              }}
              onClear={() => setSelectedCaseIds([])}
              onSelectAll={() => setSelectedCaseIds((current) => [...new Set([...current, ...cases.map((testCase) => testCase.id)])])}
              selectAllLabel="Select all"
              selectedCount={selectedCaseIds.length}
            />
          ) : null}
          <button className="primary-button" onClick={onCreateCase} type="button"><AddIcon />New Test Case</button>
        </div>

        {selectedSuite && moduleSummaries.length ? (
          <div className="suite-module-summary-strip" aria-label="Modules represented in this suite">
            {moduleSummaries.map((module) => (
              <div className="suite-module-summary" key={module.name}>
                <LayersIcon />
                <span>
                  <strong>{module.name}</strong>
                  <small>{module.count} cases · {module.automated} automated · {module.withRequirements} traced</small>
                </span>
              </div>
            ))}
          </div>
        ) : null}

        <TileBrowserPane className="test-case-library-scroll">
          {isLoading ? <TileCardSkeletonGrid /> : null}
          {!isLoading && !cases.length ? (
            searchTerm || activeFilterCount ? (
              <div className="empty-state compact">No test cases match this scope yet.</div>
            ) : (
              <div className="empty-state compact">
                <div>No reusable test cases exist in this scope yet.</div>
                <button className="primary-button" onClick={onCreateCase} type="button">Create first case</button>
              </div>
            )
          ) : null}

          {!isLoading && cases.length && viewMode === "tile" ? (
            <div className="tile-browser-grid">
              {cases.map((testCase) => {
                const history = (historyByCaseId[testCase.id] || []).slice(0, 10);
                const latest = history[0];
                const requirement = requirements.find((item) => (testCase.requirement_ids || [testCase.requirement_id]).includes(item.id));
                const stepCount = stepCountByCaseId[testCase.id] || 0;
                const caseStatusValue = latest?.status || testCase.status || defaultCaseStatus;
                const caseStatusLabel = formatTileCardLabel(caseStatusValue, "Active");
                const suiteCount = (testCase.suite_ids || []).length || 0;
                const failedRunCount = history.filter((result) => ["failed", "blocked"].includes(String(result.status || "").toLowerCase())).length;
                const passedRuns = history.filter((result) => result.status === "passed").length;
                const stabilityScore = history.length ? Math.round((passedRuns / history.length) * 100) : 0;
                const automationReadiness = testCase.automated === "yes"
                  ? 100
                  : Math.min(96, Math.max(26, 36 + stepCount * 4 + (requirement ? 14 : 0) + (history.length ? 8 : 0) - failedRunCount * 6));
                const caseTypeLabel = testCase.automated === "yes" ? "Auto" : "Manual";
                const moduleLabel = moduleLabelByCaseId[testCase.id] || "Unassigned module";
                const isRiskCase = failedRunCount > 0;
                const isWarningCase = !requirement || stabilityScore < 60;
                const aiInsightTone = isRiskCase ? "danger" : isWarningCase ? "warning" : "success";
                const aiInsight = isRiskCase
                  ? "Signal: Recent suite evidence includes failed or blocked runs. Review this case before the suite is promoted."
                  : !requirement
                    ? "Signal: Link this case to a requirement so the suite can report traceable coverage."
                    : testCase.automated !== "yes" && automationReadiness >= 70
                      ? "Signal: This suite case is a strong automation candidate because its scope and steps are ready."
                      : "Signal: This case is healthy within the suite. Keep it ordered near related validation coverage.";

                return (
                  <button
                    key={testCase.id}
                    className={[
                      "record-card tile-card test-case-card test-case-catalog-card suite-case-workspace-card",
                      isRiskCase ? "is-risk" : isWarningCase ? "is-warning" : "is-healthy",
                      activeCaseId === testCase.id ? "is-active" : ""
                    ].filter(Boolean).join(" ")}
                    onClick={() => onSelectCase(testCase.id)}
                    draggable={Boolean(selectedSuite)}
                    onDragStart={() => setDraggedCaseId(testCase.id)}
                    onDragOver={(event: DragEvent<HTMLButtonElement>) => event.preventDefault()}
                    onDrop={() => {
                      if (selectedSuite && draggedCaseId) {
                        void onReorderCases(draggedCaseId, testCase.id);
                      }
                      setDraggedCaseId("");
                    }}
                    onDragEnd={() => setDraggedCaseId("")}
                    type="button"
                  >
		                    {selectedSuite ? <span className="drag-handle" aria-hidden="true">::</span> : null}
		                    <div className="tile-card-main">
		                      <div className={["tile-card-select-row test-case-card-header test-case-card-header--metadata-only", canUnlinkCases ? "has-selection" : ""].filter(Boolean).join(" ")}>
		                        {canUnlinkCases ? <label className="checkbox-field suite-case-card-checkbox" onClick={(event) => event.stopPropagation()}>
		                          <input
		                            aria-label={`Select ${testCase.title}`}
		                            checked={selectedCaseIdSet.has(testCase.id)}
		                            onChange={() => toggleCaseSelection(testCase.id)}
		                            type="checkbox"
		                          />
		                        </label> : null}
		                        <DisplayIdBadge value={testCase.display_id || testCase.id} />
	                        <div className="catalog-inline-actions test-case-top-actions">
	                          <button
	                            aria-label={`View ${testCase.title}`}
                            className="ghost-button test-case-card-eye-action"
                            onClick={(event) => {
                              event.stopPropagation();
                              onSelectCase(testCase.id);
                              onOpenCaseEditor(testCase.id);
                            }}
                            title="View test case"
                            type="button"
                          >
                            <EyeIcon size={16} />
                          </button>
	                          <StatusBadge value={caseStatusLabel} />
	                        </div>
	                      </div>
	                      <div className="suite-case-module-label"><LayersIcon /><span>{moduleLabel}</span></div>
	                      <div className="test-case-requirement-block">
	                        <span className="test-case-requirement-label">
	                          <TileCardLinkIcon />
	                          Requirement
	                        </span>
	                        <p>{requirement?.title || "No requirement linked"}</p>
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
                        <span title={`${suiteCount} linked suite${suiteCount === 1 ? "" : "s"}`}>
                          <strong>{suiteCount}</strong>
                          <small>Suites</small>
                        </span>
                      </div>
                      <div className="tile-card-footer">
                        <div className="test-case-readiness-grid">
                          <div className="test-case-card-progress-row" aria-label={`${automationReadiness}% automation readiness`}>
                            <div>
                              <span>Automation readiness</span>
                              <strong>{`${automationReadiness}%`}</strong>
                            </div>
                            <div className="test-case-card-progress-track">
                              <span style={{ width: `${automationReadiness}%` }} />
                            </div>
                          </div>
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
                          <span aria-hidden="true">{isRiskCase ? "!" : "S"}</span>
                          <p>{aiInsight}</p>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null}
          {!isLoading && cases.length && viewMode === "list" ? (
            <DataTable
              columns={suiteCaseListColumns}
              emptyMessage="No test cases match this suite scope."
              getRowClassName={(testCase) => (activeCaseId === testCase.id ? "is-active-row" : "")}
              getRowKey={(testCase) => testCase.id}
              hideToolbarCopy
              onRowClick={(testCase) => onSelectCase(testCase.id)}
              rows={cases}
              storageKey="qaira:suite-cases:list-columns"
            />
          ) : null}
        </TileBrowserPane>
      </div>
    </Panel>
  );
}

function SuiteCaseEditorModal({
  project,
  appType,
  suites,
  selectedSuite,
  requirements,
  selectedTestCase,
  history,
  displaySteps,
  stepDrafts,
  caseDraft,
  defaultCaseStatus,
  isStepCreateVisible,
  newStepDraft,
  draftSteps,
  expandedSections,
  expandedStepIds,
  isCreatingCase,
  isLoadingSteps,
  createPending,
  updatePending,
  deletePending,
  testCaseAutomatedOptions,
  testCaseStatusOptions,
  onCaseDraftChange,
  onClose,
  onCreateStep,
  onCloseStepCreate,
  onDeleteStep,
  onDeleteTestCase,
  onDraftStepChange,
  onDraftStepMove,
  onExpandAllSteps,
  onCollapseAllSteps,
  onNewStepDraftChange,
  onOpenStepCreate,
  onSaveTestCase,
  onStepMove,
  onStepSave,
  onToggleSection,
  onToggleStep
}: {
  project: Project | null;
  appType: AppType | null;
  suites: TestSuite[];
  selectedSuite: TestSuite | null;
  requirements: Requirement[];
  selectedTestCase: TestCase | null;
  history: ExecutionResult[];
  displaySteps: TestStep[];
  stepDrafts: Record<string, StepDraft>;
  caseDraft: CaseDraft;
  defaultCaseStatus: string;
  isStepCreateVisible: boolean;
  newStepDraft: { action: string; expected_result: string };
  draftSteps: DraftTestStep[];
  expandedSections: Record<SuiteCaseEditorSectionKey, boolean>;
  expandedStepIds: string[];
  isCreatingCase: boolean;
  isLoadingSteps: boolean;
  createPending: boolean;
  updatePending: boolean;
  deletePending: boolean;
  testCaseAutomatedOptions: Array<{ value: string; label: string }>;
  testCaseStatusOptions: Array<{ value: string; label: string }>;
  onCaseDraftChange: (value: CaseDraft) => void;
  onClose: () => void;
  onCreateStep: () => void;
  onCloseStepCreate: () => void;
  onDeleteStep: (stepId: string) => void;
  onDeleteTestCase: () => void;
  onDraftStepChange: (stepId: string, input: StepDraft) => void;
  onDraftStepMove: (stepId: string, direction: "up" | "down") => void;
  onExpandAllSteps: () => void;
  onCollapseAllSteps: () => void;
  onNewStepDraftChange: (value: { action: string; expected_result: string }) => void;
  onOpenStepCreate: () => void;
  onSaveTestCase: () => void;
  onStepMove: (stepId: string, direction: "up" | "down") => void;
  onStepSave: (stepId: string, draft: StepDraft) => void;
  onToggleSection: (section: SuiteCaseEditorSectionKey) => void;
  onToggleStep: (stepId: string) => void;
}) {
  const dialogRef = useDialogFocus<HTMLDivElement>({ onClose });
  const caseSectionSummary = isCreatingCase
    ? caseDraft.title.trim() || "Start the reusable case definition before saving it into the suite workspace."
    : selectedTestCase?.title || "Select a case from the workspace to edit it here.";
  const firstStepPreview = displaySteps[0]?.action || displaySteps[0]?.expected_result || "";
  const stepSectionSummary = firstStepPreview
    ? `Starts with: ${firstStepPreview}`
    : isCreatingCase
      ? "No draft steps added yet."
      : "No steps added yet for this case.";
  const historySectionSummary = history.length
    ? "Review the latest preserved run evidence for this reusable case."
    : "No run history has been recorded yet for this case.";
  const groupedStepCount = displaySteps.filter((step) => Boolean(step.group_id)).length;
  const sharedGroupCount = new Set(
    displaySteps
      .filter((step) => step.group_kind === "reusable" && step.group_id)
      .map((step) => step.group_id as string)
  ).size;

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        aria-labelledby="suite-case-editor-title"
        aria-modal="true"
        className="modal-card suite-test-case-editor-modal"
        onClick={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="suite-test-case-editor-header">
          <div className="suite-test-case-editor-title">
            <div className="modal-title-info-row">
              <h2 className="dialog-title" id="suite-case-editor-title">{isCreatingCase ? "Create test case" : selectedTestCase ? `Edit ${selectedTestCase.title}` : "Test case editor"}</h2>
              <InfoTooltip
                content="Use the modal for focused edits, then return to the three-panel suite workspace without losing your place."
                label="Test case editor information"
              />
            </div>
          </div>
          <DialogCloseButton label="Close test case editor" onClick={onClose} />
        </div>

        <div className="suite-test-case-editor-body">
          <div className="detail-summary">
            <strong>{selectedTestCase?.title || (isCreatingCase ? "New test case" : "No test case selected")}</strong>
            <span>{project?.name || "No project"} · {appType?.name || "No app type"}</span>
            <span>Suite context: {selectedSuite?.name || caseDraft.suite_id || "All suites"}</span>
          </div>

          <div className="editor-accordion">
            <EditorAccordionSection
              countLabel={isCreatingCase ? "Draft" : caseDraft.status || defaultCaseStatus}
              isExpanded={expandedSections.case}
              onToggle={() => onToggleSection("case")}
              summary={caseSectionSummary}
              title={isCreatingCase ? "New test case" : "Selected test case"}
            >
              <form
                className="form-grid"
                onSubmit={(event: FormEvent<HTMLFormElement>) => {
                  event.preventDefault();
                  onSaveTestCase();
                }}
              >
                <div className="record-grid">
                  <FormField label="Title" required>
                    <input
                      required
                      value={caseDraft.title}
                      onChange={(event) => onCaseDraftChange({ ...caseDraft, title: event.target.value })}
                    />
                  </FormField>
                  <FormField label="Suite">
                    <select value={caseDraft.suite_id} onChange={(event) => onCaseDraftChange({ ...caseDraft, suite_id: event.target.value })}>
                      {suites.map((suite) => (
                        <option key={suite.id} value={suite.id}>{suite.name}</option>
                      ))}
                    </select>
                  </FormField>
                  <FormField className="form-field--compact-enum" label="Status">
                    <select value={caseDraft.status} onChange={(event) => onCaseDraftChange({ ...caseDraft, status: event.target.value })}>
                      {testCaseStatusOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="Automated">
                    <select value={caseDraft.automated} onChange={(event) => onCaseDraftChange({ ...caseDraft, automated: event.target.value as "yes" | "no" })}>
                      {testCaseAutomatedOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </FormField>
                  <FormField className="form-field--compact-enum form-field--compact-number" label="Priority">
                    <input
                      min="1"
                      max="5"
                      type="number"
                      value={caseDraft.priority}
                      onChange={(event) => onCaseDraftChange({ ...caseDraft, priority: event.target.value || "3" })}
                    />
                  </FormField>
                  <FormField label="Requirement">
                    <select value={caseDraft.requirement_id} onChange={(event) => onCaseDraftChange({ ...caseDraft, requirement_id: event.target.value })}>
                      <option value="">No requirement</option>
                      {requirements.map((requirement) => (
                        <option key={requirement.id} value={requirement.id}>{requirement.title}</option>
                      ))}
                    </select>
                  </FormField>
                </div>

                <FormField label="Description">
                  <RichTextEditor
                    rows={4}
                    value={caseDraft.description}
                    onChange={(description) => onCaseDraftChange({ ...caseDraft, description })}
                  />
                </FormField>

                <div className="detail-summary">
                  <strong>{isCreatingCase ? "Create with steps attached" : "Live case definition"}</strong>
                  <span>{isCreatingCase ? `This test case will be saved with ${displaySteps.length} draft step${displaySteps.length === 1 ? "" : "s"} attached.` : "Edits here update the reusable test case while historical run evidence stays preserved."}</span>
                </div>

                <div className="action-row">
                  <button className="primary-button" disabled={createPending || updatePending} type="submit">
                    {isCreatingCase ? (createPending ? "Creating…" : "Create test case") : (updatePending ? "Saving…" : "Save test case")}
                  </button>
                  {!isCreatingCase && selectedTestCase ? (
                    <button className="ghost-button danger" disabled={deletePending} onClick={onDeleteTestCase} type="button">Delete test case</button>
                  ) : null}
                </div>
              </form>
            </EditorAccordionSection>

            <EditorAccordionSection
              countLabel={`${displaySteps.length} step${displaySteps.length === 1 ? "" : "s"}`}
              isExpanded={expandedSections.steps}
              onToggle={() => onToggleSection("steps")}
              summary={stepSectionSummary}
              title={isCreatingCase ? "Draft steps" : "Test steps"}
            >
              <div className="step-editor step-editor--embedded">
                {!isCreatingCase && displaySteps.length ? (
                  <div className="action-row">
                    <button aria-label="Expand all steps" className="ghost-button explorer-icon-button" onClick={onExpandAllSteps} title="Expand all steps" type="button">
                      <CollapseExpandIcon isExpanded={false} />
                    </button>
                    <button aria-label="Collapse all steps" className="ghost-button explorer-icon-button" onClick={onCollapseAllSteps} title="Collapse all steps" type="button">
                      <CollapseExpandIcon isExpanded={true} />
                    </button>
                  </div>
                ) : null}

                {groupedStepCount ? (
                  <div className="detail-summary">
                    <strong>{groupedStepCount} grouped step{groupedStepCount === 1 ? "" : "s"} in this case</strong>
                    <span>{sharedGroupCount ? `${sharedGroupCount} linked shared group${sharedGroupCount === 1 ? "" : "s"} appear in this suite editor.` : "Local step group metadata is preserved in this suite editor."}</span>
                  </div>
                ) : null}

                {!isCreatingCase && isLoadingSteps ? <LoadingState label="Loading steps" /> : null}
                {!displaySteps.length ? (
                  <div className="empty-state compact">
                    <div>{isCreatingCase ? "No draft steps yet. Add steps below before you save if this case needs a guided run flow." : "No steps yet for this test case."}</div>
                    {!isStepCreateVisible ? <button className="ghost-button" onClick={onOpenStepCreate} type="button">Add first step</button> : null}
                  </div>
                ) : null}

                <div className="step-list">
                  {isCreatingCase
                    ? draftSteps.map((step, index) => (
                        <DraftStepCard
                          isExpanded={expandedStepIds.includes(step.id)}
                          canMoveDown={index < draftSteps.length - 1}
                          canMoveUp={index > 0}
                          key={step.id}
                          onChange={(input) => onDraftStepChange(step.id, input)}
                          onDelete={() => onDeleteStep(step.id)}
                          onMoveDown={() => onDraftStepMove(step.id, "down")}
                          onMoveUp={() => onDraftStepMove(step.id, "up")}
                          onToggle={() => onToggleStep(step.id)}
                          step={{ ...step, step_order: index + 1 }}
                        />
                      ))
                    : displaySteps.map((step, index) => (
                        <EditableStepCard
                          key={step.id}
                          canMoveDown={index < displaySteps.length - 1}
                          canMoveUp={index > 0}
                          isExpanded={expandedStepIds.includes(step.id)}
                          onDelete={() => onDeleteStep(step.id)}
                          onMoveDown={() => onStepMove(step.id, "down")}
                          onMoveUp={() => onStepMove(step.id, "up")}
                          onSave={(input) => onStepSave(step.id, input)}
                          onToggle={() => onToggleStep(step.id)}
                          step={step}
                          stepDraft={stepDrafts[step.id]}
                        />
                      ))}
                </div>

                {!isStepCreateVisible && displaySteps.length ? (
                  <div className="action-row">
                    <button className="ghost-button" onClick={onOpenStepCreate} type="button">
                      + Add Step
                    </button>
                  </div>
                ) : (
                  <form
                    className="step-create"
                    onSubmit={(event: FormEvent<HTMLFormElement>) => {
                      event.preventDefault();
                      onCreateStep();
                    }}
                  >
                    <strong>+ Add Step</strong>
                    <FormField label="Action">
                      <input
                        value={newStepDraft.action}
                        onChange={(event) => onNewStepDraftChange({ ...newStepDraft, action: event.target.value })}
                      />
                    </FormField>
                    <FormField label="Expected result">
                      <textarea
                        rows={3}
                        value={newStepDraft.expected_result}
                        onChange={(event) => onNewStepDraftChange({ ...newStepDraft, expected_result: event.target.value })}
                      />
                    </FormField>
                    <div className="action-row">
                      <button className="primary-button" type="submit">Add step</button>
                      <button className="ghost-button" onClick={onCloseStepCreate} type="button">
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </EditorAccordionSection>

            {!isCreatingCase ? (
              <EditorAccordionSection
                countLabel={`${history.length} record${history.length === 1 ? "" : "s"}`}
                isExpanded={expandedSections.history}
                onToggle={() => onToggleSection("history")}
                summary={historySectionSummary}
                title="Run history"
              >
                <div className="step-editor step-history">
                  <div className="stack-list">
                    {history.map((result) => (
                      <div className="stack-item" key={result.id}>
                        <div>
                          <strong>{result.test_case_title || selectedTestCase?.title || "Run record"}</strong>
                          <span>{result.error || result.logs || result.created_at || "Historical run evidence retained."}</span>
                        </div>
                        <StatusBadge value={result.status} />
                      </div>
                    ))}
                    {!history.length ? <div className="empty-state compact">No run history yet for this test case.</div> : null}
                  </div>
                </div>
              </EditorAccordionSection>
            ) : null}
          </div>
        </div>
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
  children
}: {
  title: string;
  summary: string;
  countLabel: string;
  isExpanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className={isExpanded ? "editor-accordion-section is-expanded" : "editor-accordion-section"}>
      <button
        aria-expanded={isExpanded}
        className="editor-accordion-toggle"
        onClick={onToggle}
        title={isExpanded ? `Collapse ${title}` : `Expand ${title}`}
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
        <div className="editor-accordion-toggle-meta">
          <span className="editor-accordion-toggle-count">{countLabel}</span>
          <span aria-hidden="true" className="editor-accordion-toggle-state explorer-toggle-glyph"><CollapseExpandIcon isExpanded={isExpanded} /></span>
        </div>
      </button>
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

function StepKebabIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="18" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="18">
      <circle cx="12" cy="6" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="12" cy="18" r="1.5" />
    </svg>
  );
}

function EditableStepCard({
  step,
  stepDraft,
  isExpanded,
  canMoveUp,
  canMoveDown,
  onSave,
  onDelete,
  onToggle,
  onMoveUp,
  onMoveDown
}: {
  step: TestStep;
  stepDraft?: StepDraft;
  isExpanded: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onSave: (input: StepDraft) => void;
  onDelete: () => void;
  onToggle: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const [draft, setDraft] = useState<StepDraft>({
    action: stepDraft?.action || step.action || "",
    expected_result: stepDraft?.expected_result || step.expected_result || ""
  });
  const stepKind = getSuiteStepKindMeta(step.group_kind);

  useEffect(() => {
    setDraft({
      action: stepDraft?.action || step.action || "",
      expected_result: stepDraft?.expected_result || step.expected_result || ""
    });
  }, [step.action, step.expected_result, step.id, stepDraft?.action, stepDraft?.expected_result]);

  return (
    <article
      className={[
        isExpanded ? "step-card is-expanded" : "step-card",
        step.group_kind === "reusable" ? "step-card--shared" : "",
        step.group_kind === "local" ? "step-card--grouped" : ""
      ].filter(Boolean).join(" ")}
    >
      <button
        aria-label={isExpanded ? `Hide step ${step.step_order} details` : `Show step ${step.step_order} details`}
        className="step-card-toggle"
        onClick={onToggle}
        type="button"
      >
        <div className="step-card-summary">
          <div className="step-card-summary-top">
            <StepKindIconBadge kind={step.group_kind} label={stepKind.label} tone={stepKind.tone} />
            <strong>Step {step.step_order}</strong>
          </div>
          {step.group_name ? <small className="suite-step-group-note">{step.group_name}</small> : null}
          <span>{richTextToPlainText(draft.action) || "No action written yet"}</span>
        </div>
        <span aria-hidden="true" className="step-card-toggle-state">
          <StepKebabIcon />
        </span>
      </button>

      {isExpanded ? (
        <div className="step-card-body">
          <FormField label="Action">
            <RichTextEditor value={draft.action} onChange={(action) => setDraft((current) => ({ ...current, action }))} />
          </FormField>
          <FormField label="Expected result">
            <RichTextEditor rows={3} value={draft.expected_result} onChange={(expected_result) => setDraft((current) => ({ ...current, expected_result }))} />
          </FormField>
          <div className="action-row">
            <button className="ghost-button" disabled={!canMoveUp} onClick={onMoveUp} type="button">Move up</button>
            <button className="ghost-button" disabled={!canMoveDown} onClick={onMoveDown} type="button">Move down</button>
            <button className="primary-button" onClick={() => onSave(draft)} type="button">Save step</button>
            <button className="ghost-button danger" onClick={onDelete} type="button">Delete step</button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function DraftStepCard({
  step,
  isExpanded,
  canMoveUp,
  canMoveDown,
  onChange,
  onDelete,
  onToggle,
  onMoveUp,
  onMoveDown
}: {
  step: { step_order: number; action: string; expected_result: string; group_id?: string | null; group_name?: string | null; group_kind?: "local" | "reusable" | null; reusable_group_id?: string | null };
  isExpanded: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onChange: (input: StepDraft) => void;
  onDelete: () => void;
  onToggle: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const stepKind = getSuiteStepKindMeta(step.group_kind);

  return (
    <article
      className={[
        isExpanded ? "step-card is-expanded" : "step-card",
        step.group_kind === "reusable" ? "step-card--shared" : "",
        step.group_kind === "local" ? "step-card--grouped" : ""
      ].filter(Boolean).join(" ")}
    >
      <div className="step-card-top">
        <button
          aria-label={isExpanded ? `Hide step ${step.step_order} details` : `Show step ${step.step_order} details`}
          className="step-card-toggle"
          onClick={onToggle}
          type="button"
        >
          <div className="step-card-summary">
            <div className="step-card-summary-top">
              <StepKindIconBadge kind={step.group_kind} label={stepKind.label} tone={stepKind.tone} />
              <strong>Step {step.step_order}</strong>
            </div>
            {step.group_name ? <small className="suite-step-group-note">{step.group_name}</small> : null}
            <span>{richTextToPlainText(step.action || step.expected_result) || "Draft step details"}</span>
          </div>
          <span aria-hidden="true" className="step-card-toggle-state">
            <StepKebabIcon />
          </span>
        </button>
      </div>

      {isExpanded ? (
        <div className="step-card-body">
          <FormField label="Action">
            <RichTextEditor
              value={step.action}
              onChange={(action) => onChange({ action, expected_result: step.expected_result })}
            />
          </FormField>
          <FormField label="Expected result">
            <RichTextEditor
              rows={3}
              value={step.expected_result}
              onChange={(expected_result) => onChange({ action: step.action, expected_result })}
            />
          </FormField>
          <div className="action-row">
            <button className="ghost-button" disabled={!canMoveUp} onClick={onMoveUp} type="button">Move up</button>
            <button className="ghost-button" disabled={!canMoveDown} onClick={onMoveDown} type="button">Move down</button>
            <button className="ghost-button danger" onClick={onDelete} type="button">Delete step</button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function SuiteExecutionModal({
  scopeSuites,
  selectedProject,
  selectedAppType,
  appTypeId,
  projectId,
  selectedSuiteIds,
  executionName,
  executionRelease,
  executionSprint,
  executionBuild,
  selectedAssigneeIds,
  assigneeOptions,
  selectedEnvironmentId,
  selectedConfigurationId,
  selectedDataSetId,
  executionStartMode,
  executionParallelEnabled,
  executionParallelCount,
  canConfigureParallelAutomation,
  canRunLocalAutomation,
  canRunRemoteAutomation,
  executionHookDraft,
  testCases,
  canCreateExecution,
  isSubmitting,
  onAssigneeChange,
  onEnvironmentChange,
  onConfigurationChange,
  onDataSetChange,
  onExecutionHookDraftChange,
  onExecutionNameChange,
  onExecutionReleaseChange,
  onExecutionSprintChange,
  onExecutionBuildChange,
  onExecutionParallelCountChange,
  onExecutionParallelEnabledChange,
  onExecutionStartModeChange,
  onSuiteSelectionChange,
  onClose,
  onSubmit
}: {
  scopeSuites: TestSuite[];
  selectedProject: string;
  selectedAppType: string;
  appTypeId: string;
  projectId: string;
  selectedSuiteIds: string[];
  executionName: string;
  executionRelease: string;
  executionSprint: string;
  executionBuild: string;
  selectedAssigneeIds: string[];
  assigneeOptions: SuiteExecutionAssigneeOption[];
  selectedEnvironmentId: string;
  selectedConfigurationId: string;
  selectedDataSetId: string;
  executionStartMode: ExecutionStartMode;
  executionParallelEnabled: boolean;
  executionParallelCount: number;
  canConfigureParallelAutomation: boolean;
  canRunLocalAutomation: boolean;
  canRunRemoteAutomation: boolean;
  executionHookDraft: RunHookSelection[];
  testCases: TestCase[];
  canCreateExecution: boolean;
  isSubmitting: boolean;
  onAssigneeChange: (value: string[]) => void;
  onEnvironmentChange: (value: string) => void;
  onConfigurationChange: (value: string) => void;
  onDataSetChange: (value: string) => void;
  onExecutionHookDraftChange: (nextHooks: RunHookSelection[]) => void;
  onExecutionNameChange: (value: string) => void;
  onExecutionReleaseChange: (value: string) => void;
  onExecutionSprintChange: (value: string) => void;
  onExecutionBuildChange: (value: string) => void;
  onExecutionParallelCountChange: (value: number) => void;
  onExecutionParallelEnabledChange: (value: boolean) => void;
  onExecutionStartModeChange: (value: ExecutionStartMode) => void;
  onSuiteSelectionChange: (nextIds: string[]) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const dialogRef = useDialogFocus<HTMLDivElement>({ closeDisabled: isSubmitting, onClose });
  return (
    <div className="modal-backdrop modal-backdrop--scroll" onClick={() => !isSubmitting && onClose()} role="presentation">
      <div
        aria-labelledby="create-suite-execution-title"
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
              <p className="dialog-context-label">Test runs</p>
              <div className="modal-title-info-row">
                <h2 className="dialog-title" id="create-suite-execution-title">Create manual run</h2>
                <InfoTooltip
                  content="Create a manual run from the selected suites in this project and app type."
                  label="Create run information"
                />
              </div>
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
                  disabled={!projectId || !assigneeOptions.length}
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

            {canRunLocalAutomation || canRunRemoteAutomation || canConfigureParallelAutomation ? (
              <div className="execution-create-grid">
              {canRunLocalAutomation || canRunRemoteAutomation ? (
                <FormField label="Run type">
                  <RunTypeSelector
                    allowedModes={[
                      "manual",
                      ...(canRunLocalAutomation ? ["local" as const] : []),
                      ...(canRunRemoteAutomation ? ["remote" as const] : [])
                    ]}
                    value={executionStartMode}
                    onChange={(value) => onExecutionStartModeChange(value as ExecutionStartMode)}
                  />
                </FormField>
              ) : null}

              {canConfigureParallelAutomation ? (
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
              ) : null}
              </div>
            ) : null}

            <div className="detail-summary">
              <strong>{selectedProject || "Select a project to continue"}</strong>
              <span>{selectedAppType ? `${selectedAppType} app type selected for this snapshot.` : "Choose an app type to load suite scope."}</span>
              <span>{scopeSuites.length ? `${scopeSuites.length} suites available in the current scope.` : "No suites available in the current scope yet."}</span>
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
              testCases={testCases}
              value={executionHookDraft}
            />

            <FormField label="Suite scope" required>
              <div className="suite-modal-picker-shell suite-modal-picker-shell--scope">
                <SuiteScopePicker
                  description="Select the suites to snapshot for this run, then adjust their order if you need a different run sequence."
                  emptyMessage="No suites available for this app type yet."
                  heading="Available suites"
                  onChange={onSuiteSelectionChange}
                  selectedSuiteIds={selectedSuiteIds}
                  suites={scopeSuites}
                />
              </div>
            </FormField>

            {!scopeSuites.length && selectedAppType ? <div className="empty-state compact">No suites available for this app type. Create a suite first.</div> : null}
          </div>

          <div className="action-row execution-create-actions">
            <button className="primary-button" disabled={!canCreateExecution || isSubmitting} type="submit">
              {isSubmitting
                ? "Creating…"
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

function SuiteLabelsField({
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
              aria-label="Select or add suite labels"
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
            <div className="requirement-label-menu" role="listbox" aria-label="Available suite labels">
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
                <span>{label}</span>
                <button aria-label={`Remove ${label}`} onClick={() => removeLabel(label)} type="button">x</button>
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </FormField>
  );
}

function SuiteModal({
  mode,
  suite,
  appTypeCases,
  availableLabels,
  canConfigureParallelAutomation,
  moduleLabelByCaseId,
  selectedCaseIds,
  onClose,
  onSubmit,
  isSaving
}: {
  mode: SuiteModalMode;
  suite: TestSuite | null;
  appTypeCases: TestCase[];
  availableLabels: string[];
  canConfigureParallelAutomation: boolean;
  moduleLabelByCaseId: Record<string, string>;
  selectedCaseIds: string[];
  onClose: () => void;
  onSubmit: (input: { name: string; labels: string[]; selectedIds: string[]; parallel_enabled?: boolean; parallel_count?: number }) => void;
  isSaving: boolean;
}) {
  const dialogRef = useDialogFocus<HTMLDivElement>({ closeDisabled: isSaving, onClose });
  const availableCaseIdSet = useMemo(
    () => new Set(appTypeCases.map((testCase) => testCase.id)),
    [appTypeCases]
  );
  const initialSelectedIds = useMemo(
    () => selectedCaseIds.filter((testCaseId) => availableCaseIdSet.has(testCaseId)),
    [availableCaseIdSet, selectedCaseIds]
  );

  const [name, setName] = useState(() => (mode === "edit" && suite ? suite.name : ""));
  const [labelsText, setLabelsText] = useState(() => (mode === "edit" && suite ? formatReferenceList(suite.labels) : ""));
  const [parallelEnabled, setParallelEnabled] = useState(() => canConfigureParallelAutomation && Boolean(mode === "edit" && suite?.parallel_enabled));
  const [parallelCount, setParallelCount] = useState(() => Math.max(1, Number(mode === "edit" ? suite?.parallel_count || 1 : 1)));
  const [localSelectedIds, setLocalSelectedIds] = useState<string[]>(() => initialSelectedIds);
  const initialSelectedIdsKey = initialSelectedIds.join("::");

  useEffect(() => {
    if (mode === "edit" && suite) {
      setName(suite.name);
      setLabelsText(formatReferenceList(suite.labels));
      setParallelEnabled(canConfigureParallelAutomation && Boolean(suite.parallel_enabled));
      setParallelCount(Math.max(1, Number(suite.parallel_count || 1)));
      setLocalSelectedIds(initialSelectedIds);
      return;
    }

    setLocalSelectedIds((current) => current.filter((testCaseId) => availableCaseIdSet.has(testCaseId)));
  }, [availableCaseIdSet, canConfigureParallelAutomation, initialSelectedIdsKey, mode, suite?.id, suite?.labels, suite?.name, suite?.parallel_enabled, suite?.parallel_count]);

  return (
    <div className="modal-backdrop" onClick={() => !isSaving && onClose()} role="presentation">
      <div
        className="modal-card suite-create-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="suite-editor-title"
        onClick={(event) => event.stopPropagation()}
        ref={dialogRef}
        tabIndex={-1}
      >
        <div className="suite-create-header">
          <div className="suite-create-title">
            <div className="modal-title-info-row">
              <h2 className="dialog-title" id="suite-editor-title">{mode === "edit" ? "Edit suite" : "Create suite"}</h2>
              <InfoTooltip
                content="Choose the reusable cases once, keep their saved order with the arrow controls, and submit from this modal."
                label="Suite editor information"
              />
            </div>
          </div>
          <DialogCloseButton disabled={isSaving} label={`Close ${mode === "edit" ? "suite editor" : "create suite"}`} onClick={onClose} />
        </div>

        <form
          className="form-grid suite-modal-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit({
              name,
              labels: parseReferenceList(labelsText),
              parallel_enabled: canConfigureParallelAutomation && parallelEnabled,
              parallel_count: canConfigureParallelAutomation && parallelEnabled ? parallelCount : 1,
              selectedIds: localSelectedIds
            });
          }}
        >
          <div className="suite-modal-body">
            <div className="record-grid suite-modal-config-grid">
              <FormField label="Suite name">
                <input autoFocus required value={name} onChange={(event) => setName(event.target.value)} />
              </FormField>
              <SuiteLabelsField
                availableLabels={availableLabels}
                value={labelsText}
                onChange={setLabelsText}
              />
              {canConfigureParallelAutomation ? (
                <FormField label="Suite parallel execution">
                  <div className="execution-parallel-control">
                    <label>
                      <input checked={parallelEnabled} onChange={(event) => setParallelEnabled(event.target.checked)} type="checkbox" />
                      <span>Run this suite in parallel</span>
                    </label>
                    <input
                      aria-label="Suite parallel count"
                      disabled={!parallelEnabled}
                      max={50}
                      min={1}
                      onChange={(event) => setParallelCount(Math.max(1, Number(event.target.value) || 1))}
                      type="number"
                      value={parallelCount}
                    />
                  </div>
                </FormField>
              ) : null}
            </div>

            <div className="suite-modal-picker-shell">
              <SuiteCasePicker
                cases={appTypeCases}
                description=""
                emptyMessage="No test cases available in this app type yet."
                heading="App type test cases"
                moduleLabelByCaseId={moduleLabelByCaseId}
                onChange={setLocalSelectedIds}
                selectedCaseIds={localSelectedIds}
              />
            </div>
          </div>

          <div className="action-row suite-modal-actions">
            <button className="primary-button" disabled={isSaving} type="submit">
              {isSaving ? "Saving…" : mode === "edit" ? "Save Suite" : "Create Suite"}
            </button>
            <button className="ghost-button" disabled={isSaving} onClick={onClose} type="button">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
