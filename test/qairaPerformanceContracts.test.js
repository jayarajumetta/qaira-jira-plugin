import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const apiSource = readFileSync(new URL('../src/qairaApi.js', import.meta.url), 'utf8');
const frontendApiSource = readFileSync(new URL('../static/qaira-ui/src/lib/api.ts', import.meta.url), 'utf8');
const currentScopeSource = readFileSync(new URL('../static/qaira-ui/src/lib/currentScope.ts', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../static/qaira-ui/src/App.tsx', import.meta.url), 'utf8');
const requirementsSource = readFileSync(new URL('../static/qaira-ui/src/pages/RequirementsPage.tsx', import.meta.url), 'utf8');
const appShellSource = readFileSync(new URL('../static/qaira-ui/src/components/AppShell.tsx', import.meta.url), 'utf8');
const routePrefetchSource = readFileSync(new URL('../static/qaira-ui/src/lib/routePrefetch.ts', import.meta.url), 'utf8');
const stylesSource = readFileSync(new URL('../static/qaira-ui/src/styles.css', import.meta.url), 'utf8');
const testCasesSource = readFileSync(new URL('../static/qaira-ui/src/pages/TestCasesPage.tsx', import.meta.url), 'utf8');

test('list APIs enforce the Qaira pagination budget', () => {
  assert.match(apiSource, /const DEFAULT_PAGE_SIZE = 25;/);
  assert.match(apiSource, /const MAX_PAGE_SIZE = 100;/);
  assert.match(apiSource, /function pageSize/);
  assert.match(apiSource, /clamp\(Number\(value \|\| fallback\), 1, MAX_PAGE_SIZE\)/);
});

test('Forge resolver logs Jira call count and duration per request', () => {
  assert.match(apiSource, /jiraCallCount/);
  assert.match(apiSource, /jiraDurationMs/);
  assert.match(apiSource, /Qaira API performance/);
});

test('Jira-backed record enrichment uses bounded concurrency', () => {
  assert.match(apiSource, /async function mapInBatches\(items, mapper, batchSize = 20\)/);
  assert.match(apiSource, /const safeBatchSize = clamp\(Number\(batchSize\) \|\| 20, 1, 50\)/);
  assert.match(apiSource, /await Promise\.all\(items\.slice\(offset, offset \+ safeBatchSize\)\.map\(mapper\)\)/);
});

test('normal test-case save bundles metadata and edited steps with optimistic concurrency', () => {
  assert.match(testCasesSource, /expected_revision: selectedTestCase\.revision/);
  assert.match(testCasesSource, /steps: persistedSteps/);
  assert.doesNotMatch(testCasesSource, /handleSaveMultipleSteps/);
});

test('project-property collections keep compact item indexes', () => {
  assert.match(apiSource, /itemKeys/);
  assert.match(apiSource, /getCollectionIndex/);
  assert.match(apiSource, /collectionItemPrefix\(name\)/);
});

test('requirements no longer expose ALM import or connection APIs', () => {
  assert.doesNotMatch(apiSource, /\/requirements\/alm/);
  assert.doesNotMatch(apiSource, /\/requirements\/import\/alm/);
  assert.doesNotMatch(frontendApiSource, /AlmRequirement/);
  assert.doesNotMatch(requirementsSource, /ALM/);
});

test('workspace transactions are project and app scoped', () => {
  assert.match(apiSource, /assertTransactionInScope/);
  assert.match(apiSource, /String\(item\.project_id \|\| project\.id\) === String\(project\.id\)/);
  assert.match(apiSource, /query\.app_type_id/);
  assert.match(apiSource, /async function createWorkspaceTransaction[\s\S]*requireAppType\(project, input\.app_type_id\)/);
  assert.match(apiSource, /function assertCollectionItemScope[\s\S]*CROSS_PROJECT_ACCESS/);
});

test('frontend requests and caches are separated by selected Jira project', () => {
  assert.match(frontendApiSource, /appendCurrentProjectScope\(path\)/);
  assert.match(frontendApiSource, /inFlightClientRequests/);
  assert.match(frontendApiSource, /CLIENT_GET_CACHE_TTL_MS = 1_500/);
  assert.match(frontendApiSource, /clientGetResponseCache\.clear\(\)/);
  assert.match(currentScopeSource, /projectAwareQueryKey/);
  assert.match(currentScopeSource, /\["qaira-project", readCurrentProjectId\(\) \|\| "unselected", queryKey\]/);
  assert.match(appSource, /queryKeyHashFn:[\s\S]*projectAwareQueryKey/);
  assert.doesNotMatch(appSource, /placeholderData:\s*keepPreviousData/);
});

test('workspace navigation prefetches lazy route chunks without eager-loading every page', () => {
  assert.match(appSource, /const RequirementsPage = lazy/);
  assert.match(routePrefetchSource, /preloadWorkspaceRoute/);
  assert.match(routePrefetchSource, /requestIdleCallback/);
  assert.ok(routePrefetchSource.includes('"/requirements": () => import("../pages/RequirementsPage")'));
  assert.match(appShellSource, /onMouseEnter=\{\(\) => prefetchNavigationTarget\(navigationTarget, isDisabled\)\}/);
  assert.match(appShellSource, /onFocus=\{\(\) => preloadWorkspaceRoute\(subItem\.to\)\}/);
  assert.match(appShellSource, /realtime\.subscribeGlobal/);
  assert.match(appShellSource, /refetchInterval: 300_000/);
});

test('workspace chrome is removed from app content areas', () => {
  assert.match(appShellSource, /RefreshIcon/);
  assert.match(appShellSource, /const refreshCurrentScreen = \(\) => window\.location\.reload\(\)/);
  assert.doesNotMatch(appShellSource, /Create Requirement.*requirements\?create=1/s);
  assert.match(stylesSource, /\.page-header,[\s\S]*display: none !important;/);
  assert.match(stylesSource, /\.panel-head \{[\s\S]*display: none !important;/);
  assert.match(stylesSource, /\.eyebrow,[\s\S]*display: none !important;/);
});
