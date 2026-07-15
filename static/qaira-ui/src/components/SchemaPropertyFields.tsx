import { useMemo } from "react";
import type { DomainMetadata } from "../types";
import { FormField } from "./FormField";

type FieldCatalog = NonNullable<DomainMetadata["field_catalogs"]>[string];

const stringValue = (value: unknown) => value === null || value === undefined ? "" : String(value);

export function SchemaPropertyFields({
  catalog,
  excludeKeys = [],
  userOptions = [],
  values,
  onChange
}: {
  catalog?: FieldCatalog;
  excludeKeys?: string[];
  userOptions?: Array<{ label: string; value: string }>;
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
}) {
  const excluded = useMemo(() => new Set(excludeKeys), [excludeKeys]);
  const fields = useMemo(
    () => (catalog?.fields || []).filter((field) => !field.system_managed && !excluded.has(field.key)),
    [catalog?.fields, excluded]
  );

  if (!fields.length) return null;

  const update = (key: string, value: unknown) => onChange({ ...values, [key]: value });

  return (
    <details className="schema-property-fields">
      <summary>
        <span>
          <strong>Additional properties</strong>
          <small>{fields.length} Jira-backed fields</small>
        </span>
      </summary>
      <div className="schema-property-fields-grid">
        {fields.map((field) => {
          const value = values[field.key];
          if (field.type === "select" && field.options?.length) {
            return (
              <FormField hint={field.description} key={field.key} label={field.label}>
                <select onChange={(event) => update(field.key, event.target.value || null)} value={stringValue(value)}>
                  <option value="">Not set</option>
                  {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </FormField>
            );
          }
          if (field.type === "multiSelect" && field.options?.length) {
            const selected = Array.isArray(value) ? value.map(String) : [];
            return (
              <FormField hint={field.description} key={field.key} label={field.label}>
                <select
                  multiple
                  onChange={(event) => update(field.key, Array.from(event.target.selectedOptions, (option) => option.value))}
                  value={selected}
                >
                  {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </FormField>
            );
          }
          if (field.type === "user") {
            return (
              <FormField hint={field.description} key={field.key} label={field.label}>
                <select onChange={(event) => update(field.key, event.target.value || null)} value={stringValue(value)}>
                  <option value="">Not set</option>
                  {userOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </FormField>
            );
          }
          if (field.type === "paragraph") {
            return (
              <FormField hint={field.description} key={field.key} label={field.label}>
                <textarea onChange={(event) => update(field.key, event.target.value)} rows={3} value={stringValue(value)} />
              </FormField>
            );
          }
          if (field.type === "labels") {
            return (
              <FormField hint={field.description} key={field.key} label={field.label}>
                <input
                  onChange={(event) => update(field.key, event.target.value.split(",").map((item) => item.trim()).filter(Boolean))}
                  placeholder="Comma-separated values"
                  value={Array.isArray(value) ? value.join(", ") : stringValue(value)}
                />
              </FormField>
            );
          }
          return (
            <FormField hint={field.description} key={field.key} label={field.label}>
              <input
                onChange={(event) => update(field.key, field.type === "number" ? (event.target.value === "" ? null : Number(event.target.value)) : event.target.value)}
                type={field.type === "number" ? "number" : field.type === "date" ? "date" : field.type === "dateTime" ? "datetime-local" : "text"}
                value={stringValue(value)}
              />
            </FormField>
          );
        })}
      </div>
    </details>
  );
}
