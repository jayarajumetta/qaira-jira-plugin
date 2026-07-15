import test from 'node:test';
import assert from 'node:assert/strict';
import {
  boundedAgenticOutput,
  boundedJson,
  incomingNodePayload,
  nodeRuntimeSettings,
  rankContextRecords,
  redactAgenticValue,
  workflowExecutionPlan
} from '../src/agenticWorkflowRuntime.js';

test('agentic workflow execution is deterministic and rejects graph cycles', () => {
  const workflow = {
    nodes: [
      { id: 'trigger', data: { kind: 'trigger' } },
      { id: 'triage', data: { kind: 'llmAgent' } },
      { id: 'output', data: { kind: 'output' } }
    ],
    edges: [
      { id: 'a', source: 'trigger', target: 'triage' },
      { id: 'b', source: 'triage', target: 'output' }
    ]
  };
  assert.deepEqual(workflowExecutionPlan(workflow).ordered.map((node) => node.id), ['trigger', 'triage', 'output']);
  assert.throws(
    () => workflowExecutionPlan({ ...workflow, edges: [...workflow.edges, { id: 'cycle', source: 'output', target: 'trigger' }] }),
    /contains a cycle/i
  );
});

test('agentic runtime redacts secrets and bounds prompt payloads', () => {
  const redacted = redactAgenticValue({
    authorization: 'Bearer raw-token',
    nested: { apiKey: 'raw-key', safe: 'visible' }
  });
  assert.equal(redacted.authorization, '[redacted]');
  assert.equal(redacted.nested.apiKey, '[redacted]');
  assert.equal(redacted.nested.safe, 'visible');
  assert.match(boundedJson({ text: 'x'.repeat(5000) }, 500), /size limited/);
  assert.ok(boundedJson({ text: 'x'.repeat(5000) }, 500).length <= 500);
  assert.deepEqual(boundedAgenticOutput({ value: 'safe' }, 1000), { value: 'safe' });
  const limitedOutput = boundedAgenticOutput({ value: 'x'.repeat(5000) }, 1000);
  assert.equal(limitedOutput.truncated, true);
  assert.match(limitedOutput.preview, /size limited/);
});

test('agentic RAG ranks relevant project context within the configured budget', () => {
  const records = [
    { source_type: 'requirement', source_id: 'REQ-1', title: 'Checkout payment compliance' },
    { source_type: 'test-case', source_id: 'TC-2', title: 'Profile avatar upload' },
    { source_type: 'run', source_id: 'RUN-3', title: 'Checkout card payment regression' }
  ];
  const ranked = rankContextRecords(records, 'checkout payment failed', 2, 2000);
  assert.equal(ranked.length, 2);
  assert.equal(ranked[0].source_id, 'REQ-1');
  assert.ok(ranked[0]._relevance >= ranked[1]._relevance);
});

test('agent handoffs use named upstream outputs and clamp unsafe runtime limits', () => {
  const incoming = new Map([['writer', ['retriever']]]);
  const results = new Map([['retriever', { output_key: 'evidence', output: { authorization: 'secret', result: 'safe' } }]]);
  assert.deepEqual(incomingNodePayload('writer', incoming, results, {}), {
    evidence: { authorization: '[redacted]', result: 'safe' }
  });
  assert.deepEqual(nodeRuntimeSettings({ data: {
    kind: 'llmAgent',
    maxContextChars: 999999,
    maxOutputChars: 10,
    retryCount: 99,
    timeoutMs: 10,
    topK: 99
  } }), {
    kind: 'llmAgent',
    maxContextChars: 24000,
    maxOutputChars: 1000,
    retryCount: 3,
    timeoutMs: 5000,
    topK: 20
  });
});
