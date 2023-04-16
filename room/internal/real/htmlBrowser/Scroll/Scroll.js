global.rooms['internal.real.htmlBrowser.Scroll'] = async foundation => {
  
  let Layout = await foundation.getRoom('internal.real.generic.Layout');
  return form({ name: 'Scroll', has: { Layout }, props: (forms, Form) => ({
    init: function({ mode='mid', x=null, y=null, w=null, h=null }) {
      Object.assign(this, { mode, x, y, w, h });
    },
    isInnerLayout: function() { return true; },
    getChildLayout: function() { return Form.Item(this); },
    
    render: function(real) {
      
      let { x, y } = this;
      if (x === 'auto') real.domNode.style.overflowX = 'auto';
      if (x === 'show') real.domNode.style.overflowX = 'scroll';
      if (y === 'auto') real.domNode.style.overflowY = 'auto';
      if (y === 'show') real.domNode.style.overflowY = 'scroll';
      
    },
    scrollTo: function(parReal, kidReal) {
      
      let scrollElem = parReal.domNode;
      let children = [ ...scrollElem.childNodes ];
      if (children.count() !== 1) throw Error(`Scrollable parent needs 1 child; has ${children.count()}`);
      
      let offsetElem = children[0];
      let targetElem = kidReal.domNode;
      if (!offsetElem.contains(targetElem)) throw Error(`The target elem is outside the scrollable context`);
      
      let tops = [ scrollElem, offsetElem, targetElem ].map(elem => elem.getBoundingClientRect().top);
      offsetElem.scrollTop += tops[2] - tops[1];
      
    },
    
    $Item: form({ name: 'Scroll.Item', has: { Layout }, props: (forms, Form) => ({
      init: function(par, ...params) {
        this.par = par;
      },
      render: function(real) {
        let { x, y } = this.par;
        if (x !== 'none' || y !== 'none') real.domNode.style.scrollBehavior = 'smooth';
      }
    })})
    
  })});
  
};
