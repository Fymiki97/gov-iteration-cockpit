import type { PieLabelRenderProps } from "recharts";

interface BarLabelProps {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  value?: unknown;
  fill?: string;
  valueFormat?: (v: number) => string;
}

/** 柱状图柱顶数值标签（原生 SVG text，截图稳定） */
export function BarTopLabel({ x, y, width, value, fill, valueFormat }: BarLabelProps) {
  const num = Number(value ?? 0);
  const nx = Number(x);
  const ny = Number(y);
  const nw = Number(width);
  if (!Number.isFinite(nx) || !Number.isFinite(ny) || !Number.isFinite(nw) || !num || num <= 0) return null;
  const text = valueFormat ? valueFormat(num) : String(num);
  return (
    <text
      x={nx + nw / 2}
      y={ny - 8}
      fill={fill || "#334155"}
      textAnchor="middle"
      fontSize={11}
      fontWeight={600}
      fontFamily="Microsoft YaHei, sans-serif"
      style={{ pointerEvents: "none" }}
    >
      {text}
    </text>
  );
}

interface LineLabelProps {
  x?: number | string;
  y?: number | string;
  value?: unknown;
  fill?: string;
  valueFormat?: (v: number) => string;
}

/** 折线图数据点标签 */
export function LineTopLabel({ x, y, value, fill, valueFormat }: LineLabelProps) {
  const num = Number(value ?? 0);
  const nx = Number(x);
  const ny = Number(y);
  if (!Number.isFinite(nx) || !Number.isFinite(ny) || !num || num <= 0) return null;
  const text = valueFormat ? valueFormat(num) : String(num);
  return (
    <text
      x={nx}
      y={ny - 10}
      fill={fill || "#334155"}
      textAnchor="middle"
      fontSize={11}
      fontWeight={600}
      fontFamily="Microsoft YaHei, sans-serif"
      style={{ pointerEvents: "none" }}
    >
      {text}
    </text>
  );
}

/**
 * 环形图外侧引线标签：月份 + 人天数 + 占比。
 * 标签绘制在环外并使用深色文字，避免 clip-path 裁切导致截图不可见。
 */
export function PieOutsideLabel(props: PieLabelRenderProps) {
  const { cx, cy, midAngle, outerRadius, percent, value, name } = props;
  if (cx == null || cy == null || midAngle == null) return null;
  const val = Number(value) || 0;
  const p = (Number(percent) || 0) * 100;
  if (val <= 0) return null;

  const RADIAN = Math.PI / 180;
  const cxN = Number(cx);
  const cyN = Number(cy);
  const or = Number(outerRadius) || 0;
  const ma = Number(midAngle);
  const cos = Math.cos(-RADIAN * ma);
  const sin = Math.sin(-RADIAN * ma);

  const sx = cxN + (or + 2) * cos;
  const sy = cyN + (or + 2) * sin;
  const mx = cxN + (or + 16) * cos;
  const my = cyN + (or + 16) * sin;
  const ex = cxN + (or + 24) * cos;
  const ey = cyN + (or + 24) * sin;
  const textAnchor = cos >= 0 ? "start" : "end";
  const textX = cxN + (or + 28) * cos;
  const month = String(name ?? "");

  // 标签颜色跟随切片色，比纯黑更柔和但比浅色切片更暗，确保可读
  const sliceFill = (props as any).fill as string | undefined;
  const labelColor = sliceFill || "#475569";

  return (
    <g className="pie-export-label">
      <polyline
        points={`${sx},${sy} ${mx},${my} ${ex},${ey}`}
        stroke={labelColor}
        style={{ stroke: labelColor }}
        fill="none"
        strokeWidth={1}
        opacity={0.6}
      />
      <text
        x={textX}
        y={ey}
        textAnchor={textAnchor}
        dominantBaseline="central"
        fill={labelColor}
        style={{ fill: labelColor }}
        fontSize={11}
        fontWeight={600}
        fontFamily="Microsoft YaHei, sans-serif"
      >
        <tspan x={textX} dy={-8}>{month}</tspan>
        <tspan x={textX} dy={16}>{`${val.toFixed(1)}人天 · ${p.toFixed(0)}%`}</tspan>
      </text>
    </g>
  );
}

/** 环形图 HTML 图例（纯 DOM，截图 100% 可见） */
export function PieLegendTable({
  data,
  colors,
  unit = "人天",
}: {
  data: { name: string; value: number }[];
  colors: string[];
  unit?: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (data.length === 0) return null;
  return (
    <div data-chart-legend className="mt-3 w-full border-t border-[#F1F5FD] pt-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
        {data.map((d, i) => (
          <div key={d.name} className="flex items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-1.5 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: colors[i % colors.length] }} />
              <span className="font-medium text-[#334155] truncate">{d.name}</span>
            </span>
            <span className="text-[#64748B] whitespace-nowrap shrink-0">
              {d.value.toFixed(1)}{unit}
              <span className="text-[#94A3B8] ml-1">
                ({total > 0 ? ((d.value / total) * 100).toFixed(0) : 0}%)
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
