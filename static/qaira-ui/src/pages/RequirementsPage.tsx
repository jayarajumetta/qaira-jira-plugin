import { ChangeEvent, CSSProperties, Dispatch, FormEvent, Fragment, ReactNode, SetStateAction, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useInfiniteQuery, useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { AiDesignStudioModal } from "../components/AiDesignStudioModal";
import { AiAssurancePanel } from "../components/AiAssurancePanel";
import { AiInsightPreviewDialog, type AiPreviewFinding } from "../components/AiInsightPreviewDialog";
import { AiPromptContextPanel } from "../components/AiPromptContextPanel";
import { ActivityIcon, AddIcon, BugIcon, ClearSelectionIcon, CollapseExpandIcon, ExportIcon, FileAddIcon, ImportIcon, IterationIcon, LayersIcon, OpenIcon, PencilIcon, SearchIcon, SelectAllIcon, SparkIcon, TrashIcon } from "../components/AppIcons";
import { CatalogActionMenu } from "../components/CatalogActionMenu";
import { CatalogViewToggle } from "../components/CatalogViewToggle";
import { CatalogSearchFilter } from "../components/CatalogSearchFilter";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { DialogCloseButton } from "../components/DialogCloseButton";
import { DetailSectionTabs } from "../components/DetailSectionTabs";
import { DisplayIdBadge } from "../components/DisplayIdBadge";
import { ExternalReferencesField } from "../components/ExternalReferencesField";
import { FormField } from "../components/FormField";
import { InfoTooltip } from "../components/InfoTooltip";
import { HierarchyMetricStrip } from "../components/HierarchyMetricStrip";
import { HierarchyLoadMoreButton } from "../components/HierarchyLoadMoreButton";
import { LinkedTestCaseModal } from "../components/LinkedTestCaseModal";
import { LinkedDefectsPanel } from "../components/LinkedDefectsPanel";
import { JiraAttachmentPanel } from "../components/JiraAttachmentPanel";
import { JiraCommentsPanel } from "../components/JiraCommentsPanel";
import { JiraRequiredFields } from "../components/JiraRequiredFields";
import { LoadingState } from "../components/LoadingState";
import { PageHeader } from "../components/PageHeader";
import { Panel } from "../components/Panel";
import { ProgressMeter } from "../components/ProgressMeter";
import { RichTextContent, RichTextEditor, richTextToPlainText } from "../components/RichTextEditor";
import { StatusBadge } from "../components/StatusBadge";
import {
  TileCardFact,
  TileCardLinkIcon,
  TileCardPriorityIcon,
  formatTileCardLabel
} from "../components/TileCardPrimitives";
import { TileBrowserPane } from "../components/TileBrowserPane";
import { TileCardSkeletonGrid } from "../components/TileCardSkeletonGrid";
import { ToastMessage } from "../components/ToastMessage";
import { TraceabilityRunHistory } from "../components/TraceabilityRunHistory";
import { WorkspaceBackButton, WorkspaceMasterDetail } from "../components/WorkspaceMasterDetail";
import { useDeleteConfirmation } from "../components/DeleteConfirmationDialog";
import { useCurrentAppType, useCurrentProject } from "../hooks/useCurrentProject";
import { useDomainMetadata } from "../hooks/useDomainMetadata";
import { useFeatureFlags } from "../hooks/useFeatureFlags";
import { api } from "../lib/api";
import { isJiraCoreFieldRequired } from "../lib/jiraCreateMetadata";
import { mergeAiReferenceImagesWithinBudget, parseExternalLinks, readImageFiles } from "../lib/aiDesignStudio";
import { assessRequirementAiReadiness } from "../lib/aiAssurance";
import { formatAuditTimestamp, resolveAuditUserLabel } from "../lib/auditDisplay";
import { formatReferenceList, parseReferenceList } from "../lib/externalReferences";
import { areFeatureFlagsEnabled } from "../lib/featureFlags";
import { downloadCsvRecords } from "../lib/csvExport";
import { hasPermission } from "../lib/permissions";
import { getJiraBrowseUrl } from "../lib/jiraBrowseUrl";
import { deriveIterationHealth } from "../lib/hierarchyHealth";
import { parseRequirementCsv } from "../lib/requirementImport";
import { findByRoutableId, getRoutableId } from "../lib/urlSelection";
import { readDefaultCatalogViewMode } from "../lib/viewPreferences";
import type { AiDesignImageInput, AiDesignedTestCaseCandidate, Execution, ExecutionResult, Integration, Issue, Requirement, RequirementDefectLink, RequirementIteration, RequirementRelatedItem, TestCase, User } from "../types";

type RequirementDraft = {
  title: string;
  description: string;
  externalReferencesText: string;
  labelsText: string;
  sprint: string;
  fixVersion: string;
  release: string;
  iterationId: string;
  priority: number;
  status: string;
  additionalFields: Record<string, unknown>;
};

type RequirementSectionKey = "details" | "library" | "defects" | "runHistory";
type RequirementTraceabilityTab = "details" | "related" | "comments" | "grounding" | "cases" | "defects" | "history" | "evidence";
type RequirementCoverageFilter = "all" | "linked" | "unlinked";

type RequirementCoverageMetric = {
  total: number;
  covered: number;
  percent: number;
};

type RequirementRunHistoryRow = {
  key: string;
  executionId: string;
  executionName: string;
  executionStatus: string | null;
  testCaseId: string;
  testCaseTitle: string;
  resultStatus: ExecutionResult["status"];
  defects: string[];
  createdAt?: string;
  startedAt?: string | null;
  endedAt?: string | null;
};

type RequirementOptimizationSuggestion = Awaited<ReturnType<typeof api.requirements.previewOptimization>>["suggestion"];
type RequirementCreationSuggestion = Awaited<ReturnType<typeof api.requirements.previewCreation>>["requirements"][number];
type RequirementGenerationJob = Awaited<ReturnType<typeof api.requirements.listGenerationJobs>>[number];
type RequirementAiMode = "create" | "improve";

const RECOVERABLE_REQUIREMENT_AI_JOB_WINDOW_MS = 30 * 60_000;

const isRecoverableRequirementAiJob = (job: RequirementGenerationJob) => {
  const status = String(job.status || "").toLowerCase();
  if (!["queued", "running", "completed"].includes(status)) return false;
  if (status === "completed" && !(job.requirements?.length || job.suggestion)) return false;
  const createdAt = Date.parse(String(job.created_at || job.started_at || ""));
  return Number.isNaN(createdAt) || Date.now() - createdAt <= RECOVERABLE_REQUIREMENT_AI_JOB_WINDOW_MS;
};

const createEmptyRequirementDraft = (defaultStatus = "To Do"): RequirementDraft => ({
  title: "",
  description: "",
  externalReferencesText: "",
  labelsText: "",
  sprint: "",
  fixVersion: "",
  release: "",
  iterationId: "",
  priority: 3,
  status: defaultStatus,
  additionalFields: {}
});

const toDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const defaultSprintDates = () => {
  const start = new Date();
  const end = new Date(start);
  end.setDate(end.getDate() + 14);
  return { start: toDateInputValue(start), end: toDateInputValue(end) };
};

const formatSprintShortDate = (value?: string | null) => {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[2]}/${match[3]}` : "—";
};

const sprintDateRangeLabel = (start?: string | null, end?: string | null) => {
  if (!start && !end) return "Dates not set";
  return `${formatSprintShortDate(start)} – ${formatSprintShortDate(end)}`;
};

const sprintStateLabel = (state?: string | null) => ({
  future: "Planned",
  active: "Active",
  closed: "Completed"
})[String(state || "").toLowerCase()] || "Status unavailable";

const sprintOptionLabel = (sprint: { name: string; state?: string | null; start_date?: string | null; end_date?: string | null }) =>
  [sprint.name, sprintStateLabel(sprint.state), sprintDateRangeLabel(sprint.start_date, sprint.end_date)].join(" · ");

const createDefaultRequirementSections = (): Record<RequirementSectionKey, boolean> => ({
  details: true,
  library: false,
  defects: false,
  runHistory: false
});

const getRequirementCreationDraftId = (draft: Pick<RequirementCreationSuggestion, "client_id" | "title">, index: number) =>
  draft.client_id || `ai-req-${index + 1}-${draft.title}`;

const composeAiRequirementDescription = (suggestion: Pick<RequirementCreationSuggestion, "description" | "acceptance_criteria" | "risks" | "open_questions">) =>
  [
    suggestion.description,
    suggestion.acceptance_criteria.length ? "Acceptance criteria:" : "",
    ...suggestion.acceptance_criteria.map((item) => `- ${item}`),
    suggestion.risks.length ? "\nRisks:" : "",
    ...suggestion.risks.map((item) => `- ${item}`),
    suggestion.open_questions.length ? "\nOpen questions:" : "",
    ...suggestion.open_questions.map((item) => `- ${item}`)
  ].filter(Boolean).join("\n");

const getRequirementCoverageTone = (covered: number, total: number) => {
  if (!total) {
    return "neutral" as const;
  }

  if (covered >= total) {
    return "success" as const;
  }

  if (covered > 0) {
    return "info" as const;
  }

  return "danger" as const;
};

function RequirementProgressBar({
  label,
  metric,
  detail
}: {
  label: string;
  metric: RequirementCoverageMetric;
  detail: string;
}) {
  const safeValue = Math.max(0, Math.min(100, Math.round(metric.percent)));
  const tone = getRequirementCoverageTone(metric.covered, metric.total);

  return (
    <div className="requirement-progress-meter" aria-label={`${label} ${safeValue}%`} title={detail}>
      <div className="requirement-progress-meter-header">
        <span>{label}</span>
        <strong>{safeValue}%</strong>
      </div>
      <ProgressMeter hideCopy tone={tone} value={safeValue} />
    </div>
  );
}

type RequirementSplitAction = {
  label: string;
  description?: string;
  icon: ReactNode;
  disabled?: boolean;
  onClick: () => void;
};

function RequirementSplitActionButton({
  label,
  icon,
  iconOnly = false,
  disabled,
  onClick,
  menuLabel,
  actions
}: {
  label: string;
  icon: ReactNode;
  iconOnly?: boolean;
  disabled?: boolean;
  onClick: () => void;
  menuLabel: string;
  actions: RequirementSplitAction[];
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

  const menu = isOpen && canOpenMenu ? (
    <div className="run-action-dropdown requirement-action-dropdown" ref={menuRef} role="menu" style={menuStyle || { opacity: 0, pointerEvents: "none" }}>
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
    <div className={`create-run-action-button requirement-split-action-button${iconOnly ? " is-explorer-compact" : ""}`} ref={triggerRef}>
      <button aria-label={iconOnly ? label : undefined} className="run-action-main" disabled={disabled} onClick={onClick} title={iconOnly ? label : undefined} type="button">
        {icon}
        {iconOnly ? null : <span>{label}</span>}
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
        <ChevronDownIcon />
      </button>
      {menu && typeof document !== "undefined" ? createPortal(menu, document.body) : null}
    </div>
  );
}

function ChevronDownIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="16">
      <path d="m7 10 5 5 5-5" />
    </svg>
  );
}

function HierarchyToggleIcon({ isExpanded }: { isExpanded: boolean }) {
  return <span aria-hidden="true" className="hierarchy-toggle-glyph">{isExpanded ? "−" : "+"}</span>;
}

export function RequirementsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { session } = useAuth();
  const featureFlagsQuery = useFeatureFlags(Boolean(session));
  const canCreateRequirements = hasPermission(session, "requirement.create");
  const canImportRequirements = hasPermission(session, "requirement.import");
  const canExportRequirements = hasPermission(session, "requirement.export");
  const canUpdateRequirements = hasPermission(session, "requirement.update");
  const canDeleteRequirements = hasPermission(session, "requirement.delete");
  const canViewAttachments = hasPermission(session, "attachment.view");
  const canCreateAttachments = hasPermission(session, "attachment.create");
  const canDeleteAttachments = hasPermission(session, "attachment.delete");
  const canUseRequirementAi = hasPermission(session, "requirement.ai")
    && areFeatureFlagsEnabled(featureFlagsQuery.data, ["qaira.ai.requirement_design"]);
  const canUseAutomationWorkspace = areFeatureFlagsEnabled(featureFlagsQuery.data, ["qaira.automation.workspace"]);
  const canViewRequirementIterations = hasPermission(session, "requirement_iteration.view");
  const canCreateRequirementIterations = hasPermission(session, "requirement_iteration.create");
  const canUpdateRequirementIterations = hasPermission(session, "requirement_iteration.update");
  const canDeleteRequirementIterations = hasPermission(session, "requirement_iteration.delete");
  const canCreateTestCases = hasPermission(session, "testcase.create");
  const { confirmDelete, confirmationDialog } = useDeleteConfirmation();
  const domainMetadataQuery = useDomainMetadata();
  const [projectId] = useCurrentProject();
  const [appTypeId, setAppTypeId] = useCurrentAppType(projectId);
  const [selectedRequirementId, setSelectedRequirementId] = useState("");
  const [selectedTestCaseIds, setSelectedTestCaseIds] = useState<string[]>([]);
  const [selectedDefectIds, setSelectedDefectIds] = useState<string[]>([]);
  const [linkedPreviewCaseId, setLinkedPreviewCaseId] = useState("");
  const [deleteSelectedRequirementIds, setDeleteSelectedRequirementIds] = useState<string[]>([]);
  const [isDeletingSelectedRequirements, setIsDeletingSelectedRequirements] = useState(false);
  const [isCreateIterationModalOpen, setIsCreateIterationModalOpen] = useState(false);
  const [editingIteration, setEditingIteration] = useState<RequirementIteration | null>(null);
  const [iterationDraftName, setIterationDraftName] = useState("");
  const [iterationDraftDescription, setIterationDraftDescription] = useState("");
  const [iterationDraftBoardId, setIterationDraftBoardId] = useState("");
  const [iterationDraftStartDate, setIterationDraftStartDate] = useState(() => defaultSprintDates().start);
  const [iterationDraftEndDate, setIterationDraftEndDate] = useState(() => defaultSprintDates().end);
  const [iterationDraftStatus, setIterationDraftStatus] = useState<"future" | "active">("future");
  const [sprintDraftRequirementIds, setSprintDraftRequirementIds] = useState<string[]>([]);
  const [iterationRequirementSearch, setIterationRequirementSearch] = useState("");
  const [collapsedIterationIds, setCollapsedIterationIds] = useState<string[]>([]);
  const [isSprintHierarchySeeded, setIsSprintHierarchySeeded] = useState(false);
  const [sprintPageCursorsById, setSprintPageCursorsById] = useState<Record<string, Array<string | null>>>({});
  const [selectedIterationIds, setSelectedIterationIds] = useState<string[]>([]);
  const [draggingRequirementIds, setDraggingRequirementIds] = useState<string[]>([]);
  const [requirementSearchTerm, setRequirementSearchTerm] = useState("");
  const deferredRequirementSearchTerm = useDeferredValue(requirementSearchTerm);
  const [requirementStatusFilter, setRequirementStatusFilter] = useState("all");
  const [requirementPriorityFilter, setRequirementPriorityFilter] = useState("all");
  const [requirementLabelFilter, setRequirementLabelFilter] = useState("all");
  const [requirementSprintFilter, setRequirementSprintFilter] = useState("all");
  const [requirementFixVersionFilter, setRequirementFixVersionFilter] = useState("all");
  const [requirementReleaseFilter, setRequirementReleaseFilter] = useState("all");
  const [requirementCoverageFilter, setRequirementCoverageFilter] = useState<RequirementCoverageFilter>("all");
  const [catalogViewMode, setCatalogViewMode] = useState<"tile" | "list">(() => readDefaultCatalogViewMode());
  const [expandedSections, setExpandedSections] = useState<Record<RequirementSectionKey, boolean>>(createDefaultRequirementSections);
  const [activeTraceabilityTab, setActiveTraceabilityTab] = useState<RequirementTraceabilityTab>("details");
  const [detailTestCaseSearchTerm, setDetailTestCaseSearchTerm] = useState("");
  const [isDetailTestCaseSearchActive, setIsDetailTestCaseSearchActive] = useState(false);
  const [defectSearchTerm, setDefectSearchTerm] = useState("");
  const [isDefectSearchLoaded, setIsDefectSearchLoaded] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");
  const defaultRequirementStatus = domainMetadataQuery.data?.requirements.default_status || "To Do";
  const jiraBoards = useMemo(() => domainMetadataQuery.data?.jira?.boards || [], [domainMetadataQuery.data?.jira?.boards]);
  const jiraSprints = useMemo(() => domainMetadataQuery.data?.jira?.sprints || [], [domainMetadataQuery.data?.jira?.sprints]);
  const assignableJiraSprints = useMemo(
    () => jiraSprints.filter((sprint) => String(sprint.state || "").toLowerCase() !== "closed"),
    [jiraSprints]
  );
  const jiraVersions = useMemo(
    () => (domainMetadataQuery.data?.jira?.versions || []).filter((version) => !version.archived),
    [domainMetadataQuery.data?.jira?.versions]
  );
  const emptyRequirementDraft = useMemo(() => createEmptyRequirementDraft(defaultRequirementStatus), [defaultRequirementStatus]);
  const [draft, setDraft] = useState<RequirementDraft>(() => createEmptyRequirementDraft());
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState<RequirementDraft>(() => createEmptyRequirementDraft());
  const [isAiStudioOpen, setIsAiStudioOpen] = useState(false);
  const [aiRequirementId, setAiRequirementId] = useState("");
  const [integrationId, setIntegrationId] = useState("");
  const [maxCases, setMaxCases] = useState(6);
  const [aiAdditionalContext, setAiAdditionalContext] = useState("");
  const [aiExternalLinksText, setAiExternalLinksText] = useState("");
  const [aiReferenceImages, setAiReferenceImages] = useState<AiDesignImageInput[]>([]);
  const [previewCases, setPreviewCases] = useState<AiDesignedTestCaseCandidate[]>([]);
  const [previewMessage, setPreviewMessage] = useState("");
  const [previewTone, setPreviewTone] = useState<"success" | "error">("success");
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importRows, setImportRows] = useState<Array<{ title: string; description?: string; external_references?: string[]; labels?: string[]; sprint?: string; fix_version?: string; release?: string; priority?: number; status?: string }>>([]);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [importFileName, setImportFileName] = useState("");
  const [isOptimizeModalOpen, setIsOptimizeModalOpen] = useState(false);
  const [isRequirementAiSidebarCollapsed, setIsRequirementAiSidebarCollapsed] = useState(false);
  const [requirementAiMode, setRequirementAiMode] = useState<RequirementAiMode>("improve");
  const [isRequirementImpactPreviewOpen, setIsRequirementImpactPreviewOpen] = useState(false);
  const [optimizeRequirementIds, setOptimizeRequirementIds] = useState<string[]>([]);
  const [optimizeContext, setOptimizeContext] = useState("");
  const [optimizeExternalLinksText, setOptimizeExternalLinksText] = useState("");
  const [optimizeReferenceImages, setOptimizeReferenceImages] = useState<AiDesignImageInput[]>([]);
  const [optimizationSuggestion, setOptimizationSuggestion] = useState<RequirementOptimizationSuggestion | null>(null);
  const [requirementCreationDrafts, setRequirementCreationDrafts] = useState<RequirementCreationSuggestion[]>([]);
  const [selectedRequirementCreationDraftIds, setSelectedRequirementCreationDraftIds] = useState<string[]>([]);
  const [expandedRequirementCreationDraftIds, setExpandedRequirementCreationDraftIds] = useState<string[]>([]);
  const [requirementCreationJobId, setRequirementCreationJobId] = useState("");
  const [optimizationFields, setOptimizationFields] = useState({
    title: true,
    description: true,
    external_references: true,
    priority: true,
    status: true
  });

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: api.projects.list
  });
  const appTypesQuery = useQuery({
    queryKey: ["app-types", projectId],
    queryFn: () => api.appTypes.list({ project_id: projectId }),
    enabled: Boolean(projectId)
  });
  const requirementsQuery = useInfiniteQuery({
    queryKey: ["requirements", projectId],
    queryFn: ({ pageParam }) => api.requirements.listPage({ project_id: projectId, unassigned: true, page_size: 15, cursor: pageParam, projection: "summary" }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor || undefined,
    enabled: Boolean(projectId)
  });
  const requirementDetailQuery = useQuery({
    queryKey: ["requirement-detail", projectId, selectedRequirementId],
    queryFn: () => api.requirements.get(selectedRequirementId, { project_id: projectId }),
    enabled: Boolean(projectId && selectedRequirementId),
    staleTime: 30_000
  });
  const requirementCreateMetadataQuery = useQuery({
    queryKey: ["requirement-create-metadata", projectId],
    queryFn: () => api.requirements.createMetadata({ project_id: projectId }),
    enabled: Boolean(projectId && (isCreateModalOpen || (isOptimizeModalOpen && requirementAiMode === "create"))),
    staleTime: 5 * 60_000
  });
  const requirementEditMetadataQuery = useQuery({
    queryKey: ["requirement-edit-metadata", projectId, selectedRequirementId],
    queryFn: () => api.requirements.editMetadata(selectedRequirementId, { project_id: projectId }),
    enabled: Boolean(projectId && selectedRequirementId && canUpdateRequirements),
    staleTime: 60_000
  });
  const requirementIterationsQuery = useQuery({
    queryKey: ["requirement-iterations", projectId],
    queryFn: () => api.requirementIterations.list({ project_id: projectId }),
    enabled: Boolean(projectId && canViewRequirementIterations)
  });
  useEffect(() => {
    if (!requirementIterationsQuery.data || isSprintHierarchySeeded) return;
    setCollapsedIterationIds(requirementIterationsQuery.data.map((iteration) => iteration.id));
    setIsSprintHierarchySeeded(true);
  }, [isSprintHierarchySeeded, requirementIterationsQuery.data]);
  useEffect(() => {
    setIsSprintHierarchySeeded(false);
    setCollapsedIterationIds([]);
    setSprintPageCursorsById({});
  }, [projectId]);
  const expandedSprintHeaders = (requirementIterationsQuery.data || []).filter((iteration) =>
    isSprintHierarchySeeded && !collapsedIterationIds.includes(iteration.id)
  );
  const sprintPageRequests = expandedSprintHeaders.flatMap((iteration) =>
    (sprintPageCursorsById[iteration.id] || [null]).map((cursor, pageIndex) => ({ iteration, cursor, pageIndex }))
  );
  const sprintRequirementQueries = useQueries({
    queries: sprintPageRequests.map(({ iteration, cursor, pageIndex }) => ({
      queryKey: ["sprint-requirement-children", projectId, iteration.id, pageIndex, cursor || "first"],
      queryFn: () => api.requirementIterations.listRequirements(iteration.id, { page_size: 25, cursor: cursor || undefined, projection: "summary" as const }),
      staleTime: 30_000
    }))
  });
  const sprintPageStateById = useMemo(() => sprintPageRequests.reduce<Record<string, { loaded: number; total: number; nextCursor: string | null; isFetching: boolean }>>((state, request, index) => {
    const response = sprintRequirementQueries[index];
    const current = state[request.iteration.id] || { loaded: 0, total: request.iteration.requirement_count || 0, nextCursor: null, isFetching: false };
    current.loaded += response.data?.items.length || 0;
    current.total = response.data?.total ?? current.total;
    current.nextCursor = response.data?.next_cursor || null;
    current.isFetching = current.isFetching || response.isFetching;
    state[request.iteration.id] = current;
    return state;
  }, {}), [sprintPageRequests, sprintRequirementQueries]);
  const loadNextSprintPage = (iterationId: string) => {
    const nextCursor = sprintPageStateById[iterationId]?.nextCursor;
    if (!nextCursor) return;
    setSprintPageCursorsById((current) => ({
      ...current,
      [iterationId]: (current[iterationId] || [null]).includes(nextCursor)
        ? (current[iterationId] || [null])
        : [...(current[iterationId] || [null]), nextCursor]
    }));
  };
  const requestedRequirementRouteId = searchParams.get("requirement") || "";
  const requestedRequirementQuery = useQuery({
    queryKey: ["requirement-route-detail", projectId, requestedRequirementRouteId],
    queryFn: () => api.requirements.get(requestedRequirementRouteId, { project_id: projectId }),
    enabled: Boolean(projectId && requestedRequirementRouteId),
    staleTime: 30_000,
    retry: false
  });
  const testCasesQuery = useQuery({
    queryKey: ["requirements-test-cases", projectId, appTypeId],
    queryFn: () => api.testCases.list({ app_type_id: appTypeId, page_size: 25, projection: "detail" }),
    enabled: Boolean(appTypeId)
  });
  const executionResultsQuery = useQuery({
    queryKey: ["requirements-execution-results", projectId, appTypeId],
    queryFn: () => api.executionResults.list({ app_type_id: appTypeId, run_limit: 10, limit: 100 }),
    enabled: Boolean(appTypeId)
  });
  const executionsQuery = useQuery({
    queryKey: ["requirements-executions", projectId, appTypeId],
    queryFn: () => api.executions.list({ project_id: projectId, app_type_id: appTypeId || undefined }),
    enabled: Boolean(projectId)
  });
  const issuesQuery = useQuery({
    queryKey: ["requirements-issues", projectId],
    queryFn: () => api.issues.list({ project_id: projectId, page_size: 25, projection: "summary" }),
    enabled: Boolean(session && projectId && isDefectSearchLoaded)
  });
  const sharedGroupsQuery = useQuery({
    queryKey: ["requirements-shared-step-groups", projectId, appTypeId],
    queryFn: () => api.sharedStepGroups.list({ app_type_id: appTypeId }),
    enabled: Boolean(appTypeId)
  });
  const suitesQuery = useQuery({
    queryKey: ["requirements-test-suites", projectId, appTypeId],
    queryFn: () => api.testSuites.list({ app_type_id: appTypeId }),
    enabled: Boolean(appTypeId)
  });
  const integrationsQuery = useQuery({
    queryKey: ["integrations", projectId, "llm"],
    queryFn: () => api.integrations.list({ type: "llm", is_active: true }),
    enabled: Boolean(session)
  });
  const usersQuery = useQuery({
    queryKey: ["users", projectId],
    queryFn: api.users.list,
    enabled: Boolean(session)
  });

  const createRequirement = useMutation({ mutationFn: api.requirements.create });
  const createRequirementIteration = useMutation({ mutationFn: api.requirementIterations.create });
  const updateRequirementIteration = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof api.requirementIterations.update>[1] }) =>
      api.requirementIterations.update(id, input)
  });
  const assignRequirementsToIteration = useMutation({
    mutationFn: ({ id, requirementIds, append }: { id: string; requirementIds: string[]; append?: boolean }) =>
      api.requirementIterations.assignRequirements(id, requirementIds, append ?? true)
  });
  const deleteRequirementIteration = useMutation({ mutationFn: api.requirementIterations.delete });
  const bulkImportRequirements = useMutation({ mutationFn: api.requirements.bulkImport });
  const updateRequirement = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof api.requirements.update>[1] }) =>
      api.requirements.update(id, input)
  });
  const deleteRequirement = useMutation({ mutationFn: api.requirements.delete });
  const replaceMappings = useMutation({
    mutationFn: ({ requirementId, testCaseIds }: { requirementId: string; testCaseIds: string[] }) =>
      api.requirementTestCases.replace(requirementId, testCaseIds)
  });
  const replaceDefectMappings = useMutation({
    mutationFn: ({ requirementId, issueIds }: { requirementId: string; issueIds: string[] }) =>
      api.requirementDefects.replace(requirementId, issueIds)
  });
  const previewDesignedCases = useMutation({
    mutationFn: ({ requirementId, input }: { requirementId: string; input: Parameters<typeof api.requirements.previewDesignedTestCases>[1] }) =>
      api.requirements.previewDesignedTestCases(requirementId, input)
  });
  const acceptDesignedCases = useMutation({
    mutationFn: ({ requirementId, input }: { requirementId: string; input: Parameters<typeof api.requirements.acceptDesignedTestCases>[1] }) =>
      api.requirements.acceptDesignedTestCases(requirementId, input)
  });
  const previewRequirementOptimization = useMutation({
    mutationFn: ({ requirementId, input }: { requirementId: string; input?: Parameters<typeof api.requirements.previewOptimization>[1] }) =>
      api.requirements.previewOptimization(requirementId, input)
  });
  const rephraseRequirementDescription = useMutation({ mutationFn: api.requirements.rephraseDescription });
  const previewRequirementCreation = useMutation({ mutationFn: api.requirements.previewCreation });
  const createRequirementGenerationJob = useMutation({ mutationFn: api.requirements.createGenerationJob });
  const previewRequirementImpact = useMutation({
    mutationFn: ({ requirementId, input }: { requirementId: string; input: Parameters<typeof api.requirements.previewImpact>[1] }) =>
      api.requirements.previewImpact(requirementId, input)
  });
  const requirementCreationJobQuery = useQuery({
    queryKey: ["ai-requirement-generation-job", projectId, requirementCreationJobId],
    queryFn: () => api.requirements.getGenerationJob(requirementCreationJobId, { project_id: projectId }),
    enabled: Boolean(projectId && requirementCreationJobId && isOptimizeModalOpen && requirementAiMode === "create"),
    refetchInterval: (query) => {
      const status = String(query.state.data?.status || "").toLowerCase();
      return ["queued", "running"].includes(status) ? 3_000 : false;
    }
  });
  const recentRequirementCreationJobsQuery = useQuery({
    queryKey: ["ai-requirement-generation-jobs", projectId, "recent"],
    queryFn: () => api.requirements.listGenerationJobs({ project_id: projectId, limit: 5 }),
    enabled: Boolean(projectId && !requirementCreationJobId && isOptimizeModalOpen && requirementAiMode === "create"),
    refetchInterval: (query) => (query.state.data || []).some((job) => ["queued", "running"].includes(String(job.status || "").toLowerCase())) ? 3_000 : false
  });
  const recoveredRequirementCreationJob = useMemo(
    () => (!requirementCreationJobId && !requirementCreationDrafts.length
      ? (recentRequirementCreationJobsQuery.data || []).find(isRecoverableRequirementAiJob) || null
      : null),
    [recentRequirementCreationJobsQuery.data, requirementCreationDrafts.length, requirementCreationJobId]
  );
  const requirementCreationJob = requirementCreationJobQuery.data || recoveredRequirementCreationJob || null;
  const isRequirementCreationJobRunning = ["queued", "running"].includes(String(requirementCreationJob?.status || "").toLowerCase());

  const projects = projectsQuery.data || [];
  const appTypes = appTypesQuery.data || [];
  const requirements = useMemo(() => {
    const byId = new Map<string, Requirement>();
    for (const requirement of requirementsQuery.data?.pages.flatMap((page) => page.items) || []) byId.set(requirement.id, requirement);
    for (const query of sprintRequirementQueries) {
      for (const requirement of query.data?.items || []) byId.set(requirement.id, requirement);
    }
    if (requestedRequirementQuery.data) byId.set(requestedRequirementQuery.data.id, requestedRequirementQuery.data);
    if (requirementDetailQuery.data) byId.set(requirementDetailQuery.data.id, requirementDetailQuery.data);
    return [...byId.values()];
  }, [requirementDetailQuery.data, requestedRequirementQuery.data, requirementsQuery.data, sprintRequirementQueries]);
  const requirementIterations = requirementIterationsQuery.data || [];
  const testCases = testCasesQuery.data || [];
  const executionResults = executionResultsQuery.data || [];
  const executions = (executionsQuery.data || []) as Execution[];
  const issues = (issuesQuery.data || []) as Issue[];
  const sharedGroups = sharedGroupsQuery.data || [];
  const suites = suitesQuery.data || [];
  const integrations = integrationsQuery.data || [];
  const users = (usersQuery.data || []) as User[];
  const requiredJiraRequirementFields = requirementCreateMetadataQuery.data?.required_fields || [];
  const requiredJiraRequirementEditFields = requirementEditMetadataQuery.data?.required_fields || [];
  const jiraRequirementCoreRequired = {
    description: isJiraCoreFieldRequired(requirementCreateMetadataQuery.data, "description"),
    priority: isJiraCoreFieldRequired(requirementCreateMetadataQuery.data, "priority"),
    labels: isJiraCoreFieldRequired(requirementCreateMetadataQuery.data, "labels"),
    sprint: isJiraCoreFieldRequired(requirementCreateMetadataQuery.data, "sprint"),
    release: isJiraCoreFieldRequired(requirementCreateMetadataQuery.data, "fixVersions", "versions")
  };
  const jiraRequirementEditCoreRequired = {
    description: isJiraCoreFieldRequired(requirementEditMetadataQuery.data, "description"),
    priority: isJiraCoreFieldRequired(requirementEditMetadataQuery.data, "priority"),
    labels: isJiraCoreFieldRequired(requirementEditMetadataQuery.data, "labels"),
    sprint: isJiraCoreFieldRequired(requirementEditMetadataQuery.data, "sprint"),
    release: isJiraCoreFieldRequired(requirementEditMetadataQuery.data, "fixVersions", "versions")
  };
  const updateAdditionalRequirementField = (target: "create" | "edit", fieldId: string, value: unknown) => {
    const setter = target === "create" ? setCreateDraft : setDraft;
    setter((current) => ({
      ...current,
      additionalFields: {
        ...current.additionalFields,
        [fieldId]: value
      }
    }));
  };
  const userById = useMemo(
    () =>
      users.reduce<Record<string, User>>((accumulator, user) => {
        accumulator[user.id] = user;
        return accumulator;
      }, {}),
    [users]
  );
  const isRequirementCatalogLoading =
    projectsQuery.isLoading ||
    (Boolean(projectId) && requirementsQuery.isLoading);

  const showSuccess = (text: string) => {
    setMessageTone("success");
    setMessage(text);
  };

  const showError = (error: unknown, fallback: string) => {
    setMessageTone("error");
    setMessage(error instanceof Error ? error.message : fallback);
  };

  useEffect(() => {
    if (!recoveredRequirementCreationJob?.id || requirementCreationJobId || requirementAiMode !== "create" || !isOptimizeModalOpen) {
      return;
    }

    setRequirementCreationJobId(recoveredRequirementCreationJob.id);
    setPreviewTone("success");
    setPreviewMessage("Recovered a recent AI requirement generation job. Qaira is loading the generated drafts…");
  }, [isOptimizeModalOpen, recoveredRequirementCreationJob?.id, requirementAiMode, requirementCreationJobId]);

  useEffect(() => {
    if (requirementAiMode !== "create" || !requirementCreationJob) {
      return;
    }

    const status = String(requirementCreationJob.status || "").toLowerCase();

    if (status === "completed") {
      const generatedDrafts = requirementCreationJob.requirements?.length
        ? requirementCreationJob.requirements
        : requirementCreationJob.suggestion
          ? [{
              ...requirementCreationJob.suggestion,
              client_id: requirementCreationJob.suggestion.client_id || "ai-req-1",
              quality_score: requirementCreationJob.suggestion.quality_score || 0.72,
              rationale: requirementCreationJob.suggestion.rationale || "AI-generated requirement draft."
            }]
          : [];

      setOptimizationSuggestion(requirementCreationJob.suggestion || null);
      setRequirementCreationDrafts(generatedDrafts);
      const selectedDraftIds = generatedDrafts
        .map((draftItem, index) => ({ id: getRequirementCreationDraftId(draftItem, index), score: Number(draftItem.quality_score || 0) }))
        .filter((item) => item.score >= 0.8)
        .map((item) => item.id);
      const defaultSelectedIds = selectedDraftIds.length ? selectedDraftIds : generatedDrafts.slice(0, 1).map((draftItem, index) => getRequirementCreationDraftId(draftItem, index));
      setSelectedRequirementCreationDraftIds(defaultSelectedIds);
      setExpandedRequirementCreationDraftIds(generatedDrafts.slice(0, 1).map((draftItem, index) => getRequirementCreationDraftId(draftItem, index)));
      setIsRequirementAiSidebarCollapsed(true);
      setPreviewTone(requirementCreationJob.fallback_used ? "error" : "success");
      setPreviewMessage(
        requirementCreationJob.fallback_used
          ? `AI fallback used: ${requirementCreationJob.fallback_reason || "LLM unavailable"}`
          : `${generatedDrafts.length || requirementCreationJob.generated || 0} requirement draft${(generatedDrafts.length || requirementCreationJob.generated || 0) === 1 ? "" : "s"} generated. Review and select the strongest drafts before creating Jira requirements.`
      );
      return;
    }

    if (status === "failed") {
      setPreviewTone("error");
      setPreviewMessage(requirementCreationJob.last_error || "AI requirement generation failed. Reduce the prompt or attachments and try again.");
      return;
    }

    if (["queued", "running"].includes(status)) {
      setPreviewTone("success");
      setPreviewMessage(status === "queued" ? "AI requirement generation queued…" : "AI requirement generation is running…");
    }
  }, [requirementAiMode, requirementCreationJob]);

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
    if (!integrations.length) {
      setIntegrationId("");
      return;
    }

    if (integrationId && !integrations.some((integration) => integration.id === integrationId)) {
      setIntegrationId("");
    }
  }, [integrationId, integrations]);

  useEffect(() => {
    if (requirementsQuery.isLoading || requirementsQuery.isFetching) {
      return;
    }

    const requestedRequirementId = searchParams.get("requirement");
    const requestedRequirement = findByRoutableId(requirements, requestedRequirementId);

    if (requestedRequirement) {
      if (selectedRequirementId !== requestedRequirement.id) {
        setSelectedRequirementId(requestedRequirement.id);
      }
      return;
    }

    if (requestedRequirementId) {
      if (selectedRequirementId === requestedRequirementId) {
        return;
      }

      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete("requirement");
        return next;
      }, { replace: true });
    }

    if (!requirements.length) {
      if (selectedRequirementId) {
        setSelectedRequirementId("");
      }
      return;
    }

    if (selectedRequirementId && !requirements.some((item) => item.id === selectedRequirementId)) {
      setSelectedRequirementId("");
    }
  }, [requirements, requirementsQuery.isFetching, requirementsQuery.isLoading, searchParams, selectedRequirementId, setSearchParams]);

  useEffect(() => {
    setDeleteSelectedRequirementIds((current) => current.filter((id) => requirements.some((item) => item.id === id)));
  }, [requirements]);

  const selectedRequirementSummary = useMemo(
    () => requirements.find((item) => item.id === selectedRequirementId) || null,
    [requirements, selectedRequirementId]
  );
  const selectedRequirement = requirementDetailQuery.data || selectedRequirementSummary;

  const syncRequirementSearchParams = (requirementId?: string | null) => {
    const currentRequirementId = searchParams.get("requirement") || "";
    const targetRequirementId = requirementId || "";

    if (currentRequirementId === targetRequirementId) {
      return;
    }

    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (targetRequirementId) {
        next.set("requirement", targetRequirementId);
      } else {
        next.delete("requirement");
      }
      return next;
    }, { replace: true });
  };

  const openRequirementWorkspace = (requirementId: string) => {
    const targetRequirement = requirements.find((item) => item.id === requirementId) || null;

    syncRequirementSearchParams(getRoutableId(targetRequirement) || requirementId);
    setSelectedRequirementId(requirementId);
  };
  const optimizeTargets = useMemo(
    () =>
      optimizeRequirementIds
        .map((id) => requirements.find((item) => item.id === id) || null)
        .filter(Boolean) as Requirement[],
    [optimizeRequirementIds, requirements]
  );
  const activeOptimizeRequirement = requirementAiMode === "improve"
    ? optimizeTargets[0] || selectedRequirement || requirements[0] || null
    : null;
  const aiCompleteRequirementOptions = useMemo(() => {
    const byId = new Map<string, Requirement>();
    requirements.forEach((item) => byId.set(item.id, item));
    if (selectedRequirement) {
      byId.set(selectedRequirement.id, selectedRequirement);
    }
    return Array.from(byId.values()).sort((left, right) => left.title.localeCompare(right.title));
  }, [requirements, selectedRequirement]);

  const latestResultByCaseId = useMemo(() => {
    const map: Record<string, ExecutionResult> = {};

    executionResults.forEach((result) => {
      const current = map[result.test_case_id];
      const currentTime = current?.created_at ? new Date(current.created_at).getTime() || 0 : 0;
      const nextTime = result.created_at ? new Date(result.created_at).getTime() || 0 : 0;

      if (!current || nextTime >= currentTime) {
        map[result.test_case_id] = result;
      }
    });

    return map;
  }, [executionResults]);

  const linkedCaseIdsByRequirementId = useMemo(() => {
    const map: Record<string, string[]> = {};
    const requirementIds = new Set(requirements.map((requirement) => requirement.id));

    requirements.forEach((requirement) => {
      map[requirement.id] = [];
    });

    testCases.forEach((testCase) => {
      const linkedRequirementIds = [...(testCase.requirement_ids || []), testCase.requirement_id].filter(Boolean) as string[];

      linkedRequirementIds.forEach((requirementId) => {
        if (!requirementIds.has(requirementId)) {
          return;
        }

        map[requirementId] = [...new Set([...(map[requirementId] || []), testCase.id])];
      });
    });

    requirements.forEach((requirement) => {
      const scopedLinkedIds = (requirement.test_case_ids || []).filter((testCaseId) => testCases.some((testCase) => testCase.id === testCaseId));
      map[requirement.id] = [...new Set([...(map[requirement.id] || []), ...scopedLinkedIds])];
    });

    return map;
  }, [requirements, testCases]);

  const requirementIterationById = useMemo(() => {
    const map = new Map<string, RequirementIteration>();
    requirements.forEach((requirement) => {
      const iteration = requirementIterations.find((item) =>
        (item.requirement_ids || []).includes(requirement.id)
        || Boolean(requirement.iteration_id && item.id === requirement.iteration_id)
        || Boolean(requirement.sprint_id && item.jira_sprint_id && String(requirement.sprint_id) === String(item.jira_sprint_id))
        || Boolean(!requirement.sprint_id && requirement.sprint && [item.jira_sprint_name, item.name].some((name) => name === requirement.sprint))
      );

      if (iteration) {
        map.set(requirement.id, iteration);
      }
    });

    return map;
  }, [requirementIterations, requirements]);

  const passCoverageByRequirementId = useMemo(() => {
    const coverage: Record<string, RequirementCoverageMetric> = {};

    requirements.forEach((requirement) => {
      const linkedCaseIds = linkedCaseIdsByRequirementId[requirement.id] || [];
      const covered = linkedCaseIds.filter((testCaseId) => latestResultByCaseId[testCaseId]?.status === "passed").length;
      const total = linkedCaseIds.length;

      coverage[requirement.id] = {
        total,
        covered,
        percent: total ? Math.round((covered / total) * 100) : 0
      };
    });

    return coverage;
  }, [latestResultByCaseId, linkedCaseIdsByRequirementId, requirements]);

  const automationCoverageByRequirementId = useMemo(() => {
    const coverage: Record<string, RequirementCoverageMetric> = {};
    const testCaseById = new Map(testCases.map((testCase) => [testCase.id, testCase]));

    requirements.forEach((requirement) => {
      const linkedCaseIds = linkedCaseIdsByRequirementId[requirement.id] || [];
      const covered = linkedCaseIds.filter((testCaseId) => testCaseById.get(testCaseId)?.automated === "yes").length;
      const total = linkedCaseIds.length;

      coverage[requirement.id] = {
        total,
        covered,
        percent: total ? Math.round((covered / total) * 100) : 0
      };
    });

    return coverage;
  }, [linkedCaseIdsByRequirementId, requirements, testCases]);

  const issueById = useMemo(() => {
    const map = new Map<string, Issue | RequirementDefectLink>();

    requirements.forEach((requirement) => {
      (requirement.defects || []).forEach((defect) => {
        map.set(defect.id, defect);
      });
    });

    issues.forEach((issue) => {
      map.set(issue.id, issue);
    });

    return map;
  }, [issues, requirements]);

  const defectsByRequirementId = useMemo(() => {
    const map: Record<string, RequirementDefectLink[]> = {};

    requirements.forEach((requirement) => {
      const linkedDefects = requirement.defects || [];
      const defectIds = requirement.defect_ids || linkedDefects.map((defect) => defect.id);

      map[requirement.id] = defectIds
        .map((defectId) => {
          const issue = issueById.get(defectId);

          if (!issue) {
            return linkedDefects.find((defect) => defect.id === defectId) || null;
          }

          return {
            id: issue.id,
            title: issue.title,
            status: issue.status,
            status_category: issue.status_category,
            severity: "severity" in issue ? issue.severity : linkedDefects.find((defect) => defect.id === issue.id)?.severity,
            priority: "priority" in issue ? issue.priority : linkedDefects.find((defect) => defect.id === issue.id)?.priority,
            link_source: "link_source" in issue ? issue.link_source : linkedDefects.find((defect) => defect.id === issue.id)?.link_source,
            created_at: issue.created_at
          } satisfies RequirementDefectLink;
        })
        .filter(Boolean) as RequirementDefectLink[];
    });

    return map;
  }, [issueById, requirements]);

  const bugResolutionByRequirementId = useMemo(() => {
    const coverage: Record<string, RequirementCoverageMetric> = {};
    const statusCategoryByName = new Map(
      (domainMetadataQuery.data?.issues.statuses || []).map((status) => [
        status.value.toLowerCase(),
        String(status.category_key || status.category_name || "").toLowerCase()
      ])
    );

    requirements.forEach((requirement) => {
      const defects = defectsByRequirementId[requirement.id] || [];
      const total = defects.length;
      const covered = defects.filter((defect) => {
        const category = String(defect.status_category || statusCategoryByName.get(String(defect.status || "").toLowerCase()) || "").toLowerCase();
        return category === "done";
      }).length;

      coverage[requirement.id] = {
        total,
        covered,
        percent: total ? Math.round((covered / total) * 100) : 0
      };
    });

    return coverage;
  }, [defectsByRequirementId, domainMetadataQuery.data?.issues.statuses, requirements]);

  const executionById = useMemo(
    () => new Map(executions.map((execution) => [execution.id, execution])),
    [executions]
  );

  const runHistoryByRequirementId = useMemo(() => {
    const map: Record<string, RequirementRunHistoryRow[]> = {};
    const testCaseById = new Map(testCases.map((testCase) => [testCase.id, testCase]));
    const latestResultByExecutionCase = new Map<string, ExecutionResult>();

    executionResults.forEach((result) => {
      const key = `${result.execution_id}:${result.test_case_id}`;
      const current = latestResultByExecutionCase.get(key);
      const currentTime = current?.created_at ? new Date(current.created_at).getTime() || 0 : 0;
      const nextTime = result.created_at ? new Date(result.created_at).getTime() || 0 : 0;

      if (!current || nextTime >= currentTime) {
        latestResultByExecutionCase.set(key, result);
      }
    });

    requirements.forEach((requirement) => {
      const linkedCaseIds = new Set(linkedCaseIdsByRequirementId[requirement.id] || []);

      map[requirement.id] = Array.from(latestResultByExecutionCase.values())
        .filter((result) => linkedCaseIds.has(result.test_case_id))
        .map((result) => {
          const execution = executionById.get(result.execution_id);
          const testCase = testCaseById.get(result.test_case_id);

          return {
            key: `${result.execution_id}:${result.test_case_id}`,
            executionId: result.execution_id,
            executionName: execution?.name || result.execution_id,
            executionStatus: execution?.status || null,
            testCaseId: result.test_case_id,
            testCaseTitle: result.test_case_title || testCase?.title || result.test_case_id,
            resultStatus: result.status,
            defects: result.defects || [],
            createdAt: result.created_at,
            startedAt: execution?.started_at || null,
            endedAt: execution?.ended_at || null
          };
        })
        .sort((left, right) => {
          const leftTime = new Date(left.endedAt || left.createdAt || left.startedAt || 0).getTime() || 0;
          const rightTime = new Date(right.endedAt || right.createdAt || right.startedAt || 0).getTime() || 0;
          return rightTime - leftTime;
        });
    });

    return map;
  }, [executionById, executionResults, linkedCaseIdsByRequirementId, requirements, testCases]);

  const predefinedRequirementStatuses = domainMetadataQuery.data?.requirements.statuses || [];
  const requirementStatusOptions = useMemo(
    () =>
      Array.from(new Set([
        ...predefinedRequirementStatuses.map((option) => option.value),
        ...requirements.map((item) => item.status || defaultRequirementStatus)
      ])).sort((left, right) => left.localeCompare(right)),
    [defaultRequirementStatus, predefinedRequirementStatuses, requirements]
  );
  const createRequirementStatusOptions = useMemo(() => {
    const workflowOptions = requirementCreateMetadataQuery.data?.workflow_statuses?.statuses || [];
    const baseOptions = workflowOptions.length ? workflowOptions : predefinedRequirementStatuses;
    if (!createDraft.status || baseOptions.some((option) => option.value === createDraft.status)) return baseOptions;
    return [{ value: createDraft.status, label: createDraft.status }, ...baseOptions];
  }, [createDraft.status, predefinedRequirementStatuses, requirementCreateMetadataQuery.data?.workflow_statuses?.statuses]);
  const editRequirementStatusOptions = useMemo(() => {
    const workflowOptions = requirementEditMetadataQuery.data?.workflow_statuses?.statuses || [];
    const baseOptions = workflowOptions.length ? workflowOptions : predefinedRequirementStatuses;
    if (!draft.status || baseOptions.some((option) => option.value === draft.status)) return baseOptions;
    return [{ value: draft.status, label: draft.status, current: true }, ...baseOptions];
  }, [draft.status, predefinedRequirementStatuses, requirementEditMetadataQuery.data?.workflow_statuses?.statuses]);
  const requirementPriorityOptions = useMemo(
    () =>
      Array.from(new Set(requirements.map((item) => String(item.priority ?? 3)))).sort((left, right) => Number(left) - Number(right)),
    [requirements]
  );
  const requirementLabelOptions = useMemo(
    () => {
      const labels = new Map<string, string>();

      requirements.flatMap((item) => item.labels || []).forEach((label) => {
        const normalizedLabel = label.trim();
        if (normalizedLabel && !labels.has(normalizedLabel.toLowerCase())) {
          labels.set(normalizedLabel.toLowerCase(), normalizedLabel);
        }
      });

      return Array.from(labels.values()).sort((left, right) => left.localeCompare(right));
    },
    [requirements]
  );
  const requirementSprintOptions = useMemo(
    () => Array.from(new Set(requirements.map((item) => item.sprint || "").filter(Boolean))).sort((left, right) => left.localeCompare(right)),
    [requirements]
  );
  const requirementFixVersionOptions = useMemo(
    () => Array.from(new Set(requirements.map((item) => item.fix_version || "").filter(Boolean))).sort((left, right) => left.localeCompare(right)),
    [requirements]
  );
  const requirementReleaseOptions = useMemo(
    () => Array.from(new Set(requirements.map((item) => item.release || "").filter(Boolean))).sort((left, right) => left.localeCompare(right)),
    [requirements]
  );

  const filteredRequirements = useMemo(() => {
    const normalizedSearch = deferredRequirementSearchTerm.trim().toLowerCase();

    return requirements.filter((item) => {
      const linkedCaseCount = (linkedCaseIdsByRequirementId[item.id] || []).length;
      const matchesSearch =
        !normalizedSearch ||
        [
          item.display_id || "",
          item.id,
          item.title,
          item.description || "",
          ...(item.external_references || []),
          ...(item.labels || []),
          item.sprint || "",
          item.fix_version || "",
          item.release || "",
          requirementIterationById.get(item.id)?.name || "",
          ...(item.test_case_ids || []),
          ...(item.defects || []).flatMap((defect) => [defect.id, defect.title, defect.status || ""]),
          item.status || defaultRequirementStatus,
          `p${item.priority ?? 3}`,
          `priority ${item.priority ?? 3}`
        ].some((value) => value.toLowerCase().includes(normalizedSearch));

      if (!matchesSearch) {
        return false;
      }

      if (requirementStatusFilter !== "all" && (item.status || defaultRequirementStatus) !== requirementStatusFilter) {
        return false;
      }

      if (requirementPriorityFilter !== "all" && String(item.priority ?? 3) !== requirementPriorityFilter) {
        return false;
      }

      if (requirementLabelFilter !== "all" && !(item.labels || []).includes(requirementLabelFilter)) {
        return false;
      }

      if (requirementSprintFilter !== "all" && (item.sprint || "") !== requirementSprintFilter) {
        return false;
      }

      if (requirementFixVersionFilter !== "all" && (item.fix_version || "") !== requirementFixVersionFilter) {
        return false;
      }

      if (requirementReleaseFilter !== "all" && (item.release || "") !== requirementReleaseFilter) {
        return false;
      }

      if (requirementCoverageFilter === "linked" && !linkedCaseCount) {
        return false;
      }

      if (requirementCoverageFilter === "unlinked" && linkedCaseCount) {
        return false;
      }

      return true;
    });
  }, [defaultRequirementStatus, deferredRequirementSearchTerm, linkedCaseIdsByRequirementId, requirementCoverageFilter, requirementFixVersionFilter, requirementIterationById, requirementLabelFilter, requirementPriorityFilter, requirementReleaseFilter, requirementSprintFilter, requirementStatusFilter, requirements]);

  const iterationRequirementOptions = useMemo(() => {
    const normalizedSearch = iterationRequirementSearch.trim().toLowerCase();

    return requirements
      .filter((item) => {
        if (!normalizedSearch) {
          return true;
        }

        return [
          item.display_id || "",
          item.id,
          item.title,
          item.description || "",
          ...(item.external_references || []),
          ...(item.labels || []),
          item.status || defaultRequirementStatus,
          requirementIterationById.get(item.id)?.name || ""
        ].some((value) => value.toLowerCase().includes(normalizedSearch));
      })
      .sort((left, right) => left.title.localeCompare(right.title));
  }, [defaultRequirementStatus, iterationRequirementSearch, requirementIterationById, requirements]);

  const areAllIterationRequirementsSelected = Boolean(iterationRequirementOptions.length)
    && iterationRequirementOptions.every((item) => sprintDraftRequirementIds.includes(item.id));

  const requirementIterationGroups = useMemo(() => {
    const assignedRequirementIds = new Set<string>();
    const groups = requirementIterations.map((iteration) => {
      const locallyAssignedIds = new Set((iteration.requirement_ids || []).map(String));
      const groupRequirements = filteredRequirements.filter((requirement) => {
        if (assignedRequirementIds.has(requirement.id)) return false;
        const matches = locallyAssignedIds.has(requirement.id)
          || Boolean(requirement.iteration_id && requirement.iteration_id === iteration.id)
          || Boolean(requirement.sprint_id && iteration.jira_sprint_id && String(requirement.sprint_id) === String(iteration.jira_sprint_id))
          || Boolean(!requirement.sprint_id && requirement.sprint && [iteration.jira_sprint_name, iteration.name].some((name) => name === requirement.sprint));
        if (matches) assignedRequirementIds.add(requirement.id);
        return matches;
      });
      return { iteration, requirements: groupRequirements };
    }).filter(({ iteration, requirements: groupRequirements }) =>
      String(iteration.state || iteration.status || "").toLowerCase() !== "closed" || groupRequirements.length > 0
    );
    const unassignedRequirements = filteredRequirements.filter((requirement) => !assignedRequirementIds.has(requirement.id));

    return { groups, unassignedRequirements };
  }, [filteredRequirements, requirementIterations]);

  const iterationHealth = useMemo(() => {
    const defectFromId = (defectId: string): RequirementDefectLink => {
      const issue = issueById.get(defectId);

      if (issue) {
        return {
          id: issue.id,
          title: issue.title,
          status: issue.status,
          severity: "severity" in issue ? issue.severity : null,
          priority: "priority" in issue ? issue.priority : null,
          link_source: "link_source" in issue ? issue.link_source : "automatic",
          created_at: issue.created_at
        };
      }

      return {
        id: defectId,
        title: defectId,
        status: null,
        link_source: "automatic"
      };
    };
    const derive = (items: Requirement[]) => deriveIterationHealth(items.map((item) => ({
      priority: item.priority,
      status: item.status_category || item.status || defaultRequirementStatus,
      linkedCaseCount: (linkedCaseIdsByRequirementId[item.id] || []).length,
      passPercent: passCoverageByRequirementId[item.id]?.percent || 0,
      automationPercent: automationCoverageByRequirementId[item.id]?.percent || 0,
      linkedCases: (linkedCaseIdsByRequirementId[item.id] || []).map((testCaseId) => ({
        id: testCaseId,
        status: latestResultByCaseId[testCaseId]?.status || null
      })),
      defects: Array.from(
        new Map([
          ...(defectsByRequirementId[item.id] || []).map((defect) => [defect.id, defect] as const),
          ...(linkedCaseIdsByRequirementId[item.id] || []).flatMap((testCaseId) =>
            (latestResultByCaseId[testCaseId]?.defects || []).map((defectId) => [defectId, defectFromId(defectId)] as const)
          )
        ]).values()
      )
    })), canUseAutomationWorkspace);

    return {
      byId: new Map(requirementIterationGroups.groups.map(({ iteration, requirements: items }) => [iteration.id, derive(items)])),
      unassigned: derive(requirementIterationGroups.unassignedRequirements)
    };
  }, [automationCoverageByRequirementId, canUseAutomationWorkspace, defaultRequirementStatus, defectsByRequirementId, issueById, latestResultByCaseId, linkedCaseIdsByRequirementId, passCoverageByRequirementId, requirementIterationGroups]);
  const renderIterationMetrics = (health: ReturnType<typeof deriveIterationHealth>) => (
    <HierarchyMetricStrip
      count={health.count}
      noun="story"
      metrics={[
        {
          label: "Done",
          value: `${health.completionPercent}%`,
          tone: health.completionPercent >= 80 ? "success" : health.completionPercent >= 50 ? "warning" : "neutral",
          title: `${health.completedRequirementCount}/${health.count} stories are in a completed Jira workflow status.`
        },
        {
          label: "Coverage",
          value: `${health.coveragePercent}%`,
          tone: health.coveragePercent >= 80 ? "success" : health.coveragePercent >= 50 ? "warning" : "danger",
          title: `${health.count - health.zeroCoverageCount}/${health.count} stories have at least one linked test case. Zero coverage: ${health.zeroCoverageCount}.`
        },
        {
          label: "Run pass",
          value: health.executedCaseCount ? `${health.passRatePercent}%` : "—",
          tone: !health.executedCaseCount ? "neutral" : health.passRatePercent >= 85 ? "success" : health.passRatePercent >= 65 ? "warning" : "danger",
          title: `${health.passedCaseCount}/${health.executedCaseCount} executed cases passed. Fail rate: ${health.failRatePercent}%; blocked: ${health.blockedCaseCount}; not run: ${health.notRunCaseCount}.`
        },
        {
          label: "At risk",
          value: health.requirementsAtRisk,
          tone: health.requirementsAtRisk ? "danger" : "success",
          title: `At-risk stories are uncovered, have failed or blocked linked cases, open P1/P2 bugs, or weak high-priority readiness. P1/P2 bugs: ${health.openHighDefectCount}; total bugs: ${health.totalDefectCount}.`
        }
      ]}
    />
  );
  const renderDeferredSprintMetrics = (count: number) => (
    <HierarchyMetricStrip
      count={count}
      noun="story"
      metrics={[{ label: "Metrics", value: "On expand", tone: "neutral", title: "Open this Sprint to load its bounded Story page and calculate live Sprint metrics." }]}
    />
  );

  const renderSprintIdentity = (iteration: RequirementIteration) => {
    const state = String(iteration.state || iteration.status || "unknown").toLowerCase();
    const goal = richTextToPlainText(iteration.goal || iteration.description).trim();
    return (
      <div className="requirement-sprint-identity">
        <span className="module-folder-icon"><IterationIcon /></span>
        <div className="requirement-sprint-copy">
          <div className="requirement-sprint-heading">
            <strong>{iteration.name}</strong>
            <span className={`requirement-sprint-status is-${state}`}>{sprintStateLabel(state)}</span>
          </div>
          <div className="requirement-sprint-meta">
            <span className="requirement-sprint-dates">{sprintDateRangeLabel(iteration.start_date, iteration.end_date)}</span>
            {iteration.board_name ? <span title="Jira board">{iteration.board_name}</span> : null}
          </div>
          {goal ? <span className="requirement-sprint-goal" title={goal}>{goal}</span> : null}
        </div>
      </div>
    );
  };

  const iterationTileEntries = useMemo(() => {
    const entries: Array<
      | { kind: "iteration"; iteration: RequirementIteration; count: number }
      | { kind: "unassigned"; count: number }
      | { kind: "requirement"; requirement: Requirement }
    > = [];

    requirementIterationGroups.groups.forEach(({ iteration, requirements: groupRequirements }) => {
      if (!groupRequirements.length && requirementSearchTerm.trim()) {
        return;
      }

      entries.push({ kind: "iteration", iteration, count: groupRequirements.length });
      if (!collapsedIterationIds.includes(iteration.id)) {
        groupRequirements.forEach((requirement) => entries.push({ kind: "requirement", requirement }));
      }
    });

    if (requirementIterationGroups.unassignedRequirements.length || requirementsQuery.hasNextPage) {
      entries.push({ kind: "unassigned", count: requirementIterationGroups.unassignedRequirements.length });
      requirementIterationGroups.unassignedRequirements.forEach((requirement) => entries.push({ kind: "requirement", requirement }));
    }

    return entries;
  }, [collapsedIterationIds, requirementIterationGroups, requirementSearchTerm, requirementsQuery.hasNextPage]);

  const activeRequirementFilterCount =
    Number(requirementStatusFilter !== "all") +
    Number(requirementPriorityFilter !== "all") +
    Number(requirementLabelFilter !== "all") +
    Number(requirementSprintFilter !== "all") +
    Number(requirementFixVersionFilter !== "all") +
    Number(requirementReleaseFilter !== "all") +
    Number(requirementCoverageFilter !== "all");

  const areAllFilteredRequirementsSelected =
    (filteredRequirements.length > 0 || requirementIterationGroups.groups.length > 0)
    && filteredRequirements.every((item) => deleteSelectedRequirementIds.includes(item.id))
    && requirementIterationGroups.groups
      .filter(({ iteration }) => iteration.source !== "jira")
      .every(({ iteration }) => selectedIterationIds.includes(iteration.id));

  const selectedExportRequirements = useMemo(
    () => requirements.filter((item) => deleteSelectedRequirementIds.includes(item.id)),
    [deleteSelectedRequirementIds, requirements]
  );

  const getVisibleIterationRequirementIds = (iterationId: string) =>
    requirementIterationGroups.groups.find(({ iteration }) => iteration.id === iterationId)?.requirements.map((requirement) => requirement.id) || [];

  const setRequirementIdsSelected = (requirementIds: string[], checked: boolean) => {
    const uniqueIds = [...new Set(requirementIds)];
    setDeleteSelectedRequirementIds((current) => checked
      ? [...new Set([...current, ...uniqueIds])]
      : current.filter((id) => !uniqueIds.includes(id)));
  };

  const setAllFilteredRequirementItemsSelected = (checked: boolean) => {
    const requirementIds = filteredRequirements.map((item) => item.id);
    const iterationIds = requirementIterationGroups.groups
      .filter(({ iteration }) => iteration.source !== "jira")
      .map(({ iteration }) => iteration.id);

    setRequirementIdsSelected(requirementIds, checked);
    setSelectedIterationIds((current) => checked
      ? [...new Set([...current, ...iterationIds])]
      : current.filter((id) => !iterationIds.includes(id)));
  };

  const setIterationAndChildrenSelected = (iteration: RequirementIteration, checked: boolean) => {
    const requirementIds = getVisibleIterationRequirementIds(iteration.id);
    setSelectedIterationIds((current) => iteration.source === "jira"
      ? current.filter((id) => id !== iteration.id)
      : checked
        ? [...new Set([...current, iteration.id])]
        : current.filter((id) => id !== iteration.id));
    setRequirementIdsSelected(requirementIds, checked);
  };

  const setUnassignedRequirementsSelected = (checked: boolean) => {
    const requirementIds = requirementIterationGroups.unassignedRequirements.map((requirement) => requirement.id);
    setRequirementIdsSelected(requirementIds, checked);
  };

  const startDraggingRequirements = (requirementId: string) => {
    const ids = deleteSelectedRequirementIds.includes(requirementId) ? deleteSelectedRequirementIds : [requirementId];
    setDraggingRequirementIds(ids);
    return ids;
  };

  const aiRequirement = useMemo(
    () => requirements.find((item) => item.id === aiRequirementId) || selectedRequirement || requirements[0] || null,
    [aiRequirementId, requirements, selectedRequirement]
  );

  const currentAppTypeName = appTypes.find((item) => item.id === appTypeId)?.name || "No app type selected";
  const requirementListColumns = useMemo<Array<DataTableColumn<Requirement>>>(() => [
    {
      key: "select",
      label: "",
      canToggle: false,
      headerRender: () => (
        <label className="data-table-header-checkbox" onClick={(event) => event.stopPropagation()}>
          <input
            aria-label="Select all requirements"
            checked={areAllFilteredRequirementsSelected}
            onChange={(event) =>
              setAllFilteredRequirementItemsSelected(event.target.checked)
            }
            type="checkbox"
          />
        </label>
      ),
      render: (item) => (
        <div onClick={(event) => event.stopPropagation()}>
          <input
            checked={deleteSelectedRequirementIds.includes(item.id)}
            onChange={(event) =>
              setDeleteSelectedRequirementIds((current) =>
                event.target.checked ? [...new Set([...current, item.id])] : current.filter((id) => id !== item.id)
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
      sortValue: (item) => item.display_id || item.id,
      render: (item) => <DisplayIdBadge value={item.display_id || item.id} href={getJiraBrowseUrl(item.display_id || item.id, item.jira_url)} />
    },
    {
      key: "title",
      label: "Requirement",
      canToggle: false,
      sortValue: (item) => item.title,
      render: (item) => <strong>{item.title}</strong>
    },
    {
      key: "description",
      label: "Description",
      defaultVisible: false,
      sortValue: (item) => richTextToPlainText(item.description),
      render: (item) => <span className="data-table-description-clamp">{richTextToPlainText(item.description) || currentAppTypeName}</span>
    },
    {
      key: "externalReferences",
      label: "References",
      defaultVisible: false,
      sortValue: (item) => formatReferenceList(item.external_references),
      render: (item) => formatReferenceList(item.external_references) || "—"
    },
    {
      key: "labels",
      label: "Labels",
      defaultVisible: false,
      sortValue: (item) => formatReferenceList(item.labels),
      render: (item) => formatReferenceList(item.labels) || "—"
    },
    {
      key: "sprint",
      label: "Sprint",
      canToggle: false,
      defaultVisible: true,
      sortValue: (item) => item.sprint || "",
      render: (item) => item.sprint || "—"
    },
    {
      key: "fixVersion",
      label: "Fix Version",
      defaultVisible: false,
      sortValue: (item) => item.fix_version || "",
      render: (item) => item.fix_version || "—"
    },
    {
      key: "release",
      label: "Release",
      defaultVisible: false,
      sortValue: (item) => item.release || "",
      render: (item) => item.release || "—"
    },
    {
      key: "status",
      label: "Status",
      sortValue: (item) => item.status || defaultRequirementStatus,
      render: (item) => formatTileCardLabel(item.status, "Open")
    },
    {
      key: "priority",
      label: "Priority",
      sortValue: (item) => item.priority ?? 3,
      render: (item) => `P${item.priority ?? 3}`
    },
    {
      key: "linkedCases",
      label: "Linked cases",
      sortValue: (item) => (linkedCaseIdsByRequirementId[item.id] || []).length,
      render: (item) => (linkedCaseIdsByRequirementId[item.id] || []).length
    },
    {
      key: "linkedDefects",
      label: "Linked bugs",
      defaultVisible: false,
      sortValue: (item) => (defectsByRequirementId[item.id] || []).length,
      render: (item) => (defectsByRequirementId[item.id] || []).length
    },
    {
      key: "passRate",
      label: "Pass rate",
      defaultVisible: false,
      sortValue: (item) => passCoverageByRequirementId[item.id]?.percent || 0,
      render: (item) => {
        const metric = passCoverageByRequirementId[item.id] || { total: 0, covered: 0, percent: 0 };
        const safeValue = Math.max(0, Math.min(100, Math.round(metric.percent)));
        return `${safeValue}%`;
      }
    },
    ...(canUseAutomationWorkspace ? [{
      key: "automationCoverage",
      label: "Automation coverage",
      defaultVisible: false,
      sortValue: (item: Requirement) => automationCoverageByRequirementId[item.id]?.percent || 0,
      render: (item: Requirement) => {
        const metric = automationCoverageByRequirementId[item.id] || { total: 0, covered: 0, percent: 0 };
        const safeValue = Math.max(0, Math.min(100, Math.round(metric.percent)));
        return `${safeValue}%`;
      }
    }] : []),
    {
      key: "bugResolution",
      label: "Bug resolution",
      defaultVisible: false,
      sortValue: (item) => bugResolutionByRequirementId[item.id]?.percent || 0,
      render: (item) => {
        const metric = bugResolutionByRequirementId[item.id] || { total: 0, covered: 0, percent: 0 };
        return metric.total ? `${metric.percent}%` : "—";
      }
    },
    {
      key: "createdBy",
      label: "Created by",
      defaultVisible: false,
      sortValue: (item) => resolveAuditUserLabel(item.created_by, userById),
      render: (item) => resolveAuditUserLabel(item.created_by, userById)
    },
    {
      key: "createdAt",
      label: "Created at",
      defaultVisible: false,
      sortValue: (item) => item.created_at || "",
      render: (item) => formatAuditTimestamp(item.created_at)
    },
    {
      key: "updatedBy",
      label: "Last updated by",
      defaultVisible: false,
      sortValue: (item) => resolveAuditUserLabel(item.updated_by || item.created_by, userById),
      render: (item) => resolveAuditUserLabel(item.updated_by || item.created_by, userById)
    },
    {
      key: "updatedAt",
      label: "Last updated at",
      defaultVisible: false,
      sortValue: (item) => item.updated_at || item.created_at || "",
      render: (item) => formatAuditTimestamp(item.updated_at || item.created_at)
    },
    {
      key: "actions",
      label: "Actions",
      canToggle: false,
      render: (item) => (
        <div onClick={(event) => event.stopPropagation()}>
          <CatalogActionMenu
            actions={[
	              {
	                label: "Open requirement",
	                description: "Open this requirement in the detail workspace.",
	                icon: <OpenIcon />,
	                requiredPermissions: ["requirement.view"],
	                onClick: () => openRequirementWorkspace(item.id)
	              },
	              {
	                label: "AI test case generation",
	                description: "Generate or review AI-designed test cases for this requirement.",
	                icon: <SparkIcon />,
	                featureKeys: ["qaira.ai.requirement_design"],
	                permissionMode: "all" as const,
	                requiredPermissions: ["requirement.ai", "testcase.create"],
	                onClick: () => openRequirementAiStudio(item.id)
	              },
	              {
	                label: "AI Complete requirement",
	                description: "Use AI to improve missing or weak requirement details.",
	                icon: <SparkIcon />,
	                featureKeys: ["qaira.ai.requirement_design"],
	                permissionMode: "all" as const,
	                requiredPermissions: ["requirement.ai", "requirement.update"],
	                onClick: () => openRequirementOptimization([item.id])
	              },
	              {
	                label: "Delete requirement",
	                description: "Delete this requirement while keeping linked test cases in the library.",
	                icon: <TrashIcon />,
	                onClick: () => void handleDeleteRequirementItem(item),
	                disabled: deleteRequirement.isPending,
	                requiredPermissions: ["requirement.delete"],
	                tone: "danger" as const
	              }
            ]}
            label={`${item.title} actions`}
          />
        </div>
      )
    }
  ], [
    automationCoverageByRequirementId,
    canUseAutomationWorkspace,
    bugResolutionByRequirementId,
    currentAppTypeName,
    defaultRequirementStatus,
    areAllFilteredRequirementsSelected,
    deleteSelectedRequirementIds,
    deleteRequirement.isPending,
    defectsByRequirementId,
    handleDeleteRequirementItem,
    linkedCaseIdsByRequirementId,
    openRequirementAiStudio,
    passCoverageByRequirementId,
    requirementIterationById,
    userById
  ]);

  const getScopedRequirementListColumns = (scopeRequirementIds: string[], label: string) => {
    const uniqueScopeIds = [...new Set(scopeRequirementIds)];
    const areAllScopeRequirementsSelected =
      uniqueScopeIds.length > 0 && uniqueScopeIds.every((id) => deleteSelectedRequirementIds.includes(id));

    return requirementListColumns.map((column) => column.key === "select"
      ? {
          ...column,
          headerRender: () => (
            <label className="data-table-header-checkbox" onClick={(event) => event.stopPropagation()}>
              <input
                aria-label={label}
                checked={areAllScopeRequirementsSelected}
                onChange={(event) => setRequirementIdsSelected(uniqueScopeIds, event.target.checked)}
                type="checkbox"
              />
            </label>
          )
        }
      : column);
  };

  const selectedRequirementPassCoverage = selectedRequirement
    ? passCoverageByRequirementId[selectedRequirement.id] || { total: 0, covered: 0, percent: 0 }
    : { total: 0, covered: 0, percent: 0 };
  const selectedRequirementAutomationCoverage = selectedRequirement
    ? automationCoverageByRequirementId[selectedRequirement.id] || { total: 0, covered: 0, percent: 0 }
    : { total: 0, covered: 0, percent: 0 };
  const selectedRequirementBugResolution = selectedRequirement
    ? bugResolutionByRequirementId[selectedRequirement.id] || { total: 0, covered: 0, percent: 0 }
    : { total: 0, covered: 0, percent: 0 };
  const selectedRequirementRunHistory = selectedRequirement
    ? runHistoryByRequirementId[selectedRequirement.id] || []
    : [];
  const selectedRunHistoryByTestCaseId = useMemo(() => {
    const map: Record<string, RequirementRunHistoryRow[]> = {};

    selectedRequirementRunHistory.forEach((row) => {
      map[row.testCaseId] = [...(map[row.testCaseId] || []), row].slice(0, 5);
    });

    return map;
  }, [selectedRequirementRunHistory]);
  const selectedRequirementDefects = useMemo(() => {
    if (!selectedRequirement) {
      return [];
    }

    const linkedDefects = defectsByRequirementId[selectedRequirement.id] || [];
    const linkedById = new Map(linkedDefects.map((defect) => [defect.id, defect]));

    return selectedDefectIds
      .map((defectId) => {
        const issue = issueById.get(defectId);

        if (issue) {
          return {
            id: issue.id,
            title: issue.title,
            status: issue.status,
            link_source: "link_source" in issue ? issue.link_source : linkedById.get(issue.id)?.link_source,
            created_at: issue.created_at
          } satisfies RequirementDefectLink;
        }

        return linkedById.get(defectId) || null;
      })
      .filter(Boolean) as RequirementDefectLink[];
  }, [defectsByRequirementId, issueById, selectedDefectIds, selectedRequirement]);

  const associatedCases = useMemo(() => {
    if (!aiRequirement) {
      return [];
    }

    const linkedIds = new Set(aiRequirement.test_case_ids || []);
    return testCases.filter((testCase) => linkedIds.has(testCase.id));
  }, [aiRequirement, testCases]);

  const linkedPreviewCase = useMemo(
    () => testCases.find((testCase) => testCase.id === linkedPreviewCaseId) || null,
    [linkedPreviewCaseId, testCases]
  );

	  const openTestCaseWorkspace = (testCaseId: string) => setLinkedPreviewCaseId(testCaseId);
	  const openNewTestCase = (requirement: Requirement) => {
	    if (!canCreateTestCases) {
	      setMessageTone("error");
	      setMessage("Permission required: testcase.create");
	      return;
	    }

	    if (!appTypeId) {
	      setMessageTone("error");
	      setMessage("Select an app type before creating a test case for this requirement.");
      return;
    }

    const params = new URLSearchParams({
      create: "1",
      requirement: requirement.id,
      appType: appTypeId
    });

    if (projectId) {
      params.set("project", projectId);
    }

    navigate(`/test-cases?${params.toString()}`);
  };
  useEffect(() => {
    if (!selectedRequirement) {
      setDraft(emptyRequirementDraft);
      setSelectedTestCaseIds([]);
      setSelectedDefectIds([]);
      return;
    }

    setDraft({
      title: selectedRequirement.title,
      description: selectedRequirement.description || "",
      externalReferencesText: formatReferenceList(selectedRequirement.external_references),
      labelsText: formatReferenceList(selectedRequirement.labels),
      sprint: selectedRequirement.sprint_id
        || jiraSprints.find((sprint) => sprint.name === selectedRequirement.sprint)?.id
        || selectedRequirement.sprint
        || "",
      fixVersion: selectedRequirement.fix_version || "",
      release: selectedRequirement.release || "",
      iterationId: selectedRequirement.iteration_id || requirementIterationById.get(selectedRequirement.id)?.id || "",
      priority: selectedRequirement.priority ?? 3,
      status: selectedRequirement.status || defaultRequirementStatus,
      additionalFields: {}
    });
    setSelectedTestCaseIds(selectedRequirement.test_case_ids || []);
    setSelectedDefectIds(selectedRequirement.defect_ids || []);
  }, [defaultRequirementStatus, emptyRequirementDraft, jiraSprints, requirementIterationById, selectedRequirement]);

  useEffect(() => {
    if (!selectedRequirement || !requirementEditMetadataQuery.data) return;
    setDraft((current) => ({
      ...current,
      additionalFields: { ...(requirementEditMetadataQuery.data.current_values || {}) }
    }));
  }, [requirementEditMetadataQuery.data, selectedRequirement]);

  useEffect(() => {
    setExpandedSections(createDefaultRequirementSections());
    setDetailTestCaseSearchTerm("");
    setIsDetailTestCaseSearchActive(false);
    setDefectSearchTerm("");
    setIsDefectSearchLoaded(false);
    setActiveTraceabilityTab("details");
  }, [selectedRequirement?.id]);

  useEffect(() => {
    if (!aiRequirementId && selectedRequirement) {
      setAiRequirementId(selectedRequirement.id);
    }
  }, [aiRequirementId, selectedRequirement]);

  useEffect(() => {
    if (!isCreateModalOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !createRequirement.isPending) {
        setIsCreateModalOpen(false);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [createRequirement.isPending, isCreateModalOpen]);

  useEffect(() => {
    if (!isImportModalOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !bulkImportRequirements.isPending) {
        setIsImportModalOpen(false);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [bulkImportRequirements.isPending, isImportModalOpen]);

  useEffect(() => {
    if (!isAiStudioOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !previewDesignedCases.isPending && !acceptDesignedCases.isPending) {
        setIsAiStudioOpen(false);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [acceptDesignedCases.isPending, isAiStudioOpen, previewDesignedCases.isPending]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["requirements", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["requirement-iterations", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["requirements-test-cases", projectId, appTypeId] }),
      queryClient.invalidateQueries({ queryKey: ["requirements-execution-results", projectId, appTypeId] }),
      queryClient.invalidateQueries({ queryKey: ["requirements-executions", projectId, appTypeId] }),
      queryClient.invalidateQueries({ queryKey: ["requirements-issues", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["domain-metadata"] }),
      queryClient.invalidateQueries({ queryKey: ["test-cases"] }),
      queryClient.invalidateQueries({ queryKey: ["workspace-transactions"] }),
      queryClient.invalidateQueries({ queryKey: ["workspace-transaction-events"] })
    ]);
  };

  const openCreateRequirementModal = () => {
    if (!canCreateRequirements) {
      showError(null, "Permission required: requirement.create");
      return;
    }

    setCreateDraft(emptyRequirementDraft);
    setIsCreateModalOpen(true);
  };

  const closeRequirementDetail = () => {
    syncRequirementSearchParams(null);
    setSelectedRequirementId("");
    setDraft(emptyRequirementDraft);
    setSelectedTestCaseIds([]);
    setSelectedDefectIds([]);
    setDetailTestCaseSearchTerm("");
    setIsDetailTestCaseSearchActive(false);
    setDefectSearchTerm("");
    setIsDefectSearchLoaded(false);
    setExpandedSections(createDefaultRequirementSections());
  };

  const closeCreateRequirementModal = () => {
    if (createRequirement.isPending) {
      return;
    }

    setIsCreateModalOpen(false);
  };

  useEffect(() => {
    if (searchParams.get("create") !== "1" || isCreateModalOpen) {
      return;
    }

    openCreateRequirementModal();
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("create");
      return next;
    }, { replace: true });
  }, [isCreateModalOpen, searchParams, setSearchParams]);

  const openRequirementImportModal = () => {
    if (!canImportRequirements) {
      showError(null, "Permission required: requirement.import");
      return;
    }

    setImportRows([]);
    setImportWarnings([]);
    setImportFileName("");
    setIsImportModalOpen(true);
  };

  const toggleSelectedTestCase = (
    setter: Dispatch<SetStateAction<string[]>>,
    testCaseId: string,
    checked: boolean
  ) => {
    setter((current) => (checked ? [...new Set([...current, testCaseId])] : current.filter((id) => id !== testCaseId)));
  };
  const handleCreateRequirement = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canCreateRequirements) {
      showError(null, "Permission required: requirement.create");
      return;
    }

    if (!projectId) {
      showError(null, "Select a project before creating a requirement.");
      return;
    }

    if (requirementCreateMetadataQuery.isLoading) {
      showSuccess("Checking this Jira project's Story create fields. Try again in a moment.");
      return;
    }

    if (requirementCreateMetadataQuery.isError) {
      showError(null, "Qaira could not verify this Jira Story create screen. Refresh the form or ask a Jira administrator to check the app field-metadata permission.");
      return;
    }

    if (jiraRequirementCoreRequired.description && !richTextToPlainText(createDraft.description).trim()) {
      showError(null, "Jira requires a description for this Story type.");
      return;
    }

    try {
      const response = await createRequirement.mutateAsync({
        project_id: projectId,
        title: createDraft.title,
        description: createDraft.description || undefined,
        external_references: parseReferenceList(createDraft.externalReferencesText),
        labels: parseReferenceList(createDraft.labelsText),
        sprint: createDraft.sprint || undefined,
        fix_version: createDraft.fixVersion || undefined,
        release: createDraft.release || undefined,
        priority: createDraft.priority,
        status: createDraft.status,
        additional_fields: createDraft.additionalFields
      });

      syncRequirementSearchParams(response.id);
      setSelectedRequirementId(response.id);
      setAiRequirementId(response.id);
      setIsCreateModalOpen(false);
      setCreateDraft(emptyRequirementDraft);
      showSuccess(response.status_warning
        ? `Requirement created. Jira kept its workflow status because ${response.status_warning.requested_status || createDraft.status} is not available from the current workflow state.`
        : "Requirement created.");
      await refresh();
    } catch (error) {
      showError(error, "Unable to create requirement");
    }
  };

  const openEditIteration = (iteration: RequirementIteration) => {
    setEditingIteration(iteration);
    setIterationRequirementSearch("");
    setIterationDraftName(iteration.name);
    setIterationDraftDescription(iteration.description || iteration.goal || "");
    setIterationDraftBoardId(iteration.board_id || jiraBoards[0]?.id || "");
    setIterationDraftStartDate(String(iteration.start_date || "").slice(0, 10));
    setIterationDraftEndDate(String(iteration.end_date || "").slice(0, 10));
    setIterationDraftStatus(String(iteration.state || iteration.status || "future").toLowerCase() === "active" ? "active" : "future");
    setSprintDraftRequirementIds([]);
    setIsCreateIterationModalOpen(true);
  };

  const handleSaveIteration = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (editingIteration ? !canUpdateRequirementIterations : !canCreateRequirementIterations) {
      showError(null, `Permission required: requirement_iteration.${editingIteration ? "update" : "create"}`);
      return;
    }

    if (!projectId || !iterationDraftName.trim() || (!editingIteration && !iterationDraftBoardId) || !iterationDraftStartDate || !iterationDraftEndDate) {
      return;
    }

    if (iterationDraftEndDate <= iterationDraftStartDate) {
      showError(null, "Sprint end date must be after its start date.");
      return;
    }

    try {
      if (editingIteration) {
        await updateRequirementIteration.mutateAsync({
          id: editingIteration.id,
          input: {
            name: iterationDraftName.trim(),
            description: iterationDraftDescription.trim(),
            goal: richTextToPlainText(iterationDraftDescription).trim(),
            start_date: iterationDraftStartDate,
            end_date: iterationDraftEndDate,
            state: iterationDraftStatus
          }
        });
        setEditingIteration(null);
        setIsCreateIterationModalOpen(false);
        showSuccess("Sprint updated in Jira.");
        await refresh();
        return;
      }
      const response = await createRequirementIteration.mutateAsync({
        project_id: projectId,
        name: iterationDraftName.trim(),
        description: iterationDraftDescription.trim() || undefined,
        goal: richTextToPlainText(iterationDraftDescription).trim() || undefined,
        board_id: iterationDraftBoardId,
        start_date: iterationDraftStartDate,
        end_date: iterationDraftEndDate,
        state: iterationDraftStatus,
        requirement_ids: sprintDraftRequirementIds
      });
      setIterationDraftName("");
      setIterationDraftDescription("");
      setIterationDraftStatus("future");
      const nextDates = defaultSprintDates();
      setIterationDraftStartDate(nextDates.start);
      setIterationDraftEndDate(nextDates.end);
      setSprintDraftRequirementIds([]);
      setEditingIteration(null);
      setIsCreateIterationModalOpen(false);
      setCollapsedIterationIds((current) => current.filter((id) => id !== response.id));
      setDeleteSelectedRequirementIds([]);
      showSuccess("Sprint created in Jira.");
      await refresh();
    } catch (error) {
      showError(error, editingIteration ? "Unable to update sprint" : "Unable to create sprint");
    }
  };

  const handleDropRequirementOnIteration = async (iterationId: string) => {
    if (!draggingRequirementIds.length) {
      return;
    }

    try {
      await assignRequirementsToIteration.mutateAsync({ id: iterationId, requirementIds: draggingRequirementIds, append: true });
      const movedCount = draggingRequirementIds.length;
      setDraggingRequirementIds([]);
      setCollapsedIterationIds((current) => current.filter((id) => id !== iterationId));
      showSuccess(`${movedCount} ${movedCount === 1 ? "story" : "stories"} moved into sprint.`);
      await refresh();
    } catch (error) {
      showError(error, "Unable to move story into sprint");
    }
  };

  const handleDeleteSelectedIterations = async () => {
    if (!selectedIterationIds.length || !canDeleteRequirementIterations) {
      return;
    }

    const confirmed = await confirmDelete({
      message: `Delete ${selectedIterationIds.length} legacy sprint group${selectedIterationIds.length === 1 ? "" : "s"}? Stories will stay available in the backlog.`
    });

    if (!confirmed) {
      return;
    }

    try {
      await Promise.all(selectedIterationIds.map((iterationId) => deleteRequirementIteration.mutateAsync(iterationId)));
      setSelectedIterationIds([]);
      showSuccess("Selected legacy sprint group deleted.");
      await refresh();
    } catch (error) {
      showError(error, "Unable to delete selected sprint groups");
    }
  };

  const handleDeleteSelectedRequirementItems = async () => {
    const selectedRequirements = requirements.filter((item) => deleteSelectedRequirementIds.includes(item.id));
    const selectedIterations = selectedIterationIds;

    if (!selectedRequirements.length && !selectedIterations.length) {
      return;
    }

    if ((selectedRequirements.length && !canDeleteRequirements) || (selectedIterations.length && !canDeleteRequirementIterations)) {
      showError(null, "Permission required to delete the selected requirement items.");
      return;
    }

    const parts = [
      selectedRequirements.length ? `${selectedRequirements.length} requirement${selectedRequirements.length === 1 ? "" : "s"}` : "",
      selectedIterations.length ? `${selectedIterations.length} legacy sprint group${selectedIterations.length === 1 ? "" : "s"}` : ""
    ].filter(Boolean);
    const confirmed = await confirmDelete({
      message: `Delete ${parts.join(" and ")}? Linked test cases stay available; stories not selected for deletion return to the backlog when a legacy sprint group is removed.`
    });

    if (!confirmed) {
      return;
    }

    setIsDeletingSelectedRequirements(true);

    try {
      const [requirementResults, iterationResults] = await Promise.all([
        Promise.allSettled(selectedRequirements.map((requirement) => api.requirements.delete(requirement.id))),
        Promise.allSettled(selectedIterations.map((iterationId) => deleteRequirementIteration.mutateAsync(iterationId)))
      ]);
      const deletedRequirementIds = selectedRequirements
        .filter((_, index) => requirementResults[index]?.status === "fulfilled")
        .map((requirement) => requirement.id);
      const deletedIterationIds = selectedIterations.filter((_, index) => iterationResults[index]?.status === "fulfilled");
      const failedCount = requirementResults.filter((result) => result.status === "rejected").length + iterationResults.filter((result) => result.status === "rejected").length;

      setDeleteSelectedRequirementIds((current) => current.filter((id) => !deletedRequirementIds.includes(id)));
      setSelectedIterationIds((current) => current.filter((id) => !deletedIterationIds.includes(id)));

      if (deletedRequirementIds.includes(selectedRequirementId)) {
        syncRequirementSearchParams(null);
        setSelectedRequirementId("");
      }

      if (deletedRequirementIds.includes(aiRequirementId)) {
        setAiRequirementId("");
      }

      if (deletedRequirementIds.length || deletedIterationIds.length) {
        await refresh();
      }

      if (failedCount) {
        setMessageTone("error");
        setMessage(`${deletedRequirementIds.length} requirement${deletedRequirementIds.length === 1 ? "" : "s"} and ${deletedIterationIds.length} sprint group${deletedIterationIds.length === 1 ? "" : "s"} deleted, ${failedCount} failed.`);
        return;
      }

      showSuccess(`${deletedRequirementIds.length} requirement${deletedRequirementIds.length === 1 ? "" : "s"} and ${deletedIterationIds.length} sprint group${deletedIterationIds.length === 1 ? "" : "s"} deleted.`);
    } catch (error) {
      showError(error, "Unable to delete selected requirement items");
    } finally {
      setIsDeletingSelectedRequirements(false);
    }
  };

	  const handleSaveRequirement = async (event: FormEvent<HTMLFormElement>) => {
	    event.preventDefault();

	    if (!canUpdateRequirements) {
	      showError(null, "Permission required: requirement.update");
	      return;
	    }

	    if (!selectedRequirement) {
	      return;
	    }

    if (requirementEditMetadataQuery.isLoading) {
      showError(null, "Checking this Jira Story's editable required fields. Try again in a moment.");
      return;
    }

    if (requirementEditMetadataQuery.isError) {
      showError(null, "Qaira could not verify this Jira Story edit screen. Refresh before updating the Story.");
      return;
    }

    if (jiraRequirementEditCoreRequired.description && !richTextToPlainText(draft.description).trim()) {
      showError(null, "Jira requires a description for this Story type.");
      return;
    }

    try {
      await updateRequirement.mutateAsync({
        id: selectedRequirement.id,
        input: {
          title: draft.title,
          description: draft.description,
          external_references: parseReferenceList(draft.externalReferencesText),
          labels: parseReferenceList(draft.labelsText),
          sprint: draft.sprint,
          fix_version: draft.fixVersion,
          release: draft.release,
          priority: draft.priority,
          status: draft.status,
          additional_fields: draft.additionalFields,
          expected_revision: selectedRequirement.revision
        }
      });

      await replaceMappings.mutateAsync({ requirementId: selectedRequirement.id, testCaseIds: selectedTestCaseIds });
      await replaceDefectMappings.mutateAsync({ requirementId: selectedRequirement.id, issueIds: selectedDefectIds });
      showSuccess("Requirement updated.");
      await refresh();
    } catch (error) {
      showError(error, "Unable to update requirement");
    }
  };

  const handleRequirementImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsed = parseRequirementCsv(text);

      setImportRows(parsed.rows);
      setImportWarnings(parsed.warnings);
      setImportFileName(file.name);
      setMessageTone(parsed.rows.length ? "success" : "error");
      setMessage(
        parsed.rows.length
          ? `Prepared ${parsed.rows.length} requirements from ${file.name}.`
          : parsed.warnings[0] || "No requirements could be parsed from the CSV file."
      );
    } catch (error) {
      showError(error, "Unable to read the CSV file");
    } finally {
      event.target.value = "";
    }
  };

  const handleBulkImportRequirements = async () => {
    if (!canImportRequirements) {
      showError(null, "Permission required: requirement.import");
      return;
    }

    if (!projectId || !importRows.length) {
      return;
    }

    try {
      const response = await bulkImportRequirements.mutateAsync({
        project_id: projectId,
        rows: importRows
      });

      setMessageTone("success");
      setMessage(`Requirement import queued. Track progress in TestOps batch process ${response.transaction_id.slice(0, 8)}.`);
      setImportWarnings([]);
      setImportRows([]);
      setImportFileName("");
      setIsImportModalOpen(false);
      await refresh();
    } catch (error) {
      showError(error, "Unable to import requirements");
    }
  };

  const handleExportRequirements = async () => {
    if (!canExportRequirements || !projectId || !selectedExportRequirements.length) {
      showError(null, canExportRequirements ? "Select at least one requirement to export." : "Permission required: requirement.export");
      return;
    }

    try {
      const response = await api.requirements.exportRequirements({
        project_id: projectId,
        requirement_ids: selectedExportRequirements.map((requirement) => requirement.id),
        format: "csv"
      });
      downloadCsvRecords("qaira-requirements.csv", selectedExportRequirements.map((requirement) => ({
        Title: requirement.title,
        Description: requirement.description || "",
        Status: requirement.status || "",
        Priority: requirement.priority || 3,
        Labels: (requirement.labels || []).join("|"),
        "External References": (requirement.external_references || []).join("|"),
        Sprint: requirement.sprint || "",
        "Fix Version": requirement.fix_version || "",
        Release: requirement.release || "",
        "Sprint ID": requirement.sprint_id || "",
        "Linked Test Cases": (requirement.test_case_ids || []).join("|"),
        "Linked Bugs": (requirement.defect_ids || []).join("|")
      })));
      const skippedCount = Array.isArray((response as { skipped?: unknown[] }).skipped) ? (response as { skipped?: unknown[] }).skipped!.length : 0;
      showSuccess(`Exported ${selectedExportRequirements.length} selected requirement${selectedExportRequirements.length === 1 ? "" : "s"}.${skippedCount ? ` Jira skipped ${skippedCount} stale selection${skippedCount === 1 ? "" : "s"}.` : ""} Audit ${response.transaction_id.slice(0, 8)} is available in TestOps.`);
    } catch (error) {
      showError(error, "Unable to export requirements");
    }
  };

  const rephraseRequirementDescriptionWithAi = async (html: string, plainText: string, scope: "create" | "detail") => {
    if (!projectId || !canUseRequirementAi) {
      showError(null, canUseRequirementAi ? "Select a project before using AI rephrase." : "Permission required: requirement.ai");
      return undefined;
    }

    const source = scope === "detail" ? selectedRequirement : null;
    const sourceDraft = scope === "detail" ? draft : createDraft;
    try {
      const response = await rephraseRequirementDescription.mutateAsync({
        project_id: projectId,
        integration_id: integrationId || undefined,
        description: plainText,
        description_html: html,
        requirement: {
          id: source?.id,
          display_id: source?.display_id,
          title: sourceDraft.title || source?.title,
          status: sourceDraft.status || source?.status,
          priority: sourceDraft.priority || source?.priority,
          labels: parseReferenceList(sourceDraft.labelsText),
          sprint: sourceDraft.sprint || source?.sprint,
          fix_version: sourceDraft.fixVersion || source?.fix_version,
          release: sourceDraft.release || source?.release,
          iteration_id: sourceDraft.iterationId || source?.iteration_id,
          external_references: parseReferenceList(sourceDraft.externalReferencesText)
        }
      });
      return response.description;
    } catch (error) {
      showError(error, "Unable to rephrase requirement description with AI");
      return undefined;
    }
  };

	  const handleDeleteRequirement = async () => {
	    if (!canDeleteRequirements) {
	      showError(null, "Permission required: requirement.delete");
	      return;
	    }

	    if (!selectedRequirement || !(await confirmDelete({ message: `Delete requirement "${selectedRequirement.title}"? Linked test cases will remain in the library.` }))) {
	      return;
	    }

    try {
      await deleteRequirement.mutateAsync(selectedRequirement.id);
      syncRequirementSearchParams(null);
      setSelectedRequirementId("");
      setDraft(emptyRequirementDraft);
      setSelectedTestCaseIds([]);
      setSelectedDefectIds([]);
      setPreviewCases([]);
      showSuccess("Requirement deleted.");
      await refresh();
    } catch (error) {
      showError(error, "Unable to delete requirement");
    }
  };

	  function openRequirementAiStudio(requirementId: string) {
	    if (!canUseRequirementAi) {
	      showError(null, "Permission required: requirement.ai");
	      return;
	    }

	    openRequirementWorkspace(requirementId);
	    setAiRequirementId(requirementId);
	    setIsAiStudioOpen(true);
	  }

	  async function handleDeleteRequirementItem(requirement: Requirement) {
	    if (!canDeleteRequirements) {
	      showError(null, "Permission required: requirement.delete");
	      return;
	    }

	    if (!(await confirmDelete({ message: `Delete requirement "${requirement.title}"? Linked test cases will remain in the library.` }))) {
	      return;
	    }

    try {
      await deleteRequirement.mutateAsync(requirement.id);
      setDeleteSelectedRequirementIds((current) => current.filter((id) => id !== requirement.id));

      if (selectedRequirementId === requirement.id) {
        syncRequirementSearchParams(null);
        setSelectedRequirementId("");
        setDraft(emptyRequirementDraft);
        setSelectedTestCaseIds([]);
        setSelectedDefectIds([]);
        setPreviewCases([]);
      }

      if (aiRequirementId === requirement.id) {
        setAiRequirementId("");
      }

      showSuccess("Requirement deleted.");
      await refresh();
    } catch (error) {
      showError(error, "Unable to delete requirement");
    }
  }

	  const handleDeleteSelectedRequirements = async () => {
	    const selectedRequirements = requirements.filter((item) => deleteSelectedRequirementIds.includes(item.id));

	    if (!selectedRequirements.length || !canDeleteRequirements) {
	      return;
	    }

    const confirmed = await confirmDelete({
      message: `Delete ${selectedRequirements.length} requirement${selectedRequirements.length === 1 ? "" : "s"}? Linked test cases will remain in the library.`
    });

    if (!confirmed) {
      return;
    }

    setIsDeletingSelectedRequirements(true);

    try {
      const results = await Promise.allSettled(selectedRequirements.map((requirement) => api.requirements.delete(requirement.id)));
      const deletedIds = selectedRequirements
        .filter((_, index) => results[index]?.status === "fulfilled")
        .map((requirement) => requirement.id);
      const failedResults = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");

      setDeleteSelectedRequirementIds((current) => current.filter((id) => !deletedIds.includes(id)));

      if (deletedIds.includes(selectedRequirementId)) {
        syncRequirementSearchParams(null);
        setSelectedRequirementId("");
      }

      if (deletedIds.includes(aiRequirementId)) {
        setAiRequirementId("");
      }

      if (deletedIds.length) {
        await refresh();
      }

      if (!failedResults.length) {
        showSuccess(`${deletedIds.length} requirement${deletedIds.length === 1 ? "" : "s"} deleted.`);
        return;
      }

      const firstError = failedResults[0]?.reason;
      setMessageTone("error");
      setMessage(
        `${deletedIds.length} requirement${deletedIds.length === 1 ? "" : "s"} deleted, ${failedResults.length} failed.${firstError instanceof Error ? ` ${firstError.message}` : ""}`
      );
    } finally {
      setIsDeletingSelectedRequirements(false);
    }
  };

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
        setPreviewTone("error");
        setPreviewMessage(budgetMessage);
      }
    } catch (error) {
      setPreviewTone("error");
      setPreviewMessage(error instanceof Error ? error.message : "Unable to attach the selected image");
    }
  };

  const handleAddOptimizeReferenceImages = async (files: FileList | null) => {
    try {
      const images = await readImageFiles(files);
      let budgetMessage = "";
      setOptimizeReferenceImages((current) => {
        const result = mergeAiReferenceImagesWithinBudget(current, images);
        budgetMessage = result.message;
        return result.images;
      });
      if (budgetMessage) {
        setPreviewTone("error");
        setPreviewMessage(budgetMessage);
      }
    } catch (error) {
      setPreviewTone("error");
      setPreviewMessage(error instanceof Error ? error.message : "Unable to attach the selected image");
    }
  };

	  const handlePreviewDesignedCases = async () => {
	    if (!canUseRequirementAi) {
	      setPreviewTone("error");
	      setPreviewMessage("Permission required: requirement.ai");
	      return;
	    }

	    if (!aiRequirement || !appTypeId) {
	      return;
	    }

    try {
      const response = await previewDesignedCases.mutateAsync({
        requirementId: aiRequirement.id,
        input: {
          app_type_id: appTypeId,
          integration_id: integrationId || undefined,
          max_cases: maxCases,
          additional_context: aiAdditionalContext || undefined,
          external_links: parseExternalLinks(aiExternalLinksText),
          images: aiReferenceImages
        }
      });

      setPreviewCases(response.cases);
      setPreviewTone("success");
      setPreviewMessage(`${response.generated} draft cases prepared from the selected requirement context. Review their traceability and steps before accepting.`);
    } catch (error) {
      setPreviewTone("error");
      setPreviewMessage(error instanceof Error ? error.message : "Unable to preview AI-generated test cases");
    }
  };

	  const handleAcceptDesignedCases = async (selectedClientIds?: string[]) => {
	    if (!canCreateTestCases) {
	      setPreviewTone("error");
	      setPreviewMessage("Permission required: testcase.create");
	      return;
	    }

	    if (!aiRequirement || !appTypeId || !previewCases.length) {
	      return;
	    }
    const selectedCaseSet = new Set(selectedClientIds?.length ? selectedClientIds : previewCases.map((item) => item.client_id));
    const acceptedPreviewCases = previewCases.filter((item) => selectedCaseSet.has(item.client_id));

    if (!acceptedPreviewCases.length) {
      setPreviewTone("error");
      setPreviewMessage("Select at least one AI-generated case to accept.");
      return;
    }

    try {
      await acceptDesignedCases.mutateAsync({
        requirementId: aiRequirement.id,
        input: {
          app_type_id: appTypeId,
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
        }
      });

      setIsAiStudioOpen(false);
      setPreviewCases([]);
      setPreviewMessage("");
      showSuccess(`${acceptedPreviewCases.length} AI-designed case${acceptedPreviewCases.length === 1 ? "" : "s"} accepted as standard steps and linked to the requirement.`);
      await refresh();
      navigate("/test-cases");
    } catch (error) {
      setPreviewTone("error");
      setPreviewMessage(error instanceof Error ? error.message : "Unable to accept AI-generated test cases");
    }
  };

	  function openRequirementOptimization(requirementIds?: string[]) {
	    if (!canUseRequirementAi || !canUpdateRequirements) {
	      showError(null, `Permission required: ${!canUseRequirementAi ? "requirement.ai" : "requirement.update"}`);
	      return;
	    }

	    const candidateIds = Array.from(
	      new Set((requirementIds?.length ? requirementIds : selectedRequirement ? [selectedRequirement.id] : []).filter(Boolean))
	    );
    const preferredId = selectedRequirement && candidateIds.includes(selectedRequirement.id)
      ? selectedRequirement.id
      : candidateIds[0];
    const targetIds = preferredId ? [preferredId] : [];

    if (!targetIds.length) {
      showError(new Error("Select a requirement first."), "Unable to AI Complete requirement");
      return;
    }

    setRequirementAiMode("improve");
    setOptimizeRequirementIds(targetIds);
    setOptimizationSuggestion(null);
    setRequirementCreationDrafts([]);
    setSelectedRequirementCreationDraftIds([]);
    setExpandedRequirementCreationDraftIds([]);
    setRequirementCreationJobId("");
    setOptimizationFields({
      title: true,
      description: true,
      external_references: true,
      priority: true,
      status: true
    });
    setPreviewMessage("");
    setPreviewTone("success");
    setIsRequirementAiSidebarCollapsed(false);
    setIsOptimizeModalOpen(true);
	  }

  const openAiRequirementCreation = () => {
    if (!canUseRequirementAi || !canCreateRequirements || !projectId) {
      showError(null, `Permission required: ${!canUseRequirementAi ? "requirement.ai" : "requirement.create"}`);
      return;
    }

    setRequirementAiMode("create");
    setOptimizeRequirementIds([]);
    setOptimizeContext("");
    setOptimizeExternalLinksText("");
    setOptimizeReferenceImages([]);
    setOptimizationSuggestion(null);
    setRequirementCreationDrafts([]);
    setSelectedRequirementCreationDraftIds([]);
    setExpandedRequirementCreationDraftIds([]);
    setRequirementCreationJobId("");
    setOptimizationFields({ title: true, description: true, external_references: true, priority: true, status: true });
    setPreviewMessage("");
    setPreviewTone("success");
    setIsRequirementAiSidebarCollapsed(false);
    setIsOptimizeModalOpen(true);
  };

  const closeRequirementAiModal = () => {
    if (previewRequirementOptimization.isPending || previewRequirementCreation.isPending || createRequirementGenerationJob.isPending || createRequirement.isPending || updateRequirement.isPending) {
      return;
    }

    setIsOptimizeModalOpen(false);
    setOptimizeRequirementIds([]);
    setOptimizationSuggestion(null);
    setRequirementCreationDrafts([]);
    setSelectedRequirementCreationDraftIds([]);
    setExpandedRequirementCreationDraftIds([]);
    setRequirementCreationJobId("");
    setPreviewMessage("");
    setIsRequirementAiSidebarCollapsed(false);
  };

	  const handlePreviewRequirementOptimization = async () => {
	    if (!canUseRequirementAi) {
	      setPreviewTone("error");
	      setPreviewMessage("Permission required: requirement.ai");
	      return;
	    }

	    if (requirementAiMode === "improve" && !activeOptimizeRequirement) {
	      return;
    }

    try {
      const selectedIntegration = integrations.find((integration) => integration.id === integrationId);
      const selectedRequirementForAi = requirementAiMode === "improve" ? activeOptimizeRequirement : null;
      const promptInput = {
        integration_id: integrationId || undefined,
        model: selectedIntegration?.model || undefined,
        additional_context: optimizeContext || undefined,
        external_links: parseExternalLinks(optimizeExternalLinksText),
        images: optimizeReferenceImages,
        requirement_id: selectedRequirementForAi?.id || undefined,
        selected_requirement_id: selectedRequirementForAi?.id || undefined,
        single_requirement_only: requirementAiMode === "improve" || undefined,
        requirement_context: selectedRequirementForAi ? {
          id: selectedRequirementForAi.id,
          display_id: selectedRequirementForAi.display_id,
          title: selectedRequirementForAi.title,
          description: selectedRequirementForAi.description || "",
          status: selectedRequirementForAi.status,
          priority: selectedRequirementForAi.priority,
          labels: selectedRequirementForAi.labels || [],
          external_references: selectedRequirementForAi.external_references || [],
          iteration_id: selectedRequirementForAi.iteration_id || null,
          sprint: selectedRequirementForAi.sprint || null,
          release: selectedRequirementForAi.release || selectedRequirementForAi.fix_version || null
        } : undefined
      };
      if (requirementAiMode === "create") {
        setRequirementCreationDrafts([]);
        setSelectedRequirementCreationDraftIds([]);
        setExpandedRequirementCreationDraftIds([]);
        setRequirementCreationJobId("");
        setPreviewTone("success");
        setPreviewMessage("Queuing AI requirement generation…");
        const job = await createRequirementGenerationJob.mutateAsync({
            project_id: projectId,
            ...promptInput,
            priority: 3,
            status: defaultRequirementStatus,
            max_requirements: 4
          });
        setRequirementCreationJobId(job.id || job.job_id || "");
        setPreviewTone("success");
        setPreviewMessage("AI requirement generation queued. Qaira will poll until the drafts are ready.");
        return;
      }

      const response = await previewRequirementOptimization.mutateAsync({
        requirementId: selectedRequirementForAi!.id,
        input: promptInput
      });
      setOptimizationSuggestion(response.suggestion);
      setPreviewTone(response.fallback_used ? "error" : "success");
      setPreviewMessage(
        response.fallback_used
          ? `AI fallback used: ${response.fallback_reason || "LLM unavailable"}`
          : `Requirement optimized using ${response.integration?.name || "AI"}.`
      );
    } catch (error) {
      setPreviewTone("error");
      setPreviewMessage(error instanceof Error ? error.message : requirementAiMode === "create" ? "Unable to generate requirement drafts" : "Unable to optimize requirement");
    }
  };

	  const handleApplyRequirementOptimization = async () => {
	    if (requirementAiMode === "create" ? !canCreateRequirements : !canUpdateRequirements) {
	      setPreviewTone("error");
	      setPreviewMessage(`Permission required: ${requirementAiMode === "create" ? "requirement.create" : "requirement.update"}`);
	      return;
	    }

    if (requirementAiMode === "create") {
      if (!requirementCreationDrafts.length) {
        setPreviewTone("error");
        setPreviewMessage("Generate requirement drafts first, then select the best ones to create.");
        return;
      }

      const selectedDrafts = requirementCreationDrafts.filter((candidate, index) =>
        selectedRequirementCreationDraftIds.includes(getRequirementCreationDraftId(candidate, index))
      );

      if (!selectedDrafts.length) {
        setPreviewTone("error");
        setPreviewMessage("Select at least one generated requirement draft.");
        return;
      }

      if (requirementCreateMetadataQuery.isLoading) {
        setPreviewTone("success");
        setPreviewMessage("Checking this Jira project's Story create fields. Try again in a moment.");
        return;
      }

      if (requirementCreateMetadataQuery.isError) {
        setPreviewTone("error");
        setPreviewMessage("Qaira could not verify this Jira Story create screen. Refresh before creating the selected drafts.");
        return;
      }

      try {
        const createdIds: string[] = [];
        let statusWarningCount = 0;
        for (const candidate of selectedDrafts) {
          const response = await createRequirement.mutateAsync({
            project_id: projectId,
            title: candidate.title,
            description: composeAiRequirementDescription(candidate),
            external_references: candidate.external_references,
            labels: ["ai-drafted"],
            sprint: createDraft.sprint || undefined,
            fix_version: createDraft.fixVersion || undefined,
            release: createDraft.release || undefined,
            priority: candidate.priority,
            status: candidate.status,
            additional_fields: createDraft.additionalFields
          });
          createdIds.push(response.id);
          if (response.status_warning) {
            statusWarningCount += 1;
          }
        }

        const firstCreatedId = createdIds[0];
        if (firstCreatedId) {
          syncRequirementSearchParams(firstCreatedId);
          setSelectedRequirementId(firstCreatedId);
          setAiRequirementId(firstCreatedId);
        }
        setIsOptimizeModalOpen(false);
        setOptimizationSuggestion(null);
        setRequirementCreationDrafts([]);
        setSelectedRequirementCreationDraftIds([]);
        setExpandedRequirementCreationDraftIds([]);
        showSuccess(`${createdIds.length} AI-assisted requirement${createdIds.length === 1 ? "" : "s"} created.${statusWarningCount ? ` Jira kept workflow status on ${statusWarningCount} item${statusWarningCount === 1 ? "" : "s"} because the requested AI draft status was not transitionable.` : ""} Review the saved Jira requirement${createdIds.length === 1 ? "" : "s"} before using downstream.`);
        await refresh();
      } catch (error) {
        showError(error, "Unable to create AI requirements");
      }
      return;
    }

	    if (!activeOptimizeRequirement || !optimizationSuggestion) {
	      return;
	    }

    const acceptanceAppend = [
      optimizationSuggestion.acceptance_criteria.length ? "Acceptance criteria:" : "",
      ...optimizationSuggestion.acceptance_criteria.map((item) => `- ${item}`),
      optimizationSuggestion.risks.length ? "\nRisks:" : "",
      ...optimizationSuggestion.risks.map((item) => `- ${item}`),
      optimizationSuggestion.open_questions.length ? "\nOpen questions:" : "",
      ...optimizationSuggestion.open_questions.map((item) => `- ${item}`)
    ].filter(Boolean).join("\n");

    const baseDraft = activeOptimizeRequirement!.id === selectedRequirement?.id
      ? draft
      : {
          title: activeOptimizeRequirement!.title,
          description: activeOptimizeRequirement!.description || "",
          externalReferencesText: formatReferenceList(activeOptimizeRequirement!.external_references),
          labelsText: formatReferenceList(activeOptimizeRequirement!.labels),
	          sprint: activeOptimizeRequirement!.sprint || "",
	          fixVersion: activeOptimizeRequirement!.fix_version || "",
	          release: activeOptimizeRequirement!.release || "",
	          iterationId: activeOptimizeRequirement!.iteration_id || requirementIterationById.get(activeOptimizeRequirement!.id)?.id || "",
	          priority: activeOptimizeRequirement!.priority ?? 3,
          status: activeOptimizeRequirement!.status || defaultRequirementStatus,
          additionalFields: {}
        };

    const nextDescription = optimizationFields.description
      ? optimizationSuggestion.description
      : [baseDraft.description, acceptanceAppend].filter(Boolean).join("\n\n");

    const nextDraft = {
      title: optimizationFields.title ? optimizationSuggestion.title : baseDraft.title,
      description: nextDescription,
      externalReferencesText: optimizationFields.external_references ? formatReferenceList(optimizationSuggestion.external_references) : baseDraft.externalReferencesText,
      labelsText: baseDraft.labelsText,
	      sprint: baseDraft.sprint,
	      fixVersion: baseDraft.fixVersion,
	      release: baseDraft.release,
	      iterationId: baseDraft.iterationId,
	      priority: optimizationFields.priority ? optimizationSuggestion.priority : baseDraft.priority,
      status: optimizationFields.status ? optimizationSuggestion.status : baseDraft.status,
      additionalFields: {}
    };

    if (requirementAiMode === "improve" && activeOptimizeRequirement!.id === selectedRequirement?.id) {
      setDraft(nextDraft);
    }

    try {
      await updateRequirement.mutateAsync({
        id: activeOptimizeRequirement!.id,
        input: {
          title: nextDraft.title,
          description: nextDraft.description,
          external_references: parseReferenceList(nextDraft.externalReferencesText),
          labels: parseReferenceList(nextDraft.labelsText),
	          sprint: nextDraft.sprint,
	          fix_version: nextDraft.fixVersion,
	          release: nextDraft.release,
	          iteration_id: nextDraft.iterationId,
	          priority: nextDraft.priority,
          status: nextDraft.status
        }
      });
      setOptimizationSuggestion(null);
      setPreviewMessage("");
      setIsOptimizeModalOpen(false);
      setOptimizeRequirementIds([]);
        setDeleteSelectedRequirementIds((current) => current.filter((id) => id !== activeOptimizeRequirement!.id));
      showSuccess(`AI requirement changes applied to "${activeOptimizeRequirement!.title}".`);
      await refresh();
    } catch (error) {
      showError(error, "Unable to apply AI requirement changes");
    }
  };

  const selectedRequirementCreationDrafts = useMemo(
    () => requirementCreationDrafts.filter((candidate, index) =>
      selectedRequirementCreationDraftIds.includes(getRequirementCreationDraftId(candidate, index))
    ),
    [requirementCreationDrafts, selectedRequirementCreationDraftIds]
  );
  const selectedRequirementCreationDraftCount = selectedRequirementCreationDrafts.length;
  const areAllRequirementCreationDraftsSelected = Boolean(requirementCreationDrafts.length)
    && selectedRequirementCreationDraftCount === requirementCreationDrafts.length;

  const metrics = useMemo(() => {
    const mapped = requirements.filter((item) => (item.test_case_ids || []).length).length;
    const highPriority = requirements.filter((item) => (item.priority || 3) <= 2).length;
    const open = requirements.filter((item) => (item.status || "open") !== "done").length;
    const completed = requirements.filter((item) => String(item.status || "").trim().toLowerCase() === "done").length;
    const totalDefects = requirements.reduce((sum, requirement) => sum + (defectsByRequirementId[requirement.id] || []).length, 0);
    const completionPercent = requirements.length ? Math.round((completed / requirements.length) * 100) : 0;
    const coveragePercent = requirements.length ? Math.round((mapped / requirements.length) * 100) : 0;
    const defectDensity = requirements.length ? totalDefects / requirements.length : 0;

    return {
      total: requirements.length,
      mapped,
      highPriority,
      open,
      completed,
      totalDefects,
      completionPercent,
      coveragePercent,
      defectDensity
    };
  }, [defectsByRequirementId, requirements]);
  const selectedRequirementAiReadiness = useMemo(
    () => assessRequirementAiReadiness({
      title: draft.title,
      description: richTextToPlainText(draft.description),
      linkedCaseCount: selectedTestCaseIds.length,
      externalReferenceCount: parseReferenceList(draft.externalReferencesText).length,
      labelCount: parseReferenceList(draft.labelsText).length,
      hasDeliveryContext: Boolean(draft.iterationId || draft.sprint.trim() || draft.fixVersion.trim() || draft.release.trim())
    }),
    [draft.description, draft.externalReferencesText, draft.fixVersion, draft.iterationId, draft.labelsText, draft.release, draft.sprint, draft.title, selectedTestCaseIds.length]
  );
  const requirementImpactFindings = useMemo<AiPreviewFinding[]>(() => {
    const preview = previewRequirementImpact.data;
    if (!preview) return [];

    const severity = preview.impact.risk_level;
    const groups = [
      { id: "test-cases", title: "Linked test cases", items: preview.impact.test_cases, action: "Review test intent, steps, and expected results against the proposed requirement change." },
      { id: "test-suites", title: "Affected suites", items: preview.impact.test_suites, action: "Confirm suite scope and ordering still represent the intended regression path." },
      { id: "test-runs", title: "Affected runs", items: preview.impact.test_runs, action: "Review queued or active run scope and decide whether a refresh or rerun is needed." },
      ...(canUseAutomationWorkspace
        ? [{ id: "automation-assets", title: "Automation assets", items: preview.impact.automation_assets, action: "Review automation mappings before the next automated run." }]
        : [])
    ];
    const findings = groups
      .filter((group) => group.items.length)
      .map((group) => ({
        id: group.id,
        title: `${group.items.length} ${group.title.toLowerCase()}`,
        severity,
        description: group.items.slice(0, 5).map((item) => item.title || item.name || item.display_id || item.id).join(" · "),
        action: group.action,
        evidence: group.items.map((item) => item.display_id || item.id).filter(Boolean)
      }));

    if (!preview.impact.test_cases.length) {
      findings.unshift({
        id: "coverage-gap",
        title: "Coverage gap",
        severity: "high",
        description: "No linked test case was found in the current Jira traceability graph.",
        action: "Create or link reviewed test coverage before treating the requirement change as release-ready.",
        evidence: [preview.requirement.display_id]
      });
    }
    return findings;
  }, [canUseAutomationWorkspace, previewRequirementImpact.data]);

  const openRequirementImpactPreview = () => {
    if (!selectedRequirement || !projectId || !canUseRequirementAi) return;
    setIsRequirementImpactPreviewOpen(true);
    previewRequirementImpact.reset();
    previewRequirementImpact.mutate({
      requirementId: selectedRequirement.id,
      input: {
        project_id: projectId,
        proposed_change: {
          title: draft.title,
          description: richTextToPlainText(draft.description),
          external_references: parseReferenceList(draft.externalReferencesText),
          labels: parseReferenceList(draft.labelsText),
          sprint: draft.sprint,
          fix_version: draft.fixVersion,
          release: draft.release,
          iteration_id: draft.iterationId,
          priority: draft.priority,
          status: draft.status,
          test_case_ids: selectedTestCaseIds
        }
      }
    });
  };
  const isRequirementWorkspaceOpen = Boolean(selectedRequirement);

  return (
    <div className="page-content page-content--library-full">
      {confirmationDialog}
      {!isRequirementWorkspaceOpen ? (
        <>
          <PageHeader
            eyebrow="Test authoring"
            title="Requirements"
            description="Organize reusable requirement scope, keep coverage visible, and hand selected requirements into AI-assisted case design."
            meta={[
              { label: "Requirements", value: metrics.total },
              { label: "Mapped", value: metrics.mapped },
              { label: "High priority", value: metrics.highPriority }
            ]}
          />
          <section className="requirements-health-strip" aria-label="Requirement health metrics">
            <article className="requirements-health-card tone-progress">
              <div>
                <span>Completion Status</span>
                <strong>{metrics.completionPercent}%</strong>
              </div>
              <p>{metrics.completed} of {metrics.total} requirement{metrics.total === 1 ? "" : "s"} marked Done.</p>
              <div className="requirements-health-meter" aria-hidden="true">
                <span style={{ width: `${metrics.completionPercent}%` }} />
              </div>
            </article>
            <article className="requirements-health-card tone-coverage">
              <div>
                <span>Test Coverage</span>
                <strong>{metrics.coveragePercent}%</strong>
              </div>
              <p>{metrics.mapped} requirement{metrics.mapped === 1 ? "" : "s"} linked to at least one test case.</p>
              <div className="requirements-health-meter" aria-hidden="true">
                <span style={{ width: `${metrics.coveragePercent}%` }} />
              </div>
            </article>
            <article className="requirements-health-card tone-defects">
              <div>
                <span>Bug Density</span>
                <strong>{metrics.defectDensity.toFixed(1)}</strong>
              </div>
              <p>{metrics.totalDefects} linked bug{metrics.totalDefects === 1 ? "" : "s"} across {metrics.total || 0} requirement{metrics.total === 1 ? "" : "s"}.</p>
              <div className="requirements-health-meter is-density" aria-hidden="true">
                <span style={{ width: `${Math.min(100, Math.round(metrics.defectDensity * 25))}%` }} />
              </div>
            </article>
          </section>
        </>
      ) : null}

      <ToastMessage message={message} onDismiss={() => setMessage("")} tone={messageTone} />

      <WorkspaceMasterDetail
        browseView={(
          <Panel title="Requirements" titleVariant="eyebrow" subtitle="Start in the visual catalog, scan coverage quickly, then open one requirement into a focused editor view.">
            <div className="design-list-toolbar requirement-catalog-toolbar">
              <CatalogViewToggle onChange={setCatalogViewMode} value={catalogViewMode} />
              <CatalogSearchFilter
                activeFilterCount={activeRequirementFilterCount}
                ariaLabel="Search requirements"
                onChange={setRequirementSearchTerm}
                placeholder="Search title, description, status, or priority"
                subtitle="Filter the requirement tiles by the same facts shown on each card."
                title="Filter requirements"
                value={requirementSearchTerm}
              >
                <div className="catalog-filter-grid">
                  <label className="catalog-filter-field">
                    <span>Status</span>
                    <select value={requirementStatusFilter} onChange={(event) => setRequirementStatusFilter(event.target.value)}>
                      <option value="all">All statuses</option>
                      {requirementStatusOptions.map((status) => (
                        <option key={status} value={status}>
                          {formatTileCardLabel(status, "Open")}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="catalog-filter-field">
                    <span>Priority</span>
                    <select value={requirementPriorityFilter} onChange={(event) => setRequirementPriorityFilter(event.target.value)}>
                      <option value="all">All priorities</option>
                      {requirementPriorityOptions.map((priority) => (
                        <option key={priority} value={priority}>
                          {`P${priority}`}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="catalog-filter-field">
                    <span>Labels</span>
                    <select value={requirementLabelFilter} onChange={(event) => setRequirementLabelFilter(event.target.value)}>
                      <option value="all">All labels</option>
                      {requirementLabelOptions.map((label) => (
                        <option key={label} value={label}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="catalog-filter-field">
                    <span>Sprint</span>
                    <select value={requirementSprintFilter} onChange={(event) => setRequirementSprintFilter(event.target.value)}>
                      <option value="all">All sprints</option>
                      {requirementSprintOptions.map((sprint) => (
                        <option key={sprint} value={sprint}>
                          {sprint}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="catalog-filter-field">
                    <span>Fix Version</span>
                    <select value={requirementFixVersionFilter} onChange={(event) => setRequirementFixVersionFilter(event.target.value)}>
                      <option value="all">All fix versions</option>
                      {requirementFixVersionOptions.map((fixVersion) => (
                        <option key={fixVersion} value={fixVersion}>
                          {fixVersion}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="catalog-filter-field">
                    <span>Release</span>
                    <select value={requirementReleaseFilter} onChange={(event) => setRequirementReleaseFilter(event.target.value)}>
                      <option value="all">All releases</option>
                      {requirementReleaseOptions.map((release) => (
                        <option key={release} value={release}>
                          {release}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="catalog-filter-field">
                    <span>Linked cases</span>
                    <select
                      value={requirementCoverageFilter}
                      onChange={(event) => setRequirementCoverageFilter(event.target.value as RequirementCoverageFilter)}
                    >
                      <option value="all">All requirements</option>
                      <option value="linked">With linked cases</option>
                      <option value="unlinked">Without linked cases</option>
                    </select>
                  </label>

                  <div className="catalog-filter-actions">
                    <button
                      className="ghost-button"
                      disabled={!activeRequirementFilterCount}
                      onClick={() => {
                        setRequirementStatusFilter("all");
                        setRequirementPriorityFilter("all");
                        setRequirementLabelFilter("all");
                        setRequirementSprintFilter("all");
                        setRequirementFixVersionFilter("all");
                        setRequirementReleaseFilter("all");
                        setRequirementCoverageFilter("all");
                      }}
                      type="button"
                    >
                      Clear filters
                    </button>
                  </div>
                </div>
              </CatalogSearchFilter>
              {(filteredRequirements.length || requirementIterationGroups.groups.length) && !areAllFilteredRequirementsSelected ? (
                <button
                  className="ghost-button catalog-selection-button"
                  onClick={() => setAllFilteredRequirementItemsSelected(true)}
                  type="button"
                >
                  <SelectAllIcon />
                  <span>Select all</span>
                </button>
              ) : null}
              {deleteSelectedRequirementIds.length || selectedIterationIds.length ? (
                <button
                  className="ghost-button catalog-selection-button"
                  onClick={() => {
                    setDeleteSelectedRequirementIds([]);
                    setSelectedIterationIds([]);
                  }}
                  type="button"
                >
                  <ClearSelectionIcon />
                  <span>Clear</span>
                </button>
              ) : null}
              <button
                className="ghost-button catalog-selection-button"
                disabled={!canCreateRequirementIterations || !projectId}
                onClick={() => {
                  const nextDates = defaultSprintDates();
                  setEditingIteration(null);
                  setIterationRequirementSearch("");
                  setIterationDraftName("");
                  setIterationDraftDescription("");
                  setIterationDraftBoardId(jiraBoards[0]?.id || jiraSprints[0]?.board_id || "");
                  setIterationDraftStartDate(nextDates.start);
                  setIterationDraftEndDate(nextDates.end);
                  setIterationDraftStatus("future");
                  setSprintDraftRequirementIds(deleteSelectedRequirementIds);
                  setIsCreateIterationModalOpen(true);
                }}
                type="button"
              >
                <IterationIcon />
                <span>Create sprint</span>
              </button>
              <RequirementSplitActionButton
                disabled={!canCreateRequirements || !projectId}
                icon={<FileAddIcon />}
                iconOnly={true}
                label="Create Requirement"
                menuLabel="Open create requirement options"
                onClick={openCreateRequirementModal}
                actions={[
                  {
                    label: "Bulk Import Requirements",
                    description: "Upload CSV requirements into the selected project.",
                    icon: <ImportIcon />,
                    disabled: !canImportRequirements || !projectId,
                    onClick: openRequirementImportModal
                  },
                  {
                    label: "Create Requirements using AI",
                    description: "Create a reviewable requirement draft from prompt templates, smart context, files, links, and reference photos.",
                    icon: <SparkIcon />,
                    disabled: !canUseRequirementAi || !canCreateRequirements || !projectId,
                    onClick: openAiRequirementCreation
                  }
                ]}
              />
              {deleteSelectedRequirementIds.length ? <RequirementSplitActionButton
                disabled={!canUseRequirementAi || !canUpdateRequirements || !deleteSelectedRequirementIds.length}
                icon={<SparkIcon />}
                label="AI Complete requirement"
                menuLabel="Open selected requirement AI options"
                onClick={() => openRequirementOptimization(deleteSelectedRequirementIds)}
                actions={[
                  {
                    label: "AI Complete requirement",
                    description: "Complete one selected requirement with focused AI context.",
                    icon: <SparkIcon />,
                    disabled: !canUseRequirementAi || !canUpdateRequirements || !deleteSelectedRequirementIds.length,
                    onClick: () => openRequirementOptimization(deleteSelectedRequirementIds)
                  },
                  {
                    label: "AI test case generation",
                    description: "Generate test cases from the first selected requirement.",
                    icon: <SparkIcon />,
                    disabled: !canUseRequirementAi || !canCreateTestCases || !deleteSelectedRequirementIds.length || !appTypeId,
                    onClick: () => {
                      setAiRequirementId(deleteSelectedRequirementIds[0] || selectedRequirement?.id || "");
                      setPreviewCases([]);
                      setPreviewMessage("");
                      setPreviewTone("success");
                      setIsAiStudioOpen(true);
                    }
                  }
                ]}
              /> : null}
              {deleteSelectedRequirementIds.length || selectedIterationIds.length ? (
                <button
                  className="ghost-button danger catalog-selection-button"
                  disabled={
                    isDeletingSelectedRequirements
                      || (deleteSelectedRequirementIds.length > 0 && !canDeleteRequirements)
                      || (selectedIterationIds.length > 0 && !canDeleteRequirementIterations)
                  }
                  onClick={() => void handleDeleteSelectedRequirementItems()}
                  type="button"
                >
                  <TrashIcon />
                  <span>
                    {isDeletingSelectedRequirements
                      ? "Deleting"
                      : `Delete (${deleteSelectedRequirementIds.length + selectedIterationIds.length})`}
                  </span>
                </button>
              ) : null}
              {selectedExportRequirements.length ? (
                <button
                  className="ghost-button catalog-selection-button requirement-export-button"
                  disabled={!canExportRequirements || !projectId}
                  onClick={() => void handleExportRequirements()}
                  type="button"
                >
                  <ExportIcon />
                  <span>Export requirement</span>
                </button>
              ) : null}
            </div>

            <TileBrowserPane className="requirement-card-list">
              {isRequirementCatalogLoading ? <TileCardSkeletonGrid /> : null}

              {!isRequirementCatalogLoading && (filteredRequirements.length || requirementIterationGroups.groups.length) && catalogViewMode === "tile" ? (
                <div className="tile-browser-grid">
	                  {iterationTileEntries.map((entry) => {
                    if (entry.kind === "iteration") {
                      const isCollapsed = collapsedIterationIds.includes(entry.iteration.id);
                      const iterationChildIds = getVisibleIterationRequirementIds(entry.iteration.id);
                      const sprintPageState = sprintPageStateById[entry.iteration.id];
                      const isSelected = iterationChildIds.length > 0
                        && iterationChildIds.every((id) => deleteSelectedRequirementIds.includes(id))
                        && (entry.iteration.source === "jira" || selectedIterationIds.includes(entry.iteration.id));
                      const canAcceptDrop = String(entry.iteration.state || entry.iteration.status || "").toLowerCase() !== "closed";

                      return (
                        <div
                          className={draggingRequirementIds.length && canAcceptDrop ? "test-case-module-header requirement-iteration-header is-drop-ready" : "test-case-module-header requirement-iteration-header"}
                          key={`iteration-${entry.iteration.id}`}
                          onDragOver={(event) => {
                            if (draggingRequirementIds.length && canAcceptDrop) {
                              event.preventDefault();
                            }
                          }}
                          onDrop={() => canAcceptDrop && void handleDropRequirementOnIteration(entry.iteration.id)}
                        >
                          <label className="checkbox-field" onClick={(event) => event.stopPropagation()}>
                            <input
                              checked={isSelected}
                              onChange={(event) => setIterationAndChildrenSelected(entry.iteration, event.target.checked)}
                              type="checkbox"
                            />
                          </label>
                          <button
                            aria-label={isCollapsed ? "Expand sprint" : "Collapse sprint"}
                            className={isCollapsed ? "ghost-button compact module-toggle-button" : "ghost-button compact module-toggle-button is-expanded"}
                            onClick={() =>
                              setCollapsedIterationIds((current) =>
                                current.includes(entry.iteration.id)
                                  ? current.filter((id) => id !== entry.iteration.id)
                                  : [...current, entry.iteration.id]
                              )
                            }
                            type="button"
                          >
                            <HierarchyToggleIcon isExpanded={!isCollapsed} />
                          </button>
                          {renderSprintIdentity(entry.iteration)}
                          <button
                            aria-label={`Edit ${entry.iteration.name}`}
                            className="ghost-button compact sprint-edit-button"
                            disabled={!canUpdateRequirementIterations || String(entry.iteration.state || entry.iteration.status || "").toLowerCase() === "closed"}
                            onClick={() => openEditIteration(entry.iteration)}
                            title="Edit sprint in Jira"
                            type="button"
                          >
                            <PencilIcon />
                          </button>
                          {isCollapsed
                            ? renderDeferredSprintMetrics(entry.iteration.requirement_count ?? entry.count)
                            : renderIterationMetrics(iterationHealth.byId.get(entry.iteration.id)!)}
                          {!isCollapsed && (sprintPageState?.isFetching || sprintPageState?.nextCursor) ? (
                            <HierarchyLoadMoreButton
                              batchSize={25}
                              isLoading={Boolean(sprintPageState?.isFetching)}
                              loaded={sprintPageState?.loaded}
                              onLoad={() => loadNextSprintPage(entry.iteration.id)}
                              scopeLabel={`stories in ${entry.iteration.name}`}
                              total={sprintPageState?.total}
                            />
                          ) : null}
                        </div>
                      );
                    }

                    if (entry.kind === "unassigned") {
                      const unassignedIds = requirementIterationGroups.unassignedRequirements.map((requirement) => requirement.id);
                      const allUnassignedSelected = unassignedIds.length > 0 && unassignedIds.every((id) => deleteSelectedRequirementIds.includes(id));
                      return (
                        <div className="test-case-module-header is-unassigned requirement-iteration-header" key="iteration-unassigned">
                          <label className="checkbox-field" onClick={(event) => event.stopPropagation()}>
                            <input
                              checked={allUnassignedSelected}
                              onChange={(event) => setUnassignedRequirementsSelected(event.target.checked)}
                              type="checkbox"
                            />
                          </label>
                          <div className="requirement-sprint-identity">
                            <span className="module-folder-icon"><IterationIcon /></span>
                            <div className="requirement-sprint-copy">
                              <div className="requirement-sprint-heading"><strong>Backlog / No sprint</strong></div>
                              <div className="requirement-sprint-meta"><span>Stories without a Jira Sprint</span></div>
                            </div>
                          </div>
                          {renderIterationMetrics(iterationHealth.unassigned)}
                          {requirementsQuery.hasNextPage ? (
                            <HierarchyLoadMoreButton
                              batchSize={15}
                              isLoading={requirementsQuery.isFetchingNextPage}
                              onLoad={() => requirementsQuery.fetchNextPage()}
                              scopeLabel="backlog stories"
                            />
                          ) : null}
                        </div>
                      );
                    }

                    const item = entry.requirement;
                    const isSelectedForDelete = deleteSelectedRequirementIds.includes(item.id);
                    const isActive = selectedRequirement?.id === item.id;
                    const linkedCaseCount = (linkedCaseIdsByRequirementId[item.id] || []).length;
                    const passCoverage = passCoverageByRequirementId[item.id] || { total: 0, covered: 0, percent: 0 };
                    const automationCoverage = automationCoverageByRequirementId[item.id] || { total: 0, covered: 0, percent: 0 };
                    const readinessScore = canUseAutomationWorkspace
                      ? Math.round((passCoverage.percent * 0.55) + (automationCoverage.percent * 0.45))
                      : Math.round(passCoverage.percent);
                    const isCoverageRisk = !linkedCaseCount || (item.priority ?? 3) <= 2 && readinessScore < 70;
                    const passCoverageTitle = passCoverage.total
                      ? `${passCoverage.covered}/${passCoverage.total} linked test cases passed`
                      : "No linked test cases to measure pass coverage";
                    const automationCoverageTitle = automationCoverage.total
                      ? `${automationCoverage.covered}/${automationCoverage.total} linked test cases automated`
                      : "No linked test cases to measure automation coverage";
                    const tileActions = [
	                      {
	                        label: "Open requirement",
	                        description: "Open this requirement in the detail workspace.",
	                        icon: <OpenIcon />,
	                        requiredPermissions: ["requirement.view"],
	                        onClick: () => openRequirementWorkspace(item.id)
	                      },
		                      {
		                        label: "AI test case generation",
		                        description: "Generate or review AI-designed test cases for this requirement.",
		                        icon: <SparkIcon />,
		                        featureKeys: ["qaira.ai.requirement_design"],
		                        permissionMode: "all" as const,
		                        requiredPermissions: ["requirement.ai", "testcase.create"],
		                        onClick: () => openRequirementAiStudio(item.id)
		                      },
		                      {
		                        label: "AI Complete requirement",
		                        description: "Use AI to improve missing or weak requirement details.",
		                        icon: <SparkIcon />,
		                        featureKeys: ["qaira.ai.requirement_design"],
	                        permissionMode: "all" as const,
	                        requiredPermissions: ["requirement.ai", "requirement.update"],
	                        onClick: () => openRequirementOptimization([item.id])
	                      },
	                      {
	                        label: "Delete requirement",
	                        description: "Delete this requirement while keeping linked test cases in the library.",
	                        icon: <TrashIcon />,
	                        onClick: () => void handleDeleteRequirementItem(item),
	                        disabled: deleteRequirement.isPending,
	                        requiredPermissions: ["requirement.delete"],
	                        tone: "danger" as const
	                      }
                    ];

                    return (
                      <article
                        draggable
                        key={item.id}
                        className={[
                          "record-card tile-card requirement-catalog-card",
                          isCoverageRisk ? "is-risk" : linkedCaseCount ? "is-healthy" : "is-warning",
                          isActive ? "is-active" : "",
                          isSelectedForDelete ? "is-marked-for-delete" : ""
                        ].filter(Boolean).join(" ")}
                        onDragEnd={() => setDraggingRequirementIds([])}
                        onDragStart={(event) => {
                          const ids = startDraggingRequirements(item.id);
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", ids.join(","));
                        }}
                        onClick={() => openRequirementWorkspace(item.id)}
                        onKeyDown={(event) => {
                          if (event.target !== event.currentTarget) {
                            return;
                          }

                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openRequirementWorkspace(item.id);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="tile-card-main">
                          <div className="tile-card-select-row requirement-tile-top-row">
                            <label className="checkbox-field requirement-delete-checkbox" onClick={(event) => event.stopPropagation()}>
		                              <input
		                                checked={isSelectedForDelete}
	                                onChange={(event) =>
	                                  setDeleteSelectedRequirementIds((current) =>
	                                    event.target.checked ? [...new Set([...current, item.id])] : current.filter((id) => id !== item.id)
	                                  )
	                                }
		                                type="checkbox"
		                              />
		                            </label>
                            <DisplayIdBadge value={item.display_id || item.id} href={getJiraBrowseUrl(item.display_id || item.id, item.jira_url)} />
		                            <div className="catalog-inline-actions requirement-top-actions" onClick={(event) => event.stopPropagation()}>
		                              <StatusBadge value={formatTileCardLabel(item.status || defaultRequirementStatus, "Open")} />
		                              <CatalogActionMenu actions={tileActions} label={`${item.title} actions`} />
		                            </div>
	                          </div>
		                          <div className="tile-card-header requirement-tile-header">
		                            <div className="tile-card-title-group">
		                              <strong>{item.title}</strong>
		                            </div>
	                          </div>
                          <RichTextContent className="tile-card-description" value={item.description} fallback="No requirement description captured yet." />
                          <div className="requirement-progress-stack">
                            <RequirementProgressBar detail={passCoverageTitle} label="Pass rate" metric={passCoverage} />
                            {canUseAutomationWorkspace ? <RequirementProgressBar detail={automationCoverageTitle} label="Automation coverage" metric={automationCoverage} /> : null}
                          </div>
                          <div className="tile-card-facts" aria-label={`${item.title} facts`}>
                            <TileCardFact
                              label={`P${item.priority ?? 3}`}
                              title={`Priority P${item.priority ?? 3}`}
                              tone={(item.priority ?? 3) <= 2 ? "danger" : "info"}
                            >
                              <TileCardPriorityIcon />
                            </TileCardFact>
                            <TileCardFact
                              label={String(linkedCaseCount)}
                              title={`${linkedCaseCount} linked test case${linkedCaseCount === 1 ? "" : "s"}`}
                              tone={linkedCaseCount ? "success" : "neutral"}
                            >
                              <TileCardLinkIcon />
                            </TileCardFact>
                            <TileCardFact
                              label={`${readinessScore}%`}
                              title={canUseAutomationWorkspace
                                ? "Release readiness contribution from linked case pass rate and automation coverage"
                                : "Release readiness contribution from linked case pass rate"}
                              tone={readinessScore >= 80 ? "success" : readinessScore >= 50 ? "info" : "danger"}
                            >
                              <SparkIcon />
                            </TileCardFact>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : null}
              {!isRequirementCatalogLoading && (filteredRequirements.length || requirementIterationGroups.groups.length) && catalogViewMode === "list" ? (
                <>
                  {requirementIterationGroups.groups.map(({ iteration, requirements: groupRequirements }) => {
                    const isCollapsed = collapsedIterationIds.includes(iteration.id);
                    const iterationChildIds = groupRequirements.map((requirement) => requirement.id);
                    const sprintPageState = sprintPageStateById[iteration.id];
                    const isSelected = iterationChildIds.length > 0
                      && iterationChildIds.every((id) => deleteSelectedRequirementIds.includes(id))
                      && (iteration.source === "jira" || selectedIterationIds.includes(iteration.id));
                    const canAcceptDrop = String(iteration.state || iteration.status || "").toLowerCase() !== "closed";
                    return (
                      <Fragment key={iteration.id}>
                        <div
                          className={draggingRequirementIds.length && canAcceptDrop ? "test-case-module-header requirement-iteration-header requirement-iteration-list-header is-drop-ready" : "test-case-module-header requirement-iteration-header requirement-iteration-list-header"}
                          onDragOver={(event) => {
                            if (draggingRequirementIds.length && canAcceptDrop) {
                              event.preventDefault();
                            }
                          }}
                          onDrop={() => canAcceptDrop && void handleDropRequirementOnIteration(iteration.id)}
                        >
                          <label className="checkbox-field" onClick={(event) => event.stopPropagation()}>
                            <input
                              checked={isSelected}
                              onChange={(event) => setIterationAndChildrenSelected(iteration, event.target.checked)}
                              type="checkbox"
                            />
                          </label>
                          <button
                            aria-label={isCollapsed ? "Expand sprint" : "Collapse sprint"}
                            className={isCollapsed ? "ghost-button compact module-toggle-button" : "ghost-button compact module-toggle-button is-expanded"}
                            onClick={() =>
                              setCollapsedIterationIds((current) =>
                                current.includes(iteration.id)
                                  ? current.filter((id) => id !== iteration.id)
                                  : [...current, iteration.id]
                              )
                            }
                            type="button"
                          >
                            <HierarchyToggleIcon isExpanded={!isCollapsed} />
                          </button>
                          {renderSprintIdentity(iteration)}
                          <button
                            aria-label={`Edit ${iteration.name}`}
                            className="ghost-button compact sprint-edit-button"
                            disabled={!canUpdateRequirementIterations || String(iteration.state || iteration.status || "").toLowerCase() === "closed"}
                            onClick={() => openEditIteration(iteration)}
                            title="Edit sprint in Jira"
                            type="button"
                          >
                            <PencilIcon />
                          </button>
                          {isCollapsed
                            ? renderDeferredSprintMetrics(iteration.requirement_count ?? groupRequirements.length)
                            : renderIterationMetrics(iterationHealth.byId.get(iteration.id)!)}
                          {!isCollapsed && (sprintPageState?.isFetching || sprintPageState?.nextCursor) ? (
                            <HierarchyLoadMoreButton
                              batchSize={25}
                              isLoading={Boolean(sprintPageState?.isFetching)}
                              loaded={sprintPageState?.loaded}
                              onLoad={() => loadNextSprintPage(iteration.id)}
                              scopeLabel={`stories in ${iteration.name}`}
                              total={sprintPageState?.total}
                            />
                          ) : null}
                        </div>
                        {!isCollapsed ? (
                          <DataTable
                            columns={getScopedRequirementListColumns(iterationChildIds, `Select all stories in ${iteration.name}`)}
                            enableColumnResize
                            emptyMessage="No stories match this sprint."
                            getRowDraggable={() => true}
                            getRowClassName={(item) => (selectedRequirement?.id === item.id ? "is-active-row" : "")}
                            getRowKey={(item) => item.id}
                            onRowDragEnd={() => setDraggingRequirementIds([])}
                            onRowDragStart={(item) => startDraggingRequirements(item.id)}
                            onRowClick={(item) => openRequirementWorkspace(item.id)}
                            rows={groupRequirements}
                            storageKey={`qaira:requirements:list-columns:${iteration.id}`}
                          />
                        ) : null}
                      </Fragment>
                    );
                  })}
                  {requirementIterationGroups.unassignedRequirements.length || requirementsQuery.hasNextPage ? (
                    <>
                      <div className="test-case-module-header is-unassigned requirement-iteration-header requirement-iteration-list-header">
                        <label className="checkbox-field" onClick={(event) => event.stopPropagation()}>
                          <input
                            checked={requirementIterationGroups.unassignedRequirements.every((requirement) => deleteSelectedRequirementIds.includes(requirement.id))}
                            onChange={(event) => setUnassignedRequirementsSelected(event.target.checked)}
                            type="checkbox"
                          />
                        </label>
                        <div className="requirement-sprint-identity">
                          <span className="module-folder-icon"><IterationIcon /></span>
                          <div className="requirement-sprint-copy">
                            <div className="requirement-sprint-heading"><strong>Backlog / No sprint</strong></div>
                            <div className="requirement-sprint-meta"><span>Stories without a Jira Sprint</span></div>
                          </div>
                        </div>
                        {renderIterationMetrics(iterationHealth.unassigned)}
                        {requirementsQuery.hasNextPage ? (
                          <HierarchyLoadMoreButton
                            batchSize={15}
                            isLoading={requirementsQuery.isFetchingNextPage}
                            onLoad={() => requirementsQuery.fetchNextPage()}
                            scopeLabel="backlog stories"
                          />
                        ) : null}
                      </div>
                      <DataTable
                        columns={getScopedRequirementListColumns(requirementIterationGroups.unassignedRequirements.map((requirement) => requirement.id), "Select all backlog stories")}
                        enableColumnResize
                        emptyMessage="No backlog stories match the current search."
                        getRowDraggable={() => true}
                        getRowClassName={(item) => (selectedRequirement?.id === item.id ? "is-active-row" : "")}
                        getRowKey={(item) => item.id}
                        onRowDragEnd={() => setDraggingRequirementIds([])}
                        onRowDragStart={(item) => startDraggingRequirements(item.id)}
                        onRowClick={(item) => openRequirementWorkspace(item.id)}
                        rows={requirementIterationGroups.unassignedRequirements}
                        storageKey="qaira:requirements:list-columns:unassigned"
                      />
                    </>
                  ) : null}
                </>
              ) : null}
              {!isRequirementCatalogLoading && !requirements.length && !requirementIterationGroups.groups.length ? (
                <div className="empty-state compact">
                  <div>No requirements yet for this project.</div>
	                  <button className="primary-button" disabled={!canCreateRequirements || !projectId} onClick={openCreateRequirementModal} type="button">Create first requirement</button>
                </div>
              ) : null}
              {!isRequirementCatalogLoading && requirements.length && !filteredRequirements.length ? <div className="empty-state compact">No requirements match the current search.</div> : null}
            </TileBrowserPane>
          </Panel>
        )}
        detailView={(
          <Panel
            actions={(
              <div className="panel-head-actions-row">
                <WorkspaceBackButton label="Back to requirement tiles" onClick={closeRequirementDetail} />
                {selectedRequirement ? (
                  <>
		                  <button className="primary-button" disabled={!canCreateTestCases || !appTypeId} onClick={() => openNewTestCase(selectedRequirement)} type="button">
                      <AddIcon />
                      <span>New Test Case</span>
                    </button>
                    <button
                      className="ghost-button"
                      disabled={!canUseRequirementAi || !canUpdateRequirements || previewRequirementOptimization.isPending}
                      onClick={() => openRequirementOptimization([selectedRequirement.id])}
                      type="button"
                    >
                      <SparkIcon />
                      <span>AI Complete requirement</span>
                    </button>
                    <button className="ghost-button danger" disabled={!canDeleteRequirements || deleteRequirement.isPending} onClick={() => void handleDeleteRequirement()} type="button">
                      <TrashIcon />
                      <span>Delete Requirement</span>
                    </button>
                  </>
                ) : null}
              </div>
            )}
            title={selectedRequirement ? selectedRequirement.title : "Requirement details"}
            subtitle={selectedRequirement ? "Edit the requirement, manage reusable coverage links, and keep the selected item in focus." : "Select a requirement to review its details."}
	          >
            {selectedRequirement ? (
              <div className="detail-stack">
                <DetailSectionTabs
                  activeTab={activeTraceabilityTab}
                  ariaLabel="Requirement detail sections"
                  items={[
                    { value: "details", label: "Details", icon: <PencilIcon /> },
                    { value: "related", label: "Related items", icon: <OpenIcon />, count: selectedRequirement.related_items?.length || 0 },
                    { value: "comments", label: "Comments", icon: <CommentTabIcon /> },
                    { value: "grounding", label: "AI Assurance", icon: <SparkIcon /> },
                    { value: "cases", label: "Linked test cases", icon: <LayersIcon />, count: selectedTestCaseIds.length },
                    { value: "defects", label: "Linked bugs", icon: <BugIcon />, count: selectedDefectIds.length },
                    { value: "history", label: "Historical runs", icon: <ActivityIcon /> },
                    { value: "evidence", label: "Attachments", icon: <AttachmentTabIcon /> }
                  ]}
                  onChange={setActiveTraceabilityTab}
                />
                {activeTraceabilityTab === "details" ? (
                  <div className="detail-section-panel">
                <div className="metric-strip compact requirement-metric-strip">
                  <div className="mini-card">
                    <strong>{`${selectedRequirementPassCoverage.percent}%`}</strong>
                    <span>
                      {selectedRequirementPassCoverage.total
                        ? `Pass ${selectedRequirementPassCoverage.covered}/${selectedRequirementPassCoverage.total}`
                        : "Pass rate"}
                    </span>
                  </div>
                  <div className="mini-card">
                    <strong>{`${selectedRequirementAutomationCoverage.percent}%`}</strong>
                    <span>
                      {selectedRequirementAutomationCoverage.total
                        ? `Auto ${selectedRequirementAutomationCoverage.covered}/${selectedRequirementAutomationCoverage.total}`
                        : "Automation"}
                    </span>
                  </div>
                  <div className="mini-card">
                    <strong>{`${selectedRequirementBugResolution.percent}%`}</strong>
                    <span>
                      {selectedRequirementBugResolution.total
                        ? `Bugs ${selectedRequirementBugResolution.covered}/${selectedRequirementBugResolution.total}`
                        : "Bug resolution"}
                    </span>
                  </div>
                </div>
                <div className="requirement-accordion">
                  <RequirementAccordionSection
                    countLabel={`${selectedTestCaseIds.length} linked`}
                    isExpanded={expandedSections.details}
                    onToggle={() => setExpandedSections((current) => ({ ...current, details: !current.details }))}
                    title="Requirement details"
                  >
                    <div className="requirement-detail-id-row">
                      <span>Requirement ID</span>
                      <DisplayIdBadge value={selectedRequirement.display_id || selectedRequirement.id} href={getJiraBrowseUrl(selectedRequirement.display_id || selectedRequirement.id, selectedRequirement.jira_url)} />
                    </div>
                    <form className="form-grid requirement-details-form" onSubmit={(event) => void handleSaveRequirement(event)}>
                      <div className="record-grid requirement-detail-metadata-grid requirement-detail-metadata-grid--compact">
                        <FormField label="Title" required>
                          <input required value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} />
                        </FormField>
                        <RequirementLabelsField
                          options={requirementLabelOptions}
                          required={jiraRequirementEditCoreRequired.labels}
                          value={draft.labelsText}
                          onChange={(labelsText) => setDraft((current) => ({ ...current, labelsText }))}
                        />
                        <FormField className="form-field--compact-enum" label="Status">
                          <select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))}>
                            {editRequirementStatusOptions.map((status) => (
                              <option key={status.value} value={status.value}>
                                {status.label}{status.category_name && status.category_name.toLowerCase() !== status.label.toLowerCase() ? ` · ${status.category_name}` : ""}{status.current ? " · current" : ""}
                              </option>
                            ))}
                          </select>
                        </FormField>
                        <FormField className="form-field--compact-enum form-field--compact-number" label="Priority" required={jiraRequirementEditCoreRequired.priority}>
                          <input min="1" max="5" required={jiraRequirementEditCoreRequired.priority} type="number" value={draft.priority} onChange={(event) => setDraft((current) => ({ ...current, priority: Number(event.target.value) || 3 }))} />
                        </FormField>
                        <FormField label="Sprint" required={jiraRequirementEditCoreRequired.sprint}>
                          <select required={jiraRequirementEditCoreRequired.sprint} value={draft.sprint} onChange={(event) => setDraft((current) => ({ ...current, sprint: event.target.value, iterationId: "" }))}>
                            <option value="">No sprint</option>
                            {draft.sprint && !jiraSprints.some((sprint) => sprint.id === draft.sprint)
                              ? <option value={draft.sprint}>{selectedRequirement.sprint || "Current sprint"}</option>
                              : null}
                            {jiraSprints
                              .filter((sprint) => String(sprint.state || "").toLowerCase() !== "closed" || sprint.id === draft.sprint)
                              .map((sprint) => <option key={sprint.id} value={sprint.id}>{sprintOptionLabel(sprint)}</option>)}
                          </select>
                        </FormField>
                        <FormField label="Release / Fix version" required={jiraRequirementEditCoreRequired.release}>
                          <select
                            required={jiraRequirementEditCoreRequired.release}
                            value={draft.fixVersion || draft.release}
                            onChange={(event) => setDraft((current) => ({ ...current, fixVersion: event.target.value, release: event.target.value }))}
                          >
                            <option value="">No release</option>
                            {jiraVersions.map((version) => <option key={version.id} value={version.name}>{version.name}{version.released ? " · released" : ""}</option>)}
                          </select>
                        </FormField>
                      </div>
                      <FormField label="Description" required={jiraRequirementEditCoreRequired.description}>
                        <RichTextEditor
                          aiRephraseTitle="Rephrase requirement description with AI"
                          onAiRephrase={(html, plainText) => rephraseRequirementDescriptionWithAi(html, plainText, "detail")}
                          required={jiraRequirementEditCoreRequired.description}
                          rows={4}
                          value={draft.description}
                          onChange={(description) => setDraft((current) => ({ ...current, description }))}
                        />
                      </FormField>
                      <ExternalReferencesField
                        value={draft.externalReferencesText}
                        onChange={(externalReferencesText) => setDraft((current) => ({ ...current, externalReferencesText }))}
                      />

                      {requirementEditMetadataQuery.isLoading || requirementEditMetadataQuery.isError || requiredJiraRequirementEditFields.length ? (
                        <section className="issue-form-section">
                          <div className="issue-form-section-head">
                            <strong>Jira required fields</strong>
                            <span>Values come from this Story’s live Jira edit screen and are written back to the same Jira fields.</span>
                          </div>
                          {requirementEditMetadataQuery.isLoading ? (
                            <LoadingState label="Checking Jira Story edit fields" />
                          ) : requirementEditMetadataQuery.isError ? (
                            <p className="inline-message error-message">Qaira could not verify this Jira Story edit screen. Refresh before saving.</p>
                          ) : (
                            <JiraRequiredFields
                              fields={requiredJiraRequirementEditFields}
                              issueTypeName="Story"
                              mode="edit"
                              onChange={(fieldId, value) => updateAdditionalRequirementField("edit", fieldId, value)}
                              users={users}
                              values={draft.additionalFields}
                            />
                          )}
                        </section>
                      ) : null}

                      <div className="action-row">
                        <button className="primary-button" disabled={!canUpdateRequirements || requirementEditMetadataQuery.isLoading || requirementEditMetadataQuery.isError || updateRequirement.isPending || replaceMappings.isPending || replaceDefectMappings.isPending} type="submit">
                          {updateRequirement.isPending || replaceMappings.isPending || replaceDefectMappings.isPending ? "Saving…" : "Save requirement"}
                        </button>
                      </div>
                    </form>
                  </RequirementAccordionSection>
                  </div>
                  </div>
                ) : null}
                {activeTraceabilityTab === "related" ? (
                  <div className="detail-section-panel requirement-detail-wide-panel" role="tabpanel">
                    <RequirementRelatedItemsPanel
                      items={selectedRequirement.related_items || []}
                      navigate={navigate}
                      testCases={testCases}
                    />
                  </div>
                ) : null}
                {activeTraceabilityTab === "comments" ? (
                  <div className="detail-section-panel requirement-detail-wide-panel" role="tabpanel">
                    <JiraCommentsPanel
                      canComment={canUpdateRequirements}
                      issueKey={selectedRequirement.display_id || selectedRequirement.id}
                    />
                  </div>
                ) : null}
                {activeTraceabilityTab === "grounding" ? (
                  <div className="detail-section-panel requirement-detail-wide-panel" role="tabpanel">
                    <div className="requirement-grounding-header">
                      <div>
                        <strong>AI Assurance Requirement grounding</strong>
                        <span>Quality signals, evidence gaps, and change-impact review for this Jira requirement.</span>
                      </div>
                      <button
                        className="ghost-button compact"
                        disabled={!canUseRequirementAi || !projectId || previewRequirementImpact.isPending}
                        onClick={openRequirementImpactPreview}
                        type="button"
                      >
                        <SparkIcon />
                        <span>{previewRequirementImpact.isPending ? "Reviewing impact…" : "Preview change impact"}</span>
                      </button>
                    </div>
                    <AiAssurancePanel
                      gaps={selectedRequirementAiReadiness.gaps}
                      provenance="Local completeness rules over the current draft, linked cases, references, labels, and delivery context"
                      reviewState="review-required"
                      score={selectedRequirementAiReadiness.score}
                      scoreLabel={selectedRequirementAiReadiness.scoreLabel}
                      signals={selectedRequirementAiReadiness.signals}
                      summary={selectedRequirementAiReadiness.summary}
                      title="Requirement grounding"
                    />
                  </div>
                ) : null}
                {activeTraceabilityTab === "cases" ? (
                  <div className="detail-section-panel requirement-detail-wide-panel" role="tabpanel">
                    <RequirementTestCasePicker
                      compactTitlesOnly
                      emptyText={appTypeId ? "No reusable test cases are available for this app type." : "Select an app type first to link reusable test cases."}
                      isSearchActive={isDetailTestCaseSearchActive}
                      onClearSearch={() => setIsDetailTestCaseSearchActive(false)}
                      onSearch={() => setIsDetailTestCaseSearchActive(true)}
                      runHistoryByTestCaseId={selectedRunHistoryByTestCaseId}
                      onView={openTestCaseWorkspace}
                      pickerClassName="requirement-link-picker--workspace"
                      searchTerm={detailTestCaseSearchTerm}
                      onSearchTermChange={setDetailTestCaseSearchTerm}
                      selectedIds={selectedTestCaseIds}
                      sortLinkedFirst
                      testCases={testCases}
                      onToggle={(testCaseId, checked) => toggleSelectedTestCase(setSelectedTestCaseIds, testCaseId, checked)}
                    />
                  </div>
                ) : null}
                {activeTraceabilityTab === "defects" ? (
                  <div className="detail-section-panel requirement-detail-wide-panel" role="tabpanel">
                    <LinkedDefectsPanel
                      canUpdate={canUpdateRequirements}
                      initialDefects={selectedRequirementDefects}
                      itemId={selectedRequirement.id}
                      onSaved={setSelectedDefectIds}
                      projectId={projectId}
                      subject="requirement"
                    />
                  </div>
                ) : null}
                {activeTraceabilityTab === "history" ? (
                  <div className="detail-section-panel requirement-detail-wide-panel" role="tabpanel">
                    <TraceabilityRunHistory
                      appTypeId={appTypeId || undefined}
                      projectId={projectId}
                      requirementId={selectedRequirement.id}
                    />
                  </div>
                ) : null}
                {activeTraceabilityTab === "evidence" ? (
                  <div className="detail-section-panel requirement-detail-wide-panel" role="tabpanel">
                    <JiraAttachmentPanel
                      canDelete={canDeleteAttachments}
                      canUpload={canCreateAttachments}
                      canView={canViewAttachments}
                      issueKey={selectedRequirement.display_id || selectedRequirement.id}
                    />
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="empty-state compact">Select a requirement from the catalog to view and edit its details.</div>
            )}
          </Panel>
        )}
        isDetailOpen={Boolean(selectedRequirement)}
      />

      {isCreateModalOpen ? (
        <div className="modal-backdrop" onClick={closeCreateRequirementModal}>
          <div
            aria-labelledby="create-requirement-title"
            aria-modal="true"
            className="modal-card requirement-create-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="requirement-create-header">
              <div className="requirement-create-title">
                <div className="modal-title-info-row">
                  <h2 className="dialog-title" id="create-requirement-title">Create requirement</h2>
                  <InfoTooltip
                    content="Create the requirement in a focused modal, then link any reusable test cases that already exist for the selected app type."
                    label="Create requirement information"
                  />
                </div>
              </div>
              <DialogCloseButton disabled={createRequirement.isPending} label="Close create requirement" onClick={closeCreateRequirementModal} />
            </div>

            <form className="requirement-create-modal-form" onSubmit={(event) => void handleCreateRequirement(event)}>
              <div className="requirement-create-modal-body requirement-create-modal-body--stacked">
                <div className="form-grid requirement-create-details-grid">
                  <div className="record-grid requirement-detail-metadata-grid">
                    <FormField label="Title" inputId="create-requirement-title-input" required>
                      <input
                        autoFocus
                        id="create-requirement-title-input"
                        required
                        value={createDraft.title}
                        onChange={(event) => setCreateDraft((current) => ({ ...current, title: event.target.value }))}
                      />
                    </FormField>
                    <FormField className="form-field--compact-enum" label="Status">
                      <select
                        value={createDraft.status}
                        onChange={(event) => setCreateDraft((current) => ({ ...current, status: event.target.value }))}
                      >
                        {createRequirementStatusOptions.map((status) => (
                          <option key={status.value} value={status.value}>
                            {status.label}{status.category_name && status.category_name.toLowerCase() !== status.label.toLowerCase() ? ` · ${status.category_name}` : ""}
                          </option>
                        ))}
                      </select>
                    </FormField>
	                    <FormField className="form-field--compact-enum form-field--compact-number" label="Priority" required={jiraRequirementCoreRequired.priority}>
	                      <input
                        min="1"
                        max="5"
                        required={jiraRequirementCoreRequired.priority}
                        type="number"
                        value={createDraft.priority}
                        onChange={(event) => setCreateDraft((current) => ({ ...current, priority: Number(event.target.value) || 3 }))}
	                      />
	                    </FormField>
	                    <FormField label="Sprint" required={jiraRequirementCoreRequired.sprint}>
	                      <select
	                        required={jiraRequirementCoreRequired.sprint}
	                        value={createDraft.sprint}
	                        onChange={(event) => setCreateDraft((current) => ({ ...current, sprint: event.target.value, iterationId: "" }))}
	                      >
	                        <option value="">No sprint</option>
	                        {assignableJiraSprints.map((sprint) => <option key={sprint.id} value={sprint.id}>{sprintOptionLabel(sprint)}</option>)}
	                      </select>
	                    </FormField>
	                  </div>
                  <FormField label="Description" inputId="create-requirement-description-input" required={jiraRequirementCoreRequired.description}>
                    <RichTextEditor
                      id="create-requirement-description-input"
                      aiRephraseTitle="Rephrase requirement description with AI"
                      onAiRephrase={(html, plainText) => rephraseRequirementDescriptionWithAi(html, plainText, "create")}
                      required={jiraRequirementCoreRequired.description}
                      rows={4}
                      value={createDraft.description}
                      onChange={(description) => setCreateDraft((current) => ({ ...current, description }))}
                    />
                  </FormField>
                  <div className="record-grid requirement-compact-metadata-grid">
                    <RequirementLabelsField
                      options={requirementLabelOptions}
                      required={jiraRequirementCoreRequired.labels}
                      value={createDraft.labelsText}
                      onChange={(labelsText) => setCreateDraft((current) => ({ ...current, labelsText }))}
                    />
                    <FormField label="Release / Fix version" required={jiraRequirementCoreRequired.release}>
                      <select
                        required={jiraRequirementCoreRequired.release}
                        value={createDraft.fixVersion || createDraft.release}
                        onChange={(event) => setCreateDraft((current) => ({ ...current, fixVersion: event.target.value, release: event.target.value }))}
                      >
                        <option value="">No release</option>
                        {jiraVersions.map((version) => <option key={version.id} value={version.name}>{version.name}{version.released ? " · released" : ""}</option>)}
                      </select>
                    </FormField>
                  </div>
                  <ExternalReferencesField
                    value={createDraft.externalReferencesText}
                    onChange={(externalReferencesText) => setCreateDraft((current) => ({ ...current, externalReferencesText }))}
                  />
                  {requirementCreateMetadataQuery.isLoading || requirementCreateMetadataQuery.isError || requiredJiraRequirementFields.length ? (
                    <section className="issue-form-section">
                      <div className="issue-form-section-head">
                        <strong>Jira required fields</strong>
                        <span>
                          These fields come from this project’s Jira Story create screen. Qaira collects them before creating the Story so Jira validation stays aligned with your project configuration.
                        </span>
                      </div>
                      {requirementCreateMetadataQuery.isLoading ? (
                        <LoadingState label="Checking Jira Story create fields" />
                      ) : requirementCreateMetadataQuery.isError ? (
                        <p className="inline-message error-message">Qaira could not verify this Jira Story create screen. Refresh or ask a Jira administrator to check the app field-metadata permission.</p>
                      ) : (
                        <JiraRequiredFields
                          fields={requiredJiraRequirementFields}
                          issueTypeName="Story"
                          mode="create"
                          onChange={(fieldId, value) => updateAdditionalRequirementField("create", fieldId, value)}
                          users={users}
                          values={createDraft.additionalFields}
                        />
                      )}
                    </section>
                  ) : null}
                </div>

              </div>

              <div className="action-row requirement-create-modal-actions">
                <button className="ghost-button" disabled={createRequirement.isPending} onClick={closeCreateRequirementModal} type="button">
                  Cancel
                </button>
	                <button className="primary-button" disabled={!canCreateRequirements || createRequirement.isPending || requirementCreateMetadataQuery.isLoading || requirementCreateMetadataQuery.isError} type="submit">
	                  {createRequirement.isPending ? "Creating…" : requirementCreateMetadataQuery.isLoading ? "Checking Jira fields…" : "Create requirement"}
	                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isCreateIterationModalOpen ? (
        <div className="modal-backdrop modal-backdrop--scroll" onClick={() => !createRequirementIteration.isPending && !updateRequirementIteration.isPending && setIsCreateIterationModalOpen(false)} role="presentation">
          <form
            aria-labelledby="create-sprint-title"
            aria-modal="true"
            className="modal-card requirement-create-modal requirement-iteration-modal requirement-sprint-modal"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => void handleSaveIteration(event)}
            role="dialog"
          >
	            <div className="requirement-create-header">
	              <div className="requirement-create-title">
	                <h2 className="dialog-title" id="create-sprint-title">{editingIteration ? "Edit sprint" : "Create sprint"}</h2>
	                <p>{editingIteration ? "Update the Jira Sprint’s plan, delivery window, goal, and status." : "Create the Sprint in Jira, define its delivery window, and place the selected stories into its scope."}</p>
	              </div>
	              <DialogCloseButton disabled={createRequirementIteration.isPending || updateRequirementIteration.isPending} label={`Close ${editingIteration ? "edit" : "create"} sprint`} onClick={() => { setEditingIteration(null); setIsCreateIterationModalOpen(false); }} />
	            </div>
	            <div className="requirement-create-modal-body requirement-create-modal-body--stacked">
	              <div className="iteration-create-layout">
	                <section className="iteration-create-details-card sprint-create-plan-card">
                    <div className="sprint-create-section-heading">
                      <div>
                        <strong>Sprint plan</strong>
                        <span>These details are saved to Jira Software.</span>
                      </div>
                      <span className={`requirement-sprint-status is-${iterationDraftStatus}`}>{sprintStateLabel(iterationDraftStatus)}</span>
                    </div>
                    <div className="sprint-create-plan-grid">
	                    <FormField className="sprint-create-name-field" label="Sprint name" required>
	                      <input autoFocus required value={iterationDraftName} onChange={(event) => setIterationDraftName(event.target.value)} />
	                    </FormField>
                      <FormField label="Jira board" required={!editingIteration}>
                        <select disabled={Boolean(editingIteration)} required={!editingIteration} value={iterationDraftBoardId} onChange={(event) => setIterationDraftBoardId(event.target.value)}>
                          <option value="">Choose board</option>
                          {jiraBoards.map((board) => <option key={board.id} value={board.id}>{board.name}{board.type ? ` · ${board.type}` : ""}</option>)}
                        </select>
                      </FormField>
                      <FormField label="Status" required>
                        <select value={iterationDraftStatus} onChange={(event) => setIterationDraftStatus(event.target.value as "future" | "active")}>
                          <option value="future">Planned</option>
                          <option value="active">Active</option>
                        </select>
                      </FormField>
                      <FormField label="Start date" required>
                        <input required type="date" value={iterationDraftStartDate} onChange={(event) => setIterationDraftStartDate(event.target.value)} />
                      </FormField>
                      <FormField label="End date" required>
                        <input min={iterationDraftStartDate} required type="date" value={iterationDraftEndDate} onChange={(event) => setIterationDraftEndDate(event.target.value)} />
                      </FormField>
	                    <FormField className="sprint-create-goal-field" label="Sprint goal / description">
	                      <RichTextEditor rows={4} value={iterationDraftDescription} onChange={setIterationDraftDescription} />
	                    </FormField>
                    </div>
                    {!jiraBoards.length ? (
                      <div className="empty-state compact">No Jira Software board is available for this project. Check board access and the app’s Jira Software scopes.</div>
                    ) : (
                      <p className="sprint-create-lifecycle-note">
                        {iterationDraftStatus === "active"
                          ? "The Sprint will be started in Jira immediately after creation. Jira board constraints still apply."
                          : "The Sprint will remain planned in Jira until your team starts it."}
                      </p>
                    )}
	                </section>
	              {!editingIteration ? <div className="iteration-requirement-picker sprint-story-picker">
	                <div className="sprint-create-section-heading sprint-story-picker-heading">
                    <div>
                      <strong>Stories in this sprint</strong>
                      <span>Choose scope now; stories can also be dragged into the Sprint later.</span>
                    </div>
                    <span className="sprint-story-count">{sprintDraftRequirementIds.length} selected</span>
                  </div>
	                <div className="iteration-requirement-picker-toolbar">
	                  <FormField label="Search stories">
                    <div className="search-input-with-icon">
                      <SearchIcon />
                      <input
                        placeholder="Search stories"
                        value={iterationRequirementSearch}
                        onChange={(event) => setIterationRequirementSearch(event.target.value)}
                      />
                    </div>
                  </FormField>
                  <div className="action-row">
                    <button
                      className="ghost-button compact"
                      disabled={!iterationRequirementOptions.length || areAllIterationRequirementsSelected}
                      onClick={() =>
                        setSprintDraftRequirementIds((current) => [
                          ...new Set([...current, ...iterationRequirementOptions.map((requirement) => requirement.id)])
                        ])
                      }
                      type="button"
                    >
                      <SelectAllIcon />
                      <span>Select all</span>
                    </button>
                    {sprintDraftRequirementIds.length ? (
                      <button
                        className="ghost-button compact"
                        onClick={() => setSprintDraftRequirementIds([])}
                        type="button"
                      >
                        <ClearSelectionIcon />
                        <span>Clear</span>
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="iteration-requirement-picker-list sprint-story-picker-list" role="listbox" aria-label="Stories for this sprint">
                  {iterationRequirementOptions.map((requirement) => {
                    const isChecked = sprintDraftRequirementIds.includes(requirement.id);
                    const iterationName = requirementIterationById.get(requirement.id)?.name || requirement.sprint;

                    return (
                      <label className="iteration-requirement-option" key={requirement.id}>
                        <input
                          checked={isChecked}
                          onChange={(event) =>
                            setSprintDraftRequirementIds((current) =>
                              event.target.checked
                                ? [...new Set([...current, requirement.id])]
                                : current.filter((id) => id !== requirement.id)
                            )
                          }
                          type="checkbox"
                        />
                        <span>
                          <strong>{requirement.title}</strong>
                          <small>
                            {[requirement.display_id || requirement.id, iterationName || "Backlog", requirement.status || defaultRequirementStatus]
                              .filter(Boolean)
                              .join(" · ")}
                          </small>
                        </span>
                      </label>
                    );
                  })}
	                  {!iterationRequirementOptions.length ? (
	                    <div className="empty-state compact">No stories match this search.</div>
	                  ) : null}
	                </div>
	              </div> : null}
	              </div>
	            </div>
            <div className="action-row requirement-create-modal-actions">
              <button className="ghost-button" disabled={createRequirementIteration.isPending || updateRequirementIteration.isPending} onClick={() => { setEditingIteration(null); setIsCreateIterationModalOpen(false); }} type="button">Cancel</button>
              <button
                className="primary-button"
                disabled={(editingIteration ? !canUpdateRequirementIterations : !canCreateRequirementIterations) || createRequirementIteration.isPending || updateRequirementIteration.isPending || !iterationDraftName.trim() || (!editingIteration && !iterationDraftBoardId) || !iterationDraftStartDate || !iterationDraftEndDate || iterationDraftEndDate <= iterationDraftStartDate}
                type="submit"
              >
                {createRequirementIteration.isPending || updateRequirementIteration.isPending ? `${editingIteration ? "Updating" : "Creating"} sprint…` : `${editingIteration ? "Update" : "Create"} sprint in Jira`}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {isImportModalOpen ? (
        <div
          className="modal-backdrop"
          onClick={() => !bulkImportRequirements.isPending && setIsImportModalOpen(false)}
          role="presentation"
        >
          <div
            aria-labelledby="bulk-requirement-import-title"
            aria-modal="true"
            className="modal-card import-modal-card requirement-import-modal-card"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="import-modal-header">
              <div className="import-modal-title">
                <div className="modal-title-info-row">
                  <h2 className="dialog-title" id="bulk-requirement-import-title">Bulk requirement import</h2>
                </div>
              </div>
              <DialogCloseButton
                disabled={bulkImportRequirements.isPending}
                label="Close bulk requirement import"
                onClick={() => setIsImportModalOpen(false)}
              />
            </div>

            <div className="import-modal-body">
              <FormField label="CSV file" hint="Use title as the required column. Optional columns: description, external_references, labels, sprint, fix_version, release, priority, status.">
                <input accept=".csv,text/csv" onChange={(event) => void handleRequirementImportFile(event)} type="file" />
              </FormField>

              <div className="detail-summary">
                <strong>{importFileName || "No CSV loaded yet"}</strong>
                <span>{importRows.length} row{importRows.length === 1 ? "" : "s"} ready.</span>
              </div>

              {importWarnings.length ? (
                <div className="empty-state compact">
                  {importWarnings.slice(0, 6).map((warning) => (
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
                        <th>Labels</th>
                        <th>Sprint</th>
                        <th>Fix Version</th>
                        <th>Release</th>
                        <th>Priority</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importRows.map((row, index) => (
                        <tr key={`${row.title}-${index}`}>
                          <td>{row.title}</td>
                          <td>{formatReferenceList(row.external_references) || "-"}</td>
                          <td>{formatReferenceList(row.labels) || "-"}</td>
                          <td>{row.sprint || "-"}</td>
                          <td>{row.fix_version || "-"}</td>
                          <td>{row.release || "-"}</td>
                          <td>{row.priority ?? "-"}</td>
                          <td>{row.status || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>

            <div className="action-row import-modal-actions">
              <button
                className="primary-button"
                disabled={!canImportRequirements || !projectId || !importRows.length || bulkImportRequirements.isPending}
                onClick={() => void handleBulkImportRequirements()}
                type="button"
              >
                {bulkImportRequirements.isPending ? "Queuing..." : `Queue ${importRows.length || ""} Requirements`}
              </button>
              <button
                className="ghost-button"
                disabled={!importRows.length || bulkImportRequirements.isPending}
                onClick={() => {
                  setImportRows([]);
                  setImportWarnings([]);
                  setImportFileName("");
                }}
                type="button"
              >
                Clear preview
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isOptimizeModalOpen && (requirementAiMode === "create" || activeOptimizeRequirement) ? (
        <div
          className="modal-backdrop"
          onClick={closeRequirementAiModal}
          role="presentation"
        >
          <div
            aria-labelledby="ai-improve-requirement-title"
            aria-modal="true"
            className={requirementAiMode === "create" ? "modal-card requirement-create-modal ai-design-modal ai-design-modal--requirements ai-requirement-improve-modal ai-requirement-create-ai-modal" : "modal-card requirement-create-modal ai-design-modal ai-design-modal--requirements ai-requirement-improve-modal"}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="ai-studio-header">
              <div className="ai-studio-header-copy ai-requirement-ai-header-copy">
                <p className="dialog-context-label">Requirements</p>
                <div className="ai-requirement-title-row">
                  <h2 className="dialog-title" id="ai-improve-requirement-title">
                    {requirementAiMode === "create" ? "Create requirements using AI" : "AI Complete requirement"}
                  </h2>
                  <button className="primary-button ai-studio-primary-action ai-requirement-title-action" disabled={!canUseRequirementAi || previewRequirementOptimization.isPending || previewRequirementCreation.isPending || createRequirementGenerationJob.isPending || isRequirementCreationJobRunning} onClick={() => void handlePreviewRequirementOptimization()} type="button">
                    <SparkIcon />
                    {createRequirementGenerationJob.isPending
                      ? "Queuing…"
                      : isRequirementCreationJobRunning
                        ? "Generating…"
                        : previewRequirementOptimization.isPending || previewRequirementCreation.isPending
                      ? "Thinking…"
                      : requirementAiMode === "create" ? "Generate requirement drafts" : "Complete requirement"}
                  </button>
                </div>
                <p>
                  {requirementAiMode === "create"
                    ? "Generate multiple testable requirement candidates from prompt context, external references, and compressed attachments, then select only the strongest drafts for Jira."
                    : activeOptimizeRequirement
                      ? `Complete one requirement: ${activeOptimizeRequirement.title}`
                      : "Select one requirement, add context if needed, then generate a focused completion draft."}
                </p>
              </div>
              <DialogCloseButton
                disabled={previewRequirementOptimization.isPending || previewRequirementCreation.isPending || createRequirementGenerationJob.isPending || createRequirement.isPending || updateRequirement.isPending}
                label={requirementAiMode === "create" ? "Close AI requirement creation" : "Close AI requirement improvement"}
                onClick={closeRequirementAiModal}
              />
            </div>

            <div className={isRequirementAiSidebarCollapsed ? "ai-studio-shell is-sidebar-collapsed" : "ai-studio-shell"}>
              <div className={isRequirementAiSidebarCollapsed ? "ai-studio-sidebar is-collapsed" : "ai-studio-sidebar"}>
                {!isRequirementAiSidebarCollapsed ? (
                <div className="ai-studio-sidebar-panels">
                  <section className="ai-studio-panel">
                    <div className="record-grid">
                      <FormField label="LLM integration">
                        <select value={integrationId} onChange={(event) => setIntegrationId(event.target.value)}>
                          <option value="">Configured prompt LLM or active local/project LLM</option>
                          {integrations.map((integration) => (
                            <option key={integration.id} value={integration.id}>
                              {integration.name}
                            </option>
                          ))}
                        </select>
                      </FormField>
                      {requirementAiMode === "improve" ? (
                        <FormField label="Requirement">
                          <select
                            value={activeOptimizeRequirement?.id || ""}
                            onChange={(event) => {
                              const nextRequirementId = event.target.value;
                              setOptimizeRequirementIds(nextRequirementId ? [nextRequirementId] : []);
                                                        setOptimizationSuggestion(null);
                              setPreviewMessage("");
                            }}
                            disabled={previewRequirementOptimization.isPending || updateRequirement.isPending}
                          >
                            <option value="" disabled>Select requirement</option>
                            {aiCompleteRequirementOptions.map((requirement) => (
                              <option key={requirement.id} value={requirement.id}>
                                {requirement.display_id ? `${requirement.display_id} · ` : ""}{requirement.title}
                              </option>
                            ))}
                          </select>
                        </FormField>
                      ) : null}
                    </div>
                  </section>

                  <div className="ai-studio-sidebar-divider">
                    <button aria-expanded="true" className="ghost-button ai-studio-sidebar-toggle" onClick={() => setIsRequirementAiSidebarCollapsed(true)} title="Collapse AI context" type="button"><RequirementAccordionChevronIcon /></button>
                  </div>

                  <AiPromptContextPanel
                    additionalContext={optimizeContext}
                    appTypeId={appTypeId}
                    disabled={previewRequirementOptimization.isPending || previewRequirementCreation.isPending || createRequirementGenerationJob.isPending || isRequirementCreationJobRunning || createRequirement.isPending || updateRequirement.isPending}
                    externalLinksText={optimizeExternalLinksText}
                    onAddImages={(files) => void handleAddOptimizeReferenceImages(files)}
                    onAdditionalContextChange={setOptimizeContext}
                    onExternalLinksTextChange={setOptimizeExternalLinksText}
                    onRemoveImage={(imageUrl) => setOptimizeReferenceImages((current) => current.filter((image) => image.url !== imageUrl))}
                    projectId={projectId}
                    referenceImages={optimizeReferenceImages}
                    requirements={requirementAiMode === "improve" && activeOptimizeRequirement ? [activeOptimizeRequirement] : []}
                  />
                </div>
                ) : (
                  <div className="ai-studio-sidebar-collapsed-bar">
                    <button aria-expanded="false" className="ghost-button ai-studio-sidebar-toggle" onClick={() => setIsRequirementAiSidebarCollapsed(false)} title="Expand AI context" type="button"><RequirementAccordionChevronIcon /></button>
                  </div>
                )}
              </div>

              <div className="ai-studio-main">
                {previewMessage ? <ToastMessage message={previewMessage} onDismiss={() => setPreviewMessage("")} tone={previewTone} /> : null}

                {requirementAiMode === "create" && (jiraRequirementCoreRequired.sprint || jiraRequirementCoreRequired.release) ? (
                  <section className="issue-form-section">
                    <div className="issue-form-section-head">
                      <strong>Jira delivery scope</strong>
                      <span>Required Jira scope is applied to every selected AI-assisted Story.</span>
                    </div>
                    <div className="issue-form-grid issue-form-grid--triple">
                      {jiraRequirementCoreRequired.sprint ? (
                        <FormField label="Sprint" required>
                          <select
                            onChange={(event) => setCreateDraft((current) => ({ ...current, sprint: event.target.value, iterationId: "" }))}
                            required
                            value={createDraft.sprint}
                          >
                            <option value="">Select sprint</option>
                            {assignableJiraSprints.map((sprint) => <option key={sprint.id} value={sprint.id}>{sprintOptionLabel(sprint)}</option>)}
                          </select>
                        </FormField>
                      ) : null}
                      {jiraRequirementCoreRequired.release ? (
                        <FormField label="Release / Fix version" required>
                          <select
                            onChange={(event) => setCreateDraft((current) => ({ ...current, fixVersion: event.target.value, release: event.target.value }))}
                            required
                            value={createDraft.fixVersion || createDraft.release}
                          >
                            <option value="">Select release</option>
                            {jiraVersions.map((version) => <option key={version.id} value={version.name}>{version.name}{version.released ? " · released" : ""}</option>)}
                          </select>
                        </FormField>
                      ) : null}
                    </div>
                  </section>
                ) : null}

                {requirementAiMode === "create" && (requirementCreateMetadataQuery.isLoading || requirementCreateMetadataQuery.isError || requiredJiraRequirementFields.length) ? (
                  <section className="issue-form-section">
                    <div className="issue-form-section-head">
                      <strong>Jira required fields</strong>
                      <span>
                        These project-specific Jira Story fields will be applied to every selected AI draft created from this batch.
                      </span>
                    </div>
                    {requirementCreateMetadataQuery.isLoading ? (
                      <LoadingState label="Checking Jira Story create fields" />
                    ) : requirementCreateMetadataQuery.isError ? (
                      <p className="inline-message error-message">Qaira could not verify this Jira Story create screen. Refresh before creating AI-assisted Stories.</p>
                    ) : (
                      <JiraRequiredFields
                        fields={requiredJiraRequirementFields}
                        issueTypeName="Story"
                        mode="create"
                        onChange={(fieldId, value) => updateAdditionalRequirementField("create", fieldId, value)}
                        users={users}
                        values={createDraft.additionalFields}
                      />
                    )}
                  </section>
                ) : null}

                {requirementAiMode === "create" ? (
                  requirementCreationDrafts.length ? (
                    <div className="ai-requirement-draft-workbench">
                      <div className="ai-requirement-generation-toolbar">
                        <div>
                          <strong>{selectedRequirementCreationDraftCount} of {requirementCreationDrafts.length} selected</strong>
                          <span>Review title, description, priority, acceptance criteria, risks, and questions before creating Jira requirements.</span>
                        </div>
                        <div className="action-row">
                          <button
                            className="ghost-button compact"
                            onClick={() => {
                              if (areAllRequirementCreationDraftsSelected) {
                                setSelectedRequirementCreationDraftIds([]);
                                return;
                              }
                              setSelectedRequirementCreationDraftIds(requirementCreationDrafts.map((candidate, index) => getRequirementCreationDraftId(candidate, index)));
                            }}
                            type="button"
                          >
                            {areAllRequirementCreationDraftsSelected ? "Clear selection" : "Select all drafts"}
                          </button>
                          <button
                            aria-label={isRequirementAiSidebarCollapsed ? "Expand prompt panel" : "Collapse prompt panel"}
                            className="ghost-button compact explorer-icon-button"
                            onClick={() => setIsRequirementAiSidebarCollapsed((current) => !current)}
                            title={isRequirementAiSidebarCollapsed ? "Expand prompt panel" : "Collapse prompt panel"}
                            type="button"
                          >
                            <CollapseExpandIcon isExpanded={!isRequirementAiSidebarCollapsed} />
                          </button>
                        </div>
                      </div>

                      <div className="ai-requirement-draft-list">
                        {requirementCreationDrafts.map((candidate, index) => {
                          const draftId = getRequirementCreationDraftId(candidate, index);
                          const isSelected = selectedRequirementCreationDraftIds.includes(draftId);
                          const isExpanded = expandedRequirementCreationDraftIds.includes(draftId);
                          const qualityPercent = Math.round(Number(candidate.quality_score || 0.72) * 100);

                          return (
                            <article className={isSelected ? "ai-requirement-draft-card is-selected" : "ai-requirement-draft-card"} key={draftId}>
                              <div className="ai-requirement-draft-card-head">
                                <label className="ai-requirement-draft-selector">
                                  <input
                                    checked={isSelected}
                                    onChange={(event) => setSelectedRequirementCreationDraftIds((current) =>
                                      event.target.checked
                                        ? [...new Set([...current, draftId])]
                                        : current.filter((id) => id !== draftId)
                                    )}
                                    type="checkbox"
                                  />
                                  <span>
                                    <strong>{candidate.title}</strong>
                                    <small>Priority P{candidate.priority} · {candidate.status || defaultRequirementStatus} · Quality {qualityPercent}%</small>
                                  </span>
                                </label>
                                <button
                                  aria-expanded={isExpanded}
                                  aria-label={isExpanded ? "Collapse requirement draft" : "Expand requirement draft"}
                                  className="ghost-button compact explorer-icon-button"
                                  onClick={() => setExpandedRequirementCreationDraftIds((current) =>
                                    current.includes(draftId)
                                      ? current.filter((id) => id !== draftId)
                                      : [...current, draftId]
                                  )}
                                  title={isExpanded ? "Collapse requirement draft" : "Expand requirement draft"}
                                  type="button"
                                >
                                  <CollapseExpandIcon isExpanded={isExpanded} />
                                </button>
                              </div>

                              <p className={isExpanded ? "ai-requirement-draft-description" : "ai-requirement-draft-description is-clamped"}>
                                {candidate.description || "No description returned."}
                              </p>

                              {isExpanded ? (
                                <div className="ai-requirement-draft-details">
                                  <div className="detail-summary">
                                    <strong>Acceptance criteria</strong>
                                    <span>{candidate.acceptance_criteria.join(" ") || "No acceptance criteria returned."}</span>
                                  </div>
                                  <div className="detail-summary">
                                    <strong>Risks</strong>
                                    <span>{candidate.risks.join(" ") || "No risks returned."}</span>
                                  </div>
                                  <div className="detail-summary">
                                    <strong>Open questions</strong>
                                    <span>{candidate.open_questions.join(" ") || "No open questions returned."}</span>
                                  </div>
                                  <div className="detail-summary">
                                    <strong>Why this draft</strong>
                                    <span>{candidate.rationale || candidate.change_summary.join(" ") || "Drafted from the provided AI context."}</span>
                                  </div>
                                  {candidate.external_references.length ? (
                                    <div className="detail-summary">
                                      <strong>References</strong>
                                      <span>{formatReferenceList(candidate.external_references)}</span>
                                    </div>
                                  ) : null}
                                </div>
                              ) : null}
                            </article>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="empty-state compact ai-requirement-empty-state">
                      Add prompt context, screenshots, files, or references, then generate requirement drafts. The prompt panel can collapse after generation so the review area gets the room.
                    </div>
                  )
                ) : optimizationSuggestion ? (
                  <div className="ai-requirement-review">
                  {([
                    ["title", "Title", optimizationSuggestion.title],
                    ["description", "Description", optimizationSuggestion.description],
                    ["external_references", "References", formatReferenceList(optimizationSuggestion.external_references)],
                    ["priority", "Priority", `P${optimizationSuggestion.priority}`],
                    ["status", "Status", optimizationSuggestion.status]
                  ] as Array<[keyof typeof optimizationFields, string, string]>).map(([key, label, value]) => (
                    <label className="ai-requirement-review-row" key={key}>
                      <input
                        checked={optimizationFields[key]}
                        onChange={(event) => setOptimizationFields((current) => ({ ...current, [key]: event.target.checked }))}
                        type="checkbox"
                      />
                      <span>
                        <strong>{label}</strong>
                        <small>{value || "No suggestion"}</small>
                      </span>
                    </label>
                  ))}

                  <div className="detail-summary">
                    <strong>Change summary</strong>
                    <span>{optimizationSuggestion.change_summary.join(" ") || "No summary returned."}</span>
                  </div>
                  <div className="detail-summary">
                    <strong>Acceptance criteria</strong>
                    <span>{optimizationSuggestion.acceptance_criteria.join(" ") || "No acceptance criteria returned."}</span>
                  </div>
                  </div>
                ) : (
                  <div className="empty-state compact">
                    Add prompt context, then generate a draft to review before any Jira requirement is created or updated.
                  </div>
                )}
              </div>
            </div>

            <div className="action-row requirement-create-modal-actions ai-studio-footer">
              <button
                className="ghost-button"
                onClick={closeRequirementAiModal}
                type="button"
              >
                Decline
              </button>
              {requirementAiMode === "improve" ? (
                <button className="ghost-button" disabled={!optimizationSuggestion} onClick={() => setOptimizationFields({ title: false, description: false, external_references: false, priority: false, status: false })} type="button">
                  Clear fields
                </button>
              ) : (
                <button
                  className="ghost-button"
                  disabled={!requirementCreationDrafts.length || createRequirement.isPending}
                  onClick={() => {
                    if (areAllRequirementCreationDraftsSelected) {
                      setSelectedRequirementCreationDraftIds([]);
                      return;
                    }
                    setSelectedRequirementCreationDraftIds(requirementCreationDrafts.map((candidate, index) => getRequirementCreationDraftId(candidate, index)));
                  }}
                  type="button"
                >
                  {areAllRequirementCreationDraftsSelected ? "Clear selected drafts" : "Select all drafts"}
                </button>
              )}
		              <button
                  className="primary-button"
                  disabled={requirementAiMode === "create"
                    ? !canCreateRequirements || !selectedRequirementCreationDraftCount || previewRequirementCreation.isPending || createRequirementGenerationJob.isPending || isRequirementCreationJobRunning || createRequirement.isPending || requirementCreateMetadataQuery.isLoading || requirementCreateMetadataQuery.isError
                    : !canUpdateRequirements || !optimizationSuggestion || !Object.values(optimizationFields).some(Boolean) || updateRequirement.isPending}
                  onClick={() => void handleApplyRequirementOptimization()}
                  type="button"
                >
	                {updateRequirement.isPending || createRequirement.isPending
                    ? requirementAiMode === "create" ? "Creating…" : "Applying…"
                    : requirementAiMode === "create" && requirementCreateMetadataQuery.isLoading ? "Checking Jira fields…" : requirementAiMode === "create" ? `Create selected requirements${selectedRequirementCreationDraftCount ? ` (${selectedRequirementCreationDraftCount})` : ""}` : "Apply selected"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isAiStudioOpen ? (
        <AiDesignStudioModal
          acceptLabel="Accept And Move To Test Cases"
          additionalContext={aiAdditionalContext}
          allowMultipleRequirements={false}
          appTypeName={currentAppTypeName}
          closeDisabled={previewDesignedCases.isPending || acceptDesignedCases.isPending}
	          disableAccept={!canCreateTestCases || !previewCases.length || acceptDesignedCases.isPending}
	          disablePreview={!canUseRequirementAi || !aiRequirement || !appTypeId || previewDesignedCases.isPending || !integrations.length}
          dialogClassName="ai-design-modal--requirements"
          existingCases={associatedCases}
          existingCasesSubtitle="These are already associated with the selected requirement in the current app type."
          existingCasesTitle="Linked test cases"
          externalLinksText={aiExternalLinksText}
          eyebrow="Requirements"
          integrationId={integrationId}
          integrations={integrations}
          isAccepting={acceptDesignedCases.isPending}
          isPreviewing={previewDesignedCases.isPending}
          maxCases={maxCases}
          onAccept={(selectedClientIds) => void handleAcceptDesignedCases(selectedClientIds)}
          onAddImages={(files) => void handleAddAiReferenceImages(files)}
          onAdditionalContextChange={setAiAdditionalContext}
          onClose={() => {
            setIsAiStudioOpen(false);
            setPreviewCases([]);
            setPreviewMessage("");
          }}
          onExternalLinksTextChange={setAiExternalLinksText}
          onIntegrationIdChange={setIntegrationId}
          onViewExistingCase={openTestCaseWorkspace}
          onPreview={() => void handlePreviewDesignedCases()}
          onRemoveImage={(imageUrl) => setAiReferenceImages((current) => current.filter((image) => image.url !== imageUrl))}
          onRemovePreviewCase={(clientId) => setPreviewCases((current) => current.filter((candidate) => candidate.client_id !== clientId))}
          onRequirementSelectionChange={(requirementIds) => setAiRequirementId(requirementIds[0] || "")}
          onMaxCasesChange={setMaxCases}
          previewCases={previewCases}
          previewMessage={previewMessage}
          promptTemplateAppTypeId={appTypeId}
          promptTemplateProjectId={projectId}
          onPreviewMessageDismiss={() => setPreviewMessage("")}
          previewTone={previewTone}
          referenceImages={aiReferenceImages}
          requirementHelpText="Select the requirement, shape the prompt, then review the AI-generated reusable cases before approving them."
          requirementLabel="Requirement"
          requirements={requirements}
          selectedRequirementIds={aiRequirement?.id ? [aiRequirement.id] : []}
        />
      ) : null}

      <AiInsightPreviewDialog
        assuranceTitle="Requirement impact grounding"
        emptyMessage="No linked downstream artifact was found for this requirement. Treat that as a coverage review item."
        error={previewRequirementImpact.error instanceof Error ? previewRequirementImpact.error.message : null}
        eyebrow="Requirement details"
        findings={requirementImpactFindings}
        gaps={previewRequirementImpact.data?.impact.test_cases.length ? [] : ["The requirement has no linked test case in the visible Jira scope."]}
        loading={previewRequirementImpact.isPending}
        onClose={() => setIsRequirementImpactPreviewOpen(false)}
        open={isRequirementImpactPreviewOpen}
        recommendedActions={previewRequirementImpact.data?.recommended_actions || []}
        response={previewRequirementImpact.data}
        signals={previewRequirementImpact.data ? [
          { label: "Impact level", value: previewRequirementImpact.data.impact.risk_level, tone: previewRequirementImpact.data.impact.risk_level === "high" ? "warning" : "neutral" },
          { label: "Linked tests", value: String(previewRequirementImpact.data.impact.totals.test_cases), tone: previewRequirementImpact.data.impact.totals.test_cases ? "positive" : "warning" },
          { label: "Affected runs", value: String(previewRequirementImpact.data.impact.totals.test_runs), tone: previewRequirementImpact.data.impact.totals.test_runs ? "warning" : "neutral" }
        ] : []}
        subtitle={previewRequirementImpact.data ? `${previewRequirementImpact.data.requirement.display_id} · ${previewRequirementImpact.data.requirement.title}` : selectedRequirement?.title || "Selected requirement"}
        summary={previewRequirementImpact.data?.explanation}
        title="Preview requirement change impact"
      />

      {linkedPreviewCase ? (
        <LinkedTestCaseModal
          appTypeName={currentAppTypeName}
          projectName={projects.find((project) => String(project.id) === String(projectId))?.name || ""}
          requirements={requirements}
          suites={suites}
          testCase={linkedPreviewCase}
          onClose={() => setLinkedPreviewCaseId("")}
        />
      ) : null}
    </div>
  );
}

function RequirementRelatedItemsPanel({
  items,
  navigate,
  testCases
}: {
  items: RequirementRelatedItem[];
  navigate: (to: string) => void;
  testCases: TestCase[];
}) {
  const testCaseByReference = new Map(testCases.flatMap((testCase) => [
    [String(testCase.id), testCase] as const,
    ...(testCase.display_id ? [[String(testCase.display_id), testCase] as const] : [])
  ]));
  const qairaRoute = (item: RequirementRelatedItem) => {
    if (item.qaira_kind === "test-case") return `/test-cases?case=${encodeURIComponent(item.id)}`;
    if (item.qaira_kind === "test-suite") return `/design?suite=${encodeURIComponent(item.id)}`;
    if (item.qaira_kind === "test-run") return `/executions?execution=${encodeURIComponent(item.id)}`;
    if (item.qaira_kind === "bug") return `/issues?issue=${encodeURIComponent(item.id)}`;
    if (item.qaira_kind === "requirement") return `/requirements?requirement=${encodeURIComponent(item.id)}`;
    return "";
  };

  return (
    <section className="requirement-related-panel" aria-label="Requirement related items">
      <div className="requirement-related-head">
        <div>
          <strong>Jira related items</strong>
          <span>Bidirectional Jira links, with QAira test status and ownership kept visible.</span>
        </div>
        <span className="count-pill">{items.length} linked</span>
      </div>
      <div className="requirement-related-list">
        {items.map((item) => {
          const linkedTestCase = item.qaira_kind === "test-case"
            ? testCaseByReference.get(item.id) || testCaseByReference.get(item.display_id || "")
            : null;
          const status = linkedTestCase?.status || item.status || "No status";
          const assignee = linkedTestCase?.assignee_name || linkedTestCase?.assignee_email || item.assignee_name || "Unassigned";
          const route = qairaRoute(item);
          return (
            <article className="requirement-related-item" key={`${item.direction}-${item.relation}-${item.id}`}>
              <div className="requirement-related-item-main">
                <div className="requirement-related-item-id">
                  <DisplayIdBadge value={item.display_id || item.id} href={getJiraBrowseUrl(item.display_id || item.id, item.jira_url)} />
                  <span>{item.relation}</span>
                </div>
                <strong>{item.title}</strong>
                <small>{item.issue_type}{item.priority ? ` · ${item.priority}` : ""}</small>
              </div>
              <div className="requirement-related-item-meta">
                <StatusBadge value={status} />
                <span className="requirement-related-assignee" title={`Assignee: ${assignee}`}>
                  <RelatedAssigneeIcon />
                  <span>{assignee}</span>
                </span>
                {route ? (
                  <button className="ghost-button compact" onClick={() => navigate(route)} type="button">
                    <OpenIcon />
                    <span>Open in QAira</span>
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
        {!items.length ? <div className="empty-state compact">No Jira related items are visible for this requirement.</div> : null}
      </div>
    </section>
  );
}

function RelatedAssigneeIcon() {
  return <svg aria-hidden="true" fill="none" height="15" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="15"><circle cx="12" cy="8" r="3" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0" /></svg>;
}

function CommentTabIcon() {
  return <svg aria-hidden="true" fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="16"><path d="M5 5h14v10H9l-4 4V5Z" /></svg>;
}

function AttachmentTabIcon() {
  return <svg aria-hidden="true" fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="16"><path d="m20.5 11.5-8.7 8.7a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7L9 17.4a2 2 0 1 1-2.8-2.8l8.5-8.5" /></svg>;
}

function RequirementLabelsField({
  value,
  options,
  required = false,
  onChange
}: {
  value: string;
  options: string[];
  required?: boolean;
  onChange: (value: string) => void;
}) {
  const [draftLabel, setDraftLabel] = useState("");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const selectedLabels = useMemo(() => {
    const seen = new Set<string>();

    return parseReferenceList(value).filter((label) => {
      const key = label.toLowerCase();

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  }, [value]);
  const selectableLabels = useMemo(
    () => {
      const selectedKeys = new Set(selectedLabels.map((label) => label.toLowerCase()));
      return options.filter((option) => !selectedKeys.has(option.toLowerCase()));
    },
    [options, selectedLabels]
  );
  const filteredLabels = useMemo(() => {
    const query = draftLabel.trim().toLowerCase();

    if (!query) {
      return selectableLabels;
    }

    return selectableLabels.filter((label) => label.toLowerCase().includes(query));
  }, [draftLabel, selectableLabels]);
  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;

      if (!target || pickerRef.current?.contains(target)) {
        return;
      }

      setIsMenuOpen(false);
    };

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [isMenuOpen]);

  const commitLabel = (rawLabel: string) => {
    const normalizedLabel = rawLabel.trim();

    if (!normalizedLabel) {
      return;
    }

    if (selectedLabels.some((label) => label.toLowerCase() === normalizedLabel.toLowerCase())) {
      setDraftLabel("");
      return;
    }

    onChange(formatReferenceList([...selectedLabels, normalizedLabel]));
    setDraftLabel("");
    setIsMenuOpen(false);
  };

  const removeLabel = (labelToRemove: string) => {
    onChange(formatReferenceList(selectedLabels.filter((label) => label.toLowerCase() !== labelToRemove.toLowerCase())));
  };

  return (
    <FormField label="Labels" required={required}>
      <div className="requirement-label-picker" ref={pickerRef}>
        <div className="requirement-label-combobox">
          <div className="requirement-label-entry">
            <input
              aria-autocomplete="list"
              aria-expanded={isMenuOpen}
              aria-label="Select or add labels"
              required={required && !selectedLabels.length}
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
                  if (draftLabel.trim()) {
                    commitLabel(draftLabel);
                  }
                }

                if (event.key === "Escape") {
                  setIsMenuOpen(false);
                }
              }}
            />
            {draftLabel.trim() ? (
              <button className="ghost-button requirement-label-add-button" disabled={!draftLabel.trim()} onClick={() => commitLabel(draftLabel)} type="button">
                Add
              </button>
            ) : null}
          </div>
          {isMenuOpen && (filteredLabels.length || draftLabel.trim()) ? (
            <div className="requirement-label-menu" role="listbox" aria-label="Available labels">
              {filteredLabels.map((label) => (
                <button
                  className="requirement-label-menu-option"
                  key={label}
                  onClick={() => commitLabel(label)}
                  role="option"
                  type="button"
                >
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
              <button
                className="requirement-label-chip"
                key={label}
                onClick={() => removeLabel(label)}
                title={`Remove ${label}`}
                type="button"
              >
                <span>{label}</span>
                <strong aria-hidden="true">x</strong>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </FormField>
  );
}

function RequirementTestCasePicker({
  testCases,
  selectedIds,
  onToggle,
  emptyText,
  pickerClassName,
  runHistoryByTestCaseId = {},
  onView,
  sortLinkedFirst = false,
  compactTitlesOnly = false,
  searchTerm,
  onSearchTermChange,
  isSearchActive,
  onSearch,
  onClearSearch
}: {
  testCases: TestCase[];
  selectedIds: string[];
  onToggle: (testCaseId: string, checked: boolean) => void;
  emptyText: string;
  pickerClassName?: string;
  runHistoryByTestCaseId?: Record<string, RequirementRunHistoryRow[]>;
  onView?: (testCaseId: string) => void;
  sortLinkedFirst?: boolean;
  compactTitlesOnly?: boolean;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  isSearchActive: boolean;
  onSearch: () => void;
  onClearSearch?: () => void;
}) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const selectedSet = new Set(selectedIds);
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const statusOptions = Array.from(new Set(testCases.map((testCase) => testCase.status || "draft").filter(Boolean))).sort((left, right) => left.localeCompare(right));
  const priorityOptions = Array.from(new Set(testCases.map((testCase) => String(testCase.priority ?? 3)))).sort((left, right) => Number(left) - Number(right));
  const matchesStatusFilter = (testCase: TestCase) => statusFilter === "all" || String(testCase.status || "draft") === statusFilter;
  const matchesPriorityFilter = (testCase: TestCase) => priorityFilter === "all" || String(testCase.priority ?? 3) === priorityFilter;
  const linkedTestCases = testCases.filter((testCase) => selectedSet.has(testCase.id) && matchesStatusFilter(testCase) && matchesPriorityFilter(testCase));
  const searchedTestCases = isSearchActive
    ? testCases.filter((testCase) =>
        matchesStatusFilter(testCase) && matchesPriorityFilter(testCase) && (
          !normalizedSearch ||
          [
            testCase.display_id || "",
            testCase.id,
            testCase.title,
            richTextToPlainText(testCase.description),
            testCase.status || "",
            `p${testCase.priority ?? 3}`
          ].some((value) => value.toLowerCase().includes(normalizedSearch))
        )
      )
    : [];
  const optionMap = new Map<string, TestCase>();
  const linkedFirst = [...linkedTestCases].sort((left, right) => left.title.localeCompare(right.title));
  const searchedOrdered = [...searchedTestCases].sort((left, right) => {
    const leftLinked = selectedSet.has(left.id);
    const rightLinked = selectedSet.has(right.id);

    if (sortLinkedFirst && leftLinked !== rightLinked) {
      return leftLinked ? -1 : 1;
    }

    return left.title.localeCompare(right.title);
  });

  linkedFirst.forEach((testCase) => optionMap.set(testCase.id, testCase));
  searchedOrdered.forEach((testCase) => optionMap.set(testCase.id, testCase));

	  const orderedTestCases = Array.from(optionMap.values());
  const visibleTestCaseIds = orderedTestCases.map((testCase) => testCase.id);
  const areAllVisibleTestCasesSelected = visibleTestCaseIds.length > 0 && visibleTestCaseIds.every((testCaseId) => selectedIds.includes(testCaseId));
  const hasActiveFilters = statusFilter !== "all" || priorityFilter !== "all" || searchTerm.trim().length > 0 || isSearchActive;
  const shouldShowEmpty =
    !orderedTestCases.length ||
    (isSearchActive && !searchedTestCases.length && !linkedTestCases.length);

  return (
    <div className={pickerClassName ? `requirement-link-picker-shell ${pickerClassName}` : "requirement-link-picker-shell"}>
      <div className="requirement-link-search-row">
        <label className="requirement-link-search-input">
          <SearchIcon />
          <input
            placeholder="Search title, description, requirement, status, or priority"
            value={searchTerm}
            onChange={(event) => onSearchTermChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onSearch();
              }
            }}
          />
        </label>
        <label className="requirement-link-filter-field">
          <span>Status</span>
          <select
            aria-label="Filter linked test cases by status"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">All statuses</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {formatTileCardLabel(status, "Draft")}
              </option>
            ))}
          </select>
        </label>
        <label className="requirement-link-filter-field">
          <span>Priority</span>
          <select
            aria-label="Filter linked test cases by priority"
            value={priorityFilter}
            onChange={(event) => setPriorityFilter(event.target.value)}
          >
            <option value="all">All priorities</option>
            {priorityOptions.map((priority) => (
              <option key={priority} value={priority}>
                P{priority}
              </option>
            ))}
          </select>
        </label>
	        <button className="ghost-button" onClick={onSearch} type="button">
	          <SearchIcon />
	          <span>Search</span>
	        </button>
        <button
          className="ghost-button"
          disabled={!visibleTestCaseIds.length || areAllVisibleTestCasesSelected}
          onClick={() => visibleTestCaseIds.forEach((testCaseId) => {
            if (!selectedIds.includes(testCaseId)) onToggle(testCaseId, true);
          })}
          type="button"
        >
          <SelectAllIcon />
          <span>Select all</span>
        </button>
        <button
          className="ghost-button"
          disabled={!selectedIds.length}
          onClick={() => selectedIds.forEach((testCaseId) => onToggle(testCaseId, false))}
          type="button"
        >
          <ClearSelectionIcon />
          <span>Clear</span>
        </button>
        <button
          className="ghost-button"
          disabled={!hasActiveFilters}
          onClick={() => {
            setStatusFilter("all");
            setPriorityFilter("all");
            onSearchTermChange("");
            onClearSearch?.();
          }}
          type="button"
        >
          <ClearSelectionIcon />
          <span>Clear filters</span>
        </button>
	      </div>

      {!isSearchActive && !linkedTestCases.length ? (
        <div className="empty-state compact">Search to load reusable test cases.</div>
      ) : null}

      {shouldShowEmpty && isSearchActive ? <div className="empty-state compact">{testCases.length ? "No test cases match this search." : emptyText}</div> : null}

      {orderedTestCases.length ? (
        <div className="modal-case-picker requirement-link-picker">
          {orderedTestCases.map((testCase) => {
        const isLinked = selectedIds.includes(testCase.id);

        return (
          <div
            className={[
              "modal-case-option requirement-link-option",
              isLinked ? "is-linked" : "",
              compactTitlesOnly ? "is-compact" : ""
            ].filter(Boolean).join(" ")}
            key={testCase.id}
          >
            <div className="requirement-link-option-copy">
              <strong>{testCase.title}</strong>
              {!compactTitlesOnly ? <span>{richTextToPlainText(testCase.description) || "No description available."}</span> : null}
              {!compactTitlesOnly ? (
                <span className="requirement-link-option-meta">
                  Priority P{testCase.priority ?? 3} · {testCase.status || "draft"}
                </span>
              ) : null}
            </div>
	            <div className="requirement-link-actions">
	              {(() => {
	                const recentRuns = (runHistoryByTestCaseId[testCase.id] || []).slice(0, 5);
	                const defectIds = [...new Set(recentRuns.flatMap((run) => run.defects || []))];

	                return (
	                  <>
	              <div className="requirement-run-sparkline" aria-label={`Recent runs for ${testCase.title}`}>
	                {recentRuns.map((run) => (
	                  <button
	                    aria-label={`Open ${run.executionName}`}
	                    className={`requirement-run-bar is-${run.resultStatus === "passed" ? "passed" : "failed"}`}
	                    key={run.key}
	                    onClick={() => window.open(`/executions?run=${encodeURIComponent(run.executionId)}`, "_self")}
	                    title={`${run.executionName}: ${run.resultStatus}`}
	                    type="button"
	                  />
	                ))}
	              </div>
	              {defectIds.length ? (
	                <button
	                  className="link-button requirement-run-defect-link"
	                  onClick={() => window.open(`/issues?testCase=${encodeURIComponent(testCase.id)}&defects=${encodeURIComponent(defectIds.join(","))}`, "_self")}
	                  type="button"
	                >
	                  Bugs
	                </button>
	              ) : null}
	                  </>
	                );
	              })()}
	              {onView ? (
                <button
                  aria-label={`View ${testCase.title}`}
                  className="ghost-button requirement-link-icon-button requirement-link-view-button"
                  onClick={() => onView(testCase.id)}
                  title="View test case"
                  type="button"
                >
                  <RequirementViewIcon />
                </button>
              ) : null}
              <button
                aria-label={isLinked ? `Unlink ${testCase.title}` : `Link ${testCase.title}`}
                className={[
                  "ghost-button requirement-link-toggle",
                  isLinked ? "is-linked" : "",
                  compactTitlesOnly ? "requirement-link-toggle--icon-only" : ""
                ].filter(Boolean).join(" ")}
                onClick={() => onToggle(testCase.id, !isLinked)}
                title={isLinked ? "Unlink test case" : "Link test case"}
                type="button"
              >
                {isLinked ? <RequirementUnlinkIcon /> : <RequirementLinkIcon />}
                {!compactTitlesOnly ? <span>{isLinked ? "Unlink" : "Link"}</span> : null}
              </button>
            </div>
          </div>
        );
          })}
        </div>
      ) : null}
    </div>
  );
}

function RequirementDefectPicker({
  defects,
  linkedDefects,
  selectedIds,
  onToggle,
  emptyText,
  searchTerm,
  onSearchTermChange,
  isSearchActive,
  isLoading,
  onSearch
}: {
  defects: Issue[];
  linkedDefects: RequirementDefectLink[];
  selectedIds: string[];
  onToggle: (issueId: string, checked: boolean) => void;
  emptyText: string;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  isSearchActive: boolean;
  isLoading: boolean;
  onSearch: () => void;
}) {
  const selectedSet = new Set(selectedIds);
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const linkedById = new Map(linkedDefects.map((defect) => [defect.id, defect]));
  const searchedDefects = isSearchActive
    ? defects.filter((defect) =>
        !normalizedSearch ||
        [
          defect.id,
          defect.title,
          defect.message,
          defect.status || ""
        ].some((value) => value.toLowerCase().includes(normalizedSearch))
      )
    : [];
  const optionMap = new Map<string, RequirementDefectLink>();

  linkedDefects.forEach((defect) => optionMap.set(defect.id, defect));
  searchedDefects.forEach((defect) => {
    optionMap.set(defect.id, {
      id: defect.id,
      title: defect.title,
      status: defect.status,
      link_source: linkedById.get(defect.id)?.link_source,
      created_at: defect.created_at
    });
  });

  const orderedDefects = Array.from(optionMap.values()).sort((left, right) => {
    const leftLinked = selectedSet.has(left.id);
    const rightLinked = selectedSet.has(right.id);

    if (leftLinked !== rightLinked) {
      return leftLinked ? -1 : 1;
    }

    return left.title.localeCompare(right.title);
  });

  return (
    <div className="requirement-link-picker-shell">
      <div className="requirement-link-search-row">
        <input
          placeholder="Search bugs"
          value={searchTerm}
          onChange={(event) => onSearchTermChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onSearch();
            }
          }}
        />
        <button className="ghost-button" onClick={onSearch} type="button">
          <SearchIcon />
          <span>Search</span>
        </button>
      </div>

      {!isSearchActive && !linkedDefects.length ? (
        <div className="empty-state compact">Search to load bugs.</div>
      ) : null}

      {isLoading ? <LoadingState label="Loading bugs" /> : null}

      {!isLoading && isSearchActive && !searchedDefects.length && !linkedDefects.length ? (
        <div className="empty-state compact">{defects.length ? "No bugs match this search." : emptyText}</div>
      ) : null}

      {orderedDefects.length ? (
        <div className="requirement-defect-list">
          <div className="requirement-defect-list-head">
            <span>NO</span>
            <span>Title</span>
            <span>Status</span>
            <span />
          </div>
          {orderedDefects.map((defect) => {
            const isLinked = selectedSet.has(defect.id);

            return (
              <div className={isLinked ? "requirement-defect-row is-linked" : "requirement-defect-row"} key={defect.id}>
                <DisplayIdBadge value={defect.id} />
                <strong>{defect.title}</strong>
                <StatusBadge value={formatTileCardLabel(defect.status, "Open")} />
                <button
                  aria-label={isLinked ? `Unlink ${defect.title}` : `Link ${defect.title}`}
                  className={[
                    "ghost-button requirement-link-toggle requirement-link-toggle--icon-only",
                    isLinked ? "is-linked" : ""
                  ].filter(Boolean).join(" ")}
                  onClick={() => onToggle(defect.id, !isLinked)}
                  title={isLinked ? "Unlink bug" : "Link bug"}
                  type="button"
                >
                  {isLinked ? <RequirementUnlinkIcon /> : <RequirementLinkIcon />}
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function RequirementRunHistoryTable({ rows }: { rows: RequirementRunHistoryRow[] }) {
  if (!rows.length) {
    return <div className="empty-state compact">No runs found for the linked test cases.</div>;
  }

  return (
    <div className="table-wrap requirement-run-history-table">
      <table className="data-table">
        <thead>
          <tr>
            <th>Run</th>
            <th>Test Case</th>
            <th>Status</th>
            <th>Bugs</th>
            <th>Executed</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td>
                <div className="data-table-multiline">
                  <strong>{row.executionName}</strong>
                  <span>{row.executionStatus ? formatTileCardLabel(row.executionStatus, "Queued") : row.executionId}</span>
                </div>
              </td>
              <td>{row.testCaseTitle}</td>
              <td><StatusBadge value={formatTileCardLabel(row.resultStatus, "Running")} /></td>
              <td>{row.defects.length ? row.defects.join(", ") : "—"}</td>
              <td>{formatAuditTimestamp(row.endedAt || row.createdAt || row.startedAt || undefined)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RequirementLinkIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24" width="16">
      <path d="M10 13a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 0 0-7.07-7.07L10.8 5.12" />
      <path d="M14 11a5 5 0 0 0-7.07 0L4.8 13.12a5 5 0 1 0 7.07 7.07L13.2 18.9" />
    </svg>
  );
}

function RequirementUnlinkIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24" width="16">
      <path d="M10 13a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 0 0-7.07-7.07L10.8 5.12" />
      <path d="M14 11a5 5 0 0 0-7.07 0L4.8 13.12a5 5 0 1 0 7.07 7.07L13.2 18.9" />
      <path d="M6 6l12 12" />
    </svg>
  );
}

function RequirementViewIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24" width="16">
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function RequirementAccordionSection({
  title,
  summary,
  countLabel,
  isExpanded,
  onToggle,
  children
}: {
  title: string;
  summary?: string;
  countLabel: string;
  isExpanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className={isExpanded ? "requirement-accordion-section is-expanded" : "requirement-accordion-section"}>
      <button
        aria-expanded={isExpanded}
        className="requirement-accordion-toggle"
        onClick={onToggle}
        title={isExpanded ? `Collapse ${title}` : `Expand ${title}`}
        type="button"
      >
        <div className="requirement-accordion-toggle-main">
          <span aria-hidden="true" className={isExpanded ? "requirement-accordion-icon is-expanded" : "requirement-accordion-icon"}>
            <RequirementAccordionChevronIcon />
          </span>
          <div className="requirement-accordion-toggle-copy">
            <strong>{title}</strong>
            {summary ? <span>{summary}</span> : null}
          </div>
        </div>
        <div className="requirement-accordion-toggle-meta">
          <span className="requirement-accordion-toggle-count">{countLabel}</span>
          <span aria-hidden="true" className="requirement-accordion-toggle-state explorer-toggle-glyph"><CollapseExpandIcon isExpanded={isExpanded} /></span>
        </div>
      </button>
      {isExpanded ? <div className="requirement-accordion-body">{children}</div> : null}
    </section>
  );
}

function RequirementAccordionChevronIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="18" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="18">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}
