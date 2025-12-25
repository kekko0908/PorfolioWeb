interface BarPoint {
  label: string;
  income: number;
  expense: number;
}

export const BarChart = ({ data }: { data: BarPoint[] }) => {
  if (data.length === 0) {
    return <div className="empty">Nessun dato disponibile.</div>;
  }

  const width = 520;
  const height = 220;
  const padding = 24;
  const maxValue = Math.max(
    1,
    ...data.map((item) => Math.max(item.income, item.expense))
  );
  const groupWidth = (width - padding * 2) / data.length;
  const barWidth = groupWidth * 0.3;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="220">
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
  );
};
