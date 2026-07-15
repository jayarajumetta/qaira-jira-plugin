import type { ReactNode } from "react";

export function Panel({
  title: _title,
  titleVariant: _titleVariant = "heading",
  subtitle: _subtitle,
  actions,
  className = "",
  children
}: {
  title: string;
  titleVariant?: "heading" | "eyebrow";
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`panel card ${className}`.trim()}>
      {actions ? <div className="panel-actions-inline">{actions}</div> : null}
      {children}
    </section>
  );
}
