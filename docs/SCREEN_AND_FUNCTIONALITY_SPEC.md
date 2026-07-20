# Qaira screen and functionality map

This document describes the current Forge Custom UI. It is a capability map, not a promise that Forge runs browsers, invokes an external LLM, or synchronizes an external ALM.

## Workspace shell

Qaira runs inside Jira through a shared global/project Custom UI application. The shell supplies project and application-type scope, feature/permission-aware navigation, localization, light/dark themes, notifications, responsive sidebar behavior, route continuity, lazy page loading, and an application error boundary.

The main navigation areas are:

- Home and Projects
- Library: Requirements, Cases, Shared Steps, Suites
- Automation and Object Repository
- Agentic Workflows
- Runs
- Bugs
- TestOps: Jobs, Telemetry, Traces
- Environments: Environments, Test Data, Configurations
- Knowledge Repository
- Admin Space, Notifications, and Support

## Current user-facing workspaces

### Quality overview

- Jira-native counts and rollups for requirements, cases, suites, runs, automation, and defects
- Coverage, automation, locator, defect, and release-confidence summaries
- Recent records and advisory next actions

These are calculated from accessible Jira data. They are not a substitute for an approved release decision or a cross-project analytics warehouse.

### Requirements

- List and scoped JQL over configured Jira requirement issue types
- Create/read/update/delete and import
- Jira Software Sprint grouping, creation, lifecycle dates/status, and story assignment; `qaira.data.requirement-iterations.v1` shards remain only as a compatibility mirror
- Requirement/test/defect traceability through Jira links
- Quality/coverage suggestions and test-candidate preview/accept workflows

### Test Cases

- Jira issue CRUD and module assignment
- Manual web/API/mobile step authoring inside `qaira.testCaseSpec.v1`
- Reusable step groups
- Review history and generated-draft accept/reject
- Import/export compatibility workflows
- Authoring and step-rephrase previews
- Automation metadata and Object Repository linkage

### Suites

- Jira issue CRUD for static/dynamic/smart suite metadata
- Case membership stored in `qaira.suiteDefinition.v1` and reflected through validated Jira links
- Browse/detail authoring and case selection

### Runs

- Jira Test Run creation and scoped listing
- Manual, external, imported, and hybrid run metadata
- Suite/case snapshots and per-result Jira issue-property shards
- Start, complete, rerun, assignment, and result operations
- Jira attachment evidence with lazy preview and compact property pointers
- Schedules as project-property metadata
- Smart-scope and failure-analysis assistance
- Explainable failed/blocked result clustering with evidence references and an explicit unclassified group

Forge does not execute the selected browser, device, or API test. External CI/runners perform execution and post results/evidence.

### Automation and Object Repository

- Jira Automation Asset API for durable test-to-code mappings
- Object Repository Item issue CRUD
- Import/export and deterministic DOM attribute extraction
- Semantic locator recommendations and stability metadata
- Separate locator suggestion and human-confirmed apply actions
- Automation build/recorder hand-off metadata

“Recommendation” does not mean a locator was observed healing a failed test. A production self-healing claim requires validated external-runner evidence, approval, history, and rollback.

### Environment and test data

- Environment and configuration metadata in sharded project properties
- Key/value and table-shaped Test Data Set CRUD in project-property shards
- Synthetic data utilities in the browser
- XLSX/CSV import; legacy binary `.xls` is rejected

Do not store passwords, tokens, production credentials, or sensitive production data in these properties.

### Issues and traceability

- Jira Bug/configured defect CRUD with compact Qaira detail property
- Links to requirements, tests, and runs
- Requirement → Test → Run → Defect → Release exploration using Jira fields and Qaira links

### Agentic, knowledge, and operations

- Project-scoped workflow definitions and bounded run records
- AI prompt template and knowledge metadata collections
- Workspace transaction summaries, telemetry compatibility views, notifications, roles, membership, flags, preferences, and setup health

Workflow “runs” are bounded Jira-native records; they are not a durable agent worker runtime.

## Jira-native API capabilities without a dedicated main page

The resolver also provides project-scoped CRUD for:

- `Qaira Test Plan` at `/test-plans` with `qaira.planScope.v1`;
- `Qaira Automation Asset` at `/automation-assets` with `qaira.automationAsset.v1`;
- `Qaira Quality Gate` at `/quality-gates` with `qaira.qualityGate.v1`.

These APIs and Jira issues are durable even when the main navigation exposes the related workflow through Runs, Automation, or overview/reporting rather than a separate page.

## AI and Rovo behavior

Current assistance includes requirement review, test candidates, authoring completion, smart run scope, execution triage, automation metadata, locator recommendations, release-risk summaries, portfolio quality insights, change-impact previews, quality-gate assessment, prompt/knowledge context, and bounded Rovo actions.

The explainable preview surface is `GET /ai/quality-insights`, `POST /requirements/:id/ai-impact-preview`, `POST /test-cases/:id/ai-impact-preview`, `POST /executions/:id/ai-failure-clusters`, and `POST /quality-gates/:id/ai-assessment`. Responses are deterministic, carry input/evidence provenance and confidence, and do not mutate the assessed source record. The current resolver does not call a third-party LLM directly.

A release query on quality insights filters the underlying requirement/run portfolio and its related test, suite, defect, and object evidence. A quality gate uses its Jira-linked Test Plan scope first, then release, then project; the response identifies which scope was assessed.

Locator `POST .../ai-improve` also remains a preview. Only `PUT .../ai-improve/apply` with explicit confirmation changes the Jira Object Repository issue. Preview/accept is the default pattern and critical changes remain subject to explicit human action and the same permission/feature checks as manual operations.

The manifest exposes one Qaira Rovo agent with actions to read QA context, draft test candidates, calculate release risk, draft automation metadata, suggest locators, and summarize report data. These actions must not silently approve or overwrite Jira artifacts.

## Shared UX rules

- Requirement, case, step, suite, and run detail views use the neutral Jira-aligned workspace surface.
- Browse/detail state uses `WorkspaceMasterDetail` rather than an unrelated page shell.
- Dialogs have one semantic title, a bounded iframe-aware size, one scrolling body, visible actions, initial focus, and focus restoration.
- Delete and other irreversible operations use shared confirmation behavior.
- Loading, empty, feature-disabled, permission-denied, resolver-error, and success states are visually distinct.
- Large lists use bounded queries, filtering, paging, or virtualization; attachments are not loaded until opened.
- Jira searches embed the issue property required by each mapper, request-local reads are deduplicated, and remaining property shards are fetched in bounded batches to prevent N+1 request growth.

## Storage summary

No external database and no Forge database are used for Qaira business data. Jira issues own durable test artifacts; custom fields own searchable rollups; issue links own traceability; compact issue/project properties own structured details; attachments own binary/large content; `qaira.registry.v1` owns the per-project schema mapping.

Jira links are authoritative when a compact relationship projection differs. Admin reconciliation is deliberately not a general screen workflow: an operations user runs a bounded `GET /admin/reconcile` dry run and a Jira administrator with `ops.manage` may apply small explicitly confirmed property-repair batches.

See `docs/CRUD_PERMISSIONS_AND_FLAGS.md` for route behavior, `docs/DATA_MAPPING.md` for SQL compatibility, and `context.md` for change invariants.
