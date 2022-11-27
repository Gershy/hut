let { Foundation } = global;

global.FoundationBrowser = form({ name: 'FoundationBrowser', has: { Foundation }, props: (forms, Form) => ({
  
  $KeepBrowser: form({ name: 'KeepBrowser', has: { Keep }, props: forms => ({
    init(foundation) {
      
      forms.Keep.init.call(this);
      
      let urlResourceKeep = Form.KeepUrlResources(foundation.hutId);
      this.keepsByType = Object.plain({
        static: Form.KeepStatic(urlResourceKeep),
        urlResource: urlResourceKeep
      });
      
    },
    access(type) {
      let keep = this.keepsByType[type];
      if (keep) return keep;
      throw Error(`KeepBrowser can't access "${type}"`);
    }
  })}),
  $KeepStatic: form({ name: 'KeepStatic', has: { Keep }, props: forms => ({
    init(urlResourceKeep) {
      Object.assign(this, { urlResourceKeep });
    },
    access(fpCmps) {
      return this.urlResourceKeep.access({ path: [ '!static', ...fpCmps ].join('/') });
    }
  })}),
  $KeepUrlResources: form({ name: 'KeepUrlResources', has: { Keep }, props: forms => ({
    init(hutId) { this.hutId = hutId; },
    access({ path='', params={} }) { return Form.KeepUrlResource(this.hutId, path, params); }
  })}),
  $KeepUrlResource: form({ name: 'KeepUrlResource', has: { Keep }, props: forms => ({
    init(hutId, path='', params={}) {
      forms.Keep.init.call(this);
      Object.assign(this, { hutId, path, params });
    },
    getUrlParams(mode='anon') {
      if (![ 'anon', 'iden' ].has(mode)) throw Error(`Invalid mode: "${mode}"`);
      return (mode === 'iden')
        ? { trn: 'sync', hutId: this.hutId, command: this.path, ...this.params }
        : { command: this.path, ...this.params };
    }
  })}),
  $TextNode: document.createTextNode('').constructor,
  
  // Initialization
  init() {
    
    /// {DEBUG=
    if (!window['~topLevelErrsHandled']) {
      
      window['~topLevelErrsHandled'] = true;
      let onErr = evt => {
        
        let err = evt.error || evt.reason;
        
        // Don't modify SyntaxErrors - they only show proper
        // stack information when they're logged natively
        if (err && err.constructor && err.constructor.name.hasHead('Syntax')) return;
        
        console.error(this.formatError(err));
        this.halt();
        evt.preventDefault();
        
      };
      window.addEventListener('unhandledrejection', onErr);
      window.addEventListener('error', onErr);
      
    }
    /// =DEBUG}
    
    forms.Foundation.init.call(this);
    
    Object.assign(this, {
      hutId: null,
      viewId: this.getUid(),
      aboveHut: Promise.later(),
      belowHut: Promise.later(),
      aboveOffsetMs: null,
      servers: Set(),
      fixedUrls: Object.plain() // "/url/without/caching" -> "/url/with?!=value"
    });
    
    then(this.aboveHut, aboveHut => this.aboveHut = aboveHut);
    then(this.belowHut, belowHut => this.belowHut = belowHut);
    
    // End the Foundation when the user navigates away
    window.addEventListener('beforeunload', evt => this.end());
    
  },
  halt() { debugger; },
  restart() {
    if (this.off()) return gsc('Restart suppressed because Foundation ended');
    global.location.reload(true);
  },
  configure(data) {
    
    let conf = forms.Foundation.configure.call(this, data);
    
    // We'll use these values for additional configuration
    let { hutId, utcMs, ageMs } = [ 'hutId', 'utcMs', 'ageMs' ].toObj(n => [ n, conf.seek(n).val ])
    
    // Make sure that refreshes redirect to the same session
    document.cookie = 'hut=' + global.btoa(JSON.stringify({ hutId }));
    
    // When `foundation.getMs` is called on the ABOVE server it will
    // return a high-precision millisecond value representing how long
    // the ABOVE server has been running. Our goal is to compute calls
    // to `this.getMs` such that if they are called at the exact same
    // time as a call to the ABOVE server, both calls will return the
    // closest possible value. We assume that `Date.now()` already has
    // extremely close return values when called both Afar and Here.
    
    // Should always be a positive value - `utcMs` represents when the
    // response was generated; `Date.now()` represents when the
    // response was recieved+processed, and should always come later!
    let latencyMs = Date.now() - utcMs;
    if (latencyMs < 0) console.log(`Uh oh - latencyMs should be positive (it's ${latencyMs})`);
    
    // Note that `performance.now` will drive calls to `this.getMs`.
    // - Add on `latencyMs` to compensate for the fact that the server
    //   is currently ahead of the present moment by the latency
    //   amount
    // - Subtract the current `performance.now()` values so future
    //   calls to `this.getMs`, which are driven by `performance.now`,
    //   have their origin at this exact moment
    // - Add on the current age of ABOVE
    
    Object.assign(this, { hutId, aboveOffsetMs: latencyMs - performance.now() + ageMs });
    
  },
  ensureSingleTab() {
    
    // TODO: Support multiple tabs! (Probably with a SharedWorker)
    let { localStorage: storage } = window;
    if (!storage) throw Error(`No "localStorage" available`);
    
    // Set our view under the hid; end this Foundation if the value ever
    // changes!
    let hutKey = `view/${this.hutId}`;
    storage.setItem(hutKey, `${this.viewId}/${Date.now().toString(32)}`);
    let evtFn = null;
    window.addEventListener('storage', evtFn = e => {
      
      if (e.key !== hutKey) return;
      
      // Any other event means another tab took control
      this.subcon('multiview')(`Lost view priority (hut: ${this.hutId}, view: ${this.viewId})`, e);
      window.removeEventListener('storage', evtFn);
      this.end();
      
      let children = document.body.querySelectorAll(':scope > *');
      for (let child of children) child.remove();
      
      let anchor = document.createElement('a');
      anchor.classList.add('view');
      anchor.setAttribute('href', this.getFoundationUrlPath());
      anchor.textContent = 'To use this tab click or refresh';
      document.body.appendChild(anchor);
      
    });
    
    this.subcon('multiview')(`Took view priority (hut: ${this.hutId}, view: ${this.viewId})`);
    
  },
  async hoist(...args) {
    
    this.ensureSingleTab();
    
    //let t = this.getMs();
    let Hut = await this.getRoom('Hut');
    //gsc('GOT HUT', this.getMs() - t);
    
    // `aboveHut` represents a guaranteed Server: the AboveHut that
    // generated our html
    let aboveHut = Hut({ uid: '!above', parHut: null, isHere: false, isManager: false, isRec: false });
    let roads = [];
    Object.assign(aboveHut, {
      '~roads': roads,
      getRoadFor: hut => {
        let road = null;
        let cost = Infinity;
        for (let r of roads) { let c = r.currentCost(); if (c < cost) [ cost, road ] = [ c, r ]; }
        return road;
      }
    });
    
    // `belowHut` represents this Browser environment; the Hut is
    // Below, but it is the Parent nonetheless
    let belowHut = Hut({ uid: this.hutId, parHut: aboveHut, isHere: true, isManager: true });
    
    this.belowHut.resolve(belowHut);
    this.aboveHut.resolve(aboveHut);
    //gsc('RESOLVED HUTS', this.getMs() - t);
    
    let msg = this.seek('conf', 'syncTell').val;
    if (msg) belowHut.hear({ src: aboveHut, msg, road: { desc: () => 'FakeRoad()' } });
    //gsc('DID INITIAL TELL', this.getMs() - t, msg);
    
    await forms.Foundation.hoist.call(this, ...args);
    //gsc('HOISTED', this.getMs() - t);
    
  },
  
  // Sandbox
  getFoundationUrlPath() {
    let { pathname='/', search='' } = window.location;
    return pathname + search;
  },
  getMs() { return performance.now() + this.aboveOffsetMs; },
  getUrl(arg /* { command, query } */, { fixed=false }={}) {
    
    // Note that providing "fixed" will ensure that, if the same url has
    // been seen before with some cache-version-value, the same version
    // url will be returned! This means that even in "dev" calls to this
    // method with `fixed === true` resolve to the same cached value
    
    if (!fixed) return forms.Foundation.getUrl.call(this, arg);
    
    let raw = this.getRawUrl(arg);
    return this.fixedUrls[raw] || (this.fixedUrls[raw] = forms.Foundation.getUrl.call(this, arg));
    
  },
  
  // Config
  processArg(term, val) { return forms.Foundation.processArg(term, val); },
  
  // Services
  createHut(opts={}) { return this.belowHut; },
  async createReal() {
    
    let htmlCssJsTech = {
      
      // css techniques:
      // https://css-tricks.com/almanac/properties/c/contain/
      
      multTextSizeEmToHeight: {
        
        // For a given font-family, and a given em "textSize", these
        // values multiply against "textSize" such that the resulting
        // value `calc(textSize * multTextSizeEmToHeight[fontFamily])`
        // produces a height equal to the height of an element with text
        // set to `textSize`
        'def': 1.15,
        'monospace': 1.17,
        'Times New Roman': 1.15
        
      },
      
      name: 'HtmlCssJsTech',
      render: (real, delta) => {
        
        let domNode = real.domNode;
        
        // Note that `real` may render even if it's `off()` - this is
        // to facilitate Reals which change visually as they end. Many
        // Reals don't change visually as they end - these are
        // detectable as they have no `parentNode`: (TODO: Hacky?)
        if (real.off() && !domNode.parentNode) return;
        
        // Naive: ignoring `delta` purify Real & apply all layouts
        
        let childNodes = [ ...domNode.childNodes ];
        let textNode = (childNodes.count() === 1 && isForm(childNodes[0], Form.TextNode)) ? childNodes[0] : null;
        if (textNode) textNode.remove();
        domNode.removeAttribute('style');
        
        for (let layout of real.getLayouts()) layout.render(real, domNode);
        
      },
      getLayoutForms: names => this.getRooms(names.map(name => `internal.real.htmlBrowser.${name}`)),
      getLayoutForm: name => then(htmlCssJsReal.tech.getLayoutForms([ name ]), forms => forms[name]),
      select: (real=null) => {
        
        // Clear previous selection
        window.getSelection().removeAllRanges();
        
        // Select `real` if non-null
        if (!real) return;
        
        // Create new selection
        let selRange = document.createRange();
        selRange.selectNodeContents(real.domNode);
        window.getSelection().addRange(selRange);
        
      },
      informNavigation: async navOpt => {
        
        if (!navOpt) return;
        
        let htmlId = navOpt.getChain().map(n => n.term).join('/');
        let elem = document.getElementById(htmlId);
        if (!elem) return;
        
        let { top } = elem.getBoundingClientRect().top;
        if (top > -3 && top < window.innerHeight) return;
        
        (async () => {
          
          let heightAttempts = 0;
          while (elem.getBoundingClientRect().height === 0 && (++heightAttempts < 30)) {
            await Promise(requestAnimationFrame);
          }
          
          if (elem.getBoundingClientRect().height === 0) return console.log(`No height for "${htmlId}"`);
          //console.log(`Took ${heightAttempts} animation frames for "${htmlId}" to position fully`);
          
          let top = elem.getBoundingClientRect().top;
          
          // TODO: Very ugly
          // Expect the element to be very near the top of the window;
          // this probably doesn't work in some cases (like linked
          // elements at the bottom of the page). Also need to check
          // `top` against `-1` instead of `0` because sometimes
          // scrolled-to nodes will have a small negative `top` value.
          if (top < -1 || top > (window.innerHeight * 0.1)) elem.scrollIntoView();
          let tabIndex = elem.getAttribute('tabIndex');
          elem.setAttribute('tabIndex', '0');
          elem.focus();
          setTimeout(() => {
            tabIndex === null ? elem.removeAttribute('tabIndex') : elem.setAttribute('tabIndex', tabIndex);
          }, 850);
          
        })();
        
      },
      informInitialized: () => htmlCssJsTech.navToChain(),
      navToChain: async (navChain=null) => {
        
        // TODO: Move navigation to a separate Room??
        
        // Get default nav chain from current url hash
        if (!navChain) navChain = window.location.hash.slice(1).split('/').map(v => v || C.skip);
        
        // Disable all NavOpts, without enabling any new ones
        if (!navChain.count()) {
          
          let navActiveTmp = htmlCssJsReal?.navPar?.activeTmp ?? null;
          if (navActiveTmp) {
            navActiveTmp.end();
          } else if (htmlCssJsReal.navOpts) {
            htmlCssJsReal.navOpts
              .toArr(no => no.activeTmp || C.skip)
              .each(activeTmp => activeTmp.end());
          }
          return;
          
        }
        
        let ptr = htmlCssJsReal;
        for (let term of navChain) {
          
          if (!ptr.navOpts || !ptr.navOpts.has(term)) throw Error(`Can't advance from Real "${ptr.name}" to NavOpt termed "${term}"`);
          let navOpt = ptr.navOpts.get(term);
          navOpt.activate();
          ptr = await navOpt.real;
          
        }
        
      }
      
    };
    
    let Real = await this.getRoom('internal.real.htmlBrowser.Real');
    let htmlCssJsReal = Real({ name: 'browser.htmlCssJs', tech: htmlCssJsTech, domNode: document.body });
    
    let urlChangeFn = (term, evt) => {
      console.log('URL CHANGE:', term, window.location.toString());
      evt.preventDefault();
      htmlCssJsTech.navToChain();
    };
    window.addEventListener('popstate', urlChangeFn.bind(null, 'popstate'));
    window.addEventListener('hashchange', urlChangeFn.bind(null, 'haschange'));
    
    return { access: n => { if (n !== 'primary') throw Error(`Invalid access for Real -> "${n}"`); return htmlCssJsReal; } };
    
  },
  createKeep(opts={}) { return Form.KeepBrowser(this); },
  createConf(opts={}) {
    
    let conf = forms.Foundation.createConf.call(this, opts);
    
    conf.schema.fn = (obj, conf) => {
      for (let [ name, val ] of obj) conf.getKid(name).setVal(val);
      return obj;
    };
    
    return conf;
    
  },
  
  // Transport
  setupServer({ hut, server, cost }) {
    
    // All Sessions connect FoundationBrowser to an AboveHut; this logic
    // ensures that RoadedHuts are populated as such
    
    let heartbeatMs = this.conf('heartbeatMs');
    heartbeatMs = Math.max(heartbeatMs * 0.9, heartbeatMs - 3000);
    
    let Hut = hut.Form;
    
    let getHutForSession = session => {
      
      /// {DEBUG=
      if (session.key !== '!above') throw Error(`Unexpected Session key: "${session.key}"`);
      /// =DEBUG}
      
      return this.aboveHut;
      
    };
    
    // Any Sessions joining any Server have Hears/Tells directed to the
    // appropriate Hut
    server.src.route(session => {
      
      let timeout = setTimeout(() => session.tell.send({ command: 'lubdub' }), heartbeatMs);
      session.tell.route(() => {
        clearTimeout(timeout);
        timeout = setTimeout(() => session.tell.send({ command: 'lubdub' }), heartbeatMs);
      }, 'prm');
      
      let srcHut = getHutForSession(session);
      // TODO: No `replyable` / `reply` needed??
      session.hear.route(({ ms, msg }) => srcHut.tell({ trg: hut, road: session, ms, msg }));
      
    });
    
    // Every Server immediately creates a Session with the AboveHut
    then(this.aboveHut, aboveHut => {
      
      // TODO: If there's ever a sense of "server management" Below, like
      // how NetworkIdentities manage Servers Above, there needs to be
      // some consideration of resending the AboveHut as a Session each
      // time the Server reopens
      
      let road = Tmp({
        key: '!above',
        currentCost: () => cost,
        tell: Src(),
        hear: Src()
      });
      hut.getRoadFor = otherHut => {
        if (otherHut !== aboveHut) throw Error(`Best-road query should always include the AboveHut (included ${otherHut.desc()})`);
        return aboveHut.getRoadFor(hut);
      };
      this.aboveHut['~roads'].add(road);
      server.src.send(road);
      
    });
    
    this.servers.add(server);
    server.endWith(() => this.servers.rem(server));
    
  },
  createHttpServer({ hut, netIden, host, port }) {
    
    let server = Tmp({
      
      desc: () => `HTTP://${host}:${port}`,
      netIden, host, port,
      src: Src(),
      abort: new AbortController(),
      activeReqs: 0
      
    });
    server.endWith(() => server.abort.abort(Error('Server closed')));
    
    // TODO: Think about how to clean this up so the logic which results
    // in a refresh is clearer! Right now refreshes are ignored if the
    // Foundation was explicitly ended for losing tab priority!
    server.src.route(session => {
      
      let err = Error('');
      let route = session.tell.route(async msg => {
        
        server.activeReqs++;
        try {
          
          let res = await fetch('/', {
            method: 'post'.upper(),
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: valToJson({ trn: 'async', hutId: this.hutId, command: 'bp', ...msg }), // TODO: Would be nice to wrap `msg` to avoid property collisions
            signal: server.abort.signal,
            redirect: 'error'
          });
          
          if (res.status > 400) throw Error(`Bad request (${res.status})`);
          
          // Process response as a Tell
          let ms = this.getMs();
          let data = (res.status === 204) ? null : await res.json();
          if (data !== null) session.hear.send({ ms, reply: null, msg: data });
          
        } catch (err) {
          
          route.end();
          if (err?.message.has('abort')) gsc(`Http fetch aborted (ignore; presumably unloading!)`);
          else { gsc(`Error with http fetch (refreshing)`, err); this.restart(); }
          
        }
        server.activeReqs--;
        
        // Ensure at least 1 banked poll is always available
        if (server.activeReqs < 1) this.soon().then(() => session.tell.send(''));
        
      });
      session.endWith(route);
      
      // Immediately bank a request
      session.tell.send('');
      
    });
    
    this.setupServer({ hut, server, cost: 0.5 });
    
    return server;
    
  },
  createSoktServer({ hut, netIden, host, port }) {
    
    if (!global.WebSocket) return null;
    
    let server = Tmp({ desc: () => `SOKT @ ${host}:${port}`, netIden, host, port, src: Src() });
    
    server.src.route(session => {
      
      server.endWith(session, 'tmp');
      
      // TODO: Detect ssl properly!
      let socket = new global.WebSocket(`${port >= 400 ? 'wss' : 'ws'}://${host}:${port}/?trn=sync&hutId=${this.hutId}`);
      socket.addEventListener('error', err => {
        this.subcon('warning')('Socket error event', err);
      });
      socket.addEventListener('close', () => session.end());
      
      let openPrm = Promise((rsv, rjc) => {
        socket.addEventListener('open', rsv, { once: true });
        socket.addEventListener('error', rjc, { once: true });
      });
      session.endWith(() => socket.close());
      
      socket.addEventListener('message', ({ data: msg, ...stuff }) => {
        msg = jsonToVal(msg);
        if (msg) session.hear.send({ ms: this.getMs(), reply: null, msg });
      });
      
      let routeBeforeConnect = session.tell.route(async data => {
        if (!data) return;
        await openPrm;
        socket.send(valToJson(data));
      });
      session.endWith(routeBeforeConnect);
      
      openPrm.then(() => {
        
        routeBeforeConnect.end();
        let routeAfterConnect = session.tell.route(data => data && socket.send(valToJson(data)));
        session.endWith(routeAfterConnect);
        
      });
      
    });
    
    this.setupServer({ hut, server, cost: 0.2 });
    
    return server;
    
  },
  
  // Room
  async installRoom(name, { bearing='below' }={}) {
    
    if (global.rooms[name]) return { debug: global.roomDebug[name], content: global.rooms[name](this) };
      
    let script = document.head.querySelector(`:scope > script[data-room="room/${name}"]`);
    if (!script) {
      script = document.createElement('script'); // Note that dynamically created scripts don't need an "async" attribute as they are always async
      script.setAttribute('type', 'text/javascript');
      script.setAttribute('src', this.getUrl({ command: 'html.room', type: 'room', room: name }));
      script.setAttribute('data-room', `room/${name}`);
      document.head.appendChild(script);
    }
    
    // Wait for the script to load; ensure it populated `global.rooms`
    await Promise((rsv, rjc) => {
      script.addEventListener('load', rsv, { once: true });
      script.addEventListener('error', err => rjc(err.mod(m => `Couldn't load room "${name}" (${m})`)), { once: true });
    });
    
    /// {DEBUG=
    if (!global.rooms[name]) throw Error(`Room "${name}" does not set global.rooms['${name}']!`);
    /// =DEBUG}
    
    return { debug: global.roomDebug[name], content: global.rooms[name](this) };
    
  },
  
  /// {DEBUG=
  // Error
  parseErrorLine(line) {
    let [ roomName ] = line.match(/[?&]room=([a-zA-Z0-9.]*)/).slice(1);
    let [ lineInd, charInd ] = line.match(/:([0-9]+):([0-9]+)/).slice(1);
    
    // Note that for FoundationBrowser all code is compiled (by ABOVE,
    // who ships it to us - even "setup" code is compiled to minify it
    // slightly and reduce download size)
    [ lineInd, charInd ] = [ lineInd, charInd ].map(v => parseInt(v, 10));
    return { roomName, lineInd, charInd, bearing: 'below', compiled: true };
  },
  srcLineRegex() { return { regex: /.^/, extract: fullMatch => ({ roomName: null, line: 0, char: 0 }) }; }, // That regex ain't ever gonna match! (Intentionally!)
  /// =DEBUG}
  
  cleanup() {
    
    // If we had tab focus clear this indicator from LocalStorage
    let val = window.localStorage.getItem(`view/${this.hutId}`);
    if (val.hasHead(`${this.viewId}/`)) window.localStorage.removeItem(`view/${this.hutId}`);
    
    for (let server of this.servers) server.end();
    
  }
  
})});
