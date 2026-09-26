// The arena as a real room: a tiered half-circle chamber in 3D, for the homepage hero.
//
// It plays the same round the 2D arena does, with the same seating rule: buyers take
// the next free seat in the order they decide, then glide along the rows into blocs
// while the camera rises until the blocs read as clean wedges. Seat positions come
// from the 2D layout, so the room and the flat chamber are the same arrangement seen
// from different places.
//
// It is decoration on top of the 2D arena, never a replacement: the caller only uses
// it when WebGL works and the visitor hasn't asked for less motion or less data, and
// the canvas is hidden from screen readers. Same interface as liveArena().

import { THREE } from "./vendor/three-lite.js";
import { layout } from "./arena.js";

const cssColor = (c) => {
  const m = /^var\((--[\w-]+)\)$/.exec(String(c).trim());
  const v = m ? getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() : c;
  return new THREE.Color(v || "#8E8E95");
};
const SKIN = ["#F2D6C1", "#E6B996", "#C98E68", "#9C6644", "#6E4630"];
const skinOf = (id) => SKIN[[...String(id)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % SKIN.length];
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const UNDECIDED = new THREE.Color("#C9C9C4");
const WHITE = new THREE.Color("#FFFFFF");
// A buyer too close to call is drawn paler, the 3D counterpart of the dashed ring.
const pickColor = (color, dashed) => (dashed ? cssColor(color).lerp(WHITE, 0.45) : cssColor(color));

export function arena3D(host, { people }) {
  host.classList.add("arena3d");
  host.innerHTML = `<div class="a3-center" aria-hidden="true"></div>`;
  const center = host.firstElementChild;

  // The same seats the 2D arena uses, turned into positions on tiered rows.
  const L = layout(people.length, 520, { seat: 50 });
  const radii = [...L.radii].sort((a, b) => a - b);                 // inner row first
  const unit = 0.019;                                                // px -> world
  const rowY = (r) => 0.14 + radii.indexOf(r) * 0.34;               // outer rows sit higher
  const seatPos = (s) => new THREE.Vector3(Math.cos(s.a) * s.r * unit, rowY(s.r), -Math.sin(s.a) * s.r * unit);
  const seats = L.seats.map(seatPos);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 2, 0.1, 100);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.prepend(renderer.domElement);

  // Light: a soft sky and one warm key light from the front left, so the rows cast
  // gentle shadows and the room reads as a place.
  scene.add(new THREE.HemisphereLight("#FFFFFF", "#D9D6CF", 1.9));
  const key = new THREE.DirectionalLight("#FFF4E6", 2.1);
  key.position.set(-4, 9, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 30 });
  key.shadow.radius = 5;
  key.shadow.bias = -0.0004;
  scene.add(key);

  // The room: a floor, a tier under each row, and the front edge the 2D chamber
  // draws as its floor line.
  // The floor itself is invisible, only its shadows show, so the room sits on the
  // stage's own white instead of in a box of its own.
  const tierMat = new THREE.MeshStandardMaterial({ color: "#F3F1EC", roughness: 0.92 });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(12, 64), new THREE.ShadowMaterial({ opacity: 0.1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const outer = Math.max(...radii) * unit;
  radii.forEach((r) => {
    const R = r * unit, half = 0.42;
    const shape = new THREE.Shape();
    shape.absarc(0, 0, R + half, 0, Math.PI, false);
    shape.absarc(0, 0, Math.max(0.2, R - half), Math.PI, 0, true);
    const h = rowY(r);
    const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 64 });
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, tierMat);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
  });
  const edge = new THREE.Mesh(new THREE.BoxGeometry((outer + 0.5) * 2, 0.02, 0.05), new THREE.MeshStandardMaterial({ color: "#CFCCC5" }));
  edge.position.set(0, 0.01, 0.05);
  scene.add(edge);

  // The buyers: a figure each, a body in their pick's colour and a head in a skin tone.
  const bodyG = new THREE.CapsuleGeometry(0.15, 0.2, 6, 16);
  const headG = new THREE.SphereGeometry(0.125, 24, 16);
  const start = new THREE.Vector3(0, 0, 0.35);
  const figures = Object.fromEntries(people.map((p) => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(bodyG, new THREE.MeshStandardMaterial({ color: UNDECIDED.clone(), roughness: 0.55 }));
    body.position.y = 0.25;
    const head = new THREE.Mesh(headG, new THREE.MeshStandardMaterial({ color: skinOf(p.id), roughness: 0.7 }));
    head.position.y = 0.6;
    [body, head].forEach((m) => { m.castShadow = true; });
    g.add(body, head);
    g.position.copy(start);
    g.scale.setScalar(0.001);
    g.visible = false;
    scene.add(g);
    return [p.id, { g, body }];
  }));

  // Camera: low and close while buyers arrive, rising as the room sorts.
  const VIEW = {
    low: { pos: new THREE.Vector3(0, 2.3, 9.3), look: new THREE.Vector3(0, 0.55, -1.4) },
    high: { pos: new THREE.Vector3(0, 7.4, 7.9), look: new THREE.Vector3(0, 0, -1.55) },
  };
  const cam = { pos: VIEW.low.pos.clone(), look: VIEW.low.look.clone() };
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  // On a narrow screen the camera stands further back, so the whole room still fits.
  let fit = 1;
  const eye = new THREE.Vector3();

  // A small tween list; the loop runs only while something moves or is on screen.
  const tweens = [];
  const tween = (ms, step, delay = 0) => new Promise((done) => tweens.push({ t0: performance.now() + delay, ms, step, done }));
  let running = false, visible = true, raf = 0;
  function frame(now) {
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      const t = Math.min(1, Math.max(0, (now - tw.t0) / tw.ms));
      if (now >= tw.t0) tw.step(t);
      if (t >= 1) { tweens.splice(i, 1); tw.done(); }
    }
    pointer.x += (pointer.tx - pointer.x) * 0.06;
    pointer.y += (pointer.ty - pointer.y) * 0.06;
    eye.subVectors(cam.pos, cam.look).multiplyScalar(fit).add(cam.look);
    camera.position.set(eye.x + pointer.x * 0.7, eye.y + pointer.y * 0.35, eye.z);
    camera.lookAt(cam.look);
    renderer.render(scene, camera);
    const settling = Math.abs(pointer.tx - pointer.x) + Math.abs(pointer.ty - pointer.y) > 0.002;
    if (visible && (tweens.length || settling)) raf = requestAnimationFrame(frame);
    else running = false;
  }
  const kick = () => { if (!running && visible) { running = true; raf = requestAnimationFrame(frame); } };

  function size() {
    const w = host.clientWidth || 520, h = host.clientHeight || 300;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    camera.aspect = w / h;
    fit = Math.max(1, 1.75 / camera.aspect);
    camera.updateProjectionMatrix();
    kick();
  }
  const ro = new ResizeObserver(size); ro.observe(host);
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) kick(); }); io.observe(host);
  const onMove = (e) => {
    const r = host.getBoundingClientRect();
    pointer.tx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
    pointer.ty = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
    kick();
  };
  addEventListener("pointermove", onMove, { passive: true });
  size();

  const moveTo = (f, to, ms, delay, lift) => {
    const from = f.g.position.clone();
    return tween(ms, (t) => {
      const e = ease(t);
      f.g.position.lerpVectors(from, to, e);
      f.g.position.y += Math.sin(Math.PI * e) * lift;
    }, delay);
  };
  const tint = (f, color, dashed, ms, delay = 0) => {
    const a = f.body.material.color.clone(), b = pickColor(color, dashed);
    return tween(ms, (t) => f.body.material.color.lerpColors(a, b, t), delay);
  };
  const setCenter = (c) => {
    center.innerHTML = c ? `${c.name ? `<span class="ac-name">${c.name}</span>` : ""}<span class="ac-big">${c.big}</span>${c.sub ? `<span class="ac-sub">${c.sub}</span>` : ""}` : "";
  };

  const taken = [];
  return {
    take(id, color, dashed) {
      const f = figures[id];
      if (!f || taken.includes(id)) return;
      const seat = seats[taken.length];
      taken.push(id);
      f.g.visible = true;
      f.g.position.copy(start);
      tween(420, (t) => f.g.scale.setScalar(0.001 + ease(t) * 0.999));
      moveTo(f, seat, 520, 0, 0.9);
      tint(f, color, dashed, 360, 260);
      kick();
    },
    setCenter,
    // Everyone to their bloc seat, nearer seats first, while the camera rises.
    sort(ids) {
      ids.forEach((id, i) => { const f = figures[id]; if (f) moveTo(f, seats[i], 900, i * 30, 0.35); });
      const p0 = cam.pos.clone(), l0 = cam.look.clone();
      const rise = tween(1400, (t) => { const e = ease(t); cam.pos.lerpVectors(p0, VIEW.high.pos, e); cam.look.lerpVectors(l0, VIEW.high.look, e); });
      kick();
      return Promise.all([rise, new Promise((r) => setTimeout(r, 900 + ids.length * 30))]);
    },
    // The finished room: every buyer seated in bloc order, in colour, seen from above.
    settle(finalPeople, c) {
      finalPeople.forEach((p, i) => {
        const f = figures[p.id]; if (!f) return;
        f.g.visible = true; f.g.scale.setScalar(1); f.g.position.copy(seats[i]);
        f.body.material.color.copy(pickColor(p.color, p.dashed));
      });
      cam.pos.copy(VIEW.high.pos); cam.look.copy(VIEW.high.look);
      setCenter(c);
      kick();
    },
    reset() {
      taken.length = 0;
      Object.values(figures).forEach((f) => { f.g.visible = false; f.g.scale.setScalar(0.001); f.g.position.copy(start); f.body.material.color.copy(UNDECIDED); });
      cam.pos.copy(VIEW.low.pos); cam.look.copy(VIEW.low.look);
      setCenter(null);
      kick();
    },
    dispose() {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
      removeEventListener("pointermove", onMove);
      renderer.dispose(); host.classList.remove("arena3d"); host.innerHTML = "";
    },
  };
}

// Whether to offer the room at all: WebGL has to work, and the visitor hasn't asked
// for reduced motion or reduced data.
export function canUse3D() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  if (navigator.connection?.saveData) return false;
  try { const c = document.createElement("canvas"); return Boolean(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; }
}
