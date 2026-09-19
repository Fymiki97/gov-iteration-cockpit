# Todos — remind-cron-fix_standalone

1. [-] 同步脚本改为 PUT 原地更新，消除删旧建新的调度空窗
2. [ ] cron 执行路径加 ONES 快照回退，取数失败时仍发真提醒
3. [ ] pnpm lint && pnpm check:types 一次跑通
4. [ ] pnpm run pack 打包并部署
5. [ ] 实测 PUT 更新后任务保持 active 且配置正确
