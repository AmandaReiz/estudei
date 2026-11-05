(function () {
  const ESTUDEI_API = 'http://localhost:3000/api/tec-sync';

  // Create floating control pill on Tec Concursos pages
  function injectEstudeiWidget() {
    if (document.getElementById('estudei-tec-bridge-bar')) return;

    const bar = document.createElement('div');
    bar.id = 'estudei-tec-bridge-bar';
    bar.style.cssText = [
      'position:fixed',
      'bottom:18px',
      'left:18px',
      'z-index:999999',
      'display:flex',
      'align-items:center',
      'gap:10px',
      'padding:10px 16px',
      'border-radius:14px',
      'background:rgba(36, 16, 70, 0.92)',
      'backdrop-filter:blur(16px)',
      '-webkit-backdrop-filter:blur(16px)',
      'border:1px solid rgba(0, 205, 160, 0.5)',
      'box-shadow:0 12px 32px rgba(0,0,0,0.35)',
      'color:#fff',
      'font-family:Inter,system-ui,-apple-system,sans-serif',
      'font-size:13px'
    ].join(';');

    bar.innerHTML = `
      <span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#00CDA0;box-shadow:0 0 8px #00CDA0;"></span>
      <strong style="color:#00CDA0;letter-spacing:0.2px;">Estudei Pro</strong>
      <span id="estudei-tec-status" style="color:#E2E8F0;font-size:12px;">Monitorando Certas/Erradas</span>
      <button id="estudei-tec-sync-btn" style="background:linear-gradient(135deg,#00CDA0,#059669);color:#091526;border:none;border-radius:8px;padding:6px 12px;font-weight:700;font-size:12px;cursor:pointer;">
        ⚡ Sincronizar Página Agora
      </button>
    `;

    document.body.appendChild(bar);

    document.getElementById('estudei-tec-sync-btn').addEventListener('click', () => {
      scrapeAndSyncCurrentPage(true);
    });
  }

  function updateStatus(msg, color = '#00CDA0') {
    const el = document.getElementById('estudei-tec-status');
    if (el) {
      el.textContent = msg;
      el.style.color = color;
    }
  }

  async function sendToEstudei(items) {
    if (!items || items.length === 0) {
      updateStatus('Nenhuma atividade encontrada nesta tela', '#FBBF24');
      return;
    }
    try {
      const res = await fetch(ESTUDEI_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items })
      });
      const data = await res.json();
      if (data.ok) {
        updateStatus(`✓ ${items.length} registro(s) enviado(s) ao Estudei!`, '#00CDA0');
      } else {
        updateStatus('Erro ao sincronizar', '#F87171');
      }
    } catch (e) {
      updateStatus('Abra o Estudei em localhost:3000', '#F87171');
    }
  }

  // Scrape /estatisticas/atividades, /questoes/desempenho, or active question resolution
  function scrapeAndSyncCurrentPage(manual = false) {
    const items = [];
    const today = new Date().toISOString().slice(0, 10);

    // 1. Check tables in /estatisticas/atividades or /questoes/desempenho
    const rows = document.querySelectorAll('table tbody tr, .atividades-item, .desempenho-linha, .caderno-estatistica-linha');
    rows.forEach((tr) => {
      const text = (tr.innerText || '').trim();
      if (!text) return;
      const cells = Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim());
      if (cells.length >= 3) {
        // Typical Tec table: Matéria/Assunto | Resolvidas | Acertos | Erros | %
        const label = cells[0];
        const nums = cells.slice(1).map(c => parseInt(c.replace(/\D/g, ''), 10)).filter(n => !isNaN(n));
        if (label && nums.length >= 2) {
          let acertos = nums.length >= 3 ? nums[1] : nums[0];
          let erros = nums.length >= 3 ? nums[2] : nums[1];
          if (acertos + erros > 0) {
            items.push({
              source: 'tec_atividades_table',
              date: today,
              disciplina: label.split(' - ')[0] || label,
              assunto: label,
              acertos,
              erros,
              tempoMinutos: Math.max(5, Math.round((acertos + erros) * 2.2))
            });
          }
        }
      }
    });

    // 2. Check active resolved question on screen (Caderno de Questões)
    const idQuestaoEl = document.querySelector('.questao-cabecalho-informacoes-id, [ng-bind*="idQuestao"], .id-questao');
    const materiaEl = document.querySelector('[ng-bind*="nomeMateria"], .questao-cabecalho-informacoes-materia a');
    const assuntoEl = document.querySelector('[ng-bind*="nomeAssunto"], .questao-cabecalho-informacoes-assunto a');
    const acertouEl = document.querySelector('.alternativa.acerto, .questao-gabarito-acerto');
    const errouEl = document.querySelector('.alternativa.erro, .questao-gabarito-erro');

    if ((acertouEl || errouEl) && (materiaEl || assuntoEl)) {
      const qId = idQuestaoEl ? idQuestaoEl.innerText.replace(/\D/g, '') : String(Date.now());
      items.push({
        source: 'tec_questao_individual',
        date: today,
        questaoId: qId,
        questaoUrl: qId ? `https://www.tecconcursos.com.br/questoes/${qId}` : window.location.href,
        disciplina: materiaEl ? materiaEl.innerText.trim() : 'TI - Geral',
        assunto: assuntoEl ? assuntoEl.innerText.trim() : 'Questão Resolvida no Tec',
        acertos: acertouEl ? 1 : 0,
        erros: errouEl ? 1 : 0,
        tempoMinutos: 2
      });
    }

    if (items.length > 0 || manual) {
      sendToEstudei(items);
    }
  }

  // Listen to Resolver button clicks on Tec Concursos
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button, a');
    if (!btn) return;
    const txt = (btn.innerText || '').toLowerCase();
    if (txt.includes('resolver') || btn.id === 'botao-resolver') {
      setTimeout(() => scrapeAndSyncCurrentPage(false), 1200);
    }
  });

  injectEstudeiWidget();
})();
