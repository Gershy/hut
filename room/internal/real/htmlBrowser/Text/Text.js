global.rooms['internal.real.htmlBrowser.Text'] = async foundation => {
  
  let Layout = await foundation.getRoom('internal.real.generic.Layout');
  
  return form({ name: 'Text', has: { Layout }, props: (forms, Form) => ({
    
    init: function(...args) {
      
      let { text=null, textSize=null, align=null, style='' } = args[0];
      
      if (isForm(style, String)) style = style.split(',');
      Object.assign(this, { text, textSize, align, style: Set(style) });
      
    },
    isInnerLayout: function() { return false; },
    
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
      
      domNode.style.gain({
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        overflow: 'hidden', textOverflow: 'ellipsis'
      });
      
      // Apply text
      let span = domNode.querySelector(':scope > span._text');
      span.textContent = this.getParam(real, 'text');
      span.style.whiteSpace = 'pre-wrap';
      
      let textSize = this.getParam(real, 'textSize');
      
      if (textSize)                 span.style.fontSize = textSize;
      if (this.style.has('bold'))   span.style.fontWeight = 'bold';
      if (this.style.has('italic')) span.style.fontStyle = 'italic';
      
      // Apply text alignment; best results occur when flex and classic "text-align" props are used
      domNode.style.alignItems = { fwd: 'flex-start', bak: 'flex-end', mid: 'center', all: 'stretch' }[this.align || 'mid'];
      domNode.style.textAlign = { fwd: 'left', bak: 'right', mid: 'center', all: 'justify' }[this.align || 'mid'];
      
    }
    
  })});
  
};
