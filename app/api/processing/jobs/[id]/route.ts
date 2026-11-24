import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  let supabase;
  try { supabase = await createClient(); }
  catch { return NextResponse.json({ error: "Authentication is not configured." }, { status: 503 }); }
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  const { id } = await context.params;
  const { data: job, error } = await supabase.from("processing_jobs")
    .select("id,tool,status,progress_percent,progress_message,error_message,last_error_code,attempt_count,max_attempts,created_at,started_at,heartbeat_at,completed_at,updated_at,cancel_requested_at")
    .eq("id", id).eq("owner_id", user.id).maybeSingle();
  if (error) return NextResponse.json({ error: "Could not read processing status." }, { status: 500 });
  if (!job) return NextResponse.json({ error: "Processing job not found." }, { status: 404 });
  const { data: events } = await supabase.from("processing_job_events")
    .select("event_type,status,progress_percent,message,created_at")
    .eq("job_id", id).eq("owner_id", user.id).order("created_at", { ascending: true }).limit(50);
  return NextResponse.json({ job, events: events ?? [] }, {
    headers: { "Cache-Control": "private, no-store" }
  });
}
