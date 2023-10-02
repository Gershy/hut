global.rooms['chess2'] = async chess2Keep => {
  
  let sc = subcon('loft.chess2');
  
  let rooms = await getRooms([
    
    /// {ABOVE=
    'TermBank',
    'random',
    /// =ABOVE}
    
    'logic.AnyTmp',
    'logic.Chooser',
    'logic.SetSrc',
    'logic.MemSrc',
    'logic.MapSrc',
    'logic.TimerSrc',
    'logic.ToggleSrc',
    'habitat.HtmlBrowserHabitat',
    'Hinterland'
    
  ]);
  let { AnyTmp, Chooser, SetSrc, MemSrc, TimerSrc, ToggleSrc, Hinterland, HtmlBrowserHabitat, MapSrc } = rooms;
  
  let isDev = conf('global.maturity') === 'dev';
  let pieceStyle = 'classic';
  let layoutStyle = 'classic';
  let moveMs = (isDev ? 13 : 60) * 1000;
  let matchmakeMs = (isDev ? 1 : 5) * 1000;
  let tsM1 = 'calc(70% + 0.78vmin)';
  let ts00 = 'calc(80% + 0.85vmin)';
  let tsP1 = 'calc(90% + 1.00vmin)';
  let lay = {
    text: (text, size=ts00, align='mid') => ({
      Text: { size, align, text, spacing: { h: '1.2vmin', v: '0.75vmin' } }
    }),
    textFwd: (text, size=ts00) => ({ ...lay.text(text, size, 'fwd'), Geom: { w: '100%' } }),
    link: (text, uri, { size=ts00, mode='spawn' }={}) => ({
      Keep: { uri, mode },
      Text: { text, size, style: 'underline' },
      Decal: { text: { colour: '#c4d2ff' } }
    }),
    gap: (amt='1em') => ({ Geom: { h: amt } }),
    button: (text, pressFn, size=ts00) => ({
      Text: { size, text, spacing: { h: '1.5vmin', v: '1vmin' } },
      Decal: { colour: '#bcbcd29c', border: { ext: '2px', colour: '#00000020' } },
      Press: { pressFn }
    }),
    input: (prompt, textInputSrc) => ({
      Geom: { w: '10em' },
      TextInput: { size: ts00, textInputSrc, prompt: 'Code?', spacing: { h: '1.5vmin', v: '1vmin' } },
      Decal: { colour: '#a0a0ff30' }
    })
  };
  
  let makeBoard = pieces => {
    
    let data = (8).toArr(() => (8).toArr(() => null));
    for (let pc of pieces) {
      let { col, row } = pc.getValue();
      data[col][row] = pc;
    }
    return { data, check: (col, row) => (col < 0 || col > 7 || row < 0 || row > 7) ? 'OOB' : data[col][row] };
    
  };
  let getValidMoves = (board, matchLofter, piece) => {
    
    if (piece.getValue('wait') > 0) return [];
    if (matchLofter.getValue('colour') !== piece.getValue('colour')) return [];
    let { type, colour, col, row } = piece.getValues('type', 'colour', 'col', 'row');
    
    let moves = [];
    
    if (type === 'pawn') {
      
      let dir = colour === 'white' ? 1 : -1;
      
      if (!board.check(col, row + dir)) {
        moves.push({ col, row: row + dir, cap: null }); // Add first step if unblocked
        if (piece.getValue('moves') === 0 && !board.check(col, row + dir + dir)) {
          moves.push({ col, row: row + dir + dir, cap: null }); // Add second step if unblocked and unmoved
        }
      }
      
      // Check for captures in both directions
      let cap1 = board.check(col - 1, row + dir);
      if (cap1 && cap1 !== 'OOB' && cap1.getValue('colour') !== colour) moves.push({ col: col - 1, row: row + dir, cap: cap1 });
      
      let cap2 = board.check(col + 1, row + dir);
      if (cap2 && cap2 !== 'OOB' && cap2.getValue('colour') !== colour) moves.push({ col: col + 1, row: row + dir, cap: cap2 });
      
    } else if (type === 'knight') {
      
      let offsets = [
        [ -2, -1 ], [ -2, 1 ], [ -1, 2 ], [ 1, 2 ], [ 2, 1 ], [ 2, -1 ], [ 1, -2 ], [ -1, -2 ]
      ];
      offsets.each(([ dx, dy ]) => {
        let [ c, r ] = [ col + dx, row + dy ];
        let check = board.check(c, r);
        if (!check || (check !== 'OOB' && check.getValue('colour') !== colour)) moves.push({ col: c, row: r, cap: check });
      });
      
    } else if ([ 'bishop', 'rook', 'queen', 'king' ].has(type)) {
      
      let diag = [ [ -1, -1 ], [ -1, +1 ], [ +1, +1 ], [ +1, -1 ] ];
      let orth = [ [ -1,  0 ], [  0, +1 ], [ +1,  0 ], [  0, -1 ] ];
      let steps = [ 'queen', 'king' ].has(type) ? [].gain(diag).gain(orth) : (type === 'bishop' ? diag : orth);
      
      for (let [ dx, dy ] of steps) for (let n of Infinity) {
        
        let [ xx, yy ] = [ col + dx * (n + 1), row + dy * (n + 1) ];
        
        let check = board.check(xx, yy);
        
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
            let check = board.check(...loc);
            
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
  let applyMoves = (match, pieces, lofterMoves) => {
    
    // All pieces refresh by 1 turn
    for (let piece of pieces) if (piece.getValue().wait > 0) piece.setValue(v => (v.wait--, v));
    
    let pieceMoves = { white: [], black: [] };
    let dangerTiles = { white: [], black: [] };
    
    sc(() => ({
      
      match: match.getValue('desc'),
      moves: lofterMoves.map(move => {
        
        let dst = move.getValue();
        let src = move.m('piece?').getValue();
        
        return `${src.colour} ${src.type} @ (${src.col}, ${src.row}) -> (${dst.col}, ${dst.row})`;
        
      })
      
    }));
    
    // Update piece positions
    for (let lofterMove of lofterMoves) {
      
      let { col: trgCol, row: trgRow } = lofterMove.getValue();
      let piece = lofterMove.m('piece?');
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
  
  return Hinterland({
    prefix: 'c2',
    habitats: [ HtmlBrowserHabitat() ],
    above: async (experience, dep) => {
      
      /// {ABOVE=
      
      let { record: chess2 } = experience;
      let { addRecord, enableKeep, addPreloadRooms } = experience;
      
      addPreloadRooms([
        'Hinterland',
        'habitat.HtmlBrowserHabitat',
        'record.bank.WeakBank',
        'logic.Chooser',
        'logic.MapSrc',
        'logic.MemSrc',
        'logic.Scope',
        'logic.SetSrc',
        'logic.TimerSrc',
        'logic.AnyTmp',
        'reality.real.Real',
        'reality.layout.Axis1d',
        'reality.layout.Decal',
        'reality.layout.Geom',
        'reality.layout.Keep',
        'reality.layout.Text',
        'reality.layout.TextInput',
        'reality.layout.Transform',
      ]);
      
      // Enable access to all piece images via term "pieces"
      dep(enableKeep('pieces', chess2Keep.seek(`img.${pieceStyle}`)));
      
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
        },
        pawnShowdown: {
          white: [
            [ 'king',     4, 0 ],
            [ 'pawn',     0, 3 ],
            [ 'pawn',     1, 3 ],
            [ 'pawn',     2, 3 ],
            [ 'pawn',     3, 3 ],
            [ 'pawn',     4, 3 ],
            [ 'pawn',     5, 3 ],
            [ 'pawn',     6, 3 ],
            [ 'pawn',     7, 3 ]
          ],
          black: [
            [ 'king',     4, 7 ],
            [ 'pawn',     0, 4 ],
            [ 'pawn',     1, 4 ],
            [ 'pawn',     2, 4 ],
            [ 'pawn',     3, 4 ],
            [ 'pawn',     4, 4 ],
            [ 'pawn',     5, 4 ],
            [ 'pawn',     6, 4 ],
            [ 'pawn',     7, 4 ]
          ]
        }
      };
      
      // Broad parameters
      let activePieceDef = pieceLayouts[layoutStyle];
      let pieceTypes = Set(activePieceDef.toArr( col => col.map(([ name ]) => name) ).flat(Infinity));
      
      // TODO: If I wanted to avoid keeping all Lofters in memory while
      // implementing this functionality I would need a way to detect
      // Record-End events (maybe via RelHandler(...).getAuditSrc()??)
      // to apply decrements
      chess2.setValue({ numLofters: 0, numQueued: 0, numMatches: 0 });
      dep.scp(chess2, 'lofter', (lofter, dep) => {
        
        // Decorate the Lofter - give it a Term
        let termTmp = dep(termBank.checkout());
        lofter.setValue({ term: termTmp.term, status: 'chill' });
        
        // Add a "status" property to the Lofter
        lofter.status = addRecord('lofterStatus', [ lofter ], { type: 'chill', ms: Date.now() });
        
        // Update the single LofterStatus based on changes to "status"
        let statusSrc = dep(lofter.getValuePropSrc('status'));
        statusSrc.route(status => {
          
          if (status === lofter.status.getValue('type')) return;
          lofter.status.end();
          lofter.status = addRecord('lofterStatus', [ lofter ], { type: status, ms: Date.now() });
          
        }, 'prm');
        
        chess2.setValue(val => void val.numLofters++);
        dep(() => chess2.setValue(val => void val.numLofters--));
        
      });
      dep.scp(chess2, 'queue', (queue, dep) => {
        chess2.setValue(val => void val.numQueued++);
        dep(() => chess2.setValue(val => void val.numQueued--));
      });
      dep.scp(chess2, 'match', (match, dep) => {
        chess2.setValue(val => void val.numMatches++);
        dep(() => chess2.setValue(val => void val.numMatches--));
      });
      
      // Handle Match Rounds (perform Lofter moves simultaneously)
      dep.scp(chess2, 'match', (match, dep) => dep.scp(match, 'round', (round, dep) => {
        
        let resolveRound = async moves => {
          
          let significantMoves = moves.map(move => move.m('piece?') ? move : skip);
          
          let wAlive = false;
          let bAlive = false;
          if (significantMoves.count()) {
            
            let pieces = await match.withRh('piece', 'all');
            applyMoves(match, pieces, significantMoves);
            
            let aliveKings = pieces.map(pc => (pc.onn() && pc.getValue('type') === 'king') ? pc : skip);
            let wAlive = aliveKings.find(king => king.getValue('colour') === 'white').found;
            let bAlive = aliveKings.find(king => king.getValue('colour') === 'black').found;
            
            round.end();
             
            if ( wAlive && !bAlive) addRecord(`outcome`, [ match ], { winner: 'white', reason: 'checkmate' });
            if (!wAlive &&  bAlive) addRecord(`outcome`, [ match ], { winner: 'black', reason: 'checkmate' });
            if (!wAlive && !bAlive) addRecord(`outcome`, [ match ], { winner: null, reason: 'stalemate' });
            if ( wAlive &&  bAlive) addRecord(`round`, [ match ], { ms: Date.now() }); // Game continues!
            
          } else {
            
            round.end();
            addRecord(`outcome`, [ match ], { winner: null, reason: 'lethargy' });
            
          }
          
        };
        
        // If both lofters have submitted moves, perform those moves
        let roundMoveRh = dep(round.rh('roundMove'));
        let roundMoveSrc = dep(MapSrc(roundMoveRh, hrec => hrec.rec));
        let moveSetSrc = dep(SetSrc(roundMoveSrc));
        dep(moveSetSrc.route( lofterMoves => (lofterMoves.count() === 2) && resolveRound(lofterMoves) ));
        
        // If the timer expires perform any submitted moves
        let timerSrc = dep(TimerSrc({ ms: moveMs }));
        timerSrc.route(() => resolveRound(moveSetSrc.tmps), 'prm');
        
      }));
      
      // Perform matchmaking regularly
      dep(TimerSrc({ ms: matchmakeMs, num: Infinity })).route(async () => {
        
        let ms = Date.now();
        
        let queues = await chess2.withRh('queue', 'all');
        let queuedStatusesByTerm = queues.categorize(q => q.getValue('term'));
        for (let [ term, queuedStatuses ] of queuedStatusesByTerm) {
          
          // Shuffle the LofterStatus({ type: 'queue' }) Records; this
          // implements random match-making and random colour assignment
          queuedStatuses = random.genShuffled(queuedStatuses);
          
          let pairs = Math.floor(queuedStatuses.length / 2).toArr(n => queuedStatuses.slice(n * 2, n * 2 + 2));
          for (let [ qw, qb ] of pairs) {
            
            // Create Match for this Pair
            
            // Indicate Lofters are in Match (updates "status" prop!)
            let pw = qw.m('lofterStatus').m('lofter');
            let pb = qb.m('lofterStatus').m('lofter');
            for (let p of [ pw, pb ]) p.setValue({ status: 'match' });
            
            // Get Lofters from LofterStatus({ type: 'queue' }) Records
            
            let match = addRecord('match', [ chess2 ], { ms, desc: `white:${pw.getValue('term')} vs black:${pb.getValue('term')}` });
            
            sc(`MATCH OPEN (${match.getValue('desc')})`);
            match.endWith(() => { sc(`MATCH SHUT (${match.getValue('desc')})`); });
            
            // RelHandle Dep Ends when Match Ends
            match.rh('outcome').route(({ rec: outcome }) => sc(`MATCH OTCM (${match.getValue('desc')})`, outcome.getValue()));
            
            // Initial Round of Match
            addRecord('round', [ match ], { ms: Date.now() });
            
            // Add Pieces to Match
            for (let [ colour, pieces ] of activePieceDef)
              for (let [ type, col, row ] of pieces)
                addRecord('piece', [ match ], { colour, type, col, row, wait: 0, moves: 0 });
            
            // Add Lofters to Match
            let mpw = addRecord('matchLofter', [ match, pw.status ], { colour: 'white' });
            let mpb = addRecord('matchLofter', [ match, pb.status ], { colour: 'black' });
            mpw.endWith(async () => {
              sc(`WHITE ENDED (${pw.getValue('term')})`);
              let round = await match.withRh('round', 'one');
              if (round) {
                round.end();
                addRecord('outcome', [ match ], { winner: 'black', reason: 'cowardice' });
              }
            });
            mpb.endWith(async () => {
              sc(`BLACK ENDED (${pb.getValue('term')})`);
              let round = await match.withRh('round', 'one');
              if (round) { round.end(); addRecord('outcome', [ match ], { winner: 'white', reason: 'cowardice' }); }
            });
            
            // Keep the Match alive so long as any Lofter is alive
            let anyLofterInMatch = AnyTmp([ mpw, mpb ]);
            anyLofterInMatch.endWith(match);
            
          }
          
        }
        
      }, 'prm');
      
      /// =ABOVE}
      
    },
    below: async (experience, dep) => {
      
      let { record: chess2, real: chess2Real, lofterRh } = experience;
      let { addRecord, enableAction } = experience;
      
      dep(chess2Real.addLayout('Axis1d', { axis: 'x', dir: '+', mode: 'compactCenter' }));
      dep(chess2Real.addLayout('Decal', { colour: '#646496', text: { colour: '#ffffff' } }));
      
      let mainReal = chess2Real.addReal('main', { Geom: { w: '100vmin', h: '100vmin' } });
      
      let nodeLofterless = (dep, real) => {
        
        /// {BELOW=
        let lofterlessReal = dep(real.addReal('pane', {
          Geom: { anchor: 'mid' },
          Axis1d: { axis: 'y', mode: 'compactCenter' }
        }));
        
        lofterlessReal.addReal('title', lay.text('Entering Chess2...', tsP1));
        lofterlessReal.addReal('title', lay.link('(Stuck? Try clicking here...)', '/?hid=reset', { mode: 'replace', size: tsM1 }));
        /// =BELOW}
        
      };
      let nodeChill = (dep, real, { lofter, status, changeStatusAct }) => {
        
        /// {BELOW=
        let chillReal = dep(real.addReal('chill', {
          Geom: { anchor: 'mid' },
          Axis1d: { axis: 'y', dir: '+', mode: 'compactCenter' }
        }));
        chillReal.addReal('info', lay.text('You\'re playing Chess2!', tsP1));
        chillReal.addReal('info', lay.text(`Opponents will know you as "${lofter.getValue('term')}"`));
        let numLoftersReal = chillReal.addReal('info', lay.text());
        let numMatchesReal = chillReal.addReal('info', lay.text());
        chillReal.addReal('gap', lay.gap());
        chillReal.addReal('queue', lay.button('Find a match!', () => changeStatusAct.act({ status: 'queue' })));
        chillReal.addReal('learn', lay.button('How to play', () => changeStatusAct.act({ status: 'learn' })));
        chillReal.addReal('gap', lay.gap());
        chillReal.addReal('item', lay.text('(Chess2 is in beta and improving!)', tsM1));
        
        let numLoftersSrc = dep(chess2.getValuePropSrc('numLofters'));
        dep(numLoftersSrc.route(num => numLoftersReal.mod({ text: `Players online: ${num}` })));
        
        let numMatchesSrc = dep(chess2.getValuePropSrc('numMatches'));
        dep(numMatchesSrc.route(num => numMatchesReal.mod({ text: `Matches in progress: ${num}` })));
        /// =BELOW}
        
      };
      let nodeLearn = (dep, real, { lofter, status, changeStatusAct }) => {
        
        let learnReal = dep(real.addReal('learn', {
          Geom: { w: '100%', h: '100%' },
          Axis1d: { axis: 'y', dir: '+', mode: 'stack' }
        }));
        
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
        learnReal.addReal('item', lay.link('(Hut framework also by Gershom Maes)', 'https://github.com/Gershy/hut', { size: tsM1 }));
        learnReal.addReal('item', lay.gap());
        learnReal.addReal('item', lay.button('Go back', () => changeStatusAct.act({ status: 'chill' })));
        learnReal.addReal('item', lay.gap('3em'));
        
      };
      let nodeQueue = (dep, real, { lofter, status, changeStatusAct }) => {
        
        let queueReal = dep(real.addReal('queue', {
          Geom: { w: '100%', h: '100%' },
          Axis1d: { axis: 'y', mode: 'compactCenter' },
        }));
        
        let numQueuedReal = queueReal.addReal('item', lay.text(''));
        let numQueuedSrc = dep(chess2.getValuePropSrc('numQueued'));
        dep(numQueuedSrc.route(num => {
          let text = null;
          if      (num === 0) text = 'No one is matching right now...';
          else if (num === 1) text = 'There is 1 player matching!';
          else                text = `There are ${num} players matching!`;
          numQueuedReal.mod({ text });
        }));

        queueReal.addReal('gap', lay.gap());
        
        let queueRh = dep(status.rh('queue'));
        let queueChooser = dep(Chooser.noneOrSome(queueRh));
        dep.scp(queueChooser.srcs.off, (noQueue, dep) => {
          
          let queueAct = dep(enableAction('enterQueue', ({ term }) => {
            if (!isForm(term, String)) throw Error('Term must be String');
            if (term.length > 50) throw Error('Term max length: 50');
            addRecord('queue', [ chess2, status ], { term, ms: Date.now() });
          }));
          
          /// {BELOW=
          let termSrc = MemSrc('');
          let contentReal = dep(queueReal.addReal('content', {
            Geom: { w: '90%' },
            Axis1d: { axis: 'y', mode: 'stack' }
          }));
          contentReal.addReal('item', lay.text(String.baseline(`
            | You're about to match with an opponent!
            | To play a friend, decide on a unique code-word together, and make sure you both enter that same code into the field!
          `)));
          contentReal.addReal('gap', { Geom: { h: '3vmin' } });
          contentReal.addReal('termInput', lay.input('Code?', termSrc));
          contentReal.addReal('go', lay.button('Start matching!', () => queueAct.act({ term: termSrc.val })));
          contentReal.addReal('back', lay.button('Go back', () => changeStatusAct.act({ status: 'chill' })));
          /// =BELOW}
          
        });
        dep.scp(queueChooser.srcs.onn, (queue, dep) => {
          
          let leaveQueueAct = dep(enableAction('leaveQueue', () => queue.end()));
          
          /// {BELOW=
          let term = queue.getValue('term');
          let contentReal = dep(queueReal.addReal('content', {
            Geom: { w: '100%' },
            Axis1d: { axis: 'y', mode: 'stack' }
          }));
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
      let nodeMatch = (dep, real, { matchLofter, changeStatusAct }) => {
        
        let match = matchLofter.m('match');
        let myColour = matchLofter.getValue('colour');
        let moveColour = (myColour === 'white') ? '#e4e4f0' : '#191944';
        
        let matchReal = dep(real.addReal('match', {
          Geom: { w: '100%', h: '100%' },
          Axis1d: { axis: 'y', dir: '+', window: 'clip' },
          Decal: { colour: '#646496' },
          Transform: { rotate: (myColour === 'white') ? 0 : -0.5 }
        }));
        let boardReal = matchReal.addReal('board', { Geom: { w: '80%', h: '80%' } });
        let blackLofterHolderReal = matchReal.addReal('lofterHolder', {
          Geom: { w: '100%', h: '10%' },
          Transform: { rotate: (myColour === 'white') ? 0 : -0.5 }
        });
        let whiteLofterHolderReal = matchReal.addReal('lofterHolder', {
          Geom: { w: '100%', h: '10%' },
          Transform: { rotate: (myColour === 'white') ? 0 : -0.5 }
        });
        
        // The board appears between the 2 lofter holders
        blackLofterHolderReal.mod({ order: 0 });
        boardReal.mod({ order: 1 });
        whiteLofterHolderReal.mod({ order: 2 });
        
        let myLofterHolderReal = (myColour === 'white') ? whiteLofterHolderReal : blackLofterHolderReal;
        
        // Get a Chooser for our MatchLofter's Moves! (We'll need it...)
        let roundMoveRh = dep(matchLofter.rh('roundMove'));
        let roundMoveChooser = dep(Chooser.noneOrSome(roundMoveRh));
        
        dep.scp(match, 'matchLofter', (mp, dep) => {
          
          let term = mp.getValue('term');
          
          let colour = mp.getValue('colour');
          let holderReal = (colour === 'white') ? whiteLofterHolderReal : blackLofterHolderReal;
          let lofterReal = dep(holderReal.addReal('lofter', {
            Geom: { z: 1, w: '100%', h: '100%' },
            Text: { align: 'mid', size: ts00, text: term },
          }));
          
          // Show when we're waiting for our Opponent to move
          if (mp !== matchLofter) {
            dep.scp(roundMoveChooser.srcs.off, (noRm, dep) => lofterReal.mod({ text: term }));
            dep.scp(roundMoveChooser.srcs.onn, (rm, dep) => lofterReal.mod({ text: `${term} (waiting for move...)` }));
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
          boardReal.addReal('tile', {
            Geom: { anchor: 'tl', w: tileVal(1), h: tileVal(1), ...tileCoord(col, row) },
            Decal: { ...tileDecals[colour] }
          });
        }
        
        /// =BELOW}
        
        // We'll track the Real associated with each Piece
        let pieceReals = Map(/* Piece(...).uid -> Real(...) */);
        
        // Render pieces
        dep.scp(match, 'piece', (piece, dep) => {
          
          /// {BELOW=
          
          let dbg = (Math.random() < 0.1) ? gsc : ()=>{};
          
          let pieceReal = dep(boardReal.addReal('piece', {
            
            Geom: { anchor: 'tl', shape: 'oval', w: tileVal(1), h: tileVal(1) },
            Image: {},
            Transform: {},
            
            ...tileCoord(0, 0), // x, y
            endDelayMs: 1000,
            keep: null,
            rotate: (myColour === 'white') ? 0 : -0.5,
            opacity: 1
            
          }));
          
          // Block initial animation by delaying Decal application until
          // after rotation has been applied
          dep(TimerSrc({ num: 1, ms: 500 })).route(() => {
            pieceReal.addLayout('Decal', { transition: {
              opacity: { ms: 400, curve: 'linear', delayMs: 200 },
              scale: { ms: 400, curve: 'linear', delayMs: 200 },
              loc: { ms: 400, curve: 'decel' },
            }});
          });
          
          dep(piece.valueSrc.route(() => {
            
            let { col, row, type, colour, wait } = piece.getValues('col', 'row', 'type', 'colour', 'wait');
            
            let fp = `${colour}${type[0].upper()}${type.slice(1)}.png`;
            
            pieceReal.mod({
              ...tileCoord(col, row),
              keep: experience.getKeep(`/pieces/${fp}`), 
              colour: (wait > 0) ? 'rgba(255, 110, 0, 0.4)' : null
            });
            
          }));
          dep(() => pieceReal.mod({ scale: 4, opacity: 0 })); // Ghosty explosion upon capture
          
          pieceReals.set(piece.uid, pieceReal);
          dep(() => pieceReals.rem(piece.uid));
          
          /// =BELOW}
          
        });
        
        // Render based on the current Outcome
        let outcomeRh = dep(match.rh('outcome'));
        let outcomeChooser = dep(Chooser.noneOrSome(outcomeRh));
        dep.scp(outcomeChooser.srcs.onn, (outcome, dep) => {
          
          let outcomeReal = dep(boardReal.addReal('outcome', {
            Geom: { w: '100%', h: '100%' },
            Axis1d: { axis: 'y', dir: '+', mode: 'compactCenter' },
            Decal: { colour: 'rgba(0, 0, 0, 0.4)' },
            Press: { pressFn: () => changeStatusAct.act({ status: 'queue' }) },
            Transform: { rotate: (myColour === 'white') ? 0 : 0.5 },
            opacity: 0
          }));
          let contentReal = outcomeReal.addReal('content', {
            Geom: { w: '70%', h: '70%' },
            Axis1d: { axis: 'y', dir: '+', mode: 'compactCenter' },
            Decal: { colour: 'rgba(40, 40, 100, 0.5)' }
          });
          
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
          
          contentReal.addReal('text', lay.text(text, tsP1));
          contentReal.addReal('text', lay.text('Click anywhere to play again\u2026'));
          
          // Only "dramatic" outcomes have a delay
          let delayMs = [ 'checkmate', 'stalemate' ].has(reason) ? 350 : 0;
          dep(TimerSrc({ num: 1, ms: delayMs })).route(() => outcomeReal.mod({ opacity: 1 }));
          
        });
        dep.scp(outcomeChooser.srcs.off, (nop, dep) => {
          
          let resignAct = dep(enableAction('resign', async () => {
            
            /// {ABOVE=
            let round = await match.withRh('round', 'one');
            if (round) round.end();
            addRecord('outcome', [ match ], { winner: (myColour === 'white') ? 'black' : 'white', reason: 'resign' });
            /// =ABOVE}
            
          }));
          
          dep.scp(match, 'round', (round, dep) => {
            
            /// {BELOW=
            let timeBarReal = dep(myLofterHolderReal.addReal('timer', {
              Geom: { anchor: 'mid', z: 0, w: '0', h: '100%' },
              Decal: { colour: 'rgba(40, 40, 100, 0.35)', transition: {
                x: { ms: 500, curve: 'linear' },
                w: { ms: 500, curve: 'linear' }
              }}
            }));
            let passReal = dep(myLofterHolderReal.addReal('pass', {
              Geom: { shape: 'oval', anchor: 'br', z: 1, w: '10vmin', h: '10vmin' },
              Text: { size: ts00, text: 'Pass' },
              Decal: { colour: '#ffffff20' }
            }));
            let resignReal = dep(myLofterHolderReal.addReal('resign', {
              Geom: { shape: 'oval', anchor: 'br', z: 1, w: '10vmin', h: '10vmin', y: '10vmin' },
              Text: { size: ts00, text: 'Resign' },
              Decal: { colour: '#ff808020', windowing: false }
            }));
            dep(TimerSrc({ ms: 500, num: Infinity })).route(() => {
              
              let elapsed = (Date.now() - round.getValue('ms'));
              let total = moveMs - 2000; // Subtracting an amount makes the timer feel generous (TODO: Can be funky for very low `moveMs` values??)
              let amt = 1 - Math.min(1, elapsed / total);
              
              timeBarReal.mod({ w: `${Math.round(amt * 100)}%` });
              
            }, 'prm');
            /// =BELOW}
            
            dep.scp(roundMoveChooser.srcs.off, (noRoundMove, dep) => {
              
              let submitMoveAct = dep(enableAction('submitMove', async move => {
                
                /// {ABOVE=
                
                let { type='play' } = move;
                if (type === 'pass') return addRecord('roundMove', { 0: round, 1: matchLofter, 'piece?': null });
                
                let { trg } = move;
                if (!trg) throw Error(`Api: must supply "trg"`).mod({ move });
                
                let { piece: pieceUid } = move;
                let pieces = await match.withRh('piece', 'all');
                let piece = pieces.find(piece => piece.uid === pieceUid).val;
                
                if (!piece) throw Error(`Api: invalid piece uid`).mod({ move });
                if (piece.getValue('wait') > 0) throw Error(`Api: piece must wait`).mod({ move });
                
                let vm = getValidMoves(makeBoard(pieces), matchLofter, piece)
                  .find(vm => vm.col === trg.col && vm.row === trg.row)
                  .val;
                
                // Ensure the provided move is a valid move
                if (!vm) throw Error(`Api: invalid move!`);
                
                let { col, row, cap } = vm;
                
                addRecord('roundMove', { 0: round, 1: matchLofter, 'piece?': piece }, { col, row, cap: !!cap });
                
                /// =ABOVE}
                
              }));
              
              /// {BELOW=
              dep(passReal.addLayout('Press', { pressFn: () => submitMoveAct.act({ type: 'pass' }) }));
              
              let feelSrc = MemSrc();
              dep(resignReal.addLayout('Feel', { feelSrc }));
              dep.scp(feelSrc, (feel, dep) => {
                
                let holdReal = dep(resignReal.addReal('hold', {
                  
                  Geom: { shape: 'oval', anchor: 'mid', z: -1 },
                  Decal: { transition: {
                    colour: { ms: 2000, curve: 'linear' },
                    loc:    { ms: 2000, curve: 'linear' },
                    size:   { ms: 2000, curve: 'linear' }
                  }},
                  w: '120%', h: '120%', colour: '#faa2'
                  
                }));
                
                dep(TimerSrc({ ms: 100 }))
                  .route(() => holdReal.mod({ colour: '#c2a4', w: '200%', h: '200%' }));
                
                dep(TimerSrc({ ms: 2000 })).route(() => {
                  holdReal.end();
                  dep(resignReal.addLayout('Press', { pressFn: () => resignAct.act() }));
                  dep(resignReal.addLayout('Decal', { colour: '#c2aa' }));
                }, 'prm');
                
              });
              
              let selectedPieceSrc = Src();
              let selectedPieceChooser = dep(Chooser.noneOrSome(ToggleSrc(selectedPieceSrc)));
              dep.scp(selectedPieceChooser.srcs.off, (noSelectedPiece, dep) => {
                
                // Pieces can be selected by clicking
                dep.scp(match, 'piece', (piece, dep) => {
                  
                  // Can't select enemy pieces
                  if (piece.getValue('colour') !== myColour) return;
                  
                  let real = pieceReals.get(piece.uid);
                  dep(real.addLayout({ form: 'Press', pressFn: () => {
                    selectedPieceSrc.send(piece);
                  }}));
                  
                });
                
              });
              dep.scp(selectedPieceChooser.srcs.onn, async (selectedPiece, dep) => {
                
                let piece = selectedPiece.val;
                let pieceReal = pieceReals.get(piece.uid);
                dep(pieceReal.addLayout('Decal', { border: { ext: '5px', colour: moveColour } }));
                
                let pieces = await match.withRh('piece', 'all');
                
                for (let { col, row, cap } of getValidMoves(makeBoard(pieces), matchLofter, piece)) {
                  
                  let optionReal = dep(boardReal.addReal('option', {
                    Geom: { anchor: 'tl', w: tileVal(1), h: tileVal(1), ...tileCoord(col, row) },
                    Press: { pressFn: () => submitMoveAct.act({ piece: piece.uid, trg: { col, row } }) }
                  }));
                  
                  optionReal.addReal('indicator', {
                    Geom: { shape: 'oval', anchor: 'mid', w: cap ? '80%' : '40%', h: cap ? '80%' : '40%' },
                    Decal: { border: cap ? { ext: '5px', colour: moveColour } : null, colour: cap ? null : moveColour }
                  });
                  
                }
                
                // Click anywhere on the board to deselect
                dep(boardReal.addLayout('Press', { pressFn: () =>  selectedPieceSrc.send(null) }));
                
              });
              /// =BELOW}
              
            });
            dep.scp(roundMoveChooser.srcs.onn, (roundMove, dep) => {
              
              let retractMoveAct = dep(enableAction('retractMove', async () => {
                
                /// {ABOVE=
                // Really this is just sanity; a move must exist due to
                // the scoping!
                let curMove = await matchLofter.withRh('roundMove', 'one'); // OR { type: 'roundMove', fn: 'all' } OR { type: 'roundMove', fn: rh => rh.getRecs() }
                if (curMove) curMove.end();
                /// =ABOVE}
                
              }));
              
              /// {BELOW=
              
              // Indicate whether "pass" is currently selected
              if (roundMove.m('piece?') === null) {
                dep(passReal.addLayout('Decal', { colour: '#ffffffa0' }));
                dep(passReal.addLayout('Press', { pressFn: () => retractMoveAct.act() }));
              }
              
              // Click anywhere on the board to cancel current move
              dep(boardReal.addLayout('Press', { pressFn: () => retractMoveAct.act() }));
              
              let movePiece = roundMove.m('piece?');
              if (!movePiece) return;
              
              let pieceReal = pieceReals.get(movePiece.uid);
              
              let { col, row, cap } = roundMove.getValue();
              
              dep(pieceReal.addLayout('Decal', { border: { ext: '5px', colour: moveColour } }));
              
              let moveReal = dep(boardReal.addReal('move', {
                Geom: { anchor: 'tl', w: tileVal(1), h: tileVal(1), ...tileCoord(col, row) }
              }));
              
              if (cap) {
                
                moveReal.addReal('indicator1', {
                  Geom: { shape: 'oval', anchor: 'mid', w: '95%', h: '95%' },
                  Decal: { border: { ext: '2px', colour: moveColour } }
                });
                moveReal.addReal('indicator2', {
                  Geom: { shape: 'oval', anchor: 'mid', w: '80%', h: '80%' },
                  Decal: { border: { ext: '4px', colour: moveColour } }
                });
                
              } else {
                
                moveReal.addReal('indicator1', {
                  Geom: { shape: 'oval', anchor: 'mid', w: '50%', h: '50%' },
                  Decal: { border: { ext: '2px', colour: moveColour } }
                });
                moveReal.addReal('indicator2', {
                  Geom: { shape: 'oval', anchor: 'mid', w: '35%', h: '35%' },
                  Decal: { colour: moveColour }
                });
                
              }
              
              /// =BELOW}
              
            });
            
          })
        
        });
        
      };
      
      let paneReal = dep(mainReal.addReal('pane', {
        Geom: { w: '80%', h: '80%', anchor: 'mid' },
        Decal: { colour: 'rgba(120, 120, 170, 1)' }
      }));
      
      let lofterExistsChooser = dep(Chooser.noneOrSome(lofterRh));
      dep.scp(lofterExistsChooser.srcs.off, (noLofter, dep) => nodeLofterless(dep, paneReal, chess2));
      dep.scp(lofterExistsChooser.srcs.onn, (lofter, dep) => {
        
        let changeStatusAct = dep(enableAction('changeStatus', async msg => {
          
          /// {ABOVE=
          let { status=null } = msg ?? {};
          if (![ 'chill', 'learn', 'queue' ].has(status)) throw Error('Invalid status!');
          if (status === lofter.getValue('status')) return;
          
          sc(`Lofter "${lofter.getValue('term')}" status: "${lofter.getValue('status')}" -> "${status}"`);
          
          lofter.setValue({ status });
          /// =ABOVE}
          
        }));
        
        dep.scp(lofter, 'lofterStatus', (status, dep) => {
          
          let type = status.getValue('type');
          if (type === 'chill') nodeChill(dep, paneReal, { lofter, changeStatusAct });
          if (type === 'learn') nodeLearn(dep, paneReal, { lofter, status, changeStatusAct });
          if (type === 'queue') nodeQueue(dep, paneReal, { lofter, status, changeStatusAct });
          if (type === 'match') dep.scp(status, 'matchLofter', (matchLofter, dep) => {
            
            paneReal.mod({ w: '100%', h: '100%' });
            dep(() => paneReal.mod({ w: skip, h: skip }));
            nodeMatch(dep, paneReal, { matchLofter, changeStatusAct });
            
          });
          
        });
        
      });
      
    },
    
    /// {LOADTEST=
    loadtestConf: {
      
      fn: ({ belowHut, loft, lofter, dep }) => {
        
        let randInt = (min, max) => min + Math.floor(Math.random() * (max - min));
        let randPick = arr => arr[randInt(0, arr.length)];
        let randomWeight = opts => {
          
          let total = opts.reduce((m, opt) => m + opt.weight, 0);
          let rand = Math.random() * total;
          
          let amt = 0;
          for (let opt of opts) {
            if (rand >= amt && rand < amt + opt.weight) return opt.val;
            amt += opt.weight;
          }
          
        };
        
        // Different automated Belows move at different rates
        let ms = 800 + Math.floor(Math.random() * 400);
        dep(TimerSrc({ ms, num: Infinity })).route(async () => {
          
          let lofterStatus = await lofter.withRh('lofterStatus', 'one');
          if (!lofterStatus) return;
          
          let status = lofterStatus.getValue('status');
          
          let actions = belowHut.loadtestActions.toObj(act => [ act.command, act ]);
          if (status === 'chill' && actions.has('c2.changeStatus')) {
            
            actions['c2.changeStatus'].act({ status: randomWeight([
              { weight: 1, val: 'learn' },
              { weight: 4, val: 'queue' }
            ])});
            
          } else if (status === 'learn') {
            
            actions['c2.changeStatus'].act({ status: randomWeight([
              { weight: 1, val: 'chill' },
            ])});
            
          } else if (status === 'queue') {
            
            let queue = await lofterStatus.withRh('queue', 'one');
            if (queue) {
              
              let action = randomWeight([
                { weight:  1, val: 'back' },
                { weight: 10, val: 'stay' }
              ]);
              if      (action === 'back') actions['c2.leaveQueue'].act();
              else if (action === 'stay') { /* Do nothing */ }
              
            } else {
              
              let action = randomWeight([
                { weight: 1, val: 'back' },
                { weight: 3, val: 'play' },
              ]);
              if      (action === 'back') actions['c2.changeStatus'].act({ status: 'chill' });
              else if (action === 'play') actions['c2.enterQueue'].act({ term: '' });
              
            }
            
          } else if (status === 'match') {
            
            let matchLofter = await lofterStatus.withRh('matchLofter', 'one');
            let roundMove = await matchLofter.withRh('roundMove', 'one');
            let match = matchLofter.m('match');
            
            let outcome = await match.withRh('outcome', 'one');
            if (outcome) {
              
              let action = randomWeight([
                { weight:  1, val: 'play' },
                { weight: 10, val: 'wait' }
              ]);
              
              if      (action === 'wait') { /* Do nothing */ }
              else if (action === 'play') actions['c2.changeStatus'].act({ status: 'queue' });
              
            } else {
              
              if (roundMove) {
                
                let action = randomWeight([
                  { weight: 1, val: 'retract' },
                  { weight: 2, val: 'hold' },
                ]);
                if      (action === 'retract') actions['c2.retractMove']?.act();
                else if (action === 'hold')    { /* Do nothing */ }
                
              } else {
                
                let action = randomWeight([
                  { weight:   1, val: 'resign' },
                  { weight:   3, val: 'pass' },
                  { weight:  60, val: 'think' },
                  { weight: 150, val: 'play' },
                ]);
                
                if (action === 'resign' && actions['c2.resign']) {
                  
                  actions['c2.resign'].act();
                  
                } else if (action === 'pass' && actions['c2.submitMove']) {
                  
                  actions['c2.submitMove'].act({ type: 'pass' });
                  
                } else if (action === 'play' && actions['c2.submitMove']) {
                  
                  let myColour = matchLofter.getValue('colour');
                  let pieces = await match.withRh('piece', 'all');
                  let board = makeBoard(pieces);
                  
                  pieces = [ ...pieces ].filter(piece => piece.getValue('colour') === myColour)
                    .sort(() => Math.random() - 0.6)
                    .sort(() => Math.random() - 0.4)
                    .sort(() => Math.random() - 0.5);
                  
                  let decision = null;
                  for (let piece of pieces) {
                    let validMoves = getValidMoves(board, matchLofter, piece);
                    validMoves.each(v => v.cap = v.cap?.getValue() ?? null);
                    if (!validMoves.length) continue;
                    
                    decision = { piece, ...randPick(validMoves) };
                    break;
                  }
                  
                  if (!decision) {
                    
                    actions['c2.submitMove'].act({ type: 'pass' });
                    
                  } else {
                    
                    let { piece, col, row } = decision;
                    actions['c2.submitMove'].act({ piece: piece.uid, trg: { col, row } });
                    
                  }
                  
                } else if (action === 'think') {
                  
                  // Do nothing
                  
                }
                
              }
              
            }
            
          }
          
        });
        
      }
      
    }
    /// =LOADTEST}
  });
  
};
