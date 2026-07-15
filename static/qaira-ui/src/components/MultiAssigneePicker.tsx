import { useEffect, useMemo, useRef, useState } from "react";
import type { AssigneeOption } from "../lib/userDisplay";

export function MultiAssigneePicker({
  disabled = false,
  emptyLabel = "Unassigned",
  options,
  selectedIds,
  onChange
}: {
  disabled?: boolean;
  emptyLabel?: string;
  options: AssigneeOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [isListOpen, setIsListOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedOptions = useMemo(
    () => selectedIds.map((id) => options.find((option) => option.id === id)).filter((option): option is AssigneeOption => Boolean(option)),
    [options, selectedIds]
  );
  const filteredOptions = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return options.filter((option) => {
      if (!normalizedSearch) {
        return true;
      }

      return `${option.label} ${option.caption || ""} ${option.email}`.toLowerCase().includes(normalizedSearch);
    });
  }, [options, search]);

  const toggleOption = (id: string) => {
    if (selectedIdSet.has(id)) {
      onChange(selectedIds.filter((selectedId) => selectedId !== id));
      return;
    }

    onChange([...selectedIds, id]);
  };

  const summary = selectedOptions.length
    ? selectedOptions.map((option) => option.label).join(", ")
    : emptyLabel;

  useEffect(() => {
    if (!isListOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;

      if (pickerRef.current?.contains(target)) {
        return;
      }

      setIsListOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsListOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isListOpen]);

  return (
    <div className={isListOpen ? "multi-assignee-picker is-open" : "multi-assignee-picker"} ref={pickerRef}>
      <button
        className="multi-assignee-summary"
        disabled={disabled}
        onClick={() => setIsListOpen((current) => !current)}
        title={summary}
        type="button"
      >
        {selectedOptions.length ? (
          selectedOptions.map((option) => (
            <span className="multi-assignee-chip" key={option.id}>{option.label}</span>
          ))
        ) : (
          <span className="multi-assignee-empty">{emptyLabel}</span>
        )}
      </button>
      <input
        aria-label="Search assignees"
        disabled={disabled}
        onClick={() => setIsListOpen(true)}
        onFocus={() => setIsListOpen(true)}
        placeholder={options.length ? "Search and select assignees" : "No project members available"}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {isListOpen && !disabled ? <div className="multi-assignee-list">
        {filteredOptions.map((option) => (
          <label className="multi-assignee-option" key={option.id}>
            <input
              checked={selectedIdSet.has(option.id)}
              disabled={disabled}
              onChange={() => toggleOption(option.id)}
              type="checkbox"
            />
            <span>
              <strong>{option.label}</strong>
              {option.caption ? <small>{option.caption}</small> : null}
            </span>
          </label>
        ))}
        {!filteredOptions.length ? <div className="empty-state compact">No assignees match this search.</div> : null}
      </div> : null}
    </div>
  );
}
