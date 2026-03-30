(function () {
  const jobsTable = document.getElementById('jobsTable');
  const appliedJobsTable = document.getElementById('appliedJobsTable');
  const btnMatch = document.getElementById('btnMatch');
  const matchStatus = document.getElementById('matchStatus');
  const matchProgress = document.getElementById('matchProgress');
  const matchBar = document.getElementById('matchBar');
  const matchProgressText = document.getElementById('matchProgressText');
  const actionStatus = document.getElementById('actionStatus');
  const jobsCount = document.getElementById('jobsCount');
  const appliedJobsCount = document.getElementById('appliedJobsCount');

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
  const modalApplyBtn = document.getElementById('modalApplyBtn');
  const modalDeleteBtn = document.getElementById('modalDeleteBtn');

  // Bulk actions
  const bulkActionsBar = document.getElementById('bulkActionsBar');
  const bulkActionsBarApplied = document.getElementById('bulkActionsBarApplied');
  const bulkSelectedCount = document.getElementById('bulkSelectedCount');
  const bulkSelectedCountApplied = document.getElementById('bulkSelectedCountApplied');
  const selectAllJobs = document.getElementById('selectAllJobs');
  const selectAllApplied = document.getElementById('selectAllApplied');
  const btnBulkMarkApplied = document.getElementById('btnBulkMarkApplied');
  const btnBulkDelete = document.getElementById('btnBulkDelete');
  const btnBulkUnmark = document.getElementById('btnBulkUnmark');
  const btnBulkDeleteApplied = document.getElementById('btnBulkDeleteApplied');
  const btnClearSelection = document.getElementById('btnClearSelection');
  const btnClearSelectionApplied = document.getElementById('btnClearSelectionApplied');

  // Confirm modal
  const confirmOverlay = document.getElementById('confirmOverlay');
  const confirmIcon = document.getElementById('confirmIcon');
  const confirmTitle = document.getElementById('confirmTitle');
  const confirmMsg = document.getElementById('confirmMsg');
  const confirmOkBtn = document.getElementById('confirmOkBtn');
  const confirmCancelBtn = document.getElementById('confirmCancelBtn');
  let confirmResolve = null;

  const CONFIRM_ICONS = {
    danger: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="3 6 5 6 21 6"></polyline>
      <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path>
      <line x1="10" y1="11" x2="10" y2="17"></line>
      <line x1="14" y1="11" x2="14" y2="17"></line>
    </svg>`,
    primary: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14"></path>
      <polyline points="22 4 12 14.01 9 11.01"></polyline>
    </svg>`
  };

  function showConfirm({ title, message, confirmText, variant }) {
    confirmIcon.className = 'confirm-icon ' + variant;
    confirmIcon.innerHTML = CONFIRM_ICONS[variant];
    confirmTitle.textContent = title;
    confirmMsg.textContent = message;
    confirmOkBtn.textContent = confirmText;
    confirmOkBtn.className = 'confirm-ok ' + variant;
    confirmOverlay.classList.add('active');
    confirmOkBtn.focus();
    return new Promise(resolve => { confirmResolve = resolve; });
  }

  function showConfirmDelete(message) {
    return showConfirm({ title: 'Excluir vaga', message, confirmText: 'Excluir', variant: 'danger' });
  }

  function closeConfirm(result) {
    confirmOverlay.classList.remove('active');
    if (confirmResolve) { confirmResolve(result); confirmResolve = null; }
  }

  confirmOkBtn.addEventListener('click', () => closeConfirm(true));
  confirmCancelBtn.addEventListener('click', () => closeConfirm(false));
  confirmOverlay.addEventListener('click', (e) => {
    if (e.target === confirmOverlay) closeConfirm(false);
  });
  confirmOverlay.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); closeConfirm(true); }
    if (e.key === 'Escape') closeConfirm(false);
  });

  let allJobs = [];
  let selectedJobIds = new Set();
  let selectedAppliedIds = new Set();

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
    const isSelected = selectedJobIds.has(j.id);
    return (
      '<tr data-id="' + j.id + '" data-selected="' + isSelected + '">' +
      '<td><input type="checkbox" class="job-checkbox" data-id="' + j.id + '" ' + (isSelected ? 'checked' : '') + '></td>' +
      '<td class="job-title"><a href="' + escapeHtml(j.link || '#') + '" target="_blank" rel="noopener">' + escapeHtml(j.title) + '</a></td>' +
      '<td>' + escapeHtml(j.company || '-') + '</td>' +
      '<td>' + (scoreClass ? '<span class="' + scoreClass + '">' + scoreText + '</span>' : scoreText) + '</td>' +
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
    const isSelected = selectedAppliedIds.has(j.id);
    return (
      '<tr data-id="' + j.id + '" data-selected="' + isSelected + '">' +
      '<td><input type="checkbox" class="applied-checkbox" data-id="' + j.id + '" ' + (isSelected ? 'checked' : '') + '></td>' +
      '<td class="job-title"><a href="' + escapeHtml(j.link || '#') + '" target="_blank" rel="noopener">' + escapeHtml(j.title) + '</a></td>' +
      '<td>' + escapeHtml(j.company || '-') + '</td>' +
      '<td>' + (scoreClass ? '<span class="' + scoreClass + '">' + scoreText + '</span>' : scoreText) + '</td>' +
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

    jobsCount.textContent = `(${pendingJobs.length})`;

    jobsTable.innerHTML = pendingJobs.length === 0
      ? '<tr><td colspan="8">Nenhuma vaga pendente. Busque vagas na página inicial.</td></tr>'
      : pendingJobs.map(buildPendingRow).join('');

    appliedJobsCount.textContent = `(${appliedJobs.length})`;

    appliedJobsTable.innerHTML = appliedJobs.length === 0
      ? '<tr><td colspan="8">Nenhuma vaga marcada como candidata.</td></tr>'
      : appliedJobs.map(buildAppliedRow).join('');

    updateBulkActionsUI();
    attachCheckboxListeners();
  }

  function updateBulkActionsUI() {
    const pendingCount = selectedJobIds.size;
    const appliedCount = selectedAppliedIds.size;

    if (pendingCount > 0) {
      bulkActionsBar.style.display = 'flex';
      bulkSelectedCount.textContent = pendingCount + ' vaga(s) selecionada(s)';
    } else {
      bulkActionsBar.style.display = 'none';
    }

    if (appliedCount > 0) {
      bulkActionsBarApplied.style.display = 'flex';
      bulkSelectedCountApplied.textContent = appliedCount + ' vaga(s) selecionada(s)';
    } else {
      bulkActionsBarApplied.style.display = 'none';
    }

    const pendingJobs = allJobs.filter((j) => !j.applied);
    const appliedJobs = allJobs.filter((j) => !!j.applied);
    selectAllJobs.checked = pendingCount > 0 && pendingCount === pendingJobs.length;
    selectAllJobs.indeterminate = pendingCount > 0 && pendingCount < pendingJobs.length;

    selectAllApplied.checked = appliedCount > 0 && appliedCount === appliedJobs.length;
    selectAllApplied.indeterminate = appliedCount > 0 && appliedCount < appliedJobs.length;
  }

  function attachCheckboxListeners() {
    jobsTable.querySelectorAll('.job-checkbox').forEach((checkbox) => {
      checkbox.addEventListener('change', (e) => {
        const jobId = e.target.dataset.id;
        if (e.target.checked) {
          selectedJobIds.add(jobId);
        } else {
          selectedJobIds.delete(jobId);
        }
        updateSelectedRows();
        updateBulkActionsUI();
      });
    });

    appliedJobsTable.querySelectorAll('.applied-checkbox').forEach((checkbox) => {
      checkbox.addEventListener('change', (e) => {
        const jobId = e.target.dataset.id;
        if (e.target.checked) {
          selectedAppliedIds.add(jobId);
        } else {
          selectedAppliedIds.delete(jobId);
        }
        updateSelectedRows();
        updateBulkActionsUI();
      });
    });
  }

  function updateSelectedRows() {
    jobsTable.querySelectorAll('tr').forEach((row) => {
      const jobId = row.dataset.id;
      if (jobId && selectedJobIds.has(jobId)) {
        row.dataset.selected = 'true';
      } else {
        row.dataset.selected = 'false';
      }
    });

    appliedJobsTable.querySelectorAll('tr').forEach((row) => {
      const jobId = row.dataset.id;
      if (jobId && selectedAppliedIds.has(jobId)) {
        row.dataset.selected = 'true';
      } else {
        row.dataset.selected = 'false';
      }
    });
  }

  function loadJobs() {
    try {
      const jobs = window.scraperStorage ? window.scraperStorage.getJobs() : [];
      renderJobs(sortJobsByScore(jobs));
    } catch (_) {
      jobsTable.innerHTML = '<tr><td colspan="8">Erro ao carregar vagas.</td></tr>';
      appliedJobsTable.innerHTML = '<tr><td colspan="8">Erro ao carregar vagas.</td></tr>';
    }
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

  // Select All listeners
  selectAllJobs.addEventListener('change', (e) => {
    const pendingJobs = allJobs.filter((j) => !j.applied);
    if (e.target.checked) {
      pendingJobs.forEach((j) => selectedJobIds.add(j.id));
    } else {
      pendingJobs.forEach((j) => selectedJobIds.delete(j.id));
    }
    updateBulkActionsUI();
    jobsTable.querySelectorAll('.job-checkbox').forEach((cb) => {
      cb.checked = e.target.checked;
    });
    updateSelectedRows();
  });

  selectAllApplied.addEventListener('change', (e) => {
    const appliedJobs = allJobs.filter((j) => !!j.applied);
    if (e.target.checked) {
      appliedJobs.forEach((j) => selectedAppliedIds.add(j.id));
    } else {
      appliedJobs.forEach((j) => selectedAppliedIds.delete(j.id));
    }
    updateBulkActionsUI();
    appliedJobsTable.querySelectorAll('.applied-checkbox').forEach((cb) => {
      cb.checked = e.target.checked;
    });
    updateSelectedRows();
  });

  // Bulk action buttons
  btnBulkMarkApplied.addEventListener('click', async () => {
    const ids = Array.from(selectedJobIds);
    if (ids.length === 0) return;
    const confirmed = await showConfirm({
      title: 'Marcar como candidatado',
      message: `Marcar ${ids.length} vaga(s) como já candidatado?`,
      confirmText: 'Confirmar',
      variant: 'primary'
    });
    if (!confirmed) return;
    executeBulkAction(ids, true);
  });

  btnBulkDelete.addEventListener('click', async () => {
    const ids = Array.from(selectedJobIds);
    if (ids.length === 0) return;
    const confirmed = await showConfirmDelete(`Excluir ${ids.length} vaga(s)? Esta ação é irreversível.`);
    if (!confirmed) return;
    executeBulkDelete(ids);
  });

  btnBulkUnmark.addEventListener('click', async () => {
    const ids = Array.from(selectedAppliedIds);
    if (ids.length === 0) return;
    const confirmed = await showConfirm({
      title: 'Mover para pendentes',
      message: `Mover ${ids.length} vaga(s) de volta para pendentes?`,
      confirmText: 'Confirmar',
      variant: 'primary'
    });
    if (!confirmed) return;
    executeBulkAction(ids, false);
  });

  btnBulkDeleteApplied.addEventListener('click', async () => {
    const ids = Array.from(selectedAppliedIds);
    if (ids.length === 0) return;
    const confirmed = await showConfirmDelete(`Excluir ${ids.length} vaga(s)? Esta ação é irreversível.`);
    if (!confirmed) return;
    executeBulkDelete(ids);
  });

  btnClearSelection.addEventListener('click', () => {
    selectedJobIds.clear();
    selectAllJobs.checked = false;
    selectAllJobs.indeterminate = false;
    updateBulkActionsUI();
    jobsTable.querySelectorAll('.job-checkbox').forEach((cb) => {
      cb.checked = false;
    });
    updateSelectedRows();
  });

  btnClearSelectionApplied.addEventListener('click', () => {
    selectedAppliedIds.clear();
    selectAllApplied.checked = false;
    selectAllApplied.indeterminate = false;
    updateBulkActionsUI();
    appliedJobsTable.querySelectorAll('.applied-checkbox').forEach((cb) => {
      cb.checked = false;
    });
    updateSelectedRows();
  });

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
    modalApplyBtn.dataset.id = job.id;
    modalDeleteBtn.dataset.id = job.id;
    modalApplyBtn.disabled = !!job.applied;
    modalApplyBtn.textContent = job.applied ? 'Já candidatei' : 'Já me candidatei';
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

  modalApplyBtn.addEventListener('click', async () => {
    const jobId = modalApplyBtn.dataset.id;
    if (!jobId) return;
    closeModal();
    setApplied(jobId, true);
  });

  modalDeleteBtn.addEventListener('click', async () => {
    const jobId = modalDeleteBtn.dataset.id;
    if (!jobId) return;
    closeModal();
    await deleteJob(jobId);
  });

  function setApplied(jobId, applied) {
    if (!window.scraperStorage) return;
    window.scraperStorage.updateJob(jobId, {
      applied,
      appliedAt: applied ? new Date().toISOString() : null
    });
    setStatus(actionStatus, applied ? 'Vaga movida para "já me candidatei".' : 'Vaga movida para pendentes.', false);
    loadJobs();
  }

  async function deleteJob(jobId) {
    const confirmed = await showConfirmDelete('Tem certeza que deseja excluir esta vaga? Esta ação não pode ser desfeita.');
    if (!confirmed) return;
    if (window.scraperStorage) window.scraperStorage.deleteJob(jobId);
    setStatus(actionStatus, 'Vaga excluída.', false);
    loadJobs();
  }

  function executeBulkAction(jobIds, applied) {
    if (!window.scraperStorage) return;
    const appliedAt = applied ? new Date().toISOString() : null;
    for (const jobId of jobIds) {
      window.scraperStorage.updateJob(jobId, { applied, appliedAt });
    }
    selectedJobIds.clear();
    selectedAppliedIds.clear();
    setStatus(actionStatus, `${jobIds.length} vaga(s) processada(s)`, false);
    loadJobs();
  }

  function executeBulkDelete(jobIds) {
    if (!window.scraperStorage) return;
    for (const jobId of jobIds) {
      window.scraperStorage.deleteJob(jobId);
    }
    selectedJobIds.clear();
    selectedAppliedIds.clear();
    setStatus(actionStatus, `${jobIds.length} vaga(s) excluída(s)`, false);
    loadJobs();
  }

  // --- Match with SSE via fetch POST + ReadableStream ---
  btnMatch.addEventListener('click', async () => {
    btnMatch.disabled = true;
    setStatus(matchStatus, '', false);
    matchProgress.style.display = 'block';
    matchBar.style.width = '0%';
    matchProgressText.textContent = 'Iniciando análise...';
    highlightRow(null);

    const jobs = window.scraperStorage ? window.scraperStorage.getJobs() : [];
    const resume = window.scraperStorage ? window.scraperStorage.getResume() : null;
    const resumeText = (resume && resume.text) || '';

    let response;
    try {
      response = await fetch('/api/jobs/match-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobs, resumeText })
      });
    } catch (err) {
      setStatus(matchStatus, 'Erro de conexão.', true);
      btnMatch.disabled = false;
      matchProgress.style.display = 'none';
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    function handleMatchEvent(data) {
      if (data.type === 'analyzing') {
        const pct = Math.round(((data.index) / data.total) * 100);
        matchBar.style.width = pct + '%';
        matchProgressText.textContent = 'Analisando (' + (data.index + 1) + '/' + data.total + '): ' + data.title + (data.company ? ' @ ' + data.company : '');
        highlightRow(data.jobId);
      }

      if (data.type === 'result') {
        const pct = Math.round(((data.index + 1) / data.total) * 100);
        matchBar.style.width = pct + '%';
        if (window.scraperStorage) {
          window.scraperStorage.updateJob(data.id, { score: data.score, status: data.status, justificativa: data.justificativa });
        }
        updateRowScore(data.id, data.score, data.status, data.justificativa);
      }

      if (data.type === 'done') {
        matchBar.style.width = '100%';
        matchProgressText.textContent = 'Análise concluída! ' + data.processed + ' vaga(s) processada(s).';
        matchProgressText.className = 'status success';
        highlightRow(null);
        btnMatch.disabled = false;
        loadJobs();
        setTimeout(() => { matchProgress.style.display = 'none'; }, 4000);
      }

      if (data.type === 'error') {
        setStatus(matchStatus, data.error, true);
        highlightRow(null);
        btnMatch.disabled = false;
        matchProgress.style.display = 'none';
      }
    }

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop();
        for (const part of parts) {
          const line = part.trim();
          if (line.startsWith('data: ')) {
            try {
              handleMatchEvent(JSON.parse(line.slice(6)));
            } catch (_) {}
          }
        }
      }
    } catch (err) {
      setStatus(matchStatus, 'Conexão perdida durante a análise.', true);
      highlightRow(null);
      btnMatch.disabled = false;
      matchProgress.style.display = 'none';
      loadJobs();
    }
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
    const scoreCellIndex = 3;
    const statusCellIndex = 4;
    const justificationCellIndex = row.parentElement && row.parentElement.id === 'appliedJobsTable' ? null : 5;
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

  // Recarregar vagas quando o scraper terminar (roda em background)
  window.addEventListener('scraper-event', function (e) {
    if (e.detail.type === 'done') {
      loadJobs();
    }
  });

  // --- Init ---
  loadJobs();
})();
