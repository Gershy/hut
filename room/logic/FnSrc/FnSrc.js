global.rooms['logic.FnSrc'] = foundation => {
  
  let FnSrc = form({ name: 'FnSrc', has: { Endable, Src }, props: (forms, Form) => ({
    
    // TODO: FnSrc is potentially too high-level; should consider only
    // allowing it to receive a single Src, and Send a transformed value
    // for every Send received from that Src...
    
    // Provides capacity to monitor an arbitrary number of Srcs and run
    // functionality based on the most recent result from each Src.
    // Overview:
    // - Array index for each Src; array initially full of `skip`
    // - Src sends replace value at array index
    // - For every such send an arbitrary `fn` maps the current array
    //    to a single arbitrary value
    // - Subclass may provide some intermediate processing on this value
    // - If the processed arbitrary value isn't `skip`, a send occurs
    
    init(srcs, fn) {
      
      if (isForm(this, FnSrc)) throw Error(`Don't init the parent FnSrc class!`);
      
      forms.Endable.init.call(this);
      forms.Src.init.call(this);
      
      let vals = []; // Accessing unpopulated indices gives `skip`
      let ready = srcs.length.toArr(v => false);
      
      this.routes = srcs.map((src, ind) => src.route(val => {
        
        vals[ind] = val;
        
        // Only compute and send a result if a Send has been received
        // from every Src!!
        if (ready) { ready[ind] = true; if (ready.all()) ready = null;  }
        if (ready) return;
        
        let result = this.applyFn(fn, vals);
        if (result !== skip) this.send(result);
        
      }));
      
    },
    applyFn: C.noFn('applyFn', (fn, vals) => 'valToSend'),
    cleanup() { for (let r of this.routes) r.end(); }
    
  })});
  FnSrc.Prm1 = form({ name: 'FnSrc.Prm1', has: { FnSrc }, props: (forms, Form) => ({
    
    // Remember most recent arbitrary value; if this value is repeated,
    // prevent a duplicate send by returning `skip` from `applyFn`
    
    init(...args) {
      this.lastResult = skip;
      forms.FnSrc.init.call(this, ...args);
    },
    srcFlags: { memory: true, singleton: true, tmpsOnly: false },
    newRoute(fn) { if (this.lastResult !== skip) fn(this.lastResult); },
    applyFn(fn, vals) {
      let result = fn(...vals);
      if (result === this.lastResult) return;
      return this.lastResult = result;
    }
    
  })});
  FnSrc.PrmM = form({ name: 'FnSrc.PrmM', has: { FnSrc }, props: (forms, Form) => ({
    
    // Allows duplicate sends
    
    srcFlags: { memory: true, singleton: false, tmpsOnly: false },
    applyFn(fn, vals) { return fn(...vals); }
    
  })});
  FnSrc.Tmp1 = form({ name: 'FnSrc.Tmp1', has: { FnSrc }, props: (forms, Form) => ({
    
    // Prevents duplicate sends; sends most recent Tmp to any late
    // routes; manages arbitrary results by ending them when a new one
    // is received
    
    init(...args) {
      this.lastResult = skip;
      forms.FnSrc.init.call(this, ...args);
    },
    srcFlags: { memory: true, singleton: true, tmpsOnly: true },
    newRoute(fn) { if (this.lastResult !== skip) fn(this.lastResult); },
    applyFn(fn, vals) {
      // Call function; ignore duplicates
      let result = fn(...vals, this.lastResult);
      if (result === this.lastResult) return skip;
      
      // End any previous result; remember result and return it!
      if (this.lastResult) this.lastResult.end();
      return this.lastResult = result;
    },
    cleanup() { forms.FnSrc.cleanup.call(this); this.lastResult && this.lastResult.end(); }
    
  })});
  FnSrc.TmpM = form({ name: 'FnSrc.TmpM', has: { FnSrc }, props: (forms, Form) => ({
    
    // Interestingly, behaves exactly like FnSrc.PrmM! `fn` is expected
    // to return Tmp instances (or `skip`), but this class takes no
    // responsibility for ending these Tmps - this is because there are
    // no restrictions on how many Tmps may exist in parallel!
    
    srcFlags: { memory: true, singleton: false, tmpsOnly: true },
    applyFn(fn, vals) { return fn(...vals); }
    
  })});
  
  return FnSrc;
  
};
