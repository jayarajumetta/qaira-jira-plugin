import type { ReactNode } from "react";

export function TileBrowserPane({
  children,
  className = ""
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={["tile-browser-pane", className].filter(Boolean).join(" ")}>
      <div className="tile-browser-pane-scroll">
        {children}
      </div>
    </div>
  );
}
