Error.prepareStackTrace = (err, callSites) => {
  
  if (isForm(err, SyntaxError)) return;
  
  let trace = callSites.map(cs => {
    
    // https://v8.dev/docs/stack-trace-api
    let row = cs.getLineNumber();
    let col = cs.getColumnNumber();
    
    // Get `cs.getFileName()`; if nullish there are 2 possibilities:
    // 1. This error is from an `eval` (check `cs.getEvalOrigin`)
    // 2. This error is unrelated to any line (e.g. Promise.all index)
    let rawFileName = cs.getFileName();
    
    // Option 1; check eval origin (note that we'll want to overwrite `row` and `col`, as their
    // un-overwritten values will be their index within the `eval`'d String, whereas the index of
    // where `eval` was called is *much* more useful for debugging!
    if (!rawFileName) {
      let evalOrig = cs.getEvalOrigin();
      let [ , /*rawFileName*/, row, col ] = (evalOrig ?? '').match(/(https?:[/][/].+):([0-9]+):([0-9]+)/) ?? [];
      row = parseInt(row, 10); col = parseInt(col, 10);
    }
    
    // We'll get to option 2 if `rawFileName` still (potentially even after having checked for an
    // eval origin) doesn't indicate a room; in that case, `keepTerm` takes on a nullish value!
    let keepTerm = rawFileName?.match(/\broom=([^?&/]*)/)?.[1] ?? null;
    return keepTerm
      ? { type: 'line', fnName: cs.getFunctionName(), keepTerm, row, col }
      : { type: 'info', info: cs.toString() };
    
  });
  return `${err.message}>>>HUTTRACE>>>${valToJson(trace)}<<<HUTTRACE<<<`;
  
};
let hutifyPath = 'habitat.HtmlBrowserHabitat.hutify';

global.rooms[`${hutifyPath}.workerFoundation`] = () => ({ init: async evt => {
  
  // This code needs to load fast!!!
  let evtSrc = EventTarget.prototype;
  Object.defineProperty(evtSrc, 'evt', { configurable: true, value: function(...args) {
    this.addEventListener(...args);
    return Endable(() => this.removeEventListener(...args)); // Won't work until Endable is globally defined
  }});
  
  /// {DEBUG=
  let onErr = evt => {
    // TODO: How does SharedWorker handle this?
    let err = evt.error ?? evt.reason;
    gsc(`Uncaught ${getFormName(err)}`, err);
  };
  self.evt('unhandledrejection', onErr);
  self.evt('error', onErr);
  /// =DEBUG}
  
  global.getMs = () => performance.now() + performance.timeOrigin;
  
  // TODO: No need for `global.keep`?
  // TODO: Maybe `conf` should always be accessed from the WorkerFoundation? (Shared memory even??)
  // global.conf = (diveToken, def=null) => token.diveOn(diveToken, global.rawConf, def).val;
  // let keeps = Map();
  // global.keep = Object.assign(diveToken => {
  //   let key = `/${token.dive(diveToken).join('/')}`;
  //   let keep = keeps.get(key);
  //   if (!keep) keeps.add(key, keep = HttpKeep({ path: '+hut:asset', query: { dive: key } }));
  //   return keep;
  // });
  // global.conf = (diveToken, def=null) => token.diveOn(diveToken, global.rawConf, def).val;
  global.subconOutput = (sc, ...args) => console.log(sc.term, ...args);
  
  let loadedRooms = Map();
  global.getRooms = (names, { shorten=true, ...opts }={}) => {
    
    let unseenNames = names.filter(name => !global.rooms[name]);
    gsc('Loading rooms', { names, unseenNames });
    
    // Serially import all rooms! Note that we don't need to worry about descendent dependencies
    // here (i.e. where a descendent depends on a room that's already been loaded, and we want to
    // avoid reimporting the same file) - all the scripts that will be loaded here synchronously
    // resolve to functions; before we call these functions no descendents will have an opportunity
    // to do any importing!
    global.importScripts(...unseenNames.map(room => uri({ path: '-hut:room', query: { room }})));
    
    /// {DEBUG=
    for (let name of unseenNames) {
      let room = global.rooms[name];
      if (!room) throw Error(`Room "${name}" does not set global.rooms['${name}']!`);
      if (!hasForm(room, Function)) throw Error(`Dang, room "${name}" doesn't define a global Function`);
    }
    /// =DEBUG}
    
    for (let name of unseenNames) {
      let roomContent = global.rooms[name](name);
      loadedRooms.set(name, roomContent);
      then(roomContent, content => loadedRooms.set(name, content));
    }
    
    return thenAll(names.toObj(name => [ name, loadedRooms.get(name) ]));
    
  };
  
  /// {DEBUG=
  global.subconOutput = (sc, ...args) => {
    
    if (!global.subconParams(sc).chatter) return;
    
    args = args.map(arg => isForm(arg, Function) ? arg() : arg).sift();
    if (!args.length) return;
    
    args = args.map(a => isForm(a?.desc, Function) ? a.desc() : a);
    console.log(
      `%c${getDate().padTail(60, ' ')}\n${('[' + sc.term + ']').padTail(60, ' ')}`,
      'background-color: #dadada;font-weight: bold;',
    );
    console.log(...args);
    
  };
  global.mapCmpToSrc = (file, row, col) => {
    
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
    
    return {
      file,
      row: srcRow,
      col: col, //srcCol, // TODO: Map columns!
      context
    };
    
  };
  /// =DEBUG}
  
  /*
  // Note that `aboveHid` is the server's unique `hid` value, whereas `belowHid` can also be called
  // the "assigned hid" - i.e. the hid the server has provided for this client
  let { hid: belowHid, aboveHid, deploy: { uid, host } } = global.conf();
  let { netAddr, netIden: netIdenConf, protocols: pcls, heartbeatMs } = host;
  pcls = pcls.toArr(v => v); // Otherwise `pcls ~== { 0: pclConf0, 1: pclConf1, ... }`
  
  // Make sure that refreshes redirect to the same session
  document.cookie = 'hut=' + global.btoa(valToJson({ hid: belowHid }));
  */
  
  { // Enable `global.real`
    
    let FakeReal = form({ name: 'FakeReal', has: { Tmp }, props: (forms, Form) => ({
      init({ name, tech }) {
        forms.Tmp.init.call(this);
        Object.assign(this, { name, tech, params: {
          textInputSrc: { mod: Function.stub, route: fn => fn(''), send: Function.stub }
        }});
      },
      loaded: Promise.resolve(),
      setTree() {},
      addReal(/* real */) { return this; },
      mod() {},
      addLayout() { return  Tmp({ layout: fakeLayout }); },
      getLayout() { return fakeLayout; },
      getLayoutForm(/* name */) { return FakeLayout; },
      getTech() { return this.tech; },
      addNavOption() { return { activate: () => {} }; },
      render() {}
    })});
    let FakeLayout = form({ name: 'FakeLayout', has: { Src }, props: forms => ({
      init() { forms.Src.init.call(this); this.keysSrc = Src.stub; },
      isInnerLayout() { return false; },
      setText() {},
      addReal() {},
      route: Function.stub,
      src: Src.stub
    })});
    
    let fakeLayout = FakeLayout();
    global.real = FakeReal({ name: 'nodejs.fakeReal', tech: {
      render: Function.stub,
      informNavigation: Function.stub,
      getLayoutForm: name => FakeLayout,
      getLayoutForms: names => names.toObj(name => [ name, FakeLayout ]),
      render: Function.stub
    }});
    
  };
  
  let confPrm = global.confPrm;
  
  // `global` is set up... now run a Hut based on settings
  let loftName = global.conf('deploy.loft.name');
  let roomsPrm = await global.getRooms([
    'setup.hut',
    'record',
    
    // TODO: Maybe something like localstorage could allow BELOW to work with KeepBank? (Would be blazing-fast client-side!!)
    'record.bank.WeakBank',
    loftName,
    ...pcls.map(p => `${hutifyPath}.protocol.${p.name}`)
  ]);
  
  gsc('Waiting for conf + rooms...');
  confPrm.then(conf => gsc('GOT CONF', { conf }));
  roomsPrm.then(rooms => gsc('GOT ROOMS', { rooms }));
  let [ conf, rooms ] = await Promise.all([ confPrm, roomsPrm ]);
  
  gsc('OMG, GOT CONF + ROOMS!');
  
  {
    
    let WorkerRoadAuthority = form({ name: 'WorkerRoadAuthority', props: (forms, Form) => ({
      
      init({ aboveHut, sc=subcon(`road.sw`) }) {
        Object.assign(this, { aboveHut, sc });
      },
      desc() { return `sw://localhost`; },
      activate() {
        
        let { worker } = global;
        
        /// {DEBUG=
        if (worker['~authority']) throw Error(`Multiple WorkerRoadAuthorities using same Worker!`);
        worker['~authority'] = this;
        /// =DEBUG}
        
        // Get `bufferedTabs` and `bufferedEvts` - together these contain the full information of all
        // Road events which already happened, concerning this WorkerRoadAuthority
        let { bufferedTabs, bufferedEvts } = worker;
        delete worker.initialFn;
        delete worker.bufferedTabs;
        
        // Clear the buffering logic for the Worker and replace with real Tab connection handler
        // TODO: If it turns out that each Port in `tab.ports` can close independently, it may make
        // sense to consider each Port a different Road! (Could have some silly effects on, e.g.,
        // heartbeat, though)
        worker.removeEventListener('connect', worker.initialFn);
        worker.evt('connect', tab => this.tab(tab));
        
        // Clear the buffering logic for each Port of each Tab
        // (Note: the stupid thing is that there's almost certainly only 1 Port per Tab)
        for (let { tab } of bufferedTabs) {
          for (let port of tab.ports) port.removeEventListener('message', tab.initialFn);
          delete tab.initialFn;
        }
        
        // Process all events which occurred before installing the WorkerRoadAuthority
        // There should be no issue processing all Tabs, then all Evts
        for (let tab of bufferedTabs) this.tab(tab);
        for (let { tab, evt } of bufferedEvts) this.evt(tab, evt);
        
      },
      makeRoad(belowHut, params /* { tab } */) { return (0, Form.WorkerRoad)({ roadAuth: this, belowHut, ...params }); },
      
      tab(tab) {
        
        let { belowHut, road } = this.aboveHut.getBelowHutAndRoad({
          roadAuth: this, trn: 'async', hid: tab.origin, // TODO: "origin"?
          params: { tab }
        });
        /// {DEBUG=
        if (tab['~belowHut']) throw Error('Multiple BelowHuts for same Tab');
        if (tab['~road']) throw Error('Multiple Roads for same Tab');
        /// =DEBUG}
        Object.assign(tab, { '~belowHut': belowHut, '~road': road });
        
      },
      evt(tab, evt) {
        
        // Called when a tab sends us an event
        this.aboveHut.hear({ src: tab['~belowHut'], road: tab['~road'], msg: evt.data });
        
      },
      
      $WorkerRoad: form({ name: 'WorkerRoad', has: { Tmp }, props: forms => ({
        init({ roadAuth, belowHut, tab }) {
          
          forms.Tmp.init.call(this);
          Object.assign(this, { roadAuth, belowHut, tab });
          
          let handlers = tab.ports.map(port => port.evt('message', evt => roadAuth.evt(tab, evt)));
          this.endWith(() => handlers.each(h => h.end()));
          
          // tab.evt('close', () => this.end()); // TODO: Never happens! Need heartbeat to detect tab closed (should get that for free?)
          
        },
        desc() { return `${getFormName(this)}(${this.roadAuth.desc()} <-> ${this.belowHut.hid}@[localhost])`; },
        currentCost() { return 0.1; },
        tellAfar(msg) { this.tab.ports[0].postMessage(msg); }
      })})
      
    })});
    let roadAuth = WorkerRoadAuthority({ aboveHut });
    gsc({ roadAuth });
    
  }
  
  return;
  
  let { hut, record, WeakBank, [loftName.split('.').at(-1)]: loft, ...pclServers } = rooms;
  let bank = WeakBank({ sc: global.subcon('bank') });
  let recMan = record.Manager({ bank });
  
  foundationTmp.endWith(() => aboveHut.end());
  
  // Note that `netIden` is just a stub - the nodejs foundation uses a
  // real NetworkIdentity instance to run serve all protocols together,
  // because it allows for sophisticated network management - e.g. cert
  // management, https redirects, etc; in the browser we manually start
  // all servers and call `loft.open`!
  
  // TODO: This assumes Above never ends which may introduce annoyances
  // for development (e.g. Above restarting should refresh Below)
  let netIden = { ...netIdenConf };
  let secure = netIden.secureBits > 0;
  let aboveHut = hut.AboveHut({ hid: aboveHid, isHere: false, recMan, heartbeatMs });
  
  let roadAuths = pcls.map(({ name, port, ...opts }) => {
    let RoadAuthForm = pclServers[name];
    return RoadAuthForm({ aboveHut, secure, netProc: `${netAddr}:${port}`, ...opts });
  });
  let activePrms = roadAuths.map(ra => ra.activate());
  foundationTmp.endWith(() => activePrms.each(p => p.end()));
  
  // Providing the same `belowHid` initiates only one BelowHut
  // Note that RoadAuthorities BELOW should never require any params passed to their Roads
  for (let roadAuth of roadAuths) aboveHut.getBelowHutAndRoad({ roadAuth, hid: belowHid, params: {} });
  
  // Get the single BelowHut
  let belowHut = aboveHut.belowHuts.values().next().value;
  
  // Set up the Locus
  // TODO: The real solution to the problem of a single BelowHut (user) with multiple tabs open
  // (multiple Locuses) is to set to some Hut in a SharedWorker, and for each tab, a separate Hut
  // is used. Some potential ways to do this:
  // - The SharedWorker uses the legendary BetweenHut; tabs use BelowHuts as usual
  // - SharedWorker uses a BelowHut (which should already fully work); tab uses *another* BelowHut
  //   (this is probably stupid - it's using a BelowHut exactly where a BetweenHut is intended)
  let locus = recMan.addRecord({ type: 'hut.locus', uid: '!locus', group: [ belowHut ], value: conf('locus') });
  locus.valueSrc.route(({ term='Hut!', diveToken=[] }={}) => {
    window.document.title = term;
    window.history.pushState(null, term, `/${diveToken.join('/')}`);
  });
  
  // TODO: Intercept link clicks to the same origin - they should modify `window.location` and the
  // Locus value, allowing a new page to load without a full http refresh! It may be possible to
  // intercept user navigation via back/forwards browser buttons; I don't think it's possible to
  // intercept navigations which occur when user types in new url and hits enter
  
  // Process the initial command
  let initComm = conf('initComm');
  if (initComm) belowHut.processCommand({ src: aboveHut, msg: initComm });
  
  await loft.open({ sc: global.subcon('loft'), prefix: conf('deploy.loft.prefix'), hereHut: belowHut, rec: aboveHut });
  
  gsc(`Loft opened after ${(getMs() - performance.timeOrigin).toFixed(2)}ms`);
  
}});
