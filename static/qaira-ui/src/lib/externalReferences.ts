export const parseReferenceList = (value: string | string[] | null | undefined) => {
  const values = Array.isArray(value) ? value : String(value || "").split(/,|\r?\n|\|/);

  return Array.from(
    new Set(
      values
        .flatMap((item) => String(item || "").split(/,|\r?\n|\|/))
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
};

export const formatReferenceList = (values?: string[] | null) =>
  parseReferenceList(values || []).join(", ");
