global.rooms['fly'] = async foundation => {
  
  // TODO: Figure out why refreshing in the middle of a level fails to
  // load back in properly
  
  // REAL+LAYOUT:
  // -- Layout is PRM! So no such thing as `someLayout.endWith`
  //    -- This allows some Layouts to subclass Src (useful for
  //       interactive Layouts)
  //    -- Real.prototype.addLayout returns a Tmp with a "layout"
  //       property. This separate Tmp is necessary as the Layout isn't
  //       Endable!
  // -- Real names may have a maximum of one ".", used to delimit the
  //    namespace
  // -- Real.prototype.addReal accepts:
  //    -- A Real instance (simplest case; adds it as a child)
  //    -- A string naming a Real
  //       -- The namespace component of this string is optional
  //       -- The name may relate to some RealTree definition
  //       -- The name may be accompanied by an Object representing Real
  //          params
  //       -- The name may be accompanied by an Array containing a mix
  //          Layout instances and Promises resolving to Layouts
  //          -- In the case of Promises, the Real always resolves
  //             immediately and a best-effort is made to attach the
  //             non-immediately available Layouts as soon as possible
  
  let rooms = await foundation.getRooms([
    
    /// {ABOVE=
    'TermBank',
    'random',
    'fly.levels',
    /// =ABOVE}
    
    'Hinterland',
    'habitat.HtmlBrowserHabitat',
    'internal.real.RealTree',
    'fly.models',
    'logic',
    'logic.TimerSrc'
    
  ]);
  
  let { Hinterland, HtmlBrowserHabitat, RealTree, models, TimerSrc, logic: { Chooser, MemSrc, SetSrc, Src } } = rooms;
  
  /// {ABOVE=
  let { TermBank, random, levels } = rooms;
  let termBank = TermBank();
  let rand = random.FastRandom('fly'.encodeInt());
  
  let getLevelMetadata = name => ({
    name, ...levels[name].slice([ 'num', 'password' ]),
    dispName: levels[name].name, dispDesc: levels[name].desc, dispWin: levels[name].winText
  });
  /// =ABOVE}
  
  let staticKeep = foundation.seek('keep', 'static');
  let fps = 60;           // Server-side ticks per second
  let spf = 1 / fps;      // Seconds per server-side tick
  let mspf = 1000 / fps;  // Millis per server-side tick
  let levelStartingDelay = 5000; // Give players this long to unready
  let testAceTerms = [ 'joust', 'gun', 'slam', 'salvo' ];
  
  let testing = foundation.conf('fly.testing');
  if (testing) {
    
    // TODO: This sanitization should happen by defining a Conf+schema
    if (isForm(testing, String)) {
      let [ level, moment ] = testing.split('.');
      testing = { level, moment };
    }
    testing = {
      level: 'rustlingMeadow',
      moment: 'practice1',
      lives: 100,
      aceTerm: testAceTerms[Math.floor(Math.random() * testAceTerms.length)],
      levelStartingDelay: 2000,
      ...testing
    };
    levelStartingDelay = testing.levelStartingDelay;
    
  }
  
  let lobbyModelOptions = {
    joust:  { name: 'Joust Man',  size: [ 16, 16 ], Form: models.JoustMan },
    gun:    { name: 'Gun Girl',   size: [ 16, 16 ], Form: models.GunGirl },
    slam:   { name: 'Slam Kid',   size: [ 16, 16 ], Form: models.SlamKid },
    salvo:  { name: 'Salvo Lad',  size: [ 16, 16 ], Form: models.SalvoLad }
  };
  
  let realTree = RealTree('fly', (lay, define, insert) => {
    
    let { Axis1d, Scroll, Decal, Geom, Press, Text, TextInput } = lay;
    
    define('root', Geom({ w: '100vmin', h: '100vmin', anchor: 'cen' }));
    
    define('content1', Text({ textSize: '200%' }));
    define('content2', Text({ textSize: '150%' }));
    define('content3', Text({ textSize: '100%' }));
    define('paragraph', Text({ textSize: '90%', multiline: true }));
    
    define('lobbyChooser',
      Geom({ w: '100%', h: '100%' }),
      Axis1d({ axis: 'y', dir: '+', mode: 'compactCenter' }),
      Decal({ colour: 'rgba(0, 0, 0, 0.1)' })
    );
    define('lobbyChooserTitle',
      Geom({ w: '80%' }),
      Text({ textSize: '6vmin', text: 'IT IS HAPPENING AGAIN' }),
      Decal({ colour: 'rgba(230, 80, 0, 0.8)', text: { colour: '#fff' } })
    );
    define('lobbyChooserCodeField',
      Geom({ w: '80%' }),
      TextInput({ textSize: '4.5vmin', prompt: 'Enter lobby code' }),
      Decal({ colour: 'rgba(0, 0, 0, 0.05)' })
    );
    define('lobbyChooserSubmitField',
      Geom({ w: '80%' }),
      Text({ textSize: '4.5vmin' }),
      Decal({ colour: 'rgba(0, 0, 0, 0.1)' })
    );
    
  });
  
  // Note commercial airliners fly at ~500 miles/hr (~223 meters/sec)
  let util = {
    fadeAmt: (v1, v2, amt) => v1 * (1 - amt) + v2 * amt,
    fadeVal: (init, amt=0.5) => {
      let fv = {
        val: init,
        to: trg => fv.val = util.fadeAmt(fv.val, trg, amt)
      };
      return fv;
    },
    incCen: function*(n, stepAmt) {
      let start = -0.5 * stepAmt * (n - 1);
      for (let i = 0; i < n; i++) yield start + i * stepAmt;
    }
  };
  
  return Hinterland('fly', 'fly', {
    habitats: [ HtmlBrowserHabitat() ],
    recordForms: {
      'fly.level': models.Level,
      'fly.entity': args => {
        
        let { value: { type: typeName=null } } = args;
        if (!typeName) throw Error(`Couldn't figure out model type name`).mod({ args });
        if (!models.has(typeName)) throw Error(`Invalid model name: "${typeName}"`).mod({ args });
        
        return models[typeName];
        
      }
    },
    nature: async (hut, flyRec, real, dep) => {
      
      /// {ABOVE=
      
      hut.addKnownRoomDependencies([
        'fly.models', 'internal.real.RealTree', 'logic.TimerSrc',
      ]);
      hut.addKnownRealDependencies([
        'Art', 'Axis1d', 'Decal', 'Geom', 'Press', 'Real', 'Scroll', 'Size', 'Text', 'TextInput', 'Image'
      ]);
      
      dep.scp(hut, 'hut.owned/par', (owned, dep) => {
        
        // Attach a "fly.player" Rec to every Hut
        let kidHut = owned.m('kid');
        let termTmp = termBank.hold();
        let player = kidHut.addRecord('fly.player', [], { term: termTmp.term, name: null, score: 0, deaths: 0 });
        let hutPlayer = kidHut.addRecord('fly.hutPlayer', [ kidHut, player ]);
        player.endWith(termTmp);
        
        if (testing) {
          
          let levelMetadata = getLevelMetadata(testing.level);
          let levelMomentsDef = levels[testing.level].moments;
          if (testing.moment) {
            
            // Find the desired testing Moment
            let { found, ind } = levelMomentsDef.find(moment => moment.name === testing.moment);
            if (!found) throw Error(`Invalid moment name: "${testing.moment}"`);
            
            // Combine skipped Moment props; priority for later Moments
            let aggProps = {}.gain(...levelMomentsDef.slice(0, ind));
            levelMomentsDef = [
              
              // Initial Moment is a "buffer" to ease into testing
              { ...aggProps, name: 'buffer', type: 'MomentAhead', dist: 1000, aheadSpd: 500, models: [] },
              
              // Then include all non-skipped Moments
              ...levelMomentsDef.slice(ind)
              
            ];
            
          }
          
          let lobby = kidHut.addRecord('fly.lobby', [ flyRec ], {
            // Code used to enter lobby
            code: 'test',
            
            // Metadata to display level information
            levelMetadata,
            levelMomentsDef,
            
            // Timestamp at which all players readied up
            allReadyMark: null
          });
          
          let lobbyPlayer = kidHut.addRecord('fly.lobbyPlayer', [ lobby, player ], { modelTerm: testing.aceTerm });
          
        }
        
      });
      dep.scp(flyRec, 'fly.lobby', (lobby, dep) => {
        
        let readinessSrc = dep(MemSrc.Prm1({}));
        dep.scp(lobby, 'fly.lobbyPlayer', (lobbyPlayer, dep) => {
          
          let term = lobbyPlayer.getValue('term');
          
          readinessSrc.mod(r => r.gain({ [term]: false }));
          dep(() => readinessSrc.mod(r => r.gain({ [term]: C.skip })));
          
          dep(lobbyPlayer.valueSrc.route(() => {
            let modelTerm = lobbyPlayer.getValue('modelTerm');
            readinessSrc.mod(r => (r[term] = modelTerm !== null, r));
          }));
          
        });
        
        /* THEORETICALLY:
        SetSrc(lobbyPlayer)
          .map(lp => lp.valueSrc)
          .map(lpVal => lpVal.ready)
          .choose([ 'waiting', 'ready' ], vals => vals.all() ? 'waiting' : 'ready');
        */
        
        let readyChooser = dep(Chooser([ 'waiting', 'ready' ]));
        readinessSrc.route(r => readyChooser.choose(r.all() ? 'ready' : 'waiting'));
        
        dep.scp(readyChooser.srcs.ready, (ready, dep) => {
          
          lobby.setValue({ allReadyMark: foundation.getMs() });
          dep(() => lobby.setValue({ allReadyMark: null }));
          
          dep(TimerSrc({ foundation, ms: levelStartingDelay, num: 1 })).route(async () => {
            
            let levelMomentsDef = null
              || lobby.getValue('levelMomentsDef')
              || levels[lobby.getValue('levelMetadata').name].moments;
            
            let level = hut.addRecord('fly.level', [ flyRec, lobby ], {
              ud: { ms: 0 }, ms: 0, moments: levelMomentsDef, flyHut: hut,
              globalMsOffset: foundation.getMs()
            });
            
            let lobbyPlayers = await lobby.rh('fly.lobbyPlayer').getRecs();
            for (let lobbyPlayer of lobbyPlayers) {
              
              let player = lobbyPlayer.m('fly.player');
              let levelPlayer = hut.addRecord('fly.levelPlayer', [ level, player ], { deaths: 0, damage: 0 });
              
              let modelTerm = lobbyPlayer.getValue('modelTerm');
              
              let { x: ax, y: ay } = level.getAceSpawnLoc({ ms: 0, random: rand });
              let aceEntity = hut.addRecord('fly.entity', [ level ], {
                ud: { ms: 0 }, ms: 0, type: lobbyModelOptions[modelTerm].Form.name, name: player.getValue('term'), ax, ay
              });
              
              hut.addRecord('fly.levelPlayerEntity', [ levelPlayer, aceEntity ]);
              
              lobbyPlayer.setValue({ modelTerm: null });
              
            }
            
            // Set an even more accurate global time offset
            level.setValue({ globalMsOffset: foundation.getMs() });
            
          });
          
        });
        
        dep.scp(lobby, 'fly.level', (level, dep) => {
          
          let timerSrc = dep(TimerSrc({ foundation, num: Infinity, ms: mspf }));
          timerSrc.route(({ n }) => level.doStep({ ms: mspf * n, mspf, spf, random: rand }));
          
        });
        
      });
      
      /// =ABOVE}
      
    },
    psyche: async (hut, flyRec, real, dep) => {
      
      let lay = await real.tech.getLayoutForms(
        'Art,Axis1d,Decal,Geom,Press,Scroll,Size,Text,TextInput,Image'.split(',')
      );
      
      let rootReal = realTree.addReal(real, 'root');
      real.addLayout(lay.Decal({ colour: '#000' }));
      rootReal.addLayout(lay.Decal({ colour: '#fff' }));
      
      let myHutPlayerChooser = dep(Chooser(hut.rh('fly.hutPlayer')));
      dep.scp(myHutPlayerChooser.srcs.onn, myHutPlayer => {
        
        let myPlayer = myHutPlayer.m('fly.player');
        let myLobbyPlayerChooser = dep(Chooser(myPlayer.rh('fly.lobbyPlayer')));
        
        dep.scp(myLobbyPlayerChooser.srcs.off, (noLobbyPlayer, dep) => {
          
          let lobbyChooserReal = dep(rootReal.addReal('lobbyChooser'));
          let titleReal = lobbyChooserReal.addReal('lobbyChooserTitle');
          let codeFieldReal = lobbyChooserReal.addReal('lobbyChooserCodeField');
          let submitFieldReal = lobbyChooserReal.addReal('lobbyChooserSubmitField');
          
          // Change the text of the submit field depending on if there's
          // anything written in the code field
          
          dep(codeFieldReal.params.textInputSrc
            .route( code => submitFieldReal.mod({ text: code.length ? 'Join lobby' : 'Create lobby' }) )
          );
          
          // Players not in lobbies are able to join a lobby
          let joinLobbyAct = dep(hut.enableAction('fly.joinLobby', async ({ code }) => {
            
            /// {ABOVE=
            if (code) {
              
              // Find lobby; ensure no more than 4 players per lobby
              
              let lobby = await flyRec.rh('fly.lobby').findRec(rec => rec.getValue('code') === code);
              if (!lobby) throw Error(`Invalid code`);
              
              let lobbyPlayers = await lobby.rh('fly.lobbyPlayer').getRecs();
              if (lobbyPlayers.count() >= 4) throw Error(`Lobby full`);
              
              hut.addRecord('fly.lobbyPlayer', [ lobby, myPlayer ], { modelTerm: null });
              
            } else {
              
              let lobby = hut.addRecord('fly.lobby', [ flyRec ], {
                
                // Code used to enter lobby
                code: rand.genInteger(0, Math.pow(62, 4)).encodeStr(String.base62, 4),
                
                // Metadata to display level information
                levelMetadata: getLevelMetadata('rustlingMeadow'),
                
                // Timestamp at which all players readied up
                allReadyMark: null
                
              });
              
              hut.addRecord('fly.lobbyPlayer', [ lobby, myPlayer ], { modelTerm: null });
              
              // Track the number of players in the lobby
              let lobbyPlayersSrc = SetSrc(lobby.rh('fly.lobbyPlayer'));
              lobby.endWith(lobbyPlayersSrc);
              
              // End the lobby when no players remain
              lobbyPlayersSrc.route(lobbyPlayers => lobbyPlayers.count() || lobby.end());
              
              console.log(`++Lobby @ ${lobby.getValue('code')}`);
              lobby.endWith(() => console.log(`--Lobby @ ${lobby.getValue('code')}`));
              
            }
            /// =ABOVE}
          }));
          
          let pressFn = () => joinLobbyAct.act({ code: codeFieldReal.params.textInputSrc.val });
          
          // Hit enter or click submit to join lobby
          codeFieldReal.addLayout({ form: 'Press', modes: [ 'discrete' ], pressFn });
          submitFieldReal.addLayout({ form: 'Press', pressFn });
          
        });
        dep.scp(myLobbyPlayerChooser.srcs.onn, (myLobbyPlayer, dep) => {
          
          let myPlayer = myLobbyPlayer.m('fly.player');
          let myLobby = myLobbyPlayer.m('fly.lobby');
          
          let inLevelChooser = Chooser(myLobby.rh('fly.level'));
          dep.scp(inLevelChooser.srcs.off, (notInLevel, dep) => {
            
            let lobbyReal = dep(rootReal.addReal('lobby', [
              lay.Geom({ w: '100%', h: '100%' }),
              lay.Axis1d({ axis: 'y', dir: '+', mode: 'compactCenter' })
            ]));
            let headerReal = lobbyReal.addReal('lobbyHeader', [
              lay.Geom({ w: '100%', h: '3em' }),
              lay.Axis1d({ axis: 'x', dir: '+', mode: 'disperseFully' }),
              lay.Decal({ colour: 'rgba(255, 120, 0, 0.4)' })
            ]);
            let titleReal = headerReal.addReal('lobbyTitle', [
              lay.Text({ textSize: '200%', text: `Lobby @ ${myLobby.getValue('code')}` })
            ]);
            let returnReal = headerReal.addReal('lobbyReturn', [
              lay.Geom({ h: '100%' }),
              lay.Text({ textSize: '200%', text: 'Leave lobby' }),
              lay.Decal({ colour: 'rgba(0, 0, 0, 0.05)' }),
              lay.Press({})
            ]);
            
            lobbyReal.addReal('gap', [ { form: 'Geom', h: '1vmin' } ]);
            
            // Players in lobbies are able to leave their lobby
            let exitLobbyAct = dep(hut.enableAction('fly.exitLobby', () => void myLobbyPlayer.end() ));
            returnReal.getLayout(lay.Press).route(() => exitLobbyAct.act());
            
            let levelReal = lobbyReal.addReal('lobbyLevel', [
              lay.Axis1d({ axis: 'x', dir: '+', mode: 'dispersePadFull' })
            ]);
            
            let levelOverviewReal = levelReal.addReal('lobbyLevelOverview', [
              lay.Geom({ w: '55%' }),
              lay.Axis1d({ axis: 'y', dir: '+', mode: 'compactCenter' }),
              lay.Decal({ colour: 'rgba(0, 0, 0, 0.05)' })
            ]);
            let levelOverviewTitleReal = levelOverviewReal.addReal('lobbyLevelOverviewTitle', [
              lay.Text({ textSize: '150%' })
            ]);
            let levelOverviewScrollReal = levelOverviewReal.addReal('lobbyLevelOverviewScroll', [
              lay.Geom({ h: '20vmin' }),
              lay.Scroll({ y: 'show' })
            ]);
            let levelOverviewDescReal = levelOverviewScrollReal.addReal('lobbyLevelOverviewDesc', [
              lay.Text({ textSize: 'calc(8px + 0.9vmin)', align: 'fwd' })
            ]);
            
            dep(myLobby.valueSrc.route(({ levelMetadata=null }) => {
              if (!levelMetadata) return;
              levelOverviewTitleReal.mod({ text: levelMetadata.dispName });
              levelOverviewDescReal.mod({ text: levelMetadata.dispDesc });
            }));
            
            let levelPasswordReal = levelReal.addReal('lobbyLevelPassword', [
              lay.Geom({ w: '35%' }),
              lay.Axis1d({ axis: 'y', dir: '+', mode: 'compactCenter' })
            ]);
            let levelPasswordInputFieldReal = levelPasswordReal.addReal('lobbyLevelPasswordInputField', [
              lay.Geom({ w: '100%', h: '2em' }),
              lay.TextInput({ textSize: 'calc(10px + 1.2vmin)', prompt: 'Level password' }),
              lay.Decal({ colour: 'rgba(0, 0, 0, 0.05)' }),
              lay.Press({ modes: [ 'discrete' ] })
            ]);
            let levelPasswordSubmitFieldReal = levelPasswordReal.addReal('lobbyLevelPasswordSubmitField', [
              lay.Geom({ w: '100%', h: '2em' }),
              lay.Text({ textSize: 'calc(9px + 1vmin)', text: 'Submit' }),
              lay.Decal({ colour: 'rgba(0, 0, 0, 0.1)' }),
              lay.Press({})
            ]);
            
            let submitLevelPasswordAct = dep(hut.enableAction('fly.submitLevelPassword', ({ password }) => {
              
              /// {ABOVE=
              let levelName = levels.find(v => v.password === password).key;
              if (!levelName) throw Error(`Invalid password`);
              console.log(`Lobby ${myLobby.desc()} set to ${levelName}`);
              myLobby.setValue({ levelMetadata: getLevelMetadata(levelName) });
              /// =ABOVE}
              
            }));
            
            let submitLevelPasswordSrc = Src();
            levelPasswordInputFieldReal.getLayout(lay.Press).route(() => submitLevelPasswordSrc.send());
            levelPasswordSubmitFieldReal.getLayout(lay.Press).route(() => submitLevelPasswordSrc.send());
            
            submitLevelPasswordSrc.route(() => {
              submitLevelPasswordAct.act({ password: levelPasswordInputFieldReal.params.textInputSrc.val })
              levelPasswordInputFieldReal.params.textInputSrc.mod('');
            });
            
            lobbyReal.addReal('gap', [ lay.Geom({ h: '1vmin' }) ]);
            
            // Players in levels are able to pick their model
            let chooseModelAct = dep(hut.enableAction('fly.chooseModel', ({ modelTerm }) => {
              /// {ABOVE=
              myLobbyPlayer.setValue({ modelTerm: modelTerm === myLobbyPlayer.getValue('modelTerm') ? null : modelTerm });
              /// =ABOVE}
            }));
            let teamReal = lobbyReal.addReal('lobbyTeam');
            
            dep.scp(myLobby, 'fly.lobbyPlayer', (teamLobbyPlayer, dep) => {
              
              let teamPlayer = teamLobbyPlayer.m('fly.player');
              let teamPlayerReal = dep(teamReal.addReal('lobbyTeamPlayer', [
                lay.Axis1d({ axis: 'x', dir: '+', mode: 'compactCenter' })
              ]));
              
              // Display player name
              let teamPlayerNameReal = teamPlayerReal.addReal('lobbyTeamPlayerName', [
                lay.Geom({ w: '24vmin', h: '13vmin' }),
                lay.Text({ textSize: 'calc(10px + 1.3vmin)', style: [ 'bold' ] }),
                lay.Decal({ colour: (teamLobbyPlayer !== myLobbyPlayer) ? 'rgba(0, 0, 0, 0.1)' : 'rgba(230, 130, 100, 0.4)' })
              ]);
              dep(teamPlayer.valueSrc.route(({ term }) => teamPlayerNameReal.mod({ text: term })));
              
              // Display player's damage and deaths
              let teamPlayerStatsReal = teamPlayerReal.addReal('lobbyTeamPlayerStats', [
                lay.Geom({ w: '24vmin', h: '13vmin' }),
                lay.Axis1d({ axis: 'y', dir: '+', mode: 'compactCenter' }),
                lay.Decal({ colour: 'rgba(0, 0, 0, 0.1)' })
              ]);
              let statTextLayout = lay.Text({ textSize: 'calc(8px + 1vmin)' });
              let teamPlayerStatsDamageReal = teamPlayerStatsReal.addReal('lobbyTeamPlayerStatsDamage', [ statTextLayout ]);
              let teamPlayerStatsDeathsReal = teamPlayerStatsReal.addReal('lobbyTeamPlayerStatsDeaths', [ statTextLayout ]);
              dep(teamPlayer.valueSrc.route(({ score: damage, deaths }) => {
                teamPlayerStatsDamageReal.mod({ text: `damage: ${Math.round(damage)}` });
                teamPlayerStatsDeathsReal.mod({ text: `deaths: ${Math.round(deaths)}` });
              }));
              
              // Allow the player to choose their model from a list
              let teamPlayerModelSetReal = teamPlayerReal.addReal('lobbyTeamPlayerModelSet', [
                lay.Axis1d({ axis: 'x', dir: '+', mode: 'compactCenter' })
              ]);
              for (let [ modelTerm, { name, size, Form } ] of lobbyModelOptions) {
                
                // Show an image of the model with the model name
                let modelReal = teamPlayerModelSetReal.addReal('lobbyTeamPlayerModelSetItem', [
                  lay.Size({ ratio: 1, w: '13vmin' }),
                  lay.Image({ imgKeep: Form.imageKeep, smoothing: false, scale: 0.6 }),
                  lay.Press({})
                ]);
                let modelRealName = modelReal.addReal('lobbyTeamPlayerModelSetItemName', [
                  lay.Geom({ w: '100%', anchor: 'b' }),
                  lay.Text({ textSize: 'calc(5px + 1vmin)', text: name })
                ]);
                
                // Indicate the player's selected option
                let selectedChooser = dep(Chooser([ 'inactive', 'active' ]));
                dep(teamLobbyPlayer.valueSrc.route(val => {
                  selectedChooser.choose(val.modelTerm === modelTerm ? 'active' : 'inactive');
                }));
                dep.scp(selectedChooser.srcs.active, (active, dep) => {
                  let decal = lay.Decal({ border: { ext: '6px', colour: 'rgba(255, 120, 0, 0.4)' } });
                  dep(modelReal.addLayout(decal));
                });
                dep.scp(selectedChooser.srcs.inactive, (active, dep) => {
                  let decal = lay.Decal({ border: null });
                  dep(modelReal.addLayout(decal));
                });
                
                // Allow players to choose their corresponding options
                if (teamPlayer === myPlayer) {
                  modelReal.getLayout(lay.Press).route(() => chooseModelAct.act({ modelTerm }));
                }
                
              }
              
            });
            
            lobbyReal.addReal('gap', [ lay.Geom({ h: '1vmin' }) ]);
            
            let statusReal = lobbyReal.addReal('lobbyStatus', [
              lay.Geom({ w: '100%', h: '5vmin' }),
              lay.Text({})
            ]);
            let statusChooser = Chooser([ 'waiting', 'starting' ]);
            dep(myLobby.valueSrc.route(() => statusChooser.choose(myLobby.getValue('allReadyMark') ? 'starting' : 'waiting')));
            
            dep.scp(statusChooser.srcs.waiting, (waiting, dep) => {
              statusReal.mod({ text: 'Waiting for players to ready...' });
              dep(statusReal.addLayout(lay.Decal({ colour: 'rgba(0, 0, 0, 0.1)' })));
            });
            dep.scp(statusChooser.srcs.starting, (waiting, dep) => {
              
              dep(TimerSrc({ foundation, ms: 500, num: Infinity })).route(() => {
                let ms = levelStartingDelay - (foundation.getMs() - myLobby.getValue('allReadyMark'));
                statusReal.mod({ text: `Starting in ${Math.ceil(ms / 1000)}s...` });
              });
              dep(statusReal.addLayout(lay.Decal({ colour: 'rgba(255, 80, 0, 0.75)', text: { colour: '#fff' } })));
              
            });
            
          });
          dep.scp(inLevelChooser.srcs.onn, (level, dep) => {
            
            let withLevelPlayerEntity = (levelPlayerEntity, dep) => {
              
              // levelPlayerEntity := (level+player)+entity
              let myEntity = levelPlayerEntity.m('fly.entity');
              let level = levelPlayerEntity.m('fly.levelPlayer').m('fly.level');
              
              let levelReal = dep(rootReal.addReal('level', [
                lay.Axis1d({ axis: 'x', dir: '+' }),
                lay.Geom({ w: '100%', h: '100%' })
              ]));
              let levelInfoLReal = levelReal.addReal('levelInfo', [
                lay.Geom({ w: '10%', h: '100%' }),
                lay.Axis1d({ axis: 'y', dir: '+', mode: 'compactCenter' }),
                lay.Decal({ colour: 'rgba(0, 0, 0, 0.8)' }),
              ], { order: 0 });
              let levelInfoRReal = levelReal.addReal('levelInfo', [
                lay.Geom({ w: '10%', h: '100%' }),
                lay.Axis1d({ axis: 'y', dir: '+', mode: 'compactCenter' }),
                lay.Decal({ colour: 'rgba(0, 0, 0, 0.8)' })
              ], { order: 2 });
              
              let livesLabelReal = levelInfoLReal.addReal('livesLabel', [
                lay.Text({ text: 'Lives:' }),
                lay.Decal({ text: { colour: '#fff' } })
              ]);
              let livesValueReal = levelInfoLReal.addReal('livesValue', [
                lay.Text({ textSize: '200%' }),
                lay.Decal({ text: { colour: '#fff' } })
              ]);
              dep(level.valueSrc.route(() => {
                livesValueReal.mod({ text: level.getValue('lives').toString() });
              }));
              
              let keySrc = MemSrc.Prm1(Set());
              let gameReal = levelReal.addReal('game', [
                lay.Geom({ w: '80%', h: '100%' }),
                lay.Art({ pixelCount: [ 800, 1000 ], keySrc })
              ]);
              
              let entityRh = level.rh('fly.entity');
              let spriteRh = level.rh('fly.sprite');
              let mySpriteRh = myEntity.rh('fly.sprite');
              
              let initMs = foundation.getMs();
              let gameMs = () => foundation.getMs() - initMs;
              let lastMs = 0;
              
              let pixelDims = { w: 800, h: 1000, hw: 400, hh: 500 };
              let fadeXPanVal = util.fadeVal(0, 0.15);
              let fadeYPanVal = util.fadeVal(0, 0.15);
              gameReal.mod({ animationFn: draw => draw.initFrameCen('rgba(220, 220, 255, 1)', () => {
                
                let ms = gameMs();
                let ud = {
                  ms,
                  mspf: (ms - lastMs),
                  spf: (ms - lastMs) * 0.001,
                  outcome: level.outcome,
                  level,
                  myEntity,
                  entities: entityRh.hrecs.map(hrec => hrec.rec),
                  bounds: null
                };
                ud.bounds = level.getBounds(ud);
                lastMs = ms;
                
                let { total: tb, player: pb } = ud.bounds;
                
                let visiMult = Math.min(tb.w / pixelDims.w, tb.h / pixelDims.h) * level.getValue('visiMult');
                let desiredTrn = { x: 0, y: 0 };
                let scaleAmt = 1 / visiMult;
                
                let mySprite = mySpriteRh.hrecs.toArr(hrec => hrec.rec)[0] || null;
                if (mySprite) {
                  
                  let { x, y } = myEntity.getAbsGeom(ud);
                  
                  // Percentage of horz/vert dist travelled
                  let xAmt = (x - pb.x) / (pb.w * 0.5);
                  let yAmt = (y - pb.y) / (pb.h * 0.5);
                  
                  // With camera at `+maxFocusX` or `-maxFocusX`, any
                  // further right/left and we'll see out-of-game zones
                  let seeDistX = pixelDims.hw * visiMult;
                  let seeDistY = pixelDims.hh * visiMult;
                  let maxFocusX = tb.w * 0.5 - seeDistX;
                  let maxFocusY = tb.h * 0.5 - seeDistY;
                  desiredTrn = { x: maxFocusX * xAmt, y: maxFocusY * yAmt };
                  
                  ud.bounds.visible = {
                    form: 'rect',
                    x: desiredTrn.x, y: desiredTrn.y,
                    w: seeDistX * 2, h: seeDistY * 2,
                    l: desiredTrn.x - seeDistX, r: desiredTrn.x + seeDistX,
                    b: desiredTrn.y - seeDistY, t: desiredTrn.y + seeDistY
                  };
                  
                } else {
                  
                  ud.bounds.visible = ud.bounds.total;
                  
                }
                
                draw.scl(scaleAmt, scaleAmt);
                draw.trn(0, -ud.bounds.total.y);
                draw.trn(-fadeXPanVal.to(desiredTrn.x), -fadeYPanVal.to(desiredTrn.y));
                
                // For all Sprites render the associated Entity
                let renders = spriteRh.hrecs
                  .toArr(spriteHrec => spriteHrec.rec.m('fly.entity'))
                  .sort((a, b) => b.renderPriority(ud) - a.renderPriority(ud))
                  .each(ent => ent.render(ud, draw));
                
                // Draw the viewport(?) and player bounds
                draw.rectCen(tb.x, tb.y, tb.w - 4, tb.h - 4, { strokeStyle: 'rgba( 0, 120, 0, 0.3)', lineWidth: 4 });
                draw.rectCen(pb.x, pb.y, pb.w - 4, pb.h - 4, { strokeStyle: 'rgba(80, 120, 0, 0.3)', lineWidth: 4 });
                
              })});
              
              // A: 65, D: 68, W: 87, S: 83, <: 188, >: 190
              let keyNums = [ 65, 68, 87, 83, 188, 190 ];
              let keyMap = { l: 65, r: 68, u: 87, d: 83, a1: 188, a2: 190 };
              let controlTerms = keyMap.toArr((v, k) => k);
              let keyAct = dep(hut.enableAction('fly.control', ({ keyVal }, { ms }) => {
                
                let keys = keyNums.map((n, i) => (keyVal & (1 << i)) >> i);
                
                for (let [ ind, term ] of controlTerms.entries()) {
                  if (keys[ind] !== myEntity.controls[term][0]) myEntity.controls[term] = [ keys[ind], ms ];
                }
                
              }));
              
              /// {BELOW=
              dep(keySrc.route(keys => {
                
                let keyVal = 0;
                for (let i = 0; i < keyNums.length; i++) keyVal += keys.has(keyNums[i]) ? (1 << i) : 0;
                keyAct.act({ keyVal });
                
              }));
              /// =BELOW}
              
            };
            
            // Ahhhh need to follow these manually :( since the render
            // function looks at an instantaneous snapshot of these sets
            dep.scp(level, 'fly.entity', (entity, dep) => {});
            dep.scp(level, 'fly.sprite', (entity, dep) => {});
            
            // Need to hit the LevelPlayer through the Hut, not the
            // Level, to ensure that Huts only have access to their own
            // LevelPlayers!
            dep.scp(hut, 'fly.hutPlayer', (hutPlayer, dep) => {
              dep.scp(hutPlayer.m('fly.player'), 'fly.levelPlayer', (levelPlayer, dep) => {
                dep.scp(levelPlayer, 'fly.levelPlayerEntity', withLevelPlayerEntity);
              });
            });
            
          });
          
        });
        
      });
      
    }
  });
  
};
