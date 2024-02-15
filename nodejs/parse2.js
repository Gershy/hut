/// <reference path="../ts/hut.d.ts" />

require('../room/setup/clearing/clearing.js');

(() => {
  
  // Make Errors better! (https://v8.dev/docs/stack-trace-api)
  Error.prepareStackTrace = (err, callSites) => {
    
    let trace = callSites.map(cs => {
      
      let file = cs.getFileName();
      if (!file || file.hasHead('node:')) return skip;
      
      //Object.getOwnPropertyNames(Object.getPrototypeOf(cs)),
      
      return {
        type: 'line',
        fnName: cs.getFunctionName(),
        keepTerm: [ '', '[file]', ...cs.getFileName().split(/[/\\]+/) ].join('/'),
        row: cs.getLineNumber(),
        col: cs.getColumnNumber()
      };
      
    });
    
    return `>>>HUTTRACE>>>${valToJson(trace)}<<<HUTTRACE<<<`;
    
  };
  
  let vertDashChars = '166,124,33,9597,9599,9551,9483,8286,8992,8993,10650'.split(',').map(v => parseInt(v, 10).char());
  let horzDashChars = '126,8212,9548,9148,9477'.split(',').map(v => parseInt(v, 10).char());
  let junctionChars = '43,247,5824,9532,9547,9535,10775,10765,9533,9069,9178,11085'.split(',').map(v => parseInt(v, 10).char());
  let vertDash = () => vertDashChars[Math.floor(Math.random() * vertDashChars.length)];
  let horzDash = () => horzDashChars[Math.floor(Math.random() * horzDashChars.length)];
  let junction = () => junctionChars[Math.floor(Math.random() * junctionChars.length)];
  
  global.subconOutput = (sc, ...args) => { // Stdout; check "chatter" then format and output
    
    /// {DEBUG=
    // TODO: Wrapping this in DEBUG does nothing; this file doesn't get compiled!
    let trace = sc.params().active ? Error('trace').getInfo().trace : null;
    /// =DEBUG}
    
    let leftColW = 28;
    let terminalW = global.conf('global.terminal.width');
    let rightColW = Math.max(terminalW - leftColW - 2, 30); // `- 2` considers the "| " divide between L/R cols
    
    thenAll(args.map(arg => isForm(arg, Function) ? arg(sc) : arg), args => {
      
      let { chatter=true, therapy=false, chatterFormat } = sc.params();
      
      if (chatterFormat) {
        // The subcon's "chatterFormat" param takes the argument arr and returns a new arr, or
        // `null` to silence this item
        args = eval(chatterFormat)(...args);
        if (args === null) return;
        if (!isForm(args, Array)) args = [ args ];
      }
      
      // Forced output for select subcons
      if (!chatter && ![ 'gsc', 'warning' ].has(sc.term)) return;
      
      let depth = 7;
      if (isForm(args[0], String) && /^[!][!][0-9]+$/.test(args[0])) {
        depth = parseInt(args[0].slice(2), 10);
        args = args.slice(1);
      }
      
      let now = getDate();
      
      let leftLns = [ `[${sc.term.slice(-leftColW)}]`, now ];
      let rightLns = args.map(v => {
        if (!isForm(v, String)) v = formatAnyValue(v, { depth, width: rightColW });
        return v.split(/\r?\n/);
      }).flat();
      
      /// {DEBUG=
      let call = trace?.[global.subcon.relevantTraceIndex];
      call = call?.file && `${token.dive(call.file).at(-1)} ${call.row}:${call.col}`;
      if (call) {
        let extraChars = call.length - leftColW;
        if (extraChars > 0) call = call.slice(extraChars + 1) + '\u2026';
        leftLns.push(call);
      }
      /// =DEBUG}
      
      let logStr = Math.max(leftLns.length, rightLns.length).toArr(n => {
        let l = (leftLns[n] || '').padTail(leftColW);
        let r = rightLns[n] || '';
        return l + vertDash() + ' ' + r;
      }).join('\n');
      
      let topLine = leftColW.toArr(horzDash).join('') + junction() + (1 + rightColW).toArr(horzDash).join('');
      console.log(topLine + '\n' + logStr);
      
    });
    
  };
  
  let modCode = (...codes) => '\u001b[' + codes.map(c => c.toString(10)).join(';') + 'm';
  let modMapping = {
    
    // https://stackoverflow.com/a/41407246/830905
    
    red:       '\u001b[31m',
    green:     '\u001b[32m',
    yellow:    '\u001b[33m',
    blue:      '\u001b[34m',
    
    subtle:    '\u001b[2m',
    
    bold:      '\u001b[1m',
    italic:    '\u001b[3;22m',
    underline: '\u001b[4;22m',
    
    rgbRed: '\u001b[38;2;255;0;0m', // Must be 38, then 2, then the next 3 are R,G,B
    
    reset:     '\u001b[0m'
  };
  let ansi = (str, modName) => `${modMapping[modName]}${str}${modMapping.reset}`;
  let remAnsi = (str) => str.replace(/\u{1b}\[[^a-zA-Z]+[a-zA-Z]/ug, '');
  let bolded = Map();
  let bold = (str, b = bolded.get(str)) => b || (bolded.set(str, b = ansi(str, 'bold')), b);
  
  let format = (val, opts={}, d=0, pfx='', seen=Map()) => {
    
    // `opts.d` is the maximum depth; the "<limit>" indicator will be returned beyond it
    // `d` is the current depth
    // `opts.w` is the initial width
    // `pfx` is the string which will precede the first line of any output from this `format`
    // call; it should be considered in order to break excessively long lines
    
    let pfxLen = pfx.length;
    
    if (val === undefined) return ansi('undefined', 'green');
    if (val === null) return ansi('null', 'green');
    
    if (isForm(val, String)) return ansi(`'${val.replaceAll('\n', '\\n')}'`, 'green');
    if (isForm(val, Number)) return ansi(`${val}`, 'green');
    if (isForm(val, Boolean)) return ansi(val ? 'T' : 'F', 'green');
    
    if (d > opts.d) return ansi('<limit>', 'red');
    
    if (seen.has(val)) return seen.get(val);
    
    if (Object.getPrototypeOf(val) === null) {
      
      seen.set(val, '<cyc> PlainObject(...)');
      seen.set(val, str);
      let str = `PlainObject ${format({ ...val }, opts, d, 'PlainObject ', seen)}`;
      return str;
      
    }
    
    if (hasForm(val, Function)) {
      
      let str = 'Fn: ' + val.toString().split('\n').map(ln => ln.trim() ?? skip).join(' ');
      
      let maxW = Math.max(8, opts.w - pfxLen - d * 4 - 1); // Subtract 1 for the trailing ","
      str = ansi(str.ellipsis(maxW), 'blue');
      
      seen.set(val, str);
      return str;
      
    }
    
    if (isForm(val, Set)) {
      
      seen.set(val, '<cyc> Set(...)');
      let str = `Set ${format([ ...val ], opts, d, 'Set ', seen)}`;
      seen.set(val, str);
      return str;
      
    }
    
    if (isForm(val, Map)) {
      
      seen.set(val, '<cyc> Map(...)');
      let str = `Map ${format(Object.fromEntries(val), opts, d, 'Map ', seen)}`;
      seen.set(val, str);
      return str;
      
    }
    
    if (isForm(val?.desc, Function)) {
      
      try {
        let str = ansi(val.desc(), 'blue');
        seen.set(val, str);
        return str;
      } catch (err) {
        // Ignore any errors from calling `val.desc`
      }
      
    }
    
    if (isForm(val, Object)) {
      
      if (val.empty()) return bold('{}');
      
      seen.set(val, '<cyc> { ... }');
      let keyLen = Math.max(...val.toArr((v, k) => k.length));
      
      let str = (() => {
        
        let formatted = val.map((v, k) => format(v, opts, d + 1, `${k.padTail(keyLen, ' ')}: `, seen));
        
        let oneLine = `${bold('{')} ${formatted.toArr((v, k) => `${k}${bold(':')} ${v}`).join(bold(',') + ' ')} ${bold('}')}`;
        let canOneLine = true
          && !oneLine.has('\n')
          && remAnsi(oneLine).length < (opts.w - d * 4);
        if (canOneLine) return oneLine;
        
        let multiLineItems = formatted.toArr((v, k) => {
          
          let paddingAmt = keyLen - k.length;
          let padding = '';
          if (paddingAmt) padding += ' ';
          padding += '-'.repeat(Math.max(paddingAmt - 1, 0));
          let paddedKey = k + ansi(padding, 'subtle');
          return `${paddedKey}${bold(':')} ${v}`;
          
        });
        
        // Using `Math.max` means there's no sorting preference for items less than 10 chars long
        let multiLine = multiLineItems.valSort(v => {
          
          let noAnsi = remAnsi(v);
          let numLines = (noAnsi.match(/\n/g) ?? []).length + 1;
          
          // The first line of `noAnsi` embeds `keyLen` chars and ": "
          let numChars = noAnsi.length - (keyLen + ': '.length);
          if (numLines === 1 && numChars < 50) numChars = 50; // Avoid reordering short single-lines values
          
          return numChars * 1 + numLines * 7;
        })
          .map(v => v.indent(ansi('\u00a6', 'subtle') + '   '))
          .join(bold(',') + '\n')
        
        return `${bold('{')}\n${multiLine}\n${bold('}')}`;
        
      })();
      
      seen.set(val, str);
      return str;
      
    }
    
    if (isForm(val, Array)) {
      
      if (val.empty()) return bold('[]');
      
      seen.set(val, '<cyc> [ ... ]');
      
      let str = (() => {
        
        let formatted = val.map(v => format(v, opts, d + 1, '', seen));
        
        let oneLine = `${bold('[')} ${formatted.join(bold(',') + ' ')} ${bold(']')}`;
        let canOneLine = true
          && !oneLine.has('\n')
          && remAnsi(oneLine).length < (opts.w - d * 4);
        if (canOneLine) return oneLine;
        
        let multiLine = formatted.map(v => v.indent(ansi('\u00a6', 'subtle') + '   ')).join(bold(',') + '\n');
        return `${bold('[')}\n${multiLine}\n${bold(']')}`;
        
      })();
      
      seen.set(val, str);
      return str;
      
    }
    
    let formName = getFormName(val);
    seen.set(val, `<cyc> ${formName}(...)`);
    let str = `${ansi(formName, 'blue')} ${format({ ...val }, opts, d, `${formName} `, seen)}`;
    seen.set(val, str);
    return str;
    
  };
  global.formatAnyValue = (val, { colours=true, width=conf('global.terminal.width'), depth=7 }={}) => {
    return format(val, { colours, w: width, d: depth });
  };
  
})()

let cnttt = 0;

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
    
    init({ lang, name, norm=false, ...cfg }) {
      
      if (!isForm(lang, Language)) throw Error('Lang param must be a language').mod({ lang });
      if (!cfg.empty()) throw Error('Unexpected config').mod({ cfg });
      
      Object.assign(this, { lang, name, norm });
      
    },
    
    // Note that in order to qualify as a loop, there must be no stepping
    sometimesLoops(...args) { throw Error('Not implemented'); },
    certainlyHalts(...args) { return !this.sometimesLoops(...args); },
    certainlySteps(...args) { throw Error('Not implemented'); },
    
    getEstimatedComplexity() { return 1; },
    normalize(...args) {
      
      if (this.norm) return this;
      
      let norm = this.normalize0(...args);
      if (!norm.norm) throw Error('normalize0 failed to set "norm"').mod({ form: getFormName(this), norm });
      
      return norm;
      
    },
    normalize0() { throw Error('Not implemented'); },
    parse(src, ...args) {
      
      // This function is the user's entrypoint; it's called once per Parser.Src and simply
      // sanitizes the user input (then internally, the `run` method is used for parsing)
      
      if (isForm(src, String)) src = Parser.Src({ str: src });
      
      let best = Parser.Trg({ str: '' });
      for (let p of this.run(src, ...args)) {
        if (p.str.length === src.str.length) return p;
        if (p.str.length > best.str.length) best = p;
      }
      
      return best;
      
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
    
    init(cfg) {
      forms.Parser.init.call(this, cfg);
      Object.assign(this, { norm: true });
    },
    
    sometimesLoops() { return false; },
    certainlySteps() { return false; }, // In fact, a NopParser *never* steps (nor does it loop)
    
    * getDelegationChains(chain=[]) { yield [ ...chain, this ]; },
    desc() { return this.name || 'Nop'; }
    
  })});
  
  let ImmediateParser = form({ name: 'ImmediateParser', has: { Parser }, props: (forms, Form) => ({
    
    init({ sgs=false /* "strip global seqs" */, ...cfg }) {
      
      forms.Parser.init.call(this, cfg);
      Object.assign(this, { norm: true, sgs });
      
    },
    
    * getDelegationChains(chain=[]) { yield [ ...chain, this ]; }, // ImmediateParsers don't delegate (could also call them "Terminal" parsers, or "Leaf" parsers)
    normalize0() { return this; },
    
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
      if (seen.has(this)) return '<cyc>';
      seen.add(this);
      return this.name || `${getFormName(this).slice(0, 3)}(${this.getDelegates().map(d => d.desc(seen)).join(', ') || '<empty>'})`;
    },
    normalize0() {
      
      for (let chain of this.getDelegationChains()) {
        
        let last = chain.at(-1);
        let ind = chain.indexOf(last);
        if (ind === chain.length) continue; // The final item is unique - no cycle!
        
        // LR chain detected
        // Note that `chain` now only consists of `DelegatingParser`s - if it didn't, it couldn't
        // have a cycle of delegations
        
        // Note that `chain` is conceptually cyclical (`chain.at(0)` is adjacent to `chain.at(-1)`)
        // Note that `chain` will never consist entirely of `AllParser`s (since an AllParser always
        // delegates, a chain of only `AllParser`s would always infinitely delegate - I'm quite
        // sure a chain of only AllParsers always indicates a user error)
        // Note that any `RepeatParser`s in `chain` have a Kid defined (never `null`)
        // Note that `AllParser` and `RepeatParser` are thematically similar; their haltiness is
        // defined by the first application of a Kid/Req Parser which Loops or Halts (non-looping,
        // non-halting Kid/Req Parsers which come earlier have no bearing on haltiness)
        // Note that an `AnyParser` containing a RepeatParser with `minReps === 0` can be replaced
        // with an `AnyParser` with an additional `NopParser` option, and `minReps === 1` instead
        
        // Consider a chain A -> B -> C -> D -> A
        // Note that the topmost decision about how to treat this cycle depends on whether any
        // Parser in the cycle is an AllParser (there will always be at least one AnyParser -
        // cycles of only AllParsers always define either halts, zero token consumption [in the
        // case of a RepeatParser with minReps=0], or infinite token consumption!)
        // Note that if we could ignore RepeatParsers, such nested AnyParsers can be logically
        // flattened without altering the parse tree.
        
        let lrChain = chain.slice(ind);
        let findAllParser = chain.find(p => isForm(p, AllParser));
        
      }
      
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
    * run0(input) {
      
      for (let opt of this.opts) yield* opt.run(input);
      
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
      
      for (let req of this.reqs) if (req.certainlySteps()) return true;
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
      
    }
    
  })});
  let RepeatParser = form({ name: 'RepeatParser', has: { DelegatingParser }, props: (forms, Form) => ({
    
    init({ kid, minReps=0, maxReps=Infinity, ...cfg }) {
      
      if (!hasForm(kid, Parser)) throw Error('Kid param must be parser').mod({ kid });
      if (!isForm(minReps, Number)) throw Error('Min-reps param must be number').mod({ minReps });
      if (!isForm(maxReps, Number)) throw Error('Max-reps param must be number').mod({ maxReps });
      if (maxReps < 1) throw Error('Max-reps param must be >= 1').mod({ maxReps });
      
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
    * run0(src) {
      
      let { minReps, maxReps, kid } = this;
      if (!kid) return yield Form.Trg({ prs: this, str: '' });
      
      let allTrgChains = function*(src, chain=[]) {
        
        if (chain.length >= maxReps) return; // No more parsing after `maxReps` exceeded
        
        // If the current `chain` meets the minimum size, yield it; it's already a valid parsing,
        // even if it's possible for the Kid to successfully repeat (resulting in another parsing)
        if (chain.length >= minReps) yield chain;
        
        // Try to extend the chain with additional repetitions
        for (let cur of kid.run(src))
          yield* allTrgChains(src.advance(cur), [ ...chain, cur ]);
        
      };
      
      for (let kidTrgs of allTrgChains(src)) yield Form.Trg({ prs: this, trgs: kidTrgs });
      
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
    main.addOpt(reg('numm', '[1-9][0-9]*'));
    main.addOpt(all('brak', [ tok('('), main, tok(')') ]));
    main.addOpt(all('plus', [ tok('+'), main, tok(':'), main ]));
    
    gsc('PARSE', main.parse('(+(+1:(2)):3)'));
    
  };
  
  let math = () => {
    
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
    inlineValue.addOpt(any({ name: 'boolean', opts: [ tok('true'), tok('false') ] }));
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
  
  ({ toy, math, js }['math'])();
  
  /*
  
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
  */
  
})()
  .catch(err => gsc('FATAL', err));