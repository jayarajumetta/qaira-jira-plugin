import type { Execution, ExecutionResult, Issue, Requirement, TestCase } from "../types";

export type ReleaseReadinessScope = {
  release: string;
  sprint: string;
};

export type ReadinessGateState = "pass" | "warning" | "block";

export type ReadinessGate = {
  id: string;
  label: string;
  state: ReadinessGateState;
  actual: string;
  expectation: string;
  detail: string;
};

export type RequirementHotspot = {
  id: string;
  displayId: string;
  title: string;
  priority: number | null;
  coverageCount: number;
  executedCount: number;
  passedCount: number;
  failedCount: number;
  blockedCount: number;
  openBugCount: number;
  criticalBugCount: number;
  riskScore: number;
  riskLabel: "Critical" | "High" | "Medium" | "Low";
  reasons: string[];
};

export type ReleaseReadinessModel = {
  requirements: Requirement[];
  testCases: TestCase[];
  executions: Execution[];
  executionResults: ExecutionResult[];
  issues: Issue[];
  latestCaseResults: ExecutionResult[];
  metrics: {
    readinessScore: number;
    coverage: number;
    completion: number;
    passRate: number;
    defectContainment: number;
    confidence: number;
    requirementCount: number;
    coveredRequirementCount: number;
    highPriorityUncoveredCount: number;
    plannedCaseCount: number;
    executedCaseCount: number;
    passedCount: number;
    failedCount: number;
    blockedCount: number;
    runningCount: number;
    notRunCount: number;
    openBugCount: number;
    openCriticalBugCount: number;
    openHighBugCount: number;
    linkedBugCount: number;
  };
  decision: {
    state: "on-track" | "review" | "at-risk" | "blocked" | "insufficient";
    label: string;
    summary: string;
    primaryAction: string;
  };
  gates: ReadinessGate[];
  hotspots: RequirementHotspot[];
  latestEvidenceAt: string | null;
};

type ReleaseReadinessInput = ReleaseReadinessScope & {
  requirements: Requirement[];
  testCases: TestCase[];
  executions: Execution[];
  executionResults: ExecutionResult[];
  issues: Issue[];
};

const normalized = (value: unknown) => String(value || "").trim().toLowerCase();
const sameValue = (left: unknown, right: unknown) => normalized(left) === normalized(right);
const unique = <T,>(items: T[]) => [...new Set(items)];
const percent = (numerator: number, denominator: number, emptyValue = 0) => denominator
  ? Math.round((numerator / denominator) * 100)
  : emptyValue;
const dateValue = (value?: string | null) => value ? new Date(value).getTime() || 0 : 0;
const isOpenIssue = (issue: Issue) => !/done|closed|resolved|cancelled|canceled/i.test(String(issue.status || ""));
const isCriticalIssue = (issue: Issue) => /critical|blocker|highest/i.test(`${issue.severity || ""} ${issue.priority || ""}`);
const isHighIssue = (issue: Issue) => /high/i.test(`${issue.severity || ""} ${issue.priority || ""}`);

function requirementRelease(requirement: Requirement) {
  return requirement.fix_version || requirement.release || "";
}

function issueRelease(issue: Issue) {
  return issue.fix_version || issue.release || "";
}

function caseRequirementIds(testCase: TestCase) {
  return unique([...(testCase.requirement_ids || []), ...(testCase.requirement_id ? [testCase.requirement_id] : [])]);
}

function caseIdsForExecution(execution: Execution) {
  return unique([
    ...(execution.direct_test_case_ids || []),
    ...(execution.case_snapshots || []).map((item) => item.test_case_id)
  ]);
}

function pickLatestByCase(results: ExecutionResult[]) {
  const latest = new Map<string, ExecutionResult>();

  results.forEach((result) => {
    const current = latest.get(result.test_case_id);
    if (!current || dateValue(result.created_at) >= dateValue(current.created_at)) {
      latest.set(result.test_case_id, result);
    }
  });

  return [...latest.values()];
}

function decisionFor(metrics: ReleaseReadinessModel["metrics"]) {
  if (!metrics.requirementCount || !metrics.plannedCaseCount || !metrics.executedCaseCount) {
    return {
      state: "insufficient" as const,
      label: "Insufficient evidence",
      summary: "The selected scope does not yet have enough linked and executed evidence for a defensible release review.",
      primaryAction: !metrics.requirementCount
        ? "Map Jira stories to this release or sprint."
        : !metrics.plannedCaseCount
          ? "Link test cases to the scoped stories."
          : "Execute the planned release scope and capture results."
    };
  }

  if (metrics.openCriticalBugCount || metrics.blockedCount) {
    return {
      state: "blocked" as const,
      label: "Blocked",
      summary: "Critical defects or blocked tests require explicit resolution or risk acceptance before release approval.",
      primaryAction: metrics.openCriticalBugCount
        ? "Resolve or formally accept the open critical defect risk."
        : "Unblock the affected tests and rerun the smallest impacted scope."
    };
  }

  if (metrics.failedCount || metrics.openHighBugCount || metrics.highPriorityUncoveredCount || metrics.passRate < 80) {
    return {
      state: "at-risk" as const,
      label: "At risk",
      summary: "The evidence contains material failure, defect, or priority-coverage risk that needs review.",
      primaryAction: metrics.failedCount
        ? "Triage failed tests, link defects, and rerun affected coverage."
        : "Close the highest-impact coverage or defect gap first."
    };
  }

  if (metrics.readinessScore < 80 || metrics.completion < 95) {
    return {
      state: "review" as const,
      label: "Review needed",
      summary: "No hard blocker is visible, but execution completion or confidence is below the release-review target.",
      primaryAction: "Complete the remaining evidence and review the warnings with the release owner."
    };
  }

  return {
    state: "on-track" as const,
    label: "On track",
    summary: "Current linked evidence supports release review with no deterministic blocker detected.",
    primaryAction: "Verify the evidence and record the final human-owned release decision."
  };
}

export function deriveReleaseReadiness(input: ReleaseReadinessInput): ReleaseReadinessModel {
  const selectedRelease = input.release.trim();
  const selectedSprint = input.sprint.trim();
  const matchesRequirementScope = (requirement: Requirement) => (
    (!selectedRelease || sameValue(requirementRelease(requirement), selectedRelease))
    && (!selectedSprint || sameValue(requirement.sprint, selectedSprint))
  );
  const matchesExecutionScope = (execution: Execution) => (
    (!selectedRelease || sameValue(execution.release, selectedRelease))
    && (!selectedSprint || sameValue(execution.sprint, selectedSprint))
  );

  const requirements = input.requirements.filter(matchesRequirementScope);
  const requirementIds = new Set(requirements.map((item) => item.id));
  const explicitlyLinkedCaseIds = new Set(requirements.flatMap((item) => item.test_case_ids || []));
  const requirementLinkedCases = input.testCases.filter((testCase) => (
    explicitlyLinkedCaseIds.has(testCase.id)
    || caseRequirementIds(testCase).some((id) => requirementIds.has(id))
  ));
  const executions = input.executions.filter(matchesExecutionScope);
  const executionIds = new Set(executions.map((item) => item.id));
  const executionCaseIds = new Set(executions.flatMap(caseIdsForExecution));
  const testCases = input.testCases.filter((testCase) => (
    requirementLinkedCases.some((linkedCase) => linkedCase.id === testCase.id)
    || ((!requirements.length || selectedRelease || selectedSprint) && executionCaseIds.has(testCase.id))
  ));
  const testCaseIds = new Set(testCases.map((item) => item.id));
  const executionResults = input.executionResults.filter((result) => (
    executionIds.has(result.execution_id) && (!testCaseIds.size || testCaseIds.has(result.test_case_id))
  ));
  const latestCaseResults = pickLatestByCase(executionResults);
  const resultByCaseId = new Map(latestCaseResults.map((result) => [result.test_case_id, result]));

  const issues = input.issues.filter((issue) => {
    const directScopeMatch = (
      (!selectedRelease || sameValue(issueRelease(issue), selectedRelease))
      && (!selectedSprint || sameValue(issue.sprint, selectedSprint))
      && Boolean(selectedRelease || selectedSprint)
    );
    const linkMatch = (issue.linked_requirement_ids || []).some((id) => requirementIds.has(id))
      || (issue.linked_test_case_ids || []).some((id) => testCaseIds.has(id))
      || Boolean(issue.linked_test_run_id && executionIds.has(issue.linked_test_run_id));
    return selectedRelease || selectedSprint ? directScopeMatch || linkMatch : true;
  });
  const openIssues = issues.filter(isOpenIssue);
  const openCriticalIssues = openIssues.filter(isCriticalIssue);
  const openHighIssues = openIssues.filter((issue) => !isCriticalIssue(issue) && isHighIssue(issue));
  const linkedBugCount = issues.filter((issue) => (
    Boolean(issue.linked_test_run_id)
    || Boolean(issue.linked_test_case_ids?.length)
    || Boolean(issue.linked_requirement_ids?.length)
  )).length;

  const coveredRequirementCount = requirements.filter((requirement) => (
    testCases.some((testCase) => explicitlyLinkedCaseIds.has(testCase.id) && requirement.test_case_ids?.includes(testCase.id))
    || testCases.some((testCase) => caseRequirementIds(testCase).includes(requirement.id))
  )).length;
  const highPriorityUncoveredCount = requirements.filter((requirement) => {
    const covered = testCases.some((testCase) => requirement.test_case_ids?.includes(testCase.id) || caseRequirementIds(testCase).includes(requirement.id));
    return !covered && Number(requirement.priority || 3) <= 2;
  }).length;
  const completedCaseResults = latestCaseResults.filter((result) => result.status !== "running");
  const passedCount = latestCaseResults.filter((result) => result.status === "passed").length;
  const failedCount = latestCaseResults.filter((result) => result.status === "failed").length;
  const blockedCount = latestCaseResults.filter((result) => result.status === "blocked").length;
  const runningCount = latestCaseResults.filter((result) => result.status === "running").length;
  const plannedCaseCount = testCases.length;
  const executedCaseCount = completedCaseResults.length;
  const coverage = percent(coveredRequirementCount, requirements.length);
  const completion = percent(executedCaseCount, plannedCaseCount);
  const passRate = percent(passedCount, completedCaseResults.length);
  const defectContainment = Math.max(0, 100 - (openCriticalIssues.length * 45) - (openHighIssues.length * 18) - (Math.max(0, openIssues.length - openCriticalIssues.length - openHighIssues.length) * 5));
  const defectTraceability = percent(linkedBugCount, issues.length, 100);
  const confidence = Math.round((coverage * 0.4) + (completion * 0.4) + (defectTraceability * 0.2));
  let readinessScore = Math.round((coverage * 0.25) + (completion * 0.2) + (passRate * 0.35) + (defectContainment * 0.2));

  if (!requirements.length || !plannedCaseCount || !executedCaseCount) readinessScore = Math.min(readinessScore, 49);
  if (highPriorityUncoveredCount) readinessScore = Math.min(readinessScore, 69);
  if (blockedCount) readinessScore = Math.min(readinessScore, 59);
  if (openCriticalIssues.length) readinessScore = Math.min(readinessScore, 39);

  const metrics = {
    readinessScore,
    coverage,
    completion,
    passRate,
    defectContainment,
    confidence,
    requirementCount: requirements.length,
    coveredRequirementCount,
    highPriorityUncoveredCount,
    plannedCaseCount,
    executedCaseCount,
    passedCount,
    failedCount,
    blockedCount,
    runningCount,
    notRunCount: Math.max(plannedCaseCount - executedCaseCount - runningCount, 0),
    openBugCount: openIssues.length,
    openCriticalBugCount: openCriticalIssues.length,
    openHighBugCount: openHighIssues.length,
    linkedBugCount
  };

  const latestEvidenceAt = executionResults.reduce<string | null>((latest, result) => (
    dateValue(result.created_at) > dateValue(latest) ? result.created_at || null : latest
  ), null);
  const evidenceAgeDays = latestEvidenceAt ? Math.floor((Date.now() - dateValue(latestEvidenceAt)) / 86_400_000) : null;
  const gates: ReadinessGate[] = [
    {
      id: "priority-coverage",
      label: "Priority story coverage",
      state: highPriorityUncoveredCount ? "block" : requirements.length ? "pass" : "warning",
      actual: highPriorityUncoveredCount ? `${highPriorityUncoveredCount} uncovered` : `${coverage}% covered`,
      expectation: "No P1/P2 story uncovered",
      detail: "Protects the highest business-priority Jira stories from silent test gaps."
    },
    {
      id: "execution-completion",
      label: "Execution completion",
      state: completion >= 95 ? "pass" : completion >= 75 ? "warning" : "block",
      actual: `${completion}% complete`,
      expectation: "At least 95% complete",
      detail: `${executedCaseCount} of ${plannedCaseCount} planned cases have a terminal result.`
    },
    {
      id: "pass-rate",
      label: "Latest-result pass rate",
      state: passRate >= 90 ? "pass" : passRate >= 80 ? "warning" : "block",
      actual: `${passRate}% passed`,
      expectation: "At least 90% passed",
      detail: "Uses only the latest result per scoped test case to avoid inflating evidence with reruns."
    },
    {
      id: "critical-defects",
      label: "Critical defect exposure",
      state: openCriticalIssues.length ? "block" : "pass",
      actual: `${openCriticalIssues.length} open`,
      expectation: "Zero open critical defects",
      detail: "Includes scoped or trace-linked Jira bugs still outside a resolved status."
    },
    {
      id: "blocked-tests",
      label: "Blocked test evidence",
      state: blockedCount ? "block" : "pass",
      actual: `${blockedCount} blocked`,
      expectation: "Zero blocked latest results",
      detail: "A blocked result is treated as missing proof, not as a pass or a failure."
    },
    {
      id: "evidence-freshness",
      label: "Evidence freshness",
      state: evidenceAgeDays === null ? "warning" : evidenceAgeDays <= 14 ? "pass" : "warning",
      actual: evidenceAgeDays === null ? "No dated result" : evidenceAgeDays === 0 ? "Updated today" : `${evidenceAgeDays} days old`,
      expectation: "Result evidence within 14 days",
      detail: "Freshness is visible so an old green result cannot silently present as current assurance."
    }
  ];

  const hotspots = requirements.map<RequirementHotspot>((requirement) => {
    const linkedCases = testCases.filter((testCase) => requirement.test_case_ids?.includes(testCase.id) || caseRequirementIds(testCase).includes(requirement.id));
    const linkedCaseIds = new Set(linkedCases.map((item) => item.id));
    const linkedResults = latestCaseResults.filter((result) => linkedCaseIds.has(result.test_case_id));
    const linkedIssues = openIssues.filter((issue) => (
      issue.linked_requirement_ids?.includes(requirement.id)
      || issue.linked_test_case_ids?.some((id) => linkedCaseIds.has(id))
    ));
    const criticalBugCount = linkedIssues.filter(isCriticalIssue).length;
    const failed = linkedResults.filter((result) => result.status === "failed").length;
    const blocked = linkedResults.filter((result) => result.status === "blocked").length;
    const reasons: string[] = [];
    let riskScore = Number(requirement.priority || 3) <= 1 ? 25 : Number(requirement.priority || 3) <= 2 ? 15 : 5;

    if (!linkedCases.length) { riskScore += 35; reasons.push("No linked test"); }
    if (linkedCases.length && !linkedResults.length) { riskScore += 18; reasons.push("Not executed"); }
    if (failed) { riskScore += Math.min(35, failed * 18); reasons.push(`${failed} failed`); }
    if (blocked) { riskScore += Math.min(35, blocked * 20); reasons.push(`${blocked} blocked`); }
    if (criticalBugCount) { riskScore += Math.min(40, criticalBugCount * 30); reasons.push(`${criticalBugCount} critical bug${criticalBugCount === 1 ? "" : "s"}`); }
    if (linkedIssues.length > criticalBugCount) { riskScore += Math.min(20, (linkedIssues.length - criticalBugCount) * 6); reasons.push(`${linkedIssues.length} open bug${linkedIssues.length === 1 ? "" : "s"}`); }
    if (!reasons.length) reasons.push("No dominant deterministic risk");
    riskScore = Math.min(100, riskScore);

    return {
      id: requirement.id,
      displayId: requirement.display_id || requirement.id,
      title: requirement.title,
      priority: requirement.priority,
      coverageCount: linkedCases.length,
      executedCount: linkedResults.filter((result) => result.status !== "running").length,
      passedCount: linkedResults.filter((result) => result.status === "passed").length,
      failedCount: failed,
      blockedCount: blocked,
      openBugCount: linkedIssues.length,
      criticalBugCount,
      riskScore,
      riskLabel: riskScore >= 75 ? "Critical" : riskScore >= 50 ? "High" : riskScore >= 25 ? "Medium" : "Low",
      reasons
    };
  }).sort((left, right) => right.riskScore - left.riskScore);

  return {
    requirements,
    testCases,
    executions,
    executionResults,
    issues,
    latestCaseResults,
    metrics,
    decision: decisionFor(metrics),
    gates,
    hotspots,
    latestEvidenceAt
  };
}

export function releaseReadinessScopeOptions(requirements: Requirement[], executions: Execution[], issues: Issue[]) {
  return {
    releases: unique([
      ...requirements.map(requirementRelease),
      ...executions.map((execution) => execution.release || ""),
      ...issues.map(issueRelease)
    ].filter(Boolean)).sort((left, right) => left.localeCompare(right, undefined, { numeric: true })),
    sprints: unique([
      ...requirements.map((requirement) => requirement.sprint || ""),
      ...executions.map((execution) => execution.sprint || ""),
      ...issues.map((issue) => issue.sprint || "")
    ].filter(Boolean)).sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
  };
}
