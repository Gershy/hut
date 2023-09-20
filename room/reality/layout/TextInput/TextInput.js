global.rooms['reality.layout.TextInput'] = async () => {
  
  let { MemSrc, Text } = await getRooms([
    'logic.MemSrc',
    'reality.layout.Text'
  ]);
  return form({ name: 'TextInput', has: { Text }, props: (forms, Form) => ({
    
    init({ multiline=false, prompt='', textInputSrc=null, textInputFn=null, ...textArgs }={}) {
      
      /// {DEBUG=
      if (multiline?.constructor !== Boolean) throw Error(`Api: "multiline" should be Boolean; got ${getFormName(multiline)}`);
      /// =DEBUG}
      
      forms.Text.init.call(this, textArgs);
      Object.assign(this, { multiline, prompt, textInputSrc, textInputFn });
      
    },
    install(real) {
      
      // Note that `textInputSrc` becomes the singular source of truth
      // for the Layout's inputted value. Sends from `textInputSrc` will
      // update the Layout's visually inputted value. User changes to
      // the input's value will cause Sends on `textInputSrc`. The
      // TextInput also offers "textInputFn" as shorthand access to
      // changing values, but note that the "textInputFn" is only called
      // via Sends from `textInputSrc`.
      // Note we need to decide whether "textInputFn" is called upon
      // initialization of the TextInput. This can be desirable in many
      // circumstances, but consider:
      //    | dep.scp(appRec, 'eg.textItem', (textItem, dep) => {
      //    |   
      //    |   let updTextAct = dep(hut.enableAction(({ val }) => { /* update server-side value of `textItem` */ }));
      //    |   
      //    |   let textItemReal = appReal.addReal('eg.textItem', { textInputSrc: textItem.valueSrc }, [
      //    |     { form: 'TextInput', textInputFn: val => updTextAct.act({ val }) },
      //    |   ]);
      //    |   
      //    | });
      // This is probably a common use-case, and if "textInputFn" is
      // called upon creation of the "eg.textItem" Real, the same value
      // that was just received from the server will immediately bounce
      // back to the server via `updTextAct`.
      // The current logic is to call "textInputFn" immediately only if
      // a `textInputSrc` needed to be created
      
      let tmp = forms.Text.install.call(this, real);
      
      let textInputSrc = this.getParam(real, 'textInputSrc');
      let gotExternalInputSrc = !!textInputSrc;
      if (!gotExternalInputSrc) {
        textInputSrc = real.params.textInputSrc = MemSrc(this.getParam(real, 'text'));
        tmp.endWith(textInputSrc);
      }
      
      /// {DEBUG=
      if (!isForm(textInputSrc, MemSrc)) throw Error(`textInputSrc must be MemSrc`);
      if (!isForm(textInputSrc.val, String)) throw Error(`textInputSrc.val must be String`);
      /// =DEBUG}
      
      // There are 3 types of Layout/Real Params:
      // 1. Layout only: the Layout never calls `getParam`
      // 2. Installation-time: `getParam` is called once when installing
      // 3. Realtime: `getParam` is called whenever rendering
      let textInputFn = this.getParam(real, 'textInputFn');
      if (this.textInputFn) {
        
        let prev = textInputSrc.val;
        let inputRoute = textInputSrc.route(gotExternalInputSrc
          // If the MemSrc is consumer-owned must debounce; it prevents echoing back to Above
          ? val => (val !== prev) && (prev = val, textInputFn(val))
          
          // Otherwise don't debounce - the function may also immediately receive an initial value
          : textInputFn
        );
        
        tmp.endWith(inputRoute);
        
      }
      
      return tmp;
      
    }
    
  })});
  
};
