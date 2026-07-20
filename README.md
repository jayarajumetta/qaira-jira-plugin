# Qaira for Jira — Jira-native test management with bounded AI

Qaira is a Jira Cloud Forge app for requirements-driven test design, reusable steps, suites, plans, runs, evidence, defects, automation metadata, test environments, quality gates, and release-risk analysis. The React workspace is delivered as Forge Custom UI, while Jira issues, issue/project properties, links, custom fields, and attachments remain the system of record.

The product is designed as a guided QA workspace rather than a second Jira database. It combines the core workflows expected from an enterprise test-management product with review-first requirement, authoring, automation, locator, execution-triage, and release-risk assistance. Manual workflows remain usable when AI capabilities are disabled.

For a durable engineering/LLM handoff, read [context.md](context.md) before changing the architecture. The dated competitor research, gap ranking, and UI decision record is in [Qaira product research and roadmap](docs/PRODUCT_RESEARCH_AND_ROADMAP.md).

Current release highlights:

- Jira-native attachments across Requirement, Bug, Test Case, and Test Run details, with no duplicate binary store;
- canonical Jira Sprint, Fix Version, labels, summary, description, priority, workflow status, assignee, and reporter mappings for Requirements and Bugs;
- a default Quality Analytics command center plus Create/Edit/Delete custom-dashboard workflows, modal JQL gadget design, four AI-assisted stakeholder templates, six visualizations, twelve metric functions, fifteen grouping dimensions, and batched project-scoped evaluation;
- one consistent AI prompt pack across requirement creation/improvement, test generation, and case completion: prompt templates, selected requirements, bounded knowledge/text context, external links, and reference images, with collapsible context rails;
- mandatory project-member role assignment: Jira administrators are idempotently synchronized into Qaira-visible projects as system-managed Jira administrator memberships, other project creators receive QA lead, and every additional Jira user requires an explicit Qaira role;
- Jira-native Sprint strips with lifecycle dates/status plus story completion, test coverage, run pass rate, and risk signals; test-module health remains focused on traceability, executability, stability, automation, and risk;
- bounded transient Jira retries with retry telemetry, while non-idempotent creates and attachment uploads remain single-attempt;
- one centered shared loading state with the label below the spinner; the duplicate shell spinner is removed;
- governed test-case content versions with compare, confirmed restore, optimistic concurrency, review reset, and a 20-snapshot retention bound;
- explainable smart-run prioritization that selects only requirement/release/context matches instead of taking the first repository records;
- one bundled case-and-step save request, replacing the sequential per-dirty-step save loop;
- Jira-native project scoping, permissions, fail-closed feature controls, structured resolver telemetry, and theme alignment remain mandatory boundaries.
- Jira owns user identity and product access: Qaira lists Jira users but exposes only its project-scoped role model, never standalone Create/Import/Password/Delete user actions.
- schema-aware table preferences discover safe project fields, group/search the column catalog, retain per-table order/visibility/density, and expose every non-system Jira schema field during test-case authoring;
- agentic workflows now run as bounded Forge async jobs with validated DAGs, resumable node traces, LLM/Web-evidence/API agent contracts, project RAG, named hand-offs, redaction, retries, timeouts, token/context/output budgets, and no literal credential persistence;
- API step authoring now models query parameters, cookies, credential references, redirects, timeouts, rich assertions, JSON-path/schema checks, and response captures while reserving live outbound execution for an approved runner;
- run evidence accepts Jira-supported image, video, PDF, text, JSON/XML, CSV, and archive files; bugs can be linked at run, case, and exact-step scope;
- Report Bug is a split action with feature-gated Forge-LLM drafting from bounded intent, context, evidence, project RAG, and selected run/case/requirement scope; the result is always reviewed in the normal bug form.

The evidence, Jira field mapping, dashboard/JQL, competitor research, and retry decisions are detailed in [Jira-native evidence and quality analytics](docs/JIRA_NATIVE_EVIDENCE_AND_ANALYTICS.md).

## Product workspace

The uploaded frontend is retained under:

```text
static/qaira-ui/
```

The supplied Qaira application shell and its main work areas remain intact:

```text
Home
Projects
Test authoring
Automation
Agentic Workflows
Test Runs
Bugs
TestOps
Test Environment
Knowledge Repo
Admin Space
Notifications
Support
```

The existing pages, components, dark theme, list/tile views, data tables, workflow canvases, authoring tools, automation repository, execution views, and administration screens remain the product foundation. Shared modal/detail patterns and Jira-aligned neutral surfaces are used to keep authoring screens readable inside the Jira iframe.

## Jira conversion

The conversion retains the supplied product workflows while replacing standalone platform dependencies and hardening shared UX/runtime boundaries:

```text
BrowserRouter            -> HashRouter suitable for a Forge iframe
Standalone login         -> active Atlassian/Jira session
REST calls to /api       -> @forge/bridge invoke("qairaApi")
External backend         -> Forge resolver + Jira REST
External database        -> Jira issues, fields, links, properties and attachments
External requirement DB  -> Jira Story
External defect DB       -> Jira Bug
External release DB      -> Jira fixVersion
```

The Forge backend compatibility adapter is:

```text
src/qairaApi.js
```

It maps the original frontend API surface to Jira-native records and configuration.

## Data ownership

No external database and no Forge database are used for Qaira business data.
The restored root `schema.sql` is the canonical reference domain model only and must not be executed during Forge/Jira setup. All 46 unique SQL tables have a validated Jira compatibility mapping in `schema/qaira-property-model.json`.

```text
Requirements             Jira Story or configured native requirement type
Defects                  Jira Bug or configured native defect type
Releases                 Jira fixVersions
Test Cases               Qaira Test Case Jira issue
Test Suites              Qaira Test Suite Jira issue
Test Plans               Qaira Test Plan Jira issue
Test Runs                Qaira Test Run Jira issue
Automation Assets        Qaira Automation Asset Jira issue
Object Repository        Qaira Object Repository Item Jira issue
Test Data Sets           Sharded Jira project properties
Quality Gates            Qaira Quality Gate Jira issue
Sprints                  Jira Software Sprint (project-property mirror only for compatibility metadata)
Modules                  Jira project properties
Test steps/specification Jira issue property qaira.testCaseSpec.v1
Test case versions        Jira issue properties qaira.testCaseVersion.v1.<revision> (latest 20)
Run metadata/results     Jira issue properties
Run evidence/archives    Jira attachments
Traceability             Jira issue links
Project configuration    Jira project property qaira.registry.v1
```

Jira property keys/values are size-limited and properties are not a durable queue or binary store. See [SQL-to-Jira data mapping](docs/DATA_MAPPING.md) for the table-by-table contract and [CRUD, permissions, flags, and attachments](docs/CRUD_PERMISSIONS_AND_FLAGS.md) for the runtime behavior.

## AI trust model

Qaira's current AI-shaped experiences are bounded and human-reviewed:

- requirement quality and coverage suggestions;
- test-case and step previews with explicit acceptance;
- smart run-scope and risk heuristics;
- execution failure analysis and defect drafts;
- automation-asset and semantic locator recommendations;
- project knowledge/prompt context and bounded Rovo actions.

The explainable quality API adds deterministic, evidence-backed previews without mutating the source records:

```text
GET  /ai/quality-insights
POST /requirements/:id/ai-impact-preview
POST /test-cases/:id/ai-impact-preview
POST /executions/:id/ai-failure-clusters
POST /quality-gates/:id/ai-assessment
```

Responses identify generation mode, request ID, input fingerprint, evidence references, confidence, fallback reason, and the need for human review. Locator improvement follows the same trust contract: `POST .../ai-improve` returns a suggestion only, while `PUT .../ai-improve/apply` requires `confirmed: true` before changing the Jira Object Repository issue.

`GET /ai/quality-insights?release=<name>` evaluates a real release projection: matching requirement fix versions and run release values determine the tests, suites, linked defects, and object records included. A quality-gate assessment uses its Jira-linked Test Plan scope first; without a linked plan it uses the requested/gate release, then the project as the explicit fallback scope.

Most portfolio, impact, quality-gate, and smart-run experiences remain deterministic Jira-native heuristics and identify fallback behavior in their response. Agentic workflow nodes and AI bug drafting use Atlassian Forge LLM (`@forge/llm`) without a repository-managed model API key. Their inputs are project-scoped, redacted, size-limited, and treated as untrusted; model responses record model/usage/provenance and remain reviewable. AI bug drafting has a labeled deterministic fallback when Forge LLM is unavailable. Durable artifact creation or replacement stays behind an explicit user action, and AI does not silently approve tests, defects, results, or quality gates.

Additional bounded AI endpoints/runtime paths include:

```text
POST /feedback/ai-draft-preview
POST /agentic-workflows/:id/runs
GET  /agentic-workflow-runs/:id
```

Agentic runs are queued through Forge Async Events and use the manifest-declared Forge LLM model. Enabling the LLM module changes app permissions and requires the normal Forge deployment/install-upgrade review.

The smart-run preview loads a bounded project-scoped case/requirement/suite evidence set concurrently. A case must match selected requirements, a release, or supplied context. Its visible score is derived from traceability, release linkage, business priority, approval state, authoring coverage, automation health, and textual context overlap. No match returns an empty preview; it never pads the result with arbitrary cases.

## Jira interaction and synchronization

Issue-backed Qaira records are the Jira records: Qaira builds its projections from current Jira fields, embedded issue properties, links, and attachments, then writes changes directly to Jira. A standard Jira field edit is therefore visible to Qaira on the next query when that field is part of the adapter mapping. Relationship writes validate their targets and reconcile the Jira link diff immediately. This is immediate two-way interaction with the same source of truth, not a separate replication engine.

The current release does not claim conflict-resolved bidirectional synchronization with an external ALM, repository, or execution engine. CI/runners can create runs, upload result archives, and report compact status to Jira; a future general connector must add stable external IDs, idempotency, cursors/webhooks, loop prevention, conflict policy, and reconciliation before it is described as bidirectional sync.

## Setup paths

For the existing configured `QAIRA` installation, do not rerun Jira configuration merely to deploy a UI/backend build. Validate, deploy, and upgrade the Forge installation.

For a new Jira site/project, or an explicitly approved property-model adoption, follow the targeted dry-run and apply procedure in:

```text
docs/SETUP.md
```

The admin script validates every SQL-table mapping, resolves native requirement/defect IDs, creates only missing project-property envelopes, and writes a size-checked `qaira.registry.v1`. Existing property values and field contexts are preserved.

## Build and deploy

Use the Forge app identity already registered in `manifest.yml`. Do **not** run `forge register` again unless intentionally creating a completely new app.

```bash
cd qaira-for-jira
nvm use 22.22.0

npm run setup
npm run verify
npm run build

forge lint
forge deploy -e development
forge install -e development \
  -s your-site.atlassian.net \
  -p Jira \
  --upgrade
```

After deployment, hard-refresh Jira and open:

```text
Apps -> Qaira
```

## Forge app surfaces

```text
Jira global app page
Jira project page
Jira issue panel
Jira issue action
Qaira Rovo agent and bounded actions
```

The full uploaded Qaira workspace is used on the main app and project pages.

## Functional coverage

The adapter covers the original frontend domains:

```text
Session and current Atlassian user
Projects and Jira users
Requirements and Jira Software Sprints
Requirement AI previews and generated test drafts
Jira Bugs / issue reporting
Test cases, steps, reviews, retained content versions and modules
Test suites and suite membership
Test plans and execution runs
Manual result capture and Jira evidence attachments
Automation generation metadata
Automation learning cache / object repository
Test environments, configurations and datasets
Agentic workflow definitions and run records
Knowledge repository metadata
Notifications, roles and project members
Reports and CSV downloads
Workspace transaction/audit records
```

Browser, mobile, Selenium, Playwright, Appium, and API automation execution belongs in an approved external CI/runner. Qaira stores Jira-native mappings, reviewed drafts, execution metadata, imported results, evidence, defects, and recorded analysis. Forge does not pretend to be a browser grid, durable scheduler, or worker lease service.

## Access and rollout controls

Every protected request combines active Atlassian identity, Jira project access, a Qaira route permission, applicable Jira mutation/admin permission, and the registered project feature flag. A non-admin user with Jira project access but no explicit Qaira project membership receives Viewer access, not write access. Frontend visibility improves usability; resolver enforcement is the security boundary.

Qaira never changes Jira's permission scheme or Jira administrator groups. It verifies `ADMINISTER`/`ADMINISTER_PROJECTS` live, persists an idempotent system-managed `jira-admin` Qaira membership for visibility, and restores the member's prior fallback role if the live Jira permission is removed. When a verified global administrator opens the project catalog, Jira's permission search discovers active global administrators and queues one bounded synchronization across visible projects; new-project provisioning adds that discovered set immediately. Atlassian limits permission search to the first 1,000 directory users, so Qaira marks larger/unknown directory scans partial, never performs revocation from them, and ensures any live-verified administrator outside the window triggers their own all-project sync. Project administrators are reconciled when their project is accessed. Manual membership APIs cannot assign, edit, or delete `jira-admin`. Other new-project members must carry `qa-lead`, `qa-member`, or `viewer`.

Feature controls are stored per project in `qaira.data.feature-flags.v1`. They are deployment-managed from `admin/qaira-feature-flags.json` with the dedicated executable `admin/setup-qaira-feature-flags.sh`, rather than edited in application Settings. Unknown keys fail closed and a feature flag never grants authorization. The current groups cover manual management, automation/runner hand-off, AI experiences, and administration/operations.

There are 35 registered flags. Bugs, environments, test data, dashboards, projects, settings, and prompt templates now have independent controls instead of inheriting unrelated feature state. The permission catalog publishes every permission's read/write/manage level and applicable feature availability. Route permissions, Jira permissions, and feature requirements remain cumulative.

`qaira.mobile.appium` is supplementary: disabling it does not hide web/API environments or configurations. It removes mobile-specific metadata and recorder/integration controls, while `mobile.view` and `mobile.manage` provide explicit role grants and the resolver rejects mobile mutation payloads independently of the UI.

## Performance model

The resolver uses a request-scoped cache for repeated project, identity, permission, registry, and entity-property reads. Jira search embeds the structured properties needed by the mapper, avoiding a property request for every search result; remaining shards use bounded parallel reads. Catalog first paint no longer waits for unrelated results/metrics: Requirements and Test Cases render from their primary query, Projects hydrates portfolio metrics after the project list, Bugs fetches summary rows then selected detail/context, and inactive Run/Schedule/TestOps views do not poll. Test steps remain lazy and project scoped. Browser filtering uses deferred values so list and grid controls stay responsive during typing.

## Relationship reconciliation

Jira issue links are authoritative for Qaira relationships. Normal CRUD writes the link and its compact property projection together. Operations users can detect historical drift with `GET /admin/reconcile`; it is a read-only dry run requiring `ops.view` and the `qaira.ops.admin` feature. `POST /admin/reconcile` requires `ops.manage`, Jira administration, `confirmed: true`, and optionally `max_changes`; it repairs only a bounded batch of property projections from current Jira links and does not rewrite the links. Production operation is always dry run, review, then small confirmed batches until `remaining_count` is zero and the scan is not truncated.

## Release validation

```bash
npm run verify
npm run build
forge lint
```

`npm run verify` checks backend syntax/tests, frontend types, all 46 SQL-to-Jira mappings, runtime/admin schema parity, canonical property keys, feature parity, and Jira property key/value limits. `npm run build` creates the production Custom UI resource. `forge lint` and deployment require an Atlassian Forge login that owns or contributes to the app ID in `manifest.yml`.

A green local build is not the complete production gate. Before promotion, validate setup and `GET /admin/health` in a Jira sandbox, test administrator/QA lead/QA member/Viewer users separately, exercise cross-project denial and disabled flags, and verify evidence replacement/deletion in the actual Forge iframe.

## Operational notes

- The UI preserves the supplied Qaira information architecture while adding Jira-native access, feature, health, error, and evidence handling.
- The original API method names are retained to minimize frontend changes.
- AI output is a reviewable preview or advisory result unless a user explicitly accepts a durable write.
- Test-case restore never rewinds the live revision: it preserves current content, restores the selected snapshot as a new revision, and requires review again.
- Unsupported local-runner actions return explicit Jira/Forge compatibility messages rather than pretending a browser grid runs inside Forge.
- Jira permissions remain authoritative because resolver calls use the active Jira user context.
- Do not store API tokens, passwords, repository secrets, or customer production data in Jira project/issue properties.
- Run `npm run verify` before every admin setup, build, and deployment; it includes `admin/validate-qaira-schema.sh`.
- Full new-site, existing-site, rollback, and production instructions are in [docs/SETUP.md](docs/SETUP.md).
# qaira-jira-plugin
# qaira-jira-plugin
