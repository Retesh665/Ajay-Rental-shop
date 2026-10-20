export function elapsedDays(from, now = new Date()) {
  if (!from) return 0;
  // Compare calendar dates in Asia/Kolkata, not rolling 24-hour windows.
  const parts = value => {
    const fields = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
    const get = type => Number(fields.find(f => f.type === type).value);
    return Date.UTC(get('year'),get('month')-1,get('day'));
  };
  const ms = parts(now) - parts(from);
  return Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 86400000)) : 0;
}
export function machineTimeCounters(machine, statusHistory = [], rentalSegments = [], now = new Date()) {
  const status = machine.status;
  const transitions = statusHistory.filter(h => h.machine_id === machine.id).sort((a,b) => new Date(b.started_at)-new Date(a.started_at));
  const current = transitions.find(h => h.status === status);
  if (status === 'repair') return { idle: 0, downtime: elapsedDays(current?.started_at, now) };
  if (status !== 'available') return { idle: 0, downtime: 0 };
  const latestReturn = rentalSegments.filter(s => s.machine_id === machine.id && s.to_at)
    .reduce((latest,s) => !latest || new Date(s.to_at)>new Date(latest) ? s.to_at : latest, null);
  const start = [machine.created_at, latestReturn, current?.started_at].filter(Boolean)
    .sort((a,b)=>new Date(b)-new Date(a))[0];
  return { idle: elapsedDays(start, now), downtime: 0 };
}
export function bucketMatches(days, bucket) {
  return bucket === 'all' || (bucket === 'lt3' && days < 3) ||
    (bucket === '3to7' && days >= 3 && days <= 7) || (bucket === 'gt7' && days > 7);
}
export function productMetrics(machineStats, machineCount) {
  const revenue = machineStats.reduce((s,m)=>s+m.revenue,0);
  const earnings = machineStats.reduce((s,m)=>s+m.revenue-m.repairs-m.purchaseCost,0);
  const rentals = machineStats.reduce((s,m)=>s+m.rentals,0);
  const days = machineStats.reduce((s,m)=>s+m.days,0);
  return { revenue, earnings, averagePerMachine:machineCount?revenue/machineCount:0,
    averagePerRental:rentals?revenue/rentals:0, averageDailyRate:days?revenue/days:0, rentals };
}
