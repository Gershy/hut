global.rooms['reality.layout.Feel'] = async () => {
  
  let { MemSrc, MapSrc, Real: { Layout } } = await getRooms([
    'logic.MemSrc',
    'logic.MapSrc',
    'reality.real.Real'
  ]);
  return form({ name: 'Feel', has: { Layout }, props: (form, Form) => ({
    init({ modes=[ 'continuous', 'discrete' ], feelSrc=null, feelFn=null }={}) {
      
      if (!isForm(modes, Array)) modes = [ modes ];
      
      /// {DEBUG=
      if (!modes.count()) throw Error(`Api: "modes" may not be empty`);
      if (Set(modes).count() !== modes.count()) throw Error(`Api: supplied duplicate mode`).mod({ modes });
      if (modes.any(m => ![ 'continuous', 'discrete' ].has(m))) throw Error(`Api: "modes" may only include "continuous" and "discrete"`).mod({ modes });
      /// =DEBUG}
      
      Object.assign(this, { modes, feelSrc, feelFn });
      
    },
    install(real) {
      
      let tmp = Tmp();
      
      // Note that if this context creates the MemSrc, it owns it and ends it if the Layout ends
      if (!this.getParam(real, 'feelSrc')) tmp.endWith(real.params.feelSrc = MemSrc.Tmp1());
      
      /// {DEBUG=
      let feelSrc = this.getParam(real, 'feelSrc');
      if (!isForm(feelSrc, MemSrc.Tmp1)) throw Error(`feelSrc must be MemSrc.Tmp1`);
      if (feelSrc.val !== null) throw Error(`feelSrc.val must be null`);
      /// =DEBUG}
      
      return tmp;
      
    }
  })});
  
};
