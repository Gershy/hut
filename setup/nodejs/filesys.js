'use strict';

require('../clearing.js');

let validComponentRegex = /^[a-zA-Z0-9!@][-a-zA-Z0-9!@._ ]*$/; // alphanum!@ followed by the same including ".", "-" (careful with "-" in regexes), "_", and " "
let getUid = () => (Number.int32 * Math.random()).encodeStr(String.base32, 7);

let fs = (fs => ({
  ...fs.promises,
  ...fs.slice([ 'createReadStream', 'createWriteStream' ])
}))(require('fs')).map((fn, name) => (...args) => {
  let err = Error('='.repeat(300));
  return then(fn(...args), Function.stub, cause => err.propagate({ cause, msg: `Failed low-level ${name} on "${args[0]}"` }));
});

let Filepath = form({ name: 'Filepath', props: (forms, Form) => ({
  
  $filteredComponentRegex: /^[.]+$/, // Remove components composed purely of "."
  
  init(vals, path=require('path')) {
    
    if (!isForm(vals, Array)) vals = [ vals ];
    
    vals = vals
      .flat(Infinity)                  // Flatten all fps into a flat list of Strings
      .map(cmp => cmp.split(/[/\\]+/)) // Each String is broken into its components
      .flat(1)                         // Finally flatten into flat list of components
      
    let illegalCmp = vals.find(val => Form.filteredComponentRegex.test(val)).val;
    if (illegalCmp) throw Error(`Illegal file component provided`).mod({ illegalCmp });
    
    // Use `path.resolve`; first component being "/" ensures working
    // directory is always ignored; final result is split by "/" and "\"
    // which may produce an empty leading item on posix since, e.g.,
    // `'/a/b/c'.split('/') === [ '', 'a', 'b', 'c' ]`
    
    Object.assign(this, {
      path,
      cmps: path.resolve('/', ...vals).split(/[/\\]+/).map(v => v || skip),
      fspVal: null
    });
    
  },
  desc() { return `${getFormName(this)}(->${this.cmps.join('->')})`; },
  
  count() { return this.cmps.length; },
  kid(...fp) { return Filepath([ this.cmps, fp ]); },
  sib(cmp)   { return Filepath([ this.cmps.slice(0, -1), cmp ]); },
  par(n=1) { return (n <= 0) ? this : Filepath(this.cmps.slice(0, -n)); },
  contains(fp) { return this.cmps.length  <= fp.cmps.length && this.cmps.every((v, i) => fp.cmps[i] === v); },
  equals(fp)   { return this.cmps.length === fp.cmps.length && this.cmps.every((v, i) => fp.cmps[i] === v); },
  fsp() {
    
    if (!this.fspVal) {
      let fspVal = this.path.resolve('/', ...this.cmps);
      if (!/^([/\\]|[A-Z]+:)/.test(fspVal)) throw Error(`${this.desc()} path doesn't start with component separator or drive`).mod({ fsp: fspVal });
      this.fspVal = fspVal;
    }
    return this.fspVal;
    
  }
  
})});

let FilesysTransaction = form({ name: 'FilesysTransaction', props: (forms, Form) => ({
  
  init(fp=Filepath([]), par=null) {
    
    Object.assign(this, {
      fp: isForm(fp, Filepath) ? fp : Filepath(fp),
      locks: Set()
    });
    
  },
  desc() { return `getFormName(this) @ ${this.fp.desc()}`; },
  
  // "x" implies these should be surrounded by "doLocked", and should be
  // preceded by a check that `fp` is in our jurisdiction
  async xSafeStat(fp) {
    
    try         { return await fs.stat(fp.fsp()); }
    catch (err) { if (err.code !== 'ENOENT') throw err; }
    return null;
    
  },
  async xGetType(fp) {
    
    let stat = await this.xSafeStat(fp);
    if (stat === null)      return null;
    if (stat.isFile())      return 'leaf';
    if (stat.isDirectory()) return 'node';
    
    throw Error(`Unexpected filesystem entity`).mod({ stat });
    
  },
  async xSwapLeafToNode(fp, { tmpCmp=`~${getUid()}`, valCmp='~' }={}) {
    
    // We want a dir to replace an existing file (without reads on
    // that previously existing file to fail) - so we replace the
    // file with a directory containing a "default value file"
    
    // Basically we know that `fp` is a leaf, and we want it to become
    // a node, with `fp.kid('~')` holding the value previously at `fp`
    
    let fsp = fp.fsp();                // Path to original file
    let tmpFsp = fp.sib(tmpCmp).fsp(); // Path to temporary file (sibling of original file)
    let valFsp = fp.kid(valCmp).fsp(); // Path to final file
    
    await fs.rename(fsp, tmpFsp);    // Move file out of the way
    await fs.mkdir(fsp);             // Set directory where file used to be
    await fs.rename(tmpFsp, valFsp); // Set original file as "default value file"
    
  },
  async xEnsureNode(fp) {
    
    // Ensure all nodes up to (but excluding) `fp`
    // Really this ensures that an entity can be written at `fp`. It
    // doesn't actually set `fp`, only `fp`'s direct parent!
    
    let ptr = this.fp;
    while (!ptr.equals(fp)) {
      
      let type = await this.xGetType(ptr);
      
      // If nothing exists create dir; if file exists swap it to dir
      if      (type === null)   await fs.mkdir(ptr.fsp());
      else if (type === 'leaf') await this.xSwapLeafToNode(ptr);
      
      // Extend `ptr` with the next component in `fp`
      ptr = ptr.kid(fp.cmps[ptr.count()]);
      
    }
    
  },
  
  checkFp(fp) {
    if (!isForm(fp, Filepath)) throw Error(`Must provide Filepath (got ${getFormName(fp)})`);
    if (!this.fp.contains(fp)) throw Error(`Fp ${fp.desc()} is outside ${this.desc()}`);
    if (fp.cmps.any(cmp => cmp === '~')) throw Error(`${fp.desc()} includes "~" component`);
  },
  getCollidedLocks(locks) {
    
    
    
  },
  locksCollide(lock0, lock1) {
    
    // Order `lock0` and `lock1` by their "type" properties
    if (lock0.type.localeCompare(lock1.type) > 0) [ lock0, lock1 ] = [ lock1, lock0 ];
    
    let collTypeKey = `${lock0.type}/${lock1.type}`;
    
    if (collTypeKey === 'lineageWrite/lineageWrite') {
      
      // Lineage writes collide if there's any overlap between the nodes
      // they're trying to create
      
      return false
        || lock0.headFp.contains(lock1.tailFp)
        || lock1.headFp.contains(lock0.tailFp);
      
    }
    
    if (collTypeKey === 'lineageWrite/nodeRead') {
      
      // Lineage writes affect reads because they may wind up swapping a
      // file to a directory; a lineage contains a node if its head
      // contains it and its tail doesn't contain it!
      
      return true
        &&  lock0.headFp.contains(lock1.fp)
        && !lock0.tailFp.contains(lock1.fp);
      
    }
    
    if (collTypeKey === 'lineageWrite/nodeWrite') {
      
      // Same as "lineageWrite/nodeRead"
      
      return true
        &&  lock0.headFp.contains(lock1.fp)
        && !lock0.tailFp.contains(lock1.fp);
      
    }
    
    if (collTypeKey === 'lineageWrite/subtreeWrite') {
      
      return false
        || lock0.headFp.contains(lock1.fp)
        || lock1.fp.contains(lock0.tailFp);
      
    }
    
    if (collTypeKey === 'nodeRead/nodeRead') return false; // Reads never collide with each other!
    
    if (collTypeKey === 'nodeRead/nodeWrite') {
      
      // Reads and writes conflict if they occur on the exact same node
      return lock0.fp.equals(lock1.fp);
      
    }
    
    if (collTypeKey === 'nodeRead/subtreeWrite') {
      
      // Conflict if the node being read is within the subtree
      return lock1.fp.contains(lock0.fp);
      
    }
    
    if (collTypeKey === 'nodeWrite/nodeWrite') {
      
      // Writes aren't allowed to race with each other - two writes
      // collide if they occur on the exact same node!
      return lock0.fp.equals(lock1.fp);
      
    }
    
    if (collTypeKey === 'nodeWrite/subtreeWrite') {
      
      // Conflict if the node being written is within the subtree
      return lock1.fp.contains(lock0.fp);
      
    }
    
    throw Error(`Collision type "${collTypeKey}" not implemented`);
    
  },
  async doLocked({ name='?', locks=[], fn }) {
    
    if (!locks.length) throw Error(`Provide at least one Lock`);
    for (let lock of locks) if (!lock.has('prm')) lock.prm = Promise.later();
    
    // Collect all pre-existing locks that collide with any of the locks
    // provided for this operation (once all collected Promises have
    // resolved we will be guaranteed we have a safely locked context!)
    //let collLocks = this.getCollidedLocks(locks);
    let collLocks = [];
    for (let lk0 of this.locks)
      for (let lk1 of locks)
        if (this.locksCollide(lk0, lk1)) { collLocks.push(lk0); break; }
    
    // We've got our "prereq" Promise - now add a new Lock so any new
    // actions are blocked until `fn` completes
    for (let lock of locks) {
      mmm('filesysLock', +1);
      this.locks.add(lock);
      lock.prm.then(() => { mmm('filesysLock', -1); this.locks.rem(lock); });
    }
    
    let err = Error('');
    
    // Wait for all collisions to dissipate...
    let uid = getUid();
    await Promise.all(collLocks.map(lk => lk.prm)); // Won't reject because it's a Promise.all over Locks, and no `Lock(...).prm` ever rejects!
    
    // We now own the locked context!
    try           { return await fn(); }
    catch (cause) { throw err.mod({ cause, msg: `Failed locked op: "${name}"` }); }
    finally       { for (let lock of locks) lock.prm.resolve(); } // Ensure all Locks resolve
    
  },
  async transact({ name='?', fp, fn }) {
    
    // Maybe functions can pass in a whole bunch of initial locks with
    // various bounding - the caller can end these locks whenever they
    // see fit (and `doLocked` can simply remove entries from
    // `this.locks` when the corresponding resolves - not just at the
    // end of the function!!)
    
    this.checkFp(fp);
    
    let rootLock = { type: 'lineageWrite', headFp: this.fp, tailFp: fp };
    let nodeLock = { type: 'subtreeWrite', fp };
    
    return this.doLocked({ name: `trn/${name}`, locks: [ rootLock, nodeLock ], fn: async () => {
      
      await this.xEnsureNode(fp);
      rootLock.prm.resolve(); // Release the lineage lock
      
      return fn(FilesysTransaction(fp));
      
    }});
    
  },
  
  async getDataBytes(fp) {
    
    this.checkFp(fp);
    return this.doLocked({ name: 'getDataBytes', locks: [{ type: 'nodeRead', fp }], fn: async () => {
      
      let stat = await this.xSafeStat(fp);
      if (stat === null) return 0;
      if (stat.isFile()) return stat.size;
      
      // We only get here if `fp` is a directory
      // Try to read the "~" item; any error results in 0 size
      stat = await this.xSafeStat(fp.kid('~'));
      return stat?.size ?? 0;
      
    }});
    
  },
  async setData(fp, data) {
    
    this.checkFp(fp);
    
    if (data === null || data.length === 0) {
      
      // Instead of writing a Buffer of 0 length we remove leafs set to
      // have 0-length / `null` data
      
      return this.doLocked({ name: 'setLeafEmpty', locks: [{ type: 'nodeWrite', fp }], fn: async () => {
        
        let type = await this.xGetType(fp);
        if (type === null) return;
        
        // For leafs simply unlink the leaf
        if (type === 'leaf') {
          try         { await fs.unlink(fp.fsp()); }
          catch (err) { if (err !== 'ENOENT') throw err; }
        }
        
        // For nodes try to unlink the "~" child
        if (type === 'node') {
          try         { await fs.unlink(fp.kid('~').fsp()); }
          catch (err) { if (err !== 'ENOENT') throw err; }
        }
        
      }});
      
    } else {
      
      // Setting a non-zero amount of data requires ensuring that all
      // ancestor nodes exist and finally writing the data
      
      let rootLock = { type: 'lineageWrite', headFp: this.fp, tailFp: fp };
      let nodeLock = { type: 'nodeWrite', fp };
      return this.doLocked({ name: 'setData', locks: [ rootLock, nodeLock ], fn: async () => {
        
        // We only need the lineage lock to ensure the node exists
        await this.xEnsureNode(fp);
        rootLock.prm.resolve();
        
        await fs.writeFile(fp.fsp(), data);
        
      }});
      
    }
    
  },
  async getData(fp, opts={}) {
    
    this.checkFp(fp);
    
    return this.doLocked({ name: 'getData', locks: [{ type: 'nodeRead', fp }], fn: async () => {
      
      if (!isForm(opts, Object)) opts = { encoding: opts };
      let { encoding: enc=null } = opts;
      
      try { return await fs.readFile(fp.fsp(), opts); }
      catch (err) {
        if (err.code === 'ENOENT') return enc ? '' : Buffer.alloc(0);
        if (err.code !== 'EISDIR') throw err;
      }
      
      try { return await fs.readFile(fp.kid('~').fsp(), opts); }
      catch (err) {
        if (err.code !== 'ENOENT') throw err;
      }
      
      return Buffer.alloc(0);
      
    }});
    
  },
  async getDataHeadStream(fp) {
    
    // A "head stream" goes into a file pointer's data storage. If the
    // file pointer is changed during the stream, writes which occur
    // after do not fail, but no longer effect the node at the pointer!
    
    this.checkFp(fp);
    
    let streamPrm = Promise.later();
    
    let rootLock = { type: 'lineageWrite', headFp: this.fp, tailFp: fp };
    let nodeLock = { type: 'nodeWrite', fp };
    let prm = this.doLocked({ name: 'getHeadStream', locks: [ rootLock, nodeLock ], fn: async () => {
      
      await this.xEnsureNode(fp);
      rootLock.prm.resolve();
      
      let stream = fs.createWriteStream(fp.fsp());
      streamPrm.resolve(stream);
      nodeLock.prm.resolve();
      
      await Promise((rsv, rjc) => {
        stream.on('close', rsv);
        stream.on('error', rjc);
      });
      
    }});
    
    // Expose the `doLocked` Promise via a "prm" prop on the Stream
    return streamPrm.then(stream => Object.assign(stream, { prm }));
    
  },
  async getDataTailStream(fp) {
    
    // A "tail stream" comes from a file pointer's data storage. Once a
    // stream has initialized, it seems unaffected even if the file
    // pointer is changed partway through! This means we can simply
    // consider our operation complete once the stream has been
    // initialized, without needing to wait for it to finish streaming.
    
    this.checkFp(fp);
    
    return this.doLocked({ name: 'getTailStream', locks: [{ type: 'nodeRead', fp }], fn: async () => {
      
      let stream = fs.createReadStream(fp.fsp());
      stream.prm = Promise((rsv, rjc) => {
        stream.on('close', rsv);
        stream.on('error', err => (err.code !== 'ENOENT') ? rjc(err) : rsv());
      });
      return stream;
      
    }});
    
  },
  
  async getKidNames(fp, data) {
    
    this.checkFp(fp);
    return this.doLocked({ name: 'getKidNames', locks: [{ type: 'nodeRead', fp }], fn: async () => {
      
      try         { return await fs.readdir(fp.fsp()); }
      catch (err) { if (err.code !== 'ENOENT') throw err; }
      return [];
      
    }});
    
  },
  async remSubtree(fp) {
    
    this.checkFp(fp);
    
    return this.doLocked({ name: 'remSubtree', locks: [{ type: 'subtreeWrite', fp }], fn: async () => {
      
      try         { await fs.rm(fp.fsp(), { recursive: true, maxRetries: 0 }); }
      catch (err) { if (err.code !== 'ENOENT') throw err; }
      
    }});
    
  },
  async iterateNode(fp, { bufferSize=150 }={}) {
    
    this.checkFp(fp);
    
    let itPrm = Promise.later();
    
    let prm = this.doLocked({ name: 'iterateNode', locks: [{ type: 'nodeRead' }], fn: async () => {
      
      let dir = null;
      try         { dir = await fs.opendir(fp.fsp(), { bufferSize }); }
      catch (err) { if (err !== 'ENOENT') return itPrm.reject(err); } // Note that `prm` still succeeds in this case!
      
      if (!dir) return itPrm.resolve({
        async* [Symbol.asyncIterator]() { itCompletePrm.resolve(); }, // No yields, just completion
        async close() { itCompletePrm.resolve(); }
      });
      
      // A dir exists and needs to be iterated; don't resolve `doLocked`
      // until the iterator is exhausted or closed!
      let itCompletePrm = Promise.later();
      itPrm.resolve({
        async* [Symbol.asyncIterator]() {
          for await (let { name } of dir) if (name !== '~') yield name;
          itCompletePrm.resolve();
        },
        async close() {
          try         { await Promise(r => dir.close(r)); }
          catch (err) { if (err !== 'ERR_DIR_CLOSED') return itCompletePrm.reject(err); }
          itCompletePrm.resolve();
        }
      });
      await itCompletePrm;
      
    }});
    
    return itPrm.then(it => Object.assign(it, { prm }));
    
  }
  
})});

module.exports = { Filepath, FilesysTransaction };

if (require.main === module) {
  
  (async () => {
    
    let t = Date.now();
    
    let testFp = Filepath(__dirname).par(2).kid('mill/mud');
    let trn = FilesysTransaction(testFp);
    
    try {
      
      { // Ensure filepaths resolve as expected
        
        // Note that "\\" (an irrelevant char) is mapped to backslash
        let win = { name: 'win', path: require('path').win32 };
        let nix = { name: 'nix', path: require('path').posix };
        let tests = [
          
          [ win, [],              'C:\\' ],
          [ win, '',              'C:\\' ],
          [ win, '/',             'C:\\' ],
          [ win, '//',            'C:\\' ],
          [ win, '///',           'C:\\' ],
          [ win, '\\',            'C:\\' ],
          [ win, '\\\\',          'C:\\' ],
          [ win, '\\\\\\',        'C:\\' ],
          [ win, '/\\/\\/\\',     'C:\\' ],
          [ nix, [],              '/' ],
          [ nix, '',              '/' ],
          [ nix, '/',             '/' ],
          [ nix, '//',            '/' ],
          [ nix, '///',           '/' ],
          [ nix, '\\',            '/' ],
          [ nix, '\\\\',          '/' ],
          [ nix, '\\\\\\',        '/' ],
          [ nix, '/\\/\\/\\',     '/' ],
          
          [ win, 'a',             'C:\\a' ],
          [ win, '/a',            'C:\\a' ],
          [ win, '/a/',           'C:\\a' ],
          [ win, '\\a\\',         'C:\\a' ],
          [ win, '\\a/',          'C:\\a' ],
          [ nix, 'a',             '/a' ],
          [ nix, '/a',            '/a' ],
          [ nix, '/a/',           '/a' ],
          [ nix, '\\a\\',         '/a' ],
          [ nix, '\\a/',          '/a' ],
          
          [ win, '/a/..',         /([iI]llegal|[iI]nvalid)[ .].*[cC]omponent/ ],
          [ win, '\\a\\..',       /([iI]llegal|[iI]nvalid)[ .].*[cC]omponent/ ],
          [ win, '\\a/..',        /([iI]llegal|[iI]nvalid)[ .].*[cC]omponent/ ],
          [ nix, '/a/..',         /([iI]llegal|[iI]nvalid)[ .].*[cC]omponent/ ],
          [ nix, '\\a\\..',       /([iI]llegal|[iI]nvalid)[ .].*[cC]omponent/ ],
          [ nix, '\\a/..',        /([iI]llegal|[iI]nvalid)[ .].*[cC]omponent/ ]
          
        ];
        
        let paths = { win: require('path').win32, nix: require('path').posix };
        for (let [ { name, path }, inp, exp ] of tests) {
          
          if (hasForm(exp, RegExp)) {
            
            try {
              let fsp = Filepath(inp, path).fsp();
              throw Error(`Case was meant to fail`).mod({ name, inp, exp, fsp });
            } catch (err) {
              if (!exp.test(err.message)) throw Error(`Failure expected, but unexpected error message`).mod({ name, inp, errMsg: err.message, exp });
              continue;
            }
            
          } else {
            
            let fsp = Filepath(inp, path).fsp();
            if (fsp !== exp) throw Error(`Failed`).mod({ name, inp, exp, fsp });
            
          }
          
        }
        
      }
      
      { // Test "encoding" option for "getData"
        
        await trn.remSubtree(testFp);
        
        let v1 = await trn.getData(testFp, 'utf8');
        if (!isForm(v1, String)) throw Error('Expected String');
        if (v1.length) throw Error('Expected 0 len');
        
        let v2 = await trn.getData(testFp);
        if (!isForm(v2, Buffer)) throw Error('Expected Buffer');
        if (v2.length) throw Error('Expected 0 len');
        
        let v3 = await trn.getData(testFp, null);
        if (!isForm(v3, Buffer)) throw Error('Expected Buffer');
        if (v3.length) throw Error('Expected 0 len');
        
        let v4 = await trn.getData(testFp, { encoding: 'utf8' });
        if (!isForm(v4, String)) throw Error('Expected String');
        if (v4.length) throw Error('Expected 0 len');
        
        let v5 = await trn.getData(testFp, { encoding: null });
        if (!isForm(v5, Buffer)) throw Error('Expected Buffer');
        if (v5.length) throw Error('Expected 0 len');
        
      }
      
      { // Ensure "setData" doesn't race with "remSubtree"
        
        for (let n of 300) {
          
          let results = [];
          await Promise.all([
            trn.setData(testFp, 'hihihi'),
            trn.remSubtree(testFp),
            trn.getData(testFp, 'utf8').then(v => results.add(v))
          ]);
          
          if (results.find(r => r.length).found) throw Error('All results should be 0-length');
          
        }
        
        for (let n of 300) {
          
          let results = [];
          await Promise.all([
            trn.remSubtree(testFp),
            trn.setData(testFp, 'hihihi'),
            trn.getData(testFp, 'utf8').then(v => results.add(v))
          ]);
          
          if (results.find(r => r !== 'hihihi').found) throw Error('All results should be "hihihi"');
          
        }
        
        await trn.remSubtree(testFp);
        
      }
      
      { // Ensure "setData" and "getData" don't race
        
        let fp = testFp.kid('y', 'z');
        
        let results = [];
        
        await trn.transact({ name: 'test1', fp, fn: async trn => {
          
          await Promise.all((50).toArr(v => [
            trn.setData(fp, `(${v.toString(10).padHead(4, '0')})`),
            trn.getData(fp).then(v => (results.add(v.toString('utf8')), v))
          ]).flat(1));
          
        }});
        
        for (let [ i, r ] of results.entries()) {
          let exp = `(${i.toString().padHead(4, '0')})`;
          if (r !== exp) throw Error(`Unexpected result: "${r}" (out of order?)`).mod({ got: r, exp });
        }
        
      }
      
      { // Ensure "setData" and "getData" don't race within transactions
        
        let fp = testFp.kid('u');
        
        let results = [];
        await Promise.all((50).toArr(async v => {
          
          let fp2 = fp.kid('2');
          await trn.transact({ name: 'test2.1', fp: fp2, fn: async trn => {
            
            let fp3 = fp2.kid('3');
            await trn.transact({ name: 'test2.2', fp: fp3, fn: async trn => {
              
              await Promise.all([
                trn.setData(fp3, `hihi: ${v}`),
                trn.getData(fp3).then(v => results.push(v.toString('utf8')))
              ]);
              
            }});
            
          }});
          
        }));
        
        for (let [ i, r ] of results.entries())
          if (r !== `hihi: ${i}`) throw Error(`Unexpected result: "${r}" (out of order?)`);
        
      }
      
      { // Test file->dir swap (serially, no locking really needed)
        
        let fp = testFp.kid('swapswap');
        
        await trn.setData(fp.kid('aa'), 'I AM AA');
        await trn.setData(fp.kid('aa').kid('bb'), 'I AM BB');
        await trn.setData(fp.kid('aa').kid('cc'), 'I AM CC');
        await trn.setData(fp.kid('aa').kid('bb').kid('dd'), 'I AM DD');
        await trn.setData(fp.kid('aa').kid('bb').kid('ee'), 'I AM EE');
        
        let r = null;
        
        r = await trn.getData(fp.kid('aa'), 'utf8');
        if (r !== 'I AM AA') throw Error('Bad result').mod({ r });
        
        r = await trn.getData(fp.kid('aa').kid('bb'), 'utf8');
        if (r !== 'I AM BB') throw Error('Bad result').mod({ r });
        
        r = await trn.getData(fp.kid('aa').kid('cc'), 'utf8');
        if (r !== 'I AM CC') throw Error('Bad result').mod({ r });
        
        r = await trn.getData(fp.kid('aa').kid('bb').kid('dd'), 'utf8');
        if (r !== 'I AM DD') throw Error('Bad result').mod({ r });
        
        r = await trn.getData(fp.kid('aa').kid('bb').kid('ee'), 'utf8');
        if (r !== 'I AM EE') throw Error('Bad result').mod({ r });
        
      }
      
      { // Test file->dir swap (in parallel - locking needed!)
        
        let fp = testFp.kid('swapperman');
        
        await Promise.all([
          trn.setData(fp.kid('aa'), 'I AM AA'),
          trn.setData(fp.kid('aa').kid('bb'), 'I AM BB'),
          trn.setData(fp.kid('aa').kid('cc'), 'I AM CC'),
          trn.setData(fp.kid('aa').kid('bb').kid('dd'), 'I AM DD'),
          trn.setData(fp.kid('aa').kid('bb').kid('ee'), 'I AM EE')
        ]);
        
        let rs = await Promise.all({
          aa: trn.getData(fp.kid('aa'), 'utf8'),
          bb: trn.getData(fp.kid('aa').kid('bb'), 'utf8'),
          cc: trn.getData(fp.kid('aa').kid('cc'), 'utf8'),
          dd: trn.getData(fp.kid('aa').kid('bb').kid('dd'), 'utf8'),
          ee: trn.getData(fp.kid('aa').kid('bb').kid('ee'), 'utf8')
        });
        
        if (rs.aa !== 'I AM AA') throw Error('Bad result').mod({ r: rs.aa });
        if (rs.bb !== 'I AM BB') throw Error('Bad result').mod({ r: rs.bb });
        if (rs.cc !== 'I AM CC') throw Error('Bad result').mod({ r: rs.cc });
        if (rs.dd !== 'I AM DD') throw Error('Bad result').mod({ r: rs.dd });
        if (rs.ee !== 'I AM EE') throw Error('Bad result').mod({ r: rs.ee });
        
      }
      
      { // Test streaming (request tail stream first)
        
        let fp = testFp.kid('uuu');
        let fp1 = fp.kid('xxx');
        let fp2 = fp.kid('yyy');
        
        await trn.setData(fp1, 'HIYA BATMAN!');
        
        let [ ts, hs ] = await Promise.all([ trn.getDataTailStream(fp1), trn.getDataHeadStream(fp2) ]);
        ts.pipe(hs);
        
        await Promise.all([ ts.prm, hs.prm ]);
        
        let result = await trn.getData(fp2);
        if (result.toString() !== 'HIYA BATMAN!') throw Error(`Unexpected: "${result.toString()}"`);
        
      }
      
      { // Test streaming (request head stream first)
        
        let fp = testFp.kid('ilp');
        let fp1 = fp.kid('iii');
        let fp2 = fp.kid('ppp');
        
        await trn.setData(fp1, 'JAZZY TIMES on a SUNDAY');
        
        let [ hs, ts ] = await Promise.all([ trn.getDataHeadStream(fp2), trn.getDataTailStream(fp1) ]);
        ts.pipe(hs);
        
        await Promise.all([ ts.prm, hs.prm ]);
        
        let result = await trn.getData(fp2);
        if (result.toString() !== 'JAZZY TIMES on a SUNDAY') throw Error(`Unexpected: "${result.toString()}"`);
        
      }
      
      gsc(`Tests passed! (${((Date.now() - t) / 1000).toFixed(2)}s)`);
      
    } catch (err) {
      
      gsc('TESTS FAILED', err);
      
    } finally {
      
      await trn.remSubtree(testFp);
      gsc('Tests cleaned up.');
      
    }
    
  })();
  
}
