(function () {
  const jobsTable = document.getElementById('jobsTable');
  const appliedJobsTable = document.getElementById('appliedJobsTable');
  const btnMatch = document.getElementById('btnMatch');
  const matchStatus = document.getElementById('matchStatus');
  const matchProgress = document.getElementById('matchProgress');
  const matchBar = document.getElementById('matchBar');
  const matchProgressText = document.getElementById('matchProgressText');
  const actionStatus = document.getElementById('actionStatus');

  const modal = document.getElementById('jobModal');
  const modalClose = document.getElementById('modalClose');
  const modalTitle = document.getElementById('modalTitle');
  const modalCompany = document.getElementById('modalCompany');
  const modalScore = document.getElementById('modalScore');
  const modalStatusBadge = document.getElementById('modalStatusBadge');
  const modalDescription = document.getElementById('modalDescription');
  const modalJustificativa = document.getElementById('modalJustificativa');
  const modalAppliedInfo = document.getElementById('modalAppliedInfo');
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

  function getScoreClass(score) {
    if (score == null) return '';
    if (score >= 70) return 'score-aprovado';
    if (score >= 50) return 'score-talvez';
    return 'score-descartado';
  }

  function formatAppliedAt(value) {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleString();
  }

  function buildPendingRow(j) {
    const scoreClass = getScoreClass(j.score);
    const scoreText = j.score != null ? j.score : '-';
    return (
      '<tr data-id="' + j.id + '">' +
      '<td class="job-title"><a href="' + escapeHtml(j.link || '#') + '" target="_blank" rel="noopener">' + escapeHtml(j.title) + '</a></td>' +
      '<td>' + escapeHtml(j.company || '-') + '</td>' +
      '<td class="' + scoreClass + '">' + scoreText + '</td>' +
      '<td>' + escapeHtml(j.status || '-') + '</td>' +
      '<td>' + escapeHtml((j.justificativa || '').slice(0, 90)) + '</td>' +
      '<td><div class="action-buttons"><button class="btn-apply" data-id="' + j.id + '">Já me candidatei</button><button class="btn-delete" data-id="' + j.id + '">Excluir</button></div></td>' +
      '<td><button class="btn-details" data-id="' + j.id + '">Ver</button></td>' +
      '</tr>'
    );
  }

  function buildAppliedRow(j) {
    const scoreClass = getScoreClass(j.score);
    const scoreText = j.score != null ? j.score : '-';
    return (
      '<tr data-id="' + j.id + '">' +
      '<td class="job-title"><a href="' + escapeHtml(j.link || '#') + '" target="_blank" rel="noopener">' + escapeHtml(j.title) + '</a></td>' +
      '<td>' + escapeHtml(j.company || '-') + '</td>' +
      '<td class="' + scoreClass + '">' + scoreText + '</td>' +
      '<td>' + escapeHtml(j.status || '-') + '</td>' +
      '<td>' + escapeHtml(formatAppliedAt(j.appliedAt)) + '</td>' +
      '<td><div class="action-buttons"><button class="btn-unapply" data-id="' + j.id + '">Mover para pendentes</button><button class="btn-delete" data-id="' + j.id + '">Excluir</button></div></td>' +
      '<td><button class="btn-details" data-id="' + j.id + '">Ver</button></td>' +
      '</tr>'
    );
  }

  function renderJobs(jobs) {
    allJobs = jobs;
    const pendingJobs = jobs.filter((j) => !j.applied);
    const appliedJobs = jobs.filter((j) => !!j.applied);

    jobsTable.innerHTML = pendingJobs.length === 0
      ? '<tr><td colspan="7">Nenhuma vaga pendente. Busque vagas na página inicial.</td></tr>'
      : pendingJobs.map(buildPendingRow).join('');

    appliedJobsTable.innerHTML = appliedJobs.length === 0
      ? '<tr><td colspan="7">Nenhuma vaga marcada como candidata.</td></tr>'
      : appliedJobs.map(buildAppliedRow).join('');
  }

  function loadJobs() {
    fetch('/api/jobs')
      .then((r) => r.json())
      .then((jobs) => renderJobs(sortJobsByScore(jobs)))
      .catch(() => {
        jobsTable.innerHTML = '<tr><td colspan="7">Erro ao carregar vagas.</td></tr>';
        appliedJobsTable.innerHTML = '<tr><td colspan="7">Erro ao carregar vagas.</td></tr>';
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
  function onTableClick(e) {
    const detailsBtn = e.target.closest('.btn-details');
    if (detailsBtn) {
      const detailsId = detailsBtn.dataset.id;
      const detailsJob = allJobs.find((j) => j.id === detailsId);
      if (detailsJob) openModal(detailsJob);
      return;
    }

    const applyBtn = e.target.closest('.btn-apply');
    if (applyBtn) {
      setApplied(applyBtn.dataset.id, true);
      return;
    }

    const unapplyBtn = e.target.closest('.btn-unapply');
    if (unapplyBtn) {
      setApplied(unapplyBtn.dataset.id, false);
      return;
    }

    const deleteBtn = e.target.closest('.btn-delete');
    if (deleteBtn) {
      deleteJob(deleteBtn.dataset.id);
    }
  }

  jobsTable.addEventListener('click', onTableClick);
  appliedJobsTable.addEventListener('click', onTableClick);

  function openModal(job) {
    modalTitle.textContent = job.title || '';
    modalCompany.textContent = job.company || '';
    modalScore.textContent = job.score != null ? 'Score: ' + job.score : 'Sem score';
    modalScore.className = 'modal-score ' + getScoreClass(job.score);
    modalStatusBadge.textContent = job.status || '';
    modalStatusBadge.className = 'modal-status badge-' + (job.status || 'none');
    modalDescription.innerHTML = job.description || 'Sem descrição disponível.';
    modalJustificativa.textContent = job.justificativa || 'Ainda não analisado.';
    modalAppliedInfo.textContent = job.applied
      ? 'Candidatura marcada em: ' + formatAppliedAt(job.appliedAt)
      : 'Vaga ainda não marcada como candidatura.';
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

  async function setApplied(jobId, applied) {
    try {
      const res = await fetch('/api/jobs/' + encodeURIComponent(jobId) + '/applied', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applied })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao atualizar vaga');
      setStatus(actionStatus, applied ? 'Vaga movida para "já me candidatei".' : 'Vaga movida para pendentes.', false);
      loadJobs();
    } catch (err) {
      setStatus(actionStatus, err.message || 'Erro.', true);
    }
  }

  async function deleteJob(jobId) {
    if (!confirm('Tem certeza que deseja excluir esta vaga?')) return;
    try {
      const res = await fetch('/api/jobs/' + encodeURIComponent(jobId), { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao excluir vaga');
      setStatus(actionStatus, 'Vaga excluída.', false);
      loadJobs();
    } catch (err) {
      setStatus(actionStatus, err.message || 'Erro.', true);
    }
  }

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
    document.querySelectorAll('#jobsTable tr, #appliedJobsTable tr').forEach((tr) => {
      tr.classList.remove('row-analyzing');
    });
    if (jobId) {
      const row = document.querySelector('tr[data-id="' + jobId + '"]');
      if (row) {
        row.classList.add('row-analyzing');
        row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }

  function updateRowScore(jobId, score, status, justificativa) {
    const row = document.querySelector('tr[data-id="' + jobId + '"]');
    if (!row) return;
    const cells = row.querySelectorAll('td');
    const scoreCellIndex = 2;
    const statusCellIndex = 3;
    const justificationCellIndex = row.parentElement && row.parentElement.id === 'appliedJobsTable' ? null : 4;
    if (cells.length <= statusCellIndex) return;
    cells[scoreCellIndex].className = getScoreClass(score);
    cells[scoreCellIndex].textContent = score != null ? score : '-';
    cells[statusCellIndex].textContent = status || '-';
    if (justificationCellIndex != null && cells.length > justificationCellIndex) {
      cells[justificationCellIndex].textContent = (justificativa || '').slice(0, 90);
    }
    row.classList.remove('row-analyzing');

    const job = allJobs.find((j) => j.id === jobId);
    if (job) {
      job.score = score;
      job.status = status;
      job.justificativa = justificativa;
    }
  }

  // --- Init ---
  loadJobs();
})();
