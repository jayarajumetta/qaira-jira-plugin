import { useMemo, useState } from "react";

import { formatReferenceList, parseReferenceList } from "../lib/externalReferences";
import { FormField } from "./FormField";

export function ExternalReferencesField({
  value,
  onChange
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [draftReference, setDraftReference] = useState("");
  const references = useMemo(() => parseReferenceList(value), [value]);

  const commitReference = (rawReference: string) => {
    const normalizedReference = rawReference.trim();
    if (!normalizedReference) return;
    if (references.some((reference) => reference.toLowerCase() === normalizedReference.toLowerCase())) {
      setDraftReference("");
      return;
    }
    onChange(formatReferenceList([...references, normalizedReference]));
    setDraftReference("");
  };

  const removeReference = (referenceToRemove: string) => {
    onChange(formatReferenceList(references.filter((reference) => reference.toLowerCase() !== referenceToRemove.toLowerCase())));
  };

  return (
    <FormField label="External references" hint="Type a reference, then press semicolon or Enter to add it.">
      <div className="requirement-reference-picker">
        <div className="requirement-reference-entry">
          <input
            aria-label="Add external reference"
            placeholder="Paste Jira links, docs, IDs; press ; to add"
            value={draftReference}
            onBlur={() => commitReference(draftReference)}
            onChange={(event) => {
              const nextValue = event.target.value;
              if (/[;\n]$/.test(nextValue)) {
                commitReference(nextValue.replace(/[;\n]+$/g, ""));
                return;
              }
              setDraftReference(nextValue);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === ";") {
                event.preventDefault();
                commitReference(draftReference);
              }
            }}
          />
          <button className="ghost-button requirement-label-add-button" disabled={!draftReference.trim()} onClick={() => commitReference(draftReference)} type="button">
            Add
          </button>
        </div>
        {references.length ? (
          <div className="requirement-reference-chip-row">
            {references.map((reference) => {
              const content = /^https?:\/\//i.test(reference) ? (
                <a href={reference} onClick={(event) => event.stopPropagation()} rel="noreferrer" target="_blank">
                  {reference}
                </a>
              ) : <span>{reference}</span>;

              return (
                <span className="requirement-reference-chip" key={reference} title={`Remove ${reference}`}>
                  {content}
                  <button aria-label={`Remove ${reference}`} onClick={() => removeReference(reference)} type="button">×</button>
                </span>
              );
            })}
          </div>
        ) : null}
      </div>
    </FormField>
  );
}
