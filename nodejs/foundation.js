'use strict';

require('../room/setup/clearing/clearing.js');

// Make Errors better! (https://v8.dev/docs/stack-trace-api)
Error.prepareStackTrace = (err, callSites) => {
  
  let trace = callSites.map(cs => {
    
    let file = cs.getFileName();
    if (!file || file.hasHead('node:')) return skip;
    return {
      type: 'line',
      fnName: cs.getFunctionName(),
      keepTerm: [ '', '[file]', ...cs.getFileName().split(/[/\\]+/) ].join('/'),
      row: cs.getLineNumber(),
      col: cs.getColumnNumber()
    };
    
  });
  return `{HUTTRACE=${valToJson(trace)}=HUTTRACE}`;
  
};

// Set up basic process monitoring
(() => {
  
  // https://nodejs.org/api/process.html#signal-events
  let origExit = process.exit;
  let revealBufferedLogs = () => {
    if (!global.bufferedLogs?.length) return;
    console.log('Error before logs displayable; outputting raw logged data:');
    for (let args of global.bufferedLogs) console.log(...args);
  };
  process.exit = (...args) => {
    gsc(Error('Process explicitly exited').desc());
    revealBufferedLogs();
    return origExit.call(process, ...args);
  };
  
  // NOTE: Trying to catch SIGKILL or SIGSTOP crashes posix!
  // https://github.com/nodejs/node-v0.x-archive/issues/6339
  let evts = 'hup,int,pipe,quit,term,tstp,break'.split(',');
  let haltEvts = Set('int,term,quit'.split(','));
  for (let evt of evts) process.on(`SIG${evt.upper()}`, (...args) => {
    gsc(`Process event: "${evt}"`, args);
    haltEvts.has(evt) && process.exit(isForm(args[1], Number) ? args[1] : -1);
  });
  
  let onErr = err => {
    if (err['~suppressed']) return; // Ignore suppressed errors
    gsc(`Uncaught ${getFormName(err)}:`, err.desc());
    revealBufferedLogs();
    origExit(1);
  };
  process.on('uncaughtException', onErr);
  process.on('unhandledRejection', onErr);
  //process.on('exit', code => gsc(`Process exit event (code: ${code})`));
  
})();

let { rootTransaction: rootTrn, Filepath, FsKeep } = require('./filesys.js');

let niceRegex = (...args) => {
  
  let [ flags, str ] = (args.length === 2) ? args : [ '', args[0] ];
  
  let lns = str.split('\n').map(line => line.trimTail());
  let cols = Math.max(...lns.map(line => line.length)).toArr(col => Set(lns.map(ln => ln[col])));
  cols.each(col => col.size > 1 && col.rem(' '));
  
  /// {DEBUG=
  for (let col of cols) if (col.size > 1) throw Error(`Conflicting values at column ${num}: [${[ ...col ].join('')}]`);
  /// =DEBUG}
  
  return RegExp(cols.map(col => [ ...col ][0]).join(''), flags);
  
};
let RoomLoader = form({ name: 'RoomLoader', props: (forms, Form) => ({
  
  // Note that "#", a totally irrelevant character, is replaced with "`"
  // making it simpler to indicate literal backtick chars
  // Note that items under `RoomLoader(...).`
  
  // Avoid "//" inside String by processing non-String-open characters,
  // or fully enclosed Strings (note: may fail to realize that a String
  // remains open if it has escaped quotes e.g. 'i criii :\')'; note the
  // lookbehind ("?<=") excludes any content from the actual match
  $captureLineCommentRegex: niceRegex(String.baseline(`
    | (?<=                                  )
    |     ^(      |       |       |       )* [ ]*
    |       [^'"#] '[^']*' "[^"]*" #[^#]*#       [/][/].*
  `).replace(/#/g, '`')),
  
  // Avoid "/*" inside Strings; capture the ending "*/" on the same line
  $captureInlineBlockCommentRegex: niceRegex('g', String.baseline(`
    | (?<=                                           )
    |     ^(?:     |           |           |       )* [ ]*         [^*]|[*][^/]
    |         [^'"] ['][^']*['] ["][^"]*["] #[^#]*#       [/][*](?:            )*[*][/]
  `).replace(/#/g, '`')),
  
  init({ srcKeep, cmpKeep }) { Object.assign(this, { srcKeep, cmpKeep, loaded: Object.plain() }); },
  batch(names, opts={}) {
    
    let err = Error('trace');
    return thenAll(names.toObj(name => {
      
      if (!this.loaded[name]) {
        
        this.loaded[name] = safe(
          () => this.evaluate(name, opts), // `Object.assign(() => { ... }, { offsets: [ ... ] })`
          cause => err.propagate({ cause, msg: `Failed to load Room from term "${name}"` })
        );
        then(this.loaded[name], v => this.loaded[name] = v);
        
      }
      
      return [ name, this.loaded[name] ];
      
    }));
    
  },
  
  compileContent(bearing, content, { debug=true, assert=true, ...opts }={}) {
    
    // `global.compileContent` requires a `variantDef`; this function
    // only requires a simple `bearing` (which it uses to generate the
    // variantDef); also scrubs single-line comments!
    
    let variantDef = {
      above: bearing === 'above',
      below: bearing === 'below',
      debug,
      assert
    };
    return global.compileContent(variantDef, content, {
      ...opts,
      lineFn: line => line
        .replace(Form.captureLineCommentRegex, '')
        .replace(Form.captureInlineBlockCommentRegex, '')
    });
    
  },
  async evaluate(name, { bearing='above', debug=true, assert=true, ...opts }={}) {
    
    // Avoid calling `evaluate` on the same name more than once (this
    // also means that the initial `bearing` provided is also the only
    // one that can ever be evaluated)
    
    let namePcs = name.split('.');
    let srcKeep = this.srcKeep.access([ ...namePcs, `${namePcs.slice(-1)[0]}.js` ]);
    let content = await srcKeep.getContent('utf8');
    if (!content) throw Error(`Invalid room: "${name}"`);
    
    let { lines, offsets } = this.compileContent(bearing, content, { debug, assert, sourceName: srcKeep.desc() });
    
    let cmpKeep = this.cmpKeep.seek([ bearing, name, 'cmp' ]);
    await cmpKeep.setContent(lines.join('\n'));
    
    let dbgKeep = this.cmpKeep.seek([ bearing, name, 'debug' ]);
    await dbgKeep.setContent(valToSer({ offsets }));
    
    global.rooms[name] = { offsets }; // Make debug info available before `require` to help map SyntaxErrors
    
    require(cmpKeep.fp.fsp());
    if (!global.rooms[name]) throw Error(`Room "${name}" didn't set global.rooms['${name}']`);
    if (!hasForm(global.rooms[name], Function)) throw Error(`Room "${name}" set non-function at global.rooms['${name}']`).mod({ value: global.rooms[name] });
    
    // The file executed and defined `global.room[name]` to be a
    // function; return a call to that function!
    return Object.assign(global.rooms[name], { offsets })(this.srcKeep.access(namePcs));
    
  },
  async getCompiledKeep(name, { bearing='above', debug=true, ...opts }) {
    
    // Note that for every first unique (name, bearing) pair all further
    // requests for that pair will result in the initial result (using
    // `{ debug, ...opts }` from the first result)
    
  },
  mapSrcToCmp(file, row, col) {
    
    // Note `file` is a String with sequential slashes (bwds and fwds)
    // replaced with a single forward slash
    // Returns `{ file, col, row, context }`
    
    let givenKeep = global.keep(file);
    
    // Only map compiled files
    if (!this.cmpKeep.contains(givenKeep)) return { file: givenKeep.desc(), row, col, context: null };
    
    let pcs = givenKeep.fp.cmps.slice(this.cmpKeep.fp.cmps.length);
    let [ bearing, name, cmp ] = pcs;
    
    let { offsets } = global.rooms[name];
    
    let context = {};   // Store metadata from final relevant offset
    let srcRow = 0;     // The line of code in the source which maps to the line of compiled code
    let srcCol = 0;     // Corresponding column
    let nextOffset = 0; // The index of the next offset chunk which may take effect (lookahead)
    for (let i = 0; i < row; i++) {
      
      // Find all the offsets which exist for the source line
      // For each offset increment the line in the source file
      while (offsets[nextOffset] && offsets[nextOffset].at === srcRow) {
        Object.assign(context, offsets[nextOffset]);
        srcRow += offsets[nextOffset].offset;
        nextOffset++;
      }
      srcRow++;
      
    }
    
    let roomPcs = name.split('.');
    let roomPcLast = roomPcs.slice(-1)[0];
    return {
      file: this.srcKeep.fp.kid([ roomPcs, roomPcLast + '.js' ]).desc(),
      row: srcRow,
      col: srcCol,
      context
    };
    
  }
  
})});
let Schema = form({ name: 'Schema', props: (forms, Form) => ({
  
  // Note that Schemas return Conf (pure json). Any translation to typed
  // data (e.g. NetworkIdentity, Keep, etc) happens externally!
  // Ok I am revising the above. A Schema can deal with non-json, even
  // non-serializable values, but it isn't recommended in most cases
  // (TODO: May be nice to have explicit serializability controls to
  // prevent attempts to transfer non-serializable (or sensitive) data
  // over the wire)
  // Note that for the purposes of running Hut Above we simply use this
  // Schema Form to process the configuration (potentially producing
  // useful error output), and then simply do away with the Schema
  // instances and work directly with the data parsed by them!
  
  init({ name='??', par=null, kids=Object.plain(), all=null, fn=null }={}) {
    
    Object.assign(this, { name, par, fn, kids, all });
    
  },
  desc() { return `${getFormName(this)}( ${this.chain()} )`; },
  chain() {
    
    let chain = [];
    let ptr = this;
    while (ptr) { chain.push(ptr.name); ptr = ptr.par; }
    return '->' + chain.reverse().slice(1).join('->');
    
  },
  at(chain) {
    
    if (isForm(chain, String)) chain = chain.split('.');
    let ptr = this;
    for (let name of chain) {
      if (name === '*') {
        if (!ptr.all) ptr.all = Schema({ name: '(all)', par: ptr });
        ptr = ptr.all;
      } else {
        if (!ptr.kids[name]) ptr.kids[name] = Schema({ name, par: ptr });
        ptr = ptr.kids[name];
      }
    }
    return ptr;
    
  },
  inner(obj, chain='') {
    
    let kidsAndObj = { ...{}.map.call(this.kids, v => null), ...obj };
    
    if (kidsAndObj.empty()) return null;
    return kidsAndObj.map((v, k) => {
      
      if (this.kids[k]) return this.kids[k].getConf(v, `${chain}->${k}`);
      if (this.all) return this.all.getConf(v, `${chain}->${k}`);
      throw Error(`Unexpected: ${chain}->${k}`);
      
    });
    
  },
  getConf(obj, chain='') { return this.fn ? this.fn(obj, this, chain) : this.inner(obj, chain); }
  
})});

let makeSchema = () => {
  
  let resolveKeep = val => val;
  let error = (chain, val, msg, err=Error()) => err.propagate({ msg: `Api: config at "${chain}": ${msg}`, chain, val });
  let validate = (chain, val, v=null) => {
    
    if (v === null) throw Error('Supply 3rd param');
    
    if (isForm(v, String)) {
      
      if (v === 'integer') {
        validate(chain, val, { form: Number });
        if (!val.isInteger()) error(chain, val, 'requires integer');
      }
      
      if (v === 'keep') validate(chain, val, token.dive); // "keep" values are simply valid for `token.dive`
      
    } else if (isForm(v, Function)) {
      
      try { v(val); } catch (err) { error(chain, val, err.message); }
      
    } else {
      
      let { numberBound=null, arrayBound=null, stringBound=null } = v;
      if (numberBound) {
        validate(chain, val, { form: Number });
        if (numberBound.has('min') && val < numberBound.min) error(chain, val, `must have minimum value ${numberBound.min} but got ${val}`);
        if (numberBound.has('max') && val > numberBound.max) error(chain, val, `must have maximum value ${numberBound.max} but got ${val}`);
      }
      if (arrayBound) {
        validate(chain, val, { form: Array });
        if (arrayBound.has('min') && val.length < arrayBound.min) error(chain, val, `must have minimum ${arrayBound.min} item(s) but got ${val.length}`);
        if (arrayBound.has('max') && val.length > arrayBound.max) error(chain, val, `must have maximum ${arrayBound.max} item(s) but got ${val.length}`);
      }
      if (stringBound) {
        validate(chain, val, { form: String });
        if (stringBound.has('min') && val.length < stringBound.min) error(chain, val, `must have minimum ${stringBound.min} item(s) but got ${val.length}`);
        if (stringBound.has('max') && val.length > stringBound.max) error(chain, val, `must have maximum ${stringBound.max} item(s) but got ${val.length}`);
      }
      
      let { form=null, regex=null, desc=null, options=null } = v;
      if (form) {
        if (!isForm(val, form)) error(chain, val, `requires ${form.name} but got ${getFormName(val)}`);
      }
      if (regex) {
        validate(chain, val, { form: String });
        if (!regex.test(val)) error(chain, val, `must match ${regex}${desc ? ' (' + desc + ')' : ''}`);
      }
      if (options) {
        if (!options.has(val)) error(chain, val, `valid options are [ ${options.join(', ')} ] (got ${val})`);
      }
      
    }
    
    return val;
    
  };
  
  let scm = Schema({ name: '(root)' });
  scm.at('confs').fn = (val, schema, chain) => {
    
    if (val === null) return [ '/file:mill/conf/def.js' ];
    if (val === String) val = val.split(',').map(v => v.trim());
    
    validate(chain, val, { form: Array });
    
    return val;
    
  };
  
  scm.at('subcons').fn = (val, schema, chain) => {
    
    if (val === null) val = {};
    
    let defaults = {
      gsc: {
        description: 'Global Subcon - primary dev output',
        output: { inline: true, therapist: false }
      }
    };
    defaults.merge(val);
    
    return schema.inner(defaults, chain);
    
  };
  let subconsScm = scm.at('subcons.*');
  subconsScm.at('description').fn = (val, schema, chain) => {
    
    if (val === null) val = '(No description)';
    return validate(chain, val, { form: String });
    
  };
  subconsScm.at('output').fn = (val, schema, chain) => {
    
    if (val === null) val = { inline: true, therapist: false };
    return validate(chain, val, { form: Object });
    
  };
  subconsScm.at('output.inline').fn = (val, schema, chain) => {
    
    if (val === null) val = 0;
    if ([ 0, 1 ].has(val)) val = !!val;
    return validate(chain, val, { form: Boolean });
    
  };
  subconsScm.at('output.therapist').fn = (val, schema, chain) => {
    
    if (val === null) val = 0;
    
    if ([ 0, 1 ].has(val)) val = !!val;
    return validate(chain, val, { form: Boolean });
    
  };
  subconsScm.at('format').fn = (val, schema, chain) => {
    
    // TODO: Functions can't be synced?
    return val
      ? validate(chain, val, { form: Function })
      : null;
    
  };
  subconsScm.at('*').fn = (val, schema, chain) => val; // Allow arbitrary properties
  
  let shellScm = scm.at('shell');
  shellScm.at('openssl').fn = (val, schema, chain) => {
    
    if (val === null) val = 'openssl';
    return validate(chain, val, { form: String });
    
  };
  
  scm.at('netIdens').fn = (val, schema, chain) => {
    
    if (val === null) val = {};
    return val;
    
  };
  let idenScm = scm.at('netIdens.*');
  idenScm.fn = (val, schema, chain) => {
    
    validate(chain, val, { form: Object });
    
    if (!val.has('name')) val = { name: chain.split('->').slice(-2)[0], ...val };
    
    return schema.inner(val, chain);
    
  };
  idenScm.at('name').fn = (val, schema, chain, name) => {
    
    validate(chain, val, { form: String, regex: /^[a-z][a-zA-Z]*$/, desc: 'only alphabetic characters and beginning with a lowercase character' });
    
    return val;
    
  };
  idenScm.at('keep').fn = (val, schema, chain) => {
    
    if (val === null) return null;
    validate(chain, val, 'keep');
    return val;
    
  };
  idenScm.at('secureBits').fn = (val, schema, chain) => {
    
    if (val === null) val = 0;
    
    /// {DEBUG=
    validate(chain, val, 'integer');
    validate(chain, val, { numberBound: { min: 0 } });
    /// =DEBUG}
    
    return val;
    
  };
  idenScm.at('geo').fn = (val, schema, chain) => {
    
    validate(chain, val, { form: String });
    
    let pcs = val.split('.');
    while (pcs.length < 6) pcs.push('?');
    return pcs.slice(0, 6).join('.');
    
  };
  idenScm.at('org').fn = (val, schema, chain) => {
    
    validate(chain, val, { form: String });
    
    let pcs = val.split('.');
    while (pcs.length < 6) pcs.push('?');
    return pcs.slice(0, 6).join('.');
    
  };
  idenScm.at('email').fn = (val, schema, chain) => {
    
    if (val === null) return null;
    
    validate(chain, val, { regex: /^[^@]+[@][^.]+[.][.*]$/, desc: 'a valid email address' });
    
    return val;
    
  };
  idenScm.at('password').fn = (val, schema, chain) => {
    
    if (val === null) return null;
    
    validate(chain, val, { form: String });
    
    return val;
    
  };
  idenScm.at('certificateType').fn = (val, schema, chain) => {
    
    if (val === null) return null;
    
    return validate(chain, val, { form: String });
    
  };
  
  let hostsScm = scm.at('hosts.*');
  hostsScm.at('netIden').fn = (val, schema, chain) => {
    
    // @netIdens.tester
    // @netIdens.main
    // { name: 'zzz', keep: '/file:mill/netIden/zzz', secureBits: 2048, ... }
    
    if (isForm(val, String))
      return validate(chain, val, { regex: /^@netIdens./, desc: 'begins with "@netIdens.", e.g. "@netIdens.myIden"' });
    
    return idenScm.getConf(val, chain);
    
  };
  hostsScm.at('netAddr').fn = (val, schema, chain) => {
    
    // 'localhost'
    // '127.0.0.1'
    // '211.122.42.7'
    // '<autodetect>'
    
    validate(chain, val, { form: String });
    
    return val;
    
  };
  hostsScm.at('dns').fn = val => {
    if (val === null) val = '1.1.1.1+1.0.0.1'; // TODO: Cloudflare?
    if (isForm(val, String)) val = val.split('+').map(v => v.trim());
    if (!isForm(val, Array)) throw Error('Api: "dns" must be Array');
    return val;
  };
  hostsScm.at('heartbeatMs').fn = val => {
    if (val === null) val = 20 * 1000;
    if (!isForm(val, Number)) throw Error('Api: "hearbeatMs" must be a Number');
    if (!val.isInteger()) throw Error('Api: "heartbeatMs" must be an integer');
    if (val < 1000) throw Error('Api: heartbeat must be <= 1hz');
    return val;
  };
  hostsScm.at('protocols').fn = (val, schema, chain) => {
    
    if (isForm(val, String)) {
      
      let splitReg = niceRegex('g', String.baseline(`
        | ([a-zA-Z]+)
        |            (?:           )?
        |               [:]([0-9]+)
        |                            (?:             )?
        |                               [<]([^>]*)[>]
        |                                              (?:$|[+])
      `));
      let matches = val.match(splitReg);
      val = matches.map(str => str.hasTail('+') ? str.slice(0, -1) : str);
      
    }
    
    if (isForm(val, Array)) val = val.toObj((v, i) => [ i, v ]);
    
    validate(chain, val, { form: Object });
    
    return schema.inner(val, chain);
    
  };
  hostsScm.at('protocols.*').fn = (val, schema, chain) => {
    
    // 'http'
    // 'http:80<gzip+deflate>'
    // 'http<gzip>'
    // 'http:80'
    // { protocol: 'http', port: 80, compression: 'gzip+deflate' }
    // { protocol: 'http', port: 80, compression: [ 'gzip', 'deflate' ] }
    // Note that "port" can also be left `null` - it takes an annoying
    // amount of context to pick a default port because we need to know
    // about the protocol but also the NetworkIdentity (which isn't
    // readily referenced from here)
    
    if (isForm(val, String)) {
      
      let regex = /^([a-zA-Z]+)(?:[:]([0-9]+))?(?:[<]([^>]+)[>])?(?:$|[+])$/;
      
      validate(chain, val, { regex, desc: 'e.g. "http:80<gzip+deflate>", "http<deflate>", "http:80", "http"' });
      
      let [ , protocol, port=null, compression=null ] = val.match(regex);
      
      val = { protocol, port, compression };
      
    }
    if (!isForm(val, Object))    throw Error('Api: "protocols[...]" must be an Object');
    
    return schema.inner(val, chain);
    
  };
  hostsScm.at('protocols.*.protocol').fn = (val, schema, chain) => validate(chain, val, { form: String });
  hostsScm.at('protocols.*.port').fn = (val, schema, chain) => {
    
    if (val === null) return null;
    
    if (isForm(val, String)) val = parseInt(val, 10);
    validate(chain, val, { numberBound: { min: 0 } });
    
    return val;
    
  };
  hostsScm.at('protocols.*.compression').fn = (val, schema, chain) => {
    
    if (val === null) val = 'gzip+deflate';
    if (isForm(val, String)) val = val.split('+');
    validate(chain, val, { form: Array });
    return val;
    
  };
  
  let loftDefsScm = scm.at('loftDefs.*')
  loftDefsScm.fn = (val, schema, chain) => {
    
    // 'c2.chess2 [file:mill]->bank->cw0'
    // 'c2.chess2'
    // { prefix: 'c2', room: 'chess2', bank: '[file:mill]->bank->cw0' }
    
    //if (val === null) return skip;
    
    if (isForm(val, String)) {
      
      let regex = /^([a-zA-Z0-9]+)[.]([a-zA-Z0-9]+)(?:[ ]+(.*))?$/;
      validate(chain, val, { regex });
      
      let [ , prefix, room, keep=null ] = val.match(regex);
      val = { prefix, room, keep };
      
    }
    
    validate(chain, val, { form: Object });
    return schema.inner(val, chain);
    
  };
  loftDefsScm.at('prefix').fn = (val, schema, chain) => {
    
    validate(chain, val, { stringBound: { min: 1, max: 5 } });
    return val;
    
  };
  loftDefsScm.at('room').fn = (val, schema, chain) => {
    
    validate(chain, val, { form: String });
    
    return val;
    
  };
  loftDefsScm.at('keep').fn = (val, schema, chain) => {
    
    if (val === null) return null;
    
    validate(chain, val, 'keep');
    
    return val;
    
  };
  
  let deployScm = scm.at('deploy');
  deployScm.at('maturity').fn = (val, schema, chain) => {
    
    if (val === null) val = 'alpha';
    
    validate(chain, val, { options: [ 'dev', 'beta', 'alpha' ] });
    
    return val;
    
  };
  deployScm.at('wrapBelowCode').fn = (val, schema, chain) => {
    if (val === null) val = false;
    return validate(chain, val, { form: Boolean });
  };
  deployScm.at('subconKeep').fn = (val, schema, chain) => {
    
    if (val === null) return null;
    
    validate(chain, val, 'keep');
    
    return val;
    
  };
  
  let loftScm = deployScm.at('loft');
  loftScm.fn = (val, schema, chain) => {
    
    if (val === null) return null;
    
    validate(chain, val, { form: Object })
    
    return schema.inner(val, chain);
    
  };
  loftScm.at('uid').fn = (val, schema, chain) => {
    
    if (val === null) return null;
    
    validate(chain, val, { form: String });
    
    return val;
    
  };
  loftScm.at('def').fn = (val, schema, chain) => {
    
    if (isForm(val, String))
      return validate(chain, val, { regex: /^@loftDefs[.]/, desc: 'begins with "@loftDefs.", e.g. "@loftDefs.testLoft"' });
    
    return loftDefsScm.getConf(val, chain);
    
  };
  loftScm.at('hosting').fn = (val, schema, chain) => {
    
    // TODO: What if we wanted to expose a single Loft via multiple
    // hosts?? Should this return an Array? (Or is such architecture an
    // anti-pattern?)
    
    if (val === null) return null;
    
    if (isForm(val, String))
      return validate(chain, val, { regex: /^@hosts./, desc: 'begins with "@hosts.", e.g. "@hosts.local", "@hosts.dev", etc.' });
    
    return hostsScm.getConf(val, chain);
    
  };
  
  return scm;
  
};
let resolveDeepObj = obj => {
  
  if (obj?.constructor !== Object) return obj;
  if (obj.empty()) return obj;
  
  let { main={}, deep={} } = obj.categorize((v, k) => k.has('.') ? 'deep' : 'main');
  obj = main;
  
  for (let [ deepKey, v ] of deep) {
    
    let props = deepKey.split('.');
    let last = props[props.length - 1];
    
    let ptr = obj;
    for (let prop of props.slice(0, -1)) {
      if (!ptr[prop])                      ptr[prop] = {};
      else if (!isForm(ptr[prop], Object)) throw Error(`Deep property "${deepKey}" encountered a non-Object (${getFormName(ptr[prop])}) in its path`).mod({ obj });
      ptr = ptr[prop];
    }
    
    ptr[last] = v;
    
  };
  
  return obj.map(resolveDeepObj);
  
};
let cloneResolveLinks = (root, errs=true, chain='', val=root) => {
  
  if (isForm(val, Array)) return val.map((v, i) => cloneResolveLinks(root, errs, `${chain}->${i}`, v));
  if (isForm(val, Object)) return val.map((v, k) => cloneResolveLinks(root, errs, `${chain}->${k}`, v));
  if (isForm(val, String) && val[0] === '@') {
    
    let linkChain = val.slice(1).split('.');
    
    let ptr = root;
    for (let term of linkChain) {
      ptr = ptr[term];
      if (!ptr &&  errs) throw Error(`Api: missing target for link "${val}" (found at "${chain}")`);
      if (!ptr && !errs) return val; // Return the link without resolving it
    }
    
    val = cloneResolveLinks(root, errs, `->${linkChain.join('->')}`, ptr);
    
  }
  
  return val;
  
};

module.exports = async ({ hutFp, conf: rawConf }) => {
  
  // Extend `global` with all the functionality needed to run Huts
  
  // Get Keep representing the root Hut repo location
  // Note that typically transactions are Ended but this one will span
  // the full lifetime of the Hut process
  hutFp = Filepath(hutFp);
  let hutKeep = FsKeep(await rootTrn.kid(hutFp), hutFp);
  
  global.bufferedLogs = [];
  let setSubconOutput = fn => {
    let pending = global.bufferedLogs;
    global.bufferedLogs = null;
    global.subconOutput = fn;
    for (let args of pending) fn(...args);
  };
  global.subconOutput = (...args) => void global.bufferedLogs.push(args);
  
  let setupSc = subcon('setup');
  setupSc(`utc: ${getMs()}\npid: ${process.pid}`);
  
  // Calibrate `getMs` (hi-res)
  await (async () => {
    
    // Find a hi-res timestamp very close to a Date.now() millisecond
    // tickover; we determine whether we're close to the beginning of a
    // millisecond tickover by counting busy-wait iterations completed
    // before the end of the millisecond; the more, the closer we assume
    // we were to the millisecond origin. Finally use the nearest such
    // millisecond as an origin time for `getMs` calls, supplemented by
    // a hi-res value
    let nowHiRes = require('perf_hooks').performance.now;
    let nowLoRes = Date.now;
    
    let origin = nowHiRes() - nowLoRes(); // We're going to tune `origin` to the average difference between `nowHiRes()` and `nowLoRes()`
    let maxMs = 15; // How long to calibrate (and busy-wait) for
    let lo0 = nowLoRes();
    while (true) {
      
      let [ lo, hi ] = [ nowLoRes(), nowHiRes() ];
      let elapsed = lo - lo0;
      if (elapsed > maxMs) break; // 30ms busy-wait
      
      let diff = (lo + 0.5) - hi; // `lo` marks the *beginning* of a millisecond, so add 0.5 on average!
      
      // The later we go the amount of change to `origin` decreases
      let amt = elapsed / maxMs;
      origin = origin * amt + diff * (1 - amt);
      
    }
    
    global.getMs = () => origin + nowHiRes();
    
  })();
  
  // Enable `global.keep`
  // - Requires `hutKeep`
  await (async () => {
    
    let RootKeep = form({ name: 'RootKeep', has: { Keep }, props: (forms, Form) => ({
      
      init(map) { Object.assign(this, { map: Object.plain(map) }); },
      access(prop) {
        if (prop[0] === '[') prop = prop.slice(1, -1);
        if (!this.map[prop]) throw Error(`Api: invalid ${getFormName(this)} Slot: "${prop}"`);
        return this.map[prop];
      }
      
    })});
    
    let rootFsKeep = FsKeep(rootTrn, Filepath([]));
    let rootKeep = RootKeep({
      
      'file': rootFsKeep,
      'file:root': rootFsKeep,
      'file:repo': hutKeep,
      'file:mill': hutKeep.seek('mill'),
      'file:code:src': hutKeep.seek('room'),
      'file:code:cmp': hutKeep.seek('mill.cmp')
      
    });
    
    global.keep = (diveToken) => rootKeep.seek(token.dive(diveToken));
    
  })();
  
  // Upgrade `global.subconOutput`
  // - No dependencies (but using subcons requires `global.conf`)
  await (async () => {
    
    let util = require('util');
    Object.defineProperty(Error.prototype, Symbol.for('nodejs.util.inspect.custom'), {
      enumerable: false,
      writable: true,
      value: function(depth, opts, custom) { return this.desc(); }
    });
    
    global.formatAnyValue = (val, { colors=true, depth=10 }={}) => util.inspect(val, { colors, depth });
    
    let vertDashChars = '166,124,33,9597,9599,9551,9483,8286,8992,8993,10650'.split(',').map(v => parseInt(v, 10).char());
    let horzDashChars = '126,8212,9548,9148,9477'.split(',').map(v => parseInt(v, 10).char());
    let junctionChars = '43,247,5824,9532,9547,9535,10775,10765,9533,9069,9178,11085'.split(',').map(v => parseInt(v, 10).char());
    let vertDash = () => vertDashChars[Math.floor(Math.random() * vertDashChars.length)];
    let horzDash = () => horzDashChars[Math.floor(Math.random() * horzDashChars.length)];
    let junction = () => junctionChars[Math.floor(Math.random() * junctionChars.length)];
    
    let resolveFnArgs = (sc, args) => args.map(arg => isForm(arg, Function) ? arg(sc) : arg);
    setSubconOutput((sc, ...args) => thenAll(resolveFnArgs(sc, args), args => {
      
      // Prevent stdout output if "output.format" is false
      let allScConf = conf('subcons') ?? {};
      let scConf = allScConf.has(sc.term) ? allScConf[sc.term] : null;
      let { output, format } = scConf ?? {
        output: { inline: true },
        format: null
      };
      if (!output.inline) return;
      
      // Format args if formatter is available
      if (format) args = args.map(arg => format(arg, sc));
      
      let leftColW = 28;
      let depth = 10;
      if (isForm(args[0], String) && /^[!][!][0-9]+$/.test(args[0])) {
        depth = parseInt(args[0].slice(2), 10);
        args = args.slice(1);
      }
      
      let now = getDate();
      
      let leftLns = [ `> ${sc.term.slice(-leftColW)}`, now ];
      let rightLns = args.map(v => {
        if (!isForm(v, String)) v = formatAnyValue(v, { depth });
        return v.split(/\r?\n/);
      }).flat();
      
      let logStr = Math.max(leftLns.length, rightLns.length).toArr(n => {
        let l = (leftLns[n] || '').padTail(leftColW);
        let r = rightLns[n] || '';
        return l + vertDash() + ' ' + r;
      }).join('\n');
      
      let topLine = (28).toArr(horzDash).join('') + junction() + (50).toArr(horzDash).join('');
      console.log(topLine + '\n' + logStr);
      
    }));
    
  })();
  
  // Enable `global.conf`
  // - requires `global.keep`
  // - requires `global.subconOutput`
  await (async () => {
    
    let t = getMs();
    
    rawConf = resolveDeepObj(rawConf);
    let schema = makeSchema();
    
    let conf = {
      
      confs: [],
      
      // Note this controls which subcons get to output by default
      subcons: {
        ...'gsc,setup,compile->result,bank,warning'.split(',').toObj(v => [ v, {
          output: { inline: true, therapist: false }
        }]),
        'record->sample': {
          output: { inline: false, therapist: false },
          ms: 5000
        }
      },
      
      hosts: {},
      deploy: {
        subconKeep: '[file:mill]->sc',
        maturity: 'alpha'
      }
      
    };
    global.conf = diveToken => {
      
      // Resolve nested Arrays and period-delimited Strings
      let dive = token.dive(diveToken);
      let ptr = conf;
      for (let pc of dive) {
        /// {DEBUG= TODO: how to compile out these markers??
        if (!isForm(ptr, Object) || !ptr.has(pc)) throw Error('Api: invalid dive token').mod({ diveToken });
        /// =DEBUG}
        ptr = ptr[pc];
      }
      return ptr;
      
    };
    
    conf.merge(await schema.getConf(cloneResolveLinks(rawConf, false)));
  
    // Apply any Keep-based Conf
    if (conf.confs && !conf.confs.empty()) {
      
      let moreConfs = await Promise.all(conf.confs.map(async keepConf => {
        
        let keep = global.keep(keepConf);
        
        let content = null;
        try {
          content = await keep.getContent('utf8');
          content = content.replace(/[;\s]+$/, ''); // Remove tailing whitespace and semicolons
          content = await eval(`(${content})`);
        } catch (err) {
          err.propagate({ keepConf, keep: keep.fp.desc(), content });
        }
        return content;
        
      }));
      
      for (let c of moreConfs) conf.merge(resolveDeepObj(c));
      conf.merge(rawConf); // Merge back the raw configuration; it should always have precedence!
      
      conf = await schema.getConf(cloneResolveLinks(conf));
      
    }
    
    // Resolve any @-links
    conf = cloneResolveLinks(conf, '', conf);
    
    // Additional Conf value sanitization and defaulting:
    
    // Provide defaults for Ports
    for (let [ , protocol ] of conf.deploy.loft.hosting.protocols) {
      
      if (protocol.port !== null) continue;
      
      let netIden = conf.deploy.loft.hosting.netIden;
      
      if ([ 'http' ].includes(protocol.protocol))
        protocol.port = (netIden.secureBits > 0) ? 443 : 80;
      
      if ([ 'ws', 'sokt' ].includes(protocol.protocol))
        protocol.port = (netIden.secureBits > 0) ? 443 : 80;
      
    }
    
    // Default random loft uid
    // TODO: Maybe it should *always* be random for low maturity?
    // Would at least help with cache-busting - but maybe it should be
    // the responsibility of the dev to make sure the uid is random
    // for each run...
    if (conf.deploy.loft.uid === null) conf.deploy.loft.uid = Math.random().toString(36).slice(2, 8);
    
    setupSc(`Configuration processed after ${(getMs() - t).toFixed(2)}ms`, conf);
    
  })();
  
  // Enable global.compileContent
  // Depends on `global.conf`
  await (async () => {
    
    global.compileContent = (variantDef, srcLines, { sourceName='<unknown file>', lineFn=Function.stub }) => {
      
      // Takes a block of source code and returns { lines, offsets }
      // where lines is an Array of single-line Strings of compiled code
      // and `offsets` contains all the data needed to map from an index
      // in the compiled code to an index in the source code
      
      // Note that a "variant" is not exactly the same as a "bearing";
      // "bearing" simply refers to Hut altitude. "Variants" can be
      // used for logical decisions based on altitude, but also other
      // factors (e.g. maturity)!
      
      // Note `variantDef` looks like:
      //    | {
      //    |   above: true,
      //    |   below: false,
      //    |   debug: true
      //    | }
      
      let t = getMs();
      
      // Compile file content; filter based on variant tags
      if (isForm(srcLines, String)) srcLines = srcLines.split('\n');
      if (!isForm(srcLines, Array)) throw Error(`Param "srcLines" is invalid type: ${getFormName(srcLines)}`);
      
      for (let [ key ] of variantDef) if (!/^[a-z]+$/.test(key)) throw Error(`Invalid variant name: "${key}"`);
      
      // Looks like `/[{](above|below|debug|assert)[=]/`
      let variantHeadReg = RegExp(`[{](${variantDef.toArr((v, k) => k).join('|')})[=]`, 'i');
      let variantTailRegs = variantDef.map((v, type) => RegExp(`[=]${type}[}]`, 'i'));
      
      let blocks = [];
      let curBlock = null;
      
      for (let i = 0; i < srcLines.length; i++) {
        
        let line = srcLines[i].trim();
        
        // In a block, check for the block end
        if (curBlock && variantTailRegs[curBlock.type].test(line)) {
          curBlock.tail = i;
          blocks.push(curBlock);
          curBlock = null;
        }
        
        // Outside a block, check for start of any block
        if (!curBlock) {
          let [ , type=null ] = line.match(variantHeadReg) ?? [];
          
          // TODO: Watch out with the casing of `type` - `curBlock.type`
          // is used to index into `variantTailRegs`! What if a variant
          // has a camelcase name?? Should that be disallowed?
          if (type) curBlock = { type: type.lower(), head: i, tail: -1 };
        }
        
      }
      
      // Shouldn't be in a block after all lines are processed
      if (curBlock) throw Error(`Ended with unbalanced "${curBlock.type}" block`);
      
      // Now compute the offsets to allow mapping cmp->src callsites
      let curOffset = null;
      let offsets = [];
      let nextBlockInd = 0;
      let filteredLines = [];
      for (let [ i, rawLine ] of srcLines.entries()) {
        
        let line = rawLine.trim();
        
        if (!curBlock && nextBlockInd < blocks.length && blocks[nextBlockInd].head === i)
          curBlock = blocks[nextBlockInd++];
        
        let keepLine = true;
        if (!line) keepLine = false;                                  // Remove blank lines
        //if (line.hasHead('//')) keepLine = false;                     // Remove comments
        if (curBlock && i === curBlock.head) keepLine = false;        // Remove block start line
        if (curBlock && i === curBlock.tail) keepLine = false;        // Remove block end line
        if (curBlock && !variantDef[curBlock.type]) keepLine = false; // Remove blocks based on variant def
        
        // Additional processing may result in negating `keepLine`
        if (keepLine) {
          
          line = lineFn(line)?.trim();
          if (!line) keepLine = false;
          
        }
        
        // Now `keepLine` is final! If we're keeping this line add it to
        // the result; if we're not, indicate a gap in the mapping
        if (keepLine) {
          
          curOffset = null;
          filteredLines.push(line);
          
        } else {
          
          if (!curOffset) offsets.push(curOffset = { at: i, offset: 0 });
          curOffset.offset++;
          
        }
        
        if (curBlock && i === curBlock.tail) {
          
          curBlock = null;
          if (nextBlockInd < blocks.length && blocks[nextBlockInd].head === i) {
            curBlock = blocks[nextBlockInd];
            nextBlockInd++;
          }
          
        }
        
      }
      
      if (filteredLines.length) {
        
        // Now implement requirements for the compiled code:
        // 
        // 1. Wrapped in curly brackets to create a separate scope; this
        // prevents unexpected variable name conflicts between separate
        // files and provides the expected level of code insulation and
        // side-effect-freeness! (the only side-effect of a Room should
        // be on `global.rooms`!)
        // 
        // 2. Has a top-level strict mode declaration
        // 
        // 3. Has no other strict mode declarations (some source code
        // includes "use strict" - e.g. setup/clearing/clearing.js)
        // 
        // 4. Implementing these changes doesn't alter the number of
        // compiled lines  (only change the prefix of the 1st line and
        // the suffix of the last line will be changed!)
        
        let headInd = 0;
        let tailInd = filteredLines.length - 1;
        
        filteredLines[headInd] = ''
        
          // The strict declaration begins the first line; requirement #2
          + `'use strict';`
          
          // // Log that the room script executed
          // + `console.log('EXECUTE ${sourceName}');`,
        
          // Open a scope (e.g. `{ console.log('hi'); };`); requirement #1
          + ('{')
          
          // Remove any previous strict-mode declaration
          + filteredLines[headInd].replace(/[ ]*['"`]use strict['"`];[ ]*/, ''); // TODO: Replace all instances? Or just the 1st??
          
        // End the scope for requirement #1
        filteredLines[tailInd] += (`};`);
        
      }
      
      /// {DEBUG=
      subcon('compile.result')(() => {
        let srcCnt = srcLines.count();
        let trgCnt = filteredLines.count();
        return `Compiled ${sourceName}: ${srcCnt} -> ${trgCnt} (-${srcCnt - trgCnt}) lines (${ (getMs() - t).toFixed(2) }ms)`;
      });
      /// =DEBUG}
      
      return { lines: filteredLines, offsets };
      
    };
    
  })();
  
  // Enable `global.getRooms` (via RoomLoader)
  await (async () => {
    
    let loader = RoomLoader({
      srcKeep: hutKeep.seek([ 'room' ]),
      cmpKeep: hutKeep.seek([ 'mill', 'cmp' ])
    });
    global.roomLoader = loader;
    global.getRooms = (names, { shorten=true, ...opts }={}) => {
      
      return then(loader.batch(names, opts), batch => {
        
        if (shorten) return batch.mapk((v, k) => [ k.split('.').slice(-1)[0], v ]);
        return batch;
        
      });
      
    };
    global.mapSrcToCmp = (file, row, col) => loader.mapSrcToCmp(file, row, col);
        
  })();
  
  // Run tests (requires `global.getRoom`)
  await (async () => {
    let t = getMs();
    await require('./test.js')();
    setupSc(`Tests completed after ${(getMs() - t).toFixed(2)}ms`);
  })();
  
  // Enable `global.real`
  await (async () => {
    
    let FakeReal = form({ name: 'FakeReal', has: { Tmp }, props: (forms, Form) => ({
      init({ name, tech }) {
        forms.Tmp.init.call(this);
        Object.assign(this, {
          name, tech,
          fakeLayout: null,
          params: { textInputSrc: { mod: Function.stub, route: fn => fn(''), send: Function.stub }}
        });
      },
      loaded: Promise.resolve(),
      setTree() {},
      addReal(real) { return this; },
      mod() {},
      addLayout: lay => Tmp({ layout: { src: Src.stub, route: Function.stub } }),
      getLayout() { return this.fakeLayout || (this.fakeLayout = this.getLayoutForm('FakeBoi')()); },
      getLayoutForm(name) { return this.tech.getLayoutForm(name); },
      getTech() { return this.tech; },
      addNavOption() { return { activate: () => {} }; },
      render() {}
    })});
    let FakeLayout = form({ name: 'FakeLayout', has: { Src }, props: (forms, Form) => ({
      init() { forms.Src.init.call(this); this.keysSrc = Src.stub; },
      isInnerLayout() { return false; },
      setText(){},
      addReal(){},
      src: Src.stub
    })});
    
    let fakeLayout = FakeLayout();
    let fakeReal =  global.real = FakeReal({ name: 'nodejs.fakeReal', tech: {
      render: Function.stub,
      informNavigation: Function.stub,
      getLayoutForm: name => fakeLayout,
      getLayoutForms: names => names.toObj(name => [ name, fakeReal.getLayoutForm(name) ]),
      render: Function.stub
    }});
    
  })();
  
  // Again enhance Subcon output to use Records + KeepBank
  await (async () => {
    
    gsc('Pls implement therapy');
    
    let subconWriteStdout = global.subconOutput;
    global.subconOutput = (sc, ...args) => {
      let term = sc.term;
      subconWriteStdout(sc, ...args);
    };
    
  })();
  
  // RUN DAT
  await (async () => {
    
    // Wipe out code from previous run
    await keep([ 'file:code:cmp' ]).rem();
    
    let { uid=null, def, hosting } = global.conf('deploy.loft');
    let { heartbeatMs } = hosting;
    
    let { prefix, room: loftName, keep: keepTerm } = def;
    
    let { hut, record, WeakBank=null, KeepBank=null } = await global.getRooms([
      'setup.hut',
      'record',
      `record.bank.${keepTerm ? 'KeepBank' : 'WeakBank'}`
    ]);
    
    // Get an AboveHut with the appropriate config
    let bank = keepTerm
      ? KeepBank({ subcon: global.subcon('bank'), keep: global.keep(keepTerm) })
      : WeakBank({ subcon: global.subcon('bank') });
    
    let recMan = record.Manager({ bank });
    let aboveHut = hut.AboveHut({ hid: uid, prefix, par: null, isHere: true, recMan, heartbeatMs });
    
    // Get a NetworkIdentity to handle the hosting
    let NetworkIdentity = require('./NetworkIdentity.js');
    let netIden = NetworkIdentity(hosting.netIden);
    
    // Server management
    let getSessionKey = (payload) => {
      
      let { trn='anon', hid=null } = payload;
      
      // These can't be confined to DEBUG blocks - Server must always be
      // wary of malformatted remote queries!
      if (![ 'anon', 'sync', 'async' ].has(trn)) throw Error(`Api: invalid "trn"`).mod({ trn });
      if (hid && !isForm(hid, String)) throw Error(`Api: invalid "hid"`).mod({ hid });
      if (trn === 'anon') return null;
      
      // Try pre-existing Hut?
      let belowHut = aboveHut.belowHuts.get(hid);
      if (belowHut) return hid; // Note `belowHut.hid === hid`
      
      // Get an Hid to create a new Hut; if no `hid` was provided use a
      // new, safely generated `hid`; otherwise an `hid` was provided
      // but didn't reference any existing BelowHut - this is only valid
      // for "dev" maturity
      if (!hid) hid = aboveHut.makeBelowUid()
      else if (global.conf('deploy.maturity') !== 'dev') throw Error(`Api: invalid "hid"`);
      
      // If we're lax simply return a new Hut with the provided Hut Id
      return aboveHut.makeBelowHut(hid).hid;
      
    };
    let servers = hosting.protocols.toArr(serverOpts => {
      
      // TODO: Abstract `${netAddr}:${port}` as a NetworkProcessAddress
      // (or "nepAddr")? This would probably be an attribute located at
      // "deploy.loft.hosting.protocols[n]", meaning not every server
      // under "deploy.loft.hosting" must use the same NetworkAddress
      let { netAddr, heartbeatMs } = hosting;
      let { protocol, port, compression, ...opts } = serverOpts;
      
      if ([ 'http' ].includes(protocol)) return require('./httpServer.js')({
        
        secure: netIden.secureBits > 0,
        subcon: global.subcon('server.http.raw'),
        errSubcon: global.subcon('warning'),
        netAddr, port, heartbeatMs, compression, ...opts,
        getKeyedMessage: ({ headers, path, query, fragment, cookie: cookieObj, body }) => {
          
          body = (body === '') ? {} : jsonToVal(body);
          if (!isForm(body, Object)) throw Error(`Http body must resolve to Object; got ${getFormName(body)}`);
          
          let cookie = Object.assign({}, ...cookieObj.toArr(val => {
            let cookie = jsonToVal(Buffer.from(val, 'base64'));
            if (!isForm(cookie, Object)) throw Error(`Cookie value must resolve to Object; got ${getFormName(cookie)}`);
            return cookie;
          }));
          
          let headerValue = {};
          if (headers.has('hut')) {
            let hutHeaders = isForm(headers.hut, Array) ? headers.hut : [ headers.hut ];
            Object.assign(headerValue, ...hutHeaders.map(v => {
              let obj = jsonToVal(Buffer.from(headerValue, 'base64'));
              if (!isForm(obj, Object)) throw Error(`Header values must resolve to Objects; got ${getFormName(obj)}`);
              return obj;
            }));
          }
          
          let command = path || 'hutify'; // Note `path` is a String with leading "/" removed
          let msg = {
            
            command,
            trn: 'anon', // Note that "trn" defaults to "sync" if the resolved command is still "hutify"
            
            // Include values from other sources
            ...headerValue, ...cookie, ...body, ...query
            
          };
          
          // "hutify" command is always "sync"
          if (msg.command === 'hutify') msg.trn = 'sync';
          
          if (!isForm(msg.trn, String)) throw Error(`Api: "trn" must be String`).mod({ http: {} });
          if (![ 'anon', 'sync', 'async' ].has(msg.trn)) throw Error(`Api: invalid "trn" value`).mod({ http: {} });
          if (!isForm(msg.command, String)) throw Error(`Api: "command" must be String`).mod({ http: {} });
          
          // Errors getting the session key should reset headers
          try {
            return { key: getSessionKey(msg), msg };
          } catch (err) {
            // TODO: Review when to redirect? Really only requests to
            // load the main page should redirect... this will redirect
            // requests for .js, .css, fetch requests, etc.
            err.propagate({ http: {
              code: 302,
              headers: {
                'Set-Cookie': cookieObj.toArr((v, k) => `${k}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;`),
                'Location': '/'
              }
            }});
          }
          
        }
        
      });
      if ([ 'ws', 'sokt' ].includes(protocol)) return require('./soktServer.js')({
        
        secure: netIden.secureBits > 0,
        subcon: global.subcon('server.sokt.raw'),
        errSubcon: global.subcon('warning'),
        netAddr, port, heartbeatMs, compression, ...opts,
        getKey: ({ query  }) => getSessionKey(query)
        
      });
      
      throw Error(`Unfamiliar protocol: ${protocol}`);
      
    });
    
    // Each server gets managed by the NetworkIdentity, and is routed
    // so that Sessions are put in contact with the Hut
    for (let server of servers) {
      
      netIden.addServer(server);
      aboveHut.addServerInfo({ ...server }.slice([ 'secure', 'protocol', 'netAddr', 'port' ]));
      
      server.src.route((session) => {
        
        // TODO: Does this `session` have a reputation??
        // let naRep = hut.netAddrReputation;
        // let netAddrs = session.knownNetAddrs;
        // let badNetAddr = netAddrs.find(na => naRep.get(na)?.window >= 1).val; // "window" refers to the reputational damage within some timeframe (as opposed to "total" reputational damage)
        // let badRep = badNetAddr && naRep.get(badNetAddr);
        // 
        // if (badRep) {
        //   this.subcon('warning')(`Reject ${session.desc()} @ ${netAddrs.toArr(v => v).join(' + ')}`, Set(badRep.strikes.map(v => v.reason)).toArr(v => v));
        //   return session.end();
        // }
        
        // Note Hid is always equal to Session key; this is the bridge
        // between generic protocol serving and the Hut backend!
        
        let hid = session.key;
        
        // `session.key === null` indicates an anonymous Session; a
        // single Tell will occur and it must be replied to with `reply`!
        if (hid === null) return session.hear.route(({ replyable, ms=getMs(), msg }) => {
          
          // Spoof the BelowHut (there isn't any; it's Anon)
          let anonHut = {
            aboveHut,
            isHere: false,
            isAfar: true,
            desc: () => `AnonHut(${session.netAddr})`,
            actOnComm: (comm) => aboveHut.doCommand(comm) // Anon Comms always handled by AboveHut
          };
          hut.Hut.prototype.tell.call(anonHut, {
            // Note that `hut.BelowHut.prototype.tell` would trigger
            // heartbeat timeout functionality on the AnonHut, which
            // isn't necessary because AnonHuts are completely ephemeral
            trg: aboveHut,
            road: session, reply: replyable(), ms,
            msg
          });
          
        }, 'prm');
        
        // There is an identity/BelowHut associated with this Session!
        // We'll reference or create the BelowHut; note rejection of
        // invalid Sessions happened earlier when determining the Hid
        let belowHut = aboveHut.belowHuts.get(hid);
        belowHut.seenOnRoad(server, session);
        session.hear.route(({ replyable, ms=getMs(), msg }) => {
          
          if (msg.command === 'bp') return; // Don't propagate bank-poll commands to Hut
          
          let reply = (msg.trn === 'sync') ? replyable() : null; // `reply` only allowed for "sync" requests
          belowHut.tell({ trg: aboveHut, road: session, reply, ms, msg });
          
        });
        
      });
      
    }
    
    let loft = await getRoom(loftName);
    await loft.open({ prefix: aboveHut.prefix, hut: aboveHut, netIden });
    
    process.on('exit', () => {
      aboveHut.end();
      for (let server of servers) server.serverShut();
    });
    
  })();
  
};

Object.assign(module.exports, { niceRegex, Schema, RoomLoader });
