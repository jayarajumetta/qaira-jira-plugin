# Qaira product research, capability ranking, and UI decision record

Research date: 15 July 2026. This is an engineering decision record, not a marketing comparison. It uses current official product documentation and compares only capabilities that can be verified in this repository.

## Research sources

### Atlassian Forge and Jira

- [Jira entity properties](https://developer.atlassian.com/cloud/jira/platform/jira-entity-properties/) — 32,768-byte property value limit, 255-byte key limit, global namespace, last-write-wins behavior, and permission caveats.
- [Forge platform limits](https://developer.atlassian.com/platform/forge/platform-quotas-and-limits/) — invocation, resource, and product-rate-limit constraints.
- [Optimise Forge platform costs](https://developer.atlassian.com/platform/forge/optimise-forge-costs/) — bulk reads, source-side filtering, avoiding N+1 calls, and bounded compute guidance.
- [Forge design tokens and theming](https://developer.atlassian.com/platform/forge/design-tokens-and-theming/) — reactive Jira theme alignment through `view.theme.enable()` and design tokens.
- [Jira project role actors REST API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-project-role-actors/) — Jira users/groups can be bound to Jira permission roles, but the operation is Jira-administrative and is separate from an app-specific RBAC model.
- [Jira dashboard creation](https://support.atlassian.com/jira-software-cloud/docs/create-and-edit-dashboards/) and [dashboard gadgets](https://support.atlassian.com/jira-software-cloud/docs/add-and-customize-gadgets/) — edit/share workflows and configurable, purpose-specific information surfaces informed Qaira's modal builder and saved-dashboard canvas.

### Zephyr

- [Zephyr test plans](https://support.smartbear.com/zephyr/docs/en/test-plans/test-plans--overview-) — plans group cycles and expose release-level progress, scope, risk, strategy, environment, and entry/exit criteria.
- [Zephyr parameters](https://support.smartbear.com/zephyr-scale-cloud/docs/en/test-cases/parameters.html) — parameterized modular tests and call-to-test reuse.
- [Zephyr product comparison](https://support.smartbear.com/zephyr/docs/en/zephyr-squad-to-zephyr-migration-guide/product-comparison.html) — repository hierarchy, versioning, bulk actions, execution history, traceability, reports, and automation result import.
- [Zephyr upgrade guide](https://support.smartbear.com/zephyr/docs/en/zephyr-squad-to-zephyr-migration-guide/zephyr-squad-to-zephyr-essential-upgrade-guide.html) — current emphasis on performance, AI-assisted automation, record/play, versioning, parameters, plans, and reporting.
- [Zephyr reports and analysis](https://support.smartbear.com/zephyr-scale-server/docs/en/reports-and-analysis.html) — coverage, execution, traceability, and project reporting patterns.

### Xray

- [Xray parameterized tests](https://getxraydocs.atlassian.net/wiki/spaces/XRAYCLOUD/pages/44566351) — data-driven tests, data sets, and the separation between test inputs and environments.
- [Xray modular tests](https://getxraydocs.atlassian.net/wiki/spaces/XRAYCLOUD/pages/44578265) — reusable call-test composition, nested modules, and parameter resolution.
- [Xray Cloud 6.9 release notes](https://getxraydocs.atlassian.net/wiki/spaces/XRAYCLOUD/pages/392921651/Xray%2BCloud%2B6.9.0%2BRelease%2BNotes) — human-selected AI test generation and AI-assisted model generation.
- [Xray Marketplace listing](https://marketplace.atlassian.com/apps/1211769/) — Jira-native tests, preconditions, sets, executions, plans, coverage, BDD, reports, REST/GraphQL, and current AI capabilities.
- [Xray Reporting Center](https://getxraydocs.atlassian.net/wiki/spaces/XRAYCLOUD/pages/338526916) — project/release quality reporting and report navigation patterns.

### TestRail

- [Introduction to TestRail](https://support.testrail.com/hc/en-us/articles/7076810203028-Introduction-to-TestRail) — repository, cases, runs, plans, milestones, and configuration matrices.
- [Test case versioning](https://support.testrail.com/hc/en-us/articles/7768433966996-Test-case-versioning) — compare and restore for test cases and shared steps.
- [Shared steps](https://support.testrail.com/hc/en-us/articles/7101778857236-Shared-steps) — reusable step sets and propagated updates.
- [AI test case generation](https://support.testrail.com/hc/en-us/articles/37119835854484-Quick-Start-Generate-Test-Cases-with-AI) — project/role controls, template mapping, title-level review, selection, detailed generation, and AI audit logs.
- [Prioritize with AI](https://support.testrail.com/hc/en-us/articles/46609041281812-How-to-get-the-best-results-with-Prioritize-with-AI) — release instructions combined with test content, execution history, defects, labels, and priority.
- [Plans](https://support.testrail.com/hc/en-us/articles/30765296499604-Create-new-test-plans) and [configurations](https://support.testrail.com/hc/en-us/articles/23043143013268-Configurations) — multi-run planning and browser/OS/device matrices.
- [TestRail test metrics guide](https://support.testrail.com/hc/en-us/articles/32965382569108-Best-Practices-Guide-Test-Metrics) — coverage, execution, defect, productivity, and trend metrics for stakeholder decisions.

## What the products consistently treat as core

The common enterprise baseline is not a large menu. It is a traceable lifecycle:

```text
Requirement or release intent
  -> reviewed test design
  -> reusable/parameterized repository
  -> plan and configuration scope
  -> manual or automated execution
  -> result, evidence, and defect
  -> coverage/risk decision
  -> audit, version, and report
```

Zephyr and Xray are strongest when Jira artifacts and traceability are the primary user context. TestRail is strongest as a purpose-built repository and execution workspace with Jira integration. All three now put human review around AI-generated test content. None of that justifies silently treating an LLM suggestion as evidence, an approved case, or a release decision.

## Verified Qaira position

| Capability | Qaira status | Decision |
|---|---|---|
| Jira requirement/test/bug traceability | Implemented | Jira links remain authoritative and project scoped. |
| Case repository hierarchy | Implemented | Modules, suites, list/tile views, selection, search, and bounded queries. |
| Shared steps and parameters | Implemented | Shared groups, step parameters, configurations, and data sets. |
| Plans, runs, environments, and evidence | Implemented | Jira issue artifacts/properties plus attachments; external runners execute automation. |
| Review and approval | Implemented | Review status/history and human acceptance for generated content. |
| Test-case content version compare/restore | Implemented in this change | Up to 20 bounded snapshots, current comparison, confirmed restore, optimistic concurrency, review reset, and audit trace. |
| AI requirement/test design | Implemented as review-first assistance | Prompt templates, smart context, preview selection, and explicit acceptance. No direct provider invocation is claimed by the current resolver. |
| Risk-based smart run | Upgraded in this change | Only scope-matched cases are ranked; signals are traceability, release, criticality, approval, coverage, automation health, and prompt-context overlap. |
| Failure clustering and quality gates | Implemented as advisory previews | Evidence references and thresholds are visible; no automatic release approval. |
| Native BDD feature repository and round-trip | Gap | Current step types and imports are not a full Gherkin feature/version workflow. |
| Plan-to-configuration matrix materialization | Partial | Plans, configurations, environments, and data sets exist; a first-class combination matrix is still a product gap. |
| Cross-project reusable library | Intentionally constrained | Current safety contract is strict project scope. Cross-project content needs an explicit ownership and permission model before implementation. |
| In-Forge browser/mobile execution | Intentionally unsupported | Forge is not a browser grid or durable worker runtime; execution belongs in approved CI/runners. |

## Ranking method

Each candidate is scored from 0–10 using: user/release value 30%, competitor baseline 20%, Jira-native fit 20%, safety/audit value 10%, expected performance impact 10%, and delivery confidence 10%. “Implemented” means code, UI, authorization, schema, and tests exist in this repository; it does not mean production rollout has been validated in a customer tenant.

| Rank | Candidate | Score | Result |
|---:|---|---:|---|
| 1 | Governed test-case content versions, compare, and restore | 9.3 | Implemented. Highest audit and maintenance value with a clean Jira-native fit. |
| 2 | Explainable risk-based run prioritization | 9.1 | Existing flow substantially upgraded; arbitrary first-20 behavior removed. |
| 3 | Plan/configuration combination matrix | 8.5 | Next recommended product increment. Must avoid materializing a combinatorial explosion by default. |
| 4 | Native BDD feature/scenario repository and round-trip import/export | 8.1 | Recommended after matrix planning. Preserve Jira traceability and external runner ownership. |
| 5 | Custom case templates and field-to-AI mappings | 7.8 | Useful for enterprise adoption; requires schema and admin UX design. |
| 6 | Execution-history and defect signals in smart-run scoring | 7.6 | Valuable, but must be pre-aggregated; reading every result shard during an interactive preview would create an N+1 latency problem. |
| 7 | Cross-project reusable cases | 6.4 | Defer until ownership, permissions, edit propagation, and reporting scope are designed. |
| 8 | Run browsers or devices inside Forge | 3.2 | Rejected; incompatible with the runtime and product safety boundary. |

## Implemented design decisions

### Content versions

- Current content stays in `qaira.testCaseSpec.v1`.
- Each retained snapshot uses `qaira.testCaseVersion.v1.<revision>` on the same Jira Test Case issue.
- The application keeps 20 snapshots. Each snapshot receives the existing 30,000-byte Qaira guard independently and excludes review/audit/job history that is not required for restoration.
- A save captures the previous state before changing fields, links, or steps.
- Case details and dirty steps are now persisted in one test-case update instead of one case request plus an N-step update loop.
- Restore validates project/type and all relationship targets, checks `expected_revision`, preserves the displaced current version, resets approval, records a review event, and adds a workspace audit transaction.
- History UI compares a selected version with current content and uses Jira-aligned tokens, a compact two-pane layout, responsive stacking, focus containment, and explicit confirmation.

### Smart-run prioritization

- Requirements, cases, and suites load concurrently with a hard 100-record evidence budget per family.
- A case must match a selected requirement, release, or context signal. There is no generic fallback to the first cases in the repository.
- The score and impact level are deterministic, explainable, project scoped, and capped.
- The response continues to disclose deterministic generation, evidence, confidence, fallback, and human-review requirements.
- Execution result shards are deliberately not scanned during the interactive preview. A future history signal should use compact rollups written during result ingestion.

### Project roles and Jira authority

- Qaira-specific roles remain app-scoped RBAC records in Jira project properties. They are not mirrored into Jira project roles because doing so would conflate Qaira capability grants with Jira permission schemes and would require Jira-administrative role-actor mutations.
- Jira administrator access is resolved from current Jira permissions on every authorized request. A system-managed `jira-admin` membership makes that assignment visible but cannot be assigned or removed through Qaira membership APIs and never overrides the live check.
- New project creation assigns a verified global Jira administrator the system-managed administrator membership; other creators receive QA lead. Every additional Jira user requires an explicit Qaira role.
- Jira-administrative permissions are excluded from QA lead/custom roles, keeping the visible role model consistent with resolver enforcement.

### Quality dashboards and AI prompt workspaces

- Quality analytics and custom dashboards are sibling Home sidebar destinations; the duplicated in-page section selector was removed.
- Saved dashboards use the full analysis canvas. Create and Edit are focus-contained modal workflows, Delete is confirmed, and the AI-assisted stakeholder designer is available only inside Create.
- Custom metrics cover volume, resolution flow, priority, ownership, due-date and staleness exposure, 30-day creation/resolution flow, resolution rate, average age, and average resolution time. Groupings include Jira workflow/type/people, component, version, sprint, labels, resolution, and weekly/monthly time buckets.
- AI requirement creation/improvement and test-case completion share the same bounded prompt-context contract: templates, selected requirements, knowledge, safe text files, links, and reference images. Each context rail can collapse without discarding the draft or preview.

## UI/UX review

The implemented UI is rated 8.7/10 against the repository’s Jira-iframe constraints:

- strong: one shared loading state, centered icon with label below, no duplicate shell pseudo-spinner;
- strong: version list and comparison use the History surface instead of adding another top-level page;
- strong: changed values are scannable and restoration is explicit, keyboard-contained, and reversible through the newly captured snapshot;
- strong: responsive layout collapses to one column and uses Jira/theme tokens rather than hard-coded light-only surfaces;
- improved: save latency is one content request rather than sequential per-step requests;
- remaining validation: test actual Jira iframe heights, long rich-text/step values, narrow project pages, and both Jira themes after deployment;
- remaining product design: configuration matrix and BDD flows need prototypes before schema work.

Static exploratory/marketing prose should not be placed in working screens. Use concise labels, contextual empty states, validation messages, and optional help tooltips. Documentation such as this file owns product explanation.

## Next implementation sequence

1. Deploy to a Jira sandbox and validate version save/compare/restore with admin, QA lead, QA member, and Viewer roles.
2. Measure smart-preview Jira calls and p50/p95 duration from existing structured logs.
3. Prototype a lazy plan/configuration matrix that previews combinations before creating runs.
4. Define a BDD storage/import/export contract with feature/scenario provenance and CI result correlation.
5. Add compact per-test execution/defect risk rollups during result ingestion, then consume those rollups in smart prioritization without scanning run shards.
