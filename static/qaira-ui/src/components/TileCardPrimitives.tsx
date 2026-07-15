import type { ReactNode } from "react";

export type TileCardTone = "neutral" | "info" | "success" | "warning" | "danger";

export function formatTileCardLabel(value: string | null | undefined, fallback: string) {
  const normalized = String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return fallback;
  }

  return normalized
    .split(" ")
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

export function getTileCardTone(value: string | null | undefined): TileCardTone {
  const normalized = String(value || "").trim().toLowerCase();

  if (!normalized) {
    return "neutral";
  }

  if (["failed", "error", "rejected", "critical"].some((token) => normalized.includes(token))) {
    return "danger";
  }

  if (["blocked", "abort", "hold", "warning", "stalled"].some((token) => normalized.includes(token))) {
    return "warning";
  }

  if (["passed", "completed", "complete", "done", "approved", "ready", "resolved", "success"].some((token) => normalized.includes(token))) {
    return "success";
  }

  if (["queued", "running", "active", "open", "progress", "review"].some((token) => normalized.includes(token))) {
    return "info";
  }

  return "neutral";
}

export function TileCardIconFrame({
  children,
  tone = "info",
  className = ""
}: {
  children: ReactNode;
  tone?: TileCardTone;
  className?: string;
}) {
  return <span aria-hidden="true" className={["record-card-icon", "tile-card-icon", `tone-${tone}`, className].filter(Boolean).join(" ")}>{children}</span>;
}

export function TileCardFact({
  children,
  label,
  title,
  tone = "neutral"
}: {
  children: ReactNode;
  label: string;
  title: string;
  tone?: TileCardTone;
}) {
  return (
    <span aria-label={title} className={`tile-card-fact tone-${tone}`} title={title}>
      <span aria-hidden="true" className="tile-card-fact-icon">
        {children}
      </span>
      <span className="tile-card-fact-label">{label}</span>
    </span>
  );
}

export function TileCardStatusIndicator({
  title,
  tone = "neutral",
  icon
}: {
  title: string;
  tone?: TileCardTone;
  icon?: ReactNode;
}) {
  return (
    <span aria-label={title} className={`tile-card-status tone-${tone}`} title={title}>
      {icon || <TileCardStatusToneIcon tone={tone} />}
    </span>
  );
}

function TileCardStatusToneIcon({ tone }: { tone: TileCardTone }) {
  if (tone === "success") {
    return (
      <TileCardIconShell>
        <path d="M6 12.5 10 16l8-8" />
      </TileCardIconShell>
    );
  }

  if (tone === "warning") {
    return (
      <TileCardIconShell>
        <circle cx="12" cy="12" r="8" />
        <path d="M8 12h8" />
      </TileCardIconShell>
    );
  }

  if (tone === "danger") {
    return (
      <TileCardIconShell>
        <path d="m8 8 8 8" />
        <path d="m16 8-8 8" />
      </TileCardIconShell>
    );
  }

  if (tone === "info") {
    return (
      <TileCardIconShell>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v4l3 2" />
      </TileCardIconShell>
    );
  }

  return (
    <TileCardIconShell>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" fill="currentColor" r="1.25" stroke="none" />
    </TileCardIconShell>
  );
}

function TileCardIconShell({ children }: { children: ReactNode }) {
  return (
    <svg aria-hidden="true" fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24" width="16">
      {children}
    </svg>
  );
}

export function TileCardSuiteIcon() {
  return (
    <TileCardIconShell>
      <path d="m12 4 8 4-8 4-8-4Z" />
      <path d="m4 12 8 4 8-4" />
      <path d="m4 16 8 4 8-4" />
    </TileCardIconShell>
  );
}

export function TileCardCaseIcon() {
  return (
    <TileCardIconShell>
      <rect height="14" rx="2" width="14" x="5" y="5" />
      <path d="M9 10h6" />
      <path d="M9 14h6" />
    </TileCardIconShell>
  );
}

export function TileCardRequirementIcon() {
  return (
    <TileCardIconShell>
      <rect height="12.5" rx="2" width="12" x="6" y="8" />
      <circle cx="12" cy="5.5" r="2.15" />
      <path d="M12 2.25V1.5" />
      <path d="M12 9.5V8.75" />
      <path d="M8 5.5h1.15" />
      <path d="M14.85 5.5H16" />
      <path d="m9.6 3.1-.8-.8" />
      <path d="m15.2 8.2-.8-.8" />
      <path d="m14.4 3.1.8-.8" />
      <path d="m8.8 8.2.8-.8" />
      <rect height="1.8" rx="0.35" width="1.8" x="8.6" y="11.35" />
      <rect height="1.8" rx="0.35" width="1.8" x="8.6" y="15.15" />
      <path d="M12.4 12.25h3.2" />
      <path d="M12.4 16.05h3.2" />
    </TileCardIconShell>
  );
}

export function TileCardPriorityIcon() {
  return (
    <TileCardIconShell>
      <path d="M7 20V5" />
      <path d="M7 5h10l-2 4 2 4H7" />
    </TileCardIconShell>
  );
}

export function TileCardStepsIcon() {
  return (
    <TileCardIconShell>
      <path d="M8 7h10" />
      <path d="M8 12h10" />
      <path d="M8 17h10" />
      <circle cx="5" cy="7" fill="currentColor" r="1" stroke="none" />
      <circle cx="5" cy="12" fill="currentColor" r="1" stroke="none" />
      <circle cx="5" cy="17" fill="currentColor" r="1" stroke="none" />
    </TileCardIconShell>
  );
}

export function TileCardLinkIcon() {
  return (
    <TileCardIconShell>
      <path d="M10 13a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 0 0-7.07-7.07L10.8 5.12" />
      <path d="M14 11a5 5 0 0 0-7.07 0L4.8 13.12a5 5 0 1 0 7.07 7.07L13.2 18.9" />
    </TileCardIconShell>
  );
}

export function TileCardRunsIcon() {
  return (
    <TileCardIconShell>
      <path d="M5 12a7 7 0 0 1 7-7" />
      <path d="M19 12a7 7 0 0 1-7 7" />
      <path d="m13 8 4 0 0-4" />
      <path d="m11 16-4 0 0 4" />
    </TileCardIconShell>
  );
}

export function TileCardHierarchyIcon() {
  return (
    <TileCardIconShell>
      <path d="M6 6h12" />
      <path d="M12 6v5" />
      <path d="M7 16h4" />
      <path d="M13 16h4" />
      <path d="M9 11v5" />
      <path d="M15 11v5" />
    </TileCardIconShell>
  );
}

export function TileCardProjectIcon() {
  return (
    <TileCardIconShell>
      <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6H10l2 2h6.5A2.5 2.5 0 0 1 21 10.5v8A2.5 2.5 0 0 1 18.5 21h-13A2.5 2.5 0 0 1 3 18.5z" />
      <path d="M9 12h6" />
      <path d="M9 16h4" />
    </TileCardIconShell>
  );
}

export function TileCardUsersIcon() {
  return (
    <TileCardIconShell>
      <path d="M16 20v-1.4a3.6 3.6 0 0 0-3.6-3.6H8.6A3.6 3.6 0 0 0 5 18.6V20" />
      <circle cx="10.5" cy="9" r="3" />
      <path d="M17 11a2.6 2.6 0 0 1 0 5" />
      <path d="M20 20v-1.1a3.2 3.2 0 0 0-2.4-3.1" />
    </TileCardIconShell>
  );
}

export function TileCardAppTypesIcon() {
  return (
    <TileCardIconShell>
      <rect height="5" rx="1.1" width="16" x="4" y="5" />
      <rect height="5" rx="1.1" width="16" x="4" y="14" />
      <path d="M8 7.5h.01" />
      <path d="M8 16.5h.01" />
      <path d="M14 7.5h4" />
      <path d="M14 16.5h4" />
    </TileCardIconShell>
  );
}
