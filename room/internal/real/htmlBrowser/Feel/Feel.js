global.rooms['internal.real.htmlBrowser.Feel'] = async foundation => {
  
  let { MemSrc, FnSrc, Layout } = await foundation.getRooms([
    'logic.MemSrc',
    'logic.FnSrc',
    'internal.real.generic.Layout'
  ]);
  
  return U.form({ name: 'Feel', has: { Layout }, props: (forms, Form) => ({
    init: function({ modes=[ 'continuous', 'discrete' ], feelFn=null }={}) {
      
      if (!U.isForm(modes, Array)) modes = [ modes ];
      if (!modes.count()) throw Error(`Supply at least one mode`);
      if (modes.find(v => !U.isForm(v, String)).found) throw Error(`All modes should be String`);
      if (modes.find(v => ![ 'continuous', 'discrete' ].includes(v)).found) throw Error(`Invalid mode; use either "continuous" or "discrete"`);
      
      Object.assign(this, { modes, feelFn });
      
    },
    isInnerLayout: function() { return false; },
    install: function(real) {
      
      let feelSrc = this.getParam(real, 'feelSrc');
      
      if (feelSrc && !U.isForm(feelSrc, MemSrc.Tmp1))
        throw Error(`feelSrc must be MemSrc.Tmp1`);
      
      if (feelSrc && feelSrc.val !== null)
        throw Error(`feelSrc.val must be null`);
      
      if (!feelSrc || feelSrc.off()) feelSrc = real.params.feelSrc = MemSrc.Tmp1();
      
      let tmp = Tmp();
      
      tmp.endWith(feelSrc.route( feelTmp => (this.getParam(real, 'feelFn') || Function.stub)(feelTmp) ));
      tmp.endWith(feelSrc);
      
      let feelCnt = MemSrc.Prm1('off');
      let feelDsc = MemSrc.Prm1('off');
      let feelViaAnyMode = FnSrc.Tmp1([ feelCnt, feelDsc ], (v1, v2, tmp) => [ v1, v2 ].has('onn') ? (tmp || Tmp()) : C.skip);
      tmp.endWith(feelViaAnyMode.route(tmp => feelSrc.mod(tmp)));
      tmp.endWith(feelViaAnyMode);
      
      let domNode = real.domNode;
      if (this.modes.has('continuous')) {
        domNode.addEventListener('mouseenter', () => feelCnt.mod('onn'));
        domNode.addEventListener('mouseleave', () => feelCnt.mod('off'));
      }
      if (this.modes.has('discrete')) {
        domNode.addEventListener('focus', () => feelDsc.mod('onn'));
        domNode.addEventListener('blur',  () => feelDsc.mod('off'));
      }
      
      return tmp;
      
    },
    render: function(real, domNode) {
      
      if (this.modes.has('continuous')) domNode.style.cursor = 'pointer';
      if (this.modes.has('discrete')) domNode.setAttribute('tabIndex', '0');
      
    }
  })});
  
};
