'use strict';

// SUB-TXN ROOT NODE CREATION
// For sub-txns, the root node of the sub-txn *must be created by the parent txn*. When the sub-txn
// needs to use its root node, it isn't able to "somehow retroactively ask its par to create its
// root node" in the case that the node doesn't already exist. This probably means that when a txn
// ends, we should try to clean any empty nodes  leading up to its root. The big downside is that
// when a process ends unexpectedly, a trail of empty directories may have already been created

// [X] Efficient readdir streaming - by breaking up long directories into ordered sub-directories
//     of fixed sizes?
//     NOT IMPLEMENTING THIS - instead, pass directory-size overhead to the consumer; it'll be the
//     consumer's burden to break things into smaller directories! Perhaps BankKeep can handle this
//     overhead automatically (otherwise it would store all Recs in the same dir!!)
// 
// [X] Paradigm for "native" and "strong" naming (names provided are legal filesystem handles, vs
//     names may consist of a wider charset, and will be uniquely transformed to legal handles)
//     IMPLEMENTED - "strong" naming allows for any ascii character (except using \u0000 in the Cmp
//     prefix)
// 
// [ ] Encryption-at-rest (careful with volatility blobs!)
// 
// [ ] IPC streaming; single Filesys process is responsible for a directory tree
// 
// [ ] Volatility safety - write tx ops to blob before performing ops then delete blob
// 
// [ ] Max file handle tracking/prevention
// 
// [ ] Operation history??? (Probably not needed????)

// "fp" - "file pointer"; String used for OS-level file resolution
// "fd" - "file dive"; sanitized Array of Strings representing file traversal
// "fk" - "file keep"; object-oriented (exposed) means of accessing filesystem
// "ft" - "file type"; either `'node'`, `'leaf'`, or `null`

require('../../room/setup/clearing/clearing.js');

let nodejs = require('./nodejs.js');
let FsKeep = require('./FsKeep.js');
let sys = require('./system.js');

let fsCodes = codes => err => {
  
  if (!codes.has(err.code)) throw err;
  let r = codes[err.code];
  return hasForm(r, Function) ? r(err) : r;
  
};

let FsTxn = form({ name: 'FsTxn', has: { Endable }, props: (forms, Form) => ({
  
  // OPS
  // Note the "x" prefix implies unlocked, unverified operations
  // Note these "x" ops take FsKeeps, and resolve them to Fps using `fk.fp`
  
  $fsRetry: { recursive: false, maxRetries: 8, retryDelay: 75 }, // Up to 600ms total
  $lock: (type, fk) => ({ type, fk, prm: Promise.later() }), 
  
  $xSafeStat: async fk => {
    
    // Note that on windows, `fs.stat` tends to only fail on missing entities with "ENOENT". On
    // posix trying to `fs.stat` anything nested under a file fails with "ENOTDIR" instead! So
    // both error codes basically indicate "entity non-existence".
    
    return nodejs.fs.stat(fk.fp).catch(fsCodes({ ENOENT: null, ENOTDIR: null }));
    
  },
  $xGetType: async (fk, stat=null) => {
    
    if (!stat) stat = await Form.xSafeStat(fk);
    
    if (stat === null)      return null;
    if (stat.isFile())      return 'leaf';
    if (stat.isDirectory()) return 'node';
    
    // TODO: This case should probably be considered `null`? And make sure to exclude any non-file,
    // non-directory children when listing and iterating children??
    throw Error('Api: unexpected filesystem entity').mod({ stat });
    
  },
  $xSwapLeafToNode: async (fk, { tmpCmp=`~${(Number.int32 * Math.random()).encodeStr(String.base32, 7)}` }={}) => {
    
    // We want a dir to replace an existing file (without reads on
    // that previously existing file to fail) - so we replace the
    // file with a directory containing a "default value file"
    
    // Basically we know that `fp` is a leaf, and we want it to become
    // a node, with `fp.kid([ '~' ])` holding the value previously at `fp`
    
    let fp = fk.fp;                    // Path to original file
    let tmpFp = fk.sib(tmpCmp).fp;     // Path to temporary file (sibling of original file)
    let valFp = fk.path.join(fp, '~'); // Path to final file
    
    await nodejs.fs.rename(fp, tmpFp);    // Move file out of the way
    await nodejs.fs.mkdir(fp);            // Set directory where file used to be
    await nodejs.fs.rename(tmpFp, valFp); // Set original file as "default value file"
    
  },
  $xEnsureLineage: async (lineage /* Array<{ fk: FsKeep, prm?: PromiseLater }> */) => {
    
    // Checks for (and if needed creates) a node at every item in `lineage`; we assume `lineage`
    // represents a valid ancestor chain! Note that all items in `lineage` will be ensured.
    
    // Probably a good optimization: if the final item of `lineage` already exists, we're done!
    
    if (isForm(lineage, Generator)) lineage = [ ...lineage ];
    
    if (!lineage.length) return 'zero-length lineage';
    
    // We can skip this entire process if the deepest item is already a node - this check should
    // effectively short-circuit in many cases!
    if ('node' === await Form.xGetType(lineage.at(-1).fk)) { lineage.each(ln => ln.prm?.resolve()); return lineage.map(ln => ln.fk.fp).toObj(fp => [ fp, 'already exists' ]); }
    
    let result = {};
    for (let { fk, prm } of lineage) {
      
      let type = await Form.xGetType(fk);
      
      // If nothing exists create dir; if file exists swap it to dir
      if      (type === null)   { await nodejs.fs.mkdir(fk.fp); result[fk.fp] = 'mkdir'; }
      else if (type === 'leaf') { await Form.xSwapLeafToNode(fk); result[fk.fp] = 'swapped'; result[fk.kid([ '~' ]).fp] = 'created'; }
      else                      { result[fk.fp] = 'already exists'; }
      
      prm?.resolve();
      
    }
    
    return result;
    
  },
  $xRemEmptyNodes: async (fk, until=fk.par(Infinity)) => {
    
    // Provide a node; will remove that node if the node has no children, and repeat this process
    // for each ancestor; if `until` is provided, it represents the first ancestor for which there
    // will be no removal attempt
    
    if (!until.is(fk).par) throw Error('Api: until is not parent of fk').mod({ fk, until });
    
    let cmpsToPreserve = until.fd.length;
    
    while (fk.fd.length > cmpsToPreserve) {
      
      let continueRemoving = await nodejs.fs.rmdir(fk.fp, Form.fsRetry).then(
        
        // On success, we should try to remove the next ancestor
        () => true,
        
        // On failure...
        fsCodes({
          
          // If removal failed due to non-emptiness, stop removing ancestors
          ENOTEMPTY: false,
          
          // If removal failed due to no ancestor existing, keep trying to remove ancestors
          ENOENT: true
          
          // (Any other errors are considered unexpected)
          
        })
        
      );
      
      if (!continueRemoving) break;
      
      fk = fk.par();
      
    }
    
  },
  $locksCollide: (lock0, lock1) => {
    
    // Locks: 
    // { type: 'nodeRead' | 'nodeWrite' | 'subtreeRead' | 'subtreeWrite', fk: FsKeep }
    
    // Order `lock0` and `lock1` by their "type" properties
    if (lock0.type.localeCompare(lock1.type) > 0) [ lock0, lock1 ] = [ lock1, lock0 ];
    
    let collTypeKey = `${lock0.type}/${lock1.type}`;
    
    // OS filesystem reads can safely race!
    if (collTypeKey === 'nodeRead/nodeRead') return false;
    
    // Reads and writes conflict if they occur on the exact same node
    if (collTypeKey === 'nodeRead/nodeWrite') return lock0.fk.is(lock1.fk).eql;
    
    // OS filesystem reads can safely race!
    if (collTypeKey === 'nodeRead/subtreeRead') return false;
    
    if (collTypeKey === 'nodeRead/subtreeWrite') return lock0.fk.is(lock1.fk).kid;
    // Node reads conflict with subtree writes if they're anywhere within the subtree
    
    // OS filesystem has unexpected results for racing writes
    if (collTypeKey === 'nodeWrite/nodeWrite') return lock0.fk.is(lock1.fk).eql;
    
    // Prevent write from occurring in the subtree locked for reading
    if (collTypeKey === 'nodeWrite/subtreeRead') return lock0.fk.is(lock1.fk).kid;
    
    // Node writes conflict with subtree writes if they're anywhere within the subtree
    if (collTypeKey === 'nodeWrite/subtreeWrite') return lock0.fk.is(lock1.fk).kid;
    
    // OS filesystem reads can safely race!
    if (collTypeKey === 'subtreeRead/subtreeRead') return false;
    
    // Don't write to locked subtree being read; don't read from locked subtree being written!
    if (collTypeKey === 'subtreeRead/subtreeWrite') { let is = lock0.fk.is(lock1.fk); return is.kid || is.par; }
    
    // Subtree writes may not contain each other - note that it's perfectly possible that, given
    // subtrees X and Y, knowing X is a non-Par of Y tells us nothing of whether Y is X's Par!
    if (collTypeKey === 'subtreeWrite/subtreeWrite') { let is = lock0.fk.is(lock1.fk); return is.kid || is.par; }
    
    throw Error(`Api: collision type "${collTypeKey}" not implemented`);
    
  },
  
  $fkToIvCache: Map(/* fk.fp -> iv */),
  $fkToIv: fk => {
    
    let str = fk.fp;
    if (!Form.fkToIvCache.has(str)) {
      
      let num = 5n;
      for (let i of str.length) {
        let c = str.code(i);
        num = ((num * (5n + BigInt(c))) ^ ((num * 7n) + BigInt(i))) % BigInt(36 ** 16);
      }
      
      Form.fkToIvCache.set(str, {
        // TODO: Right now this uses a 16-char string, where each char has 36 possible vals;
        // consider using a 16-byte buffer, where each byte has 256 possible vals??
        iv: num.toString(36).padHead(16, '0').slice(0, 16),
        timeout: null
      });
      
    }
    
    // Reset cache timeout; return cached value
    let cached = Form.fkToIvCache.get(str);
    clearTimeout(cached.timeout);
    cached.timeout = setTimeout(() => Form.fkToIvCache.rem(str), 5 * 1000);
    return cached.iv;
    
  },
  $encrypt: ({ data, key, fk }) => {
    
    let { crypto } = nodejs;
    if (isForm(data, String)) data = Buffer.from(data);
    
    let err = Error('');
    let iv = Form.fkToIv(fk);
    return crypto.subtle.encrypt({ name: 'AES-CBC', iv }, key, data)
      .catch(cause => err.propagate({ msg: `Failed to encrypt: ${cause.message}`, cause, fk, iv }))
      .then(arrBuff => Buffer.from(arrBuff));
    
  },
  $decrypt: ({ data, key, fk }) => {
    
    let { crypto } = nodejs;
    if (isForm(data, String)) data = Buffer.from(data);
    
    // TODO: HEEERE `cause.message` is "error:1C80006B:Provider routines::wrong final block length"
    let err = Error('');
    return crypto.subtle.decrypt({ name: 'AES-CBC', iv: Form.fkToIv(fk) }, key, data)
      .catch(cause => err.propagate({ msg: `Failed to decrypt: ${cause.message}`, cause }))
      .then(arrBuff => Buffer.from(arrBuff));
    
  },
  
  init({ cfg, fk }={ cfg: { /* ownershipTimeoutMs: 2000, throttler: fn => fn() */ } }) {
    
    if (!isForm(fk, FsKeep)) throw Error('Api: must provide fk');
    
    cfg = {
      active: true,
      ownershipTimeoutMs: 2000,
      rootFk: fk,
      throttler: fn => fn(),
      key: null
    }.merge(cfg ?? {});
    
    // Do any necessary initial `cfg` setup
    if (!cfg.initPrm) {
      
      let ownerId = Math.random().toString(36).slice(2).padHead('0', 11);
      
      let hutFsNode = cfg.rootFk.kid([ '.hutfs' ]);
      let ownershipFk = hutFsNode.kid([ 'owner' ]);
      
      // We are the root item
      cfg.initPrm = (async () => {
        
        // Create a crypto key if `cfg.key` was supplied
        if (cfg.key) {
          
          let rawBuff = Buffer.from(cfg.key, 'utf8');
          if (!rawBuff.length) throw Error('Api: empty encryption key');
          
          let buff = Buffer.alloc(0);
          while (buff.length < 32) buff = Buffer.concat([ buff, rawBuff ]);
          buff = buff.subarray(0, 32);
          
          let opts = {
            type: 'raw',
            buff,
            encryptionMode: { name: 'AES-CBC' },
            extractable: false,
            uses: [ 'encrypt', 'decrypt' ]
          };
          cfg.cryptoKey = await nodejs.crypto.subtle.importKey(opts.type, opts.buff, opts.encryptionMode, opts.extractable, opts.uses);
          
        }
        
        let { ownershipTimeoutMs } = cfg;
        let canOwn = async () => {
          
          let ms = getMs();
          
          let type = await Form.xGetType(ownershipFk);
          
          if (type === null) return true;
          if (type === 'node') throw Error('Api: unable to take ownership; fk type is "node"').mod({ ownershipFk, type });
          
          let content = jsonToVal(await nodejs.fs.readFile(ownershipFk.fp));
          let ownedBySomeoneElse = true
            && content.ownerId !== ownerId             // Our id must be the owner
            && (ms - content.ms) < ownershipTimeoutMs; // Heartbeat has been seen too recently
          if (ownedBySomeoneElse) return false;
          
          return true;
          
        };
        
        // TODO: If there's another owner use ipc or http/ws to access the owning instance
        let availableAfterReattempts = await (async () => {
          
          let startTakeOwnershipMs = getMs();
          let giveUpMs = startTakeOwnershipMs + Math.min(ownershipTimeoutMs * 1.2, ownershipTimeoutMs + 2000);
          while (getMs() < giveUpMs) { // Spend some time waiting for previous ownership to elapse
            if (await canOwn()) return true;
            await Promise(r => setTimeout(r, 30 + Math.random() * ownershipTimeoutMs * 0.2));
          }
          return false;
          
        })();
        
        if (!availableAfterReattempts) throw Error('Api: unable to take ownership after multiple attempts').mod({ ownerFk: ownershipFk });
        
        // Now acquire and maintain ownership so long as we live
        await Form.xEnsureLineage([ ...ownershipFk.par().lineage() ]);
        await nodejs.fs.atomicWrite(ownershipFk.fp, valToJson({ ownerId, ms: getMs() }));
        cfg.ownershipLifecyclePrm = (async () => {
          
          while (cfg.active) {
            await Promise(r => setTimeout(r, ownershipTimeoutMs * 0.9));
            if (!cfg.active) break;
            await nodejs.fs.atomicWrite(ownershipFk.fp, valToJson({ ownerId, ms: getMs() }));
          }
          
        })().catch(err => {
          
          gsc('Api: error maintaining ownership file (this is bad!)');
          throw err;
          
        });
        
        // Ensure that a volatility memo dir exists
        let memoFk = hutFsNode.kid([ 'memo' ]);
        await nodejs.fs.mkdir(memoFk.fp).catch(fsCodes({ EEXIST: null }));
        
        // Ownership is now being maintained; check for previous volatility abort
        await (async () => {
          
          let memoFt = await Form.xGetType(memoFk);
          if (memoFt !== 'node') return;
          
          let memoFds = await nodejs.fs.readdir(memoFk.fp).then(dir => dir.sort());
          for (let memoFd of memoFds) {
            
            let blob = await nodejs.fs.readFile(memoFk.kid([ memoFd ]).fp);
            let newlineInd = 0;
            while (blob[newlineInd] !== 0x0a && newlineInd < blob.length) newlineInd++;
            
            // Note that `Buffer(...).slice(...)` creates a view, not a copy!
            let json = jsonToVal(blob.slice(0, newlineInd));
            let inline = blob.slice(newlineInd + 1);
            
            // TODO: Run ops from `json` and `inline`
            
            // TODO: Delete this specific "pending" item; no need to re-process it should another
            // volatility abort occur before all pending items have been processed!
            
          }
          
          // Note: do *not* remove the "memo" dir - only the specific memos which were successfully
          // processed!
          
        })();
        
        cfg.volatilityCnt = 0;
        
      })();
      
    }
    
    Object.assign(this, {
      fk: fk.kid([]),
      cfg,
      throttler: cfg.throttler,
      locks: Set(),
      initPrm: cfg.initPrm.then(() => this)
    });
    denumerate(this, 'locks');
    
    // Assign `this` as the FsTxn of our FsKeep!
    this.fk.txn = this;
    
    // We have some ReadinessRequired methods; these are methods which can't be called until
    // `cfg.initPrm` has resolved. But we don't want to hassle the consumer with needing to await
    // `cfg.initPrm`, so we mask all our methods with versions which only run the original method
    // after `cfg.initPrm` has resolved, and when `cfg.initPrm` resolves we can unmask all methods.
    // Note we don't want to introduce stability issues between calls using masked and unmasked
    // methods (if we're not careful, there could be a brief window immediately after `cfg.initPrm`
    // resolves where both kinds of methods may be in-flight). So we track a Promise which only
    // resolves when `cfg.initPrm` has resolved, *and* all calls to masked methods have resolved;
    // finally we only unmask after this "all masked methods resolved" Promise resolves. Note that
    // there could be rare conditions where continuous, rapid-fire and overlapping calls prevent
    // there from ever being a moment for unmasking to occur; the implementation should be aware of
    // the potential for memory-leaks, i.e., don't keep track of *all* masked method calls (discard
    // ones which have already expired).
    let requireInitMethods = 'processOp,processOps,getType,getMeta,setData,getData,getSubtree'.split(',');
    let maskedCallsPrm = this.initPrm.catch(() => { /* Ignore errors */ });
    for (let m of requireInitMethods) {
      
      let orig = this[m];
      C.def(this, m, (...args) => {
        let prm = this.initPrm.then(() => orig.call(this, ...args));
        maskedCallsPrm = maskedCallsPrm.then(() => prm, () => { /* Ignore errors */});
        return prm;
      });
      
    }
    
    maskedCallsPrm.then(() => requireInitMethods.each(m => delete this[m]));
    
  },
  desc() { return `${getFormName(this)} (${this.fk.desc()})`; },
  
  async volatilityMemo(ops) {
    
    let { path } = this.fk;
    
    let memoId = (this.cfg.volatilityCnt++).toString(36).padHead(10, '0');
    let memoFk = this.cfg.rootFk.kid([ '.hutfs', 'memo' ]);
    
    await nodejs.fs.atomicWrite(memoFk.kid([ memoId ]).fp, '<volatility memo>'); // TODO!!! Compose memo!!!
    
    return async () => {
      
      // TODO: Does this need to be awaited?? It should probably be fire-and-forget...
      
      // Call this after the memo is no longer needed
      await nodejs.fs.unlink(memoFk.kid([ memoId ]).fp);
      
      // Note: do *not* do `xRemEmptyNodes`; we don't want to remove the memo dir!
      
    };
    
  },
  
  checkFp(fk) {
    if (!isForm(fk, FsKeep)) throw Error(`Api: fp must be FsKeep; got ${getFormName(fk)})`).mod({ fk });
    if (!this.fk.is(fk).par) throw Error('Api: fk is not contained within the transaction').mod({ fk, trn: this });
  },
  async processOp({ name, locks: incomingLocks, fn }={}) {
    
    // TODO: I think `this.volatilityMemo` needs to occur in the locked context??
    //let cleanup = handleVolatility ? await this.volatilityMemo([ { name } ]) : () => {};
    let cleanup = () => {};
    
    if (!incomingLocks.length) throw Error('Api: provide at least one lock');
    
    // Collect all pre-existing locks that collide with any of the locks provided for this
    // operation - once all blocking locks resolve we're guaranteed our context is locked!
    let blockingLocks = [];
    for (let existingLock of this.locks)
      if (incomingLocks.some(incomingLock => Form.locksCollide(existingLock, incomingLock)))
        blockingLocks.push(existingLock);
    
    // Add new Locks so any new colliding ops are blocked until `fn` completes; note the Locks are
    // still added even if `op` is currently blocked (if `blockingLocks.length > 0`)
    for (let lock of incomingLocks) {
      this.locks.add(lock);
      lock.prm.then(() => this.locks.rem(lock));
    }
    
    // Initialize the stack Error before any `await` gets called
    let err = Error('');
    
    // Wait for all collisions to resolve...
    await Promise.all(blockingLocks.map(lock => lock.prm)); // Note that `lock.prm` never rejects
    
    // We now own `locks`, and any colliding ops will be delayed until ours is finished!
    try           { return await fn(); }
    catch (cause) { err.propagate({ cause, msg: `Failed locked op: "${name}"` }); }
    finally       { for (let lock of incomingLocks) lock.prm.resolve(); /* Release locks */ await cleanup(); }
    
  },
  async processOps(ops) {
    
    // for (let { name, locks, fn } of ops) { '...'; }
    
    // Before running `ops`, write the full plan to a single blob under `this.cfg.rootFk`
    
    // Run all `ops` in parallel; collision locking will serialize as required!
    await Promise.all(ops.map(op => this.processOp(op)));
    
  },
  
  getType(fk) /* Promise<null | 'leaf' | 'node'> */ {
    
    this.checkFp(fk);
    
    let locks = [ Form.lock('nodeRead', fk) ];
    return this.processOp({
      name: 'getType',
      locks,
      fn: () => Form.xGetType(fk),
      volatilityMemo: null // Could have been `{ op: 'getType', fd: fk.fd }`, but note that read operations shouldn't require volatility memos!
    });
    
  },
  getMeta(fk) /* Promise<{ type: null | 'leaf' | 'node', size: number }> */ {
    
    this.checkFp(fk);
    
    let locks = [ Form.lock('nodeRead', fk) ];
    return this.processOp({
      name: 'getMeta',
      locks,
      fn: async () => {
        
        let stat = await Form.xSafeStat(fk);
        let type = await Form.xGetType(fk, stat);
        
        if (type === 'leaf') return { type, size: stat.size };
        
        // Try to interpret the node as its "~" leaf value
        stat = await Form.xSafeStat(fk.kid([ '~' ]));
        type = await Form.xGetType(fk, stat);
        return { type, size: type === 'leaf' ? stat.size : 0 };
        
      },
      volatilityMemo: null
    });
    
  },
  setData(fk, data) /* Promise<void> */ {
    
    this.checkFp(fk);
    
    if (data === null || data.length === 0) {
      
      // Instead of writing a Buffer of 0 length we remove the leaf entirely (and we consider
      // non-existent leafs to have the value `null` or `Buffer.alloc(0)`)
      
      return this.processOp({
        name: 'setDataEmpty',
        locks: [ Form.lock('nodeWrite', fk) ],
        fn: async () => {
          
          let type = await Form.xGetType(fk);
          if (type === null) return;
          
          // For leafs simply unlink the leaf
          if (type === 'leaf') {
            await nodejs.fs.unlink(fk.fp).catch(fsCodes({ ENOENT: null }));
            await Form.xRemEmptyNodes(fk.par(), this.fk);
          }
          
          // For nodes try to unlink the "~" child
          if (type === 'node') {
            await nodejs.fs.unlink(fk.kid([ '~' ]).fp).catch(fsCodes({ ENOENT: null }));
            await Form.xRemEmptyNodes(fk, this.fk);
          }
          
        },
        volatilityMemo: { op: 'setData', fd: fk.fd, data: null }
      });
      
    } else {
      
      // Setting a non-zero amount of data requires ensuring that all
      // ancestor nodes exist and finally writing the data
      
      // The lineage must have nodes ensured (with leaves potentially swapped to nodes)
      // TODO: Watch out for FsTxns writing a leaf to their root directory - it should always be
      // put in a "~" child!!
      
      let lineageLocks = fk.par().lineage(this.fk).toArr(ln => Form.lock('nodeWrite', ln.fk));
      
      if (this.cfg.cryptoKey) data = Form.encrypt({ data, key: this.cfg.cryptoKey, fk })
      
      return this.processOp({
        name: 'setData',
        // Overall, we have a series of lineage locks and a single leaf lock
        locks: [ ...lineageLocks, Form.lock('nodeWrite', fk) ],
        fn: async () => {
          
          let type = await Form.xGetType(fk);
          if ([ 'leaf', 'node' ].has(type)) {
            
            // Leafs and nodes are handled nearly the same: if leaf, it's the pre-existing value and
            // we simply overwrite it. If it's the node, we simply write to the "~" child, which will
            // either be an overwrite or a new value.
            
            // Free up lineage locks immediately
            for (let { prm } of lineageLocks) prm.resolve();
            
            let writeFk = (type === 'node') ? fk.kid('~') : fk;
            await nodejs.fs.atomicWrite(writeFk.fp, await data);
            
          } else /* if (type ===  null) */ {
            
            // Simply ensure the node exists and write the (new) leaf
            await Form.xEnsureLineage(lineageLocks);
            await nodejs.fs.atomicWrite(fk.fp, await data);
            
          }
          
        },
        volatilityMemo: { op: 'setData', fd: fk.fd, data: null }
      });
      
    }
    
  },
  getData(fk, opts={}) /* Promise<string | Buffer> */ {
    
    if (!isForm(opts, Object)) opts = { encoding: opts };
    let { encoding: enc=null } = opts;
    
    this.checkFp(fk);
    
    return this.processOp({
      
      name: 'getData',
      locks: [ Form.lock('nodeRead', fk) ],
      fn: async () => {
        
        let result = await nodejs.fs.readFile(fk.fp).catch(fsCodes({
          
          // Reading a nonexistent entity resolves to 0-length data
          ENOENT: Buffer.alloc(0),
          
          // Use this opportunity to detect if it's a node
          EISDIR: null
          
        }));
        
        if (result !== null) return result;
        
        // If `result` was `null` then `fk` indicates a node; try to read the "~" kid...
        return nodejs.fs.readFile(fk.kid([ '~' ]).fp).catch(fsCodes({ ENOENT: Buffer.alloc(0) }));
        
      },
      volatilityMemo: null
      
    }).then(async buff => {
      
      if (this.cfg.cryptoKey) buff = await Form.decrypt({ data: buff, key: this.cfg.cryptoKey, fk });
      
      // Apply encoding
      return (enc === null) ? buff : buff.toString(enc);
      
    });
    
  },
  
  getSubtree(fk) {
    
    this.checkFp(fk);
    
    let locks = [ Form.lock('subtreeRead', fk) ];
    return this.processOp({
      name: 'getKids',
      locks,
      fn: async () => {
        
        let type = await Form.xGetType(fk);
        
        if (type === null) return [];
        if (type === 'leaf') return nodejs.fs.readFile(fk.fp, 'utf8');
        
        let fds = await nodejs.fs.readdir(fk.fp);
        return Promise.all(fds.toObj(fd => [ fd, this.getSubtree(fk.kid([ fd ])) ]));
        
      },
      volatilityMemo: null
    });
    
  },
  
  cleanup() {
    
    let { fk, cfg } = this;
    
    // Ending the root FsTxn sets `cfg.active` to false
    if (fk.is(cfg.rootFk).eql) cfg.active = false;
    
  }
  
})});
let HereFsTxn = form({ name: 'HereFsTxn', has: { FsTxn }, props: (forms, Form) => ({
  
  // Directly interacts with OS filesystem and returns results
  
})});
let AfarFsTxn = form({ name: 'AfarFsTxn', has: { FsTxn },props: (forms, Form) => ({
  
  // Accesses FsTxn(...) running in a separate process
  
})});
let LocalIpcFsTxn = form({ name: 'LocalIpcFsTxn', has: { AfarFsTxn }, props: (forms, Form) => ({
  
  // Interacts with FsTxn(...) in another local process via ipc
  
})});
let RemoteFsTxn = form({ name: 'RemoteFsTxn', has: { AfarFsTxn }, props: (forms, Form) => ({
  
  // Interacts with FsTxn(...) in a remote process via a protocol like http or ws
  
})});

module.exports = FsTxn;