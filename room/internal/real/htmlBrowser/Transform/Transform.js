global.rooms['internal.real.htmlBrowser.Transform'] = async foundation => {
  
  let Layout = await foundation.getRoom('internal.real.generic.Layout');
  return U.form({ name: 'Transform', has: { Layout }, props: (forms, Form) => ({
    init: function({ rotate=null, scale=null, translate=null }={}) {
      Object.assign(this, { rotate, scale, translate });
    },
    render: function(real, domNode) {
      let ops = [];
      
      let scale = this.getParam(real, 'scale');
      let rotate = this.getParam(real, 'rotate');
      let translate = this.getParam(real, 'translate');
      
      if (scale) ops.push([ 'scale', ...(U.isForm(scale, Array) ? scale : [ scale ]) ]);
      if (rotate) ops.push([ 'rotate', `${(rotate * 360).toFixed(2)}deg` ]);
      if (translate) ops.push([ 'translate', ...translate ]);
      if (ops.count()) domNode.style.transform = ops.map(([ type, ...v ]) => `${type}(${v.join(', ')})`).join(' ');
    }
  })});
  
};

