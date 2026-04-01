import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TEST_ACCOUNTS = [
  { email: "admin@school.com", password: "admin123", full_name: "Admin User", role: "admin" },
  { email: "assistant@school.com", password: "assistant123", full_name: "Assistant User", role: "assistant" },
  { email: "staff@school.com", password: "staff123", full_name: "Staff User", role: "staff" },
  { email: "itmanager@ayty.com", password: "itmanager@2026", full_name: "IT Manager", role: "it_manager" },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const results: any[] = [];

    for (const account of TEST_ACCOUNTS) {
      // Check if user already exists
      const { data: existingUsers } = await adminClient.auth.admin.listUsers();
      const existing = existingUsers?.users?.find((u: any) => u.email === account.email);

      if (existing) {
        // Update profile role to ensure it's correct
        await adminClient.from("profiles").update({
          role: account.role,
          full_name: account.full_name,
        }).eq("id", existing.id);
        results.push({ email: account.email, status: "already exists, role updated" });
        continue;
      }

      // Create user
      const { data, error } = await adminClient.auth.admin.createUser({
        email: account.email,
        password: account.password,
        email_confirm: true,
        user_metadata: { full_name: account.full_name },
      });

      if (error) {
        results.push({ email: account.email, status: "error", message: error.message });
        continue;
      }

      // Wait briefly for trigger to create profile, then update role
      if (data.user) {
        // Small delay to let the trigger fire
        await new Promise((r) => setTimeout(r, 500));
        
        // Upsert profile to ensure it exists with correct role
        await adminClient.from("profiles").upsert({
          id: data.user.id,
          role: account.role,
          full_name: account.full_name,
        }, { onConflict: "id" });
        
        results.push({ email: account.email, status: "created", role: account.role });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
