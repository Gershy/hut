global.rooms['habitat.HtmlBrowserHabitat.hutify.layoutTech.axis1d'] = () => ({
  install: (real, layout, cleanupTmp) => {},
  render: (real, layout) => {
    
    let axis = layout.getParam(real, 'axis');
    let flow = layout.getParam(real, 'flow');
    let mode = layout.getParam(real, 'mode');
    let window = layout.getParam(real, 'window');
    Object.assign(real.node.style, {
      flexDirection: { x: 'row', y: 'column' }[axis] + { '+': '', '-': '-reverse' }[flow],
      alignItems: 'center',
      justifyContent: {
        stack: 'start',
        stretch: 'start',
        compactCenter: 'center',
        disperseFully: 'space-between',
        dispersePadHalf: 'space-around',
        dispersePadFull: 'space-evenly'
      }[mode],
      overflow: {
        'clip x': 'hidden',
        'clip y': 'hidden',
        'scroll x': 'auto hidden',
        'scroll y': 'hidden auto'
      }[`${window} ${axis}`]
    });
    
  }
});
