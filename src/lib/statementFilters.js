// Classify actual, non-zero financial ledger movements. Never classify an event
// solely by its name: a zero advance or a note-only modification is not payment.
const TYPES = {
  Charges: new Set(['RENT_CHARGE', 'EXTRA_CHARGE']),
  Payments: new Set(['ADVANCE_RECEIVED', 'PAYMENT_RECEIVED', 'REFUND_PAID']),
  Adjustments: new Set(['DISCOUNT_ADJUSTMENT', 'CORRECTION_ADJUSTMENT', 'BALANCE_ADJUSTMENT', 'ADJUSTMENT']),
};
export function matchesFinancialFilter(group, filter) {
  if (filter === 'All') return true;
  if (filter === 'Adjustments' && group.eventType === 'CORRECTION') {
    return Math.abs((group.entries || []).reduce((sum, e) => sum + (Number(e.amount) || 0), 0)) > 0;
  }
  const types = TYPES[filter];
  if (!types) return false;
  return (group.entries || []).some(entry => types.has(entry.type) && Number.isFinite(Number(entry.amount)) && Math.abs(Number(entry.amount)) > 0);
}
