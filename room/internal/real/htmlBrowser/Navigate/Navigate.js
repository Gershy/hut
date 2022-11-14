global.rooms['internal.real.htmlBrowser.Navigate'] = async foundation => {
  
  let { logic: { Tmp }, Real, Layout } = await foundation.getRooms([
    'logic',
    'internal.real.generic.Layout',
    'internal.real.generic.Real'
  ]);
  
  return U.form({ name: 'Navigate', has: { Layout }, props: (insp, Insp) => ({
    init: function({ target }={}) {
      Object.assign(this, { target });
    },
    install: function(real) {
      
      let tmp = Tmp();
      
      let anchor = document.createElement('a');
      Object.assign(anchor.style, { position: 'absolute', left: '0', right: '0', top: '0', bottom: '0', zIndex: '1000' });
      anchor.classList.add('_nav');
      real.domNode.appendChild(anchor);
      tmp.endWith(() => anchor.remove());
      
      return tmp;
      
    },
    render: function(real, domNode) {
      
      let target = this.getParam(real, 'target');
      let anchor = domNode.querySelector(':scope > a._nav');
      
      if (U.hasForm(target, Array)) {
        
        anchor.setAttribute('href', `#${target.join('/')}`);
        
      } else if (U.hasForm(target, Real)) {
        
        let fragment = target.getNavChain().map(n => n.term).join('/');
        anchor.setAttribute('href', `#${fragment}`);
        
      } else if (U.hasForm(target, Real.NavOpt)) {
        
        let fragment = target.getChain().map(n => n.term).join('/');
        anchor.setAttribute('href', `#${fragment}`);
        
      } else {
        
        console.log(`Non-Real target: ${U.getFormName(target)}`, target);
        
      }
      
    }
  })});
  
};
