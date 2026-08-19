import { supabase } from "@/integrations/supabase/client";

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  error?: string;
  error_description?: string;
  msg?: string;
};

export type SignInFailureKind =
  | "credentials"
  | "auth_unreachable"
  | "session_storage"
  | "server";

export type ResilientSignInResult = {
  error: Error | null;
  kind?: SignInFailureKind;
};

const AUTH_URL = import.meta.env.VITE_SUPABASE_URL;
const PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

function signInWithXhr(email: string, password: string, timeoutMs: number): Promise<TokenResponse> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `${AUTH_URL}/auth/v1/token?grant_type=password`, true);
    request.timeout = timeoutMs;
    request.setRequestHeader("apikey", PUBLISHABLE_KEY);
    request.setRequestHeader("Content-Type", "application/json");
    request.onload = () => {
      let payload: TokenResponse = {};
      try {
        payload = JSON.parse(request.responseText) as TokenResponse;
      } catch {
        // The response is validated below.
      }
      if (request.status >= 200 && request.status < 300) {
        resolve(payload);
        return;
      }
      resolve({
        ...payload,
        error_description:
          payload.error_description || payload.msg || payload.error || "Sign in failed.",
      });
    };
    request.onerror = () => reject(new Error("Network request failed"));
    request.ontimeout = () => reject(new Error("Request timeout"));
    request.send(JSON.stringify({ email: email.trim(), password }));
  });
}

async function saveSession(payload: TokenResponse) {
  if (!payload.access_token || !payload.refresh_token) {
    const message = payload.error_description || payload.msg || payload.error;
    if (message) return { error: new Error(message) };
    return { error: new Error("The sign-in server returned an incomplete session."), kind: "server" as const };
  }

  const sessionResult: ResilientSignInResult = await Promise.race<ResilientSignInResult>([
    supabase.auth.setSession({
      access_token: payload.access_token,
      refresh_token: payload.refresh_token,
    }).then(({ error }) => ({
      error,
      kind: error ? "session_storage" as const : undefined,
    })),
    new Promise<ResilientSignInResult>((resolve) => {
      window.setTimeout(
        () => resolve({ error: new Error("This device could not save the login session. Close other AYTY tabs and try again."), kind: "session_storage" as const }),
        3_000,
      );
    }),
  ]);
  if (sessionResult.error) {
    return { error: sessionResult.error, kind: sessionResult.kind ?? "session_storage" };
  }
  return { error: null };
}

function tokenError(payload: TokenResponse): ResilientSignInResult {
  const message = payload.error_description || payload.msg || payload.error || "Sign in failed.";
  const credentials = /invalid login credentials|invalid.*password/i.test(message);
  return { error: new Error(message), kind: credentials ? "credentials" : "server" };
}

async function authIsReachable(): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 2_000);
  try {
    const response = await fetch(`${AUTH_URL}/auth/v1/health`, {
      headers: { apikey: PUBLISHABLE_KEY },
      signal: controller.signal,
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

/**
 * Signs in without leaving an uninterruptible GoTrue request holding the
 * browser auth lock. This matters on older Android WebViews and unstable
 * mobile networks: every timed-out attempt is actually aborted before retry.
 */
export async function resilientPasswordSignIn(email: string, password: string): Promise<ResilientSignInResult> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 6_000);

  try {
    const response = await fetch(`${AUTH_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: PUBLISHABLE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), password }),
      signal: controller.signal,
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => ({}))) as TokenResponse;
    if (!response.ok) {
      return tokenError(payload);
    }
    return saveSession(payload);
  } catch {
    // Some older Android browsers leave fetch() hanging even though XHR works.
    // Retry once with the browser's independent XHR transport, not another fetch.
  } finally {
    window.clearTimeout(timeoutId);
  }

  try {
    const payload = await signInWithXhr(email, password, 6_000);
    if (payload.error_description || payload.msg || payload.error) return tokenError(payload);
    return await saveSession(payload);
  } catch {
    // Both independent browser transports failed, so this is a device-to-auth
    // network path problem rather than a password or application-state error.
  }

  const reachable = await authIsReachable();
  return reachable
    ? { error: new Error("The sign-in request was interrupted. Please try once more."), kind: "server" }
    : {
        error: new Error("This device cannot reach AYTY login. Switch Wi-Fi/mobile data, or set Android Private DNS to dns.google, then try again."),
        kind: "auth_unreachable",
      };
}