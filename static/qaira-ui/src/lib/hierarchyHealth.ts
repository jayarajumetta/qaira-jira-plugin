export type IterationHealthInput = {
  priority?: number | null;
  status?: string | null;
  linkedCaseCount: number;
  passPercent: number;
  automationPercent?: number;
  linkedCases?: Array<{ id: string; status?: string | null }>;
  defects?: Array<{ id: string; status?: string | null; priority?: string | null; severity?: string | null }>;
};

export type ModuleHealthInput = {
  priority?: number | null;
  linkedRequirement?: boolean;
  stepCount?: number;
  automated?: boolean;
  recentStatuses: string[];
};

const percent = (covered: number, total: number) => total ? Math.round((covered / total) * 100) : 0;
const isDone = (status?: string | null) => /^(done|closed|accepted|approved|resolved|complete(?:d)?)$/i.test(String(status || "").trim());
const isFailed = (status?: string | null) => /^(failed|blocked)$/i.test(String(status || "").trim());
const isExecutedCaseStatus = (status?: string | null) => /^(passed|failed|blocked)$/i.test(String(status || "").trim());
const isPassedCaseStatus = (status?: string | null) => /^passed$/i.test(String(status || "").trim());
const isFailedCaseStatus = (status?: string | null) => /^failed$/i.test(String(status || "").trim());
const isBlockedCaseStatus = (status?: string | null) => /^blocked$/i.test(String(status || "").trim());
const isOpenDefectStatus = (status?: string | null) => !/^(done|closed|resolved|accepted|approved|complete(?:d)?|fixed|cancelled|canceled)$/i.test(String(status || "").trim());
const isCriticalOrHigh = (value?: string | null) => /^(critical|blocker|highest|high|p0|p1|p2|sev0|sev1|sev2)$/i.test(String(value || "").trim());

export function deriveIterationHealth(items: IterationHealthInput[], automationEnabled: boolean) {
  const completedRequirementCount = items.filter((item) => isDone(item.status)).length;
  const readinessScores = items.map((item) => Math.round(
    automationEnabled && Number.isFinite(item.automationPercent)
      ? (item.passPercent * 0.55) + (Number(item.automationPercent) * 0.45)
      : item.passPercent
  ));
  const caseStatusById = new Map<string, string | null>();
  const defectById = new Map<string, { id: string; status?: string | null; priority?: string | null; severity?: string | null }>();

  items.forEach((item, index) => {
    (item.linkedCases || []).forEach((testCase) => {
      if (!caseStatusById.has(testCase.id)) caseStatusById.set(testCase.id, testCase.status || null);
    });
    (item.defects || []).forEach((defect) => {
      if (!defectById.has(defect.id)) defectById.set(defect.id, defect);
    });
    if (!item.linkedCases?.length && item.linkedCaseCount) {
      for (let syntheticIndex = 0; syntheticIndex < item.linkedCaseCount; syntheticIndex += 1) {
        caseStatusById.set(`synthetic-${index}-${syntheticIndex}`, null);
      }
    }
  });

  const caseStatuses = Array.from(caseStatusById.values());
  const plannedCaseCount = caseStatuses.length;
  const executedCaseCount = caseStatuses.filter(isExecutedCaseStatus).length;
  const passedCaseCount = caseStatuses.filter(isPassedCaseStatus).length;
  const failedCaseCount = caseStatuses.filter(isFailedCaseStatus).length;
  const blockedCaseCount = caseStatuses.filter(isBlockedCaseStatus).length;
  const notRunCaseCount = Math.max(0, plannedCaseCount - executedCaseCount);
  const defects = Array.from(defectById.values());
  const openHighDefectCount = defects.filter((defect) =>
    isOpenDefectStatus(defect.status) && (isCriticalOrHigh(defect.severity) || isCriticalOrHigh(defect.priority))
  ).length;

  const requirementRollups = items.map((item, index) => {
    const linkedCases = item.linkedCases?.length
      ? item.linkedCases
      : Array.from({ length: item.linkedCaseCount }, (_, syntheticIndex) => ({ id: `synthetic-${index}-${syntheticIndex}`, status: null }));
    const statuses = linkedCases.map((testCase) => testCase.status || null);
    const executedStatuses = statuses.filter(isExecutedCaseStatus);
    const failedOrBlocked = statuses.some((status) => isFailedCaseStatus(status) || isBlockedCaseStatus(status));
    const hasOpenCriticalHighDefect = (item.defects || []).some((defect) =>
      isOpenDefectStatus(defect.status) && (isCriticalOrHigh(defect.severity) || isCriticalOrHigh(defect.priority))
    );
    const zeroCoverage = item.linkedCaseCount === 0;
    const highPriorityWeakReadiness = Number(item.priority || 3) <= 2 && readinessScores[index] < 70;
    const passed = Boolean(linkedCases.length) && executedStatuses.length === linkedCases.length && statuses.every(isPassedCaseStatus) && !hasOpenCriticalHighDefect;
    const failed = Boolean(executedStatuses.length) && executedStatuses.every((status) => isFailedCaseStatus(status) || isBlockedCaseStatus(status));
    const atRisk = zeroCoverage || failedOrBlocked || hasOpenCriticalHighDefect || highPriorityWeakReadiness;
    return { passed, failed, atRisk, zeroCoverage };
  });
  const riskCount = requirementRollups.filter((rollup) => rollup.atRisk).length;

  return {
    count: items.length,
    coveragePercent: percent(items.filter((item) => item.linkedCaseCount > 0).length, items.length),
    zeroCoverageCount: items.filter((item) => item.linkedCaseCount === 0).length,
    readinessPercent: items.length ? Math.round(readinessScores.reduce((sum, value) => sum + value, 0) / items.length) : 0,
    completedRequirementCount,
    completionPercent: percent(completedRequirementCount, items.length),
    plannedCaseCount,
    executedCaseCount,
    executionPercent: percent(executedCaseCount, plannedCaseCount),
    passedCaseCount,
    failedCaseCount,
    blockedCaseCount,
    notRunCaseCount,
    passRatePercent: percent(passedCaseCount, executedCaseCount),
    failRatePercent: percent(failedCaseCount, executedCaseCount),
    blockedNotRunPercent: percent(blockedCaseCount + notRunCaseCount, plannedCaseCount),
    totalDefectCount: defects.length,
    openHighDefectCount,
    defectDensityPerRequirement: items.length ? Number((defects.length / items.length).toFixed(1)) : 0,
    defectDensityPerTenCases: plannedCaseCount ? Number(((defects.length / plannedCaseCount) * 10).toFixed(1)) : 0,
    requirementsPassed: requirementRollups.filter((rollup) => rollup.passed).length,
    requirementsFailed: requirementRollups.filter((rollup) => rollup.failed).length,
    requirementsAtRisk: riskCount,
    riskCount
  };
}

export function deriveModuleHealth(items: ModuleHealthInput[]) {
  const traceabilityKnownItems = items.filter((item) => typeof item.linkedRequirement === "boolean");
  const executableKnownItems = items.filter((item) => Number.isFinite(item.stepCount));
  const automationKnownItems = items.filter((item) => typeof item.automated === "boolean");
  const unknownSummaryCount = items.filter((item) =>
    typeof item.linkedRequirement !== "boolean"
      || !Number.isFinite(item.stepCount)
      || typeof item.automated !== "boolean"
  ).length;
  const finalizedStatuses = items.flatMap((item) => item.recentStatuses)
    .map((status) => String(status || "").toLowerCase())
    .filter((status) => ["passed", "failed", "blocked"].includes(status));
  const passedStatuses = finalizedStatuses.filter((status) => status === "passed");
  const latestExecutableStatuses = items
    .map((item) => String(item.recentStatuses[0] || "").toLowerCase())
    .filter((status) => ["passed", "failed", "blocked"].includes(status));
  const latestPassedStatuses = latestExecutableStatuses.filter((status) => status === "passed");
  const riskCount = items.filter((item) =>
    item.linkedRequirement === false
      || (Number.isFinite(item.stepCount) && Number(item.stepCount) === 0)
      || isFailed(item.recentStatuses[0])
      || (Number(item.priority || 3) <= 2 && item.automated === false)
  ).length;

  return {
    count: items.length,
    traceabilityPercent: percent(traceabilityKnownItems.filter((item) => item.linkedRequirement).length, traceabilityKnownItems.length),
    executablePercent: percent(executableKnownItems.filter((item) => Number(item.stepCount) > 0).length, executableKnownItems.length),
    automationPercent: percent(automationKnownItems.filter((item) => item.automated).length, automationKnownItems.length),
    summaryComplete: unknownSummaryCount === 0,
    unknownSummaryCount,
    executionPercent: percent(latestExecutableStatuses.length, items.length),
    passRatePercent: finalizedStatuses.length ? percent(passedStatuses.length, finalizedStatuses.length) : null,
    latestPassRatePercent: latestExecutableStatuses.length ? percent(latestPassedStatuses.length, latestExecutableStatuses.length) : null,
    stabilityPercent: finalizedStatuses.length
      ? percent(finalizedStatuses.filter((status) => status === "passed").length, finalizedStatuses.length)
      : null,
    riskCount
  };
}
