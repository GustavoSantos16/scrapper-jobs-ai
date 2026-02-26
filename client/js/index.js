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

  btnScraper.addEventListener('click', async () => {
    btnScraper.disabled = true;
    setStatus(scraperStatus, 'Abrindo navegador e coletando vagas. Faça login no LinkedIn se necessário...', false);
    try {
      const res = await fetch('/api/scraper/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ searchUrl: searchUrl.value.trim() || undefined })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro no scraper');
      setStatus(
        scraperStatus,
        'Coletadas ' + data.collected + ' vagas. Total no sistema: ' + data.total,
        false
      );
    } catch (err) {
      setStatus(scraperStatus, err.message || 'Erro ao buscar vagas.', true);
    }
    btnScraper.disabled = false;
  });
})();
