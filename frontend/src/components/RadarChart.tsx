import React from 'react';
import type { RosterIdentity } from '../engine/rosterStats';

// Seven axes in a fixed clock order (starting at 12 o'clock, going clockwise).
// Order matches the product spec exactly — do not resort.
const AXES: Array<{ key: keyof RosterIdentity; label: string }> = [
  { key: 'finishing', label: 'Finishing' },
  { key: 'midRange', label: 'Mid-Range' },
  { key: 'perimeter', label: '3PT' },
  { key: 'playmaking', label: 'Playmaking' },
  { key: 'rebounding', label: 'Rebounding' },
  { key: 'perDef', label: 'Perimeter D' },
  { key: 'postDef', label: 'Post D' },
];

const RING_FRACTIONS = [1 / 3, 2 / 3, 1] as const;
// Ratings are on a 0-100 scale; used only to size the shape, never rendered as text.
const MAX_VALUE = 100;

function axisAngle(index: number): number {
  return -Math.PI / 2 + (index * 2 * Math.PI) / AXES.length;
}

function pointAt(cx: number, cy: number, radius: number, angle: number): [number, number] {
  return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
}

function ringPoints(cx: number, cy: number, radius: number): string {
  return AXES.map((_, i) => pointAt(cx, cy, radius, axisAngle(i)).join(',')).join(' ');
}

function valuePoints(cx: number, cy: number, maxRadius: number, data: RosterIdentity): string {
  return AXES.map((axis, i) => {
    const clamped = Math.min(MAX_VALUE, Math.max(0, data[axis.key]));
    const radius = (clamped / MAX_VALUE) * maxRadius;
    return pointAt(cx, cy, radius, axisAngle(i)).join(',');
  }).join(' ');
}

interface RadarChartProps {
  /** This team's identity values (0-100 scale), never rendered as numbers — shape only. */
  data: RosterIdentity;
  /** Reference values (e.g. league average) drawn as a faint dashed polygon. */
  average: RosterIdentity;
  size?: number;
}

/** Pure presentational SVG heptagon radar. No state, no numbers rendered anywhere. */
export function RadarChart({ data, average, size = 120 }: RadarChartProps) {
  const center = size / 2;
  const labelPad = Math.max(14, size * 0.14);
  const maxRadius = center - labelPad;
  // Side labels ("PERIMETER D", "MID-RANGE") extend past the circle; give the SVG
  // extra width on both sides so they are never clipped by the container edge.
  const hPad = 52;

  return (
    <svg
      viewBox={`${-hPad} 0 ${size + 2 * hPad} ${size}`}
      width={size + 2 * hPad}
      height={size}
      className="overflow-visible"
      role="img"
      aria-label="Team identity radar"
    >
      {/* Faint grid rings */}
      {RING_FRACTIONS.map(f => (
        <polygon
          key={f}
          points={ringPoints(center, center, maxRadius * f)}
          fill="none"
          className="stroke-stone-300/50"
          strokeWidth={1}
        />
      ))}

      {/* Axis spokes */}
      {AXES.map((axis, i) => {
        const [x, y] = pointAt(center, center, maxRadius, axisAngle(i));
        return (
          <line
            key={axis.key}
            x1={center}
            y1={center}
            x2={x}
            y2={y}
            className="stroke-stone-200"
            strokeWidth={1}
          />
        );
      })}

      {/* League-average reference polygon — dashed, faint, no fill */}
      <polygon
        points={valuePoints(center, center, maxRadius, average)}
        fill="none"
        className="stroke-stone-400/70"
        strokeWidth={1}
        strokeDasharray="3 2"
      />

      {/* Team polygon */}
      <polygon
        points={valuePoints(center, center, maxRadius, data)}
        className="fill-purple-500/30 stroke-purple-500"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />

      {/* Axis labels — outside the vertices, no numbers */}
      {AXES.map((axis, i) => {
        const angle = axisAngle(i);
        const [x, y] = pointAt(center, center, maxRadius + labelPad * 0.6, angle);
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const textAnchor = cos > 0.15 ? 'start' : cos < -0.15 ? 'end' : 'middle';
        const dy = sin >= 0 ? 7 : -3;
        return (
          <text
            key={axis.key}
            x={x}
            y={y + dy}
            textAnchor={textAnchor}
            className="fill-stone-500 uppercase"
            style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.05em' }}
          >
            {axis.label}
          </text>
        );
      })}
    </svg>
  );
}
