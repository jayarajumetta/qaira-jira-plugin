export type RunStartMode = "manual" | "local" | "remote";

const RUN_TYPE_OPTIONS: Array<{
  value: RunStartMode;
  label: string;
  caption: string;
}> = [
  { value: "manual", label: "Create Manual Run", caption: "Human-led execution" },
  { value: "local", label: "Create Local Run", caption: "Local Test Engine" },
  { value: "remote", label: "Create Remote Run", caption: "Remote Test Engine" }
];

export function RunTypeSelector({
  value,
  onChange,
  disabled = false,
  className = ""
}: {
  value: RunStartMode;
  onChange: (value: RunStartMode) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={["run-type-selector", className].filter(Boolean).join(" ")} role="group" aria-label="Run type">
      {RUN_TYPE_OPTIONS.map((option) => (
        <button
          aria-pressed={value === option.value}
          className={value === option.value ? "run-type-option is-active" : "run-type-option"}
          disabled={disabled}
          key={option.value}
          onClick={() => onChange(option.value)}
          type="button"
        >
          <strong>{option.label}</strong>
          <span>{option.caption}</span>
        </button>
      ))}
    </div>
  );
}
