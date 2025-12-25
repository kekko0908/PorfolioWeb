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

export const DonutChart = ({ data }: { data: DonutDatum[] }) => {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const radius = 58;
  const stroke = 16;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  const normalized = total > 0 ? data : [{ label: "Nessun dato", value: 1 }];

  return (
    <div>
      <svg viewBox="0 0 160 160" width="100%" height="180">
        <g transform="translate(80 80)">
          {normalized.map((item, index) => {
            const value = total > 0 ? item.value : 1;
            const dash = (value / (total > 0 ? total : 1)) * circumference;
            const color = palette[index % palette.length];
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
              />
            );
            offset += dash;
            return circle;
          })}
          <circle r={radius - stroke} fill="#fff" />
          <text
            textAnchor="middle"
            y={5}
            fontSize="14"
            fill="#6c675f"
            fontFamily="IBM Plex Mono, monospace"
          >
            {total > 0 ? "Totale" : "--"}
          </text>
        </g>
      </svg>
      <div className="grid-2" style={{ gap: "10px" }}>
        {normalized.map((item, index) => (
          <span className="tag" key={item.label}>
            <span
              className="tag-dot"
              style={{ background: palette[index % palette.length] }}
            />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
};
