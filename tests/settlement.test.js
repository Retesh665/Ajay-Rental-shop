import test from "node:test";
import assert from "node:assert/strict";
import { computeSettlement, buildMultiOrderTransaction } from "../src/lib/settlement.js";

test("no conflict: fresh customer, partial payment leaves a normal due", () => {
  const r = computeSettlement({ charges: 1000, discountNow: 0, paymentReceivedNow: 500, oldBalance: 0 });
  assert.equal(r.conflict, false);
  assert.equal(r.thisSettlement, 500);
  assert.equal(r.newBalance, 500);
});

test("no conflict: exact payment settles to zero", () => {
  const r = computeSettlement({ charges: 500, discountNow: 0, paymentReceivedNow: 500, oldBalance: 0 });
  assert.equal(r.conflict, false);
  assert.equal(r.newBalance, 0);
});

test("no conflict: existing due, this event ALSO nets to due (same direction, no clash)", () => {
  const r = computeSettlement({ charges: 300, discountNow: 0, paymentReceivedNow: 100, oldBalance: 200 });
  assert.equal(r.conflict, false);
  assert.equal(r.thisSettlement, 200);
  assert.equal(r.newBalance, 400);
});

test("Case A: old due, but this event overpays into a refund — two paths offered", () => {
  const r = computeSettlement({ charges: 200, discountNow: 0, paymentReceivedNow: 500, oldBalance: 800 });
  assert.equal(r.conflict, true);
  assert.equal(r.case, "A");
  assert.equal(r.thisSettlement, -300); // 200 - 0 - 500

  assert.equal(r.availablePaths.length, 2);
  const adjust = r.availablePaths.find((p) => p.key === "adjust_against_old_due");
  const refundNow = r.availablePaths.find((p) => p.key === "pay_refund_now");

  // Adjust path: no separate cash movement, old due just drops by the refund amount.
  assert.equal(adjust.newBalance, 500); // 800 + (-300)
  assert.equal(adjust.default, true);

  // Refund-now path: cap this event's own PAYMENT_RECEIVED at its own
  // charge (net zero for THIS event), pay the rest out as a balance-neutral
  // refund, and leave the old ₹800 due completely untouched.
  const built = refundNow.buildTransactions();
  assert.equal(built.paymentReceivedCapped, 200); // min(500, 200-0)
  assert.equal(built.refundPaidBalanceNeutral, 300); // -thisSettlement
  assert.equal(built.newBalance, 800); // old due untouched
});

test("Case B: existing credit, this event nets to a charge — credit applies automatically, only one path", () => {
  const r = computeSettlement({ charges: 300, discountNow: 0, paymentReceivedNow: 0, oldBalance: -400 });
  assert.equal(r.conflict, true);
  assert.equal(r.case, "B");
  assert.equal(r.thisSettlement, 300);

  assert.equal(r.availablePaths.length, 1);
  assert.equal(r.availablePaths[0].key, "apply_credit");
  assert.equal(r.availablePaths[0].newBalance, -100); // -400 + 300, still ₹100 credit left
});

test("Case B fully consumes credit and flips to a small due", () => {
  const r = computeSettlement({ charges: 500, discountNow: 0, paymentReceivedNow: 0, oldBalance: -400 });
  assert.equal(r.case, "B");
  assert.equal(r.availablePaths[0].newBalance, 100); // -400 + 500 = 100 due
});

test("discount reduces thisSettlement same as a payment would", () => {
  const r = computeSettlement({ charges: 1000, discountNow: 200, paymentReceivedNow: 800, oldBalance: 0 });
  assert.equal(r.conflict, false);
  assert.equal(r.thisSettlement, 0);
});

test("zero everything is trivially not a conflict", () => {
  const r = computeSettlement({ charges: 0, discountNow: 0, paymentReceivedNow: 0, oldBalance: 0 });
  assert.equal(r.conflict, false);
  assert.equal(r.newBalance, 0);
});

test("buildMultiOrderTransaction rejects an empty order list", () => {
  assert.throws(() => buildMultiOrderTransaction({ amount: 100, rentalOrderIds: [], description: "x" }));
});

test("buildMultiOrderTransaction keeps the FULL amount on the shared transaction (never splits it)", () => {
  const result = buildMultiOrderTransaction({ amount: 900, rentalOrderIds: ["RO-1", "RO-2", "RO-3"], description: "Payment across 3 orders" });
  assert.equal(result.transaction.amount, 900); // full amount, not divided by 3
  assert.equal(result.transaction.rental_order_id, null); // shared, not tied to one order
  assert.deepEqual(result.orderRefs, ["RO-1", "RO-2", "RO-3"]);
});
