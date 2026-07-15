const STOP_WORDS = new Set([
  'about', 'after', 'again', 'also', 'before', 'from', 'have', 'into', 'only', 'that', 'their',
  'then', 'there', 'these', 'this', 'those', 'through', 'using', 'when', 'where', 'which', 'with'
]);

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return [];
  return [value];
}

function tokens(value) {
  return [...new Set(String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token)))]
    .slice(0, 48);
}

function textFor(item) {
  return [item?.title, item?.description, ...asArray(item?.labels), item?.display_id]
    .filter(Boolean)
    .join(' ');
}

function overlapCount(sourceTokens, targetTokens) {
  const target = new Set(targetTokens);
  return sourceTokens.filter((token) => target.has(token)).length;
}

function idsFor(item) {
  return new Set([item?.id, item?.display_id].filter(Boolean).map(String));
}

function containsAny(values, expected) {
  return asArray(values).some((value) => expected.has(String(value)));
}

function impactLevel(score) {
  if (score >= 85) return 'critical';
  if (score >= 65) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

function priorityWeight(priority) {
  const value = Number(priority || 3);
  if (value <= 1) return 28;
  if (value === 2) return 20;
  if (value === 3) return 12;
  return 6;
}

export function prioritizeSmartRun({
  tests = [],
  requirements = [],
  suites = [],
  impactedRequirementIds = [],
  releaseScope = '',
  additionalContext = '',
  limit = 20
}) {
  const explicitRequirementIds = new Set(asArray(impactedRequirementIds).filter(Boolean).map(String));
  const release = String(releaseScope || '').trim().toLowerCase();
  const contextTokens = tokens(additionalContext);
  const selectedRequirements = requirements.filter((requirement) => containsAny(idsFor(requirement), explicitRequirementIds));
  const selectedRequirementTokens = tokens(selectedRequirements.map(textFor).join(' '));
  const hasScopeInput = explicitRequirementIds.size > 0 || Boolean(release) || contextTokens.length > 0;
  if (!hasScopeInput) return [];

  return tests.map((testCase) => {
    const testIds = idsFor(testCase);
    const linkedRequirements = requirements.filter((requirement) => {
      const requirementIds = idsFor(requirement);
      return containsAny(testCase.requirement_ids || testCase.requirement_id, requirementIds)
        || containsAny(requirement.test_case_ids, testIds);
    });
    const linkedRequirementIds = new Set(linkedRequirements.flatMap((requirement) => [...idsFor(requirement)]));
    const linkedSuites = suites.filter((suite) => containsAny(testCase.suite_ids || testCase.suite_id, idsFor(suite)) || containsAny(suite.test_case_ids, testIds));
    const testTokens = tokens([textFor(testCase), ...linkedRequirements.map(textFor)].join(' '));
    const explicitLink = [...explicitRequirementIds].some((requirementId) => linkedRequirementIds.has(requirementId));
    const selectedRequirementOverlap = overlapCount(selectedRequirementTokens, testTokens);
    const releaseLink = Boolean(release) && linkedRequirements.some((requirement) =>
      [requirement.fix_version, requirement.release, requirement.sprint]
        .filter(Boolean)
        .some((value) => String(value).trim().toLowerCase() === release)
    );
    const releaseTextOverlap = release ? overlapCount(tokens(release), testTokens) : 0;
    const contextOverlap = overlapCount(contextTokens, testTokens);
    const scopeMatched = explicitLink
      || (explicitRequirementIds.size > 0 && selectedRequirementOverlap > 0)
      || releaseLink
      || releaseTextOverlap > 0
      || contextOverlap > 0;
    if (!scopeMatched) return null;

    const signals = [];
    let score = priorityWeight(testCase.priority);
    if (Number(testCase.priority || 3) <= 1) signals.push({ weight: 28, text: 'Critical priority' });
    else if (Number(testCase.priority || 3) === 2) signals.push({ weight: 20, text: 'High priority' });
    else signals.push({ weight: score, text: `Priority P${Number(testCase.priority || 3)}` });

    if (explicitLink) {
      score += 42;
      signals.push({ weight: 42, text: 'Directly linked to selected requirement' });
    } else if (selectedRequirementOverlap > 0) {
      const weight = Math.min(30, 12 + selectedRequirementOverlap * 4);
      score += weight;
      signals.push({ weight, text: 'Content overlaps selected requirement scope' });
    }
    if (releaseLink) {
      score += 32;
      signals.push({ weight: 32, text: `Linked requirement targets ${releaseScope}` });
    } else if (releaseTextOverlap > 0) {
      const weight = Math.min(18, releaseTextOverlap * 6);
      score += weight;
      signals.push({ weight, text: 'Case content matches release scope' });
    }
    if (contextOverlap > 0) {
      const weight = Math.min(24, contextOverlap * 4);
      score += weight;
      signals.push({ weight, text: `Matches ${contextOverlap} context signal${contextOverlap === 1 ? '' : 's'}` });
    }
    if (/approved|ready/i.test(String(testCase.status || ''))) {
      score += 10;
      signals.push({ weight: 10, text: 'Approved or ready for execution' });
    } else {
      score += 4;
      signals.push({ weight: 4, text: 'Review state needs attention' });
    }
    if (testCase.automation_status === 'incomplete') {
      score += 12;
      signals.push({ weight: 12, text: 'Automation is incomplete or broken' });
    }
    const qualityScore = Number(testCase.ai_quality_score);
    if (Number.isFinite(qualityScore) && qualityScore < 70) {
      const weight = qualityScore < 40 ? 12 : 7;
      score += weight;
      signals.push({ weight, text: 'Authoring coverage needs review' });
    }
    if (!linkedRequirements.length) {
      score += 6;
      signals.push({ weight: 6, text: 'Requirement traceability gap' });
    }

    const normalizedScore = Math.max(1, Math.min(100, Math.round(score)));
    const orderedSignals = signals.sort((left, right) => right.weight - left.weight);
    return {
      test_case_id: String(testCase.id),
      title: testCase.title || `Test ${testCase.display_id || testCase.id}`,
      description: testCase.description || null,
      priority: testCase.priority ?? null,
      status: testCase.status || null,
      suite_names: linkedSuites.map((suite) => suite.name || suite.title).filter(Boolean),
      requirement_titles: linkedRequirements.map((requirement) => requirement.title).filter(Boolean),
      step_count: Number(testCase.step_count || 0),
      reason: orderedSignals.slice(0, 3).map((signal) => signal.text).join(' · '),
      signals: orderedSignals.map((signal) => signal.text),
      risk_score: normalizedScore,
      impact_level: impactLevel(normalizedScore)
    };
  })
    .filter(Boolean)
    .sort((left, right) => right.risk_score - left.risk_score || Number(left.priority || 5) - Number(right.priority || 5) || left.title.localeCompare(right.title))
    .slice(0, Math.max(1, Math.min(50, Number(limit) || 20)));
}
