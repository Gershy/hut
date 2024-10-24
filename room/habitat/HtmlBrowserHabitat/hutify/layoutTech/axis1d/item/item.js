global.rooms['habitat.HtmlBrowserHabitat.hutify.layoutTech.axis1d.item'] = () => ({
  install: () => {},
  render: (real, layout) => {
    
    let style = real.node.style;
    let axis1d = layout.axis1d;
    
    if (isForm(real.params.order, Number)) style.order = real.params.order.toString(10);
    if (axis1d.mode === 'stack') style.flexShrink = '0';
    if (axis1d.mode === 'stretch') Object.assign(style, {
      flexShrink: '0',
      flexGrow: '1',
      flexBasis: '1',
      [axis1d.axis === 'x' ? 'height' : 'width']: '100%'
    });
    
  }
});
