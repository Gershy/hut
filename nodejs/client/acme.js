require('../../room/setup/clearing/clearing.js');

module.exports = form({ name: 'AcmeHttpClient', props: (forms, Form) => ({
  
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
        if (!kid) throw Error('Missing eab.kid');
        if (!hmac) throw Error('Missing eab.hmac');
        
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
      if (tryRefreshNonce) { gsc('REFRESH NONCE:', nonce, '...'); continue; } // Try again with the new nonce
      
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