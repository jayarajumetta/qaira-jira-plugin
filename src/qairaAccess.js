const read = (code, description) => ({ code, description, level: 'read' });
const write = (code, description) => ({ code, description, level: 'write' });
const manage = (code, description) => ({ code, description, level: 'manage' });

export const PERMISSION_GROUPS = [
  {
    key: 'workspace',
    label: 'Workspace',
    permissions: [
      read('workspace.view', 'Open the Qaira workspace.'),
      read('dashboard.view', 'View project-scoped quality dashboards.'),
      write('dashboard.manage', 'Create and update project-scoped quality dashboards.'),
      read('settings.view', 'View workspace settings.'),
      manage('settings.manage', 'Change workspace settings.'),
      manage('feature_flag.manage', 'Enable or pause Qaira capabilities.')
    ]
  },
  {
    key: 'projects',
    label: 'Projects and access',
    permissions: [
      read('project.view', 'View Jira projects available to Qaira.'),
      manage('project.manage', 'Create or update Jira projects.'),
      manage('project.delete', 'Delete Jira projects.'),
      write('project.sync', 'Start a project synchronization.'),
      read('user.view', 'View the Atlassian user directory.'),
      read('role.view', 'View Qaira roles and permissions.'),
      manage('role.manage', 'Create, update, and delete Qaira roles.'),
      read('project_member.view', 'View Qaira project memberships.'),
      manage('project_member.manage', 'Assign Qaira project roles.')
    ]
  },
  {
    key: 'requirements',
    label: 'Requirements',
    permissions: [
      read('requirement.view', 'View Jira requirements.'),
      write('requirement.create', 'Create Jira requirements.'),
      write('requirement.update', 'Update Jira requirements.'),
      manage('requirement.delete', 'Delete Jira requirements.'),
      write('requirement.import', 'Import requirement records.'),
      read('requirement.export', 'Export requirement records.'),
      write('requirement.ai', 'Generate requirement and test-design previews.'),
      read('requirement_iteration.view', 'View requirement iterations.'),
      write('requirement_iteration.create', 'Create requirement iterations.'),
      write('requirement_iteration.update', 'Update requirement iterations.'),
      manage('requirement_iteration.delete', 'Delete requirement iterations.')
    ]
  },
  {
    key: 'tests',
    label: 'Test management',
    permissions: [
      read('testcase.view', 'View test cases.'),
      write('testcase.create', 'Create test cases.'),
      write('testcase.update', 'Update test cases.'),
      manage('testcase.delete', 'Delete test cases.'),
      write('testcase.import', 'Import test cases.'),
      read('testcase.export', 'Export test cases.'),
      write('testcase.ai', 'Generate AI-assisted test drafts.'),
      write('step.manage', 'Manage test steps.'),
      read('shared_step.view', 'View shared step groups.'),
      write('shared_step.manage', 'Manage shared step groups.'),
      read('suite.view', 'View test suites.'),
      write('suite.create', 'Create test suites.'),
      write('suite.update', 'Update test suites.'),
      manage('suite.delete', 'Delete test suites.'),
      read('plan.view', 'View Jira-native test plans.'),
      write('plan.create', 'Create Jira-native test plans.'),
      write('plan.update', 'Update Jira-native test plans.'),
      manage('plan.delete', 'Delete Jira-native test plans.'),
      read('quality_gate.view', 'View Jira-native quality gates.'),
      write('quality_gate.create', 'Create Jira-native quality gates.'),
      write('quality_gate.update', 'Update Jira-native quality gates.'),
      manage('quality_gate.delete', 'Delete Jira-native quality gates.'),
      write('quality_gate.ai', 'Preview explainable quality-gate assessments.')
    ]
  },
  {
    key: 'automation',
    label: 'Automation and AI',
    permissions: [
      read('automation.view', 'View automation assets.'),
      write('automation.asset.create', 'Create Jira-native automation assets.'),
      write('automation.asset.update', 'Update Jira-native automation assets.'),
      manage('automation.asset.delete', 'Delete Jira-native automation assets.'),
      write('automation.repository.manage', 'Manage object repository records.'),
      write('automation.repository.import', 'Import object repository records.'),
      read('automation.repository.export', 'Export object repository records.'),
      write('automation.build', 'Create automation drafts.'),
      write('automation.ai', 'Use AI automation assistance.'),
      write('content.ai', 'Rephrase rich-text authoring fields with the configured Qaira LLM.'),
      read('quality_insight.view', 'View explainable Jira-native quality insights.'),
      write('automation.recorder', 'Use recorder workflows.'),
      write('automation.run.local', 'Prepare local runner executions.'),
      write('automation.run.remote', 'Prepare remote runner executions.'),
      write('automation.run.parallel', 'Configure parallel execution for automation suites and runs.'),
      read('mobile.view', 'View mobile and Appium configuration metadata.'),
      write('mobile.manage', 'Manage mobile and Appium configuration and recorder workflows.'),
      read('automation.code.view', 'View generated automation code.'),
      read('automation.preview', 'Preview generated automation.'),
      read('agentic_workflow.view', 'View agentic workflows.'),
      write('agentic_workflow.manage', 'Manage agentic workflows.'),
      write('agentic_workflow.run', 'Start agentic workflow runs.'),
      read('knowledge.view', 'View the AI knowledge repository.'),
      write('knowledge.manage', 'Manage the AI knowledge repository.'),
      read('prompt_template.view', 'View AI prompt templates.'),
      write('prompt_template.manage', 'Manage AI prompt templates.')
    ]
  },
  {
    key: 'runs',
    label: 'Runs and evidence',
    permissions: [
      read('run.view', 'View test runs.'),
      write('run.create', 'Create test runs.'),
      write('run.update', 'Update test runs.'),
      manage('run.delete', 'Delete test runs.'),
      write('run.execute', 'Record manual or external execution state.'),
      write('run.ai', 'Use run analysis assistance.'),
      read('run.report.export', 'Export run reports.'),
      write('run.report.share', 'Share run reports.'),
      read('result.view', 'View execution results.'),
      write('result.manage', 'Manage execution results.'),
      read('schedule.view', 'View execution schedules.'),
      write('schedule.create', 'Create execution schedules.'),
      write('schedule.update', 'Update execution schedules.'),
      manage('schedule.delete', 'Delete execution schedules.'),
      write('schedule.run', 'Start scheduled runs.'),
      write('attachment.create', 'Attach evidence to Jira requirements, bugs, tests, and runs.'),
      read('attachment.view', 'View Jira-native evidence attachments.'),
      manage('attachment.delete', 'Delete Jira-native evidence attachments.')
    ]
  },
  {
    key: 'test-data',
    label: 'Environment and test data',
    permissions: [
      read('environment.view', 'View test environments.'),
      write('environment.manage', 'Manage test environments.'),
      read('configuration.view', 'View test configurations.'),
      write('configuration.manage', 'Manage test configurations.'),
      read('data.view', 'View non-sensitive test data metadata.'),
      write('data.manage', 'Manage non-sensitive test data metadata.'),
      write('data.ai', 'Generate human-reviewed synthetic test data with the configured Qaira LLM.'),
      write('data.import', 'Import test data.'),
      read('data.export', 'Export test data.')
    ]
  },
  {
    key: 'operations',
    label: 'Operations',
    permissions: [
      read('notification.view', 'View notifications.'),
      write('notification.manage', 'Update notification state.'),
      read('transaction.view', 'View workspace transaction history.'),
      read('transaction.artifact.download', 'Download transaction artifacts.'),
      read('ops.view', 'View operational telemetry.'),
      manage('ops.manage', 'Clear or reconcile operational state.'),
      read('feedback.view', 'View Jira defects and feedback.'),
      write('feedback.manage', 'Create and update Jira defects and feedback.'),
      read('integration.view', 'View integration metadata.'),
      manage('integration.manage', 'Manage integration metadata.')
    ]
  }
];

export const ALL_PERMISSION_CODES = PERMISSION_GROUPS.flatMap((group) =>
  group.permissions.map((permission) => permission.code)
);

const ADMINISTRATIVE_PERMISSION_CODES = new Set([
  'settings.manage',
  'feature_flag.manage',
  'project.manage',
  'project.delete',
  'role.manage',
  'project_member.manage',
  'integration.manage',
  'ops.manage'
]);

const readOnlyPermissions = ALL_PERMISSION_CODES.filter((code) =>
  PERMISSION_GROUPS.some((group) => group.permissions.some((permission) => permission.code === code && permission.level === 'read'))
);

const memberPermissions = ALL_PERMISSION_CODES.filter((code) => ![
  'settings.manage', 'feature_flag.manage', 'project.manage', 'project.delete', 'project.sync',
  'user.view', 'role.view', 'role.manage', 'project_member.view', 'project_member.manage',
  'integration.view', 'integration.manage', 'ops.manage', 'requirement.delete', 'testcase.delete',
  'suite.delete', 'plan.delete', 'quality_gate.create', 'quality_gate.update', 'quality_gate.delete',
  'automation.asset.delete', 'run.delete', 'attachment.delete'
].includes(code));

const leadPermissions = ALL_PERMISSION_CODES.filter((code) => !ADMINISTRATIVE_PERMISSION_CODES.has(code));

export const DEFAULT_ROLES = [
  { id: 'jira-admin', name: 'Jira administrator', system: true, permission_codes: ALL_PERMISSION_CODES },
  { id: 'qa-lead', name: 'QA lead', system: true, permission_codes: leadPermissions },
  { id: 'qa-member', name: 'QA member', system: true, permission_codes: memberPermissions },
  { id: 'viewer', name: 'Viewer', system: true, permission_codes: readOnlyPermissions }
];

export const FEATURE_GROUPS = [
  {
    key: 'manual',
    label: 'Manual test management',
    description: 'Requirements, cases, reusable steps, suites, runs, bugs, environments, and test data.',
    features: [
      {
        key: 'qaira.manual.requirements',
        label: 'Requirements',
        routes: ['/requirements'],
        permissions: [
          'requirement.view', 'requirement.create', 'requirement.update', 'requirement.delete',
          'requirement.import', 'requirement.export', 'requirement_iteration.view',
          'requirement_iteration.create', 'requirement_iteration.update', 'requirement_iteration.delete',
          'attachment.view', 'attachment.create', 'attachment.delete'
        ]
      },
      {
        key: 'qaira.manual.test_cases',
        label: 'Test cases',
        routes: ['/test-cases'],
        permissions: [
          'testcase.view', 'testcase.create', 'testcase.update', 'testcase.delete',
          'testcase.import', 'testcase.export', 'step.manage',
          'attachment.view', 'attachment.create', 'attachment.delete'
        ]
      },
      {
        key: 'qaira.manual.suites',
        label: 'Suites and shared steps',
        routes: ['/design', '/shared-steps'],
        permissions: [
          'shared_step.view', 'shared_step.manage', 'suite.view', 'suite.create', 'suite.update', 'suite.delete'
        ]
      },
      {
        key: 'qaira.manual.runs',
        label: 'Runs and evidence',
        routes: ['/executions'],
        permissions: [
          'run.view', 'run.create', 'run.update', 'run.delete', 'run.execute',
          'run.report.export', 'run.report.share', 'result.view', 'result.manage',
          'schedule.view', 'schedule.create', 'schedule.update', 'schedule.delete', 'schedule.run',
          'attachment.view', 'attachment.create', 'attachment.delete'
        ]
      },
      {
        key: 'qaira.manual.bugs',
        label: 'Bugs',
        routes: ['/issues', '/feedback'],
        permissions: ['feedback.view', 'feedback.manage', 'attachment.view', 'attachment.create', 'attachment.delete']
      },
      {
        key: 'qaira.manual.plans',
        label: 'Test plans',
        routes: ['/test-plans'],
        permissions: ['plan.view', 'plan.create', 'plan.update', 'plan.delete']
      },
      {
        key: 'qaira.manual.quality_gates',
        label: 'Quality gates',
        routes: ['/quality-gates'],
        permissions: ['quality_gate.view', 'quality_gate.create', 'quality_gate.update', 'quality_gate.delete']
      },
      {
        key: 'qaira.manual.environments',
        label: 'Environments and configurations',
        routes: ['/test-environments', '/test-configurations'],
        permissions: ['environment.view', 'environment.manage', 'configuration.view', 'configuration.manage']
      },
      {
        key: 'qaira.manual.test_data',
        label: 'Test data',
        routes: ['/test-data'],
        permissions: ['data.view', 'data.manage', 'data.import', 'data.export']
      }
    ]
  },
  {
    key: 'analytics',
    label: 'Analytics',
    description: 'Project-scoped quality analytics and configurable dashboards.',
    features: [
      {
        key: 'qaira.analytics.dashboards',
        label: 'Quality and custom dashboards',
        routes: ['/'],
        permissions: ['dashboard.view', 'dashboard.manage']
      }
    ]
  },
  {
    key: 'automation',
    label: 'Automation',
    description: 'Automation design, object repository, batch processing, and mobile metadata.',
    features: [
      { key: 'qaira.automation.workspace', label: 'Automation workspace', routes: ['/automation'], permissions: ['automation.view', 'automation.preview'] },
      { key: 'qaira.automation.assets', label: 'Automation assets', routes: ['/automation-assets'], permissions: ['automation.view', 'automation.asset.create', 'automation.asset.update', 'automation.asset.delete'] },
      { key: 'qaira.automation.builder', label: 'Automation builder', routes: ['/automation'], permissions: ['automation.build'] },
      { key: 'qaira.automation.step_code', label: 'Step code editor', routes: ['/automation'], permissions: ['automation.code.view'] },
      { key: 'qaira.automation.step_recording', label: 'External recorder workflows', routes: ['/automation'], permissions: ['automation.recorder'] },
      { key: 'qaira.automation.local_execution', label: 'Local runner hand-off', routes: ['/automation', '/executions'], permissions: ['automation.run.local'] },
      { key: 'qaira.automation.remote_execution', label: 'Remote runner hand-off', routes: ['/automation', '/executions'], permissions: ['automation.run.remote'] },
      { key: 'qaira.automation.parallel_execution', label: 'Parallel automation execution', routes: ['/design', '/test-cases', '/executions'], permissions: ['automation.run.parallel'] },
      { key: 'qaira.automation.object_repository', label: 'Object repository', routes: ['/object-repository'], permissions: ['automation.view', 'automation.repository.manage', 'automation.repository.import', 'automation.repository.export'] },
      { key: 'qaira.automation.batch_process', label: 'Batch process', routes: ['/testops'], permissions: ['transaction.view', 'transaction.artifact.download'] },
      { key: 'qaira.mobile.appium', label: 'Mobile and Appium', routes: ['/test-environments', '/test-configurations', '/automation'], permissions: ['mobile.view', 'mobile.manage'] }
    ]
  },
  {
    key: 'ai',
    label: 'AI and agentic workflows',
    description: 'Human-reviewed AI design, knowledge, and workflow capabilities.',
    features: [
      { key: 'qaira.ai.requirement_design', label: 'Requirement design assistance', routes: ['/requirements'], permissions: ['requirement.ai'] },
      { key: 'qaira.ai.test_authoring', label: 'Test authoring assistance', routes: ['/test-cases'], permissions: ['testcase.ai'] },
      { key: 'qaira.ai.test_data_generation', label: 'Synthetic test data generation', routes: ['/test-data'], permissions: ['data.ai'] },
      { key: 'qaira.ai.content_rephrase', label: 'Rich-text AI rephrase', routes: ['/requirements', '/test-cases', '/design', '/issues', '/automation', '/shared-steps', '/test-environments', '/test-data'], permissions: ['content.ai'] },
      { key: 'qaira.ai.bug_triage', label: 'AI-assisted bug triage', routes: ['/feedback'], permissions: ['feedback.manage'] },
      { key: 'qaira.ai.automation', label: 'Automation assistance', routes: ['/automation'], permissions: ['automation.ai'] },
      { key: 'qaira.ai.execution_analysis', label: 'Execution analysis', routes: ['/executions'], permissions: ['run.ai'] },
      { key: 'qaira.ai.quality_insights', label: 'Quality insights', routes: ['/ai/quality-insights', '/quality-gates', '/analytics/dashboard-design-preview'], permissions: ['quality_insight.view', 'quality_gate.ai', 'dashboard.view'] },
      { key: 'qaira.ai.agentic_workflows', label: 'Agentic workflows', routes: ['/agentic-workflows'], permissions: ['agentic_workflow.view', 'agentic_workflow.manage', 'agentic_workflow.run'] },
      { key: 'qaira.ai.knowledge', label: 'Knowledge repository', routes: ['/knowledge-repo'], permissions: ['knowledge.view', 'knowledge.manage'] },
      { key: 'qaira.ai.prompt_templates', label: 'Prompt templates', routes: ['/agentic-workflows'], permissions: ['prompt_template.view', 'prompt_template.manage'] }
    ]
  },
  {
    key: 'administration',
    label: 'Administration and operations',
    description: 'Access controls, integrations, notifications, and operational telemetry.',
    features: [
      { key: 'qaira.ops.projects', label: 'Projects and application types', routes: ['/projects'], permissions: ['project.view', 'project.manage', 'project.delete', 'project.sync'] },
      { key: 'qaira.ops.admin', label: 'Access administration', routes: ['/people'], permissions: ['user.view', 'role.view', 'role.manage', 'project_member.view', 'project_member.manage'] },
      { key: 'qaira.ops.settings', label: 'Workspace settings', routes: ['/settings'], permissions: ['settings.view', 'settings.manage', 'feature_flag.manage'] },
      { key: 'qaira.api.integrations', label: 'Integrations', routes: ['/integrations'], permissions: ['integration.view', 'integration.manage'] },
      { key: 'qaira.ops.notifications', label: 'Notifications', routes: ['/notifications'], permissions: ['notification.view', 'notification.manage'] },
      { key: 'qaira.ops.telemetry', label: 'Operational telemetry', routes: ['/ops-telemetry', '/traces'], permissions: ['ops.view', 'ops.manage', 'transaction.view', 'transaction.artifact.download'] }
    ]
  }
];

export const DEFAULT_FEATURE_FLAGS = Object.fromEntries(
  FEATURE_GROUPS.flatMap((group) => group.features.map((feature) => [feature.key, true]))
);

const FEATURE_DEFINITIONS = FEATURE_GROUPS.flatMap((group) =>
  group.features.map((feature) => ({
    ...feature,
    group: group.key,
    group_label: group.label
  }))
);

export function featureAvailabilityForPermission(permissionCode) {
  return FEATURE_DEFINITIONS
    .filter((feature) => feature.permissions.includes(permissionCode))
    .map(({ key, label, group, group_label }) => ({ key, label, group, group_label }));
}

const ROOT_POLICIES = {
  '/projects': ['project.view', 'project.manage', 'project.manage', 'project.delete'],
  '/users': ['user.view', 'role.manage', 'role.manage', 'role.manage'],
  '/roles': ['role.view', 'role.manage', 'role.manage', 'role.manage'],
  '/permissions': ['role.view', 'role.manage', 'role.manage', 'role.manage'],
  '/project-members': ['project_member.view', 'project_member.manage', 'project_member.manage', 'project_member.manage'],
  '/requirements': ['requirement.view', 'requirement.create', 'requirement.update', 'requirement.delete'],
  '/requirement-iterations': ['requirement_iteration.view', 'requirement_iteration.create', 'requirement_iteration.update', 'requirement_iteration.delete'],
  '/feedback': ['feedback.view', 'feedback.manage', 'feedback.manage', 'feedback.manage'],
  '/test-cases': ['testcase.view', 'testcase.create', 'testcase.update', 'testcase.delete'],
  '/test-steps': ['testcase.view', 'step.manage', 'step.manage', 'step.manage'],
  '/shared-step-groups': ['shared_step.view', 'shared_step.manage', 'shared_step.manage', 'shared_step.manage'],
  '/test-suites': ['suite.view', 'suite.create', 'suite.update', 'suite.delete'],
  '/test-plans': ['plan.view', 'plan.create', 'plan.update', 'plan.delete'],
  '/quality-gates': ['quality_gate.view', 'quality_gate.create', 'quality_gate.update', 'quality_gate.delete'],
  '/automation-assets': ['automation.view', 'automation.asset.create', 'automation.asset.update', 'automation.asset.delete'],
  '/object-repository-items': ['automation.view', 'automation.repository.manage', 'automation.repository.manage', 'automation.repository.manage'],
  '/ai/quality-insights': ['quality_insight.view', 'quality_insight.view', 'quality_insight.view', 'quality_insight.view'],
  '/suite-test-cases': ['suite.view', 'suite.update', 'suite.update', 'suite.update'],
  '/test-case-modules': ['testcase.view', 'testcase.update', 'testcase.update', 'testcase.update'],
  '/executions': ['run.view', 'run.create', 'run.update', 'run.delete'],
  '/execution-results': ['result.view', 'result.manage', 'result.manage', 'result.manage'],
  '/execution-schedules': ['schedule.view', 'schedule.create', 'schedule.update', 'schedule.delete'],
  '/test-environments': ['environment.view', 'environment.manage', 'environment.manage', 'environment.manage'],
  '/test-configurations': ['configuration.view', 'configuration.manage', 'configuration.manage', 'configuration.manage'],
  '/test-data-sets': ['data.view', 'data.manage', 'data.manage', 'data.manage'],
  '/agentic-workflows': ['agentic_workflow.view', 'agentic_workflow.manage', 'agentic_workflow.manage', 'agentic_workflow.manage'],
  '/agentic-workflow-runs': ['agentic_workflow.view', 'agentic_workflow.run', 'agentic_workflow.run', 'agentic_workflow.run'],
  '/ai-prompt-templates': ['prompt_template.view', 'prompt_template.manage', 'prompt_template.manage', 'prompt_template.manage'],
  '/integrations': ['integration.view', 'integration.manage', 'integration.manage', 'integration.manage'],
  '/notifications': ['notification.view', 'notification.manage', 'notification.manage', 'notification.manage'],
  '/workspace-transactions': ['transaction.view', 'transaction.view', 'transaction.view', 'ops.manage'],
  '/ops-telemetry': ['ops.view', 'ops.manage', 'ops.manage', 'ops.manage'],
  '/app-types': ['project.view', 'project.manage', 'project.manage', 'project.manage'],
  '/quality-dashboards': ['dashboard.view', 'dashboard.manage', 'dashboard.manage', 'dashboard.manage'],
  '/analytics/jql': ['dashboard.view', 'dashboard.view', 'dashboard.view', 'dashboard.view'],
  '/analytics/jql-batch': ['dashboard.view', 'dashboard.view', 'dashboard.view', 'dashboard.view'],
  '/analytics/dashboard-design-preview': ['dashboard.view', 'dashboard.view', 'dashboard.view', 'dashboard.view']
};

const methodIndex = (method) => ({ GET: 0, POST: 1, PUT: 2, PATCH: 2, DELETE: 3 }[method] ?? 0);

export function permissionForRequest(pathname, method = 'GET') {
  if (pathname === '/feature-flags') return method === 'GET' ? 'workspace.view' : 'feature_flag.manage';
  if (pathname === '/requirements/create-metadata') return 'requirement.create';
  if (pathname === '/requirements/ai-create-preview') return 'requirement.ai';
  if (pathname === '/requirements/ai-description-rephrase') return 'requirement.ai';
  if (pathname === '/ai/rich-text-rephrase') return 'content.ai';
  if (pathname === '/test-data-sets/ai-generate-preview') return 'data.ai';
  if (pathname === '/executions/smart-plan-preview') return 'run.ai';
  if (pathname === '/requirements/ai-create-jobs' || /^\/requirements\/ai-create-jobs\/[^/]+$/.test(pathname)) return 'requirement.ai';
  if (pathname === '/feedback/ai-draft-preview') return 'feedback.manage';
  if (pathname === '/feedback/create-metadata') return 'feedback.manage';
  if (pathname === '/requirements/import') return 'requirement.import';
  if (pathname === '/requirements/export') return 'requirement.export';
  if (pathname === '/test-cases/import') return 'testcase.import';
  if (pathname === '/test-cases/export') return 'testcase.export';
  if (pathname === '/test-cases/ai-authoring-preview' || pathname === '/test-cases/ai-step-rephrase' || pathname === '/test-cases/design-test-cases-preview') return 'testcase.ai';
  if (pathname === '/test-cases/ai-generation-jobs') return method === 'GET' ? 'testcase.view' : 'testcase.ai';
  if (pathname === '/test-cases/automation/learning-cache/export.csv') return 'automation.repository.export';
  if (pathname === '/test-cases/automation/learning-cache/import') return 'automation.repository.import';
  if (pathname === '/test-cases/automation/learning-cache/extract' || pathname === '/test-cases/automation/learning-cache/extract-fields') return 'automation.repository.manage';
  if (pathname === '/metadata/domain' || pathname.startsWith('/auth/')) return null;
  if (pathname === '/analytics/dashboard-design-preview') return 'quality_insight.view';
  if (pathname === '/analytics/jql' || pathname === '/analytics/jql-batch') return 'dashboard.view';
  if (pathname === '/admin/health') return 'ops.view';
  if (pathname === '/admin/reconcile') return method === 'GET' ? 'ops.view' : 'ops.manage';
  if (pathname.startsWith('/settings/')) return method === 'GET' ? 'settings.view' : 'settings.manage';
  if (/^\/projects\/[^/]+\/knowledge(?:\/|$)/.test(pathname)) return method === 'GET' ? 'knowledge.view' : 'knowledge.manage';
  if (pathname.startsWith('/test-cases/automation/learning-cache')) return method === 'GET' ? 'automation.view' : 'automation.repository.manage';
  if (/^\/test-cases\/[^/]+\/automation\/build$/.test(pathname)) return 'automation.build';
  if (/^\/test-cases\/[^/]+\/automation\/generator-jobs$/.test(pathname)) return 'automation.build';
  if (pathname.includes('/automation/recorder-session')) return 'automation.recorder';
  if (/^\/test-cases\/[^/]+\/(?:accept-generated|reject-generated)$/.test(pathname)) return 'testcase.update';
  if (/^\/test-cases\/[^/]+\/review$/.test(pathname)) return 'testcase.update';
  if (/^\/test-cases\/[^/]+\/versions\/\d+\/restore$/.test(pathname)) return 'testcase.update';
  if (/^\/test-cases\/[^/]+\/versions(?:\/\d+)?$/.test(pathname)) return 'testcase.view';
  if (/^\/executions\/[^/]+\/(?:start|complete|rerun)$/.test(pathname)) return 'run.execute';
  if (/^\/executions\/[^/]+\/cases\/[^/]+\/steps\/[^/]+\/run$/.test(pathname)) return 'run.execute';
  if (/^\/executions\/[^/]+\/cases\/[^/]+\/assignment$/.test(pathname)) return 'run.update';
  if (/^\/executions\/[^/]+\/cases\/[^/]+\/ai-analysis$/.test(pathname)) return 'run.ai';
  if (/^\/executions\/[^/]+\/ai-failure-clusters$/.test(pathname)) return 'run.ai';
  if (/^\/requirements\/[^/]+\/ai-impact-preview$/.test(pathname)) return 'requirement.ai';
  if (/^\/requirements\/[^/]+\/(?:design-test-cases-preview|(?:ai-)?optimize-preview|generate-test-cases)$/.test(pathname)) return 'requirement.ai';
  if (/^\/requirements\/[^/]+\/design-test-cases-accept$/.test(pathname)) return 'testcase.create';
  if (/^\/test-cases\/[^/]+\/ai-impact-preview$/.test(pathname)) return 'testcase.ai';
  if (/^\/quality-gates\/[^/]+\/ai-assessment$/.test(pathname)) return 'quality_gate.ai';
  if (/^\/executions\/[^/]+\/cases\/[^/]+\/report\.pdf$/.test(pathname)) return 'run.report.export';
  if (/^\/executions\/[^/]+\/cases\/[^/]+\/share-report$/.test(pathname)) return 'run.report.share';
  if (/^\/executions\/[^/]+\/report\.pdf$/.test(pathname)) return 'run.report.export';
  if (/^\/executions\/[^/]+\/share-report$/.test(pathname)) return 'run.report.share';
  if (/^\/quality-dashboards\/[^/]+\/report\.pdf$/.test(pathname)) return 'dashboard.view';
  if (/^\/quality-dashboards\/[^/]+\/share-report$/.test(pathname)) return 'dashboard.manage';
  if (/^\/execution-schedules\/[^/]+\/run$/.test(pathname)) return 'schedule.run';
  if (/^\/workspace-transactions\/[^/]+\/artifacts\/[^/]+\/download$/.test(pathname)) return 'transaction.artifact.download';
  if (pathname.startsWith('/requirement-test-cases')) return method === 'GET' ? 'requirement.view' : 'requirement.update';
  if (pathname.startsWith('/requirement-defects')) return method === 'GET' ? 'requirement.view' : 'requirement.update';
  if (pathname.startsWith('/test-case-defects')) return method === 'GET' ? 'testcase.view' : 'testcase.update';
  if (pathname.startsWith('/local-agent/')) return method === 'GET' ? 'automation.view' : 'automation.run.local';

  const root = Object.keys(ROOT_POLICIES)
    .sort((left, right) => right.length - left.length)
    .find((candidate) => pathname === candidate || pathname.startsWith(`${candidate}/`));
  return root ? ROOT_POLICIES[root][methodIndex(method)] : null;
}

export function permissionPolicyCatalog() {
  return Object.entries(ROOT_POLICIES).map(([route, permissions]) => ({
    route,
    methods: {
      GET: permissions[0],
      POST: permissions[1],
      PUT: permissions[2],
      PATCH: permissions[2],
      DELETE: permissions[3]
    }
  }));
}

export function roleById(roles, roleId) {
  return roles.find((role) => String(role.id) === String(roleId)) || null;
}

export function normalizedPermissionCodes(role) {
  return [...new Set((role?.permission_codes || []).filter((code) => ALL_PERMISSION_CODES.includes(code)))];
}

export function isAdministrativePermission(code) {
  return ADMINISTRATIVE_PERMISSION_CODES.has(code);
}
