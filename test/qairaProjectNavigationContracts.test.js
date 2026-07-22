import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const appShellSource = readFileSync(
  new URL('../static/qaira-ui/src/components/AppShell.tsx', import.meta.url),
  'utf8'
);

test('project selector switches the enclosing Jira project page through the Forge router', () => {
  assert.match(appShellSource, /NavigationTarget, realtime, router, showFlag/);
  assert.match(appShellSource, /JIRA_PROJECT_PAGE_MODULE_KEY = "qaira-project-workspace"/);
  assert.match(appShellSource, /const projectKey = String\([\s\S]*?\.display_id \|\| ""[\s\S]*?\)\.trim\(\)/);
  assert.match(appShellSource, /router\.navigate\(\{[\s\S]*?target: NavigationTarget\.Module,[\s\S]*?moduleKey: JIRA_PROJECT_PAGE_MODULE_KEY,[\s\S]*?projectKey[\s\S]*?\}\)/);
});

test('both project rows and cross-project app types use the native project switch callback', () => {
  assert.match(appShellSource, /const selectProject = \(targetProjectId: string\) => \{[\s\S]*?onProjectNavigate\(targetProjectId\)/);
  assert.match(appShellSource, /const selectAppType = \(targetProjectId: string, targetAppTypeId: string\) => \{[\s\S]*?setCurrentScope\(targetProjectId, targetAppTypeId\);[\s\S]*?onProjectNavigate\(targetProjectId\)/);
  assert.match(appShellSource, /const isProjectChange = normalizedProjectId !== String\(sidebarProjectId\)/);
  assert.match(appShellSource, /if \(!isProjectChange\) \{[\s\S]*?return;[\s\S]*?\}/);
});

test('automatic initial project selection remains local and does not navigate Jira', () => {
  assert.match(appShellSource, /setSidebarProjectId\(projects\[0\]\.id\)/);
  assert.doesNotMatch(appShellSource, /navigateToJiraProject\(projects\[0\]\.id\)/);
});
