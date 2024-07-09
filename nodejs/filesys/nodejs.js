'use strict';
require('../../room/setup/clearing/clearing.js');

module.exports = (() => {
  
  let { os, path, fs, crypto } = [ 'os', 'path', 'fs', 'crypto' ].toObj(t => [ t, require(`node:${t}`) ]);
  let traceableFsFns = { ...fs.promises, ...fs.slice([ 'createReadStream', 'createWriteStream' ]) };
  
  // Replace `fs` with "traceable" version
  fs = traceableFsFns.map((fn, name) => (...args) => {
    
    let err = Error();
    return safe(
      () => fn(...args),
      cause => {
        let { code, errno, syscall } = (cause.name === 'SystemError') ? cause.info : cause;
        err.propagate({ msg: `Failed nodejs.fs.${name}(...args)`, args, code /*, meta: { errno, syscall } */ });
      }
    );
    
  });
  
  return { os, path, fs, crypto };
  
})();