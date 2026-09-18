# Todos — remind-task-backfill

1. [x] Phase 1: 扩展多维表「提醒模板」为 4 选项 + 新增 Webhook地址 字段，并回读确认字段 ID
2. [x] Phase 2: 修复 remind-task-dbsheet.ts 频率映射(workday→weekdays)与模板 4 值映射，并支持 webhook 字段读写
3. [x] Phase 2: 移除 defect-remind-store.ts 中两处 webhook 剥离，使 webhook 落表
4. [x] Phase 3: 新增 backfillRemindTasks + sync.post.ts 增量回填端点
5. [x] Phase 3: 前端 fetchRemindTasks 接入自动回填（服务端读失败时不得触发）
6. [x] Phase 4: CLI 将现有 3 条任务回填进多维表并回读校验
7. [x] Phase 4: lint + check:types + pack，部署上线并更新封面
