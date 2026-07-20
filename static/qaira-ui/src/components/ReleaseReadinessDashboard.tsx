import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useCurrentProject } from "../hooks/useCurrentProject";
import { useFeatureFlags } from "../hooks/useFeatureFlags";
import { useWorkspaceData } from "../hooks/useWorkspaceData";
import { api } from "../lib/api";
import { areFeatureFlagsEnabled } from "../lib/featureFlags";
import { hasPermission } from "../lib/permissions";
import {
  deriveReleaseReadiness,
  releaseReadinessScopeOptions,
  type ReadinessGateState
} from "../lib/releaseReadiness";
import type { ExecutionResult } from "../types";
import { AiInsightPreviewDialog, type AiPreviewFinding } from "./AiInsightPreviewDialog";
import { RefreshIcon, SparkIcon } from "./AppIcons";
import { ProgressMeter } from "./ProgressMeter";
import { StatusBadge } from "./StatusBadge";
import "./ReleaseReadinessDashboard.css";

type ReadinessView = "brief" | "traceability" | "execution";

const dateTimeFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit"
});

const latestResultMap = (results: ExecutionResult[]) => {
  const latest = new Map<string, ExecutionResult>();
  results.forEach((result) => {
    const key = `${result.execution_id}:${result.test_case_id}`;
    const current = latest.get(key);
    const currentTime = current?.created_at ? new Date(current.created_at).getTime() || 0 : 0;
    const nextTime = result.created_at ? new Date(result.created_at).getTime() || 0 : 0;
    if (!current || nextTime >= currentTime) latest.set(key, result);
  });
  return latest;
};

function GateIcon({ state }: { state: ReadinessGateState }) {
  return (
    <span aria-hidden="true" className={`readiness-gate-icon is-${state}`}>
      {state === "pass" ? "✓" : state === "block" ? "!" : "·"}
    </span>
  );
}

function ScopeSelect({
  label,
  value,
  options,
  emptyLabel,
  onChange
}: {
  label: string;
  value: string;
  options: string[];
  emptyLabel: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="readiness-scope-field">
      <span>{label}</span>
      <select onChange={(event) => onChange(event.target.value)} value={value}>
        <option value="">{emptyLabel}</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function MetricCard({
  label,
  value,
  detail,
  tone,
  progress
}: {
  label: string;
  value: string;
  detail: string;
  tone: "blue" | "green" | "amber" | "red";
  progress?: number;
}) {
  return (
    <article className={`readiness-metric-card is-${tone}`}>
      <span className="readiness-metric-label">{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
      {typeof progress === "number" ? <span className="readiness-mini-meter"><i style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} /></span> : null}
    </article>
  );
}

export function ReleaseReadinessDashboard() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const featureFlagsQuery = useFeatureFlags(Boolean(session));
  const [projectId] = useCurrentProject();
  const [release, setRelease] = useState("");
  const [sprint, setSprint] = useState("");
  const [activeView, setActiveView] = useState<ReadinessView>("brief");
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const workspace = useWorkspaceData({
    users: false,
    roles: false,
    projectMembers: false,
    appTypes: false,
    testSuites: false
  });
  const projects = workspace.projects.data || [];
  const activeProjectId = String(projectId || projects[0]?.id || "");
  const selectedProject = projects.find((project) => String(project.id) === activeProjectId) || null;
  useEffect(() => {
    setRelease("");
    setSprint("");
  }, [activeProjectId]);
  const requirements = useMemo(
    () => (workspace.requirements.data || []).filter((requirement) => String(requirement.project_id) === activeProjectId),
    [activeProjectId, workspace.requirements.data]
  );
  const executions = useMemo(
    () => (workspace.executions.data || []).filter((execution) => String(execution.project_id) === activeProjectId),
    [activeProjectId, workspace.executions.data]
  );
  const executionIds = useMemo(() => new Set(executions.map((execution) => execution.id)), [executions]);
  const results = useMemo(
    () => (workspace.executionResults.data || []).filter((result) => executionIds.has(result.execution_id)),
    [executionIds, workspace.executionResults.data]
  );
  const testCases = workspace.testCases.data || [];
  const issues = workspace.issues.data || [];
  const scopeOptions = useMemo(
    () => releaseReadinessScopeOptions(requirements, executions, issues),
    [executions, issues, requirements]
  );
  const sprintOptions = useMemo(() => {
    if (!release) return scopeOptions.sprints;
    const matchesRelease = (value: string | null | undefined) => String(value || "").trim().toLowerCase() === release.trim().toLowerCase();
    return releaseReadinessScopeOptions(
      requirements.filter((requirement) => matchesRelease(requirement.fix_version || requirement.release)),
      executions.filter((execution) => matchesRelease(execution.release)),
      issues.filter((issue) => matchesRelease(issue.fix_version || issue.release))
    ).sprints;
  }, [executions, issues, release, requirements, scopeOptions.sprints]);
  const model = useMemo(() => deriveReleaseReadiness({
    release,
    sprint,
    requirements,
    testCases,
    executions,
    executionResults: results,
    issues
  }), [executions, issues, release, requirements, results, sprint, testCases]);
  const canUseAi = hasPermission(session, "quality_insight.view")
    && areFeatureFlagsEnabled(featureFlagsQuery.data, ["qaira.ai.quality_insights"]);
  const qualityInsightPreview = useMutation({
    mutationFn: ({ activeProject, activeRelease }: { activeProject: string; activeRelease: string }) => api.ai.qualityInsights({
      project_id: activeProject,
      ...(activeRelease ? { release: activeRelease } : {})
    })
  });
  const aiFindings = useMemo<AiPreviewFinding[]>(() => (qualityInsightPreview.data?.insights || []).map((insight) => ({
    id: insight.id,
    title: insight.title,
    severity: insight.severity,
    description: insight.explanation,
    action: insight.recommended_action,
    meta: `${insight.evidence.length} linked Jira record${insight.evidence.length === 1 ? "" : "s"}`,
    evidence: insight.evidence.map((item) => item.display_id || item.id).filter(Boolean)
  })), [qualityInsightPreview.data]);
  const runResultMap = useMemo(() => latestResultMap(model.executionResults), [model.executionResults]);
  const executionSummaries = useMemo(() => model.executions
    .map((execution) => {
      const executionResults = [...runResultMap.values()].filter((result) => result.execution_id === execution.id);
      return {
        execution,
        total: executionResults.length,
        passed: executionResults.filter((result) => result.status === "passed").length,
        failed: executionResults.filter((result) => result.status === "failed").length,
        blocked: executionResults.filter((result) => result.status === "blocked").length,
        running: executionResults.filter((result) => result.status === "running").length
      };
    })
    .sort((left, right) => {
      const leftTime = new Date(left.execution.ended_at || left.execution.started_at || left.execution.created_at || 0).getTime() || 0;
      const rightTime = new Date(right.execution.ended_at || right.execution.started_at || right.execution.created_at || 0).getTime() || 0;
      return rightTime - leftTime;
    }), [model.executions, runResultMap]);
  const loading = workspace.requirements.isPending
    || workspace.testCases.isPending
    || workspace.executions.isPending
    || workspace.executionResults.isPending
    || workspace.issues.isPending;
  const scoreStyle = {
    "--readiness-score": `${model.metrics.readinessScore * 3.6}deg`
  } as CSSProperties;
  const scopeLabel = [release || "All releases", sprint || "All sprints"].join(" · ");

  const openAiBrief = () => {
    setIsAiOpen(true);
    qualityInsightPreview.reset();
    if (activeProjectId) qualityInsightPreview.mutate({ activeProject: activeProjectId, activeRelease: release });
  };

  const refreshEvidence = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        workspace.requirements.refetch(),
        workspace.testCases.refetch(),
        workspace.executions.refetch(),
        workspace.executionResults.refetch(),
        workspace.issues.refetch()
      ]);
    } finally {
      setIsRefreshing(false);
    }
  };

  if (!activeProjectId) {
    return <div className="page-content page-content--overview"><div className="empty-state compact">Select a Jira project to review release readiness.</div></div>;
  }

  return (
    <div className="page-content page-content--overview readiness-page">
      <header className="readiness-header">
        <div className="readiness-title-copy">
          <p className="readiness-eyebrow">Release decision room</p>
          <h1>Release readiness</h1>
          <p>Turn Jira scope, QAira traceability, latest test results, and linked bugs into a reviewable decision brief. Scores guide attention; people own the decision.</p>
        </div>
        <div className="readiness-header-actions">
          {canUseAi ? (
            <button className="primary-button compact" disabled={qualityInsightPreview.isPending} onClick={openAiBrief} type="button">
              <SparkIcon />
              <span>{qualityInsightPreview.isPending ? "Reviewing…" : "Explain with AI"}</span>
            </button>
          ) : null}
          <button aria-label="Refresh readiness evidence" className={`ghost-button compact readiness-refresh${isRefreshing ? " is-loading" : ""}`} disabled={isRefreshing} onClick={refreshEvidence} title="Refresh readiness evidence" type="button">
            <RefreshIcon />
            <span>{isRefreshing ? "Refreshing…" : "Refresh"}</span>
          </button>
        </div>
      </header>

      <section aria-label="Release scope" className="readiness-scope-bar">
        <div className="readiness-scope-heading">
          <span className="readiness-live-dot" />
          <div><strong>Jira-native scope</strong><small>Fix Version and Sprint stay the source of truth.</small></div>
        </div>
        <div className="readiness-scope-controls">
          <ScopeSelect emptyLabel="All releases" label="Fix Version" onChange={(value) => { setRelease(value); setSprint(""); }} options={scopeOptions.releases} value={release} />
          <ScopeSelect emptyLabel="All sprints" label="Sprint" onChange={setSprint} options={sprintOptions} value={sprint} />
          {release || sprint ? <button className="readiness-clear-scope" onClick={() => { setRelease(""); setSprint(""); }} type="button">Clear scope</button> : null}
        </div>
      </section>

      {loading ? (
        <div className="readiness-loading" role="status"><span /><strong>Building the evidence graph…</strong></div>
      ) : (
        <>
          <section className={`readiness-decision is-${model.decision.state}`}>
            <div className="readiness-decision-copy">
              <div className="readiness-decision-status"><span />{model.decision.label}</div>
              <h2>{model.decision.summary}</h2>
              <p>{model.decision.primaryAction}</p>
              <div className="readiness-decision-chips">
                <span>{scopeLabel}</span>
                <span>{model.metrics.openCriticalBugCount} critical bugs</span>
                <span>{model.metrics.blockedCount} blocked tests</span>
                <span>{model.metrics.highPriorityUncoveredCount} priority gaps</span>
              </div>
            </div>
            <div className="readiness-score" style={scoreStyle}>
              <div><span>Readiness</span><strong>{model.metrics.readinessScore}</strong><small>out of 100</small></div>
            </div>
            <div className="readiness-confidence">
              <span>Evidence confidence <strong>{model.metrics.confidence}%</strong></span>
              <i><em style={{ width: `${model.metrics.confidence}%` }} /></i>
              <small>Coverage 40% · execution 40% · bug links 20%</small>
              <details className="readiness-method">
                <summary>How the readiness score works</summary>
                <p>Coverage 25% · completion 20% · pass rate 35% · defect containment 20%. Missing evidence, P1/P2 gaps, blocked tests, and critical bugs cap the score.</p>
              </details>
            </div>
          </section>

          <section aria-label="Readiness metrics" className="readiness-metric-grid">
            <MetricCard detail={`${model.metrics.coveredRequirementCount} of ${model.metrics.requirementCount} requirements linked`} label="Requirement coverage" progress={model.metrics.coverage} tone={model.metrics.coverage >= 90 ? "green" : "amber"} value={`${model.metrics.coverage}%`} />
            <MetricCard detail={`${model.metrics.executedCaseCount} of ${model.metrics.plannedCaseCount} cases completed`} label="Execution completion" progress={model.metrics.completion} tone={model.metrics.completion >= 95 ? "green" : "blue"} value={`${model.metrics.completion}%`} />
            <MetricCard detail={`${model.metrics.failedCount} failed · ${model.metrics.blockedCount} blocked`} label="Latest-result pass rate" progress={model.metrics.passRate} tone={model.metrics.passRate >= 90 ? "green" : "red"} value={`${model.metrics.passRate}%`} />
            <MetricCard detail={`${model.metrics.openCriticalBugCount} critical · ${model.metrics.openHighBugCount} high`} label="Open scoped bugs" tone={model.metrics.openCriticalBugCount ? "red" : model.metrics.openHighBugCount ? "amber" : "green"} value={String(model.metrics.openBugCount)} />
          </section>

          <nav aria-label="Readiness report views" className="readiness-view-tabs">
            {([
              ["brief", "Decision brief", "Gates and leading risks"],
              ["traceability", "Traceability", "Requirement-to-evidence matrix"],
              ["execution", "Execution evidence", "Runs and latest results"]
            ] as const).map(([id, label, detail]) => (
              <button aria-current={activeView === id ? "page" : undefined} className={activeView === id ? "is-active" : ""} key={id} onClick={() => setActiveView(id)} type="button">
                <strong>{label}</strong><span>{detail}</span>
              </button>
            ))}
          </nav>

          {activeView === "brief" ? (
            <div className="readiness-brief-grid">
              <section className="readiness-panel readiness-gates-panel">
                <header><div><p className="readiness-section-kicker">Release controls</p><h2>Evidence gates</h2><span>Transparent default thresholds; no hidden AI judgment.</span></div><small>{model.gates.filter((gate) => gate.state === "pass").length}/{model.gates.length} passing</small></header>
                <div className="readiness-gate-list">
                  {model.gates.map((gate) => (
                    <article key={gate.id}>
                      <GateIcon state={gate.state} />
                      <div><strong>{gate.label}</strong><p>{gate.detail}</p><small>{gate.expectation}</small></div>
                      <span className={`readiness-gate-value is-${gate.state}`}>{gate.actual}</span>
                    </article>
                  ))}
                </div>
              </section>

              <aside className="readiness-panel readiness-ai-panel">
                <div className="readiness-ai-mark"><SparkIcon size={22} /></div>
                <p className="readiness-section-kicker">Explainable assist</p>
                <h2>Ask what changed the decision</h2>
                <p>AI summarizes release-scoped Jira evidence, cites the records behind each signal, and proposes review actions. It cannot approve, reject, or mutate the release.</p>
                <div className="readiness-ai-facts"><span>Read only</span><span>Cited evidence</span><span>Human approval</span></div>
                {canUseAi ? <button className="ghost-button compact" onClick={openAiBrief} type="button"><SparkIcon /><span>Open evidence brief</span></button> : <small>Quality insights are not enabled for your current role or project.</small>}
              </aside>

              <section className="readiness-panel readiness-path-panel">
                <header><div><p className="readiness-section-kicker">Traceability path</p><h2>Where confidence is lost</h2><span>Follow scope from intent to release evidence.</span></div></header>
                <div className="readiness-path">
                  {[
                    { label: "Requirements", value: model.metrics.requirementCount, detail: "Jira scope", to: "/requirements" },
                    { label: "Covered", value: model.metrics.coveredRequirementCount, detail: `${model.metrics.coverage}% mapped`, to: "/test-cases" },
                    { label: "Planned tests", value: model.metrics.plannedCaseCount, detail: "Linked cases", to: "/test-cases" },
                    { label: "Executed", value: model.metrics.executedCaseCount, detail: `${model.metrics.completion}% complete`, to: "/executions" },
                    { label: "Passing", value: model.metrics.passedCount, detail: `${model.metrics.passRate}% pass rate`, to: "/executions" },
                    { label: "Open bugs", value: model.metrics.openBugCount, detail: `${model.metrics.openCriticalBugCount} critical`, to: "/issues" }
                  ].map((step, index) => (
                    <button key={step.label} onClick={() => navigate(step.to)} type="button">
                      <span>{index + 1}</span><strong>{step.value}</strong><b>{step.label}</b><small>{step.detail}</small>
                    </button>
                  ))}
                </div>
              </section>

              <section className="readiness-panel readiness-risk-panel">
                <header><div><p className="readiness-section-kicker">Priority queue</p><h2>Requirements needing attention</h2><span>Ranked by priority, missing coverage, latest failures, blockers, and open linked bugs.</span></div><button onClick={() => setActiveView("traceability")} type="button">View matrix →</button></header>
                <div className="readiness-risk-list">
                  {model.hotspots.slice(0, 5).map((hotspot) => (
                    <button key={hotspot.id} onClick={() => navigate(`/requirements?requirement=${encodeURIComponent(hotspot.id)}`)} type="button">
                      <span className={`readiness-risk-score is-${hotspot.riskLabel.toLowerCase()}`}>{hotspot.riskScore}</span>
                      <div><strong>{hotspot.displayId} · {hotspot.title}</strong><small>{hotspot.reasons.join(" · ")}</small></div>
                      <span>{hotspot.coverageCount} tests · {hotspot.openBugCount} bugs</span>
                    </button>
                  ))}
                  {!model.hotspots.length ? <div className="readiness-empty">No requirements are mapped to this scope yet.</div> : null}
                </div>
              </section>
            </div>
          ) : null}

          {activeView === "traceability" ? (
            <section className="readiness-panel readiness-matrix-panel">
              <header><div><p className="readiness-section-kicker">Traceability analysis</p><h2>Requirement → tests → latest evidence → bugs</h2><span>One row per Jira requirement, ranked by explainable risk.</span></div><div className="readiness-legend"><span><i className="is-pass" />Healthy</span><span><i className="is-warning" />Review</span><span><i className="is-block" />Blocked</span></div></header>
              <div className="readiness-table-wrap">
                <table className="readiness-matrix">
                  <thead><tr><th>Requirement</th><th>Priority</th><th>Coverage</th><th>Latest results</th><th>Open bugs</th><th>Risk</th></tr></thead>
                  <tbody>
                    {model.hotspots.map((hotspot) => (
                      <tr
                        key={hotspot.id}
                        onClick={() => navigate(`/requirements?requirement=${encodeURIComponent(hotspot.id)}`)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            navigate(`/requirements?requirement=${encodeURIComponent(hotspot.id)}`);
                          }
                        }}
                        tabIndex={0}
                      >
                        <td><strong>{hotspot.displayId}</strong><span>{hotspot.title}</span></td>
                        <td>{hotspot.priority ? `P${hotspot.priority}` : "—"}</td>
                        <td><strong>{hotspot.coverageCount}</strong><span>{hotspot.executedCount} executed</span></td>
                        <td><div className="readiness-result-pills"><span className="is-pass">{hotspot.passedCount} passed</span><span className="is-fail">{hotspot.failedCount} failed</span><span className="is-blocked">{hotspot.blockedCount} blocked</span></div></td>
                        <td><strong>{hotspot.openBugCount}</strong><span>{hotspot.criticalBugCount} critical</span></td>
                        <td><span className={`readiness-risk-pill is-${hotspot.riskLabel.toLowerCase()}`}>{hotspot.riskScore} · {hotspot.riskLabel}</span><small>{hotspot.reasons.join(" · ")}</small></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!model.hotspots.length ? <div className="readiness-empty">No requirement traceability is available for {scopeLabel}.</div> : null}
              </div>
            </section>
          ) : null}

          {activeView === "execution" ? (
            <div className="readiness-execution-layout">
              <section className="readiness-panel readiness-execution-panel">
                <header><div><p className="readiness-section-kicker">Run evidence</p><h2>Scoped execution history</h2><span>Latest result per case within each run; reruns do not inflate progress.</span></div><small>{model.executions.length} run{model.executions.length === 1 ? "" : "s"}</small></header>
                <div className="readiness-run-list">
                  {executionSummaries.map(({ execution, total, passed, failed, blocked, running }) => {
                    const passRate = total ? Math.round((passed / total) * 100) : 0;
                    return (
                      <button key={execution.id} onClick={() => navigate(`/executions?execution=${encodeURIComponent(execution.id)}`)} type="button">
                        <div className="readiness-run-head"><div><strong>{execution.display_id || execution.name || "Unnamed run"}</strong><span>{execution.name && execution.display_id ? execution.name : `${execution.trigger || "manual"} execution`}</span></div><StatusBadge value={execution.status} /></div>
                        <ProgressMeter detail={`${passed} passed · ${failed} failed · ${blocked} blocked · ${running} running`} label="Pass rate" tone={failed || blocked ? "danger" : "success"} value={passRate} />
                        <footer><span>{execution.release || "No release"} · {execution.sprint || "No sprint"}</span><span>{execution.ended_at || execution.started_at ? dateTimeFormatter.format(new Date(execution.ended_at || execution.started_at || "")) : "Not started"}</span></footer>
                      </button>
                    );
                  })}
                  {!executionSummaries.length ? <div className="readiness-empty">No executions match the selected release and sprint.</div> : null}
                </div>
              </section>
              <aside className="readiness-panel readiness-result-summary">
                <p className="readiness-section-kicker">Latest result set</p><h2>{model.metrics.plannedCaseCount} planned cases</h2>
                <div className="readiness-result-stack">
                  {[
                    ["Passed", model.metrics.passedCount, "pass"],
                    ["Failed", model.metrics.failedCount, "fail"],
                    ["Blocked", model.metrics.blockedCount, "blocked"],
                    ["Running", model.metrics.runningCount, "running"],
                    ["Not run", model.metrics.notRunCount, "not-run"]
                  ].map(([label, count, tone]) => <div key={label}><span><i className={`is-${tone}`} />{label}</span><strong>{count}</strong></div>)}
                </div>
                <small>Evidence last updated {model.latestEvidenceAt ? dateTimeFormatter.format(new Date(model.latestEvidenceAt)) : "never"}.</small>
              </aside>
            </div>
          ) : null}
        </>
      )}

      <AiInsightPreviewDialog
        assuranceTitle="Release evidence grounding"
        emptyMessage="No deterministic release risk signal matched. This is not a release guarantee."
        error={qualityInsightPreview.error instanceof Error ? qualityInsightPreview.error.message : null}
        eyebrow="Release readiness"
        findings={aiFindings}
        gaps={[
          ...(sprint ? ["The AI endpoint evaluates Jira release scope; the Sprint filter remains visible in the deterministic page metrics."] : []),
          ...(!release && scopeOptions.releases.length ? ["Select a Fix Version for a release-specific AI evidence brief."] : [])
        ]}
        limitations={qualityInsightPreview.data?.limitations || []}
        loading={qualityInsightPreview.isPending}
        onClose={() => setIsAiOpen(false)}
        open={isAiOpen}
        recommendedActions={aiFindings.map((finding) => finding.action).filter((action): action is string => Boolean(action))}
        response={qualityInsightPreview.data}
        signals={qualityInsightPreview.data ? [
          { label: "Scope", value: release || "Project", tone: release ? "positive" : "neutral" },
          { label: "Evidence", value: `${qualityInsightPreview.data.provenance.evidence.length} references`, tone: qualityInsightPreview.data.provenance.evidence.length ? "positive" : "warning" },
          { label: "Decision", value: "Human owned", tone: "warning" }
        ] : []}
        subtitle={`Read-only review for ${selectedProject?.name || "the selected Jira project"}${release ? ` · ${release}` : ""}.`}
        summary="Qaira applies transparent rules to visible Jira fields, issue links, properties, and execution evidence. It explains risk and suggests review work; it does not decide release readiness."
        title="AI release evidence brief"
      />
    </div>
  );
}
