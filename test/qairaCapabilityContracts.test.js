import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const apiSource = read('src/qairaApi.js');
const accessSource = read('src/qairaAccess.js');
const createRunSource = read('static/qaira-ui/src/components/CreateRunActionButton.tsx');
const reportBugSource = read('static/qaira-ui/src/components/ReportBugSplitActionButton.tsx');
const designSource = read('static/qaira-ui/src/pages/DesignPage.tsx');
const testCasesSource = read('static/qaira-ui/src/pages/TestCasesPage.tsx');
const executionsSource = read('static/qaira-ui/src/pages/ExecutionsPage.tsx');
const automationSource = read('static/qaira-ui/src/pages/AutomationPage.tsx');
const agenticSource = read('static/qaira-ui/src/pages/AgenticWorkflowsPage.tsx');
const requirementsSource = read('static/qaira-ui/src/pages/RequirementsPage.tsx');
const issuesSource = read('static/qaira-ui/src/pages/IssuesPage.tsx');
const columnPreferencesSource = read('static/qaira-ui/src/lib/tablePreferences/columnPreferences.ts');

const columnExcerpt = (source, key) => {
  const marker = `key: "${key}"`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `missing column ${key}`);
  return source.slice(start, start + 260);
};

test('automation execution variants require their own permission and fail-closed feature', () => {
  assert.match(accessSource, /automation\.run\.parallel/);
  assert.match(accessSource, /qaira\.automation\.parallel_execution/);
  assert.match(apiSource, /isSuiteAutomationConfiguration/);
  assert.match(apiSource, /executionCapabilityModes/);
  assert.match(apiSource, /storedRun\?\.execution_mode/);
  assert.match(apiSource, /storedRun\?\.parallel_enabled/);
  assert.match(apiSource, /requiredAutomationPermission/);
  assert.match(apiSource, /featureKeys\.push\('qaira\.automation\.parallel_execution'\)/);
  assert.match(apiSource, /featureKeys\.push\('qaira\.automation\.local_execution'\)/);
  assert.match(apiSource, /featureKeys\.push\('qaira\.automation\.remote_execution'\)/);

  for (const source of [designSource, testCasesSource, executionsSource]) {
    assert.match(source, /canConfigureParallelAutomation/);
    assert.match(source, /qaira\.automation\.parallel_execution/);
    assert.match(source, /canRunLocalAutomation/);
    assert.match(source, /canRunRemoteAutomation/);
  }

  assert.match(createRunSource, /qaira\.automation\.workspace/);
  assert.match(createRunSource, /qaira\.automation\.local_execution/);
  assert.match(createRunSource, /qaira\.automation\.remote_execution/);
});

test('manual automation, AI automation, and agentic workflows remain independently gated', () => {
  assert.match(apiSource, /body\?\.ai_requested === true/);
  assert.match(apiSource, /isAiAutomationRequest/);
  assert.match(apiSource, /featureKeys\.push\('qaira\.ai\.automation'\)/);
  assert.match(testCasesSource, /ai_requested:\s*aiRequested/);
  assert.match(automationSource, /ai_requested:\s*true/);
  assert.match(automationSource, /isAutomationWorkspaceEnabled/);

  assert.match(agenticSource, /qaira\.ai\.agentic_workflows/);
  assert.match(agenticSource, /agentic_workflow\.manage/);
  assert.match(agenticSource, /agentic_workflow\.run/);
  assert.match(agenticSource, /canManageAgenticWorkflows/);
  assert.match(agenticSource, /canRunAgenticWorkflows/);
});

test('AI calls use concise capability-specific JSON contracts and bounded async fan-out', () => {
  assert.match(apiSource, /const AI_OUTPUT_CONTRACTS = \{/);
  for (const capability of [
    'requirement-creation-preview',
    'multi-requirement-test-design-preview',
    'test-case-authoring-preview',
    'test-step-rephrase-preview',
    'smart-run-scope-preview',
    'execution-failure-clustering-preview',
    'execution-case-triage',
    'quality-dashboard-design-preview',
    'rich-text-authoring-rephrase'
  ]) {
    assert.ok(apiSource.includes(`'${capability}'`), `missing AI output contract for ${capability}`);
  }
  assert.match(apiSource, /Return only one valid JSON object matching output_draft/);
  assert.match(apiSource, /projectAiOutputDraft/);
  assert.match(apiSource, /allowRepair === true/);
  assert.match(apiSource, /mapInBatches\(requirementIds/);
  assert.match(apiSource, /parallel_requirement_limit/);
  assert.match(apiSource, /llmTimeoutMs:\s*ASYNC_AI_LLM_TIMEOUT_MS/);
});

test('run split actions use one compact menu without explanatory copy', () => {
  assert.match(createRunSource, /run-action-main issue-report-split-main/);
  assert.match(createRunSource, /<strong>Local Run<\/strong>/);
  assert.match(createRunSource, /<strong>Remote Run<\/strong>/);
  assert.doesNotMatch(createRunSource, /InfoTooltip/);
  assert.doesNotMatch(createRunSource, /ready for run creation/);
  assert.match(reportBugSource, /run-action-main issue-report-split-main/);
  assert.match(executionsSource, /<ReportBugSplitActionButton/);
  assert.match(testCasesSource, /run-action-main issue-report-split-main/);
});

test('transaction lists start with operational columns while preserving saved preferences', () => {
  assert.doesNotMatch(columnExcerpt(requirementsSource, 'id'), /defaultVisible:\s*false/);
  assert.doesNotMatch(columnExcerpt(requirementsSource, 'linkedCases'), /defaultVisible:\s*false/);
  assert.match(columnExcerpt(requirementsSource, 'description'), /defaultVisible:\s*false/);

  for (const key of ['aiGenerated', 'reviewStatus', 'quality', 'suites']) {
    assert.match(columnExcerpt(testCasesSource, key), /defaultVisible:\s*false/);
  }
  for (const key of ['created', 'sprint', 'build', 'suites']) {
    assert.match(columnExcerpt(executionsSource, key), /defaultVisible:\s*false/);
  }
  for (const key of ['description', 'jira']) {
    assert.match(columnExcerpt(issuesSource, key), /defaultVisible:\s*false/);
  }

  assert.match(columnPreferencesSource, /localStorage\.getItem/);
  assert.match(columnPreferencesSource, /localStorage\.setItem/);
  assert.match(columnPreferencesSource, /defaultVisible/);
});
