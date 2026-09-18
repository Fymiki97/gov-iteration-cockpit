# Todos — oauth-refresh-token-probe_standalone

1. [x] 读 app-dev / comate-cli 流程，确认改动与部署方式
2. [x] 改 oauth/callback.ts：捕获并记录 refresh_token（含完整响应字段）
3. [x] lint + check:types
4. [x] 本地预览验证（app-dev verify）
5. [x] 打包并部署上线
6. [x] 用户重新授权后取服务端日志，确认平台是否下发 refresh_token
