import { useEffect, useRef } from "react";

/**
 * Offline Ludo — fullscreen overlay shown while the browser has no network.
 *
 * The game is the standalone single-file Ludo (board, dice, bots, captures,
 * rules, sounds) mounted imperatively inside this wrapper: the wrapper
 * renders one container div, and on mount the original game script builds
 * its own DOM/styles inside it. Logic is identical to the source file; only
 * the skin is restyled to the Campus Bites palette. On unmount the game's
 * DOM, styles and resident listeners go away.
 *
 * Why imperatively: porting the game to React state would be a rewrite of
 * working logic (async roll/move/bot chains); the overlay is the only place
 * it mounts, so scoped DOM injection keeps the copy 1:1.
 */

const LUDO_STYLES = `
.cbLudo{
  --red:#EF4444;--red-l:#FEE2E2;
  --green:#22C55E;--green-l:#DCFCE7;
  --yellow:#F59E0B;--yellow-l:#FEF3C7;
  --blue:#3B82F6;--blue-l:#DBEAFE;
  --bs:min(92vmin,600px);
  position:fixed;inset:0;z-index:60;overflow:auto;box-sizing:border-box;
  font-family:'Inter','Segoe UI',system-ui,Arial,sans-serif;
  background:radial-gradient(1200px 800px at 20% 0%,#FFEDD5,#FFF7ED 60%,#FFEDD5);
  color:#1C1917;display:flex;flex-direction:column;align-items:center;padding:14px;
}
.cbLudo *{box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
.cbLudo h1{margin:4px 0 6px;font-weight:800;letter-spacing:8px;font-size:clamp(22px,4.5vmin,34px);}
.cbLudo #game{display:flex;gap:20px;flex-wrap:wrap;justify-content:center;align-items:flex-start;}
.cbLudo #boardWrap{position:relative;width:var(--bs);height:var(--bs);background:#fff;border-radius:14px;
  box-shadow:0 14px 40px rgba(28,25,23,.22),0 0 0 6px rgba(249,115,22,.08);overflow:hidden;user-select:none;}
.cbLudo #grid{position:absolute;inset:0;display:grid;grid-template-columns:repeat(15,1fr);grid-template-rows:repeat(15,1fr);}
.cbLudo .cell{border:1px solid rgba(28,25,23,.16);position:relative;}
.cbLudo .cell.track,.cbLudo .cell.centerC{background:#fff;}
.cbLudo .cell.yard.y0{background:var(--red);}
.cbLudo .cell.yard.y1{background:var(--green);}
.cbLudo .cell.yard.y2{background:var(--yellow);}
.cbLudo .cell.yard.y3{background:var(--blue);}
.cbLudo .cell.start.s0{background:var(--red);}
.cbLudo .cell.start.s1{background:var(--green);}
.cbLudo .cell.start.s2{background:var(--yellow);}
.cbLudo .cell.start.s3{background:var(--blue);}
.cbLudo .cell.lane.l0{background:var(--red-l);}
.cbLudo .cell.lane.l1{background:var(--green-l);}
.cbLudo .cell.lane.l2{background:var(--yellow-l);}
.cbLudo .cell.lane.l3{background:var(--blue-l);}
.cbLudo .cell.safe::after{content:'\\2605';position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  font-size:calc(var(--bs)/15*.62);color:#D6D3D1;text-shadow:0 1px 0 #fff;}
.cbLudo .base{position:absolute;background:#fff;border-radius:12px;box-shadow:inset 0 0 0 3px rgba(28,25,23,.07);z-index:2;}
.cbLudo .slot{position:absolute;width:36%;height:36%;transform:translate(-50%,-50%);border-radius:50%;border:3px solid;}
.cbLudo .b0 .slot{background:var(--red-l);border-color:var(--red);}
.cbLudo .b1 .slot{background:var(--green-l);border-color:var(--green);}
.cbLudo .b2 .slot{background:var(--yellow-l);border-color:var(--yellow);}
.cbLudo .b3 .slot{background:var(--blue-l);border-color:var(--blue);}
.cbLudo .centerHome{position:absolute;left:40%;top:40%;width:20%;height:20%;z-index:3;filter:drop-shadow(0 0 2px rgba(28,25,23,.35));}
.cbLudo .tri{position:absolute;inset:0;}
.cbLudo .tri0{background:var(--red);clip-path:polygon(0 0,0 100%,50% 50%);}
.cbLudo .tri1{background:var(--green);clip-path:polygon(0 0,100% 0,50% 50%);}
.cbLudo .tri2{background:var(--yellow);clip-path:polygon(100% 0,100% 100%,50% 50%);}
.cbLudo .tri3{background:var(--blue);clip-path:polygon(0 100%,100% 100%,50% 50%);}
.cbLudo #tokens{position:absolute;inset:0;z-index:6;pointer-events:none;}
.cbLudo .token{position:absolute;width:5.7%;height:5.7%;border-radius:50%;border:2px solid #fff;
  box-shadow:0 3px 6px rgba(28,25,23,.35);pointer-events:auto;transition:left .13s linear,top .13s linear;}
.cbLudo .tk0{background:radial-gradient(circle at 32% 28%,#FCA5A5,#EF4444 55%,#B91C1C);}
.cbLudo .tk1{background:radial-gradient(circle at 32% 28%,#86EFAC,#22C55E 55%,#15803D);}
.cbLudo .tk2{background:radial-gradient(circle at 32% 28%,#FCD34D,#F59E0B 55%,#B45309);}
.cbLudo .tk3{background:radial-gradient(circle at 32% 28%,#93C5FD,#3B82F6 55%,#1D4ED8);}
.cbLudo .token.finished{opacity:.92;}
.cbLudo .token.movable{cursor:pointer;animation:ludoPulse .9s ease-in-out infinite;z-index:9;}
/* The one intentionally global rule: @keyframes cannot be scoped, and this
   name is unique, so there is no collision risk. */
@keyframes ludoPulse{
  0%,100%{box-shadow:0 3px 6px rgba(28,25,23,.35),0 0 0 0 rgba(249,115,22,.75);}
  50%{box-shadow:0 3px 6px rgba(28,25,23,.35),0 0 0 7px rgba(249,115,22,.18);}
}
.cbLudo #panel{width:255px;display:flex;flex-direction:column;gap:12px;}
.cbLudo .cardP{background:#fff;border:1px solid #FFD4A6;border-radius:16px;padding:14px;box-shadow:0 6px 24px -8px rgba(28,25,23,.12);}
.cbLudo #turnBox{display:flex;align-items:center;gap:10px;font-size:18px;font-weight:600;min-height:26px;}
.cbLudo #turnDot{width:16px;height:16px;border-radius:50%;background:#A8A29E;flex:none;}
.cbLudo #diceRow{display:flex;align-items:center;gap:14px;margin-top:10px;}
.cbLudo #dice{width:62px;height:62px;background:#fff;border-radius:12px;display:grid;flex:none;
  grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr);padding:9px;gap:3px;
  cursor:pointer;box-shadow:0 4px 10px rgba(28,25,23,.25);border:1px solid #FFD4A6;}
.cbLudo #dice i{border-radius:50%;}
.cbLudo #dice i.on{background:#1C1917;}
.cbLudo #rollBtn{flex:1;padding:12px 10px;font-size:16px;font-weight:700;border:0;border-radius:12px;cursor:pointer;
  background:linear-gradient(180deg,#F97316,#EA580C);color:#fff;box-shadow:0 4px 10px rgba(234,88,12,.35);}
.cbLudo #rollBtn:disabled{opacity:.45;cursor:default;}
.cbLudo #msg{font-size:13.5px;line-height:1.55;min-height:56px;margin-top:10px;color:#44403C;}
.cbLudo #msg b{color:#EA580C;}
.cbLudo #plist{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px;font-size:13.5px;color:#44403C;}
.cbLudo #plist li{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;background:#FFF7ED;}
.cbLudo #plist li.cur{background:#FFEDD5;outline:1px solid #FDBA74;}
.cbLudo .pdot{width:12px;height:12px;border-radius:50%;flex:none;}
.cbLudo .pstat{margin-left:auto;opacity:.75;font-size:11.5px;white-space:nowrap;}
.cbLudo #btnRow{display:flex;gap:8px;}
.cbLudo .btn{flex:1;padding:9px 6px;border:1px solid #FFD4A6;border-radius:10px;background:#FFF7ED;color:#44403C;
  font-size:13px;cursor:pointer;}
.cbLudo .btn:hover{background:#FFEDD5;}
.cbLudo #overlay{position:fixed;inset:0;background:rgba(28,25,23,.45);backdrop-filter:blur(4px);
  display:flex;align-items:center;justify-content:center;z-index:70;padding:16px;}
.cbLudo .card{background:#fff;border:1px solid #FFD4A6;border-radius:16px;padding:22px 26px;color:#1C1917;
  width:min(430px,94vw);box-shadow:0 20px 60px rgba(28,25,23,.28);}
.cbLudo .card h2{margin:0 0 14px;}
.cbLudo .hidden{display:none!important;}
.cbLudo .seat{display:flex;align-items:center;gap:10px;margin-bottom:10px;background:#FFF7ED;
  padding:9px 12px;border-radius:10px;color:#44403C;}
.cbLudo .seat .pdot{width:14px;height:14px;}
.cbLudo .seat select{margin-left:auto;padding:6px 8px;border-radius:8px;border:1px solid #FDBA74;background:#fff;color:#1C1917;font-size:14px;}
.cbLudo #setupMsg{color:#DC2626;font-size:13px;min-height:18px;margin:4px 0 8px;}
.cbLudo .primary{width:100%;padding:12px;font-size:16px;font-weight:700;border:0;border-radius:12px;cursor:pointer;
  background:linear-gradient(180deg,#F97316,#EA580C);color:#fff;}
.cbLudo #winCard{text-align:center;}
.cbLudo #winTrophy{font-size:54px;}
.cbLudo #winName{font-size:24px;font-weight:800;margin:8px 0 16px;}
.cbLudo #rulesCard ul{padding-left:18px;line-height:1.65;font-size:14px;margin:8px 0 16px;color:#44403C;}
.cbLudo #rulesCard kbd{border:1px solid #FDBA74;border-radius:4px;padding:0 4px;background:#FFF7ED;}
.cbLudo .cbLudoNote{text-align:center;margin-bottom:10px;}
.cbLudo .cbLudoNote b{display:block;font-size:clamp(15px,2.6vmin,20px);font-weight:700;color:#1C1917;}
.cbLudo .cbLudoNote span{font-size:13px;color:#78716C;}
@media (max-width:700px){.cbLudo #panel{width:min(92vmin,600px);}}
`;

const LUDO_MARKUP = `
<div class="cbLudoNote">
  <b>You're offline — play Ludo while you wait!</b>
  <span>Waiting for the network…</span>
</div>
<h1><span style="color:var(--red)">L</span><span style="color:var(--green)">U</span><span style="color:var(--yellow)">D</span><span style="color:var(--blue)">O</span></h1>
<div id="game">
  <div id="boardWrap"><div id="grid"></div></div>
  <aside id="panel">
    <div class="cardP">
      <div id="turnBox"><span id="turnDot"></span><span id="turnName">&mdash;</span></div>
      <div id="diceRow">
        <div id="dice" title="Click to roll"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
        <button id="rollBtn" data-testid="ludo-roll">Roll</button>
      </div>
      <div id="msg" data-testid="ludo-msg">Configure the game to begin.</div>
    </div>
    <div class="cardP"><ul id="plist"></ul></div>
    <div class="cardP" id="btnRow">
      <button class="btn" id="newBtn">New game</button>
      <button class="btn" id="rulesBtn">Rules</button>
      <button class="btn" id="soundBtn">&#128266;</button>
    </div>
  </aside>
</div>
<div id="overlay">
  <div class="card" id="setupCard">
    <h2>&#127922; New Ludo Game</h2>
    <div class="seat"><span class="pdot" style="background:var(--red)"></span>Red <select id="seat0"><option value="human" selected>Human</option><option value="bot">Bot</option><option value="off">Off</option></select></div>
    <div class="seat"><span class="pdot" style="background:var(--green)"></span>Green <select id="seat1"><option value="human">Human</option><option value="bot" selected>Bot</option><option value="off">Off</option></select></div>
    <div class="seat"><span class="pdot" style="background:var(--yellow)"></span>Yellow <select id="seat2"><option value="human">Human</option><option value="bot" selected>Bot</option><option value="off">Off</option></select></div>
    <div class="seat"><span class="pdot" style="background:var(--blue)"></span>Blue <select id="seat3"><option value="human">Human</option><option value="bot" selected>Bot</option><option value="off">Off</option></select></div>
    <div id="setupMsg"></div>
    <button class="primary" id="startBtn">Start game</button>
  </div>
  <div class="card hidden" id="winCard">
    <div id="winTrophy">&#127942;</div>
    <div id="winName"></div>
    <button class="primary" id="againBtn">Play again</button>
  </div>
  <div class="card hidden" id="rulesCard">
    <h2>Rules</h2>
    <ul>
      <li>Roll a <b>6</b> to move a token out of your yard.</li>
      <li>Tokens travel clockwise. Land on a lone opponent token to send it back to its yard &mdash; except on <b>&#9733;</b> stars and colored start cells.</li>
      <li>A <b>6</b>, a capture, or getting a token home grants an extra roll. Three 6s in a row forfeit the turn.</li>
      <li>You need an exact roll to reach the center home.</li>
      <li>First player to bring all <b>4</b> tokens home wins.</li>
      <li>Tip: press <kbd>Space</kbd> or <kbd>R</kbd> to roll.</li>
    </ul>
    <button class="primary" id="closeRulesBtn">Close</button>
  </div>
</div>`;

export default function OfflineLudo() {
  const rootRef = useRef(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    root.innerHTML = LUDO_MARKUP;
    const styleEl = document.createElement("style");
    styleEl.dataset.ludoStyles = "true";
    styleEl.textContent = LUDO_STYLES;
    document.head.appendChild(styleEl);

    // The page can unmount this component at any moment (the connection
    // returning). Every async continuation checks the flag before moving.
    let disposed = false;

    /* ================= constants ================= */
    const COLORS = ["red", "green", "yellow", "blue"];
    const NAMES = ["Red", "Green", "Yellow", "Blue"];
    const HEX = ["#EF4444", "#22C55E", "#F59E0B", "#3B82F6"];

    /* 52-cell clockwise track, index 0 = Red start */
    const TRACK = [[6,1],[6,2],[6,3],[6,4],[6,5],[5,6],[4,6],[3,6],[2,6],[1,6],[0,6],[0,7],[0,8],
      [1,8],[2,8],[3,8],[4,8],[5,8],[6,9],[6,10],[6,11],[6,12],[6,13],[6,14],[7,14],[8,14],
      [8,13],[8,12],[8,11],[8,10],[8,9],[9,8],[10,8],[11,8],[12,8],[13,8],[14,8],[14,7],[14,6],
      [13,6],[12,6],[11,6],[10,6],[9,6],[8,5],[8,4],[8,3],[8,2],[8,1],[8,0],[7,0],[6,0]];
    const START = [0, 13, 26, 39];
    const LANES = [
      [[7,1],[7,2],[7,3],[7,4],[7,5]],
      [[1,7],[2,7],[3,7],[4,7],[5,7]],
      [[7,13],[7,12],[7,11],[7,10],[7,9]],
      [[13,7],[12,7],[11,7],[10,7],[9,7]]
    ];
    const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
    const BASE_SIZE = 34.4, BASE_POS = [[2.8,2.8],[2.8,62.8],[62.8,62.8],[62.8,2.8]];
    const SLOT_F = [[.3,.3],[.3,.7],[.7,.3],[.7,.7]];
    const FINISH = [t=>[41.3+t*2.5,50],t=>[50,41.3+t*2.5],t=>[58.7-t*2.5,50],t=>[50,58.7-t*2.5]];
    const FACES = {1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};

    /* ================= dom / state ================= */
    const byId = (id) => root.querySelector("#" + id);
    const gridEl = byId("grid");
    const boardWrap = byId("boardWrap");
    const diceEl = byId("dice");
    const rollBtn = byId("rollBtn");
    const msgEl = byId("msg");
    const turnDot = byId("turnDot");
    const turnName = byId("turnName");
    const plist = byId("plist");
    const overlay = byId("overlay");
    const setupCard = byId("setupCard");
    const winCard = byId("winCard");
    const rulesCard = byId("rulesCard");
    const winName = byId("winName");
    const setupMsg = byId("setupMsg");
    let tokenLayer = null;

    const state = {players:[],turn:0,dice:6,sixChain:0,phase:"setup",busy:false,gen:0,legal:[],paused:false,muted:false};
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const cur = () => state.players[state.turn];

    /* ================= sound ================= */
    let AC = null;
    function beep(freq, dur, type, gain) {
      if (state.muted || disposed) return;
      try {
        AC = AC || new (window.AudioContext || window.webkitAudioContext)();
        if (AC.state === "suspended") AC.resume();
        const o = AC.createOscillator(), g = AC.createGain();
        o.type = type || "sine"; o.frequency.value = freq;
        g.gain.setValueAtTime(gain || .05, AC.currentTime);
        g.gain.exponentialRampToValueAtTime(.0001, AC.currentTime + (dur || .1));
        o.connect(g); g.connect(AC.destination); o.start(); o.stop(AC.currentTime + (dur || .1) + .03);
      } catch (e) { /* audio unavailable — the game works silently */ }
    }
    function chord(big) {
      [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, big ? .28 : .18, "triangle", .06), i * 110));
    }

    /* ================= board build ================= */
    const trackMap = new Map();
    TRACK.forEach(([r, c], i) => trackMap.set(r * 15 + c, i));
    const laneMap = new Map();
    LANES.forEach((lane, ci) => lane.forEach(([r, c]) => laneMap.set(r * 15 + c, ci)));

    (function buildBoard() {
      if (disposed) return;
      for (let r = 0; r < 15; r++) for (let c = 0; c < 15; c++) {
        const d = document.createElement("div"); d.className = "cell";
        const k = r * 15 + c;
        if (r < 6 && c < 6) d.classList.add("yard", "y0");
        else if (r < 6 && c > 8) d.classList.add("yard", "y1");
        else if (r > 8 && c > 8) d.classList.add("yard", "y2");
        else if (r > 8 && c < 6) d.classList.add("yard", "y3");
        else if (trackMap.has(k)) {
          d.classList.add("track");
          const ti = trackMap.get(k), si = START.indexOf(ti);
          if (si >= 0) d.classList.add("start", "s" + si);
          else if (SAFE.has(ti)) d.classList.add("safe");
        } else if (laneMap.has(k)) d.classList.add("lane", "l" + laneMap.get(k));
        else d.classList.add("centerC");
        gridEl.appendChild(d);
      }
      for (let ci = 0; ci < 4; ci++) {
        const b = document.createElement("div"); b.className = "base b" + ci;
        b.style.top = BASE_POS[ci][0] + "%"; b.style.left = BASE_POS[ci][1] + "%";
        b.style.width = BASE_SIZE + "%"; b.style.height = BASE_SIZE + "%";
        SLOT_F.forEach(f => {
          const s = document.createElement("div"); s.className = "slot";
          s.style.top = (f[0] * 100) + "%"; s.style.left = (f[1] * 100) + "%"; b.appendChild(s);
        });
        boardWrap.appendChild(b);
      }
      const ctr = document.createElement("div"); ctr.className = "centerHome";
      for (let i = 0; i < 4; i++) { const t = document.createElement("div"); t.className = "tri tri" + i; ctr.appendChild(t); }
      boardWrap.appendChild(ctr);
      tokenLayer = document.createElement("div"); tokenLayer.id = "tokens";
      boardWrap.appendChild(tokenLayer);
    })();

    /* ================= dice ================= */
    function setDice(n) {
      const on = FACES[n] || [];
      [...diceEl.children].forEach((p, i) => p.classList.toggle("on", on.includes(i)));
    }
    function animateRoll(cb) {
      let n = 0;
      const iv = setInterval(() => {
        if (disposed) { clearInterval(iv); return; }
        setDice(1 + Math.floor(Math.random() * 6));
        beep(300 + n * 14, .03, "square", .02);
        if (++n >= 7) { clearInterval(iv); const f = 1 + Math.floor(Math.random() * 6); setDice(f); cb(f); }
      }, 75);
    }

    /* ================= ui helpers ================= */
    function log(html) { msgEl.innerHTML = html; }
    function updatePanel() {
      if (!state.players.length) {
        turnDot.style.background = "#A8A29E"; turnName.textContent = "\u2014";
        rollBtn.disabled = true; setDice(6); plist.innerHTML = ""; return;
      }
      const P = cur();
      turnDot.style.background = HEX[P.colorIdx];
      turnName.textContent = P.name + (P.bot ? " \u{1F916}" : " \u{1F3AE}");
      rollBtn.disabled = !(state.phase === "roll" && !state.busy && !P.bot && !state.paused);
      setDice(state.dice || 6);
      plist.innerHTML = "";
      state.players.forEach((Q, i) => {
        const li = document.createElement("li");
        if (i === state.turn && state.phase !== "over") li.classList.add("cur");
        const home = Q.tokens.filter(t => t === 56).length;
        const yard = Q.tokens.filter(t => t === -1).length;
        li.innerHTML = '<span class="pdot" style="background:' + HEX[Q.colorIdx] + '"></span><span>' + Q.name +
          (Q.bot ? " <small>bot</small>" : "") + '</span><span class="pstat">' + yard + " yard \u00B7 " +
          (4 - yard - home) + " out \u00B7 " + home + " home</span>";
        plist.appendChild(li);
      });
    }
    function createTokens() {
      tokenLayer.innerHTML = "";
      state.players.forEach((P, pi) => {
        P.els = [];
        for (let t = 0; t < 4; t++) {
          const e = document.createElement("div");
          e.className = "token tk" + P.colorIdx;
          e.dataset.p = pi; e.dataset.t = t;
          e.addEventListener("pointerdown", onTokenClick);
          tokenLayer.appendChild(e); P.els.push(e);
        }
      });
      render();
    }
    function render() {
      if (!state.players.length) return;
      const placements = [];
      state.players.forEach((P, pi) => {
        P.tokens.forEach((pos, ti) => {
          let x, y, sc = 1, fin = false;
          if (pos === -1) { y = BASE_POS[pi][0] + BASE_SIZE * SLOT_F[ti][0]; x = BASE_POS[pi][1] + BASE_SIZE * SLOT_F[ti][1]; }
          else if (pos === 56) { const f = FINISH[pi](ti); x = f[0]; y = f[1]; sc = .5; fin = true; }
          else if (pos <= 50) { const rc = TRACK[(START[pi] + pos) % 52]; y = (rc[0] + .5) / 15 * 100; x = (rc[1] + .5) / 15 * 100; }
          else { const rc = LANES[pi][pos - 51]; y = (rc[0] + .5) / 15 * 100; x = (rc[1] + .5) / 15 * 100; }
          placements.push({ pi, ti, x, y, sc, fin });
        });
      });
      const groups = new Map();
      placements.forEach(p => {
        const k = p.x.toFixed(1) + "," + p.y.toFixed(1);
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(p);
      });
      groups.forEach(g => {
        if (g.length > 1) {
          const off = [[-1.2,-1.2],[1.2,-1.2],[-1.2,1.2],[1.2,1.2]];
          g.forEach((p, i) => { p.dx = off[Math.min(i, 3)][0]; p.dy = off[Math.min(i, 3)][1]; p.sc = Math.min(p.sc, .68); });
        } else { g[0].dx = 0; g[0].dy = 0; }
      });
      placements.forEach(p => {
        const el = state.players[p.pi].els[p.ti];
        el.style.left = (p.x + p.dx) + "%"; el.style.top = (p.y + p.dy) + "%";
        el.style.transform = "translate(-50%,-50%) scale(" + p.sc + ")";
        el.classList.toggle("finished", p.fin);
      });
    }
    function highlight(moves) {
      clearMovable();
      moves.forEach(m => state.players[state.turn].els[m.i].classList.add("movable"));
    }
    function clearMovable() {
      state.players.forEach(P => { if (P.els) P.els.forEach(e => e.classList.remove("movable")); });
    }
    function onTokenClick(ev) {
      if (state.phase !== "move" || state.busy || state.paused) return;
      const e = ev.currentTarget;
      const pi = +e.dataset.p;
      if (pi !== state.turn || cur().bot) return;
      const t = +e.dataset.t;
      const m = state.legal.find(mv => mv.i === t);
      if (m) performMove(m);
    }
    function showOverlay(which) {
      [setupCard, winCard, rulesCard].forEach(c => c.classList.add("hidden"));
      if (which === "setup") setupCard.classList.remove("hidden");
      if (which === "win") winCard.classList.remove("hidden");
      if (which === "rules") rulesCard.classList.remove("hidden");
      overlay.classList.toggle("hidden", !which);
    }

    /* ================= game logic ================= */
    function legalMoves(pi, roll) {
      const out = [];
      state.players[pi].tokens.forEach((pos, i) => {
        if (pos === -1) { if (roll === 6) out.push({ i, from: -1, to: 0, enter: true }); }
        else if (pos < 56 && pos + roll <= 56) out.push({ i, from: pos, to: pos + roll });
      });
      return out;
    }
    function botChoose(pi, roll, moves) {
      let best = moves[0], bs = -1e9;
      for (const m of moves) {
        let s = Math.random() * 5;
        const landGi = (m.to <= 50) ? (START[pi] + m.to) % 52 : null;
        if (m.to === 56) s += 120;
        if (m.enter) s += 55;
        if (landGi !== null && !SAFE.has(landGi)) {
          state.players.forEach((Q, qi) => {
            if (qi === pi) return;
            Q.tokens.forEach(tp => { if (tp >= 0 && tp <= 50 && (START[qi] + tp) % 52 === landGi) s += 75 + tp * .5; });
          });
        }
        if (m.from >= 0 && m.from < 51 && m.to >= 51) s += 45;
        if (m.to >= 51) s += 20 + m.to * .4;
        if (landGi !== null && SAFE.has(landGi)) s += 18;
        if (landGi !== null && !SAFE.has(landGi)) {
          state.players.forEach((Q, qi) => {
            if (qi === pi) return;
            Q.tokens.forEach(tp => {
              if (tp >= 0 && tp <= 50) {
                const og = (START[qi] + tp) % 52, d = (landGi - og + 52) % 52;
                if (d >= 1 && d <= 6) s -= 10;
              }
            });
          });
        }
        if (m.from >= 0) s += m.from * .35;
        if (s > bs) { bs = s; best = m; }
      }
      return best;
    }
    function startGame() {
      const modes = [0, 1, 2, 3].map(i => byId("seat" + i).value);
      const active = modes.map((m, i) => ({ m, i })).filter(o => o.m !== "off");
      if (active.length < 2) { setupMsg.textContent = "At least two players must play."; return; }
      setupMsg.textContent = "";
      state.gen++;
      state.players = active.map(o => ({ name: NAMES[o.i], colorIdx: o.i, bot: o.m === "bot", tokens: [-1, -1, -1, -1], els: [] }));
      state.turn = 0; state.dice = 6; state.sixChain = 0; state.phase = "roll"; state.busy = false; state.legal = []; state.paused = false;
      createTokens();
      showOverlay(null);
      updatePanel();
      log("<b>" + cur().name + "</b> starts \u2014 roll the dice!");
      if (cur().bot) botTurn();
    }
    function doRoll() {
      if (disposed || state.phase !== "roll" || state.busy || state.paused) return;
      const g = state.gen, P = cur();
      state.busy = true; state.phase = "anim"; updatePanel();
      animateRoll(f => {
        if (disposed || g !== state.gen) return;
        state.dice = f; beep(560, .1, "triangle", .05);
        log("<b>" + P.name + "</b> rolled <b>" + f + "</b>.");
        if (f === 6) state.sixChain++; else state.sixChain = 0;
        if (f === 6 && state.sixChain >= 3) {
          log("<b>" + P.name + "</b> rolled three 6s \u2014 turn forfeited!");
          state.busy = false;
          setTimeout(() => { if (!disposed && g === state.gen) endTurn(); }, 900);
          return;
        }
        const moves = legalMoves(state.turn, f);
        if (!moves.length) {
          log("<b>" + P.name + "</b> rolled " + f + " \u2014 no possible move.");
          state.busy = false;
          if (f === 6) { state.phase = "roll"; updatePanel(); if (P.bot) botTurn(); }
          else setTimeout(() => { if (!disposed && g === state.gen) endTurn(); }, 900);
          return;
        }
        state.busy = false; state.phase = "move"; state.legal = moves; updatePanel();
        if (P.bot) {
          setTimeout(() => { if (!disposed && g === state.gen && state.phase === "move") performMove(botChoose(state.turn, f, moves)); }, 550);
        } else {
          highlight(moves);
          log("Rolled <b>" + f + "</b> \u2014 click a glowing token to move.");
        }
      });
    }
    async function performMove(m) {
      if (state.phase !== "move" || disposed) return;
      const g = state.gen;
      state.phase = "anim"; state.busy = true; state.legal = [];
      clearMovable(); updatePanel();
      const pi = state.turn, P = state.players[pi];
      if (m.enter) {
        P.tokens[m.i] = 0; beep(720, .09); render(); await sleep(200);
      } else {
        for (let s = m.from + 1; s <= m.to; s++) {
          if (disposed || g !== state.gen) return;
          P.tokens[m.i] = s;
          beep(470 + s * 9, .04, "square", .025);
          render(); await sleep(125);
        }
      }
      if (disposed || g !== state.gen) return;
      const to = P.tokens[m.i];
      let captured = false; const victims = [];
      if (to >= 0 && to <= 50) {
        const gi = (START[pi] + to) % 52;
        if (!SAFE.has(gi)) {
          state.players.forEach((Q, qi) => {
            if (qi === pi) return;
            Q.tokens.forEach((tp, ti) => {
              if (tp >= 0 && tp <= 50 && (START[qi] + tp) % 52 === gi) { Q.tokens[ti] = -1; captured = true; victims.push(Q.name); }
            });
          });
        }
      }
      if (captured) { beep(180, .3, "sawtooth", .06); log("\u2694\uFE0F <b style=\"color:" + HEX[pi] + "\">" + P.name + "</b> captured " + victims.join(" & ") + "!"); }
      if (to === 56) { chord(); log("\uD83C\uDFC1 <b style=\"color:" + HEX[pi] + "\">" + P.name + "</b> brought a token home!"); }
      render();
      if (P.tokens.every(t => t === 56)) { state.busy = false; gameOver(pi); return; }
      const extra = (state.dice === 6 && state.sixChain < 3) || captured || to === 56;
      state.busy = false;
      if (extra) {
        state.phase = "roll"; updatePanel();
        if (!P.bot) log("\u2728 <b>" + P.name + "</b> rolls again!");
        else botTurn();
      } else endTurn();
    }
    function endTurn() {
      state.sixChain = 0; state.legal = [];
      state.turn = (state.turn + 1) % state.players.length;
      state.phase = "roll";
      updatePanel();
      const P = cur();
      log("<b style=\"color:" + HEX[P.colorIdx] + "\">" + P.name + "</b>\u2019s turn.");
      if (P.bot) botTurn();
    }
    function botTurn() {
      const g = state.gen;
      setTimeout(function tick() {
        if (disposed || g !== state.gen) return;
        if (state.paused) { setTimeout(tick, 300); return; }
        if (state.phase === "roll" && state.players[state.turn] && state.players[state.turn].bot) doRoll();
      }, 650);
    }
    function gameOver(pi) {
      state.phase = "over"; updatePanel();
      chord(true);
      log("\uD83C\uDFC6 <b style=\"color:" + HEX[state.players[pi].colorIdx] + "\">" + state.players[pi].name + "</b> wins the game!");
      winName.innerHTML = '<span style="color:' + HEX[state.players[pi].colorIdx] + '">' + state.players[pi].name + "</span> wins!";
      setTimeout(() => { if (!disposed && state.phase === "over") showOverlay("win"); }, 1000);
    }

    /* ================= events ================= */
    rollBtn.addEventListener("click", doRoll);
    diceEl.addEventListener("click", doRoll);
    byId("startBtn").addEventListener("click", startGame);
    byId("againBtn").addEventListener("click", () => {
      state.gen++; tokenLayer.innerHTML = ""; state.players = []; state.phase = "setup";
      updatePanel(); showOverlay("setup");
    });
    byId("newBtn").addEventListener("click", () => {
      state.gen++; tokenLayer.innerHTML = ""; state.players = []; state.phase = "setup"; state.paused = false;
      updatePanel(); showOverlay("setup");
    });
    byId("rulesBtn").addEventListener("click", () => { state.paused = true; showOverlay("rules"); });
    byId("closeRulesBtn").addEventListener("click", () => {
      state.paused = false;
      showOverlay(state.players.length ? null : "setup");
    });
    byId("soundBtn").addEventListener("click", (e) => {
      state.muted = !state.muted;
      e.currentTarget.textContent = state.muted ? "\uD83D\uDD07" : "\uD83D\uDD0A";
    });
    const onKey = (e) => {
      if (e.code === "Space" || e.key === "r" || e.key === "R") { e.preventDefault(); doRoll(); }
    };
    document.addEventListener("keydown", onKey);

    /* ================= init ================= */
    setDice(6);
    updatePanel();
    showOverlay("setup");

    return () => {
      disposed = true;
      document.removeEventListener("keydown", onKey);
      styleEl.remove();
      if (AC) AC.close().catch(() => {});
      root.innerHTML = "";
    };
  }, []);

  return <div id="ludoRoot" data-testid="offline-ludo" className="cbLudo" ref={rootRef} />;
}
