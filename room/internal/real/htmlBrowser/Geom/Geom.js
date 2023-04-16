global.rooms['internal.real.htmlBrowser.Geom'] = async foundation => {
  
  let { Layout, Axis1d } = await foundation.getRooms([
    'internal.real.generic.Layout',
    'internal.real.htmlBrowser.Axis1d'
  ]);
  
  return form({ name: 'Geom', has: { Layout }, props: (forms, Form) => ({
    
    $anchorPositions: {
      
      cen: { left:  'w', top:    'h' },
      
      t:   { left:  'w', top:    '-' },
      b:   { left:  'w', bottom: '-' },
      l:   { left:  '-', top:    'h' },
      r:   { right: '-', top:    'h' },
      tl:  { left:  '-', top:    '-' },
      tr:  { right: '-', top:    '-' },
      bl:  { left:  '-', bottom: '-' },
      br:  { right: '-', bottom: '-' }
      
    },
    $props: 'shape,w,h,ow,oh,anchor,x,y,z'.split(','),
    
    init({ shape='rect', w=null, h=null, ow=null, oh=null, anchor=null, x=null, y=null, z=null }) {
      
      if (anchor === null) anchor = (x !== null || y !== null) ? 'mid' : 'none';
      
      // Note "anchor" is a bit overloaded; it defines the anchor for
      // both parent and child! So, e.g., if `{ anchor: 'tl' }`, the
      // top-left corner of the child will be placed on top of the
      // top-left corner of the parent if `{ x: '0', y: '0' }`
      if (isForm(shape, String)) shape = { type: shape };
      Object.assign(this, { shape, w, h, ow, oh, anchor, x, y, z });
      
    },
    render(real, domNode) {
      
      let [ shape, w, h, ow, oh, anchor, x, y, z ] = Form.props.map(v => this.getParam(real, v));
      
      // Apply width and height
      if (w) domNode.style.width = w;
      if (h) domNode.style.height = h;
      
      if (ow) { let v = `calc(${ow} / 2)`; Object.assign(domNode.style, { paddingLeft: v, paddingRight:  v }); }
      if (oh) { let v = `calc(${oh} / 2)`; Object.assign(domNode.style, { paddingTop:  v, paddingBottom: v }); }
      
      // Apply shape
      if      (shape.type === 'rect') { /* Do nothing */ }
      else if (shape.type === 'oval') { domNode.style.borderRadius = '100%'; }
      
      // Apply z index
      if (z !== null) domNode.style.zIndex = z.toString();
      
      // Skip all positioning changes if no anchor
      if (anchor === 'none') return;
      
      // Ensure Geom won't poorly interact with Axis1d.Item
      gsc('HHffkkkkoooooo');
      let hasAxis1d = real.layouts.find(lay => isForm(lay, Axis1d.Item)).found;
      if (hasAxis1d && (x !== null || y !== null || anchor !== 'mid'))
        throw Error(`Geom with Axis1d.Item forbids providing x, y, or non-cen anchor`);
      
      // Skip the rest of the positioning if Axis1d.Item is in effect
      if (hasAxis1d) return;
      
      // TODO: This only works when bounding-rect changes are followed
      // immediately/synchronously by a call to `this.render` (which is
      // probably not the case in many situations)
      if (!w || !h) {
        domNode.style.position = 'absolute'; // Need to set this before checking bounding rect
        let { width: ww, height: hh } = domNode.getBoundingClientRect();
        if (!w) w = `${ww}px`;
        if (!h) h = `${hh}px`;
      }
      
      // Apply anchored positioning; map "w" to centered-width, "h" to
      // centered-height, and "-" to fixed (edge-aligned) "0"
      let anchProps = Form.anchorPositions[anchor]; // E.g., { left: 'w', top: '-' } or { 
      let anchPos = anchProps.map(v => {
        return (v === '-') ? '0' : `calc(50% - ${(v === 'w') ? w : h} / 2)`;
      });
      
      // Ensure absolute position, anchor positioning, and anchor offset
      // via margins
      Object.assign(domNode.style, {
        position: 'absolute',
        ...anchPos,
        ...(x ? { [(anchProps.has('left')) ? 'marginLeft' : 'marginRight' ]: x } : {}),
        ...(y ? { [(anchProps.has('top'))  ? 'marginTop'  : 'marginBottom']:  y } : {})
      });
      
    }
    
  })});
  
};
