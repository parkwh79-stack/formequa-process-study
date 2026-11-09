// Response constants measured from the public Lintel experience; this is our own filter.
export const REFERENCE_RESPONSE = Object.freeze({ scrollDuration: .88, cameraDamping: 9, wheelMultiplier: 1.08 });
// v3.9.3: the scroll follows the hand. Input is converted to route seconds with a generous budget
// (sustained wheel ≈ 6× real time), and the display limits below are a safety net against jumps,
// not a speed governor. The v3.9.2 limits (16°/s, 1.05 m/s, 2 route-s/s) made the camera lag
// minutes behind the scrollbar on 440–610 s tours.
export const SCROLL_RESPONSE = Object.freeze({ ...REFERENCE_RESPONSE, scrollDuration:.45, cameraDamping:16 });
export const WALK_BUDGET = Object.freeze({ secondsPerPixel:.012*REFERENCE_RESPONSE.wheelMultiplier, burst:1.5, refill:6, lead:1.2 });
const R = Math.PI/180;
// Displayed-motion caps per second. lift = vertical travel inside the elevator.
export const MOTION_LIMITS = Object.freeze({ turn:110*R, walk:6.5, lift:4, lens:3 });
export function motionCaps(dt,{onFoot=false,lift=false}={}){
  return { angle:MOTION_LIMITS.turn*dt, distance:onFoot?(lift?MOTION_LIMITS.lift:MOTION_LIMITS.walk)*dt:Infinity, lens:MOTION_LIMITS.lens*dt };
}
// Move the target by `seconds` of route time, never more than `lead` route seconds ahead of the camera.
export function queueScrollProgress(current,target,seconds,rate,lead=WALK_BUDGET.lead){
  if(seconds*(target-current)<0)target=current;
  const pending=rate*lead;
  return Math.max(0,Math.min(1,Math.max(current-pending,Math.min(current+pending,target+seconds*rate))));
}
export function createProgressFollower(value=0) {
  let filtered=value;
  return {
    reset(p){filtered=p;},
    step(current,target,dt){
      filtered+=(target-filtered)*(1-Math.exp(-Math.LN2*10/SCROLL_RESPONSE.scrollDuration*dt));
      return current+(filtered-current)*(1-Math.exp(-SCROLL_RESPONSE.cameraDamping*dt));
    },
  };
}
// Wheel/touch pixels → signed route seconds with a refilling budget, so a flick never queues a long flight.
export function createWalkInput({burst=WALK_BUDGET.burst,refill=WALK_BUDGET.refill,secondsPerPixel=WALK_BUDGET.secondsPerPixel}={}) {
  let credits=burst,last=null;
  return (pixels,now)=>{
    if(last!==null)credits=Math.min(burst,credits+refill*Math.max(0,now-last)/1000);
    last=now;
    const seconds=Math.min(Math.abs(pixels)*secondsPerPixel,credits);
    credits-=seconds;
    return Math.sign(pixels)*seconds;
  };
}
// Programmatic scrollTo() calls echo back as 'scroll' events, sometimes a few frames late on a busy
// GPU. Remember recent writes so an echo is never mistaken for the user dragging the scrollbar
// (v3.9.2 treated late echoes as a scrub and teleported the camera to the queued target).
export function createScrollEcho(windowMs=500,tolerance=2){
  const writes=[];
  return {
    write(y,now){writes.push({y,now});while(writes.length>24)writes.shift();},
    isEcho(y,now){
      while(writes.length&&now-writes[0].now>windowMs)writes.shift();
      return writes.some(w=>Math.abs(w.y-y)<=tolerance);
    },
  };
}
// True when the wheel should scroll an inner panel natively instead of moving the story.
export function scrollsNatively(target,dy,root){
  for(let el=target;el&&el!==root&&el.nodeType===1;el=el.parentElement){
    if(el.matches?.('input,select,textarea'))return true;
    const style=getComputedStyle(el),oy=style.overflowY;
    if((oy==='auto'||oy==='scroll')&&el.scrollHeight>el.clientHeight+1){
      if(dy>0?el.scrollTop+el.clientHeight<el.scrollHeight-1:el.scrollTop>0)return true;
    }
  }
  return false;
}
