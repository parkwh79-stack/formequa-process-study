// World-space camera routes. Eye heights, doors and lift coordinates follow the scaled model.
export const EYE_HEIGHT = 1.6;
const PROFILES = {
  office: { name: '로비 → 승강기 → 기준층·상층', speed: 0.5, fov: 56, yaw: [-32,-24,-8,14,34,26,8,-10] },
  neighborhood: { name: '카페 → 승강기 → 기준층·상층', speed: 0.48, fov: 54, yaw: [-36,-26,-12,8,28,18,4,-12] },
  dormitory: { name: '현관 → 승강기 → 공용층·객실층', speed: 0.46, fov: 56, yaw: [32,24,10,-12,-30,-18,-4,12] },
  dasedae: { name: '현관 → 승강기 → 세대·상층', speed: 0.44, fov: 54, yaw: [-30,-20,-4,18,32,20,4,-12] },
  house: { name: '정원 → 거실 → 계단 → 2층', speed: 0.44, fov: 52, yaw: [-40,-28,-12,10,30,18,-6,-20] },
};
export const motionProfile = T => PROFILES[T.use] || PROFILES.neighborhood;
export const levelY = (T, n) => (T.structure === 'timber' ? 0.3 : 0) + (n <= 1 ? 0 : T.f1 + (n - 2) * T.ft);
const midpoint = a => (a[0] + a[1]) / 2;
const pose = (pos, look, extra = {}) => ({ pos, look, ...extra });

export function groundVisit(T) {
  const eye = levelY(T, 1) + EYE_HEIGHT, hd = T.D / 2;
  if (!T.piloti) {
    const first = T.tour[0], next = T.tour[1];
    const x = T.frontDoors?.[0] ?? (T.porch ? 2.2 * T.W / 12 : first.pos[0]);
    const outside = pose([x, eye, hd + (T.porch?.depth || 0) + 2.2], [x, eye - 0.08, hd - 2]);
    const door = pose([x, eye, hd + 0.5], [x, eye - 0.08, hd - 3]);
    const inside = T.structure === 'timber' ? T.tour.find(k => k.stop?.title === '현관') : next;
    const off = levelY(T, T.planFloor);
    const destination = pose([inside.pos[0], inside.pos[1] + off, inside.pos[2]], [inside.look[0], inside.look[1] + off, inside.look[2]]);
    const threshold = pose([x,eye,hd-0.85],[x,eye-0.08,hd-3]);
    return [outside, door, threshold, destination, { ...destination, hold: 2.8 }];
  }
  const core = T.core, door = core.frontDoor1 || core.frontDoor;
  const x = midpoint(door), z = core.z1;
  return [
    pose([x, eye, hd + 2.5], [x, eye - 0.05, z]),
    pose([x, eye, z + 1.1], [x, eye - 0.05, z - 1]),
    pose([x, eye, z - 0.3], [(core.ev[0] + core.ev[2]) / 2, eye - 0.05, core.ev[3]]),
    pose([x, eye, z - 0.3], [(core.ev[0] + core.ev[2]) / 2, eye - 0.05, core.ev[3]], { hold: 2.2 }),
  ];
}

export function elevatorLeg(T, from = 1, to = 2) {
  const [x0, z0, x1, z1] = T.core.ev, x = (x0 + x1) / 2, z = z0 + (z1 - z0) * 0.32;
  const a = levelY(T, from), b = levelY(T, to);
  const lift = (y, door, phase) => ({ y, door, from, to, phase });
  const front=[x,a+EYE_HEIGHT,z1+Math.min(2.5,T.core.z1-z1-.3)], inside=[x,a+EYE_HEIGHT,z];
  const view = y => [x0-1,y+EYE_HEIGHT-0.12,z+0.1];
  const c=T.core, hallZ=T.use==='dormitory'?c.z1-.35:(c.doorEast?midpoint(c.doorEast):-1.55);
  const hall=[x,b+EYE_HEIGHT,hallZ], hallLook=T.use==='dormitory'?[midpoint(c.frontDoor),b+EYE_HEIGHT,c.z1+2]:[c.x1+2,b+EYE_HEIGHT,hallZ];
  return [
    pose(front,[x,a+EYE_HEIGHT+.25,z0],{hold:1.2,lift:lift(a,0,'호출')}),
    pose(front,[x,a+EYE_HEIGHT+.25,z0],{hold:2.4,lift:lift(a,1,'문 열림')}),
    pose(inside,[x,a+EYE_HEIGHT,z0],{speed:0.38,lift:lift(a,1,'탑승')}),
    pose(inside,view(a),{hold:2.8,turnSpeed:0.5,lift:lift(a,1,'탑승')}),
    pose(inside,view(a),{hold:2.4,lift:lift(a,0,'문 닫힘')}),
    pose([x,b+EYE_HEIGHT,z],view(b),{speed:0.85,lift:lift(b,0,'상승')}),
    pose([x,b+EYE_HEIGHT,z],[x,b+EYE_HEIGHT,z1+3],{hold:3,turnSpeed:0.5,lift:lift(b,0,'도착')}),
    pose([x,b+EYE_HEIGHT,z],[x,b+EYE_HEIGHT,z1+3],{hold:2.6,lift:lift(b,1,'문 열림')}),
    pose([x,b+EYE_HEIGHT,z1+0.7],[x,b+EYE_HEIGHT,hallZ],{speed:0.38,lift:lift(b,1,'하차')}),
    pose(hall,hallLook,{speed:0.42,lift:lift(b,1,'하차')}),
    pose(hall,hallLook,{dwell:4,
      stop:{kind:'elevator',floor:to,room:'core2',title:`${to}층 도착 · 승강기`,desc:`${from}층에서 ${to}층으로 이동했습니다. 문을 나와 이 층의 실내를 살펴봅니다.`,reveal:['core2']}}),
  ];
}

export const visitFloors = T => T.core?.ev ? [...new Set([1,2,Math.max(3,Math.ceil((T.floors+2)/2)),T.floors])].filter(n=>n<=T.floors).sort((a,b)=>a-b) : [1,2];
export function buildWalkthrough(T) {
  const off = levelY(T, T.planFloor);
  const original = T.tour.map(k => ({ ...k, pos: [k.pos[0], k.pos[1] + off, k.pos[2]], look: [k.look[0], k.look[1] + off, k.look[2]] }));
  if (!T.core?.ev || T.floors < 2) return original.map(k=>{
    let floor=1;for(let n=2;n<=T.floors;n++)if(k.pos[1]>=levelY(T,n)+EYE_HEIGHT-.2)floor=n;
    return {...k,floor,dwell:k.stop?6:undefined,stop:k.stop?{...k.stop,floor}:undefined};
  });
  const c = T.core, cx = (c.ev[0] + c.ev[2]) / 2, doorZ = c.doorEast ? midpoint(c.doorEast) : -1.55;
  const commercial=T.planFloor===1, fd=midpoint(c.frontDoor1||c.frontDoor||[0,0]);
  const upper=commercial?original.findIndex(k=>k.pos[1]>T.f1+0.5&&k.stop):0;
  const hall=commercial?original.findIndex(k=>k.stop&&/계단실|코어 →/.test(k.stop.title)):0;
  const template=commercial?original.slice(upper):original;
  const initial=commercial?original.slice(0,hall):groundVisit(T).slice(0,3).map((k,i)=>({...k,...(i===0?{stop:{floor:1,title:'1층 공용 현관',room:T.use==='dormitory'?'lobby1':'core1',desc:'기둥 사이 입구로 들어와 승강기 홀로 이동합니다.',reveal:['lobby1','core1']}}:{})}));
  if(commercial){
    const x=T.frontDoors[0],y=levelY(T,1)+EYE_HEIGHT,hd=T.D/2;
    initial.splice(1,0,pose([x,y,hd+0.8],[x,y,hd-3]),pose([x,y,hd-0.9],[initial[1].pos[0],y,initial[1].pos[2]]));
  }
  const tag=(k,n)=>({...k,floor:n,dwell:k.stop?6:undefined,stop:k.stop?{...k.stop,floor:n,title:n>2?`${n}층 · ${k.stop.title.replace(/^2층\s*/, '').replace(/20(\d)호/g,`${n}0$1호`)}`:k.stop.title}:undefined});
  const out=initial.map(k=>tag(k,1));
  const corridor=n=>{
    const y=levelY(T,n)+EYE_HEIGHT;
    return T.use==='dormitory'?[pose([fd,y,c.z1+0.65],[cx,y,c.z1-0.35]),pose([cx,y,c.z1-0.35],[cx,y,c.ev[3]])]
      :[pose([c.x1+0.45,y,doorZ],[cx,y,doorZ]),pose([cx,y,doorZ],[cx,y,c.ev[3]])];
  };
  // Ground-floor piloti has a public south entrance; upper residential floors use the east unit door.
  if(commercial) out.push(...corridor(1));
  else out.push(pose([cx,levelY(T,1)+EYE_HEIGHT,c.z1-0.35],[cx,levelY(T,1)+EYE_HEIGHT,c.ev[3]]));
  const floors=visitFloors(T).slice(1);
  floors.forEach((n,i)=>{
    out.push(...elevatorLeg(T,i?floors[i-1]:1,n));
    const exit=corridor(n).reverse().map(k=>({...k,look:[template[0].pos[0],k.pos[1],template[0].pos[2]]}));
    out.push(...exit);
    const delta=levelY(T,n)-levelY(T,2);
    const count=i===0?template.length:T.use==='dasedae'?3:T.use==='dormitory'?2:1;
    const visit=template.slice(0,count).map(k=>tag({...k,pos:[k.pos[0],k.pos[1]+delta,k.pos[2]],look:[k.look[0],k.look[1]+delta,k.look[2]]},n));
    out.push(...visit);
    if(i<floors.length-1){
      const back=visit.slice(0,-1).reverse(), approach=corridor(n);
      out.push(...back.map((k,j)=>({...k,stop:undefined,dwell:undefined,look:(back[j+1]||approach[0]).pos})),...approach);
    }
  });
  return out;
}
