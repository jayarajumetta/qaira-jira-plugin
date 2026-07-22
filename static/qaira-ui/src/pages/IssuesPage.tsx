import { FormEvent, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ClearSelectionIcon, ExportIcon, SearchIcon, SelectAllIcon, SparkIcon } from "../components/AppIcons";
import { AiInsightPreviewDialog, type AiPreviewFinding } from "../components/AiInsightPreviewDialog";
import { AiPromptContextPanel } from "../components/AiPromptContextPanel";
import { CatalogSelectionControls } from "../components/CatalogSelectionControls";
import { CatalogSearchFilter } from "../components/CatalogSearchFilter";
import { CatalogViewToggle } from "../components/CatalogViewToggle";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { DialogCloseButton } from "../components/DialogCloseButton";
import { DisplayIdBadge } from "../components/DisplayIdBadge";
import { FormField } from "../components/FormField";
import { JiraAttachmentPanel } from "../components/JiraAttachmentPanel";
import { JiraRequiredFields } from "../components/JiraRequiredFields";
import { LoadingState } from "../components/LoadingState";
import { PageHeader } from "../components/PageHeader";
import { Panel } from "../components/Panel";
import { RichTextContent, RichTextEditor, richTextToPlainText } from "../components/RichTextEditor";
import { ReportBugSplitActionButton } from "../components/ReportBugSplitActionButton";
import { TileCardSkeletonGrid } from "../components/TileCardSkeletonGrid";
import { TileCardStatusIndicator, formatTileCardLabel, getTileCardTone } from "../components/TileCardPrimitives";
import { WorkspaceBackButton, WorkspaceMasterDetail } from "../components/WorkspaceMasterDetail";
import { useDeleteConfirmation } from "../components/DeleteConfirmationDialog";
import { useDomainMetadata } from "../hooks/useDomainMetadata";
import { useFeatureFlags } from "../hooks/useFeatureFlags";
import { useCurrentProject } from "../hooks/useCurrentProject";
import { api } from "../lib/api";
import { isJiraCoreFieldRequired } from "../lib/jiraCreateMetadata";
import { mergeAiReferenceImagesWithinBudget, parseExternalLinks, readImageFiles } from "../lib/aiDesignStudio";
import { areFeatureFlagsEnabled } from "../lib/featureFlags";
import { safeBugReportReturnRoute } from "../lib/bugReportNavigation";
import { hasPermission } from "../lib/permissions";
import { getJiraBrowseUrl } from "../lib/jiraBrowseUrl";
import { asArray } from "../lib/collectionGuards";
import { downloadCsvRecords } from "../lib/csvExport";
import { readDefaultCatalogViewMode } from "../lib/viewPreferences";
import { useWorkspaceData } from "../hooks/useWorkspaceData";
import type { AiBugDraftPreview, AiDesignImageInput, Issue, Requirement, TestCase } from "../types";

const MAX_AI_BUG_TRIAGE_ITEMS = 10;
const BULK_BUG_DELETE_BATCH_SIZE = 20;
const BUG_EXPORT_BATCH_SIZE = 100;

type IssueDraft = {
  title: string;
  message: string;
  steps_to_reproduce: string;
  expected_result: string;
  actual_result: string;
  severity: string;
  priority: string;
  environment: string;
  build: string;
  jira_bug_key: string;
  linked_test_run_id: string;
  linked_test_case_ids: string[];
  linked_test_suite_ids: string[];
  linked_module_ids: string[];
  linked_requirement_ids: string[];
  assignee_id: string;
  root_cause: string;
  status: string;
  labelsText: string;
  sprint: string;
  release: string;
  additional_fields: Record<string, unknown>;
};

const DEFAULT_ISSUE_STATUS_OPTIONS = [
  { value: "To Do", label: "To Do", category_key: "new", category_name: "To Do" },
  { value: "In Progress", label: "In Progress", category_key: "indeterminate", category_name: "In Progress" },
  { value: "Done", label: "Done", category_key: "done", category_name: "Done" }
];

function jiraStatusOptionLabel(option: { label: string; category_name?: string | null; current?: boolean }) {
  const category = String(option.category_name || "").trim();
  return `${option.label}${category && category.toLowerCase() !== option.label.toLowerCase() ? ` · ${category}` : ""}${option.current ? " · current" : ""}`;
}

const ISSUE_SEVERITY_OPTIONS = [
  { value: "", label: "Not set" },
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" }
];

const ISSUE_PRIORITY_OPTIONS = [
  { value: "", label: "Not set" },
  { value: "Highest", label: "Highest" },
  { value: "High", label: "High" },
  { value: "Medium", label: "Medium" },
  { value: "Low", label: "Low" },
  { value: "Lowest", label: "Lowest" }
];

const createEmptyIssueDraft = (defaultStatus = "To Do"): IssueDraft => ({
  title: "",
  message: "",
  steps_to_reproduce: "",
  expected_result: "",
  actual_result: "",
  severity: "",
  priority: "",
  environment: "",
  build: "",
  jira_bug_key: "",
  linked_test_run_id: "",
  linked_test_case_ids: [],
  linked_test_suite_ids: [],
  linked_module_ids: [],
  linked_requirement_ids: [],
  assignee_id: "",
  root_cause: "",
  status: defaultStatus,
  labelsText: "",
  sprint: "",
  release: "",
  additional_fields: {}
});

const parseQueryIdList = (...values: Array<string | null | undefined>) =>
  Array.from(
    new Set(
      values
        .flatMap((value) => String(value || "").split(/[,\n;|]/))
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );

const createIssueDraftFromQuery = (searchParams: URLSearchParams, defaultStatus: string): IssueDraft => {
  const runId = searchParams.get("run") || "";
  const linkedTestCaseIds = parseQueryIdList(
    searchParams.get("testCase"),
    searchParams.get("testCaseId"),
    searchParams.get("case"),
    searchParams.get("caseId"),
    searchParams.get("linked_test_case_ids"),
    searchParams.get("testCases")
  );
  const linkedRequirementIds = parseQueryIdList(
    searchParams.get("requirement"),
    searchParams.get("requirementId"),
    searchParams.get("linked_requirement_ids"),
    searchParams.get("requirements")
  );
  const linkedTestSuiteIds = parseQueryIdList(
    searchParams.get("suite"),
    searchParams.get("suiteId"),
    searchParams.get("linked_test_suite_ids"),
    searchParams.get("suites")
  );
  const linkedModuleIds = parseQueryIdList(
    searchParams.get("module"),
    searchParams.get("moduleId"),
    searchParams.get("linked_module_ids"),
    searchParams.get("modules")
  );
  const title = searchParams.get("title") || (runId ? `Run bug: ${runId}` : "");
  const message = searchParams.get("message") || [
    "Reported from run details.",
    "",
    runId ? `Run ID: ${runId}` : "",
    searchParams.get("runName") ? `Run name: ${searchParams.get("runName")}` : "",
    searchParams.get("status") ? `Run status: ${searchParams.get("status")}` : "",
    "",
    "Bug details:"
  ].filter((line) => line !== "").join("\n");

  return {
    title,
    message,
    steps_to_reproduce: "",
    expected_result: "",
    actual_result: "",
    severity: "",
    priority: "",
    environment: searchParams.get("environment") || "",
    build: searchParams.get("build") || "",
    jira_bug_key: searchParams.get("jira") || searchParams.get("jiraBugKey") || "",
    linked_test_run_id: runId,
    linked_test_case_ids: linkedTestCaseIds,
    linked_test_suite_ids: linkedTestSuiteIds,
    linked_module_ids: linkedModuleIds,
    linked_requirement_ids: linkedRequirementIds,
    assignee_id: "",
    root_cause: "",
    status: defaultStatus,
    labelsText: "",
    sprint: "",
    release: "",
    additional_fields: {}
  };
};

const optionalDraftValue = (value: string) => {
  return value.trim();
};

const buildIssuePayload = (draft: IssueDraft, userId: string) => ({
  user_id: userId,
  title: draft.title,
  message: draft.message,
  steps_to_reproduce: optionalDraftValue(draft.steps_to_reproduce),
  expected_result: optionalDraftValue(draft.expected_result),
  actual_result: optionalDraftValue(draft.actual_result),
  severity: optionalDraftValue(draft.severity),
  priority: optionalDraftValue(draft.priority),
  environment: optionalDraftValue(draft.environment),
  build: optionalDraftValue(draft.build),
  jira_bug_key: optionalDraftValue(draft.jira_bug_key),
  linked_test_run_id: optionalDraftValue(draft.linked_test_run_id),
  linked_test_case_ids: draft.linked_test_case_ids,
  linked_test_suite_ids: draft.linked_test_suite_ids,
  linked_module_ids: draft.linked_module_ids,
  linked_requirement_ids: draft.linked_requirement_ids,
  assignee_id: optionalDraftValue(draft.assignee_id),
  root_cause: optionalDraftValue(draft.root_cause),
  status: draft.status,
  labels: draft.labelsText.split(",").map((value) => value.trim()).filter(Boolean),
  sprint: optionalDraftValue(draft.sprint),
  fix_version: optionalDraftValue(draft.release),
  release: optionalDraftValue(draft.release),
  additional_fields: draft.additional_fields
});

type ImpactPickerOption = {
  id: string;
  displayId?: string | null;
  title: string;
  meta?: string;
};

function ImpactCheckboxPicker({
  disabled,
  emptyText,
  items,
  label,
  onChange,
  placeholder,
  selectedIds
}: {
  disabled?: boolean;
  emptyText: string;
  items: ImpactPickerOption[];
  label: string;
  onChange: (ids: string[]) => void;
  placeholder: string;
  selectedIds: string[];
}) {
  const [search, setSearch] = useState("");
  const normalizedSearch = search.trim().toLowerCase();
  const visibleItems = useMemo(
    () =>
      items.filter((item) =>
        !normalizedSearch ||
        [item.id, item.displayId || "", item.title, item.meta || ""]
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch)
      ),
    [items, normalizedSearch]
  );
  const visibleIds = visibleItems.map((item) => item.id);
  const areAllVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
  const toggleItem = (id: string, checked: boolean) => {
    onChange(checked ? [...new Set([...selectedIds, id])] : selectedIds.filter((selectedId) => selectedId !== id));
  };

  return (
    <FormField label={label}>
      <div className="impact-checkbox-picker">
        <div className="impact-checkbox-toolbar">
          <label className="impact-checkbox-search">
            <SearchIcon />
            <input
              disabled={disabled}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={placeholder}
              value={search}
            />
          </label>
          <button
            className="ghost-button compact"
            disabled={disabled || !visibleIds.length || areAllVisibleSelected}
            onClick={() => onChange([...new Set([...selectedIds, ...visibleIds])])}
            type="button"
          >
            <SelectAllIcon />
            <span>Select all</span>
          </button>
          <button
            className="ghost-button compact"
            disabled={disabled || !selectedIds.length}
            onClick={() => onChange([])}
            type="button"
          >
            <ClearSelectionIcon />
            <span>Clear</span>
          </button>
        </div>
        <div className="impact-checkbox-list" role="listbox" aria-label={label}>
          {visibleItems.map((item) => {
            const isChecked = selectedIds.includes(item.id);

            return (
              <label className={isChecked ? "impact-checkbox-option is-selected" : "impact-checkbox-option"} key={item.id}>
                <input
                  checked={isChecked}
                  disabled={disabled}
                  onChange={(event) => toggleItem(item.id, event.target.checked)}
                  type="checkbox"
                />
                <span>
                  <strong>{item.title}</strong>
                  <small>{[item.displayId || item.id, item.meta].filter(Boolean).join(" · ")}</small>
                </span>
              </label>
            );
          })}
          {!visibleItems.length ? <div className="empty-state compact">{items.length ? "No records match this search." : emptyText}</div> : null}
        </div>
      </div>
    </FormField>
  );
}

export function IssuesPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { session } = useAuth();
  const [projectId] = useCurrentProject();
  const featureFlagsQuery = useFeatureFlags(Boolean(session));
  const canViewAttachments = hasPermission(session, "attachment.view");
  const canCreateAttachments = hasPermission(session, "attachment.create");
  const canDeleteAttachments = hasPermission(session, "attachment.delete");
  const canManageBugs = hasPermission(session, "feedback.manage");
  const { confirmDelete, confirmationDialog } = useDeleteConfirmation();
  const domainMetadataQuery = useDomainMetadata();
  const canUseAiBugTriage = canManageBugs
    && areFeatureFlagsEnabled(featureFlagsQuery.data, ["qaira.ai.bug_triage"]);
  const [searchParams, setSearchParams] = useSearchParams();
  const bugReturnTo = safeBugReportReturnRoute(searchParams.get("returnTo"));
  const bugReturnLabel = String(searchParams.get("returnLabel") || "previous QA screen").slice(0, 80);
  const issueMetadata = domainMetadataQuery.data?.issues || domainMetadataQuery.data?.feedback;
  const defaultIssueStatus = issueMetadata?.default_status || "To Do";
  const issueStatusOptions = issueMetadata?.statuses?.length ? issueMetadata.statuses : DEFAULT_ISSUE_STATUS_OPTIONS;
  const jiraSprints = asArray(domainMetadataQuery.data?.jira?.sprints);
  const jiraVersions = asArray(domainMetadataQuery.data?.jira?.versions).filter((version) => !version.archived);
  const emptyDraft = useMemo(() => createEmptyIssueDraft(defaultIssueStatus), [defaultIssueStatus]);
  const [selectedIssueId, setSelectedIssueId] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [draft, setDraft] = useState<IssueDraft>(() => createEmptyIssueDraft());
  const seededIssueDraftKeyRef = useRef("");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");
  const [catalogViewMode, setCatalogViewMode] = useState<"tile" | "list">(() => readDefaultCatalogViewMode());
  const [selectedActionIssueIds, setSelectedActionIssueIds] = useState<string[]>([]);
  const [isDeletingSelectedIssues, setIsDeletingSelectedIssues] = useState(false);
  const [isExportingIssues, setIsExportingIssues] = useState(false);
  const [isAiBugTriageOpen, setIsAiBugTriageOpen] = useState(false);
  const [issueSearch, setIssueSearch] = useState("");
  const deferredIssueSearch = useDeferredValue(issueSearch);
  const [isAiBugDraftOpen, setIsAiBugDraftOpen] = useState(false);
  const [aiIntent, setAiIntent] = useState("");
  const [aiEvidence, setAiEvidence] = useState("");
  const [aiAdditionalContext, setAiAdditionalContext] = useState("");
  const [aiExternalLinksText, setAiExternalLinksText] = useState("");
  const [aiReferenceImages, setAiReferenceImages] = useState<AiDesignImageInput[]>([]);
  const [aiLinkedRunId, setAiLinkedRunId] = useState("");
  const [aiLinkedCaseIds, setAiLinkedCaseIds] = useState<string[]>([]);
  const [aiLinkedRequirementIds, setAiLinkedRequirementIds] = useState<string[]>([]);
  const [aiDraftPreview, setAiDraftPreview] = useState<AiBugDraftPreview | null>(null);
  const [aiDraftMessage, setAiDraftMessage] = useState("");
  const [isAiContextCollapsed, setIsAiContextCollapsed] = useState(false);
  const [hasAppliedBugContextDefaults, setHasAppliedBugContextDefaults] = useState(true);
  const [hasAppliedAiBugContextDefaults, setHasAppliedAiBugContextDefaults] = useState(true);
  const shouldLoadBugContext = isCreating || Boolean(selectedIssueId) || isAiBugDraftOpen;
  const { issues, users, executions, testCases, testSuites, requirements } = useWorkspaceData({
    roles: false,
    projects: false,
    projectMembers: false,
    appTypes: false,
    testSuites: shouldLoadBugContext,
    executionResults: false,
    issuesProjection: "summary",
    users: shouldLoadBugContext,
    executions: shouldLoadBugContext,
    testCases: shouldLoadBugContext,
    requirements: shouldLoadBugContext,
    testCasesProjection: "summary"
  });
  const testCaseModulesQuery = useQuery({
    queryKey: ["test-case-modules", projectId, "bug-scope"],
    queryFn: () => api.testCaseModules.list(),
    enabled: Boolean(projectId && shouldLoadBugContext),
    staleTime: 30_000
  });
  const selectedIssueQuery = useQuery({
    queryKey: ["bug-detail", projectId, selectedIssueId],
    queryFn: () => api.issues.get(selectedIssueId, { project_id: projectId }),
    enabled: Boolean(projectId && selectedIssueId),
    staleTime: 30_000
  });
  const bugCreateMetadataQuery = useQuery({
    queryKey: ["bug-create-metadata", projectId],
    queryFn: () => api.issues.createMetadata({ project_id: projectId }),
    enabled: Boolean(projectId && isCreating),
    staleTime: 5 * 60_000
  });
  const bugEditMetadataQuery = useQuery({
    queryKey: ["bug-edit-metadata", projectId, selectedIssueId],
    queryFn: () => api.issues.editMetadata(selectedIssueId, { project_id: projectId }),
    enabled: Boolean(projectId && selectedIssueId && !isCreating),
    staleTime: 60_000
  });

  const items = asArray<Issue>(issues.data);
  const userItems = asArray(users.data);
  const executionItems = asArray(executions.data);
  const testCaseItems = asArray<TestCase>(testCases.data);
  const testSuiteItems = asArray(testSuites.data);
  const testCaseModuleItems = asArray(testCaseModulesQuery.data);
  const requirementItems = asArray<Requirement>(requirements.data);
  const executionById = useMemo(() => new Map(executionItems.map((execution) => [execution.id, execution])), [executionItems]);
  const testCaseById = useMemo(() => new Map(testCaseItems.map((testCase) => [testCase.id, testCase])), [testCaseItems]);
  const requirementIdsFromTestCases = (testCaseIds: string[]) =>
    Array.from(
      new Set(
        testCaseIds.flatMap((testCaseId) => {
          const testCase = testCaseById.get(testCaseId);
          return [
            ...(testCase?.requirement_ids || []),
            testCase?.requirement_id || ""
          ].filter(Boolean);
        })
      )
    );
  const updateDraftLinkedTestCases = (nextIds: string[]) => {
    const uniqueIds = [...new Set(nextIds)];
    const autoRequirementIds = requirementIdsFromTestCases(uniqueIds);
    const selectedCases = uniqueIds.map((testCaseId) => testCaseById.get(testCaseId)).filter(Boolean);
    const autoSuiteIds = selectedCases.flatMap((testCase) => testCase?.suite_ids || (testCase?.suite_id ? [testCase.suite_id] : []));
    const autoModuleIds = selectedCases.flatMap((testCase) => testCase?.module_ids || []);

    setDraft((current) => ({
      ...current,
      linked_test_case_ids: uniqueIds,
      linked_test_suite_ids: [...new Set([...current.linked_test_suite_ids, ...autoSuiteIds])],
      linked_module_ids: [...new Set([...current.linked_module_ids, ...autoModuleIds])],
      linked_requirement_ids: [...new Set([...current.linked_requirement_ids, ...autoRequirementIds])]
    }));
  };
  const updateDraftLinkedSuites = (nextIds: string[]) => {
    const uniqueIds = [...new Set(nextIds)];
    setDraft((current) => ({
      ...current,
      linked_test_suite_ids: uniqueIds
    }));
  };
  const updateDraftLinkedModules = (nextIds: string[]) => {
    const uniqueIds = [...new Set(nextIds)];
    setDraft((current) => ({
      ...current,
      linked_module_ids: uniqueIds
    }));
  };
  const updateDraftLinkedRequirements = (nextIds: string[]) => {
    setDraft((current) => ({
      ...current,
      linked_requirement_ids: [...new Set(nextIds)]
    }));
  };
  const updateAiLinkedTestCases = (nextIds: string[]) => {
    const uniqueIds = [...new Set(nextIds)];
    setAiLinkedCaseIds(uniqueIds);
    setAiLinkedRequirementIds((current) => [...new Set([...current, ...requirementIdsFromTestCases(uniqueIds)])]);
  };
  const testCaseImpactOptions = useMemo<ImpactPickerOption[]>(
    () =>
      testCaseItems.map((testCase: TestCase) => ({
        id: testCase.id,
        displayId: testCase.display_id,
        title: testCase.title,
        meta: [
          testCase.status || "Draft",
          (testCase.requirement_ids || []).length || testCase.requirement_id ? `${(testCase.requirement_ids || []).length || 1} ${((testCase.requirement_ids || []).length || 1) === 1 ? "story" : "stories"}` : "No story"
        ].filter(Boolean).join(" · ")
      })),
    [testCaseItems]
  );
  const requirementImpactOptions = useMemo<ImpactPickerOption[]>(
    () =>
      requirementItems.map((requirement: Requirement) => ({
        id: requirement.id,
        displayId: requirement.display_id,
        title: requirement.title,
        meta: [
          requirement.status || "Open",
          requirement.priority ? `P${requirement.priority}` : null
        ].filter(Boolean).join(" · ")
      })),
    [requirementItems]
  );
  const suiteImpactOptions = useMemo<ImpactPickerOption[]>(
    () => testSuiteItems.map((suite) => ({
      id: suite.id,
      displayId: suite.display_id,
      title: suite.name,
      meta: `${testCaseItems.filter((testCase) => (testCase.suite_ids || (testCase.suite_id ? [testCase.suite_id] : [])).includes(suite.id)).length} test cases`
    })),
    [testCaseItems, testSuiteItems]
  );
  const moduleImpactOptions = useMemo<ImpactPickerOption[]>(
    () => testCaseModuleItems.map((module) => ({
      id: module.id,
      displayId: module.display_id,
      title: module.name,
      meta: `${module.test_case_count || module.test_case_ids?.length || 0} test cases`
    })),
    [testCaseModuleItems]
  );
  const assigneeLabelById = useMemo(
    () => new Map(userItems.map((user) => [user.id, user.name || user.email || user.id])),
    [userItems]
  );
  const runLabelById = useMemo(
    () => new Map(executionItems.map((execution) => [
      execution.id,
      [
        execution.name || execution.id,
        execution.status || null,
        execution.release ? `Release ${execution.release}` : null,
        execution.build ? `Build ${execution.build}` : null
      ].filter(Boolean).join(" · ")
    ])),
    [executionItems]
  );
  const filteredItems = useMemo(() => {
    const normalizedSearch = deferredIssueSearch.trim().toLowerCase();

    if (!normalizedSearch) {
      return items;
    }

    return items.filter((item) =>
      [
        item.id,
        item.title,
        item.message,
        item.status,
        item.severity,
        item.priority,
        item.environment,
        item.build,
        item.jira_bug_key,
        item.linked_test_run_id,
        runLabelById.get(item.linked_test_run_id || ""),
        item.assignee_id,
        assigneeLabelById.get(item.assignee_id || ""),
        item.assignee_name,
        item.assignee_email,
        item.steps_to_reproduce,
        item.expected_result,
        item.actual_result,
        item.root_cause,
        item.user_name,
        item.user_email,
        item.user_id
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch)
    );
  }, [assigneeLabelById, deferredIssueSearch, items, runLabelById]);
  const visibleIssueIds = useMemo(() => filteredItems.map((item) => item.id), [filteredItems]);
  const selectedActionIssueIdSet = useMemo(() => new Set(selectedActionIssueIds), [selectedActionIssueIds]);
  const selectedActionIssues = useMemo(
    () => items.filter((item) => selectedActionIssueIdSet.has(item.id)),
    [items, selectedActionIssueIdSet]
  );
  const areAllFilteredIssuesSelected = visibleIssueIds.length > 0 && visibleIssueIds.every((id) => selectedActionIssueIdSet.has(id));
  const areSomeFilteredIssuesSelected = visibleIssueIds.some((id) => selectedActionIssueIdSet.has(id)) && !areAllFilteredIssuesSelected;
  const setAllVisibleIssuesSelected = (selected: boolean) => {
    const visibleIds = new Set(visibleIssueIds);
    setSelectedActionIssueIds((current) => selected
      ? [...new Set([...current, ...visibleIssueIds])]
      : current.filter((id) => !visibleIds.has(id)));
  };
  const toggleIssueSelection = (issueId: string, selected: boolean) => {
    setSelectedActionIssueIds((current) => selected
      ? [...new Set([...current, issueId])]
      : current.filter((id) => id !== issueId));
  };

  useEffect(() => {
    setSelectedActionIssueIds([]);
    setIsAiBugTriageOpen(false);
  }, [projectId]);

  useEffect(() => {
    if (issues.isLoading) return;
    const availableIds = new Set(items.map((item) => item.id));
    setSelectedActionIssueIds((current) => {
      const next = current.filter((id) => availableIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [issues.isLoading, items]);
  const statusCategoryByName = useMemo(
    () => new Map(issueStatusOptions.map((option) => [option.value.toLowerCase(), String(option.category_key || option.category_name || "").toLowerCase()])),
    [issueStatusOptions]
  );
  const openIssueCount = items.filter((item) => {
    const category = String(item.status_category || statusCategoryByName.get(String(item.status || defaultIssueStatus).toLowerCase()) || "").toLowerCase();
    return category !== "done";
  }).length;
  const selectedItem = selectedIssueQuery.data
    || (!selectedIssueQuery.isLoading ? items.find((item) => item.id === selectedIssueId) || null : null);
  const activeBugMetadata = isCreating ? bugCreateMetadataQuery.data : bugEditMetadataQuery.data;
  const activeBugStatusOptions = useMemo(() => {
    const workflowOptions = activeBugMetadata?.workflow_statuses?.statuses || [];
    const baseOptions = workflowOptions.length ? workflowOptions : issueStatusOptions;
    if (!draft.status || baseOptions.some((option) => option.value === draft.status)) return baseOptions;
    return [{ value: draft.status, label: draft.status, current: !isCreating }, ...baseOptions];
  }, [activeBugMetadata?.workflow_statuses?.statuses, draft.status, isCreating, issueStatusOptions]);
  const requiredJiraBugFields = activeBugMetadata?.required_fields || [];
  const jiraBugCoreRequired = {
    priority: isJiraCoreFieldRequired(activeBugMetadata, "priority"),
    assignee: isJiraCoreFieldRequired(activeBugMetadata, "assignee"),
    labels: isJiraCoreFieldRequired(activeBugMetadata, "labels"),
    sprint: isJiraCoreFieldRequired(activeBugMetadata, "sprint"),
    release: isJiraCoreFieldRequired(activeBugMetadata, "fixVersions", "versions")
  };
  const updateAdditionalJiraField = (fieldId: string, value: unknown) => {
    setDraft((current) => ({
      ...current,
      additional_fields: {
        ...current.additional_fields,
        [fieldId]: value
      }
    }));
  };
  const syncIssueSearchParams = (issueId?: string | null) => {
    const currentIssueId = searchParams.get("issue") || "";
    const targetIssueId = issueId || "";

    if (currentIssueId === targetIssueId) {
      return;
    }

    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (targetIssueId) {
        next.set("issue", targetIssueId);
      } else {
        next.delete("issue");
      }
      return next;
    }, { replace: true });
  };
  const openIssueWorkspace = (issueId: string) => {
    syncIssueSearchParams(issueId);
    setSelectedIssueId(issueId);
    setIsCreating(false);
  };
  const issueListColumns = useMemo<Array<DataTableColumn<Issue>>>(() => [
    {
      key: "select",
      label: "Select Bugs",
      canToggle: false,
      canReorder: false,
      canResize: false,
      width: 36,
      minWidth: 36,
      headerRender: () => (
        <label className="data-table-header-checkbox" onClick={(event) => event.stopPropagation()}>
          <input
            aria-label={areAllFilteredIssuesSelected ? "Clear all visible Bugs" : "Select all visible Bugs"}
            checked={areAllFilteredIssuesSelected}
            disabled={!visibleIssueIds.length}
            onChange={(event) => setAllVisibleIssuesSelected(event.target.checked)}
            ref={(element) => {
              if (element) element.indeterminate = areSomeFilteredIssuesSelected;
            }}
            type="checkbox"
          />
        </label>
      ),
      render: (item) => (
        <label className="data-table-row-checkbox">
          <input
            aria-label={`Select Bug ${item.jira_bug_key || item.id}: ${item.title}`}
            checked={selectedActionIssueIdSet.has(item.id)}
            onChange={(event) => toggleIssueSelection(item.id, event.target.checked)}
            type="checkbox"
          />
        </label>
      )
    },
    {
      key: "id",
      label: "ID",
      width: 132,
      minWidth: 100,
      sortValue: (item) => item.id,
      render: (item) => <DisplayIdBadge value={item.jira_bug_key || item.id} href={getJiraBrowseUrl(item.jira_bug_key, item.jira_url)} />
    },
    {
      key: "title",
      label: "Bug Title",
      canToggle: false,
      width: 280,
      minWidth: 180,
      sortValue: (item) => item.title,
      render: (item) => (
        <div className="data-table-multiline">
          <strong>{item.title}</strong>
        </div>
      )
    },
    {
      key: "description",
      label: "Description",
      defaultVisible: false,
      width: 360,
      minWidth: 200,
      render: (item) => <span className="data-table-description-clamp">{richTextToPlainText(item.message)}</span>
    },
    {
      key: "status",
      label: "Status",
      width: 132,
      minWidth: 104,
      sortValue: (item) => item.status || defaultIssueStatus,
      render: (item) => formatTileCardLabel(item.status, "Open")
    },
    {
      key: "jira",
      label: "Jira Bug Key",
      defaultVisible: false,
      width: 150,
      minWidth: 120,
      sortValue: (item) => item.jira_bug_key || "",
      render: (item) => item.jira_bug_key || "—"
    },
    {
      key: "severity",
      label: "Severity",
      width: 132,
      minWidth: 104,
      sortValue: (item) => item.severity || "",
      render: (item) => formatTileCardLabel(item.severity, "Not set")
    },
    {
      key: "priority",
      label: "Priority",
      width: 120,
      minWidth: 96,
      sortValue: (item) => item.priority || "",
      render: (item) => formatTileCardLabel(item.priority, "Not set")
    },
    {
      key: "linkedRun",
      label: "Linked Test Run",
      defaultVisible: false,
      width: 240,
      minWidth: 160,
      sortValue: (item) => runLabelById.get(item.linked_test_run_id || "") || item.linked_test_run_id || "",
      render: (item) => runLabelById.get(item.linked_test_run_id || "") || item.linked_test_run_id || "—"
    },
    {
      key: "environment",
      label: "Environment",
      defaultVisible: false,
      width: 160,
      minWidth: 120,
      sortValue: (item) => item.environment || "",
      render: (item) => item.environment || "—"
    },
    {
      key: "build",
      label: "Build",
      defaultVisible: false,
      width: 150,
      minWidth: 110,
      sortValue: (item) => item.build || "",
      render: (item) => item.build || "—"
    },
    {
      key: "assignee",
      label: "Assignee",
      width: 220,
      minWidth: 150,
      sortValue: (item) => item.assignee_name || item.assignee_email || assigneeLabelById.get(item.assignee_id || "") || "",
      render: (item) => item.assignee_name || item.assignee_email || assigneeLabelById.get(item.assignee_id || "") || "Unassigned"
    },
    {
      key: "reporter",
      label: "Reporter",
      defaultVisible: false,
      width: 220,
      minWidth: 150,
      sortValue: (item) => item.user_name || item.user_email || item.user_id || "",
      render: (item) => item.user_name || item.user_email || item.user_id || "Unknown"
    },
  ], [
    areAllFilteredIssuesSelected,
    areSomeFilteredIssuesSelected,
    assigneeLabelById,
    defaultIssueStatus,
    runLabelById,
    selectedActionIssueIdSet,
    visibleIssueIds
  ]);

  const handleExportIssuesCsv = async () => {
    if (!projectId || !selectedActionIssues.length || isExportingIssues) return;
    setIsExportingIssues(true);
    setMessage("");
    try {
      const exportedItems: Issue[] = [];
      const selectedIssueIds = selectedActionIssues.map((item) => item.id);
      for (let offset = 0; offset < selectedIssueIds.length; offset += BUG_EXPORT_BATCH_SIZE) {
        const response = await api.issues.export({
          project_id: projectId,
          issue_ids: selectedIssueIds.slice(offset, offset + BUG_EXPORT_BATCH_SIZE)
        });
        exportedItems.push(...asArray<Issue>(response.bugs));
      }
      const exportedById = new Map(exportedItems.map((item) => [item.id, item]));
      const selectedItems = selectedIssueIds.map((id) => exportedById.get(id)).filter((item): item is Issue => Boolean(item));
      if (selectedItems.length !== selectedIssueIds.length) {
        throw new Error("Some selected Bugs changed or became unavailable. Refresh the list and retry the export.");
      }
      downloadCsvRecords(
        `qaira-bugs-${new Date().toISOString().slice(0, 10)}.csv`,
        selectedItems.map((item) => ({
          ID: item.id,
          "Bug Title": item.title,
          Description: richTextToPlainText(item.message),
          Status: formatTileCardLabel(item.status, "Open"),
          "Jira Bug Key": item.jira_bug_key || "",
          Severity: formatTileCardLabel(item.severity, "Not set"),
          Priority: formatTileCardLabel(item.priority, "Not set"),
          "Linked Test Run": runLabelById.get(item.linked_test_run_id || "") || item.linked_test_run_id || "",
          Environment: item.environment || "",
          Build: item.build || "",
          Assignee: item.assignee_name || item.assignee_email || assigneeLabelById.get(item.assignee_id || "") || "Unassigned",
          Reporter: item.user_name || item.user_email || item.user_id || "Unknown",
          "Steps To Reproduce": richTextToPlainText(item.steps_to_reproduce),
          "Expected Result": richTextToPlainText(item.expected_result),
          "Actual Result": richTextToPlainText(item.actual_result),
          "Root Cause": richTextToPlainText(item.root_cause)
        }))
      );
      setMessageTone("success");
      setMessage(`Exported ${selectedItems.length} selected Bug${selectedItems.length === 1 ? "" : "s"} with current Jira details.`);
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "Unable to export the selected Bugs.");
    } finally {
      setIsExportingIssues(false);
    }
  };

  useEffect(() => {
    if (searchParams.get("create") !== "1") {
      return;
    }

    setIsCreating(true);
    setSelectedIssueId("");
    setDraft(createIssueDraftFromQuery(searchParams, defaultIssueStatus));
    setHasAppliedBugContextDefaults(false);

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("create");
    nextParams.delete("issue");
    setSearchParams(nextParams, { replace: true });
  }, [defaultIssueStatus, searchParams, setSearchParams]);

  useEffect(() => {
    if (issues.isLoading || issues.isFetching) {
      return;
    }

    const requestedIssueId = searchParams.get("issue");

    if (requestedIssueId && items.some((item) => item.id === requestedIssueId)) {
      if (selectedIssueId !== requestedIssueId) {
        setSelectedIssueId(requestedIssueId);
        setIsCreating(false);
      }
      return;
    }

    if (requestedIssueId) {
      if (selectedIssueId === requestedIssueId) {
        return;
      }

      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete("issue");
        return next;
      }, { replace: true });
    }
  }, [issues.isFetching, issues.isLoading, items, searchParams, selectedIssueId, setSearchParams]);

  useEffect(() => {
    if (isCreating) {
      seededIssueDraftKeyRef.current = "";
      return;
    }

    if (!selectedIssueId) {
      seededIssueDraftKeyRef.current = "";
      setDraft(emptyDraft);
      return;
    }

    if (selectedItem) {
      const draftSeedKey = [
        selectedItem.id,
        selectedItem.revision ?? "no-revision",
        selectedItem.updated_at || "",
        selectedIssueQuery.data?.id === selectedItem.id ? "detail" : "summary"
      ].join(":");
      if (seededIssueDraftKeyRef.current === draftSeedKey) return;
      seededIssueDraftKeyRef.current = draftSeedKey;
      setDraft({
        title: selectedItem.title,
        message: selectedItem.message,
        steps_to_reproduce: selectedItem.steps_to_reproduce || "",
        expected_result: selectedItem.expected_result || "",
        actual_result: selectedItem.actual_result || "",
        severity: selectedItem.severity || "",
        priority: selectedItem.priority || "",
        environment: selectedItem.environment || "",
        build: selectedItem.build || "",
        jira_bug_key: selectedItem.jira_bug_key || "",
        linked_test_run_id: selectedItem.linked_test_run_id || "",
        linked_test_case_ids: selectedItem.linked_test_case_ids || [],
        linked_test_suite_ids: selectedItem.linked_test_suite_ids || [],
        linked_module_ids: selectedItem.linked_module_ids || [],
        linked_requirement_ids: selectedItem.linked_requirement_ids || [],
        assignee_id: selectedItem.assignee_id || "",
        root_cause: selectedItem.root_cause || "",
        status: selectedItem.status || defaultIssueStatus,
        labelsText: (selectedItem.labels || []).join(", "),
        sprint: selectedItem.sprint || "",
        release: selectedItem.fix_version || selectedItem.release || "",
        additional_fields: {}
      });
      setHasAppliedBugContextDefaults(true);
      return;
    }

    setSelectedIssueId("");
    setDraft(emptyDraft);
    setHasAppliedBugContextDefaults(true);
  }, [defaultIssueStatus, emptyDraft, isCreating, selectedIssueId, selectedItem]);

  useEffect(() => {
    if (isCreating || !selectedItem || !bugEditMetadataQuery.data) return;
    setDraft((current) => ({
      ...current,
      additional_fields: { ...(bugEditMetadataQuery.data.current_values || {}) }
    }));
  }, [bugEditMetadataQuery.data, isCreating, selectedItem]);

  useEffect(() => {
    if (!isCreating || hasAppliedBugContextDefaults || !testCaseItems.length) {
      return;
    }

    const scopedCases = testCaseItems.filter((testCase) => draft.linked_test_case_ids.includes(testCase.id));
    const scopedCaseIds = scopedCases.map((testCase) => testCase.id);
    const autoRequirementIds = requirementIdsFromTestCases(scopedCaseIds);
    const autoSuiteIds = scopedCases.flatMap((testCase) => testCase.suite_ids || (testCase.suite_id ? [testCase.suite_id] : []));
    const autoModuleIds = scopedCases.flatMap((testCase) => testCase.module_ids || []);
    setDraft((current) => ({
      ...current,
      linked_test_case_ids: [...new Set([...current.linked_test_case_ids, ...scopedCaseIds])],
      linked_test_suite_ids: [...new Set([...current.linked_test_suite_ids, ...autoSuiteIds])],
      linked_module_ids: [...new Set([...current.linked_module_ids, ...autoModuleIds])],
      linked_requirement_ids: [...new Set([...current.linked_requirement_ids, ...autoRequirementIds])]
    }));
    setHasAppliedBugContextDefaults(true);
  }, [draft.linked_module_ids, draft.linked_test_case_ids, draft.linked_test_suite_ids, hasAppliedBugContextDefaults, isCreating, testCaseItems]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["issues"] }),
      queryClient.invalidateQueries({ queryKey: ["bug-detail", projectId] })
    ]);
  };

  const previewAiBugDraft = useMutation({ mutationFn: api.issues.previewAiDraft });
  const previewAiBugTriage = useMutation({ mutationFn: api.issues.previewAiTriage });
  const aiBugTriageFindings = useMemo<AiPreviewFinding[]>(
    () => asArray(previewAiBugTriage.data?.triage).map((recommendation) => ({
      id: recommendation.issue_id,
      title: `${recommendation.display_id} · ${recommendation.category}`,
      severity: ["Highest", "High"].includes(recommendation.recommended_priority)
        ? "high"
        : recommendation.recommended_priority === "Medium"
          ? "medium"
          : "low",
      description: recommendation.explanation,
      action: asArray(recommendation.review_actions).join(" "),
      meta: `${recommendation.title} · Current ${recommendation.current_priority} · Recommended ${recommendation.recommended_priority}`,
      evidence: asArray(recommendation.signals)
    })),
    [previewAiBugTriage.data]
  );

  const openManualBugReport = () => {
    syncIssueSearchParams(null);
    setIsCreating(true);
    setSelectedIssueId("");
    setDraft(emptyDraft);
    setHasAppliedBugContextDefaults(true);
  };

  const openAiBugReport = () => {
    setAiDraftPreview(null);
    setAiDraftMessage("");
    setAiIntent("");
    setAiEvidence("");
    setAiAdditionalContext("");
    setAiExternalLinksText("");
    setAiReferenceImages([]);
    setAiLinkedRunId(searchParams.get("run") || "");
    setAiLinkedCaseIds(parseQueryIdList(searchParams.get("linked_test_case_ids"), searchParams.get("testCase")));
    setAiLinkedRequirementIds(parseQueryIdList(searchParams.get("linked_requirement_ids"), searchParams.get("requirement")));
    setHasAppliedAiBugContextDefaults(false);
    setIsAiBugDraftOpen(true);
  };

  const openSelectedBugTriage = () => {
    const selectedIssueIds = selectedActionIssues.map((item) => item.id);
    if (!projectId || !selectedIssueIds.length || !canUseAiBugTriage) return;
    if (selectedIssueIds.length > MAX_AI_BUG_TRIAGE_ITEMS) {
      setMessageTone("error");
      setMessage(`Select no more than ${MAX_AI_BUG_TRIAGE_ITEMS} Bugs for one AI triage preview. This keeps Jira reads and AI usage bounded.`);
      return;
    }
    previewAiBugTriage.reset();
    setIsAiBugTriageOpen(true);
    previewAiBugTriage.mutate({ project_id: projectId, issue_ids: selectedIssueIds });
  };

  useEffect(() => {
    if (!isAiBugDraftOpen || hasAppliedAiBugContextDefaults || !testCaseItems.length) return;
    const explicitCaseIds = parseQueryIdList(searchParams.get("linked_test_case_ids"), searchParams.get("testCase"));
    const moduleIds = parseQueryIdList(searchParams.get("linked_module_ids"), searchParams.get("module"));
    const suiteIds = parseQueryIdList(searchParams.get("linked_test_suite_ids"), searchParams.get("suite"));
    const scopedCases = explicitCaseIds.length
      ? testCaseItems.filter((testCase) => explicitCaseIds.includes(testCase.id))
      : moduleIds.length
        ? testCaseItems.filter((testCase) => (testCase.module_ids || []).some((moduleId) => moduleIds.includes(moduleId)))
        : suiteIds.length
          ? testCaseItems.filter((testCase) => (testCase.suite_ids || (testCase.suite_id ? [testCase.suite_id] : [])).some((suiteId) => suiteIds.includes(suiteId)))
          : [];
    const scopedCaseIds = scopedCases.map((testCase) => testCase.id);
    setAiLinkedCaseIds((current) => [...new Set([...current, ...scopedCaseIds])]);
    setAiLinkedRequirementIds((current) => [...new Set([...current, ...requirementIdsFromTestCases(scopedCaseIds)])]);
    setHasAppliedAiBugContextDefaults(true);
  }, [hasAppliedAiBugContextDefaults, isAiBugDraftOpen, searchParams, testCaseItems]);

  useEffect(() => {
    if (searchParams.get("ai") !== "1") return;
    openAiBugReport();
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.delete("ai");
      return next;
    }, { replace: true });
  // Query-driven launch should run once; the callback intentionally reads the captured URL context.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, setSearchParams]);

  const handleAddAiReferenceImages = async (files: FileList | null) => {
    try {
      const images = await readImageFiles(files);
      let budgetMessage = "";
      setAiReferenceImages((current) => {
        const result = mergeAiReferenceImagesWithinBudget(current, images);
        budgetMessage = result.message;
        return result.images;
      });
      if (budgetMessage) {
        setAiDraftMessage(budgetMessage);
      }
    } catch (error) {
      setAiDraftMessage(error instanceof Error ? error.message : "Unable to attach the selected reference image.");
    }
  };

  const handlePreviewAiBugDraft = async () => {
    if (!projectId || !aiIntent.trim()) {
      setAiDraftMessage("Describe the failure or bug intent before generating a draft.");
      return;
    }

    setAiDraftMessage("");
    try {
      const response = await previewAiBugDraft.mutateAsync({
        project_id: projectId,
        intent: aiIntent.trim(),
        evidence: aiEvidence.trim(),
        additional_context: aiAdditionalContext,
        external_links: parseExternalLinks(aiExternalLinksText),
        reference_photos: aiReferenceImages.map((image) => ({ name: image.name })),
        linked_test_run_id: aiLinkedRunId,
        linked_test_case_ids: aiLinkedCaseIds,
        linked_requirement_ids: aiLinkedRequirementIds
      });
      setAiDraftPreview(response);
    } catch (error) {
      setAiDraftMessage(error instanceof Error ? error.message : "Unable to generate the bug draft.");
    }
  };

  const applyAiBugDraft = () => {
    if (!aiDraftPreview) {
      return;
    }
    const candidate = aiDraftPreview.draft;
    const contextualCaseIds = parseQueryIdList(searchParams.get("linked_test_case_ids"), searchParams.get("testCase"));
    const isHierarchyScopedContext = !contextualCaseIds.length && Boolean(
      searchParams.get("linked_module_ids")
      || searchParams.get("module")
      || searchParams.get("linked_test_suite_ids")
      || searchParams.get("suite")
    );
    setDraft({
      ...emptyDraft,
      title: candidate.title,
      message: candidate.message,
      steps_to_reproduce: candidate.steps_to_reproduce,
      expected_result: candidate.expected_result,
      actual_result: candidate.actual_result,
      severity: candidate.severity,
      priority: candidate.priority,
      environment: candidate.environment,
      build: candidate.build,
      labelsText: candidate.labels.join(", "),
      linked_test_run_id: candidate.linked_test_run_id,
      linked_test_case_ids: isHierarchyScopedContext ? [] : candidate.linked_test_case_ids,
      linked_test_suite_ids: parseQueryIdList(searchParams.get("linked_test_suite_ids"), searchParams.get("suite")),
      linked_module_ids: parseQueryIdList(searchParams.get("linked_module_ids"), searchParams.get("module")),
      linked_requirement_ids: candidate.linked_requirement_ids
    });
    setHasAppliedBugContextDefaults(false);
    syncIssueSearchParams(null);
    setSelectedIssueId("");
    setIsCreating(true);
    setIsAiBugDraftOpen(false);
    setMessageTone("success");
    setMessage("AI draft applied. Review every field before saving the bug to Jira.");
  };

  const createIssue = useMutation({
    mutationFn: api.issues.create,
    onSuccess: async (response) => {
      setMessageTone("success");
      setMessage(response.status_warning
        ? `${response.status_warning.message} The bug was saved in Jira's current status.`
        : "Bug saved.");
      await refresh();
    },
    onError: (error) => {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "Unable to save bug");
    }
  });

  const updateIssue = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof api.issues.update>[1] }) =>
      api.issues.update(id, input),
    onSuccess: async () => {
      setMessageTone("success");
      setMessage("Bug updated.");
      await refresh();
    },
    onError: (error) => {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "Unable to update bug");
    }
  });

  const deleteIssue = useMutation({
    mutationFn: api.issues.delete,
    onSuccess: async (_response, deletedIssueId) => {
      setMessageTone("success");
      setMessage("Bug deleted.");
      setSelectedActionIssueIds((current) => current.filter((id) => id !== deletedIssueId));
      syncIssueSearchParams(null);
      setSelectedIssueId("");
      setDraft(emptyDraft);
      setIsCreating(false);
      await refresh();
    },
    onError: (error) => {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "Unable to delete bug");
    }
  });

  const handleDeleteSelectedIssues = async () => {
    const selectedIssueIds = selectedActionIssues.map((item) => item.id);
    if (!projectId || !canManageBugs || !selectedIssueIds.length || isDeletingSelectedIssues) return;

    const confirmed = await confirmDelete({
      message: `Delete ${selectedIssueIds.length} selected Bug${selectedIssueIds.length === 1 ? "" : "s"} from Jira? Historical test-run snapshots stay preserved, but the selected Jira Bugs and their live links will be removed.`
    });
    if (!confirmed) return;

    setIsDeletingSelectedIssues(true);
    setMessage("");
    const deletedIds: string[] = [];
    const failures: string[] = [];
    let failedIssueCount = 0;
    try {
      for (let offset = 0; offset < selectedIssueIds.length; offset += BULK_BUG_DELETE_BATCH_SIZE) {
        const batch = selectedIssueIds.slice(offset, offset + BULK_BUG_DELETE_BATCH_SIZE);
        try {
          const result = await api.issues.bulkDelete({ project_id: projectId, issue_ids: batch });
          deletedIds.push(...asArray(result.deleted_ids));
          failedIssueCount += Number(result.failed || 0);
          failures.push(...asArray(result.failures).map((failure) => `${failure.display_id}: ${failure.message}`));
        } catch (error) {
          failedIssueCount += batch.length;
          failures.push(error instanceof Error ? error.message : `Unable to delete ${batch.length} selected Bugs.`);
        }
      }

      const deletedIdSet = new Set(deletedIds);
      setSelectedActionIssueIds((current) => current.filter((id) => !deletedIdSet.has(id)));
      if (deletedIdSet.has(selectedIssueId)) {
        syncIssueSearchParams(null);
        setSelectedIssueId("");
        setDraft(emptyDraft);
        setIsCreating(false);
      }
      if (deletedIds.length) await refresh();

      setMessageTone(failures.length ? "error" : "success");
      setMessage(failures.length
        ? `${deletedIds.length} Bug${deletedIds.length === 1 ? "" : "s"} deleted; ${failedIssueCount} could not be deleted. ${failures[0]}`
        : `${deletedIds.length} Bug${deletedIds.length === 1 ? "" : "s"} deleted.`);
    } finally {
      setIsDeletingSelectedIssues(false);
    }
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!session?.user.id) {
      return;
    }

    if ((isCreating && bugCreateMetadataQuery.isLoading) || (!isCreating && bugEditMetadataQuery.isLoading)) {
      setMessageTone("success");
      setMessage(`Checking this Jira Bug's ${isCreating ? "create" : "edit"} fields. Try again in a moment.`);
      return;
    }

    if ((isCreating && bugCreateMetadataQuery.isError) || (!isCreating && bugEditMetadataQuery.isError)) {
      setMessageTone("error");
      setMessage(`Qaira could not verify this Jira Bug ${isCreating ? "create" : "edit"} screen. Refresh before saving.`);
      return;
    }

    if (isCreating || !selectedItem) {
      const response = await createIssue.mutateAsync(buildIssuePayload(draft, session.user.id));
      syncIssueSearchParams(response.id);
      setSelectedIssueId(response.id);
      setIsCreating(false);
      return;
    }

    await updateIssue.mutateAsync({
      id: selectedItem.id,
      input: { ...buildIssuePayload(draft, selectedItem.user_id), expected_revision: selectedItem.revision }
    });
  };

  const closeIssueWorkspace = () => {
    if (bugReturnTo) {
      navigate(bugReturnTo);
      return;
    }
    syncIssueSearchParams(null);
    setSelectedIssueId("");
    setIsCreating(false);
    setDraft(emptyDraft);
  };

  const closeAiBugReport = () => {
    setIsAiBugDraftOpen(false);
    if (bugReturnTo && !isCreating && !selectedIssueId) navigate(bugReturnTo);
  };

  return (
    <div className="page-content">
      {confirmationDialog}
      <AiInsightPreviewDialog
        assuranceTitle="Evidence-grounded Bug triage"
        emptyMessage="No classification recommendation was returned for the selected Bugs."
        error={previewAiBugTriage.error instanceof Error ? previewAiBugTriage.error.message : null}
        eyebrow="Bugs · AI review"
        findings={aiBugTriageFindings}
        limitations={asArray(previewAiBugTriage.data?.limitations)}
        loading={previewAiBugTriage.isPending}
        onClose={() => setIsAiBugTriageOpen(false)}
        open={isAiBugTriageOpen}
        recommendedActions={asArray(previewAiBugTriage.data?.review_sequence)}
        response={previewAiBugTriage.data}
        subtitle={`Review categories and priority recommendations for up to ${MAX_AI_BUG_TRIAGE_ITEMS} selected project Bugs. Nothing is updated automatically.`}
        summary={previewAiBugTriage.data?.summary || "Qaira compares the selected Jira Bug fields and traceability signals, then explains each recommendation for human review."}
        title="Classify and prioritize Bugs"
      />
      {isAiBugDraftOpen ? (
        <div className="modal-backdrop modal-backdrop--scroll" onClick={closeAiBugReport} role="presentation">
          <div
            aria-labelledby="ai-bug-draft-title"
            aria-modal="true"
            className="modal-card ai-design-modal ai-bug-draft-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="ai-studio-header">
              <div className="ai-studio-header-copy">
                <p className="dialog-context-label">Bugs</p>
                <h2 className="dialog-title" id="ai-bug-draft-title">Report Bug using AI</h2>
                <p>Build a Jira-ready draft from bounded project evidence, then review it before saving.</p>
              </div>
              <DialogCloseButton
                disabled={previewAiBugDraft.isPending}
                label="Close AI bug draft"
                onClick={closeAiBugReport}
              />
            </div>

            <div className={isAiContextCollapsed ? "ai-studio-shell is-sidebar-collapsed" : "ai-studio-shell"}>
              <aside className={isAiContextCollapsed ? "ai-studio-sidebar is-collapsed" : "ai-studio-sidebar"}>
                {isAiContextCollapsed ? (
                  <div className="ai-studio-sidebar-collapsed-bar">
                    <button className="ghost-button ai-studio-sidebar-toggle" onClick={() => setIsAiContextCollapsed(false)} title="Expand AI context" type="button">›</button>
                  </div>
                ) : (
                  <div className="ai-studio-sidebar-panels">
                    <div className="ai-studio-sidebar-divider">
                      <button className="ghost-button ai-studio-sidebar-toggle" onClick={() => setIsAiContextCollapsed(true)} title="Collapse AI context" type="button">‹</button>
                    </div>
                    <AiPromptContextPanel
                      additionalContext={aiAdditionalContext}
                      disabled={previewAiBugDraft.isPending}
                      externalLinksText={aiExternalLinksText}
                      onAddImages={(files) => void handleAddAiReferenceImages(files)}
                      onAdditionalContextChange={setAiAdditionalContext}
                      onExternalLinksTextChange={setAiExternalLinksText}
                      onRemoveImage={(imageUrl) => setAiReferenceImages((current) => current.filter((image) => image.url !== imageUrl))}
                      projectId={projectId}
                      referenceImages={aiReferenceImages}
                      requirements={requirementItems.filter((requirement) => aiLinkedRequirementIds.includes(requirement.id))}
                    />
                  </div>
                )}
              </aside>

              <main className="ai-studio-main ai-bug-draft-main">
                <section className="ai-studio-panel ai-bug-intent-panel">
                  <FormField label="Failure intent" required>
                    <textarea
                      autoFocus
                      disabled={previewAiBugDraft.isPending}
                      onChange={(event) => setAiIntent(event.target.value)}
                      placeholder="What failed, where it failed, and why it matters"
                      rows={4}
                      value={aiIntent}
                    />
                  </FormField>
                  <FormField label="Observed evidence">
                    <textarea
                      disabled={previewAiBugDraft.isPending}
                      onChange={(event) => setAiEvidence(event.target.value)}
                      placeholder="Error text, observed result, timestamps, logs, or reproduction notes"
                      rows={5}
                      value={aiEvidence}
                    />
                  </FormField>
                </section>

                <section className="ai-studio-panel">
                  <div className="issue-form-grid issue-form-grid--triple ai-bug-scope-grid">
                    <FormField label="Impacted Test Run">
                      <select disabled={previewAiBugDraft.isPending} onChange={(event) => setAiLinkedRunId(event.target.value)} value={aiLinkedRunId}>
                        <option value="">No linked run</option>
                        {executionItems.map((execution) => (
                          <option key={execution.id} value={execution.id}>{runLabelById.get(execution.id) || execution.id}</option>
                        ))}
                      </select>
                    </FormField>
                    <ImpactCheckboxPicker
                      disabled={previewAiBugDraft.isPending}
                      emptyText="No test cases are available for this project."
                      items={testCaseImpactOptions}
                      label="Impacted Test Cases"
                      onChange={updateAiLinkedTestCases}
                      placeholder="Search test cases"
                      selectedIds={aiLinkedCaseIds}
                    />
                    <ImpactCheckboxPicker
                      disabled={previewAiBugDraft.isPending}
                      emptyText="No stories are available for this project."
                      items={requirementImpactOptions}
                      label="Impacted Stories"
                      onChange={setAiLinkedRequirementIds}
                      placeholder="Search stories"
                      selectedIds={aiLinkedRequirementIds}
                    />
                  </div>
                </section>

                <div className="action-row ai-studio-actions">
                  <button
                    className="primary-button ai-studio-primary-action"
                    disabled={!aiIntent.trim() || previewAiBugDraft.isPending}
                    onClick={() => void handlePreviewAiBugDraft()}
                    type="button"
                  >
                    <SparkIcon />
                    <span>{previewAiBugDraft.isPending ? "Drafting…" : aiDraftPreview ? "Regenerate draft" : "Generate bug draft"}</span>
                  </button>
                </div>

                {aiDraftMessage ? <p className="inline-message error-message">{aiDraftMessage}</p> : null}

                {aiDraftPreview ? (
                  <section className="ai-bug-review-card" aria-label="AI bug draft preview">
                    <div className="ai-bug-review-head">
                      <div>
                        <span>Human review required</span>
                        <strong>{aiDraftPreview.draft.title}</strong>
                      </div>
                      <span className="count-pill">{Math.round(aiDraftPreview.provenance.confidence * 100)}% confidence</span>
                    </div>
                    <div className="ai-bug-review-grid">
                      <div><span>Severity</span><strong>{aiDraftPreview.draft.severity}</strong></div>
                      <div><span>Priority</span><strong>{aiDraftPreview.draft.priority}</strong></div>
                      <div><span>Run</span><strong>{aiDraftPreview.draft.linked_test_run_id ? runLabelById.get(aiDraftPreview.draft.linked_test_run_id) || aiDraftPreview.draft.linked_test_run_id : "Not linked"}</strong></div>
                      <div><span>Impact</span><strong>{aiDraftPreview.draft.linked_test_case_ids.length} cases · {aiDraftPreview.draft.linked_requirement_ids.length} stories</strong></div>
                    </div>
                    <p>{aiDraftPreview.draft.rationale}</p>
                    <div className="action-row">
                      <button className="primary-button" onClick={applyAiBugDraft} type="button">Review in bug form</button>
                      <button className="ghost-button" onClick={() => setAiDraftPreview(null)} type="button">Discard draft</button>
                    </div>
                  </section>
                ) : null}
              </main>
            </div>
          </div>
        </div>
      ) : null}
      {!(isCreating || selectedItem) ? (
        <PageHeader
          eyebrow="Bugs"
          title="Bugs"
          description="Capture Jira-ready bugs with reproduction details, run context, ownership, and root cause."
          meta={[
            { label: "Bugs", value: items.length },
            { label: "Open", value: openIssueCount },
            { label: "Selected", value: selectedActionIssues.length || "None" }
          ]}
        />
      ) : null}

      {message ? <p className={messageTone === "error" ? "inline-message error-message" : "inline-message success-message"}>{message}</p> : null}

      <WorkspaceMasterDetail
        browseView={(
          <Panel title="Bugs" titleVariant="eyebrow" subtitle="Review, select, export, triage, or safely remove project Bugs in tile or list view.">
            <div className="design-list-toolbar issue-catalog-toolbar">
              <CatalogSearchFilter
                activeFilterCount={issueSearch.trim() ? 1 : 0}
                ariaLabel="Search bugs"
                onChange={setIssueSearch}
                placeholder="Search bugs"
                subtitle="Search by title, description, Jira key, run, status, severity, priority, assignee, or reporter."
                title="Bug search"
                type="search"
                value={issueSearch}
              >
                <div className="catalog-filter-grid">
                  <div className="catalog-filter-actions">
                    <button className="ghost-button" disabled={!issueSearch.trim()} onClick={() => setIssueSearch("")} type="button">
                      Clear search
                    </button>
                  </div>
                </div>
              </CatalogSearchFilter>
              <CatalogSelectionControls
                allSelected={areAllFilteredIssuesSelected}
                canSelectAll={Boolean(visibleIssueIds.length)}
                deleteAction={canManageBugs ? {
                  disabled: isDeletingSelectedIssues || isExportingIssues,
                  label: isDeletingSelectedIssues ? "Deleting…" : `Delete ${selectedActionIssues.length || ""}`.trim(),
                  onClick: () => void handleDeleteSelectedIssues()
                } : undefined}
                onClear={() => setSelectedActionIssueIds([])}
                onSelectAll={() => setAllVisibleIssuesSelected(true)}
                selectedCount={selectedActionIssues.length}
              />
              <ReportBugSplitActionButton
                canUseAi={canUseAiBugTriage}
                onReportBug={openManualBugReport}
                onReportBugWithAi={openAiBugReport}
              />
              <button
                className="ghost-button catalog-selection-button"
                disabled={!selectedActionIssues.length || isDeletingSelectedIssues || isExportingIssues}
                onClick={() => void handleExportIssuesCsv()}
                title={selectedActionIssues.length ? `Export ${selectedActionIssues.length} selected Bugs as CSV` : "Select Bugs to export"}
                type="button"
              >
                <ExportIcon />
                <span>{isExportingIssues ? "Exporting…" : `Export${selectedActionIssues.length ? ` ${selectedActionIssues.length}` : ""}`}</span>
              </button>
              {canUseAiBugTriage ? (
                <button
                  className="ghost-button catalog-selection-button"
                  disabled={!selectedActionIssues.length || previewAiBugTriage.isPending || isDeletingSelectedIssues || isExportingIssues}
                  onClick={openSelectedBugTriage}
                  title={selectedActionIssues.length > MAX_AI_BUG_TRIAGE_ITEMS
                    ? `Select up to ${MAX_AI_BUG_TRIAGE_ITEMS} Bugs to keep Jira reads and AI usage bounded`
                    : selectedActionIssues.length
                      ? "Classify selected Bugs and recommend priority in a read-only review"
                      : "Select Bugs for AI classification and priority review"}
                  type="button"
                >
                  <SparkIcon />
                  <span>AI triage</span>
                </button>
              ) : null}
              <CatalogViewToggle onChange={setCatalogViewMode} value={catalogViewMode} />
            </div>

            {issues.isLoading ? (
              <TileCardSkeletonGrid />
            ) : null}

            {!issues.isLoading && filteredItems.length && catalogViewMode === "tile" ? (
            <div className="tile-browser-grid">
              {filteredItems.map((item: Issue) => {
                const issueTone = getTileCardTone(item.status || defaultIssueStatus);
                const issueStatus = formatTileCardLabel(item.status, "Open");

                return (
                  <article
                    aria-label={`Open Bug ${item.jira_bug_key || item.id}: ${item.title}`}
                    key={item.id}
                    className={[
                      "record-card tile-card",
                      selectedIssueId === item.id ? "is-active" : "",
                      selectedActionIssueIdSet.has(item.id) ? "is-selected" : ""
                    ].filter(Boolean).join(" ")}
                    onClick={() => openIssueWorkspace(item.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openIssueWorkspace(item.id);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="tile-card-main">
                      <div className="tile-card-select-row" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
                        <label className="checkbox-field">
                          <input
                            aria-label={`Select Bug ${item.jira_bug_key || item.id}: ${item.title}`}
                            checked={selectedActionIssueIdSet.has(item.id)}
                            onChange={(event) => toggleIssueSelection(item.id, event.target.checked)}
                            type="checkbox"
                          />
                          <span className="sr-only">Select bug</span>
                        </label>
                        <DisplayIdBadge value={item.jira_bug_key || item.id} href={getJiraBrowseUrl(item.jira_bug_key, item.jira_url)} />
                      </div>
                      <div className="tile-card-header">
                        <span className="issue-card-badge">BG</span>
                        <div className="tile-card-title-group">
                          <strong>{item.title}</strong>
                          <span className="tile-card-kicker">
                            {[
                              item.jira_bug_key || null,
                              item.severity ? `Severity ${formatTileCardLabel(item.severity, "Not set")}` : null,
                              item.priority ? `Priority ${formatTileCardLabel(item.priority, "Not set")}` : null
                            ].filter(Boolean).join(" · ") || item.user_name || item.user_email || item.user_id}
                          </span>
                        </div>
                        <TileCardStatusIndicator title={issueStatus} tone={issueTone} />
                      </div>
                      <RichTextContent className="tile-card-description" value={item.message} />
                      <div className="issue-card-footer">
                        <span className="count-pill">{issueStatus}</span>
                        {item.build ? <span className="count-pill">Build {item.build}</span> : null}
                        {item.linked_test_run_id ? <span className="count-pill">{runLabelById.get(item.linked_test_run_id) || item.linked_test_run_id}</span> : null}
                        <span className="count-pill">{item.assignee_name || item.assignee_email || assigneeLabelById.get(item.assignee_id || "") || "Unassigned"}</span>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
            ) : null}

            {!issues.isLoading && filteredItems.length && catalogViewMode === "list" ? (
              <DataTable
                columns={issueListColumns}
                enableColumnResize
                enableHeaderColumnReorder
                enableRowSelection={false}
                emptyMessage="No bugs match the current search."
                getRowClassName={(item) => (selectedIssueId === item.id ? "is-active-row" : "")}
                getRowKey={(item) => item.id}
                hideToolbarCopy
                onRowClick={(item) => openIssueWorkspace(item.id)}
                rows={filteredItems}
                storageKey="qaira:issues:list-columns"
              />
            ) : null}

            {!issues.isLoading && !items.length ? <div className="empty-state compact">No bugs reported yet.</div> : null}
            {!issues.isLoading && items.length > 0 && !filteredItems.length ? <div className="empty-state compact">No bugs match the current search.</div> : null}
          </Panel>
        )}
        detailView={(
          <Panel
            actions={<WorkspaceBackButton label={bugReturnTo ? `Back to ${bugReturnLabel}` : "Back to bug tiles"} onClick={closeIssueWorkspace} />}
            title={isCreating ? "Report bug" : selectedItem ? "Bug details" : "Bug editor"}
            subtitle="Capture the bug in a Jira-ready structure with run context, reproduction evidence, ownership, and root cause."
          >
            {!isCreating && selectedIssueId && selectedIssueQuery.isLoading ? <LoadingState label="Loading bug details" /> : null}
            {(isCreating || selectedItem) ? (
              <form className="issue-report-form" onSubmit={(event) => void handleSave(event)}>
                {!isCreating && selectedItem?.jira_bug_key ? (
                  <div className="requirement-detail-id-row">
                    <span>Bug ID</span>
                    <DisplayIdBadge value={selectedItem.jira_bug_key} href={getJiraBrowseUrl(selectedItem.jira_bug_key, selectedItem.jira_url)} />
                  </div>
                ) : null}
                <section className="issue-form-section">
                  <div className="issue-form-section-head">
                    <strong>Bug summary</strong>
                  </div>
                  <div className="issue-form-grid">
                    <FormField label="Title" required>
                      <input required value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} />
                    </FormField>
                  </div>

                  <div className="issue-form-compact-grid issue-form-classification-grid">
                    <FormField className="form-field--compact-enum bug-field-status" label="Status">
                      <select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))}>
                        {activeBugStatusOptions.map((option) => (
                          <option key={option.value} value={option.value}>{jiraStatusOptionLabel(option)}</option>
                        ))}
                      </select>
                    </FormField>
                    <FormField className="form-field--compact-enum bug-field-severity" label="Severity">
                      <select value={draft.severity} onChange={(event) => setDraft((current) => ({ ...current, severity: event.target.value }))}>
                        {ISSUE_SEVERITY_OPTIONS.map((option) => (
                          <option key={option.value || "none"} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </FormField>
                    <FormField className="form-field--compact-enum bug-field-priority" label="Priority" required={jiraBugCoreRequired.priority}>
                      <select required={jiraBugCoreRequired.priority} value={draft.priority} onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value }))}>
                        {ISSUE_PRIORITY_OPTIONS.map((option) => (
                          <option key={option.value || "none"} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </FormField>
                    <FormField className="bug-field-assignee" label="Assignee" required={jiraBugCoreRequired.assignee}>
                      <select required={jiraBugCoreRequired.assignee} value={draft.assignee_id} onChange={(event) => setDraft((current) => ({ ...current, assignee_id: event.target.value }))}>
                        <option value="">Unassigned</option>
                        {userItems.map((user) => (
                          <option key={user.id} value={user.id}>{user.name || user.email || user.id}</option>
                        ))}
                      </select>
                    </FormField>
                  </div>

                  <div className="issue-form-compact-grid issue-form-context-grid">
                    <FormField className="bug-field-environment" label="Environment">
                      <input placeholder="QA, UAT, iOS 18, Chrome" value={draft.environment} onChange={(event) => setDraft((current) => ({ ...current, environment: event.target.value }))} />
                    </FormField>
                    <FormField className="bug-field-build" label="Build">
                      <input placeholder="2026.07.02" value={draft.build} onChange={(event) => setDraft((current) => ({ ...current, build: event.target.value }))} />
                    </FormField>
                    <FormField className="bug-field-linked-run" label="Linked Test Run">
                      <select value={draft.linked_test_run_id} onChange={(event) => setDraft((current) => ({ ...current, linked_test_run_id: event.target.value }))}>
                        <option value="">No linked run</option>
                        {draft.linked_test_run_id && !executionById.has(draft.linked_test_run_id) ? (
                          <option value={draft.linked_test_run_id}>{draft.linked_test_run_id}</option>
                        ) : null}
                        {executionItems.map((execution) => (
                          <option key={execution.id} value={execution.id}>{runLabelById.get(execution.id) || execution.id}</option>
                        ))}
                      </select>
                    </FormField>
                  </div>
                  <div className="issue-form-grid issue-form-impact-grid">
                    <ImpactCheckboxPicker
                      emptyText="No test suites are available for this project."
                      items={suiteImpactOptions}
                      label="Impacted Test Suites"
                      onChange={updateDraftLinkedSuites}
                      placeholder="Search test suites"
                      selectedIds={draft.linked_test_suite_ids}
                    />
                    <ImpactCheckboxPicker
                      emptyText="No test case modules are available for this project."
                      items={moduleImpactOptions}
                      label="Impacted Modules"
                      onChange={updateDraftLinkedModules}
                      placeholder="Search modules"
                      selectedIds={draft.linked_module_ids}
                    />
                    <ImpactCheckboxPicker
                      emptyText="No test cases are available for this project."
                      items={testCaseImpactOptions}
                      label="Impacted Test Cases"
                      onChange={updateDraftLinkedTestCases}
                      placeholder="Search test cases"
                      selectedIds={draft.linked_test_case_ids}
                    />
                    <ImpactCheckboxPicker
                      emptyText="No stories are available for this project."
                      items={requirementImpactOptions}
                      label="Impacted Stories"
                      onChange={updateDraftLinkedRequirements}
                      placeholder="Search stories"
                      selectedIds={draft.linked_requirement_ids}
                    />
                  </div>
                  <div className="issue-form-grid issue-form-grid--triple">
                    <FormField label="Labels" required={jiraBugCoreRequired.labels}>
                      <input required={jiraBugCoreRequired.labels} placeholder="regression, checkout" value={draft.labelsText} onChange={(event) => setDraft((current) => ({ ...current, labelsText: event.target.value }))} />
                    </FormField>
                    <FormField label="Sprint" required={jiraBugCoreRequired.sprint}>
                      <select required={jiraBugCoreRequired.sprint} value={draft.sprint} onChange={(event) => setDraft((current) => ({ ...current, sprint: event.target.value }))}>
                        <option value="">No sprint</option>
                        {jiraSprints.map((sprint) => <option key={sprint.id} value={sprint.name}>{sprint.name}{sprint.state ? ` · ${sprint.state}` : ""}</option>)}
                      </select>
                    </FormField>
                    <FormField label="Release / Fix version" required={jiraBugCoreRequired.release}>
                      <select required={jiraBugCoreRequired.release} value={draft.release} onChange={(event) => setDraft((current) => ({ ...current, release: event.target.value }))}>
                        <option value="">No release</option>
                        {jiraVersions.map((version) => <option key={version.id} value={version.name}>{version.name}{version.released ? " · released" : ""}</option>)}
                      </select>
                    </FormField>
                  </div>
                </section>

                {(isCreating ? bugCreateMetadataQuery.isLoading || bugCreateMetadataQuery.isError : bugEditMetadataQuery.isLoading || bugEditMetadataQuery.isError) || requiredJiraBugFields.length ? (
                  <section className="issue-form-section">
                    <div className="issue-form-section-head">
                      <strong>Jira required fields</strong>
                      <span>
                        These fields come from the live Jira Bug {isCreating ? "create" : "edit"} screen and are written back to Jira with this save.
                      </span>
                    </div>
                    {(isCreating ? bugCreateMetadataQuery.isLoading : bugEditMetadataQuery.isLoading) ? (
                      <LoadingState label={`Checking Jira Bug ${isCreating ? "create" : "edit"} fields`} />
                    ) : (isCreating ? bugCreateMetadataQuery.isError : bugEditMetadataQuery.isError) ? (
                      <p className="inline-message error-message">Qaira could not verify this Jira Bug {isCreating ? "create" : "edit"} screen. Refresh or ask a Jira administrator to check the app field-metadata permission.</p>
                    ) : (
                      <JiraRequiredFields
                        fields={requiredJiraBugFields}
                        issueTypeName="Bug"
                        mode={isCreating ? "create" : "edit"}
                        onChange={updateAdditionalJiraField}
                        users={userItems}
                        values={draft.additional_fields}
                      />
                    )}
                  </section>
                ) : null}

                <section className="issue-form-section">
                  <div className="issue-form-section-head">
                    <strong>Failure evidence</strong>
                    <span>Description, reproduction steps, expected result, and actual result.</span>
                  </div>
                  <FormField label="Description" required>
                    <RichTextEditor
                      required
                      rows={6}
                      value={draft.message}
                      onChange={(message) => setDraft((current) => ({ ...current, message }))}
                    />
                  </FormField>
                  <FormField label="Steps to Reproduce">
                    <RichTextEditor
                      rows={6}
                      value={draft.steps_to_reproduce}
                      onChange={(steps_to_reproduce) => setDraft((current) => ({ ...current, steps_to_reproduce }))}
                    />
                  </FormField>
                  <div className="issue-form-grid issue-form-evidence-result-grid">
                    <FormField label="Expected Result">
                      <RichTextEditor
                        rows={5}
                        value={draft.expected_result}
                        onChange={(expected_result) => setDraft((current) => ({ ...current, expected_result }))}
                      />
                    </FormField>
                    <FormField label="Actual Result">
                      <RichTextEditor
                        rows={5}
                        value={draft.actual_result}
                        onChange={(actual_result) => setDraft((current) => ({ ...current, actual_result }))}
                      />
                    </FormField>
                  </div>
                </section>

	                <section className="issue-form-section">
	                  <div className="issue-form-section-head">
	                    <strong>Resolution tracking</strong>
	                    <span>Root cause details for closure readiness.</span>
	                  </div>
	                  <FormField label="Root Cause">
	                    <RichTextEditor
	                      rows={4}
	                      value={draft.root_cause}
	                      onChange={(root_cause) => setDraft((current) => ({ ...current, root_cause }))}
	                    />
	                  </FormField>
	                </section>
                {!isCreating && selectedItem ? (
                  <JiraAttachmentPanel
                    canDelete={canDeleteAttachments}
                    canUpload={canCreateAttachments}
                    canView={canViewAttachments}
                    issueKey={selectedItem.jira_bug_key || selectedItem.id}
                  />
                ) : null}
                <div className="action-row">
                  <button
                    className="primary-button"
                    disabled={createIssue.isPending || updateIssue.isPending || (isCreating ? bugCreateMetadataQuery.isLoading || bugCreateMetadataQuery.isError : bugEditMetadataQuery.isLoading || bugEditMetadataQuery.isError)}
                    type="submit"
                  >
                    {createIssue.isPending || updateIssue.isPending
                      ? (isCreating ? "Saving…" : "Updating…")
                      : (isCreating ? bugCreateMetadataQuery.isLoading : bugEditMetadataQuery.isLoading)
                        ? "Checking Jira fields…"
                        : isCreating ? "Save bug" : "Update bug"}
                  </button>
                  {!isCreating && selectedItem && canManageBugs ? (
                    <button
                      className="ghost-button danger"
                      disabled={deleteIssue.isPending}
                      onClick={async () => {
                        if (await confirmDelete({ message: `Delete Bug "${selectedItem.title}" from Jira? Historical test-run snapshots stay preserved, but this Jira Bug and its live links will be removed.` })) {
                          void deleteIssue.mutateAsync(selectedItem.id);
                        }
                      }}
                      type="button"
                    >
                      {deleteIssue.isPending ? "Deleting…" : "Delete Bug"}
                    </button>
                  ) : null}
                </div>
              </form>
            ) : (
              <div className="empty-state compact">Select a bug from the tiles or create a new entry.</div>
            )}
          </Panel>
        )}
        isDetailOpen={isCreating || Boolean(selectedItem)}
      />
    </div>
  );
}
