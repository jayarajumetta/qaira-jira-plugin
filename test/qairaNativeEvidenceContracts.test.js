import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const apiSource = readFileSync(new URL('../src/qairaApi.js', import.meta.url), 'utf8');
const clientSource = readFileSync(new URL('../static/qaira-ui/src/lib/api.ts', import.meta.url), 'utf8');
const requirementSource = readFileSync(new URL('../static/qaira-ui/src/pages/RequirementsPage.tsx', import.meta.url), 'utf8');
const bugSource = readFileSync(new URL('../static/qaira-ui/src/pages/IssuesPage.tsx', import.meta.url), 'utf8');
const testCaseSource = readFileSync(new URL('../static/qaira-ui/src/pages/TestCasesPage.tsx', import.meta.url), 'utf8');
const runSource = readFileSync(new URL('../static/qaira-ui/src/pages/ExecutionsPage.tsx', import.meta.url), 'utf8');

test('native Jira attachments are reused across requirements, bugs, tests, and runs', () => {
  assert.match(clientSource, /\/rest\/api\/3\/attachment\/meta/);
  assert.match(clientSource, /\/rest\/api\/3\/issue\/\$\{encodeURIComponent\(issueKey\)\}\/attachments/);
  assert.match(clientSource, /X-Atlassian-Token["']:\s*["']no-check/);
  for (const source of [requirementSource, bugSource, testCaseSource, runSource]) {
    assert.match(source, /JiraAttachmentPanel/);
  }
});

test('requirements and bugs use canonical Jira delivery metadata', () => {
  assert.match(apiSource, /com\.pyxis\.greenhopper\.jira:gh-sprint/);
  assert.match(apiSource, /fields\.fixVersions = \[\{ id: version\.id \}\]/);
  assert.match(apiSource, /fields\.labels = asArray\(body\.labels\)/);
  assert.match(apiSource, /transitionIssueToStatus/);
});

test('custom analytics are evaluated only through the project-scoped backend', () => {
  assert.match(apiSource, /scopedDashboardJql\(project\.key/);
  assert.match(apiSource, /clamp\(Number\(input\?\.limit \|\| 100\), 1, 100\)/);
  assert.match(clientSource, /request<QualityDashboardGadgetResult>\("\/analytics\/jql"/);
  assert.match(clientSource, /request<QualityDashboardBatchResponse>\("\/analytics\/jql-batch"/);
});
