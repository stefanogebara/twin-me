/**
 * KnowledgeGraph -- Interactive force-directed graph on HTML5 Canvas
 *
 * Renders domain nodes (large) and platform nodes (small) with edges
 * representing cross-references and data flow. Uses d3-force for physics.
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type Simulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from 'd3-force';
import type { GraphData, GraphNode, GraphEdge, SelectedNode } from './graphTypes';
import { PHYSICS } from './graphConstants';

interface KnowledgeGraphProps {
  data: GraphData;
  selectedNode: SelectedNode;
  hoveredNode: string | null;
  onNodeClick: (node: GraphNode) => void;
  onNodeHover: (nodeId: string | null) => void;
}

type SimNode = GraphNode & SimulationNodeDatum;
type SimLink = SimulationLinkDatum<SimNode> & { type: string; strength: number };

const KnowledgeGraph: React.FC<KnowledgeGraphProps> = ({
  data,
  selectedNode,
  hoveredNode,
  onNodeClick,
  onNodeHover,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const linksRef = useRef<SimLink[]>([]);
  const animFrameRef = useRef<number>(0);
  const dragRef = useRef<{ node: SimNode; offsetX: number; offsetY: number } | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        setDimensions({ width, height });
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Initialize simulation when data changes
  useEffect(() => {
    if (data.nodes.length === 0) return;

    const { width, height } = dimensions;

    // Deep copy nodes/links for d3 mutation
    const simNodes: SimNode[] = data.nodes.map(n => ({ ...n }));
    const simLinks: SimLink[] = data.edges.map(e => ({
      source: String(e.source),
      target: String(e.target),
      type: e.type,
      strength: e.strength,
    }));

    nodesRef.current = simNodes;
    linksRef.current = simLinks;

    // Stop previous simulation
    if (simRef.current) simRef.current.stop();

    const sim = forceSimulation<SimNode>(simNodes)
      .force('charge', forceManyBody().strength(PHYSICS.chargeStrength))
      .force('center', forceCenter(width / 2, height / 2))
      .force('collision', forceCollide<SimNode>().radius(d => d.size + PHYSICS.collisionPadding))
      .force('link', forceLink<SimNode, SimLink>(simLinks)
        .id(d => d.id)
        .distance(d => d.type === 'crossref' ? PHYSICS.linkDistanceCrossref : PHYSICS.linkDistancePlatform)
        .strength(d => d.strength * 0.4)
      )
      .alphaDecay(PHYSICS.alphaDecay)
      .velocityDecay(PHYSICS.velocityDecay)
      .on('tick', () => {
        // Render handled by requestAnimationFrame loop
      });

    simRef.current = sim;

    return () => {
      sim.stop();
    };
  }, [data, dimensions]);

  // Connected node IDs for hover dimming
  const getConnectedIds = useCallback((nodeId: string): Set<string> => {
    const connected = new Set<string>([nodeId]);
    for (const link of linksRef.current) {
      const src = typeof link.source === 'object' ? link.source.id : link.source;
      const tgt = typeof link.target === 'object' ? link.target.id : link.target;
      if (src === nodeId) connected.add(tgt);
      if (tgt === nodeId) connected.add(src);
    }
    return connected;
  }, []);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let running = true;

    const render = () => {
      if (!running) return;

      const { width, height } = dimensions;
      const dpr = window.devicePixelRatio || 1;

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      ctx.clearRect(0, 0, width, height);

      const nodes = nodesRef.current;
      const links = linksRef.current;
      const connectedIds = hoveredNode ? getConnectedIds(hoveredNode) : null;

      // Draw edges
      for (const link of links) {
        const src = link.source as SimNode;
        const tgt = link.target as SimNode;
        if (!src.x || !src.y || !tgt.x || !tgt.y) continue;

        const isHighlighted = hoveredNode && (
          (typeof link.source === 'object' ? link.source.id : link.source) === hoveredNode ||
          (typeof link.target === 'object' ? link.target.id : link.target) === hoveredNode
        );

        ctx.beginPath();
        ctx.moveTo(src.x, src.y);
        ctx.lineTo(tgt.x, tgt.y);

        if (link.type === 'crossref') {
          ctx.setLineDash([4, 4]);
          ctx.strokeStyle = isHighlighted
            ? 'rgba(255,255,255,0.35)'
            : connectedIds ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.10)';
          ctx.lineWidth = isHighlighted ? 1.5 : 1;
        } else {
          ctx.setLineDash([]);
          ctx.strokeStyle = isHighlighted
            ? 'rgba(255,255,255,0.25)'
            : connectedIds ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.05)';
          ctx.lineWidth = isHighlighted ? 1 : 0.5;
        }

        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Draw nodes
      for (const node of nodes) {
        if (!node.x || !node.y) continue;

        const isSelected = selectedNode?.id === node.id;
        const isHovered = hoveredNode === node.id;
        const isDimmed = connectedIds && !connectedIds.has(node.id);

        const alpha = isDimmed ? 0.15 : 1.0;
        const scale = isHovered ? 1.18 : 1.0;
        const r = node.size * scale;

        // Glow for selected node
        if (isSelected) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, r + 8, 0, Math.PI * 2);
          ctx.fillStyle = hexToRgba(node.color, 0.12);
          ctx.fill();
        }

        // Node circle
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.fillStyle = hexToRgba(node.color, 0.18 * alpha);
        ctx.fill();
        ctx.strokeStyle = hexToRgba(node.color, (isHovered ? 0.8 : 0.5) * alpha);
        ctx.lineWidth = isSelected ? 2.5 : 1.5;
        ctx.stroke();

        // Inner bright dot for domain nodes
        if (node.type === 'domain') {
          ctx.beginPath();
          ctx.arc(node.x, node.y, 4, 0, Math.PI * 2);
          ctx.fillStyle = hexToRgba(node.color, 0.7 * alpha);
          ctx.fill();
        }

        // Label
        const fontSize = node.type === 'domain' ? 12 : 10;
        ctx.font = `${isHovered ? 600 : 500} ${fontSize}px Geist, Inter, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = isDimmed
          ? 'rgba(245,245,244,0.12)'
          : isHovered
            ? 'rgba(245,245,244,0.95)'
            : node.type === 'domain'
              ? 'rgba(245,245,244,0.75)'
              : 'rgba(168,162,158,0.6)';
        ctx.fillText(node.label, node.x, node.y + r + 6);
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      running = false;
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [dimensions, selectedNode, hoveredNode, getConnectedIds]);

  // Hit testing for mouse events
  const getNodeAtPoint = useCallback((x: number, y: number): SimNode | null => {
    for (const node of nodesRef.current) {
      if (!node.x || !node.y) continue;
      const dx = x - node.x;
      const dy = y - node.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= node.size + 4) return node;
    }
    return null;
  }, []);

  // Mouse handlers
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Handle drag
    if (dragRef.current) {
      const { node } = dragRef.current;
      node.fx = x;
      node.fy = y;
      simRef.current?.alpha(0.1).restart();
      return;
    }

    const hit = getNodeAtPoint(x, y);
    canvas.style.cursor = hit ? 'pointer' : 'default';
    onNodeHover(hit?.id ?? null);
  }, [getNodeAtPoint, onNodeHover]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const hit = getNodeAtPoint(x, y);

    if (hit) {
      dragRef.current = { node: hit, offsetX: 0, offsetY: 0 };
      hit.fx = hit.x;
      hit.fy = hit.y;
      canvas.style.cursor = 'grabbing';
    }
  }, [getNodeAtPoint]);

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (dragRef.current) {
      const { node } = dragRef.current;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // If barely moved, treat as click
      const dx = (node.fx ?? 0) - (node.x ?? 0);
      const dy = (node.fy ?? 0) - (node.y ?? 0);
      const moved = Math.sqrt(dx * dx + dy * dy);

      node.fx = null;
      node.fy = null;
      dragRef.current = null;
      canvas.style.cursor = 'default';

      if (moved < 3) {
        const hit = getNodeAtPoint(x, y);
        if (hit) onNodeClick(hit);
      }

      simRef.current?.alpha(0.05).restart();
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const hit = getNodeAtPoint(e.clientX - rect.left, e.clientY - rect.top);
    if (hit) onNodeClick(hit);
  }, [getNodeAtPoint, onNodeClick]);

  const handleMouseLeave = useCallback(() => {
    if (dragRef.current) {
      const { node } = dragRef.current;
      node.fx = null;
      node.fy = null;
      dragRef.current = null;
    }
    onNodeHover(null);
  }, [onNodeHover]);

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        role="img"
        aria-label={`Knowledge graph with ${data.nodes.filter(n => n.type === 'domain').length} domains and ${data.nodes.filter(n => n.type === 'platform').length} platforms`}
      />
    </div>
  );
};

// Utility: hex color to rgba
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export default KnowledgeGraph;
