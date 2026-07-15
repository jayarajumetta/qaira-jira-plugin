import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

import { prioritizeSmartRun } from '../src/smartRunPrioritization.js';

const apiSource = fs.readFileSync(new URL('../src/qairaApi.js', import.meta.url), 'utf8');

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
  assert.equal(ranked[0].impact_level, 'critical');
  assert.ok(ranked[0].risk_score >= 85);
  assert.deepEqual(ranked[0].requirement_titles, ['Checkout payment']);
  assert.deepEqual(ranked[0].suite_names, ['Checkout regression']);
  assert.match(ranked[0].reason, /Directly linked to selected requirement/);
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
  const handlerStart = apiSource.indexOf("if (pathname === '/executions/smart-plan-preview'");
  const handlerEnd = apiSource.indexOf("if ((pathname === '/executions'", handlerStart);
  const handler = apiSource.slice(handlerStart, handlerEnd);
  assert.match(handler, /await Promise\.all/);
  assert.match(handler, /page_size: MAX_PAGE_SIZE/);
  assert.match(handler, /prioritizeSmartRun/);
  assert.doesNotMatch(handler, /tests\.slice\(0, 20\)/);
  assert.match(handler, /No project-scoped test case matched/);
});
