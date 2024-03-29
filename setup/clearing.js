'use strict';

// The "clearing" is javascript-level bootstrapping

/// {ASSERT=
if (!global) throw Error(`"global" must be available`);
if (!global.gsc) global.gsc = console.log;
if (!global.rooms) { global.rooms = {}; gsc(`Notice: defaulted global.rooms`); }
/// =ASSERT}

Object.assign(global, {
  AsyncFunction: (async () => {}).constructor,
  GeneratorFunction: (function*(){})().constructor,
  AsyncGeneratorFunction: (async function*(){})().constructor,
  C: Object.freeze({
    skip: undefined,
    noFn: name => Object.assign(
      function() { throw Error(`${getFormName(this)} does not implement "${name}"`); },
      { '~noFormCollision': true /* TODO: Use Symbol instead? */ }
    ),
    dbgCntMap: {},
    'Promise.all': Promise.all.bind(Promise)
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
        .map(key => [ key, { value: vals[key], enumerable: false, writable: true } ])
    ));
    
  };
  protoDefs(Object, {
    
    $stub: Object.freeze({}),
    $plain: obj => obj ? Object.assign(Object.create(null), obj) : Object.create(null),
    
    $$: 'has:hasOwnProperty',
    
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
    find(f) { // Iterator: (val, key) => bool; returns { found, val=null, key=null }
      for (let k in this) if (f(this[k], k)) return { found: true, val: this[k], key: k };
      return { found: false, val: null, k: null };
    },
    empty() { for (let k in this) return false; return true; },
    gain(...o) {
      // Note for performance we combine all source Objects first, to
      // reduce the number of items that need to be checked for skips
      // (and note that skips are simply applied by using `map`). This
      // is probably worth the overhead of calling `Object.assign` x2 
      return Object.assign(this, Object.assign({}, ...o).map(v => v));
    },
    merge(o) {
      for (let [ k, v ] of o) {
        
        // Non-Object properties are simple
        if (!isForm(v, Object)) { this[k] = v; continue; }
        
        if (!isForm(this[k], Object) || !this.has(k)) this[k] = {};
        this[k].merge(v);
        
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
    *[Symbol.iterator]() { for (let k in this) yield [ k, this[k] ]; }
    
  });
  protoDefs(Array, {
    
    $stub: Object.freeze([]),
    $from: Array.from, // (it, fn) => (isForm(it, Array) ? it : [ ...it ]).map(fn),
    
    $$: 'each:forEach,has:includes',
    
    map(it) { // Iterator: (val, ind) => val
      let ret = [];
      let len = this.length;
      for (let i = 0; i < len; i++) { let v = it(this[i], i); if (v !== skip) ret.push(v); }
      return ret;
    },
    toObj(it) { // Iterator: (val, ind) => [ key0, val0 ]
      let ret = [];
      let len = this.length;
      for (let i = 0; i < len; i++) { let v = it(this[i], i); if (v !== skip) ret.push(v); }
      return Object.fromEntries(ret);
    },
    find(f) { // Iterator: (val, ind) => bool; returns { found=false, val=null, ind=null }
      let n = this.length;
      for (let i = 0; i < n; i++) if (f(this[i], i)) return { found: true, val: this[i], ind: i };
      return { found: false, val: null, ind: null };
    },
    all(fn=Boolean) { return this.every(fn); },
    any(fn=Boolean) { return this.some(fn); },
    empty() { return !this.length; },
    add(...args) { this.push(...args); return args[0]; },
    rem(val) { let ind = this.indexOf(val); if (ind > -1) this.splice(ind, 1); },
    gain(...arrs) { for (let arr of arrs) this.push(...arr); return this; },
    count() { return this.length; },
    valSort(fn) { return this.sort((a, b) => fn(a) - fn(b)); },
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
    $base32: '0123456789abcdefghijklmnopqrstuv',
    $base62: '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
    $base64: '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ=-',
    
    $$: 'has:includes,hasHead:startsWith,hasTail:endsWith,padHead:padStart,padTail:padEnd,trimHead:trimStart,trimTail:trimEnd,upper:toUpperCase,lower:toLowerCase',
    
    cut(delim, num=1) {
      // `num` defines # of cuts (resulting array length is `num + 1`)
      let split = this.split(delim, num < Infinity ? num  : skip);
      let numDelimsSplit = split.length - 1;
      let lenConsumed = 0
        + split.reduce((a, s) => a + s.length, 0)
        + delim.length * numDelimsSplit;
      if (lenConsumed < this.length) split = [ ...split, this.slice(lenConsumed + delim.length) ];
      return split;
    },
    code(ind=0) { return this.charCodeAt(0); },
    count() { return this.length; },
    indent(...args /* amt=2, char=' ' | indentStr=' '.repeat(2) */) {
      
      let indentStr = null;
      if (isForm(args[0], String)) { indentStr = args[0]; }
      else                         { let [ amt=2, char=' ' ] = args; indentStr = char.repeat(amt); }
      return this.split('\n').map(ln => `${indentStr}${ln}`).join('\n');
      
    },
    encodeInt(chrs=String.base62) {
      if (!chrs) throw Error(`No characters provided`);
      if (chrs.count() === 1) return this.count();
      let cache = Object.create(null);
      let base = chrs.count();
      let sum = 0;
      let n = this.length;
      for (let i = 0; i < n; i++) {
        let c = this[i];
        if (cache[c] === skip) cache[c] = chrs.indexOf(c);
        sum += Math.pow(base, n - i - 1) * cache[c];
      }
      return sum;
    }
    
  });
  protoDefs(Number, {
    
    $int32: Math.pow(2, 32),
    $int64: Math.pow(2, 64),
    
    char() { return String.fromCharCode(this); },
    each(fn) { for (let i = 0; i < this; i++) fn(i); },
    toArr(fn) { let arr = new Array(this); for (let i = 0; i < this; i++) arr[i] = fn(i); return arr; },
    toObj(fn) { // Iterator: n => [ key, val ]
      let ret = [];
      for (let i = 0; i < this; i++) {
        let v = fn(i);
        if (v !== skip) ret.push(v);
      }
      return Object.fromEntries(ret);
    },
    encodeStr(a1, a2 /* String, Number; String -> chrs=String.base62, Number -> padLen=0 */) {
      
      // Note that base-1 requires 0 to map to the empty string. This also
      // means that, for `n >= 1`:
      //      |       (n).encodeStr(singleChr)
      // is always equivalent to
      //      |       singleChr.repeat(n - 1)
      
      let [ chrs=String.base62, padLen=0 ] = isForm(a1, String) ? [ a1, a2 ] : [ a2, a1 ];
      if (!isForm(chrs, String)) throw Error('No encoding language provided');
      if (!isForm(padLen, Number)) throw Error(`Pad length must be Number (got ${getFormName(padLen)})`);
      
      let base = chrs.count();
      if (base === 1 && padLen) throw Error(`Can't pad when using base-1 encoding`);
      
      let n = this.valueOf();
      let amt = 1;
      
      // Figure out how many digits (chars) the resulting String will have
      let digits = 1;
      if (base === 1)   { digits = n; n = 0; }
      else              { while (true) { let t = amt * base; if (t > n) break; digits++; amt = t; } }
      
      // Select the highest non-overflowing value for each digit in turn
      // (starting from highest digit)
      let seq = [];
      for (let p = digits - 1; p >= 0; p--) {
        let pow = Math.pow(base, p);
        let div = Math.floor(n / pow);
        seq.push(chrs[div]);
        n -= pow * div;
      }
      
      return seq.join('').padHead(padLen, chrs[0]);
      
    },
    isInteger() { return this === this | 0; },
    * [Symbol.iterator]() { for (let i = 0; i < this; i++) yield i; },
    * bits() { let n = this >= 0 ? this : -this; while (n) { yield n & 1; n = n >> 1; } },
    
    map: undefined // Prevent `Number(...).map`
    
  });
  protoDefs(Function, {
    
    $stub: v => v,
    $createStub: v => () => v
    
  });
  protoDefs(Error, {
    
    $stackTraceLimit: 150,
    
    mod(props={} /* { ctxErr, msg, message, ...more } */) {
      
      if (isForm(props, Function)) props = props(this.message);
      if (isForm(props, String)) props = { message: props };
      
      let { ctxErr=null, msg=null, message=msg||this.message, ...moreProps } = props;
      
      // The stack should embed the "message" property - changing the
      // messages means the stack should change too
      let reflectMessageChangeInStack = true
        && this.stack
        && this.message
        && message
        && message !== this.message;
      if (reflectMessageChangeInStack) this.stack = this.stack.replace(this.message, message);
      
      if (ctxErr && !this.stack) this.stack = ctxErr.stack;
      if (ctxErr && !this.message) this.message = ctxErr.message;
      
      if (ctxErr) this.ctxErr = ctxErr;
      if (message) this.message = message;
      
      return Object.assign(this, moreProps);
      
    },
    propagate(props /* { ctxErr, msg, message, ...more } */) { throw this.mod(props); }
    
  });
  protoDefs(Date, {
    
    $now: Date.now,
    $nowStr: (...args) => (new Date()).format(...args),
    
    format(dateSep='-', sep=' ', timeSep=':', msSep='.') {
      
      return [
        this.getUTCFullYear(),
        dateSep,
        (this.getUTCMonth() + 1).toString(10).padHead(2, '0'),
        dateSep,
        this.getUTCDate().toString(10).padHead(2, '0'),
        sep,
        this.getUTCHours().toString(10).padHead(2, '0'),
        timeSep,
        this.getUTCMinutes().toString(10).padHead(2, '0'),
        timeSep,
        this.getUTCSeconds().toString(10).padHead(2, '0'),
        msSep,
        this.getUTCMilliseconds().toString(10).padHead(3, '0')
      ].join('');
      
    }
    
  });
  
  let newlessProtoDefs = (Cls, vals) => {
    
    // Extend prototypes and allow instantiation without "new"
    
    let name = Cls.name;
    let Newless = global[name] = function(...args) { return new Cls(...args); };
    Object.defineProperty(Newless, 'name', { value: name });
    Newless.Native = Cls;
    Newless.prototype = Cls.prototype;
    
    protoDefs(Newless, vals);
    
  };
  newlessProtoDefs(Promise, {
    
    $all: (prms, mapFn=null) => {
      
      if (mapFn) prms = prms.map(mapFn);
      
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
    find(fn) { // Iterator: (val) => bool; returns { found, val }
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
    find(f) { // Iterator: (val, key) => bool; returns { found, val, key }
      for (let [ k, v ] of this) if (f(v, k)) return { found: true, val: v, key: k };
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
  newlessProtoDefs(GeneratorFunction, {
    each(fn) { for (let v of this) fn(v); },
    toArr(fn) { return [ ...this ].map(fn); },
    toObj(fn) {
      let ret = {};
      for (let v of this) { v = it(v); if (v !== skip) ret[v[0]] = v[1]; }
      return ret;
    }
  });
  
}

// Define Hut's native global functionality
Object.assign(global, {
  
  U: global,
  
  // Debug
  debugUtil: {
    
    globalEndableRegistry: Set.stub,
    timings: null,
    addTiming: Function.stub,
    timingInterval: null
    
    // globalEndableRegistry: Set(),
    // timings: [ 'defineForm', 'createFact' ].toObj(v => [ v, { num: 0, ms: 0 } ]),
    // addTiming: (term, ms, obj=debug.timings[term]) => { obj.num++; obj.ms += ms; },
    // timingInterval: setInterval(() => {
    //   console.log('Debug timings:');
    //   for (let [ term, { num, ms } ] of debug.timings)
    //     console.log(`  ${term}: ${(!ms && !num ? 0 : (ms / num)).toFixed(2)}ms (total: ${ms.toFixed(2)}ms; num: ${num})`);
    // }, 5000)
    
  },
  dbgCnt: name => C.dbgCntMap[name] = (C.dbgCntMap.has(name) ? C.dbgCntMap[name] + 1 : 0),
  
  // Flow controls, sync/async interoperability
  onto: (val, ...fns) => (fns.each(fn => fn(val)), val),
  safe: (fn, onErr=e=>e) => {
    
    // Allow `onErr` to be provided as a constant
    if (!isForm(onErr, Function)) onErr = Function.createStub(onErr);
    try         { let r = fn(); return isForm(r, Promise) ? r.fail(onErr) : r; }
    catch (err) { return onErr(err); }
    
  },
  then: (v, rsv=Function.stub, rjc=null) => {
    
    // Act on `v` regardless of whether it's a Promise or an immediate
    // value. This function will return the result of `rsv(v)` either
    // immediately, or as a Promise.
    
    // Promises are returned with `then`/`fail` handling
    if (v instanceof Promise) return v.then(rsv).catch(rjc);
    
    // No `rjc` means no `try`/`catch` handling
    if (!rjc) return rsv(v);
    
    try         { return rsv(v); }
    catch (err) { return rjc(err); }
    
  },
  thenAll: (v, ...args /* rsv, rjc */) => {
    if (v.find(v => v instanceof Promise).found) v = Promise.all(v);
    return then(v, ...args);
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
        
        let utilProp = propsOfThatName.find(v => !!v).val;
        if (utilProp) collisionProps = [ utilProp ];
        else          continue;
        
      } else if (collisionProps.length > 1) {
        
        let definingForms = collisionProps.map(prop => Form['~forms'].find(ParForm => ParForm.prototype[propName] === prop).val);
        throw Error([
          `Form ${name} has ambiguous "${propName}" property `,
          `from ${collisionProps.length} ParentForms `,
          `(${definingForms.map(Form => Form ? Form.name : '???').join(', ')}). `,
          `Define ${name}.prototype.${propName}.`
        ].join(''));
        
      }
      
      Object.defineProperty(Form.prototype, propName, { value: collisionProps[0], enumerable: false, writable: true });
      
    }
    
    Object.defineProperty(Form.prototype, 'Form', { value: Form, enumerable: false, writable: true });
    Object.defineProperty(Form.prototype, 'constructor', { value: Form, enumerable: false, writable: true });
    Object.freeze(Form.prototype);
    
    // Would be very satisifying to freeze `Form`, but the current
    // pattern of defining specialized subclasses:
    // 
    //    |     FnSrc.Tmp1 = form(...);
    // 
    // relies on `Form` being mutable :(
    for (let k in statics) statics[k] = [ ...statics[k] ][0];
    Object.assign(Form, statics);
    // Object.freeze(Form);
    
    return Form;
    
  },
  isFormFn: Form => Form && Form['~forms'],
  isForm: (fact, Form) => {
    
    // NaN only matches against the NaN primitive (not the Number Form)
    if (fact !== fact) return Form !== Form;
    if (Form === null) return fact === null;
    
    // Prefer to compare against `FormNative`. Some native Cls
    // references represent the hut-altered form (e.g. they have an
    // extended prototype and can be called without "new"). Such Cls
    // references are not true "Classes" in that they are never set as
    // the "constructor" property of any instance - "contructor"
    // properties will always reflect the native, unmodified Cls. Any
    // Cls which has been hut-modified will have a "Native" property
    // pointing to the original class, which serves as a good value to
    // compare against "constructor" properties
    return fact?.constructor === (Form.Native ?? Form);
    
  },
  hasForm: (fact, FormOrCls) => {
    
    if (fact == null) return false;
    
    // `fact` may either be a fact/Form, or an instance/Cls. In case a
    // fact/instance was given, the "constructor" property points us to
    // the appropriate Form/Cls. We name this value "Form", although it
    // is ambiguously a Form/Cls.
    let Form = (fact?.constructor === Function) ? fact : fact.constructor;
    if (Form === FormOrCls) return true;
    
    // If a "~forms" property exists `FormOrCls` is specifically a Form
    // and inheritance can be checked by existence in the set
    if (Form?.['~forms']) return Form['~forms'].has(FormOrCls);
    
    // No "forms" property; FormOrCls is specifically a Cls. Inheritance
    // can be checked using `instanceof`; prefer to compare against a
    // "Native" property (which facilitates "newless" instances)
    return (fact instanceof (FormOrCls.Native || FormOrCls));
    
  },
  getFormName: f => {
    if (f === null) return 'Null';
    if (f === undefined) return 'Undefined';
    if (f !== f) return 'NaN';
    return f?.constructor?.name ?? 'Prototypeless'; // e.g. `getFormName(Object.plain()) === 'Prototypeless'`
  },
  
  // Util
  // TODO: These should have "json" in their names (there are cases that
  // could use these functions, but should explicitly signify that the
  // resulting value is JSON - e.g. for 3rd party json api requests)
  valToJson: JSON.stringify,
  jsonToVal: JSON.parse,
  
  valToSer: JSON.stringify,
  serToVal: JSON.parse
  
});

{ // Define global Forms: Endable, Src, Tmp, etc.

  let Endable = form({ name: 'Endable', props: (forms, Form) => ({
    
    $turnOffDefProp: { value: () => false, enumerable: true, writable: true, configurable: true },
    
    init(fn) {
      
      // Allow Endable.prototype.cleanup to be masked
      if (fn) Object.defineProperty(this, 'cleanup', { value: fn, enumerable: true, writable: true, configurable: true });
      
      /// {DEBUG=
      debugUtil.globalEndableRegistry.add(this);
      /// =DEBUG}
      
    },
    onn() { return true; },
    off() { return !this.onn(); },
    cleanup() {},
    
    ref() {
      
      // Note that "ref'ing" an Endable indicates that it has additional
      // "ownership" - that is, other owning contexts that may try to
      // end it do not have sole authority to determine the Endable's
      // end. We could describe ref'ing as "bolstering" or "demanding".
      
      if (this.off()) throw Error(`Can't ref ended ${getFormName(this)}`);
      
      // I had to decide whether the initial call to `ref` initializes
      // "~refCount" to 1 or 2. Imagine this scenario:
      // 
      //    | let initMyEndable = () => {
      //    |   let e = initEndableSomehow();
      //    |   doThingThatRefsEndable(e);
      //    |   uponSomeCondition(() => e.end());
      //    | };
      // 
      // If "~refCount" initialized to 1, it would be necessary for
      // `initMyEndable` to be aware that the `e` it is initializing is
      // destined to be ref'd (by `doThingThatRefsEndable`). This is
      // because `doThingThatRefsEndable` will call `e.ref()`, setting
      // `e['~refCount'] === 1`, and then `e.end()`, decrementing
      // `e['~refCount'] === 0` - the ref count would hit 0, and `e`
      // would fully end, which is not good for `initMyEndable` which
      // doesn't expect `e` to end from `doThingThatRefsEndable` - since
      // `initMyEndable` is the "initializer" (or "owner") of `e`. This
      // is why setting the initial "~refCount" to 2 improves behaviour;
      // the "owner" of an Endable(...) never needs to know whether `e`
      // will go on to be ref'd later. Only non-owners will be ref'ing
      // Endables; this means the first call to `ref` increments 1 for
      // the non-owner's context, plus an additional 1 (total 2)
      // indicating that another context also owns the Endable!
      this['~refCount'] = (this['~refCount'] || 1) + 1;
      
      return this;
      
    },
    end() {
      
      // Only returns `false` if this is already ended.
      
      if (this.off()) return false;
      
      // For ref'd Endables, prevent ending if refs still exist
      if (this['~refCount'] && --this['~refCount'] > 0) return false;
      
      Object.defineProperty(this, 'onn', Form.turnOffDefProp);
      debugUtil.globalEndableRegistry.rem(this);
      this.cleanup();
      return true;
      
    }
    
  })});
  
  let Src = form({ name: 'Src', props: (forms, Form) => ({
    
    init() { this.fns = Set(); },
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
      if (mode === 'tmp') return Tmp(() => this.fns.rem(fn));
      
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
      
      // Does this Src only work with a single value at once?
      singleton: false,
      
      // Does this Src only send Tmps?
      tmpsOnly: false
      
      // { memory: true }
      // - `newRoute` is probably implemented
      // - `countSent` should be implemented
      
      // { singleton: true }
      // - The Sending of a new value indicates the outdatedness of any
      //   previous value
      // - Newly added Routes will be immediately called maximum once
      
      // { singleton: true, tmpsOnly: true }
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
      
    },
    
    map(fn) { return Src.Mapped(this, fn); }
    
  })});
  Src.stub = { route: () => Tmp.stub, send: Function.stub };
  Src.Mapped = form({ name: 'Src.Mapped', has: { Endable, Src }, props: (forms, Form) => ({
    
    init(src, fn) {
      
      forms.Endable.init.call(this);
      forms.Src.init.call(this);
      
      this.src = src;
      this.fn = fn;
      
      // Inefficient when `src` stores many items; they'll all send, and
      // there are no routes
      this.mapRoute = src.route(val => {
        val = this.fn(val);
        if (val !== skip) this.send(val);
      });
      
    },
    newRoute(fn) {
      this.src.newRoute(val => {
        val = this.fn(val);
        if (val !== skip) fn(val);
      });
    },
    
    cleanup() { this.mapRoute.end(); }
    
  })});
  
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
      
      this.fns = Set.stub;
      return;
      
    };
    
    return {
      
      init(arg=null) {
        
        srcInit.call(this);
        endableInit.call(this);
        
        if (arg) {
          
          // Function arg is treated as permanent end Route
          if (hasForm(arg, Function)) {
            
            this.route(arg, 'prm');
            
          } else if (isForm(arg, Object)) {
            
            /// {DEBUG=
            for (let k in arg) if (this[k]) throw Error(`Conflicting prop "${k}" on ${getFormName(this)}`);
            /// =DEBUG}
            
            Object.assign(this, arg);
            
          } else {
            
            throw Error(`Unexpected arg: ${getFormName(arg)}`);
            
          }
          
        }
        
      },
      end: sendAndEnd,
      send: sendAndEnd,
      newRoute(fn) { if (this.off()) fn(); },
      endWith(val, mode='prm') {
        
        // Creates a relationship such that whenever `this` ends the
        // supplied `val` also ends. If `mode` is "prm" the relationship
        // is permanent. If `mode` is "tmp" the relationship can be
        // severed, allowing `this` to end without `val` also ending.
        // `mode === 'prm'` returns `this` for convenience
        // `mode === 'tmp'` returns a Tmp representing the relationship.
        // Note that if `val` is a Tmp and `mode` is "tmp", the endWith
        // relationship is automatically removed when `val` ends (this
        // is intuitive; it simply removes the reference from `this` to
        // `val`, allowing `val` to be freed from memory, when it ends)
        
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
        
        // If `val` is a Tmp and `mode` is "tmp", ensure that `val` ends
        // when `this` ends - but if `val` ends first, make sure the
        // relationship is automatically removed
        if (mode === 'tmp' && val.constructor['~forms'].has(Tmp)) {
          
          // If `this` ends, end `val`
          let endWithTmp = this.route(() => val.end(), 'tmp');
          
          // If `val` ends, end the "endsWith" relationship
          let remRelTmp = val.route(() => endWithTmp.end(), 'tmp');
          
          // If the relationship is ended externally stop waiting for
          // it to end; this is a permanent feature of `endWithTmp` and
          // this Route is never Ended
          endWithTmp.route(() => remRelTmp.end(), 'prm');
          
          return endWithTmp;
          
        }
        
        // `val` is an Endable but not necessarily a Tmp
        return this.route(() => val.end(), mode) || this;
        
      }
      
    };
    
  }});
  Tmp.stub = onto(Tmp(), t => t.end());
  
  let Slots = form({ name: 'Slots', props: (forms, Form) => ({
    
    // Defines heirarchical access via an arbitrary access mechanism.
    
    $tryAccess: (v, p) => {
      try         { return v.access(p); }
      catch (err) { err.propagate(m => `Slot ${getFormName(v)} -> "${p}" failed: (${m})`); }
    },
    init() {},
    access: C.noFn('access', arg => {}),
    seek(...args) {
      
      let val = this;
      for (let arg of args) {
        if (isForm(val, Promise)) val = val.then(v => Form.tryAccess(v, arg));
        else if (val)             val = Form.tryAccess(val, arg);
        else                      { val = null; break; }
      }
      return val;
      
    }
    
  })});
  
  let Keep = form({ name: 'Keep', pars: { Slots }, props: (forms, Form) => ({
    
    init() {},
    
    /// {DEBUG=
    desc: C.noFn('desc'),
    getContent: C.noFn('getContent'),
    setContent: C.noFn('setContent'),
    getContentType: C.noFn('getContentType'),
    getContentByteLength: C.noFn('getContentByteLength'),
    iterateChildren: C.noFn('iterateChildren', () => {
      // Generator returning [ key, Keep(...) ] entries, where
      // `this.access(key)` is expected to return the same Keep(...)
    }),
    getHeadPipe: C.noFn('getHeadPipe'), // The "head" precedes the content; it allows piping *into* the Keep
    getTailPipe: C.noFn('getTailPipe') // The "tail" comes after the conent; it allows piping *out of* the Keep
    /// =DEBUG}
    
  })});
  
  let Conf = form({ name: 'Conf', pars: { Slots }, props: (forms, Form) => ({
    
    $stub: Object.freeze({
      name: 'stub',
      desc: () => '<stub>',
      setVal: Function.stub,
      val: null,
      seek: () => Form.stub,
      access: () => Form.stub
    }),
    
    init({ name, schema=Object.plain(), val=null }={}) {
      
      /// {ASSERT=
      if (schema === null) throw Error(`Schema can't be null`);
      if (!name) throw Error(`Must provide "name"`);
      /// =ASSERT}
      
      forms.Slots.init.call(this);
      Object.assign(this, { name, schema, val, par: null, kids: Object.plain() });
      
    },
    chain(ret=[], ptr=this) {
      while (ptr) { ret.unshift(ptr); ptr = ptr.par; }
      return ret;
    },
    cname() { return this.chain().slice(1).map(c => c.name).join('.'); },
    access(name) {
      // Accessing a non-existing `name` results in a Stub
      return this.kids[name] || Form.stub;
    },
    
    setVal(val=null) {
      
      // Set `this.val` (using `this.schema.fn` if possible). Note we're
      // careful to immediately set `this.val` to non-null, in case
      // `this.schema.fn` winds up recursively calling `this.setVal` we
      // don't instantiate a 2nd process to resolve `this.val`!
      
      if (this.schema.fn) val = this.schema.fn(val, this);
      
      // Immediately initialize `this.val` to a deferred-style Promise.
      // Silence rejections from `this.val`; `setVal` will still return
      // a rejected Promise if anything fails asynchronously, and any
      // attempt by the consumer to interface with the silenced rejected
      // result will still result in an Error because the following
      // causes an unhandled rejection:
      //    | let rejected = Promise((rsv, rjc) => setTimeout(rjc, 100));
      //    | rejected.catch(err => {});     // Silenced
      //    | rejected.then(val => { ... }); // Causes unhandled rejection regardless of previous silencing
      let prm = this.val = Promise.later();
      prm.catch(() => {});
      
      return then(val,
        val => { prm.resolve(val); return this.val = val; },
        err => { prm.reject(err); throw err; }
      );
      
    },
    
    addKid(kid) {
      
      if (isForm(kid, Object)) kid = new this.Form(kid);
      
      /// {DEBUG=
      if (kid.par) throw Error(`Kid "${kid.name}" already has parent`);
      if (this.kids[kid.name]) throw Error(`Already have child named "${kid.name}"`);
      /// =DEBUG}
      
      if (this.schema.kids) kid.schema = this.schema.kids[kid.name] ?? this.schema.kids['*'] ?? Object.plain();
      
      kid.par = this;
      this.kids[kid.name] = kid;
      
      return kid;
      
    },
    getKid(name) { return this.kids[name] || this.addKid({ name }); }
    
  })});
  
  Object.assign(global, { Endable, Src, Tmp, Slots, Keep, Conf });
  
}
