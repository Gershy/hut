'use strict';
require('../../room/setup/clearing/clearing.js');

let nodejs = require('./nodejs.js');
let sys = require('./system.js');

module.exports = form({ name: 'FsKeep', has: { Slots, Keep }, props: (forms, Form) => ({
  
  // FsKeeps understand Cmp traversal (e.g. "par", "sib", "kid"), and may also be connected to a
  // FsTxn; if connected, FsKeeps are able to perform data manipulation - otherwise, they are
  // limited to performing Cmp-traversal-related tasks
  
  // Finds non-alphanumerics other than "~", "_", "." and "-"
  $invalidCmpCharsRegex: /[^0-9a-zA-Z~_.-]/,
  $nativeCmpCharset: String.charset('~1234567890-qwertyuiopasdfghjklzxcvbnm_'), // Must not include uppercase and lowercase as these may incorrectly treated the same on win32
  $strongCmpCharset: String.charset((256).toArr(n => n.char()).join('')),
  $reservedWin32Cmps: Set([
    'con', 'conin$', 'conout$', 'prn', 'aux', 'clock$', 'null',
    ...(9).toArr(v => `com${v}`),
    ...(9).toArr(v => `lpt${v}`),
    'lst', 'keybd$', 'screen$', '$idle$', 'config$'
  ]),
  $extToContentType: {
    js: 'text/javascript; charset=utf-8',
    json: 'text/json; charset=utf-8',
    html: 'text/html; charset=utf-8',
    css: 'text/css; charset=utf-8',
    txt: 'text/plain; charset=utf-8',
    ico: 'image/x-icon',
    png: 'image/png',
    jpg: 'image/jpeg',
    svg: 'image/svg+xml'
  },
  
  $resolveCmp: (cmp, { allowWin32Drive=false, mode='native' }={}) => {
    
    if (isForm(cmp, Object)) {
      if      (cmp.sg) { mode = 'strong'; cmp = cmp.sg.encodeInt(Form.strongCmpCharset).encodeStr(Form.nativeCmpCharset); }
      else if (cmp.nt) { mode = 'native'; cmp = cmp.nt; }
      else             throw Error('Api: failed to resolve Cmp').mod({ cmp });
    }
    
    if (!isForm(cmp, String)) throw Error('Api: failed to resolve Cmp').mod({ cmp });
    
    // // Win32 restriction: Cmps are always considered in lowercase
    // cmp = cmp/*.lower()*/;
    
    // Allow drive indicators as the first item
    if (allowWin32Drive && /^[a-z]:$/i.test(cmp)) return cmp/*.lower()*/;
    
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
    
    // Resolves an array of Cmps
    
    let nativeCmps = fd.map((cmp, i) => Form.resolveCmp(cmp, { allowWin32Drive: i === 0, mode }));
    
    let root = (path === nodejs.path.win32) ? [ sys.win32DefaultDrive ] : [];
    let fp = path.resolve('/', ...root, ...nativeCmps).replaceAll('\\', '/'); /*.lower();*/
    if (path === nodejs.path.win32) {
      
      // Ensure drive component exists
      if    (fp[0] === '/') fp = sys.win32DefaultDrive + fp;
      
      // Ensure drive component exists
      fp = fp.slice(0, sys.win32DefaultDrive.length) /*.lower()*/ + fp.slice(sys.win32DefaultDrive.length);
      
    }
    
    return { fp, fd: fp.split('/').filter(Boolean) };
    
  },
  $fromFp: (fp, { path=nodejs.path, ...conf }={}) => {
    
    // Resolves a single String, representing an absolute filepath
    
    // Note that this is the best way of gaining access to a root FsKeep, but untrusted data should
    // never be sent to this function - e.g. there are no guards here against directory traversal!!
    
    fp = fp.replaceAll('\\', '/');
    
    if (path === nodejs.path.win32 && !/^(?:[/]|[a-zA-Z][:])/.test(fp)) throw Error('Api: invalid relative fp').mod({ fp });
    if (path === nodejs.path.posix && fp[0] !== '/')                    throw Error('Api: invalid relative fp').mod({ fp });
    if (path === nodejs.path.win32 && fp[0] === '/')                    fp = sys.win32DefaultDrive + fp;
    
    let fd = fp.split('/').map(cmp => cmp/*.lower()*/.trim() || skip);
    
    let FsKeepForm = Form;
    return FsKeepForm({ ...conf, fd, path });
    
  },
  $txn: (fp, { path=nodejs.path, ...conf }={}) => {
    
    let { cfg={}, ...moreConf } = conf;
    
    let fk = Form.fromFp(fp, { path, ...moreConf });
    let FsTxn = require('./FsTxn.js');
    return FsTxn({ fk, cfg }).fk;
    
  },
  $isRel: {
    sep: Object.freeze({ sep: true,  eql: false, par: false, kid: false }),
    eql: Object.freeze({ sep: false, eql: true,  par: true,  kid: true  }),
    kid: Object.freeze({ sep: false, eql: false, par: false, kid: true  }),
    par: Object.freeze({ sep: false, eql: false, par: true,  kid: false })
  },
  
  init({ txn=null, fd: fd0, mode='native', path=nodejs.path }={}) {
    
    // `fd` can look like:
    // [ 'C:', 'a', 'b', 'c', 'd' ]                     -> 'c:/a/b/c/d'
    // [ 'a', 'b', 'c', 'd' ]                           -> '/a/b/c/d'
    // [ 'C:', { nt: 'x' }, { nt: 'y' }, { nt: 'z' } ]  -> 'c:/x/y/z'
    // [ 'C:', { sg: '/$+'}, { sg: '.....' } ]          -> 'c:/????/????'
    
    if (![ 'native', 'strong' ].has(mode)) throw Error('Api: "mode" invalid').mod({ mode });
    
    let { fp, fd } = Form.resolveFd(fd0, { path, mode });
    
    Object.assign(this, { txn: null, fp, fd, mode, path });
    denumerate(this, 'path');
    
    if (txn && !this.is(txn.fk).kid) throw Error('Api: not contained within provided txn').mod({ txn, fk: this });
    Object.assign(this, { txn });
    
  },
  is(trg) {
    
    if (trg.path !== this.path) throw Error('Api: comparing fks with different path modules');
    
    let srcFd = this.fd;
    let trgFd = trg.fd;
    let srcLen = srcFd.length;
    let trgLen = trgFd.length;
    
    let numCommon;
    let min = Math.min(srcLen, trgLen);
    for (numCommon = 0; numCommon < min; numCommon++) if (srcFd[numCommon] !== trgFd[numCommon]) break;
    
    // Separated (disjoint; neither is the common ancestor; neither contains the other)
    if (numCommon !== min) return Form.isRel.sep;
    
    // Exact same FsKeep! Considered to both contain each other
    if (srcLen === trgLen) return Form.isRel.eql;
    
    // `trg.fd` is a prefix of `this.fd` - `this` is a Kid of `trg`!
    if (trgLen < srcLen )  return Form.isRel.kid;
    
    // `this.fd` is a prefix of `trg.fd` - `this` is a Par of `trg`!
    if (srcLen < trgLen)   return Form.isRel.par;
    
  },
  
  access(...args) {
    
    args = args.flat(Infinity);
    
    // Note that trying to log here with `gsc` may cause a stack overflow because `gsc` will want
    // to log the line responsible for making the `gsc` call:
    // - which initializes an Error and uses `Error(...).getInfo().trace`
    // - which generates lines of formatted codepoints
    // - where each line includes a formatted Keep name
    // - which requires an instance of a Keep to format
    // - and the Keep instance is obtained using this `access` method, closing the loop!!
    return (args.length === 1 && /[:/]/.test(args[0]))
      ? this.kidFromFp(args[0])
      : this.kid(args);
    
  },
  kid(...args) {
    
    // Example usage:
    // fk.kid([ 'path', 'to', 'file.txt' ]);
    // fk.kid({ mode: 'strong' }, [ '*', '&', '.' ]);
    // fk.kid([ 'a', 'b' ]).kid({ mode: strong }, [ 'a!', 'b!' ]);
    // fk.kid([ 'a', 'b' ], { mode: strong }).kid([ 'a!', 'b!' ]);
    
    if (args.length > 3) throw Error('Api: max 2 args').mod({ args });
    
    let pattern = args.map(arg => {
      if (isForm(arg, Object)) return 'o';
      if (isForm(arg, Array)) return 'a';
      throw Error('Api: invalid arg').mod({ arg });
    }).join('');
    
    let validPatterns = [ 'a', 'o', 'ao', 'oa', 'oao' ]; // "a" = "array", "o" = "object"
    if (!validPatterns.has(pattern)) throw Error('Api: invalid arg combination').mod({ validPatterns, pattern });
    
    let headConf = pattern.hasHead('o') ? args.at( 0) : {};
    let tailConf = pattern.hasTail('o') ? args.at(-1) : {};
    let cmps = args.find(v => isForm(v, Array)) ?? [];
    
    let modePre = headConf.at('mode', this.mode);
    let modePost = tailConf.at('mode', modePre);
    if (modePre === 'strong') {
      if (cmps.some(cmp => !isForm(cmp, String))) throw Error('Api: all Cmps must be Strings using "strong" mode').mod({ cmps });
      cmps = cmps.map(sg => ({ sg }));
    }
    
    return (0, this.Form)({
      txn: this.txn,
      fd: [ ...this.fd, ...cmps ],
      mode: modePost,
      path: this.path
    });
    
  },
  kidFromFp(fp) {
    let kid = this.Form.fromFp(fp, { mode: 'native', path: this.path });
    if (!this.is(kid).par) throw Error('Api: fp outside jurisdiction').mod({ fk: this, fp });
    return Object.assign(kid, { txn: this.txn });
  },
  par(num=1) {
    
    if (num < 1)          throw Error('Api: num must be >= 1').mod({ num });
    if (!num.isInteger()) throw Error('Api: num must be an integer').mod({ num });
    
    let par = (0, this.Form)({
      txn: null,
      fd: this.fd.slice(0, -num),
      mode: 'native',
      path: this.path
    });
    
    // Add `this.txn` if it applies
    if (this.txn?.fk.is(par).par) par.txn = this.txn;
    
    return par;
    
  },
  sib(cmp) {
    
    if (!this.fd.length) throw Error('Api: unable to get sibling for root');
    
    let sib = (0, this.Form)({
      txn: null,
      fd: [ ...this.fd.slice(0, -1), cmp ],
      mode: 'native',
      path: this.path
    });
    
    // Add `this.txn` if it applies
    if (this.txn?.fk.is(sib).par) sib.txn = this.txn;
    
    return sib;
    
  },
  * lineage(ancestorFk=this.par(Infinity)) {
    
    // Yields the whole ancestor chain from `ancestorFk` (exclusive) to `this` (inclusive)
    
    if (ancestorFk.path !== this.path) throw Error('Api: mixing FsKeeps with different path modules').mod({ fk: this, ancestorFk });
    if (!ancestorFk.is(this).par)      throw Error('Api: ancestorFk is not a parent fk').mod({ fk: this, ancestorFk });
    
    let pfxCmps = this.fd.slice(0, ancestorFk.fd.length);
    let lineageCmps = this.fd.slice(pfxCmps.length);
    
    // For win32 don't yield the drive component; instead shift it from `lineageCmps` to `pfxCmps`
    if (this.path === nodejs.path.win32 && pfxCmps.length === 0) pfxCmps.push(lineageCmps.shift());
    
    for (let cmp of lineageCmps) {
      pfxCmps.push(cmp);
      yield { fk: (0, this.Form)({ fd: [ ...pfxCmps ], mode: 'native', path: this.path }) }; // TODO: Watch out when generating ancestor FsKeeps
    }
    
  },
  getContentType() {
    let pcs = this.fd.at(-1).split('.');
    let ext = pcs.length >= 2 ? pcs.at(-1) : null;
    return Form.extToContentType[ext] ?? 'application/octet-stream';
  },
  
  ...'getType,getMeta,exists,setData,getData,setContent,getContent,rem,getKids,getSubtree,getDataHeadStream,getDataTailStream'
    .split(',')
    .toObj(term => [ term, function(...args) { return this.txn[term](this, ...args); } ]),
  
  desc() { return `/[file]${this.fp.hasHead('/') ? '' : '/'}${this.fp}`; },
  
})});