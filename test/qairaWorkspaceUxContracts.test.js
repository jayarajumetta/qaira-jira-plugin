import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const apiSource = read('../src/qairaApi.js');
const accessSource = read('../src/qairaAccess.js');
const frontendApiSource = read('../static/qaira-ui/src/lib/api.ts');
const requirementsSource = read('../static/qaira-ui/src/pages/RequirementsPage.tsx');
const testCasesSource = read('../static/qaira-ui/src/pages/TestCasesPage.tsx');
const appShellSource = read('../static/qaira-ui/src/components/AppShell.tsx');
const settingsSource = read('../static/qaira-ui/src/pages/SettingsPage.tsx');
const workspaceSectionsSource = read('../static/qaira-ui/src/lib/workspaceSections.ts');
const tileBrowserSource = read('../static/qaira-ui/src/components/TileBrowserPane.tsx');
const masterDetailSource = read('../static/qaira-ui/src/components/WorkspaceMasterDetail.tsx');
const promptContextSource = read('../static/qaira-ui/src/components/AiPromptContextPanel.tsx');
const loadingStateSource = read('../static/qaira-ui/src/components/LoadingState.tsx');
const testEnvironmentSource = read('../static/qaira-ui/src/pages/TestEnvironmentPage.tsx');
const recorderSource = read('../static/qaira-ui/src/components/RecorderStartControls.tsx');
const stepAutomationSource = read('../static/qaira-ui/src/components/StepAutomationEditor.tsx');
const integrationsSource = read('../static/qaira-ui/src/pages/IntegrationsPage.tsx');
const stylesSource = read('../static/qaira-ui/src/styles.css');

test('AI requirement creation reuses the full test-design prompt context and remains review gated', () => {
  assert.match(requirementsSource, /Create Requirements using AI/);
  assert.match(requirementsSource, /<AiPromptContextPanel/);
  for (const copy of ['Additional context', 'Smart context', 'Add files', 'Add smart context', 'Prompt copy', 'External links', 'Reference photos']) {
    assert.match(promptContextSource, new RegExp(copy));
  }
  assert.match(frontendApiSource, /\/requirements\/ai-create-preview/);
  assert.match(apiSource, /pathname === '\/requirements\/ai-create-preview' && method === 'POST'/);
  assert.match(accessSource, /pathname === '\/requirements\/ai-create-preview'\) return 'requirement\.ai'/);
  assert.match(apiSource, /'requirement-creation-preview'/);
  assert.match(requirementsSource, /Create requirement/);
});

test('hierarchy selection includes parents, grouped children, and unassigned records', () => {
  assert.match(requirementsSource, /setAllFilteredRequirementItemsSelected/);
  assert.match(requirementsSource, /setIterationAndChildrenSelected/);
  assert.match(requirementsSource, /setUnassignedRequirementsSelected/);
  assert.match(requirementsSource, /requirementIterations\.every\(\(iteration\) => selectedIterationIds\.includes\(iteration\.id\)\)/);

  assert.match(testCasesSource, /setAllFilteredTestCaseItemsSelected/);
  assert.match(testCasesSource, /setModuleAndChildrenSelected/);
  assert.match(testCasesSource, /setUnassignedTestCasesSelected/);
  assert.match(testCasesSource, /testCaseModules\.every\(\(module\) => selectedModuleIds\.includes\(module\.id\)\)/);
});

test('scrolling and refresh use native browser behavior without jump-to-top observers', () => {
  assert.doesNotMatch(tileBrowserSource, /onWheel|wheel|scrollTo/);
  assert.doesNotMatch(masterDetailSource, /Jump to top|ResizeObserver|scrollTo/);
  assert.match(appShellSource, /window\.location\.reload\(\)/);
});

test('loading uses one centered stacked icon-and-label primitive', () => {
  assert.match(loadingStateSource, /loading-state-spinner/);
  assert.match(loadingStateSource, /loading-state-label/);
  assert.match(loadingStateSource, /aria-live="polite"/);
  assert.doesNotMatch(stylesSource, /\.splash-screen::before/);
  assert.match(stylesSource, /\.loading-state \{[\s\S]*flex-direction: column;[\s\S]*text-align: center;/);
});

test('run sections live in the sidebar and Jira owns profile and sign-out actions', () => {
  for (const view of ['test-case-runs', 'suite-runs', 'local-runs', 'scheduled-runs']) {
    assert.match(workspaceSectionsSource, new RegExp(`/executions\\?view=${view}`));
  }
  assert.doesNotMatch(workspaceSectionsSource, /\/executions\?view=batch-process/);
  assert.match(workspaceSectionsSource, /TESTOPS_SECTION_ITEMS[\s\S]*to: "\/testops", label: "Jobs"/);
  assert.match(workspaceSectionsSource, /AGENTIC_WORKFLOW_SECTION_ITEMS[\s\S]*view=workflows[\s\S]*view=runs/);
  assert.match(workspaceSectionsSource, /object-repository[\s\S]*qaira\.automation\.workspace[\s\S]*qaira\.automation\.object_repository/);
  assert.match(workspaceSectionsSource, /local-runs[\s\S]*qaira\.automation\.local_execution/);
  assert.match(appShellSource, /item\.id === "runs"[\s\S]*\? TEST_RUNS_SECTION_ITEMS/);
  assert.match(appShellSource, /subItem\.featureKeys/);
  assert.doesNotMatch(appShellSource, /UserProfileDialog/);
  assert.match(appShellSource, /className="ghost-button sidebar-signout"[\s\S]*disabled/);
});

test('feature flags are externally provisioned and read-only inside the app', () => {
  assert.doesNotMatch(settingsSource, /FeatureAvailabilitySection|useFeatureAvailability/);
  assert.doesNotMatch(frontendApiSource, /request<FeatureFlagSnapshot>\("\/feature-flags",[\s\S]*method: "PUT"/);
  assert.doesNotMatch(apiSource, /updateFeatureFlags/);
  assert.match(apiSource, /name: 'External feature flag setup'/);
});

test('mobile Appium is a supplementary permissioned capability rather than an environment page gate', () => {
  assert.match(accessSource, /mobile\.view/);
  assert.match(accessSource, /mobile\.manage/);
  assert.match(apiSource, /usesMobileAppiumCapability/);
  assert.match(apiSource, /requiredPermission: 'mobile\.manage'/);
  assert.match(workspaceSectionsSource, /test-environments[\s\S]*qaira\.manual\.environments/);
  assert.match(workspaceSectionsSource, /test-configurations[\s\S]*qaira\.manual\.environments/);
  assert.match(testEnvironmentSource, /hasPermission\(session, "mobile\.view"\)/);
  assert.match(recorderSource, /mobileAppiumEnabled/);
  assert.match(stepAutomationSource, /hasPermission\(session, "mobile\.manage"\)/);
  assert.match(integrationsSource, /buildIntegrationConfig\(draft, integrationTypeDefinitions, canUseMobileAppium\)/);
});

test('the defect workspace is consistently labeled Bugs', () => {
  assert.match(appShellSource, /to: "\/issues", label: "Bugs", shortLabel: "Bugs"/);
  assert.doesNotMatch(appShellSource, /Report Issue/);
});
