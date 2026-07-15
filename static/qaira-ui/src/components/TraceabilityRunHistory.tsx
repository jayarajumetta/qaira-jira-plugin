import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ActivityIcon, OpenIcon } from "./AppIcons";
import { DataTable, type DataTableColumn } from "./DataTable";
import { DisplayIdBadge } from "./DisplayIdBadge";
import { LoadingState } from "./LoadingState";
import { StatusBadge } from "./StatusBadge";
import { api } from "../lib/api";
import type { TraceabilityRunHistoryItem } from "../types";

const formatTimestamp = (value?: string | null) => {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const formatDuration = (startedAt?: string | null, endedAt?: string | null) => {
  if (!startedAt || !endedAt) return "—";
  const durationMs = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(durationMs) || durationMs < 0) return "—";
  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;
};

export function TraceabilityRunHistory({
  appTypeId,
  projectId,
  requirementId,
  testCaseId
}: {
  appTypeId?: string;
  projectId: string;
  requirementId?: string;
  testCaseId?: string;
}) {
  const navigate = useNavigate();
  const historyQuery = useQuery({
    queryKey: ["traceability-run-history", projectId, appTypeId || "all", requirementId || "", testCaseId || ""],
    queryFn: () => api.executions.history({
      project_id: projectId,
      app_type_id: appTypeId || undefined,
      requirement_id: requirementId || undefined,
      test_case_id: testCaseId || undefined,
      page_size: 25
    }),
    enabled: Boolean(projectId && (requirementId || testCaseId)),
    staleTime: 30_000
  });
  const rows = historyQuery.data || [];

  const openRun = (item: TraceabilityRunHistoryItem) => {
    const view = item.trigger === "local" ? "local-runs" : item.suite_ids.length ? "suite-runs" : "test-case-runs";
    const params = new URLSearchParams({ view, execution: item.execution_id, testCase: item.test_case_id });
    navigate(`/executions?${params.toString()}`);
  };

  const columns: Array<DataTableColumn<TraceabilityRunHistoryItem>> = [
    {
      key: "run",
      label: "Run",
      canToggle: false,
      sortValue: (item) => item.execution_name,
      render: (item) => (
        <div className="traceability-run-name">
          <DisplayIdBadge value={item.execution_display_id || item.execution_id} />
          <strong>{item.execution_name}</strong>
        </div>
      )
    },
    {
      key: "testCase",
      label: "Test case",
      sortValue: (item) => item.test_case_title,
      render: (item) => item.test_case_title
    },
    {
      key: "result",
      label: "Result",
      sortValue: (item) => item.result_status,
      render: (item) => <StatusBadge value={item.result_status} />
    },
    {
      key: "runStatus",
      label: "Run status",
      defaultVisible: false,
      render: (item) => <StatusBadge value={item.execution_status || "queued"} />
    },
    {
      key: "defects",
      label: "Bugs",
      sortValue: (item) => item.defects.length,
      render: (item) => item.defects.length
    },
    {
      key: "started",
      label: "Started",
      sortValue: (item) => item.started_at || item.result_created_at || "",
      render: (item) => formatTimestamp(item.started_at || item.result_created_at)
    },
    {
      key: "duration",
      label: "Duration",
      render: (item) => formatDuration(item.started_at, item.ended_at)
    },
    {
      key: "release",
      label: "Release",
      defaultVisible: false,
      render: (item) => item.release || "—"
    },
    {
      key: "actions",
      label: "Actions",
      canToggle: false,
      render: (item) => (
        <button className="ghost-button compact" onClick={() => openRun(item)} title="Open in Test Runs" type="button">
          <OpenIcon />
          <span>Open run</span>
        </button>
      )
    }
  ];

  if (historyQuery.isLoading) {
    return <LoadingState label="Loading run history" />;
  }

  if (historyQuery.isError) {
    return <div className="empty-state compact">Run history could not be loaded.</div>;
  }

  return (
    <div className="traceability-run-history">
      <div className="traceability-section-toolbar">
        <ActivityIcon />
        <strong>{rows.length} run outcome{rows.length === 1 ? "" : "s"}</strong>
      </div>
      <DataTable
        columns={columns}
        emptyMessage="No historical run outcome is linked to this item."
        getRowKey={(item) => item.id}
        hideToolbarCopy
        onRowClick={openRun}
        rows={rows}
        storageKey={`qaira:traceability-runs:${requirementId ? "requirement" : "test-case"}`}
      />
    </div>
  );
}
