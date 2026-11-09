import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makeTour, limitCameraProgress } from '../js/camera.js';
import { createScrollEcho, motionCaps, MOTION_LIMITS } from '../js/scroll-motion.js';
import { createWalkInput, createProgressFollower, queueScrollProgress, REFERENCE_RESPONSE } from '../js/scroll-motion.js';
import { entranceApproach, buildWalkthrough, motionProfile } from '../js/walkthrough.js';
import { TYPES } from '../js/types.js';
import { scaleType } from '../js/law.js';
import { columnAxes, resolveEntrances, ENTRANCE_WIDTH, DOOR_FRAME, DOOR_OPEN_ANGLE } from '../js/access.js';

const R=Math.PI/180, angle=(a,b)=>Math.acos(Math.max(-1,Math.min(1,a.clone().normalize().dot(b.clone().normalize()))));
assert.deepEqual(REFERENCE_RESPONSE,{scrollDuration:.88,cameraDamping:9,wheelMultiplier:1.08});
assert.ok(queueScrollProgress(.5,.51,-.1,.02)<.5,'reversing the wheel cancels queued forward movement');
assert.ok(queueScrollProgress(.5,1,100,.02)<=.524000001,'a huge gesture cannot queue a long flight');
assert.ok(createWalkInput()(120,0)>.4,'a wheel notch immediately requests useful movement');
const fastResponse=createProgressFollower(0);let response=0;
for(let i=0;i<12;i++)response=fastResponse.step(response,1,1/60);
assert.ok(response>.8,'scroll response reaches 80% within 200ms');
const passage=makeTour([0,3,6].map((z,i)=>({pos:[0,1.6,-z],look:[0,1.6,-z-3],...(i===1?{stop:{title:'Middle room'}}:{})})),0,{speed:1});
const middle=passage.stops[0].u,frame=1/60/passage.duration;
assert.equal(passage.sample(middle).dwell,false,'a room is a pass-through marker');
assert.ok(passage.sample(middle-frame).pos.distanceTo(passage.sample(middle+frame).pos)/(2/60)>.5,'playback keeps moving through a room marker');
// Exercise the complete displayed response, not only the ideal path sampled in route seconds.
for(const dt of [1/60,.1,.25])for(const kind of ['turn','walk','lens']){
  const input=createWalkInput(),follower=createProgressFollower(0);
  const sample=p=>{
    const pos=new THREE.Vector3(kind==='walk'?20*p:0,1.6,0),yaw=kind==='turn'?Math.PI*p:0;
    return {pos,look:pos.clone().add(new THREE.Vector3(Math.sin(yaw),0,-Math.cos(yaw))),fov:kind==='lens'?2*Math.atan(.02*Math.exp(4*p))/R:54};
  };
  let current=0,target=0,previous=sample(0),lastInputP=0,nearEnd=0;
  for(let t=0;t<5;t+=dt){
    if(t<2)target=queueScrollProgress(current,target,input(1000,t*1000),.05);
    const proposed=follower.step(current,target,dt);
    current=limitCameraProgress(current,proposed,sample,motionCaps(dt,{onFoot:true}));
    const pose=sample(current);
    assert.ok(angle(previous.look.clone().sub(previous.pos),pose.look.clone().sub(pose.pos))<=MOTION_LIMITS.turn*dt+2e-6,`${kind} at ${1/dt}fps: actual angular speed`);
    assert.ok(previous.pos.distanceTo(pose.pos)<=MOTION_LIMITS.walk*dt+1e-7,`${kind}: actual translation speed`);
    assert.ok(Math.abs(Math.log(Math.tan(pose.fov*R/2)/Math.tan(previous.fov*R/2)))<=MOTION_LIMITS.lens*dt+1e-7,`${kind}: actual zoom speed`);
    if(t<2)lastInputP=current;
    if(t>4)nearEnd=Math.max(nearEnd,Math.abs(target-current));
    previous=pose;
  }
  assert.ok(current>lastInputP,'gesture ends with a short deceleration');
  assert.ok(nearEnd<1e-5,`${kind}: camera settles without a long queued movement`);
}

for(const type of ['midsize','geunsaeng'])for(const scale of [.8,.9,1,1.2]){
  const T=resolveEntrances(scaleType(TYPES[type],scale,TYPES[type].floors,TYPES[type].law));
  const hd=T.D/2,x=T.frontDoors[0],profile=motionProfile(T),grid=columnAxes(T);
  const approach=entranceApproach(T,T.tour[0].pos[2]),path=makeTour(approach,0,{speed:profile.speed});
  const full=makeTour(buildWalkthrough(T),0,{speed:profile.speed});
  const lobby=full.stops[1],radius=.18;
  for(const stop of full.stops)assert.equal(full.sample(stop.u).dwell,false,'room markers do not pause either scroll or automatic playback');
  for(let i=0;i<=1200;i++){
    const s=full.sample(lobby.u*i/1200),direction=s.look.clone().sub(s.pos).normalize();
    if(s.pos.z>=hd-1.25){
      assert.ok(Math.abs(s.pos.x-x)<1e-6,`${type} ${scale}: follow the door axis through the vestibule`);
      assert.ok(angle(direction,new THREE.Vector3(0,0,-1))<1e-5,`${type}: no early sideways turn at the jamb`);
    }
    if(Math.abs(s.pos.z-(hd-.05))<.25)assert.ok(Math.abs(s.pos.x-x)+radius<ENTRANCE_WIDTH/2-DOOR_FRAME,`${type}: camera clears the doorway`);
    if(Math.abs(s.pos.z-(hd-.3))<grid.width/2+radius)for(const col of grid.xs)assert.ok(Math.abs(s.pos.x-col)>grid.width/2+radius,`${type}: camera clears the front columns`);
    const dx=s.pos.x-(x-ENTRANCE_WIDTH/2+DOOR_FRAME),dz=s.pos.z-(hd-.07),c=Math.cos(DOOR_OPEN_ANGLE),n=Math.sin(DOOR_OPEN_ANGLE);
    const lx=c*dx-n*dz,lz=n*dx+c*dz,w=ENTRANCE_WIDTH-2*DOOR_FRAME;
    const gap=Math.hypot(Math.max(0,-lx,lx-w),Math.max(0,Math.abs(lz)-.015));
    assert.ok(gap>radius,`${type} ${scale}: camera does not pass through the opened glass leaf`);
  }
  assert.ok(path.startPos[2]>hd,'the plan handoff starts outside the facade');
}
console.log('PASS: faster scroll response, continuous room passage, displayed wheel speed at 60/10/4fps, reversal, settling, and 8 entrance clearances.');

// v3.9.3 regressions
{ // late echo of our own scrollTo is not a user scrub
  const echo=createScrollEcho();echo.write(1200.4,0);echo.write(1210,16);
  assert.ok(echo.isEcho(1200,200),'a late echo of an earlier write is ignored');
  assert.ok(!echo.isEcho(1500,200),'a real scrollbar drag is not an echo');
  assert.ok(!echo.isEcho(1200,900),'echo memory expires');
}
{ // an authored cut does not freeze the limiter
  const sample=p=>{const pos=new THREE.Vector3(p<.5?0:30,1.6,0);return {pos,look:pos.clone().add(new THREE.Vector3(p<.5?1:-1,0,0)),fov:50};};
  let p=.49;for(let i=0;i<60;i++)p=limitCameraProgress(p,Math.min(1,p+.01),sample,motionCaps(1/60,{onFoot:true}));
  assert.ok(p>.5,'camera passes an authored cut instead of stopping in front of it');
}
{ // the scroll keeps up with the hand: 3 s of steady wheel moves a 440 s tour by > 12 route seconds
  const tour=440,rate=1/tour,input=createWalkInput(),follower=createProgressFollower(0);
  const sample=p=>{const pos=new THREE.Vector3(0,1.6,-p*tour*.9);return {pos,look:pos.clone().add(new THREE.Vector3(0,0,-1)),fov:52};};
  let current=0,target=0;
  for(let t=0;t<3;t+=1/60){if(Math.round(t*60)%4===0)target=queueScrollProgress(current,target,input(100,t*1000),rate);
    current=limitCameraProgress(current,follower.step(current,target,1/60),sample,motionCaps(1/60,{onFoot:true}));}
  assert.ok(current*tour>12,`steady wheel advances the walk (${(current*tour).toFixed(1)} s)`);
  assert.ok((target-current)*tour<=1.2+1e-6,'camera never trails the scrollbar by more than the lead');
}
console.log('PASS: v3.9.3 echo filter, cut pass-through, wheel keeps up with long tours.');
