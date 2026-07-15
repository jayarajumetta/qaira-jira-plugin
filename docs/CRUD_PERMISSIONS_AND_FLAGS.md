# Jira-native CRUD, permissions, feature flags, and attachments

## Request and storage boundary

The Custom UI calls the single Forge resolver through `invoke("qairaApi")`. For each protected request the backend resolves the Jira project, resolves the active Atlassian account, evaluates the Qaira role permission, verifies Jira access, checks the registered feature flag, and only then dispatches the operation.

Qaira has no PostgreSQL runtime. The restored `schema.sql` remains the canonical relational reference; `schema/qaira-property-model.json` records the Jira representation for all 46 unique SQL tables. Test Plan, Automation Asset, and Quality Gate are deliberate Jira enterprise extensions in `schema/qaira-schema.json` and are not direct `schema.sql` tables.

## CRUD matrix

| Domain | API family | Jira source of record | CRUD behavior |
|---|---|---|---|
| Jira projects | `/projects` | Jira project | List/create/update/delete through Jira REST; Qaira and Jira administration checks apply |
| Requirements | `/requirements` | Configured Jira requirement issue + `qaira.requirement.v1` | List, create, item read/update/delete, import, and human-reviewed design actions |
| Defects/feedback | `/feedback` | Configured Jira defect issue + `qaira.defect.v1` | List, create, item read/update/delete |
| Test cases | `/test-cases` | `Qaira Test Case` + `qaira.testCaseSpec.v1` | Full issue CRUD; steps/specification live in the issue property |
| Test suites | `/test-suites` | `Qaira Test Suite` + `qaira.suiteDefinition.v1` | Full issue CRUD; membership is reflected in the property and Jira links |
| Test plans | `/test-plans` | `Qaira Test Plan` + `qaira.planScope.v1` | Full scoped issue CRUD |
| Test runs | `/executions` | `Qaira Test Run` + `qaira.runExecution.v1` | Full issue CRUD plus start, complete, rerun, assignment, report, and result operations |
| Execution results | `/execution-results` | `qaira.runResult.v1.<encoded-id>` on the Test Run | List/create/update/delete independent revisioned result shards |
| Automation assets | `/automation-assets` | `Qaira Automation Asset` + `qaira.automationAsset.v1` | Full scoped issue CRUD |
| Object repository | `/object-repository-items` and compatibility learning-cache routes | `Qaira Object Repository Item` + `qaira.objectRepositoryItem.v1` | Full scoped issue CRUD; compatibility aliases use the same Jira records |
| Quality gates | `/quality-gates` | `Qaira Quality Gate` + `qaira.qualityGate.v1` | Full scoped issue CRUD |
| Test data sets | `/test-data-sets` | `qaira.data.test-data-sets.v1` project-property shards | Full collection CRUD; this follows the active SQL mapping rather than creating an issue per row |
| App types and compact workspace data | `/app-types`, iterations, modules, shared steps, environments, configurations, schedules, workflows, knowledge, prompts, integrations, notifications, transactions | `qaira.data.<collection>.v1` base metadata + one `.item.<encoded-id>` property per record | Filtered list, create, item read/update/delete as supported by each family |
| Roles and memberships | `/roles`, `/permissions`, `/project-members` | Revisioned project-property shards | Role/membership CRUD with system-role and in-use-role protections |
| Workspace settings and flags | `/settings/*`, `/feature-flags` | `qaira.data.workspace-preferences.v1` and `qaira.data.feature-flags.v1` | Settings remain app-managed; feature flags are read-only in the app and deployment-managed by the dedicated setup script |
| Relationship projection repair | `/admin/reconcile` | Jira links are authoritative; issue properties are the compact projection | `GET` dry-runs bounded drift detection; confirmed `POST` repairs a bounded property batch only |
| Explainable quality assistance | `/ai/quality-insights` and artifact-scoped AI preview routes | Current Jira fields, links, properties, results, and attachment references | Deterministic evidence-backed preview only; no assessed source record is mutated |
| Traceability | relationship endpoints | Configured Jira issue links | Replace operations validate every target and apply a link diff |
| Evidence and archives | Jira attachment REST API | Attachment on the owning Jira issue | Upload/read/delete the binary in Jira; properties retain only compact pointers |

All item operations are project scoped. An issue-backed request rejects an issue from another project or an unexpected Jira issue type. Caller-supplied JQL is constrained to the selected project and configured type set.

## Jira interaction is not an external sync engine

For issue-backed artifacts, Qaira and Jira edit the same record. Qaira projects the current workspace view from Jira fields, embedded issue properties, issue links, and attachment metadata, then persists changes to Jira. Mapped Jira field changes are visible in Qaira after the next fetch. Jira issue links are authoritative for relationships. Normal Qaira relationship writes validate the full target set, reconcile the Jira link diff immediately, and update the property projection. Issue and project properties are also Jira-owned, although their structured contents are primarily maintained by Qaira.

This is two-way interaction with one Jira source of truth; it is not a conflict-resolved synchronization service for another ALM, repository, or execution engine. The integration catalog and ALM compatibility routes do not establish a durable remote sync. A future connector needs explicit field ownership, stable remote IDs, idempotency keys, cursors/webhooks, loop prevention, conflict resolution, tombstones, retry/dead-letter handling, and operator reconciliation before it can be called bidirectional sync.

### Reconciliation contract

`GET /admin/reconcile?project_id=<id>&limit=<1..100>` is always a dry run. It scans up to the limit for each supported issue type, compares relationship fields in Qaira issue properties with current Jira links, and reports drift, truncation, and the proposed fields. It requires `ops.view` and `qaira.ops.admin`.

`POST /admin/reconcile` requires `ops.manage`, Jira project/global administration, `qaira.ops.admin`, and a JSON body containing `confirmed: true`. `max_changes` is optional, defaults to 25, and is capped at 50; `limit` controls the per-issue-type scan and is capped at 100. The apply direction is only Jira links → Qaira property projection. The operation increments the property revision and records `projection_source`/sync time; it does not add or delete Jira links.

In production, first save/review a dry-run response. Apply a conservative batch, inspect `applied`, `errors`, `remaining_count`, and `possibly_truncated`, then dry-run again. Repeat bounded batches until no drift remains and the scan is not truncated. Never treat reconciliation as an unbounded migration or external sync job.

## Issue-backed transaction rules

- Create writes the Jira issue first and then its compact structured property. If property/link creation fails, Qaira attempts to delete the partially created issue.
- Update validates the owning project and configured issue type before changing fields or properties.
- Relationship replacement validates all targets before deleting obsolete links, then adds only missing links.
- Delete uses Jira issue deletion, so Jira permissions, audit behavior, and retention policy remain authoritative.
- The safe property payload limit is 30,000 bytes, below Jira's 32,768-byte entity-property limit. Oversized structured data returns `PROPERTY_TOO_LARGE` and must move to an attachment.

## Project-property collection rules

The base key is metadata and legacy compatibility:

```text
qaira.data.<collection>.v1
```

Each current record is isolated:

```text
qaira.data.<collection>.v1.item.<base64url-item-id>
```

Reads merge built-in defaults, preserved legacy base-envelope items, and item shards. Creates/updates increment the item revision. Deletes remove the shard and any matching legacy item. This limits write contention and prevents one array from consuming the entire Jira entity-property allowance.

Application types are restricted to `web`, `api`, `android`, `ios`, and `unified`. Built-in application types cannot be deleted, and an in-use custom type cannot be deleted while Test Cases, Suites, or Runs reference it.

## Read performance and cache consistency

- Each resolver invocation owns an isolated request cache. Repeated project, user, permission, registry, and property reads reuse the same value or in-flight promise only within that invocation.
- Property writes update the corresponding request-cache entry and invalidate cached property-key lists. The cache is never shared between users or requests and never replaces Jira as the source of truth.
- Jira search requests ask for the structured property required by each issue type. Mappers consume the embedded value, preventing one additional property request for every requirement, defect, case, suite, run, plan, automation asset, object, or quality gate returned.
- Project-property shards and run-result properties that cannot be embedded are loaded in bounded batches. Preserve this pattern when adding a growing collection; do not reintroduce sequential N+1 reads or an unbounded parallel burst.

## Permission model

Authorization is additive; passing one layer never bypasses the next:

1. The active Atlassian identity must be available.
2. The user must have Jira `BROWSE_PROJECTS` for the selected project.
3. The user's Qaira project role must contain the route/method permission from `src/qairaAccess.js`.
4. Administrative Qaira permissions also require Jira `ADMINISTER_PROJECTS` or global `ADMINISTER`.
5. Mutations require applicable Jira create/edit access in the central check, and the called Jira REST endpoint performs its more specific create, edit, delete, link, or attachment authorization.
6. A registered disabled feature returns `FEATURE_DISABLED` even when both permission systems allow the operation.

Default role behavior is fail-safe:

- Jira project/global administrators receive the system Jira Administrator role.
- Explicit project membership selects QA Lead, QA Member, Viewer, or a custom role.
- A non-admin without an explicit Qaira project membership receives Viewer access, not write access.
- Jira administrator memberships are system-managed visibility records: live Jira permission remains authoritative, Jira permission search discovers active global administrators for bounded synchronization across visible projects, and revoked global administrators return to their saved fallback role only after a complete discovery result.
- System roles cannot be deleted; custom roles in use cannot be deleted until memberships are reassigned.

The frontend hides or disables actions for usability, but backend enforcement is the security boundary. Project-property calls that require app context still occur only after the active user's project, role, Jira permission, and flag checks.

## Feature flag model

`GET /feature-flags` returns a project snapshot formed from the registered defaults plus valid stored booleans in `qaira.data.feature-flags.v1`. Feature Availability is intentionally absent from application Settings. Operators edit `admin/qaira-feature-flags.json` and run the executable `admin/setup-qaira-feature-flags.sh`; it validates the complete registered boolean catalog, dry-runs by default, preserves the property envelope, increments the revision, and writes only the feature-flag project property. Use `PROJECT_KEYS` to scope a rollout and require `CONFIRM_ALL_PROJECTS=true` before a non-dry-run update of every visible Jira project.

Backend route families and frontend navigation/actions use the same registered keys. Unknown frontend feature keys are unavailable by default. A flag is a rollout control, not an authorization grant.

Mobile/Appium is field-scoped rather than page-scoped. `mobile.view` controls mobile metadata visibility and `mobile.manage` controls mobile configuration, recorder, step, application-type, and integration payloads. Disabling `qaira.mobile.appium` leaves web/API environments and configurations available while removing mobile-specific controls; the resolver independently rejects mobile mutation payloads.

The current registered keys are grouped as follows:

```text
Manual
  qaira.manual.requirements
  qaira.manual.test_cases
  qaira.manual.suites
  qaira.manual.runs
  qaira.manual.bugs
  qaira.manual.plans
  qaira.manual.quality_gates
  qaira.manual.environments
  qaira.manual.test_data

Analytics
  qaira.analytics.dashboards

Automation
  qaira.automation.workspace
  qaira.automation.assets
  qaira.automation.builder
  qaira.automation.step_code
  qaira.automation.step_recording
  qaira.automation.local_execution
  qaira.automation.remote_execution
  qaira.automation.object_repository
  qaira.automation.batch_process
  qaira.mobile.appium

AI
  qaira.ai.requirement_design
  qaira.ai.test_authoring
  qaira.ai.automation
  qaira.ai.execution_analysis
  qaira.ai.quality_insights
  qaira.ai.agentic_workflows
  qaira.ai.knowledge
  qaira.ai.prompt_templates

Administration and operations
  qaira.ops.projects
  qaira.ops.admin
  qaira.ops.settings
  qaira.api.integrations
  qaira.ops.notifications
  qaira.ops.telemetry
```

## AI route contract

Requirement design, test authoring, step rephrasing, smart planning, execution analysis, automation drafting, locator recommendations, prompt templates, knowledge context, agentic-workflow records, and bounded Rovo actions are represented in the API. Durable AI-assisted artifact changes use preview/accept or another explicit user action.

`qaira.ai.quality_insights` covers explainable portfolio insights and quality-gate assessment. `quality_insight.view` protects the portfolio read and `quality_gate.ai` protects gate assessment. The gate route also remains subject to `qaira.manual.quality_gates`; feature requirements are cumulative. The artifact impact and clustering routes likewise retain their manual domain flag plus `requirement.ai`, `testcase.ai`, or `run.ai` and the associated AI feature.

| Method and route | Deterministic preview |
|---|---|
| `GET /ai/quality-insights` | Coverage gaps, orphan tests, automation candidates, failed-run/open-defect risk, and locator-stability signals from records visible to the current Jira user |
| `POST /requirements/:id/ai-impact-preview` | Linked cases, suites, runs, and automation assets affected by a proposed requirement change |
| `POST /test-cases/:id/ai-impact-preview` | Linked requirements, suites, runs, automation assets, object dependencies, and change risks |
| `POST /executions/:id/ai-failure-clusters` | Transparent keyword-based clusters over failed/blocked results, with unclassified rows preserved |
| `POST /quality-gates/:id/ai-assessment` | Current metrics evaluated check-by-check against the gate's configured/default thresholds |

These endpoints are read/assessment previews: they do not mutate the requirement, test, run, or quality gate. Responses carry deterministic generation mode, timestamp, request ID, input fingerprint, confidence, evidence references, fallback reason, and `requires_human_review`. Evidence explains why a rule matched; it does not prove root cause, test correctness, or release readiness.

Quality-insights scope is applied, not merely labeled. With `?release=<name>`, requirements are filtered by Jira fix version and runs by the Qaira release value; linked/in-scope tests, suites, defects linked through an in-scope run, requirement, or test, and test-linked objects form the assessment. Without a release it uses the visible project. Quality-gate assessment first follows the gate's Jira `Qaira Gates Release` link to a Test Plan and evaluates the plan's linked cases/suites and their related evidence. Without a linked plan it evaluates the requested/gate release, or the project when neither exists. Each response reports the selected scope.

Locator assistance has a separate proposal/apply contract:

1. `POST /test-cases/automation/learning-cache/:id/ai-improve` returns the current entry, suggestion, evidence/provenance, and `applied: false`.
2. A user reviews or edits the suggested locator and strategy.
3. `PUT /test-cases/automation/learning-cache/:id/ai-improve/apply` requires `confirmed: true`; only this call updates the Jira Object Repository issue and may record the originating request ID.

Portfolio, impact, failure-cluster, and quality-gate responses are deterministic Jira-native recommendations. Agentic workflow LLM/Web-evidence/API nodes and AI bug drafting use Atlassian Forge LLM and record their model/provenance; the repository stores no provider model secret. AI recommendations do not confirm an execution result, approve a test, create verified evidence, or accept a release risk on behalf of a user.

## Attachment lifecycle

Interactive evidence uses Jira attachments directly through Forge Bridge under the active Jira user:

1. Accept an image source up to the UI input limit.
2. Normalize/compress it before upload when needed.
3. Upload it to the selected Test Run Jira issue.
4. Persist only `attachmentId`, file name, MIME type, size, checksum, and timestamp inside the execution-result property.
5. Download lazily into a temporary browser object URL and revoke the URL when the preview closes.
6. On replacement, persist the new pointer before removing the old attachment.
7. On a failed pointer save, attempt to delete the new attachment.
8. On delete failure, restore the prior pointer where possible and report the recovery state.

The JUnit importer in `ci/import-junit-to-jira.sh` follows the same model: it creates a Test Run, uploads XML as an attachment, validates the Jira HTTP response, and writes counts plus attachment metadata to `qaira.runExecution.v1`. It never writes base64/binary content to a property.

Attachment bytes are governed by Jira attachment permissions and policy. Saving the Qaira evidence pointer is separately governed by `result.manage`. Administrators should monitor for orphan attachments after interrupted or partially authorized flows.

## Deliberate limitations

- Forge does not run Selenium, Playwright, Appium, browser grids, durable workers, schedulers, or lease queues. An approved external CI/runner performs execution and reports results to Jira.
- Qaira does not currently implement a general bidirectional external synchronization engine.
- Several AI endpoints are bounded deterministic assistance rather than live model calls.
- Qaira does not persist API tokens, passwords, repository secrets, or production test credentials in Jira properties.
- Standalone signup, password reset, reusable Qaira API keys, outbound mail, and fake integration success responses are not implemented.
- Entity properties are last-write-wins rather than relational transactions. Revisions provide diagnostics, not compare-and-swap locking.

Use `docs/SETUP.md` for installation and upgrade steps, `docs/DATA_MAPPING.md` for the SQL-table mapping contract, and `GET /admin/health` for a project-specific readiness report.
