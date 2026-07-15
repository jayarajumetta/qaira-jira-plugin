import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import {
  AI_PROMPT_LLM_OVERRIDES_KEY,
  AI_PROMPT_OVERRIDES_KEY,
  normalizeAiPromptLlmOverrides,
  normalizeAiPromptOverrides,
  resolveAiPromptRegistryValue,
  type AiPromptLlmOverrides,
  type AiPromptOverrides
} from "../lib/aiPromptRegistry";

export function useAiPromptRegistry(enabled = true) {
  const query = useQuery({
    queryKey: ["settings", "workspace-preferences", "ai-prompts"],
    queryFn: api.settings.getWorkspacePreferences,
    enabled
  });

  const overrides = useMemo<AiPromptOverrides>(
    () => normalizeAiPromptOverrides(query.data?.preferences?.[AI_PROMPT_OVERRIDES_KEY]),
    [query.data]
  );
  const llmOverrides = useMemo<AiPromptLlmOverrides>(
    () => normalizeAiPromptLlmOverrides(query.data?.preferences?.[AI_PROMPT_LLM_OVERRIDES_KEY]),
    [query.data]
  );

  const getPrompt = useCallback(
    (key: string) => resolveAiPromptRegistryValue(key, overrides),
    [overrides]
  );
  const getLlmIntegrationId = useCallback(
    (key: string) => llmOverrides[key] || "",
    [llmOverrides]
  );

  return {
    getPrompt,
    getLlmIntegrationId,
    overrides,
    llmOverrides,
    query
  };
}
