import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { TestCase, TestSuite } from "../types";

export type RunHookType = "BEFORE_ALL" | "AFTER_ALL" | "BEFORE_SUITE" | "AFTER_SUITE" | "BEFORE_TEST" | "AFTER_TEST";
export type RunHookItemType = "suite" | "test";

export type RunHookSelection = {
  id: string;
  hookType: RunHookType;
  itemType: RunHookItemType;
  itemId: string;
  name: string;
};

type HookDefinition = {
  type: RunHookType;
  label: string;
  description: string;
};

const HOOK_DEFINITIONS: HookDefinition[] = [
  { type: "BEFORE_ALL", label: "Before Run", description: "Runs once before the entire run starts." },
  { type: "BEFORE_SUITE", label: "Before Suite", description: "Runs before each selected suite starts." },
  { type: "BEFORE_TEST", label: "Before Test", description: "Runs before each test case starts." },
  { type: "AFTER_TEST", label: "After Test", description: "Runs after each test case completes." },
  { type: "AFTER_SUITE", label: "After Suite", description: "Runs after each selected suite completes." },
  { type: "AFTER_ALL", label: "After Run", description: "Runs once after the entire run completes." }
];

function makeHookId(hookType: RunHookType, itemType: RunHookItemType, itemId: string) {
  return `${hookType}:${itemType}:${itemId}`;
}

function hookTypeLabel(hookType: RunHookType) {
  return HOOK_DEFINITIONS.find((definition) => definition.type === hookType)?.label || "Run Hook";
}

export function RunHooksBuilder({
  value,
  onChange,
  suites,
  testCases
}: {
  value: RunHookSelection[];
  onChange: (nextHooks: RunHookSelection[]) => void;
  suites: TestSuite[];
  testCases: TestCase[];
}) {
  const [activeHookType, setActiveHookType] = useState<RunHookType>("BEFORE_ALL");
  const [pickerHookType, setPickerHookType] = useState<RunHookType | null>(null);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerSelectedIds, setPickerSelectedIds] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestedHooks, setSuggestedHooks] = useState<RunHookSelection[]>([]);
  const activeDefinition = HOOK_DEFINITIONS.find((definition) => definition.type === activeHookType) || HOOK_DEFINITIONS[0];
  const activeHooks = value.filter((hook) => hook.hookType === activeHookType);
  const normalizedSearch = pickerSearch.trim().toLowerCase();

  const filteredSuites = useMemo(
    () => suites.filter((suite) => !normalizedSearch || suite.name.toLowerCase().includes(normalizedSearch)),
    [normalizedSearch, suites]
  );
  const filteredTestCases = useMemo(
    () => testCases.filter((testCase) => !normalizedSearch || testCase.title.toLowerCase().includes(normalizedSearch)),
    [normalizedSearch, testCases]
  );

  const openPicker = (hookType: RunHookType) => {
    setPickerHookType(hookType);
    setPickerSearch("");
    setPickerSelectedIds([]);
  };

  const openSuggestions = () => {
    // simple heuristic-based suggestions (client-side AI stub)
    const suggestions: RunHookSelection[] = [];
    // global before-run suggestions
    suggestions.push({
      id: makeHookId("BEFORE_ALL", "test", "prepare-global"),
      hookType: "BEFORE_ALL",
      itemType: "test",
      itemId: "prepare-global",
      name: "Prepare test environment"
    });

    // suggest per-suite hooks for up to 5 suites
    suites.slice(0, 5).forEach((suite) => {
      suggestions.push({
        id: makeHookId("BEFORE_SUITE", "suite", suite.id),
        hookType: "BEFORE_SUITE",
        itemType: "suite",
        itemId: suite.id,
        name: `Seed data for ${suite.name}`
      });
    });

    // suggest per-test hooks for up to 5 test cases
    testCases.slice(0, 5).forEach((testCase) => {
      suggestions.push({
        id: makeHookId("BEFORE_TEST", "test", testCase.id),
        hookType: "BEFORE_TEST",
        itemType: "test",
        itemId: testCase.id,
        name: `Reset state for ${testCase.title}`
      });
    });

    setSuggestedHooks(suggestions);
    setShowSuggestions(true);
  };

  const closePicker = () => {
    setPickerHookType(null);
    setPickerSearch("");
    setPickerSelectedIds([]);
  };

  const selectedIdsForPickerType = new Set(
    value
      .filter((hook) => hook.hookType === pickerHookType)
      .map((hook) => `${hook.itemType}:${hook.itemId}`)
  );

  const togglePickerItem = (itemKey: string) => {
    if (selectedIdsForPickerType.has(itemKey)) {
      return;
    }

    setPickerSelectedIds((current) =>
      current.includes(itemKey)
        ? current.filter((id) => id !== itemKey)
        : [...current, itemKey]
    );
  };

  const addPickerHooks = () => {
    if (!pickerHookType || !pickerSelectedIds.length) {
      closePicker();
      return;
    }

    const suiteById = new Map(suites.map((suite) => [suite.id, suite]));
    const caseById = new Map(testCases.map((testCase) => [testCase.id, testCase]));
    const additions = pickerSelectedIds
      .map((itemKey) => {
        const [itemType, itemId] = itemKey.split(":") as [RunHookItemType, string];
        const item = itemType === "suite" ? suiteById.get(itemId) : caseById.get(itemId);

        if (!item) {
          return null;
        }

        return {
          id: makeHookId(pickerHookType, itemType, itemId),
          hookType: pickerHookType,
          itemType,
          itemId,
          name: itemType === "suite" ? (item as TestSuite).name : (item as TestCase).title
        };
      })
      .filter((hook): hook is RunHookSelection => Boolean(hook));

    const existingIds = new Set(value.map((hook) => hook.id));
    onChange([...value, ...additions.filter((hook) => !existingIds.has(hook.id))]);
    closePicker();
  };

  const addSuggestedHook = (hook: RunHookSelection) => {
    const existingIds = new Set(value.map((h) => h.id));
    if (!existingIds.has(hook.id)) {
      onChange([...value, hook]);
    }
    // remove from suggestions list visually
    setSuggestedHooks((current) => current.filter((h) => h.id !== hook.id));
  };

  const suggestionsModal = showSuggestions ? (
    <div className="hook-picker-backdrop" role="presentation" onClick={() => setShowSuggestions(false)}>
      <div
        aria-label={`Suggested hooks`}
        aria-modal="true"
        className="hook-picker-dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="hook-picker-header">
          <div>
            <strong>Suggested hooks</strong>
            <span>AI-driven suggestions based on your suites and test cases.</span>
          </div>
          <button className="ghost-button" onClick={() => setShowSuggestions(false)} type="button">Close</button>
        </div>
        <div className="hook-picker-list">
          <section>
            {suggestedHooks.length ? (
              suggestedHooks.map((hook) => (
                <label className="hook-picker-option" key={hook.id}>
                  <span>{hook.name}</span>
                  <small>{hook.hookType.replace(/_/g, " ")}</small>
                  <div style={{marginLeft: '0.5rem'}}>
                    <button className="primary-button" type="button" onClick={() => addSuggestedHook(hook)}>Add</button>
                  </div>
                </label>
              ))
            ) : (
              <p>No suggestions available.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  ) : null;

  const removeHook = (hookId: string) => {
    onChange(value.filter((hook) => hook.id !== hookId));
  };

  const moveHook = (hookId: string, direction: -1 | 1) => {
    const scoped = value.filter((hook) => hook.hookType === activeHookType);
    const scopedIndex = scoped.findIndex((hook) => hook.id === hookId);
    const nextScopedIndex = scopedIndex + direction;

    if (scopedIndex < 0 || nextScopedIndex < 0 || nextScopedIndex >= scoped.length) {
      return;
    }

    const nextScoped = [...scoped];
    const [moved] = nextScoped.splice(scopedIndex, 1);
    nextScoped.splice(nextScopedIndex, 0, moved);
    const queue = [...nextScoped];
    onChange(value.map((hook) => hook.hookType === activeHookType ? queue.shift() || hook : hook));
  };

  const picker = pickerHookType ? (
    <div className="hook-picker-backdrop" role="presentation" onClick={closePicker}>
      <div
        aria-label={`Add hooks to ${hookTypeLabel(pickerHookType)}`}
        aria-modal="true"
        className="hook-picker-dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="hook-picker-header">
          <div>
            <strong>Add hooks to {hookTypeLabel(pickerHookType)}</strong>
            <span>Select suites or test cases. Suites appear first.</span>
          </div>
          <button className="ghost-button" onClick={closePicker} type="button">Close</button>
        </div>
        <input
          autoFocus
          className="hook-picker-search"
          onChange={(event) => setPickerSearch(event.target.value)}
          placeholder="Search suites or test cases..."
          value={pickerSearch}
        />
        <div className="hook-picker-list">
          <section>
            <h5>Suites</h5>
            {filteredSuites.map((suite) => {
              const key = `suite:${suite.id}`;
              const alreadySelected = selectedIdsForPickerType.has(key);
              const checked = alreadySelected || pickerSelectedIds.includes(key);

              return (
                <label className={alreadySelected ? "hook-picker-option is-selected" : "hook-picker-option"} key={suite.id}>
                  <input
                    checked={checked}
                    disabled={alreadySelected}
                    onChange={() => togglePickerItem(key)}
                    type="checkbox"
                  />
                  <span>{suite.name}</span>
                  <small>Suite</small>
                </label>
              );
            })}
            {!filteredSuites.length ? <p>No suites match this search.</p> : null}
          </section>
          <section>
            <h5>Test Cases</h5>
            {filteredTestCases.map((testCase) => {
              const key = `test:${testCase.id}`;
              const alreadySelected = selectedIdsForPickerType.has(key);
              const checked = alreadySelected || pickerSelectedIds.includes(key);

              return (
                <label className={alreadySelected ? "hook-picker-option is-selected" : "hook-picker-option"} key={testCase.id}>
                  <input
                    checked={checked}
                    disabled={alreadySelected}
                    onChange={() => togglePickerItem(key)}
                    type="checkbox"
                  />
                  <span>{testCase.title}</span>
                  <small>Test Case</small>
                </label>
              );
            })}
            {!filteredTestCases.length ? <p>No test cases match this search.</p> : null}
          </section>
        </div>
        <div className="hook-picker-footer">
          <button className="ghost-button" onClick={closePicker} type="button">Cancel</button>
          <button className="primary-button" disabled={!pickerSelectedIds.length} onClick={addPickerHooks} type="button">
            Add selected hooks
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <section className="run-hooks-builder">
      <div className="run-hooks-builder-header">
        <div>
          <span className="eyebrow">Run Hooks</span>
          <h4>Setup and cleanup automation</h4>
          <p>Configure what runs before or after the run, suites, and individual tests.</p>
        </div>
      </div>
      <div className="run-hooks-tabs" role="tablist" aria-label="Run hook sections">
        {HOOK_DEFINITIONS.map((definition) => (
          <button
            aria-selected={activeHookType === definition.type}
            className={activeHookType === definition.type ? "is-active" : ""}
            key={definition.type}
            onClick={() => setActiveHookType(definition.type)}
            role="tab"
            type="button"
          >
            {definition.label}
          </button>
        ))}
      </div>
      <div className="run-hook-card">
        <div className="run-hook-card-header">
          <div>
            <strong>{activeDefinition.label}</strong>
            <span>{activeDefinition.description}</span>
          </div>
          <div style={{display: 'flex', gap: '0.5rem'}}>
            <button className="ghost-button" onClick={() => openSuggestions()} type="button">Suggest</button>
            <button className="ghost-button" onClick={() => openPicker(activeDefinition.type)} type="button">+ Add hook</button>
          </div>
        </div>
        {activeHooks.length ? (
          <div className="run-hook-list">
            {activeHooks.map((hook, index) => (
              <div className="run-hook-row" key={hook.id}>
                <span className="run-hook-order">{index + 1}</span>
                <span className="run-hook-drag" aria-hidden="true">::</span>
                <strong>{hook.name}</strong>
                <span className="run-hook-type-badge">{hook.itemType === "suite" ? "Suite" : "Test Case"}</span>
                <div className="run-hook-actions">
                  <button disabled={index === 0} onClick={() => moveHook(hook.id, -1)} type="button">Up</button>
                  <button disabled={index === activeHooks.length - 1} onClick={() => moveHook(hook.id, 1)} type="button">Down</button>
                  <button onClick={() => removeHook(hook.id)} type="button">Remove</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="run-hook-empty">No hooks configured.</div>
        )}
      </div>
      {picker && typeof document !== "undefined" ? createPortal(picker, document.body) : null}
      {suggestionsModal && typeof document !== "undefined" ? createPortal(suggestionsModal, document.body) : null}
    </section>
  );
}
