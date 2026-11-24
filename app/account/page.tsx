import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CloudLibrary from "@/components/cloud-library";

export default async function AccountPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: documents } = await supabase.from("documents").select("id,name,storage_path,mime_type,size_bytes,status,created_at").order("created_at", { ascending: false }).limit(50);
  const { data: jobs } = await supabase.from("processing_jobs").select("id,tool,status,error_message,created_at,completed_at").order("created_at", { ascending: false }).limit(10);
  await supabase.from("profiles").upsert({ id: user.id, display_name: user.user_metadata?.display_name ?? user.email?.split("@")[0] ?? "PaperPilot user" }, { onConflict: "id", ignoreDuplicates: true });
  async function signOut() { "use server"; const client = await createClient(); await client.auth.signOut(); redirect("/"); }
  return <main style={{minHeight:"100vh",background:"#f7f8fc",padding:24,color:"#182033"}}>
    <div style={{maxWidth:1000,margin:"0 auto"}}>
      <header style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:16,flexWrap:"wrap",padding:"14px 0 28px"}}><Link href="/" style={{fontWeight:850,fontSize:22,color:"#182033",textDecoration:"none"}}>paper<span style={{color:"#6957e8"}}>pilot.</span></Link><div style={{display:"flex",alignItems:"center",gap:14}}><span style={{fontSize:13,color:"#737b8d"}}>{user.email}</span><form action={signOut}><button style={{border:"1px solid #e1e4ed",borderRadius:10,padding:"9px 14px",background:"#fff",fontWeight:700,cursor:"pointer"}}>Sign out</button></form></div></header>
      <section style={{background:"#fff",border:"1px solid #e8eaf1",borderRadius:22,padding:28,marginBottom:22}}><div style={{fontSize:11,fontWeight:800,letterSpacing:2,color:"#7568d9"}}>YOUR ACCOUNT</div><h1 style={{fontSize:32,letterSpacing:-1,margin:"8px 0"}}>Your document workspace</h1><p style={{color:"#737b8d",margin:0}}>Signed in as {user.email}. Your private cloud library will appear here.</p></section>
      <CloudLibrary initialDocuments={documents ?? []} />
      <section className="processing-history">
        <div><h2>Recent processing</h2><p>Conversion jobs and their latest status.</p></div>
        {jobs?.length ? <div className="processing-jobs">{jobs.map((job) => <article key={job.id}><span><b>{job.tool.replace(/-/g, " ")}</b><small>{new Date(job.created_at).toLocaleString()}</small></span><span className={"job-status job-" + job.status}>{job.status}</span>{job.error_message && <small className="job-error">{job.error_message}</small>}</article>)}</div> : <p className="processing-empty">Your document processing history will appear here.</p>}
      </section>
    </div>
  </main>;
}
