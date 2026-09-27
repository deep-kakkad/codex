// "Save as image": a round as one picture, for a slide, a post or a chat. The room of
// buyers in the colour of their pick, the verdict, the bars, and a quiet footer that
// says the buyers are simulated. Drawn on a canvas from the round's own data (no
// screenshot of the page), so it looks the same on every screen, at 2400×1350.

import { buyerFace } from "./icons.js";
import { layout } from "./arena.js";

const W = 1200, H = 675, SCALE = 2;
const INK = "#1C1C1F", MUTED = "#6B6B70", FAINT = "#9A9AA0", LINE = "#E6E5E1", BG = "#F4F3EF";
const FONT = "'Instrument Sans', system-ui, sans-serif";

const loadImg = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
const svgUrl = (svg) => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" '));

function wrap(ctx, text, maxW) {
  const words = String(text).split(/\s+/), lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}
function logo(ctx, x, y, s) {
  const k = s / 48;
  [[7, 33], [12, 21], [24, 16], [36, 21], [41, 33]].forEach(([cx, cy], i) => {
    ctx.fillStyle = i === 3 ? "#FF5A36" : INK;
    ctx.beginPath(); ctx.arc(x + cx * k, y + cy * k, 5.2 * k, 0, Math.PI * 2); ctx.fill();
  });
  ctx.globalAlpha = 0.35; ctx.fillStyle = INK; ctx.fillRect(x + 4 * k, y + 41.5 * k, 40 * k, 3 * k); ctx.globalAlpha = 1;
}
function round(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/* card: {
     kicker   "Cold brew comes to India · Round 2"
     verdict  "PureBean wins round 2"
     sub      one line under it
     people   [{ id, name, segment, segIndex, color (hex), dashed }] in seat order
     center   { big, sub }  the figure in the middle of the room
     bars     [{ label, value (0–1), color }]
   } → Promise<Blob> */
export async function snapshot(card) {
  try { await document.fonts?.load(`700 48px ${FONT}`); await document.fonts?.load(`500 18px ${FONT}`); } catch {}
  const c = document.createElement("canvas");
  c.width = W * SCALE; c.height = H * SCALE;
  const ctx = c.getContext("2d");
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
  // The card
  ctx.save(); ctx.shadowColor = "rgba(24,24,27,.10)"; ctx.shadowBlur = 30; ctx.shadowOffsetY = 8;
  round(ctx, 28, 28, W - 56, H - 56, 22); ctx.fillStyle = "#fff"; ctx.fill(); ctx.restore();
  // Header
  logo(ctx, 60, 54, 30);
  ctx.fillStyle = INK; ctx.font = `600 19px ${FONT}`; ctx.textBaseline = "middle";
  ctx.fillText("Market Arena", 98, 70);
  ctx.fillStyle = MUTED; ctx.font = `500 16px ${FONT}`; ctx.textAlign = "right";
  ctx.fillText(card.kicker || "", W - 60, 70); ctx.textAlign = "left";
  ctx.fillStyle = LINE; ctx.fillRect(60, 102, W - 120, 1);

  // Left: the verdict and the bars
  const LX = 60, LW = 470;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = INK; ctx.font = `700 46px ${FONT}`;
  try { ctx.fontStretch = "condensed"; } catch {}
  let y = 172;
  wrap(ctx, card.verdict, LW).slice(0, 3).forEach((l) => { ctx.fillText(l, LX, y); y += 50; });
  try { ctx.fontStretch = "normal"; } catch {}
  ctx.fillStyle = MUTED; ctx.font = `400 17px ${FONT}`;
  y += 2;
  wrap(ctx, card.sub || "", LW).slice(0, 3).forEach((l) => { ctx.fillText(l, LX, y); y += 25; });
  y += 18;
  const bars = (card.bars || []).slice(0, 5);
  bars.forEach((b) => {
    ctx.fillStyle = INK; ctx.font = `500 15px ${FONT}`; ctx.fillText(b.label, LX, y);
    ctx.textAlign = "right"; ctx.font = `700 15px ${FONT}`; ctx.fillText(`${Math.round(b.value * 100)}%`, LX + LW, y); ctx.textAlign = "left";
    round(ctx, LX, y + 8, LW, 8, 4); ctx.fillStyle = "#EEEEEA"; ctx.fill();
    round(ctx, LX, y + 8, Math.max(8, LW * Math.min(1, b.value)), 8, 4); ctx.fillStyle = b.color; ctx.fill();
    y += 42;
  });

  // Right: the room
  const RX = 600, RW = 540;
  const people = card.people || [];
  const L = layout(people.length, RW, { seat: people.length > 12 ? 44 : 52 });
  const oy = 120 + Math.max(0, (400 - L.height) / 2);
  ctx.strokeStyle = LINE; ctx.lineWidth = 1.2; ctx.setLineDash([2, 5]);
  L.radii.forEach((r) => { ctx.beginPath(); ctx.arc(RX + L.cx, oy + L.cy, r, Math.PI, 0); ctx.stroke(); });
  ctx.setLineDash([]);
  const R0 = L.radii[0] + L.s / 2 + 2;
  ctx.fillStyle = LINE; ctx.fillRect(RX + L.cx - R0, oy + L.cy + L.s / 2 + 1, R0 * 2, 1.5);
  const faces = await Promise.all(people.map((p) => loadImg(svgUrl(buyerFace(p, p.segIndex ?? 0, L.s * 2, { tint: p.color, dashed: p.dashed })))));
  faces.forEach((img, i) => {
    const s = L.seats[i]; if (!img || !s) return;
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(RX + s.x, oy + s.y, L.s / 2, 0, Math.PI * 2); ctx.fill();
    ctx.drawImage(img, RX + s.x - L.s / 2, oy + s.y - L.s / 2, L.s, L.s);
  });
  if (card.center) {
    ctx.textAlign = "center"; ctx.fillStyle = INK; ctx.font = `700 ${Math.round(Math.min(60, L.inner * 0.5))}px ${FONT}`;
    try { ctx.fontStretch = "condensed"; } catch {}
    ctx.fillText(card.center.big, RX + L.cx, oy + L.cy - 6);
    try { ctx.fontStretch = "normal"; } catch {}
    ctx.fillStyle = MUTED; ctx.font = `500 14px ${FONT}`; ctx.fillText(card.center.sub || "", RX + L.cx, oy + L.cy + 16);
    ctx.textAlign = "left";
  }
  // Legend under the room
  let lx = RX + 20; const ly = oy + L.height + 26;
  (card.legend || []).forEach((g) => {
    ctx.fillStyle = g.color; ctx.beginPath(); ctx.arc(lx + 5, ly - 5, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = MUTED; ctx.font = `500 14px ${FONT}`; const t = `${g.label} ${g.count}`;
    ctx.fillText(t, lx + 16, ly); lx += ctx.measureText(t).width + 36;
  });

  // Footer: the honest part
  ctx.fillStyle = LINE; ctx.fillRect(60, H - 86, W - 120, 1);
  ctx.fillStyle = FAINT; ctx.font = `500 14px ${FONT}`;
  ctx.fillText("Buyers are simulated. Use the result to pick what deserves a real test.", 60, H - 56);
  ctx.textAlign = "right"; ctx.fillText("market-arena-dk.netlify.app", W - 60, H - 56); ctx.textAlign = "left";
  return new Promise((res) => c.toBlob(res, "image/png"));
}

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
