// ==UserScript==
// @name         Trello Card Extras — таблиці, номер картки, пріоритет
// @namespace    https://github.com/alex-petr/userscripts
// @version      1.7.0
// @author       Oleksandr Petrov
// @description  Markdown-таблиці й чеклісти в описі, номер картки біля назви та на плитках дошки, пріоритет !N із підписом і бейдж Scrum Points
// @match        https://trello.com/*
// @run-at       document-idle
// @grant        none
// @homepageURL  https://github.com/alex-petr/userscripts
// @downloadURL  https://raw.githubusercontent.com/alex-petr/userscripts/main/trello-card-extras/trello-card-extras.user.js
// @updateURL    https://raw.githubusercontent.com/alex-petr/userscripts/main/trello-card-extras/trello-card-extras.user.js
// ==/UserScript==

(() => {
  "use strict";

  // Кольори — ті самі, що в Strelloids, щоб полоска у відкритій картці
  // збігалася зі списком і око не перемикалося між двома шкалами.
  const PRIORITY = {
    1: { color: "#d91d1d", label: "Critical" },
    2: { color: "#fe9900", label: "High" },
    3: { color: "#f3ee07", label: "Medium" },
    4: { color: "#42ef38", label: "Low" },
    5: { color: "#50bafb", label: "Lowest" }
  };

  const MARK = "data-tce"; // мітка обробленого вузла — захист від повторного проходу

  // ── Пошук вузлів ────────────────────────────────────────────────────────
  // Trello регулярно перейменовує класи, тож кожен селектор — список
  // кандидатів від найновішого до найстарішого. Перший, що знайшовся, і йде.
  const pick = (...selectors) => {
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      if (node) return node;
    }
    return null;
  };

  const cardBackTitle = () => pick(
    '[data-testid="card-back-title-input"]',
    '[data-testid="card-back-name"]',
    ".js-card-detail-title-assist",
    ".window-title h2"
  );

  const cardBackDescription = () => pick(
    '[data-testid="description-content-area"] .ak-renderer-document',
    '[data-testid="description-content-area"]',
    ".ak-renderer-document",
    '[data-testid="card-back-description"]',
    ".js-desc-content"
  );

  // Trello перейменовує testid'и частіше, ніж хотілося б, тож коли жоден
  // селектор не збігся — шукаємо за ВМІСТОМ: беремо діалог картки й
  // віддаємо його цілком. Зайвого не зачепимо: обидва рендери працюють
  // лише з вузлами, що справді схожі на таблицю або пункт чекліста.
  const cardBackDialog = () => pick(
    '[data-testid="card-back-dialog"]',
    '[role="dialog"]',
    ".card-detail-window",
    ".window-overlay"
  );

  const descriptionRoot = () => cardBackDescription() || cardBackDialog();

  // ── 1. Номер картки ─────────────────────────────────────────────────────
  // Береться з URL (/c/<shortLink>/<НОМЕР>-<slug>), а не з DOM Trello —
  // тому не залежить від того, чи встиг відмалюватись інший розширювач.
  const numberCache = new Map();

  const cardNumber = () => {
    const fromUrl = location.pathname.match(/^\/c\/[^/]+\/(\d+)/);
    if (fromUrl) return fromUrl[1];

    // Відкриття картки з дошки лишає короткий URL без номера. Питаємо
    // Trello тією ж сесією, що й сама сторінка; відповідь кешуємо, щоб
    // не смикати API на кожен прохід рендера.
    const short = location.pathname.match(/^\/c\/([^/?#]+)/);
    if (!short) return null;
    const key = short[1];
    if (numberCache.has(key)) return numberCache.get(key);

    numberCache.set(key, null);
    fetch(`/1/cards/${key}?fields=idShort`, { credentials: "include" })
      .then((response) => (response.ok ? response.json() : null))
      .then((card) => {
        if (!card || !card.idShort) return;
        numberCache.set(key, String(card.idShort));
        apply();
      })
      .catch(() => {});

    return null;
  };

  // Номер біля назви у відкритій картці. Вставляємо ПЕРЕД полем назви,
  // окремим рядком: назва — це <textarea>, і покласти щось усередину неї
  // не можна.
  const renderNumber = (titleNode, number) => {
    const host = titleNode.parentElement;
    if (!host || host.querySelector(`[${MARK}="number"]`)) return;

    const tag = document.createElement("div");
    tag.setAttribute(MARK, "number");
    tag.textContent = `#${number}`;
    tag.style.cssText = [
      "font-size:12px", "line-height:16px", "font-weight:700",
      "letter-spacing:.02em", "color:rgba(9,30,66,.45)", "margin-bottom:2px"
    ].join(";");

    host.insertBefore(tag, titleNode);
  };

  // ── 2. Пріоритет !N і Scrum Points (N) ──────────────────────────────────
  const parseTitle = (text) => ({
    priority: (text.match(/!([1-5])\b/) || [])[1],
    points: (text.match(/\((\d+(?:[.,]\d+)?)\)/) || [])[1]
  });

  const renderBadges = (titleNode, { priority, points }) => {
    const host = titleNode.parentElement;
    if (!host || host.querySelector(`[${MARK}="badges"]`)) return;
    if (!priority && !points) return;

    const box = document.createElement("div");
    box.setAttribute(MARK, "badges");
    box.style.cssText = "display:flex;align-items:center;gap:8px;margin:2px 0 6px";

    if (priority) {
      const { color, label } = PRIORITY[priority];
      const chip = document.createElement("span");
      chip.title = `Пріоритет !${priority}`;
      chip.style.cssText = "display:inline-flex;align-items:center;gap:6px";

      const stripe = document.createElement("span");
      stripe.style.cssText = [
        "display:inline-block", "width:46px", "height:8px",
        "border-radius:4px", `background:${color}`
      ].join(";");

      const name = document.createElement("span");
      name.textContent = label;
      name.style.cssText = [
        "font-size:12px", "line-height:18px", "font-weight:600",
        "letter-spacing:.02em", `color:${color}`,
        // жовтий і салатовий на білому тлі нечитабельні — їм даємо контур
        priority === 3 || priority === 4 ? "text-shadow:0 0 1px rgba(9,30,66,.55)" : ""
      ].filter(Boolean).join(";");

      chip.append(stripe, name);
      box.appendChild(chip);
    }

    if (points) {
      const pill = document.createElement("span");
      pill.title = "Story points";
      pill.textContent = `⏱ ${points}`;
      pill.style.cssText = [
        "display:inline-block", "padding:0 8px", "border-radius:10px",
        "font-size:12px", "line-height:18px", "font-weight:600",
        "background:rgba(9,30,66,.08)", "color:#44546f"
      ].join(";");
      box.appendChild(pill);
    }

    host.insertBefore(box, titleNode);
  };

  // ── 2b. Ті самі позначки в постійній панелі картки ─────────────────────
  // Липкий заголовок Trello показує назву лише при скролі, тож позначки в
  // ньому половину часу невидимі. Кладемо їх у верхню панель — рядок із
  // кнопкою списку («🚧 In Progress») і «Start timer»: він на місці завжди.
  //
  // Класи Trello хешовані й змінюються з кожним деплоєм, тож ціль шукаємо
  // структурно: єдиний <header> картки (не липкий) → рядок його кнопки.
  const renderToolbarBadges = ({ number, priority, points }) => {
    if (!number && !priority && !points) return;

    const header = [...document.querySelectorAll("header")].find(
      (node) => !node.closest('[data-testid="card-back-sticky-header"]') && node.querySelector("button")
    );
    const row = header?.querySelector("button")?.closest("div");
    if (!row || row.querySelector(`[${MARK}="toolbar"]`)) return;

    const box = document.createElement("span");
    box.setAttribute(MARK, "toolbar");
    box.style.cssText = "display:inline-flex;align-items:center;gap:6px;flex:none";

    if (number) {
      const tag = document.createElement("span");
      tag.textContent = `#${number}`;
      tag.style.cssText = "font-size:12px;font-weight:700;color:rgba(9,30,66,.5)";
      box.appendChild(tag);
    }

    if (priority) {
      const { color, label } = PRIORITY[priority];
      const chip = document.createElement("span");
      chip.title = `Пріоритет !${priority}`;
      chip.textContent = label;
      chip.style.cssText = [
        "font-size:11px", "line-height:18px", "font-weight:700",
        "padding:0 7px", "border-radius:9px", `background:${color}`,
        // на жовтому й салатовому білий текст не читається
        `color:${priority === 3 || priority === 4 ? "#172b4d" : "#fff"}`
      ].join(";");
      box.appendChild(chip);
    }

    if (points) {
      const pill = document.createElement("span");
      pill.title = "Story points";
      pill.textContent = `⏱ ${points}`;
      pill.style.cssText = [
        "font-size:11px", "line-height:18px", "font-weight:600",
        "padding:0 7px", "border-radius:9px",
        "background:rgba(9,30,66,.08)", "color:#44546f"
      ].join(";");
      box.appendChild(pill);
    }

    row.appendChild(box);
  };

  // ── 3. Markdown-таблиці ─────────────────────────────────────────────────
  const isRow = (line) => /^\s*\|.*\|\s*$/.test(line);
  const isSeparator = (line) => /^\s*\|[\s:|-]+\|\s*$/.test(line) && line.includes("-");

  const cells = (line) => line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

  // Мінімальний інлайн-markdown усередині клітинки: жирний, курсив, код.
  // Спершу екрануємо HTML — у клітинки регулярно потрапляє `<b>` з описів.
  const inline = (text) => text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  const buildTable = (lines) => {
    const table = document.createElement("table");
    table.setAttribute(MARK, "table");
    table.style.cssText = "border-collapse:collapse;margin:8px 0;width:100%;font-size:14px";

    const header = cells(lines[0]);
    const body = lines.slice(2).filter(isRow).map(cells);
    const border = "1px solid rgba(9,30,66,.16)";

    const thead = table.createTHead();
    const headRow = thead.insertRow();
    header.forEach((text) => {
      const th = document.createElement("th");
      th.innerHTML = inline(text);
      th.style.cssText = `border:${border};padding:6px 10px;text-align:left;background:rgba(9,30,66,.06);font-weight:600`;
      headRow.appendChild(th);
    });

    const tbody = table.createTBody();
    body.forEach((row) => {
      const tr = tbody.insertRow();
      // Рядок може мати менше клітинок за заголовок — добиваємо порожніми,
      // інакше рамка таблиці «розсипається».
      for (let i = 0; i < header.length; i += 1) {
        const td = tr.insertCell();
        td.innerHTML = inline(row[i] ?? "");
        td.style.cssText = `border:${border};padding:6px 10px;vertical-align:top`;
      }
    });

    return table;
  };

  // Опис Trello рендериться як набір блоків; рядки таблиці можуть лежати
  // і в одному <p> через <br>, і кожен своїм <p>. Обидва випадки зводимо
  // до списку рядків тексту.
  const blockLines = (node) => (node.innerText || "").split("\n").filter((l) => l.trim() !== "");

  // Trello (редактор Atlassian) віддає весь markdown-абзац ОДНИМ <p>,
  // де рядки розділені <br>. Тому таблицю шукаємо не між сусідніми
  // блоками, а всередині тексту одного вузла.
  const renderTables = (root) => {
    if (!root) return;

    root.querySelectorAll("p, div.ak-renderer-document > div").forEach((node) => {
      if (node.getAttribute(MARK)) return;
      if (node.closest("pre, code, table")) return;

      const lines = (node.innerText || "").split("\n");
      const start = lines.findIndex((line, i) =>
        isRow(line) && isSeparator(lines[i + 1] || ""));
      if (start === -1) return;

      let end = start + 2;
      while (end < lines.length && isRow(lines[end])) end += 1;

      const before = lines.slice(0, start).join("\n").trim();
      const after = lines.slice(end).join("\n").trim();

      const fragment = document.createDocumentFragment();
      if (before) fragment.appendChild(textBlock(before));
      fragment.appendChild(buildTable(lines.slice(start, end)));
      if (after) fragment.appendChild(textBlock(after));

      node.replaceWith(fragment);
    });
  };

  const textBlock = (text) => {
    const p = document.createElement("p");
    p.setAttribute(MARK, "text");
    p.innerHTML = text.split("\n").map(inline).join("<br>");
    return p;
  };

  // ── 4. Чеклісти `- [ ] / - [x]` ─────────────────────────────────────────
  // Trello рендерить «- текст» справжнім <li>, тож у розмітці лишається
  // сирий префікс «[ ]». Підміняємо його на позначку, сам пункт лишаємо
  // некликабельним: клік мав би дописувати «x» в опис через API, а це вже
  // не справа скрипта-переглядача.
  const TASK_PREFIX = /^\s*\[( |x|X)\]\s+/;

  const renderChecklists = (root) => {
    if (!root) return;

    root.querySelectorAll("li, p").forEach((node) => {
      if (node.getAttribute(MARK) === "task") return;
      if (node.closest("pre, code")) return;
      if (node.closest(`[${MARK}]`)) return;

      const text = node.textContent || "";
      const match = text.match(TASK_PREFIX);
      if (!match) return;

      const checked = match[1].toLowerCase() === "x";
      node.setAttribute(MARK, "task");
      if (node.tagName === "LI") node.style.listStyle = "none";

      const box = document.createElement("span");
      box.textContent = checked ? "☑" : "☐";
      box.style.cssText = [
        "display:inline-block", "width:1.1em", "margin-right:4px",
        "font-size:15px", "line-height:1",
        `color:${checked ? "#22a06b" : "#8590a2"}`
      ].join(";");

      // Прибираємо префікс лише з першого текстового вузла — решта розмітки
      // (жирний, посилання, код усередині пункту) лишається недоторканою.
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      const first = walker.nextNode();
      if (first) first.nodeValue = first.nodeValue.replace(TASK_PREFIX, "");

      node.insertBefore(box, node.firstChild);

      if (checked) {
        node.style.color = "#626f86";
        node.style.textDecoration = "line-through";
        node.style.textDecorationColor = "rgba(98,111,134,.5)";
      }
    });
  };

  // ── Цикл ────────────────────────────────────────────────────────────────
  // Trello перемальовує картку сам (і Strelloids поверх нього), тож замість
  // одноразового запуску слухаємо зміни й щоразу перевіряємо, чи вже зроблено.
  // ── 5. Номери карток на плитках дошки ───────────────────────────────────
  // Номер уже є в href плитки (/c/<shortLink>/<НОМЕР>-<slug>), тож ні API,
  // ні здогадок не потрібно. Малюємо накладенням: absolute + pointer-events
  // none, щоб не зсувати текст назви й не роздувати плитку.
  const renderTileNumbers = () => {
    document.querySelectorAll('a[data-testid="card-name"]').forEach((tile) => {
      if (tile.querySelector(`[${MARK}="tile-number"]`)) return;

      const match = (tile.getAttribute("href") || "").match(/^\/c\/[^/]+\/(\d+)/);
      if (!match) return;

      if (getComputedStyle(tile).position === "static") tile.style.position = "relative";

      const tag = document.createElement("span");
      tag.setAttribute(MARK, "tile-number");
      tag.textContent = match[1];
      tag.style.cssText = [
        "position:absolute", "top:2px", "right:4px", "z-index:1",
        "font-size:11px", "line-height:14px", "font-weight:700",
        "letter-spacing:.02em", "pointer-events:none",
        "color:rgba(9,30,66,.38)",
        // обведення світлом: номер лягає поверх тексту назви, і без нього
        // на довгих заголовках цифри зливаються з літерами
        "text-shadow:0 0 3px rgba(255,255,255,.9),0 0 3px rgba(255,255,255,.9)"
      ].join(";");

      tile.appendChild(tag);
    });
  };

  const apply = () => {
    const title = cardBackTitle();
    if (!title) return;

    const number = cardNumber();
    if (number) renderNumber(title, number);

    const text = title.value || title.textContent || "";
    const parsed = parseTitle(text);
    renderBadges(title, parsed);
    renderToolbarBadges({ number, ...parsed });

    const description = descriptionRoot();
    renderTables(description);
    renderChecklists(description);
    renderTileNumbers();
  };

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      try { apply(); } catch (error) { console.warn("[card-extras]", error); }
    });
  };

  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  window.addEventListener("popstate", schedule);
  schedule();
})();
