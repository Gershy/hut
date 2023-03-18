global.rooms['internal.real.htmlBrowser.Size'] = async foundation => {
  
  let Layout = await foundation.getRoom('internal.real.generic.Layout');
  return form({ name: 'Size', has: { Layout }, props: (forms, Form) => ({
    init: function({ ratio=null, w=ratio ? null : '100%', h=ratio ? null : '100%' }) {
      if (ratio !== null && (w === null) === (h === null)) throw Error(`With "ratio" must provide exactly one of "w" or "h"`);
      
      // TODO: With css can't use ratio with height since the height
      // value provided may be interpreted as a percentage of the width,
      // and it isn't clear that css has a way around this (there could
      // potentially be a complex system where the geometry of the
      // parent is available when a child is being rendered, allowing
      // custom logic to compute percentages of the height, but that's
      // a long shot)
      if (ratio !== null && w === null) throw Error(`With "ratio" must provide "w" :(`);
      Object.assign(this, { ratio, w, h });
    },
    render: function(real, domNode) {
      
      let { w, h, ratio } = this;
      if (ratio !== null) {
        let [ amt, unit ] = ((w !== null) ? w : h).match(/([0-9]*)(.*)/).slice(1);
        if (w !== null) h = `${parseFloat(amt) / ratio}${unit}`;
        if (h !== null) w = `${parseFloat(amt) * ratio}${unit}`;
        domNode.style.width = w;
        domNode.style.paddingBottom = h;
      } else {
        if (w !== null) domNode.style.width = w;
        if (h !== null) domNode.style.height = h;
      }
      
    }
  })});
  
};
