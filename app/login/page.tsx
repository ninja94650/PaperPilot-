"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const supabase = createClient();
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { display_name: name }, emailRedirectTo: window.location.origin + "/auth/callback" } });
        if (error) throw error;
        if (data.session) router.push("/account");
        else setMessage("Check your inbox to confirm your email, then sign in.");
      } else if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + "/auth/callback?next=/account" });
        if (error) throw error;
        setMessage("If an account exists for that email, a password-reset link is on its way.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push("/account"); router.refresh();
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Something went wrong. Please try again."); }
    finally { setBusy(false); }
  }

  const title = mode === "signup" ? "Create your account" : mode === "reset" ? "Reset your password" : "Welcome back";
  return <main style={{minHeight:"100vh",background:"#f7f8fc",display:"grid",placeItems:"center",padding:24,color:"#182033"}}>
    <section style={{width:"100%",maxWidth:440,background:"#fff",border:"1px solid #e8eaf1",borderRadius:24,padding:32,boxShadow:"0 24px 70px rgba(30,40,80,.08)"}}>
      <Link href="/" style={{display:"inline-flex",alignItems:"center",gap:10,textDecoration:"none",color:"#182033",fontWeight:800,fontSize:20,marginBottom:30}}><span style={{width:38,height:38,display:"grid",placeItems:"center",borderRadius:12,background:"#6957e8",color:"#fff"}}>P</span>paper<span style={{color:"#6957e8",marginLeft:-10}}>pilot.</span></Link>
      <div style={{fontSize:11,fontWeight:800,letterSpacing:2,color:"#7568d9",marginBottom:10}}>YOUR DOCUMENT WORKSPACE</div>
      <h1 style={{fontSize:30,letterSpacing:-1,margin:"0 0 8px"}}>{title}</h1>
      <p style={{color:"#737b8d",fontSize:14,lineHeight:1.6,margin:"0 0 24px"}}>{mode === "signup" ? "Save your documents and pick up where you left off." : mode === "reset" ? "We’ll email you a secure link to choose a new password." : "Sign in to access your documents and processing history."}</p>
      <form onSubmit={submit} style={{display:"grid",gap:14}}>
        {mode === "signup" && <label style={labelStyle}>Your name<input style={inputStyle} value={name} onChange={e=>setName(e.target.value)} autoComplete="name" required /></label>}
        <label style={labelStyle}>Email address<input style={inputStyle} type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" required /></label>
        {mode !== "reset" && <label style={labelStyle}>Password<input style={inputStyle} type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength={8} autoComplete={mode === "signup" ? "new-password" : "current-password"} required /></label>}
        {mode === "signin" && <button type="button" onClick={()=>setMode("reset")} style={{justifySelf:"end",border:0,background:"none",color:"#6957e8",fontWeight:700,cursor:"pointer"}}>Forgot password?</button>}
        <button disabled={busy} type="submit" style={{border:0,borderRadius:12,padding:"14px 18px",background:"#6957e8",color:"#fff",fontWeight:800,fontSize:14,cursor:busy?"wait":"pointer",opacity: busy ? 0.7 : 1}}>{busy ? "Please wait…" : mode === "signup" ? "Create account" : mode === "reset" ? "Send reset link" : "Sign in"}</button>
      </form>
      {message && <p role="status" style={{background:"#f2f0ff",color:"#5545b5",padding:12,borderRadius:10,fontSize:13,lineHeight:1.5,marginTop:16}}>{message}</p>}
      <div style={{borderTop:"1px solid #edf0f5",marginTop:24,paddingTop:20,textAlign:"center",fontSize:13,color:"#737b8d"}}>
        {mode === "signin" ? <>New to PaperPilot? <button onClick={()=>{setMode("signup");setMessage("");}} style={linkStyle}>Create an account</button></> : <button onClick={()=>{setMode("signin");setMessage("");}} style={linkStyle}>Back to sign in</button>}
      </div>
      <p style={{fontSize:11,color:"#9aa1af",textAlign:"center",lineHeight:1.5,marginTop:22}}>Your account protects your cloud workspace. Uploaded documents remain private to your account.</p>
    </section>
  </main>;
}

const labelStyle: React.CSSProperties = {display:"grid",gap:7,fontSize:12,fontWeight:700,color:"#424b5d"};
const inputStyle: React.CSSProperties = {width:"100%",boxSizing:"border-box",border:"1px solid #dfe3ec",borderRadius:11,padding:"13px 14px",fontSize:14,outlineColor:"#8173e8",color:"#182033",background:"#fff"};
const linkStyle: React.CSSProperties = {border:0,background:"none",color:"#6957e8",fontWeight:800,cursor:"pointer",padding:0};
