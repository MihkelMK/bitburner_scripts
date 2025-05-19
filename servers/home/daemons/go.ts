import { GoOpponent } from '@/NetscriptDefinitions';
import {
  disable_logs,
  notify,
  TAIL_BODY_FONT_SIZE,
  TAIL_HEIGHT_MULT,
  TAIL_TITLEBAR_OFFSET,
} from '../helpers/cli';
import { IPVGO_MONITOR_PORT } from '../helpers/ports';
import { setupMonitor } from '../utils/port_monitor';

interface GoMove {
  x: number;
  y: number;
}

interface GoConfig {
  simulations: number;
  searchDepth: number;
  explorationWeight: number;
  sleepBetweenSims: number;
  useTerritory: boolean;
  usePatterns: boolean;
}

/**
 * Gets all stones in a connected group and counts its unique liberties.
 */
function getGroupAndLiberties(
  board: string[],
  startX: number,
  startY: number,
  player: string | null = null
): { stones: GoMove[]; liberties: GoMove[]; uniqueLiberties: number } | null {
  const R = board.length;
  const C = board[0].length;
  const groupPlayer = player || board[startX][startY];

  if (
    groupPlayer === '.' ||
    startX < 0 ||
    startX >= R ||
    startY < 0 ||
    startY >= C
  ) {
    return null;
  }
  if (board[startX][startY] !== groupPlayer && player !== null) {
    return null;
  }

  const q: GoMove[] = [{ x: startX, y: startY }];
  const visitedStones: boolean[][] = Array(R)
    .fill(null)
    .map(() => Array(C).fill(false));
  const groupStones: GoMove[] = [];
  const libertyPoints: GoMove[] = [];
  const libertySet = new Set<string>();

  visitedStones[startX][startY] = true;

  let head = 0;
  while (head < q.length) {
    const { x, y } = q[head++];
    groupStones.push({ x, y });

    const directions = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ];
    for (const [dx, dy] of directions) {
      const nx = x + dx;
      const ny = y + dy;

      if (nx >= 0 && nx < R && ny >= 0 && ny < C) {
        if (board[nx][ny] === '.') {
          const libertyKey = `${nx},${ny}`;
          if (!libertySet.has(libertyKey)) {
            libertySet.add(libertyKey);
            libertyPoints.push({ x: nx, y: ny });
          }
        } else if (board[nx][ny] === groupPlayer && !visitedStones[nx][ny]) {
          visitedStones[nx][ny] = true;
          q.push({ x: nx, y: ny });
        }
      }
    }
  }
  return {
    stones: groupStones,
    liberties: libertyPoints,
    uniqueLiberties: libertySet.size,
  };
}

/**
 * Checks if a move by playerToMove at (x,y) captures any opponent groups.
 */
function checkActualCaptures(
  board: string[],
  x: number,
  y: number,
  playerToMove: 'X' | 'O'
): { captured: boolean; capturedGroups: GoMove[][] } {
  const R = board.length;
  const C = board[0].length;
  const opponentPlayer = playerToMove === 'X' ? 'O' : 'X';
  let capturedAny = false;
  const allCapturedGroups: GoMove[][] = [];

  // Create a temporary board with the new move
  const tempBoardWithMove = board.map((row, rIdx) =>
    rIdx === x ? row.substring(0, y) + playerToMove + row.substring(y + 1) : row
  );

  const directions = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  const checkedOpponentGroups = new Set<string>();

  for (const [dx, dy] of directions) {
    const adjX = x + dx;
    const adjY = y + dy;

    if (
      adjX >= 0 &&
      adjX < R &&
      adjY >= 0 &&
      adjY < C &&
      tempBoardWithMove[adjX][adjY] === opponentPlayer
    ) {
      const groupInfo = getGroupAndLiberties(
        tempBoardWithMove,
        adjX,
        adjY,
        opponentPlayer
      );
      if (groupInfo && groupInfo.uniqueLiberties === 0) {
        const groupKey = groupInfo.stones
          .map((s) => `${s.x},${s.y}`)
          .sort()
          .join('-');
        if (!checkedOpponentGroups.has(groupKey)) {
          capturedAny = true;
          allCapturedGroups.push(groupInfo.stones);
          checkedOpponentGroups.add(groupKey);
        }
      }
    }
  }
  return { captured: capturedAny, capturedGroups: allCapturedGroups };
}

/**
 * Checks if a move is a "bad" self-atari.
 */
function isBadSelfAtari(
  board: string[],
  x: number,
  y: number,
  playerToMove: 'X' | 'O'
): boolean {
  // Create a board with our move placed
  const boardWithOurMove = board.map((row, rIdx) =>
    rIdx === x ? row.substring(0, y) + playerToMove + row.substring(y + 1) : row
  );

  const groupInfoAfterOurMove = getGroupAndLiberties(
    boardWithOurMove,
    x,
    y,
    playerToMove
  );

  if (groupInfoAfterOurMove && groupInfoAfterOurMove.uniqueLiberties === 1) {
    // Our group is in atari. Is it bad?
    const captureDetails = checkActualCaptures(board, x, y, playerToMove);

    if (!captureDetails.captured) {
      return true; // Self-atari without making any captures. Definitely bad.
    } else {
      // It's self-atari AND a capture. Check if the atari resolves after captures.
      let boardAfterCaptures = board.map((r, rIdx) =>
        rIdx === x ? r.substring(0, y) + playerToMove + r.substring(y + 1) : r
      );
      captureDetails.capturedGroups.forEach((group) => {
        group.forEach((stone) => {
          boardAfterCaptures[stone.x] =
            boardAfterCaptures[stone.x].substring(0, stone.y) +
            '.' +
            boardAfterCaptures[stone.x].substring(stone.y + 1);
        });
      });

      const groupInfoOnBoardAfterCaptures = getGroupAndLiberties(
        boardAfterCaptures,
        x,
        y,
        playerToMove
      );
      if (
        groupInfoOnBoardAfterCaptures &&
        groupInfoOnBoardAfterCaptures.uniqueLiberties === 1
      ) {
        return true; // Still in atari even after captures (e.g., snapback). Bad.
      }
    }
  }
  return false;
}

/**
 * Applies a move to the board, resolves captures, and checks for basic suicide.
 */
function applyMoveAndResolveCaptures(
  boardBeforeMove: string[],
  move: GoMove,
  player: 'X' | 'O'
): string[] | null {
  let newBoard = boardBeforeMove.map((row) => row);
  const R = newBoard.length;
  const C = newBoard[0].length;

  if (
    move.x < 0 ||
    move.x >= R ||
    move.y < 0 ||
    move.y >= C ||
    newBoard[move.x][move.y] !== '.'
  ) {
    return null;
  }

  newBoard[move.x] =
    newBoard[move.x].substring(0, move.y) +
    player +
    newBoard[move.x].substring(move.y + 1);

  const captureDetails = checkActualCaptures(
    boardBeforeMove,
    move.x,
    move.y,
    player
  );

  if (captureDetails.captured) {
    captureDetails.capturedGroups.forEach((group) => {
      group.forEach((stone) => {
        newBoard[stone.x] =
          newBoard[stone.x].substring(0, stone.y) +
          '.' +
          newBoard[stone.x].substring(stone.y + 1);
      });
    });
  } else {
    const groupInfoOfPlacedStone = getGroupAndLiberties(
      newBoard,
      move.x,
      move.y,
      player
    );
    if (
      groupInfoOfPlacedStone &&
      groupInfoOfPlacedStone.uniqueLiberties === 0
    ) {
      return null;
    }
  }
  return newBoard;
}

/**
 * Gets valid moves for a player on a given board state during simulation.
 */
function getValidMovesForSimulation(
  currentSimBoard: string[],
  playerForThisTurn: 'X' | 'O',
  R: number,
  C: number
): GoMove[] {
  const moves: GoMove[] = [];
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      if (currentSimBoard[r][c] === '.') {
        const boardAfterHypotheticalMove = applyMoveAndResolveCaptures(
          currentSimBoard,
          { x: r, y: c },
          playerForThisTurn
        );
        if (boardAfterHypotheticalMove !== null) {
          moves.push({ x: r, y: c });
        }
      }
    }
  }
  return moves;
}

/**
 * Find a move that threatens opponent stones by reducing their liberties
 */
function findThreatMove(
  board: string[],
  validMoves: boolean[][]
): GoMove | null {
  const size = board.length;
  const playerChar = 'X';

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] === 'O') {
        const groupInfo = getGroupAndLiberties(board, r, c, 'O');
        if (groupInfo && groupInfo.uniqueLiberties === 2) {
          for (const lib of groupInfo.liberties) {
            if (validMoves[lib.x][lib.y]) {
              if (!isBadSelfAtari(board, lib.x, lib.y, playerChar)) {
                return { x: lib.x, y: lib.y };
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
 * NEW: Estimate territory control for evaluating board positions
 * @returns An array with scores for each player's territory
 */
function estimateTerritory(board: string[]): { X: number; O: number } {
  const size = board.length;
  const visited: boolean[][] = Array(size)
    .fill(null)
    .map(() => Array(size).fill(false));
  const territory = { X: 0, O: 0 };

  // For each empty point, determine if it's surrounded by one player
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] === '.' && !visited[r][c]) {
        const emptyGroup = floodFillEmptySpace(board, r, c, visited);
        const surroundingPlayers = checkSurroundingPlayers(board, emptyGroup);

        // If surrounded by only one player, it's that player's territory
        if (surroundingPlayers.X && !surroundingPlayers.O) {
          territory.X += emptyGroup.length;
        } else if (!surroundingPlayers.X && surroundingPlayers.O) {
          territory.O += emptyGroup.length;
        }
      }
    }
  }

  return territory;
}

/**
 * Flood fill to find connected empty points
 */
function floodFillEmptySpace(
  board: string[],
  startX: number,
  startY: number,
  visited: boolean[][]
): GoMove[] {
  const size = board.length;
  const emptyGroup: GoMove[] = [];
  const queue: GoMove[] = [{ x: startX, y: startY }];
  visited[startX][startY] = true;

  while (queue.length > 0) {
    const { x, y } = queue.shift()!;
    emptyGroup.push({ x, y });

    const directions = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ];
    for (const [dx, dy] of directions) {
      const nx = x + dx;
      const ny = y + dy;

      if (
        nx >= 0 &&
        nx < size &&
        ny >= 0 &&
        ny < size &&
        board[nx][ny] === '.' &&
        !visited[nx][ny]
      ) {
        visited[nx][ny] = true;
        queue.push({ x: nx, y: ny });
      }
    }
  }

  return emptyGroup;
}

/**
 * Check which players surround an empty group
 */
function checkSurroundingPlayers(
  board: string[],
  emptyGroup: GoMove[]
): { X: boolean; O: boolean } {
  const size = board.length;
  const surrounding = { X: false, O: false };

  for (const { x, y } of emptyGroup) {
    const directions = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ];
    for (const [dx, dy] of directions) {
      const nx = x + dx;
      const ny = y + dy;

      if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
        if (board[nx][ny] === 'X') {
          surrounding.X = true;
        } else if (board[nx][ny] === 'O') {
          surrounding.O = true;
        }
      }
    }
  }

  return surrounding;
}

/**
 * NEW: Evaluate how good a board position is for a player
 */
function evaluateBoard(
  board: string[],
  playerToMove: 'X' | 'O',
  useTerritory: boolean = true
): number {
  const R = board.length;
  const C = board[0].length;
  const opponent = playerToMove === 'X' ? 'O' : 'X';

  // Count stones
  let playerStones = 0;
  let opponentStones = 0;
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      if (board[r][c] === playerToMove) playerStones++;
      else if (board[r][c] === opponent) opponentStones++;
    }
  }

  // Add territory evaluation
  let score = playerStones - opponentStones;

  if (useTerritory) {
    const territory = estimateTerritory(board);
    score +=
      playerToMove === 'X'
        ? territory.X - territory.O
        : territory.O - territory.X;

    // Also consider liberties (breathing space)
    let playerLiberties = 0;
    let opponentLiberties = 0;
    const visitedPlayer: boolean[][] = Array(R)
      .fill(null)
      .map(() => Array(C).fill(false));
    const visitedOpponent: boolean[][] = Array(R)
      .fill(null)
      .map(() => Array(C).fill(false));

    for (let r = 0; r < R; r++) {
      for (let c = 0; c < C; c++) {
        if (board[r][c] === playerToMove && !visitedPlayer[r][c]) {
          const group = getGroupAndLiberties(board, r, c, playerToMove);
          if (group) {
            playerLiberties += group.uniqueLiberties;
            group.stones.forEach(
              (stone) => (visitedPlayer[stone.x][stone.y] = true)
            );
          }
        } else if (board[r][c] === opponent && !visitedOpponent[r][c]) {
          const group = getGroupAndLiberties(board, r, c, opponent);
          if (group) {
            opponentLiberties += group.uniqueLiberties;
            group.stones.forEach(
              (stone) => (visitedOpponent[stone.x][stone.y] = true)
            );
          }
        }
      }
    }

    // Add liberty difference to score with a smaller weight
    score += (playerLiberties - opponentLiberties) * 0.2;
  }

  return score;
}

/**
 * NEW: Check if a move matches strategic patterns
 */
function matchesPattern(
  board: string[],
  x: number,
  y: number,
  playerChar: 'X' | 'O'
): boolean {
  const size = board.length;

  // Pattern 1: 3-3 point (corner approach)
  if (
    (x === 2 && y === 2) ||
    (x === 2 && y === size - 3) ||
    (x === size - 3 && y === 2) ||
    (x === size - 3 && y === size - 3)
  ) {
    return true;
  }

  // Pattern 2: Star point for larger boards
  if (
    size >= 9 &&
    ((x === 4 && y === 4) ||
      (x === 4 && y === size - 5) ||
      (x === size - 5 && y === 4) ||
      (x === size - 5 && y === size - 5))
  ) {
    return true;
  }

  // Pattern 3: Knight's move from our stone
  const directions = [
    [-2, -1],
    [-2, 1],
    [-1, -2],
    [-1, 2],
    [1, -2],
    [1, 2],
    [2, -1],
    [2, 1],
  ];

  for (const [dx, dy] of directions) {
    const nx = x + dx;
    const ny = y + dy;
    if (
      nx >= 0 &&
      nx < size &&
      ny >= 0 &&
      ny < size &&
      board[nx][ny] === playerChar
    ) {
      return true;
    }
  }

  // Pattern 4: Enclosure of corner
  if (
    (x <= 2 && y <= 2) ||
    (x <= 2 && y >= size - 3) ||
    (x >= size - 3 && y <= 2) ||
    (x >= size - 3 && y >= size - 3)
  ) {
    return true;
  }

  return false;
}

/**
 * NEW: Calculate influence map to evaluate territory control
 */
function calculateInfluence(board: string[]): number[][] {
  const size = board.length;
  const influence = Array(size)
    .fill(0)
    .map(() => Array(size).fill(0));

  // For each stone, spread its influence
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] !== '.') {
        const stone = board[r][c];
        const stoneValue = stone === 'X' ? 1 : -1;

        // Influence decreases with distance
        for (let dr = -3; dr <= 3; dr++) {
          for (let dc = -3; dc <= 3; dc++) {
            const nr = r + dr;
            const nc = c + dc;
            if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
              const distance = Math.abs(dr) + Math.abs(dc);
              if (distance <= 3) {
                const value = (stoneValue * (4 - distance)) / 3;
                influence[nr][nc] += value;
              }
            }
          }
        }
      }
    }
  }

  return influence;
}

/**
 * Find a move that expands our territory using influence map
 */
function findExpansionMove(
  board: string[],
  validMoves: boolean[][]
): GoMove | null {
  const size = board.length;
  const playerChar = 'X';
  let bestMove: GoMove | null = null;
  let maxScore = -Infinity;

  // Calculate influence map
  const influence = calculateInfluence(board);

  // Strategic value of board positions - corners and edges are worth more
  const strategicValue: number[][] = Array(size)
    .fill(0)
    .map(() => Array(size).fill(1));

  // Boost corners and edges
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      // Corner bonus
      if (
        (r <= 1 && c <= 1) ||
        (r <= 1 && c >= size - 2) ||
        (r >= size - 2 && c <= 1) ||
        (r >= size - 2 && c >= size - 2)
      ) {
        strategicValue[r][c] = 2.0;
      }
      // Edge bonus
      else if (r <= 1 || r >= size - 2 || c <= 1 || c >= size - 2) {
        strategicValue[r][c] = 1.5;
      }
    }
  }

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (validMoves[r][c] && !isBadSelfAtari(board, r, c, playerChar)) {
        // Calculate move score based on influence, strategic value, and pattern matching
        let moveScore = influence[r][c] * 0.5; // We want to play where we have influence

        // Boost strategic areas
        moveScore *= strategicValue[r][c];

        // Bonus for pattern matching
        if (matchesPattern(board, r, c, playerChar)) {
          moveScore += 1.0;
        }

        // Check if this move extends our groups' liberties
        const tempBoard = board.map((row, i) =>
          i === r
            ? row.substring(0, c) + playerChar + row.substring(c + 1)
            : row
        );
        const group = getGroupAndLiberties(tempBoard, r, c, playerChar);

        if (group) {
          moveScore += group.uniqueLiberties * 0.3;
        }

        if (moveScore > maxScore) {
          maxScore = moveScore;
          bestMove = { x: r, y: c };
        }
      }
    }
  }

  return bestMove;
}

/**
 * Find a move that can capture an opponent's chain
 */
function findCaptureMove(
  board: string[],
  validMoves: boolean[][],
  playerChar: 'X' | 'O'
): GoMove | null {
  const size = board.length;
  const opponentPlayer = playerChar === 'X' ? 'O' : 'X';
  const visitedOpponent: boolean[][] = Array(size)
    .fill(null)
    .map(() => Array(size).fill(false));

  // First, check for immediate captures (opponent groups with 1 liberty)
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] === opponentPlayer && !visitedOpponent[r][c]) {
        const groupInfo = getGroupAndLiberties(board, r, c, opponentPlayer);
        if (!groupInfo) continue;
        groupInfo.stones.forEach(
          (stone) => (visitedOpponent[stone.x][stone.y] = true)
        );

        if (groupInfo.uniqueLiberties === 1 && groupInfo.liberties.length > 0) {
          const capturePoint = groupInfo.liberties[0];
          if (validMoves[capturePoint.x][capturePoint.y]) {
            if (
              !isBadSelfAtari(board, capturePoint.x, capturePoint.y, playerChar)
            ) {
              return capturePoint;
            }
          }
        }
      }
    }
  }

  // Also check for large opponent groups with 2 liberties - attacking them might be valuable
  const visited2: boolean[][] = Array(size)
    .fill(null)
    .map(() => Array(size).fill(false));

  let bestAttackMove: GoMove | null = null;
  let largestGroup = 0;

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] === opponentPlayer && !visited2[r][c]) {
        const groupInfo = getGroupAndLiberties(board, r, c, opponentPlayer);
        if (!groupInfo) continue;
        groupInfo.stones.forEach(
          (stone) => (visited2[stone.x][stone.y] = true)
        );

        if (
          groupInfo.uniqueLiberties === 2 &&
          groupInfo.stones.length > largestGroup
        ) {
          // Find the better liberty to attack
          for (const lib of groupInfo.liberties) {
            if (
              validMoves[lib.x][lib.y] &&
              !isBadSelfAtari(board, lib.x, lib.y, playerChar)
            ) {
              bestAttackMove = lib;
              largestGroup = groupInfo.stones.length;
            }
          }
        }
      }
    }
  }

  return bestAttackMove;
}

/**
 * Find a move to defend one of our threatened chains
 */
function findDefendMove(
  board: string[],
  validMoves: boolean[][],
  playerChar: 'X' | 'O'
): GoMove | null {
  const size = board.length;
  const visited: boolean[][] = Array(size)
    .fill(null)
    .map(() => Array(size).fill(false));

  let bestDefensiveOption: {
    move: GoMove;
    type: 'save_1_lib' | 'improve_2_lib';
    newLibs: number;
    groupSize: number;
  } | null = null;

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] === playerChar && !visited[r][c]) {
        const groupInfo = getGroupAndLiberties(board, r, c, playerChar);
        if (!groupInfo) continue;
        groupInfo.stones.forEach((stone) => (visited[stone.x][stone.y] = true));

        // Priority 1: Save groups in atari (1 liberty)
        if (groupInfo.uniqueLiberties === 1 && groupInfo.liberties.length > 0) {
          const libertyPoint = groupInfo.liberties[0];
          if (validMoves[libertyPoint.x][libertyPoint.y]) {
            if (
              !isBadSelfAtari(board, libertyPoint.x, libertyPoint.y, playerChar)
            ) {
              const tempBoardAfterDefend = board.map((row, i) =>
                i === libertyPoint.x
                  ? row.substring(0, libertyPoint.y) +
                    playerChar +
                    row.substring(libertyPoint.y + 1)
                  : row
              );
              const newGroupInfo = getGroupAndLiberties(
                tempBoardAfterDefend,
                libertyPoint.x,
                libertyPoint.y,
                playerChar
              );
              if (newGroupInfo && newGroupInfo.uniqueLiberties > 1) {
                // This move actually increases liberties
                if (
                  !bestDefensiveOption ||
                  bestDefensiveOption.type !== 'save_1_lib' ||
                  groupInfo.stones.length > bestDefensiveOption.groupSize
                ) {
                  bestDefensiveOption = {
                    move: libertyPoint,
                    type: 'save_1_lib',
                    newLibs: newGroupInfo.uniqueLiberties,
                    groupSize: groupInfo.stones.length,
                  };
                }
              }
            }
          }
        }
        // Priority 2: Improve 2-liberty groups
        else if (groupInfo.uniqueLiberties === 2) {
          if (bestDefensiveOption && bestDefensiveOption.type === 'save_1_lib')
            continue; // Prioritize 1-lib saves

          for (const lib of groupInfo.liberties) {
            if (validMoves[lib.x][lib.y]) {
              if (!isBadSelfAtari(board, lib.x, lib.y, playerChar)) {
                const tempBoardAfterPlay = board.map((row, i) =>
                  i === lib.x
                    ? row.substring(0, lib.y) +
                      playerChar +
                      row.substring(lib.y + 1)
                    : row
                );
                const newGroupInfo = getGroupAndLiberties(
                  tempBoardAfterPlay,
                  lib.x,
                  lib.y,
                  playerChar
                );
                // We want to increase liberties significantly
                if (newGroupInfo && newGroupInfo.uniqueLiberties > 3) {
                  if (
                    !bestDefensiveOption ||
                    (bestDefensiveOption.type !== 'save_1_lib' &&
                      (newGroupInfo.uniqueLiberties >
                        bestDefensiveOption.newLibs ||
                        groupInfo.stones.length >
                          bestDefensiveOption.groupSize))
                  ) {
                    bestDefensiveOption = {
                      move: lib,
                      type: 'improve_2_lib',
                      newLibs: newGroupInfo.uniqueLiberties,
                      groupSize: groupInfo.stones.length,
                    };
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  return bestDefensiveOption ? bestDefensiveOption.move : null;
}

/**
 * Check if there are potential captures that we should pursue (for passing logic)
 */
function hasPotentialCaptures(board: string[]): boolean {
  const size = board.length;
  const visited: boolean[][] = Array(size)
    .fill(null)
    .map(() => Array(size).fill(false));

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] === 'O' && !visited[r][c]) {
        const groupInfo = getGroupAndLiberties(board, r, c, 'O');
        if (groupInfo) {
          groupInfo.stones.forEach((s) => (visited[s.x][s.y] = true));
          if (groupInfo.uniqueLiberties <= 2) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

/**
 * NEW: Prioritize strategic opening moves
 */
function findOpeningMove(
  board: string[],
  validMoves: boolean[][]
): GoMove | null {
  const size = board.length;
  const playerChar = 'X';

  // Count stones to see if we're in opening phase
  let stoneCount = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] !== '.') stoneCount++;
    }
  }

  // Only use opening strategy in the first ~5 moves
  if (stoneCount > 10) return null;

  // Opening priorities depend on board size
  const candidates: GoMove[] = [];

  // Corner approach points (3-3, 4-4, or 3-4 points)
  const cornerPoints = [];
  if (size >= 7) {
    // 3-3 points (more territorial)
    cornerPoints.push({ x: 2, y: 2 });
    cornerPoints.push({ x: 2, y: size - 3 });
    cornerPoints.push({ x: size - 3, y: 2 });
    cornerPoints.push({ x: size - 3, y: size - 3 });

    // 4-4 points (more influential)
    if (size >= 9) {
      cornerPoints.push({ x: 3, y: 3 });
      cornerPoints.push({ x: 3, y: size - 4 });
      cornerPoints.push({ x: size - 4, y: 3 });
      cornerPoints.push({ x: size - 4, y: size - 4 });
    }
  }

  // Add all valid corner points to candidates
  for (const point of cornerPoints) {
    if (
      validMoves[point.x][point.y] &&
      !isBadSelfAtari(board, point.x, point.y, playerChar)
    ) {
      candidates.push(point);
    }
  }

  // If there are candidates, randomly select one
  if (candidates.length > 0) {
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  // Fall back to middle point for very small boards
  if (size <= 5 && validMoves[Math.floor(size / 2)][Math.floor(size / 2)]) {
    return { x: Math.floor(size / 2), y: Math.floor(size / 2) };
  }

  return null;
}

/**
 * Select best move using Monte Carlo Tree Search
 */
function selectMoveUCB(
  moves: GoMove[],
  moveStats: { [key: string]: { visits: number; wins: number } },
  explorationWeight: number,
  totalParentSimulations: number // Total simulations run by parent node
): GoMove {
  // Ensure all moves get at least one try
  const unvisitedMoves = moves.filter(
    (m) =>
      !moveStats[`${m.x},${m.y}`] || moveStats[`${m.x},${m.y}`].visits === 0
  );
  if (unvisitedMoves.length > 0) {
    return unvisitedMoves[Math.floor(Math.random() * unvisitedMoves.length)];
  }

  let bestMove: GoMove = moves[0];
  let bestUCB = -Infinity;

  for (const move of moves) {
    const key = `${move.x},${move.y}`;
    const stats = moveStats[key];

    // UCB formula: exploitation + exploration
    const exploitation = stats.wins / stats.visits;
    const exploration =
      explorationWeight *
      Math.sqrt(Math.log(totalParentSimulations) / stats.visits);
    const ucb = exploitation + exploration;

    if (ucb > bestUCB) {
      bestUCB = ucb;
      bestMove = move;
    }
  }
  return bestMove;
}

/**
 * Simulate a game by playing random moves up to searchDepth
 * IMPROVED: Now considers territory control in evaluation
 */
function simulateGame(
  initialBoard: string[],
  firstMove: GoMove,
  playerMakingFirstMove: 'X' | 'O',
  searchDepth: number,
  useTerritory: boolean = true
): number {
  const R = initialBoard.length;
  const C = initialBoard[0].length;

  // Apply the first move
  let currentBoard = applyMoveAndResolveCaptures(
    initialBoard,
    firstMove,
    playerMakingFirstMove
  );
  if (!currentBoard) {
    return 0.0; // Immediate loss for illegal move
  }

  let currentPlayerInSim: 'X' | 'O' = playerMakingFirstMove === 'X' ? 'O' : 'X';
  let consecutivePasses = 0;

  // Playout loop
  for (let i = 0; i < searchDepth; i++) {
    const validSimMoves = getValidMovesForSimulation(
      currentBoard,
      currentPlayerInSim,
      R,
      C
    );

    if (validSimMoves.length === 0) {
      consecutivePasses++;
      if (consecutivePasses >= 2) {
        break; // Game ends after two consecutive passes
      }
    } else {
      consecutivePasses = 0;

      // Prefer good moves in simulation for more realistic results
      const goodRandomMoves = validSimMoves.filter(
        (m) => !isBadSelfAtari(currentBoard, m.x, m.y, currentPlayerInSim)
      );

      const moveOptions =
        goodRandomMoves.length > 0 ? goodRandomMoves : validSimMoves;
      const chosenRandomMove =
        moveOptions[Math.floor(Math.random() * moveOptions.length)];

      if (chosenRandomMove) {
        const nextBoardState = applyMoveAndResolveCaptures(
          currentBoard,
          chosenRandomMove,
          currentPlayerInSim
        );
        if (nextBoardState) {
          currentBoard = nextBoardState;
        } else {
          consecutivePasses++;
        }
      } else {
        consecutivePasses++;
      }
    }

    currentPlayerInSim = currentPlayerInSim === 'X' ? 'O' : 'X';
    if (consecutivePasses >= 2) break;
  }

  // Evaluate final board state from firstMover's perspective
  const finalScore = evaluateBoard(
    currentBoard,
    playerMakingFirstMove,
    useTerritory
  );

  // Convert to win probability [0,1]
  if (finalScore > 3) return 1.0; // Clear win
  if (finalScore < -3) return 0.0; // Clear loss

  // For close games, return a probability
  return (finalScore + 3) / 6;
}

/**
 * Find the best move using various strategies
 */
async function findBestMove(
  ns: NS,
  board: string[],
  validMoves: boolean[][],
  config: GoConfig
): Promise<GoMove | null> {
  const playerChar = 'X';

  // Check for opening moves first
  const openingMove = findOpeningMove(board, validMoves);
  if (openingMove) {
    ns.print('Found opening move!');
    return openingMove;
  }

  // Then check for high-priority tactical moves
  const captureMove = findCaptureMove(board, validMoves, playerChar);
  if (captureMove) {
    ns.print('Found high-priority capture move!');
    return captureMove;
  }

  const defendMove = findDefendMove(board, validMoves, playerChar);
  if (defendMove) {
    ns.print('Found high-priority defensive move!');
    return defendMove;
  }

  const threatMove = findThreatMove(board, validMoves);
  if (threatMove) {
    ns.print('Found threatening move!');
    return threatMove;
  }

  // Get a fallback expansion move
  const expansionMove = findExpansionMove(board, validMoves);

  // Gather all valid moves for MCTS
  const moves: GoMove[] = [];
  for (let x = 0; x < validMoves.length; x++) {
    for (let y = 0; y < validMoves[x].length; y++) {
      if (validMoves[x][y]) {
        if (!isBadSelfAtari(board, x, y, playerChar)) {
          moves.push({ x, y });
        }
      }
    }
  }

  if (moves.length === 0) {
    if (
      expansionMove &&
      !isBadSelfAtari(board, expansionMove.x, expansionMove.y, playerChar)
    )
      return expansionMove;
    return null;
  }
  if (moves.length === 1) return moves[0];

  // Run MCTS for remaining moves
  const moveStats: { [key: string]: { visits: number; wins: number } } = {};
  for (const move of moves) {
    moveStats[`${move.x},${move.y}`] = { visits: 0, wins: 0 };
  }

  for (let i = 0; i < config.simulations; i++) {
    const move = selectMoveUCB(
      moves,
      moveStats,
      config.explorationWeight,
      i + moves.length
    );
    const key = `${move.x},${move.y}`;
    const win = simulateGame(
      board,
      move,
      playerChar,
      config.searchDepth,
      config.useTerritory
    );
    moveStats[key].visits++;
    moveStats[key].wins += win;
    if (config.sleepBetweenSims > 0) await ns.sleep(config.sleepBetweenSims);
  }

  // Find best move from MCTS results
  let bestMove = null;
  let bestScore = -Infinity;

  // Log MCTS results for debugging
  if (moves.length < 10) {
    ns.print('MCTS Results:');
    for (const move of moves) {
      const key = `${move.x},${move.y}`;
      const stats = moveStats[key];
      if (stats.visits > 0) {
        const winRate = stats.wins / stats.visits;
        ns.print(
          `[${move.x},${move.y}]: ${(winRate * 100).toFixed(1)}% (${stats.visits} visits)`
        );
      }
    }
  }

  for (const move of moves) {
    const key = `${move.x},${move.y}`;
    const stats = moveStats[key];
    const score = stats.visits > 0 ? stats.wins / stats.visits : 0;

    // Add bonus for pattern matching
    let adjustedScore = score;
    if (
      config.usePatterns &&
      matchesPattern(board, move.x, move.y, playerChar)
    ) {
      adjustedScore += 0.05; // Small bonus for good patterns
    }

    if (adjustedScore > bestScore) {
      bestScore = adjustedScore;
      bestMove = move;
    }
  }

  if (!bestMove && expansionMove) {
    ns.print('MCTS yielded no best move, falling back to heuristic expansion.');
    return expansionMove;
  }

  if (!bestMove && moves.length > 0) {
    ns.print('MCTS failed to select, picking a random valid move.');
    return moves[Math.floor(Math.random() * moves.length)];
  }

  if (!bestMove) ns.print('No valid moves found. Passing may occur.');

  return bestMove;
}

/**
 * Play a full game of Go
 */
async function playGame(ns: NS, config: GoConfig) {
  let result: GoMove & { type: 'move' | 'pass' | 'gameOver' };
  let moveCount = 0;
  let opponentPassed = false;
  let ourLastMoveWasPass = false;

  // Track game history to detect ko situations
  const boardHistory: string[] = [];

  do {
    moveCount++;
    ns.print(`Turn ${moveCount}`);

    const board = ns.go.getBoardState();
    const validMoves = ns.go.analysis.getValidMoves();
    const state = ns.go.getGameState();

    // Save board state for ko detection
    const currentBoardHash = board.join('');
    boardHistory.push(currentBoardHash);
    if (boardHistory.length > 4) boardHistory.shift(); // Keep last 4 states

    const ourPlayerChar = 'X';
    const botScore = state.blackScore;
    const opponentScore = state.whiteScore;

    // Count stones on the board
    let playerPinCount = 0;
    let opponentPinCount = 0;
    for (const row of board) {
      for (const cell of row) {
        if (cell === ourPlayerChar) playerPinCount++;
        else if (cell !== '.') opponentPinCount++;
      }
    }

    const boardSize = board.length;
    const totalSpaces = boardSize * boardSize;
    const filledSpaces = playerPinCount + opponentPinCount;
    const boardCoverage = filledSpaces / totalSpaces;

    // More conservative passing logic
    const shouldPass =
      (opponentPassed && botScore > opponentScore) || // We're clearly winning after opponent pass
      boardCoverage > 0.95 || // Board is nearly full
      (opponentPassed && !hasPotentialCaptures(board) && ourLastMoveWasPass); // We already passed once

    if (shouldPass) {
      ns.print(
        `Passing: Bot: ${botScore}, Opp: ${opponentScore}, Coverage: ${Math.round(boardCoverage * 100)}%`
      );
      result = await ns.go.passTurn();
      ourLastMoveWasPass = true;
    } else {
      const move = await findBestMove(ns, board, validMoves, config);
      if (move) {
        ns.print(`Playing move at [${move.x}, ${move.y}]`);
        result = await ns.go.makeMove(move.x, move.y);
        ourLastMoveWasPass = false;
      } else {
        ns.print('Passing turn - no good moves found');
        result = await ns.go.passTurn();
        ourLastMoveWasPass = true;
      }
    }

    opponentPassed = result.type === 'pass';
    if (result.type === 'move')
      ns.print(`Opponent played at [${result.x}, ${result.y}]`);
    else if (result.type === 'pass') ns.print('Opponent passed their turn');
    else if (result.type === 'gameOver') ns.print('Game over!');

    if (result?.type !== 'gameOver') {
      await ns.go.opponentNextTurn();
    }

    await ns.sleep(50);
  } while (result?.type !== 'gameOver');

  return ns.go.getGameState();
}

export async function main(ns: NS) {
  disable_logs(ns, ['ALL']);
  setupMonitor(ns, ns.pid, IPVGO_MONITOR_PORT, 'IPvGO', {
    x: -9,
    y:
      -32 -
      (TAIL_TITLEBAR_OFFSET + TAIL_BODY_FONT_SIZE * 2 * TAIL_HEIGHT_MULT + 11),
  });
  notify(ns, 'IPvGO BOT STARTED');

  const config: GoConfig = {
    simulations: Number(ns.args[0]) || 500, // Increased from 50
    searchDepth: Number(ns.args[1]) || 100, // Increased from 5
    explorationWeight: 1.4, // Tuned from 1.5
    sleepBetweenSims: 1,
    useTerritory: true, // Enable territory evaluation
    usePatterns: false, // Enable pattern matching
  };

  const opponent: GoOpponent = (ns.args[0] || 'The Black Hand') as GoOpponent;
  const boardSize = (ns.args.length > 1 ? Number(ns.args[1]) : 5) as
    | 9
    | 5
    | 7
    | 13;

  ns.print(`Config: ${JSON.stringify(config)}`);
  let totalWins = 0;
  let totalLosses = 0;

  while (true) {
    ns.clearPort(IPVGO_MONITOR_PORT);
    ns.writePort(
      IPVGO_MONITOR_PORT,
      `W/L ${ns.formatNumber(totalWins, 0)}/${ns.formatNumber(totalLosses, 0)}\n${opponent}`
    );

    ns.go.resetBoardState(opponent, boardSize);
    notify(
      ns,
      `Starting new game against ${opponent} on ${boardSize}x${boardSize} grid`
    );
    const finalState = await playGame(ns, config);

    const finalBotScore = finalState.blackScore;
    const finalOpponentScore = finalState.whiteScore;

    ns.print(
      `Game finished! Score - You ('X'): ${finalBotScore}, Opponent ('O'): ${finalOpponentScore}`
    );

    // Determine win/loss
    if (finalBotScore > finalOpponentScore) {
      totalWins++;
    } else {
      totalLosses++;
    }

    await ns.sleep(1000);
  }
}
