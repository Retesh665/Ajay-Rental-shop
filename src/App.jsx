import React, { Suspense, lazy, useEffect, useState } from "react";
import Login from "./components/Login.jsx";
import {useAuth} from "./context/AuthContext.jsx";
import { Menu } from "lucide-react";
import Sidebar from "./components/Sidebar.jsx";
const screenLoaders = {
  dashboard: () => import("./components/Dashboard.jsx"),
  start: () => import("./components/StartRental.jsx"),
  return: () => import("./components/ReturnRental.jsx"),
  active: () => import("./components/ManageActiveRental.jsx"),
  payments: () => import("./components/PaymentTab.jsx"),
  customers: () => import("./components/CustomerDatabase.jsx"),
  inventory: () => import("./components/Inventory.jsx"),
  history: () => import("./components/History.jsx"),
  notes: () => import("./components/Notes.jsx"),
};
const Dashboard = lazy(screenLoaders.dashboard);
const StartRental = lazy(screenLoaders.start);
const ReturnRental = lazy(screenLoaders.return);
const ManageActiveRental = lazy(screenLoaders.active);
const PaymentTab = lazy(screenLoaders.payments);
const CustomerDatabase = lazy(screenLoaders.customers);
const Inventory = lazy(screenLoaders.inventory);

const History = lazy(screenLoaders.history);
const Notes = lazy(screenLoaders.notes);
import { supabase, isSupabaseConfigured } from "./lib/supabaseClient.js";

const SCREENS={dashboard:Dashboard,start:StartRental,return:ReturnRental,active:ManageActiveRental,payments:PaymentTab,customers:CustomerDatabase,inventory:Inventory,history:History,notes:Notes};
const TITLES={dashboard:"Dashboard",start:"Start Rental",return:"Return Rental",active:"Modify Rental",payments:"Payments",customers:"Customers",inventory:"Inventory",history:"History",notes:"Notes"};

export default function App(){
 const {user,loading,signOut,notice,clearNotice}=useAuth();
 const [authError,setAuthError]=useState("");
 const [isOnline,setIsOnline]=useState(() => typeof navigator === 'undefined' ? true : navigator.onLine);
 const [connectionRecovered,setConnectionRecovered]=useState(false);
 useEffect(() => {
   const online = () => {setIsOnline(true);setConnectionRecovered(true);};
   const offline = () => {setIsOnline(false);setConnectionRecovered(false);};
   window.addEventListener('online',online);
   window.addEventListener('offline',offline);
   return () => {window.removeEventListener('online',online);window.removeEventListener('offline',offline);};
 },[]);
 const [screen,setScreen]=useState("dashboard");
 const [customerContext,setCustomerContext]=useState(null);
 const navigate=target=>{setCustomerContext(null);setScreen(target);};
 const onCustomerAction=(action,customer)=>{setCustomerContext({action,customer});setScreen(action);};
 const [menuOpen,setMenuOpen]=useState(false);
 const Screen=SCREENS[screen]||Dashboard;
 const handleSignOut=async()=>{
   setAuthError("");
   try {await signOut();setScreen("dashboard");setMenuOpen(false);}
   catch(error){setAuthError(error?.message || "Sign out failed");}
 };
 if (!isSupabaseConfigured) return <div role="alert" style={{padding:32}}>Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local, then restart the app.</div>;
 if (loading) return <div role="status" style={{padding:32}}>Checking staff session…</div>;
 if (!user) return <><Login/>{notice && <div role="alert" style={{position:"fixed",bottom:16,left:16,right:16,maxWidth:420,margin:"auto",padding:16,background:"#fff3ed",border:"1px solid #e6b39f",borderRadius:10,color:"#913e28",zIndex:1000}}>{notice} <button onClick={clearNotice}>Dismiss</button></div>}</>;
 return <div className="app-shell">
   <Sidebar screen={screen} onSelect={navigate} open={menuOpen} onClose={()=>setMenuOpen(false)} onSignOut={handleSignOut} onPrefetch={target => { if (navigator.onLine) screenLoaders[target]?.().catch(() => {}); }}/>
   <div className="app-content">
     <header className="mobile-topbar"><button onClick={()=>setMenuOpen(true)} aria-label="Open menu"><Menu size={23}/></button><strong>{TITLES[screen]}</strong><span/></header>
     {!isOnline && <div role="status" className="rd-network-banner">Offline — previously loaded information may remain visible, but saving rentals, returns and payments requires internet. Do not repeat a transaction until you verify whether it was saved.</div>}
     {isOnline && connectionRecovered && <div role="status" className="rd-network-banner rd-network-recovered">Connection restored. Refresh a screen when convenient to load the latest records. <button type="button" onClick={()=>setConnectionRecovered(false)}>Dismiss</button></div>}
     {authError&&<div role="alert" className="preview-note">{authError}</div>}
     <main className="screen-wrap"><Suspense fallback={<div role="status" className="rd-screen-loading">Loading screen…</div>}><Screen key={`${screen}:${customerContext?.customer?.id||""}`} customerContext={customerContext} onCustomerAction={onCustomerAction}/></Suspense></main>
   </div>
 </div>;
}
