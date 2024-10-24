'use strict';

// Little dot: '\u00b7'
// Big dot: '\u2022'
// Broken pipe: '\u00a6'
// Ellipsis: '\u2026'

require('../room/setup/clearing/clearing.js');
let FsKeep = require('./filesys/FsKeep.js');

let NetworkIdentity = require('./NetworkIdentity.js');
let getStdoutSubcon = require('./util/getStdoutSubconOutputter.js');

// Set up basic monitoring
let { processExitSrc } = require('./util/installTopLevelHandler.js')();
let activeTmp = Tmp();
processExitSrc.route(() => activeTmp.end());

// Avoid "//" within String by processing non-String-open characters, or fully enclosed Strings
// (note: may fail to realize that a String with escaped quotes stays open e.g. `'i criii :\')'`)
// Note lookbehind ("?<=") excludes its capture from the match result
let captureLineCommentRegex = Regex.readable(String.baseline(`
  | (?<=                                  )
  |     ^(      |       |       |       )* [ ]*
  |       [^'"#] '[^']*' "[^"]*" #[^#]*#       [/][/].*
`).replace(/#/g, '`')); // Simple way to include literal "`" in regex using 1 char

// Avoid "/*" within Strings; capture terminating "*/" on the same line
let captureInlineBlockCommentRegex = Regex.readable('g', String.baseline(`
  | (?<=                                           )                                 
  |     ^(?:     |           |           |       )* [ ]*         [^*]|[*][^/]        
  |         [^'"] ['][^']*['] ["][^"]*["] #[^#]*#       [/][*](?:            )*[*][/]
`).replace(/#/g, '`')); // Simple way to include literal "`" in regex

module.exports = async ({ hutFp, argv, sc }) => {
  
  // Make subcon output immediately available, but any logs will be buffered until after
  // configuration is complete
  let bufferedSc = [];
  let subconOutput = null;
  sc.rules.output = (...args) => bufferedSc.push(args); // Buffer everything
  let finalizeSubconOutput = outputFn => {
    sc.rules.output = outputFn;
    
    let bsc = bufferedSc;
    bufferedSc = null;
    
    for (let args of bsc) outputFn(...args);
  };
  
  sc.note('initialize', { utc: getMs(), pid: process.pid });
  
  // Initial subcon log...
  let setupSc = sc.kid('setup');
  
  // The whole long Foundation logic may fail before the subcon is unsilenced; this `try` / `catch`
  // ensures the subcon is unsilenced before any Error propagates, so that subcon can be used to
  // show any such Error!
  try {
    
    // Asynchronously init the Hut transaction
    // TODO: Write ".hutfs" to mill?? What if mill is defined to be a location e.g. somewhere
    // outside the repo?? I think the only way "mill" can be moved is via an environment variable
    // or command-line argument; otherwise "mill" contains the configuration file which defines
    // where "mill" is!!
    let rootFsKeep = FsKeep.txn('/', { cfg: `${hutFp}/mill` });
    activeTmp.endWith(rootFsKeep.txn); // Make sure to end the FsTxn when Hut is no longer active
    
    // Setup `global.formatAnyValue`
    global.formatAnyValue = require('./util/formatAnyValue.js'); // (val, { colours, w, d }) => formattedStr;
    global.getMs = require('./util/getCalibratedUtcMillis.js')(/* involves a brief busy-wait */);
    
    // Parse command-line argv
    let commandLineConf = (() => {
      
      try {
        
        let looksLikeEval = /^[{['"]/;
        
        let conf = {};
        for (let arg of argv.slice(2)) {
          
          if (looksLikeEval.test(arg))
            try { arg = eval(`(${arg})`); } catch (err) { err.propagate({ evalArg: arg }); }
          
          if (!arg) continue;
          
          if (isForm(arg, String)) {
            
            // String values without "=" are the single hoist room name; those with "=" represent
            // key-value pairs; those with ":=" represent key-value pairs with eval'd values
            // For example supplying "arr=[1]" will result in `{ arr: '[1]' }`, but "arr:=[1]" gets
            // eval'd and resolves to the actual expected javascript value: `{ arr: [ 1 ] }`
            let isEval = arg.has(':=');
            let [k, v = null] = arg.cut(isEval ? ':=' : '=').map(v => v.trim());
            if (v === null) [k, v] = ['deploy.0.loft.name', k];
            
            try { arg = { [k]: isEval ? eval(`(${v})`) : v }; } catch (err) { err.propagate({ evalArg: v }) }
            
          }
          
          if (!isForm(arg, Object)) throw Error(`Failed to process argument "${arg}"`);
          
          conf.merge(arg);
          
        }
        
        return conf;
        
      } catch (err) {
        
        let feedback = String.baseline(`
          | A shell argument could not be processed.
          | Args beginning with "{" or quotes must represent valid javascript values.
          | One of the received values is invalid:
          ${argv.slice(2).map((arg, n) => `${n + 1}: ${arg}`).join('\n').indent('| ')}
          | 
          | A more specific error description:
          |   |
          ${err.message.trim().indent('|   | ')}
          |   |
        `);
        throw Error('Failed parsing command-line args').mod({ cause: err, feedback });
        
      }
      
    })();
    setupSc.tail('parseCommandLineConf', { commandLineConf });
    
    { // Setup `global.keep`
      
      let RootKeep = form({ name: 'RootKeep', has: { Keep }, props: (forms, Form) => ({
        
        init(map) { Object.assign(this, { map: Object.plain(map) }); },
        access(prop) {
          if (prop[0] === '[') prop = prop.slice(1, -1);
          if (!this.map[prop]) throw Error(`Api: invalid slot: ${getFormName(this)} -> "${prop}"`);
          return this.map[prop];
        }
        
      })});
      
      let hutKeep = rootFsKeep.kidFromFp(hutFp);
      let millKeep = hutKeep.dive('mill');
      
      hutKeep.forbid = { 'mill': 1, '.git': 1 };
      
      let rootKeep = RootKeep({
        'file': rootFsKeep,
        'file:root': rootFsKeep,
        'file:hut':  hutKeep,
        'file:repo': hutKeep,
        'file:mill': millKeep,
        'file:code:src': hutKeep.dive('room'),
        'file:code:cmp': millKeep.dive('cmp')
      });
      global.keep = Object.assign(dt => rootKeep.dive(dt), { rootKeep });
      
    };
    setupSc.tail('initializeKeep', { globalKeep: global.keep });
    
    { // Resolve configuration
      
      // Is there no good choice as to whether subcon or conf should be initialized first?
      // 1. Resolve conf first, then set subconOutput:
      //    - If conf fails, no nice subconOutput to show user-friendly error
      // 2. Set subconOutput first, then resolve conf:
      //    - No conf to determine if the immediately unbuffered logs should be shown or not!
      // The solution is the `try` / `catch` surrounding the entire foundation.js logic - we track
      // whether subcon output has been unsilenced, and if an error occurs beforehand, subcon is
      // definitively unsilenced before the error is allowed to propagate!
      // TODO: The subcon used for this may not always give the prettiest user output.
      
      let globalConf = {};
      let noDefaultProvided = null;
      global.conf = (diveToken, def=noDefaultProvided) => {
        let v = token.diveOn(diveToken, globalConf, def).val;
        //if (v === noDefaultProvided) throw Error('Api: bad conf dive token').mod({ diveToken });
        return v;
      };
      
      let resolveConf = require('./util/resolveConf.js');
      globalConf = await resolveConf({
        rawConf: commandLineConf,                        // We pass in command-line args
        rootKeep: global.keep.rootKeep, // `resolveConf` checks any additionally configured ConfKeeps
        confUpdateCb: updatedConf => globalConf = updatedConf
      });
      
      setupSc.kid('conf').tail('resolve', global.conf([])); // [ ...global.conf([]).linearize() ].toObj(v => v));
      
    };
    setupSc.tail('resolveConf'); // It's tempting to use `global.conf([]).linearize()`, but the keys get very long
    
    // Get subcon output working
    {
      
      sc.rules.rootParams = global.conf('global.subcon');
      
      // Overwrite `subconOutput` with a legit outputter
      // The index in the stack trace which is the callsite that invoked the subcon call (gets
      // overwritten later when therapy requires calling subcons from deeper stack depths)
      let leftColW = 28;
      subconOutput = getStdoutSubcon({
        debug: true,           // Results in expensive stack traces - could be based on conf??
        relevantTraceIndex: 2, // Hardcoded value; determined simply by testing
        leftColW,
        rightColW: Math.max(global.conf('global.terminal.width') - leftColW - 2, 30) // `- 2` considers the "| " divide between L/R cols
      });
      
      // If there's no therapy, finalize using the stdout-only sc output function; if therapy is
      // enabled, the subcon will be finalized later when the sc output function is enhanced to do
      // therapy persistence
      const isTherapyEnabled = conf('global.therapy');
      if (!isTherapyEnabled) finalizeSubconOutput(subconOutput);
      
    }
    setupSc.tail('initializeStdoutSubcon');
    
    { // Set up any configured profiling
      
      if (global.conf('global.profiling.memUsage')) {
        
        let intervalMs = (process.cwd() === '/hut' ? 10 : 30) * 1000;
        let showThreshold = 1;
        let maxMetrics = 20; // Consider `Infinity`
        let metrics = {};
        
        global.mmm = (term, val) => {
          if (!metrics.has(term)) metrics[term] = 0;
          metrics[term] += val;
          if (!metrics[term]) delete metrics[term];
        };
        (async () => {
          
          while (true) {
            
            await new Promise(rsv => setTimeout(rsv, intervalMs));
            
            let bToMb = 1 / (1000 ** 2);
            let { heapUsed, heapTotal } = process.memoryUsage();
            let consumed = heapUsed * bToMb;
            
            let relevantMetrics = metrics
              .toArr((v, k) => (v < showThreshold) ? skip : [ k, v ])
              .valSort(([ k, v ]) => -Math.abs(v))
              .slice(0, maxMetrics);
            
            gsc.say(`Heap: ${consumed.toFixed(2)}mb\n` + (
              relevantMetrics.count()
              ? relevantMetrics.map(([ k, v ]) => `  METRIC - ${k.padTail(20)}${v}`).join('\n')
              : '(No metrics)'
            ).indent(2));
            
          }
          
        })();
        
      }
      
    };
    setupSc.tail('initializeProfiling');
    
    { // Enable `global.getCmpKeep`, `global.mapCmpToSrc`, `global.getRooms`
      
      let srcKeep = keep('[file:code:src]');
      let cmpKeep = keep('[file:code:cmp]');
      let loadedRooms = Map();
      
      // Note "default features" should only define features which are always synced up no matter the
      // bearing; Hut by default expects to run at multiple bearings, so there are no "default"
      // values for bearing-specific features! (They must always be passed when calling`getCmpCode`
      // from a particular context!)
      let defaultFeatures = {
        debug:  conf('global.maturity') === 'dev',
        assert: conf('global.maturity') === 'dev',
        ...conf('global.features')
      };
      let getCmpCode = async (keep, features=Object.stub) => {
        
        // Take a Keep containing source code and return compiled code and all data necessary to map
        // compiled codepoints; note nothing is persisted to a Keep! (that's done by `getCmpKeep`)
        
        let t = getMs();
        let compileSc = sc.kid('compile');
        compileSc.head('compile', { keep });
        
        // TODO: Why lowercase the value??
        features = Set({ ...defaultFeatures, ...features }.toArr((v, k) => v ? k.lower() : skip));
        
        /// {DEBUG=
        if (!isForm(features, Set)) throw Error(`Api: "features" must resolve to Set; got ${getFormName(features)}`);
        let invalidFeature = features.seek(f => !/^[a-z]+$/.test(f)).val;
        if (invalidFeature) throw Error(`Invalid feature: "${invalidFeature}"`);
        /// =DEBUG}
        
        let content = await keep.getData('utf8');
        if (!content) throw Error(`Api: no sourcecode available from ${keep.desc()}`);
        
        let srcLines = content.split(/\r?\n/);
        
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
            // + 'con' + `sole.log('EXECUTE ${sourceName}');`,
          
            // Open a scope; requirement #1
            + ('{')
            
            // Remove any previous strict-mode declaration
            + filteredLines[headInd].replace(/[ ]*['"`]use strict['"`];[ ]*/, ''); // TODO: Replace all instances? Or just the 1st??
            
          // End the scope for requirement #1
          filteredLines[tailInd] += ('};');
          
        }
        
        compileSc.tail('compile', {
          srcLineCount: srcLines.count(),
          cmpLineCount: filteredLines.count(),
          delta: filteredLines.count() - srcLines.count(),
          durationMs: getMs() - t
        });
        
        return { lines: filteredLines, offsets };
        
      };
      global.getCmpKeep = async (bearing, roomDive) => {
        
        // Returns a Keep representing the compiled code associated with some Room. Note an optimal
        // function signature here would simply be `bearing, srcKeep` - but it's easier to accept a
        // PARTIAL DiveToken, leading up to the parent of both src and cmp Keeps. Accepting a full
        // DiveToken or Keep would make it awkward to reference the corresponding compiled Keep!
        // TODO: Should probably just write something like `async srcKeepToCmpKeep`...
        
        roomDive = token.dive(roomDive);
        
        let cmpKeep = keep([ '[file:code:cmp]', bearing, ...roomDive, `${roomDive.at(-1)}.js` ]);
        if (await cmpKeep.exists()) return cmpKeep;
        
        let srcKeep = keep([ '[file:code:src]', ...roomDive, `${roomDive.at(-1)}.js` ]);
        let { lines, offsets } = await getCmpCode(srcKeep, {
          above: [ 'above', 'between' ].has(bearing),
          below: [ 'below', 'between' ].has(bearing)
        });
        
        if (!lines.count()) {
          await cmpKeep.setData(`'use strict';`); // Write something to avoid recompiling later
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
        
        await cmpKeep.setData(lines.join('\n'));
        
        return cmpKeep;
        
      };
      global.mapCmpToSrc = (cmpDiveToken, row, col) => {
        
        // Returns `{ file, col, row, context }`
        // Note the `file` value is a String with repeated slashes (bwds and fwds) replaced with a
        // single forward slash
        
        let mapCmpKeep = global.keep(cmpDiveToken);
        
        // Only map compiled files
        if (!cmpKeep.is(mapCmpKeep).par) return { file: mapCmpKeep.desc(), row, col, context: null };
        
        // Path looks like "..../path/to/compiled/<bearing>/<roomName>"
        let roomName = mapCmpKeep.fd[cmpKeep.fd.length + 1];
        let { offsets } = global.rooms[roomName] ?? { offsets: [] };
        
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
          file: srcKeep.kid([ ...roomPcs, roomPcLast + '.js' ]).desc(),
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
              
              let roomCmpKeep = cmpKeep.dive([ bearing, name, 'cmp' ]);
              await roomCmpKeep.setData(lines.join('\n'));
              
              let roomDbgKeep = cmpKeep.dive([ bearing, name, 'debug' ]);
              await roomDbgKeep.setData(valToSer({ offsets }));
              
              global.rooms[name] = { offsets }; // Make debug info available before `require` to help map SyntaxErrors
              
              require(roomCmpKeep.fp); // Need to stop pretending like `cmpKeep` is a generic Keep (although maybe could `eval` it??)
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
    setupSc.tail('initializeRoomLoader');
    
    { // Run tests
      
      let t = getMs();
      await require('./test.js')();
      
    };
    setupSc.tail('runTests');
    
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
    setupSc.tail('initializeReal');
    
    { // RUN DAT
      
      // Clear data from previous runs
      await Promise.all([
      
        // Previous compiled code
        keep('[file:code:cmp]').rem(),
        
        // Previous loadtest data
        keep('[file:mill].loadtest').rem()
        
      ]);
      
      let netIdenMap = Map(/* conf -> NetworkIdentity */);
      let runDeploy = async deployConf => {
        
        // Realizes a DeployConf:
        // 1. Creates Bank, RecMan, and AboveHut for it
        // 2. Associates the Deploy with a NetIden
        // 3. Creates a Server for each protocol in the DeployConf
        // 4. Associates each Server with the AboveHut and NetIden
        // 
        // Overall, the only thing required to activate the DeployConf is running the NetIden on
        // the network.
        // 
        // Note that each server only determines protocol and port, whereas the NetIden determines
        // the secure/unsafe status of every server it owns!
        
        // `deployConf` looks like:
        //    | {
        //    |   uid : 'b1f2ie',
        //    |   loft: { prefix: 'c2', name: 'chess2' },
        //    |   keep: '/[file:mill]/bank/b1f2ie.c2.chess2',
        //    |   host: {
        //    |     netAddr: 'localhost',
        //    |     heartbeatMs: 20000,
        //    |     protocols: {
        //    |       0: { name: 'http', port: 8000, compression: [] },
        //    |       1: { name: 'sokt', port: 8000, compression: [] }
        //    |     },
        //    |     netIden: {
        //    |       name: 'tester',
        //    |       keep: null,
        //    |       secureBits: 2048,
        //    |       certificateType: 'selfSign',
        //    |       details: {
        //    |         geo: 'earth.na.canada.ontario.toronto.?',
        //    |         org: 'hut.lead.dev.?.?.?',
        //    |         email: 'tester@test.com',
        //    |         password: null
        //    |       }
        //    |     }
        //    |   }
        //    | }
        
        let { uid, host, loft, keep } = deployConf;
        let { netIden: netIdenConf, netAddr, heartbeatMs, protocols } = host;
        let { hut, record, WeakBank=null, KeepBank=null } = await global.getRooms([
          'setup.hut',
          'record',
          `record.bank.${keep ? 'KeepBank' : 'WeakBank'}`
        ]);
        
        // Subcon for Deployment depends on whether it's Therapy - the Therapy room *must* use the
        // stub subcon - otherwise there would be horrific circular logging implications!
        let deploySc = loft.name === 'therapy' ? global.Subcon.stub : sc; // Tempting to put a uid here, but makes it hard to configure via Conf (no single term to configure chatter for "deploy subcon")
        
        // The same NetIden can be used across multiple deployments
        // TODO: Is using the json-stringified conf as the key reliable??
        let key = valToJson(netIdenConf);
        let netIdenDeployConf = netIdenMap.get(key);
        if (!netIdenDeployConf) netIdenMap.set(key, netIdenDeployConf = {
          // This non-stub subcon won't cause therapy loops!
          netIden: NetworkIdentity({ ...netIdenConf, sc: deploySc }),
          deployConfs: []
        });
        netIdenDeployConf.deployConfs.push(deployConf);
        
        let secure = netIdenDeployConf.netIden.secureBits > 0;
        
        // Initialize a Bank based on `keep`
        let bank = keep
          ? KeepBank({ sc: deploySc, keep: global.keep(keep).kid({ mode: 'strong' }) })
          : WeakBank({ sc: deploySc });
        
        // Get an AboveHut with the appropriate config
        let recMan = record.Manager({ bank, sc: deploySc.kid('manager') });
        let aboveHut = hut.AboveHut({ hid: uid, isHere: true, recMan, heartbeatMs, deployConf, sc: deploySc });
        activeTmp.endWith(aboveHut);
        
        // Server management...
        let roadAuths = await Promise.all(protocols.toArr(async protocolOpts => {
          
          let { name: protocol, port, compression, ...opts } = protocolOpts;
          
          let roadAuthorityPrm = Object.plain({
            http: () => require('./server/http.js'),
            sokt: () => require('./server/sokt.js'),
          })[protocol]?.() ?? Error(`Unfamiliar protocol: ${protocol}`).propagate();
          
          let RoadAuthority = await roadAuthorityPrm;
          return RoadAuthority({
            secure,
            netProc: `${netAddr}:${port}`,
            compression,
            aboveHut,
            sc: deploySc.kid(`traffic.${protocol}`),
            ...opts
          });
          
        }));
        
        let loadtest = null;
        if (loft.name === 'therapy') {
          
          let pfx = loft.prefix;
          
          // Mark Therapy-related Record Types as "unchanging":
          for (let t of 'therapy,therapyLoft,stream,notion'.split(','))
            recMan.getType(`${pfx}.${t}`).schema.merge({ mod: false, rem: false });
          
          let subconWriteStdout = subconOutput;
          
          // We know the uid of the root Therapy Record; this means if it
          // already exists we'll get a reference to it!
          let therapyRec = recMan.addRecord({ uid: '!therapyRoot', type: `${pfx}.therapy`, value: { ms: getMs() } });
          
          // Associate the Loft with the Therapy rec as soon as possible
          let loftRh = aboveHut.relHandler({ type: `${pfx}.loft`, term: 'hut', limit: 1 });
          activeTmp.endWith(loftRh);
          loftRh.route(loftHrec => {
            
            // As soon as a Loft is produced for Therapy, attach `therapyRec` (the root Therapy Rec
            // required for all subcon notion handling) to the Loft via a "therapyLoft" Rec. This
            // makes Therapy room logic able to reference root Therapy data via the Loft!
            
            // Once this Record is added, Therapy data can be accessed from the loftRec with:
            //    | loftRec.rh('therapyLoft').route(hrec => {
            //    |   let { rec } = hrec;
            //    | });
            // (Assuming the prefix ("namespace") will be resolved by default)
            recMan.addRecord({
              uid: '!therapyLoft',
              type: `${pfx}.therapyLoft`,
              group: [ loftHrec.rec, therapyRec ],
              value: { ms: getMs() }
            });
            
          });
          
          // Stdout enhanced with therapy output
          finalizeSubconOutput((sc, ...args) => then(subconWriteStdout(sc, ...args), scVal => {
            
            // Ignore any output which resolved as nullish
            if (scVal === null)    return;
            
            // Never send `gsc` to Therapy
            if (sc.term === 'gsc') return;
            
            // Ignore any output which is configured as non-therapy output
            let { params: { therapy = false }, args=[] } = scVal;
            if (!therapy)          return;
            
            // Ignore if no argument exist
            if (args.length === 0) return;
            
            return (async () => {
              
              // Note that this function may never write via `sc` (would be an infinite loop!)
              
              let ms = getMs();
              let streamUid = `!stream@${sc.term}`;
              
              (async () => {
                
                // TODO: Use `normalizeAnyValue`???
                // TODO: Revisit this; don't call the value "args"; avoid sending, e.g.,
                //   Buffers as { length: 1000, data:[100,101,102, ... ] }
                let a = args[0];
                try { valToJson(args); } catch (err) {
                let { $props, props } = a.categorize((v, k) => k[0] === '$' ? '$props' : 'props');
                  a = { ...$props, val: formatAnyValue(props, { ansiFn: v => v }) };
                }
                
                let streamRec = await recMan.addRecord({
                  uid: streamUid,
                  type: `${pfx}.stream`,
                  group: [ therapyRec ],
                  value: { ms, term: sc.term }
                });
                let notionRec = await recMan.addRecord({
                  type: `${pfx}.notion`,
                  group: [ streamRec ],
                  value: { ms, args: a } // TODO: only `args[0]`? Not all `args`??
                });
                
              })();
                
            })();
            
          }));
          
          // Now stack depth for stdout subcon invocations has gotten deeper!
          subconWriteStdout.relevantTraceIndex += 1;
          
        }
        
        if (conf('global.features.loadtest') && loft.name !== 'therapy') {
          
          // TODO: Drift! loadtest's server must inherit from RoadAuthority. Basically need to test
          // loadtesting; it's going to fail in a whole bunch of ways at first...
          
          // Note loadtesting cannot apply to the "therapy" deployment! (TODO: ...... why??)
          
          loadtest = await require('./loadtest/loadtest.js')({
            aboveHut,
            netIden: netIdenDeployConf.netIden,
            instancesKeep: global.keep('/[file:mill]/loadtest'),
            getServerSessionKey: getSessionKey,
            sc: deploySc
          });
          roadAuths.push(loadtest.roadAuth);
          
        }
        
        // RoadAuths are managed by the NetIden (RoadAuths connect remote sessions to the AboveHut)
        for (let server of roadAuths) netIdenDeployConf.netIden.addServer(server);
        
        let loftTmp = await getRoom(loft.name).then(loft => loft.open({
          sc:      deploySc.kid(`loft.${loft.prefix}`),
          prefix:  loft.prefix,
          hereHut: aboveHut,
          rec:     aboveHut,
          netIden: netIdenDeployConf.netIden
        }));
        activeTmp.endWith(loftTmp);
        
        // Run load-testing if configured
        if (loadtest) activeTmp.endWith(loadtest.run());
        
      };
      
      // Run all Deploys, including the TherapyDeploy
      let therapyConf = conf('global.therapy');
      let deployConfs = [
        
        // Include all configured deployments
        ...(global.conf('deploy') ?? {}).toArr(v => v),
        
        // Include the therapy deployment
        ...(!therapyConf ? [] : [{
          uid: 'therapy',
          enabled: 1,
          host: null,
          loft: { prefix: 'th', name: 'therapy' },
          keep: null
        }.merge(therapyConf)])
        
      ].filter(deploy => deploy.enabled);
      
      // Prepare all Deploys to run with the appropriate AboveHut
      await Promise.all(deployConfs.map(runDeploy));
      
      for (let { netIden, deployConfs } of netIdenMap.values()) {
        
        let runOnNetworkTmp = await netIden.runOnNetwork(deployConfs.map(dpc => dpc.loft.name.split('.').at(-1)).join('+'));
        activeTmp.endWith(runOnNetworkTmp);
        await runOnNetworkTmp.prm;
        
        setupSc.head('deploy', () => {
          
          let str = String.baseline(`
            | Hut with identity "${netIden.name}" exposed to network
            | 
            | Network config:
            | ${'\u2022'} Identity: "${netIden.name}"
            | ${'\u2022'} Security: ${netIden.secureBits ? `${netIden.secureBits}-bit` : 'UNSAFE'}
            | ${'\u2022'} Certificate type: ${netIden.certificateType ? `"${netIden.certificateType}"` : '<none>'}
          `);
          
          for (let dc of deployConfs) {
            
            str += `\n\nDeployed "${dc.loft.prefix}.${dc.loft.name}" on:`;
            
            for (let { name, port } of dc.host.protocols.toArr(v => v))
              str += `\n${'\u2022'} ${netIden.getServer(name, port).desc()}`;
            
          }
          
          return str;
          
        });
        
        runOnNetworkTmp.endWith(() => setupSc.tail('deploy', `Hut with identity "${netIden.name}" removed from network `));
        
      }
      
    };
    setupSc.tail('deploy');
    
  } catch (err) {
    
    // Make sure a visible subcon is applied before `err` propagates! If no subcon is already
    // applied, the subcon used is considered the "panic" subcon
    if (bufferedSc) finalizeSubconOutput((sc, ...args) => {
      
      // `formatArgs` won't return a Promise if we ensure non of the args are Promises, or
      // Functions returning Promises
      let outputVal = args.find(arg => !isForm(arg, Object) || arg.count() !== 1 || arg.toArr((v, k) => k)[0][0] !== '$');
      let outputOpts = {
        w: 100,
        indentSize: 2,
        stringFormat: 'multiline'
      };
      console.log(global.formatAnyValue(outputVal, outputOpts).indent('[panic] ') + '\n');
      
    });
    
    throw err;
    
  }
  
};

// TODO: Only need to assign the regex props so that tests can reference and test them - should
// instead avoid exporting these props; rather trigger their effects in tests (e.g. test compiling
// a variety of sources) and verify if the results are expected 
Object.assign(module.exports, { captureLineCommentRegex, captureInlineBlockCommentRegex });
