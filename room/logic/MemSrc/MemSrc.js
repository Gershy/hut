global.rooms['logic.MemSrc'] = () => form({ name: 'MemSrc', has: { Src }, props: (forms, Form) => ({
  
  // There is the concept of an Endable Src, which takes some Src as a parameter and creates a
  // Route on it (and ends the Route by implementing `cleanup`) (the Endable Src Sends based on
  // incoming Sends from its Route), and a non-Endable Src, which defines public methods that can
  // be manually called by the consumer, and these methods cause Sends to occur
  
  init(initialVal=skip) {
    forms.Src.init.call(this);
    Object.assign(this, { val: initialVal });
  },
  srcFlags: { memory: true, multi: true, tmpsOnly: false },
  newRoute(fn) { if (this.val !== skip) fn(this.val); },
  send(val) {
    if (val === this.val) return;
    
    this.val = val;
    if (val !== skip) forms.Src.send.call(this, val);
  },
  clear() { this.val = skip; }
  
  // No "cleanup" function - MemSrc is not an Endable!
  
})});