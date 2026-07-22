import { useMemo, useState } from "react";
import { SearchIcon } from "./AppIcons";
import { DisplayIdBadge } from "./DisplayIdBadge";
import type { AppType, Issue, Requirement, TestCase, TestCaseModule } from "../types";

type NodeKind = "requirement" | "module" | "case" | "bug";
type SelectedNode = { kind: NodeKind; id: string } | null;
type TraceabilityView = "all" | "gaps";

const includesText = (values: Array<string | null | undefined>, search: string) =>
  !search || values.some((value) => String(value || "").toLowerCase().includes(search));

export function ProjectTraceabilityMap({
  appTypes,
  selectedAppTypeId,
  onAppTypeChange,
  requirements,
  modules,
  testCases,
  bugs,
  onOpen,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  loadMoreError = false
}: {
  appTypes: AppType[];
  selectedAppTypeId: string;
  onAppTypeChange: (id: string) => void;
  requirements: Requirement[];
  modules: TestCaseModule[];
  testCases: TestCase[];
  bugs: Issue[];
  onOpen: (kind: NodeKind, id: string) => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  loadMoreError?: boolean;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedNode, setSelectedNode] = useState<SelectedNode>(null);
  const [expandedKinds, setExpandedKinds] = useState<NodeKind[]>([]);
  const [view, setView] = useState<TraceabilityView>("all");
  const search = searchTerm.trim().toLowerCase();

  const scopedCases = useMemo(
    () => testCases.filter((item) => item.app_type_id === selectedAppTypeId),
    [selectedAppTypeId, testCases]
  );
  const scopedModules = useMemo(
    () => modules.filter((item) => item.app_type_id === selectedAppTypeId),
    [modules, selectedAppTypeId]
  );
  const graph = useMemo(() => {
    const requirementById = new Map(requirements.map((item) => [item.id, item]));
    const moduleById = new Map(scopedModules.map((item) => [item.id, item]));
    const caseById = new Map(scopedCases.map((item) => [item.id, item]));
    const bugById = new Map(bugs.map((item) => [item.id, item]));
    const requirementAlias = new Map<string, string>();
    const moduleAlias = new Map<string, string>();
    const caseAlias = new Map<string, string>();
    const bugAlias = new Map<string, string>();
    requirements.forEach((item) => [item.id, item.display_id].filter(Boolean).forEach((alias) => requirementAlias.set(String(alias), item.id)));
    scopedModules.forEach((item) => [item.id, item.display_id].filter(Boolean).forEach((alias) => moduleAlias.set(String(alias), item.id)));
    scopedCases.forEach((item) => [item.id, item.display_id].filter(Boolean).forEach((alias) => caseAlias.set(String(alias), item.id)));
    bugs.forEach((item) => [item.id, item.jira_bug_key].filter(Boolean).forEach((alias) => bugAlias.set(String(alias), item.id)));

    const requirementCases = new Map(requirements.map((item) => [item.id, new Set<string>()]));
    const moduleCases = new Map(scopedModules.map((item) => [item.id, new Set<string>()]));
    const caseRequirements = new Map(scopedCases.map((item) => [item.id, new Set<string>()]));
    const caseModules = new Map(scopedCases.map((item) => [item.id, new Set<string>()]));
    const caseBugs = new Map(scopedCases.map((item) => [item.id, new Set<string>()]));
    const bugCases = new Map(bugs.map((item) => [item.id, new Set<string>()]));
    const bugRequirements = new Map(bugs.map((item) => [item.id, new Set<string>()]));
    const bugModules = new Map(bugs.map((item) => [item.id, new Set<string>()]));

    const linkRequirementCase = (requirementReference: string, caseReference: string) => {
      const requirementId = requirementAlias.get(String(requirementReference));
      const caseId = caseAlias.get(String(caseReference));
      if (!requirementId || !caseId) return;
      requirementCases.get(requirementId)?.add(caseId);
      caseRequirements.get(caseId)?.add(requirementId);
    };
    const linkModuleCase = (moduleReference: string, caseReference: string) => {
      const moduleId = moduleAlias.get(String(moduleReference));
      const caseId = caseAlias.get(String(caseReference));
      if (!moduleId || !caseId) return;
      moduleCases.get(moduleId)?.add(caseId);
      caseModules.get(caseId)?.add(moduleId);
    };
    const linkBugCase = (bugReference: string, caseReference: string) => {
      const bugId = bugAlias.get(String(bugReference));
      const caseId = caseAlias.get(String(caseReference));
      if (!bugId || !caseId) return;
      bugCases.get(bugId)?.add(caseId);
      caseBugs.get(caseId)?.add(bugId);
    };

    scopedCases.forEach((testCase) => {
      [...(testCase.requirement_ids || []), testCase.requirement_id].filter(Boolean).forEach((id) => linkRequirementCase(String(id), testCase.id));
      (testCase.module_ids || []).forEach((id) => linkModuleCase(String(id), testCase.id));
      (testCase.defect_ids || []).forEach((id) => linkBugCase(String(id), testCase.id));
    });
    requirements.forEach((requirement) => (requirement.test_case_ids || []).forEach((id) => linkRequirementCase(requirement.id, String(id))));
    scopedModules.forEach((module) => (module.test_case_ids || []).forEach((id) => linkModuleCase(module.id, String(id))));
    bugs.forEach((bug) => {
      (bug.linked_test_case_ids || []).forEach((id) => linkBugCase(bug.id, String(id)));
      (bug.linked_requirement_ids || []).forEach((reference) => {
        const id = requirementAlias.get(String(reference));
        if (id) bugRequirements.get(bug.id)?.add(id);
      });
      (bug.linked_module_ids || []).forEach((reference) => {
        const id = moduleAlias.get(String(reference));
        if (id) bugModules.get(bug.id)?.add(id);
      });
    });
    return { requirementById, moduleById, caseById, bugById, requirementCases, moduleCases, caseRequirements, caseModules, caseBugs, bugCases, bugRequirements, bugModules };
  }, [bugs, requirements, scopedCases, scopedModules]);

  const connectedIds = useMemo(() => {
    if (!selectedNode) return null;
    const result = {
      requirement: new Set<string>(),
      module: new Set<string>(),
      case: new Set<string>(),
      bug: new Set<string>()
    };
    result[selectedNode.kind].add(selectedNode.id);

    const includeCase = (testCase: TestCase) => {
      result.case.add(testCase.id);
      graph.caseRequirements.get(testCase.id)?.forEach((id) => result.requirement.add(id));
      graph.caseModules.get(testCase.id)?.forEach((id) => result.module.add(id));
      graph.caseBugs.get(testCase.id)?.forEach((id) => result.bug.add(id));
    };

    if (selectedNode.kind === "case") {
      const item = graph.caseById.get(selectedNode.id);
      if (item) includeCase(item);
    } else if (selectedNode.kind === "requirement") {
      graph.requirementCases.get(selectedNode.id)?.forEach((id) => { const item = graph.caseById.get(id); if (item) includeCase(item); });
    } else if (selectedNode.kind === "module") {
      graph.moduleCases.get(selectedNode.id)?.forEach((id) => { const item = graph.caseById.get(id); if (item) includeCase(item); });
    } else {
      graph.bugCases.get(selectedNode.id)?.forEach((id) => { const item = graph.caseById.get(id); if (item) includeCase(item); });
      graph.bugRequirements.get(selectedNode.id)?.forEach((id) => result.requirement.add(id));
      graph.bugModules.get(selectedNode.id)?.forEach((id) => result.module.add(id));
    }

    graph.bugById.forEach((_bug, bugId) => {
      if ([...(graph.bugCases.get(bugId) || [])].some((id) => result.case.has(id))
        || [...(graph.bugRequirements.get(bugId) || [])].some((id) => result.requirement.has(id))
        || [...(graph.bugModules.get(bugId) || [])].some((id) => result.module.has(id))) result.bug.add(bugId);
    });
    return result;
  }, [graph, selectedNode]);

  const lanes = useMemo(() => {
    const requirementNodes = requirements.map((item) => ({
      id: item.id,
      displayId: item.display_id,
      title: item.title,
      meta: item.status || "No status",
      count: graph.requirementCases.get(item.id)?.size || 0,
      isGap: !(graph.requirementCases.get(item.id)?.size),
      gapLabel: "No tests in this app type",
      linkLabel: "linked cases"
    }));
    const moduleNodes = scopedModules.map((item) => ({
      id: item.id,
      displayId: item.display_id,
      title: item.name,
      meta: "Test module",
      count: graph.moduleCases.get(item.id)?.size || 0,
      isGap: !(graph.moduleCases.get(item.id)?.size),
      gapLabel: "No assigned tests",
      linkLabel: "assigned cases"
    }));
    const caseNodes = scopedCases.map((item) => ({
      id: item.id,
      displayId: item.display_id,
      title: item.title,
      meta: `${item.status || "No status"} · ${item.automated === "yes" ? "Automated" : "Manual"}`,
      count: (graph.caseRequirements.get(item.id)?.size || 0) + (graph.caseModules.get(item.id)?.size || 0),
      isGap: !(graph.caseRequirements.get(item.id)?.size) || !(graph.caseModules.get(item.id)?.size),
      gapLabel: [!(graph.caseRequirements.get(item.id)?.size) ? "No Story" : "", !(graph.caseModules.get(item.id)?.size) ? "No module" : ""].filter(Boolean).join(" · "),
      linkLabel: "Story/module links"
    }));
    const bugNodes = bugs.filter((bug) =>
      Boolean(graph.bugCases.get(bug.id)?.size || graph.bugModules.get(bug.id)?.size || graph.bugRequirements.get(bug.id)?.size)
    ).map((item) => ({
      id: item.id,
      displayId: item.jira_bug_key,
      title: item.title,
      meta: `${item.status || "No status"}${item.severity ? ` · ${item.severity}` : ""}`,
      count: graph.bugCases.get(item.id)?.size || 0,
      isGap: !(graph.bugCases.get(item.id)?.size),
      gapLabel: "No scoped test link",
      linkLabel: "linked cases"
    }));
    return [
      { kind: "requirement" as const, label: "Stories", nodes: requirementNodes, empty: "No Stories in this project" },
      { kind: "module" as const, label: "Modules", nodes: moduleNodes, empty: "No modules for this app type" },
      { kind: "case" as const, label: "Test cases", nodes: caseNodes, empty: "No cases for this app type" },
      { kind: "bug" as const, label: "Bugs", nodes: bugNodes, empty: "No connected Bugs" }
    ];
  }, [bugs, graph, requirements, scopedCases, scopedModules]);

  const linkedRequirementCount = lanes[0].nodes.filter((node) => node.count > 0).length;
  const linkedCaseCount = scopedCases.filter((item) => graph.caseRequirements.get(item.id)?.size && graph.caseModules.get(item.id)?.size).length;
  const gapCount = lanes.reduce((count, lane) => count + lane.nodes.filter((node) => node.isGap).length, 0);
  const selectedNodeLabel = selectedNode
    ? lanes.find((lane) => lane.kind === selectedNode.kind)?.nodes.find((node) => node.id === selectedNode.id)?.title
    : "";

  return (
    <section className="project-traceability-map">
      <div className="project-traceability-toolbar">
        <div>
          <strong>End-to-end traceability</strong>
          <span>Select an item to isolate its connected Story, module, test, and Bug neighborhood.</span>
        </div>
        <label>
          <span>App type</span>
          <select value={selectedAppTypeId} onChange={(event) => { onAppTypeChange(event.target.value); setSelectedNode(null); }}>
            {appTypes.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.type}</option>)}
          </select>
        </label>
        <div className="search-input-with-icon project-traceability-search">
          <SearchIcon />
          <input aria-label="Search traceability map" placeholder="Search map" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />
        </div>
      </div>

      <div className="project-traceability-health metric-strip page-metric-strip" aria-label="Traceability health metrics" role="group">
        <span><strong>{linkedRequirementCount}/{requirements.length}</strong> Stories covered</span>
        <span><strong>{scopedModules.length}</strong> Modules</span>
        <span><strong>{scopedCases.length}</strong> Test cases</span>
        <span><strong>{linkedCaseCount}</strong> fully traced cases</span>
        <button aria-pressed={view === "gaps"} className={view === "gaps" ? "project-traceability-gap-filter is-active" : "project-traceability-gap-filter"} onClick={() => { setView((current) => current === "gaps" ? "all" : "gaps"); setSelectedNode(null); }} type="button"><strong>{gapCount}</strong> mapping gaps</button>
        {selectedNode ? <button className="ghost-button compact" onClick={() => setSelectedNode(null)} type="button">Clear focus</button> : null}
      </div>

      {selectedNode && connectedIds ? (
        <div className="project-traceability-focus" role="status">
          <span>Focused path</span>
          <strong>{selectedNodeLabel}</strong>
          <small>{connectedIds.requirement.size} Stories · {connectedIds.module.size} modules · {connectedIds.case.size} cases · {connectedIds.bug.size} Bugs</small>
        </div>
      ) : null}

      <div className="project-traceability-lanes">
        {lanes.map((lane, laneIndex) => {
          const searchedNodes = lane.nodes
            .filter((node) => includesText([node.displayId, node.title, node.meta], search))
            .filter((node) => view === "all" || node.isGap)
            .sort((left, right) => {
              if (!connectedIds) return Number(right.isGap) - Number(left.isGap) || left.title.localeCompare(right.title);
              return Number(connectedIds[lane.kind].has(right.id)) - Number(connectedIds[lane.kind].has(left.id)) || left.title.localeCompare(right.title);
            });
          const connectedNodes = connectedIds ? searchedNodes.filter((node) => connectedIds[lane.kind].has(node.id)) : [];
          const defaultVisibleCount = Math.max(7, connectedNodes.length);
          const visibleNodes = expandedKinds.includes(lane.kind) ? searchedNodes : searchedNodes.slice(0, defaultVisibleCount);
          return (
            <section className={`project-traceability-lane is-${lane.kind}`} key={lane.kind}>
              <header>
                <span>{laneIndex + 1}</span>
                <strong>{lane.label}</strong>
                <small>{searchedNodes.length}</small>
              </header>
              <div className="project-traceability-node-list">
                {visibleNodes.map((node) => {
                  const isSelected = selectedNode?.kind === lane.kind && selectedNode.id === node.id;
                  const isConnected = !connectedIds || connectedIds[lane.kind].has(node.id);
                  return (
                    <article className={`project-traceability-node${isSelected ? " is-selected" : ""}${isConnected ? "" : " is-muted"}${node.isGap ? " is-gap" : ""}`} key={node.id}>
                      <button aria-pressed={isSelected} onClick={() => setSelectedNode(isSelected ? null : { kind: lane.kind, id: node.id })} type="button">
                        <span className="project-traceability-node-title">
                          {node.displayId ? <DisplayIdBadge value={node.displayId} /> : null}
                          <strong>{node.title}</strong>
                        </span>
                        <span>{node.meta}</span>
                        <small>{node.isGap ? node.gapLabel : `${node.count} ${node.linkLabel}`}</small>
                      </button>
                      <button aria-label={`Open ${node.title}`} className="project-traceability-open" onClick={() => onOpen(lane.kind, node.id)} title="Open workspace" type="button">↗</button>
                    </article>
                  );
                })}
                {!visibleNodes.length ? <div className="project-traceability-empty">{lane.empty}</div> : null}
              </div>
              {searchedNodes.length > 7 ? (
                <button className="ghost-button compact project-traceability-more" onClick={() => setExpandedKinds((current) => current.includes(lane.kind) ? current.filter((kind) => kind !== lane.kind) : [...current, lane.kind])} type="button">
                  {expandedKinds.includes(lane.kind) ? "Show less" : `Show ${searchedNodes.length - 7} more`}
                </button>
              ) : null}
            </section>
          );
        })}
      </div>
      {hasMore ? (
        <div className={`project-traceability-continuation${loadMoreError ? " is-error" : ""}`} role="status">
          <span><strong>{loadMoreError ? "The next Jira page could not be loaded." : "More Jira records are available."}</strong> {loadMoreError ? "The visible map is still usable but incomplete; retry when ready." : "Coverage is provisional until the remaining pages are loaded."}</span>
          <button className="ghost-button compact" disabled={isLoadingMore} onClick={onLoadMore} type="button">{isLoadingMore ? "Loading…" : "Load more records"}</button>
        </div>
      ) : null}
      <p className="project-traceability-footnote">Links are derived from loaded Jira/Qaira Story, module, case, and Bug mappings. Faded items are outside the selected node’s connected neighborhood; gap counts never treat unloaded pages as complete.</p>
    </section>
  );
}
