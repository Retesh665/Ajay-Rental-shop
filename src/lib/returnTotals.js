// Extra expense is charged when rental starts and is already in customer balance.
export function returnEventCharges(machineBreakdown, touchedOrders) {
  const rentTotal = machineBreakdown.reduce((sum, item) => sum + (Number(item.subtotal) || 0), 0);
  const extraTotal = touchedOrders.reduce((sum, order) => sum + (Number(order.extra_expense) || 0), 0);
  return { rentTotal, extraTotal, chargesForThisEvent: rentTotal };
}
