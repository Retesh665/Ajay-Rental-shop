import test from 'node:test';
import assert from 'node:assert/strict';
import {elapsedDays,machineTimeCounters,bucketMatches,productMetrics} from '../src/lib/inventoryMetrics.js';
test('idle starts at latest available transition, not during repair',()=>{
 const m={id:'a',status:'available',created_at:'2026-09-01T00:00:00Z'};
 const h=[{machine_id:'a',status:'available',started_at:'2026-10-05T00:00:00Z'}];
 const seg=[{machine_id:'a',to_at:'2026-10-01T00:00:00Z'}];
 assert.deepEqual(machineTimeCounters(m,h,seg,'2026-10-10T00:00:00Z'),{idle:5,downtime:0});
});
test('repair shows downtime only',()=>{
 const m={id:'a',status:'repair'};
 const h=[{machine_id:'a',status:'repair',started_at:'2026-10-07T00:00:00Z'}];
 assert.deepEqual(machineTimeCounters(m,h,[],'2026-10-10T00:00:00Z'),{idle:0,downtime:3});
});
test('rented and dismantled have zero counters',()=>{
 for(const status of ['rented','dismantled']) assert.deepEqual(machineTimeCounters({id:'a',status},[],[]),{idle:0,downtime:0});
});
test('nonoverlapping day buckets',()=>{
 assert.deepEqual([2,3,7,8].map(n=>['lt3','3to7','gt7'].filter(b=>bucketMatches(n,b))),[['lt3'],['3to7'],['3to7'],['gt7']]);
});
test('product metrics use machine session denominator',()=>{
 assert.deepEqual(productMetrics([{revenue:150,repairs:20,purchaseCost:50,rentals:2,days:3},{revenue:50,repairs:0,purchaseCost:20,rentals:1,days:2}],2),{revenue:200,earnings:110,averagePerMachine:100,averagePerRental:200/3,averageDailyRate:40,rentals:3});
});

test('IST calendar days, not elapsed 24h',()=>{
 assert.equal(elapsedDays('2026-10-10T18:20:00Z','2026-10-10T19:00:00Z'),1);
});
test('revenue consolidates across machines',()=>{
 const r=productMetrics([{revenue:80,repairs:0,purchaseCost:0,rentals:1,days:1},{revenue:120,repairs:10,purchaseCost:50,rentals:2,days:3}],2);
 assert.equal(r.revenue,200);assert.equal(r.earnings,140);
});
