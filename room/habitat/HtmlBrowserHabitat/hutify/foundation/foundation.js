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
    
    // Option 1; check eval origin (note that we'll want to overwrite
    // `row` and `col`, as their un-overwritten values will be their
    // index within the `eval`'d String, whereas the index of where
    // `eval` was called is *much* more useful for debugging!
    if (!rawFileName) {
      let evalOrig = cs.getEvalOrigin();
      let match = [ , rawFileName=null, row, col ] = (evalOrig ?? '').match(/(https?:[/][/].+):([0-9]+):([0-9]+)/) ?? [];
      row = parseInt(row, 10); col = parseInt(col, 10);
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
  return `${err.message}>>>HUTTRACE>>>${valToJson(trace)}<<<HUTTRACE<<<`;
  
};
let hutifyPath = 'habitat.HtmlBrowserHabitat.hutify';

global.rooms[`${hutifyPath}.foundation`] = () => ({ init: async evt => {
  
  // We're going to be stingy with this code; the smaller+faster this
  // file is, the better the user experience! Note this file
  // interoperates nicely with the typical Hut style of loading Rooms,
  // but in the browser this code should be referenced manually and
  // run after the DOMContentLoaded event (obvs we can't reference this
  // Room with `getRoom`, as the logic for doing so only gets defined
  // after this Room has been initialized!)
  
  let onErr = evt => {
    
    let err = evt.error ?? evt.reason;
    
    // Don't modify SyntaxErrors - they only show proper
    // stack information when they're logged natively
    if (isForm(err, SyntaxError)) return;
    
    gsc(`Uncaught ${getFormName(err)}`, err);
    
    // TODO: Refresh!! Or better yet - reset foundation (more complex)
    evt.preventDefault();
    
  };
  window.evt('unhandledrejection', onErr);
  window.evt('error', onErr);
  
  let document = window.document;
  let bc = document.body.classList; // "body classlist"
  bc.add('focus');
  window.evt('load', () => bc.add('loaded'));
  window.evt('beforeunload', () => bc.remove('loaded'));
  window.evt('focus', () => bc.add('focus'));
  window.evt('blur', () => bc.remove('focus'));
  
  let HttpKeep = form({ name: 'HttpKeep', has: { Keep }, props: (forms, Form) => ({
    init({ path, query }) { Object.assign(this, { path, query }); },
    getUri() { return global.uri(this); },
    desc() { return global.uri(this); }
  })});
  
  // Some maturities use cache-busting for every asset request, but we want to avoid requesting the
  // same asset multiple times with different cache-busting values; therefore we cache locally
  global.getMs = () => performance.timeOrigin + performance.now();
  global.keep = Object.assign(diveToken => {
    let dive = token.dive(diveToken);
    let key = `/${dive.join('/')}`;
    let keep = global.keep.keeps.get(key);
    if (!keep) global.keep.keeps.add(key, keep = HttpKeep({ path: '+hut:asset', query: { dive: key } }));
    return keep;
  }, { keeps: Map() });
  global.conf = (diveToken, def=null) => {
    
    // Resolve nested Arrays and period-delimited Strings
    let dive = token.dive(diveToken);
    let ptr = global.rawConf;
    for (let pc of dive) {
      if (!isForm(ptr, Object) || !ptr.has(pc)) return def;
      ptr = ptr[pc];
    }
    return ptr;
    
  };
  global.subconOutput = (sc, ...args) => {
    
    let { chatter=true } = global.subconParams(sc);
    if (!chatter) return;
    
    args = args.map(arg => isForm(arg, Function) ? arg() : arg).sift();
    if (!args.length) return;
    console.log(
      `%c${getDate().padTail(60, ' ')}\n${('[' + sc.term + ']').padTail(60, ' ')}`,
      'background-color: #dadada;font-weight: bold;',
    );
    console.log(...args.map(a => isForm(a?.desc, Function) ? a.desc() : a));
    
  };
  global.getRooms = (names, { shorten=true, ...opts }={}) => {
    
    let err = Error('trace');
    return thenAll(names.toObj(name => {
      
      /// {DEBUG=
      if (!name) throw err.mod({ msg: 'Api: null room name' });
      /// =DEBUG}
      
      // Deferred rooms embedded in initial html don't emit "load" event
      // Need to see if `global.rooms` is already populated
      
      let script = document.head.querySelector(`:scope > script[data-room="${name}"]`);
      if (!script) {
        
        // Note that dynamically created scripts don't need an "async"
        // attribute as they are always async
        script = document.createElement('script');
        script.setAttribute('type', 'text/javascript');
        script.setAttribute('src', global.uri({ path: '-hut:room', query: { type: 'room', room: name } }));
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
          return room(name);
          
        })
        .catch(cause => err.propagate({ cause, msg: `Failed to load room "${name}"` }))
        .then(room => script.room = room);
      
      let resultName = shorten ? name.split('.').slice(-1)[0] : name;
      return [ resultName, script.room ];
      
    }));
    
  };
  
  /// {DEBUG=
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
  
  // Note that `aboveHid` is the server's unique `hid` value, whereas `belowHid` can also be called
  // the "assigned hid" - i.e. the hid the server has provided for this client
  let { hid: belowHid, aboveHid, deploy: { uid, host } } = global.conf();
  let { netAddr, netIden: netIdenConf, protocols: pcls, heartbeatMs } = host;
  pcls = pcls.toArr(v => v); // Otherwise `pcls ~== { 0: pclConf0, 1: pclConf1, ... }`
  
  // Make sure that refreshes redirect to the same session
  document.cookie = 'hut=' + global.btoa(valToJson({ hid: belowHid }));
  
  // Enable `global.real`
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
        let pcs = name.split(/[.$]/).map(cmp => cmp[0].lower() + cmp.slice(1));
        return getRoom(`${hutifyPath}.layoutTech.${pcs.join('.')}`);
      }
    };
    let body = document.body;
    if (/^[\s]+$/.test(body.textContent)) body.textContent = '';
    
    global.real = Real({ prefix: 'foundation', name: 'root', tech, tree: Real.Tree(), node: body });
    
    let clipboard = window.navigator.clipboard;
    global.clipboard = clipboard
      ? {
        set: val => {
          if (hasForm(val, Real)) {
            // Set selection to encompass the Real
            window.getSelection().removeAllRanges();
            let range = window.document.createRange();
            range.selectNodeContents(val.node);
            window.getSelection().addRange(range);
            
            // Resolve the Real to its text
            val = val.node.textContent;
          }
          
          /// {DEBUG=
          if (!isForm(val, String)) throw Error('Api: value must resolve to String').mod({ val });
          /// =DEBUG}
          
          return clipboard.writeText(val.trim()).then(() => true, () => false);
        },
        get: () => clipboard.readText()
      }
      : { set: () => false, get: () => '' };
    
  })();
  
  // Ensure single tab
  let foundationTmp = Tmp();
  (() => {
    
    let sc = global.subcon('ensureSingleTab');
    
    // TODO: Support multiple tabs! (Probably with a SharedWorker)
    let { localStorage: storage } = window;
    if (!storage) throw Error('Api: no localStorage available');
    
    // Set our view under the hid; end this Foundation if the value ever
    // changes (indicating another Foundation has taken over)
    let viewId = (Number.int32 * Math.random()).encodeStr(String.base32, 7);
    let hutKey = `view/${belowHid}`;
    storage.setItem(hutKey, `${viewId}/${Date.now().toString(32)}`);
    
    foundationTmp.endWith(window.evt('storage', evt => {
      
      if (evt.key !== hutKey) return;
      
      // Any other event means another tab took control
      sc(`Lost view priority (hut: ${belowHid}, view: ${viewId})`, evt);
      
      let val = window.localStorage.getItem(`view/${belowHid}`);
      if (val.hasHead(`${viewId}/`)) window.localStorage.removeItem(`view/${belowHid}`);
      foundationTmp.end();
      
      for (let child of document.body.querySelectorAll(':scope > *')) child.remove();
      
      let anchor = document.createElement('a');
      anchor.setAttribute('href', (window.location.pathname ?? '/') + (window.location.search ?? ''));
      Object.assign(anchor.style, {
        display: 'block',
        position: 'absolute',
        left: '0', right: '0', top: '0', bottom: '0',
        margin: 'auto',
        width: '65vmin', height: '65vmin',
        textAlign: 'center',
        fontSize: 'calc(10px + 1vmin)',
        backgroundColor: '#0002'
      });
      
      let span = document.createElement('span');
      Object.assign(span.style, {
        position: 'absolute',
        left: '0', right: '0', top: '0', bottom: '0',
        margin: 'auto'
      });
      span.textContent = 'To use this tab click or refresh';
      anchor.appendChild(span);
      
      document.body.appendChild(anchor);
      
    }));
    
    sc(`Took view priority (hut: ${belowHid}, view: ${viewId})`);
    
  })();
  
  // `global` is set up... now run a Hut based on settings
  let loftName = global.conf('deploy.loft.name');
  let { hut, record, WeakBank, [loftName.split('.').at(-1)]: loft, ...pclServers } = await global.getRooms([
    'setup.hut',
    'record',
    
    // TODO: Maybe something like localstorage could allow BELOW to
    // work with KeepBank? (Would be blazing-fast client-side!!)
    'record.bank.WeakBank',
    loftName,
    ...pcls.map(p => `${hutifyPath}.protocol.${p.name}`)
  ]);
  
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
