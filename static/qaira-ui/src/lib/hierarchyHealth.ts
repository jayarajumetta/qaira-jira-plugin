export type IterationHealthInput = {
  priority?: number | null;
  status?: string | null;
  linkedCaseCount: number;
  passPercent: number;
  automationPercent?: number;
};

export type ModuleHealthInput = {
  priority?: number | null;
  linkedRequirement: boolean;
  stepCount: number;
  automated: boolean;
  recentStatuses: string[];
};

const percent = (covered: number, total: number) => total ? Math.round((covered / total) * 100) : 0;
const isDone = (status?: string | null) => /^(done|closed|accepted|approved|resolved|complete(?:d)?)$/i.test(String(status || "").trim());
const isFailed = (status?: string | null) => /^(failed|blocked)$/i.test(String(status || "").trim());

export function deriveIterationHealth(items: IterationHealthInput[], automationEnabled: boolean) {
  const readinessScores = items.map((item) => Math.round(
    automationEnabled
      ? (item.passPercent * 0.55) + ((item.automationPercent || 0) * 0.45)
      : item.passPercent
  ));
  const riskCount = items.filter((item, index) =>
    item.linkedCaseCount === 0 || (Number(item.priority || 3) <= 2 && readinessScores[index] < 70)
  ).length;

  return {
    count: items.length,
    coveragePercent: percent(items.filter((item) => item.linkedCaseCount > 0).length, items.length),
    readinessPercent: items.length ? Math.round(readinessScores.reduce((sum, value) => sum + value, 0) / items.length) : 0,
    completionPercent: percent(items.filter((item) => isDone(item.status)).length, items.length),
    riskCount
  };
}

export function deriveModuleHealth(items: ModuleHealthInput[]) {
  const finalizedStatuses = items.flatMap((item) => item.recentStatuses)
    .map((status) => String(status || "").toLowerCase())
    .filter((status) => ["passed", "failed", "blocked"].includes(status));
  const riskCount = items.filter((item) =>
    !item.linkedRequirement
      || item.stepCount === 0
      || isFailed(item.recentStatuses[0])
      || (Number(item.priority || 3) <= 2 && !item.automated)
  ).length;

  return {
    count: items.length,
    traceabilityPercent: percent(items.filter((item) => item.linkedRequirement).length, items.length),
    executablePercent: percent(items.filter((item) => item.stepCount > 0).length, items.length),
    automationPercent: percent(items.filter((item) => item.automated).length, items.length),
    stabilityPercent: finalizedStatuses.length
      ? percent(finalizedStatuses.filter((status) => status === "passed").length, finalizedStatuses.length)
      : null,
    riskCount
  };
}
