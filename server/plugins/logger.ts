export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', (event) => {
    const traceId =
      getHeader(event, 'x-request-id') ||
      getHeader(event, 'x-trace-id') ||
      crypto.randomUUID()

    event.context.traceId = traceId
    event.context._requestStartTime = Date.now()

    setHeader(event, 'X-Request-Id', traceId)

    const log = useLogger(event)
    log.debug(`--> ${event.method} ${getRequestURL(event).pathname}`)
  })

  nitroApp.hooks.hook('afterResponse', (event) => {
    const duration = Date.now() - (event.context._requestStartTime || 0)
    const status = getResponseStatus(event)
    const log = useLogger(event)
    const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info'
    log[level](`<-- ${event.method} ${getRequestURL(event).pathname} ${status} ${duration}ms`)
  })

  logger.info('Logger plugin initialized')
})
