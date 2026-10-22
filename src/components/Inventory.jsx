import Pager from "./Pager.jsx";
import { machineTimeCounters, bucketMatches, productMetrics } from '../lib/inventoryMetrics.js';
import React, { useEffect, useMemo, useState } from 'react';
import { listProducts, addProduct, listMachines, addMachine, getMachineHistory, addMachineRepair, changeMachineStatus, completeMachineRepair, getInventoryReportData, getMachineTiming } from '../lib/api.js';

const money = n => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const date = d => d ? new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) : 'Active';
const field = { padding: '10px 12px', border: '1px solid #d7ded8', borderRadius: 8, background: '#fff', font: 'inherit', minWidth: 0 };
const btn = { ...field, cursor: 'pointer', fontWeight: 600 };
const table = { width: '100%', borderCollapse: 'collapse', minWidth: 620 };
const cell = { padding: '11px 12px', borderBottom: '1px solid #e8ece8', textAlign: 'left' };
const card = { border: '1px solid #e0e6e1', borderRadius: 14, padding: 16, background: '#fff', boxShadow: '0 2px 12px rgba(31,78,54,.035)' };
const statusLabel = { available:'Available', rented:'On Rent', repair:'Under Repair', dismantled:'Dismantled' };
const statusTone = { available:['#e4f6ea','#147447'], rented:['#fff3db','#a46a11'], repair:['#ffebea','#b5352b'], dismantled:['#edf0f3','#64748b'] };
const StatusPill = ({status}) => <span style={{display:'inline-flex',alignItems:'center',gap:6,background:statusTone[status]?.[0]||'#f3f4f6',color:statusTone[status]?.[1]||'#444',borderRadius:8,padding:'6px 10px',fontSize:12,fontWeight:700}}>● {statusLabel[status]||status}</span>;
const badge = status => ({ color: status === 'available' ? '#236c44' : status === 'rented' ? '#946216' : '#a5402c', fontWeight: 700, textTransform: 'capitalize' });

export default function Inventory() {
  const [view, setView] = useState('products');
  const [inventoryPage, setInventoryPage] = useState(1);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [addDialog, setAddDialog] = useState(null);
  const [products, setProducts] = useState([]);
  const [machines, setMachines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [productName, setProductName] = useState('');
  const [dailyRent, setDailyRent] = useState('');
  const [machineProduct, setMachineProduct] = useState('');
  const [machineName, setMachineName] = useState('');
  const [purchaseCost, setPurchaseCost] = useState('');
  const [selected, setSelected] = useState(null);
  const [history, setHistory] = useState(null);
  const [machineRentalPage,setMachineRentalPage]=useState(1);
  const [machineRepairPage,setMachineRepairPage]=useState(1);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [timing, setTiming] = useState(null);
  const [reportProduct, setReportProduct] = useState('all');
  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [idleBucket, setIdleBucket] = useState('all');
  const [repairBucket, setRepairBucket] = useState('all');
  const [showAllIdle, setShowAllIdle] = useState(false);
  const [showAllRepair, setShowAllRepair] = useState(false);
  const [statusChoice, setStatusChoice] = useState('');
  const [finishCost, setFinishCost] = useState('');
  const [finishNote, setFinishNote] = useState('');
  const [showFinish, setShowFinish] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);

  async function refresh() {
    setError('');
    try {
      const [p, m] = await Promise.all([listProducts(), listMachines()]);
      setProducts(p); setMachines(m);
      setMachineProduct(old => old || p[0]?.id || ''); setReportProduct(old => old || 'all');
    } catch (e) { setError(e.message || 'Unable to load inventory'); }
    finally { setLoading(false); }
  }
  useEffect(() => { refresh(); }, []);

  async function addNewProduct(e) {
    e.preventDefault();
    if (!productName.trim() || !dailyRent || Number(dailyRent) <= 0) return;
    setSaving(true); setError('');
    try {
      const p = await addProduct({ name: productName.trim(), daily_rent: Number(dailyRent) });
      setProducts(prev => [...prev, p].sort((a, b) => a.name.localeCompare(b.name)));
      setMachineProduct(p.id); setProductName(''); setDailyRent(''); setAddDialog(null);
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  }
  async function addNewMachine(e) {
    e.preventDefault();
    if (!machineProduct || !machineName.trim() || purchaseCost === '' || Number(purchaseCost) < 0) return;
    setSaving(true); setError('');
    try {
      await addMachine({ product_id: machineProduct, machine_number: machineName.trim(), purchase_cost: Number(purchaseCost) });
      setMachineName(''); setPurchaseCost(''); await refresh(); setAddDialog(null);
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  }
  async function openMachine(machine) {
    setMachineRentalPage(1); setMachineRepairPage(1);
    setSelected(machine); setStatusChoice(machine.status); setShowFinish(false); setStatusOpen(false); setHistory(null); setTiming(null); setHistoryLoading(true); setError('');
    try { const [h,t] = await Promise.all([getMachineHistory(machine.id),getMachineTiming(machine.id)]); setHistory(h); setTiming(t); }
    catch (e) { setError(e.message); }
    finally { setHistoryLoading(false); }
  }
  async function updateStatus(e) {
    e.preventDefault();
    if (!selected || selected.status === 'rented' || statusChoice === selected.status) return;
    if(selected.status === 'repair' && statusChoice === 'available') { setShowFinish(true); return; }
    setSaving(true); setError('');
    try { await changeMachineStatus(selected.id,statusChoice); await refresh(); await openMachine({...selected,status:statusChoice}); }
    catch(e){setError(e.message);} finally{setSaving(false);}
  }
  async function completeRepair(e) {
    e.preventDefault();
    if (!selected || finishCost === '' || Number(finishCost)<0 || !finishNote.trim()) return;
    setSaving(true); setError('');
    try {
      await completeMachineRepair({machineId:selected.id,cost:Number(finishCost),notes:finishNote.trim()});
      setFinishCost(''); setFinishNote(''); setShowFinish(false);
      await refresh(); await openMachine({...selected,status:'available'});
    } catch(e){setError(e.message);} finally{setSaving(false);}
  }

  useEffect(() => {
    if (view !== 'reports' || loading) return;
    let active=true; setReportLoading(true); setReport(null);
    getInventoryReportData(machines.filter(m=>reportProduct==='all' || m.product_id===reportProduct))
      .then(data=>{if(active)setReport(data);})
      .catch(e=>{if(active)setError(e.message);})
      .finally(()=>{if(active)setReportLoading(false);});
    return ()=>{active=false;};
  },[view,reportProduct,machines,loading]);
  const counts = useMemo(() => {
    const map = {};
    for (const m of machines) {
      const x = map[m.product_id] ||= { total: 0, available: 0, rented: 0, repair: 0, dismantled: 0 };
      x.total++; if (x[m.status] !== undefined) x[m.status]++;
    }
    return map;
  }, [machines]);
  const totals = { total: machines.length, available: machines.filter(m => m.status === 'available').length, rented: machines.filter(m => m.status === 'rented').length, repair: machines.filter(m => m.status === 'repair').length, dismantled: machines.filter(m => m.status === 'dismantled').length };
  const visibleProducts = products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
  const visibleMachines = machines.filter(m => (!productFilter || m.product_id === productFilter) && (!statusFilter || m.status === statusFilter) && (`${m.machine_number} ${m.products?.name || ''}`).toLowerCase().includes(search.toLowerCase()));
  const machineTiming = selected && timing ? machineTimeCounters(selected,timing.statusHistory,timing.segments) : {idle:0,downtime:0};
  const rentalStats = history ? { count: history.rentals.length, days: history.rentals.reduce((s, r) => s + Number(r.days || 0), 0), revenue: history.rentals.reduce((s, r) => s + Number(r.revenue || 0), 0), repairCost: history.repairs.reduce((s, r) => s + Number(r.cost || 0), 0) } : null;

  return <div className="rd-inventory" style={{ maxWidth: 1100, padding: '24px 16px', margin: 'auto', color: '#1c2333' }}>
    <div className="rd-inventory-heading" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}><div><h2 style={{ marginBottom: 4, marginTop: 0 }}>Inventory</h2><p style={{ color: '#69776d', marginTop: 0 }}>Product, machine and performance management</p></div><div style={{ position: 'relative' }}><button type="button" aria-expanded={addMenuOpen} aria-haspopup="menu" onClick={() => setAddMenuOpen(x => !x)} style={{ ...btn, background: '#2f6f4e', color: 'white', borderColor: '#2f6f4e' }}>＋ Add</button>{addMenuOpen && <div role="menu" style={{ position: 'absolute', right: 0, top: 'calc(100% + 5px)', width: 190, background: '#fff', border: '1px solid #d7ded8', borderRadius: 10, padding: 5, zIndex: 20, boxShadow: '0 8px 24px #0002' }}><button role="menuitem" type="button" style={{ ...btn, width: '100%', border: 0, textAlign: 'left' }} onClick={() => { setAddDialog('product'); setAddMenuOpen(false); }}>＋ Add Product</button><button role="menuitem" type="button" style={{ ...btn, width: '100%', border: 0, textAlign: 'left' }} onClick={() => { setAddDialog('machine'); setAddMenuOpen(false); }}>＋ Add Machine</button></div>}</div></div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 8, marginBottom: 18 }}>
      {[['Machines', totals.total], ['Available', totals.available], ['On rent', totals.rented], ['In repair', totals.repair], ['Dismantled', totals.dismantled]].map(([label, n]) => <div key={label} style={{ ...card, padding: 12 }}><div style={{display:"flex",alignItems:"center",gap:10}}><span style={{display:"grid",placeItems:"center",width:36,height:36,borderRadius:12,background:label==="Available"?"#e2f7e9":label==="In repair"?"#ffe9e9":label==="On rent"?"#fff1d9":"#eaf2ed",fontSize:18}}>{({Machines:"▣",Available:"✓","On rent":"◷","In repair":"⚒",Dismantled:"▤"})[label]}</span><div><div style={{color:"#66746b",fontSize:11}}>{label}</div><strong style={{fontSize:21}}>{n}</strong></div></div></div>)}
    </div>
    <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
      {[['products', 'Product Wise'], ['machines', 'Machine Wise'], ['reports', 'Reports']].map(([key, label]) => <button key={key} style={{ ...btn, background: view === key ? '#20744d' : '#fff', color:view===key?'#fff':'#1c2333', borderColor: view === key ? '#20744d' : '#d7ded8' }} onClick={() => { setView(key); setSelected(null); setSearch(''); setInventoryPage(1); }}>{label}</button>)}
    </div>
    {error && <p role="alert" style={{ color: '#a5402c' }}>{error}</p>}
    {loading ? <p>Loading inventory…</p> : selected ? <section style={card}>
      <button style={btn} onClick={() => { setSelected(null); setHistory(null); }}>← Back to machines</button>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap',marginTop:16}}><div><h3 style={{margin:'0 0 5px'}}>{selected.machine_number}</h3><p style={{margin:0}}>{selected.products?.name} · <StatusPill status={selected.status}/></p></div><button type="button" style={btn} disabled={selected.status==='rented'} onClick={()=>{setStatusOpen(true);setShowFinish(false);setStatusChoice(selected.status)}} aria-expanded={statusOpen}>Change Status</button></div>
      {historyLoading ? <p>Loading machine history…</p> : history && <>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(155px,1fr))',gap:10,margin:'18px 0 12px'}}>{[
          ['Times Rented',rentalStats.count],['Billed Days',rentalStats.days],['Rental Revenue',money(rentalStats.revenue)],
          ['Net Earnings',money(rentalStats.revenue-rentalStats.repairCost-Number(selected.purchase_cost||0))],
          ['Repair Expenses',money(rentalStats.repairCost)],['Purchase Cost',money(selected.purchase_cost)]
        ].map(([label,value])=><div key={label} style={{background:'#f3f8f5',padding:12,borderRadius:10,border:'1px solid #e5efe9'}}><div style={{fontSize:12,color:'#64736a',marginBottom:5}}>{label}</div><strong>{value}</strong></div>)}</div>
        <div style={{display:'flex',gap:20,flexWrap:'wrap',marginBottom:18,fontSize:13}}><span>Idle Time: <strong>{machineTiming.idle} days</strong></span><span>Repair Downtime: <strong>{selected.status==='repair'?`${machineTiming.downtime} days`:'N/A'}</strong></span></div>
        {statusOpen && <div role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget&&!saving)setStatusOpen(false)}} style={{position:'fixed',inset:0,zIndex:100,background:'rgba(18,32,26,.48)',display:'grid',placeItems:'center',padding:16}}><section role="dialog" aria-modal="true" aria-label="Change machine status" style={{...card,width:'min(100%,450px)',boxShadow:'0 18px 65px #0003',padding:24}}><div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}><h3 style={{margin:0}}>Change Machine Status</h3><button type="button" aria-label="Close" style={{...btn,border:0,background:'transparent',fontSize:22}} onClick={()=>setStatusOpen(false)}>×</button></div><p style={{fontSize:13,color:'#64736a',marginTop:0}}>{selected.machine_number} · Current status: <strong>{statusLabel[selected.status]}</strong></p><form onSubmit={updateStatus} style={{display:'grid',gap:12}}><label style={{display:'grid',gap:6,fontSize:13,fontWeight:600}}>New Status<select style={field} value={statusChoice} onChange={e=>{setStatusChoice(e.target.value);setShowFinish(false)}}><option value="available">Available</option><option value="repair">Under Repair</option><option value="dismantled">Dismantled</option></select></label>{selected.status==='repair'&&statusChoice==='available'?<div style={{display:'grid',gap:10,background:'#f3f8f5',padding:12,borderRadius:10,border:'1px solid #e5efe9'}}><strong style={{fontSize:14}}>Complete Repair — Mark Available</strong><label style={{display:'grid',gap:5,fontSize:13}}>Repair Cost (₹)<input style={field} type="number" min="0" step="0.01" required value={finishCost} onChange={e=>setFinishCost(e.target.value)}/></label><label style={{display:'grid',gap:5,fontSize:13}}>Repair Remark<textarea style={{...field,minHeight:75,resize:'vertical'}} required value={finishNote} onChange={e=>setFinishNote(e.target.value)}/></label></div>:null}<div style={{display:'flex',gap:8,marginTop:6}}><button type="button" style={btn} disabled={saving} onClick={()=>setStatusOpen(false)}>Cancel</button>{selected.status==='repair'&&statusChoice==='available'?<button type="button" style={{...btn,flex:1,background:'#2f6f4e',color:'white'}} disabled={saving||!finishNote.trim()||finishCost===''||Number(finishCost)<0} onClick={completeRepair}>Repair Done — Mark Available</button>:<button type="submit" style={{...btn,flex:1,background:'#2f6f4e',color:'white'}} disabled={saving||statusChoice===selected.status}>Save Status</button>}</div></form></section></div>}
        <h4>Rental history</h4><div style={{ overflowX: 'auto' }}><table style={table}><thead><tr>{['Rental ID', 'Customer', 'Start', 'Return', 'Billed days', 'Revenue'].map(x => <th key={x} style={cell}>{x}</th>)}</tr></thead><tbody>{history.rentals.slice((machineRentalPage-1)*15,machineRentalPage*15).map(r => <tr key={r.id}><td style={cell}>{r.orderId}</td><td style={cell}>{r.customer}</td><td style={cell}>{date(r.from)}</td><td style={cell}>{date(r.to)}</td><td style={cell}>{r.days ?? '—'}</td><td style={cell}>{r.to ? money(r.revenue) : 'Pending'}</td></tr>)}</tbody></table>{!history.rentals.length && <p>No rentals yet.</p>}<Pager page={machineRentalPage} onChange={setMachineRentalPage} total={history.rentals.length}/></div>
        <h4>Repair history</h4>{history.repairs.length === 0 && <p>No repairs recorded.</p>}{history.repairs.slice((machineRepairPage-1)*15,machineRepairPage*15).map(r => <div key={r.id} style={{ ...card, marginBottom: 8 }}><strong>{r.problem}</strong> · {money(r.cost)} · {r.status}<p style={{ margin: '5px 0', fontSize: 12 }}>{date(r.started_at)}{r.completed_at ? ` → ${date(r.completed_at)}` : ''}</p>{r.notes && <p>{r.notes}</p>}</div>)}<Pager page={machineRepairPage} onChange={setMachineRepairPage} total={history.repairs.length}/>

      </>}
    </section> : <>
      {view === 'reports' ? <>
        <label style={{display:'block',marginBottom:14}}>Select Product <select style={{...field,marginLeft:8}} value={reportProduct} onChange={e=>setReportProduct(e.target.value)}><option value="all">All Machines</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        {reportLoading ? <p>Loading report…</p> : report && (()=>{
          const chosen=machines.filter(m=>reportProduct==='all' || m.product_id===reportProduct);
          const summary=productMetrics(report.stats,chosen.length);
          const rows=chosen.map(m=>({...m,...machineTimeCounters(m,report.statusHistory,report.segments)}));
          const renderList=(title,status,key,bucket,setBucket,showAll,setShowAll,limit)=>{
            const matching=rows.filter(m=>m.status===status && (status!=='available' || m.idle>=1) && bucketMatches(m[key],bucket)).sort((a,b)=>b[key]-a[key] || String(a.machine_number).localeCompare(String(b.machine_number)));
            const displayed=showAll?matching:matching.slice(0,limit);
            return <section style={{...card,marginTop:14}}><h3 style={{marginTop:0,color:status==='repair'?'#a5402c':'#9a6518'}}>{status==='repair'?'⚒':'◷'} {title} ({matching.length})</h3><div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:12}}>{(status==='available'?[['all','All'],['lt3','1–2 days'],['3to7','3–7 days'],['gt7','8+ days']]:[['all','All'],['lt3','Less than 3 days'],['3to7','3–7 days'],['gt7','8+ days']]).map(([value,label])=><button key={value} style={{...btn,background:bucket===value?'#e5f1e9':'#fff'}} onClick={()=>{setBucket(value);setShowAll(false);}}>{label}</button>)}</div><div style={{overflowX:'auto'}}><table style={table}><thead><tr>{['Machine ID','Machine Name','Days'].map(x=><th key={x} style={cell}>{x}</th>)}</tr></thead><tbody>{displayed.map(m=><tr key={m.id}><td style={cell}><button style={btn} onClick={()=>openMachine(m)}>{m.machine_number}</button></td><td style={cell}>{m.products?.name || '—'}</td><td style={cell}>{m[key]} days</td></tr>)}</tbody></table>{!matching.length&&<p>No machines in this range.</p>}</div>{matching.length>limit&&<button style={{...btn,marginTop:12}} onClick={()=>setShowAll(v=>!v)}>{showAll?'Show Less':`View All (${matching.length})`}</button>}</section>;
          };
          return <><section style={card}><h3 style={{marginTop:0,color:'#246e4b'}}>▥ Product Performance</h3><div style={{display:'flex',gap:16,flexWrap:'wrap'}}>{[['Revenue',money(summary.revenue)],['Net Earnings',money(summary.earnings)],['Avg Revenue per Machine',money(summary.averagePerMachine)],['Average Revenue per Rental',money(summary.averagePerRental)],['Avg Rental Price',`${money(summary.averageDailyRate)}/day`],['Total Rentals',summary.rentals]].map(([label,value])=><div key={label} style={{minWidth:150,flex:'1 1 150px',background:'#f4f8f6',padding:12,borderRadius:10,border:'1px solid #e6efe9'}}><small style={{color:'#647067'}}>{label}</small><p style={{margin:'4px 0'}}><strong>{value}</strong></p></div>)}</div></section>{renderList('Idle Machines','available','idle',idleBucket,setIdleBucket,showAllIdle,setShowAllIdle,5)}{renderList('Repair Downtime Machines','repair','downtime',repairBucket,setRepairBucket,showAllRepair,setShowAllRepair,10)}</>;
        })()}
      </> : view === 'products' ? <>
        <input style={{ ...field, width: '100%', boxSizing: 'border-box', marginBottom: 12 }} placeholder="Search products…" value={search} onChange={e => {setSearch(e.target.value);setInventoryPage(1);}}/>
        {visibleProducts.slice((inventoryPage-1)*15,inventoryPage*15).map(p => { const c = counts[p.id] || { total: 0, available: 0, rented: 0, repair: 0, dismantled: 0 }; return <div key={p.id} style={{ ...card, marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}><div style={{flex:1,minWidth:220}}><strong style={{fontSize:17}}>{p.name}</strong><p style={{margin:'4px 0 12px',color:'#237348',fontWeight:700,fontSize:15}}>{money(p.daily_rent)}/day</p><div style={{display:'flex',gap:6,flexWrap:'wrap'}}>{[['Machines',c.total,'#eef3f7','#40576d'],['Available',c.available,'#e3f6ea','#167548'],['On Rent',c.rented,'#fff1db','#a46a11'],['Repair',c.repair,'#ffebea','#b5352b'],['Dismantled',c.dismantled,'#edf0f3','#64748b']].map(([label,n,bg,fg])=><span key={label} style={{background:bg,color:fg,padding:'7px 9px',borderRadius:8,fontSize:11}}><strong>{n}</strong> {label}</span>)}</div></div><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button style={{...btn,color:'#1f6f4a',borderColor:'#b6d8c5'}} onClick={() => { setView('machines'); setProductFilter(p.id); setSearch(''); setInventoryPage(1); }}>View Machines →</button></div></div>; })}
        {!visibleProducts.length && <p>No products found.</p>}
        <Pager page={inventoryPage} onChange={setInventoryPage} total={visibleProducts.length}/>
      </> : <>
        <div className="rd-machine-filters" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}><input style={{ ...field, flex: 2 }} placeholder="Search machine name or ID…" value={search} onChange={e => {setSearch(e.target.value);setInventoryPage(1);}}/><select style={field} value={productFilter} onChange={e => {setProductFilter(e.target.value);setInventoryPage(1);}}><option value="">All products</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><select style={field} value={statusFilter} onChange={e => {setStatusFilter(e.target.value);setInventoryPage(1);}}><option value="">All statuses</option><option value="available">Available</option><option value="rented">On rent</option><option value="repair">Under repair</option><option value="dismantled">Dismantled</option></select></div>
        <div style={{ ...card, padding: 0, overflowX: 'auto' }}><table className="rd-machine-table" style={table}><thead><tr>{['Machine', 'Product', 'Status', 'Details'].map(x => <th key={x} style={cell}>{x}</th>)}</tr></thead><tbody>{visibleMachines.slice((inventoryPage-1)*15,inventoryPage*15).map(m => <tr key={m.id}><td style={cell}><strong>{m.machine_number}</strong></td><td style={cell}>{m.products?.name}</td><td style={cell}><StatusPill status={m.status}/></td><td style={cell}><button style={btn} onClick={() => openMachine(m)}>View history →</button></td></tr>)}</tbody></table>{!visibleMachines.length && <p style={{ padding: 12 }}>No machines found.</p>}</div>
        <Pager page={inventoryPage} onChange={setInventoryPage} total={visibleMachines.length}/>
      </>}
    </>}
    {addDialog && <div role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !saving) setAddDialog(null); }} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(15,25,20,.55)', display: 'grid', placeItems: 'center', padding: 16 }}><section role="dialog" aria-modal="true" aria-label={addDialog === 'product' ? 'Add Product' : 'Add Machine'} style={{ ...card, width: 'min(100%, 440px)', boxSizing: 'border-box', boxShadow: '0 18px 45px #0003' }}><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}><h3 style={{ margin: 0 }}>{addDialog === 'product' ? 'Add Product' : 'Add Machine'}</h3><button type="button" aria-label="Close" disabled={saving} style={btn} onClick={() => setAddDialog(null)}>✕</button></div>{addDialog === 'product' ? <form onSubmit={addNewProduct} style={{ display: 'grid', gap: 12 }}><label>Product name<input autoFocus required style={{ ...field, width: '100%', boxSizing: 'border-box', display: 'block', marginTop: 5 }} value={productName} onChange={e => setProductName(e.target.value)}/></label><label>Daily rental rate (₹)<input required type="number" min="0.01" step="0.01" style={{ ...field, width: '100%', boxSizing: 'border-box', display: 'block', marginTop: 5 }} value={dailyRent} onChange={e => setDailyRent(e.target.value)}/></label><button type="submit" disabled={saving} style={{ ...btn, background: '#2f6f4e', color: 'white' }}>{saving ? 'Saving…' : 'Save Product'}</button></form> : <form onSubmit={addNewMachine} style={{ display: 'grid', gap: 12 }}><label>Product<select required style={{ ...field, width: '100%', display: 'block', marginTop: 5 }} value={machineProduct} onChange={e => setMachineProduct(e.target.value)}><option value="">Select product</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Machine name / ID<input autoFocus required style={{ ...field, width: '100%', boxSizing: 'border-box', display: 'block', marginTop: 5 }} value={machineName} onChange={e => setMachineName(e.target.value)}/></label><label>Purchase cost (₹)<input required type="number" min="0" step="0.01" style={{ ...field, width: '100%', boxSizing: 'border-box', display: 'block', marginTop: 5 }} value={purchaseCost} onChange={e => setPurchaseCost(e.target.value)}/></label><button type="submit" disabled={saving || !machineProduct} style={{ ...btn, background: '#2f6f4e', color: 'white' }}>{saving ? 'Saving…' : 'Save Machine'}</button>{!products.length && <p style={{ color: '#a5402c', fontSize: 12 }}>Add a product before adding a machine.</p>}</form>}</section></div>}
    <p style={{ color: '#69776d', fontSize: 12, marginTop: 18 }}>Step 3 — Start and Return Rental automatically update machine availability and rental history. Step 4 — Complete repairs through Machine Profile status changes. Manual status changes are available only in Machine Profile.</p>
  </div>;
}
