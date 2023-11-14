global.rooms['reality.layout.Text'] = async () => {
  
  let { Layout } = await getRoom('reality.real.Real');
  return form({ name: 'Text', has: { Layout }, props: (forms, Form) => ({
    
    /// {DEBUG=
    $alignOpts: 'fwd,bwd,mid,fit'.split(','), /* "fit" = "justify" */
    $styleOpts: 'bold,italic'.split(','),
    /// =DEBUG}
    
    init({ text=null, size=null, align='mid', style='', spacing={} }={}) {
      
      if (style.constructor === String) style = style.split(',').map(v => v.trim() ?? skip);
      
      /// {DEBUG=
      if (!Form.alignOpts.has(align)) throw Error(`Api: invalid "align" value`).mod({ align });
      if (!isForm(style, Array)) throw Error(`Api: "style" should be Array or String; got ${getFormName(style)}`);
      
      if (style.any(v => !Form.styleOpts.has(v))) throw Error(`Api: invalid "style" value`).mod({ style });
      /// =DEBUG}
      
      if (spacing?.constructor !== Object) spacing = { h: spacing, v: spacing };
      spacing = { h: null, v: null, line: null, ...spacing };
      // TODO: Validate??
      
      Object.assign(this, { text, size, align, style, spacing });
      
    },
    install(real) {
      
      let tmp = Tmp();
      tmp.endWith(this.holdFacet(real, 'content'));
      return tmp;
      
    }
    
  })});
  
};
