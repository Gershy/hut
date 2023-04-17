global.rooms['habitat.HtmlBrowserHabitat.hutify.layoutTech.feel'] = async () => {
  
  let { MemSrc, FnSrc } = await getRooms([ 'logic.MemSrc', 'logic.FnSrc' ]);
  
  return {
    install: (real, layout, cleanupTmp) => {
      
      let feelSrc = layout.getParam(real, 'feelSrc');
      
      let feelCnt = MemSrc.Prm1('off');
      cleanupTmp.endWith(() => (feelCnt.mod('off'), feelCnt.end()));
      
      let feelDsc = MemSrc.Prm1('off');
      cleanupTmp.endWith(() => (feelDsc.mod('off'), feelDsc.end()));
      
      // TODO: FnSrc.Tmp1 should pass array + Tmp (no variable args!!)
      let feelViaAnyMode = FnSrc.Tmp1([ feelCnt, feelDsc ], (v1, v2, t) => [ v1, v2 ].has('onn') ? (t ?? Tmp()) : skip);
      cleanupTmp.endWith(feelViaAnyMode.route(t => feelSrc.mod(t)));
      cleanupTmp.endWith(feelViaAnyMode);
      
      let node = real.node;
      if (layout.modes.has('continuous')) {
        cleanupTmp.endWith(node.evt('mouseenter', () => feelCnt.mod('onn')));
        cleanupTmp.endWith(node.evt('mouseleave', () => feelCnt.mod('off')));
      }
      if (layout.modes.has('discrete')) {
        cleanupTmp.endWith(node.evt('focus', () => feelDsc.mod('onn')));
        cleanupTmp.endWith(node.evt('blur',  () => feelDsc.mod('off')));
      }
      
      if (layout.modes.has('discrete')) {
        real.node.setAttribute('tabIndex', '0');
        cleanupTmp.endWith(() => real.node.removeAttribute('tabIndex'));
      }
      
    },
    render: (real, layout) => {
      
      if (layout.modes.has('continuous')) real.node.style.cursor = 'pointer';
      
    }
  };
  
};
