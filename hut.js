/// <reference path="./ts/hut.d.ts"/>

//  TODO: HEEERE!!
//  1. ctrl+alt+f for "UNCHANGINGRECWTF" - The "unchanging" concept greatly enables Therapy!
//  2. Where are "strikes" at?? (Auto-deny offensive network clients)
//  3. How the hell to pad Reals?? Do we like Text's "spacing"??? Surprisingly intractable...
//     - Can a more generic nested Real do this?
//         | 
//         | let parWithPadding = someReal.addReal('withPadding');
//         | parWithPadding.addLayouts({ Resize: {
//         |   extend: { l: '10px', r: '10px', t: '10px', b: '10px' }
//         | }});
//         | let paddedText = parWithPadding.addReal('paddedText', { Text: { text: 'Padded!' } });
//         | 
//     - It's soooo tempting to make "Resize" (or just name it "Pad"?) able to be added to the
//       target Real directly (instead of having to nest inside an extra Real); the hesitation is
//       because it would violate the "facet ownership" principle; Resize/Pad should be able to
//       coexist with any other Real which owns the "content" facet (e.g. Text), but intuitively
//       Resize/Pad should own the "content" facet itself!!
//  4. What about Real "minimum dimensions" (e.g. in Therapy a stream Real should grow taller as it
//     fills with elements until it reaches some "max size", at which point it gains scrolling)
//  
//  SUBCON STANDARDIZATION:
//  - When to use "term" vs { $: { domain: 'abc' } }? The "term" is already the domain - no??
//  - We want a term/domain to prevent indexing conflicts between unrelated domains which use the
//    same index key (e.g. servers and foundations could both index by `{ stage: 'setup' }`, but
//    we probably wouldn't want to aggregate the logs from both setup stages together)
//  - Consider NetworkIdentity, which simply indexes by its "name" (all NetworkIdentities in use
//    simultaneously should have unique names??), and then later specializes a logger using a
//    "netIdenSgn" property, which is a random id that ties together all logs from a single SGN
//    generation process
//  - Overall the idea is to tie logs together! I think ids should always be random e.g. don't use
//    the NetworkIdentity's "name" property - if anything the NetworkIdentity "name" can appear in
//    the log payload! (And it only needs to appear once, since it will be indexed together with
//    its corresponding logs)
//  - What about heirarchical terms/domains?? I think the same random ids can consistently appear
//    under increasingly specialized domains
//  - What about allowing a consumer to initialize a bunch of subcons under the same LogicSpace but
//    each with a unique prefix? E.g. two servers initialized by a consumer who prefixed them
//    "server.http" and "server.sokt"? Now the shared RoadAuthority LogicSpace driving both servers
//    uses `this.sc` to output, but depending on the server instance (and its `sc` instance) the
//    domain included in the log varies - the domain no longer fully corresponds to the LogicSpace!
//  - Oh boy it's starting to sound like all `sc` terms should be completely hardcoded: looking at
//    code which calls subcon output should be equivalent to knowing exactly what the domain
//    included in the output will be (overall, domain/term and LogicSpace are the SAME THING)
//  - This basically means the ideal domain would always be the filename + row + col of the
//    corresponding log statement; we'll allow this to be a little looser though. Probably all
//    subcon calls in the same file should have the same domain?? What about, e.g. AboveHut and
//    BelowHut which are defined in the same file? It's like domain/term/LogicSpace basically means
//    "we're leaving it quite loosely up to you how to distinctly refer to this exact spot in code,
//    without conflicting with any other domains anywhere else"
//  - I think the only moment where the consumer should dynamically pass subcon instances is to
//    Therapy, to pass it a dummy subcon that will always do no output... subcons are heirchized by
//    the Loft they're supporting, and *nothing else*??
//  - OVERALL:
//    - Subcon regexes:
//      - All specialization: ... ".kid" ...
//      - All output: /(subcon|\bsc\b|[a-zA-Z]+Sc\b)[(]/
//    - Consumer should pass the plain sc instance; they shouldn't specialize one themselves
//    - The LogicSpace receiving the plain sc should specialize it to reflect the LogicSpace
//    - Do not send a plain string or a "msg" property - the value intended for these fields is a
//      "one-time LogicSpace heirarchy extension"; we'll call this a "region" (use a property named
//      "region"); its value should be succinct, but potentially more verbose/human-readable than
//      a LogicSpace heirarchy component
//      - A LogicSpace "region" String should be present-tense, without punctuation, and implying
//        the corresponding code region *just completed invocation* (better to output at the end by
//        default, as at the end results can be included in the output)
//       - To output region initialization (immediately *before* the region will be invoked) use:
//         | sc.head('createAccount');
//         | let account = await createAccount();
//         | sc.tail('createAccount', { account });
//       - What's up with Error messages? No LogicSpace needed as stack is sufficient
//    - Region should be space-delimited, without any variable components (LogicSpace-related)
//    - Sc output should consist of raw data, not formatted strings (use conf.js to apply human
//      formatting; TODO: need some way to register default chatter-level formatters)
//    - Sc output property formatting for therapy-level?? `formatAnyValue` required? Probably don't
//      want to save raw object instances (e.g. ServerResponse) into KeepBank

// Comments may precede "use strict": https://stackoverflow.com/questions/31412978
'use strict';

process.stdout.write('\u001b[0m'); // Clear any ansi set by previous output (TODO: good behaviour?)

// Setup stack trace enhancement
require('./nodejs/util/installV8PrepareStackTrace.js')();

// Require clearing.js (it purely modifies global state!)
Object.assign(global, { rooms: Object.create(null) });
require('./room/setup/clearing/clearing.js');

// Do nothing more if this isn't the main file
if (process.argv[1] !== __filename) return;

// Load the foundation
Promise.resolve()
  .then(() => require('./nodejs/foundation.js')({ hutFp: __dirname, argv: process.argv, sc: global.subcon.kid([]) }))
  .fail(err => {
    esc.note('foundationError', err.feedback ?? err.desc()); // Errors with "feedback" properties are user-friendly
    process.exitNow(1);
  });