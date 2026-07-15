import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

import {
  MAX_TEST_CASE_VERSIONS,
  TEST_CASE_VERSION_SCHEMA,
  createTestCaseVersionSnapshot,
  restorableTestCaseContent,
  revisionFromTestCaseVersionPropertyKey,
  summarizeTestCaseVersion,
  testCaseVersionPropertyKey
} from '../src/testCaseVersions.js';

const apiSource = fs.readFileSync(new URL('../src/qairaApi.js', import.meta.url), 'utf8');
const accessSource = fs.readFileSync(new URL('../src/qairaAccess.js', import.meta.url), 'utf8');

test('test-case version snapshots retain restorable content without copying audit history', () => {
  const snapshot = createTestCaseVersionSnapshot({
    testCase: {
      id: '10001',
      title: 'Checkout succeeds',
      description: 'Validate the primary checkout flow.',
      labels: ['checkout'],
      priority: 1,
      status: 'Approved',
      automated: 'no',
      requirement_ids: ['20001'],
      suite_ids: ['30001']
    },
    spec: {
      revision: 7,
      app_type_id: '10000:web',
      parameter_values: { account: 'standard' },
      steps: [{ id: 'step-1', action: 'Submit order', expected_result: 'Order is confirmed' }],
      review_history: Array.from({ length: 50 }, (_, index) => ({ id: `review-${index}` })),
      ai_generation_job_id: 'job-1'
    },
    capturedBy: 'account-1',
    capturedAt: '2026-07-15T10:00:00.000Z'
  });

  assert.equal(snapshot.schema, TEST_CASE_VERSION_SCHEMA);
  assert.equal(snapshot.revision, 7);
  assert.equal(snapshot.content.title, 'Checkout succeeds');
  assert.deepEqual(snapshot.content.requirement_ids, ['20001']);
  assert.deepEqual(snapshot.content.suite_ids, ['30001']);
  assert.equal(snapshot.content.steps.length, 1);
  assert.equal(Object.hasOwn(snapshot.content, 'review_history'), false);
  assert.equal(Object.hasOwn(snapshot.content, 'ai_generation_job_id'), false);
  assert.equal(restorableTestCaseContent(snapshot).parameter_values.account, 'standard');
});

test('test-case version keys and summaries are deterministic and bounded', () => {
  assert.equal(MAX_TEST_CASE_VERSIONS, 20);
  assert.equal(testCaseVersionPropertyKey(12), 'qaira.testCaseVersion.v1.12');
  assert.equal(revisionFromTestCaseVersionPropertyKey('qaira.testCaseVersion.v1.12'), 12);
  assert.equal(revisionFromTestCaseVersionPropertyKey('qaira.testCaseSpec.v1'), null);
  assert.throws(() => testCaseVersionPropertyKey(0), /positive integer/);

  const summary = summarizeTestCaseVersion(createTestCaseVersionSnapshot({
    testCase: { title: 'Case', status: 'Draft' },
    spec: { revision: 2, steps: [{ action: 'A' }, { action: 'B' }] }
  }));
  assert.deepEqual({ revision: summary.revision, title: summary.title, step_count: summary.step_count }, {
    revision: 2,
    title: 'Case',
    step_count: 2
  });
});

test('Forge test-case version routes enforce scope, optimistic concurrency, retention, and review reset', () => {
  assert.match(apiSource, /captureTestCaseVersion\(issue, project, registry, current\)/);
  assert.match(apiSource, /listTestCaseVersionSummaries/);
  assert.match(apiSource, /pruneTestCaseVersions/);
  assert.match(apiSource, /expected_revision/);
  assert.match(apiSource, /review_status: 'not_requested'/);
  assert.match(apiSource, /Restored from version \$\{snapshot\.revision\}; human review is required\./);
  assert.match(accessSource, /versions\\\/\\d\+\\\/restore/);
  assert.match(accessSource, /testcase\.update/);
});
