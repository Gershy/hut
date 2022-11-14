global.rooms['internal.real.htmlBrowser.Axis1d'] = async foundation => {
  
  let Layout = await foundation.getRoom('internal.real.generic.Layout');
  
  return form({ name: 'Axis1d', has: { Layout }, props: (forms, Form) => ({
    
    $modes: 'stack,stackFwd,stackBwd,stretch,compactCenter,disperseFully,dispersePadHalf,dispersePadFull'.split(','),
    $Item: form({ name: 'Axis1d.Item', has: { Layout }, props: (forms, Form) => ({
      init: function(par) { Object.assign(this, { par }); },
      render: function(real, domNode) {
        
        if (real.params.has('order') && isForm(real.params.order, Number)) domNode.style.order = `${real.params.order}`;
        
        // If stacking prevent any child elements from shrinking!
        if ([ 'stackFwd', 'stackBwd' ].has(this.par.mode)) domNode.style.flexShrink = '0';
        
        if (this.par.mode === 'stretch') {
          
          // Children are all the same size
          domNode.style.gain({
            flexGrow: '1',
            flexShrink: '1',
            flexBasis: '0',
            [this.par.axis === 'x' ? 'height' : 'width']: '100%'
          });
          
        } else if (isForm(this.par.mode, Array)) { // TODO: Is this ever used?? NO.
          
          let cuts = this.par.mode;
          
          // Children are sized using the specified "cuts"
          let cutInd = this.params[0]; // TODO: Cut index should be found at something like `real.params.cutIndex`
          let offCuts = cuts.slice(0, cutInd);
          
          let off = offCuts.length ? `calc(${offCuts.join(' + ')})` : '0';
          let ext = (cutInd <= (cuts.count() - 1))
            ? cuts[cutInd]
            : `calc(100% - ${cuts.join(' - ')})`;
          
          domNode.style.position = 'absolute';
          
          let dir = this.par.flow + this.par.axis;
          if (dir === '+x') domNode.style.gain({ left: off, width: ext, height: '100%' });
          if (dir === '-x') domNode.style.gain({ right: off, width: ext, height: '100%' });
          if (dir === '+y') domNode.style.gain({ top: off, width: '100%', height: ext });
          if (dir === '-y') domNode.style.gain({ bottom: off, width: '100%', height: ext });
          
        }
        
      }
    })}),
    
    init: function({ axis='y', flow='+', mode='stack', overflowAction=null }) {
      
      if (isForm(mode, Array)) throw Error(`Array of modes not implemented yet!`);
      
      if (![ 'x', 'y' ].has(axis)) throw Error(`Invalid axis: "${axis}"`);
      if (![ '+', '-' ].has(flow)) throw Error(`Invalid axis: "${flow}"`);
      
      if (!isForm(mode, Array) && !Form.modes.has(mode)) throw Error(`Invalid mode: "${mode}"`);
      
      // Resolve "stack" to be "stackFwd"
      if (mode === 'stack') mode = 'stackFwd';
      
      // If we're stacking it means children can grow outside the parent
      // and we may need to be able to scroll. Any other mode entails
      // that children will always fit inside their parent, and no
      // scrolling is needed. Note that the default scroll behaviour
      // depends on whether the Axis1d is stacking or not.
      if (overflowAction === null) overflowAction = [ 'stackFwd', 'stackBwd' ].has(mode) ? 'scroll' : 'none';
      
      Object.assign(this, { axis, flow, mode, overflowAction });
      
    },
    isInnerLayout: function() { return true; },
    getChildLayout: function() { return Form.Item(this); },
    render: function(real, domNode) {
      
      // TODO: I took this off thinking of `* { position: relative; }`
      // so unless some other layout sets a non-relative/absolute
      // position we should always be guaranteed at least relative
      //if (![ 'relative', 'absolute' ].has(domNode.style.position)) domNode.style.position = 'relative';
      
      if (isForm(this.mode, String)) {
        
        domNode.style.display = 'flex';
        domNode.style.flexDirection = (this.axis === 'x')
          ? (this.flow === '+' ? 'row' : 'row-reverse')
          : (this.flow === '+' ? 'column' : 'column-reverse');
        
        // Controls tangent alignment; consider an Axis1d with dir: 'y'
        // and with children of varying widths; if they should be
        // horizontally centered we're all set, but if they should be
        // aligned left/right (so that wide ones jut out far to the side
        // past their siblings) we'll need additional properties to
        // define this behaviour
        domNode.style.alignItems = 'center';
        
        domNode.style.justifyContent = {
          stackFwd: 'start',
          stackBwd: 'end',
          stretch: 'stretch',
          compactCenter: 'center',
          disperseFully: 'space-between',
          dispersePadHalf: 'space-around',
          dispersePadFull: 'space-evenly',
        }[this.mode];
        
      }
      
      if (this.overflowAction === 'none') {
        domNode.style.overflow = 'hidden';
      } else {
        domNode.style.overflow = (this.axis === 'x') ? 'auto hidden' : 'hidden auto';
      }
      
    }
    
  })});
  
};
