import { makeResolver } from '@forge/resolver';
import qairaSchema from './qairaSchema.js';
import {
  executeAgenticWorkflowRun,
  handleQairaApi,
  synchronizeJiraAdministratorMemberships,
  workspaceSummary
} from './qairaApi.js';

function resolveProjectKey(payload = {}, context = {}) {
  return payload.projectKey
    || payload.project_key
    || payload.inputs?.projectKey
    || payload.inputs?.project_key
    || context?.extension?.project?.key
    || context?.extension?.projectKey
    || context?.extension?.issue?.fields?.project?.key
    || '';
}

function resolveIssueKey(payload = {}, context = {}) {
  return payload.issueKey
    || payload.issue_key
    || payload.requirementKey
    || payload.testCaseKey
    || payload.objectKey
    || payload.inputs?.issueKey
    || payload.inputs?.requirementKey
    || payload.inputs?.testCaseKey
    || payload.inputs?.objectKey
    || context?.extension?.issue?.key
    || '';
}

const definitions = {
  /**
   * Single compatibility resolver used by the uploaded Qaira frontend.
   * The frontend keeps its original REST-shaped API surface and transports
   * every request through Forge bridge invoke().
   */
  async qairaApi({ payload = {}, context = {} }) {
    try {
      return await handleQairaApi(payload, context);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || 'Unknown Qaira error');
      if (!error?.qairaLogged) {
        console.error('Qaira API resolver failed before request telemetry initialized', {
          path: String(payload?.path || '/').split('?')[0],
          method: payload?.method,
          message,
          stack: error instanceof Error ? error.stack : undefined
        });
      }
      const reference = error?.requestId ? ` (reference ${error.requestId})` : '';
      const code = error?.code ? `[${error.code}] ` : '';
      const publicError = new Error(`${code}${message}${reference}`);
      publicError.name = error?.name || 'QairaError';
      throw publicError;
    }
  },

  async getSchema() {
    return qairaSchema;
  },

  async getWorkspaceSummary({ payload = {}, context = {} }) {
    return workspaceSummary(resolveProjectKey(payload, context));
  },

  async getProjectRegistry({ payload = {}, context = {} }) {
    const summary = await workspaceSummary(resolveProjectKey(payload, context));
    return summary.registry || null;
  }
};

// makeResolver avoids CommonJS/ESM constructor interop problems in Node 22.
export const handler = makeResolver(definitions);

export async function agenticWorkflowConsumer(event = {}) {
  const body = event.body || {};
  if (body.jobType === 'sync-jira-admin-memberships') {
    return synchronizeJiraAdministratorMemberships({
      accountId: body.accountId,
      accountIds: body.accountIds,
      completeAdminSet: body.completeAdminSet,
      projects: body.projects,
      anchorKey: body.anchorKey,
      fingerprint: body.fingerprint
    });
  }
  return executeAgenticWorkflowRun({
    projectKey: body.projectKey,
    runId: body.runId,
    retryCount: Number(event.retryContext?.retryCount || 0)
  });
}

function actionKeyFrom(payload = {}) {
  return String(
    payload.actionKey
      || payload.action?.key
      || payload.context?.actionKey
      || payload.key
      || ''
  );
}

function actionInputs(payload = {}) {
  return payload.inputs && typeof payload.inputs === 'object'
    ? { ...payload, ...payload.inputs }
    : payload;
}

/**
 * Bounded Rovo action handler. Write-oriented actions create drafts/previews
 * for human review and do not silently approve or overwrite Jira artifacts.
 */
export async function rovoAction(payload = {}, context = {}) {
  const input = actionInputs(payload);
  const actionKey = actionKeyFrom(payload);
  const projectKey = resolveProjectKey(input, context);
  const issueKey = resolveIssueKey(input, context);

  try {
    if (actionKey.includes('read-qa-context')) {
      return await workspaceSummary(projectKey);
    }

    if (actionKey.includes('draft-test-cases')) {
      if (!issueKey) {
        return {
          status: 'needs-input',
          message: 'Select or provide a Jira Story/requirement key before drafting test cases.'
        };
      }
      return await handleQairaApi({
        path: `/requirements/${encodeURIComponent(issueKey)}/design-test-cases-preview`,
        method: 'POST',
        body: {
          projectKey,
          count: Number(input.count || 6),
          max_cases: Number(input.count || 6),
          approvalMode: 'preview'
        }
      }, context);
    }

    if (actionKey.includes('calculate-release-risk')) {
      const search = new URLSearchParams();
      if (projectKey) search.set('projectKey', projectKey);
      if (input.releaseName) search.set('release', String(input.releaseName));
      const insight = await handleQairaApi({
        path: `/ai/quality-insights${search.size ? `?${search.toString()}` : ''}`,
        method: 'GET'
      }, context);
      return {
        project: insight.project,
        scope: insight.scope,
        releaseName: input.releaseName || null,
        releaseConfidenceIndex: insight.metrics?.releaseConfidenceIndex ?? 0,
        evidence: insight.metrics || {},
        insights: insight.insights || [],
        provenance: insight.provenance,
        requiresHumanReview: true,
        summary: insight.release_summary || 'Release risk was calculated from release-scoped Jira-native Qaira evidence.'
      };
    }

    if (actionKey.includes('draft-automation')) {
      if (!issueKey) {
        return {
          status: 'needs-input',
          message: 'Provide a Qaira Test Case key before drafting automation.'
        };
      }
      return await handleQairaApi({
        path: `/test-cases/${encodeURIComponent(issueKey)}/automation/build`,
        method: 'POST',
        body: {
          projectKey,
          framework: input.framework || 'Playwright',
          preview: true
        }
      }, context);
    }

    if (actionKey.includes('suggest-locators')) {
      const objectKey = input.objectKey || issueKey;
      if (!objectKey) {
        return {
          status: 'needs-input',
          projectKey,
          message: 'Select or provide a Qaira Object Repository Item key so the suggestion can be grounded in Jira evidence.'
        };
      }
      return await handleQairaApi({
        path: `/test-cases/automation/learning-cache/${encodeURIComponent(objectKey)}/ai-improve`,
        method: 'POST',
        body: { projectKey, label: input.label || null, approvalMode: 'preview' }
      }, context);
    }

    if (actionKey.includes('export-report')) {
      const summary = await workspaceSummary(projectKey);
      return {
        reportType: input.reportType || 'business-metrics',
        generatedAt: new Date().toISOString(),
        project: summary.project,
        metrics: summary.metrics,
        recommendations: summary.recommendations,
        message: 'Open Qaira Reports to download the full CSV export generated from Jira-native records.'
      };
    }

    return {
      status: 'unsupported-action',
      actionKey,
      projectKey,
      issueKey,
      message: 'Qaira received the Rovo action but no matching bounded action was configured.'
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || 'Unknown Rovo action error');
    console.error('Qaira Rovo action failed', { actionKey, projectKey, issueKey, message });
    return {
      status: 'error',
      actionKey,
      projectKey,
      issueKey,
      message
    };
  }
}
