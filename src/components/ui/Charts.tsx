interface BarChartProps {
  data: { label: string; value: number }[];
  color?: string;
  height?: number;
  formatValue?: (v: number) => string;
}

export function BarChart({ data, color = '#16a34a', height = 200, formatValue }: BarChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-slate-400">
        No data to display
      </div>
    );
  }
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="flex items-end gap-2" style={{ height }}>
      {data.map((d, i) => {
        const h = (d.value / max) * (height - 30);
        return (
          <div key={i} className="group relative flex flex-1 flex-col items-center justify-end">
            <div className="absolute -top-6 z-10 hidden whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs text-white group-hover:block dark:bg-slate-700">
              {formatValue ? formatValue(d.value) : d.value}
            </div>
            <div
              className="w-full rounded-t-md transition-all duration-300 hover:opacity-80"
              style={{ height: Math.max(h, 4), backgroundColor: color }}
            />
            <span className="mt-2 truncate text-xs text-slate-500 dark:text-slate-400">
              {d.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

interface DonutChartProps {
  data: { label: string; value: number; color: string }[];
  size?: number;
}

export function DonutChart({ data, size = 160 }: DonutChartProps) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-slate-400">
        No data
      </div>
    );
  }
  const radius = size / 2 - 10;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex items-center gap-6">
      <svg width={size} height={size} className="shrink-0">
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {data.map((d, i) => {
            const fraction = d.value / total;
            const dash = fraction * circumference;
            const seg = (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={d.color}
                strokeWidth={20}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
              />
            );
            offset += dash;
            return seg;
          })}
        </g>
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dy="0.35em"
          className="fill-slate-900 dark:fill-white font-bold text-lg"
        >
          {total.toFixed(0)}
        </text>
      </svg>
      <div className="space-y-2">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: d.color }} />
            <span className="text-slate-600 dark:text-slate-300">{d.label}</span>
            <span className="font-semibold text-slate-900 dark:text-white">
              {((d.value / total) * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface LineChartProps {
  data: { label: string; value: number }[];
  color?: string;
  height?: number;
}

export function LineChart({ data, color = '#16a34a', height = 180 }: LineChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-slate-400">
        No data to display
      </div>
    );
  }
  const max = Math.max(...data.map((d) => d.value), 1);
  const min = Math.min(...data.map((d) => d.value), 0);
  const range = max - min || 1;
  const w = 100;
  const h = 100;
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1 || 1)) * w;
    const y = h - ((d.value - min) / range) * h;
    return `${x},${y}`;
  });
  const pathD = `M ${points.join(' L ')}`;
  const areaD = `${pathD} L ${w},${h} L 0,${h} Z`;

  return (
    <div style={{ height }} className="w-full">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-full w-full">
        <defs>
          <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaD} fill="url(#lineGrad)" />
        <path d={pathD} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
        {data.map((d, i) => {
          const x = (i / (data.length - 1 || 1)) * w;
          const y = h - ((d.value - min) / range) * h;
          return <circle key={i} cx={x} cy={y} r="1.5" fill={color} vectorEffect="non-scaling-stroke" />;
        })}
      </svg>
      <div className="mt-2 flex justify-between text-xs text-slate-400">
        {data.map((d, i) => (
          <span key={i}>{d.label}</span>
        ))}
      </div>
    </div>
  );
}
