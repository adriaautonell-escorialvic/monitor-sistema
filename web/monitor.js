// ── Canvi de tema fosc / clar ────────────────────────────────────────────────
const themeBtn  = document.getElementById('theme-btn');
const themeIcon = document.getElementById('theme-icon');
const themeText = document.getElementById('theme-text');

function applyTheme(light) {
  if (light) {
    document.documentElement.classList.add('light');
    themeIcon.textContent = 'dark_mode';
    themeText.textContent = 'Mode fosc';
  } else {
    document.documentElement.classList.remove('light');
    themeIcon.textContent = 'light_mode';
    themeText.textContent = 'Mode clar';
  }
  // Esperem 50ms perquè el CSS tingui temps de recalcular els colors
  // abans d'actualitzar les gràfiques
  setTimeout(applyChartTheme, 50);
}

// En carregar la pàgina, comprovem si l'usuari ja havia triat un tema. Si no, mirem què té configurat el sistema operatiu.
function initTheme() {
  const saved = localStorage.getItem('theme');
  if (saved) { applyTheme(saved === 'light'); }
  else { applyTheme(window.matchMedia('(prefers-color-scheme: light)').matches); }
}

// Quan es clica el botó, canviem el tema i el guardem al navegador
themeBtn.addEventListener('click', () => {
  const isLight = document.documentElement.classList.toggle('light');
  localStorage.setItem('theme', isLight ? 'light' : 'dark');
  applyTheme(isLight);
});



/* ── Mode configuració: amagar i mostrar targetes ────────────────────────────
   Quan l'usuari clica "Configuració", cada targeta mostra una icona d'ull.
   Clicant l'ull, la targeta s'amaga. La llista es guarda al localStorage
   per recordar-ho quan es torni a obrir la pàgina. */
const settingsBtn  = document.getElementById('settings-btn');
const settingsText = document.getElementById('settings-text');
const HIDDEN_KEY   = 'hiddenCards';   // clau que fem servir al localStorage

function loadHiddenCards() {
  try { return JSON.parse(localStorage.getItem(HIDDEN_KEY)) || []; }
  catch { return []; }
}

function saveHiddenCards(list) {
  localStorage.setItem(HIDDEN_KEY, JSON.stringify(list));
}

// Recorre totes les targetes i aplica l'estat correcte a cadascuna
function applyCardVisibility() {
  const hidden = loadHiddenCards();
  document.querySelectorAll('.card-wrap[data-card]').forEach(card => {
    const id = card.dataset.card;
    const isHidden = hidden.includes(id);
    card.classList.toggle('card-hidden', isHidden);
    // Canviem la icona de l'ull segons si la targeta és visible o amagada
    const eye = card.querySelector('.eye-icon');
    if (eye) eye.textContent = isHidden ? 'visibility_off' : 'visibility';
  });
}

// Afegeix o treu una targeta de la llista d'amagades i actualitza la vista
function toggleCardVisibility(cardEl) {
  const id     = cardEl.dataset.card;
  const hidden = loadHiddenCards();
  const idx    = hidden.indexOf(id);
  if (idx === -1) { 
    hidden.push(id); // no estava amagada: l'afegim
  } 
  else            
  { 
    hidden.splice(idx, 1);  // ja estava amagada: la traiem
  }
  saveHiddenCards(hidden);
  applyCardVisibility();
}

// Cada overlay d'ull escolta els clics per amagar/mostrar la seva targeta
document.querySelectorAll('.card-eye-overlay').forEach(overlay => {
  overlay.addEventListener('click', () => {
    const card = overlay.closest('.card-wrap[data-card]');
    if (card) toggleCardVisibility(card);
  });
});

// El botó "Configuració" activa/desactiva el mode d'edició visual
settingsBtn.addEventListener('click', () => {
  const active = document.body.classList.toggle('config-mode');
  settingsBtn.classList.toggle('active', active);
  settingsText.textContent = active ? 'Fet' : 'Configuració';
});

/* ── Gràfiques amb Chart.js ───────────────────────────────────────────────────

Creem dues gràfiques de línia (CPU i RAM) que s'actualitzen cada 2 segons amb les dades que arriben del servidor. */

// Llegeix el valor actual d'una variable CSS (colors del tema)
function getCssVar(v) {
  return getComputedStyle(document.documentElement).getPropertyValue(v).trim();
}

// Crea una gràfica de línia buida. La farcim de dades després a fetchStats()
function makeChart(canvasId, label, color) {
  const ctx = document.getElementById(canvasId).getContext('2d');
  return new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label,
        data: [],
        borderColor: color,
        backgroundColor: color + '22', // el '22' al final és l'opacitat en hexadecimal
        borderWidth: 2,
        pointRadius: 0,   // sense punts, només la línia
        tension: 0.3,     // corba suau
        fill: true,
      }]
    },
    options: {
      responsive: true,
      animation: false, // desactivem l'animació per màxima fluïdesa
      scales: {
        y: {
          min: 0, max: 100,
          ticks: { color: getCssVar('--text2'), callback: v => v + '%' },
          grid:  { color: getCssVar('--border') },
        },
        x: {
          ticks: { color: getCssVar('--text2'), maxTicksLimit: 8, maxRotation: 0 },
          grid:  { color: getCssVar('--border') },
        }
      },
      plugins: { legend: { display: false } }
    }
  });
}

// Quan canvia el tema, actualitzem els colors dels eixos de les gràfiques
function applyChartTheme() {
  [cpuChart, ramChart].forEach(ch => {
    if (!ch) return;
    const t2 = getCssVar('--text2');
    const br = getCssVar('--border');
    ch.options.scales.y.ticks.color = t2;
    ch.options.scales.y.grid.color  = br;
    ch.options.scales.x.ticks.color = t2;
    ch.options.scales.x.grid.color  = br;
    ch.update('none');
  });
}

// Creem les dues gràfiques amb els colors del tema actual
const cpuChart = makeChart('cpuChart', 'CPU %', getCssVar('--cpu-color'));
const ramChart = makeChart('ramChart', 'RAM %', getCssVar('--ram-color'));


// ── Botons de rang (1 min / 1 hora / 1 dia) ─────────────────────────────────
// Recordem quin rang té seleccionat cada gràfica
let cpuRange = 'minute';
let ramRange = 'minute';

// Connecta els botons de rang i crida onChange quan se'n clica un
function setupRangeBtns(containerId, onChange) {
  document.getElementById(containerId).querySelectorAll('.range-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      // Traiem la marca 'active' de tots i la posem només al que s'ha clicat
      document.getElementById(containerId).querySelectorAll('.range-btn')
        .forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      onChange(btn.dataset.range);
    });
  });
}

setupRangeBtns('cpu-range-btns', r => { cpuRange = r; });
setupRangeBtns('ram-range-btns', r => { ramRange = r; });

/* ── Funcions auxiliars ───────────────────────────────────────────────────────
Petites funcions d'ajuda per no repetir el mateix codi arreu. */

// Converteix gigabytes a text llegible (p.ex. 1.5 GB o 512 MB)
function fmtBytes(gb) {
  if (gb == null) return '–';
  if (gb < 1) return (gb * 1024).toFixed(0) + ' MB';
  return gb.toFixed(1) + ' GB';
}

// Pinta la barra de verd, groc o vermell segons el percentatge
function colorBar(el, pct) {
  const p = parseFloat(pct);
  el.style.background = p > 85
    ? getCssVar('--danger')   // més del 85%: vermell
    : p > 65
      ? getCssVar('--warn')   // entre 65% i 85%: groc
      : getCssVar('--accent2'); // menys del 65%: verd
}

// Actualitza una gràfica amb les noves etiquetes i valors
function updateChart(chart, labels, values) {
  chart.data.labels   = labels;
  chart.data.datasets[0].data = values;
  chart.update('none');
}

/* ── Bucle principal: demanem dades al servidor cada 2 segons ────────────────
fetchStats() fa una petició a /api/stats i actualitza tota la pàgina. Si el servidor no respon, posa el punt indicador en vermell. */

async function fetchStats() {
  try {
    const res = await fetch('/api/stats');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const d = await res.json();

    // Posem el punt en verd i mostrem l'hora de l'última actualització
    document.getElementById('dot').className = 'online';
    const now = new Date();
    document.getElementById('last-update').textContent =
      `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;

    // Targeta CPU
    const cpuPct = (d.cpu?.percent ?? 0).toFixed(1);
    document.getElementById('cpu-pct').textContent   = cpuPct + '%';
    document.getElementById('cpu-cores').textContent =
      `${d.cpu?.cores_logical ?? '?'} nuclis lògics · càrrega ${(d.load?.l1 ?? 0).toFixed(2)}`;
    const cpuBar = document.getElementById('cpu-bar');
    cpuBar.style.width = cpuPct + '%';
    colorBar(cpuBar, cpuPct);

    // Targeta RAM
    const ramPct = (d.ram?.percent ?? 0).toFixed(1);
    document.getElementById('ram-pct').textContent    = ramPct + '%';
    document.getElementById('ram-detail').textContent =
      `${fmtBytes(d.ram?.used_gb)} / ${fmtBytes(d.ram?.total_gb)} usats`;
    const ramBar = document.getElementById('ram-bar');
    ramBar.style.width = ramPct + '%';
    colorBar(ramBar, ramPct);

    // Targeta disc
    const diskPct = (d.disk?.percent ?? 0).toFixed(1);
    document.getElementById('disk-pct').textContent    = diskPct + '%';
    document.getElementById('disk-detail').textContent =
      `${fmtBytes(d.disk?.used_gb)} / ${fmtBytes(d.disk?.total_gb)} usats`;
    const diskBar = document.getElementById('disk-bar');
    diskBar.style.width = diskPct + '%';
    colorBar(diskBar, diskPct);

    // Targeta uptime i càrrega del sistema
    document.getElementById('uptime').textContent   = d.uptime || '–';
    document.getElementById('load-avg').textContent =
      `Càrrega: ${(d.load?.l1 ?? 0).toFixed(2)} · ${(d.load?.l5 ?? 0).toFixed(2)} · ${(d.load?.l15 ?? 0).toFixed(2)}`;

    // Gràfiques: agafem l'historial del rang que l'usuari té seleccionat
    const rangeKey = r => r === 'minute' ? 'minute' : r === 'hour' ? 'hour' : 'day';
    const cpuH = d.history?.[rangeKey(cpuRange)];
    const ramH = d.history?.[rangeKey(ramRange)];

    if (cpuH?.labels) updateChart(cpuChart, cpuH.labels, cpuH.cpu);
    if (ramH?.labels) updateChart(ramChart, ramH.labels, ramH.ram);

  } catch (e) {
    // Si el servidor no respon, posem el punt en vermell
    document.getElementById('dot').className = 'offline';
    document.getElementById('last-update').textContent = 'Error de connexió';
    console.error('fetchStats error:', e);
  }
}

/* ── Informació del maquinari (es carrega una sola vegada) ───────────────────

Aquestes dades no canvien mentre el servidor està engegat, no cal tornar-les a demanar cada 2 segons. */
async function loadSysinfo() {
  try {
    const res = await fetch('/api/sysinfo');
    if (!res.ok) return;
    const d = await res.json();
    // Funció auxiliar per escriure un valor a un element pel seu ID
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val || '–';
    };
    set('si-hostname',   d.hostname);
    set('si-distro',     d.distro);
    set('si-kernel',     d.kernel);
    set('si-arch',       d.arch);
    set('si-ip',         d.ip);
    set('si-cpu-model',  d.cpu_model);
    set('si-cores-phys', d.cores_physical ? d.cores_physical + ' nuclis' : '–');
    set('si-cores-log',  d.cores_logical  ? d.cores_logical  + ' nuclis' : '–');
    set('si-freq',       d.cpu_freq_mhz   ? d.cpu_freq_mhz + ' MHz'     : '–');
    set('si-freq-max',   d.cpu_freq_max   ? d.cpu_freq_max  + ' MHz'     : '–');
    set('si-ram-total',  d.ram_total_gb   ? fmtBytes(d.ram_total_gb)     : '–');
    set('si-python',     d.python);
  } catch (e) {
    console.error('loadSysinfo error:', e);
  }
}

// ── Posada en marxa ──────────────────────────────────────────────────────────
// Executem tot això quan la pàgina acaba de carregar
initTheme();           // apliquem el tema desat (o el del sistema)
applyCardVisibility(); // restaurem les targetes amagades
loadSysinfo();         // carreguem la info del maquinari (una sola vegada)
fetchStats();          // primera petició de dades immediatament
setInterval(fetchStats, 2000); // i després repetim cada 2 segons
