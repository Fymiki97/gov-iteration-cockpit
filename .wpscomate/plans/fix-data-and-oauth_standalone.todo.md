# Todos — fix-data-and-oauth_standalone

1. [x] nitro 配置：依赖全内联 + SESSION_SECRET 启用 JWT 授权模式
2. [x] copy-capability-assets 增加 widgets 目录拷贝
3. [x] comate.json zip 命令改用已验证的 zip-dir 脚本
4. [-] pnpm run pack 并验证产物（无 node_modules、依赖内联、资产齐全）
5. [ ] 本地起产物冒烟测试（health / oauth/status / capabilities）
6. [ ] lint + typecheck 通过
7. [ ] 部署上线并验证线上接口
