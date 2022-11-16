global.rooms['internal.real.generic.Real'] = foundation => form({ name: 'Real', has: { Tmp }, props: (forms, Form) => ({
  
  $NavOpt: form({ name: 'NavOpt', has: { Tmp }, props: (forms, NavOptForm /* Don't clobber `Form` */) => ({
    
    // Note that navigation inherently has the capacity to refer to
    // unloaded navigable areas. This means that some acts of
    // navigation are necessarily async. This complicates determining
    // the navigation chain of some elements. When A NavOpt navigates
    // to an immediately-available Real, it's easy to set that Real's
    // NavOpt. However, when a NavOpt's activation results in the
    // invocation of an async function, the Real produced by that
    // function may not have any NavOpt set until after the async
    // function has completed. (Once the function completes, NavOpt
    // logic automatically sets the correct NavPar). For this reason
    // any realFn will be passed a NavOpt as its first parameter; this
    // can be passed to the Real resulting from the realFn, ensuring
    // that it has a full NavChain from its inception. If the client
    // chooses not to initialize the Real with the given NavOpt, the
    // Real will have a length-1 NavChain until the async function has
    // completed. Upon the realFn's completion the generated Real will
    // rerender, allowing Real implementations to adapt as quickly as
    // possible to showing the correct, full NavChain once it exists.
    
    init({ owner, term, realFn }) {
      
      forms.Tmp.init.call(this);
      
      // "Perm" Reals are shown regardless of whether their NavOpt is
      // active. Activating/deactivating the NavOpt may focus/unfocus
      // the "Perm" Real, but the Real will stick around either way.
      let real = hasForm(realFn, Form) ? realFn : null;
      if (real) {
        
        // Overwrite the directly provided Real with a Function that
        // returns that real.
        real.navPar = this;
        realFn = () => real;
        
      }
      
      Object.assign(this, { owner, term, realFn, activeTmp: null, real: null });
      
    },
    getParent() {
      let ptr = this.owner;
      while (ptr && !ptr.navPar) ptr = ptr.parent;
      return ptr && ptr.navPar;
    },
    getChain() {
      let par = this.getParent();
      return par ? [ ...par.getChain(), this ] : [ this ];
    },
    activate(mode='exclusive') {
      
      // TODO: Think about inclusive activations - that will take some
      // work, e.g. `this.activeTmp` and `this.real` need to become
      // compound values as some NavOpts may be inactive, while others
      // are active.
      
      if (![ 'inclusive', 'exclusive' ].has(mode)) throw Error(`Invalid mode "${mode}"`);
      if (mode === 'inclusive') throw Error('Not implemented');
      
      // Exclusive activations deactivate all active siblings
      if (mode === 'exclusive') {
        for (let [ term, navOpt ] of this.owner.navOpts) if (navOpt !== this && navOpt.activeTmp) navOpt.activeTmp.end();
      }
      
      if (!this.activeTmp) {
        
        let activeTmp = Tmp();
        
        this.activeTmp = activeTmp;
        activeTmp.endWith(() => this.activeTmp = null);
        
        let depFn = d => (activeTmp.endWith(d), d);
        this.real = this.realFn(this, depFn); // Note `this.realFn` may be async
        
        then(this.real, real => {
          if (activeTmp.off()) return;
          real.navPar = this;
          real.render();
          this.real = real;
        });
        
        // End all child NavOpts
        activeTmp.endWith(() => (this.owner.navOpts || []).each( navOpt => (navOpt.activeTmp || Tmp.stub).end() ));
        
      }
      
      // Once the real resolves and is rendered, inform navigation
      then(this.real, async real => then(real.renderPrm, () => real.getTech().informNavigation(this)));
      
      return this.activeTmp;
      
    },
    cleanup() { throw Error('Not implemented'); }
    
  })}),
  
  init({ name=null, parent=null, tech=null, tree=null, params={}, layouts=Set() }={}) {
    
    forms.Tmp.init.call(this);
    
    if (!tech && parent) tech = parent.tech;
    if (!tree && parent) tree = parent.tree;
    let { navPar=null, ...moreParams } = params;
    
    Object.assign(this, {
      
      name, parent, tech, tree,
      params: moreParams,
      
      layouts: Set(),
      loaded: Promise.resolve(),
      
      children: Set(),
      
      navPar,
      navOpts: null,
      
    });
    
    for (let layout of layouts) this.addLayout(layout);
    
    this.tree && this.setTree(this.tree);
    
  },
  setTree(tree=this.tree) {
    
    this.tree = tree;
    
    let ptr = this;
    let chain = [];
    
    while (ptr) {
      
      let [ ptrPfx, ptrName ] = ptr.name.cut('.', 1);
      if (ptrPfx !== (tree.pfx || tree.name)) break;
      
      chain.add(ptrName);
      ptr = ptr.parent;
      
    }
    
    chain.reverse();
    for (let chainLen of chain.length) {
      
      let key = chain.slice(-1 - chainLen).join('->');
      if (!tree.has(key)) continue;
      
      let { params, layouts } = this.tree.get(key);
      if (!params.empty()) this.mod(params);
      for (let layout of layouts) this.addLayout(layout);
      
      
    }
    
  },
  getTech() { return this.tech; },
  getLayoutForm(formName) { return this.getTech().getLayoutForm(formName); },
  * getLayouts() { for (let lay of this.layouts) yield lay; },
  getLayout(v) {
    
    // If a String was provided match the LayoutForm's name
    // Otherwise a LayoutForm was given; search for matching Form
    return this.layouts.find((isForm(v, String)) ? lay => v === getFormName(lay) : lay => hasForm(lay, v)).val;
    
  },
  
  doRender(delta) { this.getTech().render(this, delta); },
  render(delta=null) {
    
    if (this.renderPrm) return; // TODO: This could cause a critical `delta` to be ignored!!
    
    let err = Error('');
    this.renderPrm = foundation.soon().then(() => {
      this.doRender(delta);
      this.renderPrm = null;
    });
    this.renderPrm.fail( ctxErr => err.propagate({ msg: 'Failed to render', ctxErr }) );
    
  },
  mod(paramDelta={}) { this.params.gain(paramDelta); this.render({ paramDelta }); return this; },
  
  addReal(...args) {
    
    // Derive a Real instance from `args`
    let real = (() => {
      
      // If a simple Real instance was provided, attach and return it:
      if (args.length === 1 && hasForm(args[0], Form)) {
        if (real.parent && real.parent !== this) throw Error(`Real already has a parent`);
        Object.assign(real, { parent: this, tree: this.tree, tech: this.tech });
        return real;
      }
      
      // Otherwise 1st arg must be a String naming a Real
      if (!isForm(args[0], String)) throw Error(`Couldn't derive Real from given params (args[0] was of form ${getFormName(args[0])})`);
        
      // Get `name` and `pfx` separately; if no `pfx` specified, it
      // defaults to the same prefix as `this`
      let [ pfx, name ] = args[0].has('.')
        ? args[0].cut('.', 1)
        : [ this.name.cut('.', 1)[0], args[0] ];
      
      // Use the knowledge that `params` will be an Object, while
      // `layouts` will be an `Array`
      let params = args.find(v => isForm(v, Object)).val || {};
      let layouts = args.find(v => isForm(v, Array)).val || []; // Contains a mixture of Promises and immediately-available Layouts
      
      // Add `params` and all immediately-available Layouts
      let RealForm = this.Form;
      return RealForm({ name: `${pfx}.${name}`, parent: this, params, layouts });
      
    })();
    
    for (let innerLayout of this.layouts.map(l => l.isInnerLayout() ? l : C.skip)) {
      real.addLayout(innerLayout.getChildLayout());
    }
    
    this.children.add(real);
    real.endWith(() => this.children.rem(real));
    
    return real;
    
  },
  
  getNavAncestor() {
    
    // A Real's NavAncestor is either itself, if it has "navPar" set,
    // or the nearest ancestor that has "navPar" set (root Real is
    // used if no ancestor has "navPar" set):
    
    let ptr = this;
    while (ptr && !ptr.navPar && ptr.parent) ptr = ptr.parent;
    return ptr;
    
  },
  getNavChain() { let np = this.getNavAncestor().navPar; return np ? np.getChain() : []; },
  addNavOption(term, realFn) {
    
    let navAnc = this.getNavAncestor();
    if (navAnc !== this) return navAnc.addNavOption(term, realFn);
    
    if (!this.navOpts) this.navOpts = Map();
    
    if (this.navOpts.has(term)) {
      
      console.log('OVERWRITE NAV', this.getNavChain().map(n => n.term), {
        'strMatch?': this.navOpts.get(term).realFn.toString() === realFn.toString(),
        tail: this.navOpts.get(term).realFn,
        head: realFn
      });
      
      let navOpt = this.navOpts.get(term);
      if (realFn === navOpt.realFn) return;
      
      // TODO: Untested:
      // We prefer to use the newly provided `realFn`; need to
      // additionally handle any prexisting activation using the old
      // `realFn`:
      let isActive = !!navOpt.activeTmp;
      if (isActive) navOpt.activeTmp.end();
      navOpt.realFn = realFn;
      if (isActive) navOpt.activate();
      
      return;
      
    }
    
    let navOpt = Form.NavOpt({ owner: this, term, realFn });
    this.navOpts.set(term, navOpt);
    return navOpt;
    
  },
  
  cleanup() {
    // TODO: rerender upon cleanup? Some Techs may require it...
    this.parent = null;
    for (let child of this.children) child.end();
  },
  addLayout(layout) {
    
    let tmp = Tmp();
    
    // Convert from "{ form: 'LayoutFormName', ... }" to Layout(...)
    let formName = null;
    if (isForm(layout, Object)) {
      
      let { form=null, ...args } = layout;
      if (!isForm(form, String)) throw Error(`"form" property should be String (got ${getFormName(form)})`);
      formName = form;
      
      // This sequence is capable of single-tick-resolution; get the
      // LayoutForm and instantiate it. Note that LayoutForm may not
      // be immediately-available:
      let LayoutForm = this.getTech().getLayoutForm(form);
      layout = then(LayoutForm, LayoutForm => LayoutForm(args));
      
      // Keep track of whether we're loaded; resolve to a loaded state
      // once the Layout is available
      if (isForm(layout, Promise)) this.loaded = this.loaded.then(() => layout);
      
    }
    
    tmp.layout = layout;
    then(layout, layout => {
      
      if (tmp.off()) return;
      
      // Apply any child Layout to all Real children
      if (layout.isInnerLayout()) for (let child of this.children) {
        let childLayout = layout.getChildLayout(child);
        tmp.endWith(child.addLayout(childLayout));
      }
      
      tmp.endWith(layout.install(this));
      
      this.layouts.add(layout);
      this.render({ add: [ layout ] });
      tmp.endWith(() => {
        this.layouts.rem(layout);
        this.render({ rem: [ layout ] });
      });
      
    });
    return tmp;
    
  },
  addLayouts(layouts) {
    let tmp = Tmp();
    for (let layout of layouts) tmp.endWith(this.addLayout(layout));
    return tmp;
  }
  
})});
