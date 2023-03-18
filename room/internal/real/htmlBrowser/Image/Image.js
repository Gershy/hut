global.rooms['internal.real.htmlBrowser.Image'] = async foundation => {
  
  let Layout = await foundation.getRoom('internal.real.generic.Layout');
  return form({ name: 'Image', has: { Layout }, props: (forms, Form) => ({
    init: function({ imgKeep=null, smoothing=true, scale=1 }={}) {
      
      Object.assign(this, { imgKeep, smoothing, scale });
      
    },
    render: function(real, domNode) {
      
      let imgKeep = this.getParam(real, 'imgKeep');
      if (!imgKeep) return;
      
      Object.assign(domNode.style, {
        imageRendering: this.smoothing ? '' : 'pixelated',
        backgroundImage: `url("${encodeURI(url(imgKeep.getUrlParams(), { fixed: true }))}")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center',
        backgroundSize: (this.scale === 1) ? 'cover' : `${(this.scale * 100).toFixed(3)}%`
      });
      
    }
  })});
  
};
