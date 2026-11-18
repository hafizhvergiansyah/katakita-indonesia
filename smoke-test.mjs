import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, app, bot, backend, schema, styles, jambiWords, jambiMigration] = await Promise.all([
  readFile(new URL("./index.html", import.meta.url), "utf8"),
  readFile(new URL("./js/app.js", import.meta.url), "utf8"),
  readFile(new URL("./js/bot-game.js", import.meta.url), "utf8"),
  readFile(new URL("./js/backend.js", import.meta.url), "utf8"),
  readFile(new URL("./supabase/schema.sql", import.meta.url), "utf8"),
  readFile(new URL("./multiplayer.css", import.meta.url), "utf8"),
  readFile(new URL("./data/jambi-words.txt", import.meta.url), "utf8"),
  readFile(new URL("./supabase/migrations/20261118153000_add_jambi_language.sql", import.meta.url), "utf8")
]);

const dictionary = await readFile(new URL('./supabase/migrations/20261117084500_indonesian_dictionary.sql', import.meta.url), 'utf8');

assert.match(html, /id="guest-form"/);
assert.match(html, /id="lobby-screen"/);
assert.match(html, /id="game-board"/);
assert.match(html, /name="opponent"/);
assert.match(html, /name="language"/);
assert.match(html, /value="jbi"/);
assert.match(app, /subscribeToRoom/);
assert.match(app, /tidak ada di kamus.*recallTiles/s);
assert.match(bot, /findBotMove/);
assert.match(app, /bindTileDrag/);
assert.match(app, /pointerdown/);
assert.match(app, /const form=event\.currentTarget/);
assert.match(app, /const button=event\.currentTarget;const active=await toggleMusic/);
assert.match(backend, /signInAnonymously/);
assert.match(backend, /SUBSCRIBED/);
assert.match(backend, /PGRST202/);
assert.match(schema, /create or replace function public\.play_move/);
assert.match(schema, /winner_id/);
assert.match(schema, /valid_words_jambi/);
assert.match(styles, /entry-screen/);
assert.match(styles, /drag-ghost/);
assert.match(styles, /drop-target/);
assert.match(dictionary, /create table if not exists public\.valid_words/);
assert.match(dictionary, /Kata silang tidak ada di kamus/);
assert.match(dictionary, /\('kata'\)/);
assert.equal(jambiWords.trim().split(/\r?\n/).length, 2524);
assert.match(jambiMigration, /p_language not in \('id','jv','jbi'\)/);
console.log("Smoke test KataKita lulus.");
