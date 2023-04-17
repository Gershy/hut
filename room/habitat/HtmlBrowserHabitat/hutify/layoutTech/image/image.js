global.rooms['habitat.HtmlBrowserHabitat.hutify.layoutTech.image'] = () => ({
  install: (real, layout, cleanupTmp) => {
    
    real['~imageUri'] = layout.getParam(real, 'keep')?.getUri() ?? null;
    cleanupTmp.endWith(() => delete real['~imageUri']);
    
  },
  render: (real, layout) => {
    
    let uri = real['~imageUri']
    
    if (uri) Object.assign(real.node.style, {
      imageRendering: layout.smoothing ? '' : 'pixelated',
      backgroundImage: `url("${encodeURI(uri)}")`,
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'center',
      backgroundSize: (layout.scale === 1) ? 'cover' : `${(layout.scale * 100).toFixed(3)}%`
    });
    
  }
});
