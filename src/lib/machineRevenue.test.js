import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateReturnEventRevenue } from './machineRevenue.js';

test('single machine discount independent of payments', () => {
  assert.deepEqual(allocateReturnEventRevenue([{rental_item_id:'a',amount:200}], 50), [{rentalItemId:'a',gross:200,discount:50,net:150}]);
});
test('combined discount proportional allocation', () => {
  const result=allocateReturnEventRevenue([{rental_item_id:'a',amount:2500},{rental_item_id:'b',amount:1500}],300);
  assert.deepEqual(result.map(r=>r.net),[2312.5,1387.5]);
});
test('rounding remainder allocated without losing paise', () => {
  const result=allocateReturnEventRevenue([{rental_item_id:'a',amount:1},{rental_item_id:'b',amount:1},{rental_item_id:'c',amount:1}],1);
  assert.equal(result.reduce((sum,r)=>sum+r.discount,0),1);
  assert.equal(result.reduce((sum,r)=>sum+r.net,0),2);
});
test('discount cannot create negative machine revenue', () => {
  const result=allocateReturnEventRevenue([{rental_item_id:'a',amount:200}],300);
  assert.equal(result[0].net,0);
});
