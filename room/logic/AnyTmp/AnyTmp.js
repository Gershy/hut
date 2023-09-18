global.rooms['logic.AnyTmp'] = foundation => form({ name: 'AnyTmp', has: { Tmp }, props: (forms, Form) => ({
  
  // A Tmp which lasts as long as any underlying Tmp lasts
  
  init(tmps) {
    forms.Tmp.init.call(this);
    let cnt = tmps.length;
    let endFn = () => (--cnt > 0) || this.end();
    for (let tmp of tmps) this.endWith(tmp.route(endFn));
  }
  
})});
