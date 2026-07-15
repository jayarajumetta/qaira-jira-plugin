import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { QualityDashboard, QualityDashboardGadget, QualityDashboardGadgetResult } from "../types";
import { SparkIcon } from "./AppIcons";
import { DialogCloseButton } from "./DialogCloseButton";
import { useDeleteConfirmation } from "./DeleteConfirmationDialog";
import { FormField } from "./FormField";
import { LoadingState } from "./LoadingState";
import { Panel } from "./Panel";
import { ToastMessage } from "./ToastMessage";
import { useDialogFocus } from "../hooks/useDialogFocus";

const EMPTY_GADGET: QualityDashboardGadget = {
  id: "",
  title: "Open work",
  type: "metric",
  jql: "statusCategory != Done",
  group_by: "status",
  metric: "count"
};

function emptyDashboard(projectId: string): QualityDashboard {
  return {
    id: "",
    project_id: projectId,
    name: "Release quality",
    description: "",
    layout: "two-column",
    gadgets: []
  };
}

function resultTone(result?: QualityDashboardGadgetResult) {
  if (!result) return "neutral";
  return result.total ? "info" : "success";
}

const DASHBOARD_AUDIENCES = [
  { id: "executive", label: "Executive", detail: "Release exposure and go/no-go risk" },
  { id: "product", label: "Product", detail: "Scope, ownership and defect pressure" },
  { id: "quality", label: "Quality engineering", detail: "Execution, traceability and triage" },
  { id: "automation", label: "Automation", detail: "Reliability and maintenance demand" }
] as const;

export function CustomQualityDashboard({ projectId, canManage, canUseAi }: { projectId: string; canManage: boolean; canUseAi: boolean }) {
  const queryClient = useQueryClient();
  const { confirmDelete, confirmationDialog } = useDeleteConfirmation();
  const [selectedId, setSelectedId] = useState("");
  const [editorMode, setEditorMode] = useState<"create" | "edit" | null>(null);
  const [draft, setDraft] = useState<QualityDashboard>(() => emptyDashboard(projectId));
  const [gadgetDraft, setGadgetDraft] = useState<QualityDashboardGadget>(EMPTY_GADGET);
  const [editingGadgetId, setEditingGadgetId] = useState("");
  const [designerDraft, setDesignerDraft] = useState<{ stakeholder: typeof DASHBOARD_AUDIENCES[number]["id"]; release: string; goal: string }>({ stakeholder: "quality", release: "", goal: "" });
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");
  const dashboards = useQuery({
    queryKey: ["quality-dashboards", projectId],
    queryFn: () => api.qualityDashboards.list({ project_id: projectId }),
    enabled: Boolean(projectId)
  });
  const selected = useMemo(
    () => (dashboards.data || []).find((dashboard) => dashboard.id === selectedId) || null,
    [dashboards.data, selectedId]
  );

  useEffect(() => {
    if (dashboards.data?.length && !dashboards.data.some((dashboard) => dashboard.id === selectedId)) {
      setSelectedId(dashboards.data[0].id);
    }
  }, [dashboards.data, selectedId]);

  useEffect(() => {
    setSelectedId("");
    setEditorMode(null);
    setDraft(emptyDashboard(projectId));
  }, [projectId]);

  const activeDashboard = editorMode ? draft : selected;

  const dashboardResults = useQuery({
    queryKey: ["quality-dashboard-results", projectId, activeDashboard?.id || "draft", activeDashboard?.gadgets || []],
    queryFn: () => api.analytics.queryBatch({ project_id: projectId, gadgets: activeDashboard?.gadgets || [], limit: 100 }),
    enabled: Boolean(projectId && activeDashboard?.gadgets.length),
    staleTime: 30_000,
    retry: 1
  });
  const resultByGadgetId = useMemo(
    () => new Map((dashboardResults.data?.results || []).map((entry) => [entry.gadget_id, entry])),
    [dashboardResults.data]
  );
  const preview = useMutation({
    mutationFn: (gadget: QualityDashboardGadget) => api.analytics.query({ project_id: projectId, jql: gadget.jql, gadget: { ...gadget, id: gadget.id || `gadget-${Date.now()}` }, limit: 100 }),
    onError: (error) => {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "Unable to preview the gadget.");
    }
  });
  const save = useMutation({
    mutationFn: async () => draft.id
      ? api.qualityDashboards.update(draft.id, draft)
      : api.qualityDashboards.create({
          project_id: projectId,
          name: draft.name,
          description: draft.description,
          layout: draft.layout,
          gadgets: draft.gadgets,
          revision: draft.revision,
          created_at: draft.created_at,
          updated_at: draft.updated_at
        }),
    onSuccess: async (saved) => {
      setMessageTone("success");
      setMessage("Dashboard saved.");
      await queryClient.invalidateQueries({ queryKey: ["quality-dashboards", projectId] });
      setSelectedId(saved.id);
      setEditorMode(null);
    },
    onError: (error) => {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "Unable to save the dashboard.");
    }
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.qualityDashboards.delete(id),
    onSuccess: async () => {
      setSelectedId("");
      setDraft(emptyDashboard(projectId));
      setEditorMode(null);
      setMessageTone("success");
      setMessage("Dashboard deleted.");
      await queryClient.invalidateQueries({ queryKey: ["quality-dashboards", projectId] });
    },
    onError: (error) => {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "Unable to delete the dashboard.");
    }
  });
  const design = useMutation({
    mutationFn: () => api.analytics.designDashboard({
      project_id: projectId,
      stakeholder: designerDraft.stakeholder,
      release: designerDraft.release.trim() || undefined,
      goal: designerDraft.goal.trim() || undefined
    }),
    onSuccess: (response) => {
      setDraft({ ...response.dashboard, id: "", project_id: projectId });
      setEditingGadgetId("");
      setGadgetDraft(EMPTY_GADGET);
      setMessageTone("success");
      setMessage(`Designed ${response.dashboard.gadgets.length} reviewable gadgets. Review the JQL, then save.`);
    },
    onError: (error) => {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "Unable to design the dashboard.");
    }
  });

  const addGadget = () => {
    if (!gadgetDraft.title.trim()) return;
    const gadget = { ...gadgetDraft, id: editingGadgetId || `gadget-${Date.now()}` };
    setDraft((current) => ({
      ...current,
      gadgets: editingGadgetId
        ? current.gadgets.map((item) => item.id === editingGadgetId ? gadget : item)
        : [...current.gadgets, gadget].slice(0, 12)
    }));
    setEditingGadgetId("");
    setGadgetDraft({ ...EMPTY_GADGET, title: "" });
    preview.reset();
  };

  const moveGadget = (id: string, direction: -1 | 1) => setDraft((current) => {
    const index = current.gadgets.findIndex((gadget) => gadget.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= current.gadgets.length) return current;
    const gadgets = [...current.gadgets];
    [gadgets[index], gadgets[target]] = [gadgets[target], gadgets[index]];
    return { ...current, gadgets };
  });

  const duplicateGadget = (gadget: QualityDashboardGadget) => setDraft((current) => current.gadgets.length >= 12 ? current : ({
    ...current,
    gadgets: [...current.gadgets, { ...gadget, id: `gadget-${Date.now()}`, title: `${gadget.title} copy` }]
  }));

  const isEditorBusy = save.isPending || design.isPending;
  const closeEditor = () => {
    if (isEditorBusy) return;
    setEditorMode(null);
    setEditingGadgetId("");
    setGadgetDraft({ ...EMPTY_GADGET });
    preview.reset();
  };
  const editorDialogRef = useDialogFocus<HTMLDivElement>({
    active: Boolean(editorMode),
    closeDisabled: isEditorBusy,
    onClose: closeEditor
  });
  const openCreateEditor = () => {
    setDraft(emptyDashboard(projectId));
    setEditingGadgetId("");
    setGadgetDraft({ ...EMPTY_GADGET });
    setDesignerDraft({ stakeholder: "quality", release: "", goal: "" });
    design.reset();
    preview.reset();
    setEditorMode("create");
  };
  const openEditEditor = () => {
    if (!selected) return;
    setDraft({ ...selected, gadgets: selected.gadgets.map((gadget) => ({ ...gadget })) });
    setEditingGadgetId("");
    setGadgetDraft({ ...EMPTY_GADGET });
    preview.reset();
    setEditorMode("edit");
  };
  const deleteSelectedDashboard = async () => {
    if (!selected) return;
    const confirmed = await confirmDelete({
      title: "Delete quality dashboard?",
      message: `${selected.name || "This dashboard"} and its gadget configuration will be removed from this Jira project.`,
      confirmLabel: "Delete dashboard"
    });
    if (confirmed) remove.mutate(selected.id);
  };

  if (dashboards.isLoading) return <LoadingState label="Loading quality dashboards" />;

  return (
    <div className="custom-dashboard-workspace">
      <div className="custom-dashboard-toolbar card">
        <FormField label="Dashboard">
          <select disabled={!dashboards.data?.length} value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
            {!dashboards.data?.length ? <option value="">No dashboards yet</option> : null}
            {(dashboards.data || []).map((dashboard) => <option key={dashboard.id} value={dashboard.id}>{dashboard.name}</option>)}
          </select>
        </FormField>
        <button className="primary-button" disabled={!canManage} onClick={openCreateEditor} type="button">Create dashboard</button>
        <button className="ghost-button" disabled={!canManage || !selected} onClick={openEditEditor} type="button">Edit</button>
        <button className="ghost-button danger" disabled={!canManage || !selected || remove.isPending} onClick={() => void deleteSelectedDashboard()} type="button">{remove.isPending ? "Deleting…" : "Delete"}</button>
        <button className="ghost-button" disabled={dashboards.isFetching || dashboardResults.isFetching} onClick={() => {
          void dashboards.refetch();
          if (selected) void dashboardResults.refetch();
        }} type="button">{dashboards.isFetching || dashboardResults.isFetching ? "Refreshing…" : "Refresh"}</button>
      </div>

      {selected ? (
        <section className="custom-dashboard-view card" aria-label={selected.name}>
          <div className="custom-dashboard-view-head">
            <div><strong>{selected.name}</strong>{selected.description ? <span>{selected.description}</span> : null}</div>
            <span className="status-pill tone-neutral">{selected.gadgets.length} gadget{selected.gadgets.length === 1 ? "" : "s"}</span>
          </div>
          <div className={`quality-gadget-grid layout-${selected.layout}`}>
            {selected.gadgets.map((gadget) => {
              const evaluated = resultByGadgetId.get(gadget.id);
              return (
                <div className="quality-gadget-shell" key={gadget.id}>
                  {dashboardResults.isLoading ? <LoadingState label={`Loading ${gadget.title}`} /> : null}
                  {evaluated?.result ? <QualityGadget result={evaluated.result} /> : null}
                  {evaluated?.error ? <div className="dashboard-gadget-error" role="alert"><strong>{evaluated.error.code}</strong><span>{evaluated.error.message}</span><button className="ghost-button compact" onClick={() => void dashboardResults.refetch()} type="button">Retry</button></div> : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <div className="empty-state"><strong>No custom dashboard yet</strong><span>Create a project-scoped dashboard from JQL gadgets or start with the AI-assisted designer.</span>{canManage ? <button className="primary-button" onClick={openCreateEditor} type="button">Create dashboard</button> : null}</div>
      )}

      {editorMode ? (
        <div className="modal-backdrop modal-backdrop--scroll" onClick={closeEditor} role="presentation">
          <div
            aria-labelledby="custom-dashboard-dialog-title"
            aria-modal="true"
            className="modal-card custom-dashboard-modal"
            onClick={(event) => event.stopPropagation()}
            ref={editorDialogRef}
            role="dialog"
            tabIndex={-1}
          >
            <div className="modal-card-head custom-dashboard-modal-head">
              <div><span className="eyebrow">Quality intelligence</span><h3 id="custom-dashboard-dialog-title">{editorMode === "create" ? "Create dashboard" : "Edit dashboard"}</h3><p>Build a Jira-project-scoped decision surface and validate every JQL gadget before saving.</p></div>
              <DialogCloseButton disabled={isEditorBusy} label={`Close ${editorMode} dashboard dialog`} onClick={closeEditor} />
            </div>

            <div className="custom-dashboard-modal-body">
              {editorMode === "create" && canUseAi ? (
                <section className="dashboard-designer card" aria-label="AI-assisted dashboard designer">
                  <div className="dashboard-designer-head"><span className="dashboard-designer-icon"><SparkIcon /></span><div><strong>AI-assisted dashboard designer</strong><span>Creates an explainable, editable draft from quality-engineering patterns. Nothing is saved until you approve it.</span></div></div>
                  <div className="dashboard-audience-grid">
                    {DASHBOARD_AUDIENCES.map((audience) => (
                      <button className={designerDraft.stakeholder === audience.id ? "dashboard-audience-card is-active" : "dashboard-audience-card"} key={audience.id} onClick={() => setDesignerDraft((current) => ({ ...current, stakeholder: audience.id }))} type="button"><strong>{audience.label}</strong><span>{audience.detail}</span></button>
                    ))}
                  </div>
                  <div className="dashboard-designer-fields">
                    <FormField label="Release / Fix version" hint="Optional; safely added to generated JQL."><input value={designerDraft.release} onChange={(event) => setDesignerDraft((current) => ({ ...current, release: event.target.value }))} /></FormField>
                    <FormField label="Decision goal" hint="The stakeholder decision this dashboard must support."><input maxLength={300} value={designerDraft.goal} onChange={(event) => setDesignerDraft((current) => ({ ...current, goal: event.target.value }))} /></FormField>
                    <button className="primary-button" disabled={!canManage || design.isPending} onClick={() => design.mutate()} type="button"><SparkIcon />{design.isPending ? "Designing…" : "Design draft"}</button>
                  </div>
                  {design.data ? <div className="dashboard-design-assurance"><span>{Math.round(design.data.confidence * 100)}% design confidence</span><span>{design.data.dashboard.gadgets.length} bounded gadgets</span><span>Human approval required</span></div> : null}
                </section>
              ) : null}

              <div className="custom-dashboard-editor-grid">
                <Panel title="Dashboard and gadget builder">
                  <div className="form-grid">
                    <FormField label="Name" required><input data-autofocus="true" maxLength={120} required value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></FormField>
                    <FormField label="Description"><textarea maxLength={500} rows={2} value={draft.description || ""} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></FormField>
                    <FormField label="Layout"><select value={draft.layout} onChange={(event) => setDraft((current) => ({ ...current, layout: event.target.value as QualityDashboard["layout"] }))}><option value="single">Single column</option><option value="two-column">Two columns</option><option value="three-column">Three columns</option></select></FormField>
                  </div>
                  <div className="custom-gadget-builder">
                    <div className="form-grid">
                      <FormField label="Gadget title" required><input maxLength={100} value={gadgetDraft.title} onChange={(event) => setGadgetDraft((current) => ({ ...current, title: event.target.value }))} /></FormField>
                      <div className="record-grid">
                        <FormField label="Visualization"><select value={gadgetDraft.type} onChange={(event) => setGadgetDraft((current) => ({ ...current, type: event.target.value as QualityDashboardGadget["type"] }))}><option value="metric">Metric</option><option value="donut">Donut</option><option value="bar">Bar</option><option value="stacked-bar">Stacked bar</option><option value="line">Trend line</option><option value="table">Issue list</option></select></FormField>
                        <FormField label="Group by"><select value={gadgetDraft.group_by} onChange={(event) => setGadgetDraft((current) => ({ ...current, group_by: event.target.value as QualityDashboardGadget["group_by"] }))}><option value="status">Status</option><option value="statusCategory">Status category</option><option value="priority">Priority</option><option value="issuetype">Issue type</option><option value="assignee">Assignee</option><option value="reporter">Reporter</option><option value="components">Component</option><option value="fixVersion">Fix version</option><option value="sprint">Sprint</option><option value="labels">Labels</option><option value="resolution">Resolution</option><option value="createdWeek">Created week</option><option value="updatedWeek">Updated week</option><option value="createdMonth">Created month</option><option value="updatedMonth">Updated month</option></select></FormField>
                        <FormField label="Metric"><select value={gadgetDraft.metric || "count"} onChange={(event) => setGadgetDraft((current) => ({ ...current, metric: event.target.value as QualityDashboardGadget["metric"] }))}><option value="count">Count</option><option value="resolved">Resolved</option><option value="unresolved">Unresolved</option><option value="highPriority">High priority</option><option value="unassigned">Unassigned</option><option value="overdue">Overdue</option><option value="stale30d">Stale 30+ days</option><option value="created30d">Created in 30 days</option><option value="resolved30d">Resolved in 30 days</option><option value="resolutionRate">Resolution rate</option><option value="averageAgeDays">Average age</option><option value="averageResolutionDays">Average resolution time</option></select></FormField>
                      </div>
                      <FormField label="JQL" hint="Qaira always adds the active Jira project server-side."><textarea maxLength={2000} rows={4} value={gadgetDraft.jql} onChange={(event) => setGadgetDraft((current) => ({ ...current, jql: event.target.value }))} /></FormField>
                      <div className="action-row"><button className="ghost-button" disabled={preview.isPending} onClick={() => preview.mutate({ ...gadgetDraft, id: gadgetDraft.id || "preview" })} type="button">{preview.isPending ? "Running…" : "Preview"}</button><button className="primary-button" disabled={!gadgetDraft.title.trim() || (!editingGadgetId && draft.gadgets.length >= 12)} onClick={addGadget} type="button">{editingGadgetId ? "Update gadget" : "Add gadget"}</button>{editingGadgetId ? <button className="ghost-button" onClick={() => { setEditingGadgetId(""); setGadgetDraft({ ...EMPTY_GADGET, title: "" }); }} type="button">Cancel edit</button> : null}</div>
                    </div>
                    {preview.data ? <QualityGadget result={preview.data} /> : null}
                  </div>
                </Panel>

                <Panel title={draft.name || "Live preview"}>
                  <div className={`quality-gadget-grid layout-${draft.layout}`}>
                    {draft.gadgets.map((gadget, index) => {
                      const evaluated = resultByGadgetId.get(gadget.id);
                      return <div className="quality-gadget-shell" key={gadget.id}><div className="quality-gadget-actions"><button aria-label={`Move ${gadget.title} left`} disabled={index === 0} onClick={() => moveGadget(gadget.id, -1)} type="button">←</button><button aria-label={`Move ${gadget.title} right`} disabled={index === draft.gadgets.length - 1} onClick={() => moveGadget(gadget.id, 1)} type="button">→</button><button onClick={() => { setEditingGadgetId(gadget.id); setGadgetDraft(gadget); }} type="button">Edit</button><button disabled={draft.gadgets.length >= 12} onClick={() => duplicateGadget(gadget)} type="button">Copy</button><button aria-label={`Remove ${gadget.title}`} className="danger" onClick={() => setDraft((current) => ({ ...current, gadgets: current.gadgets.filter((item) => item.id !== gadget.id) }))} type="button">×</button></div>{dashboardResults.isLoading ? <LoadingState label={`Loading ${gadget.title}`} /> : null}{evaluated?.result ? <QualityGadget result={evaluated.result} /> : null}{evaluated?.error ? <div className="dashboard-gadget-error" role="alert"><strong>{evaluated.error.code}</strong><span>{evaluated.error.message}</span><button className="ghost-button compact" onClick={() => void dashboardResults.refetch()} type="button">Retry</button></div> : null}</div>;
                    })}
                    {!draft.gadgets.length ? <div className="empty-state compact">Add a validated JQL gadget or generate an AI-assisted draft.</div> : null}
                  </div>
                </Panel>
              </div>
            </div>

            <div className="action-row custom-dashboard-modal-actions"><button className="ghost-button" disabled={isEditorBusy} onClick={closeEditor} type="button">Cancel</button><button className="primary-button" disabled={!canManage || !draft.name.trim() || !draft.gadgets.length || save.isPending} onClick={() => save.mutate()} type="button">{save.isPending ? "Saving…" : editorMode === "create" ? "Create dashboard" : "Save changes"}</button></div>
          </div>
        </div>
      ) : null}
      {message ? <ToastMessage message={message} onDismiss={() => setMessage("")} tone={messageTone} /> : null}
      {confirmationDialog}
    </div>
  );
}

function QualityGadget({ result }: { result: QualityDashboardGadgetResult }) {
  const maximum = Math.max(...result.series.map((item) => item.value), 1);
  const palette = ["#579dff", "#6cc3e0", "#4bce97", "#e2b203", "#f87168", "#9f8fef", "#fca700", "#94a3b8"];
  const seriesTotal = Math.max(result.series.reduce((sum, item) => sum + item.value, 0), 1);
  let cursor = 0;
  const donutStops = result.series.map((item, index) => {
    const start = cursor;
    cursor += (item.value / seriesTotal) * 100;
    return `${palette[index % palette.length]} ${start}% ${cursor}%`;
  }).join(", ");
  const linePoints = result.series.map((item, index) => {
    const x = result.series.length <= 1 ? 150 : (index / (result.series.length - 1)) * 280 + 10;
    const y = 108 - (item.value / maximum) * 92;
    return `${x},${y}`;
  }).join(" ");
  return (
    <article className={`quality-gadget type-${result.gadget.type} tone-${resultTone(result)}`}>
      <div className="quality-gadget-head"><strong>{result.gadget.title}</strong><span>{result.total}{result.truncated ? "+" : ""}</span></div>
      {result.gadget.type === "metric" ? <div className="quality-metric-value"><strong>{result.gadget.metric === "resolutionRate" ? `${result.value}%` : result.value}</strong><span>{result.value_label}</span></div> : null}
      {result.gadget.type === "bar" ? (
        <div className="quality-series-list">{result.series.map((item) => <div key={item.label}><span>{item.label}</span><i><em style={{ width: `${Math.round((item.value / maximum) * 100)}%` }} /></i><strong>{item.value}</strong></div>)}</div>
      ) : null}
      {result.gadget.type === "donut" ? (
        <div className="quality-donut-layout">
          <div className="quality-donut" style={{ background: result.series.length ? `conic-gradient(${donutStops})` : "var(--ds-background-neutral, #dfe1e6)" }}><span><strong>{result.total}</strong><small>Total</small></span></div>
          <div className="quality-chart-legend">{result.series.slice(0, 8).map((item, index) => <span key={item.label}><i style={{ background: palette[index % palette.length] }} /><small>{item.label}</small><strong>{item.value}</strong></span>)}</div>
        </div>
      ) : null}
      {result.gadget.type === "stacked-bar" ? (
        <div className="quality-stacked-chart">
          <div>{result.series.slice(0, 8).map((item, index) => <span key={item.label} style={{ background: palette[index % palette.length], width: `${(item.value / seriesTotal) * 100}%` }} title={`${item.label}: ${item.value}`} />)}</div>
          <div className="quality-chart-legend">{result.series.slice(0, 8).map((item, index) => <span key={item.label}><i style={{ background: palette[index % palette.length] }} /><small>{item.label}</small><strong>{item.value}</strong></span>)}</div>
        </div>
      ) : null}
      {result.gadget.type === "line" ? (
        <div className="quality-line-chart">
          <svg aria-label={`${result.gadget.title} trend`} role="img" viewBox="0 0 300 120"><path d="M10 108 H290" /><polyline points={linePoints} /></svg>
          <div><span>{result.series[0]?.label || "—"}</span><strong>{result.series.map((item) => item.value).join(" · ") || "No data"}</strong><span>{result.series[result.series.length - 1]?.label || "—"}</span></div>
        </div>
      ) : null}
      {result.gadget.type === "table" ? (
        <div className="quality-table-wrap"><table><thead><tr><th>Key</th><th>Title</th><th>Type</th><th>Priority</th><th>Status</th><th>Owner</th></tr></thead><tbody>{result.rows.map((row) => <tr key={row.id}><td>{row.key}</td><td>{row.title}</td><td>{row.type || "—"}</td><td>{row.priority || "—"}</td><td>{row.status || "—"}</td><td>{row.assignee || "Unassigned"}</td></tr>)}</tbody></table></div>
      ) : null}
      <small className="quality-gadget-foot">Project-scoped · {result.returned} inspected</small>
    </article>
  );
}
