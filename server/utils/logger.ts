import { createConsola } from 'consola'
import type { H3Event } from 'h3'

const config = useRuntimeConfig()

export const logger = createConsola({
  level: Number(config.logLevel) || 3,
  formatOptions: {
    date: true,
  },
})

export function useLogger(event: H3Event, tag?: string) {
  const traceId = event.context.traceId as string | undefined
  const tags = [traceId, tag].filter(Boolean) as string[]
  return logger.withTag(tags.join(':'))
}

declare module 'h3' {
  interface H3EventContext {
    traceId: string
    _requestStartTime: number
  }
}
