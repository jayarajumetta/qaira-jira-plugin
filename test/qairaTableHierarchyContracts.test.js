import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const dataTableSource = read('../static/qaira-ui/src/components/DataTable.tsx');
const columnPreferencesSource = read('../static/qaira-ui/src/lib/tablePreferences/columnPreferences.ts');
const requirementsSource = read('../static/qaira-ui/src/pages/RequirementsPage.tsx');
const testCasesSource = read('../static/qaira-ui/src/pages/TestCasesPage.tsx');
const designSource = read('../static/qaira-ui/src/pages/DesignPage.tsx');
const executionsSource = read('../static/qaira-ui/src/pages/ExecutionsPage.tsx');
const peopleSource = read('../static/qaira-ui/src/pages/PeoplePage.tsx');
const settingsSource = read('../static/qaira-ui/src/pages/SettingsPage.tsx');

test('selection columns stay first and never expose table reorder or resize controls', () => {
  assert.match(
    columnPreferencesSource,
    /const pinnedSelectionKeys = allColumnKeys\.filter\(isSelectionColumnKey\)[\s\S]*const orderedColumnKeys = \[[\s\S]*\.\.\.pinnedSelectionKeys/
  );
  assert.match(
    columnPreferencesSource,
    /moveColumnKey[\s\S]*isSelectionColumnKey\(draggedKey\)[\s\S]*isSelectionColumnKey\(targetKey\)/
  );
  assert.match(
    dataTableSource,
    /const canReorderColumn = [\s\S]*column\.canReorder !== false[\s\S]*!isSelectionColumn\(column\)/
  );
  assert.match(
    dataTableSource,
    /const canResizeColumn = [\s\S]*column\.canResize !== false && !isSelectionColumn\(column\)/
  );
  assert.match(
    dataTableSource,
    /\{canReorderColumn\(column\) \? \([\s\S]*className="data-table-config-drag-handle"/
  );
  assert.match(
    dataTableSource,
    /\{enableHeaderColumnReorder && canReorderColumn\(column\) \? \([\s\S]*className="data-table-header-drag-handle"/
  );
  assert.match(dataTableSource, /\{enableColumnResize && canResizeColumn\(column\) \? \(/);
});

test('catalog hierarchy headers use the shared collapse-expand icon instead of text glyphs', () => {
  assert.match(
    requirementsSource,
    /function HierarchyToggleIcon[\s\S]*<CollapseExpandIcon isExpanded=\{isExpanded\} \/>/
  );
  assert.match(
    testCasesSource,
    /function ModuleChevronIcon[\s\S]*<CollapseExpandIcon isExpanded=\{isExpanded\} \/>/
  );
  assert.doesNotMatch(requirementsSource, /isExpanded \? "−" : "\+"/);
  assert.doesNotMatch(testCasesSource, /isExpanded \? "−" : "\+"/);
  assert.match(
    designSource,
    /suite-module-group-header[\s\S]*<CollapseExpandIcon isExpanded=\{isExpanded\} \/>/
  );
  assert.match(
    executionsSource,
    /execution-module-scope-header[\s\S]*<CollapseExpandIcon isExpanded=\{isExpanded\} \/>/
  );
  assert.match(peopleSource, /permission-group-chevron[\s\S]*<CollapseExpandIcon isExpanded=\{isExpanded\} \/>/);
  assert.match(settingsSource, /settings-section-toggle-icon[\s\S]*<CollapseExpandIcon isExpanded=\{isExpanded\} \/>/);
  assert.doesNotMatch(peopleSource, /isExpanded \? "-" : "\+"/);
  assert.doesNotMatch(settingsSource, /isExpanded \? "-" : "\+"/);
});
