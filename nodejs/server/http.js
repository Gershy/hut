'use strict';

require('../../room/setup/clearing/clearing.js');
let [ zlib, stream ] = [ 'zlib', 'stream' ].map(require);

module.exports = getRoom('setup.hut.hinterland.RoadAuthority').then(RoadAuthority => {
  
  return form({ name: 'HttpRoadAuthority', has: { RoadAuthority }, props: (forms, Form) => ({
    
    $getHttpStatusFromCode: code => {
      return code >= 500 ? 'Failure' : code >= 400 ? 'Refusal' : code >= 300 ? 'Redirect' : code >= 200 ? 'Success' : 'Info';
    },
    
    init({ doCaching=true, getCacheSecs=msg=>(60 * 60 * 24 * 5), ...args }) {
      
      forms.RoadAuthority.init.call(this, { protocol: 'http', ...args });
      Object.assign(this, { doCaching, getCacheSecs, intercepts: [] });
      
    },
    
    activate({ security=null }={}) {
      
      // Run the server, make it call `hearComm` as necessary. Note that the https cert data will
      // need to be passed to `activate`, not the constructor, as the cert data can become
      // invalidated with time
      
      let tmp = Tmp();
      
      tmp.prm = (async () => {
        let server = require(security ? 'https' : 'http').createServer({ /* TODO - use `security` */ });
        
        let sockets = Set();
        let reqFn = this.processReq.bind(this);
        let conFn = socket => {
          sockets.add(socket);
          socket.once('close', () => sockets.rem(socket));
        };
        
        server.on('connection', conFn);
        server.on('request', reqFn);
        tmp.endWith(() => {
          // Fail requests after the server is ended
          server.off('request', reqFn);
          server.on('request', res => res.socket.destroy());
          
          // Immediately destroy connecting sockets after server ends
          server.off('connection', conFn);
          server.on('connection', socket => socket.destroy());
          
          // End all connected sockets
          for (let socket of sockets) socket.destroy();
        });
        
        let err = Error('');
        await Promise((rsv, rjc) => {
          server.once('listening', rsv);
          server.once('error', cause => {
            cause.suppress();
            rjc(err.mod({ msg: 'Failed to open server', cause }));
          });
          server.listen(this.port, this.netAddr);
        });
        
        this.server = server;
        denumerate(this, 'server');
        
      })();
      
      return tmp;
      
    },
    async processReq(req, res) {
      
      for (let intercept of this.intercepts) if (intercept(req, res)) return;
      
      let ms = getMs();
      
      let comm = (0, Form.Comm)({ roadAuth: this, ms, req, res });
      try         { await comm.resultPrm; }
      catch (err) { comm.kill({ err }); return; }
      
      // Note `comm.context.cookie` is ignored; we're only looking at `comm.context.hutCookie`
      // which contains parsed data from the "hut" cookie
      let { belowNetAddr, body, hutCookie, path, query /*, fragment */ } = comm.context;
      
      let msg = { ...hutCookie, ...query, ...body };
      let hasCmd = msg.has('command');
      let pathEmbedsCmd = !hasCmd && /^[+-]/.test(path);
      if (pathEmbedsCmd) {
        
        // Http path beginning with "-" or "+" indicates a usage of the url path to specify the Hut
        // command; "-" indicates an "anon" request, and "+" indicates "sync"
        let char0 = path[0];
        msg.command = path.slice(1).replace(/[/]+/g, '.');
        msg.trn = { '+': 'sync', '-': 'anon' }[char0];
        
      } else {
        
        if (!hasCmd && path === 'favicon.ico') {
          
          Object.assign(msg, { command: 'hut:icon', trn: 'anon' });
          
        } else if (!hasCmd) {
          
          let { term='HUT' } = msg;
          Object.assign(msg, { command: 'hut:hutify', trn: 'sync', locus: {
            term,
            diveToken: token.dive(path.replace(/[/]+/g, '.'))
          }});
          
        }
        
        // "trn" defaults to "sync"; clients can save server effort by specifying "anon"
        if (!msg.has('trn')) msg.trn = 'sync';
        
      }
      
      // Unprefixed commands are interpreted towards the default Loft, according to the AboveHut
      if (!msg.command.has(':')) msg.command = `${this.aboveHut.getDefaultLoftPrefix()}:${msg.command}`;
      
      // These can't be confined to DEBUG blocks - must always detect malformatted remote queries!
      let { hid=null, trn } = msg;
      if (![ 'anon', 'sync', 'async' ].has(trn)) return comm.kill({ code: 400, msg: 'Api: invalid "trn"' });
      if (hid !== null && !isForm(hid, String))  return comm.kill({ code: 400, msg: 'Api: invalid "hid"' });
      if (hid === '')                            return comm.kill({ code: 400, msg: 'Api: invalid "hid"' });
      
      let { belowHut, road } = safe(
        () => this.aboveHut.getBelowHutAndRoad({ roadAuth: this, trn, hid, params: { belowNetAddr } }),
        err => { comm.kill({ err }); throw err.mod(msg => `Failed to get BelowHut and Road: ${msg}`); }
      );
      
      if ([ 'anon', 'sync' ].has(trn)) { // "anon" and "sync" are handled simply: without banking
        
        // This response must correspond to the request; request hangs until `reply` is called!
        
        /// {DEBUG= (TODO: I think you could argue this belongs under DEBUG??)
        let syncTimeout = setTimeout(() => {
          gsc.kid('error')(`Reply timed out... that's not good!`, { msg, roadAuth: this });
          comm.kill({ code: 500, msg: 'Api: sorry - experiencing issues' });
        }, 5 * 1000);
        /// =DEBUG}
        
        return this.aboveHut.Form.sendComm({
          src: belowHut, trg: this.aboveHut,
          ms, road,
          reply: msg => {
            /// {DEBUG=
            clearTimeout(syncTimeout);
            /// =DEBUG}
            comm.send(msg);
          },
          msg
        });
        
      }
      
      if (road.off()) return comm.destroy('Request received after Road ended');
      
      // If we made it here, this trn is "async" - the concept of "reply" breaks down here; the
      // request and response are independent; there is no rush to respond using `res`!
      this.aboveHut.hear({ src: belowHut, road, ms, msg });
      
      // If there's a pending Tell send it immediately using `res`!
      let pendingMsg = road.queueMsg.shift();
      if (pendingMsg) return comm.send(pendingMsg);
      
      // No immediate use for `res`; bank it! Note that if `res` closes for an unexpected reason we
      // need to unbank it (remove it from the queue). We use a "queued" flag to potentially avoid
      // the O(n) remove operation, as the "close" event always fires, but often `res` will have
      // already been unbanked!
      road.queueRes.add(Object.assign(comm, { queued: true }));
      let abortFn = () => res.queued && road.queueRes.rem(comm);
      req.once('close', abortFn);
      res.once('close', abortFn);
      
      // Don't hold too many Responses for this BelowHut
      while (road.queueRes.length > 1) { // TODO: Parameterize "maxBankedResponses"?
        let comm = Object.assign(road.queueRes.shift(), { queued: true });
        comm.kill({ code: 204, msg: '' });
      }
      
    },
    makeRoad(belowHut, params) { return (0, Form.HttpRoad)({ roadAuth: this, belowHut, ...params }); },
    
    $Comm: form({ name: 'HttpComm', has: { Tmp }, props: (forms, Form) => ({
      
      $precompressedMimes: Set([ 'image/png' ]), // TODO: Add more!
      
      init({ roadAuth, sc, ms, req, res }) {
        
        forms.Tmp.init.call(this);
        Object.assign(this, {
          roadAuth, sc: roadAuth.sc, ms, req, res,
          belowNetAddr: req.connection.remoteAddress,
          context: {
            id: Math.random().toString(36).slice(2),
            belowNetAddr: req.connection.remoteAddress,
            url: req.url,
            method: req.method.lower(),
            headers: req.headers
          },
          resultPrm: null,
          
          // We may have to remove `this` Comm from an Array, but we can avoid the O(n) operation
          // if it has already been removed; this boolean tracks the removal
          queued: false
        });
        
        this.resultPrm = this.processAndPopulate();
        this.resultPrm.finally(() => this.sc({ event: 'hear', ...this.context }));
        
      },
      
      kill({ code=null, headers=null, msg=null, err=null }) {
        
        if (code === null) code = err?.http?.code ?? 500;
        if (msg === null) msg = err?.http?.msg ?? (err.message.hasHead('Api: ') ? err.message : 'Api: sorry - experiencing issues');
        headers = { ...headers, ...err?.http?.headers };
        
        let errs = [];
        try { this.res.writeHead(code, headers); } catch (err) { err.suppress(); errs.push(err); }
        try { this.res.end(msg ?? skip);         } catch (err) { err.suppress(); errs.push(err); }
        
        this.sc(() => ({ event: 'kill', id: this.context.id, err, res: { code, headers, msg } }));
        
        if (errs.empty()) return;
        this.sc.kid('err')('Errors while killing response', {
          id: this.context.id,
          res: { code, headers, msg },
          errs: errs.map(err => {
          
            // Short output for premature stream closes (these simply mean the
            // response socket ended while the resource was streaming - so the
            // response is already sent, anyways!)
            if (err.code === 'ERR_STREAM_PREMATURE_CLOSE') return err.message;
            return err;
            
          })
        });
        
      },
      destroy(detail=null) {
        this.sc(() => ({ event: 'destroy', id: this.context.id, detail }));
        this.res.socket.destroy();
      },
      async send(msg) {
      
        // Translates arbitrary value `msg` into http content type and
        // payload. This is one of the few times Errors may be handled
        // without being thrown - passing an Error as `msg` indicates the
        // client has misused the http connection!
        
        if (msg === skip) return;
        
        let keep = null;
        if (hasForm(msg, Keep)) keep = msg;
        
        // These values determine headers
        let mime, cache;
        if      (keep)                        { mime = await keep.getContentType();       cache = 'private'; } // TODO: Can we determine that some Keeps are public?
        else if (msg === null)                { mime = 'application/json; charset=utf-8'; cache = null; msg = valToJson(msg); }
        else if (hasForm(msg, Object, Array)) { mime = 'application/json; charset=utf-8'; cache = null; msg = valToJson(msg); }
        else {
          
          // This is a non-json, non-Keep value. We assume it's a correct
          // response for the given request, and therefore we'll simply
          // pull the 1st most desirable requested response content-type
          // from the list defined in the "Accept" header.
          // Note an example "Accept" header may contain a value like:
          // "text/html, application/xml;q=0.9, image/webp, */*;q=0.8"
          // If we can't find a definitive content-type in this list (note
          // non-definitive items may look like "*/*", "*/html", "text/*",
          // etc) we'll simply use "application/octet-stream"
          let accept = this.req.headers.accept ?? '*/*';
          let [ t1='*', t2='*', modifiers=null ] = accept.split(',')[0].split(/[/;]/).map(v => v.trim() || skip);
          mime = (t1 !== '*' && t2 !== '*') ? `${t1}/${t2}; charset=utf-8` : 'application/octet-stream';
          msg = msg.toString(); // In case it's somehow a Boolean, Number, etc.
          
          // TODO: Should differentiate between private (user-specific) and
          // public values - for example, is `msg` an html response which
          // embeds the "sync" content for a specific user?? That had better
          // not go in a public cache! For now all caching is being marked
          // private, but it would be nice to enable public cache support!
          cache = 'private';
          
        }
        
        /// {DEBUG=
        if (!keep && ![ String, Buffer ].some(F => isForm(msg, F))) throw Error('Api: message must resolve to Keep, String, or Buffer');
        /// =DEBUG}
        
        // Only try to encode if the value isn't precompressed, there are
        // compression options available, and either the message is known
        // to be long enough to be worth compressing, or the message's
        // length isn't known (it's streamed)
        let encode = (() => {
          
          let { compression } = this.roadAuth;
          let tryEncode = compression.length && (keep || msg.length > 75) && !Form.precompressedMimes.has(mime);
          
          if (!tryEncode) return null;
          
          // If the payload isn't precompressed and compression options
          // are available, try to select a viable compression encoding
          // This takes the "Accept-Encoding" header into account:
          //    | deflate, gzip;q=1.0, *;q=0.5
          let encodings = this.req.headers['accept-encoding'] ?? [];
          if (isForm(encodings, String)) encodings = encodings.split(',').map(v => v.trim() || skip);
          
          // Format `encodings` to look like:
          //    | {
          //    |   'deflate': [],
          //    |   'gzip':    [ 'q=1.0' ],
          //    |   '*':       [ 'q=0.5' ]
          //    | }
          encodings = encodings.toObj(enc => {
            let [ name, ...modifiers ] = enc.split(';').map(v => v.trim() || skip);
            return [ name, modifiers ];
          });
          
          // Find a compression option supported by both us and the client
          let matchedEncoding = compression.find(v => encodings.has(v)).val;
          if (matchedEncoding) return matchedEncoding;
          
          if (encodings.has('*')) return compression[0];
          
          return null;
          
        })();
        
        // If `!!cache` use Cache-Control; `this.doCaching` determines if
        // the http resource gets cached or immediately expires
        // TODO: `cache` is always "private"! Consider how to propagate
        // information regarding the sensitivity of the given response
        // data to this point in the code; overall we want to be able to
        // apply "public" caching!
        // Cache revalidation: https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching#validation
        let resHeaders = {
          ...(encode ? { 'Content-Encoding': encode } : {}),
          'Content-Type': mime,
          'Cache-Control': (this.roadAuth.doCaching && cache) ? `${cache}, max-age=${this.roadAuth.getCacheSecs(msg)}` : 'max-age=0'
        };
        
        let timeout = setTimeout(() => {
          gsc.kid('error')('Stream timed out before reply');
          this.kill({ code: 500, msg: 'Api: sorry - experiencing issues' });
        }, 5000); // Stream needs to complete in 5000ms
        
        try {
          
          if (keep) {
            
            // `keep` gets piped to the response; it may be compressed
            
            let keepHeaders = { 'Content-Disposition': 'inline', ...resHeaders };
            this.res.writeHead(200, keepHeaders);
            
            let pipe = await keep.getTailPipe();
            if (encode) {
              
              let err = Error('trace');
              let encoder = zlib[`create${encode[0].upper()}${encode.slice(1)}`](); // Transforms, e.g., "delate", "gzip" into "createDeflate", "createGzip"
              await Promise( (g, b) => stream.pipeline(pipe, encoder, this.res, err => err ? b(err) : g()) )
                .fail(cause => err.propagate({ cause, msg: `Failed to stream ${keep.desc()}`, encode }));
              
            } else {
              
              pipe.pipe(this.res);
              
            }
            
            this.sc(() => ({ event: 'tell', id: this.context.id, res: { code: 200, headers: keepHeaders, encode, body: keep.desc() } }));
            
          } else {
            
            // TODO: Get NetAddr from `res.connection.remoteAddress` or `res.socket.remoteAddress`??
            
            // Encode if necessary
            let origMsg = msg;
            if (encode) msg = await Promise( (g, b) => zlib[encode](msg, (err, v) => err ? b(err) : g(v)) );
            
            let replyHeaders = { ...resHeaders, 'Content-Length': Buffer.byteLength(msg).toString(10) };
            this.res.writeHead(200, replyHeaders);
            this.res.end(msg);
            
            this.sc(() => ({ event: 'tell', id: this.context.id, res: { code: 200, headers: resHeaders, encode, body: origMsg } }));
          }
          
        } catch (err) {
          
          gsc({ err });
          
          err.suppress();
          this.kill({ err, code: 400, msg: 'Api: network misbehaviour' });
          
        } finally {
          
          clearTimeout(timeout);
          
        }
        
      },
      
      async processAndPopulate() {
        
        let { req, res } = this;
        
        // STEP 1: BODY
        
        let body = req.headers.at('x-hut-msg');
        if (!body) {
          
          let bodyPrm = Promise.later();
          let timeout = setTimeout(() => bodyPrm.reject(Error('Api: body too slow')), 2000);
          let chunks = [];
          let len = 0;
          let dataFn = null;
          let endFn = null;
          req.setEncoding('utf8');
          req.on('data', dataFn = chunk => {
            chunks.push(chunk);
            if ((len += chunk.length) > 5000) bodyPrm.reject(Error('Api: body too large'));
          });
          req.on('end', endFn = () => bodyPrm.resolve(chunks.join('')));
          
          try     { body = await bodyPrm; }
          finally { req.off('data', dataFn); req.off('end', endFn); clearTimeout(timeout); }
          
        }
        
        // Resolve `body` to json
        try         { body = body ? jsonToVal(body) : null; }
        catch (err) { throw err.mod({ msg: 'Api: malformed json', http: { code: 400 } }); }
        
        this.context.body = body;
        
        // STEP 2: COOKIE
        
        let cookie = req.headers.cookie
          ?.split(/,;/)                  // Acknowledge "," and ";" as delimiters
          ?.map(v => v.trim() || skip)   // Trim all items
          ?.toObj(item => item.cut('=')) // Treat values as "<key>=<val>"
          ?? {};
        
        let hutCookie;
        try {
          hutCookie = cookie.has('hut') ? jsonToVal(Buffer.from(cookie.hut, 'base64').toString('utf8')) : {};
        } catch (err) {
          throw err.mod({ msg: 'Api: malformed cookie', http: { headers: {
            'Set-Cookie': cookie.toArr((v, k) => `${k}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;`),
            'Location': '/'
          }}});
        }
        
        this.context.cookie = cookie;
        this.context.hutCookie = hutCookie;
        
        // STEP 3: URL
        
        // Note: browsers may not send the fragment to the server even if it shows in the url bar!
        // Need to slice leading "/" off path, leading "?" off query and leading "#" off fragment
        let [ , path, query='', fragment='' ] = req.url.match(/^([/][^?#]*)([?][^#]*)?([#].*)?$/);
        [ path, query, fragment ] = [ path, query, fragment ].map(v => v.slice(1));
        
        path = path.replace(/^[!][^/]+[/]?/, ''); // Ignore cache-busting component and up to 1 following slash
        query = query ? query.split('&').toObj(pc => [ ...pc.cut('='), true /* default key-only value to flag */ ]) : {};
        
        Object.assign(this.context, { path, query, fragment });
        
      }
      
    })}),
    
    $HttpRoad: form({ name: 'HttpRoad', has: { Road: RoadAuthority.Road }, props: (forms, Form) => ({
      init(args) {
        forms.Road.init.call(this, args);
        Object.assign(this, { queueRes: [], queueMsg: [] });
        denumerate(this, 'queueRes');
        
        this.endWith(() => {
          let comms = this.queueRes;
          this.queueRes = Array.stub;
          this.queueMsg = Array.stub;
          for (let comm of comms) {
            comm.queued = false;
            comm.kill({ code: 204, msg: '' });
          }
        });
      },
      currentCost() { return this.queueRes.length ? 0.5 : 1; },
      tellAfar(msg) {
        let comm = this.queueRes.shift();
        if (!comm) { this.queueMsg.push(msg); return; }
        
        comm.queued = false;
        comm.send(msg);
      }
    })})
    
  })});
  
});
