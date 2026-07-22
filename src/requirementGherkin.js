const MAX_GHERKIN_STORIES = 6;
const MAX_GHERKIN_SCENARIOS = 6;
const MAX_GHERKIN_SCENARIO_CHARS = 4_000;

const textValue = (value, maxLength) => String(value ?? '').trim().slice(0, maxLength);

const scenarioTitle = (value, fallback) => {
  const normalized = textValue(value, 180)
    .replace(/^[\s>*#-]+/, '')
    .replace(/[.:;]+$/, '')
    .replace(/\s+/g, ' ');
  return normalized || fallback;
};

const acceptanceClauses = (criterion) => {
  const normalized = textValue(criterion, 1_200)
    .replace(/^[\s>*#-]+/, '')
    .replace(/\s+/g, ' ')
    .replace(/[.]+$/, '');
  const fullMatch = normalized.match(/^given\s+(.+?)\s+when\s+(.+?)\s+then\s+(.+)$/i);
  if (fullMatch) {
    return {
      given: fullMatch[1].trim(),
      when: fullMatch[2].trim(),
      then: fullMatch[3].trim()
    };
  }
  return {
    given: 'the Story preconditions and required access are satisfied',
    when: normalized || 'the user performs the behavior described by the Story',
    then: 'the acceptance outcome is observable and can be verified'
  };
};

export function normalizeGherkinStoryDrafts(value) {
  const drafts = (Array.isArray(value) ? value : [])
    .slice(0, MAX_GHERKIN_STORIES)
    .map((story, index) => {
      const title = textValue(story?.title, 255) || `Story ${index + 1}`;
      const description = textValue(story?.description, 8_000);
      const acceptanceCriteria = (Array.isArray(story?.acceptance_criteria) ? story.acceptance_criteria : [])
        .map((criterion) => textValue(criterion, 1_200))
        .filter(Boolean)
        .slice(0, MAX_GHERKIN_SCENARIOS);
      return {
        client_id: textValue(story?.client_id, 255) || `ai-story-${index + 1}`,
        title,
        description,
        acceptance_criteria: acceptanceCriteria
      };
    })
    .filter((story) => story.title && (story.description || story.acceptance_criteria.length));
  const usedIds = new Set();
  return drafts.map((story, index) => {
    let clientId = story.client_id;
    let suffix = index + 1;
    while (usedIds.has(clientId)) clientId = `${story.client_id}-${suffix++}`;
    usedIds.add(clientId);
    return { ...story, client_id: clientId };
  });
}

export function buildDeterministicGherkinScenarios(story) {
  const seeds = story.acceptance_criteria.length
    ? story.acceptance_criteria
    : [story.description || story.title];
  return seeds.slice(0, MAX_GHERKIN_SCENARIOS).map((criterion, index) => {
    const clauses = acceptanceClauses(criterion);
    const title = index === 0
      ? story.title
      : `${story.title} — ${scenarioTitle(criterion, `acceptance path ${index + 1}`)}`;
    return [
      ...(index === 0 ? [`Feature: ${story.title}`, ''] : []),
      `Scenario: ${title}`,
      `  Given ${clauses.given}`,
      `  When ${clauses.when}`,
      `  Then ${clauses.then}`
    ].join('\n');
  });
}

export function normalizeGherkinScenario(value) {
  const normalized = textValue(value, MAX_GHERKIN_SCENARIO_CHARS)
    .replace(/^```(?:gherkin|cucumber|feature)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
  if (!normalized) return null;

  const scenarioIndex = normalized.search(/^\s*(?:Scenario|Scenario Outline):/im);
  const givenIndex = normalized.search(/^\s*Given\s+/im);
  const whenIndex = normalized.search(/^\s*When\s+/im);
  const thenIndex = normalized.search(/^\s*Then\s+/im);
  if (scenarioIndex < 0 || givenIndex <= scenarioIndex || whenIndex <= givenIndex || thenIndex <= whenIndex) return null;
  if (/^\s*Scenario Outline:/im.test(normalized)) {
    const examplesIndex = normalized.search(/^\s*Examples:/im);
    if (examplesIndex <= thenIndex) return null;
  }
  return normalized;
}

export function normalizeGherkinScenarios(value, fallback = []) {
  const expected = (Array.isArray(fallback) ? fallback : []).map(normalizeGherkinScenario).filter(Boolean);
  const candidates = (Array.isArray(value) ? value : [])
    .slice(0, MAX_GHERKIN_SCENARIOS)
    .map(normalizeGherkinScenario)
    .filter(Boolean);
  // One scenario is drafted for each acceptance criterion. If a model drops or
  // adds scenarios, retain the complete deterministic set instead of silently
  // presenting partial coverage as complete.
  const requiresFeature = /^\s*Feature:/im.test(expected[0] || '');
  const hasFeature = /^\s*Feature:/im.test(candidates[0] || '');
  return candidates.length
    && (!expected.length || candidates.length === expected.length)
    && (!requiresFeature || hasFeature)
    ? candidates
    : expected;
}

export function normalizeGherkinPreviewRequirements(value, fallbackRequirements) {
  const candidates = Array.isArray(value) ? value : [];
  let repairedCount = 0;
  const requirements = fallbackRequirements.map((fallback, index) => {
    const candidate = candidates.find((item) => String(item?.client_id || '') === fallback.client_id) || candidates[index] || {};
    const scenarios = normalizeGherkinScenarios(candidate?.gherkin_scenarios, fallback.gherkin_scenarios);
    const candidateScenarios = Array.isArray(candidate?.gherkin_scenarios) ? candidate.gherkin_scenarios : [];
    if (candidateScenarios.length !== scenarios.length || candidateScenarios.some((scenario, scenarioIndex) => normalizeGherkinScenario(scenario) !== scenarios[scenarioIndex])) {
      repairedCount += 1;
    }
    return { client_id: fallback.client_id, gherkin_scenarios: scenarios };
  });
  return { requirements, repaired_count: repairedCount };
}
