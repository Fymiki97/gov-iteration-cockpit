/** 构造 OAuth 回调地址，兼容子路径部署与无尾部斜杠的访问 URL */
export function getOAuthRedirectUri(): string {
  const basePath = location.pathname
    .replace(/\/index\.html$/, "")
    .replace(/\/?$/, "/");
  return new URL("api/oauth/callback", `${location.origin}${basePath}`).href;
}
