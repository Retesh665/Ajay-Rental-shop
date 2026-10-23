import test from "node:test";
import assert from "node:assert/strict";
import { CUSTOMER_FLAGS, CUSTOMER_FLAG_VALUES, DEFAULT_CUSTOMER_FLAG, getCustomerFlagMeta, normalizeCustomerFlag, isCustomerFlag } from "../src/lib/customerFlags.js";

test("RentDesk has exactly the four supported customer flags", () => {
  assert.deepEqual(CUSTOMER_FLAG_VALUES, ["green", "amber", "red", "gold"]);
  assert.equal(DEFAULT_CUSTOMER_FLAG, "green");
  for (const flag of CUSTOMER_FLAG_VALUES) assert.ok(CUSTOMER_FLAGS[flag]);
});

test("legacy yellow and missing values normalize safely", () => {
  assert.equal(normalizeCustomerFlag("yellow"), "amber");
  assert.equal(normalizeCustomerFlag(null), "green");
  assert.equal(normalizeCustomerFlag("unknown"), "green");
});

test("flag metadata resolves consistently for every supported value", () => {
  assert.equal(getCustomerFlagMeta("gold").label, "Gold");
  assert.equal(getCustomerFlagMeta("yellow").label, "Amber");
  for (const flag of CUSTOMER_FLAG_VALUES) assert.ok(isCustomerFlag(flag));
  assert.equal(isCustomerFlag("yellow"), false);
});
