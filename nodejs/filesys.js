'use strict';

require('../room/setup/clearing/clearing.js');

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
    vals = vals.flat(Infinity);
    
    // Flatten into a flat list of Strings
    let nonStrCmp = vals.find(val => !isForm(val, String)).val;
    if (nonStrCmp) throw Error(`Api: all components must be String; got ${getFormName(nonStrCmp)}`).mod({ vals });
    
    vals = vals
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
    denumerate(this, 'path');
    
  },
  desc() { return [ '', '[file]', ...this.cmps ].join('/'); },
  
  count() { return this.cmps.length; },
  kid(...fp) { return Filepath([ this.cmps, fp ]); },
  sib(cmp) { return Filepath([ this.cmps.slice(0, -1), cmp ]); },
  par(n=1) { return (n <= 0) ? this : Filepath(this.cmps.slice(0, -n)); },
  contains(fp) { return this.cmps.length  <= fp.cmps.length && this.cmps.every((v, i) => fp.cmps[i] === v); },
  equals(fp)   { return this.cmps.length === fp.cmps.length && this.cmps.every((v, i) => fp.cmps[i] === v); },
  fsp() { // "file system pointer"
    
    if (!this.fspVal) {
      let fspVal = this.path.resolve('/', ...this.cmps);
      /// {DEBUG=
      if (!/^([A-Z]+[:])?[/\\]/.test(fspVal)) throw Error(`${this.desc()} path doesn't start with optional drive indicator (e.g. "C:") followed by "/" or "\\"`).mod({ fsp: fspVal });
      /// =DEBUG}
      this.fspVal = fspVal;
    }
    return this.fspVal;
    
  },
  * getLineage(fp) {
    
    // Yield every Filepath from `this` up to (excluding) `fp`
    if (!this.contains(fp)) throw Error('Provided Filepath isn\'t a child');
    
    let ptr = this;
    while (!ptr.equals(fp)) {
      yield ptr;
      ptr = ptr.kid(fp.cmps[ptr.count()]);
    }
    
  }
  
})});

let FilesysTransaction = form({ name: 'FilesysTransaction', has: { Tmp }, props: (forms, Form) => ({
  
  init(fp=[]) {
    
    forms.Tmp.init.call(this);
    Object.assign(this, {
      fp: isForm(fp, Filepath) ? fp : Filepath(fp),
      locks: Set()
    });
    denumerate(this, 'locks');
    
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
  async xSwapLeafToNode(fp, { tmpCmp=`~${getUid()}` }={}) {
    
    // We want a dir to replace an existing file (without reads on
    // that previously existing file to fail) - so we replace the
    // file with a directory containing a "default value file"
    
    // Basically we know that `fp` is a leaf, and we want it to become
    // a node, with `fp.kid('~')` holding the value previously at `fp`
    
    let fsp = fp.fsp();                // Path to original file
    let tmpFsp = fp.sib(tmpCmp).fsp(); // Path to temporary file (sibling of original file)
    let valFsp = fp.kid('~').fsp();    // Path to final file
    
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
    
    if (collTypeKey === 'subtreeWrite/subtreeWrite') {
      
      return lock0.fp.contains(lock1.fp) || lock1.fp.contains(lock0.fp);
      
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
    
    // Wait for all collisions to resolve...
    let uid = getUid();
    await Promise.all(collLocks.map(lk => lk.prm)); // Won't reject because it's a Promise.all over Locks, and no `Lock(...).prm` ever rejects!
    
    // We now own the locked context!
    try           { return await fn(); }
    catch (cause) { throw err.mod({ cause, msg: `Failed locked op: "${name}"` }); }
    finally       { for (let lock of locks) lock.prm.resolve(); } // Force any remaining Locks to resolve
    
  },
  async transact({ name='?', fp, fn }) {
    
    // Maybe functions can pass in a whole bunch of initial locks with
    // various bounding - the caller can end these locks whenever they
    // see fit (and `doLocked` can simply remove entries from
    // `this.locks` when the corresponding resolves - not just at the
    // end of the function!!)
    
    this.checkFp(fp);
    
    let lineageLocks = this.fp.getLineage(fp).toArr(fp => ({ type: 'nodeWrite', fp }));
    let nodeLock = { type: 'subtreeWrite', fp };
    
    return this.doLocked({ name: `trn/${name}`, locks: [ ...lineageLocks, nodeLock ], fn: async () => {
      
      // Ensure all lineage items exist as Nodes, and resolve each
      // lineage lock after the Node is created
      for (let { fp, prm } of lineageLocks) {
        
        let type = await this.xGetType(fp);
        if (type === null)        await fs.mkdir(fp.fsp());
        else if (type === 'leaf') await this.xSwapLeafToNode(fp);
        
        prm.resolve();
        
      }
      
      let trn = FilesysTransaction(fp);
      let result = null;
      try { result = await fn(trn); } finally { trn.end(); }
      return result;
      
    }});
    
  },
  kid(fp) {
    
    if (!isForm(fp, Filepath)) fp = Filepath(fp);
    
    let kidPrm = Promise.later();
    this.transact({ name: 'kid', fp, fn: trn => {
      
      kidPrm.resolve(trn);
      
      let trnDonePrm = Promise.later();
      trn.endWith(() => trnDonePrm.resolve());
      return trnDonePrm;
      
    }});
    
    return kidPrm;
    
  },
  
  async getType(fp) {
    
    this.checkFp(fp);
    
    return this.doLocked({ name: 'getType', locks: [{ type: 'nodeRead', fp }], fn: () => this.xGetType(fp) });
    
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
          catch (err) { if (err.code !== 'ENOENT') throw err; }
        }
        
        // For nodes try to unlink the "~" child
        if (type === 'node') {
          try         { await fs.unlink(fp.kid('~').fsp()); }
          catch (err) { if (err.code !== 'ENOENT') throw err; }
        }
        
      }});
      
    } else {
      // Setting a non-zero amount of data requires ensuring that all
      // ancestor nodes exist and finally writing the data
      
      let lineageLocks = this.fp.getLineage(fp).toArr(fp => ({ type: 'nodeWrite', fp }));
      let nodeLock = { type: 'nodeWrite', fp };
      
      return this.doLocked({ name: 'setData', locks: [ ...lineageLocks, nodeLock ], fn: async () => {
        
        let type = await this.xGetType(fp);
        
        if (type === null) {
          
          // Ensure lineage; once this loop is over we know `fp.par()`
          // certainly exists, and `fp` itself doesn't
          for (let { fp, prm } of lineageLocks) {
            
            let type = await this.xGetType(fp);
            if (type === null)        await fs.mkdir(fp.fsp());
            else if (type === 'leaf') await this.xSwapLeafToNode(fp);
            
            prm.resolve();
            
          }
          await fs.writeFile(fp.fsp(), data);
          
        } else {
          
          // `fp` is pre-existing! immediately resolve all lineage locks
          // and simply write to either the plain file or "~" kid
          for (let { prm } of lineageLocks) prm.resolve();
          if (type === 'node') fp = fp.kid('~');
          await fs.writeFile(fp.fsp(), data);
          
        }
        
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
    
    let lineageLocks = this.fp.getLineage(fp).toArr(fp => ({ type: 'nodeWrite', fp }));
    let nodeLock = { type: 'nodeWrite', fp };
    let prm = this.doLocked({ name: 'getHeadStream', locks: [ ...lineageLocks, nodeLock ], fn: async () => {
      
      // Ensure lineage
      for (let { fp, prm } of lineageLocks) {
        
        let type = await this.xGetType(fp);
        if (type === null)        await fs.mkdir(fp.fsp());
        else if (type === 'leaf') await this.xSwapLeafToNode(fp);
        
        prm.resolve();
        
      }
      
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
      
      try         { let names = await fs.readdir(fp.fsp()); names.rem('~'); return names; }
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
  async iterateNode(fp, { map=v=>v, bufferSize=150 }={}) {
    
    this.checkFp(fp);
    
    let itPrm = Promise.later();
    
    let prm = this.doLocked({ name: 'iterateNode', locks: [{ type: 'nodeRead', fp }], fn: async () => {
      
      let dir;
      try         { dir = await fs.opendir(fp.fsp(), { bufferSize }); }
      catch (err) { if (err.code !== 'ENOENT') return itPrm.reject(err); } // Note that `prm` still succeeds in this case!
      
      if (!dir) return itPrm.resolve({
        async* [Symbol.asyncIterator]() { itCompletePrm.resolve(); }, // No yields, just completion
        async close() { itCompletePrm.resolve(); }
      });
      
      // A dir exists and needs to be iterated; don't resolve `doLocked`
      // until the iterator is exhausted or closed!
      let itCompletePrm = Promise.later();
      itPrm.resolve({
        [Symbol.asyncIterator]: async function*() {
          for await (let ent of dir) {
            if (ent.name === '~') continue;
            ent = map(ent.name);
            if (ent !== skip) yield ent;
          }
          itCompletePrm.resolve();
        },
        close: async () => {
          try         { await Promise((rsv, rjc) => dir.close(err => err ? rjc(err) : rsv())); }
          catch (err) { if (err.code !== 'ERR_DIR_CLOSED') return itCompletePrm.reject(err); }
          itCompletePrm.resolve();
        }
      });
      await itCompletePrm;
      
    }});
    
    return itPrm.then(it => Object.assign(it, { prm }));
    
  }
  
})});

let FsKeep = form({ name: 'FsKeep', has: { Keep }, props: (forms, Form) => ({
  
  // - Assume content-type from "file extension"
  // - Zero-length content results in `null` (instead of empty Buffer)
  // - Handle json encoding
  
  $honeypotKeep: form({ name: 'HoneypotKeep', has: { Keep }, props: (forms, Form) => ({
    
    $honey: [ 'passwords', 'keys', 'tokens', 'secrets', 'credentials', 'bitcoin', 'wallet', 'vault', 'config' ],
    
    init(){},
    
    desc() { return getFormName(this); },
    access() { return this; },
    exists() { return true; },
    getContent() {
      
      let rand = a => a[Math.floor(Math.random() * a.length)];
      
      let username = '';
      let bits1 = 'do,re,mi,fa,so,la,ti,do'.split(',');
      let bits2 = 'do,al,er,al,op,up,me,ba'.split(',');
      for (let n of 2) username += rand(bits1) + rand(bits2);
      
      let password = '';
      while (password.length < 12) password += rand('abcdefghijklmnopqrstuvwxyz0123456789~!@#$%^&*()_+-={}[];:');
      return valToJson({ username, password, directory: Form.honey });
      
    },
    getContentByteLength() { return Buffer.bytelength(this.getContent()); },
    streamable() { return true; },
    getHeadPipe() { return {}; }, // TODO: Mock this
    getTailPipe() { return ({ pipe: writable => writable.end(this.getContent()) }); }
    
  })})(),
  $extToContentType: {
    json: 'text/json; charset=utf-8',
    html: 'text/html; charset=utf-8',
    css: 'text/css; charset=utf-8',
    txt: 'text/plain; charset=utf-8',
    ico: 'image/x-icon',
    png: 'image/png',
    jpg: 'image/jpeg',
    svg: 'image/svg+xml'
  },
  
  init(trn, fp, forbid=null) { Object.assign(this, { trn, fp, forbid }); },
  desc() { return this.fp.desc(); },
  access(names) {
    
    try {
      
      let fp = this.fp.kid(names);
      if (this.forbid && this.forbid.has(fp.cmps[this.fp.count()])) throw Error('Forbidden').mod({ fp: this.fp.desc(), cmp: fp.cmps[this.fp.count()] });
      
      let FsKeepForm = (0, this.Form);
      return FsKeepForm(this.trn, fp, null);
      
    } catch (err) {
      
      gsc('Couldn\'t access child keep', err);
      return Form.honeypotKeep();
      
    }
    
  },
  
  // Meta
  getContentType() {
    
    let lastCmp = this.fp.cmps.slice(-1)[0];
    let pcs = lastCmp.split('.');
    
    // If no "." the content type is unknown
    if (pcs.length < 2) return 'application/octet-stream';
    
    return Form.extToContentType[pcs.slice(-1)[0]] ?? 'application/octet-stream';
    
  },
  async getContentByteLength() { return this.trn.getDataBytes(this.fp); },
  async exists() { return (await this.getContentByteLength()) > 0; },
  
  // Content
  async getContent(opts={}) {
    
    if (isForm(opts, String)) opts = { encoding: opts };
    let { encoding=null } = opts ?? {};
    if (encoding === 'json') opts = { ...opts, encoding: null };
    
    let content = await this.trn.getData(this.fp, opts);
    if (!content.length) return null;
    
    if (encoding === 'json') return jsonToVal(content);
    
    return content;
    
  },
  async setContent(content, opts={}) {
    
    if (isForm(opts, String)) opts = { encoding: opts };
    let { encoding=null } = opts ?? {};
    if (encoding === 'json') opts = { ...opts, encoding: 'utf8' };
    
    if (encoding === 'json') content = valToJson(content);
    return this.trn.setData(this.fp, content, opts);
    
  },
  async rem() { return this.trn.remSubtree(this.fp); },
  
  // Tree
  contains(keep) { return hasForm(keep, Form) && this.fp.contains(keep.fp); },
  equals(keep) { return hasForm(keep, Form) && this.fp.equals(keep.fp); },
  async getChildNames(opts={}) {
    let names = await this.trn.getKidNames(this.fp);
    return this.forbid
      ? names.filter(name => !this.forbid.has(name))
      : names;
  },
  async streamable() { return (await this.trn.getType(this.fp)) === 'leaf'; },
  async getHeadPipe() { return this.trn.getDataHeadStream(this.fp); },
  async getTailPipe() { return this.trn.getDataTailStream(this.fp); },
  iterateChildren(dbg=Function.stub) {
    
    // Returns { [Symbol.asyncIterator]: fn, close: fn }
    return this.trn.iterateNode(this.fp, { map: n => this.blacklist.has(n) ? skip : [ n, this.access(n) ] });
    
  }
  
})});

module.exports = {
  Filepath,
  FilesysTransaction,
  FsKeep,
  rootTransaction: FilesysTransaction([]),
  runTests: async ({ sanityMult=1 }={}) => {
    
    let testFp = Filepath(__dirname).par(1).kid([ 'mill', 'mud' ]);
    let trn = FilesysTransaction(testFp);
    let sanitySize = Math.round(300 * sanityMult);
    if (sanitySize < 3) throw Error(`Sanity mult is too low`);
    
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
        
        for (let n of sanitySize) {
          
          let results = [];
          await Promise.all([
            trn.setData(testFp, 'hihihi'),
            trn.remSubtree(testFp),
            trn.getData(testFp, 'utf8').then(v => results.add(v))
          ]);
          
          if (results.find(r => r.length).found) throw Error('All results should be 0-length');
          
        }
        
        for (let n of sanitySize) {
          
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
          
          await Promise.all((sanitySize).toArr(v => [
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
        await Promise.all((sanitySize).toArr(async v => {
          
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
        
        let r;
        
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
      
    } catch (err) {
      
      gsc('TESTS FAILED', err.desc());
      
    } finally {
      
      await trn.remSubtree(testFp);
      
    }
    
  }
};

