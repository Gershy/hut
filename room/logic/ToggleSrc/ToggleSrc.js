global.rooms['logic.ToggleSrc'] = () => form({ name: 'ToggleSrc', has: { Endable, Src }, props: (forms, Form) => ({
  
  init(src) {
    forms.Endable.init.call(this);
    forms.Src.init.call(this);
    Object.assign(this, {
      tmp: Tmp.stub,
      srcRoute: null
    });
    
    this.srcRoute = src.route(this.process.bind(this));
    
    /// {ASSERT=
    if (!this.tmp) throw Error('AOOowowowowaa')
    /// =ASSERT}
    
  },
  
  process(val) {
    // Ignore if val is truthy and we are onn, or val is falsey and we are off
    if (!!val === this.tmp.onn()) return;
    
    if (val) {
      /// {ASSERT=
      if (this.tmp.onn()) throw Error('OOwowuuwauauaushghhg pre-existing Tmp was onn');
      /// =ASSERT}
      this.send(this.tmp = Tmp());
    } else {
      this.tmp.end();
    }
  },
  
  srcFlags: { memory: true, multi: true, tmpsOnly: true },
  newRoute(fn) { if (this.tmp.onn()) fn(this.tmp); },
  cleanup() { this.srcRoute.end(); }
  
})});