import { describe, expect, it } from "vitest";
import { lookupScheduleMeetingPlanDate } from "@/lib/pm-schedule-audit";
import { formatPushMessagePreview, onesTaskUrl } from "@/lib/pm-audit-push";

describe("onesTaskUrl", () => {
  it("builds canonical ONES task url", () => {
    expect(onesTaskUrl("#2445069")).toBe("https://ones.dig.kso.net/om/v1/gs/task/2445069");
    expect(onesTaskUrl("ones-2445069")).toBe("https://ones.dig.kso.net/om/v1/gs/task/2445069");
  });
});

describe("lookupScheduleMeetingPlanDate", () => {
  it("reads 需求排期会 month-prefixed plan date", () => {
    const date = lookupScheduleMeetingPlanDate([{
      fields: {
        里程碑: "需求排期会",
        "9月计划完成日期": "2026/09/08 星期一",
      },
    }], 9);
    expect(date).toBe("2026年9月8日");
  });

  it("falls back to 计划完成日期 for June", () => {
    const date = lookupScheduleMeetingPlanDate([{
      fields: {
        里程碑: "需求排期会",
        计划完成日期: "2026/06/15",
      },
    }], 6);
    expect(date).toBe("2026年6月15日");
  });
});

describe("formatPushMessagePreview", () => {
  it("uses the new reminder template", () => {
    const text = formatPushMessagePreview({
      person: "张三",
      userId: "1",
      requirementCount: 1,
      items: [{
        name: "示例需求",
        onesId: "2445069",
        onesUrl: "",
        reasons: ["开发计划工作量为空", "带出版本线为空"],
      }],
    }, {
      monthLabel: "26年9月",
      meetingDate: "2026年9月8日",
      meetingSchedule: "14:00-16:00 金山会议",
    }, "冯雨檬");

    expect(text).toContain("【排期会准入审计提醒】");
    expect(text).toContain("以下需求未满足26年9月排期会准入条件，请您关注并尽快处理：");
    expect(text).toContain("26年9月排期会的日期为：2026年9月8日");
    expect(text).toContain("26年9月排期会的日程为：14:00-16:00 金山会议");
    expect(text).toContain("26年9月排期会的日程为：14:00-16:00 金山会议\n\n\n1. 标题：示例需求");
    expect(text).toContain("ones链接：https://ones.dig.kso.net/om/v1/gs/task/2445069");
    expect(text).toContain("· 开发计划工作量为空");
    expect(text).toContain("· 带出版本线为空");
  });
});
