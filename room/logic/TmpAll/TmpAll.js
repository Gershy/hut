global.rooms['logic.TmpAll'] = form({ name: 'TmpAll', has: { Tmp }, props: (forms, Form) => ({
  
  // A Tmp which lasts as long as all underlying Tmps last
  
  init(tmps) {
    forms.Tmp.init.call(this);
    let fn = this.end.bind(this);
    this.routes = []; // Add property in case a Tmp immediately ends
    this.routes = tmps.map(tmp => {
      let route = tmp.route(fn);
      this.endWith(route);
      return route;
    });
  },
  cleanup() { for (let r of this.routes) r.end(); }
  
})});
