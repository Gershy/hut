'use strict';

// SUB-TXN ROOT NODE CREATION
// For sub-txns, the root node of the sub-txn *must be created by the parent txn*. When the sub-txn
// needs to use its root node, it isn't able to "somehow retroactively ask its par to create its
// root node" in the case that the node doesn't already exist. This probably means that when a txn
// ends, we should try to clean any empty nodes  leading up to its root. The big downside is that
// when a process ends unexpectedly, a trail of empty directories may have already been created

// Additional goals:
// - Paradigm for "direct" and "arbitrary" naming" (names provided are legal filesystem handles, vs
//   names may consist of a wider charset, and will be uniquely transformed to legal handles)
// - IPC streaming; single Filesys process is responsible for a directory tree
// - Volatility safety - write tx ops to blob before performing ops then delete blob

// "fp" - "file pointer"; String used for OS-level file resolution
// "fd" - "file dive"; sanitized Array of Strings representing file traversal

require('../room/setup/clearing/clearing.js');

let nodejs = (() => {
  
  let { path, fs } = [ 'path', 'fs' ].toObj(t => [ t, require(`node:${t}`) ]);
  let traceableFsFns = { ...fs.promises, ...fs.slice([ 'createReadStream', 'createWriteStream' ]) };
  
  return {
    
    path,
    fs: traceableFsFns.map((fn, name) => {
      
      // Wrap `fn` using `global.safe` so that a traceable error is thrown if `fn` fails
      
      let err = Error();
      return (...args) => safe(
        () => fn(...args),
        cause => err.propagate({ cause, msg: `Failed nodejs.${name}(...args)`, args })
      );
      
    })
    
  };
  
})();

let FsTxn = form({ name: 'FsTxn', props: (forms, Form) => ({
  
  // OPS
  // Note the "x" prefix implies unlocked, unverified operations
  // Note these "x" ops take FsKeeps, and resolve them to their "fp" using `fd.p()`
  
  $xSafeStat: async keep => {
    
    // Note that on windows, `fs.stat` tends to only fail on missing entities with "ENOENT". On
    // posix trying to `fs.stat` anything nested under a file fails with "ENOTDIR" instead! So
    // both error codes basically indicate "entity non-existence".
    
    try         { return await fs.stat(keep.fp()); }
    catch (err) { if (![ 'ENOENT', 'ENOTDIR' ].has(err.code)) throw err; }
    return null;
    
  },
  $xGetType: async fk => {
    
    let stat = await Form.xSafeStat(fk);
    if (stat === null)      return null;
    if (stat.isFile())      return 'leaf';
    if (stat.isDirectory()) return 'node';
    
    throw Error('Api: unexpected filesystem entity').mod({ stat });
    
  },
  $xSwapLeafToNode: async (fk, { tmpCmp=`~${getUid()}` }={}) => {
    
    // We want a dir to replace an existing file (without reads on
    // that previously existing file to fail) - so we replace the
    // file with a directory containing a "default value file"
    
    // Basically we know that `fp` is a leaf, and we want it to become
    // a node, with `fp.kid('~')` holding the value previously at `fp`
    
    let fp = fk.fp();                // Path to original file
    let tmpFp = fk.sib(tmpCmp).fp(); // Path to temporary file (sibling of original file)
    let valFp = fk.kid('~').fp();    // Path to final file
    
    await fs.rename(fp, tmpFp);    // Move file out of the way
    await fs.mkdir(fp);            // Set directory where file used to be
    await fs.rename(tmpFp, valFp); // Set original file as "default value file"
    
  },
  $xEnsureNode: async (fk, firstGuaranteedPar=null) => {
    
    // Ensure nodes up to (but excluding) `fp`; overall ensures a leaf can be written at `fp`.
    
    // Use `fk.par()` because we don't want to create `fk`
    for (let ancestorFk of fk.par().lineage(firstGuaranteedPar)) {
      
      let type = await Form.xGetType(ancestorFk);
      
      // If nothing exists create dir; if file exists swap it to dir
      if      (type === null)   await fs.mkdir(ancestorFk.fp());
      else if (type === 'leaf') await Form.xSwapLeafToNode(ancestorFk);
      
    }
    
  },
  
  $root: async fd => {
    
    
    
  },
  
  init({ fd, path=nodejs.path }) {
    
    Object.assign(this, { fd, path });
    
  }
  
})});
let HereFsTxn = form({ name: 'HereFsTxn', has: { FsTxn }, props: (forms, Form) => ({
  
})});
let AfarFsTxn = form({ name: 'AfarFsTxn', has: { FsTxn },props: (forms, Form) => ({
  
})});

let FsKeep = form({ name: 'FsKeep', has: { Keep }, props: (forms, Form) => ({
  
  // FsKeeps understand Cmp traversal (e.g. "par", "sib", "kid"), and may also be connected to a
  // FsTxn; if connected, FsKeeps are able to perform data manipulation - otherwise, they are
  // limited to performing Cmp-traversal-related tasks
  
  // Finds non-alphanumerics other than "~", "_", "." and "-"
  $invalidCmpCharsRegex: /[^0-9a-z~_.-]/,
  $nativeCmpCharset: String.charset('~1234567890-qwertyuiopasdfghjklzxcvbnm_'),
  $strongCmpCharset: String.charset((256).toArr(n => n.char()).join('')),
  $reservedWin32Cmps: Set([
    'con', 'conin$', 'conout$', 'prn', 'aux', 'clock$', 'null',
    ...(9).toArr(v => `com${v}`),
    ...(9).toArr(v => `lpt${v}`),
    'lst', 'keybd$', 'screen$', '$idle$', 'config$'
  ]),
  
  $resolveCmp: (cmp, { allowWin32Drive=false, mode='native' }={}) => {
    
    if (isForm(cmp, Object)) {
      if      (cmp.sg) { mode = 'strong'; cmp = cmp.sg.encodeInt(Form.strongCmpCharset).encodeStr(Form.nativeCmpCharset); }
      else if (cmp.nt) { mode = 'native'; cmp = cmp.nt; }
      else             throw Error('Api: failed to resolve Cmp').mod({ cmp });
    }
    
    if (!isForm(cmp, String)) throw Error('Api: failed to resolve Cmp').mod({ cmp });
    
    // Win32 restriction: Cmps are always considered in lowercase
    cmp = cmp.lower();
    
    // Allow drive indicators as the first item
    if (allowWin32Drive && /^[a-z]:$/.test(cmp)) return cmp.lower();
    
    // We can tolerate invalid win32 Cmps, in "strong" mode, by deconflicting them by prepending
    // "~", which allows windows to tolerate them, while "strong" interpretation is unaffected
    let isWin32Reserved = Form.reservedWin32Cmps.has(cmp);
    if (isWin32Reserved && mode === 'strong') {
      cmp = `~${cmp}`; // Prefixing with "~" can always be done in "strong" mode
      isWin32Reserved = false;
    }
    
    let invalidNativeCmp = false
      || isWin32Reserved
      || (cmp[0] === '.' && /^[.]+$/.test(cmp)) // `cmp` is composed entirely of "."
      || Form.invalidCmpCharsRegex.test(cmp);   // `cmp` has invalid characters
    if (invalidNativeCmp) throw Error('Api: invalid Cmp; unable to use it in filesystem').mod({ cmp });
    
    return cmp;
    
  },
  $resolveFd: (fd, { path=nodejs.path, mode='native' }={}) => {
    
    let nativeCmps = fd.map((cmp, i) => Form.resolveCmp(cmp, { allowWin32Drive: i === 0, mode }));
      
    let fp = path.resolve('/', ...nativeCmps).replaceAll('\\', '/');
    if (path === nodejs.path.win32) {
      
      // Ensure drive component exists
      if    (fp[0] === '/') fp = `c:${fp}`;
      
      // Ensure drive component is lowercase
      fp = fp.slice(0, 'c:'.length).lower() + fp.slice('c:'.length);
      
    }
    
    return { fp, fdnt: fp.split('/').filter(Boolean) };
    
  },
  $fromFp: (fp, { path=nodejs.path, ...conf }={}) => {
    
    // Note that this is the best way of gaining access to a root FsKeep, but untrusted data should
    // never be sent to this function - e.g. directory traversal using ".." is allowed!
    
    let fd = path.resolve('/', fp).split(/[/\\]/).map(cmp => cmp.lower().trim() || skip);
    return FsKeep({ ...conf, fd, path });
    
  },
  
  init({ txn=null, fd, mode='native', path=nodejs.path }={}) {
    
    // `fd` can look like:
    // [ 'C:', 'a', 'b', 'c', 'd' ]                     -> 'C:/a/b/c/d'
    // [ 'a', 'b', 'c', 'd' ]                           -> '/a/b/c/d'
    // [ 'C:', { nt: 'x' }, { nt: 'y' }, { nt: 'z' } ]  -> 'C:/x/y/z'
    // [ 'C:', { sg: '/$+'}, { sg: '.....' } ]          -> 'C:/????/????'
    
    if (![ 'native', 'strong' ].has(mode)) throw Error('Api: "mode" invalid').mod({ mode });
    if (txn && !txn.contains(fd))          throw Error('Api: "fd" outside of "txn"').mod({ txn, fd });
    
    Object.assign(this, { txn, fd, fpnt: null, mode, path });
    denumerate(this, 'path');
    
    this.fp();
    
  },
  kid(...args) {
    
    if (args.length > 3) throw Error('Api: max 2 args').mod({ args });
    
    let pattern = args.map(arg => {
      if (isForm(arg, Object)) return 'o';
      if (isForm(arg, Array)) return 'a';
      throw Error('Api: invalid arg').mod({ arg });
    }).join('');
    
    let validPatterns = [ 'a', 'o', 'ao', 'oa', 'oao' ];
    if (!validPatterns.has(pattern)) throw Error('Api: invalid arg combination').mod({ validPatterns, pattern });
    
    let headConf = pattern.hasHead('o') ? args.at( 0) : {};
    let tailConf = pattern.hasTail('o') ? args.at(-1) : {};
    let cmps = args.find(v => isForm(v, Array));
    
    let modePre = headConf.at('mode', this.mode);
    let modePost = tailConf.at('mode', modePre);
    if (modePre === 'strong') {
      if (cmps.some(cmp => !isForm(cmp, String))) throw Error('Api: all Cmps must be Strings using "strong" mode').mod({ cmps });
      cmps = cmps.map(sg => ({ sg }));
    }
    
    return FsKeep({ txn: this.txn, fd: [ ...this.fd, ...cmps ], mode: modePost, path: this.path });
    
  },
  par(num=1) {
    if (num < 1) throw Error('Api: invalid "num"').mod({ num });
    return FsKeep({ fd: this.fd.slice(0, -num), mode: 'native' });
  },
  fp() {
    if (!this.fpnt) this.fpnt = Form.resolveFd(this.fd, { path: this.path }).fp;
    return this.fpnt;
  },
  desc() { let fp = this.fp(); return `/[file]${fp.hasHead('/') ? '' : '/'}${fp}`; },
  
  * lineage(givenPar=null) {
    
    // Does *not* yield the root item! (Intuit the value of this considering "ensureNode"; we don't
    // ever want to check/create the root item. For sub-txns, we don't want to check/create the
    // sub-txn root node (guaranteed to have already been created)
    
    let pfxCmps = givenPar ? this.fd.slice(0, givenPar.fd.length) : [];
    let lineageCmps = pfxCmps.length ? this.fd.slice(pfxCmps.length) : this.fd;
    
    for (let cmp of lineageCmps) {
      pfxCmps.push(cmp);
      yield FsKeep({ fd: [ ...pfxCmps ] });
    }
    
  }
  
})});

let runTests = true;
if (runTests) (async () => {
  
  require('./util/installV8PrepareStackTrace.js')();
  
  global.formatAnyValue = require('./util/formatAnyValue.js');
  
  let getStdoutSubcon = require('./util/getStdoutSubconOutputter.js');
  global.subconOutput = getStdoutSubcon({
    debug: true,           // Results in expensive stack traces - could be based on conf??
    relevantTraceIndex: 2, // Hardcoded value; determined simply by testing
    leftColW: 30,
    rightColW: 80
  });
  
  gsc('Filesys tests...');
  
  let shouldFail = fn => {
    
    try {
      let val = fn();
      if (isForm(val, Promise)) return val.then(
        () => Promise.reject(Error('Should have failed')),
        err => err
      );
      throw Error('Should have failed').mod({ fn, val });
    } catch (err) {
      return err;
    }
    
  };
  
  let tests = [
    
    async () => { // FsKeep.fromFp interpretation
      
      let tests = [
        
        [ nodejs.path.win32, '/a/b/c',   'c:/a/b/c' ],
        [ nodejs.path.win32, '///a/b/c', 'c:/a/b/c' ],
        [ nodejs.path.win32, '//a//b/c', 'c:/a/b/c' ],
        [ nodejs.path.win32, 'c:/a/b/c', 'c:/a/b/c' ],
        [ nodejs.path.win32, 'C:/a/b/c', 'c:/a/b/c' ],
        
        [ nodejs.path.posix, '/a/b/c',   '/a/b/c' ],
        [ nodejs.path.posix, '///a/b/c', '/a/b/c' ],
        [ nodejs.path.posix, '//a//b/c', '/a/b/c' ],
        [ nodejs.path.posix, 'c:/a/b/c', '/c:/a/b/c' ],
        [ nodejs.path.posix, 'C:/a/b/c', '/c:/a/b/c' ]
        
      ];
      
      for (let [ path, fd, expect ] of tests) {
        let p = path.toArr((v, k) => ({ k, v })).find(entry => entry.v === path).k;
        let keep = FsKeep.fromFp(fd, { path });
        if (keep.fp() !== expect) throw Error('Failed').mod({ fd, path: p, expect, result: keep.fp() });
      }
      
    },
    
    async () => { // FsKeep.kid(...) simple test
      
      let keep = FsKeep.fromFp('/test', { path: nodejs.path.win32 });
      let kid = keep.kid([ 'a' ]);
      if (kid.fp() !== 'c:/test/a') throw Error('Failed');
      
    },
    async () => { // FsKeep.kid(...) ensure posix is comparable to win32
      
      // This one really just makes sure that posix tests line up predictably with win32 tests; all
      // further tests use win32 (TODO: this is probably lazy/risky??)
      
      let keep = FsKeep.fromFp('/test', { path: nodejs.path.posix });
      let kid = keep.kid([ 'a' ]);
      if (kid.fp() !== '/test/a') throw Error('Failed').mod({ kid });
      
    },
    async () => { // FsKeep.kid(...) invalid native Cmp
      
      let keep = FsKeep.fromFp('/test', { path: nodejs.path.win32 });
      let err = shouldFail(() => keep.kid([ '^^' ]));
      if (!err.message.hasHead('Api: invalid Cmp;')) throw Error('Failed').mod({ cause: err });
      
    },
    async () => { // FsKeep.kid(...) strong cmp using { sg: '...' }
      
      let keep = FsKeep.fromFp('/test', { path: nodejs.path.win32 });
      let kid = keep.kid([ { sg: '^^' } ]);
      if (kid.fp() !== 'c:/test/rvy') throw Error('Failed').mod({ kid });
      
    },
    async () => { // FsKeep.kid(...) strong mode via { sg: '...' } doesn't propagate to Kids
      
      let keep = FsKeep.fromFp('/test', { path: nodejs.path.win32 });
      let kid = keep.kid([ { sg: '^^' } ]);
      
      if (kid.mode !== 'native') throw Error('Failed');
      
      let err = shouldFail(() => kid.kid([ '^^' ]));
      if (!err.message.hasHead('Api: invalid Cmp;')) throw Error('Failed').mod({ cause: err });
      
    },
    
    async () => { // FsKeep.kid(...) native mode permits { sg: '...' }
      
      let keep = FsKeep.fromFp('/test', { path: nodejs.path.win32 });
      let kid = keep.kid({ mode: 'native' }, [ { sg: '^^' } ]);
      
      if (kid.mode !== 'native') throw Error('Failed');
      
      let err = shouldFail(() => kid.kid([ '^^' ]));
      if (!err.message.hasHead('Api: invalid Cmp;')) throw Error('Failed').mod({ cause: err });
      
    },
    
    async () => { // FsKeep.kid(...) invalid strong/native mode pattern fails
      
      let keep = FsKeep.fromFp('/test', { path: nodejs.path.win32 });
      let err = shouldFail(() => keep.kid({ mode: 'strong' }, { mode: 'native' }));
      
      if (!err.message.hasHead('Api: invalid arg combination')) throw Error('Failed').mod({ cause: err });
      
    },
    
    async () => { // FsKeep.kid(...) strong mode cannot combine with { sg: '...' }
      
      let keep = FsKeep.fromFp('/test', { path: nodejs.path.win32 });
      let err = shouldFail(() => keep.kid({ mode: 'strong' }, [ { sg: '^^' } ]));
      
      if (!err.message.hasHead('Api: all Cmps must be Strings using "strong" mode')) throw Error('Failed').mod({ cause: err });
      
    },
    
    async () => {
      
      // let keep2 = keep1.kid([ { sg: 'hi' }, { sg: 'hi' } ], { mode: 'strong' });
      // let keep3 = keep2.kid([ '???' ]);
      // let keep4 = keep3.kid({ mode: 'native' }, [ 'abc' ]);
      
      //gsc({ keep1, keep2, keep3, keep4, lin: [ ...keep4.lineage(keep2) ] });
      //await keep.ready;
      
      // `testKeep` is looked up natively (dir is literally named "test"); `testKeep`, though, is
      // let testKeep = keep.kid([ { sg: 'test' } ], { mode: 'strong' });
      // "strong", so any Kids under it are looked up strongly
      
      //let f1Keep = testKeep.kid([ sg`/&*(` ]);
      //await f1Keep.setValue({ a: 1, b: 2 });
      
      //let val = await f1Keep.getValue({ a: 1, b: 2 });
      //gsc({ keep, testKeep, f1Keep, val });
      
    }
    
  ];
  
  for (let test of tests) {
    
    let desc = (test.toString().cut('\n', 1)[0].cut('//', 1)[1] || '<anon test>').trim();
    gsc(`Running ${desc}`);
    await test();
    
  }
  
  gsc('Tests complete');
  
})()
  .catch(err => gsc(err.desc()))
  .then(() => process.exit(0));