global.rooms['internal.install'] = async foundation => {
  
  let Hinterland = await foundation.getRoom('Hinterland');
  let HtmlBrowserHabitat = await foundation.getRoom('habitat.HtmlBrowserHabitat');
  // let TerminalHabitat = await foundation.getRoom('habitat.terminal'); // Interact with Loft purely via command line (and maybe even a separate graphical ui experience like 'window' room
  // let TerminalGraphicalHabitat = await foundation.getRoom('habitat.terminalGraphical');
  
  let debug = foundation.conf('debug');
  return Hinterland('stl', 'internal.install', {
    debug,
    habitats: [ HtmlBrowserHabitat() ],
    above: async (hut, install, real, dep) => {
      
      /// {ABOVE=
      // Make sure to use the non-admin fileSystem to control access
      let fsKeep = foundation.seek('keep', 'fileSystem');
      let installActionKeep = fsKeep.seek('room', 'internal', 'install', 'installAction.js').setContentType('text');
      
      hut.roadSrc('stl.run').route(({ reply }) => reply(installActionKeep));
      
      // Note this allows indexing all hut files from the root <hutRepo>
      // dir itself (the only unavailable/protected area of Hut is the
      // "mill" dir)
      let itemsKeep = foundation.seek('keep', 'fileSystem');
      hut.roadSrc('stl.item').route(async ({ reply, msg }) => {
        
        let { pcs=null } = msg;
        if (isForm(pcs, String)) pcs = pcs.split(/[,/]/);
        if (!isForm(pcs, Array)) return reply(Error(`"pcs" should be Array (or String); got ${getFormName(pcs)}`));
        if (pcs.find(v => !isForm(v, String)).found) reply(Error(`"pcs" should contain only strings`));
        
        try {
          let keep = itemsKeep.seek(...pcs);
          let fsType = await keep.getFsType();
          if (!fsType) throw Error(`Invalid path specified`);
          reply(keep.setContentType('text/plain'));
        } catch (err) {
          reply(err);
        }
        
      });
      
      let installHoist = foundation.seek('conf', 'hoists').val.find(v => v.room === 'internal.install').val;
      let { netIden, servers: [ { address, bindings: [ { protocol, port } ] } ] } = installHoist.group;
      
      install.setValue({ protocol: protocol + (netIden.secureBits ? 's' : ''), address, port, path: 'stl.run' });
      /// =ABOVE}
      
    },
    below: async (hut, install, real, dep) => {
      
      dep(real.addLayout({ form: 'Geom', w: '100%', h: '100%' })); // TODO: Why is this necessary??
      
      let stlReal = dep(real.addReal('stl.install', [
        { form: 'Geom', w: '100%', h: '92%', x: '0', y: '-4%' },
        { form: 'Axis1d', axis: 'y', dir: '+', mode: 'compactCenter' }
      ]));
      
      stlReal.addReal('stl.title', { text: 'Hut Installation' },                  [{ form: 'Text', textSize: 'calc(120% + 1.8vw)' }]);
      stlReal.addReal('stl.step1', { text: '1. Install Nodejs (17.0.0 and up)' }, [{ form: 'Text', textSize: 'calc(90% + 1.1vw)' }]);
      stlReal.addReal('stl.step2', { text: '2. Paste into your terminal:' },      [{ form: 'Text', textSize: 'calc(90% + 1.1vw)' }]);
      
      let textReal = stlReal.addReal('stl.text', { text: '... loading ...' }, [
        { form: 'Text', textSize: 'calc(70% + 0.4vw)' },
        { form: 'Gap', size: 'calc(7px + 1vw)' },
        { form: 'Decal', border: { ext: '5px', colour: 'rgba(0, 0, 0, 0.3)' } }
      ]);
      
      dep(install.valueSrc.route(val => {
        
        if (!val) return textReal.mod({ text: '-- loading --' });
        
        let { protocol, address, port, path } = val;
        
        let url = foundation.formatHostUrl({ protocol, address, port });
        if (path) url += `/${path}`;
        
        textReal.mod({ text: `node -e "((u,d='')=>${protocol}.get(u,r=>r.on('data',c=>d+=c)&r.on('end',v=>eval(d)(u))))('${url}')"` });
        
      }));
      
      textReal.addLayout({ form: 'Press', flat: false, pressFn: () => real.getTech().select(textReal) });
      
      stlReal.addReal('stl.reminder', [
        { form: 'Text', textSize: 'calc(70% + 0.3vw)', text: 'Always verify wild code before running!' }
      ]);
      
    }
  });
  
};
