// All "what day is it" / "is this today" logic MUST go through these helpers.
// Never use `new Date()` directly for business-day math — the machine running
// the code (browser or server) may not be in IST. Timestamps are stored in
// UTC in the DB; conversion to IST happens only here, at read/compute time.

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function nowIST() {
  return new Date(Date.now() + IST_OFFSET_MS);
}

// Given any Date/timestamp (assumed UTC instant), return the IST wall-clock
// Date object. Do NOT call .getHours()/.getDate() etc on a raw UTC Date for
// business logic — always go through this first.
export function toIST(d) {
  const utc = d instanceof Date ? d : new Date(d);
  return new Date(utc.getTime() + IST_OFFSET_MS);
}

function pad(n) {
  return n < 10 ? `0${n}` : `${n}`;
}

// IST calendar date, "YYYY-MM-DD", from a UTC instant.
export function isoDateIST(d) {
  const ist = toIST(d);
  return `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())}`;
}

// IST wall-clock time, "HH:MM" (24h), from a UTC instant.
export function hhmmIST(d) {
  const ist = toIST(d);
  return `${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())}`;
}

export function toIndianDate(iso) {
  if (!iso) return "";
  const [y, m, dd] = iso.split("-");
  return `${dd}-${m}-${y}`;
}

export function to12Hour(t) {
  if (!t) return "";
  let [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${pad(m)} ${ampm}`;
}

export function addDaysISO(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

// Combine an IST calendar date + HH:MM wall-clock time into the correct UTC
// instant to store in the DB (subtract the offset back out).
export function istDateTimeToUTC(dateISO, timeHHMM) {
  const [y, m, d] = dateISO.split("-").map(Number);
  const [h, min] = timeHHMM.split(":").map(Number);
  const utcMs = Date.UTC(y, m - 1, d, h, min, 0) - IST_OFFSET_MS;
  return new Date(utcMs);
}

export function isValidMobile(m) {
  return /^[6-9]\d{9}$/.test((m || "").trim());
}
