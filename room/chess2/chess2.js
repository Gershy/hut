global.rooms['chess2'] = async chess2Keep => {
  
  let c2Subcon = subcon('chess2.gameplay', {});
  
  let rooms = await getRooms([
    
    /// {ABOVE=
    'TermBank',
    'random',
    /// =ABOVE}
    
    'logic.TmpAny',
    'logic.Chooser',
    'logic.SetSrc',
    'logic.MemSrc',
    'logic.TimerSrc',
    'habitat.HtmlBrowserHabitat',
    'Hinterland'
    
  ]);
  let { TmpAny, Chooser, SetSrc, MemSrc, TimerSrc, Hinterland, HtmlBrowserHabitat } = rooms;
  
  let isDev = conf('deploy.maturity') === 'dev';
  let pieceStyle = 'classic';
  let layoutStyle = 'classic';
  let moveMs = (isDev ? 12 : 60) * 1000;
  let enterMs = (isDev ? 0.1 : 2) * 1000;
  let matchmakeMs = (isDev ? 1 : 5) * 1000;
  let tsM2 = 'calc(70% + 0.78vmin)';
  let tsM1 = 'calc(75% + 0.82vmin)';
  let ts00 = 'calc(80% + 0.85vmin)';
  let tsP1 = 'calc(90% + 1.00vmin)';
  let lay = {
    text: (text, size=ts00, align='mid') => ({
      Text: { size, align, text, spacing: { h: '1.2vmin', v: '0.75vmin' } }
    }),
    textFwd: (text, size=ts00) => ({ ...lay.text(text, size, 'fwd'), Geom: { w: '100%' } }),
    link: (text, uri, { size=ts00, mode='spawn' }={}) => [
      { form: 'Keep', uri, mode },
      { form: 'Text', text, size, style: 'underline' },
      { form: 'Decal', text: { colour: '#c4d2ff' } }
    ],
    gap: (amt='1em') => [{ form: 'Geom', h: amt }],
    button: (text, pressFn, size=ts00) => [
      { form: 'Text', size, text, spacing: { h: '1.5vmin', v: '1vmin' } },
      { form: 'Decal', colour: '#bcbcd29c', border: { ext: '2px', colour: '#00000020' } },
      { form: 'Press', pressFn }
    ],
    input: (prompt, textInputSrc) => [
      { form: 'Geom', w: '10em' },
      { form: 'TextInput', size: ts00, textInputSrc, prompt: 'Code?', spacing: { h: '1.5vmin', v: '1vmin' } },
      { form: 'Decal', colour: '#a0a0ff30' }
    ]
  };
  let getValidMoves = (pieces, matchPlayer, piece) => {
    
    if (piece.getValue('wait') > 0) return [];
    if (matchPlayer.getValue('colour') !== piece.getValue('colour')) return [];
    
    // Make a nice 2d representation of the board
    let calc = (8).toArr(() => (8).toArr(() => null));
    for (let pc of pieces) calc[pc.getValue('col')][pc.getValue('row')] = pc;
    
    // Utility func for checking tiles (OOB=out-of-bounds, null=empty tile, otherwise a Piece)
    let checkTile = (col, row) => (col < 0 || col > 7 || row < 0 || row > 7) ? 'OOB' : calc[col][row];
    
    let { type, colour, col, row } = piece.getValues('type', 'colour', 'col', 'row');
    
    let moves = [];
    
    if (type === 'pawn') {
      
      let dir = colour === 'white' ? 1 : -1;
      let initRow = colour === 'white' ? 1 : 6;
      
      if (!checkTile(col, row + dir)) {
        moves.push({ col, row: row + dir, cap: null }); // Add first step if unblocked
        if (row === initRow && !checkTile(col, row + dir + dir)) {
          moves.push({ col, row: row + dir + dir, cap: null }); // Add second step if unblocked and unmoved
        }
      }
      
      // Check for captures in both directions
      let cap1 = checkTile(col - 1, row + dir);
      if (cap1 && cap1 !== 'OOB' && cap1.getValue('colour') !== colour) moves.push({ col: col - 1, row: row + dir, cap: cap1 });
      
      let cap2 = checkTile(col + 1, row + dir);
      if (cap2 && cap2 !== 'OOB' && cap2.getValue('colour') !== colour) moves.push({ col: col + 1, row: row + dir, cap: cap2 });
      
    } else if (type === 'knight') {
      
      let offsets = [
        [ -2, -1 ], [ -2, 1 ], [ -1, 2 ], [ 1, 2 ], [ 2, 1 ], [ 2, -1 ], [ 1, -2 ], [ -1, -2 ]
      ];
      offsets.each(([ dx, dy ]) => {
        let [ c, r ] = [ col + dx, row + dy ];
        let check = checkTile(c, r);
        if (!check || (check !== 'OOB' && check.getValue('colour') !== colour)) moves.push({ col: c, row: r, cap: check });
      });
      
    } else if ([ 'bishop', 'rook', 'queen', 'king' ].has(type)) {
      
      let diag = [ [ -1, -1 ], [ -1, +1 ], [ +1, +1 ], [ +1, -1 ] ];
      let orth = [ [ -1,  0 ], [  0, +1 ], [ +1,  0 ], [  0, -1 ] ];
      let steps = [ 'queen', 'king' ].has(type) ? [].gain(diag).gain(orth) : (type === 'bishop' ? diag : orth);
      
      for (let [ dx, dy ] of steps) for (let n of Infinity) {
        
        let [ xx, yy ] = [ col + dx * (n + 1), row + dy * (n + 1) ];
        
        let check = checkTile(xx, yy);
        
        // Stepping terminates at edge of board
        if (check === 'OOB') break;
        
        // Empty tiles and tiles with enemy pieces are valid
        if (!check || check.getValue('colour') !== colour) moves.push({ col: xx, row: yy, cap: check });
        
        // Finding a piece terminates stepping
        if (check) break;
        
        // Kings can only step a single time in a given direction
        if (type === 'king') break;
        
      }
      
      if (type === 'king' && piece.getValue('moves') === 0) {
        
        // A king searches along ortho axes for castling moves. An
        // axis+direction is "castleable" if it contains a rook, at
        // least two tiles separate the rook and king, and all tiles
        // between the rook and king are empty.
        // A king may move 2 tiles in a "castleable" axis+direction
        
        for (let step of orth) {
          
          let numSteps = 0, castlePiece = null;
          for (numSteps = 1; true; numSteps++) {
            
            let loc = [ col + Math.round(step[0] * numSteps), row + Math.round(step[1] * numSteps) ];
            let check = checkTile(...loc);
            
            if (check === 'OOB') { break; }
            if (check) { castlePiece = check; break; }
            
          }
          
          let canCastleThisStep = true
            && castlePiece
            && numSteps > 2
            && castlePiece.getValue('type') === 'rook'
            && castlePiece.getValue('colour') === piece.getValue('colour')
            && castlePiece.getValue('moves') === 0;
          
          if (canCastleThisStep) moves.push({ col: col + Math.round(step[0] * 2), row: row + Math.round(step[1] * 2), cap: null });
          
        }
        
      }
      
    } else {
      
      throw Error(`Invalid type: ${type}`);
      
    }
    
    return moves;
    
  };
  
  /// {ABOVE=
  let { TermBank } = rooms;
  let termBank = TermBank();
  let applyMoves = (match, pieces, playerMoves) => {
    
    // All pieces refresh by 1 turn
    for (let piece of pieces) if (piece.getValue().wait > 0) piece.setValue(v => (v.wait--, v));
    
    let pieceMoves = { white: [], black: [] };
    let dangerTiles = { white: [], black: [] };
    
    c2Subcon(() => ({
      
      match: match.getValue('desc'),
      moves: playerMoves.map(move => {
        
        let dst = move.getValue();
        let src = move.m('piece?').getValue();
        
        return `${src.colour} ${src.type} @ (${src.col}, ${src.row}) -> (${dst.col}, ${dst.row})`;
        
      })
      
    }));
    
    // Update piece positions
    for (let playerMove of playerMoves) {
      
      let { col: trgCol, row: trgRow } = playerMove.getValue();
      let piece = playerMove.m('piece?');
      let gudColour = piece.getValue('colour');
      let badColour = (gudColour === 'white') ? 'black' : 'white';
      
      let trnCol = trgCol - piece.getValue().col;
      let trnRow = trgRow - piece.getValue().row;
      
      // Lots of logic required to sort out castling. Can detect
      // castling if a king moves more than 1 step in a direction
      if (piece.getValue('type') === 'king' && (Math.abs(trnCol) >= 2 || Math.abs(trnRow) >= 2)) {
        
        let gudKing = piece;
        let gudRook = pieces.find(gp => { // "gudPiece"
          
          // TODO: Also, there should be no pieces between the
          // king and match piece!
          return true
            && gp.getValue('colour') === gudColour
            && gp.getValue('type') === 'rook'
            && gp.getValue('moves') === 0
            && (false
              // The pieces are on the same row, and the rook is appropriately L/R from the king
              || (trnRow === 0 && (trnCol > 0 ? (gp.getValue('col') > gudKing.getValue('col')) : (gp.getValue('col') < gudKing.getValue('col')))) // A rook horizontally
              // The pieces are on the same col, and the rook is appropriately U/D from the king
              || (trnCol === 0 && (trnRow > 0 ? (gp.getValue('row') > gudKing.getValue('row')) : (gp.getValue('row') < gudKing.getValue('row'))))
            );
          
        }).val;
        
        if (!gudRook) throw Error(`No rook found for castling... yikes`);
        
        // Move king to target location
        pieceMoves[gudColour].add({ piece: gudKing, col: trgCol, row: trgRow });
        
        // Move rook to nearest adjacent coord on which king stood
        pieceMoves[gudColour].add({ piece: gudRook, ...((trnRow === 0)
          ? { col: trgCol + (trnCol > 0 ? -1 : +1), row: trgRow                          }
          : { col: trgCol,                          row: trgRow + (trnRow > 0 ? -1 : +1) }
        )});
        
        // No `dangerTiles` when castling!!
        
      } else {
        
        pieceMoves[gudColour].add({ piece, col: trgCol, row: trgRow });
        dangerTiles[badColour].add({ col: trgCol, row: trgRow });
        
      }
      
    }
    
    for (let moveColour in pieceMoves) {
      
      let moves = pieceMoves[moveColour];
      let danger = dangerTiles[moveColour];
      
      for (let { piece, col, row } of moves) {
        
        // Apply promotions to pawns which make it all the way
        if (piece.getValue('type') === 'pawn' && [ 0, 7 ].has(row)) piece.setValue(v => v.gain({ type: 'queen' }));
        
        // Change piece coords, apply wait, increment moves!
        piece.setValue(v => v.gain({ col, row, wait: 1, moves: v.moves + 1 }));
        
      }
      
    }
    
    for (let [ colour, tiles ] of dangerTiles) { for (let { col, row } of tiles) {
      
      for (let piece of pieces) {
        
        let endangered = true
          && piece.getValue('colour') === colour
          && piece.getValue('col') === col
          && piece.getValue('row') === row;
        if (endangered) piece.end();
        
      }
      
    }}
    
  };
  /// =ABOVE}
  
  return Hinterland('chess2', {
    
    habitats: [ HtmlBrowserHabitat() ],
    above: async (hut, chess2, real, dep) => {
      
      /// {ABOVE=
      
      hut.addKnownRoomDependencies([
        'record.bank.WeakBank',
        'Hinterland',
        'habitat.HtmlBrowserHabitat',
        'logic.Chooser',
        'logic.FnSrc',
        'logic.MemSrc',
        'logic.Scope',
        'logic.SetSrc',
        'logic.TimerSrc',
        'logic.TmpAny',
        'persona',
        'clock'
      ]);
      hut.addKnownRealDependencies([
        'Axis1d',
        'Decal',
        'Geom',
        'Keep',
        'Press',
        'Text',
        'TextInput',
        'Transform'
      ]);
      
      // Enable access to all piece images via term "pieces"
      dep(hut.enableKeep('pieces', chess2Keep.seek(`img.${pieceStyle}`)));
      
      let { random: { FastRandom } } = rooms;
      let random = FastRandom();
      
      // Config values
      let pieceLayouts = {
        minimal: {
          white: [ [ 'queen', 3, 3 ], [ 'king', 4, 3 ] ],
          black: [ [ 'queen', 4, 4 ], [ 'king', 3, 4 ] ]
        },
        classic: {
          white: [
            [ 'rook',     0, 0 ],
            [ 'knight',   1, 0 ],
            [ 'bishop',   2, 0 ],
            [ 'queen',    3, 0 ],
            [ 'king',     4, 0 ],
            [ 'bishop',   5, 0 ],
            [ 'knight',   6, 0 ],
            [ 'rook',     7, 0 ],
            [ 'pawn',     0, 1 ],
            [ 'pawn',     1, 1 ],
            [ 'pawn',     2, 1 ],
            [ 'pawn',     3, 1 ],
            [ 'pawn',     4, 1 ],
            [ 'pawn',     5, 1 ],
            [ 'pawn',     6, 1 ],
            [ 'pawn',     7, 1 ]
          ],
          black: [
            [ 'rook',     0, 7 ],
            [ 'knight',   1, 7 ],
            [ 'bishop',   2, 7 ],
            [ 'queen',    3, 7 ],
            [ 'king',     4, 7 ],
            [ 'bishop',   5, 7 ],
            [ 'knight',   6, 7 ],
            [ 'rook',     7, 7 ],
            [ 'pawn',     0, 6 ],
            [ 'pawn',     1, 6 ],
            [ 'pawn',     2, 6 ],
            [ 'pawn',     3, 6 ],
            [ 'pawn',     4, 6 ],
            [ 'pawn',     5, 6 ],
            [ 'pawn',     6, 6 ],
            [ 'pawn',     7, 6 ]
          ]
        },
        castlingTest: {
          white: [
            [ 'rook',     0, 0 ],
            [ 'king',     3, 0 ],
            [ 'rook',     7, 0 ],
            [ 'pawn',     0, 1 ],
            [ 'pawn',     1, 1 ],
            [ 'pawn',     2, 1 ],
            [ 'pawn',     3, 1 ],
            [ 'pawn',     4, 1 ],
            [ 'pawn',     5, 1 ],
            [ 'pawn',     6, 1 ],
            [ 'pawn',     7, 1 ]
          ],
          black: [
            [ 'rook',     0, 7 ],
            [ 'king',     3, 7 ],
            [ 'rook',     7, 7 ],
            [ 'pawn',     0, 6 ],
            [ 'pawn',     1, 6 ],
            [ 'pawn',     2, 6 ],
            [ 'pawn',     3, 6 ],
            [ 'pawn',     4, 6 ],
            [ 'pawn',     5, 6 ],
            [ 'pawn',     6, 6 ],
            [ 'pawn',     7, 6 ]
          ]
        },
        gameOverTest: {
          white: [
            [ 'rook',     0, 0 ],
            [ 'knight',   1, 0 ],
            [ 'bishop',   2, 0 ],
            [ 'queen',    4, 6 ],
            [ 'king',     4, 0 ],
            [ 'bishop',   5, 0 ],
            [ 'knight',   6, 0 ],
            [ 'rook',     7, 0 ],
            [ 'pawn',     0, 1 ],
            [ 'pawn',     1, 1 ],
            [ 'pawn',     2, 1 ],
            [ 'pawn',     3, 1 ],
            [ 'pawn',     5, 1 ],
            [ 'pawn',     6, 1 ],
            [ 'pawn',     7, 1 ]
          ],
          black: [
            [ 'rook',     0, 7 ],
            [ 'knight',   1, 7 ],
            [ 'bishop',   2, 7 ],
            [ 'queen',    4, 1 ],
            [ 'king',     4, 7 ],
            [ 'bishop',   5, 7 ],
            [ 'knight',   6, 7 ],
            [ 'rook',     7, 7 ],
            [ 'pawn',     0, 6 ],
            [ 'pawn',     1, 6 ],
            [ 'pawn',     2, 6 ],
            [ 'pawn',     3, 6 ],
            [ 'pawn',     5, 6 ],
            [ 'pawn',     6, 6 ],
            [ 'pawn',     7, 6 ]
          ]
        }
      };
      
      // Broad parameters
      let activePieceDef = pieceLayouts[layoutStyle];
      let pieceTypes = Set(activePieceDef.toArr( col => col.map(([ name ]) => name) ).flat(Infinity));
      
      // TODO: If I wanted to avoid keeping all Players in memory while
      // implementing this functionality I would need a way to detect
      // Record-End events (maybe via RelHandler(...).getAuditSrc()??)
      // to apply decrements
      chess2.setValue({ numPlayers: 0, numQueued: 0, numMatches: 0 });
      dep.scp(chess2, 'c2.player', (player, dep) => {
        chess2.setValue(val => void val.numPlayers++);
        dep(() => chess2.setValue(val => void val.numPlayers--));
      });
      dep.scp(chess2, 'c2.queue', (queue, dep) => {
        chess2.setValue(val => void val.numQueued++);
        dep(() => chess2.setValue(val => void val.numQueued--));
      });
      dep.scp(chess2, 'c2.match', (match, dep) => {
        chess2.setValue(val => void val.numMatches++);
        dep(() => chess2.setValue(val => void val.numMatches--));
      });
      
      // Create Player Records for each Hut that joins
      dep.scp(hut, 'hut.owned/above', (owned, dep) => {
        
        /*
        let kidHut = owned.m('below');
        let desc = kidHut.desc() + ' @ ' + kidHut.getKnownNetAddrs().toArr(v => v).join('+');
        
        let timerSrc = dep(TimerSrc({ ms: 1500 }));
        timerSrc.route(() => c2Subcon(`${desc} FAILED to make player!`), 'prm');
        timerSrc.route(() => (/*kidHut.strike(0.075, 'Failed timely chess2 player creation'), * /kidHut.end()), 'prm');
        
        dep.scp(kidHut, 'c2.player', (player, dep) => {
          
          c2Subcon(`${desc} OPEN player! (${player.getValue('term')})`)
          dep(() => c2Subcon(`${desc} SHUT player! (${player.getValue('term')})`));
          timerSrc.end(); // If we get the Player before the Timeout cancel the Timeout
          
        });
        */
        
      });
      
      // Handle Match Rounds (perform Player moves simultaneously)
      dep.scp(chess2, 'c2.match', (match, dep) => dep.scp(match, 'c2.round', (round, dep) => {
        
        let resolveRound = async moves => {
          
          let significantMoves = moves.map(move => move.m('piece?') ? move : skip);
          
          let wAlive = false;
          let bAlive = false;
          if (significantMoves.count()) {
            
            let pieces = await match.withRh('c2.piece', 'all');
            applyMoves(match, pieces, significantMoves);
            
            let aliveKings = pieces.map(pc => (pc.onn() && pc.getValue('type') === 'king') ? pc : skip);
            let wAlive = aliveKings.find(king => king.getValue('colour') === 'white').found;
            let bAlive = aliveKings.find(king => king.getValue('colour') === 'black').found;
            
            round.end();
            
            if ( wAlive && !bAlive) hut.addRecord('c2.outcome', [ match ], { winner: 'white', reason: 'checkmate' });
            if (!wAlive &&  bAlive) hut.addRecord('c2.outcome', [ match ], { winner: 'black', reason: 'checkmate' });
            if (!wAlive && !bAlive) hut.addRecord('c2.outcome', [ match ], { winner: null, reason: 'stalemate' });
            if ( wAlive &&  bAlive) hut.addRecord('c2.round', [ match ], { ms: Date.now() }); // Game continues!
            
          } else {
            
            round.end();
            hut.addRecord('c2.outcome', [ match ], { winner: null, reason: 'lethargy' });
            
          }
          
        };
        
        // If both players have submitted moves, perform those moves
        let roundMoveRh = dep(round.rh('c2.roundMove'));
        let roundMoveSrc = dep(roundMoveRh.map(hrec => hrec.rec));
        let moveSetSrc = dep(SetSrc(roundMoveSrc));
        dep(moveSetSrc.route( playerMoves => (playerMoves.count() === 2) && resolveRound(playerMoves) ));
        
        // If the timer expires perform any submitted moves
        let timerSrc = dep(TimerSrc({ ms: moveMs }));
        timerSrc.route(() => resolveRound(moveSetSrc.tmps), 'prm');
        
      }));
      
      // Perform matchmaking regularly
      dep(TimerSrc({ ms: matchmakeMs, num: Infinity })).route(async () => {
        
        let ms = Date.now();
        
        let queues = await chess2.withRh('c2.queue', 'all');
        let queuedStatusesByTerm = queues.categorize(q => q.getValue('term'));
        for (let [ term, queuedStatuses ] of queuedStatusesByTerm) {
          
          // Shuffle the PlayerStatus({ type: 'queue' }) Records; this
          // implements random match-making and random colour assignment
          queuedStatuses = random.genShuffled(queuedStatuses);
          
          let pairs = Math.floor(queuedStatuses.length / 2).toArr(n => queuedStatuses.slice(n * 2, n * 2 + 2));
          for (let [ qw, qb ] of pairs) {
            
            // Create Match for this Pair
            
            // Indicate Players are in Match (updates "status" prop!)
            let pw = qw.m('c2.playerStatus').m('c2.player');
            let pb = qb.m('c2.playerStatus').m('c2.player');
            for (let p of [ pw, pb ]) p.setValue({ status: 'match' });
            
            // Get Players from PlayerStatus({ type: 'queue' }) Records
            
            let match = hut.addRecord('c2.match', [ chess2 ], { ms, desc: `white:${pw.getValue('term')} vs black:${pb.getValue('term')}` });
            
            if (c2Subcon.enabled) {
              
              c2Subcon(`MATCH OPEN (${match.getValue('desc')})`);
              match.endWith(() => { c2Subcon(`MATCH SHUT (${match.getValue('desc')})`); });
              
              // RelHandle Dep Ends when Match Ends
              match.rh('c2.outcome').route(({ rec: outcome }) => c2Subcon(`MATCH OTCM (${match.getValue('desc')})`, outcome.getValue()));
              
            }
            
            mmm('chess2Match', +1);
            match.endWith(() => mmm('chess2Match', -1));
            
            // Initial Round of Match
            hut.addRecord('c2.round', [ match ], { ms: Date.now() });
            
            // Add Pieces to Match
            for (let [ colour, pieces ] of activePieceDef)
              for (let [ type, col, row ] of pieces)
                hut.addRecord('c2.piece', [ match ], { colour, type, col, row, wait: 0, moves: 0 });
            
            // Add Players to Match
            let mpw = hut.addRecord('c2.matchPlayer', [ match, pw.status ], { colour: 'white' });
            let mpb = hut.addRecord('c2.matchPlayer', [ match, pb.status ], { colour: 'black' });
            mpw.endWith(async () => {
              c2Subcon(`WHITE ENDED (${pw.getValue('term')})`);
              let round = await match.withRh('c2.round', 'one');
              if (round) { round.end(); hut.addRecord('c2.outcome', [ match ], { winner: 'black', reason: 'cowardice' }); }
            });
            mpb.endWith(async () => {
              c2Subcon(`BLACK ENDED (${pb.getValue('term')})`);
              let round = await match.withRh('c2.round', 'one');
              if (round) { round.end(); hut.addRecord('c2.outcome', [ match ], { winner: 'white', reason: 'cowardice' }); }
            });
            
            // Keep the Match alive so long as any Player is alive
            let anyPlayerInMatch = TmpAny([ mpw, mpb ]);
            anyPlayerInMatch.endWith(match);
            
          }
          
        }
        
      }, 'prm');
      
      /// =ABOVE}
      
    },
    below: async (hut, chess2, real, dep) => {
      
      // Async delay may cause players to see the uprighting rotation.
      // We can initiate loading these rooms immediately, and hope they
      // load in time to affect any elements in need of uprighting!
      
      dep(real.addLayout({ form: 'Axis1d', axis: 'x', dir: '+', mode: 'compactCenter' }));
      dep(real.addLayout({ form: 'Decal', colour: '#646496', text: { colour: '#ffffff' } }));
      
      let mainReal = real.addReal('c2.main', [{ form: 'Geom', w: '100vmin', h: '100vmin' }]);
      
      let nodePlayerless = (dep, real) => {
        
        let makePlayerAct = dep(hut.enableAction('c2.makePlayer', () => {
          
          /// {ABOVE=
          let termTmp = termBank.checkout();
          let player = hut.addRecord('c2.player', [ chess2, hut ], { term: termTmp.term, status: 'chill' });
          
          mmm('chess2Player', +1);
          player.endWith(() => mmm('chess2Player', -1));
          player.endWith(termTmp);
          
          // Add a "status" property to the Player
          player.status = hut.addRecord('c2.playerStatus', [ player ], { type: 'chill', ms: Date.now() });
          
          // Update the single PlayerStatus based on changes to "status"
          let statusSrc = player.getValuePropSrc('status');
          player.endWith(statusSrc);
          statusSrc.route(status => {
            
            if (status === player.status.getValue('type')) return;
            
            player.status.end();
            player.status = hut.addRecord('c2.playerStatus', [ player ], { type: status, ms: Date.now() });
            
          }, 'prm');
          /// =ABOVE}
          
        }));
        
        /// {BELOW=
        dep(TimerSrc({ ms: 500 })).route(() => makePlayerAct.act(), 'prm');
        let playerlessReal = dep(real.addReal('pane', {
          Geom: { anchor: 'mid' },
          Axis1d: { axis: 'y', mode: 'compactCenter' }
        }));
        
        playerlessReal.addReal('c2.title', lay.text('Entering Chess2...', tsP1));
        playerlessReal.addReal('c2.title', lay.link('(Stuck? Try clicking here...)', '/?hid=reset', { mode: 'replace', size: tsM2 }));
        /// =BELOW}
        
      };
      let nodeChill = (dep, real, { player, status, changeStatusAct }) => {
        
        /// {BELOW=
        let chillReal = dep(real.addReal('chill', {
          Geom: { anchor: 'mid' },
          Axis1d: { axis: 'y', dir: '+', mode: 'compactCenter' }
        }));
        chillReal.addReal('info', lay.text('You\'re playing Chess2!', tsP1));
        chillReal.addReal('info', lay.text(`Opponents will know you as "${player.getValue('term')}"`));
        let numPlayersReal = chillReal.addReal('info', lay.text());
        let numMatchesReal = chillReal.addReal('info', lay.text());
        chillReal.addReal('gap', lay.gap());
        chillReal.addReal('queue', lay.button('Find a match!', () => changeStatusAct.act({ status: 'queue' })));
        chillReal.addReal('learn', lay.button('How to play', () => changeStatusAct.act({ status: 'learn' })));
        chillReal.addReal('gap', lay.gap());
        chillReal.addReal('item', lay.text('(Chess2 is in beta and improving!)', tsM2));
        
        let numPlayersSrc = dep(chess2.getValuePropSrc('numPlayers'));
        dep(numPlayersSrc.route(num => numPlayersReal.mod({ text: `Players online: ${num}` })));
        
        let numMatchesSrc = dep(chess2.getValuePropSrc('numMatches'));
        dep(numMatchesSrc.route(num => numMatchesReal.mod({ text: `Matches in progress: ${num}` })));
        /// =BELOW}
        
      };
      let nodeLearn = (dep, real, { player, status, changeStatusAct }) => {
        
        let learnReal = dep(real.addReal('learn', [
          { form: 'Geom', w: '100%', h: '100%' },
          { form: 'Axis1d', axis: 'y', dir: '+', mode: 'stack' }
        ]));
        
        learnReal.addReal('item', lay.gap('2em'));
        learnReal.addReal('item', lay.text('How to Play Chess2', tsP1));
        learnReal.addReal('item', lay.gap());
        learnReal.addReal('item', lay.textFwd('Finally, chess with no imbalance - just black and white matched evenly in a battle of strategy and wits!'));
        learnReal.addReal('item', lay.gap());
        learnReal.addReal('item', lay.textFwd('All the rules of chess apply, BUT:'));
        learnReal.addReal('item', lay.textFwd('- Players select a move at the same time'));
        learnReal.addReal('item', lay.textFwd('- Nothing happens until both players have selected a move'));
        learnReal.addReal('item', lay.textFwd('- Once both players have selected a move, the moves occur simultaneously!'));
        learnReal.addReal('item', lay.textFwd('- The same piece may not move twice in a row'));
        learnReal.addReal('item', lay.textFwd('- Kings are never considered to be in check'));
        learnReal.addReal('item', lay.textFwd('- Win by capturing, not checkmating, the enemy\'s king!'));
        learnReal.addReal('item', lay.textFwd('- No en passant!'));
        learnReal.addReal('item', lay.textFwd('- Players may always choose to pass instead of play a move'));
        learnReal.addReal('item', lay.textFwd('- Failing to submit a move within the time limit results in passing'));
        learnReal.addReal('item', lay.textFwd('- If both players pass simultaneously the game ends in a draw'));
        learnReal.addReal('item', lay.gap());
        learnReal.addReal('item', lay.text('Chess2 by Gershom Maes'));
        learnReal.addReal('item', lay.link('(Hut framework also by Gershom Maes)', 'https://github.com/Gershy/hut', { size: tsM2 }));
        learnReal.addReal('item', lay.gap());
        learnReal.addReal('item', lay.button('Go back', () => changeStatusAct.act({ status: 'chill' })));
        learnReal.addReal('item', lay.gap('3em'));
        
      };
      let nodeQueue = (dep, real, { player, status, changeStatusAct }) => {
        
        let queueReal = dep(real.addReal('queue', [
          { form: 'Geom', w: '100%', h: '100%' },
          { form: 'Axis1d', axis: 'y', mode: 'compactCenter' },
        ]));
        
        queueReal.addReal('title', lay.text('Play an Opponent', tsP1));
        let numQueuedReal = queueReal.addReal('item', lay.text(''));
        let numQueuedSrc = dep(chess2.getValuePropSrc('numQueued'));
        dep(numQueuedSrc.route(num => {
          let text = null;
          if      (num === 0) text = 'No one is matching right now...';
          else if (num === 1) text = 'Only you are matching...';
          else if (num === 2) text = 'Any opponent is matching!';
          else                text = `There are ${num - 1} opponents matching!`;
          numQueuedReal.mod({ text });
        }));

        queueReal.addReal('gap', lay.gap());
        
        let queueRh = dep(status.rh('c2.queue'));
        let queueChooser = dep(Chooser(queueRh));
        dep.scp(queueChooser.srcs.off, (noQueue, dep) => {
          
          let queueAct = dep(hut.enableAction('c2.enterQueue', ({ term }) => {
            if (!isForm(term, String)) throw Error('Term must be String');
            if (term.length > 50) throw Error('Term max length: 50');
            hut.addRecord('c2.queue', [ chess2, status ], { term, ms: Date.now() });
          }));
          
          /// {BELOW=
          let termSrc = dep(MemSrc.Prm1(''));
          let contentReal = dep(queueReal.addReal('content', [
            { form: 'Geom', w: '90%' },
            { form: 'Axis1d', axis: 'y', mode: 'stack' }
          ]));
          contentReal.addReal('item', lay.text(String.baseline(`
            | You're about to match with an opponent!
            | To play a friend, decide on a unique code-word together, and make sure you both enter that same code into the field!
          `)));
          contentReal.addReal('gap', [{ form: 'Geom', h: '3vmin' }]);
          contentReal.addReal('termInput', lay.input('Code?', termSrc));
          contentReal.addReal('go', lay.button('Start matching!', () => queueAct.act({ term: termSrc.val })));
          contentReal.addReal('back', lay.button('Go back', () => changeStatusAct.act({ status: 'chill' })));
          /// =BELOW}
          
        });
        dep.scp(queueChooser.srcs.onn, (queue, dep) => {
          
          let leaveQueueAct = dep(hut.enableAction('c2.leaveQueue', () => queue.end()));
          
          /// {BELOW=
          let term = queue.getValue('term');
          let contentReal = dep(queueReal.addReal('content', [
            { form: 'Geom', w: '100%' },
            { form: 'Axis1d', axis: 'y', mode: 'stack' }
          ]));
          contentReal.addReal('item', lay.text(term ? `Matching using code "${term}"!` : `Matching against anyone!`));
          
          let waitTimeReal = contentReal.addReal('item', lay.text(''));
          let waitSrc = dep(TimerSrc({ num: Infinity, ms: 150 }));
          waitSrc.route(({ ms }) => {
            waitTimeReal.mod({ text: `You've been waiting ${(ms / (60 * 1000)).toFixed(1)} mins...` })
          }, 'prm');
          
          contentReal.addReal('gap', lay.gap());
          contentReal.addReal('leaveQueue', lay.button('Stop matching!', () => leaveQueueAct.act()));
          /// =BELOW}
          
        });
        
      };
      let nodeMatch = (dep, real, { matchPlayer, changeStatusAct }) => {
        
        let match = matchPlayer.m('c2.match');
        let myColour = matchPlayer.getValue('colour');
        let moveColour = (myColour === 'white') ? '#e4e4f0' : '#191944';
        
        let matchReal = dep(real.addReal('c2.match', [
          { form: 'Geom', w: '100%', h: '100%' },
          { form: 'Axis1d', axis: 'y', dir: '+', window: 'clip' },
          { form: 'Decal', colour: '#646496' },
          { form: 'Transform', rotate: (myColour === 'white') ? 0 : -0.5 }
        ]));
        let boardReal = matchReal.addReal('c2.board', [ { form: 'Geom', w: '80%', h: '80%' } ]);
        let blackPlayerHolderReal = matchReal.addReal('c2.playerHolder', [
          { form: 'Geom', w: '100%', h: '10%' },
          { form: 'Transform', rotate: (myColour === 'white') ? 0 : -0.5 }
        ]);
        let whitePlayerHolderReal = matchReal.addReal('c2.playerHolder', [
          { form: 'Geom', w: '100%', h: '10%' },
          { form: 'Transform', rotate: (myColour === 'white') ? 0 : -0.5 }
        ]);
        
        // The board appears between the 2 player holders
        blackPlayerHolderReal.mod({ order: 0 });
        boardReal.mod({ order: 1 });
        whitePlayerHolderReal.mod({ order: 2 });
        
        let myPlayerHolderReal = (myColour === 'white') ? whitePlayerHolderReal : blackPlayerHolderReal;
        
        // Get a Chooser for our MatchPlayer's Moves! (We'll need it...)
        let roundMoveRh = dep(matchPlayer.rh('c2.roundMove'));
        let roundMoveChooser = dep(Chooser(roundMoveRh));
        
        dep.scp(match, 'c2.matchPlayer', (mp, dep) => {
          
          let term = mp.getValue('term');
          
          let colour = mp.getValue('colour');
          let holderReal = (colour === 'white') ? whitePlayerHolderReal : blackPlayerHolderReal;
          let playerReal = dep(holderReal.addReal('c2.player', { text: term }, [
            { form: 'Geom', z: 1, w: '100%', h: '100%' },
            { form: 'Text', align: 'mid', size: ts00 }
          ]));
          
          // Show when we're waiting for our Opponent to move
          if (mp !== matchPlayer) {
            dep.scp(roundMoveChooser.srcs.off, (noRm, dep) => playerReal.mod({ text: term }));
            dep.scp(roundMoveChooser.srcs.onn, (rm, dep) => playerReal.mod({ text: `${term} (waiting for move...)` }));
          }
          
        });
        
        /// {BELOW=
        
        let tileDecals = {
          white: { colour: '#9a9abb', border: { ext: '1px', colour: '#c0c0d8' } },
          black: { colour: '#8989af', border: { ext: '1px', colour: '#c0c0d8' } }
        };
        let tileVal = v => `${(100 * (v / 8)).toFixed(2)}%`;
        let tileCoord = (col, row) => ({ x: tileVal(col), y: tileVal(7 - row) });
        
        for (let col of 8) for (let row of 8) {
          let colour = ((col % 2) !== (row % 2)) ? 'white' : 'black';
          boardReal.addReal('c2.tile', [
            { form: 'Geom', anchor: 'tl', w: tileVal(1), h: tileVal(1), ...tileCoord(col, row) },
            { form: 'Decal', ...tileDecals[colour] }
          ]);
        }
        
        /// =BELOW}
        
        // Render pieces
        let pieceControls = dep(MemSrc.TmpM());
        dep.scp(match, 'c2.piece', (piece, dep) => {
          
          /// {BELOW=
          
          let dbg = (Math.random() < 0.1) ? gsc : ()=>{};
          
          let pieceReal = dep(boardReal.addReal('c2.piece', {
            
            Geom: { anchor: 'tl', shape: 'oval', w: tileVal(1), h: tileVal(1) },
            Image: {},
            Transform: {},
            Decal: { transition: {
              opacity: { ms: 400, curve: 'linear', delayMs: 200 },
              scale: { ms: 400, curve: 'linear', delayMs: 200 },
              loc: { ms: 400, curve: 'decel' },
            }},
            
            ...tileCoord(0, 0), // x, y
            endDelayMs: 1000,
            keep: null,
            rotate: (myColour === 'white') ? 0 : -0.5,
            opacity: 1
            
          }));
          
          dep(piece.valueSrc.route(() => {
            
            let { col, row, type, colour, wait } = piece.getValues('col', 'row', 'type', 'colour', 'wait');
            
            let fp = `${colour}${type[0].upper()}${type.slice(1)}.png`;
            
            pieceReal.mod({
              ...tileCoord(col, row),
              keep: hut.getKeep(`/pieces/${fp}`), 
              colour: (wait > 0) ? 'rgba(255, 110, 0, 0.4)' : null
            });
            
          }));
          dep(() => pieceReal.mod({ scale: 4, opacity: 0 })); // Ghosty explosion upon capture
          
          let pieceControl = dep(Tmp({ piece, pieceReal }));
          pieceControls.mod(pieceControl);
          
          /// =BELOW}
          
        });
        
        // Render based on the current Outcome
        let outcomeRh = dep(match.rh('c2.outcome'));
        let outcomeChooser = dep(Chooser(outcomeRh));
        dep.scp(outcomeChooser.srcs.onn, (outcome, dep) => {
          
          let outcomeReal = dep(boardReal.addReal('c2.outcome', [
            { form: 'Geom', w: '100%', h: '100%' },
            { form: 'Axis1d', axis: 'y', dir: '+', mode: 'compactCenter' },
            { form: 'Decal', colour: 'rgba(0, 0, 0, 0.4)' },
            { form: 'Press', pressFn: () => changeStatusAct.act({ status: 'queue' }) },
            { form: 'Transform', rotate: (myColour === 'white') ? 0 : 0.5 }
          ]));
          let contentReal = outcomeReal.addReal('c2.content', [
            { form: 'Geom', w: '70%', h: '70%' },
            { form: 'Axis1d', axis: 'y', dir: '+', mode: 'compactCenter' },
            { form: 'Decal', colour: 'rgba(40, 40, 100, 0.5)' }
          ]);
          
          let text = null;
          let reason = outcome.getValue('reason');
          let winner = outcome.getValue('winner');
          if (reason === 'checkmate') {
            
            text = `Checkmate:\nYou ${(winner === myColour) ? 'WIN' : 'LOSE'}`
            
          } else if (reason === 'stalemate') {
            
            text = `Stalemate!`
            
          } else if (reason === 'cowardice') {
            
            text = (winner === myColour) ? `Your opponent ran away\u2026\nYou WIN!` : `You ran away\u2026\nYou LOSE!`;
            
          } else if (reason === 'lethargy') {
            
            text = `Neither player made a move!\nStalemate!`;
            
          } else if (reason === 'resign') {
            
            text = (winner === myColour) ? `Your opponent resigned\u2026\nYou WIN!` : `You resigned\u2026\nYou LOSE!`;
            
          }
          
          contentReal.addReal('c2.text', lay.text(text, tsP1));
          contentReal.addReal('c2.text', lay.text('Click anywhere to play again\u2026'));
          
        });
        dep.scp(outcomeChooser.srcs.off, (nop, dep) => {
          
          let resignAct = dep(hut.enableAction('c2.resign', async () => {
            
            /// {ABOVE=
            let round = await match.withRh('c2.round', 'one');
            if (round) round.end();
            hut.addRecord('c2.outcome', [ match ], { winner: (myColour === 'white') ? 'black' : 'white', reason: 'resign' });
            /// =ABOVE}
            
          }));
          
          dep.scp(match, 'c2.round', (round, dep) => {
            
            /// {BELOW=
            let timeBarReal = dep(myPlayerHolderReal.addReal('c2.timer', [
              { form: 'Geom', anchor: 'mid', z: 0, w: '0', h: '100%' },
              { form: 'Decal', colour: 'rgba(40, 40, 100, 0.35)', transition: {
                x: { ms: 800, curve: 'linear' },
                w: { ms: 800, curve: 'linear' }
              }}
            ]));
            let passReal = dep(myPlayerHolderReal.addReal('c2.pass', [
              { form: 'Geom', shape: 'oval', anchor: 'br', z: 1, w: '10vmin', h: '10vmin' },
              { form: 'Text', size: ts00, text: 'Pass' },
              { form: 'Decal', colour: '#ffffff20' }
            ]));
            let resignReal = dep(myPlayerHolderReal.addReal('c2.resign', [
              { form: 'Geom', shape: 'oval', anchor: 'br', z: 1, w: '10vmin', h: '10vmin', y: '10vmin' },
              { form: 'Text', size: ts00, text: 'Resign' },
              { form: 'Decal', colour: '#ff808020', windowing: false }
            ]));
            dep(TimerSrc({ ms: 500, num: Infinity })).route(() => {
              
              let elapsed = (Date.now() - round.getValue('ms'));
              let total = moveMs - 2000; // Subtracting an amount makes the timer feel generous (TODO: Can be funky for very low `moveMs` values??)
              let amt = 1 - Math.min(1, elapsed / total);
              
              timeBarReal.mod({ w: `${Math.round(amt * 100)}%` });
              
            }, 'prm');
            /// =BELOW}
            
            dep.scp(roundMoveChooser.srcs.off, (noRoundMove, dep) => {
              
              let submitMoveAct = dep(hut.enableAction('c2.submitMove', async move => {
                
                /// {ABOVE=
                
                let { type='play' } = move;
                if (type === 'pass')
                  return void hut.addRecord('c2.roundMove', { 0: round, 1: matchPlayer, 'piece?': null });
                
                let { trg } = move;
                if (!trg) throw Error(`Missing "trg"`);
                
                let { piece: pieceUid } = move;
                let pieces = await match.withRh('c2.piece', 'all');
                let piece = pieces.find(piece => piece.uid === pieceUid).val;
                if (!piece) throw Error(`Invalid piece uid: ${pieceUid}`).mod({ move });
                if (piece.getValue('wait') > 0) throw Error(`Selected piece needs to wait`);
                
                let vm = getValidMoves(pieces, matchPlayer, piece)
                  .find(vm => vm.col === trg.col && vm.row === trg.row)
                  .val;
                
                // Ensure the provided move is a valid move
                if (!vm) return;
                
                let { col, row, cap } = vm;
                
                hut.addRecord('c2.roundMove', { 0: round, 1: matchPlayer, 'piece?': piece }, { col, row, cap: !!cap });
                
                /// =ABOVE}
                
              }));
              
              /// {BELOW=
              dep(passReal.addLayout({ form: 'Press', pressFn: () => submitMoveAct.act({ type: 'pass' }) }));
              
              let feelSrc = MemSrc.Tmp1();
              dep(resignReal.addLayout({ form: 'Feel', feelSrc }));
              dep.scp(feelSrc, (feel, dep) => {
                
                let holdReal = dep(resignReal.addReal('c2.hold', { colour: '#faa2', w: '120%', h: '120%' }, [
                  { form: 'Geom', shape: 'oval', anchor: 'mid', z: -1 },
                  { form: 'Decal', transition: {
                    colour: { ms: 2000, curve: 'linear' },
                    loc:    { ms: 2000, curve: 'linear' },
                    size:   { ms: 2000, curve: 'linear' }
                  }}
                ]));
                
                setTimeout(() => holdReal.mod({ colour: '#c2a4', w: '200%', h: '200%' }), 100);
                
                dep(TimerSrc({ ms: 2000 })).route(() => {
                  
                  holdReal.end();
                  dep(resignReal.addLayout({ form: 'Press', pressFn: () => resignAct.act() }));
                  dep(resignReal.addLayout({ form: 'Decal', colour: '#c2aa' }));
                  
                }, 'prm');
                
              });
              
              let selectedPieceChooser = dep(Chooser([ 'off', 'onn' ]));
              dep.scp(selectedPieceChooser.srcs.off, (noSelectedPiece, dep) => {
                
                // Pieces can be selected by clicking
                dep.scp(pieceControls, ({ piece, pieceReal }, dep) => {
                  
                  // Can't select enemy pieces
                  if (piece.getValue('colour') !== myColour) return;
                  
                  dep(pieceReal.addLayout({ form: 'Press',
                    pressFn: () => selectedPieceChooser.choose('onn', Tmp({ piece, pieceReal, '~chooserInternal': true })) // TODO: Ridiculous
                  }));
                  
                });
                
              });
              dep.scp(selectedPieceChooser.srcs.onn, async ({ piece, pieceReal }, dep) => {
                
                dep(pieceReal.addLayout({ form: 'Decal', border: { ext: '5px', colour: moveColour } }));
                
                let pieces = await match.withRh('c2.piece', 'all');
                
                for (let { col, row, cap } of getValidMoves(pieces, matchPlayer, piece)) {
                  
                  let optionReal = dep(boardReal.addReal('c2.option', [
                    { form: 'Geom', anchor: 'tl', w: tileVal(1), h: tileVal(1), ...tileCoord(col, row) },
                    { form: 'Press',
                      pressFn: () => submitMoveAct.act({ piece: piece.uid, trg: { col, row } })
                    }
                  ]));
                  
                  optionReal.addReal('c2.indicator', [
                    
                    { form: 'Geom', shape: 'oval', anchor: 'mid', w: cap ? '80%' : '40%', h: cap ? '80%' : '40%' },
                    { form: 'Decal', border: cap ? { ext: '5px', colour: moveColour } : null, colour: cap ? null : moveColour }
                    
                  ]);
                  
                }
                
                // Click anywhere on the board to deselect
                dep(boardReal.addLayout({ form: 'Press', pressFn: () =>  selectedPieceChooser.choose('off') }));
                
              });
              /// =BELOW}
              
            });
            dep.scp(roundMoveChooser.srcs.onn, (roundMove, dep) => {
              
              let retractMoveAct = dep(hut.enableAction('c2.retractMove', async () => {
                
                /// {ABOVE=
                // Really this is just sanity; a move must exist due to
                // the scoping!
                let curMove = await matchPlayer.withRh('c2.roundMove', 'one'); // OR { type: 'c2.roundMove', fn: 'all' } OR { type: 'c2.roundMove', fn: rh => rh.getRecs() }
                if (curMove) curMove.end();
                /// =ABOVE}
                
              }));
              
              /// {BELOW=
              
              // Indicate whether "pass" is currently selected
              if (roundMove.m('piece?') === null) {
                dep(passReal.addLayout({ form: 'Decal', colour: '#ffffffa0' }));
                dep(passReal.addLayout({ form: 'Press', pressFn: () => retractMoveAct.act() }));
              }
              
              // Click anywhere on the board to cancel current move
              dep(boardReal.addLayout({ form: 'Press', pressFn: () => retractMoveAct.act() }));
              
              let movePiece = roundMove.m('piece?');
              if (!movePiece) return;
              
              let pieceReal = pieceControls.vals.find(({ piece }) => piece === movePiece).val.pieceReal;
              
              let { col, row, cap } = roundMove.getValue();
              
              dep(pieceReal.addLayout({ form: 'Decal', border: { ext: '5px', colour: moveColour } }));
              
              let moveReal = dep(boardReal.addReal('c2.move', [
                { form: 'Geom', anchor: 'tl', w: tileVal(1), h: tileVal(1), ...tileCoord(col, row) }
              ]));
              
              if (cap) {
                
                moveReal.addReal('c2.indicator1', [
                  { form: 'Geom', shape: 'oval', anchor: 'mid', w: '95%', h: '95%' },
                  { form: 'Decal', border: { ext: '2px', colour: moveColour } }
                ]);
                moveReal.addReal('c2.indicator2', [
                  { form: 'Geom', shape: 'oval', anchor: 'mid', w: '80%', h: '80%' },
                  { form: 'Decal', border: { ext: '4px', colour: moveColour } }
                ]);
                
              } else {
                
                moveReal.addReal('c2.indicator1', [
                  { form: 'Geom', shape: 'oval', anchor: 'mid', w: '50%', h: '50%' },
                  { form: 'Decal', border: { ext: '2px', colour: moveColour } }
                ]);
                moveReal.addReal('c2.indicator2', [
                  { form: 'Geom', shape: 'oval', anchor: 'mid', w: '35%', h: '35%' },
                  { form: 'Decal', colour: moveColour }
                ]);
                
              }
              
              /// =BELOW}
              
            });
            
          })
        
        });
        
      };
      
      let paneReal = dep(mainReal.addReal('pane', [
        { form: 'Geom', w: '80%', h: '80%', anchor: 'mid' },
        { form: 'Decal', colour: 'rgba(120, 120, 170, 1)' }
      ]));
      let playerRh = dep(hut.rh('c2.player'));
      let playerExistsChooser = dep(Chooser(playerRh, null));
      dep.scp(playerExistsChooser.srcs.off, (noPlayer, dep) => nodePlayerless(dep, paneReal, chess2));
      dep.scp(playerExistsChooser.srcs.onn, (player, dep) => {
        
        let changeStatusAct = dep(hut.enableAction('c2.changeStatus', async msg => {
          
          /// {ABOVE=
          let { status=null } = msg ?? {};
          if (![ 'chill', 'learn', 'queue', 'lobby' ].has(status)) throw Error('Invalid status!');
          if (status === player.getValue('status')) throw Error(`Can't change to same status!`);
          
          c2Subcon(`Player "${player.getValue('term')}" status: "${player.getValue('status')}" -> "${status}"`);
          
          player.setValue({ status });
          /// =ABOVE}
          
        }));
        
        dep.scp(player, 'c2.playerStatus', (status, dep) => {
          
          let type = status.getValue('type');
          if (type === 'chill') nodeChill(dep, paneReal, { player, changeStatusAct });
          if (type === 'learn') nodeLearn(dep, paneReal, { player, status, changeStatusAct });
          if (type === 'queue') nodeQueue(dep, paneReal, { player, status, changeStatusAct });
          if (type === 'match') dep.scp(status, 'c2.matchPlayer', (matchPlayer, dep) => {
            
            paneReal.mod({ w: '100%', h: '100%' });
            dep(() => paneReal.mod({ w: skip, h: skip }));
            nodeMatch(dep, paneReal, { matchPlayer, changeStatusAct });
            
          });
          
        });
        
      });
      
    }
    
  });
  
};
