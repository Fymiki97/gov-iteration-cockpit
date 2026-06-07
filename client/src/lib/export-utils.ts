import html2canvas from "html2canvas";
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

/** 等待图表等异步渲染完成 */
export function waitForRender(ms = 400): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setTimeout(resolve, ms));
    });
  });
}

/**
 * 截取指定 DOM 区域为 PNG（支持超出视口高度的完整内容）
 * 截图前临时展开滚动容器，避免内容被裁剪
 */
export async function captureElementAsPng(element: HTMLElement, filename: string) {
  const scrollParent = findScrollableParent(element) ?? element;
  const saved = {
    overflow: scrollParent.style.overflow,
    height: scrollParent.style.height,
    maxHeight: scrollParent.style.maxHeight,
  };

  scrollParent.style.overflow = "visible";
  scrollParent.style.height = "auto";
  scrollParent.style.maxHeight = "none";

  await waitForRender(500);

  try {
    const width = element.scrollWidth;
    const height = element.scrollHeight;

    const canvas = await html2canvas(element, {
      useCORS: true,
      allowTaint: false,
      backgroundColor: "#F8FAFC",
      scale: Math.min(window.devicePixelRatio || 1, 2),
      width,
      height,
      windowWidth: width,
      windowHeight: height,
      scrollX: 0,
      scrollY: 0,
      logging: false,
      onclone: (_doc, clonedEl) => {
        const cloned = clonedEl as HTMLElement;
        cloned.style.overflow = "visible";
        cloned.style.maxHeight = "none";
        cloned.style.height = "auto";
      },
    });

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("图片生成失败");

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  } finally {
    scrollParent.style.overflow = saved.overflow;
    scrollParent.style.height = saved.height;
    scrollParent.style.maxHeight = saved.maxHeight;
  }
}

function findScrollableParent(el: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el;
  while (node) {
    const style = getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowY)) return node;
    node = node.parentElement;
  }
  return null;
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
