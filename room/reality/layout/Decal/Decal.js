global.rooms['reality.layout.Decal'] = async () => {
  
  let { Layout } = await getRoom('reality.real.Real');
  return form({ name: 'Decal', has: { Layout }, props: (forms, Form) => ({
    
    $props: 'border,colour,opacity,text,transition,windowing'.split(','),
    
    init(decals={}) {
      Object.assign(this, decals);
    },
    getDecals(real) {
      return Form.props.toObj(p => {
        let val = this.getParam(real, p);
        return (val !== null) ? [ p, val ] : skip;
      });
    }
    
  })});
  
};
