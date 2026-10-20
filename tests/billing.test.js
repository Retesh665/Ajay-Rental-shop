import test from "node:test";
import assert from "node:assert/strict";
import { billableDays, segmentCharge, itemTotalCharge } from "../src/lib/billing.js";

test("same-day return before 11:00 bills the 1-day minimum", () => {
  assert.equal(billableDays("2026-01-01", "10:00", "2026-01-01", "10:00"), 1);
});

test("same-day return at/after 11:00 still bills 1 day (floor already covers it)", () => {
  assert.equal(billableDays("2026-01-01", "10:00", "2026-01-01", "15:00"), 1);
});

test("next-morning return before 11:00 is still just 1 day (grace period)", () => {
  assert.equal(billableDays("2026-01-01", "10:00", "2026-01-02", "09:00"), 1);
});

test("next-day return AFTER 11:00 bills a 2nd day (misses the grace cutoff)", () => {
  assert.equal(billableDays("2026-01-01", "10:00", "2026-01-02", "12:00"), 2);
});

test("exactly 11:00 return counts as late (boundary is inclusive)", () => {
  assert.equal(billableDays("2026-01-01", "10:00", "2026-01-02", "11:00"), 2);
});

test("pickup at/after 19:00 rolls billingStart to the next day", () => {
  // Picked up at 8pm, returned 10am the next morning — should read as a
  // same-billing-day return (1 day), not 2, because the clock only starts
  // the following morning.
  assert.equal(billableDays("2026-01-01", "20:00", "2026-01-02", "10:00"), 1);
});

test("pickup at exactly 19:00 also rolls forward (boundary inclusive)", () => {
  assert.equal(billableDays("2026-01-01", "19:00", "2026-01-01", "10:00"), 1);
  // return is "before" the rolled-forward billingStart of Jan 2 — still
  // floors to the 1-day minimum, never goes negative.
});

test("a week-long rental with no late bonus", () => {
  assert.equal(billableDays("2026-01-01", "09:00", "2026-01-08", "08:00"), 7);
});

test("isSwapClose removes the 1-day floor — same-day swap can be 0 days", () => {
  assert.equal(billableDays("2026-01-01", "10:00", "2026-01-01", "10:30", { isSwapClose: true }), 0);
});

test("isSwapClose still counts real elapsed days normally, just without the floor", () => {
  assert.equal(billableDays("2026-01-01", "10:00", "2026-01-03", "12:00", { isSwapClose: true }), 3);
});

test("segmentCharge multiplies days by that segment's own rate", () => {
  const seg = { from_at: "2026-01-01T10:00", to_at: "2026-01-03T12:00", daily_rate: 150 };
  const result = segmentCharge(seg);
  assert.equal(result.days, 3);
  assert.equal(result.amount, 450);
});

test("itemTotalCharge sums across segments with DIFFERENT rates (post-swap billing, §4)", () => {
  // Segment 1: same-day swap before 11am, at ₹100/day — should cost ₹0.
  const seg1 = { from_at: "2026-01-01T10:00", to_at: "2026-01-01T10:30", daily_rate: 100, isSwapClose: true };
  // Segment 2: the replacement machine, ₹150/day, returned 3 days later after 11am.
  const seg2 = { from_at: "2026-01-01T10:30", to_at: "2026-01-03T12:00", daily_rate: 150, isSwapClose: false };

  const totals = itemTotalCharge([seg1, seg2]);
  assert.equal(totals.days, 3); // 0 + 3
  assert.equal(totals.amount, 450); // (0*100) + (3*150)
});

test("calendarDaysElapsed never goes negative even with an odd return-before-start input", () => {
  // Defensive case — shouldn't happen in practice, but the formula floors at 0.
  assert.equal(billableDays("2026-01-05", "10:00", "2026-01-01", "10:00"), 1);
});
