import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { TYPES } from '../js/types.js';
import { PRJ, loadType, plansByFloor } from '../js/project.js';
import { buildWalkthrough, groundVisit, motionProfile, EYE_HEIGHT, visitFloors, levelY } from '../js/walkthrough.js';
import { P, progressPerSecond, storyToScroll, scrollToStory } from '../js/story.js';
import { columnAxes, ENTRANCE_WIDTH, resolveEntrances } from '../js/access.js';
import { scaleType } from '../js/law.js';
import { createWalkInput } from '../js/scroll-motion.js';
import { finishPatches } from '../js/rect-patches.js';

// Use the same pinned three.js build as the browser. Set THREE_TEST_MODULE for another local copy.
let threeURL;
if(process.env.THREE_TEST_MODULE)threeURL=pathToFileURL(process.env.THREE_TEST_MODULE).href;
else {
  try {threeURL=import.meta.resolve('three');}
  catch {threeURL=new URL('../../Claude%20outputs/camera-tests/three.mjs',import.meta.url).href;}
}
const THREE = await import(threeURL);
const cameraURL = new URL('../js/camera.js', import.meta.url);
const source = (await fs.readFile(cameraURL, 'utf8')).replace("'three'", JSON.stringify(threeURL))
  .replace("'./project.js'", JSON.stringify(new URL('../js/project.js', import.meta.url).href));
const { makeTour, poseToKey, setCam, camAt } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const elevatorSource = (await fs.readFile(new URL('../js/elevator.js', import.meta.url), 'utf8')).replace("'three'", JSON.stringify(threeURL));
const { createElevator } = await import(`data:text/javascript;base64,${Buffer.from(elevatorSource).toString('base64')}`);
// Canvas text is irrelevant to geometry; the cabin itself uses real Three.js meshes and ray casting.
globalThis.document = { createElement: () => ({ getContext: () => ({ fillRect() {}, fillText() {} }) }) };
const near = (a, b, message) => assert.ok(Math.abs(a - b) < 1e-6, `${message}: ${a} != ${b}`);
const area = r => (r[2] - r[0]) * (r[3] - r[1]);
const overlap = (a,b) => Math.max(0,Math.min(a[2],b[2])-Math.max(a[0],b[0])) * Math.max(0,Math.min(a[3],b[3])-Math.max(a[1],b[1]));
near(finishPatches([0,0,10,10], [[2,2,4,4],[6,6,8,8]]).reduce((sum,r)=>sum+area(r),0),92,'multiple shaft area conservation');
assert.equal(Object.keys(TYPES).length, 4);
assert.equal(TYPES.geunsaeng, undefined, 'neighbourhood building merged into mid-size (v4.1)');
assert.equal(TYPES.dagagu, undefined);
loadType('dagagu'); assert.equal(PRJ.key, 'dasedae', 'old bookmark uses retained type');
loadType('geunsaeng'); assert.equal(PRJ.key, 'midsize', 'old neighbourhood bookmark opens the mid-size building');
for(let p=0;p<=1;p+=.001)near(scrollToStory(storyToScroll(p)),p,'scroll and story mapping are reversible');
near(storyToScroll(P.close)-storyToScroll(P.land),.48,'48% of scroll track belongs to interior (v4.1)');
const wheel=createWalkInput();let walked=0;
for(let ms=0;ms<=5000;ms+=16)walked+=wheel(1000,ms);
assert.ok(walked>30&&walked<=31.6,'sustained wheel input runs at about 6x route time while keeping a bounded budget');
near(wheel(0,5100),0,'no route progress without input');
assert.ok(wheel(-1000,5500)<0,'reverse scroll reverses walking');
let frontSeconds=0;
for(let i=0;i<9;i++){const a=[0,P.flat,P.open,P.lawEnd,P.buildEnd,P.street,P.secOut,P.cut,P.planHold][i];const b=[P.flat,P.open,P.lawEnd,P.buildEnd,P.street,P.secOut,P.cut,P.planHold,P.land][i];frontSeconds+=(b-a)/progressPerSecond(a);}
assert.ok(frontSeconds<=80,'front sequence has a shorter explicit rhythm');
for(const key of ['midsize'])for(const scale of [.8,.9,1,1.2]){
  const T=resolveEntrances(scaleType(TYPES[key],scale,TYPES[key].floors,TYPES[key].law));
  const grid=columnAxes(T);
  for(const door of T.frontDoors)for(const col of grid.xs)assert.ok(Math.abs(door-col)>ENTRANCE_WIDTH/2+grid.width/2+.2,`${key}: doorway and column clearance at ${scale}`);
  near(T.tour[0].pos[0],T.frontDoors[0],`${key}: camera uses actual entrance`);
}
for (const key of Object.keys(TYPES)) {
  loadType(key); const T = PRJ.T, profile = motionProfile(T), keys = buildWalkthrough(T);
  const tour = makeTour(keys, 0, { speed: profile.speed });
  assert.ok(tour.duration > 120 && tour.duration < 1000, `${key}: human-paced duration (${tour.duration})`);
  near((P.close - P.land) / progressPerSecond(P.land, tour.duration), tour.duration, `${key}: playback uses route seconds`);
  const phases = new Set(), trips=new Map(); let prev = null, prevDir=null,maxSpeed = 0,maxWalkSpeed=0,maxTurn=0;
  const floorPlans=new Map(plansByFloor().map(([n,p])=>[n,p]));
  for(const stop of tour.stops){
    const floor=stop.floor||1;
    assert.ok(floorPlans.get(floor)?.rooms.some(r=>r.id===stop.room),`${key}: ${stop.title} resolves on its actual floor`);
  }
  if(T.core)for(const n of visitFloors(T))assert.ok(tour.stops.some(s=>s.floor===n&&s.kind!=='elevator'),`${key}: real interior visit on floor ${n}`);
  for (let i = 0; i <= 12000; i++) {
    const s = tour.sample(i / 12000);
    assert.equal(s.dwell,false,`${key}: automatic playback never dwells at room markers`);
    for (const v of [...s.pos.toArray(), ...s.look.toArray()]) assert.ok(Number.isFinite(v), `${key}: finite pose`);
    near(s.pos.distanceTo(s.look), 3, `${key}: stable viewing direction`);
    if (prev) maxSpeed = Math.max(maxSpeed, prev.distanceTo(s.pos) / (tour.duration / 12000));
    if(prev&&!s.lift)maxWalkSpeed=Math.max(maxWalkSpeed,prev.distanceTo(s.pos)/(tour.duration/12000));
    const dir=s.look.clone().sub(s.pos).normalize();
    if(prevDir)maxTurn=Math.max(maxTurn,Math.acos(Math.max(-1,Math.min(1,dir.dot(prevDir))))/(tour.duration/12000));
    if (s.lift) {
      phases.add(s.lift.phase);
      const trip=`${s.lift.from}-${s.lift.to}`;
      if(!trips.has(trip))trips.set(trip,new Set());trips.get(trip).add(s.lift.phase);
      near(s.pos.y - s.lift.y, EYE_HEIGHT, `${key}: cabin and camera share elevation`);
      if (s.lift.phase === '상승') {
        near(s.lift.door, 0, `${key}: doors closed while moving`);
        const ev = T.core.ev;
        assert.ok(s.pos.x >= ev[0] && s.pos.x <= ev[2] && s.pos.z >= ev[1] && s.pos.z <= ev[3], `${key}: ride stays in shaft`);
      }
    }
    prev = s.pos;prevDir=dir;
  }
  assert.ok(maxSpeed < 2.1, `${key}: no flight between waypoints (${maxSpeed} m/s)`);
  assert.ok(maxWalkSpeed>.7&&maxWalkSpeed<1.05,`${key}: responsive indoor walking (${maxWalkSpeed})`);
  assert.ok(maxTurn<.31,`${key}: measured head turns (${maxTurn} rad/s)`);
  const camera = new THREE.PerspectiveCamera();
  setCam(camera, poseToKey(tour.startPos, tour.startLook, profile.fov));
  near(camera.position.distanceTo(new THREE.Vector3(...tour.startPos)), 0, `${key}: plan landing has no camera jump`);
  camera.aspect = 0.5;
  const groundKeys = groundVisit(T).map((k,i)=>({...poseToKey(k.pos,k.look,profile.fov),p:i,eyeHeight:k.pos[1],viewShift:0.15}));
  for(let p=0;p<=groundKeys.length-1;p+=0.05){
    setCam(camera,camAt(p,groundKeys,camera.aspect));
    near(camera.position.y,groundKeys[0].eyeHeight,`${key}: narrow-screen framing keeps real eye height`);
    assert.ok(camera.view.enabled,`${key}: dock framing uses view offset`);
  }
  setCam(camera,poseToKey(tour.startPos,tour.startLook,profile.fov));
  assert.equal(camera.view.enabled,false,`${key}: tour clears dock offset`);
  assert.ok(groundVisit(T).every(k => Math.abs(k.pos[1] - ((T.structure === 'timber' ? 0.3 : 0) + EYE_HEIGHT)) < 1e-6), `${key}: 1F visit stays at eye height`);
  if (T.core) {
    assert.ok(['탑승', '문 닫힘', '상승', '문 열림', '하차'].every(p => phases.has(p)), `${key}: complete lift cycle`);
    assert.equal(trips.size,visitFloors(T).length-1,`${key}: every floor transition uses a lift`);
    for(const phases of trips.values())for(const p of ['호출','탑승','문 닫힘','상승','도착','문 열림','하차'])assert.ok(phases.has(p),`${key}: each trip includes ${p}`);
    for(const plan of Object.values(T.floorsPlan)) for(const room of plan.rooms){
      const rect=room.r, patches=finishPatches(rect,[T.core.ev]);
      near(patches.reduce((sum,r)=>sum+area(r),0),area(rect)-overlap(rect,T.core.ev),`${key}: finish preserves area outside shaft`);
      patches.forEach((r,i)=>{
        near(overlap(r,T.core.ev),0,`${key}: finish never cuts through moving cabin`);
        patches.slice(i+1).forEach(s=>near(overlap(r,s),0,`${key}: finish pieces do not overlap`));
      });
    }
    const root=new THREE.Group(),installed=[];
    const K={root,add:(o,phase)=>{installed.push([o,phase]);root.add(o);},box:(w,h,d,m,x,y,z)=>{
      const group=new THREE.Group(),material=new THREE.MeshBasicMaterial({transparent:m==='glass',opacity:m==='glass'?.12:1});
      group.add(new THREE.Mesh(new THREE.BoxGeometry(w,h,d).translate(0,h/2,0),material));group.position.set(x,y,z);return group;
    }};
    const lift=createElevator(K,T,n=>levelY(T,n)), ev=T.core.ev;
    assert.ok(installed.some(([o,phase])=>o===lift.car&&phase==='mep'),'cabin is installed as an actual scheduled model');
    assert.ok(installed.some(([o,phase])=>o===lift.shaft&&phase==='mep'),'shaft and rails are installed');
    lift.update(null);assert.equal(lift.car.visible,true,'installed cabin remains present outside ride');
    lift.update(null,2);near(lift.car.position.y,levelY(T,2),'cabin parks at the visited floor after alighting');
    let observation=null;lift.car.getObjectByName('운행 관찰창').traverse(o=>{if(o.isMesh)observation=o.material;});
    assert.ok(observation.transparent&&observation.opacity<.2,'transparent side window makes passing shaft levels visible');
    const origin=new THREE.Vector3((ev[0]+ev[2])/2,EYE_HEIGHT,ev[1]+(ev[3]-ev[1])*0.32);
    lift.update({y:0,door:0,from:1,to:2,phase:'상승'}); root.updateMatrixWorld(true);
    for(let yaw=-80;yaw<=80;yaw+=5) for(const pitch of [-20,0,20]){
      const a=yaw*Math.PI/180,b=pitch*Math.PI/180;
      const ray=new THREE.Raycaster(origin,new THREE.Vector3(Math.sin(a)*Math.cos(b),Math.sin(b),Math.cos(a)*Math.cos(b)));
      assert.ok(ray.intersectObject(lift.car,true).length,`${key}: closed cabin blocks outside view at ${yaw}/${pitch}`);
    }
    lift.update({y:0,door:1,from:1,to:2,phase:'탑승'}); root.updateMatrixWorld(true);
    assert.equal(new THREE.Raycaster(origin,new THREE.Vector3(0,0,1)).intersectObject(lift.car,true).length,0,`${key}: open doorway is clear for boarding`);
  }
  else assert.equal(phases.size, 0, 'house keeps its real stairs');
  console.log(`${key}: ${tour.stops.length} stops, ${tour.duration.toFixed(1)}s, walk ${maxWalkSpeed.toFixed(2)}m/s, turn ${(maxTurn*180/Math.PI).toFixed(1)}deg/s`);
}
console.log('PASS: 5 camera routes, eye heights, view continuity, movement speed, lift doors and cabin elevation.');
