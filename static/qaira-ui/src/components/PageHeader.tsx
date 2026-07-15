import type { ReactNode } from "react";

type PageHeaderMetaItem = {
  label: string;
  value: ReactNode;
};

export function PageHeader({
  eyebrow: _eyebrow,
  title: _title,
  description: _description,
  actions: _actions,
  meta: _meta,
  className: _className = ""
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  meta?: PageHeaderMetaItem[];
  className?: string;
}) {
  return null;
}
