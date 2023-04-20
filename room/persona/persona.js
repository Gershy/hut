global.rooms['persona'] = async foundation => {
  
  let rooms = await foundation.getRooms([ 'logic.Chooser' ]);
  let { Chooser } = rooms;
  
  let PersonaSrc = form({ name: 'PersonaSrc', has: { Endable, Src }, props: (forms, Form) => ({
    
    $validateUser: user => {
      if (!isForm(user, String)) throw Error(`Username should be String`);
      if (user.length < 3) throw Error(`Username should be minimum 3 characters`);
      if (!/^[a-zA-Z][a-zA-Z0-9]+$/.test(user)) throw Error(`Username must start with alpha, and consist only of alphanumeric`);
    },
    $validatePass: pass => {
      if (!isForm(pass, String)) throw Error(`Password should be String`);
      if (pass.length < 8) throw Error(`Password should be minimum 8 characters`);
    },
    
    init({ hut, rec, ...opts }) {
      
      let { pfx=rec.type.getPrefix(), personaName=`${pfx}.persona`, accountName=`${pfx}.account` } = opts;
      let { credentialName=`${pfx}.credential` } = opts;
      let { loginActName=`${pfx}.login` } = opts;
      
      forms.Endable.init.call(this);
      forms.Src.init.call(this);
      Object.assign(this, {
        
        hut, rec,
        personaName, accountName, credentialName, loginActName,
        getPersonaTmp: null, loginTmp: null,
        
        persona: null
        
      });
      
      let personaRh = hut.rh(this.personaName);
      let personaRoute = personaRh.route(hPersona => this.send(this.persona = hPersona.rec));
      
      this.getPersonaTmp = Tmp();
      this.getPersonaTmp.endWith(personaRh);
      this.getPersonaTmp.endWith(personaRoute);
      
    },
    addLogin(loginReal) {
      
      // Note the passed Real is initialized external to persona.js, but
      // should probably have had absolutely no configuration done by
      // the consuming code; it's meant to be a "tabula rasa" Real from
      // the consuming application
      
      if (this.loginTmp && this.loginTmp.onn()) throw Error('A login is already active...');
      
      let loginAct = this.hut.enableAction(this.loginActName, async ({ user, pass }={}) => {
        
        Form.validateUser(user);
        Form.validatePass(pass);
        
        let account = await this.rec.withRh({
          type: this.accountName,
          limit: 1,
          opts: { filter: sel => then(sel.getValue(), v => v.user === user) },
          fn: rh => rh.getRec()
        });
        
        if (!account) {
          
          // Create account if none exists
          account = this.hut.addRecord(this.accountName, [ this.rec ], { user });
          let creds = this.hut.addRecord(this.credentialName, [ account ], { pass });
          await Promise.all([ account.bankedPrm, creds.bankedPrm ]);
          
        }
        
        let creds = await account.withRh({
          type: this.credentialName,
          limit: 1,
          opts: { filter: sel => sel.mems[this.accountName] === account.uid },
          fn: rh => rh.getRec()
        });
        
        if (creds.getValue('pass') !== pass) throw Error(`Invalid credentials`);
        
        this.hut.addRecord(this.personaName, [ this.hut, account ], { ms: foundation.getMs() });
        
      });
      
      let userField = loginReal.addReal('user', [
        { form: 'TextInput', prompt: 'username' }
      ]);
      let passField = loginReal.addReal('pass', [
        { form: 'TextInput', prompt: 'password' }
      ]);
      let submitField = loginReal.addReal('submit', [
        { form: 'Text', text: 'Submit' },
        { form: 'Press', pressFn: () => loginAct.act({
          user: userField.params.textInputSrc.val,
          pass: passField.params.textInputSrc.val
        })}
      ]);
      
      this.loginTmp = Tmp();
      this.loginTmp.endWith(loginAct);
      return this.loginTmp;
      
    },
    
    srcFlags: { memory: true, singleton: true, tmpsOnly: true },
    countSent() { return this.persona ? 1 : 0; },
    getSent() { return this.persona ? [ this.persona ] : []; },
    newRoute(fn) { this.persona && fn(this.persona); },
    
    cleanup() {
      
      this.persona = null;
      this.getPersonaTmp.end();
      this.loginTmp && this.loginTmp.end();
      
    }
    
  })});
  
  return { PersonaSrc };
  
};
