import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  addEdge,
  type Connection,
  useEdgesState,
  useNodesState
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useAuth } from "../auth/AuthContext";
import { CatalogSearchFilter } from "../components/CatalogSearchFilter";
import { CatalogSelectionControls } from "../components/CatalogSelectionControls";
import { CatalogViewToggle } from "../components/CatalogViewToggle";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { AddIcon, PlayIcon, SaveIcon, SparkIcon, TrashIcon } from "../components/AppIcons";
import { PageHeader } from "../components/PageHeader";
import { Panel } from "../components/Panel";
import { RichTextContent, RichTextEditor, richTextToPlainText } from "../components/RichTextEditor";
import { StatusBadge } from "../components/StatusBadge";
import { ToastMessage } from "../components/ToastMessage";
import { useFeatureFlags } from "../hooks/useFeatureFlags";
import { useCurrentAppType, useCurrentProject } from "../hooks/useCurrentProject";
import { api } from "../lib/api";
import { areFeatureFlagsEnabled } from "../lib/featureFlags";
import { hasPermission } from "../lib/permissions";
import { readDefaultCatalogViewMode } from "../lib/viewPreferences";
import type {
  AgenticWorkflow,
  AgenticWorkflowEdge,
  AgenticWorkflowNode,
  AgenticWorkflowNodeData,
  AgenticWorkflowRun,
  AgenticWorkflowStatus,
  AgenticWorkflowTriggerKind,
  Integration
} from "../types";

type WorkflowViewMode = "tile" | "list";
type WorkflowTab = "workflows" | "runs";
type WorkflowNodeKind =
  | "trigger"
  | "agent"
  | "llmAgent"
  | "webAgent"
  | "apiAgent"
  | "apiTool"
  | "knowledgeTool"
  | "repositoryTool"
  | "testOpsTool"
  | "condition"
  | "loop"
  | "aggregator"
  | "transform"
  | "errorHandler"
  | "log"
  | "output";

type WorkflowDraft = {
  id?: string;
  name: string;
  description: string;
  status: AgenticWorkflowStatus;
  trigger_kind: AgenticWorkflowTriggerKind;
  nodes: AgenticWorkflowNode[];
  edges: AgenticWorkflowEdge[];
  settings: Record<string, unknown>;
};

type AgenticCredential = {
  id: string;
  name: string;
  agentId: string;
  authType: "apiKey" | "bearer" | "basic" | "oauth2" | "custom";
  location: "header" | "query" | "body";
  keyName: string;
  secretReference: string;
  description: string;
};

type AgenticApiResponseStyle = "json" | "items" | "text" | "binary";

const DEFAULT_RUN_INPUT = `{
  "release_scope": "Release 2026.06 contains checkout, billing, and user profile updates",
  "source": "release-planning"
}`;

const AGENT_AUTH_TYPES: Array<{ value: AgenticCredential["authType"]; label: string }> = [
  { value: "apiKey", label: "API key" },
  { value: "bearer", label: "Bearer token" },
  { value: "basic", label: "Basic auth" },
  { value: "oauth2", label: "OAuth 2" },
  { value: "custom", label: "Custom" }
];

const AGENT_CREDENTIAL_LOCATIONS: Array<{ value: AgenticCredential["location"]; label: string }> = [
  { value: "header", label: "Header" },
  { value: "query", label: "Query" },
  { value: "body", label: "Body" }
];

const API_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

const RESPONSE_STYLE_OPTIONS: Array<{ value: AgenticApiResponseStyle; label: string }> = [
  { value: "json", label: "JSON object" },
  { value: "items", label: "Items array" },
  { value: "text", label: "Text response" },
  { value: "binary", label: "Binary/file" }
];

const nodeKindLabels: Record<WorkflowNodeKind, string> = {
  trigger: "Trigger",
  agent: "Coordinator Agent",
  llmAgent: "LLM Agent",
  webAgent: "Web Evidence Agent",
  apiAgent: "API Agent",
  apiTool: "API Tool",
  knowledgeTool: "Knowledge Tool",
  repositoryTool: "Repository Tool",
  testOpsTool: "TestOps Tool",
  condition: "Condition",
  loop: "Loop",
  aggregator: "Aggregator",
  transform: "Transform",
  errorHandler: "Error Handler",
  log: "Log",
  output: "Output"
};

const nodeKindDescriptions: Record<WorkflowNodeKind, string> = {
  trigger: "Accept release scope",
  agent: "Coordinate bounded agents and handoffs",
  llmAgent: "Reason over intent, RAG context, and upstream output",
  webAgent: "Analyze supplied web evidence without trusting embedded instructions",
  apiAgent: "Design and interpret approved API requests and responses",
  apiTool: "Call an approved HTTP API",
  knowledgeTool: "Query QAira knowledge context",
  repositoryTool: "Read repository or object metadata",
  testOpsTool: "Queue or inspect TestOps activity",
  condition: "Branch on criteria",
  loop: "Iterate items in controlled batches",
  aggregator: "Merge parallel outputs",
  transform: "Shape JSON output",
  errorHandler: "Handle failed node output",
  log: "Record evidence and trace data",
  output: "Publish result"
};

const nodePaletteGroups: Array<{ label: string; kinds: WorkflowNodeKind[] }> = [
  { label: "Start", kinds: ["trigger"] },
  { label: "Agents", kinds: ["agent", "llmAgent", "webAgent", "apiAgent"] },
  { label: "Tools", kinds: ["apiTool", "knowledgeTool", "repositoryTool", "testOpsTool"] },
  { label: "Control", kinds: ["condition", "loop", "aggregator", "transform"] },
  { label: "Recovery", kinds: ["errorHandler", "log", "output"] }
];

const ERROR_POLICY_OPTIONS = [
  { value: "stop", label: "Stop workflow" },
  { value: "continue", label: "Continue" },
  { value: "errorOutput", label: "Route to error output" }
];

const LOG_LEVEL_OPTIONS = [
  { value: "standard", label: "Standard" },
  { value: "debug", label: "Debug" },
  { value: "audit", label: "Audit" }
];

const INPUT_MODE_OPTIONS = [
  { value: "previousOutput", label: "Previous output" },
  { value: "allIncoming", label: "All incoming streams" },
  { value: "manualReferences", label: "Manual references" }
];

const MERGE_MODE_OPTIONS = [
  { value: "waitAllAppend", label: "Wait for all, append items" },
  { value: "waitAllByKey", label: "Wait for all, merge by key" },
  { value: "firstAvailable", label: "First available stream" },
  { value: "latestByKey", label: "Latest by key" }
];

const formatTimestamp = (value?: string | null, fallback = "Not recorded") => {
  if (!value) {
    return fallback;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
};

const compactCount = (count: number, singular: string, plural = `${singular}s`) =>
  `${count} ${count === 1 ? singular : plural}`;

const safeJsonParse = (value: string): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const prettyJson = (value: unknown) => JSON.stringify(value ?? {}, null, 2);

const getSnapshotArray = <T,>(snapshot: Record<string, unknown> | null | undefined, key: string): T[] => {
  const value = snapshot?.[key];
  return Array.isArray(value) ? (value as T[]) : [];
};

const getRunResultText = (result: Record<string, unknown> | null | undefined, key: string, fallback = "") =>
  String(result?.[key] ?? fallback);

const buildNodeDefaults = (kind: WorkflowNodeKind, index: number): AgenticWorkflowNodeData => {
  const isAgentKind = ["agent", "llmAgent", "webAgent", "apiAgent"].includes(kind);
  const base: AgenticWorkflowNodeData = {
    label: `${nodeKindLabels[kind]} step`,
    kind,
    summary: nodeKindDescriptions[kind],
    outputKey: `${kind}_${index + 1}`,
    retryCount: kind === "apiTool" || isAgentKind ? "2" : "0",
    retryDelayMs: "1000",
    timeoutMs: isAgentKind ? "60000" : "30000",
    onError: kind === "errorHandler" ? "continue" : "stop",
    logLevel: "standard",
    redactSecrets: "true"
  };

  if (isAgentKind) {
    return {
      ...base,
      model: "Default workspace LLM",
      intent: "Produce a quality-engineering decision grounded in the connected evidence.",
      instructions: "Return a concise result with evidence, risks, and the recommended next action.",
      prompt: "Use the workflow input and connected tools to produce a structured answer.",
      toolPolicy: "approved-tools-only",
      knowledgeScope: "requirements,test-cases,test-runs,knowledge",
      topK: "8",
      maxContextChars: "14000",
      maxOutputChars: "12000",
      maxCompletionTokens: "1200",
      outputSchema: '{"summary":"string","evidence":[],"risks":[],"next_action":"string"}',
      ...(kind === "webAgent" ? { webSourceMode: "supplied-evidence-only", externalLinksKey: "external_links" } : {}),
      ...(kind === "apiAgent" ? { apiMethod: "GET", apiResponseStyle: "json", apiValidationMode: "schema-and-status" } : {})
    };
  }

  if (kind === "apiTool") {
    return {
      ...base,
      label: "API tool",
      apiMethod: "GET",
      apiResponseStyle: "json",
      toolName: "HTTP Request",
      summary: "Call an approved REST API with bounded timeout and response preview."
    };
  }

  if (kind === "knowledgeTool") {
    return {
      ...base,
      label: "Knowledge lookup",
      toolName: "QAira Knowledge",
      knowledgeScope: "requirements,test-cases,object-repository",
      summary: "Search project knowledge without leaving the QAira boundary."
    };
  }

  if (kind === "repositoryTool") {
    return {
      ...base,
      label: "Repository lookup",
      toolName: "Repository",
      repositoryScope: "object-repository,automation-code",
      summary: "Resolve code, locator, and repository metadata through configured integrations."
    };
  }

  if (kind === "testOpsTool") {
    return {
      ...base,
      label: "TestOps tool",
      toolName: "TestOps",
      testOpsAction: "queue-batch",
      summary: "Use QAira TestOps adapters for controlled background activity."
    };
  }

  if (kind === "loop") {
    return {
      ...base,
      label: "Loop items",
      loopSourceKey: "items",
      loopBatchSize: "1",
      loopMaxIterations: "25",
      onError: "errorOutput",
      summary: "Iterate over a selected item array with clear batch and iteration limits."
    };
  }

  if (kind === "aggregator") {
    return {
      ...base,
      label: "Aggregate branch outputs",
      inputMode: "allIncoming",
      mergeMode: "waitAllAppend",
      aggregateKey: "id",
      outputKey: "aggregated_results",
      summary: "Collect parallel branch outputs into one deterministic downstream payload."
    };
  }

  if (kind === "errorHandler") {
    return {
      ...base,
      label: "Error recovery",
      errorRoute: "notify-and-continue",
      outputKey: "error_recovery",
      summary: "Collect failed node context and route it to a safe recovery path."
    };
  }

  if (kind === "log") {
    return {
      ...base,
      label: "Execution log",
      logLevel: "audit",
      outputKey: "execution_log",
      summary: "Persist node-level input, output, timings, and retry evidence."
    };
  }

  return base;
};

const getNodeOutputKey = (node: AgenticWorkflowNode | null | undefined) =>
  String(node?.data.outputKey || node?.data.output_key || node?.id || "output");

const createNodeId = (kind: WorkflowNodeKind) =>
  `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const createFlowEdge = (source: string, target: string, label?: string): AgenticWorkflowEdge => ({
  id: `${source}-${target}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  source,
  target,
  animated: true,
  label,
  markerEnd: { type: MarkerType.ArrowClosed },
  style: { strokeWidth: 1.8 }
});

const decorateFlowEdge = (edge: AgenticWorkflowEdge): AgenticWorkflowEdge => ({
  ...edge,
  markerEnd: edge.markerEnd || { type: MarkerType.ArrowClosed },
  style: { ...(edge.style || {}), strokeWidth: 1.8 }
});

const collectBranchLeafIds = (sourceId: string, currentEdges: AgenticWorkflowEdge[], visited = new Set<string>()): string[] => {
  if (visited.has(sourceId)) {
    return [];
  }

  visited.add(sourceId);
  const outgoing = currentEdges.filter((edge) => edge.source === sourceId);

  if (!outgoing.length) {
    return [sourceId];
  }

  return Array.from(new Set(outgoing.flatMap((edge) => collectBranchLeafIds(edge.target, currentEdges, new Set(visited)))));
};

const getDefaultWorkflowNodes = (): AgenticWorkflowNode[] => [
  {
    id: "release-scope",
    type: "agenticStep",
    position: { x: 80, y: 120 },
    data: {
      label: "Release scope intake",
      kind: "trigger",
      summary: "Capture release scope and source metadata.",
      outputKey: "release_scope",
      sampleOutput: "Normalized release scope"
    }
  },
  {
    id: "story-discovery-agent",
    type: "agenticStep",
    position: { x: 390, y: 80 },
    data: {
      label: "Story discovery agent",
      kind: "agent",
      summary: "Identify stories included in the release.",
      model: "Default workspace LLM",
      prompt: "Read the release scope, identify matching stories, and return story IDs with confidence.",
      outputKey: "stories",
      sampleOutput: "JSON array of release stories"
    }
  },
  {
    id: "json-contract",
    type: "agenticStep",
    position: { x: 700, y: 120 },
    data: {
      label: "JSON contract",
      kind: "transform",
      summary: "Normalize agent output into the downstream schema.",
      outputKey: "release_story_payload",
      sampleOutput: "Validated workflow JSON"
    }
  },
  {
    id: "test-planning-agent",
    type: "agenticStep",
    position: { x: 1010, y: 80 },
    data: {
      label: "Test planning agent",
      kind: "agent",
      summary: "Use release stories to propose impacted tests.",
      model: "Default workspace LLM",
      prompt: "Take release_story_payload and return impacted requirements, tests, and risk notes.",
      outputKey: "test_plan",
      sampleOutput: "Prioritized test plan"
    }
  }
];

const getDefaultWorkflowEdges = (): AgenticWorkflowEdge[] => [
  { id: "release-scope-story-discovery-agent", source: "release-scope", target: "story-discovery-agent", animated: true },
  { id: "story-discovery-agent-json-contract", source: "story-discovery-agent", target: "json-contract", animated: true },
  { id: "json-contract-test-planning-agent", source: "json-contract", target: "test-planning-agent", animated: true }
];

const createWorkflowDraft = (workflow?: AgenticWorkflow | null): WorkflowDraft => ({
  id: workflow?.id,
  name: workflow?.name || "Release scope to story map",
  description:
    workflow?.description ||
    "Takes release scope, identifies included stories, emits JSON, and passes the payload to downstream agents.",
  status: workflow?.status || "draft",
  trigger_kind: workflow?.trigger_kind || "manual",
  nodes: workflow?.nodes?.length ? workflow.nodes.map((node) => ({ ...node, type: node.type || "agenticStep" })) : getDefaultWorkflowNodes(),
  edges: workflow?.edges?.length ? workflow.edges : getDefaultWorkflowEdges(),
  settings: workflow?.settings || {
    execution_mode: "sequential",
    snapshot_runs: true
  }
});

const buildN8nPayload = (draft: WorkflowDraft, nodes: AgenticWorkflowNode[], edges: AgenticWorkflowEdge[]) => {
  const connections = edges.reduce<Record<string, { main: Array<Array<{ node: string; type: string; index: number }>> }>>((accumulator, edge) => {
    const sourceNode = nodes.find((node) => node.id === edge.source);
    const targetNode = nodes.find((node) => node.id === edge.target);

    if (!sourceNode || !targetNode) {
      return accumulator;
    }

    const sourceName = String(sourceNode.data.label || sourceNode.data.name || sourceNode.id);
    const targetName = String(targetNode.data.label || targetNode.data.name || targetNode.id);
    const current = accumulator[sourceName] || { main: [[]] };
    current.main[0].push({ node: targetName, type: "main", index: 0 });
    accumulator[sourceName] = current;
    return accumulator;
  }, {});

  return {
    name: draft.name,
    active: draft.status === "active",
    nodes: nodes.map((node) => {
      const incomingEdges = edges.filter((edge) => edge.target === node.id);
      const outgoingEdges = edges.filter((edge) => edge.source === node.id);

      return {
        id: node.id,
        name: String(node.data.label || node.data.name || node.id),
        type: `qaira.agentic.${node.data.kind || "agent"}`,
        typeVersion: 1,
        position: [node.position.x, node.position.y],
        parameters: {
          summary: node.data.summary || "",
          prompt: node.data.prompt || "",
          model: node.data.model || "",
          llmIntegrationId: node.data.llmIntegrationId || "",
          credentialId: node.data.credentialId || "",
          inputKey: node.data.inputKey || "",
          outputKey: node.data.outputKey || "",
          sampleOutput: node.data.sampleOutput || "",
          dataFlow: {
            inputMode: node.data.inputMode || (incomingEdges.length > 1 ? "allIncoming" : "previousOutput"),
            inputExpression: node.data.inputExpression || "",
            incoming: incomingEdges.map((edge) => {
              const sourceNode = nodes.find((item) => item.id === edge.source);
              return {
                edgeId: edge.id,
                sourceNodeId: edge.source,
                sourceOutputKey: getNodeOutputKey(sourceNode)
              };
            }),
            outgoing: outgoingEdges.map((edge) => ({
              edgeId: edge.id,
              targetNodeId: edge.target
            }))
          },
          merge: {
            mode: node.data.mergeMode || "",
            aggregateKey: node.data.aggregateKey || ""
          },
          runtime: {
            timeoutMs: node.data.timeoutMs || "30000",
            retryCount: node.data.retryCount || "0",
            retryDelayMs: node.data.retryDelayMs || "1000",
            onError: node.data.onError || "stop",
            logLevel: node.data.logLevel || "standard",
            redactSecrets: node.data.redactSecrets ?? "true"
          },
          loop: {
            sourceKey: node.data.loopSourceKey || "",
            batchSize: node.data.loopBatchSize || "",
            maxIterations: node.data.loopMaxIterations || ""
          },
          tool: {
            name: node.data.toolName || "",
            policy: node.data.toolPolicy || "approved-tools-only",
            knowledgeScope: node.data.knowledgeScope || "",
            repositoryScope: node.data.repositoryScope || "",
            testOpsAction: node.data.testOpsAction || ""
          },
          api: {
            method: node.data.apiMethod || "GET",
            url: node.data.apiUrl || "",
            auth: node.data.apiAuth || "",
            responseStyle: node.data.apiResponseStyle || "json",
            body: node.data.apiBody || ""
          }
        }
      };
    }),
    connections,
    settings: draft.settings,
    pinData: {},
    meta: {
      source: "qaira-agentic-workflows",
      compatible_with: "n8n-workflow-json",
      generated_at: new Date().toISOString()
    }
  };
};

function AgenticStepNode({ data }: { data: AgenticWorkflowNodeData }) {
  const kind = String(data.kind || "agent") as WorkflowNodeKind;
  const runStatus = String(data.runStatus || "");
  const model = String(data.model || "");
  const apiUrl = String(data.apiUrl || "");
  const retryCount = Number(data.retryCount || 0);
  const loopBatchSize = String(data.loopBatchSize || "");
  const onError = String(data.onError || "");
  const mergeMode = String(data.mergeMode || "");

  return (
    <div className={`agentic-flow-node agentic-flow-node--${kind}`}>
      <Handle className="agentic-flow-handle" position={Position.Left} type="target" />
      <div className="agentic-flow-node-kicker">
        <span>{nodeKindLabels[kind] || "Step"}</span>
        {runStatus ? <em>{runStatus}</em> : null}
      </div>
      <strong>{data.label || data.name || "Workflow step"}</strong>
      <p>{data.summary || nodeKindDescriptions[kind] || "Workflow operation"}</p>
      {model ? <span>{`LLM: ${model}`}</span> : null}
      {apiUrl ? <span>{`API: ${apiUrl}`}</span> : null}
      {retryCount ? <span>{`Retry: ${retryCount}x`}</span> : null}
      {loopBatchSize ? <span>{`Loop batch: ${loopBatchSize}`}</span> : null}
      {mergeMode ? <span>{`Merge: ${mergeMode}`}</span> : null}
      {onError && onError !== "stop" ? <span>{`Error: ${onError}`}</span> : null}
      <span>{data.outputKey ? `Output: ${data.outputKey}` : "Output: default"}</span>
      <Handle className="agentic-flow-handle" position={Position.Right} type="source" />
    </div>
  );
}

const nodeTypes = {
  agenticStep: AgenticStepNode
};

export function AgenticWorkflowsPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { session } = useAuth();
  const featureFlagsQuery = useFeatureFlags(Boolean(session));
  const isAgenticWorkflowsEnabled = areFeatureFlagsEnabled(
    featureFlagsQuery.data,
    ["qaira.ai.agentic_workflows"]
  );
  const canManageAgenticWorkflows = isAgenticWorkflowsEnabled
    && hasPermission(session, "agentic_workflow.manage");
  const canRunAgenticWorkflows = isAgenticWorkflowsEnabled
    && hasPermission(session, "agentic_workflow.run");
  const [projectId, setProjectId] = useCurrentProject();
  const [appTypeId, setAppTypeId] = useCurrentAppType(projectId);
  const activeTab: WorkflowTab = searchParams.get("view") === "runs" ? "runs" : "workflows";
  const setActiveTab = useCallback((nextTab: WorkflowTab) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("view", nextTab);
      return next;
    }, { replace: true });
  }, [setSearchParams]);
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<WorkflowViewMode>(() => readDefaultCatalogViewMode());
  const [selectedActionWorkflowIds, setSelectedActionWorkflowIds] = useState<string[]>([]);
  const [selectedActionRunIds, setSelectedActionRunIds] = useState<string[]>([]);
  const [draft, setDraft] = useState<WorkflowDraft | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [selectedRunId, setSelectedRunId] = useState("");
  const [selectedRunNodeId, setSelectedRunNodeId] = useState("");
  const [testingApiNodeId, setTestingApiNodeId] = useState("");
  const [isWorkflowMetaExpanded, setIsWorkflowMetaExpanded] = useState(true);
  const [isCredentialsExpanded, setIsCredentialsExpanded] = useState(false);
  const [runInput, setRunInput] = useState(DEFAULT_RUN_INPUT);
  const [toastMessage, setToastMessage] = useState("");
  const [toastTone, setToastTone] = useState<"success" | "error" | "info">("success");
  const [nodes, setNodes, onNodesChange] = useNodesState<AgenticWorkflowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<AgenticWorkflowEdge>([]);

  const projectsQuery = useQuery({ queryKey: ["projects"], queryFn: api.projects.list });
  const appTypesQuery = useQuery({ queryKey: ["app-types"], queryFn: () => api.appTypes.list() });
  const llmIntegrationsQuery = useQuery({
    queryKey: ["integrations", "agentic-workflows", "llm"],
    queryFn: () => api.integrations.list({ type: "llm" }),
    enabled: Boolean(session)
  });

  const projects = projectsQuery.data || [];
  const allAppTypes = appTypesQuery.data || [];
  const llmIntegrations = llmIntegrationsQuery.data || [];
  const scopedAppTypes = allAppTypes.filter((appType) => appType.project_id === projectId);
  const selectedProject = projects.find((project) => project.id === projectId) || null;
  const selectedAppType = scopedAppTypes.find((appType) => appType.id === appTypeId) || null;

  useEffect(() => {
    if (!projectId && projects.length) {
      setProjectId(projects[0].id);
    }
  }, [projectId, projects, setProjectId]);

  useEffect(() => {
    if (!projectId || !scopedAppTypes.length) {
      return;
    }

    if (!appTypeId || !scopedAppTypes.some((appType) => appType.id === appTypeId)) {
      setAppTypeId(scopedAppTypes[0].id);
    }
  }, [appTypeId, projectId, scopedAppTypes, setAppTypeId]);

  const workflowsQuery = useQuery({
    queryKey: ["agentic-workflows", projectId, appTypeId],
    queryFn: () => api.agenticWorkflows.list({ project_id: projectId, app_type_id: appTypeId }),
    enabled: Boolean(projectId)
  });

  const runsQuery = useQuery({
    queryKey: ["agentic-workflow-runs", projectId, appTypeId],
    queryFn: () => api.agenticWorkflows.listRuns({ project_id: projectId, app_type_id: appTypeId }),
    enabled: Boolean(projectId),
    refetchInterval: (query) => ((query.state.data || []) as AgenticWorkflowRun[]).some((run) => ["queued", "running"].includes(run.status)) ? 2000 : false
  });

  const workflows = workflowsQuery.data || [];
  const runs = runsQuery.data || [];
  const selectedRun = runs.find((run) => run.id === selectedRunId) || null;
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) || nodes[0] || null;
  const workflowCredentials = useMemo(() => {
    const credentials = draft?.settings?.agenticCredentials;
    return Array.isArray(credentials) ? (credentials as AgenticCredential[]) : [];
  }, [draft?.settings]);
  const llmProviderOptions = useMemo(() => {
    const providers = llmIntegrations
      .filter((integration) => integration.type === "llm")
      .sort((left, right) => Number(right.is_active) - Number(left.is_active) || left.name.localeCompare(right.name))
      .map((integration: Integration) => ({
        value: integration.id,
        label: `${integration.name}${integration.model ? ` · ${integration.model}` : ""}${integration.is_active ? "" : " · inactive"}`,
        modelLabel: integration.model || integration.name
      }));

    return [
      { value: "", label: "Default workspace LLM", modelLabel: "Default workspace LLM" },
      ...providers
    ];
  }, [llmIntegrations]);

  const selectedRunSnapshotNodes = useMemo(() => {
    if (!selectedRun) {
      return [];
    }

    const snapshotNodes = getSnapshotArray<AgenticWorkflowNode>(selectedRun.workflow_snapshot, "nodes");
    const resultsByNodeId = new Map(
      selectedRun.node_results.map((result) => [getRunResultText(result, "node_id"), result])
    );

    return snapshotNodes.map((node) => {
      const result = resultsByNodeId.get(node.id);
      return {
        ...node,
        type: node.type || "agenticStep",
        data: {
          ...node.data,
          runStatus: result ? getRunResultText(result, "status", "completed") : "not run",
          sampleOutput: result?.output ? prettyJson(result.output) : node.data.sampleOutput
        }
      };
    });
  }, [selectedRun]);

  const selectedRunSnapshotEdges = useMemo(() => {
    if (!selectedRun) {
      return [];
    }

    return getSnapshotArray<AgenticWorkflowEdge>(selectedRun.workflow_snapshot, "edges").map((edge) => ({
      ...edge,
      markerEnd: { type: MarkerType.ArrowClosed },
      style: { strokeWidth: 1.8 }
    }));
  }, [selectedRun]);

  const selectedRunNodeResult = useMemo(() => {
    if (!selectedRun) {
      return null;
    }

    const fallbackNodeId =
      selectedRunNodeId ||
      getRunResultText(selectedRun.node_results[0], "node_id") ||
      selectedRunSnapshotNodes[0]?.id ||
      "";

    return selectedRun.node_results.find((result) => getRunResultText(result, "node_id") === fallbackNodeId) || selectedRun.node_results[0] || null;
  }, [selectedRun, selectedRunNodeId, selectedRunSnapshotNodes]);

  const selectedIncomingEdges = useMemo(
    () => selectedNode ? edges.filter((edge) => edge.target === selectedNode.id) : [],
    [edges, selectedNode]
  );
  const selectedOutgoingEdges = useMemo(
    () => selectedNode ? edges.filter((edge) => edge.source === selectedNode.id) : [],
    [edges, selectedNode]
  );
  const selectedIncomingNodes = useMemo(
    () => selectedIncomingEdges
      .map((edge) => nodes.find((node) => node.id === edge.source))
      .filter(Boolean) as AgenticWorkflowNode[],
    [nodes, selectedIncomingEdges]
  );
  const selectedOutgoingNodes = useMemo(
    () => selectedOutgoingEdges
      .map((edge) => nodes.find((node) => node.id === edge.target))
      .filter(Boolean) as AgenticWorkflowNode[],
    [nodes, selectedOutgoingEdges]
  );
  const openBranchNodes = useMemo(() => {
    const sourcedNodeIds = new Set(edges.map((edge) => edge.source));
    return nodes.filter((node) => !sourcedNodeIds.has(node.id));
  }, [edges, nodes]);

  const invalidateWorkflowData = () => {
    void queryClient.invalidateQueries({ queryKey: ["agentic-workflows"] });
    void queryClient.invalidateQueries({ queryKey: ["agentic-workflow-runs"] });
  };

  const saveMutation = useMutation({
    mutationFn: async (nextDraft: WorkflowDraft) => {
      if (!projectId) {
        throw new Error("Select a project first.");
      }

      const payload = {
        project_id: projectId,
        app_type_id: appTypeId || undefined,
        name: nextDraft.name,
        description: nextDraft.description,
        status: nextDraft.status,
        trigger_kind: nextDraft.trigger_kind,
        nodes,
        edges,
        settings: nextDraft.settings,
        n8n_payload: buildN8nPayload(nextDraft, nodes, edges)
      };

      return nextDraft.id
        ? api.agenticWorkflows.update(nextDraft.id, payload)
        : api.agenticWorkflows.create(payload);
    },
    onSuccess: (workflow) => {
      invalidateWorkflowData();
      setDraft(createWorkflowDraft(workflow));
      setNodes(workflow.nodes.map((node) => ({ ...node, type: node.type || "agenticStep" })));
      setEdges(workflow.edges.map(decorateFlowEdge));
      setToastTone("success");
      setToastMessage("Agentic workflow saved.");
    },
    onError: (error) => {
      setToastTone("error");
      setToastMessage(error instanceof Error ? error.message : "Unable to save workflow.");
    }
  });

  const runMutation = useMutation({
    mutationFn: async (workflow: AgenticWorkflow) =>
      api.agenticWorkflows.run(workflow.id, {
        trigger_kind: draft?.trigger_kind || workflow.trigger_kind,
        input_payload: safeJsonParse(runInput)
      }),
    onSuccess: (run) => {
      invalidateWorkflowData();
      setSelectedRunId(run.id);
      setSelectedRunNodeId(getRunResultText(run.node_results[0], "node_id"));
      setDraft(null);
      setNodes([]);
      setEdges([]);
      setActiveTab("runs");
      setToastTone("success");
      setToastMessage("Workflow queued with a frozen snapshot. Progress will update here.");
    },
    onError: (error) => {
      setToastTone("error");
      setToastMessage(error instanceof Error ? error.message : "Unable to run workflow.");
    }
  });

  const deleteMutation = useMutation({
    mutationFn: api.agenticWorkflows.delete,
    onSuccess: () => {
      invalidateWorkflowData();
      setDraft(null);
      setToastTone("success");
      setToastMessage("Agentic workflow deleted.");
    },
    onError: (error) => {
      setToastTone("error");
      setToastMessage(error instanceof Error ? error.message : "Unable to delete workflow.");
    }
  });

  const filteredWorkflows = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    if (!term) {
      return workflows;
    }

    return workflows.filter((workflow) =>
      [
        workflow.name,
        workflow.description,
        workflow.status,
        workflow.trigger_kind,
        workflow.latest_run_status
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    );
  }, [searchTerm, workflows]);

  const filteredRuns = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    if (!term) {
      return runs;
    }

    return runs.filter((run) =>
      [
        run.workflow_name,
        run.status,
        run.trigger_kind,
        run.id,
        run.workflow_id
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    );
  }, [runs, searchTerm]);
  const visibleWorkflowIds = useMemo(() => filteredWorkflows.map((workflow) => workflow.id), [filteredWorkflows]);
  const visibleRunIds = useMemo(() => filteredRuns.map((run) => run.id), [filteredRuns]);
  const selectedActionIds = activeTab === "workflows" ? selectedActionWorkflowIds : selectedActionRunIds;
  const visibleActionIds = activeTab === "workflows" ? visibleWorkflowIds : visibleRunIds;
  const areAllFilteredActionItemsSelected = visibleActionIds.length > 0 && visibleActionIds.every((id) => selectedActionIds.includes(id));

  const workflowColumns = useMemo<Array<DataTableColumn<AgenticWorkflow>>>(() => [
    {
      key: "name",
      label: "Workflow",
      minWidth: 240,
      sortValue: (workflow) => workflow.name,
      render: (workflow) => (
        <div className="agentic-table-primary" title={richTextToPlainText(workflow.description) || workflow.name}>
          <strong>{workflow.name}</strong>
          <span>{richTextToPlainText(workflow.description) || "No description"}</span>
        </div>
      )
    },
    {
      key: "status",
      label: "Status",
      width: 120,
      sortValue: (workflow) => workflow.status,
      render: (workflow) => <StatusBadge value={workflow.status} />
    },
    {
      key: "trigger",
      label: "Trigger",
      width: 130,
      sortValue: (workflow) => workflow.trigger_kind,
      render: (workflow) => <span className="count-pill">{workflow.trigger_kind}</span>
    },
    {
      key: "steps",
      label: "Steps",
      width: 110,
      sortValue: (workflow) => workflow.nodes.length,
      render: (workflow) => compactCount(workflow.nodes.length, "step")
    },
    {
      key: "runs",
      label: "Runs",
      width: 110,
      sortValue: (workflow) => workflow.run_count || 0,
      render: (workflow) => workflow.run_count || 0
    },
    {
      key: "latest",
      label: "Latest run",
      minWidth: 170,
      sortValue: (workflow) => workflow.latest_run_at || "",
      render: (workflow) => formatTimestamp(workflow.latest_run_at, "No runs")
    }
  ], []);

  const runColumns = useMemo<Array<DataTableColumn<AgenticWorkflowRun>>>(() => [
    {
      key: "workflow",
      label: "Workflow",
      minWidth: 240,
      sortValue: (run) => run.workflow_name,
      render: (run) => (
        <div className="agentic-table-primary" title={run.id}>
          <strong>{run.workflow_name}</strong>
          <span>{run.id}</span>
        </div>
      )
    },
    {
      key: "status",
      label: "Status",
      width: 125,
      sortValue: (run) => run.status,
      render: (run) => <StatusBadge value={run.status || "queued"} />
    },
    {
      key: "trigger",
      label: "Trigger",
      width: 130,
      sortValue: (run) => run.trigger_kind,
      render: (run) => <span className="count-pill">{run.trigger_kind}</span>
    },
    {
      key: "steps",
      label: "Step results",
      width: 140,
      sortValue: (run) => run.node_results.length,
      render: (run) => compactCount(run.node_results.length, "step")
    },
    {
      key: "created",
      label: "Created",
      minWidth: 170,
      sortValue: (run) => run.created_at || "",
      render: (run) => formatTimestamp(run.created_at)
    }
  ], []);

  const openDraft = (workflow?: AgenticWorkflow) => {
    const nextDraft = createWorkflowDraft(workflow);
    setSelectedRunId("");
    setSelectedRunNodeId("");
    setDraft(nextDraft);
    setNodes(nextDraft.nodes.map((node) => ({ ...node, type: node.type || "agenticStep" })));
    setEdges(nextDraft.edges.map(decorateFlowEdge));
    setSelectedNodeId(nextDraft.nodes[0]?.id || "");
  };

  const openRun = (run: AgenticWorkflowRun) => {
    setDraft(null);
    setSelectedNodeId("");
    setNodes([]);
    setEdges([]);
    setSelectedRunId(run.id);
    setSelectedRunNodeId(getRunResultText(run.node_results[0], "node_id"));
    setActiveTab("runs");
  };

  const closeRun = () => {
    setSelectedRunId("");
    setSelectedRunNodeId("");
  };

  const closeDraft = () => {
    setDraft(null);
    setSelectedNodeId("");
    setNodes([]);
    setEdges([]);
  };

  const addWorkflowNode = (kind: WorkflowNodeKind) => {
    const id = createNodeId(kind);
    const x = Math.max(80, 90 + nodes.length * 260);
    const y = nodes.length % 2 === 0 ? 260 : 80;
    const nextNode: AgenticWorkflowNode = {
      id,
      type: "agenticStep",
      position: { x, y },
      data: buildNodeDefaults(kind, nodes.length)
    };

    setNodes((current) => [...current, nextNode]);
    setSelectedNodeId(id);
  };

  const addParallelNode = (kind: WorkflowNodeKind = "agent") => {
    const sourceNode = selectedNode || nodes[nodes.length - 1];
    const id = createNodeId(kind);
    const branchIndex = sourceNode ? edges.filter((edge) => edge.source === sourceNode.id).length : 0;
    const branchOffsets = [0, 170, -170, 340, -340, 510, -510];
    const yOffset = branchOffsets[branchIndex] ?? (branchIndex + 1) * 150;
    const nextNode: AgenticWorkflowNode = {
      id,
      type: "agenticStep",
      position: {
        x: sourceNode ? sourceNode.position.x + 310 : Math.max(80, 90 + nodes.length * 260),
        y: sourceNode ? Math.max(40, sourceNode.position.y + yOffset) : 120
      },
      data: {
        ...buildNodeDefaults(kind, nodes.length),
        inputMode: "previousOutput",
        inputExpression: sourceNode ? `{{${getNodeOutputKey(sourceNode)}}}` : ""
      }
    };

    setNodes((current) => [...current, nextNode]);

    if (sourceNode) {
      setEdges((currentEdges) => [
        ...currentEdges,
        createFlowEdge(sourceNode.id, id, `branch ${branchIndex + 1}`)
      ]);
    }

    setSelectedNodeId(id);
  };

  const addAggregatorNode = () => {
    const selectedOutgoingCount = selectedNode ? edges.filter((edge) => edge.source === selectedNode.id).length : 0;
    const branchLeafIds = selectedNode && selectedOutgoingCount > 1
      ? collectBranchLeafIds(selectedNode.id, edges).filter((id) => id !== selectedNode.id)
      : [];
    const openLeafIds = openBranchNodes.map((node) => node.id);
    const sourceIds = Array.from(new Set((branchLeafIds.length > 1 ? branchLeafIds : openLeafIds).filter(Boolean)));
    const sourceNodes = sourceIds
      .map((id) => nodes.find((node) => node.id === id))
      .filter(Boolean) as AgenticWorkflowNode[];
    const fallbackSource = selectedNode || nodes[nodes.length - 1] || null;
    const aggregatorSources = sourceNodes.length ? sourceNodes : fallbackSource ? [fallbackSource] : [];
    const id = createNodeId("aggregator");
    const maxX = aggregatorSources.length
      ? Math.max(...aggregatorSources.map((node) => node.position.x))
      : Math.max(80, 90 + nodes.length * 260);
    const averageY = aggregatorSources.length
      ? aggregatorSources.reduce((sum, node) => sum + node.position.y, 0) / aggregatorSources.length
      : 120;
    const nextNode: AgenticWorkflowNode = {
      id,
      type: "agenticStep",
      position: { x: maxX + 330, y: Math.max(40, averageY) },
      data: buildNodeDefaults("aggregator", nodes.length)
    };

    setNodes((current) => [...current, nextNode]);
    setEdges((currentEdges) => [
      ...currentEdges,
      ...aggregatorSources.map((source) => createFlowEdge(source.id, id, getNodeOutputKey(source)))
    ]);
    setSelectedNodeId(id);
  };

  const deleteSelectedNode = () => {
    if (!selectedNode) {
      return;
    }

    const deletedNodeId = selectedNode.id;
    const nextNodes = nodes.filter((node) => node.id !== deletedNodeId);
    setNodes(nextNodes);
    setEdges((currentEdges) => currentEdges.filter((edge) => edge.source !== deletedNodeId && edge.target !== deletedNodeId));
    updateDraftSetting(
      "agenticCredentials",
      workflowCredentials.map((credential) =>
        credential.agentId === deletedNodeId ? { ...credential, agentId: "" } : credential
      )
    );
    setSelectedNodeId(nextNodes[0]?.id || "");
    setToastTone("info");
    setToastMessage("Node deleted and connected edges removed.");
  };

  const updateSelectedNode = (field: keyof AgenticWorkflowNodeData, value: string) => {
    if (!selectedNode) {
      return;
    }

    setNodes((current) =>
      current.map((node) =>
        node.id === selectedNode.id
          ? { ...node, data: { ...node.data, [field]: value } }
          : node
      )
    );
  };

  const updateSelectedNodeFields = (patch: Partial<AgenticWorkflowNodeData>) => {
    if (!selectedNode) {
      return;
    }

    setNodes((current) =>
      current.map((node) =>
        node.id === selectedNode.id
          ? { ...node, data: { ...node.data, ...patch } }
          : node
      )
    );
  };

  const updateDraftSetting = (key: string, value: unknown) => {
    setDraft((current) => current ? { ...current, settings: { ...current.settings, [key]: value } } : current);
  };

  const updateCredential = (credentialId: string, patch: Partial<AgenticCredential>) => {
    updateDraftSetting(
      "agenticCredentials",
      workflowCredentials.map((credential) =>
        credential.id === credentialId ? { ...credential, ...patch } : credential
      )
    );
  };

  const addCredential = () => {
    const credential: AgenticCredential = {
      id: `credential-${Date.now()}`,
      name: "New agent credential",
      agentId: selectedNode?.id || nodes.find((node) => node.data.kind === "agent")?.id || "",
      authType: "apiKey",
      location: "header",
      keyName: "Authorization",
      secretReference: "",
      description: ""
    };

    setIsCredentialsExpanded(true);
    updateDraftSetting("agenticCredentials", [...workflowCredentials, credential]);
  };

  const deleteCredential = (credentialId: string) => {
    updateDraftSetting(
      "agenticCredentials",
      workflowCredentials.filter((credential) => credential.id !== credentialId)
    );
  };

  const testSelectedApiAgent = async () => {
    if (!selectedNode) {
      return;
    }

    const method = String(selectedNode.data.apiMethod || "GET");
    const url = String(selectedNode.data.apiUrl || "");
    const responseStyle = String(selectedNode.data.apiResponseStyle || "json") as AgenticApiResponseStyle;
    const credential =
      workflowCredentials.find((item) => item.id === selectedNode.data.credentialId) ||
      workflowCredentials.find((item) => item.agentId === selectedNode.id) ||
      null;

    if (!url.trim()) {
      updateSelectedNode("apiTestOutput", prettyJson({ ok: false, status: 422, message: "Configure an endpoint URL before testing." }));
      return;
    }

    setTestingApiNodeId(selectedNode.id);
    updateSelectedNode("apiTestOutput", prettyJson({ status: "running", method, url, responseStyle }));

    try {
      const result = await api.agenticWorkflows.testApiAgent({
        method,
        url,
        auth: String(selectedNode.data.apiAuth || ""),
        responseStyle,
        body: String(selectedNode.data.apiBody || ""),
        credential: credential ? { ...credential } : null
      });

      updateSelectedNode("apiTestOutput", prettyJson(result));
      setToastTone("success");
      setToastMessage("API agent test completed.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to test API agent.";
      updateSelectedNode("apiTestOutput", prettyJson({ ok: false, method, url, responseStyle, message }));
      setToastTone("error");
      setToastMessage(message);
    } finally {
      setTestingApiNodeId("");
    }
  };

  const saveCurrentDraft = async () => {
    if (!draft || !canManageAgenticWorkflows) {
      return null;
    }

    const workflow = await saveMutation.mutateAsync(draft);
    return workflow;
  };

  const runCurrentDraft = async () => {
    if (!draft || !canRunAgenticWorkflows) {
      return;
    }

    const workflow = canManageAgenticWorkflows
      ? await saveCurrentDraft()
      : workflows.find((candidate) => candidate.id === draft.id) || null;
    if (workflow) {
      runMutation.mutate(workflow);
    }
  };

  const handleNodesDeleted = useCallback((deletedNodes: AgenticWorkflowNode[]) => {
    const deletedIds = new Set(deletedNodes.map((node) => node.id));

    if (!deletedIds.size) {
      return;
    }

    setEdges((currentEdges) => currentEdges.filter((edge) => !deletedIds.has(edge.source) && !deletedIds.has(edge.target)));
    setSelectedNodeId((currentSelectedId) => deletedIds.has(currentSelectedId) ? "" : currentSelectedId);
    updateDraftSetting(
      "agenticCredentials",
      workflowCredentials.map((credential) =>
        deletedIds.has(credential.agentId) ? { ...credential, agentId: "" } : credential
      )
    );
  }, [setEdges, workflowCredentials]);

  const onConnect = useCallback((connection: Connection) => {
    setEdges((currentEdges) => addEdge({
      ...connection,
      id: `${connection.source}-${connection.target}-${Date.now()}`,
      animated: true,
      markerEnd: { type: MarkerType.ArrowClosed },
      style: { strokeWidth: 1.8 }
    }, currentEdges));
  }, [setEdges]);

  const emptyScope = !projectId || !appTypeId;
  const selectedNodeKind = String(selectedNode?.data.kind || "agent");
  const isAgentNodeSelected = ["agent", "llmAgent", "webAgent", "apiAgent"].includes(selectedNodeKind);
  const isToolNodeSelected = ["agent", "llmAgent", "webAgent", "apiAgent", "apiTool", "knowledgeTool", "repositoryTool", "testOpsTool"].includes(selectedNodeKind);
  const isApiToolSelected = ["apiTool", "apiAgent"].includes(selectedNodeKind) || Boolean(selectedNode?.data.apiUrl);

  return (
    <div className="page page-agentic-workflows">
      <PageHeader
        eyebrow="Agent farm"
        title="Agentic Workflows"
        description="Create multi-agent workflow definitions, run them with immutable snapshots, and review historical workflow output."
        meta={[
          { label: "Workflows", value: workflows.length },
          { label: "Runs", value: runs.length },
          { label: "Scope", value: selectedAppType?.name || selectedProject?.name || "Not selected" }
        ]}
      />

      <div className="agentic-page-stage">
      {!draft && !selectedRun ? (
        <Panel
          className="agentic-workflows-panel"
          title={activeTab === "workflows" ? "Agentic workflow catalog" : "Workflow run history"}
          titleVariant="eyebrow"
          subtitle={activeTab === "workflows" ? "Browse saved workflow definitions in the current project and app type." : "Review run records with the workflow snapshot captured at launch time."}
        >
          <div className="design-list-toolbar agentic-workflows-toolbar">
            <CatalogViewToggle onChange={setViewMode} value={viewMode} />
            <CatalogSearchFilter
              activeFilterCount={searchTerm.trim() ? 1 : 0}
              ariaLabel={activeTab === "workflows" ? "Search workflows" : "Search workflow runs"}
              onChange={setSearchTerm}
              placeholder={activeTab === "workflows" ? "Search workflows" : "Search workflow runs"}
              title={activeTab === "workflows" ? "Filter workflows" : "Filter workflow runs"}
              type="search"
              value={searchTerm}
            >
              <div className="catalog-filter-grid">
                <label className="catalog-filter-field">
                  <span>Search</span>
                  <input onChange={(event) => setSearchTerm(event.target.value)} value={searchTerm} />
                </label>
              </div>
            </CatalogSearchFilter>
            <CatalogSelectionControls
              allSelected={areAllFilteredActionItemsSelected}
              canSelectAll={Boolean(visibleActionIds.length)}
              onClear={() => {
                if (activeTab === "workflows") {
                  setSelectedActionWorkflowIds([]);
                } else {
                  setSelectedActionRunIds([]);
                }
              }}
              onSelectAll={() => {
                if (activeTab === "workflows") {
                  setSelectedActionWorkflowIds((current) => Array.from(new Set([...current, ...visibleWorkflowIds])));
                } else {
                  setSelectedActionRunIds((current) => Array.from(new Set([...current, ...visibleRunIds])));
                }
              }}
              selectedCount={selectedActionIds.length}
            />
            {activeTab === "workflows" ? (
              <button
                className="primary-button catalog-selection-button"
                disabled={emptyScope || !canManageAgenticWorkflows}
                onClick={() => openDraft()}
                type="button"
              >
                <AddIcon />
                <span>Create Agentic Workflow</span>
              </button>
            ) : null}
          </div>

          <div className="agentic-catalog-stage" data-tab={activeTab} data-view={viewMode}>
            {emptyScope ? (
              <div className="empty-state compact">Select a project and app type to manage agentic workflows.</div>
            ) : activeTab === "workflows" ? (
              viewMode === "list" ? (
                <DataTable
                  columns={workflowColumns}
                  rows={filteredWorkflows}
                  emptyMessage="No agentic workflows created yet."
                  enableColumnResize
                  enableHeaderColumnReorder
                  getRowKey={(workflow) => workflow.id}
                  hideToolbarCopy
                  onRowClick={openDraft}
                  storageKey="agentic-workflows-list-columns"
                />
              ) : (
                <div className="tile-browser-grid agentic-workflow-grid">
                  {filteredWorkflows.map((workflow) => (
                    <button className="record-card tile-card agentic-workflow-card" key={workflow.id} onClick={() => openDraft(workflow)} type="button">
                      <div className="tile-card-main">
                        <div className="tile-card-select-row" onClick={(event) => event.stopPropagation()}>
                          <label className="checkbox-field">
                            <input
                              aria-label={`Select ${workflow.name}`}
                              checked={selectedActionWorkflowIds.includes(workflow.id)}
                              onChange={() =>
                                setSelectedActionWorkflowIds((current) =>
                                  current.includes(workflow.id) ? current.filter((id) => id !== workflow.id) : [...current, workflow.id]
                                )
                              }
                              type="checkbox"
                            />
                            <span className="sr-only">Select workflow</span>
                          </label>
                        </div>
                        <div className="tile-card-header">
                          <span className="agentic-type-badge" aria-hidden="true"><SparkIcon size={14} /></span>
                          <div className="tile-card-title-group">
                            <span className="tile-card-kicker">{workflow.trigger_kind}</span>
                            <strong>{workflow.name}</strong>
                          </div>
                          <StatusBadge value={workflow.status} />
                        </div>
                        <RichTextContent className="tile-card-description" title={richTextToPlainText(workflow.description)} value={workflow.description} fallback="No description" />
                        <div className="tile-card-facts">
                          <span><strong>{workflow.nodes.length}</strong><small>Steps</small></span>
                          <span><strong>{workflow.run_count || 0}</strong><small>Runs</small></span>
                          <span><strong>{workflow.latest_run_status || "none"}</strong><small>Latest</small></span>
                        </div>
                      </div>
                    </button>
                  ))}
                  {!filteredWorkflows.length ? <div className="empty-state compact">No agentic workflows created yet.</div> : null}
                </div>
              )
            ) : viewMode === "list" ? (
              <DataTable
                columns={runColumns}
                rows={filteredRuns}
                emptyMessage="No workflow runs captured yet."
                enableColumnResize
                enableHeaderColumnReorder
                getRowKey={(run) => run.id}
                getRowClassName={(run) => (selectedRunId === run.id ? "is-active-row" : "")}
                hideToolbarCopy
                onRowClick={openRun}
                storageKey="agentic-workflow-runs-list-columns"
              />
            ) : (
              <div className="tile-browser-grid agentic-workflow-grid">
                {filteredRuns.map((run) => (
                  <button className={selectedRunId === run.id ? "record-card tile-card agentic-workflow-card is-active" : "record-card tile-card agentic-workflow-card"} key={run.id} onClick={() => openRun(run)} type="button">
                    <div className="tile-card-main">
                      <div className="tile-card-select-row" onClick={(event) => event.stopPropagation()}>
                        <label className="checkbox-field">
                          <input
                            aria-label={`Select ${run.workflow_name}`}
                            checked={selectedActionRunIds.includes(run.id)}
                            onChange={() =>
                              setSelectedActionRunIds((current) =>
                                current.includes(run.id) ? current.filter((id) => id !== run.id) : [...current, run.id]
                              )
                            }
                            type="checkbox"
                          />
                          <span className="sr-only">Select workflow run</span>
                        </label>
                      </div>
                      <div className="tile-card-header">
                        <span className="agentic-type-badge" aria-hidden="true"><PlayIcon size={14} /></span>
                        <div className="tile-card-title-group">
                          <span className="tile-card-kicker">{formatTimestamp(run.created_at)}</span>
                          <strong>{run.workflow_name}</strong>
                        </div>
                        <StatusBadge value={run.status || "queued"} />
                      </div>
                      <p className="tile-card-description" title={run.id}>{run.id}</p>
                      <div className="tile-card-facts">
                        <span><strong>{run.node_results.length}</strong><small>Steps</small></span>
                        <span><strong>{run.trigger_kind}</strong><small>Trigger</small></span>
                        <span><strong>{run.completed_at ? "Yes" : "No"}</strong><small>Snapshot</small></span>
                      </div>
                    </div>
                  </button>
                ))}
                {!filteredRuns.length ? <div className="empty-state compact">No workflow runs captured yet.</div> : null}
              </div>
            )}
          </div>
        </Panel>
      ) : null}

      {draft ? (
        <Panel
          className="agentic-playground-panel"
          title="Agentic workflow playground"
          titleVariant="eyebrow"
          subtitle="Compose agent steps, connect them, and save a workflow definition."
          actions={(
            <div className="agentic-playground-actions">
              <button className="ghost-button" onClick={closeDraft} type="button">Back</button>
              {draft.id && canManageAgenticWorkflows ? (
                <button
                  className="ghost-button danger"
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate(draft.id!)}
                  type="button"
                >
                  Delete
                </button>
              ) : null}
              {canManageAgenticWorkflows ? (
                <button className="ghost-button agentic-save-button" disabled={saveMutation.isPending} onClick={saveCurrentDraft} type="button">
                  <SaveIcon />
                  Save
                </button>
              ) : null}
              <button
                className="primary-button"
                disabled={!canRunAgenticWorkflows || saveMutation.isPending || runMutation.isPending || (!draft.id && !canManageAgenticWorkflows)}
                onClick={runCurrentDraft}
                type="button"
              >
                <PlayIcon />
                Run workflow
              </button>
            </div>
          )}
        >
          <div className="agentic-page-heading">
            <div>
              <span>Workflow builder</span>
              <strong>{draft.name}</strong>
              <p>Design the agent graph, assign credentials and LLMs, then run a saved snapshot.</p>
            </div>
            <div className="agentic-page-heading-metrics">
              <span><strong>{nodes.length}</strong> nodes</span>
              <span><strong>{edges.length}</strong> links</span>
              <span><strong>{workflowCredentials.length}</strong> credentials</span>
            </div>
          </div>
          <div className="agentic-playground-grid">
            <div className="agentic-playground-main">
              <section className={isWorkflowMetaExpanded ? "agentic-meta-panel is-expanded" : "agentic-meta-panel"}>
                <div className="agentic-section-heading">
                  <button
                    aria-expanded={isWorkflowMetaExpanded}
                    className="agentic-section-toggle"
                    onClick={() => setIsWorkflowMetaExpanded((current) => !current)}
                    type="button"
                  >
                    <span aria-hidden="true">{isWorkflowMetaExpanded ? "-" : "+"}</span>
                    <div>
                      <strong>Workflow Details</strong>
                      <small>Name, status, trigger, and description for this workflow.</small>
                    </div>
                  </button>
                </div>
                {isWorkflowMetaExpanded ? (
                  <div className="agentic-workflow-form">
                    <label>
                      <span>Name</span>
                      <input
                        onChange={(event) => setDraft((current) => current ? { ...current, name: event.target.value } : current)}
                        value={draft.name}
                      />
                    </label>
                    <label>
                      <span>Status</span>
                      <select
                        onChange={(event) => setDraft((current) => current ? { ...current, status: event.target.value as AgenticWorkflowStatus } : current)}
                        value={draft.status}
                      >
                        <option value="draft">Draft</option>
                        <option value="active">Active</option>
                        <option value="paused">Paused</option>
                      </select>
                    </label>
                    <label>
                      <span>Trigger</span>
                      <select
                        onChange={(event) => setDraft((current) => current ? { ...current, trigger_kind: event.target.value as AgenticWorkflowTriggerKind } : current)}
                        value={draft.trigger_kind}
                      >
                        <option value="manual">Manual</option>
                        <option value="release">Release</option>
                        <option value="schedule">Schedule</option>
                        <option value="webhook">Webhook</option>
                        <option value="event">Event</option>
                      </select>
                    </label>
                    <label className="agentic-workflow-form-wide">
                      <span>Description</span>
                      <RichTextEditor
                        rows={3}
                        onChange={(description) => setDraft((current) => current ? { ...current, description } : current)}
                        value={draft.description}
                      />
                    </label>
                  </div>
                ) : null}
              </section>

              <section className={isCredentialsExpanded ? "agentic-credentials-panel is-expanded" : "agentic-credentials-panel"}>
                <div className="agentic-section-heading">
                  <button
                    aria-expanded={isCredentialsExpanded}
                    className="agentic-section-toggle"
                    onClick={() => setIsCredentialsExpanded((current) => !current)}
                    type="button"
                  >
                    <span aria-hidden="true">{isCredentialsExpanded ? "-" : "+"}</span>
                    <div>
                      <strong>Agentic credentials</strong>
                      <small>Store auth references per agent for API tools, repositories, and external services.</small>
                    </div>
                  </button>
                  <button className="ghost-button" onClick={addCredential} type="button">
                    <AddIcon size={15} />
                    Add credential
                  </button>
                </div>
                {isCredentialsExpanded && workflowCredentials.length ? (
                  <div className="agentic-credential-grid">
                    {workflowCredentials.map((credential) => (
                      <article className="agentic-credential-card" key={credential.id}>
                        <div className="agentic-credential-card-head">
                          <strong>{credential.name || "Agent credential"}</strong>
                          <button className="ghost-button danger" onClick={() => deleteCredential(credential.id)} type="button">Remove</button>
                        </div>
                        <div className="agentic-credential-fields">
                          <label>
                            <span>Name</span>
                            <input onChange={(event) => updateCredential(credential.id, { name: event.target.value })} value={credential.name} />
                          </label>
                          <label>
                            <span>Agent</span>
                            <select onChange={(event) => updateCredential(credential.id, { agentId: event.target.value })} value={credential.agentId}>
                              <option value="">Workflow level</option>
                              {nodes.map((node) => (
                                <option key={node.id} value={node.id}>{String(node.data.label || node.id)}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            <span>Auth</span>
                            <select onChange={(event) => updateCredential(credential.id, { authType: event.target.value as AgenticCredential["authType"] })} value={credential.authType}>
                              {AGENT_AUTH_TYPES.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            <span>Location</span>
                            <select onChange={(event) => updateCredential(credential.id, { location: event.target.value as AgenticCredential["location"] })} value={credential.location}>
                              {AGENT_CREDENTIAL_LOCATIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            <span>Key name</span>
                            <input onChange={(event) => updateCredential(credential.id, { keyName: event.target.value })} value={credential.keyName} />
                          </label>
                          <label>
                            <span>Secret reference</span>
                            <input
                              onChange={(event) => updateCredential(credential.id, { secretReference: event.target.value })}
                              placeholder="Runner or environment secret name"
                              value={credential.secretReference || ""}
                            />
                          </label>
                          <label className="agentic-credential-wide">
                            <span>Description</span>
                            <input onChange={(event) => updateCredential(credential.id, { description: event.target.value })} value={credential.description} />
                          </label>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : isCredentialsExpanded ? (
                  <div className="empty-state compact">Add a workflow credential when an agent needs API, repository, or service authentication.</div>
                ) : null}
              </section>

              <div className="agentic-node-palette agentic-node-palette--grouped" aria-label="Workflow node palette">
                {nodePaletteGroups.map((group) => (
                  <section className="agentic-node-palette-group" key={group.label}>
                    <strong>{group.label}</strong>
                    <div>
                      {group.kinds.map((kind) => (
                        <button key={kind} onClick={() => addWorkflowNode(kind)} type="button">
                          <SparkIcon size={14} />
                          {nodeKindLabels[kind]}
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>

              <div className="agentic-branch-action-strip" aria-label="Branch actions">
                <button disabled={!selectedNode} onClick={() => addParallelNode("agent")} type="button">
                  <AddIcon size={14} />
                  Parallel AI node
                </button>
                <button disabled={!selectedNode} onClick={() => addParallelNode("apiTool")} type="button">
                  <AddIcon size={14} />
                  Parallel API tool
                </button>
                <button disabled={!nodes.length} onClick={addAggregatorNode} type="button">
                  <SparkIcon size={14} />
                  Aggregate branches
                </button>
              </div>

              <div className="agentic-flow-shell">
                <ReactFlow
                  attributionPosition="bottom-right"
                  deleteKeyCode={["Backspace", "Delete"]}
                  edges={edges}
                  fitView
                  nodeTypes={nodeTypes}
                  nodes={nodes}
                  onConnect={onConnect}
                  onEdgesChange={onEdgesChange}
                  onNodeClick={(_, node) => setSelectedNodeId(node.id)}
                  onNodesDelete={handleNodesDeleted}
                  onNodesChange={onNodesChange}
                >
                  <Controls />
                  <MiniMap pannable zoomable />
                  <Background gap={18} size={1} />
                </ReactFlow>
              </div>
            </div>

            <aside className="agentic-playground-sidebar">
              <section className="agentic-inspector-card">
                <div className="agentic-inspector-card-head">
                  <h3>Step inspector</h3>
                  {selectedNode ? (
                    <button className="ghost-button danger" onClick={deleteSelectedNode} type="button">
                      <TrashIcon size={15} />
                      Delete node
                    </button>
                  ) : null}
                </div>
                {selectedNode ? (
                  <>
                    <label>
                      <span>Label</span>
                      <input onChange={(event) => updateSelectedNode("label", event.target.value)} value={String(selectedNode.data.label || "")} />
                    </label>
                    <label>
                      <span>Kind</span>
                      <select onChange={(event) => updateSelectedNode("kind", event.target.value)} value={String(selectedNode.data.kind || "agent")}>
                        {(Object.keys(nodeKindLabels) as WorkflowNodeKind[]).map((kind) => (
                          <option key={kind} value={kind}>{nodeKindLabels[kind]}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>LLM plugin</span>
                      <select
                        onChange={(event) => {
                          const option = llmProviderOptions.find((item) => item.value === event.target.value) || llmProviderOptions[0];
                          updateSelectedNodeFields({
                            llmIntegrationId: option.value,
                            model: option.modelLabel
                          });
                        }}
                        value={String(selectedNode.data.llmIntegrationId || "")}
                      >
                        {llmProviderOptions.map((option) => (
                          <option key={option.value || "default"} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                      {!llmIntegrations.length ? <small className="agentic-field-hint">Add AI provider integrations to select a specific LLM.</small> : null}
                    </label>
                    <label>
                      <span>Credential</span>
                      <select onChange={(event) => updateSelectedNode("credentialId", event.target.value)} value={String(selectedNode.data.credentialId || "")}>
                        <option value="">Use workflow/default auth</option>
                        {workflowCredentials.map((credential) => (
                          <option key={credential.id} value={credential.id}>{credential.name || credential.id}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Summary</span>
                      <textarea onChange={(event) => updateSelectedNode("summary", event.target.value)} value={String(selectedNode.data.summary || "")} />
                    </label>
                    <label>
                      <span>Prompt</span>
                      <textarea onChange={(event) => updateSelectedNode("prompt", event.target.value)} value={String(selectedNode.data.prompt || "")} />
                    </label>
                    {isAgentNodeSelected ? (
                      <div className="agentic-agent-contract-panel">
                        <div className="agentic-section-heading">
                          <div>
                            <strong>Agent contract</strong>
                            <span>Intent, grounded context, and output passed to the next connected node.</span>
                          </div>
                        </div>
                        <div className="agentic-runtime-grid">
                          <label className="agentic-api-agent-wide">
                            <span>Intent</span>
                            <textarea onChange={(event) => updateSelectedNode("intent", event.target.value)} value={String(selectedNode.data.intent || "")} />
                          </label>
                          <label className="agentic-api-agent-wide">
                            <span>Instructions</span>
                            <textarea onChange={(event) => updateSelectedNode("instructions", event.target.value)} value={String(selectedNode.data.instructions || "")} />
                          </label>
                          <label className="agentic-api-agent-wide">
                            <span>RAG context</span>
                            <input onChange={(event) => updateSelectedNode("knowledgeScope", event.target.value)} value={String(selectedNode.data.knowledgeScope || "requirements,test-cases,test-runs,knowledge")} />
                          </label>
                          <label>
                            <span>Top results</span>
                            <input max="20" min="1" onChange={(event) => updateSelectedNode("topK", event.target.value)} type="number" value={String(selectedNode.data.topK || "8")} />
                          </label>
                          <label>
                            <span>Context limit</span>
                            <input max="24000" min="2000" onChange={(event) => updateSelectedNode("maxContextChars", event.target.value)} type="number" value={String(selectedNode.data.maxContextChars || "14000")} />
                          </label>
                          <label>
                            <span>Output limit</span>
                            <input max="24000" min="1000" onChange={(event) => updateSelectedNode("maxOutputChars", event.target.value)} type="number" value={String(selectedNode.data.maxOutputChars || "12000")} />
                          </label>
                          <label>
                            <span>Completion tokens</span>
                            <input max="4096" min="128" onChange={(event) => updateSelectedNode("maxCompletionTokens", event.target.value)} type="number" value={String(selectedNode.data.maxCompletionTokens || "1200")} />
                          </label>
                          <label className="agentic-api-agent-wide">
                            <span>Output JSON schema</span>
                            <textarea onChange={(event) => updateSelectedNode("outputSchema", event.target.value)} value={String(selectedNode.data.outputSchema || "")} />
                          </label>
                          {selectedNodeKind === "webAgent" ? (
                            <>
                              <label>
                                <span>Source mode</span>
                                <select onChange={(event) => updateSelectedNode("webSourceMode", event.target.value)} value={String(selectedNode.data.webSourceMode || "supplied-evidence-only")}>
                                  <option value="supplied-evidence-only">Supplied evidence only</option>
                                  <option value="approved-tool-output">Approved tool output</option>
                                </select>
                              </label>
                              <label>
                                <span>Links input key</span>
                                <input onChange={(event) => updateSelectedNode("externalLinksKey", event.target.value)} value={String(selectedNode.data.externalLinksKey || "external_links")} />
                              </label>
                            </>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                    <label>
                      <span>Output key</span>
                      <input onChange={(event) => updateSelectedNode("outputKey", event.target.value)} value={String(selectedNode.data.outputKey || "")} />
                    </label>
                    <div className="agentic-data-routing-panel">
                      <div className="agentic-section-heading">
                        <div>
                          <strong>Data routing</strong>
                          <span>Inputs are passed from connected upstream outputs. Aggregators combine every incoming stream into one payload.</span>
                        </div>
                      </div>
                      <div className="agentic-routing-summary">
                        <article>
                          <span>Input sources</span>
                          {selectedIncomingNodes.length ? (
                            selectedIncomingNodes.map((node) => (
                              <strong key={node.id}>{String(node.data.label || node.id)} · {getNodeOutputKey(node)}</strong>
                            ))
                          ) : (
                            <strong>Workflow input</strong>
                          )}
                        </article>
                        <article>
                          <span>Output key</span>
                          <strong>{getNodeOutputKey(selectedNode)}</strong>
                        </article>
                        <article>
                          <span>Downstream</span>
                          {selectedOutgoingNodes.length ? (
                            selectedOutgoingNodes.map((node) => (
                              <strong key={node.id}>{String(node.data.label || node.id)}</strong>
                            ))
                          ) : (
                            <strong>No downstream node</strong>
                          )}
                        </article>
                      </div>
                      <div className="agentic-runtime-grid">
                        <label>
                          <span>Input mode</span>
                          <select onChange={(event) => updateSelectedNode("inputMode", event.target.value)} value={String(selectedNode.data.inputMode || (selectedIncomingNodes.length > 1 ? "allIncoming" : "previousOutput"))}>
                            {INPUT_MODE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>Merge mode</span>
                          <select onChange={(event) => updateSelectedNode("mergeMode", event.target.value)} value={String(selectedNode.data.mergeMode || (selectedNodeKind === "aggregator" ? "waitAllAppend" : ""))}>
                            <option value="">No merge</option>
                            {MERGE_MODE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>Aggregate key</span>
                          <input onChange={(event) => updateSelectedNode("aggregateKey", event.target.value)} placeholder="id" value={String(selectedNode.data.aggregateKey || "")} />
                        </label>
                        <label className="agentic-api-agent-wide">
                          <span>Input expression</span>
                          <textarea
                            onChange={(event) => updateSelectedNode("inputExpression", event.target.value)}
                            placeholder="{{stories}} + {{risk_score}}"
                            value={String(selectedNode.data.inputExpression || "")}
                          />
                        </label>
                      </div>
                    </div>
                    <div className="agentic-runtime-policy-panel">
                      <div className="agentic-section-heading">
                        <div>
                          <strong>Runtime guardrails</strong>
                          <span>Bound retries, looping, timeout, errors, and logs per node so one agent cannot stall the workflow.</span>
                        </div>
                      </div>
                      <div className="agentic-runtime-grid">
                        <label>
                          <span>Retries</span>
                          <input min="0" onChange={(event) => updateSelectedNode("retryCount", event.target.value)} type="number" value={String(selectedNode.data.retryCount || "0")} />
                        </label>
                        <label>
                          <span>Retry delay ms</span>
                          <input min="0" onChange={(event) => updateSelectedNode("retryDelayMs", event.target.value)} type="number" value={String(selectedNode.data.retryDelayMs || "1000")} />
                        </label>
                        <label>
                          <span>Timeout ms</span>
                          <input min="1000" onChange={(event) => updateSelectedNode("timeoutMs", event.target.value)} type="number" value={String(selectedNode.data.timeoutMs || "30000")} />
                        </label>
                        <label>
                          <span>On error</span>
                          <select onChange={(event) => updateSelectedNode("onError", event.target.value)} value={String(selectedNode.data.onError || "stop")}>
                            {ERROR_POLICY_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>Log level</span>
                          <select onChange={(event) => updateSelectedNode("logLevel", event.target.value)} value={String(selectedNode.data.logLevel || "standard")}>
                            {LOG_LEVEL_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>Redact secrets</span>
                          <select onChange={(event) => updateSelectedNode("redactSecrets", event.target.value)} value={String(selectedNode.data.redactSecrets ?? "true")}>
                            <option value="true">Yes</option>
                            <option value="false">No</option>
                          </select>
                        </label>
                        <label>
                          <span>Loop source key</span>
                          <input onChange={(event) => updateSelectedNode("loopSourceKey", event.target.value)} placeholder="items" value={String(selectedNode.data.loopSourceKey || "")} />
                        </label>
                        <label>
                          <span>Batch size</span>
                          <input min="1" onChange={(event) => updateSelectedNode("loopBatchSize", event.target.value)} type="number" value={String(selectedNode.data.loopBatchSize || "")} />
                        </label>
                        <label>
                          <span>Max iterations</span>
                          <input min="1" onChange={(event) => updateSelectedNode("loopMaxIterations", event.target.value)} type="number" value={String(selectedNode.data.loopMaxIterations || "")} />
                        </label>
                      </div>
                    </div>
                    {isToolNodeSelected ? (
                      <div className="agentic-tool-adapter-panel">
                        <div className="agentic-section-heading">
                          <div>
                            <strong>Tool adapter</strong>
                            <span>Use approved QAira adapters instead of arbitrary code execution.</span>
                          </div>
                        </div>
                        <div className="agentic-runtime-grid">
                          <label>
                            <span>Tool name</span>
                            <input onChange={(event) => updateSelectedNode("toolName", event.target.value)} value={String(selectedNode.data.toolName || "")} />
                          </label>
                          <label>
                            <span>Tool policy</span>
                            <select onChange={(event) => updateSelectedNode("toolPolicy", event.target.value)} value={String(selectedNode.data.toolPolicy || "approved-tools-only")}>
                              <option value="approved-tools-only">Approved tools only</option>
                              <option value="read-only">Read only</option>
                              <option value="approval-required">Approval required</option>
                            </select>
                          </label>
                          <label className="agentic-api-agent-wide">
                            <span>Knowledge scope</span>
                            <input onChange={(event) => updateSelectedNode("knowledgeScope", event.target.value)} placeholder="requirements,test-cases" value={String(selectedNode.data.knowledgeScope || "")} />
                          </label>
                          <label className="agentic-api-agent-wide">
                            <span>Repository scope</span>
                            <input onChange={(event) => updateSelectedNode("repositoryScope", event.target.value)} placeholder="object-repository,automation-code" value={String(selectedNode.data.repositoryScope || "")} />
                          </label>
                          <label className="agentic-api-agent-wide">
                            <span>TestOps action</span>
                            <input onChange={(event) => updateSelectedNode("testOpsAction", event.target.value)} placeholder="queue-batch,inspect-transaction" value={String(selectedNode.data.testOpsAction || "")} />
                          </label>
                        </div>
                      </div>
                    ) : null}
                    {isApiToolSelected ? (
                    <div className="agentic-api-agent-panel">
                      <div className="agentic-section-heading">
                        <div>
                          <strong>API tool</strong>
                          <span>Configure REST-style tools and test a sample response before the workflow run.</span>
                        </div>
                      </div>
                      <div className="agentic-api-agent-grid">
                        <label>
                          <span>Method</span>
                          <select onChange={(event) => updateSelectedNode("apiMethod", event.target.value)} value={String(selectedNode.data.apiMethod || "GET")}>
                            {API_METHODS.map((method) => (
                              <option key={method} value={method}>{method}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>Response</span>
                          <select onChange={(event) => updateSelectedNode("apiResponseStyle", event.target.value)} value={String(selectedNode.data.apiResponseStyle || "json")}>
                            {RESPONSE_STYLE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </label>
                        <label className="agentic-api-agent-wide">
                          <span>Endpoint URL</span>
                          <input onChange={(event) => updateSelectedNode("apiUrl", event.target.value)} placeholder="https://api.example.com/resource" value={String(selectedNode.data.apiUrl || "")} />
                        </label>
                        <label className="agentic-api-agent-wide">
                          <span>Auth expression</span>
                          <input onChange={(event) => updateSelectedNode("apiAuth", event.target.value)} placeholder="Bearer {{credential.secret}}" value={String(selectedNode.data.apiAuth || "")} />
                        </label>
                        <label className="agentic-api-agent-wide">
                          <span>Request body</span>
                          <textarea onChange={(event) => updateSelectedNode("apiBody", event.target.value)} placeholder='{"query": "{{input.release_scope}}"}' value={String(selectedNode.data.apiBody || "")} />
                        </label>
                      </div>
                      <button
                        className="ghost-button agentic-api-test-button"
                        disabled={testingApiNodeId === selectedNode.id}
                        onClick={testSelectedApiAgent}
                        type="button"
                      >
                        <PlayIcon size={15} />
                        {testingApiNodeId === selectedNode.id ? "Testing API..." : "Test API output"}
                      </button>
                      {selectedNode.data.apiTestOutput ? (
                        <pre className="agentic-api-test-output">{String(selectedNode.data.apiTestOutput)}</pre>
                      ) : null}
                    </div>
                    ) : null}
                  </>
                ) : (
                  <div className="empty-state compact">Select a workflow step.</div>
                )}
              </section>

              <section className="agentic-inspector-card">
                <h3>Run input</h3>
                <textarea className="agentic-run-input" onChange={(event) => setRunInput(event.target.value)} value={runInput} />
              </section>
            </aside>
          </div>
        </Panel>
      ) : null}

      {selectedRun ? (
        <Panel
          className="agentic-run-detail-panel"
          title="Workflow run snapshot"
          titleVariant="eyebrow"
          subtitle="The workflow snapshot below is the copy captured when this run was launched."
          actions={<button className="ghost-button" onClick={closeRun} type="button">Back</button>}
        >
          <div className="agentic-page-heading">
            <div>
              <span>Workflow run snapshot</span>
              <strong>{selectedRun.workflow_name}</strong>
              <p>Review the frozen workflow graph captured at execution time and inspect each step result.</p>
            </div>
            <div className="agentic-page-heading-metrics">
              <span><strong>{selectedRun.node_results.length}</strong> steps</span>
              <span><strong>{selectedRun.trigger_kind}</strong> trigger</span>
              <span><strong>{formatTimestamp(selectedRun.created_at)}</strong></span>
            </div>
          </div>
          <div className="agentic-run-page-grid">
            <section className="agentic-run-summary">
              <div className="agentic-run-summary-status">
                <span className="count-pill">{selectedRun.trigger_kind}</span>
                <StatusBadge value={selectedRun.status || "queued"} />
              </div>
              <strong>{selectedRun.workflow_name}</strong>
              <p>{formatTimestamp(selectedRun.started_at || selectedRun.created_at)} - {formatTimestamp(selectedRun.completed_at, "Still running")}</p>
              <div>
                <span>Run ID</span>
                <strong>{selectedRun.id}</strong>
              </div>
              <div>
                <span>Final output</span>
                <strong>{selectedRun.output_payload ? "Captured" : "Pending"}</strong>
              </div>
            </section>

            <section className="agentic-run-visual-panel">
              <div className="agentic-section-heading">
                <div>
                  <strong>Execution workflow</strong>
                  <span>Click any node to inspect the input and output recorded for that exact run.</span>
                </div>
              </div>
              <div className="agentic-flow-shell agentic-flow-shell--run">
                {selectedRunSnapshotNodes.length ? (
                  <ReactFlow
                    attributionPosition="bottom-right"
                    edges={selectedRunSnapshotEdges}
                    fitView
                    nodes={selectedRunSnapshotNodes}
                    nodeTypes={nodeTypes}
                    nodesConnectable={false}
                    nodesDraggable={false}
                    onNodeClick={(_, node) => setSelectedRunNodeId(node.id)}
                  >
                    <Controls />
                    <MiniMap pannable zoomable />
                    <Background gap={18} size={1} />
                  </ReactFlow>
                ) : (
                  <div className="empty-state compact">No workflow snapshot nodes were captured for this run.</div>
                )}
              </div>
            </section>

            <section className="agentic-run-node-panel">
              <div className="agentic-section-heading">
                <div>
                  <strong>Step input/output</strong>
                  <span>{selectedRunNodeResult ? getRunResultText(selectedRunNodeResult, "node_id", "Selected step") : "Select a workflow node"}</span>
                </div>
                {selectedRunNodeResult ? <span className="count-pill">{getRunResultText(selectedRunNodeResult, "status", "completed")}</span> : null}
              </div>
              {selectedRunNodeResult ? (
                <div className="agentic-run-io-grid">
                  <article className="agentic-json-panel">
                    <h3>Input</h3>
                    <pre>{prettyJson(selectedRunNodeResult.input)}</pre>
                  </article>
                  <article className="agentic-json-panel">
                    <h3>Output</h3>
                    <pre>{prettyJson(selectedRunNodeResult.output)}</pre>
                  </article>
                  <article className="agentic-json-panel agentic-run-log-panel">
                    <h3>Logs & retries</h3>
                    <pre>{prettyJson({
                      attempts: selectedRunNodeResult.attempts || 1,
                      retry_policy: selectedRunNodeResult.retry_policy || {},
                      error_policy: selectedRunNodeResult.error_policy || "stop",
                      data_policy: selectedRunNodeResult.data_policy || {},
                      incoming_edges: selectedRunNodeResult.incoming_edges || [],
                      logs: selectedRunNodeResult.logs || []
                    })}</pre>
                  </article>
                </div>
              ) : (
                <div className="empty-state compact">Select a node in the execution workflow to view its recorded input and output.</div>
              )}
            </section>
          </div>
        </Panel>
      ) : null}
      </div>

      <ToastMessage message={toastMessage} onDismiss={() => setToastMessage("")} tone={toastTone} />
    </div>
  );
}
