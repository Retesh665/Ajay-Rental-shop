import React from "react";
import { LayoutDashboard, PlayCircle, RotateCcw, ClipboardList, IndianRupee, Users, Package, Wrench, History, StickyNote, X, LogOut } from "lucide-react";

const ITEMS = [
  ["dashboard", "Dashboard", LayoutDashboard],
  ["start", "Start Rental", PlayCircle],
  ["return", "Return Rental", RotateCcw],
  ["active", "Modify Rental", ClipboardList],
  ["payments", "Payments", IndianRupee],
  ["customers", "Customers", Users],
  ["inventory", "Inventory", Package],
  ["history", "History", History],
  ["notes", "Notes", StickyNote],
];

export default function Sidebar({ screen, onSelect, open, onClose, onSignOut, signingOut = false }) {
  return <>
    {open && <div className="sidebar-backdrop" onClick={onClose} />}
    <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
      <div className="sidebar-brand">
        <div><strong>RentDesk</strong><span>Rental Management</span></div>
        <button className="sidebar-close" onClick={onClose} aria-label="Close menu"><X size={20}/></button>
      </div>
      <nav className="sidebar-nav">
        {ITEMS.map(([key,label,Icon]) => <button key={key} className={screen===key ? "active" : ""} onClick={()=>{onSelect(key);onClose();}}><Icon size={18}/><span>{label}</span></button>)}
      </nav>
      <div className="sidebar-foot"><button className="signout-button" onClick={onSignOut} disabled={signingOut}><LogOut size={18}/><span>{signingOut ? "Signing out…" : "Sign out"}</span></button></div>
    </aside>
  </>;
}
