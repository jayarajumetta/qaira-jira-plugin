import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const apiSource = fs.readFileSync(path.join(root, 'static/qaira-ui/src/lib/api.ts'), 'utf8');
const authContextSource = fs.readFileSync(path.join(root, 'static/qaira-ui/src/auth/AuthContext.tsx'), 'utf8');
const requirementsPageSource = fs.readFileSync(path.join(root, 'static/qaira-ui/src/pages/RequirementsPage.tsx'), 'utf8');

function sourceBetween(startMarker, endMarker) {
  const start = apiSource.indexOf(startMarker);
  const end = apiSource.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return apiSource.slice(start, end);
}

test('assignment helpers use the mutating methods implemented by Forge handlers', () => {
  const requirementAssignments = sourceBetween(
    'assignRequirements: (id: string, requirement_ids: string[], append = true)',
    'removeRequirements: (id: string, requirement_ids: string[])'
  );
  const moduleAssignments = sourceBetween(
    'assignCases: (id: string, test_case_ids: string[], append = true)',
    'removeCases: (id: string, test_case_ids: string[])'
  );
  const suiteAssignments = sourceBetween(
    'assignTestCases: (id: string, test_case_ids: string[], expected_revision?: number, append = true)',
    'delete: (id: string) => request<{ deleted: boolean }>(`/test-suites/${id}`'
  );

  for (const [label, source] of [
    ['requirement iteration', requirementAssignments],
    ['test-case module', moduleAssignments],
    ['test suite', suiteAssignments]
  ]) {
    assert.match(source, /method: "PUT"/, `${label} assignment must use PUT`);
    assert.doesNotMatch(source, /method: "POST"/, `${label} assignment must not silently use POST`);
  }
  assert.match(suiteAssignments, /JSON\.stringify\(\{ test_case_ids, expected_revision, append \}\)/);
});

test('requirement-to-test replacement keeps its requirement-oriented public contract', () => {
  const relationshipReplacement = sourceBetween(
    'replace: (requirement_id: string, test_case_ids: string[])',
    '  },\n  requirementDefects:'
  );

  assert.match(relationshipReplacement, /method: "PUT"/);
  assert.match(relationshipReplacement, /JSON\.stringify\(\{ requirement_id, test_case_ids \}\)/);
});

test('object-repository screen rename maps new_name to the Forge screen_name field', () => {
  const rename = sourceBetween(
    'renameLearningCacheScreen: (screenName: string, input:',
    'buildAutomation: (id: string, input?'
  );

  assert.match(rename, /method: "PUT"/);
  assert.match(rename, /screen_name: input\.new_name/);
});

test('project-property collection updates expose the records returned by Forge', () => {
  const typedUpdates = [
    ['shared-step-groups', 'SharedStepGroup'],
    ['test-environments', 'TestEnvironment'],
    ['test-configurations', 'TestConfiguration'],
    ['test-data-sets', 'TestDataSet'],
    ['execution-schedules', 'ExecutionSchedule']
  ];

  for (const [route, responseType] of typedUpdates) {
    assert.match(
      apiSource,
      new RegExp('request<' + responseType + '>\\(`/' + route + '/\\$\\{id\\}`, \\{ method: "PUT"'),
      `${route} updates must expose the record returned by handleCollectionCrud`
    );
  }
});

test('Jira issue updates expose and accept optimistic-concurrency revisions', () => {
  for (const route of ['requirements', 'test-suites', 'test-cases', 'executions']) {
    const routeIndex = apiSource.indexOf(`\`/${route}/\${id}\``);
    assert.notEqual(routeIndex, -1, `missing ${route} item route`);
  }

  assert.match(apiSource, /request<\{ updated: boolean; revision: number \}>\(`\/requirements\/\$\{id\}`/);
  assert.match(apiSource, /request<\{ updated: boolean; revision: number \}>\(`\/test-suites\/\$\{id\}`/);
  assert.match(apiSource, /request<\{ updated: boolean; revision: number \}>\(`\/test-cases\/\$\{id\}`/);
  assert.match(apiSource, /request<\{ updated: boolean; revision: number \}>\(`\/executions\/\$\{id\}`/);
  assert.ok((apiSource.match(/expected_revision/g) || []).length >= 8);
});

test('Forge API client refreshes expired Atlassian sessions once and shares the refreshed session', () => {
  const requestBody = sourceBetween(
    'async function request<T>(',
    'async function requestBlob('
  );
  const blobBody = sourceBetween(
    'async function requestBlob(',
    'type TestCaseImportSourceValue'
  );

  assert.match(apiSource, /export const qairaAuthSessionEvents/);
  assert.match(apiSource, /function isRecoverableAuthenticationError/);
  assert.match(apiSource, /function cleanForgeInvocationError/);
  assert.match(apiSource, /async function refreshQairaSession/);
  assert.match(apiSource, /appendCurrentProjectScope\("\/auth\/session"\)/);
  assert.match(apiSource, /window\.dispatchEvent\(new CustomEvent\(qairaAuthSessionEvents\.refresh/);

  assert.match(requestBody, /isRecoverableAuthenticationError\(message\)/);
  assert.match(requestBody, /await refreshQairaSession\(\)/);
  assert.match(requestBody, /return executeRequest\(false\)/);
  assert.match(blobBody, /responseType:\s*"blob"/);
  assert.match(blobBody, /isRecoverableAuthenticationError\(message\)/);
  assert.match(blobBody, /return executeRequest\(false\)/);

  assert.match(authContextSource, /qairaAuthSessionEvents/);
  assert.match(authContextSource, /window\.addEventListener\(qairaAuthSessionEvents\.refresh/);
  assert.match(authContextSource, /setSession\(next\)/);
});

test('AI requirement generation modal can recover recent async jobs from persisted storage', () => {
  assert.match(requirementsPageSource, /RECOVERABLE_REQUIREMENT_AI_JOB_WINDOW_MS/);
  assert.match(requirementsPageSource, /isRecoverableRequirementAiJob/);
  assert.match(requirementsPageSource, /api\.requirements\.listGenerationJobs\(\{ project_id: projectId, limit: 5 \}\)/);
  assert.match(requirementsPageSource, /recoveredRequirementCreationJob/);
  assert.match(requirementsPageSource, /setRequirementCreationJobId\(recoveredRequirementCreationJob\.id\)/);
});
