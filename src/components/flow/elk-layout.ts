import ELK, { type ElkNode, type ElkExtendedEdge } from "elkjs/lib/elk.bundled.js";
import type { Node, Edge } from "@xyflow/react";

const elk = new ELK();

// Approximate render sizes per node type. ELK needs these to avoid overlap.
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
  nodeNodeSpacing?: number;
  layerSpacing?: number;
  edgeNodeSpacing?: number;
  /**
   * Optional grouping. Maps node.id → groupId (e.g. taskId).
   * Nodes sharing a groupId are placed inside a compound parent so each
   * task reads as its own pipeline. Nodes with no entry stay at root.
   */
  groups?: Record<string, string>;
}

const DEFAULTS: Required<Omit<ElkLayoutOptions, "groups">> = {
  direction: "RIGHT",
  nodeNodeSpacing: 80,
  layerSpacing: 140,
  edgeNodeSpacing: 32,
};

/**
 * Run ELK layered layout over a React Flow graph.
 *
 * When `groups` is provided, nodes are wrapped in compound parents per group.
 * Each group runs its own layered pass, then the root composes the groups
 * vertically — producing a clean per-task pipeline rather than a flat cluster.
 */
export async function layoutWithElk(
  nodes: Node[],
  edges: Edge[],
  options: ElkLayoutOptions = {},
): Promise<{ nodes: Node[]; edges: Edge[] }> {
  const opts = { ...DEFAULTS, ...options };
  const groups = options.groups ?? {};

  // Build child ElkNode for each React Flow node.
  const toElkChild = (n: Node): ElkNode => {
    const size = NODE_SIZE[n.type ?? "agent"] ?? { width: 200, height: 80 };
    return {
      id: n.id,
      width: size.width,
      height: size.height,
      layoutOptions: layerHintFor(n.type),
    };
  };

  // Partition nodes into groups vs root-level.
  const grouped = new Map<string, ElkNode[]>();
  const rootChildren: ElkNode[] = [];
  for (const n of nodes) {
    const g = groups[n.id];
    const child = toElkChild(n);
    if (g) {
      const arr = grouped.get(g) ?? [];
      arr.push(child);
      grouped.set(g, arr);
    } else {
      rootChildren.push(child);
    }
  }

  // For each group, create a compound ElkNode with its own layered layout.
  const groupNodes: ElkNode[] = [];
  for (const [gid, children] of grouped) {
    groupNodes.push({
      id: `group-${gid}`,
      children,
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": opts.direction,
        "elk.layered.spacing.nodeNodeBetweenLayers": String(opts.layerSpacing),
        "elk.spacing.nodeNode": String(Math.max(40, opts.nodeNodeSpacing - 20)),
        "elk.padding": "[top=16,left=16,bottom=16,right=16]",
        "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
        "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
        "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      },
    });
  }

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
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.layered.spacing.nodeNodeBetweenLayers": String(opts.layerSpacing),
      "elk.spacing.nodeNode": String(opts.nodeNodeSpacing),
      "elk.layered.spacing.edgeNodeBetweenLayers": String(opts.edgeNodeSpacing),
      "elk.spacing.edgeNode": String(opts.edgeNodeSpacing),
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
      "elk.layered.cycleBreaking.strategy": "GREEDY",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.layered.mergeEdges": "false",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.padding": "[top=24,left=24,bottom=24,right=24]",
    },
    children: [...rootChildren, ...groupNodes],
    edges: elkEdges,
  };

  const result = await elk.layout(graph);

  // Flatten: compound children inherit parent offset.
  const positioned = new Map<string, { x: number; y: number }>();
  const walk = (n: ElkNode, ox: number, oy: number) => {
    const x = (n.x ?? 0) + ox;
    const y = (n.y ?? 0) + oy;
    if (!n.id.startsWith("group-") && n.id !== "root") {
      positioned.set(n.id, { x, y });
    }
    (n.children ?? []).forEach((c) => walk(c, x, y));
  };
  (result.children ?? []).forEach((c) => walk(c, 0, 0));

  const laidOut: Node[] = nodes.map((n) => {
    const p = positioned.get(n.id);
    return p ? { ...n, position: p } : n;
  });

  return { nodes: laidOut, edges };
}

// Pin node types to logical layers so columns stay grouped left → right.
function layerHintFor(type: string | undefined): Record<string, string> {
  switch (type) {
    case "input":    return { "elk.layered.layering.layerConstraint": "FIRST" };
    case "infra":    return { "elk.layered.layering.layerConstraint": "LAST" };
    default:         return {};
  }
}
