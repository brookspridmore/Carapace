import ELK, { type ElkNode, type ElkExtendedEdge } from "elkjs/lib/elk.bundled.js";
import type { Node, Edge } from "@xyflow/react";

const elk = new ELK();

// Approximate render sizes per node type. ELK needs these to avoid overlap.
// Keep these in rough sync with the actual rendered widths in nodes.tsx.
export const NODE_SIZE: Record<string, { width: number; height: number }> = {
  agent:    { width: 220, height: 96 },
  task:     { width: 240, height: 84 },
  tool:     { width: 180, height: 64 },
  memory:   { width: 220, height: 84 },
  output:   { width: 200, height: 64 },
  approval: { width: 200, height: 64 },
  input:    { width: 160, height: 56 },
  infra:    { width: 200, height: 64 },
};

export type ElkDirection = "RIGHT" | "DOWN";

export interface ElkLayoutOptions {
  direction?: ElkDirection;
  nodeNodeSpacing?: number;       // min gap between sibling nodes
  layerSpacing?: number;           // gap between layers (columns when RIGHT)
  edgeNodeSpacing?: number;
}

const DEFAULTS: Required<ElkLayoutOptions> = {
  direction: "RIGHT",
  nodeNodeSpacing: 60,
  layerSpacing: 140,
  edgeNodeSpacing: 32,
};

/**
 * Run ELK layered layout over a React Flow graph.
 * Returns a new array of nodes with `position` set by ELK.
 * Edges are returned untouched (React Flow handles routing).
 */
export async function layoutWithElk(
  nodes: Node[],
  edges: Edge[],
  options: ElkLayoutOptions = {},
): Promise<{ nodes: Node[]; edges: Edge[] }> {
  const opts = { ...DEFAULTS, ...options };

  const elkNodes: ElkNode[] = nodes.map((n) => {
    const size = NODE_SIZE[n.type ?? "agent"] ?? { width: 200, height: 80 };
    return {
      id: n.id,
      width: size.width,
      height: size.height,
      // Hint ELK about node "kind" via layer constraints for stable column groups.
      layoutOptions: layerHintFor(n.type),
    };
  });

  const elkEdges: ElkExtendedEdge[] = edges.map((e) => ({
    id: e.id,
    sources: [e.source],
    targets: [e.target],
  }));

  const graph: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": opts.direction,
      "elk.layered.spacing.nodeNodeBetweenLayers": String(opts.layerSpacing),
      "elk.spacing.nodeNode": String(opts.nodeNodeSpacing),
      "elk.layered.spacing.edgeNodeBetweenLayers": String(opts.edgeNodeSpacing),
      "elk.spacing.edgeNode": String(opts.edgeNodeSpacing),
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
      "elk.layered.cycleBreaking.strategy": "GREEDY",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.layered.mergeEdges": "false",
      // Slight padding so MiniMap and labels have breathing room.
      "elk.padding": "[top=24,left=24,bottom=24,right=24]",
    },
    children: elkNodes,
    edges: elkEdges,
  };

  const result = await elk.layout(graph);
  const positioned = new Map<string, { x: number; y: number }>();
  (result.children ?? []).forEach((c) => {
    positioned.set(c.id, { x: c.x ?? 0, y: c.y ?? 0 });
  });

  const laidOut: Node[] = nodes.map((n) => {
    const p = positioned.get(n.id);
    return p ? { ...n, position: p } : n;
  });

  return { nodes: laidOut, edges };
}

// Pin node types to logical layers so columns stay grouped left → right.
// This gives a Chief → Task → Subagent → Fan-out reading order even when
// ELK is free to permute.
function layerHintFor(type: string | undefined): Record<string, string> {
  switch (type) {
    case "input":    return { "elk.layered.layering.layerConstraint": "FIRST" };
    case "infra":    return { "elk.layered.layering.layerConstraint": "LAST" };
    default:         return {};
  }
}
