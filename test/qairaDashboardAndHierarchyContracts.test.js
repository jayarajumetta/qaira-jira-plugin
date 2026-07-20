import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const apiSource = read('../src/qairaApi.js');
const accessSource = read('../src/qairaAccess.js');
const analyticsSource = read('../src/qualityAnalytics.js');
const clientSource = read('../static/qaira-ui/src/lib/api.ts');
const customDashboardSource = read('../static/qaira-ui/src/components/CustomQualityDashboard.tsx');
const overviewSource = read('../static/qaira-ui/src/pages/OverviewPage.tsx');
const projectSource = read('../static/qaira-ui/src/pages/ProjectsPage.tsx');
const aiCaseAuthoringSource = read('../static/qaira-ui/src/components/AiCaseAuthoringModal.tsx');
const requirementSource = read('../static/qaira-ui/src/pages/RequirementsPage.tsx');
const testCaseSource = read('../static/qaira-ui/src/pages/TestCasesPage.tsx');
const peopleSource = read('../static/qaira-ui/src/pages/PeoplePage.tsx');
const shellSource = read('../static/qaira-ui/src/components/AppShell.tsx');
const themeSource = read('../static/qaira-ui/src/main.tsx');
const stylesSource = read('../static/qaira-ui/src/styles.css');
const darkThemeSource = read('../static/qaira-ui/src/dark-theme.css');
const issuesSource = read('../static/qaira-ui/src/pages/IssuesPage.tsx');
const executionsSource = read('../static/qaira-ui/src/pages/ExecutionsPage.tsx');
const workspaceDataSource = read('../static/qaira-ui/src/hooks/useWorkspaceData.ts');
const manifestSource = read('../manifest.yml');
const notificationCenterSource = read('../static/qaira-ui/src/lib/notificationCenter.ts');

test('sprint hierarchy health is shared, derived, and rendered for Jira sprint and backlog scope', () => {
  assert.match(requirementSource, /deriveIterationHealth/);
  assert.match(requirementSource, /Backlog \/ No sprint/);
  assert.match(requirementSource, /label: "Done"/);
  assert.match(requirementSource, /label: "Coverage"/);
  assert.match(requirementSource, /label: "Run pass"/);
  assert.match(requirementSource, /label: "At risk"/);
  assert.match(requirementSource, /sprintDateRangeLabel/);
  assert.match(requirementSource, /sprintStateLabel/);
  assert.match(apiSource, /\/rest\/agile\/1\.0\/sprint/);
  assert.match(manifestSource, /write:sprint:jira-software/);
  assert.match(apiSource, /severity: target\.fields\?\.priority\?\.name \|\| null/);
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

test('automation previews and analytics fail closed behind dedicated permissions and feature flags', () => {
  assert.match(accessSource, /qaira\.automation\.preview[\s\S]*automation\.preview/);
  assert.match(accessSource, /qaira\.automation\.analytics[\s\S]*automation\.analytics\.view[\s\S]*dashboard\.view/);
  assert.match(executionsSource, /hasPermission\(session, "automation\.preview"\)[\s\S]*qaira\.automation\.preview/);
  assert.match(executionsSource, /canPreviewAutomation \? \([\s\S]*title="Preview step automation"/);
  assert.match(apiSource, /isAutomationDashboardDesign[\s\S]*requiredPermission: 'automation\.analytics\.view'[\s\S]*qaira\.automation\.analytics/);
  assert.match(overviewSource, /canViewAutomationAnalytics[\s\S]*qaira\.automation\.analytics/);
  assert.match(overviewSource, /sectionVisible\("automation"\)/);
  assert.match(customDashboardSource, /canUseAutomation[\s\S]*audience\.id !== "automation"/);
});

test('quality analytics separates release evidence from automation and supports local rearrangement', () => {
  assert.match(overviewSource, /35% traceability \+ 25% design completeness \+ 40% latest pass confidence/);
  assert.match(overviewSource, /automation adoption does not raise it/);
  assert.match(overviewSource, /This browser-only preference creates no Forge or Jira API traffic/);
  assert.match(overviewSource, /window\.localStorage\.setItem\(layoutStorageKey/);
  assert.match(overviewSource, /Why this release posture\?/);
  assert.match(overviewSource, /MetricEvidenceDialog/);
  assert.match(overviewSource, /users: false[\s\S]*projectMembers: false[\s\S]*issues: false[\s\S]*testCasesProjection: "summary"/);
});

test('custom dashboard reports capture the live styled DOM and fail closed when fidelity is unavailable', () => {
  assert.match(customDashboardSource, /import \{ toJpeg \} from "html-to-image"/);
  assert.match(customDashboardSource, /fitDashboardSnapshotToForgePayload/);
  assert.match(customDashboardSource, /maxDataUrlLength = 410_000/);
  assert.doesNotMatch(customDashboardSource, /snapshot = undefined/);
  assert.doesNotMatch(customDashboardSource, /custom-dashboard-toolbar-summary/);
  assert.match(stylesSource, /\.custom-dashboard-selector-field/);
  assert.match(apiSource, /DASHBOARD_SNAPSHOT_REQUIRED/);
  assert.match(apiSource, /render_for_email === true/);
  assert.match(apiSource, /shouldEvaluate \? await mapInBatches/);
  assert.match(apiSource, /emailHtmlBody: fallbackHtml/);
  assert.match(apiSource, /base64\.length > 450_000/);
});

test('bug creation uses compact metadata controls without redundant section copy', () => {
  assert.doesNotMatch(issuesSource, /Title, classification, ownership, and linked execution context\./);
  assert.match(issuesSource, /issue-form-compact-grid issue-form-classification-grid/);
  assert.match(issuesSource, /bug-field-linked-run/);
  assert.match(stylesSource, /\.bug-field-assignee/);
  assert.match(stylesSource, /\.bug-field-environment/);
});

test('requirement and Bug status controls are Jira-workflow-native and transition aware', () => {
  assert.match(apiSource, /\/rest\/api\/3\/project\/\$\{project\.key\}\/statuses/);
  assert.match(apiSource, /jiraIssueTransitionStatusCatalog/);
  assert.match(apiSource, /source: 'jira-issue-transitions'/);
  assert.match(apiSource, /status_category: issue\.fields\?\.status\?\.statusCategory\?\.key/);
  assert.match(requirementSource, /editRequirementStatusOptions/);
  assert.match(requirementSource, /createRequirementStatusOptions/);
  assert.match(issuesSource, /activeBugStatusOptions/);
  assert.match(issuesSource, /category !== "done"/);
});

test('notifications are persistent event records delivered through Forge Realtime and native flags', () => {
  assert.match(apiSource, /import \{ publishGlobal, signRealtimeToken \} from '@forge\/realtime'/);
  assert.match(apiSource, /mutationNotificationDescriptor/);
  assert.match(apiSource, /createAppNotification/);
  assert.match(apiSource, /NOTIFICATION_RETENTION_COUNT = 120/);
  assert.match(apiSource, /recordMutationNotifications\(payload, result\)/);
  assert.match(apiSource, /pathname === '\/notifications\/realtime-token'/);
  assert.match(apiSource, /safelyCreateAppNotification/);
  assert.match(shellSource, /realtime\.subscribeGlobal\(NOTIFICATION_REALTIME_CHANNEL/);
  assert.match(shellSource, /showFlag\(/);
  assert.match(notificationCenterSource, /NOTIFICATION_FEED: NotificationCenterItem\[\] = \[\]/);
  assert.doesNotMatch(notificationCenterSource, /Nightly regression completed/);
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

test('Jira administrators have live-verified, system-managed Qaira memberships', () => {
  assert.match(apiSource, /\/rest\/api\/3\/user\/permission\/search\?permissions=/);
  assert.match(apiSource, /reconcileCurrentAdministratorMembership/);
  assert.match(apiSource, /assignment_source: 'jira-permission'/);
  assert.match(apiSource, /fallback_role_id/);
  assert.match(apiSource, /synchronizeJiraAdministratorMemberships/);
  assert.match(apiSource, /accountIds/);
  assert.match(apiSource, /jira_admin_scope: 'global'/);
  assert.match(apiSource, /JIRA_ADMIN_MEMBERSHIP_MANAGED/);
  assert.match(manifestSource, /queue: qaira-admin-membership-sync/);
  assert.match(projectSource, /isJiraManagedAdministrator/);
});

test('catalog first paint is decoupled from secondary detail and polling queries', () => {
  assert.match(requirementSource, /const isRequirementCatalogLoading =[\s\S]*requirementsQuery\.isLoading/);
  assert.doesNotMatch(requirementSource.match(/const isRequirementCatalogLoading =[\s\S]*?;/)?.[0] || '', /executionResultsQuery|executionsQuery/);
  assert.match(testCaseSource, /const isLibraryLoading = testCasesQuery\.isLoading/);
  assert.match(projectSource, /const isProjectCatalogLoading = projects\.isPending/);
  assert.match(issuesSource, /issuesProjection: "summary"/);
  assert.match(issuesSource, /selectedIssueQuery = useQuery/);
  assert.match(executionsSource, /enabled: Boolean\(projectId && isExecutionRunsView\(testRunsView\)\)/);
  assert.match(workspaceDataSource, /options: WorkspaceDataOptions/);
  assert.match(workspaceDataSource, /WORKSPACE_QUERY_STALE_TIME_MS/);
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
