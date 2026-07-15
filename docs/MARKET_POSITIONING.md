# Market positioning and product truth

Qaira should not be positioned only as “Xray with AI” or “Zephyr with AI.” Test generation alone is no longer a durable differentiator. Position the product around Jira-native ownership, a guided requirement-to-release workflow, explainable assistance, and low-friction evidence/traceability.

## Winning position

Qaira is a Jira-native QA workspace:

- Jira-owned data, no external app database
- Guided QA workspace instead of artifact-heavy navigation
- Requirement coverage studio with live traceability
- Test Case Studio with review-first authoring assistance and automation hints
- Jira-native Test Plans and risk-oriented scope guidance
- Manual Run Console with inline evidence and defect creation
- Automation Center with Jira mappings, CI imports, execution metadata, and reviewable analysis
- Object Repository Studio for HTML/mobile/API locator metadata and semantic locator suggestions
- Explainable portfolio/release-readiness insights based on Jira-native coverage, traceability, run, automation, defect, and locator evidence
- Bounded AI/Rovo actions that preserve human approval

The current resolver uses deterministic assistance for its explainable AI experiences and contains no direct third-party model call. Quality insights, change-impact previews, failure clusters, and quality-gate assessments show evidence and require human review; they are not autonomous decisions. Locator suggestions are not applied until a user explicitly confirms the separate apply request. Do not market these responses as model-generated, autonomous, or self-healing. Do not call the integrations catalog or CI hand-off bidirectional sync.

## Competitor pain addressed

| Market pain | Qaira answer |
|---|---|
| Complex UI | One QA workspace and role-based studios |
| Too many artifact switches | Unified Jira-native cockpit |
| Reports require effort | Rollup-first dashboards and drill-down |
| Slow large repositories | No per-result issues; sharded result properties and lazy-loaded attachments |
| Traceability is hard | Matrix + graph + release views |
| AI limited to generation | Evidence-backed, review-first assistance across design, impact, triage, gates and risk |
| Automation mapping friction | Automation Asset + CI import + unmapped review |
| Locator maintenance missing | Object Repository + semantic locator recommendations |
| Release readiness unclear | Explainable rollups + Jira-native Quality Gate |

## Proof required before a claim ships

- “AI-generated” requires recorded provider/model invocation, not an integration label.
- “Bidirectional sync” requires conflict policy, idempotency, loop prevention, retry/reconciliation, and operator evidence.
- “Self-healing” requires observed selector failure, validated replacement, audit history, and an explicit approval/rollback policy.
- “Enterprise-ready” requires Forge lint/deploy, tenant role tests, disabled-feature tests, cross-project denial, recovery tests, and an approved security/data-retention review.
- “Scales to large repositories” requires measured Jira tenant tests and cursor/virtualized UX, not only a bounded in-memory list.
