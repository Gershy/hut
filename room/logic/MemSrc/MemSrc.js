global.rooms['logic.MemSrc'] = () => {
  
  let MemSrc = form({ name: 'MemSrc', has: { Endable, Src }, props: (forms, Form) => ({
    init() {
      if (isForm(this, MemSrc)) throw Error(`Don't init the parent MemSrc class!`);
      forms.Endable.init.call(this);
      forms.Src.init.call(this);
    },
    mod: C.noFn('mod')
  })});
  MemSrc.Prm1 = form({ name: 'MemSrc.Prm1', has: { MemSrc }, props: (forms, Form) => ({
    init(val=skip) { forms.MemSrc.init.call(this); this.val = val; },
    srcFlags: { memory: true, multi: true, tmpsOnly: false },
    newRoute(fn) { if (this.val !== skip) fn(this.val); },
    mod(val) {
      
      if (hasForm(val, Function)) val = val(this.val);
      
      // Only short-circuit for primitive types; don't trust identity
      // to tell us if compound types (Object, Array, Set, etc.) mutated
      if (val === this.val && [ String, Number, Boolean ].has(val?.constructor)) return;
      this.val = val;
      if (this.val !== skip) this.send(val);
      
    },
    cleanup() { this.val = skip; }
  })});
  MemSrc.PrmM = form({ name: 'MemSrc.PrmM', has: { MemSrc }, props: (forms, Form) => ({
    init() { forms.MemSrc.init.call(this); this.vals = []; },
    srcFlags: { memory: true, multi: false, tmpsOnly: false },
    count() { return this.vals.count(); },
    mod(val) { this.vals.push(val); this.send(val); },
    newRoute(fn) { for (let val of this.vals) fn(val); },
    cleanup() { this.vals = []; }
  })});
  MemSrc.Tmp1 = form({ name: 'MemSrc.Tmp1', has: { MemSrc }, props: (forms, Form) => ({
    
    init() {
      forms.MemSrc.init.call(this);
      this.valEndRoute = null;
      this.val = null;
    },
    mod(tmp) {
      
      if (tmp && tmp.off()) tmp = null; // Process inactive retains as if they were `null`
      if (this.val === tmp) return; // Ignore duplicates
      
      // Clear previous value
      this.cleanup(); // Whoa! Using `this.cleanup` outside of End behaviour?? VERY flashy
      
      if (tmp === null) return;
      
      // Retain new value
      this.val = tmp;
      this.valEndRoute = tmp.endWith(this, 'tmp');
      this.send(tmp);
      
    },
    newRoute(fn) { if (this.val) fn(this.val); },
    cleanup() {
      this.valEndRoute?.end();
      this.val = this.valEndRoute = null;
    }
    
  })});
  MemSrc.TmpM = form({ name: 'MemSrc.TmpM', has: { MemSrc }, props: (forms, Form) => ({
    
    // Tracks a set of Tmps
    // 
    // Add Tmps with TmpM(...).mod(tmp);
    // 
    // Rem Tmps with TmpM(...).mod(tmp).end();
    // ... but note that the Tmp will have already been Sent, and any
    // routes that responded to that Send will not be informed that the
    // Tmp has left the set. The only way to accomplish this is by
    // ending the Tmp itself
    
    init() {
      forms.MemSrc.init.call(this);
      this.vals = Set();
      this.valEndRoutes = Map(); // Note that because a lot of consuming code expects `this.vals` to be a Set we need an additional map to track Tmp => TmpEndRoute mappings
      this.counter = null;
    },
    count() { return this.vals.count(); },
    getCounterSrc() {
      if (!this.counter) this.counter = MemSrc.Prm1(this.vals.count());
      return this.counter;
    },
    mod(tmp) {
      
      if (tmp.off()) return; // Ignore inactive Tmps
      if (this.vals.has(tmp)) return; // Ignore duplicates
      
      this.vals.add(tmp);
      this.counter && this.counter.mod(this.vals.count());
      
      let tmpEndRoute = tmp.route(() => {
        this.vals.rem(tmp);
        this.valEndRoutes.rem(tmp);
        this.counter && this.counter.mod(this.vals.count());
      });
      this.valEndRoutes.set(tmp, tmpEndRoute);
      
      this.send(tmp);
      
    },
    newRoute(fn) { for (let val of this.vals) fn(val); },
    endAll() { for (let tmp of [ ...this.vals ]) tmp.end(); },
    cleanup() {
      for (let [ , route ] of this.valEndRoutes) route.end();
      this.vals = Set();
      this.valEndRoutes = Map();
    }
    
  })});
  
  return MemSrc;
  
};
