# userscripts

Userscripts for **Tampermonkey / Violentmonkey** — small quality-of-life tweaks
for sites I use every day. Code comments and UI strings are in Ukrainian;
this README is bilingual.

Скрипти для **Tampermonkey / Violentmonkey** — дрібні покращення сайтів, якими
користуюсь щодня. Коментарі в коді українською.

---

## Scripts / Скрипти

### [lostfilm-torrent-autopick](lostfilm-torrent-autopick/)

Picks the highest available quality on the torrent selection page and follows
the link, so the extra click disappears.

Обирає найвищу доступну якість на сторінці вибору роздачі й переходить за
посиланням — зайвий клік зникає.

---

## Install / Встановлення

Open the `.user.js` file in **Raw** view — the manager will offer to install it.
`@downloadURL` is set, so updates arrive automatically.

Відкрити `.user.js` у режимі **Raw** — менеджер запропонує встановити.
`@downloadURL` прописаний, тож оновлення приходять самі.

---

## Conventions / Домовленості

- **Semver in two places.** `@version` in the metadata block drives auto-update;
  `const VERSION` is what the script reports about itself in the page. CI fails
  if they disagree — a mismatch means diagnostics lie about which build is running.
- **Non-destructive DOM.** Scripts never delete or rewrite site content: the
  original node is hidden and the rendered one goes next to it, so everything is
  reversible before the site's own editor touches the DOM.
- **`legacy/`** keeps historical versions as they were. Syntax-checked only.

- **Semver у двох місцях.** `@version` у шапці керує автооновленням, `const VERSION` —
  тим, що скрипт повідомляє про себе на сторінці. CI падає, якщо вони розійшлись:
  розбіжність означає, що діагностика бреше про робочу збірку.
- **Нічого не руйнуємо в DOM.** Скрипти не видаляють і не переписують вміст сайту:
  оригінальний вузол ховається, свій кладеться поруч — усе оборотно до того, як
  до DOM дійде власний редактор сайту.
- **`legacy/`** зберігає історичні версії як були. Перевіряються лише на синтаксис.

## License

MIT © Oleksandr Petrov
