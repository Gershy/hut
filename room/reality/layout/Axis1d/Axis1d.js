global.rooms['reality.layout.Axis1d'] = async () => {
  
  let { Layout } = await getRoom('reality.real.Real');
  return form({ name: 'Axis1d', has: { Layout }, props: (forms, Axis1d) => ({
    
    $modes: 'stack,stretch,compactCenter,disperseFully,dispersePadHalf,dispersePadFull'.split(','),
    
    init({ axis='y', flow='+', mode='stack', window=(mode === 'stack' ? 'scroll' : 'clip') }={}) {
      
      /// {DEBUG=
      if (![ 'x', 'y' ].has(axis)) throw Error(`Api: "axis" must be "x" or "y"`).mod({ axis });
      if (![ '+', '-' ].has(flow)) throw Error(`Api: "flow" must be "+" or "-"`).mod({ flow });
      if (!Axis1d.modes.has(mode)) throw Error(`Api: "mode" must be one of ${Axis1d.modes.map(v => '"' + v + '"').join(',')}`).mod({ mode });
      if (![ 'scroll', 'clip' ].has(window)) throw Error(`Api: "window" must be "scroll" or "clip"`).mod({ window });
      /// =DEBUG}
      
      Object.assign(this, { axis, flow, mode, window, kid: Axis1d.Item(this) });
      
    },
    getKidLayouts() { return [ this.kid ]; },
    install(real) {
      let tmp = Tmp();
      tmp.endWith(this.holdFacet(real, 'content'));
      return tmp;
    },
    
    $Item: form({ name: 'Axis1d.Item', has: { Layout }, props: (forms, Axis1d$Item) => ({
      init(axis1d) { this.axis1d = axis1d; },
      install(real) {
        let tmp = Tmp();
        let { mode, axis } = this.axis1d;
        tmp.endWith(this.holdFacet(real, 'x'));
        tmp.endWith(this.holdFacet(real, 'y'));
        if (this.axis1d.mode === 'stretch') tmp.endWith(this.holdFacet(real, axis === 'x' ? 'w' : 'h'));
        return tmp;
      }
    })})
    
  })});
  
};
