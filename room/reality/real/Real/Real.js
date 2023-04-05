global.rooms['reality.real.Real'] = () => form({ name: 'Real', has: { Tmp }, props: (forms, Form) => ({
  
  $applyKidLayout: (par, kid, appliedLayout) => {
    
    // Run when a new Kid is added (need to catch up on pre-existing
    // Layouts which apply KidLayouts) AND when a new Layout is added
    // (needs to apply to all pre-existing Kids) (this is a "twist")
    
    then(appliedLayout.layout, parLayout => {
      
      // If the Layout was removed before it could load avoid ever
      // applying any of its KidLayouts
      if (appliedLayout.off()) return;
      
      // Once the Par's Layout resolves apply all its KidLayouts to the
      // Kid, and make sure to remove them when the ParLayout ends!
      for (let kidLayout of parLayout.getKidLayouts())
        appliedLayout.endWith(kidLayout.addLayout(kidLayout));
      
    });
    
  },
  
  init({ pfx=null, name, par=null, tech, tree=null, params={}, layouts=[] }={}) {
    
    forms.Tmp.init.call(this);
    Object.assign(this, {
      tech, par, tree,
      pfx, name,
      params,
      appliedLayouts: Set(),
      kids: Set(),
      governing: Object.plain({ /* governTerm -> Layout (the one doing the governing) */ })
    });
    
    for (let layout of layouts) this.addLayout(layout);
    
  },
  addReal(givenName, ...args /* ... [ ... layouts ... ] ... { ... params ... } ...  */) {
    
    let [ pfx, name ] = givenName.has('.') ? givenName.cut('.') : [ this.pfx, givenName ];
    let params = args.find(v => isForm(v, Object)).val ?? {};
    let layouts = args.find(v => isForm(v, Array)).val ?? [];
    
    let kid = Form({ par: this, tech: this.tech, pfx, name, params, layouts });
    kid.tree = this.tree?.kidTree(kid) ?? null;
    
    // Added new Kid; catch it up on Layouts
    for (let layTmp of this.appliedLayouts) Form.applyKidLayout(this, kid, layTmp);
    
    this.kids.add(kid);
    kid.endWith(() => this.kids.rem(kid));
    
    return kid;
    
  },
  addLayout(layout) {
    
    if (isForm(layout, Object)) { // Convert from `{ form: 'LayoutForm', ...args }` -> `LayoutForm(args)`
      
      let { form, ...args } = layout;
      if (form?.constructor !== String) throw Error(`Api: "form" must be String; got ${getFormName(form)}`);
      
      // This sequence is capable of single-tick-resolution; get the
      // LayoutForm and instantiate it. Note that LayoutForm may not
      // be immediately-available:
      let LayoutForm = getRoom(`reality.layout.${form}`);
      layout = then(LayoutForm, Lay => Lay(args)); // Either Promise<Layout(...)> or Layout(...)
      
    }
    
    let tmp = Tmp({ layout });
    this.appliedLayouts.add(tmp);
    tmp.endWith(() => this.appliedLayouts.rem(tmp));
    
    let rsv = layout => {
      
      tmp.layout = layout;
      
      // If the Layout was removed while loading, avoid ever applying it
      if (tmp.off()) return;
      
      // Added new Layout; catch it up on Kids
      for (let kid of this.kids) Form.applyKidLayout(this, kid, tmp);
      
      // TODO: May be able to pass some delta (change in layouts) to
      // make renders more efficient
      let installTmp = layout.install(this);
      this.render();
      tmp.endWith(() => {
        installTmp.end();
        this.render();
      });
      
    };
    let rjc = err => (tmp.end(), err.propagate());
    then(layout, rsv, rjc);
    
    return tmp;
    
  },
  
  $Tree: form({ name: 'Tree', props: (forms, Form) => ({
    init({}={}) { Object.assign(this, {}); },
    kidTree(real) { return this; }
  })})
  
})});
