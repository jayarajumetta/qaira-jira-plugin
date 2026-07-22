import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HIERARCHY_DRAG_MIME,
  HIERARCHY_MOVE_BATCH_SIZE,
  chunkHierarchyMoveIds,
  readHierarchyDragPayload,
  resolveHierarchyDragIds,
  writeHierarchyDragPayload
} from '../static/qaira-ui/src/lib/hierarchyDrag.ts';
import {
  JIRA_SPRINT_MOVE_BATCH_SIZE,
  REQUIREMENT_SPRINT_MOVE_PERSISTENCE_LIMIT,
  REQUIREMENT_SPRINT_MOVE_PERSISTENCE_TTL_MS,
  createConfirmedRequirementSprintMove,
  projectConfirmedRequirementSprintMove,
  readPersistedRequirementSprintMoves,
  requirementMatchesSprint,
  requirementSprintMoveIsSettled,
  resolveRequirementSprintIteration,
  writePersistedRequirementSprintMoves
} from '../static/qaira-ui/src/lib/requirementSprintMove.ts';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

function createDataTransfer() {
  const values = new Map();
  return {
    effectAllowed: 'none',
    getData: (key) => values.get(key) || '',
    setData: (key, value) => values.set(key, value),
    values
  };
}

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
    values
  };
}

test('hierarchy drag selection uses the whole checked child selection only when the dragged row is checked', () => {
  assert.deepEqual(resolveHierarchyDragIds('REQ-2', ['REQ-1', 'REQ-2', 'REQ-2', '']), ['REQ-1', 'REQ-2']);
  assert.deepEqual(resolveHierarchyDragIds('REQ-3', ['REQ-1', 'REQ-2']), ['REQ-3']);
  assert.deepEqual(resolveHierarchyDragIds('', ['REQ-1']), []);
});

test('hierarchy drag payload round trips typed multi-record IDs and rejects a different hierarchy kind', () => {
  const dataTransfer = createDataTransfer();
  writeHierarchyDragPayload(dataTransfer, 'test-case', ['TC-1', 'TC-2', 'TC-2']);

  assert.equal(dataTransfer.effectAllowed, 'move');
  assert.match(dataTransfer.values.get(HIERARCHY_DRAG_MIME), /"kind":"test-case"/);
  assert.equal(dataTransfer.values.get('text/plain'), 'TC-1\nTC-2');
  assert.deepEqual(readHierarchyDragPayload(dataTransfer, 'test-case'), ['TC-1', 'TC-2']);
  assert.deepEqual(readHierarchyDragPayload(dataTransfer, 'requirement', ['REQ-9']), ['REQ-9']);
});

test('large hierarchy moves stay within the synchronous Forge relationship ceiling', () => {
  const ids = Array.from({ length: HIERARCHY_MOVE_BATCH_SIZE * 2 + 1 }, (_, index) => `ITEM-${index + 1}`);
  const batches = chunkHierarchyMoveIds([...ids, ids[0]]);

  assert.deepEqual(batches.map((batch) => batch.length), [100, 100, 1]);
  assert.deepEqual(batches.flat(), ids);
  assert.deepEqual(chunkHierarchyMoveIds(['A', 'B'], 500), [['A', 'B']]);
  assert.deepEqual(chunkHierarchyMoveIds(['A', 'B'], 1), [['A'], ['B']]);
});

test('Story Sprint moves use Jira membership and bridge Jira search-index lag without trusting stale local ids', () => {
  const jiraSprint = {
    id: 'jira-sprint-17',
    project_id: 'project-1',
    name: 'Sprint 17',
    jira_sprint_id: '17',
    source: 'jira',
    state: 'active',
    requirement_ids: ['10001']
  };
  const otherSprint = {
    ...jiraSprint,
    id: 'jira-sprint-18',
    name: 'Sprint 18',
    jira_sprint_id: '18',
    requirement_ids: []
  };
  const backlogStory = {
    id: '10001',
    display_id: 'QAIRA-1',
    project_id: 'project-1',
    title: 'Checkout',
    description: null,
    priority: 2,
    status: 'To Do',
    sprint: null,
    sprint_id: null
  };

  assert.equal(JIRA_SPRINT_MOVE_BATCH_SIZE, 50);
  assert.deepEqual(
    chunkHierarchyMoveIds(Array.from({ length: 51 }, (_, index) => `REQ-${index + 1}`), JIRA_SPRINT_MOVE_BATCH_SIZE).map((batch) => batch.length),
    [50, 1]
  );
  assert.equal(resolveRequirementSprintIteration(backlogStory, [jiraSprint]), undefined);
  assert.equal(resolveRequirementSprintIteration({ ...backlogStory, sprint_id: '18' }, [jiraSprint, otherSprint])?.id, otherSprint.id);

  const confirmedMove = createConfirmedRequirementSprintMove(backlogStory, jiraSprint);
  const projected = projectConfirmedRequirementSprintMove(confirmedMove, backlogStory);
  assert.equal(projected.iteration_id, jiraSprint.id);
  assert.equal(projected.sprint_id, '17');
  assert.equal(projected.sprint, 'Sprint 17');
  assert.equal(requirementMatchesSprint({ ...backlogStory, sprint: 'Sprint 17' }, confirmedMove), false);
  assert.equal(requirementMatchesSprint(projected, confirmedMove), true);
  assert.equal(requirementSprintMoveIsSettled([projected], confirmedMove), true);
  assert.equal(requirementSprintMoveIsSettled([
    projected,
    { ...backlogStory, sprint_id: '16', sprint: 'Sprint 16' }
  ], confirmedMove), false);
});

test('confirmed Story Sprint moves survive a browser refresh only until Jira evidence settles or the bridge expires', () => {
  const storage = createStorage();
  const scope = 'user-1:project-1';
  const confirmedAt = 1_000_000;
  const requirement = {
    id: '10001',
    display_id: 'QAIRA-1',
    project_id: 'project-1',
    title: 'Checkout',
    description: null,
    priority: 2,
    status: 'To Do',
    sprint: null,
    sprint_id: null
  };
  const sprint = {
    id: 'jira-sprint-17',
    project_id: 'project-1',
    name: 'Sprint 17',
    jira_sprint_id: '17',
    source: 'jira',
    state: 'active'
  };
  const move = createConfirmedRequirementSprintMove(requirement, sprint, confirmedAt);

  writePersistedRequirementSprintMoves(storage, scope, { [requirement.id]: move }, confirmedAt);
  assert.deepEqual(readPersistedRequirementSprintMoves(storage, scope, confirmedAt + 1_000), {
    [requirement.id]: move
  });
  assert.deepEqual(
    readPersistedRequirementSprintMoves(storage, scope, confirmedAt + REQUIREMENT_SPRINT_MOVE_PERSISTENCE_TTL_MS + 1),
    {}
  );
  assert.equal(storage.values.size, 0);
  assert.equal(REQUIREMENT_SPRINT_MOVE_PERSISTENCE_LIMIT, 100);
});

test('requirements and test cases wire typed multi-drag through tile and list views', () => {
  const requirementsSource = read('../static/qaira-ui/src/pages/RequirementsPage.tsx');
  const testCasesSource = read('../static/qaira-ui/src/pages/TestCasesPage.tsx');
  const dataTableSource = read('../static/qaira-ui/src/components/DataTable.tsx');

  assert.match(dataTableSource, /onRowDragStart\?: \(row: T, event: ReactDragEvent<HTMLTableRowElement>\)/);
  assert.match(dataTableSource, /onRowDragStart\?\.\(row, event\)/);
  assert.match(requirementsSource, /writeHierarchyDragPayload\(dataTransfer, "requirement", ids\)/);
  assert.match(requirementsSource, /readHierarchyDragPayload\(event\.dataTransfer, "requirement", draggingRequirementIds\)/);
  assert.match(requirementsSource, /movableIds = dragIds\.filter\(\(id\) => requirementIterationById\.get\(id\)\?\.id !== iterationId\)/);
  assert.match(requirementsSource, /for \(const batchIds of chunkHierarchyMoveIds\(movableIds, JIRA_SPRINT_MOVE_BATCH_SIZE\)\)/);
  assert.match(requirementsSource, /createConfirmedRequirementSprintMove\(requirement, targetIteration\)/);
  assert.match(requirementsSource, /readPersistedRequirementSprintMoves/);
  assert.match(requirementsSource, /writePersistedRequirementSprintMoves/);
  assert.match(requirementsSource, /requirementSprintMoveIsSettled\(loadedRequirementEvidence, move\)/);
  assert.match(requirementsSource, /scheduleRequirementSprintRevalidation\(iterationId, moveScope\)/);
  assert.match(requirementsSource, /setDeleteSelectedRequirementIds\(\(current\) => current\.filter\(\(id\) => !dragIds\.includes\(id\)\)\)/);
  assert.match(requirementsSource, /Stories cannot be moved into a completed Jira Sprint/);
  assert.match(requirementsSource, /Move selected Stories to Sprint/);
  assert.match(testCasesSource, /writeHierarchyDragPayload\(dataTransfer, "test-case", ids\)/);
  assert.match(testCasesSource, /readHierarchyDragPayload\(event\.dataTransfer, "test-case", draggingCaseIds\)/);
  assert.match(testCasesSource, /movableIds = dragIds\.filter\(\(id\) => caseModuleById\.get\(id\)\?\.id !== moduleId\)/);
  assert.match(testCasesSource, /for \(const batchIds of chunkHierarchyMoveIds\(movableIds\)\)/);
  assert.match(testCasesSource, /setSelectedActionTestCaseIds\(\(current\) => current\.filter\(\(id\) => !dragIds\.includes\(id\)\)\)/);
  assert.match(testCasesSource, /Move selected test cases to module/);
});

test('backend Sprint assignment stays Jira-owned and returns canonical moved issue references', () => {
  const backendSource = read('../src/qairaApi.js');

  assert.match(backendSource, /const JIRA_SPRINT_MOVE_BATCH_SIZE = 50/);
  assert.match(backendSource, /const jiraReferences = issues\.map\(\(issue\) => String\(issue\.key \|\| issue\.id\)\)/);
  assert.match(backendSource, /moveRequirementsToJiraSprint\(iteration\.jira_sprint_id, validated\.jiraReferences\)/);
  assert.match(backendSource, /const nextTargetIds = iteration\.jira_sprint_id\s*\? \[\]/);
  assert.match(backendSource, /assigned_issue_ids: incoming/);
  assert.match(backendSource, /assigned_issue_keys: validated\.jiraReferences/);
  assert.match(backendSource, /source: 'jira',[\s\S]*requirement_ids: \[\]/);
  assert.doesNotMatch(backendSource, /sprint: sprint\?\.name \|\| detail\.sprint/);
  assert.match(backendSource, /const referencesNativeSprint = \/\^jira-sprint-/);
});
