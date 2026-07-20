# Qaira for Jira: durable engineering and product context

This file is the handoff contract for engineers and LLM agents changing this repository. Read it before editing code. It describes the implemented Forge architecture, the product boundaries that must remain true, and the checks required before claiming a change is complete.

## Product intent

Qaira is a Jira Cloud test-management workspace for requirements, test design, reusable steps, suites, plans, runs, evidence, defects, automation metadata, test environments, quality gates, and release-risk analysis. Its differentiator is a guided Jira-native workflow with bounded AI assistance, not a second database or an autonomous test runner.

The product principles are:

- Jira remains the source of truth and the durable audit surface.
- A tester should be able to move from requirement to designed test, execution evidence, defect, and release impact without copying identifiers between tools.
- AI proposes, explains, and prioritizes. A human selects and approves any durable artifact change.
- The core manual test-management workflow must remain useful when AI is disabled or unavailable.
- Enterprise safety is expressed through project scoping, Jira authorization, Qaira RBAC, feature controls, explicit failure responses, and recoverable writes.
- “Enterprise-ready” is a release gate, not a marketing assertion. Tenant-specific Forge lint/deploy, role testing, Jira configuration review, data-retention review, and operational validation are still required before production promotion.

The July 2026 architecture increment added two ranked capabilities after official Zephyr, Xray, TestRail, and Forge research: bounded Jira-native test-case versions with compare/restore, and explainable scope-matched smart-run prioritization. The evidence, scoring, rejected alternatives, and next priorities are recorded in `docs/PRODUCT_RESEARCH_AND_ROADMAP.md`.

The subsequent evidence and analytics increment added one shared Jira attachment panel to Requirement, Bug, Test Case, and Test Run details; canonical Jira Sprint/Fix Version/Labels/workflow mappings; default and custom project-scoped quality dashboards; bounded JQL aggregation; and a central transient retry policy. Read `docs/JIRA_NATIVE_EVIDENCE_AND_ANALYTICS.md` before changing those contracts.

The 20 July Sprint increment replaced the visible Requirement Iteration concept with Jira-native Sprints. Sprint creation now writes to Jira Software with board, start/end dates, lifecycle state, goal, and story assignment; requirement authoring exposes one Sprint field; and the hierarchy strip shows Jira status, `MM/DD` dates, board/goal, Done, Coverage, Run pass, and At risk. The `requirement-iterations` collection remains an API/storage compatibility mirror, not the delivery source of truth. The 15 July dashboard and hierarchy maturity increment added derived hierarchy signals; Executive, Product, Quality Engineering, and Automation dashboard templates; six gadget visualizations; twelve metric functions; fifteen grouping dimensions; batch JQL evaluation with partial-failure isolation; assisted preview-only dashboard design; selected-only section-tab indicators; collapsed-sidebar submenu expansion; and Jira-owned user administration. Dashboard Create/Edit lives in a focus-contained modal, Delete is explicit and confirmed, the AI designer exists only inside Create, and the saved dashboard owns the analysis canvas. Do not reintroduce per-gadget frontend queries, an always-visible editor, or standalone Qaira user mutation flows.

The same increment made Qaira project roles a mandatory membership contract. Jira project/global administration remains derived from live permissions, while a system-managed `jira-admin` membership is persisted for project visibility and never used without the live Jira check. A verified global administrator uses Jira's permission search to discover the active global-admin set, which is synchronized asynchronously across visible projects and provisioned immediately on new projects; project administrators are reconciled on project access. Atlassian permission search considers only the first 1,000 directory users. Qaira detects a larger or unverifiable directory as partial, never revokes from a partial result, and includes any live-verified current administrator in their own all-project sync. If discovery is unavailable, it safely falls back to that current administrator. Non-admin project creators receive QA lead, and every additional selected Jira user has an explicit role.

The 15 July agentic/API/evidence increment added safe schema-discovered table columns and Jira-backed authoring properties; Forge Async Events + Forge LLM workflow execution; validated DAGs and named hand-offs; project RAG, redaction, retry/timeout/budget guardrails, and trace provenance; mature API request/auth/assertion/capture contracts; lazy test-step retrieval; multi-format Jira execution evidence; step-level bug links; and feature-gated AI bug drafting with deterministic fallback and mandatory normal-form review. These capabilities use Atlassian-hosted Forge LLM models, not stored provider keys.

## Repository map

| Path | Responsibility |
|---|---|
| `manifest.yml` | Forge modules, hosted resources, Rovo actions, entity-property indexes, runtime, and scopes |
| `src/index.js` | Forge resolver boundary and bounded Rovo action entry point |
| `src/qairaApi.js` | REST-shaped compatibility API, Jira REST/storage operations, validation, and route dispatch |
| `src/agenticWorkflowRuntime.js` | Pure DAG planning, bounded RAG ranking, redaction, hand-off, and runtime-limit rules |
| `src/qairaAccess.js` | Permission catalog, default roles, route policies, and feature registry |
| `src/testCaseVersions.js` | Pure snapshot/key/restore-content rules for bounded test-case versioning |
| `src/smartRunPrioritization.js` | Pure explainable scoring for requirement/release/context-matched smart runs |
| `src/qualityAnalytics.js` | Pure project-scoped JQL, dashboard templates, normalization, metrics, trends, and gadget aggregation rules |
| `static/qaira-ui/src/lib/hierarchyHealth.ts` | Pure requirement-Sprint and test-module health derivation; no data fetching or UI state |
| `static/qaira-ui/src/components/HierarchyMetricStrip.tsx` | Shared one-line hierarchy decision-signal renderer |
| `src/resilience.js` | Pure Jira retry classification and bounded delay policy |
| `src/qairaSchema.js` | Runtime copy of the Jira issue/field/link schema |
| `schema/qaira-schema.json` | Admin/schema source that must remain identical to `src/qairaSchema.js` |
| `schema/qaira-property-model.json` | Machine-readable `schema.sql` to Jira storage contract |
| `schema.sql` | Restored canonical relational reference model only; never a Forge migration |
| `static/qaira-ui/` | React/TypeScript Forge Custom UI |
| `admin/` | Jira configuration, diagnosis, project mapping, and schema validation |
| `ci/import-junit-to-jira.sh` | Optional Jira-native JUnit/Test Run import path |
| `docs/` | Setup, runtime behavior, architecture, and operational references |

The current implementation deliberately keeps a single frontend compatibility resolver because the supplied UI already uses a broad REST-shaped API. New work should preserve that public contract while extracting cohesive internal services when doing so reduces coupling; do not add another parallel resolver or persistence path casually.

## Forge and Jira architecture

The main request flow is:

```text
React page or hook
  -> static/qaira-ui/src/lib/api.ts
  -> Forge Bridge invoke("qairaApi")
  -> src/index.js
  -> authorization + feature checks in src/qairaApi.js/src/qairaAccess.js
  -> Jira REST as the active user, or a narrowly used app-context property call
  -> Jira issue, property, link, field, fixVersion, user, project, or attachment
```

The Forge surfaces are a Jira global page, project page, issue panel, issue action, and a Rovo agent with bounded actions. The main and project pages host the same Custom UI application. `HashRouter` is required because the UI is hosted in a Forge iframe.

Most Jira operations use the current Atlassian user context. Project-property calls that need app context are performed only after the active user, project, Qaira permission, Jira permission, and feature checks have succeeded. Never use app context as a shortcut around user authorization.

## Jira-native persistence model

Qaira business data does not use PostgreSQL, Forge SQL, Forge Storage, or an external application database. The restored `schema.sql` is the canonical reference vocabulary; `schema/qaira-property-model.json` declares the Jira representation for all 46 unique SQL tables and is checked by `admin/validate-qaira-schema.sh`.

### Durable Jira artifacts

| Domain | Jira representation |
|---|---|
| Project | Jira project |
| Requirement | Configured native requirement type, normally Story, plus `qaira.requirement.v1` |
| Defect/feedback | Configured native defect type, normally Bug, plus `qaira.defect.v1` |
| Test Case | `Qaira Test Case` issue plus `qaira.testCaseSpec.v1`; retained versions use `qaira.testCaseVersion.v1.<revision>` |
| Test Suite | `Qaira Test Suite` issue plus `qaira.suiteDefinition.v1` |
| Test Plan | `Qaira Test Plan` issue plus `qaira.planScope.v1` |
| Test Run | `Qaira Test Run` issue plus `qaira.runExecution.v1` |
| Automation Asset | `Qaira Automation Asset` issue plus `qaira.automationAsset.v1` |
| Object Repository Item | `Qaira Object Repository Item` issue plus `qaira.objectRepositoryItem.v1` |
| Quality Gate | `Qaira Quality Gate` issue plus `qaira.qualityGate.v1` |
| Test Data Set | Sharded `qaira.data.test-data-sets.v1` project properties in the active runtime |
| Requirement/test/suite/defect traceability | Configured Qaira Jira issue links |
| Searchable status/risk/coverage rollups | Standard Jira custom fields |
| Binary evidence and large archives | Jira issue attachments |
| Project configuration | `qaira.registry.v1` project property |

The setup also provisions a `Qaira Test Data Set` issue type for schema stability, but active Test Data Set CRUD follows the SQL mapping and uses project-property shards. Do not silently switch that source of truth without a migration and compatibility plan.

### Compact project collections

Application types, iterations, modules, shared steps, environments, configurations, data sets, schedules, workflows, prompt templates, knowledge metadata, integrations, notifications, transactions, roles, memberships, permissions, and feature/preferences metadata use project properties.

The base property is compact metadata and legacy compatibility:

```text
qaira.data.<collection>.v1
```

Each mutable item uses an independent shard:

```text
qaira.data.<collection>.v1.item.<base64url-item-id>
```

Reads merge built-in defaults, any preserved legacy `items`, and item shards. The item shard wins for a duplicate ID. Do not return to one growing JSON array: it increases last-write-wins collisions and will eventually exceed Jira's property limit.

Run results use the same pattern on their Test Run issue:

```text
qaira.runResult.v1.<base64url-result-id>
```

Issue properties hold compact structured state only. The application enforces a 30,000-byte safety limit below Jira's 32,768-byte entity-property value limit. Move large content to an attachment and retain only an ID, checksum, content type, size, and lifecycle metadata in a property.

### Link and attachment rules

Relationship replacement validates every target, computes a diff, removes obsolete links, and adds missing links. It must never delete all links before target validation. Every linked issue must belong to the authorized project and expected type set.

Evidence upload uses Jira attachments under the active user. The execution-result property keeps only a pointer. Replacement writes the new pointer before deleting the previous attachment; a failed pointer save attempts to remove the new upload. A failed deletion attempts to restore the prior pointer. Treat these as compensating operations rather than a database transaction and surface incomplete recovery to the user.

## Synchronization semantics

There is no shadow Qaira database to synchronize with Jira. For issue-backed artifacts, Qaira creates a current projection from Jira fields, embedded issue properties, issue links, and attachment metadata on each request and writes Jira directly. Changes made through standard Jira issue screens are visible to Qaira on the next query if they touch fields Qaira reads. Jira issue links are authoritative for relationships. Normal relationship changes validate the complete target set, reconcile the Jira link diff, and update the compact property projection in the same workflow. Qaira issue-property details and project-property collections are also Jira-owned but are primarily edited through Qaira.

Historical projection drift is an operational repair case, not a second sync direction. `GET /admin/reconcile` scans a bounded number of issue-backed artifacts and reports link/property drift without mutation. A confirmed `POST /admin/reconcile` repairs at most the requested bounded number of property projections from current Jira links; it never changes the authoritative links. Its response identifies truncation, remaining drift, applied items, and errors so operators can repeat small reviewed batches.

This gives two-way interaction with the same Jira record, not a general bidirectional connector. The current integrations catalog, ALM compatibility paths, CI importer, and external-runner hand-off do not implement conflict-resolved synchronization with another ALM, repository, or test engine. Any future connector must define ownership per field, stable external IDs, webhooks or cursors, idempotency keys, tombstones, retry/dead-letter behavior, loop prevention, conflict policy, and an operator-visible reconciliation record before it may be described as bidirectional sync.

## Resolver/API families

The frontend sends `{ path, method, body }` to one `qairaApi` resolver. Important implemented families are:

| Area | Paths |
|---|---|
| Session and metadata | `/auth/*`, `/metadata/domain`, `/settings/*`, `/feature-flags` |
| Access administration | Jira-owned read-only `/users`; Qaira `/roles`, `/permissions`, `/project-members`, `/admin/health`, `/admin/reconcile` |
| Jira workspace | `/projects`, `/app-types`, `/projects/:id/knowledge` |
| Requirements and defects | `/requirements`, `/requirement-iterations`, `/feedback`, `/feedback/ai-draft-preview` |
| Test design | `/test-cases`, `/test-steps`, `/shared-step-groups`, `/test-case-modules`, `/test-suites`, `/suite-test-cases` |
| Test-case versions | `GET /test-cases/:id/versions`, `GET /test-cases/:id/versions/:revision`, `POST /test-cases/:id/versions/:revision/restore` |
| Enterprise issue artifacts | `/test-plans`, `/automation-assets`, `/object-repository-items`, `/quality-gates` |
| Traceability | `/requirement-test-cases`, `/requirement-defects`, `/test-case-defects` |
| Runs | `/executions`, `/execution-results`, `/execution-schedules` |
| Environment and data | `/test-environments`, `/test-configurations`, `/test-data-sets` |
| AI/automation compatibility | test-design preview/accept routes, automation build/learning-cache routes, `/agentic-workflows`, `/agentic-workflow-runs`, `/local-agent/*` |
| Explainable quality assistance | `GET /ai/quality-insights`, requirement/test impact previews, execution failure clusters, and quality-gate assessment previews |
| Quality dashboards | `/quality-dashboards`, project-scoped `/analytics/jql`, batched `/analytics/jql-batch`, and preview-only `/analytics/dashboard-design-preview` |
| Operations | `/workspace-transactions`, `/ops-telemetry/*`, `/notifications`, `/integrations` |

Unknown paths return `ROUTE_NOT_IMPLEMENTED`; unsupported platform behavior must not return a fabricated successful response. Authentication creation/recovery remains Atlassian-owned. Reusable local API keys, outbound mail, and in-Forge browser/mobile execution are intentionally not implemented.

Atlassian identity is also Atlassian-owned. The Users page may list the Jira directory and explain authority, but Create/Import/Update/Delete/Password actions must not return. Qaira roles and project membership are separate, project-scoped authorization records and remain editable only with their explicit permissions.

All issue item operations are project scoped and type checked. Caller-supplied requirement JQL is constrained to the authorized project/type boundary. List helpers paginate Jira responses but currently impose a bounded result ceiling; large-repository work should introduce cursor/virtualized workflows rather than an unbounded load.

## Authorization and feature controls

Authorization layers are cumulative:

1. Resolve the active Atlassian identity and selected Jira project.
2. Require Jira `BROWSE_PROJECTS`.
3. Resolve Qaira membership and role for that project.
4. Require the route/method permission from `src/qairaAccess.js`.
5. For Qaira administrative permissions, also require Jira `ADMINISTER_PROJECTS` or global `ADMINISTER`.
6. For mutations, require the applicable Jira create/edit/delete capability; Jira REST performs the final endpoint-specific check.
7. Require every registered feature for the route/action to be enabled.

The system roles are Jira administrator, QA lead, QA member, and Viewer. A Jira project/global administrator receives the administrator profile only after a live Jira permission check. Qaira persists that result as a system-managed membership for project administration screens, but membership CRUD cannot assign or remove it and a stale record never grants administrator access. When Jira administration is revoked, Qaira restores the saved fallback role. Other memberships select QA lead, QA member, Viewer, or a non-administrative custom role.

The feature snapshot is project scoped in `qaira.data.feature-flags.v1`. Defaults and valid stored boolean overrides are merged. Unknown keys fail closed in the frontend and are rejected on update. A feature flag controls rollout; it never grants a permission.

Registered feature groups include:

- manual: requirements, test cases, suites/shared steps, runs, bugs, plans, quality gates, environments, and test data;
- analytics: quality analytics and custom dashboards;
- automation: workspace, assets, builder, step code, recorder hand-off, local/remote runner hand-off, object repository, batch process, and mobile metadata;
- AI: requirement design, test authoring, bug triage, automation assistance, execution analysis, quality insights, agentic workflows, knowledge, and prompt templates;
- operations: projects, access administration, settings, integrations, notifications, and telemetry.

There are 35 registered flags. Every permission returned by `/permissions` includes its read/write/manage level and the feature definitions that make it available in the active project. Bugs, environments, test data, dashboards, projects, settings, and prompt templates are independently controlled. AI routes remain cumulative with their manual/analytics domain feature and dedicated permission.

`qaira.mobile.appium` is a supplementary field/action flag. Web/API environments and configurations remain available when it is disabled; mobile metadata and mutation controls additionally require `mobile.view` or `mobile.manage`, and mobile payloads fail closed in the resolver.

Reconciliation is also cumulative: the `qaira.ops.admin` feature must be enabled; dry-run `GET` requires `ops.view`; confirmed `POST` requires `ops.manage`, which is an administrative permission and therefore also requires Jira project/global administration.

Add a new protected capability in one coherent change: permission catalog and default-role decision, backend route policy, feature registration if rollout-controlled, frontend navigation/action guard, admin initializer/schema parity, tests, and documentation.

## AI experience and trust contract

The current shipped AI experience is bounded and review-first:

- requirement quality/coverage suggestions;
- requirement-to-test candidate previews and explicit acceptance;
- test-case completion and step rephrasing previews;
- smart run-scope/risk heuristics;
- execution failure analysis and defect drafts;
- explainable portfolio quality insights over coverage gaps, orphan tests, automation candidates, failed runs/open defects, and locator stability;
- requirement and test-case change-impact previews derived from current links, run scope, automation assets, and object dependencies;
- transparent keyword-based failure clustering with evidence references and unclassified results kept explicit;
- threshold-by-threshold quality-gate assessment previews that never approve the gate;
- automation-asset skeleton metadata;
- deterministic DOM attribute extraction and semantic locator recommendations;
- project prompt templates, knowledge context, and agentic-workflow records;
- Forge-LLM bug drafts grounded in selected run/case/requirement evidence and project RAG;
- queued Forge-LLM LLM/Web-evidence/API agents with named outputs and bounded downstream hand-offs;
- Rovo actions for QA context, test drafts, release risk, automation drafts, locator suggestions, and report summaries.

Portfolio analytics, change impact, failure clustering, quality-gate evaluation, and smart-run prioritization continue to use deterministic Jira-native heuristics. Agentic LLM/Web-evidence/API nodes and `/feedback/ai-draft-preview` use Atlassian Forge LLM through the manifest-declared model. They do not persist a provider key. Every model call uses project-scoped bounded context, redaction, prompt-injection isolation, model/usage trace data, and explicit human review; bug drafting returns a labeled deterministic fallback rather than failing the manual workflow when Forge LLM is unavailable.

`POST /executions/smart-plan-preview` is an explainable risk-selection preview, not a model claim. It concurrently loads at most 100 project-scoped cases, requirements, and suites per family, requires every returned case to match a selected requirement, release, or context signal, ranks with visible deterministic evidence, and returns no arbitrary fallback cases. Do not add execution-result shard scans to this interactive path; add compact ingestion-time risk rollups first.

The canonical explainable preview endpoints are:

```text
GET  /ai/quality-insights
POST /requirements/:id/ai-impact-preview
POST /test-cases/:id/ai-impact-preview
POST /executions/:id/ai-failure-clusters
POST /quality-gates/:id/ai-assessment
POST /feedback/ai-draft-preview
POST /agentic-workflows/:id/runs
GET  /agentic-workflow-runs/:id
```

They return deterministic evidence-backed previews with generation mode, request ID, input fingerprint, timestamp, evidence references, confidence, fallback reason, and `requires_human_review`. They do not mutate their assessed source records. A locator improvement is similarly split: `POST /test-cases/automation/learning-cache/:id/ai-improve` proposes a locator; `PUT .../:id/ai-improve/apply` requires `confirmed: true`, records the originating request when supplied, and only then updates the Jira Object Repository record.

Quality scope must remain explicit. `GET /ai/quality-insights?release=<name>` filters requirements by Jira fix version and runs by their Qaira release value, then derives linked tests/suites, defects linked through an in-scope run, requirement, or test, and test-linked objects. Without `release`, it evaluates the visible project. A quality-gate assessment first uses the gate's authoritative Jira link to a Test Plan; that plan's linked cases/suites determine the related requirements, runs, defects, and objects. If no plan is linked, the assessment uses the request/gate release, then the project. The response reports the chosen scope.

AI invariants:

- Preview before persistence. Write-oriented Rovo actions return drafts/previews unless the user explicitly accepts in the Qaira workflow.
- Preserve provenance: source requirement/test/run IDs, generation/review state, timestamps, and relevant integration/model label when a real provider is used.
- Never invent execution evidence, defect confirmation, coverage, or release approval.
- Separate recommendation confidence from observed test results.
- Do not place secrets, sensitive production data, or unrestricted attachment content into prompts.
- Enforce the same project, RBAC, Jira permission, and feature checks on AI routes as on manual routes.
- A disabled/unavailable AI provider must leave manual authoring and execution usable.
- Quality gates and go/no-go summaries remain advisory until an authorized human approves the Jira artifact.

Any additional model provider must use an approved Forge/Rovo/Forge Remote architecture with tenant isolation, data-residency review, secret storage outside entity properties, explicit egress policy, timeout/budget controls, prompt-injection defenses, content-size limits, redaction, audit metadata, and deterministic fallbacks. Add provider contract tests and never silently fall back while claiming model-generated output.

## Frontend and UX architecture

The UI is React + TypeScript under `static/qaira-ui/src`:

- `App.tsx` owns hash routes, lazy page loading, the top-level error boundary, query defaults, localization, and session providers.
- `components/AppShell.tsx` owns project/application scope, sidebar navigation, permissions, feature-aware visibility, theme, and responsive shell behavior.
- `pages/` contains domain workspaces.
- `lib/api.ts` is the only Forge transport boundary and contains direct attachment operations that require Forge Bridge.
- `hooks/` centralizes current scope, domain metadata, flags, prompt registry, and workspace queries.
- `components/WorkspaceMasterDetail.tsx` is the standard browse/detail pattern for authoring workspaces.
- shared dialog, field, table, status, toast, and AI-studio components should be reused before creating page-local variants.

UX rules for future changes:

- Match Jira's neutral canvas and surface hierarchy. Authoring browse and detail states should not switch to a decorative or tinted page background.
- A modal has one semantic title, optional short eyebrow/context, one close control, one scroll owner, and a persistent action footer. Do not repeat the same heading in nested header blocks.
- Portal dialogs to `document.body`, constrain width/height to the iframe viewport, allow body scrolling, and keep actions visible at narrow heights.
- Use `aria-modal`, an accessible name, Escape/backdrop behavior when safe, initial focus, keyboard containment for complex dialogs, and focus restoration on close.
- Destructive operations use the shared confirmation dialog and explicit irreversible language.
- Detail views preserve project and application scope; IDs displayed to users should prefer Jira keys such as `QA-123`.
- Loading, empty, permission-denied, feature-disabled, error, and success states must be distinct. Never show an empty success screen after a rejected resolver call.
- Use `LoadingState` for page, panel, and dialog work. It owns the only spinner, centers itself in its available surface, and places the operation label below the icon. Do not add pseudo-element or page-local duplicate loaders.
- Keep primary actions stable between list and detail views. AI actions are visually secondary to save/execute unless the user is inside a dedicated AI studio.
- Tables/lists with growth potential use paging, filtering, bounded queries, or virtualization. Do not mount every result or attachment preview eagerly.
- Dark mode and responsive layouts are part of the shared token system; page-local hard-coded colors should not reintroduce inconsistent surfaces.

The app uses Jira-aligned custom CSS rather than claiming full Atlaskit component adoption. Visual changes require verification in the actual Forge iframe at representative desktop and narrow sizes because standalone Vite cannot reproduce all Forge Bridge/Jira chrome behavior.

## Performance and resilience invariants

- Keep entity-property values below the 30,000-byte application guard.
- Test-case versions use separate `qaira.testCaseVersion.v1.<revision>` issue properties, retain the newest 20 snapshots, and exclude review/job history from restorable content. Never embed an accumulating snapshot array in `qaira.testCaseSpec.v1`.
- Preserve per-item project-property and run-result sharding.
- Preserve the request-scoped `AsyncLocalStorage` cache: it deduplicates repeated reads and in-flight promises within one resolver invocation, updates/invalidates entries after writes, and must never become a cross-request source of stale authorization or Jira data.
- Request required structured properties through Jira search and map from the embedded values. This avoids an issue-property request per result for requirements, defects, cases, suites, runs, plans, automation assets, objects, and gates.
- Fetch remaining project-property and run-result shards in bounded parallel batches rather than an unbounded `Promise.all` or sequential N+1 loop.
- Fetch independent screen data concurrently and cache stable metadata; the frontend query client uses bounded retry, stale time, and no focus refetch storm.
- Persist case metadata and edited steps through the single test-case update contract. Do not reintroduce a sequential request per dirty step for the normal Save Test Case action.
- Lazy-load route bundles and attachment bytes. Revoke temporary browser object URLs.
- Paginate Jira REST and keep project/type predicates server-side; never download a whole Jira site to filter in the browser.
- Validate all relationship targets before mutation and use diffs.
- Use `expected_revision` where supported to detect stale managed-artifact updates. Jira properties are still last-write-wins; revision numbers are diagnostics, not atomic compare-and-swap.
- On multi-step writes, order operations so compensation is possible and return an explicit error if recovery is incomplete.
- Treat `GET /admin/reconcile` as the mandatory preview for any projection repair. Production applies use `POST` with `confirmed: true` and a conservative `max_changes`, review errors/remaining/truncation, then repeat; never introduce an unbounded repair loop inside one Forge invocation.
- Forge Async Events may run bounded AI workflow jobs with explicit status, retry, timeout, and trace state. It is not an external browser/mobile/API execution grid; approved runners own those live executions and report results/evidence back to Jira.

## Security and privacy invariants

- Never store passwords, API tokens, repository credentials, test-user secrets, production datasets, or unrestricted personal data in Jira properties.
- Jira permissions remain authoritative even when Qaira RBAC is more restrictive.
- Project and issue type validation is mandatory before read, update, link, result, or delete operations.
- Treat attachment content as untrusted; validate non-empty files, selection count, and Jira's site upload limit in the client, never render arbitrary file content as HTML, and keep Jira policy/permissions authoritative.
- Keep admin setup tokens out of commands and files. Use the mode-`0600` temporary curl configuration built by the scripts and clear environment variables afterward.
- Protect `.qaira-setup-state` output according to enterprise retention policy; traces can contain Jira configuration and user metadata.
- Review manifest scopes for least privilege on every release. A new scope requires administrator consent through an installation upgrade.
- Logs must provide enough correlation to diagnose a failure without logging secrets or entire sensitive payloads.

## Setup, deployment, and verification

For package validation:

```bash
nvm use 22.22.0
npm run setup
npm run verify
npm run build
forge lint
```

`npm run verify` checks backend syntax and contract tests, frontend types, all 46 SQL/Jira mappings, runtime/admin schema parity, parity for all 35 registered feature flags, property keys/limits, and shell scripts. `forge lint`, deploy, and installation require an authenticated Forge account that owns or contributes to the app ID in `manifest.yml`.

For a new project, configure `admin/qaira-project-map.json`, diagnose credentials, run a project-targeted dry run, review `.qaira-setup-state`, and only then apply. Never begin with an unreviewed site-wide apply. `PROJECT_KEYS=ALL` requires `CONFIRM_ALL_PROJECTS=true` for a real run. Do not rerun admin provisioning merely to deploy code to an already configured site.

Deployment uses the existing Forge app identity:

```bash
forge deploy -e development
forge install -e development -s your-site.atlassian.net -p Jira --upgrade
```

Omit `--upgrade` only for the first installation on that site. Do not run `forge register` unless intentionally creating a different app identity.

After installation, test administrator, QA lead, QA member, Viewer, and an unassigned non-admin separately. Exercise CRUD, trace links in both Jira directions, run-result shards, evidence replacement/deletion, disabled feature behavior, unauthorized cross-project IDs, and `GET /admin/health`. Verify the five explainable quality endpoints return evidence-backed previews without mutating their assessed records, and confirm locator improvement requires the separate confirmed apply call. Full operational steps are in `docs/SETUP.md`.

## Known boundaries

- Forge does not execute Playwright, Selenium, Appium, browser grids, API suites, durable schedules, or batch worker leases. Approved CI/runners execute and post results/evidence to Jira.
- The current code does not provide a generic external bidirectional synchronization engine.
- Several “AI” endpoints are deterministic assisted workflows, not live LLM calls.
- Entity properties are last-write-wins and are not a relational transaction store.
- Version restore is compensating history, not a Jira transaction: relationship targets are validated first, the displaced current state is captured, the live revision advances, and approval resets. Post-restore retention/audit maintenance is best effort and is logged with the resolver request ID if it fails.
- The resolver imposes bounded list sizes; very large tenants need cursor-oriented repository UX and performance testing.
- Team-managed Jira projects may require manual issue-type/field setup.
- Standalone signup/password reset, Qaira-managed MFA, reusable API keys, outbound email, and stored integration secrets are intentionally absent.
- Removing the Forge installation does not remove Jira issues, fields, links, properties, or attachments.

## Change checklist for engineers and LLM agents

Before implementing:

1. Identify the Jira source of truth and project boundary.
2. Check `schema.sql` and `schema/qaira-property-model.json` for the domain mapping.
3. Find both the frontend API call and backend route; do not implement only one side.
4. Identify the required Qaira permission, Jira permission, and feature key.
5. Decide whether the payload belongs in a field, compact property, link, or attachment.
6. Define failure compensation, cache invalidation, batching, and concurrency behavior.

Before handing off:

1. Keep `schema/qaira-schema.json` and `src/qairaSchema.js` identical.
2. Update admin initialization/validation when adding a property or flag.
3. Add backend authorization and feature enforcement before route dispatch.
4. Add frontend permission/feature/loading/error behavior.
5. Verify modal/detail responsiveness and keyboard behavior for UI work.
6. Run `npm run verify`, `npm run build`, production dependency audits, and `forge lint` when credentials are available.
7. Update this file, `README.md`, and the relevant focused document when an architectural contract changes.

The most authoritative focused references are `docs/SETUP.md`, `docs/DATA_MAPPING.md`, `docs/CRUD_PERMISSIONS_AND_FLAGS.md`, `docs/ENTERPRISE_ARCHITECTURE.md`, `docs/PRODUCT_RESEARCH_AND_ROADMAP.md`, and `schema/qaira-property-model.json`.
