import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { DEFAULT_FEATURE_FLAGS } from '../src/qairaAccess.js';
import qairaSchema from '../src/qairaSchema.js';

const root = path.resolve(import.meta.dirname, '..');
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [target] : [];
  });
}

test('frontend fail-closed feature keys are all registered by the backend', () => {
  const frontendRoot = path.join(root, 'static/qaira-ui/src');
  const referenced = new Set();
  for (const file of sourceFiles(frontendRoot)) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/qaira\.(?:manual|automation|ai|api|ops|mobile)\.[a-z0-9_.-]+/g)) {
      referenced.add(match[0]);
    }
  }
  const unknown = [...referenced].filter((key) => !Object.hasOwn(DEFAULT_FEATURE_FLAGS, key)).sort();
  assert.deepEqual(unknown, []);
});

test('admin feature defaults exactly match backend defaults', () => {
  const model = readJson('schema/qaira-property-model.json');
  const property = model.projectProperties.find((entry) => entry.key === 'qaira.data.feature-flags.v1');
  assert.ok(property);
  assert.deepEqual(property.initialValue.flags, DEFAULT_FEATURE_FLAGS);
});

test('external feature flag setup contains the complete registered catalog', () => {
  const config = readJson('admin/qaira-feature-flags.json');
  assert.equal(config.schema, 'qaira.feature-flags.config.v1');
  assert.equal(config.propertyKey, 'qaira.data.feature-flags.v1');
  assert.deepEqual(Object.keys(config.flags).sort(), Object.keys(DEFAULT_FEATURE_FLAGS).sort());
  assert.equal(Object.values(config.flags).every((value) => typeof value === 'boolean'), true);
});

test('every declared runtime issue property is represented by the property model', () => {
  const model = readJson('schema/qaira-property-model.json');
  const modeled = new Set(Object.values(model.issueProperties));
  for (const [name, key] of Object.entries(qairaSchema.issueProperties)) {
    if (name === 'projectRegistry') continue;
    assert.equal(modeled.has(key), true, `${name} (${key}) is missing from the property model`);
  }
});

test('JUnit importer uses the canonical run property', () => {
  const importer = fs.readFileSync(path.join(root, 'ci/import-junit-to-jira.sh'), 'utf8');
  assert.match(importer, /RUN_PROP_KEY="qaira\.runExecution\.v1"/);
  assert.doesNotMatch(importer, /qaira\.runIndex\.v1/);
});
