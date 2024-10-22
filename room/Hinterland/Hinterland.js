global.rooms['Hinterland'] = async () => {
  
  // TODO: Deploy Rooms (e.g. chess2) should not have to import `Hinterland`; Hinterland contains
  // functionality that should live in Foundation (nodejs, and htmlBrowserHabitat, and all others)
  // Habitat support should be defined in Conf, not Deploy Room code (`{ habitats: [ ... ] }`)
  // The "Hinterland" concept can essentially vanish!
  
  let { record: { Record }, Scope, Chooser } = await getRooms([ 'record', 'logic.Scope', 'logic.Chooser' ]);
  
  /// {LOADTEST=
  let { hut } = await getRooms([ 'setup.hut' ]);
  /// =LOADTEST}
  
  return form({ name: 'Hinterland', props: (forms, Form) => ({
    
    // Hinterland is the space where BelowHuts come into being, and interact; use Hinterland to
    // describe what rules an AboveHut imposes on its BelowHuts!
    // 
    // The AboveHut provided to `Hinterland(...).open({ aboveHut })` must already be appropriately
    // exposed on the network; Hinterland is unaware of any networking, it's only used to define
    // rules for Above/BelowHuts!
    // 
    // Initialize `Hinterland` with `above` and `below` logic such that:
    // - `above` describes behaviour to be executed purely Above
    // - `below` describes behaviour to apply to every BelowHut (this behaviour is tracked Above so
    //   that Above is aware of the state of each BelowHut)
    
    // Call `Hinterland(...).open({ aboveHut })` to apply the defined rules
    
    $prefixer: (pfx, term, delim='.') => term.hasHead(`${pfx}${delim}`) ? term : `${pfx}${delim}${term}`, // Note that (only) CommandHandlers use ":" as `delim` instead of "."
    $makeExperience: (prefix, hut, recMan, pfx=Form.prefixer.bound(prefix)) => ({
      
      hut,
      
      // The Loft defined by `this.above` and `this.below` should be able to omit prefixes for most
      // operations. For many operations this is handled be the "root" Record and Real which get
      // initiated by Hinterland with the Loft-specific prefix; then operations can be performed
      // using this Record and Real. The tricky part is Hut-initiated actions (actions where the
      // Object providing the method is a Hut), as Huts have no natural default-prefix - a single
      // Hut is designed to facilitate multiple Lofts at once - such actions need to be implemented
      // differently. Here is an exhaustive list of actions that can be performed without
      // specifying a prefix, and implementation:
      // +----------------------------+------------------------------------------------------------------
      // |                            | 
      // | ACTION                     | IMPLEMENTATION
      // |                            | 
      // +----------------------------+------------------------------------------------------------------
      // | addReal                    | Use `loftReal.addReal`
      // +----------------------------+------------------------------------------------------------------
      // | hut.addRecord              | - `hut.addRecord`
      // | rootRec.addRecord (?)      |   If `hut` is BelowHut, can automatically perform Follow
      // |                            |   Prefix needs to default from Members
      // |                            | - `rootRec.addRecord`
      // |                            |   No way to automatically Follow
      // |                            |   Manual Follow is UGLY: `hut.followRec(rootReal.addRecord(...))`
      // |                            |   Prefix can default from `rootRec`
      // |                            |   Parallels `real.addReal`, which is cute
      // +----------------------------+------------------------------------------------------------------
      // | hut.enableAction           | 2 Lofts may have an Action of the same name
      // |                            | Would be cool if no term was required (e.g. every action is id'd
      // |                            | simply by a uid) but this requires the uid to be negotiated by
      // |                            | Above and Below to ensure they use the same value
      // +----------------------------+------------------------------------------------------------------
      // | hut.addFormFn              | 2 Lofts may not add FormFns for the same type name
      // |                            | At the moment the idea is not to call `addFormFn` from inside the
      // |                            | `above` / `below` function - just provide a map to Hinterland!
      // +----------------------------+------------------------------------------------------------------
      // | hut.enableKeep             | c2 defines "pieces"; could conflict with another Loft's Keep!
      // | hut.getKeep                | 
      // +----------------------------+------------------------------------------------------------------
      // | rec.relHandler('term')     | Prefix defaulted from `rec.type`, so watch out for `hut.rh(...)`
      // | rec.rh('term')             | and `dep.scp(hut, ...)` - in such cases prefix defaults to "hut"!
      // +----------------------------+------------------------------------------------------------------
      // | dep.scp(rec, 'term', ...)  | Defaults same as `rec.relHandler(...)`
      // +----------------------------+------------------------------------------------------------------
      
      // Note that none of these should conflict with properties that
      // can be found on a Record!! (TODO: Why? Delete comment?)
      
      addFormFn: (term, ...args) => recMan.addFormFn(pfx(term), ...args),
      enableKeep: (term, keep) => hut.enableKeep(prefix, term, keep),
      getKeep: diveToken => hut.getKeep(prefix, diveToken),
      addRecord: (...args /* type, group, value, uid, volatile | { type, group, value, uid, volatile } */) => {
        
        // TODO: need to test everything with Collabowrite!! I NEED TO KNOW if Persona can be
        // simplified now that prefixes are removed everywhere (it could just be passed, e.g., the
        // Loft, and all prefixes would automatically fall into place!). Need to see if using
        // `recMan.addRecord` instead of `belowHut.addRecord` causes issues Following Records!
        
        // Not applying any Follows here; Below must Follow with `resolveHrecsAndFollowRecs`!!!!
        
        let params = recMan.processRecordParams(...args);
        return recMan.addRecord({ ...params, ...(isForm(params.type, String) && { type: pfx(params.type) }) });
        
      }
      
    }),
    
    $Potential: form({ name: 'Potential', props: (forms, Form) => ({
      
      // TODO: get rid of that nasty `makeExperience`; implement everything through `Potential` instead.
      // Potential should be hierarchical, e.g. a ParPotential should be able to give rise to a
      // KidPotential which has a KidReal as its `real` reference. It may even make sense for
      // Potentials to be Tmps so that a KidPotential can end under some set of circumstances.
      // Ambitiously, Scopes could be replaced with Potentials (this way anything with access to a
      // Scope has access to a Real, EnableAction, RecMan, etc. but maybe this is crazy thinking,
      // need to see how it would look when implemented??)
      init() {}
      
    })}),
    
    init({ prefix=null, habitats=[], recordForms={}, above=Function.stub, below=Function.stub, ...args }) {
      
      // Note that a Room intiating Hinterland will supply a default prefix
      // Note that a foundation running potentially multiple Rooms may override that prefix by
      // passing some other (potentially config-dependent) prefix to `Hinterland(...).open`
      
      /// {DEBUG=
      if (!habitats.count()) throw Error('Api: supply at least 1 habitat');
      if (!prefix) throw Error('Api: must supply "prefix"');
      /// =DEBUG}
      
      Object.assign(this, { prefix, habitats, recordForms, above, below });
      
      /// {LOADTEST=
      let { loadtestConf } = args;
      if (!loadtestConf) throw Error(`Api: must supply "loadtestConf" for loadtest`);
      Object.assign(this, { loadtestConf });
      /// =LOADTEST}
      
    },
    
    /// {LOADTEST=
    async setupBelowLoadtesting({ prefix=this.prefix, belowHut, loftRh, belowHooks }) {
      
      let TimerSrc = await getRoom('logic.TimerSrc');
      
      let tmp = Tmp();
      
      tmp.endWith(Scope(loftRh, belowHooks, (loft, dep) => {
        
        dep.scp(belowHut, `${prefix}.lofter`, (lofter, dep) => {
          
          this.loadtestConf.fn({ belowHut, loft, lofter, dep });
          
        });
        
      }));
      
      return tmp;
      
    },
    /// =LOADTEST}
    
    open({ sc, prefix=this.prefix, hereHut, rec=hereHut }) {
      
      // Hinterland basically sets up the Experience, and wires things up so that the
      // "above" and "below" functions of the consumer get called appropriately
      
      sc = sc.kid('loft');
      let tmp = Tmp();
      
      let recMan = rec.type.manager;
      let pfx = Form.prefixer.bound(prefix);
      
      // This `exp` is used ABOVE and BELOW (ABOVE instantiates a 2nd `exp` for each AfarBelowHut)
      let exp = Form.makeExperience(prefix, hereHut, recMan, pfx); // Can we assert `hereHut.type.manager === rec.type.manager`???
      
      // Prepare all habitats
      for (let hab of this.habitats) tmp.endWith(hab.prepare(hereHut));
      
      // Add all type -> Form mappings
      // Note values in `this.recordForms` are either functions giving
      // RecordForms, or RecordForms themselves
      for (let [ k, v ] of this.recordForms) tmp.endWith(exp.addFormFn(pfx(k), v['~Forms'] ? () => v : v));
      
      let hinterlandReal = global.real.addReal(pfx('loft'));
      tmp.endWith(hinterlandReal);
      
      let loftRh = rec.relHandler({ type: pfx('loft'), term: 'hut', offset: 0, limit: 1, fixed: true });
      tmp.endWith(loftRh);
      
      /// {DEBUG=
      let sampleSc = sc.kid('recordSample');
      if (sampleSc.params().active && sampleSc.params().ms) (async () => {
        
        let rank = rec => rec.uid.hasHead('!') ? -1 : 0;
        let rankType = (a, b) => a.type.name.localeCompare(b.type.name);
        let rankUid = (a, b) => a.uid.localeCompare(b.uid);
        
        then(
          
          getRoom('logic.TimerSrc'),
          
          TimerSrc => TimerSrc({ num: Infinity, ms: sampleSc.params().ms }).route(() => {
            
            let ts = getMs();
            let results = [ ...rec.iterateAll() ]
              .sort((a, b) => (rank(a) - rank(b)) || rankType(a, b) || rankUid(a, b));
            
            sampleSc.note({
              durationMs: getMs() - ts,
              recs: results.map(rec => ({ uid: rec.uid, type: rec.type.name, value: rec.getValue() }))
            });
            
          }),
          
          // TODO: Warning vs fatal err should depend on stability config?
          err => esc.say(err)
          
        );
          
        
      })();
      /// =DEBUG}
      
      let convertRecWithRhArgsToRh = (args, dep) => {
        
        // Allows `dep.scp` to be passed 2 arguments, a Record and a
        // RelHandler argument, and those 2 arguments will be resolved
        // to a single RelHandler (which is a Src), which is the result
        // of `rec.relHandler(relHandlerArg)`
        
        if (!hasForm(args[0], Record)) return args;
        
        // `args[0]` is a Record, `args[1]` should be RelHandler params
        let rh = args[0].relHandler(args[1]);
        
        // Note you may expect simply `dep(rh)` here, but this fails
        // for multi-ref'd RelHandlers as `dep` will ignore duplicate
        // references
        dep(() => rh.end());
        
        return [ rh, ...args.slice(2) ];
        
      };
      let resolveHrecs = (tmp, dep) => tmp.rec?.Form?.['~forms']?.has(Record) ? tmp.rec : tmp;
      let handleBelowLofter = (loftRec, belowHut, dep) => {
        
        let lofterRh = dep(belowHut.relHandler(`${prefix}.lofter`));
        let lofterExistsChooser = dep(Chooser.noneOrSome(lofterRh));
        
        dep.scp(lofterExistsChooser.srcs.off, (noPlayer, dep) => {
          
          // This Scope can get retriggered if the Foundation is ended and the previous Lofter in
          // the Chooser ends, causing `lofterExistsChooser.srcs.off` to trigger
          if (tmp.off() || lofterRh.off()) return;
          
          let makeLofterAct = belowHut.enableAction(`${prefix}:makeLofter`, () => {
            /// {ABOVE=
            // Allow multiple "makeLofter" requests - ignore if the Lofter exists already!
            if (lofterRh.hrecs.size) return;
            let lofter = recMan.addRecord(`${prefix}.lofter`, [ belowHut, loftRec ]);
            belowHut.followRec(lofter);
            /// =ABOVE}
          });
          
          /// {BELOW=
          // Below immediately requests to initialize a Lofter
          makeLofterAct.act();
          /// =BELOW}
          
        });
        dep.scp(lofterExistsChooser.srcs.onn, (player, dep) => { /* Stop strike timer? */ });
        
        return lofterRh;
        
      };
      
      /// {ABOVE=
      
      let resolveHrecsAndFollowRecs = (follower, tmp) => {
        if (hasForm(tmp, Record))      { follower.followRec(tmp);     return tmp; }
        if (hasForm(tmp?.rec, Record)) { follower.followRec(tmp.rec); return tmp.rec; }
        return tmp;
      };
      
      // Create the AppRecord identified by `<prefix>.loft`
      // TODO: I think the initial scope to get `loftRh` from `loftRec`
      // is redundant because `loftRec === mainRec`
      let loftRec = recMan.addRecord({ type: pfx('loft'), group: { hut: hereHut }, uid: `!loft@${rec.uid}` });
      tmp.endWith(loftRec);
      
      // Run Above logic once
      let aboveHooks = {
        processArgs: convertRecWithRhArgsToRh,
        frameFn: resolveHrecs
      };
      let aboveScp = Scope(Src(), aboveHooks, (_, dep) => {
        this.above({
          pfx: prefix,
          record: loftRec,
          real: hinterlandReal,
          addPreloadRooms: hereHut.addPreloadRooms.bind(hereHut),
          addCommandHandler: (command, fn) => hereHut.makeCommandHandler(pfx(command, ':'), fn),
          ...exp
        }, dep);
      });
      aboveScp.makeFrame(tmp); // Kick off single frame linked to `tmp`
      
      // Run Below logic for every BelowHut
      tmp.endWith(hereHut.ownedHutRh.route(ownedHrec => {
        
        let belowHut = ownedHrec.rec.getMember('below');
        
        let belowHooks = {
          // Enable shorthand of passing Record(...) and RelHandler args to `dep.scp`, and
          // `dep.scp` will convert it to `Record(...).relHandler(args)`
          processArgs: convertRecWithRhArgsToRh,
          
          // - Added convenience of working with Recs instead of Hrecs
          // - Added convenience of following Recs routed through any descendant Scope
          frameFn: resolveHrecsAndFollowRecs.bound(belowHut)
        };
        let belowScp = Scope(Src(), belowHooks, (_, dep) => {
          belowHut.followRec(loftRec);
          let lofterRh = handleBelowLofter(loftRec, belowHut, dep);
          
          this.below({
            pfx: prefix,
            record: loftRec,
            real: hinterlandReal,
            lofterRh: lofterRh,
            lofterRelHandler: lofterRh,
            enableAction: (term, ...args) => belowHut.enableAction(pfx(term, ':'), ...args),
            ...Form.makeExperience(prefix, belowHut, recMan, pfx) // Can't use the `exp` instance - it used `hereHut`; this case needs `belowHut`
          }, dep);
        });
        
        // If the BelowHut ends, the Scope which handles its Lofter ends too
        belowScp.makeFrame(belowHut); // Kick off single frame
        
      }));
      
      /// =ABOVE} {BELOW=
      
      // As soon as Below syncs the root Rec it's good to go
      let belowHooks = {
        processArgs: convertRecWithRhArgsToRh,
        frameFn: resolveHrecs
      };
      tmp.endWith(Scope(loftRh, belowHooks, (loftRec, dep) => {
        let lofterRh = handleBelowLofter(loftRec, hereHut, dep);
        this.below({
          pfx: prefix,
          record: loftRec,
          real: hinterlandReal,
          lofterRh: lofterRh,
          lofterRelHandler: lofterRh,
          enableAction: (term, ...args) => hereHut.enableAction(pfx(term, ':'), ...args),
          ...exp
        }, dep);
      }));
      
      /// =BELOW}
      
      /// {LOADTEST=
      
      let isBelow = isForm(hereHut, hut.BelowHut);
      if (isBelow && hereHut.isLoadtestBot) then(
        
        this.setupBelowLoadtesting({
          prefix,
          belowHut: hereHut,
          loftRh,
          belowHooks: {
            processArgs: convertRecWithRhArgsToRh,
            frameFn: resolveHrecs
          }
        }),
        
        belowLoadTestingTmp => tmp.endWith(belowLoadTestingTmp),
        
        err => err.propagate(msg => `Failed to setup load testing: ${msg}`)
        
      );
      
      
      /// =LOADTEST}
      
      return tmp;
      
    }
    
  })});
  
};
