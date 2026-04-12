/**
 * KnowledgeGraph -- Interactive force-directed graph on HTML5 Canvas
 *
 * Renders domain nodes (large) and platform nodes (small) with edges
 * representing cross-references and data flow. Uses d3-force for physics.
 *
 * Performance: canvas dimensions set only on resize (not every frame),
 * rAF loop stops when simulation settles, hover state uses refs not React state.
 */

import React, { useRef, useEffect, useCallback } from 'react';
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
import type { GraphData, GraphNode, SelectedNode } from './graphTypes';
import { PHYSICS } from './graphConstants';

interface KnowledgeGraphProps {
  data: GraphData;
  selectedNode: SelectedNode;
  onNodeClick: (node: GraphNode) => void;
}

type SimNode = GraphNode & SimulationNodeDatum;
type SimLink = SimulationLinkDatum<SimNode> & { type: string; strength: number };

const KnowledgeGraph: React.FC<KnowledgeGraphProps> = ({
  data,
  selectedNode,
  onNodeClick,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const linksRef = useRef<SimLink[]>([]);
  const animFrameRef = useRef<number>(0);
  const dragRef = useRef<{ node: SimNode; startX: number; startY: number } | null>(null);
  const sizeRef = useRef({ width: 800, height: 600, dpr: 1 });
  const needsRenderRef = useRef(true);
  // All interactive state lives in refs -- NEVER in React state.
  // Parent re-renders on hover were causing the glitch.
  const selectedIdRef = useRef<string | null>(null);
  const hoveredIdRef = useRef<string | null>(null);
  const entranceRef = useRef(0); // 0 to 1 over ~1 second for entrance animation

  // Sync selected prop to ref (only selected comes from parent -- hover is fully internal)
  useEffect(() => { selectedIdRef.current = selectedNode?.id ?? null; needsRenderRef.current = true; }, [selectedNode]);

  // ── Canvas sizing (only on mount + resize, NOT every frame) ──────────
  const updateCanvasSize = useCallback(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const { width, height } = container.getBoundingClientRect();
    if (width === 0 || height === 0) return;

    const dpr = window.devicePixelRatio || 1;
    sizeRef.current = { width, height, dpr };

    // Set physical pixel size (only changes on resize)
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    needsRenderRef.current = true;
  }, []);

  useEffect(() => {
    updateCanvasSize();
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      updateCanvasSize();
      // Re-center simulation on resize
      const { width, height } = sizeRef.current;
      simRef.current?.force('center', forceCenter(width / 2, height / 2));
      simRef.current?.alpha(0.1).restart();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [updateCanvasSize]);

  // ── Simulation setup ─────────────────────────────────────────────────
  useEffect(() => {
    if (data.nodes.length === 0) return;
    const { width, height } = sizeRef.current;

    const simNodes: SimNode[] = data.nodes.map(n => ({ ...n }));
    const simLinks: SimLink[] = data.edges.map(e => ({
      source: String(e.source),
      target: String(e.target),
      type: e.type,
      strength: e.strength,
    }));

    nodesRef.current = simNodes;
    linksRef.current = simLinks;

    if (simRef.current) simRef.current.stop();

    const sim = forceSimulation<SimNode>(simNodes)
      .force('charge', forceManyBody().strength(d => (d as SimNode).type === 'entity' ? PHYSICS.entityCharge : PHYSICS.chargeStrength))
      .force('center', forceCenter(width / 2, height / 2))
      .force('collision', forceCollide<SimNode>().radius(d => d.size + PHYSICS.collisionPadding))
      .force('link', forceLink<SimNode, SimLink>(simLinks)
        .id(d => d.id)
        .distance(d => d.type === 'entity' ? PHYSICS.linkDistanceEntity : d.type === 'crossref' ? PHYSICS.linkDistanceCrossref : PHYSICS.linkDistancePlatform)
        .strength(d => d.strength * (d.type === 'entity' ? 0.6 : 0.4))
      )
      .alphaDecay(PHYSICS.alphaDecay)
      .velocityDecay(PHYSICS.velocityDecay);

    simRef.current = sim;
    // Entrance animation (single tick handler -- do NOT register a second one)
    entranceRef.current = 0;
    const entranceStart = Date.now();
    const entranceDuration = 800;
    sim.on('tick', () => {
      const elapsed = Date.now() - entranceStart;
      entranceRef.current = Math.min(elapsed / entranceDuration, 1);
      needsRenderRef.current = true;
    });
    return () => { sim.stop(); };
  }, [data]);

  // ── Connected node lookup (pure function, no memoization needed) ─────
  const getConnectedIds = useCallback((nodeId: string): Set<string> => {
    const connected = new Set<string>([nodeId]);
    for (const link of linksRef.current) {
      const src = typeof link.source === 'object' ? link.source.id : String(link.source);
      const tgt = typeof link.target === 'object' ? link.target.id : String(link.target);
      if (src === nodeId) connected.add(tgt);
      if (tgt === nodeId) connected.add(src);
    }
    return connected;
  }, []);

  // ── Render loop (runs only when dirty, stops when idle) ──────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let alive = true;

    const paint = () => {
      if (!alive) return;

      // Only repaint when something changed
      if (needsRenderRef.current) {
        needsRenderRef.current = false;
        drawFrame(ctx);
      }

      animFrameRef.current = requestAnimationFrame(paint);
    };

    animFrameRef.current = requestAnimationFrame(paint);
    return () => { alive = false; cancelAnimationFrame(animFrameRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]); // only restart loop when data changes, NOT on hover/select

  // ── Draw one frame ───────────────────────────────────────────────────
  const drawFrame = useCallback((ctx: CanvasRenderingContext2D) => {
    const { width, height, dpr } = sizeRef.current;
    const entrance = entranceRef.current; // 0-1 entrance animation progress
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const nodes = nodesRef.current;
    const links = linksRef.current;
    const hovered = hoveredIdRef.current;
    const selected = selectedIdRef.current;
    const connectedIds = hovered ? getConnectedIds(hovered) : null;
    ctx.globalAlpha = entrance; // entrance fade-in

    // ── Edges ──
    for (const link of links) {
      const src = link.source as SimNode;
      const tgt = link.target as SimNode;
      if (src.x == null || src.y == null || tgt.x == null || tgt.y == null) continue;

      const srcId = typeof link.source === 'object' ? link.source.id : String(link.source);
      const tgtId = typeof link.target === 'object' ? link.target.id : String(link.target);
      const isHighlighted = hovered && (srcId === hovered || tgtId === hovered);

      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      ctx.lineTo(tgt.x, tgt.y);

      if (link.type === 'crossref') {
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = isHighlighted
          ? 'rgba(255,255,255,0.35)'
          : connectedIds ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.10)';
        ctx.lineWidth = isHighlighted ? 1.5 : 1;
      } else if (link.type === 'entity') {
        ctx.setLineDash([2, 3]);
        ctx.strokeStyle = isHighlighted
          ? 'rgba(255,255,255,0.20)'
          : connectedIds ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.06)';
        ctx.lineWidth = isHighlighted ? 0.8 : 0.4;
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

    // ── Nodes ──
    for (const node of nodes) {
      if (node.x == null || node.y == null) continue;

      const isSelected = selected === node.id;
      const isHovered = hovered === node.id;
      const isDimmed = connectedIds != null && !connectedIds.has(node.id);

      const alpha = isDimmed ? 0.15 : 1.0;
      const scale = isHovered ? 1.18 : 1.0;
      const r = node.size * scale;

      // Glow ring for selected node
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, r + 8, 0, Math.PI * 2);
        ctx.fillStyle = hexToRgba(node.color, 0.12);
        ctx.fill();
      }

      // Node circle -- entities get a stronger fill to make category colors visible
      const fillOpacity = node.type === 'entity' ? 0.35 : 0.18;
      const strokeOpacity = node.type === 'entity' ? (isHovered ? 0.9 : 0.65) : (isHovered ? 0.8 : 0.5);
      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
      ctx.fillStyle = hexToRgba(node.color, fillOpacity * alpha);
      ctx.fill();
      ctx.strokeStyle = hexToRgba(node.color, strokeOpacity * alpha);
      ctx.lineWidth = isSelected ? 2.5 : node.type === 'entity' ? 1 : 1.5;
      ctx.stroke();

      // Inner bright dot for domain nodes
      if (node.type === 'domain') {
        ctx.beginPath();
        ctx.arc(node.x, node.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = hexToRgba(node.color, 0.7 * alpha);
        ctx.fill();
      }

      // Label: entity labels shown for bridge entities (multi-domain) or on hover/select
      const isBridgeEntity = node.type === 'entity' && node.size > 10;
      const showLabel = node.type !== 'entity' || isBridgeEntity || isHovered || isSelected;
      if (showLabel) {
        const fontSize = node.type === 'domain' ? 12 : node.type === 'entity' ? 9 : 10;
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
        ctx.fillText(node.label, node.x, node.y + r + 5);
      }
    }
    ctx.globalAlpha = 1; // reset after entrance animation
  }, [getConnectedIds]);

  // ── Hit testing ──────────────────────────────────────────────────────
  const getNodeAtPoint = useCallback((x: number, y: number): SimNode | null => {
    for (const node of nodesRef.current) {
      if (node.x == null || node.y == null) continue;
      const dx = x - node.x;
      const dy = y - node.y;
      if (dx * dx + dy * dy <= (node.size + 6) * (node.size + 6)) return node;
    }
    return null;
  }, []);

  // ── Mouse handlers (hover is ref-only, NEVER triggers parent re-render) ──
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (dragRef.current) {
      dragRef.current.node.fx = x;
      dragRef.current.node.fy = y;
      simRef.current?.alpha(0.1).restart();
      return;
    }

    const hit = getNodeAtPoint(x, y);
    const newId = hit?.id ?? null;

    // Update hover via ref only -- no setState, no parent re-render
    if (newId !== hoveredIdRef.current) {
      hoveredIdRef.current = newId;
      canvas.style.cursor = hit ? 'pointer' : 'default';
      needsRenderRef.current = true; // mark dirty for next paint
    }
  }, [getNodeAtPoint]);

  const getCanvasPoint = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0]?.clientX ?? e.changedTouches[0]?.clientX ?? 0 : e.clientX;
    const clientY = 'touches' in e ? e.touches[0]?.clientY ?? e.changedTouches[0]?.clientY ?? 0 : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  const handlePointerDown = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasPoint(e);
    const hit = getNodeAtPoint(x, y);
    if (hit) {
      dragRef.current = { node: hit, startX: x, startY: y };
      hit.fx = hit.x;
      hit.fy = hit.y;
      if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
    }
  }, [getCanvasPoint, getNodeAtPoint]);

  const handlePointerUp = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasPoint(e);

    if (dragRef.current) {
      const { node, startX, startY } = dragRef.current;
      const dragDist = Math.hypot(x - startX, y - startY);
      node.fx = null;
      node.fy = null;
      dragRef.current = null;
      if (canvasRef.current) canvasRef.current.style.cursor = 'default';
      simRef.current?.alpha(0.05).restart();

      // Only treat as click if drag distance was small
      if (dragDist < 8) {
        const hit = getNodeAtPoint(x, y);
        if (hit) onNodeClick(hit);
      }
      return;
    }

    const hit = getNodeAtPoint(x, y);
    if (hit) onNodeClick(hit);
  }, [getCanvasPoint, getNodeAtPoint, onNodeClick]);

  const handleMouseLeave = useCallback(() => {
    if (dragRef.current) {
      dragRef.current.node.fx = null;
      dragRef.current.node.fy = null;
      dragRef.current = null;
    }
    if (hoveredIdRef.current !== null) {
      hoveredIdRef.current = null;
      needsRenderRef.current = true;
    }
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        style={{ touchAction: 'none' }}
        onMouseMove={handleMouseMove}
        onMouseDown={handlePointerDown}
        onMouseUp={handlePointerUp}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handlePointerDown}
        onTouchEnd={handlePointerUp}
        role="img"
        aria-label={`Knowledge graph with ${data.nodes.filter(n => n.type === 'domain').length} domains and ${data.nodes.filter(n => n.type === 'platform').length} platforms`}
      />
    </div>
  );
};

function hexToRgba(hex: string, alpha: number): string {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (h.length !== 6) return `rgba(128,128,128,${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export default KnowledgeGraph;
