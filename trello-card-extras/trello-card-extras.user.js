// ==UserScript==
// @name         Trello Card Extras — таблиці, номер картки, пріоритет
// @namespace    https://github.com/alex-petr/userscripts
// @version      1.20.0
// @author       Oleksandr Petrov
// @description  Markdown-таблиці й чеклісти в описі, номер картки в панелі картки та на плитках дошки, пріоритет !N із підписом і Scrum Points
// @match        https://trello.com/*
// @run-at       document-idle
// @grant        none
// @homepageURL  https://github.com/alex-petr/userscripts
// @downloadURL  https://raw.githubusercontent.com/alex-petr/userscripts/main/trello-card-extras/trello-card-extras.user.js
// @updateURL    https://raw.githubusercontent.com/alex-petr/userscripts/main/trello-card-extras/trello-card-extras.user.js
// ==/UserScript==

(() => {
  "use strict";

  const VERSION = "1.20.0";

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
        // Панель уже намальована — без номера, бо на момент рендера URL його
        // не містив. renderToolbarBadges виходить одразу, якщо позначки вже
        // є, тож прибираємо їх, аби вони перезібрались із номером.
        document.querySelectorAll(`[${MARK}="toolbar"]`).forEach((node) => node.remove());
        apply();
      })
      .catch(() => {});

    return null;
  };

  // ── 2. Пріоритет !N і Scrum Points (N) ──────────────────────────────────
  const parseTitle = (text) => ({
    priority: (text.match(/!([1-5])\b/) || [])[1],
    points: (text.match(/\((\d+(?:[.,]\d+)?)\)/) || [])[1]
  });

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
    // Версія в підказці: щоб побачити, ЯКА збірка працює, достатньо навести
    // мишу на позначки — без консолі й здогадок.
    box.title = `Trello Card Extras v${VERSION}`;
    box.style.cssText = "display:inline-flex;align-items:center;gap:6px;flex:none";

    if (number) {
      const tag = document.createElement("span");
      tag.textContent = `#${number}`;
      tag.style.cssText = [
        "font-size:14px", "line-height:22px", "font-weight:700",
        "padding:0 9px", "border-radius:11px",
        "background:var(--ds-background-neutral-bold,#44546f)",
        "color:var(--ds-text-inverse,#fff)",
        "box-shadow:0 0 0 1px rgba(9,30,66,.35)"
      ].join(";");
      box.appendChild(tag);
    }

    if (priority) {
      const { color, label } = PRIORITY[priority];
      const chip = document.createElement("span");
      chip.title = `Пріоритет !${priority}`;
      chip.textContent = label;
      chip.style.cssText = [
        "font-size:14px", "line-height:22px", "font-weight:700",
        "padding:0 9px", "border-radius:11px", `background:${color}`,
        // на жовтому й салатовому білий текст не читається
        `color:${priority === 3 || priority === 4 ? "#172b4d" : "#fff"}`,
        // обводка: на світлій обкладинці дошки заливка інакше зливається з фоном
        "box-shadow:0 0 0 1px rgba(9,30,66,.35)"
      ].join(";");
      box.appendChild(chip);
    }

    if (points) {
      const pill = document.createElement("span");
      pill.title = "Story points";
      pill.textContent = `⏱ ${points}`;
      pill.style.cssText = [
        "font-size:14px", "line-height:22px", "font-weight:600",
        "padding:0 9px", "border-radius:11px",
        "background:var(--ds-background-neutral-bold,#44546f)",
        "color:var(--ds-text-inverse,#fff)",
        "box-shadow:0 0 0 1px rgba(9,30,66,.35)"
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
    // Кольори — токенами Atlassian: вони самі перемикаються зі світлої теми
    // на темну. На жорсткому rgba(9,30,66,…) рамки в темній зникали зовсім.
    const border = "1px solid var(--ds-border-bold,#7d818a)";

    const thead = table.createTHead();
    const headRow = thead.insertRow();
    header.forEach((text) => {
      const th = document.createElement("th");
      th.innerHTML = inline(text);
      th.style.cssText = `border:${border};padding:6px 10px;text-align:left;background:var(--ds-background-neutral,rgba(9,30,66,.06));font-weight:600`;
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

      // Оригінальний вузол НЕ видаляємо — лише ховаємо. Редактор Atlassian
      // піднімає вміст із DOM, тож підміна абзацу таблицею псувала джерело
      // при переході в режим редагування. Ховання оборотне за один крок.
      const table = buildTable(lines.slice(start, end));
      table.setAttribute(MARK, "table");
      table.setAttribute("contenteditable", "false");

      const before = lines.slice(0, start).join("\n").trim();
      const after = lines.slice(end).join("\n").trim();
      const wrap = document.createElement("div");
      wrap.setAttribute(MARK, "table-wrap");
      wrap.setAttribute("contenteditable", "false");
      if (before) wrap.appendChild(textBlock(before));
      wrap.appendChild(table);
      if (after) wrap.appendChild(textBlock(after));

      node.setAttribute(MARK, "hidden-source");
      node.dataset.cardExtrasDisplay = node.style.display || "";
      node.style.display = "none";
      node.after(wrap);
    });
  };

  const textBlock = (text) => {
    const p = document.createElement("p");
    p.setAttribute(MARK, "text");
    p.innerHTML = text.split("\n").map(inline).join("<br>");
    return p;
  };

  // Маркер списку малюється або ::marker, або ::before — інлайновим style
  // до них не дістатись, тож кладемо правила окремим <style> один раз.
  const ensureStyles = () => {
    if (document.getElementById("card-extras-style")) return;

    const style = document.createElement("style");
    style.id = "card-extras-style";
    // Версія в DOM: єдиний спосіб з консолі перевірити, ЯКА саме збірка
    // зараз виконується — Tampermonkey цього не показує сторінці.
    style.dataset.version = VERSION;
    style.textContent = `
      /* Відступ під маркери в чеклісті не потрібен — маркерів там немає.
         Знімаємо його ЛИШЕ у списків із нашими пунктами: у звичайних
         марковані крапки без відступу вилізли б за край. */
      [${MARK}="task-list"] {
        padding-left: 4px !important;
        padding-inline-start: 4px !important;
        margin-left: 0 !important;
      }
      li[${MARK}="task"] { list-style: none !important; }
      li[${MARK}="task"]::marker { content: "" !important; }
      li[${MARK}="task"]::before { content: none !important; }
      /* Шапки списків: назва в один рядок, лічильник і «…» праворуч.
         Trello ставить header flex-wrap:wrap, і довга назва («🔍 Code Review /
         🧪 QA / 🚀») переносила лічильник із меню на другий рядок, роздуваючи
         шапку з 40 до 72px. Обрізаємо назву трикрапкою, повний текст —
         у title при наведенні. */
      [data-testid="list-header"] { flex-wrap: nowrap !important; }
      [data-testid="list-header"] > div:has([data-testid="list-name"]) {
        flex: 1 1 auto;
        min-width: 0;
      }
      [data-testid="list-header"] [data-testid="list-name"],
      [data-testid="list-header"] [data-testid="list-name"] button,
      [data-testid="list-header"] [data-testid="list-name"] button > span {
        display: block;
        max-width: 100%;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
      }
      [data-testid="list-header"] [data-testid="list-name-textarea"] {
        white-space: nowrap !important;
        overflow: hidden !important;
      }
      input[${MARK}="task-box"] {
        margin: 0 6px 0 0;
        vertical-align: -1px;
        accent-color: var(--ds-background-success-bold, #22a06b);
        cursor: default;
      }
    `;
    document.head.appendChild(style);
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
      try {
        renderChecklistItem(node);
      } catch (error) {
        console.warn("[card-extras] пункт чекліста", error);
      }
    });
  };

  const renderChecklistItem = (node) => {
    {
      if (node.getAttribute(MARK) === "task") return;
      if (node.closest("pre, code")) return;
      if (node.closest(`[${MARK}]`)) return;

      const text = node.textContent || "";
      const match = text.match(TASK_PREFIX);
      if (!match) return;

      const checked = match[1].toLowerCase() === "x";
      node.setAttribute(MARK, "task");
      if (node.tagName === "LI") {
        node.style.listStyle = "none";
        // Позначка на самому списку — щоб CSS зняв відступ саме тут, а не
        // в усіх ul опису. Через атрибут, а не :has(), бо так відкат
        // лишається таким же простим, як і решта наших змін.
        node.parentElement?.setAttribute(MARK, "task-list");
      }

      // Як у GitHub: справжній вимкнений <input>, а не гліф. Дає рідний
      // вигляд у обох темах, коректний відступ і читається скрінрідером.
      const box = document.createElement("input");
      box.type = "checkbox";
      box.disabled = true;
      box.checked = checked;
      box.setAttribute(MARK, "task-box");
      box.setAttribute("contenteditable", "false");
      box.setAttribute("aria-label", checked ? "Виконано" : "Не виконано");

      // Префікс «[ ] » НЕ вирізаємо з тексту: редактор піднімає вміст із DOM,
      // і видалений префікс зникав би з опису при першому ж редагуванні.
      // Замість цього ховаємо його в окремий span — відкат за один крок.
      // Шукаємо саме ТОЙ текстовий вузол, що починається з «[ ]», а не
      // просто перший: Atlassian розбиває текст пункту на кілька вузлів, і
      // сліпе взяття першого давало null.match → виняток, який обривав
      // forEach — оброблявся лише перший пункт списку.
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      let prefixNode = null;
      let candidate = null;
      while ((candidate = walker.nextNode())) {
        if (TASK_PREFIX.test(candidate.nodeValue)) { prefixNode = candidate; break; }
      }
      if (!prefixNode) return;

      const raw = prefixNode.nodeValue.match(TASK_PREFIX)[0];
      prefixNode.splitText(raw.length);
      const hidden = document.createElement("span");
      hidden.setAttribute(MARK, "raw-prefix");
      hidden.style.display = "none";
      prefixNode.replaceWith(hidden);
      hidden.appendChild(prefixNode);

      // Усередині <li> Atlassian-рендерер тримає <p> — блок. Якщо покласти
      // позначку перед ним, вона стане окремим рядком, тож ставимо її
      // ПЕРШИМ ЕЛЕМЕНТОМ саме того абзацу.
      const inlineHost = node.firstElementChild
        && getComputedStyle(node.firstElementChild).display === "block"
        ? node.firstElementChild
        : node;
      inlineHost.insertBefore(box, inlineHost.firstChild);
      // Пробіл окремим вузлом: без нього текст злипається з чекбоксом при
      // копіюванні («☑This»), навіть якщо візуально відступ є.
      box.after(document.createTextNode(" "));

      if (checked) {
        node.style.color = "var(--ds-text-subtlest,#626f86)";
        node.style.textDecoration = "line-through";
        node.style.textDecorationColor = "currentColor";
      }
    }
  };

  // ── Цикл ────────────────────────────────────────────────────────────────
  // Trello перемальовує картку сам (і Strelloids поверх нього), тож замість
  // одноразового запуску слухаємо зміни й щоразу перевіряємо, чи вже зроблено.
  // ── 5. Номери карток на плитках дошки ───────────────────────────────────
  // Номер уже є в href плитки (/c/<shortLink>/<НОМЕР>-<slug>), тож ні API,
  // ні здогадок не потрібно.
  //
  // Місце — правий НИЖНІЙ кут плитки, у рівень із бейджами. Угорі стояти
  // не може: там перший рядок назви, і на довгих заголовках номер лягав
  // просто на текст. Малюємо накладенням (absolute + pointer-events:none),
  // щоб не зсувати вміст і не робити плитку вищою.
  const renderTileNumbers = () => {
    document.querySelectorAll('li[data-testid="list-card"]').forEach((tile) => {
      if (tile.querySelector(`[${MARK}="tile-number"]`)) return;

      const link = tile.querySelector('a[data-testid="card-name"]');
      const match = (link?.getAttribute("href") || "").match(/^\/c\/[^/]+\/(\d+)/);
      if (!match) return;

      if (getComputedStyle(tile).position === "static") tile.style.position = "relative";

      // Якщо в правому нижньому куті сидить аватарка виконавця —
      // відсуваємо номер ліворуч від неї, а не поверх.
      const box = tile.getBoundingClientRect();
      const avatar = [...tile.querySelectorAll('img, [role="img"], [data-testid*="member"]')].find((node) => {
        const rect = node.getBoundingClientRect();
        return box.right - rect.right < 16 && box.bottom - rect.bottom < 40 && rect.width > 12;
      });

      const tag = document.createElement("span");
      tag.setAttribute(MARK, "tile-number");
      tag.textContent = match[1];
      tag.style.cssText = [
        "position:absolute", "bottom:6px", `right:${avatar ? 42 : 8}px`, "z-index:1",
        "font-size:11px", "line-height:14px", "font-weight:700",
        "letter-spacing:.02em", "pointer-events:none",
        "color:var(--ds-text-subtle,rgba(9,30,66,.45))",
        "text-shadow:0 0 3px var(--ds-surface,#fff),0 0 3px var(--ds-surface,#fff)"
      ].join(";");

      tile.appendChild(tag);
    });
  };

  // Повна назва списку — у title, бо видима частина тепер обрізана
  const renderListTitles = () => {
    document.querySelectorAll('[data-testid="list-name"]').forEach((node) => {
      const text = (node.textContent || "").trim();
      if (text && node.title !== text) node.title = text;
    });
  };

  // ── Відкат: повертаємо опис до вихідного стану ──────────────────────────
  // Викликається перед будь-яким редагуванням. Усі наші зміни оборотні:
  // оригінальні вузли лише сховані, префікси загорнуті, вставлене — наше.
  const cleanupDescription = () => {
    document.querySelectorAll(`[${MARK}="table-wrap"]`).forEach((node) => node.remove());

    document.querySelectorAll(`[${MARK}="hidden-source"]`).forEach((node) => {
      node.style.display = node.dataset.cardExtrasDisplay || "";
      delete node.dataset.cardExtrasDisplay;
      node.removeAttribute(MARK);
    });

    document.querySelectorAll(`input[${MARK}="task-box"]`).forEach((node) => {
      // разом із чекбоксом прибираємо доданий пробіл
      const next = node.nextSibling;
      if (next && next.nodeType === Node.TEXT_NODE && next.nodeValue === " ") next.remove();
      node.remove();
    });

    document.querySelectorAll(`[${MARK}="raw-prefix"]`).forEach((node) => {
      node.replaceWith(...node.childNodes);
    });

    document.querySelectorAll(`[${MARK}="task-list"]`).forEach((node) => node.removeAttribute(MARK));

    document.querySelectorAll(`[${MARK}="task"]`).forEach((node) => {
      node.style.listStyle = "";
      node.style.color = "";
      node.style.textDecoration = "";
      node.removeAttribute(MARK);
    });
  };

  // Редактор опису відкритий: рендерити не можна, і все наше має зникнути
  const descriptionEditing = () => Boolean(
    document.querySelector('[data-testid="description-editor"]')
      || document.querySelector('[data-testid="description-content-area"] [contenteditable="true"]')
      || document.querySelector(".ak-editor-content-area")
  );

  const apply = () => {
    ensureStyles();

    // Плитки дошки — незалежно від того, чи відкрита картка: раніше цей
    // виклик стояв після `return` для закритої картки, тож у списку номери
    // не малювались узагалі.
    renderTileNumbers();
    renderListTitles();

    const title = cardBackTitle();
    if (!title) return;

    const text = title.value || title.textContent || "";
    renderToolbarBadges({ number: cardNumber(), ...parseTitle(text) });

    // Поки опис редагують — нічого не малюємо й прибираємо своє: інакше
    // редактор підніме з DOM наші вставки замість вихідного тексту.
    if (descriptionEditing()) {
      cleanupDescription();
      return;
    }

    const description = descriptionRoot();
    renderTables(description);
    renderChecklists(description);
  };

  // Планувальник навмисно має ДВА тригери. requestAnimationFrame у фоновій
  // вкладці не викликається взагалі — прапорець `scheduled` лишався б
  // піднятим назавжди, і скрипт замовкав до повернення фокуса. Саме тому
  // номери на плитках то з'являлись, то ні. `run` ідемпотентний: він
  // працює лише поки прапорець піднятий, тож подвійний виклик безпечний.
  let scheduled = false;

  const run = () => {
    if (!scheduled) return;
    scheduled = false;
    try { apply(); } catch (error) { console.warn("[card-extras]", error); }
  };

  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(run);
    setTimeout(run, 200);
  };

  // «Доводка» після сплеску змін — прийом із Trello Card Numbers Plus:
  // React домальовує плитки кількома хвилями, і одного проходу по мутації
  // мало. Ганяємо рендер кожні 150 мс протягом 2 с після останньої події,
  // потім замовкаємо. Рендери ідемпотентні, тож зайві проходи безкоштовні.
  let settleTimer = null;
  let settleStop = null;

  const settle = () => {
    if (!settleTimer) settleTimer = setInterval(run2, 150);
    clearTimeout(settleStop);
    settleStop = setTimeout(() => {
      clearInterval(settleTimer);
      settleTimer = null;
    }, 2000);
  };

  const run2 = () => {
    try { apply(); } catch (error) { console.warn("[card-extras]", error); }
  };

  // Спостерігати треба за <html>, а не за <body>: Trello — SPA, і при
  // переходах вона перемонтовує кореневий контейнер. Підписка на body
  // після цього висить на вузлі, якого вже немає в документі, тож apply()
  // більше не викликається — саме тому номери на плитках дошки не
  // з'являлись, хоча сама функція працює.
  new MutationObserver(() => { schedule(); settle(); }).observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  // Клік по опису відкриває редактор — відкочуємо СИНХРОННО у фазі
  // перехоплення, до того як Trello встигне прочитати DOM.
  document.addEventListener("pointerdown", (event) => {
    const area = document.querySelector('[data-testid="description-content-area"]');
    if (area && event.target instanceof Node && area.contains(event.target)) cleanupDescription();
  }, true);

  window.addEventListener("popstate", schedule);
  window.addEventListener("hashchange", schedule);

  // Страховка на випадок, якщо перемальовування пройде повз спостерігача:
  // усі рендери ідемпотентні й виходять одразу, якщо працювати нема над чим,
  // тож секундний інтервал коштує майже нічого.
  setInterval(schedule, 1000);

  schedule();
})();
