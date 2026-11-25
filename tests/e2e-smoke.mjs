import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import process from "node:process";
let puppeteer;
try {
  ({ default: puppeteer } = await import("puppeteer-core"));
} catch {
  console.log("SKIP e2e: puppeteer-core not installed (optional)");
  process.exit(0);
}

const chrome = process.env.CHROME_PATH || "/usr/bin/google-chrome";
if (!existsSync(chrome)) {
  console.log(`SKIP e2e: Chrome not found at ${chrome}`);
  process.exit(0);
}

const port = 8769 + Math.floor(Math.random() * 100);
const server = spawn("python3", ["serve.py", "--no-browser", "--port", String(port)], {
  cwd: new URL("../webapp", import.meta.url),
  stdio: "ignore",
});
const work = mkdtempSync(join(tmpdir(), "molviewer-e2e-"));
const sdf = readFileSync(new URL("./fixtures/ligand.sdf", import.meta.url));
const sdfPath = join(work, "ligand.sdf");
const gzPath = join(work, "ligand.sdf.gz");
const xyzPath = join(work, "water.xyz");
const mol2Path = join(work, "ethanol.mol2");
const xlsxPath = join(work, "drugs.xlsx");
writeFileSync(sdfPath, sdf);
writeFileSync(gzPath, gzipSync(sdf));
writeFileSync(xyzPath, "3\nwater\nO 0 0 0\nH 0.96 0 0\nH -0.24 0.93 0\n");
writeFileSync(mol2Path, "@<TRIPOS>MOLECULE\nethanol\n3 2 0 0 0\nSMALL\nNO_CHARGES\n@<TRIPOS>ATOM\n1 C1 0 0 0 C.3\n2 C2 1.5 0 0 C.3\n3 O1 2 1 0 O.3\n@<TRIPOS>BOND\n1 1 2 1\n2 2 3 1\n");
writeFileSync(xlsxPath, readFileSync(new URL("./fixtures/drugs.xlsx", import.meta.url)));

let browser;
try {
  await new Promise((resolve) => setTimeout(resolve, 700));
  browser = await puppeteer.launch({
    executablePath: chrome,
    headless: "new",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader"],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("404")) errors.push(message.text());
  });
  await page.setViewport({ width: 1400, height: 900 });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
  await page.waitForFunction("window.__molviewer !== undefined", { timeout: 60000 });

  const input = await page.$("#file");
  await input.uploadFile(sdfPath);
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const firstEntry = await page.evaluate(() => window.__molviewer.entries()[0]);
  if (!firstEntry || firstEntry.meta.atoms !== 12) throw new Error(`SDF atom count wrong: ${JSON.stringify(firstEntry?.meta)}`);
  if (Math.abs(firstEntry.meta.molecularWeight - 165.2) > 0.5) throw new Error(`SDF molecular weight wrong: ${firstEntry.meta.molecularWeight}`);

  await input.uploadFile(gzPath);
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const second = await page.evaluate(() => window.__molviewer.entries().length);
  if (second !== 2) throw new Error(`gzip import expected 2 entries, got ${second}`);

  await input.uploadFile(xyzPath);
  await new Promise((resolve) => setTimeout(resolve, 800));
  await input.uploadFile(mol2Path);
  await new Promise((resolve) => setTimeout(resolve, 800));
  const formats = await page.evaluate(() => window.__molviewer.entries().map((entry) => ({ format: entry.format, atoms: entry.meta.atoms })));
  if (!formats.some((entry) => entry.format === "XYZ" && entry.atoms === 3)) throw new Error(`XYZ import failed: ${JSON.stringify(formats)}`);
  if (!formats.some((entry) => entry.format === "MOL2" && entry.atoms === 3)) throw new Error(`MOL2 import failed: ${JSON.stringify(formats)}`);

  await input.uploadFile(xlsxPath);
  await page.waitForFunction("!document.getElementById('csvModal').hidden", { timeout: 10000 });
  await page.click("#csvImport");
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const afterXlsx = await page.evaluate(() => window.__molviewer.entries().length);
  if (afterXlsx < 4) throw new Error(`XLSX import expected more entries, got ${afterXlsx}`);

  await page.click('[data-view="2d"]');
  await new Promise((resolve) => setTimeout(resolve, 3000));
  const svgLength = await page.$eval("#rdkitSvg", (element) => element.innerHTML.length);
  if (svgLength < 1000) throw new Error("2D depiction did not render");

  await page.click("#outlineToggle");
  await new Promise((resolve) => setTimeout(resolve, 500));
  await page.click("#lang");
  await new Promise((resolve) => setTimeout(resolve, 500));
  const chinese = await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const found = [];
    let node;
    while ((node = walker.nextNode())) {
      const text = node.textContent.trim();
      if (/[\u4e00-\u9fff]/.test(text) && text !== "中文" && node.parentElement?.offsetParent !== null) found.push(text);
    }
    return [...new Set(found)];
  });
  if (chinese.length) throw new Error(`Untranslated UI: ${chinese.join(" | ")}`);
  if (errors.length) throw new Error(`Page errors: ${errors.join(" | ")}`);
  console.log("e2e smoke passed");
} finally {
  await browser?.close();
  server.kill();
}
