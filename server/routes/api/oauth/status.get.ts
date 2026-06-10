const REQUIRED_SCOPES = [
  "kso.dbsheet.readwrite",
  "kso.user_current_id.read",
  "kso.user_base.read",
];

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const appId = config.WPS_APP_ID as string;
  const sessionSecret = config.SESSION_SECRET as string;

  if (!appId || !sessionSecret) {
    return { isAuthorized: true };
  }

  const cookieName = `capa_session_${appId}`;
  const cookie = getCookie(event, cookieName);

  return {
    isAuthorized: !!cookie,
    appId,
    scope: REQUIRED_SCOPES.join(","),
  };
});
