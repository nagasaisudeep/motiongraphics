import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { motion, animate, useMotionValue, useMotionValueEvent, useSpring, useTransform } from 'framer-motion';
import htm from 'htm';
import { COUNT, reelPose, sceneAt, slotAngle, wrap180, mod, clamp01, lerp } from './reelPose.js';
import { REELS } from './reels.js';

const html = htm.bind(React.createElement);

const FORMATION_S = 2.6;
const EXPANSION_S = 1.9;
const EXPANSION_EASE = [0.5, 0, 0.15, 1];
const SPIN = -4;              // deg per second while idle
const DRAG = 0.12;            // deg per px dragged
const ASSET_TIMEOUT = 12000;  // never hold the reveal longer than this

/* ───────────────────────────── Loader ───────────────────────────── */

// one rolling column per digit
function Counter({ progress }) {
  const pct = useTransform(progress, v => v * 100);
  const shown = useSpring(pct, { stiffness: 70, damping: 18 });
  const cols = useRef([]);
  const [label, setLabel] = useState(0);
  const paint = v => {
    const n = Math.min(100, Math.max(0, Math.round(v)));
    String(n).padStart(3, '0').split('').forEach((d, i) => {
      const c = cols.current[i];
      if (c && c.dataset.d !== d) { c.dataset.d = d; c.style.transform = `translateY(${-d * 10}%)`; }
    });
    setLabel(l => (n - l >= 10 || n === 100 ? n : l));   // announce in steps, not every tick
  };
  useMotionValueEvent(shown, 'change', paint);
  useEffect(() => paint(shown.get()), []);
  return html`
    <div class="counter" aria-hidden="true">
      ${[0, 1, 2].map(i => html`
        <span class="digit" key=${i}><span class="strip" ref=${el => (cols.current[i] = el)}>
          ${[...'0123456789'].map(d => html`<span key=${d}>${d}</span>`)}
        </span></span>`)}
    </div>
    <span class="sr" role="status">Loading reels, ${label} percent</span>`;
}

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+/<>';
function Scramble({ text }) {
  const [out, setOut] = useState(text);
  useEffect(() => {
    let tick = 0;
    const id = setInterval(() => {
      tick++;
      const revealed = Math.floor((tick % 44) / 2.4);   // resolve left to right, then start over
      setOut([...text].map((ch, i) => (ch === ' ' || i < revealed ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0])).join(''));
    }, 55);
    return () => clearInterval(id);
  }, [text]);
  return html`<span class="scramble" aria-hidden="true">${out}</span>`;
}

function Loader({ progress, expansion, onSkip }) {
  const opacity = useTransform(expansion, [0, 0.12], [1, 0]);
  return html`
    <${motion.div} class="loader" style=${{ opacity }}>
      <button class="skip" onClick=${onSkip}>Skip intro</button>
      <div class="meter">
        <${Scramble} text="Loading Reels" />
        <${Counter} progress=${progress} />
      </div>
    <//>`;
}

/* The wordmark is a single element: it starts large in the loader and lands as the header logo. */
function Brand({ expansion }) {
  const t = useTransform(expansion, v => clamp01(v / 0.6));
  const scale = useTransform(t, v => lerp(1.9, 1, v));
  const y = useTransform(t, v => lerp(14, 0, v));
  const color = useTransform(expansion, [0, 0.45], ['#111111', '#ffffff']);
  return html`<${motion.a} href="index.html" class="brand" style=${{ scale, y, color }}>Sudeep Mannava<i>.</i><//>`;
}

/* Bottom menu and frame arrive while the ring is still settling. */
function Chrome({ expansion }) {
  const opacity = useTransform(expansion, [0.55, 0.92], [0, 1]);
  return html`
    <${motion.div} class="frame" style=${{ opacity }} aria-hidden="true" />
    <${motion.nav} class="dock" style=${{ opacity }}>
      <a href="index.html"><svg viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="4" height="4" rx="1"/><rect x="6" y="1" width="4" height="4" rx="1"/><rect x="11" y="1" width="4" height="4" rx="1"/><rect x="1" y="6" width="4" height="4" rx="1"/><rect x="6" y="6" width="4" height="4" rx="1"/><rect x="11" y="6" width="4" height="4" rx="1"/><rect x="1" y="11" width="4" height="4" rx="1"/><rect x="6" y="11" width="4" height="4" rx="1"/><rect x="11" y="11" width="4" height="4" rx="1"/></svg><span>Work</span></a>
      <a href="reels.html" class="on" aria-current="page"><svg viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="1.5" width="5" height="13" rx="1.5"/><rect x="9" y="1.5" width="5" height="13" rx="1.5"/></svg><span>Reels</span></a>
      <a href="index.html?p=about"><svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="5" r="3"/><path d="M2 15c0-3.3 2.7-5 6-5s6 1.7 6 5z"/></svg><span>About</span></a>
    <//>
    <h1 class="sr">Reels by Sudeep Mannava</h1>`;
}

/* ───────────────────────────── Ring ───────────────────────────── */

function Ring({ formation, expansion, entering, onProgress, spin }) {
  const rootRef = useRef(null);
  const target = useMotionValue(0);
  const rotation = useSpring(target, { stiffness: 38, damping: 16 });

  useEffect(() => {
    const root = rootRef.current, roll = root.querySelector('.roll'), cyl = root.querySelector('.cyl');
    const cache = new Map();
    // write a style only when its value changed
    const put = (el, prop, val) => {
      let c = cache.get(el); if (!c) cache.set(el, (c = {}));
      if (c[prop] === val) return;
      c[prop] = val;
      if (prop.startsWith('--')) el.style.setProperty(prop, val); else el.style[prop] = val;
    };

    // ── slots and the assets the loader waits for
    let loaded = 0;
    const front = i => Math.abs(slotAngle(i)) <= 67.5;              // cards facing the camera once inside
    const total = COUNT + [...Array(COUNT).keys()].filter(front).length;
    const done = () => { loaded++; onProgress(Math.min(loaded / total, 1)); };

    const slots = [...root.querySelectorAll('.card')].map((el, i) => ({
      i, el, img: el.querySelector('img'), vid: el.querySelector('video'), label: el.querySelector('.sr'), reel: -1,
    }));
    const setReel = (s, r, count) => {
      const reel = REELS[r];
      s.reel = r;
      s.el.href = reel.href;
      s.el.setAttribute('aria-label', `${reel.title}, by ${reel.company}`);
      s.label.textContent = `${reel.title}, by ${reel.company}`;
      if (count) { s.img.addEventListener('load', done, { once: true }); s.img.addEventListener('error', done, { once: true }); }
      s.img.src = reel.cover;
      if (s.vid.getAttribute('src')) { s.vid.pause(); s.vid.removeAttribute('src'); s.vid.load(); }
    };
    slots.forEach(s => {
      s.vid.muted = true;
      setReel(s, s.i % REELS.length, true);
      if (front(s.i)) {   // preload the previews that will be on screen first
        s.vid.addEventListener('loadeddata', done, { once: true });
        s.vid.addEventListener('error', done, { once: true });
        s.vid.preload = 'auto'; s.vid.src = REELS[s.reel].video;
      }
    });

    // ── input: drag / swipe / wheel move the target; the spring does the rest
    let dragging = false, lastX = 0, vx = 0, moved = 0, px = -1, py = -1, hot = null;
    const down = e => { if (entering.current || e.button > 0) return; dragging = true; lastX = e.clientX; vx = 0; moved = 0; root.classList.add('drag'); };
    const move = e => {
      px = e.clientX; py = e.clientY;
      if (!dragging) return;
      const dx = e.clientX - lastX; lastX = e.clientX; vx = dx; moved += Math.abs(dx);
      target.set(target.get() - dx * DRAG);
    };
    const up = () => { if (!dragging) return; dragging = false; root.classList.remove('drag'); target.set(target.get() - vx * DRAG * 10); };
    const click = e => { if (moved > 6) { e.preventDefault(); e.stopPropagation(); } moved = 0; };
    const wheel = e => {
      e.preventDefault();                       // the page never scrolls; during the entrance nothing happens
      if (!entering.current) target.set(target.get() + (e.deltaX + e.deltaY) * 0.08);
    };
    root.addEventListener('pointerdown', down);
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
    root.addEventListener('click', click, true);
    addEventListener('wheel', wheel, { passive: false });

    // ── frame loop
    let raf, frame = 0, last = performance.now();
    const tick = now => {
      const dt = Math.min((now - last) / 1000, 0.05); last = now; frame++;
      if (!dragging && spin) target.set(target.get() + spin * dt * (hot ? 0.2 : 1));

      const ex = expansion.get(), f = formation.get(), rot = rotation.get();
      const sc = sceneAt(ex, rot);
      // shared values live on the ring element as CSS variables
      put(root, '--p', `${sc.perspective.toFixed(1)}px`);
      put(root, '--roll', `${sc.roll.toFixed(2)}deg`);
      put(root, '--tilt', `${sc.tilt.toFixed(2)}deg`);
      put(root, '--camz', `${(sc.perspective - sc.camDist).toFixed(1)}px`);
      put(root, '--s', sc.scale.toFixed(3));

      const checkVideo = frame % 6 === 0;
      for (const s of slots) {
        const rest = slotAngle(s.i);
        const pose = reelPose(rest, f, sc);
        const hidden = pose.behindCamera || pose.appear < 0.005;

        // recycle: once a card has passed the back, give it the next reel in line
        if (hidden && f >= 1) {
          const lap = Math.floor((rest + rot + 180) / 360);
          const want = mod(s.i + lap * COUNT, REELS.length);
          if (want !== s.reel) setReel(s, want, false);
        }

        put(s.el, 'transform', `translate3d(${pose.x.toFixed(1)}px,0,${pose.z.toFixed(1)}px) rotateY(${pose.yaw.toFixed(2)}deg) scale(var(--s))`);
        put(s.el, 'opacity', hidden ? '0' : pose.appear.toFixed(3));
        put(s.el, 'visibility', hidden ? 'hidden' : 'visible');

        // only cards facing the camera play
        if (checkVideo) {
          const facing = !hidden && ex > 0.5 && Math.abs(wrap180(pose.yaw)) < 75 && !document.hidden;
          if (facing) {
            const src = REELS[s.reel].video;
            if (s.vid.getAttribute('src') !== src) { s.vid.preload = 'auto'; s.vid.src = src; }
            if (s.vid.paused) s.vid.play().catch(() => {});
          } else if (!s.vid.paused) s.vid.pause();
        }
      }

      // hover hit-testing every third frame
      if (frame % 3 === 0 && px >= 0 && !dragging && !entering.current) {
        const card = document.elementFromPoint(px, py)?.closest?.('.card') || null;
        if (card !== hot) { hot?.classList.remove('hot'); card?.classList.add('hot'); hot = card; }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      root.removeEventListener('pointerdown', down);
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
      root.removeEventListener('click', click, true);
      removeEventListener('wheel', wheel);
    };
  }, []);

  return html`
    <div class="ring" ref=${rootRef}>
      <div class="roll"><div class="cyl">
        ${[...Array(COUNT).keys()].map(i => html`
          <a class="card" key=${i} draggable="false">
            <img alt="" draggable="false" decoding="async" />
            <video playsinline loop muted preload="none" tabindex="-1" aria-hidden="true"></video>
            <span class="sr"></span>
          </a>`)}
      </div></div>
    </div>`;
}

/* ───────────────────────────── App ───────────────────────────── */

function App() {
  // no entrance with reduced motion, or when coming back from a reel in the player
  const skipIntro = useMemo(() => {
    let seen = false; try { seen = sessionStorage.getItem('sm-reels') === '1'; } catch {}
    return seen || matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);
  const formation = useMotionValue(skipIntro ? 1 : 0);
  const expansion = useMotionValue(skipIntro ? 1 : 0);
  const progress = useMotionValue(0);
  const [phase, setPhase] = useState(skipIntro ? 'done' : 'loading');
  const entering = useRef(!skipIntro);
  const running = useRef([]);
  const assetsReady = useRef(null);
  const backdrop = useTransform(expansion, [0, 0.45], [1, 0]);

  const finish = () => {
    if (!entering.current) return;
    entering.current = false;
    try { sessionStorage.setItem('sm-reels', '1'); } catch {}
    document.documentElement.classList.remove('entering');
    setPhase('done');
  };
  const skip = () => {
    if (!entering.current) return;
    running.current.forEach(a => a.stop());
    formation.set(1); expansion.set(1);
    assetsReady.current?.();
    finish();
  };

  useEffect(() => {
    if (skipIntro) return;
    document.documentElement.classList.add('entering');
    const assets = new Promise(res => (assetsReady.current = res));
    const timeout = setTimeout(() => assetsReady.current(), ASSET_TIMEOUT);
    const deal = animate(formation, 1, { duration: FORMATION_S, ease: 'linear' });
    running.current.push(deal);
    // expansion waits for whichever is later: the deal finishing, or the real assets
    Promise.all([deal, assets]).then(() => {
      if (!entering.current) return;
      const reveal = animate(expansion, 1, { duration: EXPANSION_S, ease: EXPANSION_EASE });
      running.current.push(reveal);
      reveal.then(finish);
    });
    const key = e => { if (e.key === 'Escape' || e.key === 'Tab') skip(); };
    addEventListener('keydown', key);
    return () => { clearTimeout(timeout); removeEventListener('keydown', key); };
  }, []);

  const onProgress = f => { progress.set(f); if (f >= 1) assetsReady.current?.(); };

  return html`
    <${motion.div} class="backdrop" style=${{ opacity: skipIntro ? 0 : backdrop }} aria-hidden="true" />
    <${Ring} formation=${formation} expansion=${expansion} entering=${entering} onProgress=${onProgress} spin=${matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : SPIN} />
    <${Chrome} expansion=${expansion} />
    <header class="top"><${Brand} expansion=${expansion} /></header>
    ${phase !== 'done' && html`<${Loader} progress=${progress} expansion=${expansion} onSkip=${skip} />`}`;
}

createRoot(document.getElementById('root')).render(html`<${App} />`);
