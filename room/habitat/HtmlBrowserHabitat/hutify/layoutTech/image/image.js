global.rooms['habitat.HtmlBrowserHabitat.hutify.layoutTech.image'] = () => ({
  install: (real, layout, cleanupTmp) => {},
  render: (real, layout) => {
    
    let uri = layout.getParam(real, 'keep')?.getUri();
    if (uri) Object.assign(real.node.style, {
      imageRendering: layout.smoothing ? '' : 'pixelated',
      backgroundImage: `url("${uri}")`,
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'center',
      backgroundSize: (layout.scale === 1) ? 'cover' : `${(layout.scale * 100).toFixed(3)}%`
    });
    
  }
});
