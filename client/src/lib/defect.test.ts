import { describe, expect, it } from "vitest";
import {
  SEED_DEFECTS,
  computeDefectStats,
  filterDefects,
  isOverdue,
  nextBugId,
  type DefectRow,
} from "@/lib/defect";

const now = new Date("2026-09-14T16:20:00+08:00");

const SAMPLE_DEFECTS: DefectRow[] = [
  { id: "d1", bugId: "1001", title: "登录页验证码刷新按钮点击无响应", priority: "最高", severity: "S-致命", status: "待处理", team: "政务AI", iteration: "V2.4", module: "用户认证", owner: "张明", reporter: "赵强", createdAt: "2026-09-10 09:23", deadline: "2026-09-15" },
  { id: "d3", bugId: "1003", title: "审批流流程节点配置后不生效", priority: "最高", severity: "S-致命", status: "处理中", team: "政务协作", iteration: "V2.4", module: "工作流引擎", owner: "王芳", reporter: "陈杰", createdAt: "2026-09-08 11:30", deadline: "2026-09-14" },
  { id: "d4", bugId: "1004", title: "短信验证码重复发送导致限流", priority: "较高", severity: "A-严重", status: "待处理", team: "政务AI", iteration: "V2.5", module: "用户认证", owner: "张明", reporter: "赵强", createdAt: "2026-09-11 10:02", deadline: "2026-09-17" },
  { id: "d6", bugId: "1006", title: "并行审批时会签节点丢失意见", priority: "最高", severity: "S-致命", status: "待处理", team: "政务协作", iteration: "V2.4", module: "工作流引擎", owner: "王芳", reporter: "陈杰", createdAt: "2026-09-07 09:18", deadline: "2026-09-13" },
  { id: "d7", bugId: "1007", title: "站内信未读红点数量不刷新", priority: "普通", severity: "B-一般", status: "待处理", team: "政务协作", iteration: "V2.5", module: "消息中心", owner: "刘洋", reporter: "孙倩", createdAt: "2026-09-13 08:55", deadline: "2026-09-22" },
  { id: "d13", bugId: "1013", title: "工作流超时提醒未触发", priority: "较高", severity: "A-严重", status: "已修复", team: "政务协作", iteration: "V2.3", module: "工作流引擎", owner: "王芳", reporter: "陈杰", createdAt: "2026-09-03 17:28", deadline: "2026-09-11" },
  { id: "d14", bugId: "1014", title: "导出记录筛选日期跨月查询为空", priority: "最低", severity: "C-低", status: "已修复", team: "WPS政务365", iteration: "V2.3", module: "数据导出", owner: "李华", reporter: "周敏", createdAt: "2026-09-02 09:36", deadline: "2026-09-10" },
];

describe("SEED_DEFECTS", () => {
  it("does not ship mock defects", () => {
    expect(SEED_DEFECTS).toEqual([]);
  });
});

describe("computeDefectStats", () => {
  it("returns zeros for an empty list", () => {
    expect(computeDefectStats([])).toEqual({
      total: 0,
      pending: 0,
      processing: 0,
      unrepaired: 0,
      fatal: 0,
      resolved: 0,
      fixRate: 0,
    });
  });

  it("counts unrepaired severe defects", () => {
    const stats = computeDefectStats(SAMPLE_DEFECTS);
    expect(stats.total).toBe(7);
    expect(stats.unrepaired).toBe(5);
    // 「严重缺陷」卡片与筛选口径一致：S-致命 + A-严重 且未修复
    expect(stats.fatal).toBe(4);
    expect(stats.resolved).toBe(2);
  });
});

describe("filterDefects", () => {
  it("searches by bug id or title", () => {
    const rows = filterDefects({ defects: SAMPLE_DEFECTS, search: "1001" });
    expect(rows.map((item) => item.bugId)).toEqual(["1001"]);
  });

  it("filters by team", () => {
    const rows = filterDefects({ defects: SAMPLE_DEFECTS, teams: ["政务协作"] });
    expect(rows.every((item) => item.team === "政务协作")).toBe(true);
    expect(rows.map((item) => item.bugId).sort()).toEqual([
      "1003", "1006", "1007", "1013",
    ]);
  });

  it("filters by iteration and keeps defects without iteration only when unfiltered", () => {
    const v24 = filterDefects({ defects: SAMPLE_DEFECTS, iterations: ["V2.4"] });
    expect(v24.map((item) => item.bugId).sort()).toEqual(["1001", "1003", "1006"]);

    const blank = { id: "d9", bugId: "1009", title: "无迭代缺陷", priority: "普通", severity: "B-一般", status: "待处理", team: "政务AI", iteration: "", module: "用户认证", owner: "张明", reporter: "赵强", createdAt: "2026-09-12 10:00", deadline: "" } as DefectRow;
    const withBlank = filterDefects({ defects: [...SAMPLE_DEFECTS, blank], iterations: ["V2.4"] });
    expect(withBlank).not.toContain(blank);

    const all = filterDefects({ defects: [...SAMPLE_DEFECTS, blank] });
    expect(all).toContain(blank);
  });

  it("searches within iteration field", () => {
    const rows = filterDefects({ defects: SAMPLE_DEFECTS, search: "v2.3" });
    expect(rows.map((item) => item.bugId).sort()).toEqual(["1013", "1014"]);
  });
});

describe("isOverdue", () => {
  it("marks unrepaired defects past deadline", () => {
    const overdue = SAMPLE_DEFECTS.find((item) => item.bugId === "1006");
    expect(overdue).toBeTruthy();
    expect(isOverdue(overdue!, now)).toBe(true);
  });

  it("does not mark resolved defects as overdue", () => {
    const resolved = SAMPLE_DEFECTS.find((item) => item.bugId === "1014");
    expect(isOverdue(resolved!, now)).toBe(false);
  });
});

describe("nextBugId", () => {
  it("starts from 1001 when the list is empty", () => {
    expect(nextBugId([])).toBe("1001");
  });
});
