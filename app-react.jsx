const { useState, useEffect, useRef, useMemo } = React;

const STORAGE_KEY = 'estudei_react_v5_flow_dark';
const FLOW_STORAGE_KEY = `${STORAGE_KEY}_flow_progress`;
const BACKUP_CSV_HEADER = ['formato', 'versao', 'exportado_em', 'dados_json'];

function csvEscape(value) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const input = String(text || '').replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (quoted && ch === '"' && input[i + 1] === '"') { cell += '"'; i += 1; }
    else if (ch === '"') quoted = !quoted;
    else if (!quoted && ch === ';') { row.push(cell); cell = ''; }
    else if (!quoted && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && input[i + 1] === '\n') i += 1;
      row.push(cell); cell = '';
      if (row.some((part) => part !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (quoted) throw new Error('O CSV está incompleto: há aspas sem fechamento.');
  row.push(cell);
  if (row.some((part) => part !== '')) rows.push(row);
  return rows;
}

function loadSavedFlow() {
  const defaults = {
    minimized: false, timerDark: true, running: false, mode: 'flow', studyContext: 'topic', flowMinutes: 25,
    breakMinutes: 5, totalCycles: 4, completedCyclesToday: 0, lastActiveDate: toISODate(0),
    secondsLeft: 25 * 60, elapsedInCurrentRunSec: 0, startedAtTs: null, autoStartBreak: false,
    autoPopOutOnPlay: true, planId: 'plan_trt1_ti', disciplinaId: '63615', topicoId: '63615_1',
    menuOpen: false, pipActive: false
  };
  try {
    const saved = JSON.parse(localStorage.getItem(FLOW_STORAGE_KEY) || 'null');
    if (saved && typeof saved === 'object') return { ...defaults, ...saved, running: false, menuOpen: false, pipActive: false };
  } catch (e) {}
  return defaults;
}

function toISODate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function formatNowTimeWithSeconds() {
  const d = new Date();
  return d.toTimeString().slice(0, 8); // HH:MM:SS
}

function formatTimeFromTimestamp(ts) {
  if (!ts) return formatNowTimeWithSeconds();
  const d = new Date(ts);
  return d.toTimeString().slice(0, 8); // HH:MM:SS
}

function formatMinutesToHm(totalMin) {
  const m = Math.max(0, Math.round(Number(totalMin) || 0));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return `${h}h${String(rem).padStart(2, '0')}min`;
}

function formatExactSeconds(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const remS = s % 60;
  if (h > 0) {
    return `${h}h ${String(m).padStart(2, '0')}m ${String(remS).padStart(2, '0')}s`;
  }
  return `${String(m).padStart(2, '0')}m ${String(remS).padStart(2, '0')}s`;
}

function formatSecondsToClock(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

// Helper for Monday-to-Sunday week dates (for the W chart in Image 3)
function getWeekDaysMonToSun(weekOffset = 0) {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sun, 1 = Mon, ...
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday + weekOffset * 7);

  const days = [];
  const shortLetters = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const ptNames = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    days.push({
      iso,
      dateObj: d,
      letter: shortLetters[i],
      ptName: ptNames[i]
    });
  }
  return days;
}

function formatWeekRangeLabel(days) {
  if (!days || days.length < 7) return '';
  const months = [
    'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
    'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
  ];
  const first = days[0].dateObj;
  const last = days[6].dateObj;
  const m1 = months[first.getMonth()];
  const m2 = months[last.getMonth()];
  const d1 = first.getDate();
  const d2 = last.getDate();
  const yr = last.getFullYear();
  if (m1 === m2) {
    return `${m1} ${d1}–${d2}, ${yr}`;
  }
  return `${m1} ${d1} – ${m2} ${d2}, ${yr}`;
}

function createInitialPlan() {
  const baseGuide = (window.TRT1_TI_GUIDE || []).map((d) => ({
    ...d,
    topicos: (d.topicos || []).map((t) => ({
      ...t,
      concluido: false,
      acertos: 0,
      erros: 0,
      ultimoEstudo: null
    }))
  }));

  return {
    id: 'plan_trt1_ti',
    nome: 'TRT 1 / 2025 - Analista Judiciário - TI (Tec Concursos)',
    weeklyGoalHours: 20,
    weeklyGoalQuestions: 150,
    disciplinas: baseGuide,
    sessions: [],
    errorNotebook: [],
    manualStreakDays: {}
  };
}

function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.16);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  } catch (e) {}
}

/* ==========================================================================
   MAIN REACT APPLICATION
   ========================================================================== */
function App() {
  const [appData, setAppData] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.plans && parsed.plans.length > 0) return parsed;
      }
    } catch (e) {}
    return {
      theme: 'dark',
      activePlanId: 'plan_trt1_ti',
      plans: [createInitialPlan()]
    };
  });

  const [activeTab, setActiveTab] = useState('flow');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [toast, setToast] = useState(null);

  // Modal Registro Manual de Estudo (Padrão 25 min, primeiro seleciona Edital TRT)
  const [regModal, setRegModal] = useState({
    open: false,
    planId: 'plan_trt1_ti',
    discId: '63615',
    topicoId: '',
    minutos: 25
  });
  const [newPlanModalOpen, setNewPlanModalOpen] = useState(false);

  // Modal "Registrar Acertos?" que abre ao concluir os 25 min ou ao apertar "Finalizar"
  const [finishPrompt, setFinishPrompt] = useState({
    open: false,
    elapsedSec: 0,
    startedAtTs: null,
    endedAtTs: null,
    planId: 'plan_trt1_ti',
    discId: '63615',
    topicoId: '63615_1',
    isFullCycleComplete: false,
    acertos: 0,
    erros: 0,
    notaErro: ''
  });

  // Edital state
  const [editalFilter, setEditalFilter] = useState('all');
  const [editalSearch, setEditalSearch] = useState('');
  const [expandedDiscs, setExpandedDiscs] = useState({ '63615': true, '63611': true });

  // FLOW TIMER STATE (Modo Dark igual à Imagem 2 por padrão, 25 min cada bolinha, reset diário a cada 24h)
  const [flow, setFlow] = useState(() => ({
    ...loadSavedFlow()
  }));

  const pipWindowRef = useRef(null);
  const pipVideoRef = useRef(null);
  const pipCanvasRef = useRef(null);
  const backupFileInputRef = useRef(null);

  // Save to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
    } catch (e) {}
    document.body.classList.toggle('theme-light', appData.theme === 'light');
  }, [appData]);

  useEffect(() => {
    try {
      const { running, menuOpen, pipActive, ...portableFlow } = flow;
      localStorage.setItem(FLOW_STORAGE_KEY, JSON.stringify(portableFlow));
    } catch (e) {}
  }, [flow]);

  // Verifica a cada 30 segundos se virou o dia (24h) para resetar as sessões/bolinhas e minutos do dia no timer!
  useEffect(() => {
    const checkDayReset = () => {
      const today = toISODate(0);
      setFlow((prev) => {
        if (prev.lastActiveDate !== today) {
          return {
            ...prev,
            lastActiveDate: today,
            completedCyclesToday: 0,
            running: false,
            startedAtTs: null
          };
        }
        return prev;
      });
    };
    checkDayReset();
    const id = setInterval(checkDayReset, 30000);
    return () => clearInterval(id);
  }, []);

  const activePlan = useMemo(() => {
    return appData.plans.find((p) => p.id === appData.activePlanId) || appData.plans[0];
  }, [appData]);

  const currentFlowPlan = useMemo(() => {
    return appData.plans.find((p) => p.id === flow.planId) || activePlan;
  }, [appData.plans, flow.planId, activePlan]);

  const currentFlowDisc = useMemo(() => {
    return currentFlowPlan.disciplinas.find((d) => d.id === flow.disciplinaId) || currentFlowPlan.disciplinas[0];
  }, [currentFlowPlan, flow.disciplinaId]);

  const currentFlowTopic = useMemo(() => {
    if (!currentFlowDisc) return null;
    return currentFlowDisc.topicos.find((t) => t.id === flow.topicoId) || currentFlowDisc.topicos[0];
  }, [currentFlowDisc, flow.topicoId]);

  // Minutos e segundos concluídos SOMENTE HOJE (no dia atual, resetando a cada 24h)
  const todayStats = useMemo(() => {
    const today = toISODate(0);
    const todaySessions = (activePlan.sessions || []).filter((s) => s.date === today);
    let todaySec = 0;
    let todayMin = 0;
    todaySessions.forEach((s) => {
      todaySec += Number(s.segundos || Number(s.minutos || 0) * 60);
      todayMin += Number(s.minutos || 0);
    });
    return {
      todayCount: todaySessions.length,
      todaySec,
      todayMin
    };
  }, [activePlan.sessions, flow.lastActiveDate]);

  function showToast(htmlMsg) {
    setToast(htmlMsg);
    setTimeout(() => {
      setToast((prev) => (prev === htmlMsg ? null : prev));
    }, 5000);
  }

  function updatePlanById(planId, updater) {
    setAppData((prev) => ({
      ...prev,
      plans: prev.plans.map((p) => (p.id === planId ? updater({ ...p }) : p))
    }));
  }

  function updateActivePlan(updater) {
    updatePlanById(activePlan.id, updater);
  }

  /* ========================================================================
     FUNÇÕES PARA EDITAR / CRIAR DISCIPLINAS E TÓPICOS (EDITAL, FLOW E REGISTRO)
     ======================================================================== */
  function handleRenameDiscipline(planId, discId, newName) {
    const clean = (newName || '').trim();
    if (!clean) return;
    updatePlanById(planId || activePlan.id, (plan) => ({
      ...plan,
      disciplinas: plan.disciplinas.map((d) => (d.id === discId ? { ...d, nome: clean } : d)),
      sessions: (plan.sessions || []).map((s) =>
        s.disciplinaId === discId ? { ...s, disciplinaNome: clean } : s
      ),
      errorNotebook: (plan.errorNotebook || []).map((e) =>
        e.disciplinaId === discId ? { ...e, disciplinaNome: clean } : e
      )
    }));
    showToast(`<strong>✓ Matéria atualizada para:</strong> <span class="highlight-mint">${clean}</span>`);
  }

  function handleAddDiscipline(planId, newName, initialTopicName = '1. Tópico Geral') {
    const clean = (newName || '').trim();
    if (!clean) return null;
    const targetPlanId = planId || activePlan.id;
    const newDiscId = 'disc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5);
    const newTopId = `${newDiscId}_1`;
    const palette = ['#1C82A6', '#5BC0DE', '#3B82F6', '#F59E0B', '#EC4899', '#0E4B60', '#10B981'];
    const newDisc = {
      id: newDiscId,
      agrupamento: 'MATÉRIAS DO EDITAL',
      nome: clean,
      peso: 1,
      cor: palette[Math.floor(Math.random() * palette.length)],
      totalQuestoes: 0,
      url: 'https://www.tecconcursos.com.br',
      topicos: [
        {
          id: newTopId,
          assunto: (initialTopicName || 'Tópico Geral').replace(/^\d+[\.\-\)]\s*/, ''),
          questoesTexto: 'Personalizado',
          questoes: 0,
          nivel: 0,
          concluido: false,
          acertos: 0,
          erros: 0,
          ultimoEstudo: null
        }
      ]
    };
    updatePlanById(targetPlanId, (plan) => ({
      ...plan,
      disciplinas: [...plan.disciplinas, newDisc]
    }));
    showToast(`<strong>✓ Nova matéria salva:</strong> <span class="highlight-mint">${clean}</span>`);
    return { discId: newDiscId, topicoId: newTopId };
  }

  function handleRenameTopic(planId, discId, topicoId, newAssunto) {
    const clean = (newAssunto || '').trim();
    if (!clean) return;
    updatePlanById(planId || activePlan.id, (plan) => ({
      ...plan,
      disciplinas: plan.disciplinas.map((d) => {
        if (d.id !== discId) return d;
        return {
          ...d,
          topicos: d.topicos.map((t) => (t.id === topicoId ? { ...t, assunto: clean } : t))
        };
      }),
      sessions: (plan.sessions || []).map((s) =>
        s.disciplinaId === discId && s.topicoId === topicoId ? { ...s, topicoNome: clean } : s
      ),
      errorNotebook: (plan.errorNotebook || []).map((e) =>
        e.disciplinaId === discId && e.topicoId === topicoId ? { ...e, tema: clean } : e
      )
    }));
    showToast(`<strong>✓ Tópico atualizado para:</strong> <span class="highlight-mint">${clean}</span>`);
  }

  function handleAddTopic(planId, discId, newAssunto) {
    const clean = (newAssunto || '').trim();
    if (!clean) return null;
    const targetPlanId = planId || activePlan.id;
    const newTopId = `${discId}_top_${Date.now()}`;
    updatePlanById(targetPlanId, (plan) => ({
      ...plan,
      disciplinas: plan.disciplinas.map((d) => {
        if (d.id !== discId) return d;
        return {
          ...d,
          topicos: [
            ...d.topicos,
            {
              id: newTopId,
              assunto: clean,
              questoesTexto: 'Personalizado',
              questoes: 0,
              nivel: 0,
              concluido: false,
              acertos: 0,
              erros: 0,
              ultimoEstudo: null
            }
          ]
        };
      })
    }));
    showToast(`<strong>✓ Novo tópico salvo:</strong> <span class="highlight-mint">${clean}</span>`);
    return newTopId;
  }

  function handleUpdateDisciplineWeight(planId, discId, newWeight) {
    const w = Math.max(1, Number(newWeight) || 1);
    updatePlanById(planId || activePlan.id, (plan) => ({
      ...plan,
      disciplinas: plan.disciplinas.map((d) => (d.id === discId ? { ...d, peso: w } : d))
    }));
  }

  /* ========================================================================
     FUNÇÃO QUE EFETIVAMENTE REGISTRA A SESSÃO NO HISTÓRICO (DE SEG A SEG)
     Chamada após o modal "Registrar acertos?" no fim dos 25 min ou ao clicar em Finalizar
     ======================================================================== */
  function commitFinishedFlowSession({
    planId,
    discId,
    topicoId,
    studyContext = 'topic',
    elapsedSec,
    startedAtTs,
    endedAtTs,
    acertos,
    erros,
    notaErro,
    isFullCycleComplete
  }) {
    const sec = Math.max(1, Math.floor(Number(elapsedSec) || 0));
    const mins = Math.max(1, Math.round(sec / 60));
    const ac = Math.max(0, Number(acertos) || 0);
    const er = Math.max(0, Number(erros) || 0);

    const planObj = appData.plans.find((p) => p.id === planId) || activePlan;
    const isAnkiReview = studyContext === 'anki';
    const isMateriaReview = studyContext === 'revisao';
    const disc = isAnkiReview ? null : (planObj.disciplinas.find((d) => d.id === discId) || planObj.disciplinas[0]);
    const top = disc ? disc.topicos.find((t) => t.id === topicoId) || disc.topicos[0] : null;
    if (!disc && !isAnkiReview) return;

    const today = toISODate(0);
    const startClock = formatTimeFromTimestamp(startedAtTs || Date.now() - sec * 1000);
    const endClock = formatTimeFromTimestamp(endedAtTs || Date.now());
    const temaNome = isAnkiReview
      ? 'Revisão Anki'
      : isMateriaReview && !topicoId
      ? `🔄 Revisão Geral — ${disc.nome}`
      : top
      ? top.assunto
      : disc.nome;

    updatePlanById(planObj.id, (plan) => {
      const newSession = {
        id: 'flow_hist_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        date: today,
        startTime: startClock,
        endTime: endClock,
        time: endClock.slice(0, 5),
        editalId: plan.id,
        editalNome: plan.nome,
        categoria: isAnkiReview ? 'Anki' : isMateriaReview ? 'Revisão' : 'Flow',
        disciplinaId: disc?.id || '',
        disciplinaNome: isAnkiReview ? 'Anki' : disc.nome,
        topicoId: top ? top.id : '',
        topicoNome: isAnkiReview ? '' : temaNome,
        minutos: mins,
        segundos: sec,
        acertos: ac,
        erros: er,
        notaErro: (notaErro || '').trim(),
        material: `${startClock} → ${endClock} (${formatExactSeconds(sec)})`
      };

      const sessions = [...(plan.sessions || []), newSession];

      const disciplinas = isAnkiReview ? plan.disciplinas : plan.disciplinas.map((d) => {
        if (d.id !== disc.id) return d;
        const targetTopId = top ? top.id : d.topicos[0]?.id;
        return {
          ...d,
          topicos: d.topicos.map((t) => {
            if (t.id !== targetTopId) return t;
            return {
              ...t,
              acertos: Number(t.acertos || 0) + ac,
              erros: Number(t.erros || 0) + er,
              ultimoEstudo: today
            };
          })
        };
      });

      const errorNotebook = [...(plan.errorNotebook || [])];
      if (er > 0 || (notaErro && notaErro.trim())) {
        errorNotebook.push({
          id: 'err_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          date: today,
          time: endClock,
          editalNome: plan.nome,
          disciplinaId: disc?.id || '',
          disciplinaNome: isAnkiReview ? 'Anki' : disc.nome,
          topicoId: top ? top.id : '',
          tema: isAnkiReview ? 'Revisão livre (Anki)' : temaNome,
          erros: er,
          acertos: ac,
          observacao: (notaErro || '').trim() || `Sessão Flow (${startClock} → ${endClock})`,
          origem: isAnkiReview ? 'Anki (Flow Timer)' : isMateriaReview ? 'Revisão (Flow)' : 'Flow Timer'
        });
      }

      return {
        ...plan,
        sessions,
        disciplinas,
        errorNotebook
      };
    });

    showToast(
      `<strong>✓ Sessão registrada no Histórico e Estatísticas!</strong> <span class="highlight-mint">${formatExactSeconds(sec)}</span> (${startClock} → ${endClock}) em <strong>${isAnkiReview ? 'Revisão Anki' : isMateriaReview ? `Revisão: ${disc.nome}` : disc.nome}</strong>${ac + er > 0 ? ` • ✓ ${ac} / ✗ ${er}` : ''}.`
    );
  }

  /* ========================================================================
     FLOW TIMER REAL-TIME TICKER (CONTA DE SEGUNDO A SEGUNDO)
     Quando chega em 00:00 dos 25 min, abre a pergunta "Registrar acertos?"
     ======================================================================== */
  useEffect(() => {
    if (!flow.running) return;
    const timer = setInterval(() => {
      setFlow((prev) => {
        if (!prev.running) return prev;

        const isStudyMode = prev.mode !== 'break';
        const nextElapsed = isStudyMode ? prev.elapsedInCurrentRunSec + 1 : prev.elapsedInCurrentRunSec;

        if (prev.secondsLeft > 1) {
          return {
            ...prev,
            secondsLeft: prev.secondsLeft - 1,
            elapsedInCurrentRunSec: nextElapsed
          };
        }

        // Chegou a 00:00!
        playBeep();
        if (prev.mode === 'flow') {
          const totalSecStudied = Math.max(nextElapsed, prev.flowMinutes * 60);
          const nextCycleCount =
            prev.completedCyclesToday < prev.totalCycles ? prev.completedCyclesToday + 1 : 1;
          const endedTs = Date.now();
          const startedTs = prev.startedAtTs || endedTs - totalSecStudied * 1000;

          // Abre o modal perguntando: "Registrar acertos?" para personalizar a quantidade de acertos/erros desta sessão!
          setTimeout(() => {
            setFinishPrompt({
              open: true,
              elapsedSec: totalSecStudied,
              startedAtTs: startedTs,
              endedAtTs: endedTs,
              planId: prev.planId,
              discId: prev.disciplinaId,
              topicoId: prev.topicoId,
              studyContext: prev.studyContext || 'topic',
              isFullCycleComplete: true,
              acertos: 0,
              erros: 0,
              notaErro: ''
            });
          }, 0);

          return {
            ...prev,
            completedCyclesToday: nextCycleCount,
            mode: 'break',
            secondsLeft: prev.breakMinutes * 60,
            elapsedInCurrentRunSec: 0,
            startedAtTs: null,
            running: prev.autoStartBreak
          };
        } else {
          // Break terminou -> prepara próxima sessão de 25 min
          setTimeout(() => {
            showToast(`<strong>☕ Break finalizado!</strong> Pronto para iniciar nova sessão de ${prev.flowMinutes} min.`);
          }, 0);
          return {
            ...prev,
            mode: 'flow',
            secondsLeft: prev.flowMinutes * 60,
            elapsedInCurrentRunSec: 0,
            startedAtTs: null,
            running: false
          };
        }
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [flow.running]);

  // Atualiza título da aba e janela flutuante Picture-in-Picture
  useEffect(() => {
    const clockStr = formatSecondsToClock(flow.secondsLeft);
    const shortDisc = flow.studyContext === 'anki' ? 'Anki' : (currentFlowDisc ? currentFlowDisc.nome.replace('TI - ', '') : 'Flow');
    if (flow.running) {
      document.title = `[${clockStr}] ${flow.mode === 'break' ? '☕ Break' : shortDisc} — Flow`;
    } else {
      document.title = `Estudei Pro (React) ⚡ Flow & TRT 1`;
    }
    syncPictureInPictureWindow();
  }, [
    flow.secondsLeft,
    flow.running,
    flow.mode,
    flow.timerDark,
    flow.completedCyclesToday,
    flow.totalCycles,
    flow.flowMinutes,
    currentFlowDisc,
    flow.studyContext
  ]);

  /* ========================================================================
     CONTROLES EXATOS DO FLOW TIMER:
     1. INICIAR (▷) / PAUSAR (||): Pausar APENAS pausa o relógio SEM registrar nada!
     2. FINALIZAR (✓ Finalizar): É quando o registro acontece e pergunta "Registrar acertos?"
     3. BREAK (☕ Break): Inicia o descanso a qualquer momento
     4. RESET (↺): Reseta o relógio da sessão atual sem registrar
     ======================================================================== */
  function handleStartOrPauseFlow(triggerPipIfEnabled = true) {
    if (flow.running) {
      // PAUSAR: Apenas pausa o cronômetro, NÃO registra nada ainda!
      setFlow((prev) => ({
        ...prev,
        running: false
      }));
    } else {
      // INICIAR: Começa a contar (guardando o horário de início se ainda não tinha começado)
      setFlow((prev) => ({
        ...prev,
        running: true,
        startedAtTs: prev.startedAtTs || Date.now()
      }));
      if (triggerPipIfEnabled && flow.autoPopOutOnPlay && (!pipWindowRef.current || pipWindowRef.current.closed)) {
        openAlwaysOnTopMiniClock();
      }
    }
  }

  // Botão FINALIZAR: Pausa o relógio, incrementa a sessão e abre a pergunta "Registrar acertos?"
  function handleFinalizeSessionNow() {
    const elapsed =
      flow.elapsedInCurrentRunSec > 0
        ? flow.elapsedInCurrentRunSec
        : (flow.flowMinutes * 60 - flow.secondsLeft) > 0
        ? flow.flowMinutes * 60 - flow.secondsLeft
        : flow.flowMinutes * 60;

    const endedTs = Date.now();
    const startedTs = flow.startedAtTs || endedTs - elapsed * 1000;

    setFlow((prev) => ({
      ...prev,
      running: false,
      completedCyclesToday:
        prev.completedCyclesToday < prev.totalCycles ? prev.completedCyclesToday + 1 : 1,
      secondsLeft: prev.flowMinutes * 60,
      elapsedInCurrentRunSec: 0,
      startedAtTs: null
    }));

    setFinishPrompt({
      open: true,
      elapsedSec: elapsed,
      startedAtTs: startedTs,
      endedAtTs: endedTs,
      planId: flow.planId,
      discId: flow.disciplinaId,
      topicoId: flow.topicoId,
      studyContext: flow.studyContext || 'topic',
      isFullCycleComplete: elapsed >= flow.flowMinutes * 60,
      acertos: 0,
      erros: 0,
      notaErro: ''
    });
  }

  // Botão BREAK: Alterna para o modo Break (ou volta para o Flow) a qualquer momento
  function handleToggleBreakMode() {
    if (flow.mode === 'break') {
      setFlow((prev) => ({
        ...prev,
        mode: 'flow',
        running: false,
        secondsLeft: prev.flowMinutes * 60,
        elapsedInCurrentRunSec: 0,
        startedAtTs: null
      }));
      showToast(`<strong>⏱️ Modo Flow (${flow.flowMinutes} min) selecionado.</strong> Clique em ▷ para iniciar.`);
    } else {
      // Se havia tempo estudado na sessão antes de ir pro Break, pergunta se quer finalizar/registrar ou só ir pro Break
      if (flow.elapsedInCurrentRunSec > 0) {
        const elapsed = flow.elapsedInCurrentRunSec;
        const endedTs = Date.now();
        const startedTs = flow.startedAtTs || endedTs - elapsed * 1000;
        setFinishPrompt({
          open: true,
          elapsedSec: elapsed,
          startedAtTs: startedTs,
          endedAtTs: endedTs,
          planId: flow.planId,
          discId: flow.disciplinaId,
          topicoId: flow.topicoId,
          studyContext: flow.studyContext || 'topic',
          isFullCycleComplete: false,
          acertos: 0,
          erros: 0,
          notaErro: ''
        });
      }
      setFlow((prev) => ({
        ...prev,
        mode: 'break',
        running: true,
        secondsLeft: prev.breakMinutes * 60,
        elapsedInCurrentRunSec: 0,
        startedAtTs: Date.now()
      }));
    }
  }

  // Botão ↺ (Reset simples sem registrar)
  function handleSimpleResetClock() {
    setFlow((prev) => ({
      ...prev,
      running: false,
      secondsLeft: (prev.mode === 'break' ? prev.breakMinutes : prev.flowMinutes) * 60,
      elapsedInCurrentRunSec: 0,
      startedAtTs: null
    }));
  }

  function startFlowFor(discId, topicoId = '') {
    const disc = activePlan.disciplinas.find((d) => d.id === discId) || activePlan.disciplinas[0];
    const top = topicoId ? disc.topicos.find((t) => t.id === topicoId) : disc.topicos[0];

    setFlow((prev) => ({
      ...prev,
      minimized: false,
      running: true,
      mode: 'flow',
      studyContext: 'topic',
      planId: activePlan.id,
      disciplinaId: disc.id,
      topicoId: top ? top.id : '',
      secondsLeft: prev.flowMinutes * 60,
      elapsedInCurrentRunSec: 0,
      startedAtTs: Date.now()
    }));
    setActiveTab('flow');
  }

  /* ========================================================================
     MINI-TELA FLUTUANTE SEMPRE NO TOPO (PICTURE-IN-PICTURE COM MODO DARK!)
     ======================================================================== */
  async function openAlwaysOnTopMiniClock() {
    if ('documentPictureInPicture' in window) {
      try {
        let pipWin = pipWindowRef.current;
        if (!pipWin || pipWin.closed) {
          pipWin = await window.documentPictureInPicture.requestWindow({
            width: 340,
            height: 255
          });
          pipWindowRef.current = pipWin;
          setFlow((prev) => ({ ...prev, pipActive: true }));
          pipWin.addEventListener('pagehide', () => {
            setFlow((prev) => ({ ...prev, pipActive: false }));
          });
        }
        renderIntoDocumentPiP(pipWin);
        return;
      } catch (err) {
        console.warn('Fallback para Video PiP:', err);
      }
    }

    try {
      if (!pipCanvasRef.current) {
        const c = document.createElement('canvas');
        c.width = 360;
        c.height = 240;
        pipCanvasRef.current = c;
        const v = document.createElement('video');
        v.muted = true;
        v.playsInline = true;
        pipVideoRef.current = v;
        drawCanvasPiP();
        v.srcObject = c.captureStream(15);
        await v.play();
      }
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setFlow((prev) => ({ ...prev, pipActive: false }));
      } else {
        await pipVideoRef.current.requestPictureInPicture();
        setFlow((prev) => ({ ...prev, pipActive: true }));
      }
    } catch (e) {
      showToast(`<strong>Dica:</strong> Clique em ▷ Iniciar no Flow para abrir a mini-janela flutuante!`);
    }
  }

  function renderIntoDocumentPiP(pipWin) {
    if (!pipWin || pipWin.closed) return;
    const clockStr = formatSecondsToClock(flow.secondsLeft);
    const isDark = flow.timerDark;
    const bg = isDark ? '#202124' : '#FFFFFF';
    const fg = isDark ? '#FFFFFF' : '#09090B';
    const hasStartedCurrent = flow.running || flow.elapsedInCurrentRunSec > 0;

    let dotsHtml = '';
    for (let i = 0; i < flow.totalCycles; i++) {
      if (i < flow.completedCyclesToday) {
        dotsHtml += `<div class="c solid"></div>`;
      } else if (i === flow.completedCyclesToday && hasStartedCurrent) {
        dotsHtml += `<div class="c half"></div>`;
      } else {
        dotsHtml += `<div class="c hollow"></div>`;
      }
    }

    pipWin.document.head.innerHTML = `
      <style>
        body {
          margin: 0;
          height: 100vh;
          box-sizing: border-box;
          padding: 14px 18px 18px;
          background: ${bg};
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', sans-serif;
          color: ${fg};
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-between;
          user-select: none;
        }
        .top { width: 100%; display: flex; justify-content: space-between; align-items: center; }
        .mac { display: flex; gap: 6px; }
        .mdot { width: 11px; height: 11px; border-radius: 50%; background: #48494C; }
        .mdot.red { background: #FF5F56; }
        .title { font-size: 20px; font-weight: 500; }
        .digits { font-size: 68px; font-weight: 400; letter-spacing: -1.5px; font-variant-numeric: tabular-nums; line-height: 1; }
        .dots { display: flex; gap: 9px; align-items: center; }
        .c { width: 10px; height: 10px; border-radius: 50%; border: 2px solid ${fg}; box-sizing: border-box; }
        .c.solid { background: ${fg}; }
        .c.half { background: linear-gradient(90deg, ${fg} 50%, transparent 50%); }
        .btns { display: flex; align-items: center; gap: 12px; }
        .play { background: transparent; border: none; color: #1C82A6; font-size: 26px; cursor: pointer; font-weight: 700; }
        .act { border: 1.5px solid #1C82A6; background: transparent; color: #5BC0DE; border-radius: 7px; padding: 4px 9px; font-size: 11px; font-weight: 700; cursor: pointer; }
        .act.fin { background: #0E4B60; color: #fff; border-color: #1C82A6; }
      </style>
    `;

    pipWin.document.body.innerHTML = `
      <div class="top">
        <div class="mac"><span class="mdot red"></span><span class="mdot"></span><span class="mdot"></span></div>
        <span id="pipReset" style="cursor:pointer;font-size:16px;" title="Resetar sem registrar">↺</span>
      </div>
      <div class="title">${flow.mode === 'break' ? 'Break' : flow.studyContext === 'anki' ? 'Anki' : 'Flow'}</div>
      <div class="digits">${clockStr}</div>
      <div class="dots">${dotsHtml}</div>
      <div class="btns">
        <button class="play" id="pipPlay" title="Iniciar / Pausar (Sem registrar)">${flow.running ? '||' : '▷'}</button>
        <button class="act fin" id="pipFinish" title="Finalizar e registrar sessão">✓ Finalizar</button>
        <button class="act" id="pipBreak" title="Iniciar Break">${flow.mode === 'break' ? 'Flow' : 'Break'}</button>
      </div>
    `;

    pipWin.document.getElementById('pipPlay').onclick = () => handleStartOrPauseFlow(false);
    pipWin.document.getElementById('pipReset').onclick = () => handleSimpleResetClock();
    pipWin.document.getElementById('pipFinish').onclick = () => handleFinalizeSessionNow();
    pipWin.document.getElementById('pipBreak').onclick = () => handleToggleBreakMode();
  }

  function drawCanvasPiP() {
    const c = pipCanvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    const clockStr = formatSecondsToClock(flow.secondsLeft);
    const isDark = flow.timerDark;

    ctx.fillStyle = isDark ? '#202124' : '#FFFFFF';
    ctx.fillRect(0, 0, c.width, c.height);

    ctx.fillStyle = isDark ? '#FFFFFF' : '#09090B';
    ctx.font = '500 22px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(flow.mode === 'break' ? 'Break' : flow.studyContext === 'anki' ? 'Anki' : 'Flow', c.width / 2, 48);

    ctx.font = '400 76px Inter, sans-serif';
    ctx.fillText(clockStr, c.width / 2, 135);

    ctx.fillStyle = '#5BC0DE';
    ctx.font = '700 14px Inter, sans-serif';
    ctx.fillText(`${flow.completedCyclesToday}/${flow.totalCycles} sessões hoje`, c.width / 2, 195);
  }

  function syncPictureInPictureWindow() {
    if (pipWindowRef.current && !pipWindowRef.current.closed) {
      renderIntoDocumentPiP(pipWindowRef.current);
    }
    if (pipCanvasRef.current) {
      drawCanvasPiP();
    }
  }

  /* ========================================================================
     POLLING TEC CONCURSOS SYNC QUEUE (/api/tec-queue)
     ======================================================================== */
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const res = await fetch('/api/tec-queue?consume=1');
        const data = await res.json();
        if (data && data.ok && Array.isArray(data.items) && data.items.length > 0) {
          applyTecBatch(data.items);
        }
      } catch (e) {}
    }, 3000);
    return () => clearInterval(id);
  }, [activePlan]);

  function applyTecBatch(items) {
    let totalAc = 0;
    let totalEr = 0;
    const today = toISODate(0);
    const timeStr = formatNowTimeWithSeconds();

    updateActivePlan((plan) => {
      const sessions = [...(plan.sessions || [])];
      const errorNotebook = [...(plan.errorNotebook || [])];
      const disciplinas = plan.disciplinas.map((d) => ({
        ...d,
        topicos: d.topicos.map((t) => ({ ...t }))
      }));

      items.forEach((item) => {
        const dQuery = (item.disciplina || '').toLowerCase();
        const aQuery = (item.assunto || '').toLowerCase();
        let disc =
          disciplinas.find(
            (d) =>
              d.nome.toLowerCase().includes(dQuery) ||
              dQuery.includes(d.nome.toLowerCase().replace('ti - ', ''))
          ) || disciplinas[0];
        let top =
          disc.topicos.find(
            (t) => t.assunto.toLowerCase().includes(aQuery) || aQuery.includes(t.assunto.toLowerCase())
          ) || disc.topicos[0];

        const ac = Number(item.acertos || 0);
        const er = Number(item.erros || 0);
        const mins = Number(item.tempoMinutos || 25);
        totalAc += ac;
        totalEr += er;

        sessions.push({
          id: 'tec_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          date: item.date || today,
          startTime: timeStr,
          endTime: timeStr,
          time: timeStr.slice(0, 5),
          editalId: plan.id,
          editalNome: plan.nome,
          categoria: 'Questões Tec',
          disciplinaId: disc.id,
          disciplinaNome: disc.nome,
          topicoId: top ? top.id : '',
          topicoNome: top ? top.assunto : disc.nome,
          minutos: mins,
          segundos: mins * 60,
          acertos: ac,
          erros: er,
          material: '⚡ Sincronizado do Tec Concursos'
        });

        if (top) {
          top.acertos = (top.acertos || 0) + ac;
          top.erros = (top.erros || 0) + er;
          top.ultimoEstudo = today;
        }

        if (er > 0) {
          errorNotebook.push({
            id: 'err_tec_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            date: item.date || today,
            time: timeStr,
            editalNome: plan.nome,
            disciplinaId: disc.id,
            disciplinaNome: disc.nome,
            topicoId: top ? top.id : '',
            tema: top ? top.assunto : disc.nome,
            erros: er,
            acertos: ac,
            observacao: 'Importado automaticamente do Tec Concursos',
            origem: 'Tec Concursos'
          });
        }
      });

      return { ...plan, sessions, disciplinas, errorNotebook };
    });

    showToast(
      `<strong>⚡ Tec Concursos Sincronizado!</strong> +<span class="highlight-mint">${totalAc} certas</span> e +<strong style="color:#F26B5B;">${totalEr} erradas</strong>.`
    );
  }

  /* ========================================================================
     COMPUTED METRICS
     ======================================================================== */
  const metrics = useMemo(() => {
    let totalMin = 0;
    let totalAcertos = 0;
    let totalErros = 0;

    const byDisc = new Map();
    activePlan.disciplinas.forEach((d) => {
      byDisc.set(d.id, { disc: d, minutos: 0, acertos: 0, erros: 0 });
    });

    (activePlan.sessions || []).forEach((s) => {
      totalMin += Number(s.minutos || 0);
      if (byDisc.has(s.disciplinaId)) {
        byDisc.get(s.disciplinaId).minutos += Number(s.minutos || 0);
      }
    });

    let topicosTotal = 0;
    let topicosDone = 0;
    const topicsWithErrors = [];

    activePlan.disciplinas.forEach((d) => {
      const entry = byDisc.get(d.id);
      d.topicos.forEach((t) => {
        topicosTotal++;
        if (t.concluido) topicosDone++;
        const ac = Number(t.acertos || 0);
        const er = Number(t.erros || 0);
        totalAcertos += ac;
        totalErros += er;
        if (entry) {
          entry.acertos += ac;
          entry.erros += er;
        }
        if (er > 0) {
          topicsWithErrors.push({
            disc: d,
            top: t,
            erros: er,
            acertos: ac
          });
        }
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
      pctEdital,
      topicsWithErrors,
      discList: Array.from(byDisc.values())
    };
  }, [activePlan]);

  async function handleOpenProjectFolder() {
    try {
      await fetch('/api/open-folder', { method: 'POST' });
      showToast(
        `<strong>📂 Pasta aberta no Windows Explorer!</strong> Caminho: <code>C:\\Users\\Usuário\\.gemini\\antigravity\\scratch\\estudei-pro</code>`
      );
    } catch (e) {
      alert('Caminho da pasta: C:\\Users\\Usuário\\.gemini\\antigravity\\scratch\\estudei-pro');
    }
  }

  async function exportPortableBackupCsv() {
    try {
      const queueResponse = await fetch('/api/tec-queue');
      if (!queueResponse.ok) throw new Error('Não foi possível ler a fila pendente do Tec Concursos.');
      const queueSnapshot = await queueResponse.json();
      const { running, menuOpen, pipActive, ...portableFlow } = flow;
      const payload = JSON.stringify({ appData, flow: portableFlow, tecQueue: queueSnapshot.items || [], tecQueueLastSync: queueSnapshot.lastSync || null });
      const csv = '\uFEFF' + [BACKUP_CSV_HEADER, ['ESTUDEI_BACKUP', '1', new Date().toISOString(), payload]]
        .map((row) => row.map(csvEscape).join(';')).join('\r\n');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `estudei_backup_${toISODate(0)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast(`<strong>Backup CSV baixado.</strong> Inclui planos, questões, histórico, caderno de erros, Flow e ${queueSnapshot.items?.length || 0} item(ns) Tec pendente(s).`);
    } catch (error) {
      console.error('Falha ao exportar backup CSV:', error);
      showToast('<strong>Não foi possível exportar.</strong> Confira o espaço disponível no navegador e tente novamente.');
    }
  }

  async function importPortableBackupCsv(file) {
    if (!file) return;
    try {
      const rows = parseCsv(await file.text());
      const header = rows[0] || [];
      if (BACKUP_CSV_HEADER.some((column, index) => header[index] !== column)) {
        throw new Error('Este arquivo não é um backup CSV do Estudei.');
      }
      const record = rows[1];
      if (!record || record[0] !== 'ESTUDEI_BACKUP' || record[1] !== '1') {
        throw new Error('Versão do backup inválida ou não compatível.');
      }
      const backup = JSON.parse(record[3] || '{}');
      if (!backup.appData || !Array.isArray(backup.appData.plans) || backup.appData.plans.length === 0) {
        throw new Error('O backup não contém planos e dados válidos.');
      }
      if (!confirm(`Importar ${backup.appData.plans.length} plano(s) do backup? Isso substituirá os dados atuais deste navegador e a fila pendente do Tec.`)) return;

      const queueRestore = await fetch('/api/tec-queue/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: Array.isArray(backup.tecQueue) ? backup.tecQueue : [], lastSync: backup.tecQueueLastSync || null })
      });
      if (!queueRestore.ok) throw new Error('Não foi possível restaurar a fila pendente do Tec. Os dados do app não foram substituídos.');
      const importedFlow = backup.flow && typeof backup.flow === 'object' ? backup.flow : loadSavedFlow();
      setAppData(backup.appData);
      setFlow((prev) => ({
        ...prev,
        ...importedFlow,
        running: false,
        startedAtTs: null,
        menuOpen: false,
        pipActive: false,
        minimized: false
      }));
      setActiveTab('flow');
      showToast(`<strong>Backup restaurado.</strong> Planos, questões, sessões, caderno de erros, Flow e ${Array.isArray(backup.tecQueue) ? backup.tecQueue.length : 0} item(ns) Tec pendente(s) foram importados.`);
    } catch (error) {
      console.error('Falha ao importar backup CSV:', error);
      alert(`Não foi possível importar este CSV: ${error.message}`);
    } finally {
      if (backupFileInputRef.current) backupFileInputRef.current.value = '';
    }
  }

  function handleResetZero() {
    if (!confirm('Deseja ZERAR todos os horários, histórico de sessões e questões para 0h00min?')) return;
    const freshPlan = createInitialPlan();
    setAppData((prev) => ({
      ...prev,
      activePlanId: freshPlan.id,
      plans: [freshPlan]
    }));
    setFlow((prev) => ({
      ...prev,
      running: false,
      completedCyclesToday: 0,
      secondsLeft: 25 * 60,
      elapsedInCurrentRunSec: 0,
      startedAtTs: null
    }));
    showToast(`<strong>🧹 Tudo zerado (0h00min)!</strong>`);
  }

  function updateTopicStatsInline(discId, topicoId, field, deltaOrVal, isAbsolute = false) {
    const today = toISODate(0);
    updateActivePlan((plan) => ({
      ...plan,
      disciplinas: plan.disciplinas.map((d) => {
        if (d.id !== discId) return d;
        return {
          ...d,
          topicos: d.topicos.map((t) => {
            if (t.id !== topicoId) return t;
            if (field === 'concluido') {
              return { ...t, concluido: Boolean(deltaOrVal), ultimoEstudo: Boolean(deltaOrVal) ? today : t.ultimoEstudo };
            }
            const curr = Number(t[field] || 0);
            const nextVal = isAbsolute ? Math.max(0, Number(deltaOrVal) || 0) : Math.max(0, curr + deltaOrVal);
            return { ...t, [field]: nextVal, ultimoEstudo: today };
          })
        };
      })
    }));
  }

  // Permite editar os acertos/erros de uma sessão já salva no Histórico
  function handleEditSessionQuestions(sessionId) {
    const sess = (activePlan.sessions || []).find((s) => s.id === sessionId);
    if (!sess) return;
    const newAc = parseInt(prompt('Quantidade de Questões CERTAS (✓) nesta sessão:', String(sess.acertos || 0)) || '0', 10);
    const newEr = parseInt(prompt('Quantidade de Questões ERRADAS (✗) nesta sessão:', String(sess.erros || 0)) || '0', 10);
    if (isNaN(newAc) || isNaN(newEr)) return;

    const diffAc = Math.max(0, newAc) - Number(sess.acertos || 0);
    const diffEr = Math.max(0, newEr) - Number(sess.erros || 0);

    updateActivePlan((p) => {
      const sessions = (p.sessions || []).map((s) =>
        s.id === sessionId ? { ...s, acertos: Math.max(0, newAc), erros: Math.max(0, newEr) } : s
      );
      const disciplinas = p.disciplinas.map((d) => {
        if (d.id !== sess.disciplinaId) return d;
        return {
          ...d,
          topicos: d.topicos.map((t) => {
            if (t.id !== sess.topicoId) return t;
            return {
              ...t,
              acertos: Math.max(0, Number(t.acertos || 0) + diffAc),
              erros: Math.max(0, Number(t.erros || 0) + diffEr)
            };
          })
        };
      });
      const errorNotebook = [...(p.errorNotebook || [])];
      if (diffEr > 0) {
        errorNotebook.push({
          id: 'err_edit_' + Date.now(),
          date: sess.date,
          time: sess.endTime || sess.time || '',
          editalNome: p.nome,
          disciplinaId: sess.disciplinaId,
          disciplinaNome: sess.disciplinaNome,
          topicoId: sess.topicoId,
          tema: sess.topicoNome,
          erros: diffEr,
          acertos: Math.max(0, newAc),
          observacao: 'Editado no Histórico do Flow',
          origem: 'Flow Timer'
        });
      }
      return { ...p, sessions, disciplinas, errorNotebook };
    });

    showToast(`<strong>✓ Questões da sessão atualizadas!</strong>`);
  }

  return (
    <div>
      {/* FLOATING TOAST */}
      <div className={`estudei-toast ${toast ? 'show' : ''}`}>
        <div className="estudei-toast-icon">✓</div>
        <div dangerouslySetInnerHTML={{ __html: toast || '' }} />
      </div>

      {/* TOP NAVBAR */}
      <header className="topbar">
        <div className="topbar-left">
          <button
            className="menu-toggle-btn"
            onClick={() => setSidebarOpen((v) => !v)}
            title="Mostrar / Ocultar Menu Lateral"
          >
            ☰
          </button>
          <a
            href="#flow"
            className="brand-logo"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('flow');
            }}
          >
            <span className="brand-logo-icon">✓</span>
            <span>estudei</span>
            <span style={{ fontSize: '11px', background: 'rgba(28, 130, 166, 0.25)', color: '#5BC0DE', padding: '2px 8px', borderRadius: '99px', fontWeight: 700 }}>
              TRT 1 TI
            </span>
          </a>
        </div>

        <div className="topbar-right">
          <input
            ref={backupFileInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => importPortableBackupCsv(e.target.files?.[0])}
          />
          <button
            className="btn-primary-mint"
            onClick={() =>
              setRegModal({
                open: true,
                planId: activePlan.id,
                discId: flow.disciplinaId,
                topicoId: flow.topicoId,
                minutos: 25
              })
            }
          >
            + Registrar Estudo
          </button>

          <button className="btn-outline-mint" onClick={exportPortableBackupCsv} title="Baixar todos os dados em um CSV restaurável">
            ⬇ Backup CSV
          </button>
          <button className="btn-outline-mint" onClick={() => backupFileInputRef.current?.click()} title="Restaurar um backup CSV do Estudei">
            ⬆ Importar CSV
          </button>

          <button
            className="btn-outline-mint"
            onClick={openAlwaysOnTopMiniClock}
            title="Destaca o mini-relógio digital em Modo Dark para ficar visível mesmo com o navegador minimizado!"
          >
            📌 Fixar Relógio Fora do Navegador
          </button>

          <button
            className="btn-outline-mint"
            onClick={handleOpenProjectFolder}
            title="Abre a pasta do projeto no Windows Explorer"
          >
            📂 Abrir Pasta
          </button>

          <button
            className="icon-btn"
            onClick={handleResetZero}
            title="Zerar todos os dados para 0h00min"
          >
            🧹
          </button>

          <button
            className="icon-btn"
            onClick={() => setAppData((prev) => ({ ...prev, theme: prev.theme === 'light' ? 'dark' : 'light' }))}
            title="Alternar Tema do Painel"
          >
            {appData.theme === 'light' ? '🌙' : '☀️'}
          </button>
        </div>
      </header>

      {/* SHELL */}
      <div className={`app-shell ${sidebarOpen ? '' : 'sidebar-collapsed'}`}>
        <aside className="sidebar">
          <div>
            <ul className="nav-list">
              <li className={`nav-item ${activeTab === 'home' ? 'active' : ''}`} onClick={() => setActiveTab('home')}>
                <span className="sidebar-curve-top" />
                <span className="sidebar-curve-bottom" />
                <div className="nav-item-left"><span>Painel</span></div>
              </li>

              <li className={`nav-item ${activeTab === 'flow' ? 'active' : ''}`} onClick={() => setActiveTab('flow')}>
                <span className="sidebar-curve-top" />
                <span className="sidebar-curve-bottom" />
                <div className="nav-item-left"><span>Flow & Histórico</span></div>
                <span className="nav-badge">{(activePlan.sessions || []).length}</span>
              </li>

              <li className={`nav-item ${activeTab === 'estatisticas' ? 'active' : ''}`} onClick={() => setActiveTab('estatisticas')}>
                <span className="sidebar-curve-top" />
                <span className="sidebar-curve-bottom" />
                <div className="nav-item-left"><span>Estatísticas</span></div>
                <span className="nav-badge">{metrics.totalQuestoes}</span>
              </li>

              <li className={`nav-item ${activeTab === 'edital' ? 'active' : ''}`} onClick={() => setActiveTab('edital')}>
                <span className="sidebar-curve-top" />
                <span className="sidebar-curve-bottom" />
                <div className="nav-item-left"><span>Edital TRT 1</span></div>
                <span className="nav-badge">{metrics.topicosDone}/{metrics.topicosTotal}</span>
              </li>

              <li className={`nav-item ${activeTab === 'erros' ? 'active' : ''}`} onClick={() => setActiveTab('erros')}>
                <span className="sidebar-curve-top" />
                <span className="sidebar-curve-bottom" />
                <div className="nav-item-left"><span>Caderno de Erros</span></div>
                <span className="nav-badge danger">{metrics.totalErros}</span>
              </li>
            </ul>
          </div>

          <div className="sidebar-footer">
            <div style={{ fontWeight: 800, color: '#FFFFFF', marginBottom: '6px' }}>
              📂 Diretório Local:
            </div>
            <div style={{ fontSize: '11px', wordBreak: 'break-all', opacity: 0.9, marginBottom: '8px' }}>
              <code>C:\Users\Usuário\.gemini\antigravity\scratch\estudei-pro</code>
            </div>
            <button
              className="btn-outline-mint"
              style={{ width: '100%', justifyContent: 'center', fontSize: '11.5px', padding: '6px' }}
              onClick={handleOpenProjectFolder}
            >
              📂 Abrir no Explorer
            </button>
          </div>
        </aside>

        {/* MAIN CONTENT */}
        <main className="main-content">
          {activeTab === 'home' && (
            <HomeView
              plan={activePlan}
              metrics={metrics}
              onUpdatePlan={updateActivePlan}
              onStartFlow={startFlowFor}
              onRenameDiscipline={(discId, newName) => handleRenameDiscipline(activePlan.id, discId, newName)}
              onAddDiscipline={(newName) => handleAddDiscipline(activePlan.id, newName)}
              onOpenReg={(discId, topicoId) =>
                setRegModal({ open: true, planId: activePlan.id, discId, topicoId, minutos: 25 })
              }
              onOpenDiscInEdital={(discId) => {
                setExpandedDiscs((prev) => ({ ...prev, [discId]: true }));
                setActiveTab('edital');
              }}
              onSwitchTab={setActiveTab}
            />
          )}

          {activeTab === 'flow' && (
            <FlowAndHistoryView
              plans={appData.plans}
              activePlan={activePlan}
              flow={flow}
              setFlow={setFlow}
              todayStats={todayStats}
              currentDisc={currentFlowDisc}
              currentTopic={currentFlowTopic}
              onStartOrPause={handleStartOrPauseFlow}
              onFinalizeSession={handleFinalizeSessionNow}
              onToggleBreak={handleToggleBreakMode}
              onSimpleReset={handleSimpleResetClock}
              onOpenPiP={openAlwaysOnTopMiniClock}
              onRenameDiscipline={handleRenameDiscipline}
              onAddDiscipline={handleAddDiscipline}
              onRenameTopic={handleRenameTopic}
              onAddTopic={handleAddTopic}
              onEditSessionQuestions={handleEditSessionQuestions}
              onDeleteSession={(sessionId) => {
                const sess = (activePlan.sessions || []).find((s) => s.id === sessionId);
                updateActivePlan((p) => {
                  const sessions = (p.sessions || []).filter((s) => s.id !== sessionId);
                  const disciplinas = !sess
                    ? p.disciplinas
                    : p.disciplinas.map((d) => {
                        if (d.id !== sess.disciplinaId) return d;
                        return {
                          ...d,
                          topicos: d.topicos.map((t) => {
                            if (t.id !== sess.topicoId) return t;
                            return {
                              ...t,
                              acertos: Math.max(0, Number(t.acertos || 0) - Number(sess.acertos || 0)),
                              erros: Math.max(0, Number(t.erros || 0) - Number(sess.erros || 0))
                            };
                          })
                        };
                      });
                  return { ...p, sessions, disciplinas };
                });
                showToast(`<strong>Sessão removida do histórico.</strong>`);
              }}
            />
          )}

          {activeTab === 'estatisticas' && (
            <EstatisticasView
              plan={activePlan}
              metrics={metrics}
              onUpdateTopicInline={updateTopicStatsInline}
              onRenameDiscipline={(discId, newName) => handleRenameDiscipline(activePlan.id, discId, newName)}
              onRenameTopic={(discId, topicoId, newAssunto) => handleRenameTopic(activePlan.id, discId, topicoId, newAssunto)}
              onUpdateWeight={(discId, w) => handleUpdateDisciplineWeight(activePlan.id, discId, w)}
              onStartFlow={startFlowFor}
            />
          )}

          {activeTab === 'edital' && (
            <EditalView
              plan={activePlan}
              metrics={metrics}
              filter={editalFilter}
              setFilter={setEditalFilter}
              search={editalSearch}
              setSearch={setEditalSearch}
              expandedDiscs={expandedDiscs}
              setExpandedDiscs={setExpandedDiscs}
              onUpdateTopicInline={updateTopicStatsInline}
              onRenameDiscipline={(discId, newName) => handleRenameDiscipline(activePlan.id, discId, newName)}
              onAddDiscipline={(newName) => handleAddDiscipline(activePlan.id, newName)}
              onRenameTopic={(discId, topicoId, newAssunto) => handleRenameTopic(activePlan.id, discId, topicoId, newAssunto)}
              onAddTopic={(discId, newAssunto) => handleAddTopic(activePlan.id, discId, newAssunto)}
              onStartFlow={startFlowFor}
              onOpenNewPlan={() => setNewPlanModalOpen(true)}
            />
          )}

          {activeTab === 'erros' && (
            <CadernoDeErrosView
              plan={activePlan}
              metrics={metrics}
              onUpdatePlan={updateActivePlan}
              onStartFlow={startFlowFor}
              showToast={showToast}
            />
          )}
        </main>
      </div>

      {/* FLOATING FLOW WIDGET (Aparece quando você está em outra aba e pode ser arrastado pela tela!) */}
      {activeTab !== 'flow' && (
        <FlowTimerFloatingWidget
          flow={flow}
          setFlow={setFlow}
          currentDisc={currentFlowDisc}
          onStartOrPause={handleStartOrPauseFlow}
          onFinalizeSession={handleFinalizeSessionNow}
          onToggleBreak={handleToggleBreakMode}
          onSimpleReset={handleSimpleResetClock}
          onOpenPiP={openAlwaysOnTopMiniClock}
          onGoToFlowTab={() => setActiveTab('flow')}
        />
      )}

      {/* ====================================================================
          MODAL AUTOMÁTICO AO FINAL DE CADA SESSÃO / 25 MIN: "REGISTRAR ACERTOS?"
          ==================================================================== */}
      {finishPrompt.open && (
        <FinishSessionQuestionsModal
          promptData={finishPrompt}
          setPromptData={setFinishPrompt}
          plans={appData.plans}
          onConfirmSave={(withQuestions) => {
            commitFinishedFlowSession({
              planId: finishPrompt.planId,
              discId: finishPrompt.discId,
              topicoId: finishPrompt.topicoId,
              studyContext: finishPrompt.studyContext || 'topic',
              elapsedSec: finishPrompt.elapsedSec,
              startedAtTs: finishPrompt.startedAtTs,
              endedAtTs: finishPrompt.endedAtTs,
              acertos: withQuestions ? finishPrompt.acertos : 0,
              erros: withQuestions ? finishPrompt.erros : 0,
              notaErro: withQuestions ? finishPrompt.notaErro : '',
              isFullCycleComplete: finishPrompt.isFullCycleComplete
            });
            setFinishPrompt((p) => ({ ...p, open: false }));
          }}
          onCancelWithoutSaving={() => setFinishPrompt((p) => ({ ...p, open: false }))}
        />
      )}

      {/* MODAL REGISTRO DE ESTUDO MANUAL */}
      {regModal.open && (
        <RegistroEstudoModal
          plans={appData.plans}
          initialPlanId={regModal.planId || activePlan.id}
          initialDiscId={regModal.discId}
          initialTopicoId={regModal.topicoId}
          initialMinutos={regModal.minutos || 25}
          onRenameDiscipline={handleRenameDiscipline}
          onAddDiscipline={handleAddDiscipline}
          onRenameTopic={handleRenameTopic}
          onAddTopic={handleAddTopic}
          onClose={() => setRegModal({ ...regModal, open: false })}
          onSave={(targetPlanId, newSession, errorEntry) => {
            updatePlanById(targetPlanId, (p) => {
              const sessions = [...(p.sessions || []), newSession];
              const disciplinas = p.disciplinas.map((d) => {
                if (d.id !== newSession.disciplinaId) return d;
                return {
                  ...d,
                  topicos: d.topicos.map((t) => {
                    if (t.id !== newSession.topicoId) return t;
                    return {
                      ...t,
                      acertos: Number(t.acertos || 0) + Number(newSession.acertos || 0),
                      erros: Number(t.erros || 0) + Number(newSession.erros || 0),
                      ultimoEstudo: newSession.date
                    };
                  })
                };
              });
              const errorNotebook = [...(p.errorNotebook || [])];
              if (errorEntry) {
                errorNotebook.push(errorEntry);
              }
              return { ...p, sessions, disciplinas, errorNotebook };
            });
            setRegModal({ ...regModal, open: false });
            showToast(
              `<strong>Muito bom!</strong> Seu estudo de <span class="highlight-mint">${formatMinutesToHm(newSession.minutos)}</span> em <strong>${newSession.disciplinaNome} (${newSession.topicoNome})</strong> foi salvo no Histórico e Estatísticas.`
            );
          }}
        />
      )}

      {/* MODAL NOVO PLANO */}
      {newPlanModalOpen && (
        <NovoPlanoModal
          onClose={() => setNewPlanModalOpen(false)}
          onCreate={(customPlan) => {
            setAppData((prev) => ({
              ...prev,
              activePlanId: customPlan.id,
              plans: [...prev.plans, customPlan]
            }));
            setNewPlanModalOpen(false);
            showToast(`<strong>✨ Edital adicionado!</strong> Agora você está em <strong>${customPlan.nome}</strong>.`);
          }}
        />
      )}
    </div>
  );
}

/* ==========================================================================
   EXACT FLOW TIMER COMPONENT (DARK MODE IMAGE 2 / LIGHT MODE IMAGE 1)
   - Draggable across the screen via the top bar!
   - No duplicate dark mode in settings menu (⋮).
   - Removed "Concluído hoje..." text below buttons.
   ========================================================================== */
function ExactFlowTimerCard({
  flow,
  setFlow,
  todayStats,
  onStartOrPause,
  onFinalizeSession,
  onToggleBreak,
  onSimpleReset,
  onOpenPiP,
  compact = false
}) {
  const clockStr = formatSecondsToClock(flow.secondsLeft);
  const hasStartedCurrent = flow.running || flow.elapsedInCurrentRunSec > 0;
  const isDark = flow.timerDark;

  const [dragPos, setDragPos] = useState(null);
  const cardRef = useRef(null);

  function handleMouseDownDrag(e) {
    if (e.target.closest('button') || e.target.closest('.flow-dropdown-menu')) return;
    e.preventDefault();
    const rect = cardRef.current ? cardRef.current.getBoundingClientRect() : { left: 100, top: 100 };
    const startX = e.clientX;
    const startY = e.clientY;
    const origLeft = dragPos ? dragPos.x : rect.left;
    const origTop = dragPos ? dragPos.y : rect.top;

    function onMove(ev) {
      const nx = Math.max(8, Math.min(window.innerWidth - 320, origLeft + (ev.clientX - startX)));
      const ny = Math.max(8, Math.min(window.innerHeight - 180, origTop + (ev.clientY - startY)));
      setDragPos({ x: nx, y: ny });
    }

    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  const baseStyle = compact ? { maxWidth: 325, minHeight: 245, padding: '14px 18px 18px' } : {};
  const floatingDragStyle = dragPos
    ? {
        position: 'fixed',
        left: dragPos.x,
        top: dragPos.y,
        zIndex: 995,
        margin: 0,
        width: compact ? 325 : 390
      }
    : {};

  return (
    <div
      ref={cardRef}
      className={`flow-exact-window ${isDark ? 'is-dark' : 'is-light'}`}
      style={{ ...baseStyle, ...floatingDragStyle }}
    >
      {/* TOP BAR (DRAGGABLE HANDLE): MAC DOTS LEFT + DRAG PILL + RESET ↺ & MENU ⋮ RIGHT */}
      <div
        className="flow-exact-topbar flow-draggable-handle"
        onMouseDown={handleMouseDownDrag}
        title="Clique e arraste para mover o cronômetro pela tela"
      >
        <div className="flow-mac-dots">
          <button
            className="flow-mac-dot red"
            onClick={() => compact && setFlow((p) => ({ ...p, minimized: true }))}
            title={compact ? 'Minimizar' : 'Flow Timer'}
          />
          <button
            className="flow-mac-dot gray"
            onClick={onOpenPiP}
            title="Destacar Mini-Tela Flutuante fora do navegador"
          />
          <span className="flow-drag-pill" title="Arraste o cronômetro para qualquer lugar da tela">
            ⠿ Arrastar
          </span>
          {dragPos && (
            <button
              type="button"
              className="inline-edit-chip-btn"
              onClick={() => setDragPos(null)}
              title="Voltar o cronômetro para a posição original"
            >
              📍 Fixar
            </button>
          )}
        </div>

        <div className="flow-exact-top-icons">
          {/* Single Dark/Light Toggle Button (Not duplicated in menu) */}
          <button
            className="flow-exact-icon-btn"
            onClick={() => setFlow((p) => ({ ...p, timerDark: !p.timerDark }))}
            title="Alternar Modo Dark / Claro no Cronômetro"
            style={{ fontSize: 13 }}
          >
            {isDark ? '🌙' : '☀️'}
          </button>

          {/* Exact Reset Circular Arrow SVG */}
          <button
            className="flow-exact-icon-btn"
            onClick={onSimpleReset}
            title="Reiniciar tempo da sessão atual (sem registrar)"
          >
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>

          {/* Exact 3 Vertical Hollow Dots SVG */}
          <button
            className="flow-exact-icon-btn"
            onClick={() => setFlow((p) => ({ ...p, menuOpen: !p.menuOpen }))}
            title="Configurações do Flow (25 min, Break, Ciclos)"
          >
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="5" r="1.8" />
              <circle cx="12" cy="12" r="1.8" />
              <circle cx="12" cy="19" r="1.8" />
            </svg>
          </button>
        </div>
      </div>

      {/* CENTER TITLE: "Flow", "Revisão", "Anki" or "Break" */}
      <div className="flow-exact-title" style={compact ? { fontSize: 20 } : {}}>
        {flow.mode === 'break'
          ? 'Break'
          : flow.studyContext === 'anki'
          ? 'Anki'
          : flow.studyContext === 'revisao'
          ? 'Revisão'
          : 'Flow'}
      </div>

      {/* HUGE CRISP DIGITS: "13:12" / "25:00" */}
      <div className="flow-exact-digits" style={compact ? { fontSize: 64 } : {}}>
        {clockStr}
      </div>

      {/* THE 4 CIRCLES BELOW THE DIGITS: ● (solid), ◐ (half-filled when active), ○ (hollow) */}
      <div className="flow-exact-dots-row">
        {Array.from({ length: flow.totalCycles }).map((_, idx) => {
          let stateClass = 'hollow';
          if (idx < flow.completedCyclesToday) {
            stateClass = 'solid';
          } else if (idx === flow.completedCyclesToday && hasStartedCurrent) {
            stateClass = 'half';
          }
          return (
            <div
              key={idx}
              className={`flow-exact-circle ${stateClass}`}
              title={`Sessão ${idx + 1} de hoje (${flow.flowMinutes} min)`}
            />
          );
        })}
      </div>

      {/* CONTROLS ROW */}
      <div className="flow-exact-controls">
        <button
          className="flow-outline-play-btn"
          onClick={() => onStartOrPause(true)}
          title={
            flow.running
              ? 'Pausar (Pausa o cronômetro SEM registrar nada ainda)'
              : 'Iniciar sessão Flow'
          }
        >
          {flow.running ? (
            <svg width="34" height="36" viewBox="0 0 34 36" fill="none">
              <rect x="7" y="4" width="6.5" height="28" rx="1.5" stroke="#1C82A6" strokeWidth="2.4" />
              <rect x="20.5" y="4" width="6.5" height="28" rx="1.5" stroke="#1C82A6" strokeWidth="2.4" />
            </svg>
          ) : (
            <svg width="34" height="36" viewBox="0 0 34 36" fill="none">
              <polygon
                points="8,4 29,18 8,32"
                stroke="#1C82A6"
                strokeWidth="2.4"
                strokeLinejoin="round"
                fill="transparent"
              />
            </svg>
          )}
        </button>

        {flow.running && (
          <button
            className="flow-side-action-btn"
            onClick={() => onStartOrPause(false)}
            title="Pausa sem registrar nada no histórico"
          >
            ⏸ Pausar
          </button>
        )}

        <button
          className="flow-side-action-btn finish"
          onClick={onFinalizeSession}
          title="Finaliza a sessão atual, pergunta os acertos/erros e registra no Histórico e Estatísticas!"
        >
          ✓ Finalizar
        </button>

        <button
          className="flow-side-action-btn"
          onClick={onToggleBreak}
          title="Iniciar Break a qualquer momento"
        >
          {flow.mode === 'break' ? '⏱️ Voltar Flow' : `☕ Break (${flow.breakMinutes}m)`}
        </button>
      </div>

      {/* DROPDOWN MENU (⋮) — Sem duplicação do Modo Dark */}
      <div className={`flow-dropdown-menu ${flow.menuOpen ? 'open' : ''}`}>
        <div
          className="flow-menu-item"
          onClick={() => {
            onOpenPiP();
            setFlow((p) => ({ ...p, menuOpen: false }));
          }}
        >
          <span>📌 Fixar Fora do Navegador</span>
          <span>⧉</span>
        </div>

        {dragPos && (
          <div
            className="flow-menu-item"
            onClick={() => {
              setDragPos(null);
              setFlow((p) => ({ ...p, menuOpen: false }));
            }}
          >
            <span>📍 Centralizar Posição</span>
            <span>↺</span>
          </div>
        )}

        <div className="flow-menu-divider" />

        <div className="flow-menu-item active-parent">
          <span>Flow Duration (Padrão 25m)</span>
          <span>›</span>
          <div className="flow-submenu open-left">
            {[15, 20, 25, 30, 45, 50, 60].map((m) => (
              <div
                key={m}
                className={`flow-submenu-option ${flow.flowMinutes === m ? 'selected' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setFlow((p) => ({
                    ...p,
                    mode: 'flow',
                    flowMinutes: m,
                    secondsLeft: m * 60,
                    elapsedInCurrentRunSec: 0,
                    running: false,
                    menuOpen: false
                  }));
                }}
              >
                {m} min
              </div>
            ))}
          </div>
        </div>

        <div className="flow-menu-item">
          <span>Break Duration</span>
          <span>›</span>
          <div className="flow-submenu open-left">
            {[5, 10, 15, 20].map((b) => (
              <div
                key={b}
                className={`flow-submenu-option ${flow.breakMinutes === b ? 'selected' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setFlow((p) => ({ ...p, breakMinutes: b, menuOpen: false }));
                }}
              >
                {b} min
              </div>
            ))}
          </div>
        </div>

        <div
          className="flow-menu-item"
          onClick={() => {
            const options = [2, 3, 4, 5, 6];
            const next = options[(options.indexOf(flow.totalCycles) + 1) % options.length] || 4;
            setFlow((p) => ({
              ...p,
              totalCycles: next,
              completedCyclesToday: Math.min(p.completedCyclesToday, next)
            }));
          }}
        >
          <span>Cycle (Bolinhas)</span>
          <strong style={{ color: '#5BC0DE' }}>{flow.totalCycles}x ({flow.totalCycles * flow.flowMinutes}m)</strong>
        </div>

        <div
          className="flow-menu-item"
          onClick={() => setFlow((p) => ({ ...p, completedCyclesToday: 0, menuOpen: false }))}
        >
          <span>Zerar Bolinhas de Hoje</span>
          <span>0/{flow.totalCycles}</span>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   MODAL QUE PERGUNTA AO FINAL DE CADA 25 MIN OU AO CLICAR EM FINALIZAR:
   "Registrar acertos?"
   ========================================================================== */
function FinishSessionQuestionsModal({
  promptData,
  setPromptData,
  plans,
  onConfirmSave,
  onCancelWithoutSaving
}) {
  const planObj = plans.find((p) => p.id === promptData.planId) || plans[0];
  const disc = planObj.disciplinas.find((d) => d.id === promptData.discId) || planObj.disciplinas[0];
  const top = disc ? disc.topicos.find((t) => t.id === promptData.topicoId) || disc.topicos[0] : null;
  const startClock = formatTimeFromTimestamp(promptData.startedAtTs);
  const endClock = formatTimeFromTimestamp(promptData.endedAtTs);

  return (
    <div className="modal-backdrop open">
      <div className="registro-modal-card" style={{ maxWidth: 480 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h2 className="registro-modal-title" style={{ marginBottom: 0 }}>
            🎉 Sessão Finalizada! Registrar acertos?
          </h2>
          <button
            onClick={onCancelWithoutSaving}
            style={{ border: 'none', background: 'none', fontSize: 22, cursor: 'pointer', color: '#94A3B8' }}
          >
            ×
          </button>
        </div>

        <div
          style={{
            background: 'var(--bg-card-inner)',
            border: '1px solid var(--border-card)',
            borderRadius: 10,
            padding: '10px 14px',
            marginBottom: 16,
            fontSize: 13,
            color: 'var(--text-primary)'
          }}
        >
          <div>
            ⏱️ <strong>Tempo da sessão (seg a seg):</strong>{' '}
            <span style={{ color: '#5BC0DE', fontWeight: 800 }}>
              {formatExactSeconds(promptData.elapsedSec)} ({startClock} → {endClock})
            </span>
          </div>
          <div style={{ marginTop: 4 }}>
            📚 <strong>{promptData.studyContext === 'anki' ? 'Modo de revisão:' : promptData.studyContext === 'revisao' ? 'Revisão da Matéria:' : 'Disciplina:'}</strong>{' '}
            {promptData.studyContext === 'anki' ? 'Anki · tema livre' : disc?.nome}
          </div>
          {promptData.studyContext !== 'anki' && (
            <div style={{ marginTop: 2 }}>
              📌 <strong>Tema estudado:</strong> {top?.assunto || disc?.nome}
            </div>
          )}
        </div>

        <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-secondary)', marginBottom: 10 }}>
          PERSONALIZE A QUANTIDADE DE QUESTÕES FEITAS NESTA SESSÃO (VAI PARA ESTATÍSTICAS):
        </div>

        <div className="registro-form-grid-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="reg-field">
            <label style={{ color: '#05B265' }}>✓ QUESTÕES CERTAS</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <button
                type="button"
                onClick={() => setPromptData((p) => ({ ...p, acertos: Math.max(0, p.acertos - 1) }))}
                style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border-card)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontWeight: 800, cursor: 'pointer' }}
              >
                -
              </button>
              <input
                type="number"
                min="0"
                value={promptData.acertos}
                onChange={(e) => setPromptData((p) => ({ ...p, acertos: Math.max(0, Number(e.target.value) || 0) }))}
                style={{ textAlign: 'center', fontSize: 18, fontWeight: 800, color: '#05B265' }}
              />
              <button
                type="button"
                onClick={() => setPromptData((p) => ({ ...p, acertos: p.acertos + 1 }))}
                style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #05B265', background: 'rgba(5,178,101,0.16)', color: '#05B265', fontWeight: 800, cursor: 'pointer' }}
              >
                +
              </button>
            </div>
          </div>

          <div className="reg-field">
            <label style={{ color: '#F23022' }}>✗ QUESTÕES ERRADAS</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <button
                type="button"
                onClick={() => setPromptData((p) => ({ ...p, erros: Math.max(0, p.erros - 1) }))}
                style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border-card)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontWeight: 800, cursor: 'pointer' }}
              >
                -
              </button>
              <input
                type="number"
                min="0"
                value={promptData.erros}
                onChange={(e) => setPromptData((p) => ({ ...p, erros: Math.max(0, Number(e.target.value) || 0) }))}
                style={{ textAlign: 'center', fontSize: 18, fontWeight: 800, color: '#F23022' }}
              />
              <button
                type="button"
                onClick={() => setPromptData((p) => ({ ...p, erros: p.erros + 1 }))}
                style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #F23022', background: 'rgba(242,48,34,0.16)', color: '#F23022', fontWeight: 800, cursor: 'pointer' }}
              >
                +
              </button>
            </div>
          </div>
        </div>

        <div className="reg-field" style={{ marginBottom: 14 }}>
          <label>📝 NOTAS / ONDE FALO DOS MEUS ERROS (PARA REVISAR DEPOIS)</label>
          <input
            type="text"
            placeholder={`Anote seus erros ou pontos de revisão em ${top?.assunto || 'neste tema'}...`}
            value={promptData.notaErro}
            onChange={(e) => setPromptData((p) => ({ ...p, notaErro: e.target.value }))}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => onConfirmSave(false)}
            style={{
              border: '1px solid var(--border-card)',
              background: 'var(--bg-card-inner)',
              color: 'var(--text-primary)',
              padding: '9px 14px',
              borderRadius: 10,
              fontWeight: 700,
              fontSize: 12.5,
              cursor: 'pointer'
            }}
          >
            Salvar só o Tempo (Sem questões)
          </button>

          <button
            type="button"
            className="btn-primary-mint"
            onClick={() => onConfirmSave(true)}
          >
            ✓ Salvar Sessão + Acertos/Erros
          </button>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   ABA FLOW & HISTÓRICO (COM MODO REVISÃO PARA A MATÉRIA, DISCIPLINAS E TÓPICOS
   EDITÁVEIS E CRONÔMETRO ARRASTÁVEL PELA TELA)
   ========================================================================== */
function FlowAndHistoryView({
  plans,
  activePlan,
  flow,
  setFlow,
  todayStats,
  currentDisc,
  currentTopic,
  onStartOrPause,
  onFinalizeSession,
  onToggleBreak,
  onSimpleReset,
  onOpenPiP,
  onRenameDiscipline,
  onAddDiscipline,
  onRenameTopic,
  onAddTopic,
  onEditSessionQuestions,
  onDeleteSession
}) {
  const [periodTab, setPeriodTab] = useState('W'); // 'D' | 'W' | 'M' | 'Y'
  const [weekOffset, setWeekOffset] = useState(0);

  // Estados para edição/digitação inline da Disciplina e do Tópico no Flow
  const [discEditMode, setDiscEditMode] = useState(null); // null | 'rename' | 'new'
  const [discInputText, setDiscInputText] = useState('');
  const [topicEditMode, setTopicEditMode] = useState(null); // null | 'rename' | 'new'
  const [topicInputText, setTopicInputText] = useState('');

  const selectedPlan = plans.find((p) => p.id === flow.planId) || activePlan;
  const weekDays = useMemo(() => getWeekDaysMonToSun(weekOffset), [weekOffset]);

  const weeklyBarData = useMemo(() => {
    const sessions = activePlan.sessions || [];
    const countsByDay = weekDays.map((wd) => {
      const daySess = sessions.filter((s) => s.date === wd.iso);
      const flowsCount = daySess.length;
      const totalSec = daySess.reduce((acc, s) => acc + Number(s.segundos || Number(s.minutos || 0) * 60), 0);
      const totalMin = daySess.reduce((acc, s) => acc + Number(s.minutos || 0), 0);
      return {
        ...wd,
        flowsCount,
        totalSec,
        totalMin
      };
    });
    const maxSec = Math.max(25 * 60, ...countsByDay.map((d) => d.totalSec));
    const totalFlowsInWeek = countsByDay.reduce((a, b) => a + b.flowsCount, 0);
    const totalMinInWeek = countsByDay.reduce((a, b) => a + b.totalMin, 0);
    return {
      days: countsByDay.map((d) => ({
        ...d,
        heightPct: d.totalSec > 0 ? Math.min(100, Math.max(18, Math.round((d.totalSec * 100) / maxSec))) : 0
      })),
      totalFlowsInWeek,
      totalMinInWeek
    };
  }, [activePlan.sessions, weekDays]);

  function handleSaveDiscInline() {
    const clean = discInputText.trim();
    if (!clean) return;
    if (discEditMode === 'rename' && currentDisc) {
      onRenameDiscipline(selectedPlan.id, currentDisc.id, clean);
    } else if (discEditMode === 'new') {
      const res = onAddDiscipline(selectedPlan.id, clean);
      if (res) {
        setFlow((p) => ({ ...p, disciplinaId: res.discId, topicoId: res.topicoId }));
      }
    }
    setDiscEditMode(null);
    setDiscInputText('');
  }

  function handleSaveTopicInline() {
    const clean = topicInputText.trim();
    if (!clean || !currentDisc) return;
    if (topicEditMode === 'rename' && currentTopic) {
      onRenameTopic(selectedPlan.id, currentDisc.id, currentTopic.id, clean);
    } else if (topicEditMode === 'new') {
      const newTopId = onAddTopic(selectedPlan.id, currentDisc.id, clean);
      if (newTopId) {
        setFlow((p) => ({ ...p, topicoId: newTopId }));
      }
    }
    setTopicEditMode(null);
    setTopicInputText('');
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">⏱️ Flow & Histórico das Sessões</h1>
          <p className="page-subtitle">
            Arraste o cronômetro pelo topo (<strong>⠿ Arrastar</strong>) para posicioná-lo onde quiser na tela. Ao clicar em <strong>✓ Finalizar</strong>, suas questões e assuntos vão direto para <strong>Estatísticas</strong>!
          </p>
        </div>
        <button className="btn-outline-mint" onClick={onOpenPiP}>
          {flow.pipActive ? '📌 Relógio Flutuando no Windows' : '📌 Fixar Mini-Tela Fora do Navegador'}
        </button>
      </div>

      <div className="dashboard-grid">
        {/* COLUNA ESQUERDA: SELETOR + EXACT FLOW TIMER */}
        <div className="estudei-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
          {/* SELETOR: O que vamos estudar hoje ? */}
          <div className="estudei-white-box" style={{ width: '100%' }}>
            <div className="flow-study-heading">O que vamos estudar hoje ?</div>
            <div
              className="flow-study-choice"
              style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}
              role="group"
              aria-label="Escolha o modo de estudo"
            >
              <button
                type="button"
                className={`flow-study-choice-button ${(!flow.studyContext || flow.studyContext === 'topic') ? 'selected' : ''}`}
                disabled={flow.running || flow.elapsedInCurrentRunSec > 0}
                onClick={() => setFlow((p) => ({ ...p, studyContext: 'topic' }))}
              >
                Edital
              </button>
              <button
                type="button"
                className={`flow-study-choice-button ${flow.studyContext === 'anki' ? 'selected' : ''}`}
                disabled={flow.running || flow.elapsedInCurrentRunSec > 0}
                onClick={() => setFlow((p) => ({ ...p, studyContext: 'anki' }))}
              >
                Anki
              </button>
            </div>

            {flow.studyContext === 'anki' ? (
              <div className="flow-anki-hint">
                Revisão livre: escolha no Anki o que quiser revisar e inicie o timer. Nenhum tópico será exigido.
              </div>
            ) : (
              <>
                <div className="reg-field" style={{ marginBottom: 10 }}>
                  <label>1º EDITAL</label>
                  <select
                    value={selectedPlan.id}
                    onChange={(e) => {
                      const newP = plans.find((p) => p.id === e.target.value) || activePlan;
                      const firstD = newP.disciplinas[0];
                      setFlow((p) => ({ ...p, planId: newP.id, disciplinaId: firstD?.id || '', topicoId: firstD?.topicos[0]?.id || '' }));
                    }}
                  >
                    {plans.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                </div>

                <div className="registro-form-grid-2" style={{ marginBottom: 0 }}>
                  {/* 2º DISCIPLINA (EDITÁVEL) */}
                  <div className="reg-field">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <label style={{ marginBottom: 0 }}>2º DISCIPLINA / MATÉRIA</label>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          type="button"
                          className="inline-edit-chip-btn"
                          onClick={() => {
                            if (discEditMode === 'rename') {
                              setDiscEditMode(null);
                            } else {
                              setDiscEditMode('rename');
                              setDiscInputText(currentDisc?.nome || '');
                            }
                          }}
                          title="Editar nome desta disciplina"
                        >
                          ✎ Editar
                        </button>
                        <button
                          type="button"
                          className="inline-edit-chip-btn"
                          onClick={() => {
                            if (discEditMode === 'new') {
                              setDiscEditMode(null);
                            } else {
                              setDiscEditMode('new');
                              setDiscInputText('');
                            }
                          }}
                          title="Digitar e salvar nova disciplina"
                        >
                          + Nova
                        </button>
                      </div>
                    </div>

                    {discEditMode ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input
                          type="text"
                          value={discInputText}
                          onChange={(e) => setDiscInputText(e.target.value)}
                          placeholder={discEditMode === 'new' ? 'Digite a nova matéria...' : 'Renomear matéria...'}
                          onKeyDown={(e) => e.key === 'Enter' && handleSaveDiscInline()}
                          autoFocus
                        />
                        <button type="button" className="btn-primary-mint" style={{ padding: '4px 10px', fontSize: 11.5 }} onClick={handleSaveDiscInline}>
                          ✓ Salvar
                        </button>
                      </div>
                    ) : (
                      <select
                        value={currentDisc?.id || ''}
                        onChange={(e) => {
                          const newDisc = selectedPlan.disciplinas.find((d) => d.id === e.target.value);
                          setFlow((p) => ({ ...p, disciplinaId: e.target.value, topicoId: newDisc?.topicos[0]?.id || '' }));
                        }}
                      >
                        {selectedPlan.disciplinas.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
                      </select>
                    )}
                  </div>

                  {/* 3º TEMA / TÓPICO (EDITÁVEL) */}
                  <div className="reg-field">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <label style={{ marginBottom: 0 }}>3º TEMA / TÓPICO</label>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          type="button"
                          className="inline-edit-chip-btn"
                          onClick={() => {
                            if (topicEditMode === 'rename') {
                              setTopicEditMode(null);
                            } else {
                              setTopicEditMode('rename');
                              setTopicInputText(currentTopic?.assunto || '');
                            }
                          }}
                          title="Editar nome deste tópico"
                        >
                          ✎ Editar
                        </button>
                        <button
                          type="button"
                          className="inline-edit-chip-btn"
                          onClick={() => {
                            if (topicEditMode === 'new') {
                              setTopicEditMode(null);
                            } else {
                              setTopicEditMode('new');
                              setTopicInputText('');
                            }
                          }}
                          title="Digitar e salvar novo tópico"
                        >
                          + Novo
                        </button>
                      </div>
                    </div>

                    {topicEditMode ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input
                          type="text"
                          value={topicInputText}
                          onChange={(e) => setTopicInputText(e.target.value)}
                          placeholder={topicEditMode === 'new' ? 'Digite o novo tópico...' : 'Renomear tópico...'}
                          onKeyDown={(e) => e.key === 'Enter' && handleSaveTopicInline()}
                          autoFocus
                        />
                        <button type="button" className="btn-primary-mint" style={{ padding: '4px 10px', fontSize: 11.5 }} onClick={handleSaveTopicInline}>
                          ✓ Salvar
                        </button>
                      </div>
                    ) : (
                      <select value={currentTopic?.id || ''} onChange={(e) => setFlow((p) => ({ ...p, topicoId: e.target.value }))}>
                        {(currentDisc?.topicos || []).map((t, idx) => <option key={t.id} value={t.id}>{idx + 1}. {t.assunto}</option>)}
                      </select>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* CRONÔMETRO FLOW (ARRASTÁVEL PELA TELA) */}
          <ExactFlowTimerCard
            flow={flow}
            setFlow={setFlow}
            todayStats={todayStats}
            onStartOrPause={onStartOrPause}
            onFinalizeSession={onFinalizeSession}
            onToggleBreak={onToggleBreak}
            onSimpleReset={onSimpleReset}
            onOpenPiP={onOpenPiP}
          />
        </div>

        {/* COLUNA DIREITA: GRÁFICO DE SESSÕES DO FLOW (D | W | M | Y + M T W T F S S) + LISTA DE SEG A SEG */}
        <div className="estudei-card" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="flow-stats-card">
            <div className="flow-stats-tabs">
              {['D', 'W', 'M', 'Y'].map((t) => (
                <button
                  key={t}
                  className={`flow-stats-tab ${periodTab === t ? 'active' : ''}`}
                  onClick={() => setPeriodTab(t)}
                >
                  {t}
                </button>
              ))}
            </div>

            <div className="flow-stats-count">
              {periodTab === 'D'
                ? `${todayStats.todayCount} Sessões Hoje (${formatMinutesToHm(todayStats.todayMin)})`
                : `${weeklyBarData.totalFlowsInWeek} Sessões (${formatMinutesToHm(weeklyBarData.totalMinInWeek)})`}
            </div>

            <div className="flow-stats-nav">
              <button onClick={() => setWeekOffset((w) => w - 1)} title="Semana anterior">
                ‹
              </button>
              <span>{formatWeekRangeLabel(weekDays)}</span>
              <button onClick={() => setWeekOffset((w) => w + 1)} title="Próxima semana">
                ›
              </button>
            </div>

            <div className="flow-Resize-bars-grid">
              {weeklyBarData.days.map((d) => (
                <div
                  key={d.iso}
                  className="flow-pill-col"
                  title={`${d.ptName} (${d.iso.split('-').reverse().join('/')}): ${d.flowsCount} sessões • ${formatMinutesToHm(d.totalMin)}`}
                >
                  <div className="flow-pill-track">
                    <div
                      className="flow-pill-fill"
                      style={{ height: `${d.heightPct}%` }}
                    />
                  </div>
                  <div className="flow-pill-day-label">{d.letter}</div>
                </div>
              ))}
            </div>
          </div>

          {/* LISTA DETALHADA DAS SESSÕES DE SEGUNDO A SEGUNDO, O QUE FOI ESTUDADO E QUESTÕES */}
          <div>
            <div className="kpi-label" style={{ marginBottom: 10 }}>
              SESSÕES DO FLOW REGISTRADAS DE SEG A SEG ({(activePlan.sessions || []).length})
            </div>

            <div style={{ maxHeight: 330, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(activePlan.sessions || []).length === 0 ? (
                <div
                  style={{
                    padding: 22,
                    textAlign: 'center',
                    color: 'var(--text-secondary)',
                    background: 'var(--bg-surface)',
                    borderRadius: 12,
                    border: '1px dashed var(--border-card)',
                    fontSize: 13
                  }}
                >
                  Nenhuma sessão finalizada ainda. Dê <strong>▷ Iniciar</strong> no cronômetro e depois clique em <strong>✓ Finalizar</strong> para testar a pergunta de acertos e ver o registro de seg a seg aqui!
                </div>
              ) : (
                (activePlan.sessions || [])
                  .slice()
                  .reverse()
                  .map((s, idx) => (
                    <div
                      key={s.id}
                      className="fm-history-item"
                      style={{
                        animationDelay: `${Math.min(idx * 55, 450)}ms`
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span
                            style={{
                              background: 'rgba(28, 130, 166, 0.25)',
                              color: '#5BC0DE',
                              padding: '2px 9px',
                              borderRadius: 99,
                              fontSize: 11.5,
                              fontWeight: 800
                            }}
                          >
                            ⏱️ {formatExactSeconds(s.segundos || s.minutos * 60)}
                          </span>
                          {s.categoria === 'Revisão' && (
                            <span
                              style={{
                                background: 'rgba(245, 176, 65, 0.22)',
                                color: '#F5B041',
                                padding: '2px 8px',
                                borderRadius: 99,
                                fontSize: 11,
                                fontWeight: 800
                              }}
                            >
                              🔄 Revisão
                            </span>
                          )}
                          <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 700 }}>
                            {s.startTime && s.endTime ? `${s.startTime} → ${s.endTime}` : s.time || ''} •{' '}
                            {s.date ? s.date.split('-').reverse().join('/') : ''}
                          </span>
                        </div>
                        <div style={{ fontSize: 13.5, fontWeight: 800, marginTop: 5, color: 'var(--text-primary)' }}>
                          {s.disciplinaNome}
                        </div>
                        <div style={{ fontSize: 12.5, color: '#5BC0DE', fontWeight: 700, marginTop: 2 }}>
                          {s.categoria === 'Anki' ? 'Revisão Anki · tema livre' : `Tema estudado: ${s.topicoNome || 'Geral'}`}
                        </div>
                        {s.notaErro && (
                          <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 4, whiteSpace: 'pre-wrap' }}>
                            📝 Nota: {s.notaErro}
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button
                          onClick={() => onEditSessionQuestions(s.id)}
                          style={{
                            border: '1px solid var(--border-card)',
                            background: 'var(--bg-surface)',
                            borderRadius: 10,
                            padding: '5px 10px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            fontSize: 12.5,
                            fontWeight: 800
                          }}
                          title="Clique para personalizar/editar a quantidade de questões certas e erradas desta sessão"
                        >
                          <span style={{ color: '#05B265' }}>✓ {s.acertos || 0}</span>
                          <span style={{ color: '#F23022' }}>✗ {s.erros || 0}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>✎</span>
                        </button>

                        <button
                          onClick={() => onDeleteSession(s.id)}
                          style={{
                            border: 'none',
                            background: 'rgba(248,113,113,0.15)',
                            color: '#F87171',
                            borderRadius: 8,
                            padding: '6px 8px',
                            cursor: 'pointer',
                            fontSize: 12
                          }}
                          title="Excluir sessão"
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   HOOK PARA ARRASTAR O CRONÔMETRO PELA TELA (DRAGGABLE)
   ========================================================================== */
function useDraggableCard(storageKey) {
  const [offset, setOffset] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          return parsed;
        }
      }
    } catch (e) {}
    return { x: 0, y: 0 };
  });

  function onMouseDown(e) {
    if (e.target.closest('button') || e.target.closest('.flow-dropdown-menu')) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = offset.x;
    const origY = offset.y;

    function onMove(ev) {
      const next = {
        x: origX + (ev.clientX - startX),
        y: origY + (ev.clientY - startY)
      };
      setOffset(next);
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch (err) {}
    }

    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function resetPosition() {
    setOffset({ x: 0, y: 0 });
    try {
      localStorage.removeItem(storageKey);
    } catch (e) {}
  }

  return { offset, onMouseDown, resetPosition };
}

/* ==========================================================================
   FLOATING WIDGET QUANDO ESTÁ EM OUTRA ABA (ARRASTÁVEL PELA TELA + MODO DARK/LIGHT)
   ========================================================================== */
function FlowTimerFloatingWidget({
  flow,
  setFlow,
  currentDisc,
  onStartOrPause,
  onFinalizeSession,
  onToggleBreak,
  onSimpleReset,
  onOpenPiP,
  onGoToFlowTab
}) {
  const clockStr = formatSecondsToClock(flow.secondsLeft);
  const minDrag = useDraggableCard('estudei_flow_min_pos_v1');

  if (flow.minimized) {
    return (
      <div
        className="flow-widget-wrapper is-minimized"
        style={{
          transform: `translate3d(${minDrag.offset.x}px, ${minDrag.offset.y}px, 0)`
        }}
      >
        <div
          className="flow-minimized-fab flow-draggable-handle"
          style={{
            background: flow.timerDark ? '#202124' : '#FFFFFF',
            color: flow.timerDark ? '#FFFFFF' : '#09090B',
            borderColor: '#35363A'
          }}
          onMouseDown={minDrag.onMouseDown}
          onClick={() => setFlow((p) => ({ ...p, minimized: false }))}
          title="Arraste para mover ou clique para abrir o Flow Timer"
        >
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: flow.running ? '#1C82A6' : '#71717A' }} />
          <strong>{clockStr}</strong>
          <span style={{ fontSize: 12, opacity: 0.75 }}>
            ({flow.completedCyclesToday}/{flow.totalCycles})
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flow-widget-wrapper">
      <ExactFlowTimerCard
        flow={flow}
        setFlow={setFlow}
        onStartOrPause={onStartOrPause}
        onFinalizeSession={onFinalizeSession}
        onToggleBreak={onToggleBreak}
        onSimpleReset={onSimpleReset}
        onOpenPiP={onOpenPiP}
        compact={true}
      />
    </div>
  );
}

/* ==========================================================================
   DIAGRAMA CIRCULAR ANIMADO (FRAMER MOTION SPRING STYLE) — VERDE ACERTOS / VERMELHO ERROS
   ========================================================================== */
function FramerMotionDonutChart({ acertos = 0, erros = 0, size = 166, strokeWidth = 28 }) {
  const total = Math.max(0, Number(acertos || 0)) + Math.max(0, Number(erros || 0));
  const exactPct = total > 0 ? (Number(acertos || 0) * 100) / total : 0;
  const formattedPct = exactPct.toFixed(2) + '%';

  const [animatedPct, setAnimatedPct] = useState(0);
  const [hasData, setHasData] = useState(false);

  useEffect(() => {
    setAnimatedPct(0);
    setHasData(false);
    const id = requestAnimationFrame(() => {
      const id2 = requestAnimationFrame(() => {
        setHasData(total > 0);
        setAnimatedPct(exactPct);
      });
      return () => cancelAnimationFrame(id2);
    });
    return () => cancelAnimationFrame(id);
  }, [acertos, erros, total, exactPct]);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const greenLength = hasData ? (animatedPct / 100) * circumference : 0;
  const redLength = hasData ? Math.max(0, circumference - greenLength) : 0;

  return (
    <div className="fm-donut-container" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Trilha neutra de fundo quando 0 questões */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke="rgba(148, 163, 184, 0.22)"
          strokeWidth={strokeWidth}
        />

        {/* Arco Vermelho (Erros) */}
        {total > 0 && erros > 0 && (
          <circle
            className="fm-donut-arc"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            stroke="#F22819"
            strokeWidth={strokeWidth}
            strokeDasharray={`${redLength} ${circumference}`}
            strokeDashoffset={-greenLength}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}

        {/* Arco Verde (Acertos) */}
        {total > 0 && acertos > 0 && (
          <circle
            className="fm-donut-arc"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            stroke="#00A859"
            strokeWidth={strokeWidth}
            strokeDasharray={`${greenLength} ${circumference}`}
            strokeDashoffset={0}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}

        {/* Linhas brancas sutis separadoras entre verde e vermelho igual ao print */}
        {total > 0 && acertos > 0 && erros > 0 && (
          <g>
            <line
              x1={size / 2}
              y1={0}
              x2={size / 2}
              y2={strokeWidth + 2}
              stroke="#FFFFFF"
              strokeWidth="2"
            />
            <line
              x1={size / 2}
              y1={0}
              x2={size / 2}
              y2={strokeWidth + 2}
              stroke="#FFFFFF"
              strokeWidth="2"
              transform={`rotate(${(animatedPct / 100) * 360} ${size / 2} ${size / 2})`}
              style={{ transition: 'transform 1.15s cubic-bezier(0.16, 1, 0.3, 1)' }}
            />
          </g>
        )}
      </svg>

      <div className="fm-donut-center-label">
        <div className="fm-donut-pct" style={{ fontSize: size >= 155 ? 19 : 15 }}>
          {formattedPct}
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   PAINEL DE ESTATÍSTICAS (DESEMPENHO GERAL COM DIAGRAMA CIRCULAR FRAMER MOTION +
   DESEMPENHO POR MATÉRIA E ASSUNTO COM GRÁFICO BICOLOR SEMPRE VISÍVEL, SEM PESO
   E SEM O DESENHO DE EIXO VERTICAL)
   ========================================================================== */
function EstatisticasView({
  plan,
  metrics,
  onRenameDiscipline,
  onRenameTopic,
  onStartFlow
}) {
  const [sortOrder, setSortOrder] = useState('indice'); // 'indice' | 'fortes' | 'fracos'
  const [expandedRows, setExpandedRows] = useState({});
  const [selectedDiscIds, setSelectedDiscIds] = useState({});
  const [editingDiscId, setEditingDiscId] = useState(null);
  const [editingDiscName, setEditingDiscName] = useState('');
  const [editingTopicKey, setEditingTopicKey] = useState(null);
  const [editingTopicName, setEditingTopicName] = useState('');

  // Calcula dados de todas as matérias e seus tópicos (incluindo tudo salvo no Flow, Registro ou Edital)
  const discStats = useMemo(() => {
    return plan.disciplinas.map((disc, index) => {
      const mEntry = metrics.discList.find((x) => x.disc.id === disc.id);
      const acertos = mEntry ? mEntry.acertos : 0;
      const erros = mEntry ? mEntry.erros : 0;
      const resolvidas = acertos + erros;
      const pctAcerto = resolvidas > 0 ? Math.round((acertos * 100) / resolvidas) : 0;
      const pctErro = resolvidas > 0 ? 100 - pctAcerto : 0;

      const topicosStats = (disc.topicos || []).map((t, tIdx) => {
        const tAc = Number(t.acertos || 0);
        const tEr = Number(t.erros || 0);
        const tTot = tAc + tEr;
        const tPctAc = tTot > 0 ? Math.round((tAc * 100) / tTot) : 0;
        const tPctEr = tTot > 0 ? 100 - tPctAc : 0;
        return {
          ...t,
          idx: tIdx,
          acertos: tAc,
          erros: tEr,
          resolvidas: tTot,
          pctAcerto: tPctAc,
          pctErro: tPctEr
        };
      });

      return {
        disc,
        index,
        acertos,
        erros,
        resolvidas,
        pctAcerto,
        pctErro,
        topicosStats
      };
    });
  }, [plan, metrics]);

  // Matérias com questões resolvidas (ou total de matérias)
  const activeMateriasCount = useMemo(() => {
    const withQ = discStats.filter((d) => d.resolvidas > 0).length;
    return withQ > 0 ? withQ : discStats.length;
  }, [discStats]);

  // Ordenação conforme "Ordem de Exibição: Índice | Pontos Fortes | Pontos Fracos"
  const sortedDiscStats = useMemo(() => {
    const list = [...discStats];
    list.sort((a, b) => {
      const aHas = a.resolvidas > 0 ? 1 : 0;
      const bHas = b.resolvidas > 0 ? 1 : 0;
      if (aHas !== bHas) return bHas - aHas;

      if (sortOrder === 'fortes') {
        if (b.pctAcerto !== a.pctAcerto) return b.pctAcerto - a.pctAcerto;
        return b.resolvidas - a.resolvidas;
      }
      if (sortOrder === 'fracos') {
        if (a.pctAcerto !== b.pctAcerto) return a.pctAcerto - b.pctAcerto;
        return b.erros - a.erros;
      }
      return a.index - b.index;
    });
    return list;
  }, [discStats, sortOrder]);

  const allSelected =
    sortedDiscStats.length > 0 && sortedDiscStats.every((d) => Boolean(selectedDiscIds[d.disc.id]));

  function toggleSelectAll(checked) {
    if (!checked) {
      setSelectedDiscIds({});
    } else {
      const next = {};
      sortedDiscStats.forEach((d) => {
        next[d.disc.id] = true;
      });
      setSelectedDiscIds(next);
    }
  }

  const selectionTotals = useMemo(() => {
    let resolvidas = 0;
    let acertos = 0;
    let erros = 0;
    sortedDiscStats.forEach((d) => {
      if (selectedDiscIds[d.disc.id]) {
        resolvidas += d.resolvidas;
        acertos += d.acertos;
        erros += d.erros;
      }
    });
    return { resolvidas, acertos, erros };
  }, [sortedDiscStats, selectedDiscIds]);

  return (
    <div>
      {/* BLOCO 1: DESEMPENHO GERAL (SEM O DESENHO DE LÍNGUA PORTUGUESA À DIREITA) */}
      <div className="stats-section-box">
        <div className="stats-section-header">
          <span>Desempenho Geral</span>
        </div>

        <div className="stats-general-grid">
          {/* Esquerda: 4 Indicadores (Questões resolvidas, Acertos, Total de matérias, Erros) */}
          <div className="stats-numbers-2x2">
            <div>
              <div className="stats-num-item-title">Questões resolvidas</div>
              <div className="stats-num-item-val">{metrics.totalQuestoes}</div>
            </div>
            <div>
              <div className="stats-num-item-title">Acertos</div>
              <div className="stats-num-item-val green">{metrics.totalAcertos}</div>
            </div>
            <div>
              <div className="stats-num-item-title">Total de matérias</div>
              <div className="stats-num-item-val">{activeMateriasCount}</div>
            </div>
            <div>
              <div className="stats-num-item-title">Erros</div>
              <div className="stats-num-item-val red">{metrics.totalErros}</div>
            </div>
          </div>

          {/* Direita: Diagrama Circular Animado (Framer Motion style) */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <FramerMotionDonutChart
              acertos={metrics.totalAcertos}
              erros={metrics.totalErros}
              size={172}
              strokeWidth={30}
            />
          </div>
        </div>
      </div>

      {/* BLOCO 2: DESEMPENHO POR MATÉRIA E ASSUNTO (ESTÉTICO, SEM PESO E COM GRÁFICO SEMPRE VISÍVEL) */}
      <div className="stats-section-box">
        <div className="stats-section-header">
          <span>Desempenho por Matéria e Assunto</span>
        </div>

        <div className="stats-controls-bar">
          <div className="stats-radio-group">
            <strong>Ordem de Exibição:</strong>
            {[
              { id: 'indice', label: 'Índice' },
              { id: 'fortes', label: 'Pontos Fortes' },
              { id: 'fracos', label: 'Pontos Fracos' }
            ].map((opt) => (
              <label
                key={opt.id}
                onClick={() => setSortOrder(opt.id)}
                style={{
                  fontWeight: sortOrder === opt.id ? 800 : 600,
                  color: sortOrder === opt.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                  borderColor: sortOrder === opt.id ? '#1C82A6' : 'var(--border-card)',
                  background: sortOrder === opt.id ? 'rgba(28, 130, 166, 0.16)' : 'var(--bg-surface)'
                }}
              >
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    border: `2px solid ${sortOrder === opt.id ? '#5BC0DE' : 'var(--text-secondary)'}`,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  {sortOrder === opt.id && (
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#5BC0DE' }} />
                  )}
                </span>
                {opt.label}
              </label>
            ))}
          </div>
        </div>

        <div className="stats-table-container">
          <div className="stats-table-head">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(e) => toggleSelectAll(e.target.checked)}
                style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#1C82A6' }}
              />
              <span>Selecionar Todos</span>
            </div>
            <div style={{ textAlign: 'right' }}>Questões Resolvidas</div>
            <div style={{ textAlign: 'center' }}>Desempenho (Gráfico por Matéria)</div>
          </div>

          {sortedDiscStats.map(({ disc, acertos, erros, resolvidas, pctAcerto, pctErro, topicosStats }) => {
            const isExpanded = Boolean(expandedRows[disc.id]);
            const isChecked = Boolean(selectedDiscIds[disc.id]);
            const isEditingThisDisc = editingDiscId === disc.id;

            return (
              <React.Fragment key={disc.id}>
                <div className="stats-table-row">
                  <div className="stats-subject-cell">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) =>
                        setSelectedDiscIds((p) => ({ ...p, [disc.id]: e.target.checked }))
                      }
                      style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#1C82A6' }}
                    />
                    <button
                      type="button"
                      className="stats-expand-circle"
                      onClick={() => setExpandedRows((p) => ({ ...p, [disc.id]: !isExpanded }))}
                      title="Expandir / recolher assuntos desta matéria"
                    >
                      {isExpanded ? '−' : '+'}
                    </button>

                    {isEditingThisDisc ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                        <input
                          type="text"
                          value={editingDiscName}
                          onChange={(e) => setEditingDiscName(e.target.value)}
                          style={{
                            padding: '4px 8px',
                            borderRadius: 6,
                            border: '1px solid #1C82A6',
                            background: 'var(--bg-input)',
                            color: 'var(--text-primary)',
                            fontSize: 13,
                            fontWeight: 700,
                            flex: 1
                          }}
                        />
                        <button
                          type="button"
                          className="btn-primary-mint"
                          style={{ padding: '4px 8px', fontSize: 11 }}
                          onClick={() => {
                            if (editingDiscName.trim()) {
                              onRenameDiscipline(disc.id, editingDiscName.trim());
                            }
                            setEditingDiscId(null);
                          }}
                        >
                          ✓
                        </button>
                      </div>
                    ) : (
                      <span
                        style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}
                        onClick={() => setExpandedRows((p) => ({ ...p, [disc.id]: !isExpanded }))}
                      >
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: disc.cor || '#1C82A6', display: 'inline-block' }} />
                        <span>{disc.nome}</span>
                        <button
                          type="button"
                          className="inline-edit-chip-btn"
                          style={{ padding: '1px 6px', fontSize: 10.5 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingDiscId(disc.id);
                            setEditingDiscName(disc.nome);
                          }}
                          title="Editar nome da matéria"
                        >
                          ✎
                        </button>
                      </span>
                    )}
                  </div>

                  <div style={{ textAlign: 'right', fontWeight: 800, fontSize: 14, color: 'var(--text-primary)' }}>
                    {resolvidas}
                  </div>

                  {/* GRÁFICO SEMPRE APARECENDO */}
                  <div className="stats-perf-cell">
                    <div className="stats-bicolor-bar">
                      {resolvidas > 0 ? (
                        <>
                          <div className="stats-bicolor-green" style={{ width: `${pctAcerto}%` }} />
                          <div className="stats-bicolor-red" style={{ width: `${pctErro}%` }} />
                        </>
                      ) : (
                        <div style={{ width: '100%', height: '100%', background: 'rgba(148,163,184,0.22)' }} />
                      )}
                    </div>

                    <div className="stats-perf-text">
                      <span className="g">{pctAcerto}%</span>{' '}
                      <span className="cnt">({acertos})</span>{' '}
                      <span className="r" style={{ marginLeft: 4 }}>{pctErro}%</span>{' '}
                      <span className="cnt">({erros})</span>
                    </div>
                  </div>
                </div>

                {/* Assuntos / Tópicos da Matéria quando expandido */}
                {isExpanded &&
                  topicosStats.map((t) => {
                    const tKey = `${disc.id}_${t.id}`;
                    const isEditingThisTopic = editingTopicKey === tKey;
                    return (
                      <div key={t.id} className="stats-table-row is-subtopic">
                        <div className="stats-subject-cell" style={{ fontWeight: 500, fontSize: 12.5 }}>
                          <span style={{ color: '#5BC0DE', fontSize: 12, fontWeight: 800 }}>↳</span>
                          {isEditingThisTopic ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                              <input
                                type="text"
                                value={editingTopicName}
                                onChange={(e) => setEditingTopicName(e.target.value)}
                                style={{
                                  padding: '3px 8px',
                                  borderRadius: 6,
                                  border: '1px solid #1C82A6',
                                  background: 'var(--bg-input)',
                                  color: 'var(--text-primary)',
                                  fontSize: 12.5,
                                  flex: 1
                                }}
                              />
                              <button
                                type="button"
                                className="btn-primary-mint"
                                style={{ padding: '3px 8px', fontSize: 11 }}
                                onClick={() => {
                                  if (editingTopicName.trim()) {
                                    onRenameTopic(disc.id, t.id, editingTopicName.trim());
                                  }
                                  setEditingTopicKey(null);
                                }}
                              >
                                ✓
                              </button>
                            </div>
                          ) : (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span>{t.assunto}</span>
                              <button
                                type="button"
                                className="inline-edit-chip-btn"
                                style={{ padding: '1px 6px', fontSize: 10 }}
                                onClick={() => {
                                  setEditingTopicKey(tKey);
                                  setEditingTopicName(t.assunto);
                                }}
                                title="Editar nome do assunto/tópico"
                              >
                                ✎
                              </button>
                              <button
                                type="button"
                                className="inline-edit-chip-btn"
                                style={{ padding: '1px 6px', fontSize: 10 }}
                                onClick={() => onStartFlow(disc.id, t.id)}
                                title="Estudar este tópico no Flow"
                              >
                                ▷ Flow
                              </button>
                            </span>
                          )}
                        </div>

                        <div style={{ textAlign: 'right', fontWeight: 700, fontSize: 12.5 }}>
                          {t.resolvidas}
                        </div>

                        <div className="stats-perf-cell">
                          <div className="stats-bicolor-bar" style={{ height: 12 }}>
                            {t.resolvidas > 0 ? (
                              <>
                                <div className="stats-bicolor-green" style={{ width: `${t.pctAcerto}%` }} />
                                <div className="stats-bicolor-red" style={{ width: `${t.pctErro}%` }} />
                              </>
                            ) : (
                              <div style={{ width: '100%', height: '100%', background: 'rgba(148,163,184,0.18)' }} />
                            )}
                          </div>

                          <div className="stats-perf-text" style={{ fontSize: 12 }}>
                            <span className="g">{t.pctAcerto}%</span>{' '}
                            <span className="cnt">({t.acertos})</span>{' '}
                            <span className="r" style={{ marginLeft: 4 }}>{t.pctErro}%</span>{' '}
                            <span className="cnt">({t.erros})</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </React.Fragment>
            );
          })}

          <div className="stats-table-footer">
            <strong>Seleção</strong>
            <span>Resolvidas: {selectionTotals.resolvidas}</span>
            <span style={{ color: '#00A859' }}>Acertos: {selectionTotals.acertos}</span>
            <span style={{ color: '#F22819' }}>Erros: {selectionTotals.erros}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   PAINEL ("Painel" — COMPACTO, SEM ESPAÇO EXAGERADO, COM DIAGRAMA CIRCULAR DO
   TOTAL DE QUESTÕES FEITAS DE TODOS OS TÓPICOS, ERROS E ACERTOS + MATÉRIAS EDITÁVEIS)
   ========================================================================== */
function HomeView({
  plan,
  metrics,
  onUpdatePlan,
  onStartFlow,
  onOpenReg,
  onOpenDiscInEdital,
  onSwitchTab,
  onRenameDiscipline
}) {
  const [editingDiscId, setEditingDiscId] = useState(null);
  const [editingDiscName, setEditingDiscName] = useState('');

  const sessionDates = new Set((plan.sessions || []).map((s) => s.date));
  const isDayDone = (dateStr) => {
    if (plan.manualStreakDays && plan.manualStreakDays[dateStr] !== undefined) {
      return plan.manualStreakDays[dateStr];
    }
    return sessionDates.has(dateStr);
  };

  let streakCount = 0;
  for (let i = 0; i < 60; i++) {
    if (isDayDone(toISODate(-i))) streakCount++;
    else break;
  }

  function handleEditWeeklyGoals() {
    const h = parseInt(prompt('Meta de Horas na Semana:', String(plan.weeklyGoalHours || 20)) || '20', 10);
    const q = parseInt(prompt('Meta de Questões na Semana:', String(plan.weeklyGoalQuestions || 150)) || '150', 10);
    onUpdatePlan((p) => ({
      ...p,
      weeklyGoalHours: Math.max(1, h),
      weeklyGoalQuestions: Math.max(10, q)
    }));
  }

  function toggleStreakDay(dateStr) {
    const current = isDayDone(dateStr);
    onUpdatePlan((p) => ({
      ...p,
      manualStreakDays: { ...(p.manualStreakDays || {}), [dateStr]: !current }
    }));
  }

  const weekGoalMin = (plan.weeklyGoalHours || 20) * 60;
  const pctHours = Math.min(100, Math.round((metrics.totalMin * 100) / weekGoalMin));
  const pctQuest = Math.min(100, Math.round((metrics.totalQuestoes * 100) / (plan.weeklyGoalQuestions || 150)));

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Painel</h1>
          <p className="page-subtitle">
            Edital ativo: <strong>{plan.nome}</strong>
          </p>
        </div>
        <button className="btn-outline-mint" onClick={() => onSwitchTab('estatisticas')}>
          📊 Ver Painel de Estatísticas →
        </button>
      </div>

      {/* CARDS COMPACTOS E PROPORCIONAIS (SEM ESPAÇO VAZIO EXAGERADO) */}
      <div className="kpi-grid">
        <div
          className="kpi-card"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 14,
            padding: '14px 18px'
          }}
        >
          <div>
            <div className="kpi-label">TEMPO REAL ESTUDADO</div>
            <div className="kpi-sub">Sessões do Flow + Registros</div>
          </div>
          <div className="kpi-value" style={{ marginTop: 0 }}>{formatMinutesToHm(metrics.totalMin)}</div>
        </div>

        <div
          className="kpi-card"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 14,
            padding: '12px 18px'
          }}
        >
          <div>
            <div className="kpi-label">QUESTÕES DE TODOS OS TÓPICOS</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#FFFFFF', margin: '3px 0' }}>
              {metrics.totalQuestoes}{' '}
              <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(241,245,249,0.75)' }}>resolvidas</span>
            </div>
            <div className="kpi-sub" style={{ display: 'flex', gap: 12, marginTop: 2 }}>
              <span className="good" style={{ color: '#00A859', fontSize: 12.5 }}>✓ {metrics.totalAcertos} Acertos</span>
              <span className="bad" style={{ color: '#F22819', fontSize: 12.5 }}>✗ {metrics.totalErros} Erros</span>
            </div>
          </div>

          <FramerMotionDonutChart
            acertos={metrics.totalAcertos}
            erros={metrics.totalErros}
            size={84}
            strokeWidth={15}
          />
        </div>
      </div>

      {/* CONSTÂNCIA INTERATIVA */}
      <div className="estudei-card streak-card">
        <div className="streak-header">
          <div>
            <div className="kpi-label">CONSTÂNCIA NOS ESTUDOS</div>
            <div style={{ fontSize: 14, marginTop: 4 }}>
              <strong>{streakCount} dias seguidos</strong> estudados (clique em qualquer dia para marcar/desmarcar)
            </div>
          </div>
        </div>
        <div className="streak-pills">
          {Array.from({ length: 30 }).map((_, idx) => {
            const offset = -(29 - idx);
            const dStr = toISODate(offset);
            const done = isDayDone(dStr);
            const label = dStr.slice(8, 10) + '/' + dStr.slice(5, 7);
            return (
              <div
                key={dStr}
                className={`streak-day ${done ? 'done' : 'missed'} ${offset === 0 ? 'today' : ''}`}
                style={{ cursor: 'pointer' }}
                onClick={() => toggleStreakDay(dStr)}
                title={`${label}`}
              >
                {done ? '✓' : '✗'}
              </div>
            );
          })}
        </div>
      </div>

      {/* DASHBOARD 2 COLUNAS */}
      <div className="dashboard-grid">
        <div className="estudei-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div className="kpi-label">DISCIPLINAS DO EDITAL ({plan.disciplinas.length}) — CLIQUE EM ✎ PARA EDITAR</div>
            </div>
            <button className="btn-outline-mint" style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => onSwitchTab('edital')}>
              Abrir Tópicos →
            </button>
          </div>

          <div style={{ overflowX: 'auto', maxHeight: 490 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Disciplina</th>
                  <th>Horas</th>
                  <th style={{ color: '#00A859' }}>✓ Certas</th>
                  <th style={{ color: '#F22819' }}>✗ Erradas</th>
                  <th>%</th>
                  <th style={{ textAlign: 'right' }}>Ações</th>
                </tr>
                            </thead>
              <tbody>
                {metrics.discList.map(({ disc, minutos, acertos, erros }) => {
                  const tot = acertos + erros;
                  const pct = tot > 0 ? Math.round((acertos * 100) / tot) : null;
                  const cls = pct === null ? 'pct-none' : pct >= 80 ? 'pct-high' : pct >= 65 ? 'pct-mid' : 'pct-low';
                  const isEditing = editingDiscId === disc.id;
                  return (
                    <tr key={disc.id}>
                      <td>
                        {isEditing ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <input
                              type="text"
                              value={editingDiscName}
                              onChange={(e) => setEditingDiscName(e.target.value)}
                              style={{
                                padding: '4px 8px',
                                borderRadius: 6,
                                border: '1px solid #1C82A6',
                                background: 'var(--bg-input)',
                                color: 'var(--text-primary)',
                                fontSize: 12.5,
                                fontWeight: 700
                              }}
                            />
                            <button
                              type="button"
                              className="btn-primary-mint"
                              style={{ padding: '3px 8px', fontSize: 11 }}
                              onClick={() => {
                                if (editingDiscName.trim()) {
                                  onRenameDiscipline(disc.id, editingDiscName.trim());
                                }
                                setEditingDiscId(null);
                              }}
                            >
                              ✓ Salvar
                            </button>
                          </div>
                        ) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            <span className="disc-name-link" onClick={() => onOpenDiscInEdital(disc.id)}>
                              <span className="dot-color" style={{ background: disc.cor }} />
                              <span>{disc.nome}</span>
                            </span>
                            <button
                              type="button"
                              className="inline-edit-chip-btn"
                              style={{ padding: '1px 6px', fontSize: 10 }}
                              onClick={() => {
                                setEditingDiscId(disc.id);
                                setEditingDiscName(disc.nome);
                              }}
                              title="Editar nome da matéria"
                            >
                              ✎
                            </button>
                          </span>
                        )}
                      </td>
                      <td style={{ fontWeight: 700 }}>{minutos > 0 ? formatMinutesToHm(minutos) : '0h00min'}</td>
                      <td style={{ color: '#00A859', fontWeight: 700 }}>{acertos}</td>
                      <td style={{ color: '#F22819', fontWeight: 700 }}>{erros}</td>
                      <td>
                        <span className={`pct-badge ${cls}`}>{pct !== null ? `${pct}%` : '-'}</span>
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button
                          className="btn-primary-mint"
                          style={{ padding: '4px 10px', fontSize: 11.5, marginRight: 6 }}
                          onClick={() => onStartFlow(disc.id, '')}
                        >
                          ▷ Flow
                        </button>
                        <button
                          className="btn-outline-mint"
                          style={{ padding: '4px 8px', fontSize: 11.5 }}
                          onClick={() => onOpenReg(disc.id, '')}
                        >
                          + Registrar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="estudei-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <strong>📊 Desempenho Geral e Metas Semanais</strong>
            <button className="btn-outline-mint" style={{ padding: '4px 10px', fontSize: 11.5 }} onClick={handleEditWeeklyGoals}>
              ✎ Editar Metas
            </button>
          </div>

          <div className="estudei-white-box" style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-secondary)', marginBottom: 8 }}>METAS DA SEMANA</div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                <span>{formatMinutesToHm(metrics.totalMin)} / {plan.weeklyGoalHours}h00min</span>
                <span>Horas de Estudo ({pctHours}%)</span>
              </div>
              <div style={{ height: 12, background: 'rgba(148,163,184,0.2)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pctHours}%`, background: '#1C82A6' }} />
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                <span>{metrics.totalQuestoes} / {plan.weeklyGoalQuestions} questões</span>
                <span>Questões Resolvidas ({pctQuest}%)</span>
              </div>
              <div style={{ height: 12, background: 'rgba(148,163,184,0.2)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pctQuest}%`, background: '#5BC0DE' }} />
              </div>
            </div>
          </div>

          <div className="visual-progress-showcase">
            <div className="estudei-white-box" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text-secondary)', alignSelf: 'flex-start' }}>
                DIAGRAMA DE QUESTÕES ({metrics.totalQuestoes})
              </div>
              <FramerMotionDonutChart
                acertos={metrics.totalAcertos}
                erros={metrics.totalErros}
                size={138}
                strokeWidth={24}
              />
              <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', fontWeight: 700 }}>
                <span style={{ color: '#00A859' }}>✓ {metrics.totalAcertos} acertos</span> •{' '}
                <span style={{ color: '#F22819' }}>✗ {metrics.totalErros} erros</span>
              </div>
            </div>

            <div className="estudei-white-box">
              <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text-secondary)', marginBottom: 8 }}>DISCIPLINAS × HORAS ESTUDADAS</div>
              {metrics.discList
                .slice()
                .sort((a, b) => b.minutos - a.minutos)
                .slice(0, 6)
                .map(({ disc, minutos }) => {
                  const maxM = Math.max(60, ...metrics.discList.map((x) => x.minutos));
                  const w = minutos > 0 ? Math.max(8, Math.round((minutos * 100) / maxM)) : 0;
                  return (
                    <div className="horiz-bar-row" key={disc.id} style={{ gridTemplateColumns: '110px 1fr 52px' }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>
                        {disc.nome.replace('TI - ', '')}
                      </div>
                      <div className="horiz-bar-track">
                        <div className="horiz-bar-fill" style={{ width: `${w}%` }} />
                      </div>
                      <div style={{ textAlign: 'right', fontWeight: 700 }}>{formatMinutesToHm(minutos)}</div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   CADERNO DE ERROS (COM AS ERRADAS E NOTAS MARCADAS NO FLOW / REGISTRO)
   ========================================================================== */
function CadernoDeErrosView({ plan, metrics, onUpdatePlan, onStartFlow, showToast }) {
  const notebookEntries = plan.errorNotebook || [];
  const topicErrors = metrics.topicsWithErrors || [];

  function removeErrorEntry(id) {
    onUpdatePlan((p) => ({
      ...p,
      errorNotebook: (p.errorNotebook || []).filter((item) => item.id !== id)
    }));
    showToast(`<strong>Item removido do Caderno de Erros.</strong>`);
  }

  function clearTopicErrors(discId, topicoId) {
    onUpdatePlan((p) => ({
      ...p,
      disciplinas: p.disciplinas.map((d) =>
        d.id !== discId
          ? d
          : {
              ...d,
              topicos: d.topicos.map((t) => (t.id === topicoId ? { ...t, erros: 0 } : t))
            }
      )
    }));
    showToast(`<strong>Erros do tema zerados!</strong>`);
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">🎯 Caderno de Erros & Notas de Revisão</h1>
          <p className="page-subtitle">
            Todas as questões <strong>Erradas</strong> e <strong>Notas de Erros</strong> registradas no Flow e no Registro de Estudo para você revisar depois.
          </p>
        </div>
      </div>

      <div className="estudei-card" style={{ marginBottom: 20 }}>
        <div className="kpi-label" style={{ marginBottom: 12 }}>
          REGISTROS E NOTAS DOS MEUS ERROS ({notebookEntries.length})
        </div>

        {notebookEntries.length === 0 ? (
          <div style={{ padding: 18, color: 'var(--text-secondary)', fontSize: 13.5 }}>
            Nenhuma questão errada ou nota registrada ainda. Ao finalizar uma sessão no Flow ou salvar no Registro de Estudo, suas notas e erros aparecerão aqui!
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {notebookEntries
              .slice()
              .reverse()
              .map((item) => (
                <div
                  key={item.id}
                  style={{
                    padding: '14px 16px',
                    borderRadius: 12,
                    background: 'var(--bg-surface)',
                    borderLeft: '5px solid #F26B5B',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                    flexWrap: 'wrap'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span
                        style={{
                          background: 'rgba(242,107,91,0.2)',
                          color: '#F26B5B',
                          padding: '2px 9px',
                          borderRadius: 99,
                          fontSize: 11.5,
                          fontWeight: 800
                        }}
                      >
                        ✗ {item.erros || 0} errada(s)
                      </span>
                      <strong>{item.disciplinaNome}</strong>
                      <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                        • {item.date ? item.date.split('-').reverse().join('/') : ''} ({item.origem || 'Flow'})
                      </span>
                    </div>
                    <div style={{ fontSize: 14, color: 'var(--accent-mint)', fontWeight: 700, marginTop: 5 }}>
                      📌 Tema: {item.tema}
                    </div>
                    {item.observacao && (
                      <div style={{ fontSize: 13, color: 'var(--text-primary)', marginTop: 5, whiteSpace: 'pre-wrap' }}>
                        📝 <strong>Nota dos meus erros:</strong> {item.observacao}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className="btn-primary-mint"
                      onClick={() => onStartFlow(item.disciplinaId, item.topicoId)}
                    >
                      ▷ Estudar Tema no Flow
                    </button>
                    <button
                      className="btn-outline-mint"
                      onClick={() => removeErrorEntry(item.id)}
                    >
                      ✓ Já Revisei / Remover
                    </button>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      <div className="estudei-card">
        <div className="kpi-label" style={{ marginBottom: 12 }}>
          ACUMULADO DE ERRADAS POR TEMA DO EDITAL ({topicErrors.length})
        </div>

        {topicErrors.length === 0 ? (
          <div style={{ padding: 18, color: 'var(--text-secondary)', fontSize: 13.5 }}>
            Nenhum tópico com questões erradas acumuladas no momento.
          </div>
        ) : (
          topicErrors.map(({ disc, top, erros, acertos }) => {
            const tot = acertos + erros;
            const pct = tot > 0 ? Math.round((acertos * 100) / tot) : 0;
            return (
              <div
                key={top.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '14px 16px',
                  borderBottom: '1px solid var(--border-subtle)',
                  flexWrap: 'wrap',
                  gap: 10
                }}
              >
                <div>
                  <span
                    style={{
                      background: 'rgba(242,107,91,0.2)',
                      color: '#F26B5B',
                      padding: '2px 8px',
                      borderRadius: 99,
                      fontSize: 11.5,
                      fontWeight: 800,
                      marginRight: 8
                    }}
                  >
                    ✗ {erros} erradas ({pct}% acerto)
                  </span>
                  <strong>{disc.nome}</strong>
                  <div style={{ fontSize: 13.5, color: 'var(--accent-mint)', fontWeight: 700, marginTop: 4 }}>
                    Tema: {top.assunto}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-primary-mint" onClick={() => onStartFlow(disc.id, top.id)}>
                    ▷ Focar Tema no Flow
                  </button>
                  <button className="btn-outline-mint" onClick={() => clearTopicErrors(disc.id, top.id)}>
                    Zerar Erros
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ==========================================================================
   EDITAL VERTICALIZADO (COM MATÉRIAS E TÓPICOS EDITÁVEIS INLINE — DIGITAR E SALVAR)
   ========================================================================== */
function EditalView({
  plan,
  metrics,
  filter,
  setFilter,
  search,
  setSearch,
  expandedDiscs,
  setExpandedDiscs,
  onUpdateTopicInline,
  onStartFlow,
  onOpenNewPlan,
  onRenameDiscipline,
  onAddDiscipline,
  onRenameTopic,
  onAddTopic
}) {
  const q = search.trim().toLowerCase();
  const [editingDiscId, setEditingDiscId] = useState(null);
  const [editingDiscText, setEditingDiscText] = useState('');
  const [addingNewDisc, setAddingNewDisc] = useState(false);
  const [newDiscText, setNewDiscText] = useState('');

  const [editingTopicId, setEditingTopicId] = useState(null);
  const [editingTopicText, setEditingTopicText] = useState('');
  const [addingTopicForDiscId, setAddingTopicForDiscId] = useState(null);
  const [newTopicText, setNewTopicText] = useState('');

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Edital Verticalizado — {plan.nome}</h1>
          <p className="page-subtitle">
            Todas as matérias e tópicos são <strong>editáveis</strong>: clique em <strong>✎ Editar</strong> ou <strong>+ Nova Matéria / Tópico</strong> para digitar e salvar.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-primary-mint"
            onClick={() => {
              setAddingNewDisc((v) => !v);
              setNewDiscText('');
            }}
          >
            + Nova Matéria no Edital
          </button>
          <button className="btn-outline-mint" onClick={onOpenNewPlan}>
            ✨ Adicionar Outro Edital
          </button>
        </div>
      </div>

      {addingNewDisc && (
        <div className="estudei-card" style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 13 }}>Nova Matéria / Disciplina:</strong>
          <input
            type="text"
            value={newDiscText}
            onChange={(e) => setNewDiscText(e.target.value)}
            placeholder="Digite o nome da nova matéria e clique em Salvar..."
            style={{
              flex: 1,
              minWidth: 220,
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid #1C82A6',
              background: 'var(--bg-input)',
              color: 'var(--text-primary)',
              fontSize: 13
            }}
          />
          <button
            type="button"
            className="btn-primary-mint"
            onClick={() => {
              if (newDiscText.trim()) {
                onAddDiscipline(newDiscText.trim());
                setNewDiscText('');
                setAddingNewDisc(false);
              }
            }}
          >
            ✓ Salvar Matéria
          </button>
          <button
            type="button"
            className="btn-outline-mint"
            onClick={() => setAddingNewDisc(false)}
          >
            Cancelar
          </button>
        </div>
      )}

      <div className="edital-controls">
        <input
          type="text"
          className="search-input"
          placeholder="🔍 Buscar tema no edital (ex: Scrum, ITIL, SQL, Redes, Crase, Licitações)..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {[
          { id: 'all', label: 'Todos' },
          { id: 'ti', label: '💻 Específicos TI' },
          { id: 'gerais', label: '📚 Conhecimentos Gerais' },
          { id: 'pending', label: '⏳ Pendentes' },
          { id: 'done', label: '✅ Concluídos' },
          { id: 'errors', label: '⚠️ Com Erros' }
        ].map((f) => (
          <button
            key={f.id}
            className={`filter-pill ${filter === f.id ? 'active' : ''}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {plan.disciplinas.map((disc) => {
        if (filter === 'ti' && !disc.agrupamento.includes('ESPEC')) return null;
        if (filter === 'gerais' && !disc.agrupamento.includes('GERAIS')) return null;

        const filteredTopics = (disc.topicos || []).filter((t) => {
          if (q && !t.assunto.toLowerCase().includes(q) && !disc.nome.toLowerCase().includes(q)) return false;
          if (filter === 'pending' && t.concluido) return false;
          if (filter === 'done' && !t.concluido) return false;
          if (filter === 'errors' && !(t.erros > 0)) return false;
          return true;
        });

        if (filteredTopics.length === 0 && q.length > 0) return null;

        const doneCount = disc.topicos.filter((t) => t.concluido).length;
        const discPct = disc.topicos.length > 0 ? Math.round((doneCount * 100) / disc.topicos.length) : 0;
        const isOpen = Boolean(expandedDiscs[disc.id]) || q.length > 0;
        const isEditingThisDisc = editingDiscId === disc.id;

        return (
          <div className="edital-discipline-block" key={disc.id}>
            <div
              className="edital-discipline-header"
              style={{ borderLeftColor: disc.cor }}
              onClick={() => setExpandedDiscs((p) => ({ ...p, [disc.id]: !isOpen }))}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 700 }}>{disc.agrupamento}</div>
                <div style={{ fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 2 }}>
                  {isEditingThisDisc ? (
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="text"
                        value={editingDiscText}
                        onChange={(e) => setEditingDiscText(e.target.value)}
                        style={{
                          padding: '5px 10px',
                          borderRadius: 8,
                          border: '1px solid #1C82A6',
                          background: 'var(--bg-input)',
                          color: 'var(--text-primary)',
                          fontSize: 14,
                          fontWeight: 800,
                          minWidth: 250
                        }}
                      />
                      <button
                        type="button"
                        className="btn-primary-mint"
                        style={{ padding: '5px 10px', fontSize: 11.5 }}
                        onClick={() => {
                          if (editingDiscText.trim()) {
                            onRenameDiscipline(disc.id, editingDiscText.trim());
                          }
                          setEditingDiscId(null);
                        }}
                      >
                        ✓ Salvar
                      </button>
                      <button
                        type="button"
                        className="btn-outline-mint"
                        style={{ padding: '5px 10px', fontSize: 11.5 }}
                        onClick={() => setEditingDiscId(null)}
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <>
                      <span>{disc.nome}</span>
                      <button
                        type="button"
                        className="inline-edit-chip-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingDiscId(disc.id);
                          setEditingDiscText(disc.nome);
                        }}
                        title="Editar nome desta matéria"
                      >
                        ✎ Editar Matéria
                      </button>
                      <button
                        type="button"
                        className="inline-edit-chip-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedDiscs((p) => ({ ...p, [disc.id]: true }));
                          setAddingTopicForDiscId(disc.id);
                          setNewTopicText('');
                        }}
                        title="Adicionar novo tópico nesta matéria"
                      >
                        + Novo Tópico
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700 }}>
                  {doneCount}/{disc.topicos.length} ({discPct}%)
                </span>
                <span>{isOpen ? '▴' : '▾'}</span>
              </div>
            </div>

            {isOpen && (
              <div>
                {addingTopicForDiscId === disc.id && (
                  <div
                    style={{
                      padding: '12px 18px',
                      background: 'rgba(28, 130, 166, 0.12)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      flexWrap: 'wrap'
                    }}
                  >
                    <strong style={{ fontSize: 12.5 }}>Novo Tópico em {disc.nome}:</strong>
                    <input
                      type="text"
                      value={newTopicText}
                      onChange={(e) => setNewTopicText(e.target.value)}
                      placeholder="Digite o nome do assunto/tópico e clique em Salvar..."
                      style={{
                        flex: 1,
                        minWidth: 220,
                        padding: '6px 10px',
                        borderRadius: 8,
                        border: '1px solid #1C82A6',
                        background: 'var(--bg-input)',
                        color: 'var(--text-primary)',
                        fontSize: 12.5
                      }}
                    />
                    <button
                      type="button"
                      className="btn-primary-mint"
                      style={{ padding: '5px 12px', fontSize: 12 }}
                      onClick={() => {
                        if (newTopicText.trim()) {
                          onAddTopic(disc.id, newTopicText.trim());
                          setNewTopicText('');
                          setAddingTopicForDiscId(null);
                        }
                      }}
                    >
                      ✓ Salvar Tópico
                    </button>
                    <button
                      type="button"
                      className="btn-outline-mint"
                      style={{ padding: '5px 10px', fontSize: 12 }}
                      onClick={() => setAddingTopicForDiscId(null)}
                    >
                      Cancelar
                    </button>
                  </div>
                )}

                <div
                  className="edital-topic-row"
                  style={{
                    gridTemplateColumns: '1fr 110px 110px 60px 150px',
                    background: 'rgba(0,0,0,0.12)',
                    fontSize: 11,
                    fontWeight: 800,
                    color: 'var(--text-secondary)'
                  }}
                >
                  <div>TEMA / ASSUNTO DO EDITAL (EDITÁVEL)</div>
                  <div style={{ textAlign: 'center', color: '#00A859' }}>✓ CERTAS</div>
                  <div style={{ textAlign: 'center', color: '#F22819' }}>✗ ERRADAS</div>
                  <div style={{ textAlign: 'center' }}>%</div>
                  <div style={{ textAlign: 'right' }}>AÇÕES</div>
                </div>

                {filteredTopics.map((t, idx) => {
                  const ac = Number(t.acertos || 0);
                  const er = Number(t.erros || 0);
                  const tot = ac + er;
                  const pct = tot > 0 ? Math.round((ac * 100) / tot) : null;
                  const badgeCls = pct === null ? 'pct-none' : pct >= 80 ? 'pct-high' : pct >= 65 ? 'pct-mid' : 'pct-low';
                  const isEditingThisTopic = editingTopicId === t.id;

                  return (
                    <div
                      key={t.id}
                      className={`edital-topic-row ${t.concluido ? 'completed' : ''}`}
                      style={{ gridTemplateColumns: '1fr 110px 110px 60px 150px' }}
                    >
                      <div className="edital-topic-title" style={{ paddingLeft: Math.min(3, t.nivel || 0) * 16 }}>
                        <input
                          type="checkbox"
                          className="edital-checkbox"
                          checked={Boolean(t.concluido)}
                          onChange={(e) => onUpdateTopicInline(disc.id, t.id, 'concluido', e.target.checked)}
                        />
                        {isEditingThisTopic ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                            <input
                              type="text"
                              value={editingTopicText}
                              onChange={(e) => setEditingTopicText(e.target.value)}
                              style={{
                                flex: 1,
                                padding: '4px 8px',
                                borderRadius: 6,
                                border: '1px solid #1C82A6',
                                background: 'var(--bg-input)',
                                color: 'var(--text-primary)',
                                fontSize: 12.5
                              }}
                            />
                            <button
                              type="button"
                              className="btn-primary-mint"
                              style={{ padding: '4px 8px', fontSize: 11 }}
                              onClick={() => {
                                if (editingTopicText.trim()) {
                                  onRenameTopic(disc.id, t.id, editingTopicText.trim());
                                }
                                setEditingTopicId(null);
                              }}
                            >
                              ✓ Salvar
                            </button>
                            <button
                              type="button"
                              className="btn-outline-mint"
                              style={{ padding: '4px 8px', fontSize: 11 }}
                              onClick={() => setEditingTopicId(null)}
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontWeight: t.nivel === 0 ? 700 : 400, display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span>{idx + 1}. {t.assunto}</span>
                            <button
                              type="button"
                              className="inline-edit-chip-btn"
                              style={{ padding: '1px 6px', fontSize: 10 }}
                              onClick={() => {
                                setEditingTopicId(t.id);
                                setEditingTopicText(t.assunto);
                              }}
                              title="Editar nome deste tópico"
                            >
                              ✎
                            </button>
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                        <button
                          onClick={() => onUpdateTopicInline(disc.id, t.id, 'acertos', -1)}
                          style={{ width: 22, height: 22, borderRadius: 6, border: '1px solid var(--border-card)', background: 'var(--bg-surface)', color: 'var(--text-primary)', cursor: 'pointer' }}
                        >
                          -
                        </button>
                        <input
                          type="number"
                          value={ac}
                          onChange={(e) => onUpdateTopicInline(disc.id, t.id, 'acertos', e.target.value, true)}
                          style={{ width: 42, textAlign: 'center', background: 'transparent', border: '1px solid rgba(0,168,89,0.5)', borderRadius: 6, color: '#00A859', fontWeight: 800, padding: '2px 0' }}
                        />
                        <button
                          onClick={() => onUpdateTopicInline(disc.id, t.id, 'acertos', 1)}
                          style={{ width: 22, height: 22, borderRadius: 6, border: '1px solid #00A859', background: 'rgba(0,168,89,0.18)', color: '#00A859', fontWeight: 800, cursor: 'pointer' }}
                        >
                          +
                        </button>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                        <button
                          onClick={() => onUpdateTopicInline(disc.id, t.id, 'erros', -1)}
                          style={{ width: 22, height: 22, borderRadius: 6, border: '1px solid var(--border-card)', background: 'var(--bg-surface)', color: 'var(--text-primary)', cursor: 'pointer' }}
                        >
                          -
                        </button>
                        <input
                          type="number"
                          value={er}
                          onChange={(e) => onUpdateTopicInline(disc.id, t.id, 'erros', e.target.value, true)}
                          style={{ width: 42, textAlign: 'center', background: 'transparent', border: '1px solid rgba(242,40,25,0.45)', borderRadius: 6, color: '#F22819', fontWeight: 800, padding: '2px 0' }}
                        />
                        <button
                          onClick={() => onUpdateTopicInline(disc.id, t.id, 'erros', 1)}
                          style={{ width: 22, height: 22, borderRadius: 6, border: '1px solid #F22819', background: 'rgba(242,40,25,0.15)', color: '#F22819', fontWeight: 800, cursor: 'pointer' }}
                        >
                          +
                        </button>
                      </div>

                      <div style={{ textAlign: 'center' }}>
                        <span className={`pct-badge ${badgeCls}`}>{pct !== null ? `${pct}%` : '-'}</span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                        <button
                          className="btn-primary-mint"
                          style={{ padding: '4px 10px', fontSize: 11.5 }}
                          onClick={() => onStartFlow(disc.id, t.id)}
                        >
                          ▷ Flow
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ==========================================================================
   MODAL REGISTRO DE ESTUDO MANUAL (COM MATÉRIAS E TÓPICOS EDITÁVEIS — DIGITAR E
   SALVAR — E CAMPO NOTAS ONDE FALO DOS MEUS ERROS PARA REVISAR DEPOIS)
   ========================================================================== */
function RegistroEstudoModal({
  plans,
  initialPlanId,
  initialDiscId,
  initialTopicoId,
  initialMinutos,
  onClose,
  onSave,
  onRenameDiscipline,
  onAddDiscipline,
  onRenameTopic,
  onAddTopic
}) {
  const [datePreset, setDatePreset] = useState('hoje');
  const [customDate, setCustomDate] = useState(toISODate(0));
  const [categoria, setCategoria] = useState('Teoria');

  const [selectedPlanId, setSelectedPlanId] = useState(initialPlanId || plans[0]?.id);
  const selectedPlan = plans.find((p) => p.id === selectedPlanId) || plans[0];

  const [discId, setDiscId] = useState(initialDiscId || selectedPlan.disciplinas[0]?.id);
  const selectedDisc =
    selectedPlan.disciplinas.find((d) => d.id === discId) || selectedPlan.disciplinas[0];

  const [topicoId, setTopicoId] = useState(initialTopicoId || selectedDisc?.topicos[0]?.id || '');

  const [minutos, setMinutos] = useState(initialMinutos || 25);
  const [material, setMaterial] = useState('Sessão de 25 min');
  const [notaErro, setNotaErro] = useState('');
  const [acertos, setAcertos] = useState(0);
  const [erros, setErros] = useState(0);

  // Estados para editar ou criar matéria e tópico direto no Registro de Estudos
  const [discEditMode, setDiscEditMode] = useState(null); // null | 'rename' | 'add'
  const [discTextInput, setDiscTextInput] = useState('');
  const [topicEditMode, setTopicEditMode] = useState(null); // null | 'rename' | 'add'
  const [topicTextInput, setTopicTextInput] = useState('');

  useEffect(() => {
    const firstD = selectedPlan.disciplinas[0];
    if (firstD && !selectedPlan.disciplinas.some((d) => d.id === discId)) {
      setDiscId(firstD.id);
      setTopicoId(firstD.topicos[0]?.id || '');
    }
  }, [selectedPlanId, selectedPlan]);

  useEffect(() => {
    if (selectedDisc && !selectedDisc.topicos.some((t) => t.id === topicoId)) {
      setTopicoId(selectedDisc.topicos[0]?.id || '');
    }
  }, [discId, selectedDisc]);

  function handleSaveDiscInline() {
    const clean = discTextInput.trim();
    if (!clean) return;
    if (discEditMode === 'rename' && selectedDisc) {
      onRenameDiscipline(selectedDisc.id, clean);
    } else if (discEditMode === 'add') {
      const newId = onAddDiscipline(clean);
      if (newId) setDiscId(newId);
    }
    setDiscEditMode(null);
    setDiscTextInput('');
  }

  function handleSaveTopicInline() {
    const clean = topicTextInput.trim();
    if (!clean || !selectedDisc) return;
    if (topicEditMode === 'rename' && topicoId) {
      onRenameTopic(selectedDisc.id, topicoId, clean);
    } else if (topicEditMode === 'add') {
      const newTopId = onAddTopic(selectedDisc.id, clean);
      if (newTopId) setTopicoId(newTopId);
    }
    setTopicEditMode(null);
    setTopicTextInput('');
  }

  function handleSubmit() {
    const date =
      datePreset === 'hoje' ? toISODate(0) : datePreset === 'ontem' ? toISODate(-1) : customDate || toISODate(0);
    const top = selectedDisc?.topicos.find((t) => t.id === topicoId) || selectedDisc?.topicos[0];
    const mins = Math.max(1, Number(minutos) || 25);
    const ac = Math.max(0, Number(acertos) || 0);
    const er = Math.max(0, Number(erros) || 0);
    const temaNome = top ? top.assunto : selectedDisc.nome;
    const nowSecStr = formatNowTimeWithSeconds();

    const newSession = {
      id: 'reg_' + Date.now(),
      date,
      startTime: nowSecStr,
      endTime: nowSecStr,
      time: nowSecStr.slice(0, 5),
      editalId: selectedPlan.id,
      editalNome: selectedPlan.nome,
      categoria,
      disciplinaId: selectedDisc.id,
      disciplinaNome: selectedDisc.nome,
      topicoId: top ? top.id : '',
      topicoNome: temaNome,
      minutos: mins,
      segundos: mins * 60,
      acertos: ac,
      erros: er,
      material,
      notaErro: notaErro.trim()
    };

    const errorEntry =
      er > 0 || notaErro.trim().length > 0
        ? {
            id: 'err_reg_' + Date.now(),
            date,
            time: nowSecStr,
            editalNome: selectedPlan.nome,
            disciplinaId: selectedDisc.id,
            disciplinaNome: selectedDisc.nome,
            topicoId: top ? top.id : '',
            tema: temaNome,
            erros: er,
            acertos: ac,
            observacao: notaErro.trim(),
            origem: 'Registro de Estudo'
          }
        : null;

    onSave(selectedPlan.id, newSession, errorEntry);
  }

  return (
    <div className="modal-backdrop open">
      <div className="registro-modal-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 className="registro-modal-title">Registro de Estudo</h2>
          <button
            onClick={onClose}
            style={{ border: 'none', background: 'none', fontSize: 22, cursor: 'pointer', color: '#64748B' }}
          >
            ×
          </button>
        </div>

        <div className="date-Quick-tabs">
          <span>📅</span>
          {['hoje', 'ontem', 'outro'].map((p) => (
            <button
              key={p}
              type="button"
              className={`date-pill-btn ${datePreset === p ? 'active' : ''}`}
              onClick={() => setDatePreset(p)}
            >
              {p.toUpperCase()}
            </button>
          ))}
          {datePreset === 'outro' && (
            <input type="date" value={customDate} onChange={(e) => setCustomDate(e.target.value)} />
          )}
        </div>

        <div className="reg-field" style={{ marginBottom: 14 }}>
          <label>1º SELECIONE O EDITAL</label>
          <select value={selectedPlanId} onChange={(e) => setSelectedPlanId(e.target.value)}>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>

        <div className="registro-form-grid-3">
          <div className="reg-field">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <label style={{ marginBottom: 0 }}>2º MATÉRIA / DISCIPLINA</label>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  type="button"
                  className="inline-edit-chip-btn"
                  style={{ padding: '1px 6px', fontSize: 10 }}
                  onClick={() => {
                    setDiscEditMode(discEditMode === 'rename' ? null : 'rename');
                    setDiscTextInput(selectedDisc?.nome || '');
                  }}
                  title="Editar/renomear matéria selecionada"
                >
                  ✎ Editar
                </button>
                <button
                  type="button"
                  className="inline-edit-chip-btn"
                  style={{ padding: '1px 6px', fontSize: 10 }}
                  onClick={() => {
                    setDiscEditMode(discEditMode === 'add' ? null : 'add');
                    setDiscTextInput('');
                  }}
                  title="Digitar e salvar nova matéria"
                >
                  + Nova
                </button>
              </div>
            </div>
            <select value={discId} onChange={(e) => setDiscId(e.target.value)}>
              {selectedPlan.disciplinas.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nome}
                </option>
              ))}
            </select>
            {discEditMode && (
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <input
                  type="text"
                  value={discTextInput}
                  onChange={(e) => setDiscTextInput(e.target.value)}
                  placeholder={discEditMode === 'rename' ? 'Novo nome da matéria...' : 'Digite a nova matéria...'}
                  style={{ flex: 1, padding: '6px 8px', fontSize: 12 }}
                />
                <button
                  type="button"
                  className="btn-primary-mint"
                  style={{ padding: '5px 10px', fontSize: 11.5 }}
                  onClick={handleSaveDiscInline}
                >
                  ✓ Salvar
                </button>
              </div>
            )}
          </div>

          <div className="reg-field">
            <label>CATEGORIA</label>
            <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              <option value="Teoria">Teoria</option>
              <option value="Revisão">Revisão da Matéria</option>
              <option value="Questões">Questões</option>
              <option value="Videoaula">Videoaula</option>
              <option value="Simulado">Simulado</option>
            </select>
          </div>

          <div className="reg-field">
            <label>TEMPO (PADRÃO 25 MIN)</label>
            <input type="number" min="1" value={minutos} onChange={(e) => setMinutos(e.target.value)} />
          </div>
        </div>

        <div className="registro-form-grid-2">
          <div className="reg-field">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <label style={{ marginBottom: 0 }}>3º TEMA / TÓPICO DA DISCIPLINA</label>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  type="button"
                  className="inline-edit-chip-btn"
                  style={{ padding: '1px 6px', fontSize: 10 }}
                  onClick={() => {
                    const currTop = (selectedDisc?.topicos || []).find((t) => t.id === topicoId);
                    setTopicEditMode(topicEditMode === 'rename' ? null : 'rename');
                    setTopicTextInput(currTop?.assunto || '');
                  }}
                  title="Editar/renomear tópico selecionado"
                >
                  ✎ Editar
                </button>
                <button
                  type="button"
                  className="inline-edit-chip-btn"
                  style={{ padding: '1px 6px', fontSize: 10 }}
                  onClick={() => {
                    setTopicEditMode(topicEditMode === 'add' ? null : 'add');
                    setTopicTextInput('');
                  }}
                  title="Digitar e salvar novo tópico"
                >
                  + Novo
                </button>
              </div>
            </div>
            <select value={topicoId} onChange={(e) => setTopicoId(e.target.value)}>
              {(selectedDisc?.topicos || []).map((t, i) => (
                <option key={t.id} value={t.id}>
                  {i + 1}. {t.assunto}
                </option>
              ))}
            </select>
            {topicEditMode && (
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <input
                  type="text"
                  value={topicTextInput}
                  onChange={(e) => setTopicTextInput(e.target.value)}
                  placeholder={topicEditMode === 'rename' ? 'Novo nome do tópico...' : 'Digite o novo tópico...'}
                  style={{ flex: 1, padding: '6px 8px', fontSize: 12 }}
                />
                <button
                  type="button"
                  className="btn-primary-mint"
                  style={{ padding: '5px 10px', fontSize: 11.5 }}
                  onClick={handleSaveTopicInline}
                >
                  ✓ Salvar
                </button>
              </div>
            )}
          </div>

          <div className="reg-field">
            <label>MATERIAL / FONTE</label>
            <input type="text" value={material} onChange={(e) => setMaterial(e.target.value)} />
          </div>
        </div>

        <div className="registro-form-grid-2">
          <div className="reg-field">
            <label style={{ color: '#00A859' }}>QUESTÕES CERTAS (✓)</label>
            <input type="number" min="0" value={acertos} onChange={(e) => setAcertos(e.target.value)} />
          </div>
          <div className="reg-field">
            <label style={{ color: '#F22819' }}>QUESTÕES ERRADAS (✗ — VAI P/ ESTATÍSTICAS E CADERNO DE ERROS)</label>
            <input type="number" min="0" value={erros} onChange={(e) => setErros(e.target.value)} />
          </div>
        </div>

        <div className="reg-field" style={{ marginTop: 14 }}>
          <label style={{ color: '#5BC0DE', fontWeight: 800 }}>
            📝 NOTAS
          </label>
          <textarea
            rows="3"
            value={notaErro}
            onChange={(e) => setNotaErro(e.target.value)}
            placeholder="Escreva suas notas ou pontos para revisar depois..."
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: '1px solid var(--border-card)',
              background: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              padding: '8px 16px',
              borderRadius: 10,
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Cancelar
          </button>
          <button type="button" className="btn-primary-mint" onClick={handleSubmit}>
            ✓ Salvar no Histórico & Estatísticas
          </button>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   MODAL ADICIONAR NOVO EDITAL
   ========================================================================== */
function NovoPlanoModal({ onClose, onCreate }) {
  const [nome, setNome] = useState('');
  const [rawText, setRawText] = useState(
    '# Front-End & React\n1. Fundamentos de JavaScript e TypeScript\n2. React Hooks e Componentização\n\n# Back-End & SQL\n1. Node.js e APIs REST\n2. Banco de Dados Relacional e SQL'
  );

  function handleCreate() {
    const colors = ['#1C82A6', '#5BC0DE', '#3B82F6', '#F59E0B', '#EC4899', '#0E4B60'];
    const disciplinas = [];
    let current = null;

    rawText.split('\n').forEach((line) => {
      const clean = line.trim();
      if (!clean) return;
      if (clean.startsWith('#')) {
        current = {
          id: 'c_' + Date.now() + '_' + disciplinas.length,
          agrupamento: 'EDITAL PERSONALIZADO',
          nome: clean.replace(/^#+\s*/, ''),
          cor: colors[disciplinas.length % colors.length],
          totalQuestoes: 50,
          url: 'https://www.tecconcursos.com.br',
          topicos: []
        };
        disciplinas.push(current);
      } else if (current) {
        current.topicos.push({
          id: `${current.id}_${current.topicos.length + 1}`,
          assunto: clean.replace(/^\d+[\.\-\)]\s*/, ''),
          questoesTexto: 'Personalizado',
          questoes: 20,
          nivel: 0,
          concluido: false,
          acertos: 0,
          erros: 0,
          ultimoEstudo: null
        });
      }
    });

    onCreate({
      id: 'plan_' + Date.now(),
      nome: nome.trim() || 'Meu Edital Personalizado',
      weeklyGoalHours: 20,
      weeklyGoalQuestions: 150,
      disciplinas,
      sessions: [],
      errorNotebook: [],
      manualStreakDays: {}
    });
  }

  return (
    <div className="modal-backdrop open">
      <div className="registro-modal-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 className="registro-modal-title" style={{ marginBottom: 0 }}>✨ Adicionar Novo Edital</h2>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>
        <div className="reg-field" style={{ marginBottom: 14 }}>
          <label>NOME DO EDITAL</label>
          <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: TRF / Analista TI" />
        </div>
        <div className="reg-field" style={{ marginBottom: 16 }}>
          <label>DISCIPLINAS (# Nome) E TÓPICOS (Um por linha)</label>
          <textarea
            rows="7"
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            style={{ width: '100%', border: '1px solid #CBD5E1', borderRadius: 8, padding: 10, fontSize: 12.5 }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" className="btn-primary-mint" onClick={handleCreate}>
            ✨ Salvar Edital
          </button>
        </div>
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
