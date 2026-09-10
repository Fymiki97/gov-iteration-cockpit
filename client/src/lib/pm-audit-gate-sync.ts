import type { Wps365Client } from "@ks-open/capability/client/wps365";
import type { AuditRequirement } from "@/lib/pm-schedule-audit";
import { GATE_CHECKBOX_FIELD } from "@/lib/pm-schedule-audit";

export const DBSHEET_FILE_ID = "Dm5Wx1ph11MNih2SbwZurxjFLUZTboQEF";
export const REQUIREMENT_SHEET_ID = 21;
const UPDATE_CHUNK_SIZE = 80;

export interface GateCheckboxUpdate {
  id: string;
  checked: boolean;
}

export function isWritableRecordId(id: string): boolean {
  return Boolean(id) && !/^row-\d+$/.test(id);
}

export function buildGateCheckboxUpdates(items: AuditRequirement[]): GateCheckboxUpdate[] {
  return items.flatMap((item) => {
    if (!isWritableRecordId(item.id)) return [];
    if (item.passed === item.gateMet) return [];
    return [{ id: item.id, checked: item.passed }];
  });
}

function chunk<T>(items: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    groups.push(items.slice(i, i + size));
  }
  return groups;
}

export async function syncGateCheckboxes(
  wps: Wps365Client,
  items: AuditRequirement[],
  options?: { fileId?: string; sheetId?: number },
): Promise<{ updated: number; skipped: number }> {
  const updates = buildGateCheckboxUpdates(items);
  const skipped = items.length - updates.length;
  if (updates.length === 0) return { updated: 0, skipped };

  const fileId = options?.fileId ?? DBSHEET_FILE_ID;
  const sheetId = options?.sheetId ?? REQUIREMENT_SHEET_ID;

  for (const group of chunk(updates, UPDATE_CHUNK_SIZE)) {
    const res = await wps.dbsheet.updateRecords({
      file_id: fileId,
      sheet_id: sheetId,
      prefer_id: false,
      records: group.map((row) => ({
        id: row.id,
        fields_value: { [GATE_CHECKBOX_FIELD]: row.checked },
      })),
    });
    if (res.code !== undefined && res.code !== 0) {
      throw new Error(res.msg || `写回多维表失败（错误码 ${res.code}）`);
    }
  }

  return { updated: updates.length, skipped };
}
