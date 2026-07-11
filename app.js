/* =========================================================
   GIROU! — app.js
   Sem backend: perfis, roletas e histórico ficam salvos no
   localStorage do navegador. Sons são sintetizados via
   Web Audio API (nenhum arquivo de áudio externo).
   ========================================================= */

(() => {
  "use strict";

  /* ---------- constantes ---------- */
  const PALETTE = ["#E24B6B", "#31C9A6", "#E8B85C", "#8B6FE8", "#4FB6E8", "#F0805A"];
  const SPIN_DURATION_MS = 4800;
  const LS_USERS = "girou_users_v1";
  const LS_SESSION = "girou_session_v1";
  const LS_WHEELS = "girou_wheels_v1";

  const PRESETS = {
    simnao: ["Sim", "Não"],
    numeros10: Array.from({ length: 10 }, (_, i) => String(i + 1)),
    numeros20: Array.from({ length: 20 }, (_, i) => String(i + 1)),
    dias: ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"],
    grupos: ["Grupo A", "Grupo B", "Grupo C", "Grupo D"],
  };

  /* ---------- utilidades ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("is-visible");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("is-visible"), 2600);
  }

  function formatDate(ts) {
    try {
      return new Date(ts).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
    } catch (e) {
      return "";
    }
  }

  /* ---------- hashing simples de senha (client-side only) ---------- */
  async function sha256Hex(text) {
    const enc = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest("SHA-256", enc);
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
  }
  function randomSalt() {
    const arr = crypto.getRandomValues(new Uint8Array(12));
    return Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
  }

  /* ---------- storage: usuários ---------- */
  function getUsers() {
    try { return JSON.parse(localStorage.getItem(LS_USERS)) || {}; }
    catch (e) { return {}; }
  }
  function saveUsers(users) { localStorage.setItem(LS_USERS, JSON.stringify(users)); }

  function getSession() {
    try { return JSON.parse(localStorage.getItem(LS_SESSION)); }
    catch (e) { return null; }
  }
  function setSession(username) { localStorage.setItem(LS_SESSION, JSON.stringify({ username })); }
  function clearSession() { localStorage.removeItem(LS_SESSION); }

  /* ---------- storage: roletas ---------- */
  function getAllWheels() {
    try { return JSON.parse(localStorage.getItem(LS_WHEELS)) || {}; }
    catch (e) { return {}; }
  }
  function saveAllWheels(all) { localStorage.setItem(LS_WHEELS, JSON.stringify(all)); }
  function getWheelsForUser(username) {
    const all = getAllWheels();
    return all[username] || [];
  }
  function setWheelsForUser(username, wheels) {
    const all = getAllWheels();
    all[username] = wheels;
    saveAllWheels(all);
  }

  /* ---------- estado da aplicação ---------- */
  const state = {
    currentUser: null,       // username logado
    editingWheelId: null,    // null = nova roleta
    editorItems: [],         // [{id,label}]
    spinWheelId: null,
    isSpinning: false,
    currentRotationDeg: 0,
  };

  /* ---------- navegação entre telas ---------- */
  function showScreen(name) {
    $$(".screen").forEach(s => s.classList.add("is-hidden"));
    $(`#screen-${name}`).classList.remove("is-hidden");
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  }

  /* =========================================================
     WHEEL SVG — geometria compartilhada
     ========================================================= */
  function pointOnCircle(angleDeg, radius, center) {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: center + radius * Math.sin(rad), y: center - radius * Math.cos(rad) };
  }

  function truncateLabel(label, n) {
    let max = 16;
    if (n > 6) max = 13;
    if (n > 10) max = 10;
    if (n > 16) max = 7;
    if (n > 24) max = 5;
    if (label.length <= max) return label;
    return label.slice(0, max - 1).trimEnd() + "…";
  }

  /**
   * Gera o markup SVG (<path> + <text>) dos segmentos de uma roleta.
   * items: array de strings (labels). Se vazio, desenha placeholder.
   */
  function buildWheelMarkup(items, size, opts = {}) {
    const { showLabels = true, decorative = false } = opts;
    const center = size / 2;
    const radius = center - size * 0.015;
    const n = Math.max(items.length, decorative ? 8 : 1);
    const segAngle = 360 / n;
    let markup = "";

    for (let i = 0; i < n; i++) {
      const start = i * segAngle;
      const end = (i + 1) * segAngle;
      const p1 = pointOnCircle(start, radius, center);
      const p2 = pointOnCircle(end, radius, center);
      const largeArc = segAngle > 180 ? 1 : 0;
      const color = PALETTE[i % PALETTE.length];
      markup += `<path d="M ${center} ${center} L ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} A ${radius.toFixed(2)} ${radius.toFixed(2)} 0 ${largeArc} 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)} Z" fill="${color}" stroke="#12101F" stroke-width="${(size * 0.006).toFixed(2)}"></path>`;

      if (showLabels && !decorative && items[i] !== undefined) {
        const mid = start + segAngle / 2;
        const flip = mid > 90 && mid < 270;
        const rot = flip ? mid + 180 : mid;
        const anchor = flip ? "end" : "start";
        const startRadius = flip ? radius * 0.92 : radius * 0.24;
        const p = pointOnCircle(mid, startRadius, center);
        const fontSize = Math.max(size * (n > 16 ? 0.028 : n > 8 ? 0.036 : 0.044), 9);
        const label = escapeHtml(truncateLabel(String(items[i]), n));
        markup += `<text transform="translate(${p.x.toFixed(2)} ${p.y.toFixed(2)}) rotate(${rot.toFixed(2)})" text-anchor="${anchor}" dominant-baseline="middle" font-size="${fontSize.toFixed(1)}" font-family="Space Grotesk, sans-serif" font-weight="600" fill="#12101F">${label}</text>`;
      }
    }
    return markup;
  }

  function renderMiniWheel() {
    $("#miniWheelSegments").innerHTML = buildWheelMarkup([], 200, { decorative: true });
  }

  function renderPreviewWheel() {
    const g = $("#previewWheelSegments");
    if (state.editorItems.length === 0) {
      g.innerHTML = buildWheelMarkup([], 200, { decorative: true });
    } else {
      g.innerHTML = buildWheelMarkup(state.editorItems.map(i => i.label || "?"), 200);
    }
  }

  let spinItemsSnapshot = [];
  function renderSpinWheel(wheel) {
    spinItemsSnapshot = wheel.items.map(i => i.label);
    $("#wheelSegments").innerHTML = buildWheelMarkup(spinItemsSnapshot, 400);
  }

  /* =========================================================
     ÁUDIO — sintetizado via Web Audio API
     ========================================================= */
  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audioCtx = new Ctx();
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  function playTick() {
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "square";
    osc.frequency.value = 1100 + Math.random() * 180;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.045);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.05);
  }

  function playNote(freq, startTime, duration, type = "sine") {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(0.22, startTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.05);
  }

  function playFanfare() {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => playNote(freq, now + i * 0.11, 0.32, i === notes.length - 1 ? "triangle" : "sine"));
  }

  /* =========================================================
     CONFETE
     ========================================================= */
  function launchConfetti() {
    const layer = $("#confettiLayer");
    layer.innerHTML = "";
    const count = 70;
    for (let i = 0; i < count; i++) {
      const piece = document.createElement("div");
      piece.className = "confetti-piece";
      piece.style.left = Math.random() * 100 + "%";
      piece.style.background = PALETTE[i % PALETTE.length];
      const dur = 2.2 + Math.random() * 1.6;
      const delay = Math.random() * 0.35;
      piece.style.animationDuration = dur + "s";
      piece.style.animationDelay = delay + "s";
      piece.style.borderRadius = Math.random() > 0.5 ? "50%" : "2px";
      layer.appendChild(piece);
    }
    setTimeout(() => { layer.innerHTML = ""; }, 4200);
  }

  /* =========================================================
     AUTENTICAÇÃO
     ========================================================= */
  function initAuthTabs() {
    $$(".auth-tab").forEach(tab => {
      tab.addEventListener("click", () => {
        $$(".auth-tab").forEach(t => { t.classList.remove("is-active"); t.setAttribute("aria-selected", "false"); });
        tab.classList.add("is-active");
        tab.setAttribute("aria-selected", "true");
        const target = tab.dataset.tab;
        $("#loginForm").classList.toggle("is-hidden", target !== "login");
        $("#registerForm").classList.toggle("is-hidden", target !== "register");
        $("#loginError").textContent = "";
        $("#registerError").textContent = "";
      });
    });
  }

  async function handleRegister(e) {
    e.preventDefault();
    const displayName = $("#regDisplayName").value.trim();
    const usernameRaw = $("#regUsername").value.trim();
    const username = usernameRaw.toLowerCase().replace(/\s+/g, "");
    const password = $("#regPassword").value;
    const errEl = $("#registerError");
    errEl.textContent = "";

    if (!displayName || !username || !password) { errEl.textContent = "Preencha todos os campos."; return; }
    if (password.length < 4) { errEl.textContent = "A senha precisa ter pelo menos 4 caracteres."; return; }
    if (!/^[a-z0-9._-]+$/.test(username)) { errEl.textContent = "Usuário: use apenas letras, números, ponto, traço ou underline."; return; }

    const users = getUsers();
    if (users[username]) { errEl.textContent = "Esse usuário já existe. Tente outro ou faça login."; return; }

    const salt = randomSalt();
    const hash = await sha256Hex(salt + password);
    users[username] = { displayName, salt, hash, createdAt: Date.now() };
    saveUsers(users);
    setSession(username);
    toast(`Perfil criado! Bem-vindo(a), ${displayName}.`);
    enterApp(username);
  }

  async function handleLogin(e) {
    e.preventDefault();
    const usernameRaw = $("#loginUsername").value.trim();
    const username = usernameRaw.toLowerCase().replace(/\s+/g, "");
    const password = $("#loginPassword").value;
    const errEl = $("#loginError");
    errEl.textContent = "";

    const users = getUsers();
    const user = users[username];
    if (!user) { errEl.textContent = "Usuário não encontrado neste navegador."; return; }
    const hash = await sha256Hex(user.salt + password);
    if (hash !== user.hash) { errEl.textContent = "Senha incorreta."; return; }

    setSession(username);
    toast(`Bem-vindo(a) de volta, ${user.displayName}!`);
    enterApp(username);
  }

  function handleLogout() {
    clearSession();
    state.currentUser = null;
    $("#loginForm").reset();
    $("#registerForm").reset();
    showScreen("auth");
  }

  function enterApp(username) {
    state.currentUser = username;
    const users = getUsers();
    const displayName = users[username] ? users[username].displayName : username;
    $("#dashUserName").textContent = displayName;
    renderDashboard();
    showScreen("dashboard");
  }

  /* =========================================================
     DASHBOARD
     ========================================================= */
  function renderDashboard() {
    const wheels = getWheelsForUser(state.currentUser).sort((a, b) => b.updatedAt - a.updatedAt);
    const grid = $("#wheelGrid");
    $("#dashSubtitle").textContent = wheels.length
      ? `Você tem ${wheels.length} roleta${wheels.length > 1 ? "s" : ""} salva${wheels.length > 1 ? "s" : ""}.`
      : "Ainda não há roletas por aqui — crie a primeira.";

    grid.innerHTML = "";

    const newCard = document.createElement("button");
    newCard.className = "wheel-card wheel-card-new";
    newCard.innerHTML = `<span class="wheel-card-new-plus">+</span><span>Nova roleta</span>`;
    newCard.addEventListener("click", () => openEditor(null));
    grid.appendChild(newCard);

    wheels.forEach(wheel => {
      const card = document.createElement("div");
      card.className = "wheel-card";
      card.innerHTML = `
        <div class="wheel-card-swatch"></div>
        <div>
          <div class="wheel-card-title">${escapeHtml(wheel.title || "Sem título")}</div>
          <div class="wheel-card-meta">${wheel.items.length} itens · atualizada em ${formatDate(wheel.updatedAt)}</div>
        </div>
        <div class="wheel-card-actions">
          <button class="btn btn-primary btn-spin-card">Girar</button>
          <button class="btn btn-secondary btn-edit-card">Editar</button>
        </div>
      `;
      card.querySelector(".btn-spin-card").addEventListener("click", () => openSpin(wheel.id));
      card.querySelector(".btn-edit-card").addEventListener("click", () => openEditor(wheel.id));
      grid.appendChild(card);
    });
  }

  /* =========================================================
     EDITOR
     ========================================================= */
  function openEditor(wheelId) {
    state.editingWheelId = wheelId;
    const deleteBtn = $("#deleteWheelBtn");

    if (wheelId) {
      const wheel = getWheelsForUser(state.currentUser).find(w => w.id === wheelId);
      if (!wheel) { toast("Roleta não encontrada."); showScreen("dashboard"); return; }
      $("#editorHeading").textContent = "Editar roleta";
      $("#wheelTitleInput").value = wheel.title || "";
      state.editorItems = wheel.items.map(i => ({ id: i.id || uid(), label: i.label }));
      deleteBtn.classList.remove("is-hidden");
    } else {
      $("#editorHeading").textContent = "Nova roleta";
      $("#wheelTitleInput").value = "";
      state.editorItems = [];
      deleteBtn.classList.add("is-hidden");
    }

    $("#editorError").textContent = "";
    $("#bulkTextarea").value = "";
    $("#newItemInput").value = "";
    renderItemsList();
    renderPreviewWheel();
    showScreen("editor");
    setTimeout(() => $("#wheelTitleInput").focus(), 50);
  }

  function renderItemsList() {
    const list = $("#itemsList");
    list.innerHTML = "";
    state.editorItems.forEach((item, idx) => {
      const li = document.createElement("li");
      li.className = "item-row";
      const dot = document.createElement("span");
      dot.className = "item-row-dot";
      dot.style.background = PALETTE[idx % PALETTE.length];
      const input = document.createElement("input");
      input.type = "text";
      input.value = item.label;
      input.setAttribute("aria-label", `Item ${idx + 1}`);
      input.addEventListener("input", () => {
        item.label = input.value;
        renderPreviewWheel();
      });
      const removeBtn = document.createElement("button");
      removeBtn.className = "item-row-remove";
      removeBtn.type = "button";
      removeBtn.setAttribute("aria-label", "Remover item");
      removeBtn.textContent = "×";
      removeBtn.addEventListener("click", () => {
        state.editorItems.splice(idx, 1);
        renderItemsList();
        renderPreviewWheel();
      });
      li.append(dot, input, removeBtn);
      list.appendChild(li);
    });
    $("#itemsCount").textContent = `${state.editorItems.length} ${state.editorItems.length === 1 ? "item" : "itens"}`;
  }

  function addEditorItem(label) {
    const trimmed = label.trim();
    if (!trimmed) return;
    state.editorItems.push({ id: uid(), label: trimmed });
    renderItemsList();
    renderPreviewWheel();
  }

  function saveWheel({ andSpin = false } = {}) {
    const errEl = $("#editorError");
    errEl.textContent = "";
    const title = $("#wheelTitleInput").value.trim() || "Roleta sem título";
    const items = state.editorItems.filter(i => i.label.trim());

    if (items.length < 2) {
      errEl.textContent = "Adicione pelo menos 2 itens para poder sortear.";
      return;
    }

    const wheels = getWheelsForUser(state.currentUser);
    let wheel;
    if (state.editingWheelId) {
      wheel = wheels.find(w => w.id === state.editingWheelId);
      wheel.title = title;
      wheel.items = items;
      wheel.updatedAt = Date.now();
    } else {
      wheel = { id: uid(), title, items, createdAt: Date.now(), updatedAt: Date.now(), spinHistory: [] };
      wheels.push(wheel);
      state.editingWheelId = wheel.id;
    }
    setWheelsForUser(state.currentUser, wheels);
    toast("Roleta salva!");

    if (andSpin) {
      openSpin(wheel.id);
    } else {
      renderDashboard();
      showScreen("dashboard");
    }
  }

  function deleteWheel() {
    if (!state.editingWheelId) return;
    if (!confirm("Excluir esta roleta? Essa ação não pode ser desfeita.")) return;
    const wheels = getWheelsForUser(state.currentUser).filter(w => w.id !== state.editingWheelId);
    setWheelsForUser(state.currentUser, wheels);
    toast("Roleta excluída.");
    state.editingWheelId = null;
    renderDashboard();
    showScreen("dashboard");
  }

  /* =========================================================
     TELA DE GIRO
     ========================================================= */
  function getCurrentSpinWheel() {
    return getWheelsForUser(state.currentUser).find(w => w.id === state.spinWheelId);
  }

  function openSpin(wheelId) {
    const wheel = getWheelsForUser(state.currentUser).find(w => w.id === wheelId);
    if (!wheel) { toast("Roleta não encontrada."); showScreen("dashboard"); return; }
    if (wheel.items.length < 2) { toast("Essa roleta precisa de pelo menos 2 itens."); openEditor(wheelId); return; }

    state.spinWheelId = wheelId;
    state.currentRotationDeg = 0;
    state.isSpinning = false;

    const svg = $("#wheelSvg");
    svg.classList.remove("is-spinning");
    svg.style.transform = "rotate(0deg)";

    $("#spinWheelTitle").textContent = wheel.title;
    renderSpinWheel(wheel);
    renderHistory(wheel);
    $("#resultOverlay").classList.add("is-hidden");
    showScreen("spin");
  }

  function renderHistory(wheel) {
    const list = $("#historyList");
    list.innerHTML = "";
    if (!wheel.spinHistory || wheel.spinHistory.length === 0) {
      list.innerHTML = `<li class="history-empty">Nenhum sorteio ainda. Gire a roleta!</li>`;
      return;
    }
    wheel.spinHistory.slice().reverse().slice(0, 12).forEach(entry => {
      const li = document.createElement("li");
      li.textContent = entry.label;
      list.appendChild(li);
    });
  }

  function recordHistory(label) {
    const wheels = getWheelsForUser(state.currentUser);
    const wheel = wheels.find(w => w.id === state.spinWheelId);
    if (!wheel) return;
    wheel.spinHistory = wheel.spinHistory || [];
    wheel.spinHistory.push({ label, ts: Date.now() });
    setWheelsForUser(state.currentUser, wheels);
    renderHistory(wheel);
  }

  function scheduleTicks(fromDeg, toDeg, durationMs, segAngle) {
    const totalDelta = toDeg - fromDeg;
    if (totalDelta <= 0 || segAngle <= 0) return;
    const firstBoundary = Math.ceil(fromDeg / segAngle) * segAngle;
    let lastTickTime = -1000;
    for (let b = firstBoundary; b <= toDeg; b += segAngle) {
      const x = (b - fromDeg) / totalDelta;
      const t = 1 - Math.pow(1 - x, 1 / 3); // inverso aproximado do ease-out cúbico
      const timeMs = t * durationMs;
      if (timeMs - lastTickTime < 25) continue;
      lastTickTime = timeMs;
      setTimeout(playTick, timeMs);
    }
  }

  function spinWheel() {
    if (state.isSpinning) return;
    const wheel = getCurrentSpinWheel();
    if (!wheel || wheel.items.length < 2) return;

    ensureAudio();
    state.isSpinning = true;

    const svg = $("#wheelSvg");
    const n = spinItemsSnapshot.length;
    const segAngle = 360 / n;

    // normaliza a rotação atual para evitar números gigantescos, sem salto visual
    const normalized = ((state.currentRotationDeg % 360) + 360) % 360;
    svg.classList.remove("is-spinning");
    svg.style.transform = `rotate(${normalized}deg)`;
    void svg.getBoundingClientRect(); // força reflow
    state.currentRotationDeg = normalized;

    const spins = 4 + Math.floor(Math.random() * 3); // 4 a 6 voltas completas
    const extra = Math.random() * 360;
    const target = state.currentRotationDeg + spins * 360 + extra;

    scheduleTicks(state.currentRotationDeg, target, SPIN_DURATION_MS, segAngle);

    requestAnimationFrame(() => {
      svg.classList.add("is-spinning");
      svg.style.transform = `rotate(${target}deg)`;
    });

    const startRotation = state.currentRotationDeg;
    state.currentRotationDeg = target;

    setTimeout(() => onSpinEnd(target, segAngle), SPIN_DURATION_MS + 80);
  }

  function onSpinEnd(finalDeg, segAngle) {
    state.isSpinning = false;
    const rest = ((finalDeg % 360) + 360) % 360;
    const topLocalAngle = (360 - rest) % 360;
    const idx = Math.min(Math.floor(topLocalAngle / segAngle), spinItemsSnapshot.length - 1);
    const winner = spinItemsSnapshot[idx];

    $("#resultValue").textContent = winner;
    $("#resultOverlay").classList.remove("is-hidden");
    playFanfare();
    launchConfetti();
    recordHistory(winner);

    const canRemove = spinItemsSnapshot.length > 2;
    $("#removeAndSpinBtn").classList.toggle("is-hidden", !canRemove);
  }

  function closeResult() { $("#resultOverlay").classList.add("is-hidden"); }

  function removeWinnerAndSpin() {
    const label = $("#resultValue").textContent;
    const wheels = getWheelsForUser(state.currentUser);
    const wheel = wheels.find(w => w.id === state.spinWheelId);
    if (!wheel) return;
    const idx = wheel.items.findIndex(i => i.label === label);
    if (idx !== -1 && wheel.items.length > 2) {
      wheel.items.splice(idx, 1);
      wheel.updatedAt = Date.now();
      setWheelsForUser(state.currentUser, wheels);
    }
    closeResult();
    state.currentRotationDeg = 0;
    const svg = $("#wheelSvg");
    svg.classList.remove("is-spinning");
    svg.style.transform = "rotate(0deg)";
    void svg.getBoundingClientRect();
    renderSpinWheel(wheel);
    setTimeout(() => spinWheel(), 250);
  }

  /* =========================================================
     PRESETS & BULK ADD (editor)
     ========================================================= */
  function initEditorEvents() {
    $$(".chip[data-preset]").forEach(chip => {
      chip.addEventListener("click", () => {
        const key = chip.dataset.preset;
        (PRESETS[key] || []).forEach(addEditorItem);
        toast("Itens adicionados.");
      });
    });

    $("#bulkAddBtn").addEventListener("click", () => {
      const raw = $("#bulkTextarea").value;
      const lines = raw.split("\n").map(l => l.trim()).filter(Boolean);
      lines.forEach(addEditorItem);
      $("#bulkTextarea").value = "";
    });

    $("#addItemBtn").addEventListener("click", () => {
      const input = $("#newItemInput");
      addEditorItem(input.value);
      input.value = "";
      input.focus();
    });

    $("#newItemInput").addEventListener("keydown", e => {
      if (e.key === "Enter") {
        e.preventDefault();
        const input = e.target;
        addEditorItem(input.value);
        input.value = "";
      }
    });

    $("#wheelTitleInput").addEventListener("input", renderPreviewWheel);
    $("#saveWheelBtn").addEventListener("click", () => saveWheel({ andSpin: false }));
    $("#saveAndSpinBtn").addEventListener("click", () => saveWheel({ andSpin: true }));
    $("#deleteWheelBtn").addEventListener("click", deleteWheel);
    $("#editorBackBtn").addEventListener("click", () => { renderDashboard(); showScreen("dashboard"); });
  }

  /* =========================================================
     INICIALIZAÇÃO
     ========================================================= */
  function init() {
    renderMiniWheel();
    initAuthTabs();
    initEditorEvents();

    $("#loginForm").addEventListener("submit", handleLogin);
    $("#registerForm").addEventListener("submit", handleRegister);
    $("#logoutBtn").addEventListener("click", handleLogout);

    $("#spinBackBtn").addEventListener("click", () => { renderDashboard(); showScreen("dashboard"); });
    $("#editWheelFromSpinBtn").addEventListener("click", () => openEditor(state.spinWheelId));
    $("#spinBtn").addEventListener("click", spinWheel);
    $("#wheelHubBtn").addEventListener("click", spinWheel);
    $("#wheelCanvasWrap").addEventListener("click", spinWheel);
    $("#spinAgainBtn").addEventListener("click", closeResult);
    $("#removeAndSpinBtn").addEventListener("click", removeWinnerAndSpin);
    $("#closeResultBtn").addEventListener("click", closeResult);
    $("#clearHistoryBtn").addEventListener("click", () => {
      const wheels = getWheelsForUser(state.currentUser);
      const wheel = wheels.find(w => w.id === state.spinWheelId);
      if (!wheel) return;
      wheel.spinHistory = [];
      setWheelsForUser(state.currentUser, wheels);
      renderHistory(wheel);
    });

    document.addEventListener("keydown", e => {
      if (e.code !== "Space") return;
      const spinScreenVisible = !$("#screen-spin").classList.contains("is-hidden");
      const overlayOpen = !$("#resultOverlay").classList.contains("is-hidden");
      if (spinScreenVisible && !overlayOpen) {
        e.preventDefault();
        spinWheel();
      }
    });

    const session = getSession();
    const users = getUsers();
    if (session && users[session.username]) {
      enterApp(session.username);
    } else {
      showScreen("auth");
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
