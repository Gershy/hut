'use strict';

// TODO: Compression? Cpu load vs packet size?

require('../../room/setup/clearing/clearing.js');
let crypto = require('crypto');

module.exports = getRoom('setup.hut.hinterland.RoadAuthority').then(RoadAuthority => {
  
  return form({ name: 'SoktRoadAuthority', has: { RoadAuthority }, props: (forms, Form) => ({
    
    init({ ...args }) {
      
      forms.RoadAuthority.init.call(this, { protocol: 'sokt', ...args });
      Object.assign(this, {});
      
    },
    
    activate({ security=null, adjacentServerPrms={} }={}) {
      
      // Note that "adjacent" implies any such servers are on the same port
      
      let tmp = Tmp();
      
      tmp.prm = (async () => {
        
        let existingHttpRoadAuthority = adjacentServerPrms.has('http') && await adjacentServerPrms.http;
        let httpRoadAuthority = existingHttpRoadAuthority ||  await (async () => {
          
          this.sc('No adjacent http server - creating a sokt-specific http server');
          
          let HttpRoadAuthority = await require('./http.js');
          let httpRoadAuthority = HttpRoadAuthority({
            aboveHut: this.aboveHut, // The AboveHut won't be used
            netProc: this.netProc,
            sc: subconStub // Prevent http subcon - we'll do all necessary sc for websocket
          });
          httpRoadAuthority.intercepts = [
            (req, res) => {
              gsc('SOKT INTERCEPT HTTP', req.url);
              res.socket.destroy();
              return true;
            }
          ];
          
          let activateTmp = httpRoadAuthority.activate({ security });
          tmp.endWith(activateTmp);
          await activateTmp.prm;
          
          return httpRoadAuthority;
          
        })();
        
        httpRoadAuthority.server.on('upgrade', (req, socket, initialBuff) => {
          
          let initialMs = getMs();
          
          if (req.headers['upgrade'] !== 'websocket') return socket.end('Api: upgrade header must be "websocket"');
          if (!req.headers['sec-websocket-key'])      return socket.end('Api: missing "sec-websocket-key" header');
          
          let belowNetAddr = req.connection.remoteAddress;
          let query = (req.url.cut('?')[1] ?? '').split('&').toObj(v => v.cut('='));
          let { hid='' } = query;
          
          let { belowHut, road } = safe(
            () => this.aboveHut.getBelowHutAndRoad({
              roadAuth: this, trn: 'async', hid,
              params: { socket, initialMs, initialBuff, belowNetAddr }
            }),
            err => {
              socket.end('Api: sorry - experiencing issues');
              throw err.mod(msg => `Failed to get BelowHut and Road: ${msg}`);
            }
          );
          
          let hash = crypto
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
        
      })();
      
      return tmp;
      
    },
    makeRoad(belowHut, { socket }) { return (0, Form.SoktRoad)({ roadAuth: this, belowHut, socket }); },
    
    $SoktRoad: form({ name: 'SoktRoad', has: { Road: RoadAuthority.Road }, props: (forms, Form) => ({
      
      $wsEncode: ({ op=1, code=null, text=null, buff=Buffer.from(text ?? '', 'utf8') }) => {
        
        /// {DEBUG=
        if (!isForm(buff, Buffer)) throw Error('Api: "data" must be Buffer').mod({ data: buff });
        /// =DEBUG}
        
        let meta = null;
        
        // `code` is set as 2 additional bytes prefixing `data`
        if (code !== null) {
          let codeBuff = Buffer.alloc(2);
          codeBuff.writeUInt16BE(code, 0);
          buff = Buffer.concat([ codeBuff, buff ]);
        }
        
        let len = buff.length; // No need for `Buffer.byteLength` - `data` is always a Buffer!
        
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
          meta.writeBigUInt64(len, 2);
          // meta.writeUInt32BE(len / Number.int32, 2);
          // meta.writeUInt32BE(len % Number.int32, 6);
          
        }
        
        meta.writeUInt8(128 + op); // `128` sets highest/first bit (FIN bit); `op` fills 1st byte big-endian style (the last bits of the 1st byte)
        
        return Buffer.concat([ meta, buff ]);
        
      },
      $wsDecode: buff => {
      
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
        let op =   b & 0b00001111; // Final (low-order) 4 bits define OP
        
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
        
        return { consumed: offset, fin, op, mask, buff: data };
        
      },
      
      init({ socket, initialMs, initialBuff=Buffer.alloc(0), ...args }) {
        
        /// {DEBUG=
        if (!socket) throw Error('Api: missing "socket"');
        if (!initialBuff) throw Error('Api: missing "initialBuff"');
        /// =DEBUG}
        
        forms.Road.init.call(this, args);
        Object.assign(this, {
          sc: this.roadAuth.sc,
          id: Math.random().toString(36).slice(2),
          socket,
          frames: [],
          size: 0,
          buff: Buffer.alloc(0),
          writeQueue: Promise.resolve()
        });
        
        this.sc(() => ({ event: 'init', id: this.id, belowHut: this.belowHut, netAddr: this.socket.remoteAddress }));
        this.endWith(() => this.sc(() => ({ event: 'fini', id: this.id })));
        
        this.wsIncoming(initialMs, initialBuff);
        
        let [ readableFn, closeFn, errorFn ] = [];
        socket.on('readable', readableFn = () => {
          
          let ms = getMs();
          let buff = socket.read();
          if (!buff) return this.end(); // `socket.read` can return `null` to indicate end of stream
          
          this.wsIncoming(ms, buff);
          
        });
        socket.on('close', closeFn = () => this.end());
        socket.on('error', errorFn = err => {
          
          gsc.kid('error')(err.mod(msg => `Socket error: ${msg}`));
          this.end();
          
        });
        
        this.endWith(() => {
          
          socket.off('readable', readableFn);
          socket.off('close', closeFn);
          socket.off('error', errorFn);
          
        });
        
      },
      wsWrite(opts /* { op, code, text, buff } */) {
        
        // Shorthand access to websocket protocol; provide a payload and "op" and "code" values
        // Note that "op" is used for every websocket command to indicate which basic operation is
        // being performed and "code" is only used when `op === 8` ("close") to indicate the kind
        // of closure - e.g. `code === 1000` means success; `code === 1002` means error
        // 
        // Use `text` in place of `buff`; `buff` will be set to `Buffer.from(text, 'utf8')`
        // 
        // This method queues socket writes, preventing writes from becoming interleaved
        
        let err = Error('');
        return this.writeQueue = this.writeQueue.then(() => Promise(rsv => {
          
          this.sc(() => ({ event: 'tell', id: this.id, op: opts.op,g msg: jsonToVal(opts.buff || opts.text) }));
          
          this.socket.write(Form.wsEncode(opts), cause => {
            if (cause) {
              cause.suppress();
              this.end();
              gsc.kid('error')(err.mod( msg => ({ cause, msg: `Error writing to websocket: ${msg}` }) ));
            }
            rsv();
          });
          
        }));
        
      },
      wsIncoming(ms, buff) {
        
        this.size += buff.length;
        if (this.size > 5000) return this.end();
        this.buff = Buffer.concat([ this.buff, buff ]); // TODO: Use an array of Buffers - this doesn't perform
        
        while (this.onn()) {
          
          // Note that `Form.wsDecode` eventually breaks this loop by returning a nullish value
          let wsMsg = Form.wsDecode(this.buff); // May consume a prefix of `state.buff`
          if (!wsMsg) break; // Need more data to finish decoding
          
          // A full websocket frame was received! Note that a single websocket frame does not
          // necessarily represent a full NetMsg - we only assume we have a full NetMsg when the
          // "fin" bit is set!
          let { consumed, fin, op, mask, buff: incomingBuff } = wsMsg;
          this.buff = this.buff.slice(consumed);
          this.frames.push(incomingBuff);
          
          (() => {
            
            // `fin` indicates that all received frames should be taken together as a single unit;
            // this only makes sense if there's at least one frame!
            if (!fin) return;
            if (!this.frames.length) return;
            
            let msg = (this.frames.length === 1) ? this.frames[0] : Buffer.concat(this.frames);
            this.frames = [];
            this.size -= msg.length;
            
            try         { msg = jsonToVal(msg); }
            catch (err) { msg = { command: msg.toString('utf8') }; }
            
            this.sc(() => ({ event: 'hear', id: this.id, op, msg }));
            
            // Here's where to consider opcodes other than 1 and 2
            // Note that 1 and 2 ("text" and "binary") are pretty both
            // handled as `jsonToVal` above accepts either String or Buffer
            if ([ 0x1, 0x2 ].has(op)) this.roadAuth.aboveHut.hear({
              src: this.belowHut, road: this, ms, msg,
              reply: msg => this.tellAfar(msg)
            });
            else if (op === 0x8) this.sayGoodbye();
            else if (op === 0x9) this.wsWrite({ op: 0xa, text: 'Pong!' });
            else if (op === 0xa) this.wsWrite({ op: 0x9, text: 'Ping!' });
            else                 { errSubcon(`Received unexpected opcode: 0x${op.toString(16)}`); this.end(); }
            
          })();
          
        }
        
      },
      
      currentCost() { return 0.1; },
      tellAfar(msg) { return this.wsWrite({ op: 1, text: valToJson(msg) }) },
      
      sayGoodbye() {
        
        // Initiate saying goodbye (https://www.rfc-editor.org/rfc/rfc6455#section-7.4.1)
        //let sayGoodbyePrm = this.wsWrite({ op: 8, code: 1000, text: `Goodbye friend :')` });
        let sayGoodbyePrm = this.wsWrite({ op: 8, code: 1000, text: `Goodbye friend \ud83e\udd72` });
        
        // End without destroying the socket - this could interfere with saying goodbye!
        let socket = this.socket;
        this.socket = { destroy: Function.stub };
        this.end();
        
        // Manually clean up the socket once we're done saying goodbye
        sayGoodbyePrm.finally(() => socket.destroy());
        
      },
      
      cleanup() {
        forms.Road.cleanup.call(this);
        this.socket.destroy();
      }
      
    })})
    
  })});
  
});
