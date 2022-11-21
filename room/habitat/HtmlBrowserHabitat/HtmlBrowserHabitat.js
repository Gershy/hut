global.rooms['habitat.HtmlBrowserHabitat'] = foundation => form({ name: 'HtmlBrowserHabitat', props: () => ({
  
  // TODO: All road names should be overridable - in fact if there are
  // multiple HtmlBrowserHabitat instances, no two should share a road
  // name. This would be easier by simply providing a unique prefix
  // for all road names, but "syncInit" won't work if prefixed. Could
  // be the best solution requires changing how the Hut form handles
  // "syncInit"
  
  init({ rootRoadSrcName='syncInit', prefix='html', debug=false, ...moreOpts }={}) {
    
    /// {ABOVE=
    let { multiUserSim=null } = moreOpts;
    if (multiUserSim === null) multiUserSim = foundation.conf('deploy.maturity') === 'dev';
    /// =ABOVE}
    
    Object.assign(this, {
      
      /// {ABOVE=
      multiUserSim,
      /// =ABOVE}
      
      prefix,
      rootRoadSrcName,
      
    });
    
  },
  
  async prepare(roomName, hut) {
    
    /// {ABOVE=
    
    let tmp = Tmp();
    
    // TODO: `tmp.end()` should undo these dependency additions
    hut.addKnownRoomDependencies([
      'Hut',
      'record',
      'record.bank.AbstractBank',
      'record.bank.TransientBank',
      'Hinterland',
      'habitat.HtmlBrowserHabitat',
      'logic.Scope',
      'internal.real.generic.Real',
      'internal.real.generic.Layout',
      'internal.real.htmlBrowser.Real'
    ]);
    
    // Omit "trn" to have it default to "anon" (cacheable)
    let urlFn = v => foundation.getUrl(v);
    
    tmp.endWith(hut.roadSrc(this.rootRoadSrcName).route(async ({ src, reply, msg }) => {
      
      // TODO: If supporting outdated browsers, useragent agent
      // detection at this point has an opportunity to send html which
      // initiates, e.g., FoundationBrowserIE9 (which would provide a
      // completely overhauled clearing.js with only IE9 syntax)
      
      // The AfarHut immediately has its state reset, requiring a full
      // sync to update. Then this full sync is consumed here, to be
      // included within the html response (the initial html and sync
      // data will always arrive together)
      let initSyncTell = src.consumePendingSync(hut);
      
      let depRooms = Set([
        roomName,
        ...hut.knownRoomDependencies,
        ...hut.knownRealDependencies.map(realName => `internal.real.htmlBrowser.${realName}`)
      ]);
      
      let roomScript = (room, loadType='async') => {
        
        let type = [ 'clearing', 'foundation', 'foundationBrowser' ].has(room) ? 'setup' : 'room'; // TODO: Sloppy!!
        
        let src = urlFn({ command: `${this.prefix}.room`, type, room });
        
        return `<script ${loadType} type="text/javascript" src="${src}" data-room="${type}/${room}"></script>`;
        
      };
      
      let argsForBelow = foundation.getBelowConfArgs();
      
      let { textSize='100%' } = msg;
      reply(String.multiline(`
        <!doctype html>
        <html lang="en" spellcheck="false">
          <head>
            <meta charset="utf-8" />
            <title>${roomName.split('.').slice(-1)[0].upper()}</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <link rel="shortcut icon" type="image/x-icon" href="${urlFn({ command: this.prefix + '.icon' })}" />
            <style type="text/css">
              html, body, body > div {
                position: absolute; left: 0; top: 0; width: 100%; height: 100%;
                margin: 0; padding: 0;
                font-family: monospace;
                overflow: hidden;
              }
              html > body * { position: relative; }
              
              body { opacity: 0; font-size: ${textSize}; transition: opacity 200ms linear; }
              body.loaded { opacity: 1; }
            </style>
            
            <script type="text/javascript">Object.assign(window.global = window, { roomDebug: Object.create(null), rooms: Object.create(null) });</script>
            
            ${roomScript('clearing', 'defer')}
            ${roomScript('foundation', 'defer')}
            ${roomScript('foundationBrowser', 'defer')}
            ${depRooms.toArr(n => roomScript(n, 'async')).join('\n') /* TODO: This is unindented when it shouldn't be :( */ }
            
            <link rel="stylesheet" type="text/css" href="${urlFn({ command: this.prefix + '.css' })}" />
            
            <script type="text/javascript">window.addEventListener('DOMContentLoaded', async loadedEvt => {
              
              let body = document.body;
              body.classList.add('focus');
              window.addEventListener('load', () => body.classList.add('loaded'));
              window.addEventListener('beforeunload', () => body.classList.remove('loaded'));
              window.addEventListener('focus', evt => body.classList.add('focus'));
              window.addEventListener('blur', evt => body.classList.remove('focus'));
              window.focus();
              
              let { FoundationBrowser } = global;
              let foundation = FoundationBrowser();
              await foundation.configure(serToVal('${valToSer({
                
                // This is json-encoded (which actually speeds up
                // page load due to limited parsing options within a
                // string), shipped, and unencoded client-side
                
                hutId: src.uid,
                ...foundation.getBelowConfArgs(),
                ageMs: foundation.getMs(),
                utcMs: Date.now(),
                syncTell: initSyncTell
                
              }).replace(/[\\']/g, '\\$&')}')); // Escape literal backslashes and quotes
              
              await foundation.hoist();
              
            });</script>
          </head>
          <body></body>
        </html>
      `));
      
    }));
    tmp.endWith(hut.roadSrc(`${this.prefix}.room`).route(async ({ src, reply, msg }) => {
      
      if (!msg.has('type')) throw Error(`Missing "type"`);
      if (!isForm(msg.type, String)) throw Error(`Invalid "type" is ${getFormName(type)} (should be String)`);
      if (![ 'setup', 'room' ].has(msg.type)) throw Error(`Invalid type "${msg.type}" (should be "setup" or "room")`);
      
      // Return compiled logic if type is "room"
      if (msg.type === 'room') reply(await foundation.getCompiledKeep('below', msg.room));
      
      // Return raw contents if type is "setup"
      if (msg.type === 'setup') reply(await foundation.getCompiledKeep('setup', msg.room));
      
    }));
    tmp.endWith(hut.roadSrc(`${this.prefix}.rooms`).route(async ({ src, reply, msg }) => {
      
      // Unlike "<prefix>.room" (singular), type must always be "room"
      // and therefore the "type" param shouldn't be provided.
      
      let roomNames = msg.rooms.split(',').map(r => {
        let pcs = r.split('.');
        return [ 'room', ...pcs, `${pcs.slice(-1)[0]}.js` ];
      });
      
      // TODO: Ideally could stream every desired room in order. The
      // offsets from those rooms (under `global.roomDebug`) reflect
      // the line information in that single room's file. As each file
      // is being streamed, need to count number of lines in that file
      // and after all files are streamed can stream additional json
      // representing the offset of each room relative to the batch.
      
      let compiledRoomsData = await Promise.all(
        roomNames.map(r => foundation.getCompiledKeep('below', r).then(keep => keep.getContent('utf8')))
      );
      
      // TODO: Need to modify `offsets` before doing something like:
      //    |   reply(compiledRoomsData.map(d => d.lines.join('\n')).join('\n'))
      // `offsets` needs to consider that a particular room's offsets
      // have been shifted ahead by the number of lines of all files
      // preceding it combined, and also that the name of the file
      // changes every time the threshold between two files is passed.
      // Both these considerations are nearly facilitated by the
      // "context" feature of cmp->src line mapping. Overall:
      // - The "at" property of every line needs to be shifted ahead
      //   by the combined number of lines of all preceding files
      // - Need to include `{ name: 'name.of.file' }` in context for
      //   first offset of every file
      // - Need to include
      //   `{ totalOffset: numberOfPreceedingLinesFromOtherFiles }` to
      //   provide the number of lines that need to be subtracted from
      //   overall cmp->src line mappings in order to restore the real
      //   line number for a specific file
      throw Error('Not implemented from here on...');
      
    }));
    
    tmp.endWith(hut.roadSrc(`${this.prefix}.icon`).route(async ({ src, reply, msg }) => {
      
      reply(foundation.seek('keep', 'fileSystem', [ 'setup', 'asset', 'hut.ico' ]));
      
    }));
    tmp.endWith(hut.roadSrc(`${this.prefix}.css`).route(async ({ src, reply, msg }) => {
      
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
        body > a.view {
          position: absolute; width: 100%; height: 100%;
          line-height: 100vh;
          text-align: center;
          font-size: calc(60% + 1.5vw);
        }
      `));
      
    }));
    
    if (this.multiUserSim) tmp.endWith(hut.roadSrc(`${this.prefix}.multi`).route(async ({ src, reply, msg }) => {
      
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
          src: `/?trn=sync&hutId=${names[n]}&textSize=${textSize}`
        }).toArr((v, k) => `${k}="${v}"`).join(' ');
        return `<iframe ${paramStr}></iframe>`
      }
      reply(String.multiline(`
        <!doctype html>
        <html lang="en" spellcheck="false">
          <head>
            <meta charset="utf-8" />
            <title>${roomName.split('.').slice(-1)[0].upper()}</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <link rel="shortcut icon" type="image/x-icon" href="${urlFn({ command: this.prefix + '.icon' })}" />
            <style type="text/css">
              body, html { padding: 0; margin: 0; }
              body { margin: 2px; text-align: center; }
              iframe { display: inline-block; margin: 1px; vertical-align: top; border: none; }
            </style>
            <script type="text/javascript">window.addEventListener('load', () => document.querySelector('iframe').focus())</script>
          </head>
          <body>${parseInt(num, 10).toArr(genIframe).join('')}</body>
        </html>
      `));
      
    }));
    
    return tmp;
    
    /// =ABOVE}
    
    return Tmp.stub;
    
    
  }
  
})});
