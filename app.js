/* ==========================================================
   Visor interactivo — Catálogo de Pruebas Psicológicas
   Motor: PageFlip (StPageFlip) en modo HTML
   ========================================================== */
(function () {
  'use strict';

  var REFLOW_BREAKPOINT = 820;
  var book = document.getElementById('book');
  var bookWrap = document.getElementById('bookWrap');
  var stage = document.getElementById('stage');
  var pageFlip = null;
  var reflowMode = false;

  function currentModeIsReflow() {
    return window.innerWidth <= REFLOW_BREAKPOINT;
  }

  /* ==========================================================
     ARRANQUE — decide modo libro (PageFlip) o modo lectura
     (una sola columna, sin PageFlip) según el ancho de pantalla
     ========================================================== */
  function boot() {
    reflowMode = currentModeIsReflow();
    if (reflowMode) {
      document.body.classList.add('reflow-mode');
      document.documentElement.classList.add('reflow-mode');
      setupReflowNavigation();
    } else {
      document.body.classList.remove('reflow-mode');
      document.documentElement.classList.remove('reflow-mode');
      waitForReadyThenInit();
    }
    setupPhotoFallbacks();
    setTimeout(showHint, 700);
  }

  /* Si el usuario cambia de tamaño de ventana cruzando el punto de
     quiebre (por ejemplo, gira una tablet), recargamos para arrancar
     limpio en el modo correcto en vez de intentar migrar el estado
     de PageFlip en caliente. */
  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (currentModeIsReflow() !== reflowMode) {
        window.location.reload();
      } else {
        /* mismo modo, solo cambió el tamaño de ventana: la escala de la
           tipografía de la ficha se recalcula según el ancho de página que
           PageFlip haya terminado usando después de reacomodarse solo. */
        applyFichaScale();
      }
    }, 300);
  });

  /* ==========================================================
     MODO LIBRO (PageFlip)
     ========================================================== */
  function waitForReadyThenInit() {
    function ready() {
      requestAnimationFrame(function () {
        requestAnimationFrame(initFlip);
      });
    }
    var fontsReady = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
    if (document.readyState === 'complete') {
      fontsReady.then(ready).catch(ready);
    } else {
      window.addEventListener('load', function () {
        fontsReady.then(ready).catch(ready);
      });
    }
  }

  /* La librería calcula el alto de cada página en base a su propio
     ancho (relación 850:1100), usando un truco de padding-bottom en
     porcentaje que NO tiene forma de saber cuánto alto real hay
     disponible debajo de la barra superior. Su propio límite interno
     de seguridad (maxHeight) tampoco funciona bien en nuestro caso,
     porque compara contra una medida que a su vez depende del mismo
     cálculo por ancho, así que nunca detecta el problema. La forma
     confiable de evitar que la página salga más alta que la pantalla
     es limitar el ANCHO máximo de entrada para que, aplicando esa
     misma proporción 850:1100, el alto resultante quepa siempre. */
  function computeMaxWidth() {
    var topbarH = 64; /* debe coincidir con --topbar-h en el CSS */
    var stageBuffer = 60; /* padding-top del escenario + margen de seguridad */
    var availHeight = window.innerHeight - topbarH - stageBuffer;
    if (availHeight < 200) availHeight = 200;
    var maxW = Math.floor(availHeight * 850 / 1100);
    return Math.max(260, Math.min(maxW, 1300));
  }

  /* Todos los tamaños de letra y espaciados de la ficha (.side/.main y sus
     hijos) están escritos en el CSS como calc(Npx * var(--ficha-scale, 1)),
     usando como referencia una página de 850px de ancho (el tamaño con el
     que se diseñó originalmente la ficha). Como ahora el ancho real de cada
     página lo decide computeMaxWidth() según el alto disponible de pantalla,
     la página casi nunca mide exactamente 850px — puede ser más angosta.
     Esta función lee el ancho REAL que PageFlip terminó usando y actualiza
     --ficha-scale (proporción real/850) para que el texto y los espacios se
     achiquen o agranden en la misma proporción que la página, en vez de
     quedarse fijos en el tamaño pensado para 850px. Solo corre en modo
     libro (desktop); el modo móvil (reflow-mode) tiene sus propios tamaños
     fijos en el CSS que no usan esta variable, así que nunca se ve afectado
     por esto. */
  function applyFichaScale() {
    if (!pageFlip || typeof pageFlip.getBoundsRect !== 'function') return;
    try {
      var rect = pageFlip.getBoundsRect();
      var w = rect && rect.pageWidth;
      if (!w || w <= 0) return;
      var scale = w / 850;
      /* límites de seguridad para evitar texto absurdamente chico o grande
         si algo midiera mal. El piso NO puede ser más alto que el ancho
         mínimo real que computeMaxWidth() puede llegar a usar (260px,
         ver más arriba) — 260/850 ≈ 0.306. Antes el piso estaba en 0.55:
         en laptops con poca altura de pantalla (comunes en salas de
         cómputo escolares), computeMaxWidth() reduce el ancho de la
         página por debajo de ese piso para que la hoja completa quepa
         sin scroll, pero el texto no se achicaba a la par — quedaba más
         grande de lo que la página medía y la parte final del contenido
         se recortaba (las hojas no tienen scroll interno). */
      scale = Math.max(0.3, Math.min(scale, 1.15));
      document.documentElement.style.setProperty('--ficha-scale', scale.toFixed(4));
    } catch (err) {
      /* si algo falla, --ficha-scale se queda en 1 (valor por defecto en :root)
         y el diseño se ve exactamente como antes de este ajuste */
    }
  }

  function initFlip() {
    pageFlip = new St.PageFlip(book, {
      width: 850,
      height: 1100,
      size: 'stretch',
      minWidth: 260,
      maxWidth: computeMaxWidth(),
      minHeight: 340,
      maxHeight: 1680,
      maxShadowOpacity: 0.45,
      showCover: true,
      mobileScrollSupport: false,
      usePortrait: true,
      autoSize: true,
      flippingTime: 650,
      useMouseEvents: true,
      swipeDistance: 20,
      disableFlipByClick: true,
      showPageCorners: false
    });

    pageFlip.loadFromHTML(document.querySelectorAll('#book .pf-leaf'));

    pageFlip.on('flip', function (e) {
      updateIndicator(e.data);
      updateArrows();
      updateActiveDrawerItem(e.data);
    });

    pageFlip.on('changeOrientation', function () {
      updateIndicator(pageFlip.getCurrentPageIndex());
      applyFichaScale();
    });

    pageFlip.on('init', function () {
      applyFichaScale();
    });

    updateIndicator(0);
    updateArrows();
    applyFichaScale();

    /* Red de seguridad: si algún contenido se midió antes de que las
       fuentes terminaran de asentarse, forzamos un recálculo. */
    setTimeout(function () {
      if (pageFlip && typeof pageFlip.update === 'function') pageFlip.update();
      applyFichaScale();
    }, 350);
  }

  /* ---------------- Indicador de página / progreso ---------------- */
  var pageIndicatorEl = document.getElementById('pageIndicator');
  var progressFillEl = document.getElementById('progressFill');

  function updateIndicator(idx) {
    var current = idx + 1;
    var total = pageFlip ? pageFlip.getPageCount() : document.querySelectorAll('#book .pf-leaf').length;
    if (pageIndicatorEl) pageIndicatorEl.textContent = 'Página ' + current + ' de ' + total;
    if (progressFillEl) progressFillEl.style.width = Math.round((current / total) * 100) + '%';
  }

  /* ---------------- Flechas de navegación ---------------- */
  var prevBtn = document.getElementById('navPrev');
  var nextBtn = document.getElementById('navNext');

  function updateArrows() {
    if (!pageFlip) return;
    var idx = pageFlip.getCurrentPageIndex();
    var total = pageFlip.getPageCount();
    prevBtn.disabled = idx <= 0;
    nextBtn.disabled = idx >= total - 1;
  }

  prevBtn.addEventListener('click', function () { if (pageFlip) pageFlip.flipPrev(); });
  nextBtn.addEventListener('click', function () { if (pageFlip) pageFlip.flipNext(); });

  document.addEventListener('keydown', function (e) {
    if (introOverlay && introOverlay.classList.contains('open')) {
      if (e.key === 'Escape') closeIntro();
      return;
    }
    if (reflowMode) { if (e.key === 'Escape') closeDrawer(); return; }
    if (e.key === 'ArrowRight') { if (pageFlip) pageFlip.flipNext(); }
    else if (e.key === 'ArrowLeft') { if (pageFlip) pageFlip.flipPrev(); }
    else if (e.key === 'Escape') { closeDrawer(); }
  });

  /* ==========================================================
     INTRODUCCIÓN — vista independiente a todo el ancho
     ========================================================== */
  var introOverlay = document.getElementById('introOverlay');
  var introBackBtn = document.getElementById('introBack');

  function openIntro() {
    if (!introOverlay) return;
    introOverlay.classList.add('open');
    introOverlay.setAttribute('aria-hidden', 'false');
    introOverlay.scrollTop = 0;
    var scrollArea = introOverlay.querySelector('.intro-overlay-scroll');
    if (scrollArea) scrollArea.scrollTop = 0;
    drawerItems.forEach(function (item) {
      item.classList.toggle('active', item.hasAttribute('data-intro'));
    });
  }
  function closeIntro() {
    if (!introOverlay) return;
    introOverlay.classList.remove('open');
    introOverlay.setAttribute('aria-hidden', 'true');
    if (!reflowMode && pageFlip) {
      updateActiveDrawerItem(pageFlip.getCurrentPageIndex());
    }
  }
  if (introBackBtn) introBackBtn.addEventListener('click', closeIntro);

  /* ==========================================================
     ESQUINAS INFERIORES — único punto de partida válido para
     arrastrar y pasar hoja. Cualquier otro punto (sobre todo la
     parte superior de la página) queda inerte. Se intercepta el
     evento ANTES de que PageFlip lo reciba.
     ========================================================== */
  function isInBottomCorner(clientX, clientY) {
    var rect = book.getBoundingClientRect();
    var x = clientX - rect.left;
    var y = clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return false;
    var zoneW = rect.width * 0.22;
    var zoneH = rect.height * 0.32;
    var inBottom = y > rect.height - zoneH;
    var inSide = x < zoneW || x > rect.width - zoneW;
    return inBottom && inSide;
  }

  function onBookPointerStart(e) {
    if (reflowMode) return;
    var point = (e.touches && e.touches.length) ? e.touches[0] : e;
    if (zoomLevel > 1) {
      e.stopImmediatePropagation();
      pointerDown(point.clientX, point.clientY);
      return;
    }
    if (!isInBottomCorner(point.clientX, point.clientY)) {
      e.stopImmediatePropagation();
    }
  }
  /* Registrado ANTES de crear la instancia de PageFlip: en el mismo
     elemento y la misma fase, el orden de registro decide qué
     listener corre primero. */
  book.addEventListener('mousedown', onBookPointerStart);
  book.addEventListener('touchstart', onBookPointerStart, { passive: true });

  /* ==========================================================
     DRAWER (índice lateral izquierdo)
     ========================================================== */
  var drawer = document.getElementById('drawer');
  var drawerOverlay = document.getElementById('drawerOverlay');
  var menuBtn = document.getElementById('menuBtn');
  var drawerCloseBtn = document.getElementById('drawerClose');
  var drawerSearch = document.getElementById('drawerSearch');
  var drawerEmpty = document.getElementById('drawerEmpty');
  var drawerItems = Array.prototype.slice.call(document.querySelectorAll('.drawer-item'));

  function openDrawer() {
    drawer.classList.add('open');
    drawerOverlay.classList.add('open');
    /* Si quedó texto de una búsqueda anterior, la lista sigue filtrada
       (la mayoría de los botones ocultos) sin que se note a simple
       vista. Reiniciamos el buscador cada vez que se abre el menú para
       que todas las fichas estén siempre visibles y tocables. */
    if (drawerSearch.value) {
      drawerSearch.value = '';
      drawerItems.forEach(function (item) { item.style.display = ''; });
      if (drawerEmpty) drawerEmpty.style.display = 'none';
    }
    /* En móvil no enfocamos el buscador automáticamente: hacerlo abre
       el teclado virtual apenas se abre el menú, y con 70 fichas la
       mayoría de las personas primero quiere mirar la lista, no
       escribir. En escritorio sí se conserva porque ahí no hay teclado
       virtual que le robe espacio a la pantalla. */
    if (!reflowMode) {
      setTimeout(function () { drawerSearch.focus(); }, 150);
    }
  }
  function closeDrawer() {
    drawer.classList.remove('open');
    drawerOverlay.classList.remove('open');
  }
  menuBtn.addEventListener('click', function () {
    if (drawer.classList.contains('open')) closeDrawer(); else openDrawer();
  });
  drawerCloseBtn.addEventListener('click', closeDrawer);
  drawerOverlay.addEventListener('click', closeDrawer);

  drawerItems.forEach(function (item) {
    item.addEventListener('click', function (e) {
      e.preventDefault();
      if (item.hasAttribute('data-intro')) {
        openIntro();
        closeDrawer();
        return;
      }
      /* Si veníamos de la introducción (que es una vista aparte, tapando
         todo), hay que cerrarla primero: si no, la ficha de destino
         cambia por debajo pero sigue sin verse porque la introducción
         se queda encima cubriendo la pantalla. */
      closeIntro();
      var leafIndex = parseInt(item.getAttribute('data-leaf'), 10);
      if (reflowMode) {
        var target = document.querySelector('.pf-leaf[data-leaf-index="' + leafIndex + '"]');
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        updateActiveDrawerItem(leafIndex);
      } else if (pageFlip) {
        pageFlip.turnToPage(leafIndex);
        updateIndicator(leafIndex);
        updateArrows();
        updateActiveDrawerItem(leafIndex);
      }
      closeDrawer();
    });
  });

  function updateActiveDrawerItem(leafIndex) {
    drawerItems.forEach(function (item) {
      var idx = parseInt(item.getAttribute('data-leaf'), 10);
      item.classList.toggle('active', idx === leafIndex);
    });
    var activeItem = document.querySelector('.drawer-item.active');
    if (activeItem && drawer.classList.contains('open')) {
      activeItem.scrollIntoView({ block: 'nearest' });
    }
  }

  function normalize(str) {
    return str.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  drawerSearch.addEventListener('input', function () {
    var q = normalize(drawerSearch.value.trim());
    var visibleCount = 0;
    drawerItems.forEach(function (item) {
      var haystack = normalize(item.getAttribute('data-search') || '');
      var match = haystack.indexOf(q) !== -1;
      item.style.display = match ? '' : 'none';
      if (match) visibleCount++;
    });
    drawerEmpty.style.display = visibleCount === 0 ? 'block' : 'none';
  });

  /* ==========================================================
     REFLOW: navegación en modo lectura de una columna
     ========================================================== */
  function setupReflowNavigation() {
    var leaves = document.querySelectorAll('#book .pf-leaf');
    leaves.forEach(function (leaf, i) {
      leaf.setAttribute('data-leaf-index', i);
    });

    /* En modo lectura móvil no hay evento de "cambio de página" como en
       el libro, así que el ítem activo del menú lateral se actualiza
       mirando qué ficha ocupa la franja central de la pantalla mientras
       el usuario hace scroll. */
    if ('IntersectionObserver' in window) {
      var observer = new IntersectionObserver(function (entries) {
        var best = null;
        entries.forEach(function (entry) {
          if (entry.isIntersecting && (!best || entry.intersectionRatio > best.intersectionRatio)) {
            best = entry;
          }
        });
        if (best) {
          var idx = parseInt(best.target.getAttribute('data-leaf-index'), 10);
          updateActiveDrawerItem(idx);
        }
      }, {
        root: null,
        rootMargin: '-35% 0px -35% 0px',
        threshold: [0, 0.1, 0.25, 0.5, 0.75, 1]
      });
      leaves.forEach(function (leaf) { observer.observe(leaf); });
    }
  }

  /* ==========================================================
     ZOOM Y PANEO (solo modo libro)
     ========================================================== */
  var zoomLevel = 1;
  var MIN_ZOOM = 1;
  var MAX_ZOOM = 2.5;
  var ZOOM_STEP = 0.25;
  var panX = 0, panY = 0;
  var zoomLevelEl = document.getElementById('zoomLevel');
  var zoomInBtn = document.getElementById('zoomIn');
  var zoomOutBtn = document.getElementById('zoomOut');

  /* "transform: scale()" agranda el libro estirando una captura ya
     renderizada (una especie de imagen), por eso el texto se ve nítido
     mientras se anima (el ojo no alcanza a notar el estirado) pero
     borroso en cuanto la animación se detiene y el ojo lo mira fijo. La
     propiedad CSS "zoom" en cambio vuelve a calcular el tamaño real y
     a dibujar el texto de nuevo a la resolución final, por eso queda
     nítido en cualquier nivel de acercamiento. La usamos para el
     agrandado, y dejamos aparte "transform: translate()" solo para el
     arrastre (paneo), que no tiene este problema. Si el navegador fuera
     muy viejo y no soportara "zoom", volvemos al método anterior. */
  var ZOOM_SUPPORTED = (function () {
    try { return 'zoom' in document.documentElement.style; } catch (err) { return false; }
  })();

  function applyTransform() {
    if (ZOOM_SUPPORTED) {
      bookWrap.style.zoom = zoomLevel;
      bookWrap.style.transform = 'translate(' + panX + 'px,' + panY + 'px)';
    } else {
      bookWrap.style.transform = 'translate(' + panX + 'px,' + panY + 'px) scale(' + zoomLevel + ')';
    }
    bookWrap.classList.toggle('zoomed', zoomLevel > 1);
    if (zoomLevelEl) zoomLevelEl.textContent = Math.round(zoomLevel * 100) + '%';
    if (zoomOutBtn) zoomOutBtn.disabled = zoomLevel <= MIN_ZOOM;
    if (zoomInBtn) zoomInBtn.disabled = zoomLevel >= MAX_ZOOM;
  }

  function clampPan() {
    var maxPan = (zoomLevel - 1) * 600;
    panX = Math.max(-maxPan, Math.min(maxPan, panX));
    panY = Math.max(-maxPan, Math.min(maxPan, panY));
  }

  function setZoom(next) {
    zoomLevel = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, next));
    if (zoomLevel === 1) { panX = 0; panY = 0; }
    clampPan();
    applyTransform();
  }

  if (!reflowMode) {
    if (zoomInBtn) zoomInBtn.addEventListener('click', function () { setZoom(zoomLevel + ZOOM_STEP); });
    if (zoomOutBtn) zoomOutBtn.addEventListener('click', function () { setZoom(zoomLevel - ZOOM_STEP); });

    stage.addEventListener('dblclick', function () {
      setZoom(zoomLevel > 1 ? 1 : 1.75);
    });

    /* La ruedita del mouse pasa de ficha (adelante al bajar, atrás al
       subir), no hace zoom — el zoom queda solo para los botones +/-.
       Si el cursor está sobre una columna que todavía tiene texto para
       leer en esa dirección, dejamos que el navegador haga scroll normal
       ahí primero; recién cuando esa columna llega a su límite (arriba
       o abajo, según hacia dónde se mueve la rueda) la rueda pasa a
       controlar el libro. */
    var lastWheelFlip = 0;
    var WHEEL_FLIP_COOLDOWN = 550; /* similar al tiempo de la animación de pasar hoja, para que un solo gesto de scroll no salte varias fichas de golpe */

    stage.addEventListener('wheel', function (e) {
      var scrollable = e.target.closest('.side, .main');
      if (scrollable && scrollable.scrollHeight > scrollable.clientHeight + 1) {
        var atTop = scrollable.scrollTop <= 0;
        var atBottom = scrollable.scrollTop + scrollable.clientHeight >= scrollable.scrollHeight - 1;
        if ((e.deltaY < 0 && !atTop) || (e.deltaY > 0 && !atBottom)) {
          return; /* todavía hay texto para leer en esa dirección: scroll normal */
        }
      }
      e.preventDefault();
      if (!pageFlip) return;
      var now = Date.now();
      if (now - lastWheelFlip < WHEEL_FLIP_COOLDOWN) return;
      lastWheelFlip = now;
      if (e.deltaY > 0) pageFlip.flipNext();
      else if (e.deltaY < 0) pageFlip.flipPrev();
    }, { passive: false });
  }

  var isPanning = false;
  var startX = 0, startY = 0, startPanX = 0, startPanY = 0;

  function pointerDown(x, y) {
    if (zoomLevel <= 1) return;
    isPanning = true;
    startX = x; startY = y;
    startPanX = panX; startPanY = panY;
    bookWrap.classList.add('panning');
  }
  function pointerMove(x, y) {
    if (!isPanning) return;
    panX = startPanX + (x - startX);
    panY = startPanY + (y - startY);
    clampPan();
    applyTransform();
  }
  function pointerUp() {
    isPanning = false;
    bookWrap.classList.remove('panning');
  }

  if (!reflowMode) {
    stage.addEventListener('mousedown', function (e) {
      if (book.contains(e.target)) return; /* ya lo maneja onBookPointerStart */
      pointerDown(e.clientX, e.clientY);
    });
    window.addEventListener('mousemove', function (e) { pointerMove(e.clientX, e.clientY); });
    window.addEventListener('mouseup', pointerUp);

    stage.addEventListener('touchstart', function (e) {
      if (book.contains(e.target)) return;
      if (e.touches.length === 1) pointerDown(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    stage.addEventListener('touchmove', function (e) {
      if (e.touches.length === 1) pointerMove(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    stage.addEventListener('touchend', pointerUp);

    var pinchStartDist = null;
    var pinchStartZoom = 1;
    function touchDist(touches) {
      var dx = touches[0].clientX - touches[1].clientX;
      var dy = touches[0].clientY - touches[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }
    stage.addEventListener('touchstart', function (e) {
      if (e.touches.length === 2) {
        pinchStartDist = touchDist(e.touches);
        pinchStartZoom = zoomLevel;
      }
    }, { passive: true });
    stage.addEventListener('touchmove', function (e) {
      if (e.touches.length === 2 && pinchStartDist) {
        var d = touchDist(e.touches);
        setZoom(pinchStartZoom * (d / pinchStartDist));
      }
    }, { passive: true });
    stage.addEventListener('touchend', function (e) {
      if (e.touches.length < 2) pinchStartDist = null;
    });
  }

  /* ==========================================================
     FOTOGRAFÍAS — usa la imagen si existe, si no deja el ícono
     de referencia. Sin parpadeo de imagen rota.
     ========================================================== */
  function setupPhotoFallbacks() {
    document.querySelectorAll('.photo-img').forEach(function (img) {
      function showPhoto() {
        img.style.display = 'block';
        img.parentElement.classList.add('has-photo');
        var fb = img.nextElementSibling;
        if (fb) fb.style.display = 'none';
      }
      function hidePhoto() {
        img.style.display = 'none';
      }
      img.addEventListener('load', showPhoto);
      img.addEventListener('error', hidePhoto);
      /* Con archivos locales, la imagen suele terminar de cargar ANTES
         de que este código llegue a ejecutarse (carga casi instantánea,
         sin espera de red) — en ese caso el evento "load" ya pasó y
         nunca se vuelve a disparar, así que el navegador se queda
         esperando para siempre un evento que no va a llegar. Por eso
         revisamos "img.complete": si la imagen ya terminó (con éxito o
         con error) antes de llegar acá, resolvemos a mano en vez de
         esperar el evento. */
      if (img.complete) {
        if (img.naturalWidth > 0) {
          showPhoto();
        } else if (img.getAttribute('src')) {
          hidePhoto();
        }
      }
    });
  }

  /* ==========================================================
     PRIMERA VISITA — pista de uso
     ========================================================== */
  function showHint() {
    var toast = document.getElementById('hintToast');
    if (!toast || reflowMode) return;
    toast.classList.add('show');
    setTimeout(function () { toast.classList.remove('show'); }, 4200);
  }

  /* ---------------- Arranque ---------------- */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
