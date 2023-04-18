global.rooms['habitat.HtmlBrowserHabitat.hutify.layoutTech.keep'] = () => ({
  install: (real, layout, cleanupTmp) => {
    
    let a = document.createElement('a');
    a.classList.add('keep');
    Object.assign(a.style, {
      position: 'absolute',
      left: '0', top: '0',
      width: '100%', height: '100%',
      zIndex: 10
    });
    
    real.node.appendChild(a);
    cleanupTmp.endWith(() => a.remove());
    
  },
  render: (real, layout) => {
    
    let [ uri, mode ] = [ 'uri', 'mode' ].map(p => layout.getParam(real, p));
    
    let a = real.node.querySelector(':scope > a.keep');
    a.setAttribute('href', uri);
    a.setAttribute('target', { spawn: '_blank', replace: '_self' }[mode]);
    
  }
});
