global.rooms['reality.real.Real'] = () => form({ name: 'Real', has: { Tmp }, props: (forms, Real) => ({
  
  // REAL FACETS: x, y, z, w, h, content
  
  init({ prefix=null, name, par=null, tech, tree=null, params={}, layouts=[], node=null }={}) {
    
    if (!tech) throw Error(`Api: "tech" is required`);
    
    forms.Tmp.init.call(this);
    Object.assign(this, {
      tech, par, tree,
      prefix, name,
      params,
      layoutTmps: Set(/* Tmp({ layout }) */),
      kids: Set(),
      /// {DEBUG=
      heldFacets: Object.plain({ /* term -> Layout (the one holding the facet) */ }),
      /// =DEBUG}
      node
    });
    if (!node) tech.makeNode(this);
    
    for (let layout of layouts) this.addLayout(layout);
    
  },
  desc() { return `${getFormName(this)}(${this.prefix}.${this.name})`; },
  
  mod(delta) {
    this.params.merge(delta);
    this.render(); // TODO: Pass some kind of delta? (This case is tricky to optimize...)
    return this;
  },
  addReal(givenName, ...args /* ... [ ... layouts ... ] ... { ... params ... } ...  */) {
    
    let [ prefix, name ] = givenName.has('.') ? givenName.cut('.') : [ this.prefix, givenName ];
    let rawParams = args.find(v => isForm(v, Object)).val ?? {};
    let layouts = args.find(v => isForm(v, Array)).val ?? [];
    
    // Params with capital 1st letters represent Layouts
    let { params={}, layoutParams={} } = rawParams.categorize((v, k) => {
      return (k[0].lower() === k[0]) ? 'params' : 'layoutParams';
    });
    
    if (!layoutParams.empty()) layouts = [ ...layouts, ...layoutParams.toArr((args, form) => ({ form, ...args })) ];
    
    let kid = Real({ par: this, tech: this.tech, prefix, name, params, layouts });
    kid.tree = this.tree?.kidTree(kid) ?? null;
    
    // Added new Kid; catch it up on immediately-available Layouts (any
    // pending Layouts will be applied in `then` / `rsv` in `addLayout`
    // Note any unresolved Layouts have already queued the task of
    // applying their child Layouts to all Kids at resolution time; this
    // includes this `kid` if appropriate (if it hasn't been removed yet
    // at that time). If we used `then` and applied unresolved Layouts
    // here we'd have collisions adding Layouts to KidReals:
    // - Once inside `addReal`, when the pending Layout resolves
    // - Once inside `addLayout`, when the pending Layout resolves
    // Only one region can queue the application of pending Layouts!
    for (let tmp of this.layoutTmps)
      if (tmp.layout.constructor !== Promise.Native) // Exclude Promises
        for (let kidLay of tmp.layout.getKidLayouts())
          tmp.endWith(kid.addLayout(kidLay));
    
    this.kids.add(kid);
    kid.endWith(() => this.kids.rem(kid));
    
    return kid;
    
  },
  addLayout(layout, args=null) {
    
    /// {DEBUG=
    let trace = Error('trace');
    /// =DEBUG}
    
    // Allow:
    //    | myReal.addLayout('Geom', { w: '20px', h: '50px' });
    if (isForm(layout, String)) layout = { form: layout, ...args };
    
    // Convert from `{ form: 'LayForm', ...args }` -> `LayForm(args)`
    let formName = null;
    if (layout?.constructor === Object) {
      
      let { form, ...args } = layout;
      if (form?.constructor !== String) throw Error(`Api: "form" must be String; got ${getFormName(form)}`);
      formName = form;
      
      // This sequence is capable of single-tick-resolution; get the
      // LayoutForm and instantiate it. Note that LayoutForm may not
      // be immediately-available:
      let LayoutForm = getRoom(`reality.layout.${form}`);
      layout = then(LayoutForm, Lay => {
        let layout = Lay(args);
        /// {DEBUG=
        layout.trace = trace;
        /// =DEBUG}
        return layout;
      });
      
    } else {
      
      /// {DEBUG=
      if (!hasForm(layout, Real.Layout)) throw Error(`Api: provided value isn't interperable as a Layout: ${getFormName(layout)}`).mod({ layout });
      /// =DEBUG}
      formName = getFormName(layout);
      
    }
    
    let tmp = Tmp({ layout, layoutTech: this.tech.getLayoutTech(formName) });
    then(tmp.layoutTech, t => tmp.layoutTech = t);
    
    this.layoutTmps.add(tmp);
    tmp.endWith(() => this.layoutTmps.rem(tmp));
    
    let err = Error('hi');
    let rsv = layout => {
      
      tmp.layout = layout;
      
      // If the Layout was removed while loading, avoid ever applying it
      if (tmp.off()) return;
      
      // TODO: May be able to pass some delta (change in layouts) to
      // make renders more efficient
      let installTmp = layout.techInstall(this, tmp);
      layout.techRender(this, tmp);
      tmp.endWith(() => { installTmp.end(); this.render(); }); // De-rendering the Layout is ugly; we basically fully reset and then render every Layout *except* the removed one (**barf**)
      
      // See comment when adding KidLayouts in `addReal`
      for (let kidLay of layout.getKidLayouts())
        for (let kid of this.kids)
          tmp.endWith(kid.addLayout(kidLay));
      
    };
    let rjc = err => (tmp.end(), err.propagate());
    then(layout, rsv, rjc);
    
    return tmp;
    
  },
  render(someKindOfDelta) {
    
    this.tech.reset(this);
    
    for (let tmp of this.layoutTmps)
      if (tmp.layout.constructor !== Promise.Native)
        tmp.layout.techRender(this, tmp);
    
    if (this.off()) this.tech.killInteractivity(this);
    
  },
  
  cleanup() {
    let { endDelayMs=0 } = this.params;
    if (!endDelayMs) this.par.tech.dropNode(this);
    else             setTimeout(() => this.par.tech.dropNode(this), endDelayMs);
  },
  
  $Tree: form({ name: 'Tree', props: (forms, Tree) => ({
    init({}={}) { Object.assign(this, {}); },
    kidTree(real) { return this; }
  })}),
  $Layout: form({ name: 'Layout', props: (forms, Layout) => ({
    
    init() {},
    desc() { return `${getFormName(this)}(${formatAnyValue({ ...this })})`; },
    getParam(real, term=null) {
      /// {DEBUG=
      if (!term) throw Error(`Unexpected params (need to pass a Real as first param to Layout.prototype.getParam)`);
      /// =DEBUG}
      if (isForm(term, String)) term = term.split('.');
      let [ ptr0, ptr1 ] = [ real.params, this ];
      for (let t of term) { ptr0 = ptr0?.[t]; ptr1 = ptr1?.[t]; }
      return ptr0 ?? ptr1 ?? null; // Real(...).params takes precedence
    },
    holdFacet(real, facet) {
      let tmp = Tmp.stub;
      /// {DEBUG=
      let holder = real.heldFacets[facet];
      if (holder) {
        
        if (holder === this)
          throw Error(`Api: same Layout held same Face on same Real multiple times`)
            .mod({ real: real.desc(), layout: this.desc(), facet });
        
        throw Error(`Api: facet collision`).mod({
          facet,
          real: real.desc(),
          cause: [ holder.trace, this.trace ],
          holder0: holder.desc(),
          holder1: this.desc()
        });
        
      }
      real.heldFacets[facet] = this;
      tmp = Tmp(() => delete real.heldFacets[facet]);
      /// =DEBUG}
      return tmp;
    },
    getKidLayouts() { return []; },
    install(real) { return Tmp(); }, // Return a real Tmp - not a stub! It will be used for layoutTech cleanup
    techInstall(real, layTmp) {
      let cleanupTmp = this.install(real);
      then(layTmp.layoutTech, t => t.install(real, this, cleanupTmp)); // Note the LayoutTech's "install" method shouldn't initiate its own Tmp - it should use the provided Tmp to define cleanup!
      return cleanupTmp;
    },
    techRender(real, layTmp) {
      then(layTmp.layoutTech, t => t.render(real, this));
    }
    
  })})
  
})});
