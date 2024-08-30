'use strict';

require('../room/setup/clearing/clearing.js');

let nodejs = [ 'fs', 'path' ].toObj(v => [ v, require(`node:${v}`) ]);

module.exports = form({ name: 'NetworkIdentity', props: (forms, Form) => ({
  
  $crtProviders: Object.plain({
    
    letsEncryptStaging: {
      directory: 'https://acme-staging-v02.api.letsencrypt.org/directory'
    },
    letsEncrypt: {
      directory: 'https://acme-v02.api.letsencrypt.org/directory'
    }
    
  }),
  
  $tmpFp: () => nodejs.path.join(require('os').tmpdir(), String.id(10)),
  $setFp: (...args /* fp, data */) => {
    let [ fp, data=null ] = (args.length === 2) ? args : [ Form.tmpFp(), args[0] ];
    return nodejs.fs.promises.writeFile(fp, data).then(() => fp);
  },
  $remFp: (fp) => nodejs.fs.promises.unlink(fp),
  $defaultDetails: Object.plain({
    
    // Geographic hierarchical identifiers (and shortforms)
    geo0: 'earth', // planet
    geo1: '',      // continent/tectonic plate/hemisphere
    geo2: '',      // country
    geo3: '',      // state/province (same as country for city-state)
    geo4: '',      // city
    geo5: '',      // neighbourhood
    geoShort0: '',
    geoShort1: '',
    geoShort2: '',
    geoShort3: '',
    geoShort4: '',
    geoShort5: '',
    
    // Organization hierarchical identifiers
    org0: '', // organization name
    org1: '', // subdivision
    org2: '', // subdivision
    org3: '', // subdivision
    org4: '', // subdivision
    org5: '', // subdivision
    
    email: '',
    password: ''
    
  }),
  $validateDetails: (...details) => {
    
    // Check if given addresses valid??
    // https://www.rfc-editor.org/rfc/rfc5280#section-7
    
    details = Object.assign({}, Form.defaultDetails, ...details);
    
    if (details.has('geo')) {
      let vals = details.geo.split('.');
      if (vals.length > 6) throw Error('Should have max 6 "geo" components');
      Object.assign(details, vals.toObj((v, i) => [ `geo${i}`, v.trim() || '' ]));
    }
    if (details.has('org')) {
      let vals = details.org.split('.');
      if (vals.length > 6) throw Error('Should have max 6 "org" components');
      Object.assign(details, vals.toObj((v, i) => [ `org${i}`, v.trim() || '' ]));
    }
    
    // Default "geoShortN" props from corresponding "geoN" props
    for (let n of 6)
      if (!details[`geoShort${n}`] && details[`geo${n}`])
        details[`geoShort${n}`] = details[`geo${n}`].slice(0, 2);
    
    for (let n of 6) if (details[`geoShort${n}`].length > 2) throw Error(`Short geo names must be max 2 chars (got "${details['geoShort' + n]}")`);
    
    return details.map((v, k) => (k in Form.defaultDetails) ? v : skip);
    
  },
  $simplifyDetails: details => {
    let { geo0, geo1, geo2, geo3, geo4, geo5 } = details;
    let { org0, org1, org2, org3, org4, org5 } = details;
    let { email, password } = details;
    return {
      geo: [ geo0, geo1, geo2, geo3, geo4, geo5 ].map(v => v ?? skip).join('.'),
      org: [ org0, org1, org2, org3, org4, org5 ].map(v => v ?? skip).join('.'),
      email, password
    };
  },
  $parseIndented: str => {
    
    let parse = (container, lns) => {
      
      while (lns.length) {
        
        let [ subject, ...remainingLns ] = lns;
        lns = remainingLns;
        
        if (/^\s+/.test(subject)) throw Error(`Inner lines started with whitespace ("${subject}")`).mod({ lns });
        
        let kid = container.kids.add({ subject, kids: [] });
        if (lns.empty()) break;
        
        let [ wsPfx='' ] = lns[0].match(/^\s+/) || [];
        let hasNestedChildren = wsPfx.length > 0;
        
        if (!hasNestedChildren) continue; // If the following line has no whitespace we consumed a singleton (with no child elements)
        
        // Find the 1st index that isn't indented by at least `wsPfx`
        // Note that `ind` can't be 0 because `lns[0]` certainly starts
        // with `wsPfx` - so the only falsy `find(...).ind` value could
        // be `null`, indicating that every single remaining line began
        // with the prefix; in this case every remaining line is added
        // under the current `subject`!
        let ind = lns.seek(ln => !ln.hasHead(wsPfx)).ind || lns.length;
        
        let kidLns = lns.slice(0, ind); // Includes everything up until (excluding) non-ws-prefixed line
        lns = lns.slice(ind);           // Includes non-ws-prefixed line and onwards
        
        parse(kid, kidLns.map(ln => ln.slice(wsPfx.length)));
        
      }
      return container;
      
    };
    let formatKey = key => {
      if (key.match(/^[a-z][a-zA-Z]+$/)) return key;
      return key.lower()
        .replace(/[ -:]+[a-z]/g, match => match.at(-1).upper()) // Camelcasing
        .replace(/[^a-zA-Z]+$/g, '');                           // Remove non-alpha suffix
    };
    let reformat = parsed => {
      
      if (parsed.kids.empty()) {
        // An item with no kids can still be an Object with one prop
        let [ key, val=null ] = parsed.subject.cut(': ');
        return val ? { [formatKey(key)]: val } : key;
      }
      
      let key = formatKey(parsed.subject);
      let kids = parsed.kids.map(kid => reformat(kid) || skip);
      
      if (kids.length === 1) return { [key]: kids[0] };
      
      if (kids.every(kid => isForm(kid, Object))) {
        
        let result = {};
        for (let kid of kids) for (let [ k, v ] of kid) {
          // Don't clobber existing properties - later colliding keys
          // have an integer directly appended to them
          let uniq = '';
          while (result.has(`${k}${uniq}`)) uniq = ((uniq === '') ? 0 : uniq + 1);
          result[`${k}${uniq}`] = v;
        }
        return { [key]: result };
        
      }
      if (kids.every(kid => isForm(kid, String))) return { [key]: kids.join('\n') };
      return { [key]: kids };
      
    };
    
    return reformat(parse({ subject: 'root', kids: [] }, str.split(/[\r\n]+/))).root;
    
  },
  
  // Note that for sensitive keys the given Keep should be removable
  // media (like a USB key) for physical isolation
  
  init({ name, details={}, keep=null, secureBits=2048, certificateType='selfSign', getSessionKey, sc, ...more }={}) {
    
    // TODO: For the same Keep, certain details are expected to remain
    // consistent across runs; it's probably worth storing the initial
    // details used in a Keep, and then checking those details on every
    // other run to make sure they're the same!
    
    /// {DEPRECATED=
    if (more.has('servers')) throw Error('Do not provide "servers"');
    /// =DEPRECATED}
    
    if ([ String, Array ].any(F => isForm(keep, F))) keep = global.keep(keep);
    
    if (secureBits && secureBits < 512) throw Error('Use at least 512 secure bits');
    if (!isForm(name, String) || !name) throw Error('Must provide "name"');
    if (keep && !keep.Form) throw Error(`"keep" must be a Keep (got ${getFormName(keep)})`);
    
    details = Form.validateDetails(details);
    
    let { osslShellName='openssl', requirePhysicalSafety=false } = more;
    let { redirectHttp80=true } = more;
    
    Object.assign(this, {
      
      name,
      
      // Detail configuration (note these are overridden by `keep`)
      details: {},
      
      osslShellName,
      osslShellVersion: null,
      
      // Persistence
      keep,
      
      // Security
      certificateType,
      secureBits,
      requirePhysicalSafety, // TODO: Consume this value!
      redirectHttp80,
      
      // Misc
      sc: sc.kid('netIden', { $: { name } }),
      
      // Servers managed under this NetworkIdentity
      servers: []
      
    });
    
    this.readyPrm = Promise.all([
      
      // Get ossl version and ensure it has an expected format; store it
      // if successful, otherwise produce error including fix details
      // Note we skip doing this if `secureBits` indicates no security
      this.secureBits && this.getOsslVersion()
        .then(osslShellVersion => {
          if (/^openssl /i.test(osslShellVersion)) return osslShellVersion;
          throw Error(`"${osslShellVersion}" doesn't look like an openssl version number`);
        })
        .then(osslShellVersion => Object.assign(this, { osslShellVersion }))
        .fail(err => err.propagate(msg => String.multiline(`
          Uh oh, it looks like the shell failed to execute this command:
          
          > ${this.osslShellName} version
          
          This is probably because "osslShellName" (with value "${this.osslShellName}") didn't resolve to an openssl binary in the shell...
          
          On windows you have the following option:
          - Download the openssl binary installer for your system here:
            https://slproweb.com/products/Win32OpenSSL.html
          - Install the openssl binary and note the install location; it may look like:
            C:\\Program Files\\OpenSSL-Win64\\bin
          - Instantiate the NetworkIdentity like so:
            let netIden = NetworkIdentity({ osslShellName: '"C:\\\\Program Files\\\\OpenSSL-Win64\\\\bin"' });
          
          Original error:
          (${msg.trim().indent('| ')})
        `))),
      
      // Resolve details
      this.retrieveOrCompute('details', 'json', () => details)
        .then(storedDetails => {
          
          let flatten = obj => obj.linearize().toObj(entry => entry);
          let detailsErr = err => err.mod(msg => String.baseline(`
            | NetworkIdentity details mismatch!
            | ${msg}
            | 
            | The details you provided don't match the details stored in the Keep:
            | ${this.keep.desc()}
            | 
            | Consider some options:
            | 1. Make sure you configure your NetworkIdentity using the same details as before
            | 2. Initialize your NetworkIdentity with a different Keep
            | 3. Delete the stored Keep (be careful not to lose any important stored info)
          `));
          
          let flatGiven = flatten(details);
          let flatStored = flatten(storedDetails);
          
          for (let [ chain ] of flatGiven)
            if (!flatStored.has(chain))
              throw detailsErr(Error(`Value "${chain}" was given, but isn't stored`)).mod({ chain });
          
          for (let [ chain ] of flatStored)
            if (!flatGiven.has(chain))
              throw detailsErr(Error(`Value "${chain}" is stored, but wasn't given`)).mod({ chain });
          
          for (let [ chain, stored ] of flatStored) {
            let given = flatGiven[chain];
            if (stored !== given) throw detailsErr(Error(`Value "${chain}" stored and given values mismatch`)).mod({ chain, stored, given });
          }
          
          Object.assign(this, { details: storedDetails });
          Object.assign(this, { simpleDetails: Form.simplifyDetails(this.details) });
          
        })
      
    ]);
    
    this.readyPrm.then(() => this.sc.kid('init')({
      msg: 'resolved details',
      ...{ ...this }.slice([ 'simpleDetails', 'keep', 'certificateType', 'secureBits' ])
    }));
    
  },
  desc() {
    
    let networkAddresses = this.getNetworkAddresses();
    let pcs = [];
    pcs.push(`"${this.name}"`);
    pcs.push(this.secureBits ? `secure/${this.secureBits}` : 'UNSAFE');
    pcs.push(networkAddresses.length ? `[ ${networkAddresses.map(v => `"${v}"`).join(', ')} ]` : '[]');
    return `${getFormName(this)}(${pcs.join('; ')})`;
    
  },
  
  getNetworkAddresses() { return Set(this.servers.map(server => server.getNetAddr())).toArr(v => v); },
  runInShell(args, opts={}) {
    
    if (hasForm(opts, Function)) opts = { onInput: opts };
    
    // Note that `timeoutMs` counts since the most recent chunk
    let { onInput=null, timeoutMs=2000 } = opts;
    
    let err = Error('');
    let shellName = null;
    let shellArgs = [];
    
    if (isForm(args, String)) {
      
      [ shellName, ...shellArgs ] = args.split(' ');
      
    } else if (isForm(args, Array)) {
      
      [ shellName, ...shellArgs ] = args;
      
    } else {
      
      throw Error(`No support for args of type ${getFormName(args)}`);
      
    }
    
    let rawShellStr = `${shellName} ${shellArgs.join(' ')}`;
    this.sc.kid('shell')({ shellCmd: rawShellStr }, ...(opts.scParams ? [ opts.scParams ] : []));
    
    let proc = require('child_process').spawn(shellName, shellArgs, {
      cwd: '/',
      env: {},
      windowsHide: true
    });
    
    // Allow an initial amount of input
    onInput && then(
      onInput('init', ''),
      result => (result != null) && proc.stdin.write(result + '\n')
    );
    
    let stdoutChunks = [];
    let stderrChunks = [];
    let lastChunk = null;
    let timeoutFn = () => {
      proc.kill();
      proc.emit('error', Error('Timeout').mod({ lastChunk: lastChunk && lastChunk.toString('utf8') }))
    };
    let timeout = setTimeout(timeoutFn, timeoutMs);
    
    let handleChunk = (type, chunks, data) => {
      
      lastChunk = data;
      
      // Reset timeout
      clearTimeout(timeout);
      timeout = setTimeout(timeoutFn, timeoutMs);
      
      chunks.push(data);
      
      if (!onInput) return;
      
      (async () => {
        
        for (let ln of data.toString('utf8').split(/[\r]?[\n]/)) {
          
          ln = ln.trimTail();
          if (!ln) continue;              // Always ignore whitespace-only lines??
          
          try {
            let result = await onInput(type, ln);
            if (result != null) proc.stdin.write(result + '\n');
          } catch (err) {
            proc.kill();
            proc.emit('error', err);
          }
          
        }
        
      })();
      
    };
    
    let stdoutFn = handleChunk.bound('out', stdoutChunks);
    let stderrFn = handleChunk.bound('out', stderrChunks);
    proc.stdout.on('data', stdoutFn);
    proc.stderr.on('data', stderrFn);
    
    let closure = () => {
      clearTimeout(timeout);
      onInput = null;
      proc.stdout.removeListener('data', stdoutFn);
      proc.stderr.removeListener('data', stderrFn);
      return {
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8')
      };
    };
    
    let prm = Promise((resolve, reject) => {
      
      proc.on('error', cause => {
        
        let { stdout, stderr } = closure();
        reject(err.mod( msg => ({ cause, msg: `Failed spawning "${shellName}"\n${msg}`, stdout, stderr }) ));
        
      });
      
      proc.on('close', code => {
        
        let { stdout, stderr } = closure();
        
        if (code === 0) return resolve(stdout.toString('utf8').trim());
        
        reject(err.mod({
          msg: `Proc "${rawShellStr}" failed (${code})`,
          code,
          stdout,
          stderr
        }));
        
      });
      
    });
    
    return Object.assign(prm, { proc, rawShellStr });
    
  },
  getOsslConfigFileContent(networkAddresses=this.getNetworkAddresses()) {
    
    // TODO: Where does `this.details.password` go??
    
    let [ commonName, ...altNames ] = networkAddresses;
    if (!commonName) throw Error('Supply at least 1 NetworkAddress')
    
    return String.baseline(`
      | #.pragma [=] abspath:true
      | #.pragma [=] dollarid:false
      | #.pragma [=] includedir:/
      | 
      | [req]
      | distinguished_name     = dn
      | prompt                 = no
      | days                   = 365
      | req_extensions         = reqExt
      | # x509_extensions        = x509Ext
      | 
      | [dn]
      | countryName            = ${this.details.geoShort2}
      | stateOrProvinceName    = ${this.details.geo3}
      | localityName           = ${this.details.geo4}
      | organizationName       = ${this.details.org0}
      | organizationalUnitName = ${this.details.org1}
      | commonName             = ${commonName}
      | emailAddress           = ${this.details.email}
      | 
      | # [x509Ext]
      | # subjectKeyIdentifier = hash
      | # authorityKeyIdentifier = keyid:always,issuer
      | # basicConstraints = critical, CA:true
      | # keyUsage = critical, digitalSignature
      | 
      | [reqExt]
      | basicConstraints       = CA:false
      | extendedKeyUsage       = serverAuth
    `) + ((altNames.length === 0) ? '' : String.baseline(`
      | subjectAltName         = @hostList
      | 
      | [hostList]
      ${altNames.map((domain, ind) => {
        return '| ' + ('DNS.' + ind.toString(10)).padTail(22, ' ') + ' = ' + domain;
      })}
    `));
    
  },
  async getOsslVersion() {
    return await this.runInShell(`${this.osslShellName} version`);
  },
  async getOsslPrv({ alg='rsa', bits=2048 }={}) {
    
    // "prv" = "private key"
    // Note that the private key embeds the public key! (Can extract the
    // pub via `this.getPub`)
    
    if (alg === 'rsa') {
      return this.runInShell(`${this.osslShellName} genrsa ${bits}`);
    } else {
      throw Error(`Algorithm "${alg}" not supported (try "rsa" instead?)`);
    }
    
  },
  async getOsslPub({ prv }={}) {
    
    if (!prv)                                     throw Error('Must supply "prv" to get pub!');
    if (![ String, Buffer ].has(prv.constructor)) throw Error(`"prv" must be String or Buffer (got ${getFormName(prv)})`);
    
    let prvFp = await Form.setFp(prv);
    
    try {
      
      return await this.runInShell(`${this.osslShellName} rsa -in ${prvFp} -pubout`, { scParams: {
        keeps: { [prvFp]: prv }
      }});
      
    } finally {
      
      Form.remFp(prvFp);
      
    }
    
  },
  async getOsslCsr({ prv, cfg=this.getOsslConfigFileContent() }={}) {
    
    // "csr" = "certificate signing request" (".csr" = ".req" = ".p10")
    // Represents a request to associate a public key with a "certified
    // term" ("common name"), and additional list of "alternate names";
    // note this is only a request to perform this association - some
    // certificate provider needs to fulfill the request in order for
    // any sense of "ownership" to be established
    
    if (!prv)                                     throw Error('Must supply "prv" to get csr!');
    if (![ String, Buffer ].has(prv.constructor)) throw Error(`"prv" must be String or Buffer (got ${getFormName(prv)})`);
    
    let [ prvFp, cfgFp ] = await Promise.all([ prv, cfg ].map(v => Form.setFp(v)));
    
    try {
      
      return await this.runInShell(`${this.osslShellName} req -new -key ${prvFp} -config ${cfgFp}`, { scParams: {
        keeps: { [prvFp]: prv, [cfgFp]: cfg }
      }});
      
    } finally {
      
      Form.remFp(prvFp);
      Form.remFp(cfgFp);
      
    }
    
  },
  async getOsslCrt({ prv, csr }={}) {
    
    // We consider `prv` to be the private key of a cert authority, and
    // we use that ca to sign the cert request `csr`
    
    if (!prv) throw Error('Must supply prv to get a crt!');
    if (!csr) throw Error('Must supply csr to get a crt!');
    
    let [ prvFp, csrFp ] = await Promise.all([ prv, csr ].map(v => Form.setFp(v)));
    
    try {
      
      return await this.runInShell(`${this.osslShellName} x509 -req -days 90 -in ${csrFp} -signkey ${prvFp}`, { scParams: {
        keeps: { [prvFp]: prv, [csrFp]: csr }
      }});
      
    } finally {
      
      Form.remFp(prvFp);
      Form.remFp(csrFp);
      
    }
    
  },
  async getOsslDetails({ csr, crt }) {
    
    if (csr && crt) throw Error('Provide only one of "csr" and "crt"!');
    
    let pemFp = await Form.setFp(csr || crt);
    
    try {
      
      let info = csr
        ? await this.runInShell(`${this.osslShellName} req -text -in ${pemFp} -noout`, { scParams: { keeps: { [pemFp]: csr || crt } } })
        : await this.runInShell(`${this.osslShellName} x509 -text -in ${pemFp} -noout`, { scParams: { keeps: { [pemFp]: csr || crt } } });
      
      let parsed = Form.parseIndented(info)[csr ? 'certificateRequest' : 'certificate'];
      
      let binary = bin => bin && Buffer.from( bin.replace(/[:\r\n]+/g, ''), 'hex' );
      let delimitedPairs = (d1, d2) => str => {
        return (str || '').split(d1).map(v => v.trim() || skip).toObj(pair => pair.split(d2).map(v => v.trim()));
      };
      let date = d => new Date(Date.parse(d));
      let replaceProp = (chain, fn) => {
        let ptr = parsed;
        for (let v of chain.slice(0, -1)) ptr = ptr?.[v];
        let valProp = chain.slice(-1)[0];
        if (ptr && isForm(ptr, Object)) ptr[valProp] = fn(ptr.has(valProp) ? ptr[valProp] : null);
      };
      replaceProp('data,subjectPublicKeyInfo,publicKeyAlgorithmRsaencryption,modulus'.split(','), binary)
      replaceProp('signatureValue'.split(','), binary);
      replaceProp('data,subject'.split(','), delimitedPairs(',', '='));
      replaceProp('data,subjectPublicKeyInfo,publicKeyAlgorithmRsaencryption,exponent'.split(','), exp => {
        return parseInt(exp.split(' ')[0], 10);
      });
      if (crt) replaceProp('data,issuer'.split(','), delimitedPairs(',', '='));
      if (crt) replaceProp('data,serialNumber'.split(','), binary);
      if (crt) replaceProp('data,validity,notBefore'.split(','), date);
      if (crt) replaceProp('data,validity,notAfter'.split(','), date);
      if (crt) replaceProp('signatureAlgorithmShaWithrsaencryption,validity,notBefore'.split(','), date);
      if (crt) replaceProp('signatureAlgorithmShaWithrsaencryption,validity,notAfter'.split(','), date);
      
      return parsed;
      
    } finally {
      
      Form.remFp(pemFp);
      
    }
    
  },
  
  async retrieveOrCompute(diveToken, encoding, fn) {
    
    if (!this.keep) return fn();
    
    let keep = this.keep.dive(diveToken);
    
    let val = await keep.getData(encoding);
    if (val) return val;
    
    val = await fn();
    await keep.setData(val, encoding);
    
    return val;
    
  },
  async getPrv() {
    
    if (!this.secureBits) return null;
    return this.retrieveOrCompute('prv', 'utf8', () => this.getOsslPrv({ alg: 'rsa', bits: this.secureBits }));
    
  },
  async getCsr() {
    return this.getOsslCsr({ prv: await this.getPrv() });
  },
  
  async getSgnInfo() {
    
    if (!this.secureBits) throw Error(`${this.desc()} is insecure - it can't work with crts!`);
    
    let getSgn = async () => {
      
      // A SGN includes everything needed to manage a server with  a certified identity; it's more
      // than just PRV + CSR + CRT as it includes some management functionality:
      //    | {
      //    |   prv, csr, crt,
      //    |   invalidate: () => { /* ... */ },
      //    |   validity: { msElapsed, msRemaining, expiryMs }
      //    | }
      
      let sc = this.sc.kid('sgn', { $: { sgn: String.id(4) } });
      
      sc({ msg: 'init acquiring sgn' });
      
      let sgn = null; // Will look like `{ prv, csr, crt, invalidate }`
      if      (this.certificateType === 'selfSign')   sgn = await this.getSgnSelfSigned({ sc });
      else if (this.certificateType.hasHead('acme/')) sgn = await this.getSgnAcme({ sc: sc.kid('acme') });
      else                                            throw Error(`Unknown crt acquisition method: "${this.certificateType}"`);
      
      sc({ msg: 'acquired sgn crt', crt: sgn.crt });
      
      let crtDetails = await this.getOsslDetails({ crt: sgn.crt });
      sc({ msg: 'acquired sgn crt details', crtDetails });
      
      let validity = null
        ?? crtDetails.data?.validity
        ?? crtDetails.signatureAlgorithmShaWithrsaencryption?.validity;
      if (!validity) throw Error(`Couldn't resolve "validity" from SGN`).mod({ crtDetails });
      
      let { notBefore, notAfter } = validity;
      
      let now = Date.now();
      let preemptMs = 6 * 60 * 60 * 1000; // Consider expired 6hrs before expiry, in order to allow timely renewal
      return Object.assign(sgn, { validity: {
        msElapsed: (now - notBefore.getTime()),
        msRemaining: (notAfter.getTime() - now) - preemptMs,
        expiryMs: notAfter.getTime() - preemptMs
      }});
      
    };
    
    let sgn = await getSgn();
    
    let refresh = sgn.validity.msElapsed < 0 || sgn.validity.msRemaining < 0;
    if (refresh) {
      
      // Invalidate cached crt
      await sgn.invalidate();
      sgn = await getSgn();
      
      /// {ASSERT=
      if (sgn.validity.msElapsed < 0) throw Error(`OWWWffff Recently generated sgn hasn't become active yet :'(`).mod({ sgn });
      if (sgn.validity.msRemaining < 0) throw Error(`OAAFOWWFFF Recently generated sgn is already expired :'O`).mod({ sgn });
      /// =ASSERT}
      
    }
    
    return { sgn, refresh };
    
  },
  async getSgnSelfSigned({ sc=this.sc.kid('getSgn') }={}) {
    
    sc({ msg: 'acquiring selfSign prv' });
    let prv = await this.retrieveOrCompute('selfSign.prv', 'utf8', () => {
      return this.getOsslPrv({ alg: 'rsa', bits: this.secureBits });
    });
    sc({ msg: 'acquired selfSign prv', prv });
    
    sc({ msg: 'acquiring selfSign csr cfg' });
    let cfg = this.getOsslConfigFileContent()
    sc({ msg: 'acquired selfSign csr cfg', cfg });
    
    
    sc({ msg: 'acquiring selfSign csr' });
    let csr = await this.retrieveOrCompute('selfSign.csr', 'utf8', () => {
      return this.getOsslCsr({ prv });
    });
    sc({ msg: 'acquired selfSign csr', csr });
    
    sc({ msg: 'acquiring selfSign crt' });
    let crt = await this.retrieveOrCompute('selfSign.crt', 'utf8', () => {
      return this.getOsslCrt({ prv, csr });
    });
    sc({ msg: 'acquired selfSign crt', crt });
    
    return { prv, csr, crt, invalidate: async () => {
      
      let now = Date.now();
      let bakKeep = this.keep.dive([ 'selfSign', 'bak', now.toString(10) ]);
      await Promise.all([
        bakKeep.dive('prv').setData(prv),
        bakKeep.dive('csr').setData(csr),
        bakKeep.dive('crt').setData(crt)
      ]);
      
      // Note this doesn't invalidate `prv`, which can safely be reused!
      await Promise.all([
        this.keep.dive([ 'selfSign', 'csr' ]).rem(),
        this.keep.dive([ 'selfSign', 'crt' ]).rem()
      ]);
      
    }};
    
  },
  async getSgnAcme({ sc=this.sc.kid('acme') }={}) {
    
    // Returns a certificate certifying this NetworkIdentity's ownership
    // of the NetworkAddresses listed in its details, potentially using
    // acme protocol to obtain such a certificate
    
    let [ acquireMethod, type ] = this.certificateType.split('/');
    if (acquireMethod !== 'acme') throw Error(`Not an acme method: "${this.certificateType}"`);
    
    await this.readyPrm;
    
    let provider = Form.crtProviders[type];
    if (!provider) throw Error(`Unfamiliar acme provider: "${type}"`);
    
    // Note that `await this.getPrv()` gets the private key of the acme
    // Account, while `this.keep.dive([ 'acme', type, 'prv' ])` contains the
    // private key certified by the resulting trusted certificate - acme
    // explicitly forbids using the same private key for both!
    let prv = await this.retrieveOrCompute(`acme.${type}.prv`, 'utf8', () => {
      return this.getOsslPrv({ alg: 'rsa', bits: this.secureBits });
    });
    
    // Here's the cert request we'll use...
    let csr = await this.retrieveOrCompute(`acme.${type}.csr`, 'utf8', async () => {
      return this.getOsslCsr({ prv });
    });
    
    // We'll perform the whole acme process to retrieve the crt
    let crt = await this.retrieveOrCompute(`acme.${type}.crt`, 'utf8', async () => {
      
      let AcmeHttpClient = require('./client/acme.js');
      let client = AcmeHttpClient({ rootAddr: provider.directory, prv: await this.getPrv() });
      
      let networkAddresses = this.getNetworkAddresses();
      
      sc('Retrieving account...');
      let accountRes = await this.retrieveOrCompute(`acme.${type}.account`, 'json', async () => {
        
        sc('Creating account...');
        let res = await client.makeAccount({ email: this.details.email });
        if (res.code !== 201) throw Error(`Failed to create ${type} account for email "${this.details.email}"`).mod({ res });
        return res;
        
      });
      let accountUrl = accountRes.headers.location;
      let account = client.account(accountUrl);
      
      sc(`Verify account (${accountUrl}) exists...`);
      let verifyAccountRes = await account.query({ addr: accountUrl });
      if (verifyAccountRes.code !== 200) throw Error(`Couldn't find ${type} account with url "${accountUrl}"`);
      
      sc('Creating a new Order...');
      let orderRes = await account.query({
        addr: '!newOrder',
        body: { identifiers: networkAddresses.map(value => ({ type: 'dns', value })) }
      });
      if (orderRes.code !== 201) throw Error(`Couldn't create ${type} order`).mod({ res: orderRes });
      
      sc(`Initiated order for [ ${networkAddresses.join(', ')} ], with status "${orderRes.body.status}"`);
      if (orderRes.body.status !== 'valid') {
        
        sc(`Order needs to go from "${orderRes.body.status}" -> "valid"; we'll complete all Authorizations (one for each NetworkAddress)`);
        
        let orderUrl = orderRes.headers.location;
        let orderAuths = orderRes.body.authorizations; // Note `orderRes.body.authorizations.length === this.getNetworkAddresses().length` (unless some addresses have already been certified!)
        let auths = await Promise.all(orderAuths.map(async authUrl => {
          let res = await account.query({ addr: authUrl });
          if (res.code !== 200) throw Error(`Couldn't initialize ${type} authorization @ ${authUrl}`).mod({ res });
          return { ...res, url: authUrl };
        }));
        sc('Authorizations for our order:\n' + auths.map(auth => {
          let { body: { identifier: { type, value } } } = auth;
          return `${type} / ${value} (${auth.url})`;
        }).join('\n').indent(2));
        
        let getValidAuthResByPolling = async (auth, retryWaitMs=1500, maxAttempts=10) => {
          
          /* Get dynamic `retryWaitMs` from headers:
          let retryWaitMs = null;
          if (authRes.headers.has('retry-after')) {
            
            // The value is either purely numeric characters, indicating
            // a number of Seconds, otherwise it is an http-date
            // (https://www.rfc-editor.org/rfc/rfc7231#section-7.1.1.1)
            let ra = authRes.headers['retry-after'];
            retryWaitMs = /^[0-9]+$/.test(ra) ? (parseInt(ra, 10) * 1000) : (Date.parse(ra) - Date.now());
            
          }
          if (!retryWaitMs || !isForm(retryWaitMs, Number)) retryWaitMs = 1000;
          */
          
          let attempts = 0;
          while (true) {
            
            let authRes = await account.query({ addr: auth.url });
            sc(`Polled ${auth.url} to check if the authorization succeeded`, authRes);
            
            // Simply return valid Authorizations
            if (authRes.body.status === 'valid') return authRes;
            
            // The only state that doesn't indicate failure (yet) is
            // "pending" - note failure states include "invalid",
            // "deactivated", "expired" and "revoked"
            if (authRes.body.status !== 'pending') throw Error(`Authorization couldn't succeed (status "${authRes.body.status}"`).mod({ authRes });
            
            if (++attempts >= maxAttempts) throw Error(`Failed after ${attempts} attempt(s)`).mod({ authRes });
            
            // Not valid yet... retry after a delay! A recommended delay
            // may be suggested using the "retry-after" header
            await Promise(rsv => setTimeout(rsv, retryWaitMs));
            
          }
          
        };
        
        let challOptions = Object.plain({
          
          // Note that these challenge functions should return an
          // Authorization res from the acme server, with its status set
          // to "valid" (if these functions return nullish or a pending
          // Authorization the Authorization will automatically be
          // polled until it becomes "valid")
          
          'http-01': async (auth, challenge) => {
            
            // `auth.body.identifier.value` is the NetworkAddress to
            // verify, corresponding exactly to the NetworkAddress used
            // when initiating the Order
            let addr = auth.body.identifier.value;
            
            let hash = require('crypto').createHash('sha256').update(JSON.stringify(client.jwk));
            let keyAuth = `${challenge.token}.${hash.digest('base64url')}`;
            
            let tmp = Tmp();
            
            // Http server function; returns `true` if `req` is an acme
            // challenge request from the acme server (after sending the
            // challenge-response via `res`); returns `false` for all
            // other requests
            let tryAcmeHttp01ChallengeReply = (req, res) => {
              
              sc('CHALLENGE SERVER GOT:', {
                version: req.httpVersion,
                method: req.method,
                url: req.url,
                headers: req.headers.map(vals => isForm(vals, Array) ? vals : [ vals ])
              });
              
              if (req.method !== 'GET') return false;
              if (req.url !== `/.well-known/acme-challenge/${challenge.token}`) return false;
              
              sc('WOW ITS THE ACME CHALLENGE! Responding to challenge...', { keyAuth });
              res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
              res.end(keyAuth);
              
              return true;
              
            };
            
            // Is there an active, insecure http server, for the given
            // NetworkAddress, on port 80? If so we'll use it for the
            // challenge, otherwise we'll just spin up a one-off server!
            let activeInsecureHttpPort80Server = this.servers.seek(server => true
              && server.state === 'open'
              && server.secure === false
              && server.protocol === 'http'
              && server.netAddr === addr
              && server.port === 80
            ).val;
            
            try {
              
              // This Promise resolves when our challenge server is hit
              let challengePrm = Promise.later();
              
              // Ensure a Server is ready to serve http on port 80
              if (activeInsecureHttpPort80Server) {
                
                sc('Using a pre-existing http port 80 server!', activeInsecureHttpPort80Server);
                let intercept = (req, res) => {
                  let result = tryAcmeHttp01ChallengeReply(req, res);
                  if (result) challengePrm.resolve({ req, res });
                  return result;
                };
                
                // Add the acme Intercept as the highest priority (1st)
                // Intercept in the server's list of Intercepts!
                let origIntercepts = activeInsecureHttpPort80Server.intercepts;
                activeInsecureHttpPort80Server.intercepts = [ intercept, ...origIntercepts ];
                tmp.endWith(() => activeInsecureHttpPort80Server.intercepts = origIntercepts);
                
              } else {
                
                sc('Using a one-off http port 80 server!');
                let err = Error('');
                let server = require('http').createServer((req, res) => {
                  if (tryAcmeHttp01ChallengeReply(req, res)) return challengePrm.resolve();
                  res.writeHead(400);
                  res.end('Thats not what we expect :D ' + addr);
                });
                await Promise((rsv, rjc) => {
                  server.on('listening', rsv);
                  server.on('error', cause => err.propagate({ cause, msg: 'Failed to start one-off server for acme http challenge' }));
                  server.listen(80, addr); // TODO: Listen on 0.0.0.0? Or on `addr`? (Can we get more specific about where the acme server will get in touch with us?)
                });
                tmp.endWith(() => {
                  server.close(err => err && sc('Failed to close Server used for acme http-01 challenge :(', err));
                });
                
              }
              
              // At this point we have a server listening on non-secure
              // http port 80, with the correct NetworkAddress; tell the
              // acme server we're ready to respond to its challenge:
              let readyForChallengeRes = await account.query({ addr: challenge.url, body: {} });
              if (readyForChallengeRes.code >= 400) throw Error(`Acme server won't verify ability to complete challenge`).mod({ res: readyForChallengeRes });
              sc('INFORMED ACME SERVER WE\'RE READY TO RESPOND TO ITS CHALLENGE...', readyForChallengeRes);
              
              // We can't allow the server an infinite amount of time to
              // verify our ability to respond to its challenge
              let waitMs = 120 * 1000;
              sc(`Acme server has ${Math.round(waitMs / 1000)} seconds to verify our ownership of ${addr}...`);
              let timeout = setTimeout(() => challengePrm.reject(Error('Timeout')), waitMs);
              tmp.endWith(() => clearTimeout(timeout));
              
              // Wait for our http-01 challenge server to get hit (but
              // note true challenge-completion-verification can only
              // result from polling the Authorization - even sending a
              // successful response from our challenge server isn't
              // sufficient; the ca might perform multiple challenge
              // requests - so we can't stop serving the challenge until
              // we've polled the Authorization to be valid!)
              sc('Waiting to respond to challenge...');
              await challengePrm;
              
              sc('Responded to challenge! Waiting for Authorization to become "valid"');
              return await getValidAuthResByPolling(auth);
              
            } finally {
              
              tmp.end();
              
            }
            
            sc(`WHOA... our challenge server was queried successfully! (But we can only confirm the server has validated our ownership of ${addr} by polling to see that the challenge has turned "valid")`);
            
          }
          
        });
        let challPrefs = Object.keys(challOptions);
        await Promise.all(auths.map(async auth => {
          
          // Skip valid challenges
          if (auth.body.status === 'valid') return;
          
          if (auth?.body?.identifier?.type !== 'dns') throw Error(`OOFfaaahahgga identifier type isn't dns!`).mod({ auth });
          if (auth.body.status !== 'pending') throw Error(`OWWWW I don't know what to do the auth status is "${auth.body.status}"`).mod({ auth });
          
          let challType = challPrefs.seek(type => auth.body.challenges.seek(chall => chall.type === type).found).val;
          if (!challType) throw Error(`OWWAAWOWOWOW couldn't negotiate a Challenge; we support [ ${challPrefs.join(', ')} ]; options are [ ${auth.body.challenges.map(chall => chall.type).join(', ')} ]`).mod({ challPrefs, auth });
          
          let challenge = auth.body.challenges.seek(chall => chall.type === challType).val;
          
          sc(`DO CHALLENGE ${challenge.type} FOR ${auth.body.identifier.value}`);
          let authRes = await challOptions[challType](auth, challenge);
          sc(`CRIKEY - the "${challType}" challenge function is complete!!`, authRes);
          
          if (!authRes || authRes.body.status === 'pending') authRes = await getValidAuthResByPolling(auth);
          if (authRes.body.status !== 'valid') throw Error(`Couldn't get an Authorization with "valid" status`).mod({ authRes });
          
          sc(`OMG we defff proved we own ${auth.body.identifier.value} (${type})!!`, authRes);
          
        }));
        
        sc(`SWEET all authorizations are complete: [ ${auths.map(auth => auth.url).join(', ')} ]`);
        
        // Update `orderRes`...
        orderRes = await account.query({ addr: orderUrl });
        
        // Finalize any "ready" Orders
        if (orderRes.body.status === 'ready') {
          
          // Orders that are "ready" need to be finalized; this means we
          // send a csr to the server, and it sends us back a crt!
          
          let acmeCsr = csr.split('\n')
            .map(ln => ln.trim() || skip) // Remove empty lines
            .slice(1, -1)                 // Remove header/footer
            .join('')
            
            // https://community.letsencrypt.org/t/error-on-finalize-csr-submission/163829/3
            .replace(/[+]/g, '-')
            .replace(/[/]/g, '_')
            .replace(/[=]+$/, '');
          
          sc(`Finalizing order ${orderUrl}`, { csr });
          let finalizeRes = await account.query({ addr: orderRes.body.finalize, body: { csr: acmeCsr }});
          if (finalizeRes.code >= 400) throw Error('UGH failed to finalize').mod({ res: finalizeRes });
          
          sc('Order finalized; it is expected to process and then go valid!', { finalizeRes });
          orderRes.body.status = 'processing'; // Assume the Order is now processing - could also consider `orderRes = await account.query({ addr: orderUrl });`, but that involves needless(?) overhead
          
        }
        
        // Poll any "processing" Orders until they turn valid
        while (orderRes.body.status === 'processing') {
          
          orderRes = await account.query({ addr: orderUrl });
          sc('Polled Order waiting for it to exit "processing" status', { orderRes });
          await Promise(rsv => setTimeout(rsv, 1000));
          
        }
        
      }
      
      if (orderRes.body.status !== 'valid') throw Error(`Order still isn't valid :(`).mod({ orderRes });
      
      sc('FINAL ORDER:', { orderRes });
      sc('Getting crt...');
      return (await account.query({ addr: orderRes.body.certificate })).body;
      
    });
    
    return { prv, csr, crt, invalidate: async () => {
      
      let now = Date.now();
      let bakKeep = this.keep.dive([ 'acme', type, 'bak', now.toString(10) ]);
      await Promise.all([
        bakKeep.dive([ 'prv' ]).setData(prv),
        bakKeep.dive([ 'csr' ]).setData(csr),
        bakKeep.dive([ 'crt' ]).setData(crt)
      ]);
      
      // Note this doesn't invalidate `prv`, which can safely be reused!
      await Promise.all([
        this.keep.dive([ 'acme', type, 'csr' ]).rem(),
        this.keep.dive([ 'acme', type, 'crt' ]).rem()
      ]);
      
    }};
    
  },
  
  activatePort(port, servers, sgn=null) {
    
    // Activates all Servers/RoadAuthorities configured to run on `port`
    
    /// {ASSERT=
    if (isForm(port, String)) port = parseInt(port, 10);
    /// =ASSERT}
    
    let tmp = Tmp();
    
    let serverPrms = servers.map(server => Promise.later());
    let activeTmps = servers.map(server => server.activate({ security: server.secure ? sgn : null, adjacentServerPrms: serverPrms }));
    
    // Resolve the manually handled Promise for each Server when the Server goes active
    for (let [ term, activeTmp ] of activeTmps)
      activeTmp.prm.then(
        val => serverPrms[term].resolve(servers[term]),
        err => serverPrms[term].reject(err.mod({ server: servers[term] }))
      );
    
    // Ending the "activate port" Tmp ends all Server activations that resulted
    for (let [ term, activeTmp ] of activeTmps) tmp.endWith(activeTmp);
    
    // Overall completion occurs when all Servers have activated
    tmp.prm = Promise.all(activeTmps.map(tmp => tmp.prm));
    
    return tmp;
    
  },
  
  addServer(server) { this.servers.add(server); },
  getServer(protocol, port) { return this.servers.find(sv => sv.protocol === protocol && sv.port === port); },
  async runOnNetwork(term = '<unknown>') {
    
    // TODO: (?) Certify every NetworkAddress in `this.servers`
    
    let sc = this.sc.kid('server');
    let tmp = Tmp({ portServers: null });
    
    let effectiveServers = [ ...this.servers ];
    
    // Add a server to redirect http->https if port 80 is free?
    if (this.redirectHttp80 && this.secureBits > 0) await (async () => {
      
      let httpsServer = effectiveServers.find(server => server.protocol === 'http');
      if (!httpsServer) return; // No point redirecting if there's no secure server
      
      // TODO: What if another process is using the port?? (detect "EPORTUNAVAILABLE"?)
      // Note all we now know is *this* NetworkIdentity is not hogging http://localhost:80, as this
      // NetworkIdentity is secure (it wouldn't be using http)
      
      let { netAddr, port: httpsPort } = httpsServer;
      
      let HttpRoadAuth = await require('./server/http.js'); // http.js -> `module.exports` is a Promise!!
      let redirectServer = HttpRoadAuth({
        secure: false, netProc: `${netAddr}:80`, doCaching: false,
        // This server does nothing but redirect; spoof the AboveHut
        aboveHut: {
          desc: () => 'FakeAboveHut',
          getDefaultLoftPrefix: () => { throw Error('Fake AboveHut'); },
          getBelowHutAndRoad: () => { throw Error('Fake AboveHut'); }
        }
      });
      redirectServer.intercepts.push((req, res) => {
        res.writeHead(302, { 'Location': `https://${netAddr}:${httpsPort}${req.url}` }).end();
        return true;
      });
      
      effectiveServers.add(redirectServer);
      
      // TODO: Don't love adding the temporary server, but we need to in case an acme process runs
      // and wants to find a pre-existing server
      this.servers.add(redirectServer);
      tmp.endWith(() => this.servers.rem(redirectServer)); // TODO: `this.servers` should be Set, not Arr?
      
      sc({ msg: 'redirecting unsafe http port 80', head: redirectServer.desc(), tail: httpsServer.desc() });
      
    })();
    
    // Group Servers by port, ensure all Servers on the same port share
    // the same NetworkAddress, ensure no two Servers on the same port
    // have the same protocol
    let portServers = tmp.portServers = effectiveServers
      .categorize(server => server.port.toString(10))
      .map((serverArr) => serverArr.toObj(server => [ server.getBaseProtocol(), server ]));
    
    /// {DEBUG=
    if (portServers.empty()) throw Error('No servers available');
    /// =DEBUG}
    
    /// {DEBUG=
    for (let [ port, servers ] of portServers) {
      let netAddrs = Set(servers.toArr(server => server.netAddr));
      if (netAddrs.size !== 1) throw Error(`Port ${port} demanded by multiple NetworkAddresses: [ ${netAddrs.toArr(v => v).join(', ')} ]`);
    }
    for (let [ port, servers ] of portServers) {
      let protocols = Set(servers.toArr(server => server.protocol));
      if (protocols.size !== servers.count()) throw Error(`Multiple Servers on port ${port} have the same Protocol`);
    }
    /// =DEBUG}
    
    if (!this.secureBits) {
      
      let activeTmps = portServers.toArr((servers, port) => this.activatePort(port, servers, null));
      tmp.endWith(() => activeTmps.each(tmp => tmp.end()));
      tmp.prm = Promise.all(activeTmps.map(tmp => tmp.prm));
      
    } else {
      
      tmp.prm = Promise.later();
      
      // Fire-and-forget this!
      (async () => {
        
        // `cycleTmp` represents the lifespan of servers running over
        // multiple signing cycles; a signing cycle ends when the
        // relevant signing info becomes outdated
        let cycleTmp = Tmp.stub; // Initially `cycleTmp.off() === true`
        tmp.endWith(() => cycleTmp.end()); // Careful with `cycleTmp` reference - it gets reassigned!
        
        // Each iteration of this loop represents a period with unique signing information
        while (tmp.onn()) {
          
          // `refresh` indicates whether the signing info needed to be refreshed because it was
          // outdated - if `refresh === true` need to make sure that any services running with the
          // previous `sgn` are restarted using the new `sgn`
          let { sgn, refresh } = await this.getSgnInfo();
          
          // If we refreshed it means all previously running servers are
          // using outdated `sgn` info; need to shut all such servers!
          if (refresh) cycleTmp.end();
          
          // If no cycle is active begin a new one! (Always initially true)
          if (cycleTmp.off()) {
            
            cycleTmp = Tmp();
            
            // A new cycle has begun with new signing info! The previous one was ended somehow, so
            // we're assured the ports activated as part of that cycle are being closed (TODO: but
            // not necessarily done being closed?? Addressing this is pending behind the refactor
            // of `Endable.prototype.end` to make the return value consumer-controlled)
            
            let activePortTmps = portServers.map((servers, port) => this.activatePort(port, servers, sgn));
            cycleTmp.endWith(() => activePortTmps.each(apt => apt.end()));
            let portsReactivatedPrm = Promise.all(activePortTmps.map(apt => apt.prm));
            
            // The first time ports are reactivated (technically "activated"), the `tmp.prm` value
            // returned by `runOnNetwork` is resolved, to indicate to the consumer that the task of
            // "running on the network" is complete
            portsReactivatedPrm.then(() => tmp.prm.resolve());
            
            await portsReactivatedPrm;
            
          }
          
          // Block async flow until crt expires; this is non-trivial as we need to consider:
          // - we need to stop running if `tmp` is externally ended (this fired-and-forgotten loop
          //   should cease if the `runOnNetwork` Tmp is every ended!)
          // - `setTimeout` natively supports a max ms 2^31-1 (slightly less than 25 days)
          while (tmp.onn()) {
            
            let msRemaining = sgn.validity.expiryMs - Date.now();
            if (msRemaining < 0) break;
            
            sc({ msg: 'cert is valid', daysRemaining: (msRemaining / (1000 * 60 * 60 * 24)) });
            
            // Wait until either the timeout elapses or `tmp` ends
            let [ route, timeout ] = [ null, null ];
            await Promise(rsv => {
              
              // Resolve on timeout (2^31-1 is the max timeout duration)
              timeout = setTimeout(rsv, Math.min(msRemaining, 2 ** 31 - 1));
              
              // Resolve if `tmp` is Ended (meaning Server was stopped)
              route = tmp.route(rsv);
              
            });
            
            // Cleanup
            clearTimeout(timeout);
            route.end();
            
          }
          
        }
        
      })();
      
    }
    
    tmp.prm.then(() => sc({ msg: 'exposed on network', portServers }));
    
    tmp.endWith(() => sc({ msg: 'removed from network' }));
    
    return tmp;
    
  }
  
})});
