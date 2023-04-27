global.rooms['Hinterland'] = async foundation => {
  
  let { record: { Record }, Scope } = await getRooms([ 'record', 'logic.Scope' ]);
  return form({ name: 'Hinterland', props: (forms, Form) => ({
    
    // Hinterland is the space in which multiple Huts interact according
    // to the rules of the AboveHut
    
    $prefixer: (pfx, term) => term.has('.') ? term : `${pfx}.${term}`,
    $makeUtils: (prefix, hut, recMan, pfx=Form.prefixer.bound(prefix)) => ({
      
      // TODO: Maybe here is the place to define the connection from
      // `netIden` to `hereHut`? I.e. that network communications to the
      // NetworkIdentity get translated to `hut`. This may be some good
      // candidate logic to define once and reference from ABOVE/BELOW.
      // If that *doesn't* make sense, maybe all Hinterlands logic needs
      // to move to `foundation` + `HtmlBrowserHabitat/init/init.js`
      
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
      
      enableAction: (term, ...args) => hut.enableAction(pfx(term), ...args),
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
        // HEEERE if this works it means there's no need for
        // `Hut(...).addRecord`!! The single "c2." in chess2 may be
        // possible to remove if the Hinterlands automatically adds a
        // Record binding a Hut to a "Lofter" - i.e. a user of a Hut,
        // and this rec establishes a way of talking about a BelowHut
        // but the prefix is automatically set!!
        
        // args ~= [ 'eg.type', [ memRec1, memRec2 ], 'val', ... ]
        if (isForm(args[0], String))
          return recMan.addRecord(pfx(args[0]), ...args.slice(1));
        
        // args ~= [{ type: 'eg.type', group: [ memRec1, memRec2 ], value: 'val', ... }, ...]
        if (isForm(args[0], Object) && args[0].has('type') && isForm(args[0].type, String))
          return recMan.addRecord({ ...args[0], type: pfx(args[0].type) }, ...args.slice(1));
        
        return recMan.addRecord(...args);
        
      }
      
    }),
    
    init({ prefix=null, habitats=[], recordForms={}, above=Function.stub, below=Function.stub }) {
      
      /// {DEBUG=
      if (!habitats.count()) throw Error(`Api: supply at least 1 habitat`);
      if (!prefix) throw Error(`Api: must supply "prefix"`);
      /// =DEBUG}
      
      Object.assign(this, { prefix, habitats, recordForms, above, below });
      
    },
    async open({ hereHut, rec=hereHut, netIden }) {
      
      let tmp = Tmp();
      tmp.endWith(netIden.runOnNetwork());
      
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
      for (let [ k, v ] of this.recordForms)
        tmp.endWith(utils.addFormFn(pfx(k), v['~Forms'] ? () => v : v));
      
      let hinterlandReal = global.real.addReal(pfx('loft'));
      tmp.endWith(hinterlandReal);
      
      let loftRh = rec.relHandler({ type: pfx('loft'), term: 'hut', offset: 0, limit: 1, fixed: true });
      tmp.endWith(loftRh);
      
      /// {DEBUG=
      let recordSampleScConf = subcon('subcon.record.sample');
      let enabled = conf('subcon.kids.record.kids.sample.output.inline');
      if (enabled) (async () => {
        
        let rank = rec => rec.uid.hasHead('!') ? -1 : 0;
        let rankType = (a, b) => a.type.name.localeCompare(b.type.name);
        let rankUid = (a, b) => a.uid.localeCompare(b.uid);
        let sc = subcon('record.sample');
        
        let TimerSrc = await getRoom('logic.TimerSrc');
        TimerSrc({ num: Infinity, ms: recordSampleScConf.ms }).route(() => {
          
          let ts = getMs();
          let results = [ ...rec.iterateAll() ]
            .sort((a, b) => (rank(a) - rank(b)) || rankType(a, b) || rankUid(a, b))
            .map(rec => `- ${rec.uid.padTail(24, ' ')} -> ${rec.type.name.padTail(24, ' ')} ${JSON.stringify(rec.getValue())}`);
          sc([
            `Sampled ${results.count()} Record(s) (took ${((getMs() - ts) / 1000).toFixed(2)}ms)`,
            ...results
          ].join('\n'))
          
        });
        
      })();
      /// =DEBUG}
      
      let rhFromRecWithRhArgs = (args, dep) => {
        
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
      
      /// {ABOVE=
      
      let resolveHrecsAndFollowRecs = (follower, tmp) => {
        
        if      (     tmp.Form?.['~forms']?.has(Record)) { follower.followRec(tmp);     return tmp; }
        else if (tmp.rec?.Form?.['~forms']?.has(Record)) { follower.followRec(tmp.rec); return tmp.rec; }
        return tmp;
        
      };
      
      // Create the AppRecord identified by `<prefix>.loft`
      // TODO: I think the initial scope to get `loftRh` from `loftRec`
      // is redundant because `loftRec === mainRec`
      let mainRec = recMan.addRecord({ type: pfx('loft'), group: { hut: hereHut }, uid: `!loft@${rec.uid}` });
      
      // Wait for the Loft to register as a HolderRec on `hereHut`
      let mainScope = Scope(loftRh, { processArgs: rhFromRecWithRhArgs, frameFn: resolveHrecs }, (loftRec, dep) => {
        
        // The AppRecord is ready; apply `this.above`
        this.above(hereHut, loftRec, hinterlandReal, utils, dep);
        
        // Now KidHuts may access the AppRecord via the Hinterland; use
        // the default (0, Infinity, {}) relHandler - otherwise some
        // KidHut beyond the first N would never get processed!
        dep.scp(hereHut.ownedHutRh, (owned, dep) => {
          
          // `owned` has { par, kid }; "par" and "kid" are both Huts
          let kidHut = owned.getMember('below');
          
          // Records throughout `scp` get followed by `kidHut`
          dep.scp(loftRh, { frameFn: resolveHrecsAndFollowRecs.bind(null, kidHut) }, (loftRec, dep) => {
            let utils = Form.makeUtils(this.prefix, kidHut, recMan, pfx);
            this.below(kidHut, loftRec, hinterlandReal, utils, dep);
          });
          
        });
        
      });
      tmp.endWith(mainScope);
      
      /// =ABOVE} {BELOW=
      
      // As soon as Below syncs the root Rec it's good to go
      let kidScope = Scope(loftRh, { processArgs: rhFromRecWithRhArgs, frameFn: resolveHrecs }, (loftRec, dep) => {
        this.below(hereHut, loftRec, hinterlandReal, utils, dep);
      });
      tmp.endWith(kidScope);
      
      /// =BELOW}
      
      return tmp;
      
    }
    
  })});
  
};
