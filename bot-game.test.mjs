import assert from "node:assert/strict";
import { createBotGame, evaluateMove, findBotMove, getBotSnapshot, playBotGameMove } from "./js/bot-game.js";
import { readFile } from "node:fs/promises";

const dictionary = new Set(["KATA", "ATA"]);
const firstMove = [
  { row: 7, col: 6, rack_index: 0 },
  { row: 7, col: 7, rack_index: 1 },
  { row: 7, col: 8, rack_index: 2 },
  { row: 7, col: 9, rack_index: 3 }
];
const result = evaluateMove({}, ["K", "A", "T", "A"], firstMove, dictionary);
assert.equal(result.word, "KATA");
assert.equal(result.board["7-7"], "A");
assert.throws(() => evaluateMove({}, ["X", "Y"], [{ row: 7, col: 7, rack_index: 0 }, { row: 7, col: 8, rack_index: 1 }], dictionary), /tidak ada di kamus/i);

const botDictionary = { words: ["KATA"], set: dictionary, index: new Map([["A", ["KATA"]], ["K", ["KATA"]], ["T", ["KATA"]]]) };
const botMove = findBotMove({}, ["A", "K", "A", "T"], botDictionary);
assert.equal(botMove.length, 4);
assert.ok(botMove.some(tile => tile.row === 7 && tile.col === 7));

globalThis.fetch = async () => ({ ok: true, text: async () => "aa\nata\nkata\n" });
const localGame = await createBotGame({ playerName: "Tester", timeLimit: 300000, language: "id" });
await assert.rejects(playBotGameMove([{ row: 7, col: 7, rack_index: 0 }]), /tidak ada di kamus/i);
assert.equal(getBotSnapshot().players[0].remaining_ms, localGame.players[0].remaining_ms);
assert.match(await readFile(new URL("./js/bot-game.js", import.meta.url), "utf8"), /BOT_THINK_MIN_MS = 2500/);
console.log("Bot game test KataKita lulus.");
