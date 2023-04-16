global.rooms['test1'] = async () => {
  
  // This single file fully defines the "test1" Hut app
  
  let { Hinterland, HtmlBrowserHabitat } = await getRooms([
    
    // Hinterland defines a network of Huts sharing an experience
    'Hinterland',
    
    // HtmlBrowserHabitat makes a Hinterland accessible via browsers
    'habitat.HtmlBrowserHabitat'
    
  ]);
  
  // First 2 params to Hinterland are the shorthand and full room name
  return Hinterland('test1', {
    
    habitats: [ HtmlBrowserHabitat() ],
    
    // Server initializes counter to 0
    above: async (hut, test1, real, dep) => test1.setValue({ count: 0 }),
    
    // Clients interact with the counter
    below: async (hut, test1, real, dep) => {
      
      // Users can always decrement and increment
      let decrementAct = hut.enableAction('decrement', () => test1.setValue(v => void v.count--))
      let incrementAct = hut.enableAction('increment', () => test1.setValue(v => void v.count++))
      
      // Ui gives access to decrement/increment Acts
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
      
      // Update the counter when the value changes
      let countSrc = dep(test1.getValuePropSrc('count'))
      countSrc.route(num => displayReal.mod({ text: num.toString() }))
      
    }
    
  })
  
}
