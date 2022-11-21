global.rooms['internal.real.RealTree'] = async foundation => {
  
  return form({ name: 'RealTree', props: (forms, Form) => ({
    
    // TODO: This should draw from a definitive list (the repo?)
    $layoutFormNames: 'Art,Axis1d,Decal,Feel,Geom,Image,Press,Scroll,Text,TextInput'.split(','),
    
    init(name, fn) {
      
      Object.assign(this, { name, fn });
      
      let layoutForms = Form.layoutFormNames.toObj(layoutFormName => {
        return [ layoutFormName, (...args) => ({ layoutFormName, args }) ];
      });
      
      this.defs = {};
      let define = (term, ...vals) => this.defs[term] = vals;
      let insert = (term) => {};
      fn(layoutForms, define, insert);
      
      this.realTech = Promise.resolve(foundation.getRootReal()).then(rootReal => {
        let tech = rootReal.access('primary').tech;
        this.realTech = tech;
        return tech;
      });
      
      // Immediately request all required techs
      this.realTech.then(tech => {
        tech.getLayoutForms(this.defs.toArr(layouts => layouts.map(layout => layout.layoutFormName)).flat(Infinity));
      });
      
    },
    addReal(parReal, term, params={}) {
      
      let { params: treeParams, layouts } = this.get(term);
      let { avails=[], prms=[] } = layouts.categorize(elem => isForm(elem, Promise) ? 'prms' : 'avails');
      
      let real = parReal.addReal(`${this.name}.${term}`, { ...params, ...treeParams }, avails);
      real.tree = this;
      prms.each(prm => prm.then(layout => real.addLayout(layout)));
      
      return real;
      
    },
    has(term) {
      
      if (term.has('.')) term = term.cut('.', 1)[1];
      return this.defs.has(term);
      
    },
    get(term) {
      
      if (term.has('.')) term = term.cut('.', 1)[1];
      if (!this.defs.has(term)) throw Error(`RealTree has no definition for "${term}"`);
      let defs = this.defs[term];
      
      let params = {};
      let layouts = defs.map(({ layoutFormName, args }) => then(this.realTech, realTech => {
        let LayoutForm = this.realTech.getLayoutForm(layoutFormName);
        return then(LayoutForm, LayoutForm => LayoutForm(...args));
      }));
      
      return { params: {}, layouts };
      
    }
    
  })});
  
};
