# 缺陷提醒任务回填多维表 + 自动同步

## 项目概述
应用「政务产研迭代进度看板」的缺陷提醒任务原本以 localStorage 为主存储、多维表为持久化后端。因历史写入路径故障，多维表 `缺陷提醒任务` 表当前 **0 条记录**，而真实任务 3 条仅存于服务端降级文件与浏览器本地。本次目标：修复字段映射 Bug、扩展表结构、把现有 3 条任务回填进多维表，并加上自动同步机制，使今后不再出现两端不一致。

## 现状事实（已探明）
- 多维表 file_id `tmcQvuKxFrMJAHExDfFFrxC3PB5vCD4E7`，sheet_id `12`，15 个字段（H1~ID）
- 待回填任务 3 条（`server/.data/defect-remind-tasks.json`）：2 条「真@本地验证」(once/默认)、1 条「未修复缺陷提醒」(once/升级催办)
- 表结构缺陷：`提醒模板`(H-) 仅 `默认模板/批量合并` 2 选项，且**无 webhook 字段**

## 关键技术决策
| 决策点 | 选择 | 理由 |
|---|---|---|
| 补充方式 | 一次性回填 + 自动同步 | 用户确认，杜绝再次不一致 |
| 模板字段 | 扩展为 4 选项 | 保留下拉体验，与应用 4 种模板 1:1 |
| webhook | 写入多维表 | 用户确认；换浏览器仍可发送。**代价：密钥明文存表** |
| 同步实现 | 新增 sync 端点按 id 增量补写 | 现有 PUT 要求任务已存在，无法用于回填 |

## 待修 Bug（不修则回填数据错误）
1. `remind-task-dbsheet.ts` 频率映射用 `workday`，而应用与 store 用 `weekdays` → 「工作日」任务写表时静默降级为「每日」
2. `mapTemplateToZh` 只认 `default/batch`，`detailed/deadline/escalate` 全部落成「默认模板」
3. `defect-remind-store.ts` 两处主动剥离 webhook（`persistToDb` 解构剔除、`writeTasks` 置空），与「webhook 落表」决策冲突

## 架构设计
### 表结构变更（kdocs CLI）
- `提醒模板`(H-) 选项改为：默认模板 / 详细清单 / 截止日期 / 升级催办（移除无用的「批量合并」）
- 新增字段 `Webhook地址`，类型 MultiLineText（ID 由平台分配，需回读 schema 获取）

### 映射层（`server/utils/remind-task-dbsheet.ts`）
```ts
// FIELD_MAP 增加（ID 回读后填入）
IE: "webhook",
// 频率对齐 store 的 RemindFrequency
const mapFrequencyToEn = (zh: string) =>
  ({ 每日: "daily", 每周: "weekly", 工作日: "weekdays", 仅一次: "once" })[zh] ?? "daily";
// 模板 4 值 1:1
const TEMPLATE_ZH: Record<string, string> = {
  default: "默认模板", detailed: "详细清单", deadline: "截止日期", escalate: "升级催办",
};
```
- `rowToTask`：webhook 改为从字段读取（原硬编码 `""`）
- `taskToFields`：**仅当 `names.webhook` 存在时**才写入，避免字段缺失时写出 `undefined` 键
- `resolveFieldNames` 已有进程内缓存，新增字段后需注意重启/失效

### 回填 API（新增 `server/routes/api/defect-remind-tasks/sync.post.ts`）
```ts
// 入参 { tasks: DefectRemindTask[] }
// 语义：按 id 增量补写 —— 已存在的 id 不动（仅补空 webhook），不存在的追加
// 返回 { ok, added, total }
```
- store 新增 `backfillRemindTasks(incoming)`：读当前 → 合并 → 有变化才 `writeTasks`
- 复用 `ensureDbToken` 鉴权

### 前端自动同步（`client/src/lib/defect-remind-api.ts`）
- `fetchRemindTasks` 中仅在**服务端读取成功**时，把 `localOnly` 通过 sync 端点补写
- 关键防护：服务端读取失败（catch 分支）时**绝不**触发同步，否则会用本地列表覆盖/删除表内数据

## 实施步骤
### Phase 1: 表结构就绪 (P0)
1. CLI 扩展 `提醒模板` 选项为 4 个
2. CLI 新增 `Webhook地址` 文本字段
3. 回读 schema 确认新字段 ID 与选项生效
**交付物**: 表结构变更完成，新字段 ID 已知
**acceptance**: get-schema 显示模板 4 选项、webhook 字段存在

### Phase 2: 修复映射与存储层 (P0)
1. `remind-task-dbsheet.ts`：频率 `workday`→`weekdays`；模板改 4 值映射；FIELD_MAP 加 webhook；`rowToTask`/`taskToFields` 支持 webhook（带存在性守卫）
2. `defect-remind-store.ts`：移除两处 webhook 剥离，使 webhook 落表
**交付物**: 读写往返不再丢字段
**acceptance**: check:types 通过；往返映射单测/人工核对

### Phase 3: 回填能力 (P0)
1. store 新增 `backfillRemindTasks`
2. 新增 `sync.post.ts` 路由
3. 前端 `fetchRemindTasks` 接入自动回填（含失败保护）
**交付物**: 自动同步闭环
**acceptance**: 加载后本地独有任务出现在多维表；服务端失败时不误写

### Phase 4: 数据回填与发布 (P0)
1. CLI 将现有 3 条任务写入多维表（保留原任务 ID）
2. 回读校验 3 条记录字段值正确（频率/模板/webhook/时间）
3. `pnpm lint && pnpm check:types` → `pnpm run pack`
4. 部署并更新封面截图
**交付物**: 线上生效 + 表内 3 条记录
**acceptance**: 表内 3 条，字段与应用一致

## 风险与注意事项
- **webhook 明文入库**：密钥随表可见，能看该表者即可拿到推送地址。用户已确认接受
- **自动同步的删除语义**：从表里直接删记录，下次加载会被自动补回。真正删除须在应用 UI 操作（会同时清理两端）
- **字段 ID 依赖**：新增 webhook 字段 ID 必须回读确认，写死猜测 ID 会导致写错列
- **读失败保护**：同步只允许在服务端读成功分支触发，否则可能误删表内记录
- **重复任务**：2 条「真@本地验证」疑似测试数据，一并回填（用户要求"所有"）

## 验证方式
```bash
pnpm lint && pnpm check:types
pnpm run pack
# 表内记录核对
kdocs-comate-cli dbsheet list-records '{"file_id":"tmcQvuKxFrMJAHExDfFFrxC3PB5vCD4E7","sheet_id":12}'
```
- 人工：应用内打开缺陷提醒配置，确认 3 条任务正常显示、可发送

## 关键文件清单
| File path | Description |
|-----------|-------------|
| `server/utils/remind-task-dbsheet.ts` | 字段映射修复 + webhook 读写 |
| `server/utils/defect-remind-store.ts` | 移除 webhook 剥离 + 新增 backfill |
| `server/routes/api/defect-remind-tasks/sync.post.ts` | 新增增量回填端点 |
| `client/src/lib/defect-remind-api.ts` | 前端加载后自动回填 |
| `server/.data/defect-remind-tasks.json` | 回填数据来源（只读） |
