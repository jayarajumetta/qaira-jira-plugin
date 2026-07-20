import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('sprint and module hierarchies load bounded children only after expansion', async () => {
  const [backend, requirementsPage, testCasesPage, apiClient] = await Promise.all([
    read('src/qairaApi.js'),
    read('static/qaira-ui/src/pages/RequirementsPage.tsx'),
    read('static/qaira-ui/src/pages/TestCasesPage.tsx'),
    read('static/qaira-ui/src/lib/api.ts')
  ]);

  assert.match(backend, /method === 'GET'[\s\S]*listStoredRequirementRefsPage/);
  assert.match(backend, /listStoredTestCaseRefsPage[\s\S]*next_cursor/);
  assert.match(requirementsPage, /unassigned: true, page_size: 15/);
  assert.match(requirementsPage, /useQueries\([\s\S]*listRequirements\(iteration\.id, \{ page_size: 25/);
  assert.match(testCasesPage, /unassigned_module: true, page_size: 15/);
  assert.match(testCasesPage, /useQueries\([\s\S]*listCases\(module\.id, \{ page_size: 25/);
  assert.match(testCasesPage, /executionResults\.list\(\{ app_type_id: appTypeId, run_limit: 10, limit: 100 \}\)/);
  assert.match(apiClient, /export type PagedResult<T>/);
});

test('run snapshots preserve suite-module-case metrics and assignment inheritance', async () => {
  const [backend, page, types] = await Promise.all([
    read('src/qairaApi.js'),
    read('static/qaira-ui/src/pages/ExecutionsPage.tsx'),
    read('static/qaira-ui/src/types.ts')
  ]);

  assert.match(backend, /module_snapshots: moduleSnapshots/);
  assert.match(backend, /function effectiveRunScopeAssignment[\s\S]*source: 'case'[\s\S]*source: 'module'[\s\S]*source: 'suite'[\s\S]*source: runIds\.length \? 'run'/);
  assert.match(backend, /function canonicalRunScopeAssignment/);
  assert.match(backend, /\(suites\|modules\|cases\).*assignment/);
  assert.match(page, /className="execution-module-scope"/);
  assert.match(page, /label: "Pass rate"/);
  assert.match(page, /handleScopeAssignmentChange\("modules"/);
  assert.match(types, /module_id\?: string \| null/);
  assert.match(types, /suite_assignments\?: Record<string, string\[]>/);
});

test('run lists remain lightweight while selected runs hydrate sharded scope', async () => {
  const [backend, page, types] = await Promise.all([
    read('src/qairaApi.js'),
    read('static/qaira-ui/src/pages/ExecutionsPage.tsx'),
    read('static/qaira-ui/src/types.ts')
  ]);

  assert.match(backend, /options\.hydrateScope === false[\s\S]*embeddedSpec[\s\S]*loadRunExecutionSpec/);
  assert.match(backend, /mapExecution\(issue, project, registry, \{ hydrateScope: false \}\)/);
  assert.match(backend, /scope_case_count: Number\(spec\.scope_case_count/);
  assert.match(page, /function executionScopeCaseCount/);
  assert.match(page, /execution\.test_case_ids \|\| \[\]/);
  assert.match(types, /scope_case_count\?: number/);
});

test('all generative paths use server-owned Qaira guardrails and PII redaction', async () => {
  const [backend, runtime] = await Promise.all([
    read('src/qairaApi.js'),
    read('src/agenticWorkflowRuntime.js')
  ]);

  assert.match(backend, /AI_GUARDRAIL_REJECTED/);
  assert.match(backend, /AI_CAPABILITY_NOT_ALLOWED/);
  assert.match(backend, /custom_prompt_controls_removed: true/);
  assert.match(backend, /tools_disabled: true/);
  assert.match(backend, /const guardedInput = guardedAiInput\('agentic-qe-step'/);
  assert.doesNotMatch(backend, /instructions: data\.instructions \|\| data\.prompt/);
  assert.match(runtime, /\[redacted email\]/);
  assert.match(runtime, /\[redacted phone\]/);
  assert.match(runtime, /\[redacted credential\]/);
});

test('Forge hot paths use bulk projections, hard scope budgets, and canonical pagination state', async () => {
  const [backend, manifest, requirementsPage, testCasesPage, loadMoreButton] = await Promise.all([
    read('src/qairaApi.js'),
    read('manifest.yml'),
    read('static/qaira-ui/src/pages/RequirementsPage.tsx'),
    read('static/qaira-ui/src/pages/TestCasesPage.tsx'),
    read('static/qaira-ui/src/components/HierarchyLoadMoreButton.tsx')
  ]);

  assert.match(backend, /const MAX_RUN_SCOPE_CASES = 100/);
  assert.match(backend, /const MAX_RUN_SCOPE_STEPS = 2500/);
  assert.match(backend, /async function loadScopedIssues/);
  assert.match(backend, /properties: \[TEST_SPEC_PROP, MODULE_ASSIGN_PROP\]/);
  assert.match(backend, /properties: \[SUITE_PROP\]/);
  assert.match(backend, /qairaTestAppType =/);
  assert.match(backend, /qairaTestModuleId is EMPTY/);
  assert.match(backend, /is_last: result\?\.isLast === true \|\| !nextCursor/);
  assert.doesNotMatch(backend, /const assignmentMatch = pathname\.match\(\/\^\\\/executions/);
  assert.match(manifest, /searchAlias: qairaTestModuleId/);
  assert.match(manifest, /searchAlias: qairaSuiteAppType/);
  assert.match(requirementsPage, /<HierarchyLoadMoreButton/);
  assert.match(testCasesPage, /<HierarchyLoadMoreButton/);
  assert.match(loadMoreButton, /aria-label=\{[\s\S]*Load/);
});

test('run scope shards use copy-on-write generations before obsolete cleanup', async () => {
  const backend = await read('src/qairaApi.js');
  assert.match(backend, /function runScopePropertyKey\(generation, index\)/);
  assert.match(backend, /const shardGeneration =/);
  const persistStart = backend.indexOf('async function persistRunExecutionSpec');
  const persistEnd = backend.indexOf('const TEST_DATA_GENERATOR_TOKEN_PATTERN', persistStart);
  const persist = backend.slice(persistStart, persistEnd);
  const shardWrite = persist.indexOf('const shardWriteErrors = await mapInBatches');
  const rootCommit = persist.indexOf('await putIssueProperty(issueIdOrKey, RUN_PROP, next)');
  const obsoleteCleanup = persist.indexOf('previousShardKeys.filter');
  assert.ok(shardWrite >= 0 && rootCommit > shardWrite, 'new shards must be fully written before the root pointer');
  assert.ok(obsoleteCleanup > rootCommit, 'old shards must be cleaned only after the root pointer commits');
});

test('AI fallback details are classified without exposing provider response text', async () => {
  const backend = await read('src/qairaApi.js');
  assert.match(backend, /function safeAiFallbackReason/);
  assert.match(backend, /fallbackReason = safeAiFallbackReason\(error\)/);
  assert.doesNotMatch(backend, /fallbackReason = optionalString\(error\?\.context\?\.responseText/);
  assert.doesNotMatch(backend, /act as \(\?:an\?\|the\)/);
  assert.match(backend, /evidence: asArray\(redactAgenticValue\(evidence\)\)/);
});

test('Jira create-screen mandatory fields remain metadata driven in Story and Bug forms', async () => {
  const [backend, helper, requirementsPage, issuesPage, manifest] = await Promise.all([
    read('src/qairaApi.js'),
    read('static/qaira-ui/src/lib/jiraCreateMetadata.ts'),
    read('static/qaira-ui/src/pages/RequirementsPage.tsx'),
    read('static/qaira-ui/src/pages/IssuesPage.tsx'),
    read('manifest.yml')
  ]);

  assert.match(backend, /issue\/createmeta\/\$\{project\.key\}\/issuetypes/);
  assert.match(helper, /field\.required[\s\S]*!field\.has_default_value/);
  assert.match(requirementsPage, /jiraRequirementCoreRequired\.sprint/);
  assert.match(requirementsPage, /jiraRequirementCoreRequired\.release/);
  assert.match(issuesPage, /jiraBugCoreRequired\.assignee/);
  assert.match(issuesPage, /jiraBugCoreRequired\.sprint/);
  assert.match(backend, /JIRA_CREATE_METADATA_UNAVAILABLE/);
  assert.match(requirementsPage, /requirementCreateMetadataQuery\.isError/);
  assert.match(issuesPage, /bugCreateMetadataQuery\.isError/);
  assert.match(manifest, /write:board-scope:jira-software/);
});

test('Jira Story and Bug edits preserve mandatory custom fields and native delivery scope', async () => {
  const [backend, client, requirementsPage, issuesPage, sharedFields] = await Promise.all([
    read('src/qairaApi.js'),
    read('static/qaira-ui/src/lib/api.ts'),
    read('static/qaira-ui/src/pages/RequirementsPage.tsx'),
    read('static/qaira-ui/src/pages/IssuesPage.tsx'),
    read('static/qaira-ui/src/components/JiraRequiredFields.tsx')
  ]);

  assert.match(backend, /\/rest\/api\/3\/issue\/\$\{issueRef\}\/editmeta/);
  assert.match(backend, /function jiraAdditionalUpdateFields/);
  assert.match(backend, /jiraIssueEditMetadata\(project, registry, itemMatch\[1\], 'requirement'\)/);
  assert.match(backend, /jiraIssueEditMetadata\(project, registry, itemMatch\[1\], 'bug'\)/);
  assert.match(backend, /'sprint-update'/);
  assert.match(backend, /\/rest\/agile\/1\.0\/backlog\/issue/);
  assert.match(backend, /SPRINT_MEMBERSHIP_CHANGED/);
  assert.match(backend, /strictFieldIds/);
  assert.match(backend, /JIRA_FIELD_CONFIGURATION_CHANGED/);
  assert.match(backend, /currentIteration\.jira_sprint_id[\s\S]*JIRA_SPRINT_OWNED/);
  assert.match(client, /editMetadata: \(id: string[\s\S]*\/requirements\/\$\{id\}\/edit-metadata/);
  assert.match(client, /\/feedback\/\$\{id\}\/edit-metadata/);
  assert.match(requirementsPage, /requirementEditMetadataQuery/);
  assert.match(requirementsPage, /additional_fields: draft\.additionalFields/);
  assert.match(issuesPage, /bugEditMetadataQuery/);
  assert.match(sharedFields, /Required by the Jira \$\{issueTypeName\} \$\{mode\} screen/);
});

test('project and application-space switching is lazy, collapsible, and bidirectional', async () => {
  const [shell, scopeHook] = await Promise.all([
    read('static/qaira-ui/src/components/AppShell.tsx'),
    read('static/qaira-ui/src/hooks/useCurrentProject.ts')
  ]);

  assert.match(shell, /function SidebarScopeProjectBranch/);
  assert.match(shell, /enabled: isExpanded/);
  assert.match(shell, /Projects and application spaces/);
  assert.match(shell, /setCurrentScope\(targetProjectId, targetAppTypeId\)/);
  assert.match(shell, /aria-expanded=\{areProjectsExpanded\}/);
  assert.match(scopeHook, /export const setCurrentScope/);
  assert.match(scopeHook, /writeCurrentAppTypeId\(normalizedProjectId, appTypeId\)[\s\S]*writeCurrentProjectId\(normalizedProjectId\)/);
});
