'use strict';

// The "clearing" is javascript-level bootstrapping

/// {ASSERT=
if (!global)          throw Error(`"global" must be available`);
/// =ASSERT}

let mustDefaultRooms = !global.hasOwnProperty('rooms');
if (mustDefaultRooms) global.rooms = Object.create(null);

if (!global.mmm)      global.mmm = () => {};

Object.assign(global, {
  Regex: RegExp,
  AsyncFunction:          (async () => {}).constructor,
  GeneratorFunction:      (function*(){}).constructor,
  Generator:              (function*(){})().constructor,
  AsyncGeneratorFunction: (async function*(){}).constructor,
  AsyncGenerator:         (async function*(){})().constructor,
  C: Object.freeze({
    def: (obj, prop, value, opts={}) => Object.defineProperty(obj, prop, { value, configurable: true, ...opts }),
    skip: undefined,
    noFn: name => Object.assign(
      function() { throw Error(`${getFormName(this)} does not implement "${name}"`); },
      { '~noFormCollision': true /* TODO: Use Symbol instead? */ }
    ),
    /// {DEBUG=
    dbgCntMap: {},
    /// =DEBUG}
    'Promise.all': Promise.all.bind(Promise),
    'Error.prototype.toString': Error.prototype.toString
  }),
  skip: undefined
});

{ // Improve prototypes
  
  // TODO: Have I overwritten builtin prototype methods in a way that
  // changes default functionality? This could effect 3rd party code...
  // Note that adding a "get" property to `Object.prototype` will cause
  // any typical code that calls `Object.defineProperty` to fail because
  // the options provided will be a plain Object, and that Object will
  // seem to provide a getter because it has a "get" property available
  
  let protoDefs = (Cls, vals) => {
    
    if ('$$' in vals) {
      
      // Convert, e.g., 'padHead:padStart,padTail:padEnd' into:
      //    | {
      //    |   padHead: String.prototype['padStart'],
      //    |   padTail: String.prototype['padEnd']
      //    | }
      
      let v = Object.fromEntries(vals['$$'].split(',').map(v => (v = v.split(':'), [ v[0], Cls.prototype[v[1]] ])));
      delete vals['$$'];
      Object.assign(vals, v);
      
    }
    
    let keys = Reflect.ownKeys(vals);
    for (let key of keys) if (key[0] === '$') Cls[key.slice(1)] = vals[key];
    
    // Avoid making more properties available on `global` - if a typo
    // winds up referring to a global property the bug which results
    // can be highly unexpected!
    if (Cls === global.constructor) for (let key of keys) if (key[0] !== '$') global[key] = skip;
    
    Object.defineProperties(Cls.prototype, Object.fromEntries(
      keys
        .filter(key => key[0] !== '$')
        .map(key => [ key, { enumerable: false, writable: true, value: vals[key] } ])
    ));
    
  };
  protoDefs(Object, {
    
    $stub: Object.freeze({}),
    $plain: obj => obj ? Object.assign(Object.create(null), obj) : Object.create(null),
    
    $$: 'has:hasOwnProperty',
    
    at(k, def=skip) { return this.has(k) ? this[k] : def; },
    each(fn) { for (let [ k, v ] of this) fn(v, k); },
    map(fn) { // Iterator: (val, key) => val
      let ret = Object.assign({}, this);
      for (let k in ret) { let v = fn(ret[k], k); if (v !== skip) ret[k] = v; else delete ret[k]; }
      return ret;
    },
    mapk(fn) { // Iterator: (val, k) => [ k, v ]
      let arr = [];
      for (let k in this) { let v = fn(this[k], k); if (v !== skip) arr.push(v); }
      return Object.fromEntries(arr);
    },
    toArr(fn) { // Iterator: (val, k) => [ k, v ]
      let ret = [];
      for (let k in this) { let v = fn(this[k], k); if (v !== skip) ret.push(v); }
      return ret;
    },
    slice(p) { // TODO: Rename to "subset"?
      
      // >> { a: 1, b: 2, c: 3, d: 4 }.slice([ 'b', 'd' ]);
      // { b: 2, d: 4 }
      return p.toObj(p => this.has(p) ? [ p, this[p] ] : skip);
      
    },
    seek(fn) { // Iterator: (val, key) => bool; returns { found, val=null, key=null }
      for (let k in this) if (fn(this[k], k)) return { found: true, val: this[k], key: k };
      return { found: false, val: null, k: null };
    },
    empty() { for (let k in this) return false; return true; },
    gain(...objs) {
      // Note for performance we combine all source Objects first, to
      // reduce the number of items that need to be checked for skips -
      // probably worth the overhead of calling `Object.assign` x2
      let gain = Object.assign({}, ...objs);
      for (let k in gain) if (gain[k] === skip) delete gain[k];
      return Object.assign(this, gain);
    },
    merge(o) { // Modifies `this` in-place
      for (let [ k, v ] of o) {
        // `skip` can be passed to remove properties
        if (v === skip) { delete this[k]; continue; }
        
        // Incoming non-Object properties are simple
        if (!isForm(v, Object)) { this[k] = v; continue; }
        
        // Existing non-Object replaced with `{}`
        if (!isForm(this[k], Object) || !this.has(k)) this[k] = {};
        
        // And simply recurse!
        this[k].merge(v);
      }
      return this;
    },
    hierchize() {
      let result = {};
      for (let [ k, v ] of this) {
        let dive = token.dive(k);
        let last = dive.pop();
        let ptr = result;
        for (let cmp of dive) ptr = (ptr.has(cmp) && ptr[cmp] != null) ? ptr[cmp] : (ptr[cmp] = {});
        ptr[last] = isForm(v, Object) ? v.hierchize() : v;
      }
      return result;
    },
    * linearize(chain=[]) {
      for (let k in this) {
        let v = this[k];
        let nextChain = [ ...chain, ...k.split('.') ];
        if (isForm(v, Object)) yield* v.linearize(nextChain);
        else                   yield [ nextChain.join('.'), v ];
      }
    },
    count() { let c = 0; for (let k in this) c++; return c; },
    categorize(fn) { // Iterator: (val, key) => '<categoryTerm>'
      
      //  { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8, i: 9, j: 10 }.categorize(n => {
      //    if (n < 4) return 'small';
      //    if (n < 8) return 'medium';
      //    return 'big';
      //  });
      //  >> { small: { a: 1, b: 2, c: 3 }, medium: { d: 4, e: 5, f: 6, g: 7 }, big: { h: 8, i: 9, j: 10 } }
      
      let ret = {};
      for (let [ k, v ] of this) {
        let t = fn(v, k);
        if (!ret.has(t)) ret[t] = {};
        ret[t][k] = v;
      }
      return ret;
      
    },
    * [Symbol.iterator]() { for (let k in this) yield [ k, this[k] ]; }
    
  });
  protoDefs(Array, {
    
    $stub: Object.freeze([]),
    $from: Array.from, // (it, fn) => (isForm(it, Array) ? it : [ ...it ]).map(fn),
    
    $$: 'each:forEach,has:includes',
    
    map(fn) { // Iterator: (val, ind) => val
      let ret = [];
      let len = this.length;
      for (let i = 0; i < len; i++) { let v = fn(this[i], i); if (v !== skip) ret.push(v); }
      return ret;
    },
    toArr(fn) { return this.map(fn); }, // Can't inherit Object.prototype.toArr - it passes keys as Strings!
    toObj(fn) { // Iterator: (val, ind) => [ key0, val0 ]
      let ret = [];
      let len = this.length;
      for (let i = 0; i < len; i++) { let v = fn(this[i], i); if (v !== skip) ret.push(v); }
      return Object.fromEntries(ret);
    },
    seek(fn) { // Iterator: (val, ind) => bool; returns { found=false, val=null, ind=null }
      let n = this.length;
      for (let i = 0; i < n; i++) if (fn(this[i], i)) return { found: true, val: this[i], ind: i };
      return { found: false, val: null, ind: null };
    },
    all(fn=Boolean) { return this.every(fn); },
    any(fn=Boolean) { return this.some(fn); },
    empty() { return !this.length; },
    add(...args) { this.push(...args); return args[0]; },
    rem(val) { let ind = this.indexOf(val); if (ind > -1) this.splice(ind, 1); },
    gain(...arrs) { for (let arr of arrs) this.push(...arr); return this; },
    count() { return this.length; },
    valSort(fn) { return this.sort((a, b) => fn(a) - fn(b)); }, // Sorts smaller values earlier (pass fn as e.g. `v => -v` to sort descending)
    categorize(fn) { // Iterator: val => '<categoryTerm>'
      
      //  [ 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 ].categorize(n => {
      //    if (n < 4) return 'small';
      //    if (n < 8) return 'medium';
      //    return 'big';
      //  });
      //  >> { small: [ 1, 2, 3 ], medium: [ 4, 5, 6, 7 ], big: [ 8, 9, 10 ] }
      
      let ret = {};
      for (let elem of this) { let t = fn(elem); if (!ret.has(t)) ret[t] = []; ret[t].push(elem); }
      return ret;
      
    }
    
  });
  protoDefs(String, {
    
    $multiline: str => {
      
      let lines = str.replace(/\r/g, '').split('\n');
      
      // Trim any leading empty lines
      while (lines.length && !lines[0].trim()) lines = lines.slice(1);
      
      // Count leading whitespace chars on first line with content
      let initSpace = 0;
      while (lines[0][initSpace] === ' ') initSpace++;
      
      let ret = lines.map(ln => ln.slice(initSpace)).join('\n');
      return ret.trimTail();
      
    },
    $baseline: (str, seq='| ') => {
      
      return str.split('\n').map(ln => {
        ln = ln.trimHead();
        if (!ln.startsWith(seq)) return skip; // After whitespace should come `seq`; ignore lines not containing `seq`!
        return ln.slice(seq.length).trimTail(); // Trim off the baseline; remove tailing whitespace
      }).join('\n');
      
    },
    $charset: str => {
      let cache = Map();
      return {
        str, size: BigInt(str.length),
        charVal: c => {
          if (!cache.has(c)) {
            let ind = str.indexOf(c);
            if (ind < 0) throw Error('Char outside charset');
            cache.set(c, BigInt(ind));
          }
          return cache.get(c);
        },
        valChar: n => {
          if (n < 0 || n >= str.length) throw Error('Val outside charset');
          return str[n];
        }
      };
    },
    $id: (size=10, n=Math.random()) => n.toString(36).slice(2, 2 + size).padHead(size, '0'), // Default settings: 36 ^ 10 = 3656158440062976 possibilities
    $base32: '0123456789abcdefghijklmnopqrstuv',
    $base36: '0123456789abcdefghijklmnopqrstuvwxyz',
    $base62: '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
    $base64: '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ=-',
    
    // padHead: (len: number, str: string) => string,
    // padTail: (len: number, str: string) => string,
    $$: 'code:charCodeAt,has:includes,hasHead:startsWith,hasTail:endsWith,padHead:padStart,padTail:padEnd,trimHead:trimStart,trimTail:trimEnd,upper:toUpperCase,lower:toLowerCase',
    
    cut(delim, cuts=1) { // e.g. `cuts === 1` produces Array of length 2
      // `cuts` defines # of cuts (resulting array length is `num + 1`)
      let split = this.split(delim, cuts < Infinity ? cuts : skip);
      let numDelimsSplit = split.length - 1;
      let lenConsumed = 0
        + split.reduce((a, s) => a + s.length, 0)
        + delim.length * numDelimsSplit;
      if (lenConsumed < this.length) split = [ ...split, this.slice(lenConsumed + delim.length) ];
      return split;
    },
    count() { return this.length; },
    ellipsis(limit, chr='\u2026') { return this.length > limit ? this.slice(0, limit - 1) + chr : this; },
    indent(...args /* amt=2, char=' ' | indentStr=' '.repeat(2) */) {
      
      if (!this) return this; // No-op on empty String (otherwise it would transform a 0-line string to a 1-line string)
      let indentStr = null;
      if (isForm(args[0], String)) { indentStr = args[0]; }
      else                         { let [ amt=2, char=' ' ] = args; indentStr = char.repeat(amt); }
      return this.split('\n').map(ln => `${indentStr}${ln}`).join('\n');
      
    },
    encodeInt(charset=String.base62, { big=false }={}) {
      
      if (isForm(charset, String)) charset = String.charset(charset);
      
      let base = charset.size;
      if (base === 1n) return this.count();
      
      let sum = 0n;
      let n = this.length;
      for (let ind = 0; ind < n; ind++)
        // Earlier values of `i` represent higher places same as with written numbers further left
        // digits are more significant
        // The value of the place `i` is `ind - 1`
        sum += (base ** BigInt(n - ind - 1)) * charset.charVal(this[ind]);
      
      if (!big) {
        sum = Number(sum);
        if ([ Infinity, -Infinity ].has(sum)) throw Error('Precision loss converting BigInt -> Number');
      }
      
      return sum;
      
    }
    
  });
  protoDefs(Number, {
    
    $int32: Math.pow(2, 32),
    $int64: Math.pow(2, 64),
    $floatPrecision: Math.pow(2, 53) - 1,
    
    char() { return String.fromCharCode(this); },
    each(fn) { for (let i = 0; i < this; i++) fn(i); },
    toArr(fn) { let arr = new Array(this || 0); for (let i = 0; i < this; i++) arr[i] = fn(i); return arr; },
    toObj(fn) { // Iterator: n => [ key, val ]
      let ret = [];
      for (let i = 0; i < this; i++) { let v = fn(i); if (v !== skip) ret.push(v); }
      return Object.fromEntries(ret);
    },
    encodeStr(a1, a2) {
      
      // Note that base-1 requires 0 to map to the empty string. This also
      // means that, for `n >= 1`:
      //      | (n).encodeStr(singleChr)
      // is always equivalent to
      //      | singleChr.repeat(n - 1)
      
      return ((this !== this) ? 0n : BigInt(Math.floor(this))).encodeStr(a1, a2);
      
    },
    isInteger() { return this === Math.round(this); }, // No bitwise shortcut - it disrupts Infinity
    * [Symbol.iterator]() { for (let i = 0; i < this; i++) yield i; },
    * bits() { let n = this >= 0 ? this : -this; while (n) { yield n & 1; n = n >> 1; } },
    
    map: undefined // Prevent `Number(...).map`
    
  });
  protoDefs(BigInt, {
    
    encodeStr(a1, a2 /* `charset` and `padLen=0` in either order */) {
      
      // Note that base-1 requires 0 to map to the empty string. This also
      // means that, for `n >= 1`:
      //      |       (n).encodeStr(singleChr)
      // is always equivalent to
      //      |       singleChr.repeat(n - 1)
      
      let [ charset, padLen=0 ] = isForm(a1, Number) ? [ a2, a1 ] : [ a1, a2 ];
      if (!charset)                charset = String.base62;
      if (isForm(charset, String)) charset = String.charset(charset);
      
      let base = charset.size;
      
      /// {DEBUG=
      if (base === 1n && padLen) throw Error(`Can't pad when using base-1 encoding`);
      /// =DEBUG}
      
      let num = this; // this.constructor === BigInt ? this : BigInt(Math.floor(this));
      let digits = [];
      while (num) { digits.push(charset.valChar(num % base)); num /= base; }
      return digits.reverse().join('').padHead(padLen, charset.str[0]);
      
    }
    
  });
  protoDefs(Function, {
    
    $stub: v => v,
    $createStub: v => () => v,
    bound(...args) { return this.bind(null, ...args); }
    
  });
  protoDefs(Error, {
    
    $stackTraceLimit: Infinity,
    
    mod(props={} /* { cause, msg, message, ...more } */) {
      
      if (isForm(props, Function)) props = props(this.message, this);
      if (isForm(props, String)) props = { message: props };
      
      let { cause=null, msg=null, message=msg??this.message, ...moreProps } = props;
      
      // - Assign `cause` to transfer props like fs "code" props, etc. - watch out, `cause` may be
      //   an Array or Object!
      // - Assign `moreProps` to transfer any other properties
      // - Add `message` prop
      // - Only add `cause` prop if `cause` is non-null
      return Object.assign(this, hasForm(cause, Error) ? cause : {}, moreProps, cause ? { message, cause } : { message });
      
    },
    propagate(props /* { cause, msg, message, ...more } */) { throw this.mod(props); },
    suppress() {
      this['~suppressed'] = true;
      
      if (!this.cause) return;
      let causes = (hasForm(this.cause, Error) ? [ this.cause ] : this.cause);
      causes.each(err => err.suppress());
      return this;
    },
    
    getInfo() {
      
      // Errors have a Message and a Stack
      // Stacks are a Preamble followed by a Trace
      // A Trace is a sequence of callsites
      
      let { stack='' } = this;
      let traceHeadInd = stack.indexOf('>>>HUTTRACE>>>');
      let traceTailInd = stack.indexOf('<<<HUTTRACE<<<');
      
      if (traceHeadInd < 0 || traceTailInd < 0) return { preamble: '<unknown>', trace: [] };
      let preamble = stack.slice(0, traceHeadInd).trim();
      let trace = JSON.parse(stack.slice(traceHeadInd + '>>>HUTTRACE>>>'.length, traceTailInd));
      
      return {
        preamble,
        trace: trace.map(val => {
          if      (val.type === 'info') return val;
          else if (val.type === 'line') {
            
            let { keepTerm, row, col } = val;
            let mapped = mapCmpToSrc(keepTerm, row, col);
            
            // Stringify "row" and "col"
            return { ...val, ...mapped };
            
          }
        })
      };
      
    },
    desc(seen=Set()) {
      
      if (seen.has(this)) return '<circ>';
      seen.add(this);
      
      let { message: msg, stack, cause, ...props } = this;
      let { desc, trace } = (() => {
        
        let { preamble, trace } = this.getInfo();
        
        // "Loose" errors suck; nodejs is known to throw them in certain areas. The worst part is
        // that they have no stacktrace. For example, fs.stat will throw a loose error if used on
        // a non-existent path - or we could throw one, via `throw { name: 'loose error :(' }`
        if (trace.empty()) return { desc: `Loose Error:\n  ${msg}\n  "${stack}"`, trace };
        
        // We want to show the Message and Preamble; depending how the
        // Error is generated one may contain the other - if so we show
        // whichever is the superset, otherwise we concatenate them (we
        // always show *all* information)
        msg = msg.trim();
        let fullMsg = null;
        if (preamble.has(msg))      fullMsg = preamble;
        else if (msg.has(preamble)) fullMsg = msg;
        else                        fullMsg = `${msg}\n${preamble}`;
        
        // Replace any filepaths within `fullMsg`
        fullMsg = fullMsg.trim().split('\n').map(line => {
          
          let match = line.trim().match(/^((?:[/]|[A-Z][:][/\\])[^:]+)[:]([0-9]+)(?:[:]([0-9]+))?$/);
          
          if (!match) return line;
          let [ , file, row, col=null ] = match;
          if (!file.hasHead('/[')) file = `/[file]/${file.replace(/[/\\]+/g, '/')}`;
          let src = mapCmpToSrc(file, row, col ?? 0);
          return `${src.file.replace(/[\\]+/g, '/')} [${src.row}:${src.col}]`;
          
        }).join('\n');
        
        // Stringify "row" and "col"
        trace = trace.map(val => {
          if (val.type !== 'line') return val;
          let { row, col, ...props } = val;
          return { ...props, row: row.toString(10), col: col.toString(10) };
        });
        
        let lineTrace = trace.filter(t => t.type === 'line');
        let fileChars = Math.max(...lineTrace.map(t => t.file.length));
        let rowChars = Math.max(...lineTrace.map(t => t.row.length));
        let colChars = Math.max(...lineTrace.map(t => t.col.length));
        trace = trace.map(t => {
          if (t.type === 'line') {
            let { file, row, col } = t;
            return `${file.padTail(fileChars)} [${row.padHead(rowChars)}:${col.padHead(colChars)}]`;
          } else if (t.type === 'info') {
            return t.info;
          }
        });
        
        return { desc: fullMsg || getFormName(this), trace };
        
      })();
      
      if (!trace.empty()) desc += '\n' + trace.join('\n').indent('\u2022 ');
      if (!props.empty()) desc += '\n' + formatAnyValue(props).indent(2);
      
      if (cause) {
        
        let ccc = isForm(cause, Array) ? cause : isForm(cause, Object) ? cause.toArr(v => v) : [ cause ];
        
        if (ccc.some(v => !hasForm(v, Error))) {
          console.log('THIS IS NOT AN ERROR', ccc, ccc.filter(v => hasForm(v, Error).map(v => v.desc())));
        }
        
        if (hasForm(cause, Error)) cause = cause.desc(seen);
        else                       cause = cause.map((c, n) => `Cause #${n + 1}: ` + c.desc(seen)).join('\n');
        desc += `\nCAUSE:\n${cause.indent(2)}`;
      }
      
      return desc;
      
    },
    toString() { return this.desc(); }
    
  });
  protoDefs(RegExp, {
    
    $readable: (...args /* flags, niceRegexStr | niceRegexStr */) => {
      
      // Allows writing self-documenting regular expressions
      
      let [ flags, str ] = (args.length === 2) ? args : [ '', args[0] ];
      let lns = str.split('\n').map(line => line.trimTail());
      
      let cols = Math.max(...lns.map(line => line.length)).toArr(col => Set(lns.map(ln => ln[col])));
      cols.each(col => col.size > 1 && col.rem(' '));
      
      /// {DEBUG=
      for (let [ num, col ] of cols.entries()) if (col.size > 1) throw Error(`Conflicting chars at column ${num}: [${[ ...col ].join('')}]`);
      /// =DEBUG}
      
      return RegExp(cols.map(col => [ ...col ][0]).join(''), flags);
      
    }
    
  });
  protoDefs(Date, {
    desc() { return `${getFormName(this)}(${getDate(+this)})`; }
  });
  
  let newlessProtoDefs = (Cls, vals) => {
    
    // Extend prototypes and allow instantiation without "new"
    
    let name = Cls.name;
    let Newless = global[name] = function(...args) { return new Cls(...args); };
    C.def(Newless, 'name', name);
    Newless.Native = Cls;
    Newless.prototype = Cls.prototype;
    
    protoDefs(Newless, vals);
    
  };
  newlessProtoDefs(Promise, {
    
    $all: (prms, mapFn=null) => {
      
      if (mapFn) prms = prms.map(mapFn);
      
      // TODO: Removing undefineds from `Promise.all` return value is backwards-incompatible
      if (isForm(prms, Array)) return C['Promise.all'](prms).then(a => a.toArr(v => v)); // Remove any `skip` results
      
      if (isForm(prms, Object)) {
        
        // Need to get `keys` here in case `obj` mutates before resolution
        let keys = Object.keys(prms);
        return C['Promise.all'](Object.values(prms))
          .then(vals => { let ret = {}; for (let [ i, k ] of keys.entries()) ret[k] = vals[i]; return ret; });
        
      }
      
      throw Error(`Unexpected parameter for Promise.all: ${getFormName(prms)}`);
      
    },
    $resolve: Promise.resolve,
    $reject: Promise.reject,
    $later: (resolve, reject) => {
      let p = Promise((...a) => [ resolve, reject ] = a);
      return Object.assign(p, { resolve, reject });
    },
    
    $$: 'route:then,fail:catch'
    
  });
  newlessProtoDefs(Set, {
    
    $stub: { count: () => 0, add: Function.stub, rem: Function.stub, has: () => false, values: () => Array.stub },
    
    $$: 'each:forEach,rem:delete',
    
    map(fn) { // Iterator: (val, ind) => val0
      let ret = [], ind = 0;
      for (let v of this) { v = fn(v, ind++); if (v !== skip) ret.push(v); }
      return ret;
    },
    seek(fn) { // Iterator: (val) => bool; returns { found, val }
      for (let val of this) if (fn(val)) return { found: true, val };
      return { found: false, val: null };
    },
    count() { return this.size; },
    empty() { return !this.size; },
    toArr(...args) { return this.map(...args); },
    toObj(fn) {
      let ret = [];
      for (let v of this) { v = fn(v); if (v !== skip) ret.push(v); }
      return Object.fromEntries(ret);
    }
    
  });
  newlessProtoDefs(Map, {
    
    $stub: { count: () => 0, set: Function.stub, rem: Function.stub, has: () => false, values: () => Array.stub },
    
    $$: 'each:forEach,add:set,rem:delete',
    
    map(fn) { // Iterator: (val, key) => [ key0, val0 ]
      let ret = [];
      for (let [ k, v ] of this) { v = fn(v, k); if (v !== skip) ret.push(v); }
      return Object.fromEntries(ret);
    },
    seek(fn) { // Iterator: (val, key) => bool; returns { found, val, key }
      for (let [ k, v ] of this) if (fn(v, k)) return { found: true, val: v, key: k };
      return { found: false, val: null, key: null };
    },
    count() { return this.size; },
    empty() { return !this.size; },
    toObj(...args) { return this.map(...args); },
    toArr(fn) { // Iterator: (val, key) => val0
      let ret = [];
      for (let [ k, v ] of this) { v = fn(v, k); if (v !== skip) ret.push(v); }
      return ret;
    }
    
  });
  newlessProtoDefs(Generator, {
    each(fn) { for (let v of this) fn(v); },
    toArr(fn) { return [ ...this ].map(fn); },
    toObj(fn) {
      let ret = {};
      for (let v of this) { v = fn(v); if (v !== skip) ret[v[0]] = v[1]; }
      return ret;
    }
  });
  newlessProtoDefs(AsyncGenerator, {
    async each(fn) { for await (let v of this) await fn(v); },
    async toArr(fn) { let arr = []; for await (let v of this) arr.push(v); return arr.map(fn); },
    async toObj(fn) { let arr = []; for await (let v of this) arr.push(v); return arr.toObj(fn); }
  });
  
}

// Define Hut's native global functionality
Object.assign(global, global.rooms['setup.clearing'] = {
  
  // To truly initialize the Clearing need to override:
  // - global.formatAnyValue
  // - global.subconOutput
  // - global.getMs
  // - global.getRooms
  // - global.mapCmpToSrc
  // - global.keep
  // - global.conf
  // - global.real
  
  /// {DEBUG=
  // Debug
  dbgCnt: name => C.dbgCntMap[name] = (C.dbgCntMap.has(name) ? C.dbgCntMap[name] + 1 : 0),
  /// =DEBUG}
  
  // Flow controls, sync/async interoperability
  soon: fn => fn ? Promise.resolve().then(fn) : Promise.resolve(),
  onto: (val, fn) => (fn(val), val),
  safe: (fn, onErr) => {
    
    // Returns `fn()` with error handling provided by `onErr` regardless
    // of whether `fn()` results in a Promise or an immediate value
    
    /// {DEBUG=
    if (!isForm(onErr, Function)) throw Error('Api: "onErr" must be a Function');
    /// =DEBUG}
    
    try         { let val = fn(); return isForm(val, Promise) ? val.fail(onErr) : val; }
    catch (err) { return onErr(err); }
    
  },
  then: (val, rsv=Function.stub, rjc=null) => {
    
    // Act on `val` regardless of whether it's a Promise or an immediate
    // value; return `rsv(val)` either immediately or as a Promise
    
    // Promises are returned with `then`/`fail` handling
    if (val instanceof Promise) return val.then(rsv).catch(rjc);
    
    // No `rjc` means no `try`/`catch` handling
    if (!rjc) return rsv(val);
    
    try { return rsv(val); } catch (err) { return rjc(err); }
    
  },
  thenAll: (vals, ...args /* rsv, rjc */) => {
    if (vals.seek(v => v instanceof Promise).found) vals = Promise.all(vals);
    return then(vals, ...args);
  },
  
  // Forms
  form: ({ name, has={}, pars=has, props=()=>({}) }) => {
    
    let reservedFormProps = [ 'constructor', 'Form' ];
    
    // Ensure every ParForm is truly a Form
    for (let [ k, Form ] of pars) if (!Form || !Form['~forms']) throw Error(`Invalid Form: "${k}" (it's Form is ${getFormName(Form)})`);
    
    // // TODO: This is definitely faster than `eval`, but it prevents the
    // // names of Forms from displaying correctly in the console
    // let Form = function(...p) { return (this && this.constructor === Form) ? this.init(...p) : new Form(...p); }
    // Object.defineProperty(Form, 'name', { value: name, writable: false, enumerable: true });
    let fName = name.replace(/[^a-zA-Z0-9]/g, '$');
    let Form = eval(
      `let ${fName} = function ${fName}(...p) { return (this && this.Form === Form) ? this.init(...p) : new Form(...p); }; ${fName};`
    );
    
    Form['~forms'] = Set([ Form ]);
    Form.prototype = Object.create(null);
    
    // We'll store a Set of inherited static props for each static key
    let statics = Object.create(null);
    
    // Loop over all ParentForms; for each:
    // - add to `Form['~forms']` to enable `hasForm` testing
    // - collect static properties (to apply to `name` later)
    // - map to a representation of its prototype (to supply Parent
    //   prototype methods to overriding methods)
    let protos = Object.assign({}, pars);
    for (let parName in pars) {
      
      let { '~forms': parForms, ...parProps } = pars[parName];
      
      // Add all ParentForms to the ~forms Set (facilitates `hasType`)
      for (let ParForm of parForms) Form['~forms'].add(ParForm);
      
      // Collect the rest of the properties
      for (let [ k, v ] of parProps) {
        if (!statics[k]) statics[k] = Set();
        statics[k].add(v);
      }
      
      // `protoDef` sets non-enumerable prototype properties
      // Iterate non-enumerable props via `Object.getOwnPropertyNames`
      let proto = pars[parName].prototype;
      protos[parName] = Object.fromEntries(Object.getOwnPropertyNames(proto).map( n => [ n, proto[n] ] ));
      
    }
    pars = null;
    
    // If `props` is a function it becomes the result of its call
    if (isForm(props, Function)) {
      
      // Apply any immediately-unambiguous static properties to `Form`
      // so they are available to the function body of `props`
      let immediateStatics = [];
      for (let k in statics) if (statics[k].size === 1) {
        immediateStatics.push([ k, [ ...statics[k] ][0] ]);
      }
      Object.assign(Form, Object.fromEntries(immediateStatics));
      
      props = props(protos, Form);
      
    }
    
    // Ensure we have valid "props", and all prop names are valid
    if (!isForm(props, Object)) throw Error(`Couldn't resolve "props" to Object`);
    for (let prop of reservedFormProps) if (({}).has.call(props, prop)) throw Error(`Used reserved "${prop}" key`);
    
    // Iterate all props of ParForm prototypes; collect inherited ones
    let propsByName = {};
    for (let [ formName, proto ] of protos) for (let [ propName, prop ] of proto) {
      
      // Skip reserved names (they certainly exist in `formProto`!)
      if (reservedFormProps.has(propName)) continue;
      
      // Store all props under the same name in the same Set
      if (!({}).has.call(propsByName, propName)) propsByName[propName] = Set();
      propsByName[propName].add(prop);
      
    }
    
    // `propsByName` already has all ParForm props; now add in the props
    // unique to the Form being created!
    // TODO: Allow classes to define getters + setters??? Should really
    // be iterating `Object.getOwnPropertyDescriptors(props)` rather
    // than `props` itself...
    for (let [ propName, prop ] of props) {
      
      if (prop === skip) throw Error(`Provided ${name} @ ${propName} as skip`);
      
      // `propName` values iterated here will be unique; `props` is an
      // object, and must have unique keys. Note `Set` is used to ignore
      // duplicate properties with the same identity (these would mean
      // that multiple ancestors define the property, but they define it
      // to the exact same value!)
      if (propName[0] === '$') statics[propName.slice(1)] = Set([ prop ]); // Guaranteed to be singular
      else                     propsByName[propName] = Set([ prop ]);      // Guaranteed to be singular
      
    }
    
    // At this point ambiguous static props should be resolved
    for (let k in statics) if (statics[k].size > 1) throw Error(`Multiple static props named "${k}" inherited by Form ${name} (define ${name}.$${k}!)`);
    
    // At this point an "init" prop is required! Note that if we want to
    // mark a Form as "abstract" and not independently initializable we
    // can set its "init" property to `C.noFn('init')`
    if (!({}).has.call(propsByName, 'init')) throw Error('No "init" method available');
    
    for (let [ propName, propsOfThatName ] of propsByName) {
      
      // If there are collidable props under this name there can only be
      // one! Multiple collidable props indicates the prop needs to be
      // defined directly on `Form.prototype`, guaranteeing singularity.
      // If *no* collidable props are set, use any non-collidable prop
      let collisionProps = propsOfThatName.toArr(v => (v && v['~noFormCollision']) ? skip : v);
      
      // If there are no collision props we still may be able to assign
      // one of the "no form collision" props; this is useful as calling
      // the "uncolliding" method gives useful feedback (e.g. "function
      // not implemented") whereas not defining anything would result in
      // trying to call `undefined` as a function
      if (collisionProps.length === 0) {
        
        let utilProp = propsOfThatName.seek(v => !!v).val;
        if (utilProp) collisionProps = [ utilProp ];
        else          continue;
        
      } else if (collisionProps.length > 1) {
        
        let definingForms = collisionProps.map(prop => Form['~forms'].seek(ParForm => ParForm.prototype[propName] === prop).val);
        throw Error([
          `Form ${name} has ambiguous "${propName}" property `,
          `from ${collisionProps.length} ParentForms `,
          `(${definingForms.map(Form => Form ? Form.name : '???').join(', ')}). `,
          `Define ${name}.prototype.${propName}.`
        ].join(''));
        
      }
      
      C.def(Form.prototype, propName, collisionProps[0], { enumerable: false, writable: true });
      
    }
    
    C.def(Form.prototype, 'Form', Form, { enumerable: false, writable: true });
    C.def(Form.prototype, 'constructor', Form, { enumerable: false, writable: true });
    Object.freeze(Form.prototype);
    
    // Would be very satisifying to freeze `Form`, but the current
    // pattern of defining specialized subclasses:
    //    |     FnSrc.Tmp1 = form(...);
    // relies on `Form` being mutable :(
    // TODO: MapSrc and MemSrc are being refactored... maybe do this??
    for (let k in statics) statics[k] = [ ...statics[k] ][0];
    Object.assign(Form, statics);
    // Object.freeze(Form);
    
    return Form;
    
  },
  getFormName: v => {
    if (v === null) return 'Null';
    if (v === undefined) return 'Undef';
    if (v !== v) return 'UndefNum';
    return Object.getPrototypeOf(v)?.constructor.name ?? 'Prototypeless'; // e.g. `getFormName(Object.plain()) === 'Prototypeless'`
  },
  isForm: (fact, Form) => {
    
    // NaN only matches against the NaN primitive (not the Number Form)
    if (fact !== fact) return Form !== Form;
    if (fact == null) return false;
    
    // Prefer to compare against `FormNative`. Some native Cls
    // references represent the hut-altered form (e.g. they have an
    // extended prototype and can be called without "new"). Such Cls
    // references are not true "Classes" in that they are never set as
    // the "constructor" property of any instance - "contructor"
    // properties will always reflect the native, unmodified Cls. Any
    // Cls which has been hut-modified will have a "Native" property
    // pointing to the original class, which serves as a good value to
    // compare against "constructor" properties
    return Object.getPrototypeOf(fact)?.constructor === (Form.Native ?? Form);
    
  },
  hasForm: (fact, FormOrCls) => {
    
    if (fact == null) return false;
    
    // `fact` may either be a fact/Form, or an instance/Cls. In case a
    // fact/instance was given, the "constructor" property points us to
    // the appropriate Form/Cls. We name this value "Form", although it
    // is ambiguously a Form/Cls.
    let Form = (Object.getPrototypeOf(fact)?.constructor === Function) ? fact : fact.constructor;
    if (Form === FormOrCls) return true;
    
    // If a "~forms" property exists `FormOrCls` is specifically a Form
    // and inheritance can be checked by existence in the set
    if (Form?.['~forms']) return Form['~forms'].has(FormOrCls);
    
    // No "forms" property; FormOrCls is specifically a Cls. Inheritance
    // can be checked using `instanceof`; prefer to compare against a
    // "Native" property (which facilitates "newless" instances)
    return (fact instanceof (FormOrCls.Native || FormOrCls));
    
  },
  
  // Keep access
  keep: () => null,
  
  // Configuration
  conf: () => null,
  
  // Timing
  getMs: Date.now,
  getDate: (n=getMs()) => (new Date(n)).toLocaleString().replace(',', '').replace(' a.m.', 'am').replace(' p.m.', 'pm'),
  
  // Room loading
  getRooms: (names, { shorten=true, ...opts }={}) => { throw Error('Not implemented'); },
  getRoom: (name, opts={}) => then(getRooms([ name ], { ...opts, shorten: false }), batch => batch[name]),
  mapCmpToSrc: (file, row, col) => ({ file, row, col, context: null }),
  
  // Subcon debug
  /*
  subcon: (dt, pfx=[]) => {
    
    // TODO: temporarily cache subcon indexes, mapped by `diveToken`?
    
    let sc = (...args) => void global.subconOutput(sc, ...sc.pfx, ...args); // Always returns `skip`!
    return Object.assign(sc, {
      // The sc "pfx" includes props to always log with every call (e.g. correlation ids)
      pfx,
      term: isForm(dt, String) ? dt : dt.join('.'),
      kid: (dt2, ...pfx2) => global.subcon([ ...token.dive(dt), ...token.dive(dt2) ], [ ...pfx, ...pfx2 ]),
      
      focus: (dt2) => {
        dt2 = token.dive(dt2);
        
        if (dt2.length !== 1)                  throw Error('Api: dive must be a single component').mod({ dive: dt2 });
        return global.subcon(
          [ ...token.dive(dt), dt2 ],
          [ ...pfx, { $: { [dt2[0]]: String.id(6) } } ]
        );
      },
      head: (region, ...vals) => {
        if (!/^[a-zA-Z0-9]+$/.test(region)) throw Error('Api: invalid region').mod({ region });
        sc({ $r: `${region}/head` }, ...vals);
      },
      tail: (region, ...vals) => {
        if (!/^[a-zA-Z0-9]+$/.test(region)) throw Error('Api: invalid region').mod({ region });
        sc({ $r: `${region}/tail` }, ...vals);
      },
      note: (region, ...vals) => {
        if (!/^[a-zA-Z0-9]+$/.test(region)) throw Error('Api: invalid region').mod({ region });
        sc({ $r: `${region}/note` }, ...vals);
      },
      
      cachedParams: null,
      params() {
        if (!sc.cachedParams) {
          sc.cachedParams = subconParams(sc);
          setTimeout(() => sc.cachedParams = null, 15000);
        }
        return sc.cachedParams;
      },
      desc: () => `Subcon(${sc.term})`
    });
    
  },
  subconParams: sc => {
    
    // Returns configuration for specific subcon instance; some significant properties:
    // - "chatter": indicates this sc is writing to stdout
    // - "therapy": indicates this sc is writing to therapy
    // - "active": indicates this sc is at least writing to somewhere
    
    let subconConf = global.conf('global.subcon');
    if (!subconConf) return { chatter: true, therapy: false, active: true };
    let ptr = { root: subconConf };
    let params = {};
    for (let pc of [ 'root', ...token.dive(sc.term) ]) {
      if (!ptr[pc]) break;
      ptr = ptr[pc];
      params.merge(ptr.params ?? {});
    }
    return { ...params, active: params.chatter || params.therapy };
    
  },
  subconOutput: (sc, ...args) => console.log(`\nSubcon "${sc.term}": ${global.formatAnyValue(args)}`),
  subconStub: Object.assign(() => {}, {
    term: 'stub',
    kid: () => global.subconStub,
    focus: () => global.subconStub,
    params: () => ({}),
    ...[ 'head', 'tail', 'note' ].toObj(t => [ t, Function.stub ])
  }),
  */
  
  // Urls
  uriRaw: ({ path='', cacheBust, query }) => {
    let url = '';
    if (cacheBust)               url += `/!${cacheBust}`;
    if (path)                    url += `/${path}`;
    if (query && !query.empty()) url += '?' + query.toArr((v, k) => `${k}=${v}`).join('&'); // Note: DON'T encode here!
    return url;
  },
  uri: ({ path='', query }) => {
    
    switch (conf('global.maturity')) {
      
      // In "dev" use a random version to dodge the cache
      case 'dev':
        return uriRaw({ path, query, cacheBust: String.id(8) });
      
        // In "beta" use process uid (refreshes once when Above restarts)
      case 'beta':
        return uriRaw({ path, query, cacheBust: conf('deploy.loft.uid') });
      
        // TODO: How are we caching in alpha?
      case 'alpha':
        return uriRaw({ path, query, cacheBust: null });
      
    }
    
  },
  
  // Util
  token: {
    
    // The ability to specify functionality via compact notation is a fundamental feature of Hut.
    // Such compact values are "Tokens". Note that theoretically, compact notation could indicate
    // all kinds of operations: walking graphs, defining deep merges, multi-property extraction,
    // schema validation, etc! The "type of functionality" could even be embedded within the Token
    // - this would mean a single function (`token.resolve`) could process any given Token. For now
    // Hut only supports Diving (`token.dive`), which converts a Token into an Array of items,
    // typically for use with indirection (diving through successive references). Note that Tokens
    // are probably/usually Strings, but could be other compact values!
    
    resolve: (...args) => token.dive,
    dive: tok => {
      
      // Note this function says nothing about the items in the resolved "indirection chain" (e.g.
      // that they are all Strings). This function is very tolerant when passed an actual Array,
      // and neither examines its children nor performs any flattening (because nested Arrays could
      // represent the indirection components!)
      
      // Handle `null`, empty string
      if (!tok) tok = [];
      
      // Strings beginning with a "funky" character are split by that
      // character, otherwise they are split by "."; any empty cmps are
      // filtered out; note these chars are typically "directionful" as
      // in they are typically rendered similarly to or reminiscent of a
      // right-pointing-arrow
      if (isForm(tok, String))
        return './>\u0010\u001a'.has(tok[0]) // \u0010 - arrowhead-right; \u001a - arrow-right
          ? tok.slice(1).split(tok[0]).filter(Boolean)
          : tok.split('.').filter(Boolean);
      
      if (!isForm(tok, Array)) throw Error(`Api: token must resolve to Array; got ${getFormName(tok)}`).mod({ token: tok });
      
      return tok.flat(Infinity);
      
    },
    diveOn: (tok, ptr, def=null) => {
      let dive = token.dive(tok);
      let cnt = 0;
      for (let pc of dive) {
        if (!isForm(ptr, Object) || !ptr.has(pc))
          return { found: false, val: def, deepest: ptr, remaining: dive.slice(cnt) };
        ptr = ptr[pc];
        cnt++;
      }
      return { found: true, val: ptr };
    }
    
  },
  denumerate: (obj, prop) => C.def(obj, prop, obj[prop], { enumerable: false }),
  formatAnyValue: val => { try { return isForm(val, String) ? val : valToJson(val); } catch (err) { return `Unformattable(${getFormName(val)})`; } },
  valToJson: JSON.stringify,
  jsonToVal: JSON.parse,
  valToSer: JSON.stringify,
  serToVal: JSON.parse
  
});

{ // Define global Forms: Endable, Src, Tmp, etc.
  
  let Subcon = form({ name: 'Subcon', props: (forms, Form) => ({
    
    $regionCmpRegex: /^[a-zA-Z0-9]+$/,
    $stub: {
      say: Function.stub,
      kid: () => Subcon.stub,
      params: () => ({ chatter: false, therapy: false }),
      ...[ 'say', 'head', 'tail', 'note' ].toObj(t => [ t, Function.stub ])
    },
    
    init({ dt=[], ctx=[], rules={} }={}) {
      if (!rules.has('output')) throw Error('Invalid rules');
      
      dt = global.token.dive(dt);
      Object.assign(this, { dt, term: dt.join('.'), ctx, rules });
      denumerate(this, 'rules');
    },
    params() {
      
      // Returns configuration for specific subcon instance; some significant properties:
      // - "chatter": indicates this sc is writing to stdout
      // - "therapy": indicates this sc is writing to therapy
      // - "active": indicates this sc is at least writing to somewhere
      
      let ptr = { root: this.rules.rootParams };
      let state = { chatter: false, therapy: false };
      
      for (let d of [ 'root', ...this.dt ]) {
        ptr = ptr.at(d, null);
        if (!ptr) break;
        state.merge(ptr.at('params', {}));
      }
      
      return { ...state, active: state.chatter || state.therapy };
      
    },
    say(...args) {
      return void this.rules.output(this, ...this.ctx, ...args);
    },
    kid(dt, ...ctx) {
      dt = global.token.dive(dt);
      if (dt.some(d => !Form.regionCmpRegex.test(d)))
        throw Error('Invalid subcon region').mod({ dt });
      
      let ids = dt.toObj(d => [ d, String.id(6) ]);
      return Subcon({ dt: [ ...this.dt, ...dt ], ctx: [ ...this.ctx, { $: ids }, ...ctx ], rules: this.rules });
    },
    head(...args) {
      let dt = isForm(args[0], String) ? args.shift() : null;
      return (dt ? this.kid(dt) : this).say({ $: { p: 'head' } }, ...args);
    },
    tail(...args) {
      let dt = isForm(args[0], String) ? args.shift() : null;
      return (dt ? this.kid(dt) : this).say({ $: { p: 'tail' } }, ...args);
    },
    note(...args) {
      let dt = isForm(args[0], String) ? args.shift() : null;
      return (dt ? this.kid(dt) : this).say({ $: { p: 'note' } }, ...args);
    }
    
  })});
  
  let Endable = form({ name: 'Endable', props: (forms, Form) => ({
    
    // An entity that can become permanently invalidated; no properties
    // are required, but a "cleanup" property may get defined by passing
    // a Function to the `init` method
    
    init(fn) {
      
      // if (global.foundation) this.zzz = this.Form.name + ': ' + global.foundation.formatError(Error('trace'))
      //   .split('\n')
      //   .slice(4)
      //   .map(ln => ln.replace(/^[^a-zA-Z0-9]+/, ''))
      //   .join(' / ');
      
      mmm(this.zzz ?? this.Form.name, +1);
      
      // Allow Endable.prototype.cleanup to be masked
      if (fn) C.def(this, 'cleanup', fn);
      
    },
    onn() { return true; },
    off() { return !this.onn(); },
    cleanup() {},
    
    hold() {
      
      // Note that "holding" an Endable indicates that it has additional
      // "ownership" - that is, other owning contexts that may try to
      // end it do not have sole authority to determine the Endable's
      // end. We could describe holding as "bolstering" or "supporting"
      
      if (this.off()) throw Error(`Can't hold ended ${getFormName(this)}`);
      
      // I had to decide whether the initial call to `hold` initializes "~holdCnt" to 1 or 2 (when
      // "~holdCnt" is decremented to 0, the Endable ends). Consider this scenario:
      // 
      //    | let initMyEndable = () => {
      //    |   let e = initEndableSomehow();
      //    |   doThingThatRefsEndable(e);
      //    |   uponSomeCondition(() => e.end());
      //    | };
      // 
      // The difference lies in whether we want to force an Endable's creator to bear the cognitive
      // overhead of understanding whether the `Endable(...)` is "holdy" or "basic". Most Endables
      // are "basic" - they are not destined to ever be held/reference-counted.
      // 
      // If "~holdCnt" initialized to 1 it would be necessary for `initMyEndable` to be aware that
      // the `e` it is initializing is destined to be held (by `doThingThatRefsEndable`). This is
      // because `doThingThatRefsEndable` will call `e.hold`), setting `e['~holdCnt'] === 1`, and
      // then `e.end()`, decrementing `e['~holdCnt'] === 0` - the hold count would hit 0, and `e`
      // would fully end - not good for `initMyEndable` which doesn't expect `e` to end from
      // `doThingThatRefsEndable` - since `initMyEndable` is the "initializer" ("owner") of `e`.
      // Therefore setting the initial "~holdCnt" to 2 improves behaviour; the `Endable(...)` owner
      // has no overhead related to whether `e` will go on to be held later. Only non-owners deal
      // with holding Endables; this means call #1 to `hold` increments 1 for the creator's context
      // plus an additional 1 (total 2) indicating an extra context also sustains the Endable!
      this['~holdCnt'] = (this['~holdCnt'] || 1) + 1;
      
      return this;
      
    },
    end() {
      
      // TODO: Needs to be able to return a value, potentially a Promise, indicating when the
      // Endable is effectively ended
      // Only returns `false` if this is already ended.
      
      if (this.off()) return false;
      
      // For held Endables, prevent ending if refs still exist
      if (this['~holdCnt'] && --this['~holdCnt'] > 0) return false;
      
      C.def(this, 'onn', () => false);
      this.cleanup(); mmm(this.zzz ?? this.Form.name, -1);
      return true;
      
    }
    
  })});
  
  let Src = form({ name: 'Src', props: (forms, Form) => ({
    
    init(newRoute) {
      C.def(this, 'fns', Set(), { enumerable: false });
      newRoute && C.def(this, 'newRoute', newRoute);
    },
    newRoute(fn) {},
    route(fn, mode='tmp') {
      
      /// {DEBUG=
      if (![ 'prm', 'tmp' ].has(mode)) throw Error(`Invalid mode: "${mode}"`);
      if (!hasForm(fn, Function)) throw Error(`"fn" should be Function; got ${getFormName(fn)}`);
      /// =DEBUG}
      
      // Ignore duplicates
      if (this.fns.has(fn)) return (mode === 'tmp') ? Tmp.stub : skip;
      
      this.fns.add(fn);
      this.newRoute(fn);
      if (mode === 'tmp') return Endable(() => this.fns.rem(fn));
      
    },
    send(arg=skip) {
      
      // TODO: How should Send-serialization interact with `newRoute`??
      
      // Prevent any Sends-while-Sending; instead queue them up...
      if (this['~sendSer']) return this['~sendSer'].push(arg);
      this['~sendSer'] = [ arg ];
      
      // Behaviour is much better when "addRoute-while-send" does not
      // result in the route being called **from Src.prototype.send**
      // (note it may be called from, e.g., "newRoute"). So when "send"
      // is called our goal is to iterate a snapshot of `this.fns`. Note
      // that while "addRoute-while-send" cases should effectively be
      // ignored, "remRoute-while-send" should *not* be ignored. So for
      // each route in the snapshot, when the time comes to call that
      // route we need to ensure it still exists within `this.fns`.
      
      // Perform any Sends-while-Sending that occurred in the order that
      // they occurred! Note that any additional Sends-while-Sending
      // will be added into the serializer array in the order they
      // occurred, and standard Array iteration will naturally pick up
      // any added-while-iterating values
      for (let arg of this['~sendSer']) for (let fn of [ ...this.fns ]) this.fns.has(fn) && fn(arg);
      
      delete this['~sendSer'];
      
    },
    
    srcFlags: {
      
      // Does this Src remember previous values?
      memory: false,
      
      // Does this Src only work with a single value at once? (Can it max 1 time without any
      // external activity?)
      multi: false,
      
      // Does this Src only send Tmps?
      tmpsOnly: false
      
      // { memory: true }
      // - `newRoute` is probably implemented
      // - `countSent` should be implemented
      
      // { multi: true }
      // - The Sending of a new value indicates the outdatedness of any
      //   previous value
      // - Newly added Routes will be immediately called maximum once
      
      // { multi: true, tmpsOnly: true }
      // - A previously sent Tmp will probably be ended before a new one
      //   is Sent
      
    },
    countSent() {
      
      // Depending on implementation, some Srcs will be able to count
      // how many items they've sent. For Srcs which send Tmps it can be
      // preferable to only count Tmps that haven't been ended
      throw Error(`Not available for ${this.constructor.name}`);
      
    },
    getSent() {
      
      // Depending on implementation, some Srcs will be able to return
      // the full set of items they've Sent (excluding any Sent Tmps
      // which were later Ended)
      throw Error(`Not available for ${this.constructor.name}`);
      
    }
    
  })});
  Src.stub = { route: () => Tmp.stub, send: Function.stub };
  
  let Tmp = form({ name: 'Tmp', has: { Endable, Src }, props: (forms, Form) => {
    
    let srcInit = forms.Src.init;
    let endableInit = forms.Endable.init;
    let endableEnd = forms.Endable.end;
    
    let sendAndEnd = function(arg=skip) {
      
      // Sending and ending are synonymous for a Tmp
      
      if (!endableEnd.call(this)) return; // Check if we already ended
      
      // Note there is no need to "~sendSer" logic as seen in Src; this
      // is because Tmps can only Send once!
      for (let fn of [ ...this.fns ]) this.fns.has(fn) && fn(arg);
      
      C.def(this, 'fns', Set.stub);
        
    };
    
    return {
      
      init(arg=null) {
        
        srcInit.call(this);
        endableInit.call(this);
        
        if      (arg instanceof Function) this.route(arg, 'prm');
        else if (arg) {
          
          let { cleanup=null, ...args } = arg; // TODO: in-band signal!
          Object.assign(this, args);
          if (cleanup) this.route(cleanup, 'prm');
          
        }
        
      },
      end: sendAndEnd,
      send: sendAndEnd,
      newRoute(fn) { if (this.off()) fn(); },
      endWith(val, mode='prm') {
        
        // Creates a relationship such that whenever `this` ends the supplied `val` also ends. If
        // `mode` is "prm" the relationship is permanent. If `mode` is "tmp" the relationship can
        // be severed, allowing `this` to end without `val` also ending. `mode === 'prm'` returns
        // `this` for convenience `mode === 'tmp'` returns a Tmp representing the relationship.
        // Note that if `val` is a Tmp and `mode` is "tmp", the endWith relationship is
        // automatically removed when `val` ends (this is intuitive; it simply removes the
        // reference from `this` to `val`, allowing `val` to be freed from memory, when it ends)
        
        // Note that the following is an anti-pattern:
        // 
        //    | let tmp1 = getSomeTmp(...);
        //    | let tmp2 = getSomeTmp(...);
        //    | let endWithTmp = tmp1.endWith(tmp2, 'tmp');
        //    | tmp2.endWith(endWithTmp);
        // 
        // The final line is unnecessary as `endWithTmp` is already
        // configured to end if `tmp2` ends before `tmp1`.
        
        /// {DEBUG=
        if (![ 'prm', 'tmp' ].has(mode)) throw Error(`Invalid mode: "${mode}"`);
        /// =DEBUG}
        
        // If `val` is a Function simply call it when `this` ends
        if (val instanceof Function) return this.route(val, mode) || this;
        
        /// {DEBUG=
        // Validate `val`
        if (!hasForm(val, Endable)) throw Error(`Value must be an Endable or Function (got ${getFormName(val)})`);
        /// =DEBUG}
        
        // If `val` is a Tmp and `mode` is "tmp", ensure that `val` ends when `this` ends - but if
        // `val` ends first, make sure the relationship is automatically removed
        if (mode === 'tmp' && hasForm(val, Tmp)) {
          
          if (val.off()) return val; // Repurpose `val`; we just need to return an ended Tmp!
          
          // If `this` ends, end `val`
          let endWithTmp = this.route(() => val.end(), 'tmp');
          
          // If `val` ends, end the "endsWith" relationship
          let remRelTmp = val.route(() => endWithTmp.end(), 'tmp');
          
          // If the relationship is ended externally stop waiting for
          // it to end; this is a permanent feature of `endWithTmp` and
          // this Route is never Ended
          let origCleanup = endWithTmp.cleanup.bind(endWithTmp);
          C.def(endWithTmp, 'cleanup', () => {
            origCleanup();
            remRelTmp.end();
          });
          
          return endWithTmp;
          
        }
        
        // `val` is an Endable but not necessarily a Tmp
        return this.route(() => val.end(), mode) || this;
        
      }
      
    };
    
  }});
  Tmp.stub = Tmp(); Tmp.stub.end();
  
  let Slots = form({ name: 'Slots', props: (forms, Form) => ({
    
    // Defines hierarchical access via an arbitrary access mechanism.
    
    $tryAccess: (v, p) => {
      try         { return v.access(p); }
      catch (err) { err.propagate(m => `Slot ${getFormName(v)} -> "${p}" failed: (${m})`); }
    },
    init() {},
    access: C.noFn('access', arg => {}),
    dive(dt, noSecondArg) {
      
      /// {DEPRECATED=
      if (noSecondArg) throw Error(`Api: provide 1 arg to seek (use an array?)`);
      /// =DEPRECATED}
      
      let val = this;
      for (let d of token.dive(dt)) {
        if (!val) { val = null; break; }
        val = (val.constructor === Promise.Native)
          ? val.then(v => Form.tryAccess(v, d))
          : Form.tryAccess(val, d);
      }
      return val;
      
    },
    seek(...args) {
      gsc.say(Error('Deprecated "seek" method (use "dive" instead)'));
      return this.dive(...args);
    }
    
  })});
  let Keep = form({ name: 'Keep', has: { Slots }, props: (forms, Form) => ({
    
    init() {},
    
    /// {DEBUG=
    desc: C.noFn('desc'),
    exists: C.noFn('exists'),
    getUri: C.noFn('getUri'),
    getData: C.noFn('getData'),
    setData: C.noFn('setData'),
    getContentType: C.noFn('getContentType'),
    getContentByteLength: C.noFn('getContentByteLength'),
    getKids: C.noFn('getKids', () => {
      // Generator returning [ key, Keep(...) ] entries, where
      // `this.access(key)` is expected to return the same Keep(...)
    }),
    streamable: C.noFn('streamable'),
    getDataHeadStream: C.noFn('getDataHeadStream'), // The "head" precedes the content; it allows piping *into* the Keep
    getDataTailStream: C.noFn('getDataTailStream') // The "tail" comes after the conent; it allows piping *out of* the Keep
    /// =DEBUG}
    
  })});
  
  Object.assign(global, { Subcon, Endable, Src, Tmp, Slots, Keep });
  
}

global.subcon = global.Subcon({
  rules: {
    // TODO: HEEERE moving to new sc style!
    output: (sc, ...args) => console.log(`\nSubcon "${sc.term}": ${global.formatAnyValue(args)}`),
    
    // The "root switching config" provides "chatter" and "therapy" switches (simple booleans) for
    // the entire possible tree of Subcons. It looks like:
    //    | type SubconRootParams = {}
    //    |   & { params: { chatter: boolean, therapy: boolean } }
    //    |   & { [key: string]: SubconRootParams }
    rootParams: { chatter: true, therapy: false }
  }
});

if (!global.gsc) global.gsc = global.subcon.kid('gsc');   // "global subcon"
if (!global.esc) global.esc = global.subcon.kid('error'); // "error subcon"
if (mustDefaultRooms) gsc.say(`Notice: defaulted global.rooms`);
