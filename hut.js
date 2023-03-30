'use strict';

// Require clearing.js (it's under "rooms", but simply modifies global
// state so it can be required directly)
Object.assign(global, { rooms: Object.create(null) });
require('./room/setup/clearing/clearing.js');

if (0 || process.cwd() === '/hut') { // Low-level debug
  
  let intervalMs = (process.cwd() === '/hut' ? 10 : 30) * 1000;
  let showThreshold = 1;
  let maxMetrics = 22; // Consider `Infinity`
  let metrics = {};

  global.mmm = (term, val) => {
    if (!metrics.has(term)) metrics[term] = 0;
    metrics[term] += val;
    if (!metrics[term]) delete metrics[term];
  };
  (async () => {
    
    while (true) {
      
      await new Promise(rsv => setTimeout(rsv, intervalMs));
      
      let bToMb = 1 / (1000 ** 2);
      let { heapUsed, heapTotal } = process.memoryUsage();
      let consumed = heapUsed * bToMb;

      let relevantMetrics = metrics
        .toArr((v, k) => (v < showThreshold) ? skip : [ k, v ])
        .valSort(([ k, v ]) => -Math.abs(v))
        .slice(0, maxMetrics);
      
      if (relevantMetrics.empty()) {
        
        gsc(`Heap: ${consumed.toFixed(2)}mb\n  (No metrics)`);
        
      } else {
        
        gsc(`Heap: ${consumed.toFixed(2)}mb\n` + relevantMetrics.map(([ k, v ]) => `  METRIC - ${k.padTail(20)}${v}`).join('\n'));
        
      }
      
    }
    
  })();
  
}

// Run based on directory of this file and command-line configuration
require('./nodejs/foundation.js')({ hutFp: __dirname, conf: (() => { // Parse configuration
  
  try {
    
    let { argv } = process;
    let looksLikeEval = /^[{['"]/;
    return ({}).gain(...argv.slice(argv.indexOf(__filename) + 1).map(v => {
      
      v = v.trim();
      if (looksLikeEval.test(v)) v = eval(`(${v})`);
      if (!v) return skip;
      
      // Consider string values without "=" as the single hoist room name,
      // while strings containing "=" represent key-value pairs
      if (isForm(v, String)) v = v.split(/[ ;,&]+/g).toObj(v => v.cut('=').map(v => v.trim()));
      
      if (!isForm(v, Object)) throw Error(`Couldn't process an argument: "${v}"`);
      
      return v;
      
    }));
    
  } catch (err) {
    
    gsc(String.baseline(`
      | A commandline argument could not be processed. Note that any commandline argument beginning with "{" or quotes must represent a valid javascript value.
      | The following value was invalid:
      |   | 
      |   | "${process.argv.slice(-1)[0]}"
      |   | 
      | Hut couldn't resolve any meaningful arguments based on this commandline input.
      | 
      | A more specific error description: ${err.message}
    `));
    process.exit(0);
    
  }
  
})()});
