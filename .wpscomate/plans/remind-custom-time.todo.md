# Todos — remind-custom-time

1. [x] 补发语义：改为「今天最近一个已到点且未发的时刻」，避免错过 30 分钟窗口就漏发
2. [x] 补发语义全量验证（客户端 28 项 / 服务端 22 项）+ lint + types + 上线
3. [ ] Phase 4a 阻塞：refresh_token 无持久化落点（平台无服务端密钥存储），待用户定方案
4. [ ] Phase 4b: 服务端用 refresh_token 换 access_token，无 cookie 时回落读多维表
5. [ ] Phase 4c: sweep 主逻辑 + /invoke cron 入口
6. [ ] Phase 6: 平台 cron 自动化任务创建与启用
