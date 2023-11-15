global.rooms['habitat.HtmlBrowserHabitat.hutify.layoutTech.text'] = () => ({
  install: (real, layout, cleanupTmp) => {
    
    let span = document.createElement('span');
    span.classList.add('text');
    
    real.node.appendChild(span);
    cleanupTmp.endWith(() => span.remove());
    
  },
  render: (real, layout) => {
    
    // TODO: Use a variable number of "span" children to apply format
    // hints from the text content itself?? E.g. if the text content
    // implies bullet-formatting with indented dashes etc. a simple
    // pre-wrap tactic is going to fail when the text wraps; the wrapped
    // lines will wrap all the way to the leftmost side of the child
    // This may, however, overload the functionality of the Text Layout;
    // it could be better to define something new like RichText
    let span = real.node.querySelector(':scope > span.text');
    span.textContent = layout.getParam(real, 'text') ?? '\u2022'.repeat(3);
    
    Object.assign(real.node.style, {
      
      // Apply decals
      fontSize: layout.getParam(real, 'size') ?? '',
      fontWeight: layout.style.has('bold') ? 'bold' : '',
      fontStyle: layout.style.has('italic') ? 'italic' : '',
      textDecoration: layout.style.has('underline') ? 'underline' : '',
      
      // Handle overflow with ellipsis
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      
      // Convert hut-style Realism to css
      textAlign: { fwd: 'left', bwd: 'right', mid: 'center', fit: 'justify' }[layout.align]
      
    });
    
    // TODO: This is really more "anchoring" than "alignment"
    Object.assign(span.style, {
      fwd: { textAlign: 'left',   marginRight: 'auto', marginBottom: 'auto' },
      bwd: { textAlign: 'right',  marginLeft: 'auto', marginBottom: 'auto' },
      mid: { textAlign: 'center', margin: 'auto' },
      fit: { textAlign: 'center', margin: 'auto' },
    }[layout.align]);
    
    let { h, v, line } = layout.spacing;
    if (h) Object.assign(real.node.style, { paddingLeft: h, paddingRight: h });
    if (v) Object.assign(real.node.style, { paddingTop: v, paddingBottom: v });
    if (line) Object.assign(real.node.style, { lineHeight: line }); // TODO: line-height also adds "outer" padding (half the line-height value); really it should be subtracted from any padding (note padding can't go negative, so 0 outer padding with some line-height always results in "outer padding")
    
  }
});
