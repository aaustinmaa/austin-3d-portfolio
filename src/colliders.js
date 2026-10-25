import { Box3, Matrix4, Ray, Triangle, Vector3 } from 'three';
import { Octree } from 'three/examples/jsm/math/Octree.js';
import { Capsule } from 'three/examples/jsm/math/Capsule.js';

const UP = new Vector3(0, 1, 0), DOWN = new Vector3(0, -1, 0), SKIN = .001;
const visible = object => { for (let o=object; o; o=o.parent) if (!o.visible) return false; return true; };

// Physics uses the render geometry, including instance and parent transforms. Register matter explicitly:
// light, flame, grass, auras and invisible interaction targets must never become invisible walls.
export class CollisionWorld {
  constructor(){ this.solids = []; this.tree = new Octree(); this.dynamic = []; this.geometryTrees = new WeakMap(); }

  addMesh(root, options={}){
    root.traverse(mesh => {
      if (!mesh.isMesh || (options.filter && !options.filter(mesh))) return;
      const solid = { mesh, name:options.name || root.name, body:true, stand:true, ceil:true, arrows:true, ...options };
      this.solids.push(solid);
      if (solid.dynamic) this.dynamic.push(solid);
    });
    return root;
  }

  triangles(solid, visit){
    const mesh = solid.mesh, p = mesh.geometry.attributes.position, index = mesh.geometry.index;
    const count = index ? index.count : p.count, instance = new Matrix4(), matrix = new Matrix4();
    for (let n=0; n<(mesh.isInstancedMesh ? mesh.count : 1); n++){
      if (mesh.isInstancedMesh){ mesh.getMatrixAt(n, instance); matrix.multiplyMatrices(mesh.matrixWorld, instance); }
      else matrix.copy(mesh.matrixWorld);
      for (let i=0; i<count; i+=3){
        const v = k => new Vector3().fromBufferAttribute(p, index ? index.getX(k) : k).applyMatrix4(matrix);
        const triangle = new Triangle(v(i), v(i+1), v(i+2));
        if (triangle.getArea() < 1e-10) continue;
        triangle.solid = solid; visit(triangle);
      }
    }
  }

  build(){
    this.tree = new Octree();
    for (const solid of this.solids){
      solid.mesh.updateWorldMatrix(true, false);
      if (!solid.dynamic) this.triangles(solid, t => this.tree.addTriangle(t));
    }
    if (this.tree.triangles.length) this.tree.build();
    for (const solid of this.dynamic) if (!solid.deforming) this.geometryTree(solid.mesh.geometry);
    this.updateDynamic();
  }

  updateDynamic(){
    for (const solid of this.dynamic){
      const mesh = solid.mesh; mesh.updateWorldMatrix(true, false);
      // Paper vertices change as it folds; rigid meshes keep their existing local bounds.
      if (solid.deforming || !mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      solid.bounds = (solid.bounds || new Box3()).copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
      if (mesh.isInstancedMesh){
        solid.bounds.makeEmpty(); const instance = new Matrix4(), matrix = new Matrix4(), box = new Box3();
        for (let i=0; i<mesh.count; i++){
          mesh.getMatrixAt(i, instance); matrix.multiplyMatrices(mesh.matrixWorld, instance);
          solid.bounds.union(box.copy(mesh.geometry.boundingBox).applyMatrix4(matrix));
        }
      }
    }
  }

  geometryTree(geometry){
    let tree = this.geometryTrees.get(geometry);
    if (!tree){
      tree = new Octree();
      const p = geometry.attributes.position, index = geometry.index, count = index ? index.count : p.count;
      for (let i=0; i<count; i+=3){
        const v = k => new Vector3().fromBufferAttribute(p, index ? index.getX(k) : k);
        const t = new Triangle(v(i), v(i+1), v(i+2)); if (t.getArea() > 1e-10) tree.addTriangle(t);
      }
      if (tree.triangles.length) tree.build(); this.geometryTrees.set(geometry, tree);
    }
    return tree;
  }

  // Moving rings and relics retain a local-space acceleration tree. Transform only nearby triangles,
  // rather than rebuilding thousands of world-space faces for every arrow or capsule substep.
  dynamicTriangles(solid, query, visit){
    if (solid.deforming){ this.triangles(solid, visit); return; }
    const mesh = solid.mesh, tree = this.geometryTree(mesh.geometry);
    const matrix = new Matrix4(), instance = new Matrix4();
    for (let n=0; n<(mesh.isInstancedMesh ? mesh.count : 1); n++){
      if (mesh.isInstancedMesh){ mesh.getMatrixAt(n, instance); matrix.multiplyMatrices(mesh.matrixWorld, instance); }
      else matrix.copy(mesh.matrixWorld);
      const inverse = matrix.clone().invert(), triangles = [];
      if (query instanceof Ray) tree.getRayTriangles(query.clone().applyMatrix4(inverse), triangles);
      else {
        const e = inverse.elements;
        // Frobenius norm bounds radius expansion even with nested nonuniform scales and shear.
        const scale = Math.hypot(e[0],e[1],e[2],e[4],e[5],e[6],e[8],e[9],e[10]);
        const local = new Capsule(query.start.clone().applyMatrix4(inverse), query.end.clone().applyMatrix4(inverse), query.radius*scale);
        tree.getCapsuleTriangles(local, triangles);
      }
      for (const local of triangles){ const t = local.clone(); t.a.applyMatrix4(matrix); t.b.applyMatrix4(matrix); t.c.applyMatrix4(matrix); t.solid = solid; visit(t); }
    }
  }

  rayHit(origin, direction, distance=Infinity, accept=() => true){
    const ray = new Ray(origin, direction), triangles = [], point = new Vector3();
    this.tree.getRayTriangles(ray, triangles);
    for (const solid of this.dynamic){
      if (visible(solid.mesh) && accept(solid) && ray.intersectsBox(solid.bounds)) this.dynamicTriangles(solid, ray, t => triangles.push(t));
    }
    let best = null;
    for (const triangle of triangles){
      const solid = triangle.solid;
      if (!accept(solid, triangle)) continue;
      if (!ray.intersectTriangle(triangle.a, triangle.b, triangle.c, false, point)) continue;
      const d = origin.distanceTo(point);
      if (d > distance + 1e-6 || (best && d >= best.distance)) continue;
      best = { distance:d, point:point.clone(), normal:triangle.getNormal(new Vector3()), solid, object:solid.mesh };
    }
    return best;
  }

  segmentHit(from, to, accept=s => s.arrows){
    const direction = new Vector3().subVectors(to, from), distance = direction.length();
    return distance > 1e-8 ? this.rayHit(from, direction.divideScalar(distance), distance, accept) : null;
  }

  floorAt(x, z, y, step, ground){
    const normal = new Vector3();
    const hit = this.rayHit(new Vector3(x, y + step + SKIN, z), DOWN, Infinity,
      (s, t) => s.body && s.stand && (!t || t.getNormal(normal).y > .5));
    return hit ? { h:hit.point.y, onPlatform:!hit.solid.terrain } : { h:ground, onPlatform:false };
  }

  ceilingAt(x, z, head){
    const normal = new Vector3();
    const hit = this.rayHit(new Vector3(x, head - .25, z), UP, Infinity,
      (s, t) => s.body && s.ceil && (!t || t.getNormal(normal).y < -.01));
    return hit ? hit.point.y : Infinity;
  }

  // Short capsule sweeps prevent tunnelling even through a thin rim, during a dive or a scripted flight.
  // Only grounded steps may lift the bottom of the capsule; an airborne robe has no step allowance.
  moveBody(from, to, radius, height, step=0){
    const position = from.clone(), delta = new Vector3().subVectors(to, from);
    const steps = Math.max(1, Math.ceil(delta.length()/(radius*.4)));
    delta.divideScalar(steps);
    const capsule = new Capsule(), bounds = new Box3(), contacts = [];
    let collided = false, grounded = false, ceiling = false;
    for (let i=0; i<steps; i++){
      position.add(delta);
      capsule.start.copy(position).addScaledVector(UP, step + radius);
      capsule.end.copy(position).addScaledVector(UP, Math.max(step + radius, height - radius));
      capsule.radius = radius;
      for (let pass=0; pass<4; pass++){
        const triangles = []; this.tree.getCapsuleTriangles(capsule, triangles);
        bounds.setFromPoints([capsule.start, capsule.end]).expandByScalar(radius);
        for (const solid of this.dynamic){
          if (solid.body && visible(solid.mesh) && bounds.intersectsBox(solid.bounds)) this.dynamicTriangles(solid, capsule, t => triangles.push(t));
        }
        let corrected = false;
        for (const triangle of triangles){
          const solid = triangle.solid; if (!solid.body) continue;
          if (solid.twoSided){
            const normal = triangle.getNormal(new Vector3());
            if (normal.dot(new Vector3().addVectors(capsule.start, capsule.end).multiplyScalar(.5).sub(triangle.a)) < 0){
              const a = triangle.a; triangle.a = triangle.c; triangle.c = a;
            }
          }
          const hit = this.tree.triangleCapsuleIntersect(capsule, triangle);
          if (!hit || hit.depth < 1e-6) continue;
          const correction = hit.normal.clone().multiplyScalar(hit.depth + SKIN);
          capsule.translate(correction); position.add(correction); corrected = true;
          if (hit.depth > SKIN){ collided = true; contacts.push(hit.normal); }
          grounded ||= hit.normal.y > .5; ceiling ||= hit.normal.y < -.5;
          const into = delta.dot(hit.normal); if (into < 0) delta.addScaledVector(hit.normal, -into);
        }
        if (!corrected) break;
      }
    }
    return { position, collided, grounded, ceiling, contacts };
  }

  // A zero-length sweep also checks a proposed shore landing without moving the player.
  pushOut(p, lo, hi, radius){
    const from = new Vector3(p.x, lo, p.z), result = this.moveBody(from, from, radius, hi-lo);
    p.x = result.position.x; p.z = result.position.z; return result.collided;
  }
}

export const collisionWorld = new CollisionWorld();
export const colliders = collisionWorld.solids;
export const addMesh = (mesh, options) => collisionWorld.addMesh(mesh, options);
export const floorAt = (...args) => collisionWorld.floorAt(...args);
export const ceilingAt = (...args) => collisionWorld.ceilingAt(...args);
export const pushOut = (...args) => collisionWorld.pushOut(...args);

// A walkable floor supports gravity; projecting gravity onto it would create an unintended downhill drift.
export function slideVelocity(velocity, contacts){
  for (const normal of contacts){
    if (normal.y > .5){ velocity.y = Math.max(0, velocity.y); continue; }
    const into = velocity.dot(normal);
    if (into < 0) velocity.addScaledVector(normal, -into);
  }
  return velocity;
}
