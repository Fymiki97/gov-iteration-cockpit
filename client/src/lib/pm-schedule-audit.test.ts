import { describe, expect, it } from "vitest";
import type { AuditCriterion, AuditRequirement } from "@/lib/pm-schedule-audit";
import {
  QA_OWNER_CRITERION,
  TEST_WORKLOAD_CRITERION,
  failCriterionOptions,
  failedCriterionNames,
  filterFailedRequirements,
  groupAuditRows,
  matchesFailCriteria,
  matchesOwners,
  matchesProductLines,
  ownerOptions,
  parseAuditRequirements,
  productLineOptions,
} from "@/lib/pm-schedule-audit";

function criterion(name: string, passed: boolean): AuditCriterion {
  return { name, current: passed ? "ok" : "空", standard: "不为空", passed };
}

function req(id: string, failed: string[], extra: Partial<AuditRequirement> = {}): AuditRequirement {
  return {
    id,
    name: id,
    pmOwner: "",
    devOwner: "",
    qaOwner: "",
    pmOwnerId: "",
    devOwnerId: "",
    qaOwnerId: "",
    devInDigitalGov: true,
    qaInDigitalGov: true,
    project: "",
    productLine: "政务AI",
    expectedVersion: "",
    versionLine: "",
    month: "",
    planYear: 2026,
    onesId: "",
    onesUrl: "",
    deadline: "",
    scheduleConclusion: "",
    subRequirementType: "",
    requirementType: "",
    gateMet: false,
    passed: failed.length === 0,
    criteria: failed.map((name) => criterion(name, false)),
    ...extra,
  };
}

describe("failedCriterionNames", () => {
  it("returns names of unmet criteria", () => {
    const item = req("a", ["需求来源", "开发计划工作量"]);
    expect(failedCriterionNames(item)).toEqual(["需求来源", "开发计划工作量"]);
  });
});

describe("matchesFailCriteria", () => {
  it("keeps all rows when nothing is selected", () => {
    expect(matchesFailCriteria(req("a", ["需求来源"]), [])).toBe(true);
  });

  it("keeps a row if it hits any selected criterion", () => {
    const item = req("a", ["需求来源", "开发计划工作量"]);
    expect(matchesFailCriteria(item, ["开发计划工作量"])).toBe(true);
    expect(matchesFailCriteria(item, ["是否免测"])).toBe(false);
  });

  it("uses OR when multiple criteria are selected", () => {
    const item = req("a", ["带出版本线"]);
    expect(matchesFailCriteria(item, ["需求来源", "带出版本线"])).toBe(true);
  });
});

describe("failCriterionOptions", () => {
  it("counts failed criteria and keeps rule order", () => {
    const options = failCriterionOptions([
      req("a", ["开发计划工作量", "需求来源"]),
      req("b", ["需求来源"]),
      req("c", ["带出版本线"]),
    ]);
    expect(options.map((opt) => opt.value)).toEqual(["需求来源", "开发计划工作量", "带出版本线"]);
    expect(options.map((opt) => opt.count)).toEqual([2, 1, 1]);
  });
});

describe("matchesProductLines", () => {
  it("matches selected product lines and treats blank as 未填写", () => {
    expect(matchesProductLines(req("a", ["需求来源"], { productLine: "医疗版" }), [])).toBe(true);
    expect(matchesProductLines(req("a", ["需求来源"], { productLine: "医疗版" }), ["政务AI"])).toBe(false);
    expect(matchesProductLines(req("a", ["需求来源"], { productLine: "  " }), ["未填写"])).toBe(true);
  });
});

describe("matchesOwners", () => {
  it("matches any of 产品/开发/测试负责人", () => {
    const item = req("a", ["需求来源"], { pmOwner: "张三", devOwner: "李四", qaOwner: "王五" });
    expect(matchesOwners(item, [])).toBe(true);
    expect(matchesOwners(item, ["李四"])).toBe(true);
    expect(matchesOwners(item, ["赵六"])).toBe(false);
  });
});

describe("productLineOptions / ownerOptions", () => {
  it("orders product lines by known team order", () => {
    const options = productLineOptions([
      req("a", ["需求来源"], { productLine: "医疗版" }),
      req("b", ["需求来源"], { productLine: "政务AI" }),
      req("c", ["需求来源"], { productLine: "政务AI" }),
    ]);
    expect(options.map((opt) => opt.value)).toEqual(["政务AI", "医疗版"]);
    expect(options.map((opt) => opt.count)).toEqual([2, 1]);
  });

  it("lists unique owners with requirement counts", () => {
    const options = ownerOptions([
      req("a", ["需求来源"], { pmOwner: "张三", devOwner: "李四" }),
      req("b", ["需求来源"], { pmOwner: "张三", qaOwner: "王五" }),
    ]);
    expect(options.map((opt) => opt.value)).toEqual(["李四", "王五", "张三"]);
    expect(options.find((opt) => opt.value === "张三")?.count).toBe(2);
  });
});

describe("filterFailedRequirements", () => {
  it("applies team, criterion and owner filters together", () => {
    const rows = [
      req("a", ["需求来源"], { productLine: "政务AI", pmOwner: "张三" }),
      req("b", ["带出版本线"], { productLine: "政务AI", pmOwner: "李四" }),
      req("c", ["需求来源"], { productLine: "医疗版", pmOwner: "张三" }),
    ];
    const filtered = filterFailedRequirements(rows, {
      productLines: ["政务AI"],
      failCriteria: ["需求来源"],
      owners: ["张三"],
    });
    expect(filtered.map((row) => row.id)).toEqual(["a"]);
  });
});

describe("groupAuditRows", () => {
  it("groups by team using product line", () => {
    const groups = groupAuditRows([
      req("a", ["需求来源"], { productLine: "医疗版" }),
      req("b", ["需求来源"], { productLine: "政务AI" }),
    ], "team");
    expect(groups.map((group) => group.title)).toEqual(["政务AI", "医疗版"]);
    expect(groups[0]?.badge).toBe("所属产品线");
  });

  it("puts a requirement into each failed-criterion group", () => {
    const groups = groupAuditRows([
      req("a", ["需求来源", "开发计划工作量"]),
      req("b", ["需求来源"]),
    ], "criterion");
    expect(groups.map((group) => group.title)).toEqual(["需求来源", "开发计划工作量"]);
    expect(groups[0]?.rows.map((row) => row.id)).toEqual(["a", "b"]);
    expect(groups[1]?.rows.map((row) => row.id)).toEqual(["a"]);
  });

  it("only creates selected criterion groups when filtering", () => {
    const groups = groupAuditRows([
      req("a", ["需求来源", "开发计划工作量"]),
    ], "criterion", ["开发计划工作量"]);
    expect(groups.map((group) => group.title)).toEqual(["开发计划工作量"]);
  });
});

describe("免测需求豁免测试门禁", () => {
  const baseFields = {
    标题: "示例需求",
    产品负责人: "张三",
    开发负责人: "李四",
    测试负责人: "",
    需求来源: "内部",
    需求立项评审结论: "通过",
    状态: "开发中",
    带出版本线: "政务",
    "开发计划工作量（人/天）": "3",
    "测试计划工作量（人/天）": "",
  };

  it("does not require 测试负责人 or 测试计划工作量 when 是否免测 is 是", () => {
    const [item] = parseAuditRequirements([{ id: "no-test", fields: { ...baseFields, 是否免测: "是" } }]);
    expect(item?.criteria.some((c) => c.name === QA_OWNER_CRITERION)).toBe(false);
    expect(item?.criteria.some((c) => c.name === TEST_WORKLOAD_CRITERION)).toBe(false);
    expect(item?.passed).toBe(true);
  });

  it("still requires 测试负责人 when 是否免测 is 否", () => {
    const [item] = parseAuditRequirements([{ id: "need-qa", fields: { ...baseFields, 是否免测: "否" } }]);
    expect(item?.criteria.find((c) => c.name === QA_OWNER_CRITERION)?.passed).toBe(false);
    expect(item?.passed).toBe(false);
  });
});

describe("免测技术需求自动达标", () => {
  const incomplete = {
    标题: "技术免测",
    是否免测: "是",
    需求类型: "技术需求",
  };

  it("auto-passes when 是否免测 is 是 and 需求类型 is 技术需求", () => {
    const [item] = parseAuditRequirements([{ id: "tech-no-test", fields: incomplete }]);
    expect(item?.passed).toBe(true);
    expect(item?.criteria.every((c) => c.passed)).toBe(true);
  });

  it("does not auto-pass a 技术需求 that is not 免测", () => {
    const [item] = parseAuditRequirements([{
      id: "tech-need-test",
      fields: { ...incomplete, 是否免测: "否" },
    }]);
    expect(item?.passed).toBe(false);
  });

  it("does not auto-pass a 免测 product requirement with missing fields", () => {
    const [item] = parseAuditRequirements([{
      id: "product-no-test",
      fields: { 标题: "产品免测", 是否免测: "是", 需求类型: "产品需求" },
    }]);
    expect(item?.passed).toBe(false);
  });
});

describe("WPS协作自动达标", () => {
  it("auto-passes when 所属项目 is WPS协作", () => {
    const [item] = parseAuditRequirements([{
      id: "wps-collab",
      fields: { 标题: "协作需求", 所属项目: "WPS协作" },
    }]);
    expect(item?.passed).toBe(true);
    expect(item?.criteria.every((c) => c.passed)).toBe(true);
  });

  it("does not auto-pass when only 产品类别 is WPS协作", () => {
    const [item] = parseAuditRequirements([{
      id: "wps-collab-category",
      fields: { 标题: "协作需求", 所属项目: "Office", 产品类别: "WPS协作" },
    }]);
    expect(item?.passed).toBe(false);
  });

  it("auto-passes when WPS协作 is one of multiple projects", () => {
    const [item] = parseAuditRequirements([{
      id: "wps-collab-multi",
      fields: { 标题: "协作需求", 所属项目: "WPS协作、Office" },
    }]);
    expect(item?.passed).toBe(true);
  });

  it("auto-passes select object and spaced labels", () => {
    const [item] = parseAuditRequirements([{
      id: "wps-collab-object",
      fields: { 标题: "协作需求", 所属项目: { text: "WPS 协作" } },
    }]);
    expect(item?.passed).toBe(true);
  });

  it("does not auto-pass other projects with missing fields", () => {
    const [item] = parseAuditRequirements([{
      id: "other-project",
      fields: { 标题: "其他需求", 所属项目: "政务AI" },
    }]);
    expect(item?.passed).toBe(false);
  });
});
