# 缺陷提醒：自定义提醒时间（30 分钟粒度）+ 服务端定时

## 项目概述
为「缺陷提醒任务」增加**多个自定义提醒时刻**（00:00–23:30，30 分钟步进，可多选），并由**服务端定时**（平台 cron，每 30 分钟一次）在到点时自动拉取 ONES 缺陷、经 Webhook 推送，不再依赖用户打开页面。目标用户：政务 AI 迭代的测试/研发负责人。交付：多维表新增「提醒时间」列 + 配置弹窗多选时刻 + 槽位判定 + 服务端 sweep + cron 自动化任务。

## 已确认前提
- 允许在多维表 sheet 12（fileId `tmcQvuKxFrMJAHExDfFFrxC3PB5vCD4E7`）新增一列「提醒时间」。
- 服务端读多维表的**身份凭据由用户提供**，照 `ONES_AUTH_TOKEN` 范式写入 runtimeConfig；未配置时自动降级为「最近一次用户请求种下的 cookie」。
- 仓库当前**无任何服务端定时器/平台 cron**，本方案为首次引入。

## 技术选型
| 决策 | 备选 | 选择 | 理由 |
|---|---|---|---|
| 时刻存储 | JSON 文本列 / 多选列 / 独立子表 | **JSON 文本列** | 与 `severities`/`iterations` 存法一致，不改 `resolveFieldNames` 结构 |
| 时刻粒度 | 完整时间戳 / HH:mm 槽位 | **HH:mm 槽位（30 分钟对齐）** | 避免秒级漂移导致漏发/重发 |
| 定时触发 | 平台 cron / Nitro setInterval / 仅前端 | **平台 cron 为主 + 前端补跑兜底** | `server/AGENTS.md` 禁止模块顶层常驻定时器，实例随时被回收 |
| 外发通道 | capability executor / 直接 postWebhook | **直接复用 `postWebhook`** | executor 的 webhook URL 是实例级固定值，无法承载每任务不同 URL |
| 服务端身份 | 应用身份 token / 用户 cookie | **混合：cookie 优先，无 cookie 回落服务端 token** | 保住每用户数据隔离，同时让 cron 可用 |

## 数据模型
```ts
// 新增字段
remindTimes: string[];   // ["09:30","18:00"]，空数组 = 不限制时刻（沿用旧行为）
```

## 时刻判定（核心）
「**日规则**决定哪天发，`remindTimes` 决定那天哪些时刻发」，同日多时刻靠槽位去重：
```ts
function shanghaiSlot(d: Date): string {          // 向下取整到 30 分钟槽位
  const hhmm = d.toLocaleTimeString("en-GB", { timeZone: "Asia/Shanghai", hour12: false }).slice(0, 5);
  const [h, m] = hhmm.split(":").map(Number);
  return `${pad(h)}:${pad(m < 30 ? 0 : 30)}`;
}

// isTaskDue(task, now, slot = shanghaiSlot(now))
// 1) enabled && webhook 非空；startDate/endDate 区间；weekdays 排除周末
// 2) once → return !lastRunAt
// 3) 日规则：
//    !lastRunAt                     → dayOk = true
//    today === lastDay              → dayOk = remindTimes.length > 1   // 同日续跑仅限多时刻
//    weekly                         → dayOk = daysBetween(lastDay, today) >= 7
//    daily / weekdays               → dayOk = today > lastDay
// 4) 槽位：remindTimes 非空且不含 slot → false
// 5) 去重：lastRunAt 的 (day, slot) === (today, slot) → false
```
- 兼容性：`remindTimes.length <= 1` 时保持旧的「当天只发一次」语义，旧记录（空数组）行为完全不变。
- `once` + 多时刻：仍沿用「首次发送后自动停用」，故实际只发一次。

## 实施步骤

### Phase 1 (P0) 数据模型与落库
1. 多维表新增文本列「提醒时间」，回读 `fields_schema` 取字段 ID 写入 `FIELD_MAP`
2. 类型加 `remindTimes`；`normalizeTaskInput` 归一化（`HH:mm`、30 分钟对齐、去重、升序）
3. `taskToFields`/`rowToTask` 双向映射；新增 `formatDateTime` 让 `lastRunAt` **保留时分**（现在 `formatDate` 会截断，多时刻去重会失效）
4. `resolveFieldNames` 补缺失字段守卫，不再写出 `"undefined"` 键

### Phase 2 (P0) 时刻判定（两份副本同步改）
1. `server/utils/defect-remind.ts` 的 `isTaskDue`
2. `client/src/lib/defect.ts` 的 `isTaskDue`

### Phase 3 (P0) 配置 UI
1. `DefectRemindConfigDialog` 新增「提醒时间」多选控件（48 个槽位，可多选/可清空），并展示语义说明
2. 任务列表展示已选时刻（如「每日 09:30、18:00」）

### Phase 4 (P1) 服务端 sweep + cron 入口
1. `server/utils/server-dbsheet-auth.ts`：服务端身份解析（runtimeConfig 凭据优先），`nitro.config.ts` 加配置项
2. `remind-task-dbsheet.getAccessToken` 无 cookie 时回落服务端 token；`defect-remind-store` 的身份键区分 `__server__`
3. `server/utils/defect-remind-sweep.ts`：读任务 → 拉 ONES → 逐任务槽位判定 → `postWebhook` → `markRemindTaskRun`
4. `server/routes/invoke.post.ts`：FC cron 入口（校验 `x-fc-control-path`）
5. `server/routes/api/defect-remind-sweep.post.ts`：手动触发（`x-sweep-token` = `SESSION_SECRET`），便于本地验证

### Phase 5 (P1) 本地端到端验证
覆盖：单/多时刻命中与不命中、同日第二个时刻、跨天去重、旧任务（空 remindTimes）行为不变、无 cookie 下 sweep 能读表、Webhook 实收次数

### Phase 6 (P2) 平台 cron 任务
读 `automation-task` 的 `references/automation-api.md`，创建 cron 任务（`CRON_TZ=Asia/Shanghai */30 * * * *`）并启用（需用户操作）

### Phase 7 收尾
`pnpm lint && pnpm check:types`、`pnpm run pack`、上线、清理临时产物

## 风险与注意事项
| 风险 | 应对 |
|---|---|
| **服务端身份凭据尚未到位** → cron 读不到任务表 | 双通道：cookie 优先 + 服务端 token 回落；凭据到位前 cron 仅在有人访问过时可用，需向用户明示 |
| 平台 cron 的 `action_config` 是否强制 `capability_id` 未知（本方案不走 executor） | Phase 6 先读 API 文档并实测创建；若强制，则创建一个仅用于承载 cron 的占位 executor 实例 |
| `fieldNamesCache` 是模块级缓存，新增列后需重新解析 | 新增列后重启 dev / 重新部署；必要时在列创建后主动失效 |
| 多维表 Date 字段只接受字符串、拒绝毫秒值 | 沿用 `toDateCell` 字符串写法，新字段为文本列不涉及 |
| `lastRunAt` 时分若仍被截断 → 多时刻去重失效、重复发送 | Phase 1 的 `formatDateTime` 为强依赖，Phase 5 必须验证往返保真 |
| peopleMap（真@）依赖用户 cookie，cron 无 cookie 时降级为纯文本 `@姓名` | 已知降级，Phase 5 记录实际表现；如需真@需另找服务端通讯录通道 |
| 无鉴权路由可被外部触发发送消息 | 手动触发路由用 `x-sweep-token` 校验；`/invoke` 校验 `x-fc-control-path` |
| 前端补跑与服务端 cron 可能同时命中同一槽位 | 两侧都走同一份槽位判定 + `lastRunAt` 槽位去重；极端并发下可能重复一次，可接受并记录 |

## 验证方式
```bash
pnpm run lint && pnpm run check:types
pnpm run pack
# 本地 sweep（需先铸 capa_session cookie 或配好服务端 token）
curl -sS -X POST localhost:4917/api/defect-remind-sweep -H "x-sweep-token: $SESSION_SECRET"
```
手工验证：配置多时刻 → 造一条仅一次/每天任务 → 调整系统时间或直接传 slot 参数 → 断言 Webhook 实收次数与表内 `lastRunAt`/`enabled` 状态。

## 关键文件清单
| 文件 | 改动 |
|---|---|
| `server/utils/remind-task-dbsheet.ts` | FIELD_MAP 加列、`formatDateTime`、`getAccessToken` 回落、缺失字段守卫 |
| `server/utils/defect-remind-store.ts` | `remindTimes` 字段与归一化、身份键 |
| `server/utils/defect-remind.ts` | `isTaskDue` 槽位判定、`shanghaiSlot` |
| `client/src/lib/defect.ts` | 类型 + `isTaskDue` 同步 |
| `client/src/components/DefectRemindConfigDialog.tsx` | 多选时刻控件 + 列表展示 |
| `server/utils/server-dbsheet-auth.ts`（新） | 服务端身份解析 |
| `server/utils/defect-remind-sweep.ts`（新） | sweep 主逻辑 |
| `server/routes/invoke.post.ts`（新） | FC cron 入口 |
| `server/routes/api/defect-remind-sweep.post.ts`（新） | 手动触发 |
| `server/nitro.config.ts` | 服务端凭据配置项 |
