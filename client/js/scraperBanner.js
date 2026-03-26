/**
 * Banner global de progresso do scraper.
 * Funciona em qualquer página — verifica o status do scraper ao carregar
 * e conecta ao stream de eventos se estiver rodando.
 */
(function () {
  var isIndexPage =
    window.location.pathname === '/' || window.location.pathname === '/index.html';

  var banner = document.createElement('div');
  banner.id = 'scraperBanner';
  banner.className = 'scraper-banner';
  banner.style.display = 'none';
  banner.innerHTML =
    '<div class="scraper-banner-content">' +
    '<div class="scraper-banner-bar-wrap">' +
    '<div class="scraper-banner-bar" id="scraperBannerBar"></div>' +
    '</div>' +
    '<span id="scraperBannerText" class="scraper-banner-text">Scraper em execução...</span>' +
    '</div>';
  document.body.prepend(banner);

  var bannerBar = document.getElementById('scraperBannerBar');
  var bannerText = document.getElementById('scraperBannerText');
  var evtSource = null;
  var _running = false;

  function showBanner() {
    if (isIndexPage) return;
    banner.style.display = 'block';
    banner.classList.remove('scraper-banner-done', 'scraper-banner-error');
    document.body.classList.add('has-scraper-banner');
  }

  function hideBanner() {
    setTimeout(function () {
      banner.style.display = 'none';
      document.body.classList.remove('has-scraper-banner');
    }, 6000);
  }

  function closeSource() {
    if (evtSource) {
      evtSource.close();
      evtSource = null;
    }
  }

  function handleEvent(data) {
    showBanner();

    if (data.type === 'status') {
      bannerText.textContent = data.message;
    }
    if (data.type === 'login') {
      bannerBar.classList.add('login-wait');
      bannerText.textContent = data.message;
    }
    if (data.type === 'page') {
      bannerBar.classList.remove('login-wait');
      var pct = Math.round((data.page / data.totalPages) * 100);
      bannerBar.style.width = pct + '%';
      bannerText.textContent =
        'Coletando página ' + data.page + '/' + data.totalPages + ' (' + data.collected + ' vagas)';
    }
    if (data.type === 'progress') {
      var pct2 = Math.round((data.page / 10) * 100);
      bannerBar.style.width = pct2 + '%';
      bannerText.textContent =
        'Página ' + data.page + ': +' + data.added + ' vagas (total: ' + data.collected + ')';
    }
    if (data.type === 'done') {
      bannerBar.style.width = '100%';
      bannerText.textContent = 'Concluído! ' + data.collected + ' novas vagas coletadas.';
      banner.classList.add('scraper-banner-done');
      _running = false;
      closeSource();
      hideBanner();
    }
    if (data.type === 'error') {
      bannerText.textContent = 'Erro: ' + data.error;
      banner.classList.add('scraper-banner-error');
      _running = false;
      closeSource();
      hideBanner();
    }

    window.dispatchEvent(new CustomEvent('scraper-event', { detail: data }));
  }

  function connectToEvents() {
    if (evtSource) return;
    evtSource = new EventSource('/api/scraper/events');
    evtSource.onmessage = function (event) {
      handleEvent(JSON.parse(event.data));
    };
    evtSource.onerror = function () {
      closeSource();
    };
  }

  function startScraper(searchUrl, maxPages) {
    if (_running) return;
    _running = true;

    showBanner();
    bannerBar.style.width = '0%';
    bannerBar.classList.remove('login-wait');
    bannerText.textContent = 'Iniciando coleta de vagas...';

    var params = [];
    if (searchUrl) params.push('searchUrl=' + encodeURIComponent(searchUrl));
    if (maxPages) params.push('maxPages=' + encodeURIComponent(maxPages));
    var url = '/api/scraper/run-stream' + (params.length ? '?' + params.join('&') : '');
    closeSource();
    evtSource = new EventSource(url);
    evtSource.onmessage = function (event) {
      handleEvent(JSON.parse(event.data));
    };
    evtSource.onerror = function () {
      closeSource();
      fetch('/api/scraper/status')
        .then(function (r) { return r.json(); })
        .then(function (status) {
          if (status.running) connectToEvents();
        })
        .catch(function () {});
    };
  }

  fetch('/api/scraper/status')
    .then(function (r) { return r.json(); })
    .then(function (status) {
      if (status.running) {
        _running = true;
        connectToEvents();
      }
    })
    .catch(function () {});

  window.scraperBanner = {
    start: startScraper,
    isRunning: function () { return _running; },
  };
})();
