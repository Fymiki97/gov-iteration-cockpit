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
function waitForRender(ms = 400): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setTimeout(resolve, ms));
    });
  });
}

/**
 * OKLab → sRGB 转换（共享路径）。
 *
 * html2canvas v1.4.1 不支持 oklch() / oklab() 颜色函数，
 * 而 Tailwind CSS v4 两种都用。在 onclone 中必须全部转为 rgb()。
 */
function oklabLmsToSrgb(l_: number, m_: number, s_: number): [number, number, number] {
  const l3 = l_ * l_ * l_;
  const m3 = m_ * m_ * m_;
  const s3 = s_ * s_ * s_;

  // LMS → linear sRGB
  const rLin = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  const gLin = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const bLin = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;

  // sRGB transfer function
  const gamma = (x: number) =>
    x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;

  const clamp = (x: number) =>
    Math.max(0, Math.min(255, Math.round(x * 255)));

  return [clamp(gamma(rLin)), clamp(gamma(gLin)), clamp(gamma(bLin))];
}

/** oklch(L C H) → sRGB：先极坐标→OKLab，再 LMS→sRGB */
function oklchToRgb(l: number, c: number, h: number): [number, number, number] {
  const hRad = (h * Math.PI) / 180;
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);
  return oklabLmsToSrgb(
    l + 0.3963377774 * a + 0.2158037573 * b,
    l - 0.1055613458 * a - 0.0638541728 * b,
    l - 0.0894841775 * a - 1.291485548 * b,
  );
}

/** oklab(L A B) → sRGB：直接走 LMS→sRGB */
function oklabToSrgb(l: number, a: number, b: number): [number, number, number] {
  return oklabLmsToSrgb(
    l + 0.3963377774 * a + 0.2158037573 * b,
    l - 0.1055613458 * a - 0.0638541728 * b,
    l - 0.0894841775 * a - 1.291485548 * b,
  );
}

/** 替换文本中所有 oklch() / oklab() 为 rgb()（html2canvas 两者都不支持） */
function fixModernColorsInCss(text: string): string {
  return text
    // oklch(L C H) / oklch(L C H / A)
    .replace(/oklch\(([^)]+)\)/g, (_m, args: string) => {
      const parts = args
        .split(/[\s,/]+/)
        .filter((p: string) => p !== "" && p !== "/")
        .map(Number);
      const [l, c, h] = parts;
      if (isNaN(l) || isNaN(c) || isNaN(h)) return "#808080";
      const [r, g, b] = oklchToRgb(l, c, h);
      return `rgb(${r},${g},${b})`;
    })
    // oklab(L A B) / oklab(L A B / A)
    .replace(/oklab\(([^)]+)\)/g, (_m, args: string) => {
      const parts = args
        .split(/[\s,/]+/)
        .filter((p: string) => p !== "" && p !== "/")
        .map(Number);
      const [l, a, b] = parts;
      if (isNaN(l) || isNaN(a) || isNaN(b)) return "#808080";
      // oklab 直接走 OKLab→LMS→sRGB，不需要极坐标转换
      const [r, g, bl] = oklabToSrgb(l, a, b);
      return `rgb(${r},${g},${bl})`;
    });
}

/**
 * 截取指定 DOM 区域为 PNG。
 *
 * 核心策略：
 *  1. 克隆文档中所有 oklch() → rgb()，解决 html2canvas 不支持 oklch 的问题
 *  2. 根元素 overflow→visible / height→auto，让 html2canvas 看到完整内容
 *  3. 子元素只展开 overflow，**不改 height**，避免把 Recharts SVG 拍扁
 *  4. SVG 元素和 Recharts 容器完全跳过
 */
export async function captureElementAsPng(element: HTMLElement, filename: string) {
  await waitForRender(600);

  const canvas = await html2canvas(element, {
    useCORS: true,
    allowTaint: false,
    backgroundColor: "#F8FAFC",
    scale: Math.min(window.devicePixelRatio || 1, 2),
    scrollX: 0,
    scrollY: 0,
    logging: false,
    onclone: (clonedDoc, clonedEl) => {
      // ── 1. 修复 oklch：html2canvas v1.4.1 不认识这个颜色函数 ──
      //    必须在 CSS 被解析前把克隆文档中的 oklch() 全部转为 rgb()
      clonedDoc.querySelectorAll("style").forEach((s) => {
        s.textContent = fixModernColorsInCss(s.textContent || "");
      });
      clonedDoc.querySelectorAll("[style]").forEach((el) => {
        const htmlEl = el as HTMLElement;
        htmlEl.style.cssText = fixModernColorsInCss(htmlEl.style.cssText);
      });

      // ── 2. 展开滚动容器 ──
      const root = clonedEl as HTMLElement;
      root.style.overflow = "visible";
      root.style.maxHeight = "none";
      root.style.height = "auto";

      root.querySelectorAll("*").forEach((child) => {
        if (child instanceof SVGElement) return;
        const el = child as HTMLElement;
        if (!el.style) return;

        // Recharts 组件需要保持固定尺寸，完全跳过
        if (
          el.classList.contains("recharts-responsive-container") ||
          el.classList.contains("recharts-wrapper") ||
          el.classList.contains("recharts-surface") ||
          el.closest(".recharts-responsive-container")
        ) {
          return;
        }

        // 仅展开 overflow，不触碰 height（保护图表容器的显式高度）
        el.style.overflow = "visible";
        el.style.overflowY = "visible";
        el.style.overflowX = "visible";
        el.style.maxHeight = "none";
      });
    },
  });

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("canvas.toBlob 返回 null（可能超出浏览器 canvas 尺寸限制）");

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
