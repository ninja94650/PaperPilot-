import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CloudDocuments from "@/components/cloud-documents";
import { FileStack, ArrowLeft, LogOut, ShieldCheck, HardDrive } from "lucide-react";

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: documents } = await supabase
    .from("documents")
    .select("id,name,mime_type,size_bytes,status,storage_path,created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  await supabase
    .from("profiles")
    .upsert(
      {
        id: user.id,
        display_name: user.user_metadata?.display_name ?? user.email?.split("@")[0] ?? "PaperPilot user",
      },
      { onConflict: "id", ignoreDuplicates: true }
    );

  async function signOut() {
    "use server";
    const client = await createClient();
    await client.auth.signOut();
    redirect("/");
  }

  return (
    <main style={{ minHeight: "100vh", background: "#F7F8FC", padding: "28px 24px", color: "#0F172A", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div style={{ maxWidth: 1040, margin: "0 auto" }}>
        {/* Navigation Header */}
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 28 }}>
          <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 18, fontWeight: 800, color: "#0F172A", textDecoration: "none" }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: "linear-gradient(135deg, #4F46E5, #8B5CF6)", display: "grid", placeItems: "center" }}>
              <FileStack size={17} color="#fff" />
            </div>
            <span>paper<span style={{ color: "#4F46E5" }}>pilot</span></span>
          </Link>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, color: "#4F46E5", textDecoration: "none", padding: "8px 12px", background: "#EEF2FF", borderRadius: 8 }}>
              <ArrowLeft size={14} /> Back to Studio
            </Link>
            <form action={signOut}>
              <button style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid #E2E8F0", borderRadius: 8, padding: "8px 12px", background: "#FFFFFF", fontWeight: 700, fontSize: 13, cursor: "pointer", color: "#475569" }}>
                <LogOut size={14} /> Sign Out
              </button>
            </form>
          </div>
        </header>

        {/* User Account Card */}
        <section style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 16, padding: "24px 28px", marginBottom: 20, boxShadow: "0 4px 16px rgba(15, 23, 42, 0.04)" }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.4, color: "#4F46E5", marginBottom: 6 }}>
            AUTHENTICATED WORKSPACE
          </div>
          <h1 style={{ fontSize: 26, letterSpacing: -0.6, margin: "0 0 6px" }}>Cloud Document Vault</h1>
          <p style={{ color: "#64748B", margin: 0, fontSize: 13 }}>
            Signed in as <b>{user.email}</b>. Documents uploaded here are encrypted and isolated to your account.
          </p>
        </section>

        {/* Cloud Documents Card */}
        <section style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 16, padding: "24px 28px", boxShadow: "0 4px 16px rgba(15, 23, 42, 0.04)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h2 style={{ fontSize: 18, margin: 0, fontWeight: 800 }}>Saved Cloud Documents</h2>
              <p style={{ fontSize: 12, color: "#64748B", margin: "4px 0 0" }}>
                Encrypted storage managed by Supabase Vault
              </p>
            </div>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: "#10B981", background: "#ECFDF5", padding: "4px 10px", borderRadius: 20 }}>
              <ShieldCheck size={13} /> Active RLS Encryption
            </span>
          </div>

          <CloudDocuments documents={documents ?? []} />
        </section>
      </div>
    </main>
  );
}
