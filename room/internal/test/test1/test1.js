global.rooms['internal.test.test1'] = async () => {
  
  // This single file fully defines the "test1" Hut app
  
  let { Hinterland, HtmlBrowserHabitat } = await getRooms([
    
    // Hinterland defines a network of Huts sharing an experience
    'Hinterland',
    
    // HtmlBrowserHabitat makes a Hinterland accessible via browsers
    'habitat.HtmlBrowserHabitat'
    
  ]);
  
  return Hinterland({
    
    prefix: 'internalTest1',
    
    habitats: [ HtmlBrowserHabitat() ],
    
    // Server initializes counter to 0
    above: async ({ record }, dep) => {
      record.setValue({ count: 0 });
    },
    
    // Clients interact with the counter
    below: async ({ record, real, enableAction }, dep) => {
      
      // Users can always decrement and increment
      let decrementAct = dep(enableAction('decrement', () => record.setValue(v => void v.count--)))
      let incrementAct = dep(enableAction('increment', () => record.setValue(v => void v.count++)))
      
      // Ui gives access to decrement/increment Acts
      let mainReal = dep(real.addReal('main', {
        Geom: { w: '100%', h: '100%' },
        Axis1d: { axis: 'x', flow: '+', mode: 'compactCenter' },
        Decal: { colour: '#0262' }
      }))
      let decrementReal = mainReal.addReal('decrement', {
        Text: { size: '300%', text: '-' },
        Press: { pressFn: () => decrementAct.act() },
      })
      let displayReal = mainReal.addReal('display', {
        Geom: { w: '25%' },
        Text: { size: '250%', text: '... loading ...' }
      })
      let incrementReal = mainReal.addReal('increment', {
        Text: { size: '300%', text: '+' },
        Press: { pressFn: () => incrementAct.act() }
      })
      
      // Update the counter when the value changes
      dep(record.getValuePropSrc('count'))
        .route(num => displayReal.mod({ text: num.toString(10) }))
      
    }
    
  })
  
}
