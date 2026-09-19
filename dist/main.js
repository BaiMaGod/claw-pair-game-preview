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
  bear:     { label: '小熊', size: [1.62, 1.92] },
  duck:     { label: '小鸭', size: [1.55, 1.78] },
  car:      { label: '汽车', size: [1.72, 1.48] },
  rabbit:   { label: '兔子', size: [1.58, 2.04] },
  dinosaur: { label: '恐龙', size: [1.72, 1.88] }
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffeaf1);
const camera = new THREE.OrthographicCamera(-5.2, 5.2, 9.2, -9.2, 0.1, 100);
camera.position.set(0, 0, 25);
camera.lookAt(0, 0, 0);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.07;

scene.add(new THREE.HemisphereLight(0xfffbf8, 0xc65f82, 1.75));
const keyLight = new THREE.DirectionalLight(0xfff2df, 1.4);
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
  new THREE.Vector3(-3.20, -4.42, 6.25),
  new THREE.Vector3(-1.80, -4.08, 6.25),
  new THREE.Vector3(-0.40, -3.74, 6.25),
  new THREE.Vector3( 1.00, -3.40, 6.25)
];
const chuteEntry = new THREE.Vector3(3.95, -2.64, 6.18);
const exitPoint = new THREE.Vector3(4.00, -1.98, 6.12);

function lerp(a,b,t){ return a+(b-a)*t; }
function roundedRectPath(ctx, x, y, w, h, r) {
  r = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}
function ellipse(ctx,x,y,rx,ry,fill,stroke=null,line=0){
  ctx.save(); ctx.beginPath(); ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);
  if(fill){ctx.fillStyle=fill;ctx.fill();}
  if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=line;ctx.stroke();}
  ctx.restore();
}
function circle(ctx,x,y,r,fill,stroke=null,line=0){ ellipse(ctx,x,y,r,r,fill,stroke,line); }
function softGradient(ctx, x, y, r, inner, outer){
  const g=ctx.createRadialGradient(x-r*.22,y-r*.28,r*.08,x,y,r);
  g.addColorStop(0,inner); g.addColorStop(1,outer); return g;
}
function drawSleepEyes(ctx, y, color='#6a4850'){
  ctx.save(); ctx.strokeStyle=color; ctx.lineWidth=12; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(202,y); ctx.lineTo(232,y+2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(280,y+2); ctx.lineTo(310,y); ctx.stroke(); ctx.restore();
}
function drawAwakeEyes(ctx, y, color='#4b3236'){
  for(const x of [218,294]){ circle(ctx,x,y,16,color); circle(ctx,x-5,y-6,5,'#fff'); }
}
function drawSmile(ctx,y,color='#6a3d45'){
  ctx.save(); ctx.strokeStyle=color; ctx.lineWidth=8; ctx.lineCap='round';
  ctx.beginPath(); ctx.arc(256,y,28,0.15*Math.PI,0.85*Math.PI); ctx.stroke(); ctx.restore();
}
function drawBlush(ctx,y){ ellipse(ctx,168,y,26,14,'rgba(255,135,157,.38)'); ellipse(ctx,344,y,26,14,'rgba(255,135,157,.38)'); }
function drawFabricSpecks(ctx, color='rgba(255,255,255,.13)'){
  ctx.save(); ctx.fillStyle=color;
  for(let i=0;i<70;i++){ const x=(i*83)%470+20; const y=(i*131)%560+40; const r=(i%3)+1; ctx.globalAlpha=.20+(i%5)*.04; ctx.fillRect(x,y,r,r); }
  ctx.restore();
}
function drawBow(ctx, y){
  ctx.save();
  const g=ctx.createLinearGradient(190,y-30,322,y+30); g.addColorStop(0,'#f25f7b'); g.addColorStop(1,'#c92f55'); ctx.fillStyle=g;
  ctx.beginPath(); ctx.moveTo(250,y); ctx.bezierCurveTo(210,y-42,174,y-36,190,y+9); ctx.bezierCurveTo(198,y+32,226,y+22,250,y+5); ctx.fill();
  ctx.beginPath(); ctx.moveTo(262,y); ctx.bezierCurveTo(302,y-42,338,y-36,322,y+9); ctx.bezierCurveTo(314,y+32,286,y+22,262,y+5); ctx.fill();
  circle(ctx,256,y,21,'#d63c5e'); ctx.restore();
}

function createToyTexture(type, awake=false){
  const key=`${type}:${awake?'awake':'sleep'}`;
  if(toyTextureCache.has(key)) return toyTextureCache.get(key);
  const c=document.createElement('canvas'); c.width=512; c.height=640;
  const ctx=c.getContext('2d'); ctx.clearRect(0,0,c.width,c.height);
  const floor=ctx.createRadialGradient(256,574,10,256,574,168); floor.addColorStop(0,'rgba(112,43,67,.18)'); floor.addColorStop(1,'rgba(112,43,67,0)');
  ellipse(ctx,256,574,170,44,floor);

  if(type==='bear'){
    const fur=softGradient(ctx,245,260,220,'#f3bd87','#b9683f');
    circle(ctx,158,162,62,softGradient(ctx,145,146,65,'#f6c995','#b86a42'));
    circle(ctx,354,162,62,softGradient(ctx,342,146,65,'#f6c995','#b86a42'));
    ellipse(ctx,256,406,142,156,fur); circle(ctx,256,245,138,fur);
    ellipse(ctx,173,448,56,82,fur); ellipse(ctx,339,448,56,82,fur);
    ellipse(ctx,192,530,66,48,fur); ellipse(ctx,320,530,66,48,fur);
    ellipse(ctx,256,282,67,54,'#f8dec0'); circle(ctx,256,267,17,'#663e38');
    drawBlush(ctx,315); drawBow(ctx,374); drawFabricSpecks(ctx);
    awake?drawAwakeEyes(ctx,230):drawSleepEyes(ctx,230); drawSmile(ctx,309);
  } else if(type==='rabbit'){
    const fur=softGradient(ctx,235,260,230,'#fffefc','#e9d6dc');
    ellipse(ctx,190,118,46,112,fur); ellipse(ctx,322,118,46,112,fur);
    ellipse(ctx,190,123,20,78,'#f4a9c0'); ellipse(ctx,322,123,20,78,'#f4a9c0');
    ellipse(ctx,256,423,138,154,fur); circle(ctx,256,270,138,fur);
    ellipse(ctx,176,465,54,76,fur); ellipse(ctx,336,465,54,76,fur);
    ellipse(ctx,195,536,65,42,fur); ellipse(ctx,317,536,65,42,fur);
    drawBlush(ctx,330); drawBow(ctx,395); circle(ctx,256,300,13,'#ef8da9'); drawFabricSpecks(ctx,'rgba(255,255,255,.35)');
    awake?drawAwakeEyes(ctx,255):drawSleepEyes(ctx,255); drawSmile(ctx,335);
  } else if(type==='duck'){
    const yellow=softGradient(ctx,220,245,225,'#fff49c','#e8b82e');
    ellipse(ctx,252,423,156,142,yellow); circle(ctx,263,267,128,yellow);
    ellipse(ctx,134,424,58,82,yellow); ellipse(ctx,377,424,58,82,yellow);
    const beak=ctx.createLinearGradient(205,320,308,356); beak.addColorStop(0,'#ffad45'); beak.addColorStop(1,'#e87521');
    ctx.fillStyle=beak; roundedRectPath(ctx,193,308,126,52,25); ctx.fill();
    drawBlush(ctx,352); drawFabricSpecks(ctx,'rgba(255,255,255,.18)');
    awake?drawAwakeEyes(ctx,245):drawSleepEyes(ctx,245);
  } else if(type==='dinosaur'){
    const green=softGradient(ctx,220,250,230,'#a8edb3','#45a76b');
    ellipse(ctx,244,422,154,145,green); circle(ctx,272,270,126,green);
    ellipse(ctx,124,435,74,54,green); ellipse(ctx,363,435,58,82,green);
    ctx.fillStyle='#75cf85';
    for(let i=0;i<5;i++){ ctx.beginPath(); ctx.moveTo(318+i*28,180+i*38); ctx.lineTo(350+i*22,139+i*39); ctx.lineTo(369+i*23,199+i*34); ctx.fill(); }
    ellipse(ctx,258,441,90,104,'#d7f5c0'); drawBlush(ctx,338); drawFabricSpecks(ctx,'rgba(255,255,255,.16)');
    awake?drawAwakeEyes(ctx,255):drawSleepEyes(ctx,255); drawSmile(ctx,329);
  } else {
    const blue=ctx.createLinearGradient(90,190,410,495); blue.addColorStop(0,'#7cc8ff'); blue.addColorStop(.5,'#3686d8'); blue.addColorStop(1,'#1e5fae');
    ctx.fillStyle=blue; roundedRectPath(ctx,88,300,336,178,56); ctx.fill();
    ctx.fillStyle='#edf7ff'; roundedRectPath(ctx,152,226,218,125,40); ctx.fill();
    ctx.fillStyle='#6aaee4'; roundedRectPath(ctx,171,245,77,79,18); ctx.fill(); roundedRectPath(ctx,273,245,77,79,18); ctx.fill();
    ctx.fillStyle='rgba(255,255,255,.88)'; ctx.fillRect(238,226,22,252); ctx.fillRect(274,226,16,252);
    for(const x of [148,364]){ circle(ctx,x,463,55,'#344150'); circle(ctx,x,463,27,'#d9e8ef'); }
    circle(ctx,128,369,26,'#fff7b7'); circle(ctx,383,369,26,'#fff7b7');
    drawBlush(ctx,411); awake?drawAwakeEyes(ctx,363,'#183547'):drawSleepEyes(ctx,363,'#24465d'); drawSmile(ctx,414,'#24465d');
  }
  const texture=new THREE.CanvasTexture(c); texture.colorSpace=THREE.SRGBColorSpace; texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  toyTextureCache.set(key,texture); return texture;
}

function createShadowTexture(){
  const c=document.createElement('canvas'); c.width=256;c.height=128; const ctx=c.getContext('2d');
  const g=ctx.createRadialGradient(128,64,5,128,64,112); g.addColorStop(0,'rgba(97,46,62,.32)'); g.addColorStop(.45,'rgba(97,46,62,.16)'); g.addColorStop(1,'rgba(97,46,62,0)');
  ellipse(ctx,128,64,114,43,g); const t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace; return t;
}
const shadowTexture=createShadowTexture();

function makePanelTexture(){
  const c=document.createElement('canvas'); c.width=1024;c.height=1024; const ctx=c.getContext('2d');
  const g=ctx.createLinearGradient(0,0,0,1024); g.addColorStop(0,'#fff8fb'); g.addColorStop(.55,'#f9d8e5'); g.addColorStop(1,'#efb8ce'); ctx.fillStyle=g; ctx.fillRect(0,0,1024,1024);
  const dots=[['#ffd369',120,130,70],['#a8d8ff',830,190,90],['#ff8eae',745,510,130],['#c3f1cf',250,590,105],['#fff0a8',505,330,95]];
  for(const [col,x,y,r] of dots){ ctx.globalAlpha=.23; circle(ctx,x,y,r,col); } ctx.globalAlpha=1;
  const posters=[{x:90,y:130,w:250,h:350,rot:-.08,text:['PLAY','CATCH','MATCH','SMILE!']},{x:680,y:110,w:250,h:365,rot:.08,text:['GOOD','TOYS','HAPPY','DAY']}];
  for(const p of posters){ ctx.save();ctx.translate(p.x+p.w/2,p.y+p.h/2);ctx.rotate(p.rot);ctx.fillStyle='rgba(255,249,238,.62)';roundedRectPath(ctx,-p.w/2,-p.h/2,p.w,p.h,28);ctx.fill();ctx.fillStyle='#d56e8e';ctx.font='700 42px system-ui';ctx.textAlign='center';p.text.forEach((s,i)=>ctx.fillText(s,0,-85+i*64));ctx.restore(); }
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}

function basicMaterial(color, opacity=1){ return new THREE.MeshBasicMaterial({color,transparent:opacity<1,opacity,depthWrite:false,toneMapped:false,side:THREE.DoubleSide}); }
function plane(w,h,material,z=0){ const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),material); m.position.z=z; return m; }
function box(w,h,d,color,z=0,roughness=.38,metalness=.05){ const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color,roughness,metalness}));m.position.z=z;return m; }
function sphere(r,color){ return new THREE.Mesh(new THREE.SphereGeometry(r,28,18),new THREE.MeshStandardMaterial({color,roughness:.30,metalness:.05})); }

function buildMachine(){
  const backdrop=plane(8.55,8.0,new THREE.MeshBasicMaterial({map:makePanelTexture(),toneMapped:false}),-.6); backdrop.position.y=2.32; machineBack.add(backdrop);
  const innerFloor=plane(8.55,1.05,basicMaterial(0xf7bed2),-.45); innerFloor.position.y=-1.35; machineBack.add(innerFloor);
  const pink=0xef86aa, deep=0xd75581, pale=0xffc1d4;
  const left=box(.72,8.55,.46,pink,5.3); left.position.set(-4.54,2.18,0);
  const right=box(.72,8.55,.46,pink,5.3); right.position.set(4.54,2.18,0);
  const top=box(9.55,.72,.46,pink,5.3); top.position.set(0,6.28,0);
  const sill=box(9.05,.54,.42,pale,5.15); sill.position.set(0,-1.53,0); machineFront.add(left,right,top,sill);
  const lhi=box(.11,8.10,.05,0xffdbe6,5.58);lhi.position.set(-4.34,2.25,0);
  const rhi=box(.11,8.10,.05,0xffdbe6,5.58);rhi.position.set(4.34,2.25,0);
  const thi=box(9.15,.11,.05,0xffdbe6,5.58);thi.position.set(0,6.08,0); machineFront.add(lhi,rhi,thi);
  const base=box(9.55,3.75,.55,0xe987a7,4.85); base.position.set(0,-5.88,0); machineBack.add(base);
  const baseFront=box(9.25,1.10,.12,0xd96d93,5.1);baseFront.position.set(0,-6.78,0);machineFront.add(baseFront);

  const rampShape=new THREE.Shape(); rampShape.moveTo(4.12,-2.58); rampShape.lineTo(-4.08,-4.58); rampShape.lineTo(-4.08,-5.12); rampShape.lineTo(4.12,-3.12); rampShape.closePath();
  const ramp=new THREE.Mesh(new THREE.ShapeGeometry(rampShape),new THREE.MeshStandardMaterial({color:0xf6a9c0,roughness:.20,metalness:.02,transparent:true,opacity:.95,side:THREE.DoubleSide}));ramp.position.z=5.52;machineFront.add(ramp);
  const rail=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(4.08,-2.58,5.72),new THREE.Vector3(-4.08,-4.58,5.72)]),new THREE.LineBasicMaterial({color:0xffe3eb,transparent:true,opacity:.95}));machineFront.add(rail);
  const lower=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(4.08,-3.10,5.72),new THREE.Vector3(-4.08,-5.10,5.72)]),new THREE.LineBasicMaterial({color:deep,transparent:true,opacity:.55}));machineFront.add(lower);

  const exitBack=plane(1.26,1.65,basicMaterial(0x703d52,.98),5.48); exitBack.position.set(3.92,-1.86,0); machineFront.add(exitBack);
  const exitTop=box(1.55,.28,.34,pink,5.82); exitTop.position.set(3.92,-1.02,0);
  const exitRight=box(.28,1.88,.34,pink,5.82); exitRight.position.set(4.56,-1.86,0);
  const exitLeft=box(.20,1.35,.26,pale,5.78); exitLeft.position.set(3.30,-1.72,0); machineFront.add(exitTop,exitRight,exitLeft);

  for(const p of slotPositions){ const ring=new THREE.Mesh(new THREE.RingGeometry(.43,.48,40),new THREE.MeshBasicMaterial({color:0xfff4f7,transparent:true,opacity:.64,side:THREE.DoubleSide,depthWrite:false,toneMapped:false})); ring.position.set(p.x,p.y-.23,5.78); machineFront.add(ring); }

  const glass=plane(8.62,7.92,basicMaterial(0xeefaff,.085),5.92); glass.position.y=2.30; machineFront.add(glass);
  const refl1=plane(.28,7.1,basicMaterial(0xffffff,.12),5.98);refl1.position.set(-2.65,2.4,0);refl1.rotation.z=-.10;
  const refl2=plane(.15,4.0,basicMaterial(0xffffff,.09),5.98);refl2.position.set(2.95,3.05,0);refl2.rotation.z=-.10;machineFront.add(refl1,refl2);
  for(const x of [-2.7,0,2.7]){ const lamp=plane(.75,.12,basicMaterial(0xfff3cc,.85),5.94); lamp.position.set(x,5.73,0); machineFront.add(lamp); }
}

function createToyVisual(type){
  const g=new THREE.Group(),meta=TYPE_META[type];
  const shadow=plane(meta.size[0]*1.05,.58,new THREE.MeshBasicMaterial({map:shadowTexture,transparent:true,opacity:.48,depthWrite:false,toneMapped:false}),-.06); shadow.position.y=-meta.size[1]*.40;
  const normal=createToyTexture(type,false),awake=createToyTexture(type,true);
  const sprite=plane(meta.size[0],meta.size[1],new THREE.MeshBasicMaterial({map:normal,transparent:true,alphaTest:.02,depthWrite:false,toneMapped:false,side:THREE.DoubleSide}),.03);
  g.add(shadow,sprite); g.userData.sprite=sprite;g.userData.shadow=shadow;g.userData.normalTexture=normal;g.userData.awakeTexture=awake;sprite.userData.toyRoot=g; return g;
}
function createToy(data){ const group=createToyVisual(data.type);group.position.set(...data.position);group.rotation.set(...data.rotation);group.scale.setScalar(data.scale??1);group.userData.toyId=data.id;group.userData.type=data.type;group.userData.status='pile';group.userData.baseScale=group.scale.x;pileGroup.add(group);toyMap.set(data.id,group);clickableRoots.push(group);meshToToy.set(group.userData.sprite,group);return group; }

function createClaw(){
  const g=new THREE.Group();g.position.set(0,5.35,7.2);
  const chrome=new THREE.MeshStandardMaterial({color:0xeaf2f6,roughness:.16,metalness:.82}),pink=new THREE.MeshStandardMaterial({color:0xe86793,roughness:.24,metalness:.20});
  const rod=new THREE.Mesh(new THREE.CylinderGeometry(.11,.11,1.12,24),chrome);rod.position.y=.52;
  const hub=sphere(.32,0xe96f98);hub.material=pink;hub.position.y=-.03;
  const collar=new THREE.Mesh(new THREE.CylinderGeometry(.23,.23,.25,24),chrome);collar.position.y=.16;
  const left=new THREE.Mesh(new THREE.CapsuleGeometry(.075,.62,5,14),chrome);left.position.set(-.30,-.48,0);left.rotation.z=-.42;
  const right=new THREE.Mesh(new THREE.CapsuleGeometry(.075,.62,5,14),chrome);right.position.set(.30,-.48,0);right.rotation.z=.42;
  const tipL=sphere(.095,0xe96f98);tipL.material=pink;tipL.position.set(-.48,-.78,0);const tipR=sphere(.095,0xe96f98);tipR.material=pink;tipR.position.set(.48,-.78,0);
  g.add(rod,hub,collar,left,right,tipL,tipR);g.userData.left=left;g.userData.right=right;scene.add(g);return g;
}

function resetGame(){
  while(pileGroup.children.length)pileGroup.remove(pileGroup.children[0]);while(effectsGroup.children.length)effectsGroup.remove(effectsGroup.children[0]);
  toyMap.clear();meshToToy.clear();clickableRoots.length=0;blockGraph=new BlockGraph(TEST_LEVEL.toys.map(t=>t.id),TEST_LEVEL.blocks);slotQueue=new SlotQueue(TEST_LEVEL.slotCapacity);
  clawBusy=false;gameEnded=false;activePairAnimations=0;rescuedPairs=0;overlay.classList.add('hidden');rescuedEl.textContent='0';progressFill.style.width='0%';
  for(const data of TEST_LEVEL.toys)createToy(data);if(!claw)claw=createClaw();claw.position.set(0,5.35,7.2);updateDebug();
}
function resize(){ const w=canvas.clientWidth||innerWidth,h=canvas.clientHeight||innerHeight;renderer.setSize(w,h,false);const aspect=w/h,worldH=18.4,worldW=worldH*aspect;camera.left=-worldW/2;camera.right=worldW/2;camera.top=worldH/2;camera.bottom=-worldH/2;camera.updateProjectionMatrix(); }
const now=()=>performance.now(),easeOutCubic=t=>1-Math.pow(1-t,3),easeInOutCubic=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2,easeOutBack=t=>{const c1=1.70158,c3=c1+1;return 1+c3*Math.pow(t-1,3)+c1*Math.pow(t-1,2);};
function tween(duration,update,easing=easeInOutCubic){return new Promise(resolve=>{const start=now();function step(){const t=Math.min(1,(now()-start)/duration);update(easing(t),t);if(t<1)requestAnimationFrame(step);else resolve();}requestAnimationFrame(step);});}
async function tweenPos(obj,target,ms,easing=easeInOutCubic){const start=obj.position.clone();await tween(ms,t=>obj.position.lerpVectors(start,target,t),easing);}
function showHint(text,ms=900){hintEl.textContent=text;hintEl.classList.add('show');clearTimeout(hintTimer);hintTimer=setTimeout(()=>hintEl.classList.remove('show'),ms);}
async function pulse(toy){if(!toy)return;const base=toy.scale.x;await tween(280,(e,raw)=>{const s=base*(1+.10*Math.sin(raw*Math.PI));toy.scale.setScalar(s);});toy.scale.setScalar(base);}
async function shakeToy(toy){const base=toy.rotation.z,blockers=blockGraph.getBlockers(toy.userData.toyId);showHint('它被压住啦！先抓上面的玩具');for(const id of blockers)pulse(toyMap.get(id));await tween(300,(e,raw)=>{toy.rotation.z=base+Math.sin(raw*Math.PI*7)*.055*(1-raw);});toy.rotation.z=base;}
function setAwake(toy,awake){const sprite=toy?.userData?.sprite;if(!sprite)return;sprite.material.map=awake?toy.userData.awakeTexture:toy.userData.normalTexture;sprite.material.needsUpdate=true;}
async function animateUnlock(id){const toy=toyMap.get(id);if(!toy||toy.userData.status!=='pile')return;const sy=toy.position.y,sx=toy.position.x,sr=toy.rotation.z,drift=Math.sign(sx||1)*.05;await tween(270,e=>{toy.position.y=sy-.18*e;toy.position.x=sx+drift*e;toy.rotation.z=sr+.055*Math.sin(e*Math.PI);},easeOutBack);}

async function clawPick(toy){
  clawBusy=true;toy.userData.status='reserved';toy.userData.shadow.visible=false;const id=toy.userData.toyId;blockGraph.reserve(id);
  const startClawY=claw.position.y;await tweenPos(claw,new THREE.Vector3(toy.position.x,startClawY,claw.position.z),160,easeOutCubic);
  const targetY=toy.position.y+1.00,downStart=claw.position.y;await tween(150,t=>claw.position.y=lerp(downStart,targetY,t));
  toy.userData.status='grabbing';const left=claw.userData.left,right=claw.userData.right,l0=left.rotation.z,r0=right.rotation.z;await tween(90,t=>{left.rotation.z=lerp(l0,-.14,t);right.rotation.z=lerp(r0,.14,t);});
  const toyStart=toy.position.clone(),clawY=claw.position.y;await tween(160,(e,raw)=>{claw.position.y=lerp(clawY,5.35,e);toy.position.y=lerp(toyStart.y,4.34,e);toy.position.x=claw.position.x;toy.position.z=6.55;toy.rotation.z=toyStart.z+Math.sin(raw*Math.PI)*.04;},easeOutCubic);
  const cx=claw.position.x,tx=toy.position.x;await tween(195,t=>{claw.position.x=lerp(cx,4.0,t);toy.position.x=lerp(tx,4.0,t);},easeInOutCubic);
  left.rotation.z=l0;right.rotation.z=r0;toy.userData.status='chute';const unlocked=blockGraph.removeToy(id);unlocked.forEach(animateUnlock);
  const dropStart=toy.position.clone();await tween(145,(e,raw)=>{toy.position.lerpVectors(dropStart,exitPoint,e);toy.rotation.z+=.012*(1-raw);},t=>t*t);
  await acceptFromChute(toy);clawBusy=false;updateDebug();
}
function curvePointForSlot(index,t){const target=slotPositions[index],p0=chuteEntry,p1=new THREE.Vector3(3.20,-2.86,6.2),p2=new THREE.Vector3(target.x+.72,target.y+.20,6.24);return new THREE.CubicBezierCurve3(p0,p1,p2,target).getPoint(t);}
async function acceptFromChute(toy){
  const index=slotQueue.getItems().length,dropStart=toy.position.clone();await tween(105,t=>toy.position.lerpVectors(dropStart,chuteEntry,t),t=>t*t);
  const startRot=toy.rotation.z;await tween(465,(e,raw)=>{toy.position.copy(curvePointForSlot(index,e));toy.rotation.z=startRot+Math.sin(raw*Math.PI*4)*.028*(1-raw);},easeInOutCubic);
  toy.userData.shadow.visible=true;toy.userData.status='slot';const resolution=slotQueue.add({id:toy.userData.toyId,type:toy.userData.type});
  if(resolution.pair){const a=toyMap.get(resolution.pair[0].id),b=toyMap.get(resolution.pair[1].id);reflowSlots(resolution.items);activePairAnimations++;pairWakeAndLeave(a,b).finally(()=>{activePairAnimations--;rescuedPairs++;rescuedEl.textContent=String(rescuedPairs);progressFill.style.width=`${Math.min(100,rescuedPairs/totalPairs*100)}%`;checkWin();});}
  else if(resolution.failed){gameEnded=true;setTimeout(()=>showResult(false),260);}
}
function reflowSlots(items){items.forEach((item,index)=>{const toy=toyMap.get(item.id);if(!toy||toy.userData.status!=='slot')return;tweenPos(toy,slotPositions[index],240,easeOutCubic);});}
function sparkleBurst(mid){const stars=[];for(let i=0;i<7;i++){const s=new THREE.Mesh(new THREE.CircleGeometry(.055+(i%3)*.018,16),basicMaterial(i%2?0xfff0a9:0xffffff,.95));s.position.copy(mid);s.position.z=7.8;effectsGroup.add(s);stars.push({s,a:(i/7)*Math.PI*2});}tween(360,(e)=>{for(const o of stars){o.s.position.x=mid.x+Math.cos(o.a)*.48*e;o.s.position.y=mid.y+Math.sin(o.a)*.38*e;o.s.scale.setScalar(1-e*.55);o.s.material.opacity=1-e;}}).then(()=>stars.forEach(o=>effectsGroup.remove(o.s)));}
async function pairWakeAndLeave(a,b){
  a.userData.status='pairing';b.userData.status='pairing';a.userData.shadow.visible=false;b.userData.shadow.visible=false;
  const mid=new THREE.Vector3((a.position.x+b.position.x)/2,Math.min(a.position.y,b.position.y)-.04,7.05),pa=mid.clone().add(new THREE.Vector3(-.40,0,0)),pb=mid.clone().add(new THREE.Vector3(.40,0,0));
  await Promise.all([tweenPos(a,pa,165,easeOutCubic),tweenPos(b,pb,165,easeOutCubic)]);await tween(95,t=>{a.position.x=lerp(pa.x,mid.x-.24,t);b.position.x=lerp(pb.x,mid.x+.24,t);});
  sparkleBurst(mid);a.userData.status='awake';b.userData.status='awake';setAwake(a,true);setAwake(b,true);const sa=a.scale.x,sb=b.scale.x;
  await tween(190,(e,raw)=>{const pop=1+.16*Math.sin(raw*Math.PI);a.scale.setScalar(sa*pop);b.scale.setScalar(sb*pop);},easeOutCubic);a.scale.setScalar(sa);b.scale.setScalar(sb);
  await tween(165,(e,raw)=>{const sway=Math.sin(raw*Math.PI)*.10;a.rotation.z-=sway*.12;b.rotation.z+=sway*.12;a.position.y+=Math.sin(raw*Math.PI)*.05;b.position.y+=Math.sin(raw*Math.PI)*.05;});
  a.userData.status='leaving';b.userData.status='leaving';const leaveA=new THREE.Vector3(-6.0,-4.92,7.1),leaveB=new THREE.Vector3(-5.30,-4.68,7.1),sta=a.position.clone(),stb=b.position.clone();
  await tween(470,(e,raw)=>{a.position.lerpVectors(sta,leaveA,e);b.position.lerpVectors(stb,leaveB,e);const bounce=Math.abs(Math.sin(raw*Math.PI*4))*.07;a.position.y+=bounce;b.position.y+=bounce;},t=>t*t);
  a.userData.status='removed';b.userData.status='removed';a.visible=false;b.visible=false;
}
function checkWin(){if(gameEnded)return;if(blockGraph.getRemainingCount()===0&&slotQueue.getItems().length===0&&activePairAnimations===0){gameEnded=true;showResult(true);}}
function showResult(win){if(win){resultEmoji.textContent='✨';resultTitle.textContent='大家都找到朋友啦！';resultText.textContent='最后一对玩具也醒过来，一起离开了娃娃机。';}else{resultEmoji.textContent='🥺';resultTitle.textContent='大家都没找到朋友…';resultText.textContent='4个等待位都被不同玩具占住了，再试一次吧。';}overlay.classList.remove('hidden');}
function updateDebug(){if(!debugVisible)return;const slots=slotQueue?.getItems().map(x=>x.type).join(', ')||'-',avail=blockGraph?.getAvailable().join(', ')||'-';debugEl.textContent=`Remaining: ${blockGraph?.getRemainingCount()??0}\nSlots: ${slots||'-'}\nAvailable: ${avail}\nClawBusy: ${clawBusy}\nPairAnimations: ${activePairAnimations}`;}
function toyFromHit(obj){let cur=obj;while(cur){if(cur.userData?.toyRoot)return cur.userData.toyRoot;if(cur.userData?.toyId)return cur;cur=cur.parent;}return meshToToy.get(obj)??null;}
async function onPointerDown(ev){if(gameEnded||clawBusy)return;const rect=canvas.getBoundingClientRect();pointer.x=((ev.clientX-rect.left)/rect.width)*2-1;pointer.y=-((ev.clientY-rect.top)/rect.height)*2+1;raycaster.setFromCamera(pointer,camera);const meshes=[];for(const toy of clickableRoots)if(toy.visible&&toy.userData.status==='pile')meshes.push(toy.userData.sprite);const hits=raycaster.intersectObjects(meshes,false);if(!hits.length)return;const toy=toyFromHit(hits[0].object);if(!toy)return;const id=toy.userData.toyId;if(!blockGraph.canGrab(id)){shakeToy(toy);return;}await clawPick(toy);}

canvas.addEventListener('pointerdown',onPointerDown);
document.querySelector('#restart').addEventListener('click',resetGame);
document.querySelector('#restartSmall').addEventListener('click',resetGame);
window.addEventListener('keydown',e=>{if(e.key.toLowerCase()==='d'){debugVisible=!debugVisible;debugEl.classList.toggle('hidden',!debugVisible);updateDebug();}if(e.key.toLowerCase()==='r')resetGame();});
window.addEventListener('resize',resize);

buildMachine();resetGame();resize();
function render(){updateDebug();renderer.render(scene,camera);requestAnimationFrame(render);}render();
