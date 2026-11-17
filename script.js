const BOARD_SIZE=15;
const letterValues={A:1,B:3,C:3,D:2,E:1,F:4,G:2,H:4,I:1,J:8,K:5,L:1,M:3,N:1,O:1,P:3,Q:10,R:1,S:1,T:1,U:1,V:4,W:4,X:8,Y:4,Z:10};
const letterBag=("AAAAAAAAAAAAAAAABBBBCCCCDDDDDEEEEEEEEFFGGGGGHHHHIIIIIIIIII"+"JJKKKKLLLLLMMMMMNNNNNNNNNOOOOOOPPPPQRRRRRRRRSSSSSSS"+"TTTTTTUUUUUUVVWWXYYZ").split("");
const premiumCells=new Map();
const fixedTiles=new Map();
const placedTiles=new Map();
let rack=[];
let selectedTileId=null;
let playerScore=42;
let opponentScore=38;
let turn=1;
let bagRemaining=85;
let soundEnabled=false;
let toastTimer;
let timerSeconds=298;
const boardElement=document.querySelector("#game-board");
const rackElement=document.querySelector("#tile-rack");
const previewElement=document.querySelector("#preview-score");
const playerScoreElement=document.querySelector("#player-score");
const opponentScoreElement=document.querySelector("#opponent-score");
const turnLabelElement=document.querySelector("#turn-label");
const bagCountElement=document.querySelector("#bag-count");
const toastElement=document.querySelector("#toast");
const timerElement=document.querySelector("#timer");
function key(row,column){return row+"-"+column}
function tile(letter){return{id:letter+"-"+Date.now()+"-"+Math.random().toString(16).slice(2),letter:letter,value:letterValues[letter]||0}}
function setPremium(type,positions){positions.forEach(function(position){premiumCells.set(key(position[0],position[1]),type)})}
function initializePremiums(){
 setPremium("triple-word",[[0,0],[0,7],[0,14],[7,0],[7,14],[14,0],[14,7],[14,14]]);
 setPremium("double-word",[[1,1],[2,2],[3,3],[4,4],[10,10],[11,11],[12,12],[13,13],[1,13],[2,12],[3,11],[4,10],[10,4],[11,3],[12,2],[13,1],[7,7]]);
 setPremium("triple-letter",[[1,5],[1,9],[5,1],[5,5],[5,9],[5,13],[9,1],[9,5],[9,9],[9,13],[13,5],[13,9]]);
 setPremium("double-letter",[[0,3],[0,11],[2,6],[2,8],[3,0],[3,7],[3,14],[6,2],[6,6],[6,8],[6,12],[7,3],[7,11],[8,2],[8,6],[8,8],[8,12],[11,0],[11,7],[11,14],[12,6],[12,8],[14,3],[14,11]])
}
function placeFixedWord(word,row,column,direction){word.split("").forEach(function(letter,index){const currentRow=direction==="vertical"?row+index:row;const currentColumn=direction==="horizontal"?column+index:column;fixedTiles.set(key(currentRow,currentColumn),tile(letter))})}
function resetFixedBoard(){fixedTiles.clear();placeFixedWord("NUSANTARA",7,3,"horizontal");placeFixedWord("KATA",5,8,"vertical")}
function getTileAt(row,column){return placedTiles.get(key(row,column))||fixedTiles.get(key(row,column))}
function tileMarkup(currentTile,isNew){return '<span class="board-tile'+(isNew?' new':'')+'" aria-label="Huruf '+currentTile.letter+', nilai '+currentTile.value+'">'+currentTile.letter+'<small class="tile-value">'+currentTile.value+'</small></span>'}
function premiumLabel(premium){return{"triple-word":"3x kata","double-word":"2x kata","triple-letter":"3x huruf","double-letter":"2x huruf"}[premium]||""}
function cellLabel(row,column,premium,currentTile){const coordinate=String.fromCharCode(65+column)+(row+1);if(currentTile)return coordinate+", huruf "+currentTile.letter;if(premium)return coordinate+", "+premiumLabel(premium);return coordinate+", kosong"}
function renderBoard(){
 const fragment=document.createDocumentFragment();boardElement.innerHTML="";
 for(let row=0;row<BOARD_SIZE;row+=1){for(let column=0;column<BOARD_SIZE;column+=1){
  const positionKey=key(row,column);const premium=premiumCells.get(positionKey);const currentTile=getTileAt(row,column);const cell=document.createElement("button");
  cell.type="button";cell.className="cell"+(premium?" "+premium:"")+(positionKey==="7-7"?" center":"");cell.dataset.row=row;cell.dataset.column=column;cell.setAttribute("aria-label",cellLabel(row,column,premium,currentTile));cell.innerHTML=currentTile?tileMarkup(currentTile,placedTiles.has(positionKey)):premiumLabel(premium);cell.addEventListener("click",handleCellClick);fragment.appendChild(cell)
 }}boardElement.appendChild(fragment)
}
function renderRack(){rackElement.innerHTML="";rack.forEach(function(currentTile){const button=document.createElement("button");button.type="button";button.className="rack-tile"+(selectedTileId===currentTile.id?" selected":"");button.dataset.tileId=currentTile.id;button.setAttribute("aria-label","Huruf "+currentTile.letter+", nilai "+currentTile.value);button.innerHTML=currentTile.letter+'<small class="tile-value">'+currentTile.value+'</small>';button.addEventListener("click",function(){selectedTileId=selectedTileId===currentTile.id?null:currentTile.id;renderRack()});rackElement.appendChild(button)})}
function handleCellClick(event){
 const row=Number(event.currentTarget.dataset.row);const column=Number(event.currentTarget.dataset.column);const positionKey=key(row,column);
 if(placedTiles.has(positionKey)){rack.push(placedTiles.get(positionKey));placedTiles.delete(positionKey);selectedTileId=null;renderAll();return}
 if(fixedTiles.has(positionKey)){showToast("Kotak itu sudah terisi.");return}
 if(!selectedTileId){showToast("Pilih satu huruf dari rak terlebih dahulu.");return}
 const rackIndex=rack.findIndex(function(currentTile){return currentTile.id===selectedTileId});if(rackIndex===-1)return;
 const selectedTile=rack.splice(rackIndex,1)[0];placedTiles.set(positionKey,selectedTile);selectedTileId=null;renderAll()
}
function renderAll(){renderBoard();renderRack();previewElement.textContent=calculateScore();playerScoreElement.textContent=playerScore;opponentScoreElement.textContent=opponentScore;turnLabelElement.textContent="Giliran "+turn;bagCountElement.textContent=bagRemaining}
function calculateScore(){if(!placedTiles.size)return 0;let score=0;let wordMultiplier=1;placedTiles.forEach(function(currentTile,positionKey){const premium=premiumCells.get(positionKey);const letterMultiplier=premium==="double-letter"?2:premium==="triple-letter"?3:1;score+=currentTile.value*letterMultiplier;if(premium==="double-word")wordMultiplier*=2;if(premium==="triple-word")wordMultiplier*=3});return score*wordMultiplier}
function validatePlacement(){
 const positions=Array.from(placedTiles.keys()).map(function(positionKey){return positionKey.split("-").map(Number)});if(!positions.length)return{valid:false,message:"Letakkan minimal satu huruf di papan."};
 const sameRow=positions.every(function(position){return position[0]===positions[0][0]});const sameColumn=positions.every(function(position){return position[1]===positions[0][1]});if(!sameRow&&!sameColumn)return{valid:false,message:"Semua huruf baru harus berada dalam satu baris atau kolom."};
 let direction=sameRow?"horizontal":"vertical";if(positions.length===1)direction=inferDirection(positions[0][0],positions[0][1]);
 const connected=positions.some(function(position){return neighbors(position[0],position[1]).some(function(neighbor){return fixedTiles.has(key(neighbor[0],neighbor[1]))})});if(!connected)return{valid:false,message:"Sambungkan huruf baru dengan kata yang sudah ada."};
 if(!isContiguous(positions,direction))return{valid:false,message:"Tidak boleh ada kotak kosong di tengah kata."};
 return{valid:true,direction:direction,word:collectWord(positions[0][0],positions[0][1],direction)}
}
function inferDirection(row,column){if(getTileAt(row,column-1)||getTileAt(row,column+1))return"horizontal";return"vertical"}
function neighbors(row,column){return[[row-1,column],[row+1,column],[row,column-1],[row,column+1]].filter(function(position){return position[0]>=0&&position[0]<BOARD_SIZE&&position[1]>=0&&position[1]<BOARD_SIZE})}
function isContiguous(positions,direction){const fixedAxis=direction==="horizontal"?positions[0][0]:positions[0][1];const variableValues=positions.map(function(position){return direction==="horizontal"?position[1]:position[0]});const minimum=Math.min.apply(null,variableValues);const maximum=Math.max.apply(null,variableValues);for(let value=minimum;value<=maximum;value+=1){const row=direction==="horizontal"?fixedAxis:value;const column=direction==="horizontal"?value:fixedAxis;if(!getTileAt(row,column))return false}return true}
function collectWord(row,column,direction){const rowStep=direction==="vertical"?1:0;const columnStep=direction==="horizontal"?1:0;let startRow=row;let startColumn=column;while(getTileAt(startRow-rowStep,startColumn-columnStep)){startRow-=rowStep;startColumn-=columnStep}let word="";let currentRow=startRow;let currentColumn=startColumn;while(getTileAt(currentRow,currentColumn)){word+=getTileAt(currentRow,currentColumn).letter;currentRow+=rowStep;currentColumn+=columnStep}return word}
// ponytail: Demo validates placement only; add a KBBI-backed service for production word checks.
function playWord(){const validation=validatePlacement();if(!validation.valid){showToast(validation.message);return}const earnedScore=calculateScore()+(placedTiles.size>=5?10:0);placedTiles.forEach(function(currentTile,positionKey){fixedTiles.set(positionKey,currentTile)});placedTiles.clear();playerScore+=earnedScore;turn+=1;timerSeconds=300;refillRack();renderAll();showToast('Kata "'+validation.word+'" dimainkan. +'+earnedScore+' poin!')}
function refillRack(){while(rack.length<7&&bagRemaining>0){const letter=letterBag[Math.floor(Math.random()*letterBag.length)];rack.push(tile(letter));bagRemaining-=1}}
function recallTiles(){placedTiles.forEach(function(currentTile){rack.push(currentTile)});placedTiles.clear();selectedTileId=null;renderAll()}
function shuffleRack(){for(let index=rack.length-1;index>0;index-=1){const randomIndex=Math.floor(Math.random()*(index+1));const temporary=rack[index];rack[index]=rack[randomIndex];rack[randomIndex]=temporary}selectedTileId=null;renderRack()}
function passTurn(){recallTiles();turn+=1;opponentScore+=Math.floor(Math.random()*8)+3;timerSeconds=300;renderAll();showToast("Giliran dilewati. Raka mendapat beberapa poin.")}
function newGame(){playerScore=0;opponentScore=0;turn=1;bagRemaining=85;timerSeconds=300;selectedTileId=null;placedTiles.clear();resetFixedBoard();rack=["B","A","H","A","S","A","I"].map(tile);renderAll();showToast("Permainan baru dimulai. Selamat bermain!")}
function showToast(message){window.clearTimeout(toastTimer);toastElement.textContent=message;toastElement.classList.add("show");toastTimer=window.setTimeout(function(){toastElement.classList.remove("show")},3000)}
function updateTimer(){timerSeconds=Math.max(0,timerSeconds-1);const minutes=Math.floor(timerSeconds/60).toString().padStart(2,"0");const seconds=(timerSeconds%60).toString().padStart(2,"0");timerElement.textContent=minutes+":"+seconds;if(timerSeconds===0)passTurn()}
document.querySelector("#shuffle-tiles").addEventListener("click",shuffleRack);
document.querySelector("#recall-tiles").addEventListener("click",recallTiles);
document.querySelector("#play-word").addEventListener("click",playWord);
document.querySelector("#pass-turn").addEventListener("click",passTurn);
document.querySelector("#new-game").addEventListener("click",newGame);
const helpDialog=document.querySelector("#help-dialog");
document.querySelector("#open-help").addEventListener("click",function(){helpDialog.showModal()});
document.querySelector("#close-help").addEventListener("click",function(){helpDialog.close()});
document.querySelector("#sound-toggle").addEventListener("click",function(event){soundEnabled=!soundEnabled;event.currentTarget.setAttribute("aria-pressed",String(soundEnabled));event.currentTarget.classList.toggle("active",soundEnabled);showToast("Suara "+(soundEnabled?"diaktifkan":"dimatikan")+".")});
initializePremiums();resetFixedBoard();rack=["B","A","H","A","S","A","I"].map(tile);renderAll();window.setInterval(updateTimer,1000);
