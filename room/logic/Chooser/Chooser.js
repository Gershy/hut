global.rooms['logic.Chooser'] = async foundation => {
  
  let MemSrc = await foundation.getRoom('logic.MemSrc');
  
  return form({ name: 'Chooser', has: { Endable, Src }, props: forms => ({
    
    // From a fixed list of categories, allow arbitrary logic to modify
    // which category is considered "active" at a given moment. Only a
    // single category may be "active" at once.
    
    init(names=[], src=null) {
      
      forms.Endable.init.call(this);
      forms.Src.init.call(this);
      
      // Providing a Src as the first argument sets the Chooser to have
      // exactly two options (named "off" and "onn"), which control
      // whether a Tmp is emitted by Src (when "onn") or whether the Tmp
      // gets ended (when "off")
      if (src === null && hasForm(names, Src)) [ src, names ] = [ names, [ 'off', 'onn' ] ];
      if (!isForm(names, Array)) throw Error(`${getFormName(this)} names must be an Array`);
      if (names.length < 2) throw Error(`${getFormName(this)} requires at least 2 options`);
      
      this.srcs = names.toObj(n => [ n, MemSrc.Tmp1() ]);
      this.activeSrcName = names[0];
      this.srcs[this.activeSrcName].mod(Tmp({ '~chooserInternal': true }));
      
      if (src) {
        
        if (!src.srcFlags.tmpsOnly) throw Error(`Provided ${getFormName(src)} doesn't only send Tmps`);
        if (names.length !== 2) throw Error(`${getFormName(this)} requires exactly 2 names when used with a Src; got [${names.join(', ')}]`);
        if (names.find(name => !isForm(name, String)).found) throw Error(`${getFormName(this)} names must be Strings`);
        let [ nOff, nOnn ] = names;
        if (nOff === nOnn) throw Error(`${getFormName(this)} must have two different names`);
        
        this.srcRouteDeps = Set();
        this.srcRoute = src.route(tmp => {
          
          if (tmp.off()) return;
          
          // Consider `Chooser(src); src.send(Tmp()); src.send(Tmp());`.
          // In this situation a 2nd Tmp is sent before the 1st one
          // expires. This means that `this.activeSrcName` will not
          // toggle to "off", but rather remain the same, for the
          // upcoming call `this.choose(nOnn, tmp)`. But because
          // `Chooser.prototype.choose` ignores any duplicate choices,
          // the newly retained Tmp will be completely ignored, and
          // never be produced external to the Chooser. For this reason
          // if we're already in an "onn" state and we are routed
          // another Tmp we first toggle to "off" before choosing "onn"
          // once again - this allows any cleanup which may be defined
          // under `chooser.srcs.off` to run for the previous value, and
          // then for the next value to be immediately installed
          if (this.activeSrcName === nOnn) {
            
            // Ignore duplicate values
            if (this.srcs[this.activeSrcName].val === tmp) return;
            
            // Toggle off so that this new value can retrigger onn
            this.choose(nOff);
            
          }
          
          this.choose(nOnn, tmp);
          
          // Choose the "off" option if the Tmp ends. Stop waiting for
          // this to happen if the Chooser itself ends first. Release
          // the reference to the Route if the Tmp ends first.
          let endRoute = tmp.route(() => { this.srcRouteDeps.rem(endRoute); this.choose(nOff); });
          this.srcRouteDeps.add(endRoute);
          
        });
        
      }
      
    },
    newRoute(fn) { if (this.onn()) fn(this.activeSrcName); },
    maybeEndTmp(srcName) {
      
      // TODO: The "~chooserInternal" check is bespoke and ugly - the
      // fact that this paradigm was made necessary probably indicates
      // that the Chooser Form as a whole is overloaded.
      srcName && this.srcs[srcName].val && this.srcs[srcName].val['~chooserInternal'] && this.srcs[srcName].val.end();
      
    },
    choose(name, tmp=null) {
      
      if (!this.srcs.has(name)) throw Error(`Invalid choice name: "${name}"`);
      
      // Prevent duplicate choices from producing multiple sends. If
      // this isn't a duplicate send, immediately set the newly active
      // name, to "lock the door behind us".
      if (name === this.activeSrcName) return;
      let prevSrcName = this.activeSrcName;
      this.activeSrcName = name;
      
      // End any previous Src val
      // Note that if `val` is ended externally, the `MemSrc.Tmp1` that
      // stored it may have already set its own `val` to `null`. If this
      // is the case, the `MemSrc.Tmp1` is already taken care of ending
      // `val`, so all is good - we just need to check for nullness
      this.maybeEndTmp(prevSrcName);
      
      // Send new val to newly chosen Src
      if (this.activeSrcName) {
        
        // If the Chooser creates its own Tmp, it also takes ownership
        // of it - this means Choosers have responsibility for some Tmps
        // and not for others. Ownership is determined by the existence
        // of a "~chooserInternal" property set on the Tmp.
        if (tmp === null) tmp = Tmp({ '~chooserInternal': true });
        this.srcs[this.activeSrcName].mod(tmp);
        
      }
      
      // The Chooser itself also sends the currently active name
      this.send(this.activeSrcName);
    },
    cleanup() {
      
      for (let [ name, tmp1 ] of this.srcs) tmp1.end();
      
      this.maybeEndTmp(this.activeSrcName);
      if (this.srcRoute) {
        this.srcRoute.end();
        for (let dep of this.srcRouteDeps) dep.end();
      }
      
    }
    
  })});
  
};
