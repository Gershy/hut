global.rooms['internal.real.htmlBrowser.Keep'] = async foundation => {
  
  let Layout = await foundation.getRoom('internal.real.generic.Layout');
  
  return form({ name: 'Keep', has: { Layout }, props: (forms, Form) => ({
    init: function({ protocol=null, uri, keepText=null, mode='separate' }={}) {
      
      // Note that a url is essentially a (protocol, uri)
      
      // Setting `protocol === null` will allow the client's agent to
      // determine the protocol to use to access `uri`
      
      if (!isForm(mode, String)) throw Error(`Mode must be String (got ${getFormName(mode)})`);
      if (![ 'separate', 'replace' ].has(mode)) throw Error(`Mode must be "separate" or "replace" (got ${mode})`);
      
      if (!uri) throw Error(`Must provide "uri"`);
      Object.assign(this, { protocol, uri, keepText, mode });
      
    },
    install: function(real) {
      
      let tmp = Tmp();
      
      let domNode = real.domNode;
      if (domNode.querySelector(':scope > a.keep')) throw Error(`Looks like a Keep Layout was already applied...`);
      
      let anchor = document.createElement('a');
      anchor.classList.add('keep');
      anchor.setAttribute('target', (this.mode === 'separate') ? '_blank' : '_self');
      
      Object.assign(anchor.style, { fontSize: '100%', textAlign: 'inherit', fontFamily: 'inherit', color: 'inherit' });
      
      domNode.appendChild(anchor);
      tmp.endWith(() => anchor.remove());
      
      return tmp;
      
    },
    render: function(real, domNode) {
      
      let anchor = domNode.querySelector(':scope > a.keep');
      let linkStr = this.protocol ? `${this.protocol}://${this.uri}` : this.uri;
      let showStr = this.getParam(real, 'keepText') ?? linkText;
      
      anchor.setAttribute('href', linkStr);
      anchor.textContent = showStr
      
      Object.assign(domNode.style, { display: 'inline' });
      
    }
  })});
  
};
