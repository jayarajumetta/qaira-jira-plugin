import { Component, type ErrorInfo, type ReactNode } from "react";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

export function AppErrorState({
  error,
  title = "Something went wrong",
  fallbackMessage = "Qaira could not load this part of the workspace.",
  onRetry,
  compact = false
}: {
  error?: unknown;
  title?: string;
  fallbackMessage?: string;
  onRetry?: () => void;
  compact?: boolean;
}) {
  const technicalMessage = errorMessage(error, fallbackMessage);
  return (
    <section className={compact ? "empty-state compact app-error-state" : "permission-empty-state card app-error-state"} role="alert">
      <span className="eyebrow">Unable to load</span>
      <h2>{title}</h2>
      <p>{fallbackMessage}</p>
      {error && technicalMessage !== fallbackMessage ? (
        <details>
          <summary>Technical details</summary>
          <code>{technicalMessage}</code>
        </details>
      ) : null}
      {onRetry ? (
        <button className="primary-button compact" onClick={onRetry} type="button">
          Try again
        </button>
      ) : null}
    </section>
  );
}

type AppErrorBoundaryState = { error: Error | null };

export class AppErrorBoundary extends Component<{ children: ReactNode }, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Qaira render failure", error, info.componentStack);
  }

  private retry = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div className="splash-screen">
          <AppErrorState
            error={this.state.error}
            fallbackMessage="Qaira hit an unexpected interface error. Retry once; reload Jira if the problem continues."
            onRetry={this.retry}
            title="The workspace could not be rendered"
          />
        </div>
      );
    }

    return this.props.children;
  }
}
