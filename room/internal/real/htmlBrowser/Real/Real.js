global.rooms['internal.real.htmlBrowser.Real'] = async foundation => {
  
  let { Real: GenericReal } = await foundation.getRooms([ 'internal.real.generic.Real' ]);
  
  return form({ name: 'Real', has: { GenericReal }, props: (forms, Form) => ({
    
    init({ domNode=document.createElement('div'), ...args }={}) {
      
      Object.assign(this, { renderPrm: null, domNode });
      forms.GenericReal.init.call(this, args);
      
    },
    doRender(delta) {
      
      /// {DEBUG=
      if (foundation.conf('real.visualizeNesting')) this.domNode.style.backgroundColor = 'rgba(0, 0, 0, 0.02)';
      /// =DEBUG}
      
      forms.GenericReal.doRender.call(this, delta);
      
      // If a NavPar exists make the Real natively referential in html
      // using the "id" attribute:
      if (this.navPar) this.domNode.setAttribute('id', this.getNavChain().map(v => v.term).join('/'));
      
      // Transfer any "name" property to the html "class" property
      if (this.name) this.domNode.classList.add(this.name.replace(/([^a-zA-Z0-9]+)([a-zA-Z0-9])?/g, (f, p, c) => c ? c.upper() : ''));
      
      if (this.off()) {
        this.domNode.removeAttribute('tabIndex');
        this.domNode.style.pointerEvents = 'none';
      }
      
    },
    addReal(...args) {
      
      let real = forms.GenericReal.addReal.call(this, ...args);
      this.domNode.appendChild(real.domNode);
      real.render();
      return real;
      
    },
    cleanup() {
      
      let endDelayMs = this.params.has('endDelayMs') ? this.params.endDelayMs : 0;
      
      if (!endDelayMs) {
        this.domNode.remove();
      } else {
        this.domNode.removeAttribute('tabIndex');
        this.domNode.style.pointerEvents = 'none';
        setTimeout(() => this.domNode.remove(), endDelayMs);
      }
      forms.GenericReal.cleanup.call(this);
      
    }
    
  })});
  
};
