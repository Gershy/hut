global.rooms['therapy'] = async therapyKeep => {
  
  // This room consumes a record structure representing Subconscious
  // output, and provides a UI for analyzing this output
  
  let sc = subcon('loft.therapy');
  let Chooser = await getRoom('logic.Chooser');
  
  let { Hinterland, HtmlBrowserHabitat } = await getRooms([
    'Hinterland',
    'habitat.HtmlBrowserHabitat'
  ]);
  
  return Hinterland({
    prefix: 'th',
    habitats: [ HtmlBrowserHabitat() ],
    above: async (experience, dep) => {
      
      /// {ABOVE=
      /// =ABOVE}
      
    },
    below: async (experience, dep) => {
      
      dep(experience.real.addLayout('Axis1d', { axis: 'y', dir: '+', mode: 'stack' }));
      
      let lofterChooser = dep(Chooser.noneOrSome(experience.lofterRh));
      dep.scp(lofterChooser.srcs.off, (noLofter, dep) => {
        
        dep(experience.real.addLayout('Text', { text: 'Loading...', align: 'mid' }));
        
      });
      dep.scp(lofterChooser.srcs.onn, (lofter, dep) => {
        
        let loft = lofter.m('loft');
        
        dep.scp(loft, 'loftTherapy', (loftTherapy, dep) => {
          
          let therapy = loftTherapy.m('therapy');
          dep.scp(therapy, 'stream', (stream, dep) => {
            
            let streamReal = experience.real.addReal('stream', {
              Geom: { w: '100%', h: '80vh' },
              Axis1d: { axis: 'y', mode: 'stack' },
              Decal: { border: { ext: '3px', colour: '#000' } }
            });
            streamReal.addReal('title', {
              Text: { size: '150%', text: stream.getValue('term'), spacing: { v: '10px' } }
            });
            
            let notionsReal = streamReal.addReal('notions', {
              Geom: { w: '100%' },
              Axis1d: { axis: 'y', mode: 'stack', window: 'clip' },
              Decal: { colour: 'rgba(0, 0, 0, 0.1)' }
            });
            
            dep.scp(stream, 'notion', (notion, dep) => {
              
              let { ms, args } = notion.getValue();
              let notionReal = notionsReal.addReal('notion', {
                Geom: { w: '100%' },
                Text: { text: valToJson(args), align: 'fwd' }
              });
              
            });
            
          });
          
        });
        
      });
      
    },
  });
  
};
