global.rooms[`habitat.HtmlBrowserHabitat.hutify.foundation`] = () => ({ init: async evt => {
  
  // We're going to be stingy with this code; the smaller+faster this
  // file is, the better the user experience! Note this file
  // interoperates nicely with the typical Hut style of loading Rooms,
  // but in the browser this code should be referenced manually and
  // run after the DOMContentLoaded event (obvs we can't reference the
  // Room with `getRoom`, as the logic for doing so is only defined
  // after this code has ran!)
  
  let hutifyPath = 'habitat.HtmlBrowserHabitat.hutify';
  
  Error.prepareStackTrace = (err, callSites) => {
    
    if (err?.constructor === SyntaxError) return;
    
    let trace = callSites.map(cs => {
      
      // https://v8.dev/docs/stack-trace-api
      let row = cs.getLineNumber();
      let col = cs.getColumnNumber();
      
      // Get `cs.getFileName()`; if nullish there are 2 possibilities:
      // 1. This error is from an `eval` (check `cs.getEvalOrigin`)
      // 2. This error is unrelated to any line (e.g. Promise.all index)
      let rawFileName = cs.getFileName();
      
      // Option 1; check eval origin (note that we'll want to overwrite
      // `row` and `col`, as their un-overwritten values will be their
      // index within the `eval`'d String, whereas the index of where
      // `eval` was called is *much* more useful for debugging!
      if (!rawFileName) {
        let evalOrig = cs.getEvalOrigin();
        let match = [ , rawFileName=null, row, col ] = (evalOrig ?? '').match(/(https?:[/][/].+):([0-9]+):([0-9]+)/) ?? [];
        [ row, col ] = [ row, col ].map(v => parseInt(v, 10));
      }
      
      // We'll get to option 2 if `rawFileName` still (potentially even
      // after having checked for an eval origin) doesn't indicate a
      // room; in that case, `keepTerm` takes on a nullish value!
      let match = rawFileName?.match(/\broom=([^?&/]*)/);
      let keepTerm = match ? (match[1] ?? null) : null;
      
      return keepTerm
        ? { type: 'line', fnName: cs.getFunctionName(), keepTerm, row, col }
        : { type: 'info', info: cs.toString() };
      
    });
    return `${err.message}{HUTTRACE=${valToJson(trace)}=HUTTRACE}`;
    
  };
  
  let onErr = evt => {
    
    let err = evt.error ?? evt.reason;
    
    // Don't modify SyntaxErrors - they only show proper
    // stack information when they're logged natively
    if (err?.constructor?.name?.hasHead('Syntax')) return;
    gsc(`Uncaught ${getFormName(err)}:`, err.desc());
    // TODO: Refresh!! Or better yet - reset foundation (more complex)
    evt.preventDefault();
    debugger;
    
  };
  window.evt('unhandledrejection', onErr);
  window.evt('error', onErr);
  
  let document = window.document;
  let { classList: cl } = document.body;
  cl.add('focus');
  window.evt('load', () => cl.add('loaded'));
  window.evt('beforeunload', () => cl.remove('loaded'));
  window.evt('focus', () => cl.add('focus'));
  window.evt('blur', () => cl.remove('focus'));
  
  let HttpKeep = form({ name: 'HttpKeep', has: { Keep }, props: (forms, Form) => ({
    init(uri) {
      Object.assign(this, { uri });
    },
    getUri() { return this.uri;
      
      let chain = this.chain;
      if (chain?.constructor === Array) {
        // TODO: What if chain contains a literal "/"??????
        chain = `/${chain.join('/')}`;
      }
      return uri({ path: 'asset', query: { chain } });
    },
  })});
  let seenHttpKeeps = Map();
  
  global.getMs = () => performance.timeOrigin + performance.now();
  global.keep = chain => {
    
    chain = resolveChain(chain);
    if (chain?.constructor === Array) chain = `/${chain.join('/')}`;
    if (chain?.constructor !== String) throw Error(`Api: chain must resolve to String; got ${getFormName(chain)}`);
    
    if (!seenHttpKeeps.has(chain)) {
      seenHttpKeeps.set(chain, HttpKeep( uri({ path: 'asset', query: { chain } }) ));
    }
    return seenHttpKeeps.get(chain);
    
  };
  global.conf = (...chain) => {
    
    // Resolve nested Arrays and period-delimited Strings
    chain = chain.map(v => isForm(v, String) ? v.split('.').sift() : v).flat(Infinity);
    
    let ptr = global.rawConf;
    for (let pc of chain) {
      if (!isForm(ptr, Object) || !ptr.has(pc)) throw Error('Api: invalid Conf chain').mod({ chain });
      ptr = ptr[pc];
    }
    return ptr;
    
  };
  global.subconOutput = (sc, ...args) => {
    
    let term = sc.term;
    let { inline=false, therapist=false } = global.rawConf.subcons[term]?.output ?? {};
    if (!inline) return;
    
    args = args.map(arg => isForm(arg, Function) ? arg() : arg).sift();
    if (!args.length) return;
    console.log(
      `%c${getDate().padTail(80, ' ')}\n${sc.term.padTail(80, ' ')}`,
      'background-color: rgba(0, 0, 0, 0.2);',
    );
    console.log(...args.map(a => isForm(a?.desc, Function) ? a.desc() : a));
    
  };
  global.getRooms = (names, { shorten=true, ...opts }={}) => {
    
    let err = Error('trace');
    return thenAll(names.toObj(name => {
      
      // Deferred rooms embedded in initial html don't emit "load" event
      // Need to see if `global.rooms` is already populated
      
      let script = document.head.querySelector(`:scope > script[data-room="${name}"]`);
      if (!script) {
        
        // Note that dynamically created scripts don't need an "async"
        // attribute as they are always async
        script = document.createElement('script');
        script.setAttribute('type', 'text/javascript');
        script.setAttribute('src', global.uri({ path: 'html.room', query: { type: 'room', room: name } }));
        script.setAttribute('data-room', name);
        document.head.appendChild(script);
        
      }
      
      if (!script.room) script.room = Promise((rsv, rjc) => {
        if (global.rooms[name]) return rsv();
        script.evt('load', rsv);
        script.evt('error', evt => rjc(evt.error ?? evt.reason ?? Error('Script failed to load - are there transport-related Errors?')));
      })
        .then(async () => {
          
          let room = global.rooms[name];
          
          /// {DEBUG=
          if (!room) throw Error(`Room "${name}" does not set global.rooms['${name}']!`);
          if (!hasForm(room, Function)) throw Error(`Dang, room "${name}" doesn't define a global Function`);
          /// =DEBUG}
          
          // Note that `room.offsets` exists based on how Rooms are
          // compiled for BELOW!
          return room();
          
        })
        .catch(cause => err.propagate({ cause, msg: `Failed to load room "${name}"` }))
        .then(room => script.room = room);
      
      let resultName = shorten ? name.split('.').slice(-1)[0] : name;
      return [ resultName, script.room ];
      
    }));
    
  };
  gsc('Configuration:', global.rawConf);
  
  /// {DEBUG=
  global.mapSrcToCmp = (file, row, col) => {
    
    // Note `file` is a String with sequential slashes (bwds and fwds)
    // replaced with a single forward slash
    // Returns `[ file, col, row, context ]`
    
    if (!global.rooms[file]) return { file, col, row, context: { problem: `No room named "${file}"` } };
    
    let { offsets } = global.rooms[file];
    if (!offsets) return { file, col, row, context: { problem: `No room named "${file}"` } };
    
    let context = {};   // Store metadata from final relevant offset
    let srcRow = 0;     // The line of code in the source which maps to the line of compiled code
    let srcCol = 0;     // Corresponding column
    let nextOffset = 0; // The index of the next offset chunk which may take effect (lookahead)
    for (let i = 0; i < row; i++) {
      
      // Find all the offsets which exist for the source line
      // For each offset increment the line in the source file
      while (offsets[nextOffset] && offsets[nextOffset].at === srcRow) {
        Object.assign(context, offsets[nextOffset]);
        srcRow += offsets[nextOffset].offset;
        nextOffset++;
      }
      srcRow++;
      
    }
    
    let roomPcs = name.split('.');
    let roomPcLast = roomPcs.slice(-1)[0];
    return {
      file,
      row: srcRow,
      col: col, //srcCol, // TODO: Map columns!
      context
    };
    
  };
  /// =DEBUG}
  
  let { hid: belowHid } = global.conf();
  let { uid=null, def, hosting } = global.conf('deploy.loft');
  let { prefix, room: loftName, keep: keepTerm } = def;
  
  // Make sure that refreshes redirect to the same session
  document.cookie = 'hut=' + global.btoa(valToJson({ hid: belowHid }));
  
  // Enable `global.real`
  gsc('OWAWAaasaggggg');
  await (async () => {
    
    let TextNode = document.createTextNode('').constructor;
    
    let Real = await global.getRoom('reality.real.Real');
    let tech = {
      installedAttrs: Set([ 'class', 'type', 'tabIndex' ]),
      makeNode: real => {
        let fullName = `${real.prefix}.${real.name}`;
        let cssName = fullName.replace(/([^a-zA-Z0-9]+)([a-zA-Z0-9])?/g, (f, p, c) => c ? c.upper() : '');
        real.node = document.createElement('div');
        real.node.classList.add(cssName);
        real.par.node.appendChild(real.node);
        return real.node;
      },
      dropNode: real => real.node.remove(),
      killInteractivity: real => {
        real.node.removeAttribute('tabIndex');
        real.node.style.pointerEvents = 'none';
      },
      reset: real => {
        
        let node = real.node;
        
        // Reset text - in Hut, browser text is always the only child
        // within its parent Node; i.e. it is always wrapped
        let kids = node.childNodes;
        if (kids.length === 1 && kids[0].constructor === TextNode) kids[0].remove();
        
        for (let attr of node.getAttributeNames())
          if (!tech.installedAttrs.has(attr))
            node.removeAttribute(attr);
        
      },
      getLayoutTech: name => {
        let [ pc0, ...pcs ] = name.split(/[.$]/);
        name = pc0[0].lower() + pc0.slice(1);
        name += pcs.map(pc => pc[0].upper() + pc.slice(1)).join('');
        return getRoom(`${hutifyPath}.layoutTech.${name}`)
      }
    };
    let body = document.body;
    if (/^[\s]+$/.test(body.textContent)) body.textContent = '';
    
    global.real = Real({ prefix, name: 'root', tech, tree: Real.Tree(), node: body });
    
  })();
  
  // `global` is set up... now run a Hut based on settings
  let { hut, record, WeakBank=null, ...loftObj } = await global.getRooms([
    'setup.hut',
    'record',
    
    // TODO: Maybe something like localstorage could allow BELOW to
    // work with KeepBank? (Would be blazing-fast client-side!!)
    'record.bank.WeakBank',
    global.conf('deploy.loft.def.room')
  ]);
  
  let aboveHid = global.conf('aboveHid');
  let heartbeatMs = global.conf('deploy.loft.hosting.heartbeatMs');
  let bank = WeakBank({ subcon: global.subcon('bank') });
  let recMan = record.Manager({ bank });
  
  let aboveHut = hut.AboveHut({ hid: aboveHid, prefix, isHere: false, recMan, heartbeatMs });
  let belowHut = aboveHut.makeBelowHut(belowHid);
  
  // Note that `netIden` is just a stub - Hinterland will want to call
  // `netIden.runOnNetwork`; BELOW we know that the Tmp produced by this
  // will never be ended, so we manually initialize all servers ("run on
  // network" functionality), and call `loft.open`, which will call
  // `Hinterland(...).open({ ..., netIden })` with the spoofed `netIden`
  
  let { netAddr, netIden: netIdenConf, protocols } = global.conf('deploy.loft.hosting');
  
  // TODO: This assumes Above never ends which may introduce annoyances
  // for development (e.g. Above restarting should refresh Below)
  let netIden = { ...netIdenConf, runOnNetwork: () => Tmp.stub };
  
  let setupServer = (protocolObj, server) => {
    
    // Any Session represents a Session with Above
    server.src.route(session => {
          
      // HutMsgs from the Session are sent from Above to us (Below)
      belowHut.seenOnRoad(server, session);
      session.hear.route(({ ms, msg }) => aboveHut.tell({ trg: belowHut, road: session, ms, msg }));
      
    });
    
  };
  
  await Promise.all(protocols.map(async protocolObj => {
    
    let { protocol, port, ...opts } = protocolObj;
    
    let protocolServer = await global.getRoom(`${hutifyPath}.protocol.${protocol}`);
    let server = protocolServer.createServer({ hut: belowHut, netIden, netProc: `${netAddr}:${port}`, ...opts });
    setupServer(protocolObj, server);
    
  }));
  
  let initComm = conf('initComm');
  if (initComm) belowHut.actOnComm({ src: aboveHut, msg: initComm });
  
  let loft = loftObj.toArr(v => v)[0];
  await loft.open({ hut: belowHut, rec: aboveHut, netIden });
  
  gsc(`Loft opened after ${(getMs() - performance.timeOrigin).toFixed(2)}ms`);
  
}});
