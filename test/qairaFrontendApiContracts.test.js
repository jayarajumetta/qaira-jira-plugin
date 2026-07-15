import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const apiSource = fs.readFileSync(path.join(root, 'static/qaira-ui/src/lib/api.ts'), 'utf8');

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
    'assignTestCases: (id: string, test_case_ids: string[], expected_revision?: number)',
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
