global.rooms['logic.Scope'] = foundation => form({ name: 'Scope', has: { Tmp }, props: (forms, Form) => ({
  
  // Note that Scope must be Tmp, and not just Endable, because Deps
  // need to be cleaned up when either the current Frame ends, or the
  // Scope itself ends - this latter condition requires calling
  // `endWith` on the Scope!
  
  $createFrame: (scope, tmp) => {
    
    // A Tmp has entered into the Scope; a Frame represents the
    // lifetime of this Tmp within the Scope
    
    if (!hasForm(tmp, Tmp)) throw Error(`Scope expects Tmp - got ${getFormName(tmp)}`);
    if (tmp.off()) return;
    if (scope.off()) return;
    
    // Define `addDep` and `addDep.scp` to enable nice shorthand
    let deps = Set();
    let addDep = dep => {
      
      // Allow raw functions; wrap them in `Endable`
      if (dep instanceof Function)    dep = Endable(dep);
      else if (dep.off())             return dep; // Ignore any inactive Deps
      else if (deps && deps.has(dep)) return dep; // Ignore duplicates!
      
      // Trying to add a Dep after the Scope has ended (as detected by
      // whether `deps` has been set to `null`) immediately ends that
      // Dep and short-circuits
      if (!deps) { dep.end(); return dep; }
      
      if (dep.constructor['~forms'].has(Tmp)) {
        
        // Any dependencies which are Tmps may end before the Scope
        // causes them to end - ended Tmps no longer need to be
        // referenced by the Scope!
        let remDep = dep.route(() => {
          // Note `deps` can become `null`
          if (!deps) return;
          deps.rem(dep);
          deps.rem(remDep);
        });
        deps.add(remDep);
        
      }
      
      deps.add(dep);
      
      return dep;
      
    };
    addDep.scp = (...args /* src, fn | src, hooks, fn */) => {
      
      if (!deps) return Tmp.stub;
      
      if (scope.hooks.has('processArgs')) args = scope.hooks.processArgs(args, addDep);
      
      /// {DEBUG=
      if (hasForm(args[0], Tmp)) throw Error(`Invalid Src; it can't be ${getFormName(args[0])}`);
      /// =DEBUG}
      
      if (![ 2, 3 ].has(args.length)) throw Error(`Won't accept ${args.length} arguments`);
      
      let [ src, hooks, fn ] = (args.length === 3) ? args : [ args[0], {}, ...args.slice(1) ];
      hooks = hooks.empty() ? scope.hooks : { ...scope.hooks, ...hooks };
      
      let subScope = new scope.Form(src, hooks, fn);
      
      deps.add(subScope);
      return subScope;
      
    };
    
    // If either `tmp` or Scope ends, all existing dependencies end as
    // well (scope relationship is itself a dependency)
    let doCleanup = () => {
      
      if (!deps) return;
      let origDeps = deps;
      deps = null; // Set `deps` to `null` before ending all Deps
      
      for (let dep of origDeps) dep.end();
      
    };
    deps.add(scope.route(doCleanup));
    deps.add(tmp.route(doCleanup));
    
    if (scope.hooks.has('frameFn')) tmp = scope.hooks.frameFn(tmp, addDep);
    scope.fn(tmp, addDep);
    
  },
  
  init(...args /* src, fn | src, hooks, fn */) {
    
    /// {DEBUG=
    if (![ 2, 3 ].has(args.length)) throw Error(`Provide 2 or 3 args`);
    /// =DEBUG}
    
    let [ src, hooks, fn ] = (args.length === 3) ? args : [ args[0], {}, args[1] ];
    // Note that `hooks` enables heirarchical modifications to Scope
    // behaviour - it contains Functions that extend typical Scope
    // behaviour, and `hooks` are propagated to all subscopes!
    // - hooks.processArgs: modifies arguments passed to `dep.scp`
    //   before they are used to init the subscope
    // - hooks.frameFn: processes every Tmp received by the Scope
    
    /// {DEBUG=
    if (!hasForm(fn, Function)) throw Error(`"fn" must be a Function (got ${getFormName(fn)})`);
    if (!hasForm(src, Src)) throw Error(`"src" must be a Src (got ${getFormName(src)})`);
    if (hasForm(src, Tmp)) throw Error(`"src" should not be ${getFormName(src)}`);
    /// =DEBUG}
    
    forms.Tmp.init.call(this);
    
    Object.assign(this, { fn, hooks, frameRoute: null });
    
    // Sends from `src` are processed by `Form.createFrame`
    this.frameRoute = src.route(Form.createFrame.bind(null, this));
    
  },
  
  cleanup() { this.frameRoute.end(); }
  
})});
