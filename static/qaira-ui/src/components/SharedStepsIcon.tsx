export function SharedStepsIcon({
  size = 16,
  strokeWidth = 1.8,
  className = ""
}: {
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      viewBox="0 0 24 24"
      width={size}
    >
      <circle cx="7" cy="8" r="2.5" />
      <circle cx="17" cy="8" r="2.5" />
      <circle cx="12" cy="17" r="2.5" />
      <path d="m9.2 9.4 2 5.2" />
      <path d="m14.8 9.4-2 5.2" />
      <path d="M9.5 8h5" />
    </svg>
  );
}
