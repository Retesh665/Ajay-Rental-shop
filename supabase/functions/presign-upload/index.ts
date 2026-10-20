import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.17";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json" };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers });
serve(async req => {
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const accountId = Deno.env.get("R2_ACCOUNT_ID")?.trim();
    const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID")?.trim();
    const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY")?.trim();
    const bucket = Deno.env.get("R2_BUCKET_NAME")?.trim();
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !supabaseUrl || !supabaseKey) return json({ error: "Missing server configuration" }, 500);
    const bearer = req.headers.get("Authorization");
    if (!bearer?.startsWith("Bearer ")) return json({ error: "Sign in required" }, 401);
    const sb = createClient(supabaseUrl, supabaseKey);
    const { data: { user }, error } = await sb.auth.getUser(bearer.slice(7));
    if (error || !user) return json({ error: "Invalid session" }, 401);
    const { filename, contentType } = await req.json();
    if (typeof filename !== "string" || !filename || filename.length > 200 || !["image/jpeg", "image/png", "image/webp"].includes(contentType)) return json({ error: "Invalid image details" }, 400);
    const key = `customers/${user.id}/${crypto.randomUUID()}-${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const endpoint = `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key}`;
    const url = new URL(endpoint);
    url.searchParams.set("X-Amz-Expires", "300");
    const client = new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" });
    const signed = await client.sign(url.toString(), { method: "PUT", headers: { "Content-Type": contentType }, aws: { signQuery: true } });
    return json({ uploadUrl: signed.url, objectKey: key });
  } catch (error) {
    console.error("R2 presign upload error:", error);
    return json({ error: "Unable to prepare upload" }, 500);
  }
});
