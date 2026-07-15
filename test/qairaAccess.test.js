import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  ALL_PERMISSION_CODES,
  DEFAULT_FEATURE_FLAGS,
  DEFAULT_ROLES,
  FEATURE_GROUPS,
  PERMISSION_GROUPS,
  isAdministrativePermission,
  normalizedPermissionCodes,
  permissionForRequest,
  roleById
} from '../src/qairaAccess.js';

const role = (id) => {
  const match = roleById(DEFAULT_ROLES, id);
  assert.ok(match, `expected default role ${id}`);
  return match;
};

const grants = (roleId, permission) => role(roleId).permission_codes.includes(permission);

describe('Qaira default role grants', () => {
  test('permission catalog and role grants do not contain duplicates', () => {
    assert.equal(new Set(ALL_PERMISSION_CODES).size, ALL_PERMISSION_CODES.length);

    for (const item of DEFAULT_ROLES) {
      assert.equal(
        new Set(item.permission_codes).size,
        item.permission_codes.length,
        `${item.id} contains duplicate grants`
      );
      assert.deepEqual(normalizedPermissionCodes(item), item.permission_codes);
      assert.equal(item.system, true);
    }
  });

  test('Jira administrator receives the complete permission catalog', () => {
    assert.deepEqual(role('jira-admin').permission_codes, ALL_PERMISSION_CODES);
    assert.equal(grants('jira-admin', 'settings.manage'), true);
    assert.equal(grants('jira-admin', 'role.manage'), true);
    assert.equal(grants('jira-admin', 'requirement.delete'), true);
    assert.equal(grants('jira-admin', 'attachment.delete'), true);
  });

  test('viewer receives every read permission and no write or manage permission', () => {
    const viewer = role('viewer');
    const permissionLevels = new Map(
      PERMISSION_GROUPS.flatMap((group) =>
        group.permissions.map((permission) => [permission.code, permission.level])
      )
    );

    assert.ok(viewer.permission_codes.length > 0);
    assert.ok(viewer.permission_codes.every((code) => permissionLevels.get(code) === 'read'));
    assert.equal(grants('viewer', 'workspace.view'), true);
    assert.equal(grants('viewer', 'requirement.view'), true);
    assert.equal(grants('viewer', 'result.view'), true);
    assert.equal(grants('viewer', 'requirement.create'), false);
    assert.equal(grants('viewer', 'settings.manage'), false);
    assert.equal(grants('viewer', 'attachment.delete'), false);
  });

  test('QA member can perform day-to-day work but not administer or delete protected records', () => {
    assert.equal(grants('qa-member', 'requirement.create'), true);
    assert.equal(grants('qa-member', 'testcase.update'), true);
    assert.equal(grants('qa-member', 'run.execute'), true);
    assert.equal(grants('qa-member', 'result.manage'), true);
    assert.equal(grants('qa-member', 'attachment.create'), true);

    assert.equal(grants('qa-member', 'settings.manage'), false);
    assert.equal(grants('qa-member', 'feature_flag.manage'), false);
    assert.equal(grants('qa-member', 'role.manage'), false);
    assert.equal(grants('qa-member', 'project_member.manage'), false);
    assert.equal(grants('qa-member', 'requirement.delete'), false);
    assert.equal(grants('qa-member', 'run.delete'), false);
    assert.equal(grants('qa-member', 'attachment.delete'), false);
  });

  test('QA lead can govern quality artifacts but cannot receive Jira-administrative grants', () => {
    assert.equal(grants('qa-lead', 'requirement.delete'), true);
    assert.equal(grants('qa-lead', 'testcase.delete'), true);
    assert.equal(grants('qa-lead', 'quality_gate.update'), true);
    assert.equal(grants('qa-lead', 'project.manage'), false);
    assert.equal(grants('qa-lead', 'role.manage'), false);
    assert.equal(grants('qa-lead', 'project_member.manage'), false);
    assert.ok(role('qa-lead').permission_codes.every((code) => !isAdministrativePermission(code)));
  });

  test('role lookup accepts serialized ids and permission normalization rejects unknown grants', () => {
    assert.equal(roleById([{ id: 42 }], '42')?.id, 42);
    assert.equal(roleById(DEFAULT_ROLES, 'missing'), null);
    assert.deepEqual(
      normalizedPermissionCodes({
        permission_codes: ['workspace.view', 'unknown.permission', 'workspace.view']
      }),
      ['workspace.view']
    );
  });
});

describe('request authorization policy', () => {
  test('maps CRUD methods to the correct requirement permissions', () => {
    assert.equal(permissionForRequest('/requirements', 'GET'), 'requirement.view');
    assert.equal(permissionForRequest('/requirements', 'POST'), 'requirement.create');
    assert.equal(permissionForRequest('/requirements/REQ-1', 'PUT'), 'requirement.update');
    assert.equal(permissionForRequest('/requirements/REQ-1', 'PATCH'), 'requirement.update');
    assert.equal(permissionForRequest('/requirements/REQ-1', 'DELETE'), 'requirement.delete');
  });

  test('protects every managed Jira issue type with an explicit CRUD policy', () => {
    assert.equal(permissionForRequest('/test-plans', 'POST'), 'plan.create');
    assert.equal(permissionForRequest('/test-plans/PLAN-1', 'DELETE'), 'plan.delete');
    assert.equal(permissionForRequest('/automation-assets/AUTO-1', 'PUT'), 'automation.asset.update');
    assert.equal(permissionForRequest('/quality-gates/GATE-1', 'GET'), 'quality_gate.view');
    assert.equal(permissionForRequest('/object-repository-items/OBJ-1', 'DELETE'), 'automation.repository.manage');
  });

  test('uses special policies before generic resource policies', () => {
    assert.equal(permissionForRequest('/executions/RUN-1/start', 'POST'), 'run.execute');
    assert.equal(permissionForRequest('/executions/RUN-1/cases/CASE-1/ai-analysis', 'POST'), 'run.ai');
    assert.equal(permissionForRequest('/executions/RUN-1/report.pdf', 'GET'), 'run.report.export');
    assert.equal(permissionForRequest('/execution-schedules/S-1/run', 'POST'), 'schedule.run');
    assert.equal(permissionForRequest('/test-cases/CASE-1/automation/build', 'POST'), 'automation.build');
    assert.equal(permissionForRequest('/projects/10000/knowledge/documents', 'POST'), 'knowledge.manage');
  });

  test('protects explainable AI insights and previews with dedicated permissions', () => {
    assert.equal(permissionForRequest('/ai/quality-insights', 'GET'), 'quality_insight.view');
    assert.equal(permissionForRequest('/requirements/ai-create-preview', 'POST'), 'requirement.ai');
    assert.equal(permissionForRequest('/requirements/REQ-1/ai-impact-preview', 'POST'), 'requirement.ai');
    assert.equal(permissionForRequest('/test-cases/CASE-1/ai-impact-preview', 'POST'), 'testcase.ai');
    assert.equal(permissionForRequest('/executions/RUN-1/ai-failure-clusters', 'POST'), 'run.ai');
    assert.equal(permissionForRequest('/quality-gates/GATE-1/ai-assessment', 'POST'), 'quality_gate.ai');
  });

  test('protects settings, flags, and health endpoints explicitly', () => {
    assert.equal(permissionForRequest('/feature-flags', 'GET'), 'workspace.view');
    assert.equal(permissionForRequest('/feature-flags', 'PUT'), 'feature_flag.manage');
    assert.equal(permissionForRequest('/settings/localization', 'GET'), 'settings.view');
    assert.equal(permissionForRequest('/settings/localization', 'PATCH'), 'settings.manage');
    assert.equal(permissionForRequest('/admin/health', 'GET'), 'ops.view');
    assert.equal(permissionForRequest('/admin/reconcile', 'GET'), 'ops.view');
    assert.equal(permissionForRequest('/admin/reconcile', 'POST'), 'ops.manage');
  });

  test('leaves only intentional public or unmapped endpoints without a Qaira grant', () => {
    assert.equal(permissionForRequest('/metadata/domain', 'GET'), null);
    assert.equal(permissionForRequest('/auth/session', 'GET'), null);
    assert.equal(permissionForRequest('/unknown-resource', 'DELETE'), null);
  });

  test('classifies administrative permissions', () => {
    assert.equal(isAdministrativePermission('settings.manage'), true);
    assert.equal(isAdministrativePermission('role.manage'), true);
    assert.equal(isAdministrativePermission('requirement.update'), false);
    assert.equal(isAdministrativePermission('workspace.view'), false);
  });
});

describe('feature flag defaults', () => {
  const catalogKeys = FEATURE_GROUPS.flatMap((group) =>
    group.features.map((feature) => feature.key)
  );
  const isEnabled = (key) => DEFAULT_FEATURE_FLAGS[key] === true;

  test('defines each catalog feature exactly once and enables it by default', () => {
    assert.equal(new Set(catalogKeys).size, catalogKeys.length);
    assert.deepEqual(Object.keys(DEFAULT_FEATURE_FLAGS).sort(), [...catalogKeys].sort());
    assert.ok(catalogKeys.every(isEnabled));
  });

  test('fails closed for unknown feature keys', () => {
    assert.equal(DEFAULT_FEATURE_FLAGS['qaira.unknown.capability'], undefined);
    assert.equal(isEnabled('qaira.unknown.capability'), false);
    assert.equal(isEnabled(''), false);
  });

  test('contains every fail-closed feature key used for run, automation, and AI controls', () => {
    const expected = [
      'qaira.manual.runs',
      'qaira.ai.requirement_design',
      'qaira.ai.test_authoring',
      'qaira.automation.builder',
      'qaira.ai.automation',
      'qaira.automation.step_recording',
      'qaira.automation.local_execution',
      'qaira.automation.remote_execution',
      'qaira.automation.step_code',
      'qaira.ai.execution_analysis',
      'qaira.ai.quality_insights'
    ];
    assert.ok(expected.every((key) => DEFAULT_FEATURE_FLAGS[key] === true));
  });

  test('registers quality insights with its read and assessment permissions', () => {
    const feature = FEATURE_GROUPS
      .flatMap((group) => group.features)
      .find(({ key }) => key === 'qaira.ai.quality_insights');

    assert.deepEqual(feature, {
      key: 'qaira.ai.quality_insights',
      label: 'Quality insights',
      routes: ['/ai/quality-insights', '/quality-gates', '/analytics/dashboard-design-preview'],
      permissions: ['quality_insight.view', 'quality_gate.ai', 'dashboard.view']
    });
    assert.equal(grants('viewer', 'quality_insight.view'), true);
    assert.equal(grants('viewer', 'quality_gate.ai'), false);
    assert.equal(grants('jira-admin', 'quality_gate.ai'), true);
  });
});
