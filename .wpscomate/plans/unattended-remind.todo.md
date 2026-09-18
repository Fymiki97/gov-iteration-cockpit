# Todos — unattended-remind

1. [x] Phase 0a：验证 cron payload 容量（完整配置+人员映射能否到达 invoke）
2. [x] Phase 0b：验证管理 API 同步凭据路径（决定 UI 自动同步还是 CLI 同步）
3. [x] Phase 1：实现 invoke 入口与 payload schema（remind-cron.ts + invoke.post.ts）
4. [x] Phase 1：CLI 创建 cron 任务，端到端验证能自动发出提醒
5. [-] Phase 2：实现配置同步（按 0b 结果：服务端代理或 CLI）
6. [ ] Phase 3：前端移除页面自动发送与运行状态展示
7. [ ] Phase 4：发布并端到端验证（含无重复发送）
8. [ ] Phase 5：保存交接记录
