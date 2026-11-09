// A small input budget keeps a wheel burst from queuing a long walk after the gesture stops.
// The returned value is route seconds; scrolling remains the source of camera progress.
export function createWalkInput() {
  let credits=.35,last=null;
  return (pixels,now)=>{
    if(last!==null)credits=Math.min(.45,credits+Math.max(0,now-last)/1000);
    last=now;
    const seconds=Math.min(Math.abs(pixels)*.005,credits);
    credits-=seconds;
    return Math.sign(pixels)*seconds;
  };
}
