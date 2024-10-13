global.rooms['therapy'] = async (roomName, therapyKeep) => {
  
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
        
        dep(experience.real.addReal('title', {
          Geom: { w: '100%' },
          Text: { text: 'Therapy', align: 'mid', size: '180%' }
        }));
        
        dep.scp(loft.relHandler('therapyLoft'), (therapyLoft, dep) => {
          
          let therapy = therapyLoft.m('therapy');
          
          dep.scp(therapy.relHandler('stream'), (stream, dep) => {
            
            let streamReal = experience.real.addReal('stream', {
              Geom: { w: '100%' },
              Axis1d: { axis: 'y', mode: 'stack' },
              Decal: { border: { ext: '1px', colour: '#000' } }
            });
            streamReal.addReal('title', {
              Text: { text: stream.getValue('term'), size: '150%', spacing: { v: '10px' } }
            });
            
            let notionsReal = streamReal.addReal('notions', {
              Geom: { w: '100%' },
              Axis1d: { axis: 'y', mode: 'stack', window: 'clip' },
              Decal: { colour: '#00000005' }
            });
            
            dep.scp(stream, 'notion', (notion, dep) => {
              
              let { ms, args } = notion.getValue();
              
              let { $r: region, $: correlation, ...payload } = args;
              
              let notionReal = dep(notionsReal.addReal('notion', {
                Geom: { w: '100%' },
                Axis1d: { axis: 'y', mode: 'stack' },
                //Text: { text: `${region.upper()}\n${valToJson(correlation)}\n`, align: 'fwd' },
                Decal: {
                  border: { colour: '#0002', ext: '1px' }
                }
              }));
              notionReal.addReal('time', {
                Geom: { w: '100%' },
                Text: { align: 'fwd', style: 'bold', text: getDate(ms) },
              });
              notionReal.addReal('region', {
                Geom: { w: '100%' },
                Text: { align: 'fwd', style: 'bold', text: region }
              });
              notionReal.addReal('correlation', {
                Geom: { w: '100%' },
                Text: { align: 'fwd', text: valToJson(correlation) }
              });
              notionReal.addReal('payload', {
                Geom: { w: '100%' },
                Text: { align: 'fwd', text: valToJson(payload) },
                Decal: { text: { colour: '#0008' } }
              });
              
            });
            
          });
          
        });
        
      });
      
    },
  });
  
};
