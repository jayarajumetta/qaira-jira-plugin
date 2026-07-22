import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildColumnPresetWidths,
  estimateColumnContentWidth,
  getColumnMinimumWidth,
  getColumnPresetWidth
} from '../static/qaira-ui/src/lib/tablePreferences/columnSizing.ts';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const dataTableSource = read('../static/qaira-ui/src/components/DataTable.tsx');
const columnPreferencesSource = read('../static/qaira-ui/src/lib/tablePreferences/columnPreferences.ts');

test('compact and comfortable presets are content-aware and header-safe', () => {
  const column = {
    key: 'execution_status',
    label: 'Execution status',
    width: 300,
    minWidth: 92,
    maxWidth: 480
  };
  const measuredWidth = estimateColumnContentWidth(['Execution status', 'Awaiting environment approval']);
  const headerMinimum = getColumnMinimumWidth(column, 20);
  const compactWidth = getColumnPresetWidth(column, 'compact', measuredWidth, 20);
  const comfortableWidth = getColumnPresetWidth(column, 'comfortable', measuredWidth, 20);

  assert.ok(compactWidth >= headerMinimum);
  assert.ok(comfortableWidth > compactWidth);
  assert.ok(comfortableWidth <= column.maxWidth);
});

test('preset sizing covers every supplied column without leaking selection state', () => {
  const columns = [
    { key: 'title', label: 'Title', width: 320, minWidth: 180 },
    { key: 'owner', label: 'Owner', width: 180, minWidth: 88 }
  ];
  const widths = buildColumnPresetWidths(columns, 'compact', {
    title: estimateColumnContentWidth(['Checkout works']),
    owner: estimateColumnContentWidth(['Quality Engineering'])
  });

  assert.deepEqual(Object.keys(widths), ['title', 'owner']);
  assert.ok(widths.title >= 180);
  assert.ok(widths.owner >= getColumnMinimumWidth(columns[1]));
});

test('shared table presets preserve their independent responsibilities', () => {
  assert.match(dataTableSource, /enableColumnResize = true/);
  assert.match(dataTableSource, /showAllColumns[\s\S]*visibleColumnKeys: configurableColumns\.map/);
  assert.match(dataTableSource, /resetColumns[\s\S]*normalizeColumnPreference\(resolvedColumns\)/);
  assert.match(dataTableSource, /setDensity[\s\S]*columnWidths: presetWidths[\s\S]*density/);
  assert.match(dataTableSource, /persistenceFingerprint = `\$\{storageKey\}:\$\{serializedPreference\}`/);
  assert.match(dataTableSource, />Show all</);
  assert.match(dataTableSource, />Default</);
  assert.match(dataTableSource, />Compact</);
  assert.match(dataTableSource, />Comfortable</);
  assert.match(
    columnPreferencesSource,
    /column\.canToggle !== false && column\.defaultVisible !== false/
  );
});
