global.rooms['reality.layout.Image'] = async () => {
  
  let { Layout } = await getRoom('reality.real.Real');
  return form({ name: 'Image', has: { Layout }, props: (form, Form) => ({
    init({ keep=null, smoothing=true, scale=1 }={}) {
      Object.assign(this, { keep, smoothing, scale });
    }
  })});
  
};
