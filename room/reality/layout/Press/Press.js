global.rooms['reality.layout.Press'] = async () => {
  
  let { Layout } = await getRoom('reality.real.Real');
  return form({ name: 'Press', has: { Layout }, props: (form, Form) => ({
    init({ modes=[ 'continuous', 'discrete' ], flat=true, pressFn=null }={}) {
      
      if (!isForm(modes, Array)) modes = [ modes ];
      
      /// {DEBUG=
      if (!modes.count()) throw Error(`Api: "modes" may not be empty`);
      if (Set(modes).count() !== modes.count()) throw Error(`Api: supplied duplicate mode`).mod({ modes });
      if (modes.any(m => ![ 'continuous', 'discrete' ].has(m))) throw Error(`Api: "modes" may only include "continuous" and "discrete"`).mod({ modes });
      /// =DEBUG}
      
      Object.assign(this, { modes, flat, pressFn });
      
    },
    install(real) {
      
      // TODO: Hold a Facet related to mouse/keyboard input, tabindex
      // creation??
      
      let tmp = Tmp();
      if (!this.getParam(real, 'pressSrc')) real.params.pressSrc = Src();
      return tmp;
      
    }
  })});
  
};
