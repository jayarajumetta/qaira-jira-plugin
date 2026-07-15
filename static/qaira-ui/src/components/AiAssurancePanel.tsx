import { SparkIcon } from "./AppIcons";
import type { AiAssuranceSignal } from "../lib/aiAssurance";
import "./AiAssurancePanel.css";

type AiReviewState = "review-required" | "pending-review" | "human-reviewed" | "evidence-forming";

const REVIEW_STATE_LABEL: Record<AiReviewState, string> = {
  "review-required": "Human review required",
  "pending-review": "Review pending",
  "human-reviewed": "Human reviewed",
  "evidence-forming": "Evidence forming"
};

export function AiAssurancePanel({
  title,
  summary,
  score,
  scoreLabel,
  provenance,
  reviewState,
  signals,
  gaps,
  compact = false
}: {
  title: string;
  summary: string;
  score: number;
  scoreLabel: string;
  provenance: string;
  reviewState: AiReviewState;
  signals: AiAssuranceSignal[];
  gaps: string[];
  compact?: boolean;
}) {
  const normalizedScore = Math.max(0, Math.min(100, Math.round(score)));
  const scoreTone = normalizedScore >= 80 ? "positive" : normalizedScore >= 55 ? "neutral" : "warning";

  return (
    <aside className={`ai-assurance-panel${compact ? " is-compact" : ""}`} aria-label={`${title} assurance`}> 
      <div className="ai-assurance-head">
        <span className="ai-assurance-icon" aria-hidden="true"><SparkIcon /></span>
        <div className="ai-assurance-title">
          <span>AI assurance</span>
          <strong>{title}</strong>
        </div>
        <span className={`ai-assurance-review-state ${reviewState}`}>{REVIEW_STATE_LABEL[reviewState]}</span>
      </div>

      <p className="ai-assurance-summary">{summary}</p>

      <div className="ai-assurance-score-row">
        <div>
          <strong>{normalizedScore}%</strong>
          <span>{scoreLabel}</span>
        </div>
        <div className="ai-assurance-meter" aria-label={`${scoreLabel}: ${normalizedScore}%`} role="progressbar" aria-valuemax={100} aria-valuemin={0} aria-valuenow={normalizedScore}>
          <span className={scoreTone} style={{ width: `${normalizedScore}%` }} />
        </div>
      </div>

      <div className="ai-assurance-signals" aria-label="Decision signals">
        {signals.map((signal) => (
          <span className={`ai-assurance-signal ${signal.tone || "neutral"}`} key={`${signal.label}-${signal.value}`}>
            <small>{signal.label}</small>
            <b>{signal.value}</b>
          </span>
        ))}
      </div>

      <div className="ai-assurance-foot">
        <span><b>Basis:</b> {provenance}</span>
        <span>This percentage is a transparent readiness check, not model certainty.</span>
      </div>

      {gaps.length ? (
        <details className="ai-assurance-gaps">
          <summary>{gaps.length} review item{gaps.length === 1 ? "" : "s"}</summary>
          <ul>
            {gaps.map((gap) => <li key={gap}>{gap}</li>)}
          </ul>
        </details>
      ) : (
        <div className="ai-assurance-ready">No readiness gaps detected by the local check. A person still owns the final decision.</div>
      )}
    </aside>
  );
}
