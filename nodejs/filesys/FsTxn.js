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
  $lock: (type, fk) => {
    if (!isForm(type, String)) throw Error('Api: invalid type').mod({ type });
    if (!Form.lockCollisionResolvers.has(`${type}/${type}`)) throw Error('Api: invalid lock type').mod({ fk, type });
    return { type, fk, prm: Promise.later() };
  }, 
  
  $xSafeStat: async fk => {
    
    // Note that on windows, `fs.stat` tends to only fail on missing entities with "ENOENT". On
    // posix trying to `fs.stat` anything nested under a file fails with "ENOTDIR" instead! So
    // both error codes basically indicate "entity non-existence".
    
    return nodejs.fs.stat(fk.fp).catch(fsCodes({ ENOENT: null, ENOTDIR: null }));
    
  },
  $xGetType: async (fk, stat=null) /* Promise<null | 'leaf' | 'node'> */ => {
    
    if (!stat) stat = await Form.xSafeStat(fk);
    
    if (stat === null)      return null;
    if (stat.isFile())      return 'leaf';
    if (stat.isDirectory()) return 'node';
    
    // TODO: This case should probably be considered `null`? And make sure to exclude any non-file,
    // non-directory children when listing and iterating children??
    throw Error('Api: unexpected filesystem entity').mod({ stat });
    
  },
  $xSwapLeafToNode: async (fk, { tmpCmp=`~${String.id()}` }={}) => {
    
    // We want a dir to replace an existing file (without reads on that previously existing file to
    // fail) - so we replace the file with a directory containing a "default value file"
    
    // Basically we know that `fp` is a leaf, and we want it to become a node, with
    // `fp.kid([ '~' ])` holding the value previously at `fp`
    
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
    
    // Probably a good optimization; unwind the whole generator to allow us to check the final fk;
    // if it already exists we can immediately short-circuit!
    if (isForm(lineage, Generator)) lineage = [ ...lineage ];
    
    if (!lineage.length) return;
    
    // We can skip this entire process if the deepest item is already a node - this check should
    // effectively short-circuit in many cases!
    if ('node' === await Form.xGetType(lineage.at(-1).fk)) {
      for (let ln of lineage) ln.prm?.resolve();
      return;
    }
    
    for (let { fk, prm } of lineage) {
      
      let type = await Form.xGetType(fk);
      
      // If nothing exists create dir; if file exists swap it to dir
      if      (type === null)   await nodejs.fs.mkdir(fk.fp);
      else if (type === 'leaf') await Form.xSwapLeafToNode(fk);
      
      prm?.resolve();
      
    }
    
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
  $xGetKids: async fk => {
    
    // Returns an Object mapping the cmp name for every Kid directly under `fk` to the Fk
    // representing that Kid; also filters out any "hidden" cmps
    
    let fds = await nodejs.fs.readdir(fk.fp);
    return fds.toObj(fd => {
      if (fd === '~')      return skip;
      if (fd === '.hutfs') return skip;
      return [ fd, fk.kid([ fd ]) ];
    });
    
  },
  
  $lockCollisionResolvers: {
    
    // TODO: Implement these!!
    'family.get/family.get':  () => {},
    'family.get/family.set':  () => {},
    'family.get/node.get':    () => {},
    'family.get/node.set':    () => {},
    'family.get/subtree.get': () => {},
    'family.get/subtree.set': () => {},
    'family.set/family.get':  () => {},
    'family.set/family.set':  () => {},
    'family.set/node.get':    () => {},
    'family.set/node.set':    () => {},
    'family.set/subtree.get': () => {},
    'family.set/subtree.set': () => {},
    
    // OS filesystem reads can safely race!
    'node.get/node.get': () => false,
    
    // Reads and writes conflict if they occur on the exact same node
    'node.get/node.set': (fk1, fk2) => fk1.is(fk2).eql,
    
    // OS filesystem reads can safely race!
    'node.get/subtree.get': () => false,
    
    // Node reads conflict with subtree writes if they're anywhere within the subtree
    'node.get/subtree.set': (fk1, fk2) => fk1.is(fk2).kid,
    
    // OS filesystem has unexpected results for racing writes
    'node.set/node.set': (fk1, fk2) => fk1.is(fk2).eql,
    
    // Prevent write from occurring in the subtree locked for reading
    'node.set/subtree.get': (fk1, fk2) => fk1.is(fk2).kid,
    
    // Node writes conflict with subtree writes if they're anywhere within the subtree
    'node.set/subtree.set': (fk1, fk2) => fk1.is(fk2).kid,
    
    // OS filesystem reads can safely race!
    'subtree.get/subtree.get': () => false,
    
    // Don't write to locked subtree being read; don't read from locked subtree being written!
    'subtree.get/subtree.set': (fk1, fk2) => { let is = fk1.is(fk2); return is.kid || is.par; },
    
    // Subtree writes may not contain each other - note that it's perfectly possible that, given
    // subtrees X and Y, knowing X is a non-Par of Y tells us nothing of whether Y is X's Par!
    'subtree.set/subtree.set': (fk1, fk2) => { let is = fk1.is(fk2); return is.kid || is.par; }
    
  },
  $locksCollide: (lock1, lock2) => {
    
    // Locks: 
    // { type: 'node.get' | 'node.set' | 'subtree.get' | 'subtree.set', fk: FsKeep }
    
    // Order `lock0` and `lock1` by their "type" properties
    if (lock1.type.localeCompare(lock2.type) > 0) [ lock1, lock2 ] = [ lock2, lock1 ];
    
    let collTypeKey = `${lock1.type}/${lock2.type}`;
    
    let resolvers = Form.lockCollisionResolvers;
    if (!resolvers.has(collTypeKey)) throw Error(`Api: collision type "${collTypeKey}" not supported`);
    return resolvers[collTypeKey](lock1.fk, lock2.fk);
    
  },
  
  $fkToIvCacheMs: 5 * 10000,
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
    cached.timeout = setTimeout(() => Form.fkToIvCache.rem(str), Form.fkToIvCacheMs);
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
    
    let err = Error('');
    return crypto.subtle.decrypt({ name: 'AES-CBC', iv: Form.fkToIv(fk) }, key, data)
      .catch(cause => err.propagate({ msg: `Failed to decrypt: ${cause.message}`, cause }))
      .then(arrBuff => Buffer.from(arrBuff));
    
  },
  
  $initCfg: async cfg => {
    
    let ownerId = String.id();
    
    let hutFsNode = cfg.rootFk.kid([ '.hutfs' ]);
    let ownershipFk = hutFsNode.kid([ 'owner' ]);
    
    // Create a crypto key if `cfg.key` was supplied
    let getCryptoKey = async () => {
      
      if (!cfg.key) return null;
      
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
      return nodejs.crypto.subtle.importKey(opts.type, opts.buff, opts.encryptionMode, opts.extractable, opts.uses);
      
    };
    
    let acquireOwnership = async () => {
      
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
      
      let ownershipLifecyclePrm = (async () => {
        
        while (cfg.active) {
          await Promise(r => setTimeout(r, ownershipTimeoutMs * 0.9));
          if (!cfg.active) break;
          await nodejs.fs.atomicWrite(ownershipFk.fp, valToJson({ ownerId, ms: getMs() }));
        }
        
      })().catch(err => {
        
        gsc('Api: error maintaining ownership file (this is probably fatal!)');
        throw err;
        
      });
      
      return { ownershipLifecyclePrm, endOwnership: () => cfg.active = false };
      
    };
    
    let [ cryptoKey, ownershipLifecyclePrm ] = await Promise.all([ getCryptoKey(), acquireOwnership() ]);
    Object.assign(cfg, { cryptoKey, ownershipLifecyclePrm });
    
    // Ensure that a volatility memo dir exists
    let memoFk = hutFsNode.kid([ 'memo' ]);
    await nodejs.fs.mkdir(memoFk.fp).catch(fsCodes({ EEXIST: null }));
    
    // Ownership is now being maintained; check for previous volatility abort
    await (async () => {
      
      let memoFt = await Form.xGetType(memoFk);
      if (memoFt !== 'node') return;
      
      let memoFds = await nodejs.fs.readdir(memoFk.fp);
      for (let memoFd of memoFds.sort()) {
        
        // TODO: Process interrupted operations from last run!!
        
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
    
  },
  
  init({ cfg, fk=FsKeep([]) }={ cfg: { /* ownershipTimeoutMs: 2000, throttler: fn => fn() */ } }) {
    
    if (!isForm(fk, FsKeep)) throw Error('Api: must provide fk');
    
    // Note that even for the "holder" FsTxn (the one whose creation initiates ownership), there
    // may be a difference between:
    // - cfg.rootFk
    // - this.fk
    // Note that `this.fk` is the root filesys node controlled by the FsTxn, whereas `cfg.rootFk`
    // is simply the directory the ".hutfs" ownership file is written to! Note that the consumer
    // must be diligent to configure multiple competing FsTxns to use the same "rootFk" (otherwise
    // they may not detect that there are other FsTxns competing for the same ownership).
    
    cfg = {
      active: true,             // Is this FsTxn configured to be active? Calling the constructor implies "yes"
      held: false,              // Used to determine if ending this FsTxn ends ownership
      ownershipTimeoutMs: 2000,
      rootFk: fk,
      throttler: fn => fn(),
      key: null
    }.merge(cfg ?? {});
    
    // Initialize `cfg` if we're the root item
    if (!cfg.initPrm) cfg.initPrm = Form.initCfg(cfg);
    
    Object.assign(this, {
      fk: fk.kid([]),
      holder: false,
      cfg,
      throttler: cfg.throttler,
      locks: Set(),
      initPrm: cfg.initPrm.then(() => this)
    });
    denumerate(this, 'locks');
    
    if (!cfg.held) { this.holder = cfg.held = true; }
    
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
    let requireInitMethods = 'processOp,processOps,getType,getMeta,setData,getData,getSubtree,getDataHeadStream,getDataTailStream'.split(',');
    let maskedCallsPrm = this.initPrm.catch(() => { /* Ignore errors */ });
    for (let m of requireInitMethods) {
      
      let orig = this[m].bind(this);
      C.def(this, m, (...args) => {
        let prm = this.initPrm.then(() => orig(...args));
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
  
  checkFk(fk) {
    if (!isForm(fk, FsKeep)) throw Error(`Api: fp must be FsKeep; got ${getFormName(fk)})`).mod({ fk });
    if (!this.fk.is(fk).par) throw Error('Api: fk is not contained within the transaction').mod({ fk, trn: this });
  },
  getLineageLocks(fk, lockType='node.set') {
    
    // Get the lineage locks required to lock the given `fk` in the context of this `FsTxn`
    
    let { eql, kid } = fk.is(this.fk);
    
    // The root fk requires no lineage locking
    if (eql) return [];
    
    // Non-kid fks are invalid targets of lineage locking
    if (!kid) throw Error('Api: unable to get lineage locks for fk outside of FsTxn').mod({ txnFk: this.fk, outsideFk: fk });
    
    // Return the lineage locks from `this.fk` up to (excluding) `fk`
    return fk.par().lineage(this.fk).toArr(ln => Form.lock(lockType, ln.fk));
    
  },
  
  // Operation runners
  async processOp({ name, locks: opLocks, fn }={}) {
    
    // TODO: I think `this.volatilityMemo` needs to occur in the locked context??
    //let cleanup = handleVolatility ? await this.volatilityMemo([ { name } ]) : () => {};
    let cleanup = () => {};
    
    if (!opLocks.length) throw Error('Api: provide at least one lock');
    
    // Collect all pre-existing locks that collide with any of the locks provided for this
    // operation - once all blocking locks resolve we're guaranteed our context is locked!
    let blockingLocks = [];
    for (let existingLock of this.locks)
      if (opLocks.some(incomingLock => Form.locksCollide(existingLock, incomingLock)))
        blockingLocks.push(existingLock);
    
    // Add new Locks so any new colliding ops are blocked until `fn` completes; note the Locks are
    // still added even if `op` is currently blocked (if `blockingLocks.length > 0`)
    for (let lock of opLocks) {
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
    finally       { for (let lk of opLocks) lk.prm.resolve(); /* Release locks */ await cleanup(); }
    
  },
  async processOps(ops) {
    
    // for (let { name, locks, fn } of ops) { '...'; }
    
    // Before running `ops`, write the full plan to a single blob under `this.cfg.rootFk`
    
    // Run all `ops` in parallel; collision locking will serialize as required!
    await Promise.all(ops.map(op => this.processOp(op)));
    
  },
  
  // Fk-specific operations
  getType(fk) /* Promise<null | 'leaf' | 'node'> */ {
    
    this.checkFk(fk);
    
    let locks = [ Form.lock('node.get', fk) ];
    return this.processOp({
      name: 'getType',
      locks,
      fn: () => Form.xGetType(fk),
      volatilityMemo: null // Could have been `{ op: 'getType', fd: fk.fd }`, but note that read operations shouldn't require volatility memos!
    });
    
  },
  getMeta(fk) /* Promise<{ type: null | 'leaf' | 'node', size: number, exists: boolean }> */ {
    
    this.checkFk(fk);
    
    let locks = [ Form.lock('node.get', fk) ];
    return this.processOp({
      name: 'getMeta',
      locks,
      fn: async () => {
        
        let stat = await Form.xSafeStat(fk);
        let type = await Form.xGetType(fk, stat);
        if (type === 'leaf') return { type, exists: true, size: stat.size };
        
        // Try to interpret the node as its "~" leaf value
        stat = await Form.xSafeStat(fk.kid([ '~' ]));
        type = await Form.xGetType(fk, stat);
        if (type === 'leaf') return { type, exists: true, size: stat.size };
        
        return { type, exists: !!type, size: 0 };
        
      },
      volatilityMemo: null
    });
    
  },
  exists(fk) { return this.getMeta(fk).then(v => v.exists); },
  setData(fk, data, opts={}) /* Promise<void> */ {
    
    this.checkFk(fk);
    
    if (!isForm(opts, Object)) opts = { encoding: opts };
    let { encoding: enc=null } = opts;
    
    if (data === null || data.length === 0) {
      
      // Instead of writing a Buffer of 0 length we remove the leaf entirely (and we consider
      // non-existent leafs to have the value `null` or `Buffer.alloc(0)`)
      
      return this.processOp({
        name: 'setDataEmpty',
        locks: [ Form.lock('node.set', fk) ],
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
      
      let lineageLocks = this.getLineageLocks(fk, 'node.set');
      
      if (enc === 'json') data = valToJson(data);
      if (this.cfg.cryptoKey) data = Form.encrypt({ data, key: this.cfg.cryptoKey, fk })
      
      return this.processOp({
        name: 'setData',
        // Overall, we have a series of lineage locks and a single leaf lock
        locks: [ ...lineageLocks, Form.lock('node.set', fk) ],
        fn: async () => {
          
          let type = await Form.xGetType(fk);
          if ([ 'leaf', 'node' ].has(type)) {
            
            // Leafs and nodes are handled nearly the same: if leaf, it's the pre-existing value and
            // we simply overwrite it. If it's the node, we simply write to the "~" child, which will
            // either be an overwrite or a new value.
            
            // Free up lineage locks immediately
            for (let { prm } of lineageLocks) prm.resolve();
            
            let writeFk = (type === 'node') ? fk.kid([ '~' ]) : fk;
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
    
    this.checkFk(fk);
    
    if (!isForm(opts, Object)) opts = { encoding: opts };
    let { encoding: enc=null } = opts;
    
    return this.processOp({
      
      name: 'getData',
      locks: [ Form.lock('node.get', fk) ],
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
      if (enc === null) return buff;
      if (enc === 'json') return buff.length ? JSON.parse(buff) : null;
      return buff.toString(enc);
      
    });
    
  },
  
  getContent(...args) { // DEPRECATED
    
    subcon('warn')(Error('Deprecated "getContent" method (use "getData" instead)'));
    return this.getData(...args);
    
  },
  setContent(...args) { // DEPRECATED
    
    subcon('warn')(Error('Deprecated "setContent" method (use "setData" instead)'));
    return this.setData(...args);
    
  },
  
  rem(fk) {
    
    this.checkFk(fk);
    
    let locks = [ Form.lock('subtree.set', fk) ];
    return this.processOp({
      name: 'rem',
      locks,
      fn: async () => {
        
        // Watch out for `fs.rm` with retries - it's badly behaved!
        try         { await nodejs.fs.rm(fk.fp, { recursive: true, maxRetries: 0 }); }
        catch (err) { if (err.code !== 'ENOENT') throw err; }
        
      }
    });
    
  },
  
  getKids(fk) {
    
    // Note this method returns an Enumerable; not necessarily an Array! (TODO: use streaming?)
    
    this.checkFk(fk);
    
    // TODO: Switch to "family.get" lock; implement "family.get" in `lockCollisionResolvers`
    let locks = [ Form.lock('subtree.get', fk) ];
    
    return this.processOp({
      name: 'getKids',
      locks,
      fn: async () => {
        
        let type = await Form.xGetType(fk);
        if (type === null)   return {};
        if (type === 'leaf') return {};
        
        // Now the type must be "node"
        return Form.xGetKids(fk);
        
      }
    });
    
  },
  getSubtree(fk) {
    
    this.checkFk(fk);
    
    let locks = [ Form.lock('subtree.get', fk) ];
    return this.processOp({
      name: 'getSubtree',
      locks,
      fn: async () => {
        
        let type = await Form.xGetType(fk);
        
        if (type === null)   return Object.assign(fk, { kids: {} });
        if (type === 'leaf') return Object.assign(fk, { kids: {} });
        
        return Object.assign(fk, {
          kids: await Form.xGetKids(fk).then(fks => Promise.all(fks.map(fk => this.getSubtree(fk))))
        });
        
      },
      volatilityMemo: null
    });
    
  },
  getDataHeadStream(fk) {
    
    // A "head stream" goes into a file pointer's data storage. If the file pointer is changed
    // during the stream, writes which occur after do not fail, but no longer effect the node at
    // the pointer. TODO: unique to win32?? If there's always no interference between incoming
    // writes and the stream initiated earlier, we can allow this operation to not lock writes!
    // (I think requires a new lock type!)
    
    this.checkFk(fk);
    
    let streamPrm = Promise.later();
    
    let lineageLocks = this.getLineageLocks(fk, 'node.set');
    let nodeLock = Form.lock('node.set', fk);
    
    // Note that `prm`, the result of the `this.processOp(...)` call, already reflects the stream's
    // successful close - this Promise should be exposed, since it can be helpful to the consumer!
    let prm = this.processOp({
      name: 'getDataHeadStream',
      locks: [ ...lineageLocks, nodeLock ],
      fn: async () => {
        
        let streamFk = fk;
        
        let type = await Form.xGetType(fk);
        
        // Lineage must be ensured if nothing already exists here
        if      (type === null) await Form.xEnsureLineage(lineageLocks);
        
        // If the target is already a node write to the "~" kid instead
        else if (type === 'node') streamFk = streamFk.kid([ '~' ]);
        
        // Note that if `type === 'leaf'` nothing needs to change; value is naturally clobbered!
        
        let stream = nodejs.fs.createWriteStream(streamFk.fp);
        streamPrm.resolve(stream);
        
        // Hold the "node.set" lock until the stream consumer has closed the stream!! (TODO: Timeout condition??)
        await Promise((rsv, rjc) => (stream.on('close', rsv), stream.on('error', rjc)));
        
      },
      volatilityMemo: null
    });
    
    // Downstream use can be simple:
    //    | let headStream = await FsTxn(...).getDataHeadStream(FsKeep(...));
    //    | someStream.pipe(headStream); // Writes to `headStream` with automatic txn cleanup
    // If the consumer wants to know when the piping has completed, they can simply:
    //    | let streamToMeFk = FsKeep(...);
    //    | let headStream = await FsTxn(...).getDataHeadStream(streamToMeFk);
    //    | someStream.pipe(headStream); // Writes to `headStream` with automatic txn cleanup
    //    | await headStream.prm;
    //    | gsc(`Finished streaming value to ${streamToMeFk.desc()}`);
    return streamPrm.then(stream => Object.assign(stream, { prm }));
    
  },
  getDataTailStream(fk) {
    
    // A "tail stream" comes from a file pointer's data storage. Once a stream has initialized, it
    // seems unaffected even if the file pointer is changed partway through! This means we can
    // simply consider our operation complete once the stream has been initialized, without needing
    // to wait for it to finish streaming.
    
    this.checkFk(fk);
    
    let streamPrm = Promise.later();
    let nullStream = () => streamPrm.resolve({ on: () => {}, pipe: stream => stream.end() });
    
    let nodeLock = Form.lock('node.get', fk);
    let prm = this.processOp({
      name: 'getDataTailStream',
      locks: [ nodeLock ],
      fn: async () => {
        
        let streamFk = fk;
        let type = await Form.xGetType(fk);
        
        // Return empty string if fk doesn't exist
        if (type === null) return void nullStream();
        
        // If type is "node", use the "~" kid if it's available, otherwise empty result
        if (type === 'node') {
          streamFk = streamFk.kid([ '~' ]);
          if ('leaf' !== await Form.xGetType(streamFk)) return void nullStream();
        }
        
        // Now we know `fk` is "leaf"; expose the stream to the consumer...
        let stream = nodejs.fs.createReadStream(streamFk.fp);
        streamPrm.resolve(stream);
        
        // ... but hold the lock until the stream is finished
        await Promise((rsv, rjc) => (stream.on('close', rsv), stream.on('error', rjc))).catch(err => {
          
          // TODO: Maybe this case can be ignored?? Research it!
          // ERR_STREAM_PREMATURE_CLOSE errors can happen if piping is unexpectedly disrupted
          if (err.code === 'ERR_STREAM_PREMATURE_CLOSE') {
            // ERR_STREAM_PREMATURE_CLOSE unwantedly propagates to the top-level; it should reject
            // like any other error, but need:
            // 1. Suppress to allows catching to prevent the top-level process crashing
            // 2. Wrap in a separate error which is then thrown; this *allows* the error to crash
            //    at the top-level if it goes entirely unhandled
            let unsuppressedErr = Error('Api: stream failed because it was broken (was a network stream disconnected?)');
            throw unsuppressedErr.mod({ cause: err.suppress() });
          }
          
          throw err;
          
        });
        
      },
      volatilityMemo: null
    });
    
    return streamPrm.then(stream => Object.assign(stream, { prm }));
    
  },
  
  cleanup() {
    
    // Ending the "holder" ends cfg ownership (by setting the "active" prop to false, which breaks
    // an async loop)
    if (this.holder) this.cfg.active = false;
    
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