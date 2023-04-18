global.rooms['habitat.HtmlBrowserHabitat.hutify.layoutTech.decal'] = () => {
  
  let mapTransitionProps = Object.plain({
    colour:        [ 'background-color' ],
    border:        [ 'box-shadow' ],
    opacity:       [ 'opacity' ],
    scale:         [ 'transform' ],
    rotate:        [ 'transform' ],
    x:             [ 'left', 'right' ],
    y:             [ 'top', 'bottom' ],
    loc:           [ 'left', 'right', 'top', 'bottom' ],
    w:             [ 'width' ],
    h:             [ 'height' ],
    size:          [ 'width', 'height' ],
    'text.colour': [ 'color' ],
    'text.size':   [ 'font-size' ],
  });
  let mapTransitionCurve = Object.plain({
    linear: 'linear',
    gentle: 'ease-in-out',
    accel: 'ease-in',
    decel: 'ease-out'
  });
  
  return {
  
    install: (real, layout, cleanupTmp) => {},
    render: (real, layout) => {
      
      let style = real.node.style;
      let { transition, ...decals } = layout.getDecals(real);
      
      for (let [ k, v ] of decals) {
        if      (k === 'border')    style.boxShadow = `inset 0 0 0 ${v?.ext ?? '0'} ${v?.colour ?? '#0000'}`;
        else if (k === 'colour')    style.backgroundColor = v;
        else if (k === 'opacity')   style.opacity = `${v}`;
        else if (k === 'text') {
          if (v?.colour) style.color = v.colour;
          if (v?.size)   style.fontSize = v.size;
        }
        else if (k === 'windowing') style.overflow = v ? 'hidden' : 'visible';
      }
      
      if (transition) {
        
        let trns = [];
        for (let [ k, props ] of Object.entries(mapTransitionProps)) {
          if (!transition.has(k)) continue;
          for (let prop of props) trns.push({ prop, trn: transition[k] });
        }
        
        if (trns.length) real.node.style.transition = trns
          .map(({ prop, trn: { ms=1000, curve='linear', delayMs=0 } }) => {
            return `${prop} ${ms}ms ${mapTransitionCurve[curve]} ${delayMs}ms`;
          });
        
      }
      
    }
    
  };
    
};
