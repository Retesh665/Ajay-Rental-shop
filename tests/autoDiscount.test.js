import test from 'node:test';
import assert from 'node:assert/strict';
import { autoReturnDiscount } from '../src/lib/autoDiscount.js';
test('auto discount excludes already applied discount and honors previous credit',()=>{
  assert.equal(autoReturnDiscount(190,150),40);
  assert.equal(autoReturnDiscount(1200,1000),200);
  assert.equal(autoReturnDiscount(250,300),0);
  assert.equal(autoReturnDiscount(-20,0),0);
  assert.equal(autoReturnDiscount(190,190),0);
});
