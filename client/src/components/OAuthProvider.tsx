import { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { ReactNode } from "react";

type OAuthStatus = "checking" | "authorizing" | "authorized" | "error";

interface OAuthContextValue {
  status: OAuthStatus;
  error: string | null;
  retry: () => void;
}

const OAuthContext = createContext<OAuthContextValue | null>(null);

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

export function OAuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<OAuthStatus>("checking");
  const [error, setError] = useState<string | null>(null);

  const checkStatus = useCallback(async () => {
    setStatus("checking");
    try {
      const res = await fetch("./api/oauth/status", { credentials: "include" });
      const data = await res.json();
      if (!res.ok) {
        const msg = data?.message || data?.error || res.statusText;
        setError(
          /appid/i.test(msg)
            ? "请前往应用身份页面完成应用身份绑定和配置"
            : msg,
        );
        setStatus("error");
        return;
      }
      if (data.isAuthorized) {
        setStatus("authorized");
      } else if (!data.appId) {
        setStatus("authorized");
      } else {
        triggerAuth(data.appId, data.scope);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }, []);

  const triggerAuth = useCallback(
    (appId: string, scope: string) => {
      setStatus("authorizing");
      const redirectUri = new URL("./api/oauth/callback", location.href).href;
      const mode = window.OpenSDK.OAuth2.Mode.REDIRECT;
      const isRedirect = mode === window.OpenSDK.OAuth2.Mode.REDIRECT;

      const state = isRedirect
        ? btoa(JSON.stringify({ redirect_uri: redirectUri, return_url: location.href }))
        : btoa(redirectUri);

      if (!isRedirect) {
        const onSuccess = () => {
          cleanup();
          checkStatus();
        };
        const onError = (evt: unknown) => {
          cleanup();
          setError(String(evt));
          setStatus("error");
        };
        const cleanup = () => {
          window.OpenSDK.removeEventListener(window.OpenSDK.Events.OAuth2Message, onSuccess);
          window.OpenSDK.removeEventListener(window.OpenSDK.Events.AuthError, onError);
        };

        window.OpenSDK.addEventListener(window.OpenSDK.Events.OAuth2Message, onSuccess);
        window.OpenSDK.addEventListener(window.OpenSDK.Events.AuthError, onError);
      }

      window.OpenSDK.OAuth2.authorize({
        appId,
        redirect_uri: redirectUri,
        scope,
        mode,
        state,
      });
    },
    [checkStatus],
  );

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
