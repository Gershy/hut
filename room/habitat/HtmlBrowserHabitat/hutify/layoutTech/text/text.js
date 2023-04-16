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
    // it could be better to use define something new like RichText
    real.node.querySelector(':scope > span.text').textContent = layout.getParam(real, 'text') ?? '';
    
    Object.assign(real.node.style, {
      
      // Manage `span` within the bounding of `real`, as applied by
      // other Layouts
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      
      fontSize: layout.getParam(real, 'size') ?? '',
      fontWeight: layout.style.has('bold') ? 'bold' : '',
      fontStyle: layout.style.has('italic') ? 'italic' : '',
      
      // Convert hut-style Realism to css
      textAlign: { fwd: 'left', bwd: 'right', mid: 'center', justify: 'justify' }[layout.align]
      
    });
    
    let { inner, outer: { h, v } } = layout.spacing;
    if (h) Object.assign(real.node.style, { paddingLeft: h, paddingRight: h });
    if (v) Object.assign(real.node.style, { paddingTop: v, paddingBottom: v });
    if (inner) Object.assign(real.node.style, { lineHeight: inner }); // TODO: line-height also adds "outer" padding (half the line-height value); really it should be subtracted from any padding (note padding can't go negative, so 0 outer padding with some line-height always results in "outer padding")
    
  }
});
