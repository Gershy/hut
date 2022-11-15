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

require('../clearing.js');

let zlib = require('zlib');
let stream = require('stream');

let precompressedMimes = Set([ 'image/png' ]); // TODO: Add more!
let httpResponseCodes = Object.plain({
  200: 'Ok',
  201: 'Created',
  202: 'Accepted',
  302: 'Found',
  400: 'Bad Request',
  500: 'Internal Server Error'
});

module.exports = ({ secure, netAddr, port, compression=[], ...opts }) => {
  
  let { subcon=Function.stub, errSubcon=Function.stub } = opts;
  let { heartbeatMs=60 * 1000, doCaching=true } = opts;
  let { msFn=Date.now, processCookie=Function.stub, processBody=Function.stub, getKeyedMessage } = opts;
  let { getCacheSecs=v=>(60 * 60 * 24 * 5) } = opts; // Cache for 5 days by default
  if (!getKeyedMessage) throw Error(String.baseline(`
    | Must provide "getKeyedMessage"
    | It must be a function like: ({ path, query, fragment, cookie, body }) => ({ key, msg })
    | 
    | - "path" is the url path (excluding the "/" prefix)
    | - "query" is an Object representing the query
    | - "fragment" is the path fragment (excluding the "#" prefix)
    | - "cookie" is the result of "processCookie" (or the plain cookie, as a String)
    | - "body" is the result of "processBody" (or the plain Body, as a String)
    | 
    | - "key" is the session identifier String for the given request
    | - "msg" is the resulting payload 
  `));
  
  let makeHttpSession = (key, req) => {
    
    //let session = HttpSession({ key, req });

    let session = Tmp({
      
      key,
      currentCost: () => session.queueRes.length ? 0.5 : 0.75,
      
      timeout: null,
      knownNetAddrs: req ? Set([ req.connection.remoteAddress ]) : Set(),
      
      queueRes: [],
      queueMsg: [],
      
      hear: Src(),
      tell: Src()
      
    });
    
    // Messages from the Client reset the heartbeat
    if (session.key !== null) session.hear.route(() => {
      clearTimeout(session.timeout);
      session.timeout = setTimeout(() => session.end(), heartbeatMs);
    }, 'prm');
    
    // Trying to send a Message with the Session either uses a queued
    // Response Object to send the message immediately, or queues the
    // Message, waiting for a Response to become available
    session.tell.route(msg => {
      let pkg = session.queueRes.shift();
      if (pkg) { pkg.used = true; respond(pkg, msg); }
      else     { session.queueMsg.push(msg); }
    }, 'prm');
    
    mmm('httpSessions', +1);
    session.endWith(() => {
      mmm('httpSessions', -1);
      for (let pkg of session.queueRes) { pkg.used = true; pkg.res.writeHead(400).end(); }
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
    if (hasForm(msg, Error)) [ code, msg ] = [ 400, { command: 'error', msg: msg.message } ];
    
    let keep = null;
    if (hasForm(msg, Keep)) keep = msg;
    
    // These values determine headers
    let mime = null;
    let cache = null;
    let encode = null;
    
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
    // http resource either lasts for 5 days, or immediately expires
    // TODO: `cache` is always "private"! Consider how to propagate the
    // information regarding the sensitivity of the given response data
    // to this point in the code; overall we want to be able to do
    // "public" caching!
    // Cache revalidation (it's all about 304 responses): https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching#validation
    let resHeaders = {
      ...(encode ? { 'Content-Encoding': encode } : {}),
      'Content-Type': mime,
      ...(cache ? { 'Cache-Control': opts.doCaching ? `${cache}, max-age=${getCacheSecs(msg)}` : 'max-age=0' } : {})
    };
    
    res.explicitBody = { body: keep ?? msg, encode };
    
    try {
      
      if (keep) {
        
        res.writeHead(code, resHeaders);
        
        let pipe = await keep.getTailPipe();
        if (encode) {
          
          let encoder = zlib[`create${encode[0].upper()}${encode.slice(1)}`](); // Transforms, e.g., "delate", "gzip" into "createDeflate", "createGzip"
          await Promise( (g, b) => stream.pipeline(pipe, encoder, res, err => err ? b(err) : g()) )
            .fail(err => {
              errSubcon(`Error piping ${keep.desc()} to Response`, err);
              res.end();
              err.propagate(msg => ({ msg: `Failed to stream ${keep.desc()} (${msg})`, encode }));
            });
          
        } else {
          
          pipe.pipe(res);
          
        }
        
      } else {
        
        if (encode) msg = await Promise( (g, b) => zlib[encode](msg, (err, v) => err ? b(err) : g(v)) );
        res.writeHead(code, { ...resHeaders, 'Content-Length': Buffer.byteLength(msg).toString(10) });
        res.end(msg);
        
      }
      
    } catch (err) {
      
      errSubcon(`Failed to respond with ${getFormName(keep ?? msg)}: ${keep ? keep.desc() : msg?.slice?.(0, 100)}`);
      try { res.writeHead(500); } catch (err) {}
      try { res.end(); } catch (err) {}
      
    }
    
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
      
      let ms = msFn();
      
      let body = await new Promise((rsv, rjc) => {
        let chunks = [];
        req.setEncoding('utf8');
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', () => rsv(chunks.join('')));
        req.on('error', ctxErr => rjc(Error(`Client abandoned http session`).mod({ ctxErr })));
      });
      
      if (subcon.enabled) {
        
        if ([ 'synced', 'error' ].has(subcon.mode)) {
          
          let orig = res.end;
          res.explicitBody = null;
          res.end = (...args) => {
            
            let { body: resBody='', encode='unencoded' } = res.explicitBody ?? { body: args[0] };
            
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
          let orig = res.end;
          res.explicitBody = null;
          res.end = (...args) => {
            
            let { body='', encode='unencoded' } = res.explicitBody ?? { body: args[0] };
            
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
      
      if (tmp.closing) return res.writeHead(500).end();
      for (let intercept of tmp.intercepts) if (intercept(req.gain({ body }), res)) return;
      
      try         { body = processBody(body); }
      catch (err) { errSubcon('Error processing http body', err); return res.writeHead(400).end('Invalid body'); }
      
      let headers = req.headers;
      let cookie = headers.cookie
        ?.split(';')
        ?.map(v => v.trim() || skip)
        ?.toObj(item => item.cut('=') /* Naturally produces [ key, value ] */)
        ?? {};
      let cookieKeys = cookie.toArr((v, k) => k);
      try         { cookie = processCookie(cookie); }
      catch (err) { errSubcon('Error processing http cookie', err); return res.writeHead(400).end('Invalid cookie'); }
      
      let [ , path, query='', fragment='' ] = req.url.match(/^([/][^?#]*)([?][^#]+)?([#].*)?$/);
      path = path.slice(1);
      query = query ? query.slice(1).split('&').toObj(pc => [ ...pc.cut('='), true /* default key-only value to flag */ ]) : {};
      fragment = fragment.slice(1);
      
      let keyedMsg = null; // Note this must be `{ key, msg }`, where `key` is `null` (for anon) or a String
      try {
        
        keyedMsg = await getKeyedMessage({ path, query, fragment, cookie, body });
        
      } catch (err) {
        
        errSubcon('Error getting session Key+Msg (clearing cookies and redirecting...)', err);
        return res.writeHead(302, {
          'Set-Cookie': cookieKeys.map(k => `${k}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;`),
          'Location': '/'
        }).end();
        
      }
      path = query = fragment = cookie = cookieKeys = body = null;
      
      let session = null;
      if (keyedMsg.key === null) { // Make an anonymous Session
        
        session = makeHttpSession(null, req);
        tmp.src.send(session);
        
      } else {                     // Reuse or create an identity Session
        
        session = sessions.get(keyedMsg.key);
        if (!session) {
          session = makeHttpSession(keyedMsg.key, req);
          sessions.add(session.key, session);
          session.endWith(() => sessions.rem(session.key));
          tmp.src.send(session);
        } else {
          session.knownNetAddrs.add(req.connection.remoteAddress); // Record seeing this Session from this NetworkAddress
        }
        
      }
      
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
      while (session.queueRes.length > 3) { // TODO: Parameterize "maxBankedResponses"?
        let pkg = session.queueRes.shift();
        pkg.used = true;
        pkg.res.writeHead(200).end();
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
    subcon,
    serverOpen, serverShut,
    intercepts: [],
    src: Src(), // Sends `session` Objects
    server: null,
    closing: false,
    sockets: null
  });
  tmp.endWith(() => serverShut());
  return tmp;
  
};
