import { describe, expect, it } from "vitest";
import { isTaskDue, parseRunAt, shanghaiSlot } from "./defect-remind";
import { normalizeRemindTimes } from "./remind-task-dbsheet";
import type { DefectRemindTask } from "./defect-remind-store";

function task(overrides: Partial<DefectRemindTask> = { }): DefectRemindTask {
  return {
    id: "t1",
    name: "未修复缺陷提醒",
    team: "全部团队",
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

// 2026-09-14 是周一，16:20 北京时间 → 槽位 16:00
const now = new Date("2026-09-14T16:20:00+08:00");

describe("shanghaiSlot", () => {
  it("向下对齐到 30 分钟槽位", () => {
    expect(shanghaiSlot(new Date("2026-09-14T16:00:00+08:00"))).toBe("16:00");
    expect(shanghaiSlot(new Date("2026-09-14T16:29:59+08:00"))).toBe("16:00");
    expect(shanghaiSlot(new Date("2026-09-14T16:30:00+08:00"))).toBe("16:30");
    expect(shanghaiSlot(new Date("2026-09-14T16:59:59+08:00"))).toBe("16:30");
  });

  it("按北京时间取时刻，零点不渲染成 24:00", () => {
    // 2026-09-14T16:00:00Z = 2026-09-15 00:00 北京时间
    expect(shanghaiSlot(new Date("2026-09-14T16:00:00Z"))).toBe("00:00");
    expect(shanghaiSlot(new Date("2026-09-14T15:59:00Z"))).toBe("23:30");
  });
});

describe("parseRunAt", () => {
  it("多维表墙钟串按北京时间解析，不被当成本地时间", () => {
    expect(parseRunAt("2026-09-14 09:05")?.toISOString()).toBe("2026-09-14T01:05:00.000Z");
    expect(parseRunAt("2026-09-14")?.toISOString()).toBe("2026-09-13T16:00:00.000Z");
  });

  it("斜杠格式与带时区的 ISO 串都能解析", () => {
    expect(parseRunAt("2026/09/14 09:05")?.toISOString()).toBe("2026-09-14T01:05:00.000Z");
    expect(parseRunAt("2026-09-14T01:05:00.000Z")?.toISOString()).toBe("2026-09-14T01:05:00.000Z");
  });

  it("无法解析时返回 null", () => {
    expect(parseRunAt("")).toBeNull();
    expect(parseRunAt("not-a-date")).toBeNull();
  });
});

describe("isTaskDue 提醒时刻（30 分钟槽位）", () => {
  it("空 remindTimes 视为不限时刻，旧记录行为不变", () => {
    expect(isTaskDue(task({ remindTimes: [] }), now)).toBe(true);
  });

  it("单时刻：命中当前槽位才发", () => {
    expect(isTaskDue(task({ remindTimes: ["16:00"] }), now)).toBe(true);
    expect(isTaskDue(task({ remindTimes: ["09:00"] }), now)).toBe(false);
  });

  it("时刻按槽位比较，不是精确匹配", () => {
    const at1640 = new Date("2026-09-14T16:40:00+08:00");
    expect(isTaskDue(task({ remindTimes: ["16:30"] }), at1640)).toBe(true);
    expect(isTaskDue(task({ remindTimes: ["16:30"] }), now)).toBe(false);
  });

  it("多时刻：当天发过早上的，晚上到点仍要发", () => {
    expect(
      isTaskDue(task({ remindTimes: ["09:00", "16:00"], lastRunAt: "2026-09-14 09:05" }), now),
    ).toBe(true);
  });

  it("同一（日, 槽位）只发一次", () => {
    expect(
      isTaskDue(task({ remindTimes: ["09:00", "16:00"], lastRunAt: "2026-09-14 16:05" }), now),
    ).toBe(false);
  });

  it("单时刻任务当天已发过就不再发（保持旧的当天只发一次）", () => {
    expect(isTaskDue(task({ remindTimes: ["16:00"], lastRunAt: "2026-09-14 09:05" }), now)).toBe(false);
  });

  it("仅一次：到设定时刻才发，执行过就不再发", () => {
    expect(isTaskDue(task({ frequency: "once", remindTimes: ["16:00"] }), now)).toBe(true);
    expect(isTaskDue(task({ frequency: "once", remindTimes: ["09:00"] }), now)).toBe(false);
    expect(
      isTaskDue(task({ frequency: "once", remindTimes: ["16:00"], lastRunAt: "2026-09-14 09:05" }), now),
    ).toBe(false);
  });

  it("每周 + 多时刻：同日续跑不受 7 天限制拦截", () => {
    expect(
      isTaskDue(
        task({ frequency: "weekly", remindTimes: ["09:00", "16:00"], lastRunAt: "2026-09-14 09:05" }),
        now,
      ),
    ).toBe(true);
  });

  it("每周 + 多时刻：跨天未满 7 天不发", () => {
    expect(
      isTaskDue(
        task({ frequency: "weekly", remindTimes: ["09:00", "16:00"], lastRunAt: "2026-09-12 09:05" }),
        now,
      ),
    ).toBe(false);
  });

  it("未对齐到槽位的脏值不会被误命中", () => {
    expect(isTaskDue(task({ remindTimes: ["16:07"] }), now)).toBe(false);
  });

  it("起止日期与停用仍优先拦截", () => {
    expect(isTaskDue(task({ remindTimes: ["16:00"], startDate: "2026-09-20" }), now)).toBe(false);
    expect(isTaskDue(task({ remindTimes: ["16:00"], endDate: "2026-09-01" }), now)).toBe(false);
    expect(isTaskDue(task({ remindTimes: ["16:00"], enabled: false }), now)).toBe(false);
  });
});

describe("normalizeRemindTimes", () => {
  it("对齐到 30 分钟槽位、去重、升序", () => {
    expect(normalizeRemindTimes(["16:07", "09:45", "16:00", "09:45"])).toEqual(["09:30", "16:00"]);
  });

  it("丢弃非法值，空输入返回空数组", () => {
    expect(normalizeRemindTimes(["bad", "25:00", "12:60", ""])).toEqual([]);
    expect(normalizeRemindTimes([])).toEqual([]);
    expect(normalizeRemindTimes(null)).toEqual([]);
  });

  it("接受 JSON 字符串（多维表读回的形态）", () => {
    expect(normalizeRemindTimes('["09:00","18:30"]')).toEqual(["09:00", "18:30"]);
  });
});
