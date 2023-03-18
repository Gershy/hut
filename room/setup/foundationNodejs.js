'use strict';

// TODO: Write a test room with a SyntaxError caused by `continue`
// appearing outside any loop - the stack trace isn't handled well!

require('./foundation.js');

let { Foundation } = global;
let NetworkIdentity = require('./nodejs/NetworkIdentity.js');
let niceRegex = (...args) => {
  
  let [ flags, str ] = (args.length === 2) ? args : [ '', args[0] ];
  
  let lns = str.split('\n').map(line => line.trimTail());
  let cols = Math.max(...lns.map(line => line.length)).toArr(col => Set(lns.map(ln => ln[col])));
  cols.each(col => col.size > 1 && col.rem(' '));
  
  /// {DEBUG=
  for (let col of cols) if (col.size > 1) throw Error(`Conflicting values at column ${num}: [${[ ...col ].join('')}]`);
  /// =DEBUG}
  
  return RegExp(cols.map(col => [ ...col ][0]).join(''), flags);
  
};

let { FilesysTransaction, Filepath } = require('./nodejs/filesys.js');
let hutFp = Filepath(__dirname).par();
let hutTrn = FilesysTransaction(hutFp);

global.FoundationNodejs = form({ name: 'FoundationNodejs', has: { Foundation }, props: (forms, Form) => ({
  
  $KeepNodejs: form({ name: 'KeepNodejs', has: { Keep }, props: forms => ({
    
    init() {
      
      forms.Keep.init.call(this);
      
      let fileSystemKeep = Form.KeepFileSystem({ fp: hutFp, secure: true, blacklist: Set([ '.git', '.gitignore', 'mill' ]) });
      this.keepsByType = {
        static:             Form.KeepStatic(fileSystemKeep),
        fileSystem:         fileSystemKeep,
        adminFileSystem:    Form.KeepFileSystem({ fp: hutFp, secure: false }),
        compiledFileSystem: Form.KeepFileSystem({ fp: hutFp.kid([ 'mill', 'cmp' ]), secure: true })
      };
      
    },
    access(type) {
      
      if (this.keepsByType.has(type)) return this.keepsByType[type];
      throw Error(`Invalid type "${type}" (options are: ${this.keepsByType.toArr((v, k) => `"${k}"`).join(', ')})`);
      
    }
    
  })}),
  $KeepStatic: form({ name: 'KeepStatic', has: { Keep }, props: (forms, Form) => ({
    
    init(sourceKeep) {
      this.sourceKeep = sourceKeep;
      this.hut = null;
    },
    
    // TODO: Instead of having a single KeepStatic linked to a single
    // hut should consider `access`ing a new "KeepStaticHut" instance
    // via a Hut seek parameter. `KeepStatic` could track all existing
    // instances of "KeepStaticHut" to avoid creating multiple
    // instances for the same Hut. KeepStaticHut could inherit from
    // Tmp as well as Keep to facilitate it ending when its Hut ends.
    // And would need to clean up the mapped entry in `KeepStatic` if
    // the "KeepStaticHut" ends.
    // Could even support multiple "access" param types. For example:
    //    |   hut.access('static', [ 'room', 'testy', 'asset', 'testy.jpg' ]);
    // retrieves a Keep available to any client, whereas:
    //    |   hut.access('static', instanceOfHut);
    // retrieves a more specialized Keep for accessing content only
    // available to a particular Hut instance

    access(fpCmps) {
      
      // Make Keep available Below
      let key = [ '!static', ...fpCmps ].join('/');
      let keep = this.sourceKeep.seek(fpCmps);
      if (!this.hut.roadSrcs[key]) this.hut.roadSrc(key).route(tell => tell.reply(keep));
      return keep;
      
    }
    
  })}),
  $KeepFileSystem: form({ name: 'KeepFileSystem', has: { Keep }, props: (forms, FormFs) => ({
    
    $extToContentType: {
      json: 'text/json; charset=utf-8',
      html: 'text/html; charset=utf-8',
      css: 'text/css; charset=utf-8',
      txt: 'text/plain; charset=utf-8',
      ico: 'image/x-icon',
      png: 'image/png',
      jpg: 'image/jpeg',
      svg: 'image/svg+xml'
    },
    
    $HoneyPotKeep: form({ name: 'HoneyPotKeep', has: { Keep }, props: (forms, Form) => ({
      init(data=[ 'passwords', 'keys', 'tokens', 'secrets', 'credentials', 'bitcoin', 'wallet', 'vault', 'config' ]) { this.data = data; },
      access() { return this; },
      exists() { return true; },
      setContentType() { return this; },
      getContentType() { return 'application/json; charset=utf-8'; },
      getContent() { return this.data; },
      setContent() {},
      getContentByteLength() { return Buffer.byteLength(valToJson(this.data)); },
      getTailPipe() { return ({ pipe: async res => res.end(valToJson(this.data)) }); },
      desc() { return `${getFormName(this)}`; }
    })}),
    init({ fp=Filepath(require('os').tmpdir()), secure=true, blacklist=Set.stub }) {
      
      // NOTE: internal.install was serving its "install.log" file,
      // as the `node hut.js ...` command wound up writing install.log
      // directly to the <hutRepo> dir. I think the philosophy going
      // forward is that the only sensitive directory in all of hut
      // is "mill" (which is blacklisted by the non-admin file Keep).
      // With this in mind, the install.log file shouldn't be written
      // inside <hutRepo>, unless it's inside "mill". Every file in
      // Hut, outside of "mill", is considered public/insensitive.
      
      Object.assign(this, { fp, secure, blacklist });
      
    },
    desc() { return `${getFormName(this)}( ${this.fp.desc()} )`; },
    
    contains(fsKeep) { return this.fp.contains(fsKeep.fp); },
    equals(fsKeep) { return this.fp.equals(fsKeep.fp); },
    
    access(dirNames) {
      
      if (isForm(dirNames, String)) dirNames = dirNames.split(/[/\\]/);
      if (!isForm(dirNames, Array)) throw Error(`Dir names must be Array or String (got ${getFormName(dirNames)})`);
      if (dirNames.find(d => !isForm(d, String)).found) throw Error(`All dir names must be Strings`);
      
      // Remove any redundant cmps
      dirNames = dirNames.map(d => (d === '' || d === '.') ? skip : d);
      
      // Ensure all cmps are valid
      if (this.secure && dirNames.find(d => d === '..').found) return FormFs.HoneyPotKeep();
      if (this.blacklist.has(dirNames[0])) return FormFs.HoneyPotKeep(); // TODO: Sufficient to check only the 1st component??
      
      // No need to create a child for 0 cmps
      if (!dirNames.count()) return this;
      
      let KeepForm = this.Form;
      return KeepForm({ fp: this.fp.kid(dirNames), secure: this.secure });
      
    },
    
    setContentType(contentType) { this.contentType = contentType; return this; },
    getContentType() {
      
      if (this.contentType) return this.contentType;
      let lastCmp = this.fp.cmps.slice(-1)[0];
      let [ pcs, ext=null ] = lastCmp.split('.').slice(-2); // Final 2 period-delimited components are more reliable
      
      return FormFs.extToContentType.has(ext) ? FormFs.extToContentType[ext] : 'application/octet-stream';
      
    },
    
    async getContent(opts={}) {
      
      if (isForm(opts, String)) opts = { encoding: opts };
      let { encoding=null } = opts ?? {};
      if (encoding === 'json') opts = { ...opts, encoding: null };
      
      let content = await hutTrn.getData(this.fp, opts);
      if (!content.length) return null;
      
      if (encoding === 'json') return jsonToVal(content);
      return content;
      
    },
    async setContent(content, opts={}) {
      
      if (isForm(opts, String)) opts = { encoding: opts };
      let { encoding=null } = opts ?? {};
      if (encoding === 'json') opts = { ...opts, encoding: 'utf8' };
      
      // Note that only `null` will delete the subtree; empty Strings/Buffers
      // simply clear the Leaf
      if (content === null) return hutTrn.remSubtree(this.fp);
      
      if (encoding === 'json') content = valToJson(content);
      return hutTrn.setData(this.fp, content);
      
    },
    async getContentByteLength() { return hutTrn.getDataBytes(this.fp); },
    async exists() { return (await this.getContentByteLength()) > 0; },
    async getChildNames(opts={}) {
      let names = await hutTrn.getKidNames(this.fp);
      return names.map(fp => this.blacklist.has(fp) ? skip : fp);
    },
    async getHeadPipe() { return hutTrn.getDataHeadStream(this.fp); },
    async getTailPipe() { return hutTrn.getDataTailStream(this.fp); },
    iterateChildren(dbg=Function.stub) {
      
      // Returns { [Symbol.asyncIterator]: fn, close: fn }
      return hutTrn.iterateNode(this.fp, { map: n => this.blacklist.has(n) ? skip : [ n, this.access(n) ] });
      
    }
    
  })}),
  
  // Note that "#", a totally irrelevant character, is replaced with "`"
  // making it simpler to indicate literal backtick chars
  $captureLineCommentRegex: niceRegex(String.baseline(`
    | (?<=                                  )
    |     ^(      |       |       |       )*
    |       [^'"#] '[^']*' "[^"]*" #[^#]*#
    |                                        [ ]*
    |                                            [/][/].*
  `).replace(/#/g, '`')),
  $captureInlineBlockCommentRegex: niceRegex('g', String.baseline(`
    | (?<=                                           )
    |     ^(?:     |           |           |       )*
    |         [^'"] ['][^']*['] ["][^"]*["] #[^#]*#   [ ]*
    |                                                     [/][*](?:            )*[*][/]
    |                                                              [^*]|[*][^/]
  `).replace(/#/g, '`')),
  
  $resolveDeepObj: obj => {
    
    let { main={}, deep={} } = obj.categorize((v, k) => k.has('.') ? 'deep' : 'main');
    obj = main;
    
    for (let [ deepKey, v ] of deep) {
      
      let props = deepKey.split('.');
      let last = props[props.length - 1];
      
      let ptr = obj;
      for (let prop of props.slice(0, -1)) {
        if (!ptr[prop])                      ptr[prop] = {};
        else if (!isForm(ptr[prop], Object)) throw Error(`Deep property "${deepKey}" encountered a non-Object (${getFormName(ptr[prop])}) in its path`).mod({ obj });
        ptr = ptr[prop];
      }
      
      ptr[last] = v;
      
    };
    
    return obj;
    
  },
  $defSubconsVal: {
    
    'dev': { // Installed at `global.gsc` during `FoundationNodejs(...).configure`
      enabled: true,
      therapist: false
    },
    'warning': {
      enabled: true,
      therapist: true
    },
    
    'bank': {
      desc: String.baseline(`
        | Banks control how changes to data persist, including under circumstances where relevant hardware components or software processes become unavailable.
        | Control Subcon information regarding how the Bank is keeping data persisted.
      `),
      enabled: false
    },
    'bank.keep': {
      desc: String.baseline(`
        | Banks backed up by Keeps are resilient against scenarios where relevant hardware components or software processes become unavailable.
        | Control Subcon information regarding what information is being stored to protect it from outages.
      `),
      enabled: false
    },
    
    'conf.keep': {
      desc: String.baseline(`
      | The Conf Keep stores additional configuration data.
      | Control Subcon information about the Keep being used to store additional configuration.
      `),
      enabled: false
    },
    'conf.provided': {
      desc: String.baseline(`
        | Conf may be provided directly and via a Keep.
        | Control Subcon output about which values were received directly and from the Keep, and how they were merged.
      `),
      enabled: false,
      format: (f, p, { raw, keep, full }) => {
        
        return [
          `conf provided directly:`,
          f.formatAnyValue(raw),
          '',
          `conf derived from Keep:`,
          f.formatAnyValue(keep),
          '',
          `merged conf:`,
          f.formatAnyValue(full)
        ].join('\n');
        
      }
    },
    'conf.resolved': {
      desc: String.baseline(`
        | Conf configures a Hut deployment.
        | Control Subcon information which explicitly shows how the current Hut deployment is configured.
      `),
      enabled: false
    },
    
    'deploy': {
      desc: String.baseline(`
        | Deployment refers to the running of a Hut process (regardless of Closet or Loft)
        | Control Subcon information about the attempt to run a Hut process, and the result of this attempt.
      `),
      enabled: false
    },
    
    'compile.result': {
      enabled: false
    },
    
    'heap.sample': {
      desc: String.baseline(`
        | The Heap is the limited pool of memory which stores most Hut values.
        | Control Subcon sampling of the Heap to show how memory usage is changing over time.
      `),
      enabled: false,
      ms: 5000,
      format: (f, p, { consumed, remaining, amt }) => {
        
        let strs = [
          consumed.toFixed(2),
          remaining.toFixed(2),
          (amt * 100).toFixed(2)
        ];
        let max = Math.max(...strs.map(s => s.length));
        
        return(String.baseline(`
          | heap consumed:  ${strs[0].padHead(max)}mb
          | heap remaining: ${strs[1].padHead(max)}mb
          | heap used:      ${strs[2].padHead(max)}%
        `));
        
      }
    },
    
    'hinterland': {
      desc: String.baseline(`
        | Control Subcon output regarding the presence of Huts in the Hinterland.
      `),
      enabled: false
    },
    
    'loft': {
      desc: String.baseline(`
        | A Loft is a custom Hut process that persists until it is manually ended. Lofts typically involve shared experiences between multiple users.
        | Control Subcon information regarding the currently running Loft.
      `),
      enabled: true
    },
    
    'network.server.active': {
      desc: String.baseline(`
        | Servers are publicly reachable information sources that can be pinpointed using an address (domain-name or ip-address), and port number. Hut Lofts initiate Servers in order to communicate information to the public.
        | Control Subcon information about which addresses and ports have been configured by the current Loft (this can help to figure out how to communicate with an active Loft).
      `),
      enabled: true
    },
    'network.address.autodetect': {
      desc: String.baseline(`
        | NetworkAddresses typically pinpoint a publicly accessible source of information (probably a computer somewhere in the world willing to talk to the public). A single computer may have multiple NetworkAddresses that all pinpoint it. Hut can automatically detect the best NetworkAddress to allow the public to pinpoint your computer.
        | Control Subcon information regarding how Hut is determining the default NetworkAddress for your computer.
      `),
      enabled: false
    },
    'network.http.raw': {
      desc: String.baseline(`
        | Http is a low-level protocol that Hut uses to send messages between Huts.
        | Control Subcon information about the raw http values being sent between Huts.
      `),
      payloadMaxChars: 200,
      mode: 'synced', // "immediate", "synced" (wait for Response before outputting both together), "error" (same as "synced", but ignore codes < 400)
      enabled: false,
      reqLines: (req, { payloadMaxChars }) => [
        
        '<<< Incoming <<<',
        `${req.method} ${req.url} HTTP/${req.version}`,
        ...req.headers.toArr((vals, name) => {
          name = name.replace(/(^|-)[a-z]/g, v => v.upper());
          return vals.map(val => `${name}: ${val}`);
        }),
        '\\r\\n',
        ...(req.body ?? '').toString('utf8').split('\n').map(v => v.trim() || skip),
        '\\r\\n'
        
      ],
      resLines: (res, { payloadMaxChars }) => [
        
        '>>> Outgoing >>>',
        `HTTP/${res.version} ${res.code} ${res.status}`,
        ...res.headers.toArr((vals, name) => {
          name = name.replace(/(^|-)[a-z]/g, v => v.upper());
          return vals.map(val => `${name}: ${val}`);
        }),
        '\\r\\n',
        ...(() => {
          
          if (hasForm(res.body, Keep)) return [ `<${res.encode} stream ${res.body.desc()}>` ];
          
          let str = res.body.toString().trim();
          if (!str) return [];
          
          return (str.length > payloadMaxChars)
            ? [ `${str.slice(0, payloadMaxChars)} \u2026 ${str.length - payloadMaxChars} more chars` ]
            : [ str ];
          
        })(),
        '\\r\\n'
        
      ],
      format: (f, p, data) => {
        
        /*
        
        {
          type: 'req',
          version: req.httpVersion,
          method: req.method,
          url: req.url,
          headers: req.headers.map(vals => isForm(vals, Array) ? vals : [ vals ]),
          body
        }
        
        {
          type: 'res',
          version: res.httpVersion,
          code,
          headers: req.headers.map(vals => isForm(vals, Array) ? vals : [ vals ]),
          body: keep ? null : body,
          keep
        }
        
        */
        
        // Ignore non-error responses in "error" mode
        if (p.mode === 'error' && data.res.code < 400) return;
        
        if      (data.type === 'req')    return p.reqLines(data, p).flat().join('\n');
        else if (data.type === 'res')    return p.resLines(data, p).flat().join('\n');
        else if (data.type === 'synced') return [ ...p.reqLines(data.req, p), '', ...p.resLines(data.res, p) ].flat().join('\n');
        else if (data.type === 'error')  return [ ...p.reqLines(data.req, p), '', ...p.resLines(data.res, p) ].flat().join('\n');
        else                             throw Error(`Unexpected type: "${data.type}"`).mod({ data });
        
      }
    },
    'network.sokt.raw': {
      desc: String.baseline(`
        | WebSockets (and ws protocol) are used to efficiently transport low-level messages between Huts.
        | Control Subcon information about the raw values being sent between Huts using WebSockets.
      `),
      payloadMaxChars: 200,
      enabled: false
    },
    'network.server.status': {
      desc: String.baseline(`
        | Control Subcon information about how NetworkIdentities are managing their Servers.
      `),
      enabled: false
    },
    
    'record.instance': {
      desc: String.baseline(`
        | Control Subcon information regarding the existence of Records
      `),
      enabled: false
    },
    'record.sample': {
      desc: String.baseline(`
        | A Hut Deployment can make changes to the set of Records over time. Some Records can reside purely in the Bank, while others need to be stored in memory.
        | Control Subcon information regarding the number of Records in the Bank and in Memory.
      `),
      enabled: false,
      ms: 5000
    },
    'record.sync': {
      desc: String.baseline(`
        | AboveHuts sync Record changes to their BelowHuts.
        | Control Subcon information regarding how the AboveHut and BelowHut are handling Record syncing.
      `),
      enabled: false
    },
    
    'road.traffic': {
      desc: String.baseline(`
        | Roads manage mid-level communication between all Huts. (Note that lower-level protocols are used to implement Roads.)
        | Control Subcon information regarding the mid-level messages being communicated between Huts
      `),
      enabled: false,
      payloadMaxChars: 200,
      includeSrcless: true,
      format: (f, p, data) => {
        
        if (data.type === 'hold') return `->HOLD ${data.hut} on ${data.server} (num roads: ${data.numRoads}; addrs: "${data.netAddrs.join('", "')}")`;
        if (data.type === 'drop') return `<-DROP ${data.hut} on ${data.server} (num roads: ${data.numRoads})`;
        
        if (data.type === 'join') return `>>JOIN ${data.hut}`;
        if (data.type === 'exit') return `<<EXIT ${data.hut}`;
        
        if ([ 'cosm', 'comm' ].has(data.type)) {
          
          if (!data.src && !p.includeSrcless) return '';
          
          let dbgStr = valToJson(data.msg);
          if (dbgStr.count() > p.payloadMaxChars) dbgStr = dbgStr.slice(0, p.payloadMaxChars - 1) + '\u2026';
          return `--${data.type.upper()} ${data.src} -> ${data.trg}: ${dbgStr}`;
          
        }
        
      }
    },
    
    'subcon': {
      desc: String.baseline(`
        | Subcon is the "subconscious" of a Hut process.
        | Control Subcon information regarding what Subcon information will be available for this Hut process.
      `),
      enabled: false
    },
    
    'test.lowLevel': {
      desc: String.baseline(`
        | Low-level tests ensure reliability of basic Hut functions and datatypes.
        | Control Subcon output of test results.
      `),
      enabled: false
    },
    
  },
  $odeToThePioneer: String.multiline(`
    Dear sweet user who I love and treasure:
    
    You have found an error; a blind spot; a nook no one knew, or thought (or dared) to look into. You are an adventurer; it may not even be horribly misleading to call you a pioneer, and as we know, pioneers bear the brunt of hardships in new places.
    
    This event has been logged. Through your hardship you offer those who follow in your footsteps the promise of solace and sanctuary. I pray it does not feel to you that this catastrophe has occurred in vain.
    
    Thank you, user.
    
    Thank you, you pioneer, you.
  `),
  $subconHeader: '-'.repeat(28) + '+' + '-'.repeat(50) + '\n', // TODO: Contingent on left-pane width of 28
  
  // Lifetime
  init() {
    
    // TODO: Sort this out eventually. Who handles errors when multiple
    // FoundationNodejs instances exist (as occurs during testing)??
    if (!process['~topLevelErrsHandled']) {
      process['~topLevelErrsHandled'] = true;
      let onErr = err => this.subcon('warning')('(Top level)', this.formatError(err));
      process.on('uncaughtException', onErr);
      process.on('unhandledRejection', onErr);
    }
    
    forms.Foundation.init.call(this);
    
    Object.assign(this, {
      resetCmpPrm: this.seek('keep', 'compiledFileSystem').rem(),
      confReadyPrm: null,
      netAddrRepRec: null,
      subconRec: null
    });
    
  },
  async configure(rawData) {
    
    // Apply initial configuration, check if Keep-based configuration,
    // and if it is apply configuration from the specified Keep; note
    // `this.confReadyPrm` queues successive `configure` calls behind
    // each other
    
    return this.confReadyPrm = Promise.resolve(this.confReadyPrm)
      .then(() => forms.Foundation.configure.call(this, Form.resolveDeepObj(rawData)))
      .then(async conf => {
        
        let confKeep = await conf.seek('conf', 'keep').val;
        if (!confKeep) return { conf, full: rawData, raw: rawData, keep: {} };
        
        let keepData = (await confKeep.getContent('utf8')).trim();
        try {
          
          this.subcon('conf.keep')(() => confKeep
            ? `Loading additional args from ${confKeep.desc()}`
            : `No additional Configuration loaded from Keep (check 'conf.keep.value')`
          );
          
          keepData = keepData.replace(/[;\s]+$/, ''); // Remove tailing whitespace and semicolons
          keepData = await eval(`(${keepData})`);
          
        } catch (err) {
          
          err.propagate(msg => ({ msg: `${confKeep.desc()} couldn't be used for configuration\n${msg}`, keepData }));
          
        }
        
        // Use Conf logic to process deep vals for both keep and raw,
        // then merge them deeply so that raw values have precedence
        
        let full = {};
        full.merge(Form.resolveDeepObj(keepData));
        full.merge(Form.resolveDeepObj(rawData));
        await conf.setVal(full);
        
        return { conf, full, raw: rawData, keep: keepData };
        
      })
      .then(async ({ conf, full, raw, keep }) => {
        
        global.gsc = this.subcon('dev');
        
        let rooms = await this.getRooms([ 'record', 'record.bank.WeakBank', 'record.bank.KeepBank' ]);
        let { Manager, Record } = rooms.record;
        let { KeepBank } = rooms;
        
        // "nar" = "NetworkAddressReputation"
        // "sc" = "Subconscious"
        let millKeep = this.seek('keep', 'adminFileSystem', 'mill');
        let [ netAddrRepRec, subconRec ] = [ 'nar/netAddrRep', 'sc/subcon' ].map(term => {
          
          let [ pfx, name ] = term.cut('/');
          let man = Manager({
            bank: KeepBank({
              keep: millKeep.seek('foundationNodejs', name),
              subcon: this.subcon(`internal.bank.keep.${name}`)
            })
          });
          return man.rootRec = Record({
            type: man.getType(`${pfx}.root`),
            group: man.getGroup([]),
            uid: '!root',
            value: {}
          });
          
        });
        Object.assign(this, { netAddrRepRec, subconRec });
        
        await Promise.all([ netAddrRepRec, subconRec ].map(v => v.bankedPrm));
        
        /// {DEBUG=
        this.subcon('conf.provided')({ raw, keep, full });
        await this.subcon('conf.resolved')(async () => { // Show all resolved settings
          
          // TODO: Gray out options left at their default (don't be shy just store a "defVal" prop on Conf instances!)
          
          let confTree = function*(c) { yield c; for (let n in c.kids) yield* confTree(c.kids[n]); };
          let items = await Promise.all([ ...confTree(conf) ].map(async conf => {
            
            let val = await conf.val;
            
            // Don't output compound Confs; just the leaves!
            if (conf.schema.kids) return skip;
            
            let chain = [];
            let ptr = conf;
            while (ptr.par) { chain = [ ptr.name, ...chain ]; ptr = ptr.par; }
            
            return { chain: chain.join('.'), val };
            
          }));
          
          items = items.map(item => {
            
            if (!isForm(item.val, Array))                                      return item;
            if (item.val.all(val => [ String, Number ].has(val?.constructor))) return item;
            
            // Spread Arrays into multiple items
            return [
              { chain: item.chain, val: Array.stub },
              ...item.val.map((val, i) => ({ chain: `${item.chain}[${i}]`, val }))
            ];
            
          }).flat();
          
          items = items
            .sort((a, b) => a.chain.localeCompare(b.chain))
            .toObj(v => [ v.chain, v.val ]);
          
          let formatValue = (val, maxChars=180) => {
            
            if (val === Array.stub) return '[ ... ]';
            
            let withAnsi = val?.Form
              ? (val.desc instanceof Function ? val.desc() : getFormName(val))
              : require('util').inspect(val, { colors: true, depth: 10 }).replace(/\n\s*/g, ' ');
            
            // Limiting length of the resulting string is a bit non-trivial
            // when `colors: true` is set; need to remove all ansi escape
            // sequences, measure true string-length, and restore ansi bits
            // while taking care not to leave an "open" ansi directive
            // "unclosed" - the most trivial way to do this is insert all
            // ansi directives where they used to be within the string, or
            // at the end of the string if their previous index was removed!
            
            let ansiRegStr = '[\u001B][[][0-9]{2}m'; // We need this regex twice but once with "g" and once without
            let ansiBits = withAnsi.match(RegExp(ansiRegStr, 'g')) || [];
            let split = withAnsi.split(RegExp(ansiRegStr));
            
            let totalLen = split.map(str => str.length).reduce((m, v) => m + v);
            let excess = totalLen - maxChars;
            if (excess <= 0) return withAnsi;
            
            excess += 1; // Trim 1 extra char to make space for ellipsis
            
            // Remove all split bits that are completely oversize
            while (excess > 0 && split.length && split.slice(-1)[0].length <= excess) {
              excess -= split.slice(-1)[0].length;
              split = split.slice(0, -1);
            }
            
            // Partially trim the last bit if necessary
            if (excess > 0) {
              let li = split.length - 1;
              split[li] = split[li].slice(0, -excess);
            }
            
            if (split.length) split[split.length - 1] += '\u2026';
            else              split.push('\u2026');
            
            // Interlace what remains of `split` with `ansiBits` - note any
            // excessive `ansiBits` are stuck together and form a suffix
            let result = [];
            let max = Math.max(split.length, ansiBits.length);
            for (let ind = 0; ind < max; ind++) {
              if (ind < split.length) result.push(split[ind]);
              if (ind < ansiBits.length) result.push(ansiBits[ind]);
            }
            
            return result.join('');
            
          };
          
          let maxChainLen = Math.max(...items.toArr((v, k) => k.length));
          return items
            .toArr((v, k) => `${(k + '  ').padTail(maxChainLen + 3, '\u00b7')} ${formatValue(v)}`)
            .join('\n');
          
        });
        
        let subconMillKeep = millKeep.seek('subcon');
        let subconKeep = this.conf('deploy.subcon.keep');
        if (subconKeep && subconMillKeep?.fp.contains(subconKeep.fp)) {
          let numSubcons = (await subconMillKeep.getChildNames()).length;
          if (numSubcons > 200) this.subcon('warning')(`${subconMillKeep.desc()} has a large number of children (${numSubcons})`);
        }
        /// =DEBUG}
        
        NetworkIdentity.subcon.server = this.subcon('network.server.status');
        NetworkIdentity.subcon.sign = this.subcon('dev');
        NetworkIdentity.subcon.acme = this.subcon('dev');
        
        return conf;
        
      });
    
  },
  async hoist() {
    
    await this.resetCmpPrm;
    
    /// {DEBUG=
    // Run tests
    if ([ 'dev', 'beta' ].has(this.conf('deploy.maturity'))) {
      
      // TODO: I think tests should be written modularly alongside the
      // files they correspond to, and FoundationNodejs can scan for
      // all such tests and run them all here!
      
      let sc = this.subcon('test.lowLevel');
      
      sc(`Running low-level tests...`);
      
      let t = this.getMs();
      await require('./nodejs/test.js')(this);
      
      sc(`All low-level tests passed after ${(this.getMs() - t).toFixed(1)}ms!`);
      
    }
    
    // Do debug output
    {
      
      let heapSc = this.subcon('heap.sample');
      if (heapSc.enabled) {
        
        let TimerSrc = await this.getRoom('logic.TimerSrc');
        let bToMb = 1 / (1000 ** 2);
        TimerSrc({ ms: heapSc.ms, num: Infinity }).route(() => heapSc(() => {
          
          let { heapUsed, heapTotal } = process.memoryUsage();
          let consumed = heapUsed * bToMb;
          let remaining = (heapTotal - heapUsed) * bToMb;
          let amt = heapUsed / heapTotal;
          
          return { consumed, remaining, amt };
          
        }));
        
      }
      
      this.subcon('bank')(() => {
        
        let hoists = this.seek('conf', 'hoists').val;
        
        return hoists.map(hoist => {
          
          let { bank } = hoist;
          return String.baseline(`
            | Hoist for room ${hoist.room} (${hoist.group.servers.map(s => s.address).join(', ')})
            | ${bank ? 'Running with ' + bank.desc() : 'No Bank in use (this is a transient run)'}
          `);
          
        }).join('\n\n');
        
      });
      
    }
    /// =DEBUG}
    
    return forms.Foundation.hoist.call(this);
    
  },
  halt() { process.exit(0); },
  getBelowConfArgs() {
    
    // TODO: Eventually Lofts will have more modelling (there'll be a
    // Form named, e.g., "Loft") (this assumes that "Loft" is the term
    // for a Hoist that performs Serving - really "persistent Room" and
    // "Room with Server functionality" are mutually inexclusive). When
    // that happens the Foundation won't along be able to determine the
    // Conf args for Below - instead the actual Loft instance should be
    // asked to compute said args.
    
    // Return the RawConf needed to configure a BelowHut
    let conf = this.seek('conf');
    return {
      
      // Note Above -> Below mapping:
      // - conf/"network.heartbeat.ms" -> conf/"heartbeatMs"
      // - conf/"deploy.maturity" -> conf/"maturity"
      // Below needs intricate Conf property support
      processUid: this.conf('deploy.processUid'), // Maybe the AboveHut should have a random uid, instead of "!above"? And then the concept of a "processUid" is the same as an AboveHut's uid
      maturity: conf.seek('deploy', 'maturity').val,
      heartbeatMs: conf.seek('network', 'heartbeat', 'ms').val,
      
      // Remove the "netIden" from each Hoist
      hoists: conf.seek('hoists').val.map(({ room, group }) => {
        return { room, group: { ...group, netIden: null } };
      }),
      
      subcon: conf.seek('subcon').val.map(t => t.enabled ? { enabled: 1 } : skip)
      
    };
    
  },
  
  // Sandbox
  getMs: require('perf_hooks').performance.now,
  formatAnyValue(val, { depth=10 }={}) {
    if (hasForm(val, Error)) return this.formatError(val);
    return require('util').inspect(val, { colors: false, depth });
  },
  
  // Services
  createKeep(opts={}) { return Form.KeepNodejs(); },
  async createHut(opts={}) {
    
    // TODO: There is no such thing as a ROOT Hut!! A process may host
    // multiple different Lofts, each with their own Bank! The Hut must
    // have a 1-to-1 rel with a Bank! Need to have *multiple* Huts per
    // Foundation, at minimum 1 per Loft/Hoist :)
    // Right now things fail if there's more than 1 hoist!
    
    let Hut = await this.getRoom('Hut');
    
    let hoists = this.seek('conf', 'hoists').val;
    if (hoists.length > 1) throw Error(`No support yet for multiple Hoists!!`);
    if (hoists.length !== 1) throw Error(`No Hoists configured`);
    
    let bank = hoists[0].bank;
    
    return Hut({ uid: '!hereHut', isHere: true, isManager: true, bank });
    
  },
  async createReal(opts={}) {
    
    let FakeReal = form({ name: 'FakeReal', has: { Tmp }, props: (forms, Form) => ({
      init({ name, tech }) {
        forms.Tmp.init.call(this);
        Object.assign(this, {
          name, tech,
          fakeLayout: null,
          params: { textInputSrc: { mod: Function.stub, route: fn => fn(''), send: Function.stub }}
        });
      },
      loaded: Promise.resolve(),
      setTree() {},
      addReal(real) { return this; },
      mod() {},
      addLayout: lay => Tmp({ layout: { src: Src.stub, route: Function.stub } }),
      getLayout() { return this.fakeLayout || (this.fakeLayout = this.getLayoutForm('FakeBoi')()); },
      getLayoutForm(name) { return this.tech.getLayoutForm(name); },
      getTech() { return this.tech; },
      addNavOption() { return { activate: () => {} }; },
      render() {}
    })});
    let FakeLayout = form({ name: 'FakeLayout', has: { Src }, props: (forms, Form) => ({
      init() { forms.Src.init.call(this); this.keysSrc = Src.stub; },
      isInnerLayout() { return false; },
      setText(){},
      addReal(){},
      src: Src.stub
    })});
    
    let fakeReal = FakeReal({ name: 'nodejs.fakeReal', tech: {
      render: Function.stub,
      informNavigation: Function.stub,
      getLayoutForm: name => fakeLayout,
      getLayoutForms: names => names.toObj(name => [ name, fakeReal.getLayoutForm(name) ]),
      render: Function.stub
    }});
    let fakeLayout = FakeLayout();
    
    return {
      access: name => {
        if (name === 'main') return fakeReal;
        throw Error(`Invalid access for Real -> "${name}"`);
      }
    };
    
  },
  async createConf(opts={}) {
    
    /*
    
    NOTES:
    - Rooms should have access to both the Foundation, and the more-specific Hoist
    
    FOUNDATION
    | 
    |---> hut.js
    |---> Clearing
    |---> FoundationNodejs
    |---> Compiled source files
    |---> Heap sampling
    |---> Subcon Keep
    |---> Conf
    |     |---> Hoist Room #1
    |     |     |---> Hoist-specific Conf #1
    |     |     |     |---> Bank
    |     |     |     |---> Subcon (so multiple Hoisted Rooms stream different Subcon data??)
    |     |     |     
    |     |     |---> Hinterlands #1
    |     |           |---> NetworkIdentity (from global Conf)
    |     |           |---> Servers (from global Conf)
    |     |                 |---> NetworkAddress + set of Bindings
    |     | 
    |     |---> Hoist Room #2
    |     |     |---> Hoist-specific Conf #2
    |     |     |     |---> Bank
    |     |     |     |---> Subcon
    |     |     |     
    |     |     |---> Hinterlands #2
    |     |           |---> NetworkIdentity
    |     |           |---> Servers
    |     |                 |---> NetworkAddress + set of Bindings
    |     | 
    |     |---> Hoist Room #3
    |           |---> Hoist-specific Conf #3
    |           |     |---> Bank
    |           |     |---> Subcon
    |           |     
    |           |---> Hinterlands #3
    |                 |---> NetworkIdentity
    |                 |---> Servers
    |                       |---> NetworkAddress + set of Bindings
    */
    
    let schema = (chain, props=null) => {
      
      if (isForm(chain, String)) chain = chain.split('.').map(v => v.trim() || skip);
      
      let ptr = rootConf.schema;
      for (let name of chain.slice(0, -1)) {
        
        if (!ptr.kids) ptr.kids = Object.plain();
        if (!ptr.kids[name]) ptr.kids[name] = Object.plain();
        ptr = ptr.kids[name];
        if (!ptr) throw Error(`Schema at ${chain.join('.')} doesn't exist!`);
        
      }
      
      let n = chain[chain.length - 1];
      if (props) {
        if (!ptr.kids) ptr.kids = Object.plain();
        ptr.kids[n] = props;
      }
      
      return (ptr.kids && ptr.kids[n]) || null;
      
    };
    let parVal = (val, conf) => {
      
      if (val === null) val = {};
      if (!isForm(val, Object)) throw Error(`Can't set val on ${conf.cname()}; Object is required but got ${getFormName(val)}`);
      
      if (!conf.schema.kids) conf.schema.kids = Object.plain();
      
      let { '*': $all=null, ...kids } = conf.schema.kids;
      
      kids = {
        ...kids.map((sch, name) => conf.getKid(name)),            // Get all named kids
        ...($all ? val.map((v, name) => conf.getKid(name)) : {})  // If '*' in schema, get all available kids
      };
      
      return thenAll(kids.map(kid => {
        let kv = val.has(kid.name) ? val[kid.name] : null;
        return kid.setVal(kv);
      }));
      
    };
    let keys = obj => obj.toArr((v, k) => k).sort().join('+');
    
    // Call super functionality with empty-Object as value
    let rootConf = await forms.Foundation.createConf.call(this, Object.stub);
    Object.assign(rootConf, {
      schema: Object.plain({ fn: parVal })
    });
    
    schema('deploy', { fn: parVal });
    schema('deploy.maturity', { fn: (val, conf) => {
      
      if (val === null) val = 'alpha';
      
      if (!isForm(val, String)) throw Error(`Couldn't resolve ${conf.cname()} from ${getFormName(val)}`).mod({ val });
      
      let validVals = [ 'alpha', 'beta', 'dev' ];
      if (!validVals.has(val)) throw Error(`Invalid maturity term "${val}" (pick from: ${validVals.join(', ')})`);
      
      return val;
      
    }});
    schema('deploy.processUid', { fn: (val, conf) => {
      return val ?? this.getUid().slice(0, 6); // Only bother with 6 bytes (chance of collision is 1/(62^6) = 1/56800235584)
    }});
    
    let deployStabilityFn = (num, conf) => {
      if (num === null) num = 1;
      if (!isForm(num, Number)) throw Error(`Couldn't resolve ${conf.cname()} from ${getFormName(num)}`).mod({ num });
      if (num < 0) throw Error(`Value for ${conf.cname()} must be greater than or equal to zero`);
      return num;
    };
    schema('deploy.stability', { fn: (val, conf) => {
      
      val = parVal(val, conf);
      let div = 1 / val.toArr(v => v).reduce((m, v) => m + v);
      if (!isForm(div, Number) || div <= 0) throw Error(`There's a problem in the stability settings`).mod({ div });
      return val.map(v => v * div);
      
    }});
    schema('deploy.stability.errorDiagnose', { fn: deployStabilityFn });
    schema('deploy.stability.errorPrevent', { fn: deployStabilityFn });
    schema('deploy.stability.slowDiagnose', { fn: deployStabilityFn });
    schema('deploy.stability.slowPrevent', { fn: deployStabilityFn });
    schema('deploy.stability.*', { fn: deployStabilityFn });
    
    schema('deploy.subcon', { fn: parVal });
    schema('deploy.subcon.keep', { fn: (val, keep) => {
      
      if (val === null) return null;
      
      if (isForm(val, String)) val = val.split(/[,/]/).map(v => v.trim() || skip);
      
      if (isForm(val, Array)) {
        
        // Single-length Arrays name a child of mill/subcon
        if (val.length === 1) val = [ 'mill', 'subcon', val[0] ];
        
        // Resolve any "<date>" components to the current utc time
        val = val.map(v => (v === '<date>') ? Date.nowStr('-', ' ', '-', '-').toString(10) : v);
        
        // Resolve the Array to a Keep
        val = this.seek('keep', 'adminFileSystem', val);
        
      }
      
      if (!hasForm(val, Keep)) throw Error(`Couldn't resolve ${conf.cname()} from ${getFormName(val)}`).mod({ val });
      
      return val;
      
    }});
    
    schema('deploy.network', { fn: parVal });
    schema('deploy.network.spoofLatency', { fn: (val, conf) => {
      
      if (val === null) return null;
      
      if (isForm(val, String)) {
        let [ min, max ] = val.split(':').map(v => v.trim() || skip);
        min = parseInt(min, 10);
        max = parseInt(max, 10);
        val = { min, max };
      }
      
      return parVal(val, conf);
      
    }});
    schema('deploy.network.spoofLatency.min', { fn: val => val });
    schema('deploy.network.spoofLatency.max', { fn: val => val });
    
    schema('conf', { fn: parVal });
    schema('conf.keep', { fn: async val => {
      
      if (val === null) val = 'def.js';
      if (isForm(val, String)) val = val.split(/[,/\\]/);
      if (isForm(val, Array)) {
        if (val.length === 1) val = [ 'mill', 'arg', val[0] ];
        val = this.seek('keep', 'adminFileSystem', val);
      }
      
      if (!hasForm(val, Keep)) throw Error(`Value should be a Keep (got ${getFormName(val)})`);
      if (!await val.exists()) return null;
      
      return val;
      
    }});
    
    schema('shell', { fn: parVal });
    schema('shell.openssl', { fn: val => val || 'openssl' });
    
    schema('network', { fn: parVal });
    schema('network.identity', { fn: (val, conf) => {
      
      if (val === null) val = {};
      if (!isForm(val, Object)) throw Error(`Couldn't resolve ${conf.cname()} to Object (got ${getFormName(val)})`);
      
      val = {
        
        unsafe: {
          name: 'unsafe',
          keep: null,
          secureBits: 0,
          details: {
            geo: 'earth.continent.country.province.city.neighbourhood',
            org: 'organization.section.section.section.section.section',
            email: 'example@hut.com',
            password: 'ilovehut'
          }
        },
        secure: {
          name: 'secure',
          keep: 'secure',
          secureBits: 2048,
          details: {
            geo: 'earth.continent.country.province.city.neighbourhood',
            org: 'organization.section.section.section.section.section',
            email: 'example@hut.com',
            password: 'ilovehut'
          }
        },
        
        ...val
        
      };
      
      return parVal(val, conf);
      
    }});
    schema('network.identity.*', { fn: async (netIden, conf) => {
      
      if (isForm(netIden, Object)) {
        netIden = await parVal({ name: conf.name, keep: conf.name, ...netIden }, conf);
        netIden = NetworkIdentity(netIden);
      }
      
      if (!isForm(netIden, NetworkIdentity)) throw Error(`Couldn't resolve ${conf.cname()} from ${getFormName(netIden)}`);
      await netIden.readyPrm;
      
      return netIden;
      
    }});
    schema('network.identity.*.name',             { fn: (name, conf) => name || conf.name });
    schema('network.identity.*.secureBits',       { fn: bits => bits ?? 2048 });
    schema('network.identity.*.crtType',          { fn: val => val ?? 'selfSigned' });
    schema('network.identity.*.details',          { fn: val => val ?? {}});
    schema('network.identity.*.details.geo',      { fn: val => val ?? 'earth.continent.country.province.city.neighbourhood' });
    schema('network.identity.*.details.org',      { fn: val => val ?? 'organization.section.section.section.section.section' });
    schema('network.identity.*.details.email',    { fn: val => val ?? 'example@hut.com' });
    schema('network.identity.*.details.password', { fn: val => val ?? 'ilovehut' });
    schema('network.identity.*.details.networkAddresses', { fn: val => val ?? [] });
    schema('network.identity.*.osslShellName',    { fn: (val, conf) => val || schema('shell.openssl').fn(null, conf) });
    schema('network.identity.*.keep', { fn: (keep, conf) => {
      
      if (keep === null) return null;
      
      if (isForm(keep, String)) keep = keep.split(/[,/]+/);
      
      if (isForm(keep, Array)) {
        if (keep.length === 1) keep = [ 'mill', 'netIden', keep[0] ];
        keep = this.seek('keep', 'adminFileSystem', keep);
      }
      
      if (keep !== null && !hasForm(keep, Keep)) throw Error('WhoaaaWOoWOoWOOOooFFF');
      
      return keep;
      
    }});
    
    schema('network.heartbeat', { fn: parVal });
    schema('network.heartbeat.ms', { fn: val => {
      
      if (val === null) val = 60 * 1000;
      if (isForm(val, String)) val = parseInt(val, 10);
      if (!isForm(val, Number)) throw Error(`Heartbeat value must be Number`);
      if (val < 1000) throw Error('Heartbeat should not be faster than 1hz');
      return val;
      
    }});
    schema('network.dns', { fn: (dnsList, conf) => {
      
      if (dnsList === null) dnsList = '1.1.1.1+1.0.0.1' // TODO: CloudFlare best default choice??
      if (isForm(dnsList, String)) dnsList = dnsList.split('+').map(ip => ip.trim() || skip);
      if (!isForm(dnsList, Array)) throw Error(`Couldn't resolve ${conf.cname()} to Array (got ${getFormName(dnsList)})`).mod({ dnsList });
      return dnsList;
      
    }});
    schema('network.address', { fn: (address, conf) => {
      
      if (address === null) address = {};
      if (!isForm(address, Object)) throw Error(`Couldn't resolve ${conf.cname()} from ${getFormName(address)}`).mod({ address });
      
      address = {
        
        autodetect: 'autodetect',
        localhost: 'localhost',
        
        ...address
        
      };
      
      return parVal(address, conf);
      
    }});
    schema('network.address.*', { fn: async val => {
      
      if (val === 'autodetect') {
        
        // We'll use dns searches to find NetworkAddresses available for
        // this network node; this will only find addresses which can be
        // reversed from ips via dns methods
        
        let dnsResolver = new (require('dns').promises.Resolver)();
        dnsResolver.setServers(rootConf.seek('network', 'dns').val); // Use DNS servers defined in Conf
        
        let ips = require('os').networkInterfaces()
          .toArr(v => v).flat()                       // Flat list of all interfaces
          .map(v => v.internal ? skip : v.address);   // Remove internal interfaces
        
        let potentialHosts = (await Promise.all(ips.map(async ip => {
          
          ip = ip.split('.').map(v => parseInt(v, 10));
          
          // TODO: support iv6??
          if (ip.count() !== 4 || ip.find(v => !isForm(v, Number)).found) return skip;
          
          let type = (() => {
            
            // Reserved:
            // 0.0.0.0 -> 0.255.255.255
            if (ip[0] === 0) return 'reserved';
            
            // Loopback:
            // 127.0.0.0 -> 127.255.255.255
            if (ip[0] === 127) return 'loopback';
            
            // Private; any of:
            // 10.0.0.0 -> 10.255.255.255,
            // 172.16.0.0 -> 172.31.255.255,
            // 192.168.0.0 -> 192.168.255.255
            if (ip[0] === 10) return 'private'
            if (ip[0] === 172 && ip[1] >= 16 && ip[1] < 32) return 'private';
            if (ip[0] === 192 && ip[1] === 168) return 'private';
            
            // Any other address is public
            return 'external';
            
          })();
          
          // Reserved hosts are ignored entirely
          if (type === 'reserved') return skip;
          
          // Loopback hosts are the least powerful
          if (type === 'loopback') return { type, rank: 0, ip, addr: null };
          
          // Next-best is private; available on local network. Note
          // that class C ips (whose first component is >= 192) are
          // preferable to class B ips (below that range)
          if (type === 'private' && ip[0] < 192)  return { type, rank: 1, ip, addr: null };
          if (type === 'private' && ip[0] >= 192) return { type, rank: 2, ip, addr: null };
          
          // Remaining types will be "external"; within "external"
          // there are three different ranks (from worst to best:)
          // - Non-reversible
          // - Reversible without A-record
          // - Reversible with A-record (globally addressable)
          try {
            
            // Reverse `ip` into any related hostnames
            let addrs = await dnsResolver.reverse(ip.map(n => n.toString(10)).join('.'));
            
            // Only consider hostnames with available A records
            return Promise.all(addrs.map(async addr => {
              
              // If an A record is found this is the most powerful
              // address possible (globally addressable)
              try {
                await dnsResolver.resolve(addr, 'A');
                return { type: 'public', rank: 5, ip, addr };
              } catch (err) {
                // Reversable ips without A records are one level down
                // from globally addressable results
                return { type: 'publicNoHost', rank: 4, ip, addr };
              }
              
            }));
            
          } catch (err) {
            
            // The address is external but not reversible
            return { type: 'external', rank: 3, ip, addr: null };
            
          }
          
        }))).flat();
        
        let bestRank = Math.max(...potentialHosts.map(v => v.rank));
        let bestHosts = potentialHosts.map(v => v.rank === bestRank ? (v.addr || v.ip.join('.')) : skip);
        
        if (rootConf.seek('server', 'autodetect', 'debug', 'on').val) {
          
          console.log('Autodetected hosts; results:');
          for (let { type, rank, ip, addr } of potentialHosts.sort((h1, h2) => h2.rank - h1.rank)) {
            console.log(addr
              ? `- Priority ${rank} (${type}): ${addr} (${ip.join('.')})`
              : `- Priority ${rank} (${type}): ${ip.join('.')}`
            );
          }
          
        }
        
        val = bestHosts.length ? bestHosts[0] : 'localhost';
        
      }
      
      return val;
      
    }});
    
    schema('network.unsafe', { fn: parVal });
    schema('network.unsafe.protocols', { fn: (protocols, conf) => {
      
      if (protocols === null) protocols = {};
      if (!isForm(protocols, Object)) throw Error(`Couldn't resolve ${conf.cname()} from ${getFormName(protocols)}`).mod({ protocols });
      
      protocols = {
        
        http: { name: 'http', compression: 'gzip+deflate' },
        sokt: { name: 'ws', compression: 'gzip+deflate' },
        ws: { name: 'ws', compression: 'gzip+deflate' },
        
        ...protocols
        
      };
      
      return parVal(protocols, conf);
      
    }});
    schema('network.unsafe.protocols.*', { fn: parVal });
    schema('network.unsafe.protocols.*.name', { fn: val => val });
    schema('network.unsafe.protocols.*.compression', { fn: (compression, conf) => {
      
      if (isForm(compression, String)) compression = compression.split('+').map(v => v.trim() || skip);
      if (!isForm(compression, Array)) throw Error(`Couldn't resolve ${conf.cname()} from ${getFormName(compression)}`).mod({ compression });
      
      let validTypes = Set([ 'deflate', 'gzip' ]);
      let invalidType = compression.find(v => !validTypes.has(v)).compression;
      if (invalidType) throw Error(`Invalid compression type: "${invalidType}"`);
      
      return compression;
      
    }});
    schema('network.unsafe.ports', { fn: (ports, conf) => {
      
      if (ports === null) ports = {};
      if (!isForm(ports, Object)) throw Error(`Couldn't resolve ${conf.cname()} from ${getFormName(ports)}`).mod({ ports });
      
      ports = { http: 80, ws: 80, ...ports };
      
      return parVal(ports, conf);
      
    }});
    schema('network.unsafe.ports.*', { fn: async (port, conf) => {
      
      if (isForm(port, String)) {
        let confPort = (await conf.par.val).seek(port).val;
        port = confPort ? confPort : parseInt(port, 10);
      }
      
      if (!isForm(port, Number)) throw Error(`Couldn't resolve ${conf.cname()} from ${getFormName(port)}`).mod({ port });
      
      return port;
      
    }});
    
    schema('network.secure', { fn: parVal });
    schema('network.secure.protocols', { fn: (protocols, conf) => {
      
      if (protocols === null) protocols = {};
      if (!isForm(protocols, Object)) throw Error(`Couldn't resolve ${conf.cname()} from ${getFormName(protocols)}`).mod({ protocols });
      
      protocols = {
        
        http: { name: 'https', compression: 'gzip+deflate' },
        sokt: { name: 'wss', compression: 'gzip+deflate' },
        ws: { name: 'wss', compression: 'gzip+deflate' },
        
        ...protocols
        
      };
      
      return parVal(protocols, conf);
      
    }});
    schema('network.secure.protocols.*', { fn: parVal });
    schema('network.secure.protocols.*.name', { fn: val => val });
    schema('network.secure.protocols.*.compression', { fn: (compression, conf) => {
      
      if (isForm(compression, String)) compression = compression.split('+').map(v => v.trim() || skip);
      if (!isForm(compression, Array)) throw Error(`Couldn't resolve ${conf.cname()} from ${getFormName(compression)}`).mod({ compression });
      
      let validTypes = Set([ 'deflate', 'gzip' ]);
      let invalidType = compression.find(v => !validTypes.has(v)).compression;
      if (invalidType) throw Error(`Invalid compression type: "${invalidType}"`);
      
      return compression;
      
    }});
    schema('network.secure.ports', { fn: (ports, conf) => {
      
      if (ports === null) ports = {};
      if (!isForm(ports, Object)) throw Error(`Couldn't resolve ${conf.cname()} from ${getFormName(ports)}`).mod(ports);
      
      ports = { https: 443, wss: 443, ...ports };
      
      return parVal(ports, conf);
      
    }});
    schema('network.secure.ports.*', { fn: async (port, conf) => {
      
      if (isForm(port, String)) {
        let confPort = (await conf.par.val).seek(port).val;
        port = confPort ? confPort : parseInt(port, 10);
      }
      
      if (!isForm(port, Number)) throw Error(`Couldn't resolve ${conf.cname()} from ${getFormName(port)}`).mod({ port });
      
      return port;
      
    }});
    
    schema('network.group', { fn: (groups, conf) => {
      
      if (groups === null) groups = {};
      if (!isForm(groups, Object)) throw Error(`Can't resolve NetworkGroups from ${getFormName(groups)}`).mod({ groups });
      
      groups = {
        
        localhost:       'unsafe localhost+http+ws',
        localhostUnsafe: 'unsafe localhost+http+ws',
        localhostSecure: 'secure localhost+http+ws',
        
        autodetect:       'unsafe autodetect+http+ws',
        autodetectUnsafe: 'unsafe autodetect+http+ws',
        autodetectSecure: 'secure autodetect+http+ws',
        
        ...groups
        
      };
      
      return parVal(groups, conf);
      
    }});
    schema('network.group.*', { fn: async (networkGroup, conf) => {
      
      // NetworkGroup example (`networkGroup` could take this value:)
      //                  "secure my.domain.com+https:httpProd+wss:wssProd"
      //                   ^      ^             ^     ^        ^   ^
      // NetworkIdentity --+      |             |     |        |   |
      // NetworkAddress-----------+             |     |        |   |
      // Protocol #1 ---------------------------+     |        |   |
      // Port #1 -------------------------------------+        |   |
      // Protocol #2 ------------------------------------------+   |
      // Port #2 --------------------------------------------------+
      
      if (networkGroup === null) throw Error(String.baseline(`
        | Can't resolve NetworkGroup (${conf.cname()}) from Null!
        | - Try an Object like { netIden, servers }
        | - Try a String like "<netIden name> <network address>+<protocol1>+<protocol2>+..."
        |   e.g. "unsafe localhost+http+sokt"
        |   e.g. "secure my.website.com+http+sokt+ssh"
      `));
      
      if (isForm(networkGroup, String)) {
        
        // I think if `networkGroup` starts with "!" it can indicate
        // special functionality. E.g. "!auto http+sokt" should:
        // - Autodetect the best NetworkAddress for the local machine
        // - Produce a NetworkIdentity whose name reflects that specific
        //   NetworkAddress
        //   - With a Keep
        //   - With a reasonable "secureBits" value
        //   - With a reasonable `crtType` value ("acme/letsEncrypt"?)
        //   - How to default org, geo, emailAddress, password?
        //   - With the autodetected address as its default
        // - Spin up http+sokt servers under this NetworkIdentity
        
        // If `networkGroup` doesn't have a space (only supplies
        // `netIden`) it should default to being http+sokt
        
        let [ netIden, ...servers ] = networkGroup.split(/[ ]+/).map(v => v.trim() || skip);
        if (netIden === 'insecure') netIden = 'unsafe'; // Allow "insecure" as a synonym of "unsafe"
        if (netIden === 'safe') netIden = 'secure';     // Allow "safe" as a synonym of "secure"
        
        // Note that terms like "localhost", "chess2.fun", "192.168.0.1"
        // etc. are NetworkAddresses, while each (Protocol, Port) pair
        // connected to a NetworkAddress is a NetworkProcess! A
        // NetworkIdentity combined with a set of NetworkProcesses is a
        // NetworkGroup!
        networkGroup = { netIden, servers };
        
      }
      
      if (!hasForm(networkGroup?.netIden, NetworkIdentity)) {
        
        let netIden = networkGroup.netIden;
        networkGroup.netIden = await schema('network.group.*.netIden').fn(netIden, conf);
        
      }
      
      if (!isForm(networkGroup, Object)) throw Error(`Couldn't resolve ${conf.cname()} from ${getFormName(networkGroup)}`).mod({ networkGroup });
      if (keys(networkGroup) !== 'netIden+servers') throw Error(`NetworkGroup should have keys "netIden" + "servers"`);
      
      let security = networkGroup.netIden.secureBits ? 'secure' : 'unsafe';
      
      networkGroup.servers = await Promise.all(networkGroup.servers.map(async server => {
        
        if (!isForm(server, String)) return server;
        
        let pcs = server.split('+').map(v => v.trim() || skip);
        
        let address = pcs[0];
        let bindingStrs = pcs.slice(1);
        
        let addressConf = await rootConf.seek('network', 'address', address).val;
        if (addressConf) address = addressConf;
        
        let bindings = await Promise.all(bindingStrs, async bindingStr => {
          
          let [ protocol, port=null ] = bindingStr.split(':').map(v => v.trim() || skip);
          let protocolConf = await rootConf.seek('network', security, 'protocols', protocol).val;
          if (!protocolConf) throw Error(`Couldn't resolve Protocol from "${protocol}" (${security})`);
          protocol = protocolConf;
          
          if (port === null) port = protocol.name;
          port = await rootConf.seek('network', security, 'ports', port).val
          
          let { name, ...opts } = protocol;
          return { protocol: name, ...opts, port };
          
        });
        
        return { address, bindings };
        
      }));
      
      return parVal(networkGroup, conf);
      
    }});
    schema('network.group.*.netIden', { fn: async (netIden, conf) => {
      
      if (!netIden) netIden = null;
      
      if (netIden && isForm(netIden, String)) {
        let netIdenName = netIden;
        netIden = await rootConf.seek('network', 'identity', netIdenName).val;
        if (!netIden) throw Error(`Couldn't resolve "${netIdenName}" to a NetworkIdentity`);
      }
      
      if (netIden !== null && !hasForm(netIden, NetworkIdentity))
        throw Error(`Couldn't resolve ${conf.cname()} to a NetworkIdentity (got ${getFormName(netIden)})`);
      
      return netIden;
      
    }});
    schema('network.group.*.servers', { fn: async servers => {
      
      if (!isForm(servers, Array)) throw Error(`Couldn't resolve Servers from ${getFormName(servers)}`);
      return servers;
      
    }});
    
    schema('real', { fn: parVal });
    schema('real.visualizeNesting', { fn: val => !!val });
    
    schema('hoist', { fn: async (hoist, conf) => {
      
      if (hoist === null) return null; // All "hoist" to be `null` ("hoists" [plural] is where the requirement for at least 1 Hoist is defined)
      if (isForm(hoist, Object) && hoist.room === null) return null;
      
      if (isForm(hoist, String)) {
        let [ room=null, group=null, bank=null ] = hoist.split('+').map(v => v.trim() || skip);
        hoist = { room, group, bank };
      }
      
      return parVal(hoist, conf);
      
    }});
    schema('hoist.room', { fn: (room, conf) => {
      
      if (!isForm(room, String)) throw Error(`Couldn't resolve ${conf.cname()} from ${getFormName(room)}`).mod({ room });
      
      let [ invalidChar=null ] = room.match(/[^a-zA-Z0-9$_.]/) || [];
      if (invalidChar === '+') throw Error(`You assigned "${room}" to 'hoist.room' - did you mean to assign it to 'hoist'?`);
      if (invalidChar) throw Error(`Can't use "${room}" for 'hoist.room' because it contains an invalid char: "${invalidChar}"`);
      
      return room;
      
    }});
    schema('hoist.group', { fn: async (group, conf) => {
      
      if (group === null) group = 'localhost';
      
      if (isForm(group, String)) {
        let networkGroup = await rootConf.seek('network', 'group', group).val;
        if (!networkGroup) throw Error(`Couldn't resolve "${group}" to a NetworkGroup`);
        group = networkGroup;
      }
      
      return group;
      
    }});
    schema('hoist.bank', { fn: async (bank, conf) => {
      
      if (isForm(bank, String)) bank = { keep: bank };
      
      if (isForm(bank, Object)) {
        
        bank = parVal(bank, conf);
        
        if (bank?.keep === conf.val?.keep) { // Reuse a previously set instance
          
          bank = conf.val;
          
        } else if (bank.keep) {
          
          let KeepBank = await this.getRoom('record.bank.KeepBank');
          bank = KeepBank({ keep: bank.keep });
          
        } else {
          
          bank = null;
          
        }
        
      }
      
      if (bank !== null) {
        let AbstractBank = await this.getRoom('record.bank.AbstractBank');
        if (!hasForm(bank, AbstractBank)) throw Error(`Couldn't resolve ${conf.cname()} from ${getFormName(bank)}`).mod({ bank });
      }
      
      return bank;
      
    }});
    schema('hoist.bank.keep', { fn: (keep, conf) => {
      
      if (keep === null) return null;
      
      if (isForm(keep, String)) keep = keep.split(/[,/]/).map(v => v.trim() || skip);
      
      if (isForm(keep, Array)) {
        
        // Single-length Arrays name a child of mill/bank
        if (keep.length === 1) keep = [ 'mill', 'bank', keep[0] ];
        
        // Resolve the Array to a Keep
        keep = this.seek('keep', 'adminFileSystem', keep);
        
        // Use any previously existing reference
        if (conf.val && keep.fp.equals(conf.val.fp)) keep = conf.val;
        
      }
      
      if (!hasForm(keep, Keep)) throw Error(`Couldn't resolve ${conf.cname()} from ${getFormName(keep)}`).mod({ keep });
      
      return keep;
      
    }});
    
    schema('hoists', { fn: async (hoists, conf) => {
      
      // A Hoist is simply an App plus a NetworkGroup
      
      if (hoists === null) hoists = [];
      if (isForm(hoists, String)) hoists = hoists.split(/[ ]+/).map(str => str.trim() || skip);
      
      if (!isForm(hoists, Array)) throw Error(`OOOfffawwwooo`);
      
      let hoistConf = rootConf.seek('hoist');
      let singleHoist = await hoistConf.val;
      if (singleHoist) hoists.push(singleHoist);
      
      let hoistFn = hoistConf.schema.fn;
      return Promise.all(hoists.map(hoist => hoistFn(hoist, hoistConf)));
      
    }});
    
    schema('subcon', { fn: val => {
      
      if (val === null) val = Object.stub;
      if (isForm(val, String)) val = Set(val.split(',').map(v => v.trim() || skip));
      if (isForm(val, Set)) val = val.toObj(v => [ v, {} ]);
      
      if (!isForm(val, Object)) throw Error(`Couldn't resolve Subcon from ${getFormName(val)}`);
      val = val.map(v => ({ enabled: true, ...v })); // Default any supplied subcon to being enabled
      
      let result = {};
      result.merge(Form.defSubconsVal);
      result.merge(val);
      
      return result;
      
    }});
    
    
    /*
    bank.keep.value
    real.visualizeNesting
    */
    
    return rootConf;
    
  },
  createSubcon(term, data) {
    
    let { therapist=true } = data ?? {};
    
    return Object.assign((...args) => {
      
      args = args.map(arg => hasForm(arg, Function) ? arg(data) : arg);
      if (args.empty()) return;
      
      return thenAll(args, args => {
        
        let depth = 10;
        if (isForm(args[0], String) && /^[!][!][0-9]+$/.test(args[0])) {
          depth = parseInt(args[0].slice(2), 10);
          args = args.slice(1);
        }
        
        let now = Date.nowStr();
        
        if (therapist && this.subconRec) (async () => {
          
          let man = this.subconRec.type.manager;
          
          let streamRec = await this.subconRec.withRh({
            type: 'sc.stream',
            opts: { filter: sel => then(sel.getValue(), t => t === term) },
            fn: 'one'
          });
          if (!streamRec) streamRec = man.addRecord('sc.stream', [ this.subconRec ], term);
          
          let notionRec = man.addRecord('sc.notion', [ streamRec ], { t: now, term, args });
          
          // Note we should avoid using a Subcon with "therapist"
          // enabled to indicate any Banking error because if there's a
          // deeper reason for Errors here trying to Bank the error
          // indication could result in an awful loop that consumes the
          // Bank's resources
          notionRec.bankedPrm
            .fail(err => gsc(`WARNING: Failed to Bank for Therapist (probably circular args?)`, { args, err }));
          
        })();
        
        // Note if "format" is defined it needs to resolve all given
        // args to a single String
        let formattedArgs = args;
        if (data.has('format')) {
          let formatted = data.format(this, { ...data, depth }, ...args);
          if (!formatted) return;
          formattedArgs = formatted.split(/\r?\n/);
        } else {
          formattedArgs = args.map(v => {
            if (!isForm(v, String)) v = this.formatAnyValue(v, { depth });
            return v.split(/\r?\n/);
          }).flat();
        }
        
        let leftLns = [ `> ${term}`, now ];
        let rightLns = formattedArgs;
        
        let logStr = Math.max(leftLns.length, rightLns.length).toArr(n => {
          let l = (leftLns[n] || '').padTail(28);
          let r = rightLns[n] || '';
          return l + '| ' + r;
        }).join('\n');
        
        console.log(Form.subconHeader + logStr);
        
      });
      
    }, data);
    
  },
  
  // Transport
  setupServer({ cost, hut, netIden, spoofLatency, server }) {
    
    // A Server is a managed set of Sessions; it needs to make sure that
    // a given Hut tracks all Sessions (so that it has any given Session
    // acts as a means of communicating with a BelowHut), and it must
    // make sure that Hear events from a Session are propagated to the
    // given Hut
    
    // TODO: Spoof latency according to `spoofLatency`
    // TODO: Let a client state the exact timing at which it sent its
    // request? Values in the future are invalid, producing errors; a
    // maximum "maxMsInThePast" value is defined, and if the value is in
    // the past, it is at most considered "maxMsInThePast" millis before
    // the current time
    
    netIden.manageServer(server);
    
    let anonHut = { isAfar: true, isHere: false, roadSrcs: Set.stub };
    
    // This Route directs Hears/Tells between the Session and the Hut
    server.src.route(session => {
      
      // Monitor the NetworkAddress associated with a Session; if its
      // reputation turns bad close the session!
      // Note that now there is only `session.netAddr`;
      // if clients from multiple NetworkAddresses try to give the
      // same hid the NetworkAddress which comes second will simply be
      // rejected!
      // 
      // let naRep = hut.netAddrReputation;
      // let netAddrs = session.knownNetAddrs;
      // let badNetAddr = netAddrs.find(na => naRep.get(na)?.window >= 1).val; // "window" refers to the reputational damage within some timeframe (as opposed to "total" reputational damage)
      // let badRep = badNetAddr && naRep.get(badNetAddr);
      // 
      // if (badRep) {
      //   this.subcon('warning')(`Reject ${session.desc()} @ ${netAddrs.toArr(v => v).join(' + ')}`, Set(badRep.strikes.map(v => v.reason)).toArr(v => v));
      //   return session.end();
      // }
      
      // Note that if `session.key === null` then `sessionMsg.msg.trn`
      // is always "anon" - there will be exactly 1 Send from the
      // TellSrc and it must be Replied to!
      if (session.key === null) return session.hear.route(sessionMsg => {
        let { replyable, ms, msg } = sessionMsg;
        hut.hear({
          src: { ...anonHut, parHut: hut, desc: () => `AnonHut(${session.knownNetAddrs.toArr(v=>v).join(', ')})` },
          road: session, reply: replyable(), ms,
          msg
        });
      }, 'prm');
      
      // At this point `session.key` is either the preexisting hid of
      // a Hut, or a never-before-seen hid that we can be certain is
      // authenticated to be used as the hid of a new Hut
      let srcHut = hut.getRoadedHut(server, session, session.key).hut;
      if (!srcHut) return session.end();
      
      /// {ASSERT=
      if (!srcHut) throw Error('OWWWaaaooofoffofo');
      /// =ASSERT}
      
      // Messages from the Session propagate to the Hut
      session.hear.route(sessionMsg => {
        let { replyable, ms=this.getMs(), msg } = sessionMsg;
        if (msg.command === 'bp') return; // Don't process "bp" ("bank poll") commands
        let reply = (msg.trn === 'sync') ? replyable() : null;
        hut.hear({ src: srcHut, road: session, reply, ms, msg });
      }, 'prm');
      
    });
    
    return server;
    
  },
  createHttpServer({ hut, netIden, host, port, compression=[] }) {
    
    return this.setupServer({
      
      hut,
      netIden,
      spoofLatency: this.seek('conf', 'deploy', 'network', 'spoofLatency').val,
    
      server: require('./nodejs/httpServer.js')({
        
        secure: netIden.secureBits > 0,
        netAddr: host,
        port,
        compression,
        
        subcon: this.subcon('network.http.raw'),
        errSubcon: this.subcon('warning'),
        
        msFn: () => this.getMs(),
        heartbeatMs: this.conf('network.heartbeat.ms'),
        
        doCaching: this.conf('deploy.maturity') !== 'dev',
        getKeyedMessage: ({ path, query, fragment, cookie, body }) => {
          
          // Ensure `body` is json Object
          body = body ? jsonToVal(body) : {};
          if (!isForm(body, Object)) throw Error(`Http body must resolve to Object; got ${getFormName(body)}`).mod({ body, http: { code: 400 } });
          
          // Ensure `cookie` has only a "hut" key storing base64+json
          // encoded Object value
          let { hut: cookieHut=null, ...cookieMore } = cookie;
          if (!cookieMore.empty())
            throw Error(`Invalid cookie; only the "hut" key is allowed; got [ ${cookieMore.toArr((v, k) => k).join(', ')} ]`).mod({ http: { code: 400 } });
          
          try         { cookie = cookieHut ? jsonToVal(Buffer.from(cookieHut, 'base64')) : {}; }
          catch (err) { throw Error(`Cookie must be base64 encoded json`).mod({ cause: err, http: { code: 400 } }); }
          
          if (!isForm(cookie, Object)) throw Error(`Overall cookie value must resolve to Object; got ${getFormName(cookie)}`).mod({ http: { code: 400 } });
          
          // We can basically always ignore the `ver` value - but we can
          // be suspicious of any requests for static resources which
          // fail to include an expected "!" value!
          let { hutId=null, ['!']: ver, ...msg } = { trn: 'anon', ...cookie, ...body, ...query };
          
          if (!msg.has('command')) {
            if (path === '')                 Object.assign(msg, { trn: 'sync', command: 'hutify' });
            else if (path === 'favicon.ico') Object.assign(msg, { trn: 'anon', command: 'html.icon' });
            else                             Object.assign(msg, { command: path });
          }
          
          if (!msg.command) throw Error(`Couldn't determine command from request`);
          if (![ 'anon', 'sync', 'async' ].has(msg.trn)) throw Error(`Invalid trn value: "${msg.command}"`);
          if (msg.command === 'bp' && msg.trn !== 'async') throw Error(`If Command is "bp" Trn must be "async"`).mod({ tell: msg });
          
          // Return `null` Key to indicate this is an anonymous session
          if (msg.trn === 'anon') return { key: null, msg };
          
          // The hid is invalid if it has been explicitly specified (as
          // opposed to being left `null`), isn't preexisting, and the
          // deployment maturity isn't "dev" (dev accepts any hid)
          let isValidHid = false
            || hutId === null
            || hut.roadedHuts.has(hutId)
            || this.conf('deploy.maturity') === 'dev';
          if (!isValidHid) throw Error(`Invalid hid: "${hutId}"`);
          
          // The identity is valid; either use the specified hid, or
          // generate a new one!
          return { key: hutId ?? hut.getHutUid(), msg };
          
        }
        
      }),
      
    });
    
  },
  createSoktServer({ hut, netIden, host, port, compression=[] }) {
    
    return this.setupServer({
      
      hut,
      netIden,
      spoofLatency: this.seek('conf', 'deploy', 'network', 'spoofLatency').val,
      
      server: require('./nodejs/soktServer.js')({
        
        secure: netIden.secureBits > 0,
        netAddr: host,
        port,
        compression,
        
        subcon: this.subcon('network.sokt.raw'),
        errSubcon: this.subcon('warning'),
        
        msFn: () => this.getMs(),
        heartbeatMs: this.conf('network.heartbeat.ms'),
        
        getKey: ({ query: { trn='async', hutId=null } }) => {
          
          if (trn === 'anon') return null;
          
          // The hid is invalid if it has been explicitly specified (as
          // opposed to being left `null`), isn't preexisting, and the
          // deployment maturity isn't "dev" (dev accepts any hid)
          let isValidHid = false
            || hutId === null
            || hut.roadedHuts.has(hutId)
            || this.conf('deploy.maturity') === 'dev';
          if (!isValidHid) throw Error(`Invalid hid: "${hutId}"`);
          
          return hutId ?? hut.getHutUid();
          
        }
        
      })
      
    });
    
  },
  
  // Room
  async getCompiledKeep(bearing, roomPcs, { uniqKey=null, wrapJs=false }={}) {
    
    if (isForm(roomPcs, String)) roomPcs = roomPcs.split('.');
    if (!isForm(roomPcs, Array)) throw Error(`Invalid "roomPcs" (${getFormName(roomPcs)})`);
    
    let cmpKeep = this.seek('keep', 'compiledFileSystem', [ bearing, `${roomPcs.join('.')}.js` ]);
    if (await cmpKeep.exists()) return cmpKeep;
    
    let srcKeep = await (bearing === 'setup'
      ? this.seek('keep', 'fileSystem', 'setup', `${roomPcs.join('.')}.js`)
      : this.seek('keep', 'fileSystem', 'room', ...roomPcs, `${roomPcs.slice(-1)[0]}.js`)
    );
    if (!await srcKeep.exists()) throw Error(`Room ${roomPcs.join('.')} with Keep ${srcKeep.desc()} doesn't exist`);
    
    let { lines, offsets } = this.compileContent(bearing, await srcKeep.getContent('utf8'), roomPcs.join('.'));
    if (!lines.count()) {
      await cmpKeep.setContent(`'use strict';`); // Write something to avoid recompiling later
      return cmpKeep;
    }
    
    // Embed `offsets` within `lines` for BELOW or setup
    if (this.conf('deploy.maturity') === 'dev' && [ 'below', 'setup' ].has(bearing)) {
      
      let lastLine = lines.slice(-1)[0];
      
      // We always expect the last character to be ";" as we need to
      // append the roomDebug extension; if the last character isn't
      // ";" we could encounter unexpected syntactic consequences
      if (lastLine.slice(-1)[0] !== ';') throw Error(`Last character of ${roomPcs.join('.')} is "${lastLine.slice(-1)[0]}"; not ";"`);
      lines[lines.length - 1] = `${lastLine} global.roomDebug['${roomPcs.join('.')}'] = ${valToJson({ offsets })};`;
      
    }
    
    if (this.conf('wrapClientJs')) {
      
      // SyntaxError is uncatchable in FoundationBrowser and has no
      // useful trace. We can circumvent this by sending code which
      // cannot cause a SyntaxError directly; instead the code is
      // represented as a foolproof String, and then it is eval'd.
      // If the string represents syntactically incorrect js, `eval`
      // will crash but the script will have loaded without issue;
      // a much more descriptive trace can result! There's also an
      // effort here to not change the line count in order to keep
      // debuggability; for this reason all wrapping code is
      // appended/prepended to the first/last lines.
      let escQt = '\\' + `'`;
      let escEsc = '\\' + '\\';
      let headEvalStr = `eval([`;
      let tailEvalStr = `].join('\\n'));`;
      
      lines = lines.map(ln => `'` + ln.replace(/\\/g, escEsc).replace(/'/g, escQt) + `',`); // Ugly trailing comma
      let headInd = 0;
      let tailInd = lines.length - 1;
      lines[headInd] = headEvalStr + lines[headInd];
      lines[tailInd] = lines[tailInd] + tailEvalStr;
      
    }
    await cmpKeep.setContent(lines.join('\n'));
    
    return cmpKeep;
    
  },
  compileContent(variantName, srcLines, fileNameForDebug='<unknown file>') {
    
    // Note that a "variant" is not exactly the same as a "bearing";
    // "bearing" simply refers to Hut altitude. "Variants" can be
    // used for logical decisions based on Hut altitude, but also other
    // factors (e.g. debug vs production mode)!
    
    let t = this.getMs();
    
    // Compile file content; filter based on variant tags
    if (isForm(srcLines, String)) srcLines = srcLines.split('\n');
    if (!isForm(srcLines, Array)) throw Error(`Param "srcLines" is invalid type: ${getFormName(srcLines)}`);
    
    let variantDef = Object.plain({
      above: variantName === 'above',
      below: variantName === 'below',
      debug: false
        || this.conf('deploy.maturity') === 'dev'
        || this.conf('deploy.stability.errorDiagnose') > 0
    });
    
    let blocks = [];
    let curBlock = null;
    
    for (let i = 0; i < srcLines.length; i++) {
      
      let line = srcLines[i].trim();
      
      if (curBlock && line.has(`=${curBlock.type.upper()}}`)) { // In a block, check for the block end
        curBlock.end = i;
        blocks.push(curBlock);
        curBlock = null;
      }
      
      // Outside a block, check for start of any block
      if (!curBlock) for (let k in variantDef) if (line.has(`{${k.upper()}=`)) {
        curBlock = { type: k, start: i, end: -1 };
        break;
      }
      
    }
    
    if (curBlock) throw Error(`Ended with unbalanced "${curBlock.type}" block`);
    let curOffset = null;
    let offsets = [];
    let nextBlockInd = 0;
    let filteredLines = [];
    
    for (let i = 0; i < srcLines.length; i++) {
      
      let rawLine = srcLines[i];
      let line = rawLine.trim();
      
      if (!curBlock && nextBlockInd < blocks.length && blocks[nextBlockInd].start === i)
        curBlock = blocks[nextBlockInd++];
      
      let keepLine = true;
      if (!line) keepLine = false; // Remove blank lines
      if (line.hasHead('//')) keepLine = false; // Remove comments
      if (curBlock && i === curBlock.startInd) keepLine = false;
      if (curBlock && i === curBlock.endInd) keepLine = false;
      if (curBlock && !variantDef[curBlock.type]) keepLine = false;
      
      if (keepLine) {
        
        curOffset = null;
        line = line
          .replace(Form.captureLineCommentRegex, '')
          .replace(Form.captureInlineBlockCommentRegex, '')
          .trim();
        
        if (!line) keepLine = false;
        
      }
      
      if (keepLine) {
        
        filteredLines.push(line);
        
      } else {
        
        if (!curOffset) offsets.push(curOffset = { at: i, offset: 0 });
        curOffset.offset++;
        
      }
      
      if (curBlock && i === curBlock.end) {
        curBlock = null;
        if (nextBlockInd < blocks.length && blocks[nextBlockInd].start === i) {
          curBlock = blocks[nextBlockInd];
          nextBlockInd++;
        }
      }
      
    }
    
    // We have some requirements for the filtered lines which represent
    // the compiled code:
    // 
    // 1. We'll wrap the compiled content in curly brackets to creates a
    // separate scope; this prevents unexpected variable name conflicts
    // between separate files and provides the expected level of
    // room-to-room insulation and side-effect-freeness! (Note the only
    // side-effects of a Room should be on `global.rooms`, and
    // `global.roomDebug`)
    // 
    // 2. We want to ensure top-level strict mode
    // 
    // 3. Ensure there is no additional strict mode declaration (some
    // source code has "'use strict';" embedded)
    // 
    // 4. Don't change the line count (only change the prefix of the 1st
    // line and the suffix of the last line!)
    if (filteredLines.length) {
      
      filteredLines[0] = [
      
        // The strict declaration begins the first line; requirement #2
        `'use strict';`,
        
        // // Log that the room script executed
        // `console.log('EXECUTE ${fileNameForDebug}');`,
      
        // Open a scope (e.g. `{ console.log('hi'); };`); requirement #1
        (`{`),
        
        // Remove any previous strict-mode declaration
        filteredLines[0].replace(/['"`]use strict['"`];[ ]*/g, '') // TODO: Replace all instances? Or just the 1st??
        
      ].join('');
      
      // End the scope for requirement #1
      filteredLines[filteredLines.length - 1] += (`};`);
      
    }
    
    /// {DEBUG=
    this.subcon('compile.result')(() => {
      let srcCnt = srcLines.count();
      let trgCnt = filteredLines.count();
      return `Compiled (${variantName}) ${fileNameForDebug}: ${srcCnt} -> ${trgCnt} (-${srcCnt - trgCnt}) lines (${ (this.getMs() - t).toFixed(2) }ms)`;
    });
    /// =DEBUG}
    
    return { lines: filteredLines, offsets };
    
  },
  async installRoom(name, { bearing='above' }={}) {
    
    let namePcs = name.split('.');
    let pcs = [ 'room', ...namePcs, `${namePcs.slice(-1)[0]}.js` ];
    
    let contents = await this.seek('keep', 'fileSystem', pcs).getContent('utf8');
    if (!contents) throw Error(`Invalid room name: "${name}"`);
    let { lines, offsets } = this.compileContent(bearing, contents, pcs.join('/'));
    
    return {
      
      debug: { offsets },
      content: (async () => {
        
        // Write, `require`, and ensure file populates `global.rooms`
        
        await this.seek('keep', 'compiledFileSystem', [ bearing, `${name}.js` ]).setContent(lines.join('\n'));
        require(`../mill/cmp/${bearing}/${name}.js`);
        
        if (!global.rooms[name]) throw Error(`Room "${name}" didn't set global.rooms.${name}`);
        if (!hasForm(global.rooms[name], Function)) throw Error(`Room "${name}" set non-function at global.rooms.${name}`).mod({ value: global.rooms[name] });
        
        // The file executed and defined `global.room[name]` to be a
        // function; return a call to that function!
        return global.rooms[name](this);
        
      })()
      
    };
    
  },
  
  // Errors
  parseErrorLine(line) {
    
    // A decent way to detect trace items from most stack formats is
    // by looking for a filepath, line index and character index
    // joined together with ":" delimiters
    let [ , path, lineInd, charInd ] = line.match(/([a-zA-Z0-9_:.]+(?:[/\\][a-zA-Z0-9_:.]+)*):([0-9]+):([0-9]+)/);
    
    // Now parse the bearing and room name out of the path (they are
    // simply the second-last and last components, respectively, except
    // there may be a "nodejs/" component, allowing for files under
    // "hut/setup/nodejs" to be included as well)
    let [ , bearing, roomName ] = path.match(/(setup|above|below)[/\\](?:nodejs[/\\])?([a-zA-Z0-9_:.]+)[.]js$/);
    
    /// {DEBUG=
    // Make sure the path is within the Hut repository
    if (!this.seek('keep', 'adminFileSystem').fp.contains(Filepath(path))) throw Error(`Path "${path}" isn't relevant to error`);
    /// =DEBUG}
    
    // Note that for FoundationNodejs, code under "setup" is run raw,
    // whereas all other code is compiled
    [ lineInd, charInd ] = [ lineInd, charInd ].map(v => parseInt(v, 10));
    return { bearing, roomName, lineInd, charInd, compiled: bearing !== 'setup' };
    
  },
  srcLineRegex() {
    return {
      regex: /([^ ]*[^a-zA-Z0-9@.])?[a-zA-Z0-9@.]*[.]js:[0-9]+/, // TODO: No charInd
      extract: fullMatch => {
        let [ roomBearingName, lineInd ] = fullMatch.split(/[^a-zA-Z0-9.@]/).slice(-2);
        let [ roomName, bearing ] = roomBearingName.split('@');
        return { roomName, lineInd: parseInt(lineInd, 10), charInd: null };
      }
    };
  }
  
})});
