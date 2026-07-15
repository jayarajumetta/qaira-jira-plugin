# Enterprise Architecture

## Source of record

Jira Cloud is the only persistent source of record.

The restored root `schema.sql` is the canonical reference domain model, not a deployed database. `schema/qaira-property-model.json` is the validated compatibility contract for all 46 unique tables and their Jira-native representation.

| Data | Storage |
|---|---|
| Test Case, Suite, Plan, Run, Automation Asset, Object Repository Item, Quality Gate | Jira issues |
| Compact project collections, including environments, configurations and Test Data Sets | Sharded Jira project properties |
| Reportable/searchable rollups | Jira custom fields |
| Relationships | Jira issue links |
| Compact structured details and per-result shards | Jira issue properties |
| Large run artifacts, evidence, generated code drafts | Jira attachments |
| Jira operations and compact Qaira transaction summaries | Jira audit history and project properties |
| Configuration registry | Jira project property `qaira.registry.v1` |

## Qaira issue types

1. Qaira Test Case
2. Qaira Test Suite
3. Qaira Test Plan
4. Qaira Test Run
5. Qaira Automation Asset
6. Qaira Object Repository Item
7. Qaira Test Data Set
8. Qaira Quality Gate

The setup provisions all eight issue types so projects have a stable enterprise schema. Current Test Data Set CRUD remains a sharded project collection (`qaira.data.test-data-sets.v1`); the issue type is reserved for a future promoted/durable data-set workflow. `schema/qaira-property-model.json` is authoritative when an issue-type catalog and the active runtime mapping differ.

## Non-negotiables

- Do not create Qaira Test Step issues.
- Do not create Qaira Test Result Row issues.
- Custom fields are for rollups and JQL, not giant JSON.
- Result summaries are sharded issue properties; large result archives and binary evidence are Jira attachments.
- UI lazy-loads attachment/property details.
- AI drafts and recommends; human approval is required for critical changes.
- Jira issue links are authoritative for relationships; compact issue-property relationship fields are projections.

Current explainable portfolio quality experiences use deterministic Jira-native heuristics. Portfolio insights, requirement/test change impact, failure clusters, and quality-gate assessments return provenance, evidence references, confidence, limitations, and a human-review requirement without changing the assessed source record. Locator improvement is a previewing `POST`; only an explicitly confirmed apply `PUT` mutates the Object Repository issue. Agentic LLM/Web-evidence/API nodes and AI bug drafting use Atlassian Forge LLM with project-scoped bounded context, redaction, prompt-injection isolation, model/usage traces, deterministic fallback where applicable, and mandatory human review; the repository stores no provider model key.

Release quality insights filter the assessed records by requirement fix version and Test Run release before deriving related tests, suites, defects, and objects. Quality-gate assessment follows the gate's Jira link to a Test Plan and uses that plan's linked scope; only an unlinked gate falls back to release and then project scope.

Jira entity-property values are limited to 32,768 bytes and use last-write-wins concurrency. Collection properties must remain compact; large/binary payloads belong in attachments, and durable worker queues belong in an approved external execution service. See `docs/DATA_MAPPING.md`.

## Jira interaction and external connectors

Qaira issue-backed artifacts are the Jira issues themselves, so Qaira and the standard Jira issue experience operate on one source of truth. This is not an external replication layer. The current integration catalog, ALM compatibility routes, and runner hand-off do not implement a general bidirectional sync protocol.

Any future external connector must declare field ownership, stable remote identity, cursor/webhook behavior, idempotency, conflict and deletion policy, loop prevention, retry/dead-letter handling, observability, and operator reconciliation before it may be considered production synchronization.

`GET /admin/reconcile` is a bounded dry-run audit of Jira-link/property-projection drift. Confirmed `POST` applies a bounded links-to-properties repair and requires `ops.manage` plus Jira administration; it does not rewrite links. Production operations use reviewed small batches and repeat dry runs until drift is cleared without truncation.

## Read projection and performance

Qaira does not maintain a separate read database. Jira search returns the fields and structured property needed to project each issue-backed artifact, preventing an extra property read per search hit. Remaining project-property and result shards are fetched in bounded batches. One resolver invocation owns an isolated cache for repeated/in-flight user, project, permission, registry, and property reads; writes update or invalidate that cache. The cache never crosses requests, users, or tenants and never weakens Jira authorization freshness beyond the active invocation.

## Company-managed vs team-managed

Company-managed projects support full automated setup: issue type scheme, screens, screen scheme, issue type screen scheme assignment, field contexts and registry.

Team-managed projects use lightweight mode: setup validates availability and writes registry, while Jira project admins may need to add issue types/fields manually.
