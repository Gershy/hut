global.rooms['habitat.HtmlBrowserHabitat.hutify.layoutTech.decal'] = () => ({
  install: (real, layout, cleanupTmp) => {},
  render: (real, layout) => {
    
    let style = real.node.style;
    for (let [ k, v ] of layout.decals) {
      if      (k === 'colour')    style.backgroundColor = v;
      else if (k === 'opacity')   style.opacity = `${k}`;
      else if (k === 'windowing') style.overflow = v ? 'hidden' : 'visible';
      else if (k === 'border') style.boxShadow = `inset 0 0 0 ${v?.ext ?? 0} ${v?.colour ?? '#0000'}`;
      else if (k === 'text') {
        if (v?.colour) style.color = v.colour;
        if (v?.size)   style.fontSize = v.size;
      }
    }
    
    // $propNames: 'border,colour,opacity,text,transform,transition,windowing'.split(','),
    // $cssPropMap: Object.plain({
    //   'colour': [ 'background-color' ],
    //   'border': [ 'box-shadow' ],
    //   'opacity': [ 'opacity' ],
    //   'scale': [ 'transform' ],
    //   'x': [ 'left', 'margin-left', 'margin-right' ],
    //   'y': [ 'top', 'margin-top', 'margin-bottom' ],
    //   'w': [ 'width' ],
    //   'h': [ 'height' ],
    //   'text.colour': [ 'color' ],
    //   'text.size': [ 'font-size' ]
    // }),
    // $cssAnimCurveMap: Object.plain({
    //   linear: 'linear',
    //   gentle: 'ease-in-out',
    //   accel: 'ease-in',
    //   decel: 'ease-out'
    // }),
    
  }
});
