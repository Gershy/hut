global.rooms['habitat.HtmlBrowserHabitat.hutify.layoutTech.textFlow'] = () => ({
  install: (real, layout, cleanupTmp) => {},
  render: (real, layout) => {
    
    let format = layout.getParam(real, 'format');
    if (isForm(format, String)) format = { type: format };
    
    if (format.type === null) {
      
      Object.assign(real.node.style, { color: '#700' });
      
    } else if (format.type === 'code') {
      
      Object.assign(real.node.style, {});
      
    }
    
  }
});