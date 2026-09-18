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
  bear:     { color: 0xf2a674, label: '小熊' },
  duck:     { color: 0xffd95e, label: '小鸭' },
  car:      { color: 0x77c9ef, label: '汽车' },
  rabbit:   { color: 0xf7b7cf, label: '兔子' },
  dinosaur: { color: 0x8ad79a, label: '恐龙' }
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffedf2);
const camera = new THREE.OrthographicCamera(-5.2, 5.2, 9.2, -9.2, 0.1, 100);
camera.position.set(0, 0, 25);
camera.lookAt(0, 0, 0);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

scene.add(new THREE.HemisphereLight(0xffffff, 0xb95b7d, 2.3));
const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
keyLight.position.set(-4, 8, 12);
keyLight.castShadow = true;
scene.add(keyLight);

const root = new THREE.Group();
scene.add(root);
const machine = new THREE.Group();
const pileGroup = new THREE.Group();
const effectsGroup = new THREE.Group();
root.add(machine, pileGroup, effectsGroup);

const toyMap = new Map();
const meshToToy = new Map();
const clickableRoots = [];
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let blockGraph;
let slotQueue;
let claw;
let clawBusy = false;
let gameEnded = false;
let activePairAnimations = 0;
let rescuedPairs = 0;
let totalPairs = TEST_LEVEL.toys.length / 2;
let debugVisible = false;
let hintTimer = 0;

pairTotalEl.textContent = String(totalPairs);

const slotPositions = [
  new THREE.Vector3(-3.45, -4.18, 5.1),
  new THREE.Vector3(-1.95, -3.98, 5.1),
  new THREE.Vector3(-0.45, -3.78, 5.1),
  new THREE.Vector3( 1.05, -3.58, 5.1)
];
const chuteEntry = new THREE.Vector3(4.15, -2.76, 5.0);
const exitPoint = new THREE.Vector3(4.10, -2.10, 4.9);
const pairMeetingPoint = new THREE.Vector3(-2.4, -4.55, 6.0);

function mat(color, roughness = .6, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function roundedBox(w, h, d, color, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d, 4, 4, 1), mat(color));
  mesh.position.z = z;
  return mesh;
}

function buildMachine() {
  const pink = 0xf09ab0;
  const darkPink = 0xd76c8c;
  const cream = 0xfff4e8;

  const back = roundedBox(9.6, 14.8, .3, 0xffd9e4, -1.5);
  back.position.y = -.1;
  machine.add(back);

  const glass = roundedBox(8.25, 7.15, .16, 0xfff5ec, -0.2);
  glass.position.set(0, 2.75, -0.2);
  glass.material.transparent = true;
  glass.material.opacity = .52;
  machine.add(glass);

  const left = roundedBox(.55, 8.2, .55, pink, 4.0); left.position.set(-4.45, 2.35, 0);
  const right = roundedBox(.55, 8.2, .55, pink, 4.0); right.position.set(4.45, 2.35, 0);
  const top = roundedBox(9.4, .65, .55, pink, 4.0); top.position.set(0, 6.35, 0);
  machine.add(left, right, top);

  const base = roundedBox(9.4, 3.9, .65, 0xf3a4b8, 3.6);
  base.position.set(0, -5.9, 0);
  machine.add(base);

  // Continuous right-to-left downward chute. No humps or dividers.
  const rampShape = new THREE.Shape();
  rampShape.moveTo(4.2, -2.55);
  rampShape.lineTo(-4.15, -4.55);
  rampShape.lineTo(-4.15, -5.05);
  rampShape.lineTo(4.2, -3.05);
  rampShape.closePath();
  const rampGeom = new THREE.ShapeGeometry(rampShape);
  const ramp = new THREE.Mesh(rampGeom, mat(0xffb0c3, .42));
  ramp.position.z = 4.35;
  machine.add(ramp);

  // One subtle lower lip following the same slope; it is not a slot divider.
  const lipGeom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(4.2, -3.05, 4.7),
    new THREE.Vector3(-4.15, -5.05, 4.7)
  ]);
  const lip = new THREE.Line(lipGeom, new THREE.LineBasicMaterial({ color: darkPink, linewidth: 2 }));
  machine.add(lip);

  const exit = roundedBox(1.45, 1.05, .3, darkPink, 5.0);
  exit.position.set(4.0, -1.95, 0);
  machine.add(exit);

  // Soft luminous parking marks; not physical seats or partitions.
  for (const p of slotPositions) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(.40, .47, 32),
      new THREE.MeshBasicMaterial({ color: 0xffe6ee, transparent: true, opacity: .48, side: THREE.DoubleSide })
    );
    ring.position.set(p.x, p.y - .34, 4.65);
    ring.rotation.x = 0;
    machine.add(ring);
  }

  const sign = roundedBox(4.8, .82, .35, cream, 4.2);
  sign.position.set(0, 5.75, 0);
  machine.add(sign);
}

function sphere(r, color) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 18), mat(color));
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

function box(w,h,d,color) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat(color));
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

function cylinder(r, h, color) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 20), mat(color));
  m.castShadow = true;
  return m;
}

function addFace(group, y, z, scale = 1) {
  const face = new THREE.Group();
  face.position.set(0, y, z);
  const sleepMat = new THREE.MeshBasicMaterial({ color: 0x6f5260 });
  const awakeMat = new THREE.MeshBasicMaterial({ color: 0x3b3035 });
  const sleepEyes = new THREE.Group();
  for (const sx of [-.16, .16]) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(.18*scale, .035*scale, .02), sleepMat);
    line.position.x = sx*scale;
    sleepEyes.add(line);
  }
  const awakeEyes = new THREE.Group(); awakeEyes.visible = false;
  for (const sx of [-.16, .16]) {
    const eye = new THREE.Mesh(new THREE.CircleGeometry(.065*scale, 18), awakeMat);
    eye.position.x = sx*scale;
    awakeEyes.add(eye);
  }
  const mouth = new THREE.Mesh(new THREE.CircleGeometry(.06*scale, 18, 0, Math.PI), awakeMat);
  mouth.rotation.z = Math.PI;
  mouth.position.set(0, -.13*scale, 0);
  awakeEyes.add(mouth);
  face.add(sleepEyes, awakeEyes);
  group.add(face);
  group.userData.face = { sleepEyes, awakeEyes };
}

function createToyVisual(type) {
  const g = new THREE.Group();
  const c = TYPE_META[type].color;

  if (type === 'bear') {
    const body = sphere(.48, c); body.position.y = -.18;
    const head = sphere(.42, c); head.position.y = .38;
    const e1 = sphere(.16, c); e1.position.set(-.28,.68,0);
    const e2 = sphere(.16, c); e2.position.set(.28,.68,0);
    g.add(body, head, e1, e2); addFace(g,.42,.40,1);
  } else if (type === 'duck') {
    const body = sphere(.46, c); body.scale.set(1.15,.9,1);
    const head = sphere(.34, c); head.position.set(.1,.45,0);
    const beak = box(.30,.12,.18,0xf39b4c); beak.position.set(.1,.34,.32);
    g.add(body, head, beak); addFace(g,.48,.33,.85);
  } else if (type === 'car') {
    const body = box(.95,.36,.45,c); body.position.y = -.02;
    const cabin = box(.48,.28,.40,0xd9f1fb); cabin.position.set(.05,.28,0);
    const wheelMat = 0x48515b;
    for (const x of [-.3,.3]) {
      const w = cylinder(.15,.12,wheelMat); w.rotation.z = Math.PI/2; w.position.set(x,-.23,.24); g.add(w);
    }
    g.add(body,cabin); addFace(g,.25,.23,.8);
  } else if (type === 'rabbit') {
    const body = sphere(.43,c); body.position.y = -.18;
    const head = sphere(.36,c); head.position.y = .38;
    for (const x of [-.15,.15]) {
      const ear = box(.18,.58,.18,c); ear.position.set(x,.90,0); ear.rotation.z = x < 0 ? -.08 : .08; g.add(ear);
    }
    g.add(body,head); addFace(g,.42,.35,.9);
  } else {
    const body = sphere(.48,c); body.scale.set(1.1,.9,1);
    const head = sphere(.32,c); head.position.set(.35,.35,0);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(.18,.55,20), mat(c)); tail.rotation.z = Math.PI/2; tail.position.set(-.58,.02,0);
    g.add(body,head,tail); addFace(g,.38,.31,.8);
  }

  g.traverse(o => { if (o.isMesh) o.userData.toyRoot = g; });
  return g;
}

function createToy(data) {
  const group = createToyVisual(data.type);
  group.position.set(...data.position);
  group.rotation.set(...data.rotation);
  group.scale.setScalar(.82 * (data.scale ?? 1));
  group.userData.toyId = data.id;
  group.userData.type = data.type;
  group.userData.status = 'pile';
  group.userData.baseScale = group.scale.x;
  group.userData.levelPosition = group.position.clone();
  group.userData.levelRotation = group.rotation.clone();
  pileGroup.add(group);
  toyMap.set(data.id, group);
  clickableRoots.push(group);
  group.traverse(o => { if (o.isMesh) meshToToy.set(o, group); });
  return group;
}

function createClaw() {
  const g = new THREE.Group();
  g.position.set(0,5.45,7);
  const stem = box(.16,1.05,.18,0xe67091); stem.position.y=.46;
  const hub = sphere(.24,0xf08aa6); hub.position.y=-.08;
  const left = box(.12,.72,.12,0xda6285); left.position.set(-.25,-.48,0); left.rotation.z=-.30;
  const right = box(.12,.72,.12,0xda6285); right.position.set(.25,-.48,0); right.rotation.z=.30;
  g.add(stem,hub,left,right);
  g.userData.left = left; g.userData.right = right;
  scene.add(g);
  return g;
}

function resetGame() {
  while (pileGroup.children.length) pileGroup.remove(pileGroup.children[0]);
  while (effectsGroup.children.length) effectsGroup.remove(effectsGroup.children[0]);
  toyMap.clear(); meshToToy.clear(); clickableRoots.length = 0;
  blockGraph = new BlockGraph(TEST_LEVEL.toys.map(t=>t.id), TEST_LEVEL.blocks);
  slotQueue = new SlotQueue(TEST_LEVEL.slotCapacity);
  clawBusy = false; gameEnded = false; activePairAnimations=0; rescuedPairs=0;
  overlay.classList.add('hidden');
  rescuedEl.textContent='0'; progressFill.style.width='0%';
  for (const data of TEST_LEVEL.toys) createToy(data);
  if (!claw) claw = createClaw();
  claw.position.set(0,5.45,7);
  updateDebug();
}

function resize() {
  const w = canvas.clientWidth || innerWidth;
  const h = canvas.clientHeight || innerHeight;
  renderer.setSize(w,h,false);
  const aspect = w/h;
  const worldH = 18.4;
  const worldW = worldH*aspect;
  camera.left=-worldW/2; camera.right=worldW/2; camera.top=worldH/2; camera.bottom=-worldH/2;
  camera.updateProjectionMatrix();
}

const now = () => performance.now();
const easeOutCubic = t => 1-Math.pow(1-t,3);
const easeInOutCubic = t => t<.5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2;
const easeOutBack = t => { const c1=1.70158,c3=c1+1; return 1+c3*Math.pow(t-1,3)+c1*Math.pow(t-1,2); };

function tween(duration, update, easing=easeInOutCubic) {
  return new Promise(resolve => {
    const start=now();
    function step() {
      const t=Math.min(1,(now()-start)/duration);
      update(easing(t),t);
      if(t<1) requestAnimationFrame(step); else resolve();
    }
    requestAnimationFrame(step);
  });
}

async function tweenPos(obj, target, ms, easing=easeInOutCubic) {
  const start=obj.position.clone();
  await tween(ms,t=>obj.position.lerpVectors(start,target,t),easing);
}

function showHint(text, ms=900) {
  hintEl.textContent=text;
  hintEl.classList.add('show');
  clearTimeout(hintTimer);
  hintTimer=setTimeout(()=>hintEl.classList.remove('show'),ms);
}

async function shakeToy(toy) {
  const base=toy.rotation.z;
  const blockers=blockGraph.getBlockers(toy.userData.toyId);
  showHint('它被压住啦！');
  for(const id of blockers) pulse(toyMap.get(id));
  await tween(280,(e,raw)=>{ toy.rotation.z=base+Math.sin(raw*Math.PI*6)*.08*(1-raw); });
  toy.rotation.z=base;
}

async function pulse(toy) {
  if(!toy) return;
  const base=toy.scale.x;
  await tween(260,(e,raw)=>{ const s=base*(1+.08*Math.sin(raw*Math.PI)); toy.scale.setScalar(s); });
  toy.scale.setScalar(base);
}

function setAwake(toy, awake) {
  const face=toy.userData.face;
  if(!face) return;
  face.sleepEyes.visible=!awake;
  face.awakeEyes.visible=awake;
}

async function animateUnlock(id) {
  const toy=toyMap.get(id); if(!toy || toy.userData.status!=='pile') return;
  const startY=toy.position.y, startR=toy.rotation.z;
  await tween(240,(e)=>{
    toy.position.y=startY-.16*e;
    toy.rotation.z=startR+.07*Math.sin(e*Math.PI);
  },easeOutBack);
}

async function clawPick(toy) {
  clawBusy=true;
  toy.userData.status='reserved';
  const id=toy.userData.toyId;
  blockGraph.reserve(id);

  const moveXTarget=new THREE.Vector3(toy.position.x,claw.position.y,claw.position.z);
  await tweenPos(claw,moveXTarget,150);
  const targetY=toy.position.y+1.05;
  await tween(135,t=>{ claw.position.y=THREE.MathUtils.lerp(5.45,targetY,t); });

  toy.userData.status='grabbing';
  const left=claw.userData.left, right=claw.userData.right;
  const lr=[left.rotation.z,right.rotation.z];
  await tween(75,t=>{ left.rotation.z=THREE.MathUtils.lerp(lr[0],-.08,t); right.rotation.z=THREE.MathUtils.lerp(lr[1],.08,t); });

  const toyStart=toy.position.clone();
  const clawStartY=claw.position.y;
  await tween(140,t=>{
    claw.position.y=THREE.MathUtils.lerp(clawStartY,5.45,t);
    toy.position.y=THREE.MathUtils.lerp(toyStart.y,4.4,t);
    toy.position.x=claw.position.x;
    toy.position.z=6.5;
  });

  const xStart=claw.position.x, toyXStart=toy.position.x;
  await tween(180,t=>{
    claw.position.x=THREE.MathUtils.lerp(xStart,4.10,t);
    toy.position.x=THREE.MathUtils.lerp(toyXStart,4.10,t);
  });

  // Release into right-side exit.
  left.rotation.z=lr[0]; right.rotation.z=lr[1];
  toy.userData.status='chute';
  const unlocked=blockGraph.removeToy(id);
  unlocked.forEach(animateUnlock);

  const dropStart=toy.position.clone();
  await tween(130,t=>{
    toy.position.lerpVectors(dropStart,exitPoint,t);
    toy.rotation.z += .015;
  },t=>t*t);

  await acceptFromChute(toy);
  clawBusy=false;
  updateDebug();
}

function curvePointForSlot(index,t) {
  const target=slotPositions[index];
  const p0=chuteEntry;
  const p1=new THREE.Vector3(3.2,-3.05,5.0);
  const p2=new THREE.Vector3(target.x+.8,target.y+.18,5.05);
  const curve=new THREE.CubicBezierCurve3(p0,p1,p2,target);
  return curve.getPoint(t);
}

async function acceptFromChute(toy) {
  const index=slotQueue.getItems().length;
  const dropStart=toy.position.clone();
  await tween(105,t=>toy.position.lerpVectors(dropStart,chuteEntry,t),t=>t*t);
  const startRot=toy.rotation.z;
  await tween(420,(e,raw)=>{
    toy.position.copy(curvePointForSlot(index,e));
    toy.rotation.z=startRot + Math.sin(raw*Math.PI*4)*.035*(1-raw);
  },easeInOutCubic);
  toy.userData.status='slot';

  const resolution=slotQueue.add({id:toy.userData.toyId,type:toy.userData.type});
  if(resolution.pair) {
    const a=toyMap.get(resolution.pair[0].id);
    const b=toyMap.get(resolution.pair[1].id);
    // Logic is already freed. Visual reflow and pair animation can run concurrently.
    reflowSlots(resolution.items);
    activePairAnimations++;
    pairWakeAndLeave(a,b).finally(()=>{
      activePairAnimations--;
      rescuedPairs++;
      rescuedEl.textContent=String(rescuedPairs);
      progressFill.style.width=`${Math.min(100,rescuedPairs/totalPairs*100)}%`;
      checkWin();
    });
  } else if(resolution.failed) {
    gameEnded=true;
    setTimeout(()=>showResult(false),260);
  }
}

function reflowSlots(items) {
  items.forEach((item,index)=>{
    const toy=toyMap.get(item.id);
    if(!toy || toy.userData.status!=='slot') return;
    tweenPos(toy,slotPositions[index],220,easeOutCubic);
  });
}

async function pairWakeAndLeave(a,b) {
  a.userData.status='pairing'; b.userData.status='pairing';
  const mid=new THREE.Vector3(
    (a.position.x+b.position.x)/2,
    Math.min(a.position.y,b.position.y)-.12,
    6.2
  );
  const pa=mid.clone().add(new THREE.Vector3(-.35,0,0));
  const pb=mid.clone().add(new THREE.Vector3(.35,0,0));
  await Promise.all([tweenPos(a,pa,150,easeOutCubic),tweenPos(b,pb,150,easeOutCubic)]);

  // Touch + tiny sparkle.
  const sparkle=sphere(.10,0xfff2a6); sparkle.position.copy(mid); sparkle.position.z=7.5; effectsGroup.add(sparkle);
  tween(240,(e)=>{ sparkle.scale.setScalar(1+e*3); sparkle.material.transparent=true; sparkle.material.opacity=1-e; }).then(()=>effectsGroup.remove(sparkle));
  await tween(90,t=>{ a.position.x=THREE.MathUtils.lerp(pa.x,mid.x-.22,t); b.position.x=THREE.MathUtils.lerp(pb.x,mid.x+.22,t); });

  a.userData.status='awake'; b.userData.status='awake'; setAwake(a,true); setAwake(b,true);
  const baseA=a.scale.x, baseB=b.scale.x;
  await tween(170,(e,raw)=>{
    const pop=1+.18*Math.sin(raw*Math.PI);
    a.scale.setScalar(baseA*pop); b.scale.setScalar(baseB*pop);
  },easeOutCubic);
  a.scale.setScalar(baseA); b.scale.setScalar(baseB);

  // Small type-flavored interaction.
  if(a.userData.type==='car') {
    await tween(120,(e,raw)=>{ a.rotation.z+=Math.sin(raw*Math.PI*4)*.006; b.rotation.z-=Math.sin(raw*Math.PI*4)*.006; });
  } else {
    await tween(130,(e,raw)=>{ a.rotation.z-=Math.sin(raw*Math.PI)*.10; b.rotation.z+=Math.sin(raw*Math.PI)*.10; });
  }

  a.userData.status='leaving'; b.userData.status='leaving';
  const leaveA=new THREE.Vector3(-6.2,-5.10,6.1);
  const leaveB=new THREE.Vector3(-5.5,-4.85,6.1);
  const sa=a.position.clone(), sb=b.position.clone();
  await tween(430,(e,raw)=>{
    a.position.lerpVectors(sa,leaveA,e); b.position.lerpVectors(sb,leaveB,e);
    const bounce=Math.abs(Math.sin(raw*Math.PI*4))*.08;
    a.position.y+=bounce; b.position.y+=bounce;
  },t=>t*t);
  a.userData.status='removed'; b.userData.status='removed';
  a.visible=false; b.visible=false;
}

function checkWin() {
  if(gameEnded) return;
  if(blockGraph.getRemainingCount()===0 && slotQueue.getItems().length===0 && activePairAnimations===0) {
    gameEnded=true;
    showResult(true);
  }
}

function showResult(win) {
  if(win) {
    resultEmoji.textContent='✨'; resultTitle.textContent='大家都找到朋友啦！'; resultText.textContent='最后一对玩具也醒过来，一起离开了娃娃机。';
  } else {
    resultEmoji.textContent='🥺'; resultTitle.textContent='大家都没找到朋友…'; resultText.textContent='4个等待位都被不同玩具占住了，再试一次吧。';
  }
  overlay.classList.remove('hidden');
}

function updateDebug() {
  if(!debugVisible) return;
  const slots=slotQueue?.getItems().map(x=>x.type).join(', ') || '-';
  const avail=blockGraph?.getAvailable().join(', ') || '-';
  debugEl.textContent=`Remaining: ${blockGraph?.getRemainingCount() ?? 0}\nSlots: ${slots || '-'}\nAvailable: ${avail}\nClawBusy: ${clawBusy}\nPairAnimations: ${activePairAnimations}`;
}

function toyFromHit(obj) {
  let cur=obj;
  while(cur) {
    if(cur.userData?.toyId) return cur;
    cur=cur.parent;
  }
  return meshToToy.get(obj) ?? null;
}

async function onPointerDown(ev) {
  if(gameEnded || clawBusy) return;
  const rect=canvas.getBoundingClientRect();
  pointer.x=((ev.clientX-rect.left)/rect.width)*2-1;
  pointer.y=-((ev.clientY-rect.top)/rect.height)*2+1;
  raycaster.setFromCamera(pointer,camera);
  const meshes=[];
  for(const toy of clickableRoots) if(toy.visible && ['pile'].includes(toy.userData.status)) toy.traverse(o=>{if(o.isMesh) meshes.push(o)});
  const hits=raycaster.intersectObjects(meshes,false);
  if(!hits.length) return;
  const toy=toyFromHit(hits[0].object); if(!toy) return;
  const id=toy.userData.toyId;
  if(!blockGraph.canGrab(id)) { shakeToy(toy); return; }
  await clawPick(toy);
}

canvas.addEventListener('pointerdown',onPointerDown);
document.querySelector('#restart').addEventListener('click',resetGame);
document.querySelector('#restartSmall').addEventListener('click',resetGame);
window.addEventListener('keydown',e=>{
  if(e.key.toLowerCase()==='d') { debugVisible=!debugVisible; debugEl.classList.toggle('hidden',!debugVisible); updateDebug(); }
  if(e.key.toLowerCase()==='r') resetGame();
});
window.addEventListener('resize',resize);

buildMachine();
resetGame();
resize();

function render() {
  updateDebug();
  renderer.render(scene,camera);
  requestAnimationFrame(render);
}
render();
