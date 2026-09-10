import { describe, expect, it } from "vitest";
import type { AuditCriterion, AuditRequirement } from "@/lib/pm-schedule-audit";
import { GATE_CHECKBOX_FIELD, parseAuditRequirements } from "@/lib/pm-schedule-audit";
import { buildGateCheckboxUpdates } from "@/lib/pm-audit-gate-sync";

function criterion(name: string, passed: boolean): AuditCriterion {
  return { name, current: passed ? "ok" : "空", standard: "不为空", passed };
}

function req(id: string, extra: Partial<AuditRequirement> = {}): AuditRequirement {
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
    passed: true,
    criteria: [criterion("需求来源", true)],
    ...extra,
  };
}

describe("buildGateCheckboxUpdates", () => {
  it("checks the gate box for newly passed requirements", () => {
    expect(buildGateCheckboxUpdates([req("rec-1", { passed: true, gateMet: false })])).toEqual([
      { id: "rec-1", checked: true },
    ]);
  });

  it("clears the gate box for newly failed requirements", () => {
    expect(buildGateCheckboxUpdates([req("rec-2", { passed: false, gateMet: true })])).toEqual([
      { id: "rec-2", checked: false },
    ]);
  });

  it("skips records that already match the audit result", () => {
    expect(buildGateCheckboxUpdates([
      req("rec-pass", { passed: true, gateMet: true }),
      req("rec-fail", { passed: false, gateMet: false }),
    ])).toEqual([]);
  });

  it("skips synthetic row ids that cannot be written back", () => {
    expect(buildGateCheckboxUpdates([req("row-3", { passed: true, gateMet: false })])).toEqual([]);
  });
});

describe("parseAuditRequirements gate checkbox", () => {
  it("reads 是否满足排期会门禁 as checked", () => {
    const [item] = parseAuditRequirements([{
      id: "rec-checked",
      fields: { 标题: "已勾选", [GATE_CHECKBOX_FIELD]: true },
    }]);
    expect(item?.gateMet).toBe(true);
  });

  it("reads empty checkbox as unchecked", () => {
    const [item] = parseAuditRequirements([{
      id: "rec-empty",
      fields: { 标题: "未勾选" },
    }]);
    expect(item?.gateMet).toBe(false);
  });
});
