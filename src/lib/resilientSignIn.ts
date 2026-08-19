import { supabase } from "@/integrations/supabase/client";

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  error?: string;
  error_description?: string;
  msg?: string;
};

const AUTH_URL = import.meta.env.VITE_SUPABASE_URL;
const PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function signInWithXhr(email: string, password: string): Promise<TokenResponse> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `${AUTH_URL}/auth/v1/token?grant_type=password`, true);
    request.timeout = 15_000;
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
    return { error: new Error("The sign-in server returned an incomplete session.") };
  }

  const sessionResult = await Promise.race([
    supabase.auth.setSession({
      access_token: payload.access_token,
      refresh_token: payload.refresh_token,
    }),
    new Promise<{ error: Error }>((resolve) => {
      window.setTimeout(
        () => resolve({ error: new Error("Could not save the sign-in session on this device. Please try again.") }),
        8_000,
      );
    }),
  ]);
  return { error: sessionResult.error };
}

/**
 * Signs in without leaving an uninterruptible GoTrue request holding the
 * browser auth lock. This matters on older Android WebViews and unstable
 * mobile networks: every timed-out attempt is actually aborted before retry.
 */
export async function resilientPasswordSignIn(email: string, password: string) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 12_000);

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
      return { error: new Error(payload.error_description || payload.msg || payload.error || "Sign in failed.") };
    }
    return saveSession(payload);
  } catch {
    // Some older Android browsers leave fetch() hanging even though XHR works.
    // Retry once with the browser's independent XHR transport, not another fetch.
  } finally {
    window.clearTimeout(timeoutId);
  }

  await delay(250);
  try {
    return await saveSession(await signInWithXhr(email, password));
  } catch {
    // Both independent browser transports failed, so this is a device-to-auth
    // network path problem rather than a password or application-state error.
  }

  return {
    error: new Error("The device cannot reach the sign-in service. Please switch between Wi-Fi and mobile data, then try again."),
  };
}