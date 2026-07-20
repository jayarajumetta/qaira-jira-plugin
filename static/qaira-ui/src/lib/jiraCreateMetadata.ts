import type { JiraIssueCreateMetadata } from "./api";

const normalizeFieldToken = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "");

export function isJiraCoreFieldRequired(
  metadata: JiraIssueCreateMetadata | null | undefined,
  ...aliases: string[]
) {
  const tokens = new Set(aliases.map(normalizeFieldToken));
  return Boolean(metadata?.core_fields.some((field) =>
    field.required
    && !field.has_default_value
    && [field.id, field.key || "", field.name].some((value) => tokens.has(normalizeFieldToken(value)))
  ));
}
