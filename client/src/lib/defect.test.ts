import { describe, expect, it } from "vitest";
import {
  ALL_TEAMS,
  SEED_DEFECTS,
  computeDefectStats,
  filterDefects,
  formatRemindMessage,
  isOverdue,
  isTaskDue,
  matchTaskDefects,
  nextBugId,
  type DefectRemindTask,
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

function sampleTask(overrides: Partial<DefectRemindTask> = {}): DefectRemindTask {
  return {
    id: "t1",
    name: "未修复缺陷提醒",
    team: ALL_TEAMS,
    frequency: "daily",
    startDate: "2026-09-01",
    endDate: "2026-09-30",
    webhook: "https://example.com/hook",
    enabled: true,
    severities: ["S-致命", "A-严重"],
    iterations: [],
    remindTimes: [],
    template: "default",
    includeDetail: true,
    includeDeadline: true,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    lastRunAt: null,
    lastRunStatus: null,
    lastRunMessage: null,
    ...overrides,
  };
}

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

  it("counts unrepaired fatal defects", () => {
    const stats = computeDefectStats(SAMPLE_DEFECTS);
    expect(stats.total).toBe(7);
    expect(stats.unrepaired).toBe(5);
    expect(stats.fatal).toBe(3);
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

describe("matchTaskDefects", () => {
  it("keeps unrepaired defects in the team and severity set", () => {
    const rows = matchTaskDefects({
      defects: SAMPLE_DEFECTS,
      team: "政务AI",
      severities: ["S-致命", "A-严重"],
    });
    expect(rows.map((item) => item.bugId).sort()).toEqual(["1001", "1004"]);
  });
});

describe("isTaskDue", () => {
  it("is due when never run inside the date window", () => {
    expect(isTaskDue(sampleTask(), now)).toBe(true);
  });

  it("is not due on the same calendar day after a successful run", () => {
    expect(isTaskDue(sampleTask({ lastRunAt: "2026-09-14T02:00:00.000Z" }), now)).toBe(false);
  });

  it("skips weekends for weekdays frequency", () => {
    const saturday = new Date("2026-09-12T10:00:00+08:00");
    expect(isTaskDue(sampleTask({ frequency: "weekdays" }), saturday)).toBe(false);
  });

  it("runs weekly only after 7 days", () => {
    expect(isTaskDue(sampleTask({
      frequency: "weekly",
      lastRunAt: "2026-09-10T02:00:00.000Z",
    }), now)).toBe(false);
    expect(isTaskDue(sampleTask({
      frequency: "weekly",
      lastRunAt: "2026-09-06T02:00:00.000Z",
    }), now)).toBe(true);
  });
});

// now = 2026-09-14 16:20 (北京时间)，对应槽位 16:00
describe("isTaskDue 提醒时刻（30 分钟槽位）", () => {
  it("空 remindTimes 视为不限时刻，旧记录行为不变", () => {
    expect(isTaskDue(sampleTask({ remindTimes: [] }), now)).toBe(true);
  });

  it("单时刻：命中当前槽位才发，否则不发", () => {
    expect(isTaskDue(sampleTask({ remindTimes: ["16:00"] }), now)).toBe(true);
    expect(isTaskDue(sampleTask({ remindTimes: ["09:00"] }), now)).toBe(false);
  });

  it("时刻向下对齐到 30 分钟槽位，不是精确匹配", () => {
    const at1640 = new Date("2026-09-14T16:40:00+08:00");
    expect(isTaskDue(sampleTask({ remindTimes: ["16:30"] }), at1640)).toBe(true);
    expect(isTaskDue(sampleTask({ remindTimes: ["16:30"] }), now)).toBe(false);
  });

  it("多时刻：当天已发过早上的，晚上到点仍要发", () => {
    expect(isTaskDue(sampleTask({
      remindTimes: ["09:00", "16:00"],
      lastRunAt: "2026-09-14T01:05:00.000Z",
    }), now)).toBe(true);
  });

  it("同一（日, 槽位）只发一次", () => {
    expect(isTaskDue(sampleTask({
      remindTimes: ["09:00", "16:00"],
      lastRunAt: "2026-09-14T08:05:00.000Z",
    }), now)).toBe(false);
  });

  it("单时刻任务当天已发过就不再发（保持旧的当天只发一次）", () => {
    expect(isTaskDue(sampleTask({
      remindTimes: ["16:00"],
      lastRunAt: "2026-09-14T01:05:00.000Z",
    }), now)).toBe(false);
  });

  it("多维表墙钟串 lastRunAt 按北京时间解析，不被当成本地时间而跨天错位", () => {
    expect(isTaskDue(sampleTask({
      remindTimes: ["16:00"],
      lastRunAt: "2026-09-14 09:05",
    }), now)).toBe(false);
  });

  it("仅一次：到设定时刻才发，且执行过就不再发", () => {
    const once = { frequency: "once" as const, remindTimes: ["16:00"] };
    expect(isTaskDue(sampleTask(once), now)).toBe(true);
    expect(isTaskDue(sampleTask({ ...once, remindTimes: ["09:00"] }), now)).toBe(false);
    expect(isTaskDue(sampleTask({ ...once, lastRunAt: "2026-09-14T01:05:00.000Z" }), now)).toBe(false);
  });

  it("每周 + 多时刻：同日续跑不受 7 天限制拦截", () => {
    expect(isTaskDue(sampleTask({
      frequency: "weekly",
      remindTimes: ["09:00", "16:00"],
      lastRunAt: "2026-09-14T01:05:00.000Z",
    }), now)).toBe(true);
  });

  it("未对齐到槽位的脏值不会被误命中（归一化在服务端读写时完成）", () => {
    expect(isTaskDue(sampleTask({ remindTimes: ["16:07"] }), now)).toBe(false);
  });
});

describe("formatRemindMessage", () => {
  it("renders a preview with counts and defect lines", () => {
    const text = formatRemindMessage({
      defects: SAMPLE_DEFECTS.slice(0, 2),
      task: {
        name: "一键提醒未修复缺陷",
        team: ALL_TEAMS,
        template: "default",
        includeDetail: true,
        includeDeadline: true,
      },
      now,
    });
    expect(text).toContain("【一键提醒未修复缺陷】");
    expect(text).toContain("未修复 2 条");
    expect(text).toContain("1001");
    expect(text).toContain("张明");
    expect(text).toContain("截止 2026-09-15");
  });
});

describe("nextBugId", () => {
  it("starts from 1001 when the list is empty", () => {
    expect(nextBugId([])).toBe("1001");
  });
});
