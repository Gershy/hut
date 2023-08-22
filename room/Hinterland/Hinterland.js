global.rooms['Hinterland'] = async () => {
  
  let { record: { Record }, Scope, Chooser } = await getRooms([ 'record', 'logic.Scope', 'logic.Chooser' ]);
  
  /// {LOADTEST=
  let { hut } = await getRooms([ 'setup.hut' ]);
  /// =LOADTEST}
  
  return form({ name: 'Hinterland', props: (forms, Form) => ({
    
    // Hinterland is the space in which multiple Huts interact according
    // to the rules of the AboveHut
    
    $prefixer: (pfx, term) => term.has('.') ? term : `${pfx}.${term}`,
    $makeUtils: (prefix, hut, recMan, pfx=Form.prefixer.bound(prefix)) => ({
      
      // The Loft defined by `this.above` and `this.below` should be
      // able to omit prefixes for almost all operations. For many
      // operations this is handled be the "root" Record and Real which
      // get initiated by Hinterland with the Loft-specific prefix; then
      // operations can be performed using this Record and Real. The
      // tricky part is Hut-initiated actions (actions where the Object
      // providing the method is a Hut); this is because Huts have no
      // natural default-prefix; a single Hut is designed to facilitate
      // multiple Lofts at once - such actions need to be implemented
      // differently. Here is an exhaustive list of actions that can be
      // performed without specifying a prefix, and implementation:
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
      // |                            | 
      // +----------------------------+------------------------------------------------------------------
      
      // Note that none of these should conflict with properties that
      // can be found on a Record!!
      
      addFormFn: (term, ...args) => recMan.addFormFn(pfx(term), ...args),
      enableKeep: (term, keep) => hut.enableKeep(pfx(term), keep),
      getKeep: (diveToken) => {
        let pcs = token.dive(diveToken);
        let pfxDiveToken = [ '', pfx(pcs[0]), ...pcs.slice(1) ].join('/');
        return hut.getKeep(pfxDiveToken);
      },
      addRecord: (...args /* type, group, value, uid, volatile | { type, group, value, uid, volatile } */) => {
        
        // HEEERE need to test everything with Collabowrite!! I NEED TO
        // KNOW if Persona can be simplified now that prefixes are
        // removed everywhere (it could just be passed, e.g., the Loft,
        // and all prefixes would automatically fall into place!). Need
        // to see if using `recMan.addRecord` instead of
        // `belowHut.addRecord` causes issues with Records getting
        // followed!!!
        
        // Not applying any Follows here!! So Below can only follow
        // stuff via `resolveHrecsAndFollowRecs`!!!!
        
        // args ~= [ 'eg.type', [ memRec1, memRec2 ], 'val', ... ]
        if (isForm(args[0], String))
          return recMan.addRecord(pfx(args[0]), ...args.slice(1));
        
        // args ~= [{ type: 'eg.type', group: [ memRec1, memRec2 ], value: 'val', ... }, ...]
        if (isForm(args[0], Object) && args[0].has('type') && isForm(args[0].type, String))
          return recMan.addRecord({ ...args[0], type: pfx(args[0].type) }, ...args.slice(1));
        
        return recMan.addRecord(...args);
        
      }
      
    }),
    
    init({ prefix=null, habitats=[], recordForms={}, above=Function.stub, below=Function.stub, ...args }) {
      
      /// {DEBUG=
      if (!habitats.count()) throw Error(`Api: supply at least 1 habitat`);
      if (!prefix) throw Error(`Api: must supply "prefix"`);
      /// =DEBUG}
      
      Object.assign(this, { prefix, habitats, recordForms, above, below });
      
      /// {LOADTEST=
      let { loadtestConf } = args;
      if (!loadtestConf) throw Error(`Api: must supply "loadtestConf" for loadtest`);
      Object.assign(this, { loadtestConf });
      /// =LOADTEST}
      
    },
    
    /// {LOADTEST=
    async setupBelowLoadtesting({ belowHut, loftRh, belowHooks }) {
      
      let TimerSrc = await getRoom('logic.TimerSrc');
      
      let tmp = Tmp();
      
      tmp.endWith(Scope(loftRh, belowHooks, (loft, dep) => {
        
        dep.scp(belowHut, `${this.prefix}.lofter`, (lofter, dep) => {
          
          this.loadtestConf.fn({ belowHut, loft, lofter, dep });
          
        });
        
      }));
      
      return tmp;
      
    },
    /// =LOADTEST}
    
    async open({ sc, hereHut, rec=hereHut }) {
      
      let tmp = Tmp();
      
      let recMan = rec.type.manager;
      let pfx = Form.prefixer.bound(this.prefix);
      
      // This "utils" will get used both ABOVE and BELOW (note ABOVE
      // needs to instantiate a 2nd "utils" for each AfarBelowHut)
      let utils = Form.makeUtils(this.prefix, hereHut, recMan, pfx);
      
      // Prepare all habitats
      await Promise.all(this.habitats.map( async hab => tmp.endWith(await hab.prepare(hereHut)) ));
      
      // Add all type -> Form mappings
      // Note values in `this.recordForms` are either functions giving
      // RecordForms, or RecordForms themselves
      for (let [ k, v ] of this.recordForms) tmp.endWith(utils.addFormFn(pfx(k), v['~Forms'] ? () => v : v));
      
      let hinterlandReal = global.real.addReal(pfx('loft'));
      tmp.endWith(hinterlandReal);
      
      let loftRh = rec.relHandler({ type: pfx('loft'), term: 'hut', offset: 0, limit: 1, fixed: true });
      tmp.endWith(loftRh);
      
      /// {DEBUG=
      let sampleSc = sc.kid('recordSample');
      if (sampleSc.params().chatter && sampleSc.params().ms) (async () => {
        
        let rank = rec => rec.uid.hasHead('!') ? -1 : 0;
        let rankType = (a, b) => a.type.name.localeCompare(b.type.name);
        let rankUid = (a, b) => a.uid.localeCompare(b.uid);
        
        let TimerSrc = await getRoom('logic.TimerSrc');
        TimerSrc({ num: Infinity, ms: sampleSc.params().ms }).route(() => {
          
          let ts = getMs();
          let results = [ ...rec.iterateAll() ]
            .sort((a, b) => (rank(a) - rank(b)) || rankType(a, b) || rankUid(a, b))
            .map(rec => `- ${rec.uid.padTail(24, ' ')} -> ${rec.type.name.padTail(24, ' ')} ${JSON.stringify(rec.getValue())}`);
          
          sampleSc([
            `Sampled ${results.count()} Record(s) (took ${((getMs() - ts) / 1000).toFixed(2)}ms)`,
            ...results
          ].join('\n'));
          
        });
        
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
        
        let lofterRh = dep(belowHut.relHandler(`${this.prefix}.lofter`));
        let lofterExistsChooser = dep(Chooser(lofterRh));
        dep.scp(lofterExistsChooser.srcs.off, (noPlayer, dep) => {
          
          // This Scope can get retriggered if the Foundation is ended and the previous Lofter in
          // the Chooser ends, causing `lofterExistsChooser.srcs.off` to trigger
          if (tmp.off() || lofterRh.off()) return;
          
          let makeLofterAct = belowHut.enableAction(`${this.prefix}.makeLofter`, () => {
            /// {ABOVE=
            // Allow multiple "makeLofter" requests - ignore if the Lofter exists already!
            if (lofterRh.hrecs.size) return;
            let lofter = recMan.addRecord(`${this.prefix}.lofter`, [ belowHut, loftRec ]);
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
          record: loftRec,
          real: hinterlandReal,
          addPreloadRooms: hereHut.addPreloadRooms.bind(hereHut),
          ...utils
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
            record: loftRec,
            real: hinterlandReal,
            lofterRh: lofterRh,
            lofterRelHandler: lofterRh,
            enableAction: (term, ...args) => belowHut.enableAction(pfx(term), ...args),
            ...Form.makeUtils(this.prefix, belowHut, recMan, pfx)
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
          record: loftRec,
          real: hinterlandReal,
          lofterRh: lofterRh,
          lofterRelHandler: lofterRh,
          enableAction: (term, ...args) => hereHut.enableAction(pfx(term), ...args),
          ...utils
        }, dep);
      }));
      
      /// =BELOW}
      
      /// {LOADTEST=
      
      let isBelow = isForm(hereHut, hut.BelowHut);
      if (isBelow && hereHut.isLoadtestBot) tmp.endWith(await this.setupBelowLoadtesting({
        belowHut: hereHut,
        loftRh,
        belowHooks: {
          processArgs: convertRecWithRhArgsToRh,
          frameFn: resolveHrecs
        }
      }));
      
      /// =LOADTEST}
      
      return tmp;
      
    }
    
  })});
  
};
