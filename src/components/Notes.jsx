import React, { useEffect, useState } from 'react';
import { Search, Plus, Pin, Pencil, Trash2, X, Check, ListChecks } from 'lucide-react';
import { supabase } from '../lib/supabaseClient.js';

const field = { width:'100%',boxSizing:'border-box',padding:'12px 14px',border:'1px solid #dce3dc',borderRadius:10,font:'inherit',background:'#fff',outlineColor:'#2f6f4e' };
const action = {border:'1px solid #dce3dc',background:'#fff',borderRadius:9,padding:'8px 12px',cursor:'pointer',font:'inherit',display:'inline-flex',alignItems:'center',gap:6};

export default function Notes() {
  const [notes,setNotes] = useState([]);
  const [search,setSearch] = useState('');
  const [title,setTitle] = useState('');
  const [body,setBody] = useState('');
  const [checklist,setChecklist] = useState(false);
  const [items,setItems] = useState([]);
  const [editing,setEditing] = useState(null);
  const [expanded,setExpanded] = useState(false);
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);

  async function load() {
    const {data,error} = await supabase.from('rd_notes').select('*').order('pinned',{ascending:false}).order('updated_at',{ascending:false});
    if (error) throw error;
    setNotes(data || []);
  }
  useEffect(()=>{load().catch(e=>setError(e.message))},[]);
  function clear() {setTitle('');setBody('');setChecklist(false);setItems([]);setEditing(null);setExpanded(false)}
  async function save(e) {
    e.preventDefault();
    if (!title.trim() && !body.trim() && !items.some(x=>x.text.trim())) return;
    setBusy(true);setError('');
    try {
      const payload={title:title.trim(),body:body.trim(),is_checklist:checklist,items:checklist?items.filter(x=>x.text.trim()):[]};
      const result=editing ? await supabase.from('rd_notes').update(payload).eq('id',editing) : await supabase.from('rd_notes').insert(payload);
      if(result.error) throw result.error;
      clear();await load();
    } catch(e) {setError(e.message)} finally {setBusy(false)}
  }
  function begin(n) {setEditing(n.id);setTitle(n.title||'');setBody(n.body||'');setChecklist(!!n.is_checklist);setItems(n.items||[]);setExpanded(true);window.scrollTo({top:0,behavior:'smooth'})}
  async function patch(n,fields) {setError('');try {const r=await supabase.from('rd_notes').update(fields).eq('id',n.id);if(r.error)throw r.error;await load()}catch(e){setError(e.message)}}
  async function remove(n) {if(!window.confirm('Delete this note?'))return;setError('');try {const r=await supabase.from('rd_notes').delete().eq('id',n.id);if(r.error)throw r.error;await load()}catch(e){setError(e.message)}}
  const visible=notes.filter(n=>`${n.title||''} ${n.body||''} ${(n.items||[]).map(x=>x.text).join(' ')}`.toLowerCase().includes(search.toLowerCase()));
  return <main style={{maxWidth:1060,margin:'auto',padding:'28px 20px',color:'#1c2333'}}>
    <header style={{marginBottom:24}}><h2 style={{margin:'0 0 5px',fontSize:25}}>Notes</h2></header>
    {error&&<p role="alert" style={{color:'#a5402c'}}>{error}</p>}
    <div style={{maxWidth:680,margin:'0 auto 26px'}}>
      <div style={{display:'flex',alignItems:'center',gap:10,background:'#fff',border:'1px solid #dce3dc',borderRadius:12,padding:'0 12px',marginBottom:16}}><Search size={18} color="#65746b"/><input aria-label="Search notes" style={{...field,border:0,padding:'13px 0'}} placeholder="Search notes..." value={search} onChange={e=>setSearch(e.target.value)}/>{search&&<button type="button" aria-label="Clear search" style={{...action,border:0,padding:5}} onClick={()=>setSearch('')}><X size={17}/></button>}</div>
      {!expanded ? <button type="button" onClick={()=>setExpanded(true)} style={{...field,textAlign:'left',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'space-between',color:'#67766d',boxShadow:'0 3px 12px #203b2810'}}><span>Take a note...</span><Plus size={20}/></button> :
      <form onSubmit={save} style={{background:'#fff',border:'1px solid #dce3dc',borderRadius:14,padding:18,display:'grid',gap:12,boxShadow:'0 5px 22px #203b2810'}}>
        <input aria-label="Note title" style={{...field,border:0,fontWeight:700,fontSize:16,padding:'8px 4px'}} placeholder="Title (optional)" value={title} onChange={e=>setTitle(e.target.value)}/>
        <textarea aria-label="Note body" style={{...field,border:0,resize:'vertical',padding:'8px 4px'}} rows={3} placeholder="Write your note..." value={body} onChange={e=>setBody(e.target.value)}/>
        <label style={{display:'flex',alignItems:'center',gap:8,fontSize:13,color:'#4b6155'}}><input type="checkbox" checked={checklist} onChange={e=>setChecklist(e.target.checked)}/><ListChecks size={16}/> Checklist</label>
        {checklist&&<div style={{display:'grid',gap:8}}>{items.map((item,i)=><div key={i} style={{display:'flex',gap:8,alignItems:'center'}}><input type="checkbox" checked={item.done} onChange={e=>setItems(a=>a.map((x,j)=>i===j?{...x,done:e.target.checked}:x))}/><input style={{...field,flex:1}} aria-label={`Checklist item ${i+1}`} value={item.text} onChange={e=>setItems(a=>a.map((x,j)=>i===j?{...x,text:e.target.value}:x))}/><button type="button" aria-label="Remove checklist item" style={action} onClick={()=>setItems(a=>a.filter((_,j)=>j!==i))}><X size={15}/></button></div>)}<button type="button" style={{...action,justifySelf:'start'}} onClick={()=>setItems(a=>[...a,{text:'',done:false}])}><Plus size={15}/> Add item</button></div>}
        <div style={{display:'flex',justifyContent:'flex-end',gap:8}}><button type="button" style={action} onClick={clear}>Cancel</button><button disabled={busy} style={{...action,background:'#2f6f4e',color:'white',borderColor:'#2f6f4e',fontWeight:600}}><Check size={16}/>{editing?'Save Changes':'Save Note'}</button></div>
      </form>}
    </div>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}><h3 style={{margin:0,fontSize:15}}>Your notes</h3><span style={{color:'#65746b',fontSize:13}}>{visible.length} {visible.length===1?'note':'notes'}</span></div>
    {visible.length===0 ? <div style={{border:'1px dashed #cfdcd2',borderRadius:14,padding:40,textAlign:'center',color:'#65746b'}}>No notes found. Create your first note above.</div> :
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(min(100%,250px),1fr))',gap:14,alignItems:'start'}}>{visible.map(n=><article key={n.id} style={{background:'#fff',border:'1px solid #dce3dc',borderRadius:14,padding:17,overflowWrap:'anywhere',boxShadow:'0 2px 8px #203b2809'}}>
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:8}}><strong style={{fontSize:15}}>{n.title||'Untitled'}</strong>{n.pinned&&<Pin size={15} color="#2f6f4e" fill="#d7e9dc"/>}</div>
      {n.body&&<p style={{whiteSpace:'pre-wrap',fontSize:13,lineHeight:1.55,color:'#44534a',margin:'12px 0'}}>{n.body}</p>}
      {n.is_checklist&&<div style={{display:'grid',gap:7,marginTop:12}}>{(n.items||[]).map((x,i)=><label key={i} style={{display:'flex',gap:8,fontSize:13,alignItems:'start'}}><input type="checkbox" checked={x.done} onChange={()=>patch(n,{items:n.items.map((item,j)=>i===j?{...item,done:!item.done}:item)})}/><span style={{textDecoration:x.done?'line-through':'none',color:x.done?'#89948c':'#44534a'}}>{x.text}</span></label>)}</div>}
      <div style={{display:'flex',justifyContent:'space-between',gap:5,marginTop:18,borderTop:'1px solid #edf0ec',paddingTop:11}}><button type="button" title={n.pinned?'Unpin note':'Pin note'} aria-label={n.pinned?'Unpin note':'Pin note'} style={{...action,padding:8}} onClick={()=>patch(n,{pinned:!n.pinned})}><Pin size={15}/></button><button type="button" title="Edit note" aria-label="Edit note" style={{...action,padding:8}} onClick={()=>begin(n)}><Pencil size={15}/></button><button type="button" title="Delete note" aria-label="Delete note" style={{...action,padding:8}} onClick={()=>remove(n)}><Trash2 size={15}/></button></div>
    </article>)}</div>}
  </main>;
}
