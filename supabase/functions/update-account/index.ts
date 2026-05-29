import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization")!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: callerProfile } = await callerClient.from("profiles").select("role").eq("id", caller.id).single();
    if (!callerProfile || callerProfile.role !== "it_manager") {
      return new Response(JSON.stringify({ error: "Only IT Manager can update accounts" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { user_id, full_name, role, email, password, class: klass } = await req.json();
    if (!user_id || !full_name) {
      return new Response(JSON.stringify({ error: "user_id and full_name are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ALLOWED_CLASSES = ["Beginner", "Junior", "Senior", "Neutral"];
    if (klass !== undefined && klass !== null && !ALLOWED_CLASSES.includes(klass)) {
      return new Response(JSON.stringify({ error: "Invalid class." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Prevent IT Manager from changing their own role (no self-demotion/elevation)
    if (user_id === caller.id && role && role !== "it_manager") {
      return new Response(JSON.stringify({ error: "Cannot change your own role" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Prevent elevating a non-admin user to admin. Allow keeping an existing admin as admin.
    if (role === "admin") {
      const { data: targetProfile } = await callerClient.from("profiles").select("role").eq("id", user_id).single();
      if (!targetProfile || targetProfile.role !== "admin") {
        return new Response(JSON.stringify({ error: "Cannot elevate user to admin via this endpoint." }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
    const ALLOWED_ROLES = ["staff", "assistant", "it_manager", "admin"];
    if (role && !ALLOWED_ROLES.includes(role)) {
      return new Response(JSON.stringify({ error: "Invalid role." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (email && !email.endsWith("@ayty.com")) {
      return new Response(JSON.stringify({ error: "Only @ayty.com emails are allowed" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (password && password.length < 6) {
      return new Response(JSON.stringify({ error: "Password must be at least 6 characters" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Update auth user if email or password changed
    const authUpdate: any = {};
    if (email) authUpdate.email = email;
    if (password) authUpdate.password = password;

    if (Object.keys(authUpdate).length > 0) {
      // Block IT Manager from resetting credentials of admin accounts (privilege escalation prevention).
      const { data: targetProfile } = await adminClient
        .from("profiles").select("role").eq("id", user_id).maybeSingle();
      if (targetProfile?.role === "admin" && user_id !== caller.id) {
        return new Response(JSON.stringify({ error: "Cannot modify admin credentials." }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error: authErr } = await adminClient.auth.admin.updateUserById(user_id, authUpdate);
      if (authErr) {
        return new Response(JSON.stringify({ error: authErr.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Update profile (only the fields admin endpoint owns)
    const profileUpdate: Record<string, unknown> = { full_name };
    if (role) profileUpdate.role = role;

    const { data: updated, error: profileErr } = await adminClient
      .from("profiles")
      .update(profileUpdate)
      .eq("id", user_id)
      .select("id, full_name, role")
      .maybeSingle();

    if (profileErr) {
      return new Response(JSON.stringify({ error: profileErr.message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!updated) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, profile: updated }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[update-account] error:", err);
    return new Response(JSON.stringify({ error: "An internal error occurred. Please try again." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
