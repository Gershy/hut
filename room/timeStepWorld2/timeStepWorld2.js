global.rooms['timeStepWorld2'] = async foundation => {
  
  let { MemSrc, TimerSrc, record: { Record: Rec } } = await foundation.getRooms([
    'logic.MemSrc',
    'logic.TimerSrc',
    'record'
  ]);
  
  let TimeStepper = form({ name: 'TimeStepper', props: (forms, Form) => ({
    
    init: function({ fps=60, fn }) {
      
      this.fps = fps;
      this.mspf = 1000 / this.fps;
      this.inputs = [];
      this.undos = [];
      
      this.unsteppedInputs = [];
      this.steppedMs = 0;
      this.inputState = {};
      
      this.fn = fn;
      this.timeout = null;
      this.onInputFn = () => {};
      
    },
    addInput: function(uid, ms, val) {
      
      // Expect ordered inputs (TODO: not necessary but they will be)
      if (this.inputs.length && ms < this.inputs.slice(-1)[0].ms) throw Error(`Inputs out of temporal order`);
      
      if (this.steppedMs > ms) this.replay(ms, { uid, ms, val });
      
      this.inputs.push({ uid, ms, val });
      this.unsteppedInputs.push({ uid, ms, val });
      
      this.onInputFn(); // Immediately update from `steppedMs` -> `ms`
      
    },
    getInputAtMs: function(ms) {
      
      return this.inputState;
      
    },
    replay: function(overstepMs, inp) {
      
      // Rewind to a time before `overstepMs` occurred, then fast-forward
      // back to the current value of `this.steppedMs`. This means the
      // stepped time will remain the same while outcomes resulting from
      // the "error" (overstepped input) will now come into play
      
      if (!this.undos.length) return;
      
      let t = foundation.getMs();
      
      console.log(this.steppedMs - overstepMs);
      console.log(`\nREPLAY ${(this.steppedMs - overstepMs).toFixed(2)}ms (Stepped to ${this.steppedMs.toFixed(2)}; overshot ${inp.ms.toFixed(2)})`, inp);
      
      let undoInd = this.undos.length - 1;
      while (undoInd && this.undos[undoInd - 1].tailMs >= overstepMs) undoInd--;
      
      let undosToApply = this.undos.slice(undoInd);
      this.undos = this.undos.slice(0, undoInd);
      
      console.log(`  Applying ${undosToApply.length} undos`);
      for (let i = undosToApply.length - 1; i >= 0; i--) undosToApply[i].fn();
      
      // Prepare `this.steppedMs` for fast-forward
      this.steppedMs = this.undos.length ? this.undos[undoInd - 1].tailMs : 0;
      console.log(`  Stepped ms (${this.steppedMs}) now predates overstep boundary (${overstepMs})`);
      
      // Prepare `this.inputState` for fast-forward
      this.inputState = {};
      let ind = null;
      for (let [ ind0, inp /* = { uid, ms, val } */ ] of this.inputs.entries()) {
        if (inp.ms > this.steppedMs) { ind = ind0; break; }
        this.inputState[inp.uid] = inp;
      }
      
      console.log(`  Input state reflects inputs at time ${(ind && ind > 0) ? this.inputs[ind - 1].ms : 0}ms`);
      
      // Prepare `this.unsteppedInputs` for fast-forward (even if `ind`
      // is 0 must clone `this.unsteppedInputs` since it mutates)
      this.unsteppedInputs = this.inputs.slice(ind || 0);
      console.log(`  Replaying with ${this.unsteppedInputs.length} inputs...`);
      
      while (this.steppedMs < overstepMs) this.doStep('replay');
      console.log(`  Replay complete (${(foundation.getMs() - t).toFixed(1)}ms)!`, {
        steppedMs: this.steppedMs,
        unsteppedInputs: this.unsteppedInputs,
        inputState: this.inputState
      });
      
    },
    nextStep: function() {
      
      let inp = this.unsteppedInputs.length ? this.unsteppedInputs[0] : null;
      
      if (inp && this.steppedMs > inp.ms) this.replay(inp.ms, inp);
      
      if (inp && (inp.ms - this.steppedMs) <= this.mspf) {
        
        // Consider `inp` to have now been "stepped". Set up the state so
        // that it will reflect the payload of this input only in the next
        // step
        this.unsteppedInputs.shift();
        let inputState = { ...this.inputState };
        this.inputState[inp.uid] = inp;
        return { ms: inp.ms, inputState };
        
      } else {
        
        return { ms: this.steppedMs + this.mspf, inputState: this.inputState };
        
      }
      
    },
    doStep: function(reason) {
      
      let { ms, inputState } = this.nextStep();
      
      //console.log('REASON:', reason);
      let undoFn = this.fn(this.steppedMs, ms, inputState);
      if (!hasForm(undoFn, Function)) throw Error(`Step function must return Function (got ${getFormName(undoFn)})`);
      this.undos.add({ headMs: this.steppedMs, tailMs: ms, fn: undoFn });
      return this.steppedMs = ms;
      
    },
    run: function() {
      
      let tmp = Tmp();
      let startMs = foundation.getMs();
      let reason = 'immediate';
      
      (async () => { while (tmp.onn()) {
        
        this.doStep(reason);
        
        clearTimeout(this.timeout);
        if (!this.unsteppedInputs.length) reason = await Promise((rsv, rjc) => {
          this.timeout = setTimeout(() => rsv('timeout'), startMs - foundation.getMs() + this.steppedMs);
          this.onInputFn = () => rsv('input');
        });
        
      }})();
      
      return tmp;
      
    }
    
  })});
  
  let TimeStepWorld = form({ name: 'TimeStepWorld', has: { Tmp }, props: (forms, Form) => ({
    
    init: function({ dep, hut, world, real, fps, stepFn, renderFn, ...moreArgs }) {
      
      if (!world.getValue().has('ctrlSet')) throw Error(`World missing direct "ctrlSet" value`);
      if (!hasForm(world.getValue().ctrlSet, Object)) throw Error(`World "ctrlSet" value should be Object (got ${getFormName(world.getValue().ctrlSet)})`);
      if (world.getValue().ctrlSet.find(v => !isForm(v, Number)).found) throw Error(`World "ctrlSet" value should have every prop set to a number (key code)`);
      if (world.getValue().ctrlSet.find(v => v !== Math.floor(v)).found) throw Error(`World "ctrlSet" value should have every prop set to an integer`);
      
      if (!world.getValue().has('ms')) throw Error(`World missing direct "ms" value`);
      if (!isForm(world.getValue().ms, Number)) throw Error(`World "ms" value should be Number (got ${getFormName(world.getValue().ms)})`)
      
      let { artLayoutParams={ pixelDensityMult: 1 } } = moreArgs;
      
      forms.Tmp.init.call(this);
      Object.assign(this, {
        hut, world, real, stepFn, renderFn,
        artLayoutParams,
        stepper: null
      });
      
      let initCtrlSet = world.getValue().ctrlSet; // Immutable default global ctrlSet
      
      // Want to find the HutController for the particular Hut - but
      // technically this means a Hut can only have 1 HutController, and
      // there could be unexpected behaviour for a Hut running multiple
      // apps. The issue is that technically a Controller is unique to a
      // Hut+World pair; we would need to indicate that the matching
      // Controller belongs to both the Hut and the World; something
      // that looks like:
      //   dep.scp([ hut, world ], 'tsw.controller', (controller, dep) => { ... })
      // This really isn't too hard to implement; just listen to the
      // RecSrc for either the Hut or World, and for each Rec that comes
      // from this RecSrc (and is implicitly already a GroupRec holding
      // the 1st Rec), ensure that it also Groups the 2nd Rec. Basically
      // the resulting RecSrc has a filter that is applied to every Rec
      // stemming from the "pure" RecSrc of either the Hut or World
      
      /// {ABOVE=
      let controller = hut.parHut.createRec('tsw.controller', [ world ], { ms: 0, v: 0 });
      let hutController = hut.parHut.createRec('tsw.hutController', [ world, hut, controller ], { ctrlSet: initCtrlSet });
      /// =ABOVE}
      
      dep.scp(hut, 'tsw.hutController', (hutController, dep) => {
        
        if (hutController.mems[world.type.name] !== world) return console.log('UH OH');
        
        let myController = hutController.mems['tsw.controller'];
        let originMs = world.getValue().ms;
        let modCtrlSetAct = dep(hut.enableAction(`tsw.modCtrlSet`, ({ vals }) => {
          
          /// {ABOVE=
          
          if (!isForm(vals, Object)) throw Error(`Ctrl vals should be Object`);
          
          let initSet = hutController.getValue().ctrlSet;
          let issues = vals.toArr((v, k) => {
            if (!initCtrlSet.has(k)) return `Unexpected ctrl term "${k}"`;
            if (!isForm(v, Number)) return `Ctrl term "${k}" is non-numeric`;
            if (v !== Math.floor(v)) return `Ctrl term "${k}" is non-integer`;
            if (v < 0 || v > 1000) return `Ctrl term "${k}" out of bounds`;
            return C.skip;
          });
          if (issues.length) throw Error(`Invalid ctrl set: ${issues.join(', ')}`);
          
          hutController.mod({ ctrlSet: { ...hutController.getValue().ctrlSet, ...vals } });
          
          /// =ABOVE}
          
        }));
        let ctrlAct = dep(hut.enableAction(`tsw.ctrl`, ({ v }, { ms: inputMs }) => {
          
          /// {ABOVE=
          controller.mod({ ms: inputMs - originMs, v });
          /// =ABOVE}
          
        }));
        
        /// {BELOW=
        
        let dummyCtrls = initCtrlSet.map(() => 0);
        this.stepper = TimeStepper({ fps, fn: (headMs, tailMs, inputState) => {
          
          let ws = {
            ms: tailMs, dms: tailMs - headMs,
            inputState,
          };
          
          // Return an UndoFn which simply performs all undos in reverse
          // order they were received
          let undos = this.stepFn(ws) || [];
          return () => { for (let undo of undos.reverse()) undo(); };
          
        }});
        
        /// =BELOW}
        
        dep.scp(world, 'tsw.controller', (controller, dep) => {
          
          /// {BELOW=
          
          // Every controller routes into the TimeStepper to update inputs
          dep(controller.valSrc.route(() => {
            
            let { uid, ms, v: code } = controller.getValue();
            
            let val = {};
            let pow = 1;
            for (let [ term ] of initCtrlSet) {
              val[term] = (code & pow) ? 1 : 0;
              pow <<= 1;
            }
            
            this.stepper.addInput(controller.uid, ms, val);
            
          }));
          
          /// =BELOW}
          
        });
        
        /// {BELOW=
        
        let keySrc = MemSrc(Set());
        let lastRenderMs = 0;
        dep(real.addLayout({ form: 'Art', ...this.artLayoutParams, keySrc, animationFn: draw => {
          
          let ms = foundation.getMs() - originMs;
          let dms = ms - lastRenderMs;
          lastRenderMs = ms;
          
          let inputState = this.stepper.getInputAtMs(ms);
          let ws = {
            ms, dms,
            inputState,
            getInput: uid => inputState.has(uid) ? inputState[uid] : dummyCtrls
          };
          
          this.renderFn(ws, draw);
          
        }}));
        
        let lastEnc = 0;
        dep(keySrc.route(keys => {
          
          // When active key set changes, update local key values
          // in-place, and encode key set to send to ABOVE for update
          
          let ms = foundation.getMs();
          let { ctrlSet } = hutController.getValue();
          
          let enc = 0;
          let pow = 1;
          for (let [ term, code ] of ctrlSet) { enc += keys.has(code) * pow; pow <<= 1; }
          
          if (enc !== lastEnc) ctrlAct.act({ v: enc });
          lastEnc = enc;
          
        }))
        
        dep(this.stepper.run());
        
        /// =BELOW}
        
      });
      
    }
    
  })});
  
  return { TimeStepWorld };
  
};
