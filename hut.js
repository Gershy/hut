'use strict';

// The server-side equivalent of a web-page running hut:
// Build the clearing, the foundation and all prerequisite rooms, and
// finally build the hut being run.
// Server-side huts perform compilation, as part of the foundation.

// "DesignerMode": view the site in admin mode (or whatever) with an
// additional console that allows for selecting any element and
// modifying decals (or maybe even extents, in some cases?) - changes
// save directly to the Hut (now that shiz is NON-TRIVIAL).

// TrustedHutConsumers should be able to add their tests to some central
// test suite. Tests which pass once should always be expected to pass.

// LowLevelOptions could determine how various features are implemented
// behind the scenes. For example, an animation: should it be rendered
// with css+html (@keyframes), or as a gif? That would be a single
// LowLevelOption. Others could involve storing data in an Object vs an
// Array - which is faster? For gzip, which compression level is best?
// Eventually we have a fixed vector of LowLevelOptions (or maybe it's
// trickier, since certain POs could produce a variable number of
// sub-POs?). If we had a way to measure the overall "cost" of a Hoist,
// AI could optimize values for all POs.

// Keep-Alive headers
// NODE_ENV should be production?

// ==== NOTES
// EventSource looks useful: https://developer.mozilla.org/en-US/docs/Web/API/EventSource

// NO NEED FOR HUT.PROTOTYPE.ENABLEACTION???:
// Sending raw input events to server could allow server/client-side
// logic to be defined with NO overhead.
// - Avoid unecessary raw input events from client -> server by wrapping
// pure-client code in /// {BEL/OW= /// =BEL/OW}
// - Avoid sensitive server-side logic being sent to client-side by
// wrapping in /// {AB/OVE= /// =AB/OVE}
// - No more need for Hut.prototype.enableAction - all functionality is
// controlled through raw inputs
// - So a client 1) performs a raw input 2) the raw input is sent to the
// server 3) changes are affected on the server 4) the changes propagate
// back to affected users, and drive their experiences
// - There is even the possibility for step 4 to occur simultaneously on
// the server and client (the client can sometimes predict the result of
// an action, without needing to hear back from the server). This means
// that what appears to be purely server-side logic exists on the client
// as well. Consider:
// 
// 1. Client actions that add Records
// 2. Client actions that mod Records
// 3. Client actions that rem Records
// 
// For all these, both server and client process the effect at the same
// time. The server always feeds a result back to the client. The client
// can compare this result against the result of its independently
// executed logic; if there is a mismatch the server result obviously
// takes priority (the client result is rolled back; the server result
// is applied).
// 
// Modding is trivial; if the server-side logic is available the client
// can simply make the same changes to its Records (provided the changes
// don't rely on sensitive values that may not ever cross the server's
// logic boundary).
// Removing may not be so trivial - there's no built-in mechanism for
// rolling back `Tmp.end`. The Record would probably need to be rebuilt
// entirely (potentially from its root?)
// Adding is probably the most complex - this is because in order for a
// client to execute an "add" operation independently it would need to
// provide a hid that syncs up with the server's hid, without relying on
// the server to provide that hid. I can kind of imagine some ways to do
// this - e.g. the server keeps the client pre-emptively stocked with a
// list of N upcoming "available" uids. These uids will be consumed in
// order, when "add" operations are applied. Then it's a matter of
// hoping that the server and client create the same Recs in the same
// order (and there's needs to be a resync mechanism if these go out of
// sync).

Object.assign(global, {
  roomDebug: Object.create(null),
  rooms: Object.create(null)
});

// Do setup
require('./setup/clearing.js');
require('./setup/foundationNodejs.js');

if (1) { // Setup basic process monitoring
  
  let log = (...args) => global.gsc ? global.gsc(...args) : console.log(...args);
  
  // NOTE: Trying to catch SIGKILL or SIGSTOP crashes posix!
  // https://github.com/nodejs/node-v0.x-archive/issues/6339
  let evts = 'hup,int,pipe,quit,term'.split(',');
  for (let evt of evts) process.on(`SIG${evt.upper()}`, (...args) => (log(`Process event: "${evt}"`, args), skip));
  
  process.on('SIGINT', (sig, code) => process.exit(code));
  
  process.on('beforeExit', (...args) => log('Process exiting (before); args:', args));
  process.on('exit',       (...args) => log('Process exiting (final); args:', args));
  
}

if (1) { // Low-level debug
  
  let enabled = true;
  let intervalMs = 10000;
  let showThreshold = 1;
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
        .valSort(([ k, v ]) => -v);
      
      if (relevantMetrics.empty()) {
        
        gsc(`Heap: ${consumed.toFixed(2)}mb\n  (No metrics)`);
        
      } else {
        
        gsc(`Heap: ${consumed.toFixed(2)}mb\n` + relevantMetrics.map(([ k, v ]) => `  METRIC - ${(k + ':').padTail(20)}${v}`).join('\n'));
        
      }
      
    }
    
  })();
  
}

let conf = null;
try {
  
  let { argv } = process;
  let looksLikeData = /^[{['"]/;
  conf = ({}).gain(...argv.slice(argv.indexOf(__filename) + 1).map(v => {
    
    v = v.trim();
    if (looksLikeData.test(v)) v = eval(`(${v})`);
    
    if (!v) return skip;
    
    // Consider string values without "=" as the single hoist room name,
    // while strings containing "=" represent key-value pairs
    if (isForm(v, String)) v = v.has('=')
      ? v.split(/[ ;,&]+/g).toObj(v => v.cut('=')) // Key-value pairs
      : { 'hoist.room': v };                       // Room name
    
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

let { FoundationNodejs } = global;
let foundation = global.foundation = FoundationNodejs();

Promise.resolve()
  .then(() => foundation.configure(conf))
  .then(conf => foundation.hoist())
  .fail(err => {
    console.error(foundation.formatError(err.mod(msg => `${msg} (FATAL)`)));
    foundation.halt();
  });
