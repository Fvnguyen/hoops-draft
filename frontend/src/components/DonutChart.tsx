'use client';

import React, { useState } from 'react';

interface DonutSlice {
  label: string;
  value: number; // 0..1 share
  color: string;
}

interface DonutChartProps {
  data: DonutSlice[];
  /** Base size (px) used only to derive the viewBox and stroke proportions — the
   *  rendered SVG has no fixed width/height and fills its container fluidly
   *  (D17: must resize 1024-1920px without clipping or staying a fixed size). */
  size?: number;
  strokeWidth?: number;
}

const GAP_RAD = (2.5 * Math.PI) / 180; // small gap between segments

function polar(cx: number, cy: number, r: number, angle: number): [number, number] {
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
}

/** SVG arc path from a0 to a1 (radians, clockwise from 12 o'clock) at radius r. */
function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const [x0, y0] = polar(cx, cy, r, a0 - Math.PI / 2);
  const [x1, y1] = polar(cx, cy, r, a1 - Math.PI / 2);
  const largeArc = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${largeArc} 1 ${x1} ${y1}`;
}

/**
 * Donut with hoverable segments: hovering a segment (or its legend row) highlights it
 * and shows its label and share in the centre. No external dependencies.
 */
export function DonutChart({ data, size = 120, strokeWidth = 20 }: DonutChartProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const radius = (size - strokeWidth) / 2 - 2;
  const center = size / 2;
  const total = data.reduce((s, d) => s + Math.max(0, d.value), 0) || 1;

  // Build segment angles once; skip empty slices. (Plain loop rather than a closure
  // that reassigns a captured variable — keeps the React Compiler lint rule happy.)
  const segments: Array<DonutSlice & { a0: number; a1: number; share: number }> = [];
  let cursor = 0;
  for (const d of data) {
    if (d.value <= 0) continue;
    const span = (d.value / total) * Math.PI * 2;
    const gap = Math.min(GAP_RAD, span / 4);
    segments.push({ ...d, a0: cursor + gap / 2, a1: cursor + span - gap / 2, share: d.value / total });
    cursor += span;
  }

  const focus = segments.find(s => s.label === hovered) ?? segments.slice().sort((a, b) => b.share - a.share)[0];

  return (
    <div className="flex items-center gap-4" onMouseLeave={() => setHovered(null)}>
      <div className="relative shrink-0" style={{ width: size, maxWidth: '100%', aspectRatio: '1 / 1' }}>
        <svg viewBox={`0 0 ${size} ${size}`} preserveAspectRatio="xMidYMid meet" className="w-full h-full" role="img" aria-label="Expected shot diet">
          {/* Track */}
          <circle cx={center} cy={center} r={radius} fill="none" className="stroke-stone-100" strokeWidth={strokeWidth} />
          {segments.map(seg => {
            const isFocus = hovered === seg.label;
            const dimmed = hovered !== null && !isFocus;
            return (
              <path
                key={seg.label}
                d={arcPath(center, center, radius, seg.a0, seg.a1)}
                fill="none"
                stroke={seg.color}
                strokeWidth={isFocus ? strokeWidth + 4 : strokeWidth}
                strokeLinecap="butt"
                opacity={dimmed ? 0.45 : 1}
                className="transition-all duration-200 cursor-default"
                onMouseEnter={() => setHovered(seg.label)}
              >
                <title>{`${seg.label}: ${(seg.share * 100).toFixed(0)}% of shots`}</title>
              </path>
            );
          })}
        </svg>
        {/* Centre readout: hovered (or largest) share */}
        {focus && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none leading-none">
            <span className="text-[9px] font-bold uppercase tracking-widest text-stone-400">{focus.label}</span>
            <span className="text-[15px] font-black" style={{ color: focus.color }}>{(focus.share * 100).toFixed(0)}%</span>
          </div>
        )}
      </div>

      {/* Legend: rows highlight the matching segment */}
      <div className="flex flex-col gap-1">
        {segments.map(seg => {
          const isFocus = hovered === seg.label;
          return (
            <div
              key={seg.label}
              onMouseEnter={() => setHovered(seg.label)}
              className={`flex items-center gap-2 rounded-md px-2 py-1 border transition-colors cursor-default ${isFocus ? 'bg-stone-50 border-stone-200' : 'border-transparent'}`}
            >
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
              <span className="text-[10px] font-bold uppercase tracking-wide text-stone-600 w-8">{seg.label}</span>
              <span className="text-[11px] font-black tabular-nums" style={{ color: seg.color }}>{(seg.share * 100).toFixed(0)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
