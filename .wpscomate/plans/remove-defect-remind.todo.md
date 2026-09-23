# Todos — remove-defect-remind

1. [x] 前端：删两个提醒弹窗组件与 defect-remind-api.ts
2. [x] 前端：DefectListTab 移除催办卡片/行内提醒/弹窗挂载及相关 state 与 import
3. [x] 前端：defect.ts 摘除提醒专用导出，迁入 fetchOnesDefects
4. [x] 前端：defect.test.ts 移除提醒用例
5. [x] 后端：删 invoke/remind-cron/defect-remind*/remind-task*/defect-remind-tasks 路由与测试
6. [x] 后端：dbsheet-cache 摘掉仅提醒用的人员映射
7. [x] 删除 scripts/sync-remind-cron.mjs
8. [x] lint + check:types + vitest 全通过
9. [x] 本地预览启动确认就绪，人工核对缺陷 Tab 正常且提醒入口消失
10. [x] pnpm run pack 打包
11. [-] 删除线上自动化任务 defect-remind-cron 并部署上线
