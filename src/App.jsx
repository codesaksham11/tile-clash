import { useState, useEffect, useCallback } from "react";

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

const TILE_BASE_HP = 110;
const GRID_SIZE = 5;

const PERKS = ["attack", "defend", "heal", "steal"];
const PERK_RARITY = { attack: 40, defend: 40, heal: 15, steal: 5 };

const WEAPONS = [
  { id: "fireball",    label: "🔥 Fireball",    type: "a" },
  { id: "cannon",      label: "💣 Cannon",       type: "a" },
  { id: "missile",     label: "🚀 Missile",      type: "a" },
  { id: "shield",      label: "🛡️ Shield",       type: "d" },
  { id: "antimissile", label: "🔰 Anti-Missile", type: "d" },
  { id: "steel",       label: "⚙️ Steel",        type: "d" },
  { id: "expand",      label: "🌱 Expand",       type: "d" },
  { id: "regenerate",  label: "💚 Regenerate",   type: "h" },
  { id: "quickheal",   label: "⚡ Quick Heal",   type: "h" },
];

function rollPerk() {
  const r = Math.random() * 100;
  let cum = 0;
  for (const p of PERKS) { cum += PERK_RARITY[p]; if (r < cum) return p; }
  return "attack";
}

function pickTwo() {
  const perks = [];
  while (perks.length < 2) {
    const p = rollPerk();
    if (!perks.includes(p)) perks.push(p);
  }
  return perks;
}

function randomThreeWeapons(exclude = []) {
  const pool = WEAPONS.filter(w => !exclude.includes(w.id));
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 3);
}

function initGrid() {
  return Array.from({ length: GRID_SIZE }, (_, r) =>
    Array.from({ length: GRID_SIZE }, (_, c) => ({
      id: `${r}-${c}`, row: r, col: c,
      hp: TILE_BASE_HP, maxHp: TILE_BASE_HP,
      shield: 0, antimissile: false, steel: false, steelUsed: false,
      destroyed: false,
    }))
  );
}

// ─── DAMAGE CALCULATIONS ─────────────────────────────────────────────────────

function applyDamageToTile(tile, rawDmg) {
  if (tile.destroyed) return tile;
  let t = { ...tile };
  let dmg = rawDmg;

  // steel: first hit reduction
  if (t.steel && !t.steelUsed) {
    // will be handled by caller setting steelUsed
  }

  if (t.shield > 0) {
    if (dmg <= t.shield) { t.shield -= dmg; dmg = 0; }
    else {
      const leftover = dmg - t.shield;
      t.shield = 0;
      dmg = Math.floor(leftover / 2);
    }
  }
  t.hp = Math.max(0, t.hp - dmg);
  if (t.hp === 0) t.destroyed = true;
  return t;
}

function steelReduction(tile, perk, level) {
  if (!tile.steel || tile.steelUsed) return 1.0;
  if (level === 2 && perk === "defend") return 0.20;
  if (level === 2) return 0.40;
  if (perk === "defend") return 0.30;
  return 0.50;
}

function getNeighbors(grid, row, col) {
  const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
  return dirs.map(([dr,dc]) => {
    const r = row+dr, c = col+dc;
    return (r>=0&&r<GRID_SIZE&&c>=0&&c<GRID_SIZE) ? grid[r][c] : null;
  }).filter(Boolean);
}

function applyWeapon(grid, weaponId, level, perk, target, extra) {
  let g = grid.map(row => row.map(t => ({ ...t })));
  const { row, col } = target;
  const tile = g[row][col];

  // helper: apply with steel check
  function hitTile(r, c, dmg, isMain = false) {
    const t = g[r][c];
    if (!t || t.destroyed) return;
    let d = dmg;
    const reduction = steelReduction(t, perk, level);
    if (t.steel && !t.steelUsed) {
      d = Math.round(d * reduction);
      g[r][c] = { ...g[r][c], steelUsed: true };
    }
    g[r][c] = applyDamageToTile(g[r][c], d);
  }

  if (weaponId === "fireball") {
    let main, side;
    if (level === 2 && perk === "attack") { main = 80; side = 50; }
    else if (perk === "attack") { main = 60; side = 40; }
    else if (level === 2) { main = 50; side = 35; }
    else { main = 40; side = 20; }
    hitTile(row, col, main, true);
    getNeighbors(grid, row, col).forEach(n => hitTile(n.row, n.col, side));
  }

  else if (weaponId === "cannon") {
    let main;
    if (level === 2 && perk === "attack") { main = 100; }
    else if (perk === "attack") { main = 80; }
    else if (level === 2) { main = 75; }
    else { main = 60; }
    hitTile(row, col, main, true);
    if (level === 2 && perk === "attack") {
      // also hit strongest neighbor
      const neighbors = getNeighbors(grid, row, col).filter(n => !n.destroyed);
      if (neighbors.length) {
        const strongest = neighbors.reduce((a, b) => a.hp > b.hp ? a : b);
        hitTile(strongest.row, strongest.col, 60);
      }
    }
  }

  else if (weaponId === "missile") {
    let dmg;
    if (level === 2 && perk === "attack") dmg = 50;
    else if (perk === "attack") dmg = 45;
    else if (level === 2) dmg = 35;
    else dmg = 25;
    const direction = extra?.direction || "row";
    for (let i = 0; i < GRID_SIZE; i++) {
      const r = direction === "row" ? row : i;
      const c = direction === "row" ? i : col;
      const t = g[r][c];
      if (t && !t.destroyed) {
        let d = dmg;
        if (t.antimissile) d = Math.round(d * (level === 2 && perk === "defend" ? 0.25 : level === 2 ? 0.20 : perk === "defend" ? 0.30 : 0.40));
        hitTile(r, c, d);
      }
    }
  }

  else if (weaponId === "rocket") {
    let side;
    if (level === 2 && perk === "attack") side = 45;
    else if (perk === "attack") side = 25;
    else if (level === 2) side = 20;
    else side = 0;
    g[row][col] = { ...g[row][col], hp: 0, shield: 0, destroyed: true };
    if (side > 0) getNeighbors(grid, row, col).forEach(n => hitTile(n.row, n.col, side));
  }

  return g;
}

function applyDefense(grid, weaponId, level, perk, target, extra) {
  let g = grid.map(row => row.map(t => ({ ...t })));
  const { row, col } = target;

  if (weaponId === "shield") {
    let amt;
    if (level === 2 && perk === "defend") amt = 95;
    else if (perk === "defend") amt = 80;
    else if (level === 2) amt = 80;
    else amt = 70;
    g[row][col] = { ...g[row][col], shield: (g[row][col].shield || 0) + amt };
  }

  else if (weaponId === "antimissile") {
    if (perk === "defend") {
      const direction = extra?.direction || "row";
      for (let i = 0; i < GRID_SIZE; i++) {
        const r = direction === "row" ? row : i;
        const c = direction === "row" ? i : col;
        g[r][c] = { ...g[r][c], antimissile: true };
      }
    } else {
      g[row][col] = { ...g[row][col], antimissile: true };
    }
  }

  else if (weaponId === "steel") {
    g[row][col] = { ...g[row][col], steel: true, steelUsed: false };
  }

  else if (weaponId === "expand") {
    let hp;
    if (level === 2 && perk === "defend") hp = 135;
    else if (perk === "defend") hp = 125;
    else if (level === 2) hp = 120;
    else hp = 110;
    if (g[row][col].destroyed) {
      g[row][col] = { ...g[row][col], hp, maxHp: hp, destroyed: false, shield: 0, steel: false, steelUsed: false, antimissile: false };
    }
  }

  return g;
}

function applyHeal(grid, weaponId, level, perk, target) {
  let g = grid.map(row => row.map(t => ({ ...t })));
  const { row, col } = target;
  const t = g[row][col];
  if (t.destroyed) return g;

  const cap = (tile, amt) => {
    const newHp = Math.min(tile.maxHp, tile.hp + amt);
    return { ...tile, hp: newHp };
  };

  if (weaponId === "regenerate") {
    let main, side;
    if (level === 2 && perk === "heal") { main = 85; side = 25; }
    else if (perk === "heal") { main = 85; side = 20; }
    else if (level === 2) { main = 85; side = 15; }
    else { main = 85; side = 10; }
    g[row][col] = cap(g[row][col], main);
    getNeighbors(grid, row, col).forEach(n => { if (!n.destroyed) g[n.row][n.col] = cap(g[n.row][n.col], side); });
  }

  else if (weaponId === "aroma") {
    let amt;
    if (level === 2 && perk === "heal") amt = 120;
    else if (perk === "heal") amt = 110;
    else if (level === 2) amt = 100;
    else amt = 90;
    g[row][col] = cap(g[row][col], amt);
    getNeighbors(grid, row, col).forEach(n => { if (!n.destroyed) g[n.row][n.col] = cap(g[n.row][n.col], amt); });
  }

  else if (weaponId === "quickheal") {
    let side;
    if (level === 2 && perk === "heal") side = 50;
    else if (perk === "heal") side = 35;
    else if (level === 2) side = 25;
    else side = 0;
    g[row][col] = { ...g[row][col], hp: g[row][col].maxHp };
    if (side > 0) getNeighbors(grid, row, col).forEach(n => { if (!n.destroyed) g[n.row][n.col] = cap(g[n.row][n.col], side); });
  }

  return g;
}

// ─── WEAPON INFO HELPER ───────────────────────────────────────────────────────

function getWeaponInfo(id) { return WEAPONS.find(w => w.id === id); }

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function App() {
  const [phase, setPhase] = useState("intro"); // intro | perk-select | weapon-select | steal | battle | gameover
  const [currentPlayer, setCurrentPlayer] = useState(0);
  const [players, setPlayers] = useState([
    { name: "Player 1", perk: null, perkChoices: [], weapons: {}, grid: initGrid() },
    { name: "Player 2", perk: null, perkChoices: [], weapons: {}, grid: initGrid() },
  ]);
  const [weaponRound, setWeaponRound] = useState(0);
  const [weaponChoices, setWeaponChoices] = useState([]);
  const [log, setLog] = useState([]);
  const [battleTurn, setBattleTurn] = useState(0); // 0 or 1
  const [selectedWeapon, setSelectedWeapon] = useState(null);
  const [pendingAction, setPendingAction] = useState(null); // { weaponId, step }
  const [winner, setWinner] = useState(null);
  const [perkOptions, setPerkOptions] = useState([]);

  // ─── PHASE: INTRO → show perk for player ───────────────────────────────────

  function startGame() {
    const options = pickTwo();
    setPerkOptions(options);
    setCurrentPlayer(0);
    setPhase("perk-select");
  }

  function selectPerk(playerIdx, perk) {
    setPlayers(prev => {
      const p = [...prev];
      p[playerIdx] = { ...p[playerIdx], perk };
      return p;
    });
    // next player or move to weapon select for player 0
    if (playerIdx === 0) {
      const options = pickTwo();
      setPerkOptions(options);
      setCurrentPlayer(1);
    } else {
      setCurrentPlayer(0);
      setWeaponRound(0);
      const choices = randomThreeWeapons();
      setWeaponChoices(choices);
      setPhase("weapon-select");
    }
  }

  function selectWeapon(playerIdx, weaponId) {
    setPlayers(prev => {
      const p = [...prev];
      const existing = p[playerIdx].weapons[weaponId];
      const weapons = { ...p[playerIdx].weapons };
      if (existing) weapons[weaponId] = Math.min(2, existing + 1);
      else weapons[weaponId] = 1;
      p[playerIdx] = { ...p[playerIdx], weapons };
      return p;
    });

    const nextRound = weaponRound + 1;
    if (nextRound < 5) {
      setWeaponRound(nextRound);
      // exclude weapons already at level 2
      const currentWeapons = players[playerIdx].weapons;
      const maxed = Object.keys(currentWeapons).filter(k => currentWeapons[k] >= 2);
      const choices = randomThreeWeapons(maxed);
      setWeaponChoices(choices);
    } else {
      // this player done
      if (playerIdx === 0) {
        setCurrentPlayer(1);
        setWeaponRound(0);
        const choices = randomThreeWeapons();
        setWeaponChoices(choices);
      } else {
        // both done — check steal
        const p0 = players[0];
        if (p0.perk === "steal") {
          setPhase("steal");
        } else {
          setPhase("battle");
          setBattleTurn(0);
        }
      }
    }
  }

  function performSteal(weaponId) {
    // swap player 0's weapon with player 1's same-level weapon
    setPlayers(prev => {
      const p = [...prev];
      const p0 = { ...p[0], weapons: { ...p[0].weapons } };
      const p1 = { ...p[1], weapons: { ...p[1].weapons } };
      const level = p1.weapons[weaponId];
      if (!level) return prev;
      // find a weapon of player 0 at same level to swap
      const swapId = Object.keys(p0.weapons).find(k => p0.weapons[k] === level);
      if (swapId) {
        p0.weapons[weaponId] = level;
        delete p0.weapons[swapId];
        p1.weapons[swapId] = level;
        delete p1.weapons[weaponId];
      } else {
        // just add it
        p0.weapons[weaponId] = level;
        delete p1.weapons[weaponId];
      }
      p[0] = p0; p[1] = p1;
      return p;
    });
    setPhase("battle");
    setBattleTurn(0);
  }

  // ─── BATTLE ────────────────────────────────────────────────────────────────

  function addLog(msg) {
    setLog(prev => [msg, ...prev].slice(0, 30));
  }

  function checkWinner(p0grid, p1grid) {
    const alive = (g) => g.some(row => row.some(t => !t.destroyed));
    if (!alive(p1grid)) return 0;
    if (!alive(p0grid)) return 1;
    return null;
  }

  function handleBattleAction(weaponId, targetGrid, targetRow, targetCol, extra) {
    const attacker = battleTurn;
    const defender = 1 - attacker;
    const player = players[attacker];
    const level = player.weapons[weaponId];
    const perk = player.perk;
    const info = getWeaponInfo(weaponId);
    const target = { row: targetRow, col: targetCol };

    let newP0grid = players[0].grid.map(r => r.map(t => ({ ...t })));
    let newP1grid = players[1].grid.map(r => r.map(t => ({ ...t })));

    if (info.type === "a") {
      // attack on opponent
      const oldGrid = defender === 0 ? newP0grid : newP1grid;
      const newGrid = applyWeapon(oldGrid, weaponId, level, perk, target, extra);
      if (defender === 0) newP0grid = newGrid;
      else newP1grid = newGrid;
      addLog(`${player.name} used ${info.label} on opponent tile (${targetRow},${targetCol})`);
    } else if (info.type === "d") {
      const oldGrid = attacker === 0 ? newP0grid : newP1grid;
      const newGrid = applyDefense(oldGrid, weaponId, level, perk, target, extra);
      if (attacker === 0) newP0grid = newGrid;
      else newP1grid = newGrid;
      addLog(`${player.name} used ${info.label} on own tile (${targetRow},${targetCol})`);
    } else if (info.type === "h") {
      const oldGrid = attacker === 0 ? newP0grid : newP1grid;
      const newGrid = applyHeal(oldGrid, weaponId, level, perk, target);
      if (attacker === 0) newP0grid = newGrid;
      else newP1grid = newGrid;
      addLog(`${player.name} used ${info.label} on own tile (${targetRow},${targetCol})`);
    }

    const w = checkWinner(newP0grid, newP1grid);
    setPlayers(prev => {
      const p = [...prev];
      p[0] = { ...p[0], grid: newP0grid };
      p[1] = { ...p[1], grid: newP1grid };
      return p;
    });

    if (w !== null) {
      setWinner(w);
      setPhase("gameover");
    } else {
      setBattleTurn(1 - battleTurn);
      setSelectedWeapon(null);
      setPendingAction(null);
    }
  }

  // ─── MISSILE DIRECTION LOGIC ───────────────────────────────────────────────

  const [missileDir, setMissileDir] = useState(null);
  const [amDir, setAmDir] = useState(null); // for antimissile with defend perk

  // ─── RENDER HELPERS ────────────────────────────────────────────────────────

  const hpColor = (hp, max) => {
    const pct = hp / max;
    if (pct > 0.6) return "#4ade80";
    if (pct > 0.3) return "#facc15";
    return "#f87171";
  };

  const weaponsByType = (weapons, type) =>
    Object.entries(weapons).filter(([id]) => getWeaponInfo(id)?.type === type);

  // ─── PHASES ────────────────────────────────────────────────────────────────

  if (phase === "intro") return <Intro onStart={startGame} />;

  if (phase === "perk-select") return (
    <PerkSelect
      playerIdx={currentPlayer}
      playerName={players[currentPlayer].name}
      options={perkOptions}
      onSelect={(p) => selectPerk(currentPlayer, p)}
    />
  );

  if (phase === "weapon-select") return (
    <WeaponSelect
      playerIdx={currentPlayer}
      player={players[currentPlayer]}
      round={weaponRound}
      choices={weaponChoices}
      onSelect={(wid) => selectWeapon(currentPlayer, wid)}
    />
  );

  if (phase === "steal") return (
    <StealPhase
      player0={players[0]}
      player1={players[1]}
      onSteal={performSteal}
      onSkip={() => { setPhase("battle"); setBattleTurn(0); }}
    />
  );

  if (phase === "gameover") return (
    <GameOver winner={players[winner]} onRestart={() => {
      setPlayers([
        { name: "Player 1", perk: null, perkChoices: [], weapons: {}, grid: initGrid() },
        { name: "Player 2", perk: null, perkChoices: [], weapons: {}, grid: initGrid() },
      ]);
      setLog([]); setWinner(null); setWeaponRound(0); setSelectedWeapon(null); setPendingAction(null);
      setPhase("intro");
    }} />
  );

  // BATTLE PHASE
  const attacker = players[battleTurn];
  const isAttackWeapon = selectedWeapon && getWeaponInfo(selectedWeapon)?.type === "a";
  const isDefWeapon = selectedWeapon && getWeaponInfo(selectedWeapon)?.type === "d";
  const isHealWeapon = selectedWeapon && getWeaponInfo(selectedWeapon)?.type === "h";
  const needsMissileDir = selectedWeapon === "missile" && !missileDir;
  const needsAmDir = selectedWeapon === "antimissile" && attacker.perk === "defend" && !amDir;

  function handleTileClick(gridOwner, row, col) {
    if (!selectedWeapon) return;
    const info = getWeaponInfo(selectedWeapon);
    if (!info) return;

    // Check valid target
    const targetGrid = players[gridOwner].grid;
    const tile = targetGrid[row][col];

    if (info.type === "a") {
      if (gridOwner === battleTurn) return; // must click enemy
      if (tile.destroyed && selectedWeapon !== "rocket") return;
    } else {
      if (gridOwner !== battleTurn) return; // must click own
      if (selectedWeapon === "expand" && !tile.destroyed) return;
      if (selectedWeapon !== "expand" && tile.destroyed) return;
    }

    if (selectedWeapon === "missile" && !missileDir) { return; }
    if (selectedWeapon === "antimissile" && attacker.perk === "defend" && !amDir) { return; }

    const extra = {};
    if (selectedWeapon === "missile") extra.direction = missileDir;
    if (selectedWeapon === "antimissile") extra.direction = amDir;

    handleBattleAction(selectedWeapon, gridOwner, row, col, extra);
    setMissileDir(null);
    setAmDir(null);
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0f0f1a", color: "#e2e8f0", fontFamily: "'Cinzel', serif", padding: "0" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&family=Rajdhani:wght@400;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #1a1a2e; }
        ::-webkit-scrollbar-thumb { background: #7c3aed; border-radius: 3px; }
        .tile-btn { transition: all 0.15s; cursor: pointer; border: none; }
        .tile-btn:hover { transform: scale(1.05); filter: brightness(1.2); }
        .weapon-btn { transition: all 0.2s; cursor: pointer; }
        .weapon-btn:hover { transform: translateY(-2px); }
        .weapon-btn.selected { box-shadow: 0 0 0 2px #a78bfa, 0 0 20px #7c3aed88; }
        .pulse { animation: pulse 2s infinite; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.6} }
        .glow { text-shadow: 0 0 20px currentColor; }
      `}</style>

      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)", borderBottom: "1px solid #7c3aed44", padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: "1.4rem", color: "#a78bfa", letterSpacing: "0.15em" }}>⚔️ TILE CLASH</h1>
        <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: "1rem", color: "#94a3b8" }}>
          Turn: <span style={{ color: "#f59e0b", fontWeight: 700 }}>{attacker.name}</span>
          {" · "}<span style={{ color: "#a78bfa" }}>{attacker.perk?.toUpperCase()}</span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 0, height: "calc(100vh - 56px)" }}>

        {/* P0 Arsenal */}
        <Arsenal player={players[0]} isActive={battleTurn === 0} selectedWeapon={battleTurn === 0 ? selectedWeapon : null} onSelect={battleTurn === 0 ? setSelectedWeapon : null} />

        {/* Grids */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 16, overflowY: "auto" }}>

          {/* Action controls */}
          {selectedWeapon && (
            <div style={{ background: "#1e1b4b", border: "1px solid #7c3aed", borderRadius: 8, padding: "10px 20px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
              <span style={{ fontFamily: "'Rajdhani',sans-serif", color: "#c4b5fd" }}>
                {getWeaponInfo(selectedWeapon)?.label} selected — click a {isAttackWeapon ? "🔴 enemy tile" : isDefWeapon ? "🟢 own tile" : "🟢 own tile"}
              </span>
              {selectedWeapon === "missile" && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setMissileDir("row")} style={{ background: missileDir === "row" ? "#7c3aed" : "#312e81", color: "#e2e8f0", border: "none", borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontFamily: "'Rajdhani',sans-serif" }}>→ Row</button>
                  <button onClick={() => setMissileDir("col")} style={{ background: missileDir === "col" ? "#7c3aed" : "#312e81", color: "#e2e8f0", border: "none", borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontFamily: "'Rajdhani',sans-serif" }}>↓ Col</button>
                </div>
              )}
              {selectedWeapon === "antimissile" && attacker.perk === "defend" && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setAmDir("row")} style={{ background: amDir === "row" ? "#7c3aed" : "#312e81", color: "#e2e8f0", border: "none", borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontFamily: "'Rajdhani',sans-serif" }}>→ Row</button>
                  <button onClick={() => setAmDir("col")} style={{ background: amDir === "col" ? "#7c3aed" : "#312e81", color: "#e2e8f0", border: "none", borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontFamily: "'Rajdhani',sans-serif" }}>↓ Col</button>
                </div>
              )}
              <button onClick={() => { setSelectedWeapon(null); setMissileDir(null); setAmDir(null); }} style={{ background: "#7f1d1d", color: "#fca5a5", border: "none", borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontFamily: "'Rajdhani',sans-serif" }}>✕ Cancel</button>
            </div>
          )}

          <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap", justifyContent: "center" }}>
            {[0, 1].map(gi => (
              <div key={gi}>
                <div style={{ textAlign: "center", marginBottom: 8, fontFamily: "'Rajdhani',sans-serif", fontSize: "0.95rem", color: gi === battleTurn ? "#a78bfa" : "#64748b" }}>
                  {players[gi].name} {gi === battleTurn ? "⚡" : ""}
                  <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                    Tiles alive: {players[gi].grid.flat().filter(t => !t.destroyed).length}
                  </div>
                </div>
                <TileGrid
                  grid={players[gi].grid}
                  owner={gi}
                  battleTurn={battleTurn}
                  selectedWeapon={selectedWeapon}
                  missileDir={missileDir}
                  amDir={amDir}
                  attackerPerk={attacker.perk}
                  onTileClick={(r, c) => handleTileClick(gi, r, c)}
                  hpColor={hpColor}
                />
              </div>
            ))}
          </div>

          {/* Log */}
          <div style={{ width: "100%", maxWidth: 600, background: "#0d0d1a", border: "1px solid #1e293b", borderRadius: 8, padding: 10, maxHeight: 100, overflowY: "auto" }}>
            {log.length === 0 ? <div style={{ color: "#475569", fontFamily: "'Rajdhani',sans-serif", fontSize: "0.8rem", textAlign: "center" }}>Battle log…</div> :
              log.map((l, i) => <div key={i} style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: "0.78rem", color: i === 0 ? "#c4b5fd" : "#475569", padding: "1px 0" }}>{l}</div>)}
          </div>
        </div>

        {/* P1 Arsenal */}
        <Arsenal player={players[1]} isActive={battleTurn === 1} selectedWeapon={battleTurn === 1 ? selectedWeapon : null} onSelect={battleTurn === 1 ? setSelectedWeapon : null} />
      </div>
    </div>
  );
}

// ─── SUB-COMPONENTS ───────────────────────────────────────────────────────────

function Intro({ onStart }) {
  return (
    <div style={{ minHeight: "100vh", background: "radial-gradient(ellipse at center, #1a1035 0%, #0a0a1a 100%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Cinzel', serif", color: "#e2e8f0" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&family=Rajdhani:wght@400;600&display=swap');* { box-sizing: border-box; }`}</style>
      <div style={{ textAlign: "center", padding: 40 }}>
        <div style={{ fontSize: "4rem", marginBottom: 16 }}>⚔️</div>
        <h1 style={{ fontSize: "3.5rem", fontWeight: 900, color: "#a78bfa", textShadow: "0 0 40px #7c3aed", letterSpacing: "0.2em", marginBottom: 8 }}>TILE CLASH</h1>
        <p style={{ fontFamily: "'Rajdhani', sans-serif", color: "#64748b", fontSize: "1rem", marginBottom: 40, letterSpacing: "0.1em" }}>2-PLAYER TACTICAL WARFARE</p>
        <div style={{ display: "flex", gap: 16, justifyContent: "center", marginBottom: 48, flexWrap: "wrap" }}>
          {[["🔥", "Attack","Boost your offensive weapons"],["🛡️","Defend","Strengthen your defenses"],["💚","Heal","Amplify your recovery"],["💎","Steal","Take an enemy weapon (Ultra Rare)"]].map(([ic, name, desc]) => (
            <div key={name} style={{ background: "#1a1a2e", border: "1px solid #312e81", borderRadius: 12, padding: "16px 20px", width: 140, textAlign: "center" }}>
              <div style={{ fontSize: "1.8rem" }}>{ic}</div>
              <div style={{ color: "#a78bfa", fontWeight: 700, fontSize: "0.9rem", marginTop: 4 }}>{name}</div>
              <div style={{ fontFamily: "'Rajdhani',sans-serif", color: "#64748b", fontSize: "0.72rem", marginTop: 4 }}>{desc}</div>
            </div>
          ))}
        </div>
        <button onClick={onStart} style={{ background: "linear-gradient(135deg, #7c3aed, #4c1d95)", color: "#fff", border: "none", borderRadius: 12, padding: "16px 48px", fontSize: "1.1rem", fontFamily: "'Cinzel',serif", fontWeight: 700, cursor: "pointer", letterSpacing: "0.1em", boxShadow: "0 0 30px #7c3aed88" }}>
          BEGIN BATTLE
        </button>
      </div>
    </div>
  );
}

function PerkSelect({ playerIdx, playerName, options, onSelect }) {
  const perkInfo = { attack: { icon: "🔥", color: "#ef4444", desc: "Boosts attack weapons' damage" }, defend: { icon: "🛡️", color: "#3b82f6", desc: "Strengthens all defense weapons" }, heal: { icon: "💚", color: "#22c55e", desc: "Amplifies all healing effects" }, steal: { icon: "💎", color: "#f59e0b", desc: "Steal one enemy weapon after setup" } };
  return (
    <div style={{ minHeight: "100vh", background: "radial-gradient(ellipse at center, #1a1035 0%, #0a0a1a 100%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Cinzel', serif", color: "#e2e8f0" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&family=Rajdhani:wght@400;600&display=swap');*{box-sizing:border-box;}`}</style>
      <div style={{ textAlign: "center", padding: 40 }}>
        <div style={{ color: "#64748b", fontFamily: "'Rajdhani',sans-serif", letterSpacing: "0.15em", marginBottom: 8, fontSize: "0.9rem" }}>PERK SELECTION</div>
        <h2 style={{ color: "#a78bfa", fontSize: "2rem", marginBottom: 8 }}>{playerName}</h2>
        <p style={{ fontFamily: "'Rajdhani',sans-serif", color: "#64748b", marginBottom: 40 }}>Choose your battle perk</p>
        <div style={{ display: "flex", gap: 24, justifyContent: "center", flexWrap: "wrap" }}>
          {options.map(p => {
            const info = perkInfo[p];
            return (
              <button key={p} onClick={() => onSelect(p)} style={{ background: "#1a1a2e", border: `2px solid ${info.color}44`, borderRadius: 16, padding: "28px 32px", width: 180, textAlign: "center", cursor: "pointer", transition: "all 0.2s", color: "#e2e8f0" }}
                onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.borderColor = info.color; e.currentTarget.style.boxShadow = `0 0 30px ${info.color}44`; }}
                onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.borderColor = `${info.color}44`; e.currentTarget.style.boxShadow = ""; }}>
                <div style={{ fontSize: "2.5rem" }}>{info.icon}</div>
                <div style={{ color: info.color, fontWeight: 700, fontSize: "1rem", marginTop: 8, letterSpacing: "0.1em" }}>{p.toUpperCase()}</div>
                <div style={{ fontFamily: "'Rajdhani',sans-serif", color: "#94a3b8", fontSize: "0.78rem", marginTop: 8 }}>{info.desc}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function WeaponSelect({ playerIdx, player, round, choices, onSelect }) {
  return (
    <div style={{ minHeight: "100vh", background: "radial-gradient(ellipse at center, #1a1035 0%, #0a0a1a 100%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Cinzel', serif", color: "#e2e8f0" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&family=Rajdhani:wght@400;600&display=swap');*{box-sizing:border-box;}`}</style>
      <div style={{ textAlign: "center", padding: 40 }}>
        <div style={{ color: "#64748b", fontFamily: "'Rajdhani',sans-serif", letterSpacing: "0.15em", marginBottom: 8, fontSize: "0.9rem" }}>WEAPON SELECTION</div>
        <h2 style={{ color: "#a78bfa", fontSize: "1.8rem", marginBottom: 4 }}>{player.name}</h2>
        <p style={{ fontFamily: "'Rajdhani',sans-serif", color: "#64748b", marginBottom: 4 }}>Perk: <span style={{ color: "#f59e0b" }}>{player.perk?.toUpperCase()}</span></p>
        <p style={{ fontFamily: "'Rajdhani',sans-serif", color: "#64748b", marginBottom: 32 }}>Round {round + 1} of 5</p>

        {/* Current loadout */}
        {Object.keys(player.weapons).length > 0 && (
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 24, flexWrap: "wrap" }}>
            {Object.entries(player.weapons).map(([wid, lvl]) => {
              const info = getWeaponInfo(wid);
              return <div key={wid} style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, padding: "6px 12px", fontFamily: "'Rajdhani',sans-serif", fontSize: "0.8rem", color: "#94a3b8" }}>
                {info?.label} {lvl > 1 ? "⭐⭐" : "⭐"}
              </div>;
            })}
          </div>
        )}

        <div style={{ display: "flex", gap: 20, justifyContent: "center", flexWrap: "wrap" }}>
          {choices.map(w => {
            const typeColors = { a: "#ef4444", d: "#3b82f6", h: "#22c55e" };
            const typeLabels = { a: "ATTACK", d: "DEFENSE", h: "HEAL" };
            const alreadyHave = player.weapons[w.id];
            const willUpgrade = alreadyHave === 1;
            const typeColor = typeColors[w.type];
            return (
              <button key={w.id} onClick={() => onSelect(w.id)} style={{ background: "#1a1a2e", border: `2px solid ${typeColor}44`, borderRadius: 16, padding: "24px 28px", width: 170, textAlign: "center", cursor: "pointer", transition: "all 0.2s", color: "#e2e8f0", position: "relative" }}
                onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.borderColor = typeColor; e.currentTarget.style.boxShadow = `0 0 25px ${typeColor}44`; }}
                onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.borderColor = `${typeColor}44`; e.currentTarget.style.boxShadow = ""; }}>
                {willUpgrade && <div style={{ position: "absolute", top: -10, right: -10, background: "#f59e0b", color: "#000", borderRadius: "50%", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", fontWeight: 700 }}>LV2</div>}
                <div style={{ fontSize: "2rem" }}>{w.label.split(" ")[0]}</div>
                <div style={{ color: typeColor, fontWeight: 700, fontSize: "0.85rem", marginTop: 8, letterSpacing: "0.05em" }}>{w.label.substring(w.label.indexOf(" ") + 1)}</div>
                <div style={{ background: `${typeColor}22`, color: typeColor, borderRadius: 4, padding: "2px 8px", fontSize: "0.7rem", marginTop: 8, fontFamily: "'Rajdhani',sans-serif" }}>{typeLabels[w.type]}</div>
                {alreadyHave && <div style={{ color: "#fbbf24", fontSize: "0.7rem", marginTop: 6, fontFamily: "'Rajdhani',sans-serif" }}>{willUpgrade ? "→ UPGRADE TO LV2" : "MAX LEVEL"}</div>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StealPhase({ player0, player1, onSteal, onSkip }) {
  const [hovered, setHovered] = useState(null);
  return (
    <div style={{ minHeight: "100vh", background: "radial-gradient(ellipse at center, #2d1a00 0%, #0a0a1a 100%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Cinzel', serif", color: "#e2e8f0" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&family=Rajdhani:wght@400;600&display=swap');*{box-sizing:border-box;}`}</style>
      <div style={{ textAlign: "center", padding: 40 }}>
        <div style={{ fontSize: "3rem", marginBottom: 12 }}>💎</div>
        <h2 style={{ color: "#f59e0b", fontSize: "2rem", marginBottom: 8, textShadow: "0 0 20px #f59e0b" }}>STEAL ACTIVATED</h2>
        <p style={{ fontFamily: "'Rajdhani',sans-serif", color: "#94a3b8", marginBottom: 32 }}>{player0.name}: Choose a weapon from {player1.name} to steal</p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginBottom: 32 }}>
          {Object.entries(player1.weapons).map(([wid, lvl]) => {
            const info = getWeaponInfo(wid);
            const p0has = player0.weapons[wid];
            return (
              <button key={wid} onClick={() => onSteal(wid)} style={{ background: "#1a1a2e", border: `2px solid #f59e0b44`, borderRadius: 12, padding: "16px 20px", textAlign: "center", cursor: "pointer", transition: "all 0.2s", color: "#e2e8f0", minWidth: 130 }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "#f59e0b"; e.currentTarget.style.transform = "translateY(-3px)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "#f59e0b44"; e.currentTarget.style.transform = ""; }}>
                <div style={{ fontSize: "1.5rem" }}>{info?.label.split(" ")[0]}</div>
                <div style={{ color: "#f59e0b", fontSize: "0.8rem", marginTop: 6, fontFamily: "'Rajdhani',sans-serif" }}>{info?.label.substring(info.label.indexOf(" ") + 1)}</div>
                <div style={{ color: "#94a3b8", fontSize: "0.7rem", fontFamily: "'Rajdhani',sans-serif" }}>{"⭐".repeat(lvl)}</div>
              </button>
            );
          })}
        </div>
        <button onClick={onSkip} style={{ background: "transparent", color: "#64748b", border: "1px solid #334155", borderRadius: 8, padding: "10px 24px", cursor: "pointer", fontFamily: "'Rajdhani',sans-serif" }}>Skip Steal</button>
      </div>
    </div>
  );
}

function Arsenal({ player, isActive, selectedWeapon, onSelect }) {
  const typeColors = { a: "#ef4444", d: "#3b82f6", h: "#22c55e" };
  const typeLabels = { a: "⚔️ Attack", d: "🛡️ Defense", h: "💚 Heal" };

  return (
    <div style={{ width: 170, background: isActive ? "#12122a" : "#0d0d1a", borderRight: isActive ? "1px solid #7c3aed44" : "1px solid #1e293b", borderLeft: isActive ? "1px solid #7c3aed44" : "1px solid #1e293b", padding: "12px 10px", display: "flex", flexDirection: "column", gap: 8, overflowY: "auto", transition: "background 0.3s" }}>
      <div style={{ textAlign: "center", paddingBottom: 8, borderBottom: "1px solid #1e293b" }}>
        <div style={{ fontSize: "0.75rem", color: isActive ? "#a78bfa" : "#475569", fontFamily: "'Rajdhani',sans-serif", letterSpacing: "0.1em" }}>{player.name}</div>
        <div style={{ fontSize: "0.7rem", color: "#64748b", fontFamily: "'Rajdhani',sans-serif" }}>{player.perk?.toUpperCase()}</div>
      </div>

      {["a", "d", "h"].map(type => {
        const weapons = Object.entries(player.weapons).filter(([id]) => getWeaponInfo(id)?.type === type);
        if (!weapons.length) return null;
        return (
          <div key={type}>
            <div style={{ fontSize: "0.65rem", color: typeColors[type], fontFamily: "'Rajdhani',sans-serif", letterSpacing: "0.08em", marginBottom: 4 }}>{typeLabels[type]}</div>
            {weapons.map(([wid, lvl]) => {
              const info = getWeaponInfo(wid);
              const active = selectedWeapon === wid;
              const canSelect = isActive && onSelect;
              return (
                <button key={wid} className={`weapon-btn ${active ? "selected" : ""}`}
                  onClick={() => canSelect && onSelect(active ? null : wid)}
                  style={{ width: "100%", background: active ? `${typeColors[type]}22` : "#1a1a2e", border: `1px solid ${active ? typeColors[type] : "#1e293b"}`, borderRadius: 8, padding: "8px 10px", textAlign: "left", color: "#e2e8f0", cursor: canSelect ? "pointer" : "default", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: "0.75rem" }}>{info?.label}</span>
                  <span style={{ color: "#fbbf24", fontSize: "0.65rem" }}>{"⭐".repeat(lvl)}</span>
                </button>
              );
            })}
          </div>
        );
      })}

      {Object.keys(player.weapons).length === 0 && (
        <div style={{ color: "#334155", fontFamily: "'Rajdhani',sans-serif", fontSize: "0.7rem", textAlign: "center", marginTop: 20 }}>No weapons</div>
      )}
    </div>
  );
}

function TileGrid({ grid, owner, battleTurn, selectedWeapon, missileDir, amDir, attackerPerk, onTileClick, hpColor }) {
  const info = selectedWeapon ? getWeaponInfo(selectedWeapon) : null;
  const isEnemyGrid = owner !== battleTurn;
  const isOwnGrid = owner === battleTurn;
  const canTarget = info && ((info.type === "a" && isEnemyGrid) || (info.type !== "a" && isOwnGrid));

  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${GRID_SIZE}, 52px)`, gap: 4, padding: 8, background: "#0d0d1a", borderRadius: 10, border: `1px solid ${isEnemyGrid && canTarget ? "#ef444433" : isOwnGrid && canTarget ? "#22c55e33" : "#1e293b"}` }}>
      {grid.map((row, r) => row.map((tile, c) => {
        const pct = tile.destroyed ? 0 : tile.hp / tile.maxHp;
        const bg = tile.destroyed
          ? "#0f0f0f"
          : `linear-gradient(135deg, ${hpColor(tile.hp, tile.maxHp)}22 0%, #1a1a2e 100%)`;

        const clickable = canTarget && (
          (info?.id === "expand" ? tile.destroyed : !tile.destroyed) || (info?.id === "rocket")
        );

        // Missile needs direction before clicking
        const missilePending = selectedWeapon === "missile" && !missileDir;
        const amPending = selectedWeapon === "antimissile" && attackerPerk === "defend" && !amDir;
        const ready = clickable && !missilePending && !amPending;

        return (
          <div key={`${r}-${c}`}
            onClick={() => ready && onTileClick(r, c)}
            style={{
              width: 52, height: 52, borderRadius: 6, background: bg,
              border: `1px solid ${tile.destroyed ? "#1a1a1a" : tile.shield > 0 ? "#fbbf24" : tile.antimissile ? "#06b6d4" : tile.steel ? "#94a3b8" : "#1e293b"}`,
              cursor: ready ? "pointer" : "default",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              position: "relative", transition: "all 0.15s",
              opacity: tile.destroyed ? 0.25 : 1,
              filter: ready ? "brightness(1.1)" : "brightness(1)",
              boxShadow: ready ? `0 0 8px ${info?.type === "a" ? "#ef444488" : info?.type === "d" ? "#3b82f688" : "#22c55e88"}` : "none",
            }}>
            {!tile.destroyed && (
              <>
                <div style={{ width: "80%", height: 3, background: "#1e293b", borderRadius: 2, overflow: "hidden", marginBottom: 2 }}>
                  <div style={{ width: `${pct * 100}%`, height: "100%", background: hpColor(tile.hp, tile.maxHp), transition: "width 0.3s" }} />
                </div>
                <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: "0.65rem", color: hpColor(tile.hp, tile.maxHp) }}>{tile.hp}</div>
                <div style={{ display: "flex", gap: 2, marginTop: 1 }}>
                  {tile.shield > 0 && <span title={`Shield: ${tile.shield}`} style={{ fontSize: "0.55rem" }}>🛡️</span>}
                  {tile.antimissile && <span title="Anti-Missile" style={{ fontSize: "0.55rem" }}>🔰</span>}
                  {tile.steel && !tile.steelUsed && <span title="Steel" style={{ fontSize: "0.55rem" }}>⚙️</span>}
                </div>
              </>
            )}
            {tile.destroyed && <span style={{ fontSize: "1rem" }}>💀</span>}
          </div>
        );
      }))}
    </div>
  );
}

function GameOver({ winner, onRestart }) {
  return (
    <div style={{ minHeight: "100vh", background: "radial-gradient(ellipse at center, #1a3520 0%, #0a0a1a 100%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Cinzel', serif", color: "#e2e8f0" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&family=Rajdhani:wght@400;600&display=swap');*{box-sizing:border-box;}`}</style>
      <div style={{ textAlign: "center", padding: 40 }}>
        <div style={{ fontSize: "4rem", marginBottom: 16 }}>🏆</div>
        <h2 style={{ fontSize: "3rem", color: "#4ade80", textShadow: "0 0 40px #22c55e", letterSpacing: "0.15em", marginBottom: 8 }}>VICTORY</h2>
        <p style={{ color: "#a78bfa", fontSize: "1.5rem", marginBottom: 40 }}>{winner.name} wins!</p>
        <button onClick={onRestart} style={{ background: "linear-gradient(135deg, #7c3aed, #4c1d95)", color: "#fff", border: "none", borderRadius: 12, padding: "14px 40px", fontSize: "1rem", fontFamily: "'Cinzel',serif", fontWeight: 700, cursor: "pointer", letterSpacing: "0.1em", boxShadow: "0 0 25px #7c3aed88" }}>
          Play Again
        </button>
      </div>
    </div>
  );
}
