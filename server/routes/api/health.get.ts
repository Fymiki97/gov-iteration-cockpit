export default defineEventHandler((event) => {
  const log = useLogger(event)
  const config = useRuntimeConfig()

  log.info('health check requested')

  return {
    status: 'ok',
    app: config.appName,
    uptime: Math.floor(process.uptime()),
    node: process.version,
  }
})
