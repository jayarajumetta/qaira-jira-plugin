import type { ReactNode } from "react";

export type DetailSectionTab<T extends string> = {
  value: T;
  label: string;
  icon: ReactNode;
  count?: number;
};

export function DetailSectionTabs<T extends string>({
  activeTab,
  ariaLabel,
  items,
  onChange
}: {
  activeTab: T;
  ariaLabel: string;
  items: Array<DetailSectionTab<T>>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="detail-section-tabs" role="tablist" aria-label={ariaLabel}>
      {items.map((item) => (
        <button
          aria-selected={activeTab === item.value}
          className={activeTab === item.value ? "detail-section-tab is-active" : "detail-section-tab"}
          key={item.value}
          onClick={() => onChange(item.value)}
          role="tab"
          type="button"
        >
          <span className="detail-section-tab-icon">{item.icon}</span>
          <span>{item.label}</span>
          {typeof item.count === "number" ? <span className="detail-section-tab-count">{item.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
