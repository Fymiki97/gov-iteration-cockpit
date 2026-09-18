/**
 * 把请求的完整 cookie 头交给多维表存储。
 * 多维表鉴权需要其中的 `capa_session_<WPS_APP_ID>` JWT，因此这里透传整段 cookie 头。
 * 每个 defect-remind-tasks 路由在开头调用一次。
 */
import { setDbCookie } from "./defect-remind-store";

export function ensureDbToken(event: any): void {
  const cookieHeader = getRequestHeader(event, "cookie") ?? "";
  if (cookieHeader) setDbCookie(cookieHeader);
}
