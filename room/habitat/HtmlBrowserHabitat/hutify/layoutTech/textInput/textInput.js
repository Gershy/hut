global.rooms['habitat.HtmlBrowserHabitat.hutify.layoutTech.textInput'] = () => ({
  install: (real, layout, cleanupTmp) => {
    
    let input;
    if (layout.multiline) (input = document.createElement('textarea'));
    else                  (input = document.createElement('input')).setAttribute('type', 'text');
    input.classList.add('textInput');
    Object.assign(input.style, {
      position: 'absolute', left: '0', top: '0', width: '100%', height: '100%',
      padding: 'inherit', border: 'none', backgroundColor: 'transparent',
      textAlign: 'inherit', fontFamily: 'inherit', color: 'inherit',
      fontSize: '100%' // Be careful not to "inherit" font size - that would multiply any font sizing!
    });
    real.node.appendChild(input);
    cleanupTmp.endWith(() => input.remove());
    
    let heightener = document.createElement('span');
    heightener.classList.add('heightener');
    heightener.textContent = '\u2195'; // Unicode "up-down-arrow"
    Object.assign(heightener.style, { visibility: 'hidden', pointerEvents: 'none' });
    real.node.appendChild(heightener);
    cleanupTmp.endWith(() => heightener.remove());
    
    let textInputSrc = layout.getParam(real, 'textInputSrc');
    
    // Input events on the html node trigger the Src
    cleanupTmp.endWith(input.evt('input', evt => textInputSrc.mod(input.value)));
    
    // When the Src Sends, update the html input
    cleanupTmp.endWith(textInputSrc.route(val => input.value = val));
    
  },
  render: (real, layout) => {
    
    // TODO: A fair bit of this logic is copy-pasted from ./text.js
    
    Object.assign(real.node.style, {
      
      // Manage `span` within the bounding of `real`, as applied by
      // other Layouts
      fontSize: layout.getParam(real, 'size') ?? '',
      fontWeight: layout.style.has('bold') ? 'bold' : '',
      fontStyle: layout.style.has('italic') ? 'italic' : '',
      
      // Convert hut-style Realism to css
      textAlign: { fwd: 'left', bwd: 'right', mid: 'center', justify: 'justify' }[layout.align]
      
    });
    
    let prompt = layout.getParam(real, 'prompt');
    if (prompt) real.node.querySelector(`:scope > ${layout.multiline ? 'textarea' : 'input'}.textInput`).setAttribute('placeholder', prompt);
    
    let { h, v, line } = layout.spacing;
    if (h) Object.assign(real.node.style, { paddingLeft: h, paddingRight: h });
    if (v) Object.assign(real.node.style, { paddingTop: v, paddingBottom: v });
    if (line) Object.assign(real.node.style, { lineHeight: line }); // TODO: line-height also adds "outer" padding (half the line-height value); really it should be subtracted from any padding (note padding can't go negative, so 0 outer padding with some line-height always results in "outer padding")
    
  }
});
