global.rooms['reality.layout.Art'] = async () => {
  
  let { Real, MemSrc } = await getRooms([ 'reality.real.Real', 'logic.MemSrc' ]);
  
  return form({ name: 'Art', has: { Layout: Real.Layout }, props: (form, Form) => ({
    init({ pixelDensityMult=1, pixelCount=null /* { w: 620, h: 480 } */, keySrc=null, animationFn }={}) {
      
      /// {DEBUG=
      if (pixelDensityMult !== 1 && pixelCount) throw Error(`Api: specify one of "pixelDensityMult" and "pixelCount"`);
      /// =DEBUG}
      
      Object.assign(this, { pixelDensityMult, pixelCount, keySrc, animationFn });
      
    },
    install(real) {
      
      let tmp = Tmp();
      if (!this.getParam(real, 'artKeySrc')) real.params.artKeySrc = MemSrc.Prm1(Set());
      
      /// {DEBUG=
      let artKeySrc = this.getParam(real, 'artKeySrc');
      if (!isForm(artKeySrc, MemSrc.Prm1)) throw Error(`Api: artKeySrc must be MemSrc.Prm1; got ${getFormName(artKeySrc)}`);
      if (!isForm(artKeySrc.val, Set)) throw Error(`Api: artKeySrc.val must be Set; got ${getFormName(artKeySrc.val)}`);
      /// =DEBUG}
      
      return tmp;
      
    }
  })});
  
};
