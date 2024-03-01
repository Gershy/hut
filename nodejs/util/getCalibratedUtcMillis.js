'use strict';

module.exports = (() => {
  
  // Find a hi-res timestamp very close to a Date.now() millisecond
  // tickover; we determine whether we're close to the beginning of a
  // millisecond tickover by counting busy-wait iterations completed
  // before the end of the millisecond; the more, the closer we assume
  // we were to the millisecond origin. Finally use the nearest such
  // millisecond as an origin time for `getMs` calls, supplemented by
  // a hi-res value
  let { performance: perf } = require('perf_hooks');
  let getMsHiRes = perf.now.bind(perf);
  let getMsLoRes = Date.now;

  let origin = getMsHiRes() - getMsLoRes(); // We're going to tune `origin` to the average difference between `nowHiRes()` and `nowLoRes()`
  let maxMs = 15; // How long to calibrate (busy-wait) for
  let lo0 = getMsLoRes();
  while (true) {
    
    let [ lo, hi ] = [ getMsLoRes(), getMsHiRes() ];
    let elapsed = lo - lo0;
    if (elapsed > maxMs) break; // 30ms busy-wait
    
    let diff = (lo + 0.5) - hi; // `lo` marks the *beginning* of a millisecond, so add 0.5 on average!
    
    // The later we go the amount of change to `origin` decreases
    let amt = elapsed / maxMs;
    origin = origin * amt + diff * (1 - amt);
    
  }
  
  return () => origin + getMsHiRes();
  
});