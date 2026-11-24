"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, LoaderCircle, LockKeyhole } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password.length < 8) { setMessage("Use at least 8 characters."); return; }
    if (password !== confirm) { setMessage("The passwords do not match."); return; }
    setBusy(true); setMessage("");
    try {
      const { error } = await createClient().auth.updateUser({ password });
      if (error) throw error;
      setMessage("Password updated. Taking you to your library…");
      router.replace("/account");
      router.refresh();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Could not update your password.");
    } finally { setBusy(false); }
  }

  return <main className="auth-shell"><Link className="auth-back" href="/login"><ArrowLeft size={15} /> Back to sign in</Link><section className="auth-card">
    <div className="auth-eyebrow"><LockKeyhole size={13} /> ACCOUNT SECURITY</div>
    <h1>Choose a new password.</h1><p className="auth-subtitle">Use at least 8 characters for your PaperPilot account.</p>
    <form className="auth-form" onSubmit={submit}>
      <label>New password<input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      <label>Confirm password<input type="password" autoComplete="new-password" minLength={8} required value={confirm} onChange={(event) => setConfirm(event.target.value)} /></label>
      <button className="auth-submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : null} Update password</button>
    </form>
    {message && <p className="auth-message" role="status">{message}</p>}
  </section></main>;
}
