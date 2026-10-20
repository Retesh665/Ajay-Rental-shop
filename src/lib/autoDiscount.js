// Display-only automatic discount calculation. The payable argument MUST be
// calculated before any discount, including existing due/credit exactly once.
export function autoReturnDiscount(payableBeforeDiscount, receivedNow) {
  const payable = Number(payableBeforeDiscount);
  const received = Number(receivedNow);
  if (!Number.isFinite(payable) || !Number.isFinite(received)) return 0;
  return Math.max(0, Math.round(payable - Math.max(0, received)));
}
