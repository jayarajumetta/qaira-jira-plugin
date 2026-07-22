import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  TEST_CASE_SUMMARY_PROP,
  buildTestCaseSummaryProperty,
  readTestCaseSummaryProperty
} from '../src/testCaseSummary.js';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

function between(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0, `missing section start: ${start}`);
  assert.ok(endIndex > startIndex, `missing section end: ${end}`);
  return source.slice(startIndex, endIndex);
}

test('compact test-case summaries retain safe list fidelity without heavy test content', () => {
  const summary = buildTestCaseSummaryProperty({
    app_type_id: '10000:api',
    status: 'Approved',
    automated: 'yes',
    automation_status: 'ready',
    ai_quality_score: 91,
    reviewer_id: 'account-1',
    review_status: 'pending',
    ai_generation_source: 'scheduler',
    ai_generation_review_status: 'pending',
    ai_generation_job_id: 'job-1',
    ai_generated_at: '2026-07-21T12:00:00.000Z',
    revision: 7,
    external_references: ['https://example.test/one', 'https://example.test/two'],
    parameter_values: { password: 'must-not-be-projected' },
    steps: [
      { step_type: 'api', action: 'secret action', expected_result: 'secret result', automation_code: 'secret code', api_request: { body: 'secret body' } },
      { step_type: 'api', action: 'another secret action' }
    ]
  });

  assert.deepEqual(summary, {
    schema: TEST_CASE_SUMMARY_PROP,
    version: 1,
    app_type_id: '10000:api',
    status: 'Approved',
    automated: 'yes',
    automation_status: 'ready',
    ai_quality_score: 91,
    step_count: 2,
    step_types: ['api'],
    api_only: true,
    reviewer_id: 'account-1',
    review_status: 'pending',
    ai_generation_source: 'scheduler',
    ai_generation_review_status: 'pending',
    ai_generation_job_id: 'job-1',
    ai_generated_at: '2026-07-21T12:00:00.000Z',
    revision: 7,
    external_references: ['https://example.test/one', 'https://example.test/two'],
    external_reference_count: 2,
    external_references_truncated: false,
    updated_at: null
  });
  const serialized = JSON.stringify(summary);
  for (const forbidden of ['parameter_values', 'must-not-be-projected', 'secret action', 'secret result', 'secret code', 'secret body', 'api_request', 'steps']) {
    assert.equal(serialized.includes(forbidden), false, `${forbidden} leaked into the compact property`);
  }
});

test('compact summaries remain tightly bounded and report truncated references', () => {
  const summary = buildTestCaseSummaryProperty({
    revision: 2,
    external_references: Array.from({ length: 80 }, (_value, index) => `https://example.test/${index}/${'x'.repeat(1000)}`),
    steps: [{ step_type: 'web' }, { step_type: 'api' }, { step_type: 'android' }, { step_type: 'ios' }]
  });

  assert.equal(summary.external_references.length, 16);
  assert.equal(summary.external_reference_count, 80);
  assert.equal(summary.external_references_truncated, true);
  assert.equal(summary.external_references.every((reference) => reference.length <= 500), true);
  assert.deepEqual(summary.step_types, ['web', 'api', 'android', 'ios']);
  assert.equal(summary.api_only, false);
  assert.ok(Buffer.byteLength(JSON.stringify(summary), 'utf8') < 10_000);

  const manualSummary = readTestCaseSummaryProperty(buildTestCaseSummaryProperty({
    automated: 'no',
    automation_status: 'not_automated',
    steps: []
  }));
  assert.equal(manualSummary.automated, 'no');
  assert.equal(manualSummary.automation_status, 'not_automated');
});

test('legacy or malformed summary properties remain explicitly unknown', () => {
  assert.equal(readTestCaseSummaryProperty(null), null);
  assert.equal(readTestCaseSummaryProperty({ revision: 4, step_count: 2 }), null);
  assert.equal(readTestCaseSummaryProperty({ schema: TEST_CASE_SUMMARY_PROP, version: 1, revision: 0, step_count: 2 }), null);
  assert.equal(readTestCaseSummaryProperty({ schema: TEST_CASE_SUMMARY_PROP, version: 1, revision: 4, step_count: -1 }), null);
  assert.equal(readTestCaseSummaryProperty({ ...buildTestCaseSummaryProperty({ revision: 4 }), review_status: 'invented' }), null);

  const knownEmpty = readTestCaseSummaryProperty(buildTestCaseSummaryProperty({ revision: 4, steps: [] }));
  assert.equal(knownEmpty.revision, 4);
  assert.equal(knownEmpty.step_count, 0);
  assert.equal(knownEmpty.api_only, false);
  assert.deepEqual(knownEmpty.external_references, []);

  const olderV1 = buildTestCaseSummaryProperty({ revision: 5, steps: [] });
  delete olderV1.status;
  delete olderV1.automated;
  delete olderV1.automation_status;
  delete olderV1.ai_quality_score;
  const readableOlderV1 = readTestCaseSummaryProperty(olderV1);
  assert.equal(readableOlderV1.revision, 5);
  assert.equal(readableOlderV1.status, null);
  assert.equal(readableOlderV1.automated, null);
  assert.equal(readableOlderV1.automation_status, null);
  assert.equal(readableOlderV1.ai_quality_score, null);
});

test('summary projection is persisted on create/save and hydrated on every lightweight list path', async () => {
  const source = await read('src/qairaApi.js');
  const mapper = between(source, 'function mapTestCaseSummary', 'async function mapSuite');
  const listing = between(source, 'async function listIssueKind', 'async function listStoredRequirementRefsPage');
  const create = between(source, "if (typeKey === 'testCase') {\n    const steps", "} else if (typeKey === 'testSuite')");
  const persistence = between(source, 'async function persistTestCaseSpecProperties', 'async function captureTestCaseVersion');

  assert.match(source, /TEST_CASE_SUMMARY_PROP,[\s\S]*buildTestCaseSummaryProperty,[\s\S]*readTestCaseSummaryProperty/);
  assert.match(create, /persistTestCaseSpecProperties\(issueKeyValue, testCaseSpec\)/);
  assert.match(persistence, /putIssueProperty\(testCaseId, TEST_SPEC_PROP, next\)[\s\S]*putIssueProperty\(testCaseId, TEST_CASE_SUMMARY_PROP, compactSummary\)/);
  assert.match(persistence, /previousSpec[\s\S]*Qaira test-case summary rollback failed/);
  assert.match(listing, /MODULE_ASSIGN_PROP, TEST_CASE_SUMMARY_PROP/);
  assert.match(mapper, /readTestCaseSummaryProperty/);
  assert.match(mapper, /detail_complete: false/);
  assert.match(mapper, /summary_complete: Boolean\(compactSummary\)/);
  assert.match(mapper, /compactSummary\?\.automation_status/);
  assert.match(mapper, /compactSummary\?\.status/);
  assert.match(mapper, /compactSummary\?\.ai_quality_score/);
  assert.match(mapper, /app_type_id: compactSummary\?\.app_type_id \|\| appTypeId \|\| null/);
  assert.match(mapper, /automated: automationStatus === 'ready' \? 'yes' : automationStatus \? 'no' : compactSummary\?\.automated \|\| null/);
  assert.match(mapper, /\.\.\.\(compactSummary \? \{/);
  assert.doesNotMatch(mapper, /parameter_values:\s*\{\}/);
  assert.doesNotMatch(mapper, /review_status:\s*'not_requested'/);
  assert.doesNotMatch(mapper, /revision:\s*1/);
});

test('full test-case mappings explicitly identify canonical editable detail', async () => {
  const source = await read('src/qairaApi.js');
  const mapper = between(source, 'async function mapTestCase(', 'function mapTestCaseSummary');
  assert.match(mapper, /detail_complete: true/);
  assert.match(mapper, /summary_complete: true/);
});

test('stored module reference pages honor summary and detail projections', async () => {
  const source = await read('src/qairaApi.js');
  const listing = between(source, 'async function listStoredTestCaseRefsPage', 'async function listStoredRequirementRefsPage');

  assert.match(listing, /const hydrateProperties = query\.projection === 'detail' \|\| query\.detail === 'true'/);
  assert.match(listing, /hydrateProperties \? TEST_SPEC_PROP : TEST_CASE_SUMMARY_PROP/);
  assert.match(listing, /hydrateProperties[\s\S]*await mapInBatches\(visibleIssues, \(issue\) => mapTestCase\(issue, project, registry\)\)/);
  assert.match(listing, /visibleIssues\.map\(\(issue\) => mapTestCaseSummary\(issue, project, registry, query\.app_type_id\)\)/);
});

test('compact-summary consumers keep analytical unknowns bounded while binary UI fields default to No', async () => {
  const [automation, testOps, knowledge, executions, overview, workspaceData, readiness] = await Promise.all([
    read('static/qaira-ui/src/pages/AutomationPage.tsx'),
    read('static/qaira-ui/src/pages/TestOpsPage.tsx'),
    read('static/qaira-ui/src/pages/KnowledgeRepoPage.tsx'),
    read('static/qaira-ui/src/pages/ExecutionsPage.tsx'),
    read('static/qaira-ui/src/pages/OverviewPage.tsx'),
    read('static/qaira-ui/src/hooks/useWorkspaceData.ts'),
    read('static/qaira-ui/src/components/ReleaseReadinessDashboard.tsx')
  ]);

  assert.match(automation, /function isManualCase[\s\S]*testCase\.automated === "no"/);
  assert.match(automation, /unknownAutomationCases/);
  assert.match(testOps, /function isManualCase[\s\S]*testCase\.automated === "no"/);
  assert.match(testOps, /unknownAutomationCases/);
  assert.match(testOps, /test_case_ids: requestedCaseIds/);
  assert.match(knowledge, /manualCases = useMemo\(\(\) => testCases\.filter\(\(testCase: any\) => testCase\.automated !== "yes"/);
  assert.match(knowledge, /Automated: \$\{testCase\.automated === "yes" \? "yes" : "no"\}/);
  assert.doesNotMatch(knowledge, /unknownAutomationCases/);
  assert.match(executions, /isAutomatedSmartCase = automationState === "yes"/);
  assert.match(executions, /"Not automated"/);
  assert.doesNotMatch(executions, /"Type unknown"/);
  assert.match(overview, /knownStepCaseCount/);
  assert.match(overview, /knownAutomationCaseCount/);
  assert.match(overview, /Portfolio metrics are provisional/);
  assert.match(workspaceData, /WORKSPACE_SUMMARY_PAGE_SIZE = 100/);
  assert.match(readiness, /Readiness is provisional/);
});

test('Jira schema metadata declares the compact summary issue property', async () => {
  const [runtimeSchemaSource, jiraSchemaSource, propertyModelSource] = await Promise.all([
    read('src/qairaSchema.js'),
    read('schema/qaira-schema.json'),
    read('schema/qaira-property-model.json')
  ]);
  assert.match(runtimeSchemaSource, /"testCaseSummary": "qaira\.testCaseSummary\.v1"/);
  assert.match(jiraSchemaSource, /"testCaseSummary": "qaira\.testCaseSummary\.v1"/);
  assert.match(propertyModelSource, /"testCaseSummary": "qaira\.testCaseSummary\.v1"/);
});
