# 下线「缺陷提醒」功能

## 项目概述
看板缺陷 Tab 现含一套「催办提醒」能力：顶部催办卡片（提醒配置 / 一键提醒未修复）、表格行内「提醒」链接、两个弹窗；配套后端 `/invoke` + `defect-remind-tasks/*` 接口、多维表任务存储、以及 Comate 每 30 分钟跑的同步脚本和线上 cron 自动化任务。用户决定彻底下线。**保留**：缺陷列表、统计卡片、筛选、详情弹窗、导出、ONES 取数（`/api/ones-defects`）。

## 技术选型
无需新增依赖。复用既有工具链：oxlint + tsc + vitest + `pnpm run pack` + comate-cli 部署。

## 功能与信息架构
- 删除入口：催办卡片、行内「提醒」、选中栏「提醒」、`DefectRemindConfigDialog`、`DefectRemindSendDialog`
- 保留：`DefectListTab` 其余全部（统计/筛选/表格/详情/导出）
- 删除接口：`/invoke`（FC Timer）、`/api/defect-remind-tasks`（GET/POST/PUT/DELETE/run）

## 架构设计
共享模块归属（关键，避免误删）：
- `server/utils/ones-defects.ts` → **保留**（缺陷列表数据源 + 快照）
- `server/utils/dbsheet-cache.ts` → **保留**，仅摘掉人员映射（`getPeopleMap`/`setPeopleMap`/`ensurePeopleMap`/sheet 28 拉取），该部分只服务提醒的钉钉真 @
- `client/src/lib/defect.ts` → **保留**，仅摘掉提醒专用导出；`fetchOnesDefects`/`OnesDefectsResult` 从被删的 `defect-remind-api.ts` 迁入此处
- `server/data/ones-defects-snapshot.json` → **保留**（列表快照回退用）

## 实施步骤

### Phase 1: 前端移除 (P0)
1. 删 `DefectRemindConfigDialog.tsx`、`DefectRemindSendDialog.tsx`、`lib/defect-remind-api.ts`
2. `DefectListTab.tsx`：删催办卡片、行内「提醒」、选中栏「提醒」、两处弹窗挂载，以及 `tasks`/`cronDirty`/`configOpen`/`sendOpen`/`openRemind`/`replaceTasks`/`patchTask` 与相关 import、无用图标
3. `lib/defect.ts`：删提醒专用导出（`DefectRemindTask*`、`RemindFrequency/Template`、`FREQUENCY_OPTIONS`、`REMIND_TIME_SLOTS`、`remindTimesLabel`、`TEMPLATE_OPTIONS`、`DEFAULT_SEVERITIES`、`matchTaskDefects`、`emptyRemindTaskInput`、`taskToInput`、`frequencyLabel`、`daysBetween`、`shanghaiSlot`、`parseRunAt`、`isTaskDue`、`formatDefectLine`、`formatRemindMessage`、`detectWebhookChannel`、`REMIND_CRON_*`、`loadRemindCronDirty`、`saveRemindCronDirty`），迁入 `fetchOnesDefects`
4. `lib/defect.test.ts`：删提醒用例（`matchTaskDefects`/`isTaskDue`/`formatRemindMessage` 及 `sampleTask`）

### Phase 2: 后端移除 (P0)
5. 删 `server/routes/invoke.post.ts`、`api/defect-remind-tasks*.ts`、`api/defect-remind-tasks/` 目录
6. 删 `server/utils/remind-cron.ts`、`defect-remind.ts`、`defect-remind-store.ts`、`remind-task-auth.ts`、`remind-task-dbsheet.ts`、`defect-remind.test.ts`
7. `server/utils/dbsheet-cache.ts` 摘掉人员映射
8. 删 `scripts/sync-remind-cron.mjs`

### Phase 3: 验证与上线 (P0)
9. `pnpm lint && pnpm check:types` + 前后端 `vitest run`
10. 本地预览启动确认就绪，检查缺陷 Tab 仍正常、提醒入口已消失
11. `pnpm run pack` 打包
12. 删除线上自动化任务 `defect-remind-cron`（id=3667590161375775）
13. 部署上线

## 风险与注意事项
- `DefectListTab` 删代码时易留下未使用 import（`Bell`/`Send`/`Settings2` 等），需逐一核对是否他处仍用
- `dbsheet-cache` 是看板需求数据链路共用文件，改动要最小化，改完必须跑测试
- 线上自动化任务删除后不可恢复；Comate 每 30 分钟任务由用户自行停（脚本删除后会持续失败）
- 多维表中存放提醒任务的数据表不清理（外部数据，无害）

## 验证方式
- `pnpm lint && pnpm check:types`（0 错误）
- `pnpm -r test`（vitest 全通过）
- `pnpm run pack` 成功，产物不含 `defect-remind`/`invoke` 痕迹
- 本地预览人工核对：缺陷 Tab 统计/筛选/表格/详情/导出正常，无催办卡片与「提醒」按钮

## 关键文件清单
| File | Action |
|---|---|
| client/src/components/DefectRemindConfigDialog.tsx | 删除 |
| client/src/components/DefectRemindSendDialog.tsx | 删除 |
| client/src/lib/defect-remind-api.ts | 删除 |
| client/src/components/DefectListTab.tsx | 改 |
| client/src/lib/defect.ts | 改 |
| client/src/lib/defect.test.ts | 改 |
| server/routes/invoke.post.ts | 删除 |
| server/routes/api/defect-remind-tasks*.ts | 删除 |
| server/utils/remind-cron.ts / defect-remind.ts / defect-remind-store.ts / remind-task-auth.ts / remind-task-dbsheet.ts / defect-remind.test.ts | 删除 |
| server/utils/dbsheet-cache.ts | 改 |
| scripts/sync-remind-cron.mjs | 删除 |
