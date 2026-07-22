import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

function between(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

test('AI retrieval is source-selective, app-scoped, ranked, bounded, and failure-aware', async () => {
  const backend = await read('src/qairaApi.js');
  const helper = between(
    backend,
    'async function retrieveAiModuleContext(',
    'function normalizeRequirementCreationAiInput('
  );

  assert.match(helper, /requestedSources[\s\S]*AI_MODULE_CONTEXT_MAX_SOURCES/);
  assert.match(helper, /sourceLoaders = \{[\s\S]*requirements:[\s\S]*'test-cases':[\s\S]*runs:[\s\S]*bugs:[\s\S]*knowledge:/);
  assert.match(helper, /app_type_id: appTypeId \|\| undefined/);
  assert.match(helper, /item\?\.is_active !== false/);
  assert.match(helper, /rankContextRecords\(/);
  assert.match(helper, /maxChars[\s\S]*18_?000/);
  assert.match(helper, /unavailable_sources:/);
  assert.match(helper, /bounded: true/);

  const dataSetRecord = between(backend, "if (source === 'data-sets')", "if (source === 'object-repository')");
  assert.match(dataSetRecord, /columns:/);
  assert.match(dataSetRecord, /row_count:/);
  assert.doesNotMatch(dataSetRecord, /\brows\s*:/, 'RAG must not copy test-data row values into prompts');
});

test('Story AI uses authoritative Jira records and bounded neighboring context', async () => {
  const backend = await read('src/qairaApi.js');
  const creation = between(
    backend,
    'async function buildRequirementCreationPreview(',
    'function normalizeTestCaseGenerationAiInput('
  );
  const requirements = between(
    backend,
    'async function handleRequirements(',
    'async function handleRequirementIterations('
  );

  assert.match(creation, /sources: \['requirements', 'modules', 'knowledge'\]/);
  assert.match(creation, /authoritative_project_context: retrievedContext\.records/);
  assert.match(creation, /context_retrieval:/);
  assert.match(requirements, /ai-create-preview'[\s\S]*buildRequirementCreationPreview\(project, registry, body\)/);
  assert.match(requirements, /submittedRequirement\.id[\s\S]*requirementRecordsByIds/);
  assert.match(requirements, /linkedTestCases[\s\S]*related_project_context: retrievedContext\.records/);
  assert.match(requirements, /authoritative_impact:/);
  const legacyCreation = between(
    requirements,
    "const generateMatch = pathname.match(/^\\/requirements\\/([^/]+)\\/generate-test-cases$/);",
    "const itemMatch = pathname.match(/^\\/requirements\\/([^/]+)$/);"
  );
  assert.match(legacyCreation, /buildTestCaseDesignPreview\(project, registry/);
  assert.match(legacyCreation, /requirement_ids: \[generateMatch\[1\]\]/);
  assert.match(legacyCreation, /createTestCasesFromCandidates/);
  assert.doesNotMatch(legacyCreation, /assistedResponse\(/, 'legacy create must not invoke AI after Jira issues are persisted');
});

test('test authoring, automation, and execution AI receive the evidence they analyze', async () => {
  const backend = await read('src/qairaApi.js');
  const testCases = between(
    backend,
    'async function handleTestCases(',
    'async function normalizeModuleInput('
  );
  const executions = between(
    backend,
    'async function handleExecutions(',
    'async function handleRelationships('
  );

  assert.match(testCases, /ai-authoring-preview'[\s\S]*authoritative_requirement:[\s\S]*related_module_context:/);
  assert.match(testCases, /ai-step-rephrase'[\s\S]*requirementRecordsByIds[\s\S]*related_module_context:/);
  assert.match(testCases, /dom_evidence_excerpt: domExcerpt/);
  assert.match(testCases, /authoritative_test_case:[\s\S]*steps:[\s\S]*object_repository_items:/);
  assert.match(testCases, /selected_execution_context:[\s\S]*data_set_schema:/);
  assert.match(testCases, /locator-improvement-preview'[\s\S]*authoritative_entry:[\s\S]*linked_test_case:[\s\S]*related_module_context:/);
  assert.match(executions, /failure_evidence: failureContext/);
  assert.match(executions, /logs_excerpt:/);
  assert.match(executions, /test_case:[\s\S]*steps:[\s\S]*result_evidence:/);
});

test('quality, data, knowledge, rich-text, and agentic AI use module-specific context', async () => {
  const [backend, richTextEditor, apiClient, testCasesPage] = await Promise.all([
    read('src/qairaApi.js'),
    read('static/qaira-ui/src/components/RichTextEditor.tsx'),
    read('static/qaira-ui/src/lib/api.ts'),
    read('static/qaira-ui/src/pages/TestCasesPage.tsx')
  ]);

  assert.match(backend, /const knowledgeContext[\s\S]*related_context: retrieval\.records/);
  assert.match(backend, /bug-triage-preview'[\s\S]*linked_context:[\s\S]*related_project_context:/);
  assert.match(backend, /related_schema_context: retrievedContext\.records/);
  assert.match(backend, /row_values_excluded: true/);
  assert.match(backend, /authoritative_quality_snapshot: \{[\s\S]*uncovered_requirement_count:/);
  assert.match(backend, /handleDashboardDesignPreview[\s\S]*loadDerivedQualityDashboardContext\(project\)[\s\S]*authoritative_quality_snapshot: liveSnapshot/);
  assert.match(backend, /handleRichTextRephrase[\s\S]*entityId[\s\S]*loadScopedIssue\(entityId[\s\S]*authoritative_entity:/);
  assert.match(backend, /agenticProjectCorpus\(project, registry, \{ appTypeId = null \} = \{\}\)/);
  assert.match(backend, /agenticProjectCorpus\(project, registry, \{ appTypeId: workflow\.app_type_id \|\| null \}\)/);

  assert.match(richTextEditor, /entityId\?: string/);
  assert.match(richTextEditor, /entity_id: aiRephraseContext\?\.entityId/);
  assert.match(apiClient, /entity_id\?: string/);
  assert.match(testCasesPage, /entityId: selectedTestCase\?\.id/);
});
