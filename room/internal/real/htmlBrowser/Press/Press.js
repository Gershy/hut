global.rooms['internal.real.htmlBrowser.Press'] = async foundation => {
  
  let Layout = await foundation.getRoom('internal.real.generic.Layout');
  
  return form({ name: 'Press', has: { Layout, Src }, props: (forms, Form) => ({
    init: function({ modes=[ 'continuous', 'discrete' ], flat=true, pressFn=null }={}) {
      
      forms.Src.init.call(this);
      
      if (!isForm(modes, Array)) modes = [ modes ];
      if (!modes.count()) throw Error(`Supply at least one mode`);
      if (modes.count() > 2) throw Error(`Supply maximum two modes`);
      if (modes.find(v => !isForm(v, String)).found) throw Error(`All modes should be String`);
      if (modes.find(v => ![ 'continuous', 'discrete' ].includes(v)).found) throw Error(`Invalid mode; use either "continuous" or "discrete"`);
      Object.assign(this, { modes, flat, pressFn });
      
    },
    isInnerLayout: function() { return false; },
    
    install: function(real) {
      
      let tmp = Tmp();
      let domNode = real.domNode;
      
      if (this.modes.has('continuous')) {
        let clickFn = evt => {
          evt.stopPropagation();
          evt.preventDefault();
          
          let pressFn = this.getParam(real, 'pressFn');
          pressFn && pressFn();
          this.send();
        };
        domNode.addEventListener('click', clickFn);
        tmp.endWith(() => domNode.removeEventListener('click', clickFn));
      }
      
      if (this.modes.has('discrete')) {
        let keyFn = evt => {
          if (evt.ctrlKey || evt.altKey || evt.shiftKey || evt.code !== 'Enter') return;
          evt.preventDefault();
          evt.stopPropagation();
          
          let pressFn = this.getParam(real, 'pressFn');
          pressFn && pressFn();
          this.send();
        };
        domNode.addEventListener('keypress', keyFn);
        tmp.endWith(() => domNode.removeEventListener('keypress', keyFn));
      }
      
      if (this.modes.has('discrete') && this.modes.has('continuous')) {
        domNode.setAttribute('tabIndex', '0');
        tmp.endWith(() => domNode.removeAttribute('tabIndex'));
      }
      
      return tmp;
      
    },
    
    render: function(real, domNode) {
      if (this.modes.includes('continuous')) domNode.style.cursor = 'pointer';
      if (this.flat) domNode.style.userSelect = 'none';
    }
    
  })});
  
};
