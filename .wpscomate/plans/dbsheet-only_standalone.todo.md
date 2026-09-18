# Todos — dbsheet-only_standalone

1. [x] 服务端：readTasks/writeTasks 去掉本地文件降级，多维表不可用时返回明确错误
2. [x] 服务端：删除仅用于回填的 sync 端点与 backfillRemindTasks
3. [x] 客户端：去掉 localStorage 作为任务配置来源（fetch/create/update/delete）
4. [x] 清理本地残留任务数据文件
5. [-] 本地验证仅走多维表，然后 lint + check:types + pack 并部署上线
