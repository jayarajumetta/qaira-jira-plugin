import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

import { buildSmartRunPlan, prioritizeSmartRun } from '../src/smartRunPrioritization.js';

const apiSource = fs.readFileSync(new URL('../src/qairaApi.js', import.meta.url), 'utf8');
const executionsSource = fs.readFileSync(new URL('../static/qaira-ui/src/pages/ExecutionsPage.tsx', import.meta.url), 'utf8');
const manifestSource = fs.readFileSync(new URL('../manifest.yml', import.meta.url), 'utf8');

const requirements = [
  { id: 'req-1', display_id: 'QA-10', title: 'Checkout payment', fix_version: 'Release 8', test_case_ids: ['case-1'], priority: 1 },
  { id: 'req-2', display_id: 'QA-11', title: 'Profile avatar', fix_version: 'Release 9', test_case_ids: ['case-2'], priority: 3 }
];

const tests = [
  { id: 'case-1', title: 'Card payment succeeds', description: 'Complete checkout using a valid card', priority: 1, status: 'Approved', requirement_ids: ['req-1'], suite_ids: ['suite-1'], automation_status: 'incomplete', ai_quality_score: 82, step_count: 5 },
  { id: 'case-2', title: 'Upload profile avatar', description: 'Change the user photo', priority: 3, status: 'Draft', requirement_ids: ['req-2'], suite_ids: [], automation_status: 'not_automated', ai_quality_score: 55, step_count: 3 },
  { id: 'case-3', title: 'Unrelated admin audit', description: 'Review role changes', priority: 2, status: 'Approved', requirement_ids: [], suite_ids: [], step_count: 2 }
];

test('smart-run prioritization ranks only project-scope matches with explainable signals', () => {
  const ranked = prioritizeSmartRun({
    tests,
    requirements,
    suites: [{ id: 'suite-1', name: 'Checkout regression', test_case_ids: ['case-1'] }],
    impactedRequirementIds: ['req-1'],
    releaseScope: 'Release 8',
    additionalContext: 'payment checkout risk'
  });

  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].test_case_id, 'case-1');
  assert.equal(ranked[0].impact_level, 'high');
  assert.ok(ranked[0].risk_score >= 65);
  assert.deepEqual(ranked[0].requirement_titles, ['Checkout payment']);
  assert.deepEqual(ranked[0].suite_names, ['Checkout regression']);
  assert.match(ranked[0].reason, /explicitly selected Story/);
});

test('smart-run planning promotes scoped failures and Bug-linked coverage before Story-only candidates', () => {
  const plan = buildSmartRunPlan({
    tests,
    requirements: requirements.map((requirement) => ({ ...requirement, sprint: 'Sprint 24' })),
    suites: [{ id: 'suite-1', name: 'Checkout regression', test_case_ids: ['case-1'] }],
    bugs: [{
      id: 'bug-1',
      jira_bug_key: 'QA-90',
      title: 'Avatar upload regression',
      release: 'Release 8',
      sprint: 'Sprint 24',
      build: '2026.07.22',
      status: 'Open',
      linked_test_case_ids: ['case-2']
    }],
    executions: [{ id: 'run-1', release: 'Release 8', sprint: 'Sprint 24', build: '2026.07.22' }],
    executionResults: [{ id: 'result-1', execution_id: 'run-1', test_case_id: 'case-1', status: 'failed', created_at: '2026-07-22T08:00:00Z' }],
    releaseScope: 'Release 8',
    sprintScope: 'Sprint 24',
    buildScope: '2026.07.22'
  });

  assert.deepEqual(plan.cases.map((item) => item.test_case_id), ['case-1', 'case-2']);
  assert.equal(plan.cases[0].failure_count, 1);
  assert.match(plan.cases[0].reason, /Latest result failed/);
  assert.equal(plan.cases[1].bug_count, 1);
  assert.match(plan.cases[1].reason, /open scoped Bug/i);
  assert.deepEqual(plan.evidenceSummary, {
    scoped_requirement_count: 2,
    scoped_bug_count: 1,
    scoped_run_count: 1,
    failed_case_count: 1,
    blocked_case_count: 0,
    candidate_case_count: 2,
    returned_case_count: 2,
    scanned_case_count: 3,
    scan_truncated: false
  });
});

test('smart-run planning follows Bugs recorded directly on scoped execution results', () => {
  const plan = buildSmartRunPlan({
    tests: [tests[0]],
    bugs: [{ id: 'bug-result', jira_bug_key: 'QA-91', title: 'Payment result Bug', status: 'Open' }],
    executions: [{ id: 'run-result', display_id: 'QA-RUN-8', build: '2026.07.22' }],
    executionResults: [{
      id: 'result-with-bug',
      execution_id: 'run-result',
      test_case_id: 'case-1',
      status: 'failed',
      defects: ['QA-91'],
      created_at: '2026-07-22T08:00:00Z'
    }],
    buildScope: '2026.07.22'
  });

  assert.equal(plan.evidenceSummary.scoped_bug_count, 1);
  assert.equal(plan.cases[0].bug_count, 1);
  assert.match(plan.cases[0].signals.join(' '), /recorded by a scoped execution result/i);
});

test('Build evidence expands through a failed case Story to sibling regression coverage', () => {
  const plan = buildSmartRunPlan({
    tests: [tests[0], tests[1]],
    requirements: [{
      id: 'req-build',
      title: 'Build checkout regression',
      test_case_ids: ['case-1', 'case-2'],
      _smart_run_scope_source: 'linked-test-case'
    }],
    executions: [{ id: 'run-build', build: 'build-42' }],
    executionResults: [{ id: 'result-build', execution_id: 'run-build', test_case_id: 'case-1', status: 'failed' }],
    buildScope: 'build-42'
  });

  assert.deepEqual(plan.cases.map((item) => item.test_case_id), ['case-1', 'case-2']);
  assert.match(plan.cases[1].reason, /reached through scoped failed or Bug evidence/);
});

test('smart-run prioritization returns no arbitrary fallback when scope has no match', () => {
  const ranked = prioritizeSmartRun({
    tests,
    requirements,
    suites: [],
    releaseScope: 'Release 404',
    additionalContext: 'quantum ledger'
  });
  assert.deepEqual(ranked, []);
});

test('Forge smart-run preview loads bounded independent evidence concurrently', () => {
  const evidenceStart = apiSource.indexOf('async function loadSmartRunEvidence');
  const handlerStart = apiSource.indexOf("if (pathname === '/executions/smart-plan-preview' && method === 'POST')");
  const handlerEnd = apiSource.indexOf("if ((pathname === '/executions'", handlerStart);
  const evidenceLoader = apiSource.slice(evidenceStart, handlerStart);
  const handler = apiSource.slice(handlerStart, handlerEnd);
  assert.match(evidenceLoader, /await Promise\.all/);
  assert.match(evidenceLoader, /listRequirements/);
  assert.match(evidenceLoader, /listBugs/);
  assert.match(evidenceLoader, /listExecutions/);
  assert.match(evidenceLoader, /readExecutionResults/);
  assert.match(evidenceLoader, /rankContextRecords/);
  assert.match(evidenceLoader, /build: scope\.build \|\| undefined/);
  assert.match(evidenceLoader, /_smart_run_scope_source: 'linked-test-case'/);
  assert.match(handler, /buildSmartRunPlan/);
  assert.match(handler, /evidence_summary/);
  assert.match(handler, /default_suite: \{ id: 'smart-default', name: 'Default' \}/);
  assert.match(apiSource, /input\.scope_source === 'smart-run'[\s\S]*virtualDefaultSuite/);
  assert.match(apiSource, /qairaRunBuild/);
  assert.match(apiSource, /qairaBugBuild/);
  assert.match(manifestSource, /searchAlias: qairaRunRelease/);
  assert.match(manifestSource, /searchAlias: qairaRunSprint/);
  assert.match(manifestSource, /searchAlias: qairaRunBuild/);
  assert.match(manifestSource, /searchAlias: qairaBugBuild/);
});

test('Smart Run UI submits delivery keys, explains evidence, and persists a virtual Default suite', () => {
  assert.match(executionsSource, /release: executionRelease\.trim\(\) \|\| undefined/);
  assert.match(executionsSource, /sprint: executionSprint\.trim\(\) \|\| undefined/);
  assert.match(executionsSource, /build: executionBuild\.trim\(\) \|\| undefined/);
  assert.match(executionsSource, /scope_description: smartExecutionReleaseScope\.trim\(\) \|\| undefined/);
  assert.match(executionsSource, /className="metric-strip execution-smart-evidence-strip"/);
  assert.match(executionsSource, /Failed cases[\s\S]*Blocked cases[\s\S]*Scoped Bugs[\s\S]*Scoped Stories/);
  assert.match(executionsSource, /scope_source: executionCreateMode === "smart" \? "smart-run"/);
  assert.match(executionsSource, /default_suite: executionCreateMode === "smart" \? smartExecutionPreview\?\.default_suite/);
});
