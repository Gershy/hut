global.rooms['habitat.HtmlBrowserHabitat.hutify.layoutTech.feel'] = async () => {
  
  let { MemSrc, MapSrc, BatchSrc, ToggleSrc } = await getRooms([
    'logic.MemSrc',
    'logic.MapSrc',
    'logic.BatchSrc',
    'logic.ToggleSrc'
  ]);
  
  return {
    install: (real, layout, cleanupTmp) => {
      
      let node = real.node;
      
      // These 2 inputs...
      let feelCnt = MemSrc(0);
      let feelDsc = MemSrc(0);
      if (layout.modes.has('continuous')) {
        cleanupTmp.endWith(node.evt('mouseenter', () => feelCnt.send(1)));
        cleanupTmp.endWith(node.evt('mouseleave', () => feelCnt.send(0)));
      }
      if (layout.modes.has('discrete')) {
        cleanupTmp.endWith(node.evt('focus', () => feelDsc.send(1)));
        cleanupTmp.endWith(node.evt('blur',  () => feelDsc.send(0)));
      }
      
      // Via this logic...
      let batchSrc = BatchSrc({ cnt: feelCnt, dsc: feelDsc });
      let fnSrc = MapSrc(batchSrc, ({ cnt, dsc }) => cnt || dsc);
      let switchSrc = ToggleSrc(fnSrc);
      
      // Result in feeding Tmps to the "feelSrc" Layout param
      let feelSrc = layout.getParam(real, 'feelSrc');
      let routeToConsumer = switchSrc.route(tmp => {
        layout.getParam(real, 'feelFn')?.(tmp);
        feelSrc.send(tmp);
      });
      
      cleanupTmp.endWith(() => {
        feelCnt.send(0);
        feelDsc.send(0);
        
        routeToConsumer.end();
        switchSrc.end();
        fnSrc.end();
        batchSrc.end();
      });
      
      // Apply a tabIndex if discrete activations are allowed
      if (layout.modes.has('discrete')) {
        real.node.setAttribute('tabIndex', '0');
        cleanupTmp.endWith(() => real.node.removeAttribute('tabIndex'));
      }
      
    },
    render: (real, layout) => {
      
      if (layout.modes.has('continuous')) real.node.style.cursor = 'pointer';
      
    }
  };
  
};
