global.rooms['logic.SwitchSrc'] = () => form({ name: 'SwitchSrc', has: { Endable, Src }, props: (forms, Form) => ({
  
  init(src) {
    forms.Endable.init.call(this);
    forms.Src.init.call(this);
    Object.assign(this, {
      tmp: Tmp.stub,
      srcRoute: src.route(this.process.bind(this))
    });
  },
  
  process(val) {
    // Debounce
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
  
  srcFlags: { memory: true, singleton: true, tmpsOnly: true },
  newRoute(fn) { if (this.tmp.onn()) fn(this.tmp); },
  cleanup() { this.srcRoute.end(); }
  
})});