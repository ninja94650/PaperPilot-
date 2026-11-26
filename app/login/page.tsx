"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileStack, ShieldCheck, ArrowRight, Check, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup" | "reset">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const supabase = createClient();
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: name },
            emailRedirectTo: window.location.origin + "/auth/callback",
          },
        });
        if (error) throw error;
        if (data.session) router.push("/account");
        else setMessage("Verification link sent! Please check your email to activate your account.");
      } else if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + "/auth/callback?next=/account",
        });
        if (error) throw error;
        setMessage("Password reset link has been dispatched to your email.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push("/account");
        router.refresh();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Authentication failed. Please verify credentials.");
    } finally {
      setBusy(false);
    }
  }

  const title = mode === "signup" ? "Create PaperPilot Account" : mode === "reset" ? "Reset Account Password" : "Welcome Back";

  return (
    <main style={mainStyle}>
      <section style={cardStyle}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <Link href="/" style={brandStyle}>
            <div style={logoIconStyle}>
              <FileStack size={19} color="#fff" />
            </div>
            <span>paper<span style={{ color: "#4F46E5" }}>pilot</span></span>
          </Link>
          <div style={kickerStyle}>ENTERPRISE DOCUMENT WORKSPACE</div>
          <h1 style={titleStyle}>{title}</h1>
          <p style={subtitleStyle}>
            {mode === "signup"
              ? "Unlock private cloud vaults, encrypted storage, and persistent history."
              : mode === "reset"
              ? "We'll send you an authorized link to securely configure a new password."
              : "Sign in to access your cloud document library and synchronized workflows."}
          </p>
        </div>

        <form onSubmit={submit} style={{ display: "grid", gap: 14 }}>
          {mode === "signup" && (
            <label style={labelStyle}>
              Full Name
              <input
                style={inputStyle}
                placeholder="Jane Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                required
              />
            </label>
          )}

          <label style={labelStyle}>
            Work Email
            <input
              style={inputStyle}
              type="email"
              placeholder="jane@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>

          {mode !== "reset" && (
            <label style={labelStyle}>
              Password
              <input
                style={inputStyle}
                type="password"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                required
              />
            </label>
          )}

          {mode === "signin" && (
            <button
              type="button"
              onClick={() => setMode("reset")}
              style={forgotLinkStyle}
            >
              Forgot password?
            </button>
          )}

          <button
            disabled={busy}
            type="submit"
            style={submitBtnStyle}
          >
            {busy ? "Authenticating..." : mode === "signup" ? "Create Account" : mode === "reset" ? "Send Reset Email" : "Sign In to Workspace"}
          </button>
        </form>

        {message && (
          <div style={messageStyle}>
            <Sparkles size={14} style={{ marginRight: 6 }} />
            {message}
          </div>
        )}

        <div style={footerRowStyle}>
          {mode === "signin" ? (
            <span>
              New to PaperPilot?{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("signup");
                  setMessage("");
                }}
                style={inlineSwitchStyle}
              >
                Create an account
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => {
                setMode("signin");
                setMessage("");
              }}
              style={inlineSwitchStyle}
            >
              ← Back to Sign In
            </button>
          )}
        </div>

        <div style={trustRowStyle}>
          <ShieldCheck size={14} color="#10B981" />
          <span>Encrypted with Supabase Auth & Private Storage</span>
        </div>
      </section>
    </main>
  );
}

const mainStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#F7F8FC",
  display: "grid",
  placeItems: "center",
  padding: 24,
  fontFamily: "'Plus Jakarta Sans', sans-serif",
};

const cardStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 440,
  background: "#FFFFFF",
  border: "1px solid #E2E8F0",
  borderRadius: 20,
  padding: "36px 32px",
  boxShadow: "0 18px 45px rgba(15, 23, 42, 0.08)",
};

const brandStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 10,
  fontSize: 20,
  fontWeight: 800,
  color: "#0F172A",
  textDecoration: "none",
  marginBottom: 16,
};

const logoIconStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 8,
  background: "linear-gradient(135deg, #4F46E5, #8B5CF6)",
  display: "grid",
  placeItems: "center",
};

const kickerStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: 1.4,
  color: "#4F46E5",
  marginBottom: 6,
};

const titleStyle: React.CSSProperties = {
  fontSize: 24,
  fontWeight: 800,
  letterSpacing: -0.6,
  color: "#0F172A",
  margin: 0,
};

const subtitleStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#64748B",
  lineHeight: 1.5,
  margin: "8px 0 0",
};

const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 12,
  fontWeight: 700,
  color: "#334155",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #E2E8F0",
  borderRadius: 10,
  padding: "11px 14px",
  fontSize: 14,
  color: "#0F172A",
  background: "#F8FAFC",
  outline: "none",
};

const forgotLinkStyle: React.CSSProperties = {
  justifySelf: "end",
  border: 0,
  background: "none",
  color: "#4F46E5",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const submitBtnStyle: React.CSSProperties = {
  height: 44,
  border: 0,
  borderRadius: 10,
  background: "#4F46E5",
  color: "#FFFFFF",
  fontWeight: 800,
  fontSize: 14,
  cursor: "pointer",
  boxShadow: "0 4px 14px rgba(79, 70, 229, 0.25)",
  marginTop: 6,
};

const messageStyle: React.CSSProperties = {
  background: "#EEF2FF",
  color: "#4338CA",
  border: "1px solid rgba(79, 70, 229, 0.2)",
  padding: "10px 14px",
  borderRadius: 8,
  fontSize: 12,
  marginTop: 14,
  lineHeight: 1.4,
  display: "flex",
  alignItems: "center",
};

const footerRowStyle: React.CSSProperties = {
  borderTop: "1px solid #E2E8F0",
  marginTop: 20,
  paddingTop: 16,
  textAlign: "center",
  fontSize: 13,
  color: "#64748B",
};

const inlineSwitchStyle: React.CSSProperties = {
  border: 0,
  background: "none",
  color: "#4F46E5",
  fontWeight: 800,
  cursor: "pointer",
};

const trustRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  fontSize: 11,
  color: "#94A3B8",
  marginTop: 20,
};
