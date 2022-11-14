global.rooms['internal.real.htmlBrowser.Decal'] = async foundation => {
  
  let Layout = await foundation.getRoom('internal.real.generic.Layout');
  return form({ name: 'Decal', has: { Layout }, props: (forms, Form) => ({
    
    // TODO: Collision between Text/"text" and Decal/"text" (rename
    // Decal/"text" -> "font"?
    $propNames: 'border,colour,opacity,text,transform,transition,windowing'.split(','),
    $cssPropMap: Object.plain({
      'colour': [ 'background-color' ],
      'border': [ 'box-shadow' ],
      'opacity': [ 'opacity' ],
      'scale': [ 'transform' ],
      'x': [ 'left', 'margin-left', 'margin-right' ],
      'y': [ 'top', 'margin-top', 'margin-bottom' ],
      'w': [ 'width' ],
      'h': [ 'height' ],
      'text.colour': [ 'color' ],
      'text.size': [ 'font-size' ]
    }),
    $cssAnimCurveMap: Object.plain({
      linear: 'linear',
      gentle: 'ease-in-out',
      accel: 'ease-in',
      decel: 'ease-out'
    }),
    
    init(props) { Object.assign(this, props); },
    isInnerLayout() { return false; },
    render(real, { style }) {
      
      let d = Form.propNames.toObj(v => [ v, this.getParam(real, v) ]);
      if (!isForm(d.text, Object)) d.text = this.text || {}; // TODO: This handles the collision! It assumes if "text" is set on `real.params` but isn't an Object, it doesn't apply to this Layout
      
      if (d.colour !== null) style.backgroundColor = d.colour;
      
      if (d.border !== null) style.boxShadow = `inset 0 0 0 ${d.border.ext} ${d.border.colour}`;
      if (d.border !== null) style.animation = 'none'; // Clobber any animations using box-shadow
      
      if (d.opacity !== null) style.opacity = `${d.opacity}`;
      
      if (d.windowing !== null) style.overflow = d.windowing ? 'hidden' : 'visible';
      
      if (d.text.colour) style.color = d.text.colour;
      if (d.text.size) style.fontSize = d.text.size;
      
      style.transition = (d.transition ?? []).toArr(({ ms=1000, curve='linear', delayMs=0 }, prop) => {
        return Form.cssPropMap[prop].map(prop => `${prop} ${ms}ms ${Form.cssAnimCurveMap[curve]} ${delayMs}ms`);
      }).flat(1).join(', ');
      
    }
    
  })});
  
};
