# Qaira SQL-to-Jira data mapping

## Runtime source of record

The Forge app is Jira-native. It does not connect to PostgreSQL, execute `schema.sql`, or use Forge SQL/database storage for Qaira business records.

The restored `schema.sql` is retained as the canonical reference domain model. The machine-readable compatibility contract is:

```text
schema/qaira-property-model.json
```

The contract covers all 46 unique SQL tables and every `CREATE TABLE` occurrence in `schema.sql`, records the canonical Jira storage key, and distinguishes active, compatibility, planned, and unsupported behavior. `admin/validate-qaira-schema.sh` fails when a SQL table is added, removed, or duplicated without a matching contract update.

## Storage categories

| Contract value | Jira representation |
|---|---|
| `native` | Atlassian users, Jira projects, configured requirement issues, or configured defect issues |
| `issue` | Durable Qaira Jira issue type |
| `project-property` | Compact project-scoped JSON envelope under `qaira.data.*.v1` |
| `issue-property` | Compact structured detail owned by one Jira issue |
| `link` | Jira issue link using a configured Qaira link type |
| `attachment` | Large/binary artifact attached to a Jira issue |
| `unsupported` | Identity, scheduler, worker, queue, or runner state that Forge must not pretend to execute |

## Canonical durable records

| Domain | Storage |
|---|---|
| User and authentication | Atlassian account and session |
| Project | Jira project |
| Requirement | Configured Jira Story/custom requirement issue type |
| Defect | Configured Jira Bug/custom defect issue type |
| Test Case | `Qaira Test Case` issue + `qaira.testCaseSpec.v1`; up to 20 restorable content snapshots use `qaira.testCaseVersion.v1.<revision>` |
| Test Suite | `Qaira Test Suite` issue + `qaira.suiteDefinition.v1` |
| Test Run | `Qaira Test Run` issue + `qaira.runExecution.v1` metadata + `qaira.runResult.v1.<encoded-id>` result shards |
| Object Repository entry | `Qaira Object Repository Item` issue + `qaira.objectRepositoryItem.v1` |
| Requirement/test/defect/suite relationships | Qaira Jira issue links |
| App types, modules, environments, configurations, data sets, schedules, knowledge, integrations, workflows, notifications and transaction summaries | Separate `qaira.data.*.v1` project properties |
| Large evidence, result archives and generated files | Jira issue attachments |
| Worker capacity, heartbeat, leasing and durable batch queues | Unsupported in Forge; use an approved external runner/service |

The full table-by-table mapping is intentionally not duplicated in prose. Read `schema/qaira-property-model.json` so documentation and validation use the same source.

`Qaira Test Plan`, `Qaira Automation Asset`, and `Qaira Quality Gate` are additional Jira-native enterprise artifacts with full CRUD and their own issue properties. They do not correspond to direct tables in the supplied `schema.sql`, so they are defined by `schema/qaira-schema.json` rather than invented as SQL mappings. See `docs/CRUD_PERMISSIONS_AND_FLAGS.md`.

## Property envelopes and CRUD sharding

Every collection base property is an object, not a bare array:

```json
{
  "schema": "qaira.data.test-environments.v1",
  "version": "1.0.0",
  "items": [],
  "updatedAt": "2026-01-01T00:00:00Z"
}
```

The admin setup creates a base property only when Jira returns `404`. An existing value is preserved exactly, including an older or customer-managed envelope. Default app types and built-in Jira/Rovo integration metadata are seeded because an empty property would suppress runtime defaults.

Runtime collection CRUD stores one item per project property:

```text
qaira.data.<collection>.v1
qaira.data.<collection>.v1.item.<base64url-item-id>
```

Reads merge built-in defaults, any legacy `items` in the base envelope, and item shards; the shard wins for the same ID. Creates and updates write a revisioned shard. Deletes remove the shard and remove a matching legacy item when present. The base property remains compact storage metadata. Run-result CRUD uses the same idea on the owning Test Run issue with `qaira.runResult.v1.<encoded-id>` keys. This avoids lost updates to one shared array and keeps each value independently below the Jira property limit.

Issue searches request the structured property for the returned issue type so the mapper can consume the embedded value instead of issuing one property request per result. Project-property shards and run-result properties are read in bounded parallel batches. A request-scoped cache deduplicates repeated Jira identity, project, permission, registry, and property reads during one resolver invocation and is updated/invalidated by writes; it is not shared across requests or tenants.

For relationship data, Jira issue links are authoritative and issue-property IDs are a compact projection. Normal CRUD writes both. `GET /admin/reconcile` detects drift without mutation; a confirmed bounded `POST` repairs property projections from current links and never rewrites the links.

## Jira property limits and security

Jira entity-property keys are limited to 255 bytes and values to 32,768 bytes. Properties are last-write-wins, have no compare-and-swap support, and are editable by users/apps that can edit the owning entity. Therefore:

- never store passwords, access tokens, API keys, personal secrets, or production test credentials in a property;
- keep each property value compact and project scoped;
- move large evidence and generated artifacts to Jira attachments;
- preserve the per-item shard model for growing collections and run results;
- treat Jira permissions as authoritative and perform explicit permission checks for restricted operations;
- do not use a project property as a durable worker queue or lock.

The setup script measures every initial value and the final `qaira.registry.v1` payload before writing. It also removes bulky issue-type discovery data from the registry.

## PostgreSQL rule

Do not run `schema.sql` as part of Forge deployment or Jira setup. It is not an idempotent migration set and the current package has no PostgreSQL runtime.

If a future enterprise edition needs PostgreSQL, introduce it as a separately versioned remote service with tenant/site isolation, encrypted secret references, numbered migrations, backup/restore, data residency controls, and an explicit Forge Remote contract. That is a new architecture and must not be enabled by adding a connection string to this resolver.

## Change procedure

When the domain model changes:

1. Update `schema.sql` only as the reference model.
2. Add or update the corresponding entry in `schema/qaira-property-model.json`.
3. Keep `schema/qaira-schema.json` and `src/qairaSchema.js` identical.
4. Keep issue-property keys consistent with the constants in `src/qairaApi.js`.
5. Run `npm run verify`.
6. Test a targeted Jira setup dry run before applying configuration changes.
