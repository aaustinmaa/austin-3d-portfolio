import { Vector3 } from 'three';

const UP = new Vector3(0,1,0);

// A small camera volume, anchored consistently at the head. The edge probes keep the near plane
// clear too; a centre ray alone can put the lens inside a stone at a grazing angle.
export class CameraBoom {
  constructor(cast, { radius=.18, padding=.16, comfort=3.2 }={}){
    this.cast = cast; this.radius = radius; this.padding = padding; this.comfort = comfort; this.lift = 0;
  }

  constrain(anchor, desired){
    const direction = new Vector3().subVectors(desired, anchor), length = direction.length();
    if (length < 1e-6) return { position:anchor.clone(), distance:0 };
    direction.divideScalar(length);
    const right = new Vector3().crossVectors(direction, UP);
    if (right.lengthSq() < 1e-6) right.set(1,0,0); else right.normalize();
    const up = new Vector3().crossVectors(right, direction).normalize();
    const offsets = [new Vector3(), right.clone().multiplyScalar(this.radius), right.clone().multiplyScalar(-this.radius), up.clone().multiplyScalar(this.radius), up.clone().multiplyScalar(-this.radius)];
    let distance = length;
    for (const offset of offsets){
      const hit = this.cast(anchor.clone().add(offset), desired.clone().add(offset));
      if (hit) distance = Math.min(distance, Math.max(0, hit.distance - this.padding));
    }
    return { position:anchor.clone().addScaledVector(direction, distance), distance };
  }

  resolve(anchor, desired){
    const direct = this.constrain(anchor, desired), comfort = Math.min(this.comfort, anchor.distanceTo(desired)*.8);
    // Keep a useful raised view until the original view has room again, instead of toggling at an edge.
    if (this.lift && direct.distance < comfort + .7){
      const raised = this.constrain(anchor, desired.clone().addScaledVector(UP, this.lift));
      if (raised.distance >= comfort) return raised;
    }
    this.lift = 0;
    if (direct.distance < comfort){
      for (const lift of [.8,1.6]){
        const raised = this.constrain(anchor, desired.clone().addScaledVector(UP, lift));
        if (raised.distance >= comfort && raised.distance > direct.distance + .4){ this.lift = lift; return raised; }
      }
    }
    return direct;
  }
}

// Screen-door fading preserves opaque cloth depth and lining without changing its materials' blending.
// Derive distance from the active view matrix so the lake's reflected view keeps the character visible.
export function installNearCameraFade(root, anchor, { near=1.6, far=3.2 }={}){
  const materials = new Set();
  root.traverse(o => { if (o.material) for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m); });
  for (const material of materials){
    const original = material.onBeforeCompile;
    material.onBeforeCompile = function(shader, renderer){
      original.call(this, shader, renderer);
      shader.uniforms.heroFadeAnchor = { value:anchor };
      shader.vertexShader = 'uniform vec3 heroFadeAnchor; varying float vHeroCameraVisibility;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('void main() {', `void main() {
        vHeroCameraVisibility = smoothstep(${near.toFixed(4)}, ${far.toFixed(4)}, length((viewMatrix * vec4(heroFadeAnchor, 1.)).xyz));`);
      shader.fragmentShader = 'varying float vHeroCameraVisibility;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        if (vHeroCameraVisibility < .9999) {
          float threshold = fract(dot(floor(gl_FragCoord.xy), vec2(.754877666, .569840296)));
          if (threshold >= vHeroCameraVisibility) discard;
        }`);
    };
    material.needsUpdate = true;
  }
}
