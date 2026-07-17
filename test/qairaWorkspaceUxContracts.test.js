import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const apiSource = read('../src/qairaApi.js');
const accessSource = read('../src/qairaAccess.js');
const frontendApiSource = read('../static/qaira-ui/src/lib/api.ts');
const requirementsSource = read('../static/qaira-ui/src/pages/RequirementsPage.tsx');
const testCasesSource = read('../static/qaira-ui/src/pages/TestCasesPage.tsx');
const designSource = read('../static/qaira-ui/src/pages/DesignPage.tsx');
const sharedStepsSource = read('../static/qaira-ui/src/pages/SharedStepsPage.tsx');
const suiteCasePickerSource = read('../static/qaira-ui/src/components/SuiteCasePicker.tsx');
const appShellSource = read('../static/qaira-ui/src/components/AppShell.tsx');
const settingsSource = read('../static/qaira-ui/src/pages/SettingsPage.tsx');
const workspaceSectionsSource = read('../static/qaira-ui/src/lib/workspaceSections.ts');
const tileBrowserSource = read('../static/qaira-ui/src/components/TileBrowserPane.tsx');
const masterDetailSource = read('../static/qaira-ui/src/components/WorkspaceMasterDetail.tsx');
const promptContextSource = read('../static/qaira-ui/src/components/AiPromptContextPanel.tsx');
const aiDesignStudioSource = read('../static/qaira-ui/src/lib/aiDesignStudio.ts');
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
  assert.match(apiSource, /generated: requirements\.length/);
  assert.match(requirementsSource, /Generate requirement drafts/);
  assert.match(requirementsSource, /ai-requirement-draft-card/);
  assert.match(requirementsSource, /Create selected requirements/);
  assert.match(aiDesignStudioSource, /compressFileTextForPrompt/);
  assert.match(aiDesignStudioSource, /mergeAiReferenceImagesWithinBudget/);
  assert.match(promptContextSource, /Attachment limit exceeded/);
});

test('hierarchy selection includes parents, grouped children, and unassigned records', () => {
  assert.match(requirementsSource, /setAllFilteredRequirementItemsSelected/);
  assert.match(requirementsSource, /setIterationAndChildrenSelected/);
  assert.match(requirementsSource, /setUnassignedRequirementsSelected/);
  assert.match(requirementsSource, /getScopedRequirementListColumns/);
  assert.match(requirementsSource, /getVisibleIterationRequirementIds/);
  assert.match(requirementsSource, /requirementIterationGroups\.groups\.every\(\(\{ iteration \}\) => selectedIterationIds\.includes\(iteration\.id\)\)/);

  assert.match(testCasesSource, /setAllFilteredTestCaseItemsSelected/);
  assert.match(testCasesSource, /setModuleAndChildrenSelected/);
  assert.match(testCasesSource, /setUnassignedTestCasesSelected/);
  assert.match(testCasesSource, /getScopedTestCaseListColumns/);
  assert.match(testCasesSource, /getVisibleModuleCaseIds/);
  assert.match(testCasesSource, /selectableModuleIds\.every\(\(moduleId\) => selectedModuleIds\.includes\(moduleId\)\)/);
});

test('backend hierarchy assignments remain exclusive and server validated', () => {
  assert.match(apiSource, /async function assignCasesToModule/);
  assert.match(apiSource, /MODULE_CASE_APP_TYPE_MISMATCH/);
  assert.match(apiSource, /filter\(\(idValue\) => !incomingSet\.has\(idValue\)\)/);
  assert.match(apiSource, /async function validateExecutionScheduleInput/);
  assert.match(apiSource, /SCHEDULE_SCOPE_APP_TYPE_MISMATCH/);
  assert.match(apiSource, /SCHEDULE_CONTEXT_APP_TYPE_MISMATCH/);
  assert.match(apiSource, /const assignRequirements = async \(iteration/);
});

test('shared step and test data backend logic mirrors reference service behavior', () => {
  assert.match(apiSource, /function normalizeSharedGroupSteps/);
  assert.match(apiSource, /async function syncSharedStepGroupReferences/);
  assert.match(apiSource, /async function unlinkSharedStepGroupReferences/);
  assert.match(apiSource, /group_kind: 'reusable'/);
  assert.match(apiSource, /group_kind: step\.group_id \? 'local' : null/);
  assert.match(apiSource, /function normalizeDataSetColumns/);
  assert.match(apiSource, /function normalizeDataSetRows/);
  assert.match(apiSource, /INVALID_DATA_SET_CHAR_PATTERN/);
});

test('AI test data utilities use reviewed LLM values without invoking the model during runs', () => {
  assert.match(testEnvironmentSource, /Generate synthetic data with AI/);
  assert.match(testEnvironmentSource, /getPrompt\("ai\.test_data\.synthetic"\)/);
  assert.match(testEnvironmentSource, />Randomize</);
  assert.match(testEnvironmentSource, />Static</);
  assert.doesNotMatch(testEnvironmentSource, /label: "AI data"/);
  assert.match(frontendApiSource, /\/test-data-sets\/ai-generate-preview/);
  assert.match(accessSource, /qaira\.ai\.test_data_generation/);
  assert.match(accessSource, /data\.ai/);
  assert.match(apiSource, /'test-data-generation-preview'/);
  assert.match(apiSource, /randomization_strategy: 'reviewed-value-pool'/);
  assert.match(apiSource, /runtime_llm_invocation: false/);
  assert.match(apiSource, /materializeStoredTestDataRows/);
  assert.match(apiSource, /template_rows: templateRows/);
});

test('suite membership editing is compact, selectable, and supports safe unlink', () => {
  assert.match(suiteCasePickerSource, /showSelectionSummary=\{false\}/);
  assert.match(suiteCasePickerSource, /className="suite-case-picker-search"/);
  assert.doesNotMatch(suiteCasePickerSource, /Select cases to assign them into this suite/);
  assert.doesNotMatch(designSource, /className="metric-strip compact"/);
  assert.doesNotMatch(designSource, /test-case-card-badge-row/);
  assert.doesNotMatch(designSource, /Suite coverage/);
  assert.match(designSource, /handleUnlinkSuiteCases/);
  assert.match(designSource, /Remove from suite/);
  assert.match(designSource, /append: false/);
  assert.match(frontendApiSource, /JSON\.stringify\(\{ test_case_ids, expected_revision, append \}\)/);
  assert.match(apiSource, /body\?\.append === false \? asArray\(body\?\.test_case_ids\)/);
  assert.match(apiSource, /mapInBatches\(ids, \(testCaseId\) => loadScopedIssue\(testCaseId/);
});

test('shared-step automation tools fail closed and reuse icon-first step actions', () => {
  assert.match(sharedStepsSource, /hasPermission\(session, "automation\.code\.view"\)/);
  assert.match(sharedStepsSource, /hasPermission\(session, "automation\.build"\)/);
  assert.match(sharedStepsSource, /qaira\.automation\.step_code/);
  assert.match(sharedStepsSource, /qaira\.automation\.builder/);
  assert.match(sharedStepsSource, /showAutomationTools=\{canEditSharedStepAutomation\}/);
  assert.match(sharedStepsSource, /className="shared-step-editor-toolbar-actions"/);
  assert.match(sharedStepsSource, /LinkedCasesIcon/);
  assert.match(sharedStepsSource, /openOnHover[\s\S]*previewActions=\{stepActions\}/);
});

test('scheduled run launch advances or deactivates schedule state', () => {
  assert.match(apiSource, /function nextScheduledRunAt/);
  assert.match(apiSource, /SCHEDULE_INACTIVE/);
  assert.match(apiSource, /execution_mode: 'scheduled'/);
  assert.match(apiSource, /next_run_at: remainsActive \? nextRunAt : null/);
  assert.match(apiSource, /is_active: remainsActive/);
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
