global.rooms['habitat.HtmlBrowserHabitat.hutify.foundation'] = () => ({ init: async evt => {
  
  // We're going to be stingy with this code; the smaller+faster this
  // file is, the better the user experience! Note this file
  // interoperates nicely with the typical Hut style of loading Rooms,
  // but in the browser this code should be referenced manually and
  // run after the DOMContentLoaded event (obvs we can't reference the
  // Room with `getRoom`, as the logic for doing so is only defined
  // after this code has ran!)
  
  Error.prepareStackTrace = (err, callSites) => {
    let trace = callSites.map(cs => {
      
      // https://v8.dev/docs/stack-trace-api
      let rawFileName = cs.getFileName();
      let row = cs.getLineNumber();
      let col = cs.getColumnNumber();
      if (!rawFileName) {
        let evalOrig = cs.getEvalOrigin();
        let match = [ , rawFileName=null, row, col ] = (evalOrig ?? '').match(/(https?:[/][/].+):([0-9]+):([0-9]+)/) ?? [];
        [ row, col ] = [ row, col ].map(v => parseInt(v, 10));
      }
      
      if (!rawFileName) rawFileName = '<unknown>';
      let [ , roomName=rawFileName ] = rawFileName.match(/\broom=([^?&/]*)/) ?? [];
      return { fnName: cs.getFunctionName(), keepName: roomName, row, col };
      
    });
    return `${err.message}{HUT${'T'}RACE=${JSON.stringify(trace)}=HUT${'T'}RACE}`;
  };
  
  let onErr = evt => {
    
    let err = evt.error || evt.reason;
    
    // Don't modify SyntaxErrors - they only show proper
    // stack information when they're logged natively
    if (err?.constructor?.name?.hasHead('Syntax')) return;
    
    gsc(err.desc());
    evt.preventDefault();
    
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
  
  let rootReal = null; // TODO: HEEERE!
  
  global.getMs = Date.now;
  global.keep = (...args) => { throw Error(`Lol wut`).mod({ args }); };
  global.conf = (...chain) => {
    
    // Resolve nested Arrays and period-delimited Strings
    chain = chain.map(v => isForm(v, String) ? v.split('.') : v).flat(Infinity);
    
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
    
    args = args.map(arg => isForm(arg, Function) ? arg() : arg).filter(Boolean);
    if (!args.length) return;
    console.log(
      `%c${getDate().padTail(80, ' ')}\n${sc.term.padTail(80, ' ')}`,
      'background-color: rgba(0, 0, 0, 0.2);',
    );
    console.log(...args);
    
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
        script.setAttribute('src', global.url({ path: 'html.room', query: { type: 'room', room: name } }));
        script.setAttribute('data-room', name);
        document.head.appendChild(script);
        
      }
      
      if (!script.roomPrm)
        script.roomPrm = Promise((rsv, rjc) => {
          if (global.rooms[name]) return rsv();
          script.evt('load', rsv, { once: true });
          script.evt('error', rjc, { once: true });
        })
          .catch(cause => err.propagate({ cause, msg: `Failed to load room "${name}"` }))
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
          .then(room => script.roomPrm = room);
      
      let resultName = shorten ? name.split('.').slice(-1)[0] : name;
      return [ resultName, script.roomPrm ];
      
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
  
  // Enable `global.real`
  gsc('OWAWAaasaggggg');
  await (async () => {
    
    let FakeReal = form({ name: 'FakeReal', has: { Tmp }, props: (forms, Form) => ({
      init({ name, tech }) {
        forms.Tmp.init.call(this);
        Object.assign(this, {
          name, tech,
          fakeLayout: null,
          params: { textInputSrc: { mod: Function.stub, route: fn => fn(''), send: Function.stub }}
        });
      },
      loaded: Promise.resolve(),
      setTree() {},
      addReal(real) { return this; },
      mod() {},
      addLayout: lay => Tmp({ layout: { src: Src.stub, route: Function.stub } }),
      getLayout() { return this.fakeLayout || (this.fakeLayout = this.getLayoutForm('FakeBoi')()); },
      getLayoutForm(name) { return this.tech.getLayoutForm(name); },
      getTech() { return this.tech; },
      addNavOption() { return { activate: () => {} }; },
      render() {}
    })});
    let FakeLayout = form({ name: 'FakeLayout', has: { Src }, props: (forms, Form) => ({
      init() { forms.Src.init.call(this); this.keysSrc = Src.stub; },
      isInnerLayout() { return false; },
      setText(){},
      addReal(){},
      src: Src.stub
    })});
    
    let fakeReal = FakeReal({ name: 'nodejs.fakeReal', tech: {
      render: Function.stub,
      informNavigation: Function.stub,
      getLayoutForm: name => fakeLayout,
      getLayoutForms: names => names.toObj(name => [ name, fakeReal.getLayoutForm(name) ]),
      render: Function.stub
    }});
    let fakeLayout = FakeLayout();
    
    global.real = terms => {
      
      if (isForm(terms, String)) terms = terms.split(',');
      if (terms.length !== 0) throw Error(`Must supply [] (only the RootReal can be accessed here)`);
      return fakeReal;
      
    };
    
  })();
  
  // `global` is set up... now run a Hut based on settings
  let { uid=null, def, hosting } = global.conf('deploy.loft');
  let { prefix, room: loftName, keep: keepTerm } = def;
  gsc({ uid, def, hosting, prefix, loftName, keepTerm });
  let { hut, record, WeakBank=null, ...loftObj } = await global.getRooms([
    'setup.hut',
    'record',
    
    // TODO: Maybe something like localstorage could allow BELOW to
    // work with KeepBank? (Would be blazing-fast client-side!!)
    'record.bank.WeakBank',
    global.conf('deploy.loft.def.room')
  ]);
  
  let heartbeatMs = global.conf('deploy.loft.hosting.heartbeatMs');
  let bank = WeakBank({ subcon: global.subcon('bank') });
  let recMan = record.Manager({ prefix, bank });
  let aboveHut = hut.AboveHut({ hid: '!above', prefix, isHere: false, recMan, heartbeatMs });
  let belowHut = aboveHut.makeBelowHut(global.conf('hid'));
  
  // Note that `netIden` is just a stub - Hinterland will want to call
  // `netIden.runOnNetwork`; BELOW we know that the Tmp produced by this
  // will never be ended, so we manually initialize all servers ("run on
  // network" functionality), and call `loft.open`, which will call
  // `Hinterland(...).open({ hut, netIden })` with the spoofed `netIden`
  
  let { netAddr, netIden: netIdenConf, protocols } = global.conf('deploy.loft.hosting');
  
  // TODO: This assumes Above never ends which may introduce annoyances
  // for development (e.g. Above restarting should refresh Below)
  let netIden = { ...netIdenConf, runOnNetwork: () => Tmp.stub };
  
  let setupServer = (protocolObj, server) => {
    
    // Any Session represents a Session with Above
    server.src.route(session => {
          
      // HutMsgs from the Session are sent from Above to us (Below)
      session.hear.route(({ ms, msg }) => aboveHut.tell({ trg: belowHut, road: session, ms, msg }));
      
    });
    
    // Every Server immediately creates a Session with the AboveHut
    let road = Tmp({ key: '!above', tell: Src(), hear: Src() });
    belowHut.seenOnRoad(server, road);
    server.src.send(road);
    
  };
  
  await Promise.all(protocols.map(async protocolObj => {
    
    let { protocol, port, ...opts } = protocolObj;
    
    let protocolServer = await global.getRoom(`habitat.HtmlBrowserHabitat.hutify.protocol.${protocol}`);
    let server = protocolServer.createServer({ hut: belowHut, netIden, netProc: `${netAddr}:${port}`, ...opts });
    setupServer(protocolObj, server);
    
  }));
  
  let loft = loftObj.toArr(v => v)[0];
  await loft.open({ hut: belowHut, netIden });
  
}});
