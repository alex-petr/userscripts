// ==UserScript==
// @name         YouTube Music: трек і виконавець у заголовку вкладки
// @namespace    https://github.com/alex-petr/userscripts
// @version      1.0.0
// @description  Тримає в заголовці вкладки «Виконавець • Альбом (рік) • Трек» на будь-якій сторінці — рідний титул показує хіба назву треку без виконавця, і то лише під час відтворення.
// @author       Oleksandr Petrov
// @match        https://music.youtube.com/*
// @run-at       document-idle
// @grant        none
// @homepageURL  https://github.com/alex-petr/userscripts
// @downloadURL  https://raw.githubusercontent.com/alex-petr/userscripts/main/ytmusic-nowplaying-title/ytmusic-nowplaying-title.user.js
// @updateURL    https://raw.githubusercontent.com/alex-petr/userscripts/main/ytmusic-nowplaying-title/ytmusic-nowplaying-title.user.js
// ==/UserScript==

(function () {
  "use strict";

  const VERSION = "1.0.0";
  const TAG = "[ytm-title]";

  // Формат титулу: 1 — «Виконавець • Альбом (рік) • Трек»,
  // 2 — «Виконавець | Альбом | Трек», 3 — «Виконавець — Трек»,
  // 4 — «Трек • Виконавець» (так робить Spotify, виміряно 01.10.2026).
  // 0 — карусель для вибору: формати чергуються що 8 с.
  // Відсутні частини випадають разом зі своїм роздільником.
  const FORMAT = 1;

  // Трек і виконавця найнадійніше віддає mediaSession.metadata — YTM
  // заповнює її для системного медіа-оверлея. Читається лише завдяки
  // @grant none: скрипт живе в контексті сторінки, а в ізольованому світі
  // content-script'а metadata сайту не видно. Альбом і рік metadata НЕ
  // віддає (album — порожній рядок, виміряно), тож їх добираємо з byline
  // плеєр-бара: «Виконавець • Альбом • Рік».
  function bylineInfo() {
    const bar = document.querySelector("ytmusic-player-bar");
    const byline = bar && bar.querySelector(".byline");
    if (!byline) return {};

    const anchors = Array.from(byline.querySelectorAll("a"));
    // Альбом упізнаємо за href (/browse/MPREb…), а не за позицією:
    // у кліпів замість альбому в byline лічильники переглядів.
    const albumLink = anchors.find(function (a) { return a.href.indexOf("/browse/MPREb") !== -1; });
    // Рік — останній сегмент byline; шукати \d{4} по всьому тексту не можна,
    // бо альбом може називатись «1984».
    const tail = byline.textContent.split("•").pop().trim();
    const titleNode = bar.querySelector(".title");
    return {
      track: titleNode ? titleNode.textContent.trim() : "",
      artist: anchors[0] ? anchors[0].textContent.trim() : "",
      album: albumLink ? albumLink.textContent.trim() : "",
      year: /^(19|20)\d{2}$/.test(tail) ? tail : "",
    };
  }

  // Коли в плеєрі порожньо, титул складаємо з шапки сторінки альбому чи
  // плейлиста — рідний титул там гола назва без виконавця. Виконавець
  // живе у strapline (альбоми) або у facepile (автозбірки на кшталт
  // «Найпопулярніші пісні», де замість strapline — аватарки виконавця).
  function pageInfo() {
    const header = document.querySelector("ytmusic-responsive-header-renderer");
    if (!header) return null;
    const titleNode = header.querySelector("yt-formatted-string.title");
    const album = titleNode ? titleNode.textContent.trim() : "";
    const strap = header.querySelector(".strapline-text");
    const face = header.querySelector("[class*='facepile']");
    const artist =
      (strap && strap.textContent.trim()) || (face && face.textContent.trim()) || "";
    const sub = header.querySelector("yt-formatted-string.subtitle");
    const tail = sub ? sub.textContent.split("•").pop().trim() : "";
    return {
      artist: artist,
      album: album,
      year: /^(19|20)\d{2}$/.test(tail) ? tail : "",
    };
  }

  function desiredTitle() {
    const meta = navigator.mediaSession && navigator.mediaSession.metadata;
    const dom = bylineInfo();
    const track = (meta && meta.title) || dom.track;
    let artist;
    if (track) {
      artist = (meta && meta.artist) || dom.artist;
    } else {
      // У плеєрі порожньо — пробуємо шапку сторінки. Без виконавця нам
      // нема чого додати до рідного титулу, а на сторінках без шапки
      // (головна, пошук) сайт хай називає себе сам.
      const page = pageInfo();
      if (!page || !page.artist || !page.album) return null;
      dom.album = page.album;
      dom.year = page.year;
      artist = page.artist;
    }
    // Слот каруселі рахується від годинника, а не власним таймером:
    // штатний інтервал (1,5 с) сам підхопить зміну слота, і навіть якщо
    // фонова вкладка задушить таймери, слот не «з'їде», лише оновиться рідше.
    const format = FORMAT === 0 ? Math.floor(Date.now() / 8000) % 4 + 1 : FORMAT;
    switch (format) {
      case 2:
        return [artist, dom.album, track].filter(Boolean).join(" | ");
      case 3:
        // Без треку (титул із шапки сторінки) місце треку займає альбом.
        return [artist, track || dom.album].filter(Boolean).join(" — ");
      case 4:
        return [track || dom.album, artist].filter(Boolean).join(" • ");
      default:
        return [
          artist,
          dom.album && (dom.year ? dom.album + " (" + dom.year + ")" : dom.album),
          track,
        ].filter(Boolean).join(" • ");
    }
  }

  let lastLogged = "";
  function assertTitle() {
    const want = desiredTitle();
    if (!want || document.title === want) return;
    document.title = want;
    if (want !== lastLogged) {
      console.log(TAG, "v" + VERSION, want);
      lastLogged = want;
    }
  }

  // Сайт переписує титул на кожному SPA-переході й на старті відтворення
  // (виміряно: «YouTube Music», «<назва альбому>», «<трек> | YouTube Music») —
  // спостерігач на <title> повертає наш варіант одразу після перезапису.
  // Він же працює у фоновій вкладці, де таймери задушені тротлінгом.
  // Наш власний запис observer теж бачить, але цикл не виникає:
  // document.title === want → вихід без запису.
  const observer = new MutationObserver(assertTitle);
  let observed = null;
  function hookTitle() {
    const el = document.querySelector("head > title");
    if (el && el !== observed) {
      observer.disconnect();
      observer.observe(el, { childList: true, characterData: true, subtree: true });
      observed = el;
    }
  }

  // Інтервал — страховка на випадки без перезапису титулу (metadata доїжджає
  // пізніше за DOM) і на перемонтований SPA-ю <title>, до якого треба
  // перечепити спостерігач.
  setInterval(function () {
    hookTitle();
    assertTitle();
  }, 1500);
  hookTitle();
  assertTitle();
})();
