import { useCallback, useEffect, useMemo } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  MarkerType,
  Handle,
  Position,
  type Connection,
  type Edge,
  type Node,
  type NodeProps
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { TestStep } from '../types';

type VisualTestBuilderProps = {
  testSteps: TestStep[];
};

type StepNodeData = {
  action: TestStep["action"];
  expected_result: TestStep["expected_result"];
  step_order: TestStep["step_order"];
  step_type?: TestStep["step_type"];
};

type StepNodeModel = Node<StepNodeData, "step">;

const StepNode = ({ data }: NodeProps<StepNodeModel>) => {
  return (
    <div className="visual-builder-node">
      <Handle type="target" position={Position.Top} />
      <div className="visual-builder-node-header">
        <span className="visual-builder-node-badge">Step {data.step_order}</span>
        <span className="visual-builder-node-type">{data.step_type || 'web'}</span>
      </div>
      <div className="visual-builder-node-content">
        <strong>Action:</strong>
        <p>{data.action || 'No action defined'}</p>
        <strong>Expected:</strong>
        <p>{data.expected_result || 'No expected result defined'}</p>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};

const nodeTypes = {
  step: StepNode,
};

export function VisualTestBuilder({ testSteps }: VisualTestBuilderProps) {
  const stepNodes = useMemo<StepNodeModel[]>(() => {
    return testSteps.map((step, index) => ({
      id: step.id || `step-${index}`,
      type: 'step',
      position: { x: 250, y: index * 180 + 50 },
      data: {
        action: step.action,
        expected_result: step.expected_result,
        step_order: step.step_order,
        step_type: step.step_type
      }
    }));
  }, [testSteps]);

  const stepEdges = useMemo<Edge[]>(() => {
    const edges: Edge[] = [];
    for (let i = 0; i < testSteps.length - 1; i++) {
      const current = testSteps[i];
      const next = testSteps[i + 1];
      edges.push({
        id: `e${current.id}-${next.id}`,
        source: current.id || `step-${i}`,
        target: next.id || `step-${i + 1}`,
        animated: true,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 20,
          height: 20,
          color: '#3b82f6',
        },
        style: { stroke: '#3b82f6', strokeWidth: 2 }
      });
    }
    return edges;
  }, [testSteps]);

  const [nodes, setNodes, onNodesChange] = useNodesState<StepNodeModel>(stepNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(stepEdges);

  useEffect(() => {
    setNodes(stepNodes);
  }, [setNodes, stepNodes]);

  useEffect(() => {
    setEdges(stepEdges);
  }, [setEdges, stepEdges]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  );

  return (
    <div className="visual-test-builder-container" style={{ width: '100%', height: '500px' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        attributionPosition="bottom-right"
      >
        <Controls />
        <MiniMap />
        <Background gap={12} size={1} />
      </ReactFlow>
    </div>
  );
}
