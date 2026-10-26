// Run with: node --test hero/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  reelPose, sceneAt, dealOrder, slotAngle, wrap180, COUNT, SCENE_START, SCENE_END,
} from './reelPose.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const scene = (over = {}) => ({ radius: 100, scale: 1, camDist: 1000, rotation: 0, ...over });

test('formed card at 0° sits at the far centre, facing the camera', () => {
  const p = reelPose(0, 1, scene());
  near(p.x, 0); near(p.z, -100); near(wrap180(p.yaw), 0);
});

test('formed card at ±180° is the one nearest the camera', () => {
  near(reelPose(180, 1, scene()).z, 100);
  near(reelPose(-180, 1, scene()).z, 100);
});

test('x = -sin(a)·r, z = -cos(a)·r, yaw = a', () => {
  for (const a of [-150, -90, -30, 30, 45, 90, 135]) {
    const p = reelPose(a, 1, scene());
    const r = a * Math.PI / 180;
    near(p.x, -Math.sin(r) * 100); near(p.z, -Math.cos(r) * 100); near(wrap180(p.yaw), a);
  }
});

test('at formation 0 every card is stacked at the front and invisible', () => {
  for (let i = 0; i < COUNT; i++) {
    const p = reelPose(slotAngle(i), 0, scene());
    near(p.z, 100); near(p.x, 0, 1e-9); assert.equal(p.appear, 0);
  }
});

test('at formation 1 every card has reached its resting angle and is fully visible', () => {
  for (let i = 0; i < COUNT; i++) {
    const a = slotAngle(i), p = reelPose(a, 1, scene());
    near(wrap180(p.yaw), wrap180(a)); assert.equal(p.appear, 1);
  }
});

test('the deal starts at the front and travels round the ring in angle order', () => {
  const order = [180, 135, 90, 45, 0, -45, -90, -135].map(dealOrder);
  for (let k = 1; k < order.length; k++) assert.ok(order[k] > order[k - 1]);
  // halfway through, earlier cards are further along than later ones
  const appear = [135, 0, -135].map(a => reelPose(a, 0.5, scene()));
  assert.ok(appear[0].appear >= appear[1].appear && appear[1].appear >= appear[2].appear);
  assert.equal(reelPose(135, 0.5, scene()).appear, 1);
  assert.equal(reelPose(-135, 0.5, scene()).appear, 0);
});

test('each card swings monotonically from the front to its slot (ease-out, no overshoot)', () => {
  const a = -90, rest = 180 - dealOrder(a) * 360;   // unwrapped target, 270° of travel
  let prev = 180;
  for (let f = 0; f <= 1.0001; f += 0.01) {
    const yaw = reelPose(a, f, scene()).yaw;
    assert.ok(yaw <= prev + 1e-9, 'never moves backwards');
    assert.ok(yaw >= rest - 1e-9, 'never overshoots');
    prev = yaw;
  }
  near(prev, rest);
});

test('ring rotation is added to every card', () => {
  const p = reelPose(30, 1, scene({ rotation: 40 }));
  near(wrap180(p.yaw), 70);
  near(p.x, -Math.sin(70 * Math.PI / 180) * 100);
});

test('behindCamera: from inside the ring the near card is hidden, the far card is not', () => {
  const inside = scene({ radius: 1800, camDist: 0 });
  assert.equal(reelPose(180, 1, inside).behindCamera, true);
  assert.equal(reelPose(0, 1, inside).behindCamera, false);
  assert.equal(reelPose(60, 1, inside).behindCamera, false);
  assert.equal(reelPose(90, 1, inside).behindCamera, true);   // level with the camera: not in view
});

test('behindCamera: from outside the small ring nothing is hidden', () => {
  const outside = sceneAt(0);
  for (let i = 0; i < COUNT; i++) assert.equal(reelPose(slotAngle(i), 1, outside).behindCamera, false);
});

test('sceneAt matches the spec at both ends and interpolates between', () => {
  assert.deepEqual({ ...sceneAt(0), rotation: undefined }, { ...SCENE_START, rotation: undefined });
  assert.deepEqual({ ...sceneAt(1), rotation: undefined }, { ...SCENE_END, rotation: undefined });
  near(sceneAt(0.5).radius, 1130); near(sceneAt(0.5).perspective, 725); near(sceneAt(0.5).scale, 1.41);
  near(sceneAt(-1).radius, 460); near(sceneAt(2).radius, 1800);
});

test('scale passes through and the function is pure', () => {
  const s = Object.freeze(scene({ scale: 2.3 }));
  const a = reelPose(12, 0.7, s), b = reelPose(12, 0.7, s);
  assert.deepEqual(a, b); assert.equal(a.scale, 2.3);
});
