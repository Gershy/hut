'use strict';

// !<ref> !<lnk>
// !<rem>
// !<def>

let Confy = form({ name: 'Confy', props: (forms, Form) => ({
  
  $getValue: (values, relChain, relOrAbsDive) => {
    
    let dive = token.dive(relOrAbsDive);
    let [ cmp0, ...cmps ] = dive;
    
    /// {DEBUG=
    if (![ '[abs]', '[rel]' ].has(cmp0)) throw Error('Api: first dive component must be "[abs]" or "[rel]"');
    /// =DEBUG}
    
    let absCmps = [];
    for (let cmp of cmp0 === '[rel]' ? [ ...relChain, ...cmps ] : cmps)
      absCmps[cmp !== '[par]' ? 'push' : 'pop'](cmp); // `absCmp.pop(cmp)` simply ignores `cmp`
    
    if (cmp0 === '[abs]') absCmps = [ 'root', ...absCmps ];
    
    // Imagine a case where `values` looks like:
    //    | {
    //    |   'root.heap.netIdens.myNetIden': {
    //    |     'details.email': 'myEmail'
    //    |   }
    //    | }
    // And `relOrAbsDive` looks like:
    //    | "[abs].root.heap.netIdens.myNetIden.detail.email"
    // (or generally any case where a mixture of dive-keys and actual
    // references need to be traversed in order to find the value)
    // TODO: This can be implemented more efficiently; still a search
    // against the whole `values` Object, for each key in the current
    // subset of `value` check if each key is a prefix of
    // `relOrAbsDive`, and for each which is, recurse on that key!
    // BETTER TODO: simply always store `values` in "diveKeysResolved"
    // format????
    values = values.diveKeysResolved(); // Creates new value (no in-place modification)
    
    let { found, val } = token.diveOn(absCmps, values);
    if (found) return val;
    
    throw Error(
      (absCmps.join('.') === cmps.join('.'))
        ? `Api: conf path "${relChain.join('.')}" requires missing chain "${absCmps.join('.')}"`
        : `Api: conf path "${relChain.join('.')}" requires missing chain "${absCmps.join('.')}" (provided as "${dive.join('.')}")`
    ).mod({ rel: relChain.join('.') });
      
  },
  $wrapFn: async ({ conf, orig=null, chain }, fn) => {
    
    try { return await fn(); } catch (err) {
      
      err.propagate(msg => ({
        msg: msg.hasHead('Api: ') ? msg : `Api: "${chain.join('.')}" ${msg}`,
        value: conf,
        ...(orig && { origValue: orig })
      }));
      
    }
    
  },
  
  init() {},
  resolve({ conf, chain, getValue /* (relOrAbsDive) => someResolvedValue */ }) {
    throw Error('Not implemented');
  },
  getAction(conf, chain=['root']) {
    return async values => {
      
      let getValue = Form.getValue.bound(values, chain);
      let orig = conf;
      let isRef = isForm(conf, String) && conf.hasHead('!<ref>');
      
      return Form.wrapFn({ conf, orig: isRef ? orig : null, chain }, () => {
        if (isRef) conf = getValue(conf.slice('!<ref>'.length).trim());
        return this.resolve({ conf, chain, getValue });
      });
      
    };
  }
  
})});
let ConfySet = form({ name: 'ConfySet', has: { Confy }, props: (forms, Form) => ({
  init({ kids={}, all=null, headOp=null, tailOp=null, ...args }={}) {
    Object.assign(this, { kids: Object.plain(kids), all, headOp, tailOp });
  },
  resolve({ conf, chain, getValue }) {
    
    // We'll have problems if the parent needs its children resolved first; the parent
    // would throw an Error saying something like "a.b.c requires a.b.c.d", which
    // short-circuits before "a.b.c.d" is returned as a further Action, meaning "a.b.c.d"
    // will never be initialized (results in churn failure)
    
    // Note "headOp" and "tailOp": the "head" and "tail" here refer to before and after the
    // ConfySet's children have done their parsing. This means that "headOp" is able to
    // format some non-setlike input into a set of child values (e.g. a comma-delimited
    // string into an array of items parsed from that String), while "tailOp" is finally
    // given the set of values which captures all child values, and operates on that set
    // (e.g. in order to validate some constraint incorporating multiple child values).
    
    if (conf === '!<def>') conf = {};
    
    if (this.headOp) conf = this.headOp({ conf, chain, getValue });
    
    if (isForm(conf, String)) conf = conf.split(/[,+]/);
    if (isForm(conf, Array)) conf = conf.toObj((v, i) => [ i, v ]);
    if (!isForm(conf, Object)) throw Error(`requires value resolving to Object; got ${getFormName(conf)}`);
    
    // Pass the '!<def>' value for every Kid
    conf = { ...{}.map.call(this.kids, v => '!<def>'), ...conf };
    
    let actions = {};
    for (let [ k, v ] of conf) {
      if (v === '!<rem>') continue;
      let kid = this.kids[k] ?? this.all;
      let kidChain = [ ...chain, k ];
      actions[kidChain.join('.')] = kid
        ? kid.getAction(v, kidChain)
        : () => Error(`Api: "${chain.join('.')}" has no Kid to handle "${k}"`).propagate({ conf });
    }
    
    // Processing afterwards looks a bit tricky - we add another
    // pending Action for the parent alongside all the Kid Actions -
    // this one will be able to reference values resulting from Kid
    // Actions! Note that this additional Action for the parent never
    // produces any further Actions!
    if (this.tailOp) actions[chain.join('.')] = values =>
      Form.wrapFn({ conf, chain }, () => this.tailOp({ conf, chain, getValue }));
    
    // Note that `result` can be overwritten by `tailOp`, and also by
    // merging in the results from all Kids
    return { result: conf, actions };
  }
})});
let ConfyVal = form({ name: 'ConfyVal', has: { Confy }, props: (forms, Form) => ({
  
  $settlers: Object.plain({
    bln: { target: Boolean, tries: [
      [ Number, v => !!v ],
      [ String, v => {
        if ([ 'yes', 'true', 't', 'y' ].has(v.lower())) return true;
        if ([ 'no', 'false', 'f', 'n' ].has(v.lower())) return false;
        throw Error(`failed resolving String "${v}" to Boolean`);
      }]
    ]},
    str: { target: String, tries: [] },
    num: { target: Number, tries: [
      [ String, v => {
        let num = parseInt(v, 10);
        let str = num.toString();
        if (v !== str && v !== '+' + str) throw Error(`failed resolving String "${v}" to Number`);
        return num;
      }]
    ]},
    arr: { target: Array, tries: [
      [ String, v => v.split(/[,+]/).map(v => v.trim() ?? skip) ],
      [ Object, v => v.toArr(v => v) ]
    ]}
  }),
  $rejectDefault: ({ chain }) => { throw Error('requires a value'); },
  
  init({ def=Form.rejectDefault, nullable=def===null, settle=null, fn=null, ...args }={}) {
    
    // - `def` is the default value or a synchronous Function giving a
    //   default value if the Confy receives "!<def>"
    // - `settle` is { target: Form, tries: [ [ Form1, fn1 ], [ Form2, fn2 ], ... ] }
    //   The settle "tries" must resolve the incoming value to the
    //   settle "target"; the only exception is if the incoming value
    //   is null and `nullable` is set to true
    // - `fn` arbitrarily rejects or transforms the given value; `fn`
    //   gets the final say after all logic has finished!
    
    if (isForm(settle, String)) {
      if (!Form.settlers[settle]) throw Error(`Api: invalid settle String "${settle}"`);
      settle = Form.settlers[settle];
    }
    if (settle && !isForm(settle, Object)) throw Error(`Api: when provided "settle" must resolve to Array; got ${getFormName(settle)}`);
    if (!hasForm(def, Function)) def = Function.createStub(def);
    
    Object.assign(this, { def, settle, fn, nullable });
    
  },
  async resolve({ conf, chain, getValue }) {
    
    if (conf === '!<def>') conf = this.def({ conf, chain, getValue });
    
    if (this.settle) {
      let orig = conf;
      let { target, tries } = this.settle;
      for (let [ Form, fn ] of tries) if (isForm(conf, Form)) conf = fn(conf);
      
      let valid = (conf === null && this.nullable) || isForm(conf, target);
      if (!valid) throw Error(`couldn't resolve value to ${target.name}`);
    }
    
    if (this.fn) conf = await this.fn(conf, { getValue });
    
    return { result: conf };
  }
  
})});
let ConfyNullable = form({ name: 'ConfyNullable', has: { Confy }, props: (forms, Form) => ({
  init(confy) { Object.assign(this, { confy }); },
  resolve({ conf, chain, getValue }) {
    if (conf === '!<def>') return { result: null };
    if (conf === null) return { result: null };
    //if (isForm(conf, Object) && conf.empty()) return { result: null };
    return { result: null, actions: { [chain.join('.')]: this.confy.getAction(conf, chain) }};
  }
})});

module.exports = { ConfySet, ConfyVal, ConfyNullable };
