import { createClient } from "@wps365-open/appbase-js";

/**
 * Create an AppBase client scoped to the current request.
 *
 * - `projectId`: from Nitro runtimeConfig (production), falls back to
 *   incoming `X-Project-Id` header (local dev, injected by Vite proxy).
 * - Auth: forwards cookies (production) and debug headers (local dev).
 *
 * Usage in a route handler:
 * ```ts
 * export default defineEventHandler(async (event) => {
 *   const client = useAppBase(event)
 *   const { data, error } = await client.from('todos').select()
 *   return { data, error }
 * })
 * ```
 */
export function useAppBase(event: Parameters<Parameters<typeof defineEventHandler>[0]>[0]) {
  const config = useRuntimeConfig(event);
  const cookie = getHeader(event, "cookie");
  const debugToken = getHeader(event, "x-debug-token");
  const debugUserId = getHeader(event, "x-debug-user-id");
  const projectId = (config.projectId as string) || getHeader(event, "x-project-id") || "";

  return createClient({
    projectId,
    fetch: (url, init) =>
      globalThis.fetch(url, {
        ...init,
        headers: {
          ...(init?.headers as Record<string, string>),
          ...(cookie ? { cookie } : {}),
          ...(debugToken ? { "X-Debug-Token": debugToken } : {}),
          ...(debugUserId ? { "X-Debug-User-Id": debugUserId } : {}),
        },
      }),
    auth: { persistSession: false },
  });
}
