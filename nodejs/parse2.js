/// <reference path="../ts/hut.d.ts" />
'use strict';

require('../room/setup/clearing/clearing.js');
require('./util/installV8ErrorStacktraceHandler.js')();
require('./util/installTopLevelHandler.js')();

// Foundation
(() => {
  
  global.formatAnyValue = require('./util/formatAnyValue.js');
  global.subconOutput = require('./util/getStdoutSubconOutputter.js')();
  
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
      
      if (true || opts.some(v => str.has(v))) {
        console.log(`[${a}:${b}] x [${c}:${d}]`);
        console.log(visual);
      }
      
    } else if (type === 'compare') {
      
      let { visual: v1 } = getResults(() => rangePowerSet({ start: a, end: b }, { start: c, end: d }));
      let { visual: v2 } = getResults(() => rangePowerSetAwful({ start: a, end: b }, { start: c, end: d }));
      
      if (v1 !== v2) {
        
        console.log('OW');
        console.log(`[${a}:${b}] x [${c}:${d}]`);
        console.log(`??: ${v1}\n!!: ${v2}\n\n`);
        
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
    
    nop(...cfg) { return    NopParser({ lang: this, ...cfg }); },
    tok(...cfg) { return  TokenParser({ lang: this, ...Form.resolveCfg('token', String, cfg) }); },
    reg(...cfg) { return  RegexParser({ lang: this, ...Form.resolveCfg('regex', String, cfg) }); },
    any(...cfg) { return    AnyParser({ lang: this, ...Form.resolveCfg('opts',  Array,  cfg) }); },
    all(...cfg) { return    AllParser({ lang: this, ...Form.resolveCfg('reqs',  Array,  cfg) }); },
    rep(...cfg) { return RepeatParser({ lang: this, ...Form.resolveCfg('!kid',  Parser, cfg) }); },
    
    fns() { return 'nop,tok,reg,any,all,rep'.split(',').toObj(v => [ v, this[v].bind(this) ]); }
    
  })});
  
  let Parser = form({ name: 'Parser', props: (forms, Form) => ({
    
    init({ lang, name, ...cfg }) {
      
      if (!isForm(lang, Language)) throw Error('Lang param must be a language').mod({ lang });
      if (!cfg.empty()) throw Error('Unexpected config').mod({ cfg });
      
      Object.assign(this, { lang, name });
      
    },
    
    sometimesLoops(...args) { throw Error('Not implemented'); /* Note that stepping breaks loops */ },
    certainlyHalts(...args) { return !this.sometimesLoops(...args); },
    certainlySteps(...args) { throw Error('Not implemented'); },
    
    getEstimatedComplexity() { return 1; },
    normalize() { throw Error('Not implemented'); /* Returns an equivalent, but normalized, Parser - should not mutate anything */ },
    clone(...args) { throw Error('Not implemented'); },
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
    * getDelegationChains(chain=[]) {
      
      // Yields all possible delegation chains beginning with this Parser
      
      // Note that a "delegation chain" implies an array of Parsers which may consume zero tokens,
      // and ending with a Parser that either always consumes at least one token, or which has
      // already been seen in the chain (implying that the chain is cyclical). Note that no chain
      // will ever contain multiple instances of the same Parser, with the exception of the case
      // where the final Parser has already appeared earlier in the chain!
      
      throw Error('Not implemented');
      
    },
    getTerm() { return getFormName(this).slice(0, 3).lower(); },
    visualize(seen=Set()) { throw Error('not implemented'); },
    
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
  
  let NopParser = form({ name: 'NopParser', has: { Parser }, props: (forms, Form) => ({
    
    init(cfg) { forms.Parser.init.call(this, cfg); },
    
    sometimesLoops() { return false; },
    certainlySteps() { return false; }, // In fact, a NopParser *never* steps (nor does it loop)
    
    * getDelegationChains(chain=[]) { yield [ ...chain, this ]; },
    desc() { return this.name || 'Nop'; }
    
  })});
  
  let ImmediateParser = form({ name: 'ImmediateParser', has: { Parser }, props: (forms, Form) => ({
    
    // Note that ImmediateParsers are immutable
    
    init({ sgs=false /* "strip global seqs" */, ...cfg }) {
      
      forms.Parser.init.call(this, cfg);
      Object.assign(this, { sgs });
      
    },
    clone(...args) { return this; },
    * getDelegationChains(chain=[]) { yield [ ...chain, this ]; }, // ImmediateParsers don't delegate (could also call them "Terminal" parsers, or "Leaf" parsers)
    normalize() { return this; },
    visualize() { return this.desc(); }
    
  })});
  let TokenParser = form({ name: 'TokenParser', has: { ImmediateParser }, props: (forms, Form) => ({
    
    init({ token, ...cfg }) {
      
      if (!isForm(token, String)) throw Error('Token param must be a string').mod({ token });
      if (token.length === 0)     throw Error('Token must not be empty string').mod({ token });
      
      forms.ImmediateParser.init.call(this, cfg);
      Object.assign(this, { token });
      
    },
    
    sometimesLoops() { return false; },
    certainlySteps() { return true; },
    * run0(src) {
      if (src.str.hasHead(this.token)) yield Parser.Trg({ prs: this, str: this.token });
    },
    desc() { return this.name || `Tok(${this.token})`; }
    
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
    
    sometimesLoops() { return false; },
    certainlySteps() { return !this.z; }, // Steps if non-zeroable (`this.z`)
    * run0(input) {
      let [ match ] = input.str.match(this.regex) ?? [];
      if (match) yield Parser.Trg({ prs: this, str: match });
    },
    desc() {
      return this.name || `Reg('${this.regex.toString().slice(3, -2)}')`; // Slice off "/^(" at the front and ")/" at the end (note: could be unexpected if user supplied e.g. "^abc" without brackets)
    }
    
  })});
  
  let DelegatingParser = form({ name: 'DelegatingParser', has: { Parser }, props: (forms, Form) => ({
    
    getDelegates() { throw Error('Not implemented'); },
    * getDelegationChains(chain=[]) {
      
      let dlgChain = [ ...chain, this ];
      if (chain.has(this)) return yield dlgChain;;
      
      for (let dlg of this.getDelegates()) yield* dlg.getDelegationChains(dlgChain);
      
    },
    desc(seen=Set()) {
      if (seen.has(this)) return `<cyc ${this.name || this.getTerm()}>`;
      seen.add(this);
      return this.name || `${this.getTerm()}(${this.getDelegates().map(d => d.desc(seen)).join(', ') || '<empty>'})`;
    },
    normalize() {
      
      let mut = this.clone(); // "mutable"
      
      let getNextLrChain = delegatingParser => {
        
        // Find next LR chain...
        for (let chain of delegatingParser.getDelegationChains()) {
          
          if (chain.length < 2) throw Error('Whoa... chain is too short??').mod({ chain });
          
          let lastInd = chain.length - 1;
          let last = chain.at(-1);
          let ind = chain.indexOf(last);
          if (ind < lastInd) return chain.slice(ind); // Return the cyclical part of the chain (ignore any linear prefix)
          
        }
        
        return null; // No LR chain found
        
      };
      let traverse = (parser, fn, par=null, seen=Set()) => {
        
        if (seen.has(parser)) return;
        seen.add(parser);
        
        // Allow consumer to process this `par` and `parser`
        let proceed = fn(parser, par);
        if (!isForm(proceed, Boolean)) throw Error('Traverse function returned non-boolean').mod({ fn: fn.toString() });
        if (!proceed) return;
        
        if (!hasForm(parser, DelegatingParser)) return;
        
        // Traverse based on the type of DelegatingParser
        let name = parser.getTerm();
        if (name === 'any')               for (let opt of parser.opts) traverse(opt, fn, parser, seen);
        if (name === 'all')               for (let req of parser.reqs) traverse(req, fn, parser, seen);
        if (name === 'rep' && parser.kid)                              traverse(parser.kid, fn, parser, seen);
        
      };
      
      while (true) { // Loop until all LR chains are refactored
        
        /*
          LR chain detected
          Note that `chain` now only consists of `DelegatingParser`s - if it didn't, it couldn't
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
          a single Rep with:
             | {
             |   minReps: arr.map(rep => rep.minReps).reduce((m, v) => m * v, 1), // Account for Infinities (zero outprioritizes Infinity here!)
             |   maxReps: arr.map(rep => rep.maxReps).reduce((m, v) => m * v, 1), // Account for Infinities (zero outprioritizes Infinity here!)
             | }
          but note that the range of possible repetitions is often not contiguous, and computing
          it exactly is probably very hard or at least inefficient.
        */
        
        let lrChain = getNextLrChain(mut);
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
          // part of the current LR cycle!) TODO: O(n^2); `lrChains.has(...)` is O(n) - improve!
          let flatOpts = anys.map(any => any.opts).flat(1).filter(opt => !lrChain.has(opt));
          let normalized = AnyParser({ lang: mut.lang, name: `flatAny(${anys.toArr(any => any.name).join(' + ')})`, opts: flatOpts });
          
          // Resolves to either `any([ ...flattenedOpts ])`, or `rep(any([ ...flattenedOpts ]))`
          if (reps.length)
            normalized = RepeatParser({
              lang: mut.lang,
              name: `flatRep(${reps.toArr(any => any.name).join(' + ')})`,
              minReps: reps.map(rep => rep.minReps).reduce((m, v) => m * v, 1), // Can't be `0 * Infinity` as `minReps` is never `Infinity`
              maxReps: reps.map(rep => rep.maxReps).reduce((m, v) => m * v, 1), // Can't be `0 * Infinity` as `maxReps` is never `0`
              kid: normalized // `flattenedAny` from above
            });
          
          if (anys.has(this)) {
            
            // Literally the whole Parser being normalized is resolved to `normRoot`
            return normRoot; // `mut` is completely irrelevant!
            
          } else {
            
            // `mutable` itself wasn't refactored by normalization; we need to traverse every child
            // Parser reachable from `mutable`, and whenever we find one of the Anys that was
            // flattened, we replace it with `normRoot`!
            
            let op = (node, seen=Set()) => {
              
              if (seen.has(node)) return; seen.add(node);
              
              switch (node.getTerm()) {
                
                case 'any':
                  
                  // If the Any has Opts which feed into the LR chain, remove all such Opts and add
                  // the single `normalized` node as a new Opt
                  // TODO: O(n^2)
                  let optsLrRemoved = node.opts.filter(opt => !lrChain.has(opt));
                  if (optsLrRemoved.length < node.opts.length)
                    node.opts = [ ...optsLrRemoved, normalized ]; // TODO: Optimize Opt ordering later? (AnyParser.prototype.optimizeOptOrder?)
                  
                  for (let opt of optsLrRemoved) op(opt, seen);
                  return;
                  
                case 'all':
                  
                  // Each Req which is part of the LR chain must be replaced with `normalized`
                  node.reqs = node.reqs.map(req => lrChain.has(req) ? normalized : req);
                  
                  for (let req of node.reqs) if (req !== normalized) op(req, seen);
                  return;
                  
                case 'rep':
                  
                  if (lrChain.has(node.kid)) node.kid = normalized;
                  else                       op(node.kid, seen);
                  return;
                  
                default: /* ignore anything else */ return;
                
              }
              
            };
            op(mut);
            
            return mut;
            
          }
          
        } else {
          
          // There's at least one `AllParser` in the chain; this is the tricky part!
          
        }
        
      }
      
      return mut;
      
    }
    
  })});
  let AnyParser = form({ name: 'AnyParser', has: { DelegatingParser }, props: (forms, Form) => ({
    
    init({ opts=[], ...cfg }) {
      
      if (!isForm(opts, Array)) throw Error('Opts param must be array').mod({ opts });
      if (opts.some(v => !hasForm(v, Parser))) throw Error('Opts array must only contains parsers').mod({ opts });
      
      forms.DelegatingParser.init.call(this, cfg);
      Object.assign(this, { opts });
      
    },
    
    addOpt(opt) { this.opts.push(opt); return { all: this, opt }; },
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
    clone(map=Map()) {
      
      if (map.has(this)) return map.get(this);
      
      let any = AnyParser({ ...this, opts: [] });
      map.set(this, any);
      
      for (let opt of this.opts) any.addOpt(opt.clone(map));
      
      return any;
      
    },
    * run0(input) {
      
      for (let opt of this.opts) yield* opt.run(input);
      
    },
    visualize(seen=Set()) {
      
      let d = `Any "${this.name || '<anon>'}"`;
      
      if (seen.has(this)) return `Cyc: ${d}`;
      seen.add(this);
      
      if (this.opts.length) d += '\n' + this.opts
        .map(opt => opt.visualize(seen))
        .map(desc => { let [ ln0, ...lns ] = desc.split('\n'); return [ `- ${ln0}`, ...lns.map(ln => `  ${ln}`) ].join('\n'); })
        .join('\n');
      
      return d;
      
    }
    
  })});
  let AllParser = form({ name: 'AllParser', has: { DelegatingParser }, props: (forms, Form) => ({
    
    init({ reqs=[], ...cfg }) {
      
      if (!isForm(reqs, Array)) throw Error('Reqs param must be array').mod({ reqs });
      if (reqs.some(v => !hasForm(v, Parser))) throw Error('Reqs array must only contains parsers').mod({ reqs });
      
      forms.DelegatingParser.init.call(this, cfg);
      Object.assign(this, { reqs });
      
    },
    
    addReq(req) { this.reqs.push(req); return { all: this, req }; },
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
    clone(map=Map()) {
      
      if (map.has(this)) return map.get(this);
      
      let all = AllParser({ ...this, reqs: [] });
      map.set(this, all);
      
      for (let req of this.reqs) all.addReq(req.clone(map));
      
      return all;
      
    },
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
    visualize(seen=Set()) {
      
      let d = `All "${this.name || '<anon>'}"`;
      
      if (seen.has(this)) return `Cyc: ${d}`;
      seen.add(this);
      
      if (this.reqs.length) d += '\n' + this.reqs
        .map(req => req.visualize(seen))
        .map(desc => { let [ ln0, ...lns ] = desc.split('\n'); return [ `- ${ln0}`, ...lns.map(ln => `  ${ln}`) ].join('\n'); })
        .join('\n');
      
      return d;
      
    }
    
  })});
  let RepeatParser = form({ name: 'RepeatParser', has: { DelegatingParser }, props: (forms, Form) => ({
    
    init({ kid, minReps=0, maxReps=Infinity, ...cfg }) {
      
      if (!hasForm(kid, Parser))    throw Error('Kid param must be parser').mod({ kid });
      if (!isForm(minReps, Number)) throw Error('Min-reps param must be number').mod({ minReps });
      if (minReps >= Inf) throw Error('Min-reps param must be number').mod({ minReps });
      if (!isForm(maxReps, Number)) throw Error('Max-reps param must be number').mod({ maxReps });
      if (maxReps < 1)              throw Error('Max-reps param must be >= 1').mod({ maxReps });
      if (maxReps < minReps)        throw Error('Max-reps param must be greater than min-reps').mod({ minReps, maxReps });
      
      forms.DelegatingParser.init.call(this, cfg);
      Object.assign(this, { kid, minReps, maxReps });
      
    },
    
    setKid(kid) { this.kid = kid; return { rep: this, kid }; },
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
    clone(map=Map()) {
      
      if (map.has(this)) return map.get(this);
      
      let rep = RepeatParser({ ...this, kid: null });
      map.set(this, rep);
      
      if (this.kid) rep.setKid(this.kid.clone(map));
      
      return rep;
      
    },
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
    visualize(seen=Set()) {
      
      let d = `Rep(${this.name || '<anon>'})`;
      
      if (seen.has(this)) return `Cyc: ${d}`;
      seen.add(this);
      
      if (this.kid) d += '\n' + [ this.kid ]
        .map(req => req.visualize(seen))
        .map(desc => { let [ ln0, ...lns ] = desc.split('\n'); return [ `- ${ln0}`, ...lns.map(ln => `  ${ln}`) ].join('\n'); })
        .join('\n');
      
      return d;
      
    }
    
  })});
  
  return { Language };
  
})();

(async () => {
  
  /** @type HutNodejsParse.LanguageForm */
  let Language = lib.Language;
  
  let toy = () => {
    
    let lang = Language({ name: 'toy' });
    let { nop, tok, reg, all, any, rep } = lang.fns();
    
    let main = any([]);
    main.addOpt(tok('str', 'ab-'));
    
    let rep1 = rep('rep1', { minReps: 2, maxReps: 4, kid: main });
    let rep2 = rep('rep2', { minReps: 1, maxReps: 5, kid: rep1 });
    gsc('PARSE', rep2.parse('ab-ab-ab-ab-'));
    
  };
  
  let anyLr = () => {
    
    let lang = Language({ name: 'toy' });
    let { nop, tok, reg, all, any, rep } = lang.fns();
    
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
    
    any1.addOpt(tok('x'));
    any2.addOpt(tok('y'));
    any3.addOpt(tok('z'));
    
    gsc('BEFORE', any1.visualize());
    
    let norm = any1.normalize();
    gsc('AFTER (norm)', norm.visualize());
    
    //gsc('POST-NORM PARSE:');
    //gsc(norm.parse('xzyz'));
    
  };
  
  let mathLr = () => {
    
    let lang = Language({ name: 'math' });
    let { nop, tok, reg, all, any, rep } = lang.fns();
    
    let num = any([]);
    num.addOpt(reg('num', '[1-9][0-9]*'));
    num.addOpt(all('brk', [ tok('('), num, tok(')') ]));
    num.addOpt(all('add', [ num, tok('+'), num ]));
    num.addOpt(all('sub', [ num, tok('-'), num ]));
    
    gsc('NORM', num.normalize());
    
    //gsc('PARSE', num.normalize().parse('1+10+12'));
    
  };
  
  let js = () => {
    
    let lang = Language({ name: 'js' });
    let { nop, tok, reg, all, any, rep } = lang.fns();
    
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
  
  ({ toy, mathLr, anyLr, js }['anyLr'])();
  
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