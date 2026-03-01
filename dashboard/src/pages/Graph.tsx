import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import * as d3 from 'd3';
import { X, Loader2 } from 'lucide-react';
import { useGraph } from '@/lib/queries';
import type { EndpointStatus } from '@/lib/types';
import { Select } from '@/components/Select';

const STATUS_COLOR: Record<string, string> = {
  normal:          '#4EAA57',
  cacheable:       '#7EA87E',
  batchable:       '#5CBF65',
  redundant:       '#B8A038',
  n_plus_one_risk: '#C87F3A',
  rate_limit_risk: '#C45A4A',
};

const STATUS_LABEL: Record<string, string> = {
  normal:          'normal',
  cacheable:       'cacheable',
  batchable:       'batchable',
  redundant:       'redundant',
  n_plus_one_risk: 'n+1 risk',
  rate_limit_risk: 'rate limit',
};

interface SimNode extends d3.SimulationNodeDatum {
  id: string;
  type: 'file' | 'api';
  label: string;
  status?: EndpointStatus;
  provider?: string;
  monthlyCost?: number;
  method?: string;
  callsPerDay?: number;
}

interface SimLink {
  source: string | SimNode;
  target: string | SimNode;
}

interface SelectedInfo {
  type: 'file' | 'api';
  id: string;
  label: string;
  status?: EndpointStatus;
  provider?: string;
  monthlyCost?: number;
  method?: string;
  callsPerDay?: number;
  edgeCount?: number;
}

function nodeRadius(n: SimNode, maxCalls: number): number {
  if (n.type === 'file') return 0;
  return 18 + ((n.callsPerDay ?? 0) / maxCalls) * 26;
}

export default function Graph() {
  const { projectId } = useParams<{ projectId: string }>();
  const [clusterBy, setClusterBy] = useState('provider');
  const { data, isLoading } = useGraph(projectId, clusterBy);
  const [selected, setSelected] = useState<SelectedInfo | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const apiNodes = data?.data?.nodes ?? [];
  const rawEdges = data?.data?.edges ?? [];

  useEffect(() => {
    const svgEl = svgRef.current;
    const containerEl = containerRef.current;
    if (!svgEl || !containerEl || apiNodes.length === 0) return;

    const width = containerEl.clientWidth;
    const height = containerEl.clientHeight;
    const maxCalls = Math.max(...apiNodes.map(n => n.callsPerDay), 1);

    // ── Build node data ──────────────────────────────────────────────────────
    // Invisible file nodes act as anchor points for the link force
    const fileIds = [...new Set(rawEdges.map(e => e.source))];
    const fileNodes: SimNode[] = fileIds.map(id => ({
      id,
      type: 'file' as const,
      label: id,
    }));

    const apiSimNodes: SimNode[] = apiNodes.map(n => {
      const parts = n.label.split(' ');
      return {
        id: n.id,
        type: 'api' as const,
        label: parts.slice(1).join(' ') || n.label,
        status: n.status,
        provider: n.provider,
        monthlyCost: n.monthlyCost,
        method: parts[0] ?? '',
        callsPerDay: n.callsPerDay,
      };
    });

    const simNodes: SimNode[] = [...fileNodes, ...apiSimNodes];

    // ── Build link data ──────────────────────────────────────────────────────
    const apiIds = new Set(apiSimNodes.map(n => n.id));
    const simLinks: SimLink[] = rawEdges
      .filter(e => apiIds.has(e.target))
      .map(e => ({ source: e.source, target: e.target }));

    // ── SVG setup ───────────────────────────────────────────────────────────
    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();
    svg.attr('width', width).attr('height', height);

    const defs = svg.append('defs');

    // Dot grid pattern
    const pat = defs.append('pattern')
      .attr('id', 'g-dots').attr('width', 28).attr('height', 28)
      .attr('patternUnits', 'userSpaceOnUse');
    pat.append('circle').attr('cx', 1).attr('cy', 1).attr('r', 0.75)
      .attr('fill', 'rgba(255,255,255,0.06)');

    // Radial centre glow
    const rg = defs.append('radialGradient').attr('id', 'g-glow')
      .attr('cx', '50%').attr('cy', '50%').attr('r', '50%');
    rg.append('stop').attr('offset', '0%').attr('stop-color', '#4EAA57').attr('stop-opacity', 0.05);
    rg.append('stop').attr('offset', '100%').attr('stop-color', '#4EAA57').attr('stop-opacity', 0);

    // Backgrounds
    svg.append('rect').attr('width', '100%').attr('height', '100%').attr('fill', 'url(#g-dots)');
    svg.append('rect').attr('width', '100%').attr('height', '100%').attr('fill', 'url(#g-glow)');

    // ── Zoom / pan ──────────────────────────────────────────────────────────
    const g = svg.append('g');
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 6])
      .on('zoom', ev => g.attr('transform', ev.transform));
    svg.call(zoom);

    // ── Force simulation ────────────────────────────────────────────────────
    const simulation = d3.forceSimulation<SimNode>(simNodes)
      .velocityDecay(0.5)
      .alphaDecay(0.02)
      .force('link', d3.forceLink<SimNode, SimLink>(simLinks).id(d => d.id).distance(117).strength(0.4))
      .force('charge', d3.forceManyBody<SimNode>().strength(-180))
      .force('x', d3.forceX<SimNode>(width / 2).strength(0.08))
      .force('y', d3.forceY<SimNode>(height / 2).strength(0.08))
      .force('collide', d3.forceCollide<SimNode>(d => nodeRadius(d, maxCalls) + 20));

    // ── Edges (drawn before nodes so nodes sit on top) ───────────────────────
    const linkSel = g.append('g')
      .selectAll<SVGLineElement, SimLink>('line')
      .data(simLinks)
      .join('line')
      .attr('stroke', 'rgba(255,255,255,0.07)')
      .attr('stroke-width', 1);

    // ── Node groups ─────────────────────────────────────────────────────────
    const nodeSel = g.append('g')
      .selectAll<SVGGElement, SimNode>('g')
      .data(simNodes)
      .join('g')
      .style('cursor', d => d.type === 'api' ? 'grab' : 'default');

    // API nodes ─ outer glow ring
    nodeSel.filter(d => d.type === 'api')
      .append('circle')
      .attr('r', d => nodeRadius(d, maxCalls) + 5)
      .attr('fill', 'none')
      .attr('stroke', d => `${STATUS_COLOR[d.status ?? 'normal']}18`)
      .attr('stroke-width', 8);

    // API nodes ─ main circle
    nodeSel.filter(d => d.type === 'api')
      .append('circle')
      .attr('r', d => nodeRadius(d, maxCalls))
      .attr('fill', d => `${STATUS_COLOR[d.status ?? 'normal']}16`)
      .attr('stroke', d => `${STATUS_COLOR[d.status ?? 'normal']}85`)
      .attr('stroke-width', 1.5);

    // API nodes ─ method label
    nodeSel.filter(d => d.type === 'api')
      .append('text')
      .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
      .attr('fill', d => STATUS_COLOR[d.status ?? 'normal'])
      .attr('font-size', '10px').attr('font-weight', '700')
      .attr('font-family', "'JetBrains Mono', monospace")
      .text(d => (d.method ?? '').slice(0, 3));

    // API nodes ─ URL label below circle
    nodeSel.filter(d => d.type === 'api')
      .append('text')
      .attr('text-anchor', 'middle').attr('dominant-baseline', 'hanging')
      .attr('y', d => nodeRadius(d, maxCalls) + 9)
      .attr('fill', 'rgba(255,255,255,0.7)')
      .attr('font-size', '11px')
      .attr('font-family', "'JetBrains Mono', monospace")
      .text(d => {
        const label = d.label ?? '';
        return label.length > 22 ? '…' + label.slice(-21) : label;
      });

    // API nodes ─ provider label below URL
    nodeSel.filter(d => d.type === 'api')
      .append('text')
      .attr('text-anchor', 'middle').attr('dominant-baseline', 'hanging')
      .attr('y', d => nodeRadius(d, maxCalls) + 25)
      .attr('fill', 'rgba(255,255,255,0.25)')
      .attr('font-size', '10px')
      .attr('font-family', "'JetBrains Mono', monospace")
      .text(d => d.provider ?? '');

    // ── Selection helpers ───────────────────────────────────────────────────
    const resetHighlight = () => {
      nodeSel.attr('opacity', 1);
      linkSel.attr('stroke', 'rgba(255,255,255,0.07)');
      setSelected(null);
    };

    svg.on('click', resetHighlight);

    nodeSel.on('click', (event, d) => {
      if (d.type !== 'api') return;
      event.stopPropagation();
      nodeSel.attr('opacity', (n: SimNode) => n.id === d.id ? 1 : 0.25);
      linkSel.attr('stroke', (l: SimLink) => {
        const t = l.target as SimNode;
        return t.id === d.id ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.03)';
      });
      const edgeCount = rawEdges.filter(e => e.target === d.id).length;
      setSelected({ ...d, edgeCount });
    });

    // ── Drag ────────────────────────────────────────────────────────────────
    const drag = d3.drag<SVGGElement, SimNode>()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x; d.fy = d.y;
      })
      .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null; d.fy = null;
      });

    nodeSel.filter(d => d.type === 'api').call(drag);

    // ── Tick ────────────────────────────────────────────────────────────────
    simulation.on('tick', () => {
      linkSel
        .attr('x1', d => (d.source as SimNode).x ?? 0)
        .attr('y1', d => (d.source as SimNode).y ?? 0)
        .attr('x2', d => (d.target as SimNode).x ?? 0)
        .attr('y2', d => (d.target as SimNode).y ?? 0);
      nodeSel.attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    return () => { simulation.stop(); };
  }, [apiNodes, rawEdges]);

  // ── Render ──────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={22} className="animate-spin" style={{ color: '#4EAA57' }} />
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto scrollbar-hide">
    <div className="min-h-full flex flex-col max-w-[1240px] mx-auto px-8">

      {/* Header */}
      <div className="pt-14 pb-6 flex items-center justify-between">
        <div>
          <h1 className="text-[26px] text-white" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600 }}>
            Dependency Graph
          </h1>
          <p className="text-[14px] mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
            {apiNodes.length} endpoints · drag nodes · scroll to zoom · click to inspect
          </p>
        </div>

        <Select
          value={clusterBy}
          onChange={setClusterBy}
          options={[
            { value: 'provider', label: 'Group by Provider' },
            { value: 'file',     label: 'Group by File' },
            { value: 'cost',     label: 'Group by Cost' },
          ]}
        />
      </div>

      {/* Canvas — centered in remaining space */}
      <div className="flex-1 flex flex-col justify-center pb-12">
      <div
        ref={containerRef}
        className="relative overflow-hidden bg-black/40 backdrop-blur-sm border border-white/[0.08] rounded-2xl"
        style={{ height: '640px' }}
      >
        {apiNodes.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p
              className="text-[14px]"
              style={{ color: 'rgba(255,255,255,0.2)', fontFamily: "'JetBrains Mono', monospace" }}
            >
              No graph data — run a scan first.
            </p>
          </div>
        ) : (
          <svg ref={svgRef} className="w-full h-full block" />
        )}

        {/* Info card — API endpoints only */}
        {selected?.type === 'api' && (
          <div
            className="absolute top-5 right-5 w-80 bg-black/60 backdrop-blur-xl border border-white/[0.1] rounded-xl p-5 z-20 shadow-xl"
          >
            <div className="flex items-center justify-between mb-4">
              <span
                className="text-[11px] uppercase tracking-widest"
                style={{ color: 'rgba(255,255,255,0.3)', fontFamily: "'JetBrains Mono', monospace" }}
              >
                API Endpoint
              </span>
              <button
                onClick={() => setSelected(null)}
                className="transition-colors hover:text-white"
                style={{ color: 'rgba(255,255,255,0.3)' }}
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2.5">
              <p
                className="text-[13px] text-white break-all mb-4 leading-relaxed"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                <span style={{ color: STATUS_COLOR[selected.status ?? 'normal'] }}>
                  {selected.method}
                </span>{' '}
                {selected.label}
              </p>
              {([
                ['Provider',     selected.provider ?? '—'],
                ['Status',       STATUS_LABEL[selected.status ?? 'normal'] ?? selected.status ?? '—'],
                ['Calls / day',  selected.callsPerDay?.toLocaleString() ?? '—'],
                ['Monthly cost', `$${selected.monthlyCost?.toFixed(2) ?? '0.00'}`],
              ] as [string, string][]).map(([key, val]) => (
                <div key={key} className="flex justify-between items-center">
                  <span
                    className="text-[12px]"
                    style={{ color: 'rgba(255,255,255,0.3)', fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    {key}
                  </span>
                  <span
                    className="text-[12px]"
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      color: key === 'Status'
                        ? STATUS_COLOR[selected.status ?? 'normal']
                        : 'rgba(255,255,255,0.75)',
                    }}
                  >
                    {val}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="absolute bottom-5 left-5 bg-black/60 backdrop-blur-sm border border-white/[0.08] rounded-lg px-4 py-2.5">
          <div
            className="flex items-center gap-5"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            {Object.entries(STATUS_COLOR).map(([status, color]) => (
              <div
                key={status}
                className="flex items-center gap-1.5 text-[11px]"
                style={{ color: 'rgba(255,255,255,0.3)' }}
              >
                <div
                  className="rounded-full"
                  style={{
                    width: 13, height: 13,
                    background: `${color}18`,
                    border: `1px solid ${color}85`,
                  }}
                />
                {STATUS_LABEL[status] ?? status}
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
    </div>
    </div>
  );
}
