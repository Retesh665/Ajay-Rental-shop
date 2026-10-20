import test from 'node:test';
import assert from 'node:assert/strict';
import { returnEventCharges } from '../src/lib/returnTotals.js';
test('return does not bill extra expense already posted at rental start',()=>{
  assert.deepEqual(returnEventCharges([{subtotal:200}], [{extra_expense:50}]),{rentTotal:200,extraTotal:50,chargesForThisEvent:200});
});
test('multiple returned machines only add their rental charges',()=>{
  assert.equal(returnEventCharges([{subtotal:200},{subtotal:150}], [{extra_expense:70}]).chargesForThisEvent,350);
});
