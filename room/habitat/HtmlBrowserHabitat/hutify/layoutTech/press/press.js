global.rooms['habitat.HtmlBrowserHabitat.hutify.layoutTech.press'] = () => ({
  install: (real, layout, cleanupTmp) => {
    
    let processEvt = evt => {
      evt.stopPropagation();
      evt.preventDefault();
      layout.getParam(real, 'pressFn')?.();
      real.params.pressSrc.send(null);
    };
    if (layout.modes.has('continuous')) cleanupTmp.endWith(real.node.evt('click', processEvt));
    if (layout.modes.has('discrete')) cleanupTmp.endWith(real.node.evt('keypress', evt => {
      if (evt.ctrlKey || evt.altKey || evt.shiftKey || evt.code !== 'Enter') return;
      processEvt(evt);
    }));
    
    if (layout.modes.has('discrete') && layout.modes.has('continuous')) {
      real.node.setAttribute('tabIndex', '0');
      cleanupTmp.endWith(() => real.node.removeAttribute('tabIndex'));
    }
    
  },
  render: (real, layout) => {
    
    let style = real.node.style;
    if (layout.modes.includes('continuous')) style.cursor = 'pointer';
    if (layout.flat) style.userSelect = 'none';
    
  }
});
