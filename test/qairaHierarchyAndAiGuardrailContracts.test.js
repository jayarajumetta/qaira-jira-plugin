import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('adaptive hierarchy pagination fully loads small groups and bounds large continuations', async () => {
  const { getHierarchyPageSize, getUnassignedPageSize } = await import(
    new URL('static/qaira-ui/src/lib/hierarchyPagination.ts', root)
  );

  assert.equal(getHierarchyPageSize(1, 0), 1);
  assert.equal(getHierarchyPageSize(50, 0), 50);
  assert.equal(getHierarchyPageSize(51, 0), 25);
  assert.equal(getHierarchyPageSize(0, 0), 50);
  assert.equal(getHierarchyPageSize(undefined, 0), 50);
  assert.equal(getHierarchyPageSize(12, 1), 25);
  assert.equal(getUnassignedPageSize(false), 50);
  assert.equal(getUnassignedPageSize(true), 25);
});

test('sprint and module hierarchies adapt bounded child pages only after expansion', async () => {
  const [backend, requirementsPage, testCasesPage, apiClient, hierarchyPagination] = await Promise.all([
    read('src/qairaApi.js'),
    read('static/qaira-ui/src/pages/RequirementsPage.tsx'),
    read('static/qaira-ui/src/pages/TestCasesPage.tsx'),
    read('static/qaira-ui/src/lib/api.ts'),
    read('static/qaira-ui/src/lib/hierarchyPagination.ts')
  ]);

  assert.match(backend, /method === 'GET'[\s\S]*listStoredRequirementRefsPage/);
  assert.match(backend, /listStoredTestCaseRefsPage[\s\S]*next_cursor/);
  assert.match(backend, /let moduleScope = null;[\s\S]*qairaTestModuleId = \$\{jqlQuote\(moduleScope\.id\)\}/);
  assert.match(backend, /caseList[\s\S]*method === 'GET'[\s\S]*return listTestCases\(found\.project, registry/);
  assert.match(requirementsPage, /unassigned: true,[\s\S]*page_size: getUnassignedPageSize\(Boolean\(pageParam\)\)/);
  assert.match(requirementsPage, /useQueries\([\s\S]*listRequirements\(iteration\.id, \{[\s\S]*page_size: getHierarchyPageSize\(iteration\.requirement_count, pageIndex\)/);
  assert.match(testCasesPage, /unassigned_module: true,[\s\S]*page_size: getUnassignedPageSize\(Boolean\(pageParam\)\)/);
  assert.match(testCasesPage, /useQueries\([\s\S]*listCases\(module\.id, \{[\s\S]*page_size: getHierarchyPageSize\(module\.test_case_count, pageIndex\)/);
  assert.match(hierarchyPagination, /HIERARCHY_COMPLETE_LOAD_LIMIT = 50/);
  assert.match(hierarchyPagination, /HIERARCHY_LARGE_PAGE_SIZE = 25/);
  assert.match(hierarchyPagination, /normalizedTotal <= HIERARCHY_COMPLETE_LOAD_LIMIT/);
  assert.match(hierarchyPagination, /pageIndex > 0/);
  assert.match(testCasesPage, /executionResults\.list\(\{ app_type_id: appTypeId, run_limit: 10, limit: 100 \}\)/);
  assert.match(apiClient, /export type PagedResult<T>/);
});

test('hierarchy expansion state is explicit and survives query refresh without cached-navigation seeding races', async () => {
  const [requirementsPage, testCasesPage] = await Promise.all([
    read('static/qaira-ui/src/pages/RequirementsPage.tsx'),
    read('static/qaira-ui/src/pages/TestCasesPage.tsx')
  ]);

  assert.match(requirementsPage, /const \[expandedIterationIds, setExpandedIterationIds\] = useState<string\[]>\(\[\]\)/);
  assert.match(requirementsPage, /expandedSprintHeaders[\s\S]*expandedIterationIds\.includes\(iteration\.id\)/);
  assert.match(requirementsPage, /const refresh = async \(\) => \{[\s\S]*setSprintPageCursorsById\(\{\}\);/);
  assert.doesNotMatch(requirementsPage, /isSprintHierarchySeeded|knownIterationIdsRef/);

  assert.match(testCasesPage, /const \[expandedModuleIds, setExpandedModuleIds\] = useState<string\[]>\(\[\]\)/);
  assert.match(testCasesPage, /expandedModuleHeaders[\s\S]*expandedModuleIds\.includes\(module\.id\)/);
  assert.match(testCasesPage, /const refreshCases = async \(\) => \{[\s\S]*setModulePageCursorsById\(\{\}\);/);
  assert.doesNotMatch(testCasesPage, /isModuleHierarchySeeded|knownModuleIdsRef/);
});

test('collapse discards continuation cursors and refresh refetches only active first pages', async () => {
  const [requirementsPage, testCasesPage] = await Promise.all([
    read('static/qaira-ui/src/pages/RequirementsPage.tsx'),
    read('static/qaira-ui/src/pages/TestCasesPage.tsx')
  ]);

  assert.match(requirementsPage, /toggleSprintExpansion[\s\S]*delete next\[iterationId\]/);
  assert.match(requirementsPage, /Number\(key\[3\]\) > 0[\s\S]*!\(iterationId in sprintPageCursorsById\)/);
  assert.match(requirementsPage, /refetchQueries\(\{[\s\S]*type: "active"[\s\S]*Number\(key\[3\]\) === 0/);
  const requirementRefresh = requirementsPage.slice(requirementsPage.indexOf('const refresh = async'), requirementsPage.indexOf('const openCreateRequirementModal'));
  assert.doesNotMatch(requirementRefresh, /removeQueries|cancelQueries/);

  assert.match(testCasesPage, /toggleModuleExpansion[\s\S]*delete next\[moduleId\]/);
  assert.match(testCasesPage, /Number\(key\[4\]\) > 0[\s\S]*!\(moduleId in modulePageCursorsById\)/);
  assert.match(testCasesPage, /refetchQueries\(\{[\s\S]*type: "active"[\s\S]*Number\(key\[4\]\) === 0/);
  const caseRefresh = testCasesPage.slice(testCasesPage.indexOf('const refreshCases = async'), testCasesPage.indexOf('const refreshSharedGroups'));
  assert.doesNotMatch(caseRefresh, /removeQueries|cancelQueries/);
});

test('unknown compact hierarchy fields remain incomplete instead of becoming false zero-risk metrics', async () => {
  const { deriveIterationHealth, deriveModuleHealth } = await import(
    new URL('static/qaira-ui/src/lib/hierarchyHealth.ts', root)
  );

  const unknownModuleHealth = deriveModuleHealth([{
    priority: 1,
    linkedRequirement: undefined,
    stepCount: undefined,
    automated: undefined,
    recentStatuses: []
  }]);
  assert.equal(unknownModuleHealth.count, 1);
  assert.equal(unknownModuleHealth.summaryComplete, false);
  assert.equal(unknownModuleHealth.unknownSummaryCount, 1);
  assert.equal(unknownModuleHealth.riskCount, 0);

  const knownZeroModuleHealth = deriveModuleHealth([{
    priority: 1,
    linkedRequirement: false,
    stepCount: 0,
    automated: false,
    recentStatuses: []
  }]);
  assert.equal(knownZeroModuleHealth.summaryComplete, true);
  assert.equal(knownZeroModuleHealth.riskCount, 1);

  const requirementHealth = deriveIterationHealth([{
    linkedCaseCount: 1,
    passPercent: 80,
    automationPercent: undefined
  }], true);
  assert.equal(requirementHealth.readinessPercent, 80);
});

test('bounded requirement suggestions never erase links or report partial automation as zero', async () => {
  const requirementsPage = await read('static/qaira-ui/src/pages/RequirementsPage.tsx');

  assert.match(requirementsPage, /requirements-test-cases[\s\S]*page_size: 25, projection: "summary"/);
  assert.match(requirementsPage, /map\[requirement\.id\] = \[\.\.\.new Set\(\(requirement\.test_case_ids \|\| \[\]\)\.map\(String\)\)\]/);
  assert.doesNotMatch(requirementsPage, /test_case_ids[\s\S]{0,160}filter\(\(testCaseId\) => testCaseIds\.has/);
  assert.match(requirementsPage, /const complete = known === total/);
  assert.match(requirementsPage, /metric\.complete === false[\s\S]*return "—"/);
  assert.match(requirementsPage, /selectedTestCaseFallbackLabels[\s\S]*unresolvedSelectedIds/);
});

test('requirement summaries disclose lazy references while explicit export hydrates authoritative details in bulk', async () => {
  const [backend, requirementsPage, apiClient, types] = await Promise.all([
    read('src/qairaApi.js'),
    read('static/qaira-ui/src/pages/RequirementsPage.tsx'),
    read('static/qaira-ui/src/lib/api.ts'),
    read('static/qaira-ui/src/types.ts')
  ]);

  const fullMapper = backend.slice(backend.indexOf('async function mapRequirement('), backend.indexOf('function mapRequirementSummary'));
  const summaryMapper = backend.slice(backend.indexOf('function mapRequirementSummary'), backend.indexOf('async function mapTestCase'));
  assert.match(fullMapper, /detail_complete: true/);
  assert.match(summaryMapper, /detail_complete: false/);
  assert.match(types, /export type Requirement = \{[\s\S]*detail_complete\?: boolean/);
  assert.match(requirementsPage, /item\.detail_complete === false[\s\S]*"Open for references"/);
  assert.match(requirementsPage, /External references load only when a Story is opened/);

  const exportStart = backend.indexOf("pathname === '/requirements/export'");
  const exportHandler = backend.slice(exportStart, backend.indexOf("pathname === '/requirements/ai-create-jobs'", exportStart));
  assert.match(exportHandler, /MAX_SYNC_EXPORT_RECORDS/);
  assert.match(exportHandler, /Promise\.all\(exportPages\)/);
  assert.match(exportHandler, /\[QAIRA_DELETE_PROP, REQUIREMENT_PROP\]/);
  assert.match(exportHandler, /requirement_records: requirementRecords/);
  assert.doesNotMatch(exportHandler, /for \(const requirementId of requestedIds\)[\s\S]*loadScopedIssue/);
  assert.match(apiClient, /requirement_records\?: Requirement\[]/);
  assert.match(requirementsPage, /authoritativeRequirements = asArray\(response\.requirement_records\)/);
  assert.doesNotMatch(requirementsPage, /downloadCsvRecords\("qaira-requirements\.csv", selectedExportRequirements\.map/);
});

test('hierarchy selection survives collapse while scoped search stays honest about unloaded children', async () => {
  const [requirementsPage, testCasesPage] = await Promise.all([
    read('static/qaira-ui/src/pages/RequirementsPage.tsx'),
    read('static/qaira-ui/src/pages/TestCasesPage.tsx')
  ]);

  assert.doesNotMatch(requirementsPage, /setDeleteSelectedRequirementIds\(\(current\) => current\.filter\(\(id\) => requirements\.some/);
  assert.doesNotMatch(testCasesPage, /setSelectedActionTestCaseIds\(\(current\) => current\.filter\(\(id\) => testCases\.some/);
  assert.match(requirementsPage, /selectedRequirementSnapshotsRef[\s\S]*selectedRequirementRecords/);
  assert.match(testCasesPage, /selectedActionCaseSnapshotsRef[\s\S]*selectedActionCases/);
  assert.match(requirementsPage, /const dragIds = \[\.\.\.new Set\(candidateIds\.filter\(Boolean\)\)\]/);
  assert.match(testCasesPage, /const dragIds = \[\.\.\.new Set\(candidateIds\.filter\(Boolean\)\)\]/);
  assert.doesNotMatch(requirementsPage, /knownRequirementIds/);
  assert.doesNotMatch(testCasesPage, /knownCaseIds/);

  assert.match(requirementsPage, /hasIncompleteRequirementFilterScope[\s\S]*Search and filters cover loaded summary fields/);
  assert.match(testCasesPage, /hasIncompleteCaseFilterScope[\s\S]*Search and filters cover loaded test cases/);
  assert.match(requirementsPage, /groupRequirements\.length \|\| !hasActiveRequirementCatalogFilter\) return true/);
  assert.match(requirementsPage, /if \(iteration\.source === "jira"\) return undefined/);
  assert.match(requirementsPage, /pageState\.failedPageIndex !== null[\s\S]*Boolean\(pageState\.nextCursor\)/);
  assert.match(testCasesPage, /pageState\.failedPageIndex !== null[\s\S]*Boolean\(pageState\.nextCursor\)/);
  assert.match(requirementsPage, /aria-label="Count on expand; Sprint metrics/);
  assert.match(testCasesPage, /aria-label="Count on expand; module metrics/);
  assert.match(requirementsPage, /draggable=\{canUpdateRequirementIterations && !isDeletingSelectedRequirements\}/);
  assert.match(testCasesPage, /draggable=\{canUpdateTestCases && !isDeletingSelectedTestCases\}/);
});

test('hierarchy continuation controls require a verified backend page and distinguish initial expansion loading', async () => {
  const [requirementsPage, testCasesPage, collectionGuards, loadMoreButton] = await Promise.all([
    read('static/qaira-ui/src/pages/RequirementsPage.tsx'),
    read('static/qaira-ui/src/pages/TestCasesPage.tsx'),
    read('static/qaira-ui/src/lib/collectionGuards.ts'),
    read('static/qaira-ui/src/components/HierarchyLoadMoreButton.tsx')
  ]);

  assert.match(collectionGuards, /page\.is_last !== false/);
  assert.match(collectionGuards, /page\.next_cursor\.trim\(\)/);
  assert.match(requirementsPage, /getNextPageParam:[\s\S]*getVerifiedNextPageCursor\(lastPage\)[\s\S]*!allPageParams\.includes\(nextCursor\)/);
  assert.match(testCasesPage, /getNextPageParam:[\s\S]*getVerifiedNextPageCursor\(lastPage\)[\s\S]*!allPageParams\.includes\(nextCursor\)/);
  assert.match(requirementsPage, /sprintPageState\?\.isInitialLoading[\s\S]*label=\{`Loading Stories in \$\{iteration\.name\}`\}/);
  assert.match(testCasesPage, /modulePageState\?\.isInitialLoading[\s\S]*label=\{`Loading test cases in \$\{module\.name\}`\}/);
  assert.match(requirementsPage, /page_size: getUnassignedPageSize\(Boolean\(pageParam\)\)/);
  assert.match(testCasesPage, /page_size: getUnassignedPageSize\(Boolean\(pageParam\)\)/);
  assert.doesNotMatch(loadMoreButton, /batchSize|Load \$\{batchSize\}/);
  assert.match(loadMoreButton, /actionLabel = "Load more"/);
  assert.match(testCasesPage, /Show more on this page/);
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
  const [backend, client, requirementsPage, issuesPage, sharedFields, manifest] = await Promise.all([
    read('src/qairaApi.js'),
    read('static/qaira-ui/src/lib/api.ts'),
    read('static/qaira-ui/src/pages/RequirementsPage.tsx'),
    read('static/qaira-ui/src/pages/IssuesPage.tsx'),
    read('static/qaira-ui/src/components/JiraRequiredFields.tsx'),
    read('manifest.yml')
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
  assert.match(backend, /currentIteration\.jira_sprint_id[\s\S]*'sprint-delete'/);
  assert.match(backend, /\/rest\/agile\/1\.0\/sprint\/\$\{String\(currentIteration\.jira_sprint_id\)\}/);
  assert.match(manifest, /delete:sprint:jira-software/);
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
