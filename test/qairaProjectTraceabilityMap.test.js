import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const mapSource = read('../static/qaira-ui/src/components/ProjectTraceabilityMap.tsx');
const projectsSource = read('../static/qaira-ui/src/pages/ProjectsPage.tsx');
const apiSource = read('../static/qaira-ui/src/lib/api.ts');

test('project traceability is app-type scoped, paged, honest, and relationship focused', () => {
  assert.match(projectsSource, /project-traceability-requirements/);
  assert.match(projectsSource, /project-traceability-cases/);
  assert.match(projectsSource, /project-traceability-bugs/);
  assert.match(projectsSource, /getVerifiedNextPageCursor/);
  assert.match(apiSource, /issues:[\s\S]*listPage:[\s\S]*include_page: true/);
  assert.match(mapSource, /selectedAppTypeId/);
  assert.match(mapSource, /More Jira records are available/);
  assert.match(mapSource, /Coverage is provisional/);
  assert.match(mapSource, /loadMoreError/);
});

test('traceability graph unions both sides of legacy and current relationships', () => {
  assert.match(mapSource, /\.\.\.\(testCase\.requirement_ids \|\| \[\]\), testCase\.requirement_id/);
  assert.match(mapSource, /requirement\.test_case_ids/);
  assert.match(mapSource, /module\.test_case_ids/);
  assert.match(mapSource, /testCase\.defect_ids/);
  assert.match(mapSource, /bug\.linked_test_case_ids/);
  assert.match(mapSource, /requirementAlias/);
  assert.match(mapSource, /caseAlias/);
});

test('traceability UX prioritizes gaps and keeps focused neighborhoods visible', () => {
  assert.match(mapSource, /type TraceabilityView = "all" \| "gaps"/);
  assert.match(mapSource, /aria-pressed=\{view === "gaps"\}/);
  assert.match(mapSource, /defaultVisibleCount = Math\.max\(7, connectedNodes\.length\)/);
  assert.match(mapSource, /role="status"/);
  assert.match(mapSource, /Focused path/);
  assert.match(mapSource, /No Story/);
  assert.match(mapSource, /No module/);
  assert.match(mapSource, /No scoped test link/);
});
