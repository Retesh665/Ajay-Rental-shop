import { addDaysISO } from "./dates.js";

// §3 — exact formula, agreed after extensive testing. Do not change without
// checking the requirements doc first; every clause here maps to a numbered
// step there.
//
// pickupDateISO / returnDateISO: "YYYY-MM-DD" (IST calendar date)
// pickupTimeHHMM / returnTimeHHMM: "HH:MM" (IST wall clock, 24h)
// isSwapClose: true when this call is closing a segment for a SWAP, not a
//   physical return — the minimum-1-day floor does NOT apply in that case.
export function billableDays(pickupDateISO, pickupTimeHHMM, returnDateISO, returnTimeHHMM, { isSwapClose = false } = {}) {
  // 1. billingStart
  let billingStart = pickupDateISO;
  if (pickupTimeHHMM >= "19:00") {
    billingStart = addDaysISO(pickupDateISO, 1);
  }

  // 2. calendarDaysElapsed (floor at 0)
  const start = new Date(`${billingStart}T00:00:00Z`);
  const end = new Date(`${returnDateISO}T00:00:00Z`);
  const msPerDay = 24 * 60 * 60 * 1000;
  let calendarDaysElapsed = Math.round((end - start) / msPerDay);
  calendarDaysElapsed = Math.max(calendarDaysElapsed, 0);

  // 3. lateReturnBonus
  const lateReturnBonus = returnTimeHHMM >= "11:00" ? 1 : 0;

  // 4. billableDays — the 1-day floor only applies at physical return, never at a swap.
  const raw = calendarDaysElapsed + lateReturnBonus;
  return isSwapClose ? raw : Math.max(raw, 1);
}

// Sum billable days × that segment's own rate, across ALL segments of one
// rental_item (§4: "sum of each segment's own days × that segment's own
// daily_rate"). Each segment is { from_at (ISO datetime), to_at (ISO
// datetime or null=ongoing), daily_rate }. For the still-open final segment,
// pass the actual return date/time as `to_at` before calling this (i.e.
// close it in memory first) — this function does not know "now".
export function segmentCharge(segment) {
  const fromDate = segment.from_at.slice(0, 10);
  const fromTime = segment.from_at.slice(11, 16);
  const toDate = segment.to_at.slice(0, 10);
  const toTime = segment.to_at.slice(11, 16);
  const days = billableDays(fromDate, fromTime, toDate, toTime, { isSwapClose: segment.isSwapClose });
  return { days, amount: days * segment.daily_rate };
}

export function itemTotalCharge(segments) {
  return segments.reduce(
    (acc, seg) => {
      const { days, amount } = segmentCharge(seg);
      return { days: acc.days + days, amount: acc.amount + amount };
    },
    { days: 0, amount: 0 }
  );
}
