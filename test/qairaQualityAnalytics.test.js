import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDashboardGadgetResult,
  normalizeQualityDashboard,
  qualityDashboardTemplate,
  qualityDashboardTemplateCatalog,
  scopedDashboardJql
} from '../src/qualityAnalytics.js';

test('custom dashboard JQL is always constrained to the active Jira project', () => {
  assert.equal(
    scopedDashboardJql('QAIRA', 'status != Done ORDER BY priority DESC'),
    'project = "QAIRA" AND (status != Done) ORDER BY priority DESC'
  );
  assert.match(scopedDashboardJql('QAIRA', 'project = OTHER'), /^project = "QAIRA" AND \(project = OTHER\)/);
  assert.equal(
    scopedDashboardJql('QAIRA', 'summary ~ "order by checkout" ORDER BY "Story Points" ASC, priority DESC'),
    'project = "QAIRA" AND (summary ~ "order by checkout") ORDER BY "Story Points" ASC, priority DESC'
  );
  assert.throws(
    () => scopedDashboardJql('QAIRA', 'status != Done ORDER BY updated DESC ()'),
    /ORDER BY/
  );
});

test('quality dashboard definitions and results stay bounded', () => {
  const dashboard = normalizeQualityDashboard({
    name: 'Release view',
    gadgets: Array.from({ length: 20 }, (_, index) => ({ title: `G${index}`, type: 'donut', group_by: 'status' }))
  });
  assert.equal(dashboard.gadgets.length, 12);
  const result = buildDashboardGadgetResult([
    { id: '1', key: 'Q-1', fields: { summary: 'One', status: { name: 'To Do' } } },
    { id: '2', key: 'Q-2', fields: { summary: 'Two', status: { name: 'Done' } } }
  ], dashboard.gadgets[0], 4);
  assert.equal(result.total, 4);
  assert.equal(result.truncated, true);
  assert.deepEqual(result.series, [{ label: 'Done', value: 1 }, { label: 'To Do', value: 1 }]);
});

test('stakeholder templates are complete, release-aware, and use Qaira Jira issue types', () => {
  const catalog = qualityDashboardTemplateCatalog();
  assert.deepEqual(catalog.map((item) => item.id), ['executive', 'product', 'quality', 'automation']);
  assert.deepEqual(Object.fromEntries(catalog.map((item) => [item.id, item.gadget_count])), {
    executive: 8,
    product: 8,
    quality: 12,
    automation: 8
  });

  const dashboard = qualityDashboardTemplate('quality', { release: 'R2', goal: 'Reduce checkout risk' });
  assert.equal(dashboard.gadgets.length, 12);
  assert.ok(dashboard.gadgets.some((gadget) => gadget.type === 'line'));
  assert.ok(dashboard.gadgets.some((gadget) => gadget.type === 'stacked-bar'));
  assert.ok(dashboard.gadgets.filter((gadget) => gadget.data_source === 'jira').every((gadget) => gadget.jql.includes('fixVersion = "R2"')));
  assert.ok(dashboard.gadgets.some((gadget) => gadget.data_source === 'qaira' && gadget.metric === 'executionCycleHours'));
  assert.ok(dashboard.gadgets.some((gadget) => gadget.data_source === 'qaira' && gadget.group_by === 'module'));
  assert.ok(dashboard.gadgets.some((gadget) => gadget.jql.includes('"Qaira Test Case"')));
  assert.match(dashboard.description, /Reduce checkout risk/);
});

test('metric gadgets derive actionable Jira quality values', () => {
  const result = buildDashboardGadgetResult([
    { id: '1', fields: { created: '2026-01-01T00:00:00.000Z', updated: '2026-01-02T00:00:00.000Z', priority: { name: 'Highest' }, resolution: null } },
    { id: '2', fields: { created: new Date().toISOString(), updated: new Date().toISOString(), priority: { name: 'Low' }, resolution: { name: 'Done' } } }
  ], { type: 'metric', metric: 'highPriority' }, 2);
  assert.equal(result.value, 1);
  assert.equal(result.value_label, 'high-priority items inspected');
});

test('quality metrics include resolution flow and calendar groupings', () => {
  const created = '2026-07-01T00:00:00.000Z';
  const resolved = '2026-07-05T00:00:00.000Z';
  const result = buildDashboardGadgetResult([
    { id: '1', fields: { created, updated: resolved, resolutiondate: resolved, resolution: { name: 'Done' }, components: [{ name: 'Checkout' }] } },
    { id: '2', fields: { created, updated: resolved, resolution: null, components: [{ name: 'Checkout' }] } }
  ], { type: 'metric', metric: 'resolutionRate', group_by: 'components' }, 2);
  assert.equal(result.value, 50);
  assert.equal(result.value_label, 'percent resolved in the inspected set');
  assert.deepEqual(result.series, [{ label: 'Checkout', value: 2 }]);
});
