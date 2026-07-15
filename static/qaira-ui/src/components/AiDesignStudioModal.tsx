import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { AiDesignImageInput, AiDesignedTestCaseCandidate, Integration, Requirement, TestCase } from "../types";
import { useDialogFocus } from "../hooks/useDialogFocus";
import { api } from "../lib/api";
import {
  buildFileContextSection,
  buildKnowledgeContextSection,
  buildRequirementContextSection,
  mergeAiContextPack
} from "../lib/aiDesignStudio";
import { AiPromptTemplatePicker } from "./AiPromptTemplatePicker";
import { DialogCloseButton } from "./DialogCloseButton";
import { FormField } from "./FormField";
import { InfoTooltip } from "./InfoTooltip";
import { richTextToPlainText } from "./RichTextEditor";
import { ToastMessage } from "./ToastMessage";

export function AiDesignStudioModal({
  eyebrow,
  requirementLabel,
  requirementHelpText: _requirementHelpText,
  requirements,
  selectedRequirementIds,
  allowMultipleRequirements,
  onRequirementSelectionChange,
  integrations,
  integrationId,
  onIntegrationIdChange,
  maxCases,
  onMaxCasesChange,
  additionalContext,
  onAdditionalContextChange,
  externalLinksText,
  onExternalLinksTextChange,
  referenceImages,
  onAddImages,
  onRemoveImage,
  appTypeName: _appTypeName,
  existingCases,
  existingCasesTitle,
  existingCasesSubtitle,
  onViewExistingCase,
  previewCases,
  onRemovePreviewCase,
  onTogglePreviewRequirement,
  previewMessage,
  previewTone,
  onPreviewMessageDismiss,
  isPreviewing,
  isAccepting,
  onPreview,
  onSchedule,
  onAccept,
  onClose,
  disablePreview,
  disableSchedule = true,
  disableAccept,
  isScheduling = false,
  closeDisabled = false,
  acceptLabel,
  dialogClassName,
  parallelRequirementCount,
  onParallelRequirementCountChange,
  scheduleHelperText,
  promptTemplateProjectId,
  promptTemplateAppTypeId
}: {
  eyebrow: string;
  requirementLabel: string;
  requirementHelpText: string;
  requirements: Requirement[];
  selectedRequirementIds: string[];
  allowMultipleRequirements: boolean;
  onRequirementSelectionChange: (requirementIds: string[]) => void;
  integrations: Integration[];
  integrationId: string;
  onIntegrationIdChange: (value: string) => void;
  maxCases: number;
  onMaxCasesChange: (value: number) => void;
  additionalContext: string;
  onAdditionalContextChange: (value: string) => void;
  externalLinksText: string;
  onExternalLinksTextChange: (value: string) => void;
  referenceImages: AiDesignImageInput[];
  onAddImages: (files: FileList | null) => void;
  onRemoveImage: (imageUrl: string) => void;
  appTypeName: string;
  existingCases: TestCase[];
  existingCasesTitle: string;
  existingCasesSubtitle: string;
  onViewExistingCase?: (testCaseId: string) => void;
  previewCases: AiDesignedTestCaseCandidate[];
  onRemovePreviewCase: (clientId: string) => void;
  onTogglePreviewRequirement?: (clientId: string, requirementId: string) => void;
  previewMessage: string;
  previewTone: "success" | "error";
  onPreviewMessageDismiss: () => void;
  isPreviewing: boolean;
  isAccepting: boolean;
  onPreview: () => void;
  onSchedule?: () => void;
  onAccept: (selectedClientIds: string[]) => void;
  onClose: () => void;
  disablePreview: boolean;
  disableSchedule?: boolean;
  disableAccept: boolean;
  isScheduling?: boolean;
  closeDisabled?: boolean;
  acceptLabel: string;
  dialogClassName?: string;
  parallelRequirementCount?: number;
  onParallelRequirementCountChange?: (value: number) => void;
  scheduleHelperText?: string;
  promptTemplateProjectId?: string;
  promptTemplateAppTypeId?: string;
}) {
  const dialogRef = useDialogFocus<HTMLDivElement>({ closeDisabled, onClose });
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isRequirementDialogOpen, setIsRequirementDialogOpen] = useState(false);
  const [requirementSearchTerm, setRequirementSearchTerm] = useState("");
  const [contextFileSelection, setContextFileSelection] = useState<FileList | null>(null);
  const [isBuildingSmartContext, setIsBuildingSmartContext] = useState(false);
  const [smartContextMessage, setSmartContextMessage] = useState("");
  const [selectedPreviewCaseIds, setSelectedPreviewCaseIds] = useState<string[]>([]);
  const closeRequirementDialog = () => setIsRequirementDialogOpen(false);
  const requirementDialogRef = useDialogFocus<HTMLDivElement>({
    active: isRequirementDialogOpen,
    onClose: closeRequirementDialog
  });

  const handleRequirementToggle = (requirementId: string, checked: boolean) => {
    if (allowMultipleRequirements) {
      onRequirementSelectionChange(
        checked
          ? [...new Set([...selectedRequirementIds, requirementId])]
          : selectedRequirementIds.filter((id) => id !== requirementId)
      );
      return;
    }

    onRequirementSelectionChange(checked ? [requirementId] : []);
  };

  const selectedRequirementCount = selectedRequirementIds.length;
  const selectedRequirementLabel = allowMultipleRequirements
    ? `${selectedRequirementCount} selected`
    : requirements.find((requirement) => requirement.id === selectedRequirementIds[0])?.title || "No requirement selected";
  const scopedPreviewRequirements = selectedRequirementIds.length
    ? requirements.filter((requirement) => selectedRequirementIds.includes(requirement.id))
    : requirements;
  const [isIntegrationWarningDismissed, setIsIntegrationWarningDismissed] = useState(false);
  const integrationWarning = !integrations.length
    ? "No active LLM integrations are available yet. Create one in Integrations to use AI test case generation."
    : "";
  const toasterMessage = previewMessage || (!isIntegrationWarningDismissed ? integrationWarning : "");
  const toasterTone = previewMessage ? previewTone : "error";

  useEffect(() => {
    setIsIntegrationWarningDismissed(false);
  }, [integrations.length]);

  useEffect(() => {
    setSelectedPreviewCaseIds((current) => {
      const previewIds = previewCases.map((item) => item.client_id);
      if (!previewIds.length) {
        return [];
      }
      const retained = current.filter((id) => previewIds.includes(id));
      return retained.length ? retained : previewIds;
    });
  }, [previewCases]);

  const dismissToasterMessage = () => {
    if (previewMessage) {
      onPreviewMessageDismiss();
      return;
    }

    setIsIntegrationWarningDismissed(true);
  };
  const filteredRequirements = requirements.filter((requirement) => {
    const query = requirementSearchTerm.trim().toLowerCase();
    if (!query) return true;
    return [requirement.display_id, requirement.id, requirement.title, requirement.description, requirement.status, String(requirement.priority ?? "")]
      .some((value) => String(value || "").toLowerCase().includes(query));
  });
  const schedulerHelpText = scheduleHelperText || "Queue one AI generation run per selected requirement. Generated cases land back in the library with accept and reject review actions.";
  const selectedPreviewCount = previewCases.filter((item) => selectedPreviewCaseIds.includes(item.client_id)).length;
  const isEveryPreviewSelected = Boolean(previewCases.length) && selectedPreviewCount === previewCases.length;
  const handleTogglePreviewCase = (clientId: string, checked: boolean) => {
    setSelectedPreviewCaseIds((current) => checked ? [...new Set([...current, clientId])] : current.filter((id) => id !== clientId));
  };

  const handleBuildSmartContext = async () => {
    setIsBuildingSmartContext(true);
    setSmartContextMessage("");

    try {
      const selectedRequirements = scopedPreviewRequirements;
      const requirementSection = buildRequirementContextSection(selectedRequirements);
      const query = selectedRequirements
        .slice(0, 8)
        .map((requirement) => requirement.title)
        .filter(Boolean)
        .join(" ");
      const knowledgePackage = promptTemplateProjectId
        ? await api.knowledgeRepo.contextPackage(promptTemplateProjectId, {
            app_type_id: promptTemplateAppTypeId,
            query
          })
        : { knowledge: [] };
      const knowledgeSection = buildKnowledgeContextSection(knowledgePackage.knowledge || []);
      const fileContext = await buildFileContextSection(contextFileSelection);
      const sections = [
        "QAira smart context pack: use this as supporting evidence only; generated test cases must still map to the selected requirements.",
        requirementSection,
        knowledgeSection,
        fileContext.section
      ];

      onAdditionalContextChange(mergeAiContextPack(additionalContext, sections));
      setSmartContextMessage([
        `Added ${selectedRequirements.length} requirement${selectedRequirements.length === 1 ? "" : "s"}`,
        `${(knowledgePackage.knowledge || []).length} knowledge item${(knowledgePackage.knowledge || []).length === 1 ? "" : "s"}`,
        fileContext.section ? "file context" : "",
        fileContext.skipped.length ? `Skipped: ${fileContext.skipped.join(", ")}` : ""
      ].filter(Boolean).join(" · "));
    } catch (error) {
      setSmartContextMessage(error instanceof Error ? error.message : "Unable to build smart context.");
    } finally {
      setIsBuildingSmartContext(false);
    }
  };

  const requirementDialog = isRequirementDialogOpen ? (
    <div
      className="modal-backdrop nested-modal-backdrop"
      onClick={(event) => {
        event.stopPropagation();
        setIsRequirementDialogOpen(false);
      }}
      role="presentation"
    >
      <div
        aria-labelledby="ai-requirement-selection-title"
        aria-modal="true"
        className="modal-card requirement-selection-dialog"
        onClick={(event) => event.stopPropagation()}
        ref={requirementDialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="ai-studio-header">
          <div className="ai-studio-header-copy">
            <p className="dialog-context-label">{requirementLabel}</p>
            <h2 className="dialog-title" id="ai-requirement-selection-title">Select requirements</h2>
            <p>{selectedRequirementCount} of {requirements.length} selected</p>
          </div>
          <DialogCloseButton label="Close requirement selection" onClick={closeRequirementDialog} />
        </div>
        <FormField label="Search requirements">
          <input
            autoFocus
            placeholder="Search title, description, status, or priority"
            value={requirementSearchTerm}
            onChange={(event) => setRequirementSearchTerm(event.target.value)}
          />
        </FormField>
        <div className="requirement-selection-dialog-actions">
          <button className="ghost-button compact" onClick={() => onRequirementSelectionChange(filteredRequirements.map((requirement) => requirement.id))} type="button">
            Select visible
          </button>
          <button className="ghost-button compact" onClick={() => onRequirementSelectionChange([])} type="button">
            Clear
          </button>
        </div>
        <div className="modal-case-picker ai-studio-requirement-picker requirement-selection-dialog-list">
          {filteredRequirements.map((requirement) => (
            <label className="modal-case-option requirement-link-option" key={requirement.id}>
              <input
                checked={selectedRequirementIds.includes(requirement.id)}
                onChange={(event) => handleRequirementToggle(requirement.id, event.target.checked)}
                type="checkbox"
              />
              <div>
                <strong>{requirement.title}</strong>
                <span>{richTextToPlainText(requirement.description) || "No description available."}</span>
                <span className="requirement-link-option-meta">Priority P{requirement.priority ?? 3} · {requirement.status || "open"}</span>
              </div>
            </label>
          ))}
          {!filteredRequirements.length ? <div className="empty-state compact">No requirements match the current search.</div> : null}
        </div>
        <div className="action-row ai-studio-footer">
          <button className="ghost-button" onClick={() => onRequirementSelectionChange(requirements.map((requirement) => requirement.id))} type="button">
            Select all
          </button>
          <button className="ghost-button" onClick={() => onRequirementSelectionChange([])} type="button">
            Clear
          </button>
          <button className="primary-button" onClick={() => setIsRequirementDialogOpen(false)} type="button">
            Done
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <div className="modal-backdrop" onClick={() => !closeDisabled && onClose()} role="presentation">
        <div
          aria-labelledby="ai-design-studio-title"
          aria-modal="true"
          className={dialogClassName ? `modal-card ai-modal-card ai-design-modal ${dialogClassName}` : "modal-card ai-modal-card ai-design-modal"}
          onClick={(event) => event.stopPropagation()}
          ref={dialogRef}
          role="dialog"
          tabIndex={-1}
        >
        <div className="ai-studio-header">
          <div className="ai-studio-header-copy">
            <p className="dialog-context-label">{eyebrow}</p>
            <div className="modal-title-info-row">
              <h2 className="dialog-title ai-studio-title" id="ai-design-studio-title">AI test case generation</h2>
              <InfoTooltip
                content="Shape the LLM prompt with source requirements, extra context, photos, and external links before reviewing the generated cases for approval."
                label="AI test case generation information"
              />
            </div>
          </div>
          <DialogCloseButton disabled={closeDisabled} label="Close AI test case generation" onClick={onClose} />
        </div>

        <div className={isSidebarCollapsed ? "ai-studio-shell is-sidebar-collapsed" : "ai-studio-shell"}>
          <div className={isSidebarCollapsed ? "ai-studio-sidebar is-collapsed" : "ai-studio-sidebar"}>
            {!isSidebarCollapsed ? (
              <div className="ai-studio-sidebar-panels">
                <section className="ai-studio-panel">
                  {allowMultipleRequirements ? (
                    <div className="ai-studio-requirement-summary">
                      <div>
                        <strong>{requirementLabel}</strong>
                        <span>{selectedRequirementLabel}</span>
                      </div>
                      <button
                        className="ghost-button compact ai-requirement-dialog-button"
                        data-autofocus="true"
                        onClick={() => setIsRequirementDialogOpen(true)}
                        title="Expand requirement selection"
                        type="button"
                      >
                        <AiExpandIcon />
                        <span>Choose</span>
                      </button>
                    </div>
                  ) : (
                    <FormField label={requirementLabel}>
                      <select
                        data-autofocus="true"
                        value={selectedRequirementIds[0] || ""}
                        onChange={(event) => onRequirementSelectionChange(event.target.value ? [event.target.value] : [])}
                      >
                        {requirements.map((requirement) => (
                          <option key={requirement.id} value={requirement.id}>
                            {requirement.title}
                          </option>
                        ))}
                      </select>
                    </FormField>
                  )}

                  <div className="record-grid">
                    <FormField label="LLM integration">
                      <select value={integrationId} onChange={(event) => onIntegrationIdChange(event.target.value)}>
                        <option value="">Configured prompt LLM or default active</option>
                        {integrations.map((integration) => (
                          <option key={integration.id} value={integration.id}>
                            {integration.name}
                          </option>
                        ))}
                      </select>
                    </FormField>

                    <FormField label="Draft cases to generate">
                      <input min="1" max="3" type="number" value={maxCases} onChange={(event) => onMaxCasesChange(Math.min(3, Math.max(1, Number(event.target.value) || 3)))} />
                    </FormField>

                    {onSchedule && onParallelRequirementCountChange ? (
                      <FormField label="Requirements in parallel">
                        <input
                          min="1"
                          max="5"
                          type="number"
                          value={parallelRequirementCount || 1}
                          onChange={(event) => onParallelRequirementCountChange(Number(event.target.value) || 1)}
                        />
                      </FormField>
                    ) : null}
                  </div>

                </section>

                <div className="ai-studio-sidebar-divider" aria-hidden="true">
                  <button
                    aria-expanded={!isSidebarCollapsed}
                    className="ghost-button ai-studio-sidebar-toggle"
                    onClick={() => setIsSidebarCollapsed((current) => !current)}
                    title="Collapse prompt sidebar"
                    type="button"
                  >
                    <AiSidebarChevronIcon />
                  </button>
                </div>

                <section className="ai-studio-panel">
                  <div className="panel-head">
                    <div>
                      <p className="eyebrow">Prompt context</p>
                      <p>Provide the extra guidance the model should consider while drafting cases.</p>
                    </div>
                  </div>

                  <div className="ai-prompt-context-head">
                    <span>Additional context</span>
                    <AiPromptTemplatePicker
                      appTypeId={promptTemplateAppTypeId}
                      disabled={isPreviewing || isScheduling || isAccepting}
                      onApply={(prompt) => onAdditionalContextChange(prompt)}
                      projectId={promptTemplateProjectId}
                    />
                  </div>
                  <div className="ai-smart-context-card">
                    <div>
                      <strong>Smart context</strong>
                      <span>Pull selected requirements, relevant AI Knowledge, and safe text files into a size-limited prompt pack.</span>
                    </div>
                    <div className="ai-smart-context-actions">
                      <label className="ghost-button compact ai-context-file-button">
                        <input
                          accept=".txt,.md,.markdown,.csv,.json,.xml,.yaml,.yml,.feature,.log,text/*,application/json,application/xml"
                          multiple
                          onChange={(event) => setContextFileSelection(event.target.files)}
                          type="file"
                        />
                        <AiAttachIcon />
                        <span>{contextFileSelection?.length ? `${contextFileSelection.length} file${contextFileSelection.length === 1 ? "" : "s"}` : "Add files"}</span>
                      </label>
                      <button
                        className="primary-button compact ai-smart-context-button"
                        disabled={isBuildingSmartContext || isPreviewing || isScheduling || isAccepting}
                        onClick={() => void handleBuildSmartContext()}
                        type="button"
                      >
                        <AiSparkSmallIcon />
                        <span>{isBuildingSmartContext ? "Packing..." : "Add smart context"}</span>
                      </button>
                    </div>
                    {smartContextMessage ? <span className="ai-smart-context-note">{smartContextMessage}</span> : null}
                  </div>
                  <FormField label="Prompt copy">
                    <textarea
                      placeholder="Release goals, risky flows, browser/device notes, compliance rules, known gaps..."
                      rows={5}
                      value={additionalContext}
                      onChange={(event) => onAdditionalContextChange(event.target.value)}
                    />
                  </FormField>

                  <FormField label="External links">
                    <textarea
                      placeholder="One link per line"
                      rows={4}
                      value={externalLinksText}
                      onChange={(event) => onExternalLinksTextChange(event.target.value)}
                    />
                  </FormField>

                  <FormField label="Reference photos">
                    <input
                      accept="image/*"
                      multiple
                      onChange={(event) => {
                        onAddImages(event.target.files);
                        event.target.value = "";
                      }}
                      type="file"
                    />
                  </FormField>

                  {referenceImages.length ? (
                    <div className="ai-reference-image-list">
                      {referenceImages.map((image) => (
                        <article className="ai-reference-image-card" key={image.url}>
                          <div className="ai-reference-image-preview">
                            <img alt={image.name || "Reference upload"} src={image.url} />
                          </div>
                          <div className="ai-reference-image-copy">
                            <strong>{image.name || "Reference image"}</strong>
                            <span>Attached to the prompt</span>
                          </div>
                          <button className="ghost-button danger" onClick={() => onRemoveImage(image.url)} type="button">
                            Remove
                          </button>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="empty-state compact">Add screenshots or reference photos to give the model visual context.</div>
                  )}
                </section>
              </div>
            ) : (
              <div className="ai-studio-sidebar-collapsed-bar">
                <button
                  aria-expanded={!isSidebarCollapsed}
                  className="ghost-button ai-studio-sidebar-toggle"
                  onClick={() => setIsSidebarCollapsed((current) => !current)}
                  title="Expand prompt sidebar"
                  type="button"
                >
                  <AiSidebarChevronIcon />
                </button>
              </div>
            )}
          </div>

          <div className="ai-studio-main">
            <ToastMessage message={toasterMessage} onDismiss={dismissToasterMessage} tone={toasterTone} />

            <div className="action-row ai-studio-actions">
              <button className="primary-button ai-studio-primary-action" disabled={disablePreview} onClick={onPreview} type="button">
                {isPreviewing ? "Designing…" : "Generate Preview"}
              </button>
              {onSchedule ? (
                <div className="ai-studio-schedule-action">
                  <button className="ghost-button ai-studio-secondary-action" disabled={disableSchedule} onClick={onSchedule} type="button">
                    {isScheduling ? "Scheduling…" : "Schedule Test Case Generation"}
                  </button>
                  <InfoTooltip
                    content={schedulerHelpText}
                    label="AI scheduler information"
                  />
                </div>
              ) : null}
            </div>

            <div className="ai-modal-grid">
              <div className="detail-stack">
                <div className="panel-head">
                  <div>
                    <p className="eyebrow">{existingCasesTitle}</p>
                    <p>{existingCasesSubtitle}</p>
                  </div>
                </div>

                <div className="stack-list">
                  {existingCases.map((testCase) => (
                    <div className="stack-item" key={testCase.id}>
                      <div>
                        <strong>{testCase.title}</strong>
                      </div>
                      <button
                        className="ghost-button ai-existing-case-button"
                        onClick={() => onViewExistingCase?.(testCase.id)}
                        title="View test case"
                        type="button"
                      >
                        <AiViewIcon />
                      </button>
                    </div>
                  ))}
                  {!existingCases.length ? (
                    <div className="empty-state compact ai-generation-empty-state">
                      <strong>No linked cases yet</strong>
                      <span>The selected requirement scope has no reusable test cases attached.</span>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="detail-stack">
                <div className="panel-head">
                  <div>
                    <p className="eyebrow">AI draft cases</p>
                    <p>Review the generated drafts, select the cases to accept, and adjust requirement mapping if needed.</p>
                  </div>
                  {previewCases.length ? (
                    <label className="checkbox-field ai-preview-select-all">
                      <input
                        checked={isEveryPreviewSelected}
                        onChange={(event) => setSelectedPreviewCaseIds(event.target.checked ? previewCases.map((item) => item.client_id) : [])}
                        type="checkbox"
                      />
                      {selectedPreviewCount}/{previewCases.length} selected
                    </label>
                  ) : null}
                </div>

                <div className="ai-case-list">
                  {previewCases.map((item) => (
                    <article className={selectedPreviewCaseIds.includes(item.client_id) ? "ai-case-card is-selected" : "ai-case-card"} key={item.client_id}>
                      <div className="step-card-top">
                        <label className="checkbox-field ai-preview-case-check">
                          <input
                            checked={selectedPreviewCaseIds.includes(item.client_id)}
                            onChange={(event) => handleTogglePreviewCase(item.client_id, event.target.checked)}
                            type="checkbox"
                          />
                          <div>
                          <strong>{item.title}</strong>
                          <span className="ai-case-meta">
                            Priority {item.priority} · {item.step_count} steps{item.applicable_domain ? ` · ${item.applicable_domain}` : ""}
                          </span>
                          </div>
                        </label>
                        <button className="ghost-button danger" onClick={() => onRemovePreviewCase(item.client_id)} type="button">
                          Delete
                        </button>
                      </div>

                      <span>{richTextToPlainText(item.description) || "No description generated."}</span>

                      {scopedPreviewRequirements.length ? (
                        <div className="ai-case-requirements">
                          <strong>Requirement mapping</strong>
                          <div className="selection-chip-row">
                            {scopedPreviewRequirements.map((requirement) => {
                              const isSelected = item.requirement_ids.includes(requirement.id);

                              return (
                                <button
                                  className={isSelected ? "selection-chip is-selected" : "selection-chip is-unselected"}
                                  disabled={!onTogglePreviewRequirement}
                                  key={`${item.client_id}-${requirement.id}`}
                                  onClick={() => onTogglePreviewRequirement?.(item.client_id, requirement.id)}
                                  type="button"
                                >
                                  {requirement.title}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}

                      <div className="detail-summary compact-summary">
                        <strong>{item.step_count} standard step{item.step_count === 1 ? "" : "s"}</strong>
                        <span>Accepted AI drafts start as standard steps. Add shared groups or group steps after they land in the library.</span>
                      </div>

                      <div className="ai-case-steps">
                        {item.steps.map((step) => (
                          <div className="ai-case-step-card" key={`${item.client_id}-${step.step_order}`}>
                            <div className="step-card-summary">
                              <div className="step-card-summary-top">
                                <strong>Step {step.step_order}</strong>
                                <span className="step-kind-badge">Standard step</span>
                              </div>
                              <span>{step.action || "No action"}</span>
                            </div>
                            <span className="ai-case-step-expected">{step.expected_result || "No expected result"}</span>
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
                  {!previewCases.length ? (
                    <div className="empty-state compact ai-generation-empty-state ai-generation-empty-state--wide">
                      <strong>No AI drafts yet</strong>
                      <span>Generate a preview to review new test cases, mappings, and steps before accepting them.</span>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="action-row ai-studio-footer">
              <button className="primary-button ai-studio-accept-button" disabled={disableAccept || !selectedPreviewCount} onClick={() => onAccept(selectedPreviewCaseIds)} type="button">
                {isAccepting ? "Accepting…" : selectedPreviewCount ? `${acceptLabel} (${selectedPreviewCount})` : "Select cases to accept"}
              </button>
            </div>
          </div>
        </div>
        </div>
      </div>
      {requirementDialog && typeof document !== "undefined" ? createPortal(requirementDialog, document.body) : requirementDialog}
    </>
  );
}

function AiExpandIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24" width="16">
      <path d="M8 3H3v5" />
      <path d="M3 3l7 7" />
      <path d="M16 21h5v-5" />
      <path d="M21 21l-7-7" />
    </svg>
  );
}

function AiSidebarChevronIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="18" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24" width="18">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function AiViewIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24" width="16">
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function AiAttachIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24" width="16">
      <path d="m21.4 11.6-8.7 8.7a6 6 0 0 1-8.5-8.5l9.4-9.4a4 4 0 0 1 5.7 5.7l-9.4 9.4a2 2 0 0 1-2.8-2.8l8.7-8.7" />
    </svg>
  );
}

function AiSparkSmallIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24" width="16">
      <path d="m12 3 1.6 4.7L18 10l-4.4 2.3L12 17l-1.6-4.7L6 10l4.4-2.3Z" />
      <path d="M19 14v4" />
      <path d="M21 16h-4" />
    </svg>
  );
}
