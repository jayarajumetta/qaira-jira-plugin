export type AiPromptRegistryItem = {
  key: string;
  label: string;
  value: string;
  surface: string;
};

export const AI_PROMPT_OVERRIDES_KEY = "ai_prompt_registry_overrides";
export const AI_PROMPT_LLM_OVERRIDES_KEY = "ai_prompt_registry_llm_overrides";

export const AI_PROMPT_REGISTRY: AiPromptRegistryItem[] = [
  {
    key: "ai.case_authoring.full_case",
    label: "Case authoring",
    surface: "Manual test case AI authoring",
    value: "Generate or improve a reusable manual test case as strict JSON, preserving requirement intent, app type context, step types, and @t test-data tokens."
  },
  {
    key: "ai.case_authoring.step_rephrase",
    label: "Step rephrase",
    surface: "Manual test step AI rephrase",
    value: "Rewrite one selected step into a concise executable action and expected result while preserving business intent, data tokens, and platform step type."
  },
  {
    key: "ai.requirement.optimization",
    label: "Requirement completion",
    surface: "Requirement AI completion",
    value: "Complete weak requirement details with acceptance criteria, risks, assumptions, and linked coverage guidance using available test case and knowledge context."
  },
  {
    key: "ai.execution.analysis",
    label: "Execution analysis",
    surface: "Run failure analysis",
    value: "Analyze execution evidence and logs, identify likely root causes, impacted requirements, recommended fixes, and concise release risk guidance."
  },
  {
    key: "ai.execution.smart_plan",
    label: "Smart execution planning",
    surface: "AI smart run planning",
    value: "Plan an impact-based execution run from release scope, changed requirements, suite coverage, recent failures, and available case metadata."
  },
  {
    key: "ai.automation.keyword_generation",
    label: "Automation keyword generation",
    surface: "Automation builder",
    value: "Convert manual steps into grouped automation keywords with locator references, test data references, and stable execution-ready actions."
  },
  {
    key: "ai.automation.review",
    label: "Automation review",
    surface: "Automation case review",
    value: "Review the original manual case, its automation keyword steps, repository bindings, verification points, grouping, and coding standards. Suggest and regenerate optimized automation without removing business intent. Preserve @t and @s data scope tokens."
  },
  {
    key: "ai.automation.step_rephrase",
    label: "Automation step rephrase",
    surface: "Automation keyword step AI rephrase",
    value: "Improve this automation keyword step for clarity, verification strength, and coding standard alignment. Keep locator/object references and @t/@s tokens intact."
  },
  {
    key: "ai.automation.gap_analysis",
    label: "Automation gap analysis",
    surface: "Manual-to-automation gap fill",
    value: "Analyze the manual steps on this test case. Fill missing automation between actions, generate any missing manual step text implied by the flow, and attach each executable QAira keyword to its matching step on this same case across web, API, and mobile automation."
  },
  {
    key: "ai.execution.network_to_api_steps",
    label: "Network to API steps",
    surface: "Execution console network capture",
    value: "Map meaningful business API requests from the selected web execution network calls onto API automation steps in this same original test case. Preserve existing manual and web steps. Create additional API step rows on this case only when required. Never create a companion or duplicate test case."
  },
  {
    key: "ai.automation.locator_repair",
    label: "Locator repair",
    surface: "Object repository repair",
    value: "Repair weak or missing locators from DOM, labels, screenshots, and learned object repository context without changing the step intent."
  },
  {
    key: "ai.test_data.synthetic",
    label: "Synthetic test data",
    surface: "Test data generation",
    value: "Generate realistic reusable test data values from a field hint while avoiding brittle placeholder names unless no better context exists."
  }
];

export type AiPromptOverrides = Record<string, string>;
export type AiPromptLlmOverrides = Record<string, string>;

export function normalizeAiPromptOverrides(input: unknown): AiPromptOverrides {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(input as Record<string, unknown>)
      .filter(([key, value]) => typeof key === "string" && key.trim() && typeof value === "string")
      .map(([key, value]) => [key.trim(), String(value)])
  );
}

export function normalizeAiPromptLlmOverrides(input: unknown): AiPromptLlmOverrides {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(input as Record<string, unknown>)
      .filter(([key, value]) => typeof key === "string" && key.trim() && typeof value === "string" && value.trim())
      .map(([key, value]) => [key.trim(), String(value).trim()])
  );
}

export function resolveAiPromptRegistryValue(key: string, overrides?: AiPromptOverrides) {
  const override = overrides?.[key]?.trim();
  const registryItem = AI_PROMPT_REGISTRY.find((item) => item.key === key);

  return override || registryItem?.value || "";
}
