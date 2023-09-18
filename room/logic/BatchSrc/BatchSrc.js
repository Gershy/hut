global.rooms['logic.BatchSrc'] = () => form({ name: 'BatchSrc', has: { Endable, Src }, props: (forms, Form) => ({
  
  init(srcs) {
    
    forms.Endable.init.call(this);
    forms.Src.init.call(this);
    Object.assign(this, {
      state: srcs.map(() => null),
      missing: Set(srcs.toArr((v, k) => k)),
      srcRoutes: null
    });
    
    // TODO: There's an idea of having 2 separate processing functions; one for the "waiting" phase
    // and the other for the "active" phase. This is nice because it swaps the overhead of checking
    // which phase we're in, for more processing only when the phase switches; it's presumably
    // worth saving O(n) overhead in favour of O(1). But the implementation is TRICKY - ending all
    // previous routes is hard if all `srcRoutes` are `{ memory: true }` and send immediately - in
    // this case the phase changes *before* a meaningful value is set for `this.srcRoutes` - and
    // this makes it hard to end the "waiting" phase Routes as there's no reference to them
    this.srcRoutes = srcs.toArr((src, k) => src.route(this.process.bind(this, k)));
    
  },
  
  process(k, val) {
    
    if (this.missing) { // "waiting" phase
      
      this.state[k] = val;
      this.missing.rem(k);
      if (this.missing.size === 0) this.missing = null; // Indicate end of "waiting" phase
      
    } else if (this.state[k] !== val) { // "active" phase
      
      this.state[k] = val;
      this.send(this.state.map(v => v)); // Send a copy of our state
      
    }
    
  },
  
  srcFlags: { memory: true, multi: true, tmpsOnly: false },
  newRoute(fn) { if (!this.missing) fn(this.state); },
  cleanup() {
    
    for (let srcRoute of this.srcRoutes.toArr(v => v))
      srcRoute.end();
    
  }
  
})})