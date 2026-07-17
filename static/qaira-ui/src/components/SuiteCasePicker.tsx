import { useMemo, useState } from "react";
import { richTextToPlainText } from "./RichTextEditor";
import type { TestCase, TestSuite } from "../types";

type SuiteCasePickerProps = {
  cases: TestCase[];
  selectedCaseIds: string[];
  onChange: (nextIds: string[]) => void;
  heading: string;
  description: string;
  emptyMessage: string;
  moduleLabelByCaseId?: Record<string, string>;
};

type SuiteScopePickerProps = {
  suites: TestSuite[];
  selectedSuiteIds: string[];
  onChange: (nextIds: string[]) => void;
  heading: string;
  description: string;
  emptyMessage: string;
};

type OrderedSelectionPickerItem = {
  id: string;
  title: string;
  description: string;
  meta?: string;
  labels?: string[];
  moduleLabel?: string;
};

type OrderedSelectionPickerProps = {
  items: OrderedSelectionPickerItem[];
  selectedIds: string[];
  onChange: (nextIds: string[]) => void;
  heading: string;
  description: string;
  emptyMessage: string;
  itemLabel: string;
  selectedHint: string;
  emptyHint: string;
  showCaseFilters?: boolean;
  showSelectionSummary?: boolean;
};

const moveItem = <T,>(items: T[], fromIndex: number, toIndex: number) => {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length) {
    return items;
  }

  const next = [...items];
  const [movedItem] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, movedItem);
  return next;
};

export function SuiteCasePicker({
  cases,
  selectedCaseIds,
  onChange,
  heading,
  description,
  emptyMessage,
  moduleLabelByCaseId = {}
}: SuiteCasePickerProps) {
  const items = useMemo<OrderedSelectionPickerItem[]>(
    () =>
      cases.map((testCase) => ({
        id: testCase.id,
        title: testCase.title,
        description: richTextToPlainText(testCase.description) || "No description yet for this test case.",
        labels: testCase.labels || [],
        moduleLabel: moduleLabelByCaseId[testCase.id] || ""
      })),
    [cases, moduleLabelByCaseId]
  );

  return (
    <OrderedSelectionPicker
      description={description}
      emptyHint=""
      emptyMessage={emptyMessage}
      heading={heading}
      itemLabel="test case"
      items={items}
      onChange={onChange}
      selectedHint=""
      selectedIds={selectedCaseIds}
      showCaseFilters
      showSelectionSummary={false}
    />
  );
}

export function SuiteScopePicker({
  suites,
  selectedSuiteIds,
  onChange,
  heading,
  description,
  emptyMessage
}: SuiteScopePickerProps) {
  const items = useMemo<OrderedSelectionPickerItem[]>(
    () =>
      suites.map((suite) => ({
        id: suite.id,
        title: suite.name,
        description: suite.labels?.length ? `Labels: ${suite.labels.join(", ")}` : "Reusable suite",
        meta: "Captured as a suite snapshot for this run."
      })),
    [suites]
  );

  return (
    <OrderedSelectionPicker
      description={description}
      emptyHint="Select one or more suites to build the execution scope."
      emptyMessage={emptyMessage}
      heading={heading}
      itemLabel="suite"
      items={items}
      onChange={onChange}
      selectedHint="Checked suites stay pinned to the top and will be used in this order for the execution snapshot."
      selectedIds={selectedSuiteIds}
    />
  );
}

function OrderedSelectionPicker({
  items,
  selectedIds,
  onChange,
  heading,
  description,
  emptyMessage,
  itemLabel,
  selectedHint,
  emptyHint,
  showCaseFilters = false,
  showSelectionSummary = true
}: OrderedSelectionPickerProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const filteredItems = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    return items.filter((item) => {
      const itemLabels = item.labels || [];
      const itemModule = String(item.moduleLabel || "");
      const searchHaystack = [
        item.title,
        item.description,
        item.meta || "",
        itemModule,
        ...itemLabels
      ].join(" ").toLowerCase();

      if (search && !searchHaystack.includes(search)) {
        return false;
      }

      return true;
    });
  }, [items, searchTerm]);
  const allVisibleItemIds = useMemo(() => filteredItems.map((item) => item.id), [filteredItems]);
  const selectedItems = useMemo(
    () => selectedIds.map((id) => itemById.get(id)).filter((item): item is OrderedSelectionPickerItem => Boolean(item)),
    [itemById, selectedIds]
  );
  const orderedItems = useMemo(
    () => [
      ...selectedItems.filter((item) => allVisibleItemIds.includes(item.id)),
      ...filteredItems.filter((item) => !selectedIds.includes(item.id))
    ],
    [allVisibleItemIds, filteredItems, selectedIds, selectedItems]
  );
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const areAllVisibleItemsSelected = Boolean(allVisibleItemIds.length) && allVisibleItemIds.every((itemId) => selectedIdSet.has(itemId));
  const hasActiveFilters = Boolean(searchTerm.trim());
  const visibleSelectedCount = allVisibleItemIds.filter((itemId) => selectedIdSet.has(itemId)).length;

  const toggleItem = (itemId: string) => {
    if (selectedIdSet.has(itemId)) {
      onChange(selectedIds.filter((id) => id !== itemId));
      return;
    }

    onChange([...selectedIds, itemId]);
  };

  const moveSelectedItem = (itemId: string, direction: "up" | "down") => {
    const currentIndex = selectedIds.indexOf(itemId);

    if (currentIndex === -1) {
      return;
    }

    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    onChange(moveItem(selectedIds, currentIndex, targetIndex));
  };

  const selectVisibleItems = () => {
    onChange(Array.from(new Set([...selectedIds, ...allVisibleItemIds])));
  };

  return (
    <div className="modal-case-picker">
      <div className="suite-case-picker-toolbar">
        <div>
          <strong>{heading}</strong>
          {description ? <span>{description}</span> : null}
        </div>
        <div className="suite-case-picker-actions">
          {showCaseFilters ? (
            <input
              aria-label={`Search ${itemLabel}s`}
              className="suite-case-picker-search"
              placeholder={itemLabel === "test case" ? "Search test cases" : `Search ${itemLabel}s`}
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          ) : null}
          <button className="ghost-button" disabled={!allVisibleItemIds.length || areAllVisibleItemsSelected} onClick={selectVisibleItems} type="button">
            Select all
          </button>
          <button className="ghost-button" disabled={!selectedIds.length} onClick={() => onChange([])} type="button">
            Clear
          </button>
        </div>
      </div>

      {showSelectionSummary ? (
        <div className="detail-summary suite-case-picker-summary">
          <strong>{selectedItems.length} {itemLabel}{selectedItems.length === 1 ? "" : "s"} selected</strong>
          <span>
            {hasActiveFilters
              ? `${visibleSelectedCount} selected in the current filtered list.`
              : selectedItems.length
                ? selectedHint
                : emptyHint}
          </span>
        </div>
      ) : null}

      {!items.length ? <div className="empty-state compact">{emptyMessage}</div> : null}
      {items.length && !orderedItems.length ? <div className="empty-state compact">No {itemLabel}s match the current filters.</div> : null}

      {orderedItems.length ? (
        <div className="suite-case-picker-list suite-case-picker-list--ordered">
          {orderedItems.map((item) => {
            const selectedIndex = selectedIds.indexOf(item.id);
            const isSelected = selectedIndex >= 0;

            return (
              <div className={isSelected ? "suite-case-picker-option is-selected" : "suite-case-picker-option"} key={item.id}>
                <label className="suite-case-picker-option-label">
                  <input checked={isSelected} onChange={() => toggleItem(item.id)} type="checkbox" />
                  <div className="suite-case-picker-option-copy">
                    <div className="suite-case-picker-option-title">
                      {isSelected ? <span className="suite-case-picker-order">{selectedIndex + 1}</span> : null}
                      <strong>{item.title}</strong>
                    </div>
                    <span>{item.description}</span>
                    {item.labels?.length ? <span className="suite-case-picker-option-meta">Labels: {item.labels.join(", ")}</span> : null}
                    {item.moduleLabel ? <span className="suite-case-picker-option-meta">Module: {item.moduleLabel}</span> : null}
                    {item.meta ? <span className="suite-case-picker-option-meta">{item.meta}</span> : null}
                  </div>
                </label>

                <div className="suite-case-picker-option-actions" role="group" aria-label={`${item.title} ordering controls`}>
                  <button
                    aria-label={`Move ${item.title} up`}
                    className="ghost-button suite-case-picker-move"
                    disabled={!isSelected || selectedIndex === 0}
                    onClick={(event) => {
                      event.preventDefault();
                      moveSelectedItem(item.id, "up");
                    }}
                    type="button"
                  >
                    <SuiteCasePickerArrowIcon direction="up" />
                  </button>
                  <button
                    aria-label={`Move ${item.title} down`}
                    className="ghost-button suite-case-picker-move"
                    disabled={!isSelected || selectedIndex === selectedItems.length - 1}
                    onClick={(event) => {
                      event.preventDefault();
                      moveSelectedItem(item.id, "down");
                    }}
                    type="button"
                  >
                    <SuiteCasePickerArrowIcon direction="down" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function SuiteCasePickerArrowIcon({ direction }: { direction: "up" | "down" }) {
  return (
    <svg aria-hidden="true" fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="16">
      {direction === "up" ? <path d="m7 14 5-5 5 5" /> : <path d="m7 10 5 5 5-5" />}
    </svg>
  );
}
