'use strict';

// Little dot: '\u00b7'
// Big dot: '\u2022'
// Broken pipe: '\u00a6'
// Ellipsis: '\u2026'

require('../room/setup/clearing/clearing.js');
let { rootTransaction: rootTrn, Filepath, FsKeep } = require('./filesys.js');
let NetworkIdentity = require('./NetworkIdentity.js');

// Set up basic monitoring
let { processExitSrc } = require('./util/installTopLevelHandler.js')();

// Avoid "//" within String by processing non-String-open characters, or
// fully enclosed Strings (note: may fail to realize that a String stays
// open if it has escaped quotes e.g. 'i criii :\')'; note lookbehind
// ("?<=") excludes its contents from the actual match
let captureLineCommentRegex = Regex.readable(String.baseline(`
  | (?<=                                  )
  |     ^(      |       |       |       )* [ ]*
  |       [^'"#] '[^']*' "[^"]*" #[^#]*#       [/][/].*
`).replace(/#/g, '`')); // Simple way to include literal "`" in regex

// Avoid "/*" within Strings; capture terminating "*/" on the same line
let captureInlineBlockCommentRegex = Regex.readable('g', String.baseline(`
  | (?<=                                           )                                 
  |     ^(?:     |           |           |       )* [ ]*         [^*]|[*][^/]        
  |         [^'"] ['][^']*['] ["][^"]*["] #[^#]*#       [/][*](?:            )*[*][/]
`).replace(/#/g, '`')); // Simple way to include literal "`" in regex

module.exports = async ({ hutFp: hutFpRaw, conf: rawConf }) => {
  
  // Asynchronously init the Hut transaction
  let hutFp = Filepath(hutFpRaw);
  let hutKeepPrm = rootTrn.kid(hutFp).then(trn => FsKeep(trn, hutFp));
  
  // Make `global.subconOutput` immediately available (but any log
  // invocations will only show up after configuration is complete)
  global.subconOutput = (...args) => global.subconOutput.buffered.push(args); // Buffer everything
  global.subconOutput.buffered = [];
  
  // Setup `global.formatAnyValue`
  global.formatAnyValue = require('./util/formatAnyValue.js'); // (val, { colours, w, d }) => formattedStr;
  
  global.getMs = require('./util/getCalibratedUtcMillis.js')(/* involves a busy-wait */);
  
  // Initial subcon log...
  let setupSc = global.subcon('setup');
  setupSc(`utc: ${getMs()}\npid: ${process.pid}`);
  
  { // Setup `global.keep`
    
    let RootKeep = form({ name: 'RootKeep', has: { Keep }, props: (forms, Form) => ({
      
      init(map) { Object.assign(this, { map: Object.plain(map) }); },
      access(prop) {
        if (prop[0] === '[') prop = prop.slice(1, -1);
        if (!this.map[prop]) throw Error(`Api: invalid slot: ${getFormName(this)} -> "${prop}"`);
        return this.map[prop];
      }
      
    })});
    
    let rootFsKeep = FsKeep(rootTrn, Filepath([]));
    let hutKeep = await hutKeepPrm;
    let millKeep = hutKeep.seek('mill');
    hutKeep.forbid = { mill: 1, '.git': 1 };
    
    let rootKeep = RootKeep({
      'file': rootFsKeep,
      'file:root': rootFsKeep,
      'file:hut':  hutKeep,
      'file:repo': hutKeep,
      'file:mill': millKeep,
      'file:code:src': hutKeep.seek('room'),
      'file:code:cmp': millKeep.seek('cmp')
    });
    global.keep = Object.assign(dt => rootKeep.seek(token.dive(dt)), { rootKeep });
    
  }
  
  console.log('yo');
  
  { // Resolve configuration and get subcon output working
    
    let globalConf = { 'hihi': 'abc' };
    global.conf = (diveToken, def='TODOhijklmno') => {
      let v = token.diveOn(diveToken, globalConf, def).val;
      if (v === 'TODOhijklmno') throw Error('Api: bad conf dive token').mod({ diveToken });
      return v;
    };
    
    // The index in the stack trace which is the callsite that invoked the subcon call (gets
    // overwritten later when therapy requires calling subcons from deeper stack depths)
    let leftColW = 28;
    let getStdoutSubcon = require('./util/getStdoutSubconOutputter.js');
    
    let resolveConf = require('./util/resolveConf.js');
    let t = getMs();
    globalConf = await resolveConf({
      rawConf,                        // We pass in command-line args
      rootKeep: global.keep.rootKeep, // `resolveConf` checks any additionally configured ConfKeeps
      confUpdateCb: updatedConf => globalConf = updatedConf
    }).fail(async err => {
      
      // Either an expected config-related refusal (nice output) or
      // unexpected error (panic output); either way immediately exit
      // after showing the output
      
      if (err.feedback) {
        
        global.subconOutput = getStdoutSubcon({
          debug: true,           // Results in expensive stack traces - could be based on conf??
          relevantTraceIndex: 2, // Hardcoded value; determined simply by testing
          leftColW,
          rightColW: 80 // `- 2` considers the "| " divide between L/R cols
        });
        gsc(err.feedback);
        
      } else {
        
        let { buffered=[] } = global.subconOutput;
        global.subconOutput.buffered = null;
        global.subconOutput = (sc, ...args) => console.log('\n' + [ // Panic output
          `SUBCON: "${sc.term}"`,
          ...args.map(a => {
            if (isForm(a, Function)) a = a();
            if (!isForm(a, String)) a = global.formatAnyValue(a);
            return a;
          })
        ].join('\n').indent('[panic] '));
        
        global.subconOutput(gsc, 'Error during initialization; panic! Dumping logs...');
        for (let args of buffered) global.subconOutput(...args);
        
        global.subconOutput(gsc, err);
        
      }
      
      return process.exitNow(1);
      
    });
    
    // Grab a reference the buffered logs written before overwriting `global.subconOutput`
    let { buffered } = global.subconOutput;
    
    // Overwrite `global.subconOutput` with a legit outputter
    global.subconOutput = getStdoutSubcon({
      debug: true,           // Results in expensive stack traces - could be based on conf??
      relevantTraceIndex: 2, // Hardcoded value; determined simply by testing
      leftColW,
      rightColW: Math.max(global.conf('global.terminal.width') - leftColW - 2, 30) // `- 2` considers the "| " divide between L/R cols
    });
    
    // Now output any buffered logs before we were ready
    for (let args of buffered) global.subconOutput(...args);
    
    setupSc.kid('conf')(`Configuration processed after ${(getMs() - t).toFixed(2)}ms`, global.conf([]));
    
  };
  
  { // Enable `global.(getCmpKeep|mapCmpToSrc|getRooms)`
    
    let srcKeep = keep('[file:code:src]');
    let cmpKeep = keep('[file:code:cmp]');
    let loadedRooms = Map();
    
    // Note these "default features" should only define features which
    // are always synced up regardless of the bearing; Hut by default
    // expects to run at multiple bearings, so there are no "default"
    // values for bearing-specific features! (They should always be
    // passed when calling `getCmpCode` from a particular context!)
    let defaultFeatures = {
      debug:  conf('global.maturity') === 'dev',
      assert: conf('global.maturity') === 'dev',
      ...conf('global.features')
    };
    let getCmpCode = async (keep, features=Object.stub) => {
      
      // Take a Keep containing source code and return compiled code and all data necessary to map
      // compiled codepoints; note we DON'T write to any Keep! (that's done by `getCmpKeep`)
      
      let t = getMs();
      
      // TODO: Why lowercase the value??
      features = Set({ ...defaultFeatures, ...features }.toArr((v, k) => v ? k.lower() : skip));
      
      /// {DEBUG=
      if (!isForm(features, Set)) throw Error(`Api: "features" must resolve to Set; got ${getFormName(features)}`);
      let invalidFeature = features.seek(f => !/^[a-z]+$/.test(f)).val;
      if (invalidFeature) throw Error(`Invalid feature: "${invalidFeature}"`);
      /// =DEBUG}
      
      let content = await keep.getContent('utf8');
      if (!content) throw Error(`Api: no sourcecode available from ${keep.desc()}`);
      
      let srcLines = content.split('\n'); // TODO: What about \r?? Is that a concern?
      
      // Matches, e.g., '{BEL/OW=', '{ABO/VE=', etc.
      let featureHeadReg = /[{]([a-zA-Z]+)[=]/i;
      
      let blocks = [];
      let curBlock = null;
      
      for (let i = 0; i < srcLines.length; i++) {
        
        let line = srcLines[i].trim();
        
        // In a block, check for the block end
        if (curBlock && line.includes(curBlock.tailMatch)) {
          curBlock.tail = i;
          blocks.push(curBlock);
          curBlock = null;
        }
        
        // Outside a block, check for start of any block
        if (!curBlock) {
          // Note that features are case-insensitive when they appear in
          // sourcecode, but the matching feature tag must use the exact
          // same casing
          let [ , type=null ] = line.match(featureHeadReg) ?? [];
          if (type) {
            curBlock = { type: type.lower(), tailMatch: `=${type}}`, head: i, tail: -1 };
          }
        }
        
      }
      
      // Shouldn't be in a block after all lines are processed
      if (curBlock) throw Error(`Ended with unbalanced "${curBlock.type}" block`);
      
      // Now compute the offsets to allow mapping cmp->src callsites
      let curOffset = null;
      let offsets = [];
      let nextBlockInd = 0;
      let filteredLines = [];
      for (let [ i, rawLine ] of srcLines.entries()) {
        
        let line = rawLine.trim();
        
        // Reference the block which applies to the current line
        if (!curBlock && blocks[nextBlockInd]?.head === i) curBlock = blocks[nextBlockInd++];
        
        // `curBlock.type` and all values in `features` are lowercase
        let keepLine = true;
        if (!line) keepLine = false;                                    // Remove blank lines
        if (curBlock && i === curBlock.head) keepLine = false;          // Remove block start line
        if (curBlock && i === curBlock.tail) keepLine = false;          // Remove block end line
        if (curBlock && !features.has(curBlock.type)) keepLine = false; // Remove blocks based on feature config
        
        // Additional processing may result in negating `keepLine`
        if (keepLine) {
          
          line = line
            .replace(captureLineCommentRegex, '')
            .replace(captureInlineBlockCommentRegex, '')
            .trim();
          
          if (!line) keepLine = false;
          
        }
        
        // Now `keepLine` is final! If we're keeping this line add it to
        // the result; if we're not, indicate a gap in the mapping
        if (keepLine) {
          
          curOffset = null;
          filteredLines.push(line);
          
        } else {
          
          if (!curOffset) offsets.push(curOffset = { at: i, offset: 0 });
          curOffset.offset++;
          
        }
        
        if (curBlock && i === curBlock.tail) {
          
          curBlock = null;
          if (nextBlockInd < blocks.length && blocks[nextBlockInd].head === i) {
            curBlock = blocks[nextBlockInd];
            nextBlockInd++;
          }
          
        }
        
      }
      
      if (filteredLines.length) {
        
        // Now implement requirements for the compiled code:
        // 
        // 1. Wrapped in curly brackets to create a separate scope; this
        // prevents unexpected variable name conflicts between separate
        // files and provides the expected level of code insulation and
        // side-effect-freeness! (the only side-effect of a Room should
        // be on `global.rooms`!)
        // 
        // 2. Has a top-level strict mode declaration
        // 
        // 3. Has no other strict mode declarations (some source code
        // includes "use strict" - e.g. setup/clearing/clearing.js)
        // 
        // 4. Implementing these changes doesn't alter the number of
        // compiled lines  (only change the prefix of the 1st line and
        // the suffix of the last line will be changed!)
        
        let headInd = 0;
        let tailInd = filteredLines.length - 1;
        
        filteredLines[headInd] = ''
        
          // The strict declaration begins the first line; requirement #2
          + `'use strict';`
          
          // // Log that the room script executed
          // + `console.log('EXECUTE ${sourceName}');`,
        
          // Open a scope (e.g. `{ console.log('hi'); };`); requirement #1
          + ('{')
          
          // Remove any previous strict-mode declaration
          + filteredLines[headInd].replace(/[ ]*['"`]use strict['"`];[ ]*/, ''); // TODO: Replace all instances? Or just the 1st??
          
        // End the scope for requirement #1
        filteredLines[tailInd] += ('};');
        
      }
      
      /// {DEBUG=
      subcon('compile.result')(() => {
        let srcCnt = srcLines.count();
        let trgCnt = filteredLines.count();
        return `Compiled ${keep.desc()}\nLine difference: ${srcCnt} -> ${trgCnt} (-${srcCnt - trgCnt})\nTook ${ (getMs() - t).toFixed(2) }ms`;
      });
      /// =DEBUG}
      
      return { lines: filteredLines, offsets };
      
    };
    global.getCmpKeep = async (bearing, roomDive) => {
      
      // Returns a Keep representing the compiled code associated with some Room. Note an optimal
      // function signature here would simply be `bearing, srcKeep` - but it's easier to accept a
      // PARTIAL DiveToken. A partial dive can be used to reference both the src and cmp Keeps.
      // Accepting a full DiveToken or Keep would make it awkward to reference the corresponding
      // compiled Keep! Should probably just write something like `async srcKeepToCmpKeep`...
      
      roomDive = token.dive(roomDive);
      
      let cmpKeep = keep([ '[file:code:cmp]', bearing, ...roomDive, `${roomDive.at(-1)}.js` ]);
      if (await cmpKeep.exists()) return cmpKeep;
      
      let srcKeep = keep([ '[file:code:src]', ...roomDive, `${roomDive.at(-1)}.js` ]);
      let { lines, offsets } = await getCmpCode(srcKeep, {
        above: [ 'above', 'between' ].has(bearing),
        below: [ 'below', 'between' ].has(bearing)
      });
      
      if (!lines.count()) {
        await cmpKeep.setContent(`'use strict';`); // Write something to avoid recompiling later
        return cmpKeep;
      }
      
      // Embed `offsets` within `lines` for BELOW or setup
      if (conf('global.maturity') === 'dev' && [ 'below', 'setup' ].has(bearing)) {
        
        let headInd = 0;
        let tailInd = lines.length - 1;
        let lastLine = lines[tailInd];
        
        // We always expect the last line to end with "};"
        if (!lastLine.hasTail('};')) throw Error(`Last character of ${roomDive.join('.')} is "${lastLine.slice(-2)}"; not "};"`);
        
        // Lines should look like:
        //    | 'use strict';global.rooms['example'] = async () => {
        //    |   .
        //    |   .
        //    |   .
        //    | };Object.assign(global.rooms['example'],{"offsets":[...]});
        //    |
        /// {DEBUG=
        lines[tailInd] += `if(!global.rooms['${roomDive.join('.')}'])throw Error('No definition for global.rooms[\\'${roomDive.join('.')}\\']');`
        /// =DEBUG}
        lines[tailInd] += `Object.assign(global.rooms['${roomDive.join('.')}'],${valToJson({ offsets })});`;
        
      }
      
      if (conf('global.features.wrapBelowCode') ?? false) {
        
        // TODO: This feature should be implemented via compilation
        // (i.e. no `if (...) { ... }` but rather {WRAP/BELOWCODE=
        // =WRAP/BELOWCODE}), but `foundation.js` isn't compiled rn!
        
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
        let headEvalStr = 'eval([';
        let tailEvalStr = `].join('\\n'));`;
        
        lines = lines.map(ln => `'` + ln.replace(/\\/g, escEsc).replace(/'/g, escQt) + `',`); // Ugly trailing comma
        let headInd = 0;
        let tailInd = lines.length - 1;
        lines[headInd] = headEvalStr + lines[headInd];
        lines[tailInd] = lines[tailInd] + tailEvalStr;
        
      }
      
      await cmpKeep.setContent(lines.join('\n'));
      
      return cmpKeep;
      
    };
    global.mapCmpToSrc = (cmpDiveToken, row, col) => {
      
      // Note `file` is a String with sequential slashes (bwds and fwds)
      // replaced with a single forward slash
      // Returns `{ file, col, row, context }`
      
      let mapCmpKeep = global.keep(cmpDiveToken);
      
      // Only map compiled files
      if (!cmpKeep.contains(mapCmpKeep)) return { file: mapCmpKeep.desc(), row, col, context: null };
      
      // Path looks like "..../path/to/compiled/<bearing>/<roomName>
      let [ bearing, roomName, cmp ] = mapCmpKeep.fp.cmps.slice(cmpKeep.fp.cmps.length);
      
      let { offsets } = global.rooms[roomName];
      
      let context = {};   // Store metadata from final relevant offset
      let srcRow = 0;     // The line of code in the source which maps to the line of compiled code
      let srcCol = 0;     // Corresponding column
      let nextOffset = 0; // The index of the next offset chunk which may take effect (lookahead)
      for (let i = 0; i < row; i++) {
        
        // Find all the offsets which exist for the source line
        // For each offset increment the line in the source file
        while (offsets[nextOffset] && offsets[nextOffset].at === srcRow) {
          Object.assign(context, offsets[nextOffset]);
          srcRow += offsets[nextOffset].offset;
          nextOffset++;
        }
        srcRow++;
        
      }
      
      let roomPcs = roomName.split('.');
      let roomPcLast = roomPcs.at(-1);
      return {
        file: srcKeep.fp.kid([ roomPcs, roomPcLast + '.js' ]).desc(),
        row: srcRow,
        col: srcCol,
        context
      };
      
    };
    global.getRooms = (names, { shorten=true }={}) => {
      
      let bearing = conf('global.bearing');
      let err = Error('trace');
      return thenAll(names.toObj(name => {
        
        let room = loadedRooms.get(name);
        if (!room) loadedRooms.add(name, room = (async () => {
          
          try {
            
            let namePcs = name.split('.');
            let roomSrcKeep = srcKeep.access([ ...namePcs, `${namePcs.at(-1)}.js` ]);
            
            let { lines, offsets } = await getCmpCode(roomSrcKeep, {
              above: [ 'above', 'between' ].has(bearing),
              below: [ 'below', 'between' ].has(bearing)
            });
            
            let roomCmpKeep = cmpKeep.seek([ bearing, name, 'cmp' ]);
            await roomCmpKeep.setContent(lines.join('\n'));
            
            let roomDbgKeep = cmpKeep.seek([ bearing, name, 'debug' ]);
            await roomDbgKeep.setContent(valToSer({ offsets }));
            
            global.rooms[name] = { offsets }; // Make debug info available before `require` to help map SyntaxErrors
            
            require(roomCmpKeep.fp.fsp()); // Need to stop pretending like `cmpKeep` is a generic Keep (although maybe could `eval` it??)
            if (!global.rooms[name]) throw Error(`Room "${name}" didn't set global.rooms['${name}']`);
            if (!hasForm(global.rooms[name], Function)) throw Error(`Room "${name}" set non-function at global.rooms['${name}']`).mod({ value: global.rooms[name] });
            
            // The file executed and defined `global.room[name]` to be a
            // function; return a call to that function; pass the Keep
            // representing the sourcecode's parent!
            let result = await Object.assign(global.rooms[name], { offsets })(name, srcKeep.access(namePcs));
            loadedRooms.add(name, result);
            return result;
            
          } catch (cause) {
            
            err.propagate({ cause, msg: `Failed to load Room from term "${name}"` });
            
          }
          
        })());
        
        return [ shorten ? name.split('.').at(-1) : name, room ];
        
      }));
      
    };
    
  };
  
  { // Run tests
    let t = getMs();
    await require('./test.js')();
    subcon('setup.test')(`Tests completed after ${(getMs() - t).toFixed(2)}ms`);
  };
  
  { // Enable `global.real`
    
    let FakeReal = form({ name: 'FakeReal', has: { Tmp }, props: (forms, Form) => ({
      init({ name, tech }) {
        forms.Tmp.init.call(this);
        Object.assign(this, { name, tech, params: {
          textInputSrc: { mod: Function.stub, route: fn => fn(''), send: Function.stub }
        }});
      },
      loaded: Promise.resolve(),
      setTree() {},
      addReal(real) { return this; },
      mod() {},
      addLayout() { return  Tmp({ layout: fakeLayout }); },
      getLayout() { return fakeLayout; },
      getLayoutForm(name) { return FakeLayout; },
      getTech() { return this.tech; },
      addNavOption() { return { activate: () => {} }; },
      render() {}
    })});
    let FakeLayout = form({ name: 'FakeLayout', has: { Src }, props: (forms, Form) => ({
      init() { forms.Src.init.call(this); this.keysSrc = Src.stub; },
      isInnerLayout() { return false; },
      setText() {},
      addReal() {},
      route: Function.stub,
      src: Src.stub
    })});
    
    let fakeLayout = FakeLayout();
    global.real = FakeReal({ name: 'nodejs.fakeReal', tech: {
      render: Function.stub,
      informNavigation: Function.stub,
      getLayoutForm: name => FakeLayout,
      getLayoutForms: names => names.toObj(name => [ name, FakeLayout ]),
      render: Function.stub
    }});
    
  };
  
  { // RUN DAT
    
    let activateTmp = Tmp();
    
    // Hacky: want `activateTmp` to end if the process exits, but it should do so before other exit
    // handlers trigger
    processExitSrc.route(() => activateTmp.end());
    
    // Clear data from previous runs
    await Promise.all([
    
      // Previous compiled code
      keep('[file:code:cmp]').rem(),
      
      // Previous loadtest data
      keep('[file:mill].loadtest').rem()
      
    ]);
    
    let runDeploy = async deployConf => {
      
      let { uid, host, loft: loftConf, keep } = deployConf;
      let { netIden: netIdenConf, netAddr, heartbeatMs, protocols } = host;
      let { hut, record, WeakBank=null, KeepBank=null } = await global.getRooms([
        'setup.hut',
        'record',
        `record.bank.${keep ? 'KeepBank' : 'WeakBank'}`
      ]);
      
      let netIden = NetworkIdentity(netIdenConf);
      let secure = netIden.secureBits > 0;
      
      // Subcon for Deployment depends on whether it's Therapy - the Therapy room *must* use the
      // stub subcon - otherwise there would be horrific circular logging implications!
      let deploySc = loftConf.name === 'therapy' ? global.subconStub : global.subcon([]);
      
      // Initialize a Bank based on `keep`
      let bank = keep
        ? KeepBank({ sc: deploySc.kid('bank'), keep: global.keep(keep) })
        : WeakBank({ sc: deploySc.kid('bank') });
      
      // Get an AboveHut with the appropriate config
      let recMan = record.Manager({ bank, sc: deploySc.kid('manager') });
      let aboveHut = hut.AboveHut({ hid: uid, isHere: true, recMan, heartbeatMs, deployConf });
      activateTmp.endWith(aboveHut);
      
      // Server management...
      let servers = await Promise.all(protocols.toArr(async protocolOpts => {
        
        let { name: protocol, port, compression, ...opts } = protocolOpts;
        
        let roadAuthorityPrm = Object.plain({
          http: () => require('./server/http.js'),
          sokt: () => require('./server/sokt.js'),
        })[protocol]?.() ?? Error(`Unfamiliar protocol: ${protocol}`).propagate();
        
        let RoadAuthority = await roadAuthorityPrm;
        return RoadAuthority({
          secure, netProc: `${netAddr}:${port}`, compression,
          aboveHut,
          sc: global.subcon(`road.${protocol}`),
          ...opts
        });
        
      }));
      
      // TODO: Drift! loadtest's server must inherit from RoadAuthority
      let loadtest = null;
      if (loftConf.name === 'therapy') {
        
        let subconWriteStdout = global.subconOutput;
        
        // We know the uid of the root Therapy Record; this means if it
        // already exists we'll get a reference to it!
        let therapyPrefix = loftConf.prefix;
        let therapyRec = recMan.addRecord({
          uid: '!root',
          type: `${therapyPrefix}.therapy`,
          value: { ms: getMs() }
        });
        
        // Associate the Loft with the Therapy rec as soon as possible
        let loftRh = aboveHut.relHandler({ type: 'th.loft', term: 'hut', limit: 1 });
        activateTmp.endWith(loftRh);
        loftRh.route(loftHrec => {
          
          recMan.addRecord({
            uid: '!loftTherapy',
            type: `${therapyPrefix}.loftTherapy`,
            group: [ loftHrec.rec, therapyRec ],
            value: { ms: getMs() }
          });
          
        });
        
        global.subconOutput = (sc, ...args) => { // Stdout enhanced with therapy output
          
          args = args.map(arg => isForm(arg, Function) ? arg(sc) : arg);
          
          let { therapy=false } = sc.params();
          if (therapy) (async () => {
            
            // TODO: It's important that nothing occurring within this
            // function performs any therapy subcon... otherwise LOOP!
            // Best way is probably to pass stub functions in place of
            // loggers for every utility used by Therapy!
            
            try {
              
              // TODO: What exactly are the pre-existing constraints on
              // `uid` values? KeepBank will stick uids into filenames
              // so it's important to be certain
              let ms = getMs();
              let streamUid = `!stream@${sc.term.replace(/[.]/g, '@')}`;
              let streamRec = await recMan.addRecord({
                uid: streamUid,
                type: `${therapyPrefix}.stream`,
                group: [ therapyRec ],
                value: { ms, term: sc.term }
              });
              let notionRec = await recMan.addRecord({
                type: `${therapyPrefix}.notion`,
                group: [ streamRec ],
                value: { ms, args }
              });
              
            } catch (err) {
              
              // TODO: How to deal with the error? Just want to log it
              // with subcon, but if the error applies to all therapy
              // logs then the log related to the error could also fail,
              // leading to a nasty loop; the hack for now is to use a
              // new instance of the "warning" subcon, and to overwrite
              // its "cachedParams" (which should be a private property)
              // with params disabling therapy - this is brittle; it
              // breaks if:
              // - `global.subcon` is refactored so it can return
              //   references to pre-existing subcons
              // - therapy subcon uses `global.subconParams(sc)` rather
              //   than `sc.params()` to access params
              // - maybe other ways too??
              
              let errSc = global.subcon('warning');
              errSc.cachedParams = { ...errSc.params(), therapy: false };
              
              errSc(err.mod(msg => `Error recording therapy: ${msg}`), ...args);
              
            }
            
          })();
          
          subconWriteStdout(sc, ...args);
          
        };
        
        // Now stack depth for stdout subcon invocations has gotten deeper!
        subconWriteStdout.relevantTraceIndex += 1;
        
      } else if (conf('global.features.loadtest')) {
        
        // Note loadtesting cannot apply to the "therapy" deployment!
        
        loadtest = await require('./loadtest/loadtest.js')({
          aboveHut,
          netIden,
          instancesKeep: global.keep('[file:mill].loadtest'),
          getServerSessionKey: getSessionKey,
          sc: global.subcon('loadtest')
        });
        servers.push(loadtest.server);
        
      }
      
      // Each server gets managed by the NetworkIdentity, and is routed
      // so that Sessions are put in contact with the Hut
      for (let server of servers) netIden.addServer(server);
      
      let runOnNetworkTmp = netIden.runOnNetwork(loftConf.name);
      activateTmp.endWith(runOnNetworkTmp);
      await runOnNetworkTmp.prm;
      
      let loft = await getRoom(loftConf.name);
      let loftTmp = await loft.open({
        sc: deploySc.kid(`loft.${loftConf.prefix}`),
        prefix: loftConf.prefix,
        hereHut: aboveHut,
        netIden
      });
      activateTmp.endWith(loftTmp);
      
      // Run load-testing if configured
      if (loadtest) activateTmp.endWith(loadtest.run());
      
    };
    
    // Run all Deploys, including the TherapyDeploy
    let therapyConf = conf('global.therapy');
    let deployConfs = [];
    if (therapyConf) deployConfs.push({
      uid: 'therapy',
      host: null,
      loft: { prefix: 'th', name: 'therapy' },
      keep: null,
      ...therapyConf,
    });
    deployConfs.push(...(global.conf('deploy') ?? {}).toArr(v => v));
    
    await Promise.all(deployConfs.map(runDeploy));
    
  };
  
};

// TODO: Only need to assign the regex props so that tests can reference
// and test them - should instead avoid exporting these props; rather
// trigger their effects in tests (e.g. test compiling a variety of
// sources) and verify if the results are expected 
Object.assign(module.exports, { captureLineCommentRegex, captureInlineBlockCommentRegex });
