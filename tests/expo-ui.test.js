const fs = require('fs');
const path = require('path');

const screenHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'screen.html'), 'utf8');
const screenCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'screen.css'), 'utf8');
const controllerJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'controller.js'), 'utf8');
const realtimeJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'realtime.js'), 'utf8');
const audioJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'animation', 'audio.js'), 'utf8');
const screenJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'screen.js'), 'utf8');
const controllerHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'controller.html'), 'utf8');
const serverJs = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

for (const marker of ['algorithm-activity','calculation-history','search-stats']) {
  if (!screenHtml.includes(marker)) throw new Error(`Missing ${marker}`);
}
for (const marker of ['algorithm-activity-card','calculation-box','search-stats-box','activityPulse']) {
  if (!screenCss.includes(marker)) throw new Error(`Missing CSS ${marker}`);
}
if (!controllerJs.includes('navigator.vibrate([55, 35, 110])')) throw new Error('Enhanced result vibration missing');
if (controllerJs.includes('localStorage.setItem("agp.playerName"')) throw new Error('Controller still persists player name locally');
if (!realtimeJs.includes('storageRemove("agp.playerName")')) throw new Error('Fresh join does not clear player name');
if (!screenJs.includes('const placeColor = ({1:"#C62828",2:"#1565C0",3:"#2E7D32",4:"#EF6C00"})')) throw new Error('Distinct podium colors missing');
if (!audioJs.includes('function victory()')) throw new Error('Victory sound missing');

if (!controllerHtml.includes('controller-game-info')) throw new Error('Controller game info missing');
if (screenHtml.includes('game-info-card') || screenHtml.includes('game-maze-name')) throw new Error('Screen game info box should be removed');
if (!controllerHtml.includes('controller-maze-name') || !controllerHtml.includes('controller-players-list')) throw new Error('Mobile game info/player list missing');
if (!screenCss.includes('grid-template-rows:auto auto auto auto minmax(170px,1fr)')) throw new Error('Player lobby/activity layout fix missing');
if (!serverJs.includes('Permissions-Policy') || !serverJs.includes('camera=(), microphone=()')) throw new Error('Camera/microphone permissions are not blocked');
if (screenJs.includes('#FFD400') || screenJs.includes('shadowColor = "#FFD400"')) throw new Error('Gold/glowing route rendering still present');
if (!screenJs.includes('ctx.strokeStyle = color')) throw new Error('Continuous algorithm-colour route is missing');
if (!screenJs.includes('ctx.fillRect(cell.col * cellSize, cell.row * cellSize, cellSize, cellSize)')) throw new Error('Full-cell exploration rendering is missing');
if (!screenJs.includes('ctx.fillStyle = "#F2E8D5"')) throw new Error('Neutral cream open-cell rendering is missing');


if (!screenHtml.includes('data-maze-filter="BFS"') || !screenHtml.includes('data-maze-filter="DFS"') || !screenHtml.includes('data-maze-filter="DIJKSTRA"') || !screenHtml.includes('data-maze-filter="A*"')) throw new Error('Algorithm display filter checkboxes missing');
if (!screenHtml.includes('show-all-algorithms') || !screenHtml.includes('hide-all-algorithms')) throw new Error('Algorithm filter presets missing');
if (!screenJs.includes('let visibleAlgorithms = new Set(["BFS", "DFS", "DIJKSTRA", "A*"])')) throw new Error('Visible algorithm state missing');
if (!screenJs.includes('if (!visibleAlgorithms.has(algorithm) || run.reachedGoal) continue;')) throw new Error('Race overlay visibility filter missing');
if (!screenJs.includes('if (!visibleAlgorithms.has(algorithm) || run.exploredIndex <= 0) continue;')) throw new Error('Runner visibility filter missing');
if (!screenJs.includes('display-filter-count')) throw new Error('Filter counter missing');

console.log('EXPO UI / FRESH NAME / VIBRATION CHECK PASSED');
