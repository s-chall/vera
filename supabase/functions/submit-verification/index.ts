// Verifies a journalist against the Colegio Nacional de Periodistas register by
// submitting the same form a person would fill in at
// https://cnpven.org/formulario-de-afiliados/
//
// The cedula is used for that request and then discarded. It is never written
// to the database. The CNP number is kept only as a keyed HMAC, because the CNP
// space is roughly 28,000 and an unkeyed hash would be brute-forced instantly.
import { createClient } from "npm:@supabase/supabase-js@2";

const LOOKUP_URL = "https://cnpven.org/formulario-de-afiliados";

// Exactly what the site returns when the pair does not match an affiliate.
const NO_MATCH = /no\s+coincide\s+con\s+un\s+afiliado/i;

// A match renders "Carnet CNP: <n> Nombre y Apellido: ... Seccional CNP: ...".
// We require the register to echo back the same number we asked about, so a
// cached or unrelated page cannot be read as a pass. The response also carries
// the affiliate's real name: it is never stored, logged, or returned.
const matched = (text: string, cnp: string) =>
  new RegExp(`Carnet\\s+CNP:\\s*0*${cnp}\\b`, "i").test(text);

const required = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};

async function fingerprint(cnp: string) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(required("VERA_CNP_HMAC_KEY")),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(cnp)));
}

function stripTags(html: string) {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Ask cnpven.org whether this CNP and cedula belong to an affiliate. */
export async function lookup(cnp: string, cedula: string): Promise<"match" | "no_match" | "inconclusive"> {
  const body = new URLSearchParams({ CNP: cnp, cedula_de_identidad: cedula });
  const response = await fetch(LOOKUP_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": "Mozilla/5.0 (compatible; Vera verification)",
    },
    body,
  });
  if (!response.ok) return "inconclusive";

  const text = stripTags(await response.text());
  if (NO_MATCH.test(text)) return "no_match";
  if (matched(text, cnp)) return "match";
  // Fail closed: an answer we do not recognise is never an automatic pass.
  return "inconclusive";
}

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

  let body: { cnpNumber?: string; cedula?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected JSON" }, { status: 400 });
  }

  const cnp = (body.cnpNumber ?? "").replace(/\D/g, "");
  const cedula = (body.cedula ?? "").trim().toUpperCase().replace(/[^VE0-9]/g, "");
  if (!cnp) return Response.json({ error: "A CNP number is required" }, { status: 400 });
  if (!/^[VE]\d{5,10}$/.test(cedula)) {
    return Response.json({ error: "Cédula must look like V12345678" }, { status: 400 });
  }

  const { data: journalist } = await admin
    .from("journalists").select("id, account_type").eq("owner_user_id", user.id).maybeSingle();
  if (!journalist) return Response.json({ error: "No account found" }, { status: 400 });
  if (journalist.account_type !== "journalist") {
    return Response.json({ error: "Only journalist accounts need verification" }, { status: 400 });
  }

  let outcome: "match" | "no_match" | "inconclusive";
  try {
    outcome = await lookup(cnp, cedula);
  } catch {
    outcome = "inconclusive";
  }

  const { data: saved, error } = await admin.from("verification_requests").upsert({
    journalist_id: journalist.id,
    status: "pending",
    cnp_fingerprint: await fingerprint(cnp),
    document_path: null,
    lookup_outcome: outcome,
    checked_at: new Date().toISOString(),
    submitted_at: new Date().toISOString(),
    reviewed_at: null,
    reviewed_by: null,
    rejection_reason: null,
  }, { onConflict: "journalist_id" }).select("id").single();

  if (error) {
    if (error.code === "23505") {
      return Response.json({ error: "That CNP number is already registered" }, { status: 409 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }

  if (outcome === "no_match") {
    await admin.rpc("decide_verification", {
      request_id: saved.id, approve: false,
      reason: "CNP and cédula did not match an affiliate on the CNP register",
    });
    return Response.json({
      outcome,
      message: "That CNP number and cédula do not match an affiliate on the CNP register.",
    }, { status: 422 });
  }

  if (outcome === "match") {
    await admin.rpc("decide_verification", { request_id: saved.id, approve: true, reason: null });
    return Response.json({ outcome, message: "Verified against the CNP register." });
  }

  return Response.json({
    outcome,
    message: "We could not confirm your registration automatically. A reviewer will check it.",
  });
});
