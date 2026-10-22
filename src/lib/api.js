import { readSnapshot, writeSnapshot, mergeSnapshot, localCustomerSearch, isNetworkFailure } from "./offlineCache.js";
import { allocateReturnEventRevenue } from "./machineRevenue.js";
import { supabase } from "./supabaseClient.js";
import { istDateTimeToUTC, isValidMobile } from "./dates.js";
import { billableDays } from "./billing.js";
import { computeSettlement } from "./settlement.js";

// Since there's no self-signup — credentials are provisioned directly by
// the shop owner — every logged-in session already IS a real staff user.
// Every write function below resolves this itself as a fallback, so
// components never need to pass userId manually; it's still an accepted
// parameter for the rare case a caller wants to pass one explicitly.
export async function getCurrentUserId() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id || null;
}

async function offlineUserId() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.user?.id || null;
}
function browserOffline() { return typeof navigator !== 'undefined' && !navigator.onLine; }

// ============================================================
// CUSTOMERS
// ============================================================

export async function searchCustomers(query) {
  if (!query?.trim()) return [];
  const q = query.trim();
  if (browserOffline()) {
    const cached = await readSnapshot(await offlineUserId(), 'customers');
    if (!cached) throw new Error('Offline: no customer data saved on this device. Connect once to synchronize customers.');
    return localCustomerSearch(cached.rows, q);
  }
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .or(`name.ilike.%${q}%,mobile.ilike.%${q}%`)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) {
    if (isNetworkFailure(error)) {
      const snapshot = await readSnapshot(await offlineUserId(), 'customers');
      if (snapshot) return localCustomerSearch(snapshot.rows, q);
      throw new Error('Offline: no customer data saved on this device. Connect to the internet once to synchronize customers.');
    }
    throw error;
  }
  await mergeSnapshot(await offlineUserId(), 'customers', data || []);
  return data;
}

export async function createCustomer(input, userId) {
  userId = userId ?? (await getCurrentUserId());
  if (!input.profession?.trim() || (input.profession === "Other" && !input.custom_profession?.trim())) throw new Error("Profession is required.");
  if (!isValidMobile(input.mobile)) throw new Error("Wrong number");
  if (input.additional_mobile && !isValidMobile(input.additional_mobile)) {
    throw new Error("Wrong number");
  }
  if (input.additional_mobile && input.additional_mobile.trim() === input.mobile.trim()) {
    throw new Error("Additional mobile must be different from the primary mobile number.");
  }
  const { data, error } = await supabase
    .from("customers")
    .insert({
      name: input.name.trim(),
      mobile: input.mobile.trim(),
      additional_mobile: input.additional_mobile?.trim() || null,
      profession: input.profession || null,
      custom_profession: input.profession === "Other" ? input.custom_profession?.trim() : null,
      village: input.village || null,
      address: input.address || null,
      photo_url: input.photo_url || null,
      id_proof_front_url: input.id_proof_front_url || null,
      id_proof_back_url: input.id_proof_back_url || null,
      referred_by_customer_id: input.referred_by_customer_id || null,
      referred_by_name: input.referred_by_name || null,
      referred_by_mobile: input.referred_by_mobile || null,
      referred_by_address: input.referred_by_address || null,
      notes: input.notes || null,
      created_by: userId || null,
    })
    .select()
    .single();
  if (error) throw error;

  // Log to History (§8: "Customer Registered" — informational, ₹0, but should
  // still appear in the feed like every other action).
  const nowUTC = new Date().toISOString();
  const { data: event } = await supabase
    .from("events")
    .insert({ customer_id: data.id, event_type: "CUSTOMER_EDIT", occurred_at: nowUTC, created_by: userId || null })
    .select()
    .single();
  if (event) {
    await supabase.from("transactions").insert({
      event_id: event.id, customer_id: data.id, type: "NOTE", amount: 0,
      description: "Customer registered", occurred_at: nowUTC, created_by: userId || null,
    });
  }

  return data;
}

// logAsEdit: pass true when this update is an explicit "save my changes" from
// the edit form, so it logs a "Customer updated" entry to History. Leave
// false (default) for incidental updates from the same function — photo
// capture, flag changes — which would otherwise spam the feed with a
// history row every time someone taps a photo tile.
export async function updateCustomer(id, patch, { logAsEdit = false, userId } = {}) {
  if (patch.mobile && !isValidMobile(patch.mobile)) throw new Error("Wrong number");
  if (patch.additional_mobile && !isValidMobile(patch.additional_mobile)) throw new Error("Wrong number");
  if (patch.mobile && patch.additional_mobile && patch.mobile === patch.additional_mobile) {
    throw new Error("Additional mobile must be different from the primary mobile number.");
  }
  if (patch.additional_mobile && !patch.mobile) {
    // Guard the case where only additional_mobile is being patched — check
    // it against the row's existing primary mobile too.
    const { data: existing } = await supabase.from("customers").select("mobile").eq("id", id).single();
    if (existing && existing.mobile === patch.additional_mobile) {
      throw new Error("Additional mobile must be different from the primary mobile number.");
    }
  }

  const { data, error } = await supabase.from("customers").update(patch).eq("id", id).select().single();
  if (error) throw error;

  if (logAsEdit) {
    userId = userId ?? (await getCurrentUserId());
    const nowUTC = new Date().toISOString();
    const { data: event } = await supabase
      .from("events")
      .insert({ customer_id: id, event_type: "CUSTOMER_EDIT", occurred_at: nowUTC, created_by: userId || null })
      .select()
      .single();
    if (event) {
      await supabase.from("transactions").insert({
        event_id: event.id, customer_id: id, type: "NOTE", amount: 0,
        description: "Customer details updated", occurred_at: nowUTC, created_by: userId || null,
      });
    }
  }

  return data;
}

export async function getCustomerBalance(customerId, { fresh = false } = {}) {
  const userId = await offlineUserId();
  const cacheKey = `customerBalance:${customerId}`;
  if (browserOffline() && !fresh) {
    const cached = await readSnapshot(userId, cacheKey);
    if (cached) return cached.rows[0]?.balance ?? 0;
    throw new Error('Offline: customer balance has not been synchronized. Reconnect before confirming.');
  }
  const { data, error } = await supabase
    .from("customer_balances")
    .select("balance")
    .eq("customer_id", customerId)
    .maybeSingle();
  if (error) {
    if (!fresh && isNetworkFailure(error)) {
      const cached = await readSnapshot(userId, cacheKey);
      if (cached) return cached.rows[0]?.balance ?? 0;
    }
    throw error;
  }
  await writeSnapshot(userId, cacheKey, [{ balance: data?.balance ?? 0 }]);
  return data?.balance ?? 0; // no transactions yet = 0
}

// Transactions grouped by event, for the receipt view (§8, Customer Database reads)
export async function getCustomerTransactions(customerId) {
  const { data, error } = await supabase
    .from("transactions")
    .select("*, events(event_type, occurred_at)")
    .eq("customer_id", customerId)
    .order("occurred_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

// Include non-financial actions (including notes and rental edits) in the statement.
export async function getCustomerEvents(customerId) {
  const { data, error } = await supabase.from("events")
    .select("id, event_type, occurred_at")
    .eq("customer_id", customerId)
    .in("event_type", ["START_RENTAL", "RETURN_RENTAL", "MANAGE_ACTIVE_RENTAL", "PAYMENT_TAB", "CORRECTION"])
    .order("occurred_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

// ============================================================
// PRODUCTS
// ============================================================

export async function listProducts() {
  if (browserOffline()) {
    const cached = await readSnapshot(await offlineUserId(), 'products');
    if (cached) return cached.rows;
    throw new Error('Offline: products have not been synchronized yet.');
  }
  const { data, error } = await supabase.from("products").select("*").order("name");
  if (error) {
    if (isNetworkFailure(error)) {
      const cached = await readSnapshot(await offlineUserId(), 'products');
      if (cached) return cached.rows;
    }
    throw error;
  }
  await writeSnapshot(await offlineUserId(), 'products', data || []);
  return data;
}

export async function addProduct({ name, daily_rent }) {
  const { data, error } = await supabase.from("products").insert({ name, daily_rent }).select().single();
  if (error) throw error;
  return data;
}

export async function deleteProduct(id) {
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) throw error;
}

// ============================================================
// MACHINES
// ============================================================

export async function listMachines({ productId, status } = {}) {
  if (browserOffline()) {
    const cached = await readSnapshot(await offlineUserId(), 'machines');
    if (cached) return cached.rows.filter(m => (!productId || m.product_id === productId) && (!status || m.status === status));
    throw new Error('Offline: machines have not been synchronized yet.');
  }
  let q = supabase.from("machines").select("*, products(name)").order("machine_number");
  if (productId) q = q.eq("product_id", productId);
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) {
    if (isNetworkFailure(error)) {
      const cached = await readSnapshot(await offlineUserId(), 'machines');
      if (cached) return cached.rows.filter(m => (!productId || m.product_id === productId) && (!status || m.status === status));
    }
    throw error;
  }
  // Filtered product/status queries must not overwrite the complete offline inventory.
  await mergeSnapshot(await offlineUserId(), 'machines', data || []);
  return data;
}

export async function addMachine({ product_id, machine_number, purchase_cost = 0 }) {
  const { data, error } = await supabase
    .from("machines")
    .insert({ product_id, machine_number, purchase_cost })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteMachine(id) {
  const { error } = await supabase.from("machines").delete().eq("id", id);
  if (error) throw error;
}

export async function setMachineStatus(id, status) {
  const { error } = await supabase.from("machines").update({ status }).eq("id", id);
  if (error) throw error;
}

// ============================================================
// START RENTAL (§8: creates customer(new)?, rental_orders, rental_items,
// rental_item_segments, events+transactions — ADVANCE_RECEIVED always
// logged, even ₹0, so every item has a real start timestamp)
// ============================================================

export async function startRental({
  customerId,
  items, // [{ productId, machineId, dailyRate }]
  startDateISO,
  startTimeHHMM,
  returnDateISO,
  returnTimeHHMM,
  advanceAmount = 0,
  extraExpense = 0,
  remarks,
  userId,
}) {
  userId = userId ?? (await getCurrentUserId());
  const startAtUTC = istDateTimeToUTC(startDateISO, startTimeHHMM).toISOString();
  const returnAtUTC = istDateTimeToUTC(returnDateISO, returnTimeHHMM).toISOString();

  // Human-friendly display ID is generated atomically by Postgres:
  // AA-0001 ... AA-9999, AB-0001 ... ZZ-9999.
  // The UUID remains the real internal order key.
  let order;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: displayId, error: idErr } = await supabase.rpc("next_rental_display_id");
    if (idErr) {
      if (isNetworkFailure(idErr)) throw new Error('Cannot create a rental without internet. Save an offline draft and confirm it after reconnecting.');
      throw new Error(`Could not generate rental ID. Check Supabase migration 002_rental_display_id_sequence.sql. ${idErr.message || ""}`.trim());
    }
    const { data, error: orderErr } = await supabase
      .from("rental_orders")
      .insert({
        display_id: displayId,
        customer_id: customerId,
        advance_amount: advanceAmount,
        extra_expense: extraExpense,
        remarks: remarks || null,
        created_by: userId || null,
      })
      .select()
      .single();
    if (!orderErr) { order = data; break; }
    const isDuplicate = orderErr.code === "23505" || /duplicate/i.test(orderErr.message || "");
    if (!isDuplicate || attempt === 4) throw orderErr;
    // else: collision on display_id — loop and try a new one
  }

  const { data: event, error: eventErr } = await supabase
    .from("events")
    .insert({ customer_id: customerId, event_type: "START_RENTAL", occurred_at: startAtUTC, created_by: userId || null })
    .select()
    .single();
  if (eventErr) throw eventErr;

  for (const item of items) {
    const { data: rentalItem, error: itemErr } = await supabase
      .from("rental_items")
      .insert({
        rental_order_id: order.id,
        product_id: item.productId,
        machine_id: item.machineId,
        daily_rate: item.dailyRate,
        expected_return_at: returnAtUTC,
      })
      .select()
      .single();
    if (itemErr) throw itemErr;

    const { error: segErr } = await supabase.from("rental_item_segments").insert({
      rental_item_id: rentalItem.id,
      machine_id: item.machineId,
      daily_rate: item.dailyRate,
      from_at: startAtUTC,
      to_at: null,
    });
    if (segErr) throw segErr;

    await setMachineStatus(item.machineId, "rented");
  }

  // ADVANCE_RECEIVED — always logged, even ₹0 (§8 note). Sign per §2: reduces what customer owes.
  const { error: advErr } = await supabase.from("transactions").insert({
    event_id: event.id,
    customer_id: customerId,
    rental_order_id: order.id,
    type: "ADVANCE_RECEIVED",
    amount: -Math.abs(advanceAmount),
    payment_mode: "Cash",
    description: `Advance received for ${order.display_id}`,
    occurred_at: startAtUTC,
    created_by: userId || null,
  });
  if (advErr) throw advErr;

  if (extraExpense > 0) {
    const { error: extraErr } = await supabase.from("transactions").insert({
      event_id: event.id,
      customer_id: customerId,
      rental_order_id: order.id,
      type: "EXTRA_CHARGE",
      amount: Math.abs(extraExpense),
      description: `Extra expense for ${order.display_id}`,
      occurred_at: startAtUTC,
      created_by: userId || null,
    });
    if (extraErr) throw extraErr;
  }

  if (remarks?.trim()) {
    const { error: noteError } = await supabase.from("transactions").insert({
      event_id: event.id, customer_id: customerId, rental_order_id: order.id,
      type: "NOTE", amount: 0, description: `Start rental note: ${remarks.trim()}`,
      occurred_at: startAtUTC, created_by: userId || null,
    });
    if (noteError) throw noteError;
  }
  return order;
}

// ============================================================
// RETURN RENTAL — computes RENT_CHARGE per item from segments (§3, §4),
// then runs the §5 settlement decision tree. Caller must resolve `path`
// before calling if computeSettlement() reported a conflict.
// ============================================================

// Every currently-active rental item, with enough joined data to group by
// customer and render the "rented on" / expected-return info per machine.
export async function listActiveRentals({ fresh = false } = {}) {
  const userId = await offlineUserId();
  if (browserOffline() && !fresh) {
    const cached = await readSnapshot(userId, 'activeRentals');
    if (cached) return cached.rows;
    throw new Error('Offline: no active rentals cached. Connect once to synchronize rentals.');
  }
  const { data, error } = await supabase
    .from("rental_items")
    .select(`
      id, daily_rate, expected_return_at, created_at, status, product_id,
      rental_order_id,
      rental_orders(id, display_id, advance_amount, extra_expense, remarks, customer_id, customers(id, name, mobile, address)),
      machines(id, machine_number),
      rental_item_segments(id, from_at, to_at, daily_rate)
    `)
    .eq("status", "active");
  if (error) {
    if (!fresh && isNetworkFailure(error)) {
      const cached = await readSnapshot(userId, 'activeRentals');
      if (cached) return cached.rows;
    }
    throw error;
  }

  // "Rented on" for display = earliest segment's from_at (the item's original
  // start, even if it's since been swapped) — billing itself still sums
  // across ALL segments separately, this is just for the UI label.
  const rows = data.map((item) => {
    const segs = [...item.rental_item_segments].sort((a, b) => new Date(a.from_at) - new Date(b.from_at));
    return { ...item, rentedOnAt: segs[0]?.from_at || item.created_at };
  });
  await writeSnapshot(userId, 'activeRentals', rows);
  return rows;
}

// returnsByItem: { [rentalItemId]: { returnDateISO, returnTimeHHMM } } — each
// machine can have its own actual return timestamp (matches the UI, where
// every machine's return date/time defaults to "now" but is editable).
export async function previewReturnCharges({ itemIds, returnsByItem }) {
  const returnAtUTCByItem = {};
  for (const id of itemIds) {
    const r = returnsByItem[id];
    returnAtUTCByItem[id] = istDateTimeToUTC(r.returnDateISO, r.returnTimeHHMM).toISOString();
  }

  const { data: segments, error } = await supabase
    .from("rental_item_segments")
    .select("*, rental_items(id, machine_id, machines(machine_number))")
    .in("rental_item_id", itemIds)
    .is("to_at", null); // the open (current) segment per item
  if (error) throw error;

  // For items with prior CLOSED segments (from earlier swaps), fetch those too.
  const { data: closedSegments, error: closedErr } = await supabase
    .from("rental_item_segments")
    .select("*")
    .in("rental_item_id", itemIds)
    .not("to_at", "is", null);
  if (closedErr) throw closedErr;

  const byItem = {};
  for (const seg of [...segments, ...closedSegments]) {
    byItem[seg.rental_item_id] = byItem[seg.rental_item_id] || [];
    const to_at = seg.to_at || returnAtUTCByItem[seg.rental_item_id]; // close the open segment in memory, using THIS item's own return time
    byItem[seg.rental_item_id].push({ ...seg, to_at });
  }

  const perItem = Object.entries(byItem).map(([rentalItemId, segs]) => {
    let totalDays = 0;
    let totalAmount = 0;
    for (const seg of segs) {
      const days = billableDays(
        seg.from_at.slice(0, 10),
        seg.from_at.slice(11, 16),
        seg.to_at.slice(0, 10),
        seg.to_at.slice(11, 16),
        { isSwapClose: false } // final segment closes at physical return → 1-day floor applies
      );
      totalDays += days;
      totalAmount += days * seg.daily_rate;
    }
    return { rentalItemId, days: totalDays, amount: totalAmount, returnAtUTC: returnAtUTCByItem[rentalItemId] };
  });

  const totalCharge = perItem.reduce((s, i) => s + i.amount, 0);
  return { perItem, totalCharge };
}

export async function settleReturn({
  customerId,
  itemIds,
  rentalOrderIds, // one or more — supports the multi-order "don't split" case
  returnsByItem, // { [rentalItemId]: { returnDateISO, returnTimeHHMM } } — per §4, per-machine
  conditionsByItem = {}, // { [rentalItemId]: 'good' | 'damaged' } — default 'good'
  discountAmount = 0,
  discountReason,
  paymentReceived = 0,
  paymentMode = "Cash",
  returnNote = "",
  settlementPath, // "adjust_against_old_due" | "pay_refund_now" | "apply_credit" | null (no conflict)
  userId,
}) {
  userId = userId ?? (await getCurrentUserId());
  if (!Array.isArray(itemIds) || itemIds.length === 0 || !Array.isArray(rentalOrderIds) || rentalOrderIds.length === 0) throw new Error("Select at least one rental item and order.");
  for (const [label, value] of [["Discount", discountAmount], ["Payment", paymentReceived]]) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a nonnegative whole-rupee amount.`);
  }
  const { perItem, totalCharge } = await previewReturnCharges({ itemIds, returnsByItem });
  const nowUTC = new Date().toISOString(); // when the settlement itself is recorded

  const oldBalance = await getCustomerBalance(customerId);
  const settlement = computeSettlement({
    charges: totalCharge,
    discountNow: discountAmount,
    paymentReceivedNow: paymentReceived,
    oldBalance,
  });

  const { data: event, error: eventErr } = await supabase
    .from("events")
    .insert({ customer_id: customerId, event_type: "RETURN_RENTAL", occurred_at: nowUTC, created_by: userId || null })
    .select()
    .single();
  if (eventErr) throw eventErr;

  const singleOrderId = rentalOrderIds.length === 1 ? rentalOrderIds[0] : null;

  // RENT_CHARGE — one per item, snapshotting machine number for display.
  // Each item closes at ITS OWN actual return time (§4: per-machine).
  for (const item of perItem) {
    const { data: ri } = await supabase
      .from("rental_items")
      .select("machine_id, rental_order_id, machines(machine_number)")
      .eq("id", item.rentalItemId)
      .single();
    await supabase.from("transactions").insert({
      event_id: event.id,
      customer_id: customerId,
      rental_order_id: ri.rental_order_id,
      rental_item_id: item.rentalItemId,
      type: "RENT_CHARGE",
      amount: item.amount,
      description: `Rent charge · ${ri.machines?.machine_number || ""} · ${item.days} day(s)`,
      machine_number: ri.machines?.machine_number,
      days: item.days,
      occurred_at: item.returnAtUTC,
      created_by: userId || null,
    });
    // close final segment + mark item returned, at that item's own return time
    await supabase.from("rental_item_segments").update({ to_at: item.returnAtUTC }).eq("rental_item_id", item.rentalItemId).is("to_at", null);
    await supabase.from("rental_items").update({ status: "returned" }).eq("id", item.rentalItemId);
    // §4: damaged → repair status; otherwise back to available
    const isDamaged = conditionsByItem[item.rentalItemId] === "damaged";
    await setMachineStatus(ri.machine_id, isDamaged ? "repair" : "available");
  }

  // DISCOUNT_ADJUSTMENT
  if (discountAmount > 0) {
    await insertPossiblyMultiOrderTransaction({
      eventId: event.id,
      customerId,
      rentalOrderIds,
      singleOrderId,
      type: "DISCOUNT_ADJUSTMENT",
      amount: -Math.abs(discountAmount),
      description: discountReason ? `Discount — ${discountReason}` : "Discount",
      occurredAtUTC: nowUTC,
      userId,
    });
  }

  // Machine revenue is derived from the finalized return event's RENT_CHARGE
  // and DISCOUNT_ADJUSTMENT ledger rows when reading reports. Do not write a
  // second financial record or depend on machine_discount_allocations RLS.
  // This intentionally leaves the customer financial calculation unchanged.

  // One combined customer ledger: collect the full amount once. Any excess
  // becomes customer credit; a cash refund is a separate Payment Tab action.
  if (paymentReceived > 0) {
    await insertPossiblyMultiOrderTransaction({
      eventId: event.id, customerId, rentalOrderIds, singleOrderId,
      type: "PAYMENT_RECEIVED", amount: -Math.abs(paymentReceived),
      paymentMode, description: "Payment received", occurredAtUTC: nowUTC, userId,
    });
  }

  if (returnNote.trim()) {
    const { error: noteError } = await supabase.from("transactions").insert({
      event_id: event.id, customer_id: customerId, rental_order_id: singleOrderId,
      type: "NOTE", amount: 0, description: `Return note: ${returnNote.trim()}`,
      occurred_at: nowUTC, created_by: userId || null,
    });
    if (noteError) throw noteError;
  }
  return { done: true, event };
}

async function insertPossiblyMultiOrderTransaction({ eventId, customerId, rentalOrderIds, singleOrderId, type, amount, paymentMode, description, occurredAtUTC, userId }) {
  const { data: txn, error } = await supabase
    .from("transactions")
    .insert({
      event_id: eventId,
      customer_id: customerId,
      rental_order_id: singleOrderId, // null when spanning multiple orders
      type,
      amount,
      payment_mode: paymentMode || null,
      description,
      occurred_at: occurredAtUTC,
      created_by: userId || null,
    })
    .select()
    .single();
  if (error) throw error;

  if (!singleOrderId && rentalOrderIds.length > 1) {
    const refs = rentalOrderIds.map((rid) => ({ transaction_id: txn.id, rental_order_id: rid }));
    const { error: refErr } = await supabase.from("transaction_order_refs").insert(refs);
    if (refErr) throw refErr;
  }
  return txn;
}

// ============================================================
// MANAGE ACTIVE RENTAL — swap, mid-rental additions, date edits, and
// advance/extra-expense corrections. None of these charge rent directly
// (that only happens at Return Rental, summed across segments) — they log
// an audit-trail transaction with amount 0 where money doesn't move, and a
// real ledger transaction only where it does (advance/expense corrections).
// ============================================================

// reason: "wrong" (same-day only, machine goes back to available) or
// "damaged" (any time, machine goes to repair). Closes the item's open
// segment at `now`, opens a new one on the new machine.
// Swapping has been intentionally disabled. Existing historical segments remain readable.
export async function swapMachine() {
  throw new Error("Machine swap is disabled. Return the existing machine and create a new rental instead.");
}

export async function addMachineToOrder({ rentalOrderId, productId, machineId, dailyRate, expectedReturnAtUTC, userId }) {
  userId = userId ?? (await getCurrentUserId());
  const nowUTC = new Date().toISOString();

  const { data: order } = await supabase.from("rental_orders").select("customer_id").eq("id", rentalOrderId).single();

  const { data: rentalItem, error: itemErr } = await supabase
    .from("rental_items")
    .insert({ rental_order_id: rentalOrderId, product_id: productId, machine_id: machineId, daily_rate: dailyRate, expected_return_at: expectedReturnAtUTC })
    .select()
    .single();
  if (itemErr) throw itemErr;

  await supabase.from("rental_item_segments").insert({ rental_item_id: rentalItem.id, machine_id: machineId, daily_rate: dailyRate, from_at: nowUTC, to_at: null, reason: "Added mid-rental" });
  await setMachineStatus(machineId, "rented");

  const { data: machine } = await supabase.from("machines").select("machine_number").eq("id", machineId).single();
  const { data: event } = await supabase
    .from("events")
    .insert({ customer_id: order.customer_id, event_type: "MANAGE_ACTIVE_RENTAL", occurred_at: nowUTC, created_by: userId || null })
    .select()
    .single();
  await supabase.from("transactions").insert({
    event_id: event.id, customer_id: order.customer_id, rental_order_id: rentalOrderId, rental_item_id: rentalItem.id,
    type: "NOTE", amount: 0,
    description: `${machine?.machine_number || ""} added mid-rental`,
    machine_number: machine?.machine_number,
    occurred_at: nowUTC, created_by: userId || null,
  });

  return rentalItem;
}

export async function updateExpectedReturn(rentalItemId, expectedReturnAtUTC) {
  const { data: item, error: readError } = await supabase.from("rental_items")
    .select("expected_return_at, rental_order_id, rental_orders(customer_id)")
    .eq("id", rentalItemId).single();
  if (readError) throw readError;
  if (item.expected_return_at === expectedReturnAtUTC) return;
  const userId = await getCurrentUserId();
  const nowUTC = new Date().toISOString();
  const { data: event, error: eventError } = await supabase.from("events")
    .insert({ customer_id: item.rental_orders.customer_id, event_type: "MANAGE_ACTIVE_RENTAL", occurred_at: nowUTC, created_by: userId || null })
    .select().single();
  if (eventError) throw eventError;
  const { error: logError } = await supabase.from("transactions").insert({
    event_id: event.id, customer_id: item.rental_orders.customer_id,
    rental_order_id: item.rental_order_id, rental_item_id: rentalItemId,
    type: "NOTE", amount: 0,
    description: `Expected return changed: ${item.expected_return_at} → ${expectedReturnAtUTC}`,
    occurred_at: nowUTC, created_by: userId || null,
  });
  if (logError) throw logError;
  const { error } = await supabase.from("rental_items").update({ expected_return_at: expectedReturnAtUTC }).eq("id", rentalItemId);
  if (error) throw error;
}

export async function updateOrderRemarks(rentalOrderId, remarks) {
  const { data: order, error: readError } = await supabase.from("rental_orders")
    .select("customer_id, remarks").eq("id", rentalOrderId).single();
  if (readError) throw readError;
  if ((order.remarks || "") === (remarks || "")) return;
  const nowUTC = new Date().toISOString();
  const userId = await getCurrentUserId();
  const { data: event, error: eventError } = await supabase.from("events")
    .insert({ customer_id: order.customer_id, event_type: "MANAGE_ACTIVE_RENTAL", occurred_at: nowUTC, created_by: userId || null })
    .select().single();
  if (eventError) throw eventError;
  const { error: noteError } = await supabase.from("transactions").insert({
    event_id: event.id, customer_id: order.customer_id, rental_order_id: rentalOrderId,
    type: "NOTE", amount: 0,
    description: `Rental note changed: ${order.remarks || "(empty)"} → ${remarks || "(empty)"}`,
    occurred_at: nowUTC, created_by: userId || null,
  });
  if (noteError) throw noteError;
  const { error } = await supabase.from("rental_orders").update({ remarks }).eq("id", rentalOrderId);
  if (error) throw error;
}

// Corrections to advance/extra-expense post a real ledger delta rather than
// silently overwriting a number — the stored column on rental_orders is
// informational display context only; the transactions table stays the
// source of truth for balance.
export async function correctOrderAdvance({ rentalOrderId, customerId, newAdvanceAmount, userId }) {
  userId = userId ?? (await getCurrentUserId());
  const nowUTC = new Date().toISOString();
  const { data: order, error: orderErr } = await supabase.from("rental_orders").select("advance_amount, display_id").eq("id", rentalOrderId).single();
  if (orderErr) throw orderErr;
  const delta = newAdvanceAmount - order.advance_amount;
  if (delta === 0) return;

  const { data: event } = await supabase
    .from("events")
    .insert({ customer_id: customerId, event_type: "MANAGE_ACTIVE_RENTAL", occurred_at: nowUTC, created_by: userId || null })
    .select()
    .single();
  await supabase.from("transactions").insert({
    event_id: event.id, customer_id: customerId, rental_order_id: rentalOrderId,
    type: "ADVANCE_RECEIVED", amount: -delta, // more advance received = customer owes less
    description: `Advance corrected for ${order.display_id}: ₹${order.advance_amount} → ₹${newAdvanceAmount}`,
    is_correction: true,
    occurred_at: nowUTC, created_by: userId || null,
  });
  await supabase.from("rental_orders").update({ advance_amount: newAdvanceAmount }).eq("id", rentalOrderId);
}

export async function correctOrderExtraExpense({ rentalOrderId, customerId, newExtraExpense, userId }) {
  userId = userId ?? (await getCurrentUserId());
  const nowUTC = new Date().toISOString();
  const { data: order, error: orderErr } = await supabase.from("rental_orders").select("extra_expense, display_id").eq("id", rentalOrderId).single();
  if (orderErr) throw orderErr;
  const delta = newExtraExpense - order.extra_expense;
  if (delta === 0) return;

  const { data: event } = await supabase
    .from("events")
    .insert({ customer_id: customerId, event_type: "MANAGE_ACTIVE_RENTAL", occurred_at: nowUTC, created_by: userId || null })
    .select()
    .single();
  await supabase.from("transactions").insert({
    event_id: event.id, customer_id: customerId, rental_order_id: rentalOrderId,
    type: "EXTRA_CHARGE", amount: delta,
    description: `Extra expense corrected for ${order.display_id}: ₹${order.extra_expense} → ₹${newExtraExpense}`,
    is_correction: true,
    occurred_at: nowUTC, created_by: userId || null,
  });
  await supabase.from("rental_orders").update({ extra_expense: newExtraExpense }).eq("id", rentalOrderId);
}

// ============================================================
// PAYMENT TAB — standalone transactions against a customer's account,
// with no rental_order_id at all (§8: works purely off the customer,
// no rental context required).
// ============================================================

// Latest unique rental customers, sorted by their most recent rental.
export async function listRecentRentalCustomers(limit = 10) {
  if (browserOffline()) {
    const cached = await readSnapshot(await offlineUserId(), 'recentCustomers');
    if (cached) return cached.rows.slice(0, limit);
    throw new Error('Offline: recent customers have not been synchronized yet.');
  }
  const { data: orders, error } = await supabase.from("rental_orders")
    .select("id, display_id, customer_id, created_at, customers(*)")
    .order("created_at", { ascending: false }).limit(Math.min(1000, Math.max(200, limit * 5)));
  if (error) {
    if (isNetworkFailure(error)) {
      const cached = await readSnapshot(await offlineUserId(), 'recentCustomers');
      if (cached) return cached.rows.slice(0, limit);
      throw new Error('Offline: recent customer data is not yet cached. Connect once to synchronize.');
    }
    throw error;
  }
  const seen = new Set();
  const recent = [];
  for (const order of orders || []) {
    if (!order.customers || seen.has(order.customer_id)) continue;
    seen.add(order.customer_id);
    recent.push({ ...order.customers, latestRentalId: order.display_id, latestRentalAt: order.created_at });
    if (recent.length >= limit) break;
  }
  await writeSnapshot(await offlineUserId(), 'recentCustomers', recent);
  await mergeSnapshot(await offlineUserId(), 'customers', recent);
  return recent;
}

// Call once when Start Rental opens online, to make customers searchable offline.
export async function syncOfflineCustomerDirectory() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  const userId = await offlineUserId();
  if (!userId) return;
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from('customers').select('*').order('created_at', {ascending: false}).range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  await writeSnapshot(userId, 'customers', rows);
  return rows.length;
}

export async function listCustomersWithBalance(query) {
  let q = supabase.from("customers_with_balance").select("*").order("name");
  if (query?.trim()) {
    const s = query.trim();
    q = q.or(`name.ilike.%${s}%,mobile.ilike.%${s}%`);
  }
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

// action: "collect" | "refund" | "charge" | "discount". Amount is always
// passed positive; the sign per §2 is decided here, not by the caller.
export async function recordStandaloneTransaction({ customerId, action, amount, paymentMode, note, userId }) {
  userId = userId ?? (await getCurrentUserId());
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("Enter a valid positive whole-rupee amount.");
  if ((action === "charge" || action === "discount") && !note?.trim()) {
    throw new Error(action === "charge" ? "Add a reason for this charge." : "A note is required for any discount or waiver.");
  }

  const typeMap = {
    collect: { type: "PAYMENT_RECEIVED", amount: -Math.abs(amount), needsMode: true },
    refund: { type: "REFUND_PAID", amount: Math.abs(amount), needsMode: true },
    charge: { type: "EXTRA_CHARGE", amount: Math.abs(amount), needsMode: false },
    discount: { type: "DISCOUNT_ADJUSTMENT", amount: -Math.abs(amount), needsMode: false },
  }[action];
  if (!typeMap) throw new Error(`Unknown payment action: ${action}`);

  if (action === "refund") {
    const balance = await getCustomerBalance(customerId);
    const availableCredit = balance < 0 ? -balance : 0;
    if (amount > availableCredit) throw new Error(`Only ₹${availableCredit} credit is available to refund.`);
  }

  const nowUTC = new Date().toISOString();
  const { data: event, error: eventErr } = await supabase
    .from("events")
    .insert({ customer_id: customerId, event_type: "PAYMENT_TAB", occurred_at: nowUTC, created_by: userId || null })
    .select()
    .single();
  if (eventErr) throw eventErr;

  const { error: txnErr } = await supabase.from("transactions").insert({
    event_id: event.id,
    customer_id: customerId,
    rental_order_id: null,
    type: typeMap.type,
    amount: typeMap.amount,
    payment_mode: typeMap.needsMode ? paymentMode : null,
    description: note?.trim() || (action === "collect" ? "Payment received" : action === "refund" ? "Refund paid" : ""),
    occurred_at: nowUTC,
    created_by: userId || null,
  });
  if (txnErr) throw txnErr;

  return { newBalance: await getCustomerBalance(customerId) };
}

// Recent standalone + rental activity for one customer, newest first —
// powers the "Recent activity" list under the balance card.
export async function getCustomerActivity(customerId, limit = 20) {
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("customer_id", customerId)
    .order("occurred_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

// Payment-tab recent activity is deliberately restricted to standalone events.
export async function getPaymentsTabActivity(customerId) {
  const { data: events, error: eventError } = await supabase.from("events")
    .select("id").eq("customer_id", customerId).eq("event_type", "PAYMENT_TAB")
    .order("occurred_at", { ascending: false }).limit(50);
  if (eventError) throw eventError;
  if (!events?.length) return [];
  const { data, error } = await supabase.from("transactions").select("*")
    .in("event_id", events.map(e => e.id))
    .in("type", ["PAYMENT_RECEIVED", "REFUND_PAID", "EXTRA_CHARGE", "DISCOUNT_ADJUSTMENT"])
    .order("occurred_at", { ascending: false }).limit(10);
  if (error) throw error;
  return data || [];
}

// ============================================================
// CUSTOMER DATABASE — profile, orders, and the correction workflow.
// ============================================================

export async function getCustomerOrders(customerId) {
  const { data, error } = await supabase
    .from("rental_orders")
    .select("*, rental_items(id, status, expected_return_at, machines(machine_number), rental_item_segments(id, from_at, to_at, reason, daily_rate))")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map((o) => ({
    ...o,
    status: o.rental_items.length > 0 && o.rental_items.every((i) => i.status === "returned") ? "closed" : "active",
  }));
}

export async function setCustomerFlag(customerId, flag) {
  const { error } = await supabase.from("customers").update({ flag }).eq("id", customerId);
  if (error) throw error;
}

// §8 correction workflow: NEVER edit a stored transaction. Every fix is an
// addition — a reversal of the original, plus a freshly logged corrected
// entry, both linked back via corrects_transaction_id. Cash-movement types
// should already have been through the "was cash also wrong?" question in
// the UI before this is called (if cash was wrong too, that's a Payment Tab
// entry instead, not a correction — this function is record-only).
const NEGATIVE_TYPES = ["ADVANCE_RECEIVED", "PAYMENT_RECEIVED", "DISCOUNT_ADJUSTMENT"];
function signedAmountForType(type, magnitude) {
  return NEGATIVE_TYPES.includes(type) ? -Math.abs(magnitude) : Math.abs(magnitude);
}

export async function correctTransaction({ originalTransactionId, newAmount, reason, userId }) {
  userId = userId ?? (await getCurrentUserId());
  if (!reason?.trim()) throw new Error("A reason is required to correct an entry.");

  const { data: original, error: fetchErr } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", originalTransactionId)
    .single();
  if (fetchErr) throw fetchErr;
  if (original.is_correction) throw new Error("Can't correct a correction — go back to the original entry.");

  const nowUTC = new Date().toISOString();
  const { data: event, error: eventErr } = await supabase
    .from("events")
    .insert({ customer_id: original.customer_id, event_type: "CORRECTION", occurred_at: nowUTC, created_by: userId || null })
    .select()
    .single();
  if (eventErr) throw eventErr;

  const base = {
    customer_id: original.customer_id,
    rental_order_id: original.rental_order_id,
    rental_item_id: original.rental_item_id,
    type: original.type,
    payment_mode: original.payment_mode,
    machine_number: original.machine_number,
    days: original.days,
    is_correction: true,
    corrects_transaction_id: original.id,
    occurred_at: nowUTC,
    created_by: userId || null,
  };

  const { error: revErr } = await supabase.from("transactions").insert({
    ...base,
    event_id: event.id,
    amount: -original.amount,
    description: `Correction — reversing "${original.description}" (${reason.trim()})`,
  });
  if (revErr) throw revErr;

  const { error: corErr } = await supabase.from("transactions").insert({
    ...base,
    event_id: event.id,
    amount: signedAmountForType(original.type, newAmount),
    description: `${original.description} (corrected — ${reason.trim()})`,
  });
  if (corErr) throw corErr;
}

// ============================================================
// DASHBOARD / HISTORY — read-only aggregates
// ============================================================

export async function getDashboardStats({ fromUTC, toUTC }) {
  // Server-side aggregates avoid PostgREST's default 1,000-row response cap.
  // If migration 013 is not installed, retain legacy behavior until deployed.
  const {data: periodMetrics, error: periodError} = await supabase.rpc('rd_dashboard_period_metrics', {
    p_from: fromUTC, p_to: toUTC
  });
  if (periodError && periodError.code !== '42883' && !/function.*does not exist|schema cache/i.test(periodError.message || '')) throw periodError;

  // Independent read-only dashboard requests run concurrently. This avoids
  // waiting for multiple network round trips in series on every tab visit.
  const [rentalsResult, chargesResult, customersResult, paymentsResult,
    allMachines, allProducts, activeItems, customersBal, itemsResult] = await Promise.all([
    periodMetrics ? Promise.resolve({count:0}) : supabase.from("rental_orders").select("id", {count:"exact",head:true}).gte("created_at",fromUTC).lte("created_at",toUTC),
    periodMetrics ? Promise.resolve({data:[]}) : supabase.from("transactions").select("rental_item_id").eq("type","RENT_CHARGE").gte("occurred_at",fromUTC).lte("occurred_at",toUTC),
    periodMetrics ? Promise.resolve({count:0}) : supabase.from("customers").select("id", {count:"exact",head:true}).gte("created_at",fromUTC).lte("created_at",toUTC),
    periodMetrics ? Promise.resolve({data:[]}) : supabase.from("transactions").select("amount").eq("type","PAYMENT_RECEIVED").gte("occurred_at",fromUTC).lte("occurred_at",toUTC),
    listMachines(),listProducts(),listActiveRentals(),listCustomersWithBalance(""),
    supabase.from("rental_items").select("product_id").gte("created_at",fromUTC).lte("created_at",toUTC),
  ]);
  for (const result of [rentalsResult,chargesResult,customersResult,paymentsResult,itemsResult]) if(result.error) throw result.error;
  const newRentals = periodMetrics ? Number(periodMetrics.new_rentals) : rentalsResult.count;
  const rentCharges = chargesResult.data;
  const returnsCount = periodMetrics ? Number(periodMetrics.returns_count) : new Set((rentCharges || []).map(r => r.rental_item_id)).size;
  const newCustomers = periodMetrics ? Number(periodMetrics.new_customers) : customersResult.count;
  const payments = paymentsResult.data;
  const totalCollected = periodMetrics ? Number(periodMetrics.total_collected) : (payments || []).reduce((sum, p) => sum + Math.abs(p.amount), 0);

  const rented = allMachines.filter((m) => m.status === "rented").length;
  const repair = allMachines.filter((m) => m.status === "repair").length;

  const outstanding = customersBal.filter((c) => c.balance > 0);
  const outstandingCustomers = outstanding.length;
  const outstandingAmount = outstanding.reduce((s, c) => s + c.balance, 0);

  const itemsInRange = itemsResult.data;
  const rentCounts = {};
  (itemsInRange || []).forEach((i) => { rentCounts[i.product_id] = (rentCounts[i.product_id] || 0) + 1; });

  const topProducts = allProducts
    .map((p) => {
      const pm = allMachines.filter((m) => m.product_id === p.id);
      const total = pm.length;
      const rentedNow = pm.filter((m) => m.status === "rented").length;
      return { product: p.name, timesRented: rentCounts[p.id] || 0, total, rentedNow, availableNow: total - rentedNow };
    })
    .sort((a, b) => b.timesRented - a.timesRented)
    .slice(0, 5);

  const lowAvailability = allProducts
    .map((p) => {
      const pm = allMachines.filter((m) => m.product_id === p.id);
      return { product: p.name, availableNow: pm.length - pm.filter((m) => m.status === "rented").length, total: pm.length };
    })
    .filter((p) => p.total > 0 && p.availableNow === 0);

  const byCustomer = {};
  activeItems.forEach((item) => {
    const cust = item.rental_orders.customers;
    if (!byCustomer[cust.id]) byCustomer[cust.id] = { id: cust.id, name: cust.name, mobile: cust.mobile, items: [], dueDate: item.expected_return_at };
    byCustomer[cust.id].items.push(item.machines.machine_number);
    if (new Date(item.expected_return_at) < new Date(byCustomer[cust.id].dueDate)) byCustomer[cust.id].dueDate = item.expected_return_at;
  });
  const activeCustomerList = Object.values(byCustomer).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  return {
    newRentals: newRentals || 0, returnsCount, newCustomers: newCustomers || 0, totalCollected,
    rented, repair, activeRentals: new Set(activeItems.map(i => i.rental_order_id)).size, outstandingCustomers, outstandingAmount,
    topProducts, lowAvailability, activeCustomerList,
  };
}

// One row per transaction (not per event) — this is the granularity the
// History screen displays: every money-moving or informational action,
// in order, never edited after the fact.
export async function getHistoryFeed({ eventType, fromUTC, toUTC } = {}) {
  let q = supabase
    .from("transactions")
    .select("*, events(event_type, occurred_at), customers(name, mobile)")
    .order("occurred_at", { ascending: false })
    .limit(500);
  if (fromUTC) q = q.gte("occurred_at", fromUTC);
  if (toUTC) q = q.lte("occurred_at", toUTC);
  const { data, error } = await q;
  if (error) throw error;
  return eventType ? data.filter((r) => r.events?.event_type === eventType) : data;
}

// Machine revenue is a read-only projection of the existing customer ledger.
// Allocate each return event's combined discount proportionally across its
// finalized machine charges, in integer paise with a deterministic remainder.
// Payment and prior customer balance are deliberately excluded.

export async function getMachineHistory(machineId) {
  const { data: segments, error: segmentError } = await supabase.from('rental_item_segments')
    .select('id,rental_item_id,from_at,to_at,daily_rate,reason,rental_items(rental_order_id,rental_orders(display_id,customers(name)))')
    .eq('machine_id', machineId).order('from_at', { ascending: false });
  if (segmentError) throw segmentError;
  const ids = [...new Set((segments || []).map(s => s.rental_item_id))];
  let machineCharges = [], netByItem = new Map();
  if (ids.length) {
    const { data, error } = await supabase.from('transactions')
      .select('event_id,rental_item_id,amount,days').eq('type', 'RENT_CHARGE').in('rental_item_id', ids);
    if (error) throw error;
    machineCharges = data || [];
    const eventIds = [...new Set(machineCharges.map(c => c.event_id).filter(Boolean))];
    if (eventIds.length) {
      // Include every machine in the same settlement, even if this profile
      // only belongs to one of them. Otherwise its discount share is wrong.
      const [allChargesResult, discountsResult] = await Promise.all([
        supabase.from('transactions').select('event_id,rental_item_id,amount').eq('type', 'RENT_CHARGE').in('event_id', eventIds),
        supabase.from('transactions').select('event_id,amount').eq('type', 'DISCOUNT_ADJUSTMENT').in('event_id', eventIds),
      ]);
      if (allChargesResult.error) throw allChargesResult.error;
      if (discountsResult.error) throw discountsResult.error;
      for (const eventId of eventIds) {
        const charges = (allChargesResult.data || []).filter(c => c.event_id === eventId);
        const discount = -(discountsResult.data || []).filter(d => d.event_id === eventId)
          .reduce((sum, d) => sum + Number(d.amount || 0), 0);
        for (const allocation of allocateReturnEventRevenue(charges, discount)) {
          const key = `${eventId}:${allocation.rentalItemId}`;
          netByItem.set(key, (netByItem.get(key) || 0) + allocation.net);
        }
      }
    }
  }
  const { data: repairs, error: repairError } = await supabase.from('machine_repairs')
    .select('*').eq('machine_id', machineId).order('started_at', { ascending: false });
  if (repairError) throw repairError;
  const segmentCountByItem = new Map();
  for (const s of segments || []) segmentCountByItem.set(s.rental_item_id, (segmentCountByItem.get(s.rental_item_id) || 0) + 1);
  const rentals = (segments || []).map(s => {
    const order = s.rental_items?.rental_orders;
    const own = machineCharges.filter(c => c.rental_item_id === s.rental_item_id);
    const hasMultiple = segmentCountByItem.get(s.rental_item_id) > 1;
    // Legacy swapped machine sessions cannot safely receive the full item charge.
    const charge = !hasMultiple && own.length === 1 ? own[0] : null;
    return {
      id: s.id, orderId: order?.display_id || '—', customer: order?.customers?.name || '—',
      from: s.from_at, to: s.to_at,
      days: s.to_at && charge ? charge.days : null,
      revenue: s.to_at && charge ? (netByItem.get(`${charge.event_id}:${s.rental_item_id}`) ?? Number(charge.amount || 0)) : 0,
    };
  });
  return { rentals, repairs: repairs || [] };
}

// Only machine profile can request manual changes; SQL RPC enforces rented locks.
export async function changeMachineStatus(machineId,status){
  const {error}=await supabase.rpc('rd_change_machine_status',{p_machine_id:machineId,p_status:status});
  if(error)throw error;
}
export async function completeMachineRepair({machineId,cost,notes}){
  const {error}=await supabase.rpc('rd_complete_machine_repair',{p_machine_id:machineId,p_cost:cost,p_notes:notes});
  if(error)throw error;
}

export async function addMachineRepair({machineId,problem,cost=0,notes=''}){
  const {error}=await supabase.from('machine_repairs').insert({machine_id:machineId,problem,cost,notes,status:'open'});
  if(error)throw error;
  await changeMachineStatus(machineId,'repair');
}
export async function finishMachineRepair(repairId,machineId){
  const {error}=await supabase.from('machine_repairs').update({status:'completed',completed_at:new Date().toISOString()}).eq('id',repairId).eq('machine_id',machineId);
  if(error)throw error;
  const {count,error:countError}=await supabase.from('machine_repairs').select('id',{count:'exact',head:true}).eq('machine_id',machineId).eq('status','open');
  if(countError)throw countError;
  if(count===0)await setMachineStatus(machineId,'available');
}

// V16 reporting: fetch product rental sessions, charges and discounts in batches.
// This never writes to the financial ledger or allocation table.
export async function getInventoryReportData(machineList) {
  const ids = machineList.map(m => m.id);
  if (!ids.length) return { stats: [], statusHistory: [], segments: [] };
  const [segmentsResult, historyResult, repairsResult] = await Promise.all([
    supabase.from('rental_item_segments').select('id,machine_id,rental_item_id,from_at,to_at').in('machine_id', ids),
    supabase.from('machine_status_history').select('machine_id,status,started_at').in('machine_id', ids).order('started_at',{ascending:false}),
    supabase.from('machine_repairs').select('machine_id,cost').in('machine_id', ids),
  ]);
  for (const r of [segmentsResult,historyResult,repairsResult]) if(r.error) throw r.error;
  const segments = segmentsResult.data || [];
  const itemIds = [...new Set(segments.map(s=>s.rental_item_id))];
  let charges = [], allCharges = [], discounts = [];
  if(itemIds.length) {
    const r = await supabase.from('transactions').select('event_id,rental_item_id,amount,days').eq('type','RENT_CHARGE').in('rental_item_id',itemIds);
    if(r.error) throw r.error;
    charges = r.data || [];
    const eventIds = [...new Set(charges.map(c=>c.event_id).filter(Boolean))];
    if(eventIds.length) {
      const [c,d] = await Promise.all([
        supabase.from('transactions').select('event_id,rental_item_id,amount').eq('type','RENT_CHARGE').in('event_id',eventIds),
        supabase.from('transactions').select('event_id,amount').eq('type','DISCOUNT_ADJUSTMENT').in('event_id',eventIds),
      ]);
      if(c.error) throw c.error;
      if(d.error) throw d.error;
      allCharges=c.data||[]; discounts=d.data||[];
    }
  }
  const allocations = new Map();
  for(const eventId of new Set(charges.map(c=>c.event_id).filter(Boolean))) {
    const eventCharges = allCharges.filter(c=>c.event_id===eventId);
    const discount = -discounts.filter(d=>d.event_id===eventId).reduce((s,d)=>s+Number(d.amount||0),0);
    for(const a of allocateReturnEventRevenue(eventCharges,discount))
      allocations.set(`${eventId}:${a.rentalItemId}`,a.net);
  }
  const segmentCount = new Map();
  for(const s of segments) segmentCount.set(s.rental_item_id,(segmentCount.get(s.rental_item_id)||0)+1);
  const stats = machineList.map(m=>{
    const ownSegments = segments.filter(s=>s.machine_id===m.id && s.to_at);
    let revenue=0, days=0, rentals=0;
    for(const s of ownSegments) {
      const itemCharges=charges.filter(c=>c.rental_item_id===s.rental_item_id);
      if(segmentCount.get(s.rental_item_id)!==1 || itemCharges.length!==1) continue;
      const c=itemCharges[0];
      revenue+=allocations.get(`${c.event_id}:${s.rental_item_id}`)??Number(c.amount||0);
      days+=Number(c.days||0); rentals++;
    }
    return { id:m.id, revenue,days,rentals,purchaseCost:Number(m.purchase_cost||0),
      repairs:(repairsResult.data||[]).filter(r=>r.machine_id===m.id).reduce((s,r)=>s+Number(r.cost||0),0) };
  });
  return {stats,statusHistory:historyResult.data||[],segments};
}

export async function getMachineTiming(machineId) {
  const [history,segments] = await Promise.all([
    supabase.from('machine_status_history').select('machine_id,status,started_at').eq('machine_id',machineId).order('started_at',{ascending:false}).limit(30),
    supabase.from('rental_item_segments').select('machine_id,to_at').eq('machine_id',machineId).not('to_at','is',null).order('to_at',{ascending:false}).limit(1),
  ]);
  if(history.error) throw history.error;
  if(segments.error) throw segments.error;
  return {statusHistory:history.data||[],segments:segments.data||[]};
}

// Non-financial inventory/customer/note changes are captured by DB triggers.
export async function getAuditHistory({ fromUTC, toUTC } = {}) {
  let q = supabase.from('rd_audit_history').select('*').order('occurred_at', { ascending: false }).limit(500);
  if (fromUTC) q = q.gte('occurred_at', fromUTC);
  if (toUTC) q = q.lte('occurred_at', toUTC);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}
