import React, { useEffect, useState } from "react";
import { resolvePhotoUrl } from "../lib/uploads.js";

export default function PrivatePhoto({ value, alt = "Photo", style, onClick, title }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let active = true;
    setSrc(null);
    if (value) resolvePhotoUrl(value).then(url => { if (active) setSrc(url); }).catch(() => { if (active) setSrc(null); });
    return () => { active = false; };
  }, [value]);
  return src ? <img src={src} alt={alt} style={style} onClick={onClick} title={title} loading="lazy" decoding="async" /> : <span aria-label={alt} title={value ? "Photo unavailable — check connection or presign-download" : "No photo"} style={{fontSize:11}}> {value ? "Photo unavailable" : "No photo"} </span>;
}
