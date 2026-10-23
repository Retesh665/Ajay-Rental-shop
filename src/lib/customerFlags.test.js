import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCustomerFlag, CUSTOMER_FLAGS } from "./customerFlags.js";

test("customer flags match the database allowed values", () => {
  assert.deepEqual(CUSTOMER_FLAGS, ["green", "yellow", "red"]);
  assert.equal(normalizeCustomerFlag("green"), "green");
  assert.equal(normalizeCustomerFlag("yellow"), "yellow");
  assert.equal(normalizeCustomerFlag("red"), "red");
});

test("legacy amber alias is normalized to database yellow", () => {
  assert.equal(normalizeCustomerFlag("amber"), "yellow");
});

test("unknown flag values safely fall back to green", () => {
  assert.equal(normalizeCustomerFlag("gold"), "green");
  assert.equal(normalizeCustomerFlag(null), "green");
});
