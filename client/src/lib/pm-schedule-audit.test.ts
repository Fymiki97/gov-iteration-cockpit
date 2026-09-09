import { describe, expect, it } from "vitest";
import type { AuditCriterion, AuditRequirement } from "@/lib/pm-schedule-audit";
import {
  failCriterionOptions,
  failedCriterionNames,
  filterFailedRequirements,
  groupAuditRows,
  matchesFailCriteria,
  matchesOwners,
  matchesProductLines,
  ownerOptions,
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
