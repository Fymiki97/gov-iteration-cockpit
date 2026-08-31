import { defineNitroConfig } from 'nitropack/config'
import { config } from 'dotenv'

config()

export default defineNitroConfig({
  compatibilityDate: '2026-04-23',
  // 依赖全部内联进 bundle，产物不再有 .output/server/node_modules。
  // 部署管线的 $system-zip 重打包会丢 node_modules，导致线上 ERR_MODULE_NOT_FOUND（consola）崩溃。
  externals: {
    inline: [(id?: string) => !!id && !id.startsWith('node:')],
  },
  runtimeConfig: {
    logLevel: '3',
    projectId: '',
    appBaseEndpoint: 'https://o.wpsgo.com/app/app-base',
    // 会话签名密钥（仅服务端使用）。与 WPS_APP_ID/SECRET 齐备时 capability
    // 服务启用 OAuth2 JWT 模式：/api/oauth/callback 才会注册，前端才能触发授权页。
    SESSION_SECRET: '54229e9b3594705a4f1db32599c5086a7b89ad5465707c3b686dd7d40a85c887',
    WPS_APP_ID: 'AK20251127ECOXII',
    WPS_APP_SECRET: 'f59d077c03b8d65fa9f257c5ae3155e9',
    nitro: {
      envPrefix: '',
    },
  },
})
