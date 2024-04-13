/// <reference path="./ts/hut.d.ts"/>
// Comments may precede "use strict": https://stackoverflow.com/questions/31412978
'use strict';

process.stdout.write('\u001b[0m'); // Clear any ansi set by previous output

require('./nodejs/util/installV8PrepareStackTrace.js')();

// Require clearing.js - it simply modifies global state so it can  be required directly
Object.assign(global, { rooms: Object.create(null) });
require('./room/setup/clearing/clearing.js');

// Do nothing more if this isn't the main file
if (process.argv[1] !== __filename) return;

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

require('./nodejs/foundation.js')({ hutFp: __dirname, conf }).fail(gsc);
