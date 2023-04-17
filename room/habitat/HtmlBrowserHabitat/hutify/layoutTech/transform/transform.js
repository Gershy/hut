global.rooms['habitat.HtmlBrowserHabitat.hutify.layoutTech.transform'] = () => ({
  install: (real, layout, cleanupTmp) => {},
  render: (real, layout) => {
    
    let ops = [];
    
    let rot = layout.getParam(real, 'rotate');
    let scl = layout.getParam(real, 'scale');
    
    if (scl) ops.push(`scale(${ [ scl ].flat(Infinity).map(v => v.toString(10)).join(', ') })`);
    if (rot) ops.push(`rotate(${ rot * 360 }deg)`);
    
    real.node.style.transform = ops.join(' ');
    
  }
});
