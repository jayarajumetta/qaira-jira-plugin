# Qaira for Jira setup and upgrade

## Choose the correct path

- **Existing configured installation:** validate, build, deploy, and use `forge install --upgrade`. Do not rerun Jira configuration merely for a frontend/backend deployment.
- **New Jira site or new project:** validate the project map, run a targeted dry run, review its artifacts, apply the Jira configuration, then deploy/install Forge.
- **Existing installation adopting the property model:** take a Jira configuration backup, run a targeted dry run, then apply with screen/scheme/context changes disabled as shown below.

The restored canonical `schema.sql` is never executed in any path. Validation requires a Jira mapping for all 46 unique tables.

## Prerequisites

- Jira Cloud site and a company-managed pilot project
- Jira global administrator account for the admin configuration step
- Atlassian API token for that administrator
- Forge CLI authenticated as an owner/contributor of the app ID in `manifest.yml`
- Node.js 22, npm, `bash`, `curl`, `jq`, `awk`, `diff`, `sort`, and `uniq`
- a backup/export of affected Jira schemes and a change record for production rollout

Use a sandbox or dedicated pilot project first. Do not start with `PROJECT_KEYS=ALL`.

## 1. Validate the package

```bash
cd /path/to/qaira-for-jira
nvm use 22.22.0
npm run setup
npm run verify
npm run build
```

`npm run setup` performs lockfile-based clean installs for both the Forge backend and `static/qaira-ui`. Validation checks JavaScript syntax/tests, frontend types, shell syntax, JSON parity, all 46 SQL-table mappings, runtime collection coverage, all 28 registered feature flags through schema/runtime parity, canonical issue-property keys, and Jira property key/value sizes. The build creates the hosted Custom UI files under `static/qaira-ui/dist`.

## 2. Configure the project map

Edit `admin/qaira-project-map.json`. Use actual issue-type names visible in each target project:

```json
{
  "projects": {
    "PAY": {
      "requirementIssueTypeNames": ["Story", "Feature"],
      "defectIssueTypeNames": ["Bug"],
      "releaseSource": "fixVersions"
    }
  }
}
```

The current runtime actively resolves requirement/defect issue-type names. Other map fields are descriptive until a matching runtime adapter is implemented; do not assume they alter Sprint, Component, Epic, or Task handling.

## 3. Establish admin credentials safely

```bash
export JIRA_BASE_URL="https://your-site.atlassian.net"
export JIRA_EMAIL="jira-admin@example.com"
read -rsp "Jira API token: " JIRA_API_TOKEN; echo
export JIRA_API_TOKEN
export JIRA_AUTH_MODE="basic"
export PROJECT_KEYS="PAY"
```

Do not put the token directly in a command line, shell script, `.env` file, or repository. The setup runner passes credentials through a mode-0600 temporary curl config and protects run-state files with `umask 077`.

## Apply feature availability independently

Feature availability is external deployment configuration. Edit `admin/qaira-feature-flags.json`, then run a targeted dry run and apply it without rerunning issue types, fields, screens, or other Jira setup:

```bash
export PROJECT_KEYS="PAY"
export DRY_RUN="true"
npm run setup:feature-flags

export DRY_RUN="false"
npm run setup:feature-flags
```

The script validates the external catalog against the runtime keys, preserves the project-property envelope and revision, and writes only `qaira.data.feature-flags.v1`. `PROJECT_KEYS=ALL` requires `CONFIRM_ALL_PROJECTS=true` for a non-dry run. The app reads the resulting Jira project property on each resolver request; flags remain rollout controls and never grant permissions.

Confirm access:

```bash
bash admin/diagnose-jira-access.sh
```

The authenticated user must be visible, the pilot project must be returned, and the user should have global Administer Jira permission.

## 4. Run and review a dry run

```bash
DRY_RUN=true \
PROJECT_KEYS="PAY" \
bash admin/setup-qaira-jira.sh
```

Review the newest directory under `.qaira-setup-state/runs/`, especially:

- `project-native-types.json`
- `<PROJECT>-available-issue-types.json`
- `api-trace.jsonl`
- `skipped-resources.jsonl`

The dry run performs discovery and writes only protected local diagnostics; it does not mutate Jira.

## 5. Apply a new-site/project configuration

```bash
DRY_RUN=false \
PROJECT_KEYS="PAY" \
CONFIGURE_FIELD_CONTEXTS=true \
CONFIGURE_SCREENS=true \
ASSIGN_TO_COMPANY_MANAGED_PROJECTS=true \
CONTINUE_ON_CONTEXT_ERROR=false \
FAIL_ON_MISSING_NATIVE_TYPES=true \
bash admin/setup-qaira-jira.sh
```

The setup creates/reuses Qaira issue types, fields and links; adds them to the pilot project where supported; creates missing property envelopes; and writes a size-checked `qaira.registry.v1` containing compact property-model metadata.

`STRICT_FIELD_CONTEXTS` is deprecated and ignored. Qaira never deletes pre-existing field contexts.

For an intentional site-wide rollout, first complete and approve this site-wide dry run:

```bash
DRY_RUN=true PROJECT_KEYS="ALL" bash admin/setup-qaira-jira.sh
```

Only after reviewing and approving its project inventory may an administrator apply it:

```bash
DRY_RUN=false PROJECT_KEYS="ALL" CONFIRM_ALL_PROJECTS=true CONTINUE_ON_CONTEXT_ERROR=false bash admin/setup-qaira-jira.sh
```

Without `CONFIRM_ALL_PROJECTS=true`, a real run with `PROJECT_KEYS=ALL` fails closed.

## 6. Adopt the property model on an existing configured project

Use this only when the current registry/property envelopes need migration metadata. Back up Jira configuration and review a dry run first. Disable scheme, screen, and context mutation:

```bash
DRY_RUN=false \
PROJECT_KEYS="QAIRA" \
CONFIGURE_FIELD_CONTEXTS=false \
CONFIGURE_SCREENS=false \
ASSIGN_TO_COMPANY_MANAGED_PROJECTS=false \
CONTINUE_ON_CONTEXT_ERROR=false \
bash admin/setup-qaira-jira.sh
```

The initializer preserves every existing project property. The setup still verifies/reuses globally named issue types, fields and link types so the registry can be rebuilt from authoritative IDs.

## 7. Build and deploy Forge

```bash
npm run verify
npm run build
forge lint
forge deploy -e development
```

First installation on a site:

```bash
forge install \
  -e development \
  -s your-site.atlassian.net \
  -p Jira
```

Upgrade an existing installation:

```bash
forge install \
  -e development \
  -s your-site.atlassian.net \
  -p Jira \
  --upgrade
```

Do not run `forge register` when deploying the existing app identity. If the manifest app ID is not owned by the authenticated Forge account, stop and resolve ownership in the Atlassian Developer Console.

Use `forge install` only for the first installation on a site. Use `forge install --upgrade` after every deployment that changes code, modules, permissions, or scopes on an already installed site. A scope change can prompt the site administrator to grant updated consent.

## 8. Validate after installation

Validate with separate administrator, QA lead/member, and read-only users:

1. Open both the global Qaira page and the project Qaira page.
2. Confirm `qaira.registry.v1` exists and its `propertyModel.version` is present.
3. Create, read, edit, and delete disposable Test Case, Suite, Plan, Automation Asset, Object Repository Item, and Quality Gate issues.
4. Create, read, edit, and delete a disposable Test Data Set and confirm it uses a `qaira.data.test-data-sets.v1.item.*` project-property shard.
5. Link a Test Case to a requirement and verify both link directions.
6. Create a Test Run, record and update a small result, attach evidence, then delete the result/evidence.
7. Confirm a non-admin without explicit Qaira membership is read-only and cannot mutate issues or project configuration.
8. Confirm QA Member, QA Lead, Viewer, and Jira administrator behavior with separate accounts.
9. With an authorized account, verify `GET /ai/quality-insights` and the requirement, test-case, run failure-cluster, and quality-gate preview routes return evidence/provenance without changing their source records; disable `qaira.ai.quality_insights` and confirm its protected routes fail closed.
10. Verify locator improvement `POST` does not apply a suggestion and that only the explicitly confirmed `PUT .../ai-improve/apply` changes the Object Repository record.
11. Review `.qaira-setup-state/runs/<RUN_ID>/success-state.json` and all skipped-resource entries.

## Operational relationship reconciliation

Jira issue links are the relationship authority; Qaira issue properties retain compact relationship projections for UI/API compatibility. Normal CRUD keeps both representations aligned. Use reconciliation only to detect or repair historical/manual drift.

The paths below are authenticated `qairaApi` resolver paths, not public Jira REST URLs. Invoke them through the supported Qaira admin client or an approved resolver test/operations harness under the operator's Atlassian session; do not expose a new unauthenticated HTTP wrapper.

Start with a dry run as a user with `ops.view`, Jira project access, and the enabled `qaira.ops.admin` feature:

```text
GET /admin/reconcile?project_id=<project-id>&limit=50
```

Review `drift`, `drift_count`, `possibly_truncated`, and the proposed fields. A production apply requires `ops.manage`, Jira project/global administration, and explicit confirmation:

```json
POST /admin/reconcile
{
  "project_id": "<project-id>",
  "confirmed": true,
  "limit": 50,
  "max_changes": 10
}
```

The apply repairs at most the bounded `max_changes` property projections from current Jira links; it never rewrites the authoritative links. Inspect `applied`, `errors`, `remaining_count`, and `possibly_truncated`, then run another dry run. Continue in reviewed small batches rather than raising limits or building an unbounded loop. Retain the responses in the production change record.

## 9. Import CI/JUnit results

The optional importer creates a `Qaira Test Run` issue, uploads the JUnit XML as a Jira attachment, updates the searchable run rollup fields, and writes compact attachment/count metadata to `qaira.runExecution.v1`:

```bash
export JIRA_BASE_URL="https://your-site.atlassian.net"
export JIRA_EMAIL="ci-service-account@example.com"
export JIRA_API_TOKEN="<secret supplied by the CI secret store>"
export PROJECT_KEY="PAY"
export RUN_ENVIRONMENT="staging"
export BUILD_NUMBER="${CI_BUILD_NUMBER:-local}"

bash ci/import-junit-to-jira.sh ./reports/junit.xml
```

The CI identity needs permission to browse the project, create the configured Test Run issue type, set the configured Qaira fields, add attachments, and write issue properties. The importer passes credentials through a mode-`0600` temporary curl configuration, fails on transport errors, non-2xx attachment responses, and malformed attachment responses, and removes that configuration on exit. If upload fails after issue creation, it prints and retains the issue key for diagnosis and does not write a misleading run property.

## Failure recovery and rollback

The setup is additive and name-based, but Jira configuration is not transactional.

- On failure, preserve the protected run directory and inspect the last API call.
- Fix the permission, mapping, limit, or Jira scheme error and rerun the same targeted command.
- Existing project-property values and field contexts are never overwritten/deleted by initialization.
- `created-resources.jsonl` identifies resources created by the failed run. Do not blindly delete global fields, issue types, links, screens, or schemes; first verify that no other project uses them.
- Restore project scheme assignments from the pre-change Jira backup if a scheme assignment must be rolled back.
- Removing the Forge app does not delete Jira issues, fields, links, properties, or attachments. Data removal is a separate, explicitly approved Jira administration operation.

After setup, restrict retention of local traces because they can contain Jira configuration and user metadata:

```bash
unset JIRA_API_TOKEN
```

Archive the required audit artifacts in approved secure storage, then delete local run directories according to your retention policy.

## Production promotion

Repeat validation in staging, then deploy/install with `-e production`. Scope changes can require a new consent/upgrade. Record the app version, property-model version, registry byte size, selected projects, created resources, skipped resources, and validation evidence in the production change ticket.
