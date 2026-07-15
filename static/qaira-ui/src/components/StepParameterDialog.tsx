import { useState, type ReactNode } from "react";
import { useDialogFocus } from "../hooks/useDialogFocus";
import { DialogCloseButton } from "./DialogCloseButton";
import { FormField } from "./FormField";
import type { StepParameterDefinition } from "../lib/stepParameters";
import { evaluateTestDataTemplate, TEST_DATA_GENERATOR_TEMPLATES } from "../lib/testDataGenerators";

type StepParameterDialogInputState = {
  disabled?: boolean;
  hint?: string;
  placeholder?: string;
};

type UtilityTemplate = {
  id: string;
  label: string;
  token: string;
  custom?: boolean;
};

const DEFAULT_UTILITY_TEMPLATES: UtilityTemplate[] = [
  { id: "random-number", label: "Random number", token: TEST_DATA_GENERATOR_TEMPLATES.randomNumber },
  { id: "random-string", label: "Random string", token: TEST_DATA_GENERATOR_TEMPLATES.randomString },
  { id: "ai-data", label: "AI data", token: TEST_DATA_GENERATOR_TEMPLATES.aiData },
  { id: "yopmail", label: "Yopmail email", token: TEST_DATA_GENERATOR_TEMPLATES.yopmail },
  { id: "today", label: "Today", token: TEST_DATA_GENERATOR_TEMPLATES.date },
  { id: "tomorrow", label: "Tomorrow", token: TEST_DATA_GENERATOR_TEMPLATES.tomorrow }
];

function StepParameterUtilityIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="15" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="15">
      <path d="M12 3v3" />
      <path d="M12 18v3" />
      <path d="m4.8 7.8 2.1 2.1" />
      <path d="m17.1 14.1 2.1 2.1" />
      <path d="M3 12h3" />
      <path d="M18 12h3" />
      <path d="m4.8 16.2 2.1-2.1" />
      <path d="m17.1 9.9 2.1-2.1" />
      <circle cx="12" cy="12" r="4.25" />
    </svg>
  );
}

export function StepParameterDialog({
  title,
  subtitle,
  parameters,
  values,
  onChange,
  onClose,
  headerContent,
  getInputState
}: {
  title: string;
  subtitle: string;
  parameters: StepParameterDefinition[];
  values: Record<string, string>;
  onChange: (name: string, value: string) => void;
  onClose: () => void;
  headerContent?: ReactNode;
  getInputState?: (parameter: StepParameterDefinition) => StepParameterDialogInputState;
}) {
  const dialogRef = useDialogFocus<HTMLDivElement>({ onClose });
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({
    t: true,
    s: true,
    r: true
  });
  const groupedParameters = [
    {
      scope: "t",
      title: "Test case data",
      items: parameters.filter((parameter) => parameter.scope === "t")
    },
    {
      scope: "s",
      title: "Suite-shared data",
      items: parameters.filter((parameter) => parameter.scope === "s")
    },
    {
      scope: "r",
      title: "Run data",
      items: parameters.filter((parameter) => parameter.scope === "r")
    }
  ].filter((group) => group.items.length);
  const parameterCount = parameters.length;
  const [activeUtilityParameter, setActiveUtilityParameter] = useState("");
  const [utilityDrafts, setUtilityDrafts] = useState<Record<string, string>>({});
  const [utilityFeedbackByParameter, setUtilityFeedbackByParameter] = useState<Record<string, string>>({});
  const [utilityTemplateSearch, setUtilityTemplateSearch] = useState("");
  const [customUtilityTemplates, setCustomUtilityTemplates] = useState<UtilityTemplate[]>([]);
  const [customUtilityLabel, setCustomUtilityLabel] = useState("");
  const [customUtilityToken, setCustomUtilityToken] = useState("");
  const utilityTemplates = [...DEFAULT_UTILITY_TEMPLATES, ...customUtilityTemplates].filter((template) => {
    const query = utilityTemplateSearch.trim().toLowerCase();
    return !query || [template.label, template.token].some((value) => value.toLowerCase().includes(query));
  });
  const toggleParameterGroup = (scope: string) => {
    setCollapsedGroups((current) => {
      const willCollapseSelected = !current[scope];
      return {
        t: true,
        s: true,
        r: true,
        [scope]: willCollapseSelected
      };
    });
  };

  const addCustomUtilityTemplate = () => {
    const label = customUtilityLabel.trim();
    const token = customUtilityToken.trim();

    if (!label || !token) {
      return;
    }

    setCustomUtilityTemplates((current) => [
      ...current,
      {
        id: `custom-${Date.now()}`,
        label,
        token,
        custom: true
      }
    ]);
    setCustomUtilityLabel("");
    setCustomUtilityToken("");
  };

  const toggleUtilityBuilder = (parameterName: string) => {
    const nextValue = activeUtilityParameter === parameterName ? "" : parameterName;

    if (nextValue) {
      setUtilityDrafts((currentDrafts) =>
        Object.prototype.hasOwnProperty.call(currentDrafts, parameterName)
          ? currentDrafts
          : { ...currentDrafts, [parameterName]: values[parameterName] || "" }
      );
    }

    setActiveUtilityParameter(nextValue);
  };

  const appendUtilityToken = (parameterName: string, token: string) => {
    setUtilityDrafts((currentDrafts) => ({
      ...currentDrafts,
      [parameterName]: `${currentDrafts[parameterName] || values[parameterName] || ""}${token}`
    }));
    setUtilityFeedbackByParameter((current) => ({
      ...current,
      [parameterName]: ""
    }));
  };

  const applyUtilityTemplate = (parameterName: string) => {
    const template = utilityDrafts[parameterName] || "";
    const sampleValue = evaluateTestDataTemplate(template);

    onChange(parameterName, template);
    setUtilityFeedbackByParameter((current) => ({
      ...current,
      [parameterName]: sampleValue
        ? `Template saved. Example for a new run: ${sampleValue}`
        : "Saved an empty generator template."
    }));
  };

  const applyUtilityStaticValue = (parameterName: string) => {
    const template = utilityDrafts[parameterName] || "";
    const sampleValue = evaluateTestDataTemplate(template);

    onChange(parameterName, sampleValue);
    setUtilityDrafts((currentDrafts) => ({
      ...currentDrafts,
      [parameterName]: sampleValue
    }));
    setUtilityFeedbackByParameter((current) => ({
      ...current,
      [parameterName]: sampleValue
        ? `Static value saved now: ${sampleValue}`
        : "Saved an empty static value."
    }));
  };

  return (
    <div className="modal-backdrop modal-backdrop--scroll" onClick={onClose} role="presentation">
      <div
        aria-labelledby="step-parameter-dialog-title"
        aria-modal="true"
        className="modal-card suite-create-modal step-parameter-dialog"
        onClick={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="suite-create-header step-parameter-dialog-header">
          <div className="suite-create-title">
            <h2 className="dialog-title" id="step-parameter-dialog-title">{title}</h2>
            {subtitle ? <span>{subtitle}</span> : null}
          </div>
          <div className="step-parameter-dialog-head-meta">
            <span className="count-pill">{parameterCount} field{parameterCount === 1 ? "" : "s"}</span>
            <DialogCloseButton label={`Close ${title}`} onClick={onClose} />
          </div>
        </div>

        <div className="step-parameter-dialog-body">
          {headerContent ? <div className="step-parameter-dialog-header-slot">{headerContent}</div> : null}
          {parameters.length ? (
            <div className="step-parameter-list">
              {groupedParameters.map((group, groupIndex) => (
                <section className="step-parameter-group" key={group.scope}>
                  <div
                    className="step-parameter-group-head"
                    onClick={() => toggleParameterGroup(group.scope)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        toggleParameterGroup(group.scope);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <button
                      aria-expanded={!collapsedGroups[group.scope]}
                      className="step-parameter-group-toggle"
                      data-autofocus={groupIndex === 0 ? "true" : undefined}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleParameterGroup(group.scope);
                      }}
                      type="button"
                    >
                      <span aria-hidden="true">{collapsedGroups[group.scope] ? "+" : "-"}</span>
                      <strong>{group.title}</strong>
                    </button>
                    <span>{group.items.length} item{group.items.length === 1 ? "" : "s"}</span>
                  </div>
                  {!collapsedGroups[group.scope] ? (
                    <div className="step-parameter-group-items">
                      {group.items.map((parameter) => {
                        const inputState = getInputState?.(parameter) || {};

                        return (
                          <div className="step-parameter-row" key={parameter.name}>
                            <FormField
                              label={parameter.token}
                              hint={inputState.hint || `${parameter.occurrenceCount} reference${parameter.occurrenceCount === 1 ? "" : "s"} in this design`}
                            >
                              <div className="step-parameter-input-row">
                                <input
                                  disabled={inputState.disabled}
                                  placeholder={inputState.placeholder || `Value for ${parameter.token}`}
                                  value={values[parameter.name] || ""}
                                  onChange={(event) => onChange(parameter.name, event.target.value)}
                                />
                                <button
                                  aria-label={`Open utility generator for ${parameter.token}`}
                                  className={activeUtilityParameter === parameter.name ? "step-parameter-utility-trigger is-active" : "step-parameter-utility-trigger"}
                                  disabled={inputState.disabled}
                                  onClick={() => toggleUtilityBuilder(parameter.name)}
                                  title="Open generation utilities"
                                  type="button"
                                >
                                  <StepParameterUtilityIcon />
                                </button>
                              </div>
                              {activeUtilityParameter === parameter.name ? (
                                <div aria-label={`Data utilities for ${parameter.token}`} className="step-parameter-utility-panel" role="dialog">
                                  <div className="step-parameter-utility-modal-head">
                                    <div>
                                      <strong>Data utilities</strong>
                                      <span>Build a reusable generator template or save a generated static sample.</span>
                                    </div>
                                    <button className="ghost-button compact" onClick={() => setActiveUtilityParameter("")} type="button">Close</button>
                                  </div>
                                  <div className="step-parameter-utility-search-row">
                                    <input
                                      aria-label="Search generator templates"
                                      placeholder="Search generator templates"
                                      value={utilityTemplateSearch}
                                      onChange={(event) => setUtilityTemplateSearch(event.target.value)}
                                    />
                                  </div>
                                  <div className="step-parameter-utility-actions">
                                    {utilityTemplates.map((template) => (
                                      <span className="step-parameter-utility-template-chip" key={template.id}>
                                        <button className="ghost-button" onClick={() => appendUtilityToken(parameter.name, template.token)} title="Add this utility to the draft template" type="button">
                                          <strong>{template.label}</strong>
                                          <code>{template.token}</code>
                                        </button>
                                        {template.custom ? (
                                          <button
                                            aria-label={`Delete ${template.label} template`}
                                            className="step-parameter-utility-delete"
                                            onClick={() => setCustomUtilityTemplates((current) => current.filter((item) => item.id !== template.id))}
                                            type="button"
                                          >
                                            ×
                                          </button>
                                        ) : null}
                                      </span>
                                    ))}
                                  </div>
                                  <div className="step-parameter-utility-add-row">
                                    <input
                                      aria-label="Template label"
                                      placeholder="Template label"
                                      value={customUtilityLabel}
                                      onChange={(event) => setCustomUtilityLabel(event.target.value)}
                                    />
                                    <input
                                      aria-label="Template token"
                                      placeholder="{{aiData:customer email}}"
                                      value={customUtilityToken}
                                      onChange={(event) => setCustomUtilityToken(event.target.value)}
                                    />
                                    <button className="ghost-button" onClick={addCustomUtilityTemplate} type="button">
                                      Add
                                    </button>
                                  </div>
                                  <textarea
                                    className="step-parameter-utility-template"
                                    onChange={(event) => {
                                      const nextValue = event.target.value;
                                      setUtilityDrafts((currentDrafts) => ({
                                        ...currentDrafts,
                                        [parameter.name]: nextValue
                                      }));
                                      setUtilityFeedbackByParameter((current) => ({
                                        ...current,
                                        [parameter.name]: ""
                                      }));
                                    }}
                                    placeholder="Example: ORD-{{randomNumber:6}}-{{date:YYYYMMDD}}"
                                    rows={3}
                                    value={utilityDrafts[parameter.name] || ""}
                                  />
                                  <div className="step-parameter-utility-footer">
                                    <button className="primary-button" onClick={() => applyUtilityTemplate(parameter.name)} title="Save the template so every run resolves a fresh value" type="button">
                                      Randomize each run
                                    </button>
                                    <button className="ghost-button" onClick={() => applyUtilityStaticValue(parameter.name)} title="Resolve the template now and save the generated value as static data" type="button">
                                      Use static sample
                                    </button>
                                    <span>Template keeps values dynamic; static sample writes one generated value into this reference.</span>
                                  </div>
                                  {utilityFeedbackByParameter[parameter.name] ? (
                                    <span className="step-parameter-utility-feedback">{utilityFeedbackByParameter[parameter.name]}</span>
                                  ) : null}
                                </div>
                              ) : null}
                            </FormField>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </section>
              ))}
            </div>
          ) : (
            <div className="empty-state compact">No `@params` detected in these steps yet.</div>
          )}
        </div>

        <div className="step-parameter-dialog-footer">
          <button className="ghost-button" onClick={onClose} type="button">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
