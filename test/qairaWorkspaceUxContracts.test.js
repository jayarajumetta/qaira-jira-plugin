import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { asArray, normalizePagedResult } from '../static/qaira-ui/src/lib/collectionGuards.ts';
import { queryKeys } from '../static/qaira-ui/src/lib/queryKeys.ts';

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
const collectionGuardsSource = read('../static/qaira-ui/src/lib/collectionGuards.ts');
const queryKeysSource = read('../static/qaira-ui/src/lib/queryKeys.ts');
const dataTableSource = read('../static/qaira-ui/src/components/DataTable.tsx');
const columnPreferencesSource = read('../static/qaira-ui/src/lib/tablePreferences/columnPreferences.ts');
const columnSizingSource = read('../static/qaira-ui/src/lib/tablePreferences/columnSizing.ts');
const dashboardSource = read('../static/qaira-ui/src/components/CustomQualityDashboard.tsx');
const executionsSource = read('../static/qaira-ui/src/pages/ExecutionsPage.tsx');
const appSource = read('../static/qaira-ui/src/App.tsx');
const testEnvironmentSource = read('../static/qaira-ui/src/pages/TestEnvironmentPage.tsx');
const recorderSource = read('../static/qaira-ui/src/components/RecorderStartControls.tsx');
const stepAutomationSource = read('../static/qaira-ui/src/components/StepAutomationEditor.tsx');
const integrationsSource = read('../static/qaira-ui/src/pages/IntegrationsPage.tsx');
const overviewSource = read('../static/qaira-ui/src/pages/OverviewPage.tsx');
const releaseReadinessSource = read('../static/qaira-ui/src/components/ReleaseReadinessDashboard.tsx');
const releaseReadinessModelSource = read('../static/qaira-ui/src/lib/releaseReadiness.ts');
const stylesSource = read('../static/qaira-ui/src/styles.css');
const localizationSource = read('../static/qaira-ui/src/lib/localization.ts');
const requirementImportSource = read('../static/qaira-ui/src/lib/requirementImport.ts');
const testCaseImportSource = read('../static/qaira-ui/src/lib/testCaseImport.ts');

test('Story terminology is user-facing while requirement data contracts stay compatible', () => {
  assert.match(localizationSource, /"workspace\.requirements": "Stories"/);
  assert.match(localizationSource, /"page\.requirements": "Stories"/);
  assert.match(localizationSource, /migrated\[key\] === "Requirements"[\s\S]*migrated\[key\] = "Stories"/);
  assert.match(workspaceSectionsSource, /to: "\/requirements", label: "Stories", shortLabel: "Stories"/);
  assert.match(requirementsSource, /label="Create Story"/);
  assert.match(requirementsSource, />All Stories</);
  assert.doesNotMatch(requirementsSource, /label="Create Requirement"|>All Requirements</);
  assert.match(requirementImportSource, /"story", "storytitle", "requirement", "requirementtitle"/);
  assert.match(testCaseImportSource, /"stories", "storytitles", "linkedstories", "requirements", "requirementtitles", "linkedrequirements"/);
  assert.match(frontendApiSource, /`\/requirements/);
  assert.match(accessSource, /'requirement\.view'/);
});

test('AI requirement creation reuses the full test-design prompt context and remains review gated', () => {
  assert.match(requirementsSource, /Create Stories using AI/);
  assert.match(requirementsSource, /<AiPromptContextPanel/);
  for (const copy of ['Additional context', 'Smart context', 'Add files', 'Add smart context', 'Prompt copy', 'External links', 'Reference photos']) {
    assert.match(promptContextSource, new RegExp(copy));
  }
  assert.match(frontendApiSource, /\/requirements\/ai-create-preview/);
  assert.match(apiSource, /pathname === '\/requirements\/ai-create-preview' && method === 'POST'/);
  assert.match(accessSource, /pathname === '\/requirements\/ai-create-preview'\) return 'requirement\.ai'/);
  assert.match(apiSource, /'requirement-creation-preview'/);
  assert.match(apiSource, /generated: requirements\.length/);
  assert.match(requirementsSource, /Generate Story drafts/);
  assert.match(requirementsSource, /ai-requirement-draft-card/);
  assert.match(requirementsSource, /Create selected Stories/);
  assert.match(aiDesignStudioSource, /compressFileTextForPrompt/);
  assert.match(aiDesignStudioSource, /mergeAiReferenceImagesWithinBudget/);
  assert.match(promptContextSource, /Attachment limit exceeded/);
});

test('hierarchy selection keeps containers selectable independently from their children', () => {
  assert.match(requirementsSource, /setAllFilteredRequirementItemsSelected/);
  assert.match(requirementsSource, /setIterationSelected/);
  assert.match(requirementsSource, /setUnassignedRequirementsSelected/);
  assert.match(requirementsSource, /getScopedRequirementListColumns/);
  assert.match(requirementsSource, /const isSelected = selectedIterationIds\.includes/);
  assert.match(requirementsSource, /const iterationIds = requirementIterationGroups\.groups\.map/);
  assert.match(requirementsSource, /handleDeleteIteration/);
  assert.doesNotMatch(requirementsSource, /setIterationAndChildrenSelected/);

  assert.match(testCasesSource, /setAllFilteredTestCaseItemsSelected/);
  assert.match(testCasesSource, /setModuleSelected/);
  assert.match(testCasesSource, /setUnassignedTestCasesSelected/);
  assert.match(testCasesSource, /getScopedTestCaseListColumns/);
  assert.match(testCasesSource, /const isSelected = selectedModuleIds\.includes/);
  assert.match(testCasesSource, /handleDeleteModule/);
  assert.match(testCasesSource, /selectableFilteredCases\.length > 0 \|\| selectableModuleIds\.length > 0/);
  assert.match(testCasesSource, /selectableModuleIds\.every\(\(moduleId\) => selectedModuleIds\.includes\(moduleId\)\)/);
  assert.doesNotMatch(testCasesSource, /setModuleAndChildrenSelected/);
});

test('sprint and module edit-delete controls stay adjacent without visual padding', () => {
  assert.match(requirementsSource, /className="action-row hierarchy-parent-actions"[\s\S]*sprint-edit-button[\s\S]*sprint-delete-button/);
  assert.match(testCasesSource, /className="hierarchy-parent-actions"[\s\S]*module-edit-button[\s\S]*module-delete-button/);
  assert.match(stylesSource, /\.hierarchy-parent-actions \{[\s\S]*display: inline-flex;[\s\S]*flex-wrap: nowrap;/);
  assert.match(stylesSource, /\.hierarchy-parent-actions > \.ghost-button\.compact \{[\s\S]*padding: 0 !important;/);
});

test('list view renders every loaded test case without a misleading local load-more control', () => {
  assert.match(testCasesSource, /const hasMoreVisibleTestCases = catalogViewMode === "tile"[\s\S]*visibleModuleTileEntries\.length < moduleTileEntries\.length/);
  assert.doesNotMatch(testCasesSource, /catalogViewMode === "tile"[\s\S]*:\s*visibleTestCaseCount < filteredCases\.length/);
  assert.match(testCasesSource, /Showing \{visibleTileCaseCount\} of \{totalTileCaseCount\} matching test cases/);
});

test('legacy lightweight test-case summaries use binary defaults without inventing non-binary values', () => {
  assert.match(testCasesSource, /testCase\.detail_complete === false && testCase\.summary_complete !== true/);
  assert.match(testCasesSource, /testCase\.ai_generation_source \? "Yes" : "No"/);
  assert.match(testCasesSource, /testCase\.automated === "yes" \? "Yes" : "No"/);
  assert.match(testCasesSource, /function DeferredTestCaseCatalogValue/);
  assert.match(testCasesSource, /const guidance = `Open this test case to load \$\{field\}\.`/);
  assert.match(testCasesSource, /title=\{guidance\}>On open<\/span>/);
  for (const field of ['review status', 'reviewer details', 'references', 'step details', 'test data']) {
    assert.match(testCasesSource, new RegExp(`DeferredTestCaseCatalogValue field="${field}"`));
  }
  assert.match(testCasesSource, /stepCount \?\? "—"/);
  assert.match(testCasesSource, /automationReadiness === null \? "On open"/);
  assert.doesNotMatch(testCasesSource, />Unknown<|return "Unknown"|\? "Unknown"/);
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
  assert.match(apiSource, /await loadScopedIssues\(ids, project, registry/);
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

test('remote collection boundaries cannot crash requirements or analytics on missing arrays', () => {
  assert.deepEqual(asArray({ pages: [] }), []);
  assert.deepEqual(normalizePagedResult({ items: null }), {
    items: [],
    total: 0,
    next_cursor: null,
    is_last: true
  });
  assert.match(collectionGuardsSource, /export function asArray/);
  assert.match(collectionGuardsSource, /export function normalizePagedResult/);
  assert.match(requirementsSource, /normalizePagedResult<Requirement>/);
  assert.match(requirementsSource, /asArray\(previewRequirementImpact\.data\?\.impact\?\.test_cases\)/);
  assert.match(designSource, /const requirements = asArray\(requirementsQuery\.data\)/);
  assert.match(sharedStepsSource, /const sharedGroups = asArray\(sharedGroupsQuery\.data\)/);
  assert.match(executionsSource, /const requirements = asArray\(requirementsQuery\.data\)/);
  assert.match(dashboardSource, /gadgets: asArray<QualityDashboardGadget>/);
  assert.match(dashboardSource, /const series = asArray\(result\.series\)/);
  assert.match(appSource, /errorElement: <RouteErrorState/);
});

test('paged requirements never share a React Query cache entry with array consumers', () => {
  const arrayKey = queryKeys.requirements('project-1');
  const pagedKey = queryKeys.requirementsPages('project-1');

  assert.notDeepEqual(pagedKey, arrayKey);
  assert.deepEqual(pagedKey.slice(0, arrayKey.length), arrayKey);
  assert.match(queryKeysSource, /requirements: \(projectId = ""\) => \["requirements", projectId\]/);
  assert.match(queryKeysSource, /requirementsPages: \(projectId = ""\) => \["requirements", projectId, "pages"\]/);
  assert.match(requirementsSource, /useInfiniteQuery\(\{[\s\S]*queryKey: queryKeys\.requirementsPages\(projectId\)/);
  assert.doesNotMatch(requirementsSource, /useInfiniteQuery\(\{\s*queryKey: \["requirements", projectId\]/);
});

test('list columns expose reliable presets, dedicated drag handles, and safe title widths', () => {
  for (const preset of ['Show all', 'Default', 'Compact', 'Comfortable']) {
    assert.match(dataTableSource, new RegExp(`>${preset}<`));
  }
  assert.match(dataTableSource, /data-table-header-drag-handle/);
  assert.match(dataTableSource, /data-table-config-reorder-actions/);
  assert.match(dataTableSource, /getColumnMinimumWidth/);
  assert.match(dataTableSource, /getHeaderControlWidth[\s\S]*column\.sortValue[\s\S]*enableHeaderColumnReorder/);
  assert.match(dataTableSource, /aria-valuemin=\{getDataTableColumnMinimumWidth\(column\)\}/);
  assert.match(dataTableSource, /hasLocalPreferenceChangeRef/);
  assert.match(columnSizingSource, /headerLabel[\s\S]*COLUMN_HEADER_CHARACTER_WIDTH[\s\S]*COLUMN_HEADER_CHROME_WIDTH/);
  assert.match(columnSizingSource, /getColumnPresetWidth[\s\S]*density === "compact"/);
  assert.match(columnPreferencesSource, /getDefaultVisibleColumnKeys[\s\S]*canToggle !== false && column\.defaultVisible !== false/);
  assert.match(requirementsSource, /key: "title"[\s\S]*minWidth: 320/);
  assert.match(testCasesSource, /key: "title"[\s\S]*minWidth: 320/);
});

test('authoring and sidebar refresh actions keep their labels and readable icons', () => {
  assert.match(requirementsSource, /icon=\{<FileAddIcon size=\{20\} \/>\}[\s\S]*iconOnly=\{false\}[\s\S]*label="Create Story"/);
  assert.match(appShellSource, /sidebar-refresh-label">Refresh<\/span>[\s\S]*<RefreshIcon size=\{20\} \/>/);
  assert.match(appShellSource, /shouldCollapseSidebar \? " explorer-icon-button" : ""/);
  assert.match(stylesSource, /\.sidebar-refresh-button > svg \{[\s\S]*width: 1\.25rem !important;[\s\S]*height: 1\.25rem !important;/);
});

test('suite and run case catalogs group by module and start collapsed in tile and list views', () => {
  assert.match(designSource, /const \[expandedModuleNames, setExpandedModuleNames\] = useState<string\[]>\(\[\]\)/);
  assert.match(designSource, /moduleTileEntries/);
  assert.match(designSource, /className="suite-module-groups"/);
  assert.match(executionsSource, /const \[expandedExecutionModuleKeys, setExpandedExecutionModuleKeys\] = useState<string\[]>\(\[\]\)/);
  assert.match(executionsSource, /execution-module-tree--list/);
  assert.match(executionsSource, /renderExecutionModuleHeader/);
  assert.match(testCasesSource, /const \[expandedModuleIds, setExpandedModuleIds\] = useState<string\[]>\(\[\]\)/);
});

test('suite module headers consolidate metrics and keep suite editing in the case toolbar', () => {
  assert.doesNotMatch(designSource, /suite-module-summary-strip/);
  assert.doesNotMatch(stylesSource, /\.suite-module-summary(?:-strip)?/);
  assert.match(designSource, /actions=\{<WorkspaceBackButton label="Back to suite tiles"/);
  assert.match(designSource, /toolbarActions=\{[\s\S]*Suite test data[\s\S]*Edit Suite/);
  assert.match(designSource, /<CatalogSelectionControls[\s\S]*selectedCount=\{selectedCaseIds\.length\}[\s\S]*\/>\s*\) : null\}\s*\{toolbarActions\}/);
  assert.match(stylesSource, /\.suite-module-group-copy \{[\s\S]*display: flex;[\s\S]*justify-content: space-between;/);
  assert.match(stylesSource, /\.suite-module-group-copy small \{[\s\S]*text-align: right;/);
});

test('suite module tables pin a module-scoped parent checkbox as the first column', () => {
  assert.match(designSource, /key: "select",[\s\S]*canToggle: false,[\s\S]*canReorder: false,[\s\S]*canResize: false,[\s\S]*headerRender:/);
  assert.match(designSource, /all cases in \$\{module\.name\}/);
  assert.match(designSource, /columns=\{getSuiteCaseListColumns\(module\)\}[\s\S]*enableRowSelection=\{false\}/);
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

test('release readiness is a Jira-scoped decision workspace with explainable traceability', () => {
  assert.match(workspaceSectionsSource, /view=readiness[\s\S]*label: "Release readiness"/);
  assert.match(overviewSource, /dashboardView === "readiness"[\s\S]*<ReleaseReadinessDashboard/);
  assert.match(releaseReadinessSource, /Decision brief[\s\S]*Traceability[\s\S]*Execution evidence/);
  assert.match(releaseReadinessSource, /Fix Version[\s\S]*Sprint/);
  assert.match(releaseReadinessSource, /Explain with AI/);
  assert.match(releaseReadinessSource, /Scores guide attention; people own the decision/);
  assert.match(releaseReadinessModelSource, /latest result per scoped test case/i);
  assert.match(releaseReadinessModelSource, /openCriticalBugCount/);
  assert.match(releaseReadinessModelSource, /highPriorityUncoveredCount/);
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
