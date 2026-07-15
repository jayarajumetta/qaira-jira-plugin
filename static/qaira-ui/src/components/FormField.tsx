import { Children, cloneElement, isValidElement, useId } from "react";
import type { ReactElement, ReactNode } from "react";

function mergeAriaDescribedBy(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ") || undefined;
}

export function FormField({
  label,
  children,
  error,
  hint,
  inputId,
  required
}: {
  label: string;
  children: ReactNode;
  error?: string;
  hint?: string;
  inputId?: string;
  required?: boolean;
}) {
  const generatedId = useId().replace(/:/g, "");
  const id = inputId || `field-${label.toLowerCase().replace(/\s+/g, "-")}-${generatedId}`;
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = mergeAriaDescribedBy(error ? errorId : undefined, hint ? hintId : undefined);

  const fieldControl =
    Children.count(children) === 1 && isValidElement(children)
      ? cloneElement(children as ReactElement<Record<string, unknown>>, {
          id: (children as ReactElement<Record<string, unknown>>).props.id || id,
          "aria-describedby": mergeAriaDescribedBy(
            (children as ReactElement<Record<string, unknown>>).props["aria-describedby"] as string | undefined,
            describedBy
          ),
          "aria-invalid":
            (children as ReactElement<Record<string, unknown>>).props["aria-invalid"] ||
            Boolean(error) ||
            undefined
        })
      : children;

  return (
    <div className="form-field">
      <label className="form-field-label" htmlFor={id}>
        <span>{label}</span>
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {fieldControl}
      {hint ? <p className="form-field-hint sr-only" id={hintId}>{hint}</p> : null}
      {error ? <span className="form-field-error" id={errorId} role="alert">{error}</span> : null}
    </div>
  );
}
