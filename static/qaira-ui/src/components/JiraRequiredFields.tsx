import type { JiraCreateFieldMetadata } from "../lib/api";
import { FormField } from "./FormField";

type JiraFieldUser = {
  id: string;
  name?: string | null;
  email?: string | null;
};

type JiraRequiredFieldsProps = {
  fields: JiraCreateFieldMetadata[];
  issueTypeName: string;
  mode: "create" | "edit";
  onChange: (fieldId: string, value: unknown) => void;
  users?: JiraFieldUser[];
  values: Record<string, unknown>;
};

const optionValue = (option: NonNullable<JiraCreateFieldMetadata["allowed_values"]>[number]) =>
  option.accountId || option.id || option.value || option.key || option.name || option.label || "";

const optionLabel = (option: NonNullable<JiraCreateFieldMetadata["allowed_values"]>[number]) =>
  option.label || option.displayName || option.name || option.value || option.key || option.id || option.accountId || "Option";

const dateInputValue = (value: unknown, includeTime: boolean) => {
  const text = String(value || "");
  return includeTime ? text.slice(0, 16) : text.slice(0, 10);
};

export function JiraRequiredFields({
  fields,
  issueTypeName,
  mode,
  onChange,
  users = [],
  values
}: JiraRequiredFieldsProps) {
  return (
    <div className="issue-form-grid issue-form-grid--triple">
      {fields.map((field) => {
        const schemaType = String(field.schema?.type || "").toLowerCase();
        const itemType = String(field.schema?.items || "").toLowerCase();
        const customType = String(field.schema?.custom || "").toLowerCase();
        const allowedValues = field.allowed_values || [];
        const value = values[field.id];
        const hint = `Required by the Jira ${issueTypeName} ${mode} screen · ${field.id}`;

        if (allowedValues.length && (schemaType === "array" || itemType)) {
          const selectedValues = Array.isArray(value) ? value.map(String) : [];
          return (
            <FormField hint={hint} key={field.id} label={field.name} required>
              <select
                multiple
                onChange={(event) => onChange(field.id, Array.from(event.currentTarget.selectedOptions, (option) => option.value))}
                required
                size={Math.min(6, Math.max(3, allowedValues.length))}
                value={selectedValues}
              >
                {allowedValues.map((option) => (
                  <option key={optionValue(option)} value={optionValue(option)}>{optionLabel(option)}</option>
                ))}
              </select>
            </FormField>
          );
        }

        if (allowedValues.length) {
          return (
            <FormField hint={hint} key={field.id} label={field.name} required>
              <select onChange={(event) => onChange(field.id, event.target.value)} required value={String(value || "")}>
                <option value="">Select {field.name}</option>
                {allowedValues.map((option) => (
                  <option key={optionValue(option)} value={optionValue(option)}>{optionLabel(option)}</option>
                ))}
              </select>
            </FormField>
          );
        }

        if (schemaType === "user" || (schemaType === "array" && itemType === "user")) {
          const isMultiple = schemaType === "array";
          const selectedValue = isMultiple ? (Array.isArray(value) ? value.map(String) : []) : String(value || "");
          return (
            <FormField hint={hint} key={field.id} label={field.name} required>
              <select
                multiple={isMultiple}
                onChange={(event) => onChange(
                  field.id,
                  isMultiple
                    ? Array.from(event.currentTarget.selectedOptions, (option) => option.value)
                    : event.currentTarget.value
                )}
                required
                size={isMultiple ? Math.min(6, Math.max(3, users.length || 3)) : undefined}
                value={selectedValue}
              >
                {!isMultiple ? <option value="">Select user</option> : null}
                {users.map((user) => <option key={user.id} value={user.id}>{user.name || user.email || user.id}</option>)}
              </select>
            </FormField>
          );
        }

        if (schemaType === "number") {
          return (
            <FormField hint={hint} key={field.id} label={field.name} required>
              <input onChange={(event) => onChange(field.id, event.target.value)} required type="number" value={String(value ?? "")} />
            </FormField>
          );
        }

        if (schemaType === "date" || schemaType === "datetime") {
          return (
            <FormField hint={hint} key={field.id} label={field.name} required>
              <input
                onChange={(event) => onChange(field.id, event.target.value)}
                required
                type={schemaType === "date" ? "date" : "datetime-local"}
                value={dateInputValue(value, schemaType === "datetime")}
              />
            </FormField>
          );
        }

        if (customType.includes(":textarea")) {
          return (
            <FormField hint={hint} key={field.id} label={field.name} required>
              <textarea onChange={(event) => onChange(field.id, event.target.value)} required rows={4} value={String(value || "")} />
            </FormField>
          );
        }

        return (
          <FormField hint={hint} key={field.id} label={field.name} required>
            <input onChange={(event) => onChange(field.id, event.target.value)} required value={String(value || "")} />
          </FormField>
        );
      })}
    </div>
  );
}
