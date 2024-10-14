global.rooms['habitat.HtmlBrowserHabitat.hutify.layoutTech.geom'] = () => {
  
  let numericCss = v => {
    if (v === null) return '';
    if (v.constructor === Number) return `${v}px`;
    return v;
  };
  let anchorFns = Object.plain({
    
    mid: (x, y) => ({
      inset: {
        l: `calc(${x} - 10000px)`,
        t: `calc(${y} - 10000px)`,
        b: '-10000px',
        r: '-10000px'
      },
      margin: 'tlbr'.split('').toObj(v => [ v, 'auto' ])
    }),
    l: (x, y) => ({
      inset: { t: `calc(${y} - 10000px)`, b: '-10000px', l: x, r: '' },
      margin: { t: 'auto', b: 'auto' }
    }),
    r: (x, y) => ({
      inset: { t: `calc(${y} - 10000px)`, b: '-10000px', l: '', r: x },
      margin: { t: 'auto', b: 'auto' }
    }),
    t: (x, y) => ({
      inset: { t: y, b: '', l: `calc(${x} - 10000px)`, r: '-10000px' },
      margin: { l: 'auto', r: 'auto' }
    }),
    b: (x, y) => ({
      inset: { t: '', b: y, l: `calc(${x} - 10000px)`, r: '-10000px' },
      margin: { l: 'auto', r: 'auto' }
    }),
    tl: (x, y) => ({ inset: { l: x, t: y }, margin: {} }),
    tr: (x, y) => ({ inset: { r: x, t: y }, margin: {} }),
    bl: (x, y) => ({ inset: { l: x, b: y }, margin: {} }),
    br: (x, y) => ({ inset: { r: x, b: y }, margin: {} })
    
  });
  
  return {
    
    install: (real, layout, cleanupTmp) => {},
    render: (real, layout) => {
      
      let style = real.node.style;
      let props = layout.getProps(real);
      
      // Apply width and height
      style.width = numericCss(props.w);
      style.height = numericCss(props.h);
      
      // Apply shape
      if      (props.shape === 'rect') { /* Do nothing */ }
      else if (props.shape === 'oval') style.borderRadius = '100%';
      
      // Apply z-index
      if (props.z) style.zIndex = props.z.toString();
      
      if (props.anchor === 'none') return;
      
      let xAnchor;
      let yAnchor;
      //let inset = 'tlbr'.split('').toObj(v => [ v, '' ]);
      //let margin = 'tlbr'.split('').toObj(v => [ v, '' ]);
      
      let x = numericCss(props.x) || '0px';
      let y = numericCss(props.y) || '0px';
      
      // Any ugly asymmetry concerns deciding the polarity of x/y for
      // centered dimensions - e.g. when an element is in a corner it's
      // easy to know that x/y move it from the corner deeper into its
      // parent - but what about elements on the sides? E.g. imagine a
      // Kid anchored to its Par's TOP - obviously positive Y moves the
      // Kid downwards, but what about X? It's kind of "undefined" which
      // way X moves the kid
      
      let { inset, margin } = anchorFns[props.anchor](x, y);
      Object.assign(style, {
        
        position: 'absolute',
        
        left: inset.l, right: inset.r,
        top: inset.t, bottom: inset.b,
        
        marginLeft: margin.l, marginRight: margin.r,
        marginTop: margin.t, marginBottom: margin.b
        
      });
      
    }
    
  }
    
};
