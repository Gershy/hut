global.rooms['habitat.HtmlBrowserHabitat.hutify.layoutTech.geom'] = () => {
  
  let bigInset = '10000px';
  let numericCss = v => {
    if (v === null) return '';
    if (v.constructor === Number) return `${v}px`;
    return v;
  };
  
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
      let inset = 'tlbr'.split('').toObj(v => [ v, '' ]);
      let margin = 'tlbr'.split('').toObj(v => [ v, '' ]);
      
      let x = numericCss(props.x) || '0px';
      let y = numericCss(props.y) || '0px';
      
      // Any ugly asymmetry concerns deciding the polarity of x/y for
      // centered dimensions - e.g. when an element is in a corner it's
      // easy to know that x/y move it from the corner deeper into its
      // parent - but what about elements on the sides? E.g. imagine a
      // Kid anchored to its Par's TOP - obviously positive Y moves the
      // Kid downwards, but what about X? It's kind of "undefined" which
      // way X moves the kid
      if (props.anchor === 'mid') {
        
        Object.assign(inset, {
          l: `calc(${x} - ${bigInset})`,
          t: `calc(${y} - ${bigInset})`,
          b: `-${bigInset}`,
          r: `-${bigInset}`
        });
        margin = margin.map(v => 'auto');
        
      } else if (props.anchor === 'l') {
        
        Object.assign(inset, { t: `calc(${y} - ${bigInset})`, b: `-${bigInset}`, l: x, r: '' });
        Object.assign(margin, { t: 'auto', b: 'auto' });
        
      } else if (props.anchor === 'r') {
        
        Object.assign(inset, { t: `calc(${y} - ${bigInset})`, b: `-${bigInset}`, l: '', r: x });
        Object.assign(margin, { t: 'auto', b: 'auto' });
        
      } else if (props.anchor === 't') {
        
        Object.assign(inset, { t: y, b: '', l: `calc(${x} - ${bigInset})`, r: `-${bigInset}` });
        Object.assign(margin, { l: 'auto', r: 'auto' });
        
      } else if (props.anchor === 'b') {
        
        Object.assign(inset, { t: '', b: y, l: `calc(${x} - ${bigInset})`, r: `-${bigInset}` });
        Object.assign(margin, { l: 'auto', r: 'auto' });
        
      } else if (props.anchor === 'tl') {
        
        Object.assign(inset, { l: x, t: y });
        
      } else if (props.anchor === 'tr') {
        
        Object.assign(inset, { r: x, t: y });
        
      } else if (props.anchor === 'bl') {
        
        Object.assign(inset, { l: x, b: y });
        
      } else if (props.anchor === 'br') {
        
        Object.assign(inset, { r: x, b: y });
        
      }
      
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
