//  | Heirachy:
//  | - Page (url)
//  |   - Section (fragment)
//  | 

global.rooms['literature'] = async () => {
  
  let Content = form({ name: 'Content', has: { Slots }, props: (forms, Form) => ({
    
    init({ name, desc=null, par=null }) { Object.assign(this, { name, desc, par, kids: [] }); },
    access(name) {
      return null
        ?? this.kids.find(kid => kid.name === name).val
        ?? this.kids.add((0, this.Form)({ name, par: this }));
    },
    chain() {
      let chain = [];
      let ptr = this;
      while (ptr) { chain.push(ptr); ptr = ptr.par; }
      return chain.reverse().map(c => c.name);
    },
    * iterate() {
      
      yield this;
      for (let kid of this.kids) yield* kid.iterate();
      
    }
    
  })});
  
  let Literature = form({ name: 'Literature', has: { Slots }, props: (forms, Form) => ({
    
    init({ content }) { Object.assign(this, { content }); },
    
    /// {ABOVE=
    activateAbove(experience, real=experience.real) {
      
      let tmp = Tmp();
      
      for (let kid of this.content.iterate()) {
        
        let chain = kid.chain();
        tmp.endWith(experience.addCommandHandler(chain.slice(1).join('.'), async ({ ms, reply, road, msg, src }) => {
          
          // TODO: This is such obscene sacrilege...
          if (src.hid === '!anon') return reply(String.baseline(`
            | <a href="/${chain.slice(1).join('/')}?trn=sync">This way!</a>
          `));
          
          let belowHut = src;
          let aboveHut = belowHut.aboveHut;
          
          // HEEERE PROBLEM #1: Different tabs, different urls...
          // TODO: This works and gets the Lofter, but... who cares? Don't want to store the url
          // nav info on a Record, because it should be able to be different for every tab...
          // Unless a value is stored on the Lofter for each tab??? (Then need to correlate tabs
          // with stored urls above, etc....... UGH)
          // I think there should be a special ephemeral Record per tab in a Below environment,
          // then literature could operate client-side, and simply update the value of that Record
          // e.g. `man.addRecord('locus', [ belowHut ], {})` and then we could start doing stuff
          // like the following when the user clicks a link:
          //    | belowHut.withRh('locus', 'one').then(locus => locus.setValue({ path: newPath }))
          // Or if `withRh` resolves immediately for local objects, even:
          //    | belowHut.withRh('locus', 'one').setValue({ path: newPath });
          // But don't forget that the even bigger problem is that multiple tabs *do not function*
          // at the moment! Think about inactive tabs refreshing when they become refocused??
          // 
          // PROBLEM #2:
          // TODO: Navigation to arbitrary links is done using trn=anon, which prevents the
          // "hut:hutify" action from taking place - this means shit doesn't render for any link
          // except for the root path!!! I think the fix will be always using trn=sync by default,
          // and clients can opt into using trn=anon to help the server save processing...
          
          belowHut.withRh(`${experience.pfx}.lofter`, 'one').then(lofter => {
            gsc({ lofter });
          });
          
          aboveHut.runCommandHandler({ ms, reply, road, src, msg: { ...msg, command: 'hut:hutify' } });
          
        }));
        
      }
      
      return tmp;
      
    }
    /// =ABOVE}
    
  })});
  
  return { Literature, Content };
  
};