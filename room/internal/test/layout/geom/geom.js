global.rooms['internal.test.layout.geom'] = async () => {
  
  let { HtmlBrowserHabitat, Hinterland, TimerSrc } = await getRooms([
    'habitat.HtmlBrowserHabitat',
    'Hinterland',
    'logic.TimerSrc'
  ]);
  return Hinterland({
    
    prefix: 'geomTest',
    habitats: [ HtmlBrowserHabitat() ],
    above: async (hut, geom, real, loft, dep) => {},
    below: async (hut, geom, real, loft, dep) => {
      
      let testsReal = dep(real.addReal('tests', {
        Geom: { w: '100%', h: '100%' },
        Axis1d: { axis: 'y' }
      }));
      
      let addTest = (name, makeReal) => {
        
        let testReal = testsReal.addReal('test', {
          Geom: { w: '100%' },
          Axis1d: { axis: 'y', window: 'clip' },
          Decal: { border: { ext: '3px', colour: '#000' } }
        });
        
        testReal.addReal('title', {
          Text: { size: '200%', text: name, spacing: { v: '10px' } },
        });
        
        let content = testReal.addReal('content', {
          Geom: { w: '200px', h: '200px' },
          Decal: { colour: '#0001' }
        });
        
        testReal.addReal('gap', {
          Text: { size: '200%', text: '-', spacing: { v: '10px' } },
        });
        
        makeReal((propsForGeom={}) => {
          
          return content.addReal('geom', {
            Geom: { w: '50px', h: '50px', ...propsForGeom },
            Decal: { colour: '#f008' }
          });
          
        });
        
      }
      
      addTest('T+B+L+R', fn => {
        fn({ anchor: 't' }).addLayout({ form: 'Text', text: 'T' });
        fn({ anchor: 'b' }).addLayout({ form: 'Text', text: 'B' });
        fn({ anchor: 'l' }).addLayout({ form: 'Text', text: 'L' });
        fn({ anchor: 'r' }).addLayout({ form: 'Text', text: 'R' });
      });
      
      addTest('T+B+L+R (+10px)', fn => {
        fn({ anchor: 't', y: '10px' }).addLayout({ form: 'Text', text: 'T' });
        fn({ anchor: 'b', y: '10px' }).addLayout({ form: 'Text', text: 'B' });
        fn({ anchor: 'l', x: '10px' }).addLayout({ form: 'Text', text: 'L' });
        fn({ anchor: 'r', x: '10px' }).addLayout({ form: 'Text', text: 'R' });
      });
      
      addTest('T+B+L+R (-10px)', fn => {
        fn({ anchor: 't', y: '-10px' }).addLayout({ form: 'Text', text: 'T' });
        fn({ anchor: 'b', y: '-10px' }).addLayout({ form: 'Text', text: 'B' });
        fn({ anchor: 'l', x: '-10px' }).addLayout({ form: 'Text', text: 'L' });
        fn({ anchor: 'r', x: '-10px' }).addLayout({ form: 'Text', text: 'R' });
      });
      
      addTest('T+B+L+R (+25%)', fn => {
        fn({ anchor: 't', y: '+25%' }).addLayout({ form: 'Text', text: 'T' });
        fn({ anchor: 'b', y: '+25%' }).addLayout({ form: 'Text', text: 'B' });
        fn({ anchor: 'l', x: '+25%' }).addLayout({ form: 'Text', text: 'L' });
        fn({ anchor: 'r', x: '+25%' }).addLayout({ form: 'Text', text: 'R' });
      });
      
      addTest('T+B+L+R (-25%)', fn => {
        fn({ anchor: 't', y: '-25%' }).addLayout({ form: 'Text', text: 'T' });
        fn({ anchor: 'b', y: '-25%' }).addLayout({ form: 'Text', text: 'B' });
        fn({ anchor: 'l', x: '-25%' }).addLayout({ form: 'Text', text: 'L' });
        fn({ anchor: 'r', x: '-25%' }).addLayout({ form: 'Text', text: 'R' });
      });
      
      addTest('T+B+L+R (+30% ADJACENT)', fn => {
        fn({ anchor: 't', x: '+30%' }).addLayout({ form: 'Text', text: 'T' });
        fn({ anchor: 'b', x: '+30%' }).addLayout({ form: 'Text', text: 'B' });
        fn({ anchor: 'l', y: '+30%' }).addLayout({ form: 'Text', text: 'L' });
        fn({ anchor: 'r', y: '+30%' }).addLayout({ form: 'Text', text: 'R' });
      });
      
      addTest('T+B+L+R (-30% ADJACENT)', fn => {
        fn({ anchor: 't', x: '-30%' }).addLayout({ form: 'Text', text: 'T' });
        fn({ anchor: 'b', x: '-30%' }).addLayout({ form: 'Text', text: 'B' });
        fn({ anchor: 'l', y: '-30%' }).addLayout({ form: 'Text', text: 'L' });
        fn({ anchor: 'r', y: '-30%' }).addLayout({ form: 'Text', text: 'R' });
      });
      
      addTest('TL+TR+BL+BR', fn => {
        fn({ anchor: 'tl' }).addLayout({ form: 'Text', text: 'TL' });
        fn({ anchor: 'tr' }).addLayout({ form: 'Text', text: 'TR' });
        fn({ anchor: 'bl' }).addLayout({ form: 'Text', text: 'BL' });
        fn({ anchor: 'br' }).addLayout({ form: 'Text', text: 'BR' });
      });
      
      addTest('TL+TR+BL+BR (+10px)', fn => {
        fn({ anchor: 'tl', x: '+10px', y: '+10px' }).addLayout({ form: 'Text', text: 'TL' });
        fn({ anchor: 'tr', x: '+10px', y: '+10px' }).addLayout({ form: 'Text', text: 'TR' });
        fn({ anchor: 'bl', x: '+10px', y: '+10px' }).addLayout({ form: 'Text', text: 'BL' });
        fn({ anchor: 'br', x: '+10px', y: '+10px' }).addLayout({ form: 'Text', text: 'BR' });
      });
      
      addTest('TL+TR+BL+BR (-10px)', fn => {
        fn({ anchor: 'tl', x: '-10px', y: '-10px' }).addLayout({ form: 'Text', text: 'TL' });
        fn({ anchor: 'tr', x: '-10px', y: '-10px' }).addLayout({ form: 'Text', text: 'TR' });
        fn({ anchor: 'bl', x: '-10px', y: '-10px' }).addLayout({ form: 'Text', text: 'BL' });
        fn({ anchor: 'br', x: '-10px', y: '-10px' }).addLayout({ form: 'Text', text: 'BR' });
      });
      
      addTest('TL+TR+BL+BR (+25%)', fn => {
        fn({ anchor: 'tl', x: '+25%', y: '+25%' }).addLayout({ form: 'Text', text: 'TL' });
        fn({ anchor: 'tr', x: '+25%', y: '+25%' }).addLayout({ form: 'Text', text: 'TR' });
        fn({ anchor: 'bl', x: '+25%', y: '+25%' }).addLayout({ form: 'Text', text: 'BL' });
        fn({ anchor: 'br', x: '+25%', y: '+25%' }).addLayout({ form: 'Text', text: 'BR' });
      });
      
      addTest('TL+TR+BL+BR (-25%)', fn => {
        fn({ anchor: 'tl', x: '-25%', y: '-25%' }).addLayout({ form: 'Text', text: 'TL' });
        fn({ anchor: 'tr', x: '-25%', y: '-25%' }).addLayout({ form: 'Text', text: 'TR' });
        fn({ anchor: 'bl', x: '-25%', y: '-25%' }).addLayout({ form: 'Text', text: 'BL' });
        fn({ anchor: 'br', x: '-25%', y: '-25%' }).addLayout({ form: 'Text', text: 'BR' });
      });
      
      addTest('MID', fn => fn({ anchor: 'mid' }));
      addTest('MID, too big', fn => fn({ anchor: 'mid', w: '110%', h: '110%' }));
      addTest('MID (+50, +50)', fn => fn({ anchor: 'mid', x: '+50px', y: '+50px' }));
      addTest('MID (+50, +50), too big', fn => fn({ anchor: 'mid', x: '+50px', y: '+50px', w: '110%', h: '110%' }));
      addTest('MID (-50, -50), too big', fn => fn({ anchor: 'mid', x: '-50px', y: '-50px', w: '110%', h: '110%' }));
      addTest('MID, VARIABLE SIZE', fn => {
        
        let geom = fn({ anchor: 'mid', w: null, h: null });
        let changing = geom.addReal('changing', {
          Text: { text: 'LOLER\nLOL' },
          Decal: { transition: { 'text.size': { ms: 200 } }}
        });
        
        dep(TimerSrc({ ms: 500, num: Infinity }))
          .route(() => changing.mod({ size: `${(5 + Math.random() * 150).toFixed(2)}px` }));
        
      });
      
      addTest('MID (+50, +50), VARIABLE SIZE', fn => {
        
        let geom = fn({ anchor: 'mid', w: null, h: null, x: '+50px', y: '+50px' });
        let changing = geom.addReal('changing', {
          Text: { text: 'LOLER\nLOL' },
          Decal: { transition: { 'text.size': { ms: 200 } }}
        });
        
        dep(TimerSrc({ ms: 500, num: Infinity }))
          .route(() => changing.mod({ size: `${(5 + Math.random() * 150).toFixed(2)}px` }));
        
      });
      
    }
    
  });
  
};
