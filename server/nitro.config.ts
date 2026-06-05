import { defineNitroConfig } from 'nitropack/config'
import { config } from 'dotenv'

config()

export default defineNitroConfig({
  compatibilityDate: '2026-04-23',
  runtimeConfig: {
    logLevel: '3',
    projectId: '',
    appBaseEndpoint: 'https://o.wpsgo.com/app/app-base',
    nitro: {
      envPrefix: '',
    },
  },
})
