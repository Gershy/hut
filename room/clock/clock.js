global.rooms['clock'] = async foundation => {
  
  let rooms = await foundation.getRooms([
    'logic.TimerSrc',
    'logic.MemSrc',
    'logic.FnSrc',
  ]);
  let { TimerSrc, MemSrc, FnSrc }  = rooms;
  
  let Clock = form({ name: 'Clock', has: { Endable }, props: (forms, Form) => ({
    
    $msPerHr: 1000 * 60 * 60,
    $msPerMin: 1000 * 60,
    $msPerSec: 1000,
    
    init({ endMs=null, endMsSrc=endMs, real=null }) {
      
      let manageEndMsSrc = false;
      if (isForm(endMsSrc, Number)) {
        manageEndMsSrc = true; // We created the Src - we need to manage it!
        endMsSrc = MemSrc.Prm1(endMsSrc);
      }
      if (!isForm(endMsSrc, MemSrc.Prm1)) throw Error(`"endMsSrc" must be MemSrc.Prm1 (got ${getFormName(endMs)})`);
      if (!endMsSrc.srcFlags.memory) throw Error(`The "endMsSrc" Src must supply an immediate value`);
      if (!real) throw Error(`Can't omit "real"`);
      
      // Note that `real` is meant to be "tabula rasa", initialized by
      // the consuming Room. It will probably be named, e.g., "clock"
      
      let hrReal =  real.addReal('hr',  { text: '--' }, [{ form: 'Text' }]);
      real.addReal('sep', [ { form: 'Text', text: ':' } ]);
      let minReal = real.addReal('min', { text: '--' }, [{ form: 'Text' }]);
      real.addReal('sep', [ { form: 'Text', text: ':' } ]);
      let secReal = real.addReal('sec', { text: '--' }, [{ form: 'Text' }]);
      
      // The logic with `markMs` is meant to align the `TimerSrc` to the
      // utc second, so it ticks precisely whenever the utc second turns
      // over
      let timerSrc = TimerSrc({ num: Infinity, ms: 1, markMs: 1000 - (Date.now() % 1000) });
      
      let remainingMsSrc = FnSrc.Prm1([ timerSrc, endMsSrc ], (tick, endMs=null) => {
        if (endMs === null) return null;
        return endMs - Date.now();
      });
      remainingMsSrc.route(remainingMs => {
        
        // If `remainingMs` is `null` show "--" for all time components
        if (remainingMs === null) return [ hrReal, minReal, secReal ].each(real => real.mod({ text: '--' }));
        
        let hrs = Math.floor(remainingMs / Form.msPerHr);
        remainingMs -= hrs * Form.msPerHr;
        
        let mins = Math.floor(remainingMs / Form.msPerMin);
        remainingMs -= mins * Form.msPerMin;
        
        let secs = Math.floor(remainingMs / Form.msPerSec);
        remainingMs -= secs * Form.msPerSec;
        
        hrReal.mod({ text: hrs.toString().padHead(2, '0') });
        minReal.mod({ text: mins.toString().padHead(2, '0') });
        secReal.mod({ text: secs.toString().padHead(2, '0') });
        
      });
      
      Object.assign(this, { endMsSrc, manageEndMsSrc, timerSrc, remainingMsSrc });
      
    },
    cleanup() {
      this.timerSrc.end();
      this.remainingMsSrc.end();
      if (this.manageEndMsSrc) this.endMsSrc.end();
    }
    
  })});
    
  return { Clock };
  
};
