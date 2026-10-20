import React from "react";
export default function Pager({page,onChange,total,size=15}) {
 const pages=Math.max(1,Math.ceil(total/size));
 if(total<=size) return null;
 return <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:12,padding:"12px",fontSize:12}}>
 <button type="button" disabled={page<=1} onClick={()=>onChange(Math.max(1,page-1))}>← Previous</button>
 <span>Page {page} of {pages} · {total} records</span>
 <button type="button" disabled={page>=pages} onClick={()=>onChange(Math.min(pages,page+1))}>Next →</button>
 </div>;
}
