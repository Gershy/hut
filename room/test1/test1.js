global.rooms['test1'] = async foundation => {
  
  let { Hinterland, HtmlBrowserHabitat } = await foundation.getRooms([
    'Hinterland',
    'habitat.HtmlBrowserHabitat'
  ]);
  
  return Hinterland('test1', 'test1', {
    
    habitats: [ HtmlBrowserHabitat() ],
    nature: async (hut, test1, real, dep) => test1.setValue({ count: 0 }),
    psyche: async (hut, test1, real, dep) => {
      
      let decrementAct = hut.enableAction('decrement', () => { test1.setValue(v => { v.count-- }) })
      let incrementAct = hut.enableAction('increment', () => { test1.setValue(v => { v.count++ }) })
      
      let mainReal = dep(real.addReal('main', [
        { form: 'Geom', w: '100%', h: '100%' },
        { form: 'Axis1d', axis: 'x', flow: '+', mode: 'compactCenter' },
        { form: 'Decal', colour: '#0262' }
      ]))
      let decrementReal = mainReal.addReal('decrement', [
        { form: 'Text', textSize: '300%', text: '-' },
        { form: 'Press', pressFn: () => decrementAct.act() }
      ])
      let displayReal = mainReal.addReal('display', [
        { form: 'Geom', w: '25%' },
        { form: 'Text', textSize: '250%', text: '... loading ...' }
      ])
      let incrementReal = mainReal.addReal('increment', [
        { form: 'Text', textSize: '300%', text: '+' },
        { form: 'Press', pressFn: () => incrementAct.act() }
      ])
      
      let countSrc = dep(test1.getValuePropSrc('count'))
      countSrc.route(num => displayReal.mod({ text: num.toString() }))
      
    }
    
  })
  
}
