# Todos — remind-date-fix_standalone

1. [x] 修复日期序列化：开始/结束/上次执行时间由毫秒时间戳改为字符串（多维表 Date 字段拒绝毫秒值）
2. [x] 让持久化失败可见：writeTasks 返回结果，接口透出 persisted/persistError，前端不再静默成功
3. [x] 本地端到端验证：带日期的任务能真正写入多维表并回读一致
4. [-] lint + check:types + pack，部署上线
