import assert from "node:assert/strict";
import { formatTime, previewScore, validatePlacement } from "./js/rules.js";

assert.equal(formatTime(600_000), "10:00");
assert.equal(formatTime(-1), "00:00");
assert.equal(validatePlacement({}, [{ row: 7, col: 7, letter: "A" }]), "");
assert.match(validatePlacement({}, [{ row: 0, col: 0, letter: "A" }]), /kotak tengah/i);
assert.match(validatePlacement({}, [{ row: 7, col: 7, letter: "A" }, { row: 8, col: 8, letter: "I" }]), /baris atau kolom/i);
assert.equal(previewScore([{ row: 7, col: 7, letter: "A" }]), 2);
console.log("Rules test KataKita lulus.");