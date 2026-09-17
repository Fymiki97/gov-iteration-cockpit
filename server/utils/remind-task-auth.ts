/**
 * 从请求 cookie 中提取 gateway_token 并初始化多维表存储。
 * 每个 defect-remind-tasks 路由在开头调用一次。
 */
import { setDbToken } from "./defect-remind-store";

export function ensureDbToken(event: any): void {
  const cookieHeader = getRequestHeader(event, "cookie") ?? "";
  const match = cookieHeader.match(/(?:^|;\s*)gateway_token=([^;]+)/);
  if (match?.[1]) {
    setDbToken(match[1]);
  }
}
