import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDialogFocus } from "../hooks/useDialogFocus";
import { api } from "../lib/api";
import { buildCaseAutomationCode } from "../lib/stepAutomation";
import { collectStepParameters, combineStepParameterValues, filterStepParameterValues, normalizeStepParameterValues } from "../lib/stepParameters";
import type { Requirement, TestCase, TestSuite } from "../types";
import { Panel } from "./Panel";
import { StatusBadge } from "./StatusBadge";
import { StepParameterDialog } from "./StepParameterDialog";
import { StepParameterizedText } from "./StepParameterizedText";
import { AutomationCodeIcon, CodePreviewDialog } from "./StepAutomationEditor";
import { RichTextContent } from "./RichTextEditor";
import { DialogCloseButton } from "./DialogCloseButton";
import { LoadingState } from "./LoadingState";
import { CollapseExpandIcon } from "./AppIcons";

const linkedCaseHistoryDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit"
});

const normalizeCaseParameterPreviewValues = (values?: TestCase["parameter_values"]) =>
  normalizeStepParameterValues((values || {}) as Record<string, string>, "t");

const normalizeSuiteParameterPreviewValues = (values?: TestSuite["parameter_values"]) =>
  normalizeStepParameterValues((values || {}) as Record<string, string>, "s");

const formatLinkedHistoryDate = (value?: string | null) => {
  if (!value) {
    return "Recent run";
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : linkedCaseHistoryDateFormatter.format(parsed);
};

export function LinkedTestCaseModal({
  appTypeName,
  projectName,
  requirements,
  selectedSuite,
  suites,
  testCase,
  onClose
}: {
  appTypeName: string;
  projectName: string;
  requirements: Requirement[];
  selectedSuite?: TestSuite | null;
  suites: TestSuite[];
  testCase: TestCase;
  onClose: () => void;
}) {
  const dialogRef = useDialogFocus<HTMLDivElement>({ onClose });
  const [expandedSections, setExpandedSections] = useState({
    details: false,
    steps: false,
    history: false
  });
  const [isParameterDialogOpen, setIsParameterDialogOpen] = useState(false);
  const [parameterValues, setParameterValues] = useState<Record<string, string>>(() =>
    combineStepParameterValues(
      normalizeCaseParameterPreviewValues(testCase.parameter_values),
      normalizeSuiteParameterPreviewValues(selectedSuite?.parameter_values)
    )
  );
  const [codePreviewState, setCodePreviewState] = useState<{ title: string; subtitle: string; code: string } | null>(null);

  const stepsQuery = useQuery({
    queryKey: ["linked-test-case-modal-steps", testCase.id],
    queryFn: () => api.testSteps.list({ test_case_id: testCase.id }),
    enabled: Boolean(testCase.id)
  });
  const historyQuery = useQuery({
    queryKey: ["linked-test-case-modal-history", testCase.id, testCase.app_type_id || ""],
    queryFn: () => api.executionResults.list({ test_case_id: testCase.id, app_type_id: testCase.app_type_id || undefined }),
    enabled: Boolean(testCase.id)
  });

  const linkedRequirementTitles = useMemo(
    () =>
      requirements
        .filter((requirement) => (testCase.requirement_ids || [testCase.requirement_id]).filter(Boolean).includes(requirement.id))
        .map((requirement) => requirement.title),
    [requirements, testCase.requirement_id, testCase.requirement_ids]
  );
  const linkedSuiteTitles = useMemo(
    () =>
      suites
        .filter((suite) => (testCase.suite_ids || [testCase.suite_id]).filter(Boolean).includes(suite.id))
        .map((suite) => suite.name),
    [suites, testCase.suite_id, testCase.suite_ids]
  );
  const steps = stepsQuery.data || [];
  const history = historyQuery.data || [];
  const detectedParameters = useMemo(
    () =>
      collectStepParameters(
        steps.map((step) => ({
          id: step.id,
          action: step.action,
          expected_result: step.expected_result,
          automation_code: step.automation_code,
          api_request: step.api_request
        }))
      ),
    [steps]
  );
  const stepSummary = steps.length
    ? `Starts with: ${steps[0]?.action || steps[0]?.expected_result || "No step preview yet."}`
    : "No steps added yet for this reusable test case.";
  const historySummary = history.length
    ? "Review the latest recorded outcomes and preserved run evidence for this reusable test case."
    : "No run history has been recorded for this reusable test case yet.";
  const parameterDialogHeaderContent = (
    <div className="step-parameter-dialog-context">
      <div className="step-parameter-dialog-context-card">
        <strong>Scope guide</strong>
        <span>`@t` previews test-case data and `@s` previews the values saved on the active suite context for this workspace.</span>
      </div>
      {selectedSuite ? (
        <div className="step-parameter-dialog-context-card">
          <strong>Suite context</strong>
          <span>{selectedSuite.name} · suite-shared values resolve from this suite while you review the linked case here.</span>
        </div>
      ) : null}
    </div>
  );

  useEffect(() => {
    setExpandedSections({
      details: false,
      steps: false,
      history: false
    });
    setIsParameterDialogOpen(false);
    setCodePreviewState(null);
    setParameterValues(
      combineStepParameterValues(
        normalizeCaseParameterPreviewValues(testCase.parameter_values),
        normalizeSuiteParameterPreviewValues(selectedSuite?.parameter_values)
      )
    );
  }, [selectedSuite?.id, selectedSuite?.parameter_values, testCase.id, testCase.parameter_values]);

  useEffect(() => {
    setParameterValues((current) => {
      const next = filterStepParameterValues(current, detectedParameters);
      const currentKeys = Object.keys(current);
      const nextKeys = Object.keys(next);

      if (currentKeys.length === nextKeys.length && currentKeys.every((key) => current[key] === next[key])) {
        return current;
      }

      return next;
    });
  }, [detectedParameters]);

  return (
    <>
      <div className="modal-backdrop modal-backdrop--scroll" onClick={onClose} role="presentation">
        <div
          aria-label={`Test case workspace for ${testCase.title}`}
          aria-modal="true"
          className="modal-card suite-test-case-editor-modal linked-test-case-modal linked-test-case-workspace-modal"
          onClick={(event) => event.stopPropagation()}
          ref={dialogRef}
          role="dialog"
          tabIndex={-1}
        >
          <div className="suite-test-case-editor-body linked-test-case-workspace-body">
            <div className="workspace-master-detail is-detail-open linked-test-case-workspace-shell">
              <div className="workspace-master-detail-panel linked-test-case-workspace-panel">
                <Panel
                  actions={(
                    <div className="panel-head-actions-row">
                      <button className="ghost-button" onClick={() => setIsParameterDialogOpen(true)} type="button">
                        <LinkedTestCaseParameterIcon />
                        <span>{detectedParameters.length ? `Test data · ${detectedParameters.length}` : "Test data"}</span>
                      </button>
                      <DialogCloseButton label="Close test case workspace" onClick={onClose} />
                    </div>
                  )}
                  title="Test case workspace"
                  subtitle="Switch between case details and step editing without losing the selected context."
                >
                  <div className="detail-stack">
                    <div className="editor-accordion">
                      <LinkedTestCaseSection
                        countLabel={testCase.status || "draft"}
                        isExpanded={expandedSections.details}
                        onToggle={() => setExpandedSections((current) => ({ ...current, details: !current.details }))}
                        summary={testCase.title || "Untitled test case"}
                        title="Selected test case"
                      >
                        <div className="stack-list">
                          <div className="stack-item">
                            <div>
                              <strong>Status</strong>
                              <span>{testCase.status || "draft"}</span>
                            </div>
                            <StatusBadge value={testCase.status || "draft"} />
                          </div>
                          <div className="stack-item">
                            <div>
                              <strong>Scope</strong>
                              <span>{projectName || "No project"} · {appTypeName || "No app type"}</span>
                            </div>
                          </div>
                          <div className="stack-item">
                            <div>
                              <strong>Description</strong>
                              <RichTextContent value={testCase.description} fallback="No description available for this reusable test case." />
                            </div>
                          </div>
                          <div className="stack-item">
                            <div>
                              <strong>Priority</strong>
                              <span>{`P${testCase.priority ?? 3}`}</span>
                            </div>
                          </div>
                          <div className="stack-item">
                            <div>
                              <strong>Linked suites</strong>
                              <span>{linkedSuiteTitles.length ? linkedSuiteTitles.join(" · ") : "Not linked to a suite."}</span>
                            </div>
                          </div>
                          <div className="stack-item">
                            <div>
                              <strong>Requirements</strong>
                              <span>{linkedRequirementTitles.length ? linkedRequirementTitles.join(" · ") : "No linked requirement."}</span>
                            </div>
                          </div>
                        </div>
                      </LinkedTestCaseSection>

                      <LinkedTestCaseSection
                        actions={(
                          <button className="ghost-button" disabled={!steps.length} onClick={() => setCodePreviewState({
                            title: `${testCase.title || "Test case"} automation`,
                            subtitle: "This consolidated view is read-only. Edit automation from the original test case workspace.",
                            code: buildCaseAutomationCode(testCase.title || "Test case", steps)
                          })} type="button">
                            <AutomationCodeIcon />
                            <span>Automation code</span>
                          </button>
                        )}
                        countLabel={`${steps.length} step${steps.length === 1 ? "" : "s"}`}
                        isExpanded={expandedSections.steps}
                        onToggle={() => setExpandedSections((current) => ({ ...current, steps: !current.steps }))}
                        summary={stepSummary}
                        title="Test steps"
                      >
                        <div className="stack-list">
                          {stepsQuery.isLoading ? <LoadingState label="Loading steps" /> : null}
                          {!stepsQuery.isLoading && steps.map((step) => (
                            <div className="stack-item" key={step.id}>
                              <div className="linked-test-case-step-copy">
                                <strong>{`Step ${step.step_order}`}</strong>
                                <StepParameterizedText
                                  fallback="No action"
                                  text={step.action}
                                  values={parameterValues}
                                />
                                <StepParameterizedText
                                  fallback="No expected result"
                                  text={step.expected_result}
                                  values={parameterValues}
                                />
                              </div>
                            </div>
                          ))}
                          {!stepsQuery.isLoading && !steps.length ? <div className="empty-state compact">No steps are attached to this test case yet.</div> : null}
                        </div>
                      </LinkedTestCaseSection>

                      <LinkedTestCaseSection
                        countLabel={`${history.length} record${history.length === 1 ? "" : "s"}`}
                        isExpanded={expandedSections.history}
                        onToggle={() => setExpandedSections((current) => ({ ...current, history: !current.history }))}
                        summary={historySummary}
                        title="Run history"
                      >
                        <div className="stack-list">
                          {historyQuery.isLoading ? <LoadingState label="Loading run history" /> : null}
                          {!historyQuery.isLoading && history.map((result) => {
                            const historyDetail =
                              result.error ||
                              (result.status === "passed"
                                ? "Passed in this run snapshot."
                                : result.status === "failed"
                                  ? "Failed in this run snapshot."
                                  : "Blocked in this run snapshot.");

                            return (
                              <div className="stack-item execution-history-item" key={result.id}>
                                <div>
                                  <strong>{formatLinkedHistoryDate(result.created_at)}</strong>
                                  <span>{historyDetail}</span>
                                </div>
                                <StatusBadge value={result.status} />
                              </div>
                            );
                          })}
                          {!historyQuery.isLoading && !history.length ? <div className="empty-state compact">No run history yet for this test case.</div> : null}
                        </div>
                      </LinkedTestCaseSection>
                    </div>
                  </div>
                </Panel>
              </div>
            </div>
          </div>
        </div>
      </div>

      {isParameterDialogOpen ? (
        <StepParameterDialog
          headerContent={parameterDialogHeaderContent}
          onChange={(name, value) =>
            setParameterValues((current) => ({
              ...current,
              [name]: value
            }))
          }
          onClose={() => setIsParameterDialogOpen(false)}
          parameters={detectedParameters}
          subtitle="Preview local case and suite-scoped values referenced by this reusable test case."
          title="Test data"
          values={parameterValues}
        />
      ) : null}

      {codePreviewState ? (
        <CodePreviewDialog
          code={codePreviewState.code}
          onClose={() => setCodePreviewState(null)}
          subtitle={codePreviewState.subtitle}
          title={codePreviewState.title}
        />
      ) : null}
    </>
  );
}

function LinkedTestCaseSection({
  title,
  summary,
  countLabel,
  isExpanded,
  onToggle,
  actions,
  children
}: {
  title: string;
  summary: string;
  countLabel: string;
  isExpanded: boolean;
  onToggle: () => void;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={isExpanded ? "editor-accordion-section is-expanded" : "editor-accordion-section"}>
      <div className="editor-accordion-head">
        <button aria-expanded={isExpanded} className="editor-accordion-toggle" onClick={onToggle} type="button">
          <div className="editor-accordion-toggle-main">
            <span aria-hidden="true" className={isExpanded ? "editor-accordion-icon is-expanded" : "editor-accordion-icon"}>
              <LinkedTestCaseChevronIcon />
            </span>
            <div className="editor-accordion-toggle-copy">
              <strong>{title}</strong>
              <span>{summary}</span>
            </div>
          </div>
        </button>
        <div className="editor-accordion-toggle-meta">
          <span className="editor-accordion-toggle-count">{countLabel}</span>
          {actions ? <div className="editor-accordion-actions">{actions}</div> : null}
          <button
            aria-label={isExpanded ? `Collapse ${title}` : `Expand ${title}`}
            className="editor-accordion-toggle-state explorer-icon-button"
            onClick={onToggle}
            title={isExpanded ? "Collapse section" : "Expand section"}
            type="button"
          >
            <CollapseExpandIcon isExpanded={isExpanded} />
          </button>
        </div>
      </div>
      {isExpanded ? <div className="editor-accordion-body">{children}</div> : null}
    </section>
  );
}

function LinkedTestCaseChevronIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="18" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="18">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function LinkedTestCaseParameterIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24" width="16">
      <path d="M5 7.5h14" />
      <path d="M7 12h10" />
      <path d="M9 16.5h6" />
      <path d="m5 5 2.5 2.5L5 10" />
    </svg>
  );
}
