/// <reference path="../ts/hut.d.ts" />
'use strict';

global.rooms = Object.create(null);
require('../room/setup/clearing/clearing.js');
require('./util/installV8ErrorStacktraceHandler.js')();
require('./util/installTopLevelHandler.js')();

// Foundation
(() => {
  
  global.formatAnyValue = require('./util/formatAnyValue.js');
  global.subconOutput = require('./util/getStdoutSubconOutputter.js')({ relevantTraceIndex: 2 });
  
})();

let nestedRepeaterExperiments = () => {
  
  let permutationPicks = function*(size, n) {
    
    if (n === 0) return yield [];
    
    for (let innerPick of permutationPicks(size, n - 1))
      for (let v = 0; v < size; v++)
        yield [ v, ...innerPick ];
    
  };
  let rangePowerSetAwful = function*(range1, range2) {
    
    for (let outer = range1.start; outer <= range1.end; outer++) {
      
      // `outer` determines how many times we pick values in the range [ rbHead, rbTail ]
      // We add together all such picked values
      
      let range2Size = (range2.end - range2.start) + 1; // Add 1; ranges are inclusive on both ends
      for (let pick of permutationPicks(range2Size, outer))
        yield 0
          // Each index in `pick` should be offset by the number of skipped items at the beginning of
          // the inner range; we are summing anyways and there are `outer` such items that need to be
          // offset so we can perform all offsets at once like so
          + range2.start * outer // note that `outer === pick.length`
          + pick.reduce((m, v) => m + v, 0);
      
    }
    
  };

  let rangePowerSet = function*(r1, r2) {
    
    let min = r1.start * r2.start;
    let max = r1.end * r2.end;
    
    yield min;
    if (min === max) return;
    
    for (let n = min + 1; n < max; n++) {
      
      // Consider that we're trying to pick a valid sum. Increasing the number of picks boosts both
      // the minimum and maximum possible sums; boosting the minimum is unfavourable, but boosting
      // the maximum is favourable. Overall we need to find a number of picks to satisfy the upper
      // and lower bounds.
      // 
      // Lower bound: `r2.start * numPicks`; upper bound: `r2.end * numPicks`
      // Overall we require a number of `picks` such that:
      //    | let contained = n >= r2.start * picks && n <= r2.end * picks
      // For minimum value:
      //    | n                >= r2.start * picks
      //    | r2.start * picks <= n
      //    | picks            <= n / r2.start
      // For maximum value:
      //    | n                <= r2.end * picks
      //    | r2.end * picks   >= n
      //    | picks            >= n / r2.end
      
      // We need a value of `picks` which satisfies both:
      // - `picks <= n / r2.start`
      // - `picks >= n / r2.end`
      
      // Apply `ceil` and `floor`:
      // - `picks <= Math.floor(n / r2.start)`
      // - `picks >= Math.ceil (n / r2.end)`
      
      let maxPicks = Math.floor(n / r2.start);
      let minPicks = Math.ceil(n / r2.end);
      if (maxPicks >= minPicks) yield n;
      
      // SCAFFOLD:
      //    | // Is `n` covered??
      //    | let contained = (() => {
      //    |   
      //    |   // The number of picks can be any value in `r1`
      //    |   for (let numPicks = r1.start; numPicks <= r1.end; numPicks++) {
      //    |     
      //    |     // Now we have to pick `numPicks` ints from `r2` such that they sum to `n`
      //    |     
      //    |     // Note that in an `r2` with `start > 0` every pick results in a minimum of `r2.start`
      //    |     // being added to the sum, for a total minimum of `r2.start * numPicks` (`boost`); we can
      //    |     // immediately add this value, and then consider `r2` as shifted so that it starts at 0; we
      //    |     // can consider this the "normalized" `r2`, which is really just `r2Size`, an int
      //    |     // representing the distance from 0
      //    |     
      //    |     // SCAFFOLD:
      //    |     //    | let boost = r2.start * numPicks; // Normalizing `r2`; size is constant, start is 0
      //    |     //    | let normN = n - boost;           // Normalized `r2` corresponds to `normN`, not `n`
      //    |     //    | if (normN < 0) continue;         // The boost is too large; we'll always overpick
      //    |     //    | 
      //    |     //    | let maxNormSum = (r2.end - r2.start) * numPicks; // If biggest item always picked
      //    |     //    | if (normN > maxNormSum) continue; // Biggest sum is insufficient
      //    |     //    | 
      //    |     //    | return true; // If the bounding checks didn't fail, this value can be picked!
      //    |     
      //    |     // Determine if `n` is in the range
      //    |     if (n < r2.start * numPicks) continue; // `n` is too small
      //    |     if (n > r2.end   * numPicks) continue; // `n` is too large
      //    |     
      //    |     return true;
      //    |     
      //    |   }
      //    |   
      //    |   return false;
      //    |   
      //    | })();
      //    | 
      //    | if (contained) yield n;
      
    }
    
    yield max;
    
  };

  let getResults = fn => {
    
    // Note for `rangeMult([ a, b ], [ c, d ])`, the max value will always be `b * d`
    let raw = fn().toArr(v => v);
    let set = Set(raw);
    let setSorted = set.toArr(v => v).valSort(v => v);
    let max = setSorted.at(-1);
    
    return {
      raw,
      vals: setSorted,
      max,
      visual:  `(0> ${(max + 1).toArr(n => set.has(n) ? '\u2022' : '-').join('')} <${max})`
    };
    
  };

  for (let i = 0; i < 30; i++) {
    
    let r = (a, b) => a + Math.floor((b - a) * Math.random());
    
    /** @type 'compare'|'run' */
    let type = 'compare'; // "compare" can ensure the results of an improved fn match expectations
    
    let top = { compare: 6, run: 30 }[type];
    let a = r(0, top);
    let b = a + r(0, top);

    let c = r(0, top);
    let d = c + r(0, top);
    
    if (type === 'run') {
      
      let { visual } = getResults(() => rangePowerSet({ start: a, end: b }, { start: c, end: d }));
      
      let [ , str ] = visual.match(/[ ](.*)[ ]/);
      str = str.replaceAll('\u2022', '+');
      
      let opts = [
        '++--+',
        '+--++',
        '--++-',
        '-++--'
      ];
      
      if (true || opts.some(v => str.has(v)))
        gsc(`[${a}:${b}] x [${c}:${d}]`, { visual });
      
    } else if (type === 'compare') {
      
      let { visual: v1 } = getResults(() => rangePowerSet({ start: a, end: b }, { start: c, end: d }));
      let { visual: v2 } = getResults(() => rangePowerSetAwful({ start: a, end: b }, { start: c, end: d }));
      
      if (v1 !== v2) {
        
        gsc(String.baseline(`
          | OWWWW
          | [${a}:${b}] x [${c}:${d}]
          | ??: ${v1}\n!!: ${v2}\n\n
        `));
        
      }
      
      continue;
      
    }
    
  }

  process.exit(0);
  
};

let lib = (() => {
  
  let Language = form({ name: 'Language', props: (forms, Form) => ({
    
    $resolveCfg: (term, Cls, cfg) => {
      
      // `term` prefixed with "!" indicates `hasForm` instead of `isForm`
      let clsCheck = term.hasHead('!') ? hasForm : isForm;
      if (term.hasHead('!')) term = term.slice(1);
      
      if      (cfg.length === 3)                           return { name: cfg[0], [term]: cfg[1], ...cfg[2] };
      else if (cfg.length === 2 && clsCheck(cfg[1], Cls))  return { name: cfg[0], [term]: cfg[1] };
      else if (cfg.length === 2 && isForm(cfg[1], Object)) return {               [term]: cfg[0], ...cfg[1] };
      else if (clsCheck(cfg[0], Cls))                      return {               [term]: cfg[0] };
      else if (isForm(cfg[0], Object))                     return cfg[0];
      else                                                 throw Error('Unexpected config').mod({ cfg });
      
    },
    
    init({ name, globalOmitRegex=/^/ }) {
      
      if (isForm(globalOmitRegex, String))       globalOmitRegex = RegExp(globalOmitRegex.replaceAll('\\', '\\\\')); // Escape all backslashes
      if (globalOmitRegex.toString()[1] !== '^') throw Error('Global omit regex must begin with "^"');
      
      if (!isForm(name, String)) throw Error('Name must be string').mod({ name });
      Object.assign(this, { name, globalOmitRegex });
      
    },
    
    nvr(...cfg) { return  NeverParser({ lang: this, ...cfg }); },
    yld(...cfg) { return  YieldParser({ lang: this, ...cfg }); },
    tok(...cfg) { return  TokenParser({ lang: this, ...Form.resolveCfg('token', String, cfg) }); },
    reg(...cfg) { return  RegexParser({ lang: this, ...Form.resolveCfg('regex', String, cfg) }); },
    any(...cfg) { return    AnyParser({ lang: this, ...Form.resolveCfg('opts',  Array,  cfg) }); },
    all(...cfg) { return    AllParser({ lang: this, ...Form.resolveCfg('reqs',  Array,  cfg) }); },
    rep(...cfg) { return RepeatParser({ lang: this, ...Form.resolveCfg('!kid',  Parser, cfg) }); },
    
    fns() { return 'nvr,yld,tok,reg,any,all,rep'.split(',').toObj(v => [ v, this[v].bind(this) ]); }
    
  })});
  
  let Parser = form({ name: 'Parser', props: (forms, Form) => ({
    
    $cnt: 0,
    
    init({ lang, name, c, ...cfg }) {
      
      if (!isForm(lang, Language)) throw Error('Lang param must be a language').mod({ lang });
      if (!cfg.empty()) throw Error('Unexpected config').mod({ cfg });
      
      Object.assign(this, { lang, name, c: Form.cnt++ });
      
    },
    
    // Recursive overview
    sometimesLoops(...args) { throw Error('Not implemented'); /* Note that stepping breaks loops */ },
    certainlyHalts(...args) { return !this.sometimesLoops(...args); },
    certainlySteps(...args) { throw Error('Not implemented'); },
    getEstimatedComplexity() { return 1; },
    * getDelegationChains(chain=[]) {
      
      // Yields all possible delegation chains beginning with this Parser
      
      // Note that a "delegation chain" implies an array of Parsers which may consume zero tokens,
      // and ending with a Parser that either always consumes at least one token, or which has
      // already been seen in the chain (implying that the chain is cyclical). Note that no chain
      // will ever contain multiple instances of the same Parser, with the exception of the case
      // where the final Parser has already appeared earlier in the chain!
      
      throw Error('Not implemented');
      
    },
    
    // Compound
    getCompoundKids() { return []; },
    
    // Normalization
    clone(...args) { throw Error('Not implemented'); },
    simplify() { throw Error('Not implemented'); },
    normalize() { throw Error('Not implemented'); /* Returns an equivalent, but normalized, Parser - should not mutate anything */ },
    
    // Parsing
    parse(src, ...args) {
      
      // This function is the user's entrypoint; it's called once per Parser.Src and simply
      // sanitizes the user input (then internally, the `run` method is used for parsing)
      
      if (isForm(src, String)) src = Parser.Src({ str: src });
      
      let best = Parser.Trg({ str: '' });
      for (let p of this.run(src, ...args)) {
        if (p.str.length === src.str.length) return p;
        if (p.str.length > best.str.length) best = p;
      }
      
      throw Error('Unable to parse').mod({ best });
      
    },
    * run(src, ...args) {
      
      // TODO: apply `lang.globalOmitRegex`, dive parsing
      
      yield* this.run0(src, ...args);
      
    },
    * run0() { throw Error('Not implemented'); },
    
    // Observability
    getTerm() { return getFormName(this).slice(0, 3).lower(); },
    getVisualizeParams() { return [ `"${this.name || '<anon>'}"` ]; },
    visualize(seen=Set()) {
      
      let d = `${this.getTerm()}(${this.getVisualizeParams().join(', ')})`;
      let kids = this.getCompoundKids();
      
      // Only need to do `seen`-checking for Parsers with Kids
      if (kids.length) {
        if (seen.has(this)) return `cyc [ ${d} ]`;
        seen.add(this);
      }
      
      if (kids.length) d += '\n' + kids
        .map(kid => kid.visualize(seen))
        .map(desc => { let [ ln0, ...lns ] = desc.split('\n'); return [ `- ${ln0}`, ...lns.map(ln => `  ${ln}`) ].join('\n'); })
        .join('\n');
      
      return d;
      
    },
    
    $Src: form({ name: 'Src', props: (forms, Form) => ({
      init({ str }) {
        
        if (!isForm(str, String)) throw Error('String param must be string').mod({ str });
        
        Object.assign(this, { str });
        
      },
      advance(offset) {
        
        if (isForm(offset, Parser.Trg)) offset = offset.str;
        if (isForm(offset, String)) {
          if (!this.str.hasHead(offset)) throw Error('Advance str is not a prefix').mod({ str: this.str, offset });
          offset = offset.length;
        }
        
        if (!isForm(offset, Number)) throw Error('Offset must be number').mod({ offset });
        
        if (offset === 0) return this;
        return Parser.Src({ str: this.str.slice(offset) });
        
      },
      desc() { return `${getFormName(this)}("${this.str.ellipsis(50)}")`; }
    })}),
    $Trg: form({ name: 'Trg', props: (forms, Form) => ({
      init({ str='', trgs=[] }) {
        
        if (trgs.length)          str = trgs.map(pt => pt.str).join('');
        if (!isForm(str, String)) throw Error('String param must be a string').mod({ str });
        
        Object.assign(this, { str, trgs });
        
      },
      desc() {
        return `${getFormName(this)}("${this.str.ellipsis(50)}")` + (this.trgs.length ? '\n' : '') + this.trgs.map(trg => trg.desc()).join('\n').indent(4);
      }
    })})
    
  })});
  
  let TrivialParser = form({ name: 'TrivialParser', has: { Parser }, props: (forms, Form) => ({
    
    init(cfg) { forms.Parser.init.call(this, cfg); },
    
    // TrivialParsers neither step or loop
    sometimesLoops() { return false; },
    certainlySteps() { return false; },
    * getDelegationChains(chain=[]) { yield [ ...chain, this ]; },
    
    simplify() { return this; },
    
    clone(...args) { return this; },
    simplify() { return this; },
    
  })});
  
  let NeverParser = form({ name: 'NeverParser', has: { TrivialParser }, props: (forms, Form) => ({
    
    * run0() {},
    desc() { return this.name || 'never()'; }
    
  })});
  let YieldParser = form({ name: 'YieldParser', has: { TrivialParser }, props: (forms, Form) => ({
    
    * run0() { yield ''; },
    desc() { return this.name || 'yield()'; }
    
  })});
  
  let ImmediateParser = form({ name: 'ImmediateParser', has: { Parser }, props: (forms, Form) => ({
    
    // Note that ImmediateParsers are immutable
    
    init({ sgs=false /* "strip global seqs" */, ...cfg }) {
      
      forms.Parser.init.call(this, cfg);
      Object.assign(this, { sgs });
      
    },
    
    sometimesLoops() { return false; },
    
    * getDelegationChains(chain=[]) { yield [ ...chain, this ]; }, // ImmediateParsers don't delegate (could also call them "Terminal" parsers, or "Leaf" parsers)
    
    clone(...args) { return this; },
    simplify() { return this; },
    normalize() { return this; }
    
  })});
  let TokenParser = form({ name: 'TokenParser', has: { ImmediateParser }, props: (forms, Form) => ({
    
    init({ token, ...cfg }) {
      
      if (!isForm(token, String)) throw Error('Token param must be a string').mod({ token });
      if (token.length === 0)     throw Error('Token must not be empty string').mod({ token });
      
      forms.ImmediateParser.init.call(this, cfg);
      Object.assign(this, { token });
      
    },
    
    certainlySteps() { return true; },
    
    * run0(src) {
      if (src.str.hasHead(this.token)) yield Parser.Trg({ prs: this, str: this.token });
    },
    
    desc() { return this.name || `tok(${this.token})`; },
    getVisualizeParams() { return [ ...forms.ImmediateParser.getVisualizeParams.call(this), this.token ]; }
    
  })});
  let RegexParser = form({ name: 'RegexParser', has: { ImmediateParser }, props: (forms, Form) => ({
    
    init({ regex, z=false /* zeroable */, ...cfg }) {
      
      if (isForm(regex, String)) {
        if (!regex.hasHead('^')) regex = `^(${regex})`;
        regex = RegExp(regex.replaceAll('\\', '\\\\')); // Escape all backslashes
      }
      if (!isForm(regex, RegExp)) throw Error('Regex param must be a regular expression').mod({ regex });
      
      forms.ImmediateParser.init.call(this, cfg);
      Object.assign(this, { regex, z });
      
    },
    
    certainlySteps() { return !this.z; }, // Steps if non-zeroable (`this.z`)
    
    * run0(input) {
      let [ match ] = input.str.match(this.regex) ?? [];
      if (match) yield Parser.Trg({ prs: this, str: match });
    },
    
    desc() { return this.name || `reg('${this.regex.toString().slice(3, -2)}')`; },
    getVisualizeParams() {
      return [
        ...forms.ImmediateParser.getVisualizeParams.call(this),
        this.regex.toString().slice(3, -2) // Slice off "/^(" at the front and ")/" at the end (note: could be unexpected if user supplied e.g. "^abc", without brackets)
      ];
    }
    
  })});
  
  let CompoundParser = form({ name: 'CompoundParser', has: { Parser }, props: (forms, Form) => ({
    
    getDelegates() { throw Error('Not implemented'); },
    * getDelegationChains(chain=[]) {
      
      let dlgChain = [ ...chain, this ];
      if (chain.has(this)) return yield dlgChain;;
      
      for (let dlg of this.getDelegates()) yield* dlg.getDelegationChains(dlgChain);
      
    },
    
    simplify(seen=Set()) {
      
      // This method will deal with directly-nested Parsers only (limited recursivity)
      // Mutates and returns `this`
      
      // - Nested Anys can be flattened into a single Any
      // - Nested Alls can be flattened into a single All
      // - Nested Reps can be flattened into a single Rep, whose minReps/maxReps are a
      //   multiplication of the nested Reps' values
      
      throw Error('Not implemented');
      
    },
    normalize() {
      
      let mut = this.clone(); // "mutable"
      
      let getNextLrChain = delegatingParser => {
        
        // Find next LR chain...
        for (let chain of delegatingParser.getDelegationChains()) {
          
          if (chain.length < 2) throw Error('Whoa... chain is too short?? NAHHH').mod({ chain });
          
          let lastInd = chain.length - 1;
          let last = chain.at(-1);
          let ind = chain.indexOf(last);
          if (ind < lastInd) return chain.slice(ind); // Return the cyclical part of the chain (ignore any linear prefix)
          
        }
        
        return null; // No LR chain found
        
      };
      
      while (true) { // Loop until all LR chains are refactored
        
        /*
          LR chain detected
          Note that `chain` now only consists of `CompoundParser`s - if it didn't, it couldn't
          have a cycle of delegations
          
          Note that `chain` is conceptually cyclical (`chain.at(0)` is adjacent to `chain.at(-1)`)
          Note that `chain` will never consist entirely of `AllParser`s (since an AllParser always
          delegates, a chain of only `AllParser`s would always infinitely delegate - I'm quite
          sure a chain of only AllParsers always indicates a user error)
          Note that any `RepeatParser`s in `chain` have a Kid defined (never `null`)
          Note that `AllParser` and `RepeatParser` are thematically similar; their haltiness is
          defined by the first application of a Kid/Req Parser which Loops or Halts (non-looping,
          non-halting Kid/Req Parsers which come earlier have no bearing on haltiness)
          Note that an `AnyParser` containing a RepeatParser with `minReps === 0` can be replaced
          with an `AnyParser` with an additional `NopParser` option, and `minReps === 1` instead
          
          Consider a chain A -> B -> C -> D -> A
          Note that the topmost decision about how to treat this cycle depends on whether any
          Parser in the cycle is an AllParser (there will always be at least one AnyParser -
          cycles of only AllParsers always define either halts, zero token consumption [in the
          case of a RepeatParser with minReps=0], or infinite token consumption!)
          Note that if we could ignore RepeatParsers, such nested AnyParsers can be logically
          flattened without altering the parse tree.
          
          Consider an LR loop consisting of any number of Anys and Reps (no Alls). To normalize
          we can produce a single Rep whose Kid is a single Any. The Any directly contains all
          Opts available to all Anys in the loop, and all Kids available to all Reps, *except* for
          any links which cause another cycle. This is relatively easy to understand: arbitrarily
          nested Anys can each get to any Opt of any other such Any; hardly any different from if
          all the Opts were flattened under a single Any. Now if we consider a case where the
          cycle also contains some Reps, we can *almost* replace each Rep with its Kid. Note that
          if the rest of the chain is only Anys, the cycle behaves exactly the same regardless of
          where a single Rep is spliced into it. This is because any Any can access the Rep, and
          the Rep's Kid can also access any Any. The only difference is that the entire loop is
          able to parse some number of times depending on the Rep, instead of exactly once - so we
          have to replace this ability to repeat; hence the design of a single Rep containing a
          single Any. The last issue is to address towers of nested Reps; this feels like a number
          theory problem and is possibly(??) very difficult to compute for large towers of Reps.
          I will probably take a shortcut here and assume that a stack of Reps can be resolved to
          a single Rep whose `minReps` and `maxReps` are the multiplications of the corresponding
          values of all stacked Reps; this is an approximation and may allow for certain repetition
          amounts which would ordinarily be impossible; the exact range of possible repetitions is
          often not contiguous, and computing it is probably very hard or at least inefficient.
        */
        
        let lrChain = getNextLrChain(mut)?.slice(0, -1); // Slice off the final looping item; `lrChain` contains unique items!
        if (!lrChain) break; // No more LR chains!
        
        // We need to break `lrChain`. Whether or not `lrChain` contains an All determines the
        // overall strategy.
        let alls = lrChain.filter(v => isForm(v, AllParser));
        let anys = lrChain.filter(v => isForm(v, AnyParser));
        let reps = lrChain.filter(v => isForm(v, RepeatParser));
        if (alls.empty()) {
          
          // No `AllParser`! Are there RepeatParsers? If so we'll normalize to a Rep whose Kid is
          // an Any, otherwise we normalize simply to an Any, which is essentially a flattened
          // version of `mutable` with cycles broken.
          
          // Add all Opts of all Anys to a single flattened Any! (Exclude Opts which happen to be
          // part of the current LR cycle!) TODO: O(n^2); `lrItems.has(...)` is O(n) - improve!
          let flatOpts = anys.map(any => any.opts).flat(1).filter(opt => !lrChain.has(opt));
          let flatAny = AnyParser({ lang: mut.lang, name: `flatAny(${anys.toArr(any => any.name).join(' + ')})`, opts: flatOpts });
          
          // Resolves to either `any([ ...flatOpts ])`, or `rep(any([ ...flatOpts ]))`
          let normalized = reps.empty() ? flatAny : RepeatParser({
            lang: mut.lang,
            name: `flatRep(${reps.toArr(any => any.name).join(' + ')})`,
            // TODO: The true set of "rep" possibilies may be not be a contiguous range! This is
            // explored in the `nestedRepeaterExperiments` function, and on SE here:
            // https://stackoverflow.com/questions/78008791
            minReps: reps.map(rep => rep.minReps).reduce((m, v) => m * v, 1), // Can't be `0 * Infinity` as `minReps` is never `Infinity`
            maxReps: reps.map(rep => rep.maxReps).reduce((m, v) => m * v, 1), // Can't be `0 * Infinity` as `maxReps` is never `0`
            kid: flatAny // `flatAny` from above
          });
          
          if (anys.has(this)) {
            
            // Literally the whole Parser being normalized is resolved to `normRoot` at once; note
            // here we don't even need to do `mut = normRoot`; we can immediately return `normRoot`
            // as it is guaranteed to be entirely LR-free! (The reason to set `mut = normRoot` is
            // to continue to check `mut` for any additional LR)
            return normRoot;
            
          } else {
            
            // `mutable` itself wasn't refactored by normalization; we need to traverse every child
            // Parser reachable from `mutable`, and whenever we find one of the Anys that was
            // flattened, we replace it with `normRoot`!
            
            let replaceLrItemsOp = (node, seen=Set()) => {
              
              if (seen.has(node)) return; seen.add(node);
              
              switch (node.getTerm()) {
                
                case 'any':
                  
                  // If the Any has Opts which feed into the LR chain, remove all such Opts and add
                  // the single `normalized` node as a new Opt
                  // TODO: O(n^2)
                  let optsLrRemoved = node.opts.filter(opt => !lrChain.has(opt));
                  if (optsLrRemoved.length < node.opts.length)
                    node.opts = [ ...optsLrRemoved, normalized ]; // TODO: Optimize Opt ordering later? (AnyParser.prototype.optimizeOptOrder?)
                  
                  for (let opt of optsLrRemoved) replaceLrItemsOp(opt, seen);
                  return;
                  
                case 'all':
                  
                  // Each Req which is part of the LR chain must be replaced with `normalized`
                  node.reqs = node.reqs.map(req => lrChain.has(req) ? normalized : req);
                  
                  for (let req of node.reqs) if (req !== normalized) replaceLrItemsOp(req, seen);
                  return;
                  
                case 'rep':
                  
                  if (lrChain.has(node.kid)) node.kid = normalized;
                  else                       replaceLrItemsOp(node.kid, seen);
                  return;
                  
                default: /* ignore anything else */ return;
                
              }
              
            };
            replaceLrItemsOp(mut);
            
          }
          
        } else {
          
          // There's at least one `AllParser` in the chain; this is the tricky part! We're going to
          // break the LR chain at the All; consider the chain A -> B -> C -> D -> A; first we'll
          // rotate the chain so that D is always an AllParser; we'll then sever its link to A.
          
          // Some "ParentParser" `P` delegates to the cycle-closing All, `A`, which then delegates
          // directly loops ("loops", in the strong sense) to `P`. The strategy prevents `A`
          // delegating back to `P`, and we need to keep in mind that this topology is always
          // equivalent to one where any non-looping delegate of `P` first parses, and then `A`,
          // minus its loop-back, may parse any number of times. To get an overall sense of the
          // approach, look at the `mathLr` and `mathNorm` examples which directly define
          // equivalent parsers, but the natural definition contains LR while `mathNorm` does not.
          
          // Two important questions:
          // 1. Which parent of the offending All should get refactored? (Answer: the All's Req!)
          // 2. What about Alls with multiple Delegates?
          
          let allToNormalize = alls[0];
          let allInd = lrChain.indexOf(allToNormalize);
          let req = lrChain[(allInd + 1) % lrChain.length];
          
          gsc('LR', lrChain);
          
          return mut;
          
        }
        
      }
      
      return mut;
      
    },
    
    getVisualizeArgs() { return ''; },
    desc(seen=Set()) {
      if (seen.has(this)) return `<cyc:${this.name || this.getTerm()}>`;
      seen.add(this);
      
      let visArgs = this.getVisualizeArgs();
      let visKids = this.getCompoundKids().map(d => d.desc(seen)).join(', ') || '<empty>';
      let visStr = visArgs ? `${visArgs} ${visKids}` : visKids;
      
      return this.name || `${this.getTerm()}(${visStr})`;
    },
    
  })});
  let AnyParser = form({ name: 'AnyParser', has: { CompoundParser }, props: (forms, Form) => ({
    
    init({ opts=[], ...cfg }) {
      
      if (!isForm(opts, Array)) throw Error('Opts param must be array').mod({ opts });
      if (opts.some(v => !hasForm(v, Parser))) throw Error('Opts array must only contains parsers').mod({ opts });
      
      forms.CompoundParser.init.call(this, cfg);
      Object.assign(this, { opts });
      
    },
    
    // Compound
    getCompoundKids() { return this.opts; },
    addOpt(opt) { this.opts.push(opt); return { all: this, opt }; },
    
    // Recursive overview
    sometimesLoops(seen=Set()) {
      
      // An AnyParser is able to loop if any of its delegates can loop or it eventually delegates
      // back to itself
      
      if (seen.has(this)) return true;
      seen.add(this);
      
      for (let opt of this.opts) if (opt.sometimesLoops(seen)) return true;
      return false;
      
    },
    certainlySteps(seen=Set()) {
      
      // An AnyParser certainly steps if *all* of its delegates step before a loop forms (if a loop
      // forms, the AnyParser may *not* step)
      
      if (seen.has(this)) return false;
      seen.add(this);
      
      for (let opt of this.opts) if (!opt.certainlySteps(seen)) return false;
      return true;
      
    },
    getDelegates() { return [ ...this.opts ]; },
    
    // Normalization
    simplify(seen=Set()) {
      
      if (seen.has(this)) return this;
      seen.add(this);
      
      let gatherDirectlyNestedOpts = function*(any, seenAnys=Set()) {
        
        if (seenAnys.has(any)) return;
        seenAnys.add(any);
        
        for (let opt of any.opts) {
          if (isForm(opt, AnyParser)) yield* gatherDirectlyNestedOpts(opt, seenAnys);
          else                        yield opt;
        }
        
      };
      
      // Simplify all Opts
      this.opts = gatherDirectlyNestedOpts(this).toArr(opt => opt.simplify(seen));
      
      // Factor out irrelevant AnyParser
      if (this.opts.length === 0) return NeverParser({ lang: this.lang }); // An Any without Opts never parses
      if (this.opts.length === 1) return (this === this.opts[0]) ? Error('Trivial loop').propagate() : this.opts[0];
      
      return this;
      
    },
    clone(map=Map()) {
      
      if (map.has(this)) return map.get(this);
      
      let any = AnyParser({ ...this, opts: [] });
      map.set(this, any);
      
      for (let opt of this.opts) any.addOpt(opt.clone(map));
      
      return any;
      
    },
    
    // Parsing
    * run0(input) { for (let opt of this.opts) yield* opt.run(input); },
    
  })});
  let AllParser = form({ name: 'AllParser', has: { CompoundParser }, props: (forms, Form) => ({
    
    init({ reqs=[], ...cfg }) {
      
      if (!isForm(reqs, Array)) throw Error('Reqs param must be array').mod({ reqs });
      if (reqs.some(v => !hasForm(v, Parser))) throw Error('Reqs array must only contains parsers').mod({ reqs });
      
      forms.CompoundParser.init.call(this, cfg);
      Object.assign(this, { reqs });
      
    },
    
    // Compound
    getCompoundKids() { return this.reqs; },
    addReq(req) { this.reqs.push(req); return { all: this, req }; },
    
    // Recursive overview
    sometimesLoops(seen=Set()) {
      
      // An AllParser delegates to all its Reqs in order, so it loops if a Req loops *before* any
      // earlier Req steps
      
      if (seen.has(this)) return true;
      seen.add(this);
      
      for (let req of this.reqs) {
        
        if (req.sometimesLoops(seen))                      return true;
        if (req.certainlySteps(/* computed separately */)) return false;
        
      }
      
      return false; // No Req is able to loop, so `this` AllParser is unable to loop
      
      /*
      if (this.reqs.length === 0) return false;
      
      // TODO: I'm confused... only `this.reqs[0]` is relevant? It either might loop, or always
      // consumes (there is no other possibility??) - if it might loop, the AllParser might loop;
      // if it always consumes, the AllParser always consumes??? Proof??
      // THE OVERSIGHT HERE was that there's a difference between *halting* and *stepping*; halting
      // can happen without consuming any input, but just because a Req halts doesn't mean the
      // AllParser halts - whereas as soon as any Req is known to always step, we can be certain
      // the entire AllParser cannot loop ("loop" entails no stepping occurs within the cycle)
      
      // Consider:
      //    | let [ r0, r1 ] = this.reqs;
      //    | r0.certainlyHalts() === true
      //    | r1.somtimesLoops() === true
      // Even though a loop exists via `r1`, `this` still always halts beforehand via `r0`
      
      // Consider:
      //    | let [ r0, r1 ] = this.reqs;
      //    | r0.sometimesLoops() === true
      //    | r1.certainlyHalts() === true
      // Even though `r1` will consume, `this` still may empty loop beforehand via `r0`
      
      return this.reqs[0].sometimesLoops();
      */
      
    },
    certainlySteps(seen=Set()) {
      
      if (seen.has(this)) return false;
      seen.add(this);
      
      for (let req of this.reqs) if (req.certainlySteps(seen)) return true;
      return false;
      
    },
    getDelegates() {
      
      let ret = [];
      for (let req of this.reqs) {
        
        // Include the always-consuming Req, but nothing after it; "delegate" implies a downstream
        // Parser which is reachable without any stepping (or the Parser which certainly steps; in
        // this case the Parser always terminates the delegation chain)
        ret.push(req);
        if (req.certainlySteps()) break;
        
      }
      return ret;
      
    },
    
    // Normalization
    clone(map=Map()) {
      
      if (map.has(this)) return map.get(this);
      
      let all = AllParser({ ...this, reqs: [] });
      map.set(this, all);
      
      for (let req of this.reqs) all.addReq(req.clone(map));
      
      return all;
      
    },
    simplify(seen=Set()) {
      
      // TODO: HEEERE look at that output :( this is tricky!
      
      console.log('SIMPLIFY', seen.has(this), this.desc());
      
      if (seen.has(this)) return this;
      seen.add(this);
      
      let gatherDirectlyNestedReqs = function*(all, seenAlls=Set()) {
        
        if (seenAlls.has(all)) return;
        seenAlls.add(all);
        
        for (let req of all.reqs) {
          if (isForm(req, AllParser)) yield* gatherDirectlyNestedReqs(req, seenAlls);
          else                        yield req;
        }
        
      };
      
      // Simplify all Reqs
      this.reqs = gatherDirectlyNestedReqs(this).toArr(req => req.simplify(seen));
      
      // Note the existence of "intractable" loops which are trivial, but can't be determined to
      // either Yield or Return:
      //    | let any0 = any([]);
      //    | let all0 = all([]);
      //    | any0.addOpt(all0);
      //    | all0.addReq(any0);
      // This can always (?) be detected by checking, after recursively simplifying, whether:
      //    | this.reqs.length === 1 && this.reqs[0] === this
      // Any inner Parsers will have already been simplified; if it was an All or Any with only one
      // Kid, that Kid will be returned in place of the All/Any; if the tight loop exists, the Kid
      // will be `this`!
      
      // Factor out irrelevant AllParser
      if (this.reqs.length === 0) return YieldParser({ lang: this.lang }); // An All without Reqs yields immediately
      if (this.reqs.length === 1) return (this === this.reqs[0]) ? Error('Trivial loop').propagate() : this.reqs[0];
      return this;
      
    },
    
    // Parsing
    * run0(src) {
      
      let { reqs } = this;
      let allTrgChains = function*(src, chain=[]) {
        
        if (chain.length === reqs.length) return yield chain;
        
        // The Req at the current index (determined by the current `chain`) may yield multiple
        // parsings; for each such parsing, every following Req must, in sequence, be allowed to
        // attempt parsing the remainder of the Src 
        for (let cur of reqs[chain.length].run(src))
          yield* allTrgChains(src.advance(cur), [ ...chain, cur ]);
        
      };
      
      for (let reqTrgs of allTrgChains(src)) yield Parser.Trg({ prs: this, trgs: reqTrgs });
      
    },
    
  })});
  let RepeatParser = form({ name: 'RepeatParser', has: { CompoundParser }, props: (forms, Form) => ({
    
    init({ kid, minReps=0, maxReps=Infinity, ...cfg }) {
      
      kid = kid || NeverParser({ lang: cfg.lang }); // Anything falsy resolves to `null`
      
      for (let [ numName, num ] of { minReps, maxReps }) {
        if (!isForm(num, Number)) throw Error(`${numName} param must be number`).mod({ [numName]: num });
        if (num < 0)              throw Error(`${numName} param must be >= 0`).mod({ [numName]: num });
      }
      
      if (kid && !hasForm(kid, Parser)) throw Error('Kid param must be parser').mod({ kid });
      if (minReps >= Infinity)          throw Error('Min-reps param must be number').mod({ minReps });
      if (maxReps < 1)                  throw Error('Max-reps param must be >= 1').mod({ maxReps });
      if (maxReps < minReps)            throw Error('Max-reps param must be greater than min-reps').mod({ minReps, maxReps });
      
      forms.CompoundParser.init.call(this, cfg);
      Object.assign(this, { kid, minReps, maxReps });
      
    },
    
    // Compound
    getCompoundKids() { return this.kid ? [ this.kid ] : []; },
    setKid(kid) { this.kid = kid; return { rep: this, kid }; },
    
    // Recursive overview
    sometimesLoops(seen=Set()) {
      
      if (seen.has(this)) return true;
      seen.add(this);
      
      // Repetitions are irrelevant; like an AllParser, the first delegation to `this.kid` fully
      // determines the haltiness of `this` RepeatParser
      return this.kid?.sometimesLoops() ?? false;
      
    },
    certainlySteps(seen=Set()) {
      
      if (seen.has(this)) return false;
      seen.add(this);
      
      if (this.minReps === 0) return false;
      return this.kid?.certainlySteps() ?? false;
      
    },
    getDelegates() { return this.kid ? [ this.kid ] : []; },
    
    // Normalization
    clone(map=Map()) {
      
      if (map.has(this)) return map.get(this);
      
      let rep = RepeatParser({ ...this, kid: null });
      map.set(this, rep);
      
      if (this.kid) rep.setKid(this.kid.clone(map));
      
      return rep;
      
    },
    simplify(seen=Set()) {
      
      if (seen.has(this)) return this;
      seen.add(this);
      
      let [ minReps, maxReps ] = [ 1, 1 ];
      
      let toFirstNonRepKid = this; // The "to" language implies it "resolves to" (the first non-RepeatParser Kid)
      while (isForm(toFirstNonRepKid, RepeatParser)) {
        minReps *= toFirstNonRepKid.minReps;
        maxReps *= toFirstNonRepKid.maxReps;
        toFirstNonRepKid = toFirstNonRepKid.kid;
      }
      
      Object.assign(this, { minReps, maxReps, kid: toFirstNonRepKid.simplify(seen) });
      
      // Factor out irrelevant RepeatParser (where minReps = maxReps = 1)
      if (this.maxReps === 1 && this.minReps === 1)
        return (this === this.kid)
          ? Error('Trivial loop').propagate()
          : this.kid;
      
      return this;
      
    },
    
    // Parsing
    * run0(src) {
      
      let { minReps, maxReps, kid } = this;
      if (!kid) return yield Form.Trg({ prs: this, str: '' });
      
      let allTrgChains = function*(src, chain=[]) {
        
        if (chain.length > maxReps) return; // No more parsing after `maxReps` exceeded
        
        // If the current `chain` meets the minimum size, yield it; it's already a valid parsing,
        // even if it's possible for the Kid to successfully repeat (resulting in another parsing)
        if (chain.length >= minReps) yield chain;
        
        // Try to extend the chain with additional repetitions
        for (let cur of kid.run(src))
          yield* allTrgChains(src.advance(cur), [ ...chain, cur ]);
        
      };
      
      for (let kidTrgs of allTrgChains(src)) yield Form.Trg({ prs: this, trgs: kidTrgs });
      
    },
    
    // Observability
    getVisualizeArgs() {
      let [ min, max ] = [ this.minReps, this.maxReps ].map(v => v === Infinity ? 'inf' : v.toString());
      return `[${min}:${max}]`;
    },
    getVisualizeParams() {
      return [
        ...forms.CompoundParser.getVisualizeParams.call(this),
        `min=${this.minReps}`,
        `max=${this.maxReps}`
      ];
    }
    
  })});
  
  return { Language };
  
})();

(async () => {
  
  /** @type HutNodejsParse.LanguageForm */
  let Language = lib.Language;
  
  // Simplification tests
  (() => {
    
    let simplifyTests = [
      { name: 'simple Anys',
        genParser: () => Language({ name: 'test' }).any([]),
        expected: 'never()'
      },
      { name: 'nested Anys 2x',
        genParser: () => {
          let lang = Language({ name: 'test' });
          let any1 = lang.any([]);
          let any2 = any1.addOpt(lang.any([])).opt;
          any2.addOpt(lang.tok('a'));
          return any1;
        },
        expected: 'tok(a)'
      },
      { name: 'nested Anys 3x',
        genParser: () => {
          let lang = Language({ name: 'test' });
          let any1 = lang.any([]);
          let any2 = any1.addOpt(lang.any([])).opt;
          let any3 = any2.addOpt(lang.any([])).opt;
          any3.addOpt(lang.tok('a'));
          return any1;
        },
        expected: 'tok(a)'
      },
      { name: 'nested Anys 3x, multiple opts as siblings',
        genParser: () => {
          let lang = Language({ name: 'test' });
          let any1 = lang.any([]);
          let any2 = any1.addOpt(lang.any([])).opt;
          let any3 = any2.addOpt(lang.any([])).opt;
          any3.addOpt(lang.tok('a'));
          any3.addOpt(lang.reg('[c-e]'));
          return any1;
        },
        expected: `any(tok(a),reg('[c-e]'))`
      },
      { name: 'nested Anys 4x, multiple opts at different levels',
        genParser: () => {
          let lang = Language({ name: 'test' });
          
          let any1 = lang.any([]);
          any1.addOpt(lang.tok('a'));
          
          let any2 = any1.addOpt(lang.any([])).opt;
          
          let any3 = any2.addOpt(lang.any([])).opt;
          any3.addOpt(lang.tok('b'));
          any3.addOpt(lang.tok('c'));
          
          let any4 = any3.addOpt(lang.any([])).opt;
          any4.addOpt(lang.tok('d'));
          
          return any1;
        },
        expected: `any(tok(a),tok(b),tok(c),tok(d))`
      },
      { name: 'nested Anys 4x and looping, multiple opts at different levels',
        genParser: () => {
          let lang = Language({ name: 'test' });
          
          let any1 = lang.any([]);
          any1.addOpt(lang.tok('a'));
          
          let any2 = any1.addOpt(lang.any([])).opt;
          
          let any3 = any2.addOpt(lang.any([])).opt;
          any3.addOpt(lang.tok('b'));
          any3.addOpt(lang.tok('c'));
          
          let any4 = any3.addOpt(lang.any([])).opt;
          any4.addOpt(lang.tok('d'));
          
          // VERY cyclical!
          for (let anyA of [ any1, any2, any3, any4 ])
            for (let anyB of [ any1, any2, any3, any4 ])
              anyA.addOpt(anyB);
          
          return any1;
        },
        expected: `any(tok(a),tok(b),tok(c),tok(d))`
      },
      
      { name: 'simple All',
        genParser: () => Language({ name: 'test' }).all([]),
        expected: 'yield()'
      },
      { name: 'nested Alls 2x',
        genParser: () => {
          let lang = Language({ name: 'test' });
          let all1 = lang.all([]);
          let all2 = all1.addReq(lang.all([])).req;
          all2.addReq(lang.tok('a'));
          return all1;
        },
        expected: 'tok(a)'
      },
      { name: 'nested Alls 3x',
        genParser: () => {
          let lang = Language({ name: 'test' });
          
          let all1 = lang.all([]);
          all1.addReq(lang.tok('a'));
          
          let all2 = all1.addReq(lang.all([])).req;
          all2.addReq(lang.tok('b'));
          
          let all3 = all2.addReq(lang.all([])).req;
          all3.addReq(lang.tok('c'));
          
          return all1;
        },
        expected: 'all(tok(a),tok(b),tok(c))'
      },
      { name: 'nested Alls looping',
        genParser: () => {
          let lang = Language({ name: 'test' });
          let all1 = lang.all([]);
          let all2 = all1.addReq(lang.all([])).req;
          let all3 = all2.addReq(lang.all([])).req;
          all3.addReq(all1);
          return all1;
        },
        expected: Error('AllParsers nest each other')
      },
      
      { name: 'simple Rep',
        genParser: () => Language({ name: 'test' }).rep({}),
        expected: 'rep([0:inf]never())'
      },
      { name: 'nested Reps 2x',
        genParser: () => {
          let { rep, tok } = Language({ name: 'test' }).fns();
          let rep1 = rep({ minReps: 1, maxReps: 2 });
          let rep2 = rep1.setKid(rep({ minReps: 2, maxReps: 3 })).kid
          rep2.setKid(tok('a'));
          return rep1;
        },
        expected: 'rep([2:6]tok(a))'
      },
      
      { name: 'trivial loop 1',
        genParser: () => {
          
          let { any, all, rep, tok } = Language({ name: 'test' }).fns();
          
          // let any1 = any([]);
          // any1.addOpt(tok('a'));
          // let all1 = any1.addOpt(all([])).opt;
          // let all2 = all1.addReq(all([])).req;
          // let any2 = all2.addReq(any([])).req;
          // any2.addOpt(any1);
          
          //let all1 = all([]);
          //let all2 = all1.addReq(all([])).req;
          //let any2 = all2.addReq(any([])).req;
          //let any1 = any2.addOpt(any([])).opt;
          //any1.addOpt(tok('a'));
          //any1.addOpt(all1);
          
          let anyy = any([]);
          let alll = all([]);
          
          anyy.addOpt(alll);
          alll.addReq(anyy);
          
          return anyy;
          
        },
        expected: Error('Trivial loop')
      },
      { name: 'trivial loop 1',
        genParser: () => {
          
          let { any, all, rep, tok } = Language({ name: 'test' }).fns();
          
          let any1 = any([]);
          let any2 = any([]);
          let all1 = all([]);
          let all2 = all([]);
          
          any1.addOpt(all1);
          all1.addReq(any2);
          any2.addOpt(all2);
          all2.addReq(any1);
          
          return any1;
          
        },
        expected: Error('Trivial loop')
      },
      
      { name: 'mixed 1',
        genParser: () => {
          
          let { any, all, rep, tok } = Language({ name: 'test' }).fns();
          
          let any1 = any([]);
          let all1 = any1.addOpt(all([])).opt;
          let all2 = all1.addReq(all([])).req;
          let any2 = all2.addReq(any([])).req;
          any2.addOpt(any1);
          any2.addOpt(tok('a'));
          
          return any1;
          
        },
        expected: ''
      }
    ];
    
    for (let { name, genParser, expected } of simplifyTests) {
      
      if (name !== 'mixed 1') continue;
      
      if (hasForm(expected, Error)) {
        
        let gotError = true;
        try { genParser().simplify(); gotError = false; } catch (err) {
          
          if (!err.message.includes(expected.message))
            throw Error('Test failed as expected, but with unexpected error').mod({
              name, received: err.message, expected: expected.message
            });
          
        }
        
        if (!gotError) throw Error('Test was expected to fail, but it passed').mod({
          name, received: '<success>', expected: expected.message
        });
        
      } else {
        
        let parser = genParser();
        let received = parser.simplify().desc().replaceAll(' ', '');
        if (received !== expected) throw Error('Test succeeded as expected but with wrong result').mod({ name, received, expected });;
        
      }
      
    }
    
    gsc('Simplification tests passed');
    
  })();
  
  return;
  
  let toy = () => {
    
    let lang = Language({ name: 'toy' });
    let { yld, nvr, tok, reg, all, any, rep } = lang.fns();
    
    let main = any([]);
    main.addOpt(tok('str', 'ab-'));
    
    let rep1 = rep('rep1', { minReps: 2, maxReps: 4, kid: main });
    let rep2 = rep('rep2', { minReps: 1, maxReps: 5, kid: rep1 });
    gsc('PARSE', rep2.parse('ab-ab-ab-ab-'));
    
  };
  
  let anyLr = () => {
    
    let lang = Language({ name: 'toy' });
    let { yld, nvr, tok, reg, all, any, rep } = lang.fns();
    
    let any1 = any('one', []);
    let any2 = any('two', []);
    let any3 = any('thr', []);
    
    any1.addOpt(any1);
    any1.addOpt(any2);
    any1.addOpt(any3);
    
    any2.addOpt(any1);
    any2.addOpt(any3);
    
    any3.addOpt(any2);
    any3.addOpt(any3);
    any3.addOpt(rep(any1));
    
    any1.addOpt(tok('x'));
    any2.addOpt(tok('y'));
    any3.addOpt(tok('z'));
    
    gsc('BEFORE', any1.visualize());
    
    let norm = any1.normalize();
    gsc('NORM:', norm.visualize());
    
    gsc(norm.parse('xzyz'));
    
  };
  
  let mathLr = () => {
    
    let lang = Language({ name: 'math' });
    let { yld, nvr, tok, reg, all, any, rep } = lang.fns();
    
    let num = any([]);
    num.addOpt(reg('num', '[1-9][0-9]*'));
    num.addOpt(all('brk', [ tok('('), num, tok(')') ]));
    num.addOpt(all('add', [ num, tok('+'), num ]));
    num.addOpt(all('sub', [ num, tok('-'), num ]));
    
    return num;
    
    //gsc('ORIG', num.visualize());
    
    //num = num.normalize();
    
    //gsc('NORM', num.visualize());
    
    //gsc('PARSE', num.normalize().parse('1+10+12'));
    
  };
  
  let mathNorm = () => {
    
    let lang = Language({ name: 'math' });
    let { yld, tok, reg, all, any, rep } = lang.fns();
    
    let normStep = any([]);
    let normLoop = any([ yld() ]);
    let norm = all([ normStep, normLoop ]);
    
    normStep.addOpt(reg('num', '[1-9][0-9]*'));
    normStep.addOpt(all('brk', [ tok('('), norm, tok(')') ]));
    
    normLoop.addOpt(all('add', [ /* first value NORMALIZED AWAY */ tok('+'), norm ]));
    normLoop.addOpt(all('sub', [ /* first value NORMALIZED AWAY */ tok('-'), norm ]));
    
    let parsed = norm.parse('1-1-1-1-1');
    gsc('STRUCTURE', parsed);
    gsc(`Parsed: "${parsed.str}"`);
    
  };
  
  let trickyLr = () => {
    
    let lang = Language({ name: 'math' });
    let { yld, tok, reg, all, any, rep } = lang.fns();
    
    let obj = any([]);
    obj.addOpt(tok('a'));
    obj.addOpt(tok('b'));
    
    let val = any([]);
    val.addOpt(obj);
    val.addOpt(all([ tok('<'), val, tok('>') ]));
    val.addOpt(all([ val, tok('#'), val ]));
    val.addOpt(all([ rep(tok('&')), rep(tok('$')), val, tok('!'), val ]));
    
  };
  
  let trickyNorm = () => {
    
    let lang = Language({ name: 'math' });
    let { yld, tok, reg, all, any, rep } = lang.fns();
    
    // `val` from `trickyLr` is conceptually `supernorm` here
    // There are still "step" and "loop" parser pairs, but this time there are multiple pairs, and
    // some can only be accessed by specific state-machine paths (reflecting the fact that Alls
    // make it impossible to access certain paths unless prefix Reqs have already passed)
    
    // Note that for each step+loop pair, the steps are always the same - these reflect the
    // immediately-stepping state-machine paths! (E.g. simply numeric tokens in "math").
    
    let steps = any([]);
    obj.addOpt(tok('a'));
    obj.addOpt(tok('b'));
    
    let supernorm = any([]);
    let trackNorm = fn => {
      
      let step = any([]);
      let loop = any([ yld() ]);
      let norm = all([ step, loop ]);
      
      supernorm.addOpt(norm);
      
      fn({ step, loop, norm, addEntries: ents => norm.reqs = [ ...ents, ...norm.reqs ] });
      
    };
    
    let obj = any([]);
    obj.addOpt(tok('a')).opt;
    obj.addOpt(tok('b')).opt;
    
    let brk = all([ tok('<'), val, tok('>') ]);
    
    let simpleSteps = [];
    simpleSteps.push(obj);
    simpleSteps.push(brk);
    
    // HANDLE `val.addOpt(all([ val, tok('#'), val ]));`
    (() => {
      
      trackNorm(({ step, loop }) => {
        
        for (let s of simpleSteps) step.addOpt(s);
        
        loop.addOpt(all([ tok('#'), supernorm ]));
        
      });
      
    })();
    
    // HANDLE `val.addOpt(all([ rep(tok('&')), rep(tok('$')), val, tok('!'), val ]));`
    // Note that the Delegates are `[ rep(tok('&')), rep(tok('$')), val ]`
    (() => {
      
      // Consider the case where we skip Delegates #1 and #2 (leaving only `val`)
      // This means the troublesome Opt is really just `all([ val, tok('!'), val ])` - which we
      // know how to handle! It's exactly like `all([ val, tok('#'), val ])`!
      
      // Overall we pick to skip delegates like so, in turn:
      //   1     2
      // - SKIP  SKIP
      // - SKIP  TAKE
      // - TAKE  SKIP
      // - TAKE  TAKE
      
      trackNorm(({ step, loop, addEntries }) => {
        
        for (let s of simpleSteps) step.addOpt(s);
        loop.addOpt(all([ tok('!'), supernorm ]));
        
      });
      
      // Skip only Delegate #1! This creates an "entry" before `val` gets reached:
      
      trackNorm(({ step, loop, addEntries }) => {
        
        // This *must* run before any of the "steps"
        addEntries([ rep({ minReps: 1, kid: tok('&') }) ]);
        
        for (let s of simpleSteps) step.addOpt(s);
        
        loop.addOpt(all([ tok('!'), supernorm ]));
        
      });
      
      // Skip only Delegate #2! This creates an "entry" before `val` gets reached:
      
      trackNorm(({ step, loop, addEntries }) => {
        
        // This *must* run before any of the "steps"
        addEntries([ rep({ minReps: 1, kid: tok('$') }) ]);
        
        for (let s of simpleSteps) step.addOpt(s);
        
        loop.addOpt(all([ tok('!'), supernorm ]));
        
      });
      
      // Skip *no* Delegates! This creates multiple always-stepping entries:
      
      trackNorm(({ step, loop, addEntries }) => {
        
        // This *must* run before any of the "steps"
        addEntries([
          rep({ minReps: 1, kid: tok('&') }),
          rep({ minReps: 1, kid: tok('$') })
        ]);
        
        for (let s of simpleSteps) step.addOpt(s);
        
        loop.addOpt(all([ tok('!'), supernorm ]));
        
      });
      
    })();
    
    // Add all certainly-stepping items to `normStep`, unchanged (TODO: is there *always* a
    // certainly-stepping item? I think the answer is "somehow, yes"!)
    norm1.step.addOpt(obj);
    norm1.step.addOpt();
    
    // Add sometimes-looping items to `normLoop`, but they are *modified*: they cannot Delegate
    // back to `norm`!
    norm1.loop.add(all([ tok('#'), supernorm ]));
    
    // Deal with `val.addOpt(all([ rep(item1), val, tok('!'), val ]));`
    // To deal with the `rep` (with `minReps=0`) we'll create two branches: one where the `rep`
    // *must* consume, by upping its `minReps` to `1`, and another where it doesn't exist at all
    // (to capture the case where 0 repetitions are used)
    // - The `rep(item1)` may not step, allowing the 1st `val` to form an LR loop
    // - Every item in the 
    norm1.loop.add(all([ tok('!'), val ])); // rep x 0
    
    loop.add(all([ rep({ minReps: 1, kid: tok('$') }), tok('!'), val ])); // any other number of reps
    
    let testInput = [
      '<a>',
      '<<a>>',
      'a#b',
      '$$$$b!a',
      '$$$$<b>!a',
      '$$$$<b>!<$a!a>',
    ];
    
  };
  
  let js = () => {
    
    let lang = Language({ name: 'js' });
    let { yld, nvr, tok, reg, all, any, rep } = lang.fns();
    
    let value = any('value', []);
    
    let inlineValue = any({ name: 'inlineValue', opts: [] });
    inlineValue.addOpt(tok('null'));
    inlineValue.addOpt(tok('undefined'));
    inlineValue.addOpt(any('boolean', [ tok('true'), tok('false') ]));
    inlineValue.addOpt(reg('binInt',  '[+-]?0b[0-1]+'));
    inlineValue.addOpt(reg('octInt',  '[+-]?0[0-7]+'));
    inlineValue.addOpt(reg('hexInt',  '[+-]?0x[0-9a-fA-F]+'));
    inlineValue.addOpt(reg('decInt',  '[+-]?[0-9]+'));
    inlineValue.addOpt(reg('decFlt',  '[+-]?[0-9]+[.][0-9]+'));
    inlineValue.addOpt(reg('varName', '[a-zA-Z$_][a-zA-Z0-9$_]*'));
    
    value.addOpt(inlineValue);
    
    let inlineString = any({ name: 'inlineString', opts: [] });
    inlineString.addOpt(all([
      tok(`'`),
      reg(`([^${'\\'}${'\n'}${`'`}]|[\\].)*`, { z: true }), // (non-backslash, non-newline, non-single-quote) OR (backslash followed by anything)
      tok(`'`),
    ]));
    inlineString.addOpt(all([
      tok('"'),
      reg(`([^${'\\'}${'\n'}${'"'}]|[\\].)*`, { z: true }), // (non-backslash, non-newline, non-double-quote) OR (backslash followed by anything)
      tok('"'),
    ]));
    inlineString.addOpt(all([
      tok('`'),
      reg(`([^${'\\'}${'`'}]|[\\].)*`, { z: true }), // (non-backslash, non-backtick) OR (backslash followed by anything)
      tok('`'),
    ]));
    
    inlineValue.addOpt(inlineString);
    
    let binaryOp = any({ name: 'binaryOp', opts: [] });
    binaryOp.addOpt(all({ name: 'add', reqs: [ value, tok('+'), value ] }));
    binaryOp.addOpt(all({ name: 'sub', reqs: [ value, tok('-'), value ] }));
    binaryOp.addOpt(all({ name: 'mlt', reqs: [ value, tok('*'), value ] }));
    binaryOp.addOpt(all({ name: 'div', reqs: [ value, tok('/'), value ] }));
    binaryOp.addOpt(all({ name: 'exp', reqs: [ value, tok('**'), value ] }));
    
    value.addOpt(binaryOp);
    
    let valueNorm = value.normalize();
    gsc('NORM', valueNorm);
    
    process.exit(0);
    
  };
  
  ({ toy, mathLr, mathNorm, anyLr, js, trickyLr, trickyNorm }['mathNorm'])();
  
  process.exit(0);
  
  if (0) { /*
    
    value -> binaryOp -> add -> value
    
    value -> (binaryOp -> add) * n -> (value - binaryOp)
    
    // LR 1:
    let value = any([]);
    
    value.addOpt(reg('[1-9][0-9]*'));
    
    let binaryOp = any([]);
    
    let add = all([ value, tok('+'), value ]);
    binaryOp.addOpt(add);
    
    let sub = all([ value, tok('-'), value ]);
    binaryOp.addOpt(sub);
    
    value.addOpt(binaryOp);
    
    // NORMALIZED 1:
    let repeatable = any([]);
    let value0 = any([]);
    let value = all(value0, repeatable); // The main `value`!
    
    value0.addOpt(reg('[1-9][0-9]*'));
    
    // `binaryOp` now acts like options for "repeatable suffixes"
    let binaryOp = any([]);
    
    // Note the leading `value` has been REMOVED
    let add = all([ tok('+'), value ]);
    binaryOp.addOpt(add);
    
    // Note the leading `value` has been REMOVED
    let sub = all([ tok('-'), value ]);
    binaryOp.addOpt(sub);
    
    repeatable.addOpt(binaryOp);
    
    // LR 2:
    let value = any([]);
    
    value.addOpt(reg('[1-9][0-9]*([.][0-9]+)?')); // floats
    
    let binaryOp = any([]);
    
    let add = all([ value, tok('+'), value ]);
    binaryOp.addOpt(add);
    
    let sub = all([ value, tok('*'), value ]);
    binaryOp.addOpt(sub);
    
    value.addOpt(binaryOp);
    
    // Here's the tricky shiz:
    let brk = all([ tok('('), value, tok(')') ]);
    value.addOpt(brk);
    
    // NORMALIZED 2:
    let repeatable = any([]);
    let value0 = any([]);
    let value = all(value0, repeatable); // The main `value`!
    
    value0.addOpt(reg('[1-9][0-9]*([.][0-9]+)?'));
    
    let binaryOp = any([]);
    
    let add = all([ tok('+'), value ]);
    binaryOp.addOpt(add);
    
    let sub = all([ tok('-'), value ]);
    binaryOp.addOpt(sub);
    
    repeatable.addOpt(binaryOp);
    
    // No LR here - this `all` always consumes, because its first child always consumes!!!
    value0.addOpt(all([ tok('('), value0, tok(')') ]));
    
    // LR 3:
    let value = any([]);
    
    let inlineValue = any([]);
    inlineValue.addOpt(reg('[a-zA-Z]+'));
    inlineValue.addOpt(value);            // Doesn't really make sense, but should be tolerated??
    
    value.addOpt(inlineValue);
    value.addOpt(all([ tok('('), value, tok(')') ]));
    
    // NORMALIZED 3:
    let value = any([]);
    
    let inlineValue = any([]);
    inlineValue.addOpt(reg('[a-zA-Z]+'));
    // Literally just *DELETE* `inlineValue.addOpt(value)` - `value` can already be reached within the cycle!
    
    value.addOpt(inlineValue);
    value.addOpt(all([ tok('('), value, tok(')') ]));
    
    // CYCLE BREAK:
    - Note that the cycle must contain at least one AnyParser, at least one AllParser, and zero or
      more RepeatParsers
    - RepeatParsers are not relevant to the chain as their haltiness is equal to the haltiness of
      their Kid, so they can, in this context, logically be replaced with their Kid
    - Minimum one AnyParser: if the cycle (ignoring RepeatParsers) only consisted of AllParsers we
      are guaranteed to either empty loop, or consume zero or infinite tokens: AllParsers always
      delegate to all their Reqs, so a chain of only AllParsers never stops delegating - unless to a
      RepeatParser with 0 minReps, in which case zero tokens are consumed
    - At least one AllParser: ????? MAYBE FALSE ?????
    
    
    - Note the cycle: "value" -> "binaryOp" -> "add" -> "value"
    - Note that if `value` is the Parser being normalized, the furthest we can break this chain is
      when `add` loops back to `value`, at the "add" -> "value" step (I claim breaking at the
      furthest point produces the most intuitive results)
    - The idea is to produce this parser setup instead:
    
    */
    
    /*
    // of the "plane" is probably hard to stretch to the normalized parser topology?
    // TODO: Implementing this could be funky when normalization is being factored in, e.g. the idea
    let htmlEnt = all([
      token('<'),
      reg('(?<tagName>[a-zA-Z0-9]+)'),
      rep(all([ reg('[a-zA-Z]+'), tok('='), tok('"'), reg('[^"]+'), tok('"') ])),
      token('>'),
      
      token('</'),
      reg('(!<tagName>)'),
      token('>')
    ]);
    
  */ }
  
})()
  .catch(err => gsc('FATAL', err));