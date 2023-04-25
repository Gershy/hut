'use strict';

require('../room/setup/clearing/clearing.js');

let dbg = (...args) => gsc(...args);

let AcmeHttpClient = form({ name: 'AcmeHttpClient', props: (forms, Form) => ({
  
  $defaultJoseOpts: {
    padding: require('crypto').constants.RSA_PKCS1_PADDING,
    dsaEncoding: 'ieee-p1363'
  },
  $defHeaders: {
    userAgent: 'AcmeHttpClient/1.0.0',
    acceptLanguage: 'en;q=1'
  },
  
  init({ http=require('./http.js'), rootAddr, prv, jwk=null, joseOpts={} }={}) {
    
    // Can get public `jwk` from `prv` if it wasn't provided
    if (jwk === null) {
      
      jwk = require('crypto').createPublicKey(prv).export({ format: 'jwk' }) // crypto/getJwk ("json web key")
        .toArr((v, k) => [ k, v ])
        .sort((a, b) => a[0].localeCompare(b[0]))
        .toObj(v => v);
      
    }
    
    Object.assign(this, {
      http,
      rootAddr,
      prv, jwk,
      joseOpts: { ...Form.defaultJoseOpts, ...joseOpts },
      cache: Object.plain()
    });
    
  },
  
  cached(name, fn) {
    
    if (this.cache[name]) return this.cache[name];
    
    this.cache[name] = fn();
    then(this.cache[name], v => this.cache[name] = v);
    
    return this.cache[name];
    
  },
  account(accountUrl) {
    return {
      query: (opts={}) => this.httpJwsQuery({ kid: accountUrl, ...opts })
    };
  },
  
  async httpQuery(args={}, { addr, headers, ...more }=args) {
    
    if (addr && addr[0] === '!') addr = (await this.getDirectory())[addr.slice(1)];
    
    return this.http.query({ addr, ...more, headers: { ...Form.defHeaders, ...headers } });
    
  },
  async httpJwsQuery({ kid=null, eab=null, body, headers={}, addr, ...args }) {
    
    // Note that "kid" ("key id") is an account url String or `null`
    
    if (addr && addr[0] === '!') addr = (await this.getDirectory())[addr.slice(1)];
    
    let alg = this.jwk.kty.lower();
    let type = 'std';
    
    if      (alg === 'ec' && this.jwk.crv === 'P-384') type = 'p384';
    else if (alg === 'ec' && this.jwk.crv === 'P-521') type = 'p521';
    else if (alg === 'ec')                             type = 'p256';
    
    let [ headerAlg, signerAlg ] = {
      'rsa:std': [ 'rs256', 'sha256' ],
      'ec:p384': [ 'es384', 'sha384' ],
      'ec:p521': [ 'es512', 'sha512' ],
      'ec:p256': [ 'es256', 'sha256' ]
    }[`${alg}:${type}`].map(v => v.upper());
    
    let { padding, dsaEncoding } = this.joseOpts;
    
    let plainBody = body;
    
    let doReq = async (nonce=null, body) => {
      
      if (eab) {
        
        // Basically with external bindings the payload is extended with
        // an "externalAccountBinding" property
        
        let { kid, hmac } = eab;
        if (!kid) throw Error(`Missing eab.kid`);
        if (!hmac) throw Error(`Missing eab.hmac`);
        
        let header = nonce
          ? { alg: 'HS256', url, nonce, kid }
          : { alg: 'HS256', url, kid };
        let body = jwk;
        
        [ header, body ] = [ header, body ].map(v => v ? Buffer.from(valToSer(v)).toString('base64url') : '');
        eab = {
          payload: hmacPayload,
          protected: header,
          signature: require('crypto').createHmac('SHA256', Buffer.from(hmac, 'base64'))
            .update(`${header}.${body}`, 'utf8')
            .digest()
            .toString('base64url')
        };
        
      }
      
      // Note that if no "key id" is present we simply use the public
      // key (in jwk format) corresponding to the user's private key
      let header = kid
        ? { alg: headerAlg, url: addr, nonce, kid }
        : { alg: headerAlg, url: addr, nonce, jwk: this.jwk };
      
      [ header, body ] = [ header, body ].map(v => v ? Buffer.from(valToSer(v)).toString('base64url') : '');
      
      return this.httpQuery({
        
        addr,
        ...args,
        method: 'post',
        headers: { contentType: 'application/jose+json' },
        body: valToSer({
          
          payload: body,
          protected: header,
          signature: require('crypto').createSign(signerAlg).update(`${header}.${body}`, 'utf8').sign({
            key: this.prv,
            padding,
            dsaEncoding
          }, 'base64url'),
          
          ...(eab ? { externalAccountBinding: eab } : {})
          
        }),
        plainBody
        
      });
      
    };
    
    let nonce = await this.getNonce();
    let countRetries = 0;
    while (true) {
      
      let res = await doReq(nonce, plainBody);
      if (res.headers.has('replay-nonce')) this.cache.nonce = nonce = res.headers['replay-nonce'];
      
      let tryRefreshNonce = true
        && res.body.type === 'urn:ietf:params:acme:error:badNonce'
        && res.headers.has('replay-nonce')
        && (countRetries++ < 5);
      if (tryRefreshNonce) { dbg('REFRESH NONCE:', nonce, '...'); continue; } // Try again with the new nonce
      
      return res;
      
    }
    
  },
  
  async getDirectory() {
    
    return this.cached('directory', async () => {
      
      let dirRes = await this.httpQuery({ addr: this.rootAddr, method: 'get' });
      return dirRes.body;
      
    });
    
  },
  async getNonce() {
    
    return this.cached('nonce', async () => {
      
      let nonceRes = await this.httpQuery({ addr: '!newNonce', method: 'head' });
      return nonceRes.headers['replay-nonce'];
      
    });
    
  },
  
  async makeAccount({ email, eab=null }={}) {
    
    if (!email) throw Error('Must provide "email"');
    
    let body = eab
      ? { termsOfServiceAgreed: true, contact: [ `mailto:${email}` ], externalAccountBinding: eab }
      : { termsOfServiceAgreed: true, contact: [ `mailto:${email}` ] };
    
    return this.httpJwsQuery({ addr: '!newAccount', body });
    
  },
  async getAccount({ accountUrl }={}) {
    
    if (!accountUrl) throw Error('Missing "accountUrl"');
    
    return this.httpJwsQuery({ addr: accountUrl, kid: accountUrl });
    
  }
  
})});

module.exports = form({ name: 'NetworkIdentity', props: (forms, Form) => ({
  
  $crtProviders: Object.plain({
    
    letsEncryptStaging: {
      directory: 'https://acme-staging-v02.api.letsencrypt.org/directory'
    },
    letsEncrypt: {
      directory: 'https://acme-v02.api.letsencrypt.org/directory'
    }
    
  }),
  
  $subcon: Object.plain({
    server: subcon('netIden.serverManager'),
    sign: subcon('netIden.sign'),
    acme: subcon('netIden.acme')
  }),
  
  $tmpFp: () => require('path').join(require('os').tmpdir(), Math.random().toString('16').slice(2)),
  $setFp: (...args /* fp, data */) => {
    let [ fp, data=null ] = (args.length === 2) ? args : [ Form.tmpFp(), args[0] ];
    return require('fs').promises.writeFile(fp, data).then(() => fp);
  },
  $remFp: (fp) => require('fs').promises.unlink(fp),
  $defaultDetails: Object.plain({
    
    // Geographic heirarchical identifiers (and shortforms)
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
    
    // Organization heirarchical identifiers
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
      if (vals.length > 6) throw Error(`Should have max 6 "geo" components`);
      Object.assign(details, vals.toObj((v, i) => [ `geo${i}`, v.trim() || '' ]));
    }
    if (details.has('org')) {
      let vals = details.org.split('.');
      if (vals.length > 6) throw Error(`Should have max 6 "org" components`);
      Object.assign(details, vals.toObj((v, i) => [ `org${i}`, v.trim() || '' ]));
    }
    
    // Default "geoShortN" props from corresponding "geoN" props
    for (let n of 6)
      if (!details[`geoShort${n}`] && details[`geo${n}`])
        details[`geoShort${n}`] = details[`geo${n}`].slice(0, 2);
    
    for (let n of 6) if (details[`geoShort${n}`].length > 2) throw Error(`Short geo names must be max 2 chars (got "${details['geoShort' + n]}")`);
    
    return details.map((v, k) => (k in Form.defaultDetails) ? v : skip);
    
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
        let ind = lns.find(ln => !ln.hasHead(wsPfx)).ind || lns.length;
        
        let kidLns = lns.slice(0, ind); // Includes everything up until (excluding) non-ws-prefixed line
        lns = lns.slice(ind);           // Includes non-ws-prefixed line and onwards
        
        parse(kid, kidLns.map(ln => ln.slice(wsPfx.length)));
        
      }
      return container;
      
    };
    let formatKey = key => {
      if (key.match(/^[a-z][a-zA-Z]+$/)) return key;
      return key.lower()
        .replace(/[ -:]+[a-z]/g, match => match.slice(-1)[0].upper()) // Camelcasing
        .replace(/[^a-zA-Z]+$/g, '');                                 // Remove non-alpha suffix
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
  
  init({ name, details={}, keep=null, secureBits=2048, certificateType='selfSign', servers, getSessionKey, ...more }={}) {
    
    // TODO: For the same Keep, certain details are expected to remain
    // consistent across runs; it's probably worth storing the initial
    // details used in a Keep, and then checking those details on every
    // other run to make sure they're the same!
    
    if ([ String, Array ].any(C => isForm(keep, C))) keep = global.keep(keep);
    
    if (secureBits && secureBits < 512) throw Error(`Use at least 512 secure bits`);
    if (!isForm(name, String) || !name) throw Error(`Must provide "name"`);
    if (keep && !keep.Form) throw Error(`"keep" should be a Keep (got ${getFormName(keep)})`);
    
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
      subcon: Function.stub,
      
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
      this.retrieveOrCompute('details', 'ser', () => Form.validateDetails(details))
        .then(details => Object.assign(this, { details }))
      
    ]);
    
  },
  desc() {
    
    let networkAddresses = this.getNetworkAddresses();
    
    let pcs = [];
    pcs.push(`"${this.name}"`);
    pcs.push(this.secureBits ? `secure(${this.secureBits})` : 'UNSAFE');
    if (this.keep) pcs.push(this.keep.desc());
    if (networkAddresses.length) pcs.push(`[ ${networkAddresses.join(', ')} ]`);
    
    return `${getFormName(this)}(${pcs.join('; ')})`;
    
  },
  
  getNetworkAddresses() { return Set(this.servers.map(server => server.netAddr)).toArr(v => v); },
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
    this.subcon(rawShellStr);
    
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
      proc.emit('error', Error(`Timeout`).mod({ lastChunk: lastChunk && lastChunk.toString('utf8') }))
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
    
    let stdoutFn = handleChunk.bind(null, 'out', stdoutChunks);
    let stderrFn = handleChunk.bind(null, 'out', stderrChunks);
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
    if (!commonName) throw Error(`Supply at least 1 NetworkAddress`)
    
    gsc('DETAILS', this.details);
    
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
    
    if (!prv)                                     throw Error(`Must supply "prv" to get pub!`);
    if (![ String, Buffer ].has(prv.constructor)) throw Error(`"prv" must be String or Buffer (got ${getFormName(prv)})`);
    
    let prvFp = await Form.setFp(prv);
    
    try {
      
      return await this.runInShell(`${this.osslShellName} rsa -in ${prvFp} -pubout`);
      
    } finally {
      
      Form.remFp(prvFp);
      
    }
    
  },
  async getOsslCsr({ prv }={}) {
    
    // "csr" = "certificate signing request" (".csr" = ".req" = ".p10")
    // Represents a request to associate a public key with a "certified
    // term" ("common name"), and additional list of "alternate names";
    // note this is only a request to perform this association - some
    // certificate provider needs to fulfill the request in order for
    // any sense of "ownership" to be established
    
    if (!prv)                                     throw Error(`Must supply "prv" to get csr!`);
    if (![ String, Buffer ].has(prv.constructor)) throw Error(`"prv" must be String or Buffer (got ${getFormName(prv)})`);
    
    let config = this.getOsslConfigFileContent();
    let [ prvFp, cfgFp ] = await Promise.all([
      Form.setFp(prv),
      Form.setFp(config)
    ]);
    
    try {
      
      return await this.runInShell(`${this.osslShellName} req -new -key ${prvFp} -config ${cfgFp}`);
      
    } finally {
      
      Form.remFp(prvFp);
      Form.remFp(cfgFp);
      
    }
    
  },
  async getOsslCrt({ prv, csr }={}) {
    
    // We consider `prv` to be the private key of a cert authority, and
    // we use that ca to sign the cert request `csr`
    
    if (!prv) throw Error(`Must supply prv to get a crt!`);
    if (!csr) throw Error(`Must supply csr to get a crt!`);
    
    let [ prvFp, csrFp ] = await Promise.all([
      Form.setFp(prv),
      Form.setFp(csr)
    ]);
    
    try {
      
      return await this.runInShell(`${this.osslShellName} x509 -req -days 90 -in ${csrFp} -signkey ${prvFp}`);
      
    } finally {
      
      Form.remFp(prvFp);
      Form.remFp(csrFp);
      
    }
    
  },
  async getOsslDetails({ csr, crt }) {
    
    if (csr && crt) throw Error(`Provide only one of "csr" and "crt"!`);
    
    let pemFp = await Form.setFp(csr || crt);
    
    try {
      
      let info = csr
        ? await this.runInShell(`${this.osslShellName} req -text -in ${pemFp} -noout`)
        : await this.runInShell(`${this.osslShellName} x509 -text -in ${pemFp} -noout`);
      
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
    
    let keep = this.keep.seek(token.dive(diveToken));
    
    let ser = encoding === 'ser';
    let val = await keep.getContent(ser ? null : encoding);
    if (val) return ser ? serToVal(val) : val;
    
    val = await fn();
    await keep.setContent(ser ? valToSer(val) : val);
    
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
      
      // A SGN (as opposed to PRV, CSR, CRT) is a combination of all the
      // values needed to manage a server with  a certified identity, as
      // well as some simple functionality to manage that identity:
      //    | {
      //    |   prv, csr, crt, invalidate,
      //    |   validity: {
      //    |     msElapsed,
      //    |     msRemaining,
      //    |     expiryMs
      //    |   }
      //    | }
      
      Form.subcon.sign('GET CERT', this.certificateType);
      
      let sgn = null; // Will look like `{ prv, csr, crt, invalidate }`
      if      (this.certificateType === 'selfSign')   sgn = await this.getSgnSelfSigned();
      else if (this.certificateType.hasHead('acme/')) sgn = await this.getSgnAcme();
      else                                    throw Error(`Unknown crt acquisition method: "${this.certificateType}"`);
      
      let deets = await this.getOsslDetails({ crt: sgn.crt });
      Form.subcon.sign('DEETS', deets);
      
      let validity = null
        ?? deets.data?.validity
        ?? deets.signatureAlgorithmShaWithrsaencryption?.validity;
      if (!validity) throw Error(`Couldn't resolve "validity" from SGN`).mod({ deets });
      
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
  async getSgnSelfSigned() {
    
    let prv = await this.retrieveOrCompute('selfSign.prv', 'utf8', () => {
      return this.getOsslPrv({ alg: 'rsa', bits: this.secureBits });
    });
    
    let csr = await this.retrieveOrCompute('selfSign.csr', 'utf8', () => {
      return this.getOsslCsr({ prv });
    });
    
    let crt = await this.retrieveOrCompute('selfSign.crt', 'utf8', () => {
      return this.getOsslCrt({ prv, csr });
    });
    
    return { prv, csr, crt, invalidate: async () => {
      
      let now = Date.now();
      let bakKeep = this.keep.seek('selfSign', 'bak', now.toString(10));
      await Promise.all([
        bakKeep.seek('prv').setContent(prv),
        bakKeep.seek('csr').setContent(csr),
        bakKeep.seek('crt').setContent(crt)
      ]);
      
      // Note this doesn't invalidate `prv`, which can safely be reused!
      await Promise.all([
        this.keep.seek('selfSign', 'csr').rem(),
        this.keep.seek('selfSign', 'crt').rem()
      ]);
      
    }};
    
  },
  async getSgnAcme() {
    
    // Returns a certificate certifying this NetworkIdentity's ownership
    // of the NetworkAddresses listed in its details, potentially using
    // acme protocol to obtain such a certificate
    
    let sc = Form.subcon.acme;
    
    let [ acquireMethod, type ] = this.certificateType.split('/');
    if (acquireMethod !== 'acme') throw Error(`Not an acme method: "${this.certificateType}"`);
    
    await this.readyPrm;
    
    let provider = Form.crtProviders[type];
    if (!provider) throw Error(`Unfamiliar acme provider: "${type}"`);
    
    // Note that `await this.getPrv()` gets the private key of the acme
    // Account, while `this.keep.seek('acme', type, 'prv')` contains the
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
      
      let client = AcmeHttpClient({ rootAddr: provider.directory, prv: await this.getPrv() });
      
      let networkAddresses = this.getNetworkAddresses();
      
      sc('Retrieving account...');
      let accountRes = await this.retrieveOrCompute(`acme.${type}.account`, 'ser', async () => {
        
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
            let activeInsecureHttpPort80Server = this.servers.find(server => true
              && server.onn()
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
                  server.close(err => err && sc(`Failed to close Server used for acme http-01 challenge :(`, err));
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
              sc(`Waiting to respond to challenge...`);
              await challengePrm;
              
              sc(`Responded to challenge! Waiting for Authorization to become "valid"`);
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
          
          let challType = challPrefs.find(type => auth.body.challenges.find(chall => chall.type === type).found).val;
          if (!challType) throw Error(`OWWAAWOWOWOW couldn't negotiate a Challenge; we support [ ${challPrefs.join(', ')} ]; options are [ ${auth.body.challenges.map(chall => chall.type).join(', ')} ]`).mod({ challPrefs, auth });
          
          let challenge = auth.body.challenges.find(chall => chall.type === challType).val;
          
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
          if (finalizeRes.code >= 400) throw Error(`UGH failed to finalize`).mod({ res: finalizeRes });
          
          sc('We finalized the order; it should be processing until it goes valid!', { finalizeRes });
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
      
      sc(`FINAL ORDER:`, { orderRes });
      sc(`Getting crt...`);
      return (await account.query({ addr: orderRes.body.certificate })).body;
      
    });
    
    return { prv, csr, crt, invalidate: async () => {
      
      let now = Date.now();
      let bakKeep = this.keep.seek('acme', type, 'bak', now.toString(10));
      await Promise.all([
        bakKeep.seek('prv').setContent(prv),
        bakKeep.seek('csr').setContent(csr),
        bakKeep.seek('crt').setContent(crt)
      ]);
      
      // Note this doesn't invalidate `prv`, which can safely be reused!
      await Promise.all([
        this.keep.seek('acme', type, 'csr').rem(),
        this.keep.seek('acme', type, 'crt').rem()
      ]);
      
    }};
    
  },
  
  openPort(port, servers, security=null) {
    
    Form.subcon.server(`NetworkIdentity opening port ${port} (${servers.count()} server(s))`);
    
    /// {ASSERT=
    if (isForm(port, String)) port = parseInt(port, 10);
    for (let s of servers) if (s.port !== port) throw Error(`Claim to be opening port ${port} but supplied port ${s.port}`);
    /// =ASSERT}
    
    let prms = servers.toObj(server => [ server.protocol, Promise.later() ]);
    
    for (let server of servers)
      server.serverOpen(server.secure ? security : null, prms)
        .then(() => prms[server.protocol].resolve(server))
        .fail(err => prms[server.protocol].reject(err));
    
    return Promise.all(prms);
    
  },
  shutPort(port, servers, security=null) {
    
    Form.subcon.server(`NetworkIdentity shutting port ${port} (${servers.count()} server(s))`);
    
    /// {ASSERT=
    if (isForm(port, String)) port = parseInt(port, 10);
    for (let server of servers) if (server.port !== port) throw Error(`Claim to be opening port ${port} but supplied port ${server.port}`);
    /// =ASSERT}
    
    return Promise.all(servers.map(server => server.serverShut()));
    
  },

  async startServers() {
    
    // TODO: Certify every NetworkAddress in `this.servers`
    
    return this.runManagedServers();
    
  },
  addServer(server) { this.servers.add(server); },
  runOnNetwork() {
    
    let sc = Form.subcon.server;
    
    // Try to redirect http->https if port 80 isn't otherwise used
    // TODO: A NetworkIdentity can't know if *another* NetworkIdentity
    // is occupying a port
    
    let httpsServer = this.servers.find(server => server.secure && server.protocol === 'http').val;
    let port80Server = this.servers.find(server => server.port === 80);
    if (this.redirectHttp80 && !port80Server && httpsServer) {
      
      sc(`Will redirect http port 80 to -> ${httpsServer.desc()}`);
      let { netAddr, port: httpsPort } = httpsServer;
      let redirectServer = require('./httpServer.js')({
        secure: false, netAddr, port: 80,
        doCaching: false,
        msFn: () => Date.now(),
        getKeyedMessage: () => ({ key: null, msg: null }),
        errSubcon: global.subcon('warning')
      });
      redirectServer.intercepts.push((req, res) => {
        res.writeHead(302, { 'Location': `https://${netAddr}:${httpsPort}${req.url}` }).end();
        return true;
      });
      
      this.servers.push(redirectServer);
      
    }
    
    let tmp = Tmp();
    
    // Group Servers by port, ensure all Servers on the same port share
    // the same NetworkAddress, ensure no two Servers on the same port
    // have the same protocol
    let portServers = this.servers.categorize(server => server.port.toString(10));
    let ports = portServers.toArr((v, k) => parseInt(k, 10));
    
    /// {DEBUG=
    for (let [ port, servers ] of portServers) {
      let netAddrs = Set(servers.map(server => server.netAddr));
      if (netAddrs.size !== 1) throw Error(`Port ${port} demanded by multiple NetworkAddresses: [ ${netAddrs.toArr(v => v).join(', ')} ]`);
    }
    for (let [ port, servers ] of portServers) {
      let protocols = Set(servers.map(server => server.protocol));
      if (protocols.size !== servers.length) throw Error(`Multiple Servers on port ${port} have the same Protocol`);
    }
    /// =DEBUG}
    
    sc(''
      + `NetworkIdentity hosting Open! (${this.secureBits ? 'secure' : 'unsafe'})\n`
      + portServers.toArr((servers, port) => {
          return `- port ${port}:\n` + servers.map((s, n) => `  ${n + 1}: ${s.protocol}://${s.netAddr}`).join('\n')
        })
    );
    
    if (!this.secureBits) {
      
      let prm = Promise.all(portServers.map((servers, port) => this.openPort(port, servers, null)));
      tmp.endWith(() => prm
        .then(() => Promise.all(portServers.map( (servers, port) => this.shutPort(port, servers) )))
        .fail(err => sc(`Failed to end Server`, err))
      );
        
    } else {
      
      (async () => {
        
        while (tmp.onn()) {
          
          let { sgn, refresh } = await this.getSgnInfo();
          
          await Promise.all(portServers.map(async (servers, port) => {
            
            // If we refreshed it means all previously running servers
            // are using outdated `sgn` info; need to shut each server
            // before reopening it!
            if (refresh) await this.shutPort(port, servers);
            if (true)    await this.openPort(port, servers, sgn);
            
          }));
          
          // Wait for the crt to expire; this is non-trivial because we
          // need to consider:
          // - that waiting gets interrupted if `tmp` Ends
          // - that `setTimeout` only supports a max delay of 2^31-1 ms,
          //   which is just less than 25 days; if we need to wait more
          //   than 25 days we'll call do multiple `setTimeout` calls in
          //   series until we've waited long enough
          while (tmp.onn() && sgn.validity.expiryMs > Date.now()) {
            let route = null;
            await Promise(rsv => {
              let msRemaining = sgn.validity.expiryMs - Date.now();
              sc(`NetworkIdentity current signing info remains valid for ${(msRemaining / (1000 * 60 * 60 * 24)).toFixed(2)} days`);
              setTimeout(rsv, Math.min(msRemaining, 2 ** 31 - 1)); // Resolve on timeout (2^31-1 is the max timeout duration)
              route = tmp.route(rsv);                              // Resolve if `tmp` is Ended (signalling Server should stop)
            });
            route.end();
          }
          
        }
        
        sc(`NetworkIdentity hosting Shut! (${this.secureBits ? 'secure' : 'unsafe'})`, {
          portServers: portServers.map(servers => servers.map(s => s.desc()))
        });
        await Promise.all(portServers.map((servers, port) => this.shutPort(port, servers)))
          .fail(err => sc(`Failed to end Server`, err));
        
      })();
      
    }
    
    return tmp;
    
  }
  
})});
