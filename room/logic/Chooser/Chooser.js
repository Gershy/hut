global.rooms['logic.Chooser'] = async () => {
  
  let MemSrc = await getRoom('logic.MemSrc');
  
  return form({ name: 'Chooser', has: { Endable }, props: (forms, Chooser) => ({
    
    // Maintains a number of MemSrcs; at most a single MemSrc has a value at any given time (all
    // others will have their value sent to `skip`, so they won't Send). The active MemSrc is
    // determined by the `src` param passed to `init`; this Src is expected to Send strings, and
    // the string names the MemSrc to be made active
    
    $noneOrSome: (src) => {
      
      // Note that if `src` sends multiple Tmps without ending previous ones, the "choice" for each
      // previous one will be "cleared" at the level of the Chooser (the associated MemSrc will
      // have `MemSrc(...).clear()` called), but the previous Tmp may or may not end - this is
      // completely at the discretion of the consumer!
      
      /// {DEBUG=
      if (!src) throw Error('Api: missing "src"');
      if (!src.srcFlags.tmpsOnly) throw Error('Api: src must have "tmpsOnly" flag set true').mod({ src });
      /// =DEBUG}
      
      let chooser = Chooser();
      chooser.memSrcs.onn = MemSrc(skip);
      chooser.memSrcs.off = MemSrc(skip);
      chooser.choose('off');
      
      let seenTmps = Set();
      let srcRoute = src.route(tmp => {
        
        // Ended Tmps don't count (TODO: necessary?? Maybe this kind of thing should be in SANITY
        // tags, which get compiled out for lower-stability Hut configuration)
        if (tmp.off()) return;
        
        chooser.choose('onn', tmp);
        
        let tmpEndRoute = tmp.endWith(() => {
          if (chooser.activeVal === tmp) chooser.choose('off');
          seenTmps.rem(tmpEndRoute);
        }, 'tmp');
        
        seenTmps.add(tmpEndRoute);
        
      });
      
      let origCleanup = chooser.cleanup;
      C.def(chooser, 'cleanup', function() {
        origCleanup.call(this);
        if (this === chooser) for (let tmp of seenTmps) tmp.end();
      });
      
      return chooser;
      
    },
    
    init() {
      
      forms.Endable.init.call(this);
      
      Object.assign(this, {
        memSrcs: {},
        activeSrcName: null,
        activeVal: Tmp.stub,
        activeValIsOwnedTmp: true
      });
      
      // TODO: Remove! Pure backwards compatibility; a lot of code is saying e.g.
      // `lofterExistsChooser.srcs.off` instead of `lofterExistsChooser.src('off')`, but this will
      // be the approach temporarily
      this.srcs = this.memSrcs;
      
    },
    src(name) {
      
      /// {DEBUG=
      if (!name) throw Error('Api: missing or empty "name"');
      if (!isForm(name, String)) throw Error('Api: names must be String').mod({ name });
      /// =DEBUG}
      
      return this.memSrcs.at(name) ?? (this.memSrcs[name] = MemSrc());
      
    },
    choose(name, val=null) {
      
      // Note this is totally agnostic of whether `val` is a `Tmp` - if `val` is a `Tmp` and it
      // Ends somehow, Chooser will still maintain the ended Tmp inside the MemSrc, and this means
      // any additional Routes added to that MemSrc will be Sent the ended Tmp!
      
      /// {DEBUG=
      if (name !== null && !isForm(name, String)) throw Error('Api: "name" must be String').mod({ name });
      if (name !== null && !name) throw Error('Api: "name" may not be empty String').mod({ name });
      if (name === null && val !== null) throw Error('Api: if "name" is null "val" must be null too').mod({ name, val });
      /// =DEBUG}
      
      // If `name` is `null` the active Src is ended and no new one is activated
      
      // Debounce - can avoid the same MemSrc being cleared and reactivated
      if (name === this.activeSrcName && val === this.activeVal) return;
      
      // Deactive any active MemSrc
      if (this.activeSrcName) {
        this.memSrcs[this.activeSrcName].clear();
        this.activeSrcName = null;
        if (this.activeValIsOwnedTmp) this.activeVal.end();
      }
      
      // Now we're switching to a state indicated by `name`...
      this.activeSrcName = name;
      
      // Activate the next MemSrc, if `name` wasn't `null`
      if (name !== null) {
        if (val === null) { val = Tmp(); this.activeValIsOwnedTmp = true; }
        this.activeVal = val;
        this.src(name).send(val);
      }
      
    },
    cleanup() { this.choose(null); }
    
  })});
  
};
