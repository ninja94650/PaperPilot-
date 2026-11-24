import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const requestedNext = searchParams.get("next") ?? "/account";
  const candidate = requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? new URL(requestedNext, origin) : new URL("/account", origin);
  const next = candidate.origin === origin ? candidate : new URL("/account", origin);

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(next);
  }

  return NextResponse.redirect(new URL("/login?error=confirmation", origin));
}
