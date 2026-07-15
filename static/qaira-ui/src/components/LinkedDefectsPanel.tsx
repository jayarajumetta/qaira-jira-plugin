import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { BugIcon, SearchIcon } from "./AppIcons";
import { LoadingState } from "./LoadingState";
import { StatusBadge } from "./StatusBadge";
import { api } from "../lib/api";
import type { RequirementDefectLink, TestCaseDefectLink } from "../types";

type DefectLink = RequirementDefectLink | TestCaseDefectLink;

export function LinkedDefectsPanel({
  canUpdate,
  initialDefects = [],
  itemId,
  onSaved,
  projectId,
  subject
}: {
  canUpdate: boolean;
  initialDefects?: DefectLink[];
  itemId: string;
  onSaved?: (defectIds: string[]) => void;
  projectId: string;
  subject: "requirement" | "test-case";
}) {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>(initialDefects.map((item) => item.id));
  const linkedDefectsQuery = useQuery({
    queryKey: ["linked-defects", subject, itemId],
    queryFn: () => subject === "test-case" ? api.testCaseDefects.listIssues(itemId) : Promise.resolve(initialDefects),
    enabled: Boolean(itemId),
    staleTime: 30_000
  });
  const defectSearchQuery = useQuery({
    queryKey: ["defect-search", projectId, submittedSearch || ""],
    queryFn: () => api.issues.list({
      project_id: projectId,
      q: submittedSearch || undefined,
      page_size: 25
    }),
    enabled: submittedSearch !== null && Boolean(projectId)
  });
  const replaceLinks = useMutation({
    mutationFn: (issueIds: string[]) => subject === "requirement"
      ? api.requirementDefects.replace(itemId, issueIds)
      : api.testCaseDefects.replace(itemId, issueIds)
  });
  const linkedDefects = linkedDefectsQuery.data || initialDefects;

  useEffect(() => {
    setSelectedIds(linkedDefects.map((item) => item.id));
  }, [itemId, linkedDefects]);

  const defects = useMemo(() => {
    const byId = new Map<string, DefectLink>();
    initialDefects.forEach((item) => byId.set(item.id, item));
    linkedDefects.forEach((item) => byId.set(item.id, item));
    (defectSearchQuery.data || []).forEach((item) => byId.set(item.id, {
      id: item.id,
      title: item.title,
      status: item.status,
      link_source: selectedIds.includes(item.id) ? "manual" : undefined,
      created_at: item.created_at
    }));
    return Array.from(byId.values()).sort((left, right) => {
      const linkedOrder = Number(selectedIds.includes(right.id)) - Number(selectedIds.includes(left.id));
      return linkedOrder || left.title.localeCompare(right.title);
    });
  }, [defectSearchQuery.data, initialDefects, linkedDefects, selectedIds]);

  const saveLinks = async () => {
    await replaceLinks.mutateAsync(selectedIds);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["linked-defects", subject, itemId] }),
      queryClient.invalidateQueries({ queryKey: [subject === "requirement" ? "requirements" : "global-test-cases"] })
    ]);
    onSaved?.(selectedIds);
  };

  return (
    <div className="linked-defects-panel">
      <div className="traceability-search-row">
        <div className="traceability-search-input">
          <SearchIcon />
          <input
            onChange={(event) => setSearchTerm(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                setSubmittedSearch(searchTerm.trim());
              }
            }}
            placeholder="Search Jira bugs"
            value={searchTerm}
          />
        </div>
        <button className="ghost-button" onClick={() => setSubmittedSearch(searchTerm.trim())} type="button">
          <SearchIcon />
          <span>Search</span>
        </button>
        <button
          className="primary-button"
          disabled={!canUpdate || replaceLinks.isPending}
          onClick={() => void saveLinks()}
          type="button"
        >
          {replaceLinks.isPending ? "Saving" : "Save links"}
        </button>
      </div>

      {linkedDefectsQuery.isLoading || defectSearchQuery.isLoading ? <LoadingState label="Loading bugs" /> : null}
      {!linkedDefectsQuery.isLoading && !defectSearchQuery.isLoading ? (
        <div className="linked-defect-list">
          {defects.map((defect) => (
            <label className={selectedIds.includes(defect.id) ? "linked-defect-row is-linked" : "linked-defect-row"} key={defect.id}>
              <input
                checked={selectedIds.includes(defect.id)}
                disabled={!canUpdate}
                onChange={(event) => setSelectedIds((current) => event.target.checked
                  ? [...new Set([...current, defect.id])]
                  : current.filter((id) => id !== defect.id))}
                type="checkbox"
              />
              <span className="linked-defect-icon"><BugIcon /></span>
              <span className="linked-defect-copy">
                <strong>{defect.title}</strong>
                <span>{defect.link_source === "automatic" ? "Linked from a failed run" : selectedIds.includes(defect.id) ? "Linked" : "Available"}</span>
              </span>
              <StatusBadge value={defect.status || "open"} />
            </label>
          ))}
          {!defects.length ? (
            <div className="empty-state compact">
              {submittedSearch === null ? "No linked bugs. Search Jira to add one." : "No bugs match this search."}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
