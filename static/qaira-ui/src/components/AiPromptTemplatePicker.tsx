import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDialogFocus } from "../hooks/useDialogFocus";
import type { AiPromptTemplate } from "../types";
import { api } from "../lib/api";
import { AddIcon, SearchIcon, SparkIcon } from "./AppIcons";
import { DialogCloseButton } from "./DialogCloseButton";
import { FormField } from "./FormField";
import { InfoTooltip } from "./InfoTooltip";
import { LoadingState } from "./LoadingState";

const PROMPT_SCOPE = "test_case_generation";

type Draft = {
  name: string;
  description: string;
  domain: string;
  role: string;
  test_type: string;
  test_format: string;
  test_count: string;
  prompt_text: string;
  tags: string;
};

const emptyDraft: Draft = {
  name: "",
  description: "",
  domain: "",
  role: "",
  test_type: "",
  test_format: "",
  test_count: "6",
  prompt_text: "",
  tags: ""
};

function compactJoin(items: Array<string | null | undefined>) {
  return items.map((item) => String(item || "").trim()).filter(Boolean).join(" · ");
}

export function renderAiPromptTemplate(template: AiPromptTemplate) {
  const lines = [
    template.domain ? `Domain: ${template.domain}` : "",
    template.role ? `Role/persona: ${template.role}` : "",
    template.test_type ? `Type of tests: ${template.test_type}` : "",
    template.test_format ? `Expected format: ${template.test_format}` : "",
    template.test_count ? `Number of tests: ${template.test_count}` : "",
    "",
    "Prompt guidance:",
    template.prompt_text
  ].filter((line, index, array) => line || array[index - 1] !== "");

  return lines.join("\n").trim();
}

export function AiPromptTemplatePicker({
  projectId,
  appTypeId,
  onApply,
  disabled = false
}: {
  projectId?: string;
  appTypeId?: string;
  onApply: (prompt: string, template: AiPromptTemplate) => void;
  disabled?: boolean;
}) {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const query = useQuery({
    queryKey: ["ai-prompt-templates", projectId, appTypeId, PROMPT_SCOPE],
    queryFn: () => api.aiPromptTemplates.list({
      project_id: projectId,
      app_type_id: appTypeId,
      scope: PROMPT_SCOPE
    }),
    enabled: Boolean(isOpen && projectId)
  });
  const createTemplate = useMutation({
    mutationFn: () => {
      if (!projectId) {
        throw new Error("Select a project before saving prompt templates.");
      }

      return api.aiPromptTemplates.create({
        project_id: projectId,
        app_type_id: appTypeId || undefined,
        scope: PROMPT_SCOPE,
        name: draft.name,
        description: draft.description || undefined,
        domain: draft.domain || undefined,
        role: draft.role || undefined,
        test_type: draft.test_type || undefined,
        test_format: draft.test_format || undefined,
        test_count: Number(draft.test_count) || undefined,
        prompt_text: draft.prompt_text,
        applies_to: ["requirements", "test_cases"],
        tags: draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean)
      });
    },
    onSuccess: (template) => {
      queryClient.setQueryData<AiPromptTemplate[]>(["ai-prompt-templates", projectId, appTypeId, PROMPT_SCOPE], (current) =>
        current ? [template, ...current] : [template]
      );
      setDraft(emptyDraft);
      onApply(renderAiPromptTemplate(template), template);
      setIsOpen(false);
    }
  });
  const closePicker = () => {
    if (!createTemplate.isPending) {
      setIsOpen(false);
    }
  };
  const dialogRef = useDialogFocus<HTMLDivElement>({
    active: isOpen,
    closeDisabled: createTemplate.isPending,
    onClose: closePicker
  });

  const templates = query.data || [];
  const filteredTemplates = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return templates;
    return templates.filter((template) =>
      [
        template.name,
        template.description,
        template.domain,
        template.role,
        template.test_type,
        template.test_format,
        template.prompt_text,
        ...(template.tags || [])
      ].some((value) => String(value || "").toLowerCase().includes(term))
    );
  }, [searchTerm, templates]);
  const saveDisabled = createTemplate.isPending || !draft.name.trim() || !draft.prompt_text.trim() || !projectId;

  return (
    <>
      <button
        className="ghost-button compact ai-prompt-template-trigger"
        disabled={disabled || !projectId}
        onClick={() => setIsOpen(true)}
        title="Search prompt templates"
        type="button"
      >
        <SearchIcon size={15} />
        <span>Prompt templates</span>
      </button>

      {isOpen ? (
        <div className="modal-backdrop" onClick={closePicker} role="presentation">
          <div
            aria-labelledby="ai-prompt-template-title"
            aria-modal="true"
            className="modal-card ai-prompt-template-modal"
            onClick={(event) => event.stopPropagation()}
            ref={dialogRef}
            role="dialog"
            tabIndex={-1}
          >
            <div className="import-modal-header">
              <div className="import-modal-title">
                <p className="dialog-context-label">Prompt library</p>
                <div className="modal-title-info-row">
                  <h2 className="dialog-title" id="ai-prompt-template-title">Choose or create a prompt template</h2>
                  <InfoTooltip
                    content="Selecting a template copies it into Additional context. You can edit that copy without changing the saved template."
                    label="Prompt library information"
                  />
                </div>
              </div>
              <DialogCloseButton disabled={createTemplate.isPending} label="Close prompt library" onClick={closePicker} />
            </div>

            <div className="ai-prompt-template-grid">
              <section className="ai-prompt-template-list">
                <label className="form-field">
                  <span>Search templates</span>
                  <input autoFocus onChange={(event) => setSearchTerm(event.target.value)} placeholder="Domain, role, test type, tag..." value={searchTerm} />
                </label>
                <div className="ai-prompt-template-results">
                  {query.isLoading ? <LoadingState label="Loading prompt templates" /> : null}
                  {filteredTemplates.map((template) => (
                    <article className="ai-prompt-template-card" key={template.id}>
                      <div>
                        <strong>{template.name}</strong>
                        <span>{template.description || compactJoin([template.domain, template.role, template.test_type]) || "Reusable AI generation guidance"}</span>
                        <small>{compactJoin([template.domain, template.role, template.test_type, template.test_format, template.test_count ? `${template.test_count} tests` : ""])}</small>
                      </div>
                      <button className="primary-button compact" onClick={() => {
                        onApply(renderAiPromptTemplate(template), template);
                        setIsOpen(false);
                      }} type="button">
                        <SparkIcon size={14} />
                        <span>Use</span>
                      </button>
                    </article>
                  ))}
                  {!query.isLoading && !filteredTemplates.length ? <div className="empty-state compact">No templates matched. Create one on the right and it will be saved permanently.</div> : null}
                </div>
              </section>

              <section className="ai-prompt-template-create">
                <div className="panel-head">
                  <div>
                    <div className="panel-title-row">
                      <p className="eyebrow">Add new prompt</p>
                      <InfoTooltip
                        content="Capture the repeatable prompt shape once, then reuse it from Requirements and Test Cases."
                        label="Add prompt information"
                      />
                    </div>
                  </div>
                </div>
                <div className="record-grid">
                  <FormField label="Template name">
                    <input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Checkout role-based regression" />
                  </FormField>
                  <FormField label="Domain">
                    <input value={draft.domain} onChange={(event) => setDraft((current) => ({ ...current, domain: event.target.value }))} placeholder="Payments, auth, CRM..." />
                  </FormField>
                  <FormField label="Role">
                    <input value={draft.role} onChange={(event) => setDraft((current) => ({ ...current, role: event.target.value }))} placeholder="Admin, guest, support user..." />
                  </FormField>
                  <FormField label="Type of test">
                    <input value={draft.test_type} onChange={(event) => setDraft((current) => ({ ...current, test_type: event.target.value }))} placeholder="Smoke, regression, negative..." />
                  </FormField>
                  <FormField label="Format of test">
                    <input value={draft.test_format} onChange={(event) => setDraft((current) => ({ ...current, test_format: event.target.value }))} placeholder="Manual, Gherkin, mobile-ready..." />
                  </FormField>
                  <FormField label="No. of tests">
                    <input min="1" max="50" type="number" value={draft.test_count} onChange={(event) => setDraft((current) => ({ ...current, test_count: event.target.value }))} />
                  </FormField>
                  <FormField label="Tags">
                    <input value={draft.tags} onChange={(event) => setDraft((current) => ({ ...current, tags: event.target.value }))} placeholder="regression, security, mobile" />
                  </FormField>
                  <FormField label="Prompt body">
                    <textarea rows={6} value={draft.prompt_text} onChange={(event) => setDraft((current) => ({ ...current, prompt_text: event.target.value }))} placeholder="Describe how the AI should think, what to include, and what to avoid." />
                  </FormField>
                </div>
                {createTemplate.isError ? (
                  <div className="inline-message error-message">{createTemplate.error instanceof Error ? createTemplate.error.message : "Unable to save prompt template."}</div>
                ) : null}
                <div className="testops-action-row">
                  <button className="primary-button" disabled={saveDisabled} onClick={() => createTemplate.mutate()} type="button">
                    <AddIcon size={15} />
                    <span>{createTemplate.isPending ? "Saving..." : "Save and use"}</span>
                  </button>
                </div>
              </section>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
