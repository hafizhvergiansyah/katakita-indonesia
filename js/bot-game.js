import { premiumAt, tileValue, validatePlacement } from "./rules.js";

export const LOCAL_PLAYER_ID = "local-player";
const BOT_ID = "local-bot";
const BOT_THINK_MIN_MS = 2500;
const BOT_THINK_MAX_MS = 5500;
const LETTER_BAG = "A,A,A,A,A,A,A,A,A,A,A,A,A,A,A,A,B,B,B,B,C,C,C,D,D,D,D,D,E,E,E,E,E,E,E,E,F,F,G,G,G,G,G,H,H,H,H,I,I,I,I,I,I,I,I,I,I,J,K,K,K,K,L,L,L,L,L,M,M,M,M,M,N,N,N,N,N,N,N,N,N,O,O,O,O,O,O,P,P,P,P,Q,R,R,R,R,R,R,R,S,S,S,S,S,S,S,T,T,T,T,T,T,U,U,U,U,U,U,V,V,W,W,X,Y,Y,Z".split(",");
const dictionaryCache = new Map();
let game = null;

const shuffle = values => [...values].sort(() => Math.random() - .5);
const position = (row, col) => row + "-" + col;
const inBoard = (row, col) => row >= 0 && row < 15 && col >= 0 && col < 15;

function makeDictionary(words) {
  const unique = [...new Set(words.map(word => word.trim().toUpperCase()).filter(word => /^[A-Z]{2,15}$/.test(word)))];
  unique.sort((left, right) => [...right].reduce((sum, letter) => sum + tileValue(letter), 0) - [...left].reduce((sum, letter) => sum + tileValue(letter), 0));
  const index = new Map();
  unique.forEach(word => new Set(word).forEach(letter => {
    const matches = index.get(letter) || [];
    matches.push(word);
    index.set(letter, matches);
  }));
  return { words: unique, set: new Set(unique), index };
}

async function loadDictionary(language) {
  if (dictionaryCache.has(language)) return dictionaryCache.get(language);
  const file = language === "jv" ? "javanese-words.txt" : "indonesian-words.txt";
  const response = await fetch(new URL("../data/" + file, import.meta.url));
  if (!response.ok) throw new Error("Kamus gagal dimuat.");
  const dictionary = makeDictionary((await response.text()).split(/\r?\n/));
  dictionaryCache.set(language, dictionary);
  return dictionary;
}

function collectWord(board, row, col, rowStep, colStep) {
  while (inBoard(row - rowStep, col - colStep) && board[position(row - rowStep, col - colStep)]) {
    row -= rowStep;
    col -= colStep;
  }
  const cells = [];
  while (inBoard(row, col) && board[position(row, col)]) {
    cells.push({ row, col, letter: board[position(row, col)] });
    row += rowStep;
    col += colStep;
  }
  return cells;
}

function scoreWord(cells, newKeys) {
  let score = 0;
  let multiplier = 1;
  cells.forEach(cell => {
    const premium = newKeys.has(position(cell.row, cell.col)) ? premiumAt(cell.row, cell.col) : "";
    score += tileValue(cell.letter) * (premium === "double-letter" ? 2 : premium === "triple-letter" ? 3 : 1);
    if (premium === "double-word") multiplier *= 2;
    if (premium === "triple-word") multiplier *= 3;
  });
  return score * multiplier;
}

export function evaluateMove(board, rack, placements, dictionary) {
  const normalized = placements.map(tile => ({
    row: Number(tile.row), col: Number(tile.col),
    rackIndex: Number(tile.rack_index ?? tile.rackIndex),
    letter: rack[Number(tile.rack_index ?? tile.rackIndex)]
  }));
  const placementError = validatePlacement(board, normalized);
  if (placementError) throw new Error(placementError);
  if (normalized.some(tile => !tile.letter) || new Set(normalized.map(tile => tile.rackIndex)).size !== normalized.length) throw new Error("Keping rak tidak valid.");

  const newBoard = { ...board };
  const newKeys = new Set();
  normalized.forEach(tile => { const key = position(tile.row, tile.col); newBoard[key] = tile.letter; newKeys.add(key); });
  const first = normalized[0];
  const horizontal = normalized.length > 1 ? normalized.every(tile => tile.row === first.row) : Boolean(board[position(first.row, first.col - 1)] || board[position(first.row, first.col + 1)]);
  const mainCells = collectWord(newBoard, first.row, first.col, horizontal ? 0 : 1, horizontal ? 1 : 0);
  const word = mainCells.map(cell => cell.letter).join("");
  if (!dictionary.has(word)) throw new Error("Kata tidak ada di kamus: " + word);

  let score = scoreWord(mainCells, newKeys);
  normalized.forEach(tile => {
    const crossCells = collectWord(newBoard, tile.row, tile.col, horizontal ? 1 : 0, horizontal ? 0 : 1);
    if (crossCells.length < 2) return;
    const crossWord = crossCells.map(cell => cell.letter).join("");
    if (!dictionary.has(crossWord)) throw new Error("Kata silang tidak ada di kamus: " + crossWord);
    score += scoreWord(crossCells, newKeys);
  });
  if (normalized.length === 7) score += 50;
  return { board: newBoard, score, word, used: normalized.map(tile => tile.rackIndex) };
}

function placementsForWord(board, rack, word, startRow, startCol, horizontal) {
  const rowStep = horizontal ? 0 : 1;
  const colStep = horizontal ? 1 : 0;
  const endRow = startRow + rowStep * (word.length - 1);
  const endCol = startCol + colStep * (word.length - 1);
  if (!inBoard(startRow, startCol) || !inBoard(endRow, endCol)) return null;
  if (board[position(startRow - rowStep, startCol - colStep)] || board[position(endRow + rowStep, endCol + colStep)]) return null;

  const available = rack.map((letter, index) => ({ letter, index }));
  const placements = [];
  for (let offset = 0; offset < word.length; offset += 1) {
    const row = startRow + rowStep * offset;
    const col = startCol + colStep * offset;
    const fixed = board[position(row, col)];
    if (fixed && fixed !== word[offset]) return null;
    if (fixed) continue;
    const rackPosition = available.findIndex(tile => tile.letter === word[offset]);
    if (rackPosition < 0) return null;
    const [tile] = available.splice(rackPosition, 1);
    placements.push({ row, col, rack_index: tile.index });
  }
  return placements.length ? placements : null;
}

export function findBotMove(board, rack, dictionary) {
  if (!Object.keys(board).length) {
    const choices = [];
    for (const word of dictionary.words) {
      if (word.length > 7) continue;
      const placements = placementsForWord(board, rack, word, 7, 7 - Math.floor(word.length / 2), true);
      if (!placements) continue;
      try { evaluateMove(board, rack, placements, dictionary.set); choices.push(placements); } catch {}
      if (choices.length >= 12) break;
    }
    return choices[Math.floor(Math.random() * choices.length)] || null;
  }

  const choices = [];
  let attempts = 0;
  let scanned = 0;
  for (const [key, letter] of Object.entries(board)) {
    const [anchorRow, anchorCol] = key.split("-").map(Number);
    for (const word of dictionary.index.get(letter) || []) {
      for (let offset = word.indexOf(letter); offset >= 0; offset = word.indexOf(letter, offset + 1)) {
        for (const horizontal of [true, false]) {
          scanned += 1;
          if (scanned >= 50000) {
            const choice = choices[Math.floor(Math.random() * choices.length)];
            return choice?.placements || null;
          }
          const placements = placementsForWord(board, rack, word, anchorRow - (horizontal ? 0 : offset), anchorCol - (horizontal ? offset : 0), horizontal);
          if (!placements) continue;
          attempts += 1;
          try {
            const result = evaluateMove(board, rack, placements, dictionary.set);
            choices.push({ placements, score: result.score });
          } catch {}
          if (choices.length >= 16 || attempts >= 8000) {
            const choice = choices[Math.floor(Math.random() * choices.length)];
            return choice?.placements || null;
          }
        }
      }
    }
  }
  const choice = choices[Math.floor(Math.random() * choices.length)];
  return choice?.placements || null;
}

function player(id) { return game.players.find(item => item.user_id === id); }
function draw(rack) { while (rack.length < 7 && game.bag.length) rack.push(game.bag.shift()); }
function commitElapsed() {
  const current = player(game.room.current_player_id);
  if (!current || !game.room.turn_started_at) return;
  current.remaining_ms = Math.max(0, current.remaining_ms - (Date.now() - new Date(game.room.turn_started_at).getTime()));
}
function finish(reason, winnerId = null) {
  if (winnerId === null) {
    const [human, bot] = game.players;
    winnerId = human.score === bot.score ? null : human.score > bot.score ? human.user_id : bot.user_id;
  }
  Object.assign(game.room, { status: "finished", winner_id: winnerId, end_reason: reason, current_player_id: null, turn_started_at: null });
}
function nextTurn(scored) {
  game.room.current_player_id = game.room.current_player_id === LOCAL_PLAYER_ID ? BOT_ID : LOCAL_PLAYER_ID;
  game.room.turn_started_at = new Date().toISOString();
  game.room.turn_no += 1;
  game.room.consecutive_scoreless = scored ? 0 : game.room.consecutive_scoreless + 1;
  if (game.room.consecutive_scoreless >= 4) finish("scoreless");
}
function snapshot() {
  return {
    room: { ...game.room, board: { ...game.room.board }, bag_count: game.bag.length },
    players: game.players.map(item => ({ ...item })),
    rack: [...game.racks[LOCAL_PLAYER_ID]]
  };
}

async function playFor(playerId, placements) {
  if (!game || game.room.status !== "playing") throw new Error("Permainan belum aktif.");
  if (game.room.current_player_id !== playerId) throw new Error("Sekarang bukan giliranmu.");
  const elapsed = Date.now() - new Date(game.room.turn_started_at).getTime();
  if (player(playerId).remaining_ms - elapsed <= 0) { commitElapsed(); finish("timeout", playerId === BOT_ID ? LOCAL_PLAYER_ID : BOT_ID); return snapshot(); }
  const result = evaluateMove(game.room.board, game.racks[playerId], placements, game.dictionary.set);
  commitElapsed();
  const used = new Set(result.used);
  game.racks[playerId] = game.racks[playerId].filter((_, index) => !used.has(index));
  draw(game.racks[playerId]);
  game.room.board = result.board;
  player(playerId).score += result.score;
  if (!game.bag.length && !game.racks[playerId].length) finish("rack_empty");
  else nextTurn(true);
  return snapshot();
}

export async function createBotGame({ playerName, timeLimit, language }) {
  const dictionary = await loadDictionary(language);
  const bag = shuffle(LETTER_BAG);
  game = {
    dictionary, bag,
    racks: { [LOCAL_PLAYER_ID]: [], [BOT_ID]: [] },
    players: [
      { user_id: LOCAL_PLAYER_ID, seat: 1, display_name: playerName, score: 0, remaining_ms: timeLimit },
      { user_id: BOT_ID, seat: 2, display_name: "Bot Arjuna", score: 0, remaining_ms: timeLimit }
    ],
    room: { id: "bot", code: "BOT", status: "playing", time_limit_ms: timeLimit, language, current_player_id: LOCAL_PLAYER_ID, turn_started_at: new Date().toISOString(), turn_no: 1, board: {}, consecutive_scoreless: 0, winner_id: null, end_reason: null }
  };
  draw(game.racks[LOCAL_PLAYER_ID]);
  draw(game.racks[BOT_ID]);
  return snapshot();
}

export const getBotSnapshot = () => snapshot();
export const playBotGameMove = placements => playFor(LOCAL_PLAYER_ID, placements);
export async function passBotTurn(playerId = LOCAL_PLAYER_ID) {
  if (game.room.current_player_id !== playerId) throw new Error("Sekarang bukan giliranmu.");
  commitElapsed();
  nextTurn(false);
  return snapshot();
}
export function resignBotGame() { finish("resign", BOT_ID); return snapshot(); }
export function claimBotTimeout() {
  commitElapsed();
  const currentId = game.room.current_player_id;
  if (player(currentId).remaining_ms > 0) throw new Error("Waktu pemain belum habis.");
  finish("timeout", currentId === BOT_ID ? LOCAL_PLAYER_ID : BOT_ID);
  return snapshot();
}
export async function runBotTurn() {
  if (!game || game.room.status !== "playing" || game.room.current_player_id !== BOT_ID) return snapshot();
  const thinkTime = BOT_THINK_MIN_MS + Math.random() * (BOT_THINK_MAX_MS - BOT_THINK_MIN_MS);
  await new Promise(resolve => window.setTimeout(resolve, thinkTime));
  try {
    const move = findBotMove(game.room.board, game.racks[BOT_ID], game.dictionary);
    return move ? playFor(BOT_ID, move) : passBotTurn(BOT_ID);
  } catch {
    return passBotTurn(BOT_ID);
  }
}
