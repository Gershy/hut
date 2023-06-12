'use strict';

require('../room/setup/clearing/clearing.js');
let Schema = require('./Schema.js');

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
  return `>>>HUTTRACE>>>${valToJson(trace)}<<<HUTTRACE<<<`;
  
};

// Set up basic process monitoring
(() => {
  
  // https://nodejs.org/api/process.html#signal-events
  let origExit = process.exit;
  process.exitHard = () => origExit(1);
  let revealBufferedLogs = () => {
    
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
    
    if (global.bufferedLogs?.length) {
      console.log('Error before logs displayable; outputting raw logged data:');
      let logs = global.bufferedLogs;
      global.bufferedLogs = null;
      for (let args of logs) console.log(...args.map(a => a?.constructor?.name));
    }
    
    origExit(1);
  };
  process.on('uncaughtException', onErr);
  process.on('unhandledRejection', onErr);
  process.on('exit', code => gsc(`Hut terminated (code: ${code})`));
  
})();

let { rootTransaction: rootTrn, Filepath, FsKeep } = require('./filesys.js');

let niceRegex = (...args) => {
  
  // Allows writing self-documenting regular expressions
  
  let [ flags, str ] = (args.length === 2) ? args : [ '', args[0] ];
  
  let lns = str.split('\n').map(line => line.trimTail());
  let cols = Math.max(...lns.map(line => line.length)).toArr(col => Set(lns.map(ln => ln[col])));
  cols.each(col => col.size > 1 && col.rem(' '));
  
  /// {DEBUG=
  for (let col of cols) if (col.size > 1) throw Error(`Conflicting values at column ${num}: [${[ ...col ].join('')}]`);
  /// =DEBUG}
  
  return RegExp(cols.map(col => [ ...col ][0]).join(''), flags);
  
};

// Avoid "//" within String by processing non-String-open characters, or
// fully enclosed Strings (note: may fail to realize that a String stays
// open if it has escaped quotes e.g. 'i criii :\')'; note lookbehind
// ("?<=") excludes its contents from the actual match
let captureLineCommentRegex = niceRegex(String.baseline(`
  | (?<=                                  )
  |     ^(      |       |       |       )* [ ]*
  |       [^'"#] '[^']*' "[^"]*" #[^#]*#       [/][/].*
`).replace(/#/g, '`')); // Simple way to include literal "`" in regex

// Avoid "/*" within Strings; capture terminating "*/" on the same line
let captureInlineBlockCommentRegex = niceRegex('g', String.baseline(`
  | (?<=                                           )
  |     ^(?:     |           |           |       )* [ ]*         [^*]|[*][^/]
  |         [^'"] ['][^']*['] ["][^"]*["] #[^#]*#       [/][*](?:            )*[*][/]
`).replace(/#/g, '`')); // Simple way to include literal "`" in regex

let makeSchema = () => {
  
  let resolveKeep = val => val;
  let error = (chain, val, msg, err=Error()) => err.propagate({ msg: `Api: config at "${chain.join('.')}": ${msg}`, chain, val });
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
  
  scm.seek('confKeeps').fn = (val, schema, chain) => {
    
    if (val === String) val = val.split(',').map(v => v.trim());
    
    if (isForm(val, Array)) val = val.map(diveToken => {
      let dive = token.dive(diveToken);
      return [ dive.slice(-1)[0], diveToken.replace(/[./]/g, '') ];
    });
    
    validate(chain, val, { form: Object });
    
    return schema.inner(val, chain);
    
  };
  scm.seek('confKeeps.*').fn = (val, schema, chain) => {
    validate(chain, val, token.dive);
    return val;
  };
  
  let subconScm = scm.seek('subcon');
  subconScm.fn = (val, schema, chain) => {
    if (val === null) val = {};
    validate(chain, val, { form: Object });
    val = {
      description: '<default>',
      output: '<default>',
      ...val
    };
    return schema.inner(val, chain);
  };
  subconScm.seek('description').fn = (val, schema, chain) => {
    
    if (val === null) val = '(No description)';
    return validate(chain, val, { form: String });
    
  };
  subconScm.seek('output').fn = (val, schema, chain) => {
    
    if (val === null) val = {};
    validate(chain, val, { form: Object });
    val = { inline: '<default>', therapist: '<default>', ...val };
    
    return schema.inner(val, chain);
    
  };
  subconScm.seek('output.inline').fn = (val, schema, chain) => {
    
    if (val === null) val = 0;
    if ([ 0, 1 ].has(val)) val = val === 1;
    validate(chain, val, { form: Boolean });
    return val;
    
  };
  subconScm.seek('output.therapist').fn = (val, schema, chain) => {
    
    if (val === null) val = 0;
    if ([ 0, 1 ].has(val)) val = val === 1;
    validate(chain, val, { form: Boolean });
    return val;
    
  };
  subconScm.seek('format').fn = (val, schema, chain) => {
    
    // TODO: Functions can't be synced?
    return val ? validate(chain, val, { form: Function }) : null;
    
  };
  subconScm.seek('kids').all = subconScm;
  subconScm.seek('*').fn = (val, schema, chain) => val; // Allow arbitrary properties
  
  let shellScm = scm.seek('shell');
  shellScm.seek('openssl').fn = (val, schema, chain) => {
    
    if (val === null) val = 'openssl';
    return validate(chain, val, { form: String });
    
  };
  
  scm.seek('netIdens').fn = (val, schema, chain) => {
    
    if (val === null) val = {};
    return val;
    
  };
  let idenScm = scm.seek('netIdens.*');
  idenScm.fn = (val, schema, chain) => {
    
    validate(chain, val, { form: Object });
    
    if (!val.has('name')) val = { name: chain.slice(-2)[0], ...val };
    
    return schema.inner(val, chain);
    
  };
  idenScm.seek('name').fn = (val, schema, chain, name) => {
    validate(chain, val, { regex: /^[a-z][a-zA-Z]*$/, desc: 'only alphabetic characters and beginning with a lowercase character' });
    return val;
  };
  idenScm.seek('keep').fn = (val, schema, chain) => {
    
    if (val === null) return null;
    validate(chain, val, 'keep');
    return val;
    
  };
  idenScm.seek('secureBits').fn = (val, schema, chain) => {
    
    if (val === null) val = 0;
    
    /// {DEBUG=
    validate(chain, val, 'integer');
    validate(chain, val, { numberBound: { min: 0 } });
    /// =DEBUG}
    
    return val;
    
  };
  idenScm.seek('details').fn = (val, schema, chain) => {
    
    if (val === null) val = {};
    validate(chain, val, { form: Object });
    
    val = {
      geo: 'earth.continent.country.city.part',
      org: 'company.division.division.division',
      email: 'unknownOwner@hut.com',
      ...val
    };
    
    return schema.inner(val, chain);
    
  };
  idenScm.seek('details.*').fn = (val, schema, chain) => {
    
    validate(chain, val, { form: String });
    return val;
    
  };
  idenScm.seek('details.geo').fn = (val, schema, chain) => {
    
    validate(chain, val, { form: String });
    
    let pcs = val.split('.');
    while (pcs.length < 6) pcs.push('?');
    return pcs.slice(0, 6).join('.');
    
  };
  idenScm.seek('details.org').fn = (val, schema, chain) => {
    
    validate(chain, val, { form: String });
    
    let pcs = val.split('.');
    while (pcs.length < 6) pcs.push('?');
    return pcs.slice(0, 6).join('.');
    
  };
  idenScm.seek('email').fn = (val, schema, chain) => {
    
    if (val === null) return null;
    
    validate(chain, val, { regex: /^[^@]+[@][^.]+[.][.*]$/, desc: 'a valid email address' });
    
    return val;
    
  };
  idenScm.seek('password').fn = (val, schema, chain) => {
    
    if (val === null) return null;
    
    validate(chain, val, { form: String });
    
    return val;
    
  };
  idenScm.seek('certificateType').fn = (val, schema, chain) => {
    
    if (val === null) return null;
    return validate(chain, val, { form: String });
    
  };
  
  let hostsScm = scm.seek('hosts.*');
  hostsScm.fn = (val, schema, chain) => {
    
    validate(chain, val, { form: Object });
    return schema.inner(val, chain);
    
  };
  hostsScm.seek('netIden').fn = (val, schema, chain) => {
    
    // @netIdens.tester
    // @netIdens.main
    // { name: 'zzz', keep: '/file:mill/netIden/zzz', secureBits: 2048, ... }
    
    if (isForm(val, String))
      return validate(chain, val, { regex: /^@netIdens./, desc: 'begins with "@netIdens.", e.g. "@netIdens.myIden"' });
    
    return idenScm.getConf(val, chain);
    
  };
  hostsScm.seek('netAddr').fn = (val, schema, chain) => {
    
    // 'localhost'
    // '127.0.0.1'
    // '211.122.42.7'
    // '<autodetect>'
    
    validate(chain, val, { form: String });
    
    return val;
    
  };
  hostsScm.seek('dns').fn = val => {
    if (val === null) val = '1.1.1.1+1.0.0.1'; // TODO: Cloudflare?
    if (isForm(val, String)) val = val.split('+').map(v => v.trim());
    if (!isForm(val, Array)) throw Error('Api: "dns" must be Array');
    return val;
  };
  hostsScm.seek('heartbeatMs').fn = val => {
    if (val === null) val = 20 * 1000;
    if (!isForm(val, Number)) throw Error('Api: "hearbeatMs" must be a Number');
    if (!val.isInteger()) throw Error('Api: "heartbeatMs" must be an integer');
    if (val < 1000) throw Error('Api: heartbeat must be <= 1hz');
    return val;
  };
  hostsScm.seek('protocols').fn = (val, schema, chain) => {
    
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
  hostsScm.seek('protocols.*').fn = (val, schema, chain) => {
    
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
      let [ , protocol, port='<default>', compression=null ] = val.match(regex);
      val = { protocol, port, compression };
      
    }
    
    validate(chain, val, { form: Object });
    return schema.inner({ port: '<default>', ...val }, chain);
    
  };
  hostsScm.seek('protocols.*.protocol').fn = (val, schema, chain) => validate(chain, val, { form: String });
  hostsScm.seek('protocols.*.port').fn = (val, schema, chain) => {
    
    if (isForm(val, String)) val = parseInt(val, 10);
    validate(chain, val, { numberBound: { min: 0 } });
    return val;
    
  };
  hostsScm.seek('protocols.*.compression').fn = (val, schema, chain) => {
    
    if (val === null) val = 'gzip+deflate';
    if (isForm(val, String)) val = val.split('+');
    validate(chain, val, { form: Array });
    return val;
    
  };
  
  let loftDefsScm = scm.seek('loftDefs.*')
  loftDefsScm.fn = (val, schema, chain) => {
    
    // 'c2.chess2 /[file:mill]/bank/cw0'
    // 'c2.chess2'
    // { prefix: 'c2', room: 'chess2', bank: '[file:mill].bank.cw0' }
    
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
  loftDefsScm.seek('prefix').fn = (val, schema, chain) => {
    
    validate(chain, val, { stringBound: { min: 1, max: 5 } });
    return val;
    
  };
  loftDefsScm.seek('room').fn = (val, schema, chain) => {
    
    validate(chain, val, { form: String });
    
    return val;
    
  };
  loftDefsScm.seek('keep').fn = (val, schema, chain) => {
    
    if (val === null) return null;
    
    validate(chain, val, 'keep');
    
    return val;
    
  };
  
  let deployScm = scm.seek('deploy');
  deployScm.seek('maturity').fn = (val, schema, chain) => {
    
    if (val === null) val = 'alpha';
    validate(chain, val, { options: [ 'dev', 'beta', 'alpha' ] });
    return val;
    
  };
  deployScm.seek('bearing').fn = (val, schema, chain) => {
    
    if (val === null) val = 'above';
    validate(chain, val, { options: [ 'above', 'below', 'between' ] });
    return val;
    
  };
  deployScm.seek('features').fn = (val, schema, chain) => {
    
    if (val === null) val = {};
    if (isForm(val, Array)) val = Set(val);
    if (isForm(val, Set)) val = val.toObj(prop => [ prop, true ]);
    validate(chain, val, { form: Object });
    return {
      debug: true,
      assert: true,
      wrapBelowCode: false,
      loadtest: false,
      ...val
    };
    
  };
  deployScm.seek('features.*').fn = (val, schema, chain) => {
    
    validate(chain, chain.slice(-1)[0], { regex: /^[a-zA-Z]+$/, desc: 'a valid feature key' });
    validate(chain, val, { form: Boolean });
    return val;
    
  };
  deployScm.kids.host = hostsScm;
  deployScm.seek('uid').fn = (val, schema, chain) => {
    
    if (val === null) val = Math.random().toString(36).slice(2, 8);
    validate(chain, val, { form: String });
    return val;
    
  };
  deployScm.seek('prefix').fn = (val, schema, chain) => {
    
    validate(chain, val, { stringBound: { min: 2, max: 4 } });
    return val;
    
  };
  deployScm.seek('loft').fn = (val, schema, chain) => {
    
    validate(chain, val, { form: String });
    return val;
    
  };
  deployScm.seek('keep').fn = (val, schema, chain) => {
    
    if (val === null) return null;
    validate(chain, val, 'keep');
    return val;
    
  };
  
  deployScm.seek('therapy').fn = (val, schema, chain) => {
    if (val === null) return null;
    return schema.inner(val, chain);
  };
  deployScm.seek('therapy.keep').fn = (val, schema, chain) => {
    
    if (val === null) return null;
    validate(chain, val, 'keep');
    return val;
    
  };
  deployScm.seek('therapy').kids.host = hostsScm;
  
  return scm;
  
};

let resolveConf = async userConf => {
  
  // !<ref>
  // !<rem>
  // !<def>
  
  let churn = async (actions) => {
    
    let remaining;
    if (isForm(actions, Object)) remaining = { ...actions };
    if (isForm(actions, Array)) remaining = actions.toObj((v, i) => [ i, v ]);
    if (!remaining) throw Error('Api: "actions" must resolve to Object/Array');
    
    let values = {};
    while (true) {
      let errs = [];
      let progress = false;
      let furtherActions = {};
      
      for (let [ k, fn ] of remaining) {
        
        let actionResult; /* { result, actions: { ... } }*/
        try { actionResult = await fn(values); } catch (err) { errs.push(err); continue; }
        
        if (!isForm(actionResult, Object)) throw Error('woAWwowowwaa').mod({ actionResult, fn: fn.toString() });
        
        progress = true;
        values[k] = actionResult.result;
        delete remaining[k];
        
        if (actionResult.has('actions')) {
          /// {DEBUG=
          if (!isForm(actionResult.actions, Object)) throw Error('OOofofowwwwsoasaoo').mod({ actionResult });
          /// =DEBUG}
          Object.assign(furtherActions, actionResult.actions);
        }
        
      }
      
      if (!progress) throw Error('Api: unable to make progress on churn').mod({
        remaining,
        cause: errs,
        partiallyChurnedValues: values
      });
      Object.assign(remaining, furtherActions);
      
      if (remaining.empty()) break;
      
    }
    return values;
    
  };
  let ipRegex = /[0-9]{1,3}(?:[.][0-9]{1,3}){3}/;
  
  let Confy = form({ name: 'Confy', props: (forms, Form) => ({
    
    $getValue: (values, relChain, relOrAbsDive) => {
      
      let dive = token.dive(relOrAbsDive);
      let [ cmp0, ...cmps ] = dive;
      /// {DEBUG=
      if (![ '[abs]', '[rel]' ].has(cmp0)) throw Error('Api: first dive component must be "[abs]" or "[rel]"');
      /// =DEBUG}
      
      let absCmps = [];
      for (let cmp of cmp0 === '[rel]' ? [ ...relChain, ...cmps ] : cmps)
        absCmps[cmp !== '[par]' ? 'push' : 'pop'](cmp); // `absCmp.pop(cmp)` simply ignores `cmp`
      
      // Imagine a case where `values` looks like:
      //    | {
      //    |   'root.heap.netIdens.myNetIden': {
      //    |     'details.email': 'myEmail'
      //    |   }
      //    | }
      // And `relOrAbsDive` looks like:
      //    | "[abs].root.heap.netIdens.myNetIden.detail.email"
      // (or generally any case where a mixture of dive-keys and actual
      // references need to be traversed in order to find the value)
      // TODO: This can be implemented more efficiently; still a search
      // against the whole `values` Object, for each key in the current
      // subset of `value` check if each key is a prefix of
      // `relOrAbsDive`, and for each which is, recurse on that key!
      // BETTER TODO: simply always store `values` in "diveKeysResolved"
      // format????
      values = values.diveKeysResolved(); // Creates new value (no in-place modification)
      
      let { found, val } = token.diveOn(absCmps, values);
      if (found) return val;
      
      throw Error(
        (absCmps.join('.') === cmps.join('.'))
          ? `Api: conf path "${relChain.join('.')}" requires missing chain "${absCmps.join('.')}"`
          : `Api: conf path "${relChain.join('.')}" requires missing chain "${absCmps.join('.')}" (provided as "${dive.join('.')}")`
      ).mod({ rel: relChain.join('.') });
        
    },
    
    init({ id=Math.random().toString(36).slice(2, 4) }={}) {
      Object.assign(this, { id });
    },
    async resolve({ conf, chain, getValue /* (relOrAbsDive) => someResolvedValue */ }) {
      throw Error('Not implemented');
    },
    getAction(conf, chain=['root']) {
      return values => {
        
        let getValue = Form.getValue.bound(values, chain);
        
        if (isForm(conf, String) && conf.hasHead('!<ref>'))
          conf = getValue(conf.slice('!<ref>'.length).trim());
        
        return this.resolve({ conf, chain, getValue });
        
      };
    }
    
  })});
  let ConfySet = form({ name: 'ConfySet', has: { Confy }, props: (forms, Form) => ({
    init({ kids={}, all=null, headOp=null, tailOp=null, ...args }={}) {
      forms.Confy.init.call(this, args);
      Object.assign(this, { kids: Object.plain(kids), all, headOp, tailOp });
    },
    resolve({ conf, chain, getValue }) {
      
      // We'll have problems if the parent needs its children resolved
      // first; the parent would throw an Error saying something like
      // "a.b.c requires a.b.c.d", which short-circuits before "a.b.c.d"
      // is returned as a further Action, meaning "a.b.c.d" will never
      // be initialized (results in churn failure)
      
      if (conf === '!<def>') conf = {};
      if (isForm(conf, String)) conf = conf.split(/[,+]/);
      if (isForm(conf, Array)) conf = conf.toObj((v, i) => [ i, v ]);
      if (!isForm(conf, Object)) throw Error(`Api: "${chain.join('.')}" expects value resolving to Object; got ${getFormName(conf)}`).mod({ value: conf });
      
      // Process `conf` before recursing (e.g. add some default items)
      if (this.headOp) conf = this.headOp({ conf, chain, getValue });
      
      // Pass the '!<def>' value for every Kid
      let orig = conf;
      conf = { ...{}.map.call(this.kids, v => '!<def>'), ...orig };
      
      let actions = {};
      for (let [ k, v ] of conf) {
        if (v === '!<rem>') continue;
        let kid = this.kids[k] ?? this.all;
        let kidChain = [ ...chain, k ];
        if (!kid) {
          actions[kidChain.join('.')] = () => Error(`Api: "${chain.join('.')}" has no Kid to handle "${k}"`).propagate({ conf });
          continue;
        }
        actions[kidChain.join('.')] = kid.getAction(v, kidChain);
      }
      
      // Processing afterwards looks a bit tricky - we add another
      // pending Action for the parent alongside all the Kid Actions -
      // this one will be able to reference values resulting from Kid
      // Actions! Note that this additional Action for the parent never
      // produces any further Actions!
      if (this.tailOp) actions[chain.join('.')] = values => tailOp({ conf, chain, getValue });
      
      // Note that `result` can be overwritten by `tailOp`, and also by
      // merging in the results from all Kids
      return { result: conf, actions };
    }
  })});
  let ConfyVal = form({ name: 'ConfyVal', has: { Confy }, props: (forms, Form) => ({
    
    $settlers: Object.plain({
      bln: { target: Boolean, tries: [
        [ Number, v => !!v ],
        [ String, v => {
          if ([ 'yes', 'true', 't', 'y' ].has(v.lower())) return true;
          if ([ 'no', 'false', 'f', 'n' ].has(v.lower())) return false;
          throw Error(`Api: string doesn't resolve to Boolean: "${v}"`);
        }]
      ]},
      str: { target: String, tries: [] },
      num: { target: Number, tries: [] },
      arr: { target: Array, tries: [
        [ String, v => v.split(/[,+]/).map(v => v.trim()) ],
        [ Object, v => v.toArr(v => v) ]
      ]}
    }),
    $rejectDefault: ({ chain }) => { throw Error(`Api: "${chain.join('.')}" was not provided a value and does not support a default value`); },
    
    init({ def=Form.rejectDefault, nullable=def===null, settle=null, fn=null, ...args }={}) {
      
      // - `def` is the default value or a synchronous Function giving a
      //   default value if the Confy receives "!<def>"
      // - `settle` is { target: Form, tries: [ [ Form1, fn1 ], [ Form2, fn2 ], ... ] }
      //   The settle "tries" must resolve the incoming value to the
      //   settle "target"; the only exception is if the incoming value
      //   is null and `nullable` is set to true
      // - `fn` arbitrarily rejects or transforms the given value; `fn`
      //   gets the final say after all logic has finished!
      
      if (isForm(settle, String)) {
        if (!Form.settlers[settle]) throw Error(`Api: invalid settle String "${settle}"`);
        settle = Form.settlers[settle];
      }
      if (settle && !isForm(settle, Object)) throw Error(`Api: when provided "settle" must resolve to Array; got ${getFormName(settle)}`);
      if (!hasForm(def, Function)) def = Function.createStub(def);
      
      forms.Confy.init.call(this, args);
      Object.assign(this, { def, settle, fn, nullable });
      
    },
    async resolve({ conf, chain, getValue }) {
      if (conf === '!<def>') conf = this.def({ conf, chain, getValue });
      
      if (this.settle) {
        let { target, tries } = this.settle;
        for (let [ Form, fn ] of tries) if (isForm(conf, Form)) conf = fn(conf);
        
        let valid = (conf === null && this.nullable) || isForm(conf, target);
        if (!valid) throw Error(`Api: "${chain.join('.')}" couldn't resolve value to ${target.name}`);
      }
      
      if (this.fn) {
        try { conf = await this.fn(conf, { getValue }); } catch (err) {
          if (!err.message.hasHead('Api: ')) err.message = `Api: "${chain.join('.')}" ${err.message}`;
          throw err;
        }
      }
      
      return { result: conf };
    }
    
  })});
  
  let confyRoot = ConfySet();
  confyRoot.kids.confKeeps = ConfySet({
    // Add in the default "def.js" Conf Keep
    headOp: ({ conf }) => ({ defInMill: '/[file:mill]/conf/def.js', ...conf }),
    all: ConfyVal({ settle: 'str' })
  });
  confyRoot.kids.heap = ConfyVal({ def: null }); // Accept arbitrary values
  let confyEnv = confyRoot.kids.environment = ConfySet();
  let confyDep = confyRoot.kids.deploy = ConfySet({ all: ConfySet() });
  
  // Environment values include:
  // - "device": metadata about this device running Hut
  // - "shell": info related to executing shell utilities
  // - "dnsProviders": hosts to use for resolving dns queries
  confyEnv.kids.device = ConfySet({ kids: {
    platform: ConfyVal({ settle: 'str', def: () => require('os').platform() }),
    operatingSystem: ConfyVal({ settle: 'str', def: () => require('os').version() }),
    numCpus: ConfyVal({ settle: 'num', def: () => require('os').cpus().length })
  }});
  confyEnv.kids.shell = ConfySet({
    kids: { openssl: ConfyVal({ settle: 'str', def: 'openssl' }) }
  });
  confyEnv.kids.dnsProviders = ConfyVal({ settle: 'arr', def: '1.1.1.1+1.0.0.1', fn: dnsNetAddrs => {
    
    if (dnsNetAddrs.length < 2) throw Error('requires minimum 2 dns values');
    for (let na of dnsNetAddrs)
      if (!ipRegex.test(na))
        throw Error(`requires valid network addresses; got "${na}"`);
    return dnsNetAddrs;
    
  }});
  
  // Make some reusable Confy instances:
  let confyNetIden = ConfySet({ kids: {
    
    name: ConfyVal({ settle: 'str', fn: (name, chain) => {
      if (!/^[a-z][a-zA-Z]*$/.test(name)) throw Error(`requires a String of alphabetic characters beginning with a lowercase character`);
      return name;
    }}),
    keep: ConfyVal({ settle: 'str' }),
    secureBits: ConfyVal({ settle: 'num', fn: (bits, chain) => {
      if (!bits.isInteger()) throw Error(`requires an integer number`);
      if (bits < 0) throw Error(`requires a value >= 0`);
      return bits;
    }}),
    email: ConfyVal({ settle: 'str', fn: email => {
      email = email.trim();
      if (!/^[^@]+[@][^.]+[.][^.]/.test(email)) throw Error(`must be a valid email`);
      return email;
    }}),
    password: ConfyVal({ settle: 'str', def: null }),
    certificateType: ConfyVal({ settle: 'str', def: null }),
    details: ConfySet({
      kids: {
        geo: ConfyVal({ settle: 'str', fn: geo => {
          let pcs = val.split('.');
          while (pcs.length < 6) pcs.push('?');
          return pcs.slice(0, 6).join('.');
        }}),
        org: ConfyVal({ settle: 'str', fn: org => {
          let pcs = val.split('.');
          while (pcs.length < 6) pcs.push('?');
          return pcs.slice(0, 6).join('.');
        }}),
      },
      all: ConfyVal({ settle: 'str' }) // Arbitrary String values
    })
    
  }});
  
  // Deploy values include:
  // - "subcon": control how debug information is output
  // - "host": hosting info for this deployment
  confyDep.all.kids.subcon = onto(ConfySet({
    headOp: ({ chain, conf, getValue }) => {
      let isRootSc = /^root[.]deploy[.][0-9]+[.]subcon$/.test(chain.join('.'));
      let params = isRootSc ? { chatter: 1, therapy: 0 } : getValue('[rel].[par].params');
      return { params }.merge(conf);
    },
    kids: {
      params: ConfySet({
        kids: {
          chatter: ConfyVal({ settle: 'bln' }),
          therapy: ConfyVal({ settle: 'bln' })
        },
        all: ConfyVal() // Accept aribtrary values
      })
    }
  }), confy => confy.all = confy);
  confyDep.all.kids.host = ConfySet({ kids: {
    
    netIden: confyNetIden,
    netAddr: ConfyVal({ settle: 'str', def: '!<auto>', fn: async (netAddr, { getValue }) => {
      
      // 'localhost'
      // '127.0.0.1'
      // '211.122.42.7'
      // '!<auto>'
      
      // TODO: HEEERE!!! Copy from (removed) foundationNodejs, then
      // immediately test NetworkIdentity, Hosting, etc. within conf! I
      // think typed lists are totally (like netIdens, hosts, etc.) are
      // totally deprecated; there should be one big blob of "stored"
      // values, and it can be naively referenced however a user wants
      // to set up their configuration. At the end of the day the
      // "deploy" property validates all values so that all
      // NetworkIdentities, hosts, etc. must be properly configured!
      
      if (netAddr === '!<auto>') {
        
        // Autodetect the best NetworkAddress to use for this machine
        
        let dnsNetAddrs = getValue('[abs].root.environment.dnsProviders');
        let dnsResolver = new (require('dns').promises.Resolver)();
        dnsResolver.setServers(dnsNetAddrs); // Use DNS servers defined in Conf
        
        let ips = require('os').networkInterfaces()
          .toArr(v => v).flat()                       // Flat list of all interfaces
          .map(v => v.internal ? skip : v.address);   // Remove internal interfaces
        
        let potentialHosts = (await Promise.all(ips.map(async ip => {
          
          ip = ip.split('.').map(v => parseInt(v, 10));
          
          // TODO: support ipv6!
          if (ip.count() !== 4 || ip.find(v => !isForm(v, Number)).found) return skip;
          
          let type = (() => {
            
            // Reserved:
            // 0.0.0.0 -> 0.255.255.255
            if (ip[0] === 0) return 'reserved';
            
            // Loopback:
            // 127.0.0.0 -> 127.255.255.255
            if (ip[0] === 127) return 'loopback';
            
            // Private; any of:
            // 10.0.0.0 -> 10.255.255.255,
            // 172.16.0.0 -> 172.31.255.255,
            // 192.168.0.0 -> 192.168.255.255
            if (ip[0] === 10) return 'private'
            if (ip[0] === 172 && ip[1] >= 16 && ip[1] <= 31) return 'private';
            if (ip[0] === 192 && ip[1] === 168) return 'private';
            
            // Any other address is public
            return 'external';
            
          })();
          
          // Reserved hosts are ignored entirely
          if (type === 'reserved') return skip;
          
          // Loopback hosts are the least powerful
          if (type === 'loopback') return { type, rank: 0, ip, addr: null };
          
          // Next-best is private; available on local network. Note
          // that class C ips (whose first component is >= 192) are
          // preferable to class B ips (below that range)
          if (type === 'private' && ip[0] <= 191) return { type, rank: 1, ip, addr: null };
          if (type === 'private' && ip[0] >= 192) return { type, rank: 2, ip, addr: null };
          
          // Remaining types will be "external"; within "external"
          // there are three different ranks (from worst to best:)
          // - Non-reversible
          // - Reversible but lacking A-record
          // - Reversible with A-record present (globally addressable)
          try {
            
            // Reverse `ip` into any related hostnames
            let addrs = await dnsResolver.reverse(ip.map(n => n.toString(10)).join('.'));
            
            // Only consider hostnames with available A records
            return Promise.all(addrs.map(async addr => {
              
              // If an A record is found this is the most powerful
              // address possible (globally addressable)
              try {
                await dnsResolver.resolve(addr, 'A');
                return { type: 'public', rank: 5, ip, addr };
              } catch (err) {
                // Reversable ips without A records are one level down
                // from globally addressable results
                return { type: 'publicNoHost', rank: 4, ip, addr };
              }
              
            }));
            
          } catch (err) {
            
            // The address is external but not reversible
            return { type: 'external', rank: 3, ip, addr: null };
            
          }
          
        }))).flat();
        
        let bestRank = Math.max(...potentialHosts.map(v => v.rank));
        let bestHosts = potentialHosts.map(v => v.rank === bestRank ? (v.addr || v.ip.join('.')) : skip);
        
        netAddr = bestHosts.length ? bestHosts[0] : 'localhost';
        
      }
      
      if (netAddr !== 'localhost' && !ipRegex.test(netAddr))
        throw Error(`requires valid network address; got "${netAddr}"`);
      
      return netAddr;
      
    }})
    
  }});
  
  // TODO: Right now this mirrors the present-use logic, except some
  // logic related to defaulting ports is still missing
  
  let fullConf = {};
  let extendConf = async (cf, { tolerateErrors=false }) => {
    
    // Modifies `fullConf` in-place
    
    fullConf.merge(cf.diveKeysResolved());
    
    let values;
    try {
      values = await churn({ root: confyRoot.getAction(fullConf, [ 'root' ]) });
    } catch (err) {
      if (!tolerateErrors) throw err;
      if (!/unable to make progress on churn/.test(err.message)) throw err.mod(msg => `Unexpected error while churning: ${mg}`);
      values = err.partiallyChurnedValues;
    }
    
    fullConf = values.diveKeysResolved().root;
    
  };
  
  await extendConf(userConf, { tolerateErrors: true });
  
  if (fullConf.has('confKeeps') && !fullConf.confKeeps.empty()) {
    
    let confKeeps = await Promise.all(fullConf.confKeeps.map(async (confKeepDiveToken, term) => {
      
      let confKeep = global.keep(confKeepDiveToken);
      let content = null;
      try {
        content = await confKeep.getContent('utf8');
        content = content.replace(/[;\s]+$/, ''); // Remove tailing whitespace and semicolons
        return await eval(`(${content})`);
      } catch (err) {
        err.propagate({ term, confKeep: confKeep.desc(), content });
      }
      
    }));
    
    // Apply all KeepConfs
    for (let [ confKeepKey, confKeep ] of confKeeps) await extendConf(confKeep, { tolerateErrors: true });
    
  }
  
  // Always finally merge the UserConf (it overrides any KeepConf)
  try { await extendConf(userConf, { tolerateErrors: false }); } catch (err) {
    if (!/unable to make progress on churn/.test(err.message)) throw err;
    gsc([ 'Invalid configuration:', ...err.cause.map(err => `- ${err.message}`) ].join('\n'));
    process.exitHard();
  }
  
  return fullConf;
  
};

module.exports = async ({ hutFp, conf: rawConf }) => {
  
  // Extend `global` with all the functionality needed to run Huts
  
  // Get Keep representing the root Hut repo location
  // Note that typically transactions are Ended but this one will span
  // the full lifetime of the Hut process
  hutFp = Filepath(hutFp);
  let hutKeep = FsKeep(await rootTrn.kid(hutFp), hutFp);
  
  global.bufferedLogs = [];
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
        if (!this.map[prop]) throw Error(`Api: invalid slot: ${getFormName(this)} -> "${prop}"`);
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
    
    // The index in the stack trace which is the callsite that invoked
    // the subcon call (gets overwritten later when therapy requires
    // calling subcons from deeper stack depths)
    global.subcon.relevantTraceIndex = 2;
    global.subconOutput = (sc, ...args) => {
      
      /// {DEBUG=
      let trace = Error('trace').getInfo().trace;
      /// =DEBUG}
      
      thenAll(args.map(arg => isForm(arg, Function) ? arg(sc) : arg), args => {
        
        // TODO: Prevent stdout output if "output.format" is false; this
        // can replace `output.inline`! (Or... can it??)
        // DO NOT PERFORM DEBUGGING SUBCON OUTPUT IN THIS FUNCTION
        
        let ptr = { kids: { root: conf('subcon') } };
        let inheritedConf = {};
        for (let pc of [ 'root', ...token.dive(sc.term) ]) {
          ptr = ptr.kids?.[pc];
          if (!ptr) break;
          inheritedConf.merge(ptr);
          delete inheritedConf.kids;
        }
        
        let { output={ inline: true }, format=null } = inheritedConf;
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
        
        let leftLns = [ `[${sc.term.slice(-leftColW)}]`, now ];
        let rightLns = args.map(v => {
          if (!isForm(v, String)) v = formatAnyValue(v, { depth });
          return v.split(/\r?\n/);
        }).flat();
        
        let call = trace[global.subcon.relevantTraceIndex];
        call = call?.file && `${token.dive(call.file).slice(-1)[0]} ${call.row}:${call.col}`;
        if (call) {
          let extraChars = call.length - leftColW;
          if (extraChars > 0) call = call.slice(extraChars + 1) + '\u2026';
          leftLns.push(call);
        }
        
        let logStr = Math.max(leftLns.length, rightLns.length).toArr(n => {
          let l = (leftLns[n] || '').padTail(leftColW);
          let r = rightLns[n] || '';
          return l + vertDash() + ' ' + r;
        }).join('\n');
        
        let topLine = (28).toArr(horzDash).join('') + junction() + (50).toArr(horzDash).join('');
        console.log(topLine + '\n' + logStr);
        
      });
      
    };
    
    // Show any logs that accumulated before `subconOutput` was ready
    let pending = global.bufferedLogs;
    global.bufferedLogs = null;
    for (let args of pending) global.subconOutput(...args);
    
    global.subconOpts = sc => {
      return global.conf(token.dive(sc.term).join('.kids.'));
    };
    
  })();
  
  // Enable `global.conf`
  // - requires `global.keep`
  // - requires `global.subconOutput`
  await (async () => {
    
    let t = getMs();
    
    let conf = await resolveConf(rawConf);
    gsc({ conf });
    process.exit(0);
    
    global.conf = (diveToken, def=null) => token.diveOn(diveToken, conf, def).val;
    
    /*
    // Additional Conf value sanitization and defaulting:
    
    // Provide defaults for Ports
    for (let [ , protocol ] of conf.deploy.host.protocols) {
      
      if (protocol.port !== null) continue;
      
      let netIden = conf.deploy.host.netIden;
      
      if ([ 'http' ].includes(protocol.protocol))
        protocol.port = (netIden.secureBits > 0) ? 443 : 80;
      
      if ([ 'ws', 'sokt' ].includes(protocol.protocol))
        protocol.port = (netIden.secureBits > 0) ? 443 : 80;
      
    }
    */
    
    setupSc(`Configuration processed after ${(getMs() - t).toFixed(2)}ms`, conf);
    
  })();
  
  // Enable:
  // - `global.getCompiledKeep`
  // - `global.mapCmpToSrc`
  // - `global.getRooms`
  // Depends on `global.conf`
  await (async () => {
    
    let srcKeep = keep('[file:code:src]');
    let cmpKeep = keep('[file:code:cmp]');
    let loadedRooms = Map();
    
    // Note these "default features" should only define features which
    // are always synced up regardless of the bearing; Hut by default
    // expects to run at multiple bearings, so there are no "default"
    // values for bearing-specific features! (They should always be
    // passed when calling `getCompiledCode` from a particular context!)
    let defaultFeatures = {
      debug:  conf('deploy.maturity') === 'dev',
      assert: conf('deploy.maturity') === 'dev',
      ...conf('deploy.features')
    };
    let getCompiledCode = async (keep, features=Object.stub) => {
      
      // Take a Keep containing source code and return compiled code and
      // all data necessary to map compiled codepoints; note we DON'T
      // write any data to any other Keep! (that's `getCompiledKeep`!!)
      
      let t = getMs();
      
      features = Set({ ...defaultFeatures, ...features }.toArr((v, k) => v ? k.lower() : skip));
      
      /// {DEBUG=
      if (!isForm(features, Set)) throw Error(`Api: "features" must resolve to Set; got ${getFormName(features)}`);
      let invalidFeature = features.find(f => !/^[a-z]+$/.test(f)).val;
      if (invalidFeature) throw Error(`Invalid feature: "${invalidFeature}"`);
      /// =DEBUG}
      
      let content = await keep.getContent('utf8');
      if (!content) throw Error(`Api: no sourcecode available from ${keep.desc()}`);
      
      let srcLines = content.split('\n'); // TODO: What about \r??
      
      // Matches, e.g., '{BEL/OW=', '{ABO/VE=', etc.
      let featureHeadReg = /[{]([a-zA-Z]+)[=]/i;
      
      let blocks = [];
      let curBlock = null;
      
      for (let i = 0; i < srcLines.length; i++) {
        
        let line = srcLines[i].trim();
        
        // In a block, check for the block end
        if (curBlock && line.includes(curBlock.tailMatch)) {
          curBlock.tail = i;
          blocks.push(curBlock);
          curBlock = null;
        }
        
        // Outside a block, check for start of any block
        if (!curBlock) {
          // Note that features are case-insensitive when they appear in
          // sourcecode, but the matching feature tag must use the exact
          // same casing
          let [ , type=null ] = line.match(featureHeadReg) ?? [];
          if (type) {
            curBlock = { type: type.lower(), tailMatch: `=${type}}`, head: i, tail: -1 };
          }
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
        
        // Reference the block which applies to the current line
        if (!curBlock && blocks[nextBlockInd]?.head === i) curBlock = blocks[nextBlockInd++];
        
        // `curBlock.type` and all values in `features` are lowercase
        let keepLine = true;
        if (!line) keepLine = false;                                    // Remove blank lines
        if (curBlock && i === curBlock.head) keepLine = false;          // Remove block start line
        if (curBlock && i === curBlock.tail) keepLine = false;          // Remove block end line
        if (curBlock && !features.has(curBlock.type)) keepLine = false; // Remove blocks based on feature config
        
        // Additional processing may result in negating `keepLine`
        if (keepLine) {
          
          line = line
            .replace(captureLineCommentRegex, '')
            .replace(captureInlineBlockCommentRegex, '')
            .trim();
          
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
        return `Compiled ${keep.desc()}\nLine difference: ${srcCnt} -> ${trgCnt} (-${srcCnt - trgCnt})\nTook ${ (getMs() - t).toFixed(2) }ms`;
      });
      /// =DEBUG}
      
      return { lines: filteredLines, offsets };
      
    };
    global.getCompiledKeep = async (bearing, roomDive) => {
      
      // Returns a Keep representing the compiled code associated with
      // some Room. Note an optimal function signature here would simply
      // be `bearing, srcKeep` - but it's easier to accept a PARTIAL
      // DiveToken. Note it should be partial to reference both the src
      // and cmp Keeps. Accepting a full DiveToken or Keep would make it
      // awkward to reference the corresponding compiled Keep! Should
      // probably just write something like `async srcKeepToCmpKeep`...
      
      roomDive = token.dive(roomDive);
      
      let cmpKeep = keep([ 'file:code:cmp', bearing, ...roomDive, `${roomDive.slice(-1)[0]}.js` ]);
      if (await cmpKeep.exists()) return cmpKeep;
      
      let srcKeep = keep([ 'file:code:src', ...roomDive, `${roomDive.slice(-1)[0]}.js` ]);
      let { lines, offsets } = await getCompiledCode(srcKeep, {
        above: [ 'above', 'between' ].has(bearing),
        below: [ 'below', 'between' ].has(bearing)
      });
      
      if (!lines.count()) {
        await cmpKeep.setContent(`'use strict';`); // Write something to avoid recompiling later
        return cmpKeep;
      }
      
      // Embed `offsets` within `lines` for BELOW or setup
      if (conf('deploy.maturity') === 'dev' && [ 'below', 'setup' ].has(bearing)) {
        
        let headInd = 0;
        let tailInd = lines.length - 1;
        let lastLine = lines[tailInd];
        
        // We always expect the last line to end with "};"
        if (!lastLine.hasTail('};')) throw Error(`Last character of ${roomDive.join('.')} is "${lastLine.slice(-2)}"; not "};"`);
        
        // Lines should look like:
        //    | 'use strict';global.rooms['example'] = async () => {
        //    |   .
        //    |   .
        //    |   .
        //    | };Object.assign(global.rooms['example'],{"offsets":[...]});
        //    |
        /// {DEBUG=
        lines[tailInd] += `if(!global.rooms['${roomDive.join('.')}'])throw Error('No definition for global.rooms[\\'${roomDive.join('.')}\\']');`
        /// =DEBUG}
        lines[tailInd] += `Object.assign(global.rooms['${roomDive.join('.')}'],${valToJson({ offsets })});`;
        
      }
      
      if (conf('deploy.features.wrapBelowCode') ?? false) {
        
        // TODO: This feature should be implemented via compilation
        // (i.e. no `if (...) { ... }` but rather {WRAP/BELOWCODE=
        // =WRAP/BELOWCODE}), but `foundation.js` isn't compiled rn!
        
        // SyntaxError is uncatchable in FoundationBrowser and has no
        // useful trace. We can circumvent this by sending code which
        // cannot cause a SyntaxError directly; instead the code is
        // represented as a foolproof String, and then it is eval'd.
        // If the string represents syntactically incorrect js, `eval`
        // will crash but the script will have loaded without issue;
        // a much more descriptive trace can result! There's also an
        // effort here to not change the line count in order to keep
        // debuggability; for this reason all wrapping code is
        // appended/prepended to the first/last lines.
        let escQt = '\\' + `'`;
        let escEsc = '\\' + '\\';
        let headEvalStr = `eval([`;
        let tailEvalStr = `].join('\\n'));`;
        
        lines = lines.map(ln => `'` + ln.replace(/\\/g, escEsc).replace(/'/g, escQt) + `',`); // Ugly trailing comma
        let headInd = 0;
        let tailInd = lines.length - 1;
        lines[headInd] = headEvalStr + lines[headInd];
        lines[tailInd] = lines[tailInd] + tailEvalStr;
        
      }
      
      await cmpKeep.setContent(lines.join('\n'));
      
      return cmpKeep;
      
    };
    global.mapCmpToSrc = (cmpDiveToken, row, col) => {
      
      // Note `file` is a String with sequential slashes (bwds and fwds)
      // replaced with a single forward slash
      // Returns `{ file, col, row, context }`
      
      let mapCmpKeep = global.keep(cmpDiveToken);
      
      // Only map compiled files
      if (!cmpKeep.contains(mapCmpKeep)) return { file: mapCmpKeep.desc(), row, col, context: null };
      
      // Path looks like "..../path/to/compiled/<bearing>/<roomName>
      let [ bearing, roomName, cmp ] = mapCmpKeep.fp.cmps.slice(cmpKeep.fp.cmps.length);
      
      let { offsets } = global.rooms[roomName];
      
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
      
      let roomPcs = roomName.split('.');
      let roomPcLast = roomPcs.slice(-1)[0];
      return {
        file: srcKeep.fp.kid([ roomPcs, roomPcLast + '.js' ]).desc(),
        row: srcRow,
        col: srcCol,
        context
      };
      
    };
    global.getRooms = (names, { shorten=true }={}) => {
      
      let bearing = conf('deploy.bearing');
      let err = Error('trace');
      return thenAll(names.toObj(name => {
        
        let room = loadedRooms.get(name);
        if (!room) loadedRooms.add(name, room = (async () => {
          
          try {
            
            let namePcs = name.split('.');
            let roomSrcKeep = srcKeep.access([ ...namePcs, `${namePcs.slice(-1)[0]}.js` ]);
            
            let { lines, offsets } = await getCompiledCode(roomSrcKeep, {
              above: [ 'above', 'between' ].has(bearing),
              below: [ 'below', 'between' ].has(bearing)
            });
            
            let roomCmpKeep = cmpKeep.seek([ bearing, name, 'cmp' ]);
            await roomCmpKeep.setContent(lines.join('\n'));
            
            let roomDbgKeep = cmpKeep.seek([ bearing, name, 'debug' ]);
            await roomDbgKeep.setContent(valToSer({ offsets }));
            
            global.rooms[name] = { offsets }; // Make debug info available before `require` to help map SyntaxErrors
            
            require(roomCmpKeep.fp.fsp()); // Need to stop pretending like `cmpKeep` is a generic Keep (although maybe could `eval` it??)
            if (!global.rooms[name]) throw Error(`Room "${name}" didn't set global.rooms['${name}']`);
            if (!hasForm(global.rooms[name], Function)) throw Error(`Room "${name}" set non-function at global.rooms['${name}']`).mod({ value: global.rooms[name] });
            
            // The file executed and defined `global.room[name]` to be a
            // function; return a call to that function; pass the Keep
            // representing the sourcecode's parent!
            let result = await Object.assign(global.rooms[name], { offsets })(srcKeep.access(namePcs));
            loadedRooms.add(name, result);
            return result;
            
          } catch (cause) {
            
            err.propagate({ cause, msg: `Failed to load Room from term "${name}"` });
            
          }
          
        })());
        
        return [ shorten ? name.split('.').slice(-1)[0] : name, room ];
        
      }));
      
    };
    
  })();
  
  // Run tests (requires `global.getRoom`)
  await (async () => {
    let t = getMs();
    await require('./test.js')();
    subcon('setup.test')(`Tests completed after ${(getMs() - t).toFixed(2)}ms`);
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
    
    let therapyKeep = conf('deploy.therapy.keep');
    
    let { record, WeakBank=null, KeepBank=null } = await global.getRooms([
      'record',
      `record.bank.${therapyKeep ? 'KeepBank' : 'WeakBank'}`
    ]);
    
    let bank = therapyKeep
      ? KeepBank({ subcon: null, keep: global.keep(therapyKeep) })
      : WeakBank({ subcon: null });
    
    let therapyRecMan = record.Manager({ bank });
    
    // Stack depth for subcon invocations has gotten deeper!
    global.subcon.relevantTraceIndex = 3;
    
    let subconWriteStdout = global.subconOutput;
    global.subconOutput = (sc, ...args) => {
      
      subconWriteStdout(sc, ...args);
      let term = sc.term;
      
    };
    
  })();
  
  // RUN DAT
  await (async () => {
    
    let activateTmp = Tmp();
    process.on('exit', () => activateTmp.end());
    
    // Wipe out code from previous run
    await keep('[file:code:cmp]').rem();
    
    let { uid=null, prefix, keep: bankKeepTerm, host, therapy } = global.conf('deploy');
    let { netAddr, heartbeatMs } = host;
    
    let { hut, record, WeakBank=null, KeepBank=null } = await global.getRooms([
      'setup.hut',
      'record',
      `record.bank.${bankKeepTerm ? 'KeepBank' : 'WeakBank'}`
    ]);
    
    // Get an AboveHut with the appropriate config
    let bank = bankKeepTerm
      ? KeepBank({ subcon: global.subcon('bank'), keep: global.keep(bankKeepTerm) })
      : WeakBank({ subcon: global.subcon('bank') });
    
    let recMan = record.Manager({ bank });
    let aboveHut = hut.AboveHut({ hid: uid, prefix, par: null, isHere: true, recMan, heartbeatMs });
    activateTmp.endWith(aboveHut);
    
    // Server management
    let NetworkIdentity = require('./NetworkIdentity.js');
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
    
    let netIden = NetworkIdentity(host.netIden);
    let servers = host.protocols.toArr(serverOpts => {
      
      // TODO: Abstract `${netAddr}:${port}` as a NetworkProcessAddress
      // (or "nepAddr")? This would probably be an attribute located at
      // "deploy.loft.host.protocols[n]", meaning not every server under
      // "deploy.loft.host" must use the same NetworkAddress
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
    let loadtest = null;
    
    if (conf('deploy.features.loadtest', false)) {
      
      // Cleanup any previous loadtests
      await keep('[file:mill].loadtest').rem();
      
      loadtest = await require('./loadtest/loadtest.js')({
        aboveHut,
        netIden,
        instancesKeep: keep('[file:mill].loadtest'),
        getServerSessionKey: getSessionKey
      });
      
      servers.push(loadtest.server);
      
    }
    
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
      activateTmp.endWith(server);
    }
    
    activateTmp.endWith(netIden.runOnNetwork());
    
    let loft = await getRoom(global.conf('deploy.loft'));
    let loftTmp = await loft.open({ hereHut: aboveHut, netIden });
    activateTmp.endWith(loftTmp);
    
    if (therapy) {
      
      // Note that Keep is allowed to be null (volatile subcon logs) but
      // "host" is mandatory
      let { host, keep } = therapy;
      let { netAddr, heartbeatMs } = host;
      
      let netIden = NetworkIdentity(host.netIden);
      let servers = host.protocols.toArr(serverOpts => {
        
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
      
    }
    
    // Run load-testing if configured
    if (loadtest) activateTmp.endWith(loadtest.run());
    
  })();
  
};

Object.assign(module.exports, { captureLineCommentRegex, captureInlineBlockCommentRegex });
