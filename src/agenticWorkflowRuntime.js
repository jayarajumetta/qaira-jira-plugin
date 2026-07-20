const SECRET_KEY_PATTERN = /(authorization|credential|password|secret|access.?token|refresh.?token|api.?key)/i;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_PATTERN = /(?:\+?\d[\d\s().-]{7,}\d)/g;
const BEARER_PATTERN = /\b(?:bearer|basic)\s+[a-z0-9._~+/=-]{12,}\b/gi;
const PRIVATE_TOKEN_PATTERN = /\b(?:sk|pat|ghp|xox[baprs])[-_][a-z0-9_-]{12,}\b/gi;

function redactAgenticString(value) {
  const bounded = value.length > 12000 ? `${value.slice(0, 12000)}…` : value;
  return bounded
    .replace(BEARER_PATTERN, '[redacted credential]')
    .replace(PRIVATE_TOKEN_PATTERN, '[redacted credential]')
    .replace(EMAIL_PATTERN, '[redacted email]')
    .replace(PHONE_PATTERN, (candidate) => candidate.replace(/\D/g, '').length >= 9 ? '[redacted phone]' : candidate);
}

export function boundedJson(value, maxChars = 16000) {
  const serialized = JSON.stringify(value ?? null, (_key, candidate) => {
    if (typeof candidate === 'string' && candidate.length > 8000) return `${candidate.slice(0, 8000)}…`;
    return candidate;
  });
  if (serialized.length <= maxChars) return serialized;
  return `${serialized.slice(0, Math.max(0, maxChars - 64))}…[size limited]`;
}

export function redactAgenticValue(value, depth = 0) {
  if (depth > 8) return '[depth limited]';
  if (Array.isArray(value)) return value.slice(0, 100).map((entry) => redactAgenticValue(entry, depth + 1));
  if (!value || typeof value !== 'object') return typeof value === 'string' ? redactAgenticString(value) : value;
  return Object.fromEntries(Object.entries(value).slice(0, 200).map(([key, entry]) => [
    key,
    SECRET_KEY_PATTERN.test(key) ? '[redacted]' : redactAgenticValue(entry, depth + 1)
  ]));
}

export function boundedAgenticOutput(value, maxChars = 12000) {
  const redacted = redactAgenticValue(value);
  const limit = Math.max(1000, Math.min(24000, Number(maxChars) || 12000));
  const serialized = JSON.stringify(redacted ?? null);
  if (serialized.length <= limit) return redacted;
  return {
    truncated: true,
    original_type: Array.isArray(redacted) ? 'array' : typeof redacted,
    preview: boundedJson(redacted, limit - 96)
  };
}

export function workflowExecutionPlan(workflow) {
  const nodes = Array.isArray(workflow?.nodes) ? workflow.nodes : [];
  const edges = Array.isArray(workflow?.edges) ? workflow.edges : [];
  if (!nodes.length) throw new Error('Workflow must contain at least one node.');
  if (nodes.length > 60) throw new Error('Workflow is limited to 60 nodes per run.');
  const nodeById = new Map();
  for (const node of nodes) {
    if (!node?.id || nodeById.has(String(node.id))) throw new Error('Every workflow node must have a unique ID.');
    nodeById.set(String(node.id), node);
  }
  const incoming = new Map(nodes.map((node) => [String(node.id), []]));
  const outgoing = new Map(nodes.map((node) => [String(node.id), []]));
  for (const edge of edges) {
    const source = String(edge?.source || '');
    const target = String(edge?.target || '');
    if (!nodeById.has(source) || !nodeById.has(target)) throw new Error(`Workflow edge ${edge?.id || ''} references a missing node.`);
    outgoing.get(source).push(target);
    incoming.get(target).push(source);
  }
  const remainingIncoming = new Map([...incoming].map(([key, value]) => [key, value.length]));
  const ready = nodes.filter((node) => remainingIncoming.get(String(node.id)) === 0).map((node) => String(node.id));
  const ordered = [];
  while (ready.length) {
    const id = ready.shift();
    ordered.push(nodeById.get(id));
    for (const target of outgoing.get(id)) {
      const count = remainingIncoming.get(target) - 1;
      remainingIncoming.set(target, count);
      if (count === 0) ready.push(target);
    }
  }
  if (ordered.length !== nodes.length) throw new Error('Workflow graph contains a cycle. Use a Loop node for bounded iteration.');
  return { ordered, incoming };
}

const tokenSet = (value) => new Set(String(value || '').toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2));

export function rankContextRecords(records, intent, limit = 8, maxChars = 14000) {
  const intentTokens = tokenSet(intent);
  let used = 0;
  return (Array.isArray(records) ? records : [])
    .map((record, index) => {
      const text = boundedJson(redactAgenticValue(record), 5000);
      const tokens = tokenSet(text);
      const score = [...intentTokens].reduce((total, token) => total + (tokens.has(token) ? 1 : 0), 0);
      return { index, record: redactAgenticValue(record), score, size: text.length };
    })
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .filter((candidate) => {
      if (used + candidate.size > maxChars) return false;
      used += candidate.size;
      return true;
    })
    .slice(0, Math.max(1, Math.min(20, Number(limit) || 8)))
    .map(({ record, score }) => ({ ...record, _relevance: score }));
}

export function incomingNodePayload(nodeId, incoming, resultsByNodeId, workflowInput) {
  const sourceIds = incoming.get(String(nodeId)) || [];
  if (!sourceIds.length) return redactAgenticValue(workflowInput || {});
  return Object.fromEntries(sourceIds.map((sourceId) => {
    const result = resultsByNodeId.get(sourceId);
    return [result?.output_key || sourceId, redactAgenticValue(result?.output ?? null)];
  }));
}

export function nodeRuntimeSettings(node) {
  const data = node?.data || {};
  return {
    kind: String(data.kind || 'transform'),
    maxContextChars: Math.max(2000, Math.min(24000, Number(data.maxContextChars || 14000))),
    maxOutputChars: Math.max(1000, Math.min(24000, Number(data.maxOutputChars || 12000))),
    retryCount: Math.max(0, Math.min(3, Number(data.retryCount || 0))),
    timeoutMs: Math.max(5000, Math.min(120000, Number(data.timeoutMs || 45000))),
    topK: Math.max(1, Math.min(20, Number(data.topK || 8)))
  };
}
