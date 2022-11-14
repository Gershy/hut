global.rooms['internal.real.htmlBrowser.TextFlow'] = async foundation => {
  
  let Layout = await foundation.getRoom('internal.real.generic.Layout');
  return U.form({ name: 'TextFlow', has: { Layout }, props: (forms, Form) => ({
    
    init: function({ text=null, size=null, align=null, style='' }) {
      
      if (U.isForm(style, String)) style = style.split(',');
      Object.assign(this, { text, size, align, style: Set(style) });
      
    },
    isInnerLayout: function() { return true; },
    getChildLayout: function() { return Form.Item(this); },
    render: function(real, domNode) {
      
      Object.assign(domNode.style, { overflow: 'auto' });
      
    },
    
    $Item: U.form({ name: 'TextFlow.Item', has: { Layout }, props: (forms, Form) => ({
      
      init: function(par) { Object.assign(this, { par }); },
      
      install: function(real) {
        
        let tmp = Tmp();
        
        let span = document.createElement('span');
        span.classList.add('_text');
        span.textContent = this.getParam(real, 'text');
        
        real.domNode.appendChild(span);
        tmp.endWith(() => span.remove());
        
        return tmp;
        
      },
      render: function(real, domNode) {
        
        Object.assign(domNode.style, { display: 'inline', whiteSpace: 'pre-wrap' });
        
        let span = domNode.querySelector(':scope > span._text');
        span.textContent = this.getParam(real, 'text');
        
      }
      
    })})
    
  })});
  
};
