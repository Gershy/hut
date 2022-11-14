global.Foundation = form({ name: 'Foundation', pars: { Endable, Slots }, props: (forms, Form) => ({
  
  $protocols: {
    http: { secure: false, defaultPort: 80 },
    https: { secure: true, defaultPort: 443 },
    ws: { secure: false, defaultPort: 80 },
    wss: { secure: true, defaultPort: 443 }
  },
  
  // Initialization
  init() {
    
    Object.defineProperty(this, 'initDateMs', { value: Date.now() }); // Apply timestamp as early as possible
    
    forms.Endable.init.call(this);
    
    Object.assign(this, {
      
      installedRooms: Object.plain({
        // `global.logic` is "native" and also its own room!
        logic: { debug: { offsets: [] }, content: global.logic }
      }),
      servers: Object.plain({ /* "<protocol>://<address>" -> Server */ }),
      
      hutPrm: null,
      keepPrm: null,
      realPrm: null,
      confPrm: null,
      
      subcons: Map()
      
    });
    
  },
  halt() { throw Error(`Foundation halted`); },
  
  // Sandbox
  initDateMs: Date.now(), // Marks when the class was defined, not when the instance was instantiated
  getMs() { return Date.now() - this.initDateMs; },
  getUid() { return (Number.int64 * Math.random()).encodeStr(String.base62, 10); }, // Avg. string length is 10.95
  soon: C.noFn('soon', (fn=null) => { /* Promise */ }),
  getRawUrl({ path='', command=path, ...query }) {
    
    // Returns a url without any consideration of caching
    query = query.toArr((v, k) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    return query ? `/${command}?${query}` : `/${command}`; // TODO: Sanitize `command`? (But note it needs to be allowed to have "/" - e.g. "/!static/path/to/resource.jpg")
    
  },
  getUrl({ path='', command=path, ...query }) {
    
    // Returns a url String, potentially including a "!" key in the
    // query component, which stores a value to dodge the cache; whether
    // and how this cache-dodging occurs is controlled by the maturity
    
    let ver = null;
    let maturity = this.conf('maturity') ?? this.conf('deploy.maturity');
    
    // In "dev" use a random version to dodge the cache
    if      (maturity === 'dev')   ver = this.getUid();
    
    // In "beta" use process uid (refreshes once when Above restarts)
    else if (maturity === 'beta')  ver = this.conf('processUid') ?? this.conf('deploy.processUid');
    
    // TODO: No caching in alpha?
    else if (maturity === 'alpha') ver = null;
    
    return this.getRawUrl(ver ? { '!': ver, command, ...query } : { command, ...query });
    
  },
  parseUrl(url) {
    
    let [ full, protocol, host, port=null, path='/', query='' ] = url.match(/^([^:]+):\/\/([^:?/]+)(?::([0-9]+))?(\/[^?]*)?(?:\?(.+))?/);
    
    if (!Form.protocols.has(protocol)) throw Error(`Invalid protocol: "${protocol}"`);
    
    if (!path.hasHead('/')) path = `/${path}`;
    if (!port) port = Form.protocols[protocol].defaultPort;
    
    return {
      protocol, host, port: parseInt(port, 10), path,
      query: (query ? query.split('&') : []).toObj(pc => pc.has('=') ? pc.cut('=', 1) : [ pc, null ])
    };
    
  },
  formatHostUrl({ protocol, address, host=address, port }) {
    // TODO: Should the concept of a physical network address be termed Address or Host????
    let excludePort = true
      && Form.protocols.has(protocol)
      && port === Form.protocols[protocol].defaultPort;
    return `${protocol}://${host}${excludePort ? '' : (':' + port)}`;
  },
  formatAnyValue(val) { try { return valToSer(val); } catch (err) { return `[${getFormName(val)}]`; } },
  subcon(term) {
    
    if (!isForm(term, String)) throw Error(`Subcon term should be a String (got ${getFormName(term)})`);
    
    let subconVal = this.conf('subcon');
    if (!isForm(subconVal, Object)) throw Error(`Can't use Subcon yet (Conf returning ${getFormName(subconVal)})`);
    if (!subconVal.has(term)) return Object.assign(() => {}, { enabled: false, defined: false });
    
    let subconData = subconVal[term];
    if (!subconData.enabled) return Object.assign(() => {}, subconData);
    
    if (!this.subcons.has(term)) this.subcons.set(term, this.createSubcon(term, subconData));
    
    return this.subcons.get(term);
    
  },
  createSubcon(term, data) {
    return Object.assign((...args) => {
      thenAll(args.map(arg => hasForm(arg, Function) ? arg(data) : arg), args => {
        //args = args.map(arg => isForm(arg, String) ? arg : this.formatAnyValue(arg));
        console.log(`subcon/${term}:\n`, ...args);
      });
    }, data);
  },
  
  // Services
  access(arg) {
    if (!isForm(arg, String)) throw Error(`Invalid type for access: ${getFormName(arg)}`);
    if (arg === 'hut') return this.getRootHut();
    if (arg === 'keep') return this.getRootKeep();
    if (arg === 'real') return this.getRootReal();
    if (arg === 'conf') return this.getRootConf();
    return null;
  },
  getRootHut(opts)  { return this.hutPrm  || (this.hutPrm  = then(this.createHut(opts),  v => this.hutPrm  = v)); },
  getRootKeep(opts) { return this.keepPrm || (this.keepPrm = then(this.createKeep(opts), v => this.keepPrm = v)); },
  getRootReal(opts) { return this.realPrm || (this.realPrm = then(this.createReal(opts), v => this.realPrm = v)); },
  getRootConf(opts) { return this.confPrm || (this.confPrm = then(this.createConf(opts), v => this.confPrm = v)); },
  createKeep: C.noFn('createKeep'),
  createHut(uid) { return then(this.getRoom('Hut'), Hut => Hut({ uid, isHere: true, isManager: true, isRec: true })); },
  createReal: C.noFn('createReal'),
  createConf() { return Conf({ name: 'root' }); },
  
  // Config
  configure(data) {
    return then(this.getRootConf(), rootConf => {
      return then(rootConf.setVal(data), () => rootConf);
    });
  },
  conf(term) { return this.seek('conf', ...term.split('.')).val; },
  
  // Transport
  createServer(opts) {
    
    // Returns either an immediate value or a Promise. Immediate
    // server availability is important to allow responsive setup of
    // some clients.
    
    let term = this.formatHostUrl(opts);
    if (!this.servers[term]) {
      
      this.servers[term] = Object.plain({
        
        http: this.createHttpServer,
        https: this.createHttpServer,
        
        sokt: this.createSoktServer,
        sokts: this.createSoktServer,
        
        ws:   this.createSoktServer,
        wss:   this.createSoktServer
        
      })[opts.protocol].call(this, opts);
      
      then(this.servers[term], server => this.servers[term] = server);
      
    }
    return this.servers[term];
    
  },
  createHttpServer: C.noFn('createHttpServer', opts => {}),
  createSoktServer: C.noFn('createSoktServer', opts => {}),
  
  // Room
  getRooms(roomNames, { shorten=true, ...opts }={}) {
    
    // Return an Object which maps every name in the Array `roomNames`
    // to a Promise; this Promise will resolve to the result of
    // running the function defined by the room for that name. Note
    // that compilation and minification layers are likely to apply.
    // Handles recursion (where requested rooms have further
    // dependencies) and circular recursion (when a room within the tree
    // requires an unloaded room involved in the same tree).
    
    let err = Error('');
    return thenAll(roomNames.toObj(name => {
      
      let keyName = shorten ? name.split('.').slice(-1)[0] : name;
      
      // Prexisting Promise or resolved values are returned
      if (this.installedRooms[name]) return [ keyName, this.installedRooms[name].content ];
      
      // Unresolved promise representing room installation. Note that
      // `MyFoundation(...).installRoom` can throw errors in two ways:
      // 1. Async `throw` directly from call (e.g. invalid room name)
      // 2. Room loads successfully but immediately-executed logic
      //    throws an Error; in this case `installRoom` still returns
      //    `{ debug, content }`, but `content` is a rejected Promise
      // Here we add Error context to both kinds of failures:
      let installPrm = this.installRoom(name, opts)
        
        // Add context for case #1
        .fail(ctxErr => err.propagate({ ctxErr, msg: `Failed to resolve room "${name}"` }))
        
        // More logic to process case #2
        .then(orig => {
          
          // Add context for case #2
          let content = then(orig.content,
            v => v,
            ctxErr => err.propagate({ ctxErr, msg: `Failed to resolve room "${name}"` })
          );
          
          return { ...orig, content };
          
        });
      
      // Immediately set key; prevents double-installation
      this.installedRooms[name] = { debug: { offsets: [] }, content: installPrm.then(v => v.content) };
      
      // Note `Foundation.prototype.installRoom` returns a Promise
      // resolving to an Object with "debug" and "content" properties.
      // Note "debug" is immediately available, while "content" may be
      // another Promise. This is to allow debug information to be
      // available for any SyntaxErrors that can occur during the
      // resolution of the "content" property.
      installPrm.then(({ debug, content }) => {
        this.installedRooms[name].debug = debug;
        Promise.resolve(content).then(content => this.installedRooms[name].content = content);
      });
      
      return [ keyName, this.installedRooms[name].content ];
      
    }));
    
  },
  getRoom(roomName, { ...opts }={}) {
    
    // Uses `Foundation.prototype.getRooms` to return a single room
    return then(this.getRooms([ roomName ], { shorten: false, ...opts }), rooms => rooms[roomName]);
    
  },
  installRoom(name, bearing) {
    
    // Returns an Object with "debug" and "content" properties. The
    // "debug" property must be immediately available, and represent
    // a mapping between compiled and source codepoints; this is for
    // use with stack traces. The "content" property may be a Promise
    // and should resolve eventually to the result of calling the
    // function defined under `global.rooms[name]`. This function is
    // called by both `Foundation.prototype.getRoom` and
    // `Foundation.prototype.getRooms`, allowing import of source code
    // defined in other files, along with the data needed to display
    // good stack traces.
    
    return C.noFn('installRoom').call(this, name, bearing);
    
  },
  
  /// {DEBUG=
  // Error
  parseErrorLine: C.noFn('parseErrorLine', lineStr => ({ bearing: null, roomName: null, lineInd: 0, charInd: 0, compiled: true })),
  srcLineRegex: C.noFn('srcLineRegex', () => ({ regex: /.^/, extract: fullMatch => ({ roomName: '...', line: '...', char: '...' }) })),
  cmpLineToSrcLine(offsets, cmpLine, cmpChar=null) {
    
    // For a compiled file and line number, return the corresponding line number
    // in the source
    
    let context = {}; // Context can accumulate as we iterate through the offsets
    let srcLine = 0; // The line of code in the source which maps to the line of compiled code
    let nextOffset = 0; // The index of the next offset chunk which may take effect
    for (let i = 0; i < cmpLine; i++) {
      
      // Find all the offsets which exist for the source line
      // For each offset increment the line in the source file
      while (offsets[nextOffset] && offsets[nextOffset].at === srcLine) {
        Object.assign(context, offsets[nextOffset]);
        srcLine += offsets[nextOffset].offset;
        nextOffset++;
      }
      srcLine++;
      
    }
    
    return { context, line: srcLine };
    
  },
  cmpRoomLineToSrcLine(name, cmpLine, cmpChar=null) {
    
    let offsets = null
      || this.installedRooms[name]?.debug?.offsets
      || (global.roomDebug || {})?.[name]?.offsets
      || null;
    
    let mapped = false;
    let srcLine = cmpLine;
    
    if (offsets) {
      let { context: { roomName=null }, line } = this.cmpLineToSrcLine(offsets, cmpLine, cmpChar);
      if (roomName) name = roomName;
      srcLine = line;
      mapped = true;
    }
    
    return {
      name,
      mapped,
      srcLine,
      disp: `${name}.${mapped ? 'cmp' : 'src'} @ ${srcLine.toString()}`
    };
    
  },
  formatError(err=null, { verbose=false }={}) {
    
    // Form a pretty String representation of an Error; noisy filepaths
    // are removed, map line indices are mapped from compiled->source
    
    if (err === null) err = Error('trace');
    
    let { message: msg, stack } = err;
    if (!stack) return String.multiline(`
      An Error lacking a "stack" property:
      Form: ${getFormName(err)}
      Desc: ${err}
      Keys: [ ${Reflect.ownKeys(err).join(', ')} ]
    `);
    
    let type = stack?.match(/^[a-zA-Z0-9$_]*(Error|Warning)/)?.[0] ?? getFormName(err);
    
    // SyntaxErrors can begin with a diagram of the error line; they
    // also do not dynamically propagate "message" to "stack" (given
    // regular Error `err` and SyntaxError `synErr`, for
    // `err.message += '!'` and `synErr.message += '!'`, the "!" appears
    // in `err.stack`, but not in `synErr.stack`). This is a nuisance as
    // it interferes with detecting where the "trace" component of the
    // stack begins - we can't simply skip `err.message.count()` chars
    // as some characters of the "error message" can be reflected in
    // `err.message` but not `err.stack`.
    // TODO: Browser compatibility???
    
    let pfx = `: ${msg}\n`;
    let ind = stack.indexOf(pfx);
    if (ind < 0 && stack.startsWith(msg)) { ind = 0; pfx = msg; }
    
    if (ind < 0) {
      pfx = `(Unknown error)`;
      stack = `${pfx}\n\n${stack}`;
      ind = pfx.length;
    }
    
    let traceBegins = ind + pfx.length;
    let errDescContent = stack.slice(0, traceBegins - 1);
    let trace = stack.slice(traceBegins);
    let lines = trace.split('\n').map(line => {
      
      let parseCmpLine = safe(() => this.parseErrorLine(line), null);
      
      // Return early if the line couldn't be parsed
      if (!parseCmpLine) return verbose ? `?(1) - ${line.trim()}` : skip;
      
      // Get parsed structure
      let { bearing, roomName, lineInd, charInd, compiled } = parseCmpLine;
      
      // Return early for non-compiled rooms (no line mapping needed)
      if (!compiled) return `${roomName}.src @ ${lineInd}`;
      
      // If line mapped successfully return the mapped line
      let result = safe(
        () => this.cmpRoomLineToSrcLine(roomName, lineInd, charInd).disp,
        err => console.log({ ow: 'OW!', err }) || null
      );
      if (result) return result;
      
      // Line wasn't mapped (display debug line if "verbose" enabled)
      return verbose ? `?(2) - mill/cmp/${bearing}/${roomName}.js @ ${lineInd} (${line.trim()})` : skip;
      
    });
    
    let { regex, extract } = this.srcLineRegex();
    let moreLines = errDescContent.replace(regex, fullMatch => {
      let { roomName, lineInd, charInd=null } = extract(fullMatch);
      return this.cmpRoomLineToSrcLine(roomName, lineInd, charInd).disp;
    }).split('\n');
    
    let result = [
      '==' + '='.repeat(44),
      ...moreLines.map(ln => `||  ${ln}`),
      '|>' + '-'.repeat(44),
      ...(lines.empty()
        ? [ `Showing unformatted "${type}":`, ...trace.split('\n').map(ln => `? ${ln.trim()}`) ]
        : lines
      ).map(ln => `||  ${ln}`)
    ].join('\n');
    
    let { message, ctxErr=null, ...specialArgs } = err;
    if (!specialArgs.empty()) result += '\n' + this.formatAnyValue(specialArgs);
    
    // If the Error has a "cause" include it in the trace
    if (ctxErr) result += '\n' + `\nCAUSE:\n${this.formatError(Object.assign(ctxErr, { ctxErr: null }), { verbose })}`.indent('||  ');
    
    then(this.conf('deploy.haltOnError'), haltOnError => then(haltOnError, haltOnError => {
      if (haltOnError) { console.log('(First error)', result); this.halt() };
    }));
    
    return result;
    
  },
  /// =DEBUG}
  
  async hoist() {
    
    // Ensure all necessary instances are initialized
    let [ hut, staticKeep, hoists ] = await Promise.all([
      this.seek('hut'),
      this.seek('keep', 'static'),
      this.conf('hoists')
    ]);
    
    staticKeep.hut = hut;
    
    // Process all Hoists
    await Promise.all(hoists.map(async hoist => {
      if (!hoist.room) throw Error(`Hoist missing "room"`);
      let room = await this.getRoom(hoist.room);
      await room.open(hut, hoist.group);
    }));
    
  },
  
  cleanup() {
    for (let k in this.servers) this.servers[k].end();
  }
  
})});
