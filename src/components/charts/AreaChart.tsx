import { useRef, useState } from "react";
import type { MouseEvent } from "react";

interface Point {
  label: string;
  value: number;
}

export const AreaChart = ({
  data,
  color = "#2f5b8a"
}: {
  data: Point[];
  color?: string;
}) => {
  if (data.length === 0) {
    return <div className="empty">Nessun dato disponibile.</div>;
  }

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const width = 520;
  const height = 200;
  const padding = 20;
  const values = data.map((item) => item.value);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const range = max - min || 1;

  const xStep = (width - padding * 2) / (data.length - 1 || 1);
  const points = data.map((item, index) => {
    const x = padding + index * xStep;
    const y = height - padding - ((item.value - min) / range) * (height - padding * 2);
    return { x, y };
  });

  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");

  const areaPath = `${linePath} L ${width - padding} ${height - padding} L ${padding} ${height - padding} Z`;

  const handleMove = (event: MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const xInView = (x / rect.width) * width;
    const index = Math.round((xInView - padding) / xStep);
    const clamped = Math.min(Math.max(index, 0), data.length - 1);
    const point = points[clamped];
    setHoverIndex(clamped);
    setTooltipPos({
      x: (point.x / width) * rect.width,
      y: (point.y / height) * rect.height
    });
  };

  const handleLeave = () => {
    setHoverIndex(null);
  };

  return (
    <div className="chart-interactive" ref={containerRef}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height="200"
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
      >
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.4" />
            <stop offset="100%" stopColor={color} stopOpacity="0.05" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#areaFill)" />
        <path d={linePath} fill="none" stroke={color} strokeWidth="3" />
        {hoverIndex !== null && (
          <circle
            cx={points[hoverIndex].x}
            cy={points[hoverIndex].y}
            r="5"
            fill={color}
          />
        )}
      </svg>
      {hoverIndex !== null && (
        <div
          className="chart-tooltip"
          style={{ left: tooltipPos.x, top: tooltipPos.y }}
        >
          <strong>{data[hoverIndex].label}</strong>
          <span>{data[hoverIndex].value.toFixed(2)}</span>
        </div>
      )}
    </div>
  );
};
