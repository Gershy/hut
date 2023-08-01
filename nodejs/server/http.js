'use strict';

// GOALS:
// - Support functionality from FoundationNodejs BUT ALSO:
// - Allow server destruction/restart (to allow live cert updates)
// - Support sokt+http on the same port

// - There should always be a NetworkIdentity, secure or unsafe!
// - NetworkIdentity should be provided list of all Servers, and then be
//   told to initialize. This will allow it to disable only the port 80
//   server when performing ACME. It may also make it easier to run ws
//   on same port as http, and have an http server which redirects to
//   https
// - Deal with discrepancies between NetworkIdentity Details and Keep data (take hash to ensure consistency??)
// - Provide all Servers to NetworkIdentity

// TODO: For `res.writeHead(...)`, consider Keep-Alive
// e.g. 'Keep-Alive: timeout=5, max=100'

require('../../room/setup/clearing/clearing.js');

let zlib = require('zlib');
let stream = require('stream');

let precompressedMimes = Set([ 'image/png' ]); // TODO: Add more!
let httpResponseCodes = Object.plain({
  200: 'Ok',
  201: 'Created',
  202: 'Accepted',
  204: 'No Content',
  302: 'Found',
  400: 'Bad Request',
  500: 'Internal Server Error'
});

// TODO: Note this isn't being run - although it's the better approach!
// As long as refactoring this, fix Comms!!
//    | { hid: 'anHid', trn: 'someTrn', command: 'myCommand', ...args }
// should become
//    | { hid: '...', trn: '...', command: '...', args: { ... } }
module.exports = (async () => {
  
  let RoadAuthority = await getRoom('setup.hut.hinterland.RoadAuthority');
  let { Hut } = await getRoom('setup.hut');
  
  let HttpRoadAuthority = form({ name: 'HttpRoadAuthority', has: { RoadAuthority }, props: (forms, Form) => ({
    
    init({ doCaching=true, getCacheSecs=msg=>(60 * 60 * 24 * 5), ...args }) {
      
      forms.RoadAuthority.init.call(this, { protocol: 'http', ...args });
      Object.assign(this, { doCaching, getCacheSecs, intercepts: [] });
      
    },
    
    createRoad(belowHut) { return (0, Form.HttpRoad)({ authority: this, belowHut }); },
    activate() {
      // Run the server, make it call `hearComm` as necessary. Note that
      // stupidly, the old above implementation passes the https cert
      // data to `serverOpen`, not to the actual constructor!! This will
      // need to change when using RoadAuthority!
      
      let tmp = Tmp();
      tmp.prm = (async () => {
        let server = require(this.getProtocol()).createServer({ /* TODO */ });
        
        let sockets = Set();
        let reqFn = this.processIncomingHttp.bind(this);
        let conFn = socket => {
          sockets.add(socket);
          socket.once('close', () => sockets.rem(socket));
        };
        
        server.on('connection', conFn);
        server.on('request', reqFn);
        tmp.endWith(() => {
          // Fail requests after the server is ended
          server.off('request', reqFn);
          server.on('request', res => this.killRes({ res, code: 500, msg: 'Server ended' }));
          
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
        
        return server;
        
      })();
      
      return tmp;
      
    },
    receivedRequestSc(req, body) {
      
      // TODO: Drift! This needs testing
      
      let { chatter, mode } = this.sc.params();
      if (!chatter) return;
      
      if (mode === 'synced') {
        
        res.explicitBody = null;
        
        let orig = res.end;
        res.end = (...args) => {
          
          let { body: resBody='', encode='unencoded' } = res.explicitBody ?? { body: args[0] };
          delete res.explicitBody;
          
          this.sc({
            type: 'synced',
            req: {
              version: req.httpVersion,
              method: req.method,
              url: req.url,
              headers: req.headers.map(v => isForm(v, Array) ? v : [ v ]),
              body
            },
            res: {
              code: res.statusCode,
              status: httpResponseCodes[res.statusCode] || `'Response ${data.code}`,
              version: req.httpVersion, // TODO: Is this necessarily the right version?
              headers: { ...res.getHeaders() }, // `res.getHeaders()` is a plain Object
              encode,
              body: resBody
            }
          });
          
          return orig.call(res, ...args);
          
        };
        
      } else if (mode === 'immediate') {
        
        this.sc({
          type: 'immediate',
          version: req.httpVersion,
          method: req.method,
          url: req.url,
          headers: req.headers.map(v => isForm(v, Array) ? v : [ v ]),
          body
        });
        
        res.explicitBody = null;
        
        let orig = res.end;
        res.end = (...args) => {
          
          let { body='', encode='unencoded' } = res.explicitBody ?? { body: args[0] };
          delete res.explicitBody;
          
          this.sc({
            type: 'res',
            code: res.statusCode,
            status: httpResponseCodes[res.statusCode] || `'Response ${data.code}`,
            version: req.httpVersion, // TODO: Is this necessarily the right version?
            headers: { ...res.getHeaders() }, // `res.getHeaders()` is a plain Object
            encode,
            body
          });
          
          return orig.call(res, ...args);
          
        };
        
      }
        
    },
    async processIncomingHttp(req, res) {
      
      let ms = getMs();
      
      let body = req.body = await (async () => {
        
        let bodyPrm = Promise.later();
        let timeout = setTimeout(() => bodyPrm.reject(Error('Api: payload too slow')), 2000);
        let chunks = [];
        let len = 0;
        let dataFn = null;
        let endFn = null;
        req.setEncoding('utf8');
        req.on('data', dataFn = chunk => {
          chunks.push(chunk);
          if ((len += chunk.length) > 5000) bodyPrm.reject(Error('Api: payload too large'));
        });
        req.on('end', endFn = () => bodyPrm.resolve(chunks.join('')));
        
        try         { return await bodyPrm; }
        catch (err) { this.killRes({ res, code: 400, msg: err.message }); }
        finally     { req.off('data', dataFn); req.off('end', endFn); clearTimeout(timeout); }
        
      })();
      
      this.receivedRequestSc(req, body);
      
      for (let intercept of this.intercepts) if (intercept(req, res)) return;
      
      let reqHeaders = req.headers;
      let cookie = reqHeaders.cookie
        ?.split(';')
        ?.map(v => v.trim() || skip)
        ?.toObj(item => item.cut('=') /* Naturally produces [ key, value ] */)
        ?? {};
      let cookieKeys = cookie.toArr((v, k) => k);
      
      let [ , path, query='', fragment='' ] = req.url.match(/^([/][^?#]*)([?][^#]+)?([#].*)?$/);
      path = path.slice(1).replace(/^[!][^/]+[/]*/, ''); // Ignore cache-busting component and leading slashes
      query = query ? query.slice(1).split('&').toObj(pc => [ ...pc.cut('='), true /* default key-only value to flag */ ]) : {};
      fragment = fragment.slice(1);
      
      // - Compile the full `msg`
      // - `msg.trn` defaults to "anon"
      // - if `msg.command === 'hutify'`, `msg.trn` is set to "sync"
      let msg = {
        hid: null, command: path || 'hutify', trn: 'anon',
        path, fragment,
        ...query, ...cookie, ...body
      };
      if (msg.command === 'hutify') msg.trn = 'sync';
      
      // These can't be confined to DEBUG blocks - Server must always be
      // wary of malformatted remote queries!
      let { hid=null, command, trn } = msg;
      if (!/^(?:anon|sync|async)$/.test(trn))   return this.killRes({ res, code: 400, msg: 'invalid "trn"' });
      if (hid === '')                           return this.killRes({ res, code: 400, msg: '"hid" may not be an empty string' });
      if (hid !== null && !isForm(hid, String)) return this.killRes({ res, code: 400, msg: 'invalid "hid"' });
      
      let { belowHut, road } = this.aboveHut.getBelowHut({ authority: this, trn, hid });
      if ([ 'anon', 'sync' ].has(trn)) { // "anon" and "sync" are simple to handle
        
        // `trn` is "sync" (or "anon", implying "sync") - the reply must
        // correspond to the request; hangs until `reply` is called!
        
        /// {DEBUG= (I think you could argue this belongs under DEBUG)
        let syncTimeout = setTimeout(() => {
          this.sc(`Reply timed out... that's not good!`, { msg });
          this.killRes({ res, code: 500, msg: 'We messed up and timed out... sorry!' });
        }, 5 * 1000);
        /// =DEBUG}
        
        return Hut.sendComm({
          src: belowHut,
          trg: this.aboveHut,
          ms,
          road,
          reply: msg => {
            /// {DEBUG=
            clearTimeout(syncTimeout);
            /// =DEBUG}
            this.sendRes({ res, reqHeaders, msg });
          },
          msg
        });
        
      }
      
      if (road.off()) return res.socket.destroy();
      
      // If we made it here, this trn is "async" - the concept of
      // "reply" breaks down here; the request and response are
      // independent; there is no rush to respond via `res`!
      this.aboveHut.hear({ src: belowHut, road, ms, msg });
      
      // If there's a pending Tell send it immediately using `res`!
      let pendingMsg = road.queueMsg.shift();
      if (pendingMsg) return this.sendRes({ res, reqHeaders, msg: pendingMsg });
      
      // No immediate use for `res`; bank it! Note that if `res` closes
      // for an unexpected reason, we need to unbank it (remove it from
      // the queue). We use a "unqueued" flag to potentially
      // avoid the O(n) remove operation, as the "close" event always
      // fires, but often `res` will have already been unbanked!
      road.queueRes.add(Object.assign(res, { unqueued: false, reqHeaders }));
      let abortFn = () => res.unqueued || road.queueRes.rem(res);
      req.once('close', abortFn);
      res.once('close', abortFn);
      
      // Don't hold too many Responses for this BelowHut
      while (road.queueRes.length > 1) { // TODO: Parameterize "maxBankedResponses"?
        let res = Object.assign(road.queueRes.shift(), { unqueued: true });
        this.killRes({ res, code: 204 });
      }
      
    },
    async sendRes({ res, reqHeaders, msg }) {
      
      // Translates arbitrary value `msg` into http content type and
      // payload. This is one of the few times Errors may be handled
      // without being thrown - passing an Error as `msg` indicates the
      // client has misused the http connection!
      
      /// {ASSERT=
      if (getFormName(res) !== 'ServerResponse') throw Error('HHJjggjjOoowww');
      /// =ASSERT}
      
      if (msg === skip) return;
      
      // Resolve Errors to 400 responses
      let code = 200;
      if (hasForm(msg, Error)) {
        code = 400;
        let e = msg.has('e') ? msg.e : msg.message.replace(/^[a-zA-Z0-9]/g, '');
        msg = { command: 'error', msg: msg.message, e };
      }
      
      let keep = null;
      if (hasForm(msg, Keep)) keep = msg;
      
      // These values determine headers
      let mime;
      let cache;
      
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
        let accept = reqHeaders.accept ?? '*/*';
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
      if (!keep && ![ String, Buffer ].has(msg?.constructor)) throw Error(`Message must resolve to Keep, String, or Buffer`);
      /// =DEBUG}
      
      // Only try to encode if the value isn't precompressed, there are
      // compression options available, and either the message is known
      // to be long enough to be worth compressing, or the message's
      // length isn't known (it's streamed)
      let encode = null;
      let tryEncode = this.compression.length && (keep || msg.length > 75) && !precompressedMimes.has(mime);
      if (tryEncode) {
        
        // If the payload isn't precompressed and compression options
        // are available, try to select a viable compression encoding
        // This takes the "Accept-Encoding" header into account:
        //    | deflate, gzip;q=1.0, *;q=0.5
        let encodings = reqHeaders['accept-encoding'] ?? [];
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
        let validEncoding = null
          || this.compression.find(v => encodings.has(v)).val
          || (encodings.has('*') && this.compression[0]);
        if (validEncoding) encode = this.compression[0];
        
      }
      
      // If `!!cache` use Cache-Control; `this.doCaching` determines if
      // the http resource gets cached or immediately expires
      // TODO: `cache` is always "private"! Consider how to propagate
      // information regarding the sensitivity of the given response
      // data to this point in the code; overall we want to be able to
      // apply "public" caching!
      // Cache revalidation (it's all about 304 responses): https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching#validation
      let resHeaders = {
        ...(encode ? { 'Content-Encoding': encode } : {}),
        'Content-Type': mime,
        'Cache-Control': (this.doCaching && cache) ? `${cache}, max-age=${this.getCacheSecs(msg)}` : 'max-age=0'
      };
      
      res.explicitBody = { body: keep ?? msg, encode }; // Use the "explicitBody" property to make values clearer in subcon
      
      let timeout = setTimeout(() => {
        this.sc(`Ending response destructively because response data was not ready in time`);
        res.end();
      }, 5000); // Stream needs to complete in 5000ms
      
      try {
        
        if (keep) {
          
          res.writeHead(code, resHeaders);
          
          let pipe = await keep.getTailPipe();
          if (encode) {
            
            let err = Error('trace');
            let encoder = zlib[`create${encode[0].upper()}${encode.slice(1)}`](); // Transforms, e.g., "delate", "gzip" into "createDeflate", "createGzip"
            await Promise( (g, b) => stream.pipeline(pipe, encoder, res, err => err ? b(err) : g()) )
              .fail(cause => err.propagate({ cause, msg: `Failed to stream ${keep.desc()}`, encode }));
            
          } else {
            
            pipe.pipe(res);
            
          }
          
          clearTimeout(timeout);
          
        } else {
          
          // Encode if necessary
          if (encode) msg = await Promise( (g, b) => zlib[encode](msg, (err, v) => err ? b(err) : g(v)) );
          res.writeHead(code, { ...resHeaders, 'Content-Length': Buffer.byteLength(msg).toString(10) });
          res.end(msg);
          
        }
        
      } catch (err) {
        
        err.suppress();
        this.sc(`Failed to respond with ${getFormName(keep ?? msg)}: ${keep ? keep.desc() : (msg?.slice?.(0, 100) ?? msg)}`, err);
        this.killRes({ res, code: 400, msg: 'Network misbehaviour' });
        
      } finally {
        
        clearTimeout(timeout);
        
      }
      
    },
    async killRes({ res, code, msg=null, resHeaders={} }) {
      
      let errs = [];
      try { res.writeHead(code, resHeaders); } catch (err) { err.suppress(); errs.push(err); }
      try { res.end(msg ?? skip);            } catch (err) { err.suppress(); errs.push(err); }
      
      if (errs.empty()) return;
      this.sc(`Errors occurred trying to end response (with code ${code})`, ...errs.map(err => {
        
        // Short output for premature stream closes (these simply mean the
        // response socket ended while the resource was streaming - so the
        // response is already sent, anyways!)
        if (err.code === 'ERR_STREAM_PREMATURE_CLOSE') return err.message;
        return err;
        
      }));
      
    },
    
    $HttpRoad: form({ name: 'HttpRoad', has: { Road: RoadAuthority.Road }, props: (forms, Form) => ({
      init(args) {
        forms.Road.init.call(this, args);
        Object.assign(this, { queueRes: [], queueMsg: [] });
        
        this.endWith(() => {
          let resArr = this.queueRes;
          this.queueRes = Array.stub;
          this.queueMsg = Array.stub;
          for (let res of resArr) {
            res.unqueued = true;
            this.authority.killRes({ res, code: 204 });
          }
        });
      },
      currentCost() { return this.queueRes.length ? 0.5 : 0.75; },
      tellAfar(msg) {
        let res = this.queueRes.shift();
        if (!res) { this.queueMsg.push(msg); return; }
        
        pkg.unqueued = true;
        this.authority.sendRes({ res, reqHeaders: res.reqHeaders, msg });
      }
    })})
    
  })});
  
  return { HttpRoadAuthority };
  
})();
