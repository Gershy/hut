global.rooms['logic.SetSrc'] = foundation => form({ name: 'SetSrc', has: { Endable, Src }, props: (forms, Form) => ({
  
  // Allows a Tmp-sending Src to be treated in aggregate, instead of
  // an item-by-item basis. Instead of monitoring a Src for sent Tmps
  // and each sent Tmp for ending, SetSrc allows a Src to be monitored
  // for any change, whether it is a new Tmp or an ended Tmp. Sends
  // from this class return the entire set of Tmps
  
  init(src) {
    
    forms.Src.init.call(this);
    this.tmps = Set();
    this.tmpRoutes = Set();
    this.srcRoute = src.route(tmp => {
      
      if (tmp.off()) return;
      
      let tmpRoute = tmp.route(() => {
        this.tmps.rem(tmp);
        this.tmpRoutes.rem(tmpRoute);
        this.send(this.tmps);
      });
      
      this.tmps.add(tmp);
      this.tmpRoutes.add(tmpRoute);
      
      this.send(this.tmps);
      
    });
    
  },
  newRoute(fn) { fn(this.tmps); },
  cleanup() {
    this.srcRoute.end();
    for (let r of this.tmpRoutes) r.end();
  }
  
})});

