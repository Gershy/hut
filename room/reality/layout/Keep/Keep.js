global.rooms['reality.layout.Keep'] = async () => {
  
  let { Layout } = await getRoom('reality.real.Real');
  return form({ name: 'Keep', has: { Layout }, props: (forms, Form) => ({
    
    init({ uri, mode='spawn' }={}) {
      
      /// {DEBUG=
      if (![ 'spawn', 'replace' ].has(mode)) throw Error(`Api: invalid "mode"`).mod({ mode });
      /// =DEBUG}
      
      Object.assign(this, { uri, mode });
      
    }
    
  })});
  
};
