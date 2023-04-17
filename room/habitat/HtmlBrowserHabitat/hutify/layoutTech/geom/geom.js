global.rooms['habitat.HtmlBrowserHabitat.hutify.layoutTech.geom'] = () => ({
  install: (real, layout, cleanupTmp) => {},
  render: (real, layout) => {
    let style = real.node.style;
    let props = layout.getProps(real);
    if (props.w) style.width = props.w;
    if (props.h) style.height = props.h;
    
    if      (props.shape === 'rect') { /* Do nothing */ }
    else if (props.shape === 'oval') style.borderRadius = '100%';
    
    // TODO: Neither "absolute" nor "relative" position covers all neded
    // use-cases - e.g. chess board tiles need to be absolute (so they
    // don't shift each other) but most other stuff needs to be relative
    // to benefit from auto margins!!
    
    if (props.z) style.zIndex = props.z.toString();
    
    if (props.anchor !== 'none') {
      let { x, y } = props;
      // TODO: This is jankkkk with the inset nonsense
      Object.assign(style, { position: 'absolute', inset: '0', left: x ?? '0', top: y ?? '0' });
    }
    
    if (props.anchor === 'mid') style.margin = 'auto';
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
    
  }
    
});
