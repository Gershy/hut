'use strict';

// Note for verbose debug output simply replace all "//// " with blanks
// TODO: This could probably benefit from an OO style (using `form`)...

require('../clearing.js');
let { now } = require('perf_hooks').performance;
let path = require('path');
let fs = {
  
  ...require('fs').promises,
  createReadStream: require('fs').createReadStream,
  createWriteStream: require('fs').createWriteStream,
  
  safeStat: (fp, opts) => fs.stat(fp, opts).fail(err => {
    
    if (err.code !== 'ENOENT') throw err; // Only tolerate ENOENT
    return null;
    
  }),
  safeMakeDir: (fp, opts) => fs.mkdir(fp, opts).fail(err => {
    
    if (err.code !== 'EEXIST') throw err; // Only tolerate EEXIST
    return null;
    
  }),
  getType: async (fp, opts) => {
    
    let stat = await fs.safeStat(fp, opts);
    if (stat === null) return null;
    if (stat.isFile()) return 'file';
    if (stat.isDirectory()) return 'dir';
    throw Error(`Non-file, non-dir: ${fp}`).mod({ stat });
    
  },
  swapFileToDir: async (fp, { tmpName=null, fileCmp=null, ...opts }={}) => {
    
    // We want a dir to replace an existing file (without reads on
    // that previously existing file to fail) - so we replace the
    // file with a directory containing a "default value file"
    
    await fs.rename(fp, tmpName);                      // Move file out of the way
    await fs.mkdir(fp, opts);                          // Replace file with directory
    await fs.rename(tmpName, path.join(fp, fileCmp));  // Set original file as "default value file"
    
  }
  
};

let makeFns = rootCmps => {
  
  if (isForm(rootCmps, String)) rootCmps = rootCmps.split(/[/\\]/).slice(1); // Remove leading "" or drive signifier (like "C:" or "D:")
  if (!isForm(rootCmps, Array)) throw Error(`"rootCmps" should be Array (got ${getFormName(rootCmps)})`);
  
  let rootFp = path.resolve('/', ...rootCmps);
  
  let validComponentRegex = /^[a-zA-Z0-9!@][-a-zA-Z0-9!@._ ]*$/; // alphanum!@ followed by the same including ".", "-" (careful this guy in regexes), "_", and " "
  
  let lockAll = Object.plain();
  let lockRem = Object.plain();
  let lockStAll = Object.plain(); // "lock subtree all"
  
  //// let ind = 0;
  let fns = null;
  return fns = {
    
    makeFp: (cmps, { rcmps=rootCmps }={}) => {
      
      if (isForm(cmps, String)) cmps = cmps.split(/[/\\]/);
      if (!isForm(cmps, Array)) throw Error(`"cmps" should be Array (got ${getFormName(cmps)})`);
      
      let invalidCmp = cmps.find(cmp => !validComponentRegex.test(cmp)).val;
      if (invalidCmp) throw Error(`Contains invalid component: "${invalidCmp}"`);
      
      return {
        key: path.resolve('/', ...rcmps, ...cmps),
        cmps: [ ...rcmps, ...cmps ]
      };
      
    },
    convertFp: fp => {
      
      fp = path.join(fp);
      if (!path.isAbsolute(fp)) throw Error(`Can't convert relative fp "${fp}"`);
      
      // Take off the first component. Note that after splitting on "/"
      // and "\", the first component will either be "" (because, e.g.,
      // `'/a/b/c'.split('/')` has the empty-string as its first item),
      // or a drive signifier like "C:" or "D:". In either case remove
      // the first component!
      return fp.split(/[/\\]/).slice(1);
      
    },
    
    performInQueue: (args, cmps0, fn) => {
      
      if (isForm(args, String)) args = { op: args };
      
      // Note that `st` ("subtree") indicates that this operation locks
      // out any subtree operations that preside over `cmps0`. Note that
      // `ch` ("chain") indicates that this operation *is locked out* by
      // operations that may effect `cmps0` *or any of its ancestors*!
      let { op=null, st=false, ch=false } = args;
      
      // Validate params; get `key` (os-specific filepath) from `cmps`
      if (!isForm(op, String)) throw Error(`"op" should be String (got ${getFormName(op)})`);
      if (!hasForm(fn, Function)) throw Error(`"fn" should be Function (got ${getFormName(fn)})`);
      let { key, cmps } = fns.makeFp(cmps0);
      
      //// let tms = now();
      
      //// let dbgMs = now();
      //// let mi = '-'; // "my ind"
      //// mi = (ind++).toString().padHead(4, '0'); // "my ind"
      //// let desc = `[${mi}] ${op} "${key}"`;
      
      // Compile all locks delaying this operation
      let locksToAwait = [];
      
      // Handle "all" locks. If `ch` is set, check locks for all
      // ancestor paths; otherwise just check the "all" lock for `key`
      let lockAllKeys = ch
        ? cmps.length.toArr(n => fns.makeFp(cmps.slice(0, n + 1), { rcmps: [] }).key)
        : [ key ];
      
      for (let lockAllKey of lockAllKeys) if (lockAll[lockAllKey]) locksToAwait.add(lockAll[lockAllKey]);
      
      // If a "rem" lock is active and this is a "rem" op add that lock
      if (op === 'rem' && lockRem[key]) locksToAwait.add(lockRem[key]);
      
      // Find any "subtree/all" locks active on `cmps`, and any prefix
      // of `cmps`, and add them to `locksToAwait`
      for (let n of cmps.length) {
        let key = fns.makeFp(cmps.slice(0, n + 1), { rcmps: [] }).key;
        if (lockStAll[key]) locksToAwait.add(lockStAll[key]);
      }
      
      //// console.log(`>>> ${desc} began wait after ${(now() - dbgMs).toFixed(2)}ms`);
      //// console.log(`  ` + (locksToAwait.length ? 'Waiting on:\n' + locksToAwait.map(lock => '- ' + lock.desc).join('\n').indent(4) : 'No locks; running immediately!'));
      
      let err = Error('trace');
      
      let prm = Promise.all(locksToAwait)
        //// .then(() => console.log(`  Unlocked ${desc} after ${(now() - dbgMs).toFixed(2)}ms`))
        .then(() => fn(key, cmps))
        //// .finally(() => console.log(`<<< ${desc} completed after ${(now() - dbgMs).toFixed(2)}ms`))
        .fail(ctxErr => {
          //// err.propagate({ ctxErr, msg: `Failed ${desc}` });
          err.propagate({ ctxErr, msg: `Failed ${op}: ${key}` });
        });
      
      let safePrm = prm.fail(err => null); // A silenced Promise to be used for queues
      
      // Think about which operations block which other operations.
      // - read, write, stat (file & dir) block deletes on any ancestor
      // - stat blocks delete and move (as happens when dir is swapped
      //   to file), but not read or write
      // - delete blocks all operations on subtree
      // - "transaction" needs to block as aggressively as possible to
      //   guarantee perfect isolation
      
      // Indicate `cmps` is locked for all operations
      for (let lockAllKey of lockAllKeys) {
        
        if (!lockAll[lockAllKey]) mmm('lockAll', +1);
        let myLockAll = lockAll[lockAllKey] = Promise.all([ safePrm, lockAll[lockAllKey] ]).then(([ r ]) => {
          if (lockAll[lockAllKey] === myLockAll) { mmm('lockAll', -1); delete lockAll[lockAllKey]; }
          return r;
        });
        //// myLockAll.desc = desc;
        
      }
      
      // Indicate ancestors of `cmps` (and `cmps` itself) are locked for
      // deletion
      for (let n of cmps.length) {
        
        let uKey = fns.makeFp(cmps.slice(0, n + 1), { rcmps: [] }).key;
        
        if (!lockRem[uKey]) mmm('lockRem', +1);
        let myLockRem = lockRem[uKey] = Promise.all([ safePrm, lockRem[uKey] ]).then(([ r ]) => {
          if (lockRem[uKey] === myLockRem) { delete lockRem[uKey]; mmm('lockRem', -1); }
          return r;
        });
        //// myLockRem.desc =`[${mi}] (chain:${n}) ${op} "${uKey}"`;
        
      }
      
      // For "subtree" ops indicate the full subtree of `cmps` is locked
      if (st) {
        
        if (!lockStAll[key]) mmm('lockStAll', +1)
        let myLockStAll = lockStAll[key] = Promise.all([ safePrm, lockStAll[key] ]).then(([ r ]) => {
          if (lockStAll[key] === myLockStAll) { delete lockStAll[key]; mmm('lockStAll', -1); }
          return r;
        });
        //// myLockStAll.desc = desc;
        
      }
      
      return prm;
      
    },
    
    atomically: (cmps, fn) => {
      
      // Make a completely new set of filesystem operations with its own
      // initially empty queues. Note that this is still tied into the
      // current "parent" queueing system, because the overall arbitrary
      // functionality of `fn` is considered a subtree op. This means
      // that every operation on that subtree in the parent will have
      // completed before `fn` is called, and `fn` must complete before
      // any additional "parent" functionality runs on the subtree!
      return fns.performInQueue({ op: 'transaction', st: 1, ch: 1 }, cmps, fp => fn(makeFns(fp)));
      
    },
    
    getSize: (cmps, opts={}) => fns.performInQueue('getSize', cmps, async fp => {
      
      let stat = await fs.safeStat(fp, opts);
      if (!stat) return null;
      
      if (stat.isFile()) return stat.size;
      
      if (!stat.isDirectory()) throw Error('Owww ow! OW! No good :(').mod({ fp });
      
      let statDefVal = await fs.safeStat(path.join(fp, '~'), opts);
      if (!statDefVal) return 0;
      if (!statDefVal.isFile()) throw Error('Oh wowww pls this is baddd').mod({ fp });
      return statDefVal.size;
      
    }),
    
    // Handle arbitrary node value
    setValue: (cmps, d, opts={}) => fns.performInQueue({ op: 'setValue', st: 1, ch: 1 }, cmps, async (fp, cmps) => {
      
      // TODO: Think about whether this is a subtree op!
      // TODO: Is `ch: 1` is necessary?? It slows down writes. But is it
      // unsafe to remove it? Is safeMakeDir needed?? Can `fns.setValue`
      // first check to determine if `ch: 1` is necessary?? (No, I don't
      // think so - because any time between transactions [1 transaction
      // to check, the 2nd to apply the change] allows race conditions)
      // In many cases 0 ancestors are missing and the write can occur
      // directly; it's a pity that all the locking business needs to
      // happen anyways D:
      // TODO: Could implement "chain lock" more memory-efficiently by
      // only storing a single key in a new object e.g. `lockChAll`
      // instead of setting multiple keys in `lockAll`
      
      let type = await fs.getType(fp);
      
      if (type === null) {
        
        // Count how many sequential parent components are non-dirs;
        // zero indicates all ancestors are already directories (the
        // direct parent of the file-to-be already exists)
        let nonDirs = [];
        while (true) {
          
          let ancestorCmps = cmps.slice(0, -1 - nonDirs.length);
          let ancestorFp = fns.makeFp(ancestorCmps, { rcmps: [] }).key;
          
          let type = await fs.getType(ancestorFp);
          if (type !== 'dir') nonDirs.push(type);
          else                break;
          
        }
        
        // Note that `nonDirs` will have collected types in order from
        // deepest parent until root, whereas here we want to iterate
        // from shallower (closer-to-root) values - hence `reverse`
        for (let [ ind, type ] of nonDirs.reverse().entries()) {
          
          let ancestorCmps = cmps.slice(0, -nonDirs.length + ind);
          let ancestorFp = fns.makeFp(ancestorCmps, { rcmps: [] }).key;
          
          if (type === null) {
            
            await fs.mkdir(ancestorFp);
            
          } else if (type === 'file') {
            
            await fs.swapFileToDir(ancestorFp, {
              tmpName: ancestorFp + '~' + (Number.MAX_SAFE_INTEGER * Math.random()).encodeStr(),
              fileCmp: '~'
            });
              
          } else {
            
            throw Error(`Didn't expect type: "${type}"`).mod({ fp: ancestorFp });
            
          }
          
        }
        
        if (d !== null) await fs.writeFile(fp, d); // Now this shouldn't be able to fail! (TODO: What about filename-too-large errors, etc??)
        
      } else if (type === 'file') {
        
        if (d !== null) await fs.writeFile(fp, d); // Should never fail!
        
      } else if (type === 'dir') {
        
        // The intended target is already a directory - we can allow
        // values to seemingly be written to directories by creating a
        // "default value file" (which we name "~"), and writing to
        // that file instead. Trying to read a value from a directory
        // also results in reading from this same value! Note that we
        if (d !== null) await fs.writeFile(path.join(fp, '~'), d);
        
      }
      
    }),
    getValue: (cmps, opts={}) => fns.performInQueue('getValue', cmps, async fp => {
      
      let type = await fs.getType(fp);
      
      // If nothing's there return `null`
      if (type === null) return null;
      
      // If a file is there, read it
      else if (type === 'file') return await fs.readFile(fp, opts);
      
      // For directories, read their "default value file" (return `null`
      // if it doesn't exist)
      else if (type === 'dir') {
        
        let type = await fs.getType(path.join(fp, '~'));
        if (type === null) return null;
        if (type === 'file') return fs.readFile(path.join(fp, '~'), opts);
        if (type === 'dir') throw Error('Oh wow, this should really never happen').mod({ fp });
        
      }
      
    }),
    
    // Handle relations between parent and child nodes
    addChild: (cmps, opts={}) => fns.performInQueue('addChild', cmps, async (fp, cmps) => {
      
      // TODO: Fails if parent of `fp` is non-directory
      
      if (cmps.slice(-1)[0] === '~') throw Error(`Illegal dir name: "${fp}"`);
      
      let type = await fs.getType(fp);
      
      if (type === null) return fs.mkdir(fp, opts);
      else if (type === 'dir') return;
      else if (type === 'file') return fs.swapFileToDir(fp, {
        ...opts,
        tmpName: fp + '~' + (Number.MAX_SAFE_INTEGER * Math.random()).encodeStr(),
        fileCmp: '~'
      });
      
    }),
    getChildNames: (cmps, opts={}) => fns.performInQueue('getChildNames', cmps, async fp => {
      
      let type = await fs.getType(fp);
      
      if (type === null) return [];
      else if (type === 'dir') return fs.readdir(fp, opts).then(cfps => cfps.filter(v => v !== '~'));
      else if (type === 'file') return [];
      
    }),
    
    rem: (cmps, { recursive=true, maxRetries=0, retryDelay=50, ...opts }={}) => {
      return fns.performInQueue({ op: 'rem', st: 1 }, cmps, fp => {
        return fs.rm(fp, { recursive, maxRetries, retryDelay, ...opts })
          .fail(err => {
            if (err.code === 'ENOENT') return; // Nonexistent is exactly what we want!
            err.propagate();
          })
      });
    },
    
    getReadStream: (cmps, opts={}) => {
      
      let streamPrm = Promise.later();
      
      fns.performInQueue('getReadStream', cmps, async fp => {
        
        let stream = fs.createReadStream(fp, opts);
        streamPrm.resolve(stream);
        streamPrm.reject = null;
        
        await Promise((rsv, rjc) => {
          
          stream.on('close', rsv);
          stream.on('error', err => {
            
            // Ignore ENOENT; simply stream back no data!
            if (err.code === 'ENOENT') return rsv();
            
            // Other errors propagate
            rjc(err);
            
          });
          
        });
        
      })
        .fail(err => streamPrm.reject ? streamPrm.reject(err) : err.propagate());
      
      return streamPrm;
      
    },
    getWriteStream: (cmps, o={}, opts={ flags: 'a', ...o }) => {
      
      let streamPrm = Promise.later();
      
      (async () => {
        
        // TODO: Ideally there should be a transaction around this!!
        // Using `fns.atomically` has some really scary event-loop
        // consequences that I'm not ready to look into now...
        await fns.setValue(cmps, null); // Using `null` simply ensures the par dir exists but doesn't touch the file itself
        await fns.performInQueue('getWriteStream', cmps, async (fp, cmps) => {
          
          let stream = fs.createWriteStream(fp, opts);
          
          await Promise((g, b) => { stream.on('ready', g); stream.on('error', b); });
          
          streamPrm.resolve(stream);
          streamPrm.reject = null;
          
          await Promise((g, b) => { stream.on('close', g); stream.on('error', b); });
          
          // TODO: Something really scary was happening here...
          // let timeout = null;
          // let prm = Promise((g, b) => {
          //   
          //   stream.on('close', g);
          //   stream.on('error', b);
          //   
          //   // TODO: This is the weirdest nodejs behaviour I've ever
          //   // seen... if `g` isn't referenced by a Timeout the event
          //   // loop simply exits without any output. For some reason it
          //   // seems like node thinks `g` may eventually get called if
          //   // it's referenced by a Timeout Function, but not by a
          //   // stream event listener...
          //   let holdGGG = () => {
          //     timeout = setTimeout(() => holdGGG() && g(), 2 ** 31 - 1); // `2 ** 31 - 1` is the max-length timeout
          //     return false;
          //   };
          //   holdGGG();
          //   
          // });
          // prm.finally(() => clearTimeout(timeout));
          // 
          // return prm;
          
        });
        
      })()
        .fail(err => streamPrm.reject ? streamPrm.reject(err) : err.propagate());
      
      return streamPrm;
      
    },
    
    iterateChildren: (cmps, { bufferSize=150, ...opts }={}) => {
      
      let err = Error('');
      let iteratorPrm = Promise.later();
      
      fns.performInQueue('iterateChildren', cmps, async fp => {
        
        let dir = null;
        
        // `dir` should be the result of `fs.opendir`, or `null`
        try         { dir = await fs.opendir(fp, { bufferSize, ...opts }); }
        catch (err) { /* It's possible `err` is fatal; could store a reference to it and throw it as soon as the mock iterators below are run for the first time... */ }
        
        // Overall we're waiting for `dir` to be closed - either
        // because it was fully iterated, or because it was closed
        // manually
        await Promise((resolve, reject) => {
          
          let dirIterator = null;
          if (dir) {
            
            dirIterator ={
              
              async* [Symbol.asyncIterator]() {
                for await (let { name } of dir) if (name !== '~') yield name;
                resolve();
              },
              
              // Closing the "Dir" indicates "performInQueue" is complete
              async close() {
                
                // Try to close `dir`...
                try { await Promise(r => dir.close(r)); }
                
                // Tolerate "ERR_DIR_CLOSED" (already closed is good!)
                catch (ctxErr) {
                  if (ctxErr.code !== 'ERR_DIR_CLOSED') {
                    err.ctx({ ctxErr, message: `Failed to close directory ${fp} (${err.message})` });
                    reject(err);
                    throw err;
                  }
                }
                
                // Indicate resolution of "performInQueue"
                resolve();
                
              }
              
            };
            
          } else {
            
            // `fs.opendir` failed (directory doesn't exist); spoof an
            // empty dir (with a "close" method)
            dirIterator = {
              async* [Symbol.asyncIterator]() { resolve(); }, // Yield nothing + indicate performInQueue completion
              close: resolve                                  // Indicate performInQueue completion
            };
            
          }
          
          iteratorPrm.resolve(dirIterator);
          iteratorPrm.reject = null;
          
        })
          .fail(ctxErr => {
            
            let itErr = err.mod({ ctxErr, msg: `Failed to iterate ${fp}` });
            
            if (iteratorPrm.reject) iteratorPrm.reject(itErr);
            else                    itErr.propagate();
            
          });
        
      });
      
      return iteratorPrm;
      
    },
    
  };
  
};

module.exports = makeFns([]);

let doTesting = false;
//// doTesting = true;

doTesting && (async () => {
  
  console.log('\nSETUP -----------');
  
  let filesys = makeFns(path.resolve(__dirname, 'test'));
  
  try { await filesys.rem(''); } catch (err) {}
  await filesys.addChild('');
  
  if (1) { console.log('\n\nNULL CHILD NAMES -----------');
    
    let childNames = await filesys.getChildNames('nonexistent');
    if (childNames.length !== 0) throw Error('OW should have 0 child names');
    
  }
  
  if (1) { console.log('\n\nSIMPLE SUCCESS -----------');
    
    await filesys.addChild('existent');
    
    let read = await filesys.getChildNames('existent');
    if (!isForm(read, Array)) throw Error(`Expected Array`)
    if (read.length !== 0) throw Error(`Array should have no members`)
    
    await filesys.rem('existent');
    
  }
  
  if (1) { console.log('\n\nSET FILES BEFORE REM -----------');
    
    await filesys.addChild('dir0');
    
    await Promise.all([
      ...(5).toArr(n => filesys.setValue(`dir0/f${n}.txt`, `data${n}`)),
      filesys.rem('dir0')
    ]);
    
  }
  
  if (1) { console.log('\n\nREM BEFORE SET FILE -----------');
    
    await filesys.addChild('dir1');
    
    await Promise.all([
      filesys.rem('dir1'),
      ...(5).toArr(n => filesys.setValue(`dir1/f${n}.txt`, `data${n}`)
        .then(() => { throw Error('OW should have failed!'); })
        .fail(err => null))
    ]);
    
  }
  
  if (1) { console.log('\n\nSIMPLE ATOMIC -----------');
    
    await filesys.addChild('dir2');
    
    await Promise.all([
      
      filesys.atomically('dir2', async filesys => {
        
        await Promise.all([
          ...(5).toArr(n => filesys.setValue(`f${n}.txt`, `data${n}`))
        ]);
        
      }),
      filesys.rem('dir2')
      
    ]);
    
  }
  
  if (1) { console.log('\n\nDEF VALUE 1 -----------');
    
    await filesys.addChild('dir3');
    await filesys.setValue('dir3', 'hi im the value');
    
    {
      
      let cnames = await filesys.getChildNames('dir3');
      if (cnames.length !== 0) throw Error('Should have 0 children');
      
      let iterated = [];
      let it = await filesys.iterateChildren('dir3');
      try     { for await (let childName of it) iterated.push(childName); }
      finally { it.close(); }
      
      if (iterated.length !== 0) throw Error('Should have iterated 0 children');
      
      let val = await filesys.getValue('dir3', { encoding: 'utf8' });
      if (val !== 'hi im the value') throw Error('Incorrect value');
      
    }
    
    await Promise.all((4).toArr(n => filesys.addChild(`dir3/child${n}`)));
    
    {
      
      let cnames = await filesys.getChildNames('dir3');
      if (cnames.length !== 4) throw Error('Should have 4 children');
      for (let v of 4) if (!cnames.has(`child${v}`)) throw Error(`Missing child "child${v}"`);
      
      let iterated = [];
      let it = await filesys.iterateChildren('dir3');
      try     { for await (let childName of it) iterated.push(childName); }
      finally { it.close(); }
      
      if (iterated.length !== 4) throw Error('Should have iterated 4 children');
      for (let v of 4) if (!iterated.has(`child${v}`)) throw Error(`Missing iterator child "child${v}"`);
      
      let val = await filesys.getValue('dir3', { encoding: 'utf8' });
      if (val !== 'hi im the value') throw Error('Incorrect value');
      
    }
    
  }
  
  console.log('COMPLETED!!');
  process.exit(0);
  
})()
  .fail(err => {
    
    console.log('\n\nFATAL', { err, ctx: err.ctxErr });
    process.exit(0);
    
  });
