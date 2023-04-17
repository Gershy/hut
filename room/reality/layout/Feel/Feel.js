global.rooms['reality.layout.Feel'] = async () => {
  
  let { MemSrc, FnSrc, Real: { Layout } } = await getRooms([
    'logic.MemSrc',
    'logic.FnSrc',
    'reality.real.Real'
  ]);
  return form({ name: 'Feel', has: { Layout }, props: (form, Form) => ({
    init({ modes=[ 'continuous', 'discrete' ], feelSrc=true, feelFn=null }={}) {
      
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
      
      let feelSrc = this.getParam(real, 'feelSrc');
      
      let gotExternalFeelSrc = !!feelSrc?.onn();
      if (!gotExternalFeelSrc) {
        feelSrc = real.params.feelSrc = MemSrc.Tmp1();
        tmp.endWith(feelSrc);
      }
      
      /// {DEBUG=
      if (!isForm(feelSrc, MemSrc.Tmp1)) throw Error(`feelSrc must be MemSrc.Tmp1`);
      if (feelSrc.val !== null) throw Error(`feelSrc.val must be null`);
      /// =DEBUG}
      
      // If a FeelFn was provided, pass it a Tmp whenever a Feel begins,
      // and end that Tmp when the Feel ends (note it's up to FeelFn to
      // open/shut actions along with the Tmp!)
      let feelFn = this.getParam(real, 'feelFn');
      if (feelFn) tmp.endWith(feelSrc.route(feelTmp => feelFn(feelTmp)));
      
      return tmp;
      
    }
  })});
  
};
