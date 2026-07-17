import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ActivityIcon, ClearSelectionIcon, OpenIcon, SearchIcon } from "./AppIcons";
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
  const [searchTerm, setSearchTerm] = useState("");
  const [resultFilter, setResultFilter] = useState("all");
  const filteredRows = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return rows.filter((row) => {
      if (resultFilter !== "all" && row.result_status !== resultFilter) return false;
      if (!normalizedSearch) return true;
      return [
        row.execution_id,
        row.execution_display_id || "",
        row.execution_name,
        row.execution_status || "",
        row.test_case_id,
        row.test_case_title,
        row.result_status,
        row.release || "",
        ...row.defects
      ].join(" ").toLowerCase().includes(normalizedSearch);
    });
  }, [resultFilter, rows, searchTerm]);
  const resultOptions = useMemo(
    () => Array.from(new Set(rows.map((row) => row.result_status).filter(Boolean))).sort((left, right) => left.localeCompare(right)),
    [rows]
  );

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
        <strong>{filteredRows.length} of {rows.length} run outcome{rows.length === 1 ? "" : "s"}</strong>
      </div>
      <div className="traceability-search-row traceability-run-filter-row">
        <label className="traceability-search-input">
          <SearchIcon />
          <input
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search runs, test cases, bugs, release"
            value={searchTerm}
          />
        </label>
        <label className="requirement-link-filter-field">
          <span>Result</span>
          <select value={resultFilter} onChange={(event) => setResultFilter(event.target.value)}>
            <option value="all">All results</option>
            {resultOptions.map((result) => (
              <option key={result} value={result}>{result}</option>
            ))}
          </select>
        </label>
        <button
          className="ghost-button"
          disabled={!searchTerm.trim() && resultFilter === "all"}
          onClick={() => {
            setSearchTerm("");
            setResultFilter("all");
          }}
          type="button"
        >
          <ClearSelectionIcon />
          <span>Clear filters</span>
        </button>
      </div>
      <DataTable
        columns={columns}
        emptyMessage="No historical run outcome is linked to this item."
        getRowKey={(item) => item.id}
        hideToolbarCopy
        onRowClick={openRun}
        rows={filteredRows}
        storageKey={`qaira:traceability-runs:${requirementId ? "requirement" : "test-case"}`}
      />
    </div>
  );
}
