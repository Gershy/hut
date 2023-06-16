global.rooms['logic.TimerSrc'] = () => {
  
  return form({ name: 'TimerSrc', has: { Endable, Src }, props: (forms, Form) => ({
    
    init: function({ ms, num=1, immediate=(num !== 1), markMs=getMs() }) {
      
      // `num` may be set to `Infinity` for unlimited ticks
      // `markMs` anchors us to the correct moment; it should set it as
      // early as possible for accuracy
      this.initMs = this.lastMs = this.markMs = markMs;
      
      if (!isForm(num, Number)) throw Error(`"num" must be a Number`).mod({ num });
      if (!num.isInteger() && num !== Infinity) throw Error(`"num" must be an integer`).mod({ num });
      if (num < 0) throw Error(`"num" must be >= 0`).mod({ num });
      
      forms.Endable.init.call(this);
      forms.Src.init.call(this);
      
      if (num === 0) { this.end(); return; }
      
      this.num = num;
      this.count = 0;
      this.ms = ms;
      
      if (immediate || ms === 0)  Promise.resolve().then(() => this.doSend());
      else                        this.timeout = setTimeout(() => this.doSend(), ms);
      
    },
    doSend: function() {
      
      // An error thrown from any Route will short-circuit this function
      // before `this.send(...)` completes; the `catch/finally` ensure
      // that the TimerSrc always ends as soon as an Error occurs in its
      // `this.send` call
      
      let ms = getMs();
      let dms = ms - this.lastMs;
      this.lastMs = ms;
      
      try         { this.send({ n: this.count, dms, ms: ms - this.initMs }); }
      catch (err) { this.end(); throw err.mod(m => `Error in ${getFormName(this)}: ${m}`); }
      finally {
        
        // Be careful not to short-circuit using `return` inside this
        // `finally` block - doing so suppresses any Error that may have
        // occurred during `this.send`!
        
        this.count++;
        if (this.count >= this.num) this.end();
        else if (this.onn()) {
          
          this.markMs += this.ms;
          
          this.timeout = setTimeout(
            () => this.doSend(),
            Math.max(0, this.markMs - getMs())
          );
          
        }
        
      }
      
    },
    cleanup: function() {
      Object.defineProperty(this, 'send', { value: Function.stub, enumerable: true, writable: true, configurable: true });
      clearTimeout(this.timeout);
    }
    
  })});
  
};
