global.rooms['hasten'] = async foundation => {
  
  let rooms = await foundation.getRooms([
    /// {ABOVE=
    'random',
    /// =ABOVE}
    'logic.Chooser',
    'logic.MemSrc',
    'logic.SetSrc',
    'logic.TimerSrc',
    'Hinterland',
    'habitat.HtmlBrowserHabitat',
    'timeStepWorld2',
  ]);
  
  let { Chooser, MemSrc, SetSrc, TimerSrc, Hinterland, HtmlBrowserHabitat, timeStepWorld2: TimeStepWorld } = rooms;
  
  /// {ABOVE=
  let { FastRandom } = rooms.random;
  let random = FastRandom('hasten'.encodeInt());
  /// =ABOVE}
  
  let pi = Math.PI;
  let pi2 = pi * 2;
  let calc = {
    calc: (inp, fn) => fn(inp, calc),
    angleBetweenPoints: (pt1, pt2) => Math.atan2(pt2.x - pt1.x, pt2.y - pt1.y),
    normalizeAngle: (ang) => {
      if (ang >= -pi && ang <= +pi) return ang;
      ang %= pi2;
      if (ang < -pi) ang += pi2;
      if (ang > +pi) ang -= pi2;
      return ang;
    }
  };
  
  let stepFps = 60;
  let confirmTeamWaitMs = 0; // 3000;
  let worldFadeInMs = 0;
  let fullVision = false;
  
  return Hinterland('hst', 'hasten', {
    
    recordForms: {
      'world': () => HstWorld,
      'entity': ({ form }) => hstForms[form]
    },
    habitats: [ HtmlBrowserHabitat() ],
    above: async (hut, rec, real, dep) => {
      
    },
    below: async (hut, rec, real, dep) => {
      
      /// {BELOW=
      
      foundation.getRoom('hasten.gameplay');
      
      /// {DEBUG= // TODO: Nested CompileFeatures not supported yet
      let wait = (ms=100) => Promise(r => setTimeout(r, ms));
      let dbgPrm = wait();
      
      if ([ 'abe', 'bob' ].has(hut.uid)) {
        
        hut.actionCallback = act => {
          
          let run = {
            makeUser: a => a.act(),
            renameUser: a => a.act({ name: `${hut.uid}` }),
            confirmUser: a => a.act(),
            joinTeam: a => (hut.uid === 'abe')
              ? Promise(r => setTimeout(r, 0  )).then(() => a.act({ code: ''     }))
              : Promise(r => setTimeout(r, 300)).then(() => a.act({ code: 'QGcd' })),
            toggleTeamStatus: a => (hut.uid === 'abe')
              ? Promise(r => setTimeout(r, 600)).then(() => a.act())
              : Promise(r => setTimeout(r, 0  )).then(() => a.act()),
            submitTeamMessage: a => a.act({ text: `Hi I'm ${hut.uid} nice to meet` }),
            makeWorld: a => a.act()
          }[act.name.split('.')[1]];
          
          if (run) dbgPrm = dbgPrm.then(wait).then(() => run(act));
          //else     console.log('Ignoring action:', act.name);
          
        };
        
      } else {
        
        hut.actionCallback = act => {
          
          let run = {
            makeUser: a => a.act(),
            renameUser: a => a.act({ name: 'TAS' }),
            confirmUser: a => a.act(),
            joinTeam: a => a.act({ code: '' }),
            toggleTeamStatus: a => a.act(),
            submitTeamMessage: a => a.act({ text: 'TAS BOI' }),
            makeWorld: a => a.act()
          }[act.name.split('.')[1]];
          
          if (run) dbgPrm = dbgPrm.then(wait).then(() => run(act));
          //else     console.log('Ignoring action:', act.name);
          
        };
        
      }
      /// =DEBUG}
      
      /// =BELOW}
      
      let mainReal = dep(real.addReal('hst.main', [
        { form: 'Geom', w: '100%', h: '100%' },
        { form: 'Decal', colour: '#140', transition: { colour: { ms: 1000 } } }
      ]));
      
      let setupReal = dep(mainReal.addReal('setup', [
        { form: 'Geom', w: '100%', h: '100%' },
        { form: 'Decal', opacity: 1, transition: { opacity: { ms: 1000 } } }
      ]));
      
      let userReal = setupReal.addReal('user', [
        { form: 'Geom', anchor: 'tl', w: '20%', h: '94%', x: '3%', y: '3%', z: 1 },
        { form: 'Axis1d', axis: 'y', dir: '+', mode: 'compactCenter'},
        { form: 'Decal', colour: '#666b', border: { ext: '5px', colour: '#666b' } }
      ]);
      let teamReal = setupReal.addReal('team', [
        { form: 'Geom', anchor: 'tl', w: '20%', h: '94%', x: '26%', y: '3%', z: 1 },
        { form: 'Axis1d', axis: 'y', dir: '+', mode: 'compactCenter'},
        { form: 'Decal', colour: '#333b', border: { ext: '5px', colour: '#333b' } }
      ]);
      let deployReal = setupReal.addReal('deploy', [
        { form: 'Geom', anchor: 'tl', w: '20%', h: '94%', x: '49%', y: '3%', z: 1 },
        { form: 'Axis1d', axis: 'y', dir: '+', mode: 'compactCenter'},
        { form: 'Decal', colour: '#000b', border: { ext: '5px', colour: '#000b' } }
      ]);
      
      let userChooser = dep(Chooser.noneOrSome(hut.relSrc('hst.user')));
      dep.scp(userChooser.srcs.off, (noUser, dep) => {
        
        let makeUserAct = dep(hut.enableAction('hst.makeUser', () => {
          let user = hut.addRecord('hst.user', [ hut ], { name: 'Anon', stage: 'user', controls: [] });
          user.controls = Set();
        }));
        
        dep(userReal.addReal('makeUser', [
          { form: 'Geom', w: '100%', h: '50px' },
          { form: 'Text', size: '220%', text: 'Start' },
        ]));
        dep(userReal.addLayout({ form: 'Decal', colour: '#fff8', text: { colour: '#fff' }, border: { ext: '5px', colour: '#fff8' } }));
        dep(userReal.addLayout({ form: 'Press', pressFn: () => makeUserAct.act() }));
        
      });
      dep.scp(userChooser.srcs.onn, (user, dep) => {
        
        let stageChooser = dep(Chooser());
        dep(user.valSrc.route(() => stageChooser.choose(user.getValue('stage')) ));
        
        let userStageChooser = dep(Chooser.noneOrSome(stageChooser.src('user')));
        dep.scp(userStageChooser.src('onn'), (userStage, dep) => {
          
          let renameUser = dep(hut.enableAction('hst.renameUser', ({ name }) => void user.objVal({ name }) ));
          let confirmUser = dep(hut.enableAction('hst.confirmUser', () => void user.objVal({ stage: 'team' }) ));
          
          /// {BELOW=
          let userContent = dep(userReal.addReal('content', [
            { form: 'Geom', w: '100%', h: '100%' },
            { form: 'Axis1d', axis: 'y', dir: '+', mode: 'compactCenter' }
          ]));
          userContent.addReal('title', [
            { form: 'Geom', h: '50px' },
            { form: 'Text', size: '220%', text: 'User' },
            { form: 'Decal', text: { colour: '#fff' } }
          ]);
          userContent.addReal('nameLabel', [
            { form: 'Geom', h: '30px' },
            { form: 'Text', size: '150%', text: 'username:' },
            { form: 'Decal', text: { colour: '#fff' } }
          ]);
          userContent.addReal('nameInput', [
            { form: 'Geom', w: '80%', h: '30px' },
            { form: 'TextInput', text: user.getValue('name'), textInputFn: name => renameUser.act({ name }) },
            { form: 'Decal', colour: '#fff4', text: { colour: '#fff' } }
          ]);
          userContent.addReal('confirm', [
            { form: 'Geom', w: '80%', h: '30px' },
            { form: 'Text', text: 'Confirm' },
            { form: 'Decal', colour: '#fff2', text: { colour: '#fff' } },
            { form: 'Press', pressFn: () => confirmUser.act() }
          ]);
          /// =BELOW}
          
        });
        dep.scp(userStageChooser.src('off'), (noUserStage, dep) => {
          
          dep(userReal.addLayout({ form: 'Decal', opacity: 0.5 }));
          
          dep(userReal.addReal('label', [
            { form: 'Text', size: '220%', text: 'User' },
            { form: 'Decal', text: { colour: '#fff' } }
          ]));
          
          let nameReal = dep(userReal.addReal('name', { text: '??' }, [
            { form: 'Text', size: '150%' },
            { form: 'Decal', text: { colour: '#fff' } }
          ]));
          dep(user.valSrc.route(() => nameReal.mod({ text: user.getValue('name') }) ));
          
        });
        
        let teamStageChooser = dep(Chooser.noneOrSome(stageChooser.srcs.team));
        dep.scp(teamStageChooser.srcs.onn, (teamStage, dep) => {
          
          let userTeamChooser = dep(Chooser.noneOrSome(user.relSrc('hst.userTeam')));
          
          dep.scp(userTeamChooser.srcs.off, (noUserTeam, dep) => {
            
            let joinTeamAct = dep(hut.enableAction('hst.joinTeam', ({ code }) => {
              
              if (!code) {
                
                let team = hut.addRecord('hst.team', [ rec ], {
                  name: 'Team',
                  code: random.genZ(0, Math.pow(62, 4)).encodeStr(String.base62, 4),
                  ms: foundation.getMs(),
                  readyMs: null,
                  settings: {
                    level: 'Freetown',
                    difficulty: 2,
                    seed: random.genZ(0, 1000).toString(10).padHead(4, '0')
                  }
                });
                hut.addRecord('hst.userTeam', [ user, team ], { role: 'captain', status: 'waiting' });
                
                // End team when no more users exist
                let userSetSrc = SetSrc(team.relSrc('hst.userTeam'));
                userSetSrc.route(st => st.count() || team.end());
                
                // Reset users to "waiting" when changes happen
                userSetSrc.route( () => team.relRecs('hst.userTeam').each(ut => ut.objVal({ status: 'waiting' })) );
                
                // Figure out when every user is ready
                let teamReadyChooser = Chooser();
                team.relSrc('hst.userTeam').route(userTeam => userTeam.valSrc.route(() => {
                  let anyUserWaiting = team.relRecs('hst.userTeam').seek(ut => ut.getValue('status') === 'waiting').val;
                  teamReadyChooser.choose(anyUserWaiting ? 'off' : 'onn');
                }));
                
                teamReadyChooser.src('onn').route(teamReady => {
                  
                  team.objVal({ readyMs: foundation.getMs() });
                  teamReady.endWith(() => team.objVal({ readyMs: null }));
                  
                  let timerSrc = TimerSrc({ ms: confirmTeamWaitMs, num: 1 });
                  teamReady.endWith(timerSrc);
                  
                  timerSrc.route(() => {
                    for (let ut of team.relRecs('hst.userTeam')) ut.mems['hst.user'].objVal({ stage: 'deploy' });
                  });
                  
                });
                
              } else {
                
                let team = rec.relRecs('hst.team').seek(team => team.getValue('code') === code).val;
                
                if (!team) return;
                if (team.relRecs('hst.userTeam').count() > 5) return;
                
                hut.addRecord('hst.userTeam', [ user, team ], { role: 'member', status: 'waiting' });
                
              }
              
            }));
            
            let contentReal = dep(teamReal.addReal('team', [
              { form: 'Geom', w: '100%', h: '100%' },
              { form: 'Axis1d', axis: 'y', dir: '+', mode: 'compactCenter' }
            ]));
            contentReal.addReal('title', [
              { form: 'Geom', h: '50px' },
              { form: 'Text', size: '220%', text: 'Team' },
              { form: 'Decal', text: { colour: '#fff' } }
            ]);
            
            let codeSrc = MemSrc('');
            contentReal.addReal('code', [
              { form: 'Geom', w: '80%', h: '30px' },
              { form: 'TextInput', inputPrompt: 'Team code?', textInputSrc: codeSrc },
              { form: 'Decal', colour: '#fff4', text: { colour: '#fff' } }
            ]);
            let joinTeamReal = contentReal.addReal('joinTeam', { text: '' }, [
              { form: 'Geom', w: '80%', h: '30px' },
              { form: 'Text' },
              { form: 'Decal', colour: '#fff2', text: { colour: '#fff' } },
              { form: 'Press', pressFn: () => joinTeamAct.act({ code: codeSrc.val }) }
            ]);
            dep(codeSrc.route(v => joinTeamReal.mod({ text: v.length ? 'Join Team' : 'Create Team' }) ));
            
          });
          dep.scp(userTeamChooser.srcs.onn, (userTeam, dep) => {
            
            let toggleStatusAct = dep(hut.enableAction('hst.toggleTeamStatus', () => {
              
              userTeam.objVal({ status: (userTeam.getValue('status') === 'waiting') ? 'ready' : 'waiting' });
              
            }));
            
            let roleChooser = dep(Chooser());
            dep(userTeam.valSrc.route(() => roleChooser.choose(userTeam.getValue('role')) ));
            
            let team = userTeam.mems['hst.team'];
            
            let contentReal = dep(teamReal.addReal('team', [
              { form: 'Geom', w: '100%', h: '100%' },
              { form: 'Axis1d', axis: 'y', dir: '+', mode: 'compactCenter' }
            ]));
            
            let titleReal = contentReal.addReal('title', [
              { form: 'Geom', w: '100%' },
              { form: 'Axis1d', axis: 'y', dir: '+', mode: 'stackFwd' }
            ]);
            titleReal.addReal('header', [
              { form: 'Text', size: '220%', text: 'Team:' },
              { form: 'Decal', text: { colour: '#fff' } }
            ]);
            dep.scp(roleChooser.src('member'), (memberRole, dep) => {
              let nameReal = dep(titleReal.addReal('name', { text: '??' }, [
                { form: 'Text', size: '220%' },
                { form: 'Decal', text: { colour: '#fff' } }
              ]));
              dep(team.valSrc.route(() => nameReal.mod({ text: team.getValue('name') }) ));
            });
            dep.scp(roleChooser.src('captain'), (captainRole, dep) => {
              
              let renameTeamAct = dep(hut.enableAction('hst.renameTeam', ({ name }) => void team.objVal({ name }) ));
              
              let textInputSrc = MemSrc(team.getValue('name'));
              let nameReal = dep(titleReal.addReal('name', [
                { form: 'Geom', w: '80%', h: '30px' },
                { form: 'TextInput', size: '220%', textInputSrc },
                { form: 'Decal', colour: '#fff4', text: { colour: '#fff' } }
              ]));
              
              /// {BELOW=
              dep(textInputSrc.route(name => renameTeamAct.act({ name }) ));
              dep(team.valSrc.route(() => textInputSrc.mod(team.getValue('name')) ));
              /// =BELOW}
              
            });
            
            contentReal.addReal('code', [
              { form: 'Geom', h: '30px' },
              { form: 'Text', size: '100%', text: `Code: ${team.getValue('code')}` },
              { form: 'Decal', text: { colour: '#fff' } }
            ]);
            contentReal.addReal('gap', [ { form: 'Geom', h: '10px' } ]);
            
            contentReal.addReal('teamTitle', [
              { form: 'Text', size: '150%', text: 'Members' },
              { form: 'Decal', text: { colour: '#fff' } }
            ]);
            let membersReal = contentReal.addReal('members', [
              { form: 'Geom', w: '100%' },
              { form: 'Axis1d', axis: 'y', dir: '+', mode: 'stackFwd' }
            ]);
            dep.scp(team.relSrc('hst.userTeam'), (fellowUserTeam, dep) => {
              
              let user = fellowUserTeam.mems['hst.user'];
              let userReal = dep(membersReal.addReal('user', { opacity: 0.65 }, [
                { form: 'Geom', w: '80%', h: '30px' },
                { form: 'Axis1d', axis: 'x', dir: '+', align: 'compactCenter' },
                { form: 'Decal', text: { colour: '#fff' } }
              ]));
              let nameReal = userReal.addReal('name', { text: '??' }, [
                { form: 'Geom', w: '75%', h: '100%' },
                { form: 'Text', size: '150%', align: 'fwd' }
              ]);
              let statusReal = userReal.addReal('status', [
                { form: 'Geom', w: '25%', h: '100%' },
                { form: 'Decal', colour: '#a00' }
              ]);
              
              if (fellowUserTeam === userTeam) {
                statusReal.addLayout({ form: 'Press', pressFn: () => toggleStatusAct.act() });
                userReal.mod({ opacity: 1 });
              }
              
              dep(user.valSrc.route(() => nameReal.mod({ text: `${user.getValue('name')}` }) ));
              dep(fellowUserTeam.valSrc.route(() => {
                let status = fellowUserTeam.getValue('status');
                userReal.mod({ border: { ext: '2px', colour: status === 'waiting' ? '#fff2' : '#fff4' } });
                statusReal.mod({ colour: status === 'waiting' ? '#a00' : '#0b0' });
              }));
              
            });
            contentReal.addReal('gap', [ { form: 'Geom', h: '10px' } ]);
            
            let readyReal = contentReal.addReal('ready', { text: '' }, [
              { form: 'Text', size: '100%' },
              { form: 'Decal', text: { colour: '#fff' } }
            ]);
            
            let readyChooser = dep(Chooser());
            dep(team.valSrc.route(() => readyChooser.choose(team.getValue('readyMs') ? 'onn' : 'off')));
            dep.scp(readyChooser.src('onn'), (ready, dep) => {
              
              let timerSrc = dep(TimerSrc({ ms: 250, num: Infinity }));
              timerSrc.route(() => {
                let dMs = foundation.getMs() - team.getValue('readyMs');
                readyReal.mod({ text: `Start in ${Math.round((confirmTeamWaitMs - dMs) * 0.001)}s` });
              });
              
            });
            dep.scp(readyChooser.src('off'), (ready, dep) => {
              readyReal.mod({ text: '' });
            });
            
          });
          
        });
        dep.scp(teamStageChooser.srcs.off, (noTeamStage, dep) => dep.scp(user, 'hst.userTeam', (userTeam, dep) => {
          
          let team = userTeam.mems['hst.team'];
          
          dep(teamReal.addLayout({ form: 'Decal', opacity: 0.5 }));
          
          let contentReal = dep(teamReal.addReal('team', [
            { form: 'Geom', w: '100%', h: '100%' },
            { form: 'Axis1d', axis: 'y', dir: '+', mode: 'compactCenter' }
          ]));
          
          contentReal.addReal('name', [
            { form: 'Text', size: '220%', text: team.getValue('name') },
            { form: 'Decal', text: { colour: '#fff' } }
          ]);
          dep.scp(team, 'hst.userTeam', (userTeam, dep) => {
            contentReal.addReal('member', [
              { form: 'Geom', w: '80%' },
              { form: 'Text', align: 'fwd', size: '150%', text: userTeam.getValue('name') },
              { form: 'Decal', text: { colour: '#fff' } }
            ]);
          });
          
        }));
        
        let deployStageChooser = dep(Chooser.noneOrSome(stageChooser.srcs.deploy));
        dep.scp(deployStageChooser.srcs.onn, (deployStage, dep) => dep.scp(user, 'hst.userTeam', (userTeam, dep) => {
          
          let team = userTeam.mems['hst.team'];
          let submitTeamMessageAct = dep(hut.enableAction('hst.submitTeamMessage', ({ text }) => {
            hut.addRecord('hst.teamMessage', [ user, team ], { text });
          }));
          
          let contentReal = dep(deployReal.addReal('content', [
            { form: 'Geom', w: '100%', h: '100%' },
            { form: 'Axis1d', axis: 'y', dir: '+', mode: 'compactCenter' },
          ]));
          contentReal.addReal('title', [
            { form: 'Text', size: '220%', text: 'Deploy' },
            { form: 'Decal', text: { colour: '#fff' } }
          ]);
          contentReal.addReal('gap', [ { form: 'Geom', h: '10px' } ]);
          
          contentReal.addReal('levelLabel', [
            { form: 'Text', size: '120%', text: 'Level:' },
            { form: 'Decal', text { colour: '#fff' } }
          ]);
          let levelValueReal = contentReal.addReal('levelValue', { text: '??' }, [
            { form: 'Text', size: '120%' },
            { form: 'Decal', text: { colour: '#fff' } }
          ]);
          contentReal.addReal('gap', [ { form: 'Geom', h: '10px' } ]);
          
          contentReal.addReal('difficultyLabel', [
            { form: 'Text', size: '120%', text: 'Difficulty:' },
            { form: 'Decal', text: { colour: '#fff' } }
          ]);
          let difficultyValueReal = contentReal.addReal('difficultyValue', { text: '??' }, [
            { form: 'Text', size: '120%' },
            { form: 'Decal', text: { colour: '#fff' } }
          ]);
          contentReal.addReal('gap', [ { form: 'Geom', h: '10px' } ]);
          
          dep(team.valSrc.route(() => {
            
            let { difficulty, level } = team.getValue('settings');
            let difficultyDesc = {
              0: 'Training',
              1: 'Hopeful',
              2: 'Tense',
              3: 'Despairing',
              4: 'Hopeless',
              5: 'Nihilist'
            }[difficulty];
            
            levelValueReal.mod({ text: level });
            difficultyValueReal.mod({ text: difficultyDesc });
            
          }));
          
          let messagingReal = contentReal.addReal('messaging', [
            { form: 'Geom', w: '80%', h: '200px' }
          ]);
          let messagesReal = messagingReal.addReal('messages', [
            { form: 'Geom', anchor: 'tl', x: 0, y: 0, w: '100%', h: '170px' },
            { form: 'Axis1d', axis: 'y', dir: '+', mode: 'stackFwd' },
            { form: 'Decal', colour: '#fff1' }
          ]);
          dep.scp(team, 'hst.teamMessage', (teamMsg, dep) => {
            dep(messagesReal.addReal('message', [
              { form: 'Geom', w: '100%' },
              { form: 'Text', align: 'fwd', text: teamMsg.mems['hst.user'].getValue('name') + ': ' + teamMsg.getValue('text') },
              { form: 'Decal', text: { colour: '#fff' } }
            ]));
          });
          
          let msgSrc = MemSrc('');
          let submitMsgReal = messagingReal.addReal('submit', [
            { form: 'Geom', anchor: 'bl', x: 0, y: 0, w: '100%', h: '30px' },
            { form: 'TextInput', align: 'fwd', inputPrompt: '>', textInputSrc: msgSrc },
            { form: 'Press', modes: [ 'discrete' ], pressFn: () => {
              submitTeamMessageAct.act({ text: msgSrc.val });
              msgSrc.mod('');
            }},
            { form: 'Decal', colour: '#fff2', text: { colour: '#fff' } }
          ]);
          
          let roleChooser = dep(Chooser());
          dep(userTeam.valSrc.route(() => roleChooser.choose(userTeam.getValue('role')) ));
          dep.scp(roleChooser.src('captain'), (captain, dep) => {
            
            let makeWorldAct = dep(hut.enableAction('hst.makeWorld', () => {
              
              let { level, difficulty } = team.getValue('settings');
              let world = hut.parHut.addRecord('hst.world', [ team ], { ms: foundation.getMs(), level, difficulty, ctrlSet: {
                
                moveL: 65, moveR: 68, moveU: 87, moveD: 83,  // ADWS
                turnL: 74, turnR: 76, attack: 32, scope: 67, act: 75,  // JL, Space, C
                
                // Shift: 16 (frickin sticky keys)
                // Ctrl: 17 (ctrl+w closes tab!!)
                // Alt: 18
                
                ui: 16
                
                //, act2: 85, act3: 73, act4: 79, // Shift, UIO
                
              }});
              
              for (let ut of team.relRecs('hst.userTeam')) {
                
                let user = ut.mems['hst.user'];
                let hut = user.mems['lands.hut'];
                
                ut.mems['hst.user'].mod({ stage: 'play' });
                
              }
              
            }));
            
            let gapReal = dep(contentReal.addReal('gap', [ { form: 'Geom', h: '10px' } ]));
            let playReal = dep(contentReal.addReal('play', [
              { form: 'Geom', w: '80%' },
              { form: 'Text', size: '150%', text: 'Play' },
              { form: 'Decal', colour: '#fff4', text: { colour: '#fff' } },
              { form: 'Press', pressFn: () => makeWorldAct.act() }
            ]));
            
          });
          
        }));
        dep.scp(deployStageChooser.srcs.off, (noDeployStage, dep) => {
          dep(deployReal.addLayout({ form: 'Decal', opacity: 0.5 }));
        });
        
        let playStageChooser = dep(Chooser.noneOrSome(stageChooser.srcs.play));
        dep.scp(playStageChooser.srcs.onn, (gameStage, dep) => dep.scp(user, 'hst.userTeam', (userTeam, dep) => {
          
          let team = userTeam.mems['hst.team'];
          
          dep.scp(team, 'hst.world', async (world, dep) => {
            
            dep(mainReal.addLayout({ form: 'Decal', colour: '#000d' }));
            dep(setupReal.addLayout({ form: 'Decal', opacity: 0 }));
            
            let worldReal = dep(mainReal.addReal('hst.world', { opacity: 0, printKeys: 0 }, [
              { form: 'Geom', w: '100vmin', h: '100vmin', shape: 'oval', anchor: 'mid', z: 3 },
              { form: 'Decal', colour: '#000', windowing: true, transition: { opacity: { ms: worldFadeInMs } } },
            ]));
            
            dep(TimerSrc({ ms: 500, num: 1 })).route(() => worldReal.mod({ opacity: 1 }));
            
            foundation.getRoom('hasten.gameplay').then(gameplay => {
              
              let { stepFn, renderFn } = gameplay(hut);
              
              let tsw = dep(TimeStepWorld({
                dep, hut,
                world, real: worldReal,
                artLayoutParams: { pixelDensityMult: 0.35 },
                fps: stepFps, stepFn, renderFn
              }));
              
            });
            
            
          });
          
        }));
        
      });
      
    }
    
  });
  
};
