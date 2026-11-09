// One physical grid for structural columns, entrance clearances and camera approaches.
export const ENTRANCE_WIDTH = 1.4;
export function columnAxes(T) {
  const lin = (a,b,n) => Array.from({length:n},(_,i)=>a+(b-a)*i/(n-1));
  return { xs: lin(-T.W/2+0.3,T.W/2-0.3,T.W>12.5?4:3), zs: lin(-T.D/2+0.3,T.D/2-0.3,3), width: ['storefront','curtain'].includes(T.style)?0.6:0.5 };
}
export function resolveEntrances(T) {
  if (!T.frontDoors?.length) return T;
  const {xs,width}=columnAxes(T), clearance=ENTRANCE_WIDTH/2+width/2+0.25;
  const rooms=T.floorsPlan[1].rooms;
  T.frontDoors=T.frontDoors.map((old,i)=>{
    const room=rooms.find(r=>r.id===(T.use==='office'?(i?'retail':'lobby'):'cafeF'));
    const candidates=xs.slice(0,-1).map((x,j)=>(x+xs[j+1])/2).filter(x=>
      xs.every(c=>Math.abs(c-x)>=clearance) && (!room || x-ENTRANCE_WIDTH/2>=room.r[0] && x+ENTRANCE_WIDTH/2<=room.r[2]));
    if (!candidates.length) throw new Error('출입구를 배치할 기둥 사이 공간이 없습니다.');
    return candidates.reduce((best,x)=>Math.abs(x-old)<Math.abs(best-old)?x:best,candidates[0]);
  });
  T.tour[0].pos[0]=T.frontDoors[0]; T.tour[0].look[0]=T.frontDoors[0];
  return T;
}
