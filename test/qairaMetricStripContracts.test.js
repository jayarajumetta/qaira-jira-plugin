import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const stylesSource = read('../static/qaira-ui/src/styles.css');
const darkThemeSource = read('../static/qaira-ui/src/dark-theme.css');

const pageMetricSources = [
  read('../static/qaira-ui/src/pages/OverviewPage.tsx'),
  read('../static/qaira-ui/src/pages/ProjectsPage.tsx'),
  read('../static/qaira-ui/src/pages/AdminSpacePage.tsx'),
  read('../static/qaira-ui/src/pages/KnowledgeRepoPage.tsx'),
  read('../static/qaira-ui/src/pages/RequirementsPage.tsx'),
  read('../static/qaira-ui/src/pages/AgenticWorkflowsPage.tsx'),
  read('../static/qaira-ui/src/pages/AuthPage.tsx'),
  read('../static/qaira-ui/src/components/ProjectTraceabilityMap.tsx'),
  read('../static/qaira-ui/src/components/ReleaseReadinessDashboard.tsx')
];

test('page-level metric summaries use the shared metric-strip contract', () => {
  pageMetricSources.forEach((source) => {
    assert.match(source, /metric-strip page-metric-strip/);
  });
  assert.match(stylesSource, /\.page-metric-strip\.metric-strip\s*\{/);
});

test('metric strips only advertise Open when a metric card is interactive', () => {
  assert.match(stylesSource, /\.metric-strip :is\(a, button\)\.mini-card::after/);
  assert.match(stylesSource, /\.metric-strip \.mini-card\[role="button"\]::after/);
  assert.doesNotMatch(stylesSource, /\.metric-strip \.mini-card::after/);
});

test('dark theme treats metric-strip as layout rather than a nested card surface', () => {
  assert.doesNotMatch(stylesSource, /:root\[data-theme="dark"\] \.metric-strip,\s*\n/);
  assert.doesNotMatch(darkThemeSource, /:root\[data-theme="dark"\] \.metric-strip,\s*\n/);
});
