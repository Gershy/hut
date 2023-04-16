global.rooms['reality.layout.Decal'] = async () => {
  
  let { Layout } = await getRoom('reality.real.Real');
  return form({ name: 'Decal', has: { Layout }, props: (forms, Form) => ({
    init(decals={}) {
      Object.assign(this, { decals });
    }
  })});
  
};
