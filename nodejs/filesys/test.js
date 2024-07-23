'use strict';

require('../util/setup.js');

let nodejs = require('./nodejs.js');
let FsKeep = require('./FsKeep.js');
let FsTxn = require('./FsTxn.js');
let sys = require('./system.js');

// Test utils
let cmpArrs = (arr1, arr2) => {
  if (arr1.length !== arr2.length) return false;
  for (let n of arr1.length) if (arr1[n] !== arr2[n]) return false;
  return true;
};
let shouldFail = fn => {
  
  let err = null;
  let val = null;
  try {
    val = fn();
    if (isForm(val, Promise)) return val.then(
      () => Promise.reject(Error('Should have failed')),
      err => err
    );
  } catch (err0) { err = err0; }
  
  if (!err) throw Error('Should have failed').mod({ fn, val });
  return err;
  
};
let inTmpDir = async (fn, { tmpUid=Math.random().toString(36).slice(2, 8) }={}) => {
  
  let { path, fs } = nodejs;
  
  let testFk = FsKeep.fromFp(path.join(__dirname, '..', 'mill', 'mud', tmpUid));
  
  try {
    await FsTxn.xEnsureLineage(testFk.par().lineage());
    await fn(testFk, { fs, path });
  } finally {
    await fs.rm(testFk.fp, { recursive: true, maxRetries: 5, retryDelay: 60 }).catch(e => {});
    await FsTxn.xRemEmptyNodes(testFk);
  }
  
};

// Test definitions
let testFilter = null;
let tests = [
  async () => { // FsKeep.fromFp interpretation
    
    let origWin32DefaultDrive = sys.win32DefaultDrive;
    sys.win32DefaultDrive = 'x:'; // Overwrite this for tests to allow detecting it getting prepended
    
    try {
      
      let tests = [
        
        [ nodejs.path.win32, '/a/b/c',   'x:/a/b/c' ],
        [ nodejs.path.win32, '///a/b/c', 'x:/a/b/c' ],
        [ nodejs.path.win32, '//a//b/c', 'x:/a/b/c' ],
        [ nodejs.path.win32, 'c:/a/b/c', 'c:/a/b/c' ],
        [ nodejs.path.win32, 'C:/a/b/c', 'c:/a/b/c' ],
        [ nodejs.path.win32, 'c:/',      'c:/' ],       // Note that "c:" alone is the *CWD* of the drive!! Not the rootttt!!! (So dumb.)
        [ nodejs.path.win32, 'C:/',      'c:/' ],       // Note that "c:" alone is the *CWD* of the drive!! Not the rootttt!!! (So dumb.)
        [ nodejs.path.win32, 'c:',       'c:/' ],       // Note that "c:" alone is the *CWD* of the drive!! Not the rootttt!!! (So dumb.)
        [ nodejs.path.win32, 'D:',       'd:/' ],       // Note that "c:" alone is the *CWD* of the drive!! Not the rootttt!!! (So dumb.)
        [ nodejs.path.win32, 'a/b/c',    Error('Api: invalid relative fp') ],
        [ nodejs.path.win32, '0:/a/b',   Error('Api: invalid relative fp') ],
        
        [ nodejs.path.posix, '/a/b/c',    '/a/b/c' ],
        [ nodejs.path.posix, '///a/b/c',  '/a/b/c' ],
        [ nodejs.path.posix, '//a//b/c',  '/a/b/c' ],
        [ nodejs.path.posix, '/c:/a/b/c', '/c:/a/b/c' ],
        [ nodejs.path.posix, '/C:/a/b/c', '/c:/a/b/c' ],
        [ nodejs.path.posix, '/c:/',      '/c:' ],
        [ nodejs.path.posix, '/D:',       '/d:' ],
        [ nodejs.path.posix, 'a/b/c',     Error('Api: invalid relative fp') ],
        [ nodejs.path.posix, '0:/a/b',    Error('Api: invalid relative fp') ],
        
      ];
      
      for (let [ path, fd, expect ] of tests) {
        
        let p = path.toArr((v, k) => ({ k, v })).find(entry => entry.v === path).k;
        
        if (isForm(expect, Error)) {
          
          let err = shouldFail(() => FsKeep.fromFp(fd, { path }));
          if (!err.message.hasHead(expect.message)) throw Error('Failed').mod({ cause: err });
          
        } else {
          
          let fk = FsKeep.fromFp(fd, { path });
          if (fk.fp !== expect) throw Error('Failed').mod({ fd, path: p, expect, result: fk.fp });
          
        }
        
      }
      
    } finally { sys.win32DefaultDrive = origWin32DefaultDrive; }
    
  },
  async () => { // FsKeep(...).kid(...) simple test
    
    let keep = FsKeep.fromFp('/test', { path: nodejs.path.win32 });
    let kid = keep.kid([ 'a' ]);
    if (kid.fp !== 'c:/test/a') throw Error('Failed').mod({ kid });
    
  },
  async () => { // FsKeep(...).kid(...) ensure posix is comparable to win32
    
    // This one really just makes sure that posix tests line up predictably with win32 tests; all
    // further tests use win32 (TODO: this is probably lazy/risky??)
    
    let keep = FsKeep.fromFp('/test', { path: nodejs.path.posix });
    let kid = keep.kid([ 'a' ]);
    if (kid.fp !== '/test/a') throw Error('Failed').mod({ kid });
    
  },
  async () => { // FsKeep(...).kid(...) invalid native Cmp
    
    let keep = FsKeep.fromFp('/test', { path: nodejs.path.win32 });
    let err = shouldFail(() => keep.kid([ '^^' ]));
    if (!err.message.hasHead('Api: invalid Cmp;')) throw Error('Failed').mod({ cause: err });
    
  },
  async () => { // FsKeep(...).kid(...) strong cmp using { sg: '...' }
    
    let keep = FsKeep.fromFp('/test', { path: nodejs.path.win32 });
    let kid = keep.kid([ { sg: '^^' } ]);
    if (kid.fp !== 'c:/test/rvy') throw Error('Failed').mod({ kid });
    
  },
  async () => { // FsKeep(...).kid(...) strong mode via { sg: '...' } doesn't propagate to Kids
    
    let keep = FsKeep.fromFp('/test', { path: nodejs.path.win32 });
    let kid = keep.kid([ { sg: '^^' } ]);
    
    if (kid.mode !== 'native') throw Error('Failed').mod({ kid });
    
    let err = shouldFail(() => kid.kid([ '^^' ]));
    if (!err.message.hasHead('Api: invalid Cmp;')) throw Error('Failed').mod({ cause: err });
    
  },
  async () => { // FsKeep(...).kid(...) native mode permits { sg: '...' }
    
    let keep = FsKeep.fromFp('/test', { path: nodejs.path.win32 });
    let kid = keep.kid({ mode: 'native' }, [ { sg: '^^' } ]);
    
    if (kid.mode !== 'native') throw Error('Failed').mod({ kid });
    
    let err = shouldFail(() => kid.kid([ '^^' ]));
    if (!err.message.hasHead('Api: invalid Cmp;')) throw Error('Failed').mod({ cause: err });
    
  },
  async () => { // FsKeep(...).kid(...) invalid strong/native mode pattern fails
    
    let keep = FsKeep.fromFp('/test', { path: nodejs.path.win32 });
    let err = shouldFail(() => keep.kid({ mode: 'strong' }, { mode: 'native' }));
    
    if (!err.message.hasHead('Api: invalid arg combination')) throw Error('Failed').mod({ cause: err });
    
  },
  async () => { // FsKeep(...).kid(...) strong mode cannot combine with { sg: '...' }
    
    let keep = FsKeep.fromFp('/test', { path: nodejs.path.win32 });
    let err = shouldFail(() => keep.kid({ mode: 'strong' }, [ { sg: '^^' } ]));
    if (!err.message.hasHead('Api: all Cmps must be Strings using "strong" mode')) throw Error('Failed').mod({ cause: err });
    
  },
  async () => { // FsKeep(...).kid({ mode: 'strong' }, cmps) works
    
    let keep = FsKeep.fromFp('/test', { path: nodejs.path.win32 });
    let kid = keep.kid({ mode: 'strong' });
    let kid2 = kid.kid([ '..', '...' ]);
    if (kid2.fp !== 'c:/test/7l5/1q~z~') throw Error('Failed').mod({ kid2 });
    
  },
  async () => { // FsKeep(...).kid({ mode: 'native' }, cmps) works
    
    let keep = FsKeep.fromFp('/test', { path: nodejs.path.win32 });
    let kid = keep.kid({ mode: 'strong' });
    let kid2 = kid.kid({ mode: 'native' });
    let err = shouldFail(() => kid2.kid([ '..', '...' ]));
    if (!err.message.hasHead('Api: invalid Cmp;')) throw Error('Failed').mod({ cause: err });
    
  },
  async () => { // FsKeep(...).kid({ mode: 'strong' }, cmps, { mode: 'native' }) works
    
    let keep = FsKeep.fromFp('/test', { path: nodejs.path.win32 });
    let kid = keep.kid({ mode: 'strong' }, [ '..', '...' ], { mode: 'native' });
    if (kid.fp !== 'c:/test/7l5/1q~z~') throw Error('Failed').mod({ kid });
    if (kid.mode !== 'native') throw Error('Failed').mod({ kid });
    
  },
  async () => { // FsKeep(...).lineage()
    
    let fk = FsKeep.fromFp('/a/b/c', { path: nodejs.path.win32 });
    let lineage = [ ...fk.lineage() ].map(ln => ln.fk);
    
    if (lineage.length !== 3)                             throw Error('Failed').mod({ lineage });
    if (!cmpArrs(lineage[0].fd, [ 'c:', 'a' ]))           throw Error('Failed').mod({ lineage });
    if (!cmpArrs(lineage[1].fd, [ 'c:', 'a', 'b' ]))      throw Error('Failed').mod({ lineage });
    if (!cmpArrs(lineage[2].fd, [ 'c:', 'a', 'b', 'c' ])) throw Error('Failed').mod({ lineage });
    
  },
  async () => { // FsKeep(...).lineage(itself)
    
    let fk = FsKeep.fromFp('/a/b/c', { path: nodejs.path.win32 });
    let lineage = [ ...fk.lineage(fk) ].map(ln => ln.fk);
    
    if (lineage.length !== 0) throw Error('Failed').mod({ lineage });
    
  },
  async () => { // FsKeep(...).lineage(par)
    
    let parFk = FsKeep.fromFp('/a/b/c', { path: nodejs.path.win32 });
    let kidFk = parFk.kid([ 'd', 'e', 'f' ]);
    
    let lineage = [ ...kidFk.lineage(parFk) ].map(ln => ln.fk);
    
    if (lineage.length !== 3)                                            throw Error('Failed').mod({ lineage });
    if (!cmpArrs(lineage[0].fd, [ 'c:', 'a', 'b', 'c', 'd' ]))           throw Error('Failed').mod({ lineage });
    if (!cmpArrs(lineage[1].fd, [ 'c:', 'a', 'b', 'c', 'd', 'e' ]))      throw Error('Failed').mod({ lineage });
    if (!cmpArrs(lineage[2].fd, [ 'c:', 'a', 'b', 'c', 'd', 'e', 'f' ])) throw Error('Failed').mod({ lineage });
    
  },
  async () => { // FsKeep(...).lineage(invalidPar)
    
    let fk = FsKeep.fromFp('/a/b/c/d', { path: nodejs.path.win32 });
    let err = shouldFail(() => [ ...fk.lineage(FsKeep.fromFp('/a/b/unrelated')) ]);
    if (!err.message.hasHead('Api: givenFk is not a parent')) throw Error('Failed').mod({ cause: err });
    
  },
  async () => { // FsTxn.xGetType(...)
    
    await inTmpDir(async (fk, { fs, path }) => {
      
      await fs.mkdir(fk.fp).catch(e => {});
      let type1 = await FsTxn.xGetType(fk);
      if (type1 !== 'node') throw Error('Failed').mod({ fk, type1 });
      
      let type2 = await FsTxn.xGetType(fk.kid([ 'noexist' ]));
      if (type2 !== null) throw Error('Failed').mod({ fk: fk.kid([ 'noexist' ]), type2 });
      
      await fs.writeFile(path.join(fk.fp, 'test.txt'), 'Test data!');
      let type3 = await FsTxn.xGetType(fk.kid([ 'test.txt' ]));
      if (type3 !== 'leaf') throw Error('Failed').mod({ fk: fk.kid([ 'test.txt' ]), type3 });
      
    });
    
  },
  async () => { // FsTxn.xSwapLeafToNode(...)
    
    let { path, fs } = nodejs;
    
    let testFp = path.join(__dirname, '..', 'mill', 'deleteme');
    let testFk = FsKeep.fromFp(testFp);
    
    try {
      
      await fs.mkdir(testFp).catch(e => {});
      
      await fs.mkdir(path.join(testFp, 'dirr'));
      await fs.writeFile(path.join(testFp, 'dirr', 'leaf'), 'Test data!');
      await FsTxn.xSwapLeafToNode(testFk.kid([ 'dirr', 'leaf' ]));
      
      let dir = await fs.readdir(path.join(testFp, 'dirr'));
      if (dir.length !== 1) throw Error('Failed').mod({ dir });
      if (dir[0] !== 'leaf') throw Error('Failed').mod({ dir });
      
      let stat = await fs.stat(path.join(testFp, 'dirr', 'leaf'));
      if (!stat.isDirectory()) throw Error('Failed').mod({ stat });
      
      let dir2 = await fs.readdir(path.join(testFp, 'dirr', 'leaf'));
      if (dir2.length !== 1) throw Error('Failed').mod({ dir2 });
      if (dir2[0] !== '~') throw Error('Failed').mod({ dir2 });
      
      let stat2 = await fs.stat(path.join(testFp, 'dirr', 'leaf', '~'));
      if (!stat2.isFile()) throw Error('Failed').mod({ stat: stat2 });
      
      let contents = await fs.readFile(path.join(testFp, 'dirr', 'leaf', '~'), 'utf8');
      if (contents !== 'Test data!') throw Error('Failed').mod({ contents });
      
    } finally {
      
      await fs.rm(testFp, { recursive: true, maxRetries: 5, retryDelay: 60 }).catch(e => {});
      
    }
    
  },
  async () => { // FsTxn.xEnsureLineage(...)
    
    let { path, fs } = nodejs;
    
    let testFp = path.join(__dirname, '..', 'mill', 'deleteme');
    let testFk = FsKeep.fromFp(testFp);
    
    try {
      
      let leafFk = testFk.kid([ 'a', 'b', 'c', 'd' ]);
      
      await fs.mkdir(testFp).catch(e => {});
      await FsTxn.xEnsureLineage(leafFk.par().lineage(testFk));
      await fs.writeFile(leafFk.fp, 'Testtt');
      
      let stat = await fs.stat(leafFk.fp);
      if (!stat.isFile()) throw Error('Failed').mod({ stat });
      
      await FsTxn.xEnsureLineage(leafFk.par(/* testFk */));
      let stat2 = await fs.stat(leafFk.fp);
      if (!stat2.isFile()) throw Error('Failed').mod({ stat: stat2 });
      
    } finally {
      
      await fs.rm(testFp, { recursive: true, maxRetries: 5, retryDelay: 60 }).catch(e => {});
      
    }
    
  },
  async () => { // Derivative FsKeeps pass "txn" prop appropriately
    
    let ft;
    await inTmpDir(async (fk, { fs }) => {
      
      ft = FsTxn({ fk: fk.kid([ 'a', 'b', 'c' ]) });
      await ft.initPrm;
      
      if (fk.txn) throw Error('Failed').mod({ fk }); // Don't mutate the param!
      
      let kidFk = ft.fk.kid([ 'd' ]);
      if (!kidFk.txn) throw Error('Failed').mod({ kidFk });
      
      let parFk = kidFk.par(1);
      if (!parFk.txn) throw Error('Failed').mod({ parFk });
      
      let deepParFk = parFk.par(1);
      if (deepParFk.txn) throw Error('Failed').mod({ deepParFk }); // Outside `ft`; shouldn't have a "txn"
      
    }).finally(() => ft?.end());
    
  },
  async () => { // Simple FsTxn constructor
    
    let ft;
    await inTmpDir(async (fk, { fs }) => {
      
      ft = FsTxn({ fk, cfg: { throttler: fn => fn() } });
      await ft.initPrm;
      
      let content = jsonToVal(await fs.readFile(fk.kid([ '.hutfs', 'owner' ]).fp));
      if (!isForm(content, Object))             throw Error('Failed').mod({ content });
      if (!isForm(content.ownerId, String))     throw Error('Failed').mod({ content });
      if (!/^[a-z0-9]+$/.test(content.ownerId)) throw Error('Failed').mod({ content });
      if (!isForm(content.ms, Number))          throw Error('Failed').mod({ content });
      if (content.ms < (getMs() - 5000))        throw Error('Failed').mod({ content });
      if (content.ms > getMs())                 throw Error('Failed').mod({ content });
      
    }).finally(() => ft?.end());
    
  },
  async () => { // FsTxn constructor ownership conflict (longer timeout)
    
    let ft1;
    let ft2;
    await inTmpDir(async fk => {
      
      // Note the consumer should be aware that all attempts to acquire ownership on the same FsTxn
      // root should use the same timeout ms (the frequency of heartbeats is based on the timeout
      // value, and it's important that currently-owning and wanting-to-own FsTxns have the same
      // heartbeat expectations
      let ownershipTimeoutMs = 600;
      
      ft1 = FsTxn({ fk, cfg: { ownershipTimeoutMs } });
      await ft1.initPrm;
      
      ft2 = FsTxn({ fk, cfg: { ownershipTimeoutMs } });
      let err = await shouldFail(() => ft2.initPrm);
      if (!err.message.has('unable to take ownership')) throw Error('Failed').mod({ cause: err });
      
    }).finally(() => { ft1?.end(); ft2?.end(); });
    
  },
  async () => { // FsTxn constructor ownership conflict (shorter timeout)
    
    let ft1;
    let ft2;
    await inTmpDir(async fk => {
      
      // Note the consumer should be aware that all attempts to acquire ownership on the same FsTxn
      // root should use the same timeout ms (the frequency of heartbeats is based on the timeout
      // value, and it's important that currently-owning and wanting-to-own FsTxns have the same
      // heartbeat expectations
      let ownershipTimeoutMs = 300;
      
      ft1 = FsTxn({ fk, cfg: { ownershipTimeoutMs } });
      await ft1.initPrm;
      
      ft2 = FsTxn({ fk, cfg: { ownershipTimeoutMs } });
      let err = await shouldFail(() => ft2.initPrm);
      if (!err.message.has('unable to take ownership')) throw Error('Failed').mod({ cause: err });
      
    }).finally(() => { ft1?.end(); ft2?.end(); });
    
  },
  async () => { // FsTxn constructor ownership after retrying
    
    let overallMs = 500;
    let ft1CreateMs = 0;
    let ft1EndMs = 280;
    
    let ft2CreateMs = 100;
    
    let ft1;
    let ft2;
    await inTmpDir(async fk => {
      
      let ft1Prm = (async () => {
        
        await Promise(r => setTimeout(r, ft1CreateMs));
        
        ft1 = FsTxn({ fk, cfg: { ownershipTimeoutMs: overallMs, throttler: fn => fn() } });
        await ft1.initPrm;
        await Promise(r => setTimeout(r, ft1EndMs));
        
        ft1.end();
        
      })();
      
      let ft2Prm = (async () => {
        
        // Delay initialization - allows `ft1` to gain ownership first
        await Promise(r => setTimeout(r, ft2CreateMs));
        
        // Now create `ft2` and expect it to evetually get ownership!
        ft2 = FsTxn({ fk, cfg: { ownershipTimeoutMs: overallMs, throttler: fn => fn() } });
        await ft2.initPrm;
        
      })();
      
      await Promise.all([ ft1Prm, ft2Prm ]);
      
    }).finally(() => { ft1?.end(); ft2?.end(); });
    
  },
  async () => { // FsTxn(...).getData(nonexistentFk, variousEncodings)
    
    await inTmpDir(async fk => {
      
      let ft = await FsTxn({ fk }).initPrm;
      
      let nonexistentFk = fk.kid([ 'does', 'not', 'exist' ]);
      
      // Object, binary
      let data1 = await ft.getData(nonexistentFk, { encoding: null });
      if (!isForm(data1, Buffer)) throw Error('Failed').mod({ data1 });
      if (data1.length !== 0) throw Error('Failed').mod({ data1 });
      
      // Object, utf8
      let data2 = await ft.getData(nonexistentFk, { encoding: 'utf8' });
      if (!isForm(data2, String)) throw Error('Failed').mod({ data2 });
      if (data2.length !== 0) throw Error('Failed').mod({ data2 });
      
      // Shorthand, binary
      let data3 = await ft.getData(nonexistentFk, null);
      if (!isForm(data3, Buffer)) throw Error('Failed').mod({ data3 });
      if (data3.length !== 0) throw Error('Failed').mod({ data3 });
      
      // Shorthand, string
      let data4 = await ft.getData(nonexistentFk, 'utf8');
      if (!isForm(data4, String)) throw Error('Failed').mod({ data4 });
      if (data4.length !== 0) throw Error('Failed').mod({ data4 });
      
    });
    
  },
  async () => { // FsTxn(...).setData(...)
    
    await inTmpDir(async fk => {
      
      let ft = await FsTxn({ fk }).initPrm;
      
      let dataFk = fk.kid([ 'data' ]);
      await ft.setData(dataFk, 'lalala', { encoding: 'utf8' });
      
      let data1 = await ft.getData(dataFk, { encoding: 'utf8' });
      if (data1 !== 'lalala') throw Error('Failed').mod({ data1 });
      
      let data2 = await ft.getData(dataFk, { encoding: null });
      if (!isForm(data2, Buffer))              throw Error('Failed').mod({ data2 });
      if (data2.toString('utf8') !== 'lalala') throw Error('Failed').mod({ data2 });
      
    });
    
  },
  async () => { // FsTxn(...).setData(...) 100 parallel on same fk
    
    let ft;
    await inTmpDir(async fk => {
      
      ft = await FsTxn({ fk }).initPrm;
      
      let num = 100;
      let dataFk = fk.kid([ 'data' ]);
      await Promise.all(num.toArr(i => ft.setData(dataFk, `Value: ${i}`, 'utf8')));
      
      let data = await ft.getData(dataFk, { encoding: 'utf8' });
      if (data !== `Value: ${num - 1}`) throw Error('Failed').mod({ data });
      
    }).finally(() => ft?.end());
    
  },
  async () => { // FsTxn(...) set/get with leaf->node conversion
    
    let ft;
    await inTmpDir(async fk => {
      
      ft = await FsTxn({ fk }).initPrm;
      
      await Promise.all([
        ft.setData(fk.kid([ 'zzz', 'a' ]),           'KID A'),
        ft.setData(fk.kid([ 'zzz', 'a', 'b' ]),      'KID A->B'),
        ft.setData(fk.kid([ 'zzz', 'a', 'b', 'c' ]), 'KID A->B->C'),
        ft.setData(fk.kid([ 'zzz', 'a', 'c' ]),      'KID A->C'),
      ]);
      
      let data = await Promise.all({
        a:   ft.getData(fk.kid([ 'zzz', 'a' ]), 'utf8'),
        ab:  ft.getData(fk.kid([ 'zzz', 'a', 'b' ]), 'utf8'),
        abc: ft.getData(fk.kid([ 'zzz', 'a', 'b', 'c' ]), 'utf8'),
        ac:  ft.getData(fk.kid([ 'zzz', 'a', 'c' ]), 'utf8')
      });
      
      if (data.a   !== 'KID A')       throw Error('Failed').mod({ data });
      if (data.ab  !== 'KID A->B')    throw Error('Failed').mod({ data });
      if (data.abc !== 'KID A->B->C') throw Error('Failed').mod({ data });
      if (data.ac  !== 'KID A->C')    throw Error('Failed').mod({ data });
      
    }).finally(() => ft?.end());
    
  },
  async () => { // FsTxn simple encryption
    
    // Key is utf8; data is utf8
    let ft1;
    await inTmpDir(async (fk, { fs }) => {
      
      ft1 = FsTxn({ fk, cfg: { throttler: fn => fn(), key: 'my secret key' }});
      
      await ft1.setData(fk.kid([ 'data' ]), 'VERY SENSITIVE');
      
      let val = await ft1.getData(fk.kid([ 'data' ]), 'utf8');
      if (val !== 'VERY SENSITIVE') throw Error('Failed').mod({ val });
      
    }).finally(() => ft1?.end());
    
    // Key is Buffer, data is utf8
    let ft2;
    await inTmpDir(async (fk, { fs }) => {
      
      ft2 = FsTxn({ fk, cfg: { throttler: fn => fn(), key: Buffer.allocUnsafe(100) }});
      
      await ft2.setData(fk.kid([ 'data' ]), 'VERY SENSITIVE');
      
      let val = await ft2.getData(fk.kid([ 'data' ]), 'utf8');
      if (val !== 'VERY SENSITIVE') throw Error('Failed').mod({ val });
      
    }).finally(() => ft2?.end());
    
    // Key is Buffer, data is Buffer
    let ft3;
    await inTmpDir(async (fk, { fs }) => {
      
      ft3 = FsTxn({ fk, cfg: { throttler: fn => fn(), key: 'yolooo' }});
      
      let buff = Buffer.allocUnsafe(100);
      await ft3.setData(fk.kid([ 'data' ]), buff);
      
      let encBuff = await fs.readFile(fk.kid([ 'data' ]).fp, null);
      if (Buffer.compare(buff, encBuff) === 0) throw Error('Failed').mod({ buff, encBuff });
      
      let buff2 = await ft3.getData(fk.kid([ 'data' ]));
      if (Buffer.compare(buff, buff2) !== 0) throw Error('Failed').mod({ buff, buff2 });
      
    }).finally(() => ft3?.end());
    
  },
  
];

// Run tests
(async () => {
  
  gsc('Filesys tests\u2026');
  
  /* fs.writeFile non-atomically truncates and then stores a new value
  
  let fp = 'C:/dev/proj/lmao.txt';
  let rand = () => Math.random().toString(36).slice(2);
  let doWrite = () => nodejs.fs.writeFile(fp, valToJson({ a: rand(), b: rand(), c: rand() }));
  let doRead = () => nodejs.fs.readFile(fp).then(val => ({ result: true, ...jsonToVal(val) })).catch(err => ({ result: false, err }));
  
  await doWrite();
  let active = true;
  let gud = 0;
  let bad = 0;
  setTimeout(() => active = false, 5 * 1000);
  
  let reads = (async () => {
    
    while (active) {
      
      let val = await doRead();
      if (!val.result) { bad++; }
      else             { gud++; }
      
    }
    
  })();
  let writes = (async () => {
    
    while (active) {
      
      await doWrite();
      
    }
    
  })();
  
  await Promise.all([ reads, writes ]);
  
  gsc({ total: gud + bad, gud, bad, percent: ((100 * gud) / (gud + bad)).toFixed(2) });
  return;
  
  */
  
  
  
  /* Looks like 16, 24, and 32 are valid sizes (could try letting this run longer) {
    let { subtle } = nodejs.crypto;
    if (!subtle) throw Error('damnnn').mod({ req: req.crypto.toArr((v, k) => k), subtle });
    
    let cnt = 0;
    while (true) {
      
      try {
        
        let opts = {
          type: 'raw',
          value: Buffer.from('a'.repeat(cnt), 'utf8'),
          encryptionMode: { name: 'AES-CBC' },
          extractable: false,
          uses: [ 'encrypt', 'decrypt' ]
        };
        let key = await subtle.importKey(opts.type, opts.value, opts.encryptionMode, opts.extractable, opts.uses);
        gsc(`ATTEMPT LEN ${cnt}:`, { key });
        //break;
        
      } catch (err) {
        
        //gsc(`ATTEMPT LEN ${cnt}: ${err.message}`);
        
      }
      
      cnt++;
      
      await Promise(r => setTimeout(r, 10));
      
    }
    process.exit(0);
  } */
  
  let ms = getMs();
  let results = [];
  for (let test of tests) {
    
    let desc = (test.toString().cut('\n', 1)[0].cut('//', 1)[1] || '<anon test>').trim();
    
    if (testFilter && !testFilter.test(desc)) continue;
    
    let ms = getMs();
    try         { await test(); results.push({ desc, success: 1, ms: getMs() - ms }); }
    catch (err) {               results.push({ desc, success: 0, ms: getMs() - ms, err: err.mod(msg => `${msg} (${desc})`) }); }
    
  }
  
  for (let r of results) r.ms = Math.round(r.ms).toString(10);
  let maxMsDigits = Math.max(...results.map(r => r.ms.length));

  gsc(results.map(r => `[${r.success ? 'pass' : 'FAIL'}] (${Math.round(r.ms).toString(10).padHead(maxMsDigits, ' ')}ms) ${r.desc}`).join('\n'));
  for (let r of results.filter(r => !r.success)) gsc(r.err);
  gsc(`Tests complete after ${(getMs() - ms).toFixed(0)}ms; passed ${results.filter(r => r.success).count()} / ${results.count()}`);
  
})()
  .catch(err => gsc('FATAL', err.desc()))
  .then(() => process.exitNow());