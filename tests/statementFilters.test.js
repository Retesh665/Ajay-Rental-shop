import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesFinancialFilter as match } from '../src/lib/statementFilters.js';
const event=(...entries)=>({eventType:'START_RENTAL',entries:entries.map(([type,amount])=>({type,amount}))});
test('zero-value advances never qualify for Payments',()=>{assert.equal(match(event(['ADVANCE_RECEIVED',0]),'Payments'),false);assert.equal(match(event(['ADVANCE_RECEIVED',-80]),'Payments'),true)});
test('charge, payment and adjustment filters require actual movements',()=>{
 const e=event(['RENT_CHARGE',250],['PAYMENT_RECEIVED',-200],['DISCOUNT_ADJUSTMENT',-50]);
 for(const f of ['Charges','Payments','Adjustments','All']) assert.equal(match(e,f),true);
 for(const f of ['Charges','Payments','Adjustments']) assert.equal(match(event(['RENT_CHARGE',0],['PAYMENT_RECEIVED',0],['DISCOUNT_ADJUSTMENT',0]),f),false);
});
test('note-only modification is not an adjustment',()=>assert.equal(match({eventType:'MANAGE_ACTIVE_RENTAL',entries:[]},'Adjustments'),false));
