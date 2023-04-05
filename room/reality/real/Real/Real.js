global.rooms['reality.real.Real'] = () => form({ name: 'Real', has: { Tmp }, props: (forms, Form) => ({
  
  init({ pfx=null, name, par=null, tech, tree=null, params={}, layouts=[] }={}) {
    
    forms.Tmp.init.call(this);
    Object.assign(this, { pfx, name, par, tech, tree, params, layouts: Set(layouts), kids: Set() });
    
  },
  addReal(givenName, ...args) {
    
    let [ pfx, name ] = givenName.has('.') ? givenName.cut('.') : [ this.pfx, givenName ];
    let params = args.find(v => isForm(v, Object)).val ?? {};
    let layouts = args.find(v => isForm(v, Array)).val ?? [];
    let kid = Form({ pfx, name, par: this, tech: this.tech, params, layouts });
    kid.tree = this.tree?.kidTree(kid) ?? null;
    
    for (let layout of this.layouts) then(layout, parLayout => {
      for (let kidLayout of parLayout.getKidLayouts()) kid.addLayout(kidLayout);
    });
    
    this.kids.add(kid);
    kid.endWith(() => this.kids.rem(kid));
    
    return kid;
    
  },
  
  $Tree: form({ name: 'Tree', props: (forms, Form) => ({
    init({}={}) { Object.assign(this, {}); },
    kidTree(real) { return this; }
  })})
  
})});
