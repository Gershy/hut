'use strict';
require('../../room/setup/clearing/clearing.js');

let traceable = (fn, name) => (...args) => {
  
  let err = Error();
  return safe(() => fn(...args), cause => {
    let { code, errno, syscall } = (cause.name === 'SystemError') ? cause.info : cause;
    err.propagate({ msg: `Failed nodejs.fs.${name}(...args)\n${cause.message}`, args, code /*, meta: { errno, syscall } */ });
  });
  
};

module.exports = (() => {
  
  let { os, path, fs, crypto } = [ 'os', 'path', 'fs', 'crypto' ].toObj(t => [ t, require(`node:${t}`) ]);
  
  // Some replacement/supplemental fs functions:
  let fsRename = async (src, trg, { maxDurMs=5000, maxAttempts=3000, minWaitMs=5, backoffMult=0.25 }={}) => {
    
    let ms = getMs();
    let attemptCnt = 0;
    
    while (true) {
      
      attemptCnt++;
      try { return await fs.promises.rename(src, trg); } catch (err) {
        
        if (err.code !== 'EPERM') throw err;
        
        let durMs = getMs() - ms;
        let allowedToReattempt = true
          && attemptCnt < maxAttempts
          && durMs < maxDurMs;
        if (!allowedToReattempt) break;
        
        // Wait half the total time already taken; exponential backoff
        // Ignore excessively short wait-times; note this can exhaust `maxAttempts` much quicker
        let waitMs = (getMs() - ms) * backoffMult;
        if (waitMs > minWaitMs) await Promise(r => setTimeout(r, waitMs));
        
      }
      
    }
    
    throw Error('Rename retries exceeded').mod({ code: 'ERETRIESEXCEEDED' });
    
  };
  let fsAtomicWrite = async (fp, data, opts={}) => {
    
    let tmpFp = path.join(os.tmpdir(), Math.random().toString(36).slice(2));
    await fs.promises.writeFile(tmpFp, data, opts);
    await fsRename(tmpFp, fp, opts);
    
  };
  
  return {
    // Expose these directly
    os, crypto, path,
    
    // For the fs module we want to add supplemental functions and ensure traceability
    fs: {
      ...fs.promises,
      ...fs.slice([ 'createReadStream', 'createWriteStream' ]),
      rename: fsRename,
      atomicWrite: fsAtomicWrite
    }.map((fn, name) => traceable(fn, name))
  };
  
})();