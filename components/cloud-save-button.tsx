"use client";
import {useState} from "react";
import {CloudUpload} from "lucide-react";
import {createClient} from "@/lib/supabase/client";
export default function CloudSaveButton({files}:{files:File[]}) {
 const [busy,setBusy]=useState(false); const [message,setMessage]=useState("");
 async function save(){
  if(!files.length||busy)return;setBusy(true);setMessage("");
  try{
   const supabase=createClient();const {data:{user},error:authError}=await supabase.auth.getUser();
   if(authError||!user){window.location.href="/login";return;}
   let count=0;
   for(const file of files){
    const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,"_").slice(0,120)||"document";
    const path=user.id+"/"+crypto.randomUUID()+"/"+safeName;
    const {error:uploadError}=await supabase.storage.from("documents").upload(path,file,{contentType:file.type||"application/octet-stream",upsert:false});
    if(uploadError)throw new Error("Upload failed for "+file.name+": "+uploadError.message);
    const {error:rowError}=await supabase.from("documents").insert({owner_id:user.id,name:file.name,mime_type:file.type||"application/octet-stream",size_bytes:file.size,storage_path:path,status:"uploaded"});
    if(rowError){await supabase.storage.from("documents").remove([path]);throw new Error("Could not save library record: "+rowError.message);}
    count++;
   }
   setMessage(count+" file(s) saved privately."); 
  }catch(error){setMessage(error instanceof Error?error.message:"Cloud upload failed.");}
  finally{setBusy(false);}
 }
 return <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}><button className="clear-button" onClick={save} disabled={busy||!files.length}>{busy?"Saving…":"Save to cloud"} <CloudUpload size={14}/></button>{message&&<small role="status" style={{color:"#587a62"}}>{message}</small>}</div>;
}
