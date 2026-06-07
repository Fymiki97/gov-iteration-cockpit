import { toBlob } from "html-to-image";
import * as XLSX from "xlsx";

/** 生成文件名时间戳：YYYYMMDD_HHMMSS */
export function formatExportTimestamp(date = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

export interface ReqExportRow {
  onesId: string;
  onesUrl: string;
  title: string;
  status: string;
  level: string;
  project: string;
  productOwner: string;
  devOwner: string;
  testOwner: string;
}

const REQ_EXCEL_HEADERS = [
  "ONES ID",
  "标题",
  "状态",
  "优先级",
  "所属项目",
  "产品负责人",
  "开发负责人",
  "测试负责人",
] as const;

/** 导出需求列表为 Excel，ONES ID 列带超链接 */
export function exportRequirementsToExcel(rows: ReqExportRow[], filename: string) {
  const ws = XLSX.utils.aoa_to_sheet([REQ_EXCEL_HEADERS as unknown as string[]]);

  rows.forEach((r, idx) => {
    const rowIndex = idx + 1;
    const values = [
      r.onesId || "",
      r.title || "",
      r.status || "",
      r.level || "",
      r.project || "",
      r.productOwner || "",
      r.devOwner || "",
      r.testOwner || "",
    ];
    values.forEach((val, colIndex) => {
      const cellRef = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
      if (colIndex === 0 && r.onesUrl && r.onesId) {
        ws[cellRef] = {
          t: "s",
          v: r.onesId,
          l: { Target: r.onesUrl, Tooltip: r.onesId },
        };
      } else {
        ws[cellRef] = { t: "s", v: val };
      }
    });
  });

  ws["!cols"] = [
    { wch: 14 },
    { wch: 40 },
    { wch: 12 },
    { wch: 10 },
    { wch: 18 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
  ];
  ws["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: rows.length, c: REQ_EXCEL_HEADERS.length - 1 },
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "需求列表");
  XLSX.writeFile(wb, filename);
}

/**
 * 截取指定 DOM 区域为 PNG。
 *
 * 使用 html-to-image（基于 SVG foreignObject），由浏览器原生渲染：
 *  - 完整支持 oklab/oklch/color-mix 等现代 CSS 颜色
 *  - currentColor 在 SVG 图标中正确继承（不会置灰）
 *  - Recharts SVG 图表按原始尺寸渲染
 */
export async function captureElementAsPng(element: HTMLElement, filename: string) {
  // 等待图表和异步内容渲染完成
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 600)));
  });

  const blob = await toBlob(element, {
    backgroundColor: "#F8FAFC",
    pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    // 根元素展开滚动裁剪，让完整内容可见
    style: {
      overflow: "visible",
      height: "auto",
      maxHeight: "none",
    },
  });

  if (!blob) throw new Error("图片生成失败");

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** Tab key 到中文名称 */
export const TAB_LABELS: Record<string, string> = {
  overview: "迭代概览",
  monthly: "月度迭代情况",
  list: "需求列表",
  milestone: "里程碑",
};

/** 构建导出图片文件名 */
export function buildImageExportFilename(tabKey: string, extraSuffix?: string): string {
  const tabName = TAB_LABELS[tabKey] || tabKey;
  const suffix = extraSuffix ? `_${extraSuffix}` : "";
  return `政务看板_${tabName}${suffix}_${formatExportTimestamp()}.png`;
}

/** 构建需求 Excel 文件名 */
export function buildExcelExportFilename(): string {
  return `政务需求列表_${formatExportTimestamp()}.xlsx`;
}
