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

/**
 * Peak/valley axis labels for a team vs. a reference identity — the exact same
 * (team - average) diff computation the chart itself uses for the emphasised vertex
 * dots and axis labels (D2, plan_deckbuilder_ux). Exposed so the KPI band can show the
 * same peak/valley as words without duplicating or diverging from the chart's math.
 */
export function peakValleyAxes(data: RosterIdentity, average: RosterIdentity): { peak: string; valley: string } {
  const diffs = AXES.map(a => (data[a.key] ?? 0) - (average[a.key] ?? 0));
  const peakIndex = diffs.indexOf(Math.max(...diffs));
  const valleyIndex = diffs.indexOf(Math.min(...diffs));
  return { peak: AXES[peakIndex].label, valley: AXES[valleyIndex].label };
}

interface RadarChartProps {
  /** This team's identity values (0-100 scale), never rendered as numbers — shape only. */
  data: RosterIdentity;
  /** Reference values (e.g. league average) drawn as a faint dashed polygon. */
  average: RosterIdentity;
  /** Base size (px) used only to derive the viewBox's internal proportions —
   *  the rendered SVG has no fixed width/height and instead fills its container
   *  fluidly (see D17: builder body must resize 1024-1920px without clipping). */
  size?: number;
}

/**
 * Pure presentational SVG heptagon radar. No state, no numbers rendered anywhere.
 * viewBox-scaled: no width/height attributes, so it fills whatever box the caller
 * gives it (e.g. `<div style={{width: '11rem'}}>`) instead of clipping or staying
 * a fixed pixel size.
 */
export function RadarChart({ data, average, size = 120 }: RadarChartProps) {
  const center = size / 2;
  const labelPad = Math.max(14, size * 0.14);
  const maxRadius = center - labelPad;
  // Side labels ("PERIMETER D", "MID-RANGE") extend past the circle; give the SVG
  // extra width on both sides so they are never clipped by the container edge.
  // (D2/D5: labels render at the 12px floor, wider than the old 8px. The longest,
  // "PERIMETER D" / "▲ PLAYMAKING", is ~95 viewBox units at that size, so the side pad
  // must cover that; the top/bottom labels need a little vertical room too.)
  const hPad = 100;
  const vPad = 12;
  // Relative strength per axis (team minus league average) drives the vertex dots and
  // the emphasised labels: the biggest positive gap is the peak, the most negative the
  // valley. Shapes and colours only — no numbers (product rule).
  const diffs = AXES.map(a => (data[a.key] ?? 0) - (average[a.key] ?? 0));
  const peakIndex = diffs.indexOf(Math.max(...diffs));
  const valleyIndex = diffs.indexOf(Math.min(...diffs));

  return (
    <svg
      // Natural size, 1 viewBox unit = 1px. Scaling the SVG into a narrow column made the
      // "12px" labels ~6px on screen and the radar itself tiny (owner: "too small").
      viewBox={`${-hPad} ${-vPad} ${size + 2 * hPad} ${size + 2 * vPad}`}
      width={size + 2 * hPad}
      height={size + 2 * vPad}
      className="block max-w-full h-auto"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Team identity radar"
    >
      {/* Faint grid rings */}
      {RING_FRACTIONS.map(f => (
        <polygon
          key={f}
          points={ringPoints(center, center, maxRadius * f)}
          fill="none"
          stroke="var(--line-strong)"
          strokeOpacity={0.5}
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
            stroke="var(--line)"
            strokeWidth={1}
          />
        );
      })}

      {/* League-average reference polygon — dashed, faint, no fill */}
      <polygon
        points={valuePoints(center, center, maxRadius, average)}
        fill="none"
        stroke="var(--ink-subtle)"
        strokeOpacity={0.7}
        strokeWidth={1}
        strokeDasharray="3 2"
      />

      {/* Team polygon */}
      <polygon
        points={valuePoints(center, center, maxRadius, data)}
        fill="var(--accent)"
        fillOpacity={0.3}
        stroke="var(--accent)"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />

      {/* Vertex dots: green above league average, rose below; peak and valley are larger */}
      {AXES.map((axis, i) => {
        const value = Math.max(0, Math.min(MAX_VALUE, data[axis.key] ?? 0));
        const [x, y] = pointAt(center, center, (value / MAX_VALUE) * maxRadius, axisAngle(i));
        const above = diffs[i] >= 0;
        const extreme = i === peakIndex || i === valleyIndex;
        return (
          <circle
            key={`dot-${axis.key}`}
            cx={x}
            cy={y}
            r={extreme ? 4.5 : 2.5}
            fill={above ? 'var(--positive)' : 'var(--danger)'}
            stroke="var(--surface-raised)"
            strokeWidth={1.5}
          >
            <title>{`${axis.label}: ${above ? 'above' : 'below'} league average${i === peakIndex ? ' (strength)' : i === valleyIndex ? ' (weakness)' : ''}`}</title>
          </circle>
        );
      })}

      {/* Axis labels — outside the vertices, no numbers */}
      {AXES.map((axis, i) => {
        const angle = axisAngle(i);
        const [x, y] = pointAt(center, center, maxRadius + labelPad * 0.6, angle);
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const textAnchor = cos > 0.15 ? 'start' : cos < -0.15 ? 'end' : 'middle';
        const dy = sin >= 0 ? 7 : -3;
        const emphasisColor = i === peakIndex ? 'var(--positive)' : i === valleyIndex ? 'var(--danger)' : 'var(--ink-muted)';
        const prefix = i === peakIndex ? '▲ ' : i === valleyIndex ? '▼ ' : '';
        return (
          <text
            key={axis.key}
            x={x}
            y={y + dy}
            textAnchor={textAnchor}
            className="uppercase"
            fill={emphasisColor}
            style={{ fontSize: 12, fontWeight: i === peakIndex || i === valleyIndex ? 800 : 700, letterSpacing: '0.05em' }}
          >
            {prefix}{axis.label}
          </text>
        );
      })}
    </svg>
  );
}
