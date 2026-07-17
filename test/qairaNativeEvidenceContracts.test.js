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

test('Qaira-created Jira Bugs honor Bug create-screen metadata before creation', () => {
  assert.match(apiSource, /\/rest\/api\/3\/issue\/createmeta\/\$\{project\.key\}\/issuetypes\/\$\{issueTypeRef\}/);
  assert.match(apiSource, /async function jiraBugCreateMetadata/);
  assert.match(apiSource, /async function jiraRequirementCreateMetadata/);
  assert.match(apiSource, /\/requirements\/create-metadata/);
  assert.match(apiSource, /required_fields: qairaAdditionalRequiredFields/);
  assert.match(apiSource, /function jiraAdditionalCreateFields/);
  assert.match(apiSource, /JIRA_REQUIRED_FIELDS_MISSING/);
  assert.match(apiSource, /\.\.\.additionalCreateFields/);
  assert.match(clientSource, /createMetadata: \(query\?: \{ project_id\?: string \}\) =>\s*request<JiraIssueCreateMetadata>\(`\/requirements\/create-metadata/);
  assert.match(clientSource, /createMetadata: \(query\?: \{ project_id\?: string \}\)/);
  assert.match(requirementSource, /Jira Story create screen/);
  assert.match(bugSource, /Jira required fields/);
});

test('Jira-native Qaira mutations survive expired user auth after authorization', () => {
  const directUserWritePattern = /jiraRequest\(route`\/rest\/api\/3\/[^`]+`, \{[^\n]*(?:method: '(?:POST|PUT|PATCH|DELETE)'|method: "(?:POST|PUT|PATCH|DELETE)")/;

  assert.match(apiSource, /async function jiraMutationRequest/);
  assert.match(apiSource, /isAuthenticationRequiredError\(error\)/);
  assert.match(apiSource, /return jiraAppRequest\(target, options\)/);
  assert.doesNotMatch(apiSource, directUserWritePattern, 'Jira write calls must use jiraMutationRequest or jiraAppRequest, not raw asUser jiraRequest');

  assert.match(apiSource, /const created = await jiraMutationRequest\(route`\/rest\/api\/3\/issue`/);
  assert.match(apiSource, /await jiraMutationRequest\(route`\/rest\/api\/3\/issue\/\$\{String\(issueIdOrKey\)\}`/);
  assert.match(apiSource, /await jiraMutationRequest\(route`\/rest\/api\/3\/issue\/\$\{String\(issueIdOrKey\)\}\/transitions`/);
  assert.match(apiSource, /await jiraMutationRequest\(route`\/rest\/api\/3\/issueLink`/);
  assert.match(apiSource, /await jiraAppRequest\(route`\/rest\/api\/3\/issue\/\$\{String\(issueIdOrKey\)\}\/properties\/\$\{propertyKey\}`/);
});

test('custom analytics are evaluated only through the project-scoped backend', () => {
  assert.match(apiSource, /scopedDashboardJql\(project\.key/);
  assert.match(apiSource, /clamp\(Number\(input\?\.limit \|\| 100\), 1, 100\)/);
  assert.match(clientSource, /request<QualityDashboardGadgetResult>\("\/analytics\/jql"/);
  assert.match(clientSource, /request<QualityDashboardBatchResponse>\("\/analytics\/jql-batch"/);
});

test('execution result defects propagate Jira-native traceability links', () => {
  assert.match(apiSource, /async function syncAutomaticDefectTraceability/);
  assert.match(apiSource, /ensureSemanticIssueLink\(project, registry, 'impactsQa', testCase, defect/);
  assert.match(apiSource, /ensureSemanticIssueLink\(project, registry, 'foundInRun', defect, runIssue/);
  assert.match(apiSource, /ensureSemanticIssueLink\(project, registry, 'impactsQa', requirement, defect/);
  assert.match(apiSource, /syncAutomaticDefectTraceability\(project, registry, \{\s*runId: executionIssue\.id/);
});

test('Qaira record deletes do not require Jira hard-delete permission', () => {
  assert.match(apiSource, /const QAIRA_DELETE_PROP = 'qaira\.deleted\.v1'/);
  assert.match(apiSource, /putIssuePropertyAsApp\(issueIdOrKey, QAIRA_DELETE_PROP, marker\)/);
  assert.match(apiSource, /deletion_mode: 'soft'/);
  assert.match(apiSource, /Do not require Jira's destructive Delete Issues permission/);
  assert.doesNotMatch(apiSource, /Delete Issues permission is required to delete Qaira records/);
  assert.match(apiSource, /result\.issues\.filter\(\(issue\) => !isSoftDeletedIssue\(issue\)\)/);
});

test('test-step clipboard operations preserve section context and use one bounded write', () => {
  assert.match(clientSource, /createMany: \(input:[\s\S]*?"\/test-steps\/bulk"/);
  assert.match(clientSource, /deleteMany: \(input:[\s\S]*?"\/test-steps\/bulk-delete"/);
  assert.match(apiSource, /pathname === '\/test-steps\/bulk'/);
  assert.match(apiSource, /next\.splice\(insertionIndex, 0, \.\.\.incoming\)/);
  assert.match(apiSource, /steps: next\.map\(\(step, index\) => \(\{ \.\.\.step, step_order: index \+ 1 \}\)\)/);
  assert.match(testCaseSource, /stepClipboardScopeKey/);
  assert.match(testCaseSource, /Copy steps from one section or group at a time/);
  assert.match(testCaseSource, /api\.testSteps\.createMany/);
  assert.match(testCaseSource, /activateStepInsert\(preconditionSteps\.length, null\)/);
});

test('run case details render HTML-safe preconditions, steps, and collapsible group snapshots', () => {
  assert.match(runSource, /function executionStepText/);
  assert.match(runSource, /richTextToPlainText\(value\)/);
  assert.match(runSource, /executionPreconditionSteps/);
  assert.match(runSource, /expandedExecutionStepSections/);
  assert.match(runSource, />Preconditions</);
  assert.match(runSource, />Test steps</);
  assert.match(runSource, /ExecutionStepGroupRow/);
});
