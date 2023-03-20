'use strict';

require('../room/setup/clearing/clearing.js');

module.exports = ({ secure, netAddr, port, compression=[], ...opts }) => {
  
  let { subcon=Function.stub, errSubcon=Function.stub } = opts;
  let { getKey } = opts;
  if (!getKey) throw Error(String.baseline(`
    | Must provide "getKey":
    | It must be a Function like: ({ query }) => key
    | 
    | - "query" is an Object representing the http path query
    | 
    | - "key" is the session identifier String for the given request
  `));
  
  let makeSoktSession = (key, req, socket, initialBuff=Buffer.alloc(0)) => {
    
    let session = Tmp({
      key,
      desc: () => `SoktSession(ws${secure ? 's' : ''}://${netAddr}:${port} / ${key})`,
      currentCost: () => 0.3,
      netAddr: socket.remoteAddress,
      tell: Src(),
      hear: Src()
    });
    
    let state = { frames: [], size: 0, buff: Buffer.alloc(0) };
    session.endWith(() => state = null);
    
    // Process conversions between op+code+payload and Buffer
    let wsDecode = buff => {
      
      // Imagine the incoming buffer has FIN set, no reserved bits set,
      // and 0b1111 (full bits, 127) for the `len`; this means in a
      // diagram we would see:
      // 0 . 1 . 2 . 3 . 4 . 5 . 6 . 7
      // -----------------------------
      // 1   0   0   0   1   1   1   1  
      // 
      // Likewise, `buff[0] === 0b10001111` in this case (most
      // significant bit representing FIN)
      
      if (buff.length < 2) return null;
      
      // FIRST BYTE:
      let b = buff[0];
      let fin =  b & 0b10000000; // 1st 4 bits set FIN and reserved bits
      let rsv1 = b & 0b01000000;
      let rsv3 = b & 0b00100000;
      let rsv4 = b & 0b00010000;
      let op =   b & 0b00001111; // Final (low-order) 4 bits compose OP
      
      // SECOND BYTE: 
      b = buff[1];
      let mask = b & 0b10000000; // 1st bit gives us MASK
      let len =  b & 0b01111111;
      
      let offset = 2; // We already processed 2 bytes
      
      // Deal with variable lengths
      if (len === 126) {
        
        offset += 2;
        if (buff.length < offset) return null;
        len = buff.readUInt16BE(2);
        
      } else if (len === 127) {
        
        offset += 6;
        if (buff.length < offset) return null;
        len = buff.readBigUInt64BE(2);
        
      }
      
      // Deal with an optional mask
      if (mask) {
        
        offset += 4;
        if (buff.length < offset) return null;
        mask = buff.slice(offset - 4, offset);
        
      } else {
        
        mask = null;
        
      }
      
      // Read the payload
      offset += len;
      if (buff.length < offset) return null;
      let data = buff.slice(offset - len, offset);
      
      // If a mask is present xor all bits in `data`
      if (mask) for (let i = 0; i < len; i++) data[i] ^= mask[i % 4];
      
      return { consumed: offset, fin, op, mask, data };
      
    };
    let wsEncode = ({ op=1, code=null, text=null, data=Buffer.from(text ?? '', 'utf8') }) => {
      
      let meta = null;
      
      // `code` is set as 2 additional bytes prefixing `data`
      if (code !== null) {
        let codeBuff = Buffer.alloc(2);
        codeBuff.writeUInt16BE(code, 0);
        data = Buffer.concat([ codeBuff, data ]);
      }
      
      let len = data.length;
      
      if (len <= 125) {
        
        meta = Buffer.alloc(2);
        meta.writeUInt8(len, 1); // Note 1st bit of 2nd byte is MASK flag; always leave it 0!!
        
      } else if (len <= 65535) {
        
        meta = Buffer.alloc(2 + 2);
        meta.writeUInt8(126, 1); // 126 means "medium size"
        meta.writeUInt16BE(len, 2);
        
      } else {
        
        // TODO: Large size could use more testing
        meta = Buffer.alloc(2 + 8);
        meta.writeUInt8(127, 1); // 127 means "large size"
        // meta.writeUInt32BE(len / Number.int32, 2);
        // meta.writeUInt32BE(len % Number.int32, 6);
        meta.writeBigUInt64(len, 2);
        
      }
      
      meta.writeUInt8(128 + op); // `128` sets highest/first bit (FIN bit); `op` fills 1st byte big-endian style (the last bits of the 1st byte)
      
      return Buffer.concat([ meta, data ]);
      
    };
    
    // Queue writes to ensure they can't become interleaved
    let wsWriteQueue = Promise.resolve();
    let wsWrite = (opts /* { op, code, text, data } */) => {
      
      subcon(() => {
        let { op, code=null, text=null, data=Buffer.from(text ?? '', 'utf8') } = opts;
        return { type: 'tell', op, code, text, payloadLen: data.length };
      });
      
      return wsWriteQueue = wsWriteQueue.then(() => Promise((rsv, rjc) => {
        
        socket.write(wsEncode(opts), err => {
          if (!err) return rsv();
          session.end();
          rjc(err);
        });
        
      }));
      
    };
    
    // Process incoming ws frames
    let wsIncoming = async (buff, ms) => {
      
      // Call this whenever there's more data available on the wire
      
      state.size += buff.length;
      if (state.size > 5000) return session.end();
      state.buff = Buffer.concat([ state.buff, buff ]);
      
      while (state) {
        
        let wsMsg = wsDecode(state.buff);
        if (!wsMsg) break; // Need more data to finish decoding
        
        let { consumed, ...frame } = wsMsg;
        state.buff = state.buff.slice(consumed);
        state.size -= consumed;
        wsFrame(ms, frame);
        
      }
      
    };
    let wsFrame = (ms, { fin, op, mask, data }) => {
      
      // Conditionally called once by `wsIncoming` for every complete
      // ws frame received on the wire
      
      subcon(() => ({ type: 'hear', fin, op, mask, data: data.toString('utf8') }));
      
      if (data.length) {
        state.frames.push(data);
        state.size += data.length; // This can't exceed the max size! The full frame binary was removed, so there's at least space for the payload
      }
      
      if (fin && state.frames.length) {
        
        let msg = (state.frames.length === 1) ? state.frames[0] : Buffer.concat(state.frames);
        state.frames = [];
        state.size -= msg.length;
        
        try         { msg = jsonToVal(msg); }
        catch (err) { msg = { command: msg.toString('utf8') }; }
        
        session.hear.send({ replyable: null, ms, msg });
        
      }
      
      if (op === 0x8) session.end();
      if (op === 0x9) wsWrite({ op: 0xa, text: 'Pong!' });
      if (op === 0xa) wsWrite({ op: 0x9, text: 'Ping!' });
      
    };
    
    // `setImmediate` allows consumer to set Routes on `session.tell`
    let readableFn = null;
    let closeFn = null;
    let errorFn = null;
    global.setImmediate(() => { wsIncoming(initialBuff, getMs()); initialBuff = null; });
    socket.on('readable', readableFn = () => {
      
      let ms = getMs();
      let buff = socket.read();
      if (!buff) return socket.end(); // `socket.read` can return `null` to indicate end of stream
      wsIncoming(buff, ms);
      
    });
    socket.on('close', closeFn = () => session.end());
    socket.on('error', errorFn = err => errSubcon(`Socket error ${session.desc()}`, err) ?? session.end());
    
    let tellRoute = session.tell.route(msg => msg && wsWrite({ op: 1, text: valToJson(msg) }));
    
    session.endWith(() => {
      
      socket.off('readable', readableFn);
      socket.off('close', closeFn);
      socket.off('error', errorFn);
      
      tellRoute.end();
      
      // Code: https://www.rfc-editor.org/rfc/rfc6455#section-7.4.1
      wsWrite({ op: 8, code: 1000, text: `Goodbye friend :')` }).finally(() => socket.end());
      
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
        let session = makeSoktSession(key, req, socket, buff);
        tmp.endWith(session, 'tmp');
        
        tmp.src.send(session);
        
        subcon(() => ({ type: 'hear', fin: null, op: null, mask: null, data: null }));
        
        if (session.off()) return socket.destroy();
        
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
    serverOpen, serverShut,
    src: Src(), // Sends `session` Objects
    reusedServer: false,
    httpServer: null
  });
  tmp.endWith(() => serverShut());
  return tmp;
  
};
