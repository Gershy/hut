global.rooms['reality.layout.TextFlow'] = async () => {
  
  let { Layout } = await getRoom('reality.real.Real');
  return form({ name: 'TextFlow', has: { Layout }, props: (forms, Form) => ({
    
    init({ text=null, size=null, align='mid', style='', spacing={} }={}) {
      
      Object.assign(this, { text, size, align, style, spacing });
      
    },
    install(real) {
      
      let tmp = Tmp();
      tmp.endWith(this.holdFacet(real, 'content'));
      return tmp;
      
    },
    
    $Item: form({ name: 'TextFlow.Item', has: { Layout }, props: (forms, Form) => ({
      init(textFlow) { Object.assign(this, { textFlow }); },
      install(real) {
        let tmp = Tmp();
        tmp.endWith(this.holdFacet(real, 'x'));
        tmp.endWith(this.holdFacet(real, 'y'));
        return tmp;
      }
    })})
    
  })});
  
};
