# Todos — remind-custom-time

1. [x] Phase 1: 多维表新增「提醒时间」列（IF / MultiLineText），回读字段 ID 写入 FIELD_MAP
2. [x] Phase 1: 加 remindTimes 字段与归一化、双向映射、formatDateTime 保留时分、缺失字段守卫
3. [x] Phase 2: 服务端 isTaskDue 改为槽位判定（含 shanghaiSlot）
4. [x] Phase 2: 前端 isTaskDue 同步槽位判定
5. [x] Phase 3: 配置弹窗新增「提醒时间」多选控件 + 任务列表展示已选时刻
6. [x] Phase 5: 单元验证槽位判定（客户端 9 项 / 服务端 19 项全过）
7. [ ] Phase 5b: 用户在线上 UI 确认时刻保存与回显（无用户 cookie，我无法跑 App 读写链路）
8. [ ] Phase 4: 服务端多维表身份通道（待定 refresh_token / AppBase 镜像）
9. [ ] Phase 4: sweep 主逻辑 + /invoke cron 入口（依赖身份通道）
10. [ ] Phase 6: 平台 cron 自动化任务创建与启用
11. [x] Phase 7: pack + 上线 + 清理临时产物
