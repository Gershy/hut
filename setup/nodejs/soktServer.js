'use strict';

module.exports = ({ secure, netAddr, port, compression=[], ...opts }) => {
  
  let { subcon=Function.stub, errSubcon=Function.stub } = opts;
  let { msFn=Date.now, getKey } = opts;
  if (!getKey) throw Error(String.baseline(`
    | Must provide "getKey":
    | It must be a Function like: ({ query }) => key
    | 
    | - "query" is an Object representing the http path query
    | 
    | - "key" is the session identifier String for the given request
  `));
  
  let makeSoktSession = (key, req, socket, buff=Buffer.alloc(0)) => {
    
    // TODO: Should probably end websocket Sessions if no data has been
    // received for some interval of time (which also means clients
    // should send heartbeats!)
    
    mmm('soktSessions', +1);
    let session = Tmp({
      key,
      desc: () => `SoktSession(ws${secure ? 's' : ''}://${netAddr}:${port} / ${key})`,
      currentCost: () => 0.3,
      knownNetAddrs: Set([ socket.remoteAddress ]),
      tell: Src(),
      hear: Src()
    });
    session.endWith(() => mmm('soktSessions', -1));
    
    // Logic to track socket state and parse messages from binary
    let curOp = null;
    let curFrames = [];
    let curSize = 0;
    
    let hearSoktMessages = (ms=opts.msFn()) => { try { while (buff.length >= 2 && session.onn()) {
      
      // ==== PARSE FRAME
      
      let b = buff[0] >> 4;   // The low 4 bits of 1st byte give us flags (importantly "final")
      if (b % 8) throw Error('Some reserved bits are on'); // % gets us low-end bits
      let isFinalFrame = b === 8;
      
      let op = buff[0] % 16;  // The 4 high bits of 1st byte give us the operation
      if (op < 0 || (op > 2 && op < 8) || op > 10) throw Error(`Invalid op: ${op}`);
      
      if (op >= 8 && !isFinalFrame) throw Error('Incomplete control frame');
      
      b = buff[1];            // Look at second byte
      let masked = b >> 7;    // Lowest bit of 2nd byte - states whether frame is masked
      
      // Server requires a mask; Client requires no mask
      if (!masked) throw Error('No mask');
      
      let length = b % 128;
      let offset = 6; // Masked frames have an extra 4 halfwords containing the mask
      
      if (buff.length < offset + length) return; // No messages - should await more data
      
      if (length === 126) {         // Websocket's "medium-size" frame format
        length = buff.readUInt16BE(2);
        offset += 2;
      } else if (length === 127) {  // Websocket's "large-size" frame format
        length = buff.readUInt32BE(2) * Number.int32 + buff.readUInt32BE(6);
        offset += 8;
      }
      
      if (buff.length < offset + length) return; // No messages - should await more data
      
      // Now we know the exact range of the incoming frame; we can slice and unmask it as necessary
      let mask = buff.slice(offset - 4, offset); // The 4 halfwords preceeding the offset are the mask
      let data = buff.slice(offset, offset + length); // After the mask comes the data
      let w = 0;
      for (let i = 0, len = data.length; i < len; i++) {
        data[i] ^= mask[w];     // Apply XOR
        w = w < 3 ? w + 1 : 0;  // `w` follows `i`, but wraps every 4. Faster than `%` (TODO: ... really? looks like branching)
      }
      
      // ==== PROCESS FRAME (based on `isFinalFrame`, `op`, and `data`)
      
      // The following operations can occur regardless of socket state
      if (op === 8) {         // Process "close" op
        return session.end(); // Socket ended
      } else if (op === 9) {  // Process "ping" op
        throw Error('Unimplemented op: 9');
      } else if (op === 10) { // Process "pong" op
        throw Error('Unimplemented op: 10');
      }
      
      // Validate "continuation" functionality
      if (op === 0 && curOp === null) throw Error('Unexpected continuation frame');
      if (op !== 0 && curOp !== null) throw Error('Truncated continuation frame');
      
      // Process "continuation" ops as if they were the op being continued
      if (op === 0) op = curOp;
      
      // Text ops are our ONLY supported ops! (TODO: For now?)
      if (op !== 1) throw Error(`Unsupported op: ${op}`);
      if (curSize + data.length > 5000) throw Error('Sokt frame too large!');
      
      buff = buff.slice(offset + length); // Dispense with the frame we've just processed
      curFrames.push(data);               // Include the complete frame
      curSize += data.length;
      
      if (isFinalFrame) {
        
        let msg = jsonToVal(Buffer.concat(curFrames).toString('utf8'));
        session.hear.send({ replyable: null, ms, msg });
        curOp = null;
        curFrames = [];
        curSize = 0;
        
      } else {
        
        curOp = op; // Note `op === 1`, as our only supported op is "text"
        
      }
      
    }} catch (err) {
      
      session.end();
      throw err;
      
    }};
    
    // Only start Sending via `session.hear` after a tick so consumers
    // get a chance to add Routes
    Promise.resolve().then(() => {
      
      hearSoktMessages(); // `buff` passed to `makeSoktSession` can contain initial data!
      
      socket.on('readable', () => {
        
        let ms = opts.msFn();
        let buff0 = socket.read();
        if (!buff0) return session.end(); // `socket.read()` can return `null` to indicate the end of the stream
        
        buff = Buffer.concat([ buff, buff0 ]);
        hearSoktMessages(ms);
        
      });
      
    });
    
    session.tell.route(msg => {
      
      if (session.off()) return;
      if (!msg) return;
      let dataBuff = Buffer.from(valToJson(msg), 'utf8');
      
      let len = dataBuff.length;
      let metaBuff = null;
      
      // The 2nd byte (`metaBuff[1]`) indicates the "length-mode":
      // `len < 126` specifies the exact size ("small mode")
      // - `metaBuff[1] === len`
      // `len < 65536` specifies "medium mode"
      // - `metaBuff[1] === 126`
      // - 2 additional bytes hold the exact length (max 2^16)
      // `len >= 65536` specifies "large mode"
      // - `metaBuff[1] === 127`
      // - 8 additional bytes hold the exact length (max 2^64)
      // 
      // Note you'd think "small mode" could fit up to 254 in one byte
      // (with 255 indicating "medium mode"), but ws protocol will wind
      // up modding this value by 128
      if (len < 126) {            // small-size
        
        metaBuff = Buffer.alloc(2);
        metaBuff[1] = len;
        
      } else if (len < 65536) {   // medium-size
        
        metaBuff = Buffer.alloc(2 + 2);
        metaBuff[1] = 126;
        metaBuff.writeUInt16BE(len, 2);
        
      } else {                    // large-size
        
        // TODO: large-size packet could use more testing
        metaBuff = Buffer.alloc(2 + 8);
        metaBuff[1] = 127;
        metaBuff.writeUInt32BE(Math.floor(len / Number.int32), 2); // Lo end of `len` from metaBuff[2-5]
        metaBuff.writeUInt32BE(len % Number.int32, 6);             // Hi end of `len` from metaBuff[6-9]
        
      }
      
      metaBuff[0] = 128 + 1; // `128` pads for modding by 128; `1` is the "text" op
      
      // TODO: The packet may not be written immediately - this means
      // that multiple socket writes could occur out-of-order (which is
      // only a problem if the consumer doesn't apply any ordering
      // scheme, which in the case of Hut isn't an issue)
      socket.write(Buffer.concat([ metaBuff, dataBuff ]), err => {
        if (!err) return;
        gsc('Error writing to socket', err);
        session.end();
      });
      
    }, 'prm');
    
    session.endWith(async () => {
      let m = Buffer.alloc(2);
      m[0] = 128 + 8; // `8` is the "close" op
      m[1] = 0;       // Indicate there's no payload
      try     { await Promise((rsv, rjc) => socket.write(buff, err => err ? rjc(err) : rsv())); }
      finally { socket.end(); }
    });
    
    return session;
    
  };
  let serverOpen = async (security=null, adjacentServerPrms={}) => {
    
    if (secure && !security) throw Error(`Secure server https://${netAddr}:${port} requires "security" param`);
    
    if (tmp.off()) return;
    if (tmp.httpServer) return;
    
    // TODO: No need to require net/tls - just need an http server,
    // one of which may already be available in `adjacentServerPrms`!
    // If one isn't available, spin up by requiring httpServer.js;
    // then we'll certainly have a Server created by httpServer.js,
    // and we can add an Intercept to it to capture Websocket upgrade
    // requests! (I think `req.socket` is the Socket we need)
    if (adjacentServerPrms.has('http')) {
      
      tmp.reusedServer = true;
      tmp.httpServer = await adjacentServerPrms.http;
      
    } else {
      
      tmp.reusedServer = false;
      tmp.httpServer = require('./httpServer.js')({
        secure, netAddr, port,
        compression,
        getKeyedMessage: () => ({ key: null, msg: null }),
        doCaching: false
      });
      await tmp.httpServer.serverOpen(security);
      
    }
    
    mmm('servers', +1);
    
    tmp.httpServer.server.on('upgrade', (req, socket, buff) => {
      
      if (req.headers['upgrade'] !== 'websocket') return req.writeHead(400).end();
      if (!req.headers['sec-websocket-key'])      return req.writeHead(400).end();
      
      let query = req.url.cut('?')[1].split('&').toObj(v => v.cut('='));
      try {
        let key = opts.getKey({ query });
        tmp.src.send(makeSoktSession(key, req, socket, buff));
      } catch (err) {
        
        errSubcon('Error getting session key', query, err);
        
        let date = (new Date()).toUTCString();
        tmp.httpServer.subcon(() => ({
          type: 'res', version: 'HTTP/1.1', code: 400,
          headers: { 'Date': date, 'Connection': 'Closed' },
          body: ''
        }));
        
        return socket.write([
          'HTTP/1.1 400 Bad Request',
          `Date: ${date}`,
          'Connection: Closed',
          '\r\n'
        ].join('\r\n'));
        
      }
      
      let hash = require('crypto')
        .createHash('sha1')
        .end(`${req.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
        .digest('base64');
      
      socket.write([
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${hash}`,
        '\r\n'
      ].join('\r\n'));
      
    });
    
  };
  let serverShut = async () => {
    
    let server = tmp.httpServer;
    if (!server) return;
    tmp.httpServer = null;
    
    if (!tmp.reusedServer) await Promise((rsv, rjc) => server.close(err => err ? rjc(err) : rsv()));
    
    mmm('servers', -1);
    
  };
  
  let tmp = Tmp({
    desc: () => `ws${secure ? 's' : ''}://${netAddr}:${port}`,
    secure, protocol: 'sokt', netAddr, port,
    subcon,
    serverOpen, serverShut,
    src: Src(), // Sends `session` Objects
    reusedServer: false,
    httpServer: null
  });
  tmp.endWith(() => serverShut());
  return tmp;
  
};
