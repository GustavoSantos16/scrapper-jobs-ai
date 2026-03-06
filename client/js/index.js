(function () {
  const formResume = document.getElementById('formResume');
  const fileResume = document.getElementById('fileResume');
  const btnUpload = document.getElementById('btnUpload');
  const resumeStatus = document.getElementById('resumeStatus');
  const searchUrl = document.getElementById('searchUrl');
  const btnScraper = document.getElementById('btnScraper');
  const scraperStatus = document.getElementById('scraperStatus');

  function setStatus(el, text, isError) {
    el.textContent = text;
    el.className = 'status' + (isError ? ' error' : ' success');
  }

  // Carregar currículo salvo
  fetch('/api/resume')
    .then((r) => r.json())
    .then((data) => {
      if (data && data.updatedAt) {
        resumeStatus.textContent = 'Currículo carregado em ' + new Date(data.updatedAt).toLocaleString();
        resumeStatus.className = 'status success';
      }
    })
    .catch(() => {});

  formResume.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!fileResume.files.length) {
      setStatus(resumeStatus, 'Selecione um arquivo.', true);
      return;
    }
    btnUpload.disabled = true;
    setStatus(resumeStatus, 'Enviando...', false);
    const formData = new FormData();
    formData.append('resume', fileResume.files[0]);
    try {
      const res = await fetch('/api/resume/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro no upload');
      setStatus(resumeStatus, 'Currículo salvo com sucesso.', false);
      fileResume.value = '';
    } catch (err) {
      setStatus(resumeStatus, err.message || 'Erro ao enviar currículo.', true);
    }
    btnUpload.disabled = false;
  });

  const scraperProgress = document.getElementById('scraperProgress');
  const scraperBar = document.getElementById('scraperBar');
  const scraperProgressText = document.getElementById('scraperProgressText');

  window.addEventListener('scraper-event', (e) => {
    const data = e.detail;

    scraperProgress.style.display = 'block';

    if (data.type === 'status') {
      scraperProgressText.textContent = data.message;
    }

    if (data.type === 'login') {
      scraperBar.classList.add('login-wait');
      scraperProgressText.textContent = data.message;
    }

    if (data.type === 'page') {
      scraperBar.classList.remove('login-wait');
      const pct = Math.round((data.page / data.totalPages) * 100);
      scraperBar.style.width = pct + '%';
      scraperProgressText.textContent = 'Coletando página ' + data.page + '... (' + data.collected + ' vagas encontradas)';
    }

    if (data.type === 'progress') {
      const pct = Math.round((data.page / 10) * 100);
      scraperBar.style.width = pct + '%';
      scraperProgressText.textContent = 'Página ' + data.page + ': +' + data.added + ' vagas (total: ' + data.collected + ')';
    }

    if (data.type === 'done') {
      scraperBar.style.width = '100%';
      scraperProgressText.textContent = 'Concluído! ' + data.collected + ' novas vagas coletadas. Total no sistema: ' + data.total;
      scraperProgressText.className = 'status success';
      btnScraper.disabled = false;
      setTimeout(() => { scraperProgress.style.display = 'none'; }, 5000);
    }

    if (data.type === 'error') {
      setStatus(scraperStatus, data.error, true);
      btnScraper.disabled = false;
      scraperProgress.style.display = 'none';
    }
  });

  btnScraper.addEventListener('click', () => {
    if (window.scraperBanner && window.scraperBanner.isRunning()) return;

    btnScraper.disabled = true;
    setStatus(scraperStatus, '', false);
    scraperProgress.style.display = 'block';
    scraperBar.style.width = '0%';
    scraperProgressText.textContent = 'Iniciando coleta de vagas, aguarde...';
    scraperProgressText.className = 'status';

    const urlParam = searchUrl.value.trim();
    window.scraperBanner.start(urlParam || '');
  });

  fetch('/api/scraper/status')
    .then((r) => r.json())
    .then((status) => {
      if (status.running) {
        btnScraper.disabled = true;
        scraperProgress.style.display = 'block';
        scraperBar.style.width = '0%';
        scraperProgressText.textContent = 'Scraper em execução...';
        scraperProgressText.className = 'status';
      }
    })
    .catch(() => {});
})();
