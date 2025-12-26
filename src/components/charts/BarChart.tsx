import { useRef, useState } from "react";
import type { MouseEvent } from "react";

interface BarPoint {
  label: string;
  income: number;
  expense: number;
}

export const BarChart = ({ data }: { data: BarPoint[] }) => {
  if (data.length === 0) {
    return <div className="empty">Nessun dato disponibile.</div>;
  }

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const width = 520;
  const height = 220;
  const padding = 24;
  const maxValue = Math.max(
    1,
    ...data.map((item) => Math.max(item.income, item.expense))
  );
  const groupWidth = (width - padding * 2) / data.length;
  const barWidth = groupWidth * 0.3;

  const handleMove = (event: MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const xInView = (x / rect.width) * width;
    const index = Math.round((xInView - padding) / groupWidth);
    const clamped = Math.min(Math.max(index, 0), data.length - 1);
    const xBase = padding + clamped * groupWidth + groupWidth / 2;
    setHoverIndex(clamped);
    setTooltipPos({
      x: (xBase / width) * rect.width,
      y: rect.height * 0.1
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
        height="220"
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
      >
        {data.map((item, index) => {
          const xBase = padding + index * groupWidth + groupWidth / 2;
          const incomeHeight = (item.income / maxValue) * (height - padding * 2);
          const expenseHeight = (item.expense / maxValue) * (height - padding * 2);
          return (
            <g key={item.label}>
              <rect
                x={xBase - barWidth - 4}
                y={height - padding - incomeHeight}
                width={barWidth}
                height={incomeHeight}
                fill="#1f6f5c"
                rx="6"
              />
              <rect
                x={xBase + 4}
                y={height - padding - expenseHeight}
                width={barWidth}
                height={expenseHeight}
                fill="#c8782b"
                rx="6"
              />
            </g>
          );
        })}
      </svg>
      {hoverIndex !== null && (
        <div
          className="chart-tooltip"
          style={{ left: tooltipPos.x, top: tooltipPos.y }}
        >
          <strong>{data[hoverIndex].label}</strong>
          <span>Entrate: {data[hoverIndex].income.toFixed(2)}</span>
          <span>Uscite: {data[hoverIndex].expense.toFixed(2)}</span>
        </div>
      )}
    </div>
  );
};
