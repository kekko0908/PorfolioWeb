import { formatPercent } from "../../lib/format";

interface DonutDatum {
  label: string;
  value: number;
}

const palette = [
  "#1f6f5c",
  "#c8782b",
  "#2f5b8a",
  "#d4a373",
  "#8c5a3c",
  "#4f7c93",
  "#bf6a5a"
];

const colorMap: Record<string, string> = {
  ETF: "#ef4444",
  Liquidita: "#22c55e",
  Azioni: "#60a5fa",
  Obbligazioni: "#f59e0b",
  Crypto: "#14b8a6",
  Oro: "#facc15",
  "Real Estate": "#a78bfa",
  "Private Equity": "#f97316",
  Cash: "#22c55e",
  Altro: "#94a3b8"
};

export const DonutChart = ({
  data,
  onSelect
}: {
  data: DonutDatum[];
  onSelect?: (label: string) => void;
}) => {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const radius = 58;
  const stroke = 16;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const isInteractive = Boolean(onSelect && total > 0);

  const normalized = total > 0 ? data : [{ label: "Nessun dato", value: 1 }];

  return (
    <div>
      <svg viewBox="0 0 160 160" width="100%" height="180">
        <g transform="translate(80 80)">
          {normalized.map((item, index) => {
            const value = total > 0 ? item.value : 1;
            const dash = (value / (total > 0 ? total : 1)) * circumference;
            const color = colorMap[item.label] ?? palette[index % palette.length];
            const circle = (
              <circle
                key={item.label}
                r={radius}
                cx={0}
                cy={0}
                fill="transparent"
                stroke={color}
                strokeWidth={stroke}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
                strokeLinecap="round"
                onClick={
                  isInteractive ? () => onSelect && onSelect(item.label) : undefined
                }
                style={isInteractive ? { cursor: "pointer" } : undefined}
              />
            );
            offset += dash;
            return circle;
          })}
          <circle r={radius - stroke} fill="var(--bg)" />
          <text
            textAnchor="middle"
            y={5}
            fontSize="14"
            fill="var(--muted)"
            fontFamily="IBM Plex Mono, monospace"
          >
            {total > 0 ? "Totale" : "--"}
          </text>
        </g>
      </svg>
      <div className="grid-2" style={{ gap: "10px" }}>
        {normalized.map((item, index) => {
          const percent = total > 0 ? item.value / total : 0;
          const percentLabel = total > 0 ? formatPercent(percent) : "N/D";
          return (
            <span
              className="tag"
              key={item.label}
              onClick={
                isInteractive ? () => onSelect && onSelect(item.label) : undefined
              }
              style={isInteractive ? { cursor: "pointer" } : undefined}
            >
              <span
                className="tag-dot"
                style={{
                  background: colorMap[item.label] ?? palette[index % palette.length]
                }}
              />
              <span>{item.label}</span>
              <span className="tag-value">{percentLabel}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
};
