// ==UserScript==
// @name         Trello Card Extras — таблиці, номер картки, пріоритет
// @namespace    https://github.com/alex-petr/userscripts
// @version      1.1.0
// @author       Oleksandr Petrov
// @description  Markdown-таблиці й чеклісти в описі, номер картки біля назви, полоска пріоритету !N і бейдж Scrum Points у відкритій картці
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
    '[data-testid="card-back-description"]',
    ".js-desc-content",
    ".description-content"
  );

  // ── 1. Номер картки ─────────────────────────────────────────────────────
  // Береться з URL (/c/<shortLink>/<НОМЕР>-<slug>), а не з DOM Trello —
  // тому не залежить від того, чи встиг відмалюватись інший розширювач.
  const cardNumber = () => {
    const match = location.pathname.match(/^\/c\/[^/]+\/(\d+)/);
    return match ? match[1] : null;
  };

  const renderNumber = (titleNode, number) => {
    const host = titleNode.parentElement;
    if (!host || host.querySelector(`[${MARK}="number"]`)) return;

    const chip = document.createElement("span");
    chip.setAttribute(MARK, "number");
    chip.textContent = `#${number}`;
    chip.style.cssText = [
      "display:inline-block", "margin-right:8px", "padding:1px 7px",
      "border-radius:4px", "font-weight:700", "font-size:13px",
      "line-height:20px", "vertical-align:middle",
      "background:rgba(9,30,66,.08)", "color:#44546f"
    ].join(";");
    host.insertBefore(chip, titleNode);
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
      const stripe = document.createElement("span");
      stripe.title = `Пріоритет ${priority} — ${label}`;
      stripe.style.cssText = [
        "display:inline-block", "width:46px", "height:8px",
        "border-radius:4px", `background:${color}`
      ].join(";");
      box.appendChild(stripe);
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

  const renderTables = (root) => {
    if (!root) return;

    const blocks = Array.from(root.children).filter((node) => {
      // Код і цитати не чіпаємо: саме на цьому ламались готові розширення.
      if (node.matches("pre, code, blockquote, table")) return false;
      if (node.closest("pre, code")) return false;
      return true;
    });

    let index = 0;
    while (index < blocks.length) {
      const lines = blockLines(blocks[index]);
      const isTableStart = lines.length >= 2 && isRow(lines[0]) && isSeparator(lines[1]);

      if (!isTableStart) {
        // Випадок «кожен рядок окремим блоком»: збираємо підряд ті, що схожі на рядки.
        const run = [];
        let cursor = index;
        while (cursor < blocks.length) {
          const chunk = blockLines(blocks[cursor]);
          if (!chunk.length || !chunk.every(isRow)) break;
          run.push(blocks[cursor]);
          cursor += 1;
        }
        const runLines = run.flatMap(blockLines);
        if (run.length && runLines.length >= 2 && isSeparator(runLines[1])) {
          run[0].replaceWith(buildTable(runLines));
          run.slice(1).forEach((node) => node.remove());
          index = cursor;
          continue;
        }
        index += 1;
        continue;
      }

      blocks[index].replaceWith(buildTable(lines));
      index += 1;
    }
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
  const apply = () => {
    const title = cardBackTitle();
    if (!title) return;

    const number = cardNumber();
    if (number) renderNumber(title, number);

    const text = title.value || title.textContent || "";
    renderBadges(title, parseTitle(text));

    const description = cardBackDescription();
    renderTables(description);
    renderChecklists(description);
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
