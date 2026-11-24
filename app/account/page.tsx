import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function AccountPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: documents } = await supabase.from("documents").select("id,name,mime_type,size_bytes,status,created_at").order("created_at", { ascending: false }).limit(50);
  await supabase.from("profiles").upsert({ id: user.id, display_name: user.user_metadata?.display_name ?? user.email?.split("@")[0] ?? "PaperPilot user" }, { onConflict: "id", ignoreDuplicates: true });
  async function signOut() { "use server"; const client = await createClient(); await client.auth.signOut(); redirect("/"); }
  return <main style={{minHeight:"100vh",background:"#f7f8fc",padding:24,color:"#182033"}}>
    <div style={{maxWidth:1000,margin:"0 auto"}}>
      <header style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:16,flexWrap:"wrap",padding:"14px 0 28px"}}><Link href="/" style={{fontWeight:850,fontSize:22,color:"#182033",textDecoration:"none"}}>paper<span style={{color:"#6957e8"}}>pilot.</span></Link><div style={{display:"flex",alignItems:"center",gap:14}}><span style={{fontSize:13,color:"#737b8d"}}>{user.email}</span><form action={signOut}><button style={{border:"1px solid #e1e4ed",borderRadius:10,padding:"9px 14px",background:"#fff",fontWeight:700,cursor:"pointer"}}>Sign out</button></form></div></header>
      <section style={{background:"#fff",border:"1px solid #e8eaf1",borderRadius:22,padding:28,marginBottom:22}}><div style={{fontSize:11,fontWeight:800,letterSpacing:2,color:"#7568d9"}}>YOUR ACCOUNT</div><h1 style={{fontSize:32,letterSpacing:-1,margin:"8px 0"}}>Your document workspace</h1><p style={{color:"#737b8d",margin:0}}>Signed in as {user.email}. Your private cloud library will appear here.</p></section>
      <section style={{background:"#fff",border:"1px solid #e8eaf1",borderRadius:22,padding:28}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}><div><h2 style={{fontSize:20,margin:"0 0 5px"}}>Recent documents</h2><p style={{fontSize:13,color:"#737b8d",margin:0}}>Documents saved to your PaperPilot account</p></div><Link href="/" style={{color:"#6957e8",fontWeight:800,fontSize:13,textDecoration:"none"}}>Open tools →</Link></div>
        {documents?.length ? <div style={{marginTop:20,display:"grid",gap:10}}>{documents.map(doc=><div key={doc.id} style={{display:"flex",justifyContent:"space-between",gap:12,padding:14,border:"1px solid #edf0f5",borderRadius:12}}><div><b>{doc.name}</b><div style={{fontSize:12,color:"#737b8d",marginTop:4}}>{doc.mime_type} · {Math.ceil(Number(doc.size_bytes)/1024)} KB</div></div><span style={{fontSize:12,color:"#737b8d"}}>{doc.status}</span></div>)}</div> : <div style={{marginTop:20,padding:26,border:"1px dashed #dfe3ec",borderRadius:14,textAlign:"center",color:"#737b8d",fontSize:14}}>No cloud documents yet. Your current PDF editor still works locally in your browser.</div>}
      </section>
    </div>
  </main>;
}
