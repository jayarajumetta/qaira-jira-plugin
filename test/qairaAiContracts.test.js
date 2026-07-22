import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const apiSource = fs.readFileSync(path.join(root, 'src/qairaApi.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(root, 'src/index.js'), 'utf8');
const manifestSource = fs.readFileSync(path.join(root, 'manifest.yml'), 'utf8');

function sourceBetween(startMarker, endMarker) {
  const start = apiSource.indexOf(startMarker);
  const end = apiSource.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return apiSource.slice(start, end);
}

const noJiraMutation = (source, label) => {
  assert.doesNotMatch(
    source,
    /\b(?:createArtifact|createIssue|deleteIssue|putIssueProperty|putProjectProperty|updateIssue|updateObjectRepositoryItem)\s*\(/,
    `${label} must remain read-only until a separate confirmed action is invoked`
  );
};

test('quality insights is dispatched as a GET-only, fail-closed preview', () => {
  const handler = sourceBetween(
    'async function handleQualityInsights(',
    'async function handleFallback('
  );
  const dispatcher = sourceBetween(
    'async function dispatchQairaApi(',
    'export async function handleQairaApi('
  );

  assert.match(handler, /method !== 'GET'/);
  assert.match(handler, /preview_only:\s*true/);
  assert.match(handler, /assistedResponse\s*\(/);
  assert.match(handler, /'portfolio-quality-insights'/);
  assert.match(handler, /portfolioForRelease\(fullPortfolio, query\.release\)/);
  assert.match(handler, /scope:\s*query\.release\s*\?/);
  noJiraMutation(handler, 'portfolio quality insights');

  const directDispatch = "if (pathname === '/ai/quality-insights') return handleQualityInsights";
  assert.ok(dispatcher.includes(directDispatch), 'quality insights must have an explicit dispatcher entry');
  assert.ok(
    dispatcher.indexOf(directDispatch) < dispatcher.indexOf('MANAGED_ISSUE_ARTIFACTS.some'),
    'quality insights must be dispatched before generic managed-artifact routing'
  );
  assert.match(apiSource, /\['qaira\.ai\.quality_insights', \['\/ai\/quality-insights'\]\]/);
});

test('dynamic AI analysis endpoints are explainable POST previews without Jira mutations', () => {
  const previews = [
    {
      label: 'requirement impact',
      source: sourceBetween(
        "const impactMatch = pathname.match(/^\\/requirements\\/([^/]+)\\/ai-impact-preview$/);",
        "const previewMatch = pathname.match(/^\\/requirements\\/([^/]+)\\/design-test-cases-preview$/);"
      ),
      capability: 'requirement-change-impact-preview'
    },
    {
      label: 'test-case impact',
      source: sourceBetween(
        "const impactMatch = pathname.match(/^\\/test-cases\\/([^/]+)\\/ai-impact-preview$/);",
        "const acceptGenerated = pathname.match(/^\\/test-cases\\/([^/]+)\\/accept-generated$/);"
      ),
      capability: 'test-case-change-impact-preview'
    },
    {
      label: 'execution failure clustering',
      source: sourceBetween(
        "const failureClusterMatch = pathname.match(/^\\/executions\\/([^/]+)\\/ai-failure-clusters$/);",
        "const scopeAssignmentMatch = pathname.match(/^\\/executions\\/([^/]+)\\/(suites|modules|cases)\\/([^/]+)\\/assignment$/);"
      ),
      capability: 'execution-failure-clustering-preview'
    },
    {
      label: 'quality-gate assessment',
      source: sourceBetween(
        "const qualityAssessmentMatch = pathname.match(/^\\/quality-gates\\/([^/]+)\\/ai-assessment$/);",
        'const itemId = decodeURIComponent(pathname.slice(definition.basePath.length + 1));'
      ),
      capability: 'quality-gate-assessment-preview'
    }
  ];

  for (const preview of previews) {
    assert.match(preview.source, /method === 'POST'|method !== 'POST'/, `${preview.label} must require POST`);
    assert.match(preview.source, /assistedResponse\s*\(/, `${preview.label} must include provenance`);
    assert.match(preview.source, /preview_only:\s*true/, `${preview.label} must identify itself as a preview`);
    assert.ok(preview.source.includes(`'${preview.capability}'`), `${preview.label} capability is missing`);
    noJiraMutation(preview.source, preview.label);
  }

  const qualityGate = previews.find(({ label }) => label === 'quality-gate assessment')?.source || '';
  assert.match(qualityGate, /portfolioForTestPlan\(fullPortfolio, testPlan\)/);
  assert.match(qualityGate, /portfolioForRelease\(fullPortfolio, release\)/);
  assert.match(qualityGate, /scope:\s*assessmentScope/);
});

test('admin reconciliation is feature-gated and explicitly dispatched', () => {
  const routing = sourceBetween(
    'const FEATURE_ROUTE_PREFIXES = [',
    'function featuresForRequest(pathname)'
  );
  const dispatcher = sourceBetween(
    'async function dispatchQairaApi(',
    'export async function handleQairaApi('
  );

  assert.ok(
    routing.includes("['qaira.ops.admin', ['/users', '/roles', '/permissions', '/project-members', '/admin/health', '/admin/reconcile']]")
  );
  assert.ok(
    dispatcher.includes("if (pathname === '/admin/reconcile') return handleAdminReconcile(method, query, body, authorizedContext);")
  );
});

test('admin reconciliation keeps GET read-only and requires confirmation before POST mutations', () => {
  const handler = sourceBetween(
    'async function handleAdminReconcile(',
    'async function handleAdminHealth('
  );
  const appliedMarker = 'const applied = [];';
  const appliedIndex = handler.indexOf(appliedMarker);
  const mutationBranchIndex = handler.indexOf("if (method === 'POST') {", appliedIndex);
  const responseIndex = handler.indexOf('\n  return {', mutationBranchIndex);

  assert.notEqual(appliedIndex, -1);
  assert.notEqual(mutationBranchIndex, -1);
  assert.notEqual(responseIndex, -1);
  assert.match(handler, /!\['GET', 'POST'\]\.includes\(method\)/);
  assert.match(handler, /method === 'POST' && body\?\.confirmed !== true/);
  assert.match(handler, /HUMAN_CONFIRMATION_REQUIRED/);

  const beforeMutationBranch = handler.slice(0, mutationBranchIndex);
  const mutationBranch = handler.slice(mutationBranchIndex, responseIndex);
  const propertyWrites = [...handler.matchAll(/putIssueProperty\s*\(/g)];
  assert.equal(propertyWrites.length, 1, 'reconciliation should have one controlled property-write site');
  assert.doesNotMatch(beforeMutationBranch, /putIssueProperty\s*\(/);
  assert.match(mutationBranch, /putIssueProperty\s*\(/);

  assert.match(handler, /mode:\s*method === 'POST' \? 'confirmed-apply' : 'dry-run'/);
  assert.match(handler, /apply_limit:\s*method === 'POST' \? maxApply : 0/);
  assert.match(handler, /direction:\s*'Jira issue links to Qaira relationship properties/);
});

test('all dynamic AI preview routes are wired to their fail-closed feature controls', () => {
  const routing = sourceBetween(
    'function featuresForRequest(pathname)',
    'async function resolveAuthorizationProject('
  );
  const authorization = sourceBetween(
    'async function authorizeQairaRequest(',
    'function stableJson(value)'
  );

  assert.ok(routing.includes("/^\\/requirements\\/[^/]+\\/(?:ai-)?(?:optimize-preview|impact-preview)$/.test(pathname)"));
  assert.ok(routing.includes("/^\\/test-cases\\/[^/]+\\/ai-impact-preview$/.test(pathname)"));
  assert.ok(routing.includes("/^\\/executions\\/[^/]+\\/ai-failure-clusters$/.test(pathname)"));
  assert.ok(routing.includes("/^\\/quality-gates\\/[^/]+\\/ai-assessment$/.test(pathname)"));
  assert.ok(routing.includes("features.push('qaira.ai.requirement_design')"));
  assert.ok(routing.includes("features.push('qaira.ai.test_authoring')"));
  assert.ok(routing.includes("features.push('qaira.ai.execution_analysis')"));
  assert.ok(routing.includes("features.push('qaira.ai.quality_insights')"));
  assert.ok(routing.includes("removeFeature('qaira.manual.requirements')"), 'AI requirement routes must not inherit manual requirement feature gates');
  assert.ok(routing.includes("removeFeature('qaira.manual.test_cases')"), 'AI test-design routes must not inherit manual test-case feature gates');
  assert.doesNotMatch(authorization, /featureKeys\.push\('qaira\.automation\.step_code'\)/, 'optional automation_code metadata must not block normal manual or AI test design flows');
});

test('request authorization can recover identity from Forge context when Jira user auth expires', () => {
  assert.match(apiSource, /function contextAccountId/);
  assert.match(apiSource, /async function userFromAccountId/);
  assert.match(apiSource, /async function currentUserForRequest/);
  assert.match(apiSource, /currentUserForRequest\(context\)/);
  assert.match(apiSource, /allowAuthFallback:\s*true/);
  assert.match(apiSource, /fallbackJiraPermissionsForContextUser/);
  assert.match(apiSource, /fallbackVerifiedJiraAdmin/);
  assert.match(apiSource, /fallbackProjectLeadAdmin/);
});

test('requirement create and import Jira reads recover when Atlassian user auth expires', () => {
  const jiraHelpers = sourceBetween(
    'async function jiraMutationRequest(',
    'async function currentUser()'
  );
  const requirementHandler = sourceBetween(
    'async function handleRequirements(',
    'async function handleRequirementIterations('
  );
  const requirementImportWorker = sourceBetween(
    'async function importRequirementRows',
    'async function handleRequirements('
  );

  assert.match(jiraHelpers, /async function jiraReadRequest/);
  assert.match(jiraHelpers, /isAuthenticationRequiredError\(error\)/);
  assert.match(jiraHelpers, /return jiraAppRequest\(target, options\)/);

  assert.match(apiSource, /jiraReadRequest\(route`\/rest\/api\/3\/project\/\$\{String\(ref\)\}`,\s*\{\},\s*'project-get'\)/);
  assert.match(apiSource, /jiraReadRequest\(route`\/rest\/api\/3\/issue\/createmeta\/\$\{project\.key\}\/issuetypes\/\$\{issueTypeRef\}/);
  assert.match(apiSource, /jiraReadRequest\(route`\/rest\/api\/3\/search\/jql`/);
  assert.match(apiSource, /jiraReadRequest\(route`\/rest\/api\/3\/issue\/\$\{String\(issueIdOrKey\)\}\?fields=\$\{fieldsParam\}`/);
  assert.match(apiSource, /jiraReadRequest\(route`\/rest\/api\/3\/field`/);
  assert.match(apiSource, /jiraReadRequest\(route`\/rest\/api\/3\/project\/\$\{project\.key\}\/version/);

  assert.match(requirementHandler, /const createMetadata = await jiraRequirementCreateMetadata\(project, registry\)/);
  assert.match(requirementImportWorker, /const created = await handleRequirements\('\/requirements', 'POST'/);
  assert.match(requirementHandler, /jobType:\s*'requirements-bulk-import'/);
  assert.match(requirementHandler, /queued:\s*true/);
});

test('Jira Software lookup degradation stays bounded while create metadata fails closed', () => {
  const requiredScopes = [
    'read:board-scope:jira-software',
    'write:board-scope:jira-software',
    'read:sprint:jira-software',
    'write:sprint:jira-software',
    'read:issue-meta:jira',
    'read:avatar:jira',
    'read:field-configuration:jira',
    'read:issue.transition:jira',
    'read:status:jira'
  ];
  for (const scope of requiredScopes) {
    assert.ok(manifestSource.includes(`- ${scope}`), `manifest must include ${scope}`);
  }

  const helperSource = sourceBetween(
    'function isAuthenticationRequiredError(error)',
    'function systemActor(project, reason ='
  );
  const sprintSource = sourceBetween(
    'async function listJiraProjectSprints(project)',
    'async function jiraProjectDeliveryMetadata(project)'
  );
  const createMetaSource = sourceBetween(
    'async function jiraCreateFieldMetadata(project, issueTypeId)',
    'async function jiraCoreBugFieldIds(project)'
  );

  assert.match(helperSource, /function isJiraScopeMismatchError/);
  assert.match(helperSource, /scope does not match\|scope/);
  assert.match(sprintSource, /isJiraScopeMismatchError\(error\)/);
  assert.match(sprintSource, /qairaLookupUnavailable = true/);
  assert.match(sprintSource, /return fallback/);
  assert.match(apiSource, /sprint_lookup_unavailable:\s*Boolean\(sprints\?\.qairaLookupUnavailable\)/);
  assert.match(apiSource, /metadata\.sprint_lookup_unavailable\) sprintFallback/);
  assert.match(createMetaSource, /isJiraScopeMismatchError\(error\)/);
  assert.match(createMetaSource, /JIRA_CREATE_METADATA_UNAVAILABLE/);
  assert.doesNotMatch(createMetaSource, /core issue fields only/);
});

test('async AI generation jobs have queue consumers and terminal result records', () => {
  const testCaseJobs = sourceBetween(
    "if (pathname === '/test-cases/ai-generation-jobs' && method === 'GET')",
    "if (pathname === '/test-cases/import' && method === 'POST')"
  );
  const testCaseWorker = sourceBetween(
    'export async function processAiTestCaseGenerationJob',
    'export async function workspaceSummary'
  );
  const requirementWorker = sourceBetween(
    'export async function processAiRequirementGenerationJob',
    'export async function processAiTestCaseGenerationJob'
  );

  assert.match(indexSource, /processAiRequirementGenerationJob/);
  assert.match(indexSource, /processAiTestCaseGenerationJob/);
  assert.match(indexSource, /processRequirementImportJob/);
  assert.match(indexSource, /unwrapAsyncPayload/);
  assert.match(indexSource, /dispatchAgenticWorkflowPayload/);
  assert.match(indexSource, /body\.jobType === 'requirements-bulk-import'/);
  assert.match(indexSource, /body\.jobType === 'ai-requirement-generation'/);
  assert.match(indexSource, /body\.jobType === 'ai-test-case-generation'/);

  assert.match(testCaseJobs, /job_type:\s*'ai-test-case-generation'/);
  assert.match(testCaseJobs, /status:\s*'queued'/);
  assert.match(testCaseJobs, /agenticWorkflowQueue\.push/);
  assert.match(testCaseJobs, /concurrency:\s*\{ key: `ai-test-case-generation-/);

  assert.match(testCaseWorker, /status:\s*'running'/);
  assert.match(testCaseWorker, /buildTestCaseDesignPreview/);
  assert.match(testCaseWorker, /candidate_cases/);
  assert.match(testCaseWorker, /createTestCasesFromCandidates/);
  assert.match(testCaseWorker, /created_cases/);
  assert.match(testCaseWorker, /generated_cases_count/);
  assert.match(testCaseWorker, /status:\s*'completed'/);
  assert.match(testCaseWorker, /status:\s*'failed'/);

  assert.match(requirementWorker, /status:\s*'running'/);
  assert.match(requirementWorker, /buildRequirementCreationPreview/);
  assert.match(requirementWorker, /requirements:\s*asArray\(response\.requirements\)/);
  assert.match(requirementWorker, /status:\s*'completed'/);
  assert.match(requirementWorker, /status:\s*'failed'/);
});

test('async AI jobs and Jira-native imports preserve authorized actor and bubble auth expiry', () => {
  const requirementHandler = sourceBetween(
    'async function handleRequirements(',
    'async function handleRequirementIterations('
  );
  const requirementImportWorker = sourceBetween(
    'async function importRequirementRows',
    'async function handleRequirements('
  );
  const testCaseJobsAndImport = sourceBetween(
    "if (pathname === '/test-cases/ai-generation-jobs' && method === 'GET')",
    "if (pathname === '/test-cases/export' && method === 'POST')"
  );

  assert.match(apiSource, /function isAuthenticationRequiredError/);
  assert.match(apiSource, /async function currentActor/);
  assert.match(apiSource, /async function currentUserOrSystem/);

  assert.match(requirementHandler, /currentActor\(context, project, 'requirement-create'\)/);
  assert.match(requirementHandler, /currentActor\(context, project, 'requirement-update'\)/);
  assert.match(requirementHandler, /currentActor\(context, project, 'requirements-import-queue'\)/);
  assert.match(requirementHandler, /currentActor\(context, project, 'ai-requirement-generation-queue'\)/);
  assert.match(requirementImportWorker, /if \(isAuthenticationRequiredError\(error\)\) throw error;/);

  assert.match(testCaseJobsAndImport, /currentActor\(context, project, 'ai-test-case-generation-queue'\)/);
  assert.match(testCaseJobsAndImport, /if \(isAuthenticationRequiredError\(error\)\) throw error;/);
});

test('locator improvement separates preview from human-confirmed apply', () => {
  const apply = sourceBetween(
    "const cacheImproveApply = pathname.match(/^\\/test-cases\\/automation\\/learning-cache\\/([^/]+)\\/ai-improve\\/apply$/);",
    "const cacheImprove = pathname.match(/^\\/test-cases\\/automation\\/learning-cache\\/([^/]+)\\/ai-improve$/);"
  );
  const preview = sourceBetween(
    "const cacheImprove = pathname.match(/^\\/test-cases\\/automation\\/learning-cache\\/([^/]+)\\/ai-improve$/);",
    "const cacheUsage = pathname.match(/^\\/test-cases\\/automation\\/learning-cache\\/([^/]+)\\/usage$/);"
  );

  assert.match(preview, /method === 'POST'/);
  assert.match(preview, /applied:\s*false/);
  assert.match(preview, /assistedResponse\s*\(/);
  assert.match(preview, /'locator-improvement-preview'/);
  assert.match(preview, /authoritative_entry:/);
  assert.match(preview, /const suggestedStrategy = entry\.locator_kind \|\| 'css'/);
  noJiraMutation(preview, 'locator improvement preview');

  assert.match(apply, /method === 'PUT'/);
  assert.match(apply, /body\?\.confirmed !== true/);
  assert.match(apply, /HUMAN_CONFIRMATION_REQUIRED/);
  assert.match(apply, /updateObjectRepositoryItem\s*\(/);
  assert.match(apply, /applied:\s*true/);
});

test('quality-insights default is provisioned from the canonical admin property model', () => {
  const model = JSON.parse(fs.readFileSync(path.join(root, 'schema/qaira-property-model.json'), 'utf8'));
  const flags = model.projectProperties.find(({ key }) => key === 'qaira.data.feature-flags.v1')?.initialValue?.flags;
  const setup = fs.readFileSync(path.join(root, 'admin/setup-qaira-jira.sh'), 'utf8');

  assert.equal(flags?.['qaira.ai.quality_insights'], true);
  assert.match(setup, /PROPERTY_MODEL_PATH=.*qaira-property-model\.json/);
  assert.match(setup, /\.initialValue \/\/ \{\}/);
});
