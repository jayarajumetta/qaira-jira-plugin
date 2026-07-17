import type { ReactNode } from "react";
import { ClearSelectionIcon, SelectAllIcon, TrashIcon } from "./AppIcons";

type CatalogSelectionControlsProps = {
  allSelected: boolean;
  canSelectAll: boolean;
  selectedCount: number;
  onClear: () => void;
  onSelectAll: () => void;
  clearLabel?: string;
  selectAllLabel?: string;
  deleteAction?: {
    disabled?: boolean;
    icon?: ReactNode;
    label: ReactNode;
    onClick: () => void;
    visible?: boolean;
  };
};

export function CatalogSelectionControls({
  allSelected,
  canSelectAll,
  clearLabel = "Clear",
  deleteAction,
  onClear,
  onSelectAll,
  selectAllLabel = "Select all",
  selectedCount
}: CatalogSelectionControlsProps) {
  const hasSelection = selectedCount > 0;
  const shouldShowDelete = Boolean(deleteAction && (deleteAction.visible ?? hasSelection));

  return (
    <>
      {canSelectAll && !allSelected ? (
        <button
          className="ghost-button catalog-selection-button"
          onClick={onSelectAll}
          type="button"
        >
          <SelectAllIcon />
          <span>{selectAllLabel}</span>
        </button>
      ) : null}
      {hasSelection ? (
        <button className="ghost-button catalog-selection-button" onClick={onClear} type="button">
          <ClearSelectionIcon />
          <span>{clearLabel}</span>
        </button>
      ) : null}
      {shouldShowDelete && deleteAction ? (
        <button
          className="ghost-button danger catalog-selection-button"
          disabled={deleteAction.disabled}
          onClick={deleteAction.onClick}
          type="button"
        >
          {deleteAction.icon || <TrashIcon />}
          <span>{deleteAction.label}</span>
        </button>
      ) : null}
    </>
  );
}
