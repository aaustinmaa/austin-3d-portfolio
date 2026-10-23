import * as THREE from 'three';
import { glowTex, fabricTex } from './textures.js';

// A small, legless wanderer in a thin woven robe and a softly folded hood. The cloth hangs from the shoulders;
// only the loose hem, cuffs and rear hood tip respond to motion. The shadowed face, lantern and golden bow stay familiar.
const V3 = THREE.Vector3;

/* the bow, in its own space: the limbs bulge toward +x, the string runs between the tips at x = TIP_X */
export const TIP_X = .08, TIP_Y = .42, GRIP_X = .34;
/* Leave room in front of the robe for the drawing hand and the fully drawn string. */
export const BOW_REST = new V3(-.30,.6,-.14), BOW_AIM = new V3(-.06,1.0,.47);
export const BOW_TURN = new THREE.Quaternion().setFromAxisAngle(new V3(0,1,0), -Math.PI/2);

const COL = { cloth:0xD2CFE2, sheen:0x777B96, glowBase:0x414164, lining:0x34334C, shade:0x14142A, gold:0xE6C27E, eye:0xCFF6FF, glass:0xFFD9A0 };
const clamp = THREE.MathUtils.clamp, smooth = THREE.MathUtils.smoothstep;
const HEM_GAP = .006;

/* a surface from a grid: f(u, v, out) places the point for column u and row v (both 0..1). Faces are wound to point
   away from `inside`, so a front-side material shows the outside and a back-side material shows the lining. */
function gridGeo(rows, cols, f, inside){
  const pos = [], uv = [], idx = [], p = new V3();
  for (let i=0;i<=rows;i++) for (let j=0;j<=cols;j++){ f(j/cols, i/rows, p); pos.push(p.x, p.y, p.z); uv.push(j/cols, 1 - i/rows); }
  for (let i=0;i<rows;i++) for (let j=0;j<cols;j++){ const a = i*(cols+1) + j, b = a + cols + 1; idx.push(a, b, a+1, a+1, b, b+1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos,3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv,2)); g.setIndex(idx); g.computeVertexNormals();
  g.userData.grid = { rows, cols };
  const n = g.attributes.normal, P = g.attributes.position; let dot = 0;
  for (let k=0;k<P.count;k+=5) dot += n.getX(k)*(P.getX(k) - inside.x) + n.getY(k)*(P.getY(k) - inside.y) + n.getZ(k)*(P.getZ(k) - inside.z);
  if (dot < 0){ for (let k=0;k<idx.length;k+=3){ const t = idx[k+1]; idx[k+1] = idx[k+2]; idx[k+2] = t; } g.setIndex(idx); g.computeVertexNormals(); }
  return g;
}
/* a smooth curve (Catmull-Rom) through evenly spaced keys */
const key = (arr, v) => { const n = arr.length - 1, x = Math.min(n - 1e-6, Math.max(0, v)*n), i = Math.floor(x), f = x - i, at = k => arr[Math.min(n, Math.max(0, k))];
  const p0 = at(i-1), p1 = at(i), p2 = at(i+1), p3 = at(i+2);
  return .5*(2*p1 + (p2 - p0)*f + (2*p0 - 5*p1 + 4*p2 - p3)*f*f + (3*p1 - p0 - 3*p2 + p3)*f*f*f); };
export function buildHero(scene){
  const root = new THREE.Group(); root.name = 'wanderer'; scene.add(root);
  const M = (c, o={}) => new THREE.MeshStandardMaterial(Object.assign({ color:c, roughness:.8, metalness:0 }, o));
  const mesh = (g, m, parent, shadow=true) => { const o = new THREE.Mesh(g, m); o.castShadow = shadow; parent.add(o); return o; };
  fabricTex.repeat.set(12, 8);
  const cloth = new THREE.MeshPhysicalMaterial({ color:COL.cloth, roughness:.93, metalness:0, sheen:new THREE.Color(COL.sheen), bumpMap:fabricTex, bumpScale:.0014, emissive:COL.glowBase, emissiveIntensity:.34 });
  /* Both sides share one surface, so an opening reads as a thin sheet instead of a hollow padded volume. */
  const lining = M(COL.lining, { roughness:1, side:THREE.BackSide, bumpMap:fabricTex, bumpScale:.001, emissive:COL.glowBase, emissiveIntensity:.12 });
  const edgeCloth = cloth.clone(); edgeCloth.color.setHex(0xB8B5CD);
  const clothPanels = [];
  const panel = (g, parent, kind, weightAt, name, material=cloth) => {
    const o = mesh(g, material, parent); o.name = name; o.receiveShadow = true;
    mesh(g, lining, parent, false);
    const p = g.attributes.position, uv = g.attributes.uv, weights = new Float32Array(p.count);
    for (let i=0;i<p.count;i++) weights[i] = weightAt(uv.getX(i), 1 - uv.getY(i));
    p.setUsage(THREE.DynamicDrawUsage); g.attributes.normal.setUsage(THREE.DynamicDrawUsage);
    g.computeBoundingSphere(); g.boundingSphere.radius += .18;
    clothPanels.push({ mesh:o, rest:p.array.slice(), weights, kind }); return o;
  };
  const goldMat = M(COL.gold, { metalness:.3, roughness:.45, emissive:0x4A3510, emissiveIntensity:.5 });
  const body = new THREE.Group(); root.add(body);
  const headLift = .17, neckLift = .12;

  /* Open robe: folds fall vertically from the shoulders, widening gently toward a slightly uneven, unrolled hem. */
  const CR = [.16,.245,.265,.285,.32,.365,.405,.435];
  const coatAt = (u, v, out) => {
    const a = u*Math.PI*2, loose = smooth(v, .12, 1), r = key(CR, v);
    const folds = Math.sin(a*7 + .3 + v*.5)*.018 + Math.sin(a*11 - v*.7)*.006;
    const radius = r + folds*(.15 + loose*.85);
    return out.set(Math.sin(a)*radius, .94 - v*.83 + neckLift*(1-smooth(v, 0, .30)) + Math.cos(a*3 + .4)*.009*loose*loose, Math.cos(a)*radius*.87);
  };
  const coatWeight = (u,v) => Math.pow(smooth(v, .18, 1), 2);
  const dress = panel(gridGeo(28, 64, coatAt, new V3(0,.55,0)), body, 'coat', coatWeight, 'hero-coat');
  /* A narrow turned-under fabric edge follows the same folds and deformation as the robe. */
  const hem = panel(gridGeo(2, 64, (u,v,p) => { coatAt(u, .985 + v*.015, p); p.x *= 1.004; p.z *= 1.004; }, new V3(0,.15,0)), body, 'coat', (u,v) => coatWeight(u, .985 + v*.015), 'hero-hem', edgeCloth);
  hem.geometry.computeBoundingBox();
  const restGrounding = HEM_GAP - .025 - hem.geometry.boundingBox.min.y;

  const head = new THREE.Group(); head.position.set(0,1.13,0); body.add(head);
  /* A small pointed arch frames the face. Its lower corners spread and fall toward the neck like the reference
     hood; the cloth behind the opening stays full enough to cover the head. */
  const faceY = -.035 + headLift, faceZ = -.018;
  const rimPoint = new V3(), rimCurves = [
    new THREE.CubicBezierCurve3(new V3(0,faceY+.205,.330), new V3(.059,faceY+.155,.330), new V3(.149,faceY+.113,.293), new V3(.158,faceY+.020,.268)),
    new THREE.CubicBezierCurve3(new V3(.158,faceY+.020,.268), new V3(.160,faceY-.060,.253), new V3(.180,faceY-.160,.230), new V3(.183,faceY-.205,.219)),
    new THREE.CubicBezierCurve3(new V3(.183,faceY-.205,.219), new V3(.124,faceY-.205,.219), new V3(.053,faceY-.180,.222), new V3(0,faceY-.180,.222)),
  ];
  const hoodAt = (u, depth, out) => {
    const a = u*Math.PI*2, c = Math.cos(a), sn = Math.sin(a);
    const top = smooth(c, .25, 1), bottom = smooth(-c, .25, 1);
    const half = u <= .5 ? u*2 : (1-u)*2;
    if (half < .48) rimCurves[0].getPoint(half/.48,rimPoint);
    else if (half < .82) rimCurves[1].getPoint((half-.48)/.34,rimPoint);
    else rimCurves[2].getPoint((half-.82)/.18,rimPoint);
    const rimX = rimPoint.x*(u <= .5 ? 1 : -1), rimY = rimPoint.y, rimZ = rimPoint.z;
    const seamX = -.012 - .068*top, seamY = -.31 + .83*(c+1)/2;
    const seamZ = -.325 - .055*top + .125*bottom;
    const t = depth, s = 1-t, b0 = s*s*s, b1 = 3*s*s*t, b2 = 3*s*t*t, b3 = t*t*t;
    const fold = Math.sin(Math.PI*t)**2*(1-top);
    return out.set(
      b0*rimX + b1*.315*sn + b2*(.320*sn + seamX*.45) + b3*seamX + .004*sn*Math.sin(a*5+t*4)*fold,
      b0*rimY + b1*(rimY+.020*top-.035*bottom) + b2*(seamY-.040*top-.010*bottom) + b3*seamY - .008*fold,
      b0*rimZ + b1*THREE.MathUtils.lerp(rimZ,seamZ,.16) + b2*THREE.MathUtils.lerp(rimZ,seamZ,.88) + b3*seamZ);
  };
  const hoodWeight = (u,depth) => {
    const c = Math.cos(u*Math.PI*2);
    return .45*smooth(c,.25,1)*Math.pow(smooth(depth,.60,1),2) + .10*smooth(-c,.45,1)*depth;
  };
  const inside = new V3(0,faceY,faceZ);
  panel(gridGeo(36, 72, hoodAt, inside), head, 'hood', hoodWeight, 'hero-hood');
  /* A narrow fold follows the actual open edge of the sewn panels. */
  panel(gridGeo(2, 72, (u,v,p) => { hoodAt(u,v*.018,p); p.z += .0015; }, inside), head, 'hood',
    (u,v) => hoodWeight(u,v*.018), 'hero-hood-edge', edgeCloth);
  /* Continue the lower opening into a short neck drape. Its upper edge shares the mouth's lower curve and
     then tucks under the side panels; the lower edge lies against the robe rather than flaring into a cape. */
  const neckTop = new V3(), neckBase = new V3();
  panel(gridGeo(12, 64, (u,v,p) => {
    const half = u <= .5 ? u*2 : (1-u)*2, sd = u <= .5 ? 1 : -1;
    if (half <= .5){ rimCurves[2].getPoint(1-half*2,neckTop); neckTop.x *= sd; }
    else hoodAt(sd > 0 ? .41 : .59,(half-.5)*2,neckTop);
    coatAt(u,v*.16,neckBase); neckBase.y -= head.position.y;
    p.copy(neckTop).lerp(neckBase,smooth(v,0,.85));
    const tuck = 1-.012*smooth(v,.6,1); p.x *= tuck; p.z *= tuck;
    return p;
  }, new V3(0,-.25,0)), head, 'neck', (u,v) => .08*Math.sin(Math.PI*v)**2, 'hero-cowl');
  /* A shallow head with a flat face, rounded temples and a tapered chin, rather than a ball inside the hood.
     The bevel rounds the outline and sides; the middle of the face stays flat, with a receding upper forehead. */
  const face = new THREE.Group(); face.position.set(0,faceY,faceZ); head.add(face);
  const faceOutline = new THREE.Shape(); faceOutline.moveTo(0,-.205);
  faceOutline.bezierCurveTo(-.065,-.205,-.139,-.163,-.163,-.095);
  faceOutline.bezierCurveTo(-.180,-.041,-.181,.080,-.162,.137);
  faceOutline.bezierCurveTo(-.150,.174,-.085,.185,0,.185);
  faceOutline.bezierCurveTo(.085,.185,.150,.174,.162,.137);
  faceOutline.bezierCurveTo(.181,.080,.180,-.041,.163,-.095);
  faceOutline.bezierCurveTo(.139,-.163,.065,-.205,0,-.205);
  const faceGeo = new THREE.ExtrudeGeometry(faceOutline,{ depth:.23, steps:1, curveSegments:12,
    bevelEnabled:true, bevelThickness:.024, bevelSize:.018, bevelSegments:4 }).translate(0,0,-.022);
  const facePos = faceGeo.attributes.position;
  for (let i=0;i<facePos.count;i++){
    const y = facePos.getY(i), front = smooth(facePos.getZ(i),-.046,.232);
    facePos.setX(i,facePos.getX(i)*(1-.18*smooth(y,.04,.18)));
    facePos.setZ(i,facePos.getZ(i)-front*(.070*smooth(y,.075,.203)+.045*smooth(-y,.11,.223)));
  }
  faceGeo.computeVertexNormals();
  const faceMesh = mesh(faceGeo,new THREE.MeshBasicMaterial({ color:COL.shade }),face,false); faceMesh.name = 'hero-face';
  const eyeMat = new THREE.MeshBasicMaterial({ color:COL.eye }), eyes = [-1,1].map(sd => {
    const g = new THREE.RingGeometry(0,1,24,4).scale(.031,.044,1);
    const e = new THREE.Mesh(g, eyeMat); e.position.set(sd*.077,0,.237); face.add(e); return e; });

  /* A curved sleeve cap joins each sleeve to an oval armhole on the robe. The shoulder seam stays on the
     torso while the lower sleeve follows the arm; only the cuff has an exposed open edge. */
  const sleeves = [], hands = [];
  const arms = [-1,1].map(sd => { const a = new THREE.Group(); a.position.set(sd*.215,.90,0); body.add(a);
    const sleeve = new THREE.Group(); a.add(sleeve); sleeves.push(sleeve);
    const sleeveAt = (u,v,p) => { const ang = u*Math.PI*2, r = .066 - v*.010 + Math.sin(ang*5 + v)*.005*v;
      return p.set(Math.sin(ang)*r, -v*.28, Math.cos(ang)*r); };
    const sleeveMesh = panel(gridGeo(20, 32, sleeveAt, new V3(0,-.12,0)), sleeve, 'sleeve', (u,v) => v*v*.35, `hero-sleeve-${sd < 0 ? 'left' : 'right'}`);
    const cols = 32, capEnd = .4, array = () => new Float32Array((cols+1)*3);
    const shoulder = { arm:a, side:sd, capEnd, bend:new V3(), anchors:array(), bulges:array(), starts:array(), controls:array(), guides:array(), ends:array() };
    const point = new V3(), guide = new V3();
    for (let j=0;j<=cols;j++){
      const u = j/cols, ang = u*Math.PI*2, side = sd*Math.sin(ang), top = smooth(side,-.5,.8);
      coatAt((sd > 0 ? .25 : .75)-sd*.05*Math.cos(ang),.16-.08*side,point);
      point.x *= .997; point.z *= .997; point.toArray(shoulder.anchors,j*3);
      shoulder.bulges.set([sd*.010*top,.020*top,0],j*3);
      sleeveAt(u,capEnd,point); point.toArray(shoulder.ends,j*3);
      const dr = -.010 + .005*Math.sin(ang*5+capEnd) + .005*capEnd*Math.cos(ang*5+capEnd);
      guide.set(Math.sin(ang)*dr,-.28,Math.cos(ang)*dr).multiplyScalar(-capEnd/3).add(point);
      guide.toArray(shoulder.guides,j*3);
    }
    clothPanels[clothPanels.length-1].shoulder = shoulder;
    /* The cap reaches above the pivot as the arm turns, beyond the straight sleeve's rest bounds. */
    sleeveMesh.geometry.boundingSphere.radius += .4;
    const hand = mesh(new THREE.SphereGeometry(.048,16,12).scale(.86,1,1), cloth, a); hand.position.y = -.30; hands.push(hand); return a; });

  /* The right palm grips the top of a real loop handle, slightly forward of the hip. A small hip hook
     supports the same handle when that hand is needed to draw the bow. */
  const lanternPivot = new THREE.Group(); lanternPivot.position.set(.32,.60,.26); body.add(lanternPivot);
  const handleCurve = new THREE.CatmullRomCurve3([[-.05,-.13,0],[-.045,-.035,0],[0,0,0],[.045,-.035,0],[.05,-.13,0]].map(p => new V3(...p)));
  const handle = mesh(new THREE.TubeGeometry(handleCurve,24,.008,6),goldMat,lanternPivot,false); handle.name = 'hero-lantern-handle';
  const hookCurve = new THREE.CatmullRomCurve3([[-.092,.025,-.075],[-.052,.032,-.045],[-.014,.018,-.012],[0,0,0]].map(p => new V3(...p).add(lanternPivot.position)));
  const hook = mesh(new THREE.TubeGeometry(hookCurve,12,.006,6),goldMat,body,false); hook.name = 'hero-lantern-hook';
  mesh(new THREE.ConeGeometry(.075,.06,16).translate(0,-.12,0), goldMat, lanternPivot, false);
  mesh(new THREE.SphereGeometry(.068,20,14).translate(0,-.19,0), new THREE.MeshBasicMaterial({ color:COL.glass }), lanternPivot, false);
  mesh(new THREE.CylinderGeometry(.05,.035,.03,16).translate(0,-.265,0), goldMat, lanternPivot, false);
  const lanternGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map:glowTex, color:0xFFB86B, transparent:true, opacity:.75, depthWrite:false, blending:THREE.AdditiveBlending })); lanternGlow.scale.set(1.3,1.3,1); lanternGlow.position.y = -.19; lanternPivot.add(lanternGlow);
  const lanternLight = new THREE.PointLight(0xFFB070, 1.7, 15, 2); lanternLight.position.set(0,-.18,.1); lanternPivot.add(lanternLight);
  const flyGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map:glowTex, color:0x7FE9F2, transparent:true, opacity:0, depthWrite:false, blending:THREE.AdditiveBlending })); flyGlow.position.set(0,.5,-.2); flyGlow.scale.set(2.4,2.4,1); root.add(flyGlow);

  /* a simple golden bow with round tips */
  const bow = new THREE.Group(); bow.position.copy(BOW_REST); root.add(bow);
  const limb = new THREE.CatmullRomCurve3([[TIP_X,TIP_Y],[.25,.3],[GRIP_X,0],[.25,-.3],[TIP_X,-TIP_Y]].map(([x,y]) => new V3(x,y,0)));
  mesh(new THREE.TubeGeometry(limb, 40, .022, 8), goldMat, bow);
  [1,-1].forEach(sd => mesh(new THREE.SphereGeometry(.032,12,8).translate(TIP_X, sd*TIP_Y, 0), goldMat, bow, false));
  const strGeo = new THREE.BufferGeometry(); strGeo.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0, 0,0,0, 0,0,0],3));
  bow.add(new THREE.Line(strGeo, new THREE.LineBasicMaterial({ color:0xBFF6FF, transparent:true, opacity:.9 })));
  const nock = new THREE.Mesh(new THREE.CylinderGeometry(.012,.012,.7,4).rotateZ(Math.PI/2), new THREE.MeshBasicMaterial({ color:0xE8F8FF })); nock.visible = false; bow.add(nock);
  const nockGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map:glowTex, color:0x9FF2FF, transparent:true, opacity:0, depthWrite:false, blending:THREE.AdditiveBlending })); nockGlow.scale.set(.5,.5,1); bow.add(nockGlow);

  const motion = { previous:new V3(), yaw:0, ready:false, offset:new V3(), velocity:new V3(), goal:new V3(), turn:0, turnVelocity:0, speed:0, reduced:false };
  return { root, body, dress, hem, head, eyes, arms, sleeves, hands, clothPanels, motion, edgeCloth, lanternPivot, lanternGlow, lanternLight, flyGlow, eyeMat, hemMat:cloth, bow, strGeo, nock, nockGlow, grounding:0, restGrounding };
}

/* World-space springs retain their direction while the character turns. Actual displacement also covers guided
   flights and blocked movement, where the player's requested velocity does not describe what happened. */
const measured = new V3(), panelDrift = new V3(), clothQ = new THREE.Quaternion(), neckAnchor = new V3(), neckInverse = new THREE.Matrix4();
const sleeveMatrix = new THREE.Matrix4(), sleeveInverse = new THREE.Matrix4(), shoulderPoint = new V3(), shoulderControl = new V3(), shoulderBulge = new V3();
function updateClothMotion(h, s){
  const m = h.motion, dt = clamp(s.dt, .0001, .05), yaw = h.root.rotation.y;
  measured.subVectors(h.root.position, m.previous);
  const continuous = m.ready && measured.length() < Math.max(1.5, dt*35);
  if (continuous) measured.divideScalar(dt).clampLength(0, 18); else measured.set(0,0,0);
  const turnRate = continuous ? clamp(Math.atan2(Math.sin(yaw-m.yaw), Math.cos(yaw-m.yaw))/dt, -7, 7) : 0;
  m.previous.copy(h.root.position); m.yaw = yaw; m.ready = true;
  if (s.reduceMotion || !continuous){
    m.offset.set(0,0,0); m.velocity.set(0,0,0); m.turn = m.turnVelocity = m.speed = 0; return;
  }
  m.speed += (measured.length() - m.speed)*(1 - Math.exp(-dt*8));
  m.goal.copy(measured).multiplyScalar(-.006); m.goal.y *= .35;
  const turnGoal = -turnRate*.011, steps = Math.ceil(dt/.008), step = dt/steps;
  for (let i=0;i<steps;i++){
    m.velocity.x += ((m.goal.x-m.offset.x)*85 - m.velocity.x*13)*step;
    m.velocity.y += ((m.goal.y-m.offset.y)*85 - m.velocity.y*13)*step;
    m.velocity.z += ((m.goal.z-m.offset.z)*85 - m.velocity.z*13)*step;
    m.offset.addScaledVector(m.velocity, step);
    m.turnVelocity += ((turnGoal-m.turn)*100 - m.turnVelocity*14)*step;
    m.turn += m.turnVelocity*step;
  }
}

/* Recompute lighting on the deformed surface. Weld normals at the coincident ends of closed grid rows. */
function clothNormals(g){
  g.computeVertexNormals();
  const { rows, cols } = g.userData.grid, p = g.attributes.position, n = g.attributes.normal;
  for (let row=0;row<=rows;row++){
    const a = row*(cols+1), b = a+cols;
    if (Math.abs(p.getX(a)-p.getX(b)) + Math.abs(p.getY(a)-p.getY(b)) + Math.abs(p.getZ(a)-p.getZ(b)) > .00001) continue;
    const x = n.getX(a)+n.getX(b), y = n.getY(a)+n.getY(b), z = n.getZ(a)+n.getZ(b), length = Math.hypot(x,y,z) || 1;
    n.setXYZ(a,x/length,y/length,z/length); n.setXYZ(b,x/length,y/length,z/length);
  }
}

function deformCloth(h, s){
  const m = h.motion;
  const settled = s.reduceMotion && m.reduced;
  const amplitude = s.reduceMotion ? 0 : .0012 + Math.min(1, m.speed/7)*.004;
  h.head.updateMatrix(); neckInverse.copy(h.head.matrix).invert();
  for (const panel of h.clothPanels){
    const { mesh, rest, weights, kind, shoulder } = panel, g = mesh.geometry, p = g.attributes.position;
    if (settled && kind !== 'neck' && !shoulder) continue;
    if (shoulder){
      shoulder.arm.updateMatrix(); mesh.parent.updateMatrix();
      sleeveMatrix.multiplyMatrices(shoulder.arm.matrix,mesh.parent.matrix); sleeveInverse.copy(sleeveMatrix).invert();
      /* A reaching arm bends forward around the chest instead of taking a straight path through the robe. */
      shoulderPoint.set(0,-.28,0).applyMatrix4(sleeveMatrix);
      const forward = shoulderPoint.z-shoulder.arm.position.z, across = shoulder.side*(shoulder.arm.position.x-shoulderPoint.x);
      const bend = .14*smooth(forward,.08,.22)*clamp(across/Math.max(.08,forward),0,1), e = sleeveInverse.elements;
      shoulder.bend.set(e[8]*bend,e[9]*bend,e[10]*bend);
      for (let j=0;j<shoulder.anchors.length;j+=3){
        shoulderPoint.fromArray(shoulder.anchors,j);
        shoulderControl.fromArray(shoulder.ends,j).applyMatrix4(sleeveMatrix).lerp(shoulderPoint,.75);
        shoulderControl.add(shoulderBulge.fromArray(shoulder.bulges,j)).applyMatrix4(sleeveInverse).toArray(shoulder.controls,j);
        shoulderPoint.applyMatrix4(sleeveInverse).toArray(shoulder.starts,j);
      }
    }
    mesh.parent.getWorldQuaternion(clothQ).invert(); panelDrift.copy(m.offset).applyQuaternion(clothQ);
    /* Sleeve length follows the reaching hand; compensate so its small flutter stays the same size. */
    panelDrift.y /= mesh.parent.scale.y;
    for (let i=0;i<p.count;i++){
      const j = i*3, w = s.reduceMotion ? 0 : weights[i];
      let x = rest[j], y = rest[j+1], z = rest[j+2];
      if (shoulder){
        const { rows, cols } = g.userData.grid, v = Math.floor(i/(cols+1))/rows;
        if (v < shoulder.capEnd){
          const c = (i%(cols+1))*3, t = v/shoulder.capEnd, s = 1-t, b0 = s*s*s, b1 = 3*s*s*t, b2 = 3*s*t*t, b3 = t*t*t;
          x = b0*shoulder.starts[c] + b1*shoulder.controls[c] + b2*shoulder.guides[c] + b3*shoulder.ends[c];
          y = b0*shoulder.starts[c+1] + b1*shoulder.controls[c+1] + b2*shoulder.guides[c+1] + b3*shoulder.ends[c+1];
          z = b0*shoulder.starts[c+2] + b1*shoulder.controls[c+2] + b2*shoulder.guides[c+2] + b3*shoulder.ends[c+2];
        }
        const bend = Math.sin(Math.PI*v)**2;
        x += shoulder.bend.x*bend; y += shoulder.bend.y*bend; z += shoulder.bend.z*bend;
      }
      /* The mouth follows the head, but the neck drape's lower edge stays tucked into the body when aiming. */
      if (kind === 'neck'){
        const { rows, cols } = g.userData.grid, anchor = smooth(Math.floor(i/(cols+1))/rows,0,.85);
        neckAnchor.set(x,y,z).add(h.head.position).applyMatrix4(neckInverse);
        x += (neckAnchor.x-x)*anchor; y += (neckAnchor.y-y)*anchor; z += (neckAnchor.z-z)*anchor;
      }
      const a = Math.atan2(x,z), ripple = amplitude*(Math.sin(s.T*2.3 + a*2 + y*7)*.65 + Math.sin(s.T*3.7 - a*3 + y*5)*.35);
      const twist = m.turn*w, dx = panelDrift.x*w, dz = panelDrift.z*w;
      p.setXYZ(i, x + dx + z*twist + Math.sin(a)*ripple*w,
        y + panelDrift.y*w + ripple*w*.35,
        z + dz - x*twist + Math.cos(a)*ripple*w*(kind === 'hood' ? .55 : 1));
    }
    p.needsUpdate = true; clothNormals(g);
  }
  m.reduced = !!s.reduceMotion;
}

/* one frame of animation. s includes reduceMotion in addition to the player's movement and bow state. */
const tv = new V3(), te = new THREE.Euler(), grip = new V3(), str = new V3(), hemPoint = new V3(), bodyInverse = new THREE.Matrix4(), cyan = new THREE.Color(0x5FE6F0), warm = new THREE.Color(COL.glowBase), dark = new THREE.Color(COL.eye), eyeLit = new THREE.Color(0xFFFFFF);
const armX = new V3(), armY = new V3(), armZ = new V3(), armBasis = new THREE.Matrix4();
function reach(h, index, target){
  tv.copy(target).sub(h.arms[index].position);
  const length = Math.max(.12, tv.length());
  /* Keep the sleeve's outer side facing out from the torso as the arm reaches across the chest. */
  armY.copy(tv).normalize().negate(); armX.set(1,0,0).addScaledVector(armY,-armY.x);
  if (armX.lengthSq() < .00001) armX.set(0,0,1).addScaledVector(armY,-armY.z);
  armX.normalize(); armZ.crossVectors(armX,armY); armBasis.makeBasis(armX,armY,armZ);
  h.arms[index].quaternion.setFromRotationMatrix(armBasis);
  h.sleeves[index].scale.y = (length - .018)/.28; h.hands[index].position.y = -length;
}
export function animateHero(h, s){
  const { dt, T, moving } = s, k = 1 - Math.exp(-dt*6), up = s.airborne || s.flight, motion = s.reduceMotion ? 0 : 1;
  /* Undo last frame's common visual offset before interpolating the bow and solving the hands. */
  h.bow.position.y -= h.grounding;
  updateClothMotion(h, s);
  h.body.position.y = .025;
  h.body.rotation.z = 0;
  h.body.rotation.x += (motion*(up ? .16 : moving*.1) - h.body.rotation.x)*k;
  h.head.rotation.x = s.aiming ? -s.pitch*.25 : 0;
  h.head.rotation.z = 0;
  /* blink every few seconds; the eyes light up while flying */
  const blink = (T % 4.3) < .11 ? .12 : 1; h.eyes.forEach(e => { e.scale.y = blink; });
  h.eyeMat.color.copy(s.flying ? eyeLit : dark);
  h.hemMat.emissive.lerp(s.flying ? cyan : warm, k); h.hemMat.emissiveIntensity += ((s.flying ? .46 : up ? .38 : .34) - h.hemMat.emissiveIntensity)*k;
  h.edgeCloth.emissive.copy(h.hemMat.emissive); h.edgeCloth.emissiveIntensity = h.hemMat.emissiveIntensity;
  h.flyGlow.material.opacity += ((s.flying ? .7 : 0) - h.flyGlow.material.opacity)*k;

  /* bow placement, string and nocked arrow */
  h.bow.position.lerp(s.aiming ? BOW_AIM : BOW_REST, 1 - Math.exp(-dt*12));
  h.bow.quaternion.setFromEuler(te.set(s.aiming ? -s.pitch : .1, 0, 0)).multiply(BOW_TURN);
  const midX = TIP_X - s.draw*.32;
  h.strGeo.attributes.position.array.set([TIP_X, TIP_Y, 0, midX, 0, 0, TIP_X, -TIP_Y, 0]); h.strGeo.attributes.position.needsUpdate = true;
  h.nock.visible = s.draw > .02; h.nock.position.set(midX + .35, 0, 0); h.nockGlow.position.set(midX + .7, 0, 0); h.nockGlow.material.opacity = s.draw*.9;

  /* Hands follow their actual grips. The lantern stays upright and rests on the hip hook while drawing. */
  h.body.updateMatrix(); bodyInverse.copy(h.body.matrix).invert();
  h.lanternPivot.quaternion.copy(h.body.quaternion).invert();
  grip.set(GRIP_X, 0, 0).applyQuaternion(h.bow.quaternion).add(h.bow.position).applyMatrix4(bodyInverse);
  reach(h, 0, grip);
  if (s.aiming && s.draw > .01){ str.set(midX, 0, 0).applyQuaternion(h.bow.quaternion).add(h.bow.position).applyMatrix4(bodyInverse); reach(h, 1, str); }
  else reach(h,1,h.lanternPivot.position);
  deformCloth(h, s);

  /* The player's root is the support surface. Fit the actual posed, deformed hem to that surface while
     grounded; in the air keep a fixed model offset so jumping and flying follow the player's position. */
  let grounding = h.restGrounding;
  if (s.onGround && !up && !s.flying){
    const p = h.hem.geometry.attributes.position; let lowest = Infinity;
    for (let i=0;i<p.count;i++) lowest = Math.min(lowest,hemPoint.fromBufferAttribute(p,i).applyMatrix4(h.body.matrix).y);
    grounding = HEM_GAP - lowest;
  }
  h.body.position.y += grounding; h.bow.position.y += grounding; h.grounding = grounding;

  /* Only the light flickers; there is no periodic body, arm or lantern sway. */
  h.lanternGlow.material.opacity = .62 + motion*Math.sin(T*3)*.1; h.lanternLight.intensity = (s.lantern ?? 1.7) + motion*Math.sin(T*3)*.15;
}
