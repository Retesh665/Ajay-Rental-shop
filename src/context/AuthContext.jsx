import React, {createContext, useContext, useEffect, useMemo, useRef, useState} from "react";
import {supabase, isSupabaseConfigured} from "../lib/supabaseClient.js";
import {clearPrivatePhotoCache} from "../lib/uploads.js";

const AuthContext = createContext(null);
export const useAuth = () => {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider");
  return value;
};
const REPLACED = "This account was signed in on another device or browser. Please sign in again.";

// Supabase requests can hang when connectivity is unreliable. Never block local logout
// indefinitely on an optional server-side session revocation request.
const settleWithin = (promise, ms) => Promise.race([
  Promise.resolve(promise).catch(() => null),
  new Promise(resolve => setTimeout(() => resolve(null), ms)),
]);

// Used only when Supabase cannot complete its local sign-out. Remove only the
// Supabase auth session key for this project, not RentDesk offline drafts/data.
const clearStoredSupabaseSession = () => {
  try {
    const {hostname, port} = new URL(import.meta.env.VITE_SUPABASE_URL || "http://127.0.0.1:54321");
    const projectRef = hostname.endsWith(".supabase.co") ? hostname.split(".")[0] : hostname.replace(/[^a-z0-9]/gi, "-") + (port ? `-${port}` : "");
    localStorage.removeItem(`sb-${projectRef}-auth-token`);
  } catch { /* storage may be disabled */ }
};

export function AuthProvider({children}) {
  const [session,setSession] = useState(null);
  const [loading,setLoading] = useState(true);
  const [notice,setNotice] = useState("");
  const checking = useRef(false);
  const currentSession = useRef(null);
  const generation = useRef(0);
  const activated = useRef(false);

  const accept = (next) => { currentSession.current=next; setSession(next); };
  const replace = async () => {
    generation.current++;
    activated.current=false;
    accept(null);
    clearPrivatePhotoCache();
    setNotice(REPLACED);
    await supabase.auth.signOut({scope:"local"}).catch(()=>{});
  };
  const validate = async () => {
    if (!navigator.onLine || checking.current || !currentSession.current) return;
    checking.current=true;
    const startGeneration=generation.current;
    try {
      const {data,error}=await supabase.rpc("rd_staff_session_valid");
      if (startGeneration!==generation.current) return;
      // Connectivity/server errors must not turn a remembered login into a logout.
      if (!error && data===false) await replace();
    } catch { /* transient connectivity failures are retried */ }
    finally { checking.current=false; }
  };

  useEffect(()=>{
    if (!isSupabaseConfigured) {setLoading(false);return;}
    let active=true;
    const restore=async()=>{
      try {
        const {data,error}=await supabase.auth.getSession();
        if (!active) return;
        if (error) {setNotice("Unable to restore saved login. Check your connection.");return;}
        if (!data.session) return;
        // A remembered Supabase session must already be registered. Never register
        // it again on page refresh, or an old device could reclaim the account.
        const {data:valid,error:checkError}=await supabase.rpc("rd_staff_session_valid");
        if (!active) return;
        if (!checkError && valid===false) {await replace();return;}
        // On a temporary network error keep the saved login, then retry validation.
        activated.current=true;
        accept(data.session);
      } catch { if(active) setNotice("Unable to verify saved login while offline."); }
      finally {if(active) setLoading(false);}
    };
    restore();
    const {data:{subscription}}=supabase.auth.onAuthStateChange((event,next)=>{
      if(!active) return;
      if(event==="SIGNED_OUT") {activated.current=false;accept(null);return;}
      // Supabase rotates access tokens automatically; this is not a new login.
      if (activated.current && next && (event==="TOKEN_REFRESHED" || event==="SIGNED_IN" || event==="INITIAL_SESSION")) accept(next);
    });
    return ()=>{active=false;subscription.unsubscribe();};
  },[]);

  useEffect(()=>{
    if (!session) return;
    const verify=()=>{void validate();};
    const interval=setInterval(verify,10000);
    window.addEventListener("focus",verify);
    window.addEventListener("online",verify);
    const visibility=()=>{if(!document.hidden) verify();};
    document.addEventListener("visibilitychange",visibility);
    return ()=>{clearInterval(interval);window.removeEventListener("focus",verify);window.removeEventListener("online",verify);document.removeEventListener("visibilitychange",visibility);};
  },[session?.user?.id]);

  const value=useMemo(()=>({session,user:session?.user??null,loading,notice,clearNotice:()=>setNotice(""),
    signIn:async(email,password)=>{
      setNotice("");
      const {data,error}=await supabase.auth.signInWithPassword({email,password});
      if(error) throw error;
      const {error:registerError}=await supabase.rpc("rd_register_staff_session");
      if(registerError){await supabase.auth.signOut({scope:"local"});throw new Error("Cannot activate staff session. Check migration 012: "+registerError.message);}
      generation.current++;
      activated.current=true;
      accept(data.session);
    },
    signOut:async()=>{
      // Clear UI/private image state first. Server outages must not trap staff in the app.
      generation.current++;
      activated.current=false;
      accept(null);
      clearPrivatePhotoCache();
      setNotice("");
      // End the active staff session while the access token is still available.
      // A failed/timed-out RPC does not prevent local logout.
      await settleWithin(supabase.rpc("rd_end_staff_session"), 2500);
      const result = await settleWithin(supabase.auth.signOut({scope:"local"}), 2500);
      if (!result || result.error) clearStoredSupabaseSession();
    }
  }),[session,loading,notice]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
