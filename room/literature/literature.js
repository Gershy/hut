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
    }
    
  })});
  
  let Literature = form({ name: 'Literature', has: { Slots }, props: (forms, Form) => ({
    
    init({ content }) { Object.assign(this, { content }); },
    /// {ABOVE=
    activate(experience) {
      
      let tmp = Tmp();
      tmp.endWith(experience.addCommandHandler('abcd', ({ ms, reply, road, msg, src }) => {
        
        reply({ msg: 'HELLO' });
        
      }));
      return tmp;
      
    }
    /// =ABOVE}
    
  })});
  
  return { Literature, Content };
  
};