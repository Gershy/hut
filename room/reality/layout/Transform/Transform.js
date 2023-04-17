global.rooms['reality.layout.Transform'] = async () => {
  
  let { Layout } = await getRoom('reality.real.Real');
  return form({ name: 'Transform', has: { Layout }, props: (forms, Form) => ({
    
    init({ rotate=null, scale=null }={}) { Object.assign(this, { rotate, scale }); }
    
  })});
  
};
