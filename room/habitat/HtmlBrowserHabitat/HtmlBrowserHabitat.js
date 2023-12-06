global.rooms['habitat.HtmlBrowserHabitat'] = () => form({ name: 'HtmlBrowserHabitat', props: () => ({
  
  // TODO: All road names should be overridable - in fact if there are
  // multiple HtmlBrowserHabitat instances, no two should share a road
  // name. This would be easier by simply providing a unique prefix
  // for all road names, but "hutify" won't work if prefixed. Maybe the
  // best solution requires changing how the Hut form handles "hutify"
  
  init({ name='hut', ...moreOpts }={}) {
    
    // Consider prefixed Habitat command names vs. the initial request to `http://localhost`;
    // removing the prefix would mean no 2 habitats could support the same command names - e.g.
    // "icon" could not be supported by both HtmlBrowserHabitat and TerminalHabitat. Really, such
    // a Command should be generic anyways - it just serves the binary composing the icon, and
    // should theoretically be completely agnostic of the client. I think there are three cases to
    // consider if the Commands of Habitats are going to be refactored:
    // 1. "Habitat-Specific Commands" - this would include the "html.css" command, which only has
    //    meaning to a client which can render css
    // 2. "Habitat-Generic Commands" - this includes "html.icon" and "html.room"; any Habitat will
    //    need to serve the binary of its corresponding icon, and js code defining the Room (even
    //    the functionality to convert invalid room requests to valid json responses, but which
    //    throw the relevant Error, could be considered generic behaviour)
    // 3. "Initializer Commands" - these need to be invoked by a totally uninitiated client who
    //    knows nothing other than the server running Hut; such clients cannot be expected to
    //    provide any info about which Habitat they are using (e.g. initial requests from Browser
    //    and Terminal Habitats will both simply be unqualified requests for the domain) - somehow
    //    the server or the Hut (preferrably the Hut?) will need to decide which Habitat to use in
    //    case multiple Habitats are supported and the client request is unqualified!
    // 
    // Note that currently, only the "hutify" command is un-prefixed; the HtmlBrowserHabitat will
    // always try to include it on the AboveHut; if some other Habitat has already included it, the
    // attempt will simply fail and completely crash. Note that some ideally "generic" Commands are
    // set up using the overly-specific "html" prefix.
    
    /// {ABOVE=
    let { multiUserSim=null } = moreOpts;
    if (multiUserSim === null) multiUserSim = conf('global.maturity') === 'dev';
    /// =ABOVE}
    
    Object.assign(this, {
      
      /// {ABOVE=
      multiUserSim,
      /// =ABOVE}
      
      name
      
    });
    
  },
  
  prepare(hut) {
    
    /// {ABOVE=
    
    let tmp = Tmp();
    let cmd = (name, fn) => tmp.endWith(hut.makeCommandHandler(name, fn));
    
    // TODO: `tmp.end()` should undo these dependency additions
    hut.addPreloadRooms([
      'setup.hut',
      'record',
      'record.bank.WeakBank',
      'Hinterland',
      'habitat.HtmlBrowserHabitat',
      'logic.Scope'
    ]);
    
    // TODO: "hut:icon" and "hut:room" are GENERIC commands and should probably be implemented in
    // "setup.hut" instead!
    cmd('hut:icon', msg => msg.reply(keep('/[file:repo]/room/setup/asset/hut.ico')));
    cmd('hut:room', async ({ reply, msg }) => {
      
      let room;
      try         { room = token.dive(msg?.room); }
      catch (err) { throw Error('Api: invalid room name').mod({ room: msg.room }); }
      
      try { reply(await getCmpKeep('below', room)); } catch (err) {
        gsc(err.mod(msg => `Failed to get compiled keep: ${msg}`));
        reply(`'use strict';global.rooms['${msg.room}']=()=>{throw Error('Api: unable to load room "${msg.room}"');}`);
      }
      
    });
    
    // TODO: Need to use the "hut" namespace because the nodejs http server makes "hut:hutify" the
    // default command if none is detected in the http request (which is always the case for any
    // user freshly navigating to the site!)
    cmd('hut:hutify', async ({ src, reply, msg }) => {
      
      // TODO: Useragent detection at this point could theoretically replace the following content
      // with a different html body that requests, e.g., IE9-compatible resources
      
      // The AfarHut immediately has its state reset, requiring a full sync to update. Then this
      // full sync is consumed here, to be included within the html response (the initial html and
      // sync data will always arrive together)
      
      let initComm = src.consumePendingSync({ fromScratch: true });
      
      let roomScript = (scriptLoadStrategy='async', room) => {
        let src = uri({ path: '-hut:room', query: { room } });
        return `<script ${scriptLoadStrategy} src="${src}" data-room="${room}"></script>`;
      };
      
      let belowConf = hut.getBelowConf();
      
      // Determine all Rooms related to processing protocols
      let protocolsDef = belowConf.deploy.host.protocols;
      let protocolRooms = Set(protocolsDef.toArr(v => v.protocol))
        .toArr(v => `habitat.HtmlBrowserHabitat.hutify.protocol.${v}`);
      
      // Determine all Rooms with habitat-specific Layout logic
      let preloadRooms = [ ...hut.preloadRooms ];
      for (let r of preloadRooms) {
        if (!r.hasHead('reality.layout.')) continue;
        r = r.slice('reality.layout.'.length);
        preloadRooms.push(`habitat.HtmlBrowserHabitat.hutify.layoutTech.${r[0].lower()}${r.slice(1)}`);
      }
      
      let { textSize='100%', locus=null } = msg;
      reply(String.multiline(`
        <!doctype html>
        <html lang="en" spellcheck="false">
          <head>
            
            <meta charset="utf-8">
            <title>${this.name.split('.').slice(-1)[0].upper()}</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link rel="shortcut icon" type="image/x-icon" href="${uri({ path: '-hut:icon' })}">
            <style>
              html, body, body * {
                position: relative; display: flex;
                box-sizing: border-box;
                width: -moz-fit-content; height: -moz-min-content;
                width: fit-content; height: fit-content;
              }
              html, body { width: 100%; height: 100%; margin: 0; padding: 0; overflow: hidden; }
              body { font-family: monospace; white-space: pre-wrap; opacity: 0; font-size: ${textSize}; transition: opacity 200ms linear; }
              body.loaded { opacity: 1; }
              body > * { width: 100%; height: 100%; }
            </style>
            
            ${roomScript('defer', 'setup.clearing') /* Note we want these deferred scripts to appear as early as possible so they can begin downloading */}
            ${roomScript('defer', 'setup.hut.hinterland.RoadAuthority')}
            ${roomScript('defer', 'habitat.HtmlBrowserHabitat.hutify.foundation')}
            ${protocolRooms.toArr(n => roomScript('defer', n)).join('\n') /* TODO: This is unindented when it shouldn't be :( ... everything else gets unindented too, but this is the wrong level for the unindentation to occur... just kinda hurts my soul */ }
            <script>
              // TODO: Use SharedWorker? (caching is funky for the html:worker response!)
              //console.log('START', window.performance.now());
              //let worker = new SharedWorker('${uriRaw({ path: '-html:worker', cacheBust: hut.hid })}');
              //worker.port.onmessage = evt => console.log('MSG', window.performance.now(), evt.data);
              //worker.port.start();
              //Object.assign(window.global = window, { rooms: Object.create(null), worker });
              Object.assign(window.global = window, { rooms: Object.create(null) });
              let evtSrc = EventTarget.prototype;
              Object.defineProperty(evtSrc, 'evt', { configurable: true, value: function(...args) {
                this.addEventListener(...args);
                return Endable(() => this.removeEventListener(...args)); // Won't work until Endable is globally defined
              }});
              
              // - Can't use window.evt since Endable isn't defined yet (clearing.js hasn't run)
              // - rooms['habitat.HtmlBrowserHabitat.hutify.foundation'] will exist because that
              //   script was deferred (it executes fully before the "DOMContentLoaded" event)
              window.addEventListener('DOMContentLoaded', e => rooms['habitat.HtmlBrowserHabitat.hutify.foundation']().init(e));
            </script>
            
            ${preloadRooms.toArr(n => roomScript('async', n)).join('\n') /* TODO: This is unindented when it shouldn't be :( ... everything else gets unindented too, but this is the wrong level for the unindentation to occur */ }

            <link rel="stylesheet" type="text/css" href="${uri({ path: '-html:css' })}">
            
            <script>Object.assign(global,{rawConf:JSON.parse('${valToJson({
              
              // This gets encoded server-side; will be decoded client-side
              hid: src.uid, ...belowConf, locus, initComm
              
            }).replace(/[\\']/g, '\\$&') /* The JSON string is wrapped in single-quotes; escape any embedded single-quotes */ }')})</script>
            
          </head>
          <body></body>
        </html>
      `));
      
    });
    
    cmd('html:css', async ({ src, reply, msg }) => {
      
      reply(String.multiline(`
        @keyframes focusControl {
          0%   { box-shadow: inset 0 0    0   0 currentColor; }
          20%  { box-shadow: inset 0 0 20px 1px currentColor; }
          100% { box-shadow: inset 0 0  1px 1px currentColor; }
        }
        @keyframes focusContent {
          0%   { text-shadow: 0 0  0px currentColor; }
          20%  { text-shadow: 0 0 15px currentColor; }
          100% { text-shadow: 0 0  0px currentColor; }
        }
        body::before {
          content: ''; display: block; position: absolute;
          left: 0; right: 0; top: 0; bottom: 0;
          box-shadow: inset 0 0 calc(0.8vmin + 0.5vmax) 2px #fffa;
          z-index: 1000;
          pointer-events: none;
          transition: box-shadow 100ms linear;
        }
        body.focus::before { box-shadow: inset 0 0 0 0 #fffa; }
        :focus { outline: none !important; }
        ::placeholder { color: inherit; opacity: 0.6; }
        :not([id]):focus {
          color: currentColor;
          outline: none;
          animation-name: focusControl;
          animation-duration: 200ms;
          animation-timing-function: ease-in-out;
          animation-iteration-count: 1;
          animation-fill-mode: forwards;
        }
        [id]:focus {
          animation-name: focusContent;
          animation-duration: 750ms;
          animation-timing-function: linear;
          animation-iteration-count: 1;
          animation-fill-mode: forwards;
        }
      `));
      
    });
    cmd('html:worker', async ({ src, reply, msg }) => {
      
      // If able to generate exact url used for tab to import clearing, it may be possible to reuse
      // the cache between the worker and tab js? TODO: Can the worker be the single source of file
      // urls, shared between all active tabs?? Right now in dev maturity the cache busting uses a
      // random value every time, whereas in beta it uses a fixed value per run of the AboveHut -
      // maybe the BelowHut should always have access to this fixed, per-AboveHut-run beta string?
      // In dev tabs should request the exact same SharedWorker, without fully random cachebusting!
      // edge://inspect/#workers
      
      let deps = [
        'setup.clearing',
        'setup.hut.hinterland.RoadAuthority',
        'habitat.HtmlBrowserHabitat.hutify.workerFoundation'
      ].map(room => uri({ path: '-hut:room', query: { room }}));
      
      reply(String.multiline(`
        self.global = Object.assign(self, { rooms: Object.create(null) });
        self.importScripts(${deps.map(d => `'${d}'`).join(', ')});
        self.addEventListener('connect', conn => conn.ports.each(port => {
          let uid = Math.random().toString(36).slice(2);
          console.log('A new tab connected', { uid });
          port.postMessage({ desc: 'hello new tab, i assigned you a uid', uid });
          port.addEventListener('message', evt => console.log('A tab is messaging me', { uid, evt }));
        }));
      `));
      
    });
    this.multiUserSim && cmd('html:multi', async ({ src, reply, msg }) => {
      
      let { num='4', w='400', h='400', textSize='100%' } = msg;
      
      let names = [
        'abe', 'bob', 'cal', 'dan', 'eli', 'fin', 'ged', 'hal', 'ina',
        'jon', 'ken', 'lev', 'max', 'neo', 'opa', 'pat', 'quo', 'rob',
        'sam', 'tom', 'ula', 'ven', 'wim', 'xya', 'yog', 'zed'
      ];
      
      let genIframe = n => {
        let paramStr = ({
          id: `multi${n}`,
          title: `Multi #${n + 1}`,
          width: w, height: h,
          src: uri({ path: '', query: { hid: names[n], textSize }})
        }).toArr((v, k) => `${k}="${v}"`).join(' ');
        return `<iframe ${paramStr}></iframe>`
      }
      reply(String.multiline(`
        <!doctype html>
        <html lang="en" spellcheck="false">
          <head>
            <meta charset="utf-8">
            <title>${this.name.split('.').slice(-1)[0].upper()}</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link rel="shortcut icon" type="image/x-icon" href="${uri({ path: '-hut:icon' })}">
            <style>
              body, html { padding: 0; margin: 0; }
              body { margin: 2px; text-align: center; }
              iframe { display: inline-block; margin: 1px; vertical-align: top; border: none; box-shadow: 0 0 0 1px #000; }
            </style>
            <script>window.addEventListener('load', () => document.querySelector('iframe').focus())</script>
          </head>
          <body>${parseInt(num, 10).toArr(genIframe).join('')}</body>
        </html>
      `));
      
    });
    
    return tmp;
    
    /// =ABOVE}
    
    return Tmp.stub;
    
    
  }
  
})});
