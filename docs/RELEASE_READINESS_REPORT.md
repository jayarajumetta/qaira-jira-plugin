# Release readiness report

## Product intent

The top-level workspace is named **Release readiness** because its primary job is to help a release owner answer “what evidence supports the decision?” Traceability is an analysis mode inside that workspace: it explains how Jira requirements connect to tests, latest results, and bugs.

The interface progresses from decision to evidence:

1. **Decision brief** — state, capped score, confidence, transparent gates, and the highest-impact work.
2. **Traceability** — a requirement-level matrix ranked by deterministic risk.
3. **Execution evidence** — scoped runs and the latest result per test case.

Fix Version and Sprint remain Jira-native scope dimensions. QAira computes a graph-shaped view over those records instead of creating a second release hierarchy or copying Jira scope into a proprietary milestone tree.

## Benchmark findings

- Jira's version progress and release burndown make release scope, completed work, scope change, and schedule risk visible. QAira keeps Jira Fix Version as the primary release selector, but adds test and bug evidence instead of duplicating the delivery report.
- TestRail milestone summaries and reference comparison reports pair an executive overview with requirement-level coverage/results. QAira follows that progressive-disclosure pattern through the decision brief and traceability matrix without introducing a separate milestone record.
- Zephyr Scale test plans aggregate cycles for a release and provide coverage, execution, and defect-oriented reports. QAira exposes the same evidence chain while allowing runs to remain reusable across release and Sprint views.
- Azure Test Plans describes end-to-end links among requirements, builds, tests, and bugs. QAira's derivation layer therefore joins records as a graph rather than assuming a rigid Release → Sprint → Cycle folder tree.
- GitHub deployment environments distinguish automated protection rules from required human reviewers. QAira similarly keeps deterministic evidence gates and AI explanations separate from final human approval.

## Readiness model

The visible score is an attention aid, not an approval:

- Requirement coverage: 25%
- Execution completion: 20%
- Latest-result pass rate: 35%
- Defect containment: 20%

Hard evidence caps prevent a strong average from hiding a material gap:

- insufficient requirement, test, or execution evidence: maximum 49
- uncovered P1/P2 requirement: maximum 69
- blocked latest result: maximum 59
- open critical defect: maximum 39

Evidence confidence is shown separately from readiness. It weights requirement links (40%), executed planned cases (40%), and bug traceability links (20%). Zero bugs do not reduce confidence.

Default gates are intentionally legible in the UI: no uncovered P1/P2 requirements, at least 95% execution completion, at least 90% pass rate, zero open critical bugs, zero blocked latest results, and result evidence no older than 14 days. These are product defaults rather than hidden AI policy and can later become a permissioned project configuration.

## AI boundary

“Explain with AI” reuses QAira's read-only, release-scoped quality-insight endpoint. It cites the Jira records behind each finding, exposes limitations and provenance, and recommends human review actions. It cannot change issues, links, tests, runs, gates, or the final release decision. Sprint-only page filtering remains deterministic until the backend insight contract supports Sprint as a first-class scope.

## Feature expectations

- A user can switch between all releases and a Jira Fix Version, then optionally narrow to a compatible Sprint.
- Metrics use the latest result per test case so reruns do not inflate pass or completion counts.
- Scoped bugs are included through Fix Version/Sprint fields or trace links to a requirement, test case, or run.
- Every requirement hotspot and run supports direct drilldown to its existing QAira workspace.
- Empty scope and missing evidence produce an explicit insufficient-evidence state, never a misleading green score.
- Layouts reflow at tablet and phone widths, include focus states and reduced-motion handling, and have explicit dark-theme treatment.

## Architecture

`lib/releaseReadiness.ts` is a pure derivation layer. It owns normalization, scope composition, graph joins, metrics, gates, decision state, and hotspot ranking. `ReleaseReadinessDashboard.tsx` owns orchestration and navigation. Presentational functions and the dedicated stylesheet own rendering. This separation keeps policy testable and allows a future PDF/export surface or release-gate API to consume the same model without coupling it to React.
