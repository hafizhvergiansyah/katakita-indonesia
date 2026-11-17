import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, script, styles] = await Promise.all([
  readFile(new URL("./index.html", import.meta.url), "utf8"),
  readFile(new URL("./script.js", import.meta.url), "utf8"),
  readFile(new URL("./styles.css", import.meta.url), "utf8")
]);

assert.match(html, /id="game-board"/);
assert.match(html, /lang="id"/);
assert.match(script, /const BOARD_SIZE=15/);
assert.match(script, /NUSANTARA/);
assert.match(styles, /@media\(max-width:680px\)/);
console.log("Smoke test KataKita lulus.");