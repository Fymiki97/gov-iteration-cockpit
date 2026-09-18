# 缺陷提醒无人值守改造

## 目标
缺陷提醒由平台定时任务自动触发，不再依赖有人打开页面。

## 核心机制（已查证）
cron 任务的 `action_config` 是自定义 JSON，会透传进 invoke payload
（automation-api.md 明示「其他自定义字段也会透传到 invoke payload 中」）。
→ 配置随每次触发下发，服务端不读多维表、不需任何用户凭据，天然免疫多副本。

## 凭据边界（已实测）
| 环节 | 凭据 | 无人值守 |
|---|---|---|
| ONES 取数 | `nitro.config.ts` 静态 ONES_AUTH_TOKEN | ✅ |
| 提醒配置 | 改由 cron payload 下发 | ✅ |
| 发消息 | `task.webhook` 静态 URL | ✅ |
| 回写运行状态 | 用户 token | ❌ 按决定移除 |

## 架构
- 新增 `server/routes/invoke.post.ts`（FC 入口）：校验 `x-fc-control-path` → 解析 payload → 取配置 → 取 ONES → slot 判定 → 发 webhook
- 新增 `server/utils/remind-cron.ts`：payload schema、slot 判定、执行主逻辑（复用 `defect-remind.ts` 的 match/format/postWebhook）
- 新增 `server/utils/remind-task-sync.ts`：把配置同步进平台任务
- 改动 `server/routes/api/defect-remind-tasks*.ts`：写操作后触发同步
- 改动前端：去掉页面自动发送、去掉运行状态列

## 关键设计
### 去重（无状态）
cron 用 wall-clock 对齐表达式 `CRON_TZ=Asia/Shanghai 0 */5 * * * *`，
handler 判定「当前 5 分钟槽 == 配置里某个 remindTime」→ 每个时刻恰好触发一次，无需任何状态。
**不能用 `@every`**：其网格从任务创建时刻起算，会偏移导致漏发或重发。

### 频率语义
daily/weekly/weekdays 由日期推算；once 改为「仅在该日期当天该时刻触发」。

### payload schema
`{ task_id, config: { tasks: [...], peopleMap?: {...} } }`

## Phase 0 可行性验证（先做，决定分支）
- 0a payload 容量：塞入完整配置+人员映射，建 `@every 1m` 测试任务，确认 payload 完整到达
- 0b 同步凭据：服务端能否用请求内 cookie 调 `open.wps.cn/app-studio/api/manage/v1`
  → 通过则 UI 保存自动同步；不通过回退「CLI 同步」

## 风险
- payload 容量未知（0a 先验）
- 管理 API 无 update，改配置 = delete + create，存在短暂任务缺失窗口
- 同步失败会造成「界面已改、任务未改」漂移 → 界面需显示同步状态
- 入口若放 `/api/automation/*` 会跳过鉴权（平台设计），必须用 `/invoke`
- once 语义变化需知悉

## 验证
- `pnpm run lint && pnpm run check:types` 零错误
- 临时 `@every 1m` 任务观察 payload 完整性
- 端到端：改配置 → 到点 → 群收到消息；线上确认无重复发送