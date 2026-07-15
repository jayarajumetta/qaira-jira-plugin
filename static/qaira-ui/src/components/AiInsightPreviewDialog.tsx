import type { AiAssistedPreviewBase } from "../types";
import type { AiAssuranceSignal } from "../lib/aiAssurance";
import { useDialogFocus } from "../hooks/useDialogFocus";
import { AiAssurancePanel } from "./AiAssurancePanel";
import { DialogCloseButton } from "./DialogCloseButton";
import { SparkIcon } from "./AppIcons";
import "./AiInsightPreviewDialog.css";

export type AiPreviewFinding = {
  id: string;
  title: string;
  severity?: "info" | "low" | "medium" | "high" | string;
  description: string;
  action?: string | null;
  meta?: string | null;
  evidence?: string[];
};

type AiInsightPreviewDialogProps = {
  open: boolean;
  eyebrow: string;
  title: string;
  subtitle: string;
  assuranceTitle: string;
  response: AiAssistedPreviewBase | null | undefined;
  loading?: boolean;
  error?: string | null;
  summary?: string;
  signals?: AiAssuranceSignal[];
  gaps?: string[];
  findings?: AiPreviewFinding[];
  recommendedActions?: string[];
  limitations?: string[];
  emptyMessage?: string;
  onClose: () => void;
};

const normalizeSeverity = (value?: string) => {
  const normalized = String(value || "info").toLowerCase();
  return ["high", "medium", "low", "info"].includes(normalized) ? normalized : "info";
};

export function AiInsightPreviewDialog({
  open,
  eyebrow,
  title,
  subtitle,
  assuranceTitle,
  response,
  loading = false,
  error,
  summary,
  signals = [],
  gaps = [],
  findings = [],
  recommendedActions = [],
  limitations = [],
  emptyMessage = "No deterministic signal was returned for this scope.",
  onClose
}: AiInsightPreviewDialogProps) {
  const dialogRef = useDialogFocus<HTMLDivElement>({ active: open, onClose });

  if (!open) {
    return null;
  }

  const provenance = response?.provenance;
  const confidence = Math.round(Math.max(0, Math.min(1, provenance?.confidence ?? response?.confidence ?? 0)) * 100);
  const evidence = [...new Set(provenance?.evidence || [])];
  const generationMode = provenance?.generation_mode || response?.generation_mode || "deterministic";
  const provider = provenance?.provider || response?.integration?.name || "Qaira Jira-native assist";
  const provenanceLabel = `${provider} · ${generationMode} rules · ${evidence.length} evidence reference${evidence.length === 1 ? "" : "s"}`;
  const effectiveSignals = signals.length ? signals : [
    { label: "Generation", value: generationMode === "deterministic" ? "Deterministic" : generationMode, tone: "neutral" },
    { label: "Evidence", value: `${evidence.length} reference${evidence.length === 1 ? "" : "s"}`, tone: evidence.length ? "positive" : "warning" },
    { label: "Decision", value: "Human owned", tone: "warning" }
  ] satisfies AiAssuranceSignal[];
  const effectiveGaps = [...new Set([
    ...gaps,
    ...(response?.requires_human_review ? ["A person must verify the evidence and own the final Jira or release decision."] : [])
  ])];

  return (
    <div className="modal-backdrop modal-backdrop--scroll ai-insight-preview-backdrop" onClick={onClose} role="presentation">
      <div
        aria-labelledby="ai-insight-preview-title"
        aria-modal="true"
        className="modal-card ai-insight-preview-dialog"
        onClick={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="ai-insight-preview-header">
          <div>
            <p className="dialog-context-label">{eyebrow}</p>
            <h2 className="dialog-title" id="ai-insight-preview-title">{title}</h2>
            <p>{subtitle}</p>
          </div>
          <DialogCloseButton label={`Close ${title}`} onClick={onClose} />
        </header>

        <div className="ai-insight-preview-body">
          {loading ? (
            <div className="ai-insight-preview-state" role="status">
              <span className="ai-insight-preview-state-icon" aria-hidden="true"><SparkIcon /></span>
              <div>
                <strong>Reviewing Jira-native evidence…</strong>
                <span>Qaira is applying transparent rules. Nothing is being changed.</span>
              </div>
            </div>
          ) : error ? (
            <div className="ai-insight-preview-state is-error" role="alert">
              <div>
                <strong>Preview unavailable</strong>
                <span>{error}</span>
              </div>
            </div>
          ) : response ? (
            <>
              <AiAssurancePanel
                gaps={effectiveGaps}
                provenance={provenanceLabel}
                reviewState="review-required"
                score={confidence}
                scoreLabel="Evidence grounding"
                signals={effectiveSignals}
                summary={summary || "This read-only preview explains signals found in current Jira issues, links, properties, and result evidence."}
                title={assuranceTitle}
              />

              <div className="ai-insight-preview-boundary">
                <SparkIcon />
                <span><strong>Preview only.</strong> No Jira issue, link, property, attachment, test, run, or quality gate was changed.</span>
              </div>

              <section className="ai-insight-preview-section" aria-label="Explainable findings">
                <div className="ai-insight-preview-section-head">
                  <strong>Explainable findings</strong>
                  <span>{findings.length} signal{findings.length === 1 ? "" : "s"}</span>
                </div>
                {findings.length ? (
                  <div className="ai-insight-preview-findings">
                    {findings.map((finding) => (
                      <article className={`ai-insight-preview-finding severity-${normalizeSeverity(finding.severity)}`} key={finding.id}>
                        <div className="ai-insight-preview-finding-head">
                          <strong>{finding.title}</strong>
                          <span>{normalizeSeverity(finding.severity)}</span>
                        </div>
                        <p>{finding.description}</p>
                        {finding.meta ? <small>{finding.meta}</small> : null}
                        {finding.action ? <div className="ai-insight-preview-action"><b>Reviewer action</b><span>{finding.action}</span></div> : null}
                        {finding.evidence?.length ? (
                          <div className="ai-insight-preview-evidence-inline">
                            {finding.evidence.slice(0, 8).map((item) => <code key={item}>{item}</code>)}
                            {finding.evidence.length > 8 ? <span>+{finding.evidence.length - 8} more</span> : null}
                          </div>
                        ) : null}
                      </article>
                    ))}
                  </div>
                ) : <div className="empty-state compact">{emptyMessage}</div>}
              </section>

              {recommendedActions.length ? (
                <section className="ai-insight-preview-section">
                  <div className="ai-insight-preview-section-head"><strong>Recommended review sequence</strong></div>
                  <ol className="ai-insight-preview-list">
                    {recommendedActions.map((action) => <li key={action}>{action}</li>)}
                  </ol>
                </section>
              ) : null}

              <details className="ai-insight-preview-details">
                <summary>Provenance and evidence</summary>
                <dl>
                  <div><dt>Mode</dt><dd>{generationMode}</dd></div>
                  <div><dt>Provider</dt><dd>{provider}</dd></div>
                  <div><dt>Generated</dt><dd>{provenance?.generated_at || response.generated_at || "Unavailable"}</dd></div>
                  <div><dt>Request</dt><dd><code>{provenance?.request_id || response.request_id}</code></dd></div>
                  <div><dt>Input fingerprint</dt><dd><code>{provenance?.input_fingerprint || response.input_fingerprint}</code></dd></div>
                </dl>
                {evidence.length ? (
                  <div className="ai-insight-preview-evidence-list">
                    {evidence.map((item) => <code key={item}>{item}</code>)}
                  </div>
                ) : <p>No Jira evidence reference was returned for this preview.</p>}
                {response.fallback_reason ? <p>{response.fallback_reason}</p> : null}
              </details>

              {limitations.length ? (
                <details className="ai-insight-preview-details">
                  <summary>Limitations</summary>
                  <ul className="ai-insight-preview-list">
                    {limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
                  </ul>
                </details>
              ) : null}
            </>
          ) : (
            <div className="ai-insight-preview-state">
              <span>Run the preview to inspect current Jira-native evidence.</span>
            </div>
          )}
        </div>

        <footer className="ai-insight-preview-footer">
          <span>Human review remains authoritative.</span>
          <button className="primary-button" data-autofocus="true" onClick={onClose} type="button">Close preview</button>
        </footer>
      </div>
    </div>
  );
}
