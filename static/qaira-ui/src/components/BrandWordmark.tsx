export function BrandWordmark({
  variant = "wordmark",
  subtitle,
  className = ""
}: {
  variant?: "wordmark" | "mark";
  subtitle?: string;
  className?: string;
}) {
  const classes = ["qaira-brand-wordmark", variant === "mark" ? "is-mark-only" : "", className].filter(Boolean).join(" ");

  return (
    <div aria-label="QAira" className={classes}>
      <span aria-hidden="true" className="qaira-brand-q">Q</span>
      {variant === "wordmark" ? (
        <span className="qaira-brand-copy">
          <strong><span>Aira</span></strong>
          {subtitle ? <small>{subtitle}</small> : null}
        </span>
      ) : null}
    </div>
  );
}
