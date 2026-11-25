import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");
  const candidate = next && next.startsWith("/") && !next.startsWith("//") ? new URL(next, origin) : new URL("/account", origin);
  const safeNext = candidate.origin === origin ? candidate : new URL("/account", origin);
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(safeNext);
  }
  return NextResponse.redirect(new URL("/login?error=auth_callback", origin));
}
