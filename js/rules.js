export const BOARD_SIZE = 15;
export const LETTER_VALUES = { A:1,B:3,C:3,D:2,E:1,F:4,G:2,H:4,I:1,J:8,K:5,L:1,M:3,N:1,O:1,P:3,Q:10,R:1,S:1,T:1,U:1,V:4,W:4,X:8,Y:4,Z:10 };
const premiums = new Map();
const add = (type, cells) => cells.forEach(([row,col]) => premiums.set(row + "-" + col, type));
add("triple-word",[[0,0],[0,7],[0,14],[7,0],[7,14],[14,0],[14,7],[14,14]]);
add("double-word",[[1,1],[2,2],[3,3],[4,4],[10,10],[11,11],[12,12],[13,13],[1,13],[2,12],[3,11],[4,10],[10,4],[11,3],[12,2],[13,1],[7,7]]);
add("triple-letter",[[1,5],[1,9],[5,1],[5,5],[5,9],[5,13],[9,1],[9,5],[9,9],[9,13],[13,5],[13,9]]);
add("double-letter",[[0,3],[0,11],[2,6],[2,8],[3,0],[3,7],[3,14],[6,2],[6,6],[6,8],[6,12],[7,3],[7,11],[8,2],[8,6],[8,8],[8,12],[11,0],[11,7],[11,14],[12,6],[12,8],[14,3],[14,11]]);
export const premiumAt = (row,col) => premiums.get(row + "-" + col) || "";
export const tileValue = letter => LETTER_VALUES[letter] || 0;
export function formatTime(milliseconds) { const value=Math.max(0,Math.ceil(milliseconds/1000)); return String(Math.floor(value/60)).padStart(2,"0")+":"+String(value%60).padStart(2,"0"); }
// ponytail: MVP scores the main word only; add cross-word and KBBI validation with the dictionary service.
export function previewScore(placements) { let score=0,word=1; placements.forEach(tile=>{const premium=premiumAt(tile.row,tile.col);score+=tileValue(tile.letter)*(premium==="double-letter"?2:premium==="triple-letter"?3:1);if(premium==="double-word")word*=2;if(premium==="triple-word")word*=3});return score*word; }
export function validatePlacement(board, placements) {
  if (!placements.length) return "Letakkan minimal satu huruf.";
  const sameRow=placements.every(tile=>tile.row===placements[0].row); const sameCol=placements.every(tile=>tile.col===placements[0].col);
  if (!sameRow&&!sameCol) return "Semua huruf baru harus satu baris atau kolom.";
  if (placements.some(tile=>board[tile.row+"-"+tile.col])) return "Salah satu kotak sudah terisi.";
  if (!Object.keys(board).length && !placements.some(tile=>tile.row===7&&tile.col===7)) return "Kata pertama harus melewati kotak tengah.";
  if (Object.keys(board).length && !placements.some(tile=>[[tile.row-1,tile.col],[tile.row+1,tile.col],[tile.row,tile.col-1],[tile.row,tile.col+1]].some(([r,c])=>board[r+"-"+c]))) return "Sambungkan kata dengan huruf di papan.";
  const axis=placements.map(tile=>sameRow?tile.col:tile.row); for(let value=Math.min(...axis);value<=Math.max(...axis);value+=1){const row=sameRow?placements[0].row:value;const col=sameRow?value:placements[0].col;if(!board[row+"-"+col]&&!placements.some(tile=>tile.row===row&&tile.col===col))return "Tidak boleh ada kotak kosong di tengah kata.";}
  return "";
}
