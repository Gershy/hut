'use strict';

require('../room/setup/clearing/clearing.js');

let dim = text => `\x1b[37m${text}\x1b[0m`;
let log = (...v) => { let depth = 6; if (isForm(v[0], Number)) { [ depth, ...v ] = v; } console.log(...v.map(v => require('util').inspect(v, { depth, colors: true }))); };

let doTests = 0;
let testSpecific = 0 && { depth: 8, name: 'jsPropsDynamic', input: 'a[1]=2;' };
let debugLiveAttempts = 0;

// TODO: Incapable of removing any trailing "omittable" characters e.g. try:
//    | parse(getJsParser(), 'let var = true; // trailing stuff')
// this `globalOmitRegex` is only ever applied before an attempt to satisfy a parse node, and there
// is no parse node at the very end of the input!
let globalOmitRegex = /([ \n\t]|([/][/].*[\n])|([/][*].*[*][/]))*/;

let getParserParams = parser => {
  
  // Global defaults
  let defaults = { collapseWhiteSpace: false, diveGreedy: true, diveParser: null };
  
  if ([ 'token', 'regex' ].has(parser.type))  Object.assign(defaults, { collapseWhiteSpace: true });
  if (parser.type === 'repeat')               Object.assign(defaults, { minReps: 0, maxReps: Infinity });
  
  return { ...defaults, ...parser };
  
};
let canConsumeEmpty = (parser, seen=Set()) => {
  
  if (seen.has(parser)) return true; // TODO: Or false??
  seen.add(parser);
  
  if (parser.type === 'nop') return true;
  if ([ 'token', 'regex' ].has(parser.type)) return false;
  
  if (parser.type === 'any') return  parser.parsers.any(p => canConsumeEmpty(p, seen));
  if (parser.type === 'all') return !parser.parsers.all(p => canConsumeEmpty(p, seen));
  if (parser.type === 'repeat') {
    if (getParserParams(parser).minReps === 0) return true;
    return canConsumeEmpty(parser.parser, seen);
  }
  
  return false;
  
};
let parse = function*(parser, input, trace) {
  
  let getNormalizedParser = parser => {
    
    // Convert an LR parser to a dive-style, LR-free parser
    
    let iterateAllParsers = function*(parser, seen=Set()) {
      
      if (seen.has(parser)) return;
      seen.add(parser);
      
      yield parser;
      if (parser.type === 'any') for (let p of parser.parsers) yield* iterateAllParsers(p, seen);
      if (parser.type === 'all') for (let p of parser.parsers) yield* iterateAllParsers(p, seen);
      if (parser.type === 'repeat') yield* iterateAllParsers(parser.parser, seen);
      
    };
    
    // Sanitization step
    for (let p of iterateAllParsers(parser)) {
      
      // TODO: (optimization) if there are "all" parsers whose first n children are
      // identical (and n > 1) should replace those n children with a
      // single { type: 'repeat', minReps: n, maxReps: n } child
      
      // Convert string regex to regex object
      if (p.type === 'regex' && isForm(p.regex, String)) {
        if (!p.regex.hasHead('^')) p.regex = `^(${p.regex})`;
        p.regex = RegExp(p.regex.replace(/\\/g, '\\\\')); // Escape all backslashes
      } else if (p.type === 'regex' && !p.regex.toString().startsWith('/^')) {
        throw Error(`Regex "${p.regex.toString()}" doesn't begin with "^" matcher`);
      }
      
      // TODO: Sort options of "any" by descending complexity??
      if (0 && p.type === 'any') {
        
        p.parsers = p.parsers.sort((p1, p2) => {
          
          let c1 = 0;
          for (let p of iterateAllParsers(p1)) c1++;
          
          let c2 = 0;
          for (let p of iterateAllParsers(p2)) c2++;
          
          return c2 - c1;
          
        });
        
        // console.log(p.parsers.map(p => p.name || p.type));
        
      }
      
    }
    
    let addParserChild = (par, child) => {
      
      // Abstract way to add a child Parser regardless of whether the
      // parent is of type "any", "all", or "repeat"
      
      if (par.type === 'any')  if (!par.parsers.has(child)) par.parsers.add(child);
      
      // Convert to "any"
      //if (par.type === 'all') throw Error('Can\'t handle "all"');
      if (par.type === 'all') {
        let clonePar = { ...par };
        par.gain({ type: 'any', parsers: [ clonePar, child ] });
      }
      //if (par.type === 'all')  par = { ...par.slice([ 'name' ]), type: 'any', parsers: [ par /*, child*/ ] };
      
      if (par.type === 'repeat' && par.parser)
        throw Error(`par.parser must be null!`); // Can't add a child if one is already present (well... could make make the repeat child an "any", and add the original and new children to that...)
      
      if (par.type === 'repeat') par.parser = child;
      
    };
    let remParserChild = (par, child) => {
      
      if (par.type === 'any') par.parsers = par.parsers.map(p => p === child ? C.skip : p);
      if (par.type === 'repeat' && par.parser === child) par.parser = null;
      if (par.type === 'all') par.parsers = par.parsers.map(p => p === child ? C.skip : p);
      
    };
    let getEmptyParserCloneOrPreexisting = (par, parser) => {
      
      let existingParser = (() => {
        
        let existingParsers = (() => {
          if (parser.type === 'any') return parser.parsers;
          if (parser.type === 'all') return [];
          if (parser.type === 'repeat') return [ parser.parser ];
          return [];
        })();
        if (!existingParsers.count()) return null;
        
        // All the parser's props, except for its delegating props
        let props = {}.gain(parser, { parser: C.skip, parsers: C.skip, diveParser: C.skip });
        
        return existingParsers.seek(parser => {
          //console.log({ props, props2: {}.gain(parser, { parser: C.skip, parsers: C.skip, diveParser: C.skip }) });
          for (let k in props) if (props[k] !== parser[k]) return false;
          return true;
        }).val;
        
      })();
      
      if (existingParser) return { preexisting: true, parser: existingParser };
      
      if ([ 'token', 'regex', 'nop' ].has(parser.type)) return { preexisting: false, parser: { ...parser } };
      
      if (parser.type === 'any') return { preexisting: false, parser: { ...parser, parsers: [] } };
      
      if (parser.type === 'all') return { preexisting: false, parser: { ...parser, parsers: [ { type: 'nop' } ] } };
      
      if (parser.type === 'repeat') return { preexisting: false, parser: { ...parser, parser: null } };
      
      throw Error(`Unexpected type for empty clone: "${parser.type}"`);
      
    };
    let getLrBreakingParser = (head, tail) => {
      
      // if (head.type === 'all' && !head.parsers.seek(p => p === tail).found) {
      //   log(3, 'WHYYYY', { head, tail });
      //   throw Error('UGH');
      // }
      
      // `head` and `tail` are parsers; assume that head may delegate to
      // `tail` without consuming input (closing an LR loop). This means
      // any parsing by `head` can be preceeded by a string of 0 to
      // Infinite parsings by `tail`/itself (because `tail` loops back
      // to `head`). This function returns a parser to replace `head`
      // which is only responsible for performing the final parsing in
      // this sequence; it no longer delegates in LR fashion to `tail`;
      // it cannot consume an unlimited sequence of parsings (only the
      // final parsing)
      
      if ([ 'token', 'regex', 'nop' ].has(head.type)) return head;
      
      // Remove `parser` as an "any"-option
      if (head.type === 'any') return { ...head, parsers: head.parsers.map(p => (p === tail) ? C.skip : p) };
        
      // diving ensures *one* instance already preceeds, but this
      // diving needs to guarantee *several* preceed! (TODO: At
      // earlier sanitize stage could replace the n identical prefix
      // entries with `{ type: repeat, minReps: n, maxReps: n, ... }`)
      // If only 1 head, remove `tail` as a prefix of `parsers` Array
      if (head.type === 'all' && head.parsers[1] === tail) throw Error('UH OH');
      
      // HANDLE ALL-PARSER EMPTYABLE CHILD PREFIXES
      if (head.type === 'all') {
        let { found, ind } = head.parsers.seek(p => p === tail);
        //if (!found) throw Error('UH OHHHH');
        if (!found) ind === 0; // TODO: This is a bad sign :(
        return { ...head, parsers: head.parsers.slice(ind + 1) }; // Exclude all parsers up to and including `tail`
      }
      //if (head.type === 'all') return { ...head, parsers: head.parsers.slice(1) };
      
      // TODO: This probably never happens??
      // Produce a "repeat" parser with one less repetition required,
      // since an instance has already been parsed at this point
      if (head.type === 'repeat') {
        
        let { minReps, maxReps } = getParserParams(head);
        if (maxReps === 1) return { ...head.slice([ 'name' ]), type: 'nop' };
        return { ...head, minReps: Math.max(0, minReps - 1), maxReps: maxReps - 1 };
        
      }
      
      throw Error(`Unexpected parser type for LR refactor: "${head.type}"`);
      
    };
    
    let getLeftRecursionChains = function*(parser, checkLrChain=[], seen=Set()) {
      
      // Yields `chain`s of parsers such that each `chain[n]` delegates
      // directly to `chain[n + 1]`, except for the final item which
      // delegates directly back to `chain[0]`.
      
      //console.log(3, `CHECK:`, [ ...checkLrChain, parser ].map(p => p.name || `#${p.type}`).join(' > '));
      
      if ([ 'nop', 'token', 'regex' ].has(parser.type)) return;
      
      // Check if a loop occurred - find the first occurrence of `parser` in `checkLrChain` and
      // return the chain from that point forth
      let findInChain = checkLrChain.seek(p => p === parser);
      if (findInChain.found)  yield checkLrChain.slice(findInChain.ind);
      else                    checkLrChain = [ ...checkLrChain, parser ];
      
      if (seen.has(parser)) return;
      seen.add(parser);
      
      if (parser.type === 'all') {
        
        // HANDLE ALL-PARSER EMPTYABLE CHILD PREFIXES
        let numEmpty = 0;
        while (numEmpty < parser.parsers.length && canConsumeEmpty(parser.parsers[numEmpty])) numEmpty++;
        for (let child of parser.parsers.slice(0, numEmpty + 1)) yield* getLeftRecursionChains(child, checkLrChain, seen);
        
        // The all-parser may not be a part of a closed loop, but one
        // of its children could be! (The loop is closed beyond the
        // all-parser's step). In this case the chain is started from
        // scratch, but `seen` is still inherited to avoid infinite
        // code-loop.
        for (let child of parser.parsers.slice(numEmpty + 1)) yield* getLeftRecursionChains(child, [], seen);
        
        // yield* getLeftRecursionChains(parser.parsers[0], checkLrChain, seen);
        // 
        // // The all-parser may not be a part of a closed loop, but one of
        // // its children could be! (The loop closes after all-parser's
        // // step). In this case the chain is started from scratch, but
        // // `seen` is still inherited to avoid infinite code-loop.
        // for (let cp of parser.parsers.slice(1)) yield* getLeftRecursionChains(cp, [], seen);
        
      } else if (parser.type === 'repeat') {
        
        yield* getLeftRecursionChains(parser.parser, checkLrChain, seen);
        
      } else if (parser.type === 'any') {
        
        // Return the chain for every option
        for (let option of parser.parsers) yield* getLeftRecursionChains(option, checkLrChain, seen);
        
      } else {
        
        throw Error(`Unexpected parser type: "${parser.type}"`);
        
      }
      
      // TODO: What if a diveParser contains LR?
      // There are several possibilities here:
      // #1:
      //    if (parser.has('diveParser')) yield* getLeftRecursionChains(parser.diveParser, []);
      // This is almost certainly no good, since leaving `checkLrChain`
      // empty allows infinite loops to occur readily (the chain ensures
      // that re-visited items break the loop; by resetting the chain
      // this behaviour is no longer guaranteed
      // #2:
      //    if (parser.has('diveParser')) yield* getLeftRecursionChains(parser.diveParser, [ parser ]);
      // This bakes my noodle. The dive tail delegates at some point
      // back to the parent that initiated the dive. All I know is that
      // if this *does* return some LR-chains, the current logic to
      // break them will not succeed because it doesn't know how to
      // break chains including dive-tails
      // #3:
      //    <No verification of LR tails within the diveParser at all>
      // There's a good chance that diveParsers are never set up to
      // contain loops, but this isn't exactly evident to me.
      // #4:
      //    if (parser.has('diveParser')) yield* getLeftRecursionChains(parser.diveParser, [], Set([ parser ]));
      // That's right - a 2nd chain is used! The first chain is used to
      // detect that loops have been closed. The 2nd chain would be used
      // to determine that the search for LR within the diveTail has
      // exited the confines of the diveTail. The 2nd chain can be used
      // to avoid infinite loops, and any loops detected with it would
      // *not* result in LR-chains being yielded (as these chains cross
      // diveTail boundaries, and don't actually lead to LR)
      
      if (parser.has('diveParser')) yield* getLeftRecursionChains(parser.diveParser, [], seen);
      
    };
    let normalizeLeftRecursionChain = lrChain => {
      
      //console.log(`NORMALIZE: ${lrChain.map(p => p.name).join(' -> ')}`);
      
      // Rotate the chain to ensure any all-type parser comes last
      (() => {
        
        //if (lrChain.map(p => (p.type === 'all') ? p : C.skip).count() > 1)
        //  throw Error(`LR chain contains multiple all-type parsers; all-type parsers may only be the final (refactored) parser in the LR-chain; obviously this can't be achieved with multiple all-type parsers`);
        
        let { val, ind } = lrChain.seek(p => p.type === 'all');
        if (!val) return;
        
        // Rotate the array until the all-parser is the final item
        let numRots = (lrChain.length - 1) - ind;
        for (let i = 0; i < numRots; i++) lrChain = [ lrChain.slice(-1)[0], ...lrChain.slice(0, -1) ]; // lrChain.unshift(lrChain.pop());
        
      })();
      
      let parser = lrChain[0];
      
      // If `lrChain.count() === 1` it means there is a structure like:
      // let p = { type: 'any', parsers: [] }; p.parsers.add(p);
      // ... which is pretty silly
      if (lrChain.count() === 1) {
        
        if (parser.type === 'repeat') {
          // The entire repeating parser is useless!
          for (let k in parser) if (k !== 'name') delete parser[k];
          Object.assign(parser, { type: 'nop' });
        } else if (parser.type === 'any') {
          // Prevent "any" parsers from referring to themselves
          parser.parsers = parser.parsers.map(p => (p === parser) ? C.skip : p);
        }
        return;
        
      }
      
      // Imagine an `lrChain` [ A, B, C, D ], representing parsers that
      // delegate like A -> B -> C -> D -> A (cyclical). Each parser can
      // reach each of the other parsers through some indirection. If
      // we're going to break this chain we need to ensure that this is
      // still the case; the parsers shouldn't delegate to each other
      // anymore, but a dive-tail should allow them to reach the others.
      // We have to pick a point in the chain (one of the arrows) to
      // perform the break. The best way to do this is to ensure the
      // break prevents delegation to an all-type parser. This is
      // implemented by rotating the chain until the all-type parser is
      // in the correct position (we can assert that LR chains have a
      // maximum of 1 all-type parser). Imagine A is an all-type parser,
      // so we break the C -> D arrow. Now the following chains of
      // delegation are no longer possible:
      // A -> B -> C -> D
      //      B -> C -> D
      //           C -> D
      // Every broken delegation sequence must be replaced with diving.
      // For a chain of size n there are n-1 sub-chains that need to
      // have diving enabled on them. Here `parserChainsToAllowDives`
      // will represent these sub-chains. Note also that it might make
      // more intuitive sense to sever the loop before creating the
      // dive-tails (as the severing is the reason the dive-tails are
      // necessary), but in terms of implementation it's easier to break
      // the loop by mutating the parsers responsible for closing the
      // loop, and we'll need the un-mutated values to create valid
      // dive-tails - so we hold off mutating until the unmutated values
      // are no longer required (which is *after* the dive-tails have
      // been created).
      
      let parserChainsToAllowDives = (lrChain.length - 1).toArr(n => lrChain.slice(n));
      for (let chainToAllowDive of parserChainsToAllowDives) {
        
        // `chainToAllowDive` will in turn be each of the broken dive
        // chains (in order of longest -> shortest). We need to enable
        // dive functionality for each of these broken chains!
        
        // We'll duplicate the LR chain in the dive-tail. Note the first
        // parser in the chain is skipped the dive-tail is attached. to
        // this parser. Note we skip the final parser in the chain since
        // this parser will be *refactored* (to prevent it from looping
        // back to `chainToAllowDive[0]`), not *emptied*!
        let chainToCloneEmpty = chainToAllowDive.slice(1, -1);
        let chainHead = chainToAllowDive[0]
        let chainTail = chainToAllowDive.slice(-1)[0];
        
        if (chainHead.type === 'nop') continue;
        
        // Ensure a diveParser exists
        if (!chainHead.has('diveParser')) {
          chainHead.diveParser = { name: '~dive', type: 'repeat', parser: { name: '~any', type: 'any', parsers: [] } };
        }
        
        // `divePtr` initially points to the dive-parser's any-parser and
        // will walk down the dive-tree once for each parser in the middle
        // (exclude first and last) of `chainToAllowDive`
        let divePtr = chainHead.diveParser.parser;
        for (let lrParser of chainToCloneEmpty) {
          
          // TODO: This always creates a new parser in the sequence of
          // walking down the dive-parse-tree, but a pre-existing parser
          // could be used! E.g. the current logic leads to structures
          // that look like:
          //  { name: '~any', type: 'any', parsers: [
          //    { name: 'any1', type: 'any', parsers: [
          //      { name: 'any2', type: 'any', parsers: [
          //        { name: 'token1', type: 'token', token: 'abc' }
          //      ]}
          //    ]},
          //    { name: 'any1', type: 'any', parsers: [
          //      { name: 'any2', type: 'any', parsers: [
          //        { name: 'token2', type: 'token', token: 'def' }
          //      ]}
          //    ]}
          //  ]}
          // 
          // When ideally we would have:
          // 
          //  { name: '~any', type: 'any', parsers: [
          //    { name: 'any1', type: 'any', parsers: [
          //      { name: 'any2', type: 'any', parsers: [
          //        { name: 'token1', type: 'token', token: 'abc' },
          //        { name: 'token2', type: 'token', token: 'def' }
          //      ]}
          //    ]}
          //  ]}
          // 
          // Fix is quite simple: `getEmptyParserClone` needs to become
          // something like `getEmptyParserCloneOrUsePreexisting`!
          let { preexisting, parser: emptyParser } = getEmptyParserCloneOrPreexisting(divePtr, lrParser);
          if (!preexisting) addParserChild(divePtr, emptyParser);
          divePtr = emptyParser;
          
        }
        
        // Add the final parser to the end of the dive-tail. Note this
        // final parser is not emptied entirely; rather it is prevented
        // from delegating directly (without consuming any input) back
        // to `chainTail`.
        addParserChild(divePtr, getLrBreakingParser(chainTail, chainHead));
        
      }
      
      // We're going to break the loop at the point where the final item
      // in `lrChain` points back to the first item in `lrChain` (and
      // semantically there is a reversal in "head"/"tail" terminology
      // because the final array item points directionally *forward* to
      // the first array item).
      let lrHead = lrChain.slice(-1)[0];
      let lrTail = lrChain[0];
      
      // For any-type parsers, remove the any-option creating the loop
      // Totally negate the connection for all- or repeat-type parsers
      if (lrHead.type === 'any') lrHead.parsers = lrHead.parsers.map(p => (p === lrTail) ? C.skip : p);
      if ([ 'all', 'repeat' ].has(lrHead.type)) {
        
        lrHead.gain({ type: 'nop', parsers: C.skip, parser: C.skip, diveParser: C.skip });
        
      }
      
    };
    
    // Normalize every left recursion chain
    while (true) {
      let lrChain = getLeftRecursionChains(parser).next().value;
      if (!lrChain) break;
      normalizeLeftRecursionChain(lrChain);
    }
    
    return parser;
    
  };
  let getDenormalizedParseTree = (parsed) => {
    
    // Convert a dive-style parse-tree into the style of parse-tree we
    // would expect to have generated with the original LR parser.
    
    // The major idea is to transform arrays of dive-results (note
    // an Array is always available as "~dive" is an all-parser) into
    // a one-legged-binary-tree kind of format
    
    if (parsed.parser.type === 'any')
      parsed = { ...parsed, child: getDenormalizedParseTree(parsed.child) };
    
    if ([ 'repeat', 'all' ].includes(parsed.parser.type))
      parsed = { ...parsed, children: parsed.children.map(getDenormalizedParseTree) };
    
    if (parsed.has('diveParsed')) {
      
      let { diveParsed, ...parsedNoDive } = parsed;
      if (diveParsed.parser.name !== '~dive') throw Error(`Unexpected`);
      
      // Note that ~dive is an all-parser (`diveParsed.children` exists)
      let netResultFromDive = diveParsed.children.map(c => c.result).join('');
      let resultExcludingDive = parsedNoDive.result.slice(0, parsedNoDive.result.length - netResultFromDive.length);
      
      let [ diveChild0, ...diveChildren ] = diveParsed.children;
      
      parsed = getDenormalizedParseTree({
        ...diveChild0,
        result: resultExcludingDive + diveChild0.result,
        children: [ { ...parsedNoDive, result: resultExcludingDive }, ...diveChild0.children ]
      });
      
      let accumulatedResult = parsed.result;
      for (let diveChild of diveChildren.map(getDenormalizedParseTree)) {
        
        parsed = {
          ...diveChild,
          result: (accumulatedResult += diveChild.result),
          children: [ parsed, ...diveChild.children ]
        };
        delete parsed.diveParsed;
        
      }
      
    }
    
    return parsed;
    
  };
  
  let numDiving = 0;
  let diveSet = Map();
  
  let parseNormalized = function*(parser, inputStr, trace={ offset: 0, chain: [], diving: Set(), debug: false }) {
    
    // Utility
    let hit = 0;
    let miss = 0;
    let numInputs = 0;
    let accesses = [];
    let accessible = it => {
      
      // Makes it easy to re-traverse a predictable iterator; the function result here returns
      // interchangeable generators, which share (memoize) results. So the initial iterator will
      // only be called when any of the iterators returned from this function exceed the current
      // number of yielded items
      
      let accessInd = accesses.length;
      accesses.push(0);
      
      let results = [];
      return function*() {
        
        accesses[accessInd]++;
        
        let ind = 0;
        while (true) {
          
          while (ind >= results.length) {
            let { done, value } = it.next();
            if (done) break;
            else      results.push(value);
          }
          
          if (ind < results.length) yield results[ind++];
          else                      break;
          
        }
        
      };
      
    };
    let Input = form({ name: 'Input', props: (form, Form) => ({
      init: function(str, offset=0, offsetInputs=Map()) {
        
        if (offsetInputs.has(offset)) throw Error(`Duplicate offsetInput at offset ${offset}`);
        
        offsetInputs.set(offset, this);
        
        numInputs++;
        this.str = str;
        this.offset = offset;
        this.offsetInputs = offsetInputs;
        
        this.memParsedSet = Map();
        
      },
      advance: function(offset) {
        
        if (!offset) return this;
        
        if (isForm(offset, String)) {
          if (!this.str.hasHead(offset)) throw Error(`Offset "offset" isn't a prefix of string "${this.str}"`);
          offset = offset.length;
        }
        
        return false
          || this.offsetInputs.get(this.offset + offset)
          || Input(this.str.slice(offset), this.offset + offset, this.offsetInputs);
        
      },
      
      doDive: function*(headParsed, diveParser) {
        
        // Diving has the premise that some input was consumed to
        // initiate the dive; this is what prevents LR. If no input was
        // consumed it isn't safe to start the dive!
        if (!headParsed.result) return;
        
        //let diveInput = input.advance(headParsed.result);
        for (let diveParsed of this.parseWith(diveParser, { ...trace, chain: [ ...trace.chain, diveParser ] })) {
          
          // No point including any dived parsings that succeeded but
          // consumed no data - that isn't any different from simply the
          // unmodified `parsedDiveHead`, which will be yielded between
          // the greedy/nongreedy yields naturally.
          if (!diveParsed.result) continue;
          
          yield {
            
            ...headParsed,
            
            // Full result is the head result (with whitespace) + dive
            result: headParsed.result + diveParsed.result,
            
            // Keep the entire dive-parsed node, but make sure that the
            // "children" property includes any children already parsed
            // by `headParsed`:
            diveParsed: { ...diveParsed,
              children: headParsed.has('diveParsed')
                ? [ ...headParsed.diveParsed.children, ...diveParsed.children ]
                : diveParsed.children
            }
            
          };
          
        }
        
      },
      parseWith0: function*(parser) {
        
        let { collapseWhiteSpace, diveParser, diveGreedy } = getParserParams(parser);
        
        // We may automatically consume globally-ignored characters at
        // this level; we'll remove any ignored prefix from the input,
        // parse the non-ignored input, and prepend the original ignored
        // prefix to the result.
        let ws = '';
        if (collapseWhiteSpace) ws = (this.str.match(globalOmitRegex) || [ '' ])[0];
        
        let input = this.advance(ws);
        for (let parsed of applyParserTypeFns[parser.type](parser, input, trace)) {
          
          let didConsume = !!parsed.result;
          
          // Yield greedy dive with whitespace
          if (diveParser && didConsume &&  diveGreedy)
            for (let dp of input.advance(parsed.result).doDive(parsed, diveParser)) { dp.result = ws + dp.result; yield dp; }
          
          yield { ...parsed, result: ws + parsed.result };
          
          // Yield non-greedy dive with whitespace
          if (diveParser && didConsume && !diveGreedy)
            for (let dp of input.advance(parsed.result).doDive(parsed, diveParser))
              (dp.result = ws + dp.result, yield dp);
          
        }
        
      },
      parseWith: function*(parser, trace) {
        
        // Check if there's already an "accessible" generator for this parser
        let access = this.memParsedSet.get(parser);
        if (!access) { miss++; this.memParsedSet.set(parser, access = accessible(this.parseWith0(parser))); }
        else         { hit++; }
        
        yield* access();
        
      }
    })});
    
    let applyParserTypeFns = {
      nop: function*(parser, input, trace) {},
      token: function*(parser, input, trace) {
        if (input.str.hasHead(parser.token)) yield { parser, result: parser.token };
      },
      regex: function*(parser, input, trace) {
        let match = input.str.match(parser.regex);
        if (match && match[0]) yield { parser, result: match[0] };
      },
      repeat: function*(parser, input, trace) {
        
        // Imagine the repeat-child is "any"; this means it could return
        // a multitude of different parsings/interpretations of the
        // upcoming `input`. The first application of the repeat-child to
        // the input may use an any-option to produce a parsing that
        // consumes input in such a way that the repeat-child can't parse
        // anything else, whereas a different any-option may have allowed
        // the repeat-child to repeat many times successfully. For this
        // reason we need to be able to backtrack to earlier stages of the
        // repeat-child; hence the recursive generator approach
        
        let { greedy, minReps, maxReps } = getParserParams(parser);
        
        let allChildOrderings = function*(input, reps=0) {
          if (reps > maxReps) return;
          let childTrace = { ...trace, chain: [ ...trace.chain, parser.parser ] };
          for (let parsedHead of input.parseWith(parser.parser, childTrace)) {
            if (!greedy && reps >= minReps) yield [ parsedHead ];
            for (let parsedTail of allChildOrderings(input.advance(parsedHead.result), reps + 1)) yield [ parsedHead, ...parsedTail ];
            if ( greedy && reps >= minReps) yield [ parsedHead ];
          }
        }
        
        if (!greedy && minReps === 0) yield { parser, result: '', children: [] };
        for (let children of allChildOrderings(input)) yield { parser, result: children.map(r => r.result).join(''), children };
        if ( greedy && minReps === 0) yield { parser, result: '', children: [] };
        
      },
      all: function*(parser, input, trace) {
        
        let parsers = parser.parsers.map(p => p.type === 'nop' ? C.skip : p);
        
        // Empty all-parsers are technically invalid and can't consume
        if (parsers.empty()) return;
        
        let lastChildOffset = parsers.count() - 1;
        
        let allChildOrderings = function*(inputOffset=0, childOffset=0) {
          
          let childParser = parsers[childOffset];
          let childTrace = { ...trace, chain: [ ...trace.chain, childParser ] };
          
          if (childOffset < lastChildOffset) {
            
            // Yield head + tail for non-final parsers
            for (let parsedHead of input.advance(inputOffset).parseWith(childParser, childTrace))
              for (let parsedTail of allChildOrderings(inputOffset + parsedHead.result.length, childOffset + 1))
                yield [ parsedHead, ...parsedTail ];
            
          } else {
            
            // Immediately yield tail-less results for the final offset
            for (let parsedHead of input.advance(inputOffset).parseWith(childParser, childTrace)) yield [ parsedHead ];
            
          }
          
        }
        
        for (let children of allChildOrderings()) yield { parser, result: children.map(r => r.result).join(''), children };
        
      },
      any: function*(parser, input, trace) {
        
        // This substitutes "any" nodes with the result of the any-child
        // that succeeded in parsing the input (reduce parse-tree size)
        for (let cp of parser.parsers) yield* input.parseWith(cp, { ...trace, chain: [ ...trace.chain, cp ] });
        
      }
    };
    
    for (let parsed of Input(inputStr).parseWith(parser, trace)) {
      
      // Performance debug...
      let highestAccess = Math.max(...accesses);
      let avgAccess = accesses.reduce((m, v) => m + v) / accesses.count();
      console.log({ hit, miss, numInputs, highestAccess, avgAccess: Math.round(avgAccess) });
      
      let remaining = inputStr.slice(parsed.result.length);
      if (!remaining) yield parsed;
      
      let match = remaining.match(globalOmitRegex);
      if (match && match[0] === remaining) yield { ...parsed, result: parsed.result + remaining };
      
    }
    
  };
  
  for (let parsed of parseNormalized(getNormalizedParser(parser), input, trace)) {
    yield getDenormalizedParseTree(parsed);
  }
  
};

let showParsed = (parsed, { verticalGap=false, indentSize=3 }={}) => {
  
  let visualSepBar = dim('|');      // [ '\x1b[37m', '|',      '\x1b[0m' ].join('');
  let visualSepDot = dim('\u00b7'); // [ '\x1b[37m', '\u00b7', '\x1b[0m' ].join('');
  
  let formatParsedData = (parsed, depth=0) => {
    
    let { type, name=null } = parsed.parser;
    
    let formatted = {
      depth,
      info: name
        ? `${type[0].upper()}${type.slice(1, 3)} (${name})`
        : `${type[0].upper()}${type.slice(1, 3)}`,
      aligned: parsed.result,
      children: []
    };
    
    if ([ 'all', 'repeat' ].has(type) && parsed.children.count()) {
      if (parsed.children.empty()) formatted.info += ' <0>';
      formatted.children = parsed.children.map(child => formatParsedData(child, depth + 1));
    }
    
    if (parsed.diveParsed) {
      formatted.children.add(formatParsedData(parsed.diveParsed, depth + 1));
    }
    
    return formatted;
    
  };
  let getLines = (fpd, indentSize, verticalGap, depth=0) => {
    
    let { info, aligned='', children=[], diveParsed=null } = fpd;
    
    let lines = [];
    let tabHead = visualSepBar + ' '.repeat(indentSize - 1);
    let tabTail = '+' + ' '.repeat(indentSize - 1);
    let indent = depth ? (tabHead.repeat(depth - 1) + tabTail) : '';
    
    // Add a space above for all lines beyond the first
    if (verticalGap && depth) lines.add({ offset: 0, text: tabHead.repeat(depth), aligned: '' });
    
    // Add a line displaying the real information
    lines.add({ offset: depth * indentSize + info.length, text: `${indent}${info}`, aligned });
    
    for (let child of children) lines = [ ...lines, ...getLines(child, indentSize, verticalGap, depth + 1) ];
    
    return lines;
    
  };
  
  let lines = getLines(formatParsedData(parsed), indentSize, verticalGap);
  let maxOffset = Math.max(...lines.map(ln => ln.offset));
  
  console.log(lines.map(line => {
    
    let { offset, text, aligned } = line;
    
    if (!aligned) aligned = dim('empty string');
    
    let spaceNeeded = indentSize + maxOffset - offset;
    let repSpace = spaceNeeded - 1;
    
    let alignStr = [
      // Handle even / oddness here
      (spaceNeeded % 2) ? ' ' : '  ',
      
      // Alternating pattern to make things less busy
      `${visualSepDot} `.repeat(repSpace >> 1)
    ].join('');
    
    return [
      text,
      alignStr,
      visualSepBar,
      aligned.replace(/[\n]/g, dim('\u00b6')), // Remove newlines, replace with line-feed symbol
      visualSepBar
    ].join('');
    
  }).join('\n'));
  
};
let simplifyParsed = parsed => {
  
  // Returns a structured representation of the parse tree, but with
  // much less data (more suitable for printing directly). The major
  // reduction is omitting the full "parser" property, which can usually
  // be very deep and large (cluttering output badly)
  
  let { parser: { name='anon', type }, result, input=null, children=null, diveParsed } = parsed;
  let simple = input ? { name, type, input, result } : { name, type, result };
  if (children) simple.children = children.map(simplifyParsed);
  if (diveParsed) simple.diveParsed = simplifyParsed(diveParsed);
  return simple;
  
};

// Do tests
(doTests || testSpecific) && (() => {
  
  let names = str => str.split(',').map(name => ({ name }));
  let tests = [
    { name: 'delimStr',
      genParser: () => {
        return { name: 'str', type: 'repeat', parser: { name: 'choice', type: 'any', parsers: [
          { name: 'alf', type: 'regex', regex: '[a-z]' },
          { name: 'num', type: 'regex', regex: '[0-9]' }
        ]}};
      },
      cases: [
        { input: '1', expect: { name: 'str', children: names('num') } },
        { input: '12', expect: { name: 'str', children: names('num,num') } },
        { input: '123', expect: { name: 'str', children: names('num,num,num') } },
        { input: 'a', expect: { name: 'str', children: names('alf') } },
        { input: 'ab', expect: { name: 'str', children: names('alf,alf') } },
        { input: 'abc', expect: { name: 'str', children: names('alf,alf,alf') } },
        { input: '1a2b3c44dd', expect: { name: 'str', children: names('num,alf,num,alf,num,alf,num,num,alf,alf') } }
      ]
    },
    { name: 'brackets',
      genParser: () => {
        let brk = { name: 'brk', type: 'all', parsers: [] };
        brk.parsers.add({ name: 'bl', type: 'token', token: '[' });
        brk.parsers.add({ name: 'rep', type: 'repeat', parser: brk });
        brk.parsers.add({ name: 'br', type: 'token', token: ']' });
        return brk;
      },
      cases: [
        { input: '[]', expect: { name: 'brk' } },
        { input: '[][]', expect: null },
        { input: '[[]]', expect: { name: 'brk', children: [
          { name: 'bl' },
          { name: 'rep', children: [ { name: 'brk' } ] },
          { name: 'br' }
        ]}},
        { input: '[[][]]', expect: { name: 'brk', children: [
          { name: 'bl' },
          { name: 'rep', children: [ { name: 'brk' }, { name: 'brk' } ] },
          { name: 'br' }
        ]}},
        { input: '[[[]][]]', expect: { name: 'brk', children: [
          { name: 'bl' },
          { name: 'rep', children: [
            { name: 'brk', children: [ { name: 'bl' }, { name: 'rep', children: [ { name: 'brk' } ] }, { name: 'br' } ] },
            { name: 'brk', children: [ { name: 'bl' }, { name: 'rep', children: [] }, { name: 'br' } ] }
          ]},
          { name: 'br' }
        ]}},
        { input: '[[][[]]]', expect: { name: 'brk', children: [
          { name: 'bl' },
          { name: 'rep', children: [
            { name: 'brk', children: [ { name: 'bl' }, { name: 'rep', children: [] }, { name: 'br' } ] },
            { name: 'brk', children: [ { name: 'bl' }, { name: 'rep', children: [ { name: 'brk' } ] }, { name: 'br' } ] }
          ]},
          { name: 'br' }
        ]} },
      ]
    },
    { name: 'math',
      genParser: () => {
        
        let exp = { name: 'exp', type: 'any', parsers: [] };
        exp.parsers.add({ name: 'num', type: 'regex', regex: '[1-9][0-9]*' });
        exp.parsers.add({ name: 'opr', type: 'all', parsers: [
          
          { name: 'brkL', type: 'token', token: '(' },
          exp,
          { type: 'any', parsers: [
            { name: 'add', type: 'token', token: '+' },
            { name: 'sub', type: 'token', token: '-' },
            { name: 'mul', type: 'token', token: 'x' },
            { name: 'div', type: 'token', token: '/' }
          ]},
          exp,
          { name: 'brkR', type: 'token', token: ')' }
          
        ]});
        
        return exp;
        
      },
      cases: [
        { input: '1', expect: { name: 'num' } },
        { input: '100', expect: { name: 'num' } },
        { input: '(1+2)', expect: { name: 'opr', children: names('brkL,num,add,num,brkR') } },
        { input: '(1+(2x3))', expect: { name: 'opr', children: [
          { name: 'brkL' },
          { name: 'num' },
          { name: 'add' },
          { name: 'opr', children: names('brkL,num,mul,num,brkR') },
          { name: 'brkR' }
        ]}},
        { input: '((1+2)x3)', expect: { name: 'opr', children: [
          { name: 'brkL' },
          { name: 'opr', children: names('brkL,num,add,num,brkR') },
          { name: 'mul' },
          { name: 'num' },
          { name: 'brkR' }
        ]}}
      ]
    },
    { name: 'jsPropsSimple',
      genParser: () => {
        
        let varName = { name: 'varName', type: 'regex', regex: '[a-zA-Z$_][a-zA-Z0-9$_]*' };
        let address = { name: 'address', type: 'any', parsers: [] };
        let value = { name: 'value', type: 'any', parsers: [] };
        
        address.parsers.add(varName);
        address.parsers.add({ name: 'propertySimple', type: 'all', parsers: [
          value,
          { name: 'op', type: 'token', token: '.' },
          varName
        ]});
        
        value.parsers.add(address); // Anything addressable is also a value
        value.parsers.add({ name: 'num', type: 'regex', regex: '[1-9][0-9]*' });
        
        let expression = { name: 'expression', type: 'any', parsers: [] };
        expression.parsers.add({ name: 'assign', type: 'all', parsers: [
          address,
          { name: 'op', type: 'token', token: '=' },
          value,
          { name: 'delim', type: 'token', token: ';' }
        ]});
        expression.parsers.add({ name: 'mention', type: 'all', parsers: [
          value,
          { name: 'delim', type: 'token', token: ';' }
        ]});
        
        return { name: 'main', type: 'repeat', parser: expression };
        
      },
      cases: [
        { input: 'a;', expect: { name: 'main', children: [
          { name: 'mention', children: names('varName,delim') }
        ]}},
        { input: '1;', expect: { name: 'main', children: [
          { name: 'mention', children: names('num,delim') }
        ]}},
        { input: 'a=1;', expect: { name: 'main', children: [
          { name: 'assign', children: names('varName,op,num,delim') }
        ]}},
        { input: 'a=1;b=2;', expect: { name: 'main', children: [
          { name: 'assign', children: names('varName,op,num,delim') },
          { name: 'assign', children: names('varName,op,num,delim') }
        ]}},
        { input: 'a.b=1;',  expect: { name: 'main', children: [
          { name: 'assign', children: [
            { name: 'propertySimple', children: names('varName,op,varName') },
            ...names('op,num,delim')
          ]}
        ]}},
        { input: 'a.b=c.d;', expect: { name: 'main', children: [
          { name: 'assign', children: [
            { name: 'propertySimple', children: [
              { name: 'varName', result: 'a' }, { name: 'op' }, { name: 'varName', result: 'b' }
            ]},
            { name: 'op', result: '=' },
            { name: 'propertySimple', children: [
              { name: 'varName', result: 'c' }, { name: 'op' }, { name: 'varName', result: 'd' }
            ]},
            { name: 'delim', result: ';' }
          ]}
        ]}},
        { input: 'a.b.c.d;', expect: { name: 'main', children: [
          { name: 'mention', result: 'a.b.c.d;', children: [
            { name: 'propertySimple', /* result: 'a.b.c.d', */ children: [
              { name: 'propertySimple' },
              { name: 'op' },
              { name: 'varName' }
            ]},
            { name: 'delim', result: ';' }
          ]}
        ]}}
      ]
    },
    { name: 'jsPropsDynamic',
      genParser: () => {
        
        let varName = { name: 'varName', type: 'regex', regex: '[a-zA-Z$_][a-zA-Z0-9$_]*' };
        
        let value = { name: 'value', type: 'any', parsers: [] };
        let reference = { name: 'reference', type: 'any', parsers: [] };
        
        let inlineValue = { name: 'inline', type: 'any', parsers: [] };
        inlineValue.parsers.add({ name: 'null', type: 'token', token: 'null' });
        inlineValue.parsers.add({ name: 'decInteger', type: 'regex', regex: '[+-]?[0-9]+' });
        value.parsers.add(inlineValue);
        
        value.parsers.add({ name: 'bracketed', type: 'all', parsers: [
          
          { name: 'open', type: 'token', token: '(' },
          { name: 'vals', type: 'repeat', parser: { type: 'all', parsers: [ value, { type: 'token', token: ',' } ]}},
          value,
          { name: 'close', type: 'token', token: ')' }
          
        ]});
        value.parsers.add({ name: 'assign', type: 'all', parsers: [
          
          reference,
          { name: 'token', type: 'token', token: '=' },
          value
          
        ]});
        
        value.parsers.add(reference);
        
        reference.parsers.add(varName);
        reference.parsers.add({ name: 'property', type: 'all', parsers: [
          value,
          { name: 'token', type: 'token', token: '.' },
          varName
        ]});
        reference.parsers.add({ name: 'propertyNamed', type: 'all', parsers: [
          value,
          { name: 'delimL', type: 'token', token: '[' },
          value,
          { name: 'delimR', type: 'token', token: ']' },
        ]});
        
        return { name: 'statement', type: 'all', parsers: [ value, { type: 'token', token: ';' } ] };
        
      },
      cases: [
        { input: 'a[1];', expect: { name: 'statement', children: [
          { name: 'propertyNamed' },
          { type: 'token', result: ';' }
        ]}},
        { input: 'a[1]=2;', expect: { name: 'statement', children: [
          { name: 'assign', children: [
            { name: 'propertyNamed' },
            { type: 'token', result: '=' },
            { name: 'decInteger', result: '2' }
          ]},
          { type: 'token', result: ';' }
        ]}}
      ]
    },
    { name: 'functions',
      genParser: () => {
        
        let value = { name: 'value', type: 'any', parsers: [] };
        value.parsers.add({ name: 'ref', type: 'regex', regex: '[a-z][a-zA-Z]*' });
        value.parsers.add({ name: 'int', type: 'regex', regex: '[1-9][0-9]*' });
        value.parsers.add({ name: 'invoke', type: 'all', parsers: [
          
          value,
          { name: 'delimL', type: 'token', token: '(' },
          { name: 'args', type: 'all', parsers: [
            
            // Any number of delimited args
            { name: 'rep', type: 'repeat', parser: { name: 'leading', type: 'all', parsers: [ value, { name: 'delim', type: 'token', token: ',' } ]}},
            
            // Optional, final undelimited arg
            { name: 'last', type: 'repeat', maxReps: 1, parser: value }
            
          ]},
          { name: 'delimR', type: 'token', token: ')' }
          
        ]});
        return value;
        
      },
      cases: [
        { input: 'a', expect: { name: 'ref' } },
        { input: '123', expect: { name: 'int' } },
        { input: 'a()', expect: { name: 'invoke', children: [
          { name: 'ref' },
          { name: 'delimL' },
          { name: 'args', children: [
            { name: 'rep', children: [] },
            { name: 'last', children: [] }
          ]},
          { name: 'delimR' }
        ]}},
        { input: 'a()()', expect: { name: 'invoke', children: [
          { name: 'invoke', children: [
            { name: 'ref' },
            { name: 'delimL' },
            { name: 'args', children: [
              { name: 'rep', children: [] },
              { name: 'last', children: [] }
            ]},
            { name: 'delimR' }
          ]},
          { name: 'delimL' },
          { name: 'args', children: [
            { name: 'rep', children: [] },
            { name: 'last', children: [] }
          ]},
          { name: 'delimR' }
        ]}},
        { input: 'a(1)()', expect: { name: 'invoke', children: [
          { name: 'invoke', children: [
            { name: 'ref' },
            { name: 'delimL' },
            { name: 'args', children: [
              { name: 'rep', children: [] },
              { name: 'last', children: [ { name: 'int' } ] }
            ]},
            { name: 'delimR' }
          ]},
          { name: 'delimL' },
          { name: 'args', children: [
            { name: 'rep', children: [] },
            { name: 'last', children: [] }
          ]},
          { name: 'delimR' }
        ]}},
        { input: 'a()(2)', expect: { name: 'invoke', children: [
          { name: 'invoke', children: [
            { name: 'ref' },
            { name: 'delimL' },
            { name: 'args', children: [
              { name: 'rep', children: [] },
              { name: 'last', children: [] }
            ]},
            { name: 'delimR' }
          ]},
          { name: 'delimL' },
          { name: 'args', children: [
            { name: 'rep', children: [] },
            { name: 'last', children: [ { name: 'int' } ] }
          ]},
          { name: 'delimR' }
        ]}},
        { input: 'a(1,2,3)', expect: { name: 'invoke', children: [
          { name: 'ref' },
          { name: 'delimL' },
          { name: 'args', children: [
            { name: 'rep', children: [
              { name: 'leading', children: [ { name: 'int', result: '1' }, { name: 'delim' } ] },
              { name: 'leading', children: [ { name: 'int', result: '2' }, { name: 'delim' } ] }
            ]},
            { name: 'last', children: [ { name: 'int' } ] }
          ]},
          { name: 'delimR' }
        ]}},
        { input: 'a(b())', expect: { name: 'invoke', children: [
          { name: 'ref' },
          { name: 'delimL' },
          { name: 'args', children: [
            { name: 'rep', children: [] },
            { name: 'last', children: [
              { name: 'invoke', children: [
                { name: 'ref' },
                { name: 'delimL' },
                { name: 'args', children: [
                  { name: 'rep', children: [] },
                  { name: 'last', children: [] }
                ]},
                { name: 'delimR' }
              ]}
            ]}
          ]},
          { name: 'delimR' }
        ]}},
        { input: 'a(b(c(1),2),3)', expect: { name: 'invoke', children: [
          { name: 'ref', result: 'a' },
          { name: 'delimL' },
          { name: 'args', result: 'b(c(1),2),3', children: [
            
            { name: 'rep', children: [ { name: 'leading', children: [
              
              { name: 'invoke', result: 'b(c(1),2)', children: [
                { name: 'ref', result: 'b' },
                { name: 'delimL' },
                { name: 'args', result: 'c(1),2', children: [
                  { name: 'rep', result: 'c(1),', children: [ { name: 'leading', children: [
                    
                    { name: 'invoke', result: 'c(1)', children: [
                      { name: 'ref', result: 'c' },
                      { name: 'delimL' },
                      { name: 'args', children: [
                        { name: 'rep', children: [] },
                        { name: 'last', children: [ { name: 'int', result: '1' } ] }
                      ]},
                      { name: 'delimR' }
                    ]},
                    { name: 'delim' }
                    
                  ]}]},
                  { name: 'last', result: '2', children: [ { name: 'int', result: '2' } ]}
                ]},
                { name: 'delimR' }
              ]},
              { name: 'delim' }
              
            ]}]},
            { name: 'last', children: [ { name: 'int', result: '3' } ] }
            
          ]},
          { name: 'delimR' }
        ]}},
        { input: 'a(', expect: null },
        { input: '()', expect: null }
      ]
    }
  ];
  
  if (testSpecific) {
    let { name, input, depth } = testSpecific;
    let test = tests.seek(test => test.name === name).val;
    let parser = test.genParser();
    let parsed = parse(parser, input, { offset: 0, chain: [], debug: 0 }).next().value;
    log(depth, parsed ? simplifyParsed(parsed) : '<No result>');
    process.exit(0);
  }
  
  let verify = (result, expect) => {
    
    if (result === expect) return true;
    
    let expectType = expect == null ? null : expect.constructor;
    let resultType = result == null ? null : result.constructor;
    if (expectType !== resultType) return false;
    
    if (isForm(expect, Object)) {
      for (let k in expect) {
        if (!result.has(k)) return false;
        if (!verify(result[k], expect[k])) return false;
      }
      return true;
    }
    if (isForm(expect, Array)) {
      if (expect.length !== result.length) return false;
      for (let i = 0; i < expect.length; i++) {
        if (expect[i] === C.skip) continue;
        if (!verify(result[i], expect[i])) return false;
      }
      return true;
    }
    return false;
    
  };
  
  for (let { name, genParser, cases } of tests) {
    
    let parser = genParser();
    for (let { input, expect=null, show=false } of cases) {
      let { value: parsed, done } = parse(parser, input).next();
      
      if (show) {
        console.log(`\n\nINPUT: ${input}\n`);
        console.log(require('util').inspect(simplifyParsed(parsed), { colors: true, depth: 20 }));
      }
      
      if (done && expect !== null) throw Error(`Parser "${name}" wasn't expected to fail for input: "${input}"`);
      if (!done && expect === null) throw Error(`Parser "${name}" was expected to fail for input: "${input}"`);
      if (done) continue;
      
      parsed = simplifyParsed(parsed);
      if (!verify(parsed, expect)) {
        console.log(require('util').inspect({ parsed, expect }, { colors: true, depth: 20 }));
        throw Error(`Result didn't match expectations; parser "${name}"; input: "${input}"`);
      }
      
    }
    
  }
  
  console.log(`Passed ${tests.count()} tests (${tests.reduce((m, { cases }) => m + cases.count(), 0)} total cases)`);
  
})();

(async () => {
  
  let genRegexParser = () => {
    
    let item = { type: 'any', parsers: [] };
    let items = { type: 'repeat', minReps: 0, parser: item };
    
    item.parsers.add({ name: 'literal', type: 'regex', regex: '[a-zA-Z0-9!@#%&_=;:\'"<>,~`-]+' });
    item.parsers.add({ name: 'escaped', type: 'regex', regex: '\\.' });
    item.parsers.add({ name: 'head', type: 'token', token: '^' });
    item.parsers.add({ name: 'tail', type: 'token', token: '$' });
    item.parsers.add({ name: 'anyChar', type: 'token', token: '.' });
    
    item.parsers.add({ name: 'capture', type: 'all', parsers: [
      { name: 'delimL', type: 'token', token: '(' },
      items,
      { name: 'delimL', type: 'token', token: ')' }
    ]});
    item.parsers.add({ name: 'binaryOp', type: 'all', parsers: [
      items,
      { type: 'any', parsers: [
        { name: 'or', type: 'token', token: '|' }
      ]},
      items
    ]});
    item.parsers.add({ name: 'unaryOp', type: 'all', parsers: [
      items,
      { type: 'any', parsers: [
        { name: 'repeat', type: 'token', token: '*' },
        { name: 'repeatSome', type: 'token', token: '+' },
        { name: 'optional', type: 'token', token: '?' }
      ]}
    ]});
    
    let normalChars = 'a-zA-Z0-9';
    let controlChars = '^$*+';
    item.parsers.add({ name: 'charGroup', type: 'all', parsers: [
      { name: 'delimL', type: 'token', token: '[' },
      { name: 'grouped', type: 'repeat', parser: { type: 'any', parsers: [
        { name: 'interval', type: 'all', parsers: [
          { type: 'regex', regex: `[${normalChars}]` },
          { type: 'token', token: '-' },
          { type: 'regex', regex: `[${normalChars}]` }
        ]},
        { name: 'escaped', type: 'regex', regex: '\\.' },
        { name: 'char', type: 'regex', regex: `[${ normalChars + controlChars + '[/(){}' }]` },
      ]}},
      { name: 'delimR', type: 'token', token: ']' }
    ]});
    return items;
    
  };
  
  let genParser = () => {
    
    let varName = { name: 'varName', type: 'regex', regex: '[a-zA-Z$_][a-zA-Z0-9$_]*' };
    
    let value = { name: 'value', type: 'any', parsers: [] };
    let reference = { name: 'reference', type: 'any', parsers: [] };
    
    let inlineValue = { name: 'inline', type: 'any', parsers: [] };
    inlineValue.parsers.add({ name: 'null', type: 'token', token: 'null' });
    inlineValue.parsers.add({ name: 'undefined', type: 'token', token: 'undefined' });
    inlineValue.parsers.add({ name: 'true', type: 'token', token: 'true' });
    inlineValue.parsers.add({ name: 'false', type: 'token', token: 'false' });
    inlineValue.parsers.add({ name: 'binaryInteger', type: 'regex', regex: '[+-]?0b[0-1]+' });
    inlineValue.parsers.add({ name: 'octalInteger', type: 'regex', regex: '[+-]?0[0-7]+' });
    inlineValue.parsers.add({ name: 'hexInteger', type: 'regex', regex: '[+-]?0x[0-9a-fA-F]+' });
    inlineValue.parsers.add({ name: 'decInteger', type: 'regex', regex: '[+-]?[0-9]+' });
    inlineValue.parsers.add({ name: 'decFloat', type: 'regex', regex: '[0-9]+[.][0-9]+' });
    inlineValue.parsers.add({ name: 'boolean', type: 'regex', regex: 'true|false' });
    inlineValue.parsers.add({ name: 'stringQ1', type: 'all', parsers: [
      
      { name: 'open', type: 'token', token: `'` },
      
      { name: 'content', type: 'repeat', parser: { type: 'any', parsers: [
        { name: 'chars', type: 'regex', regex: `[^\\']+` },
        { name: 'escapeSeq', type: 'regex', regex: `\\.` }
      ]}},
      
      { name: 'close', type: 'token', token: `'` }
      
    ]});
    inlineValue.parsers.add({ name: 'stringQ2', type: 'all', parsers: [
      
      { name: 'open', type: 'token', token: '"' },
      
      { name: 'content', type: 'repeat', parser: { type: 'any', parsers: [
        { name: 'chars', type: 'regex', regex: `[^\\"]+` }, // Non-backslash, non-double-quote
        { name: 'escapeSeq', type: 'regex', regex: `\\.` }  // Backslash followed by anything
      ]}},
      
      { name: 'close', type: 'token', token: '"' }
      
    ]});
    inlineValue.parsers.add({ name: 'stringBt', type: 'all', parsers: [
      
      { name: 'open', type: 'token', token: '`' },
      { name: 'contentEntities', type: 'repeat', parser: { type: 'any', parsers: [
        
        // Parse simple characters
        { name: 'chars', type: 'regex', regex: '([^\\`$]|$[^{])+' },
        
        // Parse escaped characters (literal backslash followed by any single character)
        { name: 'escapeSeq', type: 'regex', regex: '\\.' },
        
        // Parse `${...}` interpolated values
        { name: 'interpolated', type: 'all', parsers: [
          { name: 'open', type: 'token', token: '${' },
          value,
          { name: 'close', type: 'token', token: '}' }
        ]}
        
      ]}},
      { name: 'close', type: 'token', token: '`' }
      
    ]});
    inlineValue.parsers.add({ name: 'regex', type: 'all', parsers: [
      { name: 'delimL', type: 'token', token: '/' },
      genRegexParser(),
      { name: 'delimR', type: 'token', token: '/' },
      { name: 'modifiers', type: 'repeat', parser: { type: 'regex', regex: '[a-zA-Z]*' } }
    ]});
    value.parsers.add(inlineValue);
    
    let binaryOpValue = { name: 'binaryOp', type: 'all', parsers: [
      value,
      { name: 'op', type: 'any', parsers: [
        { name: 'compare', type: 'token', token: '===' },
        { name: 'compareLoose', type: 'token', token: '==' },
        { name: 'add', type: 'token', token: '+' },
        { name: 'subtract', type: 'token', token: '-' },
        { name: 'multiply', type: 'token', token: '*' },
        { name: 'divide', type: 'token', token: '/' },
        { name: 'exponentiate', type: 'token', token: '**' },
        { name: 'and', type: 'token', token: '&&' },
        { name: 'or', type: 'token', token: '||' },
        { name: 'bitAnd', type: 'token', token: '&' },
        { name: 'bitOr', type: 'token', token: '|' }
      ]},
      value
    ]};
    value.parsers.add(binaryOpValue);
    
    let mushky = 'abc';
    let obj = { mushky };
    let obj2 = { mushky: ',ushky' };
    let obj3 = { [mushky]: 'def' };
    
    
    let objectEntry = { name: 'entry', type: 'any', parsers: [
      
      { name: 'shortEntry', type: 'all', parsers: [ varName ] },
      { name: 'mappedEntry', type: 'all', parsers: [
        
        { type: 'any', parsers: [ varName, inlineValue ]},
        { name: 'token', type: 'token', token: ':' },
        value
        
      ]},
      { name: 'dynamicEntry', type: 'all', parsers: [
        
        { name: 'delimL', type: 'token', token: '[' },
        value,
        { name: 'delimR', type: 'token', token: ']' },
        { name: 'token', type: 'token', token: ':' },
        value
        
      ]},
      { name: 'spreadEntry', type: 'all', parsers: [
        { name: 'token', type: 'token', token: '...' },
        value
      ]}
      
    ]};
    value.parsers.add({ name: 'object', type: 'all', parsers: [
      
      { name: 'delimL', type: 'token', token: '{' },
      { name: 'entries', type: 'all', parsers: [
        { name: 'head', type: 'repeat', parser: { type: 'all', parsers: [ objectEntry, { type: 'token', token: ',' } ] } },
        { name: 'tail', type: 'repeat', maxReps: 1, parser: objectEntry }
      ]},
      { name: 'delimR', type: 'token', token: '}' }
      
    ]});
    
    let arrayEntry = { type: 'any', parsers: [
      { name: 'spread', type: 'all', parsers: [ { name: 'token', type: 'token', token: '...' }, value ] },
      value
    ]};
    value.parsers.add({ name: 'array', type: 'all', parsers: [
      
      { name: 'delimL', type: 'token', token: '[' },
      { name: 'entries', type: 'all', parsers: [
        { name: 'head', type: 'repeat', parser: { type: 'all', parsers: [ arrayEntry, { type: 'token', token: ',' } ] } },
        { name: 'tail', type: 'repeat', maxReps: 1, parser: arrayEntry }
      ]},
      { name: 'delimR', type: 'token', token: ']' }
      
    ]});
    
    // Includes variable names, destructured formats
    let param = { name: 'param', type: 'any', parsers: [] };
    let params = { name: 'params', type: 'all', parsers: [
      { name: 'head', type: 'repeat', parser: { type: 'all', parsers: [ param, { type: 'token', token: ',' } ] } },
      { name: 'tail', type: 'repeat', maxReps: 1, parser: { type: 'any', parsers: [
        { name: 'variadic', type: 'all', parsers: [
          { name: 'token', type: 'token', token: '...' },
          varName
        ]},
        param
      ]}}
    ]};
    
    param.parsers.add({ name: 'defaultedParam', type: 'all', parsers: [ param, { type: 'token', token: '=' }, value ]});
    param.parsers.add({ name: 'arrayParam', type: 'all', parsers: [
      { name: 'delimL', type: 'token', token: '[' },
      params,
      { name: 'delimR', type: 'token', token: ']' }
    ]});
    param.parsers.add(varName);
    
    let functionStatement = { name: 'statement', type: 'any', parsers: [] };
    let functionBodyStatements = { name: 'statements', type: 'repeat', parser: { type: 'all', parsers: [
      functionStatement,
      { name: 'delim', type: 'repeat', parser: { type: 'token', token: ';' } }
      //{ name: 'delim', type: 'token', token: ';' }
      //{ name: 'delim', type: 'any', parsers: [
      //  { name: 'delim', type: 'token', token: ';' },
      //  { name: 'delimWhitespace', type: 'regex', regex: '[ \n\t]', collapseWhiteSpace: false }
      //]}
    ]}};
    let functionBody = { name: 'body', type: 'all', parsers: [
      { name: 'delimL', type: 'token', token: '{' },
      functionBodyStatements,
      { name: 'delimR', type: 'token', token: '}' }
    ]};
    
    functionStatement.parsers.add({ name: 'initialize', type: 'all', parsers: [
      { name: 'type', type: 'any', parsers: [
        { name: 'let', type: 'token', token: 'let' },
        { name: 'const', type: 'token', token: 'const' },
        { name: 'var', type: 'token', token: 'var' },
      ]},
      param,
      { name: 'token', type: 'token', token: '=' },
      value
    ]});
    functionStatement.parsers.add({ name: 'reinitialize', type: 'all', parsers: [
      param,
      { name: 'token', type: 'token', token: '=' },
      value
    ]});
    functionStatement.parsers.add({ name: 'return', type: 'all', parsers: [
      { name: 'token', type: 'token', token: 'return' },
      { name: 'value', type: 'repeat', minReps: 0, maxReps: 1, parser: value }
    ]});
    functionStatement.parsers.add({ name: 'throw', type: 'all', parsers: [
      { name: 'token', type: 'token', token: 'throw' },
      value
    ]});
    functionStatement.parsers.add({ name: 'if', type: 'all', parsers: [
      { name: 'token', type: 'token', token: 'if' },
      { name: 'condition', type: 'all', parsers: [
        { name: 'delimL', type: 'token', token: '(' },
        value,
        { name: 'delimR', type: 'token', token: ')' }
      ]},
      { name: 'body', type: 'any', parsers: [ functionStatement, functionBody ] }
    ]});
    functionStatement.parsers.add(value);
    
    let functionValue = { name: 'function', type: 'any', parsers: [] };
    functionValue.parsers.add({ name: 'function', type: 'all', parsers: [
      
      { name: 'token', type: 'token', token: 'function' },
      { name: 'optionalName', type: 'repeat', maxReps: 1, parser: { type: 'all', parsers: [
        { type: 'regex', regex: '[ \n\t]', collapseWhiteSpace: false },
        varName
      ]}},
      { name: 'params', type: 'all', parsers: [
        { name: 'delimL', type: 'token', token: '(' },
        params,
        { name: 'delimR', type: 'token', token: ')' }
      ]},
      
      functionBody,
      
    ]});
    functionValue.parsers.add({ name: 'shorthandFunction', type: 'all', parsers: [
      { name: 'shorthandArgs', type: 'any', parsers: [
        varName,
        { name: 'params', type: 'all', parsers: [
          { name: 'delimL', type: 'token', token: '(' },
          params,
          { name: 'delimR', type: 'token', token: ')' }
        ]},
      ]},
      { name: 'token', type: 'token', token: '=>' },
      { name: 'shorthandBody', type: 'any', parsers: [ functionBody, value ]}
    ]});
    
    value.parsers.add(functionValue);
    
    value.parsers.add({ name: 'bracketed', type: 'all', parsers: [
      
      { name: 'open', type: 'token', token: '(' },
      { name: 'vals', type: 'repeat', parser: { type: 'all', parsers: [ value, { type: 'token', token: ',' } ]}},
      value,
      { name: 'close', type: 'token', token: ')' }
      
    ]});
    value.parsers.add({ name: 'assign', type: 'all', parsers: [
      
      reference,
      { name: 'token', type: 'token', token: '=' },
      value
      
    ]});
    
    let functionArgument = { name: 'arg', type: 'any', parsers: [
      value,
      { name: 'variadic', type: 'all', parsers: [ { name: 'token', type: 'token', token: '...' }, value ]}
    ]};
    value.parsers.add({ name: 'invoke', type: 'all', parsers: [
      
      value,
      { name: 'delimL', type: 'token', token: '(' },
      { name: 'params', type: 'all', parsers: [
        { name: 'head', type: 'repeat', parser: { type: 'all', parsers: [ functionArgument, { type: 'token', token: ',' } ] } },
        { name: 'tail', type: 'repeat', maxReps: 1, parser: functionArgument }
      ]},
      { name: 'delimR', type: 'token', token: ')' }
      
    ]});
    
    value.parsers.add(reference);
    
    reference.parsers.add(varName);
    reference.parsers.add({ name: 'property', type: 'all', parsers: [
      value,
      { name: 'token', type: 'token', token: '.' },
      varName
    ]});
    reference.parsers.add({ name: 'propertyNamed', type: 'all', parsers: [
      value,
      { name: 'delimL', type: 'token', token: '[' },
      value,
      { name: 'delimR', type: 'token', token: ']' },
    ]});
    
    return functionBodyStatements;
    
  };
  
  let input = process.argv.slice(2).join(' ').trim();
  if (input.hasHead('::')) input = await require('fs').promises.readFile(input.slice(2), 'utf8');
  input = input.split('%%%')[0].trim();
  
  let { now } = require('perf_hooks').performance;
  gsc(`Parsing ${input.length} chars...`);
  
  let parser = genParser();
  
  let t = now();
  let parsed = parse(parser, input, { offset: 0, chain: [], diving: Set(), debug: false }).next().value;
  let dt = now() - t;
  
  if (parsed) {
    showParsed(parsed, { verticalGap: false, indentSize: 3 });
  } else {
    console.log(`Invalid input: "${input.replace(/[\n]/g, dim('\u00b6'))}"`);
  }
  console.log(`Parsed ${input.length} chars in ${(dt / 1000).toFixed(3)}s`);
  
})()
  .fail(err => console.log('FATAL:', err.stack.split('\n').slice(0, 20).join('\n')));
