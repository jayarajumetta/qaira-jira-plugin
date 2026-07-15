# Exact Qaira Frontend to Jira Forge Conversion

## Objective

Preserve the supplied Qaira frontend as the product user experience and replace only its standalone platform dependencies with Jira Cloud Forge and Jira-native persistence.

## Source preservation

The supplied frontend source remains in `static/qaira-ui`. No replacement dashboard or alternate menu system was introduced. Existing application routes, page components, modal dialogs, table controls, detail drawers, workflow builders and styling are retained.

## Conversion boundary

### Frontend platform changes

- `createBrowserRouter` became `createHashRouter`, preventing direct-path failures inside the Forge iframe.
- Standalone email/password/Google authentication became an automatic session backed by the current Atlassian user.
- The original REST-shaped client API remains available to every page.
- The transport now calls `invoke("qairaApi", ...)` through `@forge/bridge`.
- Evidence download operations use Forge Bridge to read Jira attachments and construct browser `Blob` URLs without embedding binaries in entity properties.
- Vite builds with relative paths so hosted JavaScript, CSS and icons resolve inside Forge.
- External font requests and runtime API-base configuration were removed because Forge Custom UI assets must be self-contained.

### Backend platform changes

`src/index.js` now uses the standard default `Resolver` import and exposes one stable `qairaApi` resolver. This removes the prior `out is not a constructor` bootstrap failure.

`src/qairaApi.js` translates the existing frontend API surface into Jira operations. It intentionally retains frontend concepts such as modules, iterations, shared steps, environments, configurations, test data, agentic workflows and workspace transactions, but stores them through Jira project/issue properties instead of a separate database.

## Jira-native mapping

| Qaira frontend concept | Jira implementation |
|---|---|
| Project | Jira project |
| Requirement | Story/configured requirement issue type |
| Defect | Bug/configured defect issue type |
| Release | fixVersion |
| Test case | Qaira Test Case issue |
| Test suite | Qaira Test Suite issue |
| Plan | Qaira Test Plan issue |
| Run | Qaira Test Run issue |
| Automation case | Qaira Automation Asset issue |
| Object repository entry | Qaira Object Repository Item issue |
| Test data | Sharded project properties under `qaira.data.test-data-sets.v1` |
| Quality gate | Qaira Quality Gate issue |
| Iteration | project property collection |
| Module | project property collection plus test-case property assignment |
| Step specification | `qaira.testCaseSpec.v1` issue property |
| Run execution state | `qaira.runExecution.v1` issue property |
| Individual run results | `qaira.runResult.v1.<encoded-id>` issue-property shards |
| Evidence and result archives | Jira issue attachments |
| Suite membership | Jira links plus suite property |
| Requirement/test/defect traceability | Jira issue links |
| Qaira project schema mapping | `qaira.registry.v1` project property |

## API compatibility areas

The compatibility adapter implements the original frontend path families:

- `/auth`, `/settings`, `/feature-flags`, `/metadata`
- `/admin/health` and bounded `/admin/reconcile` dry-run/apply operations
- `/users`, `/roles`, `/permissions`, `/project-members`
- `/projects`, `/app-types`, project knowledge
- `/requirements`, `/requirement-iterations`, requirement AI/design actions
- `/ai/quality-insights` and requirement/test/run/quality-gate explainable preview actions
- `/feedback` for Jira Bug workflows
- `/test-cases`, `/test-steps`, `/shared-step-groups`
- `/test-case-modules`, `/test-suites`, `/suite-test-cases`
- `/test-plans`, `/automation-assets`, `/object-repository-items`, `/quality-gates`
- `/executions`, `/execution-results`, `/execution-schedules`
- automation build, recorder compatibility, learning cache and object repository operations
- `/test-environments`, `/test-configurations`, `/test-data-sets`
- `/agentic-workflows`, workflow runs and local-agent status
- `/workspace-transactions`, artifacts and telemetry compatibility

## Deliberate Forge limitations

Forge is not a browser/mobile execution grid. Local recorder, Playwright, Selenium, Appium and external API execution controls remain visible because they are part of the exact frontend, but the Jira adapter returns explicit capability messages until a CI/runner integration is supplied. Generated automation drafts and imported results remain functional Jira-owned artifacts.

## Security properties

- User-visible Jira REST operations run as the active Jira user.
- Jira permission checks remain authoritative and Qaira route permissions are enforced before CRUD dispatch.
- A non-admin who can browse the Jira project but has no explicit Qaira membership receives the Viewer role, not write access.
- Unknown feature flags fail closed; project flags are persisted in `qaira.data.feature-flags.v1`.
- The browser never receives Jira admin credentials.
- No external application database is used.
- Integration secrets are not persisted in Jira project properties by the adapter.
- AI writes are drafts/previews unless a user confirms creation or update.

The feature catalog contains 27 keys, including `qaira.ai.quality_insights`. Quality insights, change impact, failure clustering, and gate assessment are deterministic evidence-backed previews. A requested release actually filters the quality-insights portfolio. A quality gate evaluates its Jira-linked Test Plan before falling back to release/project scope. Locator improvement uses a proposal `POST` and a separate explicitly confirmed apply `PUT`.

Issue-backed records are projected from Jira fields, embedded properties, links, and attachment metadata and written directly to Jira, so mapped standard Jira field changes appear in Qaira on refresh. Link changes are validated and reconciled immediately. Jira search embeds mapped properties, remaining shards use bounded batching, and a cache deduplicates reads only within the current resolver invocation. This does not constitute a general bidirectional external connector; the current build has no conflict-resolved synchronization engine for another ALM, repository, or execution service.

Jira links are the relationship authority. `GET /admin/reconcile` reports drift between links and property projections with `ops.view`; `POST` requires `ops.manage`, Jira administration, `confirmed: true`, and applies only a bounded links-to-properties repair batch under `qaira.ops.admin`.

## Deployment identity

The manifest contains the Forge app ID already registered for Qaira. Re-registering would produce a separate app identity. Upgrade the existing development installation with `forge install ... --upgrade`.
