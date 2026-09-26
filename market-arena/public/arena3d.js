// The arena as a real room: a tiered half-circle chamber in 3D, for the homepage hero.
//
// It plays the same round the 2D arena does, with the same seating rule: buyers take
// the next free seat in the order they decide, then hop along the rows into blocs
// while the camera rises until the blocs read as clean wedges. Seat positions come
// from the 2D layout, so the room and the flat chamber are the same arrangement seen
// from different places.
//
// The look is a studio render of a small ceramic model: beveled tiers around a stage,
// a chair at every seat, and each buyer as a glossy seated figure with the same skin
// tone and hair as their face in the 2D product, lit by a soft studio environment.
//
// It is decoration on top of the 2D arena, never a replacement: the caller only uses
// it when WebGL works and the visitor hasn't asked for less motion or less data, and
// the canvas is hidden from screen readers. Same interface as liveArena().

import { THREE } from "./vendor/three-lite.js";
import { layout } from "./arena.js";
import { faceTraits } from "./icons.js";

const cssColor = (c) => {
  const m = /^var\((--[\w-]+)\)$/.exec(String(c).trim());
  const v = m ? getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() : c;
  return new THREE.Color(v || "#8E8E95");
};
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
// A small overshoot, for landings that settle rather than stop.
const backOut = (t) => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const UNDECIDED = new THREE.Color("#CFCBC3");
const WHITE = new THREE.Color("#FFFFFF");
// A buyer too close to call is drawn paler, the 3D counterpart of the dashed ring.
const pickColor = (color, dashed) => (dashed ? cssColor(color).lerp(WHITE, 0.45) : cssColor(color));

// Materials: a warm ceramic for the building, a glossy vinyl for the people.
const ceramic = (color, rough = 0.6) => new THREE.MeshPhysicalMaterial({ color, roughness: rough, clearcoat: 0.25, clearcoatRoughness: 0.45 });
const vinyl = (color) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.34, clearcoat: 0.85, clearcoatRoughness: 0.16 });

// A seated bust with soft shoulders, turned on a lathe so it reads as one moulded piece.
const TORSO = new THREE.LatheGeometry([
  [0, 0], [0.15, 0], [0.172, 0.03], [0.176, 0.1], [0.168, 0.16], [0.182, 0.23], [0.198, 0.285], [0.186, 0.318], [0.14, 0.338], [0.07, 0.35], [0, 0.352],
].map(([x, y]) => new THREE.Vector2(x, y)), 48);
const NECK = new THREE.CylinderGeometry(0.043, 0.05, 0.07, 20);
// An arm hangs from the shoulder and bends forward so the hand rests in the lap.
const ARM = new THREE.CapsuleGeometry(0.043, 0.15, 6, 16);
const HAND = new THREE.SphereGeometry(0.04, 16, 12);
const HEAD = new THREE.SphereGeometry(0.128, 40, 28);
const EYE = new THREE.SphereGeometry(0.0125, 10, 8);
// Hair caps, one per 2D hair style: crop, long, wave, bun, side part, curls.
const cap = (theta) => new THREE.SphereGeometry(0.136, 40, 20, 0, Math.PI * 2, 0, theta);
const CAP = { short: cap(Math.PI * 0.44), full: cap(Math.PI * 0.52) };
const BUN = new THREE.SphereGeometry(0.06, 20, 14);
const CURL = new THREE.SphereGeometry(0.045, 14, 10);
const LONG = new THREE.CylinderGeometry(0.12, 0.15, 0.2, 28, 1, true, Math.PI * 0.62, Math.PI * 0.76);

function hairFor(style, mat) {
  const g = new THREE.Group();
  const add = (geo, x = 0, y = 0, z = 0, rx = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, 0, rz); m.castShadow = true; g.add(m); return m; };
  if (style === 0) add(CAP.short, 0, 0, 0, -0.42);
  else if (style === 1) { add(CAP.full, 0, 0, 0, -0.3); add(LONG, 0, -0.1, 0); }
  else if (style === 2) add(CAP.full, 0, 0.004, 0, -0.5, 0.12);
  else if (style === 3) { add(CAP.short, 0, 0, 0, -0.38); add(BUN, 0, 0.1, -0.1); }
  else if (style === 4) add(CAP.full, 0, 0, 0, -0.4, -0.22);
  else { add(CAP.short, 0, 0, 0, -0.35); [[-0.09, 0.08, 0.02], [0.09, 0.08, 0.02], [0, 0.12, -0.02], [-0.1, 0.02, -0.07], [0.1, 0.02, -0.07], [0, 0.07, -0.11]].forEach(([x, y, z]) => add(CURL, x, y, z)); }
  return g;
}

// A soft round shadow under the whole room, so it sits on the page instead of floating.
function contactShadow(w, d) {
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const x = c.getContext("2d");
  const grad = x.createRadialGradient(128, 128, 10, 128, 128, 128);
  grad.addColorStop(0, "rgba(40,32,20,0.34)"); grad.addColorStop(0.55, "rgba(40,32,20,0.14)"); grad.addColorStop(1, "rgba(40,32,20,0)");
  x.fillStyle = grad; x.fillRect(0, 0, 256, 256);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  return m;
}

// A half-annulus, extruded upwards with a soft bevel on its edges.
function sector(inner, outer, height, mat) {
  const s = new THREE.Shape();
  s.absarc(0, 0, outer, 0, Math.PI, false);
  s.absarc(0, 0, inner, Math.PI, 0, true);
  const bevel = Math.min(0.035, height / 3);
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.01, height - bevel * 2), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 96 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, bevel, 0);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

export function arena3D(host, { people }) {
  host.classList.add("arena3d");
  host.innerHTML = `<div class="a3-center" aria-hidden="true"></div>`;
  const center = host.firstElementChild;

  // The same seats the 2D arena uses, turned into positions on tiered rows.
  const L = layout(people.length, 520, { seat: 50 });
  const radii = [...L.radii].sort((a, b) => a - b);                 // inner row first
  const unit = 0.019;                                                // px -> world
  const STEP = 0.3;
  const rowY = (r) => 0.16 + radii.indexOf(r) * STEP;               // outer rows sit higher
  const seatAt = (s) => ({ pos: new THREE.Vector3(Math.cos(s.a) * s.r * unit, rowY(s.r), -Math.sin(s.a) * s.r * unit), face: Math.atan2(-Math.cos(s.a), Math.sin(s.a)) });
  const seats = L.seats.map(seatAt);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 2, 0.1, 100);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Neutral tone mapping keeps the version colours true to the rest of the page.
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  // Shadows are redrawn only while something moves, which is most of the cost of a
  // frame; while the room just breathes they are refreshed a few times a second.
  renderer.shadowMap.autoUpdate = false;
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.prepend(renderer.domElement);

  // Light: a studio environment for soft reflections, a warm key from the front left
  // with blurred shadows, and a cool rim from behind that outlines the figures.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new THREE.RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.62;
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight("#FFFFFF", "#E7E0D2", 0.55));
  const key = new THREE.DirectionalLight("#FFF1DF", 2.3);
  key.position.set(-4.5, 9, 6.5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
  key.shadow.radius = 7;
  key.shadow.blurSamples = 20;
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.02;
  scene.add(key);
  const rim = new THREE.DirectionalLight("#E4ECFF", 1.1);
  rim.position.set(3.5, 4.5, -8);
  scene.add(rim);

  // The building: a floor that only shows shadows, a soft contact shadow, a beveled
  // tier under each row, a low wall behind the top row, and a stage in the middle.
  const stone = ceramic("#F4F1EA", 0.62);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 64), new THREE.ShadowMaterial({ opacity: 0.08 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const outer = Math.max(...radii) * unit, inner = Math.min(...radii) * unit;
  const shadowPlane = contactShadow((outer + 1.6) * 2, (outer + 1.6) * 1.3);
  shadowPlane.position.set(0, 0.002, -outer * 0.35);
  scene.add(shadowPlane);
  const HALF = 0.4;
  radii.forEach((r) => scene.add(sector(Math.max(0.2, r * unit - HALF), r * unit + HALF, rowY(r), stone)));
  scene.add(sector(outer + HALF + 0.02, outer + HALF + 0.16, rowY(radii[radii.length - 1]) + 0.26, stone));
  const Rs = Math.max(0.6, inner - HALF - 0.2);
  const stage = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [Rs + 0.02, 0], [Rs + 0.05, 0.02], [Rs + 0.05, 0.05], [Rs + 0.02, 0.07], [0, 0.07]].map(([x, y]) => new THREE.Vector2(x, y)), 96), ceramic("#EFEBE3", 0.5));
  stage.receiveShadow = true; stage.castShadow = true;
  scene.add(stage);
  // A thin ring on the stage that lights up in the winning colour once the room sorts.
  const glowMat = new THREE.MeshStandardMaterial({ color: "#D8D3C9", emissive: "#000000", roughness: 0.4 });
  const glow = new THREE.Mesh(new THREE.TorusGeometry(Rs + 0.1, 0.022, 12, 180), glowMat);
  glow.rotation.x = -Math.PI / 2; glow.position.y = 0.024;
  scene.add(glow);

  // A chair at every seat, turned to face the stage.
  // Upholstered in a warm sand, a shade darker than the stone, so a seat reads as a seat.
  const chairMat = new THREE.MeshPhysicalMaterial({ color: "#DCCFBC", roughness: 0.72, sheen: 0.6, sheenRoughness: 0.5, sheenColor: "#FFF6E8" });
  const PAD = new THREE.RoundedBoxGeometry(0.58, 0.11, 0.52, 4, 0.05);
  const BACK = new THREE.RoundedBoxGeometry(0.58, 0.46, 0.12, 4, 0.055);
  seats.forEach(({ pos, face }) => {
    const c = new THREE.Group();
    const pad = new THREE.Mesh(PAD, chairMat); pad.position.set(0, 0.055, -0.05);
    const back = new THREE.Mesh(BACK, chairMat); back.position.set(0, 0.3, -0.33); back.rotation.x = -0.14;
    [pad, back].forEach((m) => { m.castShadow = true; m.receiveShadow = true; c.add(m); });
    c.position.copy(pos); c.rotation.y = face;
    scene.add(c);
  });

  // The buyers: a glossy bust in their pick's colour, a head in their skin tone with
  // the hair their 2D face has, and a ring that pulses on the floor as they choose.
  const eyeMat = new THREE.MeshBasicMaterial({ color: "#2B211A" });
  const ringGeo = new THREE.RingGeometry(0.28, 0.32, 48);
  const start = new THREE.Vector3(0, 0.08, 0.3);
  const entry = (seat) => new THREE.Vector3(seat.pos.x * 0.55, 0.08, 0.15);
  // Figures and chairs are drawn a little larger than life for the room, so a buyer
  // still reads as a person at hero size.
  const FIG = 1.4;
  const figures = Object.fromEntries(people.map((p, i) => {
    const t = faceTraits(p);
    const g = new THREE.Group();
    const bodyMat = vinyl(UNDECIDED.clone());
    const body = new THREE.Mesh(TORSO, bodyMat);
    body.castShadow = true; body.receiveShadow = true;
    const head = new THREE.Group();
    head.position.y = 0.47;
    const skull = new THREE.Mesh(HEAD, new THREE.MeshPhysicalMaterial({ color: t.skin, roughness: 0.52, clearcoat: 0.3, clearcoatRoughness: 0.4 }));
    skull.castShadow = true;
    const eyes = [-0.045, 0.045].map((x) => { const e = new THREE.Mesh(EYE, eyeMat); e.position.set(x, 0.005, 0.12); return e; });
    head.add(skull, ...eyes, hairFor(t.hairStyle, new THREE.MeshPhysicalMaterial({ color: t.hairColor, roughness: 0.45, clearcoat: 0.35 })));
    const skinMat = skull.material;
    const neck = new THREE.Mesh(NECK, skinMat); neck.position.y = 0.36;
    const arms = [-1, 1].map((side) => {
      const a = new THREE.Group();
      a.position.set(side * 0.19, 0.27, 0.0);
      a.rotation.set(-0.62, 0, side * 0.1);
      const sleeve = new THREE.Mesh(ARM, bodyMat); sleeve.position.y = -0.1;
      const hand = new THREE.Mesh(HAND, skinMat); hand.position.set(0, -0.2, 0.01);
      [sleeve, hand].forEach((m) => { m.castShadow = true; a.add(m); });
      return a;
    });
    const person = new THREE.Group();
    person.position.set(0, 0.11, 0.02);
    person.add(body, neck, ...arms, head);
    g.add(person);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: UNDECIDED.clone(), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.012;
    scene.add(ring);
    person.scale.setScalar(FIG);
    g.position.copy(start);
    g.scale.setScalar(0.001);
    g.visible = false;
    scene.add(g);
    return [p.id, { g, person, body, bodyMat, head, ring, phase: i * 1.37 }];
  }));

  // Camera: low and close while buyers arrive, rising as the room sorts.
  const VIEW = {
    low: { pos: new THREE.Vector3(0, 2.7, 10.2), look: new THREE.Vector3(0, 0.55, -1.2) },
    high: { pos: new THREE.Vector3(0, 6.6, 8.3), look: new THREE.Vector3(0, 0.15, -1.45) },
  };
  const cam = { pos: VIEW.low.pos.clone(), look: VIEW.low.look.clone() };
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  // On a narrow screen the camera stands further back, so the whole room still fits.
  let fit = 1;
  const eye = new THREE.Vector3();

  // A small tween list. While the room is on screen it also breathes: figures bob and
  // glance about a little, at a gentle frame rate, and everything stops off screen.
  const tweens = [];
  const tween = (ms, step, delay = 0) => new Promise((done) => tweens.push({ t0: performance.now() + delay, ms, step, done }));
  let running = false, visible = true, raf = 0, last = 0, idleFrames = 0;
  const idle = Object.values(figures);
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const busy = tweens.length > 0 || Math.abs(pointer.tx - pointer.x) + Math.abs(pointer.ty - pointer.y) > 0.002;
    if (!busy && now - last < 33) return;                               // ~30 fps when only breathing
    last = now;
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      const t = Math.min(1, Math.max(0, (now - tw.t0) / tw.ms));
      if (now >= tw.t0) tw.step(t);
      if (t >= 1) { tweens.splice(i, 1); tw.done(); }
    }
    const s = now / 1000;
    if (busy || ++idleFrames % 8 === 0) renderer.shadowMap.needsUpdate = true;
    idle.forEach((f) => {
      if (!f.g.visible || f.flying) return;
      f.person.position.y = 0.11 + Math.sin(s * 1.6 + f.phase) * 0.008;
      f.head.rotation.y = Math.sin(s * 0.45 + f.phase) * 0.22;
      f.head.rotation.x = Math.sin(s * 0.7 + f.phase * 2) * 0.05;
    });
    pointer.x += (pointer.tx - pointer.x) * 0.06;
    pointer.y += (pointer.ty - pointer.y) * 0.06;
    eye.subVectors(cam.pos, cam.look).multiplyScalar(fit).add(cam.look);
    camera.position.set(eye.x + pointer.x * 0.7 + Math.sin(s * 0.18) * 0.25, eye.y + pointer.y * 0.35, eye.z);
    camera.lookAt(cam.look);
    renderer.render(scene, camera);
  }
  const kick = () => { if (!running && visible) { running = true; raf = requestAnimationFrame(frame); } };
  const halt = () => { cancelAnimationFrame(raf); running = false; };

  function size() {
    const w = host.clientWidth || 520, h = host.clientHeight || 300;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    camera.aspect = w / h;
    fit = Math.max(1.1, 1.9 / camera.aspect);
    camera.updateProjectionMatrix();
    kick();
  }
  const ro = new ResizeObserver(size); ro.observe(host);
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) kick(); else halt(); }); io.observe(host);
  const onMove = (e) => {
    const r = host.getBoundingClientRect();
    pointer.tx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
    pointer.ty = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
  };
  addEventListener("pointermove", onMove, { passive: true });
  size();

  // A hop from wherever the figure is to a seat: an arc, a stretch in the air, a turn
  // to face the stage, and a squash on landing that settles with a little overshoot.
  const turnTo = (from, to) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from));
  function hop(f, seat, ms, delay, lift, onLand) {
    let from, r0;
    return tween(ms, (t) => {
      if (!from) { from = f.g.position.clone(); r0 = f.g.rotation.y; f.flying = true; }
      const e = ease(t);
      f.g.position.lerpVectors(from, seat.pos, e);
      f.g.position.y += Math.sin(Math.PI * e) * lift;
      f.g.rotation.y = r0 + (turnTo(r0, seat.face) - r0) * easeOut(t);
      const air = Math.sin(Math.PI * t);
      f.person.scale.set(FIG * (1 - air * 0.07), FIG * (1 + air * 0.14), FIG * (1 - air * 0.07));
    }, delay).then(() => {
      f.flying = false;
      onLand?.();
      return tween(300, (t) => {
        const k = backOut(t);
        f.person.scale.set(FIG * (1.12 - 0.12 * k), FIG * (0.8 + 0.2 * k), FIG * (1.12 - 0.12 * k));
      });
    });
  }
  const tint = (f, color, dashed, ms, delay = 0) => {
    const a = f.bodyMat.color.clone(), b = pickColor(color, dashed);
    return tween(ms, (t) => f.bodyMat.color.lerpColors(a, b, t), delay);
  };
  const pulse = (f, seat) => {
    f.ring.position.set(seat.pos.x, seat.pos.y + 0.012, seat.pos.z);
    f.ring.material.color.copy(f.bodyMat.color);
    return tween(820, (t) => { f.ring.scale.setScalar(1 + easeOut(t) * 1.6); f.ring.material.opacity = 0.75 * (1 - t); });
  };
  const light = (color, ms = 900) => {
    const a = glowMat.emissive.clone(), b = color.clone().multiplyScalar(0.9);
    const ca = glowMat.color.clone();
    return tween(ms, (t) => { glowMat.emissive.lerpColors(a, b, ease(t)); glowMat.color.lerpColors(ca, color, ease(t)); });
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
      f.g.position.copy(entry(seat));
      f.g.rotation.y = 0;
      tween(260, (t) => f.g.scale.setScalar(0.001 + backOut(t) * 0.999));
      tint(f, color, dashed, 260, 100);
      hop(f, seat, 640, 160, 1.0, () => pulse(f, seat));
      kick();
    },
    setCenter,
    // Everyone to their bloc seat, nearer seats first, while the camera rises; then
    // the stage ring lights up in the colour of the biggest bloc.
    sort(ids) {
      ids.forEach((id, i) => { const f = figures[id]; if (f) hop(f, seats[i], 820, i * 45, 0.55); });
      const p0 = cam.pos.clone(), l0 = cam.look.clone();
      const rise = tween(1500, (t) => { const e = ease(t); cam.pos.lerpVectors(p0, VIEW.high.pos, e); cam.look.lerpVectors(l0, VIEW.high.look, e); });
      const lead = figures[ids[0]];
      if (lead) light(lead.bodyMat.color, 900).then(() => {});
      kick();
      return Promise.all([rise, new Promise((r) => setTimeout(r, 1100 + ids.length * 45))]);
    },
    // The finished room: every buyer seated in bloc order, in colour, seen from above.
    settle(finalPeople, c) {
      finalPeople.forEach((p, i) => {
        const f = figures[p.id]; if (!f) return;
        f.g.visible = true; f.g.scale.setScalar(1); f.person.scale.setScalar(FIG);
        f.g.position.copy(seats[i].pos); f.g.rotation.y = seats[i].face;
        f.bodyMat.color.copy(pickColor(p.color, p.dashed));
      });
      if (finalPeople[0]) { const col = pickColor(finalPeople[0].color, false); glowMat.color.copy(col); glowMat.emissive.copy(col).multiplyScalar(0.9); }
      cam.pos.copy(VIEW.high.pos); cam.look.copy(VIEW.high.look);
      setCenter(c);
      kick();
    },
    reset() {
      taken.length = 0;
      tweens.length = 0;
      Object.values(figures).forEach((f) => {
        f.g.visible = false; f.g.scale.setScalar(0.001); f.g.position.copy(start); f.flying = false;
        f.person.scale.setScalar(FIG); f.bodyMat.color.copy(UNDECIDED); f.ring.material.opacity = 0;
      });
      glowMat.color.set("#D8D3C9"); glowMat.emissive.set("#000000");
      cam.pos.copy(VIEW.low.pos); cam.look.copy(VIEW.low.look);
      setCenter(null);
      kick();
    },
    dispose() {
      halt(); ro.disconnect(); io.disconnect();
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
