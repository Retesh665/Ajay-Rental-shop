import React, { useEffect, useRef, useState } from "react";
import { Camera, X, Loader2 } from "lucide-react";
import { uploadImage, resolvePhotoUrl } from "../lib/uploads.js";

const INK_SOFT = "#4A5268";
const PAPER = "#F6F5F1";
const LINE = "#E4E2D8";
const RED = "#A5402C";

// value: the saved publicUrl (or null). onChange(url) is called with the
// final R2 publicUrl once upload completes — never with a blob: URL.
export default function PhotoCapture({ label, value, onChange, onUploadingChange }) {
  const inputRef = useRef(null);
  const cameraRef = useRef(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [viewOpen, setViewOpen] = useState(false);
  const [savedSrc, setSavedSrc] = useState(null);
  useEffect(() => { let live = true; setSavedSrc(null); if (value) resolvePhotoUrl(value).then(src => { if (live) setSavedSrc(src); }).catch(e => { if (live) setError(e.message); }); return () => { live = false; }; }, [value]);

  async function handleFile(file) {
    if (!file) return;
    setError("");
    if (typeof navigator !== "undefined" && !navigator.onLine) { setError("Photo uploads require internet. Reconnect and try again."); return; }
    const blobUrl = URL.createObjectURL(file);
    setPreviewBlobUrl(blobUrl); // instant preview, §6 step 4
    setUploading(true);
    onUploadingChange?.(true);
    try {
      const photoReference = await uploadImage(file);
      await onChange(photoReference);
    } catch (e) {
      setError(e.message || "Upload failed");
      setPreviewBlobUrl(null);
    } finally {
      setUploading(false);
      onUploadingChange?.(false);
      // Preview remains until the saved URL is rendered; the blob is revoked on replacement/unmount.
    }
  }

  useEffect(() => {
    if (savedSrc && previewBlobUrl && !uploading) {
      setPreviewBlobUrl(null);
      URL.revokeObjectURL(previewBlobUrl);
    }
  }, [savedSrc, uploading, previewBlobUrl]);
  useEffect(() => () => { if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl); }, [previewBlobUrl]);
  const displaySrc = previewBlobUrl || savedSrc;

  return (
    <div style={{ marginBottom: 14, minWidth: 0, width: "100%" }}>
      <label style={{ display: "block", fontSize: 12.5, color: INK_SOFT, marginBottom: 5, fontWeight: 500 }}>{label}</label>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ""; }}
      />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{display:"none"}}
        onChange={e => { handleFile(e.target.files?.[0]); e.target.value=""; }}/>
      {displaySrc ? (
        <div style={{ position: "relative", width: "100%", maxWidth: 220, height: 110, borderRadius: 8, overflow: "hidden", border: `1px solid ${LINE}` }}>
          <img src={displaySrc} alt={label} onClick={() => setViewOpen(true)} title="Click to view image" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: uploading ? 0.5 : 1, cursor: "zoom-in" }} />
          {uploading && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Loader2 size={18} color="#fff" className="spin" />
            </div>
          )}
          {!uploading && (
            <button type="button" aria-label="Remove image"
              onClick={() => { setPreviewBlobUrl(null); onChange(null); }}
              style={{ position: "absolute", top: 4, right: 4, background: "rgba(28,35,51,0.7)", border: "none", borderRadius: "50%", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
            >
              <X size={12} color="#fff" />
            </button>
          )}
        </div>
      ) : (
        <button
          type="button" onClick={() => cameraRef.current?.click()}
          style={{ width: "100%", maxWidth: 220, height: 110, border: `1.5px dashed ${LINE}`, borderRadius: 8, background: PAPER, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, cursor: "pointer", color: INK_SOFT, fontSize: 11.5 }}
        >
          <Camera size={18} />Capture
        </button>
      )}
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:7}}>
        <button type="button" disabled={uploading} onClick={() => cameraRef.current?.click()} style={{border:0,background:"transparent",color:"#2F6F4E",fontSize:12,cursor:"pointer"}}>Open camera</button>
        <button type="button" disabled={uploading} onClick={() => inputRef.current?.click()} style={{border:0,background:"transparent",color:"#2F6F4E",fontSize:12,cursor:"pointer"}}>Choose from gallery</button>
      </div>
      {displaySrc && <button type="button" onClick={() => inputRef.current?.click()} style={{ border: 0, background: "none", color: "#2F6F4E", cursor: "pointer", fontSize: 12 }}>Replace image</button>}
      {viewOpen && displaySrc && <div role="dialog" aria-label={`${label} preview`} onClick={() => setViewOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.82)", zIndex: 9999, display: "grid", placeItems: "center", cursor: "zoom-out", padding: 24 }}><img src={displaySrc} alt={label} style={{ maxWidth: "95vw", maxHeight: "90vh", objectFit: "contain" }}/><button type="button" onClick={() => setViewOpen(false)} style={{ position: "absolute", top: 15, right: 20, fontSize: 20, cursor: "pointer" }}>Close ×</button></div>}
      {error && <div style={{ color: RED, fontSize: 11.5, marginTop: 5 }}>{error}</div>}
    </div>
  );
}
