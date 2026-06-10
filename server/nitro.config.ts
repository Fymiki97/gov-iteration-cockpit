import { defineNitroConfig } from 'nitropack/config'
import { config } from 'dotenv'

config()

export default defineNitroConfig({
  compatibilityDate: '2026-04-23',
  runtimeConfig: {
    logLevel: '3',
    projectId: '',
    appBaseEndpoint: 'https://o.wpsgo.com/app/app-base',
    SESSION_SECRET: '7sK9dF2gP5aR8jL3zQ1bN6cV4mH0tG7wE',
    WPS_APP_ID: 'AK20260401JJOYXC',
    WPS_APP_SECRET: 'f59d077c03b8d65fa9f257c5ae3155e9',
    nitro: {
      envPrefix: '',
    },
  },
})
