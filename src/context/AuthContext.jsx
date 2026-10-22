import React, {createContext, useContext, useEffect, useMemo, useRef, useState} from "react";
import {clearOfflineSnapshots} from "../lib/offlineCache.js";
import {clearPrivatePhotoCache} from "../lib/uploads.js";
import {supabase, isSupabaseConfigured} from "../lib/supabaseClient.js";

const AuthContext = createContext(null);
export const useAuth = () => {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider");
  return value;
};
const REPLACED = "This account was signed in on another device or browser. Please sign in again.";

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
    const interval=setInterval(verify,30000);
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
      // Update the UI immediately; a remote session RPC must never block logout.
      const previousUserId = currentSession.current?.user?.id;
      generation.current++;
      activated.current=false;
      accept(null);
      clearPrivatePhotoCache();
      setNotice("");
      // Keep offline rental drafts intact. Remove only read-through snapshots
      // associated with this staff account to avoid stale private data.
      void clearOfflineSnapshots(previousUserId).catch(()=>{});
      // The RPC is best-effort; local sign-out runs even when it fails.
      // Avoid a stalled network request trapping the user on the dashboard.
      // Supabase query builders are thenables, not native Promises; `.catch` is
      // not available on the result of `rpc()` in all supported versions.
      // Await remote invalidation before removing the local token, but do it
      // independently of the UI transition so logout never appears stuck.
      void (async () => {
        try { await supabase.rpc("rd_end_staff_session"); } catch { /* best effort */ }
        try { await supabase.auth.signOut({scope:"local"}); } catch { /* best effort */ }
      })();
    }
  }),[session,loading,notice]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
