/** 应用在平台上的基础路径，始终带尾斜杠，避免无斜杠时 `./api` 解析到上一级 */
export function getAppBaseUrl(): string {
  const basePath = location.pathname
    .replace(/\/index\.html$/, "")
    .replace(/\/?$/, "/");
  return `${location.origin}${basePath}`;
}

export function getAppApiUrl(path: string): string {
  return new URL(path.replace(/^\//, ""), getAppBaseUrl()).href;
}

/** 构造 OAuth 回调地址，兼容子路径部署与无尾部斜杠的访问 URL */
export function getOAuthRedirectUri(): string {
  return getAppApiUrl("api/oauth/callback");
}
