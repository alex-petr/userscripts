// ==UserScript==
// @name         LostFilm: автовибір найкращої роздачі
// @namespace    https://github.com/alex-petr/userscripts
// @version      1.0.0
// @description  На сторінці вибору роздачі сам обирає найвищу якість (1080p → 720p → перше-ліпше), переходить за посиланням і закриває вкладку, якщо її відкрив сайт.
// @author       Oleksandr Petrov
// @match        https://*.lostfilm.tv/V/*
// @match        https://*.lostfilm.tv/v_search.php*
// @match        https://*.insearch.site/*
// @match        https://*.retre.org/*
// @run-at       document-idle
// @grant        none
// @homepageURL  https://github.com/alex-petr/userscripts
// @downloadURL  https://raw.githubusercontent.com/alex-petr/userscripts/main/lostfilm-torrent-autopick/lostfilm-torrent-autopick.user.js
// @updateURL    https://raw.githubusercontent.com/alex-petr/userscripts/main/lostfilm-torrent-autopick/lostfilm-torrent-autopick.user.js
// ==/UserScript==

(function () {
  'use strict';

  var TAG = '[lf-autopick]';

  // Селектор списку роздач: перевірено на живій сторінці lostfilm.tv/V/
  // у серпні 2026 — розмітка та сама, що й у 2020 (inner-box--*).
  var LINKS_SELECTOR = '.inner-box--list .inner-box--item .inner-box--link.main a';

  // Список може домальовуватись після document-idle, тому не читаємо DOM
  // одразу, а опитуємо його з таймаутом. Якщо за 10 с список не з'явився —
  // це не сторінка вибору роздачі (напр., лендінг insearch.site),
  // тихо виходимо й нічого не чіпаємо.
  var POLL_INTERVAL_MS = 250;
  var POLL_TIMEOUT_MS = 10000;

  // Закриваємось не одразу: перехід на td.php віддає .torrent-файл як
  // download, сторінка при цьому не вивантажується, але браузеру треба
  // час, щоб закомітити завантаження. 3 с — із запасом проти гонки.
  var CLOSE_DELAY_MS = 3000;

  // Якість = число перед "p" у тексті посилання ("1080p WEB-DLRip").
  // Саме з суфіксом "p": у тексті є й номери сезону/серії, які без
  // суфікса зматчились би першими. SD-роздача числа не має → score 0.
  function qualityScore(text) {
    var m = /(\d{3,4})p\b/i.exec(text);
    return m ? parseInt(m[1], 10) : 0;
  }

  function pickBest(anchors) {
    var best = null;
    var bestScore = -1;
    anchors.forEach(function (a) {
      var score = qualityScore(a.textContent);
      // Строга нерівність: за однакової якості лишається перша роздача,
      // як і в старому скрипті.
      if (score > bestScore) {
        best = a;
        bestScore = score;
      }
    });
    return { anchor: best, score: bestScore };
  }

  function run(anchors) {
    var picked = pickBest(anchors);
    if (!picked.anchor || !/^https?:/.test(picked.anchor.href)) {
      console.warn(TAG, 'посилання знайдені, але жодне не схоже на роздачу — нічого не робимо');
      return;
    }

    if (picked.score > 0) {
      console.log(TAG, 'обрано ' + picked.score + 'p:', picked.anchor.textContent.trim());
    } else {
      console.warn(TAG, 'роздачі з якістю не знайдено, беремо першу:', picked.anchor.textContent.trim());
    }

    location.assign(picked.anchor.href);

    // window.close() спрацює лише для вкладки, відкритої скриптом сайту
    // (PlayEpisode → window.open) — тоді window.opener не порожній.
    // В інших випадках браузер закриття заборонить, тому й не пробуємо.
    if (window.opener) {
      setTimeout(function () { window.close(); }, CLOSE_DELAY_MS);
    } else {
      console.log(TAG, 'вкладку відкрито не скриптом — не закриваємо');
    }
  }

  var waited = 0;
  var timer = setInterval(function () {
    var anchors = Array.prototype.slice.call(document.querySelectorAll(LINKS_SELECTOR));
    if (anchors.length > 0) {
      clearInterval(timer);
      run(anchors);
      return;
    }
    waited += POLL_INTERVAL_MS;
    if (waited >= POLL_TIMEOUT_MS) {
      clearInterval(timer);
      console.log(TAG, 'список роздач не з\'явився за ' + POLL_TIMEOUT_MS / 1000 + ' с — схоже, це інша сторінка, виходимо');
    }
  }, POLL_INTERVAL_MS);
})();
