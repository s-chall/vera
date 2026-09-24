// Records a verification decision. Deletes the identity document first and
// only records the outcome if that succeeded, so an approved reporter never
// leaves their document behind.
import { createClient } from "npm:@supabase/supabase-js@2";

const required = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const authorization = request.headers.get("authorization");
  if (!authorization) return Response.json({ error: "Not signed in" }, { status: 401 });

  const admin = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const token = authorization.replace(/^Bearer\s+/i, "");
  const { data: { user }, error: userError } = await admin.auth.getUser(token);
  if (userError || !user) return Response.json({ error: "Not signed in" }, { status: 401 });

  const { data: reviewer } = await admin
    .from("journalists").select("id, is_admin").eq("owner_user_id", user.id).maybeSingle();
  if (!reviewer?.is_admin) {
    return Response.json({ error: "Only an admin can review verification" }, { status: 403 });
  }

  let body: { requestId?: string; approve?: boolean; reason?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected JSON" }, { status: 400 });
  }
  if (!body.requestId || typeof body.approve !== "boolean") {
    return Response.json({ error: "requestId and approve are required" }, { status: 400 });
  }

  const { data: target, error: targetError } = await admin
    .from("verification_requests").select("id, status, document_path")
    .eq("id", body.requestId).maybeSingle();
  if (targetError || !target) return Response.json({ error: "No such request" }, { status: 404 });
  if (target.status !== "pending") {
    return Response.json({ error: `Request already ${target.status}` }, { status: 409 });
  }

  if (target.document_path) {
    const { error: removeError } = await admin.storage
      .from("verification-documents").remove([target.document_path]);
    if (removeError) {
      return Response.json(
        { error: `Could not delete the document, decision not recorded: ${removeError.message}` },
        { status: 500 },
      );
    }
  }

  const { error } = await admin.rpc("decide_verification", {
    request_id: body.requestId,
    approve: body.approve,
    reason: body.reason ?? null,
  });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // reviewed_by is recorded here because the RPC now runs as service_role
  await admin.from("verification_requests")
    .update({ reviewed_by: reviewer.id }).eq("id", body.requestId);

  return Response.json({ ok: true });
});
