'use strict';

require('../room/setup/clearing/clearing.js');
let util = require('util');
let { rootTransaction: rootTrn, Filepath, FsKeep } = require('./filesys.js');
let NetworkIdentity = require('./NetworkIdentity.js');

// Set up basic monitoring
(() => {
  
  // https://nodejs.org/api/process.html#signal-events
  let origExit = process.exit;
  process.exitNow = process.exit;
  process.exit = code => {
    gsc(Error(`Process explicitly exited (${code})`));
    process.explicitExit = true;
    return process.exitNow(code);
  };
  
  // NOTE: Trying to catch SIGKILL or SIGSTOP crashes posix!
  // https://github.com/nodejs/node-v0.x-archive/issues/6339
  let evts = 'hup,int,pipe,quit,term,tstp,break'.split(',');
  let haltEvts = Set('int,term,quit'.split(','));
  for (let evt of evts) process.on(`sig${evt}`.upper(), (...args) => {
    gsc(`Received event: "${evt}"`, args);
    haltEvts.has(evt) && process.exit(isForm(args[1], Number) ? args[1] : -1);
  });
  
  let onErr = err => {
    if (err['~suppressed']) return; // Ignore suppressed errors
    gsc(`Uncaught ${getFormName(err)}:`, err.desc());
    process.exitNow(1);
  };
  process.on('uncaughtException', onErr);
  process.on('unhandledRejection', onErr);
  process.on('exit', code => process.explicitExit || gsc(`Hut terminated (code: ${code})`));
  
})();

let niceRegex = (...args /* flags, niceRegexStr | niceRegexStr */) => {
  
  // Allows writing self-documenting regular expressions
  
  let [ flags, str ] = (args.length === 2) ? args : [ '', args[0] ];
  
  let lns = str.split('\n').map(line => line.trimTail());
  let cols = Math.max(...lns.map(line => line.length)).toArr(col => Set(lns.map(ln => ln[col])));
  cols.each(col => col.size > 1 && col.rem(' '));
  
  /// {DEBUG=
  for (let [ num, col ] of cols.entries()) if (col.size > 1) throw Error(`Conflicting values at column ${num}: [${[ ...col ].join('')}]`);
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

module.exports = async ({ hutFp: hutFpRaw, conf: rawConf }) => {
  
  // Asynchronously init the Hut transaction
  let hutFp = Filepath(hutFpRaw);
  let hutKeepPrm = rootTrn.kid(hutFp).then(trn => FsKeep(trn, hutFp));
  
  { // Setup initial utils
    
    // Make `global.subconOutput` immediately available (but any log
    // invocations will only show up after configuration is complete)
    global.subconOutput = (...args) => global.subconOutput.buffered.push(args); // Buffer everything
    global.subconOutput.buffered = [];
    
    // Define `global.formatAnyValue`
    global.formatAnyValue = (val, { colors=true, depth=10 }={}) => util.inspect(val, { colors, depth });
    
    // Make sure Errors are formatted properly by util.inspect
    Object.defineProperty(Error.prototype, Symbol.for('nodejs.util.inspect.custom'), {
      enumerable: false,
      writable: true,
      value: function(depth, opts, custom) { return this.desc(); }
    });
    
  };
  
  { // Calibrate hi-res `getMs`; overwrites `global.getMs`
    
    // Find a hi-res timestamp very close to a Date.now() millisecond
    // tickover; we determine whether we're close to the beginning of a
    // millisecond tickover by counting busy-wait iterations completed
    // before the end of the millisecond; the more, the closer we assume
    // we were to the millisecond origin. Finally use the nearest such
    // millisecond as an origin time for `getMs` calls, supplemented by
    // a hi-res value
    let { performance: perf } = require('perf_hooks');
    let getMsHiRes = perf.now.bind(perf);
    let getMsLoRes = Date.now;
    
    let origin = getMsHiRes() - getMsLoRes(); // We're going to tune `origin` to the average difference between `nowHiRes()` and `nowLoRes()`
    let maxMs = 15; // How long to calibrate (and busy-wait) for
    let lo0 = getMsLoRes();
    while (true) {
      
      let [ lo, hi ] = [ getMsLoRes(), getMsHiRes() ];
      let elapsed = lo - lo0;
      if (elapsed > maxMs) break; // 30ms busy-wait
      
      let diff = (lo + 0.5) - hi; // `lo` marks the *beginning* of a millisecond, so add 0.5 on average!
      
      // The later we go the amount of change to `origin` decreases
      let amt = elapsed / maxMs;
      origin = origin * amt + diff * (1 - amt);
      
    }
    
    global.getMs = () => origin + getMsHiRes();
    
  };
  
  // Initial subcon log...
  let setupSc = global.subcon('setup');
  setupSc(`utc: ${getMs()}\npid: ${process.pid}`);
  
  { // Setup `global.keep`
    
    let RootKeep = form({ name: 'RootKeep', has: { Keep }, props: (forms, Form) => ({
      
      init(map) { Object.assign(this, { map: Object.plain(map) }); },
      access(prop) {
        if (prop[0] === '[') prop = prop.slice(1, -1);
        if (!this.map[prop]) throw Error(`Api: invalid slot: ${getFormName(this)} -> "${prop}"`);
        return this.map[prop];
      }
      
    })});
    
    let rootFsKeep = FsKeep(rootTrn, Filepath([]));
    let hutKeep = await hutKeepPrm;
    let rootKeep = RootKeep({
      
      'file': rootFsKeep,
      'file:root': rootFsKeep,
      'file:repo': hutKeep,
      'file:mill': hutKeep.seek('mill'),
      'file:code:src': hutKeep.seek('room'),
      'file:code:cmp': hutKeep.seek('mill.cmp')
      
    });
    
    global.keep = (diveToken) => {
      return rootKeep.seek(token.dive(diveToken));
    };
    
  };
  
  { // Resolve configuration and get subcon output working
    
    let resolveConf = async () => {
      
      // Note that `globalConf` and `global.conf` will be initialized as
      // far as possible, even if the config is never fully resolved!
      
      let globalConf = {};
      global.conf = (diveToken, def='TODOhijklmno') => {
        
        let v = token.diveOn(diveToken, globalConf, def).val;
        if (v === 'TODOhijklmno') throw Error(`Api: bad conf dive token`).mod({ diveToken });
        return v;
        
      };
      
      let { ConfySet, ConfyVal, ConfyNullable } = (() => {
        
        // !<ref> !<lnk>
        // !<rem>
        // !<def>
        
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
            
            if (cmp0 === '[abs]') absCmps = [ 'root', ...absCmps ];
            
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
          $wrapFn: async ({ conf, orig=null, chain }, fn) => {
            
            try { return await fn(); } catch (err) {
              
              err.propagate(msg => ({
                msg: msg.hasHead('Api: ') ? msg : `Api: "${chain.join('.')}" ${msg}`,
                value: conf,
                ...(orig && { origValue: orig })
              }));
              
            }
            
          },
          
          init() {},
          resolve({ conf, chain, getValue /* (relOrAbsDive) => someResolvedValue */ }) {
            throw Error('Not implemented');
          },
          getAction(conf, chain=['root']) {
            return async values => {
              
              let getValue = Form.getValue.bound(values, chain);
              let orig = conf;
              let isRef = isForm(conf, String) && conf.hasHead('!<ref>');
              
              return Form.wrapFn({ conf, orig: isRef ? orig : null, chain }, () => {
                if (isRef) conf = getValue(conf.slice('!<ref>'.length).trim());
                return this.resolve({ conf, chain, getValue });
              });
              
            };
          }
          
        })});
        let ConfySet = form({ name: 'ConfySet', has: { Confy }, props: (forms, Form) => ({
          init({ kids={}, all=null, headOp=null, tailOp=null, ...args }={}) {
            Object.assign(this, { kids: Object.plain(kids), all, headOp, tailOp });
          },
          resolve({ conf, chain, getValue }) {
            
            // We'll have problems if the parent needs its children resolved
            // first; the parent would throw an Error saying something like
            // "a.b.c requires a.b.c.d", which short-circuits before "a.b.c.d"
            // is returned as a further Action, meaning "a.b.c.d" will never
            // be initialized (results in churn failure)
            
            if (conf === '!<def>') conf = {};
            let orig = conf;
            
            // Process `conf` before recursing (e.g. add some default items)
            if (this.headOp) conf = this.headOp({ conf, chain, getValue });
            
            if (isForm(conf, String)) conf = conf.split(/[,+]/);
            if (isForm(conf, Array)) conf = conf.toObj((v, i) => [ i, v ]);
            if (!isForm(conf, Object)) throw Error(`requires value resolving to Object; got ${getFormName(conf)}`);
            
            // Pass the '!<def>' value for every Kid
            conf = { ...{}.map.call(this.kids, v => '!<def>'), ...conf };
            
            let actions = {};
            for (let [ k, v ] of conf) {
              if (v === '!<rem>') continue;
              let kid = this.kids[k] ?? this.all;
              let kidChain = [ ...chain, k ];
              actions[kidChain.join('.')] = kid
                ? kid.getAction(v, kidChain)
                : () => Error(`Api: "${chain.join('.')}" has no Kid to handle "${k}"`).propagate({ conf });
            }
            
            // Processing afterwards looks a bit tricky - we add another
            // pending Action for the parent alongside all the Kid Actions -
            // this one will be able to reference values resulting from Kid
            // Actions! Note that this additional Action for the parent never
            // produces any further Actions!
            if (this.tailOp) actions[chain.join('.')] = values =>
              Form.wrapFn({ conf, chain }, () => this.tailOp({ conf, chain, getValue }));
            
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
                throw Error(`failed resolving String "${v}" to Boolean`);
              }]
            ]},
            str: { target: String, tries: [] },
            num: { target: Number, tries: [
              [ String, v => {
                let num = parseInt(v, 10);
                let str = num.toString();
                if (v !== str && v !== '+' + str) throw Error(`failed resolving String "${v}" to Number`);
                return num;
              }]
            ]},
            arr: { target: Array, tries: [
              [ String, v => {
                let [ delim=null ] = v.match(/[,+$]/);
                return delim ? v.split(delim).map(v => v.trim() || skip) : [ v ];
              }],
              [ Object, v => v.toArr(v => v) ]
            ]}
          }),
          $rejectDefault: ({ chain }) => { throw Error('requires a value'); },
          
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
            
            Object.assign(this, { def, settle, fn, nullable });
            
          },
          async resolve({ conf, chain, getValue }) {
            
            if (conf === '!<def>') conf = this.def({ conf, chain, getValue });
            
            if (this.settle) {
              let orig = conf;
              let { target, tries } = this.settle;
              for (let [ Form, fn ] of tries) if (isForm(conf, Form)) conf = fn(conf);
              
              let valid = (conf === null && this.nullable) || isForm(conf, target);
              if (!valid) throw Error(`couldn't resolve value to ${target.name}`);
            }
            
            if (this.fn) conf = await this.fn(conf, { getValue });
            
            return { result: conf };
          }
          
        })});
        let ConfyNullable = form({ name: 'ConfyNullable', has: { Confy }, props: (forms, Form) => ({
          init(confy) { Object.assign(this, { confy }); },
          resolve({ conf, chain, getValue }) {
            if (conf === '!<def>') return { result: null };
            if (conf === null) return { result: null };
            //if (isForm(conf, Object) && conf.empty()) return { result: null };
            return { result: null, actions: { [chain.join('.')]: this.confy.getAction(conf, chain) }};
          }
        })});
        
        return { ConfySet, ConfyVal, ConfyNullable };
        
      })();
      
      let confyRoot = (() => {
        
        // TODO: This misses semantics; e.g. "999.999.000.900"
        let ipRegex = niceRegex(String.baseline(`
          | ^
          |  [0-9]{1,3}
          |            (?:             ){3}
          |               [.][0-9]{1,3}
          |                                $
        `));
        let protocolRegex = niceRegex(String.baseline(`
          | ^                                             $
          | ^([a-zA-Z]+)                                  $
          | ^           (?:           )?                  $
          | ^              [:]([0-9]+)                    $
          | ^                           (?:             )?$
          | ^                              [<]([^>]*)[>]  $
        `));
        
        let confyRoot = ConfySet();
        confyRoot.kids.heap = ConfyVal({ def: null }); // Accept arbitrary values
        confyRoot.kids.confKeeps = ConfySet({
          // Add in the default "def.js" Conf Keep
          headOp: ({ conf }) => ({ mill: '/[file:mill]/conf/def.js', ...conf }),
          all: ConfyVal({ settle: 'str' })
        });
        
        let confyEnv = confyRoot.kids.environment = ConfySet();
        let confyGlb = confyRoot.kids.global = ConfySet();
        let confyDep = confyRoot.kids.deploy = ConfyNullable(ConfySet({ all: ConfySet() }));
        
        confyGlb.kids.subcon = onto(ConfySet({
          headOp: ({ chain, conf, getValue }) => {
            let isRootSc = /^root[.]global[.]subcon$/.test(chain.join('.'));
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
        confyGlb.kids.bearing = ConfyVal({ settle: 'str', def: 'above', fn: bearing => {
          if (![ 'above', 'below', 'between' ].has(bearing)) throw Error('requires value from enum: [ "above", "below", "between" ]');
          return bearing;
        }});
        confyGlb.kids.maturity = ConfyVal({ settle: 'str', def: 'alpha', fn: maturity => {
          if (![ 'dev', 'beta', 'alpha' ].has(maturity)) throw Error('requires value from enum: [ "dev", "beta", "alpha" ]');
          return maturity;
        }});
        confyGlb.kids.features = ConfySet({
          kids: {
            wrapBelowCode: ConfyVal({ settle: 'bln', def: false }),
            loadtest: ConfyVal({ settle: 'bln', def: false }),
          },
          all: ConfyVal({ fn: feature => {
            if (![ Boolean, Number, String ].any(F => isForm(feature, F)))
              throw Error(`doesn't allow value of type "${getFormName(feature)}"`);
            return feature;
          }})
        });
        confyGlb.kids.therapy = ConfyNullable(ConfySet());
        
        // Environment values include:
        // - "device": metadata about this device running Hut
        // - "shell": info related to executing shell utilities
        // - "dnsNetAddrs": hosts to use for resolving dns queries
        confyEnv.kids.device = ConfySet({ kids: {
          platform: ConfyVal({ settle: 'str', def: () => require('os').platform() }),
          operatingSystem: ConfyVal({ settle: 'str', def: () => require('os').version() }),
          numCpus: ConfyVal({ settle: 'num', def: () => require('os').cpus().length })
        }});
        confyEnv.kids.shell = ConfySet({ kids: {
          openssl: ConfyVal({ settle: 'str', def: 'openssl' })
        }});
        confyEnv.kids.dnsNetAddrs = ConfyVal({ settle: 'arr', def: '1.1.1.1+1.0.0.1', fn: dnsNetAddrs => {
          
          if (dnsNetAddrs.length < 2) throw Error('requires minimum 2 dns values');
          for (let na of dnsNetAddrs)
            if (!ipRegex.test(na))
              throw Error(`requires valid network addresses; got "${na}"`);
          return dnsNetAddrs;
          
        }});
        
        // Deploy values include:
        // - "host": hosting info for this deployment
        let confyDepKids = confyDep.confy.all.kids;
        confyDepKids.uid = ConfyVal({ settle: 'str', def: () => Math.random().toString(36).slice(2, 8), fn: uid => {
          if (!/^[a-zA-Z0-9]+$/.test(uid)) throw Error('requires alphanumeric string').mod({ value: uid });
          return uid;
        }});
        confyDepKids.host = ConfySet({ kids: {
          netIden: ConfySet({ kids: {
            name: ConfyVal({ settle: 'str', fn: (name, chain) => {
              if (!/^[a-z][a-zA-Z]*$/.test(name)) throw Error(`requires a String of alphabetic characters beginning with a lowercase character`);
              return name;
            }}),
            keep: ConfyVal({ settle: 'str', def: null }),
            secureBits: ConfyVal({ settle: 'num', fn: (bits, chain) => {
              if (!bits.isInteger()) throw Error(`requires an integer`);
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
                  let pcs = geo.split('.');
                  while (pcs.length < 6) pcs.push('?');
                  return pcs.slice(0, 6).join('.');
                }}),
                org: ConfyVal({ settle: 'str', fn: org => {
                  let pcs = org.split('.');
                  while (pcs.length < 6) pcs.push('?');
                  return pcs.slice(0, 6).join('.');
                }}),
              },
              all: ConfyVal({ settle: 'str' }) // Arbitrary String values
            })
          }}),
          netAddr: ConfyVal({ settle: 'str', def: 'localhost', fn: async (netAddr, { getValue }) => {
            
            // 'localhost'
            // '127.0.0.1'
            // '211.122.42.7'
            // '!<auto>'
            
            if (netAddr === '!<auto>') {
              
              // Autodetect the best NetworkAddress to use for this machine
              
              let dnsNetAddrs = getValue('[abs].environment.dnsNetAddrs');
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
            
          }}),
          heartbeatMs: ConfyVal({ settle: 'num', def: 20 * 1000, fn: heartbeatMs => {
            if (!heartbeatMs.isInteger()) throw Error('requires an integer').mod({ value: heartbeatMs });
            if (heartbeatMs < 1000) throw Error('requires a heartbeat slower than 1hz').mod({ value: heartbeatMs });
            return heartbeatMs;
          }}),
          protocols: ConfySet({
            tailOp: ({ chain, conf: protocols }) => {
              
              if (isForm(protocols, Object) && protocols.empty())
                throw Error(`requires at least 1 protocol`);
              
              return protocols;
              
            },
            all: ConfySet({
              
              // The list of protocols may look like:
              // '+http:111<comp1,comp2>+ws:222<comp3,comp4>'
              // (note the leading "+" indicates to delimit using "+" before
              // delimiting using anything else - especially "," in this case)
              
              // A single protocol may look like:
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
              
              headOp: ({ conf: protocol }) => {
                
                if (isForm(protocol, String)) {
                  let match = protocol.match(protocolRegex);
                  if (match) {
                    let [ , name, port='!<def>', compression='!<def>' ] = match;
                    protocol = { name, port, compression };
                  }
                }
                
                return protocol;
                
              },
              kids: {
                name: ConfyVal({ settle: 'str' }),
                port: ConfyVal({ settle: 'num',
                  def: ({ conf, chain, getValue }) => {
                    
                    // [par]:             { name, port, compression }
                    // [par].[par]:       { 0: { name, port, compression }, 1: { name, port, compression }, ... }
                    // [par].[par].[par]: { netIden: { ... }, netAddr: '...', protocols: { 0: { name, port, compression }, ... } }
                    
                    let protocol = getValue('[rel].[par].name');
                    let secureBits = getValue('[rel].[par].[par].[par].netIden.secureBits');
                    let term = `${secureBits > 0 ? 'secure' : 'unsafe'} ${protocol}`;
                    
                    let def = Object.plain({
                      'secure http': 443,
                      'unsafe http': 80,
                      'secure ftp': 22,
                      'unsafe ftp': 21,
                      'secure ws': 443,
                      'unsafe ws': 80,
                    })[term];
                    if (!def) throw Error(`has no default port for "${term}"`);
                    
                    return def;
                    
                  },
                  fn: port => {
                    
                    if (!port.isInteger()) throw Error('requires an integer').mod({ value: port });
                    if (port <= 0) throw Error('requires a value >= 0').mod({ value: port });
                    return port;
                    
                  }
                }),
                compression: ConfyVal({ settle: 'arr', def: [], fn: compression => {
                  if (compression.some(v => !isForm(v, String))) throw Error('requires Array of Strings').mod({ value: compression });
                  return compression;
                }})
              }
              
            })
          }),
        }});
        confyDepKids.loft = ConfySet({
          headOp: ({ conf }) => {
            if (isForm(conf, String)) {
              let [ prefix, name ] = conf.cut('.');
              conf = { prefix, name };
            }
            return conf;
          },
          kids: {
            prefix: ConfyVal({ settle: 'str',
              def: ({ getValue }) => getValue('[rel].[par].name').slice(0, 2),
              fn: pfx => {
                if (!/^[a-z][a-z0-9]{0,4}$/.test(pfx)) throw Error('requires lowercase alphanumeric string beginning with alphabetic character and max 5 chars');
                return pfx;
              }
            }),
            name: ConfyVal({ settle: 'str', fn: name => {
              if (!/^[a-z][a-zA-Z0-9.]*$/.test(name)) throw Error('requires alphanumeric string beginning with lowercase alphabetic character');
              return name;
            }})
          }
        });
        confyDepKids.keep = ConfyVal({ settle: 'str', def: null, fn: (keep, { getValue }) => {
          if (keep === '!<auto>') {
            let uid = getValue('[rel].[par].uid');
            let loft = getValue('[rel].[par].loft');
            keep = `/[file:mill]/bank/${uid}.${loft.prefix}.${loft.name}`;
          }
          return keep;
        }});
        
        // Apply the "uid", "host", and "keep" Deploy kids for Therapy
        Object.assign(confyGlb.kids.therapy.confy.kids, { ...confyDepKids }.slice([ 'uid', 'host', 'keep' ]));
        
        return confyRoot;
        
      })();
      
      let churn = async actions => {
        
        let remaining;
        if (isForm(actions, Object)) remaining = { ...actions };
        if (isForm(actions, Array)) remaining = actions.toObj((v, i) => [ i, v ]);
        if (!remaining) throw Error('Api: "actions" must resolve to Object/Array');
        
        let values = {};
        while (!remaining.empty()) {
          
          let errs = [];
          let progress = false;
          let furtherActions = {};
          
          for (let [ k, fn ] of remaining) {
            
            let actionResult; /* { result, actions: { ... } }*/
            try { actionResult = await fn(values); } catch (err) {
              if (!isForm(err, Error)) throw err;
              errs.push(err);
              continue;
            }
            
            if (!isForm(actionResult, Object)) throw Error('woAWwowowwaa poorly implemented churn function...').mod({ actionResult, fn: fn.toString() });
            
            progress = true;
            values[k] = actionResult.result;
            delete remaining[k];
            
            if (actionResult.has('actions')) {
              /// {DEBUG=
              if (!isForm(actionResult.actions, Object)) throw Error('OOofofowwwwsoasaoo poorly implemented churn function...').mod({ actionResult, fn: fn.toString() });
              /// =DEBUG}
              Object.assign(furtherActions, actionResult.actions);
            }
            
          }
          
          if (!progress) {
            throw Error('Api: unable to make progress on churn').mod({
              remaining,
              cause: errs,
              partiallyChurnedValues: values
            });
          }
          Object.assign(remaining, furtherActions);
          
        }
        
        return values;
        
      };
      
      let extendConf = async (cf, { tolerateErrors=false }) => {
        
        // Modifies `globalConf` in-place
        
        try {
          
          globalConf.merge(cf.diveKeysResolved());
          let values = await churn({ root: confyRoot.getAction(globalConf, [ 'root' ]) });
          globalConf = values.diveKeysResolved().root;
          
        } catch (err) {
          
          if (!/unable to make progress on churn/.test(err.message)) throw err.mod(msg => `Unexpected error while churning: ${msg}`);
          globalConf = err.partiallyChurnedValues.diveKeysResolved().root;
          if (!tolerateErrors) throw err;
          
        }
        
      };
      
      // Add on the UserConf...
      await extendConf(rawConf, { tolerateErrors: true });
      let { confKeeps: rawConfKeeps={} } = globalConf;
      
      // Add on any KeepConf if specified by UserConf and defaults...
      if (!rawConfKeeps.empty()) {
        
        let confKeeps = await Promise.all(rawConfKeeps.map(async (confKeepDiveToken, term) => {
          
          let confKeep = global.keep(confKeepDiveToken);
          
          let content = null;
          try {
            content = await confKeep.getContent('utf8');
            content = content.replace(/[;\s]+$/, ''); // Remove tailing whitespace and semicolons
            return await eval(`(${content})`);
          } catch (err) {
            err.propagate(msg => ({ msg: `Failed reading config from Keep: ${msg}`, term, confKeep: confKeep.desc(), content }));
          }
          
        }));
        
        // Apply all KeepConfs (don't parallelize - apply them in order!)
        for (let [ confKeepKey, confKeep ] of confKeeps) await extendConf(confKeep, { tolerateErrors: true });
        
      }
      
      // Finally merge the UserConf again (it outprioritizes KeepConf)
      try { await extendConf(rawConf, { tolerateErrors: false }); } catch (err) {
        if (!/unable to make progress on churn/.test(err.message)) throw err.mod(msg => `Unexpected error while churning: ${msg}`);
        throw Error('Api: foundation rejection').mod({
          cause: err,
          feedback: [ 'Invalid configuration:', ...err.cause.map(err => `- ${err.message}`) ].join('\n')
        });
      }
      
    };
    let resolveSubconOutput = async () => {
      
      // Call this function once `global.conf` is available to:
      // - have `global.subconParams` actually read from the Conf
      // - have `global.subconOutput` perform real output
      
      let vertDashChars = '166,124,33,9597,9599,9551,9483,8286,8992,8993,10650'.split(',').map(v => parseInt(v, 10).char());
      let horzDashChars = '126,8212,9548,9148,9477'.split(',').map(v => parseInt(v, 10).char());
      let junctionChars = '43,247,5824,9532,9547,9535,10775,10765,9533,9069,9178,11085'.split(',').map(v => parseInt(v, 10).char());
      let vertDash = () => vertDashChars[Math.floor(Math.random() * vertDashChars.length)];
      let horzDash = () => horzDashChars[Math.floor(Math.random() * horzDashChars.length)];
      let junction = () => junctionChars[Math.floor(Math.random() * junctionChars.length)];
      
      // The index in the stack trace which is the callsite that invoked
      // the subcon call (gets overwritten later when therapy requires
      // calling subcons from deeper stack depths)
      let { buffered } = global.subconOutput;
      global.subcon.relevantTraceIndex = 2;
      global.subconOutput = (sc, ...args) => { // Stdout; check "chatter" then format and output
        
        /// {DEBUG=
        let trace = Error('trace').getInfo().trace;
        /// =DEBUG}
        
        thenAll(args.map(arg => isForm(arg, Function) ? arg(sc) : arg), args => {
          
          let { chatter=true, therapy=false, format } = sc.params();
          
          // Forced output for select subcons
          if (!chatter && ![ 'gsc', 'warning' ].has(sc.term)) return;
          
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
          call = call?.file && `${token.dive(call.file).at(-1)} ${call.row}:${call.col}`;
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
      
    };
    
    await resolveConf()
      .then(async () => {
        
        let t = getMs();
        
        // Grab a reference the buffered logs written before we configured
        let { buffered } = global.subconOutput;
        
        // Resolve subcon output; this makes `global.subconOutput` work!
        await resolveSubconOutput();
        
        // Now output any logs buffered before we were ready
        for (let args of buffered) global.subconOutput(...args);
        
        setupSc(`Configuration processed after ${(getMs() - t).toFixed(2)}ms`, global.conf([]));
        
      })
      .fail(async err => {
        
        // Either an expected config-related refusal (nice output) or
        // unexpected error (panic output); either way immediately exit
        // after showing the output
        
        if (err.message === 'Api: foundation rejection') {
          
          await resolveSubconOutput();
          gsc(err.feedback);
          
        } else {
          
          let { buffered } = global.subconOutput;
          global.subconOutput.buffered = null;
          global.subconOutput = (sc, ...args) => console.log('\n' + [ // Panic output
            `SUBCON: "${sc.term}"`,
            ...args.map(a => {
              if (isForm(a, Function)) a = a();
              if (!isForm(a, String)) a = util.inspect(a, { colors: false, depth: 7 });
              return a;
            })
          ].join('\n').indent('[panic] '));
          
          global.subconOutput(gsc, 'Error during initialization; panic! Dumping logs...');
          for (let args of buffered) global.subconOutput(...args);
          
          global.subconOutput(gsc, err);
          
        }
        
        return process.exitNow(1);
        
      });
    
  };
  
  { // Enable `global.(getCompiledKeep|mapCmpToSrc|getRooms)`
    
    let srcKeep = keep('[file:code:src]');
    let cmpKeep = keep('[file:code:cmp]');
    let loadedRooms = Map();
    
    // Note these "default features" should only define features which
    // are always synced up regardless of the bearing; Hut by default
    // expects to run at multiple bearings, so there are no "default"
    // values for bearing-specific features! (They should always be
    // passed when calling `getCompiledCode` from a particular context!)
    let defaultFeatures = {
      debug:  conf('global.maturity') === 'dev',
      assert: conf('global.maturity') === 'dev',
      ...conf('global.features')
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
      
      let cmpKeep = keep([ 'file:code:cmp', bearing, ...roomDive, `${roomDive.at(-1)}.js` ]);
      if (await cmpKeep.exists()) return cmpKeep;
      
      let srcKeep = keep([ 'file:code:src', ...roomDive, `${roomDive.at(-1)}.js` ]);
      let { lines, offsets } = await getCompiledCode(srcKeep, {
        above: [ 'above', 'between' ].has(bearing),
        below: [ 'below', 'between' ].has(bearing)
      });
      
      if (!lines.count()) {
        await cmpKeep.setContent(`'use strict';`); // Write something to avoid recompiling later
        return cmpKeep;
      }
      
      // Embed `offsets` within `lines` for BELOW or setup
      if (conf('global.maturity') === 'dev' && [ 'below', 'setup' ].has(bearing)) {
        
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
      
      if (conf('global.features.wrapBelowCode') ?? false) {
        
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
      let roomPcLast = roomPcs.at(-1);
      return {
        file: srcKeep.fp.kid([ roomPcs, roomPcLast + '.js' ]).desc(),
        row: srcRow,
        col: srcCol,
        context
      };
      
    };
    global.getRooms = (names, { shorten=true }={}) => {
      
      let bearing = conf('global.bearing');
      let err = Error('trace');
      return thenAll(names.toObj(name => {
        
        let room = loadedRooms.get(name);
        if (!room) loadedRooms.add(name, room = (async () => {
          
          try {
            
            let namePcs = name.split('.');
            let roomSrcKeep = srcKeep.access([ ...namePcs, `${namePcs.at(-1)}.js` ]);
            
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
        
        return [ shorten ? name.split('.').at(-1) : name, room ];
        
      }));
      
    };
    
  };
  
  { // Run tests
    let t = getMs();
    await require('./test.js')();
    subcon('setup.test')(`Tests completed after ${(getMs() - t).toFixed(2)}ms`);
  };
  
  { // Enable `global.real`
    
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
    let fakeReal = global.real = FakeReal({ name: 'nodejs.fakeReal', tech: {
      render: Function.stub,
      informNavigation: Function.stub,
      getLayoutForm: name => fakeLayout,
      getLayoutForms: names => names.toObj(name => [ name, fakeReal.getLayoutForm(name) ]),
      render: Function.stub
    }});
    
  };
  
  { // RUN DAT
    
    let activateTmp = Tmp();
    process.on('exit', (...args) => activateTmp.end());
    
    // Clear data from previous runs
    await Promise.all([
    
      // Previous compiled code
      keep('[file:code:cmp]').rem(),
      
      // Previous loadtest data
      keep('[file:mill].loadtest').rem()
      
    ]);
    
    let runDeploy = async deployConf => {
      
      let { uid, host, loft: loftConf, keep } = deployConf;
      let { netIden: netIdenConf, netAddr, heartbeatMs, protocols } = host;
      let { hut, record, WeakBank=null, KeepBank=null } = await global.getRooms([
        'setup.hut',
        'record',
        `record.bank.${keep ? 'KeepBank' : 'WeakBank'}`
      ]);
      
      let netIden = NetworkIdentity(netIdenConf);
      let secure = netIden.secureBits > 0;
      
      // Subcon for Deployment depends on whether it's Therapy
      let deploySc = loftConf.name === 'therapy' ? global.subconStub : global.subcon([]);
      
      // Initialize a Bank based on `keep`
      let bank = keep
        ? KeepBank({ sc: deploySc.kid('bank'), keep: global.keep(keep) })
        : WeakBank({ sc: deploySc.kid('bank') });
      
      // Get an AboveHut with the appropriate config
      let recMan = record.Manager({ bank, sc: deploySc.kid('manager') });
      let aboveHut = hut.AboveHut({ hid: uid, isHere: true, recMan, heartbeatMs, deployConf });
      activateTmp.endWith(aboveHut);
      
      // Server management...
      let servers = await Promise.all(protocols.toArr(async protocolOpts => {
        
        let { name: protocol, port, compression, ...opts } = protocolOpts;
        
        let roadAuthorityPrm = Object.plain({
          http: () => require('./server/http.js').then(v => v.HttpRoadAuthority),
          sokt: () => require('./server/sokt.js').then(v => v.SoktRoadAuthority),
          ws:   () => require('./server/sokt.js').then(v => v.SoktRoadAuthority)
        })[protocol]?.() ?? Error(`Unfamiliar protocol: ${protocol}`).propagate();
        
        let RoadAuthority = await roadAuthorityPrm;
        
        return RoadAuthority({
          secure, netProc: `${netAddr}:${port}`, compression,
          aboveHut,
          sc: global.subcon(`road.${protocol}.raw`),
          ...opts
        });
        
      }));
      
      // TODO: Drift! loadtest's server must inherit from RoadAuthority
      let loadtest = null;
      if (loftConf.name === 'therapy') {
        
        let subconWriteStdout = global.subconOutput;
        
        // We know the uid of the root Therapy Record; this means if it
        // already exists we'll get a reference to it!
        let therapyPrefix = loftConf.prefix;
        let therapyRec = recMan.addRecord({
          uid: '!root',
          type: `${therapyPrefix}.therapy`,
          value: { ms: getMs() }
        });
        
        // Associate the Loft with the Therapy rec as soon as possible
        let loftRh = aboveHut.relHandler({ type: 'th.loft', term: 'hut', limit: 1 });
        activateTmp.endWith(loftRh);
        loftRh.route(loftHrec => {
          
          recMan.addRecord({
            uid: '!loftTherapy',
            type: `${therapyPrefix}.loftTherapy`,
            group: [ loftHrec.rec, therapyRec ],
            value: { ms: getMs() }
          });
          
        });
        
        global.subconOutput = (sc, ...args) => { // Stdout enhanced with therapy output
          
          args = args.map(arg => isForm(arg, Function) ? arg(sc) : arg);
          
          let { therapy=false } = sc.params();
          if (therapy) (async () => {
            
            // TODO: It's important that nothing occurring within this
            // function performs any therapy subcon... otherwise LOOP!
            // Best way is probably to pass stub functions in place of
            // loggers for every utility used by Therapy!
            
            try {
              
              // TODO: What exactly are the pre-existing constraints on
              // `uid` values? KeepBank will stick uids into filenames
              // so it's important to be certain
              let ms = getMs();
              let streamUid = `!stream@${sc.term.replace(/[.]/g, '@')}`;
              let streamRec = await recMan.addRecord({
                uid: streamUid,
                type: `${therapyPrefix}.stream`,
                group: [ therapyRec ],
                value: { ms, term: sc.term }
              });
              let notionRec = await recMan.addRecord({
                type: `${therapyPrefix}.notion`,
                group: [ streamRec ],
                value: { ms, args }
              });
              
            } catch (err) {
              
              // TODO: How to deal with the error? Just want to log it
              // with subcon, but if the error applies to all therapy
              // logs then the log related to the error could also fail,
              // leading to a nasty loop; the hack for now is to use a
              // new instance of the "warning" subcon, and to overwrite
              // its "cachedParams" (which should be a private property)
              // with params disabling therapy - this is brittle; it
              // breaks if:
              // - `global.subcon` is refactored so it can return
              //   references to pre-existing subcons
              // - therapy subcon uses `global.subconParams(sc)` rather
              //   than `sc.params()` to access params
              // - maybe other ways too??
              
              let errSc = global.subcon('warning');
              errSc.cachedParams = { ...errSc.params(), therapy: false };
              
              errSc(err.mod(msg => `Error recording therapy: ${msg}`), ...args);
              
            }
            
          })();
          
          subconWriteStdout(sc, ...args);
          
        };
        
        // Now stack depth for subcon invocations has gotten deeper!
        global.subcon.relevantTraceIndex += 1;
        
      } else if (conf('global.features.loadtest')) {
        
        // Note loadtesting cannot apply to the "therapy" deployment!
        
        loadtest = await require('./loadtest/loadtest.js')({
          aboveHut,
          netIden,
          instancesKeep: global.keep('[file:mill].loadtest'),
          getServerSessionKey: getSessionKey,
          sc: global.subcon('loadtest')
        });
        servers.push(loadtest.server);
        
      }
      
      // Each server gets managed by the NetworkIdentity, and is routed
      // so that Sessions are put in contact with the Hut
      for (let server of servers) netIden.addServer(server);
      
      activateTmp.endWith(await netIden.runOnNetwork());
      
      let loft = await getRoom(loftConf.name);
      let loftTmp = await loft.open({
        sc: deploySc.kid(`loft.${loftConf.prefix}`),
        hereHut: aboveHut,
        netIden
      });
      activateTmp.endWith(loftTmp);
      
      // Run load-testing if configured
      if (loadtest) activateTmp.endWith(loadtest.run());
      
    };
    
    // Run all Deploys, including the TherapyDeploy
    let therapyConf = conf('global.therapy');
    let deployConfs = [];
    if (therapyConf) deployConfs.push({
      uid: 'therapy',
      host: null,
      loft: { prefix: 'th', name: 'therapy' },
      keep: null,
      ...therapyConf,
    });
    deployConfs.push(...(global.conf('deploy') ?? {}).toArr(v => v));
    
    await Promise.all(deployConfs.map(runDeploy));
    
  };
  
};

// TODO: Only need to assign the regex props so that tests can reference
// and test them - should instead avoid exporting these props; rather
// trigger their effects in tests (e.g. test compiling a variety of
// sources) and verify if the results are expected 
Object.assign(module.exports, { captureLineCommentRegex, captureInlineBlockCommentRegex });
