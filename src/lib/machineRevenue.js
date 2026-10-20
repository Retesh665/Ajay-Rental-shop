// Reporting only: no changes to customer financial ledger.
export function allocateReturnEventRevenue(charges, discountAmount) {
  const items = (charges || []).map(c => ({
    rentalItemId: c.rental_item_id,
    grossPaise: Math.max(0, Math.round(Number(c.amount || 0) * 100)),
  }));
  const grossPaise = items.reduce((sum, i) => sum + i.grossPaise, 0);
  const discountPaise = Math.min(grossPaise, Math.max(0, Math.round(Number(discountAmount || 0) * 100)));
  if (!grossPaise) return items.map(i => ({ rentalItemId: i.rentalItemId, gross: 0, discount: 0, net: 0 }));
  const allocations = items.map((i, index) => {
    const exact = discountPaise * i.grossPaise / grossPaise;
    return { ...i, index, discountPaise: Math.floor(exact), fraction: exact - Math.floor(exact) };
  });
  let remaining = discountPaise - allocations.reduce((sum, i) => sum + i.discountPaise, 0);
  const ranked = [...allocations].sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let i = 0; i < remaining; i++) ranked[i].discountPaise += 1;
  return allocations.map(i => ({
    rentalItemId: i.rentalItemId,
    gross: i.grossPaise / 100,
    discount: i.discountPaise / 100,
    net: (i.grossPaise - i.discountPaise) / 100,
  }));
}

