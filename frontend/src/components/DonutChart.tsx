import React from 'react';

interface DonutChartProps {
  data: { label: string; value: number; color: string }[];
  size?: number;
  strokeWidth?: number;
}

export function DonutChart({ data, size = 120, strokeWidth = 20 }: DonutChartProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const center = size / 2;

  let cumulativePercent = 0;

  return (
    <div className="flex items-center gap-4">
      {/* Chart */}
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          {data.map((slice, i) => {
            const strokeDasharray = `${(slice.value * circumference)} ${circumference}`;
            const strokeDashoffset = -(cumulativePercent * circumference);
            cumulativePercent += slice.value;

            return (
              <circle
                key={slice.label}
                cx={center}
                cy={center}
                r={radius}
                fill="transparent"
                stroke={slice.color}
                strokeWidth={strokeWidth}
                strokeDasharray={strokeDasharray}
                strokeDashoffset={strokeDashoffset}
                className="transition-all duration-500 ease-in-out"
              />
            );
          })}
        </svg>
      </div>

      {/* External Legend */}
      <div className="flex flex-col gap-1">
        {data.map(slice => (
          <div key={slice.label} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: slice.color }}></div>
            <div className="flex flex-col leading-none">
              <span className="text-[9px] font-bold tracking-tighter text-stone-600 uppercase">{slice.label}</span>
              <span className="text-[11px] font-black" style={{ color: slice.color }}>{(slice.value * 100).toFixed(0)}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
