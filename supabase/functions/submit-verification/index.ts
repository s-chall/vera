// Records a verification request. The CNP number is HMAC'd with a key that
// lives only in this function's secrets, so the database never holds it in a
// form anyone can reverse. The CNP space is roughly 28,000, so an unkeyed hash
// would be brute-forced immediately.
import { createClient } from "npm:@supabase/supabase-js@2";

const required = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};

async function fingerprint(cnp: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(required("VERA_CNP_HMAC_KEY")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC", key, new TextEncoder().encode(cnp.replace(/\D/g, "")),
  );
  return new Uint8Array(signature);
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const authorization = request.headers.get("authorization");
  if (!authorization) return Response.json({ error: "Not signed in" }, { status: 401 });

  const url = required("SUPABASE_URL");
  const admin = createClient(url, required("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Validate the caller's token explicitly rather than relying on a forwarded
  // header, which the client does not always apply to auth calls.
  const token = authorization.replace(/^Bearer\s+/i, "");
  const { data: { user }, error: userError } = await admin.auth.getUser(token);
  if (userError || !user) return Response.json({ error: "Not signed in" }, { status: 401 });

  let body: { cnpNumber?: string; documentPath?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected JSON" }, { status: 400 });
  }

  const cnp = (body.cnpNumber ?? "").replace(/\D/g, "");
  const documentPath = body.documentPath ?? "";
  if (!cnp) return Response.json({ error: "A CNP number is required" }, { status: 400 });
  if (!documentPath) return Response.json({ error: "A document is required" }, { status: 400 });

  const { data: journalist, error: journalistError } = await admin
    .from("journalists").select("id, account_type")
    .eq("owner_user_id", user.id).maybeSingle();
  if (journalistError || !journalist) {
    return Response.json({ error: "No account found" }, { status: 400 });
  }
  if (journalist.account_type !== "journalist") {
    return Response.json({ error: "Only journalist accounts need verification" }, { status: 400 });
  }

  // The uploaded object must sit under the caller's own folder, so a path from
  // somewhere else cannot be attached to this request.
  if (!documentPath.startsWith(`${journalist.id}/`)) {
    return Response.json({ error: "That document does not belong to this account" }, { status: 403 });
  }

  const { error } = await admin.from("verification_requests").upsert({
    journalist_id: journalist.id,
    status: "pending",
    cnp_fingerprint: await fingerprint(cnp),
    document_path: documentPath,
    submitted_at: new Date().toISOString(),
    reviewed_at: null,
    reviewed_by: null,
    rejection_reason: null,
  }, { onConflict: "journalist_id" });

  if (error) {
    if (error.code === "23505") {
      return Response.json({ error: "That CNP number is already registered" }, { status: 409 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
});
