global.rooms['random'] = foundation => {
  
  let Random = form({ name: 'Random', props: (forms, Form) => ({
    init: C.noFn('init', seed => {}),
    genFloat: C.noFn('genFloat', (min=0, max=1) => {}),
    genInteger: function(min, max) { return min + Math.floor(this.genFloat(0, max - min)); },
    genZ: function(...args) { return this.genInteger(...args); },
    genQ: function(...args) { return this.genFloat(...args); },
    genSign: function() { return this.genFloat() < 0.5 ? -1 : +1 },
    genBoolean: function() { return this.genFloat() < 0.5; },
    getElem: function(arr) { return arr.count() ? arr[this.genInteger(0, arr.length)] : null; },
    genShuffled: function(arr) {
      
      let result = [ ...arr ];
      
      let n = result.count();
      for (let i = 0; i < n; i++) {
        let r = this.genInteger(i, n);
        [ result[i], result[r] ] = [ result[r], result[i] ];
      }
      
      return result;
      
    }
  })});
  
  let NativeRandom = form({ name: 'NativeRandom', has: { Random }, props: (forms, Form) => ({
    
    // Powered by native `Math.random()` method
    
    init: function(seed=null) {
      if (seed !== null) throw Error(`${getFormName(this)} does not support a seed`);
    },
    genFloat: function(min=0, max=1) { return min + Math.random() * (max - min); }
    
  })});
  
  let FastRandom = form({ name: 'FastRandom', has: { Random }, props: (forms, Form) => ({
    
    // Powered by quick xor pseudorandomness
    
    $initialChurns: 7,
    
    init: function(seed=Math.round(Date.now())) {
      
      if (!isForm(seed, Number)) throw Error(`${getFormName(this)} requires numeric seed`);
      if (Math.floor(seed) !== seed) throw Error(`${getFormName(this)} requires integer seed`);
      if (seed < 0) throw Error(`${getFormName(this)} requires seed >= 0`);
      
      this.seed0 = Math.abs((       10 + seed * 1.7 + 113) | 0);
      this.seed1 = Math.abs((123456789 + seed * 0.5 +  97) | 0);
      
      // Churning introduces chaos to stable initial configurations
      for (let i = 0; i < Form.initialChurns; i++) this.genFloat();
      
    },
    genFloat: function(min=0, max=1) {
      
      let v = this.seed0 ^ this.seed1;
      this.seed0 = Math.abs( (this.seed1 * 3 + 277) ^ this.seed0 );
      this.seed1 = Math.abs( 0 | ( (v + 17) * (29 + this.seed1) ) );
      return min + v * (max - min) * 4.656612875245797e-10; // That's `1 / (2 ** 31 - 1)`
      
    }
    
  })});
  
  let SecureRandom = form({ name: 'SecureRandom', has: { Random }, props: (forms, Form) => ({
    
    // TODO: Something like linear congruential formula?
    
    init: C.noFn('init')
    
  })});
  
  /// {ABOVE=
  /// {DEBUG=
  let visualCheck = (random, { numCols=60, height=40, tests=1 * 1000 * 1000 }={}) => {
    
    let smps = Array(tests);
    let t = foundation.getMs();
    for (let i = 0; i < tests; i++) smps[i] = random.genFloat();
    let dt = foundation.getMs() - t;
    
    let cols = numCols.toArr(v => 0);
    smps.each(s => cols[Math.floor(s * numCols)]++);
    
    let mult = 1 / Math.max(...cols);
    cols = cols.map(v => v * mult);
    
    let lines = [];
    for (let i = 0; i < height; i++) {
      let thresh = 1 - ((i + 0.5) / height);
      lines.add('| ' + cols.map(v => (v > thresh ? 'M' : '-')).join('') + ' |');
    }
    
    console.log(`Visual bias of ${getFormName(random)}:`);
    console.log(lines.join('\n'));
    console.log(`| 0 ${'-'.repeat(numCols - 4)} 1 |`);
    console.log(`Generated ${tests} samples in ${dt.toFixed(0)}ms`);
    
    foundation.halt();
    
  };
  //visualCheck(FastRandom(), { numCols: 120, height: 50 });
  /// =DEBUG}
  /// =ABOVE}
  
  return { Random, NativeRandom, FastRandom };
  
};
