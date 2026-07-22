export const TEST_CASE_SUMMARY_PROP = 'qaira.testCaseSummary.v1';

const TEST_CASE_SUMMARY_VERSION = 1;
const EXTERNAL_REFERENCE_LIMIT = 16;
const EXTERNAL_REFERENCE_MAX_LENGTH = 500;
const STEP_TYPES = new Set(['web', 'api', 'android', 'ios']);
const REVIEW_STATUSES = new Set(['pending', 'accepted', 'changes_requested', 'not_requested']);
const AUTOMATION_STATUSES = new Set(['not_automated', 'ready', 'incomplete']);

function boundedString(value, maxLength) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function positiveRevision(value) {
  const revision = Number(value);
  return Number.isSafeInteger(revision) && revision > 0 ? revision : 1;
}

function compactAutomationStatus(spec) {
  const value = String(spec?.automation_status || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (AUTOMATION_STATUSES.has(value)) return value;
  return spec?.automated === 'yes' ? 'ready' : spec?.automated === 'no' ? 'not_automated' : null;
}

function compactAutomated(value) {
  return value === 'yes' || value === 'no' ? value : null;
}

function compactQualityScore(value) {
  if (value === undefined || value === null || value === '') return null;
  const score = Number(value);
  return Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : null;
}

function normalizedStepType(step) {
  const value = String(step?.step_type || 'web').trim().toLowerCase();
  return STEP_TYPES.has(value) ? value : 'web';
}

function compactExternalReferences(value) {
  const uniqueReferences = [];
  const seen = new Set();
  let valueWasTruncated = false;
  for (const candidate of Array.isArray(value) ? value : []) {
    if (typeof candidate !== 'string') continue;
    const normalized = candidate.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    const compact = normalized.slice(0, EXTERNAL_REFERENCE_MAX_LENGTH);
    if (compact.length !== normalized.length) valueWasTruncated = true;
    uniqueReferences.push(compact);
  }
  return {
    values: uniqueReferences.slice(0, EXTERNAL_REFERENCE_LIMIT),
    count: uniqueReferences.length,
    truncated: valueWasTruncated || uniqueReferences.length > EXTERNAL_REFERENCE_LIMIT
  };
}

/**
 * Build the deliberately small list projection stored beside the full test spec.
 * Never add step bodies, automation code, API requests, or parameter values here.
 */
export function buildTestCaseSummaryProperty(spec = {}) {
  const steps = Array.isArray(spec.steps) ? spec.steps : [];
  const stepTypes = [...new Set(steps.map(normalizedStepType))];
  const references = compactExternalReferences(spec.external_references);
  const reviewStatus = boundedString(spec.review_status, 40);
  return {
    schema: TEST_CASE_SUMMARY_PROP,
    version: TEST_CASE_SUMMARY_VERSION,
    app_type_id: boundedString(spec.app_type_id, 255),
    status: boundedString(spec.status, 120),
    automated: compactAutomated(spec.automated),
    automation_status: compactAutomationStatus(spec),
    ai_quality_score: compactQualityScore(spec.ai_quality_score),
    step_count: steps.length,
    step_types: stepTypes,
    api_only: steps.length > 0 && stepTypes.length === 1 && stepTypes[0] === 'api',
    reviewer_id: boundedString(spec.reviewer_id, 255),
    review_status: reviewStatus && REVIEW_STATUSES.has(reviewStatus) ? reviewStatus : null,
    ai_generation_source: boundedString(spec.ai_generation_source, 80),
    ai_generation_review_status: boundedString(spec.ai_generation_review_status, 80),
    ai_generation_job_id: boundedString(spec.ai_generation_job_id, 255),
    ai_generated_at: boundedString(spec.ai_generated_at, 80),
    revision: positiveRevision(spec.revision),
    external_references: references.values,
    external_reference_count: references.count,
    external_references_truncated: references.truncated,
    updated_at: boundedString(spec.updated_at, 80)
  };
}

/**
 * Treat absent, legacy, or malformed properties as unknown. Callers can then
 * omit detail-only fields instead of manufacturing defaults for list records.
 */
export function readTestCaseSummaryProperty(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (value.schema !== TEST_CASE_SUMMARY_PROP || Number(value.version) !== TEST_CASE_SUMMARY_VERSION) return null;
  const revision = Number(value.revision);
  const stepCount = Number(value.step_count);
  if (!Number.isSafeInteger(revision) || revision < 1 || !Number.isSafeInteger(stepCount) || stepCount < 0) return null;
  if (!Array.isArray(value.step_types) || typeof value.api_only !== 'boolean') return null;
  if (!Array.isArray(value.external_references) || typeof value.external_references_truncated !== 'boolean') return null;
  if (value.review_status !== null && !REVIEW_STATUSES.has(value.review_status)) return null;
  if (value.automated !== undefined && value.automated !== null && !['yes', 'no'].includes(value.automated)) return null;
  if (value.automation_status !== undefined && value.automation_status !== null && !AUTOMATION_STATUSES.has(value.automation_status)) return null;
  if (value.step_types.some((stepType) => !STEP_TYPES.has(String(stepType).trim().toLowerCase()))) return null;
  if (value.external_references.some((reference) => typeof reference !== 'string')) return null;
  const stepTypes = [...new Set((Array.isArray(value.step_types) ? value.step_types : [])
    .map((stepType) => String(stepType).trim().toLowerCase())
    .filter((stepType) => STEP_TYPES.has(stepType)))];
  const references = compactExternalReferences(value.external_references);
  const externalReferenceCount = Number(value.external_reference_count);
  if (!Number.isSafeInteger(externalReferenceCount) || externalReferenceCount < references.values.length) return null;
  return {
    app_type_id: boundedString(value.app_type_id, 255),
    status: boundedString(value.status, 120),
    automated: compactAutomated(value.automated),
    automation_status: value.automation_status || null,
    ai_quality_score: compactQualityScore(value.ai_quality_score),
    step_count: stepCount,
    step_types: stepTypes,
    api_only: value.api_only,
    reviewer_id: boundedString(value.reviewer_id, 255),
    review_status: value.review_status,
    ai_generation_source: boundedString(value.ai_generation_source, 80),
    ai_generation_review_status: boundedString(value.ai_generation_review_status, 80),
    ai_generation_job_id: boundedString(value.ai_generation_job_id, 255),
    ai_generated_at: boundedString(value.ai_generated_at, 80),
    revision,
    external_references: references.values,
    external_reference_count: externalReferenceCount,
    external_references_truncated: value.external_references_truncated || references.truncated,
    updated_at: boundedString(value.updated_at, 80)
  };
}
