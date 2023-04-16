global.rooms['reality.layout.Geom'] = async () => {
  
  let { Layout } = await getRoom('reality.real.Real');
  return form({ name: 'Geom', has: { Layout }, props: (forms, Form) => ({
    
    // Note that an explicit concept of "Ghost" Reals is needed; Geom
    // will fail to work for absolute positioned stuff! May need to
    // check (EW!!) if the Real is already absolutely positioned, and
    // apply positioning differently if it isssss
    // BTW, how do Ghosts interact with Axis1d (or anything that adds
    // child layouts)?? The Ghostly Real will have Axis1d$Item applied
    // and that is *no good*
    
    $props: 'shape,w,h,anchor,x,y,z'.split(','),
    
    init({ shape='rect', w=null, h=null, anchor='none', x=null, y=null, z=null }={}) {
      
      /// {DEBUG=
      if (!isForm(anchor, String)) throw Error(`Api: anchor must be String; got ${getFormName(anchor)}`).mod({ anchor });
      if (!'none,mid,t,l,b,r,tl,tr,bl,br'.split(',').has(anchor)) throw Error(`Api: invalid anchor: "${anchor}"`);
      /// =DEBUG}
      
      Object.assign(this, { shape, anchor, w, h, x, y, z });
      
    },
    
    getProps(real) {
      
      let result = Object.plain();
      for (let prop of Form.props) result[prop] = real.params[prop] ?? this[prop];
      return result;
      
    },
    install(real) {
      
      let tmp = Tmp();
      let props = this.getProps(real);
      if (props.w !== null) tmp.endWith(this.holdFacet(real, 'w'));
      if (props.h !== null) tmp.endWith(this.holdFacet(real, 'h'));
      if (props.anchor !== 'none') {
        tmp.endWith(this.holdFacet(real, 'x'));
        tmp.endWith(this.holdFacet(real, 'y'));
        tmp.endWith(this.holdFacet(real, 'z'));
      }
      return tmp;
      
    }
  })});
  
};
