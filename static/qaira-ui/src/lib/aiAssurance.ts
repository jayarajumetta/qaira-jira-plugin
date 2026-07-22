export type AiAssuranceTone = "positive" | "neutral" | "warning";

export type AiAssuranceSignal = {
  label: string;
  value: string;
  tone?: AiAssuranceTone;
};

export type AiAssuranceAssessment = {
  score: number;
  scoreLabel: string;
  summary: string;
  signals: AiAssuranceSignal[];
  gaps: string[];
};

const clampPercent = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

export function assessRequirementAiReadiness(input: {
  title: string;
  description: string;
  linkedCaseCount: number;
  externalReferenceCount: number;
  labelCount: number;
  hasDeliveryContext: boolean;
}): AiAssuranceAssessment {
  const titleReady = input.title.trim().length >= 12;
  const descriptionReady = input.description.trim().length >= 80;
  const hasCoverage = input.linkedCaseCount > 0;
  const hasReferences = input.externalReferenceCount > 0;
  const hasLabels = input.labelCount > 0;
  const score = clampPercent(
    (titleReady ? 15 : 0)
      + (descriptionReady ? 25 : 0)
      + (hasCoverage ? 25 : 0)
      + (hasReferences ? 10 : 0)
      + (hasLabels ? 10 : 0)
      + (input.hasDeliveryContext ? 15 : 0)
  );
  const gaps = [
    !titleReady ? "Make the title describe a specific business outcome or rule." : null,
    !descriptionReady ? "Add enough scope, behavior, and constraints to ground a useful suggestion." : null,
    !hasCoverage ? "Link at least one test case so generated ideas can be checked against existing coverage." : null,
    !hasReferences ? "Add a source ticket, specification, or design reference when one exists." : null,
    !hasLabels ? "Add product-area or risk labels to improve retrieval and release slicing." : null,
    !input.hasDeliveryContext ? "Add an iteration, sprint, fix version, or release to ground delivery context." : null
  ].filter((item): item is string => Boolean(item));

  return {
    score,
    scoreLabel: "AI input readiness",
    summary: hasCoverage
      ? "The story has reusable coverage that a reviewer can compare with AI-assisted changes."
      : "AI can help shape this story, but linked coverage is still needed for a grounded review.",
    signals: [
      { label: "Existing coverage", value: `${input.linkedCaseCount} linked case${input.linkedCaseCount === 1 ? "" : "s"}`, tone: hasCoverage ? "positive" : "warning" },
      { label: "Source evidence", value: `${input.externalReferenceCount} reference${input.externalReferenceCount === 1 ? "" : "s"}`, tone: hasReferences ? "positive" : "neutral" },
      { label: "Delivery context", value: input.hasDeliveryContext ? "Available" : "Missing", tone: input.hasDeliveryContext ? "positive" : "warning" }
    ],
    gaps
  };
}

export function assessTestCaseReviewReadiness(input: {
  qualityScore: number;
  stepCount: number;
  completeStepCount: number;
  requirementCount: number;
  reviewStatus: string;
  suggestions: string[];
}): AiAssuranceAssessment {
  const normalizedStatus = input.reviewStatus.trim().toLowerCase();
  const isReviewed = ["accepted", "approved"].includes(normalizedStatus);
  const hasTraceability = input.requirementCount > 0;
  const allStepsComplete = input.stepCount > 0 && input.completeStepCount === input.stepCount;

  return {
    score: clampPercent(input.qualityScore),
    scoreLabel: "Authoring completeness",
    summary: isReviewed
      ? "A human review decision is recorded; future AI edits should start a new review cycle."
      : "This local check highlights authoring gaps before a person approves the case for reuse or automation.",
    signals: [
      { label: "Human review", value: isReviewed ? "Accepted" : normalizedStatus === "pending" ? "Pending" : "Not recorded", tone: isReviewed ? "positive" : "warning" },
      { label: "Step evidence", value: `${input.completeStepCount}/${input.stepCount} complete`, tone: allStepsComplete ? "positive" : "warning" },
      { label: "Story trace", value: `${input.requirementCount} linked`, tone: hasTraceability ? "positive" : "warning" }
    ],
    gaps: input.suggestions
  };
}

export function assessRunEvidenceReadiness(input: {
  totalCaseCount: number;
  touchedCaseCount: number;
  linkedRequirementCount: number;
  referenceCount: number;
  failedCount: number;
  blockedCount: number;
}): AiAssuranceAssessment {
  const total = Math.max(input.totalCaseCount, 0);
  const touched = Math.min(Math.max(input.touchedCaseCount, 0), total || input.touchedCaseCount);
  const completionRatio = total ? touched / total : 0;
  const score = clampPercent(
    completionRatio * 65
      + (input.linkedRequirementCount > 0 ? 20 : 0)
      + (input.referenceCount > 0 ? 15 : 0)
  );
  const issueCount = input.failedCount + input.blockedCount;
  const gaps = [
    !total ? "Add test cases to the run before relying on an impact summary." : null,
    total && touched < total ? `${total - touched} scoped case${total - touched === 1 ? " has" : "s have"} no result evidence yet.` : null,
    !input.linkedRequirementCount ? "Link scoped cases to stories to explain release impact." : null,
    issueCount > 0 && !input.referenceCount ? "Attach bugs or external references to failing cases so the risk can be investigated." : null
  ].filter((item): item is string => Boolean(item));

  return {
    score,
    scoreLabel: "Evidence completeness",
    summary: issueCount
      ? `${issueCount} failed or blocked case${issueCount === 1 ? "" : "s"} require human triage before a release decision.`
      : touched
        ? "The risk summary is derived from recorded results and linked story impact."
        : "The impact picture will become useful as case results and trace links are recorded.",
    signals: [
      { label: "Results recorded", value: `${touched}/${total}`, tone: total > 0 && touched === total ? "positive" : "warning" },
      { label: "Story trace", value: `${input.linkedRequirementCount} linked`, tone: input.linkedRequirementCount ? "positive" : "warning" },
      { label: "Failure references", value: `${input.referenceCount} captured`, tone: issueCount && !input.referenceCount ? "warning" : "neutral" }
    ],
    gaps
  };
}

export function assessLocatorReviewReadiness(input: {
  stabilityScore: number;
  locatorCount: number;
  hasDomEvidence: boolean;
  hasVisualEvidence: boolean;
  hasValidationHistory: boolean;
}): AiAssuranceAssessment {
  const score = clampPercent(input.stabilityScore);
  const gaps = [
    input.locatorCount < 2 ? "Add an independent fallback locator before promoting an assisted locator change." : null,
    !input.hasDomEvidence ? "Capture DOM or accessibility evidence so locator changes are explainable." : null,
    !input.hasVisualEvidence ? "Capture element or screen evidence for visual review." : null,
    !input.hasValidationHistory ? "Validate the locator against a real screen before treating it as stable." : null
  ].filter((item): item is string => Boolean(item));

  return {
    score,
    scoreLabel: "Locator stability",
    summary: score >= 80 && !gaps.length
      ? "The locator has supporting evidence, alternatives, and validation history."
      : "Treat a suggested locator as a proposal until its evidence and validation history are reviewed.",
    signals: [
      { label: "Locator strategies", value: String(input.locatorCount), tone: input.locatorCount >= 2 ? "positive" : "warning" },
      { label: "DOM evidence", value: input.hasDomEvidence ? "Captured" : "Missing", tone: input.hasDomEvidence ? "positive" : "warning" },
      { label: "Visual evidence", value: input.hasVisualEvidence ? "Captured" : "Missing", tone: input.hasVisualEvidence ? "positive" : "neutral" }
    ],
    gaps
  };
}
