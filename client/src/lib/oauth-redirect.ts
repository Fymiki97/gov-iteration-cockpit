/** 必须与 comate.json 的 redirect_url、应用身份里登记的回调地址完全一致 */
const REGISTERED_OAUTH_REDIRECT_URI =
  "https://o.wpsgo.com/app/41000207/9w1qvC8NVtKs/api/oauth/callback";

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

/**
 * OAuth 回调地址必须用预注册的那一条，不能按当前页面 origin/pathname 拼接。
 * 从金山文档、客户端 webview 打开时 location 会变成其它域名，拼出来的地址会触发 40000001。
 */
export function getOAuthRedirectUri(): string {
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    return getAppApiUrl("api/oauth/callback");
  }
  return REGISTERED_OAUTH_REDIRECT_URI;
}
