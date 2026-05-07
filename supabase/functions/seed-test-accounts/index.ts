// This seeding endpoint has been disabled for security reasons.
// Test accounts must not be creatable from an unauthenticated public endpoint.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return new Response(
    JSON.stringify({ error: "This endpoint is disabled." }),
    { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
