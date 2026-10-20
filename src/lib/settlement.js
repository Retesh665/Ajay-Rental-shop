// §5 — Return Rental's core decision tree. Mirrors the requirements doc's
// pseudocode exactly. This module only computes numbers/paths; it does not
// write to the DB — callers turn the result into transaction rows.

// charges: total of RENT_CHARGE + EXTRA_CHARGE being posted this event (positive)
// discountNow: DISCOUNT_ADJUSTMENT being applied this event (positive number, will be subtracted)
// paymentReceivedNow: cash/UPI/etc collected this event (positive number, will be subtracted)
// oldBalance: customer's balance BEFORE this event's transactions post (+ = owes, - = credit)
export function computeSettlement({ charges, discountNow = 0, paymentReceivedNow = 0, oldBalance }) {
  const thisSettlement = charges - discountNow - paymentReceivedNow;

  const conflict =
    (oldBalance > 0 && thisSettlement < 0) || // old due, this event nets to a refund
    (oldBalance < 0 && thisSettlement > 0); // old credit, this event nets to owing

  if (!conflict) {
    return {
      conflict: false,
      thisSettlement,
      oldBalance,
      newBalance: oldBalance + thisSettlement,
      availablePaths: null,
    };
  }

  if (oldBalance > 0 && thisSettlement < 0) {
    // Case A: old due + this event is a refund. Two named paths.
    return {
      conflict: true,
      case: "A",
      thisSettlement,
      oldBalance,
      availablePaths: [
        {
          key: "adjust_against_old_due",
          label: "Adjust against old due",
          default: true,
          newBalance: oldBalance + thisSettlement, // natural sum, no extra transaction
        },
        {
          key: "pay_refund_now",
          label: "Pay refund now, old due stays separate",
          default: false,
          // Cap this event's own PAYMENT_RECEIVED at exactly its own charge
          // (net zero for this event), log the excess as REFUND_PAID that is
          // balance-neutral in this context (cash handed back immediately,
          // not a draw against real stored credit).
          buildTransactions: () => {
            const excessRefund = -thisSettlement; // thisSettlement is negative here
            return {
              paymentReceivedCapped: Math.min(paymentReceivedNow, charges - discountNow),
              refundPaidBalanceNeutral: excessRefund,
              // old due (oldBalance) is untouched
              newBalance: oldBalance, // old due stays exactly as it was
            };
          },
        },
      ],
    };
  }

  // Case B: old credit + this event is due. Only one path — apply credit
  // automatically. The "collect cash instead, keep credit untouched" option
  // was deliberately removed; do not implement it.
  return {
    conflict: true,
    case: "B",
    thisSettlement,
    oldBalance,
    availablePaths: [
      {
        key: "apply_credit",
        label: "Apply credit automatically",
        default: true,
        newBalance: oldBalance + thisSettlement,
      },
    ],
  };
}

// Helper for the "spans more than one order" rule (§5): builds the shared
// payload for a single transaction row plus its transaction_order_refs.
// Never split the amount proportionally across orders.
export function buildMultiOrderTransaction({ amount, rentalOrderIds, description }) {
  if (!rentalOrderIds || rentalOrderIds.length === 0) {
    throw new Error("buildMultiOrderTransaction requires at least one rental_order_id");
  }
  return {
    transaction: { amount, rental_order_id: null, description },
    orderRefs: rentalOrderIds,
    // Every individual order's own view should show the FULL amount,
    // annotated "also settled RO-XXXX" for the others — that annotation is
    // a display concern, not something this helper computes.
  };
}
