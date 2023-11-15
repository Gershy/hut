global.rooms['promo.hut.documentation'] = async (roomName, docKeep) => {
  
  let rooms = await getRooms([
    'Hinterland',
    'habitat.HtmlBrowserHabitat',
    'promo.hut.documentation.literature',
  ]);
  let { Hinterland, HtmlBrowserHabitat, literature } = rooms;
  
  return Hinterland({
    prefix: 'doc',
    habitats: [ HtmlBrowserHabitat() ],
    /// {ABOVE=
    above: async (experience, dep) => {},
    /// =ABOVE}
    below: async (experience, dep) => {
      
      dep(experience.real.addLayout('Geom', { w: '100%', h: '100%' }));
      dep(experience.real.addLayout('Axis1d', { axis: 'x', dir: '+' }));
      
      let navReal = experience.real.addReal('nav', {
        Geom: { w: '30%', h: '100%' },
        Axis1d: { axis: 'y' },
        Decal: { colour: '#024', text: { colour: '#fff' } }
      });
      navReal.addReal('title', {
        Geom: { w: '100%', h: '50px' },
        Text: { text: 'Topics', size: '150%', align: 'fwd', spacing: { line: '50px', w: '1vmin', h: '1vmin' } }, // Use `spacing.line` to vertically center align: 'fwd' text??? NO. TODO: `align` should be multidimensional e.g. `align: { x: 'fwd', y: 'mid' }`
        Decal: { colour: '#0006' }
      });
      
      let topicsReal = navReal.addReal('topics', {
        Geom: { w: '100%', h: 'calc(100% - 50px)' },
        Axis1d: { axis: 'y' }
      });
      for (let content of literature.content.iterate()) {
        let chain = content.chain().slice(1)
        
        let topicReal = topicsReal.addReal('topic', {
          Geom: { w: '100%' },
          Axis1d: { axis: 'x' },
          Press: { pressFn: async () => {
            // TODO: This is messy; should be easier to reference Locus (or fuck it, as BetweenHut
            // plus SharedWorker is the real solution needed)
            let locus = await experience.lofterRh.rec.withRh('hut.locus', 'one');
            locus.setValue({ diveToken: chain });
          }}
        });
        
        let descText = chain.empty() ? 'Home' : content.desc;
        topicReal.addReal('desc', {
          Geom: { w: '35%' },
          Text: { align: 'fwd', text: descText, size: 'calc(4px + 0.8vmax)', spacing: { h: '0.5vmin', v: '1vmin' } }
        });
        
        let chainText = chain.empty() ? '' : chain.join(' > ');
        topicReal.addReal('chain', {
          Geom: { w: '65%' },
          Text: { align: 'fwd', text: chainText, size: 'calc(2px + 0.3vmax)', spacing: { h: '0.5vmin', v: '1vmin' } },
          Decal: { text: { colour: '#fff5' } }
        });
      }
      
      let contentReal = experience.real.addReal('content', {
        Geom: { w: '70%', h: '100%' },
        Axis1d: { axis: 'y' },
        Decal: { colour: '#ddd' }
      });
      
      // TODO: With Potential:
      //  | {
      //  |   below: async (poten) => {
      //  |     
      //  |     // No `dep`, because `poten` encompasses that functionality?!?!
      //  |     
      //  |     // `poten.addReal` returns a new KidPotential using that real
      //  |     dep(await literature.activateBelow(poten.addReal('literature')))
      //  |     
      //  |     // Alternatively:
      //  |     // `poten.kid` can take a "real" prop (and maybe more, to create the Kid??)
      //  |     dep(await literature.activateBelow(poten.kid({
      //  |       real: { name: 'literature', layouts: { Decal: { colour: 'red' }, /* ... */ } }
      //  |     })));
      //  |     
      //  |   }
      //  | }
      
      dep(await literature.activateBelow(experience, contentReal));
      
    }
  })
  
};