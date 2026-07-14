(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const overlay = document.getElementById("overlay");
  const panel = document.getElementById("panel");
  const panelTitle = document.getElementById("panelTitle");
  const panelBody = document.getElementById("panelBody");
  const startBtn = document.getElementById("startBtn");
  const hud = document.getElementById("hud");
  const levelValue = document.getElementById("levelValue");
  const caughtValue = document.getElementById("caughtValue");
  const missValue = document.getElementById("missValue");
  const hint = document.getElementById("hint");

  const W = canvas.width;
  const H = canvas.height;
  const GROUND_Y = H - 78;
  const TREE_COUNT = 6;
  const APPLES_TO_ADVANCE = 10;
  const MAX_MISSES = 3;
  const MAX_LEVEL = 10;
  const PLAYER_SPEED = 420;

  const keys = { left: false, right: false };

  let state = "title"; // title | playing | levelup | demote | win
  let level = 1;
  let caught = 0;
  let misses = 0;
  let playerX = W / 2;
  let playerFacing = 1;
  let trees = [];
  let falling = [];
  let particles = [];
  let floatTexts = [];
  let lastTime = 0;
  let spawnTimer = 0;
  let shakeMessage = null;
  let animT = 0;
  let hintHidden = false;

  function levelConfig(lvl) {
    const concurrent = Math.min(1 + Math.floor((lvl - 1) / 2), 5);
    const fallSpeed = 110 + lvl * 28;
    const spawnInterval = Math.max(0.45, 1.55 - lvl * 0.11);
    return { concurrent, fallSpeed, spawnInterval };
  }

  function createTrees() {
    trees = [];
    const margin = 90;
    const span = W - margin * 2;
    for (let i = 0; i < TREE_COUNT; i++) {
      const x = margin + (span / (TREE_COUNT - 1)) * i;
      const height = 150 + ((i * 37) % 40);
      const canopyR = 58 + ((i * 13) % 18);
      trees.push({
        x,
        baseY: GROUND_Y,
        height,
        canopyR,
        shake: 0,
        apples: [],
      });
      refillTreeApples(trees[i]);
    }
  }

  function refillTreeApples(tree) {
    tree.apples = [];
    const count = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      const dist = tree.canopyR * (0.25 + Math.random() * 0.55);
      tree.apples.push({
        ox: Math.cos(angle) * dist,
        oy: Math.sin(angle) * dist * 0.7 - tree.canopyR * 0.15,
        size: 9 + Math.random() * 3,
      });
    }
  }

  function resetRound(keepLevel = true) {
    if (!keepLevel) level = 1;
    caught = 0;
    misses = 0;
    playerX = W / 2;
    falling = [];
    particles = [];
    floatTexts = [];
    spawnTimer = 0.4;
    createTrees();
    updateHud();
  }

  function updateHud() {
    levelValue.textContent = String(level);
    caughtValue.textContent = String(caught);
    missValue.textContent = String(misses);
  }

  function showOverlay(title, body, buttonLabel) {
    panelTitle.textContent = title;
    panelBody.textContent = body;
    startBtn.textContent = buttonLabel;
    overlay.classList.remove("is-hidden");
    // retrigger panel animation
    panel.style.animation = "none";
    void panel.offsetWidth;
    panel.style.animation = "";
  }

  function hideOverlay() {
    overlay.classList.add("is-hidden");
  }

  function startGame() {
    state = "playing";
    resetRound(false);
    hideOverlay();
    hud.hidden = false;
    if (!hintHidden) {
      setTimeout(() => {
        hint.classList.add("is-hidden");
        hintHidden = true;
      }, 3500);
    }
  }

  function resumeAfterPanel() {
    if (state === "win") {
      state = "title";
      showOverlay(
        "Ready to pick?",
        "Move with the left and right arrow keys. Catch ten apples to clear a level. Miss three and you drop back a level. Each level drops more apples, faster.",
        "Start Harvest"
      );
      hud.hidden = true;
      return;
    }
    state = "playing";
    falling = [];
    particles = [];
    floatTexts = [];
    spawnTimer = 0.35;
    hideOverlay();
  }

  function pickTreeForDrop() {
    const available = trees.filter((t) => t.apples.length > 0 && t.shake <= 0);
    if (available.length === 0) {
      trees.forEach(refillTreeApples);
      return trees[Math.floor(Math.random() * trees.length)];
    }
    return available[Math.floor(Math.random() * available.length)];
  }

  function spawnApple() {
    const cfg = levelConfig(level);
    if (falling.length >= cfg.concurrent) return;

    const tree = pickTreeForDrop();
    if (!tree.apples.length) refillTreeApples(tree);

    const appleIdx = Math.floor(Math.random() * tree.apples.length);
    const apple = tree.apples.splice(appleIdx, 1)[0];
    tree.shake = 0.55;

    const canopyY = tree.baseY - tree.height;
    falling.push({
      x: tree.x + apple.ox,
      y: canopyY + apple.oy,
      r: apple.size,
      vy: cfg.fallSpeed * (0.85 + Math.random() * 0.25),
      spin: Math.random() * Math.PI * 2,
      spinSpeed: (Math.random() - 0.5) * 8,
      caught: false,
      missed: false,
    });
  }

  function addParticles(x, y, color, count = 10) {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 40 + Math.random() * 120;
      particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 40,
        life: 0.4 + Math.random() * 0.35,
        maxLife: 0.75,
        color,
        size: 2 + Math.random() * 3,
      });
    }
  }

  function addFloatText(x, y, text, color) {
    floatTexts.push({ x, y, text, color, life: 0.9 });
  }

  function basketBounds() {
    // Basket sits in front of farmer, slightly below mid-body
    const basketW = 54;
    const basketH = 22;
    const basketX = playerX - basketW / 2 + playerFacing * 6;
    const basketY = GROUND_Y - 52;
    return { x: basketX, y: basketY, w: basketW, h: basketH };
  }

  function onCatch(apple) {
    apple.caught = true;
    caught += 1;
    updateHud();
    addParticles(apple.x, apple.y, "#e53935", 12);
    addParticles(apple.x, apple.y, "#ffeb3b", 6);
    addFloatText(apple.x, apple.y - 10, "+1", "#1b5e20");

    if (caught >= APPLES_TO_ADVANCE) {
      if (level >= MAX_LEVEL) {
        state = "win";
        showOverlay(
          "Orchard Champion!",
          "You cleared all ten levels. The trees are proud — and your basket is overflowing.",
          "Play Again"
        );
      } else {
        level += 1;
        caught = 0;
        misses = 0;
        updateHud();
        state = "levelup";
        const cfg = levelConfig(level);
        showOverlay(
          `Level ${level}!`,
          `Nice catch! Now up to ${cfg.concurrent} apple${cfg.concurrent > 1 ? "s" : ""} can fall at once, and they drop faster. Catch 10 more to advance.`,
          "Keep Going"
        );
      }
    }
  }

  function onMiss(apple) {
    apple.missed = true;
    misses += 1;
    updateHud();
    addParticles(apple.x, GROUND_Y - 8, "#8d6e4a", 8);
    addFloatText(apple.x, GROUND_Y - 30, "Miss!", "#c62828");

    if (misses >= MAX_MISSES) {
      if (level > 1) {
        level -= 1;
        caught = 0;
        misses = 0;
        updateHud();
        state = "demote";
        showOverlay(
          "Back a level",
          `Three misses! You're back on level ${level}. Catch 10 apples to move up again.`,
          "Try Again"
        );
      } else {
        caught = 0;
        misses = 0;
        updateHud();
        state = "demote";
        showOverlay(
          "Almost!",
          "Three misses on level 1. Shake it off and fill that basket — catch 10 to advance.",
          "Try Again"
        );
      }
    }
  }

  function update(dt) {
    animT += dt;

    if (state !== "playing") {
      // Still animate ambient trees / player idle
      trees.forEach((t) => {
        if (t.shake > 0) t.shake = Math.max(0, t.shake - dt);
      });
      updateParticles(dt);
      updateFloatTexts(dt);
      return;
    }

    // Movement
    let dx = 0;
    if (keys.left) dx -= 1;
    if (keys.right) dx += 1;
    if (dx !== 0) {
      playerFacing = dx;
      playerX += dx * PLAYER_SPEED * dt;
      playerX = Math.max(40, Math.min(W - 40, playerX));
    }

    // Tree shake decay
    trees.forEach((t) => {
      if (t.shake > 0) t.shake = Math.max(0, t.shake - dt);
    });

    // Spawn
    const cfg = levelConfig(level);
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnApple();
      spawnTimer = cfg.spawnInterval * (0.75 + Math.random() * 0.5);
    }

    // Falling apples
    const basket = basketBounds();
    for (const apple of falling) {
      if (state !== "playing") break;
      if (apple.caught || apple.missed) continue;
      apple.vy += 40 * dt; // slight gravity boost
      apple.y += apple.vy * dt;
      apple.spin += apple.spinSpeed * dt;

      // Catch check — apple center near basket opening
      const inX = apple.x > basket.x - 4 && apple.x < basket.x + basket.w + 4;
      const inY = apple.y + apple.r > basket.y && apple.y - apple.r < basket.y + basket.h + 8;
      if (inX && inY && apple.vy > 0) {
        onCatch(apple);
        continue;
      }

      if (apple.y - apple.r > GROUND_Y) {
        onMiss(apple);
      }
    }

    falling = falling.filter((a) => !a.caught && !a.missed);
    updateParticles(dt);
    updateFloatTexts(dt);
  }

  function updateParticles(dt) {
    for (const p of particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 180 * dt;
    }
    particles = particles.filter((p) => p.life > 0);
  }

  function updateFloatTexts(dt) {
    for (const f of floatTexts) {
      f.life -= dt;
      f.y -= 28 * dt;
    }
    floatTexts = floatTexts.filter((f) => f.life > 0);
  }

  // ——— Drawing ———

  function roundedRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function drawBackground() {
    // Sky already behind canvas; paint soft gradient for canvas clarity
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#7ec8e8");
    g.addColorStop(0.45, "#c5e8b5");
    g.addColorStop(0.72, "#8fbf5a");
    g.addColorStop(1, "#6a9e3c");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Distant hills
    ctx.fillStyle = "rgba(70, 140, 60, 0.35)";
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y - 40);
    ctx.quadraticCurveTo(W * 0.25, GROUND_Y - 90, W * 0.5, GROUND_Y - 50);
    ctx.quadraticCurveTo(W * 0.75, GROUND_Y - 100, W, GROUND_Y - 45);
    ctx.lineTo(W, GROUND_Y + 20);
    ctx.lineTo(0, GROUND_Y + 20);
    ctx.fill();

    // Ground
    ctx.fillStyle = "#5a9e3e";
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    ctx.fillStyle = "#4a8a32";
    for (let i = 0; i < 28; i++) {
      const gx = (i * 97 + animT * 8) % W;
      const gy = GROUND_Y + 10 + ((i * 31) % 50);
      ctx.fillRect(gx, gy, 3, 8);
    }

    // Soft sun
    ctx.beginPath();
    ctx.fillStyle = "rgba(255, 236, 150, 0.55)";
    ctx.arc(W - 110, 70, 48, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = "rgba(255, 248, 200, 0.9)";
    ctx.arc(W - 110, 70, 28, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawTree(tree) {
    const shakeX = tree.shake > 0 ? Math.sin(animT * 42) * 6 * tree.shake : 0;
    const trunkTop = tree.baseY - tree.height;
    const canopyY = trunkTop;

    // Trunk
    ctx.fillStyle = "#6b4423";
    ctx.beginPath();
    ctx.moveTo(tree.x - 10 + shakeX * 0.2, tree.baseY);
    ctx.lineTo(tree.x - 6 + shakeX, trunkTop + 20);
    ctx.lineTo(tree.x + 6 + shakeX, trunkTop + 20);
    ctx.lineTo(tree.x + 12 + shakeX * 0.2, tree.baseY);
    ctx.closePath();
    ctx.fill();

    // Canopy layers
    const layers = [
      { dy: 8, r: tree.canopyR * 1.05, c: "#1b5e20" },
      { dy: -6, r: tree.canopyR * 0.92, c: "#2e7d32" },
      { dy: -22, r: tree.canopyR * 0.72, c: "#43a047" },
    ];
    for (const layer of layers) {
      ctx.beginPath();
      ctx.fillStyle = layer.c;
      ctx.ellipse(
        tree.x + shakeX,
        canopyY + layer.dy,
        layer.r,
        layer.r * 0.78,
        0,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    // Hanging apples on tree
    for (const a of tree.apples) {
      drawApple(tree.x + a.ox + shakeX, canopyY + a.oy, a.size, 0);
    }
  }

  function drawApple(x, y, r, spin) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(spin);

    // Stem
    ctx.strokeStyle = "#5d4037";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.quadraticCurveTo(3, -r - 4, 5, -r - 8);
    ctx.stroke();

    // Leaf
    ctx.fillStyle = "#66bb6a";
    ctx.beginPath();
    ctx.ellipse(6, -r - 4, 5, 3, 0.6, 0, Math.PI * 2);
    ctx.fill();

    // Body
    const ag = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 1, 0, 0, r);
    ag.addColorStop(0, "#ff8a80");
    ag.addColorStop(0.45, "#e53935");
    ag.addColorStop(1, "#b71c1c");
    ctx.fillStyle = ag;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    // Highlight
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.ellipse(-r * 0.35, -r * 0.3, r * 0.28, r * 0.18, -0.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawFarmer() {
    const x = playerX;
    const feetY = GROUND_Y;
    const bob = Math.sin(animT * (keys.left || keys.right ? 14 : 3)) * (keys.left || keys.right ? 2.5 : 1);

    ctx.save();
    ctx.translate(x, feetY + bob);
    ctx.scale(playerFacing, 1);

    // Shadow
    ctx.fillStyle = "rgba(30, 60, 30, 0.25)";
    ctx.beginPath();
    ctx.ellipse(0, 0, 28, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Legs
    ctx.fillStyle = "#37474f";
    ctx.fillRect(-12, -28, 10, 28);
    ctx.fillRect(2, -28, 10, 28);

    // Boots
    ctx.fillStyle = "#5d4037";
    ctx.fillRect(-14, -6, 14, 8);
    ctx.fillRect(0, -6, 14, 8);

    // Body / overalls
    ctx.fillStyle = "#1565c0";
    roundedRect(ctx, -16, -68, 32, 42, 6);
    ctx.fill();

    // Shirt
    ctx.fillStyle = "#fff8e1";
    ctx.fillRect(-14, -68, 28, 14);

    // Overall straps
    ctx.fillStyle = "#0d47a1";
    ctx.fillRect(-12, -68, 6, 18);
    ctx.fillRect(6, -68, 6, 18);

    // Arm holding basket (front)
    ctx.fillStyle = "#ffcc80";
    ctx.fillRect(10, -58, 10, 22);

    // Basket
    const bx = 8;
    const by = -48;
    ctx.fillStyle = "#a1887f";
    ctx.beginPath();
    ctx.moveTo(bx - 20, by);
    ctx.lineTo(bx - 16, by + 20);
    ctx.quadraticCurveTo(bx + 8, by + 26, bx + 32, by + 20);
    ctx.lineTo(bx + 36, by);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#6d4c41";
    ctx.lineWidth = 2;
    ctx.stroke();
    // Basket rim
    ctx.fillStyle = "#8d6e63";
    ctx.fillRect(bx - 22, by - 4, 60, 8);
    // Weave lines
    ctx.strokeStyle = "rgba(62, 39, 35, 0.35)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(bx - 18 + i * 12, by + 2);
      ctx.lineTo(bx - 14 + i * 12, by + 18);
      ctx.stroke();
    }

    // Other arm
    ctx.fillStyle = "#ffcc80";
    ctx.fillRect(-20, -58, 9, 20);

    // Head
    ctx.fillStyle = "#ffcc80";
    ctx.beginPath();
    ctx.arc(0, -82, 16, 0, Math.PI * 2);
    ctx.fill();

    // Straw hat
    ctx.fillStyle = "#f9a825";
    ctx.beginPath();
    ctx.ellipse(0, -92, 26, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffb300";
    ctx.beginPath();
    ctx.ellipse(0, -98, 14, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ef6c00";
    ctx.fillRect(-14, -94, 28, 3);

    // Smile
    ctx.strokeStyle = "#6d4c41";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(2, -78, 5, 0.2, Math.PI - 0.2);
    ctx.stroke();

    // Eyes
    ctx.fillStyle = "#3e2723";
    ctx.beginPath();
    ctx.arc(4, -84, 2, 0, Math.PI * 2);
    ctx.arc(10, -84, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawFloatTexts() {
    ctx.font = "700 18px Fredoka, sans-serif";
    ctx.textAlign = "center";
    for (const f of floatTexts) {
      ctx.globalAlpha = Math.max(0, f.life / 0.9);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  function draw() {
    drawBackground();
    trees.forEach(drawTree);
    for (const apple of falling) {
      drawApple(apple.x, apple.y, apple.r, apple.spin);
    }
    drawFarmer();
    drawParticles();
    drawFloatTexts();

    // Ground line highlight
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    ctx.lineTo(W, GROUND_Y);
    ctx.stroke();
  }

  function loop(ts) {
    if (!lastTime) lastTime = ts;
    let dt = (ts - lastTime) / 1000;
    lastTime = ts;
    dt = Math.min(dt, 0.05);
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  // Input
  window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") {
      keys.left = true;
      e.preventDefault();
    } else if (e.key === "ArrowRight") {
      keys.right = true;
      e.preventDefault();
    }
  });

  window.addEventListener("keyup", (e) => {
    if (e.key === "ArrowLeft") keys.left = false;
    else if (e.key === "ArrowRight") keys.right = false;
  });

  startBtn.addEventListener("click", () => {
    if (state === "title" || state === "win") startGame();
    else resumeAfterPanel();
  });

  // Init ambient scene for title
  createTrees();
  updateHud();
  hud.hidden = true;
  requestAnimationFrame(loop);
})();
