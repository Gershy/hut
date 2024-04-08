'use strict';

let confyRoot = (() => {
  
  let { ConfySet, ConfyVal, ConfyNullable } = require('./confy.js');
  
  // TODO: This misses semantics; e.g. "999.999.000.900"
  let ipRegex = Regex.readable(String.baseline(`
    | ^
    |  [0-9]{1,3}
    |            (?:             ){3}
    |               [.][0-9]{1,3}
    |                                $
  `));
  let protocolRegex = Regex.readable(String.baseline(`
    | ^                                             $
    | ^([a-zA-Z]*)                                  $
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
        throw Error(`forbids value of type "${getFormName(feature)}"`);
      return feature;
    }})
  });
  confyGlb.kids.therapy = ConfyNullable(ConfySet());
  
  confyGlb.kids.terminal = ConfySet({ kids: {
    width: ConfyVal({ settle: 'num', def: () => 140 })
  }});
  
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
        if (!bits.isInteger()) throw Error('requires an integer');
        if (bits < 0) throw Error('requires a value >= 0');
        return bits;
      }}),
      email: ConfyVal({ settle: 'str', fn: email => {
        email = email.trim();
        if (!/^[^@]+[@][^.]+[.][^.]/.test(email)) throw Error('must be a valid email');
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
      // 'mysite.com'
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
          if (ip.count() !== 4 || ip.seek(v => !isForm(v, Number)).found) return skip;
          
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
      
      if (!isForm(netAddr, String))                                throw Error(`requires String; got ${getFormName(netAddr)}`).mod({ netAddr });
      if (netAddr !== 'localhost' && !netAddr.test(/[^.][.][^.]/)) throw Error(`received invalid-looking value`).mod({ netAddr });
      
      return netAddr;
      
    }}),
    heartbeatMs: ConfyVal({ settle: 'num', def: 20 * 1000, fn: heartbeatMs => {
      if (!heartbeatMs.isInteger()) throw Error('requires an integer').mod({ value: heartbeatMs });
      if (heartbeatMs < 1000) throw Error('requires a heartbeat slower than 1hz').mod({ value: heartbeatMs });
      return heartbeatMs;
    }}),
    protocols: ConfySet({
      headOp: ({ conf: protocols }) => {
        
        // Compact Strings representing the set of protocols can have nested sets, using "<"
        // and ">" characters to define the nesting, e.g.:
        //    | protocols === "http:80<gzip+deflate>,ws:80<bzip>"
        // This means that unlike a typical ConfySet, the "protocols" ConfySet needs to avoid
        // splitting on delimiters contained in angle braces
        
        if (isForm(protocols, String)) {
          
          let str = protocols;
          let arr = [];
          while (str.length) {
            
            // Find the next "<" or delimiter
            let nextChunkMatch = str.match(/[,+]|[<][^>]*[>]/);
            if (!nextChunkMatch) { arr.push(str); break; } // Consume whole rest of `str` into the final item
            
            let chunk = nextChunkMatch[0];
            if (chunk[0] === '<') {
              let consumed = str.slice(0, nextChunkMatch.index) + chunk;
              arr.push(consumed);
              str = str.slice(consumed.length);
              if (/^[,+]/.test(str)) str = str.slice(1); // Delimiters may trail the ">" char
            } else {
              arr.push(str.slice(0, nextChunkMatch.index));
              str = str.slice(nextChunkMatch.index + 1);
            }
            
          }
          
          return arr.map(v => v.trim() ?? skip);
          
        }
        
        return protocols;
        
      },
      tailOp: ({ chain, conf: protocols }) => {
        
        if (isForm(protocols, Object) && protocols.empty())
          throw Error('requires at least 1 protocol');
        
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
              if (name === 'ws') name = 'sokt';
              if (name === 'websocket') name = 'sokt';
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
                
                'secure http':  443,
                'unsafe http':   80,
                
                'secure ftp':    22,
                'unsafe ftp':    21,
                
                'secure sokt':  443,
                'unsafe sokt':   80,
                
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
          if (!/^[a-z][a-z0-9]{0,8}$/.test(pfx)) throw Error('requires lowercase alphanumeric string beginning with alpha character and max 8 chars');
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

module.exports = async ({ rootKeep, rawConf, confUpdateCb=Function.stub }) => {
  
  let churn = require('./churn.js');
  
  let mutableConf = {};
  let extendConf = async (cf, { tolerateErrors=false }) => {
    
    // Modifies `mutableConf` in-place
    
    try {
      
      confUpdateCb(mutableConf.merge(cf.diveKeysResolved()));
      let values = await churn({ root: confyRoot.getAction(mutableConf, [ 'root' ]) });
      confUpdateCb(mutableConf = values.diveKeysResolved().root);
      
    } catch (err) {
      
      if (!err.partiallyChurnedValues) throw err.mod(msg => `Unexpected error while churning: ${msg}`);
      confUpdateCb(mutableConf = err.partiallyChurnedValues.diveKeysResolved().root);
      if (!tolerateErrors) throw err;
      
    }
    
  };
  
  // Add on the initial conf (provided by user; typically based on command-line args)
  await extendConf(rawConf, { tolerateErrors: true });
  let { confKeeps: rawConfKeeps={} } = mutableConf;
  
  // The first attempt to resolve may populate a `confKeeps` value; process any additional conf
  // found in these keeps...
  if (!rawConfKeeps.empty()) {
    
    let confKeeps = await Promise.all(rawConfKeeps.map(async (confKeepDiveToken, term) => {
      
      let confKeep = rootKeep.seek(token.dive(confKeepDiveToken));
      
      let content = null;
      try {
        content = await confKeep.getContent('utf8');
        content = content.replace(/[;\s]+$/, ''); // Remove tailing whitespace and semicolons
        return await eval(`(${content})`);
      } catch (err) {
        err.propagate(msg => ({ msg: `Failed reading config from Keep: ${msg}`, term, confKeep: confKeep.desc(), content }));
      }
      
    }));
    
    // Apply all KeepConfs (don't parallelize - apply them in their defined order!)
    for (let [ , confKeep ] of confKeeps) await extendConf(confKeep, { tolerateErrors: true });
    
  }
  
  // Finally merge the UserConf again (it outprioritizes KeepConf); this final application is the
  // only one which cannot tolerate errors; all churns are expected to complete as all possible
  // data is now available to the churning logic
  try { await extendConf(rawConf, { tolerateErrors: false }); } catch (err) {
    if (!err.partiallyChurnedValues) throw err.mod(msg => `Unexpected error while churning: ${msg}`);
    throw Error('Api: foundation rejection').mod({
      cause: err,
      feedback: [ 'Invalid configuration:', ...err.cause.map(err => `- ${err.message}`) ].join('\n')
    });
  }
  
  return mutableConf;
  
};