import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { permissionForRequest } from '../src/qairaAccess.js';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('Bug bulk operations and AI triage use explicit permission boundaries', () => {
  assert.equal(permissionForRequest('/feedback/export', 'POST'), 'feedback.view');
  assert.equal(permissionForRequest('/feedback/bulk-delete', 'DELETE'), 'feedback.manage');
  assert.equal(permissionForRequest('/feedback/ai-triage-preview', 'POST'), 'feedback.manage');
});

test('Bug selection is controlled by one model across tile and list views', async () => {
  const page = await read('static/qaira-ui/src/pages/IssuesPage.tsx');

  assert.match(page, /const \[selectedActionIssueIds, setSelectedActionIssueIds\] = useState<string\[]>\(\[]\)/);
  assert.match(page, /key: "select"[\s\S]*selectedActionIssueIdSet\.has\(item\.id\)[\s\S]*toggleIssueSelection\(item\.id, event\.target\.checked\)/);
  assert.match(page, /className="tile-card-select-row"[\s\S]*selectedActionIssueIdSet\.has\(item\.id\)[\s\S]*toggleIssueSelection\(item\.id, event\.target\.checked\)/);
  assert.match(page, /onSelectAll=\{\(\) => setAllVisibleIssuesSelected\(true\)\}/);
  assert.match(page, /onClear=\{\(\) => setSelectedActionIssueIds\(\[]\)\}/);
  assert.match(page, /enableRowSelection=\{false\}/);
  assert.match(page, /setSelectedActionIssueIds\(\[]\);[\s\S]*setIsAiBugTriageOpen\(false\);[\s\S]*\[projectId\]/);
});

test('Bug export hydrates selected Jira details in bounded project-scoped batches', async () => {
  const [backend, client, page] = await Promise.all([
    read('src/qairaApi.js'),
    read('static/qaira-ui/src/lib/api.ts'),
    read('static/qaira-ui/src/pages/IssuesPage.tsx')
  ]);

  const handlerStart = backend.indexOf("pathname === '/feedback/export'");
  const handler = backend.slice(handlerStart, backend.indexOf("pathname === '/feedback/bulk-delete'", handlerStart));
  assert.match(handler, /MAX_SYNC_EXPORT_RECORDS/);
  assert.match(handler, /loadScopedIssues\(issueIds, project, registry/);
  assert.match(handler, /nativeKind: 'defects'/);
  assert.match(handler, /properties: \[DEFECT_PROP\]/);
  assert.match(handler, /mapBug\(issue, registry\)/);
  assert.match(client, /export: \(input: \{ project_id: string; issue_ids: string\[] \}\)[\s\S]*"\/feedback\/export"/);
  assert.match(page, /BUG_EXPORT_BATCH_SIZE = 100/);
  assert.match(page, /api\.issues\.export\(\{[\s\S]*project_id: projectId,[\s\S]*issue_ids: selectedIssueIds\.slice/);
  assert.match(page, /Steps To Reproduce[\s\S]*Expected Result[\s\S]*Actual Result[\s\S]*Root Cause/);
});

test('Bug deletion validates project scope, batches Jira writes, and retains partial failures', async () => {
  const [backend, client, page] = await Promise.all([
    read('src/qairaApi.js'),
    read('static/qaira-ui/src/lib/api.ts'),
    read('static/qaira-ui/src/pages/IssuesPage.tsx')
  ]);

  const handlerStart = backend.indexOf("if (pathname === '/feedback/bulk-delete' && method === 'DELETE')");
  const handler = backend.slice(handlerStart, backend.indexOf("if (pathname === '/feedback/ai-triage-preview' && method === 'POST')", handlerStart));
  assert.match(backend, /MAX_BULK_BUG_DELETE_ITEMS = 20/);
  assert.match(handler, /MAX_BULK_BUG_DELETE_ITEMS/);
  assert.match(handler, /loadScopedIssues\(issueIds, project, registry/);
  assert.match(handler, /nativeKind: 'defects'/);
  assert.match(handler, /settleInBatches\(scopedBugs[\s\S]*deleteIssue\(issue\.key \|\| issue\.id\), 5\)/);
  assert.match(handler, /deleted_ids: deletedIds/);
  assert.match(handler, /failed: failures\.length/);
  assert.match(client, /bulkDelete:[\s\S]*"\/feedback\/bulk-delete"[\s\S]*method: "DELETE"/);
  assert.match(page, /confirmDelete\(\{[\s\S]*Delete \$\{selectedIssueIds\.length\} selected Bug/);
  assert.match(page, /setSelectedActionIssueIds\(\(current\) => current\.filter\(\(id\) => !deletedIdSet\.has\(id\)\)\)/);
  assert.match(page, /canManageBugs \? \{[\s\S]*handleDeleteSelectedIssues/);
});

test('AI Bug triage is bounded, explainable, feature gated, and preview only', async () => {
  const [backend, access, client, page, types] = await Promise.all([
    read('src/qairaApi.js'),
    read('src/qairaAccess.js'),
    read('static/qaira-ui/src/lib/api.ts'),
    read('static/qaira-ui/src/pages/IssuesPage.tsx'),
    read('static/qaira-ui/src/types.ts')
  ]);

  assert.match(backend, /MAX_AI_BUG_TRIAGE_ITEMS = 10/);
  assert.match(backend, /'bug-triage-preview': \{[\s\S]*triage\.\*\.category[\s\S]*triage\.\*\.recommended_priority[\s\S]*triage\.\*\.explanation/);
  assert.match(backend, /pathname === '\/feedback\/ai-triage-preview'[\s\S]*loadScopedIssues\(issueIds, project, registry/);
  const handlerStart = backend.indexOf("if (pathname === '/feedback/ai-triage-preview' && method === 'POST')");
  const handler = backend.slice(handlerStart, backend.indexOf("if (pathname === '/feedback/ai-draft-preview' && method === 'POST')", handlerStart));
  assert.doesNotMatch(handler, /updateIssue\(|putIssueProperty\(|deleteIssue\(|createIssue\(/);
  assert.match(backend, /pathname === '\/feedback\/ai-triage-preview'[\s\S]*side-effect free[\s\S]*return null/);
  assert.match(backend, /deterministicBugTriage/);
  assert.match(backend, /preview_only: true,[\s\S]*decision_requires_human_approval: true/);
  assert.match(backend, /No Jira field is updated by this preview/);
  assert.match(access, /qaira\.ai\.bug_triage/);
  assert.match(client, /previewAiTriage:[\s\S]*"\/feedback\/ai-triage-preview"/);
  assert.match(types, /export type AiBugTriagePreview = AiAssistedPreviewBase/);
  assert.match(page, /areFeatureFlagsEnabled\(featureFlagsQuery\.data, \["qaira\.ai\.bug_triage"\]\)/);
  assert.match(page, /<AiInsightPreviewDialog[\s\S]*title="Classify and prioritize Bugs"/);
  assert.match(page, /Nothing is updated automatically/);
  assert.doesNotMatch(page.slice(page.indexOf('const openSelectedBugTriage'), page.indexOf('const handleAddAiReferenceImages')), /api\.issues\.update/);
});
