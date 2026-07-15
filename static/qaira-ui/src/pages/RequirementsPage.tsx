import { ChangeEvent, CSSProperties, Dispatch, FormEvent, Fragment, ReactNode, SetStateAction, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { AiDesignStudioModal } from "../components/AiDesignStudioModal";
import { AiAssurancePanel } from "../components/AiAssurancePanel";
import { AiInsightPreviewDialog, type AiPreviewFinding } from "../components/AiInsightPreviewDialog";
import { AiPromptContextPanel } from "../components/AiPromptContextPanel";
import { ActivityIcon, AddIcon, BugIcon, ClearSelectionIcon, ExportIcon, ImportIcon, IterationIcon, LayersIcon, OpenIcon, PencilIcon, SearchIcon, SelectAllIcon, SparkIcon, TrashIcon } from "../components/AppIcons";
import { CatalogActionMenu } from "../components/CatalogActionMenu";
import { CatalogViewToggle } from "../components/CatalogViewToggle";
import { CatalogSearchFilter } from "../components/CatalogSearchFilter";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { DialogCloseButton } from "../components/DialogCloseButton";
import { DetailSectionTabs } from "../components/DetailSectionTabs";
import { DisplayIdBadge } from "../components/DisplayIdBadge";
import { FormField } from "../components/FormField";
import { InfoTooltip } from "../components/InfoTooltip";
import { HierarchyMetricStrip } from "../components/HierarchyMetricStrip";
import { LinkedTestCaseModal } from "../components/LinkedTestCaseModal";
import { LinkedDefectsPanel } from "../components/LinkedDefectsPanel";
import { JiraAttachmentPanel } from "../components/JiraAttachmentPanel";
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
import { appendUniqueImages, parseExternalLinks, readImageFiles } from "../lib/aiDesignStudio";
import { assessRequirementAiReadiness } from "../lib/aiAssurance";
import { formatAuditTimestamp, resolveAuditUserLabel } from "../lib/auditDisplay";
import { formatReferenceList, parseReferenceList } from "../lib/externalReferences";
import { areFeatureFlagsEnabled } from "../lib/featureFlags";
import { downloadCsvRecords } from "../lib/csvExport";
import { hasPermission } from "../lib/permissions";
import { deriveIterationHealth } from "../lib/hierarchyHealth";
import { parseRequirementCsv } from "../lib/requirementImport";
import { findByRoutableId, getRoutableId } from "../lib/urlSelection";
import { readDefaultCatalogViewMode } from "../lib/viewPreferences";
import type { AiDesignImageInput, AiDesignedTestCaseCandidate, Execution, ExecutionResult, Integration, Issue, Requirement, RequirementDefectLink, RequirementIteration, TestCase, User } from "../types";

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
};

type RequirementSectionKey = "details" | "library" | "defects" | "runHistory";
type RequirementTraceabilityTab = "details" | "cases" | "defects" | "history" | "evidence";
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
type RequirementAiMode = "create" | "improve";

const createEmptyRequirementDraft = (defaultStatus = "open"): RequirementDraft => ({
  title: "",
  description: "",
  externalReferencesText: "",
  labelsText: "",
  sprint: "",
  fixVersion: "",
  release: "",
  iterationId: "",
  priority: 3,
  status: defaultStatus
});

const createDefaultRequirementSections = (): Record<RequirementSectionKey, boolean> => ({
  details: true,
  library: false,
  defects: false,
  runHistory: false
});

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
  disabled,
  onClick,
  menuLabel,
  actions
}: {
  label: string;
  icon: ReactNode;
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
    <div className="create-run-action-button requirement-split-action-button" ref={triggerRef}>
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
  const [iterationDraftName, setIterationDraftName] = useState("");
  const [iterationDraftDescription, setIterationDraftDescription] = useState("");
  const [iterationDraftSprintId, setIterationDraftSprintId] = useState("");
  const [iterationRequirementSearch, setIterationRequirementSearch] = useState("");
  const [collapsedIterationIds, setCollapsedIterationIds] = useState<string[]>([]);
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
  const defaultRequirementStatus = domainMetadataQuery.data?.requirements.default_status || "open";
  const jiraSprints = domainMetadataQuery.data?.jira?.sprints || [];
  const jiraVersions = (domainMetadataQuery.data?.jira?.versions || []).filter((version) => !version.archived);
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
  const [optimizeRequirementIndex, setOptimizeRequirementIndex] = useState(0);
  const [optimizeContext, setOptimizeContext] = useState("");
  const [optimizeExternalLinksText, setOptimizeExternalLinksText] = useState("");
  const [optimizeReferenceImages, setOptimizeReferenceImages] = useState<AiDesignImageInput[]>([]);
  const [optimizationSuggestion, setOptimizationSuggestion] = useState<RequirementOptimizationSuggestion | null>(null);
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
  const requirementsQuery = useQuery({
    queryKey: ["requirements", projectId],
    queryFn: () => api.requirements.list({ project_id: projectId, page_size: 25 }),
    enabled: Boolean(projectId)
  });
  const requirementDetailQuery = useQuery({
    queryKey: ["requirement-detail", projectId, selectedRequirementId],
    queryFn: () => api.requirements.get(selectedRequirementId, { project_id: projectId }),
    enabled: Boolean(projectId && selectedRequirementId),
    staleTime: 30_000
  });
  const requirementIterationsQuery = useQuery({
    queryKey: ["requirement-iterations", projectId],
    queryFn: () => api.requirementIterations.list({ project_id: projectId }),
    enabled: Boolean(projectId && canViewRequirementIterations)
  });
  const testCasesQuery = useQuery({
    queryKey: ["requirements-test-cases", projectId, appTypeId],
    queryFn: () => api.testCases.list({ app_type_id: appTypeId, page_size: 25, projection: "detail" }),
    enabled: Boolean(appTypeId)
  });
  const executionResultsQuery = useQuery({
    queryKey: ["requirements-execution-results", projectId, appTypeId],
    queryFn: () => api.executionResults.list({ app_type_id: appTypeId }),
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
  const previewRequirementCreation = useMutation({ mutationFn: api.requirements.previewCreation });
  const previewRequirementImpact = useMutation({
    mutationFn: ({ requirementId, input }: { requirementId: string; input: Parameters<typeof api.requirements.previewImpact>[1] }) =>
      api.requirements.previewImpact(requirementId, input)
  });

  const projects = projectsQuery.data || [];
  const appTypes = appTypesQuery.data || [];
  const requirements = requirementsQuery.data || [];
  const requirementIterations = requirementIterationsQuery.data || [];
  const testCases = testCasesQuery.data || [];
  const executionResults = executionResultsQuery.data || [];
  const executions = (executionsQuery.data || []) as Execution[];
  const issues = (issuesQuery.data || []) as Issue[];
  const sharedGroups = sharedGroupsQuery.data || [];
  const suites = suitesQuery.data || [];
  const integrations = integrationsQuery.data || [];
  const users = (usersQuery.data || []) as User[];
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
  const activeOptimizeRequirement = optimizeTargets[optimizeRequirementIndex] || selectedRequirement;

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

    requirementIterations.forEach((iteration) => {
      (iteration.requirement_ids || []).forEach((requirementId) => {
        map.set(requirementId, iteration);
      });
    });

    requirements.forEach((requirement) => {
      const iteration = requirement.iteration_id
        ? requirementIterations.find((item) => item.id === requirement.iteration_id)
        : null;

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
    const openStatus = domainMetadataQuery.data?.issues.default_status || "open";

    requirements.forEach((requirement) => {
      const defects = defectsByRequirementId[requirement.id] || [];
      const total = defects.length;
      const covered = defects.filter((defect) => (defect.status || openStatus) !== openStatus).length;

      coverage[requirement.id] = {
        total,
        covered,
        percent: total ? Math.round((covered / total) * 100) : 0
      };
    });

    return coverage;
  }, [defectsByRequirementId, domainMetadataQuery.data?.issues.default_status, requirements]);

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
    && iterationRequirementOptions.every((item) => deleteSelectedRequirementIds.includes(item.id));

  const requirementIterationGroups = useMemo(() => {
    const filteredById = new Map(filteredRequirements.map((requirement) => [requirement.id, requirement]));
    const groups = requirementIterations.map((iteration) => ({
      iteration,
      requirements: (iteration.requirement_ids || [])
        .map((requirementId) => filteredById.get(requirementId))
        .filter(Boolean) as Requirement[]
    }));
    const assignedRequirementIds = new Set(groups.flatMap((group) => group.iteration.requirement_ids || []));
    const validIterationIds = new Set(requirementIterations.map((iteration) => iteration.id));
    const unassignedRequirements = filteredRequirements.filter((requirement) =>
      !assignedRequirementIds.has(requirement.id) && (!requirement.iteration_id || !validIterationIds.has(requirement.iteration_id))
    );

    return { groups, unassignedRequirements };
  }, [filteredRequirements, requirementIterations]);

  const iterationHealth = useMemo(() => {
    const derive = (items: Requirement[]) => deriveIterationHealth(items.map((item) => ({
      priority: item.priority,
      status: item.status || defaultRequirementStatus,
      linkedCaseCount: (linkedCaseIdsByRequirementId[item.id] || []).length,
      passPercent: passCoverageByRequirementId[item.id]?.percent || 0,
      automationPercent: automationCoverageByRequirementId[item.id]?.percent || 0
    })), canUseAutomationWorkspace);

    return {
      byId: new Map(requirementIterationGroups.groups.map(({ iteration, requirements: items }) => [iteration.id, derive(items)])),
      unassigned: derive(requirementIterationGroups.unassignedRequirements)
    };
  }, [automationCoverageByRequirementId, canUseAutomationWorkspace, defaultRequirementStatus, linkedCaseIdsByRequirementId, passCoverageByRequirementId, requirementIterationGroups]);
  const renderIterationMetrics = (health: ReturnType<typeof deriveIterationHealth>) => (
    <HierarchyMetricStrip
      count={health.count}
      noun="requirement"
      metrics={[
        { label: "Coverage", value: `${health.coveragePercent}%`, tone: health.coveragePercent >= 80 ? "success" : health.coveragePercent >= 50 ? "warning" : "danger", title: "Requirements linked to at least one test case" },
        { label: "Readiness", value: `${health.readinessPercent}%`, tone: health.readinessPercent >= 80 ? "success" : health.readinessPercent >= 60 ? "warning" : "danger", title: canUseAutomationWorkspace ? "Average pass and automation readiness" : "Average linked-test pass readiness" },
        { label: "Done", value: `${health.completionPercent}%`, tone: health.completionPercent >= 80 ? "success" : "info", title: "Requirements in a completed Jira workflow state" },
        { label: "Risks", value: health.riskCount, tone: health.riskCount ? "danger" : "success", title: "Uncovered requirements or high-priority requirements below 70% readiness" }
      ]}
    />
  );

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

    if (requirementIterationGroups.unassignedRequirements.length) {
      entries.push({ kind: "unassigned", count: requirementIterationGroups.unassignedRequirements.length });
      requirementIterationGroups.unassignedRequirements.forEach((requirement) => entries.push({ kind: "requirement", requirement }));
    }

    return entries;
  }, [collapsedIterationIds, requirementIterationGroups, requirementSearchTerm]);

  const activeRequirementFilterCount =
    Number(requirementStatusFilter !== "all") +
    Number(requirementPriorityFilter !== "all") +
    Number(requirementLabelFilter !== "all") +
    Number(requirementSprintFilter !== "all") +
    Number(requirementFixVersionFilter !== "all") +
    Number(requirementReleaseFilter !== "all") +
    Number(requirementCoverageFilter !== "all");

  const areAllFilteredRequirementsSelected =
    (requirements.length > 0 || requirementIterations.length > 0)
    && requirements.every((item) => deleteSelectedRequirementIds.includes(item.id))
    && requirementIterations.every((iteration) => selectedIterationIds.includes(iteration.id));

  const setAllFilteredRequirementItemsSelected = (checked: boolean) => {
    const requirementIds = requirements.map((item) => item.id);
    const iterationIds = requirementIterations.map((iteration) => iteration.id);

    setDeleteSelectedRequirementIds((current) => checked
      ? [...new Set([...current, ...requirementIds])]
      : current.filter((id) => !requirementIds.includes(id)));
    setSelectedIterationIds((current) => checked
      ? [...new Set([...current, ...iterationIds])]
      : current.filter((id) => !iterationIds.includes(id)));
  };

  const setIterationAndChildrenSelected = (iteration: RequirementIteration, checked: boolean) => {
    const requirementIds = (iteration.requirement_ids || []).filter((id) => requirements.some((requirement) => requirement.id === id));
    setSelectedIterationIds((current) => checked
      ? [...new Set([...current, iteration.id])]
      : current.filter((id) => id !== iteration.id));
    setDeleteSelectedRequirementIds((current) => checked
      ? [...new Set([...current, ...requirementIds])]
      : current.filter((id) => !requirementIds.includes(id)));
  };

  const setUnassignedRequirementsSelected = (checked: boolean) => {
    const requirementIds = requirementIterationGroups.unassignedRequirements.map((requirement) => requirement.id);
    setDeleteSelectedRequirementIds((current) => checked
      ? [...new Set([...current, ...requirementIds])]
      : current.filter((id) => !requirementIds.includes(id)));
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
      render: (item) => <DisplayIdBadge value={item.display_id || item.id} />
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
      defaultVisible: false,
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
      key: "iteration",
      label: "Iteration",
      canToggle: false,
      defaultVisible: true,
      sortValue: (item) => requirementIterationById.get(item.id)?.name || "Unassigned",
      render: (item) => requirementIterationById.get(item.id)?.name || "Unassigned"
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
	                label: "AI test cases",
	                description: "Generate or review AI-designed test cases for this requirement.",
	                icon: <SparkIcon />,
	                featureKeys: ["qaira.ai.requirement_design"],
	                permissionMode: "all" as const,
	                requiredPermissions: ["requirement.ai", "testcase.create"],
	                onClick: () => openRequirementAiStudio(item.id)
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
      sprint: selectedRequirement.sprint || "",
      fixVersion: selectedRequirement.fix_version || "",
      release: selectedRequirement.release || "",
      iterationId: selectedRequirement.iteration_id || requirementIterationById.get(selectedRequirement.id)?.id || "",
      priority: selectedRequirement.priority ?? 3,
      status: selectedRequirement.status || defaultRequirementStatus
    });
    setSelectedTestCaseIds(selectedRequirement.test_case_ids || []);
    setSelectedDefectIds(selectedRequirement.defect_ids || []);
  }, [defaultRequirementStatus, emptyRequirementDraft, requirementIterationById, selectedRequirement]);

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
        iteration_id: createDraft.iterationId || undefined,
        priority: createDraft.priority,
        status: createDraft.status
      });

      syncRequirementSearchParams(response.id);
      setSelectedRequirementId(response.id);
      setAiRequirementId(response.id);
      setIsCreateModalOpen(false);
      setCreateDraft(emptyRequirementDraft);
      showSuccess("Requirement created.");
      await refresh();
    } catch (error) {
      showError(error, "Unable to create requirement");
    }
  };

  const handleCreateIteration = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canCreateRequirementIterations) {
      showError(null, "Permission required: requirement_iteration.create");
      return;
    }

    if (!projectId || !iterationDraftName.trim()) {
      return;
    }

    try {
      const response = await createRequirementIteration.mutateAsync({
        project_id: projectId,
        name: iterationDraftName.trim(),
        description: iterationDraftDescription.trim() || undefined,
        requirement_ids: deleteSelectedRequirementIds,
        jira_sprint_id: iterationDraftSprintId || undefined,
        jira_sprint_name: jiraSprints.find((sprint) => sprint.id === iterationDraftSprintId)?.name
      });
      setIterationDraftName("");
      setIterationDraftDescription("");
      setIterationDraftSprintId("");
      setIsCreateIterationModalOpen(false);
      setCollapsedIterationIds((current) => current.filter((id) => id !== response.id));
      setDeleteSelectedRequirementIds([]);
      showSuccess("Iteration created.");
      await refresh();
    } catch (error) {
      showError(error, "Unable to create iteration");
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
      showSuccess(`${movedCount} requirement${movedCount === 1 ? "" : "s"} moved into iteration.`);
      await refresh();
    } catch (error) {
      showError(error, "Unable to move requirement into iteration");
    }
  };

  const handleDeleteSelectedIterations = async () => {
    if (!selectedIterationIds.length || !canDeleteRequirementIterations) {
      return;
    }

    const confirmed = await confirmDelete({
      message: `Delete ${selectedIterationIds.length} iteration${selectedIterationIds.length === 1 ? "" : "s"}? Requirements will stay available as unassigned requirements.`
    });

    if (!confirmed) {
      return;
    }

    try {
      await Promise.all(selectedIterationIds.map((iterationId) => deleteRequirementIteration.mutateAsync(iterationId)));
      setSelectedIterationIds([]);
      showSuccess("Selected iteration deleted.");
      await refresh();
    } catch (error) {
      showError(error, "Unable to delete selected iterations");
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
      selectedIterations.length ? `${selectedIterations.length} iteration${selectedIterations.length === 1 ? "" : "s"}` : ""
    ].filter(Boolean);
    const confirmed = await confirmDelete({
      message: `Delete ${parts.join(" and ")}? Linked test cases stay available; only requirements not selected for deletion remain unassigned when an iteration is removed.`
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
        setMessage(`${deletedRequirementIds.length} requirement${deletedRequirementIds.length === 1 ? "" : "s"} and ${deletedIterationIds.length} iteration${deletedIterationIds.length === 1 ? "" : "s"} deleted, ${failedCount} failed.`);
        return;
      }

      showSuccess(`${deletedRequirementIds.length} requirement${deletedRequirementIds.length === 1 ? "" : "s"} and ${deletedIterationIds.length} iteration${deletedIterationIds.length === 1 ? "" : "s"} deleted.`);
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
          iteration_id: draft.iterationId || "",
          priority: draft.priority,
          status: draft.status
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
    if (!canExportRequirements || !projectId || !filteredRequirements.length) {
      showError(null, canExportRequirements ? "No requirements match the current scope." : "Permission required: requirement.export");
      return;
    }

    try {
      const response = await api.requirements.exportRequirements({
        project_id: projectId,
        requirement_ids: filteredRequirements.map((requirement) => requirement.id),
        format: "csv"
      });
      downloadCsvRecords("qaira-requirements.csv", filteredRequirements.map((requirement) => ({
        Title: requirement.title,
        Description: requirement.description || "",
        Status: requirement.status || "",
        Priority: requirement.priority || 3,
        Labels: (requirement.labels || []).join("|"),
        "External References": (requirement.external_references || []).join("|"),
        Sprint: requirement.sprint || "",
        "Fix Version": requirement.fix_version || "",
        Release: requirement.release || "",
        "Iteration ID": requirement.iteration_id || "",
        "Linked Test Cases": (requirement.test_case_ids || []).join("|"),
        "Linked Bugs": (requirement.defect_ids || []).join("|")
      })));
      showSuccess(`Exported ${filteredRequirements.length} requirement${filteredRequirements.length === 1 ? "" : "s"}. Audit ${response.transaction_id.slice(0, 8)} is available in TestOps.`);
    } catch (error) {
      showError(error, "Unable to export requirements");
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
      setAiReferenceImages((current) => appendUniqueImages(current, images));
    } catch (error) {
      setPreviewTone("error");
      setPreviewMessage(error instanceof Error ? error.message : "Unable to attach the selected image");
    }
  };

  const handleAddOptimizeReferenceImages = async (files: FileList | null) => {
    try {
      const images = await readImageFiles(files);
      setOptimizeReferenceImages((current) => appendUniqueImages(current, images));
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

	  const openRequirementOptimization = (requirementIds?: string[]) => {
	    if (!canUseRequirementAi || !canUpdateRequirements) {
	      showError(null, `Permission required: ${!canUseRequirementAi ? "requirement.ai" : "requirement.update"}`);
	      return;
	    }

	    const targetIds = Array.from(
	      new Set((requirementIds?.length ? requirementIds : selectedRequirement ? [selectedRequirement.id] : []).filter(Boolean))
	    );

    if (!targetIds.length) {
      showError(new Error("Select one or more requirements first."), "Unable to complete requirement");
      return;
    }

    setRequirementAiMode("improve");
    setOptimizeRequirementIds(targetIds);
    setOptimizeRequirementIndex(0);
    setOptimizationSuggestion(null);
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
  };

  const openAiRequirementCreation = () => {
    if (!canUseRequirementAi || !canCreateRequirements || !projectId) {
      showError(null, `Permission required: ${!canUseRequirementAi ? "requirement.ai" : "requirement.create"}`);
      return;
    }

    setRequirementAiMode("create");
    setOptimizeRequirementIds([]);
    setOptimizeRequirementIndex(0);
    setOptimizeContext("");
    setOptimizeExternalLinksText("");
    setOptimizeReferenceImages([]);
    setOptimizationSuggestion(null);
    setOptimizationFields({ title: true, description: true, external_references: true, priority: true, status: true });
    setPreviewMessage("");
    setPreviewTone("success");
    setIsRequirementAiSidebarCollapsed(false);
    setIsOptimizeModalOpen(true);
  };

  const closeRequirementAiModal = () => {
    if (previewRequirementOptimization.isPending || previewRequirementCreation.isPending || createRequirement.isPending || updateRequirement.isPending) {
      return;
    }

    setIsOptimizeModalOpen(false);
    setOptimizeRequirementIds([]);
    setOptimizeRequirementIndex(0);
    setOptimizationSuggestion(null);
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
      const promptInput = {
        integration_id: integrationId || undefined,
        additional_context: optimizeContext || undefined,
        external_links: parseExternalLinks(optimizeExternalLinksText),
        images: optimizeReferenceImages
      };
      const response = requirementAiMode === "create"
        ? await previewRequirementCreation.mutateAsync({
            project_id: projectId,
            ...promptInput,
            priority: 3,
            status: defaultRequirementStatus
          })
        : await previewRequirementOptimization.mutateAsync({
            requirementId: activeOptimizeRequirement!.id,
            input: promptInput
          });
      setOptimizationSuggestion(response.suggestion);
      setPreviewTone(response.fallback_used ? "error" : "success");
      setPreviewMessage(
        response.fallback_used
          ? `AI fallback used: ${response.fallback_reason || "LLM unavailable"}`
          : requirementAiMode === "create"
            ? `Requirement draft created using ${response.integration?.name || "AI"}.`
            : `Requirement optimized using ${response.integration?.name || "AI"}.`
      );
    } catch (error) {
      setPreviewTone("error");
      setPreviewMessage(error instanceof Error ? error.message : "Unable to optimize requirement");
    }
  };

	  const handleApplyRequirementOptimization = async () => {
	    if (requirementAiMode === "create" ? !canCreateRequirements : !canUpdateRequirements) {
	      setPreviewTone("error");
	      setPreviewMessage(`Permission required: ${requirementAiMode === "create" ? "requirement.create" : "requirement.update"}`);
	      return;
	    }

	    if ((requirementAiMode === "improve" && !activeOptimizeRequirement) || !optimizationSuggestion) {
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

    const baseDraft = requirementAiMode === "create"
      ? emptyRequirementDraft
      : activeOptimizeRequirement!.id === selectedRequirement?.id
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
          status: activeOptimizeRequirement!.status || defaultRequirementStatus
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
      status: optimizationFields.status ? optimizationSuggestion.status : baseDraft.status
    };

    if (requirementAiMode === "improve" && activeOptimizeRequirement!.id === selectedRequirement?.id) {
      setDraft(nextDraft);
    }

    try {
      if (requirementAiMode === "create") {
        const response = await createRequirement.mutateAsync({
          project_id: projectId,
          title: nextDraft.title,
          description: nextDraft.description,
          external_references: parseReferenceList(nextDraft.externalReferencesText),
          labels: parseReferenceList(nextDraft.labelsText),
          priority: nextDraft.priority,
          status: nextDraft.status
        });
        syncRequirementSearchParams(response.id);
        setSelectedRequirementId(response.id);
        setAiRequirementId(response.id);
        setIsOptimizeModalOpen(false);
        setOptimizationSuggestion(null);
        showSuccess("AI-assisted requirement created. Review the saved Jira requirement before using it downstream.");
        await refresh();
        return;
      }

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
      const hasNextRequirement = optimizeRequirementIndex + 1 < optimizeTargets.length;

      if (hasNextRequirement) {
        setOptimizeRequirementIndex((current) => current + 1);
        setOptimizationFields({
          title: true,
          description: true,
          external_references: true,
          priority: true,
          status: true
        });
        showSuccess(`AI changes applied to "${activeOptimizeRequirement!.title}". Review the next selected requirement.`);
      } else {
        setIsOptimizeModalOpen(false);
        setOptimizeRequirementIds([]);
        setOptimizeRequirementIndex(0);
        setDeleteSelectedRequirementIds([]);
        showSuccess(`AI requirement changes applied to ${optimizeTargets.length || 1} requirement${(optimizeTargets.length || 1) === 1 ? "" : "s"}.`);
      }
      await refresh();
    } catch (error) {
      showError(error, "Unable to apply AI requirement changes");
    }
  };

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
              <button
                className="ghost-button catalog-selection-button"
                disabled={(!requirements.length && !requirementIterations.length) || areAllFilteredRequirementsSelected}
                onClick={() => setAllFilteredRequirementItemsSelected(true)}
                type="button"
              >
                <SelectAllIcon />
                <span>Select all</span>
              </button>
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
              <RequirementSplitActionButton
                disabled={!canCreateRequirements || !projectId}
                icon={<AddIcon />}
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
              <button
                className="ghost-button catalog-selection-button"
                disabled={!canExportRequirements || !filteredRequirements.length || !projectId}
                onClick={() => void handleExportRequirements()}
                type="button"
              >
                <ExportIcon />
                <span>Export</span>
              </button>
              <RequirementSplitActionButton
                disabled={!canUseRequirementAi || !canUpdateRequirements || !deleteSelectedRequirementIds.length}
                icon={<SparkIcon />}
                label="Optimize Requirement"
                menuLabel="Open selected requirement optimization options"
                onClick={() => openRequirementOptimization(deleteSelectedRequirementIds)}
                actions={[
                  {
                    label: "AI Improve Requirement",
                    description: "Improve selected requirement details.",
                    icon: <SparkIcon />,
                    disabled: !canUseRequirementAi || !canUpdateRequirements || !deleteSelectedRequirementIds.length,
                    onClick: () => openRequirementOptimization(deleteSelectedRequirementIds)
                  },
                  {
                    label: "AI Test Case Generation",
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
              />
              <button
                className="ghost-button catalog-selection-button"
                disabled={!canCreateRequirementIterations || !projectId}
                onClick={() => {
                  setIterationRequirementSearch("");
                  setIsCreateIterationModalOpen(true);
                }}
                type="button"
              >
                <IterationIcon />
                <span>Create iteration</span>
              </button>
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
            </div>

            {deleteSelectedRequirementIds.length ? (
              <div className="detail-summary requirement-selection-summary">
                <strong>{deleteSelectedRequirementIds.length} requirement{deleteSelectedRequirementIds.length === 1 ? "" : "s"} selected</strong>
                <span>Use the selection to complete requirements with AI or bulk delete. Open any tile to continue editing one requirement in a full-page workspace.</span>
              </div>
            ) : null}

            <TileBrowserPane className="requirement-card-list">
              {isRequirementCatalogLoading ? <TileCardSkeletonGrid /> : null}

              {!isRequirementCatalogLoading && filteredRequirements.length && catalogViewMode === "tile" ? (
                <div className="tile-browser-grid">
	                  {iterationTileEntries.map((entry) => {
                    if (entry.kind === "iteration") {
                      const isCollapsed = collapsedIterationIds.includes(entry.iteration.id);
                      const iterationChildIds = (entry.iteration.requirement_ids || []).filter((id) => requirements.some((requirement) => requirement.id === id));
                      const isSelected = selectedIterationIds.includes(entry.iteration.id)
                        && iterationChildIds.every((id) => deleteSelectedRequirementIds.includes(id));

                      return (
                        <div
                          className={draggingRequirementIds.length ? "test-case-module-header requirement-iteration-header is-drop-ready" : "test-case-module-header requirement-iteration-header"}
                          key={`iteration-${entry.iteration.id}`}
                          onDragOver={(event) => {
                            if (draggingRequirementIds.length) {
                              event.preventDefault();
                            }
                          }}
                          onDrop={() => void handleDropRequirementOnIteration(entry.iteration.id)}
                        >
                          <label className="checkbox-field" onClick={(event) => event.stopPropagation()}>
                            <input
                              checked={isSelected}
                              onChange={(event) => setIterationAndChildrenSelected(entry.iteration, event.target.checked)}
                              type="checkbox"
                            />
                          </label>
                          <button
                            aria-label={isCollapsed ? "Expand iteration" : "Collapse iteration"}
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
                            <ChevronDownIcon />
                          </button>
                          <span className="module-folder-icon"><IterationIcon /></span>
                          <strong>{entry.iteration.name}</strong>
                          {renderIterationMetrics(iterationHealth.byId.get(entry.iteration.id)!)}
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
                          <span className="module-folder-icon"><IterationIcon /></span>
                          <strong>Unassigned iteration</strong>
                          {renderIterationMetrics(iterationHealth.unassigned)}
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
	                        label: "AI test cases",
	                        description: "Generate or review AI-designed test cases for this requirement.",
	                        icon: <SparkIcon />,
	                        featureKeys: ["qaira.ai.requirement_design"],
	                        permissionMode: "all" as const,
	                        requiredPermissions: ["requirement.ai", "testcase.create"],
	                        onClick: () => openRequirementAiStudio(item.id)
	                      },
	                      {
	                        label: "Complete with AI",
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
                          const ids = deleteSelectedRequirementIds.includes(item.id) ? deleteSelectedRequirementIds : [item.id];
                          setDraggingRequirementIds(ids);
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
                            <DisplayIdBadge value={item.display_id || item.id} />
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
              {!isRequirementCatalogLoading && filteredRequirements.length && catalogViewMode === "list" ? (
                <>
                  {requirementIterationGroups.groups.map(({ iteration, requirements: groupRequirements }) => {
                    const isCollapsed = collapsedIterationIds.includes(iteration.id);
                    const iterationChildIds = (iteration.requirement_ids || []).filter((id) => requirements.some((requirement) => requirement.id === id));
                    const isSelected = selectedIterationIds.includes(iteration.id)
                      && iterationChildIds.every((id) => deleteSelectedRequirementIds.includes(id));
                    return (
                      <Fragment key={iteration.id}>
                        <div className="test-case-module-header requirement-iteration-header requirement-iteration-list-header">
                          <label className="checkbox-field" onClick={(event) => event.stopPropagation()}>
                            <input
                              checked={isSelected}
                              onChange={(event) => setIterationAndChildrenSelected(iteration, event.target.checked)}
                              type="checkbox"
                            />
                          </label>
                          <button
                            aria-label={isCollapsed ? "Expand iteration" : "Collapse iteration"}
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
                            <ChevronDownIcon />
                          </button>
                          <span className="module-folder-icon"><IterationIcon /></span>
                          <strong>{iteration.name}</strong>
                          {renderIterationMetrics(iterationHealth.byId.get(iteration.id)!)}
                        </div>
                        {!isCollapsed ? (
                          <DataTable
                            columns={requirementListColumns}
                            enableColumnResize
                            emptyMessage="No requirements match this iteration."
                            getRowClassName={(item) => (selectedRequirement?.id === item.id ? "is-active-row" : "")}
                            getRowKey={(item) => item.id}
                            onRowClick={(item) => openRequirementWorkspace(item.id)}
                            rows={groupRequirements}
                            storageKey={`qaira:requirements:list-columns:${iteration.id}`}
                          />
                        ) : null}
                      </Fragment>
                    );
                  })}
                  {requirementIterationGroups.unassignedRequirements.length ? (
                    <>
                      <div className="test-case-module-header is-unassigned requirement-iteration-header requirement-iteration-list-header">
                        <label className="checkbox-field" onClick={(event) => event.stopPropagation()}>
                          <input
                            checked={requirementIterationGroups.unassignedRequirements.every((requirement) => deleteSelectedRequirementIds.includes(requirement.id))}
                            onChange={(event) => setUnassignedRequirementsSelected(event.target.checked)}
                            type="checkbox"
                          />
                        </label>
                        <span className="module-folder-icon"><IterationIcon /></span>
                        <strong>Unassigned iteration</strong>
                        {renderIterationMetrics(iterationHealth.unassigned)}
                      </div>
                      <DataTable
                        columns={requirementListColumns}
                        enableColumnResize
                        emptyMessage="No unassigned requirements match the current search."
                        getRowClassName={(item) => (selectedRequirement?.id === item.id ? "is-active-row" : "")}
                        getRowKey={(item) => item.id}
                        onRowClick={(item) => openRequirementWorkspace(item.id)}
                        rows={requirementIterationGroups.unassignedRequirements}
                        storageKey="qaira:requirements:list-columns:unassigned"
                      />
                    </>
                  ) : null}
                </>
              ) : null}
              {!isRequirementCatalogLoading && !requirements.length ? (
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
	                  <button className="primary-button" disabled={!canCreateTestCases || !appTypeId} onClick={() => openNewTestCase(selectedRequirement)} type="button">
                    <AddIcon />
                    <span>New Test Case</span>
                  </button>
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
                <AiAssurancePanel
                  compact
                  gaps={selectedRequirementAiReadiness.gaps}
                  provenance="Local completeness rules over the current draft, linked cases, references, labels, and delivery context"
                  reviewState="review-required"
                  score={selectedRequirementAiReadiness.score}
                  scoreLabel={selectedRequirementAiReadiness.scoreLabel}
                  signals={selectedRequirementAiReadiness.signals}
                  summary={selectedRequirementAiReadiness.summary}
                  title="Requirement grounding"
                />
                <div className="action-row">
                  <button
                    className="ghost-button compact"
                    disabled={!canUseRequirementAi || !projectId || previewRequirementImpact.isPending}
                    onClick={openRequirementImpactPreview}
                    type="button"
                  >
                    <SparkIcon />
                    <span>{previewRequirementImpact.isPending ? "Reviewing impact…" : "Preview change impact"}</span>
                  </button>
                  <span className="form-help">Read-only Jira traceability review; no requirement or linked record is changed.</span>
                </div>
                <div className="requirement-accordion">
                  <RequirementAccordionSection
                    countLabel={`${selectedTestCaseIds.length} linked`}
                    isExpanded={expandedSections.details}
                    onToggle={() => setExpandedSections((current) => ({ ...current, details: !current.details }))}
                    summary="Review the requirement header details, update the draft, then save or delete from one focused section."
                    title="Requirement header details"
                  >
                    <form className="form-grid" onSubmit={(event) => void handleSaveRequirement(event)}>
                      <div className="record-grid requirement-detail-metadata-grid">
                        <FormField label="Title" required>
                          <input required value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} />
                        </FormField>
                        <FormField label="Status">
                          <select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))}>
                            {requirementStatusOptions.map((status) => (
                              <option key={status} value={status}>
                                {formatTileCardLabel(status, "Open")}
                              </option>
                            ))}
                          </select>
                        </FormField>
	                        <FormField label="Priority">
	                          <input min="1" max="5" type="number" value={draft.priority} onChange={(event) => setDraft((current) => ({ ...current, priority: Number(event.target.value) || 3 }))} />
	                        </FormField>
	                        <FormField label="Iteration">
	                          <select value={draft.iterationId} onChange={(event) => setDraft((current) => ({ ...current, iterationId: event.target.value }))}>
	                            <option value="">No iteration</option>
	                            {requirementIterations.map((iteration) => (
	                              <option key={iteration.id} value={iteration.id}>{iteration.name}</option>
	                            ))}
	                          </select>
	                        </FormField>
	                      </div>
                      <FormField label="Description">
                        <RichTextEditor
                          rows={4}
                          value={draft.description}
                          onChange={(description) => setDraft((current) => ({ ...current, description }))}
                        />
                      </FormField>
                      <div className="record-grid requirement-compact-metadata-grid">
                        <RequirementLabelsField
                          options={requirementLabelOptions}
                          value={draft.labelsText}
                          onChange={(labelsText) => setDraft((current) => ({ ...current, labelsText }))}
                        />
                        <FormField label="Sprint">
                          <select value={draft.sprint} onChange={(event) => setDraft((current) => ({ ...current, sprint: event.target.value }))}>
                            <option value="">No sprint</option>
                            {jiraSprints.map((sprint) => <option key={sprint.id} value={sprint.name}>{sprint.name}{sprint.state ? ` · ${sprint.state}` : ""}</option>)}
                          </select>
                        </FormField>
                        <FormField label="Release / Fix version">
                          <select
                            value={draft.fixVersion || draft.release}
                            onChange={(event) => setDraft((current) => ({ ...current, fixVersion: event.target.value, release: event.target.value }))}
                          >
                            <option value="">No release</option>
                            {jiraVersions.map((version) => <option key={version.id} value={version.name}>{version.name}{version.released ? " · released" : ""}</option>)}
                          </select>
                        </FormField>
                      </div>
                      <FormField label="External references" hint="Ticket links or IDs, separated with commas.">
                        <input value={draft.externalReferencesText} onChange={(event) => setDraft((current) => ({ ...current, externalReferencesText: event.target.value }))} />
                      </FormField>

                      <div className="action-row">
	                        <button
	                          className="ghost-button"
	                          disabled={!canUseRequirementAi || !canUpdateRequirements || previewRequirementOptimization.isPending}
                          onClick={() => openRequirementOptimization([selectedRequirement.id])}
                          type="button"
                        >
                          <SparkIcon />
                          AI complete
                        </button>
	                        <button className="primary-button" disabled={!canUpdateRequirements || updateRequirement.isPending || replaceMappings.isPending || replaceDefectMappings.isPending} type="submit">
                          {updateRequirement.isPending || replaceMappings.isPending || replaceDefectMappings.isPending ? "Saving…" : "Save requirement"}
                        </button>
	                        <button className="ghost-button danger" disabled={!canDeleteRequirements || deleteRequirement.isPending} onClick={() => void handleDeleteRequirement()} type="button">
                          Delete requirement
                        </button>
                      </div>
	                    </form>
                  </RequirementAccordionSection>
                  </div>
                  </div>
                ) : null}
                {activeTraceabilityTab === "cases" ? (
                  <div className="detail-section-panel" role="tabpanel">
                    <RequirementTestCasePicker
                      compactTitlesOnly
                      emptyText={appTypeId ? "No reusable test cases are available for this app type." : "Select an app type first to link reusable test cases."}
                      isSearchActive={isDetailTestCaseSearchActive}
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
                  <div className="detail-section-panel" role="tabpanel">
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
                  <div className="detail-section-panel" role="tabpanel">
                    <TraceabilityRunHistory
                      appTypeId={appTypeId || undefined}
                      projectId={projectId}
                      requirementId={selectedRequirement.id}
                    />
                  </div>
                ) : null}
                {activeTraceabilityTab === "evidence" ? (
                  <div className="detail-section-panel" role="tabpanel">
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
                    <FormField label="Status">
                      <select
                        value={createDraft.status}
                        onChange={(event) => setCreateDraft((current) => ({ ...current, status: event.target.value }))}
                      >
                        {requirementStatusOptions.map((status) => (
                          <option key={status} value={status}>
                            {formatTileCardLabel(status, "Open")}
                          </option>
                        ))}
                      </select>
                    </FormField>
	                    <FormField label="Priority">
	                      <input
                        min="1"
                        max="5"
                        type="number"
                        value={createDraft.priority}
                        onChange={(event) => setCreateDraft((current) => ({ ...current, priority: Number(event.target.value) || 3 }))}
	                      />
	                    </FormField>
	                    <FormField label="Iteration">
	                      <select
	                        value={createDraft.iterationId}
	                        onChange={(event) => setCreateDraft((current) => ({ ...current, iterationId: event.target.value }))}
	                      >
	                        <option value="">No iteration</option>
	                        {requirementIterations.map((iteration) => (
	                          <option key={iteration.id} value={iteration.id}>{iteration.name}</option>
	                        ))}
	                      </select>
	                    </FormField>
	                  </div>
                  <FormField label="Description" inputId="create-requirement-description-input">
                    <RichTextEditor
                      id="create-requirement-description-input"
                      rows={4}
                      value={createDraft.description}
                      onChange={(description) => setCreateDraft((current) => ({ ...current, description }))}
                    />
                  </FormField>
                  <div className="record-grid requirement-compact-metadata-grid">
                    <RequirementLabelsField
                      options={requirementLabelOptions}
                      value={createDraft.labelsText}
                      onChange={(labelsText) => setCreateDraft((current) => ({ ...current, labelsText }))}
                    />
                    <FormField label="Sprint">
                      <select
                        value={createDraft.sprint}
                        onChange={(event) => setCreateDraft((current) => ({ ...current, sprint: event.target.value }))}
                      >
                        <option value="">No sprint</option>
                        {jiraSprints.map((sprint) => <option key={sprint.id} value={sprint.name}>{sprint.name}{sprint.state ? ` · ${sprint.state}` : ""}</option>)}
                      </select>
                    </FormField>
                    <FormField label="Release / Fix version">
                      <select
                        value={createDraft.fixVersion || createDraft.release}
                        onChange={(event) => setCreateDraft((current) => ({ ...current, fixVersion: event.target.value, release: event.target.value }))}
                      >
                        <option value="">No release</option>
                        {jiraVersions.map((version) => <option key={version.id} value={version.name}>{version.name}{version.released ? " · released" : ""}</option>)}
                      </select>
                    </FormField>
                  </div>
                  <FormField label="External references" hint="Ticket links or IDs, separated with commas.">
                    <input
                      value={createDraft.externalReferencesText}
                      onChange={(event) => setCreateDraft((current) => ({ ...current, externalReferencesText: event.target.value }))}
                    />
                  </FormField>
                </div>

              </div>

              <div className="action-row requirement-create-modal-actions">
                <button className="ghost-button" disabled={createRequirement.isPending} onClick={closeCreateRequirementModal} type="button">
                  Cancel
                </button>
	                <button className="primary-button" disabled={!canCreateRequirements || createRequirement.isPending} type="submit">
	                  {createRequirement.isPending ? "Creating…" : "Create requirement"}
	                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isCreateIterationModalOpen ? (
        <div className="modal-backdrop modal-backdrop--scroll" onClick={() => setIsCreateIterationModalOpen(false)} role="presentation">
          <form
            aria-labelledby="create-requirement-iteration-title"
            aria-modal="true"
            className="modal-card requirement-create-modal requirement-iteration-modal"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => void handleCreateIteration(event)}
            role="dialog"
          >
            <div className="requirement-create-header">
              <div className="requirement-create-title">
                <h2 className="dialog-title" id="create-requirement-iteration-title">Create iteration</h2>
                <p>Group requirements into a delivery iteration and drag additional requirements into it from the catalog.</p>
              </div>
              <DialogCloseButton label="Close create iteration" onClick={() => setIsCreateIterationModalOpen(false)} />
            </div>
            <div className="requirement-create-modal-body requirement-create-modal-body--stacked">
              <FormField label="Iteration name" required>
                <input autoFocus required value={iterationDraftName} onChange={(event) => setIterationDraftName(event.target.value)} />
              </FormField>
              <FormField label="Description">
                <RichTextEditor value={iterationDraftDescription} onChange={setIterationDraftDescription} />
              </FormField>
              <FormField label="Jira Sprint">
                <select value={iterationDraftSprintId} onChange={(event) => {
                  const sprint = jiraSprints.find((item) => item.id === event.target.value);
                  setIterationDraftSprintId(event.target.value);
                  if (sprint && !iterationDraftName.trim()) setIterationDraftName(sprint.name);
                }}>
                  <option value="">No Jira Sprint mapping</option>
                  {jiraSprints.map((sprint) => <option key={sprint.id} value={sprint.id}>{sprint.name}{sprint.state ? ` · ${sprint.state}` : ""}</option>)}
                </select>
              </FormField>
              <div className="iteration-requirement-picker">
                <div className="iteration-requirement-picker-toolbar">
                  <FormField label="Requirements">
                    <div className="search-input-with-icon">
                      <SearchIcon />
                      <input
                        placeholder="Search requirements to include"
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
                        setDeleteSelectedRequirementIds((current) => [
                          ...new Set([...current, ...iterationRequirementOptions.map((requirement) => requirement.id)])
                        ])
                      }
                      type="button"
                    >
                      <SelectAllIcon />
                      <span>Select all</span>
                    </button>
                    {deleteSelectedRequirementIds.length ? (
                      <button
                        className="ghost-button compact"
                        onClick={() => setDeleteSelectedRequirementIds([])}
                        type="button"
                      >
                        <ClearSelectionIcon />
                        <span>Clear</span>
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="iteration-requirement-picker-list" role="listbox" aria-label="Requirements for this iteration">
                  {iterationRequirementOptions.map((requirement) => {
                    const isChecked = deleteSelectedRequirementIds.includes(requirement.id);
                    const iterationName = requirementIterationById.get(requirement.id)?.name;

                    return (
                      <label className="iteration-requirement-option" key={requirement.id}>
                        <input
                          checked={isChecked}
                          onChange={(event) =>
                            setDeleteSelectedRequirementIds((current) =>
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
                            {[requirement.display_id || requirement.id, iterationName || "Unassigned", requirement.status || defaultRequirementStatus]
                              .filter(Boolean)
                              .join(" · ")}
                          </small>
                        </span>
                      </label>
                    );
                  })}
                  {!iterationRequirementOptions.length ? (
                    <div className="empty-state compact">No requirements match this search.</div>
                  ) : null}
                </div>
                <div className="detail-summary">
                  <strong>{deleteSelectedRequirementIds.length} selected requirement{deleteSelectedRequirementIds.length === 1 ? "" : "s"}</strong>
                  <span>Selected requirements are moved into this iteration after creation.</span>
                </div>
              </div>
            </div>
            <div className="action-row requirement-create-modal-actions">
              <button className="ghost-button" onClick={() => setIsCreateIterationModalOpen(false)} type="button">Cancel</button>
              <button className="primary-button" disabled={!canCreateRequirementIterations || createRequirementIteration.isPending || !iterationDraftName.trim()} type="submit">
                {createRequirementIteration.isPending ? "Creating..." : "Create iteration"}
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
            className="modal-card requirement-create-modal ai-design-modal ai-design-modal--requirements ai-requirement-improve-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="ai-studio-header">
              <div className="ai-studio-header-copy">
                <p className="dialog-context-label">Requirements</p>
                <h2 className="dialog-title" id="ai-improve-requirement-title">
                  {requirementAiMode === "create" ? "Create requirements using AI" : "AI improve requirement"}
                </h2>
                <p>
                  {requirementAiMode === "create"
                    ? "Shape a testable requirement with the same prompt context used by AI test case generation, then review every field before creating it in Jira."
                    : optimizeTargets.length > 1
                      ? `Reviewing ${optimizeRequirementIndex + 1} of ${optimizeTargets.length}: ${activeOptimizeRequirement?.title || "Requirement"}`
                      : "Generate a testable requirement upgrade, then accept all changes, decline, or apply only selected fields."}
                </p>
              </div>
              <DialogCloseButton
                disabled={previewRequirementOptimization.isPending || previewRequirementCreation.isPending || createRequirement.isPending || updateRequirement.isPending}
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
                    </div>
                  </section>

                  <div className="ai-studio-sidebar-divider">
                    <button aria-expanded="true" className="ghost-button ai-studio-sidebar-toggle" onClick={() => setIsRequirementAiSidebarCollapsed(true)} title="Collapse AI context" type="button"><RequirementAccordionChevronIcon /></button>
                  </div>

                  <AiPromptContextPanel
                    additionalContext={optimizeContext}
                    appTypeId={appTypeId}
                    disabled={previewRequirementOptimization.isPending || previewRequirementCreation.isPending || createRequirement.isPending || updateRequirement.isPending}
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
                <div className="action-row ai-studio-actions">
		                  <button className="primary-button ai-studio-primary-action" disabled={!canUseRequirementAi || previewRequirementOptimization.isPending || previewRequirementCreation.isPending} onClick={() => void handlePreviewRequirementOptimization()} type="button">
                    <SparkIcon />
                    {previewRequirementOptimization.isPending || previewRequirementCreation.isPending
                      ? "Thinking…"
                      : requirementAiMode === "create" ? "Generate requirement draft" : "Suggest improvements"}
                  </button>
                </div>

                {previewMessage ? <ToastMessage message={previewMessage} onDismiss={() => setPreviewMessage("")} tone={previewTone} /> : null}

                {optimizationSuggestion ? (
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
              {requirementAiMode === "improve" && optimizeTargets.length > 1 && optimizeRequirementIndex + 1 < optimizeTargets.length ? (
                <button
                  className="ghost-button"
                  disabled={previewRequirementOptimization.isPending || updateRequirement.isPending}
                  onClick={() => {
                    setOptimizationSuggestion(null);
                    setPreviewMessage("");
                    setOptimizeRequirementIndex((current) => current + 1);
                  }}
                  type="button"
                >
                  Skip current
                </button>
              ) : null}
              <button className="ghost-button" disabled={!optimizationSuggestion} onClick={() => setOptimizationFields({ title: false, description: false, external_references: false, priority: false, status: false })} type="button">
                Clear fields
              </button>
		              <button
                  className="primary-button"
                  disabled={(requirementAiMode === "create" ? !canCreateRequirements : !canUpdateRequirements) || !optimizationSuggestion || !Object.values(optimizationFields).some(Boolean) || updateRequirement.isPending || createRequirement.isPending}
                  onClick={() => void handleApplyRequirementOptimization()}
                  type="button"
                >
	                {updateRequirement.isPending || createRequirement.isPending
                    ? requirementAiMode === "create" ? "Creating…" : "Applying…"
                    : requirementAiMode === "create" ? "Create requirement" : "Apply selected"}
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

function AttachmentTabIcon() {
  return <svg aria-hidden="true" fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="16"><path d="m20.5 11.5-8.7 8.7a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7L9 17.4a2 2 0 1 1-2.8-2.8l8.5-8.5" /></svg>;
}

function RequirementLabelsField({
  value,
  options,
  onChange
}: {
  value: string;
  options: string[];
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
  onSearch
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
}) {
  const selectedSet = new Set(selectedIds);
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const linkedTestCases = testCases.filter((testCase) => selectedSet.has(testCase.id));
  const searchedTestCases = isSearchActive
    ? testCases.filter((testCase) =>
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
  const shouldShowEmpty =
    !orderedTestCases.length ||
    (isSearchActive && !searchedTestCases.length && !linkedTestCases.length);

  return (
    <div className={pickerClassName ? `requirement-link-picker-shell ${pickerClassName}` : "requirement-link-picker-shell"}>
      <div className="requirement-link-search-row">
        <input
          placeholder="Search test cases"
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
  summary: string;
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
        type="button"
      >
        <div className="requirement-accordion-toggle-main">
          <span aria-hidden="true" className={isExpanded ? "requirement-accordion-icon is-expanded" : "requirement-accordion-icon"}>
            <RequirementAccordionChevronIcon />
          </span>
          <div className="requirement-accordion-toggle-copy">
            <strong>{title}</strong>
            <span>{summary}</span>
          </div>
        </div>
        <div className="requirement-accordion-toggle-meta">
          <span className="requirement-accordion-toggle-count">{countLabel}</span>
          <span className="requirement-accordion-toggle-state">{isExpanded ? "Collapse" : "Expand"}</span>
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
