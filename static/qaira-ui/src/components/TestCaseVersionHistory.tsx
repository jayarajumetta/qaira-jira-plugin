import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TestCase, TestCaseVersionContent, TestStep } from "../types";
import { useDialogFocus } from "../hooks/useDialogFocus";
import { api } from "../lib/api";
import { richTextToPlainText } from "./RichTextEditor";
import { DialogCloseButton } from "./DialogCloseButton";
import { LoadingState } from "./LoadingState";
import { StatusBadge } from "./StatusBadge";
import { ToastMessage } from "./ToastMessage";

type VersionDiffRow = {
  key: string;
  label: string;
  previous: string;
  current: string;
};

const versionDateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short"
});

function formatVersionDate(value?: string | null) {
  if (!value) return "Unknown time";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : versionDateFormatter.format(date);
}

function compactText(value: unknown, fallback = "—") {
  const normalized = typeof value === "string" ? value : value === undefined || value === null ? null : String(value);
  const text = richTextToPlainText(normalized).replace(/\s+/g, " ").trim();
  if (!text) return fallback;
  return text.length > 180 ? `${text.slice(0, 177)}…` : text;
}

function listLabel(value?: Array<unknown> | null) {
  const entries = (value || []).map(String).filter(Boolean);
  return entries.length ? entries.join(", ") : "—";
}

function parameterLabel(value?: Record<string, string>) {
  const entries = Object.entries(value || {});
  return entries.length ? entries.map(([key, entry]) => `${key}=${entry}`).join(", ") : "—";
}

function stepsFingerprint(steps?: TestStep[]) {
  return JSON.stringify((steps || []).map((step) => ({
    action: step.action || "",
    expected_result: step.expected_result || "",
    step_type: step.step_type || "web",
    group_id: step.group_id || null,
    reusable_group_id: step.reusable_group_id || null
  })));
}

function buildVersionDiff(content: TestCaseVersionContent, currentCase: TestCase, currentSteps: TestStep[]): VersionDiffRow[] {
  const candidates: Array<VersionDiffRow & { equal: boolean }> = [
    { key: "title", label: "Title", previous: compactText(content.title), current: compactText(currentCase.title), equal: content.title === currentCase.title },
    { key: "description", label: "Description", previous: compactText(content.description), current: compactText(currentCase.description), equal: compactText(content.description, "") === compactText(currentCase.description, "") },
    { key: "status", label: "Status", previous: content.status || "—", current: currentCase.status || "—", equal: (content.status || "") === (currentCase.status || "") },
    { key: "priority", label: "Priority", previous: content.priority ? `P${content.priority}` : "—", current: currentCase.priority ? `P${currentCase.priority}` : "—", equal: (content.priority || null) === (currentCase.priority || null) },
    { key: "labels", label: "Labels", previous: listLabel(content.labels), current: listLabel(currentCase.labels), equal: listLabel(content.labels) === listLabel(currentCase.labels) },
    { key: "requirements", label: "Requirements", previous: listLabel(content.requirement_ids), current: listLabel(currentCase.requirement_ids), equal: listLabel(content.requirement_ids) === listLabel(currentCase.requirement_ids) },
    { key: "suites", label: "Suites", previous: listLabel(content.suite_ids), current: listLabel(currentCase.suite_ids), equal: listLabel(content.suite_ids) === listLabel(currentCase.suite_ids) },
    { key: "parameters", label: "Test data", previous: parameterLabel(content.parameter_values), current: parameterLabel(currentCase.parameter_values), equal: parameterLabel(content.parameter_values) === parameterLabel(currentCase.parameter_values) },
    { key: "steps", label: "Steps", previous: `${content.steps?.length || 0} step${content.steps?.length === 1 ? "" : "s"}`, current: `${currentSteps.length} step${currentSteps.length === 1 ? "" : "s"}`, equal: stepsFingerprint(content.steps) === stepsFingerprint(currentSteps) }
  ];
  return candidates.filter((item) => !item.equal).map(({ equal: _equal, ...item }) => item);
}

export function TestCaseVersionHistory({
  canRestore,
  currentCase,
  currentSteps
}: {
  canRestore: boolean;
  currentCase: TestCase;
  currentSteps: TestStep[];
}) {
  const queryClient = useQueryClient();
  const [selectedRevision, setSelectedRevision] = useState<number | null>(null);
  const [confirmRevision, setConfirmRevision] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");
  const versionsQuery = useQuery({
    queryKey: ["test-case-versions", currentCase.id],
    queryFn: () => api.testCases.listVersions(currentCase.id)
  });
  const versions = versionsQuery.data?.versions || [];

  useEffect(() => {
    if (!versions.length) {
      setSelectedRevision(null);
      return;
    }
    setSelectedRevision((current) => current && versions.some((item) => item.revision === current) ? current : versions[0].revision);
  }, [versions]);

  const snapshotQuery = useQuery({
    queryKey: ["test-case-version", currentCase.id, selectedRevision],
    queryFn: () => api.testCases.getVersion(currentCase.id, selectedRevision as number),
    enabled: selectedRevision !== null
  });
  const diffRows = useMemo(
    () => snapshotQuery.data ? buildVersionDiff(snapshotQuery.data.content, currentCase, currentSteps) : [],
    [currentCase, currentSteps, snapshotQuery.data]
  );
  const restoreMutation = useMutation({
    mutationFn: (revision: number) =>
      api.testCases.restoreVersion(
        currentCase.id,
        revision,
        versionsQuery.data?.current_revision || currentCase.revision,
      ),
    onSuccess: async (result) => {
      setConfirmRevision(null);
      setMessageTone("success");
      setMessage(`Version ${result.restored_from_revision} restored as version ${result.revision}.`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["test-case-versions", currentCase.id] }),
        queryClient.invalidateQueries({ queryKey: ["test-case-version", currentCase.id] }),
        queryClient.invalidateQueries({ queryKey: ["global-test-cases"] }),
        queryClient.invalidateQueries({ queryKey: ["test-case-steps", currentCase.id] })
      ]);
    },
    onError: (error) => {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "Unable to restore the selected version.");
    }
  });
  const closeRestoreDialog = () => {
    if (!restoreMutation.isPending) setConfirmRevision(null);
  };
  const restoreDialogRef = useDialogFocus<HTMLDivElement>({
    active: confirmRevision !== null,
    closeDisabled: restoreMutation.isPending,
    onClose: closeRestoreDialog
  });

  return (
    <section className="test-case-version-history" aria-labelledby="test-case-version-history-title">
      <div className="test-case-version-heading">
        <div>
          <h3 id="test-case-version-history-title">Content versions</h3>
          <span>Current version {versionsQuery.data?.current_revision || currentCase.revision || 1}</span>
        </div>
        <StatusBadge value={`${versions.length} retained`} />
      </div>

      {versionsQuery.isLoading ? <LoadingState label="Loading content versions" /> : null}
      {versionsQuery.error ? <div className="error-banner">{versionsQuery.error instanceof Error ? versionsQuery.error.message : "Unable to load content versions."}</div> : null}
      {!versionsQuery.isLoading && !versions.length ? <div className="empty-state compact">Versions appear after the first saved change.</div> : null}

      {versions.length ? (
        <div className="test-case-version-layout">
          <div className="test-case-version-list" role="list" aria-label="Saved content versions">
            {versions.map((version) => (
              <button
                aria-current={selectedRevision === version.revision ? "true" : undefined}
                className={selectedRevision === version.revision ? "test-case-version-item is-active" : "test-case-version-item"}
                key={version.revision}
                onClick={() => setSelectedRevision(version.revision)}
                role="listitem"
                type="button"
              >
                <strong>Version {version.revision}</strong>
                <span>{formatVersionDate(version.captured_at)}</span>
                <small>{version.step_count} step{version.step_count === 1 ? "" : "s"}</small>
              </button>
            ))}
          </div>

          <div className="test-case-version-comparison">
            {snapshotQuery.isLoading ? <LoadingState label="Loading version comparison" /> : null}
            {snapshotQuery.error ? <div className="error-banner">{snapshotQuery.error instanceof Error ? snapshotQuery.error.message : "Unable to load the selected version."}</div> : null}
            {snapshotQuery.data ? (
              <>
                <div className="test-case-version-comparison-head">
                  <div>
                    <strong>Version {snapshotQuery.data.revision} → current</strong>
                    <span>{diffRows.length} changed field{diffRows.length === 1 ? "" : "s"}</span>
                  </div>
                  <button
                    className="ghost-button compact"
                    disabled={!canRestore || restoreMutation.isPending}
                    onClick={() => setConfirmRevision(snapshotQuery.data.revision)}
                    type="button"
                  >
                    Restore version {snapshotQuery.data.revision}
                  </button>
                </div>
                {diffRows.length ? (
                  <div className="test-case-version-diff">
                    <div className="test-case-version-diff-head" aria-hidden="true">
                      <span>Field</span><span>Version {snapshotQuery.data.revision}</span><span>Current</span>
                    </div>
                    {diffRows.map((row) => (
                      <div className="test-case-version-diff-row" key={row.key}>
                        <strong>{row.label}</strong>
                        <span>{row.previous}</span>
                        <span>{row.current}</span>
                      </div>
                    ))}
                  </div>
                ) : <div className="empty-state compact">This snapshot matches the current content.</div>}
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {message ? <ToastMessage message={message} onDismiss={() => setMessage("")} tone={messageTone} /> : null}

      {confirmRevision !== null ? (
        <div className="modal-backdrop" onClick={closeRestoreDialog} role="presentation">
          <div
            aria-labelledby="restore-test-case-version-title"
            aria-modal="true"
            className="modal-card test-case-version-restore-dialog"
            onClick={(event) => event.stopPropagation()}
            ref={restoreDialogRef}
            role="dialog"
            tabIndex={-1}
          >
            <div className="ai-studio-header">
              <h2 className="dialog-title" id="restore-test-case-version-title">Restore version {confirmRevision}</h2>
              <DialogCloseButton disabled={restoreMutation.isPending} label="Close restore confirmation" onClick={closeRestoreDialog} />
            </div>
            <p>The current content is preserved as a new snapshot. Restored content requires review.</p>
            <div className="action-row ai-studio-footer">
              <button className="ghost-button" disabled={restoreMutation.isPending} onClick={closeRestoreDialog} type="button">Cancel</button>
              <button className="primary-button" disabled={restoreMutation.isPending} onClick={() => restoreMutation.mutate(confirmRevision)} type="button">
                {restoreMutation.isPending ? "Restoring…" : `Restore version ${confirmRevision}`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
