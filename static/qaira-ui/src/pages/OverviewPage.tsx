import { useMemo, useState, type CSSProperties } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { AiInsightPreviewDialog, type AiPreviewFinding } from "../components/AiInsightPreviewDialog";
import { CustomQualityDashboard } from "../components/CustomQualityDashboard";
import { SparkIcon } from "../components/AppIcons";
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
  const {
    users,
    issues,
    projects,
    projectMembers,
    requirements,
    appTypes,
    testSuites,
    testCases,
    executions,
    executionResults
  } = useWorkspaceData();

  const usersListRaw = users.data || [];
  const issuesList = issues.data || [];
  const projectsList = projects.data || [];
  const projectMembersList = projectMembers.data || [];
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
  const projectMemberUserIds = useMemo(
    () => new Set(projectMembersList.filter((member) => String(member.project_id) === String(activeProjectId)).map((member) => member.user_id)),
    [activeProjectId, projectMembersList]
  );
  const usersList = useMemo(
    () => usersListRaw.filter((user) => projectMemberUserIds.has(user.id) || user.role === "admin"),
    [projectMemberUserIds, usersListRaw]
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

  const automationReadiness = useMemo(() => {
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

  const releaseReadinessScore = useMemo(
    () => Math.round((requirementCoverage * 0.38) + (automationCoverage * 0.27) + (latestPassRate * 0.35)),
    [automationCoverage, latestPassRate, requirementCoverage]
  );

  const adminUserCount = useMemo(
    () => usersList.filter((user) => user.role === "admin").length,
    [usersList]
  );

  const openIssueCount = useMemo(
    () =>
      issuesList.filter((item) => {
        const normalizedStatus = String(item.status || "open").trim().toLowerCase();
        return normalizedStatus !== "closed" && normalizedStatus !== "resolved";
      }).length,
    [issuesList]
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
      return "Coverage depth, executable low-code steps, and recent release evidence are strong enough for confident product conversations.";
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
        id: "automation",
        title: "Deepen automation",
        detail: "Turn reusable cases into executable low-code assets by adding steps and expected results.",
        meta: `${casesMissingStepsCount} case${casesMissingStepsCount === 1 ? "" : "s"} missing steps`,
        to: "/test-cases",
        tone: casesMissingStepsCount ? "info" as const : "success" as const
      },
      {
        id: "executions",
        title: "Run release checks",
        detail: "Open Test Runs to triage failed runs, monitor active checks, and capture new evidence.",
        meta: `${executionStatusCounts.running} running · ${executionStatusCounts.failed} failed`,
        to: "/executions",
        tone: executionStatusCounts.failed ? "error" as const : executionStatusCounts.running ? "info" as const : "success" as const
      }
    ];
  }, [casesMissingStepsCount, coverageGapCount, executionStatusCounts.failed, executionStatusCounts.running, suitesList.length]);
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
        tone: automationReadiness >= 70 ? "success" as const : testCasesList.length ? "info" as const : "neutral" as const,
        chipLabel: `${automationReadiness}% executable`,
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
      },
      {
        id: "team",
        eyebrow: "People and intake",
        value: compactNumberFormatter.format(usersList.length),
        title: "Access control and reported bugs stay visible alongside delivery work.",
        description: "The tool already covers admin access, user management, and bug intake, so the dashboard should acknowledge them.",
        tone: openIssueCount ? "info" as const : "neutral" as const,
        chipLabel: `${openIssueCount} open bugs`,
        stats: [
          `${adminUserCount} admin${adminUserCount === 1 ? "" : "s"}`,
          `${Math.max(usersList.length - adminUserCount, 0)} member${usersList.length - adminUserCount === 1 ? "" : "s"}`,
          `${issuesList.length} total bugs`
        ]
      }
    ];
  }, [
    adminUserCount,
    appTypesList.length,
    automationReadiness,
    casesMissingStepsCount,
    casesWithStepsCount,
    coverageGapCount,
    executionStatusCounts.running,
    executionsList.length,
    issuesList.length,
    openIssueCount,
    passRate,
    projectsList.length,
    requirementCoverage,
    requirementsList.length,
    resultStatusCounts.blocked,
    resultStatusCounts.failed,
    resultStatusCounts.running,
    suitesList.length,
    testCasesList.length,
    usersList.length
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

    const automationItems = casesWithoutSteps.slice(0, 2).map((testCase) => ({
      id: `case-${testCase.id}`,
      title: testCase.title,
      detail: "Reusable case exists, but it still needs executable steps before it becomes automation-ready.",
      label: "Add steps",
      tone: "info" as const,
      to: "/test-cases"
    }));

    return [...failedExecutions, ...requirementItems, ...automationItems].slice(0, 6);
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
        const automationScore = scopedCases.length ? Math.round((executableCases / scopedCases.length) * 100) : 0;
        const qualityScore = scopedResults.length ? Math.round((passedCount / scopedResults.length) * 100) : 0;
        const releaseScore = Math.round((automationScore * 0.45) + (qualityScore * 0.55));
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
        } else if (automationScore < 60) {
          label = "Build automation";
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
          automationScore,
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
        detail: "Reusable low-code flow groups",
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
        detail: `${automationReadiness}% ready for execution`,
        chipLabel: automationReadiness >= 70 ? "Automation" : "Build out",
        tone: automationReadiness >= 70 ? "success" as const : "info" as const
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
  }, [automationReadiness, casesWithStepsCount, latestExecutionResultsList.length, mappedRequirementsCount, requirementCoverage, requirementsList.length, suitesList.length, testCasesList.length]);

  const commandSignals = useMemo(() => {
    return [
      {
        label: "Requirement coverage",
        value: requirementCoverage,
        detail: `${mappedRequirementsCount}/${requirementsList.length || 0} mapped to reusable cases`,
        tone: requirementCoverage >= 80 ? "success" as const : "info" as const
      },
      {
        label: "Automation readiness",
        value: automationReadiness,
        detail: `${casesWithStepsCount}/${testCasesList.length || 0} cases have executable steps`,
        tone: automationReadiness >= 70 ? "success" as const : "info" as const
      },
      {
        label: "Run confidence",
        value: passRate,
        detail: `${resultStatusCounts.failed} failed · ${resultStatusCounts.blocked} blocked · ${resultStatusCounts.running} running`,
        tone: resultStatusCounts.failed ? "danger" as const : passRate >= 80 ? "success" as const : "info" as const
      }
    ];
  }, [automationReadiness, casesWithStepsCount, mappedRequirementsCount, passRate, requirementCoverage, requirementsList.length, resultStatusCounts.blocked, resultStatusCounts.failed, resultStatusCounts.running, testCasesList.length]);

  const topRecommendation = useMemo(() => {
    if (coverageGaps.length) {
      return `${coverageGapCount} requirement${coverageGapCount === 1 ? "" : "s"} still need reusable coverage before this dashboard becomes release-grade.`;
    }

    if (casesMissingStepsCount) {
      return `${casesMissingStepsCount} reusable case${casesMissingStepsCount === 1 ? "" : "s"} still need steps before they become executable low-code assets.`;
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

  return (
    <div className="page-content page-content--overview overview-layout">
      <header className="page-header card overview-hero">
        <div className="page-header-text">
          <h1 className="page-header-title">{selectedProject?.name || "Select a project"}</h1>
          <p className="page-description">
            Monitor release readiness, requirement coverage, automation confidence, latest execution health, and explainable evidence-prioritized risks for the active project.
          </p>
        </div>

      </header>

      <section className="health-grid" aria-label="Project health overview">
        <article className="health-card release-card">
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
        </article>

        <article className="stat-card">
          <span>Requirement Coverage</span>
          <strong>{requirementCoverage}%</strong>
          <small>{mappedRequirementsCount} / {requirementsList.length || 0} mapped</small>
          <i className="meter"><em style={healthMeterStyle(requirementCoverage)} /></i>
        </article>

        <article className="stat-card info">
          <span>Automation Coverage</span>
          <strong>{automationCoverage}%</strong>
          <small>{automatedCasesCount} automated scenario{automatedCasesCount === 1 ? "" : "s"}</small>
          <i className="meter"><em style={healthMeterStyle(automationCoverage)} /></i>
        </article>

        <article className="stat-card danger">
          <span>Latest Pass Rate</span>
          <strong>{latestPassRate}%</strong>
          <small>{latestFailedSignals} failed or blocked test{latestFailedSignals === 1 ? "" : "s"}</small>
          <i className="meter danger"><em style={healthMeterStyle(latestPassRate)} /></i>
        </article>

        <article className="stat-card warning">
          <span>Open Risks</span>
          <strong>{openRiskCount}</strong>
          <small>{releaseBlockerCount} release blocker{releaseBlockerCount === 1 ? "" : "s"}</small>
          <i className="meter warning"><em style={healthMeterStyle(Math.min(100, openRiskCount ? 35 + openRiskCount * 6 : 8))} /></i>
        </article>
      </section>

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
                    detail={`${lane.automationScore}% automation depth · ${lane.failedSignals} unstable signal${lane.failedSignals === 1 ? "" : "s"}`}
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
                  <span>{execution.projectName} · {execution.appTypeName} · {(execution.trigger || "manual").toUpperCase()}</span>
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
    </div>
  );
}

export function OverviewPage() {
  const { session } = useAuth();
  const featureFlagsQuery = useFeatureFlags(Boolean(session));
  const [projectId] = useCurrentProject();
  const [searchParams] = useSearchParams();
  const dashboardView = searchParams.get("view") === "custom" ? "custom" : "analytics";

  if (dashboardView === "custom") {
    return (
      <div className="page-content page-content--overview overview-layout">
        {projectId ? (
          <CustomQualityDashboard
            canManage={hasPermission(session, "dashboard.manage")}
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
