/// <reference path="./ts/hut.d.ts"/>
// Comments may precede "use strict": https://stackoverflow.com/questions/31412978
'use strict';

process.stdout.write('\u001b[0m'); // Clear any ansi set by previous output

require('./nodejs/util/installV8ErrorStacktraceHandler.js');

(() => {
  
  let err = Error('hello hellooo');
  console.log('DESC: ' + err.desc());
  
  if ((() => 1)()) process.exit(0);
  
})();

// Require clearing.js (it's under "rooms", but simply modifies global
// state so it can be required directly)
Object.assign(global, { rooms: Object.create(null) });
require('./room/setup/clearing/clearing.js');

// Do nothing more if this isn't the main file
if (process.argv[1] !== __filename) return;

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

let conf = (() => { // Parse command-line conf
  
  try {
    
    let { argv } = process;
    let looksLikeEval = /^[{['"]/;
    
    let conf = {};
    for (let arg of argv.slice(2)) {
      
      if (looksLikeEval.test(arg)) arg = eval(`(${arg})`);
      if (!arg) continue;
      
      if (isForm(arg, String)) {
        
        // String values without "=" are the single hoist room name;
        // those with "=" represent key-value pairs; those with ":="
        // represent key-value pairs with eval'd values
        let isEval = arg.has(':=');
        let [ k, v=null ] = arg.cut(isEval ? ':=' : '=').map(v => v.trim());
        if (v === null) [ k, v ] = [ 'deploy.0.loft.name', k ];
        
        arg = { [k]: isEval ? eval(`(${v})`) : v };
        
      }
      
      if (!isForm(arg, Object)) throw Error(`Failed to process argument "${arg}"`);
      
      conf.merge(arg);
      
    }
    
    return conf;
    
  } catch (err) {
    
    gsc(String.baseline(`
      | A commandline argument could not be processed. Note that any commandline argument beginning with "{" or quotes must represent a valid javascript value.
      | The following value was invalid:
      |   | 
      |   | "${process.argv.at(-1)}"
      |   | 
      | Hut couldn't resolve any meaningful arguments based on this commandline input.
      | 
      | A more specific error description: ${err.message}
    `));
    process.exit(0);
    
  }
  
})();

require('./nodejs/foundation.js')({ hutFp: __dirname, conf })
  .fail(err => console.log('FATAL', err));
