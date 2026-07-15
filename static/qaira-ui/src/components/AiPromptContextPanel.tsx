import { useState } from "react";
import { SparkIcon, UploadIcon } from "./AppIcons";
import { AiPromptTemplatePicker } from "./AiPromptTemplatePicker";
import { FormField } from "./FormField";
import { api } from "../lib/api";
import {
  buildFileContextSection,
  buildKnowledgeContextSection,
  buildRequirementContextSection,
  mergeAiContextPack
} from "../lib/aiDesignStudio";
import type { AiDesignImageInput, Requirement } from "../types";

export function AiPromptContextPanel({
  additionalContext,
  appTypeId,
  disabled = false,
  externalLinksText,
  onAddImages,
  onAdditionalContextChange,
  onExternalLinksTextChange,
  onRemoveImage,
  projectId,
  referenceImages,
  requirements = []
}: {
  additionalContext: string;
  appTypeId?: string;
  disabled?: boolean;
  externalLinksText: string;
  onAddImages: (files: FileList | null) => void;
  onAdditionalContextChange: (value: string) => void;
  onExternalLinksTextChange: (value: string) => void;
  onRemoveImage: (imageUrl: string) => void;
  projectId?: string;
  referenceImages: AiDesignImageInput[];
  requirements?: Requirement[];
}) {
  const [contextFiles, setContextFiles] = useState<FileList | null>(null);
  const [isBuildingContext, setIsBuildingContext] = useState(false);
  const [contextMessage, setContextMessage] = useState("");

  const buildSmartContext = async () => {
    setIsBuildingContext(true);
    setContextMessage("");

    try {
      const query = requirements.slice(0, 8).map((item) => item.title).filter(Boolean).join(" ");
      const knowledgePackage = projectId
        ? await api.knowledgeRepo.contextPackage(projectId, { app_type_id: appTypeId, query })
        : { knowledge: [] };
      const fileContext = await buildFileContextSection(contextFiles);
      onAdditionalContextChange(mergeAiContextPack(additionalContext, [
        "QAira smart context pack: use this material as supporting evidence and preserve human review before applying changes.",
        buildRequirementContextSection(requirements),
        buildKnowledgeContextSection(knowledgePackage.knowledge || []),
        fileContext.section
      ]));
      setContextMessage([
        requirements.length ? `${requirements.length} requirement${requirements.length === 1 ? "" : "s"}` : "",
        `${(knowledgePackage.knowledge || []).length} knowledge item${(knowledgePackage.knowledge || []).length === 1 ? "" : "s"}`,
        fileContext.section ? "file context" : "",
        fileContext.skipped.length ? `Skipped ${fileContext.skipped.length}` : ""
      ].filter(Boolean).join(" · "));
    } catch (error) {
      setContextMessage(error instanceof Error ? error.message : "Unable to build smart context.");
    } finally {
      setIsBuildingContext(false);
    }
  };

  return (
    <section className="ai-studio-panel ai-prompt-context-panel">
      <div className="ai-prompt-context-head">
        <span>Additional context</span>
        <AiPromptTemplatePicker
          appTypeId={appTypeId}
          disabled={disabled}
          onApply={onAdditionalContextChange}
          projectId={projectId}
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
              disabled={disabled}
              multiple
              onChange={(event) => setContextFiles(event.target.files)}
              type="file"
            />
            <UploadIcon />
            <span>{contextFiles?.length ? `${contextFiles.length} file${contextFiles.length === 1 ? "" : "s"}` : "Add files"}</span>
          </label>
          <button
            className="primary-button compact ai-smart-context-button"
            disabled={disabled || isBuildingContext}
            onClick={() => void buildSmartContext()}
            type="button"
          >
            <SparkIcon />
            <span>{isBuildingContext ? "Packing..." : "Add smart context"}</span>
          </button>
        </div>
        {contextMessage ? <span className="ai-smart-context-note">{contextMessage}</span> : null}
      </div>

      <FormField label="Prompt copy">
        <textarea
          disabled={disabled}
          placeholder="Release goals, risky flows, browser/device notes, compliance rules, known gaps..."
          rows={5}
          value={additionalContext}
          onChange={(event) => onAdditionalContextChange(event.target.value)}
        />
      </FormField>

      <FormField label="External links">
        <textarea
          disabled={disabled}
          placeholder="One link per line"
          rows={3}
          value={externalLinksText}
          onChange={(event) => onExternalLinksTextChange(event.target.value)}
        />
      </FormField>

      <FormField label="Reference photos">
        <input
          accept="image/*"
          disabled={disabled}
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
              <div className="ai-reference-image-preview"><img alt={image.name || "Reference"} src={image.url} /></div>
              <div className="ai-reference-image-copy"><strong>{image.name || "Reference image"}</strong></div>
              <button className="ghost-button danger compact" onClick={() => onRemoveImage(image.url)} type="button">Remove</button>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state compact">Add screenshots or reference photos to give the model visual context.</div>
      )}
    </section>
  );
}
