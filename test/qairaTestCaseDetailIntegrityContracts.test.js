import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

const between = (source, start, end) => {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0, `missing section start: ${start}`);
  assert.ok(endIndex > startIndex, `missing section end: ${end}`);
  return source.slice(startIndex, endIndex);
};

test('test case editing waits for canonical full detail and seeds drafts by revision', async () => {
  const page = await read('static/qaira-ui/src/pages/TestCasesPage.tsx');

  assert.match(page, /const testCaseDetailQueryKey = [\s\S]*\["test-case-detail", projectId \|\| "unselected", testCaseId\]/);
  assert.match(page, /const ensureTestCaseDetail = [\s\S]*queryClient\.fetchQuery<TestCase>/);
  assert.match(page, /const selectedTestCaseDetailQuery = useQuery\(\{[\s\S]*queryKey: testCaseDetailQueryKey\(projectId, selectedTestCaseId\)/);
  assert.match(page, /const selectedTestCase = selectedTestCaseDetailQuery\.data\?\.id === selectedTestCaseId[\s\S]*selectedTestCaseDetailQuery\.data[\s\S]*: null/);
  assert.match(page, /case:\$\{selectedTestCase\.id\}:\$\{selectedTestCase\.revision \?\? selectedTestCase\.updated_at \?\? "detail"\}/);
  assert.match(page, /if \(!isCreating && \(!selectedTestCase \|\| isSelectedTestCaseDetailPending\)\)[\s\S]*Wait for the complete test case details to load before saving/);
  assert.match(page, /label="Loading test case details"/);
  assert.doesNotMatch(page, /const selectedTestCase = testCases\.find/);
});

test('automation editing hydrates canonical detail and never saves a compact catalog row', async () => {
  const page = await read('static/qaira-ui/src/pages/AutomationPage.tsx');
  const catalogAndDetailQueries = between(page, 'const testCasesQuery = useQuery({', 'const learningCacheQuery = useQuery({');
  const draftSeed = between(page, 'useEffect(() => {\n    if (!selectedCaseId)', 'useEffect(() => {\n    if (!activeCaseSuiteIds.length)');
  const updateCase = between(page, 'const updateAutomationCase = useMutation({', 'const deleteAutomationCase = useMutation({');

  assert.match(page, /const automationCaseDetailQueryKey = [\s\S]*\["test-case-detail", projectId \|\| "unselected", testCaseId\]/);
  assert.match(catalogAndDetailQueries, /api\.testCases\.list\(\{ app_type_id: appTypeId, projection: "summary" \}\)/);
  assert.match(catalogAndDetailQueries, /queryKey: automationCaseDetailQueryKey\(projectId, selectedCaseId\)/);
  assert.match(catalogAndDetailQueries, /api\.testCases\.get\(selectedCaseId, \{ project_id: projectId \}\)/);
  assert.match(catalogAndDetailQueries, /selectedAutomationCaseDetailQuery\.data\.detail_complete !== false/);
  assert.match(page, /const activeCase = selectedAutomationCaseDetail;/);
  assert.doesNotMatch(page, /const activeCase = automatedCases\.find/);

  assert.match(draftSeed, /case:\$\{projectId\}:\$\{activeCase\.id\}:\$\{activeCase\.revision \?\? activeCase\.updated_at \?\? "detail"\}/);
  assert.match(draftSeed, /lastAutomationCaseDraftSeedRef\.current === nextSeedKey/);
  assert.match(draftSeed, /normalizeAutomationParameterValues\(activeCase\.parameter_values, "t"\)/);

  assert.match(updateCase, /if \(!isAutomationCaseDetailReady \|\| !activeCase\)[\s\S]*Wait for the complete automation case details before saving/);
  assert.match(updateCase, /expected_revision: activeCase\.revision/);
  assert.match(updateCase, /automationCaseDetailQueryKey\(projectId, caseId\), exact: true/);
  assert.match(page, /label="Loading automation case details"/);
  assert.match(page, /Complete automation case details could not be loaded safely/);
  assert.match(page, /disabled=\{!isAutomationCaseDetailReady \|\| updateAutomationCase\.isPending\}/);
  assert.match(page, /disabled=\{!isAutomationCaseDetailReady\} onClick=\{exportAutomationCasePdf\}/);
  assert.match(page, /disabled=\{!isAutomationCaseDetailReady\} onClick=\{\(\) => setIsParameterDialogOpen\(true\)\}/);
});

test('unassigned test-case pages stay compact while detail-only actions hydrate on demand', async () => {
  const page = await read('static/qaira-ui/src/pages/TestCasesPage.tsx');
  const unassignedQuery = between(page, 'const testCasesQuery = useInfiniteQuery({', 'const testCaseModulesQuery = useQuery({');

  assert.match(unassignedQuery, /unassigned_module:\s*true/);
  assert.match(unassignedQuery, /projection:\s*"summary"/);
  assert.doesNotMatch(unassignedQuery, /projection:\s*"detail"/);
  assert.match(page, /const ensureTestCaseDetail =/);
});

test('clone and suite copy hydrate full metadata with bounded source concurrency', async () => {
  const page = await read('static/qaira-ui/src/pages/TestCasesPage.tsx');
  const suiteTransfer = between(page, 'const handleApplySuiteTransfer', 'const handleCreateExecution');
  const clone = between(page, 'const handleCloneCase', 'const handleDeleteCaseItem');

  assert.match(page, /const TEST_CASE_COPY_HYDRATION_BATCH_SIZE = 4/);
  assert.match(suiteTransfer, /suiteTransferCaseIds[\s\S]*selectedActionCaseSnapshotsRef\.current\.get\(testCaseId\)/);
  assert.match(suiteTransfer, /offset \+= TEST_CASE_COPY_HYDRATION_BATCH_SIZE/);
  assert.match(suiteTransfer, /Promise\.all\([\s\S]*ensureTestCaseDetail\(catalogTestCase\.id\)[\s\S]*api\.testSteps\.list/);
  assert.match(suiteTransfer, /external_references: testCase\.external_references \|\| \[\]/);
  assert.match(suiteTransfer, /parameter_values: testCase\.parameter_values \|\| undefined/);

  assert.match(clone, /Promise\.all\([\s\S]*ensureTestCaseDetail\(testCase\.id\)[\s\S]*api\.testSteps\.list/);
  assert.match(clone, /external_references: sourceTestCase\.external_references \|\| \[\]/);
  assert.match(clone, /parameter_values: sourceTestCase\.parameter_values \|\| undefined/);
  assert.match(clone, /requirement_ids: sourceTestCase\.requirement_ids/);
});

test('CSV export uses backend-hydrated records for every metadata column', async () => {
  const page = await read('static/qaira-ui/src/pages/TestCasesPage.tsx');
  const exportCases = between(page, 'const exportCasesToCsv', 'const handleCloneCase');

  assert.match(exportCases, /const exportRecord = exportRecordById\.get\(catalogTestCase\.id\)/);
  assert.match(exportCases, /const testCase = exportRecord \|\| catalogTestCase/);
  assert.match(exportCases, /const steps = \(exportRecord\?\.steps \|\| \[\]\)/);
  assert.match(exportCases, /"External References": \(testCase\.external_references \|\| \[\]\)/);
  assert.match(exportCases, /"Parameter Values": testCase\.parameter_values \|\| \{\}/);
  assert.match(exportCases, /Stories: \(testCase\.requirement_ids/);
});

test('local execution hydrates detail before API-only gating and runner selection', async () => {
  const page = await read('static/qaira-ui/src/pages/TestCasesPage.tsx');
  const localRun = between(page, 'const handleRunTestCase', 'const handleReviewGeneratedCase');

  assert.match(localRun, /selectedActionCaseSnapshotsRef\.current\.get\(testCaseId\)/);
  assert.match(localRun, /mode === "local"[\s\S]*await ensureTestCaseDetail\(testCaseId\)/);
  assert.match(localRun, /const isApiOnlyLocalRun = testCase\.api_only === true/);
  assert.match(localRun, /testCase\.automated !== "yes" && !isApiOnlyLocalRun/);
  assert.match(localRun, /isApiOnlyLocalRun \? "http:\/\/localhost:4301" : "http:\/\/localhost:4311"/);
  assert.doesNotMatch(localRun, /isApiOnlyTestCase/);
});

test('linked test-case previews hydrate canonical detail before seeding or opening test data', async () => {
  const modal = await read('static/qaira-ui/src/components/LinkedTestCaseModal.tsx');

  assert.match(modal, /const testCaseDetailQuery = useQuery\(\{[\s\S]*api\.testCases\.get\(testCase\.id\)/);
  assert.match(modal, /const canonicalTestCase = testCaseDetailQuery\.data\?\.detail_complete === true/);
  assert.match(modal, /disabled=\{!canonicalTestCase\}/);
  assert.match(modal, /label="Loading complete test case details"/);
  assert.match(modal, /testCaseDetailQuery\.refetch\(\)/);
  assert.match(modal, /normalizeCaseParameterPreviewValues\(canonicalTestCase\.parameter_values\)/);
  assert.match(modal, /canonicalTestCase\?\.revision/);
  assert.match(modal, /canonicalTestCase\?\.updated_at/);
  assert.match(modal, /isParameterDialogOpen && canonicalTestCase/);
});
