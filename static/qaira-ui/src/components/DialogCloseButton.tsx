type DialogCloseButtonProps = {
  disabled?: boolean;
  label?: string;
  onClick: () => void;
};

/** Compact, accessible close control shared by the app's full-screen dialogs. */
export function DialogCloseButton({
  disabled = false,
  label = "Close dialog",
  onClick
}: DialogCloseButtonProps) {
  return (
    <button
      aria-label={label}
      className="ghost-button dialog-close-button"
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      <svg
        aria-hidden="true"
        fill="none"
        height="18"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
        viewBox="0 0 24 24"
        width="18"
      >
        <path d="M6 6l12 12M18 6 6 18" />
      </svg>
    </button>
  );
}
