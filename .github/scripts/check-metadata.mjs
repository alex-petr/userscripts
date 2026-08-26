// Перевіряє шапку ==UserScript==: без обов'язкових директив менеджер або не
// поставить скрипт, або поставить без автооновлення — а це та сама біда, через
// яку версія в браузері місяцями розходиться з версією в репозиторії.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const REQUIRED = ["@name", "@namespace", "@version", "@description", "@match", "@grant"];
const SEMVER = /^\d+\.\d+\.\d+$/;

const walk = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    // legacy/ — історичні артефакти «як було». Їх перевіряємо лише на
    // синтаксис: вимагати від скрипта 2020 року semver і сучасну шапку
    // означало б переписати історію, заради якої його й збережено.
    if (entry === "node_modules" || entry === ".git" || entry === "legacy") return [];
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : path.endsWith(".user.js") ? [path] : [];
  });

let failed = false;

for (const file of walk(".")) {
  const source = readFileSync(file, "utf8");
  const block = source.match(/\/\/ ==UserScript==([\s\S]*?)\/\/ ==\/UserScript==/);
  const problems = [];

  if (!block) {
    problems.push("немає блоку ==UserScript==");
  } else {
    for (const key of REQUIRED) {
      if (!new RegExp(`^// ${key}\\s+\\S`, "m").test(block[1])) problems.push(`бракує ${key}`);
    }

    const version = block[1].match(/^\/\/ @version\s+(\S+)/m)?.[1];
    if (version && !SEMVER.test(version)) problems.push(`@version «${version}» не semver`);

    // Версія в шапці керує автооновленням, а константа — тим, що скрипт
    // повідомляє про себе на сторінці. Розбіжність = діагностика бреше.
    const inCode = source.match(/const VERSION = "(\S+)"/)?.[1];
    if (inCode && version && inCode !== version) {
      problems.push(`@version ${version} ≠ const VERSION ${inCode}`);
    }
  }

  if (problems.length) {
    failed = true;
    console.error(`✗ ${file}`);
    for (const problem of problems) console.error(`    ${problem}`);
  } else {
    console.log(`✓ ${file}`);
  }
}

process.exit(failed ? 1 : 0);
