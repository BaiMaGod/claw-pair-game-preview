// @ts-nocheck
import * as THREE from 'three';
import { BlockGraph } from './logic/BlockGraph.js';
import { SlotQueue } from './logic/SlotQueue.js';
import { TEST_LEVEL } from './data/testLevel.js';

const canvas = document.querySelector('#game');
const overlay = document.querySelector('#overlay');
const resultTitle = document.querySelector('#resultTitle');
const resultText = document.querySelector('#resultText');
const resultEmoji = document.querySelector('#resultEmoji');
const rescuedEl = document.querySelector('#rescued');
const pairTotalEl = document.querySelector('#pairTotal');
const progressFill = document.querySelector('#progressFill');
const hintEl = document.querySelector('#hint');
const debugEl = document.querySelector('#debug');

const TYPE_META = {
  bear:     { label: '小熊', size: [1.84, 2.08] },
  duck:     { label: '小鸭', size: [1.78, 1.72] },
  car:      { label: '汽车', size: [2.08, 1.42] },
  rabbit:   { label: '兔子', size: [1.76, 2.22] },
  dinosaur: { label: '恐龙', size: [1.92, 2.00] }
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf7dce7);
const camera = new THREE.OrthographicCamera(-5.2, 5.2, 9.2, -9.2, 0.1, 100);
camera.position.set(0, 0, 25);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.04;

scene.add(new THREE.HemisphereLight(0xfffbf8, 0xbc557c, 1.3));
const keyLight = new THREE.DirectionalLight(0xfff1dc, 1.15);
keyLight.position.set(-4, 8, 12);
scene.add(keyLight);

const root = new THREE.Group();
const machineBack = new THREE.Group();
const pileGroup = new THREE.Group();
const machineFront = new THREE.Group();
const effectsGroup = new THREE.Group();
root.add(machineBack, pileGroup, machineFront, effectsGroup);
scene.add(root);

const toyMap = new Map();
const meshToToy = new Map();
const clickableRoots = [];
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const toyTextureCache = new Map();
const toyAssetLoader = new THREE.TextureLoader();
const TOY_ASSET_PATHS = {
  bear: './assets/toys/bear.webp',
  rabbit: './assets/toys/rabbit.webp',
  duck: './assets/toys/duck.webp',
  dinosaur: './assets/toys/dino.webp',
  car: './assets/toys/car.webp'
};

const MACHINE_SHELL_PATH = './assets/machine/machine-shell-v05.webp';
let machineShellTexture = null;
function getMachineShellTexture(){
  if(machineShellTexture) return machineShellTexture;
  machineShellTexture = toyAssetLoader.load(
    MACHINE_SHELL_PATH,
    loaded => {
      loaded.colorSpace = THREE.SRGBColorSpace;
      loaded.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      loaded.needsUpdate = true;
    },
    undefined,
    () => console.warn('Machine shell asset failed to load')
  );
  machineShellTexture.colorSpace = THREE.SRGBColorSpace;
  machineShellTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return machineShellTexture;
}

function getToyAssetTexture(type){
  const key = `asset:${type}`;
  if (toyTextureCache.has(key)) return toyTextureCache.get(key);
  const texture = toyAssetLoader.load(
    TOY_ASSET_PATHS[type],
    loaded => {
      loaded.colorSpace = THREE.SRGBColorSpace;
      loaded.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      loaded.needsUpdate = true;
    },
    undefined,
    () => console.warn(`Toy asset failed to load: ${TOY_ASSET_PATHS[type]}`)
  );
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  toyTextureCache.set(key, texture);
  return texture;
}

let blockGraph;
let slotQueue;
let claw;
let clawBusy = false;
let gameEnded = false;
let activePairAnimations = 0;
let rescuedPairs = 0;
const totalPairs = TEST_LEVEL.toys.length / 2;
let debugVisible = false;
let hintTimer = 0;

pairTotalEl.textContent = String(totalPairs);

const slotPositions = [
  new THREE.Vector3(-3.34, -3.98, 6.68),
  new THREE.Vector3(-1.83, -3.82, 6.68),
  new THREE.Vector3(-0.27, -3.63, 6.68),
  new THREE.Vector3( 1.35, -3.46, 6.68)
];
const chuteEntry = new THREE.Vector3(3.53, -2.71, 6.45);
const exitPoint = new THREE.Vector3(3.72, -1.62, 5.38);

function lerp(a,b,t){ return a+(b-a)*t; }
function roundedRectPath(ctx,x,y,w,h,r){
  r=Math.min(r,w/2,h/2);
  ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
}
function ellipse(ctx,x,y,rx,ry,fill,stroke=null,line=0){
  ctx.save(); ctx.beginPath(); ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);
  if(fill){ctx.fillStyle=fill;ctx.fill();} if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=line;ctx.stroke();} ctx.restore();
}
function circle(ctx,x,y,r,fill,stroke=null,line=0){ ellipse(ctx,x,y,r,r,fill,stroke,line); }
function softGradient(ctx,x,y,r,inner,outer){
  const g=ctx.createRadialGradient(x-r*.28,y-r*.35,r*.08,x,y,r); g.addColorStop(0,inner); g.addColorStop(1,outer); return g;
}
function drawBeadEyes(ctx,y,color='#4c353a',awake=false){
  const r=awake?18:13;
  for(const x of [218,294]){
    circle(ctx,x,y,r,color);
    circle(ctx,x-(awake?6:4),y-(awake?7:5),awake?5:4,'rgba(255,255,255,.95)');
    if(awake) circle(ctx,x+6,y+5,3,'rgba(255,255,255,.55)');
  }
}
function drawMouth(ctx,y,color='#6a3d45',awake=false){
  ctx.save(); ctx.strokeStyle=color; ctx.lineWidth=awake?8:6; ctx.lineCap='round';
  ctx.beginPath();
  if(awake){ ctx.arc(256,y,29,.13*Math.PI,.87*Math.PI); }
  else { ctx.moveTo(243,y); ctx.quadraticCurveTo(256,y+9,269,y); }
  ctx.stroke(); ctx.restore();
}
function drawBlush(ctx,y){ ellipse(ctx,168,y,27,14,'rgba(255,127,153,.34)'); ellipse(ctx,344,y,27,14,'rgba(255,127,153,.34)'); }
function drawBow(ctx,y){
  ctx.save();
  const g=ctx.createLinearGradient(188,y-34,326,y+30); g.addColorStop(0,'#ff7f97'); g.addColorStop(1,'#d63f62'); ctx.fillStyle=g;
  ctx.beginPath(); ctx.moveTo(250,y); ctx.bezierCurveTo(210,y-44,172,y-38,188,y+10); ctx.bezierCurveTo(199,y+34,229,y+21,250,y+5); ctx.fill();
  ctx.beginPath(); ctx.moveTo(262,y); ctx.bezierCurveTo(302,y-44,340,y-38,324,y+10); ctx.bezierCurveTo(313,y+34,283,y+21,262,y+5); ctx.fill();
  circle(ctx,256,y,21,'#d94668'); ctx.restore();
}
function drawSpecks(ctx,alpha=.12){
  ctx.save(); ctx.fillStyle='#fff';
  for(let i=0;i<85;i++){ctx.globalAlpha=alpha*(.55+(i%5)*.1);const x=(i*73)%455+28,y=(i*127)%555+38,r=(i%3)+1;ctx.fillRect(x,y,r,r);}
  ctx.restore();
}
function drawSparkle(ctx,x,y,s,alpha=.7){
  ctx.save(); ctx.globalAlpha=alpha; ctx.fillStyle='#fff';
  ctx.beginPath(); ctx.moveTo(x,y-s); ctx.quadraticCurveTo(x+s*.18,y-s*.18,x+s,y); ctx.quadraticCurveTo(x+s*.18,y+s*.18,x,y+s);
  ctx.quadraticCurveTo(x-s*.18,y+s*.18,x-s,y); ctx.quadraticCurveTo(x-s*.18,y-s*.18,x,y-s); ctx.fill(); ctx.restore();
}

function createToyTexture(type,awake=false){
  const key=`${type}:${awake?'awake':'normal'}`;
  if(toyTextureCache.has(key)) return toyTextureCache.get(key);
  const c=document.createElement('canvas'); c.width=512; c.height=640; const ctx=c.getContext('2d');
  ctx.clearRect(0,0,512,640);
  ctx.save(); ctx.shadowColor='rgba(103,43,63,.16)'; ctx.shadowBlur=22; ctx.shadowOffsetY=10;

  if(type==='bear'){
    const fur=softGradient(ctx,226,238,250,'#ffd1a1','#b96c42');
    circle(ctx,155,165,63,fur); circle(ctx,357,165,63,fur);
    ellipse(ctx,256,419,148,162,fur); circle(ctx,256,252,142,fur);
    ellipse(ctx,169,463,56,84,fur); ellipse(ctx,343,463,56,84,fur);
    ellipse(ctx,192,541,69,47,fur); ellipse(ctx,320,541,69,47,fur);
    ellipse(ctx,256,292,70,57,'#f8dfc4'); circle(ctx,256,276,17,'#69413c');
    drawBlush(ctx,328); drawBow(ctx,391); drawSpecks(ctx,.11);
    drawBeadEyes(ctx,247,'#4d3435',awake); drawMouth(ctx,319,'#63383d',awake);
  } else if(type==='rabbit'){
    const fur=softGradient(ctx,230,250,250,'#fffefd','#e9d8df');
    ellipse(ctx,188,120,48,116,fur); ellipse(ctx,324,120,48,116,fur);
    ellipse(ctx,188,126,20,82,'#f4a9c1'); ellipse(ctx,324,126,20,82,'#f4a9c1');
    ellipse(ctx,256,428,145,158,fur); circle(ctx,256,282,141,fur);
    ellipse(ctx,173,474,55,78,fur); ellipse(ctx,339,474,55,78,fur);
    ellipse(ctx,195,546,68,43,fur); ellipse(ctx,317,546,68,43,fur);
    circle(ctx,256,310,13,'#ee91aa'); drawBlush(ctx,346); drawBow(ctx,410); drawSpecks(ctx,.18);
    drawBeadEyes(ctx,270,'#4d3b42',awake); drawMouth(ctx,346,'#744753',awake);
  } else if(type==='duck'){
    const yellow=softGradient(ctx,208,235,240,'#fff8a9','#e9b52c');
    ellipse(ctx,249,431,163,146,yellow); circle(ctx,266,277,133,yellow);
    ellipse(ctx,133,432,62,86,yellow); ellipse(ctx,379,432,62,86,yellow);
    const beak=ctx.createLinearGradient(190,310,330,365);beak.addColorStop(0,'#ffbc59');beak.addColorStop(1,'#e97924');
    ctx.fillStyle=beak;roundedRectPath(ctx,190,315,132,56,27);ctx.fill();
    drawBlush(ctx,363);drawSpecks(ctx,.10);drawBeadEyes(ctx,254,'#533d30',awake); if(awake) drawMouth(ctx,392,'#8d4d25',true);
  } else if(type==='dinosaur'){
    const green=softGradient(ctx,210,235,250,'#baf2bd','#4eaa70');
    ellipse(ctx,237,433,162,149,green); circle(ctx,274,278,132,green);
    ellipse(ctx,119,443,80,55,green); ellipse(ctx,374,444,60,86,green);
    ctx.fillStyle='#78cf88';
    for(let i=0;i<5;i++){ctx.beginPath();ctx.moveTo(319+i*26,186+i*39);ctx.lineTo(350+i*22,143+i*39);ctx.lineTo(371+i*22,202+i*34);ctx.fill();}
    ellipse(ctx,258,454,94,109,'#dff7ca');drawBlush(ctx,350);drawSpecks(ctx,.11);drawBeadEyes(ctx,267,'#345443',awake);drawMouth(ctx,345,'#3d654d',awake);
  } else {
    const blue=ctx.createLinearGradient(95,205,415,500);blue.addColorStop(0,'#8bd7ff');blue.addColorStop(.48,'#3a91df');blue.addColorStop(1,'#245fa8');
    ctx.fillStyle=blue;roundedRectPath(ctx,82,302,348,182,58);ctx.fill();
    ctx.fillStyle='#f1fbff';roundedRectPath(ctx,148,220,226,132,42);ctx.fill();
    ctx.fillStyle='#77bde9';roundedRectPath(ctx,168,241,82,83,19);ctx.fill();roundedRectPath(ctx,275,241,82,83,19);ctx.fill();
    ctx.fillStyle='rgba(255,255,255,.92)';ctx.fillRect(242,220,20,264);ctx.fillRect(278,220,15,264);
    for(const x of [145,367]){circle(ctx,x,472,57,'#34414d');circle(ctx,x,472,29,'#ddebf1');circle(ctx,x,472,11,'#8ba9b8');}
    circle(ctx,122,373,27,'#fff6a2');circle(ctx,389,373,27,'#fff6a2');drawBlush(ctx,417);drawBeadEyes(ctx,367,'#24475d',awake);drawMouth(ctx,421,'#24475d',awake);
  }
  ctx.restore();
  if(awake){ drawSparkle(ctx,110,138,17,.72); drawSparkle(ctx,402,170,12,.58); }
  const texture=new THREE.CanvasTexture(c); texture.colorSpace=THREE.SRGBColorSpace; texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  toyTextureCache.set(key,texture); return texture;
}

function createShadowTexture(){
  const c=document.createElement('canvas');c.width=256;c.height=128;const ctx=c.getContext('2d');
  const g=ctx.createRadialGradient(128,64,3,128,64,116);g.addColorStop(0,'rgba(88,40,57,.34)');g.addColorStop(.5,'rgba(88,40,57,.15)');g.addColorStop(1,'rgba(88,40,57,0)');
  ellipse(ctx,128,64,116,43,g);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}
const shadowTexture=createShadowTexture();

function createBackdropTexture(){
  const c=document.createElement('canvas');c.width=900;c.height=860;const ctx=c.getContext('2d');
  const g=ctx.createLinearGradient(0,0,0,860);g.addColorStop(0,'#fff8f7');g.addColorStop(.52,'#fae7ec');g.addColorStop(1,'#f3cbd9');ctx.fillStyle=g;ctx.fillRect(0,0,900,860);
  const glow=ctx.createRadialGradient(450,110,20,450,110,430);glow.addColorStop(0,'rgba(255,242,185,.42)');glow.addColorStop(1,'rgba(255,242,185,0)');ctx.fillStyle=glow;ctx.fillRect(0,0,900,520);
  const decals=[['#ffd472',105,130,65],['#bce2ff',790,180,80],['#f9a5bd',760,520,105],['#bfeac8',180,585,88]];
  for(const [col,x,y,r] of decals){ctx.globalAlpha=.16;circle(ctx,x,y,r,col);}ctx.globalAlpha=1;
  const posters=[
    {x:72,y:145,w:230,h:315,rot:-.055,lines:['PLAY','CATCH','MATCH','SMILE!']},
    {x:615,y:130,w:230,h:325,rot:.055,lines:['GOOD','TOYS','HAPPY','DAY']}
  ];
  for(const p of posters){
    ctx.save();ctx.translate(p.x+p.w/2,p.y+p.h/2);ctx.rotate(p.rot);
    ctx.fillStyle='rgba(255,251,244,.57)';roundedRectPath(ctx,-p.w/2,-p.h/2,p.w,p.h,30);ctx.fill();
    ctx.fillStyle='rgba(201,88,123,.58)';ctx.font='800 37px system-ui';ctx.textAlign='center';
    p.lines.forEach((s,i)=>ctx.fillText(s,0,-72+i*54));ctx.restore();
  }
  ctx.globalAlpha=.14;ctx.fillStyle='#d97191';ctx.font='900 58px system-ui';ctx.textAlign='center';ctx.fillText('GOOD TOYS',450,95);ctx.globalAlpha=1;
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}

function createFrameTexture(){
  const c=document.createElement('canvas');c.width=1024;c.height=1536;const ctx=c.getContext('2d');ctx.clearRect(0,0,1024,1536);
  const shell=ctx.createLinearGradient(0,0,1024,1536);shell.addColorStop(0,'#ffc0d3');shell.addColorStop(.35,'#ef84a8');shell.addColorStop(.75,'#e26d95');shell.addColorStop(1,'#c9507d');
  ctx.fillStyle=shell;roundedRectPath(ctx,25,25,974,1486,78);ctx.fill();
  const inner=ctx.createLinearGradient(0,90,0,1390);inner.addColorStop(0,'#fff6f9');inner.addColorStop(1,'#f4bfd1');ctx.fillStyle=inner;roundedRectPath(ctx,55,55,914,1426,63);ctx.fill();
  // Clear the glass window.
  ctx.globalCompositeOperation='destination-out';roundedRectPath(ctx,102,180,820,740,44);ctx.fill();ctx.globalCompositeOperation='source-over';
  // glossy inner rim
  ctx.strokeStyle='rgba(255,255,255,.82)';ctx.lineWidth=18;roundedRectPath(ctx,84,160,856,782,54);ctx.stroke();
  ctx.strokeStyle='rgba(169,62,103,.34)';ctx.lineWidth=8;roundedRectPath(ctx,96,174,832,754,45);ctx.stroke();
  // base panel details
  const baseG=ctx.createLinearGradient(0,930,0,1490);baseG.addColorStop(0,'#f49ab5');baseG.addColorStop(1,'#d8618b');ctx.fillStyle=baseG;roundedRectPath(ctx,82,945,860,500,54);ctx.fill();
  ctx.fillStyle='rgba(255,255,255,.20)';roundedRectPath(ctx,110,978,804,135,34);ctx.fill();
  ctx.fillStyle='rgba(122,52,79,.12)';roundedRectPath(ctx,120,1288,784,110,36);ctx.fill();
  // little screws/stars
  for(const [x,y] of [[70,112],[954,112],[76,1430],[948,1430]]){circle(ctx,x,y,11,'#ffdbe6');circle(ctx,x,y,5,'#ba5a7b');}
  drawSparkle(ctx,155,1190,18,.35);drawSparkle(ctx,870,1190,18,.35);
  ctx.fillStyle='rgba(255,255,255,.42)';ctx.font='900 42px system-ui';ctx.textAlign='center';ctx.fillText('TOY FRIENDS',512,1380);
  // shell highlights
  ctx.strokeStyle='rgba(255,255,255,.52)';ctx.lineWidth=10;roundedRectPath(ctx,42,42,940,1452,70);ctx.stroke();
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}

function basicMaterial(color,opacity=1){return new THREE.MeshBasicMaterial({color,transparent:opacity<1,opacity,depthWrite:false,toneMapped:false,side:THREE.DoubleSide});}
function plane(w,h,material,z=0){const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),material);m.position.z=z;return m;}
function box(w,h,d,color,z=0,roughness=.32,metalness=.08){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color,roughness,metalness}));m.position.z=z;return m;}
function sphere(r,color){return new THREE.Mesh(new THREE.SphereGeometry(r,28,18),new THREE.MeshStandardMaterial({color,roughness:.25,metalness:.08}));}

function buildMachine(){
  // Interior stays live/interactive; the polished effect-image shell sits in front
  // with a transparent glass opening and an integrated right-to-left queue track.
  const back=plane(
    8.46,
    8.15,
    new THREE.MeshBasicMaterial({map:createBackdropTexture(),toneMapped:false}),
    -.72
  );
  back.position.y=2.23;
  machineBack.add(back);

  const floor=plane(8.48,1.10,basicMaterial(0xf2bfd0),-.64);
  floor.position.y=-1.43;
  machineBack.add(floor);

  const shellTexture=getMachineShellTexture();
  const shell=plane(
    10.35,
    14.10,
    new THREE.MeshBasicMaterial({
      map:shellTexture,
      transparent:true,
      alphaTest:.025,
      depthWrite:false,
      toneMapped:false,
      side:THREE.DoubleSide
    }),
    5.55
  );
  shell.position.y=-.25;
  shell.renderOrder=8;
  machineFront.add(shell);

  // The shell already contains the finished chute, four glowing wait markers,
  // machine base, screws, highlights, and TOY FRIENDS panel.
  // Only a very light live glass sheen remains procedural.
  const glass=plane(8.45,8.00,basicMaterial(0xecfaff,.045),6.02);
  glass.position.y=2.20;
  glass.renderOrder=9;
  machineFront.add(glass);

  for(const [x,y,w,h,r,a] of [
    [-3.00,2.65,.19,6.10,-.11,.10],
    [ 3.08,3.05,.11,3.50,-.11,.07]
  ]){
    const hi=plane(w,h,basicMaterial(0xffffff,a),6.08);
    hi.position.set(x,y,0);
    hi.rotation.z=r;
    hi.renderOrder=10;
    machineFront.add(hi);
  }
}

function createToyVisual(type){
  const g=new THREE.Group(),meta=TYPE_META[type];

  const shadow=plane(
    meta.size[0]*1.10,
    .58,
    new THREE.MeshBasicMaterial({
      map:shadowTexture,
      transparent:true,
      opacity:.38,
      depthWrite:false,
      toneMapped:false
    }),
    -.09
  );
  shadow.position.y=-meta.size[1]*.40;

  const glow=new THREE.Mesh(
    new THREE.CircleGeometry(meta.size[0]*.58,40),
    new THREE.MeshBasicMaterial({
      color:0xffefad,
      transparent:true,
      opacity:.18,
      depthWrite:false,
      toneMapped:false,
      blending:THREE.AdditiveBlending
    })
  );
  glow.position.set(0,.02,-.01);
  glow.scale.set(1,1.18,1);
  glow.visible=false;

  const normal=getToyAssetTexture(type);
  const material=new THREE.MeshBasicMaterial({
    map:normal,
    transparent:true,
    alphaTest:.035,
    depthWrite:true,
    depthTest:true,
    toneMapped:false,
    side:THREE.DoubleSide
  });
  const sprite=plane(meta.size[0],meta.size[1],material,.03);

  g.add(shadow,glow,sprite);
  g.userData.sprite=sprite;
  g.userData.shadow=shadow;
  g.userData.awakeGlow=glow;
  g.userData.normalTexture=normal;
  sprite.userData.toyRoot=g;
  return g;
}
function createToy(data){
  const group=createToyVisual(data.type);group.position.set(...data.position);group.rotation.set(...data.rotation);group.scale.setScalar(data.scale??1);
  group.userData.toyId=data.id;group.userData.type=data.type;group.userData.status='pile';group.userData.baseScale=group.scale.x;
  pileGroup.add(group);toyMap.set(data.id,group);clickableRoots.push(group);meshToToy.set(group.userData.sprite,group);return group;
}

function createClaw(){
  const g=new THREE.Group();g.position.set(0,5.38,7.35);
  const chrome=new THREE.MeshStandardMaterial({color:0xf4f8fa,roughness:.12,metalness:.86}),pink=new THREE.MeshStandardMaterial({color:0xe96290,roughness:.22,metalness:.28});
  const rail=box(8.1,.12,.13,0xd85f89,7.0,.22,.22);rail.position.set(0,6.00,0);machineFront.add(rail);
  const slider=box(.62,.24,.20,0xf07ea0,7.05,.18,.18);slider.position.y=.98;
  const rod=new THREE.Mesh(new THREE.CylinderGeometry(.10,.10,1.10,24),chrome);rod.position.y=.52;
  const hub=sphere(.31,0xe96c96);hub.material=pink;hub.position.y=-.04;
  const collar=new THREE.Mesh(new THREE.CylinderGeometry(.22,.22,.24,24),chrome);collar.position.y=.16;
  const left=new THREE.Mesh(new THREE.CapsuleGeometry(.072,.62,5,14),chrome);left.position.set(-.30,-.50,0);left.rotation.z=-.43;
  const right=new THREE.Mesh(new THREE.CapsuleGeometry(.072,.62,5,14),chrome);right.position.set(.30,-.50,0);right.rotation.z=.43;
  const tipL=sphere(.09,0xe96c96);tipL.material=pink;tipL.position.set(-.49,-.80,0);
  const tipR=sphere(.09,0xe96c96);tipR.material=pink;tipR.position.set(.49,-.80,0);
  g.add(slider,rod,hub,collar,left,right,tipL,tipR);g.userData.left=left;g.userData.right=right;scene.add(g);return g;
}

function resetGame(){
  while(pileGroup.children.length)pileGroup.remove(pileGroup.children[0]);
  while(effectsGroup.children.length)effectsGroup.remove(effectsGroup.children[0]);
  toyMap.clear();meshToToy.clear();clickableRoots.length=0;
  blockGraph=new BlockGraph(TEST_LEVEL.toys.map(t=>t.id),TEST_LEVEL.blocks);slotQueue=new SlotQueue(TEST_LEVEL.slotCapacity);
  clawBusy=false;gameEnded=false;activePairAnimations=0;rescuedPairs=0;overlay.classList.add('hidden');rescuedEl.textContent='0';progressFill.style.width='0%';
  for(const data of TEST_LEVEL.toys)createToy(data);if(!claw)claw=createClaw();claw.position.set(0,5.38,7.35);updateDebug();
}
function resize(){
  const w=canvas.clientWidth||innerWidth,h=canvas.clientHeight||innerHeight;renderer.setSize(w,h,false);
  const aspect=w/h,worldH=18.4,worldW=worldH*aspect;camera.left=-worldW/2;camera.right=worldW/2;camera.top=worldH/2;camera.bottom=-worldH/2;camera.updateProjectionMatrix();
}

const now=()=>performance.now(),easeOutCubic=t=>1-Math.pow(1-t,3),easeInOutCubic=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2,easeOutBack=t=>{const c1=1.70158,c3=c1+1;return 1+c3*Math.pow(t-1,3)+c1*Math.pow(t-1,2);};
function tween(duration,update,easing=easeInOutCubic){return new Promise(resolve=>{const start=now();function step(){const t=Math.min(1,(now()-start)/duration);update(easing(t),t);if(t<1)requestAnimationFrame(step);else resolve();}requestAnimationFrame(step);});}
async function tweenPos(obj,target,ms,easing=easeInOutCubic){const start=obj.position.clone();await tween(ms,t=>obj.position.lerpVectors(start,target,t),easing);}
function showHint(text,ms=950){hintEl.textContent=text;hintEl.classList.add('show');clearTimeout(hintTimer);hintTimer=setTimeout(()=>hintEl.classList.remove('show'),ms);}
async function pulse(toy){if(!toy)return;const base=toy.scale.x;await tween(300,(e,raw)=>{const s=base*(1+.11*Math.sin(raw*Math.PI));toy.scale.setScalar(s);});toy.scale.setScalar(base);}
async function shakeToy(toy){const base=toy.rotation.z,blockers=blockGraph.getBlockers(toy.userData.toyId);showHint('它被压住啦！先抓上面的玩具');for(const id of blockers)pulse(toyMap.get(id));await tween(300,(e,raw)=>{toy.rotation.z=base+Math.sin(raw*Math.PI*7)*.052*(1-raw);});toy.rotation.z=base;}
function setAwake(toy,awake){
  const sprite=toy?.userData?.sprite;
  if(!sprite)return;
  toy.userData.awake=awake;
  if(toy.userData.awakeGlow) toy.userData.awakeGlow.visible=awake;
  sprite.material.opacity=awake?1:.985;
  sprite.material.needsUpdate=true;
}
async function animateUnlock(id){
  const toy=toyMap.get(id);if(!toy||toy.userData.status!=='pile')return;
  const sy=toy.position.y,sx=toy.position.x,sr=toy.rotation.z,drift=(sx>=0?1:-1)*.06;
  await tween(285,e=>{toy.position.y=sy-.20*e;toy.position.x=sx+drift*e;toy.rotation.z=sr+.065*Math.sin(e*Math.PI);},easeOutBack);
}

async function clawPick(toy){
  clawBusy=true;toy.userData.status='reserved';toy.userData.shadow.visible=false;const id=toy.userData.toyId;blockGraph.reserve(id);
  const topY=claw.position.y;await tweenPos(claw,new THREE.Vector3(toy.position.x,topY,claw.position.z),165,easeOutCubic);
  const targetY=toy.position.y+1.02,downStart=claw.position.y;await tween(155,t=>claw.position.y=lerp(downStart,targetY,t));
  toy.userData.status='grabbing';const left=claw.userData.left,right=claw.userData.right,l0=left.rotation.z,r0=right.rotation.z;
  await tween(95,t=>{left.rotation.z=lerp(l0,-.13,t);right.rotation.z=lerp(r0,.13,t);});
  const toyStart=toy.position.clone(),clawY=claw.position.y;await tween(170,(e,raw)=>{claw.position.y=lerp(clawY,5.38,e);toy.position.y=lerp(toyStart.y,4.33,e);toy.position.x=claw.position.x;toy.position.z=6.72;toy.rotation.z=toyStart.z+Math.sin(raw*Math.PI)*.045;},easeOutCubic);
  const cx=claw.position.x,tx=toy.position.x;await tween(205,t=>{claw.position.x=lerp(cx,4.03,t);toy.position.x=lerp(tx,4.03,t);},easeInOutCubic);
  left.rotation.z=l0;right.rotation.z=r0;toy.userData.status='chute';const unlocked=blockGraph.removeToy(id);unlocked.forEach(animateUnlock);
  const dropStart=toy.position.clone();await tween(150,(e,raw)=>{toy.position.lerpVectors(dropStart,exitPoint,e);toy.rotation.z+=.012*(1-raw);},t=>t*t);
  await acceptFromChute(toy);clawBusy=false;updateDebug();
}
function curvePointForSlot(index,t){
  const target=slotPositions[index],p0=chuteEntry,p1=new THREE.Vector3(3.20,-2.82,6.60),p2=new THREE.Vector3(target.x+.74,target.y+.22,6.64);
  return new THREE.CubicBezierCurve3(p0,p1,p2,target).getPoint(t);
}
async function acceptFromChute(toy){
  const index=slotQueue.getItems().length,dropStart=toy.position.clone();
  await tween(110,t=>toy.position.lerpVectors(dropStart,chuteEntry,t),t=>t*t);
  const startRot=toy.rotation.z;await tween(480,(e,raw)=>{toy.position.copy(curvePointForSlot(index,e));toy.rotation.z=startRot+Math.sin(raw*Math.PI*4)*.028*(1-raw);},easeInOutCubic);
  toy.userData.shadow.visible=true;toy.userData.status='slot';
  const resolution=slotQueue.add({id:toy.userData.toyId,type:toy.userData.type});
  if(resolution.pair){
    const a=toyMap.get(resolution.pair[0].id),b=toyMap.get(resolution.pair[1].id);
    reflowSlots(resolution.items);activePairAnimations++;
    pairWakeAndLeave(a,b).finally(()=>{activePairAnimations--;rescuedPairs++;rescuedEl.textContent=String(rescuedPairs);progressFill.style.width=`${Math.min(100,rescuedPairs/totalPairs*100)}%`;checkWin();});
  }else if(resolution.failed){gameEnded=true;setTimeout(()=>showResult(false),260);}
}
function reflowSlots(items){items.forEach((item,index)=>{const toy=toyMap.get(item.id);if(!toy||toy.userData.status!=='slot')return;tweenPos(toy,slotPositions[index],245,easeOutCubic);});}
function sparkleBurst(mid){
  const stars=[];for(let i=0;i<8;i++){const s=new THREE.Mesh(new THREE.CircleGeometry(.055+(i%3)*.017,16),basicMaterial(i%2?0xfff0a9:0xffffff,.95));s.position.copy(mid);s.position.z=7.9;effectsGroup.add(s);stars.push({s,a:(i/8)*Math.PI*2});}
  tween(380,e=>{for(const o of stars){o.s.position.x=mid.x+Math.cos(o.a)*.50*e;o.s.position.y=mid.y+Math.sin(o.a)*.42*e;o.s.scale.setScalar(1-e*.52);o.s.material.opacity=1-e;}}).then(()=>stars.forEach(o=>effectsGroup.remove(o.s)));
}
async function pairWakeAndLeave(a,b){
  a.userData.status='pairing';b.userData.status='pairing';a.userData.shadow.visible=false;b.userData.shadow.visible=false;
  const mid=new THREE.Vector3((a.position.x+b.position.x)/2,Math.min(a.position.y,b.position.y)-.02,7.12),pa=mid.clone().add(new THREE.Vector3(-.41,0,0)),pb=mid.clone().add(new THREE.Vector3(.41,0,0));
  await Promise.all([tweenPos(a,pa,170,easeOutCubic),tweenPos(b,pb,170,easeOutCubic)]);
  await tween(95,t=>{a.position.x=lerp(pa.x,mid.x-.24,t);b.position.x=lerp(pb.x,mid.x+.24,t);});
  sparkleBurst(mid);a.userData.status='awake';b.userData.status='awake';setAwake(a,true);setAwake(b,true);
  const sa=a.scale.x,sb=b.scale.x;await tween(195,(e,raw)=>{const pop=1+.17*Math.sin(raw*Math.PI);a.scale.setScalar(sa*pop);b.scale.setScalar(sb*pop);},easeOutCubic);a.scale.setScalar(sa);b.scale.setScalar(sb);
  await tween(170,(e,raw)=>{const sway=Math.sin(raw*Math.PI)*.10;a.rotation.z-=sway*.13;b.rotation.z+=sway*.13;a.position.y+=Math.sin(raw*Math.PI)*.055;b.position.y+=Math.sin(raw*Math.PI)*.055;});
  a.userData.status='leaving';b.userData.status='leaving';const leaveA=new THREE.Vector3(-6.0,-4.90,7.16),leaveB=new THREE.Vector3(-5.25,-4.66,7.16),sta=a.position.clone(),stb=b.position.clone();
  await tween(480,(e,raw)=>{a.position.lerpVectors(sta,leaveA,e);b.position.lerpVectors(stb,leaveB,e);const bounce=Math.abs(Math.sin(raw*Math.PI*4))*.07;a.position.y+=bounce;b.position.y+=bounce;},t=>t*t);
  a.userData.status='removed';b.userData.status='removed';a.visible=false;b.visible=false;
}
function checkWin(){if(gameEnded)return;if(blockGraph.getRemainingCount()===0&&slotQueue.getItems().length===0&&activePairAnimations===0){gameEnded=true;showResult(true);}}
function showResult(win){
  if(win){resultEmoji.textContent='✨';resultTitle.textContent='大家都找到朋友啦！';resultText.textContent='最后一对玩具也醒过来，一起离开了娃娃机。';}
  else{resultEmoji.textContent='🥺';resultTitle.textContent='大家都没找到朋友…';resultText.textContent='4个等待位都被不同玩具占住了，再试一次吧。';}
  overlay.classList.remove('hidden');
}
function updateDebug(){
  if(!debugVisible)return;const slots=slotQueue?.getItems().map(x=>x.type).join(', ')||'-',avail=blockGraph?.getAvailable().join(', ')||'-';
  debugEl.textContent=`Remaining: ${blockGraph?.getRemainingCount()??0}\nSlots: ${slots||'-'}\nAvailable: ${avail}\nClawBusy: ${clawBusy}\nPairAnimations: ${activePairAnimations}`;
}
function toyFromHit(obj){let cur=obj;while(cur){if(cur.userData?.toyRoot)return cur.userData.toyRoot;if(cur.userData?.toyId)return cur;cur=cur.parent;}return meshToToy.get(obj)??null;}
async function onPointerDown(ev){
  if(gameEnded||clawBusy)return;const rect=canvas.getBoundingClientRect();
  pointer.x=((ev.clientX-rect.left)/rect.width)*2-1;pointer.y=-((ev.clientY-rect.top)/rect.height)*2+1;raycaster.setFromCamera(pointer,camera);
  const meshes=[];for(const toy of clickableRoots)if(toy.visible&&toy.userData.status==='pile')meshes.push(toy.userData.sprite);
  const hits=raycaster.intersectObjects(meshes,false);if(!hits.length)return;const toy=toyFromHit(hits[0].object);if(!toy)return;
  const id=toy.userData.toyId;if(!blockGraph.canGrab(id)){shakeToy(toy);return;}await clawPick(toy);
}

canvas.addEventListener('pointerdown',onPointerDown);
document.querySelector('#restart').addEventListener('click',resetGame);
document.querySelector('#restartSmall').addEventListener('click',resetGame);
window.addEventListener('keydown',e=>{if(e.key.toLowerCase()==='d'){debugVisible=!debugVisible;debugEl.classList.toggle('hidden',!debugVisible);updateDebug();}if(e.key.toLowerCase()==='r')resetGame();});
window.addEventListener('resize',resize);

buildMachine();resetGame();resize();
function render(){updateDebug();renderer.render(scene,camera);requestAnimationFrame(render);}render();
