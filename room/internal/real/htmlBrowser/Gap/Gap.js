global.rooms['internal.real.htmlBrowser.Gap'] = async foundation => {
  
  let Layout = await foundation.getRoom('internal.real.generic.Layout');
  
  return form({ name: 'Gap', has: { Layout }, props: (forms, Form) => ({
    
    init: function({ amt='0', size=amt, horz=size, vert=size, l=horz, r=horz, t=vert, b=vert }) {
      
      Object.assign(this, { l, r, t, b });
      
    },
    render: function(real, domNode) {
      
      Object.assign(domNode.style, {
        boxSizing: 'border-box',
        padding: `${this.t} ${this.r} ${this.b} ${this.l}`
      });
      
    }
    
  })});
  
};
