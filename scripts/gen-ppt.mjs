import pptxgen from "pptxgenjs";

const pptx = new pptxgen();
pptx.layout = "LAYOUT_WIDE";
pptx.author = "政务产研团队";
pptx.title = "政务产研迭代进度看板";
pptx.subject = "产品介绍";

const C = {
  primary: "1E3A5F",
  accent: "2563EB",
  dark: "0F172A",
  gray: "64748B",
  lightGray: "F1F5F9",
  white: "FFFFFF",
  green: "059669",
  red: "DC2626",
  amber: "F59E0B",
  blue: "2563EB",
};

function addBg(slide, color = C.white) {
  slide.background = { fill: color };
}

function addFooter(slide, pageNum, total) {
  slide.addText(`${pageNum} / ${total}`, {
    x: 4.5, y: 7.1, w: 4.4, h: 0.3,
    fontSize: 9, color: C.gray, align: "right",
  });
  slide.addShape(pptx.ShapeType.line, {
    x: 0.5, y: 7.0, w: 12.3, h: 0,
    line: { color: "E4ECFC", width: 0.5 },
  });
}

function addHeader(slide, title) {
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: 13.33, h: 1.1,
    fill: { color: C.primary },
  });
  slide.addText(title, {
    x: 0.6, y: 0.2, w: 12, h: 0.7,
    fontSize: 24, color: C.white, bold: true, fontFace: "Microsoft YaHei",
  });
}

const TOTAL = 10;

// ========== Slide 1: 封面 ==========
const s1 = pptx.addSlide();
addBg(s1);
s1.addShape(pptx.ShapeType.rect, {
  x: 0, y: 0, w: 13.33, h: 7.5,
  fill: { color: C.primary },
});
s1.addShape(pptx.ShapeType.rect, {
  x: 0, y: 5.8, w: 13.33, h: 1.7,
  fill: { color: "162D4A" },
});
s1.addText("政务产研迭代进度看板", {
  x: 1, y: 1.8, w: 11.33, h: 1.2,
  fontSize: 42, color: C.white, bold: true, fontFace: "Microsoft YaHei",
  align: "center",
});
s1.addText("需求 · 里程碑 · 风险 —— 三位一体实时管理驾驶舱", {
  x: 1, y: 3.2, w: 11.33, h: 0.7,
  fontSize: 20, color: "94A3B8", fontFace: "Microsoft YaHei",
  align: "center",
});
s1.addText("2026 政务产品研发迭代规划", {
  x: 1, y: 4.1, w: 11.33, h: 0.5,
  fontSize: 16, color: "CBD5E1", fontFace: "Microsoft YaHei",
  align: "center",
});
s1.addText("WPS 365 智能应用平台", {
  x: 1, y: 6.2, w: 11.33, h: 0.4,
  fontSize: 14, color: "94A3B8", fontFace: "Microsoft YaHei",
  align: "center",
});
addFooter(s1, 1, TOTAL);

// ========== Slide 2: 目录 ==========
const s2 = pptx.addSlide();
addBg(s2);
addHeader(s2, "目录");
const tocItems = [
  "01  应用定位",
  "02  建设背景与痛点",
  "03  核心功能 — 迭代概览",
  "04  核心功能 — 月度迭代情况",
  "05  核心功能 — 需求列表 & 里程碑",
  "06  技术架构",
  "07  数据模型与核心算法",
  "08  业务价值",
  "09  使用与获取方式",
  "10  总结",
];
tocItems.forEach((item, i) => {
  s2.addText(item, {
    x: 1.5, y: 1.6 + i * 0.52, w: 10, h: 0.48,
    fontSize: 17, color: i % 2 === 0 ? C.dark : C.gray,
    fontFace: "Microsoft YaHei", bold: i % 2 === 0,
  });
});
addFooter(s2, 2, TOTAL);

// ========== Slide 3: 应用定位 ==========
const s3 = pptx.addSlide();
addBg(s3);
addHeader(s3, "01  应用定位");
s3.addText("一句话定义", {
  x: 0.8, y: 1.5, w: 11.5, h: 0.5,
  fontSize: 14, color: C.accent, bold: true, fontFace: "Microsoft YaHei",
});
s3.addShape(pptx.ShapeType.roundRect, {
  x: 0.8, y: 2.1, w: 11.7, h: 1.2,
  fill: { color: "EFF6FF" }, rectRadius: 0.1,
  line: { color: "BFDBFE", width: 1 },
});
s3.addText(
  "面向政务产品研发团队的 B 端迭代管理看板，部署在 WPS 365 智能应用平台，\n将分散在多维表格中的需求、里程碑、风险数据汇聚为一张实时管理驾驶舱。",
  {
    x: 1.1, y: 2.2, w: 11.1, h: 1.0,
    fontSize: 16, color: C.dark, fontFace: "Microsoft YaHei",
    lineSpacing: 28,
  }
);
const posItems = [
  { icon: "📊", title: "管理驾驶舱", desc: "一屏掌握全局进度与风险" },
  { icon: "🔗", title: "数据零迁移", desc: "数据仍在WPS表格维护，看板只读展示" },
  { icon: "🏛️", title: "政务风格", desc: "简洁、专业、规整，适合日常查看和汇报" },
];
posItems.forEach((item, i) => {
  const x = 0.8 + i * 4.0;
  s3.addShape(pptx.ShapeType.roundRect, {
    x, y: 3.8, w: 3.7, h: 2.8,
    fill: { color: C.white },
    rectRadius: 0.1,
    shadow: { type: "outer", blur: 6, offset: 2, color: "D0D5DD", opacity: 0.3 },
  });
  s3.addText(item.icon, { x, y: 4.0, w: 3.7, h: 0.7, fontSize: 32, align: "center" });
  s3.addText(item.title, {
    x, y: 4.7, w: 3.7, h: 0.5,
    fontSize: 16, color: C.dark, bold: true, fontFace: "Microsoft YaHei", align: "center",
  });
  s3.addText(item.desc, {
    x: x + 0.3, y: 5.3, w: 3.1, h: 1.0,
    fontSize: 13, color: C.gray, fontFace: "Microsoft YaHei", align: "center",
    lineSpacing: 22,
  });
});
addFooter(s3, 3, TOTAL);

// ========== Slide 4: 建设背景 ==========
const s4 = pptx.addSlide();
addBg(s4);
addHeader(s4, "02  建设背景与痛点");
const bgRows = [
  ["维度", "说明"],
  ["业务背景", "2026年政务产品研发迭代规划，需求按月度排期，需跨月追踪进度、里程碑和风险"],
  ["数据现状", "原始数据维护在WPS多维表格(dbsheet)中，分三张表：需求(2000+)、里程碑(200)、风险(50)"],
  ["核心痛点", "表格适合录入，不适合一眼看全局；月度进度、风险状态、里程碑节点分散，汇报和决策成本高"],
  ["解决思路", "基于WPS365 SDK读取多维表格，前端做聚合、加权计算和可视化展示，数据仍由表格维护"],
];
s4.addTable(bgRows, {
  x: 0.6, y: 1.5, w: 12.1,
  fontSize: 13, fontFace: "Microsoft YaHei",
  colW: [1.8, 10.3],
  border: { type: "solid", color: "E4ECFC", pt: 0.5 },
  rowH: [0.5, 0.7, 0.7, 0.7, 0.7],
  color: C.dark,
  autoPage: false,
  headerRow: true,
});
s4.addShape(pptx.ShapeType.roundRect, {
  x: 0.6, y: 5.2, w: 12.1, h: 1.5,
  fill: { color: "FEF3C7" }, rectRadius: 0.1,
  line: { color: "FDE68A", width: 1 },
});
s4.addText("💡 核心理念：不改变现有工作流，表格继续用来录入，看板只做可视化聚合展示", {
  x: 1.0, y: 5.4, w: 11.3, h: 0.5,
  fontSize: 15, color: "92400E", bold: true, fontFace: "Microsoft YaHei",
});
s4.addText("数据来源：同一份WPS多维表格，Sheet 21(需求)、Sheet 23(里程碑)、Sheet 24(风险)", {
  x: 1.0, y: 6.0, w: 11.3, h: 0.4,
  fontSize: 13, color: "92400E", fontFace: "Microsoft YaHei",
});
addFooter(s4, 4, TOTAL);

// ========== Slide 5: 迭代概览 ==========
const s5 = pptx.addSlide();
addBg(s5);
addHeader(s5, "03  核心功能 — 迭代概览");
s5.addText("全局驾驶舱，一屏掌握整体情况", {
  x: 0.8, y: 1.4, w: 11.5, h: 0.4,
  fontSize: 14, color: C.gray, italic: true, fontFace: "Microsoft YaHei",
});
const overviewCards = [
  { title: "需求总数", icon: "📋", color: C.blue, desc: "全量需求统计\n可点击跳转列表" },
  { title: "已完成", icon: "✅", color: C.green, desc: "已发布需求数\n带条件跳转" },
  { title: "剩余风险", icon: "⚠️", color: C.red, desc: "未关闭/未规避\n活跃风险计数" },
  { title: "完成进度", icon: "📈", color: C.accent, desc: "状态加权算法\n非简单计数" },
];
overviewCards.forEach((card, i) => {
  const x = 0.6 + i * 3.1;
  s5.addShape(pptx.ShapeType.roundRect, {
    x, y: 2.1, w: 2.9, h: 2.6,
    fill: { color: C.white }, rectRadius: 0.1,
    shadow: { type: "outer", blur: 6, offset: 2, color: "D0D5DD", opacity: 0.3 },
    line: { color: "E4ECFC", width: 0.5 },
  });
  s5.addText(card.icon, { x, y: 2.2, w: 2.9, h: 0.6, fontSize: 28, align: "center" });
  s5.addText(card.title, {
    x, y: 2.8, w: 2.9, h: 0.45,
    fontSize: 15, color: card.color, bold: true, fontFace: "Microsoft YaHei", align: "center",
  });
  s5.addText(card.desc, {
    x: x + 0.2, y: 3.4, w: 2.5, h: 1.0,
    fontSize: 12, color: C.gray, fontFace: "Microsoft YaHei", align: "center", lineSpacing: 20,
  });
});
s5.addText("更多能力", {
  x: 0.8, y: 5.0, w: 3, h: 0.4,
  fontSize: 14, color: C.accent, bold: true, fontFace: "Microsoft YaHei",
});
const moreItems = [
  "状态分布柱状图，支持 hover 查看各状态具体数量",
  "风险跟踪模块：按应对策略分组，展示活跃风险并关联 ONES 需求",
  "指标卡可点击跳转需求列表，自动带上筛选条件",
];
moreItems.forEach((item, i) => {
  s5.addText(`●  ${item}`, {
    x: 1.0, y: 5.5 + i * 0.45, w: 11, h: 0.42,
    fontSize: 13, color: C.dark, fontFace: "Microsoft YaHei",
  });
});
addFooter(s5, 5, TOTAL);

// ========== Slide 6: 月度迭代 ==========
const s6 = pptx.addSlide();
addBg(s6);
addHeader(s6, "04  核心功能 — 月度迭代情况");
// 全部视图
s6.addShape(pptx.ShapeType.roundRect, {
  x: 0.5, y: 1.5, w: 5.8, h: 5.0,
  fill: { color: "F8FAFC" }, rectRadius: 0.1,
  line: { color: "E4ECFC", width: 1 },
});
s6.addText("「全部」视图", {
  x: 0.8, y: 1.6, w: 5.2, h: 0.45,
  fontSize: 15, color: C.accent, bold: true, fontFace: "Microsoft YaHei",
});
const allViewItems = [
  "各月卡片概览",
  "进度百分比 + 状态分布标签",
  "里程碑数量 + 风险数量",
  "点击卡片进入详情",
];
allViewItems.forEach((item, i) => {
  s6.addText(`▸  ${item}`, {
    x: 1.0, y: 2.3 + i * 0.45, w: 5.0, h: 0.42,
    fontSize: 13, color: C.dark, fontFace: "Microsoft YaHei",
  });
});
// 单月详情
s6.addShape(pptx.ShapeType.roundRect, {
  x: 6.8, y: 1.5, w: 6.0, h: 5.0,
  fill: { color: "F8FAFC" }, rectRadius: 0.1,
  line: { color: "E4ECFC", width: 1 },
});
s6.addText("单月详情视图", {
  x: 7.1, y: 1.6, w: 5.4, h: 0.45,
  fontSize: 15, color: C.accent, bold: true, fontFace: "Microsoft YaHei",
});
const detailItems = [
  "进度（含权重说明 Popover）",
  "状态分布饼图 + 数值表格",
  "里程碑进展（已完成自动折叠）",
  "延期完成项特殊标记",
  "风险跟踪模块",
  "需求列表（可跳转）",
  "里程碑完成数 / 未关闭风险数",
];
detailItems.forEach((item, i) => {
  s6.addText(`▸  ${item}`, {
    x: 7.3, y: 2.3 + i * 0.42, w: 5.2, h: 0.4,
    fontSize: 13, color: C.dark, fontFace: "Microsoft YaHei",
  });
});
addFooter(s6, 6, TOTAL);

// ========== Slide 7: 需求列表 & 里程碑 ==========
const s7 = pptx.addSlide();
addBg(s7);
addHeader(s7, "05  核心功能 — 需求列表 & 里程碑");
// 需求列表
s7.addShape(pptx.ShapeType.roundRect, {
  x: 0.5, y: 1.5, w: 5.8, h: 5.0,
  fill: { color: C.white }, rectRadius: 0.1,
  shadow: { type: "outer", blur: 4, offset: 2, color: "D0D5DD", opacity: 0.2 },
});
s7.addText("📋  需求列表", {
  x: 0.8, y: 1.6, w: 5.2, h: 0.5,
  fontSize: 16, color: C.dark, bold: true, fontFace: "Microsoft YaHei",
});
const reqFeatures = [
  "多维度筛选：迭代月份、状态、负责人",
  "全文搜索：标题/ONES ID/状态/项目/负责人",
  "分页展示，每页20条",
  "从概览页带条件跳转",
  "每条需求可跳转ONES链接",
];
reqFeatures.forEach((item, i) => {
  s7.addText(`●  ${item}`, {
    x: 1.0, y: 2.3 + i * 0.45, w: 5.0, h: 0.42,
    fontSize: 12, color: C.dark, fontFace: "Microsoft YaHei",
  });
});
// 里程碑
s7.addShape(pptx.ShapeType.roundRect, {
  x: 6.8, y: 1.5, w: 6.0, h: 5.0,
  fill: { color: C.white }, rectRadius: 0.1,
  shadow: { type: "outer", blur: 4, offset: 2, color: "D0D5DD", opacity: 0.2 },
});
s7.addText("🎯  里程碑", {
  x: 7.1, y: 1.6, w: 5.4, h: 0.5,
  fontSize: 16, color: C.dark, bold: true, fontFace: "Microsoft YaHei",
});
s7.addText("单月视图", {
  x: 7.3, y: 2.3, w: 5, h: 0.4,
  fontSize: 13, color: C.accent, bold: true, fontFace: "Microsoft YaHei",
});
s7.addText("时间轴样式，展示计划/实际时间与延期情况", {
  x: 7.3, y: 2.7, w: 5, h: 0.4,
  fontSize: 12, color: C.gray, fontFace: "Microsoft YaHei",
});
s7.addText("全部视图 — 自然时间视图", {
  x: 7.3, y: 3.3, w: 5, h: 0.4,
  fontSize: 13, color: C.accent, bold: true, fontFace: "Microsoft YaHei",
});
const mileFeatures = [
  "按 已逾期→今日→明日→本周→本月→下月→已完成 分组",
  "顶部高亮「下一个里程碑」卡片",
  "快捷筛选：全部 / 近7天 / 待完成",
  "名称搜索 + 标注所属迭代",
  "状态颜色：绿(完成) 蓝(进行) 橙(待开始) 红(逾期)",
];
mileFeatures.forEach((item, i) => {
  s7.addText(`●  ${item}`, {
    x: 7.5, y: 3.8 + i * 0.42, w: 5, h: 0.4,
    fontSize: 11, color: C.dark, fontFace: "Microsoft YaHei",
  });
});
addFooter(s7, 7, TOTAL);

// ========== Slide 8: 技术架构 ==========
const s8 = pptx.addSlide();
addBg(s8);
addHeader(s8, "06  技术架构");
const layers = [
  { label: "部署层", detail: "WPS 365 智能应用平台 (o.wpsgo.com)\n前端 → Nginx 静态    后端 → Node 服务", color: "1E3A5F", y: 1.5 },
  { label: "前端", detail: "React 19 · TypeScript · Vite 6 · Tailwind CSS 4\nshadcn/ui · Lucide Icons · React Router 7", color: C.accent, y: 3.0 },
  { label: "后端", detail: "Nitro 2 (Node preset) · TypeScript\nOAuth 回调 · Capability 代理 · 健康检查", color: "0891B2", y: 4.5 },
  { label: "数据源", detail: "WPS 多维表格 (dbsheet)\n权限: kso.dbsheet.readwrite", color: C.green, y: 6.0 },
];
layers.forEach((layer) => {
  s8.addShape(pptx.ShapeType.roundRect, {
    x: 1.5, y: layer.y, w: 10.3, h: 1.2,
    fill: { color: C.white }, rectRadius: 0.08,
    line: { color: layer.color, width: 1.5 },
  });
  s8.addShape(pptx.ShapeType.roundRect, {
    x: 1.5, y: layer.y, w: 2.0, h: 1.2,
    fill: { color: layer.color }, rectRadius: 0.08,
  });
  s8.addText(layer.label, {
    x: 1.5, y: layer.y + 0.1, w: 2.0, h: 1.0,
    fontSize: 14, color: C.white, bold: true, fontFace: "Microsoft YaHei", align: "center",
    valign: "middle",
  });
  s8.addText(layer.detail, {
    x: 3.8, y: layer.y + 0.1, w: 7.8, h: 1.0,
    fontSize: 13, color: C.dark, fontFace: "Microsoft YaHei", lineSpacing: 22,
    valign: "middle",
  });
});
// 箭头
[2.85, 4.35].forEach((y) => {
  s8.addText("▼", {
    x: 6.2, y, w: 1, h: 0.3,
    fontSize: 16, color: C.gray, align: "center",
  });
});
s8.addText("▼  OAuth + API 代理", {
  x: 5.2, y: 5.85, w: 3, h: 0.3,
  fontSize: 11, color: C.gray, align: "center",
});
addFooter(s8, 8, TOTAL);

// ========== Slide 9: 数据模型与算法 ==========
const s9 = pptx.addSlide();
addBg(s9);
addHeader(s9, "07  数据模型与核心算法");
const dataRows = [
  [{ text: "数据类型", options: { bold: true } }, { text: "主要字段", options: { bold: true } }, { text: "统计能力", options: { bold: true } }],
  ["需求", "标题、状态、优先级、项目、迭代月份\n开发/测试负责人、ONES ID", "按状态加权进度\n按月聚合、完成率"],
  ["里程碑", "名称、计划/实际时间、状态\n所属迭代、备注", "逾期判断、时间分组\n完成/待办统计"],
  ["风险", "事项、状态、提报日期\n归属产品、应对策略、关联ONES", "活跃风险计数\n策略分组、需求关联"],
];
s9.addTable(dataRows, {
  x: 0.5, y: 1.4, w: 12.3,
  fontSize: 12, fontFace: "Microsoft YaHei",
  colW: [1.8, 5.0, 5.5],
  border: { type: "solid", color: "E4ECFC", pt: 0.5 },
  rowH: [0.45, 0.8, 0.8, 0.8],
  color: C.dark,
  autoPage: false,
});
s9.addText("核心算法", {
  x: 0.8, y: 4.3, w: 4, h: 0.4,
  fontSize: 15, color: C.accent, bold: true, fontFace: "Microsoft YaHei",
});
const algos = [
  ["进度权重", "按需求阶段映射累计进度（开发中40%、测试中77%、已发布100%），公式：Σ(状态进度)÷需求总数"],
  ["风险判定", "排除「已解除/已关闭/已完成」，其余（含未规避、未关闭）计为活跃风险"],
  ["里程碑有效性", "必须有计划时间才算里程碑，无计划时间的不纳入统计"],
  ["工作日计算", "里程碑延期天数考虑2026年法定节假日与调休上班日"],
];
algos.forEach(([title, desc], i) => {
  s9.addShape(pptx.ShapeType.roundRect, {
    x: 0.5, y: 4.9 + i * 0.58, w: 12.3, h: 0.52,
    fill: { color: i % 2 === 0 ? "F1F5FD" : C.white }, rectRadius: 0.05,
  });
  s9.addText(title, {
    x: 0.7, y: 4.92 + i * 0.58, w: 2.0, h: 0.48,
    fontSize: 12, color: C.accent, bold: true, fontFace: "Microsoft YaHei", valign: "middle",
  });
  s9.addText(desc, {
    x: 2.8, y: 4.92 + i * 0.58, w: 9.8, h: 0.48,
    fontSize: 11, color: C.dark, fontFace: "Microsoft YaHei", valign: "middle",
  });
});
addFooter(s9, 9, TOTAL);

// ========== Slide 10: 业务价值 ==========
const s10 = pptx.addSlide();
addBg(s10);
addHeader(s10, "08  业务价值");
const values = [
  { icon: "⚡", title: "汇报效率提升", desc: "从翻表汇总 → 打开看板即得全局数据\n汇报准备时间大幅缩短", color: C.blue },
  { icon: "🔍", title: "风险可见性", desc: "未关闭风险集中展示\n避免遗漏，防患于未然", color: C.red },
  { icon: "🎯", title: "里程碑聚焦", desc: "按自然时间排序，近期节点置顶\n打开就知道下一步做什么", color: C.green },
  { icon: "🔄", title: "数据一致性", desc: "看板只读表格，维护仍在原表\n零迁移成本，无需双写", color: C.amber },
];
values.forEach((v, i) => {
  const x = 0.5 + (i % 2) * 6.3;
  const y = 1.5 + Math.floor(i / 2) * 2.7;
  s10.addShape(pptx.ShapeType.roundRect, {
    x, y, w: 5.9, h: 2.3,
    fill: { color: C.white }, rectRadius: 0.1,
    shadow: { type: "outer", blur: 6, offset: 2, color: "D0D5DD", opacity: 0.3 },
    line: { color: "E4ECFC", width: 0.5 },
  });
  s10.addText(v.icon, {
    x: x + 0.3, y: y + 0.3, w: 1, h: 0.7, fontSize: 32,
  });
  s10.addText(v.title, {
    x: x + 1.3, y: y + 0.3, w: 4.2, h: 0.5,
    fontSize: 17, color: v.color, bold: true, fontFace: "Microsoft YaHei",
  });
  s10.addText(v.desc, {
    x: x + 1.3, y: y + 0.9, w: 4.2, h: 1.2,
    fontSize: 13, color: C.gray, fontFace: "Microsoft YaHei", lineSpacing: 22,
  });
});
addFooter(s10, 10, TOTAL);

// ========== Slide 11: 使用方式 ==========
const s11 = pptx.addSlide();
addBg(s11);
addHeader(s11, "09  使用与获取方式");
// 线上
s11.addShape(pptx.ShapeType.roundRect, {
  x: 0.5, y: 1.5, w: 5.8, h: 3.0,
  fill: { color: "EFF6FF" }, rectRadius: 0.1,
  line: { color: "BFDBFE", width: 1 },
});
s11.addText("🌐  线上使用", {
  x: 0.8, y: 1.6, w: 5.2, h: 0.5,
  fontSize: 16, color: C.accent, bold: true, fontFace: "Microsoft YaHei",
});
s11.addText("访问地址：", {
  x: 0.8, y: 2.2, w: 5.2, h: 0.35,
  fontSize: 12, color: C.gray, fontFace: "Microsoft YaHei",
});
s11.addText("https://o.wpsgo.com/app/41000207/9w1qvC8NVtKs/", {
  x: 0.8, y: 2.6, w: 5.2, h: 0.4,
  fontSize: 11, color: C.accent, fontFace: "Microsoft YaHei", bold: true,
});
s11.addText("首次使用触发 WPS OAuth 授权\n授权后即可读取多维表格数据\n页面右上角「刷新数据」可手动重新拉取", {
  x: 0.8, y: 3.2, w: 5.2, h: 1.0,
  fontSize: 12, color: C.dark, fontFace: "Microsoft YaHei", lineSpacing: 22,
});
// 本地开发
s11.addShape(pptx.ShapeType.roundRect, {
  x: 6.8, y: 1.5, w: 6.0, h: 3.0,
  fill: { color: "F0FDF4" }, rectRadius: 0.1,
  line: { color: "BBF7D0", width: 1 },
});
s11.addText("💻  本地开发", {
  x: 7.1, y: 1.6, w: 5.4, h: 0.5,
  fontSize: 16, color: C.green, bold: true, fontFace: "Microsoft YaHei",
});
s11.addText("环境要求：Node.js ≥ 20、pnpm", {
  x: 7.1, y: 2.2, w: 5.4, h: 0.35,
  fontSize: 12, color: C.gray, fontFace: "Microsoft YaHei",
});
s11.addText("pnpm install          # 安装依赖\npnpm run dev          # 启动开发环境\npnpm run check:types  # 类型检查\npnpm run pack         # 打包部署", {
  x: 7.1, y: 2.8, w: 5.4, h: 1.4,
  fontSize: 11, color: C.dark, fontFace: "Consolas", lineSpacing: 22,
});
// 打包部署
s11.addShape(pptx.ShapeType.roundRect, {
  x: 0.5, y: 4.8, w: 12.3, h: 1.8,
  fill: { color: "FFFBEB" }, rectRadius: 0.1,
  line: { color: "FDE68A", width: 1 },
});
s11.addText("📦  打包部署", {
  x: 0.8, y: 4.9, w: 5, h: 0.5,
  fontSize: 16, color: "92400E", bold: true, fontFace: "Microsoft YaHei",
});
s11.addText("pnpm run pack 生成：\n  ·  .publish/dist-frontend.zip（前端静态资源）\n  ·  .publish/dist-server.zip（后端 Node 服务）\n上传至 WPS 365 智能应用平台对应运行时即可更新线上版本", {
  x: 0.8, y: 5.4, w: 11.8, h: 1.1,
  fontSize: 12, color: "78350F", fontFace: "Microsoft YaHei", lineSpacing: 20,
});
addFooter(s11, 11, TOTAL + 1);

// ========== Slide 12: 总结 ==========
const s12 = pptx.addSlide();
s12.addShape(pptx.ShapeType.rect, {
  x: 0, y: 0, w: 13.33, h: 7.5,
  fill: { color: C.primary },
});
s12.addShape(pptx.ShapeType.rect, {
  x: 0, y: 5.8, w: 13.33, h: 1.7,
  fill: { color: "162D4A" },
});
s12.addText("总结", {
  x: 1, y: 1.2, w: 11.33, h: 0.7,
  fontSize: 28, color: "94A3B8", fontFace: "Microsoft YaHei", align: "center",
});
s12.addShape(pptx.ShapeType.roundRect, {
  x: 1.5, y: 2.2, w: 10.33, h: 2.6,
  fill: { color: "1E3A5F" }, rectRadius: 0.15,
  line: { color: "2563EB", width: 1.5 },
});
s12.addText(
  "政务产研迭代进度看板\n=\nWPS 多维表格数据 + WPS365 智能应用 + 状态加权进度算法",
  {
    x: 2, y: 2.4, w: 9.33, h: 1.5,
    fontSize: 20, color: C.white, fontFace: "Microsoft YaHei",
    align: "center", lineSpacing: 36, bold: true,
  }
);
s12.addText("为 2026 政务产品研发迭代提供「需求 — 里程碑 — 风险」三位一体的实时管理驾驶舱", {
  x: 2, y: 4.0, w: 9.33, h: 0.6,
  fontSize: 14, color: "94A3B8", fontFace: "Microsoft YaHei", align: "center",
});
s12.addText("感谢关注", {
  x: 1, y: 5.2, w: 11.33, h: 0.5,
  fontSize: 18, color: "CBD5E1", fontFace: "Microsoft YaHei", align: "center",
});
s12.addText("https://o.wpsgo.com/app/41000207/9w1qvC8NVtKs/", {
  x: 1, y: 6.2, w: 11.33, h: 0.4,
  fontSize: 13, color: "94A3B8", fontFace: "Microsoft YaHei", align: "center",
});
addFooter(s12, 12, TOTAL + 2);

// ========== 输出 ==========
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const outPath = resolve(__dirname, "..", "政务产研迭代进度看板.pptx");

const data = await pptx.write({ outputType: "nodebuffer" });
writeFileSync(outPath, data);
console.log("✅ PPT 已生成：" + outPath);
