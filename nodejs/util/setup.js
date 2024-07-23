// Performs basic, context-unaware setup of Hut-style javascript normalization
// Note that this setup have the following considerations (which ../foundation.js does implement):
// - Friendly user output for initialization errors
// - Initialization of `global.keep`
// - Config ingestion/resolution (including subcon config)
// - Memory/performance profiling
// - Initialization of `global.real`
// - Initialization of `global.getRoom` and other Hut-style compilation features

'use strict';

global.rooms = Object.create(null);
require('../../room/setup/clearing/clearing.js');
require('./installV8PrepareStackTrace.js')();

// Environment setup...
require('./installTopLevelHandler.js')();
global.formatAnyValue = require('./formatAnyValue.js');
global.getMs = require('./getCalibratedUtcMillis.js')();

let getStdoutSubcon = require('./getStdoutSubconOutputter.js');
global.subconOutput = getStdoutSubcon({
  debug: true,           // Results in expensive stack traces - could be based on conf??
  relevantTraceIndex: 2, // Hardcoded value; determined simply by testing
  leftColW: 30,
  rightColW: 80
});
