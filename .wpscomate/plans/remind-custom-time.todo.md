# Todos — remind-custom-time

1. [ ] Phase 1: 多维表新增「提醒时间」列，回读字段 ID 写入 FIELD_MAP
2. [x] Phase 1: 加 remindTimes 字段与归一化、双向映射、formatDateTime 保留时分、缺失字段守卫
3. [x] Phase 2: 服务端 isTaskDue 改为槽位判定（含 shanghaiSlot）
4. [x] Phase 2: 前端 isTaskDue 同步槽位判定
5. [x] Phase 3: 配置弹窗新增「提醒时间」多选控件 + 任务列表展示已选时刻
6. [ ] Phase 4: 服务端多维表身份通道（runtimeConfig 凭据 + 无 cookie 回落）
7. [ ] Phase 4: sweep 主逻辑 + /invoke cron 入口 + 手动触发路由
8. [ ] Phase 5: 本地端到端验证（槽位命中/多时刻/跨天去重/旧任务兼容/无 cookie 读表）
9. [ ] Phase 6: 平台 cron 自动化任务创建与启用
10. [ ] Phase 7: lint + check:types + pack + 上线 + 清理临时产物
