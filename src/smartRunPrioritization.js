const STOP_WORDS = new Set([
  'about', 'after', 'again', 'also', 'before', 'from', 'have', 'into', 'only', 'that', 'their',
  'then', 'there', 'these', 'this', 'those', 'through', 'using', 'when', 'where', 'which', 'with'
]);

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return [];
  return [value];
}

function normalized(value) {
  return String(value || '').trim().toLowerCase();
}

function tokens(value) {
  return [...new Set(String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token)))]
    .slice(0, 64);
}

function textFor(item) {
  return [
    item?.title,
    item?.name,
    item?.description,
    item?.message,
    item?.actual_result,
    item?.expected_result,
    ...asArray(item?.labels),
    item?.display_id,
    item?.jira_bug_key
  ].filter(Boolean).join(' ');
}

function overlapCount(sourceTokens, targetTokens) {
  const target = new Set(targetTokens);
  return sourceTokens.filter((token) => target.has(token)).length;
}

function idsFor(item) {
  return new Set([
    item?.id,
    item?.display_id,
    item?.key,
    item?.jira_bug_key,
    item?.test_case_id,
    item?.test_case_display_id
  ].filter(Boolean).map(String));
}

function containsAny(values, expected) {
  return asArray(values).some((value) => expected.has(String(value)));
}

function aliasesFor(value) {
  const aliases = new Set();
  for (const entry of asArray(value)) {
    if (entry && typeof entry === 'object') {
      for (const candidate of [entry.id, entry.name, entry.value, entry.key]) {
        if (normalized(candidate)) aliases.add(normalized(candidate));
      }
      continue;
    }
    const candidate = normalized(entry);
    if (!candidate) continue;
    aliases.add(candidate);
    const sprintId = candidate.match(/^(?:jira-)?sprint[-:\s]*(\d+)$/)?.[1];
    if (sprintId) aliases.add(sprintId);
  }
  return aliases;
}

function recordMatchesScope(record, scope, dimensions) {
  return dimensions.every((dimension) => {
    const expected = aliasesFor(scope[dimension]);
    if (!expected.size) return true;
    const candidates = {
      release: [record?.release, record?.fix_version, record?.fix_versions],
      sprint: [record?.sprint, record?.sprint_id, record?.iteration_id, record?.jira_sprint_id, record?.jira_sprint_name],
      build: [record?.build, record?.build_number]
    }[dimension];
    const actual = aliasesFor(asArray(candidates).flat());
    return [...expected].some((value) => actual.has(value));
  });
}

function recordMatchesAnyScope(record, scope, dimensions) {
  return dimensions.some((dimension) => {
    const expected = aliasesFor(scope[dimension]);
    if (!expected.size) return false;
    const candidates = {
      release: [record?.release, record?.fix_version, record?.fix_versions],
      sprint: [record?.sprint, record?.sprint_id, record?.iteration_id, record?.jira_sprint_id, record?.jira_sprint_name],
      build: [record?.build, record?.build_number]
    }[dimension];
    const actual = aliasesFor(asArray(candidates).flat());
    return [...expected].some((value) => actual.has(value));
  });
}

export function matchesSmartRunDeliveryScope(record, scope, dimensions = ['release', 'sprint', 'build']) {
  return recordMatchesScope(record, scope || {}, dimensions);
}

export function matchesAnySmartRunDeliveryScope(record, scope, dimensions = ['release', 'sprint', 'build']) {
  return recordMatchesAnyScope(record, scope || {}, dimensions);
}

function isOpenBug(bug) {
  const category = normalized(bug?.status_category);
  const status = normalized(bug?.status);
  if (['done', 'complete', 'completed', 'resolved', 'closed'].includes(category)) return false;
  return !/\b(?:done|resolved|closed|complete|completed|cancelled|canceled)\b/.test(status);
}

function timestampFor(item) {
  const value = item?.updated_at || item?.created_at || item?.ended_at || item?.started_at;
  const timestamp = Date.parse(String(value || ''));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function impactLevel(score) {
  if (score >= 85) return 'critical';
  if (score >= 65) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

function priorityWeight(priority) {
  const value = Number(priority || 3);
  if (value <= 1) return 18;
  if (value === 2) return 12;
  if (value === 3) return 7;
  return 3;
}

function addIndexAliases(index, item) {
  for (const candidate of idsFor(item)) index.set(candidate, item);
}

function canonicalId(item) {
  return String(item?.id || item?.test_case_id || item?.display_id || '');
}

function uniqueItems(items) {
  const byId = new Map();
  for (const item of items) {
    const itemId = canonicalId(item);
    if (itemId && !byId.has(itemId)) byId.set(itemId, item);
  }
  return [...byId.values()];
}

/**
 * Build an explainable Smart Run plan from server-retrieved Jira evidence.
 *
 * Structured delivery fields are gates, not fuzzy search terms. A case enters
 * the plan only through a scoped Story, a scoped Bug, or a failed/blocked
 * result from a scoped run. Free-text overlap is a fallback when the user has
 * supplied narrative context and no graph evidence exists for that case.
 */
export function buildSmartRunPlan({
  tests = [],
  requirements = [],
  suites = [],
  bugs = [],
  executions = [],
  executionResults = [],
  modules = [],
  impactedRequirementIds = [],
  releaseScope = '',
  sprintScope = '',
  buildScope = '',
  scopeDescription = '',
  additionalContext = '',
  limit = 100,
  scanTruncated = false
}) {
  const scope = { release: releaseScope, sprint: sprintScope, build: buildScope };
  const hasDeliveryScope = Boolean(normalized(releaseScope) || normalized(sprintScope) || normalized(buildScope));
  const explicitRequirementIds = new Set(asArray(impactedRequirementIds).filter(Boolean).map(String));
  const narrativeTokens = tokens(`${scopeDescription || ''} ${additionalContext || ''}`);
  const hasScopeInput = hasDeliveryScope || explicitRequirementIds.size > 0 || narrativeTokens.length > 0;
  const emptySummary = {
    scoped_requirement_count: 0,
    scoped_bug_count: 0,
    scoped_run_count: 0,
    failed_case_count: 0,
    blocked_case_count: 0,
    candidate_case_count: 0,
    returned_case_count: 0,
    scanned_case_count: tests.length,
    scan_truncated: Boolean(scanTruncated)
  };
  if (!hasScopeInput) return { cases: [], evidenceSummary: emptySummary, scope };

  const testByAlias = new Map();
  const requirementByAlias = new Map();
  const bugByAlias = new Map();
  const executionByAlias = new Map();
  tests.forEach((item) => addIndexAliases(testByAlias, item));
  requirements.forEach((item) => addIndexAliases(requirementByAlias, item));
  bugs.forEach((item) => addIndexAliases(bugByAlias, item));
  executions.forEach((item) => addIndexAliases(executionByAlias, item));

  const requirementIdsByCaseId = new Map();
  const addRequirementLink = (testReference, requirement) => {
    const test = testByAlias.get(String(testReference));
    if (!test) return;
    const testId = canonicalId(test);
    const values = requirementIdsByCaseId.get(testId) || new Set();
    values.add(canonicalId(requirement));
    requirementIdsByCaseId.set(testId, values);
  };
  for (const requirement of requirements) {
    for (const testReference of asArray(requirement?.test_case_ids)) addRequirementLink(testReference, requirement);
  }
  for (const testCase of tests) {
    for (const requirementReference of [...asArray(testCase?.requirement_ids), ...asArray(testCase?.requirement_id)]) {
      const requirement = requirementByAlias.get(String(requirementReference));
      if (requirement) addRequirementLink(testCase.id, requirement);
    }
  }

  const scopedRequirements = uniqueItems(requirements.filter((requirement) => {
    const explicit = [...idsFor(requirement)].some((value) => explicitRequirementIds.has(value));
    if (explicit) return true;
    if (requirement?._smart_run_scope_source === 'linked-test-case') return true;
    if (!hasDeliveryScope || normalized(buildScope)) {
      // Builds belong to runs and Bugs; Stories have no authoritative build field.
      if (!normalized(releaseScope) && !normalized(sprintScope)) return false;
    }
    return recordMatchesAnyScope(requirement, scope, ['release', 'sprint']);
  }));
  const scopedRequirementIds = new Set(scopedRequirements.map(canonicalId));
  const explicitCanonicalRequirementIds = new Set(scopedRequirements
    .filter((requirement) => [...idsFor(requirement)].some((value) => explicitRequirementIds.has(value)))
    .map(canonicalId));

  const scopedExecutions = uniqueItems(executions.filter((execution) =>
    hasDeliveryScope && recordMatchesAnyScope(execution, scope, ['release', 'sprint', 'build'])
  ));
  const scopedExecutionIds = new Set(scopedExecutions.map(canonicalId));
  const scopedExecutionResults = executionResults.filter((result) => {
    const execution = executionByAlias.get(String(result?.execution_id));
    return execution && scopedExecutionIds.has(canonicalId(execution));
  });
  const scopedResultBugAliases = new Set(scopedExecutionResults
    .flatMap((result) => asArray(result?.defects))
    .map(String));

  const scopedBugs = uniqueItems(bugs.filter((bug) => {
    const linksScopedRequirement = asArray(bug?.linked_requirement_ids)
      .some((reference) => scopedRequirementIds.has(canonicalId(requirementByAlias.get(String(reference)))));
    const linksScopedRun = scopedExecutionIds.has(canonicalId(executionByAlias.get(String(bug?.linked_test_run_id))));
    const linksScopedResult = [...idsFor(bug)].some((alias) => scopedResultBugAliases.has(alias));
    const matchesDelivery = hasDeliveryScope && recordMatchesAnyScope(bug, scope, ['release', 'sprint', 'build']);
    return matchesDelivery || linksScopedRequirement || linksScopedRun || linksScopedResult;
  }));
  const scopedBugIds = new Set(scopedBugs.map(canonicalId));

  const resultsByCaseId = new Map();
  for (const result of scopedExecutionResults) {
    const execution = executionByAlias.get(String(result?.execution_id));
    const testCase = testByAlias.get(String(result?.test_case_id));
    if (!testCase) continue;
    const testId = canonicalId(testCase);
    const values = resultsByCaseId.get(testId) || [];
    values.push({ ...result, _execution: execution });
    resultsByCaseId.set(testId, values);
  }

  const bugsByCaseId = new Map();
  const addBugLink = (testReference, bug, linkKind) => {
    const test = testByAlias.get(String(testReference));
    if (!test) return;
    const testId = canonicalId(test);
    const values = bugsByCaseId.get(testId) || [];
    const existing = values.find((entry) => canonicalId(entry.bug) === canonicalId(bug));
    const precedence = { requirement: 1, direct: 2, 'execution-result': 3 };
    if (!existing) values.push({ bug, linkKind });
    else if ((precedence[linkKind] || 0) > (precedence[existing.linkKind] || 0)) existing.linkKind = linkKind;
    bugsByCaseId.set(testId, values);
  };
  for (const bug of scopedBugs) {
    for (const testReference of asArray(bug?.linked_test_case_ids)) addBugLink(testReference, bug, 'direct');
    for (const requirementReference of asArray(bug?.linked_requirement_ids)) {
      const requirement = requirementByAlias.get(String(requirementReference));
      if (!requirement) continue;
      for (const testReference of asArray(requirement?.test_case_ids)) addBugLink(testReference, bug, 'requirement');
      for (const testCase of tests) {
        const linkedRequirements = requirementIdsByCaseId.get(canonicalId(testCase)) || new Set();
        if (linkedRequirements.has(canonicalId(requirement))) addBugLink(testCase.id, bug, 'requirement');
      }
    }
  }
  for (const result of scopedExecutionResults) {
    for (const bugReference of asArray(result?.defects)) {
      const bug = bugByAlias.get(String(bugReference));
      if (bug && scopedBugIds.has(canonicalId(bug))) addBugLink(result.test_case_id, bug, 'execution-result');
    }
  }
  for (const testCase of tests) {
    for (const bugReference of asArray(testCase?.defect_ids)) {
      const bug = bugByAlias.get(String(bugReference));
      if (bug && scopedBugIds.has(canonicalId(bug))) addBugLink(testCase.id, bug, 'direct');
    }
  }

  const suiteByAlias = new Map();
  suites.forEach((item) => addIndexAliases(suiteByAlias, item));
  const moduleByAlias = new Map();
  modules.forEach((item) => addIndexAliases(moduleByAlias, item));
  const selectedRequirementTextTokens = tokens(scopedRequirements.map(textFor).join(' '));

  const ranked = tests.map((testCase) => {
    const testId = canonicalId(testCase);
    const linkedRequirementIds = requirementIdsByCaseId.get(testId) || new Set();
    const linkedRequirements = [...linkedRequirementIds].map((id) => requirementByAlias.get(id)).filter(Boolean);
    const selectedRequirements = linkedRequirements.filter((item) => scopedRequirementIds.has(canonicalId(item)));
    const explicitRequirements = selectedRequirements.filter((item) => explicitCanonicalRequirementIds.has(canonicalId(item)));
    const scopedResults = (resultsByCaseId.get(testId) || []).slice().sort((left, right) => timestampFor(right) - timestampFor(left));
    const failedResults = scopedResults.filter((result) => normalized(result.status) === 'failed');
    const blockedResults = scopedResults.filter((result) => normalized(result.status) === 'blocked');
    const latestResult = scopedResults[0] || null;
    const linkedBugs = bugsByCaseId.get(testId) || [];
    const directBugs = linkedBugs.filter((entry) => entry.linkKind === 'direct');
    const executionBugs = linkedBugs.filter((entry) => entry.linkKind === 'execution-result');
    const requirementBugs = linkedBugs.filter((entry) => entry.linkKind === 'requirement');
    const textTokens = tokens([textFor(testCase), ...linkedRequirements.map(textFor)].join(' '));
    const narrativeOverlap = overlapCount(narrativeTokens, textTokens);
    const requirementOverlap = overlapCount(selectedRequirementTextTokens, textTokens);
    const graphMatched = selectedRequirements.length > 0 || scopedResults.some((result) => ['failed', 'blocked'].includes(normalized(result.status))) || linkedBugs.length > 0;
    const narrativeMatched = narrativeTokens.length > 0 && (narrativeOverlap > 0 || requirementOverlap > 0);
    if (!graphMatched && !narrativeMatched) return null;

    const signals = [];
    let score = priorityWeight(testCase.priority);
    if (Number(testCase.priority || 3) <= 1) signals.push({ weight: 18, text: 'Critical-priority test case' });
    else if (Number(testCase.priority || 3) === 2) signals.push({ weight: 12, text: 'High-priority test case' });

    if (normalized(latestResult?.status) === 'failed') {
      score += 70;
      signals.push({ weight: 70, text: 'Latest result failed in the selected delivery scope' });
    } else if (failedResults.length) {
      score += 54;
      signals.push({ weight: 54, text: 'Failed earlier in the selected delivery scope' });
    }
    if (normalized(latestResult?.status) === 'blocked') {
      score += 52;
      signals.push({ weight: 52, text: 'Latest result is blocked in the selected delivery scope' });
    } else if (blockedResults.length) {
      score += 38;
      signals.push({ weight: 38, text: 'Blocked result exists in the selected delivery scope' });
    }
    if (failedResults.length > 1) {
      const weight = Math.min(15, (failedResults.length - 1) * 5);
      score += weight;
      signals.push({ weight, text: `${failedResults.length} scoped failures show repeat risk` });
    }

    if (directBugs.length) {
      const openCount = directBugs.filter((entry) => isOpenBug(entry.bug)).length;
      const weight = openCount ? 50 : 34;
      score += weight + Math.min(12, Math.max(0, directBugs.length - 1) * 4);
      signals.push({ weight, text: openCount ? `${openCount} open scoped Bug${openCount === 1 ? '' : 's'} directly linked` : 'Scoped Bug directly linked' });
    }
    if (executionBugs.length) {
      const openCount = executionBugs.filter((entry) => isOpenBug(entry.bug)).length;
      const weight = openCount ? 46 : 30;
      score += weight + Math.min(10, Math.max(0, executionBugs.length - 1) * 3);
      signals.push({ weight, text: openCount ? `${openCount} open Bug${openCount === 1 ? '' : 's'} recorded by a scoped execution result` : 'Bug recorded by a scoped execution result' });
    }
    if (requirementBugs.length) {
      const openCount = requirementBugs.filter((entry) => isOpenBug(entry.bug)).length;
      const weight = openCount ? 34 : 22;
      score += weight;
      signals.push({ weight, text: openCount ? 'Open scoped Bug affects a linked Story' : 'Scoped Bug affects a linked Story' });
    }

    if (explicitRequirements.length) {
      score += 48;
      signals.push({ weight: 48, text: 'Linked to an explicitly selected Story' });
    } else if (selectedRequirements.length) {
      score += 40;
      signals.push({
        weight: 40,
        text: selectedRequirements.some((requirement) => requirement?._smart_run_scope_source === 'linked-test-case')
          ? 'Linked Story was reached through scoped failed or Bug evidence'
          : 'Linked Story matches the selected delivery scope'
      });
    }

    const linkedRisk = Math.max(0, ...selectedRequirements.map((requirement) => Number(requirement.risk_score || 0)));
    if (linkedRisk > 0) {
      const weight = Math.min(18, Math.max(5, Math.round(linkedRisk / 6)));
      score += weight;
      signals.push({ weight, text: `Linked Story risk is ${Math.round(linkedRisk)}/100` });
    }
    if (narrativeOverlap > 0) {
      const weight = Math.min(18, narrativeOverlap * 4);
      score += weight;
      signals.push({ weight, text: `Matches ${narrativeOverlap} change or risk context signal${narrativeOverlap === 1 ? '' : 's'}` });
    }
    if (testCase.automation_status === 'incomplete') {
      score += 10;
      signals.push({ weight: 10, text: 'Automation is incomplete or broken' });
    }

    const linkedSuites = uniqueItems([
      ...[...asArray(testCase.suite_ids), ...asArray(testCase.suite_id)].map((id) => suiteByAlias.get(String(id))).filter(Boolean),
      ...suites.filter((suite) => containsAny(suite.test_case_ids, idsFor(testCase)))
    ]);
    const linkedModules = uniqueItems([
      ...asArray(testCase.module_ids).map((id) => moduleByAlias.get(String(id))).filter(Boolean),
      ...modules.filter((module) => containsAny(module.test_case_ids, idsFor(testCase)))
    ]);
    const orderedSignals = signals.sort((left, right) => right.weight - left.weight);
    const normalizedScore = Math.max(1, Math.min(100, Math.round(score)));
    const bugRecords = uniqueItems(linkedBugs.map((entry) => entry.bug));
    const runRecords = uniqueItems(scopedResults.map((result) => result._execution));
    return {
      test_case_id: testId,
      title: testCase.title || `Test ${testCase.display_id || testCase.id}`,
      description: testCase.description || null,
      priority: testCase.priority ?? null,
      status: testCase.status || null,
      suite_names: linkedSuites.map((suite) => suite.name || suite.title).filter(Boolean),
      module_names: linkedModules.map((module) => module.name || module.title).filter(Boolean),
      requirement_titles: linkedRequirements.map((requirement) => requirement.title).filter(Boolean),
      step_count: Number(testCase.step_count || 0),
      reason: orderedSignals.slice(0, 3).map((signal) => signal.text).join(' · '),
      signals: orderedSignals.map((signal) => signal.text),
      risk_score: normalizedScore,
      impact_level: impactLevel(normalizedScore),
      failure_count: failedResults.length,
      blocked_count: blockedResults.length,
      bug_count: bugRecords.length,
      last_failure_at: failedResults[0]?.updated_at || failedResults[0]?.created_at || null,
      selection_basis: [
        failedResults.length || blockedResults.length ? 'execution-results' : null,
        bugRecords.length ? 'bugs' : null,
        selectedRequirements.length ? 'requirements' : null,
        narrativeOverlap ? 'context' : null
      ].filter(Boolean),
      evidence: {
        result_ids: scopedResults.filter((result) => ['failed', 'blocked'].includes(normalized(result.status))).map((result) => String(result.id)).filter(Boolean),
        bug_ids: bugRecords.map(canonicalId),
        requirement_ids: selectedRequirements.map(canonicalId),
        run_ids: runRecords.map(canonicalId)
      },
      _raw_score: score,
      _latest_failure_time: failedResults.length ? timestampFor(failedResults[0]) : 0
    };
  }).filter(Boolean)
    .sort((left, right) => Number(right.failure_count > 0) - Number(left.failure_count > 0)
      || Number(right.blocked_count > 0) - Number(left.blocked_count > 0)
      || Number(right.bug_count > 0) - Number(left.bug_count > 0)
      || right._raw_score - left._raw_score
      || right._latest_failure_time - left._latest_failure_time
      || Number(left.priority || 5) - Number(right.priority || 5)
      || left.title.localeCompare(right.title));

  const boundedLimit = Math.max(1, Math.min(100, Number(limit) || 100));
  const selected = ranked.slice(0, boundedLimit).map(({ _raw_score, _latest_failure_time, ...item }) => item);
  const failedCaseCount = new Set(scopedExecutionResults
    .filter((result) => normalized(result.status) === 'failed')
    .map((result) => String(result.test_case_id || ''))
    .filter(Boolean)).size;
  const blockedCaseCount = new Set(scopedExecutionResults
    .filter((result) => normalized(result.status) === 'blocked')
    .map((result) => String(result.test_case_id || ''))
    .filter(Boolean)).size;
  return {
    cases: selected,
    evidenceSummary: {
      scoped_requirement_count: scopedRequirements.length,
      scoped_bug_count: scopedBugs.length,
      scoped_run_count: scopedExecutions.length,
      failed_case_count: failedCaseCount,
      blocked_case_count: blockedCaseCount,
      candidate_case_count: ranked.length,
      returned_case_count: selected.length,
      scanned_case_count: tests.length,
      scan_truncated: Boolean(scanTruncated || ranked.length > selected.length)
    },
    scope
  };
}

export function prioritizeSmartRun(input) {
  return buildSmartRunPlan(input).cases;
}
