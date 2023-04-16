global.rooms['habitat.HtmlBrowserHabitat.hutify.layoutTech.geom'] = () => ({
  install: (real, layout, cleanupTmp) => {},
  render: (real, layout) => {
    let style = real.node.style;
    let props = layout.getProps(real);
    if (props.w) style.width = props.w;
    if (props.h) style.height = props.h;
    
    if      (props.shape === 'rect') { /* Do nothing */ }
    else if (props.shape === 'oval') style.borderRadius = '100%';
    
    if (props.z) style.zIndex = props.z.toString();
    
    if (props.anchor === 'mid') {
      style.margin = 'auto';
    }
    if (props.anchor.length === 1 /* t, b, l, r */) {
      
      Object.assign(style, [ 't', 'b' ].has(props.anchor)
        ? { marginLeft: 'auto', marginRight: 'auto' }
        : { marginTop: 'auto', marginBottom: 'auto' }
      );
      
      if (props.anchor === 'b') style.marginTop = 'auto';
      if (props.anchor === 'r') style.marginLeft = 'auto';
      
    }
    if (props.anchor.length === 2 /* tl, tr, bl, br */) {
      
      if      (props.anchor === 'tl') Object.assign(style, {});
      else if (props.anchor === 'tr') Object.assign(style, { marginLeft: 'auto' });
      else if (props.anchor === 'bl') Object.assign(style, { marginTop: 'auto' });
      else if (props.anchor === 'br') Object.assign(style, { marginTop: 'auto', marginLeft: 'auto' });
      
    }
    
    if (props.anchor !== 'none') Object.assign(style, { left: props.x ?? '0', top: props.y ?? '0' });
    
  }
    
});
