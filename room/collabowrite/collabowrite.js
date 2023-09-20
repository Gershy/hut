global.rooms['collabowrite'] = async foundation => {
  
  let rooms = await foundation.getRooms([
    /// {ABOVE=
    'random',
    /// =ABOVE}
    'logic.TimerSrc',
    'logic.Chooser',
    'logic.MapSrc',
    'persona',
    'clock',
    'habitat.HtmlBrowserHabitat',
    'Hinterland'
  ]);
  
  /// {ABOVE=
  let { random } = rooms;
  /// =ABOVE}
  let { Chooser, MapSrc, TimerSrc, Hinterland, HtmlBrowserHabitat } = rooms;
  let { Clock } = rooms.clock;
  let { PersonaSrc } = rooms.persona;
  
  let realTree = Object.plain({
    
    pfx: 'cw',
    has: name => !!realTree.def[name],
    get: name => {
      let val = realTree.def[name];
      if (isForm(val, Array)) val = { layouts: val };
      return { params: {}, layouts: [], ...val };
    },
    
    def: Object.plain({
      
      'root': [
        { form: 'Decal', colour: '#009', text: { size: '1.5em', colour: '#fff' } },
        { form: 'Geom', w: '100%', h: '100%' }
      ],
      
      'root->header': [
        { form: 'Decal', colour: '#00f8' },
        { form: 'Geom', w: '100%', h: '3em' }
      ],
      'root->header->title': [
        // TODO: Would be so nice if Geom centering ({ anchor: 'mid', x: '0', y: '0' })
        // could work when the element width is dynamic (e.g. based on text)
        { form: 'Decal', text: { size: '2em' } },
        { form: 'Geom', anchor: 'mid' }
      ],
      'root->header->logout': [
        { form: 'Decal', text: { size: '0.75em', colour: '#fffa' } },
        { form: 'Geom', anchor: 'r' }
      ],
      
      'main':  [{ form: 'Geom', w: '100%', h: 'calc(100% - 3em)' }],
      
      'main->lobby': [{ form: 'Geom', w: '100%', h: '100%' }],
      'main->lobby->rooms': [
        { form: 'Geom', w: '100%', h: 'calc(100% - 1em)' },
        { form: 'Axis1d', axis: 'y', mode: 'stackFwd' }
      ],
      'main->lobby->rooms->room': [
        { form: 'Geom', w: '100%', oh: '10px' },
        { form: 'Axis1d', axis: 'y', mode: 'stackFwd' },
        { form: 'Decal', border: { ext: '5px', colour: '#00f4' } }
      ],
      'main->lobby->rooms->room->header': [
        { form: 'Geom', w: '100%' },
        { form: 'Axis1d', axis: 'x', mode: 'compactCenter' }
      ],
      'main->lobby->rooms->room->header->title': [
        { form: 'Geom', h: '3em', ow: '10px' }, // TODO: The others are h: '3em', but need to accomodate the title's own text-size. This is counter-intuitive and annoying!
        { form: 'Decal' }
      ],
      'main->lobby->rooms->room->header->deets': [
        { form: 'Geom', h: '3em', ow: '10px' },
        { form: 'Decal', colour: '#8888', text: { colour: '#fffe' } }
      ],
      'main->lobby->rooms->room->header->enter': [
        { form: 'Geom', h: '2em', ow: '10px' },
        { form: 'Decal', colour: '#88f8', text: { size: '1.5em' } }
      ],
      'main->lobby->rooms->room->details': [
        { form: 'Geom', ow: '10px', oh: '1em' },
        { form: 'Decal', colour: '#00f8' }
      ],
      'main->lobby->make': [
        { form: 'Geom', w: '100%', h: '1em' },
        { form: 'Decal', colour: '#00f8', text: { size: '1em' } }
      ],
      
    })
    
  });
  
  let canVoteOwn = true;
  
  return Hinterland('cw', 'collabowrite', {
    habitats: [ HtmlBrowserHabitat() ],
    above: async (hut, cw, real, dep) => {
      
      /// {ABOVE=
      
      hut.addPreloadRooms([
        'logic.MemSrc',
        'logic.Chooser',
        'logic.MapSrc',
        'logic.TimerSrc',
        'persona',
        'clock',
        'reality.layout.Decal',
        'reality.layout.Geom',
        'reality.layout.Text',
        'reality.layout.TextInput',
        'reality.layout.Press',
        'reality.layout.Axis1d'
      ]);
      
      let rand = random.NativeRandom();
      
      // TODO: Which Rooms do we want in RAM? Presumably not Rooms which
      // have no active RoomPersonas?
      dep.scp(cw, { type: 'room', term: 'cw' }, async (room, dep) => {
        
        // Make the "numAuthors" property live on each Room
        let roomAcntAuditSrc = dep(room.rh('roomAccount')).getAuditSrc();
        dep(roomAcntAuditSrc.route( audit => room.setValue({ numAuthors: audit.num }) ));
        
        // Make the "numIdeas" property live on each Room
        let roomIdeaAuditSrc = dep(room.rh('idea')).getAuditSrc();
        dep(roomIdeaAuditSrc.route( audit => room.setValue({ numIdeas: audit.num }) ));
        
        // Make the "numVotes" property live on each Room
        let roomVoteAuditSrc = dep(room.rh('vote')).getAuditSrc();
        dep(roomVoteAuditSrc.route( audit => room.setValue({ numVotes: audit.num }) ));
        
        // `stateChooser` turns the Room's "state" value into a Choice
        let stateChooser = dep(Chooser());
        let roomStateSrc = dep(room.getValuePropSrc('state'));
        dep(roomStateSrc.route(state => stateChooser.choose(state)));
        
        // Treat each of the states independently; each State leads to
        // the next and "vote" finally loops back to "wait"
        dep.scp(stateChooser.src('wait'), (wait, dep) => {
          
          // Switch to "ready" when enough Authors join
          dep(room.valueSrc.route(() => {
            
            let minAuthors = room.getValue('minAuthors');
            let numAuthors = room.getValue('numAuthors');
            
            if (numAuthors >= minAuthors) room.setValue({ state: 'ready' });
            
          }));
          
        });
        dep.scp(stateChooser.src('ready'), (ready, dep) => {
          
          // Switch to "submit" once any single Idea is received
          let ideaRh = dep(room.rh({ type: 'idea', limit: 1 }));
          dep(ideaRh.route( () => room.setValue({ state: 'submit', submitTs: Date.now() }) ));
          
        });
        dep.scp(stateChooser.src('submit'), (submit, dep) => {
          
          let submitTmp = Tmp(); // Sends once submitting ends
          dep(submitTmp.route( () => room.setValue({ state: 'vote', voteTs: Date.now() }) ));
          
          // Check for all Authors to have submitted an Idea
          let ideaRhAudit = dep(room.rh('idea')).getAuditSrc();
          
          let numAuthorsSrc = dep(room.getValuePropSrc('numAuthors'));
          let batchSrc = dep(BatchSrc({ ideaAudit: ideaRhAudit, numAuthors: numAuthorsSrc }));
          dep(batchSrc.route(({ ideaAudit, numAuthors }) => {
            if (ideaAudit.num >= numAuthors) submitTmp.send({ reason: 'allSubmitted' }); 
          }));
          
          // Check for the time limit to run out
          let { submitTs, submitSecs } = room.getValue();
          let timerSrc = dep(TimerSrc({ num: 1, ms: (submitTs + submitSecs * 1000) - Date.now() }));
          timerSrc.route(() => submitTmp.send({ reason: 'timeLimit' }));
          
        });
        dep.scp(stateChooser.src('vote'), async (submit, dep) => {
          
          // Note that there's at least 1 submitted Idea at this point,
          // because it's impossible to get to the "submit" stage unless
          // an Idea was submitted
          
          let getIdeaRanking = ({ ideas, votes }) => ideas
            .map(idea => {
              let ideaVotes = votes.filter(vote => vote.m('idea') === idea);
              return { idea, votes: ideaVotes, score: ideaVotes.count() };
            })
            .sort(({ score: s1 }, { score: s2 }) => s2 - s1);
          
          let voteTmp = Tmp(); // Sends once voting ends
          dep(voteTmp.route(async ({ reason, winningIdea=null, ranking=null }) => {
            
            let [ ideas, votes ] = await Promise.all([
              room.withRh('idea', rh => rh.getRecs()),
              room.withRh('vote', rh => rh.getRecs())
            ]);
            if (!ranking) ranking = getIdeaRanking({ ideas, votes });
            
            if (ranking.count() === 0) return room.setValue({ state: 'wait' }); // `winningIdea` should be `null`
            
            if (winningIdea === null) {
              
              // Break the tie randomly amongst the highest-rated Ideas:
              let bestScore = ranking[0].score;
              let leaders = ranking.filter(v => v.score === bestScore);
              winningIdea = rand.getElem(leaders).idea;
              
            }
            
            gsc('DONE VOTING', { reason, text: winningIdea.getValue() });
            
            // Add an Entry to the story!
            let entry = hut.addRecord('entry', [ room, winningIdea.m('roomAccount').m('account') ], winningIdea.getValue());
            
            // Preserve the Round data
            let round = hut.addRecord('round', [ room, entry ], {
              ideaCount: ideas.count(),
              voteCount: votes.count(),
              ts: Date.now()
            });
            for (let { idea, votes, score } of ranking) {
              
              let roundIdea = hut.addRecord('roundIdea', [ round, idea.m('roomAccount').m('account') ], {
                text: idea.getValue(),
                score,
                won: idea === winningIdea
              });
              
              for (let vote of votes)
                hut.addRecord('roundVote', [ roundIdea, vote.m('roomAccount').m('account') ]);
              
            }
            
            // Clear up Ideas (cascades to end all Votes as well)
            for (let rec of ideas) rec.end();
            
            room.setValue({ state: 'wait' });
            
          }));
          
          let numAuthorsSrc = dep(room.getValuePropSrc('numAuthors'));
          let ideaAuditSrc = dep(room.rh('idea')).getAuditSrc();
          let voteAuditSrc = dep(room.rh('vote')).getAuditSrc();
          
          // Check for an idea to gain an unbeatable lead
          dep(BatchSrc([ numAuthorsSrc, ideaAuditSrc, voteAuditSrc ])).route(([ numAuthors, ideaAudit, voteAudit ]) => {
            
            let doneVotingResult = (() => {
              
              // Check for all Authors to have submitted a Vote
              if (voteAudit.num >= numAuthors) voteTmp.send({ reason: 'allVoted' });
              
              let ideas = [ ...ideaAudit.all() ];
              let votes = [ ...voteAudit.all() ];
              
              let ranking = getIdeaRanking({ ideas, votes });
              
              // Check if there was a trivial number of submissions
              if (ranking.count() === 0) return { reason: 'pointless', ranking, winningIdea: null };
              if (ranking.count() === 1) return { reason: 'noContest', ranking, winningIdea: ranking[0].idea };
              
              // Check if the leading idea is unbeatable
              let [ gold, silver ] = ranking; // Note at this point there's at least 2 Ideas submitted!
              let remainingVoters = numAuthors - voteAudit.num;
              let voteGap = gold.votes.count() - silver.votes.count();
              
              if (voteGap > remainingVoters) return { reason: 'unbeatable', winningIdea: gold.idea, ranking };
              return null;
            
            })();
            
            if (doneVotingResult) voteTmp.send(doneVotingResult);
            
          });
          
          // Check for the time limit to run out
          let { voteTs, voteSecs } = room.getValue();
          let timerSrc = dep(TimerSrc({ num: 1, ms: (voteTs + voteSecs * 1000) - Date.now() }));
          timerSrc.route(() => voteTmp.send({ reason: 'timeLimit' }));
          
        });
        
      });
      
      /// =ABOVE}
      
    },
    below: async (hut, cw, real, dep) => {
      
      /// {BELOW=
      /// {DEBUG=
      if (0) (await foundation.getRoom('collabowrite.testHooks.authorsSubmit'))(hut);
      /// =DEBUG}
      /// =BELOW}
      
      real.setTree(realTree);
      
      let headerReal = dep(real.addReal('header'));
      
      headerReal.addReal('title', [{ form: 'Text', text: 'Collabowrite' }]);
      
      let mainReal = dep(real.addReal('main', []));
      
      let personaSrc = dep(PersonaSrc({ hut, rec: cw }));
      let loginChooser = dep(Chooser.noneOrSome(personaSrc));
      dep.scp(loginChooser.srcs.off, (out, dep) => {
        
        let loginReal = dep(mainReal.addReal('login'));
        dep(personaSrc.addLogin(loginReal));
        
      });
      dep.scp(loginChooser.srcs.onn, (persona, dep) => {
        
        let logoutAct = dep(hut.enableAction('logout', () => persona.end()));
        let logoutReal = dep(headerReal.addReal('logout', [
          { form: 'Text', text: `Log out (${persona.getValue('user')})` },
          { form: 'Press', pressFn: () => logoutAct.act() }
        ]));
        
        let roomPersonaRh = dep(persona.rh('roomPersona'));
        let roomPersonaChooser = dep(Chooser.noneOrSome(roomPersonaRh));
        dep.scp(roomPersonaChooser.srcs.off, (noRoomPersona, dep) => {
          
          // View the lobby, or make a new room
          
          let makeRoomAct = dep(hut.enableAction('makeRoom', ({ command, ...args }) => {
            
            args = { ...makeRoomFields.map(v => v.def), ...args };
            
            if (!args.name) throw Error(`"name" is required`);
            if (!args.desc) args.desc = '<no description>';
            
            let room = hut.addRecord('room', { cw, creator: persona.m('account') }, {
              ...makeRoomFields.map((v, k) => args[k]),
              state: 'wait',
              numAuthors: 0,
              numIdeas: 0,
              numVotes: 0,
              submitTs: null,
              voteTs: null,
              ts: Date.now()
            });
            
            // Immediately add the Persona into the new Room
            let roomAccount = hut.addRecord('roomAccount', [ persona.m('account'), room ]);
            hut.addRecord('roomPersona', [ persona, roomAccount ]);
            
          }));
          let makeRoomFields = { /* name, desc, charLimit, submitSecs, voteSecs, maxRounds, (min|max)Authors */
            name:       { name: 'Room Name',         type: 'text', def: null     },
            desc:       { name: 'Description',       type: 'text', def: null     },
            charLimit:  { name: 'Character Limit',   type: 'int',  def: '100'    },
            submitSecs: { name: 'Seconds to Submit', type: 'int',  def: '120'    },
            voteSecs:   { name: 'Seconds to Vote',   type: 'int',  def: '120'    },
            maxRounds:  { name: 'Max Rounds',        type: 'int',  def: '\u221e' },
            minAuthors: { name: 'Minimum Authors',   type: 'int',  def: '3'      },
            maxAuthors: { name: 'Maximum Authors',   type: 'int',  def: '10'     }
          };
          
          let modeChooser = dep(Chooser());
          dep.scp(modeChooser.src('lobby'), (lobby, dep) => {
            
            // TODO: Handle RelHandlers whose offset/limit changes sync
            // between above/below?? Above applies the offset and sends
            // results; Below incorrectly applies the offset again...
            let roomsRh = dep(cw.rh({ type: 'room', term: 'cw', offset: 0, limit: 20, fixed: false }));
            
            let lobbyReal = dep(mainReal.addReal('lobby'));
            
            let roomsReal = lobbyReal.addReal('rooms');
            dep.scp(roomsRh, (room, dep) => {
              
              let joinRoomAct = dep(hut.enableAction(`joinRoom/${room.uid}`, async () => {
                
                // Try to get a preexisting RoomAccount
                // TODO: This should be:
                //    | hut.group([ account, room ])
                //    |   .withRh({ type: 'roomAccount', limit: 1, fn: rh => rh.getRec() });
                let account = persona.m('account');
                let roomAccount = await account.withRh({
                  type: 'roomAccount',
                  limit: 1,
                  opts: { filter: ra => ra.mems['cw.room'] === room.uid },
                  fn: rh => rh.getRec()
                });
                
                if (!roomAccount) {
                  
                  // If no RoomAccount exists check if there's space...
                  let numRoomAccounts = await room.withRh('roomAccount', rh => rh.countSent());
                  if (numRoomAccounts >= room.getValue('maxAuthors')) throw Error('Room is full! Sorry! Oh dear!');
                  
                  // ... and if there's space make a new RoomAccount!
                  roomAccount = hut.addRecord('roomAccount', [ room, account ]);
                  
                }
                
                hut.addRecord('roomPersona', [ roomAccount, persona ]);
                
              }));
              
              let roomReal = dep(roomsReal.addReal('room'));
              let roomHeader = roomReal.addReal('header');
              let roomTitleReal = roomHeader.addReal('title', { text: '\u2026' }, [
                { form: 'Text' }
              ]);
              dep(room.valueSrc.route(() => roomTitleReal.mod({ text: room.getValue('name') })));
              
              let deetsReal = roomHeader.addReal('deets');
              
              let enterReal = roomHeader.addReal('enter', [
                { form: 'Text', text: 'Join!' },
                { form: 'Press', pressFn: () => joinRoomAct.act() }
              ]);
              
              let detailsChooser = dep(Chooser());
              dep.scp(detailsChooser.src('off'), (noDetails, dep) => {
                
                dep(deetsReal.addLayout({ form: 'Text', text: 'See Details' }));
                dep(deetsReal.addLayout({ form: 'Press', pressFn: () => detailsChooser.choose('onn') }));
                
              });
              dep.scp(detailsChooser.src('onn'), (details, dep) => {
                
                dep(deetsReal.addLayout({ form: 'Text', text: 'Hide Details' }));
                dep(deetsReal.addLayout({ form: 'Press', pressFn: () => detailsChooser.choose('off') }));
                
                let detailsReal = dep(roomReal.addReal('details'));
                
                let descReal = detailsReal.addReal('description', { text: 'Description: \u2026' }, [{ form: 'Text' }]);
                let descSrc = dep(room.getValuePropSrc('desc'));
                dep(descSrc.route(desc => descReal.mod({ text: `Description: ${desc}` })));
                
                let creator = room.m('creator');
                let creatorReal = detailsReal.addReal('creator', { text: 'Creator: \u2026' }, [{ form: 'Text' }]);
                let userSrc = dep(creator.getValuePropSrc('user'));
                dep(userSrc.route(user => creatorReal.mod({ text: `Creator: ${user}` })));
                
                let ageReal = detailsReal.addReal('age', { text: 'Age: \u2026' }, [{ form: 'Text' }]);
                let tsSrc = dep(room.getValuePropSrc('ts'));
                dep(tsSrc.route(ts => {
                  
                  let msDiff = Date.now() - ts;
                  let hours = (msDiff / (1000 * 60 * 60));
                  ageReal.mod({ text: `Age: ${hours.toFixed(2)}hrs` });
                  
                }));
                
              });
              
            });
            
            let roomsPagerReal = lobbyReal.addReal('roomsPager');
            let roomsPagerOffsetDispReal = roomsPagerReal.addReal('offsetDisp');
            let roomsPagerOffsetDecReal = roomsPagerReal.addReal('offsetDec');
            let roomsPagerOffsetIncReal = roomsPagerReal.addReal('offsetInc');
            
            let makeReal = lobbyReal.addReal('make', [
              { form: 'Text', text: 'Create New Room' },
              { form: 'Press', pressFn: () => modeChooser.choose('make') }
            ]);
            
          });
          dep.scp(modeChooser.src('make'), (make, dep) => {
            
            let makeReal = dep(mainReal.addReal('makeRoom'));
            let fields = makeRoomFields.map(({ name: prompt, type, def }) => {
              if (def) prompt = `(${def}) ${prompt}`;
              return dep(makeReal.addReal('field', { text: '' }, [{ form: 'TextInput', prompt }]));
            });
            
            makeReal.addReal('submit', [
              { form: 'Text', text: 'Create Room!' },
              { form: 'Press', pressFn: () => makeRoomAct.act(makeRoomFields.map(({ type, def }, term) => {
                
                let value = fields[term].params.textInputSrc.val || def;
                if (type === 'int') {
                  value = value === '\u221e' ? Infinity : parseInt(value, 10);
                  if (!isForm(value, Number)) throw Error(`Non-int ("${value}") provided for ${term}`);
                }
                return value;
                
              }))}
            ]);
            makeReal.addReal('cancel', [
              { form: 'Text', text: 'Cancel' },
              { form: 'Press', pressFn: () => modeChooser.choose('lobby') }
            ]);
            
          });
          
        });
        dep.scp(roomPersonaChooser.srcs.onn, (roomPersona, dep) => {
          
          // View the story entries and either wait for the story to
          // become active, submit a story entry, or vote on entries
          
          let leaveRoomAct = dep(hut.enableAction('leaveRoom', () => roomPersona.end()));
          
          let roomAccount = roomPersona.m('roomAccount');
          let room = roomAccount.m('room');
          
          let roomReal = dep(mainReal.addReal('room'));
          roomReal.addReal('leaveRoom', [
            { form: 'Text', text: `Leave Room (${room.getValue('name')})` },
            { form: 'Press', pressFn: () => leaveRoomAct.act() }
          ]);
          
          let storyReal = roomReal.addReal('story');
          dep.scp(room, 'entry', (entry, dep) => {
            
            let entryReal = dep(storyReal.addReal('entry', { text: '\u2026' }, [{ form: 'Text' }]));
            dep(entry.valueSrc.route(text => entryReal.mod({ text })));
            
          });
          
          let statusReal = roomReal.addReal('status');
          
          let controlsReal = roomReal.addReal('controls');
          
          let setupCanSubmit = dep => {
            
            let ideaRh = dep(roomAccount.rh('idea'));
            let ideaChooser = dep(Chooser.noneOrSome(ideaRh));
            dep.scp(ideaChooser.srcs.off, (noIdea, dep) => {
              
              let submitAction = dep(hut.enableAction(`submit`, ({ text }) => {
                hut.addRecord('idea', [ room, roomAccount ], text);
              }));
              
              let ideaReal = dep(controlsReal.addReal('idea'));
              let fieldReal = ideaReal.addReal('field', [
                { form: 'TextInput', prompt: 'Next line of the story...', multiline: true }
              ]);
              ideaReal.addReal('submit', [
                { form: 'Text', text: 'Submit' },
                { form: 'Press', pressFn: () => {
                  let inputSrc = fieldReal.params.textInputSrc;
                  submitAction.act({ text: inputSrc.val });
                  inputSrc.mod(''); // Reset field
                }}
              ]);
              
            });
            dep.scp(ideaChooser.srcs.onn, (noIdea, dep) => {
              
              let submittedReal = dep(controlsReal.addReal('submitted', { text: 'Submitted!' }, [
                { form: 'Text' }
              ]));
              let numAuthorsSrc = dep(room.getValuePropSrc('numAuthors'));
              let numIdeasSrc = dep(room.getValuePropSrc('numIdeas'));
              dep(BatchSrc([ numAuthorsSrc, numIdeasSrc ])).route(([ numAuthors, numIdeas ]) => {
                submittedReal.mod({ text: `You submitted! Got ${numIdeas} / ${numAuthors} submissions...` });
              });
              
            });
            
          };
          
          let stateChooser = dep(Chooser());
          let roomStateSrc = dep(room.getValuePropSrc('state'));
          
          dep(roomStateSrc.route(state => stateChooser.choose(state)));
          dep.scp(stateChooser.src('wait'), (wait, dep) => {
            
            let waitReal = dep(statusReal.addReal('wait', { text: '...' }, [{ form: 'Text' }]));
            dep(room.valueSrc.route(() => {
              let { numAuthors, minAuthors } = room.getValue();
              waitReal.mod({ text: `Got ${numAuthors} / ${minAuthors} authors...` });
            }));
            
          });
          dep.scp(stateChooser.src('ready'), (ready, dep) => {
            
            setupCanSubmit(dep);
            
            let readyReal = dep(statusReal.addReal('ready', [{ form: 'Text', text: 'Waiting for submission...' }]));
            
          });
          dep.scp(stateChooser.src('submit'), (submit, dep) => {
            
            setupCanSubmit(dep);
            
            let submitReal = dep(statusReal.addReal('submit'));
            
            dep(Clock({
              endMs: room.getValue('submitTs') + room.getValue('submitSecs') * 1000,
              real: submitReal.addReal('clock')
            }));
            
          });
          dep.scp(stateChooser.src('vote'), (vote, dep) => {
            
            let voteRh = dep(roomAccount.rh('vote'));
            let voteChooser = dep(Chooser.noneOrSome(voteRh));
            
            let voteReal = dep(statusReal.addReal('vote'));
            
            dep(Clock({
              endMs: room.getValue('voteTs') + room.getValue('voteSecs') * 1000,
              real: voteReal.addReal('clock')
            }));
            
            let ideasReal = dep(controlsReal.addReal('ideas'));
            dep.scp(room, 'idea', (idea, dep) => {
              
              let votable = canVoteOwn || idea.m('roomAccount') !== roomAccount;
              
              let ideaReal = dep(ideasReal.addReal('idea'));
              
              let textReal = ideaReal.addReal('text', { text: '\u2026' }, [{ form: 'Text' }]);
              dep(idea.valueSrc.route(() => textReal.mod({ text: idea.getValue() })));
              
              dep.scp(voteChooser.srcs.off, (noVote, dep) => {
                
                if (votable) {
                  
                  let voteAct = dep(hut.enableAction(`vote/${idea.uid}`, () => {
                    hut.addRecord('vote', [ room, roomAccount, idea ]);
                  }));
                  dep(ideaReal.addReal('vote', [
                    { form: 'Text', text: 'Vote!' },
                    { form: 'Press', pressFn: () => voteAct.act() }
                  ]));
                  
                } else {
                  
                  dep(ideaReal.addReal('vote', [
                    { form: 'Text', text: `Can't vote for yourself!` }
                  ]));
                  
                }
                
              });
              dep.scp(voteChooser.srcs.onn, (vote, dep) => {
                
                dep(ideaReal.addReal('feedback', [
                  { form: 'Text', text: (vote.m('idea') === idea) ? '\u2705' : '\u274e' }
                ]));
                
              });
              
            });
            
          });
          
        });
        
      });
      
    }
  });
  
};
