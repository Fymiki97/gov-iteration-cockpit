import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import type { ReactNode } from "react";
import { getAppApiUrl, getOAuthRedirectUri } from "@/lib/oauth-redirect";

type OAuthStatus = "checking" | "authorizing" | "authorized" | "error";

interface OAuthContextValue {
  status: OAuthStatus;
  error: string | null;
  retry: () => void;
}

const OAuthContext = createContext<OAuthContextValue | null>(null);
const DEFAULT_SCOPE = "kso.dbsheet.readwrite";

export function useOAuth() {
  return useContext(OAuthContext)!;
}

function OAuthLoading({ status }: { status: "checking" | "authorizing" }) {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#2563eb] mx-auto mb-4" />
        <p className="text-[#4b5563]">
          {status === "checking" ? "检查授权状态..." : "正在授权..."}
        </p>
      </div>
    </div>
  );
}

function OAuthError({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center max-w-md p-6">
        <div className="text-[#ef4444] text-4xl mb-4">⚠</div>
        <h2 className="text-lg font-semibold text-[#1f2937] mb-2">授权失败</h2>
        <p className="text-[#4b5563] mb-4 text-sm">{error ?? "未知错误"}</p>
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-[#2563eb] text-white rounded-md hover:bg-[#1d4ed8] transition-colors"
        >
          重试
        </button>
      </div>
    </div>
  );
}

function waitForOpenSDK(timeoutMs = 8000): Promise<boolean> {
  if (window.OpenSDK?.OAuth2) return Promise.resolve(true);
  return new Promise((resolve) => {
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (window.OpenSDK?.OAuth2) {
        window.clearInterval(timer);
        resolve(true);
        return;
      }
      if (Date.now() - started >= timeoutMs) {
        window.clearInterval(timer);
        resolve(false);
      }
    }, 80);
  });
}

export function OAuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<OAuthStatus>("checking");
  const [error, setError] = useState<string | null>(null);
  const triggerAuthRef = useRef<(appId: string, scope: string) => Promise<void>>(async () => {});

  const checkStatus = useCallback(async () => {
    setStatus("checking");
    setError(null);
    try {
      const res = await fetch(getAppApiUrl("api/oauth/status"), { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data?.message || data?.error || res.statusText;
        if (/appid/i.test(msg)) {
          setError("请前往应用身份页面完成应用身份绑定和配置");
          setStatus("error");
          return;
        }
        // 状态接口异常时不挡住看板，后续会走服务端缓存
        setStatus("authorized");
        return;
      }
      if (data.isAuthorized || !data.appId) {
        setStatus("authorized");
        return;
      }
      await triggerAuthRef.current(data.appId, data.scope);
    } catch {
      setStatus("authorized");
    }
  }, []);

  const triggerAuth = useCallback(
    async (appId: string, scope: string) => {
      const ready = await waitForOpenSDK();
      if (!ready || !window.OpenSDK?.OAuth2) {
        // 平台未注入 OpenSDK 时不阻断页面，由看板走服务端缓存
        setStatus("authorized");
        return;
      }

      const resolvedScope = (typeof scope === "string" && scope.trim()) || DEFAULT_SCOPE;
      setStatus("authorizing");
      const redirectUri = getOAuthRedirectUri();
      const mode = window.OpenSDK.OAuth2.Mode.REDIRECT;

      const state = btoa(JSON.stringify({ redirect_uri: redirectUri, return_url: location.href }));

      const onError = (evt: unknown) => {
        window.OpenSDK.removeEventListener(window.OpenSDK.Events.AuthError, onError);
        setError(String(evt));
        setStatus("error");
      };
      window.OpenSDK.addEventListener(window.OpenSDK.Events.AuthError, onError);

      try {
        window.OpenSDK.OAuth2.authorize({
          appId,
          redirect_uri: redirectUri,
          scope: resolvedScope,
          mode,
          state,
        });
      } catch (err) {
        window.OpenSDK.removeEventListener(window.OpenSDK.Events.AuthError, onError);
        setError(err instanceof Error ? err.message : String(err));
        setStatus("error");
      }
    },
    [],
  );

  triggerAuthRef.current = triggerAuth;

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  if (status === "checking" || status === "authorizing") {
    return <OAuthLoading status={status} />;
  }

  if (status === "error") {
    return <OAuthError error={error} onRetry={() => checkStatus()} />;
  }

  return (
    <OAuthContext value={{ status, error, retry: checkStatus }}>
      {children}
    </OAuthContext>
  );
}
