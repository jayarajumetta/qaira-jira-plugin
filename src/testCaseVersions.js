export const TEST_CASE_VERSION_SCHEMA = 'qaira.testCaseVersion.v1';
export const MAX_TEST_CASE_VERSIONS = 20;

const RESTORABLE_SPEC_KEYS = [
  'app_type_id',
  'suite_id',
  'suite_ids',
  'requirement_id',
  'requirement_ids',
  'description',
  'external_references',
  'labels',
  'parameter_values',
  'automated',
  'automation_status',
  'priority',
  'status',
  'reviewer_id',
  'ai_quality_score',
  'steps'
];

function validRevision(value) {
  const revision = Number(value);
  return Number.isSafeInteger(revision) && revision > 0 ? revision : null;
}

function definedEntries(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function pickRestorableSpec(spec = {}) {
  return definedEntries(Object.fromEntries(
    RESTORABLE_SPEC_KEYS.map((key) => [key, spec[key]])
  ));
}

export function testCaseVersionPropertyKey(revision) {
  const normalized = validRevision(revision);
  if (!normalized) throw new TypeError('Test-case version revision must be a positive integer.');
  return `${TEST_CASE_VERSION_SCHEMA}.${normalized}`;
}

export function revisionFromTestCaseVersionPropertyKey(propertyKey) {
  const match = String(propertyKey || '').match(/^qaira\.testCaseVersion\.v1\.(\d+)$/);
  return match ? validRevision(match[1]) : null;
}

export function createTestCaseVersionSnapshot({
  testCase,
  spec,
  capturedBy = null,
  capturedAt = new Date().toISOString(),
  reason = 'content-update'
}) {
  const revision = validRevision(spec?.revision || testCase?.revision || 1) || 1;
  const restorable = pickRestorableSpec(spec);
  const authoritativeRequirementIds = Array.isArray(testCase?.requirement_ids)
    ? testCase.requirement_ids
    : testCase?.requirement_id ? [testCase.requirement_id] : restorable.requirement_ids;
  const authoritativeSuiteIds = Array.isArray(testCase?.suite_ids)
    ? testCase.suite_ids
    : testCase?.suite_id ? [testCase.suite_id] : restorable.suite_ids;

  const content = definedEntries({
    ...restorable,
    title: testCase?.title ?? spec?.title ?? '',
    description: testCase?.description ?? spec?.description ?? null,
    labels: testCase?.labels ?? spec?.labels ?? [],
    priority: testCase?.priority ?? spec?.priority ?? null,
    status: testCase?.status ?? spec?.status ?? null,
    automated: testCase?.automated ?? spec?.automated ?? null,
    automation_status: testCase?.automation_status ?? spec?.automation_status ?? null,
    requirement_ids: [...new Set((authoritativeRequirementIds || []).filter(Boolean).map(String))],
    suite_ids: [...new Set((authoritativeSuiteIds || []).filter(Boolean).map(String))]
  });
  content.requirement_id = content.requirement_ids[0] || null;
  content.suite_id = content.suite_ids[0] || null;

  return {
    schema: TEST_CASE_VERSION_SCHEMA,
    revision,
    captured_at: capturedAt,
    captured_by: capturedBy,
    reason,
    content
  };
}

export function summarizeTestCaseVersion(snapshot) {
  if (!snapshot || snapshot.schema !== TEST_CASE_VERSION_SCHEMA || !validRevision(snapshot.revision)) {
    throw new TypeError('Invalid Qaira test-case version snapshot.');
  }
  return {
    revision: Number(snapshot.revision),
    captured_at: snapshot.captured_at || null,
    captured_by: snapshot.captured_by || null,
    reason: snapshot.reason || 'content-update',
    title: snapshot.content?.title || '',
    status: snapshot.content?.status || null,
    step_count: Array.isArray(snapshot.content?.steps) ? snapshot.content.steps.length : 0
  };
}

export function restorableTestCaseContent(snapshot) {
  if (!snapshot || snapshot.schema !== TEST_CASE_VERSION_SCHEMA || !validRevision(snapshot.revision)) {
    throw new TypeError('Invalid Qaira test-case version snapshot.');
  }
  return definedEntries({ ...snapshot.content });
}
