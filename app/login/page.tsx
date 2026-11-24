"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileStack, LoaderCircle, LockKeyhole, Mail } from "lucide-react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup" | "reset">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const configured = isSupabaseConfigured();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!configured) return;
    setBusy(true);
    setMessage("");
    try {
      const supabase = createClient();
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace("/account");
        router.refresh();
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: name.trim() },
            emailRedirectTo: window.location.origin + "/auth/callback?next=/account"
          }
        });
        if (error) throw error;
        if (data.session) { router.replace("/account"); router.refresh(); }
        else setMessage("Check your email to confirm your account, then sign in.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + "/auth/callback?next=/update-password"
        });
        if (error) throw error;
        setMessage("If an account exists for that address, a password reset link has been sent.");
      }
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Authentication could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="auth-shell">
    <div className="auth-orb auth-orb-one" /><div className="auth-orb auth-orb-two" />
    <Link className="auth-back" href="/"><ArrowLeft size={15} /> Back to PaperPilot</Link>
    <section className="auth-card">
      <Link href="/" className="auth-brand"><span className="auth-brand-mark"><FileStack size={21} /></span><span>paper<strong>pilot</strong><i>.</i></span></Link>
      <div className="auth-eyebrow"><LockKeyhole size={13} /> YOUR PRIVATE DOCUMENT SPACE</div>
      <h1>{mode === "signin" ? "Welcome back." : mode === "signup" ? "Make room for more." : "Reset your password."}</h1>
      <p className="auth-subtitle">{mode === "signin" ? "Sign in to access your cloud documents and history." : mode === "signup" ? "Create an account to keep your documents in one secure place." : "We’ll send a secure reset link to your email."}</p>

      {!configured ? <div className="auth-setup">
        <b>Account services need to be connected</b>
        <p>The sign-in experience is implemented, but this deployment needs a Supabase project URL and publishable key before accounts can be activated.</p>
        <code>NEXT_PUBLIC_SUPABASE_URL</code><code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code>
        <small>See <Link href="/#roadmap">the setup notes</Link> or ask the PaperPilot maintainer to connect the project.</small>
      </div> : <form className="auth-form" onSubmit={submit}>
        {mode === "signup" && <label>Full name<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required placeholder="Your name" /></label>}
        <label>Email address<span className="auth-input-wrap"><Mail size={16} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required placeholder="you@example.com" /></span></label>
        {mode !== "reset" && <label>Password<span className="auth-input-wrap"><LockKeyhole size={16} /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "signin" ? "current-password" : "new-password"} required minLength={8} placeholder="At least 8 characters" /></span></label>}
        {mode === "signin" && <button type="button" className="auth-forgot" onClick={() => { setMode("reset"); setMessage(""); }}>Forgot password?</button>}
        <button className="auth-submit" type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : null}{mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}</button>
      </form>}
      {message && <p className="auth-message" role="status">{message}</p>}
      {configured && <div className="auth-switch">{mode === "signin" ? "New to PaperPilot?" : "Already have an account?"} <button onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMessage(""); }}>{mode === "signin" ? "Create an account" : "Sign in"}</button></div>}
      {mode !== "signin" && <button className="auth-back-mode" onClick={() => { setMode("signin"); setMessage(""); }}>Back to sign in</button>}
      <div className="auth-footnote"><LockKeyhole size={12} /> Your documents are private to your account.</div>
    </section>
    <p className="auth-copyright">© 2026 PaperPilot · Thoughtful tools for your documents.</p>
  </main>;
}
