// Pure maths for the reel ring. No DOM, no React: everything here is unit tested.
//
// Angles are in degrees. 0 is the far centre of the ring, ±180 is the card nearest the camera.
// The camera sits on the +z axis, `camDist` from the ring's centre.

export const COUNT = 16;                  // DOM cards on the ring
export const DEAL_WINDOW = 0.3;           // share of the formation each card spends swinging out
export const NEAR = 60;                   // px: anything closer to the camera than this is hidden

// expansion 0 (loader) and expansion 1 (hero)
export const SCENE_START = { radius: 460, tilt: -22, roll: -20, perspective: 1000, scale: 0.52, camDist: 1800 };
// camDist stays a little off the exact centre: at 0 the ring's plane lands on the camera
// (translateZ = perspective), the browser can't invert it, and clicks stop reaching the cards
export const SCENE_END = { radius: 1800, tilt: 0, roll: 0, perspective: 450, scale: 2.3, camDist: 150 };

export const clamp01 = t => Math.min(Math.max(t, 0), 1);
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeOutCubic = t => 1 - (1 - t) ** 3;
export const mod = (n, m) => ((n % m) + m) % m;
/** Wrap any angle into [-180, 180). */
export const wrap180 = a => mod(a + 180, 360) - 180;

/** Resting angle of ring slot `i`. */
export const slotAngle = (i, count = COUNT) => wrap180(i * 360 / count);

/**
 * Where a card sits in the deal, 0 to just under 1. The front card (±180) is dealt first,
 * then the deal travels round the ring towards decreasing angles.
 */
export const dealOrder = angle => mod(180 - angle, 360) / 360;

/** Ring settings for a given expansion (0 = small loader ring, 1 = full-screen hero). */
export function sceneAt(expansion, rotation = 0) {
  const t = clamp01(expansion);
  const s = {};
  for (const k of Object.keys(SCENE_START)) s[k] = lerp(SCENE_START[k], SCENE_END[k], t);
  s.rotation = rotation;
  return s;
}

/**
 * Pose of one card.
 * @param {number} angle      the card's resting angle on the ring (degrees)
 * @param {number} formation  0 = every card stacked at the front, 1 = dealt round the ring
 * @param {{radius:number, scale:number, camDist:number, rotation?:number}} scene
 * @returns {{x:number, y:number, z:number, yaw:number, scale:number, appear:number, behindCamera:boolean}}
 */
export function reelPose(angle, formation, scene) {
  const order = dealOrder(angle);
  const p = clamp01((formation - order * (1 - DEAL_WINDOW)) / DEAL_WINDOW);
  const swing = easeOutCubic(p);
  // unwrapped resting angle, so every card swings the same way round from the front
  const rest = 180 - order * 360;
  const a = lerp(180, rest, swing) + (scene.rotation || 0);
  const rad = a * Math.PI / 180;
  const x = -Math.sin(rad) * scene.radius;
  const z = -Math.cos(rad) * scene.radius;
  return {
    x,
    y: 0,
    z,
    yaw: a,
    scale: scene.scale,
    appear: clamp01(p * 5),            // fades in during the first fifth of its swing
    behindCamera: z > scene.camDist - NEAR,
  };
}
