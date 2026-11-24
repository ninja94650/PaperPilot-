import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  let supabase;
  try { supabase = await createClient(); }
  catch { return NextResponse.json({ error: "Authentication is not configured." }, { status: 503 }); }
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  const { id } = await context.params;
  const { data: owned } = await supabase.from("processing_jobs").select("id,status")
    .eq("id", id).eq("owner_id", user.id).maybeSingle();
  if (!owned) return NextResponse.json({ error: "Processing job not found." }, { status: 404 });
  if (!["queued", "running"].includes(owned.status)) {
    return NextResponse.json({ error: "Only queued or running jobs can be cancelled." }, { status: 409 });
  }
  let admin;
  try { admin = createAdminClient(); }
  catch { return NextResponse.json({ error: "Secure job control is not configured." }, { status: 503 }); }
  const now = new Date().toISOString();
  const update = owned.status === "queued"
    ? { status: "cancelled", cancel_requested_at: now, completed_at: now, progress_message: "Cancelled by user", updated_at: now }
    : { cancel_requested_at: now, progress_message: "Cancellation requested", updated_at: now };
  const { data: job, error } = await admin.from("processing_jobs").update(update)
    .eq("id", id).eq("owner_id", user.id).in("status", ["queued", "running"])
    .select("id,status,cancel_requested_at,progress_message").maybeSingle();
  if (error) return NextResponse.json({ error: "Could not request cancellation." }, { status: 500 });
  if (!job) return NextResponse.json({ error: "The job changed state before cancellation was recorded." }, { status: 409 });
  await admin.from("processing_job_events").insert({
    job_id: id, owner_id: user.id, event_type: "cancellation_requested",
    status: job.status, progress_percent: 0, message: "Cancellation requested by user"
  });
  return NextResponse.json({ job }, { status: 202, headers: { "Cache-Control": "no-store" } });
}
