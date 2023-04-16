global.rooms['reality.layout.Text'] = async () => {
  
  let { Layout } = await getRoom('reality.real.Real');
  return form({ name: 'Text', has: { Layout }, props: (forms, Form) => ({
    
    // solid |        | massive | concrete |
    //       |        |         | physical | 
    //       |        |         | tangible |
    // 
    // ghost | vapour | emitted | radiated | intangible | holographic
    //       | liquid | diffuse |          | immaterial |
    //       | shadow | radiant |          |            |
    //       |        | ghostly |
    /// {DEBUG=
    $alignOpts: 'fwd,bwd,mid,justify'.split(','),
    /// =DEBUG}
    
    init({ text=null, size=null, align='mid', style='', spacing={} }={}) {
      
      /// {DEBUG=
      if (![ Array, String ].has(style?.constructor)) throw Error(`Api: "style" should be Array or String; got ${getFormName(style)}`);
      /// =DEBUG}
      
      if (spacing?.constructor !== Object) spacing = { outer: spacing };
      let { inner=null, outer=null } = spacing;
      let h = outer;
      let v = outer;
      if (isForm(outer, Object)) ({ h=null, v=null } = outer);
      
      spacing = { outer: { h, v }, inner };
      
      if (style.constructor === String) style = style.split(',').map(v => v.trim() ?? skip);
      Object.assign(this, { text, size, align, style, spacing });
      
    },
    install(real) {
      
      let tmp = Tmp();
      tmp.endWith(this.holdFacet(real, 'content'));
      return tmp;
      
    }
    
  })});
  
};
