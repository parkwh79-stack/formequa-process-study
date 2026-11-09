import * as THREE from 'three';

// A moving cabin and independent landing doors, all driven by the same camera sample.
export function createElevator(K, T, floorY) {
  if (!T.core?.ev) return { installLanding() {}, update() {} };
  const [x0, z0, x1, z1] = T.core.ev, x = (x0 + x1) / 2, w = x1 - x0, d = z1 - z0;
  const doorW = Math.min(1.1, w - 0.12), landings = [];
  const { box, add, root } = K;
  const textures=[];
  const component = (ww, hh, dd, material, xx, yy, zz) => box(ww, hh, dd, material, xx, yy, zz, { edges: false, cast: false });
  function sign(label,sub=''){
    const canvas=document.createElement('canvas');canvas.width=256;canvas.height=128;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#252c29';ctx.fillRect(0,0,256,128);
    ctx.fillStyle='#e8d7ae';ctx.font='bold 58px sans-serif';ctx.textAlign='center';ctx.fillText(label,128,70);
    ctx.font='22px sans-serif';ctx.fillText(sub,128,108);
    const texture=new THREE.CanvasTexture(canvas);textures.push(texture);texture.colorSpace=THREE.SRGBColorSpace;
    return new THREE.Mesh(new THREE.PlaneGeometry(.52,.26),new THREE.MeshBasicMaterial({map:texture}));
  }
  function doorPair(parent, y, z) {
    const left = new THREE.Group(), right = new THREE.Group();
    left.add(component(doorW / 2 + 0.004, 2.1, 0.025, 'steel', x - doorW / 4, y, z-.001));
    right.add(component(doorW / 2 + 0.004, 2.1, 0.025, 'steel', x + doorW / 4, y, z+.001));
    parent.add(left, right); return { left, right };
  }
  function open(pair, amount) { pair.left.position.x = -amount * doorW * 0.52; pair.right.position.x = amount * doorW * 0.52; }
  function installLanding(n) {
    const group = new THREE.Group(), y = floorY(n), pair = doorPair(group, y, z1 + 0.035);
    group.add(component(0.06, 2.2, 0.1, 'steel', x - doorW / 2 - 0.03, y, z1), component(0.06, 2.2, 0.1, 'steel', x + doorW / 2 + 0.03, y, z1), component(doorW + 0.12, 0.07, 0.1, 'steel', x, y + 2.13, z1));
    group.name=`승강기 ${n}층 승강장`;
    const label=sign(`${n}F`,'ELEVATOR');label.position.set(x,y+2.32,z1+.09);group.add(label);
    group.add(component(.09,.22,.06,'black',x+doorW/2+.1,y+1.1,z1+.06),component(.025,.025,.065,'lamp',x+doorW/2+.1,y+1.2,z1+.075));
    add(group, 'mep', 0.5 + (n - 1) / T.floors * 0.4, 'show', { ghost: false, hot: false });
    landings.push({ ...pair, n });
  }
  const shaft=new THREE.Group();shaft.name='승강기 샤프트 · 레일 · 층 표지';
  const top=floorY(T.floors)+2.7;
  shaft.add(component(.04,top,d,'black',x0-.22,0,(z0+z1)/2));
  for(const z of [z0+.18,z1-.18])shaft.add(component(.065,top,.065,'steel',x0-.1,0,z));
  for(let y=.5;y<top;y+=.5)shaft.add(component(.035,.028,d*.6,'steel',x0-.1,y,(z0+z1)/2));
  for(let n=1;n<=T.floors;n++){
    const label=sign(`${n}F`,`+${floorY(n).toFixed(1)} m`);
    label.rotation.y=Math.PI/2;label.position.set(x0-.065,floorY(n)+1,(z0+z1)/2);shaft.add(label);
    shaft.add(component(.06,.1,d*.75,'granite',x0-.1,floorY(n),(z0+z1)/2));
  }
  add(shaft,'mep',.45,'show',{ghost:false,hot:false});
  const car = new THREE.Group();car.name='승강기 객실';
  car.add(component(w - 0.08, 0.05, d - 0.06, 'granite', x, 0, (z0 + z1) / 2));
  car.add(component(0.04, .72, d - 0.08, 'steel', x0 + 0.035, 0, (z0 + z1) / 2), component(0.04, 2.3, d - 0.08, 'steel', x1 - 0.035, 0, (z0 + z1) / 2));
  car.add(component(.04,.16,d-.08,'steel',x0+.035,2.14,(z0+z1)/2));
  for(const z of [z0+.07,z1-.07])car.add(component(.04,1.42,.06,'steel',x0+.035,.72,z));
  const window=component(.025,1.42,d-.2,'glass',x0+.035,.72,(z0+z1)/2);
  window.name='운행 관찰창';window.traverse(o=>{if(o.isMesh){o.material.opacity=.12;o.material.metalness=.05;o.material.envMapIntensity=.2;}});car.add(window);
  car.add(component(.04,.035,d-.16,'steel',x0+.08,1.02,(z0+z1)/2));
  car.add(component(w - 0.08, 2.3, 0.04, 'steel', x, 0, z0 + 0.035));
  car.add(component(w - 0.08, 0.04, d - 0.08, 'paint', x, 2.28, (z0 + z1) / 2));
  car.add(component(w * 0.6, 0.025, d * 0.5, 'lamp', x, 2.25, (z0 + z1) / 2));
  car.add(component(0.025, 0.3, 0.16, 'black', x1 - 0.06, 1.05, z1 - 0.25));
  const doors = doorPair(car, 0, z1 - 0.035);
  const cheek = Math.max(0, (w - 0.08 - doorW) / 2);
  if (cheek > 0.005) car.add(component(cheek, 2.3, 0.04, 'steel', x0 + 0.04 + cheek / 2, 0, z1 - 0.035), component(cheek, 2.3, 0.04, 'steel', x1 - 0.04 - cheek / 2, 0, z1 - 0.035));
  car.add(component(doorW, 0.2, 0.04, 'steel', x, 2.1, z1 - 0.035));
  const display = document.createElement('canvas'); display.width = 128; display.height = 64;
  const texture = new THREE.CanvasTexture(display), face = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(0.26, w * 0.3), 0.13), new THREE.MeshBasicMaterial({ map: texture }));textures.push(texture);
  face.position.set(x - doorW / 4, 1.88, z1 - 0.065); face.rotation.y = Math.PI; doors.left.add(face);
  car.add(new THREE.PointLight(0xfff0d8, 0.9, 3.2, 1.5)); car.children.at(-1).position.set(x, 2.15, (z0 + z1) / 2);
  add(car,'mep',.9,'show',{ghost:false,hot:false});
  let lastLabel = '';
  function update(sample,parkedFloor=1) {
    for (const landing of landings) open(landing, sample && Math.abs(sample.y - floorY(landing.n)) < 0.04 ? sample.door : 0);
    if (!sample) {car.position.y=floorY(parkedFloor);open(doors,0);return;}
    car.position.y = sample.y; open(doors, sample.door);
    let current=1;for(let n=1;n<=T.floors;n++)if(sample.y>=floorY(n)-.02)current=n;
    const label = `${current}F ${sample.phase === '상승' ? '↑' : sample.phase==='하강'?'↓':'·'}`;
    if (label !== lastLabel) {
      const ctx = display.getContext('2d'); ctx.fillStyle = '#202820'; ctx.fillRect(0, 0, 128, 64);
      ctx.fillStyle = '#e8edc6'; ctx.font = 'bold 36px monospace'; ctx.textAlign = 'center'; ctx.fillText(label, 64, 45); texture.needsUpdate = true; lastLabel = label;
    }
  }
  return { installLanding, update, car, landings, shaft, dispose:()=>textures.forEach(t=>t.dispose()) };
}
