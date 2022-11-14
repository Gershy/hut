global.rooms['internal.test.test1'] = async foundation => {
  
  let Hinterland = await foundation.getRoom('Hinterland');
  let HtmlBrowserHabitat = await foundation.getRoom('habitat.HtmlBrowserHabitat');
  
  return Hinterland('test1', 'internal.test.test1', {
    
    habitats: [ HtmlBrowserHabitat() ],
    nature: async (hut, test1Rec, real, dep) => {
      
      /// {ABOVE=
      hut.addKnownRealDependencies([ 'Geom', 'Axis1d', 'Text', 'Press' ]);
      test1Rec.setValue({ count: 0 });
      /// =ABOVE}
      
    },
    psyche: async (hut, test1Rec, real, dep) => {
      
      let decrementAction = hut.enableAction('test1.dec', () => void test1Rec.setValue(v => void v.count--) );
      let incrementAction = hut.enableAction('test1.inc', () => void test1Rec.setValue(v => void v.count++) );
      
      let mainReal = dep(real.addReal('test1.main', [
        { form: 'Geom', w: '100%', h: '100%' },
        { form: 'Axis1d', axis: 'x', flow: '+', mode: 'compactCenter' }
      ]));
      let decrementReal = mainReal.addReal('test1.decrement', [
        { form: 'Text', textSize: '300%', text: '-' },
        { form: 'Press', pressFn: () => decrementAction.act() }
      ]);
      let displayReal = mainReal.addReal('test1.display', [
        { form: 'Text', textSize: '250%', text: '... loading ...' }
      ]);
      let incrementReal = mainReal.addReal('test1.increment', [
        { form: 'Text', textSize: '300%', text: '+' },
        { form: 'Press', pressFn: () => incrementAction.act() }
      ]);
      
      test1Rec.valueSrc.route( () => displayReal.mod({ text: test1Rec.getValue('count').toString() }) );
      
    }
    
  });
  
};
