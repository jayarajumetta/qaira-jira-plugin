#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SQL_SCHEMA_PATH="${SQL_SCHEMA_PATH:-$ROOT_DIR/schema.sql}"
JIRA_SCHEMA_PATH="${JIRA_SCHEMA_PATH:-$ROOT_DIR/schema/qaira-schema.json}"
PROPERTY_MODEL_PATH="${PROPERTY_MODEL_PATH:-$ROOT_DIR/schema/qaira-property-model.json}"
FEATURE_FLAGS_PATH="${FEATURE_FLAGS_PATH:-$ROOT_DIR/admin/qaira-feature-flags.json}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

for bin in awk bash diff find jq node sort uniq; do
  command -v "$bin" >/dev/null 2>&1 || fail "Required binary not found: $bin"
done

for file in "$SQL_SCHEMA_PATH" "$JIRA_SCHEMA_PATH" "$PROPERTY_MODEL_PATH" "$FEATURE_FLAGS_PATH" "$ROOT_DIR/src/qairaSchema.js" "$ROOT_DIR/src/qairaApi.js"; do
  [[ -f "$file" ]] || fail "Required file not found: $file"
done

jq empty "$JIRA_SCHEMA_PATH" || fail "Invalid JSON: $JIRA_SCHEMA_PATH"
jq empty "$PROPERTY_MODEL_PATH" || fail "Invalid JSON: $PROPERTY_MODEL_PATH"
jq empty "$FEATURE_FLAGS_PATH" || fail "Invalid JSON: $FEATURE_FLAGS_PATH"

awk '
  toupper($1) == "CREATE" && toupper($2) == "TABLE" {
    column = (toupper($3) == "IF" ? 6 : 3)
    name = $column
    sub(/\(.*/, "", name)
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", name)
    print name
  }
' "$SQL_SCHEMA_PATH" | LC_ALL=C sort | uniq -c | awk '{print $2 "\t" $1}' > "$TMP_DIR/sql-table-occurrences.tsv"

jq -r '.tables[] | [.table, (.sourceOccurrences | tostring)] | @tsv' "$PROPERTY_MODEL_PATH" | LC_ALL=C sort > "$TMP_DIR/model-table-occurrences.tsv"

if ! diff -u "$TMP_DIR/sql-table-occurrences.tsv" "$TMP_DIR/model-table-occurrences.tsv"; then
  fail "qaira-property-model.json must cover every CREATE TABLE occurrence in schema.sql exactly"
fi

cd "$ROOT_DIR"
node --input-type=module <<'NODE'
import fs from 'node:fs';
import qairaSchema from './src/qairaSchema.js';
import { DEFAULT_FEATURE_FLAGS } from './src/qairaAccess.js';

const jiraSchema = JSON.parse(fs.readFileSync('./schema/qaira-schema.json', 'utf8'));
const model = JSON.parse(fs.readFileSync('./schema/qaira-property-model.json', 'utf8'));
const externalFeatureConfig = JSON.parse(fs.readFileSync('./admin/qaira-feature-flags.json', 'utf8'));
const apiSource = fs.readFileSync('./src/qairaApi.js', 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(JSON.stringify(qairaSchema) === JSON.stringify(jiraSchema), 'src/qairaSchema.js and schema/qaira-schema.json differ');
assert(model.schema === 'qaira.propertyModel.v1', 'Unexpected property-model schema identifier');
assert(typeof model.version === 'string' && model.version.length > 0, 'Property-model version is required');
assert(model.sourceSchema === 'schema.sql', 'Property model must identify schema.sql as its source');

const allowedStorage = new Set(['issue', 'project-property', 'issue-property', 'link', 'attachment', 'native', 'unsupported']);
assert(model.tables.every((entry) => allowedStorage.has(entry.storage)), 'Property model contains an unsupported storage kind');
assert(new Set(model.tables.map((entry) => entry.table)).size === model.tables.length, 'Property model contains duplicate table entries');

const propertyKeys = [
  ...model.projectProperties.map((entry) => entry.key),
  ...Object.values(model.issueProperties || {})
];
assert(new Set(model.projectProperties.map((entry) => entry.key)).size === model.projectProperties.length, 'Duplicate project-property keys');
for (const key of propertyKeys) {
  assert(Buffer.byteLength(key, 'utf8') <= model.limits.propertyKeyBytes, `Property key exceeds ${model.limits.propertyKeyBytes} bytes: ${key}`);
}

const projectPropertyKeys = new Set(model.projectProperties.map((entry) => entry.key));
for (const entry of model.tables.filter((candidate) => candidate.storage === 'project-property')) {
  assert(projectPropertyKeys.has(entry.canonicalKey), `Missing project-property definition for ${entry.table}: ${entry.canonicalKey}`);
}

const now = '2026-01-01T00:00:00Z';
for (const entry of model.projectProperties) {
  let value;
  if (entry.initializer === 'default-app-types') {
    value = { schema: entry.key, version: model.version, items: [
      { id: '10000:web', project_id: '10000', name: 'Web', type: 'web', is_unified: 0, created_at: now },
      { id: '10000:api', project_id: '10000', name: 'API', type: 'api', is_unified: 0, created_at: now },
      { id: '10000:mobile', project_id: '10000', name: 'Mobile', type: 'android', is_unified: 0, created_at: now },
      { id: '10000:unified', project_id: '10000', name: 'Unified', type: 'unified', is_unified: 1, created_at: now }
    ], updatedAt: now };
  } else if (entry.initializer === 'default-integrations') {
    value = { schema: entry.key, version: model.version, items: [
      { id: 'jira-native', type: 'jira', name: 'Current Jira Cloud site', api_key: null, project_key: 'QAIRA' },
      { id: 'qaira-ai', type: 'llm', name: 'Qaira Assist (deterministic) + Rovo entry point', api_key: null, project_key: 'QAIRA' }
    ], updatedAt: now };
  } else {
    assert(!entry.initializer || entry.initializer === 'static', `Unknown initializer ${entry.initializer} for ${entry.key}`);
    value = { schema: entry.key, version: model.version, ...(entry.initialValue || {}), updatedAt: now };
  }
  assert(Buffer.byteLength(JSON.stringify(value), 'utf8') <= model.limits.propertyValueBytes, `Initial property value exceeds ${model.limits.propertyValueBytes} bytes: ${entry.key}`);
}

const collectionsBlock = apiSource.match(/const COLLECTIONS = \{([\s\S]*?)\n\};/);
assert(collectionsBlock, 'Could not discover COLLECTIONS in src/qairaApi.js');
const runtimeCollections = [...collectionsBlock[1].matchAll(/:\s*'([^']+)'/g)].map((match) => `qaira.data.${match[1]}.v1`);
for (const key of runtimeCollections) {
  assert(projectPropertyKeys.has(key), `Runtime collection is missing from property model: ${key}`);
}
for (const key of ['qaira.data.feature-flags.v1', 'qaira.data.workspace-preferences.v1']) {
  assert(projectPropertyKeys.has(key), `Required compatibility property is missing: ${key}`);
}

const featureProperty = model.projectProperties.find((entry) => entry.key === 'qaira.data.feature-flags.v1');
assert(featureProperty, 'Feature-flag project property definition is missing');
const modeledFeatureFlags = featureProperty.initialValue?.flags || {};
assert(
  JSON.stringify(Object.keys(modeledFeatureFlags).sort()) === JSON.stringify(Object.keys(DEFAULT_FEATURE_FLAGS).sort())
    && Object.entries(DEFAULT_FEATURE_FLAGS).every(([key, value]) => modeledFeatureFlags[key] === value),
  'Property-model feature defaults differ from src/qairaAccess.js'
);
assert(externalFeatureConfig.schema === 'qaira.feature-flags.config.v1', 'Unexpected external feature-flag schema identifier');
assert(externalFeatureConfig.propertyKey === featureProperty.key, 'External feature-flag property key differs from the property model');
assert(
  JSON.stringify(Object.keys(externalFeatureConfig.flags || {}).sort()) === JSON.stringify(Object.keys(DEFAULT_FEATURE_FLAGS).sort())
    && Object.values(externalFeatureConfig.flags || {}).every((value) => typeof value === 'boolean'),
  'External feature-flag config must contain every registered runtime key as a boolean'
);

for (const [name, key] of Object.entries(qairaSchema.issueProperties || {})) {
  if (name === 'projectRegistry') continue;
  assert(Object.values(model.issueProperties || {}).includes(key), `Property model is missing Jira issue property ${name}: ${key}`);
}

const runProperty = apiSource.match(/const RUN_PROP = '([^']+)'/)?.[1];
assert(runProperty, 'Could not discover RUN_PROP in src/qairaApi.js');
assert(model.issueProperties.run === runProperty, 'Property model run key differs from runtime RUN_PROP');
assert(jiraSchema.issueProperties.run === runProperty, 'Jira schema run key differs from runtime RUN_PROP');

console.log(`Validated schema parity, ${model.tables.length} SQL table mappings, ${runtimeCollections.length} runtime collections, and ${propertyKeys.length} property keys.`);
NODE

while IFS= read -r script; do
  bash -n "$script" || fail "Shell syntax validation failed: $script"
done < <(find "$ROOT_DIR/admin" "$ROOT_DIR/ci" -type f -name '*.sh' | LC_ALL=C sort)

echo "Qaira schema/admin validation passed."
