'use strict';

require('../clearing.js');

let validComponentRegex = /^[a-zA-Z0-9!@][-a-zA-Z0-9!@._ ]*$/; // alphanum!@ followed by the same including ".", "-" (careful this guy in regexes), "_", and " "
let getUid = () => (Number.int32 * Math.random()).encodeStr(String.base32, 7);
let globalLocks = Object.plain();

let fs = (fs => ({
  ...fs.promises,
  ...fs.slice([ 'createReadStream', 'createWriteStream' ])
}))(require('fs')).map((fn, name) => {
  return (...args) => {
    let err = Error('hi');
    //if (name === 'mkdir') gsc('HEREEE', args);
    return then(
      fn(...args),
      v => { return v; },
      ctxErr => err.propagate({ ctxErr, code: ctxErr.code, msg: `Failed low-level ${name} on "${args[0]}"` })
    );
  };
});

let Filepath = form({ name: 'Filepath', props: (forms, Form) => ({
  
  $filteredComponentRegex: /^[.~]+$/, // Remove components composed purely of "." and "~"
  
  init(vals, path=require('path')) {
    
    if (!isForm(vals, Array)) vals = [ vals ];
    
    vals = vals
      .flat(Infinity)                  // Flatten all fps into a flat list of Strings
      .map(cmp => cmp.split(/[/\\]+/)) // Each String is broken into its components
      .flat(1)                         // Finally flatten into flat list of components
      
      // And remove any disallowed components
      .map(cmp => Form.filteredComponentRegex.test(cmp) ? skip : cmp);
    
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
      locks: Object.plain()
    });
    
  },
  desc() { return `getFormName(this) @ ${this.fp.desc()}`; },
  
  // "x" implies these should be surrounded by "doLocked", and should be
  // preceded by a check that `fp` is in our jurisdiction
  async xGetType(fp) {
    
    let stat = null;
    try         { stat = await fs.stat(fp.fsp()); }
    catch (err) { if (err.code !== 'ENOENT') throw err; }
    
    if (stat === null)      return null;
    if (stat.isFile())      return 'leaf';
    if (stat.isDirectory()) return 'node';
    
    throw Error(`Unexpected filesystem entity`).mod({ stat });
    
  },
  async swapLeafToNode(fp, { tmpCmp=`~${getUid()}`, valCmp='~' }={}) {
    
    // We want a dir to replace an existing file (without reads on
    // that previously existing file to fail) - so we replace the
    // file with a directory containing a "default value file"
    
    let fsp = fp.fsp();                       // Path to original file
    let tmpFsp = fp.par(1).kid(tmpCmp).fsp(); // Path to temporary file
    let valFsp = fp.kid(valCmp).fsp();        // Path to final file
    
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
      //if      (type === null)   try { await fs.mkdir(ptr.fsp()); } catch (err) { gsc('DAMNNN', ptr.fsp(), await fs.stat(ptr.fsp())); throw err; }
      else if (type === 'leaf') await this.swapLeafToNode(ptr);
      
      ptr = ptr.kid(fp.cmps[ptr.count()]);
      
    }
    
  },
  
  async doLocked({ name='?', locks=[], fp, fn }) {
    
    let err = Error('');
    let opLock = { fp, name, prm: Promise.later() };
    
    if (!isForm(fp, Filepath)) fp = Filepath(fp);
    if (!this.fp.contains(fp)) throw Error(`Fp ${fp.desc()} is outside ${this.desc()}`);
    
    let collidingPrms = [];
    for (let name in this.locks) {
      let lock = this.locks[name];
      let doesCollide = fp.contains(lock.fp) || lock.fp.contains(fp);
      if (doesCollide) collidingPrms.push(lock.prm);
    }
    
    // We've got our "prereq" Promise - now add a new Lock so any new
    // actions are blocked until `fn` completes
    mmm('filesysLock', +1);
    let uid = getUid();
    this.locks[uid] = opLock; // Note `prm` resolves if the operation succeeds or fails
    
    // Wait for all collisions to dissipate...
    await Promise.all(collidingPrms); // Won't reject because it's a Promise.all over Locks, and no `Lock(...).prm` ever rejects!
    
    // We're in the clear!
    try            { return await fn(fp, uid); }
    catch (ctxErr) { throw err.mod({ ctxErr, msg: `Failed locked op: "${name}"` }); }
    finally        { opLock.prm.resolve(); delete this.locks[uid]; mmm('filesysLock', -1); }
    
  },
  async transact({ name='?', fp, fn }) {
    
    // TODO: We're almost there!!!! Just need more nuance when looking
    // for lock collisions. E.g., should be able to do anything to
    // ancestor directories of a TRN except for delete them! So if e.g.
    // a "read dir" op is waiting on a `transact` call (the read dir is
    // occurring on one of the child directories of the TRN produced by
    // `transact`), readdir should be unlocked the node ensurance has
    // completed, but *BEFORE* the transaction comes into play! I think
    // there should be two separate locks; one has to lock all ancestors
    // of `fp` e.g. { collide: 'ancestry', blacklist: 'rem' }: this
    // says we only have to worry about colliding with this lock if we
    // overlap on one of the ancestor directories, and if *do* overlap
    // we only have to worry if our intention is to *rem* (any other
    // intention - i.e. *get*, *set*, etc doesn't clash!)
    // I'm not exactly sure why Hut doesn't run at the moment; it def
    // has to do with piping to log files (which creates persistent
    // locks in the transaction).
    
    // In a case like this it may be necessary to compose a *full* lock
    // that covers all cases as the TRN is in creation, along with the
    // more relaxed lock. Then when the TRN has gotten to a more relaxed
    // stage the stricter lock can be removed!
    
    // Maybe functions can pass in a whole bunch of initial locks with
    // various bounding - the caller can end these locks whenever they
    // see fit (and `doLocked` can simply remove entries from
    // `this.locks` when the corresponding resolves - not just at the
    // end of the function!!)
    
    return this.doLocked({ name: `trn/${name}`, fp, fn: async (fp, uid) => {
      
      await this.xEnsureNode(fp);
      let trn = (0, this.Form)(fp);
      return fn(fp, uid, trn);
      
    }});
    
  },
  
  async getType(fp) { return this.doLocked({ name: 'getType', fp, fn: async fp => {
    
    let stat = null;
    try         { stat = await fs.stat(fp.fsp()); }
    catch (err) { if (err.code !== 'ENOENT') throw err; }
    
    if (stat === null)      return null;
    if (stat.isDirectory()) return 'node';
    if (stat.isFile())      return 'leaf';
    
    throw Error(`Unexpected filesystem item`).mod({ fp, stat });
    
  }})},
  async getLeafSize(fp) { return this.doLocked({ name: 'getLeaf', fp, fn: async fp => {
    
    let stat = null;
    try         { stat = await fs.stat(fp.fsp()); }
    catch (err) {}
    
    if (stat === null) return 0;
    if (stat.isFile()) return stat.size;
    if (!stat.isDirectory()) throw Error(`Unexpected fs entity`).mod({ stat });
    
    // Try to read the "~" item; any error results in 0 size
    try { stat = await fs.stat(fp.kid('~').fsp()); return stat.size; }
    catch (err) { return 0; }
    
  }})},
  async setLeaf(fp, data) { return this.transact({ name: 'setLeaf', fp: this.fp, fn: async (rootFp, uid, trn) => {
    
    // Now we've locked the entire parent transaction; this means we are
    // able to create directories. We'll create directories
    
    // Need to use a transaction to guarantee the par node exists; note
    // this transaction has the same jurisdiction as its parent, so it
    // will block all other transactions on the parent as it completes!
    await trn.xEnsureNode(fp);
    await fs.writeFile(fp.fsp(), data);
    //await trn.doLocked({ name: 'setLeaf', fp, fn: fp => fs.writeFile(fp.fsp(), data) });
    
  }})},
  async getLeaf(fp, opts={}) { return this.doLocked({ name: 'getLeaf', fp, fn: async fp => {
    
    try         { return await fs.readFile(fp.fsp(), opts); }
    catch (err) {
      
      gsc('ERRR', err);
      process.exit(0);
      
      if (err.code === 'ENOENT') return Buffer.alloc(0);
      if (err.code === 'EISDIR') {
        
        // Ok the filesystem has a directory; try the "~" child of that
        // directory
        try         { return await fs.readFile(fp.kid('~').fsp(), opts); }
        catch (err) {
          if (err.code === 'ENOENT') return Buffer.alloc(0);
          throw err;
        }
        
      }
      
    }
    
  }})},
  async getLeafHeadStream(fp) {
    
    let streamPrm = Promise.later();
    
    let prm = this.doLocked({ name: 'getHS', fp, fn: async fp => {
      
      await this.xEnsureNode(fp);
      
      let stream = fs.createWriteStream(fp.fsp());
      streamPrm.resolve(stream);
      
      await Promise((rsv, rjc) => {
        stream.on('close', rsv);
        stream.on('error', rjc);
      });
      
    }});
    
    // Expose the `doLocked` Promise via a "prm" prop on the Stream
    return streamPrm.then(stream => Object.assign(stream, { prm }));
    
  },
  async getLeafTailStream(fp) {
    
    let streamPrm = Promise.later();
    
    let prm = this.doLocked({ name: 'getHS', fp, fn: async fp => {
      
      let stream = fs.createReadStream(fp.fsp());
      streamPrm.resolve(stream);
      
      await Promise((rsv, rjc) => {
        stream.on('close', rsv);
        stream.on('error', err => (err.code === 'ENOENT') ? rsv() : rjc(err));
      });
      
    }});
    
    // Expose the `doLocked` Promise via a "prm" prop on the Stream
    return streamPrm.then(stream => Object.assign(stream, { prm }));
    
  },
  
  async setNode(fp, data) { return this.doLocked({ name: 'setNode', fp, fn: async fp => {
    
    // TODO: I don't think this has a use-case!
    return this.xEnsureNode(fp);
    
  }})},
  async getNode(fp, data) { return this.doLocked({ name: 'getNode', fp, fn: async fp => {
    
    try         { return await fs.readdir(fp.fsp()); }
    catch (err) { if (err.code === 'ENOENT') return []; throw err; }
    
  }})},
  async remNode(fp) { return this.doLocked({ name: 'remNode', fp, fn: async fp => {
    
    try         { await fs.rm(fp.fsp(), { recursive: true, maxRetries: 0 }); }
    catch (err) { if (err.code !== 'ENOENT') throw err; }
    
  }})},
  async iterateNode(fp, { bufferSize=150 }={}) {
    
    let itPrm = Promise.later();
    
    let prm = this.doLocked({ name: 'itrNode', fp, fn: async fp => {
      
      let dir = null;
      try         { dir = await fs.opendir(fp.fsp(), { bufferSize }); }
      catch (err) { if (err !== 'ENOENT') { itPrm.reject(err); throw err; } }
      
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
    
    // Silence `prm` - Error will still propagate regardless of whether
    // `itPrm` succeeds or fails
    prm.fail(() => {});
    
    return itPrm
      .then(it => Object.assign(it, { prm }))
      .fail(err => Object.all([ itPrm, prm ])); // Failures 
    
  }
  
})});

module.exports = { Filepath, FilesysTransaction };

if (require.main === module) {
  
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
    
    [ win, '/a/..',         'C:\\a' ],
    [ win, '\\a\\..',       'C:\\a' ],
    [ win, '\\a/..',        'C:\\a' ],
    [ nix, '/a/..',         '/a' ],
    [ nix, '\\a\\..',       '/a' ],
    [ nix, '\\a/..',        '/a' ]
    
  ];
  
  let paths = { win: require('path').win32, nix: require('path').posix };
  for (let [ { name, path }, inp, exp ] of tests) {
    
    let fsp = Filepath(inp, path).fsp();
    if (fsp !== exp) throw Error(`Failed`).mod({ name, inp, exp, fsp });
    
  }
  
  (async () => {
    
    let testFp = Filepath(__dirname).par(2).kid('mill/mud');
    let trn = FilesysTransaction(testFp);
    
    try {
      
      // Check if a bunch of synchronously produced setLeaf/getLeaf events
      // occur in their synchronous order
      {
        
        let fp = testFp.kid('y', 'z');
        
        let results = [];
        
        await trn.transact({ fp, fn: async (fp, uid, trn) => {
          
          await Promise.all((50).toArr(v => [
            trn.setLeaf(fp, `(${v.toString(10).padHead(4, '0')})`),
            trn.getLeaf(fp).then(v => (results.add(v.toString('utf8')), v))
          ]).flat(1));
          
        }});
        
        for (let [ i, r ] of results.entries())
          if (r !== `(${i.toString().padHead(4, '0')})`) throw Error(`Unexpected result: "${r}" (out of order?)`);
        
      }
      
      {
        
        let fp = testFp.kid('u');
        
        let results = [];
        await Promise.all((50).toArr(async v => {
          
          let fp2 = fp.kid('2');
          await trn.transact({ fp: fp2, fn: async (fp, uid, trn) => {
            
            let fp3 = fp2.kid('3');
            await trn.transact({ fp: fp3, fn: async (fp, uid, trn) => {
              
              await Promise.all([
                trn.setLeaf(fp3, `hihi: ${v}`),
                trn.getLeaf(fp3).then(v => results.push(v.toString('utf8')))
              ]);
              
            }});
            
          }});
          
        }));
        
        for (let [ i, r ] of results.entries())
          if (r !== `hihi: ${i}`) throw Error(`Unexpected result: "${r}" (out of order?)`);
        
      }
      
      {
        
        let fp = testFp.kid('uuu');
        let fp1 = fp.kid('xxx');
        let fp2 = fp.kid('yyy');
        
        await trn.setLeaf(fp1, 'HIYA BATMAN!');
        
        let ts = await trn.getLeafTailStream(fp1);
        let hs = await trn.getLeafHeadStream(fp2);
        
        ts.pipe(hs);
        
        await Promise.all([ ts.prm, hs.prm ]);
        
        let result = await trn.getLeaf(fp2);
        if (result.toString() !== 'HIYA BATMAN!') throw Error(`Unexpected: "${result.toString()}"`);
        
      }
      
      gsc('Tests passed!');
      
    } catch (err) {
      
      gsc('TESTS FAILED', err);
      
    } finally {
      
      await trn.remNode(testFp);
      gsc('Tests cleaned up.');
      
    }
      
    
  })();
  
}
