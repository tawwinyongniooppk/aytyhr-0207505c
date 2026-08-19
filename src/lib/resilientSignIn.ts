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

/**
 * Signs in without leaving an uninterruptible GoTrue request holding the
 * browser auth lock. This matters on older Android WebViews and unstable
 * mobile networks: every timed-out attempt is actually aborted before retry.
 */
export async function resilientPasswordSignIn(email: string, password: string) {
  let lastError = "Network connection problem. Please check your internet and try again.";

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch(`${AUTH_URL}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: {
          apikey: PUBLISHABLE_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: email.trim(), password }),
        signal: controller.signal,
        cache: "no-store",
      });

      const payload = (await response.json().catch(() => ({}))) as TokenResponse;
      if (!response.ok) {
        const message = payload.error_description || payload.msg || payload.error || "Sign in failed.";
        return { error: new Error(message) };
      }

      if (!payload.access_token || !payload.refresh_token) {
        throw new Error("The sign-in server returned an incomplete session.");
      }

      const { error } = await supabase.auth.setSession({
        access_token: payload.access_token,
        refresh_token: payload.refresh_token,
      });
      if (error) return { error };
      return { error: null };
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
      if (attempt < 2) await delay(700 * (attempt + 1));
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  return {
    error: new Error(
      lastError.toLowerCase().includes("abort")
        ? "The sign-in server did not respond in time. Please try again."
        : "Network connection problem. Please check your internet and try again.",
    ),
  };
}