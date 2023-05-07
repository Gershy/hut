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

require('../room/setup/clearing/clearing.js');

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

module.exports = ({ secure, netAddr, port, compression=[], ...opts }) => {
  
  if (!isForm(compression, Array)) throw Error(`Api: compression should be Array; got ${getFormName(compression)}`);
  
  let { subcon=Function.stub, errSubcon=Function.stub } = opts;
  let { doCaching=true } = opts;
  let { getKeyedMessage } = opts;
  let { getCacheSecs=v=>(60 * 60 * 24 * 5) } = opts; // Cache for 5 days by default
  if (!getKeyedMessage) throw Error(String.baseline(`
    | Must provide "getKeyedMessage"
    | It must be a function like: ({ headers, path, query, fragment, cookie, body }) => ({ key, msg })
    | 
    | - "headers" are http headers
    | - "path" is the url path (excluding the "/" prefix)
    | - "query" is an Object representing the query
    | - "fragment" is the path fragment (excluding the "#" prefix)
    | - "cookie" is an Object with cookie keys pointing to raw cookie values
    | - "body" is the http body given as a String
    | - "key" is the session identifier String for the given request
    | - "msg" is the resulting payload
    | 
    | This function can also throw Errors - any Error thrown with an "http" property defines an Error that should propagate back to the client (e.g. to inform them of their misbehaviour).
    | Any Errors lacking an "http" property are assumed to indicate client "confusion" (as distinct from "misbehaviour"), and will prompt the client to reset its state (e.g. clear headers), and reattempt the request.
  `));
  
  let makeHttpSession = (key, req) => {
    
    let session = Tmp({
      
      key,
      desc: () => `HttpSession(http${secure ? 's' : ''}://${netAddr}:${port} / ${key})`,
      currentCost: () => session.queueRes.length ? 0.5 : 0.75,
      netAddr: req.connection.remoteAddress,
      
      queueRes: [],
      queueMsg: [],
      
      hear: Src(),
      tell: Src()
      
    });
    
    // Always end anon Sessions eventually
    if (session.key === null) setTimeout(() => session.end(), 10000);
    
    // Trying to send a Message with the Session either uses a queued
    // Response Object to send the message immediately, or queues the
    // Message, waiting for a Response to become available
    session.tell.route(msg => {
      let pkg = session.queueRes.shift();
      if (pkg) { pkg.used = true; respond(pkg, msg); }
      else     { session.queueMsg.push(msg); }
    }, 'prm');
    
    session.endWith(() => {
      for (let pkg of session.queueRes) { pkg.used = true; forceEnd(pkg.res, {}, 204); }
      session.queueRes = Array.stub;
      session.queueMsg = Array.stub;
    });
    
    return session;
    
  };
  let respond = async ({ headers: reqHeaders, res }, msg) => {
    
    // Translates arbitrary value `msg` into http content type and
    // payload. This is one of the few times Errors may be handled
    // without being thrown, as passing an Error as a message
    // indicates the client has misused the http connection.
    
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
    let tryEncode = compression.length && (keep || msg.length > 75) && !precompressedMimes.has(mime);
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
        || compression.find(v => encodings.has(v)).val
        || (encodings.has('*') && compression[0]);
      if (validEncoding) encode = compression[0];
      
    }
    
    // If `cache` set Cache-Control; `opts.doCaching` determines if the
    // http resource either lasts for some time or immediately expires
    // TODO: `cache` is always "private"! Consider how to propagate the
    // information regarding the sensitivity of the given response data
    // to this point in the code; overall we want to be able to do
    // "public" caching!
    // Cache revalidation (it's all about 304 responses): https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching#validation
    let resHeaders = {
      ...(encode ? { 'Content-Encoding': encode } : {}),
      'Content-Type': mime,
      'Cache-Control': (opts.doCaching && cache) ? `${cache}, max-age=${getCacheSecs(msg)}` : 'max-age=0'
    };
    
    res.explicitBody = { body: keep ?? msg, encode }; // Use the "explicitBody" property to make values clearer in subcon
    
    let timeout = setTimeout(() => {
      errSubcon(`Ending response destructively because response data was not ready in time`);
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
      errSubcon(`Failed to respond with ${getFormName(keep ?? msg)}: ${keep ? keep.desc() : (msg?.slice?.(0, 100) ?? msg)}`, err);
      forceEnd(res, {}, 400, 'Invalid request');
      
    } finally {
      
      clearTimeout(timeout);
      
    }
    
  };
  let forceEnd = (res, headers={}, code=400, body=null) => {
    
    let errs = [];
    try { res.writeHead(code, headers); } catch (err) { err.suppress(); errs.push(err); }
    try { res.end(body ?? skip);        } catch (err) { err.suppress(); errs.push(err); }
    
    if (errs.empty()) return;
    errSubcon(`Errors occurred trying to end response (with code ${code})`, ...errs.map(err => {
      
      // Short output for premature stream closes (these simply mean the
      // response socket ended while the resource was streaming - so the
      // response is already sent, anyways!)
      if (err.code === 'ERR_STREAM_PREMATURE_CLOSE') return err.message;
      return err;
      
    }));
    
  };
  
  let serverOpen = async (security=null, adjacentServerPrms={}) => {
    
    // - `security` is `{ prv, crt }` or `null`
    // - `adjacentServerPrms` looks like `{ [protocolName]: Promise }`
    //   where each Promise represents the opening of another Server on
    //   the same port (resolves when the adjacent Server has begun
    //   listening; resolves to that Server Object)
    
    if (secure && !security) throw Error(`Secure server https://${netAddr}:${port} requires "security" param`);
    if (!secure && security) throw Error(`Unsafe server http://${netAddr}:${port} should not receive "security" param`);
    
    if (tmp.off()) return;
    if (tmp.server) return;
    
    let sessions = Map();
    
    mmm('servers', +1);
    
    tmp.closing = false;
    tmp.sockets = Set();
    tmp.server = require(security ? 'https' : 'http').createServer({
      
      maxHeaderSize: 4096,      // Note: typical value is 16384 (2^14)
      noDelay: true,            // Buffer multiple packets under the same header? (Disables Nagel's algorithm)
      
      ...(security ? {
        
        requestCert: false,       // Don't verify client identities (allow public access)
        rejectUnauthorized: true, // If "requestCert" is enabled, reject clients if their cert is invalid
        
        // These values securely identify our server ownership
        key: security.prv,
        cert: security.crt
        
      } : {})
      
    });
    
    tmp.server.on('connection', socket => {
      if (tmp.closing) return socket.destroy();
      tmp.sockets.add(socket);
      socket.once('close', () => tmp.sockets.rem(socket));
    });
    tmp.server.on('request', async (req, res) => {
      
      // Note that only 1 of "upgrade" and "request" will be triggered
      // for a given `req`!
      
      let ms = getMs();
      
      // Consume http request body
      let body = null;
      {
        
        let bodyPrm = Promise.later();
        let timeout = setTimeout(() => bodyPrm.reject(Error('Http payload too slow')), 2000);
        let chunks = [];
        let len = 0;
        let dataFn = null;
        let endFn = null;
        req.setEncoding('utf8');
        req.on('data', dataFn = chunk => {
          chunks.push(chunk);
          if ((len += chunk.length) > 5000) bodyPrm.reject(Error('Http payload too large'));
        });
        req.on('end', endFn = () => bodyPrm.resolve(chunks.join('')));
        
        try { body = await bodyPrm; }
        catch (err) { forceEnd(res, {}, 400, err.message); }
        finally {
          req.off('data', dataFn);
          req.off('end', endFn);
          clearTimeout(timeout);
        }
        
      }
      
      if (subcon.enabled) {
        
        if ([ 'synced', 'error' ].has(subcon.mode)) {
          
          res.explicitBody = null;
          
          let orig = res.end;
          res.end = (...args) => {
            
            let { body: resBody='', encode='unencoded' } = res.explicitBody ?? { body: args[0] };
            delete res.explicitBody;
            
            subcon({
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
          
        } else {
          
          subcon({
            type: 'req',
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
            
            subcon({
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
        
      }
      
      if (tmp.closing) return forceEnd(res, {}, 500);
      for (let intercept of tmp.intercepts) if (intercept(req.gain({ body }), res)) return;
      
      let headers = req.headers;
      let cookie = headers.cookie
        ?.split(';')
        ?.map(v => v.trim() || skip)
        ?.toObj(item => item.cut('=') /* Naturally produces [ key, value ] */)
        ?? {};
      let cookieKeys = cookie.toArr((v, k) => k);
      
      let [ , path, query='', fragment='' ] = req.url.match(/^([/][^?#]*)([?][^#]+)?([#].*)?$/);
      path = path.slice(1).replace(/^[!][^/]+[/]*/, ''); // Ignore cache-busting component and leading slashes
      query = query ? query.slice(1).split('&').toObj(pc => [ ...pc.cut('='), true /* default key-only value to flag */ ]) : {};
      fragment = fragment.slice(1);
      
      // Note `keyedMsg` must be `{ key, msg }`, where `key` is `null`
      // (for anon) or a String identifying the session
      let keyedMsg = null;
      try { keyedMsg = await getKeyedMessage({ headers, path, query, fragment, cookie, body }); }
      catch (err) {
        errSubcon('Error getting http KeyedMessage', err);
        let { code=400, headers={}, msg=err.message } = err.has('http') ? err.http : { msg: 'Bad Request' };
        return forceEnd(res, headers, code, msg);
      }
      path = query = fragment = cookie = cookieKeys = body = null;
      
      let session = null;
      if (keyedMsg.key === null) { // Make an anonymous Session
        
        session = makeHttpSession(null, req);
        tmp.endWith(session, 'tmp');
        tmp.src.send(session);
        
      } else if (isForm(keyedMsg.key, String)) {                     // Reuse or create an identity Session
        
        session = sessions.get(keyedMsg.key);
        if (!session) {
          session = makeHttpSession(keyedMsg.key, req);
          sessions.add(session.key, session);
          session.endWith(() => sessions.rem(session.key));
          tmp.src.send(session);
        }
        
        if (session.netAddr !== req.connection.remoteAddress) {
          errSubcon(() => `Session "${session.key}" uses NetworkAddress "${session.netAddr}" but also keyed by "${req.connection.remoteAddress}"`);
          res.socket.destroy();
          session.end(); // Session probably isn't safe to use anymore...
          return;
        }
        
      } else {
        
        throw Error(`Api: KeyedMessage key must be null or String; got ${keyedMsg.key}`);
        
      }
      
      if (session.off()) return res.socket.destroy(); // forceEnd(res, {}, 204);
      
      let replyPrm = null;
      let replyable = () => {
        let timeout = setTimeout(() => replyPrm.reject(Error('Timeout').mod({ keyedMsg })), 10 * 1000); // 10sec is v generous
        replyPrm = Promise.later();
        replyPrm.then(() => clearTimeout(timeout));
        replyPrm.fail(err => (session.end(), err.propagate()));
        return msg => {
          replyPrm.resolve();
          respond({ keyedMsg, headers, res }, msg);
          if (session.key === null) session.end(); // Anonymous Sessions end immediately after the 1st (only) reply
        };
      };
      session.hear.send({ replyable, ms, msg: keyedMsg.msg });
      
      // Ensure anonymous Sessions called `replyable` synchronously
      if (replyPrm === null && session.key === null) {
        session.end();
        throw Error('No intention to Reply to anonymous Session (failed to immediately call "replyable")').mod({ keyedMsg });
      }
      
      // If `replyable` was called allow the response to be delivered
      // via the `reply` function!
      if (replyPrm !== null) return;
      
      // If we're here it means we need to handle a Request that won't
      // receive a linked Reply - for Requests like this we'll either
      // send a Tell that has been pending, or if there is no such Tell
      // pending, we'll hold onto the Response to use it later!
        
      let msg = session.queueMsg.shift();
      
      // If there's a pending Tell send it immediately using `res`!
      if (msg) return respond({ keyedMsg, headers, res }, msg);
      
      // Need to queue `res`, and unqueue it if it ends!
      let pkg = { used: false, headers, res };
      session.queueRes.add(pkg);
      
      // Note that `pkg.used` indicates `pkg` was already unqueued!
      let abortFn = () => pkg.used || session.queueRes.rem(pkg);
      req.once('close', abortFn);
      res.once('close', abortFn);
      
      // Don't hold too many Responses for this Session
      while (session.queueRes.length > 1) { // TODO: Parameterize "maxBankedResponses"?
        let pkg = session.queueRes.shift();
        pkg.used = true;
        forceEnd(pkg.res, {}, 204);
      }
      
    });
    
    // Wait for the server to start listening
    await Promise((rsv, rjc) => {
      tmp.server.once('listening', rsv);
      tmp.server.once('error', rjc);
      tmp.server.listen(port, netAddr);
    });
        
  };
  let serverShut = async () => {
    
    let server = tmp.server;
    if (!server) return;
    tmp.server = null;
    
    tmp.closing = true;
    for (let socket of tmp.sockets || []) socket.destroy();
    tmp.sockets = null;
    
    mmm('servers', -1);
    await Promise((rsv, rjc) => server.close(err => err ? rjc(err) : rsv()));
    
  };
  
  let tmp = Tmp({
    desc: () => `http${secure ? 's' : ''}://${netAddr}:${port}`,
    secure, protocol: 'http', netAddr, port,
    serverOpen, serverShut,
    intercepts: [],
    subcon, // soktServer.js may use this for output
    src: Src(), // Sends `session` Objects
    server: null,
    closing: false,
    sockets: null
  });
  tmp.endWith(() => serverShut());
  return tmp;
  
};
