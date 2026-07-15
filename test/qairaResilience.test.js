import test from 'node:test';
import assert from 'node:assert/strict';
import { isRetryableJiraRequest, retryDelayMs } from '../src/resilience.js';

test('Jira retries are bounded to idempotent or explicitly safe requests', () => {
  assert.equal(isRetryableJiraRequest('GET', 429), true);
  assert.equal(isRetryableJiraRequest('POST', 503), false);
  assert.equal(isRetryableJiraRequest('PUT', 503, true), true);
  assert.equal(isRetryableJiraRequest('GET', 400), false);
  assert.equal(retryDelayMs(0), 200);
  assert.equal(retryDelayMs(3), 1600);
  assert.equal(retryDelayMs(3, '9'), 2000);
});
