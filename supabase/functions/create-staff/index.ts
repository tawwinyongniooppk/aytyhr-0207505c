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

    // Verify the caller is authenticated
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check caller is IT Manager
    const { data: callerProfile } = await callerClient.from("profiles").select("role").eq("id", caller.id).single();
    if (!callerProfile || callerProfile.role !== "it_manager") {
      return new Response(JSON.stringify({ error: "Only IT Manager can create accounts" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, password, full_name, role, sequence, class: klass } = await req.json();

    if (!email || !password || !full_name) {
      return new Response(JSON.stringify({ error: "Email, password, and name are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ALLOWED_ROLES = ["staff", "assistant", "it_manager"];
    if (role && !ALLOWED_ROLES.includes(role)) {
      return new Response(JSON.stringify({ error: "Invalid role. Admin role cannot be assigned via this endpoint." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ALLOWED_CLASSES = ["Beginner", "Junior", "Senior", "Neutral"];
    if (klass && !ALLOWED_CLASSES.includes(klass)) {
      return new Response(JSON.stringify({ error: "Invalid class." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let seqNum: number | undefined;
    if (sequence !== undefined && sequence !== null && sequence !== "") {
      seqNum = Number(sequence);
      if (!Number.isInteger(seqNum) || seqNum < 1 || seqNum > 100) {
        return new Response(JSON.stringify({ error: "Sequence must be an integer 1–100." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (!email.endsWith("@ayty.com")) {
      return new Response(JSON.stringify({ error: "Only @ayty.com emails are allowed" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (password.length < 6) {
      return new Response(JSON.stringify({ error: "Password must be at least 6 characters" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role to create user
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Check if email already exists
    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    const emailExists = existingUsers?.users?.some((u: any) => u.email === email);
    if (emailExists) {
      return new Response(JSON.stringify({ error: "Email already exists" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update profile with role/class/sequence (profile auto-created by trigger)
    if (data.user) {
      const profileUpdate: Record<string, unknown> = {
        role: role || "staff",
        full_name: full_name,
      };
      if (klass) profileUpdate.class = klass;
      if (seqNum !== undefined) profileUpdate.sequence = seqNum;
      await adminClient.from("profiles").update(profileUpdate).eq("id", data.user.id);
    }

    return new Response(JSON.stringify({ success: true, user_id: data.user?.id }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[create-staff] error:", err);
    return new Response(JSON.stringify({ error: "An internal error occurred. Please try again." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
