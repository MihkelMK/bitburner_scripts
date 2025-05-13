interface GoMove {
  x: number;
  y: number;
}

interface GoConfig {
  simulations: number; // Number of simulations per move (lower = faster, higher = better)
  searchDepth: number; // Max steps in each simulation (lower = faster)
  explorationWeight: number; // UCB exploration parameter
  sleepBetweenSims: number; // Sleep time (ms) between simulations to prevent freezing
}

/**
 * Find a move that threatens opponent stones by reducing their liberties
 * @param board - Current board state
 * @param validMoves - Grid of valid moves
 * @param liberties - Grid of liberty counts
 * @returns Threatening move or null
 */
function findThreatMove(
  board: string[],
  validMoves: boolean[][],
  liberties: number[][]
): GoMove | null {
  const size = board.length;

  // Look for opponent chains with only two liberties
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      // Check if this is an opponent's piece with exactly 2 liberties
      if (board[x][y] === 'O' && liberties[x][y] === 2) {
        // Find one of the liberty positions by checking adjacent points
        const directions = [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ];

        for (const [dx, dy] of directions) {
          const nx = x + dx;
          const ny = y + dy;

          // Check bounds
          if (nx >= 0 && nx < size && ny >= 0 && ny < board[nx].length) {
            // Check if this is an empty point and a valid move
            if (board[nx][ny] === '.' && validMoves[nx][ny]) {
              // Make sure this move doesn't endanger our own chains
              if (!endangersOurChains(board, liberties, nx, ny)) {
                return { x: nx, y: ny };
              }
            }
          }
        }
      }
    }
  }

  return null;
}

/**
 * Find a move that expands our territory
 * @param board - Current board state
 * @param validMoves - Grid of valid moves
 * @returns Territory expansion move or null
 */
function findExpansionMove(
  board: string[],
  validMoves: boolean[][]
): GoMove | null {
  const size = board.length;

  // Choose expansion moves that maximize future liberties
  // Try to find a move that connects to our existing chains and has multiple empty neighbors
  let bestMove = null;
  let maxEmptyNeighbors = -1;

  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      if (validMoves[x][y]) {
        // Check if this move is adjacent to our existing stones
        const directions = [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ];
        let adjacentToOurs = false;
        let emptyNeighbors = 0;

        for (const [dx, dy] of directions) {
          const nx = x + dx;
          const ny = y + dy;

          // Check bounds
          if (nx >= 0 && nx < size && ny >= 0 && ny < board[nx].length) {
            if (board[nx][ny] === 'X') {
              adjacentToOurs = true;
            } else if (board[nx][ny] === '.') {
              emptyNeighbors++;
            }
          }
        }

        // If adjacent to our stones and has more empty neighbors than current best
        if (adjacentToOurs && emptyNeighbors > maxEmptyNeighbors) {
          maxEmptyNeighbors = emptyNeighbors;
          bestMove = { x, y };
        }
      }
    }
  }

  return bestMove;
}

/**
 * Check if a move would endanger our own chains
 * @param board - Current board state
 * @param liberties - Grid of liberty counts
 * @param x - X coordinate
 * @param y - Y coordinate
 * @returns True if the move would endanger our chains
 */
function endangersOurChains(
  board: string[],
  liberties: number[][],
  x: number,
  y: number
): boolean {
  const size = board.length;
  const directions = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];

  // Check if this move would reduce any of our chains to 1 liberty
  for (const [dx, dy] of directions) {
    const nx = x + dx;
    const ny = y + dy;

    // Check bounds
    if (nx >= 0 && nx < size && ny >= 0 && ny < board[nx].length) {
      // If adjacent to our stone with only 2 liberties
      // (would become 1 liberty after our move)
      if (board[nx][ny] === 'X' && liberties[nx][ny] === 2) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if there are potential captures that we should pursue
 * @param board - Current board state
 * @param liberties - Grid of liberty counts
 * @returns True if potential captures exist
 */
function hasPotentialCaptures(board: string[], liberties: number[][]) {
  const size = board.length;

  // Look for opponent chains with 2 or fewer liberties
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      // Check if this is an opponent's piece with 2 or fewer liberties
      if (board[x][y] === 'O' && liberties[x][y] <= 2) {
        return true;
      }
    }
  }

  return false;
}

export async function main(ns: NS) {
  // Disable logs and clear terminal
  ns.disableLog('ALL');
  ns.clearLog();
  ns.print('Lightweight IPvGO MCTS Bot Starting...');

  // Config - adjust these parameters to balance performance vs effectiveness
  const config: GoConfig = {
    simulations: 50,
    searchDepth: 5,
    explorationWeight: 1.5,
    sleepBetweenSims: 5,
  };

  ns.print(`Config: ${JSON.stringify(config)}`);

  // Keep playing games continuously
  while (true) {
    // Reset the board for a new game against Netburners with 7x7 grid
    ns.go.resetBoardState('Netburners', 7);
    ns.print('Starting new game against Netburners on 7x7 grid');

    // Play the current game until completion
    await playGame(ns, config);

    // Wait before starting a new game
    await ns.sleep(1000);
  }
}

/**
 * Play a single game of IPvGO
 * @param ns - Netscript interface
 * @param config - Configuration parameters
 */
async function playGame(ns: NS, config: GoConfig) {
  let result: GoMove & { type: 'move' | 'pass' | 'gameOver' };
  let moveCount = 0;

  let opponentPassed = false;

  do {
    moveCount++;
    ns.print(`Turn ${moveCount}`);

    // Get the current board state and valid moves
    const board = ns.go.getBoardState();
    const validMoves = ns.go.analysis.getValidMoves();
    const liberties = ns.go.analysis.getLiberties();
    const player = ns.go.getCurrentPlayer();
    const state = ns.go.getGameState();

    // Count pins on the board
    let playerPinCount = 0;
    let opponentPinCount = 0;
    for (const column of board) {
      for (const cell of column) {
        if (cell === 'X') playerPinCount++;
        else if (cell === 'O') opponentPinCount++;
      }
    }

    // Calculate empty spaces and board coverage
    const boardSize = board.length;
    const totalSpaces = boardSize * boardSize;
    const filledSpaces = playerPinCount + opponentPinCount;
    const boardCoverage = filledSpaces / totalSpaces;

    const playerScore =
      player === 'White' ? state.whiteScore : state.blackScore;
    const aiScore = player === 'White' ? state.blackScore : state.whiteScore;

    // Check if we should pass based on area scoring principles
    const shouldPass =
      // Only pass if opponent passed AND we've maximized our position
      opponentPassed &&
      // We have a significant score lead and no obvious captures remain
      ((playerScore > aiScore + 3 && !hasPotentialCaptures(board, liberties)) ||
        // Opponent has no pins left (complete victory)
        opponentPinCount === 0 ||
        // Very late game with substantial advantage
        (boardCoverage > 0.9 && playerPinCount > opponentPinCount * 2));

    if (shouldPass) {
      ns.print(
        `Passing to secure win - Player: ${playerScore}, Opponent: ${aiScore}, Coverage: ${Math.round(boardCoverage * 100)}%`
      );
      result = await ns.go.passTurn();
    } else {
      // Find best move using simplified MCTS
      const move = await findBestMove(ns, board, validMoves, liberties, config);

      // Make the selected move or pass if no moves are available
      if (move) {
        ns.print(`Playing move at [${move.x}, ${move.y}]`);
        result = await ns.go.makeMove(move.x, move.y);
      } else {
        ns.print('Passing turn - no good moves available');
        result = await ns.go.passTurn();
      }
    }

    // Track if opponent passed
    opponentPassed = result.type === 'pass';

    // Log opponent's response
    if (result.type === 'move') {
      ns.print(`Opponent played at [${result.x}, ${result.y}]`);
    } else if (result.type === 'pass') {
      ns.print('Opponent passed their turn');
    } else if (result.type === 'gameOver') {
      ns.print('Game over!');
    }

    // Wait for opponent's next turn
    await ns.go.opponentNextTurn();

    // Add a small delay between moves
    await ns.sleep(200);
  } while (result?.type !== 'gameOver');

  // Game stats
  const player = ns.go.getCurrentPlayer();
  const state = ns.go.getGameState();
  const playerScore = player === 'White' ? state.whiteScore : state.blackScore;
  const aiScore = player === 'White' ? state.blackScore : state.whiteScore;
  ns.print(`Game finished! Score - You: ${playerScore}, Opponent: ${aiScore}`);

  return state;
}

/**
 * Find the best move using a lightweight MCTS implementation
 * @param ns - Netscript interface
 * @param board - Current board state
 * @param validMoves - Grid of valid moves
 * @param liberties - Grid of liberty counts
 * @param config - Configuration parameters
 * @returns The best move as {x, y} or null to pass
 */
async function findBestMove(
  ns: NS,
  board: string[],
  validMoves: boolean[][],
  liberties: number[][],
  config: GoConfig
): Promise<GoMove | null> {
  // First, try to make critical moves without using MCTS

  // 1. Check if we can capture an opponent's chain
  const captureMove = findCaptureMove(board, validMoves, liberties);
  if (captureMove) {
    ns.print('Found capture move!');
    return captureMove;
  }

  // 2. Check if we need to defend one of our chains
  const defendMove = findDefendMove(board, validMoves, liberties);
  if (defendMove) {
    ns.print('Found defensive move!');
    return defendMove;
  }

  // 3. Check for near-capture moves (opponent chains with 2 liberties)
  const threatMove = findThreatMove(board, validMoves, liberties);
  if (threatMove) {
    ns.print("Found threatening move to reduce opponent's liberties!");
    return threatMove;
  }

  // 4. Check for territory expansion
  const expansionMove = findExpansionMove(board, validMoves);
  if (expansionMove) {
    ns.print('Found territory expansion move!');
    return expansionMove;
  }

  // Collect all potential moves
  const moves = [];
  for (let x = 0; x < validMoves.length; x++) {
    for (let y = 0; y < validMoves[x].length; y++) {
      if (validMoves[x][y]) {
        moves.push({ x, y });
      }
    }
  }

  // If no valid moves, pass
  if (moves.length === 0) return null;

  // If only one valid move, return it
  if (moves.length === 1) return moves[0];

  // Initialize move statistics
  const moveStats = {};
  for (const move of moves) {
    const key = `${move.x},${move.y}`;
    moveStats[key] = { visits: 0, wins: 0 };
  }

  // Run Monte Carlo simulations
  for (let i = 0; i < config.simulations; i++) {
    // Pick a move to simulate based on UCB
    const move = selectMoveUCB(moves, moveStats, config.explorationWeight, i);
    const key = `${move.x},${move.y}`;

    // Run a simulation for this move
    const win = simulateGame(board, move);

    // Update move statistics
    moveStats[key].visits++;
    moveStats[key].wins += win;

    // Add a small sleep to prevent freezing the game
    if (config.sleepBetweenSims > 0) {
      await ns.sleep(config.sleepBetweenSims);
    }
  }

  // Select the best move based on win rate
  let bestMove = null;
  let bestScore = -Infinity;

  for (const move of moves) {
    const key = `${move.x},${move.y}`;
    const stats = moveStats[key];

    // Calculate win rate or use visits if not enough data
    const score = stats.visits > 0 ? stats.wins / stats.visits : 0;

    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  return bestMove;
}

/**
 * Select a move using UCB formula
 * @param moves - List of valid moves
 * @param moveStats - Statistics for each move
 * @param explorationWeight - UCB exploration parameter
 * @param simulationNum - Current simulation number
 * @returns Selected move
 */
function selectMoveUCB(
  moves: Array<any>,
  moveStats: object,
  explorationWeight: number,
  simulationNum: number
): GoMove {
  // Use pure exploration for the first moves to ensure all moves are tried
  if (simulationNum < moves.length) {
    return moves[simulationNum];
  }

  let bestMove = null;
  let bestUCB = -Infinity;

  // Calculate total visits for normalization
  let totalVisits = 0;
  for (const move of moves) {
    const key = `${move.x},${move.y}`;
    totalVisits += moveStats[key].visits;
  }

  // Select based on UCB
  for (const move of moves) {
    const key = `${move.x},${move.y}`;
    const stats = moveStats[key];

    // Calculate UCB score
    let ucb: number;
    if (stats.visits === 0) {
      ucb = Infinity; // Ensure unvisited nodes are tried
    } else {
      const exploitation = stats.wins / stats.visits;
      const exploration =
        explorationWeight * Math.sqrt(Math.log(totalVisits) / stats.visits);
      ucb = exploitation + exploration;
    }

    if (ucb > bestUCB) {
      bestUCB = ucb;
      bestMove = move;
    }
  }

  return bestMove;
}

/**
 * Find a move that can capture an opponent's chain
 * @param board - Current board state
 * @param validMoves - Grid of valid moves
 * @param liberties - Grid of liberty counts
 * @returns Capture move or null
 */
function findCaptureMove(
  board: string[],
  validMoves: boolean[][],
  liberties: number[][]
): GoMove | null {
  const size = board.length;

  // Look for opponent chains with only one liberty
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      // Check if this is an opponent's piece with exactly 1 liberty
      if (board[x][y] === 'O' && liberties[x][y] === 1) {
        // Find the liberty position by checking adjacent points
        const directions = [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ];

        for (const [dx, dy] of directions) {
          const nx = x + dx;
          const ny = y + dy;

          // Check bounds
          if (nx >= 0 && nx < size && ny >= 0 && ny < board[nx].length) {
            // Check if this is an empty point and a valid move
            if (board[nx][ny] === '.' && validMoves[nx][ny]) {
              return { x: nx, y: ny };
            }
          }
        }
      }
    }
  }

  return null;
}

/**
 * Find a move to defend one of our threatened chains
 * @param {string[]} board - Current board state
 * @param {boolean[][]} validMoves - Grid of valid moves
 * @param {number[][]} liberties - Grid of liberty counts
 * @returns {Object|null} Defensive move or null
 */
function findDefendMove(
  board: string[],
  validMoves: boolean[][],
  liberties: number[][]
): GoMove | null {
  const size = board.length;

  // Look for our chains with only one liberty
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      // Check if this is our piece with exactly 1 liberty
      if (board[x][y] === 'X' && liberties[x][y] === 1) {
        // Find the liberty position by checking adjacent points
        const directions = [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ];

        for (const [dx, dy] of directions) {
          const nx = x + dx;
          const ny = y + dy;

          // Check bounds
          if (nx >= 0 && nx < size && ny >= 0 && ny < board[nx].length) {
            // Check if this is an empty point and a valid move
            if (board[nx][ny] === '.' && validMoves[nx][ny]) {
              return { x: nx, y: ny };
            }
          }
        }
      }
    }
  }

  return null;
}

/**
 * Simulate a random game from a given move
 * @param board - Current board state
 * @param firstMove - First move to make
 * @returns Score between 0 and 1, higher is better
 */
function simulateGame(board: string[], firstMove: GoMove): number {
  const x = firstMove.x;
  const y = firstMove.y;
  const size = board.length;
  let score = 0.5; // Base score

  // Area scoring principles (from user's info):
  // 1. All stones count as territory
  // 2. Stones are only removed if captured
  // 3. Need to actually capture opponent's stones to remove them

  // Check if this move captures opponent stones
  if (isCapturingMove(board, x, y)) {
    score += 0.3; // Heavy bonus for capturing moves
  }

  // Check if it reduces opponent liberties (potential future capture)
  if (reducesOpponentLiberties(board, x, y)) {
    score += 0.2;
  }

  // Check if it's an expanding move that connects to our existing stones
  if (isExpandingMove(board, x, y)) {
    score += 0.15;
  }

  // Prefer moves that have multiple empty neighbors (more liberties)
  const directions = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  let emptyNeighbors = 0;

  for (const [dx, dy] of directions) {
    const nx = x + dx;
    const ny = y + dy;

    if (nx >= 0 && nx < size && ny >= 0 && ny < board[nx].length) {
      if (board[nx][ny] === '.') {
        emptyNeighbors++;
      }
    }
  }

  // Bonus for moves with more empty neighbors (0-4 neighbors)
  score += 0.05 * emptyNeighbors;

  // Slight preference for center positions over edges
  const centerDistance = Math.abs(x - size / 2) + Math.abs(y - size / 2);
  const normalizedDistance = centerDistance / (size - 1);
  score -= 0.1 * normalizedDistance; // Penalty for edge positions

  return Math.max(0, Math.min(1, score)); // Ensure score stays between 0 and 1
}

/**
 * Check if a move reduces opponent's liberties
 * @param board - Current board state
 * @param x - X coordinate
 * @param  y - Y coordinate
 * @returns True if it reduces opponent liberties
 */
function reducesOpponentLiberties(
  board: string[],
  x: number,
  y: number
): boolean {
  const size = board.length;
  const directions = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];

  for (const [dx, dy] of directions) {
    const nx = x + dx;
    const ny = y + dy;

    if (nx >= 0 && nx < size && ny >= 0 && ny < board[nx].length) {
      // If adjacent to opponent stone
      if (board[nx][ny] === 'O') {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if a move would capture opponent stones
 * @param board - Current board state
 * @param x - X coordinate
 * @param y - Y coordinate
 * @returns True if capturing
 */
function isCapturingMove(board: string[], x: number, y: number): boolean {
  const size = board.length;
  const directions = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];

  // Check each adjacent point
  for (const [dx, dy] of directions) {
    const nx = x + dx;
    const ny = y + dy;

    // Check bounds
    if (nx >= 0 && nx < size && ny >= 0 && ny < board[nx].length) {
      // If adjacent to opponent stone, might be a capturing move
      if (board[nx][ny] === 'O') {
        // Basic check - not a full liberty count calculation
        // In a real implementation, you would check if the opponent group has only one liberty
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if a move expands our territory by connecting to existing stones
 * @param board - Current board state
 * @param x - X coordinate
 * @param y - Y coordinate
 * @returns True if it's an expanding move
 */
function isExpandingMove(board: string[], x: number, y: number): boolean {
  const size = board.length;
  const directions = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];

  // Check each adjacent point
  for (const [dx, dy] of directions) {
    const nx = x + dx;
    const ny = y + dy;

    // Check bounds
    if (nx >= 0 && nx < size && ny >= 0 && ny < board[nx].length) {
      // If adjacent to our stone, it's an expanding move
      if (board[nx][ny] === 'X') {
        return true;
      }
    }
  }

  return false;
}
