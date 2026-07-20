const SUPPORTED_GADGETS = new Set(['metric', 'donut', 'bar', 'stacked-bar', 'line', 'table']);
const SUPPORTED_GROUPS = new Set(['status', 'statusCategory', 'priority', 'issuetype', 'assignee', 'reporter', 'components', 'fixVersion', 'labels', 'sprint', 'resolution', 'module', 'createdWeek', 'updatedWeek', 'createdMonth', 'updatedMonth']);
const SUPPORTED_METRICS = new Set(['count', 'resolved', 'unresolved', 'highPriority', 'unassigned', 'overdue', 'stale30d', 'created30d', 'resolved30d', 'resolutionRate', 'averageAgeDays', 'averageResolutionDays', 'releaseConfidence', 'requirementCoverage', 'coverageGaps', 'automationCoverage', 'openDefects', 'failedRuns', 'executionCycleHours', 'completedRuns30d', 'testCases', 'testSuites', 'testRuns', 'moduleCaseCount']);
const DERIVED_METRICS = new Set(['count', 'releaseConfidence', 'requirementCoverage', 'coverageGaps', 'automationCoverage', 'openDefects', 'failedRuns', 'executionCycleHours', 'completedRuns30d', 'testCases', 'testSuites', 'testRuns', 'moduleCaseCount']);
const SUPPORTED_ACCENTS = new Set(['blue', 'green', 'purple', 'orange', 'red', 'teal', 'slate']);

function text(value, fallback = '') {
  return String(value ?? fallback).trim();
}

export function splitJqlOrderBy(jql) {
  const input = text(jql);
  let quote = null;
  let escaped = false;
  let depth = 0;
  let matchIndex = -1;
  let matchLength = 0;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\' && quote) {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '(') depth += 1;
    else if (character === ')') depth = Math.max(0, depth - 1);
    if (depth) continue;
    const orderByMatch = input.slice(index).match(/^\s+ORDER\s+BY\s+/i);
    if (orderByMatch) {
      matchIndex = index;
      matchLength = orderByMatch[0].length;
      break;
    }
  }
  if (matchIndex < 0) return { predicate: input, orderBy: 'updated DESC' };
  return {
    predicate: input.slice(0, matchIndex).trim(),
    orderBy: input.slice(matchIndex + matchLength).trim() || 'updated DESC'
  };
}

export function scopedDashboardJql(projectKey, userJql = '') {
  const project = text(projectKey);
  if (!/^[A-Z][A-Z0-9_]{1,19}$/i.test(project)) throw new Error('A valid Jira project key is required.');
  const { predicate, orderBy } = splitJqlOrderBy(userJql);
  if (predicate.length > 1800) throw new Error('Dashboard JQL must be 1800 characters or fewer.');
  if (/[\u0000\r\n]/.test(predicate) || /\b(?:DELETE|UPDATE|INSERT)\b/i.test(predicate)) {
    throw new Error('Dashboard JQL contains unsupported content.');
  }
  const orderField = '(?:"[^"\\r\\n]{1,120}"|cf\\[\\d+\\]|[A-Za-z][A-Za-z0-9_.]{0,119})';
  const orderExpression = new RegExp(`^${orderField}(?:\\s+(?:ASC|DESC))?(?:\\s*,\\s*${orderField}(?:\\s+(?:ASC|DESC))?)*$`, 'i');
  if (orderBy.length > 250 || !orderExpression.test(orderBy)) {
    throw new Error('Dashboard ORDER BY must contain Jira fields with optional ASC or DESC directions.');
  }
  const scopedPredicate = predicate ? `project = "${project}" AND (${predicate})` : `project = "${project}"`;
  return `${scopedPredicate} ORDER BY ${orderBy}`;
}

export function normalizeDashboardGadget(input = {}, index = 0) {
  const type = SUPPORTED_GADGETS.has(input.type) ? input.type : 'metric';
  const groupBy = SUPPORTED_GROUPS.has(input.group_by) ? input.group_by : 'status';
  const dataSource = input.data_source === 'qaira' ? 'qaira' : 'jira';
  const metric = SUPPORTED_METRICS.has(input.metric) ? input.metric : 'count';
  return {
    id: text(input.id) || `gadget-${index + 1}`,
    title: text(input.title, `Quality signal ${index + 1}`).slice(0, 120),
    data_source: dataSource,
    type,
    jql: text(input.jql).slice(0, 1800),
    release: text(input.release).slice(0, 120) || undefined,
    group_by: groupBy,
    metric: dataSource === 'qaira' && !DERIVED_METRICS.has(metric) ? 'count' : metric,
    accent: SUPPORTED_ACCENTS.has(input.accent) ? input.accent : 'blue'
  };
}

export function normalizeQualityDashboard(input = {}, existing = null) {
  const gadgets = Array.isArray(input.gadgets) ? input.gadgets.slice(0, 12) : existing?.gadgets || [];
  return {
    ...(existing || {}),
    ...input,
    name: text(input.name, existing?.name || 'Quality dashboard').slice(0, 120),
    description: text(input.description, existing?.description || '').slice(0, 500),
    layout: ['single', 'two-column', 'three-column'].includes(input.layout) ? input.layout : existing?.layout || 'two-column',
    gadgets: gadgets.map(normalizeDashboardGadget)
  };
}

function groupLabel(issue, groupBy) {
  const fields = issue?.fields || {};
  if (groupBy === 'labels') return Array.isArray(fields.labels) && fields.labels.length ? fields.labels : ['Unlabelled'];
  if (groupBy === 'components') return Array.isArray(fields.components) && fields.components.length
    ? fields.components.map((item) => item?.name || item?.id).filter(Boolean)
    : ['No component'];
  if (groupBy === 'fixVersion') return Array.isArray(fields.fixVersions) && fields.fixVersions.length
    ? fields.fixVersions.map((item) => item?.name || item?.id).filter(Boolean)
    : ['No fix version'];
  if (groupBy === 'statusCategory') return [fields.status?.statusCategory?.name || 'No status category'];
  if (groupBy === 'createdMonth' || groupBy === 'updatedMonth') {
    const value = fields[groupBy === 'createdMonth' ? 'created' : 'updated'];
    const date = value ? new Date(value) : null;
    return [date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 7) : 'No date'];
  }
  if (groupBy === 'createdWeek' || groupBy === 'updatedWeek') {
    const value = fields[groupBy === 'createdWeek' ? 'created' : 'updated'];
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return ['No date'];
    const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const weekday = utc.getUTCDay() || 7;
    utc.setUTCDate(utc.getUTCDate() + 4 - weekday);
    const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((utc.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
    return [`${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`];
  }
  if (groupBy === 'sprint') {
    const sprints = Array.isArray(fields.sprint) ? fields.sprint : fields.sprint ? [fields.sprint] : [];
    return sprints.length ? sprints.map((sprint) => sprint?.name || sprint?.value || sprint).filter(Boolean) : ['No sprint'];
  }
  const value = fields[groupBy];
  return [value?.displayName || value?.name || value?.value || value || `No ${groupBy}`];
}

function metricValue(rows, metric, total) {
  const now = Date.now();
  if (metric === 'count') return Number.isFinite(Number(total)) ? Number(total) : rows.length;
  if (metric === 'resolved') return rows.filter((issue) => Boolean(issue.fields?.resolution)).length;
  if (metric === 'unresolved') return rows.filter((issue) => !issue.fields?.resolution).length;
  if (metric === 'highPriority') return rows.filter((issue) => /highest|high|blocker|critical/i.test(String(issue.fields?.priority?.name || ''))).length;
  if (metric === 'unassigned') return rows.filter((issue) => !issue.fields?.assignee).length;
  if (metric === 'overdue') return rows.filter((issue) => !issue.fields?.resolution && issue.fields?.duedate && new Date(issue.fields.duedate).getTime() < now).length;
  if (metric === 'stale30d') return rows.filter((issue) => !issue.fields?.resolution && issue.fields?.updated && now - new Date(issue.fields.updated).getTime() >= 30 * 86_400_000).length;
  if (metric === 'created30d') return rows.filter((issue) => issue.fields?.created && now - new Date(issue.fields.created).getTime() <= 30 * 86_400_000).length;
  if (metric === 'resolved30d') return rows.filter((issue) => issue.fields?.resolutiondate && now - new Date(issue.fields.resolutiondate).getTime() <= 30 * 86_400_000).length;
  if (metric === 'resolutionRate') return rows.length ? Math.round((rows.filter((issue) => Boolean(issue.fields?.resolution)).length / rows.length) * 100) : 0;
  if (metric === 'averageAgeDays') {
    const ages = rows.map((issue) => issue.fields?.created ? Math.max(0, (now - new Date(issue.fields.created).getTime()) / 86_400_000) : null).filter(Number.isFinite);
    return ages.length ? Math.round(ages.reduce((sum, value) => sum + value, 0) / ages.length) : 0;
  }
  if (metric === 'averageResolutionDays') {
    const durations = rows.map((issue) => {
      const created = issue.fields?.created ? new Date(issue.fields.created).getTime() : Number.NaN;
      const resolved = issue.fields?.resolutiondate ? new Date(issue.fields.resolutiondate).getTime() : Number.NaN;
      return Number.isFinite(created) && Number.isFinite(resolved) && resolved >= created ? (resolved - created) / 86_400_000 : null;
    }).filter(Number.isFinite);
    return durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : 0;
  }
  return rows.length;
}

export function qualityDashboardMetricLabel(metric) {
  return ({
    count: 'matching Jira items',
    resolved: 'resolved items inspected',
    unresolved: 'unresolved items inspected',
    highPriority: 'high-priority items inspected',
    unassigned: 'unassigned items inspected',
    overdue: 'overdue unresolved items inspected',
    stale30d: 'unresolved items stale 30+ days',
    created30d: 'items created in the last 30 days',
    resolved30d: 'items resolved in the last 30 days',
    resolutionRate: 'percent resolved in the inspected set',
    averageAgeDays: 'average age in days',
    averageResolutionDays: 'average resolution time in days',
    releaseConfidence: 'release confidence index',
    requirementCoverage: 'percent of requirements linked to tests',
    coverageGaps: 'requirements without linked tests',
    automationCoverage: 'percent of test cases automated',
    openDefects: 'open Jira bugs in QAira scope',
    failedRuns: 'failed test runs',
    executionCycleHours: 'average completed run cycle in hours',
    completedRuns30d: 'completed test runs in the last 30 days',
    testCases: 'test cases in the inspected portfolio',
    testSuites: 'test suites in the inspected portfolio',
    testRuns: 'test runs in the inspected portfolio',
    moduleCaseCount: 'test cases distributed across modules'
  })[metric] || 'matching Jira items';
}

export function buildDashboardGadgetResult(issues, gadget, total = null) {
  const normalized = normalizeDashboardGadget(gadget);
  const rows = Array.isArray(issues) ? issues : [];
  const groups = new Map();
  for (const issue of rows) {
    for (const label of groupLabel(issue, normalized.group_by)) {
      const key = text(label, 'Unknown');
      groups.set(key, (groups.get(key) || 0) + 1);
    }
  }
  const isChronological = ['createdWeek', 'updatedWeek', 'createdMonth', 'updatedMonth'].includes(normalized.group_by);
  const series = [...groups.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((left, right) => isChronological ? left.label.localeCompare(right.label) : right.value - left.value || left.label.localeCompare(right.label))
    .slice(0, 20);
  const value = metricValue(rows, normalized.metric, total);
  return {
    gadget: normalized,
    total: Number.isFinite(Number(total)) ? Number(total) : rows.length,
    value,
    value_label: qualityDashboardMetricLabel(normalized.metric),
    returned: rows.length,
    truncated: Number(total || rows.length) > rows.length,
    series,
    rows: normalized.type === 'table' ? rows.slice(0, 50).map((issue) => ({
      id: String(issue.id || ''),
      key: issue.key || '',
      title: issue.fields?.summary || '',
      status: issue.fields?.status?.name || null,
      priority: issue.fields?.priority?.name || null,
      type: issue.fields?.issuetype?.name || null,
      assignee: issue.fields?.assignee?.displayName || null,
      updated: issue.fields?.updated || null
    })) : []
  };
}

function quotedJqlValue(value) {
  return `"${text(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').slice(0, 120)}"`;
}

const DASHBOARD_TEMPLATES = {
  executive: {
    name: 'Executive release health',
    description: 'Release exposure, unresolved quality risk, ownership, and delivery trend for go/no-go review.',
    layout: 'three-column',
    gadgets: [
      { title: 'Open blockers', type: 'metric', jql: 'resolution = Unresolved AND priority in (Highest, High)', metric: 'count' },
      { title: 'Open bugs', type: 'metric', jql: 'issuetype = Bug AND resolution = Unresolved', metric: 'count' },
      { title: 'Ninety-day closure rate', type: 'metric', jql: 'updated >= -90d', metric: 'resolutionRate' },
      { title: 'Unassigned exposure', type: 'metric', jql: 'resolution = Unresolved AND assignee is EMPTY', metric: 'count' },
      { title: 'Delivery state', type: 'donut', jql: '', group_by: 'statusCategory' },
      { title: 'Risk by release', type: 'bar', jql: 'resolution = Unresolved', group_by: 'fixVersion' },
      { title: 'Critical work requiring review', type: 'table', jql: 'resolution = Unresolved AND priority in (Highest, High) ORDER BY priority DESC, updated DESC', group_by: 'priority' },
      { title: 'Ninety-day demand trend', type: 'line', jql: 'created >= -90d', group_by: 'createdMonth' }
    ]
  },
  product: {
    name: 'Product quality and coverage',
    description: 'Requirement flow, product risk, defect pressure, ownership gaps, and release distribution.',
    layout: 'three-column',
    gadgets: [
      { title: 'Open product scope', type: 'metric', jql: 'issuetype in (Story, Epic) AND resolution = Unresolved', metric: 'count' },
      { title: 'Product blockers', type: 'metric', jql: 'issuetype in (Story, Epic, Bug) AND resolution = Unresolved AND priority in (Highest, High)', metric: 'count' },
      { title: 'Average open-scope age', type: 'metric', jql: 'issuetype in (Story, Epic) AND resolution = Unresolved', metric: 'averageAgeDays' },
      { title: 'Scope by workflow', type: 'donut', jql: 'issuetype in (Story, Epic)', group_by: 'statusCategory' },
      { title: 'Defects by priority', type: 'bar', jql: 'issuetype = Bug AND resolution = Unresolved', group_by: 'priority' },
      { title: 'Scope by release', type: 'stacked-bar', jql: 'issuetype in (Story, Epic, Bug)', group_by: 'fixVersion' },
      { title: 'Unowned product work', type: 'table', jql: 'issuetype in (Story, Epic, Bug) AND resolution = Unresolved AND assignee is EMPTY ORDER BY priority DESC, updated ASC', group_by: 'issuetype' },
      { title: 'Product change trend', type: 'line', jql: 'issuetype in (Story, Epic, Bug) AND updated >= -90d', group_by: 'updatedMonth' }
    ]
  },
  quality: {
    name: 'Quality engineering command center',
    description: 'Release confidence, traceability, automation, defect trend, QA throughput, real execution cycle time, modules, and requirement flow.',
    layout: 'three-column',
    gadgets: [
      { title: 'Release confidence', type: 'metric', data_source: 'qaira', jql: '', metric: 'releaseConfidence', accent: 'blue' },
      { title: 'Requirement traceability', type: 'metric', data_source: 'qaira', jql: '', metric: 'requirementCoverage', accent: 'green' },
      { title: 'Effective automation', type: 'metric', data_source: 'qaira', jql: '', metric: 'automationCoverage', accent: 'purple' },
      { title: 'Open test defects', type: 'metric', data_source: 'qaira', jql: '', metric: 'openDefects', accent: 'red' },
      { title: 'Execution cycle time', type: 'metric', data_source: 'qaira', jql: '', metric: 'executionCycleHours', accent: 'teal' },
      { title: 'QA throughput · 30 days', type: 'metric', data_source: 'qaira', jql: '', metric: 'completedRuns30d', accent: 'green' },
      { title: 'Bug creation trend', type: 'line', jql: 'issuetype = Bug AND created >= -90d', group_by: 'createdMonth', accent: 'red' },
      { title: 'QA closure by owner', type: 'bar', jql: 'issuetype in (Bug, "Qaira Test Case", "Qaira Test Run") AND resolved >= -30d', group_by: 'assignee', metric: 'resolved30d', accent: 'blue' },
      { title: 'Test distribution by module', type: 'bar', data_source: 'qaira', jql: '', group_by: 'module', metric: 'moduleCaseCount', accent: 'purple' },
      { title: 'Requirement flow', type: 'donut', jql: 'issuetype in (Story, Epic)', group_by: 'statusCategory', accent: 'blue' },
      { title: 'Execution workflow', type: 'stacked-bar', data_source: 'qaira', jql: '', group_by: 'status', metric: 'testRuns', accent: 'teal' },
      { title: 'Critical work requiring action', type: 'table', jql: 'issuetype in (Bug, Story, "Qaira Test Case", "Qaira Test Run") AND resolution = Unresolved AND priority in (Highest, High) ORDER BY priority DESC, updated ASC', group_by: 'priority', accent: 'orange' }
    ]
  },
  automation: {
    name: 'Automation and reliability',
    description: 'Automation portfolio, unowned work, reliability risk, and change trend for engineering review.',
    layout: 'three-column',
    gadgets: [
      { title: 'Automation candidates', type: 'metric', jql: 'issuetype = "Qaira Test Case" AND resolution = Unresolved', metric: 'count' },
      { title: 'High-priority manual exposure', type: 'metric', jql: 'issuetype = "Qaira Test Case" AND resolution = Unresolved AND priority in (Highest, High)', metric: 'count' },
      { title: 'Stale automation candidates', type: 'metric', jql: 'issuetype = "Qaira Test Case" AND resolution = Unresolved', metric: 'stale30d' },
      { title: 'Cases by workflow', type: 'donut', jql: 'issuetype = "Qaira Test Case"', group_by: 'status' },
      { title: 'Cases by label', type: 'bar', jql: 'issuetype = "Qaira Test Case"', group_by: 'labels' },
      { title: 'Automation ownership', type: 'stacked-bar', jql: 'issuetype = "Qaira Test Case" AND resolution = Unresolved', group_by: 'assignee' },
      { title: 'Test maintenance trend', type: 'line', jql: 'issuetype = "Qaira Test Case" AND updated >= -90d', group_by: 'updatedMonth' },
      { title: 'Oldest automation candidates', type: 'table', jql: 'issuetype = "Qaira Test Case" AND resolution = Unresolved ORDER BY updated ASC', group_by: 'priority' }
    ]
  }
};

export function qualityDashboardTemplate(stakeholder = 'quality', options = {}) {
  const key = Object.hasOwn(DASHBOARD_TEMPLATES, stakeholder) ? stakeholder : 'quality';
  const source = DASHBOARD_TEMPLATES[key];
  const release = text(options.release);
  const releaseClause = release ? `fixVersion = ${quotedJqlValue(release)}` : '';
  const goal = text(options.goal).slice(0, 300);
  return normalizeQualityDashboard({
    ...source,
    name: text(options.name, source.name),
    description: goal ? `${source.description} Focus: ${goal}` : source.description,
    gadgets: source.gadgets.map((gadget, index) => ({
      ...gadget,
      id: `${key}-${index + 1}`,
      release: release || undefined,
      jql: gadget.data_source === 'qaira' ? '' : [releaseClause, gadget.jql].filter(Boolean).join(' AND ')
    }))
  });
}

export function qualityDashboardTemplateCatalog() {
  return Object.entries(DASHBOARD_TEMPLATES).map(([id, dashboard]) => ({
    id,
    name: dashboard.name,
    description: dashboard.description,
    gadget_count: dashboard.gadgets.length
  }));
}
