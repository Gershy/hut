'use strict';

require('../room/setup/clearing/clearing.js');

let Schema = module.exports = form({ name: 'Schema', has: { Slots }, props: (forms, Form) => ({
  
  // Note that Schemas return Conf (pure json). Any translation to typed
  // data (e.g. NetworkIdentity, Keep, etc) happens externally!
  // Ok I am revising the above. A Schema can deal with non-json, even
  // non-serializable values, but it isn't recommended in most cases
  // (TODO: May be nice to have explicit serializability controls to
  // prevent attempts to transfer non-serializable (or sensitive) data
  // over the wire)
  // Note that for the purposes of running Hut Above we simply use this
  // Schema Form to process the configuration (potentially producing
  // useful error output), and then simply do away with the Schema
  // instances and work directly with the data parsed by them!
  
  init({ name='??', par=null }={}) {
    
    Object.assign(this, {
      name, par,
      kids: Object.plain(),
      all: null,
      fn: null,
      pending: Set()
    });
    denumerate(this, 'par');
    denumerate(this, 'kids');
    
  },
  desc() { return `${getFormName(this)}( ${this.chain()} )`; },
  chain() {
    
    let chain = [];
    let ptr = this;
    while (ptr) { chain.push(ptr.name); ptr = ptr.par; }
    return chain.reverse().slice(1).join('.');
    
  },
  access(name) {
    if (name === '*') {
      if (!this.all) this.all = Schema({ name: '(all)', par: this });
      return this.all;
    } else {
      if (!this.kids[name]) this.kids[name] = Schema({ name, par: this });
      return this.kids[name];
    }
  },
  inner(obj, chain=[]) {
    
    let kidsAndObj = { ...{}.map.call(this.kids, v => null), ...obj };
    
    if (kidsAndObj.empty()) return null;
    return kidsAndObj.map((v, k) => {
      
      // Omit `null` and `skip`
      if (v == null) return skip;
      
      // Resolve "<default>" to `null` without omitting
      if (v === '<default>') v = null;
      
      // Return references unchanged
      if (isForm(v, String) && v[0] === '@') return v;
      
      if (this.kids[k]) return this.kids[k].getConf(v, [ ...chain, k ]);
      if (this.all) return this.all.getConf(v, [ ...chain, k ]);
      throw Error(`Api: unexpected chain "${chain.join('.')}"`).mod({ schema: this.desc(), key: k, val: v });
      
    });
    
  },
  getConf(obj, chain='') { return this.fn ? this.fn(obj, this, chain) : this.inner(obj, chain); }
  
})});
