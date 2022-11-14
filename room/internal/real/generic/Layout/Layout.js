global.rooms['internal.real.generic.Layout'] = foundation => form({ name: 'Layout', props: (forms, Form) => ({
  init: C.noFn('init'),
  render: C.noFn('render'),
  getParam: function(real, term=null) {
    if (!term) throw Error(`Unexpected params (need to pass a Real as first param to Layout.prototype.getParam)`);
    if (real.params.has(term) && real.params[term] !== null) return real.params[term];
    if ({}.has.call(this, term)) return this[term];
    return null;
  },
  install: function(real) { return Tmp.stub; },
  isInnerLayout: function() { return false; },
  getChildLayout: function() { return null; },
})});
