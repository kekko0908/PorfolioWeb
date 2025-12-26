import { useRef, useState } from "react";
import type { MouseEvent } from "react";

interface WavePoint {
  label: string;
  benchmark: number;
  portfolio: number;
}

export const WaveChart = ({
  data,
  benchmarkColor = "#f2b76c",
  portfolioColor = "#2dd4bf"
}: {
  data: WavePoint[];
  benchmarkColor?: string;
  portfolioColor?: string;
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
  const values = data.flatMap((item) => [item.benchmark, item.portfolio, 0]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const xStep = (width - padding * 2) / (data.length - 1 || 1);

  const points = data.map((item, index) => {
    const x = padding + index * xStep;
    const benchmarkY =
      height - padding - ((item.benchmark - min) / range) * (height - padding * 2);
    const portfolioY =
      height - padding - ((item.portfolio - min) / range) * (height - padding * 2);
    return { x, benchmarkY, portfolioY };
  });

  const buildPath = (key: "benchmarkY" | "portfolioY") =>
    points
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point[key]}`)
      .join(" ");

  const benchmarkPath = buildPath("benchmarkY");
  const portfolioPath = buildPath("portfolioY");

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
      y: (Math.min(point.benchmarkY, point.portfolioY) / height) * rect.height
    });
  };

  return (
    <div className="chart-interactive" ref={containerRef}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height="200"
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIndex(null)}
      >
        <path d={benchmarkPath} fill="none" stroke={benchmarkColor} strokeWidth="3" />
        <path d={portfolioPath} fill="none" stroke={portfolioColor} strokeWidth="3" />
        {hoverIndex !== null && (
          <>
            <circle
              cx={points[hoverIndex].x}
              cy={points[hoverIndex].benchmarkY}
              r="4"
              fill={benchmarkColor}
            />
            <circle
              cx={points[hoverIndex].x}
              cy={points[hoverIndex].portfolioY}
              r="4"
              fill={portfolioColor}
            />
          </>
        )}
      </svg>
      {hoverIndex !== null && (
        <div
          className="chart-tooltip"
          style={{ left: tooltipPos.x, top: tooltipPos.y }}
        >
          <strong>{data[hoverIndex].label}</strong>
          <span>Benchmark: {data[hoverIndex].benchmark.toFixed(1)}%</span>
          <span>Portafoglio: {data[hoverIndex].portfolio.toFixed(1)}%</span>
        </div>
      )}
    </div>
  );
};
