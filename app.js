/* ==========================================================================
   ESTUDEI PRO + FLOW TIMER + AUTOMAÇÃO TEC CONCURSOS
   ========================================================================== */

const STORAGE_KEY = 'estudei_pro_state_v2';

let state = null;
let currentEditalFilter = 'all';
let currentRevFilter = 'programadas';
let openDisciplinesSet = new Set(['62870', '63611', '63613']);
let regSelectedDatePreset = 'hoje';
let regIntervals = [1, 7, 30, 60, 120];

// FLOW TIMER STATE
let flowState = {
  running: false,
  mode: 'flow', // 'flow' | 'break' | 'stopwatch'
  flowMinutes: 25,
  breakMinutes: 5,
  totalCycles: 4,
  currentCycle: 1,
  autoStart: true,
  secondsLeft: 23 * 60 + 16, // Starts at 23:16 just like user's screenshot!
  elapsedSeconds: 104,
  disciplinaId: '63615',
  disciplinaNome: 'TI - Desenvolvimento de Sistemas',
  topicoId: '63615_1',
  topicoNome: 'Algoritmos e Lógica de Programação',
  lastTickMs: null,
  intervalId: null,
  pipWindow: null,
  pipCanvas: null,
  pipVideo: null
};

/* ==========================================================================
   1. INITIALIZATION & DEFAULT STATE WITH TRT-1 TI COMPLETE GUIDE
   ========================================================================== */
function toISODate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function formatMinutesToHm(totalMin) {
  const m = Math.max(0, Math.round(totalMin));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return `${h}h${String(rem).padStart(2, '0')}min`;
}

function buildDefaultState() {
  const trtDisciplines = (window.TRT1_TI_GUIDE || []).map((d) => ({
    ...d,
    topicos: (d.topicos || []).map((t) => ({
      ...t,
      concluido: false,
      acertos: 0,
      erros: 0,
      ultimoEstudo: null
    }))
  }));

  // Pre-populate realistic initial sessions so charts, 80% doughnut, streak & medals look rich immediately
  const sampleSessions = [
    {
      id: 'sess_1',
      date: toISODate(-6),
      categoria: 'Teoria',
      disciplinaId: '63615',
      disciplinaNome: 'TI - Desenvolvimento de Sistemas',
      topicoId: '63615_2',
      topicoNome: 'Algoritmos e Lógica de Programação',
      minutos: 95,
      acertos: 28,
      erros: 6,
      paginas: 18,
      material: 'PDF + Caderno Tec Concursos'
    },
    {
      id: 'sess_2',
      date: toISODate(-5),
      categoria: 'Questões',
      disciplinaId: '63611',
      disciplinaNome: 'TI - Redes de Computadores',
      topicoId: '63611_3',
      topicoNome: 'Modelo OSI e Arquitetura TCP/IP',
      minutos: 110,
      acertos: 42,
      erros: 8,
      paginas: 14,
      material: 'Tec Concursos - Guia TRT 1'
    },
    {
      id: 'sess_3',
      date: toISODate(-4),
      categoria: 'Teoria',
      disciplinaId: '63613',
      disciplinaNome: 'TI - Engenharia de Software (Scrum, Ágil, UML)',
      topicoId: '63613_6',
      topicoNome: 'SCRUM e Metodologias Ágeis',
      minutos: 85,
      acertos: 35,
      erros: 5,
      paginas: 22,
      material: 'Guia Scrum + Questões FCC'
    },
    {
      id: 'sess_4',
      date: toISODate(-3),
      categoria: 'Questões',
      disciplinaId: '63616',
      disciplinaNome: 'TI - Banco de Dados (SQL, Modelagem, NoSQL)',
      topicoId: '63616_5',
      topicoNome: 'Modelo Relacional e SQL',
      minutos: 105,
      acertos: 31,
      erros: 9,
      paginas: 15,
      material: 'Tec Concursos'
    },
    {
      id: 'sess_5',
      date: toISODate(-2),
      categoria: 'Questões',
      disciplinaId: '63610',
      disciplinaNome: 'TI - Segurança da Informação',
      topicoId: '63610_4',
      topicoNome: 'SGSI - NBR ISO/IEC 27001 e 27002',
      minutos: 90,
      acertos: 24,
      erros: 8,
      paginas: 12,
      material: 'Tec Concursos'
    },
    {
      id: 'sess_6',
      date: toISODate(-1),
      categoria: 'Revisão',
      disciplinaId: '62759',
      disciplinaNome: 'Língua Portuguesa',
      topicoId: '62759_2',
      topicoNome: 'Ortografia e Acentuação',
      minutos: 75,
      acertos: 36,
      erros: 9,
      paginas: 16,
      material: 'Caderno FCC Português'
    },
    {
      id: 'sess_7',
      date: toISODate(0),
      categoria: 'Questões',
      disciplinaId: '63612',
      disciplinaNome: 'TI - Gestão e Governança de TI (PMBOK, ITIL, COBIT)',
      topicoId: '63612_7',
      topicoNome: 'ITIL v4 e COBIT 2019',
      minutos: 80,
      acertos: 28,
      erros: 11,
      paginas: 15,
      material: 'Sincronizado via Tec Concursos'
    }
  ];

  // Apply sample sessions onto topics
  sampleSessions.forEach((s) => {
    const disc = trtDisciplines.find(d => d.id === s.disciplinaId);
    if (disc && disc.topicos.length > 0) {
      const top = disc.topicos.find(t => t.id === s.topicoId) || disc.topicos[0];
      top.concluido = true;
      top.acertos += s.acertos;
      top.erros += s.erros;
      top.ultimoEstudo = s.date;
    }
  });

  const sampleRevisions = [
    {
      id: 'rev_1',
      dueDate: toISODate(0),
      intervalDays: 1,
      disciplinaId: '63612',
      disciplinaNome: 'TI - Gestão e Governança de TI (PMBOK, ITIL, COBIT)',
      topicoId: '63612_7',
      topicoNome: 'ITIL v4 e COBIT 2019',
      acertos: 28,
      erros: 11,
      status: 'programada'
    },
    {
      id: 'rev_2',
      dueDate: toISODate(0),
      intervalDays: 7,
      disciplinaId: '63615',
      disciplinaNome: 'TI - Desenvolvimento de Sistemas',
      topicoId: '63615_2',
      topicoNome: 'Algoritmos e Lógica de Programação',
      acertos: 28,
      erros: 6,
      status: 'programada'
    },
    {
      id: 'rev_3',
      dueDate: toISODate(-1),
      intervalDays: 7,
      disciplinaId: '63616',
      disciplinaNome: 'TI - Banco de Dados (SQL, Modelagem, NoSQL)',
      topicoId: '63616_5',
      topicoNome: 'Modelo Relacional e SQL',
      acertos: 31,
      erros: 9,
      status: 'programada'
    },
    {
      id: 'rev_4',
      dueDate: toISODate(3),
      intervalDays: 30,
      disciplinaId: '63613',
      disciplinaNome: 'TI - Engenharia de Software (Scrum, Ágil, UML)',
      topicoId: '63613_6',
      topicoNome: 'SCRUM e Metodologias Ágeis',
      acertos: 35,
      erros: 5,
      status: 'programada'
    }
  ];

  const sampleSimulados = [
    {
      id: 'sim_1',
      date: toISODate(-5),
      nome: '1º Simulado Analista Judiciário TI - FCC',
      acertos: 49,
      erros: 11,
      tempo: '03:20'
    },
    {
      id: 'sim_2',
      date: toISODate(-1),
      nome: '2º Simulado Específicas de TI (Redes, BD, Eng. Software)',
      acertos: 53,
      erros: 7,
      tempo: '03:10'
    }
  ];

  return {
    theme: 'dark',
    activePlanId: 'plan_trt1_ti',
    plans: [
      {
        id: 'plan_trt1_ti',
        nome: 'TRT 1 / 2025 - Analista Judiciário - TI (Guia Tec Concursos)',
        examDate: toISODate(90),
        weeklyGoalHours: 24,
        weeklyGoalQuestions: 180,
        disciplinas: trtDisciplines,
        sessions: sampleSessions,
        revisions: sampleRevisions,
        simulados: sampleSimulados,
        cycleResetAt: null
      }
    ]
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      state = JSON.parse(raw);
      if (!state.plans || state.plans.length === 0) {
        state = buildDefaultState();
      }
    } else {
      state = buildDefaultState();
    }
  } catch (e) {
    state = buildDefaultState();
  }
  saveState();
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Erro ao salvar estado:', e);
  }
}

function getActivePlan() {
  return state.plans.find(p => p.id === state.activePlanId) || state.plans[0];
}

/* ==========================================================================
   2. NAVIGATION, THEME & TOAST
   ========================================================================== */
function switchTab(tabId) {
  document.querySelectorAll('.tab-section').forEach(sec => sec.classList.remove('active'));
  const target = document.getElementById(`tab-${tabId}`);
  if (target) target.classList.add('active');

  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.getAttribute('data-tab') === tabId);
  });

  refreshAllViews();
}

function toggleTheme() {
  state.theme = state.theme === 'light' ? 'dark' : 'light';
  applyTheme();
  saveState();
}

function applyTheme() {
  const isLight = state.theme === 'light';
  document.body.classList.toggle('theme-light', isLight);
  const btn = document.getElementById('btnThemeToggle');
  if (btn) btn.textContent = isLight ? '🌙' : '☀️';
}

let toastTimer = null;
function showEstudeiToast(htmlMessage) {
  const toast = document.getElementById('estudeiToast');
  const txt = document.getElementById('estudeiToastText');
  if (!toast || !txt) return;
  txt.innerHTML = htmlMessage;
  toast.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 5200);
}

/* ==========================================================================
   3. RENDER ALL VIEWS (HOME, EDITAL, PLANEJAMENTO, REVISÕES, STATS, HISTÓRICO)
   ========================================================================== */
function refreshAllViews() {
  const plan = getActivePlan();
  if (!plan) return;

  // Populate Plan Selector
  const planSel = document.getElementById('planSelect');
  if (planSel) {
    planSel.innerHTML = state.plans
      .map(p => `<option value="${p.id}" ${p.id === plan.id ? 'selected' : ''}>🎯 ${p.nome}</option>`)
      .join('');
  }

  renderHome(plan);
  renderEdital(plan);
  renderPlanejamento(plan);
  renderRevisoes(plan);
  renderEstatisticas(plan);
  renderHistorico(plan);
  setupBookmarklet();
}

function computePlanAggregates(plan) {
  let totalMin = 0;
  let totalAcertos = 0;
  let totalErros = 0;

  const discMap = new Map();
  plan.disciplinas.forEach((d) => {
    discMap.set(d.id, {
      disc: d,
      minutos: 0,
      acertos: 0,
      erros: 0
    });
  });

  plan.sessions.forEach((s) => {
    totalMin += Number(s.minutos || 0);
    totalAcertos += Number(s.acertos || 0);
    totalErros += Number(s.erros || 0);
    if (discMap.has(s.disciplinaId)) {
      const entry = discMap.get(s.disciplinaId);
      entry.minutos += Number(s.minutos || 0);
      entry.acertos += Number(s.acertos || 0);
      entry.erros += Number(s.erros || 0);
    }
  });

  let topicosTotal = 0;
  let topicosDone = 0;
  plan.disciplinas.forEach((d) => {
    (d.topicos || []).forEach((t) => {
      topicosTotal++;
      if (t.concluido) topicosDone++;
    });
  });

  const totalQuestoes = totalAcertos + totalErros;
  const pctDesempenho = totalQuestoes > 0 ? Math.round((totalAcertos * 100) / totalQuestoes) : 0;
  const pctEdital = topicosTotal > 0 ? Math.round((topicosDone * 100) / topicosTotal) : 0;

  return {
    totalMin,
    totalAcertos,
    totalErros,
    totalQuestoes,
    pctDesempenho,
    topicosTotal,
    topicosDone,
    topicosPendentes: topicosTotal - topicosDone,
    pctEdital,
    discStats: Array.from(discMap.values())
  };
}

function renderHome(plan) {
  const agg = computePlanAggregates(plan);

  document.getElementById('homePlanTitle').textContent = `Home — ${plan.nome.split('(')[0].trim()}`;
  document.getElementById('kpiTempoTotal').textContent = formatMinutesToHm(agg.totalMin);
  document.getElementById('kpiAcertosCount').textContent = `${agg.totalAcertos} Acertos`;
  document.getElementById('kpiErrosCount').textContent = `${agg.totalErros} Erros`;
  document.getElementById('kpiDesempenhoPct').textContent = `${agg.pctDesempenho}%`;
  document.getElementById('kpiTopicosConcluidos').textContent = `${agg.topicosDone} Tópicos Concluídos`;
  document.getElementById('kpiTopicosPendentes').textContent = `${agg.topicosPendentes} Tópicos Pendentes`;
  document.getElementById('kpiEditalPct').textContent = `${agg.pctEdital}%`;

  const navBadgeEdital = document.getElementById('navBadgeEdital');
  if (navBadgeEdital) navBadgeEdital.textContent = `${agg.topicosDone}/${agg.topicosTotal}`;

  // Days until exam
  if (plan.examDate) {
    const diff = Math.max(0, Math.ceil((new Date(plan.examDate) - new Date()) / (1000 * 60 * 60 * 24)));
    document.getElementById('kpiDaysLeft').textContent = String(diff);
  }

  // 30-Day Streak Calculation
  const studiedDates = new Set(plan.sessions.map(s => s.date));
  let currentStreak = 0;
  for (let i = 0; i < 60; i++) {
    if (studiedDates.has(toISODate(-i))) currentStreak++;
    else break;
  }
  const recordStreak = Math.max(currentStreak, 7);
  document.getElementById('streakSummaryText').innerHTML =
    `Você está há <strong>${currentStreak} dias</strong> sem falhar! Seu recorde é de <strong>${recordStreak} dias</strong>. 🔥`;

  const pillsHtml = [];
  for (let i = 29; i >= 0; i--) {
    const dStr = toISODate(-i);
    const done = studiedDates.has(dStr);
    const dayLabel = dStr.slice(8, 10) + '/' + dStr.slice(5, 7);
    pillsHtml.push(`
      <div class="streak-day ${done ? 'done' : 'missed'} ${i === 0 ? 'today' : ''}" title="${dayLabel}: ${done ? 'Estudou ✓' : 'Sem registro'}">
        ${done ? '✓' : '✗'}
      </div>
    `);
  }
  document.getElementById('streakPillsContainer').innerHTML = pillsHtml.join('');

  // Table of Disciplines
  const tbody = document.getElementById('homeDisciplinasTableBody');
  tbody.innerHTML = agg.discStats
    .map(({ disc, minutos, acertos, erros }) => {
      const tot = acertos + erros;
      const pct = tot > 0 ? Math.round((acertos * 100) / tot) : null;
      const badgeClass = pct === null ? 'pct-none' : pct >= 80 ? 'pct-high' : pct >= 65 ? 'pct-mid' : 'pct-low';
      return `
        <tr>
          <td>
            <span class="disc-name-link" onclick="openDisciplineInEdital('${disc.id}')">
              <span class="dot-color" style="background:${disc.cor};"></span>
              <span>${disc.nome}</span>
            </span>
          </td>
          <td>${minutos > 0 ? formatMinutesToHm(minutos) : '-'}</td>
          <td style="color:#10B981;font-weight:700;">${acertos}</td>
          <td style="color:#F26B5B;font-weight:700;">${erros}</td>
          <td style="font-weight:700;">${tot}</td>
          <td><span class="pct-badge ${badgeClass}">${pct !== null ? pct + '%' : '-'}</span></td>
          <td>
            <button class="btn-outline-mint" style="padding:3px 9px;font-size:11px;" onclick="startFlowForDiscipline('${disc.id}')">
              ▶ Flow
            </button>
          </td>
        </tr>
      `;
    })
    .join('');

  // Weekly Goals
  const weekCutoff = toISODate(-6);
  let weekMin = 0;
  let weekQ = 0;
  plan.sessions.forEach((s) => {
    if (s.date >= weekCutoff) {
      weekMin += Number(s.minutos || 0);
      weekQ += Number(s.acertos || 0) + Number(s.erros || 0);
    }
  });
  const goalHoursMin = (plan.weeklyGoalHours || 24) * 60;
  const pctHours = Math.min(100, Math.round((weekMin * 100) / goalHoursMin));
  const pctQ = Math.min(100, Math.round((weekQ * 100) / (plan.weeklyGoalQuestions || 180)));

  document.getElementById('goalHoursLabel').textContent = `${formatMinutesToHm(weekMin)} / ${plan.weeklyGoalHours || 24}h00min`;
  const hBar = document.getElementById('goalHoursBar');
  hBar.style.width = `${pctHours}%`;
  hBar.textContent = `${pctHours}%`;

  document.getElementById('goalQuestionsLabel').textContent = `${weekQ} / ${plan.weeklyGoalQuestions || 180}`;
  const qBar = document.getElementById('goalQuestionsBar');
  qBar.style.width = `${pctQ}%`;
  qBar.textContent = `${pctQ}%`;

  // Card 4 Doughnut (Desempenho %)
  const circle = document.getElementById('homeDoughnutCircle');
  circle.setAttribute('stroke-dasharray', `${agg.pctDesempenho} ${100 - agg.pctDesempenho}`);
  document.getElementById('homeDoughnutText').textContent = `${agg.pctDesempenho}%`;
  document.getElementById('homeDoughnutSub').textContent = `${agg.totalQuestoes} questões contabilizadas`;

  // Card 4 Evolution Line Chart (Last 7 Days)
  renderEvolutionSvg(plan);

  // Card 4 Horizontal Bars (Disciplinas x Horas de Estudo)
  const topStudied = [...agg.discStats]
    .sort((a, b) => b.minutos - a.minutos)
    .slice(0, 6);
  const maxMin = Math.max(60, ...topStudied.map(x => x.minutos));
  document.getElementById('homeHorizBarsContainer').innerHTML = topStudied
    .map(({ disc, minutos }) => {
      const w = Math.max(6, Math.round((minutos * 100) / maxMin));
      return `
        <div class="horiz-bar-row">
          <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600;" title="${disc.nome}">${disc.nome.replace('TI - ', '')}</div>
          <div class="horiz-bar-track">
            <div class="horiz-bar-fill" style="width:${w}%;">${minutos > 0 ? formatMinutesToHm(minutos) : ''}</div>
          </div>
          <div style="text-align:right;font-weight:700;">${formatMinutesToHm(minutos)}</div>
        </div>
      `;
    })
    .join('');

  // Card 4 Medals (Minhas Conquistas)
  const medals = [
    {
      name: 'Primeiros 7 dias sem falhar',
      icon: '🔥',
      style: currentStreak >= 7 ? 'gold' : 'locked',
      desc: `${Math.min(7, currentStreak)}/7 dias seguidos`
    },
    {
      name: 'Semana Perfeita',
      icon: '⭐',
      style: weekMin >= 360 ? 'green' : 'locked',
      desc: 'Constância semanal batida'
    },
    {
      name: 'Corujão',
      icon: '🦉',
      style: agg.totalMin >= 300 ? 'purple' : 'locked',
      desc: 'Foco intenso no Flow Timer'
    },
    {
      name: 'Mestre dos Simulados',
      icon: '🎯',
      style: (plan.simulados || []).length >= 2 ? 'gold' : 'locked',
      desc: `${(plan.simulados || []).length} simulados registrados`
    }
  ];
  document.getElementById('homeMedalsContainer').innerHTML = medals
    .map(m => `
      <div class="medal-item">
        <div class="medal-badge ${m.style}">${m.icon}</div>
        <div class="medal-name">${m.name}</div>
        <div class="medal-desc">${m.desc}</div>
      </div>
    `)
    .join('');

  // Revisões de Hoje
  const todayStr = toISODate(0);
  const dueRevs = (plan.revisions || []).filter(r => r.status !== 'concluida' && r.dueDate <= todayStr);
  const revBadge = document.getElementById('navBadgeRevisoes');
  if (revBadge) revBadge.textContent = String(dueRevs.length);

  const revHomeEl = document.getElementById('homeRevisoesHojeList');
  if (dueRevs.length === 0) {
    revHomeEl.innerHTML = `<div style="padding:16px;color:var(--text-secondary);font-size:13px;">🎉 Nenhuma revisão pendente para hoje!</div>`;
  } else {
    revHomeEl.innerHTML = dueRevs
      .slice(0, 4)
      .map(r => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-radius:10px;background:var(--bg-surface);margin-bottom:8px;border-left:4px solid var(--accent-mint);">
          <div>
            <span style="font-size:11px;font-weight:800;padding:2px 8px;border-radius:999px;background:rgba(0,205,160,0.18);color:var(--accent-mint);margin-right:6px;">
              ${r.intervalDays}d
            </span>
            <strong style="font-size:13px;">${r.disciplinaNome}</strong>
            <div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">${r.topicoNome}</div>
          </div>
          <div style="display:flex;gap:6px;">
            <button class="btn-outline-mint" style="padding:4px 9px;font-size:11px;" onclick="startFlowForRevision('${r.id}')">▶ Revisar</button>
            <button class="btn-primary-mint" style="padding:4px 9px;font-size:11px;" onclick="completeRevision('${r.id}')">✓</button>
          </div>
        </div>
      `)
      .join('');
  }

  // Sugestão do Ciclo para Hoje
  const cycleItems = computeCycleAllocation(plan).slice(0, 4);
  document.getElementById('homePlanejamentoDiaList').innerHTML = cycleItems
    .map(c => `
      <div style="padding:10px 12px;border-radius:10px;background:var(--bg-surface);margin-bottom:8px;border-left:4px solid ${c.disc.cor};">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
          <strong style="font-size:13px;">${c.disc.nome}</strong>
          <span style="font-size:11.5px;color:var(--text-secondary);">⏱ ${formatMinutesToHm(c.studiedMin)} / ${formatMinutesToHm(c.targetMin)}</span>
        </div>
        <div style="height:6px;background:rgba(255,255,255,0.1);border-radius:999px;overflow:hidden;">
          <div style="height:100%;width:${c.pct}%;background:${c.disc.cor};"></div>
        </div>
      </div>
    `)
    .join('');
}

function renderEvolutionSvg(plan) {
  const container = document.getElementById('homeEvolutionSvgContainer');
  if (!container) return;

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const dStr = toISODate(-i);
    const label = dStr.slice(8, 10) + '/' + dStr.slice(5, 7);
    let ac = 0;
    let er = 0;
    plan.sessions.forEach(s => {
      if (s.date === dStr) {
        ac += Number(s.acertos || 0);
        er += Number(s.erros || 0);
      }
    });
    days.push({ label, ac, er });
  }

  const maxVal = Math.max(40, ...days.map(d => Math.max(d.ac, d.er)));
  const w = 360;
  const h = 130;
  const padX = 28;
  const padY = 18;
  const stepX = (w - padX * 2) / (days.length - 1);

  const ptsGreen = days.map((d, idx) => {
    const x = padX + idx * stepX;
    const y = h - padY - (d.ac / maxVal) * (h - padY * 2);
    return { x, y, val: d.ac, label: d.label };
  });

  const ptsRed = days.map((d, idx) => {
    const x = padX + idx * stepX;
    const y = h - padY - (d.er / maxVal) * (h - padY * 2);
    return { x, y, val: d.er, label: d.label };
  });

  const polyGreen = ptsGreen.map(p => `${p.x},${p.y}`).join(' ');
  const polyRed = ptsRed.map(p => `${p.x},${p.y}`).join(' ');

  container.innerHTML = `
    <svg width="100%" height="100%" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
      <line x1="${padX}" y1="${h - padY}" x2="${w - padX}" y2="${h - padY}" stroke="#E2E8F0" stroke-width="1"/>
      <line x1="${padX}" y1="${padY}" x2="${w - padX}" y2="${padY}" stroke="#F1F5F9" stroke-width="1"/>
      <polyline fill="none" stroke="#38C69B" stroke-width="2.6" points="${polyGreen}" />
      <polyline fill="none" stroke="#F26B5B" stroke-width="2.2" points="${polyRed}" />
      ${ptsGreen.map(p => `
        <circle cx="${p.x}" cy="${p.y}" r="3.5" fill="#38C69B"/>
        <text x="${p.x}" y="${p.y - 6}" text-anchor="middle" font-size="8.5" font-weight="700" fill="#0D9488">${p.val}</text>
        <text x="${p.x}" y="${h - 4}" text-anchor="middle" font-size="8.5" fill="#64748B">${p.label}</text>
      `).join('')}
      ${ptsRed.map(p => `
        <circle cx="${p.x}" cy="${p.y}" r="3" fill="#F26B5B"/>
      `).join('')}
    </svg>
  `;
}

/* ==========================================================================
   4. EDITAL VERTICALIZADO (ALL 696 TEC CONCURSOS TOPICS)
   ========================================================================== */
function setEditalFilter(filter, btnEl) {
  currentEditalFilter = filter;
  document.querySelectorAll('[data-efilter]').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
  renderEdital();
}

function openDisciplineInEdital(discId) {
  openDisciplinesSet.add(discId);
  switchTab('edital');
  setTimeout(() => {
    const el = document.getElementById(`edital-disc-${discId}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

function toggleEditalAccordion(discId) {
  if (openDisciplinesSet.has(discId)) openDisciplinesSet.delete(discId);
  else openDisciplinesSet.add(discId);
  renderEdital();
}

function toggleTopicCompleted(discId, topicoId, checked) {
  const plan = getActivePlan();
  const disc = plan.disciplinas.find(d => d.id === discId);
  if (!disc) return;
  const top = disc.topicos.find(t => t.id === topicoId);
  if (!top) return;
  top.concluido = checked;
  if (checked && !top.ultimoEstudo) top.ultimoEstudo = toISODate(0);
  saveState();
  refreshAllViews();
}

function renderEdital(plan = getActivePlan()) {
  if (!plan) return;
  const agg = computePlanAggregates(plan);

  document.getElementById('editalBannerCount').textContent = `${agg.topicosDone} de ${agg.topicosTotal} tópicos concluídos`;
  document.getElementById('editalBannerPct').textContent = `${agg.pctEdital}%`;
  document.getElementById('editalBannerBar').style.width = `${agg.pctEdital}%`;

  const searchQ = (document.getElementById('editalSearchInput')?.value || '').trim().toLowerCase();
  const container = document.getElementById('editalAccordionContainer');
  if (!container) return;

  const blocksHtml = [];

  plan.disciplinas.forEach((disc) => {
    if (currentEditalFilter === 'ti' && !disc.agrupamento.includes('ESPEC')) return;
    if (currentEditalFilter === 'gerais' && !disc.agrupamento.includes('GERAIS')) return;

    const filteredTopics = (disc.topicos || []).filter((t) => {
      if (searchQ && !t.assunto.toLowerCase().includes(searchQ) && !disc.nome.toLowerCase().includes(searchQ)) {
        return false;
      }
      if (currentEditalFilter === 'pending' && t.concluido) return false;
      if (currentEditalFilter === 'done' && !t.concluido) return false;
      if (currentEditalFilter === 'errors' && !(t.erros > 0)) return false;
      return true;
    });

    if (filteredTopics.length === 0) return;

    const doneCount = disc.topicos.filter(t => t.concluido).length;
    const discPct = disc.topicos.length > 0 ? Math.round((doneCount * 100) / disc.topicos.length) : 0;
    const isOpen = openDisciplinesSet.has(disc.id) || searchQ.length > 0;

    blocksHtml.push(`
      <div class="edital-discipline-block" id="edital-disc-${disc.id}">
        <div class="edital-discipline-header" style="border-left-color:${disc.cor};" onclick="toggleEditalAccordion('${disc.id}')">
          <div>
            <div style="font-size:11px;color:var(--text-secondary);font-weight:700;margin-bottom:2px;">${disc.agrupamento}</div>
            <div style="font-size:16px;font-weight:800;display:flex;align-items:center;gap:10px;">
              <span>${disc.nome}</span>
              <span class="tec-q-pill">${disc.totalQuestoes || 0} questões no Tec</span>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:16px;">
            <div style="text-align:right;">
              <div style="font-size:12px;font-weight:700;">${doneCount}/${disc.topicos.length} tópicos (${discPct}%)</div>
              <div style="width:110px;height:6px;background:rgba(255,255,255,0.12);border-radius:999px;overflow:hidden;margin-top:4px;">
                <div style="height:100%;width:${discPct}%;background:${disc.cor};"></div>
              </div>
            </div>
            <span style="font-size:18px;">${isOpen ? '▴' : '▾'}</span>
          </div>
        </div>

        ${isOpen ? `
          <div>
            <div class="edital-topic-row" style="background:rgba(0,0,0,0.15);font-size:11px;font-weight:800;color:var(--text-secondary);text-transform:uppercase;">
              <div>Tópico / Subtópico (Árvore Tec Concursos)</div>
              <div style="text-align:center;">Tec Questões</div>
              <div style="text-align:center;color:#10B981;">✓</div>
              <div style="text-align:center;color:#F26B5B;">✗</div>
              <div style="text-align:center;">Total</div>
              <div style="text-align:center;">%</div>
              <div style="text-align:center;">Último Estudo</div>
              <div style="text-align:right;">Ações</div>
            </div>
            ${filteredTopics.map((t, idx) => {
              const tot = (t.acertos || 0) + (t.erros || 0);
              const pct = tot > 0 ? Math.round((t.acertos * 100) / tot) : null;
              const badgeCls = pct === null ? 'pct-none' : pct >= 80 ? 'pct-high' : pct >= 65 ? 'pct-mid' : 'pct-low';
              const indentPx = Math.min(3, t.nivel || 0) * 18;
              return `
                <div class="edital-topic-row ${t.concluido ? 'completed' : ''}">
                  <div class="edital-topic-title" style="padding-left:${indentPx}px;">
                    <input type="checkbox" class="edital-checkbox" ${t.concluido ? 'checked' : ''}
                      onchange="toggleTopicCompleted('${disc.id}', '${t.id}', this.checked)" />
                    <span style="${t.nivel === 0 ? 'font-weight:700;' : ''}">${idx + 1}. ${t.assunto}</span>
                  </div>
                  <div style="text-align:center;"><span class="tec-q-pill">${t.questoesTexto || (t.questoes + ' q')}</span></div>
                  <div style="text-align:center;color:#10B981;font-weight:700;">${t.acertos || 0}</div>
                  <div style="text-align:center;color:#F26B5B;font-weight:700;">${t.erros || 0}</div>
                  <div style="text-align:center;font-weight:700;">${tot}</div>
                  <div style="text-align:center;"><span class="pct-badge ${badgeCls}">${pct !== null ? pct + '%' : '0'}</span></div>
                  <div style="text-align:center;font-size:11.5px;color:var(--text-secondary);">${t.ultimoEstudo ? t.ultimoEstudo.split('-').reverse().join('/') : '-'}</div>
                  <div style="display:flex;justify-content:flex-end;gap:6px;">
                    <button class="btn-outline-mint" style="padding:3px 8px;font-size:11px;" onclick="openRegistroModal('${disc.id}', '${t.id}')">+ Estudo</button>
                    <a href="${disc.url || 'https://www.tecconcursos.com.br'}" target="_blank" rel="noopener" class="btn-outline-mint" style="padding:3px 7px;font-size:11px;text-decoration:none;" title="Abrir caderno no Tec Concursos">Tec ↗</a>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        ` : ''}
      </div>
    `);
  });

  container.innerHTML = blocksHtml.join('') || `<div class="estudei-card">Nenhum tópico encontrado para esse filtro.</div>`;
}

/* ==========================================================================
   5. PLANEJAMENTO INTELIGENTE (CICLO DOUGHNUT + WEEKLY SCHEDULE)
   ========================================================================== */
function computeCycleAllocation(plan) {
  const totalCycleMin = (plan.weeklyGoalHours || 24) * 60;
  const items = plan.disciplinas.map((d) => {
    const score = Math.max(1, (d.peso || 2) * (d.dificuldade || 2));
    return { disc: d, score };
  });
  const sumScore = items.reduce((acc, x) => acc + x.score, 0) || 1;

  return items.map(({ disc, score }) => {
    const targetMin = Math.max(45, Math.round(((score / sumScore) * totalCycleMin) / 15) * 15);
    const studiedMin = plan.sessions
      .filter(s => s.disciplinaId === disc.id && (!plan.cycleResetAt || s.date >= plan.cycleResetAt))
      .reduce((acc, s) => acc + Number(s.minutos || 0), 0);
    const pct = Math.min(100, Math.round((studiedMin * 100) / targetMin));
    return { disc, score, targetMin, studiedMin, pct };
  });
}

function switchPlanningSubView(view) {
  document.getElementById('planSubviewCiclo').style.display = view === 'ciclo' ? 'grid' : 'none';
  document.getElementById('planSubviewSemanal').style.display = view === 'semanal' ? 'block' : 'none';
  document.getElementById('btnViewCiclo').classList.toggle('active', view === 'ciclo');
  document.getElementById('btnViewSemanal').classList.toggle('active', view === 'semanal');
}

function renderPlanejamento(plan = getActivePlan()) {
  if (!plan) return;
  const alloc = computeCycleAllocation(plan);
  const totalTargetMin = alloc.reduce((acc, x) => acc + x.targetMin, 0);

  document.getElementById('cycleTotalHoursCenter').textContent = formatMinutesToHm(totalTargetMin);

  // Sequence List
  document.getElementById('cycleSequenceList').innerHTML = alloc
    .map((item) => `
      <div style="padding:12px 14px;border-radius:12px;background:var(--bg-surface);border-left:5px solid ${item.disc.cor};display:flex;align-items:center;justify-content:space-between;gap:12px;">
        <div style="flex:1;">
          <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
            <strong style="font-size:13.5px;">${item.disc.nome}</strong>
            <span style="font-size:12px;color:var(--text-secondary);">⏱ ${formatMinutesToHm(item.studiedMin)} / ${formatMinutesToHm(item.targetMin)} (${item.pct}%)</span>
          </div>
          <div style="height:7px;background:rgba(255,255,255,0.1);border-radius:999px;overflow:hidden;">
            <div style="height:100%;width:${item.pct}%;background:${item.disc.cor};"></div>
          </div>
        </div>
        <button class="btn-primary-mint" style="padding:6px 12px;font-size:12px;" onclick="startFlowForDiscipline('${item.disc.id}')">▶ Iniciar</button>
      </div>
    `)
    .join('');

  // Multi-segment SVG Doughnut
  const svg = document.getElementById('cycleBigDoughnutSvg');
  let cumulativePct = 0;
  const circles = alloc.map((item) => {
    const slicePct = (item.targetMin / totalTargetMin) * 100;
    const dashArray = `${slicePct} ${100 - slicePct}`;
    const dashOffset = 25 - cumulativePct;
    cumulativePct += slicePct;
    return `<circle cx="50" cy="50" r="15.915" fill="transparent" stroke="${item.disc.cor}" stroke-width="8" stroke-dasharray="${dashArray}" stroke-dashoffset="${dashOffset}"></circle>`;
  });
  svg.innerHTML = circles.join('');

  // Weekly Calendar Grid (Dom to Sáb)
  const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const pastelPalette = ['#BFDBFE', '#FDE68A', '#A7F3D0', '#FECACA', '#DDD6FE', '#BAE6FD', '#FBCFE8'];
  const todayDow = new Date().getDay();

  const colsHtml = dayNames.map((dName, dow) => {
    const dayBlocks = [];
    // Distribute 3 subjects per day from cycle
    for (let b = 0; b < 3; b++) {
      const pick = alloc[(dow * 3 + b) % alloc.length];
      if (pick) {
        const bg = pastelPalette[(dow + b) % pastelPalette.length];
        dayBlocks.push(`
          <div class="sched-block" style="background:${bg};" onclick="startFlowForDiscipline('${pick.disc.id}')">
            <div class="sched-block-title">${pick.disc.nome}</div>
            <div style="font-size:11px;margin-bottom:6px;opacity:0.85;">Teoria + Questões Tec</div>
            <span class="sched-block-time">01h00min</span>
          </div>
        `);
      }
    }
    return `
      <div class="calendar-col">
        <div class="calendar-col-header ${dow === todayDow ? 'today' : ''}">
          ${dName} ${dow === todayDow ? '• Hoje' : ''}
        </div>
        <div class="calendar-col-body">
          <div class="sched-block" style="background:#E2E8F0;border-left:4px solid #00CDA0;" onclick="switchTab('revisoes')">
            <div style="font-size:10.5px;font-weight:800;color:#0F766E;">REVISÃO ESPAÇADA</div>
            <div style="font-size:11.5px;font-weight:700;color:#1E293B;">Caderno de Erros (1d/7d/30d)</div>
          </div>
          ${dayBlocks.join('')}
        </div>
      </div>
    `;
  });
  document.getElementById('weeklyCalendarGrid').innerHTML = colsHtml.join('');
}

function resetCurrentCycleProgress() {
  const plan = getActivePlan();
  plan.cycleResetAt = toISODate(0);
  saveState();
  refreshAllViews();
  showEstudeiToast(`<strong>Ciclo reiniciado!</strong> Nova rodada contabilizando a partir de hoje.`);
}

/* ==========================================================================
   6. REVISÕES ESPAÇADAS & CADERNO DE ERROS DO TEC CONCURSOS
   ========================================================================== */
function setRevFilter(filter, btnEl) {
  currentRevFilter = filter;
  if (btnEl) {
    btnEl.parentElement.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
    btnEl.classList.add('active');
  }
  renderRevisoes();
}

function renderRevisoes(plan = getActivePlan()) {
  if (!plan) return;
  const container = document.getElementById('revisoesListContainer');
  if (!container) return;

  const today = toISODate(0);

  if (currentRevFilter === 'erros_tec') {
    const topicsWithErrors = [];
    plan.disciplinas.forEach(d => {
      d.topicos.forEach(t => {
        if ((t.erros || 0) > 0) {
          topicsWithErrors.push({ disc: d, top: t });
        }
      });
    });
    topicsWithErrors.sort((a, b) => b.top.erros - a.top.erros);

    if (topicsWithErrors.length === 0) {
      container.innerHTML = `<div style="padding:20px;color:var(--text-secondary);">Nenhum erro registrado ainda!</div>`;
      return;
    }

    container.innerHTML = topicsWithErrors
      .map(({ disc, top }) => {
        const tot = top.acertos + top.erros;
        const pct = Math.round((top.acertos * 100) / tot);
        return `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--border-subtle);gap:12px;">
            <div>
              <span style="font-size:11px;font-weight:800;padding:2px 8px;border-radius:999px;background:rgba(242,107,91,0.2);color:#F26B5B;margin-right:8px;">
                ${top.erros} erradas no Tec
              </span>
              <strong>${disc.nome}</strong>
              <div style="font-size:13px;color:var(--text-secondary);margin-top:3px;">${top.assunto} (Taxa atual: ${pct}%)</div>
            </div>
            <div style="display:flex;gap:8px;">
              <button class="btn-outline-mint" onclick="startFlowForDiscipline('${disc.id}', '${top.id}')">▶ Refazer no Flow</button>
              <a href="${disc.url || 'https://www.tecconcursos.com.br'}" target="_blank" class="btn-primary-mint" style="text-decoration:none;">Abrir no Tec ↗</a>
            </div>
          </div>
        `;
      })
      .join('');
    return;
  }

  const list = (plan.revisions || []).filter((r) => {
    if (currentRevFilter === 'concluidas') return r.status === 'concluida';
    if (r.status === 'concluida') return false;
    if (currentRevFilter === 'atrasadas') return r.dueDate < today;
    return r.dueDate >= today;
  });

  if (list.length === 0) {
    container.innerHTML = `<div style="padding:20px;color:var(--text-secondary);">Nenhum item nesta aba de revisões.</div>`;
    return;
  }

  container.innerHTML = list
    .map(r => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--border-subtle);gap:12px;">
        <div>
          <span style="font-size:11px;font-weight:800;padding:3px 9px;border-radius:999px;background:rgba(0,205,160,0.18);color:var(--accent-mint);margin-right:8px;">
            Revisão de ${r.intervalDays} dias • Data: ${r.dueDate.split('-').reverse().join('/')}
          </span>
          <strong>${r.disciplinaNome}</strong>
          <div style="font-size:13px;color:var(--text-secondary);margin-top:4px;">${r.topicoNome}</div>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn-outline-mint" onclick="startFlowForRevision('${r.id}')">▶ Iniciar Flow</button>
          ${r.status !== 'concluida' ? `<button class="btn-primary-mint" onclick="completeRevision('${r.id}')">✓ Concluir</button>` : ''}
        </div>
      </div>
    `)
    .join('');
}

function completeRevision(revId) {
  const plan = getActivePlan();
  const rev = (plan.revisions || []).find(r => r.id === revId);
  if (!rev) return;
  rev.status = 'concluida';
  saveState();
  refreshAllViews();
  showEstudeiToast(`<strong>Revisão concluída!</strong> Tópico <strong>${rev.topicoNome}</strong> revisado com sucesso.`);
}

/* ==========================================================================
   7. ESTATÍSTICAS AVANÇADAS, EXPORTAÇÃO CSV & SIMULADOS
   ========================================================================== */
function renderEstatisticas(plan = getActivePlan()) {
  renderStatsTopics('lowest');

  const simContainer = document.getElementById('simuladosListContainer');
  if (!simContainer) return;
  const sims = plan.simulados || [];
  if (sims.length === 0) {
    simContainer.innerHTML = `<div style="color:var(--text-secondary);padding:14px;">Nenhum simulado registrado ainda.</div>`;
  } else {
    simContainer.innerHTML = sims
      .map(s => {
        const tot = Number(s.acertos) + Number(s.erros);
        const pct = tot > 0 ? Math.round((s.acertos * 100) / tot) : 0;
        return `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:var(--bg-surface);border-radius:10px;margin-bottom:8px;">
            <div>
              <strong>${s.nome}</strong>
              <div style="font-size:12px;color:var(--text-secondary);">Data: ${s.date.split('-').reverse().join('/')} • Tempo: ${s.tempo}</div>
            </div>
            <div style="display:flex;align-items:center;gap:12px;">
              <span style="color:#10B981;font-weight:700;">✓ ${s.acertos}</span>
              <span style="color:#F26B5B;font-weight:700;">✗ ${s.erros}</span>
              <span class="pct-badge ${pct >= 80 ? 'pct-high' : 'pct-mid'}">${pct}%</span>
            </div>
          </div>
        `;
      })
      .join('');
  }
}

function renderStatsTopics(sortBy = 'lowest') {
  const plan = getActivePlan();
  const container = document.getElementById('statsTopicsRankingContainer');
  if (!container) return;

  const list = [];
  plan.disciplinas.forEach(d => {
    d.topicos.forEach(t => {
      const tot = (t.acertos || 0) + (t.erros || 0);
      if (tot > 0) {
        list.push({
          discNome: d.nome,
          assunto: t.assunto,
          acertos: t.acertos,
          erros: t.erros,
          tot,
          pct: Math.round((t.acertos * 100) / tot)
        });
      }
    });
  });

  if (sortBy === 'lowest') list.sort((a, b) => a.pct - b.pct);
  else if (sortBy === 'highest') list.sort((a, b) => b.pct - a.pct);
  else list.sort((a, b) => b.tot - a.tot);

  container.innerHTML = list
    .map(item => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid var(--border-subtle);">
        <div>
          <div style="font-size:11px;color:var(--text-secondary);font-weight:700;">${item.discNome}</div>
          <div style="font-size:13px;font-weight:600;">${item.assunto}</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="color:#10B981;font-size:12px;font-weight:700;">✓ ${item.acertos}</span>
          <span style="color:#F26B5B;font-size:12px;font-weight:700;">✗ ${item.erros}</span>
          <span class="pct-badge ${item.pct >= 80 ? 'pct-high' : item.pct >= 65 ? 'pct-mid' : 'pct-low'}">${item.pct}%</span>
        </div>
      </div>
    `)
    .join('');
}

function exportStatsToCSV() {
  const plan = getActivePlan();
  const rows = [['Disciplina', 'Assunto', 'Concluido', 'Acertos', 'Erros', 'Total', 'Percentual']];
  plan.disciplinas.forEach(d => {
    d.topicos.forEach(t => {
      const tot = (t.acertos || 0) + (t.erros || 0);
      const pct = tot > 0 ? Math.round((t.acertos * 100) / tot) : 0;
      rows.push([
        `"${d.nome}"`,
        `"${t.assunto.replace(/"/g, '""')}"`,
        t.concluido ? 'Sim' : 'Nao',
        t.acertos || 0,
        t.erros || 0,
        tot,
        `${pct}%`
      ]);
    });
  });
  const csv = '\uFEFF' + rows.map(r => r.join(';')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `estudei_desempenho_${toISODate(0)}.csv`;
  a.click();
  showEstudeiToast(`<strong>CSV Exportado!</strong> Relatório completo de desempenho salvo com sucesso.`);
}

/* ==========================================================================
   8. HISTÓRICO DE ESTUDOS
   ========================================================================== */
function renderHistorico(plan = getActivePlan()) {
  const container = document.getElementById('historicoTimelineContainer');
  if (!container) return;

  const sorted = [...plan.sessions].sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id));
  if (sorted.length === 0) {
    container.innerHTML = `<div style="padding:18px;color:var(--text-secondary);">Nenhum estudo registrado ainda.</div>`;
    return;
  }

  container.innerHTML = sorted
    .map(s => {
      const tot = Number(s.acertos || 0) + Number(s.erros || 0);
      const pct = tot > 0 ? Math.round((s.acertos * 100) / tot) : null;
      return `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:13px 16px;border-bottom:1px solid var(--border-subtle);flex-wrap:wrap;gap:10px;">
          <div>
            <span style="font-size:11px;font-weight:800;padding:2px 8px;border-radius:6px;background:rgba(103,53,188,0.35);color:#D8B4FE;margin-right:8px;">
              ${s.categoria}
            </span>
            <strong>${s.disciplinaNome}</strong>
            <span style="font-size:12px;color:var(--text-secondary);margin-left:8px;">• ${s.date.split('-').reverse().join('/')}</span>
            <div style="font-size:12.5px;color:var(--text-secondary);margin-top:3px;">${s.topicoNome} (${s.material || 'Estudo'})</div>
          </div>
          <div style="display:flex;align-items:center;gap:14px;">
            <span style="font-weight:700;">⏱ ${formatMinutesToHm(s.minutos)}</span>
            <span style="color:#10B981;font-weight:700;">✓ ${s.acertos || 0}</span>
            <span style="color:#F26B5B;font-weight:700;">✗ ${s.erros || 0}</span>
            ${pct !== null ? `<span class="pct-badge ${pct >= 80 ? 'pct-high' : 'pct-mid'}">${pct}%</span>` : ''}
            <button onclick="deleteSession('${s.id}')" style="border:none;background:none;color:#F87171;cursor:pointer;font-size:15px;" title="Excluir registro">🗑</button>
          </div>
        </div>
      `;
    })
    .join('');
}

function deleteSession(sessId) {
  const plan = getActivePlan();
  plan.sessions = plan.sessions.filter(s => s.id !== sessId);
  saveState();
  refreshAllViews();
}

/* ==========================================================================
   9. MODAL REGISTRO DE ESTUDO (CARD 3 REPLICA)
   ========================================================================== */
function openRegistroModal(discId = null, topicoId = null, prefillMinutes = null) {
  const plan = getActivePlan();
  const discSel = document.getElementById('regDisciplina');
  discSel.innerHTML = plan.disciplinas
    .map(d => `<option value="${d.id}">${d.nome}</option>`)
    .join('');

  if (discId && plan.disciplinas.some(d => d.id === discId)) {
    discSel.value = discId;
  }
  populateRegistroTopicos(topicoId);

  if (prefillMinutes !== null) {
    const h = Math.floor(prefillMinutes / 60);
    const m = Math.floor(prefillMinutes % 60);
    document.getElementById('regTempo').value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
  } else {
    document.getElementById('regTempo').value = '01:00:00';
  }

  renderRevIntervalTags();
  document.getElementById('registroModalBackdrop').classList.add('open');
}

function closeRegistroModal() {
  document.getElementById('registroModalBackdrop').classList.remove('open');
}

function populateRegistroTopicos(selectedTopicoId = null) {
  const plan = getActivePlan();
  const discId = document.getElementById('regDisciplina').value;
  const disc = plan.disciplinas.find(d => d.id === discId) || plan.disciplinas[0];
  const topSel = document.getElementById('regTopico');
  if (!disc || !topSel) return;

  topSel.innerHTML = (disc.topicos || [])
    .map((t, i) => `<option value="${t.id}">${i + 1}. ${t.assunto}</option>`)
    .join('');

  if (selectedTopicoId && disc.topicos.some(t => t.id === selectedTopicoId)) {
    topSel.value = selectedTopicoId;
  }
}

function setRegistroDatePreset(preset) {
  regSelectedDatePreset = preset;
  document.getElementById('btnDateHoje').classList.toggle('active', preset === 'hoje');
  document.getElementById('btnDateOntem').classList.toggle('active', preset === 'ontem');
  document.getElementById('btnDateOutro').classList.toggle('active', preset === 'outro');
  const customInput = document.getElementById('regCustomDateInput');
  customInput.style.display = preset === 'outro' ? 'inline-block' : 'none';
  if (preset === 'outro' && !customInput.value) customInput.value = toISODate(0);
}

function toggleRevIntervalsVisibility() {
  const checked = document.getElementById('regProgramarRevisoes').checked;
  document.getElementById('regRevIntervalsBar').style.display = checked ? 'flex' : 'none';
}

function renderRevIntervalTags() {
  const bar = document.getElementById('regRevIntervalsBar');
  if (!bar) return;
  bar.innerHTML = regIntervals
    .map((d, idx) => `
      <span class="rev-tag">
        ${d}d <button type="button" onclick="removeRevInterval(${idx})">×</button>
      </span>
    `)
    .join('') + `<button type="button" class="rev-add-btn" onclick="addRevInterval()" title="Adicionar intervalo">+</button>`;
}

function removeRevInterval(idx) {
  regIntervals.splice(idx, 1);
  renderRevIntervalTags();
}

function addRevInterval() {
  const val = parseInt(prompt('Quantos dias para a revisão? (ex: 15, 45, 90)', '15') || '0', 10);
  if (val > 0 && !regIntervals.includes(val)) {
    regIntervals.push(val);
    regIntervals.sort((a, b) => a - b);
    renderRevIntervalTags();
  }
}

function parseHmsToMinutes(str) {
  const parts = (str || '01:00:00').split(':').map(x => parseInt(x, 10) || 0);
  if (parts.length === 3) return Math.max(1, parts[0] * 60 + parts[1] + Math.round(parts[2] / 60));
  if (parts.length === 2) return Math.max(1, parts[0] * 60 + parts[1]);
  return Math.max(1, parts[0]);
}

function saveRegistroEstudo() {
  const plan = getActivePlan();
  const discId = document.getElementById('regDisciplina').value;
  const topId = document.getElementById('regTopico').value;
  const categoria = document.getElementById('regCategoria').value;
  const tempoStr = document.getElementById('regTempo').value;
  const minutos = parseHmsToMinutes(tempoStr);
  const material = document.getElementById('regMaterial').value;
  const acertos = parseInt(document.getElementById('regAcertos').value || '0', 10);
  const erros = parseInt(document.getElementById('regErros').value || '0', 10);
  const paginas = parseInt(document.getElementById('regPaginas').value || '0', 10);
  const teoriaFin = document.getElementById('regTeoriaFinalizada').checked;
  const progRev = document.getElementById('regProgramarRevisoes').checked;

  let dateStr = toISODate(0);
  if (regSelectedDatePreset === 'ontem') dateStr = toISODate(-1);
  else if (regSelectedDatePreset === 'outro') {
    dateStr = document.getElementById('regCustomDateInput').value || toISODate(0);
  }

  const disc = plan.disciplinas.find(d => d.id === discId) || plan.disciplinas[0];
  const top = disc.topicos.find(t => t.id === topId) || disc.topicos[0];

  plan.sessions.push({
    id: 'sess_' + Date.now(),
    date: dateStr,
    categoria,
    disciplinaId: disc.id,
    disciplinaNome: disc.nome,
    topicoId: top ? top.id : '',
    topicoNome: top ? top.assunto : disc.nome,
    minutos,
    acertos,
    erros,
    paginas,
    material
  });

  if (top) {
    if (teoriaFin) top.concluido = true;
    top.acertos = (top.acertos || 0) + acertos;
    top.erros = (top.erros || 0) + erros;
    top.ultimoEstudo = dateStr;
  }

  if (progRev && top) {
    regIntervals.forEach((days) => {
      const due = new Date(dateStr + 'T12:00:00');
      due.setDate(due.getDate() + days);
      plan.revisions.push({
        id: `rev_${Date.now()}_${days}`,
        dueDate: due.toISOString().slice(0, 10),
        intervalDays: days,
        disciplinaId: disc.id,
        disciplinaNome: disc.nome,
        topicoId: top.id,
        topicoNome: top.assunto,
        acertos,
        erros,
        status: 'programada'
      });
    });
  }

  saveState();
  closeRegistroModal();
  refreshAllViews();

  // EXACT TOAST FROM USER'S CARD 3 SCREENSHOT!
  showEstudeiToast(
    `<strong>Muito bom!</strong> Seu estudo de <span class="highlight-mint">${formatMinutesToHm(minutos)}</span> em <strong>${disc.nome}</strong> foi registrado.`
  );
}

/* ==========================================================================
   10. FLOW TIMER + ALWAYS-ON-TOP MINI WINDOW (DOCUMENT PIP + VIDEO PIP)
   ========================================================================== */
function formatSecondsToClock(sec) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

function updateFlowUI() {
  const displaySec = flowState.mode === 'stopwatch' ? flowState.elapsedSeconds : flowState.secondsLeft;
  const clockStr = formatSecondsToClock(displaySec);

  const clockEl = document.getElementById('flowClockDisplay');
  if (clockEl) clockEl.textContent = clockStr;

  const fabTimeEl = document.getElementById('flowFabTime');
  if (fabTimeEl) fabTimeEl.textContent = clockStr;

  const labelText = flowState.disciplinaNome
    ? `Flow • ${flowState.disciplinaNome.replace('TI - ', '')}`
    : 'Flow';
  const titleEl = document.getElementById('flowTitleLabel');
  if (titleEl) titleEl.textContent = flowState.mode === 'break' ? 'Break' : labelText;

  // Update browser tab title so it's always visible on Windows taskbar too
  if (flowState.running) {
    document.title = `[${clockStr}] ${labelText} — Estudei Pro`;
  } else {
    document.title = `Estudei Pro ⚡ Planejamento, Flow Timer & Automação Tec`;
  }

  // Update Play/Pause icon
  document.getElementById('flowPlaySvg').style.display = flowState.running ? 'none' : 'block';
  document.getElementById('flowPauseSvg').style.display = flowState.running ? 'block' : 'none';

  // Update cycle pill fill + dots
  const totalSec = (flowState.mode === 'break' ? flowState.breakMinutes : flowState.flowMinutes) * 60;
  const progressPct = flowState.mode === 'stopwatch'
    ? 100
    : Math.min(100, Math.max(8, Math.round(((totalSec - flowState.secondsLeft) * 100) / Math.max(1, totalSec))));

  const dotsContainer = document.getElementById('flowCycleDotsContainer');
  if (dotsContainer) {
    const parts = [];
    for (let c = 1; c <= flowState.totalCycles; c++) {
      if (c === flowState.currentCycle) {
        parts.push(`
          <div class="flow-cycle-pill">
            <div class="flow-cycle-pill-fill" style="width:${progressPct}%;"></div>
          </div>
        `);
      } else {
        parts.push(`<div class="flow-cycle-dot ${c < flowState.currentCycle ? 'done' : ''}"></div>`);
      }
    }
    dotsContainer.innerHTML = parts.join('');
  }

  // Sync Document Picture-in-Picture window if open
  if (flowState.pipWindow && !flowState.pipWindow.closed) {
    const pipClock = flowState.pipWindow.document.getElementById('pipClockDigits');
    const pipLabel = flowState.pipWindow.document.getElementById('pipModeLabel');
    const pipBtn = flowState.pipWindow.document.getElementById('pipPlayBtn');
    const pipFill = flowState.pipWindow.document.getElementById('pipPillFill');
    if (pipClock) pipClock.textContent = clockStr;
    if (pipLabel) pipLabel.textContent = flowState.mode === 'break' ? 'Break' : labelText;
    if (pipBtn) pipBtn.innerHTML = flowState.running ? '<b>||</b>' : '▶';
    if (pipFill) pipFill.style.width = `${progressPct}%`;
  }

  // Sync Canvas PiP fallback if active
  if (flowState.pipCanvas) {
    drawFlowCanvasFrame(clockStr, labelText, progressPct);
  }
}

function toggleFlowStartPause() {
  flowState.running = !flowState.running;
  if (flowState.running) {
    flowState.lastTickMs = Date.now();
    if (!flowState.intervalId) {
      flowState.intervalId = setInterval(tickFlowTimer, 250);
    }
  } else {
    if (flowState.intervalId) {
      clearInterval(flowState.intervalId);
      flowState.intervalId = null;
    }
  }
  updateFlowUI();
}

function tickFlowTimer() {
  if (!flowState.running) return;
  const now = Date.now();
  const deltaSec = Math.floor((now - (flowState.lastTickMs || now)) / 1000);
  if (deltaSec < 1) return;
  flowState.lastTickMs += deltaSec * 1000;

  flowState.elapsedSeconds += deltaSec;

  if (flowState.mode !== 'stopwatch') {
    flowState.secondsLeft = Math.max(0, flowState.secondsLeft - deltaSec);
    if (flowState.secondsLeft === 0) {
      playFlowChime();
      if (flowState.mode === 'flow') {
        showEstudeiToast(`<strong>Ciclo Flow concluído!</strong> Bloco de ${flowState.flowMinutes}min em <strong>${flowState.disciplinaNome}</strong> finalizado.`);
        if (flowState.currentCycle < flowState.totalCycles) {
          flowState.currentCycle++;
        } else {
          flowState.currentCycle = 1;
        }
        flowState.mode = 'break';
        flowState.secondsLeft = flowState.breakMinutes * 60;
      } else {
        flowState.mode = 'flow';
        flowState.secondsLeft = flowState.flowMinutes * 60;
      }
      if (!flowState.autoStart) {
        flowState.running = false;
      }
    }
  }
  updateFlowUI();
}

function playFlowChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.18); // A5
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.65);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.65);
  } catch (e) {}
}

function resetFlowTimer() {
  flowState.running = false;
  flowState.secondsLeft = flowState.flowMinutes * 60;
  flowState.elapsedSeconds = 0;
  updateFlowUI();
}

function setFlowDuration(mins, evt) {
  if (evt) evt.stopPropagation();
  flowState.mode = 'flow';
  flowState.flowMinutes = mins;
  flowState.secondsLeft = mins * 60;
  flowState.elapsedSeconds = 0;
  document.querySelectorAll('#flowDurationSubmenu .flow-submenu-option').forEach(el => {
    el.classList.toggle('selected', Number(el.getAttribute('data-min')) === mins);
  });
  updateFlowUI();
  closeFlowMenu();
}

function setCustomFlowDuration(evt) {
  if (evt) evt.stopPropagation();
  const val = parseInt(prompt('Quantos minutos para o seu Flow?', String(flowState.flowMinutes)) || '0', 10);
  if (val > 0 && val <= 300) {
    setFlowDuration(val);
  }
}

function setBreakDuration(mins, evt) {
  if (evt) evt.stopPropagation();
  flowState.breakMinutes = mins;
  if (flowState.mode === 'break') flowState.secondsLeft = mins * 60;
  updateFlowUI();
  closeFlowMenu();
}

function cycleFlowCount(evt) {
  if (evt) evt.stopPropagation();
  const counts = [2, 4, 6];
  const next = counts[(counts.indexOf(flowState.totalCycles) + 1) % counts.length] || 4;
  flowState.totalCycles = next;
  flowState.currentCycle = 1;
  document.getElementById('flowCycleCountLabel').textContent = `${next}x`;
  updateFlowUI();
}

function toggleFlowAutoStart(evt) {
  if (evt) evt.stopPropagation();
  flowState.autoStart = !flowState.autoStart;
  document.getElementById('flowAutoStartLabel').textContent = flowState.autoStart ? 'On ›' : 'Off ›';
}

function toggleFlowCountUpMode(evt) {
  if (evt) evt.stopPropagation();
  if (flowState.mode === 'stopwatch') {
    flowState.mode = 'flow';
    flowState.secondsLeft = flowState.flowMinutes * 60;
    document.getElementById('flowCountModeLabel').textContent = 'Cronômetro Livre (00:00 ↑)';
  } else {
    flowState.mode = 'stopwatch';
    flowState.elapsedSeconds = 0;
    document.getElementById('flowCountModeLabel').textContent = 'Voltar p/ Modo Flow (Contagem ↓)';
  }
  updateFlowUI();
  closeFlowMenu();
}

function toggleFlowMenu(evt) {
  if (evt) evt.stopPropagation();
  const menu = document.getElementById('flowDropdownMenu');
  const btn = document.getElementById('flowMenuBtn');
  const isOpen = menu.classList.toggle('open');
  btn.classList.toggle('active', isOpen);
}

function closeFlowMenu() {
  document.getElementById('flowDropdownMenu')?.classList.remove('open');
  document.getElementById('flowMenuBtn')?.classList.remove('active');
}

function toggleMinimizeFlow(minimize) {
  document.getElementById('flowWidget').classList.toggle('is-minimized', minimize);
}

function startFlowForDiscipline(discId, topicoId = null) {
  const plan = getActivePlan();
  const disc = plan.disciplinas.find(d => d.id === discId) || plan.disciplinas[0];
  if (!disc) return;
  const top = topicoId ? disc.topicos.find(t => t.id === topicoId) : disc.topicos.find(t => !t.concluido) || disc.topicos[0];

  flowState.disciplinaId = disc.id;
  flowState.disciplinaNome = disc.nome;
  flowState.topicoId = top ? top.id : '';
  flowState.topicoNome = top ? top.assunto : disc.nome;

  toggleMinimizeFlow(false);
  if (!flowState.running) toggleFlowStartPause();
  else updateFlowUI();
}

function startFlowForRevision(revId) {
  const plan = getActivePlan();
  const rev = (plan.revisions || []).find(r => r.id === revId);
  if (!rev) return;
  startFlowForDiscipline(rev.disciplinaId, rev.topicoId);
}

function promptChangeFlowSubject() {
  const plan = getActivePlan();
  const listStr = plan.disciplinas.map((d, i) => `${i + 1}. ${d.nome}`).join('\n');
  const choice = parseInt(prompt(`Escolha o número da matéria para o Flow Timer:\n\n${listStr}`, '1') || '0', 10);
  if (choice >= 1 && choice <= plan.disciplinas.length) {
    const disc = plan.disciplinas[choice - 1];
    startFlowForDiscipline(disc.id);
  }
  closeFlowMenu();
}

function finishFlowAndOpenRegistro() {
  closeFlowMenu();
  if (flowState.running) toggleFlowStartPause();
  const minsStudied = Math.max(1, Math.round(flowState.elapsedSeconds / 60) || flowState.flowMinutes);
  openRegistroModal(flowState.disciplinaId, flowState.topicoId, minsStudied);
}

/* ==========================================================================
   11. MINI-RELÓGIO DIGITAL FLUTUANTE FORA DO NAVEGADOR (DOCUMENT PIP / VIDEO PIP)
   ========================================================================== */
async function popOutFlowMiniWindow() {
  closeFlowMenu();

  // 1. Native Chrome/Edge Document Picture-in-Picture API (Interactive Frosted Glass Flow Window Always-on-Top!)
  if ('documentPictureInPicture' in window) {
    try {
      const pipWin = await window.documentPictureInPicture.requestWindow({
        width: 310,
        height: 220
      });
      flowState.pipWindow = pipWin;
      pipWin.document.head.innerHTML = `
        <style>
          body {
            margin: 0;
            height: 100vh;
            display: flex;
             flex-direction: column;
            align-items: center;
            justify-content: space-between;
            padding: 14px 18px 18px;
            box-sizing: border-box;
            background: rgba(250, 252, 255, 0.94);
            font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
            color: #27272A;
            user-select: none;
          }
          .top { width: 100%; display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: #64748B; }
          .label { font-size: 15px; font-weight: 500; color: #27272A; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 260px; }
          .digits { font-size: 58px; font-weight: 300; letter-spacing: -1.5px; font-variant-numeric: tabular-nums; line-height: 1; }
          .dots { display: flex; align-items: center; gap: 5px; }
          .pill { width: 34px; height: 9px; border-radius: 99px; background: #C6D7D1; overflow: hidden; }
          .fill { height: 100%; background: #216E55; width: 25%; }
          .dot { width: 9px; height: 9px; border-radius: 50%; background: #C6D7D1; }
          .play { width: 44px; height: 44px; border-radius: 50%; border: none; background: #C6D7D1; color: #216E55; font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
        </style>
      `;
      pipWin.document.body.innerHTML = `
        <div class="top">
          <span>⚡ Estudei Flow</span>
          <span style="cursor:pointer;" id="pipResetBtn" title="Reiniciar">↺</span>
        </div>
        <div class="label" id="pipModeLabel">Flow</div>
        <div class="digits" id="pipClockDigits">23:16</div>
        <div class="dots">
          <div class="pill"><div class="fill" id="pipPillFill"></div></div>
          <div class="dot"></div><div class="dot"></div><div class="dot"></div>
        </div>
        <button class="play" id="pipPlayBtn">▶</button>
      `;
      pipWin.document.getElementById('pipPlayBtn').addEventListener('click', () => toggleFlowStartPause());
      pipWin.document.getElementById('pipResetBtn').addEventListener('click', () => resetFlowTimer());
      updateFlowUI();
      return;
    } catch (err) {
      console.warn('Document PiP fallback para Canvas Video PiP:', err);
    }
  }

  // 2. Universal HTML5 Canvas -> Video Picture-in-Picture Fallback (Works on any browser!)
  try {
    if (!flowState.pipCanvas) {
      const canvas = document.createElement('canvas');
      canvas.width = 360;
      canvas.height = 220;
      flowState.pipCanvas = canvas;
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      flowState.pipVideo = video;
      updateFlowUI();
      video.srcObject = canvas.captureStream(15);
      await video.play();
    }
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    } else {
      await flowState.pipVideo.requestPictureInPicture();
    }
  } catch (e) {
    showEstudeiToast(`<strong>Dica:</strong> O relógio também fica visível em tempo real no título da aba <code>[23:16]</code>!`);
  }
}

function drawFlowCanvasFrame(clockStr, labelText, progressPct) {
  const c = flowState.pipCanvas;
  if (!c) return;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(0, 0, c.width, c.height);

  ctx.fillStyle = '#27272A';
  ctx.font = '500 18px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(labelText, c.width / 2, 46);

  ctx.font = '300 74px Inter, sans-serif';
  ctx.fillText(clockStr, c.width / 2, 130);

  // Pill + Dots
  ctx.fillStyle = '#C6D7D1';
  ctx.beginPath();
  ctx.roundRect(c.width / 2 - 42, 155, 38, 10, 5);
  ctx.fill();

  ctx.fillStyle = '#216E55';
  ctx.beginPath();
  ctx.roundRect(c.width / 2 - 42, 155, (38 * progressPct) / 100, 10, 5);
  ctx.fill();

  [10, 24, 38].forEach((offset) => {
    ctx.fillStyle = '#C6D7D1';
    ctx.beginPath();
    ctx.arc(c.width / 2 + offset, 160, 5, 0, Math.PI * 2);
    ctx.fill();
  });
}

/* ==========================================================================
   12. DRAGGABLE FLOW WIDGET
   ========================================================================== */
function initFlowDraggable() {
  const widget = document.getElementById('flowWidget');
  const handle = document.getElementById('flowDragHandle');
  if (!widget || !handle) return;

  let dragging = false;
  let startX = 0;
  let startY = 0;
  let origRight = 26;
  let origBottom = 26;

  handle.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const rect = widget.getBoundingClientRect();
    origRight = window.innerWidth - rect.right;
    origBottom = window.innerHeight - rect.bottom;
    handle.setPointerCapture(e.pointerId);
  });

  handle.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    widget.style.right = `${Math.max(10, origRight - dx)}px`;
    widget.style.bottom = `${Math.max(10, origBottom - dy)}px`;
  });

  handle.addEventListener('pointerup', () => {
    dragging = false;
  });
}

/* ==========================================================================
   13. AUTOMAÇÃO TEC CONCURSOS (POLLING /api/tec-queue + PARSER + SIMULADOR)
   ========================================================================== */
function setupBookmarklet() {
  const link = document.getElementById('bookmarkletLink');
  if (!link) return;
  const code = `javascript:(function(){var items=[];var rows=document.querySelectorAll('table tbody tr');rows.forEach(function(r){var td=r.querySelectorAll('td');if(td.length>=3){var l=td[0].innerText.trim();var n=Array.from(td).slice(1).map(function(x){return parseInt(x.innerText.replace(/\\D/g,''),10)}).filter(function(x){return !isNaN(x)});if(l&&n.length>=2){items.push({disciplina:l,assunto:l,acertos:n.length>=3?n[1]:n[0],erros:n.length>=3?n[2]:n[1],tempoMinutos:20});}}});fetch('http://localhost:3000/api/tec-sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:items})}).then(function(){alert('Estudei Pro: '+items.length+' atividades sincronizadas com sucesso!');});})();`;
  link.setAttribute('href', code);
}

async function pollTecQueue() {
  try {
    const res = await fetch('/api/tec-queue?consume=1');
    const data = await res.json();
    if (data && data.ok && Array.isArray(data.items) && data.items.length > 0) {
      applySyncedTecItems(data.items);
    }
  } catch (e) {}
}

function applySyncedTecItems(items) {
  const plan = getActivePlan();
  let totalAc = 0;
  let totalEr = 0;

  items.forEach((item) => {
    const discQuery = (item.disciplina || '').toLowerCase();
    const assQuery = (item.assunto || '').toLowerCase();

    let matchedDisc = plan.disciplinas.find(d =>
      d.nome.toLowerCase().includes(discQuery) || discQuery.includes(d.nome.toLowerCase().replace('ti - ', ''))
    );
    if (!matchedDisc) matchedDisc = plan.disciplinas[0];

    let matchedTop = matchedDisc.topicos.find(t =>
      t.assunto.toLowerCase().includes(assQuery) || assQuery.includes(t.assunto.toLowerCase())
    );
    if (!matchedTop) matchedTop = matchedDisc.topicos[0];

    const ac = Number(item.acertos || 0);
    const er = Number(item.erros || 0);
    const mins = Number(item.tempoMinutos || Math.max(5, (ac + er) * 2));
    totalAc += ac;
    totalEr += er;

    plan.sessions.push({
      id: 'tec_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      date: item.date || toISODate(0),
      categoria: 'Questões',
      disciplinaId: matchedDisc.id,
      disciplinaNome: matchedDisc.nome,
      topicoId: matchedTop ? matchedTop.id : '',
      topicoNome: matchedTop ? matchedTop.assunto : (item.assunto || matchedDisc.nome),
      minutos: mins,
      acertos: ac,
      erros: er,
      paginas: 0,
      material: '⚡ Automação Tec Concursos (/estatisticas/atividades)'
    });

    if (matchedTop) {
      matchedTop.acertos = (matchedTop.acertos || 0) + ac;
      matchedTop.erros = (matchedTop.erros || 0) + er;
      matchedTop.ultimoEstudo = toISODate(0);
      if (ac + er >= 10) matchedTop.concluido = true;
    }
  });

  saveState();
  refreshAllViews();
  showEstudeiToast(
    `<strong>⚡ Sincronizado com o Tec Concursos!</strong> Foram contabilizadas <span class="highlight-mint">${totalAc} certas</span> e <strong style="color:#F26B5B;">${totalEr} erradas</strong> automaticamente.`
  );
}

function parsePastedTecTable() {
  const raw = document.getElementById('tecPasteArea').value.trim();
  if (!raw) {
    alert('Cole pelo menos uma linha da sua página de atividades do Tec Concursos.');
    return;
  }
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  const items = [];
  lines.forEach((line) => {
    const parts = line.split(/\||\t|;/).map(s => s.trim()).filter(Boolean);
    if (parts.length >= 3) {
      const nums = parts.slice(1).map(p => parseInt(p.replace(/\D/g, ''), 10)).filter(n => !isNaN(n));
      if (nums.length >= 2) {
        const acertos = nums.length >= 3 ? nums[1] : nums[0];
        const erros = nums.length >= 3 ? nums[2] : nums[1];
        items.push({
          disciplina: parts[0],
          assunto: parts.length >= 4 && isNaN(parseInt(parts[1], 10)) ? parts[1] : parts[0],
          acertos,
          erros,
          tempoMinutos: Math.max(10, (acertos + erros) * 2)
        });
      }
    }
  });
  if (items.length === 0) {
    alert('Formato não reconhecido. Use: Matéria | Assunto | Total | Certas | Erradas');
    return;
  }
  applySyncedTecItems(items);
  document.getElementById('tecPasteArea').value = '';
}

async function simulateTecSyncBatch() {
  const sampleBatch = [
    {
      disciplina: 'TI - Desenvolvimento de Sistemas',
      assunto: 'Programação Orientada a Objetos (POO)',
      acertos: 22,
      erros: 3,
      tempoMinutos: 45
    },
    {
      disciplina: 'TI - Redes de Computadores',
      assunto: 'Protocolo IP',
      acertos: 18,
      erros: 4,
      tempoMinutos: 35
    },
    {
      disciplina: 'Noções de Direito Administrativo',
      assunto: 'Atos Administrativos',
      acertos: 16,
      erros: 4,
      tempoMinutos: 30
    }
  ];
  try {
    await fetch('/api/tec-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: sampleBatch })
    });
    await pollTecQueue();
  } catch (e) {
    applySyncedTecItems(sampleBatch);
  }
}

/* ==========================================================================
   14. REPLANEJAR, NOVO PLANO PERSONALIZADO & SIMULADO MODALS
   ========================================================================== */
function openReplanejarModal() {
  const plan = getActivePlan();
  document.getElementById('cfgCycleHours').value = plan.weeklyGoalHours || 24;
  document.getElementById('cfgCycleQuestions').value = plan.weeklyGoalQuestions || 180;

  const container = document.getElementById('cfgDisciplinasWeightsList');
  container.innerHTML = plan.disciplinas
    .map(d => `
      <div style="display:grid;grid-template-columns:1fr 120px 140px;gap:10px;align-items:center;padding:8px 10px;background:#F8FAFC;border-radius:8px;border:1px solid #E2E8F0;">
        <div style="font-weight:700;font-size:13px;color:#1E293B;">${d.nome}</div>
        <div>
          <label style="font-size:10px;color:#64748B;display:block;">PESO (1-5)</label>
          <input type="number" data-wdisc="${d.id}" value="${d.peso || 2}" min="1" max="5" style="width:100%;border:1px solid #CBD5E1;border-radius:6px;padding:4px 6px;" />
        </div>
        <div>
          <label style="font-size:10px;color:#64748B;display:block;">DIFICULDADE (1-5)</label>
          <input type="number" data-ddisc="${d.id}" value="${d.dificuldade || 2}" min="1" max="5" style="width:100%;border:1px solid #CBD5E1;border-radius:6px;padding:4px 6px;" />
        </div>
      </div>
    `)
    .join('');

  document.getElementById('replanejarModalBackdrop').classList.add('open');
}

function closeReplanejarModal() {
  document.getElementById('replanejarModalBackdrop').classList.remove('open');
}

function saveReplanejamento() {
  const plan = getActivePlan();
  plan.weeklyGoalHours = Math.max(4, parseInt(document.getElementById('cfgCycleHours').value || '24', 10));
  plan.weeklyGoalQuestions = Math.max(10, parseInt(document.getElementById('cfgCycleQuestions').value || '180', 10));

  document.querySelectorAll('[data-wdisc]').forEach((inp) => {
    const id = inp.getAttribute('data-wdisc');
    const disc = plan.disciplinas.find(d => d.id === id);
    if (disc) disc.peso = Math.min(5, Math.max(1, parseInt(inp.value || '2', 10)));
  });
  document.querySelectorAll('[data-ddisc]').forEach((inp) => {
    const id = inp.getAttribute('data-ddisc');
    const disc = plan.disciplinas.find(d => d.id === id);
    if (disc) disc.dificuldade = Math.min(5, Math.max(1, parseInt(inp.value || '2', 10)));
  });

  saveState();
  closeReplanejarModal();
  refreshAllViews();
  showEstudeiToast(`<strong>Planejamento atualizado!</strong> Seu ciclo de <strong>${plan.weeklyGoalHours}h</strong> foi recalculado.`);
}

function editWeeklyGoals() {
  openReplanejarModal();
}

function openNovoPlanoModal() {
  document.getElementById('novoPlanoModalBackdrop').classList.add('open');
}

function closeNovoPlanoModal() {
  document.getElementById('novoPlanoModalBackdrop').classList.remove('open');
}

async function importFromTecGuideUrl() {
  const urlVal = document.getElementById('newPlanTecUrl').value.trim();
  if (!urlVal) return alert('Cole a URL do guia do Tec Concursos.');
  try {
    const res = await fetch(`/api/extract-tec-guide?url=${encodeURIComponent(urlVal)}`);
    const data = await res.json();
    if (!data.ok) return alert('Erro: ' + data.error);
    const lines = [];
    data.cadernos.forEach((c) => {
      lines.push(`# ${c.disciplina}`);
      lines.push(`1. Caderno Completo (${c.totalQuestoes} questões no Tec)`);
    });
    document.getElementById('newPlanRawText').value = lines.join('\n');
    if (!document.getElementById('newPlanName').value) {
      document.getElementById('newPlanName').value = `Guia Tec #${data.guiaId}`;
    }
    showEstudeiToast(`<strong>Guia encontrado!</strong> ${data.cadernos.length} disciplinas importadas do Tec Concursos.`);
  } catch (e) {
    alert('Não foi possível importar essa URL.');
  }
}

function createCustomPlanFromModal() {
  const name = document.getElementById('newPlanName').value.trim() || 'Meu Plano Personalizado';
  const examDate = document.getElementById('newPlanExamDate').value || toISODate(120);
  const raw = document.getElementById('newPlanRawText').value.trim();

  const colors = ['#00CDA0', '#6735BC', '#3B82F6', '#F59E0B', '#EC4899', '#10B981', '#8B5CF6', '#06B6D4'];
  const disciplinas = [];

  if (raw) {
    let currentDisc = null;
    raw.split('\n').forEach((line) => {
      const clean = line.trim();
      if (!clean) return;
      if (clean.startsWith('#')) {
        const dId = 'cust_' + Date.now() + '_' + disciplinas.length;
        currentDisc = {
          id: dId,
          agrupamento: 'PLANO PERSONALIZADO',
          nome: clean.replace(/^#+\s*/, ''),
          cor: colors[disciplinas.length % colors.length],
          peso: 2,
          dificuldade: 2,
          totalQuestoes: 100,
          url: 'https://www.tecconcursos.com.br',
          topicos: []
        };
        disciplinas.push(currentDisc);
      } else {
        if (!currentDisc) {
          currentDisc = {
            id: 'cust_' + Date.now() + '_0',
            agrupamento: 'PLANO PERSONALIZADO',
            nome: 'Disciplina Geral',
            cor: colors[0],
            peso: 2,
            dificuldade: 2,
            totalQuestoes: 100,
            url: 'https://www.tecconcursos.com.br',
            topicos: []
          };
          disciplinas.push(currentDisc);
        }
        clean.split(';').map(s => s.trim()).filter(Boolean).forEach((sub) => {
          currentDisc.topicos.push({
            id: `${currentDisc.id}_${currentDisc.topicos.length + 1}`,
            assunto: sub.replace(/^\d+[\.\-\)]\s*/, ''),
            questoesTexto: 'Personalizado',
            questoes: 25,
            nivel: 0,
            concluido: false,
            acertos: 0,
            erros: 0,
            ultimoEstudo: null
          });
        });
      }
    });
  }

  const newPlan = {
    id: 'plan_' + Date.now(),
    nome: name,
    examDate,
    weeklyGoalHours: 20,
    weeklyGoalQuestions: 150,
    disciplinas: disciplinas.length > 0 ? disciplinas : JSON.parse(JSON.stringify(window.TRT1_TI_GUIDE)),
    sessions: [],
    revisions: [],
    simulados: []
  };

  state.plans.push(newPlan);
  state.activePlanId = newPlan.id;
  saveState();
  closeNovoPlanoModal();
  refreshAllViews();
  showEstudeiToast(`<strong>Plano criado!</strong> Você agora está no plano <strong>${newPlan.nome}</strong>.`);
}

function onSwitchPlan(planId) {
  state.activePlanId = planId;
  saveState();
  refreshAllViews();
}

function openSimuladoModal() {
  document.getElementById('simuladoModalBackdrop').classList.add('open');
}

function closeSimuladoModal() {
  document.getElementById('simuladoModalBackdrop').classList.remove('open');
}

function saveSimulado() {
  const plan = getActivePlan();
  const nome = document.getElementById('simNome').value.trim() || 'Simulado';
  const acertos = parseInt(document.getElementById('simAcertos').value || '0', 10);
  const erros = parseInt(document.getElementById('simErros').value || '0', 10);
  const tempo = document.getElementById('simTempo').value.trim() || '03:00';

  plan.simulados.push({
    id: 'sim_' + Date.now(),
    date: toISODate(0),
    nome,
    acertos,
    erros,
    tempo
  });

  saveState();
  closeSimuladoModal();
  refreshAllViews();
  showEstudeiToast(`<strong>Simulado registrado!</strong> ${acertos} acertos contabilizados.`);
}

function exportBackupJSON() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `estudei_pro_backup_${toISODate(0)}.json`;
  a.click();
}

/* ==========================================================================
   15. BOOTSTRAP ON DOM READY
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  applyTheme();
  refreshAllViews();
  updateFlowUI();
  initFlowDraggable();

  // Sidebar collapse button
  document.getElementById('btnToggleSidebar')?.addEventListener('click', () => {
    document.getElementById('appShell')?.classList.toggle('sidebar-collapsed');
  });

  // Close Flow dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#flowCardBox')) {
      closeFlowMenu();
    }
  });

  // Poll Tec Concursos queue every 3 seconds
  setInterval(pollTecQueue, 3000);
});
