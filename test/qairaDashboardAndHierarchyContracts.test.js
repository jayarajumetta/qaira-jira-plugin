import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const apiSource = read('../src/qairaApi.js');
const accessSource = read('../src/qairaAccess.js');
const analyticsSource = read('../src/qualityAnalytics.js');
const clientSource = read('../static/qaira-ui/src/lib/api.ts');
const customDashboardSource = read('../static/qaira-ui/src/components/CustomQualityDashboard.tsx');
const projectSource = read('../static/qaira-ui/src/pages/ProjectsPage.tsx');
const aiCaseAuthoringSource = read('../static/qaira-ui/src/components/AiCaseAuthoringModal.tsx');
const requirementSource = read('../static/qaira-ui/src/pages/RequirementsPage.tsx');
const testCaseSource = read('../static/qaira-ui/src/pages/TestCasesPage.tsx');
const peopleSource = read('../static/qaira-ui/src/pages/PeoplePage.tsx');
const shellSource = read('../static/qaira-ui/src/components/AppShell.tsx');
const themeSource = read('../static/qaira-ui/src/main.tsx');
const stylesSource = read('../static/qaira-ui/src/styles.css');
const darkThemeSource = read('../static/qaira-ui/src/dark-theme.css');

test('hierarchy health is shared, derived, and rendered for assigned and unassigned scope', () => {
  assert.match(requirementSource, /deriveIterationHealth/);
  assert.match(requirementSource, /Unassigned iteration/);
  assert.match(requirementSource, /label: "Coverage"/);
  assert.match(requirementSource, /label: "Readiness"/);
  assert.match(testCaseSource, /deriveModuleHealth/);
  assert.match(testCaseSource, /Unassigned module/);
  assert.match(testCaseSource, /label: "Traceability"/);
  assert.match(testCaseSource, /label: "Stability"/);
  assert.match(stylesSource, /\.hierarchy-metric-strip[\s\S]*white-space: nowrap/);
});

test('custom dashboards use one bounded batch request with stakeholder templates and partial errors', () => {
  assert.match(clientSource, /"\/analytics\/jql-batch"/);
  assert.match(customDashboardSource, /api\.analytics\.queryBatch/);
  assert.doesNotMatch(customDashboardSource, /useQueries/);
  assert.match(apiSource, /mapInBatches\(gadgets,[\s\S]*}, 3\)/);
  assert.match(apiSource, /DASHBOARD_GADGET_FAILED/);
  assert.match(analyticsSource, /executive:[\s\S]*product:[\s\S]*quality:[\s\S]*automation:/);
  assert.match(accessSource, /\/analytics\/jql-batch/);
  assert.match(accessSource, /\/analytics\/dashboard-design-preview/);
  assert.match(customDashboardSource, /editorMode === "create" && canUseAi/);
  assert.match(customDashboardSource, /className="modal-card custom-dashboard-modal"/);
  assert.match(customDashboardSource, /Create dashboard/);
  assert.match(customDashboardSource, /Edit dashboard/);
  assert.match(customDashboardSource, /deleteSelectedDashboard/);
});

test('Jira owns user identity while Qaira roles remain explicitly permissioned', () => {
  assert.doesNotMatch(peopleSource, />Create user</);
  assert.doesNotMatch(peopleSource, /Import users from CSV/);
  assert.match(peopleSource, /Managed by Atlassian/);
  assert.match(peopleSource, /hasPermission\(session, "role\.manage"\)/);
  assert.doesNotMatch(clientSource, /bulkImport:[\s\S]*\/users\/import/);
  assert.match(apiSource, /ATLASSIAN_MANAGED_IDENTITY/);
  assert.match(apiSource, /ROLE_NOT_ASSIGNABLE/);
  assert.match(apiSource, /role_id: 'qa-lead'/);
  assert.match(projectSource, /memberRoleIds/);
  assert.match(projectSource, /DEFAULT_NEW_PROJECT_MEMBER_ROLE_ID/);
  assert.match(projectSource, /api\.projectMembers\.update/);
});

test('Jira theme, selected-only tabs, and collapsed submenu recovery remain wired', () => {
  assert.match(themeSource, /view\.theme\.enable\(\)/);
  assert.match(themeSource, /attributeFilter: \["data-color-mode"\]/);
  assert.match(stylesSource, /\.subnav-tab:not\(\.is-active\)[\s\S]*opacity: 0 !important/);
  assert.match(stylesSource, /\.subnav-tab\.is-active[\s\S]*opacity: 1 !important/);
  assert.match(shellSource, /shouldCollapseSidebar && subItems\.length[\s\S]*setIsCollapsed\(false\)/);
  assert.match(darkThemeSource, /\.ai-case-authoring-main/);
  assert.match(darkThemeSource, /\.custom-dashboard-modal-body/);
  assert.match(darkThemeSource, /\.detail-section-tab\.is-active/);
  assert.match(darkThemeSource, /\.object-repository-screen-field/);
});

test('AI authoring surfaces share a collapsible, evidence-rich prompt pack', () => {
  assert.match(aiCaseAuthoringSource, /<AiPromptContextPanel/);
  assert.match(aiCaseAuthoringSource, /externalLinksText/);
  assert.match(aiCaseAuthoringSource, /referenceImages/);
  assert.match(aiCaseAuthoringSource, /isSidebarCollapsed/);
  assert.match(requirementSource, /isRequirementAiSidebarCollapsed/);
});
