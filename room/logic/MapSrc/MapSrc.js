global.rooms['logic.MapSrc'] = () => form({ name: 'MapSrc', has: { Endable, Src }, props: (forms, Form) => ({
  init(src, fn) {
    
    /// {DEBUG=
    if (!hasForm(src, Src)) throw Error(`Api: "src" should be Src; got ${getFormName(src)}`);
    if (!hasForm(fn, Function)) throw Error(`Api: "fn" should be Function; got ${getFormName(fn)}`);
    /// =DEBUG}
    
    forms.Endable.init.call(this);
    forms.Src.init.call(this);
    
    Object.assign(this, { src, fn, srcRoute: null });
    this.srcRoute = src.route(this.process.bind(this));
    
  },
  process(val) {
    val = this.fn(val);
    if (val !== skip) this.send(val);
  },
  newRoute(fn) {
    // Implement `MapSrc(...).newRoute` simply by delegating to `this.src`
    this.src.newRoute(val => {
      val = this.fn(val);
      if (val !== skip) fn(val);
    });
  },
  cleanup() { this.srcRoute.end(); }
})});
