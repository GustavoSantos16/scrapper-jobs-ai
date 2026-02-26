(function () {
  const jobsTable = document.getElementById('jobsTable');
  const historyTable = document.getElementById('historyTable');
  const checkAll = document.getElementById('checkAll');
  const btnMatch = document.getElementById('btnMatch');
  const matchStatus = document.getElementById('matchStatus');
  const emailQueueStatus = document.getElementById('emailQueueStatus');
  const btnGenerateProposals = document.getElementById('btnGenerateProposals');
  const btnSendSelected = document.getElementById('btnSendSelected');
  const emailTo = document.getElementById('emailTo');
  const actionStatus = document.getElementById('actionStatus');

  function setStatus(el, text, isError) {
    if (!el) return;
    el.textContent = text;
    el.className = 'status' + (isError ? ' error' : ' success');
  }

  function loadJobs() {
    fetch('/api/jobs')
      .then((r) => r.json())
      .then((jobs) => {
        jobsTable.innerHTML = jobs.length === 0
          ? '<tr><td colspan="8">Nenhuma vaga. Busque vagas na página inicial.</td></tr>'
          : jobs.map((j) => {
              const scoreClass = j.score >= 70 ? 'score-aprovado' : j.score >= 50 ? 'score-talvez' : 'score-descartado';
              const scoreText = j.score != null ? j.score : '-';
              const proposalPreview = (j.proposal || '').slice(0, 120) + (j.proposal && j.proposal.length > 120 ? '...' : '');
              return (
                '<tr data-id="' + j.id + '">' +
                '<td><input type="checkbox" class="job-check" data-id="' + j.id + '"></td>' +
                '<td class="job-title"><a href="' + (j.link || '#') + '" target="_blank" rel="noopener">' + escapeHtml(j.title) + '</a></td>' +
                '<td>' + escapeHtml(j.company || '-') + '</td>' +
                '<td class="' + scoreClass + '">' + scoreText + '</td>' +
                '<td>' + escapeHtml(j.status || '-') + '</td>' +
                '<td>' + escapeHtml((j.justificativa || '').slice(0, 80)) + '</td>' +
                '<td><span class="proposal-preview" title="' + escapeHtml(j.proposal || '') + '">' + escapeHtml(proposalPreview) + '</span></td>' +
                '<td>' + (j.emailSent ? 'Enviado ' + (j.emailSentAt ? new Date(j.emailSentAt).toLocaleString() : '') : '-') + '</td>' +
                '</tr>'
              );
            }).join('');
        checkAll.checked = false;
      })
      .catch(() => {
        jobsTable.innerHTML = '<tr><td colspan="8">Erro ao carregar vagas.</td></tr>';
      });
  }

  function escapeHtml(s) {
    if (!s) return '';
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

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
              return (
                '<tr><td>' + escapeHtml(date) + '</td><td>' + escapeHtml(tipo) + '</td><td>' + escapeHtml(vaga) + '</td><td>' + escapeHtml(h.to || '-') + '</td></tr>'
              );
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

  checkAll.addEventListener('change', function () {
    document.querySelectorAll('.job-check').forEach((cb) => {
      cb.checked = checkAll.checked;
    });
  });

  btnMatch.addEventListener('click', async () => {
    btnMatch.disabled = true;
    setStatus(matchStatus, 'Analisando vagas com o currículo (Ollama)...', false);
    try {
      const res = await fetch('/api/jobs/match', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro no match');
      setStatus(matchStatus, 'Processadas ' + data.processed + ' vagas.', false);
      loadJobs();
    } catch (err) {
      setStatus(matchStatus, err.message || 'Erro ao analisar.', true);
    }
    btnMatch.disabled = false;
  });

  btnGenerateProposals.addEventListener('click', async () => {
    const ids = Array.from(document.querySelectorAll('.job-check:checked')).map((c) => c.dataset.id);
    if (ids.length === 0) {
      setStatus(actionStatus, 'Selecione ao menos uma vaga.', true);
      return;
    }
    btnGenerateProposals.disabled = true;
    setStatus(actionStatus, 'Gerando propostas...', false);
    try {
      const res = await fetch('/api/jobs/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobIds: ids })
      });
      const data = await res.json();
      console.log(data)
      if (!res.ok) throw new Error(data.error || 'Erro ao gerar propostas');
      setStatus(actionStatus, 'Propostas geradas para ' + ids.length + ' vaga(s).', false);
      loadJobs();
    } catch (err) {
      setStatus(actionStatus, err.message || 'Erro.', true);
    }
    btnGenerateProposals.disabled = false;
  });

  btnSendSelected.addEventListener('click', async () => {
    const ids = Array.from(document.querySelectorAll('.job-check:checked')).map((c) => c.dataset.id);
    const to = (emailTo && emailTo.value.trim()) || '';
    if (ids.length === 0) {
      setStatus(actionStatus, 'Selecione ao menos uma vaga.', true);
      return;
    }
    if (!to) {
      setStatus(actionStatus, 'Informe o e-mail de destino.', true);
      return;
    }
    const items = ids.map((id) => ({ jobId: id, to }));
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

  loadJobs();
  loadHistory();
  loadEmailStatus();
  setInterval(loadEmailStatus, 30000);
})();
