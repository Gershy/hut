global.rooms['promo.hut.install'] = async (installKeep) => {
  
  let { Hinterland, HtmlBrowserHabitat } = await getRooms([
    'Hinterland',
    'habitat.HtmlBrowserHabitat'
  ]);
  
  return Hinterland({
    prefix: 'stl', // "promo hut install"
    habitats: [ HtmlBrowserHabitat() ],
    above: async (experience, dep) => {
      
      /// {ABOVE=
      
      // Make sure to use non-admin file access to control access
      let installScriptKeep = installKeep.seek('/action.js');
      dep(experience.enableKeep('install', installScriptKeep));
      dep(experience.addCommandHandler('js', ({ reply }) => reply(installScriptKeep)));
      
      let { record: install } = experience;
      
      // Serve all hut files - note the only unavailable/protected area of Hut is the "mill" dir,
      // which is naturally forbidden by using the "[file:hut]" Keep
      let itemsKeep = keep('[file:hut]');
      dep(experience.addCommandHandler('item', async ({ reply, msg }) => {
        
        let { pcs=null } = msg;
        
        if (isForm(pcs, String)) pcs = pcs.split(/[,/]/);
        if (!isForm(pcs, Array)) throw Error(`Api: "pcs" should be Array (or String); got ${getFormName(pcs)}`);
        if (pcs.find(v => !isForm(v, String)).found) throw Error(`Api: "pcs" should contain only strings`);
        
        let keep = itemsKeep.seek(pcs);
        if (!await keep.streamable()) throw Error(`Api: invalid request`);
        
        // Would be nice to specify that `keep` is text/plain (this could make links better, as the
        // content is more likely to display as opposed to downloading). The previous approach was
        // to call `reply(keep.setContentType('text/plain'))` but the Room ("install" in this case)
        // should not be setting the content type; technically `keep` should represent some global
        // blob, and should fully contain its own definition (content type included) internally.
        // TODO: Consider something like:
        //    | reply(ContextualizedKeep(keep, { contentType: 'text/plain' }));
        reply(keep);
        
      }));
      
      let deploy = conf('deploy').find(deploy => deploy.loft.name === 'promo.hut.install').val;
      let { host: { netIden, netAddr, protocols } } = deploy;
      let { port, compression } = protocols.find(p => p.name === 'http').val;
      
      let url = `http${netIden.secureBits ? 's' : ''}://${netAddr}:${port}/${experience.pfx}.js`;
      install.setValue(url);
      /// =ABOVE}
      
    },
    below: async (experience, dep) => {
      
      let textSizes = [
        'calc(120% + 2.0vmin)', // Biggest
        'calc(100% + 1.3vmin)',
        'calc(90% + 1.1vmin)',
        'calc(60% + 0.5vmin)' // Smallest
      ];
      let { record: install, real } = experience;
      
      dep(real.addLayout({ form: 'Geom', w: '100%', h: '100%' })); // TODO: Why is this necessary??
      
      let stlReal = dep(real.addReal('install', {
        Geom: { w: '100%', h: '92%', x: '0', y: '-4%' },
        Axis1d: { axis: 'y', dir: '+', mode: 'compactCenter' }
      }));
      stlReal.addReal('title', { text: 'Hut Installation',                  Text: { size: textSizes[0] } });
      stlReal.addReal('step1', { text: '1. Install Nodejs (18.0.0 and up)', Text: { size: textSizes[1] } });
      stlReal.addReal('step2', { text: '2. Navigate to desired parent dir', Text: { size: textSizes[1] } });
      stlReal.addReal('step3', { text: '3. Paste into your terminal:',      Text: { size: textSizes[1] } });
      stlReal.addReal('reminder', {
        Geom: { w: 'calc(70vmin + 30vmax)' },
        Text: { size: textSizes[3], spacing: { v: '0.4vh' } },
        text: '(Always verify wild code before running!)'
      });
      let textReal = stlReal.addReal('text', {
        Text: { size: textSizes[2], spacing: 'calc(5px + 0.5vw)' },
        Decal: { border: { ext: '5px', colour: 'rgba(0, 0, 0, 0.3)' } },
        Press: { flat: false, pressFn: async () => clipboard.set(textReal) }
      });
      stlReal.addReal('reminder', {
        Geom: { w: 'calc(70vmin + 30vmax)' },
        Text: { size: textSizes[3], spacing: { v: '0.4vh' } },
        text: 'This downloads and runs a js script downloading everything you need to use Hut!'
      });
      
      dep(install.valueSrc.route(url => textReal.mod({
        text: url
          ? `node -e "fetch('${url}').then(r=>r.text().then(t=>eval(t)(r)))"`
          : '-- loading --'
      })));
      
    }
  });
  
};
