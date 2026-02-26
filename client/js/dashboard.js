(function () {
  const jobsTable = document.getElementById('jobsTable');
  const historyTable = document.getElementById('historyTable');
  const checkAll = document.getElementById('checkAll');
  const btnMatch = document.getElementById('btnMatch');
  const matchStatus = document.getElementById('matchStatus');
  const matchProgress = document.getElementById('matchProgress');
  const matchBar = document.getElementById('matchBar');
  const matchProgressText = document.getElementById('matchProgressText');
  const emailQueueStatus = document.getElementById('emailQueueStatus');
  const btnGenerateProposals = document.getElementById('btnGenerateProposals');
  const btnSendSelected = document.getElementById('btnSendSelected');
  const actionStatus = document.getElementById('actionStatus');
  const proposalProgress = document.getElementById('proposalProgress');
  const proposalBar = document.getElementById('proposalBar');
  const proposalProgressText = document.getElementById('proposalProgressText');

  const modal = document.getElementById('jobModal');
  const modalClose = document.getElementById('modalClose');
  const modalTitle = document.getElementById('modalTitle');
  const modalCompany = document.getElementById('modalCompany');
  const modalScore = document.getElementById('modalScore');
  const modalStatusBadge = document.getElementById('modalStatusBadge');
  const modalDescription = document.getElementById('modalDescription');
  const modalJustificativa = document.getElementById('modalJustificativa');
  const modalProposal = document.getElementById('modalProposal');
  const modalEmail = document.getElementById('modalEmail');
  const modalLink = document.getElementById('modalLink');

  let allJobs = [];

  function escapeHtml(s) {
    if (!s) return '';
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function setStatus(el, text, isError) {
    if (!el) return;
    el.textContent = text;
    el.className = 'status' + (isError ? ' error' : ' success');
  }

  // --- Jobs ---
  function renderJobs(jobs) {
    allJobs = jobs;
    if (jobs.length === 0) {
      jobsTable.innerHTML = '<tr><td colspan="9">Nenhuma vaga. Busque vagas na página inicial.</td></tr>';
      checkAll.checked = false;
      return;
    }
    jobsTable.innerHTML = jobs.map((j) => {
      const scoreClass = j.score >= 70 ? 'score-aprovado' : j.score >= 50 ? 'score-talvez' : j.score != null ? 'score-descartado' : '';
      const scoreText = j.score != null ? j.score : '-';
      const proposalPreview = (j.proposal || '').slice(0, 80) + (j.proposal && j.proposal.length > 80 ? '...' : '');
      const emailDisplay = j.email || '-';
      return (
        '<tr data-id="' + j.id + '">' +
        '<td><input type="checkbox" class="job-check" data-id="' + j.id + '"></td>' +
        '<td class="job-title"><a href="' + escapeHtml(j.link || '#') + '" target="_blank" rel="noopener">' + escapeHtml(j.title) + '</a></td>' +
        '<td>' + escapeHtml(j.company || '-') + '</td>' +
        '<td class="' + scoreClass + '">' + scoreText + '</td>' +
        '<td>' + escapeHtml(j.status || '-') + '</td>' +
        '<td>' + escapeHtml((j.justificativa || '').slice(0, 60)) + '</td>' +
        '<td><span class="proposal-preview">' + escapeHtml(proposalPreview) + '</span></td>' +
        '<td>' + escapeHtml(emailDisplay) + '</td>' +
        '<td><button class="btn-details" data-id="' + j.id + '">Ver</button></td>' +
        '</tr>'
      );
    }).join('');
    checkAll.checked = false;
  }

  function loadJobs() {
    fetch('/api/jobs')
      .then((r) => r.json())
      .then((jobs) => renderJobs(sortJobsByScore(jobs)))
      .catch(() => {
        jobsTable.innerHTML = '<tr><td colspan="9">Erro ao carregar vagas.</td></tr>';
      });
  }

  function sortJobsByScore(jobs) {
    return [...jobs].sort((a, b) => {
      const sa = a.score != null ? a.score : -1;
      const sb = b.score != null ? b.score : -1;
      return sb - sa;
    });
  }

  // --- Modal ---
  jobsTable.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-details');
    if (!btn) return;
    const id = btn.dataset.id;
    const job = allJobs.find((j) => j.id === id);
    if (!job) return;
    openModal(job);
  });

  function openModal(job) {
    modalTitle.textContent = job.title || '';
    modalCompany.textContent = job.company || '';
    modalScore.textContent = job.score != null ? 'Score: ' + job.score : 'Sem score';
    modalScore.className = 'modal-score ' + (job.score >= 70 ? 'score-aprovado' : job.score >= 50 ? 'score-talvez' : job.score != null ? 'score-descartado' : '');
    modalStatusBadge.textContent = job.status || '';
    modalStatusBadge.className = 'modal-status badge-' + (job.status || 'none');
    modalDescription.textContent = job.description || 'Sem descrição disponível.';
    modalJustificativa.textContent = job.justificativa || 'Ainda não analisado.';
    modalProposal.textContent = job.proposal || 'Nenhuma proposta gerada.';
    modalEmail.textContent = job.email || 'Não encontrado';
    modalLink.href = job.link || '#';
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }

  modalClose.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  // --- History ---
  function loadHistory() {
    fetch('/api/history')
      .then((r) => r.json())
      .then((history) => {
        historyTable.innerHTML = history.length === 0
          ? '<tr><td colspan="4">Nenhum registro.</td></tr>'
          : history.map((h) => {
              const date = h.sentAt ? new Date(h.sentAt).toLocaleString() : '-';
              const tipo = h.type === 'email_sent' ? 'E-mail enviado' : h.type || '-';
              const vaga = (h.title || '') + (h.company ? ' @ ' + h.company : '');
              return '<tr><td>' + escapeHtml(date) + '</td><td>' + escapeHtml(tipo) + '</td><td>' + escapeHtml(vaga) + '</td><td>' + escapeHtml(h.to || '-') + '</td></tr>';
            }).join('');
      })
      .catch(() => {
        historyTable.innerHTML = '<tr><td colspan="4">Erro ao carregar histórico.</td></tr>';
      });
  }

  function loadEmailStatus() {
    fetch('/api/emails/status')
      .then((r) => r.json())
      .then((s) => {
        emailQueueStatus.textContent = 'Fila: ' + s.queueLength + ' | Enviados hoje: ' + s.sentToday + ' / ' + s.maxPerDay;
      })
      .catch(() => {});
  }

  // --- Check all ---
  checkAll.addEventListener('change', function () {
    document.querySelectorAll('.job-check').forEach((cb) => {
      cb.checked = checkAll.checked;
    });
  });

  // --- Match with SSE ---
  btnMatch.addEventListener('click', () => {
    btnMatch.disabled = true;
    setStatus(matchStatus, '', false);
    matchProgress.style.display = 'block';
    matchBar.style.width = '0%';
    matchProgressText.textContent = 'Iniciando análise...';

    highlightRow(null);

    const evtSource = new EventSource('/api/jobs/match-stream');

    evtSource.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'analyzing') {
        const pct = Math.round(((data.index) / data.total) * 100);
        matchBar.style.width = pct + '%';
        matchProgressText.textContent = 'Analisando (' + (data.index + 1) + '/' + data.total + '): ' + data.title + (data.company ? ' @ ' + data.company : '');
        highlightRow(data.jobId);
      }

      if (data.type === 'ollama') {
        matchProgressText.textContent = 'IA analisando (' + (data.index + 1) + '/' + data.total + '): ' + data.title + '...';
        matchProgressText.className = 'status ollama-working';
      }

      if (data.type === 'result') {
        const pct = Math.round(((data.index + 1) / data.total) * 100);
        matchBar.style.width = pct + '%';
        updateRowScore(data.id, data.score, data.status, data.justificativa);
      }

      if (data.type === 'done') {
        matchBar.style.width = '100%';
        matchProgressText.textContent = 'Análise concluída! ' + data.processed + ' vaga(s) processada(s).';
        matchProgressText.className = 'status success';
        highlightRow(null);
        evtSource.close();
        btnMatch.disabled = false;

        fetch('/api/jobs')
          .then((r) => r.json())
          .then((jobs) => {
            renderJobs(sortJobsByScore(jobs));
          });

        setTimeout(() => { matchProgress.style.display = 'none'; }, 4000);
      }

      if (data.type === 'error') {
        setStatus(matchStatus, data.error, true);
        highlightRow(null);
        evtSource.close();
        btnMatch.disabled = false;
        matchProgress.style.display = 'none';
      }
    };

    evtSource.onerror = () => {
      evtSource.close();
      btnMatch.disabled = false;
      matchProgress.style.display = 'none';
      setStatus(matchStatus, 'Conexão perdida durante a análise.', true);
      highlightRow(null);
      loadJobs();
    };
  });

  function highlightRow(jobId) {
    document.querySelectorAll('#jobsTable tr').forEach((tr) => {
      tr.classList.remove('row-analyzing');
    });
    if (jobId) {
      const row = document.querySelector('#jobsTable tr[data-id="' + jobId + '"]');
      if (row) {
        row.classList.add('row-analyzing');
        row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }

  function updateRowScore(jobId, score, status, justificativa) {
    const row = document.querySelector('#jobsTable tr[data-id="' + jobId + '"]');
    if (!row) return;
    const cells = row.querySelectorAll('td');
    if (cells.length < 7) return;
    const scoreClass = score >= 70 ? 'score-aprovado' : score >= 50 ? 'score-talvez' : 'score-descartado';
    cells[3].className = scoreClass;
    cells[3].textContent = score != null ? score : '-';
    cells[4].textContent = status || '-';
    cells[5].textContent = (justificativa || '').slice(0, 60);
    row.classList.remove('row-analyzing');

    const job = allJobs.find((j) => j.id === jobId);
    if (job) {
      job.score = score;
      job.status = status;
      job.justificativa = justificativa;
    }
  }

  // --- Proposals with SSE ---
  btnGenerateProposals.addEventListener('click', () => {
    const ids = Array.from(document.querySelectorAll('.job-check:checked')).map((c) => c.dataset.id);
    if (ids.length === 0) {
      setStatus(actionStatus, 'Selecione ao menos uma vaga.', true);
      return;
    }
    btnGenerateProposals.disabled = true;
    setStatus(actionStatus, '', false);
    proposalProgress.style.display = 'block';
    proposalBar.style.width = '0%';
    proposalProgressText.textContent = 'Iniciando geração de propostas...';

    const evtSource = new EventSource('/api/jobs/proposals-stream?ids=' + ids.join(','));

    evtSource.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'generating') {
        const pct = Math.round((data.index / data.total) * 100);
        proposalBar.style.width = pct + '%';
        proposalProgressText.textContent = 'Gerando proposta (' + (data.index + 1) + '/' + data.total + '): ' + (data.title || data.jobId) + '...';
        proposalProgressText.className = 'status ollama-working';
        highlightRow(data.jobId);
      }

      if (data.type === 'result') {
        const pct = Math.round(((data.index + 1) / data.total) * 100);
        proposalBar.style.width = pct + '%';
        if (data.proposal) {
          proposalProgressText.textContent = 'Proposta gerada para ' + (data.jobId);
          proposalProgressText.className = 'status success';
        }
        highlightRow(null);
      }

      if (data.type === 'done') {
        proposalBar.style.width = '100%';
        proposalProgressText.textContent = 'Todas as propostas foram geradas!';
        proposalProgressText.className = 'status success';
        highlightRow(null);
        evtSource.close();
        btnGenerateProposals.disabled = false;
        loadJobs();
        setTimeout(() => { proposalProgress.style.display = 'none'; }, 4000);
      }

      if (data.type === 'error') {
        setStatus(actionStatus, data.error, true);
        highlightRow(null);
        evtSource.close();
        btnGenerateProposals.disabled = false;
        proposalProgress.style.display = 'none';
      }
    };

    evtSource.onerror = () => {
      evtSource.close();
      btnGenerateProposals.disabled = false;
      proposalProgress.style.display = 'none';
      setStatus(actionStatus, 'Conexão perdida durante a geração de propostas.', true);
      highlightRow(null);
      loadJobs();
    };
  });

  // --- Send emails ---
  btnSendSelected.addEventListener('click', async () => {
    const ids = Array.from(document.querySelectorAll('.job-check:checked')).map((c) => c.dataset.id);
    if (ids.length === 0) {
      setStatus(actionStatus, 'Selecione ao menos uma vaga.', true);
      return;
    }

    const items = ids.map((id) => {
      const job = allJobs.find((j) => j.id === id);
      const to = (job && job.email) || '';
      return { jobId: id, to };
    });

    const missing = items.filter((it) => !it.to);
    if (missing.length > 0) {
      const fallback = prompt('Algumas vagas não possuem email. Informe um email de destino padrão (ou deixe vazio para pular):');
      if (fallback && fallback.trim()) {
        items.forEach((it) => { if (!it.to) it.to = fallback.trim(); });
      } else {
        const filtered = items.filter((it) => it.to);
        if (filtered.length === 0) {
          setStatus(actionStatus, 'Nenhum e-mail disponível para envio.', true);
          return;
        }
        items.length = 0;
        items.push(...filtered);
      }
    }

    try {
      const res = await fetch('/api/emails/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao enfileirar');
      setStatus(actionStatus, 'Enfileirados ' + data.queued + ' e-mail(s). Delay 3–5 min entre cada um.', false);
      loadEmailStatus();
      loadJobs();
    } catch (err) {
      setStatus(actionStatus, err.message || 'Erro.', true);
    }
  });

  // --- Init ---
  loadJobs();
  loadHistory();
  loadEmailStatus();
  setInterval(loadEmailStatus, 30000);
})();
