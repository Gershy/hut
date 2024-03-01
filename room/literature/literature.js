//  | Heirachy:
//  | - Literature (root)
//  |   - Page (url)
//  |     - Section (fragment)

global.rooms['literature'] = async () => {
  
  let Content = form({ name: 'Content', has: { Slots }, props: (forms, Form) => ({
    
    init({ name, desc=null, par=null }) { Object.assign(this, { name, desc, par, kids: [] }); },
    access(name) {
      if (/[^a-z0-9]/.test(name)) throw Error(`Api: name must be fully lowercase and alphanumeric`).mod({ name });
      return null
        ?? this.kids.seek(kid => kid.name === name).val
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
  
  let Scribe = form({ name: 'Scribe', props: (forms, Form) => ({
    init({ real, mode='root', depth=0 }) { Object.assign(this, { real, mode, depth, orderCount: 0 }); },
    scope(params) { return (0, this.Form)({ ...this, depth: this.depth + 1, ...params }); },
    // TODO: HEEERE!!! Port all items in trello to Scribe!
    section(term, fn) {
      
      let section = this.real.addReal('section', {
        Geom: { w: '100%' },
        Axis1d: { axis: 'y', mode: 'stack' },
        order: this.orderCount++
      });
      
      fn(this.scope({ real: section, mode: 'section' }));
      return section;
      
    },
    text(text) {
      return this.real.addReal('text', {
        Geom: { w: '100%' },
        Text: { text, align: 'fwd', spacing: '1vmin' }
      });
    },
    title(text) {
      return this.real.addReal('title', {
        Geom: { w: '100%' },
        Text: { text, align: 'fwd', spacing: '1vmin', size: '220%', style: 'bold', }
      });
    }
    
  })});
  
  let Literature = form({ name: 'Literature', has: { Slots }, props: (forms, Form) => ({
    
    init({ roomName, content }) {
      Object.assign(this, {
        roomName,
        content,
        experience: null,
        scribe: null,
        activeContentTmp: Tmp.stub
      });
    },
    
    async setContent(chain) {
      
      /// {DEBUG=
      if (!this.scribe) throw Error('Api: called setContent before activateBelow');
      /// =DEBUG}
      
      // TODO: This approach makes it impossible to have shared experiences within the Literature
      // content because the `getRoom` only occurs BELOW; but at the moment there's no way to have
      // it called ABOVE in sync, because doing so would effect the global state of the  BelowHut
      // and cause all tabs to snap to the same Literature content
      let contentRoom = [ ...token.dive(this.roomName), 'root', ...token.dive(chain) ].join('.');
      let scribeFn = await getRoom(contentRoom);
      
      let prevTmp = this.activeContentTmp;
      let nextTmp = this.activeContentTmp = Tmp();
      
      // Add the new section
      let pageReal = this.scribe.section(chain.join('.'), scribeFn);
      nextTmp.endWith(pageReal);
      
      // Remove the previous section
      prevTmp.end();
      
    },
    async activateBelow(experience, real=experience.real) {
      
      /// {DEBUG=
      // TODO: This is CLUMSY; this gets called multiple times ABOVE for each instance of BELOW
      // that connects
      // if (this.scribe) throw Error('Api: multiple activateBelow calls');
      /// =DEBUG}
      
      let tmp = Tmp();
      this.experience = experience;
      this.scribe = Scribe({ real });
      
      /// {BELOW=
      let belowHut = experience.lofterRh.rec;
      let locus = await belowHut.withRh('hut.locus', 'one');
      
      let contentChain = null;
      let locusLoadRoute = locus.valueSrc.route(({ diveToken }) => {
        
        // Dedup
        let newContentChain = diveToken.join('.');
        if (newContentChain === contentChain) return;
        contentChain = newContentChain;
        
        this.setContent(diveToken);
        
      });
      tmp.endWith(locusLoadRoute);
      /// =BELOW}
      
      return tmp;
      
    }
    
  })});
  
  return { Literature, Scribe, Content };
  
};