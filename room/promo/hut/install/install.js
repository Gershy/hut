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
      dep(experience.addCommandHandler('install', ({ reply }) => reply(installScriptKeep)));
      
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
      
      // TODO: Support anything other than http?? Maybe consider all available protocols and rank
      // them in some order of accessibility
      let { port } = protocols.find(p => p.name === 'http').val;
      
      let protocol = `http${netIden.secureBits ? 's' : ''}`;
      let isDefaultPort = (protocol === 'https' && port === 443) || (protocol === 'http' && port === 80);
      let url = isDefaultPort
        ? `${protocol}://${netAddr}/install`
        : `${protocol}://${netAddr}:${port}/install`;
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
      stlReal.addReal('title', { Text: { size: textSizes[0] }, text: 'Hut Installation'                  });
      stlReal.addReal('step1', { Text: { size: textSizes[1] }, text: '1. Install Nodejs (18.0.0 and up)' });
      stlReal.addReal('step2', { Text: { size: textSizes[1] }, text: '2. Navigate to desired parent dir' });
      stlReal.addReal('step3', { Text: { size: textSizes[1] }, text: '3. Paste into your terminal:'      });
      stlReal.addReal('reminder', {
        Text: { size: textSizes[3], spacing: { v: '0.4vh' } },
        text: '(Always verify wild code before running!)'
      });
      let textReal = stlReal.addReal('text', {
        Text: { size: textSizes[2], spacing: 'calc(5px + 0.5vw)' },
        Decal: { border: { ext: '5px', colour: 'rgba(0, 0, 0, 0.3)' } },
        Press: { flat: false, pressFn: async () => clipboard.set(textReal) }
      });
      stlReal.addReal('reminder', {
        Text: { size: textSizes[3], spacing: { v: '0.4vh' } },
        text: 'This gets and runs a js script which downloads everything you need to use Hut!'
      });
      
      dep(install.valueSrc.route(url => textReal.mod({
        text: url
          ? `node -e "fetch('${url}').then(r=>r.text().then(t=>eval(t)(r)))"`
          : '-- loading --'
      })));
      
    }
  });
  
};
