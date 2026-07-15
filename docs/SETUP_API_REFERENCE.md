# Setup API Reference

`admin/setup-qaira-jira.sh` is a curl-based, idempotent Jira admin setup runner.

It does not execute the restored canonical `schema.sql`. Before any Jira call it validates all 46 unique table mappings in `schema/qaira-property-model.json` against every `CREATE TABLE` occurrence in that reference file.

## What it configures

- Global Qaira Jira issue types
- Qaira issue link types
- Qaira standard Jira custom fields
- Custom field contexts scoped to project IDs and issue type IDs
- Select/multiselect options
- Company-managed issue type scheme additions
- Company-managed screens, tabs, screen schemes, issue type screen schemes
- Per-project registry as Jira project property `qaira.registry.v1`
- Missing runtime collection, role, membership, permission, feature-flag (35 registered keys), and preference property envelopes
- Registry/property byte-size guards for Jira's 32,768-byte entity-property limit

## Required environment

```bash
export JIRA_BASE_URL="https://your-domain.atlassian.net"
export JIRA_EMAIL="admin@company.com"
read -rsp "Jira API token: " JIRA_API_TOKEN; echo
export JIRA_API_TOKEN
export PROJECT_KEYS="PAY" # start with one pilot; comma-separated keys are supported
```

## Safety switches

```bash
export DRY_RUN=true
export CONFIGURE_SCREENS=true
export ASSIGN_TO_COMPANY_MANAGED_PROJECTS=true
export ENABLE_REQUIREMENT_ROLLUP_FIELDS=true
export CONFIGURE_FIELD_CONTEXTS=true
export STRICT_FIELD_CONTEXTS=false # deprecated and ignored; contexts are never deleted
export ENABLE_SMOKE_VALIDATION=false
export CONFIRM_ALL_PROJECTS=false # required as true for a real PROJECT_KEYS=ALL run
```

## Recommended rollout

1. Sandbox Jira site, `PROJECT_KEYS=one-pilot-project`, `DRY_RUN=true`.
2. Sandbox pilot execution, `DRY_RUN=false`.
3. Validate issue create screens and project registry.
4. Run smoke validation.
5. Run production pilot for 1–3 company-managed projects.
6. Expand to `PROJECT_KEYS=ALL` after admin approval and set `CONFIRM_ALL_PROJECTS=true` explicitly.

## Why not Forge custom field types?

Core Qaira persistence uses standard Jira custom fields so data remains Jira-readable and recoverable. Forge custom field types are avoided for source-of-record fields because they bind behavior to the app lifecycle.

## Project map and native Jira types

Qaira does not create Requirement or Defect issue types. It maps Jira-native types into Qaira sections through `admin/qaira-project-map.json`.

Default:

```json
{
  "defaults": {
    "requirementIssueTypeNames": ["Story"],
    "defectIssueTypeNames": ["Bug"],
    "releaseSource": "fixVersions"
  }
}
```

The setup script resolves the actual Jira issue type IDs per selected project using Jira create/project metadata before creating requirement rollup contexts.

## Additional recovery/safety variables

```bash
export PROJECT_MAP_PATH="admin/qaira-project-map.json"
export STATE_DIR=".qaira-setup-state"
export API_RETRIES=5
export API_RETRY_BASE_SECONDS=2
export CONTINUE_ON_CONTEXT_ERROR=true
export FAIL_ON_MISSING_NATIVE_TYPES=false
export REUSE_LEGACY_QATM=true
export RENAME_LEGACY_QATM_TO_QAIRA=true
```

## Run artifacts

Each execution writes:

```text
.qaira-setup-state/runs/<RUN_ID>/api-trace.jsonl
.qaira-setup-state/runs/<RUN_ID>/created-resources.jsonl
.qaira-setup-state/runs/<RUN_ID>/skipped-resources.jsonl
.qaira-setup-state/runs/<RUN_ID>/project-native-types.json
.qaira-setup-state/runs/<RUN_ID>/failure-summary.md
.qaira-setup-state/runs/<RUN_ID>/success-state.json
.qaira-setup-state/runs/<RUN_ID>/project-properties.json
```

Run directories are created with mode `0700` under `umask 077`. API traces can still contain Jira configuration or user metadata and must follow an approved retention policy.

The setup creates only the base envelope for each collection. Runtime CRUD stores each collection item in its own `<base-key>.item.<encoded-id>` project property and retains the base key as compact metadata. This avoids a single growing JSON array and preserves legacy base-envelope items during adoption. Large or binary values must still use Jira attachments.

See `docs/SETUP.md` for first-install versus upgrade commands, existing-site property-model adoption, validation and rollback guidance.
