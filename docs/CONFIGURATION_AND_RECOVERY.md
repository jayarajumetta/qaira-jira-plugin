# Qaira configuration and recovery

## Project map

`admin/qaira-project-map.json` is the source of truth for mapping Jira-native requirement and defect issue types into Qaira sections.

Qaira creates its own durable QA issue types and actively reuses Jira-native objects for requirements, defects, and releases. Sprint/component fields can remain part of Jira issue context, but project-map settings for those concepts are descriptive until a corresponding runtime adapter is implemented.

Default model:

```text
Requirements section -> Jira Story
Defects section      -> Jira Bug
Releases             -> Jira fixVersions
Sprint/component context -> Jira native fields where present; not a project-map-controlled runtime adapter
```

Override per project:

```json
{
  "projects": {
    "PAY": {
      "requirementIssueTypeNames": ["Story", "Feature"],
      "defectIssueTypeNames": ["Bug"],
      "releaseSource": "fixVersions",
      "requirementRollupFieldsOn": ["Story", "Feature"],
      "defectRollupFieldsOn": []
    }
  }
}
```

## Failure handling

`admin/setup-qaira-jira.sh` is designed for targeted reruns and writes protected run traces under `.qaira-setup-state/runs/<RUN_ID>`. Jira configuration APIs are not transactional, so a Jira configuration backup and review of the created/skipped inventories remain required.

It handles:

- authentication validation
- project visibility diagnostics
- per-project Story/Bug issue type discovery
- no hardcoded native Jira issue type IDs
- curl/API retries for 429/5xx/transient failures
- JSONL API traces
- failure summary generation
- created/skipped resource logs
- safe rerun recovery
- legacy QATM resource reuse/rename for earlier partial installs
- exact coverage validation for all 46 tables in the restored canonical `schema.sql`
- non-destructive creation of missing `qaira.data.*.v1` property envelopes
- registry and initial property value byte-size checks

`STRICT_FIELD_CONTEXTS` is deprecated and ignored. The setup does not delete existing field contexts.

## Common recovery cases

### Context creation fails with missing issue type IDs

Cause: stale hardcoded Story/Bug IDs or wrong project map.

Recovery:

1. Check `.qaira-setup-state/runs/<RUN_ID>/project-native-types.json`.
2. Update `admin/qaira-project-map.json`.
3. Rerun setup.

### Prior QATM partial install exists

The script defaults to:

```bash
REUSE_LEGACY_QATM=true
RENAME_LEGACY_QATM_TO_QAIRA=true
```

It will reuse older QATM-created issue types/fields/link types and attempt to rename them to Qaira. If your enterprise wants no automatic rename, set:

```bash
export RENAME_LEGACY_QATM_TO_QAIRA=false
```

### A screen/scheme step fails

The run can still leave usable Qaira issue types/fields. Fix the permission/API issue and rerun. Screen/scheme setup is also name/idempotency based.

### Relationship property projection differs from Jira links

Jira issue links are authoritative. Do not manually rewrite links to match a stale Qaira property. Run `GET /admin/reconcile` with `ops.view` and `qaira.ops.admin`, review drift/truncation, then have a Jira administrator with `ops.manage` apply conservative confirmed `POST` batches. The repair copies current link relationships into compact issue-property projections and never changes the links. Repeat the dry run between batches until no drift remains.

Use `docs/SETUP.md` for the supported targeted recovery command, existing-site adoption mode, and rollback cautions. Never run `schema.sql` as a recovery step.
