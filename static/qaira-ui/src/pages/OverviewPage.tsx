import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { AiInsightPreviewDialog, type AiPreviewFinding } from "../components/AiInsightPreviewDialog";
import { CustomQualityDashboard } from "../components/CustomQualityDashboard";
import { ReleaseReadinessDashboard } from "../components/ReleaseReadinessDashboard";
import { ColumnsIcon, DragHandleIcon, SparkIcon } from "../components/AppIcons";
import { DialogCloseButton } from "../components/DialogCloseButton";
import { Panel } from "../components/Panel";
import { ProgressMeter } from "../components/ProgressMeter";
import { StatusBadge } from "../components/StatusBadge";
import { useCurrentProject } from "../hooks/useCurrentProject";
import { useFeatureFlags } from "../hooks/useFeatureFlags";
import { useWorkspaceData } from "../hooks/useWorkspaceData";
import { api } from "../lib/api";
import { areFeatureFlagsEnabled } from "../lib/featureFlags";
import { canAccessPath, hasPermission } from "../lib/permissions";
import type { ExecutionResult } from "../types";

type DashboardTone = "success" | "info" | "neutral" | "error";
type AnalyticsSectionId = "decision" | "signals" | "delivery" | "flow" | "automation" | "risk";

type MetricEvidence = {
  id: string;
  category: string;
  title: string;
  value: string;
  verdict: string;
  explanation: string;
  calculation: string;
  signals: Array<{ label: string; value: string; detail: string; tone: DashboardTone }>;
  actions: string[];
};

type AnalyticsLayout = {
  order: AnalyticsSectionId[];
  hidden: AnalyticsSectionId[];
};

const ANALYTICS_SECTIONS: Array<{
  id: AnalyticsSectionId;
  category: string;
  title: string;
  description: string;
}> = [
  { id: "decision", category: "Decision signal", title: "Release posture", description: "A concise go/no-go view. Open a metric to see its evidence, calculation, and recommended response." },
  { id: "signals", category: "Drivers and action", title: "What changes confidence", description: "Traceability, test design, and execution evidence explain which intervention will improve the release signal." },
  { id: "delivery", category: "Delivery confidence", title: "Scope lanes and attention", description: "Compares product surfaces and prioritizes the gaps most likely to hold delivery back." },
  { id: "flow", category: "Throughput and evidence", title: "Quality flow", description: "Shows whether scoped work is becoming executable coverage and recent, decision-grade run evidence." },
  { id: "automation", category: "Capability insight", title: "Automation capacity", description: "Measures automation reach and execution leverage. These metrics are operational signals, not release proof." },
  { id: "risk", category: "Reliability risk", title: "Failure concentration", description: "Surfaces repeated failed or blocked evidence and the most recent release checks that produced it." }
];

const DEFAULT_ANALYTICS_LAYOUT: AnalyticsLayout = {
  order: ANALYTICS_SECTIONS.map((section) => section.id),
  hidden: []
};

function normalizeAnalyticsLayout(value: unknown): AnalyticsLayout {
  const candidate = value && typeof value === "object" ? value as Partial<AnalyticsLayout> : {};
  const validIds = new Set(ANALYTICS_SECTIONS.map((section) => section.id));
  const order = Array.isArray(candidate.order)
    ? candidate.order.filter((id): id is AnalyticsSectionId => validIds.has(id as AnalyticsSectionId))
    : [];
  const hidden = Array.isArray(candidate.hidden)
    ? candidate.hidden.filter((id): id is AnalyticsSectionId => validIds.has(id as AnalyticsSectionId))
    : [];
  return {
    order: [...order, ...DEFAULT_ANALYTICS_LAYOUT.order.filter((id) => !order.includes(id))],
    hidden: [...new Set(hidden)]
  };
}

function AnalyticsSection({
  children,
  description,
  eyebrow,
  id,
  order,
  title
}: {
  children: ReactNode;
  description: string;
  eyebrow: string;
  id: AnalyticsSectionId;
  order: number;
  title: string;
}) {
  return (
    <section className="analytics-section" style={{ order }} aria-labelledby={`analytics-section-${id}`}>
      <header className="analytics-section-heading">
        <span>{eyebrow}</span>
        <div>
          <h2 id={`analytics-section-${id}`}>{title}</h2>
          <p>{description}</p>
        </div>
      </header>
      <div className="analytics-section-body">{children}</div>
    </section>
  );
}

function MetricEvidenceDialog({ evidence, onClose }: { evidence: MetricEvidence | null; onClose: () => void }) {
  useEffect(() => {
    if (!evidence) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [evidence, onClose]);

  if (!evidence) return null;

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div aria-labelledby="metric-evidence-title" aria-modal="true" className="modal-card analytics-evidence-modal" onClick={(event) => event.stopPropagation()} role="dialog">
        <div className="modal-card-head">
          <div>
            <span className="eyebrow">{evidence.category}</span>
            <h3 id="metric-evidence-title">{evidence.title}</h3>
            <p>{evidence.verdict}</p>
          </div>
          <DialogCloseButton label="Close metric explanation" onClick={onClose} />
        </div>
        <div className="analytics-evidence-score">
          <strong>{evidence.value}</strong>
          <span>{evidence.explanation}</span>
        </div>
        <div className="analytics-evidence-grid">
          {evidence.signals.map((signal) => (
            <div className={`analytics-evidence-signal tone-${signal.tone}`} key={signal.label}>
              <span>{signal.label}</span>
              <strong>{signal.value}</strong>
              <small>{signal.detail}</small>
            </div>
          ))}
        </div>
        <div className="analytics-evidence-formula">
          <span>How this is calculated</span>
          <code>{evidence.calculation}</code>
        </div>
        <div className="analytics-evidence-actions">
          <strong>Recommended response</strong>
          <ul>{evidence.actions.map((action) => <li key={action}>{action}</li>)}</ul>
        </div>
      </div>
    </div>
  );
}

function AnalyticsLayoutDialog({
  automationAvailable,
  layout,
  onClose,
  onMove,
  onReset,
  onToggle
}: {
  automationAvailable: boolean;
  layout: AnalyticsLayout;
  onClose: () => void;
  onMove: (id: AnalyticsSectionId, direction: -1 | 1) => void;
  onReset: () => void;
  onToggle: (id: AnalyticsSectionId) => void;
}) {
  const visibleDefinitions = layout.order
    .map((id) => ANALYTICS_SECTIONS.find((section) => section.id === id))
    .filter((section): section is typeof ANALYTICS_SECTIONS[number] => Boolean(section) && (section?.id !== "automation" || automationAvailable));

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div aria-labelledby="analytics-layout-title" aria-modal="true" className="modal-card analytics-layout-modal" onClick={(event) => event.stopPropagation()} role="dialog">
        <div className="modal-card-head">
          <div><span className="eyebrow">Personal view</span><h3 id="analytics-layout-title">Arrange analytics</h3><p>Reorder or hide sections for this project. This browser-only preference creates no Forge or Jira API traffic.</p></div>
          <DialogCloseButton label="Close analytics arrangement" onClick={onClose} />
        </div>
        <div className="analytics-layout-list">
          {visibleDefinitions.map((section, index) => (
            <div className="analytics-layout-row" key={section.id}>
              <span className="analytics-layout-handle" aria-hidden="true"><DragHandleIcon /></span>
              <div><strong>{section.title}</strong><span>{section.category}</span></div>
              <label><input checked={!layout.hidden.includes(section.id)} onChange={() => onToggle(section.id)} type="checkbox" />Visible</label>
              <div className="analytics-layout-move-actions">
                <button aria-label={`Move ${section.title} up`} disabled={index === 0} onClick={() => onMove(section.id, -1)} type="button">↑</button>
                <button aria-label={`Move ${section.title} down`} disabled={index === visibleDefinitions.length - 1} onClick={() => onMove(section.id, 1)} type="button">↓</button>
              </div>
            </div>
          ))}
        </div>
        <div className="analytics-layout-footer"><button className="ghost-button" onClick={onReset} type="button">Reset layout</button><button className="primary-button" onClick={onClose} type="button">Done</button></div>
      </div>
    </div>
  );
}

const compactNumberFormatter = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1
});

const monthFormatter = new Intl.DateTimeFormat("en", { month: "short" });

const EMPTY_EXECUTION_SUMMARY = {
  running: 0,
  passed: 0,
  failed: 0,
  blocked: 0,
  total: 0,
  percent: 0
};

function latestExecutionTimestamp(execution: { started_at?: string | null; ended_at?: string | null }) {
  return Math.max(
    execution.started_at ? new Date(execution.started_at).getTime() || 0 : 0,
    execution.ended_at ? new Date(execution.ended_at).getTime() || 0 : 0
  );
}

function resolveScoreTone(score: number): DashboardTone {
  if (score >= 80) {
    return "success";
  }

  if (score >= 60) {
    return "info";
  }

  if (score >= 40) {
    return "neutral";
  }

  return "error";
}

function scoreAccent(tone: DashboardTone) {
  if (tone === "success") {
    return "#1aa96b";
  }

  if (tone === "info") {
    return "#2d66e6";
  }

  if (tone === "neutral") {
    return "#e49c2f";
  }

  return "#d04668";
}

function buildExecutionSegments(
  passedCount: number,
  failedCount: number,
  runningCount: number,
  blockedCount: number,
  totalCount: number
) {
  if (!totalCount) {
    return [{ value: 100, tone: "neutral" as const }];
  }

  const pendingCount = Math.max(totalCount - passedCount - failedCount - runningCount - blockedCount, 0);

  return [
    { value: (passedCount / totalCount) * 100, tone: "success" as const },
    { value: (failedCount / totalCount) * 100, tone: "danger" as const },
    { value: (runningCount / totalCount) * 100, tone: "info" as const },
    { value: (blockedCount / totalCount) * 100, tone: "info" as const },
    { value: (pendingCount / totalCount) * 100, tone: "neutral" as const }
  ].filter((segment) => segment.value > 0);
}

function pickLatestExecutionResults(results: ExecutionResult[]) {
  const latestByExecutionCase = new Map<string, ExecutionResult>();

  results.forEach((result) => {
    const key = `${result.execution_id}:${result.test_case_id}`;
    const current = latestByExecutionCase.get(key);
    const currentTime = current?.created_at ? new Date(current.created_at).getTime() || 0 : 0;
    const nextTime = result.created_at ? new Date(result.created_at).getTime() || 0 : 0;

    if (!current || nextTime >= currentTime) {
      latestByExecutionCase.set(key, result);
    }
  });

  return [...latestByExecutionCase.values()];
}

function DashboardToneChip({
  label,
  tone
}: {
  label: string;
  tone: DashboardTone;
}) {
  return <span className={`dashboard-tone-chip tone-${tone}`}>{label}</span>;
}

function QualityAnalyticsDashboard() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const featureFlagsQuery = useFeatureFlags(Boolean(session));
  const [projectId] = useCurrentProject();
  const [isQualityInsightPreviewOpen, setIsQualityInsightPreviewOpen] = useState(false);
  const [selectedMetricEvidence, setSelectedMetricEvidence] = useState<MetricEvidence | null>(null);
  const [isLayoutDialogOpen, setIsLayoutDialogOpen] = useState(false);
  const [analyticsLayout, setAnalyticsLayout] = useState<AnalyticsLayout>(DEFAULT_ANALYTICS_LAYOUT);
  const canViewAutomationAnalytics = hasPermission(session, "automation.analytics.view")
    && hasPermission(session, "dashboard.view")
    && areFeatureFlagsEnabled(featureFlagsQuery.data, ["qaira.automation.workspace", "qaira.automation.analytics"]);
  const {
    projects,
    requirements,
    appTypes,
    testSuites,
    testCases,
    executions,
    executionResults
  } = useWorkspaceData({
    users: false,
    roles: false,
    projectMembers: false,
    issues: false,
    testCasesProjection: "summary"
  });

  const projectsList = projects.data || [];
  const appTypesListRaw = appTypes.data || [];
  const requirementsListRaw = requirements.data || [];
  const suitesListRaw = testSuites.data || [];
  const testCasesListRaw = testCases.data || [];
  const executionsListRaw = executions.data || [];
  const executionResultsListRaw = executionResults.data || [];
  const activeProjectId = projectId || projectsList[0]?.id || "";
  const qualityInsightPreview = useMutation({
    mutationFn: (activeProject: string) => api.ai.qualityInsights({ project_id: activeProject })
  });
  const selectedProject = projectsList.find((project) => String(project.id) === String(activeProjectId)) || null;
  const appTypesList = useMemo(
    () => appTypesListRaw.filter((appType) => String(appType.project_id) === String(activeProjectId)),
    [activeProjectId, appTypesListRaw]
  );
  const activeAppTypeIds = useMemo(() => new Set(appTypesList.map((appType) => appType.id)), [appTypesList]);
  const requirementsList = useMemo(
    () => requirementsListRaw.filter((requirement) => String(requirement.project_id) === String(activeProjectId)),
    [activeProjectId, requirementsListRaw]
  );
  const suitesList = useMemo(
    () => suitesListRaw.filter((suite) => activeAppTypeIds.has(suite.app_type_id)),
    [activeAppTypeIds, suitesListRaw]
  );
  const testCasesList = useMemo(
    () => testCasesListRaw.filter((testCase) => testCase.app_type_id && activeAppTypeIds.has(testCase.app_type_id)),
    [activeAppTypeIds, testCasesListRaw]
  );
  const executionsList = useMemo(
    () => executionsListRaw.filter((execution) => String(execution.project_id) === String(activeProjectId)),
    [activeProjectId, executionsListRaw]
  );
  const activeExecutionIds = useMemo(() => new Set(executionsList.map((execution) => execution.id)), [executionsList]);
  const executionResultsList = useMemo(
    () => executionResultsListRaw.filter((result) => activeExecutionIds.has(result.execution_id) || activeAppTypeIds.has(result.app_type_id)),
    [activeAppTypeIds, activeExecutionIds, executionResultsListRaw]
  );
  const latestExecutionResultsList = useMemo(
    () => pickLatestExecutionResults(executionResultsList),
    [executionResultsList]
  );

  const caseStepCountById = useMemo(() => {
    return Object.fromEntries(testCasesList.map((testCase) => [testCase.id, Number(testCase.step_count || 0)]));
  }, [testCasesList]);

  const executionSummaryById = useMemo(() => {
    const summary: Record<string, typeof EMPTY_EXECUTION_SUMMARY> = {};

    latestExecutionResultsList.forEach((result) => {
      summary[result.execution_id] = summary[result.execution_id] || { ...EMPTY_EXECUTION_SUMMARY };
      summary[result.execution_id].total += 1;

      if (result.status === "passed") {
        summary[result.execution_id].passed += 1;
      } else if (result.status === "running") {
        summary[result.execution_id].running += 1;
      } else if (result.status === "failed") {
        summary[result.execution_id].failed += 1;
      } else if (result.status === "blocked") {
        summary[result.execution_id].blocked += 1;
      }
    });

    Object.values(summary).forEach((item) => {
      item.percent = item.total ? Math.round((item.passed / item.total) * 100) : 0;
    });

    return summary;
  }, [latestExecutionResultsList]);

  const mappedRequirementsCount = useMemo(
    () => requirementsList.filter((item) => (item.test_case_ids || []).length).length,
    [requirementsList]
  );

  const requirementCoverage = useMemo(() => {
    if (!requirementsList.length) {
      return 0;
    }

    return Math.round((mappedRequirementsCount / requirementsList.length) * 100);
  }, [mappedRequirementsCount, requirementsList]);

  const casesWithStepsCount = useMemo(
    () => testCasesList.filter((testCase) => (caseStepCountById[testCase.id] || 0) > 0).length,
    [caseStepCountById, testCasesList]
  );

  const designCompleteness = useMemo(() => {
    if (!testCasesList.length) {
      return 0;
    }

    return Math.round((casesWithStepsCount / testCasesList.length) * 100);
  }, [casesWithStepsCount, testCasesList]);

  const automatedCasesCount = useMemo(
    () => testCasesList.filter((testCase) => testCase.automated === "yes").length,
    [testCasesList]
  );

  const automationCoverage = useMemo(() => {
    if (!testCasesList.length) {
      return 0;
    }

    return Math.round((automatedCasesCount / testCasesList.length) * 100);
  }, [automatedCasesCount, testCasesList.length]);

  const automatedExecutions = useMemo(
    () => executionsList.filter((execution) => execution.trigger === "ci" || execution.trigger === "local"),
    [executionsList]
  );
  const automatedExecutionIds = useMemo(() => new Set(automatedExecutions.map((execution) => execution.id)), [automatedExecutions]);
  const automatedLatestResults = useMemo(
    () => latestExecutionResultsList.filter((result) => automatedExecutionIds.has(result.execution_id)),
    [automatedExecutionIds, latestExecutionResultsList]
  );
  const automatedPassRate = useMemo(() => {
    if (!automatedLatestResults.length) return 0;
    return Math.round((automatedLatestResults.filter((result) => result.status === "passed").length / automatedLatestResults.length) * 100);
  }, [automatedLatestResults]);

  const executionStatusCounts = useMemo(() => {
    return executionsList.reduce(
      (counts, execution) => {
        const key = execution.status || "queued";
        counts[key] = (counts[key] || 0) + 1;
        return counts;
      },
      { queued: 0, running: 0, completed: 0, failed: 0, aborted: 0 } as Record<string, number>
    );
  }, [executionsList]);

  const resultStatusCounts = useMemo(() => {
    return latestExecutionResultsList.reduce(
      (counts, result) => {
        counts[result.status] += 1;
        counts.total += 1;
        return counts;
      },
      { running: 0, passed: 0, failed: 0, blocked: 0, total: 0 }
    );
  }, [latestExecutionResultsList]);

  const passRate = useMemo(() => {
    if (!resultStatusCounts.total) {
      return 0;
    }

    return Math.round((resultStatusCounts.passed / resultStatusCounts.total) * 100);
  }, [resultStatusCounts]);

  const latestExecution = useMemo(() => {
    return [...executionsList].sort((left, right) => latestExecutionTimestamp(right) - latestExecutionTimestamp(left))[0] || null;
  }, [executionsList]);

  const latestExecutionSummary = latestExecution ? executionSummaryById[latestExecution.id] || { ...EMPTY_EXECUTION_SUMMARY } : { ...EMPTY_EXECUTION_SUMMARY };
  const latestPassRate = latestExecutionSummary.total ? latestExecutionSummary.percent : passRate;
  const latestFailedSignals = latestExecutionSummary.failed + latestExecutionSummary.blocked;

  const releaseRiskPenalty = Math.min(18, (latestFailedSignals * 3) + (executionStatusCounts.failed * 2));
  const releaseReadinessScore = useMemo(
    () => Math.max(0, Math.round((requirementCoverage * 0.35) + (designCompleteness * 0.25) + (latestPassRate * 0.4)) - releaseRiskPenalty),
    [designCompleteness, latestPassRate, releaseRiskPenalty, requirementCoverage]
  );

  const readinessTone = resolveScoreTone(releaseReadinessScore);
  const readinessRingStyle = {
    background: `conic-gradient(${scoreAccent(readinessTone)} 0 ${releaseReadinessScore}%, rgba(18, 40, 75, 0.08) ${releaseReadinessScore}% 100%)`
  };

  const readinessLabel = useMemo(() => {
    if (releaseReadinessScore >= 85) {
      return "Ready for release review";
    }

    if (releaseReadinessScore >= 65) {
      return "Quality hardening in progress";
    }

    if (releaseReadinessScore >= 45) {
      return "Needs focused follow-up";
    }

    return "Too much release risk";
  }, [releaseReadinessScore]);

  const readinessNarrative = useMemo(() => {
    if (!projectsList.length && !requirementsList.length && !testCasesList.length) {
      return "Start by defining release scope, shaping reusable suites, and capturing the first run signal.";
    }

    if (releaseReadinessScore >= 85) {
      return "Coverage depth, execution-ready test design, and recent release evidence are strong enough for confident product conversations.";
    }

    if (releaseReadinessScore >= 65) {
      return "The release picture is taking shape, but a few design and run gaps still stand between status reporting and confidence.";
    }

    return "The product story is still missing enough coverage or run evidence that the dashboard should drive action before release calls.";
  }, [projectsList.length, releaseReadinessScore, requirementsList.length, testCasesList.length]);

  const coverageGaps = useMemo(() => {
    return requirementsList
      .filter((item) => !(item.test_case_ids || []).length)
      .sort((left, right) => (left.priority ?? 3) - (right.priority ?? 3) || left.title.localeCompare(right.title))
      .slice(0, 6);
  }, [requirementsList]);
  const coverageGapCount = Math.max(requirementsList.length - mappedRequirementsCount, 0);

  const casesWithoutSteps = useMemo(() => {
    return testCasesList
      .filter((testCase) => !(caseStepCountById[testCase.id] || 0))
      .sort((left, right) => (left.priority ?? 3) - (right.priority ?? 3) || left.title.localeCompare(right.title))
      .slice(0, 6);
  }, [caseStepCountById, testCasesList]);
  const casesMissingStepsCount = Math.max(testCasesList.length - casesWithStepsCount, 0);

  const recentExecutions = useMemo(() => {
    return [...executionsList]
      .sort((left, right) => latestExecutionTimestamp(right) - latestExecutionTimestamp(left))
      .slice(0, 6)
      .map((execution) => ({
        ...execution,
        summary: executionSummaryById[execution.id] || { ...EMPTY_EXECUTION_SUMMARY },
        projectName: projectsList.find((project) => project.id === execution.project_id)?.name || execution.project_id,
        appTypeName: appTypesList.find((appType) => appType.id === execution.app_type_id)?.name || "Shared scope"
      }));
  }, [appTypesList, executionSummaryById, executionsList, projectsList]);

  const quickActions = useMemo(() => {
    return [
      {
        id: "coverage",
        title: "Close coverage gaps",
        detail: "Map missing requirements to reusable cases or AI-assisted drafts before the next review.",
        meta: `${coverageGapCount} uncovered requirement${coverageGapCount === 1 ? "" : "s"}`,
        to: "/requirements",
        tone: coverageGapCount ? "error" as const : "success" as const
      },
      {
        id: "design",
        title: "Shape suite flows",
        detail: "Curate release-ready suite structure, ordering, and reuse in the suite studio.",
        meta: `${suitesList.length} suite${suitesList.length === 1 ? "" : "s"} live`,
        to: "/design",
        tone: suitesList.length ? "info" as const : "neutral" as const
      },
      {
        id: "test-design",
        title: "Complete test design",
        detail: "Add steps and expected results so reusable cases are ready to execute and produce meaningful evidence.",
        meta: `${casesMissingStepsCount} case${casesMissingStepsCount === 1 ? "" : "s"} missing steps`,
        to: "/test-cases",
        tone: casesMissingStepsCount ? "info" as const : "success" as const
      },
      ...(canViewAutomationAnalytics ? [{
        id: "automation",
        title: "Expand automation reach",
        detail: "Prioritize stable, repeatable cases that can reduce manual execution effort without weakening review controls.",
        meta: `${Math.max(testCasesList.length - automatedCasesCount, 0)} automation candidate${testCasesList.length - automatedCasesCount === 1 ? "" : "s"}`,
        to: "/automation",
        tone: automationCoverage >= 70 ? "success" as const : "info" as const
      }] : []),
      {
        id: "executions",
        title: "Run release checks",
        detail: "Open Test Runs to triage failed runs, monitor active checks, and capture new evidence.",
        meta: `${executionStatusCounts.running} running · ${executionStatusCounts.failed} failed`,
        to: "/executions",
        tone: executionStatusCounts.failed ? "error" as const : executionStatusCounts.running ? "info" as const : "success" as const
      }
    ];
  }, [automatedCasesCount, automationCoverage, canViewAutomationAnalytics, casesMissingStepsCount, coverageGapCount, executionStatusCounts.failed, executionStatusCounts.running, suitesList.length, testCasesList.length]);
  const visibleQuickActions = useMemo(
    () => quickActions.filter((action) => canAccessPath(session, action.to)),
    [quickActions, session]
  );

  const workspacePillars = useMemo(() => {
    return [
      {
        id: "scope",
        eyebrow: "Scope map",
        value: compactNumberFormatter.format(requirementsList.length),
        title: "Requirements and app surfaces stay anchored to active product scope.",
        description: "Projects, app types, and mapped requirements define the QA surface the rest of the workspace builds on.",
        tone: requirementCoverage >= 80 ? "success" as const : requirementsList.length ? "info" as const : "neutral" as const,
        chipLabel: `${requirementCoverage}% mapped`,
        stats: [
          `${projectsList.length} project${projectsList.length === 1 ? "" : "s"}`,
          `${appTypesList.length} app type${appTypesList.length === 1 ? "" : "s"}`,
          `${coverageGapCount} uncovered`
        ]
      },
      {
        id: "design",
        eyebrow: "Reusable design",
        value: compactNumberFormatter.format(testCasesList.length),
        title: "Suites, cases, and executable steps are turning scope into reusable assets.",
        description: "This is where QAira is strongest today: reusable cases, suite structure, and run-ready authoring.",
        tone: designCompleteness >= 70 ? "success" as const : testCasesList.length ? "info" as const : "neutral" as const,
        chipLabel: `${designCompleteness}% run ready`,
        stats: [
          `${suitesList.length} suite${suitesList.length === 1 ? "" : "s"}`,
          `${casesWithStepsCount} with steps`,
          `${casesMissingStepsCount} to finish`
        ]
      },
      {
        id: "execution",
        eyebrow: "Run evidence",
        value: compactNumberFormatter.format(executionsList.length),
        title: "Run history, pass rate, and hotspots show where release confidence is real or still weak.",
        description: "Runs and result signals turn reusable design work into something product and engineering can act on.",
        tone: resultStatusCounts.failed ? "error" as const : passRate >= 80 ? "success" as const : "info" as const,
        chipLabel: `${passRate}% pass rate`,
        stats: [
          `${resultStatusCounts.running} active`,
          `${resultStatusCounts.failed} failed`,
          `${resultStatusCounts.blocked} blocked`
        ]
      }
    ];
  }, [
    appTypesList.length,
    designCompleteness,
    casesMissingStepsCount,
    casesWithStepsCount,
    coverageGapCount,
    executionStatusCounts.running,
    executionsList.length,
    passRate,
    projectsList.length,
    requirementCoverage,
    requirementsList.length,
    resultStatusCounts.blocked,
    resultStatusCounts.failed,
    resultStatusCounts.running,
    suitesList.length,
    testCasesList.length
  ]);

  const attentionQueue = useMemo(() => {
    const failedExecutions = recentExecutions
      .filter((execution) => execution.status === "failed")
      .slice(0, 2)
      .map((execution) => ({
        id: `execution-${execution.id}`,
        title: execution.name || "Unnamed run",
        detail: `${execution.projectName} release check ended failed and needs triage in the execution hub.`,
        label: "Investigate run",
        tone: "error" as const,
        to: `/executions?execution=${execution.id}`
      }));

    const requirementItems = coverageGaps.slice(0, 3).map((requirement) => ({
      id: `requirement-${requirement.id}`,
      title: requirement.title,
      detail: `Priority P${requirement.priority ?? 3} requirement still has no reusable test coverage attached.`,
      label: "Design coverage",
      tone: (requirement.priority ?? 3) <= 2 ? "error" as const : "info" as const,
      to: "/requirements"
    }));

    const designItems = casesWithoutSteps.slice(0, 2).map((testCase) => ({
      id: `case-${testCase.id}`,
      title: testCase.title,
      detail: "Reusable case exists, but it still needs steps and expected results before it can produce reliable run evidence.",
      label: "Add steps",
      tone: "info" as const,
      to: "/test-cases"
    }));

    return [...failedExecutions, ...requirementItems, ...designItems].slice(0, 6);
  }, [casesWithoutSteps, coverageGaps, recentExecutions]);

  const releaseLanes = useMemo(() => {
    return appTypesList
      .map((appType) => {
        const scopedCases = testCasesList.filter((testCase) => testCase.app_type_id === appType.id);
        const scopedSuites = suitesList.filter((suite) => suite.app_type_id === appType.id);
        const scopedResults = latestExecutionResultsList.filter((result) => result.app_type_id === appType.id);
        const executableCases = scopedCases.filter((testCase) => (caseStepCountById[testCase.id] || 0) > 0).length;
        const passedCount = scopedResults.filter((result) => result.status === "passed").length;
        const failedCount = scopedResults.filter((result) => result.status === "failed").length;
        const runningCount = scopedResults.filter((result) => result.status === "running").length;
        const blockedCount = scopedResults.filter((result) => result.status === "blocked").length;
        const designScore = scopedCases.length ? Math.round((executableCases / scopedCases.length) * 100) : 0;
        const qualityScore = scopedResults.length ? Math.round((passedCount / scopedResults.length) * 100) : 0;
        const releaseScore = Math.round((designScore * 0.4) + (qualityScore * 0.6));
        const failedSignals = failedCount + blockedCount;

        let label = "No release signal";
        let tone: DashboardTone = "neutral";
        let destination = "/design";

        if (failedSignals) {
          label = "At risk";
          tone = "error";
          destination = "/executions";
        } else if (!scopedCases.length) {
          label = "No design yet";
          tone = "neutral";
        } else if (designScore < 60) {
          label = "Complete design";
          tone = "info";
          destination = "/test-cases";
        } else if (qualityScore >= 80) {
          label = "Stable";
          tone = "success";
          destination = "/executions";
        } else if (qualityScore > 0) {
          label = "Needs hardening";
          tone = "info";
          destination = "/executions";
        } else if (runningCount) {
          label = "In progress";
          tone = "info";
          destination = "/executions";
        }

        return {
          id: appType.id,
          name: appType.name,
          projectName: projectsList.find((project) => project.id === appType.project_id)?.name || "Unknown product",
          type: appType.type,
          cases: scopedCases.length,
          suites: scopedSuites.length,
          executableCases,
          failedSignals,
          releaseScore,
          qualityScore,
          designScore,
          label,
          tone,
          destination
        };
      })
      .sort((left, right) => {
        if (left.failedSignals !== right.failedSignals) {
          return right.failedSignals - left.failedSignals;
        }

        return left.releaseScore - right.releaseScore;
      })
      .slice(0, 6);
  }, [appTypesList, caseStepCountById, latestExecutionResultsList, projectsList, suitesList, testCasesList]);

  const riskHotspots = useMemo(() => {
    const aggregated = latestExecutionResultsList
      .filter((result) => result.status === "failed" || result.status === "blocked")
      .reduce<Record<string, {
        id: string;
        title: string;
        detail: string;
        count: number;
        status: "failed" | "blocked";
        executionId: string;
      }>>((items, result) => {
        const key = result.test_case_id;
        const current = items[key];
        const detail = result.error || result.suite_name || "Run instability needs follow-up.";

        if (!current) {
          items[key] = {
            id: key,
            title: result.test_case_title || result.test_case_id,
            detail,
            count: 1,
            status: result.status === "failed" ? "failed" : "blocked",
            executionId: result.execution_id
          };
          return items;
        }

        current.count += 1;
        current.detail = detail;
        current.status = current.status === "failed" || result.status === "failed" ? "failed" : "blocked";
        current.executionId = result.execution_id;
        return items;
      }, {});

    return Object.values(aggregated)
      .sort((left, right) => right.count - left.count || left.title.localeCompare(right.title))
      .slice(0, 6);
  }, [latestExecutionResultsList]);

  const activitySeries = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
      return {
        key: `${date.getFullYear()}-${date.getMonth()}`,
        label: monthFormatter.format(date),
        total: 0
      };
    });

    latestExecutionResultsList.forEach((result) => {
      const createdAt = result.created_at ? new Date(result.created_at) : null;

      if (!createdAt || Number.isNaN(createdAt.getTime())) {
        return;
      }

      const key = `${createdAt.getFullYear()}-${createdAt.getMonth()}`;
      const month = months.find((item) => item.key === key);

      if (month) {
        month.total += 1;
      }
    });

    const peak = Math.max(...months.map((item) => item.total), 1);

    return months.map((item) => ({
      ...item,
      height: Math.max(14, Math.round((item.total / peak) * 100))
    }));
  }, [latestExecutionResultsList]);

  const hasActivityData = activitySeries.some((item) => item.total > 0);

  const funnelMetrics = useMemo(() => {
    return [
      {
        id: "requirements",
        label: "Requirements",
        value: requirementsList.length,
        detail: "Product scope tracked in QAira",
        chipLabel: "Scope",
        tone: "neutral" as const
      },
      {
        id: "covered",
        label: "Covered",
        value: mappedRequirementsCount,
        detail: `${requirementCoverage}% linked to reusable cases`,
        chipLabel: requirementCoverage >= 80 ? "Healthy" : "Growing",
        tone: requirementCoverage >= 80 ? "success" as const : "info" as const
      },
      {
        id: "suites",
        label: "Suites",
        value: suitesList.length,
        detail: "Reusable test flow groups",
        chipLabel: suitesList.length ? "Reusable" : "Needed",
        tone: suitesList.length ? "info" as const : "neutral" as const
      },
      {
        id: "cases",
        label: "Cases",
        value: testCasesList.length,
        detail: "Reusable quality assets available",
        chipLabel: testCasesList.length ? "Ready" : "Empty",
        tone: testCasesList.length ? "info" as const : "neutral" as const
      },
      {
        id: "executable",
        label: "Executable",
        value: casesWithStepsCount,
        detail: `${designCompleteness}% have executable steps`,
        chipLabel: designCompleteness >= 70 ? "Run ready" : "Build out",
        tone: designCompleteness >= 70 ? "success" as const : "info" as const
      },
      {
        id: "evidence",
        label: "Evidence",
        value: latestExecutionResultsList.length,
        detail: "Captured run signals",
        chipLabel: latestExecutionResultsList.length ? "Observed" : "Pending",
        tone: latestExecutionResultsList.length ? "success" as const : "neutral" as const
      }
    ];
  }, [casesWithStepsCount, designCompleteness, latestExecutionResultsList.length, mappedRequirementsCount, requirementCoverage, requirementsList.length, suitesList.length, testCasesList.length]);

  const commandSignals = useMemo(() => {
    return [
      {
        label: "Requirement coverage",
        value: requirementCoverage,
        detail: `${mappedRequirementsCount}/${requirementsList.length || 0} mapped to reusable cases`,
        tone: requirementCoverage >= 80 ? "success" as const : "info" as const
      },
      {
        label: "Design completeness",
        value: designCompleteness,
        detail: `${casesWithStepsCount}/${testCasesList.length || 0} cases have executable steps`,
        tone: designCompleteness >= 70 ? "success" as const : "info" as const
      },
      {
        label: "Run confidence",
        value: passRate,
        detail: `${resultStatusCounts.failed} failed · ${resultStatusCounts.blocked} blocked · ${resultStatusCounts.running} running`,
        tone: resultStatusCounts.failed ? "danger" as const : passRate >= 80 ? "success" as const : "info" as const
      }
    ];
  }, [casesWithStepsCount, designCompleteness, mappedRequirementsCount, passRate, requirementCoverage, requirementsList.length, resultStatusCounts.blocked, resultStatusCounts.failed, resultStatusCounts.running, testCasesList.length]);

  const topRecommendation = useMemo(() => {
    if (coverageGaps.length) {
      return `${coverageGapCount} requirement${coverageGapCount === 1 ? "" : "s"} still need reusable coverage before this dashboard becomes release-grade.`;
    }

    if (casesMissingStepsCount) {
      return `${casesMissingStepsCount} reusable case${casesMissingStepsCount === 1 ? "" : "s"} still need steps before they can produce execution evidence.`;
    }

    if (resultStatusCounts.failed || resultStatusCounts.blocked) {
      return `${resultStatusCounts.failed + resultStatusCounts.blocked} unstable execution signal${resultStatusCounts.failed + resultStatusCounts.blocked === 1 ? "" : "s"} still need triage.`;
    }

    if (resultStatusCounts.running) {
      return `${resultStatusCounts.running} execution signal${resultStatusCounts.running === 1 ? " is" : "s are"} actively running through the queue right now.`;
    }

    return "No critical blockers are dominating the board. The quality conversation can move from firefighting to planning.";
  }, [casesMissingStepsCount, coverageGapCount, resultStatusCounts.blocked, resultStatusCounts.failed, resultStatusCounts.running]);

  const openRiskCount = coverageGapCount + casesMissingStepsCount + resultStatusCounts.failed + resultStatusCounts.blocked + executionStatusCounts.failed;
  const releaseBlockerCount = resultStatusCounts.failed + resultStatusCounts.blocked + executionStatusCounts.failed;
  const releaseStateLabel = releaseReadinessScore >= 85 ? "Release Ready" : releaseReadinessScore >= 65 ? "Needs Hardening" : "At Risk";
  const releaseHeadline = releaseReadinessScore >= 85
    ? "Ready for release review"
    : releaseReadinessScore >= 65
      ? "Production readiness needs hardening"
      : "Not ready for production";
  const healthMeterStyle = (value: number) => ({ width: `${Math.max(0, Math.min(100, value))}%` });
  const releaseRingStyle = { "--score": releaseReadinessScore } as CSSProperties;
  const canViewQualityInsights = hasPermission(session, "quality_insight.view")
    && areFeatureFlagsEnabled(featureFlagsQuery.data, ["qaira.ai.quality_insights"]);
  const qualityInsightFindings = useMemo<AiPreviewFinding[]>(
    () => (qualityInsightPreview.data?.insights || []).map((insight) => ({
      id: insight.id,
      title: insight.title,
      severity: insight.severity,
      description: insight.explanation,
      action: insight.recommended_action,
      meta: `${insight.evidence.length} Jira record${insight.evidence.length === 1 ? "" : "s"} in this signal`,
      evidence: insight.evidence.map((item) => item.display_id || item.id).filter(Boolean)
    })),
    [qualityInsightPreview.data]
  );

  const openQualityInsightPreview = () => {
    setIsQualityInsightPreviewOpen(true);
    qualityInsightPreview.reset();
    if (activeProjectId) {
      qualityInsightPreview.mutate(String(activeProjectId));
    }
  };

  const metricEvidence = useMemo<Record<string, MetricEvidence>>(() => ({
    readiness: {
      id: "readiness",
      category: "Release decision",
      title: "Why this release posture?",
      value: `${releaseReadinessScore}%`,
      verdict: releaseHeadline,
      explanation: "Readiness combines coverage, design completeness, and recent execution confidence. Failed or blocked evidence lowers the score; automation adoption does not raise it.",
      calculation: `35% traceability + 25% design completeness + 40% latest pass confidence − ${releaseRiskPenalty} point blocker penalty`,
      signals: [
        { label: "Requirement traceability", value: `${requirementCoverage}%`, detail: `${mappedRequirementsCount} of ${requirementsList.length} requirements have linked cases.`, tone: requirementCoverage >= 80 ? "success" : "info" },
        { label: "Design completeness", value: `${designCompleteness}%`, detail: `${casesWithStepsCount} of ${testCasesList.length} cases contain executable steps.`, tone: designCompleteness >= 70 ? "success" : "info" },
        { label: "Latest pass confidence", value: `${latestPassRate}%`, detail: latestExecutionSummary.total ? `${latestExecutionSummary.total} results in the latest run.` : "Using the latest result per run and case.", tone: latestPassRate >= 80 ? "success" : latestFailedSignals ? "error" : "neutral" },
        { label: "Blocker penalty", value: `−${releaseRiskPenalty}`, detail: `${latestFailedSignals} latest failed/blocked results and ${executionStatusCounts.failed} failed runs.`, tone: releaseRiskPenalty ? "error" : "success" }
      ],
      actions: [
        coverageGapCount ? `Link test coverage to ${coverageGapCount} uncovered requirement${coverageGapCount === 1 ? "" : "s"}.` : "Keep requirement-to-test links current as scope changes.",
        casesMissingStepsCount ? `Complete steps for ${casesMissingStepsCount} unfinished test design${casesMissingStepsCount === 1 ? "" : "s"}.` : "Preserve executable test design as cases evolve.",
        releaseBlockerCount ? `Triage ${releaseBlockerCount} failed or blocked release signal${releaseBlockerCount === 1 ? "" : "s"}.` : "Review the evidence with the release owner before the final decision."
      ]
    },
    requirements: {
      id: "requirements",
      category: "Traceability metric",
      title: "Requirement coverage",
      value: `${requirementCoverage}%`,
      verdict: requirementCoverage >= 80 ? "Scope is broadly traceable" : "Scope has material evidence gaps",
      explanation: "This indicates how much tracked product scope has at least one linked reusable test case. It measures linkage, not test quality or execution success.",
      calculation: `${mappedRequirementsCount} linked requirements ÷ ${requirementsList.length || 0} tracked requirements`,
      signals: [
        { label: "Linked", value: String(mappedRequirementsCount), detail: "Requirements with one or more test case links.", tone: "success" },
        { label: "Uncovered", value: String(coverageGapCount), detail: "Requirements with no linked reusable test case.", tone: coverageGapCount ? "error" : "success" }
      ],
      actions: [coverageGapCount ? "Start with uncovered P1/P2 scope, then attach reusable cases or create a reviewed draft." : "Audit links when stories, releases, or sprints change."]
    },
    design: {
      id: "design",
      category: "Test design metric",
      title: "Design completeness",
      value: `${designCompleteness}%`,
      verdict: designCompleteness >= 70 ? "Most cases can produce run evidence" : "Too many cases are not execution-ready",
      explanation: "This measures whether reusable cases contain steps. It is intentionally separate from automation coverage: a manual case with strong steps can still provide valid evidence.",
      calculation: `${casesWithStepsCount} cases with steps ÷ ${testCasesList.length || 0} total cases`,
      signals: [
        { label: "Run ready", value: String(casesWithStepsCount), detail: "Cases with one or more steps.", tone: "success" },
        { label: "Incomplete", value: String(casesMissingStepsCount), detail: "Cases that cannot yet produce step-level evidence.", tone: casesMissingStepsCount ? "info" : "success" }
      ],
      actions: [casesMissingStepsCount ? "Add focused steps and expected outcomes to the highest-priority incomplete cases." : "Review step quality and remove obsolete or duplicate cases."]
    },
    passRate: {
      id: "passRate",
      category: "Execution metric",
      title: "Latest pass confidence",
      value: `${latestPassRate}%`,
      verdict: latestFailedSignals ? "Recent evidence contains unstable results" : latestPassRate >= 80 ? "Recent execution evidence is healthy" : "More current evidence is needed",
      explanation: "The latest run is used when available so older passing history cannot mask a current regression. Without a latest run, the dashboard falls back to the latest result per run and case.",
      calculation: `${latestExecutionSummary.total ? latestExecutionSummary.passed : resultStatusCounts.passed} passed ÷ ${latestExecutionSummary.total || resultStatusCounts.total || 0} evaluated results`,
      signals: [
        { label: "Passed", value: String(latestExecutionSummary.total ? latestExecutionSummary.passed : resultStatusCounts.passed), detail: "Passing results in the active evidence window.", tone: "success" },
        { label: "Failed", value: String(latestExecutionSummary.total ? latestExecutionSummary.failed : resultStatusCounts.failed), detail: "Results requiring defect or regression triage.", tone: (latestExecutionSummary.total ? latestExecutionSummary.failed : resultStatusCounts.failed) ? "error" : "success" },
        { label: "Blocked", value: String(latestExecutionSummary.total ? latestExecutionSummary.blocked : resultStatusCounts.blocked), detail: "Results without a conclusive test outcome.", tone: (latestExecutionSummary.total ? latestExecutionSummary.blocked : resultStatusCounts.blocked) ? "info" : "success" }
      ],
      actions: [latestFailedSignals ? "Open the latest release check and triage failed and blocked results before relying on the score." : "Keep the evidence window current with a release-scoped run."]
    },
    risks: {
      id: "risks",
      category: "Risk metric",
      title: "Open quality risks",
      value: String(openRiskCount),
      verdict: releaseBlockerCount ? "Release-blocking evidence needs attention" : openRiskCount ? "Design and traceability debt remains" : "No dominant quality risk is visible",
      explanation: "This is an action count across uncovered requirements, incomplete test design, failed or blocked results, and failed runs. It is not a count of unique Jira issues.",
      calculation: `${coverageGapCount} coverage gaps + ${casesMissingStepsCount} design gaps + ${resultStatusCounts.failed} failed results + ${resultStatusCounts.blocked} blocked results + ${executionStatusCounts.failed} failed runs`,
      signals: [
        { label: "Coverage gaps", value: String(coverageGapCount), detail: "Tracked requirements without linked cases.", tone: coverageGapCount ? "info" : "success" },
        { label: "Design gaps", value: String(casesMissingStepsCount), detail: "Cases without executable steps.", tone: casesMissingStepsCount ? "info" : "success" },
        { label: "Release blockers", value: String(releaseBlockerCount), detail: "Failed/blocked results plus failed runs.", tone: releaseBlockerCount ? "error" : "success" }
      ],
      actions: [releaseBlockerCount ? "Triage execution blockers first, then close traceability and design gaps." : "Prioritize the highest-impact coverage or design gap in the attention queue."]
    },
    automation: {
      id: "automation",
      category: "Automation capability",
      title: "Automation coverage",
      value: `${automationCoverage}%`,
      verdict: automationCoverage >= 70 ? "Automation reaches most reusable cases" : "Automation reach is still selective",
      explanation: "Automation coverage measures operational leverage. It is permission- and feature-gated and does not contribute to the release-readiness score.",
      calculation: `${automatedCasesCount} automated cases ÷ ${testCasesList.length || 0} total cases`,
      signals: [
        { label: "Automated cases", value: String(automatedCasesCount), detail: "Cases explicitly marked automated.", tone: automationCoverage >= 70 ? "success" : "info" },
        { label: "Automated runs", value: String(automatedExecutions.length), detail: "Runs triggered through CI or the local automation agent.", tone: automatedExecutions.length ? "success" : "neutral" },
        { label: "Automated pass rate", value: `${automatedPassRate}%`, detail: `${automatedLatestResults.length} latest automated result${automatedLatestResults.length === 1 ? "" : "s"}.`, tone: automatedPassRate >= 80 ? "success" : automatedLatestResults.length ? "error" : "neutral" }
      ],
      actions: ["Automate stable, repeatable cases with clear assertions first; keep human review for release decisions."]
    }
  }), [automatedCasesCount, automatedExecutions.length, automatedLatestResults.length, automatedPassRate, automationCoverage, casesMissingStepsCount, casesWithStepsCount, coverageGapCount, designCompleteness, executionStatusCounts.failed, latestExecutionSummary.blocked, latestExecutionSummary.failed, latestExecutionSummary.passed, latestExecutionSummary.total, latestFailedSignals, latestPassRate, mappedRequirementsCount, openRiskCount, releaseBlockerCount, releaseHeadline, releaseReadinessScore, releaseRiskPenalty, requirementCoverage, requirementsList.length, resultStatusCounts.blocked, resultStatusCounts.failed, resultStatusCounts.passed, resultStatusCounts.total, testCasesList.length]);

  const layoutStorageKey = `qaira-ui.analytics-layout.v1:${activeProjectId || "unselected"}`;
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(layoutStorageKey);
      setAnalyticsLayout(stored ? normalizeAnalyticsLayout(JSON.parse(stored)) : DEFAULT_ANALYTICS_LAYOUT);
    } catch {
      setAnalyticsLayout(DEFAULT_ANALYTICS_LAYOUT);
    }
  }, [layoutStorageKey]);

  const commitAnalyticsLayout = (next: AnalyticsLayout) => {
    const normalized = normalizeAnalyticsLayout(next);
    setAnalyticsLayout(normalized);
    try {
      window.localStorage.setItem(layoutStorageKey, JSON.stringify(normalized));
    } catch {
      // Browser storage is an optional personalization layer; analytics remains usable without it.
    }
  };
  const moveAnalyticsSection = (id: AnalyticsSectionId, direction: -1 | 1) => {
    const index = analyticsLayout.order.indexOf(id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= analyticsLayout.order.length) return;
    const order = [...analyticsLayout.order];
    [order[index], order[target]] = [order[target], order[index]];
    commitAnalyticsLayout({ ...analyticsLayout, order });
  };
  const toggleAnalyticsSection = (id: AnalyticsSectionId) => {
    const isHidden = analyticsLayout.hidden.includes(id);
    const availableIds = analyticsLayout.order.filter((sectionId) => sectionId !== "automation" || canViewAutomationAnalytics);
    const visibleCount = availableIds.filter((sectionId) => !analyticsLayout.hidden.includes(sectionId)).length;
    if (!isHidden && visibleCount <= 1) return;
    commitAnalyticsLayout({
      ...analyticsLayout,
      hidden: isHidden ? analyticsLayout.hidden.filter((sectionId) => sectionId !== id) : [...analyticsLayout.hidden, id]
    });
  };
  const sectionDefinition = (id: AnalyticsSectionId) => ANALYTICS_SECTIONS.find((section) => section.id === id) as typeof ANALYTICS_SECTIONS[number];
  const sectionOrder = (id: AnalyticsSectionId) => analyticsLayout.order.indexOf(id);
  const sectionVisible = (id: AnalyticsSectionId) => !analyticsLayout.hidden.includes(id) && (id !== "automation" || canViewAutomationAnalytics);

  return (
    <div className="page-content page-content--overview overview-layout">
      <header className="page-header card overview-hero">
        <div className="page-header-text">
          <span className="eyebrow">Decision intelligence</span>
          <h1 className="page-header-title">Quality analytics</h1>
          <p className="page-description">
            {selectedProject?.name || "Select a project"} · Evidence-led release posture, traceability, test design, execution confidence, and prioritized quality risk.
          </p>
        </div>
        <div className="page-actions">
          <button className="ghost-button analytics-personalize-button" onClick={() => setIsLayoutDialogOpen(true)} type="button">
            <ColumnsIcon />
            <span>Personalize view</span>
          </button>
        </div>
      </header>

      <div className="quality-analytics-sections">
      {sectionVisible("decision") ? (
        <AnalyticsSection
          description={sectionDefinition("decision").description}
          eyebrow={sectionDefinition("decision").category}
          id="decision"
          order={sectionOrder("decision")}
          title={sectionDefinition("decision").title}
        >
      <div className="health-grid" aria-label="Project health overview">
        <button aria-haspopup="dialog" className="health-card release-card metric-evidence-trigger" onClick={() => setSelectedMetricEvidence(metricEvidence.readiness)} type="button">
          <div className="health-card-head">
            <span>Release Readiness</span>
            <b className={releaseReadinessScore >= 85 ? "risk-dot success" : releaseReadinessScore >= 65 ? "risk-dot warning" : "risk-dot"} />
          </div>
          <div className="release-score">
            <div className="score-ring" style={releaseRingStyle}>
              <strong>{releaseReadinessScore}%</strong>
              <span>{releaseStateLabel}</span>
            </div>
            <div>
              <h2>{releaseHeadline}</h2>
              <p>{readinessNarrative}</p>
            </div>
          </div>
          <span className="metric-evidence-hint">View evidence</span>
        </button>

        <button aria-haspopup="dialog" className="stat-card metric-evidence-trigger" onClick={() => setSelectedMetricEvidence(metricEvidence.requirements)} type="button">
          <span>Requirement Coverage</span>
          <strong>{requirementCoverage}%</strong>
          <small>{mappedRequirementsCount} / {requirementsList.length || 0} mapped</small>
          <i className="meter"><em style={healthMeterStyle(requirementCoverage)} /></i>
          <span className="metric-evidence-hint">Why this value?</span>
        </button>

        <button aria-haspopup="dialog" className="stat-card info metric-evidence-trigger" onClick={() => setSelectedMetricEvidence(metricEvidence.design)} type="button">
          <span>Design Completeness</span>
          <strong>{designCompleteness}%</strong>
          <small>{casesWithStepsCount} / {testCasesList.length || 0} cases with steps</small>
          <i className="meter"><em style={healthMeterStyle(designCompleteness)} /></i>
          <span className="metric-evidence-hint">Why this matters?</span>
        </button>

        <button aria-haspopup="dialog" className="stat-card danger metric-evidence-trigger" onClick={() => setSelectedMetricEvidence(metricEvidence.passRate)} type="button">
          <span>Latest Pass Rate</span>
          <strong>{latestPassRate}%</strong>
          <small>{latestFailedSignals} failed or blocked test{latestFailedSignals === 1 ? "" : "s"}</small>
          <i className="meter danger"><em style={healthMeterStyle(latestPassRate)} /></i>
          <span className="metric-evidence-hint">View evidence</span>
        </button>

        <button aria-haspopup="dialog" className="stat-card warning metric-evidence-trigger" onClick={() => setSelectedMetricEvidence(metricEvidence.risks)} type="button">
          <span>Open Risks</span>
          <strong>{openRiskCount}</strong>
          <small>{releaseBlockerCount} release blocker{releaseBlockerCount === 1 ? "" : "s"}</small>
          <i className="meter warning"><em style={healthMeterStyle(Math.min(100, openRiskCount ? 35 + openRiskCount * 6 : 8))} /></i>
          <span className="metric-evidence-hint">See risk drivers</span>
        </button>
      </div>
        </AnalyticsSection>
      ) : null}

      {sectionVisible("signals") ? (
        <AnalyticsSection
          description={sectionDefinition("signals").description}
          eyebrow={sectionDefinition("signals").category}
          id="signals"
          order={sectionOrder("signals")}
          title={sectionDefinition("signals").title}
        >
      <div className="dashboard-hero-grid">
        <Panel
          className="dashboard-command-panel"
          title="Workspace quality snapshot"
          subtitle="A grounded read on the current QAira workspace across scope traceability, executable design, and result evidence."
        >
          <div className="dashboard-command-shell">
            <div className="dashboard-command-copy">
              <p className="dashboard-command-summary">{readinessNarrative}</p>
              <div className="dashboard-chip-row">
                <DashboardToneChip label={readinessLabel} tone={readinessTone} />
                <span className="dashboard-context-chip">{executionStatusCounts.running} active release check{executionStatusCounts.running === 1 ? "" : "s"}</span>
                <span className="dashboard-context-chip">{coverageGapCount} coverage gap{coverageGapCount === 1 ? "" : "s"}</span>
              </div>
            </div>

            <div className="dashboard-score-ring" style={readinessRingStyle}>
              <div className="dashboard-score-core">
                <span>Readiness</span>
                <strong>{releaseReadinessScore}%</strong>
                <small>release score</small>
              </div>
            </div>
          </div>

          <div className="dashboard-signal-list">
            {commandSignals.map((signal) => (
              <div className="dashboard-signal-card" key={signal.label}>
                <ProgressMeter detail={signal.detail} label={signal.label} tone={signal.tone} value={signal.value} />
              </div>
            ))}
          </div>

          <div className="detail-summary dashboard-command-footer">
            <strong>Top recommendation</strong>
            <span>{topRecommendation}</span>
            {canViewQualityInsights ? (
              <button className="ghost-button compact" disabled={!activeProjectId || qualityInsightPreview.isPending} onClick={openQualityInsightPreview} type="button">
                <SparkIcon />
                <span>{qualityInsightPreview.isPending ? "Reviewing…" : "Explain quality signals"}</span>
              </button>
            ) : null}
          </div>
        </Panel>

        <Panel
          className="dashboard-action-panel"
          title="Recommended next moves"
          subtitle="The actions most likely to improve coverage quality, execution confidence, or day-to-day workspace hygiene."
        >
          <div className="dashboard-action-grid">
            {visibleQuickActions.map((action) => (
              <button
                className="dashboard-action-card"
                key={action.id}
                onClick={() => navigate(action.to)}
                type="button"
              >
                <div className="dashboard-action-copy">
                  <span className="dashboard-action-meta">{action.meta}</span>
                  <strong>{action.title}</strong>
                  <span>{action.detail}</span>
                </div>
                <div className="dashboard-action-footer">
                  <DashboardToneChip label="Open" tone={action.tone} />
                  <span className="dashboard-action-link">Go</span>
                </div>
              </button>
            ))}
            {!visibleQuickActions.length ? <div className="empty-state compact">No recommended actions are available for your current permissions.</div> : null}
          </div>
        </Panel>
      </div>

      <div className="dashboard-pillar-grid">
        {workspacePillars.map((pillar) => (
          <div className="dashboard-pillar-card" key={pillar.id}>
            <div className="dashboard-pillar-head">
              <span className="dashboard-funnel-label">{pillar.eyebrow}</span>
              <DashboardToneChip label={pillar.chipLabel} tone={pillar.tone} />
            </div>
            <strong>{pillar.value}</strong>
            <span className="dashboard-pillar-title">{pillar.title}</span>
            <p>{pillar.description}</p>
            <div className="dashboard-pillar-stats">
              {pillar.stats.map((stat) => (
                <span className="dashboard-pillar-stat" key={stat}>{stat}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
        </AnalyticsSection>
      ) : null}

      {sectionVisible("delivery") ? (
        <AnalyticsSection
          description={sectionDefinition("delivery").description}
          eyebrow={sectionDefinition("delivery").category}
          id="delivery"
          order={sectionOrder("delivery")}
          title={sectionDefinition("delivery").title}
        >
      <div className="two-column-grid">
        <Panel title="Release lanes" subtitle="App types where scope, reusable cases, suites, and run health come together into a real delivery lane.">
          <div className="stack-list">
            {releaseLanes.map((lane) => (
              <button
                className="stack-item stack-item-button dashboard-lane-card"
                key={lane.id}
                onClick={() => navigate(lane.destination)}
                type="button"
              >
                <div className="dashboard-lane-copy">
                  <strong>{lane.name}</strong>
                  <span>{lane.projectName} · {lane.type.toUpperCase()} surface</span>
                  <div className="tile-card-metrics">
                    <span className="tile-metric">{lane.cases} cases</span>
                    <span className="tile-metric">{lane.suites} suites</span>
                    <span className="tile-metric">{lane.executableCases} executable</span>
                  </div>
                  <ProgressMeter
                    detail={`${lane.designScore}% design completeness · ${lane.failedSignals} unstable signal${lane.failedSignals === 1 ? "" : "s"}`}
                    value={lane.releaseScore}
                  />
                </div>
                <DashboardToneChip label={lane.label} tone={lane.tone} />
              </button>
            ))}
            {!releaseLanes.length ? <div className="empty-state compact">Create an app surface first to start tracking release lanes.</div> : null}
          </div>
        </Panel>

        <Panel title="Attention queue" subtitle="The shortest path to a healthier workspace, prioritized from the current gaps and unstable signals.">
          <div className="stack-list">
            {attentionQueue.map((item) => (
              <button
                className="stack-item stack-item-button dashboard-priority-row"
                key={item.id}
                onClick={() => navigate(item.to)}
                type="button"
              >
                <div className="dashboard-priority-copy">
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                </div>
                <DashboardToneChip label={item.label} tone={item.tone} />
              </button>
            ))}
            {!attentionQueue.length ? <div className="empty-state compact">No urgent work is crowding the board right now.</div> : null}
          </div>
        </Panel>
      </div>
        </AnalyticsSection>
      ) : null}

      {sectionVisible("flow") ? (
        <AnalyticsSection
          description={sectionDefinition("flow").description}
          eyebrow={sectionDefinition("flow").category}
          id="flow"
          order={sectionOrder("flow")}
          title={sectionDefinition("flow").title}
        >
      <div className="two-column-grid">
        <Panel title="QA flow" subtitle="How scope is currently moving through reusable design and into run evidence inside QAira.">
          <div className="dashboard-funnel-grid">
            {funnelMetrics.map((metric) => (
              <div className="dashboard-funnel-card" key={metric.id}>
                <span className="dashboard-funnel-label">{metric.label}</span>
                <strong>{compactNumberFormatter.format(metric.value)}</strong>
                <small>{metric.detail}</small>
                <DashboardToneChip label={metric.chipLabel} tone={metric.tone} />
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Run momentum" subtitle="Run activity over time, plus the current posture for ongoing and unstable checks.">
          {hasActivityData ? (
            <div className="dashboard-momentum-shell">
              <div className="activity-chart">
                {activitySeries.map((item) => (
                  <div className="activity-bar-group" key={item.key}>
                    <div className="activity-bar-track">
                      <div className="activity-bar-fill" style={{ height: `${item.height}%` }} />
                    </div>
                    <strong>{compactNumberFormatter.format(item.total)}</strong>
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>

              <div className="dashboard-momentum-summary">
                <div className="mini-card">
                  <strong>{resultStatusCounts.passed}</strong>
                  <span>Passed result signals</span>
                </div>
                <div className="mini-card">
                  <strong>{resultStatusCounts.failed + resultStatusCounts.blocked}</strong>
                  <span>Unstable result signals</span>
                </div>
                <div className="mini-card">
                  <strong>{executionStatusCounts.running}</strong>
                  <span>Active release checks</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-state compact">Run the first execution to start building release momentum on the dashboard.</div>
          )}
        </Panel>
      </div>
        </AnalyticsSection>
      ) : null}

      {sectionVisible("automation") ? (
        <AnalyticsSection
          description={sectionDefinition("automation").description}
          eyebrow={sectionDefinition("automation").category}
          id="automation"
          order={sectionOrder("automation")}
          title={sectionDefinition("automation").title}
        >
          <Panel className="automation-analytics-panel" title="Automation reach and reliability" subtitle="Restricted to automation-enabled roles and projects. These operational metrics are excluded from release-readiness scoring.">
            <div className="automation-analytics-grid">
              <button aria-haspopup="dialog" className="automation-analytics-card metric-evidence-trigger" onClick={() => setSelectedMetricEvidence(metricEvidence.automation)} type="button">
                <span>Case coverage</span><strong>{automationCoverage}%</strong><small>{automatedCasesCount} of {testCasesList.length} cases marked automated</small><i className="meter"><em style={healthMeterStyle(automationCoverage)} /></i><span className="metric-evidence-hint">View evidence</span>
              </button>
              <button aria-haspopup="dialog" className="automation-analytics-card metric-evidence-trigger" onClick={() => setSelectedMetricEvidence(metricEvidence.automation)} type="button"><span>Automated runs</span><strong>{automatedExecutions.length}</strong><small>CI and local-agent executions in the active project</small><span className="metric-evidence-hint">View context</span></button>
              <button aria-haspopup="dialog" className="automation-analytics-card metric-evidence-trigger" onClick={() => setSelectedMetricEvidence(metricEvidence.automation)} type="button"><span>Automated pass rate</span><strong>{automatedPassRate}%</strong><small>{automatedLatestResults.length} latest automated result{automatedLatestResults.length === 1 ? "" : "s"}</small><span className="metric-evidence-hint">View evidence</span></button>
              <button aria-haspopup="dialog" className="automation-analytics-card metric-evidence-trigger" onClick={() => setSelectedMetricEvidence(metricEvidence.automation)} type="button"><span>Candidate backlog</span><strong>{Math.max(testCasesList.length - automatedCasesCount, 0)}</strong><small>Non-automated cases; prioritize by stability and repeatability</small><span className="metric-evidence-hint">View guidance</span></button>
            </div>
          </Panel>
        </AnalyticsSection>
      ) : null}

      {sectionVisible("risk") ? (
        <AnalyticsSection
          description={sectionDefinition("risk").description}
          eyebrow={sectionDefinition("risk").category}
          id="risk"
          order={sectionOrder("risk")}
          title={sectionDefinition("risk").title}
        >
      <div className="two-column-grid">
        <Panel title="Risk hotspots" subtitle="The cases creating the loudest failure or blocked signal across recent run evidence.">
          <div className="stack-list">
            {riskHotspots.map((hotspot) => (
              <button
                className="stack-item stack-item-button dashboard-hotspot-row"
                key={hotspot.id}
                onClick={() => navigate(`/executions?execution=${hotspot.executionId}`)}
                type="button"
              >
                <div className="dashboard-hotspot-copy">
                  <strong>{hotspot.title}</strong>
                  <span>{hotspot.detail}</span>
                </div>
                <div className="dashboard-hotspot-meta">
                  <span className="count-pill">{hotspot.count} signal{hotspot.count === 1 ? "" : "s"}</span>
                  <StatusBadge value={hotspot.status} />
                </div>
              </button>
            ))}
            {!riskHotspots.length ? <div className="empty-state compact">No unstable hotspots are dominating recent execution evidence.</div> : null}
          </div>
        </Panel>

        <Panel title="Recent release checks" subtitle="Latest run snapshots with a quick read on pass rate, failures, and current status.">
          <div className="stack-list">
            {recentExecutions.map((execution) => (
              <button
                className="stack-item stack-item-button dashboard-run-row"
                key={execution.id}
                onClick={() => navigate(`/executions?execution=${execution.id}`)}
                type="button"
              >
                <div className="dashboard-run-copy">
                  <strong>{execution.name || "Unnamed run"}</strong>
                  <span>{execution.projectName} · {execution.appTypeName} · {(execution.trigger === "manual" || canViewAutomationAnalytics ? execution.trigger || "manual" : "run").toUpperCase()}</span>
                  <ProgressMeter
                    detail={`${execution.summary.passed} passed · ${execution.summary.running} running · ${execution.summary.failed} failed · ${execution.summary.blocked} blocked`}
                    segments={buildExecutionSegments(
                      execution.summary.passed,
                      execution.summary.failed,
                      execution.summary.running,
                      execution.summary.blocked,
                      execution.summary.total
                    )}
                    value={execution.summary.percent}
                  />
                </div>
                <StatusBadge value={execution.status} />
              </button>
            ))}
            {!recentExecutions.length ? <div className="empty-state compact">No release checks captured yet. Start an execution to create the first signal.</div> : null}
          </div>
        </Panel>
      </div>
        </AnalyticsSection>
      ) : null}
      </div>

      <AiInsightPreviewDialog
        assuranceTitle="Portfolio signal grounding"
        emptyMessage="No portfolio rule matched. This is not a guarantee of release readiness."
        error={qualityInsightPreview.error instanceof Error ? qualityInsightPreview.error.message : null}
        eyebrow="Quality command center"
        findings={qualityInsightFindings}
        gaps={qualityInsightPreview.data?.provenance.evidence.length ? [] : ["No Jira evidence reference was available for this preview."]}
        limitations={qualityInsightPreview.data?.limitations || []}
        loading={qualityInsightPreview.isPending}
        onClose={() => setIsQualityInsightPreviewOpen(false)}
        open={isQualityInsightPreviewOpen}
        recommendedActions={qualityInsightFindings.map((finding) => finding.action).filter((action): action is string => Boolean(action))}
        response={qualityInsightPreview.data}
        signals={qualityInsightPreview.data ? [
          { label: "Portfolio rules", value: `${qualityInsightPreview.data.insights.length} signal${qualityInsightPreview.data.insights.length === 1 ? "" : "s"}`, tone: qualityInsightPreview.data.insights.some((insight) => insight.severity === "high") ? "warning" : "neutral" },
          { label: "Jira evidence", value: `${qualityInsightPreview.data.provenance.evidence.length} reference${qualityInsightPreview.data.provenance.evidence.length === 1 ? "" : "s"}`, tone: qualityInsightPreview.data.provenance.evidence.length ? "positive" : "warning" },
          { label: "Decision", value: "Human owned", tone: "warning" }
        ] : []}
        subtitle={`Read-only, deterministic signals for ${selectedProject?.name || "the selected Jira project"}.`}
        summary="Signals are derived from visible Jira issue fields, links, Qaira properties, and execution results. They prioritize review work; they do not decide release readiness."
        title="Explain quality signals"
      />
      <MetricEvidenceDialog evidence={selectedMetricEvidence} onClose={() => setSelectedMetricEvidence(null)} />
      {isLayoutDialogOpen ? (
        <AnalyticsLayoutDialog
          automationAvailable={canViewAutomationAnalytics}
          layout={analyticsLayout}
          onClose={() => setIsLayoutDialogOpen(false)}
          onMove={moveAnalyticsSection}
          onReset={() => commitAnalyticsLayout(DEFAULT_ANALYTICS_LAYOUT)}
          onToggle={toggleAnalyticsSection}
        />
      ) : null}
    </div>
  );
}

export function OverviewPage() {
  const { session } = useAuth();
  const featureFlagsQuery = useFeatureFlags(Boolean(session));
  const [projectId] = useCurrentProject();
  const [searchParams] = useSearchParams();
  const requestedView = searchParams.get("view");
  const dashboardView = requestedView === "custom" || requestedView === "readiness" ? requestedView : "analytics";

  if (dashboardView === "readiness") {
    return <ReleaseReadinessDashboard />;
  }

  if (dashboardView === "custom") {
    return (
      <div className="page-content page-content--overview overview-layout">
        {projectId ? (
          <CustomQualityDashboard
            canManage={hasPermission(session, "dashboard.manage")}
            canUseAutomation={hasPermission(session, "automation.analytics.view") && hasPermission(session, "dashboard.view") && areFeatureFlagsEnabled(featureFlagsQuery.data, ["qaira.automation.workspace", "qaira.automation.analytics"])}
            canUseAi={hasPermission(session, "quality_insight.view") && areFeatureFlagsEnabled(featureFlagsQuery.data, ["qaira.ai.quality_insights"])}
            projectId={String(projectId)}
          />
        ) : (
          <div className="empty-state compact">Select a Jira project to build a dashboard.</div>
        )}
      </div>
    );
  }

  return <QualityAnalyticsDashboard />;
}
