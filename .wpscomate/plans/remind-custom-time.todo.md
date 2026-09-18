# Todos — remind-custom-time

1. [x] 补发语义：改为「今天最近一个已到点且未发的时刻」，避免错过 30 分钟窗口就漏发
2. [-] Phase 4a: OAuth 回调捕获并持久化 refresh_token
3. [ ] Phase 4b: 服务端用 refresh_token 换 access_token，无 cookie 时回落读多维表
4. [ ] Phase 4c: sweep 主逻辑 + /invoke cron 入口
5. [ ] Phase 6: 平台 cron 自动化任务创建与启用
6. [ ] Phase 7: 全量验证 + pack + 上线
