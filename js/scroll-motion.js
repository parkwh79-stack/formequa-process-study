// Response constants measured from the public Lintel experience; this is our own filter.
export const REFERENCE_RESPONSE = Object.freeze({ scrollDuration: .88, cameraDamping: 9, wheelMultiplier: 1.08 });
export function queueScrollProgress(current,target,seconds,rate){
  if(seconds*(target-current)<0)target=current;
  const pending=rate*.25;
  return Math.max(0,Math.min(1,Math.max(current-pending,Math.min(current+pending,target+seconds*rate))));
}
export function createProgressFollower(value=0) {
  let filtered=value;
  return {
    reset(p){filtered=p;},
    step(current,target,dt){
      filtered+=(target-filtered)*(1-Math.exp(-Math.LN2*10/REFERENCE_RESPONSE.scrollDuration*dt));
      return current+(filtered-current)*(1-Math.exp(-REFERENCE_RESPONSE.cameraDamping*dt));
    },
  };
}
// All scenes use a bounded route-time budget, so an input burst never queues a long flight.
export function createWalkInput() {
  let credits=.18,last=null;
  return (pixels,now)=>{
    if(last!==null)credits=Math.min(.22,credits+Math.max(0,now-last)/1000);
    last=now;
    const seconds=Math.min(Math.abs(pixels)*.005*REFERENCE_RESPONSE.wheelMultiplier,credits);
    credits-=seconds;
    return Math.sign(pixels)*seconds;
  };
}
