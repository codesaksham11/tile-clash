import { useState, useEffect, useCallback, useRef } from "react";

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

const TILE_BASE_HP = 150;
const GRID_SIZE = 8;
const GAME_DURATION = 5 * 60; // 5 minutes in seconds

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

function calcTotalHP(grid) {
  return grid.flat().filter(t => !t.destroyed).reduce((sum, t) => sum + t.hp, 0);
}

// ─── DAMAGE CALCULATIONS ─────────────────────────────────────────────────────

function applyDamageToTile(tile, rawDmg) {
  if (tile.destroyed) return tile;
  let t = { ...tile };
  let dmg = rawDmg;

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

  function hitTile(r, c, dmg) {
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
    if (level === 2 && perk === "attack") { main = 70; side = 45; }
    else if (perk === "attack") { main = 60; side = 40; }
    else if (level === 2) { main = 50; side = 35; }
    else { main = 40; side = 20; }
    hitTile(row, col, main);
    getNeighbors(grid, row, col).forEach(n => hitTile(n.row, n.col, side));
  } else if (weaponId === "cannon") {
    let main;
    if (level === 2 && perk === "attack") { main = 100; }
    else if (perk === "attack") { main = 90; }
    else if (level === 2) { main = 75; }
    else { main = 60; }
    hitTile(row, col, main);
    if (level === 2 && perk === "attack") {
      const neighbors = getNeighbors(grid, row, col).filter(n => !n.destroyed);
      if (neighbors.length) {
        const strongest = neighbors.reduce((a, b) => a.hp > b.hp ? a : b);
        hitTile(strongest.row, strongest.col, 60);
      }
    }
  } else if (weaponId === "missile") {
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
  } else if (weaponId === "rocket") {
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
  } else if (weaponId === "antimissile") {
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
  } else if (weaponId === "steel") {
    g[row][col] = { ...g[row][col], steel: true, steelUsed: false };
  } else if (weaponId === "expand") {
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

  const cap = (tile, amt) => ({ ...tile, hp: Math.min(tile.maxHp, tile.hp + amt) });

  if (weaponId === "regenerate") {
    let main, side;
    if (level === 2 && perk === "heal") { main = 85; side = 25; }
    else if (perk === "heal") { main = 85; side = 20; }
    else if (level === 2) { main = 85; side = 15; }
    else { main = 85; side = 10; }
    g[row][col] = cap(g[row][col], main);
    getNeighbors(grid, row, col).forEach(n => { if (!n.destroyed) g[n.row][n.col] = cap(g[n.row][n.col], side); });
  } else if (weaponId === "aroma") {
    let amt;
    if (level === 2 && perk === "heal") amt = 120;
    else if (perk === "heal") amt = 110;
    else if (level === 2) amt = 100;
    else amt = 90;
    g[row][col] = cap(g[row][col], amt);
    getNeighbors(grid, row, col).forEach(n => { if (!n.destroyed) g[n.row][n.col] = cap(g[n.row][n.col], amt); });
  } else if (weaponId === "quickheal") {
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

function getWeaponInfo(id) { return WEAPONS.find(w => w.id === id); }

// ─── TIMER HOOK ───────────────────────────────────────────────────────────────

function useGameTimer(isRunning, onExpire) {
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!isRunning) return;
    setTimeLeft(GAME_DURATION);
  }, [isRunning]);

  useEffect(() => {
    if (!isRunning) {
      clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(intervalRef.current);
          onExpire();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [isRunning, onExpire]);

  return timeLeft;
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function App() {
  const [phase, setPhase] = useState("intro");
  const [currentPlayer, setCurrentPlayer] = useState(0);
  const [players, setPlayers] = useState([
    { name: "Player 1", perk: null, perkChoices: [], weapons: {}, grid: initGrid() },
    { name: "Player 2", perk: null, perkChoices: [], weapons: {}, grid: initGrid() },
  ]);
  const [weaponRound, setWeaponRound] = useState(0);
  const [weaponChoices, setWeaponChoices] = useState([]);
  const [log, setLog] = useState([]);
  const [battleTurn, setBattleTurn] = useState(0);
  const [selectedWeapon, setSelectedWeapon] = useState(null);
  const [winner, setWinner] = useState(null);
  const [winReason, setWinReason] = useState(""); // "elimination" | "timeout"
  const [perkOptions, setPerkOptions] = useState([]);
  const [missileDir, setMissileDir] = useState(null);
  const [amDir, setAmDir] = useState(null);
  const [timerActive, setTimerActive] = useState(false);
  const [timeoutScores, setTimeoutScores] = useState(null);
// --- MOBILE UI STATE & ZOOM LOGIC ---
  const [zoom, setZoom] = useState(1);
  const [leftOpen, setLeftOpen] = useState(typeof window !== "undefined" ? window.innerWidth > 768 : true);
  const [rightOpen, setRightOpen] = useState(typeof window !== "undefined" ? window.innerWidth > 768 : true);
  const touchStartRef = useRef(null);
  const swipeStartRef = useRef(null);

  // Auto-manage sidebars based on screen size
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) {
        setLeftOpen(true);
        setRightOpen(true);
      } else {
        setLeftOpen(false);
        setRightOpen(false);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Pinch-to-zoom handlers
  const handleTouchStart = (e) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchStartRef.current = dist;
    }
  };
  const handleTouchMove = (e) => {
    if (e.touches.length === 2 && touchStartRef.current) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const delta = dist / touchStartRef.current;
      setZoom((prev) => Math.min(Math.max(0.4, prev * delta), 2)); // Limits zoom from 40% to 200%
      touchStartRef.current = dist;
    }
  };
  const handleTouchEnd = (e) => {
    if (e.touches.length < 2) touchStartRef.current = null;
  };

  const handleTimerExpire = useCallback(() => {
    setPlayers(currentPlayers => {
      const hp0 = calcTotalHP(currentPlayers[0].grid);
      const hp1 = calcTotalHP(currentPlayers[1].grid);
      setTimeoutScores({ hp0, hp1 });
      if (hp0 > hp1) setWinner(0);
      else if (hp1 > hp0) setWinner(1);
      else setWinner(-1); // draw
      setWinReason("timeout");
      setTimerActive(false);
      setPhase("gameover");
      return currentPlayers;
    });
  }, []);

  const timeLeft = useGameTimer(timerActive, handleTimerExpire);

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const timerColor = timeLeft > 60 ? "#4ade80" : timeLeft > 30 ? "#facc15" : "#ef4444";
  const timerUrgent = timeLeft <= 30;

  // ─── SETUP PHASES ──────────────────────────────────────────────────────────

  function startGame() {
    setPerkOptions(pickTwo());
    setCurrentPlayer(0);
    setPhase("perk-select");
  }

  function selectPerk(playerIdx, perk) {
    setPlayers(prev => {
      const p = [...prev];
      p[playerIdx] = { ...p[playerIdx], perk };
      return p;
    });
    if (playerIdx === 0) {
      setPerkOptions(pickTwo());
      setCurrentPlayer(1);
    } else {
      setCurrentPlayer(0);
      setWeaponRound(0);
      setWeaponChoices(randomThreeWeapons());
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
      const currentWeapons = players[playerIdx].weapons;
      const maxed = Object.keys(currentWeapons).filter(k => currentWeapons[k] >= 2);
      setWeaponChoices(randomThreeWeapons(maxed));
    } else {
      if (playerIdx === 0) {
        setCurrentPlayer(1);
        setWeaponRound(0);
        setWeaponChoices(randomThreeWeapons());
      } else {
        if (players[0].perk === "steal") {
          setPhase("steal");
        } else {
          setPhase("battle");
          setBattleTurn(0);
          setTimerActive(true);
        }
      }
    }
  }

  function performSteal(weaponId) {
    setPlayers(prev => {
      const p = [...prev];
      const p0 = { ...p[0], weapons: { ...p[0].weapons } };
      const p1 = { ...p[1], weapons: { ...p[1].weapons } };
      const level = p1.weapons[weaponId];
      if (!level) return prev;
      const swapId = Object.keys(p0.weapons).find(k => p0.weapons[k] === level);
      if (swapId) {
        p0.weapons[weaponId] = level;
        delete p0.weapons[swapId];
        p1.weapons[swapId] = level;
        delete p1.weapons[weaponId];
      } else {
        p0.weapons[weaponId] = level;
        delete p1.weapons[weaponId];
      }
      p[0] = p0; p[1] = p1;
      return p;
    });
    setPhase("battle");
    setBattleTurn(0);
    setTimerActive(true);
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
      const oldGrid = defender === 0 ? newP0grid : newP1grid;
      const newGrid = applyWeapon(oldGrid, weaponId, level, perk, target, extra);
      if (defender === 0) newP0grid = newGrid; else newP1grid = newGrid;
      addLog(`${player.name} used ${info.label} on opponent (${targetRow},${targetCol})`);
    } else if (info.type === "d") {
      const oldGrid = attacker === 0 ? newP0grid : newP1grid;
      const newGrid = applyDefense(oldGrid, weaponId, level, perk, target, extra);
      if (attacker === 0) newP0grid = newGrid; else newP1grid = newGrid;
      addLog(`${player.name} used ${info.label} on own tile (${targetRow},${targetCol})`);
    } else if (info.type === "h") {
      const oldGrid = attacker === 0 ? newP0grid : newP1grid;
      const newGrid = applyHeal(oldGrid, weaponId, level, perk, target);
      if (attacker === 0) newP0grid = newGrid; else newP1grid = newGrid;
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
      setTimerActive(false);
      setWinner(w);
      setWinReason("elimination");
      setPhase("gameover");
    } else {
      setBattleTurn(1 - battleTurn);
      setSelectedWeapon(null);
    }
  }

  function handleTileClick(gridOwner, row, col) {
    if (!selectedWeapon) return;
    const info = getWeaponInfo(selectedWeapon);
    if (!info) return;
    const targetGrid = players[gridOwner].grid;
    const tile = targetGrid[row][col];

    if (info.type === "a") {
      if (gridOwner === battleTurn) return;
      if (tile.destroyed && selectedWeapon !== "rocket") return;
    } else {
      if (gridOwner !== battleTurn) return;
      if (selectedWeapon === "expand" && !tile.destroyed) return;
      if (selectedWeapon !== "expand" && tile.destroyed) return;
    }

    if (selectedWeapon === "missile" && !missileDir) return;
    if (selectedWeapon === "antimissile" && players[battleTurn].perk === "defend" && !amDir) return;

    const extra = {};
    if (selectedWeapon === "missile") extra.direction = missileDir;
    if (selectedWeapon === "antimissile") extra.direction = amDir;

    handleBattleAction(selectedWeapon, gridOwner, row, col, extra);
    setMissileDir(null);
    setAmDir(null);
  }

  // ─── PHASES ────────────────────────────────────────────────────────────────

  if (phase === "intro") return <Intro onStart={startGame} />;
  if (phase === "perk-select") return <PerkSelect playerIdx={currentPlayer} playerName={players[currentPlayer].name} options={perkOptions} onSelect={(p) => selectPerk(currentPlayer, p)} />;
  if (phase === "weapon-select") return <WeaponSelect playerIdx={currentPlayer} player={players[currentPlayer]} round={weaponRound} choices={weaponChoices} onSelect={(wid) => selectWeapon(currentPlayer, wid)} />;
  if (phase === "steal") return <StealPhase player0={players[0]} player1={players[1]} onSteal={performSteal} onSkip={() => { setPhase("battle"); setBattleTurn(0); setTimerActive(true); }} />;
  if (phase === "gameover") return (
    <GameOver
      winner={winner === -1 ? null : players[winner]}
      winReason={winReason}
      timeoutScores={timeoutScores}
      players={players}
      onRestart={() => {
        setPlayers([
          { name: "Player 1", perk: null, perkChoices: [], weapons: {}, grid: initGrid() },
          { name: "Player 2", perk: null, perkChoices: [], weapons: {}, grid: initGrid() },
        ]);
        setLog([]); setWinner(null); setWinReason(""); setTimeoutScores(null);
        setWeaponRound(0); setSelectedWeapon(null); setTimerActive(false);
        setPhase("intro");
      }}
    />
  );

  // BATTLE PHASE
  const attacker = players[battleTurn];
  const isAttackWeapon = selectedWeapon && getWeaponInfo(selectedWeapon)?.type === "a";

  const hpColor = (hp, max) => {
    const pct = hp / max;
    if (pct > 0.6) return "#4ade80";
    if (pct > 0.3) return "#facc15";
    return "#f87171";
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0f0f1a", color: "#e2e8f0", fontFamily: "'Cinzel', serif", padding: 0 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&family=Rajdhani:wght@400;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #1a1a2e; }
        ::-webkit-scrollbar-thumb { background: #7c3aed; border-radius: 3px; }
        .weapon-btn { transition: all 0.2s; cursor: pointer; }
        .weapon-btn:hover { transform: translateY(-2px); }
        .weapon-btn.selected { box-shadow: 0 0 0 2px #a78bfa, 0 0 20px #7c3aed88; }
        @keyframes timerPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.7;transform:scale(1.05)} }
        @keyframes timerShake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-3px)} 75%{transform:translateX(3px)} }
        .timer-urgent { animation: timerPulse 0.8s infinite; }
/* --- NEW MOBILE UI STYLES --- */
        .battle-container { display: flex; gap: 0; height: calc(100vh - 57px); position: relative; overflow: hidden; }
        .middle-area { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; gap: 14px; padding: 14px; overflow: auto; touch-action: pan-x pan-y; }
        .zoom-wrapper { display: flex; flex-direction: column; align-items: center; gap: 14px; transform-origin: top center; transition: transform 0.1s ease-out; width: 100%; }

        @media (max-width: 768px) {
          .arsenal-wrapper { position: absolute; top: 0; bottom: 0; z-index: 50; transition: transform 0.3s ease-in-out; background: #0d0d1a; height: 100%; box-shadow: 0 0 20px rgba(0,0,0,0.8); }
          .arsenal-left { left: 0; transform: translateX(-100%); }
          .arsenal-left.open { transform: translateX(0); }
          .arsenal-right { right: 0; transform: translateX(100%); }
          .arsenal-right.open { transform: translateX(0); }
          .panel-toggle { display: flex !important; }
          .zoom-controls { display: flex !important; }
        }

        .panel-toggle {
          display: none; position: absolute; top: 50%; transform: translateY(-50%);
          background: #1e1b4b; border: 1px solid #7c3aed; color: #e2e8f0;
          padding: 16px 8px; cursor: pointer; z-index: 60; border-radius: 8px; font-weight: bold;
          box-shadow: 0 0 10px #7c3aed88; align-items: center; justify-content: center; font-family: 'Rajdhani', sans-serif;
        }
        .panel-toggle-left { left: 0; border-top-left-radius: 0; border-bottom-left-radius: 0; }
        .panel-toggle-right { right: 0; border-top-right-radius: 0; border-bottom-right-radius: 0; }

        .zoom-controls { display: none; position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); gap: 12px; z-index: 40; background: #1e1b4bdf; padding: 6px 12px; border-radius: 20px; border: 1px solid #7c3aed; align-items: center; }
        .zoom-btn { background: #312e81; border: none; color: #e2e8f0; width: 36px; height: 36px; border-radius: 18px; font-size: 1.4rem; cursor: pointer; }
        .zoom-btn:active { background: #4c1d95; }
      `}</style>

      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)", borderBottom: "1px solid #7c3aed44", padding: "10px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <h1 style={{ fontSize: "1.3rem", color: "#a78bfa", letterSpacing: "0.15em", whiteSpace: "nowrap" }}>⚔️ TILE CLASH</h1>

        {/* Timer — center */}
        <div className={timerUrgent ? "timer-urgent" : ""} style={{ display: "flex", flexDirection: "column", alignItems: "center", background: timerUrgent ? "#7f1d1d44" : "#1e1b4b", border: `2px solid ${timerColor}`, borderRadius: 10, padding: "4px 18px", minWidth: 90 }}>
          <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: "0.6rem", color: "#94a3b8", letterSpacing: "0.12em" }}>TIME LEFT</div>
          <div style={{ fontFamily: "'Cinzel',serif", fontSize: "1.4rem", fontWeight: 900, color: timerColor, letterSpacing: "0.05em", lineHeight: 1 }}>{formatTime(timeLeft)}</div>
          {/* progress bar */}
          <div style={{ width: 70, height: 3, background: "#1e293b", borderRadius: 2, marginTop: 3, overflow: "hidden" }}>
            <div style={{ width: `${(timeLeft / GAME_DURATION) * 100}%`, height: "100%", background: timerColor, transition: "width 1s linear, background 1s" }} />
          </div>
        </div>

        <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: "0.95rem", color: "#94a3b8", whiteSpace: "nowrap" }}>
          Turn: <span style={{ color: "#f59e0b", fontWeight: 700 }}>{attacker.name}</span>
          {" · "}<span style={{ color: "#a78bfa" }}>{attacker.perk?.toUpperCase()}</span>
        </div>
      </div>

    {/* --- EDITED BATTLE CONTAINER --- */}
      <div className="battle-container">

        {/* Left Arsenal (Player 1) - With swipe to close */}
        <div className={`arsenal-wrapper arsenal-left ${leftOpen ? "open" : ""}`}
             onTouchStart={(e) => swipeStartRef.current = e.touches[0].clientX}
             onTouchEnd={(e) => { if (swipeStartRef.current && e.changedTouches[0].clientX < swipeStartRef.current - 40) setLeftOpen(false); }}>
          <Arsenal player={players[0]} isActive={battleTurn === 0} selectedWeapon={battleTurn === 0 ? selectedWeapon : null} onSelect={battleTurn === 0 ? setSelectedWeapon : null} />
          <button className="panel-toggle" style={{ left: '100%', top: '10%' }} onClick={() => setLeftOpen(false)}>◀</button>
        </div>
        {!leftOpen && (
          <button className="panel-toggle panel-toggle-left" onClick={() => { setLeftOpen(true); setRightOpen(false); }}>
            P1 ▶
          </button>
        )}

        {/* Middle Area with Zoom */}
        <div
          className="middle-area"
          onClick={(e) => { if (e.target === e.currentTarget && window.innerWidth <= 768) { setLeftOpen(false); setRightOpen(false); } }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="zoom-wrapper" style={{ transform: `scale(${zoom})` }}>

            {/* Selected Weapon Overlay */}
            {selectedWeapon && (
              <div style={{ background: "#1e1b4b", border: "1px solid #7c3aed", borderRadius: 8, padding: "10px 20px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", justifyContent: "center", width: "100%", maxWidth: 600 }}>
                <span style={{ fontFamily: "'Rajdhani',sans-serif", color: "#c4b5fd" }}>
                  {getWeaponInfo(selectedWeapon)?.label} — click a {isAttackWeapon ? "🔴 enemy tile" : "🟢 own tile"}
                </span>
                {selectedWeapon === "missile" && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={(e) => { e.stopPropagation(); setMissileDir("row"); }} style={{ background: missileDir === "row" ? "#7c3aed" : "#312e81", color: "#e2e8f0", border: "none", borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontFamily: "'Rajdhani',sans-serif" }}>→ Row</button>
                    <button onClick={(e) => { e.stopPropagation(); setMissileDir("col"); }} style={{ background: missileDir === "col" ? "#7c3aed" : "#312e81", color: "#e2e8f0", border: "none", borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontFamily: "'Rajdhani',sans-serif" }}>↓ Col</button>
                  </div>
                )}
                {selectedWeapon === "antimissile" && attacker.perk === "defend" && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={(e) => { e.stopPropagation(); setAmDir("row"); }} style={{ background: amDir === "row" ? "#7c3aed" : "#312e81", color: "#e2e8f0", border: "none", borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontFamily: "'Rajdhani',sans-serif" }}>→ Row</button>
                    <button onClick={(e) => { e.stopPropagation(); setAmDir("col"); }} style={{ background: amDir === "col" ? "#7c3aed" : "#312e81", color: "#e2e8f0", border: "none", borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontFamily: "'Rajdhani',sans-serif" }}>↓ Col</button>
                  </div>
                )}
                <button onClick={(e) => { e.stopPropagation(); setSelectedWeapon(null); setMissileDir(null); setAmDir(null); }} style={{ background: "#7f1d1d", color: "#fca5a5", border: "none", borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontFamily: "'Rajdhani',sans-serif" }}>✕ Cancel</button>
              </div>
            )}

            {/* The Grids */}
            <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap", justifyContent: "center" }}>
              {[0, 1].map(gi => (
                <div key={gi}>
                  <div style={{ textAlign: "center", marginBottom: 8, fontFamily: "'Rajdhani',sans-serif", fontSize: "0.95rem", color: gi === battleTurn ? "#a78bfa" : "#64748b" }}>
                    {players[gi].name} {gi === battleTurn ? "⚡" : ""}
                    <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                      Tiles: {players[gi].grid.flat().filter(t => !t.destroyed).length} · HP: {calcTotalHP(players[gi].grid)}
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

            {/* Battle Log */}
            <div style={{ width: "100%", maxWidth: 600, background: "#0d0d1a", border: "1px solid #1e293b", borderRadius: 8, padding: 10, maxHeight: 90, overflowY: "auto" }}>
              {log.length === 0
                ? <div style={{ color: "#475569", fontFamily: "'Rajdhani',sans-serif", fontSize: "0.8rem", textAlign: "center" }}>Battle log…</div>
                : log.map((l, i) => <div key={i} style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: "0.78rem", color: i === 0 ? "#c4b5fd" : "#475569", padding: "1px 0" }}>{l}</div>)
              }
            </div>

          </div>
        </div>

        {/* Right Arsenal (Player 2) - With swipe to close */}
        <div className={`arsenal-wrapper arsenal-right ${rightOpen ? "open" : ""}`}
             onTouchStart={(e) => swipeStartRef.current = e.touches[0].clientX}
             onTouchEnd={(e) => { if (swipeStartRef.current && e.changedTouches[0].clientX > swipeStartRef.current + 40) setRightOpen(false); }}>
          <Arsenal player={players[1]} isActive={battleTurn === 1} selectedWeapon={battleTurn === 1 ? selectedWeapon : null} onSelect={battleTurn === 1 ? setSelectedWeapon : null} />
          <button className="panel-toggle" style={{ right: '100%', top: '10%' }} onClick={() => setRightOpen(false)}>▶</button>
        </div>
        {!rightOpen && (
          <button className="panel-toggle panel-toggle-right" onClick={() => { setRightOpen(true); setLeftOpen(false); }}>
            ◀ P2
          </button>
        )}

        {/* Zoom Controls Overlay (Mobile Only) */}
        <div className="zoom-controls">
          <button className="zoom-btn" onClick={() => setZoom(z => Math.max(0.4, z - 0.15))}>-</button>
          <div style={{ color: "#a78bfa", fontFamily: "'Rajdhani',sans-serif", fontWeight: "bold", width: "45px", textAlign: "center" }}>{Math.round(zoom * 100)}%</div>
          <button className="zoom-btn" onClick={() => setZoom(z => Math.min(2, z + 0.15))}>+</button>
        </div>

      </div>
    </div>
  );
}

// ─── SUB-COMPONENTS ───────────────────────────────────────────────────────────

function Intro({ onStart }) {
  return (
    <div style={{ minHeight: "100vh", background: "radial-gradient(ellipse at center, #1a1035 0%, #0a0a1a 100%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Cinzel', serif", color: "#e2e8f0" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&family=Rajdhani:wght@400;600&display=swap');*{box-sizing:border-box;}`}</style>
      <div style={{ textAlign: "center", padding: 40 }}>
        <div style={{ fontSize: "4rem", marginBottom: 16 }}>⚔️</div>
        <h1 style={{ fontSize: "3.5rem", fontWeight: 900, color: "#a78bfa", textShadow: "0 0 40px #7c3aed", letterSpacing: "0.2em", marginBottom: 8 }}>TILE CLASH</h1>
        <p style={{ fontFamily: "'Rajdhani', sans-serif", color: "#64748b", fontSize: "1rem", marginBottom: 40, letterSpacing: "0.1em" }}>2-PLAYER TACTICAL WARFARE · 5 MINUTE ROUNDS</p>
        <div style={{ display: "flex", gap: 16, justifyContent: "center", marginBottom: 48, flexWrap: "wrap" }}>
          {[["🔥","Attack","Boost your offensive weapons"],["🛡️","Defend","Strengthen your defenses"],["💚","Heal","Amplify your recovery"],["💎","Steal","Take an enemy weapon (Ultra Rare)"]].map(([ic, name, desc]) => (
            <div key={name} style={{ background: "#1a1a2e", border: "1px solid #312e81", borderRadius: 12, padding: "16px 20px", width: 140, textAlign: "center" }}>
              <div style={{ fontSize: "1.8rem" }}>{ic}</div>
              <div style={{ color: "#a78bfa", fontWeight: 700, fontSize: "0.9rem", marginTop: 4 }}>{name}</div>
              <div style={{ fontFamily: "'Rajdhani',sans-serif", color: "#64748b", fontSize: "0.72rem", marginTop: 4 }}>{desc}</div>
            </div>
          ))}
        </div>
        <div style={{ fontFamily: "'Rajdhani',sans-serif", color: "#475569", fontSize: "0.8rem", marginBottom: 24 }}>⏱️ If time runs out, the player with the most total tile HP wins</div>
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
        {Object.keys(player.weapons).length > 0 && (
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 24, flexWrap: "wrap" }}>
            {Object.entries(player.weapons).map(([wid, lvl]) => {
              const info = getWeaponInfo(wid);
              return <div key={wid} style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, padding: "6px 12px", fontFamily: "'Rajdhani',sans-serif", fontSize: "0.8rem", color: "#94a3b8" }}>{info?.label} {"⭐".repeat(lvl)}</div>;
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
            return (
              <button key={wid} onClick={() => onSteal(wid)} style={{ background: "#1a1a2e", border: "2px solid #f59e0b44", borderRadius: 12, padding: "16px 20px", textAlign: "center", cursor: "pointer", transition: "all 0.2s", color: "#e2e8f0", minWidth: 130 }}
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
      {Object.keys(player.weapons).length === 0 && <div style={{ color: "#334155", fontFamily: "'Rajdhani',sans-serif", fontSize: "0.7rem", textAlign: "center", marginTop: 20 }}>No weapons</div>}
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
        const bg = tile.destroyed ? "#0f0f0f" : `linear-gradient(135deg, ${hpColor(tile.hp, tile.maxHp)}22 0%, #1a1a2e 100%)`;
        const missilePending = selectedWeapon === "missile" && !missileDir;
        const amPending = selectedWeapon === "antimissile" && attackerPerk === "defend" && !amDir;
        const clickable = canTarget && ((info?.id === "expand" ? tile.destroyed : !tile.destroyed) || info?.id === "rocket");
        const ready = clickable && !missilePending && !amPending;

        return (
          <div key={`${r}-${c}`} onClick={() => ready && onTileClick(r, c)}
            style={{ width: 52, height: 52, borderRadius: 6, background: bg, border: `1px solid ${tile.destroyed ? "#1a1a1a" : tile.shield > 0 ? "#fbbf24" : tile.antimissile ? "#06b6d4" : tile.steel ? "#94a3b8" : "#1e293b"}`, cursor: ready ? "pointer" : "default", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", position: "relative", transition: "all 0.15s", opacity: tile.destroyed ? 0.25 : 1, filter: ready ? "brightness(1.1)" : "brightness(1)", boxShadow: ready ? `0 0 8px ${info?.type === "a" ? "#ef444488" : info?.type === "d" ? "#3b82f688" : "#22c55e88"}` : "none" }}>
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

function GameOver({ winner, winReason, timeoutScores, players, onRestart }) {
  const isDraw = winner === null;
  return (
    <div style={{ minHeight: "100vh", background: `radial-gradient(ellipse at center, ${isDraw ? "#1a1a2e" : winReason === "timeout" ? "#1a2e1a" : "#1a3520"} 0%, #0a0a1a 100%)`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Cinzel', serif", color: "#e2e8f0" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&family=Rajdhani:wght@400;600&display=swap');*{box-sizing:border-box;}`}</style>
      <div style={{ textAlign: "center", padding: 40 }}>
        <div style={{ fontSize: "4rem", marginBottom: 16 }}>{isDraw ? "🤝" : winReason === "timeout" ? "⏱️" : "🏆"}</div>
        <h2 style={{ fontSize: "3rem", color: isDraw ? "#94a3b8" : "#4ade80", textShadow: `0 0 40px ${isDraw ? "#94a3b8" : "#22c55e"}`, letterSpacing: "0.15em", marginBottom: 8 }}>
          {isDraw ? "DRAW" : "VICTORY"}
        </h2>
        {!isDraw && <p style={{ color: "#a78bfa", fontSize: "1.5rem", marginBottom: 16 }}>{winner.name} wins!</p>}
        {winReason === "timeout" && (
          <div style={{ background: "#1e1b4b", border: "1px solid #7c3aed44", borderRadius: 12, padding: "16px 32px", marginBottom: 28, display: "inline-block" }}>
            <div style={{ fontFamily: "'Rajdhani',sans-serif", color: "#64748b", fontSize: "0.75rem", letterSpacing: "0.12em", marginBottom: 8 }}>TIME EXPIRED · HP TALLY</div>
            <div style={{ display: "flex", gap: 32, justifyContent: "center" }}>
              {[0, 1].map(i => (
                <div key={i} style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: "0.8rem", color: winner && players[i].name === winner.name ? "#4ade80" : "#94a3b8", marginBottom: 4 }}>
                    {players[i].name} {winner && players[i].name === winner.name ? "👑" : ""}
                  </div>
                  <div style={{ fontSize: "1.8rem", fontWeight: 900, color: winner && players[i].name === winner.name ? "#4ade80" : "#f87171" }}>
                    {i === 0 ? timeoutScores?.hp0 : timeoutScores?.hp1}
                  </div>
                  <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: "0.65rem", color: "#475569" }}>TOTAL HP</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {winReason === "elimination" && (
          <p style={{ fontFamily: "'Rajdhani',sans-serif", color: "#64748b", fontSize: "0.85rem", marginBottom: 28 }}>All enemy tiles destroyed</p>
        )}
        <button onClick={onRestart} style={{ background: "linear-gradient(135deg, #7c3aed, #4c1d95)", color: "#fff", border: "none", borderRadius: 12, padding: "14px 40px", fontSize: "1rem", fontFamily: "'Cinzel',serif", fontWeight: 700, cursor: "pointer", letterSpacing: "0.1em", boxShadow: "0 0 25px #7c3aed88" }}>
          Play Again
        </button>
      </div>
    </div>
  );
}
