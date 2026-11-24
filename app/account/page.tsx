import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, FileStack, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import CloudLibrary from "@/components/cloud-library";
import "@/app/auth.css";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  let supabase;
  try {
    supabase = await createClient();
  } catch {
    redirect("/login?setup=1");
  }
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");
  const { data: documents, error: documentsError } = await supabase
    .from("documents")
    .select("id,file_name,object_path,mime_type,file_size,created_at")
    .order("created_at", { ascending: false });

  return <main className="account-shell">
    <header className="account-header"><Link href="/" className="auth-brand"><span className="auth-brand-mark"><FileStack size={20} /></span><span>paper<strong>pilot</strong><i>.</i></span></Link><form action="/auth/signout" method="post"><button className="account-signout"><LogOut size={14} /> Sign out</button></form></header>
    <div className="account-content">
      <Link href="/" className="account-back"><ArrowLeft size={14} /> Workspace</Link>
      <div className="account-welcome"><div><div className="auth-eyebrow">YOUR PRIVATE LIBRARY</div><h1>Your documents.</h1><p>Signed in as {user.email}</p></div><span className="account-avatar">{(user.email?.[0] ?? "P").toUpperCase()}</span></div>
      {documentsError ? <div className="auth-setup"><b>Cloud library needs its database migration</b><p>Authentication is connected. Apply the PaperPilot cloud migration to enable secure document history.</p></div> : <CloudLibrary initialDocuments={documents ?? []} />}
    </div>
  </main>;
}
