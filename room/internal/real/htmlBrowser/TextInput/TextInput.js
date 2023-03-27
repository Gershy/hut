global.rooms['internal.real.htmlBrowser.TextInput'] = async foundation => {
  
  let { MemSrc, Layout } = await foundation.getRooms([
    'logic.MemSrc',
    'internal.real.generic.Layout'
  ]);
  
  // Note that a TextInput Layout can't have any "inputted text" value
  // itself, because one Layout can be applied to multiple Reals, each
  // with different "inputted text". For this reason there's no use of
  // `getParam` for handling the currently input value; it's assumed to
  // always be set at `real.params.textInputVal`.
  
  return form({ name: 'TextInput', has: { Layout }, props: (forms, Form) => ({
    init: function({ multiline=false, textSize=null, align='mid', gap=null, text='', prompt='', textInputSrc=null, textInputFn=null }) {
      
      Object.assign(this, {
        multiline, textSize, align, gap,
        text, prompt,
        textInputSrc, textInputFn
      });
      
    },
    isInnerLayout: function() { return false; },
    install: function(real) {
      
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
      
      let domNode = real.domNode;
      if (domNode.querySelector(':scope > .textInput')) throw Error(`Looks like a TextInput was already applied...`);
      
      let textInputSrc = this.getParam(real, 'textInputSrc');
      let gotExternalInputSrc = textInputSrc && textInputSrc.onn();
      if (!gotExternalInputSrc) textInputSrc = real.params.textInputSrc = MemSrc.Prm1(this.getParam(real, 'text'));
      
      if (!isForm(textInputSrc, MemSrc.Prm1)) throw Error(`textInputSrc must be MemSrc.Prm1`);
      if (!isForm(textInputSrc.val, String)) throw Error(`textInputSrc.val must be String`);
      
      let tmp = Tmp();
      if (gotExternalInputSrc) {
        
        // Store the previous value to prevent duplicates being sent.
        // This is used to prevent the initial value being sent to
        // "textInputFn"! Note we don't manage ending `textInputSrc`, as
        // the context it was passed from is responsible for this
        let prevVal = textInputSrc.val;
        tmp.endWith(textInputSrc.route(val => {
          
          if (val === prevVal) { return; } else { prevVal = val; }
          
          // Always call the "textInputFn" with the modified `val`
          this.getParam(real, 'textInputFn')?.(val);
          
        }));
        
      } else {
        
        // `textInputSrc` was created in this scope, so manage ending it
        tmp.endWith(textInputSrc);
        tmp.endWith(textInputSrc.route(val => {
          
          // Always call the "textInputFn" with the modified `val`
          this.getParam(real, 'textInputFn')?.(val);
          
        }));
        
      }
      
      let input = this.multiline
        // Implement multi-line with <textarea></textarea>
        ? document.createElement('textarea')
        // Implement single-line with <input type="text" />
        : onto(document.createElement('input'), e => e.setAttribute('type', 'text'));
      input.classList.add('textInput');
      input.style.gain({
        position: 'absolute', display: 'block', boxSizing: 'border-box',
        width: '100%', height: '100%', left: '0', top: '0',
        padding: 'inherit', border: 'none', backgroundColor: 'transparent',
        textAlign: 'inherit', fontFamily: 'inherit', color: 'inherit',
        fontSize: '100%' // Be careful not to "inherit" font size - that would multiply any font sizing!
      });
      domNode.appendChild(input);
      
      // `domNode` has 0 height by default; adding an inline element
      // containing any non-whitespace text fixes that!
      let heightener = document.createElement('span');
      heightener.textContent = '\u2195'; // This is an "up-down arrow"
      heightener.style.gain({ visibility: 'hidden', pointerEvents: 'none' });
      domNode.appendChild(heightener);
      
      // Updates to `textInputSrc` propagate to dom
      let updateValueRoute = textInputSrc.route(val => input.value !== val && (input.value = val));
      
      // User edits in the dom propagate to `textInputSrc`
      let inputEventFn = evt => textInputSrc.mod(input.value);
      input.addEventListener('input', inputEventFn);
      
      tmp.endWith(() => {
        input.remove();
        heightener.remove();
        updateValueRoute.end();
        input.removeEventListener('input', inputEventFn);
      });
      
      return tmp;
      
    },
    render: function(real, domNode) {
      
      // Note that defining the height in em units automatically takes
      // the text size into account, so simply `1em` avoids additional
      // multiplication by the text size
      domNode.style.fontSize = this.getParam(real, 'textSize') ?? '100%';
      
      if (this.align) domNode.style.textAlign = { fwd: 'left', bak: 'right', mid: 'center' }[this.align];
      if (this.gap) Object.assign(domNode.style, { boxSizing: 'border-box', padding: this.gap });
      
      let inputElem = domNode.querySelector(`:scope > ${this.multiline ? 'textarea' : 'input'}.textInput`);
      let prompt = this.getParam(real, 'prompt');
      if (prompt) inputElem.setAttribute('placeholder', prompt);
      
    }
  })});
  
};
